// Money - the sole arithmetic surface of the target.
//
// Every monetary calculation in the port passes through this one value object: every discount,
// every price-group rate, every currency-conversion result, and every `big_decimal` column read out
// of MySQL. It replaces three CFML mechanisms at once - `precisionEvaluate`, `numberFormat` and the
// `big_decimal` column type - and it is why no floating-point operation on a monetary value appears
// anywhere else in the target. Arbitrary precision is a correctness requirement: IEEE-754 doubles
// cannot reproduce CFML currency arithmetic without drift.
//
// Substrate: `src/lib/cfml/precision.ts` owns the arithmetic and `src/lib/cfml/numberFormat.ts`
// owns stringification; those two files hold the only `decimal.js` imports under `src/`, and this
// file imports neither. The internal representation is a plain decimal STRING rather than a decimal
// instance, which makes "never expose the underlying decimal" structural - this file never names
// the substrate's value type.
//
// THE ELEVEN IN-SCOPE `precisionEvaluate` SITES. [model/service/RoundingRuleService.cfc] contains
// none of them, because its arithmetic is decimal-STRING manipulation rather than precise
// evaluation.
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
// Four of those citations correct a published locator, each settled by reading the source: L252
// (published L248) - L248 is a comment and L249 is the `getDiscountAmount` call;
// [model/service/PromotionService.cfc:L1006], omitted from the published list entirely and the
// semantically most important of the eleven; [model/service/PriceGroupService.cfc:L323] (published
// L322) - L322 is `case "percentageOff" :`; and [model/service/PriceGroupService.cfc:L331]
// (published L328) - L328 is the closing brace of the rounding-rule `if` block spanning L326-L328.
// A fifth correction is for the presentation step: [model/service/PriceGroupService.cfc:L339] holds
// `return numberFormat(newPrice, "0.00");`, published as L337.
//
// TWO SEMANTIC NOTES EVERY CONSUMER WILL OTHERWISE GET WRONG.
//
// 1. The rounding rule is applied to the NET PRICE, not to the discount. At
//    [model/service/PromotionService.cfc:L1006] the value handed to `roundValueByRoundingRule` is
//    `originalAmount - discountAmountPreRounding`, which is what the customer would PAY, and L1007
//    derives the discount back out as `originalAmount - roundedFinalAmount`. The rule shapes the
//    final price and the discount is a residual, so any consumer reasoning about "rounding the
//    discount" is reasoning wrongly.
//
// 2. CFML's declared-numeric / returns-string duality is not papered over.
//    [model/service/PromotionService.cfc:L1017] is `return numberFormat(discountAmount, "0.00");`
//    inside a function declared `private numeric function` at L987. The same mismatch appears at
//    [model/service/PriceGroupService.cfc:L339] inside a `public numeric function` (L316), and at
//    [model/service/RoundingRuleService.cfc:L88], where `roundValue` declares `string` while both
//    of its callers (L79, L84) declare `numeric`. CFML coerces silently; this port does not.
//    `toFixed2` returns a STRING and `fromDecimalString` takes one, so every crossing is an
//    explicit call - which is also why `DecimalString` is a branded type in `numberFormat.ts`,
//    imported from there and never redeclared here.
//
// The operation surface is CLOSED: every operation traces to a live legacy call site and nothing
// else is offered - no `negate`, `abs`, `min`, `max`, `sum`, `average`, `round`, `floor`, `ceil`,
// `percentOf`, `allocate`, `split`, `distribute`, `power`, `sqrt` or remainder operation, no fluent
// builder, no currency-aware formatting, and no `toNumber` / `valueOf` / `toJSON` escape hatch. A
// further operation is added when a locator demands it, not speculatively.
//
// The two egress methods are NOT interchangeable. `toFixed2()` applies CFML's `"0.00"` mask and
// therefore ROUNDS to two decimals, reproducing [model/service/PromotionService.cfc:L1017] and
// [model/service/PriceGroupService.cfc:L339], both the last line of their function.
// `toDecimalString()` imposes NO scale and renders every significant digit, because that is what a
// `big_decimal` column gets and the `Sw*` schema is preserved unchanged - writing `'52.47'` where
// the value is `52.47375` would narrow the schema. Both are explicitly named calls; neither is
// reachable by coercion.
//
// `plus` has exactly ONE justification: [model/service/PromotionService.cfc:L417] is `var
// totalDiscountableAmount = arguments.order.getSubtotalAfterItemDiscounts() +
// arguments.order.getFulfillmentChargeAfterDiscountTotal();` - a plain `+` with NO
// `precisionEvaluate` around it, and the only addition of two monetary values in the entire
// in-scope slice. (The published quote of that line names the variable `orderDiscountableAmount`;
// the source reads `totalDiscountableAmount`.)
//
// THE ZERO SEEDS AND THE TWO DEFAULTLESS SWITCHES. `getDiscountAmount` opens with two accumulators
// seeded to zero [model/service/PromotionService.cfc:L988, L989] and its
// `switch(reward.getAmountType())` has no `default:` case [L993-L1003], so an unrecognised amount
// type leaves the pre-rounding accumulator at zero and falls straight through. That, and only that,
// is what `Money.zero` exists for. The slice's SECOND defaultless switch behaves differently and
// must not be conflated with it: `calculateSkuPriceBasedOnPriceGroupRate` seeds `newPrice` with the
// PASSTHROUGH `arguments.sku.getPrice()` [model/service/PriceGroupService.cfc:L319] and its switch
// also has no `default:` [L321-L336], so an unrecognised amount type there falls through to the
// sku's own price rather than to zero.
//
// THE REFERENCE CALCULATION - the acceptance gate for this file. All five intermediate values must
// match with no IEEE-754 drift:
//
//   unit price                                    19.99
//   quantity                                          3
//   extended   = 19.99 x 3                        59.97
//   discount   = 59.97 x (12.5 / 100)             7.49625
//   net        = 59.97 - 7.49625                  52.47375
//   toFixed2() of the net                         '52.47'
//
// The final step is the behaviour of `numberFormat(discountAmount, "0.00")` at
// [model/service/PromotionService.cfc:L1017]. `src/lib/cfml/precision.ts` stops its own reference
// assertion at `'52.47375'`, because the two-decimal step belongs to `numberFormat.ts` - which is
// why `toFixed2` delegates rather than re-implementing it.
//
// SCHEMA CONTINUITY. The `Sw*` tables are unchanged by this migration, and four `big_decimal`
// columns are read and written through `Money`:
//   * `SwPromotionApplied.discountAmount` [model/entity/PromotionApplied.cfc:L53]
//     (table declared at [model/entity/PromotionApplied.cfc:L49])
//   * `SwSkuCurrency.price`        [model/entity/SkuCurrency.cfc:L53] - NO default
//   * `SwSkuCurrency.renewalPrice` [model/entity/SkuCurrency.cfc:L54] - default "0"
//   * `SwSkuCurrency.listPrice`    [model/entity/SkuCurrency.cfc:L55] - default "0"
// `price` having no default while the other two default to "0" is exactly why the currency cascade
// guards the latter two with `!isNull` and sets `price` unconditionally. A column's string form is
// constructed straight into a `Money` with no loss.
//
// `Money` is deliberately currency-agnostic: the legacy arithmetic carries no currency operand, and
// `SwPromotionApplied` stores `discountAmount` [model/entity/PromotionApplied.cfc:L53] and
// `currencyCode` [L55] as SEPARATE columns. So this file does not import `currencyCode.ts` and
// there is no money-with-currency type; the currency a value is denominated in is carried by the
// surrounding entity.
//
// Routing all arithmetic through `Money` is what closes the raw floating-point gap in the
// `amountOff` branch at [model/service/PromotionService.cfc:L998] (register entry 12) and what
// makes the un-scoped `discountAmount` assignment at [L1007, L1009, L1014] (register entry 13)
// function-local. Both divergences are owned and annotated in `src/services`, as are register
// entries 8 and 14 and the `roundValue` algorithm with its ten measured characterization outputs.

// `precision.ts` owns the configured decimal constructor, the finiteness boundary and the
// zero-divisor refusal; this file owns the monetary surface over it.
//
// `toDecimalString` is aliased on BOTH imports because the two dependencies export that name with
// two DIFFERENT meanings, and conflating them would be a real defect: `precision.toDecimalString`
// RENDERS a computed value as a plain decimal numeral, imposing no scale, while
// `numberFormat.toDecimalString` VALIDATES a candidate string and brands it as a `DecimalString`,
// throwing when it is not a plain decimal numeral.
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
 * What every monetary operand on {@link Money} accepts: a `Money`, or a plain decimal numeral as a
 * `string`.
 *
 * `number` is deliberately not a member. An IEEE-754 double cannot represent most decimal fractions
 * exactly, and admitting one for a price, an amount or a discount is precisely how drift would
 * enter a money path. `src/lib/cfml/precision.ts` makes the same prohibition structural in its own
 * `PreciseInput`; a caller holding a `number` for a monetary value will not compile, and there is
 * deliberately no `Money.fromNumber`.
 *
 * A `DecimalString` - the branded type `numberFormat.ts` declares, and what the target equivalent
 * of `roundValue` [model/service/RoundingRuleService.cfc:L88] returns - is accepted here with no
 * conversion, because the brand refines `string`. It is not listed as a separate union constituent
 * because `string | DecimalString` reduces to `string`, which the lint gate rejects as redundant;
 * the brand is used where it is load-bearing instead, as the return type of {@link Money.toFixed2}.
 *
 * A string operand is validated on the way in and a malformed one throws; see
 * {@link Money.fromDecimalString}.
 */
export type MoneyInput = Money | string;

/**
 * An immutable monetary quantity, and the only place money arithmetic happens.
 *
 * Immutable by construction: the single field is `readonly`, the constructor is private so
 * instances are only built through the named factory, every operation returns a NEW instance, and
 * `Object.freeze` is applied in the constructor - so the guarantee is mechanical, including for
 * {@link Money.zero}. The read-only order views in `src/domain/views` hold `Money` values, which is
 * what makes that safe. The private constructor also makes the class effectively final: no subclass
 * can add a mutable field behind the frozen one or widen the closed operation surface.
 *
 * No scale is imposed, ever. The internal value keeps whatever precision the arithmetic produced,
 * and two-decimal presentation happens only where a caller asks for it, mirroring
 * [model/service/PromotionService.cfc:L1017] and [model/service/PriceGroupService.cfc:L339] sitting
 * at the END of their functions rather than inside the calculation.
 */
export class Money {
  /**
   * A plain decimal numeral - the value's entire state.
   *
   * JUDGMENT CALL: held as a STRING rather than as a decimal instance, for two reasons. It makes
   * the substrate unleakable - this file never names the substrate's value type, so there is
   * nothing for a getter, a property, a return value or a re-export to expose. And it is lossless
   * in both directions: the renderer imposes no scale, and re-reading such a numeral reconstructs
   * the same value exactly, so a `big_decimal` column's string form round-trips unchanged.
   *
   * One consequence is a property of decimal VALUES rather than of this file: a value carries no
   * trailing-zero scale of its own. `'19.90'` keeps that exact numeral on ingress, a computed
   * result renders as `'19.9'`, and the two compare EQUAL. Presentation restores two decimals; see
   * {@link Money.toFixed2}.
   */
  private readonly amount: string;

  /**
   * Not reachable from outside. Use {@link Money.fromDecimalString}.
   *
   * PRECONDITION: `amount` is already a finite plain decimal numeral. Only two kinds of value reach
   * here and both satisfy it - a numeral validated by the factory, and a result rendered by the
   * substrate, which refuses to return a non-finite value from any operation.
   */
  private constructor(amount: string) {
    this.amount = amount;
    Object.freeze(this);
  }

  /**
   * The one way to build a `Money` from outside this class.
   *
   * This is how monetary values actually arrive: `big_decimal` columns come back from the driver in
   * decimal string form, and the target equivalent of `roundValue`
   * [model/service/RoundingRuleService.cfc:L88] returns a `DecimalString`, which is a `string` and
   * so is accepted directly.
   *
   * Malformed input throws: `''`, `'abc'`, `'1,234.50'`, `'12.'`, `'NaN'`, `'Infinity'`,
   * `'-Infinity'`, exponential notation and anything with surrounding whitespace are all rejected.
   * Silent coercion to zero is the failure mode that would sell products for free, so there is no
   * tolerant parse and no fallback.
   *
   * JUDGMENT CALL: validation is delegated to the validating brander in `numberFormat.ts` and its
   * error propagates unchanged rather than being wrapped. That module's error type is exported
   * precisely so a consumer can discriminate malformed input, and declaring a parallel error type
   * would give consumers two things to catch for one failure. Nothing is caught anywhere in this
   * file, which is also what lets the substrate's zero-divisor refusal propagate - see
   * {@link Money.dividedBy}.
   *
   * @param value a plain decimal numeral, optionally signed. Never a `number`.
   * @returns an immutable `Money` holding exactly that value.
   * @throws the `numberFormat.ts` decimal-numeral error if `value` is not a finite plain decimal
   *   numeral.
   */
  public static fromDecimalString(value: string): Money {
    return new Money(assertPlainDecimalNumeral(value));
  }

  /**
   * Zero.
   *
   * CFML parity [model/service/PromotionService.cfc:L988, L989]: the two accumulators of
   * `getDiscountAmount` are seeded `var discountAmountPreRounding = 0;` and
   *   `var roundedFinalAmount = 0;`,
   * and the `switch(reward.getAmountType())` that follows has NO `default:` case [L993-L1003], so
   * an unrecognised amount type leaves the pre-rounding accumulator at zero and falls through.
   * Reproducing those seeds, and that fall-through, is the entire purpose of this constant.
   *
   * It is NOT a substitute for an absent price, and no method on `Money` may return it as a
   * fallback, a default or an error result - no `?? Money.zero`, no `orZero()`, no parameter
   * defaulting to it. Absence is modelled as `undefined` at the entity accessors:
   * `getPriceByCurrencyCode` has no `else` and no fallback [model/entity/Sku.cfc:L269-L273], while
   * `getListPriceByCurrencyCode` [L275-L279] and `getRenewalPriceByCurrencyCode` [L281-L285] each
   * perform a SECOND key-existence test on the inner sub-key and likewise return null. Substituting
   * `0` for those nulls would silently sell products for free.
   *
   * Note the asymmetry with the slice's other defaultless switch, which falls through to a
   * PASSTHROUGH price rather than to zero [model/service/PriceGroupService.cfc:L319, L321-L336].
   * This constant serves the promotion seeds only.
   *
   * JUDGMENT CALL: a single shared instance rather than a factory returning a fresh zero. Every
   * instance is frozen in the constructor, so one shared value cannot be tampered with and reads
   * identically everywhere, and it is built through the public factory so it is subject to exactly
   * the same validation as every other value.
   */
  public static readonly zero: Money = Money.fromDecimalString('0');

  /**
   * Multiplies this value by a monetary quantity or by a non-monetary integer count, and returns
   * the product as a new `Money`.
   *
   * CFML parity, one site per legacy expression shape:
   *   [model/service/PromotionService.cfc:L990]  `price * quantity` - the multiplier is an integer
   *                                              COUNT, which is why this method admits one
   *   [model/service/PromotionService.cfc:L995]  `a x (b / 100)`, composed as
   *                                              `times(rewardAmount.dividedBy(100))`, so here the
   *                                              multiplier is MONETARY
   *   [model/service/PromotionService.cfc:L150]  `(a x b) - (c x b)`, two multiplications by the
   *                                              same quantity, composed with {@link Money.minus}
   *   [model/service/PromotionService.cfc:L1001] `(a - b) x c`, subtraction first
   *   [model/service/PromotionService.cfc:L486]  `(a / b) x (b - c)`, division first; `(b - c)`
   *                                              subtracts one integer count from another, which is
   *                                              quantity arithmetic the caller performs first
   *   [model/service/PriceGroupService.cfc:L323] the inner `price * (rate.getAmount() / 100)` term
   *
   * @param multiplier a monetary quantity, or a non-monetary integer count.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the multiplier is a malformed numeral, or a `number` that is not a safe integer -
   *   see {@link Money.toDecimalOperand}.
   */
  public times(multiplier: MoneyInput | number): Money {
    return new Money(renderPlainDecimal(multiply(this.amount, Money.toDecimalOperand(multiplier))));
  }

  /**
   * Divides this value by a monetary quantity or by a non-monetary integer count, and returns the
   * quotient as a new `Money`.
   *
   * CFML parity, one site per legacy expression shape:
   *   [model/service/PromotionService.cfc:L299]  `discountAmount / discountQuantity`, the
   *                                              discount-per-use value the ledger insert-sorts on
   *   [model/service/PromotionService.cfc:L995]  the `(reward.getAmount()/100)` term
   *   [model/service/PromotionService.cfc:L486]  the leading `(discountAmount /
   *                                              thisDiscountQuantity)` term
   *   [model/service/PriceGroupService.cfc:L323] the `(priceGroupRate.getAmount() / 100)` term
   *
   * All four legacy divisors are non-monetary integers - three quantities and the literal 100. The
   * signature nevertheless mirrors {@link Money.times} so the two scaling operations present one
   * consistent operand rule.
   *
   * JUDGMENT CALL: a zero divisor throws and the throw is not caught here. The legacy site at
   * [model/service/PromotionService.cfc:L299] applies no zero check; the substrate refuses a zero
   * divisor and this method lets the refusal propagate. Returning zero would silently invent money;
   * returning `undefined` would push a null check onto every caller of every operation. Whether the
   * CALL SITE wants a guard is owned by `src/services/promotion/rewardUsageLedger.ts`. A
   * non-terminating quotient does NOT throw: it resolves at the substrate's declared
   * significant-digit count and rounding mode.
   *
   * @param divisor a monetary quantity, or a non-monetary integer count.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the divisor is zero, is a malformed numeral, or is a `number` that is not a safe
   *   integer.
   */
  public dividedBy(divisor: MoneyInput | number): Money {
    return new Money(renderPlainDecimal(divide(this.amount, Money.toDecimalOperand(divisor))));
  }

  /**
   * Subtracts a monetary quantity from this value and returns the difference as a new `Money`.
   *
   * CFML parity, one site per legacy expression shape:
   *   [model/service/PromotionService.cfc:L150]  the outer subtraction of `(a x b) - (c x b)`
   *   [model/service/PromotionService.cfc:L252]  `a - (b - c)`, two nested subtractions; published
   *                                              as L248, which is a comment
   *   [model/service/PromotionService.cfc:L1001] the `(price - reward.getAmount())` term of
   *                                              `(a - b) x c`
   *   [model/service/PromotionService.cfc:L1006] `originalAmount - discountAmountPreRounding`, the
   *                                              NET PRICE handed to the rounding rule - omitted
   *                                              from the published list and the semantically most
   *                                              important of the eleven
   *   [model/service/PromotionService.cfc:L1007] `originalAmount - roundedFinalAmount`, the
   *   discount
   *                                              derived back out of the rounded net price
   *   [model/service/PriceGroupService.cfc:L323] the outer subtraction of `a - (a x (b / 100))`
   *   [model/service/PriceGroupService.cfc:L331] the plain `a - b` of the amount-off rate;
   *   published
   *                                              as L328, which is a closing brace
   *
   * The operand is MONETARY ONLY - a count may scale money but may never be subtracted from it. See
   * {@link Money.toDecimalOperand} for the rule and its one legacy counter-example.
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
   * CFML parity [model/service/PromotionService.cfc:L417]: `var totalDiscountableAmount =
   * arguments.order.getSubtotalAfterItemDiscounts() +
   * arguments.order.getFulfillmentChargeAfterDiscountTotal();` - the ONLY addition of two monetary
   * values in the whole in-scope slice, and the one money addition the legacy performs with a plain
   * `+` and no `precisionEvaluate` around it. Routing it through the substrate here is a faithful
   * re-expression and a uniform application of the single-arithmetic-surface standard.
   *
   * This method exists because L417 needs it. The operand is MONETARY ONLY, for the same reason as
   * {@link Money.minus}.
   *
   * @param addend the monetary quantity to add.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the addend is a malformed numeral.
   */
  public plus(addend: MoneyInput): Money {
    return new Money(renderPlainDecimal(add(this.amount, Money.toDecimalOperand(addend))));
  }

  // Comparison
  //
  // Every comparison below is BY DECIMAL VALUE and applies NO rounding, which is load-bearing
  // because the promotion engine sorts on these results in two opposite directions at once:
  // `orderItemQulifiedDiscounts` is insert-sorted DESCENDING by discount amount
  // [model/service/PromotionService.cfc:L266-L294] and only index `[1]` is ever applied
  // [L524-L537], while `orderItemsUsage` is insert-sorted ASCENDING by discount-per-use value
  // [L301-L329] so the cheapest-per-use entries are stripped first. A comparison that quietly
  // rounded to two decimals would collapse distinct values into ties and change which discount
  // wins.
  //
  // Comparing by VALUE also means scale is irrelevant: `'19.90'` and a computed `'19.9'` compare
  // EQUAL. A lexical string comparison would call them different, and would call `'9.99'` greater
  // than `'12.35'`. Both answers would change money.

  /**
   * Orders this value against another: `-1` when this one is smaller, `1` when it is larger, `0`
   * when the two are equal in value. Total, because both operands are finite by construction.
   *
   * CFML parity [model/service/PromotionService.cfc:L271]: the descending insertion test of the
   * qualified-discount accumulator. CFML parity [model/service/PromotionService.cfc:L306]: the
   * ascending insertion test of the reward-usage ledger, running the other way.
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
   * CFML parity [model/service/PromotionService.cfc:L257]: `if(discountAmount > 0)`, the gate
   * deciding whether a computed discount is recorded against an order item at all. Compare against
   * `'0'` or against {@link Money.zero} - using the constant as a COMPARAND is not the prohibited
   * use, which is returning it as a fallback. CFML parity
   * [model/service/PromotionService.cfc:L1013]:
   *   `if(discountAmountPreRounding > originalAmount)`,
   * the clamp that stops a discount exceeding the original amount. That clamp compares the
   * PRE-rounding value while overwriting the POST-rounding one - register entry 14, reproduced in
   * `src/services`, not here. It is named because it is why this comparison must be exact and
   * unopinionated: a service cannot reproduce a defect faithfully if the comparison it builds on
   * quietly normalises its operands.
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
   * CFML parity [model/service/PromotionService.cfc:L148]: the sale-price seeding gate - a sale
   * price seeds a discount only when it is strictly below the sku's own price. CFML parity
   * [model/service/PromotionService.cfc:L271]: the descending insertion test, in its `<` form.
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
   * Never reference equality and never string equality: instances built from `'19.90'` and `'19.9'`
   * are equal, as are `'0'` and `'0.00'`. That is the semantic CFML applies when comparing two
   * numeric-looking strings with `==`, as the rounding algorithm does at
   * [model/service/RoundingRuleService.cfc:L120].
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
   *   `return numberFormat(discountAmount, "0.00");`,
   * the last line of `getDiscountAmount`. CFML parity [model/service/PriceGroupService.cfc:L339]:
   *   `return numberFormat(newPrice, "0.00");`,
   * the last line of `calculateSkuPriceBasedOnPriceGroupRate` (published as L337). CFML parity
   * [model/service/RoundingRuleService.cfc:L89]: the same mask normalising the input on the first
   * line of the rounding algorithm.
   *
   * A presentation step, not a rounding policy: a caller must ask for it, and it is never applied
   * inside an arithmetic operation. Both legacy call sites sit at the very END of their functions,
   * after every calculation is complete - `52.47375` is the value, `'52.47'` its presentation.
   *
   * The mask semantics belong to `numberFormat.ts` and are delegated wholesale: always exactly two
   * decimals, always at least one integer digit (`'0.42'`, never `'.42'` - load-bearing for the
   * rounding algorithm's prefix slicing), no thousands separator, no exponential notation, a
   * preserved leading minus, half-up rounding, and negative zero normalised to `'0.00'`.
   *
   * JUDGMENT CALL: the return type is the branded `DecimalString` rather than a bare `string`,
   * because that is what `numberFormat` returns; widening it would force a caller that needs a
   * `DecimalString` to re-validate a value validated one call ago. The brand refines `string`, so
   * callers wanting a `string` are unaffected.
   *
   * @returns the value presented to two decimals; a `DecimalString`, hence a `string`.
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
   * This, not {@link Money.toFixed2}, is what a `big_decimal` column gets, and getting it wrong
   * silently loses money: `toFixed2` applies CFML's `'0.00'` mask and therefore rounds, so
   * persisting through it would write `'52.47'` where the computed value is `52.47375`.
   *
   * Full precision is a schema requirement rather than a preference. `discountAmount`
   * [model/entity/PromotionApplied.cfc:L53] and `amount` [model/entity/PriceGroupRate.cfc:L54] are
   * declared `big_decimal`, and a `big_decimal` column is precisely one that declines to round on
   * the caller's behalf. The legacy engine did not round on the way to the database either: its
   * `numberFormat` calls sit at the END of the calculating functions
   * [model/service/PromotionService.cfc:L1017], [model/service/PriceGroupService.cfc:L339], as
   * return-value presentation. The result is plain notation, no thousands separator, a preserved
   * leading minus, at least one integer digit, and every significant digit the value carries.
   *
   * JUDGMENT CALL: the numeral is canonicalised, not echoed, so two instances that report `equals`
   * serialise identically. What a value HOLDS depends on how it was spelled on ingress -
   * `fromDecimalString('.42')` holds `'.42'`, and `'19.90'` holds that scale while the equal
   * computed `19.90 x 1` renders `'19.9'` - so echoing would break the integer-digit guarantee and
   * emit two strings for two equal values. The round trip is value-stable rather than
   * character-stable, which is the right guarantee for a fixed-scale `DECIMAL(p, s)` column.
   *
   * JUDGMENT CALL: the output is re-validated before branding, through the same function
   * {@link Money.fromDecimalString} admits values through, which makes this method's output and
   * that method's input provably the same language. Not named `toString`, `valueOf` or `toJSON`,
   * deliberately: those are implicit-coercion hooks, and an accidental interpolation, `+` or
   * `JSON.stringify` must not silently produce a monetary numeral.
   *
   * @returns every significant digit of this value as a plain decimal numeral; a `DecimalString`.
   * @throws the `numberFormat.ts` decimal-numeral error if the rendered numeral is somehow not a
   *   plain decimal numeral - unreachable through the public API, and checked rather than assumed.
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
   * The operand rule every method above follows: a non-monetary integer COUNT may SCALE money but
   * may never be added to or subtracted from it. So `times` and `dividedBy` admit a `number` while
   * `minus`, `plus` and all four comparisons do not. That matches every legacy site - the
   * multipliers and divisors are quantities and the literal 100, and the one legacy count
   * subtraction, `(thisDiscountQuantity - needToRemove)` inside
   * [model/service/PromotionService.cfc:L486], subtracts one count from another and never touches a
   * monetary value, so the caller performs it before handing the result to `times`.
   *
   * JUDGMENT CALL: this is the only numeric ingress and it is integer-only. A `number` is admitted
   * for the non-monetary integer operands the legacy arithmetic genuinely has - the quantity in
   * `price * quantity` [model/service/PromotionService.cfc:L990] and the literal divisor 100
   * [model/service/PromotionService.cfc:L995], [model/service/PriceGroupService.cfc:L323] - routed
   * through the substrate's safe-integer entry point, which rejects a non-integer, a non-finite
   * value and any magnitude beyond exact integer representation. `times(0.125)` fails loudly rather
   * than admitting a double into a money path, and there is deliberately no `Money.fromNumber`. A
   * `string` operand is validated on the way in, so a malformed numeral fails at the operation.
   *
   * @param operand a `Money`, a plain decimal numeral, or a non-monetary safe integer count.
   * @returns a plain decimal numeral the substrate accepts.
   * @throws if a `string` operand is not a finite plain decimal numeral, or a `number` operand is
   *   not a safe integer.
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
