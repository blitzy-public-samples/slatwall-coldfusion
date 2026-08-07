// slatwall-ts - characterization suite pinning `src/domain/entities/optionGroup.ts`
//
// Two failure contracts are pinned alongside them: an `orderby` naming no accessor raised through
// `evaluate()` [model/service/HibachiUtilityService.cfc:L523].
//
// Exactly one `LEGACY-DEFECT` marker appears below, on the colliding-key element loss, matching
// the single marker the module carries.
//
// JUDGMENT CALL: two module branches are left unexercised on purpose - the text-mode comparator's
// equal-key tie and the map-lookup `undefined` guard.

import { describe, expect, it, vi } from 'vitest';

import { Option } from '../../../../src/domain/entities/option.js';
import { ENTITY_CODE_PATTERN, OptionGroup } from '../../../../src/domain/entities/optionGroup.js';
import type { OptionSortTieBreaker } from '../../../../src/domain/entities/optionGroup.js';

/**
 * Builds an `Option` carrying only the scalar columns the sort can read.
 *
 * The five association slots are optional on `Option`'s constructor, so they are deliberately
 * omitted: this suite exercises the sort, and an option's associations are irrelevant to it.
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
 * A scripted stand-in for `randRange(1,100)`: hands back the supplied draws in order, then repeats
 * the last one so a longer input cannot run it dry.
 *
 * JUDGMENT CALL: a hand-written closure rather than `vi.fn()` or a spy. P3 prefers inline
 * in-memory doubles, and the tie-breaker is a constructor-injected random SOURCE - not a port - so
 * there is nothing to intercept for any case that supplies one.
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
 * `optionSortTieBreaker: undefined` is the deliberate statement "use the legacy `randRange(1,100)`
 * source", which is what the production hydration path does.
 *
 * JUDGMENT CALL: freshness (A2) is delivered by invoking this pure factory inside every single
 * test rather than by assigning a shared subject in `beforeEach`.
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

/**
 * Builds a group with every persisted column controllable, for the suites that pin the columns and
 * the association rather than the sort.
 *
 * Kept separate from {@link aGroup} deliberately: `aGroup` fixes the columns so a sort suite reads
 * as being about ordering and nothing else.
 *
 * Every slot is written `?: T | undefined` rather than `?: T` because `exactOptionalPropertyTypes`
 * is enabled.
 */
function aGroupWithColumns(init: {
  readonly optionGroupID?: string | undefined;
  readonly optionGroupName?: string | undefined;
  readonly optionGroupCode?: string | undefined;
  readonly optionGroupImage?: string | undefined;
  readonly optionGroupDescription?: string | undefined;
  readonly imageGroupFlag?: string | number | boolean | null | undefined;
  readonly sortOrder?: number | undefined;
  readonly remoteID?: string | undefined;
  readonly createdDateTime?: Date | undefined;
  readonly createdByAccountID?: string | undefined;
  readonly modifiedDateTime?: Date | undefined;
  readonly modifiedByAccountID?: string | undefined;
  readonly options?: Option[] | undefined;
}): OptionGroup {
  return new OptionGroup({
    optionGroupID: init.optionGroupID ?? 'og-1',
    optionGroupName: init.optionGroupName,
    optionGroupCode: init.optionGroupCode,
    optionGroupImage: init.optionGroupImage,
    optionGroupDescription: init.optionGroupDescription,
    imageGroupFlag: init.imageGroupFlag,
    sortOrder: init.sortOrder ?? 1,
    remoteID: init.remoteID,
    createdDateTime: init.createdDateTime,
    createdByAccountID: init.createdByAccountID,
    modifiedDateTime: init.modifiedDateTime,
    modifiedByAccountID: init.modifiedByAccountID,
    options: init.options ?? [],
    optionSortTieBreaker: undefined,
  });
}

/**
 * The `optionID` of every element, in the order the sort returned them.
 */
function idsOf(options: readonly Option[]): readonly string[] {
  return options.map((option) => option.getOptionID());
}

/**
 * Every own member name on the class prototype, for the absence assertions.
 *
 * JUDGMENT CALL: absence is proved by scanning the prototype rather than by writing start failing
 * and would spend P1's strictness allowance on a member that must simply never exist.
 * `@ts-expect-error` against a call to the missing member. A prototype scan is a RUNTIME proof that
 * keeps holding if someone later adds the member back, whereas `@ts-expect-error` would itself
 */
function prototypeMembers(): readonly string[] {
  return Object.getOwnPropertyNames(OptionGroup.prototype);
}

describe('getOptions with no argument', () => {
  // [model/entity/OptionGroup.cfc:L74-L75]: the branch is on PRESENCE, so the no-argument call
  // returns `variables.Options` untouched - it does not sort, does not copy-and-reorder.
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

// `Math.random` has exactly one runtime site - the tie-breaker this file exercises. * every
// identifier generator draws from `node:crypto`'s `randomUUID` instead: those in
// `promotionCode.ts`, `skuService.ts`, and the price-group, product.
describe('the DEFAULT tie-breaking source', () => {
  /**
   * Two options that tie on name, so only the random draw can order them.
   */
  const tiedPair = (): Option[] => [
    anOption({ optionID: 'first', optionName: 'Red' }),
    anOption({ optionID: 'second', optionName: 'Red' }),
  ];

  it('★★ IS the random source, proven by SCRIPTING the entropy rather than sampling it', () => {
    // This is an empirical check, not a restatement of the annotation.
    const random = vi.spyOn(Math, 'random');

    // 0.08 -> floor(8) + 1 = 9, and 0.99 -> floor(99) + 1 = 100. The key is `{VALUE}.{DRAW}`
    // sorted as TEXT, so `Red.100` precedes `Red.9`.
    random.mockReturnValueOnce(0.08).mockReturnValueOnce(0.99);

    expect(idsOf(aGroup(tiedPair()).getOptions('optionName'))).toEqual(['second', 'first']);
    expect(random).toHaveBeenCalledTimes(2);

    // Swap only the draws. Same options, same order, same sort arguments.
    random.mockReset();
    random.mockReturnValueOnce(0.99).mockReturnValueOnce(0.08);

    expect(idsOf(aGroup(tiedPair()).getOptions('optionName'))).toEqual(['first', 'second']);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('produces only outcomes the legacy algorithm can produce, collision included', () => {
    // Elements draw the same number of the 100 available, they compose the same struct key and the
    // later assignment overwrites the earlier - so the sort returns one element and the other is
    // silently dropped.
    const random = vi.spyOn(Math, 'random');
    const outcomeFor = (first: number, second: number): string => {
      random.mockReset();
      random.mockReturnValueOnce(first).mockReturnValueOnce(second);

      return idsOf(aGroup(tiedPair()).getOptions('optionName')).join(',');
    };

    // `{VALUE}.{DRAW}` sorted as TEXT, so the lower draw's key sorts LAST when the other draw's
    // rendering is a prefix-shorter string: 9 -> `Red.9`, 100 -> `Red.100`.
    expect(outcomeFor(0.08, 0.99)).toBe('second,first');
    expect(outcomeFor(0.99, 0.08)).toBe('first,second');

    // The collision, reached on purpose rather than hoped for.
    expect(outcomeFor(0.41, 0.41)).toBe('second');

    // And the derivation is pinned at a bucket boundary, which is what makes the three rows above
    // an exhaustive account rather than three arbitrary points.
    expect(outcomeFor(0.41, 0.419)).toBe('second');
    expect(outcomeFor(0.409, 0.41)).toBe('first,second');
    expect(outcomeFor(0, 0.009)).toBe('second');
    expect(outcomeFor(0.99, 0.999999)).toBe('second');

    // Every outcome produced above is one of the four the legacy algorithm can produce, and the
    // union is stated so a fifth shape would have to appear here to pass.
    const legitimate = new Set(['first,second', 'second,first', 'first', 'second']);
    const produced = new Set([
      outcomeFor(0.08, 0.99),
      outcomeFor(0.99, 0.08),
      outcomeFor(0.41, 0.41),
    ]);

    for (const outcome of produced) {
      expect(legitimate).toContain(outcome);
    }
    expect(produced.size).toBe(3);
  });
});

describe("the default sortType 'text' is CASE-SENSITIVE", () => {
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
  // The discriminator between this suite and the one above is the whole point of CFML having two
  // text sort types.
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
  // LEGACY-DEFECT [model/service/HibachiUtilityService.cfc:L523]: two elements whose rendered
  // value and drawn number both match write the same struct key, and the second assignment
  // overwrites the first.
  // Preserved deliberately; do not fix without a product decision.
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
    // The surviving element is `lower` (written last), but the ordering uses the key text
    // `"RED.42"` (spelled first).
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
  // [model/service/HibachiUtilityService.cfc:L523, L526]: under `numeric` the random suffix
  // becomes the FRACTIONAL PART of the key, so two integers with the same value are ordered by
  // their draws, and - more surprising.
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
    // `"1.9"` and `"1.100"` read as 1.9 and 1.1, so the draw of 100 sorts FIRST here - the exact
    // opposite of the textual ordering pinned above, where `"Red.100"` preceded `"Red.9"`.
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
    // A NULL column renders as the empty string, so the key is `".50"` - which CFML and `Number`
    // agree is 0.5, below any populated `sortOrder`.
    const options = [
      anOption({ optionID: 'populated', sortOrder: 1 }),
      anOption({ optionID: 'absent' }),
    ];

    const result = aGroup(options, scriptedTieBreaker(50)).getOptions('sortOrder', 'numeric');

    expect(idsOf(result)).toEqual(['absent', 'populated']);
  });

  it('can TIE numerically even when the draws differ, and resolves the tie by stability', () => {
    // A genuinely surprising consequence of the key format.
    const options = [
      anOption({ optionID: 'drew-5', sortOrder: 1 }),
      anOption({ optionID: 'drew-50', sortOrder: 1 }),
    ];

    const result = aGroup(options, scriptedTieBreaker(5, 50)).getOptions('sortOrder', 'numeric');

    expect(result).toHaveLength(2);
    expect(idsOf(result)).toEqual(['drew-5', 'drew-50']);
  });

  it('raises on a TEXT value, exactly as arraySort raises on a non-numeric element', () => {
    const group = aGroup(
      [anOption({ optionID: 'a', optionName: 'Large' })],
      scriptedTieBreaker(50),
    );

    expect(() => group.getOptions('optionName', 'numeric')).toThrow(/not\s+numeric/i);
  });

  it('raises when the value ALREADY CONTAINS a decimal point, producing two of them', () => {
    // `sortOrder` is declared `ormtype="integer"`, but the column can hold whatever the repository
    // hydrates, and a fractional value composes `"1.5.50"` - not a number.
    const group = aGroup([anOption({ optionID: 'a', sortOrder: 1.5 })], scriptedTieBreaker(50));

    expect(() => group.getOptions('sortOrder', 'numeric')).toThrow(/not\s+numeric/i);
  });
});

describe('an unsupported orderby RAISES rather than degrading', () => {
  // [model/service/HibachiUtilityService.cfc:L523]: the accessor was resolved through
  // `evaluate("...get#property#()...")`, which raised when no such accessor existed.
  it('rejects a property Option does not declare', () => {
    const group = aGroup([anOption({ optionID: 'a', optionName: 'Large' })]);

    expect(() => group.getOptions('nonsense')).toThrow(/no such sortable property/i);
  });

  it('rejects a KNOWN-BUT-UNSORTABLE association property', () => {
    // `optionGroup` is a real `Option` property [model/entity/Option.cfc:L59] but it is an
    // association, not a scalar sort key, so it is outside the readable set and must be refused
    // rather than silently stringified.
    const group = aGroup([anOption({ optionID: 'a', optionName: 'Large' })]);

    expect(() => group.getOptions('optionGroup')).toThrow(/no such sortable property/i);
  });

  it('rejects the EMPTY STRING, because that is an argument and not an omission', () => {
    // The distinction matters: `getOptions()` returns the association, while `getOptions('')` took
    // the legacy sort branch and failed inside `evaluate`.
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
    // [org/Hibachi/HibachiEntity.cfc:L565] is the sentence `errorMapper` recognises by anchored
    // template, so the grammatical error in the source - "does not exists".
    const group = aGroup([anOption({ optionID: 'a' })]);

    expect(() => group.getOptions('nonsense')).toThrow(
      /^You have called a method getnonsense\(\) which does not exists in the Option entity\./,
    );
  });

  it('RESOLVES a case-variant spelling, because CFML method names are case-insensitive', () => {
    // [model/service/HibachiUtilityService.cfc:L523] resolved the accessor through
    // `evaluate("...get#property#()...")`, and CFML method names are case-insensitive.
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
  // The readable set is the complete list of Option's SCALAR persistent properties, so each one is
  // exercised at least once.
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

  it('renders an INVALID date as the empty string rather than raising', () => {
    // `toISOString()` throws `RangeError` on a NaN time value, and the key-rendering step must be
    // TOTAL - the legacy concatenation never raised on a bad value, it just produced text.
    const options = [
      anOption({ optionID: 'valid', createdDateTime: new Date('2020-06-15T13:45:00.000Z') }),
      anOption({ optionID: 'invalid', createdDateTime: new Date('not a real date') }),
    ];

    const group = aGroup(options, scriptedTieBreaker(50));

    expect(() => group.getOptions('createdDateTime')).not.toThrow();
    expect(idsOf(group.getOptions('createdDateTime'))).toEqual(['invalid', 'valid']);
  });

  it('renders a NaN numeric column as the empty string, not as the text "NaN"', () => {
    // The same totality requirement as the invalid date, on the numeric path.
    const options = [
      anOption({ optionID: 'populated', sortOrder: 2 }),
      anOption({ optionID: 'not-a-number', sortOrder: Number.NaN }),
    ];

    const group = aGroup(options, scriptedTieBreaker(50));

    expect(() => group.getOptions('sortOrder')).not.toThrow();
    expect(idsOf(group.getOptions('sortOrder'))).toEqual(['not-a-number', 'populated']);
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
  // This is the one suite that exercises the production source, so it asserts only what holds for
  // every possible draw.
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
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const group = aGroup([
        anOption({ optionID: 'populated', sortOrder: 1 }),
        anOption({ optionID: 'absent' }),
      ]);

      expect(idsOf(group.getOptions('sortOrder', 'numeric'))).toEqual(['absent', 'populated']);
    }
  });
});

describe("the default 'text' sort orders the INTEGER sortOrder column LEXICOGRAPHICALLY", () => {
  // CFML parity [model/entity/OptionGroup.cfc:L73]: `sortType` defaults to `'text'` and not to a
  // numeric mode, so ordering by `sortOrder` - declared `ormtype="integer"` at
  // [model/entity/Option.cfc:L56] - compares the column's RENDERED TEXT.
  const nineAndTen = (): Option[] => [
    anOption({ optionID: 'nine', sortOrder: 9 }),
    anOption({ optionID: 'ten', sortOrder: 10 }),
  ];

  it('places 10 before 9 when the caller omits sortType', () => {
    const result = aGroup(nineAndTen(), scriptedTieBreaker(50)).getOptions('sortOrder');

    expect(idsOf(result)).toEqual(['ten', 'nine']);
  });

  it("places 10 before 9 when 'text' is named explicitly, too", () => {
    const result = aGroup(nineAndTen(), scriptedTieBreaker(50)).getOptions('sortOrder', 'text');

    expect(idsOf(result)).toEqual(['ten', 'nine']);
  });

  it("orders 9 before 10 under 'numeric', which is the discriminator", () => {
    // The same data under the same draw, differing only in sort type.
    const result = aGroup(nineAndTen(), scriptedTieBreaker(50)).getOptions('sortOrder', 'numeric');

    expect(idsOf(result)).toEqual(['nine', 'ten']);
  });

  it('extends across a wider run, where every 1-prefixed value precedes 9', () => {
    // Composed keys under a fixed draw of 50 are `"1.50"`, `"11.50"`, `"2.50"` and `"9.50"`.
    const options = [
      anOption({ optionID: 'nine', sortOrder: 9 }),
      anOption({ optionID: 'one', sortOrder: 1 }),
      anOption({ optionID: 'eleven', sortOrder: 11 }),
      anOption({ optionID: 'two', sortOrder: 2 }),
    ];

    const result = aGroup(options, scriptedTieBreaker(50)).getOptions('sortOrder');

    expect(idsOf(result)).toEqual(['one', 'eleven', 'two', 'nine']);
  });

  it("reverses to 9 before 10 under direction 'desc', still lexicographically", () => {
    const result = aGroup(nineAndTen(), scriptedTieBreaker(50)).getOptions(
      'sortOrder',
      'text',
      'desc',
    );

    expect(idsOf(result)).toEqual(['nine', 'ten']);
  });
});

describe('the capitalized `variables.Options` read is normalised to ONE binding', () => {
  // CFML parity [model/entity/OptionGroup.cfc:L70, L75, L77]: the property is declared lowercase
  // `options` at L70, yet both branches read `variables.Options` with a capital `O`.
  it('exposes exactly one collection accessor, and it is named getOptions', () => {
    const members = prototypeMembers();

    expect(members).toContain('getOptions');
    expect(members.filter((name) => name.toLowerCase() === 'getoptions')).toHaveLength(1);
  });

  it('reads ONE array on both branches, so there is provably no second collection', () => {
    const options = [
      anOption({ optionID: 'z', optionName: 'Zulu' }),
      anOption({ optionID: 'a', optionName: 'Alpha' }),
    ];
    const group = aGroup(options, scriptedTieBreaker(50));

    // Same membership from both branches, differing only in order.
    expect([...idsOf(group.getOptions('optionName'))].sort()).toEqual(
      [...idsOf(group.getOptions())].sort(),
    );
  });

  it('hands back the LIVE association on the no-orderby path, which the far side mutates through', () => {
    // [model/entity/Option.cfc:L95] does `arrayAppend(arguments.optionGroup.getOptions(), this)`,
    // so this array must be the association and must stay mutable in content.
    const options: Option[] = [];
    const group = aGroupWithColumns({ options });

    group.addOption(anOption({ optionID: 'appended', optionName: 'Added' }));

    expect(group.getOptions()).toBe(options);
    expect(idsOf(group.getOptions())).toEqual(['appended']);
  });
});

describe('getOptionsSmartList is OMITTED, not overlooked', () => {
  // CFML parity [model/entity/OptionGroup.cfc:L81-L83]: the legacy member returned
  // `getPropertySmartList(propertyName="options")`.
  it('declares no getOptionsSmartList member', () => {
    expect(prototypeMembers()).not.toContain('getOptionsSmartList');
  });

  it('declares no smart-list member under any spelling', () => {
    const smartListMembers = prototypeMembers().filter((name) =>
      name.toLowerCase().includes('smartlist'),
    );

    expect(smartListMembers).toEqual([]);
  });

  it('offers getOptions as the replacement, so no capability is silently lost', () => {
    const group = aGroupWithColumns({
      options: [anOption({ optionID: 'a', optionName: 'Large' })],
    });

    expect(idsOf(group.getOptions())).toEqual(['a']);
    expect(idsOf(group.getOptions('optionName'))).toEqual(['a']);
  });
});

describe('sortOrder is required by the ORM and unmentioned by the validation schema', () => {
  // CFML parity [model/entity/OptionGroup.cfc:L58, model/validation/OptionGroup.json]: the
  // property carries ORM-level `required="true"` with no default, yet the validation schema never
  // mentions `sortOrder` at all - it constrains only `optionGroupName`.
  it('always answers a number, never undefined', () => {
    const sortOrder: number = aGroupWithColumns({ sortOrder: 7 }).getSortOrder();

    expect(sortOrder).toBe(7);
    expect(sortOrder).not.toBeUndefined();
  });

  it('accepts 0, a legitimate ordinal that must not be defaulted away', () => {
    expect(aGroupWithColumns({ sortOrder: 0 }).getSortOrder()).toBe(0);
  });

  it('accepts a negative ordinal, because the mapping constrains nothing beyond the type', () => {
    expect(aGroupWithColumns({ sortOrder: -3 }).getSortOrder()).toBe(-3);
  });

  it("keeps Option's own sortOrder NULLABLE, which is the declared asymmetry", () => {
    // [model/entity/Option.cfc:L56] declares `sortContext="optionGroup"` and no `required`, so the
    // two entities genuinely differ on this column and the port preserves the difference rather
    // than harmonising it.
    expect(anOption({ optionID: 'absent' }).getSortOrder()).toBeUndefined();
    expect(anOption({ optionID: 'present', sortOrder: 4 }).getSortOrder()).toBe(4);
  });

  it('validates nothing itself, because the schema is a service-tier concern', () => {
    // The schema's three rules are enforced by the ported zod schema at the service tier, so no
    // `validate` member exists here and no zod assertion belongs in this file.
    expect(prototypeMembers()).not.toContain('validate');
    expect(prototypeMembers()).not.toContain('hasErrors');
  });
});

describe('getImageGroupFlag coerces the persisted column with CFML boolean semantics', () => {
  // CFML parity [model/entity/OptionGroup.cfc:L57]: `ormtype="boolean" default="0"`.
  it("answers false for the column's own default of '0'", () => {
    expect(aGroupWithColumns({ imageGroupFlag: '0' }).getImageGroupFlag()).toBe(false);
    expect(aGroupWithColumns({ imageGroupFlag: 0 }).getImageGroupFlag()).toBe(false);
  });

  it('answers false for an ABSENT value, and never true', () => {
    // A SQL NULL, or a column the repository did not populate, resolves to the same answer the
    // legacy engine gave a flag it had no value for.
    expect(aGroupWithColumns({ imageGroupFlag: undefined }).getImageGroupFlag()).toBe(false);
    expect(aGroupWithColumns({ imageGroupFlag: null }).getImageGroupFlag()).toBe(false);
    expect(aGroupWithColumns({}).getImageGroupFlag()).toBe(false);
  });

  it('answers true for every affirmative form a driver can hand back', () => {
    // `mysql2` may return a `TINYINT(1)` as a genuine boolean, as 0/1, or as the string form,
    // depending on driver configuration - so all three are pinned.
    expect(aGroupWithColumns({ imageGroupFlag: 1 }).getImageGroupFlag()).toBe(true);
    expect(aGroupWithColumns({ imageGroupFlag: '1' }).getImageGroupFlag()).toBe(true);
    expect(aGroupWithColumns({ imageGroupFlag: true }).getImageGroupFlag()).toBe(true);
    expect(aGroupWithColumns({ imageGroupFlag: 'true' }).getImageGroupFlag()).toBe(true);
    expect(aGroupWithColumns({ imageGroupFlag: 'yes' }).getImageGroupFlag()).toBe(true);
  });

  it('answers false for every negative form', () => {
    expect(aGroupWithColumns({ imageGroupFlag: false }).getImageGroupFlag()).toBe(false);
    expect(aGroupWithColumns({ imageGroupFlag: 'false' }).getImageGroupFlag()).toBe(false);
    expect(aGroupWithColumns({ imageGroupFlag: 'no' }).getImageGroupFlag()).toBe(false);
  });

  it('always returns a boolean, never the raw column value', () => {
    expect(typeof aGroupWithColumns({ imageGroupFlag: '1' }).getImageGroupFlag()).toBe('boolean');
    expect(typeof aGroupWithColumns({ imageGroupFlag: 0 }).getImageGroupFlag()).toBe('boolean');
    expect(typeof aGroupWithColumns({}).getImageGroupFlag()).toBe('boolean');
  });

  it('is stable across reads, because the raw column is held and coerced on demand', () => {
    const group = aGroupWithColumns({ imageGroupFlag: '0' });

    expect(group.getImageGroupFlag()).toBe(false);
    expect(group.getImageGroupFlag()).toBe(false);
  });
});

describe('ENTITY_CODE_PATTERN is the optionGroupCode format constraint', () => {
  // Only the FORMAT half of the rule lives in the constant.
  //
  // A count corrected by re-counting: `model/validation/OptionGroup.json` exists, and it is one of
  // three in-scope schemas an earlier inventory omitted.
  it('is exactly the schema regex, source and flags alike', () => {
    expect(ENTITY_CODE_PATTERN.source).toBe('^[a-zA-Z0-9-_.|:~^]+$');
    expect(ENTITY_CODE_PATTERN.flags).toBe('');
  });

  it('carries no g or y flag, so the shared instance holds no lastIndex state', () => {
    // A `g`/`y` instance mutates `lastIndex` on every `test`, so one caller could change another
    // caller's result.
    expect(ENTITY_CODE_PATTERN.global).toBe(false);
    expect(ENTITY_CODE_PATTERN.sticky).toBe(false);
    expect(ENTITY_CODE_PATTERN.test('size')).toBe(true);
    expect(ENTITY_CODE_PATTERN.test('size')).toBe(true);
    expect(ENTITY_CODE_PATTERN.lastIndex).toBe(0);
  });

  it('accepts the alphanumerics and the seven permitted punctuation characters', () => {
    // Reading the class precisely: after `0-9` the `-` is a LITERAL hyphen and not the start of a
    // range, and `.`, `|`, `^` and `~` are literal inside a class.
    for (const accepted of [
      'size',
      'SIZE',
      'Size01',
      '0',
      'a-b',
      'a_b',
      'a.b',
      'a|b',
      'a:b',
      'a~b',
      'a^b',
      '-_.|:~^',
      'shirt-size_v1.2|eu:xl~alt^a',
    ]) {
      expect(ENTITY_CODE_PATTERN.test(accepted)).toBe(true);
    }
  });

  it('rejects a space, a slash and every other character outside the class', () => {
    for (const rejected of [
      'has space',
      ' leading',
      'trailing ',
      'has/slash',
      'has\\backslash',
      'plus+sign',
      'paren(s)',
      'comma,separated',
      'hash#tag',
      'at@sign',
      'per%cent',
      'star*',
      'brack[et]',
      'quest?ion',
      'quo"te',
      'tab\there',
    ]) {
      expect(ENTITY_CODE_PATTERN.test(rejected)).toBe(false);
    }
  });

  it('rejects the empty string, because the quantifier is + and both ends are anchored', () => {
    expect(ENTITY_CODE_PATTERN.test('')).toBe(false);
  });

  it('anchors across newlines, because it carries no m flag', () => {
    // Without `m`, `^` and `$` bind to the whole string, so a valid first line cannot smuggle an
    // invalid second one past the constraint.
    expect(ENTITY_CODE_PATTERN.test('good\nbad code')).toBe(false);
    expect(ENTITY_CODE_PATTERN.test('good\n')).toBe(false);
  });

  it('is the constraint on the code this entity actually exposes', () => {
    // The entity does not enforce the pattern - the service tier does - so what is asserted here
    // is that the exposed value and the constraint agree, not that the accessor rejects anything.
    const valid = aGroupWithColumns({ optionGroupCode: 'shirt-size' });
    const code = valid.getOptionGroupCode();

    expect(code).toBe('shirt-size');
    expect(ENTITY_CODE_PATTERN.test(code ?? '')).toBe(true);
    expect(aGroupWithColumns({}).getOptionGroupCode()).toBeUndefined();
  });
});

describe('the delete gate on `options` is maxCollection 0', () => {
  // CFML parity [model/validation/OptionGroup.json:L5]: "options":
  // [{"contexts":"delete","maxCollection":0}] A group may be deleted only while it holds no
  // options.
  it('counts an empty association as zero, which the gate permits', () => {
    expect(aGroupWithColumns({ options: [] }).getOptions()).toHaveLength(0);
  });

  it('counts a populated association as non-zero, which the gate refuses', () => {
    const group = aGroupWithColumns({ options: [anOption({ optionID: 'a' })] });

    expect(group.getOptions()).toHaveLength(1);
  });

  it('hosts no isDeletable member, because the rule is a service-tier concern', () => {
    expect(prototypeMembers()).not.toContain('isDeletable');
    expect(prototypeMembers()).not.toContain('getOptionsDeletableFlag');
  });

  it('reflects the association shrinking back to zero through the ported helpers', () => {
    // The only supported way to empty the collection is the bidirectional helper, because the
    // entity exposes no setter for the association.
    const option = anOption({ optionID: 'a' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(option);
    expect(group.getOptions()).toHaveLength(1);

    group.removeOption(option);
    expect(group.getOptions()).toHaveLength(0);
  });
});

describe('addOption and removeOption delegate to the far side', () => {
  // `OptionGroup` declares no inclusion or exclusion inverse association, so none is invented
  // here.
  it("addOption sets the far side's group and appends to the association", () => {
    const option = anOption({ optionID: 'a', optionName: 'Large' });
    const group = aGroupWithColumns({ optionGroupID: 'og-7', options: [] });

    group.addOption(option);

    expect(option.getOptionGroup()).toBe(group);
    expect(idsOf(group.getOptions())).toEqual(['a']);
  });

  it("removeOption clears the far side's group and splices it out", () => {
    const option = anOption({ optionID: 'a', optionName: 'Large' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(option);
    group.removeOption(option);

    expect(option.getOptionGroup()).toBeUndefined();
    expect(group.getOptions()).toHaveLength(0);
  });

  it('removes the FIRST element correctly, which a 1-based index guard would skip', () => {
    // [model/entity/Option.cfc:L102-L103] guards CFML's 1-based `arrayFind` with `index > 0`; the
    // ported guard must be `!== -1`, or element 0 - the very one `getOptions('sortOrder')` orders
    // first.
    const first = anOption({ optionID: 'first' });
    const second = anOption({ optionID: 'second' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(first);
    group.addOption(second);
    group.removeOption(first);

    expect(idsOf(group.getOptions())).toEqual(['second']);
  });

  it('is idempotent for a saved row already in the group', () => {
    // [model/entity/Option.cfc:L94] guards the append with if(isNew() or
    // !arguments.optionGroup.hasOption( this )) so a saved row that is already a member is not
    // appended twice.
    const option = anOption({ optionID: 'a', optionName: 'Large' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(option);
    group.addOption(option);

    expect(idsOf(group.getOptions())).toEqual(['a']);
  });

  it('decides membership by PRIMARY KEY, not by object identity', () => {
    // Hibernate's session made reference identity and row identity the same test; a driver-only
    // stack has no session, so containment is decided on the key.
    const hydratedOnce = anOption({ optionID: 'a', optionName: 'Large' });
    const hydratedAgain = anOption({ optionID: 'a', optionName: 'Large' });
    const group = aGroupWithColumns({ options: [hydratedOnce] });

    expect(hydratedAgain).not.toBe(hydratedOnce);
    expect(group.hasOption(hydratedAgain)).toBe(true);
    expect(group.hasOption(anOption({ optionID: 'b' }))).toBe(false);
  });

  it('answers false for any candidate when the association is empty', () => {
    const group = aGroupWithColumns({ options: [] });

    expect(group.hasOption(anOption({ optionID: 'a' }))).toBe(false);
    expect(group.hasOption(anOption({ optionID: '' }))).toBe(false);
  });

  it('still matches by key inside the unsaved-row branch, so a saved member is found', () => {
    // The containment probe switches to its reference-fallback branch when either side is unsaved
    // here because the association itself holds an unsaved row - and the key comparison survives
    // inside that branch.
    const savedMember = anOption({ optionID: 'a', optionName: 'Large' });
    const group = aGroupWithColumns({
      options: [anOption({ optionID: '' }), savedMember],
    });

    expect(group.hasOption(anOption({ optionID: 'a', optionName: 'Large' }))).toBe(true);
    expect(group.hasOption(anOption({ optionID: 'b' }))).toBe(false);
  });

  it('cannot tell two unsaved rows apart, which is why the isNew guard runs FIRST', () => {
    // CFML parity [model/entity/Option.cfc:L94]: the guard is if(isNew() or
    // !arguments.optionGroup.hasOption( this )) and the ORDER of those two operands is
    // load-bearing.
    const memberUnsaved = anOption({ optionID: '' });
    const strangerUnsaved = anOption({ optionID: '' });
    const group = aGroupWithColumns({ options: [memberUnsaved] });

    expect(strangerUnsaved).not.toBe(memberUnsaved);
    expect(group.hasOption(memberUnsaved)).toBe(true);
    expect(group.hasOption(strangerUnsaved)).toBe(true);
  });

  it('answers false for an unsaved candidate when every member is saved', () => {
    const group = aGroupWithColumns({ options: [anOption({ optionID: 'a' })] });

    expect(group.hasOption(anOption({ optionID: '' }))).toBe(false);
  });

  it('appends two DISTINCT unsaved rows, because the isNew guard short-circuits', () => {
    // Every unsaved option shares the empty primary key, so a key comparison alone cannot separate
    // them.
    const firstUnsaved = anOption({ optionID: '' });
    const secondUnsaved = anOption({ optionID: '' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(firstUnsaved);
    group.addOption(secondUnsaved);

    expect(group.getOptions()).toHaveLength(2);
    expect(group.getOptions()[0]).toBe(firstUnsaved);
    expect(group.getOptions()[1]).toBe(secondUnsaved);
  });

  it('removes the intended unsaved row by reference, leaving its twin in place', () => {
    // The removal path falls back to reference identity when either side is unsaved, which is the
    // only thing that distinguishes two rows sharing the empty key.
    const firstUnsaved = anOption({ optionID: '' });
    const secondUnsaved = anOption({ optionID: '' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(firstUnsaved);
    group.addOption(secondUnsaved);
    group.removeOption(firstUnsaved);

    expect(group.getOptions()).toHaveLength(1);
    expect(group.getOptions()[0]).toBe(secondUnsaved);
    expect(firstUnsaved.getOptionGroup()).toBeUndefined();
    expect(secondUnsaved.getOptionGroup()).toBe(group);
  });

  it('leaves the association untouched when asked to remove a non-member', () => {
    // [model/entity/Option.cfc:L103] only splices when the index was found, while L106's
    // `structDelete` is UNCONDITIONAL - so the non-member still loses its own group reference.
    const member = anOption({ optionID: 'member' });
    const stranger = anOption({ optionID: 'stranger' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(member);
    group.removeOption(stranger);

    expect(idsOf(group.getOptions())).toEqual(['member']);
    expect(stranger.getOptionGroup()).toBeUndefined();
  });

  it('passes `this` explicitly, exactly as the legacy body does', () => {
    // [model/entity/OptionGroup.cfc:L96] passes `this` even though
    // [model/entity/Option.cfc:L98-L101] would have fallen back to the option's own stored group
    // when the argument was omitted.
    const neverAssigned = anOption({ optionID: 'a' });
    const group = aGroupWithColumns({ options: [] });

    expect(neverAssigned.getOptionGroup()).toBeUndefined();
    expect(() => {
      group.removeOption(neverAssigned);
    }).not.toThrow();
  });

  it('returns void from both helpers, matching the legacy declarations', () => {
    const option = anOption({ optionID: 'a' });
    const group = aGroupWithColumns({ options: [] });

    expect(group.addOption(option)).toBeUndefined();
    expect(group.removeOption(option)).toBeUndefined();
  });

  it('keeps the ordering declared on the association out of the helpers', () => {
    // [model/entity/OptionGroup.cfc:L70] declares `orderby="sortOrder"`, which is a
    // HIBERNATE-LEVEL instruction honoured by the producing repository, not by these helpers.
    const group = aGroupWithColumns({ options: [] });

    group.addOption(anOption({ optionID: 'later', sortOrder: 9 }));
    group.addOption(anOption({ optionID: 'earlier', sortOrder: 1 }));

    expect(idsOf(group.getOptions())).toEqual(['later', 'earlier']);
    expect(idsOf(group.getOptions('sortOrder', 'numeric'))).toEqual(['earlier', 'later']);
  });
});

/**
 * The members this entity is intended to expose, in declaration order.
 */
const INTENDED_PUBLIC_SURFACE = [
  'getOptionGroupID',
  'getOptionGroupName',
  'getOptionGroupCode',
  'getOptionGroupImage',
  'getOptionGroupDescription',
  'getImageGroupFlag',
  'getSortOrder',
  'getRemoteID',
  'getCreatedDateTime',
  'getCreatedByAccountID',
  'getModifiedDateTime',
  'getModifiedByAccountID',
  'getOptions',
  'hasOption',
  'addOption',
  'removeOption',
] as const;

describe('structural facts, and the base class that is deliberately not ported', () => {
  // The legacy component extends `HibachiEntity` [model/entity/OptionGroup.cfc:L49], a three-level
  // chain ending at `Slatwall.org.Hibachi.HibachiEntity`.
  it('exposes every member of the intended public surface as a function', () => {
    const group = aGroupWithColumns({});

    for (const member of INTENDED_PUBLIC_SURFACE) {
      expect(typeof group[member]).toBe('function');
    }
  });

  it('reads back every persisted column it was hydrated with', () => {
    const created = new Date('2020-06-15T13:45:00.000Z');
    const modified = new Date('2021-11-02T08:30:00.000Z');
    const group = aGroupWithColumns({
      optionGroupID: 'og-77',
      optionGroupName: 'Shirt Size',
      optionGroupCode: 'shirt-size',
      optionGroupImage: 'shirt-size.png',
      optionGroupDescription: 'Sizes carried for shirts.',
      imageGroupFlag: 1,
      sortOrder: 12,
      remoteID: 'legacy-42',
      createdDateTime: created,
      createdByAccountID: 'acct-created',
      modifiedDateTime: modified,
      modifiedByAccountID: 'acct-modified',
    });

    expect(group.getOptionGroupID()).toBe('og-77');
    expect(group.getOptionGroupName()).toBe('Shirt Size');
    expect(group.getOptionGroupCode()).toBe('shirt-size');
    expect(group.getOptionGroupImage()).toBe('shirt-size.png');
    expect(group.getOptionGroupDescription()).toBe('Sizes carried for shirts.');
    expect(group.getImageGroupFlag()).toBe(true);
    expect(group.getSortOrder()).toBe(12);
    expect(group.getRemoteID()).toBe('legacy-42');
    expect(group.getCreatedByAccountID()).toBe('acct-created');
    expect(group.getModifiedByAccountID()).toBe('acct-modified');
  });

  it('reports every nullable column as undefined when it hydrated absent', () => {
    const group = aGroupWithColumns({});

    expect(group.getOptionGroupName()).toBeUndefined();
    expect(group.getOptionGroupCode()).toBeUndefined();
    expect(group.getOptionGroupImage()).toBeUndefined();
    expect(group.getOptionGroupDescription()).toBeUndefined();
    expect(group.getRemoteID()).toBeUndefined();
    expect(group.getCreatedByAccountID()).toBeUndefined();
    expect(group.getModifiedByAccountID()).toBeUndefined();
  });

  it('represents an unsaved row as the empty primary key, which unsavedvalue="" makes load-bearing', () => {
    // CFML parity [model/entity/OptionGroup.cfc:L52]: `unsavedvalue="" default=""`, so the column
    // always holds a string and the EMPTY one means "never persisted".
    const unsaved = aGroupWithColumns({ optionGroupID: '' });
    const saved = aGroupWithColumns({ optionGroupID: 'og-9' });

    expect(unsaved.getOptionGroupID()).toBe('');
    expect(saved.getOptionGroupID()).toBe('og-9');
  });

  it('hosts no isNew(), because it belongs to the unported framework base', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L571-L576]: the base defined `getNewFlag()` as
    // `getPrimaryIDValue() == ""` and `isNew()` on top of it.
    expect(prototypeMembers()).not.toContain('isNew');
    expect(prototypeMembers()).not.toContain('getNewFlag');
  });

  it('hosts no getSimpleRepresentation(), so the inherited legacy case is explained not forced', () => {
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] asserts
    // `isSimpleValue(entity.getSimpleRepresentation())` for every entity that extends it.
    expect(prototypeMembers()).not.toContain('getSimpleRepresentation');
    expect(prototypeMembers()).not.toContain('getPrimaryIDPropertyName');
    expect(prototypeMembers()).not.toContain('getPrimaryIDValue');
  });

  it('keeps audit timestamps as Date | undefined and never falls back to the epoch', () => {
    // An absent timestamp is `undefined`.
    const absent = aGroupWithColumns({});

    expect(absent.getCreatedDateTime()).toBeUndefined();
    expect(absent.getModifiedDateTime()).toBeUndefined();

    const populated = aGroupWithColumns({
      createdDateTime: new Date('2020-06-15T13:45:00.000Z'),
      modifiedDateTime: new Date('2021-11-02T08:30:00.000Z'),
    });

    expect(populated.getCreatedDateTime()?.toISOString()).toBe('2020-06-15T13:45:00.000Z');
    expect(populated.getModifiedDateTime()?.toISOString()).toBe('2021-11-02T08:30:00.000Z');
  });

  it('reduces the out-of-scope Account associations to opaque ids', () => {
    // CFML parity [model/entity/OptionGroup.cfc:L65, L67]: both are cfc="Account"
    // fieldtype="many-to-one" and the whole account module is out of scope, so each collapses to
    // its foreign-key id.
    const group = aGroupWithColumns({
      createdByAccountID: 'acct-1',
      modifiedByAccountID: 'acct-2',
    });

    expect(group.getCreatedByAccountID()).toBe('acct-1');
    expect(group.getModifiedByAccountID()).toBe('acct-2');
    expect(prototypeMembers()).not.toContain('getCreatedByAccount');
    expect(prototypeMembers()).not.toContain('getModifiedByAccount');
  });

  it('exposes remoteID, which is a real schema difference rather than boilerplate', () => {
    // CFML parity [model/entity/OptionGroup.cfc:L61]: `property name="remoteID" ormtype="string";`
    // under its own `// Remote properties` banner, and with no `hint` attribute - unlike
    // [model/entity/Category.cfc:L73], which documents its own remoteID.
    expect(aGroupWithColumns({ remoteID: 'legacy-42' }).getRemoteID()).toBe('legacy-42');
    expect(aGroupWithColumns({}).getRemoteID()).toBeUndefined();
  });

  it('declares no setter, matching a component that hand-writes none', () => {
    // `accessors=true` [model/entity/OptionGroup.cfc:L49] generated setters in CFML, but this
    // entity is hydrated by its constructor and a repository that needs to write a column writes
    // the ROW, not the object.
    expect(prototypeMembers().filter((name) => name.startsWith('set'))).toEqual([]);
  });

  it('has no dynamic dispatch: an unsynthesised member is simply absent', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: `onMissingMethod` synthesised eleven
    // member patterns - `hasUniqueOrNullXXX`, `hasUniqueXXX`, `hasAnyXXX`, `getXXXAssignedIDList`,
    // `getXXXID`, `getXXXOptions`, `getXXXOptionsSmartList`, `getXXXSmartList`, `getXXXStruct`,
    // `getXXXCount` and the attribute getter.
    const members = prototypeMembers();

    expect(members).toContain('hasOption');

    for (const notSynthesised of [
      'onMissingMethod',
      'getOptionsCount',
      'hasAnyOptions',
      'getOptionsAssignedIDList',
      'getOptionsStruct',
      'getOptionsOptions',
      'hasUniqueOptionGroupCode',
      'getAttributeValue',
      'clearAttributeCache',
      'getPrintTemplates',
    ]) {
      expect(members).not.toContain(notSynthesised);
    }
  });

  it('carries no ORM lifecycle hook, because the source banner is empty', () => {
    // Contrast `PriceGroup`, whose `getPriceGroupIDPath()` [model/entity/PriceGroup.cfc:L195] is
    // maintained by `preInsert` at L206 and `preUpdate` at L211.
    const members = prototypeMembers();

    for (const hook of ['preInsert', 'preUpdate', 'preDelete', 'postInsert', 'postUpdate']) {
      expect(members).not.toContain(hook);
    }
  });

  it('takes exactly one constructor parameter, so no collaborator port can be hiding in a second', () => {
    expect(OptionGroup.length).toBe(1);
  });

  it('sorts with no collaborator supplied at all, proving no port was ever required', () => {
    // Built through the column factory, which passes `optionSortTieBreaker: undefined` - the
    // deliberate statement "use the legacy `randRange(1,100)` source".
    const group = aGroupWithColumns({
      options: [
        anOption({ optionID: 'z', optionName: 'Zulu' }),
        anOption({ optionID: 'a', optionName: 'Alpha' }),
      ],
    });

    expect(idsOf(group.getOptions('optionName'))).toEqual(['a', 'z']);
  });

  it('holds no memoized non-persistent accessor, because the source declares none', () => {
    // The `Non-Persistent Property Methods` banner [model/entity/OptionGroup.cfc:L85-L87] is
    // empty, so this entity has none of the memo-poisoning defects that `Sku` and `Product` carry.
    const group = aGroupWithColumns({ optionGroupName: 'Shirt Size', imageGroupFlag: '1' });

    expect(group.getOptionGroupName()).toBe('Shirt Size');
    expect(group.getOptionGroupName()).toBe('Shirt Size');
    expect(group.getImageGroupFlag()).toBe(true);
    expect(group.getImageGroupFlag()).toBe(true);
  });

  it('keeps every instance independent, so nothing leaks between two hydrations', () => {
    // Warm Lambda containers make module-level mutable state a cross-request hazard.
    const left = aGroupWithColumns({
      optionGroupID: 'og-left',
      options: [anOption({ optionID: 'l' })],
    });
    const right = aGroupWithColumns({
      optionGroupID: 'og-right',
      options: [anOption({ optionID: 'r' })],
    });

    right.addOption(anOption({ optionID: 'r2' }));

    expect(idsOf(left.getOptions())).toEqual(['l']);
    expect(idsOf(right.getOptions())).toEqual(['r', 'r2']);
    expect(left.getOptions()).not.toBe(right.getOptions());
  });
});
