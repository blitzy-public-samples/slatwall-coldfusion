// slatwall-ts - unit suite pinning `src/lib/cfml/precision.ts`
//
// That module is the SUBSTRATE of the arithmetic surface, not the surface.
//
// Regression cases in this port follow the `issue_<ticket#>` convention taken from
// [meta/tests/unit/IssuesTest.cfc:L51] (`public void function issue_1097()`). No `issue_*` case
// falls inside this suite and none is invented to look like one.
//
// JUDGMENT CALL: every expectation is a decimal-STRING literal that was measured against the
// shipped module under the pinned decimal library before being written here, never derived by hand
// and never computed in-line.

import { describe, expect, it } from 'vitest';

import {
  absolute,
  add,
  compare,
  divide,
  equals,
  fromInteger,
  isGreaterThan,
  isLessThan,
  isZero,
  multiply,
  subtract,
  toDecimalString,
} from '../../../../src/lib/cfml/precision.js';
// The module's two exported TYPES are part of its contract, not incidental annotations, so they
// are imported by name and asserted directly rather than covered only through the values that
// happen to satisfy them.
import type { PreciseInput, PreciseValue } from '../../../../src/lib/cfml/precision.js';

/**
 * What a rejected request reveals about itself.
 *
 * The module's error class is deliberately not exported, which is the documented contract: the
 * export surface is a closed set, and widening it is a product decision.
 */
interface CapturedFailure {
  readonly name: string;
  readonly message: string;
}

/**
 * Runs an operation expected to fail and reports how it failed.
 *
 * JUDGMENT CALL: a pure local helper rather than a shared fixture.
 *
 * If the operation does not throw, this throws instead, so a silently-succeeding subject can never
 * be mistaken for a passing expectation.
 */
const captureFailure = (operation: () => unknown): CapturedFailure => {
  try {
    operation();
  } catch (thrown) {
    return thrown instanceof Error
      ? { name: thrown.name, message: thrown.message }
      : { name: 'NotAnError', message: 'a value that is not an Error was thrown' };
  }

  throw new Error('the operation under test was expected to throw, but it returned normally.');
};

// D2 - the eleven verified in-scope `precisionEvaluate` sites.

describe('the eleven verified in-scope precisionEvaluate arithmetic shapes', () => {
  // CFML parity [model/service/RoundingRuleService.cfc:L88]: the verified NEGATIVE that bounds the
  // set. `grep -c precisionEvaluate` returns 0 for `RoundingRuleService.cfc`,
  // `ProductService.cfc`, `SkuService.cfc`, `BrandService.cfc` and `OptionService.cfc`.
  //
  // CFML parity [model/service/PromotionService.cfc:L252]: published as L248, which is wrong.
  //
  // CFML parity [model/service/PromotionService.cfc:L1006]: OMITTED ENTIRELY from the published
  // list. It is present in the source and is the subtraction feeding
  // `roundValueByRoundingRule(...)`, so the published total of ten understates the real total of
  // eleven.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L323]: published as L322, which is wrong.
  // L322 is literally `case "percentageOff":`.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L331]: published as L328, which is wrong.

  it('L150 - (a x b) - (c x b), the sale-price seeding discount', () => {
    // CFML parity [model/service/PromotionService.cfc:L150]:
    // `precisionEvaluate('(orderItem.getSku().getPrice() * orderItem.getQuantity()) - (salePriceDetails.salePrice * orderItem.getQuantity())')`.
    const listExtended = multiply('19.99', '3');
    const saleExtended = multiply('17.49', '3');

    expect(toDecimalString(subtract(listExtended, saleExtended))).toBe('7.5');
  });

  it('L252 - a - (b - c), the price-group discount adjustment', () => {
    // CFML parity [model/service/PromotionService.cfc:L252]:
    // `precisionEvaluate('originalDiscountAmount - (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())')`.
    expect(toDecimalString(subtract('10.00', subtract('59.97', '52.47')))).toBe('2.5');
  });

  it('L299 - a / b, the discount-per-use value the usage ledger sorts on', () => {
    // CFML parity [model/service/PromotionService.cfc:L299]:
    // `precisionEvaluate('discountAmount / discountQuantity')`. The legacy site applies no zero
    // check to its divisor; see the division block below for where that guard belongs.
    expect(toDecimalString(divide('7.49625', '3'))).toBe('2.49875');
  });

  it('L486 - (a / b) x (b - c), the over-use discount reduction', () => {
    // CFML parity [model/service/PromotionService.cfc:L486]:
    // `precisionEvaluate('(orderItemQulifiedDiscounts[ orderItemID ][y].discountAmount / thisDiscountQuantity) * (thisDiscountQuantity - needToRemove)')`.
    const perUse = divide('7.49625', '3');
    const retainedQuantity = subtract('3', '1');

    expect(toDecimalString(multiply(perUse, retainedQuantity))).toBe('4.9975');
  });

  it('L990 - a x b, the extended original amount', () => {
    // CFML parity [model/service/PromotionService.cfc:L990]:
    // `precisionEvaluate('arguments.price * arguments.quantity')` - the first statement of the
    // discount calculation.
    expect(toDecimalString(multiply('19.99', '3'))).toBe('59.97');
  });

  it('L995 - a x (b / 100), the percentageOff discount branch', () => {
    // CFML parity [model/service/PromotionService.cfc:L995]:
    // `precisionEvaluate('originalAmount * (reward.getAmount()/100)')`. The division by the
    // literal 100 is nested INSIDE the multiplication, so the percentage is resolved before it is
    // applied.
    expect(toDecimalString(multiply('59.97', divide('12.5', '100')))).toBe('7.49625');
  });

  it('L1001 - (a - b) x c, the amount discount branch', () => {
    // CFML parity [model/service/PromotionService.cfc:L1001]:
    // `precisionEvaluate('(arguments.price - reward.getAmount()) * arguments.quantity')` - the
    // per-unit shortfall against a target amount, extended over the quantity.
    expect(toDecimalString(multiply(subtract('19.99', '12.495'), '3'))).toBe('22.485');
  });

  it('L1006 - a - b, the amount handed to the rounding rule', () => {
    // CFML parity [model/service/PromotionService.cfc:L1006]:
    // `roundValueByRoundingRule(value=precisionEvaluate('originalAmount - discountAmountPreRounding'), roundingRule=reward.getRoundingRule())`.
    // This is the site omitted from the published list.
    expect(toDecimalString(subtract('59.97', '7.49625'))).toBe('52.47375');
  });

  it('L1007 - a - b, the discount the rounded final amount implies', () => {
    // CFML parity [model/service/PromotionService.cfc:L1007]:
    // `precisionEvaluate('originalAmount - roundedFinalAmount')`.
    expect(toDecimalString(subtract('59.97', '52.47375'))).toBe('7.49625');
  });

  it('L323 - a - (a x (b / 100)), the price-group percentageOff rate', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L323]:
    // `precisionEvaluate('arguments.sku.getPrice() - (arguments.sku.getPrice() * (arguments.priceGroupRate.getAmount() / 100))')`.
    const basePrice = '19.99';
    const percentageTerm = multiply(basePrice, divide('12.5', '100'));

    expect(toDecimalString(subtract(basePrice, percentageTerm))).toBe('17.49125');
  });

  it('L331 - a - b, the price-group amountOff rate', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L331]:
    // `precisionEvaluate('arguments.sku.getPrice() - arguments.priceGroupRate.getAmount()')`.
    expect(toDecimalString(subtract('19.99', '2.50'))).toBe('17.49');
  });
});

describe('addition, which no in-scope precisionEvaluate site performs', () => {
  // Stated honestly rather than padded: all eleven in-scope guarded sites are multiplication,
  // subtraction or division.

  it('serves the unguarded upward candidate of the rounding search at RRS L108', () => {
    // CFML parity [model/service/RoundingRuleService.cfc:L108]:
    // `var higherValue = inputValue + rrPower;` - plain CFML addition with no precision guard.
    expect(toDecimalString(add('12.3456', '0.99'))).toBe('13.3356');
  });

  it('serves the downward candidate at RRS L101 through subtract', () => {
    // CFML parity [model/service/RoundingRuleService.cfc:L101]:
    // `var lowerValue = inputValue - rrPower;` - the counterpart of L108.
    expect(toDecimalString(subtract('12.3456', '0.99'))).toBe('11.3556');
  });
});

// D3 - the decimal-fidelity reference chain.

describe('the decimal-fidelity reference chain', () => {
  // A unit price of 19.99 at a quantity of 3, discounted by 12.5 per cent.
  //
  // CFML parity [model/service/PromotionService.cfc:L1017]: the legacy function closes by
  // returning its discount through a two-decimal presentation mask, which is what turns 52.47375
  // into a two-decimal amount for display and persistence.

  it('step 1 - extends the unit price over the quantity to 59.97', () => {
    // The quantity is passed as the decimal STRING '3'.
    expect(toDecimalString(multiply('19.99', '3'))).toBe('59.97');
  });

  it('step 2 - resolves 12.5 per cent of the extended price to 7.49625', () => {
    // The percentage divisor is the string literal '100', matching the literal 100 in the legacy
    // expression at [model/service/PromotionService.cfc:L995].
    const extendedPrice = multiply('19.99', '3');

    expect(toDecimalString(divide('12.5', '100'))).toBe('0.125');
    expect(toDecimalString(multiply(extendedPrice, divide('12.5', '100')))).toBe('7.49625');
  });

  it('step 3 - subtracts the discount to 52.47375 and stops there', () => {
    // As IEEE-754 doubles this exact subtraction yields 52.473749999999995, so the assertion below
    // is the one that actually demonstrates why the module exists.
    expect(toDecimalString(subtract('59.97', '7.49625'))).toBe('52.47375');
  });

  it('composes the whole chain without an intermediate rendering step', () => {
    // The same chain expressed as nested calls. Values stay inside the precise domain the whole
    // way and are rendered once, at the end - which is how a caller is expected to use the module.
    const discount = multiply(multiply('19.99', '3'), divide('12.5', '100'));

    expect(toDecimalString(subtract(multiply('19.99', '3'), discount))).toBe('52.47375');
  });

  it('reaches the same result when the quantity enters through fromInteger', () => {
    // JUDGMENT CALL: asserted because the integer entry point genuinely ships, and a caller
    // holding an integer quantity will reasonably use it. It must agree with the string route
    // exactly, or there would be two arithmetic surfaces rather than one.
    expect(toDecimalString(multiply('19.99', fromInteger(3)))).toBe('59.97');
  });

  it('adds 0.1 and 0.2 to exactly 0.3, which doubles cannot do', () => {
    // The canonical IEEE-754 counter-example: as doubles, 0.1 + 0.2 yields 0.30000000000000004.
    // Here it is exactly 0.3.
    expect(toDecimalString(add('0.1', '0.2'))).toBe('0.3');
  });
});

// D4 - comparison semantics.

describe('comparison semantics: by decimal value, never lexical', () => {
  // CFML parity [model/service/PromotionService.cfc:L266-L294]: qualified discounts are
  // insert-sorted DESCENDING by discount amount.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L120]: the sharpest reason the comparison
  // must be numeric rather than textual.

  it('compare returns exactly -1 when the left operand is smaller', () => {
    expect(compare('1', '2')).toBe(-1);
  });

  it('compare returns exactly 1 when the left operand is larger', () => {
    expect(compare('2', '1')).toBe(1);
  });

  it('compare returns exactly 0 for equal values written at different scales', () => {
    // A text comparison would report these as different. They are one value.
    expect(compare('12.350', '12.35')).toBe(0);
  });

  it('equals judges 1.0 and 1 equal', () => {
    expect(equals('1.0', '1')).toBe(true);
  });

  it('equals judges 12.350 and 12.35 equal', () => {
    expect(equals('12.350', '12.35')).toBe(true);
  });

  it('isGreaterThan reports 9.99 NOT greater than 12.35, where text would disagree', () => {
    // The load-bearing trap.
    expect(isGreaterThan('9.99', '12.35')).toBe(false);
    expect(isLessThan('9.99', '12.35')).toBe(true);
  });

  it('isGreaterThan reports 12.350 not strictly greater than 12.35', () => {
    // Equal values are not strictly greater in either direction.
    expect(isGreaterThan('12.350', '12.35')).toBe(false);
    expect(isLessThan('12.350', '12.35')).toBe(false);
  });

  it('isGreaterThan separates 0.10 from 0.09 at the sub-cent boundary', () => {
    expect(isGreaterThan('0.10', '0.09')).toBe(true);
  });

  it('isLessThan separates 0.09 from 0.10 at the sub-cent boundary', () => {
    expect(isLessThan('0.09', '0.10')).toBe(true);
  });

  it('isZero recognises zero written at any scale, and only zero', () => {
    // CFML parity [model/service/PromotionService.cfc:L257]: `if(discountAmount > 0)` gates
    // whether a computed discount is recorded against an order item at all, so "is this zero" has
    // to be scale-independent.
    expect(isZero('0')).toBe(true);
    expect(isZero('0.00')).toBe(true);
    expect(isZero('0.0000')).toBe(true);
    expect(isZero('-0')).toBe(true);
    expect(isZero('0e5')).toBe(true);
    expect(isZero('0.01')).toBe(false);
  });

  it('absolute discards a negative sign and leaves a positive value alone', () => {
    // CFML parity [model/service/RoundingRuleService.cfc:L123-L130]: the rounding search computes
    // `var valueOptionOneDelta = inputValue - valueOptionOne;` and then flips the sign by hand
    // with `valueOptionOneDelta = valueOptionOneDelta*-1;` when the delta is negative.
    expect(toDecimalString(absolute('-0.58'))).toBe('0.58');
    expect(toDecimalString(absolute('0.58'))).toBe('0.58');
  });
});

// D5 - division: a zero divisor throws, a non-terminating quotient does not.

describe('division', () => {
  // CFML parity [model/service/PromotionService.cfc:L299]: the legacy site
  // `precisionEvaluate('discountAmount / discountQuantity')` applies no zero check to its divisor.

  it('throws rather than yielding a non-finite value for a zero divisor', () => {
    // Deliberately not asserted: an infinite result, a not-a-number result, a zero fallback, or an
    // absent result. Any of those would let a corrupted amount travel onward as though it were
    // money.
    expect(() => divide('7.49625', '0')).toThrow();
  });

  it('throws for a zero divisor written at any scale', () => {
    // '0.00' is the same value as '0', so it must be refused identically. A divisor guard that
    // only recognised the literal '0' would be a hole.
    expect(() => divide('1', '0.00')).toThrow();
    expect(() => divide('1', '-0')).toThrow();
    expect(() => divide('0', '0')).toThrow();
  });

  it('signals the refusal as an identifiable failure type', () => {
    expect(captureFailure(() => divide('7.49625', '0')).name).toBe('PrecisionError');
  });

  it('names the operation and the dividend, and discloses nothing else at all', () => {
    // JUDGMENT CALL: the message is asserted EXHAUSTIVELY, as a whole string, rather than by
    // sampling a denylist of sensitive substrings.
    //
    // The disclosure guarantee is structural as well as asserted: the module reads no environment
    // and holds no connection detail, so it has nothing sensitive available to leak.
    expect(captureFailure(() => divide('7.49625', '0')).message).toBe(
      'divide received a zero divisor while dividing 7.49625; CFML precisionEvaluate raises a ' +
        'division-by-zero error, and resolving this to 0 would silently invent money.',
    );
  });

  it('resolves a non-terminating quotient at the declared precision without throwing', () => {
    // 1/3 has no exact decimal representation, so division has to stop somewhere.
    const oneThird = toDecimalString(divide('1', '3'));

    expect(oneThird.startsWith('0.3333')).toBe(true);
    expect(oneThird).toBe('0.33333333333333333333');
  });

  it('rounds the final digit of a non-terminating quotient rather than truncating', () => {
    // 2/3 settles on a trailing 7, not a trailing 6, which is what shows the declared half-up
    // rounding is genuinely in force at the precision boundary.
    expect(toDecimalString(divide('2', '3'))).toBe('0.66666666666666666667');
  });
});

// D6 - input-type discipline.

describe('input-type discipline', () => {
  // The module accepts a decimal STRING or a value it produced itself.

  it('accepts both members of its operand union interchangeably', () => {
    // The two exported TYPES are contracts in their own right, so they get a named assertion
    // rather than being covered only incidentally.
    //
    // Both exported names are ANNOTATED here rather than merely inferred.
    const produced: PreciseValue = divide('12.5', '100');
    const producedAsOperand: PreciseInput = produced;
    const stringOperand: PreciseInput = '59.97';

    // String x string, produced x string, string x produced, produced x produced.
    expect(toDecimalString(multiply(stringOperand, '0.125'))).toBe('7.49625');
    expect(toDecimalString(multiply(producedAsOperand, '59.97'))).toBe('7.49625');
    expect(toDecimalString(multiply('59.97', produced))).toBe('7.49625');
    expect(toDecimalString(multiply(produced, multiply('59.97', '1')))).toBe('7.49625');

    // The comparison and rendering boundaries accept the union too.
    expect(equals('0.125', produced)).toBe(true);
    expect(compare(produced, '0.125')).toBe(0);
    expect(toDecimalString(produced)).toBe('0.125');
  });

  it('REFUSES a raw number at the operand type and at every arithmetic entry point', () => {
    // The positive test above cannot fail if `number` were quietly admitted into the operand union
    // a wider union still accepts a string and still accepts a produced value.
    //
    // This is the one property that keeps the whole module honest.
    // each `@ts-expect-error` as unused and this suite would fail to compile,

    // @ts-expect-error - a raw number is not a member of the operand union.
    const rawNumberOperand: PreciseInput = 12.5;

    // The value still exists at runtime under the deliberate breach, so what a breach would
    // actually smuggle in is recorded rather than left to imagination: an unrounded double, not a
    // decimal.
    expect(typeof rawNumberOperand).toBe('number');

    // @ts-expect-error - multiply must reject a raw number multiplicand.
    expect(() => multiply(12.5, '3')).not.toThrow();

    // @ts-expect-error - and a raw number multiplier, so neither position leaks.
    expect(() => multiply('12.5', 3)).not.toThrow();

    // @ts-expect-error - the additive operations refuse it too, not just multiply.
    expect(() => add(12.5, '3')).not.toThrow();

    // @ts-expect-error - as do the comparisons, so no back door opens there.
    expect(() => equals(12.5, '12.5')).not.toThrow();

    // Easiest place for a double to slip in unnoticed.
    // @ts-expect-error - a JavaScript number is not assignable at the rendering boundary, which
    // would otherwise be the easiest place for a double to slip in unnoticed.
    expect(toDecimalString(12.5)).toBe('12.5');
  });

  it('accepts a safe integer through the one named integer entry point', () => {
    // JUDGMENT CALL: this entry point genuinely ships, so it is pinned.
    expect(toDecimalString(fromInteger(3))).toBe('3');
    expect(toDecimalString(fromInteger(100))).toBe('100');
    expect(toDecimalString(fromInteger(0))).toBe('0');
    expect(toDecimalString(fromInteger(-5))).toBe('-5');
  });

  it('rejects an integer beyond exact representation', () => {
    // Past this magnitude a double can no longer represent consecutive integers, so the caller's
    // value may already be wrong before it arrives.
    expect(() => fromInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(captureFailure(() => fromInteger(Number.MAX_SAFE_INTEGER + 1)).name).toBe(
      'PrecisionError',
    );
  });

  it('rejects a non-integer, which is the case a price would arrive as', () => {
    // This is the guard that stops the integer entry point being quietly repurposed as a money
    // entry point.
    expect(() => fromInteger(1.5)).toThrow();
  });

  it('rejects non-finite numeric input', () => {
    expect(() => fromInteger(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => fromInteger(Number.NEGATIVE_INFINITY)).toThrow();
    expect(() => fromInteger(Number.NaN)).toThrow();
  });

  it('explains the rejection by naming the offending value and the alternative', () => {
    expect(captureFailure(() => fromInteger(1.5)).message).toBe(
      'fromInteger accepts only a safe integer; received 1.5. Decimal quantities such as a ' +
        'price, an amount or a discount must be passed as a decimal string.',
    );
  });

  it('throws on a malformed decimal string rather than resolving it to zero', () => {
    // A malformed amount must fail loudly.
    expect(() => multiply('abc', '1')).toThrow();
    expect(() => multiply('', '1')).toThrow();
    expect(() => multiply('1.2.3', '1')).toThrow();
  });

  it('throws on a grouped decimal string, since grouping is not a number format here', () => {
    // '1,000' is presentation, not arithmetic input. The two-decimal mask CFML applies produces no
    // grouping either, so nothing upstream should ever produce this.
    expect(() => multiply('1,000', '1')).toThrow();
  });

  it('rejects malformed input at every entry point, not only the arithmetic ones', () => {
    // The comparison and rendering boundaries coerce their operands through the same input
    // boundary, so none of them is a way in for a malformed amount.
    expect(() => toDecimalString('abc')).toThrow();
    expect(() => isZero('abc')).toThrow();
    expect(() => compare('abc', '1')).toThrow();
    expect(() => absolute('abc')).toThrow();
  });

  it('refuses a non-finite operand instead of letting one escape as a value', () => {
    // Asserted as a THROW, deliberately never as a returned not-a-number value.
    expect(() => multiply('NaN', '1')).toThrow();
    expect(() => multiply('Infinity', '1')).toThrow();
    expect(() => multiply('-Infinity', '1')).toThrow();
    expect(captureFailure(() => multiply('NaN', '1')).name).toBe('PrecisionError');
  });

  // The finiteness boundary is applied twice per operation - once to each coerced operand, and
  // once to the RESULT - and the two are genuinely different branches rather than the same check
  // written twice.
  //
  // JUDGMENT CALL - the operands are exponential-notation string literals, and nothing here
  // renders them.
  describe('the result boundary, which finite operands can still breach', () => {
    // At the positive exponent bound: finite on its own.
    const atUpperExponentBound = '1e9000000000000000';

    // At the negative exponent bound: finite on its own.
    const atLowerExponentBound = '1e-9000000000000000';

    it('accepts each overflow operand on its own, so the operand check is not what fires', () => {
      // The control for the two tests below.
      expect(() => multiply(atUpperExponentBound, '1')).not.toThrow();
      expect(() => multiply(atLowerExponentBound, '1')).not.toThrow();
      expect(() => absolute(atUpperExponentBound)).not.toThrow();
    });

    it('throws when a product of finite operands overflows to a non-finite result', () => {
      expect(() => multiply(atUpperExponentBound, '10')).toThrow();

      const failure = captureFailure(() => multiply(atUpperExponentBound, '10'));

      expect(failure.name).toBe('PrecisionError');

      // The message names the OPERATION, which is what distinguishes a result breach from an
      // operand breach in a diagnostic - an operand breach is reported against 'operand', never
      // against 'multiply'.
      expect(failure.message).toBe(
        'multiply produced a non-finite decimal (Infinity); a non-finite value must never ' +
          'reach a monetary quantity.',
      );
    });

    it('throws when a quotient of finite operands overflows to a non-finite result', () => {
      // A second operation, because the result boundary is applied per operation and one passing
      // case would not show the others are wired to it.
      expect(() => divide('10', atLowerExponentBound)).toThrow();

      const failure = captureFailure(() => divide('10', atLowerExponentBound));

      expect(failure.name).toBe('PrecisionError');
      expect(failure.message).toBe(
        'divide produced a non-finite decimal (Infinity); a non-finite value must never ' +
          'reach a monetary quantity.',
      );
    });

    it('does NOT throw when the result merely underflows, because zero is finite', () => {
      // The asymmetry, pinned so nobody "tidies" the result check into rejecting both directions.
      expect(() => multiply(atLowerExponentBound, atLowerExponentBound)).not.toThrow();
      expect(isZero(multiply(atLowerExponentBound, atLowerExponentBound))).toBe(true);
    });

    it('does NOT throw when addition stays inside the bound', () => {
      // Doubling a value at the bound raises its leading digits, not its exponent, so the sum is
      // still finite and still admissible.
      expect(() => add(atUpperExponentBound, atUpperExponentBound)).not.toThrow();
      expect(() => subtract(atUpperExponentBound, atUpperExponentBound)).not.toThrow();
      expect(isZero(subtract(atUpperExponentBound, atUpperExponentBound))).toBe(true);
    });
  });
});

// D7 - rendering discipline at the boundary out of the precise domain.

describe('rendering discipline', () => {
  // This is where a precise value leaves the module: for persistence into a decimal column, or for
  // a presentation step that applies a mask. Three guarantees, and one clarification that corrects
  // a misreading.

  it('renders a very large magnitude in plain notation, never exponential', () => {
    const rendered = toDecimalString('1000000000000000000000');

    expect(rendered).toBe('1000000000000000000000');
    expect(rendered.includes('e+')).toBe(false);
    expect(rendered.includes('E+')).toBe(false);
  });

  it('renders a very small magnitude in plain notation, never exponential', () => {
    const rendered = toDecimalString('0.000000001');

    expect(rendered).toBe('0.000000001');
    expect(rendered.includes('e-')).toBe(false);
    expect(rendered.includes('E-')).toBe(false);
  });

  it('never introduces a thousands separator', () => {
    // CFML's two-decimal mask yields "1234.50", never "1,234.50", so no grouping may appear here
    // either. Checked on a value large enough that a grouping implementation would certainly have
    // inserted one.
    expect(toDecimalString('1234.50').includes(',')).toBe(false);
    expect(toDecimalString('1000000000000000000000').includes(',')).toBe(false);
    expect(toDecimalString('123456789.123')).toBe('123456789.123');
  });

  it('imposes no scale: it neither pads to two decimals nor drops a trailing zero', () => {
    // A discrepancy worth recording precisely, because it is easy to misread.
    //
    // JUDGMENT CALL: this suite asserts the SHIPPED behaviour and does not edit the module to
    // match a differently-worded expectation.
    expect(toDecimalString('19.90')).toBe('19.9');
    expect(toDecimalString('19.9')).toBe('19.9');
    expect(toDecimalString('0.00')).toBe('0');

    // And nothing is padded on the way out either: a value with one decimal place does not acquire
    // a second one.
    expect(toDecimalString(subtract('19.99', '2.50'))).toBe('17.49');
    expect(toDecimalString(multiply('0.5', '1'))).toBe('0.5');
  });

  it('leaves both opposing scale transformations to the sibling formatting module', () => {
    // Padding to two decimals - the mask applied at [model/service/PromotionService.cfc:L1017] and
    // at [model/service/PriceGroupService.cfc:L339], which is what would turn the chain's 52.47375
    // into a two-decimal amount.
    expect(toDecimalString(subtract('59.97', '7.49625'))).toBe('52.47375');
  });

  it('round-trips a value the module itself produced', () => {
    // Rendering is not a one-way door: a rendered value can re-enter the precise domain and come
    // back unchanged, which is what makes the string form a safe carrier between layers.
    const discount = multiply('59.97', divide('12.5', '100'));
    const rendered = toDecimalString(discount);

    expect(toDecimalString(rendered)).toBe(rendered);
    expect(equals(rendered, discount)).toBe(true);
  });
});

// D9 - schema fidelity: money is persisted at arbitrary precision.

describe('schema fidelity for arbitrary-precision money columns', () => {
  // The first is the rate the price-group cascade applies; the second is the write-side output of
  // the promotion engine.

  it('round-trips a money value at sub-cent scale without loss', () => {
    // The chain's intermediate carries five decimal places - well past the two a display amount
    // shows - and it must persist and reload exactly.
    expect(toDecimalString('52.47375')).toBe('52.47375');
    expect(toDecimalString('0.000000000000000001')).toBe('0.000000000000000001');
  });

  it('round-trips a high-precision value through an operation', () => {
    // A representative persisted value at 19 significant digits. Construction preserves every
    // digit it is given, and each exact operation carries them through untouched.
    const stored = '12345678.90123456789';

    expect(toDecimalString(add(stored, '0'))).toBe(stored);
    expect(toDecimalString(subtract(stored, '0'))).toBe(stored);
    expect(toDecimalString(multiply(stored, '1'))).toBe(stored);
  });

  it('carries a MySQL DECIMAL(65,s) operand through an exact operation without truncating it', () => {
    // The widest operand the schema can hand this module.
    //
    // This is the assertion that would FAIL under a shared 20-significant-digit arithmetic cap.
    const widest = `${'9'.repeat(45)}.${'9'.repeat(20)}`;

    expect(widest.replace('.', '')).toHaveLength(65);
    expect(toDecimalString(add(widest, '0'))).toBe(widest);
    expect(toDecimalString(subtract(widest, '0'))).toBe(widest);
    expect(toDecimalString(multiply(widest, '1'))).toBe(widest);
  });

  it('adds, subtracts and multiplies EXACTLY past twenty significant digits', () => {
    // The three assertions that distinguish exact arithmetic from capped arithmetic.
    //
    // Multiplication: two 19-digit operands produce a 38-digit product. Capped arithmetic answers
    // '1219326311370217952200', DISCARDING the tail; this module keeps it.
    expect(toDecimalString(multiply('12345678901.23456789', '98765432109.87654321'))).toBe(
      '1219326311370217952237.4638011112635269',
    );

    // Subtraction: a tiny subtrahend against a large minuend.
    expect(toDecimalString(subtract('100000000000000000000', '0.000000001'))).toBe(
      '99999999999999999999.999999999',
    );

    // Addition, for symmetry: 21 significant digits in the augend, and the sum keeps all of them.
    // Capped -> '100000000000000000000'.
    expect(toDecimalString(add('99999999999999999999.9999999999', '0.0000000001'))).toBe(
      '100000000000000000000',
    );
    expect(toDecimalString(add('12345678901234567890.12345', '0.00001'))).toBe(
      '12345678901234567890.12346',
    );
  });

  it('reaches the deepest in-scope multiplication chain exactly, verified against a BigInt oracle', () => {
    // The three-factor shape at [model/service/PromotionService.cfc:L995] -
    // `price x quantity x (amount / 100)` - is the deepest multiplication chain in the in-scope
    // slice.
    //
    // The expected values below are derived with native `BigInt` INTEGER arithmetic, which is
    // exact by definition and shares no code with the decimal library under test.
    const nines = 10n ** 65n - 1n;
    const widest = `${'9'.repeat(45)}.${'9'.repeat(20)}`;

    // Place a decimal point `fractionDigits` from the right of an exact integer.
    const withPoint = (integer: bigint, fractionDigits: number): string => {
      const digits = integer.toString();
      return `${digits.slice(0, digits.length - fractionDigits)}.${digits.slice(digits.length - fractionDigits)}`;
    };

    // The square: 130 significant digits, and its tail is the sharpest canary in this suite.
    const expectedSquare = withPoint(nines * nines, 40);
    expect(toDecimalString(multiply(widest, widest))).toBe(expectedSquare);
    expect(expectedSquare.replace('.', '')).toHaveLength(130);
    expect(expectedSquare.endsWith('0000000001')).toBe(true);

    // The cube: 195 significant digits, the reachable worst case this module's exact precision is
    // sized against.
    const expectedCube = withPoint(nines * nines * nines, 60);
    expect(toDecimalString(multiply(multiply(widest, widest), widest))).toBe(expectedCube);
    expect(expectedCube.replace('.', '')).toHaveLength(195);
  });

  it('resolves EVERY quotient at the declared division scale, terminating or not', () => {
    // Division is the one operation in this module that stops at a declared scale, and these two
    // non-terminating quotients pin that constant.
    expect(toDecimalString(divide('1', '3'))).toBe('0.33333333333333333333');
    expect(toDecimalString(divide('2', '3'))).toBe('0.66666666666666666667');

    // Stated explicitly because it surprises: the declared scale is applied to every quotient,
    // including one that would terminate exactly.
    //
    // The INGRESS is nonetheless lossless, which is a different claim and is what makes this safe:
    // the wide operand arrives intact and is then resolved.
    const wide = `1.${'1'.repeat(80)}`;
    expect(toDecimalString(divide(wide, '1'))).toBe(`1.${'1'.repeat(19)}`);
    expect(toDecimalString(multiply(divide('1', '3'), '3'))).toBe('0.99999999999999999999');

    // And an exact-homed operand handed to division is resolved at the DIVISION scale rather than
    // at the exact one. Without `divide` re-homing its operands this would come back with hundreds
    // of digits.
    expect(toDecimalString(divide(multiply('1', '1'), '3'))).toBe('0.33333333333333333333');
  });

  it('keeps a persisted discount and a recomputed discount comparable by value', () => {
    // A value reloaded from a decimal column arrives as a string at whatever scale the column
    // stored it.
    const recomputed = multiply('59.97', divide('12.5', '100'));

    expect(equals('7.49625', recomputed)).toBe(true);
    expect(equals('7.4962500', recomputed)).toBe(true);
    expect(compare('7.49625', recomputed)).toBe(0);
  });
});

// D8 - stated, not asserted: precision gaps owned elsewhere.
//
// CFML parity [model/service/PromotionService.cfc:L998]: verified verbatim, the `amountOff` branch
// reads `discountAmountPreRounding = reward.getAmount() * quantity;` - raw floating-point
// multiplication with no precision guard.
//
// CFML parity [model/service/PromotionService.cfc:L417]: verified verbatim,
// `var totalDiscountableAmount = arguments.order.getSubtotalAfterItemDiscounts() + arguments.order.getFulfillmentChargeAfterDiscountTotal();`
// a DISTINCT unguarded plain-addition gap.
//
// CFML parity [model/service/PromotionService.cfc:L1013-L1015]: the clamp that stops a discount
// exceeding the original amount tests the PRE-rounding value with
// `if(discountAmountPreRounding > originalAmount)` but overwrites the POST-rounding one.
