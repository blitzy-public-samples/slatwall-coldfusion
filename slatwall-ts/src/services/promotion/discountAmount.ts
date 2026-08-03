// ---------------------------------------------------------------------------
// slatwall-ts - Promotion discount-amount calculation
//
// PORTED FROM: `private numeric function getDiscountAmount(required any reward, required numeric
// price, required numeric quantity)` [model/service/PromotionService.cfc:L987-L1018], as a 1:1
// logic extraction. Thirty-two lines of CFML, and the arithmetic core of MUST-PRESERVE AREA #1 -
// promotion discount math together with use-limit enforcement (AAP 0.8.1). Every discount this
// platform grants is computed here, so nothing in this file may be tidied on aesthetic grounds.
//
// This module is a leaf: it imports no sibling and never imports the facade back, so it closes no
// cycle. Its five legacy call sites are tabulated on the method itself.
//
// READ THIS BEFORE READING THE CODE: THE ROUNDING IS AN INVERTED DELTA.
// [model/service/PromotionService.cfc:L1005-L1007] DOES NOT ROUND THE DISCOUNT.
//
//   1. `originalAmount - discountAmountPreRounding` is the NET PRICE the customer
//      would pay once the discount is taken off.
//   2. It is that NET PRICE which is handed to the rounding rule at [L1006], so the
//      rule targets a resulting PRICE POINT - `$x.99`, say.
//   3. The discount is then DERIVED BACKWARDS at [L1007] as
//      `originalAmount - roundedFinalAmount`: whatever delta lands the customer on
//      that price point.
//
// An implementation that "rounds the discount amount" is COMPLETELY WRONG and pays out different
// money.
//
// TWO TRANSLATION HABITS APPLY THROUGHOUT, STATED ONCE HERE. (1) EVERY MONETARY OPERATION GOES
// THROUGH `Money`, which is implemented over `src/lib/cfml/precision.ts` - `times`, `dividedBy` and
// `minus` delegate to its `multiply`, `divide` and `subtract` - so no JavaScript arithmetic
// operator touches a monetary operand anywhere in this file, and the per-site `precisionEvaluate`
// notes below record only the legacy expression's own composition order. (2) NULLABLE ENTITY READS
// ARE NARROWED, NEVER ASSERTED: `isAbsent` is the single narrowing gate, and `!` is an error across
// `src/**`.
//
// THE DEFECT REGISTER ENTRIES THIS FILE OWNS: 12, 13 and 14.
//   * 12 [L998]  the `amountOff` branch escapes arbitrary-precision arithmetic.
//                DELIBERATE DIVERGENCE (b) - closed here. Annotated at the site.
//   * 13 [L1007, L1009, L1014]  `discountAmount` is never `var`'d and leaks into
//                CFML component scope. DELIBERATE DIVERGENCE (a) - made
//                function-local here. Annotated at the declaration.
//   * 14 [L1013-L1015]  the clamp gates on one variable and assigns another.
//                PRESERVED EXACTLY. Annotated at the site, in both directions.
//
// EXACTLY TWO DELIBERATE DIVERGENCES LIVE IN THIS FILE, AND THE BUDGET IS NOW SPENT. (a) and (b)
// above are both of the two available to this folder; the project's third is spent in
// `src/domain/entities/product.ts` on register entry 19's poisoned memo. Register entry 14 and the
// absent `default:` case are PRESERVED, not diverged.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L990, L995, L1001, L1006, L1007]: the
// `precisionEvaluate` census for the in-scope slice is NINE sites, not the eight the plan cites -
// L150, L252, L299, L486, L990, L995, L1001, L1006 and L1007, verified against source. FIVE are
// inside this one function. The omitted citation is L1006, the
//   `originalAmount - discountAmountPreRounding`
// that produces the net price, and it is the semantically most important of the nine. Where the
// plan and the source disagree the SOURCE WINS.
// ---------------------------------------------------------------------------

import type { AmountType, PromotionReward } from '../../domain/entities/promotionReward.js';
import type { RoundingRule } from '../../domain/entities/roundingRule.js';
import { Money } from '../../domain/valueObjects/money.js';
import type { DecimalString } from '../../lib/cfml/numberFormat.js';
import { numberFormat } from '../../lib/cfml/numberFormat.js';
import { cfEquals } from '../../lib/cfml/struct.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
import type { RoundingRuleService } from '../roundingRuleService.js';

// ---------------------------------------------------------------------------
// JUDGMENT CALL: `src/lib/cfml/precision.ts` is NOT imported, even though it is a
// permitted dependency of this module and every `precisionEvaluate` site in the ported
// function is an arbitrary-precision operation.
//
// The choice made: all five of them are expressed through `Money`, which is itself
// implemented over `precision.ts` - `Money.times`, `Money.dividedBy` and `Money.minus`
// each delegate to that module's `multiply`, `divide` and `subtract`. So the arithmetic
// IS computed through `precision.ts`; it simply reaches it through the value object that
// AAP 0.3.3 makes the sole arithmetic surface in the target.
//
// The alternatives rejected, and why:
//   * IMPORT `precision.ts` DIRECTLY AND CALL `multiply`/`divide`/`subtract`. Rejected
//     because it bypasses `Money` on a money path, which is precisely what E4 forbids,
//     and because those functions return the substrate's decimal type. Naming that type
//     here would leak the decimal substrate into a service module, and `Money` cannot be
//     reconstructed from it - `Money.fromDecimalString` is the only construction path
//     and it takes a decimal string. The round trip would add two conversions and one
//     leaked type in exchange for nothing.
//   * IMPORT IT AND LEAVE IT UNUSED so the declared dependency is visible. Rejected: an
//     unused import is a lint error under `no-unused-vars` (`vars: 'all'`), and an import
//     that exists to look tidy is worse than an accurate absence.
//   * IMPORT `decimal.js`. Forbidden outright. The substrate is reachable only from
//     `money.ts` and `src/lib/cfml/{precision,numberFormat}.ts`. This module needs none
//     of the thirteen pinned packages directly.
// ---------------------------------------------------------------------------

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port. Module-local.
 *
 * CFML parity [model/service/PromotionService.cfc:L1005]: `if(!isNull(reward.getRoundingRule()))` -
 * the guard that decides whether the inverted-delta rounding branch runs at all. The shared helper
 * is declared `(value: unknown) => boolean`, which gives the compiler nothing to narrow with, so it
 * is wrapped in a type predicate: one definition of "nullish", and a NARROWED rounding rule.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * Does a reward's `amountType` select the given strategy arm, with case folded as CFML folds it?
 *
 * CFML parity [model/service/PromotionService.cfc:L993]: the legacy dispatch is `switch(reward.getAmountType())`,
 * and a CFML `switch` compares its `case` labels CASE-INSENSITIVELY. `'AmountOff'` therefore selects
 * `case "amountOff"` there, and this predicate is what reproduces that in a language whose own
 * `switch` compares with `===`.
 *
 * WHY THE SUBJECT CAN BE MIS-CASED DESPITE ITS TYPE. `AmountType` promises membership in the
 * three-value vocabulary UP TO CASE, not an exact spelling. `SwPromoReward.amountType` is
 * `ormType="string"` with no check constraint [model/entity/PromotionReward.cfc:L62], and
 * `narrowOrAbsent` in src/repositories/mysql/mysqlPromotionRepository.ts deliberately answers the
 * PERSISTED BYTES rather than the vocabulary member it matched, so that no read can launder a
 * canonical spelling back over stored text. A field typed `AmountType` may therefore hold
 * `'AmountOff'`, and comparing it with `===` type-checks while being wrong.
 *
 * ★ WHY THIS IS DEFINED HERE RATHER THAN SHARED. The home is prescribed, not chosen:
 * `src/lib/cfml/struct.ts` declares its export surface CLOSED and directs that a translation need none
 * of its primitives covers "belongs inside the consuming module with a documented annotation - not as
 * a new export here and not as a new file in this folder". `cfEquals` IS the primitive and performs
 * the comparison; the one thing it will not do is accept an absent subject, because it RAISES on a
 * nullish operand - correct where an unresolved value must stop, and wrong here, since [L1003] has no
 * `default:` and an absent `amountType` must FALL THROUGH to the L988 zero seed. This wrapper adds
 * exactly that difference and nothing else.
 *
 * Module-local and deliberately not exported: this module exports exactly one unit. Siblings with the
 * same shape and the same justification sit in src/services/priceGroupService.ts and
 * src/domain/entities/priceGroupRate.ts, each stating its own absence policy at its own layer.
 *
 * @param subject - the reward's persisted `amountType`, which may be absent.
 * @param arm - the strategy arm being tested, in the source's canonical spelling.
 * @returns `true` only when the subject is present and equals the arm with case folded.
 */
function matchesAmountType(subject: AmountType | undefined, arm: string): boolean {
  return subject !== undefined && cfEquals(subject, arm);
}

/**
 * Everything the three amount-type strategies may read, assembled once by the caller. Module-local.
 *
 * Each strategy destructures ONLY the operands its own legacy line actually reads, and that
 * selective destructuring is the point: it makes the legacy asymmetry visible at a glance rather
 * than burying it inside three similar-looking expressions.
 *
 *   | strategy       | legacy line | operands read                     |
 *   | percentageOff  | L995        | reward, originalAmount            |
 *   | amountOff      | L998        | reward, quantity                  |
 *   | amount         | L1001       | reward, price, quantity           |
 *
 * NOTE WHAT THE THIRD ROW DOES NOT READ. The `amount` strategy computes from `price` - the UNIT
 * price, `arguments.price` at [model/service/PromotionService.cfc:L1001] - not from
 * `originalAmount`. Multiplying by `quantity` a second time would double-count it.
 */
interface DiscountStrategyOperands {
  /**
   * The reward carrying the amount and the amount type. The strategies read `getAmount()` from it
   * LAZILY, which is load-bearing: see {@link rewardAmountOf}.
   */
  readonly reward: PromotionReward;

  /**
   * `arguments.price` [model/service/PromotionService.cfc:L987] - the UNIT price, not the extended
   * amount. Read only by the `amount` strategy.
   */
  readonly price: Money;

  /**
   * `arguments.quantity` [model/service/PromotionService.cfc:L987] - a COUNT, never money, which is
   * why it stays a plain `number` throughout.
   */
  readonly quantity: number;

  /**
   * `precisionEvaluate('arguments.price * arguments.quantity')`
   * [model/service/PromotionService.cfc:L990] - the extended amount before any discount. Read by
   * the `percentageOff` strategy and by the clamp.
   */
  readonly originalAmount: Money;
}

/**
 * One amount-type strategy: the pre-rounding discount for a single `amountType`. Every strategy is
 * TOTAL and PURE, and precisely three exist, one per stored value; the dispatch that selects
 * between them is an explicit `switch` in {@link DiscountAmountCalculator.getDiscountAmount}.
 *
 * There is deliberately NO map from `AmountType` to strategy. A `Record`-keyed lookup would be
 * index-signature dynamic dispatch, which the Minimal Change Clause forbids as a CFML-emulation
 * idiom, and under `noUncheckedIndexedAccess` it would widen every lookup to
 * `DiscountAmountStrategy | undefined` and invite a fallback the legacy switch does not have.
 */
type DiscountAmountStrategy = (operands: DiscountStrategyOperands) => Money;

/**
 * Resolves `reward.getAmount()` for a strategy that is about to use it.
 *
 * `amount` at [model/entity/PromotionReward.cfc:L61] is `ormType="big_decimal"` with NO `default`
 * attribute, so absence is a real state and the entity reports it as `undefined` rather than as a
 * substituted zero. Each of the three legacy branches then reads `reward.getAmount()` inside its
 * own `case`, and a NULL there is an arithmetic operand in CFML, which raises. So:
 *
 *   * Reproducing that raise is BEHAVIOUR PRESERVATION, not added validation - the legacy function
 *     fails on an absent amount too. Same treatment as [model/entity/PriceGroupRate.cfc:L189-L192],
 *     reproduced as a throw in `src/domain/entities/priceGroupRate.ts`.
 *   * Substituting `Money.zero` is FORBIDDEN: zero is never a fallback on a money path, because the
 *     failure mode it produces is selling products for free.
 *   * CALLING IT BEFORE THE `switch` WOULD BE A REAL BEHAVIOURAL CHANGE. The legacy switch has no
 *     `default:`, so an unrecognised `amountType` never reaches `getAmount()` and yields a zero
 *     discount rather than an error; hoisting this above the dispatch would turn that silent zero
 *     into a raise. Hence it is reached only from inside a matched strategy, and the strategies
 *     take
 *     the reward rather than a pre-resolved amount.
 *
 * @param reward - The reward whose `amount` column is about to be used as an operand.
 * @returns The amount, guaranteed present.
 * @throws Error when the column is NULL, reproducing the legacy null-operand failure at
 *   [model/service/PromotionService.cfc:L995], [L998] or [L1001].
 */
function rewardAmountOf(reward: PromotionReward): Money {
  const amount: Money | undefined = reward.getAmount();

  if (isAbsent(amount)) {
    throw new Error(
      'PromotionReward.getAmount() is absent while calculating a discount amount. This ' +
        'reproduces the legacy runtime failure at model/service/PromotionService.cfc:L995, ' +
        'L998 and L1001, where a NULL SwPromoReward.amount column becomes a null operand in ' +
        'CFML arithmetic. There is deliberately no zero substitution: ' +
        'model/entity/PromotionReward.cfc:L61 declares the column with no default, so absence ' +
        'is a real state, and defaulting it to zero would discount by the full original amount.',
    );
  }

  return amount;
}

// ---------------------------------------------------------------------------
// THE THREE AMOUNT-TYPE STRATEGIES
//
// One per stored `amountType` value, in the order the legacy `switch` declares them
// [model/service/PromotionService.cfc:L993-L1003]. The three legacy expressions differ in more than
// their operator - one scales the extended amount by a percentage, one scales the reward's own
// amount by the quantity, and one subtracts from the UNIT price before extending - and that
// asymmetry is what these named strategies exist to expose.
//
// `AmountType` is IMPORTED from `src/domain/entities/promotionReward.ts` rather than redeclared
// here; that module publishes the union mined from `getAmountTypeOptions()`
// [model/entity/PromotionReward.cfc:L120-L133].
//
// NOTE THE NAME/VALUE MISMATCH ON THE THIRD MEMBER, because it is a trap. Its display key is
// `define.fixedAmount` while its STORED value is `amount` [model/entity/PromotionReward.cfc:L131],
// and the stored value is what the switch reads. It must never be "corrected" to `fixedAmount`.
// ---------------------------------------------------------------------------

/**
 * `amountType === 'percentageOff'`: a percentage off the extended amount.
 *
 * CFML parity [model/service/PromotionService.cfc:L995]:
 *   `discountAmountPreRounding = precisionEvaluate('originalAmount * (reward.getAmount()/100)');`
 *
 * THE `/100` DIVISOR SITS INSIDE THE `precisionEvaluate` STRING, so that division is
 * arbitrary-precision in the legacy code too. The composition order is preserved exactly - the
 * amount is divided FIRST, then the extended amount is multiplied by that quotient - because a
 * non-terminating quotient resolves at the substrate's declared significant-digit count, and
 * reassociating as `(originalAmount * amount) / 100` would resolve it at a different point.
 */
const percentageOffStrategy: DiscountAmountStrategy = ({ reward, originalAmount }) =>
  originalAmount.times(rewardAmountOf(reward).dividedBy(100));

/**
 * `amountType === 'amountOff'`: a flat amount off, per unit.
 *
 * CFML parity [model/service/PromotionService.cfc:L998]:
 *   `discountAmountPreRounding = reward.getAmount() * quantity;`
 *
 * DELIBERATE DIVERGENCE (b) - REGISTER ENTRY 12, CLOSED HERE. The legacy line is the ONLY monetary
 * computation in `getDiscountAmount` that carries no `precisionEvaluate` - a raw IEEE-754
 * floating-point multiplication sitting between two branches that are both precision-guarded [L995,
 * L1001]. Here it goes through `Money`, so the result is strictly MORE correct.
 *
 * WHY THIS ONE CANNOT BE PRESERVED. `Money` is constructible only from a decimal string, exposes no
 * `toNumber`, and has no float-valued operation at all, so preserving the drift would mean
 * multiplying two JavaScript numbers and reconstructing a `Money` from the drifted product - a
 * hand-built reimplementation of IEEE-754 error, and the one precedent the
 * single-arithmetic-surface standard exists to prevent. The divergence is NARROW: only the
 * substrate changes.
 *
 * CFML parity [model/service/PromotionService.cfc:L998]: the legacy line reads the BARE `quantity`
 * rather than `arguments.quantity`; see the bare-scope note on `getDiscountAmount`.
 */
const amountOffStrategy: DiscountAmountStrategy = ({ reward, quantity }) =>
  rewardAmountOf(reward).times(quantity);

/**
 * `amountType === 'amount'`: a target unit price, with the discount being the difference.
 *
 * CFML parity [model/service/PromotionService.cfc:L1001]:
 *   `discountAmountPreRounding =`
 *   `  precisionEvaluate('(arguments.price - reward.getAmount()) * arguments.quantity');`
 *
 * THIS BRANCH COMPUTES FROM `arguments.price` - THE UNIT PRICE - NOT FROM `originalAmount`. It
 * subtracts the reward's amount from one unit's price and only then extends by the quantity;
 * substituting `originalAmount` would apply the quantity twice and pay out a different discount at
 * any quantity above one.
 *
 * NOTE WHAT IS NOT CLAMPED HERE. The reward's amount need not be below the unit price, so a target
 * amount above it yields a NEGATIVE pre-rounding discount that flows onward untouched: the clamp
 * only ever tests the upper bound, and the legacy function has no lower bound anywhere. Adding a
 * floor would be validation the legacy code does not perform.
 */
const amountStrategy: DiscountAmountStrategy = ({ reward, price, quantity }) =>
  price.minus(rewardAmountOf(reward)).times(quantity);

/**
 * The discount-amount calculation of the promotion engine, extracted from `PromotionService.cfc` as
 * a module of its own. One exported unit, one method; everything above is module-local. The class
 * exists solely to hold the one injected collaborator that
 * [model/service/PromotionService.cfc:L1006] reaches for.
 *
 * IMMUTABLE AND SAFE TO SHARE WITHIN A REQUEST: the single field is `readonly`, the class holds no
 * accumulator, memo or cache, and `getDiscountAmount` writes nothing outside its own frame. That is
 * the target-side answer to register entry 13.
 *
 * CFML parity [model/service/PromotionService.cfc:L987]: the legacy declaration is
 *   `private numeric function getDiscountAmount(...)`.
 * In the target the method is EXPORTED, through this class, so the must-preserve arithmetic can be
 * exercised directly instead of only through the 489-line orchestrator that calls it. This is
 * VISIBILITY WIDENING #5, and it alters visibility ONLY: the method adds no parameter, removes
 * none, reorders none and defaults none.
 */
export class DiscountAmountCalculator {
  /**
   * @param roundingRuleService - Supplies `roundValueByRoundingRule`, the one collaborator the
   *   ported function calls. Replaces `getRoundingRuleService()`
   *   [model/service/PromotionService.cfc:L1006], which resolved through the framework's generated
   *   accessor for `property name="roundingRuleService";`
   *   [model/service/PromotionService.cfc:L54] - one of `PromotionService`'s three DI/1 0.4.2
   *   convention-scanned collaborators. T1 APPLIED: the runtime convention scan becomes an
   *   explicit, compile-checked constructor parameter supplied once by whichever composition root
   *   constructs this class.
   *
   *   JUDGMENT CALL: the collaborator arrives on the CONSTRUCTOR, which is why this module exports
   *   a
   *   class rather than a bare function. The mapped signature
   *   `getDiscountAmount(reward: PromotionReward, price: Money, quantity: number): Money` is frozen
   *   by interface parity, so a fourth parameter is not available; `RoundingRuleService` performs
   *   no
   *   I/O, so a port would abstract nothing; and module-level state is forbidden, because on a warm
   *   container such a binding survives between unrelated invocations. Typed by an `import type`,
   *   which emits nothing into the bundle, so naming the concrete service closes no cycle.
   */
  constructor(private readonly roundingRuleService: RoundingRuleService) {}

  /**
   * Ported 1:1 from `private numeric function getDiscountAmount(required any reward, required
   * numeric price, required numeric quantity)` [model/service/PromotionService.cfc:L987-L1018].
   *
   * Computes what a single promotion reward takes off a single priced quantity. The result is the
   * DISCOUNT - the amount subtracted - never the resulting price, and never a percentage.
   *
   * CALLED AT EXACTLY FIVE LEGACY SITES, all owned by the facade or a facade-owned branch body,
   * which is what makes this module a leaf:
   *
   *   | site  | price operand                                       | quantity operand  |
   *   | L244  | `orderItem.getPrice()` (may be a price-group price)  | `discountQuantity`|
   *   | L249  | `orderItem.getSkuPrice()` (price-group correction)   | `discountQuantity`|
   *   | L373  | `orderFulfillment.getFulfillmentCharge()`            | `1`               |
   *   | L419  | `totalDiscountableAmount` (order-level pass)         | `1`               |
   *   | L1071 | `arguments.shippingMethodOption.getTotalCharge()`    | `1`               |
   *
   * SYNCHRONOUS, AND IT MUST STAY THAT WAY. The legacy body reaches no DAO and no ORM - it reads
   * three already-materialised reward fields and calls one synchronous collaborator - and the async
   * boundary rule makes a method `async` only when its legacy body reached the DAO or the ORM.
   * Making this `async` would break all five call sites above, three of which consume the result
   * inside an immediately following comparison.
   *
   * `numeric` BECOMES `Money` ON BOTH THE PRICE AND THE RETURN. `quantity` stays a plain `number`
   * because it is a COUNT, not money; every legacy call site passes an integer and three pass `1`.
   *
   * CFML parity [model/service/PromotionService.cfc:L993, L998]: the legacy body mixes scopes -
   * L990 and L1001 read `arguments.price` / `arguments.quantity` while L993 and L998 read the bare
   * `reward` and `quantity`. CFML's scope search order finds the same arguments, so the spellings
   * are equivalent there and the distinction cannot exist in a language with no `arguments` scope;
   * emulating it would need a `variables.`-shaped scope object, forbidden by the Minimal Change
   * Clause. Same family as the bare-scope artifacts at [L727], [L743], [L875] and [L877].
   *
   * @param reward - The reward supplying `amountType`, `amount` and the optional `roundingRule`.
   * @param price - The UNIT price the discount is computed against. Not the extended amount.
   * @param quantity - How many units. A count, and an integer at every legacy call site.
   * @returns The discount amount, quantized to two decimal places.
   * @throws Error when the reward's `amount` column is NULL and a strategy matches; see
   *   {@link rewardAmountOf}.
   */
  getDiscountAmount(reward: PromotionReward, price: Money, quantity: number): Money {
    // [L988] `var discountAmountPreRounding = 0;` - properly `var`'d in the legacy source, and the
    // seed is load-bearing: it is what an unmatched `amountType` falls through with.
    let discountAmountPreRounding: Money = Money.zero;

    // [L989] `var roundedFinalAmount = 0;` - also properly `var`'d, and preserved even though this
    // seed is never observable, because the contrast between these two correctly-scoped locals and
    // the un-`var`'d `discountAmount` below is the evidence that register entry 13 is a slip.
    let roundedFinalAmount: Money = Money.zero;

    // [L990] `precisionEvaluate('arguments.price * arguments.quantity')` - the extended amount.
    const originalAmount: Money = price.times(quantity);

    const operands: DiscountStrategyOperands = { reward, price, quantity, originalAmount };

    // [L993] `switch(reward.getAmountType())`, read into a named local so the `undefined` the
    // entity can report is visible at the switch. The union constrains the TYPE, not the COLUMN:
    // `amountType` at [model/entity/PromotionReward.cfc:L62] is `ormType="string"` with no check
    // constraint, so the database can hold anything and the fall-through below stays reachable.
    const amountType: AmountType | undefined = reward.getAmountType();

    // LEGACY-NOTE [model/service/PromotionService.cfc:L1003]: THE SWITCH HAS NO `default:` BRANCH.
    // L1003 closes it immediately after the `amount` case. An `amountType` that matches none of the
    // three - including an ABSENT one, since `SwPromoReward.amountType` carries no check constraint
    // and no default - therefore leaves `discountAmountPreRounding` at its L988 zero seed and, with
    // no rounding rule attached, yields a ZERO DISCOUNT rather than an error.
    // That fall-through is reproduced exactly. No `default:` is added, no exhaustiveness `never`
    // check is added, and `amountType` is not validated in any way: adding validation the legacy
    // code does not perform would change what a misconfigured reward does to an order. TypeScript
    // cannot distinguish an absent `amountType` from an unrecognised one at this dispatch, and it does
    // not need to - both take the same silent-zero path in the legacy engine's own arithmetic.
    //
    // ★ A CHAIN RATHER THAN A `switch`, BECAUSE THE MATCH MUST FOLD CASE.
    //
    // CFML parity [model/service/PromotionService.cfc:L993]: a CFML `switch` on a string compares its
    // `case` labels CASE-INSENSITIVELY, so a reward persisting `'AmountOff'` reaches
    // `case "amountOff"` in the legacy engine and receives its discount. A TypeScript `switch`
    // compares with `===` and cannot fold case, so the three arms are written as an if/else-if chain
    // over {@link matchesAmountType}. Source order [L994, L997, L1000] is kept, and the chain has NO
    // FINAL `else`, which is what preserves the fall-through documented directly above.
    //
    // WHY THIS IS NOT COSMETIC. `AmountType` promises membership in the three-value vocabulary UP TO
    // CASE, not an exact spelling - `narrowOrAbsent` in
    // src/repositories/mysql/mysqlPromotionRepository.ts hands back the PERSISTED BYTES so that no
    // canonical spelling is ever laundered over stored text. An exact comparison here therefore sent a
    // mis-cased-but-valid reward down the zero-seed path: the promotion was silently skipped and the
    // customer paid full price, with nothing reported. That is the exact failure mode of a value the
    // database is free to hold, not a hypothetical.
    if (matchesAmountType(amountType, 'percentageOff')) {
      // [L994-L996]
      discountAmountPreRounding = percentageOffStrategy(operands);
    } else if (matchesAmountType(amountType, 'amountOff')) {
      // [L997-L999]
      discountAmountPreRounding = amountOffStrategy(operands);
    } else if (matchesAmountType(amountType, 'amount')) {
      // [L1000-L1002]
      discountAmountPreRounding = amountStrategy(operands);
    }

    // DELIBERATE DIVERGENCE (a) - REGISTER ENTRY 13, CLOSED HERE.
    //
    // In the legacy function `discountAmount` is assigned WITHOUT `var`, so CFML resolves it into
    // COMPONENT (`variables`) scope. Contrast L988 and L989 above, which ARE properly `var`'d -
    // that contrast is what proves this is a slip rather than a deliberate idiom.
    //
    // Here the variable is FUNCTION-LOCAL, and the justification is CORRECTNESS. The hazard is not
    // where a quick reading would put it: within this one function every path does assign before
    // [L1017] reads. The danger is what the assignment LEAVES BEHIND - a component-scoped binding
    // survives the call and in the target would become module-level state surviving between
    // UNRELATED warm-container invocations, so one customer's computed discount would still be
    // sitting there when the next request arrives. Reproducing that faithfully would be actively
    // unsafe. It is declared with NO INITIALIZER, deliberately: the legacy variable has no
    // declaration and therefore no seed of its own, and the absence lets the compiler prove
    // assignment on every path before [L1017] reads.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L1007, L1009, L1014]: register entry 13 has
    // THREE assignment sites; the plan cites only L1007 and L1009. Locator corrected against
    // source: within L987-L1018 the identifier is assigned at all three and declared with `var` at
    // none
    //   of
    // them. The third site matters, because L1007 and L1009 are mutually exclusive while L1014 can
    // overwrite EITHER: the clamp, not the rounding branch, is the last writer whenever it fires,
    // and it is the site register entry 14 turns into a defect.
    let discountAmount: Money;

    // [L1005] `if(!isNull(reward.getRoundingRule()))`. Absence is a legitimate selection here -
    // `hb_optionsNullRBKey="define.none"` [model/entity/PromotionReward.cfc:L71] - so a reward with
    // no rule skips rounding entirely rather than being rounded by an identity rule.
    const roundingRule: RoundingRule | undefined = reward.getRoundingRule();

    if (!isAbsent(roundingRule)) {
      // CFML parity [model/service/PromotionService.cfc:L1005-L1007]: THE ROUNDING RULE IS APPLIED
      // TO THE NET PRICE AND THE DISCOUNT IS DERIVED BACKWARDS OUT OF THE RESULT - the inverted
      // delta this file opens with. The two statements below must stay in this order and must keep
      // these operands; rounding `discountAmountPreRounding` instead would pay out different money
      // on every rule whose expression is not symmetric.
      //
      // CFML parity [model/service/RoundingRuleService.cfc:L89]: the collaborator quantizes ITS OWN
      // input to two decimals before the rounding algorithm begins -
      //   `var inputValue = numberFormat(arguments.value, "0.00");`.
      // There are therefore TWO quantization points on this path, not one: that one and
      // [model/service/PromotionService.cfc:L1017] on the way out. They are deliberately NOT
      // collapsed - a full-precision net price and a two-decimal one can produce the same rounded
      // price point while the derived discounts differ in the digits [L1017] then discards. The
      // collaborator declares `numeric` while the `roundValue` it delegates to declares `string`
      // [model/service/RoundingRuleService.cfc:L84, L88]; that crossing is owned by
      // `src/services/roundingRuleService.ts`, so this module receives a `Money` and does NOT
      // re-implement the rounding algorithm.

      // [L1006] The named-argument form `roundValueByRoundingRule(value=..., roundingRule=...)`, in
      // the declared parameter order.
      roundedFinalAmount = this.roundingRuleService.roundValueByRoundingRule(
        originalAmount.minus(discountAmountPreRounding),
        roundingRule,
      );

      // [L1007] `precisionEvaluate('originalAmount - roundedFinalAmount')` - the derived discount.
      discountAmount = originalAmount.minus(roundedFinalAmount);
    } else {
      // [L1008-L1010] NO ROUNDING AT ALL on this path: the pre-rounding value passes straight
      // through, unquantized, to the clamp and then to [L1017].
      discountAmount = discountAmountPreRounding;
    }

    // [L1012] The legacy comment, carried over verbatim because the gap between what it claims and
    // what the code does IS the defect:
    //   `// This makes sure that the discount never exceeds the original amount`
    //
    // SECURITY REVIEW DISPOSITION - RAISED AS S-03, DECLINED ON A CITED MANDATE.
    //
    // Raised as finding S-03, CRITICAL, CWE-682 and CWE-840, with runtime evidence
    // of an original amount of 0.42, a pre-discount of 0.01, a rounded net of -0.99
    // and a derived discount of 1.41 while the clamp stayed false. Its suggested
    // resolution was to clamp the ACTUAL POST-ROUNDING discount into
    // `[0, originalAmount]` at every consumer and reject negative rounded totals.
    //
    // DECLINED HERE, on the same mandate that governs every preserved defect:
    // AAP 0.6.7 registers this as defect 14 - "the discount clamp compares the
    // pre-rounding value but overwrites the post-rounding one" - and AAP 0.4.1
    // specifies this module as preserving "the clamp defect L1013-L1015 as-written".
    // The negative-candidate and over-100% outcomes the review demonstrated are the
    // same phenomena AAP 0.6.4 already measured and named Finding D (negative
    // intermediate candidates) and Finding C (short-input collapse), and AAP 0.9.3
    // makes a tidier answer a FAILING gate: "A 'corrected' rounding implementation
    // that produces mathematically tidier answers FAILS this gate."
    //
    // Clamping post-rounding would change the amount charged wherever a rounding
    // rule is attached to a low-priced item - which is precisely the case the review
    // exercised - so it is a product decision, not hardening. Pinned rather than
    // repaired: see the adversarial cases in
    // `tests/unit/domain/entities/promotionReward.test.ts` and the consumer-invariant
    // block in `tests/unit/services/roundingRuleService.test.ts`, which states what a
    // caller that must NOT inherit this behaviour has to do at its own boundary.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the clamp GATES ON
    // `discountAmountPreRounding` but ASSIGNS TO `discountAmount`, so it tests one value and
    // overwrites a different one. Two independent wrong behaviours follow, in OPPOSITE directions.
    // (a) FALSE POSITIVE: when a rounding rule fired and the pre-rounding value exceeded the
    // original amount, this assignment DISCARDS the entire L1006/L1007 rounding computation and
    // substitutes `originalAmount`, so the rounded price point is thrown away and the customer pays
    // nothing. (b) FALSE NEGATIVE: when `roundedFinalAmount` comes back NEGATIVE - which the
    // rounding algorithm can produce, its candidate arithmetic being unsigned-agnostic - the
    // discount derived at L1007 EXCEEDS `originalAmount` and the clamp does not catch it, because
    // it is testing the wrong variable, so the comment above is not true of the code beneath it.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The compared variable is NOT aligned with the assigned one and nothing is reordered: aligning
    // them would change the money paid out in both directions at once.
    if (discountAmountPreRounding.isGreaterThan(originalAmount)) {
      // [L1014] The third assignment site of register entry 13.
      discountAmount = originalAmount;
    }

    // CFML parity [model/service/PromotionService.cfc:L1017]:
    //   `return numberFormat(discountAmount, "0.00");`
    // is LOAD-BEARING LOSSY QUANTIZATION, not cosmetic formatting. It is the last statement of the
    // function, it discards every digit past the second decimal, and the five call sites consume
    // the quantized value - L244 and L249 feed it into a descending insert-sort and a `> 0` gate,
    // so the digits dropped here decide which discount wins.
    //
    // THE LEGACY DECLARES `returntype="numeric"` WHILE `numberFormat` RETURNS A STRING. CFML
    // coerces silently across that boundary; this port does not, so the crossing is two named
    // steps. `numberFormat(...)` is called by name with the mask `'0.00'` written out, so the line
    // diffs directly against L1017, and it is handed `toDecimalString()` - the FULL-PRECISION
    // rendering - so nothing is rounded before the mask is applied. Its `DecimalString` result then
    // re-enters the money surface through `Money.fromDecimalString`, the only construction path.
    //
    // JUDGMENT CALL: `Money.toFixed2()` is the one-call equivalent and computes the identical value
    // from the same mask. The explicit two-step is preferred on reviewability grounds: a reviewer
    // checking L1017 should find `numberFormat` and `'0.00'` written here rather than open
    // `money.ts` to confirm the mask.
    const quantizedDiscountAmount: DecimalString = numberFormat(
      discountAmount.toDecimalString(),
      '0.00',
    );

    return Money.fromDecimalString(quantizedDiscountAmount);
  }
}
