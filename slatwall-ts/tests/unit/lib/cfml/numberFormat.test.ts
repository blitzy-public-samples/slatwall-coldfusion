// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for the CFML number-stringification substrate
//
// WHAT THIS SUITE PINS: `src/lib/cfml/numberFormat.ts` and nothing else - seven runtime exports
// plus one type-only export.
//
//   numberFormat           the two-decimal PRESENTATION function
//   cfNumberToString       CFML trailing-zero dropping  <- the defect MECHANISM
//   cfNumericEquals        decimal-VALUE equality
//   cfNumericGreaterThan   decimal-VALUE ordering, the `>` predicate
//   cfNumericLessThan      decimal-VALUE ordering, the `<` predicate
//   toDecimalString        the validating `DecimalString` constructor
//   CfmlNumberFormatError  the typed rejection those validators raise
//   DecimalString          the branded string type (type-only, zero runtime cost)
//
// Every expected value below was MEASURED against the shipped module.
//
// COVERAGE CLASSIFICATION: 100% NET-NEW, never presented as parity. The basis is measured: all 32
// `.cfc` files under `meta/tests/` were searched case-insensitively for `numberFormat`,
// `roundValue`, `cfNumberToString` and `precisionEvaluate`, returning ZERO hits. The two legacy
// tests extended in this migration - `meta/tests/unit/entity/BrandTest.cfc` and
// `meta/tests/unit/entity/ProductTest.cfc` - are entity-tier, and
// `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub acknowledged, not counted.
//
// A "CORRECTED", TIDIER EXPECTATION FAILS THE ACCEPTANCE GATE. `cfNumberToString()` is the
// mechanism behind a real money defect in `roundValue`
// [model/service/RoundingRuleService.cfc:L88-L175] that fires on roughly one money value in ten, so
// the three manifestations pinned below look wrong on purpose: reproduce and annotate, never fix.
// Read the attribution the right way round - `cfNumberToString()` is CORRECT CFML behaviour, and
// the DEFECT is `roundValue` taking `len()` of an arithmetic result. The algorithm and its numbered
// defect-register entry belong to `services/roundingRuleService.ts` and its own suite.
//
// EVERY EXPORT UNDER TEST RETURNS A STRING; NONE RETURNS A NUMERIC. The legacy code hides that
// duality rather than declaring it - [model/service/PromotionService.cfc:L1017] reads
//
//     return numberFormat(discountAmount, "0.00");
//
// returned from a function declared `private numeric function
// getDiscountAmount(...)` at [model/service/PromotionService.cfc:L987]. CFML
// silently coerces the string back to a numeric. The target does not paper over
// it, and neither does this suite: the string boundary is asserted explicitly.
//
// ---------------------------------------------------------------------------
// A GENUINELY ISOLATED TIER - THE ASSERTIONS ARE CARRIED OVER, THE HARNESS IS
// NOT.
// ---------------------------------------------------------------------------
// The legacy "unit" tier is integration-style at every level:
// `meta/tests/unit/SlatwallUnitTestBase.cfc:L52` calls
// `createObject("component", "Slatwall.Application")` and `:L60` calls
// `bootstrap()`, booting the real ORM and dependency-injection container before
// every single test. Nothing of that shape survives here. This suite touches no
// database, no network, no filesystem and no environment variable, installs no
// spy, and holds no mutable module-level state - every subject is constructed
// fresh inside the test that uses it. It passes with a completely empty
// environment, and contains no credential, host name, port, or connection
// detail of any kind, not even an illustrative one.
//
// The test tier's UTC policy, its quiet environment load and its global spy
// restoration all live in the single setup module registered by
// `vitest.config.ts`. That module is deliberately NOT imported here: it is
// applied globally by the runner, this suite has no date, environment or
// mocking dimension, and importing it would duplicate a global.
//
// Two legacy conventions are carried over for lineage, and only as patterns.
// Fixture construction follows `meta/tests/unit/Helper.cfc` in spirit, with its
// build-save-flush cycle, its ORM entity factory and flush calls, its null-cast
// idiom, its ambient request-scope reads and its every service-locator lookup
// all dropped. Note also that `meta/tests/unit/Helper.cfc:L53` and
// `meta/tests/unit/IssuesTest.cfc:L55` both declare `productData` without
// `var`, leaking it into component scope: that is a hygiene defect in the
// harness being REPLACED, not one of the thirty preserved business-logic
// defects, and it is not reproduced. Regression suites follow the
// `issue_<ticket#>` convention seen at `meta/tests/unit/IssuesTest.cfc:L51`.
// No such case falls inside this suite, so none is fabricated here - the known
// one, for the preserved no-op at
// [model/service/PromotionService.cfc:L542-L544], belongs to the promotion
// characterization suite.
//
// C3, TODO carry-forward: no legacy TODO falls inside this suite's source file
// either. That is stated rather than filled with an invented one.
//
// FIXTURE PROVENANCE: `meta/tests/unit/Helper.cfc` is followed in spirit only - its
// build-save-flush cycle, ORM entity factory, null-cast idiom, ambient request-scope reads and
// service-locator lookups all dropped, as is the `productData` declared without `var` at
// [meta/tests/unit/Helper.cfc:L53], a hygiene defect in the harness being REPLACED. Regression
// suites follow the `issue_<ticket#>` convention at [meta/tests/unit/IssuesTest.cfc:L51].
// ---------------------------------------------------------------------------

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

// CFML parity [slatwall-ts/tsconfig.json]: the import specifier ends in `.js`, not `.ts`.
// `allowImportingTsExtensions` is absent from the shipped compiler configuration and the package is
// ESM under `NodeNext` resolution, so `.js` is the only extension that resolves.
//
// JUDGMENT CALL: `describe`, `it` and `expect` are imported by name. The shipped runner sets
// `globals: false` and the compiler declares `"types": ["node"]` rather than the runner's global
// type package, so an ambient-global suite would not type-check.
//
// JUDGMENT CALL: the shipped module exports SEVEN runtime names plus the type where this suite's
// brief listed four; the extra one is `CfmlNumberFormatError`. Conforming to the shipped file is
// binding, and the traceability requirement that every shipped export carry a test then obliges
// coverage for it, supplied by the rejection assertions in the `DecimalString` block. No private
// helper is reached for: `TwoDecimalMask`, the validating patterns, the frozen decimal constructor
// and the input normaliser are reached only through the public surface.
//
// `decimal.js` is NOT imported and no instance constructed, even though both formatters accept one:
// the suite drives the string overload every legacy call site uses. `precision.ts` is not imported
// either - arithmetic belongs to that module and its own suite.

describe('numberFormat: provenance - the three verified legacy call sites', () => {
  // CFML parity [model/service/PromotionService.cfc:L1017]: the legacy line is
  //   `return numberFormat(discountAmount, "0.00");`
  // returned from a function declared
  //   `private numeric function getDiscountAmount(...)`
  // at [model/service/PromotionService.cfc:L987]. The declared type is numeric and the returned
  // value is a string; CFML coerces silently. This asserts BOTH the presented text and that the
  // result really is a string.
  it('presents a discount amount as a two-decimal string, per PromotionService.cfc:L1017', () => {
    const presented = numberFormat('7.49625');

    expect(presented).toBe('7.50');
    expect(typeof presented).toBe('string');
  });

  // CFML parity [model/service/PriceGroupService.cfc:L339]: the legacy line is
  //   `return numberFormat(newPrice, "0.00");`
  //
  // LOCATOR DRIFT, RECORDED DELIBERATELY. The plan publishes this call site as L337, but verified
  // reading shows L336 closing the amount-type switch, L337 holding a lone tab, L338 the comment
  // about returning a two-decimal number and L339 the return. L339 is correct, and the shipped
  // module records the same correction.
  //
  // Only the `percentageOff` branch of that switch applies a rounding rule
  // [model/service/PriceGroupService.cfc:L326-L328]; `amountOff` at L331 and `amount` at L334 skip
  // it. That asymmetry belongs to the sibling price-group suite - what belongs here is that the
  // presentation step runs identically whichever branch produced the value.
  it('presents a price-group rate result as a two-decimal string, per PriceGroupService.cfc:L339', () => {
    expect(numberFormat('59.97')).toBe('59.97');
    expect(numberFormat('12.3')).toBe('12.30');
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L89]: the legacy line is
  //   `var inputValue = numberFormat(arguments.value, "0.00");`
  // and it is the FIRST operation of `roundValue`. That is why the whole algorithm is
  // decimal-STRING manipulation: `inputValue` is a string from the outset, so every downstream
  // `len()` at L97, L102 and L109 is a string length and every `left()` at L98, L103 and L110 is a
  // string slice.
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
  // cosmetic. `roundValue` builds its first candidate at
  // [model/service/RoundingRuleService.cfc:L98] as
  //   `left(inputValue, len(inputValue)-len(rr)) & rr`
  // and for the input 0.42 with the expression '.99', `len(inputValue)` is 4 and `len(rr)` is 3, so
  // the slice is `left('0.42', 1)` = `'0'` and the candidate is `'0' & '.99'` = `'0.99'`. Had the
  // presentation emitted `'.42'` the slice would have been `'.'` and the candidate `'..99'`, which
  // is not a numeral at all.
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

  // Also LOAD-BEARING. Negative intermediates are genuinely reachable: the characterization input
  // 0.42 with the expression '.99' takes the L101 branch `var lowerValue = inputValue - rrPower;`,
  // and with `rrPower` of 1 that intermediate is -0.58. Because L103 slices with
  //   `left(lowerValue, len(lowerValue)-len(rr))`
  // and `len('-0.58')` is 5 while `len('.99')` is 3, the slice is `left('-0.58', 2)` = `'-0'`,
  // yielding the candidate `'-0.99'`. Drop the sign and that candidate changes.
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

  // JUDGMENT CALL: half-up rounding, and its status is exact - the source does NOT settle the mode,
  // and neither obvious candidate disambiguates it. The reference chain's `52.47375` and the
  // characterization input `12.3456` both have a third decimal that rounds identically under every
  // common mode. Half-up is therefore a DECLARED CHOICE, not verified legacy behaviour, and the two
  // exact-half cases below distinguish it: under half-even `'0.005'` would present as `'0.00'` and
  // `'2.675'` as `'2.68'`; under half-down `'0.005'` would present as `'0.00'`. Both round up.
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
  // The contract, stated once: strip ALL trailing zeros from the fractional part; strip the decimal
  // point too once the fraction is empty; emit plain non-exponential notation; impose no scale and
  // no padding; preserve a leading minus. This is the exact inverse of `numberFormat`'s padding,
  // and the two live in one module because `roundValue` applies one and then measures the other.
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

  // The plain-notation guarantee matters as much here as for the presentation function, and for the
  // same reason: a `len()`-based algorithm cannot survive an exponent.
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
  // Read this block against the source, quoted here verbatim rather than paraphrased:
  //
  //   L95   var rrPower = 1 * (10 ^ (len(rr)-3));
  //   L97   if(len(inputValue) > len(rr)) {
  //   L98       var valueOptionOne = left(inputValue, len(inputValue)-len(rr)) & rr;
  //   L100      if(valueOptionOne > inputValue) {
  //   L101          var lowerValue = inputValue - rrPower;
  //   L102          if(len(lowerValue) > len(rr)) {
  //   L103              var valueOptionTwo = left(lowerValue, len(lowerValue)-len(rr)) & rr;
  //   L104          } else {
  //   L105              var valueOptionTwo = rr;
  //   L106          }
  //   L107      } else {
  //   L108          var higherValue = inputValue + rrPower;
  //   L109          if(len(higherValue) > len(rr)) {
  //
  // L101 and L108 compute ARITHMETIC results and L102 and L109 then take `len()` of them - a STRING
  // length of a NUMBER - so the length measured is that of the trailing-zero-stripped form rather
  // than of a two-decimal form, and the `left()` slice on the next line lands at the wrong offset.
  // Each manifestation below asserts BOTH the string form AND its `.length`, because the length is
  // the quantity the defect turns on, and no arithmetic intermediate is computed in TypeScript
  // here: each is supplied as a decimal-string LITERAL. Computing `12.30 - 1` here would introduce
  // raw arithmetic on a monetary value and relocate `precision.ts`'s responsibility into this
  // suite.

  // (a) ONE TRAILING ZERO STRIPPED - the canonical case.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L101-L103]: with `inputValue = '12.30'` and
  // `rr = '.99'`, `len(rr)` is 3 so `rrPower` is 10^0 = 1. The lower intermediate `12.30 - 1` is
  // 11.3, whose string form is `'11.3'` with length 4 and NOT 5. L102 still passes, so L103 slices
  // `left('11.3', 4 - 3)` = `'1'` and the candidate becomes `'1' & '.99'` = `'1.99'` instead of
  // `'11.99'`. Its delta from 12.30 balloons to 10.31, so the `Closest` branch selects `'12.99'`
  // (delta 0.69) where a correct implementation would have selected `'11.99'` (delta 0.31).
  it('(a) strips one trailing zero, shortening the lower intermediate to length 4', () => {
    const lowerIntermediate = cfNumberToString('11.30');

    // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: len() is taken of
    // an arithmetic result, and CFML drops trailing zeros when stringifying a number, so a value
    // whose cents end in zero takes a corrupted branch.
    //
    // Preserved deliberately; do not fix without a product decision.
    expect(lowerIntermediate).toBe('11.3');
    expect(lowerIntermediate.length).toBe(4);

    // The corrupted slice, shown as the string operation it is. This is what L103 would take, and
    // it is a one-character prefix rather than the two-character `'11'` the algorithm assumes.
    expect(lowerIntermediate.slice(0, 1)).toBe('1');
  });

  // (b) THE CONTRAST - NO TRAILING ZERO, so the same code path rounds correctly.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L101-L103]: `'12.35'` with the same
  //   `rr = '.99'`
  // gives a lower intermediate of 11.35, whose string form is `'11.35'` with length
  // 5. `5 > 3` holds, L103 slices `left('11.35', 5 - 3)` = `'11'`, and the candidate is `'11.99'` -
  // delta 0.36, beating `'12.99'`'s 0.64. Asserting this alongside (a) records what matters most
  // about the defect: it is DATA-DEPENDENT. Any value whose cents end in zero takes the corrupted
  // branch, roughly one money value in ten.
  it('(b) leaves a non-zero-ending intermediate at length 5, so the slice is correct', () => {
    const lowerIntermediate = cfNumberToString('11.35');

    expect(lowerIntermediate).toBe('11.35');
    expect(lowerIntermediate.length).toBe(5);

    // The correct slice, for direct comparison with (a).
    expect(lowerIntermediate.slice(0, 2)).toBe('11');
  });

  // (c) THE WHOLE-DOLLAR CASE - the decimal point disappears entirely and control lands in a
  // different branch altogether, which is the pathway easiest to miss.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L102-L106]: `'12.00'` with `rr = '.99'`
  // gives a lower intermediate of 11 - both trailing zeros AND the decimal point gone - whose
  // string form is `'11'` with length 2. The L102 gate `2 > 3` is FALSE, so execution falls into
  // the else branch at L104-L106 and `valueOptionTwo` becomes the rounding expression itself,
  // `'.99'`. The trailing-zero drop has not shifted a slice offset; it changed which branch runs.
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
    // Both spellings must agree, because all three legacy call sites pass the mask explicitly while
    // the target's default exists so that internal callers need not repeat it.
    expect(numberFormat('12.3456', '0.00')).toBe('12.35');
    expect(numberFormat('12.3456')).toBe('12.35');
  });

  // JUDGMENT CALL: this is the suite's ONE deliberate compile-error assertion, structured so the
  // invalid call is never executed - the function below is declared and only inspected, which is
  // enough for the compiler to reject the argument. If the mask parameter were ever widened to
  // `string` the directive would stop matching an error and `tsc` would fail on the now-unused
  // suppression, so this assertion cannot rot silently.
  //
  // There is deliberately NO general CFML mask engine in the target. The `_`, `9`, `,`, `.`, `+`,
  // `-`, `()`, `L`, `C` and `$` mask characters are unsupported by construction, because no mask
  // other than `"0.00"` appears anywhere in the in-scope slice. Widening that would be a product
  // decision, not a tidy-up.
  //
  // CFML parity [slatwall-ts/eslint.config.mjs]: the brief states that the `tests/**` override
  // permits `@ts-expect-error` only WITH a description. The shipped configuration is in fact more
  // permissive, disabling the directive check outright for the test tier, but the description is
  // supplied regardless because the stricter reading is the better one.
  it('rejects any other mask at compile time', () => {
    function callWithUnsupportedMask(): DecimalString {
      // @ts-expect-error A mask other than the literal '0.00' is not assignable to this
      // parameter, so this call cannot compile. That compile failure IS the assertion, and the
      // enclosing function is never invoked, so no invalid call is ever executed.
      return numberFormat('12.3456', '0.000');
    }

    expect(typeof callWithUnsupportedMask).toBe('function');
  });
});

describe('decimal-value comparison: by value, never lexically', () => {
  // CFML parity [model/service/RoundingRuleService.cfc:L120]: the legacy line is
  //   `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)`
  // and CFML compares those two strings NUMERICALLY, so a candidate differing only in scale still
  // triggers the early return at L121. A JavaScript string comparison would report them as
  // different and miss it, which is why a dedicated predicate exists rather than `===`.
  it('treats values that differ only in scale as equal', () => {
    expect(cfNumericEquals('12.350', '12.35')).toBe(true);
    expect(cfNumericEquals('1.0', '1')).toBe(true);
    expect(cfNumericEquals('0.00', '0')).toBe(true);

    // The divergence being guarded against, made explicit: as raw strings these are not equal, and
    // only the numeric reading makes them so. The two are held in `string`-typed locals rather than
    // compared as literals, because comparing two non-overlapping literal types is itself a compile
    // error - a neat second proof that the lexical reading is the wrong tool.
    const candidate: string = '12.350';
    const inputValue: string = '12.35';

    expect(candidate === inputValue).toBe(false);
  });

  it('distinguishes values that genuinely differ', () => {
    expect(cfNumericEquals('12.35', '12.99')).toBe(false);
    expect(cfNumericEquals('-0.99', '0.99')).toBe(false);
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L100]: the legacy line is
  //   `if(valueOptionOne > inputValue)`
  // which is again a numeric comparison of two strings. The divergence here is reachable rather
  // than theoretical - the pair below arises directly from the `7.42` with `'9.99'`
  // characterization case - and it points the opposite way to the lexical reading.
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
  // best delta from option ONE at L134, and L138 requires option TWO's delta to be strictly `<` the
  // incumbent, so on an EXACT TIE option ONE wins. The same shape backs the absolute-value delta
  // tests at L124 and L128, the `Up` guards at L145 and L149, and the `Down` guards at L156 and
  // L160.
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
  // WHY THE BRAND EXISTS, read from source. `roundValue` at
  // [model/service/RoundingRuleService.cfc:L88] declares
  //   `public string function roundValue(required any value,`
  //   `string roundingExpression="0.00", string roundingDirection="Closest")`
  // while BOTH callers declare `returntype="numeric"` - `roundValueByRoundingRuleID` at
  // [model/service/RoundingRuleService.cfc:L79] and `roundValueByRoundingRule` at
  // [model/service/RoundingRuleService.cfc:L84]. `PriceGroupService` feeds the result straight into
  // `precisionEvaluate` at [model/service/PriceGroupService.cfc:L323] and
  // [model/service/PriceGroupService.cfc:L331]. CFML papers over that with implicit coercion;
  // TypeScript cannot, so `roundValue` returns a branded decimal string and callers convert.
  it('accepts every plain decimal numeral the slice actually persists or computes', () => {
    expect(toDecimalString('12.99')).toBe('12.99');
    expect(toDecimalString('-0.99')).toBe('-0.99');
    expect(toDecimalString('0')).toBe('0');
    expect(toDecimalString('0.00')).toBe('0.00');
  });

  it('accepts the LEADING-DOT form, and brands it without rewriting it', () => {
    // The documented accepted set includes a numeral with no integer digit at all, and that member
    // has to be asserted separately: a validator narrowed to require a leading digit would still
    // satisfy every other case in this block.
    //
    // The form is not hypothetical - it is the shape the slice's own rounding expressions take.
    // `.99` and the multi-option `.95,.99` are characterization inputs whose measured outputs this
    // port is pinned to.
    //
    // CFML parity [model/entity/RoundingRule.cfc:L81]: the persisted expression IS
    // validation-constrained, so it is not true that "nothing prevents" a malformed one - though
    // the constraint is weaker than it reads. The column is
    //   `property name="roundingRuleExpression" ormtype="string";`
    // which is unconstrained in length, and `model/validation/RoundingRule.json:L4` invokes the
    // validator DECLARATIVELY as
    //  `[{"contexts":"save","required":true,"method":"hasExpressionWithListOfNumericValuesOnly"}]`
    // so `hasExpressionWithListOfNumericValuesOnly` is NOT dead code. It tests
    //   `(len(thisValue) - find(".", thisValue)) != 2 || !isNumeric(thisValue)`
    // and CFML's `find()` returns 0 when the dot is absent: `'9'` FAILS at `1 - 0 = 1` and `'999'`
    // at `3 - 0 = 3`, but dot-less `'99'` PASSES at `2 - 0 = 2`, so the minimum valid persisted
    // entry is TWO characters, not three. `.99` passes as `3 - 1 = 2`, so a leading-dot expression
    // reaches it exactly as written, and `len(rr) = 2` makes
    //   `rrPower = 10 ^ (2-3) = 0.1`
    // [model/service/RoundingRuleService.cfc:L95] reachable from validly-saved data. That is also
    // why the sibling `truthiness.test.ts` pins `cfLen('99')` to 2.
    //
    // Two properties, not one. It VALIDATES, and it is returned VERBATIM: no integer zero is
    // inserted, so the brand does not quietly normalise its input. That matters because the
    // rounding algorithm measures and slices the numeral - a helpfully inserted `0` would change a
    // prefix length and with it the money.
    const brandedLeadingDot: DecimalString = toDecimalString('.99');

    expect(brandedLeadingDot).toBe('.99');
    expect(toDecimalString('-.99')).toBe('-.99');

    // Contrast, so the acceptance is not mistaken for blanket tolerance of a missing digit on
    // either side: a TRAILING bare dot is still rejected.
    expect(() => toDecimalString('.')).toThrow(CfmlNumberFormatError);
  });

  // The rejections are what make the brand mean something. Each raises the module's typed error
  // rather than a bare `Error`, so a malformed candidate can be told apart from any other failure.
  // This is also the coverage for `CfmlNumberFormatError` itself.
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
  // a candidate brand. `cfNumberToString('1e5')` succeeds and normalises to `'100000'` because
  // input is parsed by the decimal library and only OUTPUT is branded, while
  // `toDecimalString('1e5')` rejects outright. Input tolerance and brand strictness are
  // deliberately not the same thing, and both behaviours are asserted so neither can drift.
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

  // ★ THE DECLARED CONTRACT HOLDS AT RUN TIME, NOT ONLY AT COMPILE TIME.
  //
  // The parameter is typed `string`, but a type annotation is erased before anything executes, and
  // this is the single validator standing behind `Money.fromDecimalString`. Anything reaching it
  // from untyped JavaScript - a JSON request body, a driver row typed more loosely than it arrives,
  // an `as` cast made somewhere else - arrives unchecked. Two coercions used to conspire to let a
  // non-string through:
  //
  //   * the character bound reads `value.length`, which is `undefined` on a number, and
  //     `undefined > 1024` evaluates to `false`, so no bound was applied at all;
  //   * `RegExp.prototype.test` coerces its argument with `String()`, so the number `12.5` was
  //     tested as the string `'12.5'` and matched the plain-numeral pattern.
  //
  // The function then returned the value ITSELF, branded. A branded non-string is precisely what
  // the rest of this suite takes to be impossible: a `DecimalString` is measured with `.length`,
  // sliced with `.slice` and compared as text throughout, and every one of those behaves
  // differently on a number.
  //
  // JUDGMENT CALL: the widened alias below is how a run-time-only caller is modelled without
  // spending a comment directive. Widening to `unknown` keeps the strict profile fully intact - the
  // single `@ts-expect-error` this suite is permitted belongs to the literal-mask assertion above,
  // and no escape hatch is opened here.
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

    // ...while the STRING spelling of each of those same numerals is still accepted, verbatim. The
    // guard refuses a SHAPE, never a value, so nothing that was admissible became inadmissible.
    expect(toDecimalString('12.5')).toBe('12.5');
    expect(toDecimalString('0')).toBe('0');
    expect(toDecimalString('-3')).toBe('-3');
    expect(toDecimalString('1.0000000000000002')).toBe('1.0000000000000002');
  });

  it('rejects every other non-string shape, including the ones that used to match', () => {
    // A single-element array and an object with a numeral-shaped `toString` are the sharp cases:
    // both have no usable `length`, both stringify to `'12.5'`, and both therefore SATISFIED the
    // pattern and came back branded. They demonstrate that the coercion was never number-specific.
    expect(() => brandCandidateAtRuntime(['12.5'])).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime({ toString: () => '12.5' })).toThrow(
      CfmlNumberFormatError,
    );

    // These were refused even before the guard existed, but only by accident: `String()` happens
    // not to render any of them as a plain numeral. They are asserted so the refusal is now
    // principled and pinned rather than incidental.
    expect(() => brandCandidateAtRuntime(true)).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(null)).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(undefined)).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime({})).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(Symbol('12.5'))).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime(1e21)).toThrow(CfmlNumberFormatError);
  });

  it('refuses ahead of the character bound, which cannot measure a non-string', () => {
    // A shape carrying a `length` the bound WOULD reject. This is the observable proof of ORDERING:
    // reached in the other order it raises the magnitude error instead, mislabelling a wrong-type
    // input as an over-wide numeral - and for a number, where `length` is `undefined`, the bound
    // silently applies to nothing at all. The two error types are unrelated classes, so asserting
    // one is asserting the absence of the other.
    expect(() => brandCandidateAtRuntime({ length: 2000 })).toThrow(CfmlNumberFormatError);
    expect(() => brandCandidateAtRuntime({ length: 2000 })).toThrow(/received "\[object Object\]"/);
  });

  it('still admits its own output, so the internal re-branding is untouched', () => {
    // Both formatters re-brand their own result through this very gate, so a guard even slightly
    // too broad would have broken this module from the inside rather than at a call site. Composing
    // them proves the round trip end to end.
    expect(toDecimalString(numberFormat('12.3456'))).toBe('12.35');
    expect(toDecimalString(cfNumberToString('11.30'))).toBe('11.3');
  });

  // The brand is a phantom: a `declare const` on a `unique symbol` exists only in the type system,
  // emits no JavaScript and attaches no property to any value, so at run time a `DecimalString` is
  // exactly a string - which is why it can be compared, sliced and measured like one throughout
  // this suite. Asserted rather than assumed, because a wrapper-based brand would still type-check
  // at every call site above. There is deliberately no blanket unvalidated cast helper and none is
  // improvised here: every branded value in this file comes from the validating constructor or from
  // a formatter, never from a type assertion.
  it('carries no runtime cost and no runtime property', () => {
    const branded: DecimalString = toDecimalString('12.99');

    expect(typeof branded).toBe('string');

    // No enumerable property is added, so serialising a branded value cannot leak a tag.
    expect(Object.keys({ value: branded })).toEqual(['value']);
    expect(JSON.stringify({ value: branded })).toBe('{"value":"12.99"}');

    // Ordinary string operations still work, and a derived slice is correctly just a `string` - the
    // `left()` prefix `roundValue` takes is not itself a numeral, so it must not inherit the brand.
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

// ---------------------------------------------------------------------------
// The rejection path, driven through EVERY entry point a price can flow through
// ---------------------------------------------------------------------------
//
// WHY THIS BLOCK EXISTS. This module has TWO independent input gates: `toDecimalString` validates
// against `PLAIN_DECIMAL_NUMERAL`, while the private input normaliser validates by CONSTRUCTING a
// decimal and testing finiteness - and the normaliser is what all five other exports run their
// arguments through.
//
// Those two gates DISAGREE, measured rather than supposed - see the tolerance test at the end of
// this block, where `'1e5'`, `'12.'`, `'+12.5'` and `'0x1A'` are rejected by the first and accepted
// by the second. So an assertion that `toDecimalString('NaN')` throws says nothing about whether
// `numberFormat('NaN')` throws - and the guarantee that nothing `NaN`-bearing reaches a price is
// owed by the formatters, at verified legacy call sites [model/service/PromotionService.cfc:L1017],
// [model/service/PriceGroupService.cfc:L339] and [model/service/RoundingRuleService.cfc:L89] - and
// through the three predicates `roundValue` uses to pick between candidates
// [model/service/RoundingRuleService.cfc:L100, L124, L128, L134, L138, L145, L149, L156, L160]. All
// five are asserted below, each two-argument predicate in BOTH operand positions, because a
// normaliser wired into only the first argument would still satisfy a first-argument-only test.
//
// Those two gates DISAGREE, and the disagreement is measured rather than
// supposed - see the tolerance test at the end of this block, where `'1e5'`,
// `'12.'`, `'+12.5'` and `'0x1A'` are rejected by the first gate and accepted by
// the second. So an assertion that `toDecimalString('NaN')` throws says nothing
// whatsoever about whether `numberFormat('NaN')` throws: different gate,
// different rule.
//
// That matters because the module's stated guarantee is that nothing
// `NaN`-bearing can ever reach a price, and a price does not reach this module
// through `toDecimalString`. It reaches it through the two formatters - the
// verified legacy call sites are [model/service/PromotionService.cfc:L1017],
// [model/service/PriceGroupService.cfc:L339] and
// [model/service/RoundingRuleService.cfc:L89] - and through the three
// comparison predicates that `roundValue` uses to pick between candidates
// [model/service/RoundingRuleService.cfc:L100, L124, L128, L134, L138, L145,
// L149, L156, L160]. Every one of those five is asserted below, and each
// two-argument predicate is asserted in BOTH operand positions, because a
// normaliser wired into only the first argument would still satisfy a
// first-argument-only test.
//
// The two rejection branches are also told apart rather than lumped together.
// Malformed input throws from inside the decimal library, and that throw is
// WRAPPED with the original kept as `cause`. A non-finite spelling parses
// cleanly and is rejected by the explicit finiteness test afterwards, so it
// carries NO cause. Asserting only `CfmlNumberFormatError` would let those two
// paths be collapsed into one; asserting the presence and absence of `cause`
// keeps both reachable and distinguishable.
// ===========================================================================
// THE PLAIN-DECIMAL RENDERING BOUND
//
// A TARGET-ONLY HAZARD, CLOSED. CFML numerals were IEEE-754 doubles:
// `1e1000000` overflowed to Infinity and `10^1997` did the same, so no CFML
// expression could produce a plain rendering wider than about 320 characters.
// An arbitrary-precision decimal renders EVERY digit, so the substrate choice
// introduced an amplification the source could not express — measured on the
// pinned library, a nine-character `1e1000000` expands to 1,000,001 characters,
// and `1e-1000000` to 1,000,002.
//
// Bounding it therefore removes NO legacy behaviour, which is why this is not a
// register entry and not a deliberate divergence from anything the CFML did.
// The two gates are a character count on the raw numeral and a magnitude test on
// the parsed value; the second exists because the first cannot see the compact
// form.
//
// NET-NEW coverage. No `meta/tests/**` file exercises numeric width.
// ===========================================================================

describe('the plain-decimal rendering bound: the compact exponential form', () => {
  /** The exact amplification vector, in its measured form. */
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
    // The bound lives in the single funnel all five presentation and comparison
    // exports pass through, so one gate covers all of them — and it covers BOTH
    // operand positions, which a per-call-site guard would have been able to miss.
    expect(() => cfNumericEquals('1e1000000', '1')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericEquals('1', '1e1000000')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericGreaterThan('1e1000000', '1')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericGreaterThan('1', '1e1000000')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericLessThan('1e1000000', '1')).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumericLessThan('1', '1e1000000')).toThrow(CfmlNumberMagnitudeError);
  });

  it('★ reports the MEASURE and never echoes the value, so the diagnostic cannot amplify', () => {
    // Echoing a million-digit numeral into an error message — which is what
    // `CfmlNumberFormatError`'s `JSON.stringify` does — would reproduce the very
    // amplification the bound exists to prevent. The magnitude error names the
    // measure, the observed figure and the limit, and nothing else.
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
    // `1e-1000000` is caught by the exponent test, because `Decimal.e` is the
    // exponent of the LEADING significant digit and is negative here. A value with
    // a leading digit inside the bound but a huge fraction is caught by the second
    // test instead, and the two are reported distinctly so a reader of a log can
    // tell which shape arrived.
    const wideFraction = `0.${'0'.repeat(200)}${'1'.repeat(300)}`;

    expect(() => numberFormat(wideFraction)).toThrow(/decimalPlaces was 500/);
    expect(() => numberFormat('1e-1000000')).toThrow(/exponent was 1000000/);
  });
});

describe('the plain-decimal rendering bound: the written-out form', () => {
  it('★ refuses a million-digit plain numeral, which needs no exponent at all', () => {
    // The character gate exists because the magnitude gate alone would let this in
    // through `toDecimalString`, which does not parse. This is the same 33 MB
    // amplification wearing different clothes.
    const millionDigits = `1${'0'.repeat(1_000_000)}`;

    expect(() => toDecimalString(millionDigits)).toThrow(CfmlNumberMagnitudeError);
    expect(() => numberFormat(millionDigits)).toThrow(CfmlNumberMagnitudeError);
    expect(() => cfNumberToString(millionDigits)).toThrow(CfmlNumberMagnitudeError);
  });

  it('★ checks the length BEFORE the pattern, so a malformed over-long value is not echoed', () => {
    // Ordering matters: `CfmlNumberFormatError` JSON-stringifies its candidate, so a
    // ten-megabyte malformed string reaching THAT branch would produce a
    // ten-megabyte message. The length gate runs first and raises the non-echoing
    // error instead.
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
    // The boundary is asserted on both sides rather than described, so an
    // off-by-one in either direction fails here rather than in production.
    // A 1024-character numeral is admissible as a SHAPE; its magnitude is a
    // separate question, which is why this asserts through `toDecimalString`.
    const atLimit = '0'.repeat(1024);
    const overLimit = '0'.repeat(1025);

    expect(atLimit).toHaveLength(1024);
    expect(toDecimalString(atLimit)).toBe(atLimit);
    expect(() => toDecimalString(overLimit)).toThrow(/characters was 1025/);
  });
});

describe('the plain-decimal rendering bound: nothing legitimate is refused', () => {
  /**
   * Every money-shaped value this port actually handles, including the exact
   * numerals the verified rounding cases and the reference discount calculation
   * use.
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
    // The plan's verified figure: 19.99 x 3 less 12.5 per cent presents as '52.47'.
    // A bound that perturbed this would have changed money.
    expect(numberFormat('52.47375')).toBe('52.47');
    expect(numberFormat('59.97')).toBe('59.97');
    expect(cfNumberToString('11.30')).toBe('11.3');
  });

  it('★ NOTHING THIS MODULE PRODUCES CAN BE REFUSED BY THIS MODULE', () => {
    // The invariant the two constants were chosen to satisfy, asserted rather than
    // reasoned about in a comment. A value at the magnitude limit renders in plain
    // notation to well under the character limit, so re-branding that rendering
    // through `toDecimalString` — which both `numberFormat` and `cfNumberToString`
    // do to their own output — cannot trip the length gate.
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
    // The whole point of the exercise, stated as a number: the widest value that
    // gets through renders to hundreds of characters, not tens of millions.
    expect(cfNumberToString('1e256')).toHaveLength(257);
    expect(cfNumberToString('1e-256')).toHaveLength(258);
    expect(numberFormat('1e256')).toHaveLength(260);
  });
});

describe('the rejection path, exercised through every consumer of the private normaliser', () => {
  /**
   * What one consumer did with one rejected candidate. `causeIsDefined` discriminates between the
   * two rejection branches, and `echoesTheCandidate` records that the message names the offending
   * argument - by definition a failed numeric candidate, never a configuration value, connection
   * detail or credential.
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
   * normally. The tests below compare whole tables, so a consumer that silently accepts a malformed
   * value shows up in the diff by name and candidate rather than aborting at the first offender -
   * which is what makes a table assertion worth writing instead of eight separate `toThrow` calls.
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

  /** One entry point, named exactly as it will read in a failure diff. */
  interface NormaliserConsumer {
    readonly label: string;
    readonly invoke: (candidate: string) => unknown;
  }

  // All five exports that run their arguments through the private normaliser, each two-argument
  // predicate once per operand position. The partner operand is the well-formed `'0'`, so only the
  // candidate itself can make a row throw.
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
  //   `new Decimal('Infinity')`
  // both succeed - so these reach the explicit finiteness test instead, and arrive with no cause.
  // This is the gap that would otherwise put `'NaN'` into a price.
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
  // and that would be wrong, because they measurably do not throw. `'0x1A'` in particular is a
  // surprise worth pinning: the decimal library reads hexadecimal, so a stray hex-looking string
  // normalises to 26 rather than being refused. None of this is a latent money hazard - every
  // accepted form is FINITE with the value the numeral says, and both formatters brand their OUTPUT
  // through `toDecimalString`.
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

    // The leading-dot form is the one member of this group that BOTH gates accept, and the two
    // disagree only on presentation: the brand keeps the numeral verbatim while the formatters
    // supply the integer zero.
    expect(toDecimalString('.99')).toBe('.99');
    expect(numberFormat('.99')).toBe('0.99');
    expect(cfNumberToString('.99')).toBe('0.99');
    expect(cfNumericLessThan('.99', '1')).toBe(true);

    // And the tolerance stops exactly where finiteness does. `'Infinity'` is a spelling the library
    // accepts and this module refuses, at BOTH gates.
    expect(() => toDecimalString('Infinity')).toThrow(CfmlNumberFormatError);
    expect(() => numberFormat('Infinity')).toThrow(CfmlNumberFormatError);
    expect(() => cfNumberToString('Infinity')).toThrow(CfmlNumberFormatError);
  });
});

describe('numberFormat: the decimal-fidelity presentation path', () => {
  // CFML parity [model/service/PromotionService.cfc:L1017]: the final step of the reference
  // calculation, and where the chain stops here. The arithmetic producing the input - unit price
  // 19.99 at quantity 3 giving 59.97, 12.5 per cent of that giving 7.49625, and the discounted
  // total 52.47375 - is asserted in `precision.test.ts`, so the input below is a decimal-string
  // LITERAL. An approximate comparison would tolerate the very drift this substrate prevents, so
  // the assertion is on the exact presented string.
  it('presents the reference discounted total with no drift', () => {
    expect(numberFormat('52.47375')).toBe('52.47');
  });

  // CFML parity [model/service/PromotionService.cfc:L1017]: `Money.toFixed2` DELEGATES to this
  // function, so the two-decimal presentation contract is owned here rather than there. That is why
  // the `Money` value object is neither imported nor exercised in this file: reaching up into the
  // domain tier from a substrate-tier suite would blur the tier boundary and lean on the lint rule
  // that keeps dependency flow one-way. `Money`'s own coverage is the sibling value-object suite's.
  it('is the contract Money delegates to for two-decimal presentation', () => {
    expect(numberFormat('7.49625')).toBe('7.50');
    expect(numberFormat('59.97')).toBe('59.97');
  });
});

// ---------------------------------------------------------------------------
// WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT
// ---------------------------------------------------------------------------
// The `roundValue` characterization outputs are NOT authored here; they belong to the sibling
// `roundingRuleService.test.ts`, which owns the algorithm. This suite owns the MECHANISM that makes
// it reproducible: `cfNumberToString`, `numberFormat` and the decimal-value predicates.
//
// Recorded for context only, never asserted below:
//
//   value     expression   direction   measured
//   -------   ----------   ---------   --------
//   12.3456   0.99         Closest     10.99
//   12.3456   .99          Closest     11.99
//   12.3456   .99          Up          12.99
//   12.3456   .99          Down        11.99
//   12.3456   .95,.99      Closest     11.99
//   12.30     .99          Closest     12.99   <- the trailing-zero defect
//   7.42      9.99         Closest      9.99   <- short-input collapse
//   2.30      0.99         Closest      0.99   <- short-input collapse
//   0.42      .99          Closest      0.99
//   12.3456   0.00         Closest     10.00   <- the default is NOT a no-op
//
// CFML parity [model/service/RoundingRuleService.cfc:L88-L175]: a COUNT DRIFT worth recording. The
// plan's prose says "Nine verified results" while the table above lists TEN rows. The count is TEN;
// the row the prose loses is the `12.3456` / `0.00` default case.
//
// Two further pieces of algorithm context:
//
//   * The short-input collapse. When `len(inputValue) <= len(rr)` the else branch at
//     [model/service/RoundingRuleService.cfc:L115-L118] sets BOTH candidates to the rounding
//     expression itself, producing the `7.42` / `9.99` and `2.30` / `0.99` rows - a 2.57 increase
//     and a 57 per cent cut from an expression that reads as harmless.
//   * The direction switch at [model/service/RoundingRuleService.cfc:L132] has `Closest`, `Up` and
//     `Down` and NO `default`, so an unrecognised direction leaves `returnValue` null and L170-L174
//     returns the input unchanged - reachable, and NOT one of the ten above.
//
// THE MEMOISED LOOKUP at [model/service/RoundingRuleService.cfc:L53, L67-L77] becomes
// REQUEST-SCOPED in the target, for CORRECTNESS alone: on a warm Lambda container module state
// outlives an invocation, so a memo held there lets one request observe another's rounding rule,
// including a stale entry the L58-L59 invalidation can no longer reach, and money would change. The
// legacy speed framing at [model/service/RoundingRuleService.cfc:L66] is NOT carried forward,
// because no timing claim exists in the source to preserve.
//
// This file exports nothing and declares no fixture; `DecimalString` is imported, not re-declared.
// ---------------------------------------------------------------------------
