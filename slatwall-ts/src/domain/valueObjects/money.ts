// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/services/promotion/rewardUsageLedger.ts  promotion decomposition module
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - Money: THE SOLE ARITHMETIC SURFACE OF THE TARGET
//
// WHAT THIS FILE IS
// Every monetary calculation in the port passes through this one value object:
// every discount, every price-group rate, every currency-conversion result, and
// every `big_decimal` column read out of MySQL. It replaces three CFML
// mechanisms at once - `precisionEvaluate`, `numberFormat` and the
// `big_decimal` column type - and it is the reason no floating-point operation
// on a monetary value appears anywhere else in the target.
//
// AUTHORITY
// AAP 0.4.1, the "Value Objects, Views, and Engine Types" row for this path:
// CREATE, sourced from the `precisionEvaluate` sites in
// [model/service/PromotionService.cfc], described as a "New abstraction
// consolidating all currency arithmetic; wraps an arbitrary-precision decimal;
// exposes times, minus, plus, dividedBy, toFixed2, and comparison operators
// only". AAP 0.3.1 names it "the ONLY arithmetic surface"; AAP 0.3.3 lists it
// under "Value Object for money"; AAP 0.8.3 states the standard as "A single
// arithmetic surface". Transformation rule T4 is the rule it discharges: "CFML
// numeric duality and `precisionEvaluate`" becomes "A `Money` value object over
// an arbitrary-precision decimal library, as the sole arithmetic surface".
//
// WHY ARBITRARY PRECISION - A CORRECTNESS REQUIREMENT, NOTHING ELSE
// IEEE-754 doubles cannot reproduce CFML currency arithmetic without drift, and
// legacy money is persisted in `big_decimal` columns - see the schema-continuity
// section below. That is the whole justification. No non-functional requirement
// of any kind is asserted anywhere in this file, because none exists in the
// source.
//
// SUBSTRATE - THIS FILE COMPOSES `precision.ts` AND IMPORTS NO `decimal.js`
// `src/lib/cfml/precision.ts` is the arithmetic SUBSTRATE; this file is the
// SURFACE.
//
// THE PERMITTED DIRECT-IMPORT SET, STATED EXACTLY. Exactly TWO modules in the
// whole subtree import `decimal.js` directly, and NEITHER of them is this one:
//
//   * `src/lib/cfml/precision.ts`    - the arithmetic substrate;
//   * `src/lib/cfml/numberFormat.ts` - the stringification and presentation
//                                      substrate.
//
// Verified by direct search rather than asserted: those two files hold the only
// two `import { Decimal } from 'decimal.js';` STATEMENTS anywhere under `src/`
// (a plain text search also matches this very sentence and its counterpart in
// `precision.ts`, so count import statements, not string occurrences). THIS FILE
// IMPORTS NEITHER `Decimal` NOR `decimal.js` - it is a CONSUMER of the substrates
// and nothing more. Every operation below routes through their primitives, so
// the absence of a `decimal.js` import here is a deliberate choice and not an
// oversight. One substrate per concern, used uniformly - no operation below
// reaches past either of them.
//
// The internal representation is a plain decimal STRING, never a decimal
// instance. That makes the "never expose the underlying decimal" gate
// STRUCTURAL rather than conventional: this file never names the substrate's
// value type at all, so there is nothing to leak through a getter, a property,
// a return value or a re-export.
//
// THE ELEVEN VERIFIED IN-SCOPE `precisionEvaluate` SITES
// Repo-wide there are 104 `precisionEvaluate` occurrences across 18 files;
// exactly eleven are in scope, and all eleven were re-verified against the
// source while authoring this file. [model/service/RoundingRuleService.cfc]
// contains ZERO of them - verified by direct count - because its arithmetic is
// decimal-STRING manipulation rather than precise evaluation.
//
//   [model/service/PromotionService.cfc:L150]   (a x b) - (c x b)
//   [model/service/PromotionService.cfc:L252]   a - (b - c)      (published L248)
//   [model/service/PromotionService.cfc:L299]   a / b            (unguarded divisor)
//   [model/service/PromotionService.cfc:L486]   (a / b) x (b - c)
//   [model/service/PromotionService.cfc:L990]   a x b
//   [model/service/PromotionService.cfc:L995]   a x (b / 100)
//   [model/service/PromotionService.cfc:L1001]  (a - b) x c
//   [model/service/PromotionService.cfc:L1006]  a - b            (published: omitted)
//   [model/service/PromotionService.cfc:L1007]  a - b
//   [model/service/PriceGroupService.cfc:L323]  a - (a x (b / 100))  (published L322)
//   [model/service/PriceGroupService.cfc:L331]  a - b                (published L328)
//
// LOCATOR CORRECTIONS, RECORDED SO A REVIEWER CAN RECONCILE THEM
// The published citations carry four discrepancies. Each was settled by reading
// the source, and the source is the authority:
//   * L252, published as L248. L248 is a comment; L249 is
//     `var originalDiscountAmount = getDiscountAmount(...)`; the
//     `precisionEvaluate` call is on L252.
//   * [model/service/PromotionService.cfc:L1006] was omitted from the published
//     list entirely, and it is the semantically most important of the eleven -
//     see the first of the two semantic notes below.
//   * [model/service/PriceGroupService.cfc:L323], published as L322. L322 is
//     literally `case "percentageOff" :`.
//   * [model/service/PriceGroupService.cfc:L331], published as L328. L328 is the
//     closing brace of the rounding-rule `if` block spanning L326-L328.
// A fifth, for the presentation step rather than for arithmetic:
//   * [model/service/PriceGroupService.cfc:L339] holds
//     `return numberFormat(newPrice, "0.00");`, published as L337.
//
// TWO SEMANTIC NOTES EVERY CONSUMER WILL OTHERWISE GET WRONG
//
// 1. THE ROUNDING RULE IS APPLIED TO THE NET PRICE, NOT TO THE DISCOUNT.
//    At [model/service/PromotionService.cfc:L1006] the value handed to
//    `roundValueByRoundingRule` is `originalAmount - discountAmountPreRounding`,
//    which is what the customer would PAY. L1007 then derives the discount back
//    out as `originalAmount - roundedFinalAmount`. So the rounding rule shapes
//    the FINAL PRICE and the discount is a residual. Any consumer reasoning
//    about "rounding the discount" is reasoning wrongly.
//
// 2. CFML'S DECLARED-NUMERIC / RETURNS-STRING DUALITY IS NOT PAPERED OVER.
//    [model/service/PromotionService.cfc:L1017] is
//    `return numberFormat(discountAmount, "0.00");` inside a function declared
//    `private numeric function` (L987). The same mismatch appears at
//    [model/service/PriceGroupService.cfc:L339] inside a
//    `public numeric function` (L316), and at
//    [model/service/RoundingRuleService.cfc:L88], where `roundValue` declares
//    `string` while both of its callers (L79, L84) declare `numeric`. CFML
//    coerces silently; this port does not. `toFixed2` returns a STRING and
//    `fromDecimalString` takes one, so every crossing is an explicit call. That
//    is also exactly why `DecimalString` is a branded type in
//    `numberFormat.ts` - and it is imported from there, never redeclared here.
//
// THE OPERATION SURFACE IS CLOSED
// Every operation traces to a live legacy call site, and nothing else is
// offered. There is deliberately no `negate`, `abs`, `min`, `max`, `sum`,
// `average`, `round`, `floor`, `ceil`, `percentOf`, `allocate`, `split`,
// `distribute`, `power`, `sqrt` or remainder operation, no fluent builder, no
// currency-aware formatting, and no `toNumber` / `valueOf` / `toJSON` escape
// hatch. If a consumer genuinely needs another operation it is added THEN, with
// the locator that demands it - not now, speculatively.
//
// TWO EGRESS METHODS, AND THEY ARE NOT INTERCHANGEABLE
// The AAP row quoted above names `toFixed2` as the presentation egress. It is
// NOT, however, the persistence egress, and using it as one would be a defect
// rather than an economy:
//   * `toFixed2()` applies CFML's `"0.00"` mask and therefore ROUNDS to two
//     decimals. It reproduces [model/service/PromotionService.cfc:L1017] and
//     [model/service/PriceGroupService.cfc:L339], both of which are the last
//     line of their function - presentation of a return value.
//   * `toDecimalString()` imposes NO scale and renders every significant digit.
//     It is what a `big_decimal` column gets, because a `big_decimal` column is
//     by definition one that declines to round on the caller's behalf, and the
//     `Sw*` schema is preserved unchanged (AAP 0.8.1). Writing `'52.47'` where
//     the value is `52.47375` would narrow the schema.
// Both are explicitly named calls; neither is reachable by coercion. The four
// persisted columns they serve are enumerated in the schema-continuity section
// below.
//
// `plus` deserves its own note because it has exactly ONE justification.
// [model/service/PromotionService.cfc:L417] is
// `var totalDiscountableAmount = arguments.order.getSubtotalAfterItemDiscounts()
// + arguments.order.getFulfillmentChargeAfterDiscountTotal();` - a plain `+`
// with NO `precisionEvaluate` around it, and the only addition of two monetary
// values in the entire in-scope slice. (The published quote of this line names
// the variable `orderDiscountableAmount`; the source reads
// `totalDiscountableAmount`. The operation, which is what matters here, is
// confirmed.)
//
// THE ZERO SEEDS, AND THE TWO DEFAULTLESS SWITCHES
// `getDiscountAmount` opens with two accumulators seeded to zero -
// `var discountAmountPreRounding = 0;`
// [model/service/PromotionService.cfc:L988] and
// `var roundedFinalAmount = 0;` [model/service/PromotionService.cfc:L989] - and
// its `switch(reward.getAmountType())` has NO `default:` case
// [model/service/PromotionService.cfc:L993-L1003]. An unrecognised amount type
// therefore leaves the pre-rounding accumulator at zero and falls straight
// through. That, and only that, is what `Money.zero` exists for.
//
// The slice's SECOND defaultless switch behaves differently and must not be
// conflated with it: `calculateSkuPriceBasedOnPriceGroupRate` seeds `newPrice`
// with the PASSTHROUGH `arguments.sku.getPrice()`
// [model/service/PriceGroupService.cfc:L319] and its switch also has no
// `default:` [model/service/PriceGroupService.cfc:L321-L336], so an
// unrecognised amount type falls through to the sku's own price rather than to
// zero. `Money.zero` serves the promotion seeds only. See the prohibition
// documented on the declaration itself.
//
// THE REFERENCE CALCULATION - THE ACCEPTANCE GATE FOR THIS FILE
// Verified during planning against the pinned dependency set, and reproduced
// exactly by the implementation below:
//
//   unit price                                    19.99
//   quantity                                          3
//   extended   = 19.99 x 3                        59.97
//   discount   = 59.97 x (12.5 / 100)             7.49625
//   net        = 59.97 - 7.49625                  52.47375
//   toFixed2() of the net                         '52.47'
//
// All five intermediate values must match with no IEEE-754 drift. The final
// step is the behaviour of `numberFormat(discountAmount, "0.00")` at
// [model/service/PromotionService.cfc:L1017]. Note that
// `src/lib/cfml/precision.ts` stops its own reference assertion at
// `'52.47375'`: the two-decimal step belongs to `numberFormat.ts`, which is why
// `toFixed2` delegates rather than re-implementing it.
//
// SCHEMA CONTINUITY - THE PERSISTED COLUMNS THIS FILE SERVES
// The `Sw*` tables are unchanged by this migration. Four `big_decimal` columns
// are read and written through `Money`:
//   * `SwPromotionApplied.discountAmount` [model/entity/PromotionApplied.cfc:L53]
//     (table declared at [model/entity/PromotionApplied.cfc:L49])
//   * `SwSkuCurrency.price`        [model/entity/SkuCurrency.cfc:L53] - NO default
//   * `SwSkuCurrency.renewalPrice` [model/entity/SkuCurrency.cfc:L54] - default "0"
//   * `SwSkuCurrency.listPrice`    [model/entity/SkuCurrency.cfc:L55] - default "0"
// `price` having no default while the other two default to "0" is exactly why
// the currency cascade guards the latter two with `!isNull` and sets `price`
// unconditionally. A column's string form is therefore constructed straight
// into a `Money` with no loss: the value keeps every significant digit it
// arrived with.
//
// `Money` IS DELIBERATELY CURRENCY-AGNOSTIC. The legacy arithmetic carries no
// currency operand, and `SwPromotionApplied` stores `discountAmount`
// [model/entity/PromotionApplied.cfc:L53] and `currencyCode`
// [model/entity/PromotionApplied.cfc:L55] as SEPARATE columns. So this file does
// not import `currencyCode.ts` and there is no money-with-currency type. The
// currency a value is denominated in is carried by the surrounding entity.
//
// WHAT THIS FILE DOES NOT OWN
// This folder owns ZERO numbered entries from the legacy defect register and
// ZERO of the migration's three deliberate divergences, so no preserved-defect
// marker appears anywhere below. One pointer, as prose: routing all arithmetic
// through `Money` is what closes the raw floating-point gap in the `amountOff`
// branch at [model/service/PromotionService.cfc:L998] (register entry 12) and
// what makes the un-scoped `discountAmount` assignment at
// [model/service/PromotionService.cfc:L1007, L1009] (register entry 13)
// function-local - and BOTH of those divergences are owned, spent and annotated
// in `src/services`, not here. Register entries 8 and 14, and the `roundValue`
// algorithm together with its ten measured characterization outputs, likewise
// belong to `src/services`.
//
// No legacy TODO falls inside this file. The one in the in-scope slice is the
// return-and-exchange no-op at [model/service/PromotionService.cfc:L542-L544]
// carrying `issue #1766`, and it belongs to the promotion engine.
//
// This file contains no query of any kind, so the parameterized-SQL obligation
// rests wholly with `src/repositories/mysql`. It reads no environment and holds
// no credential, host, DSN or connection string; configuration belongs to
// `src/lib/config.ts` and a value object must never read it. It does not log:
// `src/lib/logger.ts` is deliberately not imported.
//
// TESTS
// Coverage for this file lives at
// `slatwall-ts/tests/unit/domain/valueObjects/money.test.ts`, is OWNED BY A
// DIFFERENT AGENT, and is not authored from here. All of it is NET-NEW and must
// be labelled as such rather than presented as parity: no legacy test under
// `meta/tests` touches any value object. Only
// `meta/tests/unit/entity/BrandTest.cfc` and
// `meta/tests/unit/entity/ProductTest.cfc` are extended anywhere in this
// migration, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an
// empty stub contributing zero coverage. The reference calculation above is
// stated in full so the test author has the expected values to hand.
// ---------------------------------------------------------------------------

// The arithmetic substrate. `precision.ts` owns the configured decimal
// constructor, the finiteness boundary and the zero-divisor refusal; this file
// owns the monetary surface over it. Every primitive imported here is used
// below - `noUnusedLocals` would reject any that were not.
//
// `toDecimalString` is aliased on BOTH imports because the two dependencies
// export that same name with two DIFFERENT meanings, and conflating them would
// be a real defect rather than a stylistic slip:
//   * `precision.toDecimalString` RENDERS a computed value as a plain decimal
//     numeral, imposing no scale.
//   * `numberFormat.toDecimalString` VALIDATES a candidate string and brands it
//     as a `DecimalString`, throwing when it is not a plain decimal numeral.
import {
  add,
  compare,
  divide,
  equals,
  fromInteger,
  isGreaterThan,
  isLessThan,
  multiply,
  subtract,
  toDecimalString as renderPlainDecimal,
} from '../../lib/cfml/precision.js';
import {
  numberFormat,
  toDecimalString as assertPlainDecimalNumeral,
} from '../../lib/cfml/numberFormat.js';
import type { DecimalString } from '../../lib/cfml/numberFormat.js';

/**
 * What every monetary operand on {@link Money} accepts: a `Money`, or a plain
 * decimal numeral as a `string`.
 *
 * `number` IS DELIBERATELY NOT A MEMBER. An IEEE-754 double cannot represent
 * most decimal fractions exactly, and admitting one for a price, an amount or a
 * discount is precisely how drift would enter a money path - the whole reason
 * this file exists. `src/lib/cfml/precision.ts` makes the same prohibition
 * structural in its own `PreciseInput`, and this type observes it. A caller
 * holding a `number` for a monetary value will not compile, and that is the
 * intended outcome rather than an inconvenience. There is deliberately no
 * `Money.fromNumber`.
 *
 * A `DecimalString` - the branded type `numberFormat.ts` declares, and what the
 * target equivalent of `roundValue`
 * [model/service/RoundingRuleService.cfc:L88] returns - is accepted here as a
 * first-class input with no conversion, because the brand is a REFINEMENT of
 * `string` and so is already assignable to it. It is not listed as a separate
 * union constituent for exactly that reason: `string | DecimalString` reduces to
 * `string`, and writing it out is a redundant constituent that the lint gate
 * rejects outright. The brand is used where it is load-bearing instead - as the
 * return type of {@link Money.toFixed2}.
 *
 * A string operand is validated on the way in and a malformed one throws; see
 * {@link Money.fromDecimalString}.
 */
export type MoneyInput = Money | string;

/**
 * An immutable monetary quantity, and the only place money arithmetic happens.
 *
 * IMMUTABLE BY CONSTRUCTION. The single field is `readonly`, the constructor is
 * private so instances can only be built through the named factory below, every
 * operation returns a NEW instance, and no operation mutates its receiver or its
 * argument. `Object.freeze` is applied in the constructor, so the guarantee is
 * mechanical rather than a convention - including for {@link Money.zero}. The
 * read-only order views in `src/domain/views` hold `Money` values and never
 * mutate them; this is what makes that safe.
 *
 * The private constructor also makes the class effectively final: `extends Money`
 * cannot compile, so no subclass can add a mutable field behind the frozen one
 * or widen the closed operation surface.
 *
 * NO SCALE IS IMPOSED, EVER. The internal value keeps whatever precision the
 * arithmetic produced. Two-decimal presentation happens only where a caller asks
 * for it, through {@link Money.toFixed2}, mirroring
 * [model/service/PromotionService.cfc:L1017] and
 * [model/service/PriceGroupService.cfc:L339] sitting at the very END of their
 * functions rather than inside the calculation.
 */
export class Money {
  /**
   * A plain decimal numeral - the value's entire state.
   *
   * JUDGMENT CALL: the value is held as a STRING rather than as a decimal
   * instance. Two reasons, and neither is about the shape of the code:
   *
   *   1. It makes the substrate unleakable. Holding no decimal instance means
   *      this file never names the substrate's value type, so there is nothing
   *      for a getter, a property, a return value or a re-export to expose. The
   *      exclusivity ruling is satisfied structurally rather than by review.
   *   2. It is lossless in both directions. `precision.toDecimalString` renders
   *      in plain notation with as many digits as necessary, imposing no scale,
   *      and re-reading such a numeral reconstructs the same value exactly - the
   *      substrate resolves every operation to a declared significant-digit
   *      count, so a rendered result always fits. A `big_decimal` column's
   *      string form therefore round-trips through here unchanged.
   *
   * One consequence worth stating plainly, because it is a property of decimal
   * VALUES and not of this file: a value carries no trailing-zero scale of its
   * own. A value entering as `'19.90'` keeps that exact numeral, but a computed
   * result renders as `'19.9'`, and the two compare EQUAL. Presentation restores
   * two decimals; see {@link Money.toFixed2}.
   */
  private readonly amount: string;

  /**
   * Not reachable from outside. Use {@link Money.fromDecimalString}.
   *
   * PRECONDITION: `amount` is already a finite plain decimal numeral. Only two
   * kinds of value reach here, and both satisfy it - a numeral validated by
   * {@link Money.fromDecimalString}, and a result rendered by the substrate,
   * which refuses to return a non-finite value from any operation. The
   * constructor therefore does not re-validate what is already guaranteed, and
   * that is a deliberate division of responsibility rather than an omission.
   */
  private constructor(amount: string) {
    this.amount = amount;
    Object.freeze(this);
  }

  /**
   * The one way to build a `Money` from outside this class.
   *
   * This is the primary construction path because it is how monetary values
   * actually arrive: `big_decimal` columns come back from the driver in their
   * decimal string form, and the target equivalent of `roundValue`
   * [model/service/RoundingRuleService.cfc:L88] returns a `DecimalString`, which
   * is a `string` and so is accepted here directly.
   *
   * MALFORMED INPUT THROWS. `''`, `'abc'`, `'1,234.50'`, `'12.'`, `'NaN'`,
   * `'Infinity'`, `'-Infinity'`, exponential notation and anything with
   * surrounding whitespace are all rejected. Silent coercion to zero is the
   * failure mode that would sell products for free, so there is no tolerant
   * parse and no fallback of any kind.
   *
   * JUDGMENT CALL: validation is delegated to the validating brander in
   * `numberFormat.ts` and the error it raises is allowed to propagate unchanged,
   * rather than being wrapped in an error class declared here. That module's
   * error type is exported precisely so a consumer can discriminate malformed
   * input from any other failure, it already carries a stable name, and its
   * rejection set is exactly the one required. Declaring a second, parallel
   * error type for the same condition would give consumers two things to catch
   * for one failure. Nothing is caught anywhere in this file, which is also what
   * lets the substrate's zero-divisor refusal propagate untouched - see
   * {@link Money.dividedBy}.
   *
   * @param value a plain decimal numeral, optionally signed. Never a `number`.
   * @returns an immutable `Money` holding exactly that value.
   * @throws the `numberFormat.ts` decimal-numeral error if `value` is not a
   *   finite plain decimal numeral.
   */
  public static fromDecimalString(value: string): Money {
    return new Money(assertPlainDecimalNumeral(value));
  }

  /**
   * Zero.
   *
   * CFML parity [model/service/PromotionService.cfc:L988, L989]: the two
   * accumulators of `getDiscountAmount` are seeded with `var
   * discountAmountPreRounding = 0;` and `var roundedFinalAmount = 0;`, and the
   * `switch(reward.getAmountType())` that follows has NO `default:` case
   * [model/service/PromotionService.cfc:L993-L1003]. An unrecognised amount type
   * leaves the pre-rounding accumulator at zero and falls through. Reproducing
   * those seeds, and that fall-through, is the ENTIRE purpose of this constant.
   *
   * PROHIBITED USES - READ BEFORE REACHING FOR THIS.
   * This is NOT a substitute for an absent price, and no method on `Money` may
   * ever return it as a fallback, a default or an error result. Concretely
   * forbidden: `Money.fromDecimalString(x) ?? Money.zero`, an `orZero()` helper,
   * and any parameter defaulting to `Money.zero`.
   *
   * The reason is the highest-consequence parity check in the whole migration.
   * Absence is modelled as `undefined` at the entity accessor level:
   * `getPriceByCurrencyCode` has no `else` and no fallback
   * [model/entity/Sku.cfc:L269-L273], while `getListPriceByCurrencyCode`
   * [model/entity/Sku.cfc:L275-L279] and `getRenewalPriceByCurrencyCode`
   * [model/entity/Sku.cfc:L281-L285] each perform a SECOND key-existence test on
   * the inner sub-key and likewise return null. Substituting `0` for those nulls
   * would silently sell products for free.
   *
   * Note the asymmetry with the slice's other defaultless switch, which falls
   * through to a PASSTHROUGH price rather than to zero
   * [model/service/PriceGroupService.cfc:L319, L321-L336]. This constant serves
   * the promotion seeds only; do not generalise it.
   *
   * JUDGMENT CALL: a single shared instance rather than a factory returning a
   * fresh zero each time. The justification is immutability and identity - every
   * instance is frozen in the constructor, so one shared value cannot be
   * tampered with and reads identically everywhere, and a constant that is
   * `===`-identical to itself is easier to reason about at a call site. It is
   * built through the public factory so it is subject to exactly the same
   * validation as every other value, with no special-cased construction path.
   */
  public static readonly zero: Money = Money.fromDecimalString('0');

  /**
   * Multiplies this value by a monetary quantity or by a non-monetary integer
   * count, and returns the product as a new `Money`.
   *
   * CFML parity [model/service/PromotionService.cfc:L990]:
   *   `precisionEvaluate('arguments.price * arguments.quantity')` - the plain
   *   `a x b` at the head of `getDiscountAmount`. The multiplier here is an
   *   integer COUNT, which is why this method admits one.
   * CFML parity [model/service/PromotionService.cfc:L995]:
   *   `precisionEvaluate('originalAmount * (reward.getAmount()/100)')` -
   *   `a x (b / 100)`. Composed as `originalAmount.times(rewardAmount.dividedBy(100))`,
   *   so here the multiplier is a MONETARY quantity.
   * CFML parity [model/service/PromotionService.cfc:L150]:
   *   `precisionEvaluate('(orderItem.getSku().getPrice() * orderItem.getQuantity())
   *   - (salePriceDetails.salePrice * orderItem.getQuantity())')` - two
   *   multiplications by the same quantity, composed with {@link Money.minus} to
   *   form `(a x b) - (c x b)`.
   * CFML parity [model/service/PromotionService.cfc:L1001]:
   *   `precisionEvaluate('(arguments.price - reward.getAmount()) * arguments.quantity')`
   *   - `(a - b) x c`, subtraction first, then this.
   * CFML parity [model/service/PromotionService.cfc:L486]:
   *   `precisionEvaluate('(orderItemQulifiedDiscounts[ orderItemID ][y].discountAmount
   *   / thisDiscountQuantity) * (thisDiscountQuantity - needToRemove)')` -
   *   `(a / b) x (b - c)`, division first. Note that `(b - c)` subtracts one
   *   integer count from another: that is quantity arithmetic, not money
   *   arithmetic, and the caller performs it before handing the result here.
   * CFML parity [model/service/PriceGroupService.cfc:L323]:
   *   the inner `arguments.sku.getPrice() * (arguments.priceGroupRate.getAmount() / 100)`
   *   term of `a - (a x (b / 100))`.
   *
   * @param multiplier a monetary quantity, or a non-monetary integer count.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the multiplier is a malformed numeral, or a `number` that is not a
   *   safe integer - see {@link Money.toDecimalOperand}.
   */
  public times(multiplier: MoneyInput | number): Money {
    return new Money(renderPlainDecimal(multiply(this.amount, Money.toDecimalOperand(multiplier))));
  }

  /**
   * Divides this value by a monetary quantity or by a non-monetary integer
   * count, and returns the quotient as a new `Money`.
   *
   * CFML parity [model/service/PromotionService.cfc:L299]:
   *   `precisionEvaluate('discountAmount / discountQuantity')` - the
   *   discount-per-use value that the reward-usage ledger insert-sorts on. The
   *   divisor is an integer count.
   * CFML parity [model/service/PromotionService.cfc:L995]:
   *   the `(reward.getAmount()/100)` term of `a x (b / 100)`. The divisor is the
   *   literal 100.
   * CFML parity [model/service/PromotionService.cfc:L486]:
   *   the leading `(... .discountAmount / thisDiscountQuantity)` term of
   *   `(a / b) x (b - c)`.
   * CFML parity [model/service/PriceGroupService.cfc:L323]:
   *   the `(arguments.priceGroupRate.getAmount() / 100)` term of
   *   `a - (a x (b / 100))`.
   *
   * Every one of those four legacy divisors is in fact a non-monetary integer -
   * three quantities and the literal 100. The signature nevertheless mirrors
   * {@link Money.times} so that the two scaling operations present one
   * consistent operand rule rather than two subtly different ones.
   *
   * JUDGMENT CALL - A ZERO DIVISOR THROWS, AND THAT THROW IS NOT CAUGHT HERE.
   * The legacy site at [model/service/PromotionService.cfc:L299] applies no zero
   * check to its divisor. The substrate refuses a zero divisor outright, and this
   * method lets that refusal propagate unchanged: it does not catch it, does not
   * return zero, and does not return `undefined`. Returning zero would silently
   * invent money, and returning `undefined` would push a null check onto every
   * caller of every operation. Whether the CALL SITE at L299 wants a guard, and
   * what that guard should do, is a decision owned by
   * `src/services/promotion/rewardUsageLedger.ts` (planned) - not by this file.
   *
   * A non-terminating quotient does NOT throw. It is resolved at the significant
   * digit count and rounding mode the substrate declares, which is why that
   * decision is declared there once rather than restated here.
   *
   * @param divisor a monetary quantity, or a non-monetary integer count.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the divisor is zero, is a malformed numeral, or is a `number` that
   *   is not a safe integer.
   */
  public dividedBy(divisor: MoneyInput | number): Money {
    return new Money(renderPlainDecimal(divide(this.amount, Money.toDecimalOperand(divisor))));
  }

  /**
   * Subtracts a monetary quantity from this value and returns the difference as
   * a new `Money`.
   *
   * CFML parity [model/service/PromotionService.cfc:L150]:
   *   the outer subtraction of `(a x b) - (c x b)`.
   * CFML parity [model/service/PromotionService.cfc:L252]:
   *   `precisionEvaluate('originalDiscountAmount - (orderItem.getExtendedSkuPrice()
   *   - orderItem.getExtendedPrice())')` - `a - (b - c)`, two nested
   *   subtractions. Published as L248, which is a comment; the call is on L252.
   * CFML parity [model/service/PromotionService.cfc:L1001]:
   *   the `(arguments.price - reward.getAmount())` term of `(a - b) x c`.
   * CFML parity [model/service/PromotionService.cfc:L1006]:
   *   `precisionEvaluate('originalAmount - discountAmountPreRounding')` - the NET
   *   PRICE handed to the rounding rule. Omitted from the published citation
   *   list, and the semantically most important of the eleven; see the second
   *   header section for why "rounding the discount" is the wrong mental model.
   * CFML parity [model/service/PromotionService.cfc:L1007]:
   *   `precisionEvaluate('originalAmount - roundedFinalAmount')` - the discount
   *   derived back out of the rounded net price.
   * CFML parity [model/service/PriceGroupService.cfc:L323]:
   *   the outer subtraction of `a - (a x (b / 100))`.
   * CFML parity [model/service/PriceGroupService.cfc:L331]:
   *   `precisionEvaluate('arguments.sku.getPrice() - arguments.priceGroupRate.getAmount()')`
   *   - the plain `a - b` of the amount-off rate. Published as L328, which is a
   *   closing brace.
   *
   * The operand is MONETARY ONLY - a count may scale money but may never be
   * subtracted from it. See {@link Money.toDecimalOperand} for the rule and its
   * one legacy counter-example.
   *
   * @param subtrahend the monetary quantity to subtract.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the subtrahend is a malformed numeral.
   */
  public minus(subtrahend: MoneyInput): Money {
    return new Money(renderPlainDecimal(subtract(this.amount, Money.toDecimalOperand(subtrahend))));
  }

  /**
   * Adds a monetary quantity to this value and returns the sum as a new `Money`.
   *
   * CFML parity [model/service/PromotionService.cfc:L417]:
   *   `var totalDiscountableAmount = arguments.order.getSubtotalAfterItemDiscounts()
   *   + arguments.order.getFulfillmentChargeAfterDiscountTotal();`
   *
   * THAT IS THE ONLY JUSTIFICATION FOR THIS METHOD, and it is the only addition
   * of two monetary values in the whole in-scope slice. Note that the legacy line
   * uses a PLAIN `+` with no `precisionEvaluate` around it - it is the one money
   * addition the legacy code performs without the precision guard - so routing it
   * through the substrate here is a faithful re-expression of the operation and a
   * uniform application of the single-arithmetic-surface standard.
   *
   * This method exists because L417 needs it, not because a value object
   * "ought to" support addition. It is deliberately the narrowest method on the
   * surface.
   *
   * The operand is MONETARY ONLY, for the same reason as {@link Money.minus}.
   *
   * @param addend the monetary quantity to add.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the addend is a malformed numeral.
   */
  public plus(addend: MoneyInput): Money {
    return new Money(renderPlainDecimal(add(this.amount, Money.toDecimalOperand(addend))));
  }

  // -------------------------------------------------------------------------
  // Comparison
  //
  // EVERY comparison below is BY DECIMAL VALUE and applies NO ROUNDING OF ANY
  // KIND. That is load-bearing, not pedantry, and the reason is that the
  // promotion engine sorts on these results in two OPPOSITE directions at once:
  //
  //   * `orderItemQulifiedDiscounts` is insert-sorted DESCENDING by discount
  //     amount [model/service/PromotionService.cfc:L266-L294], and only index
  //     `[1]` - the single largest discount - is ever applied
  //     [model/service/PromotionService.cfc:L524-L537].
  //   * `orderItemsUsage` is insert-sorted ASCENDING by discount-per-use value
  //     [model/service/PromotionService.cfc:L301-L329], so the cheapest-per-use
  //     entries are stripped first when a reward is over-used.
  //
  // Both orderings decide which discount a customer actually receives. A
  // comparison that quietly rounded to two decimals would collapse distinct
  // values into ties and change which discount wins, so no comparison here
  // presents, formats or rounds anything. Presentation is a separate, explicit
  // step - see {@link Money.toFixed2}.
  //
  // Comparing by VALUE also means scale is irrelevant: a value entering as
  // `'19.90'` and a computed `'19.9'` compare EQUAL, which is correct. A lexical
  // string comparison of the same operands would call them different, and would
  // call `'9.99'` greater than `'12.35'`. Both answers would change money.
  // -------------------------------------------------------------------------

  /**
   * Orders this value against another: `-1` when this one is smaller, `1` when
   * it is larger, `0` when the two are equal in value.
   *
   * This is the three-way form the two insertion sorts described above want, and
   * it is total: both operands are finite by construction, so `0` genuinely means
   * equal rather than incomparable.
   *
   * CFML parity [model/service/PromotionService.cfc:L271]:
   *   `if(orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ][d].discountAmount
   *   < discountAmount)` - the descending insertion test.
   * CFML parity [model/service/PromotionService.cfc:L306]:
   *   `if(promotionRewardUsageDetails[ ... ].orderItemsUsage[oiu].discountPerUseValue
   *   > discountPerUseValue)` - the ascending insertion test, running the other way.
   *
   * @param other the monetary quantity to order against.
   * @returns `-1`, `0` or `1`.
   * @throws if `other` is a malformed numeral.
   */
  public compare(other: MoneyInput): -1 | 0 | 1 {
    return compare(this.amount, Money.toDecimalOperand(other));
  }

  /**
   * True when this value is strictly greater than another.
   *
   * CFML parity [model/service/PromotionService.cfc:L257]:
   *   `if(discountAmount > 0)` - the gate deciding whether a computed discount is
   *   recorded against an order item at all. Compare against `'0'` or against
   *   {@link Money.zero}; using the constant as a COMPARAND is not the prohibited
   *   use, which is returning it as a fallback.
   * CFML parity [model/service/PromotionService.cfc:L1013]:
   *   `if(discountAmountPreRounding > originalAmount)` - the clamp that stops a
   *   discount exceeding the original amount. That clamp compares the PRE-rounding
   *   value while overwriting the POST-rounding one, which is register entry 14
   *   and is reproduced in `src/services`, not here. It is named because it is
   *   precisely why this comparison must be exact and unopinionated: the service
   *   has to be able to reproduce a defect faithfully, and it cannot do that if
   *   the comparison it builds on quietly normalises its operands.
   *
   * @param other the monetary quantity to compare against.
   * @throws if `other` is a malformed numeral.
   */
  public isGreaterThan(other: MoneyInput): boolean {
    return isGreaterThan(this.amount, Money.toDecimalOperand(other));
  }

  /**
   * True when this value is strictly less than another.
   *
   * CFML parity [model/service/PromotionService.cfc:L148]:
   *   `structKeyExists(salePriceDetails, "salePrice") && salePriceDetails.salePrice
   *   < orderItem.getSku().getPrice()` - the sale-price seeding gate. A sale price
   *   seeds a discount only when it is strictly below the sku's own price.
   * CFML parity [model/service/PromotionService.cfc:L271]:
   *   the descending insertion test, in its `<` form.
   *
   * @param other the monetary quantity to compare against.
   * @throws if `other` is a malformed numeral.
   */
  public isLessThan(other: MoneyInput): boolean {
    return isLessThan(this.amount, Money.toDecimalOperand(other));
  }

  /**
   * True when this value and another are equal IN VALUE.
   *
   * Value equality, never reference equality and never string equality. Two
   * instances built from `'19.90'` and `'19.9'` are equal, as are one built from
   * `'0'` and one built from `'0.00'`. That is the same semantic CFML applies when
   * it compares two numeric-looking strings with `==`, as the rounding algorithm
   * does at [model/service/RoundingRuleService.cfc:L120].
   *
   * @param other the monetary quantity to compare against.
   * @throws if `other` is a malformed numeral.
   */
  public equals(other: MoneyInput): boolean {
    return equals(this.amount, Money.toDecimalOperand(other));
  }

  // -------------------------------------------------------------------------
  // Presentation
  // -------------------------------------------------------------------------

  /**
   * Presents this value with exactly two decimal places.
   *
   * CFML parity [model/service/PromotionService.cfc:L1017]:
   *   `return numberFormat(discountAmount, "0.00");` - the last line of
   *   `getDiscountAmount`.
   * CFML parity [model/service/PriceGroupService.cfc:L339]:
   *   `return numberFormat(newPrice, "0.00");` - the last line of
   *   `calculateSkuPriceBasedOnPriceGroupRate`. Published as L337.
   * CFML parity [model/service/RoundingRuleService.cfc:L89]:
   *   `var inputValue = numberFormat(arguments.value, "0.00");` - the first line
   *   of the rounding algorithm, where the same mask normalises the input before
   *   the string arithmetic begins.
   *
   * THIS IS A PRESENTATION STEP, NOT A ROUNDING POLICY. It is deliberately
   * something a caller must ASK for, and it is never applied inside an arithmetic
   * operation. Note where the two legacy call sites sit: at the very END of their
   * functions, after every calculation is complete. The internal value stays at
   * full precision, exactly as the reference calculation in the header requires -
   * `52.47375` is the value, `'52.47'` is its presentation.
   *
   * The mask semantics are NOT re-implemented here; they belong to
   * `numberFormat.ts` and are delegated to wholesale. That module guarantees
   * always exactly two decimals, always at least one integer digit (`'0.42'`,
   * never `'.42'` - which is load-bearing for the rounding algorithm's prefix
   * slicing), no thousands separator, no exponential notation, a preserved
   * leading minus, half-up rounding, and negative zero normalised to `'0.00'`.
   *
   * JUDGMENT CALL: the return type is the branded `DecimalString` rather than a
   * bare `string`, because that is what `numberFormat` itself returns. Widening it
   * here would discard information the substrate already established, and would
   * force any caller that needs a `DecimalString` - such as the target equivalent
   * of `roundValue`, whose declared return type it is - to re-validate a value
   * that was validated one call ago. The brand is a refinement of `string`, so
   * every caller that only wants a `string` is unaffected.
   *
   * @returns the value presented to two decimals; a `DecimalString`, hence a
   *   `string`.
   */
  public toFixed2(): DecimalString {
    return numberFormat(this.amount, '0.00');
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Renders this value at FULL PRECISION for persistence.
   *
   * THIS, NOT {@link Money.toFixed2}, IS WHAT A `big_decimal` COLUMN GETS.
   * The distinction is the whole reason this method exists, and getting it wrong
   * silently loses money:
   *
   *   * `toFixed2()` is a PRESENTATION step. It applies CFML's `"0.00"` mask and
   *     therefore ROUNDS to two decimals. Persisting through it would write
   *     `'52.47'` where the computed value is `52.47375`, discarding three
   *     digits the arithmetic produced.
   *   * This method imposes NO scale. It renders every significant digit the
   *     value carries, in plain notation, and nothing else.
   *
   * WHY FULL PRECISION IS A SCHEMA REQUIREMENT AND NOT A PREFERENCE.
   * The columns this value is written to are declared `big_decimal` in the legacy
   * source - [model/entity/PromotionApplied.cfc:L53] declares
   * `property name="discountAmount" ormtype="big_decimal";` and
   * [model/entity/PriceGroupRate.cfc:L54] declares
   * `property name="amount" ormType="big_decimal" hb_formatType="custom";` - and
   * the target reads and writes that schema unchanged (AAP 0.8.1, schema
   * continuity). A `big_decimal` column is precisely a column that declines to
   * round on the caller's behalf, so a port that rounds before writing has
   * narrowed the schema rather than preserved it. The legacy engine never rounded
   * on the way to the database either: its `numberFormat` calls sit at the END of
   * the calculating functions - [model/service/PromotionService.cfc:L1017] and
   * [model/service/PriceGroupService.cfc:L339] - as return-value presentation.
   *
   * WHAT THE RETURN VALUE IS GUARANTEED TO BE.
   *   * Plain notation always. Never `1e21`, never `1e-9`, regardless of
   *     magnitude - guaranteed twice over by the substrate's renderer being
   *     called with no argument and by its notation thresholds being widened to
   *     the representable extremes.
   *   * No thousands separator, ever.
   *   * A preserved leading minus for a negative value.
   *   * At least one integer digit, so `'0.42'` and never `'.42'`.
   *   * Every significant digit the value carries. No scale is imposed, and none
   *     is discarded.
   *
   * JUDGMENT CALL - THE NUMERAL IS CANONICALISED, NOT ECHOED.
   * The stored numeral is rendered through the substrate rather than returned as
   * held, and that is a deliberate correction rather than an extra step. `Money`
   * is a VALUE object, so two instances that report `equals` must serialise
   * identically - otherwise persistence leaks a distinction the type says does
   * not exist. Echoing the stored numeral breaks that in two measured ways,
   * because the amount a value HOLDS depends on how it was spelled on the way in:
   *   * `fromDecimalString('.42')` holds `'.42'`, since the plain-decimal grammar
   *     accepts the leading-dot form. Echoing it would emit `'.42'` and break the
   *     integer-digit guarantee above.
   *   * `fromDecimalString('19.90')` holds `'19.90'` while the equal computed
   *     value `19.90 x 1` renders `'19.9'`. Echoing would emit two different
   *     strings for two values that compare equal.
   * Canonicalising removes both: the output depends on the VALUE alone and never
   * on its ingress spelling. The round trip is therefore value-stable rather than
   * character-stable - `'19.90'` reloads as the equal `'19.9'` - which is exactly
   * the right guarantee here, because a `DECIMAL(p, s)` column has a fixed scale
   * and stores those two identically anyway. Preserving a trailing zero would be
   * preserving a fact about a string that the schema does not record.
   *
   * JUDGMENT CALL - THE OUTPUT IS RE-VALIDATED BEFORE IT IS BRANDED.
   * The rendered numeral is passed through the validating brander from
   * `numberFormat.ts` rather than being cast. That is not defensive garnish: it is
   * the same function {@link Money.fromDecimalString} admits values through, so
   * the validation makes this method's output and that method's input provably the
   * same language, which is what makes a database round trip type-safe end to
   * end. It also means a numeral this class could not have re-read cannot escape
   * to a driver - if the substrate ever rendered something outside the plain
   * decimal grammar, this throws rather than writing it. The check is a single
   * pattern test on a short string; there is no reason to skip it.
   *
   * JUDGMENT CALL - THE RETURN TYPE IS THE BRANDED `DecimalString`.
   * Same reasoning as {@link Money.toFixed2}: the brand is a refinement of
   * `string`, so a caller that only wants a `string` is unaffected, while a
   * caller that needs a validated numeral - the repository layer binding a
   * parameter, or {@link Money.fromDecimalString} on the way back in - does not
   * have to re-validate a value that was validated one call ago.
   *
   * NOT NAMED `toString`, `valueOf` OR `toJSON`, DELIBERATELY. Those three are
   * implicit-coercion hooks, and this class publishes none of them: an accidental
   * `` `${money}` ``, `money + 1` or `JSON.stringify(money)` must not silently
   * produce a monetary numeral. Persistence is something a caller ASKS for by
   * name, exactly like presentation.
   *
   * @returns every significant digit of this value as a plain decimal numeral; a
   *   `DecimalString`, hence a `string`.
   * @throws the `numberFormat.ts` decimal-numeral error if the rendered numeral
   *   is somehow not a plain decimal numeral - unreachable through the public
   *   API, and checked rather than assumed.
   */
  public toDecimalString(): DecimalString {
    return assertPlainDecimalNumeral(renderPlainDecimal(this.amount));
  }

  // -------------------------------------------------------------------------
  // Operand normalisation
  // -------------------------------------------------------------------------

  /**
   * Reduces any accepted operand to a plain decimal numeral for the substrate.
   *
   * THE OPERAND RULE, which every method above follows: a non-monetary integer
   * COUNT may SCALE money, but may never be ADDED TO or SUBTRACTED FROM it. So
   * {@link Money.times} and {@link Money.dividedBy} admit a `number`, while
   * {@link Money.minus}, {@link Money.plus} and all four comparisons do not. That
   * matches every legacy site: the multipliers and divisors are quantities and the
   * literal 100, whereas the one legacy count subtraction -
   * `(thisDiscountQuantity - needToRemove)` inside
   * [model/service/PromotionService.cfc:L486] - subtracts one count from another
   * and never touches a monetary value, so the caller performs it before handing
   * the result to {@link Money.times}.
   *
   * JUDGMENT CALL - THE ONLY NUMERIC INGRESS, AND IT IS INTEGER-ONLY.
   * A `number` is admitted here for exactly one purpose: the non-monetary integer
   * operands the legacy arithmetic genuinely has - the quantity in
   * `price * quantity` [model/service/PromotionService.cfc:L990] and the literal
   * divisor 100 [model/service/PromotionService.cfc:L995,
   * model/service/PriceGroupService.cfc:L323]. It is routed through the
   * substrate's safe-integer entry point, which REJECTS a non-integer, a
   * non-finite value, and any magnitude beyond exact integer representation.
   * `times(0.125)` therefore fails loudly rather than admitting a double into a
   * money path. Accepting the count as a plain parameter and converting it here
   * is deliberately preferred over publishing a numeric factory on `Money`: there
   * is no `Money.fromNumber`, and no way for a caller to turn a fractional
   * `number` into a monetary value through this class at all.
   *
   * A `Money` operand contributes its own numeral directly, which needs no
   * re-validation. A `string` operand is validated on the way in, so a malformed
   * numeral handed to any operation fails at that operation rather than
   * propagating as a corrupted amount.
   *
   * @param operand a `Money`, a plain decimal numeral, or a non-monetary safe
   *   integer count.
   * @returns a plain decimal numeral the substrate accepts.
   * @throws if a `string` operand is not a finite plain decimal numeral, or a
   *   `number` operand is not a safe integer.
   */
  private static toDecimalOperand(operand: MoneyInput | number): string {
    if (operand instanceof Money) {
      return operand.amount;
    }

    if (typeof operand === 'number') {
      return renderPlainDecimal(fromInteger(operand));
    }

    return assertPlainDecimalNumeral(operand);
  }
}
