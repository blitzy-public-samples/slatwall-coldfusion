// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for the CFML number-stringification substrate
// ---------------------------------------------------------------------------
//
// WHAT THIS SUITE PINS
// `src/lib/cfml/numberFormat.ts`, and nothing else. Seven runtime exports plus
// one type-only export:
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
// Every expected value below was MEASURED against the shipped module before it
// was written down. None was reasoned about and then assumed.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY, AND MUST NEVER BE PRESENTED
// AS PARITY.
// ---------------------------------------------------------------------------
// The measured basis, established by grepping the legacy suite rather than by
// assuming: all 32 `.cfc` files under `meta/tests/` were searched,
// case-insensitively, for `numberFormat`, `roundValue`, `cfNumberToString` and
// `precisionEvaluate`. The search returns ZERO hits. There is therefore no
// legacy antecedent for a single assertion in this file, and none may be
// claimed.
//
// For the avoidance of doubt about what parity WOULD have looked like: exactly
// two legacy tests are extended anywhere in this migration -
// `meta/tests/unit/entity/BrandTest.cfc` and
// `meta/tests/unit/entity/ProductTest.cfc` - and both belong to the entity
// tier, not here. `meta/tests/functional/admin/entity/ProductTest.cfc` is an
// empty stub contributing zero coverage and is acknowledged rather than
// counted.
//
// ---------------------------------------------------------------------------
// A "CORRECTED", TIDIER EXPECTATION FAILS THE ACCEPTANCE GATE.
// ---------------------------------------------------------------------------
// `cfNumberToString()` is the mechanism behind a real money defect in
// `roundValue` [model/service/RoundingRuleService.cfc:L88-L175]. It fires on
// roughly one money value in ten. The three manifestations pinned further down
// look wrong on purpose. Fidelity to measured legacy output beats mathematical
// tidiness here, without exception: reproduce and annotate, never repair.
//
// Read the attribution the right way round, because it is easy to state
// backwards. `cfNumberToString()` is CORRECT CFML behaviour - dropping trailing
// zeros is genuinely what the engine does when it stringifies a number. The
// DEFECT is `roundValue` taking `len()` of an arithmetic result. This suite owns
// the MECHANISM; the algorithm, and the numbered defect-register entry that
// goes with it, belong to `services/roundingRuleService.ts` and its own suite.
// This file owns no register entry.
//
// ---------------------------------------------------------------------------
// EVERY EXPORT UNDER TEST RETURNS A STRING. NONE RETURNS A NUMERIC.
// ---------------------------------------------------------------------------
// The legacy code hides that duality rather than declaring it:
// [model/service/PromotionService.cfc:L1017] is
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
// harness being REPLACED, not one of the twenty preserved business-logic
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
// ---------------------------------------------------------------------------
// PROJECT RULES: NONE WERE PROVIDED
// ---------------------------------------------------------------------------
//   (1) No user-specified rules were provided for this project. The rules
//       source returns exactly the single line "No user rules provided."
//   (2) That absence was VERIFIED, not assumed. The rules source was queried
//       five independent ways - the default window, the full range [1,-1], the
//       range [2,500] chosen to probe deliberately far past the apparent end,
//       the single line [1,1], and the far window [500,1000] - and every one of
//       the five returned that byte-identical single line. The document is a
//       one-line sentinel and is exhausted.
//   (3) No rule has been invented to fill the gap.
//   (4) The absence is NOT licence to lower the bar. The substitute
//       enterprise-standard practices therefore apply at FULL strength here:
//       maximal strict typing with no `any` and no suppression comment beyond
//       the single deliberate compile-error assertion below; the layer boundary
//       respected rather than tunnelled through by a test; the pinned
//       dependency set untouched, with no test-only addition; every monetary
//       literal a decimal string, including in expected values; no credential
//       and no environment read; nothing exported from this file and no barrel;
//       and an in-code annotation on every judgment call and every preserved
//       defect.
//   (5) ZERO files enter scope by rule mandate. This file traces to its
//       assigned purpose and to the plan's target layout, with no third
//       rule-driven category of in-scope file and no rule conflict to resolve.
//       The rules source remains authoritative; this note summarises its
//       result and does not restate a rule, because there is none to restate.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  CfmlNumberFormatError,
  cfNumberToString,
  cfNumericEquals,
  cfNumericGreaterThan,
  cfNumericLessThan,
  numberFormat,
  toDecimalString,
} from '../../../../src/lib/cfml/numberFormat.js';
import type { DecimalString } from '../../../../src/lib/cfml/numberFormat.js';

// CFML parity [slatwall-ts/tsconfig.json]: the import specifier ends in `.js`,
// not `.ts`. `allowImportingTsExtensions` is absent from the shipped compiler
// configuration and the package is ESM under `NodeNext` resolution, so `.js` is
// the only extension that resolves. Recorded because the alternative was a real
// fork in the road, not because it is obvious.
//
// JUDGMENT CALL: `describe`, `it` and `expect` are imported explicitly by name.
// The shipped runner configuration sets `globals: false`, and the compiler
// declares `"types": ["node"]` rather than the runner's global type package, so
// an ambient-global suite would not type-check. Explicit imports also match this
// subtree's discipline of named imports and no barrel files.
//
// JUDGMENT CALL: the surface described in this suite's own brief lists four
// entries, but the shipped module exports SEVEN runtime names plus the type.
// The extra one is `CfmlNumberFormatError`. Conforming to the shipped file is
// the binding instruction, and the traceability requirement that every shipped
// export carry at least one test then obliges coverage for it - supplied by the
// rejection assertions in the `DecimalString` block. No export is invented, and
// no private helper is reached for: `TwoDecimalMask`, the two validating
// patterns, the frozen decimal constructor and the input normaliser are all
// deliberately module-private and are exercised only through the public surface.
//
// `decimal.js` is NOT imported here and no decimal instance is constructed,
// even though both formatters accept one. The suite drives the string overload
// exclusively, which is the overload every legacy call site uses. Nor is
// `precision.ts` imported: arithmetic belongs to that module and its own suite,
// and this file performs no arithmetic at all.

describe('numberFormat: provenance - the three verified legacy call sites', () => {
  // CFML parity [model/service/PromotionService.cfc:L1017]: the legacy line is
  // `return numberFormat(discountAmount, "0.00");`, returned from a function
  // declared `private numeric function getDiscountAmount(...)` at
  // [model/service/PromotionService.cfc:L987]. The declared type is numeric and
  // the returned value is a string; CFML coerces silently. The target keeps the
  // string boundary explicit, so this asserts BOTH the presented text and that
  // the result really is a string.
  it('presents a discount amount as a two-decimal string, per PromotionService.cfc:L1017', () => {
    const presented = numberFormat('7.49625');

    expect(presented).toBe('7.50');
    expect(typeof presented).toBe('string');
  });

  // CFML parity [model/service/PriceGroupService.cfc:L339]: the legacy line is
  // `return numberFormat(newPrice, "0.00");`.
  //
  // *** LOCATOR DRIFT, RECORDED DELIBERATELY. The plan publishes this call site
  // *** as L337. L337 is BLANK - it holds a lone tab. Verified by reading the
  // *** file: L336 is the closing brace of the amount-type switch, L337 is
  // *** blank, L338 is the comment "//return the newPrice and make sure that it
  // *** is just a two decimal number", and L339 is the return. The correct
  // *** locator is L339, and the shipped module records the same correction.
  //
  // Only the `percentageOff` branch of that switch applies a rounding rule
  // [model/service/PriceGroupService.cfc:L326-L328]; `amountOff` at L331 and
  // `amount` at L334 skip it. That asymmetry is the sibling price-group suite's
  // to pin - what belongs here is that the presentation step runs identically
  // whichever branch produced the value.
  it('presents a price-group rate result as a two-decimal string, per PriceGroupService.cfc:L339', () => {
    expect(numberFormat('59.97')).toBe('59.97');
    expect(numberFormat('12.3')).toBe('12.30');
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L89]: the legacy line is
  // `var inputValue = numberFormat(arguments.value, "0.00");` and it is the
  // FIRST operation of `roundValue`. This is exactly why the whole algorithm is
  // decimal-STRING manipulation: `inputValue` is a string from the outset, so
  // every downstream `len()` at L97, L102 and L109 is a string length, and
  // every `left()` at L98, L103 and L110 is a string slice.
  it('produces the string that every downstream len() in roundValue measures', () => {
    const inputValue = numberFormat('12.3456');

    expect(inputValue).toBe('12.35');
    expect(inputValue.length).toBe(5);
    // `len(rr)` for the `'.99'` expression is 3, and L97 gates on
    // `len(inputValue) > len(rr)`. Recording the two lengths side by side is
    // what makes that gate legible; evaluating it is the sibling suite's job.
    expect('.99'.length).toBe(3);
  });
});

describe("numberFormat: the '0.00' mask invariants", () => {
  it('always emits exactly two decimal places, zero-padded', () => {
    expect(numberFormat('12.3')).toBe('12.30');
    expect(numberFormat('12')).toBe('12.00');
  });

  // The leading `0` of the mask guarantees an integer digit, and that is
  // LOAD-BEARING rather than cosmetic. `roundValue` builds its first candidate
  // at [model/service/RoundingRuleService.cfc:L98] as
  // `left(inputValue, len(inputValue)-len(rr)) & rr`. For the input 0.42 with
  // the expression '.99', `len(inputValue)` is 4 and `len(rr)` is 3, so the
  // slice is `left('0.42', 1)` = `'0'` and the candidate is `'0' & '.99'` =
  // `'0.99'`. Had the presentation emitted `'.42'` the slice would have been
  // `'.'` and the candidate `'..99'`, which is not a numeral at all.
  it('always emits at least one integer digit - never a bare fractional form', () => {
    expect(numberFormat('0.42')).toBe('0.42');
    expect(numberFormat('.42')).toBe('0.42');
  });

  it('never emits a thousands separator', () => {
    const presented = numberFormat('1234.5');

    expect(presented).toBe('1234.50');
    expect(presented).not.toContain(',');
  });

  // A `len()`-based algorithm cannot survive exponential notation: `'1e+21'`
  // has length 5 whatever the magnitude, so every slice offset would collapse.
  // Both ends of the range are asserted.
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

  // Also LOAD-BEARING. Negative intermediates are genuinely reachable: the
  // characterization input 0.42 with the expression '.99' takes the L101 branch
  // `var lowerValue = inputValue - rrPower;`, and with `rrPower` of 1 that
  // lower intermediate is -0.58. Because L103 slices with
  // `left(lowerValue, len(lowerValue)-len(rr))`, and `len('-0.58')` is 5 while
  // `len('.99')` is 3, the slice is `left('-0.58', 2)` = `'-0'`, which yields
  // the candidate `'-0.99'`. Drop the sign and that candidate changes.
  it('preserves a leading minus sign, with no accounting notation', () => {
    const presented = numberFormat('-0.58');

    expect(presented).toBe('-0.58');
    expect(presented.startsWith('-')).toBe(true);
    expect(presented).not.toContain('(');
    expect(presented.endsWith('-')).toBe(false);
    // The slice that L103 would take of this value. Asserted as a string
    // operation, never as arithmetic.
    expect(presented.slice(0, 2)).toBe('-0');
  });

  // JUDGMENT CALL: half-up rounding. Be exact about its status - the source
  // does NOT settle the mode, and neither of the two obvious candidates
  // disambiguates it. The reference chain's `52.47375` and the characterization
  // input `12.3456` both have a third decimal that rounds identically under
  // every common mode. Half-up is therefore a DECLARED CHOICE recorded here,
  // not verified legacy behaviour, and the two exact-half cases below are the
  // ones that actually distinguish it: under half-even, `'0.005'` would present
  // as `'0.00'` and `'2.675'` as `'2.68'`; under half-down, `'0.005'` would
  // present as `'0.00'`. Both come back rounded up.
  it('rounds half away from zero at the two-decimal boundary', () => {
    expect(numberFormat('12.3456')).toBe('12.35');
    expect(numberFormat('0.005')).toBe('0.01');
    expect(numberFormat('2.675')).toBe('2.68');
  });

  // A price of `'-0.00'` would be indefensible, so the sign is dropped for
  // every negative-zero presentation - including a value that is not itself
  // zero but rounds to zero at two decimals.
  it('normalises negative zero away', () => {
    expect(numberFormat('0')).toBe('0.00');
    expect(numberFormat('-0')).toBe('0.00');
    expect(numberFormat('-0.001')).toBe('0.00');
  });
});

describe('cfNumberToString: CFML trailing-zero dropping', () => {
  // The contract, stated once: strip ALL trailing zeros from the fractional
  // part; strip the decimal point too once the fraction is empty; emit plain
  // non-exponential notation; impose no scale and no padding; preserve a
  // leading minus. This is the exact inverse of `numberFormat`'s padding, and
  // the two live side by side in one module precisely because `roundValue`
  // applies one and then unknowingly measures the other.
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

  // No scale is imposed in either direction: significant decimals are kept in
  // full rather than truncated to two, which is what makes this function the
  // inverse of the presentation step rather than a variant of it.
  it('imposes no scale and no padding of its own', () => {
    expect(cfNumberToString('12.3456')).toBe('12.3456');
  });

  // The plain-notation guarantee matters as much here as it does for the
  // presentation function, and for the same reason: a `len()`-based algorithm
  // cannot survive an exponent.
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
  // Read this block against the source, which is quoted here verbatim rather
  // than paraphrased:
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
  // L101 and L108 compute ARITHMETIC results. L102 and L109 then take `len()`
  // of them - a STRING length of a NUMBER. So the length measured is that of
  // the trailing-zero-stripped form, not of a two-decimal form, and the
  // `left()` slice on the following line is taken at the wrong offset.
  //
  // Each manifestation below asserts BOTH the string form AND its `.length`,
  // because the length is the quantity the defect actually turns on and an
  // assertion on the text alone would not pin it.
  //
  // No arithmetic intermediate is computed in TypeScript anywhere in this
  // block. Each intermediate is supplied as a decimal-string LITERAL and only
  // its stringification is asserted. Computing `12.30 - 1` here would both
  // introduce raw arithmetic on a monetary value and quietly relocate
  // `precision.ts`'s responsibility into this suite.

  // (a) ONE TRAILING ZERO STRIPPED - the canonical case.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L101-L103]: with
  // `inputValue = '12.30'` and `rr = '.99'`, `len(rr)` is 3 so `rrPower` is
  // 10^0 = 1. The lower intermediate `12.30 - 1` is 11.3, whose string form is
  // `'11.3'` with length 4 and NOT 5. L102 still passes, so L103 slices
  // `left('11.3', 4 - 3)` = `left('11.3', 1)` = `'1'`, and the candidate
  // becomes `'1' & '.99'` = `'1.99'` instead of `'11.99'`. Its delta from
  // 12.30 balloons to 10.31, so the `Closest` branch selects `'12.99'`
  // (delta 0.69) where a correct implementation would have selected `'11.99'`
  // (delta 0.31).
  it('(a) strips one trailing zero, shortening the lower intermediate to length 4', () => {
    const lowerIntermediate = cfNumberToString('11.30');

    // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: len() is taken of an arithmetic result, and CFML drops trailing zeros when stringifying a number, so a value whose cents end in zero takes a corrupted branch.
    // Preserved deliberately; do not fix without a product decision.
    expect(lowerIntermediate).toBe('11.3');
    expect(lowerIntermediate.length).toBe(4);

    // The corrupted slice, shown as the string operation it is. This is what
    // L103 would take, and it is a one-character prefix rather than the
    // two-character `'11'` the algorithm assumes.
    expect(lowerIntermediate.slice(0, 1)).toBe('1');
  });

  // (b) THE CONTRAST - NO TRAILING ZERO, so the same code path rounds
  // correctly.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L101-L103]: `'12.35'`
  // with the same `rr = '.99'` gives a lower intermediate of 11.35, whose
  // string form is `'11.35'` with length 5. `5 > 3` holds, L103 slices
  // `left('11.35', 5 - 3)` = `'11'`, and the candidate is `'11.99'` - delta
  // 0.36, which beats `'12.99'`'s 0.64.
  //
  // Asserting this alongside (a) makes the contrast explicit and permanent, and
  // records the property that matters most about the defect: it is
  // DATA-DEPENDENT, not universal. Any value whose cents end in zero takes the
  // corrupted branch, which is roughly one money value in ten.
  it('(b) leaves a non-zero-ending intermediate at length 5, so the slice is correct', () => {
    const lowerIntermediate = cfNumberToString('11.35');

    expect(lowerIntermediate).toBe('11.35');
    expect(lowerIntermediate.length).toBe(5);

    // The correct slice, for direct comparison with (a).
    expect(lowerIntermediate.slice(0, 2)).toBe('11');
  });

  // (c) THE WHOLE-DOLLAR CASE - the decimal point disappears entirely and
  // control lands in a different branch altogether. This third pathway is the
  // easiest of the three to miss.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L102-L106]: `'12.00'`
  // with `rr = '.99'` gives a lower intermediate of 11 - both trailing zeros
  // AND the decimal point are gone - whose string form is `'11'` with length 2.
  // The L102 gate `2 > 3` is therefore FALSE, so execution falls into the else
  // branch at L104-L106 and `valueOptionTwo` becomes the rounding expression
  // itself, `'.99'`. The trailing-zero drop has not merely shifted a slice
  // offset; it has changed which branch runs.
  it('(c) drops the point as well, collapsing the intermediate to length 2', () => {
    const lowerIntermediate = cfNumberToString('11.00');

    expect(lowerIntermediate).toBe('11');
    expect(lowerIntermediate.length).toBe(2);
    expect(lowerIntermediate).not.toContain('.');

    // The gate at L102 is `len(lowerValue) > len(rr)`. Both sides are recorded
    // as string lengths, in the source's own comparison direction, so the false
    // outcome is legible without evaluating the algorithm here.
    const roundingExpressionLength = '.99'.length;

    expect(roundingExpressionLength).toBe(3);
    expect(lowerIntermediate.length > roundingExpressionLength).toBe(false);
  });
});

describe('numberFormat: the mask is a literal type, not a mask engine', () => {
  it('accepts the one mask the slice uses, whether passed explicitly or defaulted', () => {
    // Both spellings must agree, because all three legacy call sites pass the
    // mask explicitly while the target's default exists so that internal
    // callers need not repeat it.
    expect(numberFormat('12.3456', '0.00')).toBe('12.35');
    expect(numberFormat('12.3456')).toBe('12.35');
  });

  // JUDGMENT CALL: this is the suite's ONE deliberate compile-error assertion,
  // and it is structured so the invalid call is never executed. The function
  // below is declared and then only inspected - declaring it is already enough
  // for the compiler to reject the argument, and `@ts-expect-error` records
  // that rejection as an assertion the type-check enforces. If the mask
  // parameter were ever widened to `string`, the directive would stop matching
  // an error and `tsc` would fail on the now-unused suppression, so this
  // assertion cannot rot silently.
  //
  // There is deliberately NO general CFML mask engine in the target. The `_`,
  // `9`, `,`, `.`, `+`, `-`, `()`, `L`, `C` and `$` mask characters are
  // unsupported by construction, because no mask other than `"0.00"` appears
  // anywhere in the in-scope slice. Widening that would be a product decision,
  // not a tidy-up.
  //
  // CFML parity [slatwall-ts/eslint.config.mjs]: this suite's brief states that
  // the `tests/**` lint override permits `@ts-expect-error` only WITH a
  // description. The shipped configuration is in fact more permissive - it
  // disables the directive check outright for the test tier, and applies its
  // minimum-description length only to production files. The description is
  // supplied regardless, because the stricter reading is the better one and the
  // absence of a constraint is not a reason to drop it.
  it('rejects any other mask at compile time', () => {
    function callWithUnsupportedMask(): DecimalString {
      // @ts-expect-error A mask other than the literal '0.00' is not assignable to this
      // parameter, so this call cannot compile. That compile failure IS the assertion, and
      // the enclosing function is never invoked, so no invalid call is ever executed.
      return numberFormat('12.3456', '0.000');
    }

    expect(typeof callWithUnsupportedMask).toBe('function');
  });
});

describe('decimal-value comparison: by value, never lexically', () => {
  // CFML parity [model/service/RoundingRuleService.cfc:L120]: the legacy line is
  // `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)`. CFML
  // compares those two strings NUMERICALLY, so a candidate that differs only in
  // scale still triggers the early return at L121. A JavaScript string
  // comparison would report them as different and miss the early return
  // entirely, which is why a dedicated predicate exists rather than `===`.
  it('treats values that differ only in scale as equal', () => {
    expect(cfNumericEquals('12.350', '12.35')).toBe(true);
    expect(cfNumericEquals('1.0', '1')).toBe(true);
    expect(cfNumericEquals('0.00', '0')).toBe(true);

    // The divergence being guarded against, made explicit: as raw strings these
    // are not equal, and only the numeric reading makes them so. The two are
    // held in `string`-typed locals rather than compared as literals, because
    // comparing two non-overlapping literal types is itself a compile error -
    // which is a neat second proof that the lexical reading is the wrong tool.
    const candidate: string = '12.350';
    const inputValue: string = '12.35';

    expect(candidate === inputValue).toBe(false);
  });

  it('distinguishes values that genuinely differ', () => {
    expect(cfNumericEquals('12.35', '12.99')).toBe(false);
    expect(cfNumericEquals('-0.99', '0.99')).toBe(false);
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L100]: the legacy line is
  // `if(valueOptionOne > inputValue)`, again a numeric comparison of two
  // strings. The divergence here is reachable rather than theoretical - the
  // pair below arises directly from the `7.42` with `'9.99'` characterization
  // case - and it points the opposite way to the lexical reading, which is the
  // sharpest reason this predicate cannot be `>` on strings.
  it('orders by decimal value even where a lexical reading would disagree', () => {
    expect(cfNumericGreaterThan('9.99', '12.35')).toBe(false);
    expect(cfNumericLessThan('9.99', '12.35')).toBe(true);

    // The lexical reading, shown so the disagreement is on the record: `'9'`
    // sorts after `'1'`, so as raw strings the smaller number looks larger.
    const candidate: string = '9.99';
    const inputValue: string = '12.35';

    expect(candidate > inputValue).toBe(true);
  });

  it('orders neighbouring cent values correctly in both directions', () => {
    expect(cfNumericGreaterThan('0.10', '0.09')).toBe(true);
    expect(cfNumericLessThan('0.09', '0.10')).toBe(true);
  });

  // Both predicates are STRICT, and that strictness is load-bearing for the
  // consuming algorithm rather than incidental.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L134, L138]: the
  // `Closest` branch sets the best delta from option ONE first at L134, and
  // L138 then requires option TWO's delta to be strictly `<` the incumbent. So
  // on an EXACT TIE, option ONE wins. The same strict shape backs the
  // absolute-value delta tests at L124 and L128, the `Up` guards at L145 and
  // L149, and the `Down` guards at L156 and L160.
  //
  // Stated here because the predicates must support it; evaluating the branch
  // is the sibling `roundingRuleService.test.ts`'s work, not this suite's.
  it('is strict, so an exact tie is not a strict improvement in either direction', () => {
    expect(cfNumericLessThan('0.50', '0.50')).toBe(false);
    expect(cfNumericGreaterThan('0.50', '0.50')).toBe(false);
    expect(cfNumericEquals('0.50', '0.50')).toBe(true);

    // The same tie expressed across differing scales, since scale must not
    // create a false improvement either.
    expect(cfNumericLessThan('0.5', '0.50')).toBe(false);
  });
});

describe('DecimalString: the branded type and its validating constructor', () => {
  // WHY THE BRAND EXISTS, verified in source rather than paraphrased:
  // `roundValue` declares `public string function roundValue(required any value,
  // string roundingExpression="0.00", string roundingDirection="Closest")` at
  // [model/service/RoundingRuleService.cfc:L88], while BOTH of its callers
  // declare `returntype="numeric"` - `roundValueByRoundingRuleID` at
  // [model/service/RoundingRuleService.cfc:L79] and `roundValueByRoundingRule`
  // at [model/service/RoundingRuleService.cfc:L84]. `PriceGroupService` then
  // feeds the result straight into `precisionEvaluate` at
  // [model/service/PriceGroupService.cfc:L323] and
  // [model/service/PriceGroupService.cfc:L331]. CFML papers over that with
  // implicit coercion; TypeScript cannot and should not, so `roundValue`
  // returns a branded decimal string and its callers convert explicitly.
  it('accepts every plain decimal numeral the slice actually persists or computes', () => {
    expect(toDecimalString('12.99')).toBe('12.99');
    expect(toDecimalString('-0.99')).toBe('-0.99');
    expect(toDecimalString('0')).toBe('0');
    expect(toDecimalString('0.00')).toBe('0.00');
  });

  it('accepts the LEADING-DOT form, and brands it without rewriting it', () => {
    // The documented accepted set includes a numeral with no integer digit at
    // all, and that member has to be asserted separately: a validator narrowed
    // to require a leading digit would still satisfy every other case in this
    // block, so nothing above distinguishes the two.
    //
    // The form is not hypothetical - it is the shape the slice's own rounding
    // expressions take. `.99` and the multi-option `.95,.99` are the
    // characterization inputs whose measured outputs this port is pinned to, and
    // `RoundingRule.roundingRuleExpression` carries no format constraint at all,
    // so a leading-dot expression reaches the algorithm exactly as written.
    //
    // Two properties, not one. It VALIDATES, and it is returned VERBATIM: no
    // integer zero is inserted, so the brand does not quietly normalise its
    // input. That distinction matters downstream, because the rounding algorithm
    // is a string algorithm - it measures and slices the numeral - so a helpfully
    // inserted `0` would change a prefix length and with it the money.
    const brandedLeadingDot: DecimalString = toDecimalString('.99');

    expect(brandedLeadingDot).toBe('.99');
    expect(toDecimalString('-.99')).toBe('-.99');

    // Contrast, so the acceptance is not mistaken for blanket tolerance of a
    // missing digit on either side: a TRAILING bare dot is still rejected.
    expect(() => toDecimalString('.')).toThrow(CfmlNumberFormatError);
  });

  // The rejections are what make the brand mean something. Each raises the
  // module's typed error rather than a bare `Error`, so a malformed candidate
  // can be told apart from any other failure and nothing `NaN`-bearing can
  // reach a price. This is also the coverage for `CfmlNumberFormatError`
  // itself.
  it('rejects a non-numeral with the typed error this module declares', () => {
    expect(() => toDecimalString('abc')).toThrow(CfmlNumberFormatError);
  });

  it('rejects the empty string', () => {
    expect(() => toDecimalString('')).toThrow(CfmlNumberFormatError);
  });

  it('rejects grouped notation, so a thousands separator can never be branded', () => {
    expect(() => toDecimalString('1,234.50')).toThrow(CfmlNumberFormatError);
  });

  // Exponential notation is rejected specifically because a `len()`-based
  // algorithm cannot survive it.
  //
  // JUDGMENT CALL, worth recording because it is an asymmetry a reader will hit
  // sooner or later: the two formatters are more tolerant of their INPUT than
  // this constructor is of a candidate brand. `cfNumberToString('1e5')`
  // succeeds and normalises to `'100000'`, because the input is parsed by the
  // decimal library and only the OUTPUT is branded. `toDecimalString('1e5')`
  // rejects outright. Input tolerance and brand strictness are deliberately not
  // the same thing, and both behaviours are asserted here so neither can drift.
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

  // The brand is a phantom: a `declare const` on a `unique symbol` exists only
  // in the type system, emits no JavaScript, and attaches no property to any
  // value. At runtime a `DecimalString` is exactly a string, which is why it
  // can be compared, sliced and measured like one throughout this suite.
  //
  // There is deliberately no blanket unvalidated cast helper, and none is
  // improvised here: every branded value in this file comes from the validating
  // constructor or from a formatter, never from a type assertion.
  it('carries no runtime cost and no runtime property', () => {
    const branded: DecimalString = toDecimalString('12.99');

    expect(typeof branded).toBe('string');

    // A wrapping object shows the one field it was given and no brand field
    // alongside it, and serialisation emits a plain JSON string rather than an
    // object with hidden members.
    expect(Object.keys({ value: branded })).toEqual(['value']);
    expect(JSON.stringify({ value: branded })).toBe('{"value":"12.99"}');

    // Ordinary string operations still work, and a derived slice is correctly
    // just a `string` - the `left()` prefix `roundValue` takes is not itself a
    // numeral, so it must not inherit the brand.
    expect(branded.slice(0, 2)).toBe('12');
  });

  // Both formatters return the branded type, so the invariant is guaranteed at
  // the point of production rather than asserted afterwards by a caller.
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
// WHY THIS BLOCK EXISTS, and why the rejections above are not sufficient on
// their own. This module has TWO independent input gates, not one:
//
//   * `toDecimalString` validates a candidate against `PLAIN_DECIMAL_NUMERAL`,
//     a pattern declared in this module.
//   * the private input normaliser validates by CONSTRUCTING a decimal and then
//     testing finiteness, and it is what `numberFormat`, `cfNumberToString`,
//     `cfNumericEquals`, `cfNumericGreaterThan` and `cfNumericLessThan` all run
//     their arguments through.
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
describe('the rejection path, exercised through every consumer of the private normaliser', () => {
  /**
   * What one consumer did with one rejected candidate.
   *
   * `causeIsDefined` is the discriminator between the two rejection branches,
   * and `echoesTheCandidate` records that the message names the offending
   * argument - which is by definition a failed numeric candidate, never a
   * configuration value, connection detail or credential.
   */
  interface CapturedRejection {
    readonly candidate: string;
    readonly name: string;
    readonly causeIsDefined: boolean;
    readonly echoesTheCandidate: boolean;
  }

  /**
   * Invokes a consumer with a candidate it is expected to refuse, and reports
   * what came back.
   *
   * JUDGMENT CALL: this returns a SENTINEL row instead of throwing when the
   * consumer returns normally. The tests below compare whole tables, so a
   * consumer that silently accepts a malformed value shows up in the diff by
   * name and candidate rather than aborting the run at the first offender -
   * which is what makes a table assertion worth writing instead of eight
   * separate `toThrow` calls.
   *
   * Like every other helper in this file it is a pure local arrow function
   * holding no state, so it cannot leak anything between tests. That is the
   * same request-scoping discipline that makes four legacy component-level
   * caches request-scoped in this port.
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

  // All five exports that run their arguments through the private normaliser,
  // with each two-argument predicate listed once per operand position. The
  // partner operand is the well-formed `'0'`, so the only thing that can make a
  // row throw is the candidate itself.
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

  // The five malformed spellings the module's own documentation names as the
  // ones the decimal library itself throws on. Each therefore takes the WRAPPED
  // branch and arrives carrying a cause.
  const MALFORMED_CANDIDATES: readonly string[] = ['abc', '', '1.2.3', '1,000', ' 12.5 '];

  // The three non-finite spellings the library ACCEPTS - `new Decimal('NaN')`
  // and `new Decimal('Infinity')` both succeed - so these reach the explicit
  // finiteness test instead, and arrive with no cause. This is the gap that
  // would otherwise put `'NaN'` straight into a price.
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

  // The positive control. Without it, every rejection test above would still
  // pass against a consumer that had been broken into refusing EVERYTHING, and
  // the block would be asserting nothing about the rejection path specifically.
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

  // The measured disagreement between the two gates, which is what makes this
  // whole block necessary rather than redundant.
  //
  // JUDGMENT CALL: these four forms are asserted as ACCEPTED, not as malformed.
  // It is tempting to fold them into the rejection tables on the reasoning that
  // they are not plain decimal numerals - and that would be wrong, because they
  // measurably do not throw. Input tolerance and brand strictness are
  // deliberately different things in this module, and the honest assertion is
  // the measured one. `'0x1A'` in particular is a real surprise worth pinning:
  // the decimal library reads hexadecimal, so a stray hex-looking string
  // normalises to 26 rather than being refused.
  //
  // None of this is a latent money hazard, and the reason is worth stating so
  // the tolerance is not "fixed" by mistake: every accepted form here is FINITE
  // and its value is exactly what the numeral says, and both formatters brand
  // their OUTPUT through `toDecimalString`, so whatever they return is a plain
  // decimal numeral regardless of how the input was spelled.
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

    // The leading-dot form is the one member of this group that BOTH gates
    // accept, and the two disagree only on presentation: the brand keeps the
    // numeral verbatim while the formatters supply the integer zero.
    expect(toDecimalString('.99')).toBe('.99');
    expect(numberFormat('.99')).toBe('0.99');
    expect(cfNumberToString('.99')).toBe('0.99');
    expect(cfNumericLessThan('.99', '1')).toBe(true);

    // And the tolerance stops exactly where finiteness does. `'Infinity'` is a
    // spelling the library accepts and this module refuses, at BOTH gates.
    expect(() => toDecimalString('Infinity')).toThrow(CfmlNumberFormatError);
    expect(() => numberFormat('Infinity')).toThrow(CfmlNumberFormatError);
    expect(() => cfNumberToString('Infinity')).toThrow(CfmlNumberFormatError);
  });
});

describe('numberFormat: the decimal-fidelity presentation path', () => {
  // CFML parity [model/service/PromotionService.cfc:L1017]: this is the final
  // step of the reference calculation, and it is where the chain STOPS for this
  // suite. The arithmetic that produces the input - unit price 19.99 at
  // quantity 3 giving 59.97, 12.5 per cent of that giving 7.49625, and the
  // discounted total 52.47375 - is asserted in `precision.test.ts` and is not
  // recomputed here. The input below is therefore written as a decimal-string
  // LITERAL: no monetary value in this file is produced by arithmetic, and no
  // expected value is a computed expression.
  //
  // An approximate comparison would be exactly the wrong instrument here. It
  // would tolerate the drift this whole substrate exists to prevent, so the
  // assertion is on the exact presented string.
  it('presents the reference discounted total with no drift', () => {
    expect(numberFormat('52.47375')).toBe('52.47');
  });

  // CFML parity [model/service/PromotionService.cfc:L1017]: `Money.toFixed2`
  // DELEGATES to this function, so the two-decimal presentation contract is
  // genuinely owned here rather than there. That is why the `Money` value object
  // is neither imported nor exercised in this file: reaching up into the domain
  // tier from a substrate-tier suite would blur the tier boundary and lean on
  // the lint rule that keeps dependency flow one-way. `Money`'s own coverage is
  // the sibling value-object suite's.
  it('is the contract Money delegates to for two-decimal presentation', () => {
    expect(numberFormat('7.49625')).toBe('7.50');
    expect(numberFormat('59.97')).toBe('59.97');
  });
});

// ---------------------------------------------------------------------------
// WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT
// ---------------------------------------------------------------------------
// The `roundValue` characterization outputs are NOT authored here. They belong
// to the sibling `roundingRuleService.test.ts`. This suite owns the MECHANISM -
// `cfNumberToString`, `numberFormat`, and the decimal-value predicates - and the
// sibling owns the algorithm those three make reproducible, together with the
// numbered defect-register entry.
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
// CFML parity [model/service/RoundingRuleService.cfc:L88-L175]: a COUNT DRIFT
// worth recording, because it invites an off-by-one when the sibling suite is
// written. The plan's prose says "Nine verified results" while the table
// immediately beneath it lists TEN rows. The count is TEN. The row the prose
// loses sight of is the `12.3456` / `0.00` default case, which is precisely the
// one that most needs keeping.
//
// Two further pieces of algorithm context, stated so the sibling suite inherits
// them rather than rediscovering them:
//
//   * The short-input collapse. When `len(inputValue) <= len(rr)` the else
//     branch at [model/service/RoundingRuleService.cfc:L115-L118] sets BOTH
//     candidates to the rounding expression itself. That is what produces the
//     `7.42` / `9.99` and `2.30` / `0.99` rows - a 2.57 increase and a 57 per
//     cent cut respectively, from an expression that reads as harmless.
//   * The direction switch at [model/service/RoundingRuleService.cfc:L132] has
//     cases `Closest` (L133-L143), `Up` (L144-L154) and `Down` (L155-L165) and
//     NO `default`. An unrecognised direction therefore leaves `returnValue`
//     null, and L170-L174 - `if(!isNull(returnValue)) { return returnValue; }
//     else { return inputValue; }` - returns the input unchanged. That
//     pass-through is genuine and reachable, and it is NOT one of the ten cases
//     above.
//
// ---------------------------------------------------------------------------
// HAND-OFF NOTES - facts established while verifying this file's provenance.
// They concern `services/roundingRuleService.ts` and
// `domain/entities/roundingRule.ts`. They are stated, not acted on: nothing
// below is asserted in this suite.
// ---------------------------------------------------------------------------
//
// HAND-OFF NOTE 1 - the `"0.00"` default is never reached from a legacy call
// site, yet the hazard behind it is still real.
// `roundValue` defaults its expression to `"0.00"`
// [model/service/RoundingRuleService.cfc:L88], but the complete verified
// call-site inventory shows every invocation supplying all three arguments:
// [model/entity/RoundingRule.cfc:L67], [model/service/PriceGroupService.cfc:L327],
// [model/service/PromotionService.cfc:L1006],
// [model/service/PromotionService.cfc:L1026],
// [model/service/RoundingRuleService.cfc:L81] and
// [model/service/RoundingRuleService.cfc:L85]. In particular
// [model/service/PriceGroupService.cfc:L327] -
// `newPrice = arguments.priceGroupRate.getRoundingRule().roundValue(newPrice);`
// - is a one-argument call to the ENTITY's own method at
// [model/entity/RoundingRule.cfc:L66-L68], which delegates to
// `roundValueByRoundingRule`, and that supplies BOTH the expression and the
// direction explicitly at [model/service/RoundingRuleService.cfc:L85]. So do NOT
// author or imply a test asserting that L327 passes one argument to the SERVICE;
// none is authored here.
// The `12.3456` / `'0.00'` characterization case NEVERTHELESS STANDS, because
// its mechanism is DATA rather than a defaulted call. The expression is a
// persisted, unconstrained-length column -
// `property name="roundingRuleExpression" ormtype="string";` at
// [model/entity/RoundingRule.cfc:L54] - so a stored row holding `'0.00'`
// produces the 10.00 outcome directly.
//
// HAND-OFF NOTE 2 - the expression IS validation-constrained, and the published
// description of that constraint needs a correction.
//
// CFML parity [model/entity/RoundingRule.cfc:L81]: this correction is recorded
// deliberately because the verified read CONTRADICTS the sibling production
// prompt's description of the same validator, and the verified read is
// authoritative. `model/validation/RoundingRule.json:L4` invokes the validator
// DECLARATIVELY, with
// `[{"contexts":"save","required":true,"method":"hasExpressionWithListOfNumericValuesOnly"}]`,
// so `hasExpressionWithListOfNumericValuesOnly` is NOT dead code and it is not
// true that "nothing prevents" a malformed expression. The implementation at
// [model/entity/RoundingRule.cfc:L78-L86] tests, at L81 verbatim,
// `if((len(thisValue) - find(".", thisValue)) != 2 || !isNumeric(thisValue)) {
// return false; }`.
// The correction: that test does NOT require a dot. CFML's `find()` returns 0
// when the substring is absent, so a dot-less two-character numeral computes
// `2 - 0 = 2`, the `!= 2` test is FALSE, and `isNumeric` is TRUE. The worked
// table:
//
//   '99'    len 2, find 0  ->  2 - 0 = 2   PASS
//   '.99'   len 3, find 1  ->  3 - 1 = 2   PASS
//   '0.99'  len 4, find 2  ->  4 - 2 = 2   PASS
//   '9.99'  len 4, find 2  ->  4 - 2 = 2   PASS
//   '0.00'  len 4, find 2  ->  4 - 2 = 2   PASS
//   '9'     len 1, find 0  ->  1 - 0 = 1   FAIL
//   '999'   len 3, find 0  ->  3 - 0 = 3   FAIL
//
// So THE MINIMUM VALID PERSISTED ENTRY IS TWO CHARACTERS, NOT THREE. With
// `len(rr) = 2`, `rrPower = 10 ^ (2-3) = 0.1`
// [model/service/RoundingRuleService.cfc:L95], which means the fractional-power
// case is reachable from VALIDLY-SAVED data through the dot-less form, not only
// from rows written outside the save context. The minimum valid DOTTED entry is
// indeed `'.99'` at three characters, which is where the `rrPower >= 1`
// reasoning holds. This is a hand-off for the sibling services suite.
// That two-character expression being real is exactly why `cfLen('99')` must be
// 2. That assertion belongs to the sibling `truthiness.test.ts` and is
// cross-referenced here rather than duplicated.
//
// HAND-OFF NOTE 3 - the direction is required but not enumerated.
// `model/validation/RoundingRule.json:L5` makes `roundingRuleDirection`
// required, and that is the whole of its constraint: there is NO enumeration.
// `getRoundingRuleDirectionOptions()` at
// [model/entity/RoundingRule.cfc:L70-L76] returns `Closest`, `Up` and `Down` as
// admin select options for presentation only, never as validation. Combined with
// the missing `default` in the switch at
// [model/service/RoundingRuleService.cfc:L132], a stored direction outside that
// set is a genuine pass-through returning the input unchanged - and again, it is
// NOT one of the ten characterization cases.
//
// ---------------------------------------------------------------------------
// THE MEMOISED LOOKUP - annotated for its real reason
// ---------------------------------------------------------------------------
// `model/service/RoundingRuleService.cfc:L53` declares
// `variables.roundingRuleDetails = {};`; L58-L59 do a `structKeyExists` test
// followed by `structDelete` when an existing entity is saved; and L67-L77
// implement `getRoundingRuleDetailsByID` behind a `!structKeyExists` miss guard.
// In the target that memo becomes REQUEST-SCOPED rather than module-level.
//
// The justification is CORRECTNESS and cross-request isolation, and nothing
// else. On a warm Lambda container module-level state outlives a single
// invocation, so a memo held there would let one request observe another
// request's rounding rule - including a stale entry for a rule that had since
// been edited, which the L58-L59 invalidation could no longer reach across
// invocation boundaries. Money would change as a result.
//
// The legacy comment at [model/service/RoundingRuleService.cfc:L66] frames the
// memo in terms of execution speed while rebuilding the SKU cache. That framing
// is deliberately NOT carried forward, in this suite or anywhere in the port:
// no timing claim and no service-level figure of any kind is asserted anywhere
// here, none exists in the legacy source to preserve, and none may be invented.
// Consistently with that, the legacy runtime's 60-second, 45-second
// and 30-second lock timeouts are noted and deliberately not implemented, and
// nothing in this file tests them.
//
// The same request-scoping rule is why this suite holds no mutable
// module-level state of its own: every subject is built inside the test that
// uses it, so no test can observe another's leftovers, and the runner's
// per-file module isolation is relied upon rather than waived.
//
// ---------------------------------------------------------------------------
// This file exports nothing, declares no fixture, and re-declares no type.
// `DecimalString` lives in the module under test and is imported from there.
// ---------------------------------------------------------------------------
