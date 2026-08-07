// slatwall-ts - tests/unit/domain/valueObjects/currencyCode.test.ts.
//
// Pins src/domain/valueObjects/currencyCode.ts - the branded three-character currency code for the
// AWS Lambda `nodejs20.x` port of the Slatwall 3.1.39 catalog + promotions/pricing slice.
//
// Coverage is NET-NEW, with no legacy antecedent to extend: CFML had no branded currency-code
// type, and of the four legacy files bearing on this slice none touches a value object.
//
// CENSUS, counted rather than quoted: model/entity/*.cfc declares `currencyCode` NINETEEN times.

import { describe, expect, it } from 'vitest';

import {
  currencyCodeEquals,
  getByCurrencyCode,
  InvalidCurrencyCodeError,
  isCurrencyCode,
  toCurrencyCode,
} from '../../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';
import * as currencyCodeModule from '../../../../src/domain/valueObjects/currencyCode.js';

// JUDGMENT CALL: exactly two symbols are imported from outside the module under test, and each is
// demanded by a shipped signature rather than convenient.
//
// `structKeyExists` - `getByCurrencyCode` answers only the VALUE question and documents that a
// caller needing the PRESENCE answer asks `structKeyExists` directly.
import { CfmlComparisonError, structKeyExists } from '../../../../src/lib/cfml/struct.js';

// Neutral, deliberately unreal three-character codes. Every subject in this file is one of these.
//
// CFML parity [model/service/SettingService.cfc:L221]: there is no default currency code anywhere
// in this file - not in an assertion, not in a fixture, not in a comment example.
const NEUTRAL_CODE = 'XXX';
const NEUTRAL_CODE_LOWER = 'xxx';
const OTHER_NEUTRAL_CODE = 'ZZZ';

// Every wrong-length input the constructor must reject, labelled by its actual length so a failure
// names the case rather than the index.
const WRONG_LENGTH_INPUTS: ReadonlyArray<readonly [label: string, value: string]> = [
  ['zero characters', ''],
  ['one character', 'X'],
  ['two characters', 'XX'],
  ['four characters', 'XXXX'],
  ['a longer string', 'XXXXXXXXXXXX'],
];

// Values the type guard must answer `false` for without throwing.
const NON_STRING_INPUTS: ReadonlyArray<readonly [label: string, value: unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['a three-digit number', 123],
  ['a boolean', true],
  ['a symbol', Symbol('XXX')],
  ['an array of three single characters', ['X', 'X', 'X']],
  ['an object carrying a conforming code', { currencyCode: 'XXX' }],
  ['a Date', new Date('2024-06-01T00:00:00.000Z')],
];

describe('the exactly-three-character length contract', () => {
  it('accepts a conforming code and hands back the identical string', () => {
    const code = toCurrencyCode(NEUTRAL_CODE);

    expect(code).toBe(NEUTRAL_CODE);
  });

  it.each(WRONG_LENGTH_INPUTS)('throws for %s', (_label, value) => {
    expect(() => toCurrencyCode(value)).toThrow(InvalidCurrencyCodeError);
  });
  it('reports the rejected value verbatim, and its measured length, on the error', () => {
    let caught: unknown;

    try {
      toCurrencyCode('XXXX');
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidCurrencyCodeError);
    expect(caught).toBeInstanceOf(Error);

    if (caught instanceof InvalidCurrencyCodeError) {
      expect(caught.name).toBe('InvalidCurrencyCodeError');
      expect(caught.received).toBe('XXXX');
      expect(caught.receivedLength).toBe(4);
      expect(caught.message).toContain('exactly 3 characters');
    }
  });

  it('echoes a rejected mixed-case value without normalising it on the error', () => {
    let caught: unknown;

    try {
      toCurrencyCode('xXxX');
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidCurrencyCodeError);

    if (caught instanceof InvalidCurrencyCodeError) {
      // Neither upper-cased nor lower-cased on the way into the report.
      expect(caught.received).toBe('xXxX');
    }
  });

  // JUDGMENT CALL: this case pins UTF-16 code-unit counting, the one place "three characters" and
  // "three code units" visibly disagree.
  it('measures length in UTF-16 code units, exactly as CFML len() does', () => {
    expect(toCurrencyCode('\u{1F600}X')).toBe('\u{1F600}X');
    expect(() => toCurrencyCode('\u{1F600}XX')).toThrow(InvalidCurrencyCodeError);
  });
});

describe('the brand exists only in the type system and has zero runtime footprint', () => {
  it('leaves a validated code a plain primitive string', () => {
    const code = toCurrencyCode(NEUTRAL_CODE);

    expect(typeof code).toBe('string');
    expect(typeof code).not.toBe('object');
  });
  it('returns the very string it was given, not a wrapper around it', () => {
    const input = OTHER_NEUTRAL_CODE;
    const code = toCurrencyCode(input);

    expect(code).toBe(input);
    expect(String(code)).toBe(input);
    expect(code.length).toBe(3);
  });

  // Compared against an unbranded string of the same value rather than an empty list.
  it('attaches no marker property and no marker symbol to the value', () => {
    const code = toCurrencyCode(NEUTRAL_CODE);
    const unbranded: string = NEUTRAL_CODE;

    expect(Object.keys(code)).toEqual(Object.keys(unbranded));
    expect(Object.getOwnPropertyNames(code)).toEqual(Object.getOwnPropertyNames(unbranded));
    expect(Object.getOwnPropertySymbols(code)).toEqual(Object.getOwnPropertySymbols(unbranded));
    expect(Object.getOwnPropertySymbols(code)).toEqual([]);
  });

  it('stays usable as an ordinary string everywhere a string is expected', () => {
    const code = toCurrencyCode(NEUTRAL_CODE);
    const widened: string = code;

    expect(widened).toBe(NEUTRAL_CODE);
    expect(`${code}`).toBe(NEUTRAL_CODE);
    expect([code].join('')).toBe(NEUTRAL_CODE);
  });

  it('does not let a bare string masquerade as a validated code', () => {
    // @ts-expect-error A plain string is deliberately NOT assignable to the
    // branded type. The brand is an unexported `unique symbol`, so the only routes in are the
    // validating constructor and the type guard, and both check first.
    const unvalidated: CurrencyCode = NEUTRAL_CODE;

    expect(unvalidated).toBe(NEUTRAL_CODE);
  });

  it('does not carry the brand onto a value derived from a validated code', () => {
    const code = toCurrencyCode(NEUTRAL_CODE_LOWER);

    // Passed through the constructor, so it is a plain string and must not be assignable to the
    // branded type.
    // @ts-expect-error An upper-cased copy is a DIFFERENT value that never
    // passed through the constructor, so it is a plain string and must not be assignable to the
    // branded type. Folding is therefore a comparison concern here rather than a construction one.
    const folded: CurrencyCode = code.toUpperCase();

    expect(folded).toBe(NEUTRAL_CODE);
    expect(code).toBe(NEUTRAL_CODE_LOWER);
  });
});

describe('the type guard answers without throwing, and narrows', () => {
  it('accepts a conforming code', () => {
    expect(isCurrencyCode(NEUTRAL_CODE)).toBe(true);
  });

  it.each(WRONG_LENGTH_INPUTS)('returns false rather than throwing for %s', (_label, value) => {
    expect(() => isCurrencyCode(value)).not.toThrow();
    expect(isCurrencyCode(value)).toBe(false);
  });

  // The parameter is `unknown`, not `string`, so these need no suppression comment: the guard is
  // meant to be asked of a value nothing is known about.
  it.each(NON_STRING_INPUTS)('returns false for %s', (_label, value) => {
    expect(() => isCurrencyCode(value)).not.toThrow();
    expect(isCurrencyCode(value)).toBe(false);
  });

  // The guard is only a genuine alternative to the throwing constructor if it NARROWS. Assigning
  // inside the guarded branch makes the compiler prove that; were the predicate `boolean` this
  // block would not compile.
  it('narrows an unknown value to the branded type inside the guarded branch', () => {
    const fromOutside: unknown = OTHER_NEUTRAL_CODE;

    if (isCurrencyCode(fromOutside)) {
      const narrowed: CurrencyCode = fromOutside;

      expect(narrowed).toBe(OTHER_NEUTRAL_CODE);
      expect(currencyCodeEquals(narrowed, OTHER_NEUTRAL_CODE.toLowerCase())).toBe(true);
    } else {
      throw new Error('the guard rejected a conforming three-character code');
    }
  });

  it('applies exactly the same rule as the constructor, so the two cannot disagree', () => {
    const candidates = [NEUTRAL_CODE, ...WRONG_LENGTH_INPUTS.map(([, value]) => value)];

    for (const candidate of candidates) {
      let constructorAccepted = true;

      try {
        toCurrencyCode(candidate);
      } catch {
        constructorAccepted = false;
      }

      expect(isCurrencyCode(candidate)).toBe(constructorAccepted);
    }
  });
});

// Two separate rules, both load-bearing, and this suite must never conflate them.

describe('casing is stored exactly as supplied and is never folded on the way in', () => {
  // CFML parity [model/entity/Sku.cfc:L385, L400]: CFML `eq` ignores case but stores precisely
  // what it was handed.
  it.each([
    ['all lower case', 'abc'],
    ['all upper case', 'ABC'],
    ['leading upper case', 'Abc'],
    ['inner upper case', 'aBc'],
    ['trailing upper case', 'abC'],
  ])('preserves %s unchanged', (_label, value) => {
    const code = toCurrencyCode(value);

    expect(code).toBe(value);
  });

  it('does not upper-case and does not lower-case a mixed-case code', () => {
    const code = toCurrencyCode('aBc');

    expect(code).toBe('aBc');
    expect(code).not.toBe('ABC');
    expect(code).not.toBe('abc');
  });

  it('accepts a mixed-case code through the guard without folding it either', () => {
    const fromOutside: unknown = 'aBc';

    expect(isCurrencyCode(fromOutside)).toBe(true);

    if (isCurrencyCode(fromOutside)) {
      expect(fromOutside).toBe('aBc');
    }
  });
});

describe('whitespace is significant and is never trimmed away', () => {
  // JUDGMENT CALL: trimming is the sort of helpful-looking normalisation that changes which key a
  // later lookup resolves to, so it is absent by design and asserted absent here.
  it('rejects a four-character value with a leading space instead of trimming it', () => {
    expect(() => toCurrencyCode(' XXX')).toThrow(InvalidCurrencyCodeError);
    expect(isCurrencyCode(' XXX')).toBe(false);
  });

  it('rejects a four-character value with a trailing space instead of trimming it', () => {
    expect(() => toCurrencyCode('XXX ')).toThrow(InvalidCurrencyCodeError);
    expect(isCurrencyCode('XXX ')).toBe(false);
  });

  it('accepts a three-character value containing a space, and keeps the space', () => {
    // Three code units is three code units. The character class is not constrained, so the space
    // is simply part of the value.
    const code = toCurrencyCode(' XX');

    expect(code).toBe(' XX');
    expect(code).not.toBe('XX');
  });

  it('treats codes differing only in whitespace as different, since only case folds', () => {
    expect(currencyCodeEquals(' XX', 'XX ')).toBe(false);
    expect(currencyCodeEquals(' xx', ' XX')).toBe(true);
  });
});

describe('equality is case-insensitive, reproducing the CFML eq operator', () => {
  // CFML parity [model/entity/Sku.cfc:L385]: the base-currency step of the cascade selects with
  // `thisCurrency.getCurrencyCode() eq this.setting('skuCurrency')` and CFML `eq` ignores case, so
  // a stored lower-case code matches an upper-case configured one.
  //
  // Each case pairs the helper's answer with the raw `===` answer on the same two operands.
  it('matches a lower-case code against an upper-case one where === does not', () => {
    const stored: string = 'abc';
    const configured: string = 'ABC';

    expect(currencyCodeEquals(stored, configured)).toBe(true);
    expect(stored === configured).toBe(false);
  });

  it('matches across arbitrary internal casing where === does not', () => {
    const lower: string = 'abc';
    const mixed: string = 'AbC';
    const upper: string = 'ABC';
    const otherMixed: string = 'aBc';

    expect(currencyCodeEquals(lower, mixed)).toBe(true);
    expect(lower === mixed).toBe(false);

    expect(currencyCodeEquals(upper, otherMixed)).toBe(true);
    expect(upper === otherMixed).toBe(false);
  });

  it('is reflexive, symmetric and transitive across the casings of one code', () => {
    expect(currencyCodeEquals('aBc', 'aBc')).toBe(true);

    expect(currencyCodeEquals('abc', 'ABC')).toBe(true);
    expect(currencyCodeEquals('ABC', 'abc')).toBe(true);

    expect(currencyCodeEquals('abc', 'AbC')).toBe(true);
    expect(currencyCodeEquals('AbC', 'ABC')).toBe(true);
    expect(currencyCodeEquals('abc', 'ABC')).toBe(true);
  });

  it('still separates genuinely different codes, whatever their casing', () => {
    expect(currencyCodeEquals(NEUTRAL_CODE, OTHER_NEUTRAL_CODE)).toBe(false);
    expect(currencyCodeEquals(NEUTRAL_CODE_LOWER, OTHER_NEUTRAL_CODE)).toBe(false);
    expect(currencyCodeEquals(NEUTRAL_CODE, OTHER_NEUTRAL_CODE.toLowerCase())).toBe(false);
  });

  it('folds the ASCII I/i pair without regard to the ambient locale', () => {
    // A locale-sensitive fold maps a dotless or dotted I differently in Turkish locales; the
    // shipped helper folds locale-independently.
    expect(currencyCodeEquals('AIX', 'aix')).toBe(true);
    expect(currencyCodeEquals('IXX', 'ixx')).toBe(true);
  });

  it('accepts a validated code and a raw setting-shaped string as operands', () => {
    // CFML parity [model/entity/Sku.cfc:L385]: one operand there is a code read from the database
    // and the other a raw setting value. Demanding a branded operand would force a throwing
    // construction into a comparison.
    const validated = toCurrencyCode(NEUTRAL_CODE);
    const rawSettingValue: string = NEUTRAL_CODE_LOWER;

    expect(currencyCodeEquals(validated, rawSettingValue)).toBe(true);
  });

  it('does not validate its operands, so equality never throws on a wrong length', () => {
    expect(() => currencyCodeEquals('XX', 'xx')).not.toThrow();
    expect(currencyCodeEquals('XX', 'xx')).toBe(true);
    expect(currencyCodeEquals('', '')).toBe(true);
  });
});

describe('a nullish operand refuses the comparison rather than answering it', () => {
  // CFML raises when a null reaches `eq`, so the delegated `cfEquals` raises and this function
  // raises with it. No legacy result is being discarded.
  //
  // Answering `false` for a nullish operand would relocate the harm rather than remove it.
  it('raises for two undefined operands where === would report them equal', () => {
    const storedCode: string | undefined = undefined;
    const configuredCode: string | undefined = undefined;

    expect(() => currencyCodeEquals(storedCode, configuredCode)).toThrow(CfmlComparisonError);
    expect(storedCode === configuredCode).toBe(true);
  });

  it('raises for two null operands where === would report them equal', () => {
    const storedCode: string | null = null;
    const configuredCode: string | null = null;

    expect(() => currencyCodeEquals(storedCode, configuredCode)).toThrow(CfmlComparisonError);
    expect(storedCode === configuredCode).toBe(true);
  });

  it('raises for a null against an undefined', () => {
    expect(() => currencyCodeEquals(null, undefined)).toThrow(CfmlComparisonError);
    expect(() => currencyCodeEquals(undefined, null)).toThrow(CfmlComparisonError);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('raises for %s on either side of a real code', (_label, absent) => {
    expect(() => currencyCodeEquals(absent, NEUTRAL_CODE)).toThrow(CfmlComparisonError);
    expect(() => currencyCodeEquals(NEUTRAL_CODE, absent)).toThrow(CfmlComparisonError);
  });

  // The raise is not swallowed or re-wrapped on the way through: the delegated error reaches the
  // caller intact, naming which operand was absent and reporting the survivor.
  it('propagates the delegated error intact, naming the absent operand', () => {
    expect(() => currencyCodeEquals(undefined, NEUTRAL_CODE)).toThrow(/operand "a"/);
    expect(() => currencyCodeEquals(NEUTRAL_CODE, undefined)).toThrow(/operand "b"/);
    expect(() => currencyCodeEquals(null, NEUTRAL_CODE)).toThrow(/received null as operand/);
    expect(() => currencyCodeEquals(undefined, NEUTRAL_CODE)).toThrow(
      /received undefined as operand/,
    );
    expect(() => currencyCodeEquals(undefined, NEUTRAL_CODE)).toThrow(
      new RegExp(`"${NEUTRAL_CODE}"`),
    );
  });

  // An empty string is not absent - it is an ordinary CFML string value - so it compares normally
  // and never raises.
  it('does not treat an empty string as absent - it compares, and never raises', () => {
    expect(() => currencyCodeEquals('', '')).not.toThrow();
    expect(currencyCodeEquals('', '')).toBe(true);
    expect(currencyCodeEquals('', NEUTRAL_CODE)).toBe(false);

    // Empty on one side, genuinely absent on the other: the absence still wins.
    expect(() => currencyCodeEquals('', undefined)).toThrow(CfmlComparisonError);
    expect(() => currencyCodeEquals('', null)).toThrow(CfmlComparisonError);
  });
});

// CFML parity [model/entity/Sku.cfc:L269-L273]: getPriceByCurrencyCode has one structKeyExists, no
// `else` branch and no fallback, so an unrecognised currency yields nothing.

describe('keyed lookup resolves the code case-insensitively', () => {
  // CFML parity [model/entity/Sku.cfc:L270, L276, L282]: the currency-details map is keyed by
  // currency code, and every legacy read of it is a `structKeyExists`-then-index pair on a
  // case-insensitive key.
  it('resolves whatever casing the caller asks with', () => {
    const priceDetails = { XXX: { price: '19.99' } };

    expect(getByCurrencyCode(priceDetails, 'XXX')).toEqual({ price: '19.99' });
    expect(getByCurrencyCode(priceDetails, 'xxx')).toEqual({ price: '19.99' });
    expect(getByCurrencyCode(priceDetails, 'xXx')).toEqual({ price: '19.99' });
  });

  it('resolves whatever casing the map was built with', () => {
    const priceDetails = { xxx: { price: '19.99' } };

    expect(getByCurrencyCode(priceDetails, 'XXX')).toEqual({ price: '19.99' });
  });

  it('resolves when the stored casing and the queried casing both differ', () => {
    const priceDetails = { xXx: { price: '19.99' } };

    expect(getByCurrencyCode(priceDetails, 'XxX')).toEqual({ price: '19.99' });
  });

  it('hands back the identical stored object, not a copy of it', () => {
    const storedEntry = { price: '19.99' };
    const priceDetails = { XXX: storedEntry };

    expect(getByCurrencyCode(priceDetails, 'xxx')).toBe(storedEntry);
  });

  it('accepts a validated branded code as the key, since it is assignable to string', () => {
    const priceDetails = { xxx: { price: '19.99' } };
    const code = toCurrencyCode(NEUTRAL_CODE);

    expect(getByCurrencyCode(priceDetails, code)).toEqual({ price: '19.99' });
  });

  // JUDGMENT CALL: the key parameter is a plain `string`, and this suite pins that rather than
  // wishing it were branded.
  it('answers a wrong-length key with undefined rather than throwing', () => {
    const priceDetails = { XXX: { price: '19.99' } };

    expect(() => getByCurrencyCode(priceDetails, 'XX')).not.toThrow();
    expect(getByCurrencyCode(priceDetails, 'XX')).toBeUndefined();
  });
});

describe('keyed lookup reports a miss as undefined and never stands in for it', () => {
  it('yields undefined for an unknown currency, and no stand-in value', () => {
    const priceDetails = { XXX: { price: '19.99' } };
    const missed = getByCurrencyCode(priceDetails, OTHER_NEUTRAL_CODE);

    expect(missed).toBeUndefined();
    expect(missed).not.toBe(0);
    expect(missed).not.toBe('');
    expect(missed).not.toBeNull();
    expect(missed).not.toEqual({});
  });

  it('yields undefined from a map holding no currencies at all', () => {
    // CFML parity [model/entity/Sku.cfc:L373]: when the eligibility setting resolves empty the
    // legacy memo stays `{}` and every accessor yields nothing.
    const emptyDetails: Readonly<Record<string, { price: string }>> = {};

    expect(getByCurrencyCode(emptyDetails, NEUTRAL_CODE)).toBeUndefined();
  });

  // The `defaultValue` slot is how a 0 reaches a price path - supplied at the one call site nobody
  // reviews closely, and a missing price quietly becomes a free product.
  it('declares exactly two parameters, so there is no default-value slot', () => {
    expect(getByCurrencyCode.length).toBe(2);
  });

  it('does not create the key it failed to find, so reading never writes', () => {
    const priceDetails: Record<string, { price: string }> = { XXX: { price: '19.99' } };

    expect(getByCurrencyCode(priceDetails, OTHER_NEUTRAL_CODE)).toBeUndefined();
    expect(Object.keys(priceDetails)).toEqual(['XXX']);
    expect(structKeyExists(priceDetails, OTHER_NEUTRAL_CODE)).toBe(false);
  });

  it('does not resolve an inherited property as though it were a stored key', () => {
    const priceDetails = { XXX: { price: '19.99' } };

    expect(getByCurrencyCode(priceDetails, 'toString')).toBeUndefined();
    expect(getByCurrencyCode(priceDetails, 'constructor')).toBeUndefined();
  });
});

describe('presence is not value, and this lookup answers only the value question', () => {
  // The distinction is reachable rather than academic.
  //
  // CFML parity [model/entity/Sku.cfc:L381-L382]: the cascade creates the OUTER entry for every
  // eligible currency UNCONDITIONALLY, while the inner price keys are written only under
  // `!isNull(...)` guards, so "the currency key exists" does not mean "a price exists".
  it('reports a key holding undefined as PRESENT while still reading it as undefined', () => {
    const priceDetails: Readonly<Record<string, string | undefined>> = { xxx: undefined };

    expect(structKeyExists(priceDetails, NEUTRAL_CODE)).toBe(true);
    expect(getByCurrencyCode(priceDetails, NEUTRAL_CODE)).toBeUndefined();
  });

  it('cannot distinguish an absent key from a present one holding undefined', () => {
    const withPresentUndefined: Readonly<Record<string, string | undefined>> = { xxx: undefined };
    const withoutTheKey: Readonly<Record<string, string | undefined>> = {};

    expect(getByCurrencyCode(withPresentUndefined, NEUTRAL_CODE)).toBeUndefined();
    expect(getByCurrencyCode(withoutTheKey, NEUTRAL_CODE)).toBeUndefined();

    // The presence oracle separates them, and is deliberately a different function rather than a
    // second return channel on this one.
    expect(structKeyExists(withPresentUndefined, NEUTRAL_CODE)).toBe(true);
    expect(structKeyExists(withoutTheKey, NEUTRAL_CODE)).toBe(false);
  });

  it('reads a present falsy entry back exactly, without treating it as absent', () => {
    const flags: Readonly<Record<string, string>> = { xxx: '' };

    expect(structKeyExists(flags, NEUTRAL_CODE)).toBe(true);
    expect(getByCurrencyCode(flags, NEUTRAL_CODE)).toBe('');
  });
});

// This is the property that keeps configuration out of the value object.

describe('validation is structural, so no register of real currencies is consulted', () => {
  // Were any table, set, enum or union of codes present, these three would be rejected. They are
  // accepted, which is the proof.
  it.each([
    ['a well-formed but unassigned code', 'ZZZ'],
    ['another unassigned code', 'QQQ'],
    ['a code reserved for testing purposes', 'XXX'],
  ])('accepts %s', (_label, value) => {
    expect(() => toCurrencyCode(value)).not.toThrow();
    expect(toCurrencyCode(value)).toBe(value);
    expect(isCurrencyCode(value)).toBe(true);
  });

  // JUDGMENT CALL: the character class is not constrained, and this suite asserts what the shipped
  // module implements rather than what a currency code "ought" to look like.
  it.each([
    ['digits mixed with a letter', '12A'],
    ['digits only', '123'],
    ['punctuation only', '---'],
    ['symbols only', '$$$'],
    ['a code containing a space', 'X X'],
    ['non-ASCII letters', '\u00C4\u00D6\u00DC'],
  ])('accepts %s, because only length is constrained', (_label, value) => {
    expect(() => toCurrencyCode(value)).not.toThrow();
    expect(toCurrencyCode(value)).toBe(value);
    expect(isCurrencyCode(value)).toBe(true);
  });
});

describe('the module surface is closed, and holds nothing it is prohibited from holding', () => {
  // One assertion, and the strongest available: if the export set is exactly these five names then
  // there is no currency table, no symbol map, no decimals-per-currency map, no `Currency` entity
  // model, no formatter.
  it('exports exactly five runtime members and nothing else', () => {
    expect(Object.keys(currencyCodeModule).sort()).toEqual([
      'InvalidCurrencyCodeError',
      'currencyCodeEquals',
      'getByCurrencyCode',
      'isCurrencyCode',
      'toCurrencyCode',
    ]);
  });

  // Every export being callable rules out an exported DATA structure - an ISO register array, a
  // `Set`, a `Map`, a record of symbols, a numeric length constant - and an exported brand symbol
  // with it.
  it('exports only callables, so no table, constant or marker symbol is reachable', () => {
    for (const [name, exported] of Object.entries(currencyCodeModule)) {
      expect(typeof exported, `export ${name} must be callable`).toBe('function');
    }

    // `Symbol.toStringTag` is carried by every ES module namespace object and is not authored by
    // the module, so it is named explicitly rather than filtered out. Any other symbol here would
    // be a runtime brand marker.
    expect(Object.getOwnPropertySymbols(currencyCodeModule)).toEqual([Symbol.toStringTag]);
  });

  // A name-shaped audit on top of the exact-set assertion above. Not redundant: it states the
  // intent, so adding a prohibited member later fails on a message naming the prohibition rather
  // than on a list diff.
  it('publishes no formatting, symbol, conversion, arithmetic or schema member', () => {
    const prohibited =
      /format|symbol|decimal|locale|intl|convert|rate|exchange|money|price|amount|schema|zod|table|register|list|all|iso|brand/i;
    const offending = Object.keys(currencyCodeModule).filter((name) => prohibited.test(name));

    expect(offending).toEqual([]);
  });

  // CFML parity [model/entity/PromotionApplied.cfc:L53, L55]: `discountAmount` is
  // `ormtype="big_decimal"` and `currencyCode` is ormtype="string" length="3" in separate columns.
  it('exposes no Money type and no monetary arithmetic of any kind', () => {
    const exportNames = Object.keys(currencyCodeModule);

    expect(exportNames).not.toContain('Money');
    expect(exportNames).not.toContain('toMoney');
    expect(exportNames.some((name) => /^(add|plus|minus|times|multiply|divide)$/i.test(name))).toBe(
      false,
    );
  });

  it('models no Currency entity, so no name or symbol accessor is reachable', () => {
    // `model/entity/Currency.cfc` is out of scope.
    const exportNames = Object.keys(currencyCodeModule);

    expect(exportNames).not.toContain('Currency');
    expect(exportNames).not.toContain('currencyName');
    expect(exportNames).not.toContain('currencySymbol');
    expect(exportNames).not.toContain('getCurrencySymbol');
  });

  it('is driven end to end with no environment, no clock and no locale input', () => {
    // Every export is synchronous and total over its inputs, so the whole surface is exercised in
    // one expression chain with nothing injected.
    const code = toCurrencyCode(NEUTRAL_CODE);
    const details = { [NEUTRAL_CODE_LOWER]: { price: '19.99' } };

    expect(isCurrencyCode(code)).toBe(true);
    expect(currencyCodeEquals(code, NEUTRAL_CODE_LOWER)).toBe(true);
    expect(getByCurrencyCode(details, code)).toEqual({ price: '19.99' });
    expect(() => toCurrencyCode('')).toThrow(InvalidCurrencyCodeError);
  });
});
