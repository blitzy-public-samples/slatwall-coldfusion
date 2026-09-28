// Unit suite for the money value object.
//
// JUDGMENT CALL: every expectation is a decimal-STRING literal measured against the shipped module
// under the pinned toolchain, never derived by hand.
//
// JUDGMENT CALL: the suite imports nothing but its subject. Fixtures build entities and views, a
// layer ABOVE value objects, so importing one would invert the layering.
//
// JUDGMENT CALL: failures are discriminated on the error's stable `name` rather than with
// `instanceof`.

import { describe, expect, it } from 'vitest';

// Four levels of `..` from `tests/unit/domain/valueObjects/` reach the subtree root, and the `.js`
// extension is mandatory: `tsconfig.json` sets `module` and `moduleResolution` to `NodeNext` with
// no `paths`, no `baseUrl` and no `allowImportingTsExtensions`.
//
// JUDGMENT CALL: a THREE-level example specifier circulates for this folder and is wrong - it
// resolves to a nonexistent `tests/src/...`.
import { Money } from '../../../../src/domain/valueObjects/money.js';
import * as moneyModule from '../../../../src/domain/valueObjects/money.js';

// JUDGMENT CALL: both are pure local functions holding no state.

/**
 * What a rejected request reveals about itself. A caller discriminates on the stable `name`, and
 * so does this suite; the header records why `instanceof` is not used.
 */
interface CapturedFailure {
  readonly name: string;
  readonly message: string;
}

/**
 * Runs an operation expected to fail and reports how it failed. If the operation does not throw,
 * this throws instead, so a silently succeeding subject can never be mistaken for a passing
 * expectation.
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

/**
 * Views a subject's own runtime state without an `any`, a suppression comment or a non-null
 * assertion.
 *
 * JUDGMENT CALL: this exists for exactly one purpose - proving that the state a `Money` holds is a
 * plain decimal NUMERAL and never a decimal-library instance.
 */
const ownState = (subject: Money): Readonly<Record<string, unknown>> =>
  subject as unknown as Record<string, unknown>;

// The verified reference calculation.
//
// Unit price 19.99 quantity 3 extended = 19.99 x 3 59.97 discount = 59.97 x (12.5 / 100) 7.49625
// net = 59.97 - 7.49625 52.47375 toFixed2() of the net '52.47'.

describe('the verified reference calculation', () => {
  // CFML parity [model/service/PromotionService.cfc:L990]:
  // `precisionEvaluate('arguments.price * arguments.quantity')` - the extension at the head of
  // `getDiscountAmount`.
  //
  // JUDGMENT CALL: every operand here is a decimal-string literal, including the quantity and the
  // divisor, so no numeric literal capable of drift appears in the calculation guarding the
  // must-preserve area.

  it('extends a unit price across a quantity exactly', () => {
    const extended = Money.fromDecimalString('19.99').times('3');

    expect(extended.equals(Money.fromDecimalString('59.97'))).toBe(true);
    expect(extended.toFixed2()).toBe('59.97');
  });

  it('computes a percentage-off discount exactly, keeping full scale', () => {
    const extended = Money.fromDecimalString('19.99').times('3');
    const rate = Money.fromDecimalString('12.5').dividedBy('100');
    const discount = extended.times(rate);

    expect(rate.equals(Money.fromDecimalString('0.125'))).toBe(true);
    expect(discount.equals(Money.fromDecimalString('7.49625'))).toBe(true);
  });

  it('subtracts the discount from the extended amount with no IEEE-754 drift', () => {
    const extended = Money.fromDecimalString('19.99').times('3');
    const discount = extended.times(Money.fromDecimalString('12.5').dividedBy('100'));
    const net = extended.minus(discount);

    // The correct decimal result.
    expect(net.equals(Money.fromDecimalString('52.47375'))).toBe(true);

    // Not the drifted double - the assertion proving decimal fidelity. 52.473749999999995 is
    // seventeen significant digits, well inside the substrate's declared twenty, so the inequality
    // is meaningful.
    expect(net.equals(Money.fromDecimalString('52.473749999999995'))).toBe(false);
    expect(net.equals(Money.fromDecimalString('52.47'))).toBe(false);

    expect(net.compare(Money.fromDecimalString('52.47375'))).toBe(0);
  });

  it('presents the net amount as the legacy two-decimal mask does', () => {
    const extended = Money.fromDecimalString('19.99').times('3');
    const discount = extended.times(Money.fromDecimalString('12.5').dividedBy('100'));
    const net = extended.minus(discount);

    expect(net.toFixed2()).toBe('52.47');
    expect(typeof net.toFixed2()).toBe('string');
  });

  it('keeps the full-scale discount while presenting it rounded', () => {
    const extended = Money.fromDecimalString('19.99').times('3');
    const discount = extended.times(Money.fromDecimalString('12.5').dividedBy('100'));

    // Presentation and value are separate concerns: the discount PRESENTS as '7.50' while the
    // value used in the subtraction remains 7.49625. Had `times` rounded, the net would have been
    // 52.47 rather than 52.47375.
    expect(discount.toFixed2()).toBe('7.50');
    expect(discount.equals(Money.fromDecimalString('7.49625'))).toBe(true);
    expect(extended.minus(discount).equals(Money.fromDecimalString('52.47375'))).toBe(true);
  });

  it('exposes the full-scale value through exactly one named accessor', () => {
    // The full-precision egress is `toDecimalString()`, the one way the held value leaves this
    // class unrounded.
    const net = Money.fromDecimalString('52.47375');

    expect(net.toDecimalString()).toBe('52.47375');
    expect(net.toFixed2()).toBe('52.47');
    expect('toFixed' in net).toBe(false);
    expect('toPrecision' in net).toBe(false);
    expect('toSignificantDigits' in net).toBe(false);
    expect('toDecimalPlaces' in net).toBe(false);
  });
});

// The primary path is a decimal STRING because that is how monetary values arrive: `big_decimal`
// columns come back from the driver in decimal string form.

describe('construction from a decimal string', () => {
  it('builds a value from a plain decimal numeral', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.toFixed2()).toBe('19.99');
    expect(price.equals(Money.fromDecimalString('19.99'))).toBe(true);
  });

  it('accepts a whole number, a leading-dot fraction and an explicit zero', () => {
    expect(Money.fromDecimalString('12').toFixed2()).toBe('12.00');
    expect(Money.fromDecimalString('.42').toFixed2()).toBe('0.42');
    expect(Money.fromDecimalString('0').toFixed2()).toBe('0.00');
    expect(Money.fromDecimalString('0.00').toFixed2()).toBe('0.00');
  });

  it('preserves every significant digit a big_decimal column arrives with', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L53]:
    // `property name="discountAmount" ormtype="big_decimal";`. A column's string form must
    // round-trip with no loss, so a value at more than two-decimal scale is held at its own scale
    // and only PRESENTED at two.
    const persisted = Money.fromDecimalString('7.49625');

    expect(persisted.equals(Money.fromDecimalString('7.49625'))).toBe(true);
    expect(persisted.equals(Money.fromDecimalString('7.50'))).toBe(false);
    expect(persisted.toFixed2()).toBe('7.50');
  });

  it('is currency-agnostic', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L53, L55]: `discountAmount`
    // (`ormtype="big_decimal"`) and `currencyCode` (`ormtype="string" length="3"`) are SEPARATE
    // columns and the legacy arithmetic carries no currency operand at all.
    expect(Money.fromDecimalString('19.99').equals(Money.fromDecimalString('19.99'))).toBe(true);
  });
});

describe('rejection at construction', () => {
  // JUDGMENT CALL: silent coercion to zero is the failure mode that would sell products for free,
  // so every malformed input must fail loudly.

  it('rejects the empty string', () => {
    expect(captureFailure(() => Money.fromDecimalString('')).name).toBe('CfmlNumberFormatError');
  });

  it('rejects the non-finite spellings NaN, Infinity and -Infinity', () => {
    // JUDGMENT CALL: these are asserted as STRINGS because the parameter is a `string`, so the
    // numeric `NaN`, `Infinity` and `-Infinity` cannot even be written at the call site - a
    // stronger guarantee than a runtime throw.
    expect(captureFailure(() => Money.fromDecimalString('NaN')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => Money.fromDecimalString('Infinity')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('-Infinity')).name).toBe(
      'CfmlNumberFormatError',
    );
  });

  it('rejects non-numeric text', () => {
    expect(captureFailure(() => Money.fromDecimalString('test')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('abc')).name).toBe('CfmlNumberFormatError');
  });

  it('rejects malformed and decorated numerals', () => {
    expect(captureFailure(() => Money.fromDecimalString('12.3.4')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('$19.99')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('1,234.50')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('12.')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => Money.fromDecimalString('1e5')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => Money.fromDecimalString(' 12.5 ')).name).toBe(
      'CfmlNumberFormatError',
    );
  });

  it('reports the offending value without inventing a fallback', () => {
    const failure = captureFailure(() => Money.fromDecimalString('abc'));

    expect(failure.message).toContain('abc');
    expect(failure.message.length).toBeGreaterThan(0);
  });

  it('rejects a malformed operand handed to an operation, not just to the factory', () => {
    // A malformed numeral must fail at the operation rather than propagating as a corrupted
    // amount, so every operand crossing is validated.
    const price = Money.fromDecimalString('19.99');

    expect(captureFailure(() => price.minus('abc')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.plus('')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.times('12.')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.dividedBy('1,000')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.compare('oops')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.equals('NaN')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.isGreaterThan('Infinity')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => price.isLessThan('$1')).name).toBe('CfmlNumberFormatError');
  });

  // JUDGMENT CALL: the `string` parameter is a compile-time guarantee and a real one - the numeric
  // `NaN`, `Infinity` and `-Infinity` genuinely cannot be written at any call site above, which is
  // why they are asserted in their string spellings.
  const fromRuntimeValue = (candidate: unknown): Money =>
    Money.fromDecimalString(candidate as string);

  it('rejects a raw number at run time, upholding the "never a number" contract', () => {
    expect(captureFailure(() => fromRuntimeValue(12.5)).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue(0)).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue(-3)).name).toBe('CfmlNumberFormatError');

    // The decisive case: a double that already carries drift. Admitting it would place the precise
    // hazard this value object exists to exclude inside the value object itself.
    expect(captureFailure(() => fromRuntimeValue(1.0000000000000002)).name).toBe(
      'CfmlNumberFormatError',
    );

    // The failure is this port's own typed error, not a stray one from the substrate, so a caller
    // can still tell a malformed input apart from any other failure - and it names what arrived.
    expect(captureFailure(() => fromRuntimeValue(12.5)).message).toContain('12.5');
  });

  it('rejects every other non-string shape handed over at run time', () => {
    // A single-element array and an object with a numeral-shaped `toString` are the sharp pair:
    // neither carries a usable `length`, both stringify to `'12.5'`, and the validating pattern is
    // applied with `RegExp.prototype.test`.
    expect(captureFailure(() => fromRuntimeValue(['12.5'])).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue({ toString: () => '12.5' })).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => fromRuntimeValue(true)).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue(null)).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue(undefined)).name).toBe('CfmlNumberFormatError');
  });

  it('leaves every valid numeral admissible, so nothing was over-refused', () => {
    // What is refused is a SHAPE, never a value: the string spelling of each number refused above
    // still constructs and still presents exactly as before.
    expect(Money.fromDecimalString('12.5').toFixed2()).toBe('12.50');
    expect(Money.fromDecimalString('0').toFixed2()).toBe('0.00');
    expect(Money.fromDecimalString('-3').toFixed2()).toBe('-3.00');
    expect(Money.fromDecimalString('1.0000000000000002').toFixed2()).toBe('1.00');

    // JUDGMENT CALL: the refusal belongs to the decimal-string factory alone and must not spill
    // into the operand path, where a non-monetary integer is admitted deliberately and travels a
    // separate branch that never reaches the string validator.
  });
});

describe('a negative amount remains representable', () => {
  // CFML parity [meta/tests/unit/IssuesTest.cfc:L110, L126]: a negative amount is rejected by the
  // VALIDATION layer, never by the money primitive. `issue_1335`
  // [meta/tests/unit/IssuesTest.cfc:L110] asserts that `skuCurrency.setPrice(-20)` and
  // `skuCurrency.setListPrice('test')` both raise a validation error and that neither is a
  // `_missing` error; `issue_1348` [meta/tests/unit/IssuesTest.cfc:L126] does the same for
  // `sku.setPrice(-20)`. Hence the asymmetry pinned below: a non-numeric string fails at
  // construction, a negative numeral does not.

  it('constructs and presents a negative intermediate', () => {
    // A negative intermediate is real rather than hypothetical: the rounding search at
    // [model/service/RoundingRuleService.cfc:L123-L130] subtracts and then flips the sign when the
    // result is negative.
    const negative = Money.fromDecimalString('-0.58');

    expect(negative.toFixed2()).toBe('-0.58');
    expect(negative.isLessThan(Money.zero)).toBe(true);
  });

  it('produces a negative result from a subtraction rather than clamping at zero', () => {
    const result = Money.fromDecimalString('7.42').minus('9.99');

    expect(result.toFixed2()).toBe('-2.57');
    expect(result.isLessThan(Money.zero)).toBe(true);
    expect(result.equals(Money.zero)).toBe(false);
  });

  it('accepts a negative leading-dot numeral', () => {
    expect(Money.fromDecimalString('-.99').toFixed2()).toBe('-0.99');
  });
});

describe('times', () => {
  // CFML parity [model/service/PromotionService.cfc:L990]:
  // `precisionEvaluate('arguments.price * arguments.quantity')` - a x b.
  // CFML parity [model/service/PromotionService.cfc:L995]:
  // `precisionEvaluate('originalAmount * (reward.getAmount()/100)')` - a x (b / 100).

  it('multiplies a whole amount by a whole count', () => {
    expect(Money.fromDecimalString('19').times('3').equals(Money.fromDecimalString('57'))).toBe(
      true,
    );
  });

  it('multiplies two decimal operands without drift', () => {
    // `0.1 * 0.2` as IEEE-754 doubles yields 0.020000000000000004; measured. The decimal result is
    // exactly 0.02.
    const product = Money.fromDecimalString('0.1').times('0.2');

    expect(product.equals(Money.fromDecimalString('0.02'))).toBe(true);
    expect(product.equals(Money.fromDecimalString('0.020000000000000004'))).toBe(false);
  });

  it('treats one as an identity', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.times('1').equals(price)).toBe(true);
  });

  it('collapses to zero when multiplied by zero', () => {
    expect(Money.fromDecimalString('19.99').times('0').equals(Money.zero)).toBe(true);
  });

  it('handles every sign combination', () => {
    expect(Money.fromDecimalString('19.99').times('-1').toFixed2()).toBe('-19.99');
    expect(Money.fromDecimalString('-19.99').times('-1').toFixed2()).toBe('19.99');
    expect(Money.fromDecimalString('-19.99').times('2').toFixed2()).toBe('-39.98');
  });

  it('keeps a high-scale product exact where a float would drift', () => {
    // Six decimals from two three-decimal operands. `1.005 * 2.015` as doubles yields
    // 2.0250749999999997; the decimal result is 2.025075.
    const product = Money.fromDecimalString('1.005').times('2.015');

    expect(product.equals(Money.fromDecimalString('2.025075'))).toBe(true);
    expect(product.equals(Money.fromDecimalString('2.0250749999999997'))).toBe(false);
    expect(product.toFixed2()).toBe('2.03');
  });

  it('composes the (a x b) - (c x b) sale-price shape', () => {
    // CFML parity [model/service/PromotionService.cfc:L150]: 19.99 list against 17.49 sale over a
    // quantity of.
    const listExtended = Money.fromDecimalString('19.99').times('3');
    const saleExtended = Money.fromDecimalString('17.49').times('3');

    expect(listExtended.minus(saleExtended).toFixed2()).toBe('7.50');
  });
});

describe('dividedBy', () => {
  // CFML parity [model/service/PromotionService.cfc:L299]:
  // `precisionEvaluate('discountAmount / discountQuantity')` - the discount-per-use value the
  // reward-usage ledger insert-sorts on.

  it('divides a percentage by one hundred exactly', () => {
    const rate = Money.fromDecimalString('12.5').dividedBy('100');

    expect(rate.equals(Money.fromDecimalString('0.125'))).toBe(true);
    // 0.125 presents as '0.13' under half-up rounding, which is exactly why the rate is never
    // presented mid-calculation.
    expect(rate.toFixed2()).toBe('0.13');
  });

  it('computes a discount-per-use value', () => {
    // CFML parity [model/service/PromotionService.cfc:L299]: a 7.50 discount spread across a
    // quantity of 3 is 2.50 per use.
    expect(Money.fromDecimalString('7.50').dividedBy('3').toFixed2()).toBe('2.50');
  });

  it('resolves a non-terminating quotient at the substrate declared scale', () => {
    // JUDGMENT CALL: the expected value is asserted by VALUE against the shipped result's own
    // scale, measured under the pinned toolchain rather than typed by hand.
    const third = Money.fromDecimalString('1').dividedBy('3');

    expect(third.equals(Money.fromDecimalString('0.33333333333333333333'))).toBe(true);
    expect(third.toFixed2()).toBe('0.33');
  });

  it('divides negative operands', () => {
    expect(Money.fromDecimalString('-7.50').dividedBy('3').toFixed2()).toBe('-2.50');
    expect(Money.fromDecimalString('7.50').dividedBy('-3').toFixed2()).toBe('-2.50');
  });
});

describe('minus', () => {
  // CFML parity [model/service/PromotionService.cfc:L150]: the outer subtraction of (a x b) - (c x
  // b).

  it('subtracts to a positive result', () => {
    expect(Money.fromDecimalString('59.97').minus('7.50').toFixed2()).toBe('52.47');
  });

  it('subtracts to exactly zero', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.minus(price).equals(Money.zero)).toBe(true);
    expect(price.minus('19.99').toFixed2()).toBe('0.00');
  });

  it('subtracts to a negative result without clamping', () => {
    expect(Money.fromDecimalString('19.99').minus('29.99').toFixed2()).toBe('-10.00');
  });

  it('subtracts the drift-sensitive reference operands exactly', () => {
    // `59.97 - 7.49625` as IEEE-754 doubles yields 52.473749999999995; measured.
    const net = Money.fromDecimalString('59.97').minus('7.49625');

    expect(net.equals(Money.fromDecimalString('52.47375'))).toBe(true);
    expect(net.equals(Money.fromDecimalString('52.473749999999995'))).toBe(false);
  });

  it('composes the a - (b - c) price-group adjustment shape', () => {
    // CFML parity [model/service/PromotionService.cfc:L252]: a 10.00 discount less the 7.50
    // price-group saving the item already receives nets 2.50.
    const alreadySaved = Money.fromDecimalString('59.97').minus('52.47');

    expect(Money.fromDecimalString('10.00').minus(alreadySaved).toFixed2()).toBe('2.50');
  });

  it('composes the a - (a x (b / 100)) percentage-off rate shape', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L323]: `19.99 - (19.99 * 0.125)` as doubles
    // yields 17.491249999999997; measured. The decimal result is 17.49125.
    const price = Money.fromDecimalString('19.99');
    const reduced = price.minus(price.times(Money.fromDecimalString('12.5').dividedBy('100')));

    expect(reduced.equals(Money.fromDecimalString('17.49125'))).toBe(true);
    expect(reduced.equals(Money.fromDecimalString('17.491249999999997'))).toBe(false);
    expect(reduced.toFixed2()).toBe('17.49');
  });
});

describe('plus', () => {
  // CFML parity [model/service/PromotionService.cfc:L417]:
  // `var totalDiscountableAmount = arguments.order.getSubtotalAfterItemDiscounts() + arguments.order.getFulfillmentChargeAfterDiscountTotal();`

  it('adds two monetary values', () => {
    const subtotalAfterItemDiscounts = Money.fromDecimalString('52.47');
    const fulfillmentChargeAfterDiscountTotal = Money.fromDecimalString('7.53');

    expect(subtotalAfterItemDiscounts.plus(fulfillmentChargeAfterDiscountTotal).toFixed2()).toBe(
      '60.00',
    );
  });

  it('adds without the drift a plain float addition would introduce', () => {
    // `0.1 + 0.2` as doubles yields 0.30000000000000004 - the exact hazard the unguarded legacy
    // `+` at L417 carries.
    const sum = Money.fromDecimalString('0.1').plus('0.2');

    expect(sum.equals(Money.fromDecimalString('0.3'))).toBe(true);
    expect(sum.equals(Money.fromDecimalString('0.30000000000000004'))).toBe(false);
  });

  it('treats zero as an identity and accepts a negative addend', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.plus(Money.zero).equals(price)).toBe(true);
    expect(price.plus('-19.99').equals(Money.zero)).toBe(true);
  });
});

// Every comparison is by DECIMAL VALUE and applies no rounding.

describe('compare', () => {
  it('returns exactly -1, 0 and 1', () => {
    // The literal values are asserted, not merely their truthiness: the two insertion sorts branch
    // on the sign.
    const smaller = Money.fromDecimalString('12.35');
    const larger = Money.fromDecimalString('19.99');

    expect(smaller.compare(larger)).toBe(-1);
    expect(larger.compare(smaller)).toBe(1);
    expect(smaller.compare(Money.fromDecimalString('12.35'))).toBe(0);
  });

  it('compares by value and not lexically', () => {
    // A lexical comparison would call '9.99' greater than '12.35', and both answers would change
    // money, so this is the discriminating case.
    const nineNinetyNine = Money.fromDecimalString('9.99');
    const twelveThirtyFive = Money.fromDecimalString('12.35');

    expect(nineNinetyNine.compare(twelveThirtyFive)).toBe(-1);
    expect(twelveThirtyFive.compare(nineNinetyNine)).toBe(1);
  });

  it('orders negative values correctly', () => {
    expect(Money.fromDecimalString('-2.57').compare(Money.zero)).toBe(-1);
    expect(Money.zero.compare(Money.fromDecimalString('-2.57'))).toBe(1);
    expect(Money.fromDecimalString('-9.99').compare(Money.fromDecimalString('-2.57'))).toBe(-1);
  });
});

describe('isGreaterThan and isLessThan', () => {
  // CFML parity [model/service/PromotionService.cfc:L257]: `if(discountAmount > 0)` - the gate
  // deciding whether a computed discount is recorded at all.

  it('is strict in both directions', () => {
    const smaller = Money.fromDecimalString('12.35');
    const larger = Money.fromDecimalString('19.99');

    expect(larger.isGreaterThan(smaller)).toBe(true);
    expect(smaller.isGreaterThan(larger)).toBe(false);
    expect(smaller.isLessThan(larger)).toBe(true);
    expect(larger.isLessThan(smaller)).toBe(false);
  });

  it('is false in both directions at equality', () => {
    const price = Money.fromDecimalString('19.99');
    const same = Money.fromDecimalString('19.99');

    expect(price.isGreaterThan(same)).toBe(false);
    expect(price.isLessThan(same)).toBe(false);
    expect(price.equals(same)).toBe(true);
  });

  it('gates a computed discount above zero', () => {
    // CFML parity [model/service/PromotionService.cfc:L257]: using `zero` as a COMPARAND is
    // legitimate; returning it as a fallback is not.
    expect(Money.fromDecimalString('7.50').isGreaterThan(Money.zero)).toBe(true);
    expect(Money.zero.isGreaterThan(Money.zero)).toBe(false);
    expect(Money.fromDecimalString('-2.57').isGreaterThan(Money.zero)).toBe(false);
  });

  it('seeds a sale price only when strictly below the list price', () => {
    // CFML parity [model/service/PromotionService.cfc:L148]: at equality the legacy gate does not
    // fire, so no discount is seeded.
    const listPrice = Money.fromDecimalString('19.99');

    expect(Money.fromDecimalString('17.49').isLessThan(listPrice)).toBe(true);
    expect(Money.fromDecimalString('19.99').isLessThan(listPrice)).toBe(false);
    expect(Money.fromDecimalString('21.99').isLessThan(listPrice)).toBe(false);
  });
});

describe('equals', () => {
  it('compares by value across two distinct instances', () => {
    const first = Money.fromDecimalString('52.47');
    const second = Money.fromDecimalString('52.47');

    // Value semantics, never reference identity: two separately constructed instances holding the
    // same amount are equal.
    expect(first.equals(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('ignores trailing-zero scale, which differs between the two strings', () => {
    // '52.47' and '52.470' are DIFFERENT strings and the same value, which is why equality is by
    // value.
    expect(Money.fromDecimalString('52.47').equals(Money.fromDecimalString('52.470'))).toBe(true);
    expect(Money.fromDecimalString('19.90').equals(Money.fromDecimalString('19.9'))).toBe(true);
    expect(Money.fromDecimalString('0').equals(Money.fromDecimalString('0.00'))).toBe(true);
  });

  it('accepts a decimal-string operand as well as another Money', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.equals('19.99')).toBe(true);
    expect(price.equals('19.990')).toBe(true);
    expect(price.equals('19.98')).toBe(false);
  });

  it('distinguishes values that differ beyond the second decimal', () => {
    // Two amounts that PRESENT identically at two decimals are still distinct.
    const full = Money.fromDecimalString('52.47375');

    expect(full.equals(Money.fromDecimalString('52.47'))).toBe(false);
    expect(full.toFixed2()).toBe(Money.fromDecimalString('52.47').toFixed2());
  });
});

// ToFixed2 - a presentation step, not a rounding policy.
//
// CFML parity [model/service/PromotionService.cfc:L1017]:
// `return numberFormat(discountAmount, "0.00");` - the last line of `getDiscountAmount`.
//
// JUDGMENT CALL: the ten measured `roundValue` characterization rows are deliberately not
// duplicated here. They are the acceptance gate for the rounding algorithm, which owns the
// rounding expression and direction.

describe('toFixed2', () => {
  it('always presents exactly two decimals, zero-padded', () => {
    expect(Money.fromDecimalString('12').toFixed2()).toBe('12.00');
    expect(Money.fromDecimalString('12.3').toFixed2()).toBe('12.30');
    expect(Money.fromDecimalString('12.34').toFixed2()).toBe('12.34');
  });

  it('always emits at least one integer digit', () => {
    // Load-bearing downstream: the rounding algorithm slices a prefix off this string, so '.42'
    // instead of '0.42' would slice at the wrong offset.
    expect(Money.fromDecimalString('0.42').toFixed2()).toBe('0.42');
    expect(Money.fromDecimalString('.42').toFixed2()).toBe('0.42');
    expect(Money.fromDecimalString('0.42').toFixed2().startsWith('.')).toBe(false);
  });

  it('never emits a thousands separator', () => {
    // CFML's "0.00" mask yields "1234.50", never "1,234.50".
    const presented = Money.fromDecimalString('1234.5').toFixed2();

    expect(presented).toBe('1234.50');
    expect(presented).not.toContain(',');
  });

  it('never emits exponential notation, at either magnitude extreme', () => {
    const large = Money.fromDecimalString('1000000000000000000000').toFixed2();
    const small = Money.fromDecimalString('0.000000001').toFixed2();

    expect(large).toBe('1000000000000000000000.00');
    expect(large).not.toContain('e');
    expect(large).not.toContain('E');
    expect(small).toBe('0.00');
    expect(small).not.toContain('e');
    expect(small).not.toContain('E');
  });

  it('preserves a leading minus with no accounting notation', () => {
    const presented = Money.fromDecimalString('-0.58').toFixed2();

    expect(presented).toBe('-0.58');
    expect(presented.startsWith('-')).toBe(true);
    expect(presented.endsWith('-')).toBe(false);
    expect(presented).not.toContain('(');
  });

  it('rounds half up', () => {
    expect(Money.fromDecimalString('0.005').toFixed2()).toBe('0.01');
    expect(Money.fromDecimalString('2.345').toFixed2()).toBe('2.35');
    expect(Money.fromDecimalString('12.3456').toFixed2()).toBe('12.35');
    expect(Money.fromDecimalString('2.344').toFixed2()).toBe('2.34');
  });

  it('rounds a negative half away from zero', () => {
    // JUDGMENT CALL: asserted only after confirming the shipped behaviour - half-up in the pinned
    // library rounds AWAY from ZERO when the value is equidistant.
    expect(Money.fromDecimalString('-2.345').toFixed2()).toBe('-2.35');
    expect(Money.fromDecimalString('-0.005').toFixed2()).toBe('-0.01');
  });

  it('normalises a negative zero presentation', () => {
    // A value rounding to zero at two decimals but not itself zero would otherwise keep its sign,
    // and a negative-zero price is indefensible.
    expect(Money.fromDecimalString('-0.001').toFixed2()).toBe('0.00');
    expect(Money.fromDecimalString('-0').toFixed2()).toBe('0.00');
    expect(Money.fromDecimalString('-0.001').toFixed2()).not.toBe('-0.00');
  });

  it('returns a string and never a number', () => {
    const presented = Money.fromDecimalString('19.99').toFixed2();

    expect(typeof presented).toBe('string');
    expect(typeof presented).not.toBe('number');

    expect(presented).toBe('19.99');
  });

  it('does not round the value it presents', () => {
    // The same instance is presented twice with an arithmetic step between; the arithmetic sees
    // full scale both times.
    const full = Money.fromDecimalString('52.47375');

    expect(full.toFixed2()).toBe('52.47');
    expect(full.minus('0.00375').equals(Money.fromDecimalString('52.47'))).toBe(true);
    expect(full.equals(Money.fromDecimalString('52.47'))).toBe(false);
    expect(full.toFixed2()).toBe('52.47');
  });
});

// Persistence, which is not presentation.
//
// `toFixed2` ROUNDS to two decimals because it reproduces CFML's `"0.00"` mask, while
// `toDecimalString` imposes no scale because the columns it feeds are declared `big_decimal`.

describe('toDecimalString', () => {
  it('persists every digit the value carries, where presentation would round', () => {
    // The reference calculation's net amount, and the whole point of the method.
    const net = Money.fromDecimalString('52.47375');

    expect(net.toDecimalString()).toBe('52.47375');
    expect(net.toFixed2()).toBe('52.47');
    expect(net.toDecimalString()).not.toBe(net.toFixed2());
  });

  it('round-trips through construction, value-stably', () => {
    // The property that makes a database round trip safe: whatever this method emits,
    // `fromDecimalString` accepts, and the reconstructed value is EQUAL to the original.
    for (const stored of ['52.47375', '0', '0.00', '19.90', '-0.58', '7.49625', '1234.5', '.42']) {
      const original = Money.fromDecimalString(stored);
      const reloaded = Money.fromDecimalString(original.toDecimalString());

      expect(reloaded.equals(original)).toBe(true);
      // Serialising the reloaded value is idempotent: a second trip cannot drift.
      expect(reloaded.toDecimalString()).toBe(original.toDecimalString());
    }
  });

  it('emits the same numeral for any two values that compare equal', () => {
    // The value-object guarantee this method is canonicalised to keep: if these diverged,
    // persistence would record a distinction that `equals` denies.
    const spelledWithTrailingZero = Money.fromDecimalString('19.90');
    const computed = Money.fromDecimalString('19.90').times(1);
    const spelledShort = Money.fromDecimalString('19.9');

    expect(spelledWithTrailingZero.equals(computed)).toBe(true);
    expect(spelledWithTrailingZero.equals(spelledShort)).toBe(true);
    expect(spelledWithTrailingZero.toDecimalString()).toBe(computed.toDecimalString());
    expect(spelledWithTrailingZero.toDecimalString()).toBe(spelledShort.toDecimalString());
    expect(spelledWithTrailingZero.toDecimalString()).toBe('19.9');

    expect(Money.fromDecimalString('0.00').toDecimalString()).toBe('0');
    expect(Money.fromDecimalString('-0').toDecimalString()).toBe('0');
    expect(Money.zero.toDecimalString()).toBe('0');
  });

  it('does not depend on how the value was spelled on the way in', () => {
    // The leading-dot form is accepted at construction, so the stored numeral can legitimately be
    // '.42'; canonicalisation is what stops that spelling reaching a column and breaking the
    // integer-digit guarantee.
    expect(Money.fromDecimalString('.42').toDecimalString()).toBe('0.42');
    expect(Money.fromDecimalString('-.99').toDecimalString()).toBe('-0.99');
    expect(Money.fromDecimalString('.42').toDecimalString()).toBe(
      Money.fromDecimalString('0.42').toDecimalString(),
    );
  });

  it('carries a MySQL DECIMAL(65,s) value without loss', () => {
    // The widest operand the schema can hold - 65 significant digits.
    const widest = `${'9'.repeat(45)}.${'9'.repeat(20)}`;

    expect(widest.replace('.', '')).toHaveLength(65);
    expect(Money.fromDecimalString(widest).toDecimalString()).toBe(widest);
  });

  it('preserves a computed sub-cent result through an arithmetic chain', () => {
    const extended = Money.fromDecimalString('19.99').times(3);
    const discount = extended.times(Money.fromDecimalString('12.5').dividedBy(100));

    expect(extended.toDecimalString()).toBe('59.97');
    expect(discount.toDecimalString()).toBe('7.49625');
    expect(extended.minus(discount).toDecimalString()).toBe('52.47375');
  });

  it('never emits exponential notation, at either magnitude extreme', () => {
    const large = Money.fromDecimalString('1000000000000000000000').toDecimalString();
    const small = Money.fromDecimalString('0.000000001').toDecimalString();

    expect(large).toBe('1000000000000000000000');
    expect(large).not.toContain('e');
    expect(large).not.toContain('E');
    expect(small).toBe('0.000000001');
    expect(small).not.toContain('e');
    expect(small).not.toContain('E');
  });

  it('never emits a thousands separator and always emits an integer digit', () => {
    expect(Money.fromDecimalString('1234.5').toDecimalString()).toBe('1234.5');
    expect(Money.fromDecimalString('1234.5').toDecimalString()).not.toContain(',');
    // The same leading-digit guarantee presentation makes, held by canonicalisation rather than by
    // the mask.
    expect(Money.fromDecimalString('.42').toDecimalString().startsWith('.')).toBe(false);
    expect(Money.fromDecimalString('-.99').toDecimalString().startsWith('-.')).toBe(false);
  });

  it('preserves a leading minus with no accounting notation', () => {
    const persisted = Money.fromDecimalString('-0.58').toDecimalString();

    expect(persisted).toBe('-0.58');
    expect(persisted.startsWith('-')).toBe(true);
    expect(persisted).not.toContain('(');
  });

  it('imposes no scale of its own, in either direction', () => {
    // Canonicalisation is not rounding and not padding: it normalises the numeral to the value's
    // natural scale and stops there.
    expect(Money.fromDecimalString('52.47375').toDecimalString()).toBe('52.47375');
    expect(Money.fromDecimalString('0.000000000000000001').toDecimalString()).toBe(
      '0.000000000000000001',
    );
    expect(Money.fromDecimalString('12').toDecimalString()).toBe('12');

    expect(Money.fromDecimalString('12').toFixed2()).toBe('12.00');
    expect(Money.fromDecimalString('52.47375').toFixed2()).toBe('52.47');
  });

  it('returns a string and never a number', () => {
    const persisted = Money.fromDecimalString('19.99').toDecimalString();

    expect(typeof persisted).toBe('string');
    expect(typeof persisted).not.toBe('number');
  });

  it('is not reachable by implicit coercion', () => {
    // Persistence must be an explicitly named call, exactly like presentation.
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toString')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'valueOf')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toJSON')).toBe(false);
  });
});

// The operation surface is closed.
//
// Asserting what is ABSENT is part of the contract, not defensive garnish.

describe('the closed operation surface', () => {
  it('publishes exactly the ten instance members that trace to a legacy site', () => {
    // This is the tripwire: widening the surface is a product decision and should fail here first.
    // Ten members, not nine - seven arithmetic and comparison operations plus two distinct egress
    // methods.
    const published = Object.getOwnPropertyNames(Money.prototype)
      .filter((name) => name !== 'constructor')
      .sort();

    expect(published).toEqual([
      'compare',
      'dividedBy',
      'equals',
      'isGreaterThan',
      'isLessThan',
      'minus',
      'plus',
      'times',
      'toDecimalString',
      'toFixed2',
    ]);
  });

  it('publishes exactly one construction factory and one constant', () => {
    // `toDecimalOperand` is present at runtime because TypeScript's `private` is a compile-time
    // modifier; it is the operand normaliser the four operations share, is unreachable from a
    // consumer.
    const intrinsic = new Set(['length', 'name', 'prototype']);
    const statics = Object.getOwnPropertyNames(Money)
      .filter((name) => !intrinsic.has(name))
      .sort();

    expect(statics).toEqual(['fromDecimalString', 'toDecimalOperand', 'zero']);
  });

  it('offers no numeric construction path', () => {
    // Structural rather than defensive: an IEEE-754 double cannot represent most decimal fractions
    // exactly, and admitting one is how drift would enter.
    expect('fromNumber' in Money).toBe(false);
    expect('from' in Money).toBe(false);
    expect('of' in Money).toBe(false);
    expect('parse' in Money).toBe(false);
    expect('fromCents' in Money).toBe(false);
    expect('fromDecimal' in Money).toBe(false);
  });

  it('offers no arithmetic operation beyond the four that trace to a call site', () => {
    const price = Money.fromDecimalString('19.99');

    expect('negate' in price).toBe(false);
    expect('abs' in price).toBe(false);
    expect('min' in price).toBe(false);
    expect('max' in price).toBe(false);
    expect('sum' in price).toBe(false);
    expect('average' in price).toBe(false);
    expect('power' in price).toBe(false);
    expect('sqrt' in price).toBe(false);
    expect('modulo' in price).toBe(false);
    expect('remainder' in price).toBe(false);
  });

  it('offers no rounding, allocation or distribution policy', () => {
    // A rounding POLICY belongs to `src/services/roundingRuleService.ts`, which owns the algorithm
    // and its rounding expression; an allocation policy has no legacy call site at all in this
    // slice.
    const price = Money.fromDecimalString('19.99');

    expect('round' in price).toBe(false);
    expect('floor' in price).toBe(false);
    expect('ceil' in price).toBe(false);
    expect('percentOf' in price).toBe(false);
    expect('allocate' in price).toBe(false);
    expect('split' in price).toBe(false);
    expect('distribute' in price).toBe(false);
  });

  it('offers no fluent builder and no currency-aware formatting', () => {
    const price = Money.fromDecimalString('19.99');

    expect('with' in price).toBe(false);
    expect('withAmount' in price).toBe(false);
    expect('withCurrency' in price).toBe(false);
    expect('format' in price).toBe(false);
    expect('formatCurrency' in price).toBe(false);
    expect('currency' in price).toBe(false);
    expect('currencyCode' in price).toBe(false);

    // `toLocaleString` is on `Object.prototype`, so `in` would report it present and prove
    // nothing; the meaningful assertion is that it is not overridden.
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toLocaleString')).toBe(false);
  });

  it('offers no numeric or serialisation escape hatch', () => {
    const price = Money.fromDecimalString('19.99');

    // `toJSON` and `toNumber` are not on `Object.prototype`, so plain `in` is the correct check
    // for them.
    expect('toJSON' in price).toBe(false);
    expect('toNumber' in price).toBe(false);
    expect('toFloat' in price).toBe(false);
    expect('asNumber' in price).toBe(false);
  });

  it('does not override valueOf or toString', () => {
    // The precision trap here: `valueOf` and `toString` are on `Object.prototype`, so `in` tells
    // you nothing.
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'valueOf')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toString')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toJSON')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, Symbol.toPrimitive)).toBe(false);
  });

  it('does not surface absolute', () => {
    // JUDGMENT CALL: `absolute` exists on the arithmetic substrate, where the rounding search
    // needs it to compare candidate deltas by magnitude, and it is intentionally not surfaced here
    // because no monetary call site asks for the magnitude of a price.
    const price = Money.fromDecimalString('-19.99');

    expect('absolute' in price).toBe(false);
    expect('absoluteValue' in price).toBe(false);
    expect('magnitude' in price).toBe(false);
  });
});

// Money.zero - the narrowest possible contract.
//
// CFML parity [model/service/PromotionService.cfc:L988, L989]:
// `var discountAmountPreRounding = 0;` and `var roundedFinalAmount = 0;` - the two accumulators
// `getDiscountAmount` opens with.

describe('Money.zero', () => {
  it('exists, presents as 0.00 and equals every spelling of zero', () => {
    expect(Money.zero.toFixed2()).toBe('0.00');
    expect(Money.zero.equals('0')).toBe(true);
    expect(Money.zero.equals('0.00')).toBe(true);
    expect(Money.zero.equals('-0')).toBe(true);
    expect(Money.zero.equals('.0')).toBe(true);
  });

  it('is frozen', () => {
    // Mechanical rather than conventional: a single shared constant that could be tampered with is
    // a genuine hazard, being reachable from every call site.
    expect(Object.isFrozen(Money.zero)).toBe(true);
  });

  it('is the same instance on every read', () => {
    expect(Money.zero).toBe(Money.zero);
  });

  it('participates correctly in arithmetic', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.minus(price).equals(Money.zero)).toBe(true);
    expect(price.times('0').equals(Money.zero)).toBe(true);
    expect(price.plus(Money.zero).equals(price)).toBe(true);
    expect(Money.zero.minus(price).toFixed2()).toBe('-19.99');
    expect(Money.zero.times(price).equals(Money.zero)).toBe(true);
  });

  it('participates correctly in comparison', () => {
    expect(Money.zero.compare(Money.zero)).toBe(0);
    expect(Money.zero.compare(Money.fromDecimalString('0.00'))).toBe(0);
    expect(Money.zero.isGreaterThan(Money.fromDecimalString('-0.01'))).toBe(true);
    expect(Money.zero.isLessThan(Money.fromDecimalString('0.01'))).toBe(true);
  });

  it('refuses to be a divisor', () => {
    // Zero is a legitimate VALUE and an illegitimate DIVISOR, which is why the refusal lives in
    // the operation and not in the constant.
    const price = Money.fromDecimalString('19.99');

    expect(captureFailure(() => price.dividedBy(Money.zero)).name).toBe('PrecisionError');
  });

  it('is NOT a substitute for an absent price', () => {
    // CFML parity [model/entity/Sku.cfc:L269-L273]: `getPriceByCurrencyCode` has no `else` and no
    // fallback - an unknown currency yields null.
    expect('orZero' in Money).toBe(false);
    expect('orZero' in Money.zero).toBe(false);
    expect('tryFrom' in Money).toBe(false);
    expect('parseOrZero' in Money).toBe(false);
    expect('fromDecimalStringOrZero' in Money).toBe(false);
    expect('defaultTo' in Money.zero).toBe(false);
    expect('orElse' in Money.zero).toBe(false);

    // The one construction path refuses malformed input rather than resolving it to zero - the
    // behaviour a tolerant parse would have hidden.
    expect(captureFailure(() => Money.fromDecimalString('')).name).toBe('CfmlNumberFormatError');
    expect(Money.fromDecimalString('0').equals(Money.zero)).toBe(true);
  });

  it('serves the promotion seeds only, because the two defaultless switches differ', () => {
    // CFML parity [model/service/PromotionService.cfc:L988-L989, L993-L1003]: the FIRST
    // defaultless switch seeds its accumulators at 0, so an unrecognised amount type falls through
    // to ZERO.
    const skuPrice = Money.fromDecimalString('19.99');
    const promotionSeed = Money.zero;

    expect(promotionSeed.equals(Money.zero)).toBe(true);
    expect(skuPrice.equals(Money.zero)).toBe(false);
    expect(skuPrice.toFixed2()).toBe('19.99');
  });
});

// Immutability and encapsulation.

describe('immutability', () => {
  it('freezes every instance, not just the shared constant', () => {
    expect(Object.isFrozen(Money.fromDecimalString('19.99'))).toBe(true);
    expect(Object.isFrozen(Money.fromDecimalString('19.99').times('3'))).toBe(true);
    expect(Object.isFrozen(Money.zero)).toBe(true);
  });

  it('leaves the receiver unchanged and returns a new instance from times', () => {
    const price = Money.fromDecimalString('19.99');
    const before = price.toFixed2();

    const result = price.times('3');

    expect(price.toFixed2()).toBe(before);
    expect(price.equals(Money.fromDecimalString('19.99'))).toBe(true);
    expect(result).not.toBe(price);
    expect(result.toFixed2()).toBe('59.97');
  });

  it('leaves the receiver unchanged and returns a new instance from minus', () => {
    const price = Money.fromDecimalString('59.97');
    const before = price.toFixed2();

    const result = price.minus('7.49625');

    expect(price.toFixed2()).toBe(before);
    expect(result).not.toBe(price);
    expect(result.equals(Money.fromDecimalString('52.47375'))).toBe(true);
  });

  it('leaves the receiver unchanged and returns a new instance from plus', () => {
    const price = Money.fromDecimalString('52.47');
    const before = price.toFixed2();

    const result = price.plus('7.53');

    expect(price.toFixed2()).toBe(before);
    expect(result).not.toBe(price);
    expect(result.toFixed2()).toBe('60.00');
  });

  it('leaves the receiver unchanged and returns a new instance from dividedBy', () => {
    const price = Money.fromDecimalString('12.5');
    const before = price.toFixed2();

    const result = price.dividedBy('100');

    expect(price.toFixed2()).toBe(before);
    expect(result).not.toBe(price);
    expect(result.equals(Money.fromDecimalString('0.125'))).toBe(true);
  });

  it('leaves the ARGUMENT unchanged too', () => {
    const price = Money.fromDecimalString('59.97');
    const discount = Money.fromDecimalString('7.49625');

    price.minus(discount);
    price.plus(discount);
    price.times(discount);

    expect(discount.equals(Money.fromDecimalString('7.49625'))).toBe(true);
    expect(discount.toFixed2()).toBe('7.50');
  });

  it('returns a fresh instance even when the value is unchanged', () => {
    const price = Money.fromDecimalString('19.99');

    const identity = price.times('1');

    expect(identity.equals(price)).toBe(true);
    expect(identity).not.toBe(price);
  });

  it('leaves no comparison able to mutate anything', () => {
    const price = Money.fromDecimalString('19.99');
    const other = Money.fromDecimalString('12.35');

    price.compare(other);
    price.isGreaterThan(other);
    price.isLessThan(other);
    price.equals(other);
    price.toFixed2();

    expect(price.toFixed2()).toBe('19.99');
    expect(other.toFixed2()).toBe('12.35');
  });
});

describe('encapsulation', () => {
  it('re-exports nothing from the decimal library', () => {
    // The whole target routes money arithmetic through this one surface, so the underlying library
    // must not be reachable THROUGH it.
    const exported = Object.keys(moneyModule);

    expect(exported).toEqual(['Money']);
    expect(exported).not.toContain('Decimal');
    expect(exported).not.toContain('default');
  });

  it('holds a plain decimal numeral rather than a library instance', () => {
    // JUDGMENT CALL: TypeScript's `private` is a compile-time modifier, so the internal field is
    // an ordinary own property at runtime and asserting it "absent" would be false.
    const price = Money.fromDecimalString('19.99');
    const state = ownState(price);

    expect(Object.keys(state).length).toBeGreaterThan(0);
    for (const held of Object.values(state)) {
      expect(typeof held).toBe('string');
    }
  });

  it('exposes no accessor that would hand the internal value out', () => {
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'value')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'amount')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'decimal')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'raw')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'unwrap')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toDecimal')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'inner')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'getAmount')).toBe(false);
  });

  it('does not let a consumer read the internal numeral', () => {
    const price = Money.fromDecimalString('19.99');

    // Is private, and the directive itself is the assertion.
    // @ts-expect-error - reading the internal numeral must not compile: the field
    // is private, and the directive itself is the assertion.
    const internal: unknown = price.amount;

    // Even under a deliberate breach the state is a plain numeral, never a library instance.
    expect(typeof internal).toBe('string');
  });

  it('is effectively final, because the constructor is not a public path', () => {
    // Compile; that is what makes the class effectively final.
    // @ts-expect-error - the constructor is private, so `new Money(...)` must not
    // compile; that is what makes the class effectively final.
    const constructed: unknown = new Money('19.99');

    // JUDGMENT CALL: the guarantee above is COMPILE-TIME, so this records what a deliberate breach
    // produces - an instance that is still frozen.
    expect(constructed).toBeInstanceOf(Money);
    expect(Object.isFrozen(constructed)).toBe(true);
    expect(typeof Money).toBe('function');
  });

  it('cannot be SUBCLASSED, which is the half of finality nothing else asserts', () => {
    // The private constructor and class finality are two DIFFERENT guarantees, and the test above
    // establishes only the first.

    // Private, so the class cannot be used as a base.
    // @ts-expect-error - `extends Money` must not compile: the constructor is
    // private, so the class cannot be used as a base.
    class DerivedMoney extends Money {}

    // The class must be referenced below. Under `noUnusedLocals` an unreferenced class would raise
    // a SECOND diagnostic on the same line, keeping the directive satisfied even after finality
    // had been lost.
    expect(typeof DerivedMoney).toBe('function');

    // JUDGMENT CALL: `private` is erased at runtime, so this records what a deliberate breach
    // produces - a real subclass that inherited the static factory. The guarantee is compile-time
    // only.
    expect(typeof DerivedMoney.fromDecimalString).toBe('function');
  });
});

// A non-monetary integer count may scale money but may never be added to or subtracted from it, so
// `times` and `dividedBy` admit a `number` while `minus`.

describe('the operand rule for a non-monetary integer count', () => {
  it('scales by an integer count, matching the decimal-string path exactly', () => {
    // JUDGMENT CALL: the numeric ingress is asserted here in its own block rather than in the
    // reference calculation, which deliberately takes the all-string path.
    const price = Money.fromDecimalString('19.99');

    expect(price.times(3).equals(price.times('3'))).toBe(true);
    expect(price.times(3).toFixed2()).toBe('59.97');
    expect(
      Money.fromDecimalString('12.5').dividedBy(100).equals(Money.fromDecimalString('0.125')),
    ).toBe(true);
  });

  it('rejects a fractional number outright', () => {
    // The decisive case: `times(0.125)` must fail loudly rather than admitting an IEEE-754 double
    // into a money path.
    const price = Money.fromDecimalString('19.99');
    const failure = captureFailure(() => price.times(0.125));

    expect(failure.name).toBe('PrecisionError');
    expect(failure.message).toContain('safe integer');
  });

  it('rejects a non-finite number', () => {
    const price = Money.fromDecimalString('19.99');

    expect(captureFailure(() => price.times(Number.NaN)).name).toBe('PrecisionError');
    expect(captureFailure(() => price.times(Number.POSITIVE_INFINITY)).name).toBe('PrecisionError');
    expect(captureFailure(() => price.times(Number.NEGATIVE_INFINITY)).name).toBe('PrecisionError');
    expect(captureFailure(() => price.dividedBy(Number.NaN)).name).toBe('PrecisionError');
  });

  it('rejects a magnitude beyond exact integer representation', () => {
    const price = Money.fromDecimalString('19.99');

    expect(captureFailure(() => price.times(Number.MAX_SAFE_INTEGER + 2)).name).toBe(
      'PrecisionError',
    );
  });

  it('accepts the boundary safe integers', () => {
    const price = Money.fromDecimalString('2');

    expect(price.times(Number.MAX_SAFE_INTEGER).isGreaterThan(price)).toBe(true);
    expect(price.times(0).equals(Money.zero)).toBe(true);
    expect(price.times(-1).toFixed2()).toBe('-2.00');
  });

  it('propagates the zero-divisor refusal rather than inventing a value', () => {
    // CFML parity [model/service/PromotionService.cfc:L299]: the legacy division
    // `precisionEvaluate('discountAmount / discountQuantity')` applies no zero check to its
    // divisor.
    const discountAmount = Money.fromDecimalString('7.50');

    const fromString = captureFailure(() => discountAmount.dividedBy('0'));
    const fromCount = captureFailure(() => discountAmount.dividedBy(0));
    const fromMoney = captureFailure(() => discountAmount.dividedBy(Money.zero));

    expect(fromString.name).toBe('PrecisionError');
    expect(fromCount.name).toBe('PrecisionError');
    expect(fromMoney.name).toBe('PrecisionError');
    expect(fromString.message).toContain('zero divisor');

    expect(fromString.message).not.toBe('');
    expect(discountAmount.toFixed2()).toBe('7.50');
  });

  it('does not admit a count where money is required', () => {
    // The COMPILE-TIME half of the operand rule: `minus`, `plus` and the four comparisons declare
    // a monetary operand only, so handing one a raw count does not compile.
    const price = Money.fromDecimalString('19.99');

    // @ts-expect-error - a count may scale money but never be subtracted from it.
    const subtractedCount: unknown = () => price.minus(3);

    // @ts-expect-error - a count may scale money but never be added to it.
    const addedCount: unknown = () => price.plus(3);

    // @ts-expect-error - a comparison is between two monetary values.
    const comparedCount: unknown = () => price.compare(3);

    expect(typeof subtractedCount).toBe('function');
    expect(typeof addedCount).toBe('function');
    expect(typeof comparedCount).toBe('function');
  });
});
