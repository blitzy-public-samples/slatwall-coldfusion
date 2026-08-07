// Money - the sole arithmetic surface of the target.
//
// Every monetary calculation in the port passes through this one value object: every discount,
// every price-group rate, every currency-conversion result.
//
// Four of those citations correct a published locator, each settled by reading the source: L252
// (published L248) - L248 is a comment and L249 is the `getDiscountAmount` call;
// [model/service/PromotionService.cfc:L1006].
//
// The rounding rule is applied to the NET PRICE, not to the discount.

// `precision.ts` owns the configured decimal constructor, the finiteness boundary and the
// zero-divisor refusal; this file owns the monetary surface over it.
//
// Both imports are aliased at the point of use because the two dependencies answer two DIFFERENT
// questions about a decimal string: `precision.ts` RENDERS one, `numberFormat.ts` VALIDATES one and
// brands the result. The names differ at the source too - `toPlainDecimalString` against
// `toDecimalString` - so a reader who follows either import lands on the right function.
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
  toPlainDecimalString as renderPlainDecimal,
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
 * A `DecimalString` - the branded type `numberFormat.ts` declares, and what the target equivalent
 * of `roundValue` [model/service/RoundingRuleService.cfc:L88] returns - is accepted here with no
 * conversion.
 */
export type MoneyInput = Money | string;

/**
 * An immutable monetary quantity, and the only place money arithmetic happens.
 */
export class Money {
  /**
   * A plain decimal numeral - the value's entire state.
   *
   * JUDGMENT CALL: held as a STRING rather than as a decimal instance, for two reasons. It makes
   * the substrate unleakable - this file never names the substrate's value type, so there is
   * nothing for a getter, a property, a return value or a re-export to expose.
   */
  private readonly amount: string;

  /**
   * Not reachable from outside. Use {@link Money.fromDecimalString}.
   *
   * PRECONDITION: `amount` is already a finite plain decimal numeral.
   */
  private constructor(amount: string) {
    this.amount = amount;
    Object.freeze(this);
  }

  /**
   * The one way to build a `Money` from outside this class.
   *
   * Malformed input throws: `''`, `'abc'`, `'1,234.50'`, `'12.'`, `'NaN'`, `'Infinity'`,
   * `'-Infinity'`, exponential notation and anything with surrounding whitespace are all rejected.
   *
   * @param value a plain decimal numeral, optionally signed.
   * @returns an immutable `Money` holding exactly that value.
   * @throws the `numberFormat.ts` decimal-numeral error if `value` is not a finite plain decimal
   * numeral.
   */
  public static fromDecimalString(value: string): Money {
    return new Money(assertPlainDecimalNumeral(value));
  }

  /**
   * CFML parity [model/service/PromotionService.cfc:L988, L989]: the two accumulators of
   * `getDiscountAmount` are seeded `var discountAmountPreRounding = 0;` and
   * `var roundedFinalAmount = 0;`, and the `switch(reward.getAmountType())` that follows has no
   * `default:` case [model/service/PromotionService.cfc:L993-L1003].
   *
   * JUDGMENT CALL: a single shared instance rather than a factory returning a fresh zero.
   */
  public static readonly zero: Money = Money.fromDecimalString('0');

  /**
   * Multiplies this value by a monetary quantity or by a non-monetary integer count, and returns
   * the product as a new `Money`.
   *
   * @param multiplier a monetary quantity, or a non-monetary integer count.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the multiplier is a malformed numeral, or a `number` that is not a safe integer -
   * see {@link Money.toDecimalOperand}.
   */
  public times(multiplier: MoneyInput | number): Money {
    return new Money(renderPlainDecimal(multiply(this.amount, Money.toDecimalOperand(multiplier))));
  }

  /**
   * Divides this value by a monetary quantity or by a non-monetary integer count, and returns the
   * quotient as a new `Money`.
   *
   * All four legacy divisors are non-monetary integers - three quantities and the literal 100.
   *
   * @param divisor a monetary quantity, or a non-monetary integer count.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the divisor is zero, is a malformed numeral, or is a `number` that is not a safe
   * integer.
   */
  public dividedBy(divisor: MoneyInput | number): Money {
    return new Money(renderPlainDecimal(divide(this.amount, Money.toDecimalOperand(divisor))));
  }

  /**
   * Subtracts a monetary quantity from this value and returns the difference as a new `Money`.
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
   * @param addend the monetary quantity to add.
   * @returns a new `Money`; this instance is unchanged.
   * @throws if the addend is a malformed numeral.
   */
  public plus(addend: MoneyInput): Money {
    return new Money(renderPlainDecimal(add(this.amount, Money.toDecimalOperand(addend))));
  }

  // Comparing by VALUE also means scale is irrelevant: `'19.90'` and a computed `'19.9'` compare
  // EQUAL.

  /**
   * Orders this value against another: `-1` when this one is smaller, `1` when it is larger, `0`
   * when the two are equal in value. Total, because both operands are finite by construction.
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
   * deciding whether a computed discount is recorded against an order item at all.
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
   * price seeds a discount only when it is strictly below the sku's own price.
   *
   * @param other the monetary quantity to compare against.
   * @throws if `other` is a malformed numeral.
   */
  public isLessThan(other: MoneyInput): boolean {
    return isLessThan(this.amount, Money.toDecimalOperand(other));
  }

  /**
   * True when this value and another are equal in VALUE.
   *
   * Never reference equality and never string equality: instances built from `'19.90'` and
   * `'19.9'` are equal, as are `'0'` and `'0.00'`.
   *
   * @param other the monetary quantity to compare against.
   * @throws if `other` is a malformed numeral.
   */
  public equals(other: MoneyInput): boolean {
    return equals(this.amount, Money.toDecimalOperand(other));
  }

  /**
   * Presents this value with exactly two decimal places.
   *
   * CFML parity [model/service/PromotionService.cfc:L1017]:
   * `return numberFormat(discountAmount, "0.00");`, the last line of `getDiscountAmount`.
   *
   * A presentation step, not a rounding policy: a caller must ask for it, and it is never applied
   * inside an arithmetic operation.
   *
   * @returns the value presented to two decimals; a `DecimalString`, hence a `string`.
   */
  public toFixed2(): DecimalString {
    return numberFormat(this.amount, '0.00');
  }

  /**
   * Renders this value at full precision for persistence.
   *
   * JUDGMENT CALL: the numeral is canonicalised, not echoed, so two instances that report `equals`
   * serialise identically.
   *
   * @returns every significant digit of this value as a plain decimal numeral; a `DecimalString`.
   * @throws the `numberFormat.ts` decimal-numeral error if the rendered numeral is somehow not a
   * plain decimal numeral - unreachable through the public API, and checked rather than assumed.
   */
  public toDecimalString(): DecimalString {
    return assertPlainDecimalNumeral(renderPlainDecimal(this.amount));
  }

  /**
   * Reduces any accepted operand to a plain decimal numeral for the substrate.
   *
   * JUDGMENT CALL: this is the only numeric ingress and it is integer-only.
   *
   * @param operand a `Money`, a plain decimal numeral, or a non-monetary safe integer count.
   * @returns a plain decimal numeral the substrate accepts.
   * @throws if a `string` operand is not a finite plain decimal numeral, or a `number` operand is
   * not a safe integer.
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
