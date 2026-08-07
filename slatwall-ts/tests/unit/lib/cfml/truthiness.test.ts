// slatwall-ts - unit suite: CFML truthiness, null and len() semantics.
//
// The legacy "unit" tier is integration-style at every level -
// [meta/tests/unit/SlatwallUnitTestBase.cfc:L52] constructs the real application and `:L60` calls
// `bootstrap()` - so this suite shares its assertions with it but not its architecture.
//
// Two legacy conventions are carried across, and only two. Fixture construction follows
// [meta/tests/unit/Helper.cfc] as a pattern rather than an implementation. Regression cases follow
// the `issue_<ticket#>` convention seen at [meta/tests/unit/IssuesTest.cfc:L51]
// (`public void function issue_1097()`); no `issue_*` case falls inside this suite and none is
// fabricated to fill the convention.

import { describe, expect, it } from 'vitest';

import {
  CfmlBooleanConversionError,
  cfBoolean,
  cfLen,
  cfTruthy,
  isNullish,
} from '../../../../src/lib/cfml/truthiness.js';
import type {
  CfBooleanInput,
  CfLenInput,
  CfTruthyInput,
} from '../../../../src/lib/cfml/truthiness.js';

describe('src/lib/cfml/truthiness.ts - isNullish', () => {
  it('answers true for the two absent states', () => {
    expect(isNullish(null)).toBe(true);
    expect(isNullish(undefined)).toBe(true);
  });

  it('answers false for every falsy-but-present value', () => {
    // The whole point of a separate export. CFML agrees on each of these: `isNull('')` is false
    // there too, because an empty string is a value that exists.
    expect(isNullish('')).toBe(false);
    expect(isNullish(0)).toBe(false);
    expect(isNullish(false)).toBe(false);
    expect(isNullish(Number.NaN)).toBe(false);
    expect(isNullish([])).toBe(false);
    expect(isNullish({})).toBe(false);
  });

  it('answers true for the explicit Java null that seeds the rounding fall-through', () => {
    // CFML parity [model/service/RoundingRuleService.cfc:L90-L91]: the rounding algorithm seeds
    // two function-local variables with `var returnValue = javaCast("null", "");` and
    // `var returnDelta = javaCast("null", "");`.
    const inputValue = '7.25';
    const seededReturnValue: string | null = null;
    const assignedReturnValue: string | null = '6.99';

    expect(isNullish(seededReturnValue)).toBe(true);
    expect(isNullish(assignedReturnValue)).toBe(false);

    // The `:L170` decision reproduced exactly as far as the predicate reaches: absent selects the
    // input unchanged, present selects the candidate.
    expect(isNullish(seededReturnValue) ? inputValue : seededReturnValue).toBe(inputValue);
    expect(isNullish(assignedReturnValue) ? inputValue : assignedReturnValue).toBe('6.99');
  });
});

describe('src/lib/cfml/truthiness.ts - six distinct states, not three synonyms', () => {
  it('tells undefined, null, empty string, zero, string zero and string false apart', () => {
    // Kept in a single case on purpose, so the contrast cannot drift apart into separate cases and
    // quietly stop being a contrast.

    // Undefined - absent because it was never set, as with a struct key the legacy code reaches
    // through `structKeyExists` before reading. CFML raises when a null reaches a boolean context,
    // and so does this.
    expect(isNullish(undefined)).toBe(true);
    expect(() => cfTruthy(undefined)).toThrow(CfmlBooleanConversionError);

    // Null - absent explicitly, as with a hydrated column that arrived as SQL NULL, or the
    // `javaCast("null", "")` seed above.
    expect(isNullish(null)).toBe(true);
    expect(() => cfTruthy(null)).toThrow(CfmlBooleanConversionError);

    // '' - PRESENT and empty. This is the state the currency-eligibility gate actually guards
    // against, and it is not an absent state.
    expect(isNullish('')).toBe(false);
    expect(cfTruthy('')).toBe(false);

    // 0 - present, numeric zero. CFML's `listFindNoCase` returns exactly this when the value it
    // looked for is absent, so "absent" arrives here disguised as a present number.
    expect(isNullish(0)).toBe(false);
    expect(cfTruthy(0)).toBe(false);

    // '0' - present, the STRING zero. A driver may hand a boolean column back in this shape; see
    // the `default="0"` columns recorded at the cfBoolean block.
    expect(isNullish('0')).toBe(false);
    expect(cfTruthy('0')).toBe(false);

    // 'false' - present, a persisted boolean literal in a third shape again.
    expect(isNullish('false')).toBe(false);
    expect(cfTruthy('false')).toBe(false);
  });
});

describe('src/lib/cfml/truthiness.ts - len(x) is not the same question as !isNull(x)', () => {
  it('answers both questions about the empty string, and answers them differently', () => {
    // Both assertions live in one case deliberately, so the distinction is permanent rather than
    // something a reader has to reassemble from two places.

    // CFML parity [model/entity/Sku.cfc:L373]: the gate there reads exactly
    // `if(len(setting('skuEligibleCurrencies'))) {` - it asks for STRING LENGTH, and an empty
    // setting therefore measures 0 and closes the gate.
    expect(cfLen('')).toBe(0);
    expect(cfTruthy(cfLen(''))).toBe(false);

    // CFML parity [model/entity/Sku.cfc:L386]: the guard there reads
    // `if(!isNull(getRenewalPrice()))` - it asks about PRESENCE, and the empty string is present.
    // The same shape guards `getListPrice()` at `:L390`.
    expect(isNullish('')).toBe(false);
  });

  it('treats a zero-valued persisted price as present, because it is', () => {
    // CFML parity [model/entity/Sku.cfc:L386, L390, L394]: inside the cascade, `renewalPrice`
    // (L386-L389) and `listPrice` (L390-L393) are each written only behind a `!isNull(...)` guard,
    // while `:L394` sets `.price` UNCONDITIONALLY - there is no guard on it at all.
    const persistedZeroRenewalPrice = '0.00';
    expect(isNullish(persistedZeroRenewalPrice)).toBe(false);
    expect(cfLen(persistedZeroRenewalPrice)).toBe(4);

    const absentRenewalPrice: string | null = null;
    expect(isNullish(absentRenewalPrice)).toBe(true);
    expect(cfLen(absentRenewalPrice)).toBe(0);
  });
});

describe('src/lib/cfml/truthiness.ts - cfLen', () => {
  it('returns a count and not a boolean', () => {
    // This is the contract, stated as an assertion rather than as a comment.
    expect(typeof cfLen('abc')).toBe('number');
    expect(typeof cfLen('')).toBe('number');
    expect(typeof cfLen(null)).toBe('number');
  });

  it('counts string characters', () => {
    expect(cfLen('')).toBe(0);
    expect(cfLen('abc')).toBe(3);

    // `len()` counts characters and never trims - only the boolean coercion trims. A
    // whitespace-only value therefore has length while not being truthy, and both answers are
    // correct for the question each was asked.
    expect(cfLen('   ')).toBe(3);
  });

  it('counts an absent value as zero', () => {
    // Absent reaches this helper by two distinct routes - a hydrated SQL NULL and a struct key
    // that was never set - and both must answer 0 rather than fail.
    expect(cfLen(null)).toBe(0);
    expect(cfLen(undefined)).toBe(0);
  });

  it('counts array elements', () => {
    expect(cfLen([1, 2, 3])).toBe(3);
    expect(cfLen([])).toBe(0);

    // CFML parity [model/entity/PriceGroupRate.cfc:L111, L114, L117, L136, L139, L142]: six
    // `if(arrayLen(...))` sites read an element count as a predicate, over `getProducts()`,
    // `getProductTypes()`, `getSkus()` and their three excluded counterparts.
    expect(cfTruthy(cfLen([]))).toBe(false);
    expect(cfTruthy(cfLen([1]))).toBe(true);
  });

  it('measures a two-character rounding expression as two characters', () => {
    // CFML `find()` returns 0 when the substring is ABSENT, so a two-character all-digit
    // expression such as '99' satisfies the test: 2 - 0 = 2, and `isNumeric('99')` is true.
    expect(cfLen('99')).toBe(2);
    expect(cfLen('.99')).toBe(3);
    expect(cfLen('0.99')).toBe(4);
    expect(cfLen('9.99')).toBe(4);
    expect(cfLen('0.00')).toBe(4);
    expect(cfLen('9')).toBe(1);
    expect(cfLen('999')).toBe(3);
  });

  it('measures a number by its plain decimal rendering', () => {
    // CFML parity [model/service/RoundingRuleService.cfc:L101-L102]: the rounding algorithm
    // computes an intermediate ARITHMETICALLY and then takes `len()` of the result - var
    // lowerValue = inputValue - rrPower; if(len(lowerValue) > len(rr)) {.
    expect(cfLen(11.3)).toBe(4);
    expect(cfLen(11)).toBe(2);
    expect(cfLen(0)).toBe(1);

    // JUDGMENT CALL: the trailing-zero half of that mechanism is deliberately not pinned here.
    expect(cfLen(12.3)).toBe(4);
  });

  it('measures the extremes as plain decimals rather than as exponential text', () => {
    // JUDGMENT CALL: CFML renders a number in plain decimal notation, while this runtime switches
    // to exponential text at the extremes - at or above 1e21 and below 1e-6.
    //
    // Large magnitude: a leading digit followed by twenty-one zeros is 22 characters, whatever
    // this runtime chose to print.
    expect(cfLen(1e21)).toBe(22);
    expect(cfLen(1.5e21)).toBe(22);

    // Small magnitude: a leading zero, the point, six zeros and the digit.
    expect(cfLen(1e-7)).toBe(9);

    // And the sign is counted, as it is for any other negative number.
    expect(cfLen(-1.5e-7)).toBe(11);

    // Just inside the plain-rendering range, for contrast - no expansion needed.
    expect(cfLen(1e20)).toBe(21);

    // The guard that narrows the expansion pattern's capture groups, and - the expansion branch
    // that places the point *inside* the digit run.
    //
    // Both were probed exhaustively across the double range: for every value this runtime renders
    // exponentially, the integer part is exactly one digit.
  });

  it('never throws and never returns a negative count across its declared domain', () => {
    // The declared input domain, typed by the module's own exported type so that narrowing the
    // union upstream would break compilation here rather than slipping through as an untested
    // widening.
    const domain: readonly CfLenInput[] = [
      '',
      'abc',
      '   ',
      '99',
      '0.00',
      null,
      undefined,
      [],
      [1, 2, 3],
      0,
      1,
      11.3,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (const value of domain) {
      expect(() => cfLen(value)).not.toThrow();

      const measured = cfLen(value);
      expect(typeof measured).toBe('number');
      expect(measured).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(measured)).toBe(true);
    }
  });

  it('measures a value that cannot be rendered as zero, which fails closed', () => {
    // JUDGMENT CALL: CFML has no not-a-number value, so nothing is being preserved here and
    // nothing may be claimed.
    expect(cfLen(Number.NaN)).toBe(0);
    expect(cfTruthy(cfLen(Number.NaN))).toBe(false);

    // JUDGMENT CALL: the infinities cannot arise from CFML either. They fall through to their
    // plain rendering, which is non-zero in length - consistent with the boolean coercion reading
    // either infinity as true.
    expect(cfLen(Number.POSITIVE_INFINITY)).toBe(8);
    expect(cfLen(Number.NEGATIVE_INFINITY)).toBe(9);
  });
});

describe('src/lib/cfml/truthiness.ts - cfTruthy decision table', () => {
  it('passes a real boolean through unchanged', () => {
    expect(cfTruthy(true)).toBe(true);
    expect(cfTruthy(false)).toBe(false);
  });

  it('reads a number by whether it is zero', () => {
    expect(cfTruthy(1)).toBe(true);
    expect(cfTruthy(0)).toBe(false);
    expect(cfTruthy(2)).toBe(true);
    expect(cfTruthy(-1)).toBe(true);
  });

  it('raises for not-a-number rather than resolving it', () => {
    // CFML has no not-a-number value, so no legacy behaviour is being preserved either way - which
    // is precisely why it must not be resolved to one.
    expect(() => cfTruthy(Number.NaN)).toThrow(CfmlBooleanConversionError);

    // `cfLen` still answers 0 for the same input, and the two do not disagree: a count has a spare
    // value for "nothing there" and a boolean does not.
    expect(cfLen(Number.NaN)).toBe(0);
  });

  it('reads either infinity as true, because neither is zero', () => {
    // JUDGMENT CALL: same class as the row above - neither infinity can arise from CFML, so
    // nothing is being preserved. They follow the plain non-zero rule rather than being
    // special-cased, which keeps the numeric branch to one statement of intent instead of three.
    expect(cfTruthy(Number.POSITIVE_INFINITY)).toBe(true);
    expect(cfTruthy(Number.NEGATIVE_INFINITY)).toBe(true);
  });

  it('reads the numeric string literals the same way as the numbers', () => {
    expect(cfTruthy('1')).toBe(true);
    expect(cfTruthy('0')).toBe(false);
  });

  it('reads the CFML boolean literals case-insensitively', () => {
    // CFML boolean coercion ignores case, so all three spellings answer alike.
    expect(cfTruthy('true')).toBe(true);
    expect(cfTruthy('TRUE')).toBe(true);
    expect(cfTruthy('True')).toBe(true);

    expect(cfTruthy('false')).toBe(false);
    expect(cfTruthy('False')).toBe(false);
    expect(cfTruthy('FALSE')).toBe(false);
  });

  it('reads yes and no as boolean literals too, with no in-scope caller', () => {
    // The shipped module accepts `yes` and `no` alongside `true` and `false`, which is correct for
    // CFML, so both pairs are pinned here.
    //
    // Flagged deliberately: these two literals have ZERO in-scope call sites.
    expect(cfTruthy('yes')).toBe(true);
    expect(cfTruthy('YES')).toBe(true);
    expect(cfTruthy('no')).toBe(false);
    expect(cfTruthy('No')).toBe(false);
  });

  it('trims surrounding whitespace before consulting the table', () => {
    expect(cfTruthy(' 1 ')).toBe(true);
    expect(cfTruthy('  true  ')).toBe(true);
    expect(cfTruthy(' 0 ')).toBe(false);

    // Whitespace-only input trims down to empty and therefore reads false, even though `cfLen`
    // measures it as three characters.
    expect(cfTruthy('   ')).toBe(false);
    expect(cfLen('   ')).toBe(3);
  });

  it('coerces any other numeric string through its value', () => {
    expect(cfTruthy('2')).toBe(true);
    expect(cfTruthy('-1')).toBe(true);
    expect(cfTruthy('0.0')).toBe(false);
    expect(cfTruthy('00')).toBe(false);
  });

  it('raises for a non-parseable string, as CFML does', () => {
    // CFML parity: CFML raises a conversion error when a non-empty, non-boolean, non-numeric
    // string reaches a boolean context, and so does this.
    expect(() => cfTruthy('abc')).toThrow(CfmlBooleanConversionError);
    expect(() => cfTruthy('USD')).toThrow(CfmlBooleanConversionError);
    expect(() => cfTruthy('Y')).toThrow(CfmlBooleanConversionError);
    expect(() => cfTruthy('on')).toThrow(CfmlBooleanConversionError);
    expect(() => cfTruthy('tru')).toThrow(CfmlBooleanConversionError);
  });

  it('names the offending value, its type and the reason in the raised error', () => {
    let caught: unknown;
    try {
      cfTruthy('maybe');
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CfmlBooleanConversionError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('CfmlBooleanConversionError');
    // Quoted, so that '0', '' and ' ' stay visibly distinct from one another and from the number 0
    // the distinction this whole module is about.
    expect((caught as Error).message).toContain('"maybe"');
    expect((caught as Error).message).toContain('length 5');
    expect((caught as Error).message).toContain('true/false/yes/no');
  });

  it('bounds the value it reproduces in the error message', () => {
    // These values can arrive from a request, so a pathological one must not dominate a log line.
    // The untruncated length is reported either way.
    const long = 'x'.repeat(500);
    let message = '';
    try {
      cfTruthy(long);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('...');
    expect(message).toContain('length 500');
    expect(message.length).toBeLessThan(400);
  });

  it('reads the empty string as false', () => {
    // CFML parity [model/entity/Sku.cfc:L373]: this is the one row of the table with direct,
    // unambiguous legacy grounding.
    expect(cfTruthy('')).toBe(false);
  });

  it('raises for an absent value, as CFML does', () => {
    // CFML parity: CFML raises a conversion error when a null reaches a boolean context.
    expect(() => cfTruthy(null)).toThrow(CfmlBooleanConversionError);
    expect(() => cfTruthy(undefined)).toThrow(CfmlBooleanConversionError);

    // The error explains which alternative to reach for.
    expect(() => cfTruthy(null)).toThrow(/isNullish\(\)/);
    expect(() => cfTruthy(null)).toThrow(/cfBoolean\(\)/);
  });

  it('composes with cfLen into the len()-as-predicate idiom', () => {
    // CFML parity [model/entity/Sku.cfc:L373]: `cfTruthy(cfLen(x))` is the ported shape of
    // `if(len(x))`. Asserted directly, because this composition is what the ported call sites will
    // actually write.
    expect(cfTruthy(cfLen(''))).toBe(false);
    expect(cfTruthy(cfLen('USD,CAD'))).toBe(true);

    // And the composition is not the same question as coercing the value itself.
    expect(cfTruthy(cfLen(0))).toBe(true);
    expect(cfTruthy(0)).toBe(false);
    expect(cfTruthy(cfLen('abc'))).toBe(true);
    expect(() => cfTruthy('abc')).toThrow(CfmlBooleanConversionError);
    expect(cfTruthy(cfLen('   '))).toBe(true);
    expect(cfTruthy('   ')).toBe(false);

    // The composition is also what makes the raise harmless at a ported `len()` site: `cfLen`
    // hands `cfTruthy` a number, and every number except `NaN` answers.
    expect(cfTruthy(cfLen(null))).toBe(false);
    expect(cfTruthy(cfLen(undefined))).toBe(false);
  });

  it('answers every INTERPRETABLE value in its declared domain, and raises for the rest', () => {
    // The sweep partitions the declared union rather than proving totality: every value that
    // carries a boolean meaning answers with a `boolean`, and the three that carry none raise.
    const raising: readonly CfTruthyInput[] = [null, undefined, Number.NaN, 'abc'];

    for (const value of raising) {
      expect(() => cfTruthy(value)).toThrow(CfmlBooleanConversionError);
    }

    const domain: readonly CfTruthyInput[] = [
      0,
      1,
      '0',
      '1',
      'true',
      'false',
      '',
      '   ',
      'TRUE',
      'False',
      ' 1 ',
      2,
      -1,
      '0.0',
      true,
      false,
    ];

    for (const value of domain) {
      expect(() => cfTruthy(value)).not.toThrow();
      expect(typeof cfTruthy(value)).toBe('boolean');
    }

    // Every case in either list is also covered by an explicit row above, so the sweep may
    // partition the domain but it may never be the only evidence for a row.
    expect(domain).toHaveLength(16);
    expect(raising).toHaveLength(4);
    expect(domain.filter((value) => raising.includes(value))).toHaveLength(0);
  });
});

describe('src/lib/cfml/truthiness.ts - cfBoolean as the persisted-flag reader', () => {
  // CFML parity - the boolean-default inventory, re-measured.
  //
  // Three literal conventions, not four: `"0"` twice, `"1"` twice and `"false"` twice.
  //
  // The nine undefaulted properties are why the input union has to admit absent:
  // [model/entity/Product.cfc:L53, L64], [model/entity/ProductType.cfc:L54, L55],
  // [model/entity/Brand.cfc:L53, L54].

  it('reads the two string-zero and string-one conventions', () => {
    // Traces to [model/entity/Sku.cfc:L59] and [model/entity/OptionGroup.cfc:L57] for `"0"`, and
    // to [model/entity/Sku.cfc:L53] and [model/entity/Promotion.cfc:L56] for `"1"`.
    expect(cfBoolean('0')).toBe(false);
    expect(cfBoolean('1')).toBe(true);
  });

  it('reads the string-false convention as false', () => {
    // Traces to [model/entity/Product.cfc:L58] and [model/entity/PriceGroupRate.cfc:L53].
    //
    // The flag is used DIRECTLY as a condition, with no comparison and no coercion of its own.
    expect(cfBoolean('false')).toBe(false);
    expect(cfBoolean('true')).toBe(true);
  });

  it('reads a driver-supplied number or boolean', () => {
    // A driver may hand the same column back as a real boolean or as 0/1 rather than as text,
    // depending on how it is configured, so all three shapes have to land on the same answer.
    expect(cfBoolean(0)).toBe(false);
    expect(cfBoolean(1)).toBe(true);
    expect(cfBoolean(false)).toBe(false);
    expect(cfBoolean(true)).toBe(true);
  });

  it('reads an absent flag as false', () => {
    // JUDGMENT CALL: nine of the fifteen boolean properties declare no default, so an unset column
    // arrives as SQL NULL and reaches this reader as absent. False is the answer, which is the
    // same answer the legacy engine gave a flag it had no value for.
    //
    // Note what this does not do: it does not decide anything about money.
    expect(cfBoolean(null)).toBe(false);
    expect(cfBoolean(undefined)).toBe(false);
  });

  it('is case-insensitive about the literal, as the source itself corroborates', () => {
    // CFML parity - the attribute is spelled `ormtype` at [model/entity/OptionGroup.cfc:L57] and
    // [model/entity/Promotion.cfc:L56] but `ormType`, with a capital T, at
    // [model/entity/PriceGroupRate.cfc:L53].
    expect(cfBoolean('FALSE')).toBe(false);
    expect(cfBoolean('False')).toBe(false);
    expect(cfBoolean('TRUE')).toBe(true);
    expect(cfBoolean('True')).toBe(true);
  });

  it('answers every shape a persisted flag can arrive in, without throwing', () => {
    // Typed by the module's own exported input type, so a narrowed union upstream becomes a
    // compilation failure here rather than an untested widening.
    const persistedShapes: readonly CfBooleanInput[] = [
      '0',
      '1',
      'false',
      'true',
      0,
      1,
      false,
      true,
      null,
      undefined,
    ];

    for (const shape of persistedShapes) {
      expect(() => cfBoolean(shape)).not.toThrow();
      expect(typeof cfBoolean(shape)).toBe('boolean');
    }
  });

  it('agrees with cfTruthy on every PRESENT shape, because it delegates rather than restates', () => {
    // The shipped reader delegates its coercion instead of carrying a second copy of the table,
    // and that is the property worth pinning: two copies of one decision table are two things that
    // can drift apart.
    const presentShapes: readonly CfBooleanInput[] = [
      '0',
      '1',
      'false',
      'true',
      'FALSE',
      0,
      1,
      false,
      true,
    ];

    for (const shape of presentShapes) {
      expect(cfBoolean(shape)).toBe(cfTruthy(shape));
    }
  });

  it('resolves an ABSENT flag to false itself, which is the one behaviour it adds', () => {
    // The deliberate asymmetry with `cfTruthy`, and the reason both exports exist. `cfBoolean`
    // knows something `cfTruthy` cannot: its input came from a persisted flag column whose absence
    // has a documented meaning.
    //
    // A general boolean context carries no such warrant, so `cfTruthy` raises.
    expect(cfBoolean(null)).toBe(false);
    expect(cfBoolean(undefined)).toBe(false);
    expect(() => cfTruthy(null)).toThrow(CfmlBooleanConversionError);
    expect(() => cfTruthy(undefined)).toThrow(CfmlBooleanConversionError);
  });

  it('still raises for a PRESENT flag value it cannot interpret', () => {
    // The absent case is resolved because the ORM evidence justifies it; an unrecognised present
    // value has no such justification. A flag column that hydrates as 'maybe' is a schema
    // surprise, not a false.
    expect(() => cfBoolean('maybe')).toThrow(CfmlBooleanConversionError);
    expect(() => cfBoolean(Number.NaN)).toThrow(CfmlBooleanConversionError);
  });
});

describe('src/lib/cfml/truthiness.ts - the six null-check idiom classes in the slice', () => {
  // Reading the in-scope sources end to end turns up six distinct shapes of null and emptiness
  // check, not one.

  it('class 1 - a compound predicate that combines presence with not-null', () => {
    // CFML parity [model/entity/Sku.cfc:L169] and [model/entity/Sku.cfc:L203].
    //
    // CORRECTION: the assigned-folder specification lists these two as bare `isNull(x)` sites.
    //
    // And `:L203` is the same shape with a single leading `structKeyExists`.
    const productAssociation: string | null = null;
    expect(isNullish(productAssociation)).toBe(true);

    const hydratedProductAssociation: string | null = 'a-product-id';
    expect(isNullish(hydratedProductAssociation)).toBe(false);
  });

  it('class 2 - a negated not-null guard standing alone', () => {
    // CFML parity - the largest class in the slice.
    //
    // Every one of them asks the same question, and `isNullish` is its negation.
    const resolvedRoundingRule: string | null = null;
    expect(isNullish(resolvedRoundingRule)).toBe(true);
    expect(!isNullish(resolvedRoundingRule)).toBe(false);
  });

  it('class 3 - a string or list length read as a bare predicate', () => {
    // CFML parity [model/entity/Sku.cfc:L373] is the highest-consequence member of this class and
    // has its own block below.
    //
    // `cfTruthy(cfLen(...))` is the guarded form written the positive way round - presence first,
    // then length.
    const suppliedOptions = '';
    expect(cfTruthy(cfLen(suppliedOptions))).toBe(false);

    const populatedOptions = 'optA,optB';
    expect(cfTruthy(cfLen(populatedOptions))).toBe(true);

    // HAND-OFF NOTE, stated and deliberately not repaired here.
  });

  it('class 4 - a struct key presence test', () => {
    // CFML parity `model/entity/Sku.cfc` uses `structKeyExists` on 39 distinct lines - 46
    // occurrences in all - which makes it the most common check in the largest in-scope entity.
    const currencyDetails: Readonly<Record<string, { readonly listPrice?: string }>> = {
      USD: {},
    };

    const knownCurrency: unknown = currencyDetails['USD'];
    expect(isNullish(knownCurrency)).toBe(false);

    // Present as a currency, absent as a list price - exactly the two-step shape at `:L275-L279`.
    const listPriceForKnownCurrency: unknown = currencyDetails['USD']?.listPrice;
    expect(isNullish(listPriceForKnownCurrency)).toBe(true);

    const unknownCurrency: unknown = currencyDetails['CAD'];
    expect(isNullish(unknownCurrency)).toBe(true);
  });

  it('class 5 - a compound that treats absent and empty as one state', () => {
    // CFML parity [model/entity/ProductType.cfc:L111], verbatim: if(isNull(getSystemCode()) ||
    // getSystemCode() == ""){ and [model/entity/PromotionCode.cfc:L181], verbatim:
    // if(isNull(getPromotionCode()) || getPromotionCode() == ""){.
    const absentSystemCode: string | null = null;
    const emptySystemCode = '';
    const presentSystemCode = 'stProduct';

    expect(isNullish(absentSystemCode) || cfLen(absentSystemCode) === 0).toBe(true);
    expect(isNullish(emptySystemCode) || cfLen(emptySystemCode) === 0).toBe(true);
    expect(isNullish(presentSystemCode) || cfLen(presentSystemCode) === 0).toBe(false);

    // And the halves genuinely disagree about the empty string, which is why both clauses exist in
    // the source.
    expect(isNullish(emptySystemCode)).toBe(false);
    expect(cfLen(emptySystemCode)).toBe(0);
  });

  it('class 6 - an array length read as a bare predicate', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L111, L114, L117] read
    // `arrayLen(getProducts())`, `arrayLen(getProductTypes())` and `arrayLen(getSkus())`, and
    // `:L136, L139, L142` read the same three excluded associations.
    const excludedSkus: readonly string[] = [];
    expect(cfTruthy(cfLen(excludedSkus))).toBe(false);

    const includedSkus: readonly string[] = ['sku-1', 'sku-2'];
    expect(cfTruthy(cfLen(includedSkus))).toBe(true);

    const associationNeverFetched: readonly string[] | null = null;
    expect(isNullish(associationNeverFetched)).toBe(true);
    expect(isNullish(excludedSkus)).toBe(false);
  });
});

describe('src/lib/cfml/truthiness.ts - the Sku.getCurrencyDetails() eligibility gate', () => {
  // That single gate wraps the ENTIRE four-step cascade body, L374 through L430.
  //
  // For context, and as annotation only - no settings port is asserted anywhere in this file: the
  // setting's own default is `getCurrencyService().getAllActiveCurrencyIDList()`
  // [model/service/SettingService.cfc:L222].

  it('stays shut on an empty setting and opens on a populated one', () => {
    const noEligibleCurrencies = '';
    expect(cfLen(noEligibleCurrencies)).toBe(0);
    expect(cfTruthy(cfLen(noEligibleCurrencies))).toBe(false);

    const eligibleCurrencies = 'USD,CAD,EUR';
    expect(cfLen(eligibleCurrencies)).toBe(11);
    expect(cfTruthy(cfLen(eligibleCurrencies))).toBe(true);
  });

  it('leaves the memo empty when the gate stays shut, so no price resolves', () => {
    // The memo as `:L369` leaves it when `:L373` does not open: an empty struct.
    const memoWhenGateStaysShut: Readonly<Record<string, { readonly price: string }>> = {};

    expect(cfTruthy(cfLen(''))).toBe(false);
    expect(cfLen(Object.keys(memoWhenGateStaysShut))).toBe(0);

    // Never COERCE A missing money value to ZERO. Substituting `0` for these nulls would silently
    // sell products for free, and that is the single highest-consequence parity check in this
    // migration.
    const unresolvedPrice: unknown = memoWhenGateStaysShut['USD'];

    expect(unresolvedPrice).toBeUndefined();
    expect(isNullish(unresolvedPrice)).toBe(true);
    expect(unresolvedPrice).not.toBe(0);
    expect(unresolvedPrice).not.toBe('');
    expect(unresolvedPrice).not.toBeNull();
    expect(unresolvedPrice).not.toEqual({});
  });

  it('keeps a present zero price apart from an absent one', () => {
    // The contrast that makes the rule above precise.
    //
    // The two states are therefore both real and completely different, and the prohibition is
    // narrow and exact: never invent a zero for a price that is absent.
    const currencyDetailsForBaseCurrency: Readonly<{
      readonly price: string;
      readonly renewalPrice?: string;
    }> = { price: '0.00' };

    const writtenZeroPrice: unknown = currencyDetailsForBaseCurrency.price;
    expect(isNullish(writtenZeroPrice)).toBe(false);
    expect(writtenZeroPrice).toBe('0.00');

    const absentRenewalPrice: unknown = currencyDetailsForBaseCurrency.renewalPrice;
    expect(isNullish(absentRenewalPrice)).toBe(true);
    expect(absentRenewalPrice).toBeUndefined();
    expect(absentRenewalPrice).not.toBe(0);
    expect(absentRenewalPrice).not.toBe('0.00');
  });
});

describe("src/lib/cfml/truthiness.ts - CFML's 0-means-absent convention", () => {
  it('reads a zero index as false and a first-position hit as true', () => {
    // CFML parity - `listFindNoCase()` returns a 1-BASED index, or 0 when the value is absent, and
    // the slice uses that return DIRECTLY as a boolean at seventeen sites:
    // [model/service/PromotionService.cfc:L61, L200, L542, L714, L794, L865, L900, L935, L966],
    // [model/entity/Product.cfc:L440, L442, L451], [model/entity/Sku.cfc:L294, L299, L306, L309],
    // and negated at [model/service/ProductService.cfc:L144].
    expect(cfTruthy(0)).toBe(false);
    expect(cfTruthy(1)).toBe(true);

    // The PORTING CONSEQUENCE, stated so it is not rediscovered per call site: a ported caller has
    // to write the comparison out, as `> 0`, rather than reuse the bare-truthiness idiom.
    const absentIndex = 0;
    const firstPositionIndex = 1;
    expect(absentIndex > 0).toBe(false);
    expect(firstPositionIndex > 0).toBe(true);
    expect(cfTruthy(absentIndex)).toBe(absentIndex > 0);
    expect(cfTruthy(firstPositionIndex)).toBe(firstPositionIndex > 0);
  });

  it('does not confuse a zero index with a zero-length measurement', () => {
    // A returned index of 0 means "not found"; a measured length of 0 means "nothing there". Both
    // coerce to false, and they arrive by different routes, so the two idioms stay separate even
    // where they agree.
    expect(cfTruthy(0)).toBe(false);
    expect(cfTruthy(cfLen(''))).toBe(false);

    // Where they disagree is the case worth keeping: the number zero measures as one character,
    // because it renders as the text '0'.
    expect(cfLen(0)).toBe(1);
    expect(cfTruthy(cfLen(0))).toBe(true);
  });
});
