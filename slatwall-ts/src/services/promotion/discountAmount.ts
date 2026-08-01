// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order
// "a compile-order convenience, not a schedule". Commentary in this file therefore
// names modules of the target layout that DO NOT EXIST YET. Every such name carries
// `(planned)` at its point of use, meaning exactly: a planned Agent Action Plan
// target that is ABSENT from the subtree at this checkpoint. Nothing here asserts
// that any of them exists now, and no behaviour in this file depends on one. The
// complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts                              composition root (wiring)
//   src/services/promotionService.ts                       the facade that calls this module
//   src/services/promotion/salePriceSeeding.ts             sibling decomposition module
//   src/services/promotion/promotionPeriodQualification.ts sibling decomposition module
//   src/services/promotion/qualifierQualification.ts       sibling decomposition module
//   src/services/promotion/orderItemMembership.ts          sibling decomposition module
//   src/services/promotion/rewardUsageLedger.ts            sibling decomposition module
//   src/services/promotion/overUseStripping.ts             sibling decomposition module
//   src/services/promotion/promotionApplication.ts         sibling decomposition module
//   src/services/promotion/twoPassRewardIterator.ts        sibling decomposition module
//   tests/unit/services/promotion                          this module's net-new suite
//
// ★ THIS MODULE IMPORTS NONE OF THEM, AND THAT IS A STRUCTURAL FACT RATHER THAN A
// CHECKPOINT ACCIDENT. `getDiscountAmount` is called at exactly FIVE sites in the
// legacy source - [model/service/PromotionService.cfc:L244], [L249], [L373], [L419]
// and [L1071] - and every one of them is owned by the facade or by a facade-owned
// branch body. No sibling module in this folder calls it. So this file is a proven
// LEAF: it imports no sibling, it never imports the facade back, and it closes no
// cycle. Verified against source; see the call-site table on `getDiscountAmount`.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// slatwall-ts - Promotion discount-amount calculation
//
// PORTED FROM: `private numeric function getDiscountAmount(required any reward,
// required numeric price, required numeric quantity)`
// [model/service/PromotionService.cfc:L987-L1018], as a 1:1 logic extraction.
// Thirty-two lines of CFML, and the arithmetic core of MUST-PRESERVE AREA #1 -
// promotion discount math together with use-limit enforcement (AAP 0.8.1). Every
// discount this platform grants is computed here, so nothing in this file may be
// tidied on aesthetic grounds.
//
// ⚠️⚠️⚠️ READ THIS BEFORE READING THE CODE: THE ROUNDING IS AN INVERTED DELTA.
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
// An implementation that "rounds the discount amount" is COMPLETELY WRONG and pays
// out different money. The collaborator agrees in writing - see the direction note
// in the header of `src/services/roundingRuleService.ts`, which rounds exactly the
// value it is handed and never reinterprets an argument as a discount.
//
// ★ THE DEFECT REGISTER ENTRIES THIS FILE OWNS: 12, 13 and 14.
//   * 12 [L998]  the `amountOff` branch escapes arbitrary-precision arithmetic.
//                DELIBERATE DIVERGENCE (b) - closed here. Annotated at the site.
//   * 13 [L1007, L1009, L1014]  `discountAmount` is never `var`'d and leaks into
//                CFML component scope. DELIBERATE DIVERGENCE (a) - made
//                function-local here. Annotated at the declaration.
//   * 14 [L1013-L1015]  the clamp gates on one variable and assigns another.
//                PRESERVED EXACTLY. Annotated at the site, in both directions.
//
// ★ EXACTLY TWO DELIBERATE DIVERGENCES LIVE IN THIS FILE, AND THE BUDGET IS NOW
// SPENT. Divergences (a) and (b) above are both of the two available to this folder;
// the project's third is spent in `src/domain/entities/product.ts` on register entry
// 19's poisoned memo. Nothing else in this file, and nothing else in this folder,
// diverges from legacy behaviour. Register entry 14 is PRESERVED, not diverged. The
// absent `default:` case is PRESERVED. The CFML bare-scope reads are a parity note,
// not a divergence. A third divergence here would be a gate failure.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L990, L995, L1001, L1006, L1007]: the
// `precisionEvaluate` census for the in-scope slice is NINE sites, not the eight the
// transformation plan cites.
// Verified by grepping the source: L150, L252, L299, L486, L990, L995, L1001, L1006 and
// L1007. FIVE of the nine are inside this one function, which is why it is the file the
// single-arithmetic-surface standard matters most in. The omitted citation is L1006 -
// the `originalAmount - discountAmountPreRounding` that produces the net price - and it
// is the semantically most important of the nine. Where the plan and the source
// disagree the SOURCE WINS and the correction is recorded in place.
//
// LEGACY-NOTE [meta/tests/unit/service]: THIS MODULE'S COVERAGE IS NET-NEW.
// There is no legacy antecedent to trace to. `meta/tests/unit/service/` contains only
// AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest,
// and none of the four is in scope; `meta/tests/unit/dao/` holds only AccountDAOTest and
// PaymentDAOTest. Coverage of this module must therefore be declared NET-NEW and must
// never be presented as parity with an existing suite (AAP 0.6.6). The suite itself is
// owned by `tests/unit/services/promotion` (planned) and no test file is authored from
// this module's task.
//
// ★ NOT APPLICABLE HERE, STATED SO THE OMISSIONS ARE NOT READ AS OVERSIGHTS:
//   * NO SQL, PARAMETERIZED OR OTHERWISE. This module runs no queries and holds no
//     statement text. Every statement in the target lives in
//     `src/repositories/mysql/**`, where the prepared-statement discipline that
//     preserves `cfqueryparam`'s injection-safety property is enforced. There is
//     nothing to parameterize in this file.
//   * NO SETTINGS AND NO AMBIENT SCOPE. This module reads no setting, takes no
//     settings provider, and takes no request context. It does not import
//     `src/lib/config.ts`, which is static process configuration and must never be
//     used as a request scope.
//   * NO MODULE-LEVEL MUTABLE STATE. Every binding at module scope below is a frozen
//     pure function or a type. All working state is function-local. On a warm
//     container a module-level binding survives between UNRELATED invocations, so
//     holding a partially-computed discount there could let one customer's discount
//     answer another customer's order - a CORRECTNESS property, and the same reason
//     divergence (a) exists.
//   * NO LOGGING. The legacy function emits nothing, and neither does this one.
//
// This file asserts no service-level objective, no latency, throughput, uptime or
// availability figure of any kind, because the legacy system declares none and none
// may be invented (AAP 0.8.1). Where a decision below is justified, it is justified
// on CORRECTNESS grounds.
// ---------------------------------------------------------------------------

import type { AmountType, PromotionReward } from '../../domain/entities/promotionReward.js';
import type { RoundingRule } from '../../domain/entities/roundingRule.js';
import { Money } from '../../domain/valueObjects/money.js';
import type { DecimalString } from '../../lib/cfml/numberFormat.js';
import { numberFormat } from '../../lib/cfml/numberFormat.js';
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
//     of the fourteen pinned packages directly.
// ---------------------------------------------------------------------------

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port.
 *
 * CFML parity [model/service/PromotionService.cfc:L1005]: `if(!isNull(reward.getRoundingRule()))`
 * - the guard that decides whether the inverted-delta rounding branch runs at all.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is the right shape for a
 * general-purpose predicate but gives the compiler nothing to narrow with. Wrapping it in a type
 * predicate keeps ONE definition of "nullish" in the subtree - the delegation is real, not
 * decorative - while letting `strict` mode see the narrowing. That matters here because
 * `@typescript-eslint/no-non-null-assertion` is an error across `src/**` and a `!` assertion is
 * exactly the construct that would silence the check protecting this branch. The rounding rule is
 * NARROWED, never asserted.
 *
 * Module-local and deliberately not exported: this module exports exactly one unit.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * Everything the three amount-type strategies may read, assembled once by the caller.
 *
 * Each strategy destructures ONLY the operands its own legacy line actually reads, and that
 * selective destructuring is the point: it makes the legacy asymmetry visible at a glance rather
 * than burying it inside three similar-looking expressions (AAP 0.3.3, Strategy pattern for
 * amount-type dispatch).
 *
 *   | strategy       | legacy line | operands read                     |
 *   |----------------|-------------|-----------------------------------|
 *   | percentageOff  | L995        | reward, originalAmount            |
 *   | amountOff      | L998        | reward, quantity                  |
 *   | amount         | L1001       | reward, price, quantity           |
 *
 * ★ NOTE WHAT THE THIRD ROW DOES NOT READ. The `amount` strategy computes from `price` - the UNIT
 * price, `arguments.price` at [model/service/PromotionService.cfc:L1001] - and NOT from
 * `originalAmount`. Multiplying by `quantity` a second time would double-count it.
 *
 * Module-local and deliberately not exported, for the same reason as everything else here.
 */
interface DiscountStrategyOperands {
  /**
   * The reward carrying the amount and the amount type.
   *
   * The strategies read `getAmount()` from it LAZILY rather than receiving a resolved amount,
   * which is load-bearing: see {@link rewardAmountOf}.
   */
  readonly reward: PromotionReward;

  /**
   * `arguments.price` [model/service/PromotionService.cfc:L987] - the UNIT price, not the extended
   * amount. Read only by the `amount` strategy.
   */
  readonly price: Money;

  /**
   * `arguments.quantity` [model/service/PromotionService.cfc:L987] - a COUNT, never money, which
   * is why it stays a plain `number` all the way through this module.
   */
  readonly quantity: number;

  /**
   * `precisionEvaluate('arguments.price * arguments.quantity')`
   * [model/service/PromotionService.cfc:L990] - the extended amount before any discount. Read by
   * the `percentageOff` strategy, and by the clamp.
   */
  readonly originalAmount: Money;
}

/**
 * One amount-type strategy: the pre-rounding discount for a single `amountType`.
 *
 * Every strategy is TOTAL and PURE - it computes from its operands, touches no shared state, and
 * returns a `Money`. Precisely three exist, one per stored `amountType` value, and the dispatch
 * that selects between them is an explicit `switch` in
 * {@link DiscountAmountCalculator.getDiscountAmount}.
 *
 * There is deliberately NO map from `AmountType` to strategy. A `Record`-keyed lookup would be
 * index-signature dynamic dispatch, which the Minimal Change Clause forbids as a CFML-emulation
 * idiom, and under `noUncheckedIndexedAccess` it would also widen every lookup to
 * `DiscountAmountStrategy | undefined` and invite a fallback that the legacy switch does not have.
 */
type DiscountAmountStrategy = (operands: DiscountStrategyOperands) => Money;

/**
 * Resolves `reward.getAmount()` for a strategy that is about to use it.
 *
 * WHY THIS EXISTS, AND WHY IT IS CALLED LAZILY FROM INSIDE EACH STRATEGY RATHER THAN ONCE BEFORE
 * THE DISPATCH. `amount` at [model/entity/PromotionReward.cfc:L61] is `ormType="big_decimal"` with
 * NO `default` attribute, so absence is a real state and the entity reports it as `undefined`
 * rather than as a substituted zero. Each of the three legacy branches then reads
 * `reward.getAmount()` inside its own `case`, and a NULL there is an arithmetic operand in CFML,
 * which raises. So:
 *
 *   * Reproducing that raise is BEHAVIOUR PRESERVATION, not added validation. The legacy function
 *     fails on an absent amount too; it simply fails with a CFML engine message. The same
 *     treatment is applied elsewhere in the port for the same reason - see
 *     [model/entity/PriceGroupRate.cfc:L189-L192], reproduced as a throw in
 *     `src/domain/entities/priceGroupRate.ts`.
 *   * Substituting `Money.zero` is FORBIDDEN. `money.ts` states the prohibition outright: zero is
 *     never a fallback, a default or an error result on a money path, because the failure mode it
 *     produces is selling products for free.
 *   * CALLING IT BEFORE THE `switch` WOULD BE A REAL BEHAVIOURAL CHANGE, and this is the subtle
 *     part. The legacy switch has no `default:`, so an unrecognised `amountType` never reaches
 *     `getAmount()` at all and yields a zero discount rather than an error. Hoisting this
 *     resolution above the dispatch would turn that silent zero into a raise - inventing a
 *     failure the legacy system does not have. It is therefore reached only from inside a matched
 *     strategy, and the strategies take the reward rather than a pre-resolved amount for exactly
 *     that reason.
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
// [model/service/PromotionService.cfc:L993-L1003]. The three legacy expressions differ from one
// another in more than their operator, and that is the asymmetry these named strategies exist to
// expose: one scales the extended amount by a percentage, one scales the reward's own amount by the
// quantity, and one subtracts from the UNIT price before extending. Collapsing them into a single
// expression driven by flags would hide exactly the differences a reviewer has to check.
//
// `AmountType` is IMPORTED from `src/domain/entities/promotionReward.ts` rather than redeclared
// here. That module already publishes the union as the strategy-dispatch vocabulary, mined from
// `getAmountTypeOptions()` [model/entity/PromotionReward.cfc:L120-L133], and one definition of a
// vocabulary is the whole point of having a type for it. A `TS enum` is forbidden subtree-wide
// because it emits runtime JavaScript; a string-literal union emits nothing.
//
// ★ NOTE THE NAME/VALUE MISMATCH ON THE THIRD MEMBER, because it is a trap. Its display key is
// `define.fixedAmount` while its STORED value is `amount` [model/entity/PromotionReward.cfc:L131],
// and the stored value is what the switch reads. It must never be "corrected" to `fixedAmount`.
// ---------------------------------------------------------------------------

/**
 * `amountType === 'percentageOff'`: a percentage off the extended amount.
 *
 * CFML parity [model/service/PromotionService.cfc:L995]:
 *   `discountAmountPreRounding = precisionEvaluate('originalAmount * (reward.getAmount()/100)');`
 *
 * ★ THE `/100` DIVISOR SITS INSIDE THE `precisionEvaluate` STRING, so in the legacy code that
 * division is arbitrary-precision and NOT a float operation. Reproduced as `Money.dividedBy(100)`,
 * which resolves through the same decimal substrate; no JavaScript `/` touches a monetary operand
 * anywhere in this file. The composition order is preserved exactly - the amount is divided FIRST
 * and the extended amount is multiplied by that quotient - because a non-terminating quotient is
 * resolved at the substrate's declared significant-digit count, and reassociating the expression
 * as `(originalAmount * amount) / 100` would resolve it at a different point.
 *
 * The divisor is the literal `100`, a non-monetary safe integer, which is the operand form
 * `Money.dividedBy` documents for precisely this site.
 */
const percentageOffStrategy: DiscountAmountStrategy = ({ reward, originalAmount }) =>
  originalAmount.times(rewardAmountOf(reward).dividedBy(100));

/**
 * `amountType === 'amountOff'`: a flat amount off, per unit.
 *
 * CFML parity [model/service/PromotionService.cfc:L998]:
 *   `discountAmountPreRounding = reward.getAmount() * quantity;`
 *
 * DELIBERATE DIVERGENCE (b) - REGISTER ENTRY 12, CLOSED HERE. THIS IS ONE OF EXACTLY TWO
 * DIVERGENCES IN THIS FILE AND EXACTLY THREE IN THE PROJECT.
 *
 * The legacy line is the ONLY monetary computation in `getDiscountAmount` that carries no
 * `precisionEvaluate` - it is a raw IEEE-754 floating-point multiplication, sitting between two
 * branches that are both precision-guarded [L995, L1001]. In the target it goes through `Money`
 * like every other money operation, so the result is strictly MORE correct than the source's.
 *
 * WHY THIS ONE CANNOT BE PRESERVED, stated as a reason rather than asserted. Routing all money
 * arithmetic through `Money` is a structural decision, not a stylistic one: `Money` is
 * constructible only from a decimal string, exposes no `toNumber`, and has no float-valued
 * operation at all. Preserving this branch's drift would mean deliberately bypassing the value
 * object on a money path - obtaining two JavaScript numbers, multiplying them, and reconstructing
 * a `Money` from the drifted product. That is not a faithful port of a defect; it is a
 * hand-built reimplementation of IEEE-754 error, and it would establish the one precedent the
 * single-arithmetic-surface standard exists to prevent. The divergence is recorded rather than
 * applied silently, which is what makes it auditable.
 *
 * The divergence is NARROW. Only the arithmetic substrate changes. The operands are unchanged, the
 * order is unchanged, and the value flows on into the same rounding branch and the same clamp.
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
 * ★ THIS BRANCH COMPUTES FROM `arguments.price` - THE UNIT PRICE - NOT FROM `originalAmount`. It
 * subtracts the reward's amount from one unit's price and only then extends by the quantity.
 * Substituting `originalAmount` would apply the quantity twice, and for any quantity above one it
 * would pay out a different discount. The operand table on {@link DiscountStrategyOperands}
 * records the asymmetry; this is the branch it describes.
 *
 * NOTE WHAT IS NOT CLAMPED HERE. The reward's amount is not required to be below the unit price,
 * so a target amount above it yields a NEGATIVE pre-rounding discount, which then flows onward
 * untouched: the clamp on `getDiscountAmount` only ever tests the upper bound, and there is no
 * lower bound anywhere in the legacy function. No floor is added - adding one would be validation
 * the legacy code does not perform.
 */
const amountStrategy: DiscountAmountStrategy = ({ reward, price, quantity }) =>
  price.minus(rewardAmountOf(reward)).times(quantity);

/**
 * The discount-amount calculation of the promotion engine, extracted from
 * `PromotionService.cfc` as a module of its own.
 *
 * ONE EXPORTED UNIT, ONE METHOD. Everything above is module-local. The class exists solely to hold
 * the one injected collaborator that [model/service/PromotionService.cfc:L1006] reaches for; see the
 * constructor for why a collaborator cannot simply be a parameter here.
 *
 * IMMUTABLE AND SAFE TO SHARE WITHIN A REQUEST. The single field is `readonly`, the class holds no
 * accumulator, no memo and no cache, and `getDiscountAmount` writes nothing outside its own frame.
 * Two concurrent calls cannot observe one another. That property is not decorative: it is the
 * target-side answer to register entry 13, and the reason divergence (a) below is a correctness
 * decision rather than a preference.
 *
 * CFML parity [model/service/PromotionService.cfc:L987]: the legacy declaration is
 * `private numeric function getDiscountAmount(...)`. In the target the method is EXPORTED, through
 * this class, so the must-preserve arithmetic can be exercised directly instead of only through the
 * 489-line orchestrator that calls it. This is VISIBILITY WIDENING #5, the last of the project's
 * five, and it alters visibility ONLY - not the signature, not the behaviour, not the arithmetic.
 * The ledger of visibility widenings is now exhausted: no further private legacy method may be
 * promoted. Visibility widenings and SIGNATURE widenings are distinct ledgers and must never be
 * conflated - of the latter, ZERO remain project-wide, which is why the method below adds no
 * parameter, removes none, reorders none and defaults none.
 */
export class DiscountAmountCalculator {
  /**
   * @param roundingRuleService - Supplies `roundValueByRoundingRule`, the one collaborator the
   *   ported function calls. Replaces `getRoundingRuleService()`
   *   [model/service/PromotionService.cfc:L1006], which in the legacy system resolved through the
   *   framework's generated accessor for `property name="roundingRuleService";`
   *   [model/service/PromotionService.cfc:L54] - one of `PromotionService`'s three DI/1 0.4.2
   *   convention-scanned collaborators.
   *
   *   T1 APPLIED. The property was resolved by a runtime convention scan; here it is an explicit,
   *   compile-checked constructor parameter, wired exactly once in `src/handlers/bootstrap.ts`
   *   (planned). There is no runtime scan, no service locator and no dependency-injection
   *   container package anywhere in the target.
   *
   *   JUDGMENT CALL: the collaborator arrives on the CONSTRUCTOR, which is why this module exports
   *   a class rather than a bare function. The mapped method signature -
   *   `getDiscountAmount(reward: PromotionReward, price: Money, quantity: number): Money` - is
   *   frozen by the interface-parity contract, so the dependency has nowhere else to go. Three
   *   alternatives were considered and each is forbidden:
   *     * ADD THE COLLABORATOR AS A FOURTH PARAMETER. Forbidden - zero signature widenings remain
   *       project-wide, and interface parity is the acceptance contract. A reviewer diffing the two
   *       surfaces method by method must find three parameters, in the legacy order.
   *     * DECLARE A NEW PORT for the rounding collaborator. Forbidden - the port inventory is
   *       LOCKED AT 13 and contains no `roundingRuleRepository`. `RoundingRuleService` is a
   *       service, not an adapter; it performs no I/O, so a port would abstract nothing.
   *     * HOLD IT IN MODULE-LEVEL STATE. Forbidden - no module-level mutable state exists anywhere
   *       in this subtree, and on a warm container such a binding would survive between unrelated
   *       invocations.
   *
   *   TYPED BY A TYPE-ONLY IMPORT, deliberately. `import type` emits nothing into the CommonJS
   *   bundle, so naming the concrete service here creates no runtime coupling and closes no cycle -
   *   `src/services/roundingRuleService.ts` imports nothing from this folder. The concrete instance
   *   is supplied by the composition root.
   */
  constructor(private readonly roundingRuleService: RoundingRuleService) {}

  /**
   * Ported 1:1 from `private numeric function getDiscountAmount(required any reward,
   * required numeric price, required numeric quantity)`
   * [model/service/PromotionService.cfc:L987-L1018].
   *
   * Computes what a single promotion reward takes off a single priced quantity. The result is the
   * DISCOUNT - the amount subtracted - never the resulting price, and never a percentage.
   *
   * ★ CALLED AT EXACTLY FIVE LEGACY SITES, all of them owned by the facade or a facade-owned
   * branch body, which is what makes this module a leaf:
   *
   *   | site  | price operand                                       | quantity operand  |
   *   |-------|-----------------------------------------------------|-------------------|
   *   | L244  | `orderItem.getPrice()` (may be a price-group price)  | `discountQuantity`|
   *   | L249  | `orderItem.getSkuPrice()` (price-group correction)   | `discountQuantity`|
   *   | L373  | `orderFulfillment.getFulfillmentCharge()`            | `1`               |
   *   | L419  | `totalDiscountableAmount` (order-level pass)         | `1`               |
   *   | L1071 | `arguments.shippingMethodOption.getTotalCharge()`    | `1`               |
   *
   * SYNCHRONOUS, AND IT MUST STAY THAT WAY. The legacy body reaches no DAO and no ORM: it reads
   * three already-materialised fields off the reward and calls one synchronous collaborator. The
   * project's async boundary rule is that a method becomes `async` if and only if its legacy body
   * reached the DAO or the ORM, so making this `async` "for consistency" would invent an await
   * point the legacy system does not have and would break all five call sites above - three of
   * which consume the result inside an immediately following comparison.
   *
   * `numeric` BECOMES `Money` ON BOTH THE PRICE AND THE RETURN. `quantity` stays a plain `number`
   * because it is a COUNT, not money - every one of the five legacy call sites passes an integer,
   * and three pass the literal `1`.
   *
   * CFML parity [model/service/PromotionService.cfc:L993, L998]: the legacy body mixes scopes -
   * L990 and L1001 read `arguments.price` / `arguments.quantity`, while L993 reads the bare
   * `reward` and L998 reads the bare `quantity`. In CFML the bare form resolves through the scope
   * search order and happens to find the same arguments, so the two spellings are equivalent
   * there. TypeScript has no `arguments` scope and no scope search order, so the distinction
   * CANNOT exist in the target and is recorded once here rather than emulated. Reproducing it
   * would require a `variables.`-shaped scope object, which the Minimal Change Clause forbids
   * outright. Same family as the bare-scope artifacts at [L727], [L743], [L875] and [L877].
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
    // seed is load-bearing: it is what an unmatched `amountType` falls through with. See the
    // LEGACY-NOTE on the absent `default:` below.
    let discountAmountPreRounding: Money = Money.zero;

    // [L989] `var roundedFinalAmount = 0;` - also properly `var`'d, and also preserved even though
    // this seed is never observable: the variable is read only inside the rounding branch, which
    // assigns it first. It is kept because the contrast between these two correctly-scoped locals
    // and the un-`var`'d `discountAmount` below is precisely the evidence that register entry 13 is
    // a slip rather than a convention.
    let roundedFinalAmount: Money = Money.zero;

    // [L990] `precisionEvaluate('arguments.price * arguments.quantity')` - the extended amount.
    const originalAmount: Money = price.times(quantity);

    const operands: DiscountStrategyOperands = { reward, price, quantity, originalAmount };

    // [L993] `switch(reward.getAmountType())`, read into a named local so the `undefined` the entity
    // can report is visible at the switch rather than buried in a call expression. `AmountType` is
    // the three-value union `src/domain/entities/promotionReward.ts` publishes, mined from
    // `getAmountTypeOptions()` [model/entity/PromotionReward.cfc:L120-L133]. That union constrains
    // the TYPE, not the COLUMN: `amountType` at [model/entity/PromotionReward.cfc:L62] is
    // `ormType="string"` with no check constraint, so the database can hold anything and the
    // fall-through documented below stays reachable.
    const amountType: AmountType | undefined = reward.getAmountType();

    // LEGACY-NOTE [model/service/PromotionService.cfc:L1003]: THE SWITCH HAS NO `default:` BRANCH.
    // L1003 closes it immediately after the `amount` case. An `amountType` that matches none of the
    // three - including an ABSENT one, since `SwPromoReward.amountType` carries no check constraint
    // and no default - therefore leaves `discountAmountPreRounding` at its L988 zero seed and, with
    // no rounding rule attached, yields a ZERO DISCOUNT rather than an error.
    // That fall-through is reproduced exactly. No `default:` is added, no exhaustiveness `never`
    // check is added, and `amountType` is not validated in any way: adding validation the legacy
    // code does not perform would change what a misconfigured reward does to an order. TypeScript
    // cannot distinguish an absent `amountType` from an unrecognised one at this switch, and it does
    // not need to - both take the same silent-zero path in the legacy engine's own arithmetic.
    switch (amountType) {
      case 'percentageOff':
        // [L994-L996]
        discountAmountPreRounding = percentageOffStrategy(operands);
        break;
      case 'amountOff':
        // [L997-L999]
        discountAmountPreRounding = amountOffStrategy(operands);
        break;
      case 'amount':
        // [L1000-L1002]
        discountAmountPreRounding = amountStrategy(operands);
        break;
    }

    // DELIBERATE DIVERGENCE (a) - REGISTER ENTRY 13, CLOSED HERE. THIS IS THE SECOND AND LAST OF
    // THIS FILE'S TWO DIVERGENCES; THE BUDGET IS NOW SPENT.
    //
    // In the legacy function `discountAmount` is assigned WITHOUT `var`, so CFML resolves it into
    // COMPONENT (`variables`) scope: the value outlives the call and is shared by every caller of
    // the component. Contrast L988 and L989 above, which ARE properly `var`'d - that contrast is
    // what proves this is a slip and not a deliberate idiom.
    //
    // Here the variable is FUNCTION-LOCAL. The justification is CORRECTNESS. Stated precisely,
    // because the hazard is not where a quick reading would put it: within this one function every
    // path does assign before [L1017] reads, so the function never returns a stale value of its own
    // accord. The danger is what the assignment LEAVES BEHIND. A component-scoped binding survives
    // the call, is visible to every other method on the component, and in the target becomes
    // module-level state that survives between UNRELATED warm-container invocations - so one
    // customer's computed discount would still be sitting there when the next request arrives, ready
    // to be read by any code that assumes it is reading its own. Reproducing that faithfully would
    // be actively unsafe, so it is not reproduced - and the choice is recorded here so a reviewer
    // can see it was made knowingly rather than tidied away.
    //
    // Declared with NO INITIALIZER, deliberately. The legacy variable has no declaration at all and
    // therefore no seed of its own - unlike the two above - so there is no zero to preserve, and
    // the absence lets the compiler prove the variable is assigned on every path before [L1017]
    // reads it.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L1007, L1009, L1014]: register entry 13 has
    // THREE assignment sites; the plan cites only L1007 and L1009. Locator corrected against
    // source.
    // The third is the clamp's assignment at L1014, verified by grepping the source: within
    // L987-L1018 the identifier is assigned at L1007, L1009 and L1014 and declared with `var` at
    // none of them. Missing the third site matters, because L1007 and L1009 are mutually exclusive
    // while L1014 can overwrite EITHER of them - so the clamp, not the rounding branch, is the last
    // writer whenever it fires, and it is the site register entry 14 turns into a defect.
    let discountAmount: Money;

    // [L1005] `if(!isNull(reward.getRoundingRule()))`. Absence is a legitimate selection here -
    // `hb_optionsNullRBKey="define.none"` [model/entity/PromotionReward.cfc:L71] - so a reward with
    // no rule skips rounding entirely rather than being rounded by an identity rule.
    const roundingRule: RoundingRule | undefined = reward.getRoundingRule();

    if (!isAbsent(roundingRule)) {
      // CFML parity [model/service/PromotionService.cfc:L1005-L1007]: ⚠️ THE ROUNDING RULE IS
      // APPLIED TO THE NET PRICE, AND THE DISCOUNT IS DERIVED BACKWARDS OUT OF THE RESULT.
      // `originalAmount - discountAmountPreRounding` is what the customer would PAY, so the rule
      // shapes a resulting PRICE POINT - `$x.99`, say - and the discount at [L1007] is whatever
      // residual lands on it. Rounding `discountAmountPreRounding` instead would pay out different
      // money on every rule whose expression does not happen to be symmetric. The two statements
      // below must stay in this order and must keep these operands.
      //
      // CFML parity [model/service/RoundingRuleService.cfc:L89]: the collaborator quantizes ITS OWN
      // input to two decimals before the rounding algorithm begins -
      // `var inputValue = numberFormat(arguments.value, "0.00");`. There are therefore TWO
      // quantization points on this path, not one: that one, inside the collaborator, and
      // [model/service/PromotionService.cfc:L1017] on the way out of this function. They are
      // deliberately NOT collapsed. The net price is quantized before it is rounded, and the
      // derived discount is quantized again after it is computed, so a full-precision net price and
      // a two-decimal one can produce the same rounded price point while the derived discounts
      // differ in the digits [L1017] then discards.
      //
      // Note also that the collaborator's declared return type is `numeric` while the `roundValue`
      // it delegates to declares `string` [model/service/RoundingRuleService.cfc:L84, L88]. That
      // crossing is owned by `src/services/roundingRuleService.ts`, which converts back to `Money`,
      // so this module receives a `Money` and does NOT re-implement the rounding algorithm.

      // [L1006] The named-argument form `roundValueByRoundingRule(value=..., roundingRule=...)`,
      // in the declared parameter order.
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
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the clamp GATES ON
    // `discountAmountPreRounding` but ASSIGNS TO `discountAmount`, so it tests one value and
    // overwrites a different one. Two independent wrong behaviours follow, in OPPOSITE directions.
    // (a) FALSE POSITIVE: when a rounding rule fired and the pre-rounding value exceeded the
    // original amount, this assignment DISCARDS the entire L1006/L1007 rounding computation and
    // substitutes `originalAmount` - the rounded price point is thrown away and the customer pays
    // nothing. (b) FALSE NEGATIVE: when `roundedFinalAmount` comes back NEGATIVE - which the
    // rounding algorithm can produce, since its candidate arithmetic is unsigned-agnostic - the
    // discount derived at L1007 EXCEEDS `originalAmount`, and the clamp does not catch it because
    // it is testing the wrong variable. In that case the comment above is simply not true of the
    // code beneath it.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The compared variable is NOT aligned with the assigned one, no second clamp is added, and
    // nothing is reordered. Aligning them would change the money paid out in both directions at
    // once, which is exactly why must-preserve area #1 covers this line.
    if (discountAmountPreRounding.isGreaterThan(originalAmount)) {
      // [L1014] The third assignment site of register entry 13.
      discountAmount = originalAmount;
    }

    // CFML parity [model/service/PromotionService.cfc:L1017]: `return numberFormat(discountAmount,
    // "0.00");` is LOAD-BEARING LOSSY QUANTIZATION, not cosmetic formatting. It is the last
    // statement of the function, it discards every digit past the second decimal, and the five
    // call sites consume the quantized value - L244 and L249 feed it into a descending insert-sort
    // and a `> 0` gate, so the digits dropped here decide which discount wins.
    //
    // ★ THE LEGACY DECLARES `returntype="numeric"` WHILE `numberFormat` RETURNS A STRING. CFML
    // coerces silently across that boundary; this port does not, so the crossing is made explicit
    // in two named steps rather than hidden in one expression:
    //   1. Quantize. `numberFormat(...)` is called by name, with the mask `'0.00'` written out, so
    //      the line diffs directly against L1017. Its result is a `DecimalString` - the branded
    //      type imported from `src/lib/cfml/numberFormat.ts` and never redeclared here. The value
    //      handed in is `toDecimalString()`, the FULL-PRECISION rendering, so nothing is rounded
    //      before the mask is applied and the mask sees exactly what the arithmetic produced.
    //   2. Re-enter the money surface. The mapped return type is `Money`, and
    //      `Money.fromDecimalString` is its only construction path.
    //
    // JUDGMENT CALL: `Money.toFixed2()` is the one-call equivalent - it delegates wholesale to the
    // same `numberFormat` mask and returns the same `DecimalString`. The explicit two-step is
    // preferred anyway, on reviewability grounds: this is the single most consequential line in the
    // file, the acceptance contract is a method-by-method comparison against the legacy source, and
    // a reviewer checking L1017 should find `numberFormat` and `'0.00'` written here rather than
    // have to open `money.ts` to confirm that a differently-named method applies the right mask.
    // Both routes compute the identical value.
    const quantizedDiscountAmount: DecimalString = numberFormat(
      discountAmount.toDecimalString(),
      '0.00',
    );

    return Money.fromDecimalString(quantizedDiscountAmount);
  }
}
