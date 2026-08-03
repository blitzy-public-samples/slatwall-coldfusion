// --------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/domain/entities/optionGroup.ts`
//
// `getOptions(orderby, sortType, direction)` is the only real behaviour on this entity, and it
// OVERRIDES the collection accessor: [model/entity/OptionGroup.cfc:L73-L79] delegates its sort
// branch to `getService("hibachiUtilityService").sortObjectArray(...)`, verified verbatim at
// [model/service/HibachiUtilityService.cfc:L514-L531]. That utility is framework code the port does
// not ship as a module, but its results are returned straight out of a public entity method, so its
// OBSERVABLE behaviour is part of the contract. CHARACTERIZATION in the strict sense: the legacy
// behaviour is pinned INCLUDING its defects. Four properties, each traced:
//
//   1. The composed struct key is `"<rendered value>.<randRange(1,100)>"`
//      [model/service/HibachiUtilityService.cfc:L518-L523], so the RANDOM SUFFIX participates
//      in the ordering and breaks ties non-deterministically.
//   2. Two elements whose value AND draw collide share one key and the later assignment
//      overwrites the earlier, so the returned array is SHORTER than the input
//      [model/service/HibachiUtilityService.cfc:L523].
//   3. `arraySort(keyArray, sorttype, direction)`
//      [model/service/HibachiUtilityService.cfc:L526]: `'text'`, the default declared at
//      [model/entity/OptionGroup.cfc:L73], is CASE-SENSITIVE; only `'textnocase'` folds.
//   4. `'numeric'` orders by the WHOLE composed key, so integers are ordered by their random
//      tails, and a non-numeric key raises exactly as `arraySort` raises.
//
// Two failure contracts are pinned alongside them: an `orderby` naming no accessor raised through
// `evaluate()` [model/service/HibachiUtilityService.cfc:L523], and a non-numeric key raised inside
// `arraySort` [model/service/HibachiUtilityService.cfc:L526]. Neither degrades to unsorted or
// re-ordered data.
//
// --- 100% net-new coverage - never to be presented as parity ----------------
//
// All 32 `.cfc` files under `meta/tests/` return ZERO hits for `OptionGroup`, `getOptions` and
// `sortObjectArray`. The only legacy suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc], and
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub contributing zero coverage.
// Presenting this file as parity would fail the traceability gate.
//
// DETERMINISM. The legacy tie-break is `randRange(1,100)`. The entity accepts the random source
// through its constructor - `optionSortTieBreaker` - leaving `getOptions`'s public signature
// untouched while making the preserved non-determinism characterizable. Every suite supplies a
// scripted source; one deliberately exercises the DEFAULT source and asserts only what holds for
// every draw. No database, clock, environment variable or network is reached here.
//
// --- four inherited descriptions corrected against the source ---------------
//
//   1. `sortType='text'` was called case-INSENSITIVE. It is case-SENSITIVE:
//      [model/service/HibachiUtilityService.cfc:L526] calls `arraySort(keyArray,"text",...)`
//      and CFML compares by code unit. `'textnocase'` is the ONLY folding mode.
//   2. An unsupported `orderby` was called unsorted-returning. It RAISES, through `evaluate()`
//      at [model/service/HibachiUtilityService.cfc:L523].
//   3. `orderby=''` was called "simply taking the sort branch". It does take it -
//      [model/entity/OptionGroup.cfc:L74] branches on `structKeyExists`, not truthiness - and
//      the observable consequence is the raise in (2).
//   4. `sortOrder` was called `undefined`-representable. It is NOT:
//      [model/entity/OptionGroup.cfc:L58] declares `required="true"`. Contrast
//      [model/entity/Option.cfc:L56], which omits `required` and IS nullable.
//
// Two counts differ from the inherited figure: `model/validation/` holds 96 `.json` files, and the
// in-scope split is 15 PRESENT / 6 ABSENT - `model/validation/OptionGroup.json` exists and is one
// of three an earlier inventory omitted, with `SkuCurrency.json` and `RoundingRule.json`.
//
// --- three members are verifiably absent, and absence is asserted, not assumed -----
//
//   * `getOptionsSmartList()` [model/entity/OptionGroup.cfc:L81-L83] - `HibachiSmartList` is a
//     framework query-builder artifact replaced by typed repository queries (AAP 0.6.2).
//   * `isNew()` - it belongs to the unported base [org/Hibachi/HibachiEntity.cfc:L571-L576] and
//     is called on an `Option` [model/entity/Option.cfc:L94], never on an OptionGroup.
//   * `getSimpleRepresentation()` - never declared here, so the inherited legacy assertion at
//     [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] is EXPLAINED rather than
//     forced onto a surface that does not have it.
//
// --- divergence budget: zero ------------------------------------------------
//
// Exactly ONE `LEGACY-DEFECT` marker appears below, on the colliding-key element loss, matching the
// single marker the module carries. The lexicographic ordering of an integer column, the
// capitalized `variables.Options` read and the empty-string sort branch are `CFML parity` notes:
// verified source behaviour, not defects.
//
// JUDGMENT CALL: two module branches are left unexercised on purpose - the text-mode comparator's
// equal-key tie and the map-lookup `undefined` guard. Both are defensive code the surrounding
// construction makes unreachable: the composed key carries a distinct suffix, and every key read
// back was written by the same pass. Reaching them would mean fabricating a state the production
// path cannot produce. Left unreached, and said so plainly.
// --------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

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
 * JUDGMENT CALL: a hand-written closure rather than `vi.fn()` or a spy. P3 prefers inline in-memory
 * doubles, and the tie-breaker is a constructor-injected random SOURCE - not a port - so there is
 * nothing to intercept. `vi` is never imported by this suite, which is why no `afterEach`
 * restoration is needed.
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
 * JUDGMENT CALL: freshness (A2) is delivered by invoking this pure factory inside every single test
 * rather than by assigning a shared subject in `beforeEach`. There is then no describe-scope
 * subject and no module-level mutable binding for one test to leak into the next - which matters
 * most for the copy-versus-in-place assertions, where a reused subject would mask a mutation.
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
 * as being about ordering and nothing else, while this one varies them so a column assertion says
 * exactly which column it is about.
 *
 * Every slot is written `?: T | undefined` rather than `?: T` because `exactOptionalPropertyTypes`
 * is enabled, and a suite must be able to state "this column hydrated as ABSENT" explicitly rather
 * than by omission.
 *
 * `imageGroupFlag` is typed as the structural union `cfBoolean` accepts rather than by importing
 * that module's `CfBooleanInput` alias: `src/lib/**` is outside this suite's permitted import
 * surface, and the union is the same contract either way.
 *
 * `??` is used for the two non-nullable slots and is correct for both: it falls back only on
 * `null`/`undefined`, so `optionGroupID: ''` stays `''` - which the unsaved-row suite depends on -
 * and `sortOrder: 0` stays `0`.
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

/** The `optionID` of every element, in the order the sort returned them. */
function idsOf(options: readonly Option[]): readonly string[] {
  return options.map((option) => option.getOptionID());
}

/**
 * Every own member name on the class prototype, for the absence assertions.
 *
 * JUDGMENT CALL: absence is proved by scanning the prototype rather than by writing
 * `@ts-expect-error` against a call to the missing member. A prototype scan is a RUNTIME proof that
 * keeps holding if someone later adds the member back, whereas `@ts-expect-error` would itself
 * start failing and would spend P1's strictness allowance on a member that must simply never exist.
 */
function prototypeMembers(): readonly string[] {
  return Object.getOwnPropertyNames(OptionGroup.prototype);
}

describe('getOptions with no argument', () => {
  // [model/entity/OptionGroup.cfc:L74-L75]: the branch is on PRESENCE, so the no-argument call
  // returns `variables.Options` untouched - it does not sort, does not copy-and-reorder, and never
  // reaches the utility at all.
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
  // [model/service/HibachiUtilityService.cfc:L526]: `arraySort(keyArray,"text",...)`. This is the
  // property whose loss would silently re-order a mixed-case option list, and the legacy default is
  // `'text'` [model/entity/OptionGroup.cfc:L73].
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
  // [model/service/HibachiUtilityService.cfc:L518-L523]: the key format is `{VALUE}.{RAND NUMBER}`,
  // and the key - not the value - is what gets sorted.
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
  // LEGACY-DEFECT [model/service/HibachiUtilityService.cfc:L523]: two elements whose rendered value
  // and drawn number both match write the SAME struct key, and the second assignment overwrites the
  // first. The source comment at L518-L520 shows the random suffix exists to make this unlikely;
  // with only 100 values to draw from it is not impossible. Pinned here so nobody "fixes" it into a
  // stable, length-preserving sort.
  //
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
  // [model/service/HibachiUtilityService.cfc:L523,L526]: under `numeric` the random suffix becomes
  // the FRACTIONAL PART of the key, so two integers with the same value are ordered by their draws,
  // and - more surprising - the draw can never reorder DIFFERENT integers because it only ever adds
  // a fraction.
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
    // template, so the grammatical error in the source - "does not exists" - is load-bearing and
    // must be reproduced byte-for-byte.
    const group = aGroup([anOption({ optionID: 'a' })]);

    expect(() => group.getOptions('nonsense')).toThrow(
      /^You have called a method getnonsense\(\) which does not exists in the Option entity\./,
    );
  });

  it('RESOLVES a case-variant spelling, because CFML method names are case-insensitive', () => {
    // [model/service/HibachiUtilityService.cfc:L523] resolved the accessor through
    // `evaluate("...get#property#()...")`, and CFML method names are case-insensitive, so
    // `orderby="optionname"` reached the one generated `getOptionName()` accessor and SORTED.
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
  // exercised at least once - a property that cannot actually be read would otherwise be an
  // accessor mismatch waiting to surface at runtime.
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
  // EVERY possible draw.
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
    // Observed indirectly and without reaching into the module: an integer draw in 1..100 makes the
    // composed key for an EMPTY value read as a number in (0.01, 1], so a numeric sort against a
    // populated row of 1 must place the absent row first on every attempt.
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
  // CFML parity [model/entity/OptionGroup.cfc:L73]: `sortType` defaults to `'text'` and NOT to a
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
    // The SAME data under the SAME draw, differing only in sort type.
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

// --- structural, column and association contract ----------------------------
//
// Everything above pins the SORT. Everything below pins the rest of the surface: the
// capitalized-binding hazard, the omitted smart list, the two-tier `sortOrder` requirement, the
// boolean coercion, the shared code pattern, the delete gate's input, the bidirectional helpers,
// and the structural facts inherited from a base class that is deliberately not ported.

describe('the capitalized `variables.Options` read is normalised to ONE binding', () => {
  // CFML parity [model/entity/OptionGroup.cfc:L70,L75,L77]: the property is declared lowercase
  // `options` at L70, yet BOTH branches read `variables.Options` with a capital `O`. CFML scope
  // keys are case-insensitive, so the two spellings named ONE variable there; TypeScript
  // identifiers are not, so the port normalises to the DECLARED spelling.
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
    // so this array must BE the association and must stay mutable in content.
    const options: Option[] = [];
    const group = aGroupWithColumns({ options });

    group.addOption(anOption({ optionID: 'appended', optionName: 'Added' }));

    expect(group.getOptions()).toBe(options);
    expect(idsOf(group.getOptions())).toEqual(['appended']);
  });
});

describe('getOptionsSmartList is OMITTED, not overlooked', () => {
  // CFML parity [model/entity/OptionGroup.cfc:L81-L83]: the legacy member returned
  // `getPropertySmartList(propertyName="options")`. The legacy declaration was REDUNDANT even in
  // CFML: `onMissingMethod` at [org/Hibachi/HibachiEntity.cfc:L507-L565] already synthesised any
  // `getXXXSmartList()` into the same call, so L81-L83 only restated what the dispatcher would have
  // done.
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
  // CFML parity [model/entity/OptionGroup.cfc:L58, model/validation/OptionGroup.json]: the property
  // carries ORM-level `required="true"` with NO default, yet the validation schema never mentions
  // `sortOrder` at all - it constrains only `optionGroupName`, `optionGroupCode` and `options`. The
  // shipped field is a required `number`, and the reason is load-bearing rather than stylistic -
  // [model/dao/SkuDAO.cfc:L195-L197] weights its ORDER BY with
  //   POWER(10, <next> - SwOptionGroup.sortOrder)
  // so a NULL exponent would scramble the sorted-SKU ordering.
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
    // [model/entity/Option.cfc:L56] declares `sortContext="optionGroup"` and NO `required`, so the
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
  // CFML parity [model/entity/OptionGroup.cfc:L57]: `ormtype="boolean" default="0"`. WHAT DEPENDS
  // ON IT: [model/entity/Sku.cfc:L134] reads `if(option.getOptionGroup().getImageGroupFlag())`
  // inside `generateImageFileName()`, so an inverted flag does not merely flip a boolean - it
  // changes the filename a SKU resolves its image by. CFML parity on the DEFAULT ITSELF, annotated
  // and never normalised: this column declares `default="0"`, as `Sku.activeFlag` and
  // `Promotion.activeFlag` do, whereas `Category.restrictAccessFlag`,
  // `Category.allowProductAssignmentFlag` and `Product.activeFlag` declare NO default.
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
  // CFML parity [model/validation/OptionGroup.json:L4], verified verbatim:
  //
  //   "optionGroupCode": [{"contexts":"save","required":true,"unique":true,
  //                        "regex":"^[a-zA-Z0-9-_.|:~^]+$"}]
  //
  // ONE DECLARATION SITE, THREE CONSUMERS. The identical regex appears in exactly three in-scope
  // schemas - `optionGroupCode` [model/validation/OptionGroup.json:L4], `optionCode`
  // [model/validation/Option.json:L3] and `productCode` [model/validation/Product.json:L10] - and
  // the three strings are byte-identical, verified by extracting every `"regex"` value under
  // `model/validation/` and counting three occurrences. It is declared ONCE, in
  // `src/domain/entities/optionGroup.ts`, and IMPORTED here. It is never re-declared in this file,
  // never routed through a barrel and never through a shared `types.ts` - this port has no barrel
  // at all.
  //
  // Only the FORMAT half of the rule lives in the constant. `required` belongs to the ported zod
  // schema at the SERVICE tier and `unique` needs the database, so neither is asserted here and no
  // zod assertion belongs in this file.
  //
  // A COUNT CORRECTED BY RE-COUNTING: `model/validation/OptionGroup.json` EXISTS, and it is one of
  // three in-scope schemas an earlier inventory omitted - with `SkuCurrency.json` and
  // `RoundingRule.json`. The verified in-scope split is 15 PRESENT / 6 ABSENT, and
  // `model/validation/` holds 96 `.json` files in total. The six genuine absences are unchanged and
  // are NOT expanded: Category, PromotionQualifier, PromotionApplied, PromotionAccount,
  // Product_AddOption and Product_AddOptionGroup.
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
    // The entity does not enforce the pattern - the service tier does - so what is asserted here is
    // that the exposed value and the constraint agree, not that the accessor rejects anything.
    const valid = aGroupWithColumns({ optionGroupCode: 'shirt-size' });
    const code = valid.getOptionGroupCode();

    expect(code).toBe('shirt-size');
    expect(ENTITY_CODE_PATTERN.test(code ?? '')).toBe(true);
    expect(aGroupWithColumns({}).getOptionGroupCode()).toBeUndefined();
  });
});

describe('the delete gate on `options` is maxCollection 0', () => {
  // CFML parity [model/validation/OptionGroup.json:L5]:
  //   "options": [{"contexts":"delete","maxCollection":0}]
  // A group may be deleted only while it holds NO options. A TENSION RECORDED RATHER THAN RESOLVED:
  // [model/entity/OptionGroup.cfc:L70] also declares `cascade="all-delete-orphan"`, which would
  // delete the options WITH the group, while `maxCollection: 0` refuses the delete while any option
  // exists.
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
  // CFML parity [model/entity/OptionGroup.cfc:L91-L97], verified verbatim:
  //
  //   // Options (one-to-many)
  //   public void function addOption(required any option) {
  //       arguments.option.setOptionGroup( this );
  //   }
  //   public void function removeOption(required any option) {
  //       arguments.option.removeOptionGroup( this );
  //   }
  //
  // INVERSION CROSS-CHECK VERDICT: CLEAN. `add*` delegates to the far side's `set*` and `remove*`
  // delegates to the far side's `remove*`, which is the pattern as intended. The verdict is stated
  // explicitly - as required either way - because the sibling entity does NOT get it right:
  // [model/entity/Option.cfc:L129-L131] and [model/entity/Option.cfc:L145-L147] each have a
  // `remove*` calling `addExcludedOption(this)`, so asking to remove ADDS. Those are preserved
  // defects owned by `option.test.ts`. This entity has none to preserve, and that absence is a
  // verified fact rather than an assumption.
  //
  // Neither helper touches the collection directly. The far side reaches back through
  // `getOptions()` and mutates it - `arrayAppend` at [model/entity/Option.cfc:L95],
  // `arrayFind`/`arrayDeleteAt` at L102-L105 - which is exactly why the no-orderby branch must hand
  // back the live array.
  //
  // `OptionGroup` declares NO inclusion or exclusion inverse association, so none is invented here.
  // The four that exist on `Option` [model/entity/Option.cfc:L66-L70] belong to `option.test.ts`.
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
    // first - would silently never be removed.
    const first = anOption({ optionID: 'first' });
    const second = anOption({ optionID: 'second' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(first);
    group.addOption(second);
    group.removeOption(first);

    expect(idsOf(group.getOptions())).toEqual(['second']);
  });

  it('is idempotent for a saved row already in the group', () => {
    // [model/entity/Option.cfc:L94] guards the append with
    //   if(isNew() or !arguments.optionGroup.hasOption( this ))
    // so a saved row that is already a member is not appended twice.
    const option = anOption({ optionID: 'a', optionName: 'Large' });
    const group = aGroupWithColumns({ options: [] });

    group.addOption(option);
    group.addOption(option);

    expect(idsOf(group.getOptions())).toEqual(['a']);
  });

  it('decides membership by PRIMARY KEY, not by object identity', () => {
    // Hibernate's session made reference identity and row identity the same test; a driver-only
    // stack has no session, so containment is decided on the key. A `hasOption` that answered false
    // for a row it already holds would make [model/entity/Option.cfc:L94]'s guard append a
    // DUPLICATE.
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
    // The containment probe switches to its reference-fallback branch when EITHER side is unsaved -
    // here because the association itself holds an unsaved row - and the key comparison survives
    // inside that branch. Were it dropped, a saved row would stop being found the moment any
    // unsaved sibling joined the group, and [model/entity/Option.cfc:L94]'s guard would then append
    // a DUPLICATE of it.
    const savedMember = anOption({ optionID: 'a', optionName: 'Large' });
    const group = aGroupWithColumns({
      options: [anOption({ optionID: '' }), savedMember],
    });

    expect(group.hasOption(anOption({ optionID: 'a', optionName: 'Large' }))).toBe(true);
    expect(group.hasOption(anOption({ optionID: 'b' }))).toBe(false);
  });

  it('cannot tell two unsaved rows apart, which is why the isNew guard runs FIRST', () => {
    // CFML parity [model/entity/Option.cfc:L94]: the guard is
    //   if(isNew() or !arguments.optionGroup.hasOption( this ))
    // and the ORDER of those two operands is load-bearing.
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
    // them. `isNew()` is evaluated FIRST at [model/entity/Option.cfc:L94] and short-circuits the
    // containment probe, which is what lets two unsaved rows both join the group.
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
    // [model/entity/OptionGroup.cfc:L70] declares `orderby="sortOrder"`, which is a HIBERNATE-LEVEL
    // instruction honoured by the producing repository, not by these helpers.
    const group = aGroupWithColumns({ options: [] });

    group.addOption(anOption({ optionID: 'later', sortOrder: 9 }));
    group.addOption(anOption({ optionID: 'earlier', sortOrder: 1 }));

    expect(idsOf(group.getOptions())).toEqual(['later', 'earlier']);
    expect(idsOf(group.getOptions('sortOrder', 'numeric'))).toEqual(['earlier', 'later']);
  });
});

/**
 * The members this entity is intended to expose, in declaration order.
 *
 * Written out rather than derived, so that a member disappearing from the module fails here instead
 * of quietly shrinking a derived list to match. Every name is the legacy CFML name VERBATIM in
 * camelCase, because interface parity is the acceptance contract.
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
  // chain ending at `Slatwall.org.Hibachi.HibachiEntity`. TABLE CONTINUITY:
  // [model/entity/OptionGroup.cfc:L49] declares
  //   entityname="SlatwallOptionGroup" table="SwOptionGroup"
  // and the physical table name is preserved verbatim - no migration, no rename, no new column.
  // EMPTY BANNER PAIRS, PRESERVED AS SOURCE WARTS AND NEVER NORMALISED:
  // [model/entity/OptionGroup.cfc:L85]/[L87] `Non-Persistent Property Methods`, [L101]/[L103]
  // `Overridden Methods`, and [L105]/[L107] `ORM Event Hooks` are all present-but-empty. Only the
  // `Bidirectional Helper Methods` pair at [L89]/[L99] contains anything.
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
    // `getPrimaryIDValue() == ""` and `isNew()` on top of it. The base is not ported, and a
    // repository-wide census finds `isNew()` called on an `Option` [model/entity/Option.cfc:L94]
    // and never on an OptionGroup - so it is not authored here.
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
    // CFML parity [model/entity/OptionGroup.cfc:L65,L67]: both are
    //   cfc="Account" fieldtype="many-to-one"
    // and the whole account module is out of scope, so each collapses to its foreign-key id.
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
    // under its own `// Remote properties` banner, and with NO `hint` attribute - unlike
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
    // `getXXXCount` and the attribute getter - and threw at L565 for anything else. The target has
    // NO dynamic dispatch AT ALL: no `Proxy`, no index signature, no string dispatch, and
    // `OptionGroup` declares no `attributeValues` collection, so it never had an EAV read path for
    // the attribute-getter branch to serve. Only the patterns a caller CONCRETELY invokes are
    // authored, which is why `hasOption` exists - it is called at [model/entity/Option.cfc:L94] -
    // and the rest do not.
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
    // [model/entity/OptionGroup.cfc:L77] is the component's ONLY `getService(` site -
    // `hibachiUtilityService.sortObjectArray`. `hibachiUtilityService` is not ported (AAP 0.5.3)
    // and there is NO fourteenth port: the port ledger is locked at 13. The sort is reproduced in
    // memory instead, justified by FIDELITY to the legacy result, defects included.
    expect(OptionGroup.length).toBe(1);
  });

  it('sorts with no collaborator supplied at all, proving no port was ever required', () => {
    // Built through the column factory, which passes `optionSortTieBreaker: undefined`
    // - the deliberate statement "use the legacy `randRange(1,100)` source". Distinct
    // values order deterministically whatever the draw, so this holds unconditionally.
    const group = aGroupWithColumns({
      options: [
        anOption({ optionID: 'z', optionName: 'Zulu' }),
        anOption({ optionID: 'a', optionName: 'Alpha' }),
      ],
    });

    expect(idsOf(group.getOptions('optionName'))).toEqual(['a', 'z']);
  });

  it('holds no memoized non-persistent accessor, because the source declares none', () => {
    // The `Non-Persistent Property Methods` banner [model/entity/OptionGroup.cfc:L85-L87] is empty,
    // so this entity has none of the memo-poisoning defects that `Sku` and `Product` carry.
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
