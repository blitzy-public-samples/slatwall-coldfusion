// slatwall-ts - unit suite for the CFML number-stringification substrate.
//
// What this SUITE PINS: `src/lib/cfml/numberFormat.ts` and nothing else - seven runtime exports
// plus one type-only export.
//
// Every expected value below was MEASURED against the shipped module.
//
// C3, TODO carry-forward: no legacy TODO falls inside this suite's source file either. That is
// stated rather than filled with an invented one.

import { describe, it, expect } from 'vitest';
import {
  CfmlNumberFormatError,
  CfmlNumberMagnitudeError,
  cfNumberToString,
  cfNumericEquals,
  cfNumericGreaterThan,
  cfNumericLessThan,
  numberFormat,
  toDecimalString,
} from '../../../../src/lib/cfml/numberFormat.js';
import type { DecimalString } from '../../../../src/lib/cfml/numberFormat.js';

// CFML parity `slatwall-ts/tsconfig.json`: the import specifier ends in `.js`, not `.ts`.
//
// JUDGMENT CALL: `describe`, `it` and `expect` are imported by name. The shipped runner sets
// `globals: false` and the compiler declares `"types": ["node"]` rather than the runner's global
// type package, so an ambient-global suite would not type-check.
//
// JUDGMENT CALL: the shipped module exports SEVEN runtime names plus the type where this suite's
// brief listed four; the extra one is `CfmlNumberFormatError`.

describe('numberFormat: provenance - the three verified legacy call sites', () => {
  // CFML parity [model/service/PromotionService.cfc:L1017]: the legacy line is
  // `return numberFormat(discountAmount, "0.00");` returned from a function declared
  // `private numeric function getDiscountAmount(...)` at
  // [model/service/PromotionService.cfc:L987].
  it('presents a discount amount as a two-decimal string, per PromotionService.cfc:L1017', () => {
    const presented = numberFormat('7.49625');

    expect(presented).toBe('7.50');
    expect(typeof presented).toBe('string');
  });

  // CFML parity [model/service/PriceGroupService.cfc:L339]: the legacy line is
  // `return numberFormat(newPrice, "0.00");`
  //
  // Only the `percentageOff` branch of that switch applies a rounding rule
  // [model/service/PriceGroupService.cfc:L326-L328]; `amountOff` at L331 and `amount` at L334 skip
  // it.
  it('presents a price-group rate result as a two-decimal string, per PriceGroupService.cfc:L339', () => {
    expect(numberFormat('59.97')).toBe('59.97');
    expect(numberFormat('12.3')).toBe('12.30');
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L89]: the legacy line is
  // `var inputValue = numberFormat(arguments.value, "0.00");` and it is the FIRST operation of
  // `roundValue`.
  it('produces the string that every downstream len() in roundValue measures', () => {
    const inputValue = numberFormat('12.3456');

    expect(inputValue).toBe('12.35');
    expect(inputValue.length).toBe(5);
    // `len(rr)` for the `'.99'` expression is 3, and L97 gates on `len(inputValue) > len(rr)`.
    // Recording the two lengths side by side makes that gate legible; evaluating it is the sibling
    // suite's job.
    expect('.99'.length).toBe(3);
  });
});

describe("numberFormat: the '0.00' mask invariants", () => {
  it('always emits exactly two decimal places, zero-padded', () => {
    expect(numberFormat('12.3')).toBe('12.30');
    expect(numberFormat('12')).toBe('12.00');
  });

  // The leading `0` of the mask guarantees an integer digit, and that is LOAD-BEARING rather than
  // cosmetic.
  it('always emits at least one integer digit - never a bare fractional form', () => {
    expect(numberFormat('0.42')).toBe('0.42');
    expect(numberFormat('.42')).toBe('0.42');
  });

  it('never emits a thousands separator', () => {
    const presented = numberFormat('1234.5');

    expect(presented).toBe('1234.50');
    expect(presented).not.toContain(',');
  });

  // A `len()`-based algorithm cannot survive exponential notation: `'1e+21'` has length 5 whatever
  // the magnitude, so every slice offset would collapse. Both ends are asserted.
  it('never emits exponential notation, at either end of the range', () => {
    const large = numberFormat('1234567890123456789012345.5');
    const small = numberFormat('0.000000001');

    expect(large).toBe('1234567890123456789012345.50');
    expect(large).not.toContain('e+');
    expect(large).not.toContain('E+');

    expect(small).toBe('0.00');
    expect(small).not.toContain('e-');
    expect(small).not.toContain('E-');
  });
  it('preserves a leading minus sign, with no accounting notation', () => {
    const presented = numberFormat('-0.58');

    expect(presented).toBe('-0.58');
    expect(presented.startsWith('-')).toBe(true);
    expect(presented).not.toContain('(');
    expect(presented.endsWith('-')).toBe(false);
    // The slice that L103 would take of this value, asserted as a string operation rather than as
    // arithmetic.
    expect(presented.slice(0, 2)).toBe('-0');
  });

  // JUDGMENT CALL: half-up rounding, and its status is exact - the source does not settle the
  // mode, and neither obvious candidate disambiguates it.
  it('rounds half away from zero at the two-decimal boundary', () => {
    expect(numberFormat('12.3456')).toBe('12.35');
    expect(numberFormat('0.005')).toBe('0.01');
    expect(numberFormat('2.675')).toBe('2.68');
  });

  // A price of `'-0.00'` would be indefensible, so the sign is dropped for every negative-zero
  // presentation - including a value that is not itself zero but rounds to zero at two decimals.
  it('normalises negative zero away', () => {
    expect(numberFormat('0')).toBe('0.00');
    expect(numberFormat('-0')).toBe('0.00');
    expect(numberFormat('-0.001')).toBe('0.00');
  });
});

describe('cfNumberToString: CFML trailing-zero dropping', () => {
  // The contract, stated once: strip all trailing zeros from the fractional part; strip the
  // decimal point too once the fraction is empty; emit plain non-exponential notation; impose no
  // scale and no padding.
  it('strips a single trailing zero from the fractional part', () => {
    expect(cfNumberToString('11.30')).toBe('11.3');
  });

  it('strips the decimal point too once the fractional part empties', () => {
    expect(cfNumberToString('11.00')).toBe('11');
  });

  it('leaves a fractional part with no trailing zero untouched', () => {
    expect(cfNumberToString('11.35')).toBe('11.35');
  });

  it('strips a trailing zero below one, keeping the integer digit', () => {
    expect(cfNumberToString('0.50')).toBe('0.5');
  });

  it('collapses a zero of any scale to a single digit', () => {
    expect(cfNumberToString('0.00')).toBe('0');
  });

  it('preserves a leading minus and strips nothing that is significant', () => {
    expect(cfNumberToString('-0.58')).toBe('-0.58');
  });

  it('preserves a leading minus while stripping a trailing zero', () => {
    expect(cfNumberToString('-11.50')).toBe('-11.5');
  });

  // No scale is imposed in either direction: significant decimals are kept in full rather than
  // truncated to two, which makes this the inverse of the presentation step, not a variant of it.
  it('imposes no scale and no padding of its own', () => {
    expect(cfNumberToString('12.3456')).toBe('12.3456');
  });

  // The plain-notation guarantee matters as much here as for the presentation function, and for
  // the same reason: a `len()`-based algorithm cannot survive an exponent.
  it('emits plain notation at either end of the range', () => {
    const small = cfNumberToString('0.000000001');
    const large = cfNumberToString('123456789012345678901234567890');

    expect(small).toBe('0.000000001');
    expect(small).not.toContain('e-');

    expect(large).toBe('123456789012345678901234567890');
    expect(large).not.toContain('e+');
  });
});

describe('cfNumberToString: THE DEFECT MECHANISM - three manifestations', () => {
  // L101 and L108 compute arithmetic results and L102 and L109 then take `len()` of them - a
  // string length of a number.

  // (a) one trailing zero stripped - the canonical case.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L101-L103]: with `inputValue = '12.30'` and
  // `rr = '.99'`, `len(rr)` is 3 so `rrPower` is 10^0 = 1. The lower intermediate `12.30 - 1` is
  // 11.3, whose string form is `'11.3'` with length 4 and not.
  it('(a) strips one trailing zero, shortening the lower intermediate to length 4', () => {
    const lowerIntermediate = cfNumberToString('11.30');

    // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: len() is taken
    // of an arithmetic result, and CFML drops trailing zeros when stringifying a number, so a
    // value whose cents end in zero takes a corrupted branch.
    // Preserved deliberately; do not fix without a product decision.
    expect(lowerIntermediate).toBe('11.3');
    expect(lowerIntermediate.length).toBe(4);

    // The corrupted slice, shown as the string operation it is. This is what L103 would take, and
    // it is a one-character prefix rather than the two-character `'11'` the algorithm assumes.
    expect(lowerIntermediate.slice(0, 1)).toBe('1');
  });

  // (b) the contrast - no trailing zero, so the same code path rounds correctly.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L101-L103]: `'12.35'` with the same
  // `rr = '.99'` gives a lower intermediate of 11.35, whose string form is `'11.35'` with length.
  it('(b) leaves a non-zero-ending intermediate at length 5, so the slice is correct', () => {
    const lowerIntermediate = cfNumberToString('11.35');

    expect(lowerIntermediate).toBe('11.35');
    expect(lowerIntermediate.length).toBe(5);

    // The correct slice, for direct comparison with (a).
    expect(lowerIntermediate.slice(0, 2)).toBe('11');
  });

  // (c) the WHOLE-DOLLAR CASE - the decimal point disappears entirely and control lands in a
  // different branch altogether, which is the pathway easiest to miss.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L102-L106]: `'12.00'` with `rr = '.99'`
  // gives a lower intermediate of 11 - both trailing zeros and the decimal point gone - whose
  // string form is `'11'` with length.
  it('(c) drops the point as well, collapsing the intermediate to length 2', () => {
    const lowerIntermediate = cfNumberToString('11.00');

    expect(lowerIntermediate).toBe('11');
    expect(lowerIntermediate.length).toBe(2);
    expect(lowerIntermediate).not.toContain('.');

    // The gate at L102 is `len(lowerValue) > len(rr)`. Both sides are recorded as string lengths,
    // in the source's own comparison direction, so the false outcome is legible without evaluating
    // the algorithm here.
    const roundingExpressionLength = '.99'.length;

    expect(roundingExpressionLength).toBe(3);
    expect(lowerIntermediate.length > roundingExpressionLength).toBe(false);
  });
});

describe('numberFormat: the mask is a literal type, not a mask engine', () => {
  it('accepts the one mask the slice uses, whether passed explicitly or defaulted', () => {
    // Both spellings must agree, because all three legacy call sites pass the mask explicitly
    // while the target's default exists so that internal callers need not repeat it.
    expect(numberFormat('12.3456', '0.00')).toBe('12.35');
    expect(numberFormat('12.3456')).toBe('12.35');
  });

  // JUDGMENT CALL: this is the suite's one deliberate compile-error assertion, structured so the
  // invalid call is never executed - the function below is declared and only inspected, which is
  // enough for the compiler to reject the argument.
  //
  // CFML parity `slatwall-ts/eslint.config.mjs`: the brief states that the `tests/**` override
  // permissive, disabling the directive check outright for the test tier, but the description is
  // supplied regardless because the stricter reading is the better one.
  // permits `@ts-expect-error` only WITH a description. The shipped configuration is in fact more
  it('rejects any other mask at compile time', () => {
    function callWithUnsupportedMask(): DecimalString {
      // Parameter, so this call cannot compile. That compile failure is the assertion, and the
      // enclosing function is never invoked, so no invalid call is ever executed.
      // @ts-expect-error A mask other than the literal '0.00' is not assignable to this
      // parameter, so this call cannot compile. That compile failure IS the assertion, and the
      // enclosing function is never invoked.
      return numberFormat('12.3456', '0.000');
    }

    expect(typeof callWithUnsupportedMask).toBe('function');
  });
});

describe('decimal-value comparison: by value, never lexically', () => {
  // CFML parity [model/service/RoundingRuleService.cfc:L120]: the legacy line is
  // `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)` and CFML compares those two
  // strings NUMERICALLY.
  it('treats values that differ only in scale as equal', () => {
    expect(cfNumericEquals('12.350', '12.35')).toBe(true);
    expect(cfNumericEquals('1.0', '1')).toBe(true);
    expect(cfNumericEquals('0.00', '0')).toBe(true);

    // The divergence being guarded against, made explicit: as raw strings these are not equal, and
    // only the numeric reading makes them so.
    const candidate: string = '12.350';
    const inputValue: string = '12.35';

    expect(candidate === inputValue).toBe(false);
  });

  it('distinguishes values that genuinely differ', () => {
    expect(cfNumericEquals('12.35', '12.99')).toBe(false);
    expect(cfNumericEquals('-0.99', '0.99')).toBe(false);
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L100]: the legacy line is
  // `if(valueOptionOne > inputValue)` which is again a numeric comparison of two strings.
  it('orders by decimal value even where a lexical reading would disagree', () => {
    expect(cfNumericGreaterThan('9.99', '12.35')).toBe(false);
    expect(cfNumericLessThan('9.99', '12.35')).toBe(true);

    // The lexical reading, on the record: `'9'` sorts after `'1'`, so as raw strings the smaller
    // number looks larger.
    const candidate: string = '9.99';
    const inputValue: string = '12.35';

    expect(candidate > inputValue).toBe(true);
  });

  it('orders neighbouring cent values correctly in both directions', () => {
    expect(cfNumericGreaterThan('0.10', '0.09')).toBe(true);
    expect(cfNumericLessThan('0.09', '0.10')).toBe(true);
  });

  // Both predicates are STRICT, and that strictness is load-bearing for the consuming algorithm.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L134, L138]: the `Closest` branch sets the
  // best delta from option one at L134, and L138 requires option TWO's delta to be strictly `<`
  // the incumbent, so on an EXACT TIE option one wins.
  it('is strict, so an exact tie is not a strict improvement in either direction', () => {
    expect(cfNumericLessThan('0.50', '0.50')).toBe(false);
    expect(cfNumericGreaterThan('0.50', '0.50')).toBe(false);
    expect(cfNumericEquals('0.50', '0.50')).toBe(true);

    // The same tie expressed across differing scales, since scale must not create a false
    // improvement either.
    expect(cfNumericLessThan('0.5', '0.50')).toBe(false);
  });
});

describe('DecimalString: the branded type and its validating constructor', () => {
  // Why the brand exists, read from source.
  it('accepts every plain decimal numeral the slice actually persists or computes', () => {
    expect(toDecimalString('12.99')).toBe('12.99');
    expect(toDecimalString('-0.99')).toBe('-0.99');
    expect(toDecimalString('0')).toBe('0');
    expect(toDecimalString('0.00')).toBe('0.00');
  });

  it('accepts the LEADING-DOT form, and brands it without rewriting it', () => {
    // The documented accepted set includes a numeral with no integer digit at all.
    //
    // CFML parity [model/entity/RoundingRule.cfc:L81]: the persisted expression is
    // validation-constrained, so it is not true that "nothing prevents" a malformed one - though
    // the constraint is weaker than it reads.
    const brandedLeadingDot: DecimalString = toDecimalString('.99');

    expect(brandedLeadingDot).toBe('.99');
    expect(toDecimalString('-.99')).toBe('-.99');

    // Contrast, so the acceptance is not mistaken for blanket tolerance of a missing digit on
    // either side: a TRAILING bare dot is still rejected.
    expect(() => toDecimalString('.')).toThrow(CfmlNumberFormatError);
  });

  // The rejections are what make the brand mean something. Each raises the module's typed error
  // rather than a bare `Error`, so a malformed candidate can be told apart from any other failure.
  it('rejects a non-numeral with the typed error this module declares', () => {
    expect(() => toDecimalString('abc')).toThrow(CfmlNumberFormatError);
  });

  it('rejects the empty string', () => {
    expect(() => toDecimalString('')).toThrow(CfmlNumberFormatError);
  });

  it('rejects grouped notation, so a thousands separator can never be branded', () => {
    expect(() => toDecimalString('1,234.50')).toThrow(CfmlNumberFormatError);
  });

  // Exponential notation is rejected specifically because a `len()`-based algorithm cannot survive
  // it.
  //
  // JUDGMENT CALL: the two formatters are more tolerant of their INPUT than this constructor is of
  // a candidate brand.
  it('rejects exponential notation as a brand candidate, while normalising it as input', () => {
    expect(() => toDecimalString('1e5')).toThrow(CfmlNumberFormatError);
    expect(cfNumberToString('1e5')).toBe('100000');
  });

  it('rejects a trailing bare dot and the non-finite spellings', () => {
    expect(() => toDecimalString('12.')).toThrow(CfmlNumberFormatError);
    expect(() => toDecimalString('NaN')).toThrow(CfmlNumberFormatError);
    expect(() => toDecimalString('Infinity')).toThrow(CfmlNumberFormatError);
  });

  it('rejects surrounding whitespace rather than trimming it', () => {
    expect(() => toDecimalString(' 12.5 ')).toThrow(CfmlNumberFormatError);
  });

  // The declared contract holds at run time, not only at compile time.
  //
  // JUDGMENT CALL: the widened alias below is how a run-time-only caller is modelled without
  // spending a comment directive. Widening to `unknown` keeps the strict profile fully intact -
  // the and no escape hatch is opened here.
  // single `@ts-expect-error` this suite is permitted belongs to the literal-mask assertion above,
  const brandCandidateAtRuntime = toDecimalString as (candidate: unknown) => DecimalString;

  it('rejects a raw number, so no IEEE-754 double can ever be branded', () => {
    expect(() => brandCandidateAtRuntime(12.5)).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(0)).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(-3)).toThrow(CfmlNumberFormatError);

    // The case that matters most: a double already carrying drift. Branding this would hand the
    // drift straight to the one abstraction introduced to keep it out.
    expect(() => brandCandidateAtRuntime(1.0000000000000002)).toThrow(CfmlNumberFormatError);

    // The refusal is still actionable - the diagnostic names what arrived.
    expect(() => brandCandidateAtRuntime(12.5)).toThrow(/received "12\.5"/);

    // The STRING spelling of each of those same numerals is still accepted, verbatim. The guard
    // refuses a SHAPE, never a value, so nothing that was admissible became inadmissible.
    expect(toDecimalString('12.5')).toBe('12.5');
    expect(toDecimalString('0')).toBe('0');
    expect(toDecimalString('-3')).toBe('-3');
    expect(toDecimalString('1.0000000000000002')).toBe('1.0000000000000002');
  });

  it('rejects every other non-string shape, including the ones that used to match', () => {
    // A single-element array and an object with a numeral-shaped `toString` are the sharp cases:
    // both have no usable `length`, both stringify to `'12.5'`.
    expect(() => brandCandidateAtRuntime(['12.5'])).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime({ toString: () => '12.5' })).toThrow(
      CfmlNumberFormatError,
    );

    // These were refused even before the guard existed, but only by accident: `String()` happens
    // not to render any of them as a plain numeral.
    expect(() => brandCandidateAtRuntime(true)).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(null)).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(undefined)).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime({})).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(Symbol('12.5'))).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(1e21)).toThrow(CfmlNumberFormatError);
  });

  it('refuses ahead of the character bound, which cannot measure a non-string', () => {
    // A shape carrying a `length` the bound WOULD reject.
    expect(() => brandCandidateAtRuntime({ length: 2000 })).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime({ length: 2000 })).toThrow(/received "\[object Object\]"/);
  });

  it('still admits its own output, so the internal re-branding is untouched', () => {
    expect(toDecimalString(numberFormat('12.3456'))).toBe('12.35');
    expect(toDecimalString(cfNumberToString('11.30'))).toBe('11.3');
  });
  it('carries no runtime cost and no runtime property', () => {
    const branded: DecimalString = toDecimalString('12.99');

    expect(typeof branded).toBe('string');

    // No enumerable property is added, so serialising a branded value cannot leak a tag.
    expect(Object.keys({ value: branded })).toEqual(['value']);
    expect(JSON.stringify({ value: branded })).toBe('{"value":"12.99"}');

    // Ordinary string operations still work, and a derived slice is correctly just a `string` -
    // the `left()` prefix `roundValue` takes is not itself a numeral, so it must not inherit the
    // brand.
    expect(branded.slice(0, 2)).toBe('12');
  });

  // Both formatters return the branded type, so the invariant is guaranteed at the point of
  // production rather than asserted afterwards by a caller.
  it('is what both formatters return', () => {
    const presented: DecimalString = numberFormat('12.3456');
    const stringified: DecimalString = cfNumberToString('11.30');

    expect(presented).toBe('12.35');
    expect(stringified).toBe('11.3');
  });
});

// The rejection path, driven through every entry point a price can flow through.

describe('the plain-decimal rendering bound: the compact exponential form', () => {
  /**
   * The exact amplification vector, in its measured form.
   */
  const AMPLIFYING_NUMERALS: readonly string[] = [
    '1e1000000',
    '1e-1000000',
    '1E1000000',
    '-1e1000000',
    '1.5e100000',
    '9e257',
    '1e-257',
  ];

  it.each(AMPLIFYING_NUMERALS)('refuses %s from numberFormat', (numeral) => {
    expect(() => numberFormat(numeral)).toThrow(CfmlNumberMagnitudeError);
  });

  it.each(AMPLIFYING_NUMERALS)('refuses %s from cfNumberToString', (numeral) => {
    expect(() => cfNumberToString(numeral)).toThrow(CfmlNumberMagnitudeError);
  });

  it('refuses an amplifying numeral from every comparison export too', () => {
    // The bound lives in the single funnel all five presentation and comparison exports pass
    // through, so one gate covers all of them and it covers both operand positions.
    expect(() => cfNumericEquals('1e1000000', '1')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericEquals('1', '1e1000000')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericGreaterThan('1e1000000', '1')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericGreaterThan('1', '1e1000000')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericLessThan('1e1000000', '1')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericLessThan('1', '1e1000000')).toThrow(CfmlNumberMagnitudeError);
  });

  it('★ reports the MEASURE and never echoes the value, so the diagnostic cannot amplify', () => {
    // Echoing a million-digit numeral into an error message which is what
    // `CfmlNumberFormatError`'s `JSON.stringify` does would reproduce the very amplification the
    // bound exists to prevent.
    let captured: unknown;

    try {
      numberFormat('1e1000000');
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CfmlNumberMagnitudeError);

    const message = captured instanceof Error ? captured.message : '';

    expect(captured instanceof Error ? captured.name : '').toBe('CfmlNumberMagnitudeError');
    expect(message).toContain('exponent was 1000000');
    expect(message).toContain('limit 256');
    // The candidate itself is absent, and so is any rendering of it.
    expect(message).not.toContain('1e1000000');
    expect(message.length).toBeLessThan(400);
  });

  it('distinguishes the exponent measure from the decimalPlaces measure', () => {
    // `1e-1000000` is caught by the exponent test, because `Decimal.e` is the exponent of the
    // LEADING significant digit and is negative here.
    const wideFraction = `0.${'0'.repeat(200)}${'1'.repeat(300)}`;

    expect(() => numberFormat(wideFraction)).toThrow(/decimalPlaces was 500/);
    expect(() => numberFormat('1e-1000000')).toThrow(/exponent was 1000000/);
  });
});

describe('the plain-decimal rendering bound: the written-out form', () => {
  it('★ refuses a million-digit plain numeral, which needs no exponent at all', () => {
    // The character gate exists because the magnitude gate alone would let this in through
    // `toDecimalString`, which does not parse. This is the same 33 MB amplification wearing
    // different clothes.
    const millionDigits = `1${'0'.repeat(1_000_000)}`;

    expect(() => toDecimalString(millionDigits)).toThrow(CfmlNumberMagnitudeError);
    expect(() => numberFormat(millionDigits)).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumberToString(millionDigits)).toThrow(CfmlNumberMagnitudeError);
  });

  it('★ checks the length BEFORE the pattern, so a malformed over-long value is not echoed', () => {
    // Ordering matters: `CfmlNumberFormatError` JSON-stringifies its candidate, so a ten-megabyte
    // malformed string reaching that branch would produce a ten-megabyte message.
    const overLongAndMalformed = `not-a-number-${'x'.repeat(2000)}`;

    let captured: unknown;

    try {
      toDecimalString(overLongAndMalformed);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CfmlNumberMagnitudeError);
    expect(captured).not.toBeInstanceOf(CfmlNumberFormatError);

    const message = captured instanceof Error ? captured.message : '';

    expect(message).toContain('characters was 2013');
    expect(message).toContain('limit 1024');
    expect(message).not.toContain('xxxx');
  });

  it('accepts a numeral exactly at the character limit and refuses the next one', () => {
    // The boundary is asserted on both sides rather than described, so an off-by-one in either
    // direction fails here rather than in production.
    const atLimit = '0'.repeat(1024);
    const overLimit = '0'.repeat(1025);

    expect(atLimit).toHaveLength(1024);
    expect(toDecimalString(atLimit)).toBe(atLimit);
    expect(() => toDecimalString(overLimit)).toThrow(/characters was 1025/);
  });
});

describe('the plain-decimal rendering bound: nothing legitimate is refused', () => {
  /**
   * Every money-shaped value this port actually handles, including the exact numerals the verified
   * rounding cases and the reference discount calculation use.
   */
  const LEGITIMATE_NUMERALS: readonly string[] = [
    '0',
    '0.00',
    '-0.01',
    '19.99',
    '24.99',
    '12.3456',
    '52.47375',
    '59.97',
    '7.49625',
    '7.42',
    '2.30',
    '0.42',
    '11.99',
    '12.99',
    '9.99',
    '10.99',
    '-1234567890.12',
    '99999999999999999.99',
    '1e3',
    '1.5e2',
    '1e256',
    '1e-256',
  ];

  it.each(LEGITIMATE_NUMERALS)('still formats %s unchanged', (numeral) => {
    expect(() => numberFormat(numeral)).not.toThrow();
    expect(() => cfNumberToString(numeral)).not.toThrow();
    expect(() => cfNumericEquals(numeral, numeral)).not.toThrow();
  });

  it('leaves the reference discount presentation byte-identical', () => {
    // The plan's verified figure: 19.99 x 3 less 12.5 per cent presents as '52.47'. A bound that
    // perturbed this would have changed money.
    expect(numberFormat('52.47375')).toBe('52.47');
    expect(numberFormat('59.97')).toBe('59.97');
    expect(cfNumberToString('11.30')).toBe('11.3');
  });

  it('★ NOTHING THIS MODULE PRODUCES CAN BE REFUSED BY THIS MODULE', () => {
    // The invariant the two constants were chosen to satisfy, asserted rather than reasoned about
    // in a comment.
    const widestAdmissible = `${'9'.repeat(257)}.${'9'.repeat(256)}`;

    const rendered = cfNumberToString(widestAdmissible);
    const formatted = numberFormat(widestAdmissible);

    // Rendering carried into a 258th integer digit, and still nowhere near 1024.
    expect(rendered.length).toBeLessThanOrEqual(1024);
    expect(formatted.length).toBeLessThanOrEqual(1024);

    // And the rendering round-trips: feeding it straight back in is accepted.
    expect(() => toDecimalString(rendered)).not.toThrow();
    expect(() => numberFormat(rendered)).not.toThrow();
    expect(() => toDecimalString(formatted)).not.toThrow();
  });

  it('bounds the worst admissible expansion to roughly half a kilobyte', () => {
    // The whole point of the exercise, stated as a number: the widest value that gets through
    // renders to hundreds of characters, not tens of millions.
    expect(cfNumberToString('1e256')).toHaveLength(257);
    expect(cfNumberToString('1e-256')).toHaveLength(258);
    expect(numberFormat('1e256')).toHaveLength(260);
  });
});

describe('the rejection path, exercised through every consumer of the private normaliser', () => {
  /**
   * What one consumer did with one rejected candidate.
   */
  interface CapturedRejection {
    readonly candidate: string;
    readonly name: string;
    readonly causeIsDefined: boolean;
    readonly echoesTheCandidate: boolean;
  }

  /**
   * Invokes a consumer with a candidate it is expected to refuse, and reports what came back.
   *
   * JUDGMENT CALL: this returns a SENTINEL row instead of throwing when the consumer returns
   * normally.
   */
  const captureRejection = (candidate: string, attempt: () => unknown): CapturedRejection => {
    try {
      attempt();
    } catch (thrown) {
      if (thrown instanceof Error) {
        return {
          candidate,
          name: thrown.name,
          causeIsDefined: thrown.cause !== undefined,
          echoesTheCandidate: thrown.message.includes(JSON.stringify(candidate)),
        };
      }

      return {
        candidate,
        name: 'NotAnError',
        causeIsDefined: false,
        echoesTheCandidate: false,
      };
    }

    return {
      candidate,
      name: '(returned normally - the candidate was ACCEPTED)',
      causeIsDefined: false,
      echoesTheCandidate: false,
    };
  };

  /**
   * One entry point, named exactly as it will read in a failure diff.
   */
  interface NormaliserConsumer {
    readonly label: string;
    readonly invoke: (candidate: string) => unknown;
  }

  // All five exports that run their arguments through the private normaliser, each two-argument
  // predicate once per operand position.
  const CONSUMERS: readonly NormaliserConsumer[] = [
    { label: 'numberFormat', invoke: (candidate) => numberFormat(candidate) },
    { label: 'cfNumberToString', invoke: (candidate) => cfNumberToString(candidate) },
    {
      label: 'cfNumericEquals (first operand)',
      invoke: (candidate) => cfNumericEquals(candidate, '0'),
    },
    {
      label: 'cfNumericEquals (second operand)',
      invoke: (candidate) => cfNumericEquals('0', candidate),
    },
    {
      label: 'cfNumericGreaterThan (first operand)',
      invoke: (candidate) => cfNumericGreaterThan(candidate, '0'),
    },
    {
      label: 'cfNumericGreaterThan (second operand)',
      invoke: (candidate) => cfNumericGreaterThan('0', candidate),
    },
    {
      label: 'cfNumericLessThan (first operand)',
      invoke: (candidate) => cfNumericLessThan(candidate, '0'),
    },
    {
      label: 'cfNumericLessThan (second operand)',
      invoke: (candidate) => cfNumericLessThan('0', candidate),
    },
  ];

  // The five malformed spellings the module's own documentation names as the ones the decimal
  // library itself throws on, so each takes the WRAPPED branch and arrives carrying a cause.
  const MALFORMED_CANDIDATES: readonly string[] = ['abc', '', '1.2.3', '1,000', ' 12.5 '];

  // The three non-finite spellings the library ACCEPTS - `new Decimal('NaN')` and
  // `new Decimal('Infinity')` both succeed - so these reach the explicit finiteness test instead,
  // and arrive with no cause.
  const NON_FINITE_CANDIDATES: readonly string[] = ['NaN', 'Infinity', '-Infinity'];

  for (const consumer of CONSUMERS) {
    it(`refuses every malformed candidate through ${consumer.label}, keeping the library cause`, () => {
      const observed = MALFORMED_CANDIDATES.map((candidate) =>
        captureRejection(candidate, () => consumer.invoke(candidate)),
      );

      expect(observed).toEqual(
        MALFORMED_CANDIDATES.map((candidate) => ({
          candidate,
          name: 'CfmlNumberFormatError',
          causeIsDefined: true,
          echoesTheCandidate: true,
        })),
      );
    });

    it(`refuses every non-finite candidate through ${consumer.label}, with no cause to wrap`, () => {
      const observed = NON_FINITE_CANDIDATES.map((candidate) =>
        captureRejection(candidate, () => consumer.invoke(candidate)),
      );

      expect(observed).toEqual(
        NON_FINITE_CANDIDATES.map((candidate) => ({
          candidate,
          name: 'CfmlNumberFormatError',
          causeIsDefined: false,
          echoesTheCandidate: true,
        })),
      );
    });
  }

  // The positive control. Without it, every rejection test above would still pass against a
  // consumer broken into refusing EVERYTHING, and the block would assert nothing about the
  // rejection path specifically.
  it('still accepts a well-formed candidate through each of those same consumers', () => {
    expect(numberFormat('12.5')).toBe('12.50');
    expect(cfNumberToString('12.50')).toBe('12.5');
    expect(cfNumericEquals('12.5', '12.50')).toBe(true);
    expect(cfNumericEquals('12.50', '12.5')).toBe(true);
    expect(cfNumericGreaterThan('12.5', '0')).toBe(true);
    expect(cfNumericGreaterThan('0', '12.5')).toBe(false);
    expect(cfNumericLessThan('0', '12.5')).toBe(true);
    expect(cfNumericLessThan('12.5', '0')).toBe(false);
  });

  // JUDGMENT CALL: these four forms are asserted as ACCEPTED, not as malformed. It is tempting to
  // fold them into the rejection tables on the reasoning that they are not plain decimal numerals,
  // and that would be wrong, because they measurably do not throw.
  it('is more tolerant of INPUT than the brand constructor is of a candidate', () => {
    // A trailing bare dot: refused as a brand, normalised as input.
    expect(() => toDecimalString('12.')).toThrow(CfmlNumberFormatError);
    expect(numberFormat('12.')).toBe('12.00');
    expect(cfNumberToString('12.')).toBe('12');

    // Exponential notation: refused as a brand, normalised as input.
    expect(() => toDecimalString('1e5')).toThrow(CfmlNumberFormatError);
    expect(numberFormat('1e5')).toBe('100000.00');
    expect(cfNumberToString('1e5')).toBe('100000');
    expect(cfNumericEquals('1e5', '100000')).toBe(true);

    // An explicit leading plus: refused as a brand, normalised as input.
    expect(() => toDecimalString('+12.5')).toThrow(CfmlNumberFormatError);
    expect(numberFormat('+12.5')).toBe('12.50');
    expect(cfNumberToString('+12.5')).toBe('12.5');

    // Hexadecimal: refused as a brand, and READ as a number by the library.
    expect(() => toDecimalString('0x1A')).toThrow(CfmlNumberFormatError);
    expect(numberFormat('0x1A')).toBe('26.00');
    expect(cfNumberToString('0x1A')).toBe('26');

    // The leading-dot form is the one member of this group that both gates accept, and the two
    // disagree only on presentation: the brand keeps the numeral verbatim while the formatters
    // supply the integer zero.
    expect(toDecimalString('.99')).toBe('.99');
    expect(numberFormat('.99')).toBe('0.99');
    expect(cfNumberToString('.99')).toBe('0.99');
    expect(cfNumericLessThan('.99', '1')).toBe(true);

    // And the tolerance stops exactly where finiteness does. `'Infinity'` is a spelling the
    // library accepts and this module refuses, at both gates.
    expect(() => toDecimalString('Infinity')).toThrow(CfmlNumberFormatError);
    expect(() => numberFormat('Infinity')).toThrow(CfmlNumberFormatError);
    expect(() => cfNumberToString('Infinity')).toThrow(CfmlNumberFormatError);
  });
});

describe('numberFormat: the decimal-fidelity presentation path', () => {
  // CFML parity [model/service/PromotionService.cfc:L1017]: the final step of the reference
  // calculation, and where the chain stops here.
  it('presents the reference discounted total with no drift', () => {
    expect(numberFormat('52.47375')).toBe('52.47');
  });

  // CFML parity [model/service/PromotionService.cfc:L1017]: `Money.toFixed2` DELEGATES to this
  // function, so the two-decimal presentation contract is owned here rather than there.
  it('is the contract Money delegates to for two-decimal presentation', () => {
    expect(numberFormat('7.49625')).toBe('7.50');
    expect(numberFormat('59.97')).toBe('59.97');
  });
});

// The `roundValue` characterization outputs are not authored here; they belong to the sibling
// `roundingRuleService.test.ts`, which owns the algorithm.
//
// CFML parity [model/service/RoundingRuleService.cfc:L88-L175]: a COUNT DRIFT worth recording. The
// plan's prose says "Nine verified results" while the table above lists TEN rows.
