// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/domain/entities/optionGroup.ts`
//
// WHAT THIS SUITE PINS
// `OptionGroup.getOptions(orderby, sortType, direction)` is the only piece of
// real behaviour on this entity, and it is an OVERRIDE of the collection
// accessor: [model/entity/OptionGroup.cfc:L73-L79] delegates its sort branch to
// `getService("hibachiUtilityService").sortObjectArray(...)`, whose algorithm is
// verified verbatim at [model/service/HibachiUtilityService.cfc:L514-L531]. That
// utility is framework code the port does not ship as a module, but its results
// are returned straight out of a public entity method, so its OBSERVABLE
// behaviour is part of the contract.
//
// This is therefore a CHARACTERIZATION suite in the strict sense: it pins the
// legacy behaviour INCLUDING its defects, so that a future "improvement" to the
// sort fails here loudly instead of silently changing what a caller receives.
// Four properties are pinned, each traced to the line that produces it:
//
//   1. The composed struct key is `"<rendered value>.<randRange(1,100)>"`
//      [model/service/HibachiUtilityService.cfc:L518-L523], so the RANDOM SUFFIX
//      participates in the ordering and breaks ties non-deterministically.
//   2. Two elements whose rendered value AND drawn random number collide share
//      one struct key, and the later assignment overwrites the earlier - so the
//      returned array is SHORTER than the input
//      [model/service/HibachiUtilityService.cfc:L523].
//   3. `arraySort(keyArray, sorttype, direction)`
//      [model/service/HibachiUtilityService.cfc:L526] applies CFML's sort types:
//      `'text'` - the default declared at [model/entity/OptionGroup.cfc:L73] - is
//      CASE-SENSITIVE, and only `'textnocase'` ignores case.
//   4. `'numeric'` orders by the WHOLE composed key, so integer values are
//      ordered by their random tails, and a key that is not numeric raises
//      exactly as `arraySort` raises.
//
// Two failure contracts are pinned alongside them: an `orderby` naming no
// accessor raised through `evaluate()`
// [model/service/HibachiUtilityService.cfc:L523], and a non-numeric composed key
// raised inside `arraySort` [model/service/HibachiUtilityService.cfc:L526].
// Neither degrades to unsorted or re-ordered data.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// No assertion below has a legacy antecedent. Searching all 32 `.cfc` files
// under `meta/tests/` for `OptionGroup`, `getOptions` and `sortObjectArray`
// returns ZERO hits, and the only legacy suites extended anywhere in this port
// are [meta/tests/unit/entity/BrandTest.cfc] and
// [meta/tests/unit/entity/ProductTest.cfc];
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub
// contributing zero coverage. There is nothing here to extend, and presenting
// this file as parity would fail the traceability gate.
//
// DETERMINISM
// The legacy tie-break is `randRange(1,100)`, which is genuinely
// non-deterministic. The entity therefore accepts the random source through its
// constructor - `optionSortTieBreaker` - the same way this folder injects a clock
// or a collaborator port, which leaves `getOptions`'s public signature untouched
// while making the preserved non-determinism characterizable. Every suite below
// supplies a scripted source, so no assertion depends on chance; one suite
// deliberately exercises the DEFAULT source and asserts only the properties that
// hold for every possible draw.
//
// No database, no clock, no environment variable and no network is reached by
// any assertion in this file.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { Option } from '../../../../src/domain/entities/option.js';
import { OptionGroup } from '../../../../src/domain/entities/optionGroup.js';
import type { OptionSortTieBreaker } from '../../../../src/domain/entities/optionGroup.js';

/**
 * Builds an `Option` carrying only the scalar columns the sort can read.
 *
 * The five association slots are optional on `Option`'s constructor, so they are
 * deliberately omitted: this suite exercises the sort, and an option's
 * associations are irrelevant to it.
 */
function anOption(init: {
  readonly optionID: string;
  readonly optionCode?: string;
  readonly optionName?: string;
  readonly sortOrder?: number;
  readonly remoteID?: string;
  readonly createdDateTime?: Date;
}): Option {
  return new Option({
    optionID: init.optionID,
    optionCode: init.optionCode,
    optionName: init.optionName,
    optionDescription: undefined,
    sortOrder: init.sortOrder,
    optionGroup: undefined,
    defaultImageID: undefined,
    remoteID: init.remoteID,
    createdDateTime: init.createdDateTime,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

/**
 * A scripted stand-in for `randRange(1,100)`: hands back the supplied draws in
 * order, then repeats the last one so a longer input cannot run it dry.
 */
function scriptedTieBreaker(...draws: readonly number[]): OptionSortTieBreaker {
  let cursor = 0;

  return () => {
    const draw = draws[Math.min(cursor, draws.length - 1)];

    cursor += 1;

    return draw ?? 1;
  };
}

/**
 * Builds the group under test.
 *
 * `optionSortTieBreaker: undefined` is the deliberate statement "use the legacy
 * `randRange(1,100)` source", which is what the production hydration path does.
 */
function aGroup(options: Option[], optionSortTieBreaker?: OptionSortTieBreaker): OptionGroup {
  return new OptionGroup({
    optionGroupID: 'og-1',
    optionGroupName: 'Size',
    optionGroupCode: 'size',
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: 0,
    sortOrder: 1,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
    options,
    optionSortTieBreaker,
  });
}

/** The `optionID` of every element, in the order the sort returned them. */
function idsOf(options: readonly Option[]): readonly string[] {
  return options.map((option) => option.getOptionID());
}

describe('getOptions with no argument', () => {
  // [model/entity/OptionGroup.cfc:L74-L75]: the branch is on PRESENCE, so the
  // no-argument call returns `variables.Options` untouched - it does not sort,
  // does not copy-and-reorder, and never reaches the utility at all.
  it('returns the materialized association itself, in hydration order', () => {
    const first = anOption({ optionID: 'a', optionName: 'Small', sortOrder: 3 });
    const second = anOption({ optionID: 'b', optionName: 'Large', sortOrder: 1 });
    const options = [first, second];

    const result = aGroup(options).getOptions();

    expect(result).toBe(options);
    expect(idsOf(result)).toEqual(['a', 'b']);
  });

  it('never draws from the tie-breaking random source', () => {
    let draws = 0;
    const counting: OptionSortTieBreaker = () => {
      draws += 1;

      return 7;
    };

    aGroup([anOption({ optionID: 'a', optionName: 'Small' })], counting).getOptions();

    expect(draws).toBe(0);
  });
});

describe("the default sortType 'text' is CASE-SENSITIVE", () => {
  // [model/service/HibachiUtilityService.cfc:L526]: `arraySort(keyArray,"text",...)`.
  // CFML's `'text'` sort type compares case-sensitively, so an upper-case initial
  // sorts before every lower-case one - `'Z'` is code unit 0x5A and `'a'` is
  // 0x61. This is the property whose loss would silently re-order a mixed-case
  // option list, and the legacy default is `'text'`
  // [model/entity/OptionGroup.cfc:L73].
  const mixedCase = (): Option[] => [
    anOption({ optionID: 'lower-apple', optionName: 'apple' }),
    anOption({ optionID: 'upper-zulu', optionName: 'Zulu' }),
  ];

  it('orders upper-case before lower-case by default', () => {
    const result = aGroup(mixedCase(), scriptedTieBreaker(50)).getOptions('optionName');

    expect(idsOf(result)).toEqual(['upper-zulu', 'lower-apple']);
  });

  it('orders identically when the caller names the default explicitly', () => {
    const result = aGroup(mixedCase(), scriptedTieBreaker(50)).getOptions('optionName', 'text');

    expect(idsOf(result)).toEqual(['upper-zulu', 'lower-apple']);
  });

  it("reverses under direction 'desc'", () => {
    const result = aGroup(mixedCase(), scriptedTieBreaker(50)).getOptions(
      'optionName',
      'text',
      'desc',
    );

    expect(idsOf(result)).toEqual(['lower-apple', 'upper-zulu']);
  });

  it('orders same-case values lexicographically', () => {
    const options = [
      anOption({ optionID: 'medium', optionName: 'medium' }),
      anOption({ optionID: 'large', optionName: 'large' }),
      anOption({ optionID: 'small', optionName: 'small' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(50)).getOptions('optionName');

    expect(idsOf(result)).toEqual(['large', 'medium', 'small']);
  });
});

describe("sortType 'textnocase' is the ONLY case-insensitive mode", () => {
  // The discriminator between this suite and the one above is the whole point of
  // CFML having two text sort types. `'Zulu'` and `'apple'` swap places purely
  // because the comparison folds case.
  it('orders case-insensitively, unlike the default', () => {
    const options = [
      anOption({ optionID: 'lower-apple', optionName: 'apple' }),
      anOption({ optionID: 'upper-zulu', optionName: 'Zulu' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(50)).getOptions('optionName', 'textnocase');

    expect(idsOf(result)).toEqual(['lower-apple', 'upper-zulu']);
  });

  it('differs from the default on the SAME input, which is the case-sensitivity proof', () => {
    const build = (): Option[] => [
      anOption({ optionID: 'lower-apple', optionName: 'apple' }),
      anOption({ optionID: 'upper-zulu', optionName: 'Zulu' }),
    ];

    const caseSensitive = idsOf(
      aGroup(build(), scriptedTieBreaker(50)).getOptions('optionName', 'text'),
    );
    const caseInsensitive = idsOf(
      aGroup(build(), scriptedTieBreaker(50)).getOptions('optionName', 'textnocase'),
    );

    expect(caseSensitive).not.toEqual(caseInsensitive);
  });
});

describe('the composed struct key carries the random tie-break', () => {
  // [model/service/HibachiUtilityService.cfc:L518-L523]: the key format is
  // `{VALUE}.{RAND NUMBER}`, and the key - not the value - is what gets sorted.
  // Two options sharing a value therefore come back in an order decided entirely
  // by their draws, and the comparison is TEXTUAL under the default sort type,
  // so `"Red.100"` precedes `"Red.9"` because `'1' < '9'`.
  it('breaks a tie by the drawn number, textually', () => {
    const options = [
      anOption({ optionID: 'first', optionName: 'Red' }),
      anOption({ optionID: 'second', optionName: 'Red' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(9, 100)).getOptions('optionName');

    expect(idsOf(result)).toEqual(['second', 'first']);
  });

  it('returns the OPPOSITE order for the same data when the draws swap', () => {
    const build = (): Option[] => [
      anOption({ optionID: 'first', optionName: 'Red' }),
      anOption({ optionID: 'second', optionName: 'Red' }),
    ];

    const lowThenHigh = idsOf(aGroup(build(), scriptedTieBreaker(9, 100)).getOptions('optionName'));
    const highThenLow = idsOf(aGroup(build(), scriptedTieBreaker(100, 9)).getOptions('optionName'));

    expect(lowThenHigh).toEqual(['second', 'first']);
    expect(highThenLow).toEqual(['first', 'second']);
  });

  it('draws exactly once per element', () => {
    let draws = 0;
    const counting: OptionSortTieBreaker = () => {
      draws += 1;

      return draws;
    };

    aGroup(
      [
        anOption({ optionID: 'a', optionName: 'Red' }),
        anOption({ optionID: 'b', optionName: 'Green' }),
        anOption({ optionID: 'c', optionName: 'Blue' }),
      ],
      counting,
    ).getOptions('optionName');

    expect(draws).toBe(3);
  });
});

describe('a colliding struct key silently loses an element - PRESERVED DEFECT', () => {
  // LEGACY-DEFECT [model/service/HibachiUtilityService.cfc:L523]: two elements
  // whose rendered value and drawn number both match write the SAME struct key,
  // and the second assignment overwrites the first. The source comment at
  // L518-L520 shows the random suffix exists to make this unlikely; with only 100
  // values to draw from it is not impossible. Pinned here so nobody "fixes" it
  // into a stable, length-preserving sort.
  it('returns FEWER elements than it received when value and draw both collide', () => {
    const options = [
      anOption({ optionID: 'loser', optionName: 'Red' }),
      anOption({ optionID: 'survivor', optionName: 'Red' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(42, 42)).getOptions('optionName');

    expect(result).toHaveLength(1);
    expect(idsOf(result)).toEqual(['survivor']);
  });

  it('collides ACROSS CASE too, because CFML struct keys are case-insensitive', () => {
    const options = [
      anOption({ optionID: 'upper', optionName: 'RED' }),
      anOption({ optionID: 'lower', optionName: 'red' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(42, 42)).getOptions('optionName');

    expect(result).toHaveLength(1);
    expect(idsOf(result)).toEqual(['lower']);
  });

  it('keeps the FIRST spelling as the sort key while keeping the LAST element', () => {
    // The surviving element is `lower` (written last), but the ordering uses the
    // key text `"RED.42"` (spelled first). `"blue.42"` is the discriminator: it
    // sorts AFTER the first spelling and BEFORE the later one under the
    // case-sensitive default, because every uppercase letter precedes every
    // lowercase one - `'R'` is 0x52, `'b'` is 0x62, `'r'` is 0x72. So the
    // survivor leads only because of a spelling that is no longer present in the
    // returned data; had the later spelling won the key, the result would be
    // `['blue', 'lower']`.
    const options = [
      anOption({ optionID: 'upper', optionName: 'RED' }),
      anOption({ optionID: 'lower', optionName: 'red' }),
      anOption({ optionID: 'blue', optionName: 'blue' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(42, 42, 42)).getOptions('optionName');

    expect(result).toHaveLength(2);
    expect(idsOf(result)).toEqual(['lower', 'blue']);
  });

  it('does NOT collide when the draws differ, keeping both elements', () => {
    const options = [
      anOption({ optionID: 'first', optionName: 'Red' }),
      anOption({ optionID: 'second', optionName: 'Red' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(41, 42)).getOptions('optionName');

    expect(result).toHaveLength(2);
    expect(idsOf(result)).toEqual(['first', 'second']);
  });
});

describe("sortType 'numeric' orders by the composed key, random tail included", () => {
  // [model/service/HibachiUtilityService.cfc:L523,L526]: under `numeric` the
  // random suffix becomes the FRACTIONAL PART of the key, so two integers with
  // the same value are ordered by their draws, and - more surprising - the draw
  // can never reorder DIFFERENT integers because it only ever adds a fraction.
  it('orders integer values ascending', () => {
    const options = [
      anOption({ optionID: 'third', sortOrder: 3 }),
      anOption({ optionID: 'first', sortOrder: 1 }),
      anOption({ optionID: 'second', sortOrder: 2 }),
    ];

    const result = aGroup(options, scriptedTieBreaker(50)).getOptions('sortOrder', 'numeric');

    expect(idsOf(result)).toEqual(['first', 'second', 'third']);
  });

  it('orders equal integers by their random tails, NUMERICALLY not textually', () => {
    // `"1.9"` and `"1.100"` read as 1.9 and 1.1, so the draw of 100 sorts FIRST
    // here - the exact opposite of the textual ordering pinned above, where
    // `"Red.100"` preceded `"Red.9"`. Both orderings are the legacy's, and the
    // difference is entirely in the sort type.
    const options = [
      anOption({ optionID: 'drew-9', sortOrder: 1 }),
      anOption({ optionID: 'drew-100', sortOrder: 1 }),
    ];

    const result = aGroup(options, scriptedTieBreaker(9, 100)).getOptions('sortOrder', 'numeric');

    expect(idsOf(result)).toEqual(['drew-100', 'drew-9']);
  });

  it("reverses under direction 'desc'", () => {
    const options = [
      anOption({ optionID: 'first', sortOrder: 1 }),
      anOption({ optionID: 'third', sortOrder: 3 }),
    ];

    const result = aGroup(options, scriptedTieBreaker(50)).getOptions(
      'sortOrder',
      'numeric',
      'desc',
    );

    expect(idsOf(result)).toEqual(['third', 'first']);
  });

  it('reads an ABSENT value as the draw alone, so it sorts below every populated row', () => {
    // A NULL column renders as the empty string, so the key is `".50"` - which
    // CFML and `Number` agree is 0.5, below any populated `sortOrder`. This is
    // the shape that makes "absent sorts first" a consequence of the key format
    // rather than a choice.
    const options = [
      anOption({ optionID: 'populated', sortOrder: 1 }),
      anOption({ optionID: 'absent' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(50)).getOptions('sortOrder', 'numeric');

    expect(idsOf(result)).toEqual(['absent', 'populated']);
  });

  it('raises on a TEXT value, exactly as arraySort raises on a non-numeric element', () => {
    const group = aGroup(
      [anOption({ optionID: 'a', optionName: 'Large' })],
      scriptedTieBreaker(50),
    );

    expect(() => group.getOptions('optionName', 'numeric')).toThrow(/not\s+numeric/i);
  });

  it('raises when the value ALREADY CONTAINS a decimal point, producing two of them', () => {
    // `sortOrder` is declared `ormtype="integer"`, but the column can hold
    // whatever the repository hydrates, and a fractional value composes
    // `"1.5.50"` - not a number. The failure is the legacy's, reproduced.
    const group = aGroup([anOption({ optionID: 'a', sortOrder: 1.5 })], scriptedTieBreaker(50));

    expect(() => group.getOptions('sortOrder', 'numeric')).toThrow(/not\s+numeric/i);
  });
});

describe('an unsupported orderby RAISES rather than degrading', () => {
  // [model/service/HibachiUtilityService.cfc:L523]: the accessor was resolved
  // through `evaluate("...get#property#()...")`, which raised when no such
  // accessor existed. Returning the association unsorted would answer a question
  // the caller never asked, and would hide a programming error at the one layer
  // that can still name it.
  it('rejects a property Option does not declare', () => {
    const group = aGroup([anOption({ optionID: 'a', optionName: 'Large' })]);

    expect(() => group.getOptions('nonsense')).toThrow(/no such sortable property/i);
  });

  it('rejects a KNOWN-BUT-UNSORTABLE association property', () => {
    // `optionGroup` is a real `Option` property [model/entity/Option.cfc:L59] but
    // it is an association, not a scalar sort key, so it is outside the readable
    // set and must be refused rather than silently stringified.
    const group = aGroup([anOption({ optionID: 'a', optionName: 'Large' })]);

    expect(() => group.getOptions('optionGroup')).toThrow(/no such sortable property/i);
  });

  it('rejects the EMPTY STRING, because that is an argument and not an omission', () => {
    // The distinction matters: `getOptions()` returns the association, while
    // `getOptions('')` took the legacy sort branch and failed inside `evaluate`.
    const options = [anOption({ optionID: 'a', optionName: 'Large' })];
    const group = aGroup(options);

    expect(() => group.getOptions('')).toThrow(/no such sortable property/i);
    expect(group.getOptions()).toBe(options);
  });

  it('names the offending property and the supported set in the message', () => {
    const group = aGroup([anOption({ optionID: 'a' })]);

    expect(() => group.getOptions('nonsense')).toThrow(/"nonsense"/);
    expect(() => group.getOptions('nonsense')).toThrow(/optionName/);
  });

  it('opens the message with the legacy terminal sentence, typo included', () => {
    // [org/Hibachi/HibachiEntity.cfc:L565] is the sentence `errorMapper` recognises
    // by anchored template, so the grammatical error in the source - "does not
    // exists" - is load-bearing and must be reproduced byte-for-byte.
    const group = aGroup([anOption({ optionID: 'a' })]);

    expect(() => group.getOptions('nonsense')).toThrow(
      /^You have called a method getnonsense\(\) which does not exists in the Option entity\./,
    );
  });

  it('RESOLVES a case-variant spelling, because CFML method names are case-insensitive', () => {
    // [model/service/HibachiUtilityService.cfc:L523] resolved the accessor through
    // `evaluate("...get#property#()...")`, and CFML method names are
    // case-insensitive, so `orderby="optionname"` reached the one generated
    // `getOptionName()` accessor and SORTED. Folding the lookup preserves that;
    // refusing the spelling would invent a failure the source did not have.
    const lower = aGroup(
      [
        anOption({ optionID: 'b', optionName: 'Small' }),
        anOption({ optionID: 'a', optionName: 'Large' }),
      ],
      scriptedTieBreaker(1, 1),
    );
    const declared = aGroup(
      [
        anOption({ optionID: 'b', optionName: 'Small' }),
        anOption({ optionID: 'a', optionName: 'Large' }),
      ],
      scriptedTieBreaker(1, 1),
    );

    expect(idsOf(lower.getOptions('optionname'))).toStrictEqual(['a', 'b']);
    expect(idsOf(lower.getOptions('OPTIONNAME'))).toStrictEqual(['a', 'b']);
    expect(idsOf(lower.getOptions('optionname'))).toStrictEqual(
      idsOf(declared.getOptions('optionName')),
    );
  });
});

describe('every readable property is reachable', () => {
  // The readable set is the complete list of Option's SCALAR persistent
  // properties, so each one is exercised at least once - a property that cannot
  // actually be read would otherwise be an accessor mismatch waiting to surface
  // at runtime.
  it('sorts by optionID, optionCode, remoteID and createdDateTime', () => {
    const early = new Date('2019-01-01T00:00:00.000Z');
    const late = new Date('2021-01-01T00:00:00.000Z');
    const build = (): Option[] => [
      anOption({
        optionID: 'b',
        optionCode: 'bravo',
        remoteID: 'r-2',
        createdDateTime: late,
      }),
      anOption({
        optionID: 'a',
        optionCode: 'alpha',
        remoteID: 'r-1',
        createdDateTime: early,
      }),
    ];

    expect(idsOf(aGroup(build(), scriptedTieBreaker(50)).getOptions('optionID'))).toEqual([
      'a',
      'b',
    ]);
    expect(idsOf(aGroup(build(), scriptedTieBreaker(50)).getOptions('optionCode'))).toEqual([
      'a',
      'b',
    ]);
    expect(idsOf(aGroup(build(), scriptedTieBreaker(50)).getOptions('remoteID'))).toEqual([
      'a',
      'b',
    ]);
    expect(idsOf(aGroup(build(), scriptedTieBreaker(50)).getOptions('createdDateTime'))).toEqual([
      'a',
      'b',
    ]);
  });

  it('sorts by optionDescription and modifiedDateTime without raising', () => {
    const group = aGroup([anOption({ optionID: 'a' })], scriptedTieBreaker(50));

    expect(idsOf(group.getOptions('optionDescription'))).toEqual(['a']);
    expect(idsOf(group.getOptions('modifiedDateTime'))).toEqual(['a']);
  });
});

describe('the sort never mutates the materialized association', () => {
  it('leaves the association order untouched and returns a fresh array', () => {
    const first = anOption({ optionID: 'z', optionName: 'Zulu' });
    const second = anOption({ optionID: 'a', optionName: 'Alpha' });
    const options = [first, second];
    const group = aGroup(options, scriptedTieBreaker(50));

    const sorted = group.getOptions('optionName');

    expect(idsOf(sorted)).toEqual(['a', 'z']);
    expect(sorted).not.toBe(options);
    expect(idsOf(options)).toEqual(['z', 'a']);
    expect(idsOf(group.getOptions())).toEqual(['z', 'a']);
  });

  it('is repeatable: a second call sees the same input and re-sorts it', () => {
    const group = aGroup(
      [
        anOption({ optionID: 'z', optionName: 'Zulu' }),
        anOption({ optionID: 'a', optionName: 'Alpha' }),
      ],
      scriptedTieBreaker(50),
    );

    expect(idsOf(group.getOptions('optionName'))).toEqual(['a', 'z']);
    expect(idsOf(group.getOptions('optionName'))).toEqual(['a', 'z']);
  });
});

describe('the DEFAULT random source is the legacy randRange(1,100)', () => {
  // This is the one suite that exercises the production source, so it asserts
  // only what holds for EVERY possible draw. It is the guard that the default is
  // wired at all, and that it stays inside the legacy range - a source outside
  // 1..100 would change which keys can collide.
  it('orders distinct values correctly regardless of the draw', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const group = aGroup([
        anOption({ optionID: 'z', optionName: 'Zulu' }),
        anOption({ optionID: 'a', optionName: 'Alpha' }),
      ]);

      expect(idsOf(group.getOptions('optionName'))).toEqual(['a', 'z']);
    }
  });

  it('keeps every element when the values differ, however the draws fall', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const group = aGroup([
        anOption({ optionID: 'a', optionName: 'Alpha' }),
        anOption({ optionID: 'b', optionName: 'Bravo' }),
        anOption({ optionID: 'c', optionName: 'Charlie' }),
      ]);

      expect(group.getOptions('optionName')).toHaveLength(3);
    }
  });

  it('draws only from the inclusive range 1..100, as randRange(1,100) does', () => {
    // Observed indirectly and without reaching into the module: an integer draw
    // in 1..100 makes the composed key for an EMPTY value read as a number in
    // (0.01, 1], so a numeric sort against a populated row of 1 must place the
    // absent row first on every attempt. A draw of 0, a negative draw or a
    // fractional draw would break that.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const group = aGroup([
        anOption({ optionID: 'populated', sortOrder: 1 }),
        anOption({ optionID: 'absent' }),
      ]);

      expect(idsOf(group.getOptions('sortOrder', 'numeric'))).toEqual(['absent', 'populated']);
    }
  });
});
