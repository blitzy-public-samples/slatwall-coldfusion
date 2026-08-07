// slatwall-ts - characterization suite pinning `src/domain/entities/option.ts`
//
// `model/entity/Option.cfc` is 160 lines of which twelve bidirectional helpers
// [model/entity/Option.cfc:L92-L147] are the only behaviour; the rest is property metadata.
//
// MEASURED: all 32 `.cfc` files under `meta/tests/` were searched for `Option` as an entity
// subject and none exists, so no assertion below has a legacy antecedent.
//
// The two exclusion `remove*` helpers are more than a double-append hazard, and the cases below
// assert what they actually do rather than that weaker framing.

import { describe, expect, it } from 'vitest';

import { Option } from '../../../../src/domain/entities/option.js';
import { ENTITY_CODE_PATTERN, OptionGroup } from '../../../../src/domain/entities/optionGroup.js';
import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

/**
 * The already-resolved assets image base that `getImageDirectory` concatenates onto.
 *
 * JUDGMENT CALL: an opaque token rather than a url or a filesystem path.
 */
const RESOLVED_ASSETS_IMAGE_BASE = 'assets-base';

/**
 * The one path segment `getImageDirectory` contributes, named rather than inlined.
 *
 * JUDGMENT CALL: the expected directory is COMPOSED from named parts at every assertion site
 * instead of being written as a single path literal.
 */
const OPTION_IMAGE_SUBDIRECTORY = 'option';

/**
 * A structural stand-in for one `SwImage` row owned by an option. [model/entity/Option.cfc:L63]
 *
 * JUDGMENT CALL: declared locally because the shipped module's own `OptionImageLink` interface is
 * MODULE-LOCAL and UN-EXPORTED - deliberately so, to keep that module's runtime export surface at
 * exactly one unit - and therefore cannot be imported.
 */
interface ImageLinkDouble {
  getImageID(): string;
  getImageFile(): string | undefined;
  getDirectory(): string | undefined;
}

/**
 * Builds one `ImageLinkDouble` from plain data. A hand-written closure rather than `vi.fn()`:
 * there is no call to record and nothing to intercept.
 */
function anImageLink(init: {
  readonly imageID: string;
  readonly imageFile?: string | undefined;
  readonly directory?: string | undefined;
}): ImageLinkDouble {
  return {
    getImageID: () => init.imageID,
    getImageFile: () => init.imageFile,
    getDirectory: () => init.directory,
  };
}

/**
 * Builds the `Option` under test with every persisted column and every materializable association
 * controllable.
 *
 * `optionID` defaults to a saved-looking key so a test which does not care about newness does not
 * accidentally exercise the unsaved-row branch.
 */
function anOption(init: {
  readonly optionID?: string | undefined;
  readonly optionCode?: string | undefined;
  readonly optionName?: string | undefined;
  readonly optionDescription?: string | undefined;
  readonly sortOrder?: number | undefined;
  readonly optionGroup?: OptionGroup | undefined;
  readonly defaultImageID?: string | undefined;
  readonly remoteID?: string | undefined;
  readonly createdDateTime?: Date | undefined;
  readonly createdByAccountID?: string | undefined;
  readonly modifiedDateTime?: Date | undefined;
  readonly modifiedByAccountID?: string | undefined;
  readonly images?: readonly ImageLinkDouble[] | undefined;
  readonly assetsImageBaseUrl?: string | undefined;
  readonly promotionRewards?: PromotionReward[] | undefined;
  readonly promotionRewardExclusions?: PromotionReward[] | undefined;
  readonly promotionQualifiers?: PromotionQualifier[] | undefined;
  readonly promotionQualifierExclusions?: PromotionQualifier[] | undefined;
}): Option {
  return new Option({
    optionID: init.optionID ?? 'opt-1',
    optionCode: init.optionCode,
    optionName: init.optionName,
    optionDescription: init.optionDescription,
    sortOrder: init.sortOrder,
    optionGroup: init.optionGroup,
    defaultImageID: init.defaultImageID,
    remoteID: init.remoteID,
    createdDateTime: init.createdDateTime,
    createdByAccountID: init.createdByAccountID,
    modifiedDateTime: init.modifiedDateTime,
    modifiedByAccountID: init.modifiedByAccountID,
    images: init.images,
    assetsImageBaseUrl: init.assetsImageBaseUrl,
    promotionRewards: init.promotionRewards,
    promotionRewardExclusions: init.promotionRewardExclusions,
    promotionQualifiers: init.promotionQualifiers,
    promotionQualifierExclusions: init.promotionQualifierExclusions,
  });
}

/**
 * Builds the owning `OptionGroup` far side.
 *
 * `options` is passed in so a test can start the group EMPTY or PRE-POPULATED, which separates
 * "the guard appended" from "the guard declined to append".
 */
function aGroup(init: {
  readonly optionGroupID?: string | undefined;
  readonly options?: Option[] | undefined;
}): OptionGroup {
  return new OptionGroup({
    optionGroupID: init.optionGroupID ?? 'og-1',
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
    options: init.options ?? [],
    optionSortTieBreaker: undefined,
  });
}

/**
 * Builds the `PromotionReward` far side.
 *
 * Only the primary key is supplied; its two option collections default to FRESH empty arrays,
 * which is what makes a per-test factory genuinely isolating.
 */
function aReward(promotionRewardID = 'pr-1'): PromotionReward {
  return new PromotionReward({ promotionRewardID });
}

/**
 * Builds the `PromotionQualifier` far side. Same contract as {@link aReward}.
 */
function aQualifier(promotionQualifierID = 'pq-1'): PromotionQualifier {
  return new PromotionQualifier({ promotionQualifierID });
}

/**
 * The `optionID` of every element, in collection order.
 *
 * Membership is compared by PRIMARY KEY throughout this suite and never by object identity or deep
 * equality, which is what the ported containment predicates themselves do.
 */
function optionIDsOf(options: readonly Option[]): readonly string[] {
  return options.map((option) => option.getOptionID());
}

/**
 * The `promotionRewardID` of every element, in collection order.
 */
function rewardIDsOf(rewards: readonly PromotionReward[]): readonly string[] {
  return rewards.map((reward) => reward.getPromotionRewardID());
}

/**
 * The `promotionQualifierID` of every element, in collection order.
 */
function qualifierIDsOf(qualifiers: readonly PromotionQualifier[]): readonly string[] {
  return qualifiers.map((qualifier) => qualifier.getPromotionQualifierID());
}

/**
 * Every own member name on the class prototype, for the absence assertions.
 *
 * JUDGMENT CALL: absence is proved by scanning the prototype rather than by writing keeps its
 * meaning if someone later adds the member back.
 * `@ts-expect-error` against a call to the missing member. A prototype scan is a RUNTIME proof that
 */
function prototypeMembers(): readonly string[] {
  return Object.getOwnPropertyNames(Option.prototype);
}

describe('the persisted columns hydrate and read back exactly as declared', () => {
  it('reads back every persisted column it was hydrated with', () => {
    const created = new Date('2020-06-15T13:45:00.000Z');
    const modified = new Date('2021-11-02T08:30:00.000Z');
    const subject = anOption({
      optionID: 'opt-77',
      optionCode: 'small',
      optionName: 'Small',
      optionDescription: '<p>Fits a small frame.</p>',
      sortOrder: 12,
      defaultImageID: 'img-77',
      remoteID: 'legacy-42',
      createdDateTime: created,
      createdByAccountID: 'acct-created',
      modifiedDateTime: modified,
      modifiedByAccountID: 'acct-modified',
    });

    expect(subject.getOptionID()).toBe('opt-77');
    expect(subject.getOptionCode()).toBe('small');
    expect(subject.getOptionName()).toBe('Small');
    expect(subject.getOptionDescription()).toBe('<p>Fits a small frame.</p>');
    expect(subject.getSortOrder()).toBe(12);
    expect(subject.getDefaultImageID()).toBe('img-77');
    expect(subject.getRemoteID()).toBe('legacy-42');
    expect(subject.getCreatedDateTime()).toBe(created);
    expect(subject.getCreatedByAccountID()).toBe('acct-created');
    expect(subject.getModifiedDateTime()).toBe(modified);
    expect(subject.getModifiedByAccountID()).toBe('acct-modified');
  });

  it('reports every nullable column as undefined when it hydrated absent', () => {
    // CFML parity [model/entity/Option.cfc:L53-L56, L60, L73, L76-L79]: not one of these
    // declarations carries `required` or a `default`, so every one of them can hydrate as SQL
    // NULL.
    const subject = anOption({});

    expect(subject.getOptionCode()).toBeUndefined();
    expect(subject.getOptionName()).toBeUndefined();
    expect(subject.getOptionDescription()).toBeUndefined();
    expect(subject.getSortOrder()).toBeUndefined();
    expect(subject.getDefaultImageID()).toBeUndefined();
    expect(subject.getRemoteID()).toBeUndefined();
    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();
  });

  it('carries optionDescription as opaque stored text, with no rendering behaviour', () => {
    // CFML parity [model/entity/Option.cfc:L55]: `length="4000" hb_formFieldType="wysiwyg"`. Both
    // attributes are inert.
    const markup = '<h1>Small</h1><script>alert("x")</script>';
    const overlong = 'x'.repeat(4001);

    expect(anOption({ optionDescription: markup }).getOptionDescription()).toBe(markup);
    expect(anOption({ optionDescription: overlong }).getOptionDescription()).toHaveLength(4001);
  });

  it('treats defaultImageID as an inert persisted identifier with no image behaviour', () => {
    const subject = anOption({ defaultImageID: 'img-abc' });

    expect(subject.getDefaultImageID()).toBe('img-abc');
    expect(prototypeMembers()).not.toContain('getDefaultImage');
    expect(prototypeMembers()).not.toContain('setDefaultImage');
  });
});

describe('isNew() keys on the empty optionID, which unsavedvalue="" makes load-bearing', () => {
  // `default=""` means the column always holds a string, possibly the empty one, and
  // `unsavedvalue=""` is what makes that empty string load-bearing.
  it('reports true for the empty key and false for a populated one', () => {
    expect(anOption({ optionID: '' }).isNew()).toBe(true);
    expect(anOption({ optionID: 'opt-9' }).isNew()).toBe(false);
  });

  it('never mints a key of its own, because generator="uuid" is a persistence instruction', () => {
    // The hydrating repository supplies the value; the entity mints none, so an unsaved option
    // stays unsaved no matter what is asked of it.
    const subject = anOption({ optionID: '' });

    expect(subject.getOptionID()).toBe('');
    subject.setOptionGroup(aGroup({}));
    expect(subject.getOptionID()).toBe('');
    expect(subject.isNew()).toBe(true);
  });
});

describe('the audit timestamps are Date | undefined and never an epoch stand-in', () => {
  // An absent timestamp is `undefined`, never `new Date(0)`: the epoch is a real instant that
  // compares, formats and sorts like data.
  it('hands back the exact instant it was hydrated with, unrounded and unshifted', () => {
    const created = new Date('2019-02-28T23:59:59.999Z');
    const subject = anOption({ createdDateTime: created });

    expect(subject.getCreatedDateTime()).toBe(created);
    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2019-02-28T23:59:59.999Z');
  });

  it('reports an absent timestamp as undefined rather than as the epoch', () => {
    const subject = anOption({});

    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
    expect(subject.getCreatedDateTime()).not.toEqual(new Date(0));
    expect(subject.getModifiedDateTime()).not.toEqual(new Date(0));
  });

  it('reduces both audit Account associations to opaque identifiers', () => {
    const subject = anOption({
      createdByAccountID: 'acct-1',
      modifiedByAccountID: 'acct-2',
    });

    expect(subject.getCreatedByAccountID()).toBe('acct-1');
    expect(subject.getModifiedByAccountID()).toBe('acct-2');
    expect(prototypeMembers()).not.toContain('getCreatedByAccount');
    expect(prototypeMembers()).not.toContain('getModifiedByAccount');
  });
});

describe('sortOrder retains sortContext="optionGroup" and is legitimately absent', () => {
  // CFML parity [model/entity/Option.cfc:L56]: sortOrder carries sortContext="optionGroup" -
  // ordering is scoped per option group, not globally. Unlike OptionGroup.cfc:L58 it is not
  // required="true" and has no default, so undefined is a legitimate value.
  //
  // LEGACY-NOTE [model/dao/SkuDAO.cfc:L192-L197]: the missing `required` has a consequence
  // invisible from the entity alone.
  it('is undefined on an option hydrated without the column', () => {
    expect(anOption({}).getSortOrder()).toBeUndefined();
  });

  it('keeps zero as zero, because no default and no required means 0 is a real ordinal', () => {
    // `0` and `undefined` are different facts and must not collapse: the first is "first in its
    // group", the second is "unordered".
    expect(anOption({ sortOrder: 0 }).getSortOrder()).toBe(0);
    expect(anOption({ sortOrder: 0 }).getSortOrder()).not.toBeUndefined();
  });

  it('accepts a negative ordinal, since ormtype="integer" is signed and unconstrained', () => {
    // model/validation/Option.json declares no rule for `sortOrder` at all - no `required`, no
    // `minValue`, no `dataType`.
    expect(anOption({ sortOrder: -5 }).getSortOrder()).toBe(-5);
  });

  it('lets two options in DIFFERENT groups share one ordinal, which is what the scoping permits', () => {
    // The scoping stated as an assertion rather than only as prose: the same ordinal in two groups
    // is legal, so nothing on the entity may treat `sortOrder` as globally unique.
    const small = anOption({ optionID: 'opt-small', sortOrder: 1 });
    const red = anOption({ optionID: 'opt-red', sortOrder: 1 });

    aGroup({ optionGroupID: 'og-size', options: [] }).addOption(small);
    aGroup({ optionGroupID: 'og-colour', options: [] }).addOption(red);

    expect(small.getSortOrder()).toBe(1);
    expect(red.getSortOrder()).toBe(1);
    expect(small.getOptionGroup()?.getOptionGroupID()).toBe('og-size');
    expect(red.getOptionGroup()?.getOptionGroupID()).toBe('og-colour');
  });
});

describe('ENTITY_CODE_PATTERN is the optionCode format constraint', () => {
  // The subject module deliberately does not import it either: an entity enforces no validation,
  // so the import would bind no emitted reference and `noUnusedLocals` would fail the build.
  it('is exactly the schema regex, source and flags alike', () => {
    expect(ENTITY_CODE_PATTERN.source).toBe('^[a-zA-Z0-9-_.|:~^]+$');
    expect(ENTITY_CODE_PATTERN.flags).toBe('');
  });

  it('carries no g or y flag, so the shared instance holds no lastIndex state', () => {
    // A `g`/`y` instance mutates `lastIndex` on every `test`, so one of the three consumers could
    // change another's result.
    expect(ENTITY_CODE_PATTERN.global).toBe(false);
    expect(ENTITY_CODE_PATTERN.sticky).toBe(false);
    expect(ENTITY_CODE_PATTERN.test('small')).toBe(true);
    expect(ENTITY_CODE_PATTERN.test('small')).toBe(true);
    expect(ENTITY_CODE_PATTERN.lastIndex).toBe(0);
  });

  it('accepts the alphanumerics and the seven permitted punctuation characters', () => {
    // Reading the character class precisely: after `0-9` the `-` is a LITERAL hyphen and not the
    // start of a range, and `.`, `|`, `^` and `~` are literal inside a class.
    for (const accepted of [
      'small',
      'SMALL',
      'Small01',
      '0',
      'a-b',
      'a_b',
      'a.b',
      'a|b',
      'a:b',
      'a~b',
      'a^b',
      'small-01_v.2|x:y~z^w',
    ]) {
      expect(ENTITY_CODE_PATTERN.test(accepted)).toBe(true);
      expect(anOption({ optionCode: accepted }).getOptionCode()).toBe(accepted);
    }
  });

  it('rejects a space, a slash and the empty string', () => {
    // `+` requires at least one character, so `''` fails; the anchors make a single offending
    // character anywhere in the value fail the whole code.
    for (const rejected of [
      '',
      ' ',
      'a b',
      ' small',
      'small ',
      'a/b',
      'a\\b',
      'a,b',
      'a;b',
      'a+b',
      'a*b',
      'a%b',
      'a#b',
      'a(b)',
      'a\tb',
      'a\nb',
    ]) {
      expect(ENTITY_CODE_PATTERN.test(rejected)).toBe(false);
    }
  });

  it('does not itself police the column, because the entity enforces no validation', () => {
    // A `save`-context rule constrains what may be WRITTEN and says nothing about what an existing
    // row may contain, so the entity accepts a code the regex would reject and the service tier is
    // what refuses to save it.
    expect(ENTITY_CODE_PATTERN.test('not a valid code')).toBe(false);
    expect(anOption({ optionCode: 'not a valid code' }).getOptionCode()).toBe('not a valid code');
  });
});

describe('the save-context requirements are representable, and the delete gate reads `skus`', () => {
  // Every rule is enforced OUTSIDE this class: `required` and the format constraint by the ported
  // zod schema at the service tier, `unique` by the repository because uniqueness needs the
  // database.
  it('represents each of the three save-context properties as present', () => {
    const subject = anOption({
      optionCode: 'small',
      optionName: 'Small',
      optionGroup: aGroup({}),
    });

    expect(subject.getOptionCode()).toBe('small');
    expect(subject.getOptionName()).toBe('Small');
    expect(subject.getOptionGroup()).toBeDefined();
  });

  it('represents each of the three save-context properties as absent', () => {
    const subject = anOption({});

    expect(subject.getOptionCode()).toBeUndefined();
    expect(subject.getOptionName()).toBeUndefined();
    expect(subject.getOptionGroup()).toBeUndefined();
  });

  it('counts an empty `skus` association as zero, which the delete gate permits', () => {
    // `maxCollection: 0` refuses the delete while any SKU references the option, so the gate's
    // INPUT is the materialized collection - and zero is the permitting value.
    expect(anOption({}).getSkus()).toHaveLength(0);
  });

  it('hosts no validation or deletability member, because those live at the service tier', () => {
    expect(prototypeMembers()).not.toContain('isDeletable');
    expect(prototypeMembers()).not.toContain('getSkusDeletableFlag');
    expect(prototypeMembers()).not.toContain('validate');
  });
});

describe('setOptionGroup assigns the near side and appends to the far side', () => {
  // The far-side `arrayAppend` symmetry and its guard are both reproduced.
  //
  // The near side is the only MUTABLE field on this entity; every other field is `readonly`,
  // required because L93 assigns it and L106 clears it.
  it('assigns the near side and appends this option to the group collection', () => {
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(group);

    expect(subject.getOptionGroup()).toBe(group);
    expect(optionIDsOf(group.getOptions())).toEqual(['opt-1']);
  });

  it('is reached identically through OptionGroup.addOption, which only delegates', () => {
    // CFML parity [model/entity/OptionGroup.cfc:L91-L93]: `addOption` calls
    // `arguments.option.setOptionGroup( this )` and nothing else.
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    group.addOption(subject);

    expect(subject.getOptionGroup()).toBe(group);
    expect(optionIDsOf(group.getOptions())).toEqual(['opt-1']);
  });

  it('declines to append a SAVED option twice, because the L94 guard sees it already there', () => {
    // For a saved row the guard is effective: `isNew()` is false, so
    // `!optionGroup.hasOption(this)` decides, and `hasOption` compares on `optionID`.
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(group);
    subject.setOptionGroup(group);

    expect(optionIDsOf(group.getOptions())).toEqual(['opt-1']);
  });

  it('declines to append when a DIFFERENT instance carrying the same key is already held', () => {
    // Membership is by PRIMARY KEY, not identity, so a re-hydrated instance of the same row is
    // recognised as already present. The near side is still reassigned - L93 runs unconditionally,
    // ahead of the guard.
    const alreadyHeld = anOption({ optionID: 'opt-1' });
    const group = aGroup({ options: [alreadyHeld] });
    const rehydrated = anOption({ optionID: 'opt-1' });

    rehydrated.setOptionGroup(group);

    expect(rehydrated.getOptionGroup()).toBe(group);
    expect(group.getOptions()).toHaveLength(1);
    expect(group.getOptions()[0]).toBe(alreadyHeld);
  });

  // LEGACY-NOTE [model/entity/Option.cfc:L94]: the guard is.
  //
  // It is a LEGACY-NOTE and not a LEGACY-DEFECT because it is not a member of the register's
  // thirty numbered entries, and because the source's reasoning is visible: an unsaved row has the
  // empty key.
  it('appends an UNSAVED option twice, because isNew() short-circuits the guard', () => {
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: '' });

    subject.setOptionGroup(group);
    subject.setOptionGroup(group);

    expect(group.getOptions()).toHaveLength(2);
    expect(optionIDsOf(group.getOptions())).toEqual(['', '']);
    expect(group.getOptions()[0]).toBe(subject);
    expect(group.getOptions()[1]).toBe(subject);
  });

  it('reassigns the near side when moved to another group, without unlinking the first', () => {
    // LEGACY-NOTE [model/entity/Option.cfc:L92-L97]: `setOptionGroup` never removes the option
    // from a previously-assigned group - there is no such statement in the source.
    const first = aGroup({ optionGroupID: 'og-first', options: [] });
    const second = aGroup({ optionGroupID: 'og-second', options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(first);
    subject.setOptionGroup(second);

    expect(subject.getOptionGroup()).toBe(second);
    expect(optionIDsOf(first.getOptions())).toEqual(['opt-1']);
    expect(optionIDsOf(second.getOptions())).toEqual(['opt-1']);
  });
});

describe('removeOptionGroup defaults its argument, and clears the near side UNCONDITIONALLY', () => {
  // The parameter is `any optionGroup` and not `required`, which is what makes the L99-L101
  // defaulting reachable at all.
  //
  // JUDGMENT CALL on the index translation. CFML's `arrayFind` returns 0 when absent, so the L103
  // test `index > 0` is the correct absent-test there.
  it('removes an explicitly-named group and clears the near side', () => {
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(group);
    subject.removeOptionGroup(group);

    expect(subject.getOptionGroup()).toBeUndefined();
    expect(group.getOptions()).toHaveLength(0);
  });

  it('falls back to the currently-assigned group when called with no argument', () => {
    // The L99-L101 branch, reproduced in the target as a `!== undefined` test on the optional
    // parameter rather than as CFML's `structKeyExists(arguments,...)`.
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(group);
    subject.removeOptionGroup();

    expect(subject.getOptionGroup()).toBeUndefined();
    expect(group.getOptions()).toHaveLength(0);
  });

  it('removes the element at index 0, which a `> 0` index test would wrongly skip', () => {
    // The regression guard for the JUDGMENT CALL above: the option under test is the FIRST element
    // of the collection.
    const subject = anOption({ optionID: 'opt-first' });
    const group = aGroup({ options: [subject, anOption({ optionID: 'opt-second' })] });

    subject.setOptionGroup(group);
    expect(optionIDsOf(group.getOptions())).toEqual(['opt-first', 'opt-second']);

    subject.removeOptionGroup(group);

    expect(optionIDsOf(group.getOptions())).toEqual(['opt-second']);
  });

  it('matches the element to remove by PRIMARY KEY, not by object identity', () => {
    const held = anOption({ optionID: 'opt-1' });
    const group = aGroup({ options: [held] });
    const rehydrated = anOption({ optionID: 'opt-1', optionGroup: group });

    rehydrated.removeOptionGroup(group);

    expect(group.getOptions()).toHaveLength(0);
    expect(rehydrated.getOptionGroup()).toBeUndefined();
  });

  // CFML parity [model/entity/Option.cfc:L103-L106]: the arrayDeleteAt at L104 is guarded by the
  // `index > 0` test, but the structDelete at L106 is UNCONDITIONAL - the near-side association is
  // dropped even when the far side never held this option.
  it('clears the near side even when the named group never held this option', () => {
    const assigned = aGroup({ optionGroupID: 'og-assigned', options: [] });
    const stranger = aGroup({ optionGroupID: 'og-stranger', options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(assigned);
    expect(subject.getOptionGroup()).toBe(assigned);

    subject.removeOptionGroup(stranger);

    // The near side is gone although the stranger group was untouched, and although the option is
    // still sitting in the collection of the group it was actually assigned to.
    expect(subject.getOptionGroup()).toBeUndefined();
    expect(stranger.getOptions()).toHaveLength(0);
    expect(optionIDsOf(assigned.getOptions())).toEqual(['opt-1']);
  });

  it('clears the near side when the assigned group holds no options at all', () => {
    // The same unconditional clear, reached by the other route to `index === -1`: the collection
    // is empty, so there is nothing to splice and L106 still runs.
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1', optionGroup: group });

    subject.removeOptionGroup();

    expect(subject.getOptionGroup()).toBeUndefined();
    expect(group.getOptions()).toHaveLength(0);
  });

  it('is idempotent on the near side, and the second call has no group to resolve', () => {
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(group);
    subject.removeOptionGroup(group);
    subject.removeOptionGroup(group);

    expect(subject.getOptionGroup()).toBeUndefined();
    expect(group.getOptions()).toHaveLength(0);
  });

  it('raises when called with no argument on an option that has no group', () => {
    // LEGACY-NOTE [model/entity/Option.cfc:L99-L102]: with the argument omitted and
    // `variables.optionGroup` never set, L100 assigns null and L102 then calls `getOptions()` on
    // that null before any index guard runs.
    const subject = anOption({ optionID: 'opt-1' });

    expect(() => {
      subject.removeOptionGroup();
    }).toThrow(/no argument on an option that has no/i);
  });

  it('is reached identically through OptionGroup.removeOption, which only delegates', () => {
    // CFML parity [model/entity/OptionGroup.cfc:L94-L96]: `removeOption` calls
    // `arguments.option.removeOptionGroup( this )` and nothing else.
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    group.addOption(subject);
    group.removeOption(subject);

    expect(subject.getOptionGroup()).toBeUndefined();
    expect(group.getOptions()).toHaveLength(0);
  });
});

describe('the five many-to-many-inverse collections and their abbreviated link tables', () => {
  // The source abbreviates `Promotion` to `Promo`, `Qualifier` to `Qual` and `Exclusion` to
  // `Excl`.
  //
  // For both `promotionRewards` `AND` `promotionQualifiers` - hence four promotion collections
  // where its siblings have one or two.
  //
  // A source inconsistency, annotated and deliberately not normalised: only L68 and L70 declare
  // `type="array"`.
  it('exposes all five collection accessors', () => {
    const subject = anOption({});

    expect(typeof subject.getSkus).toBe('function');
    expect(typeof subject.getPromotionRewards).toBe('function');
    expect(typeof subject.getPromotionRewardExclusions).toBe('function');
    expect(typeof subject.getPromotionQualifiers).toBe('function');
    expect(typeof subject.getPromotionQualifierExclusions).toBe('function');
  });

  it('materializes every collection as empty when the repository fetched none', () => {
    // An empty result is a fetch-shape statement, not a domain claim.
    const subject = anOption({});

    expect(subject.getSkus()).toHaveLength(0);
    expect(subject.getPromotionRewards()).toHaveLength(0);
    expect(subject.getPromotionRewardExclusions()).toHaveLength(0);
    expect(subject.getPromotionQualifiers()).toHaveLength(0);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(0);
  });

  it('gives every instance its own collections, so no fixture is shared between rows', () => {
    const first = anOption({ optionID: 'opt-1' });
    const second = anOption({ optionID: 'opt-2' });

    expect(first.getPromotionRewards()).not.toBe(second.getPromotionRewards());
    expect(first.getPromotionRewardExclusions()).not.toBe(second.getPromotionRewardExclusions());
    expect(first.getPromotionQualifiers()).not.toBe(second.getPromotionQualifiers());
    expect(first.getPromotionQualifierExclusions()).not.toBe(
      second.getPromotionQualifierExclusions(),
    );
  });

  it('reads back the four promotion collections it was hydrated with', () => {
    const subject = anOption({
      promotionRewards: [aReward('pr-included')],
      promotionRewardExclusions: [aReward('pr-excluded')],
      promotionQualifiers: [aQualifier('pq-included')],
      promotionQualifierExclusions: [aQualifier('pq-excluded')],
    });

    expect(rewardIDsOf(subject.getPromotionRewards())).toEqual(['pr-included']);
    expect(rewardIDsOf(subject.getPromotionRewardExclusions())).toEqual(['pr-excluded']);
    expect(qualifierIDsOf(subject.getPromotionQualifiers())).toEqual(['pq-included']);
    expect(qualifierIDsOf(subject.getPromotionQualifierExclusions())).toEqual(['pq-excluded']);
  });

  it('keeps the inclusion and exclusion sides strictly separate', () => {
    // The two sides are different link tables and mean opposite things, so a reward on the include
    // side must never appear on the exclude side by accident.
    const subject = anOption({
      promotionRewards: [aReward('pr-1')],
      promotionQualifiers: [aQualifier('pq-1')],
    });

    expect(rewardIDsOf(subject.getPromotionRewards())).toEqual(['pr-1']);
    expect(subject.getPromotionRewardExclusions()).toHaveLength(0);
    expect(qualifierIDsOf(subject.getPromotionQualifiers())).toEqual(['pq-1']);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(0);
  });

  it('answers the four containment predicates by PRIMARY KEY, not by identity', () => {
    // Every predicate compares the far side's own primary key, so a re-hydrated instance of the
    // same row answers true.
    const subject = anOption({
      promotionRewards: [aReward('pr-1')],
      promotionRewardExclusions: [aReward('pr-2')],
      promotionQualifiers: [aQualifier('pq-1')],
      promotionQualifierExclusions: [aQualifier('pq-2')],
    });

    expect(subject.hasPromotionReward(aReward('pr-1'))).toBe(true);
    expect(subject.hasPromotionReward(aReward('pr-2'))).toBe(false);
    expect(subject.hasPromotionRewardExclusion(aReward('pr-2'))).toBe(true);
    expect(subject.hasPromotionRewardExclusion(aReward('pr-1'))).toBe(false);
    expect(subject.hasPromotionQualifier(aQualifier('pq-1'))).toBe(true);
    expect(subject.hasPromotionQualifier(aQualifier('pq-2'))).toBe(false);
    expect(subject.hasPromotionQualifierExclusion(aQualifier('pq-2'))).toBe(true);
    expect(subject.hasPromotionQualifierExclusion(aQualifier('pq-1'))).toBe(false);
  });

  it('answers false for every predicate on an option with no promotion associations', () => {
    const subject = anOption({});

    expect(subject.hasPromotionReward(aReward())).toBe(false);
    expect(subject.hasPromotionRewardExclusion(aReward())).toBe(false);
    expect(subject.hasPromotionQualifier(aQualifier())).toBe(false);
    expect(subject.hasPromotionQualifierExclusion(aQualifier())).toBe(false);
  });

  it('falls back to object identity when the FAR SIDE is unsaved and has no primary key', () => {
    // CFML parity [model/entity/Option.cfc:L66-L70]: a key-only probe cannot work on an UNSAVED
    // far side, because `unsavedvalue=""` means every unsaved reward and every unsaved qualifier
    // carries the same empty primary key.
    const heldReward: PromotionReward = new PromotionReward({ promotionRewardID: '' });
    const heldExcludedReward: PromotionReward = new PromotionReward({ promotionRewardID: '' });
    const heldQualifier: PromotionQualifier = new PromotionQualifier({
      promotionQualifierID: '',
    });
    const heldExcludedQualifier: PromotionQualifier = new PromotionQualifier({
      promotionQualifierID: '',
    });

    const subject = anOption({
      promotionRewards: [heldReward],
      promotionRewardExclusions: [heldExcludedReward],
      promotionQualifiers: [heldQualifier],
      promotionQualifierExclusions: [heldExcludedQualifier],
    });

    // Every far side really is unsaved, so every probe takes the identity branch.
    expect(heldReward.isNew()).toBe(true);
    expect(heldQualifier.isNew()).toBe(true);

    // The same instance is located.
    expect(subject.hasPromotionReward(heldReward)).toBe(true);
    expect(subject.hasPromotionRewardExclusion(heldExcludedReward)).toBe(true);
    expect(subject.hasPromotionQualifier(heldQualifier)).toBe(true);
    expect(subject.hasPromotionQualifierExclusion(heldExcludedQualifier)).toBe(true);

    // A DIFFERENT unsaved instance is not, even though its key is identically empty - which is
    // precisely what a key comparison would have got wrong.
    expect(subject.hasPromotionReward(new PromotionReward({ promotionRewardID: '' }))).toBe(false);
    expect(subject.hasPromotionReward(heldExcludedReward)).toBe(false);
    expect(subject.hasPromotionRewardExclusion(heldReward)).toBe(false);
    expect(
      subject.hasPromotionQualifier(new PromotionQualifier({ promotionQualifierID: '' })),
    ).toBe(false);
    expect(subject.hasPromotionQualifier(heldExcludedQualifier)).toBe(false);
    expect(subject.hasPromotionQualifierExclusion(heldQualifier)).toBe(false);
  });

  it('declares addSku and removeSku, whose ROUND TRIP is asserted in the block below', () => {
    const subject = anOption({});

    expect(typeof subject.addSku).toBe('function');
    expect(typeof subject.removeSku).toBe('function');
    expect(prototypeMembers()).toContain('addSku');
    expect(prototypeMembers()).toContain('removeSku');
  });

  it('publishes no add/remove pair for the SKU collection beyond that one', () => {
    // No `addOption`/`removeOption` on this entity: those belong to the far sides.
    expect(prototypeMembers()).not.toContain('addOption');
    expect(prototypeMembers()).not.toContain('removeOption');
    expect(prototypeMembers()).not.toContain('addExcludedOption');
    expect(prototypeMembers()).not.toContain('removeExcludedOption');
  });
});

describe('addSku and removeSku, as round trips through the OWNING side', () => {
  const anOptionInAGroup = (optionID: string, optionGroupID = 'og-1'): Option =>
    anOption({
      optionID,
      optionName: `Option ${optionID}`,
      optionGroup: aGroup({ optionGroupID }),
    });

  it('★★ addSku puts this option on the SKU, and removeSku takes it off again', () => {
    const sku = makeSkuFixture({ skuID: 'sku-1', options: [] });
    const option = anOptionInAGroup('option-1');

    expect(sku.getOptions()).toHaveLength(0);

    option.addSku(sku);

    // The owning side holds the array [model/entity/Sku.cfc:L76], so this is where the link
    // appears.
    expect(sku.getOptions()).toEqual([option]);
    expect(sku.hasOption(option)).toBe(true);

    option.removeSku(sku);

    expect(sku.getOptions()).toHaveLength(0);
    expect(sku.hasOption(option)).toBe(false);
  });

  it('★★ and it goes THROUGH Sku.addOption, so the option memos are invalidated with it', () => {
    // The property that separates a real delegation from an array push: `Sku.addOption`
    // invalidates the four option-derived memos, so a struct read before the link and one after it
    // must differ.
    const sku = makeSkuFixture({ skuID: 'sku-1', options: [] });
    const option = anOptionInAGroup('option-1', 'og-size');

    expect(sku.getOptionsByOptionGroupIDStruct()).toEqual({});

    option.addSku(sku);

    expect(sku.getOptionsByOptionGroupIDStruct()).toEqual({ 'og-size': option });

    option.removeSku(sku);

    expect(sku.getOptionsByOptionGroupIDStruct()).toEqual({});
  });

  it('★★ a second addSku adds nothing more, because the owning side is guarded by hasOption', () => {
    const sku = makeSkuFixture({ skuID: 'sku-1', options: [] });
    const option = anOptionInAGroup('option-1');

    option.addSku(sku);
    option.addSku(sku);

    // `if(isNew() or !hasOption(option))` on the far side, so a saved SKU cannot acquire a
    // duplicate `SwSkuOption` row through this path.
    expect(sku.getOptions()).toHaveLength(1);
  });

  it('★ removeSku matches by optionID, so a RE-HYDRATED option removes the held one', () => {
    // Two instances describing the same row are the same association member, which is the shape a
    // repository read produces: `Sku.removeOption` compares `optionID` rather than identity.
    const held = anOptionInAGroup('option-1');
    const sku = makeSkuFixture({ skuID: 'sku-1', options: [held] });

    anOptionInAGroup('option-1').removeSku(sku);

    expect(sku.getOptions()).toHaveLength(0);
  });

  it('removing an option the SKU never held leaves it untouched rather than throwing', () => {
    const held = anOptionInAGroup('option-1');
    const sku = makeSkuFixture({ skuID: 'sku-1', options: [held] });

    expect(() => {
      anOptionInAGroup('option-2').removeSku(sku);
    }).not.toThrow();

    expect(sku.getOptions()).toEqual([held]);
  });
});

describe('the INCLUSION-side helpers delegate correctly - the control cases', () => {
  it('addPromotionReward links both sides through the far-side addOption', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.addPromotionReward(reward);

    expect(reward.hasOption(subject)).toBe(true);
    expect(optionIDsOf(reward.getOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionReward(reward)).toBe(true);
    expect(rewardIDsOf(subject.getPromotionRewards())).toEqual(['pr-1']);
  });

  it('removePromotionReward genuinely WITHDRAWS from both sides', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.addPromotionReward(reward);
    subject.removePromotionReward(reward);

    expect(reward.hasOption(subject)).toBe(false);
    expect(reward.getOptions()).toHaveLength(0);
    expect(subject.hasPromotionReward(reward)).toBe(false);
    expect(subject.getPromotionRewards()).toHaveLength(0);
  });

  it('addPromotionQualifier links both sides through the far-side addOption', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const qualifier = aQualifier('pq-1');

    subject.addPromotionQualifier(qualifier);

    expect(qualifier.hasOption(subject)).toBe(true);
    expect(optionIDsOf(qualifier.getOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionQualifier(qualifier)).toBe(true);
    expect(qualifierIDsOf(subject.getPromotionQualifiers())).toEqual(['pq-1']);
  });

  it('removePromotionQualifier genuinely WITHDRAWS from both sides', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const qualifier = aQualifier('pq-1');

    subject.addPromotionQualifier(qualifier);
    subject.removePromotionQualifier(qualifier);

    expect(qualifier.hasOption(subject)).toBe(false);
    expect(qualifier.getOptions()).toHaveLength(0);
    expect(subject.hasPromotionQualifier(qualifier)).toBe(false);
    expect(subject.getPromotionQualifiers()).toHaveLength(0);
  });

  it('leaves the EXCLUSION collections untouched, since these four are the include side', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');
    const qualifier = aQualifier('pq-1');

    subject.addPromotionReward(reward);
    subject.addPromotionQualifier(qualifier);

    expect(subject.getPromotionRewardExclusions()).toHaveLength(0);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(0);
    expect(reward.getExcludedOptions()).toHaveLength(0);
    expect(qualifier.getExcludedOptions()).toHaveLength(0);
  });

  it('adds the INCLUSION side idempotently for a saved option', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.addPromotionReward(reward);
    subject.addPromotionReward(reward);

    expect(optionIDsOf(reward.getOptions())).toEqual(['opt-1']);
    expect(rewardIDsOf(subject.getPromotionRewards())).toEqual(['pr-1']);
  });
});

describe('H21 - the two EXCLUSION `remove*` helpers ADD, so an exclusion cannot be withdrawn', () => {
  // Both verified verbatim in the source, both observable through the public contract, and both
  // reproduced rather than repaired.
  //
  // Why this is an inversion and not merely a double append.

  it('addPromotionRewardExclusion excludes the option on both sides, as intended', () => {
    // CFML parity [model/entity/Option.cfc:L126-L128]: the `add` side is correct.
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.addPromotionRewardExclusion(reward);

    expect(reward.hasExcludedOption(subject)).toBe(true);
    expect(optionIDsOf(reward.getExcludedOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionRewardExclusion(reward)).toBe(true);
    expect(rewardIDsOf(subject.getPromotionRewardExclusions())).toEqual(['pr-1']);
  });

  // LEGACY-DEFECT [model/entity/Option.cfc:L129-L131]: removePromotionRewardExclusion calls
  // addExcludedOption at L130 instead of removeExcludedOption, so a "remove" ADDS.
  // Preserved deliberately; do not fix without a product decision.
  it('removePromotionRewardExclusion leaves the exclusion PRESENT - it never withdraws it', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.addPromotionRewardExclusion(reward);
    subject.removePromotionRewardExclusion(reward);

    // Still excluded, on both sides, after being asked to remove the exclusion.
    expect(reward.hasExcludedOption(subject)).toBe(true);
    expect(optionIDsOf(reward.getExcludedOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionRewardExclusion(reward)).toBe(true);
    expect(rewardIDsOf(subject.getPromotionRewardExclusions())).toEqual(['pr-1']);
  });

  // LEGACY-DEFECT [model/entity/Option.cfc:L129-L131]: the same inversion, asserted from the other
  // direction.
  // Preserved deliberately; do not fix without a product decision.
  it('removePromotionRewardExclusion CREATES an exclusion that did not exist', () => {
    // The sharpest reading of the defect: no `add` first. A single `remove*` call on an unlinked
    // pair establishes the exclusion, because the body is the add.
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    expect(reward.hasExcludedOption(subject)).toBe(false);

    subject.removePromotionRewardExclusion(reward);

    expect(reward.hasExcludedOption(subject)).toBe(true);
    expect(optionIDsOf(reward.getExcludedOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionRewardExclusion(reward)).toBe(true);
  });

  it('never withdraws the reward exclusion however many times it is asked', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.addPromotionRewardExclusion(reward);
    subject.removePromotionRewardExclusion(reward);
    subject.removePromotionRewardExclusion(reward);
    subject.removePromotionRewardExclusion(reward);

    expect(reward.hasExcludedOption(subject)).toBe(true);
    expect(reward.getExcludedOptions()).toHaveLength(1);
    expect(subject.getPromotionRewardExclusions()).toHaveLength(1);
  });

  // LEGACY-NOTE [model/entity/Option.cfc:L130] with [model/entity/PromotionReward.cfc:L318-L325]:
  // the SECONDARY symptom, and the one the upstream "double-append" framing was reaching for. The
  // far-side guard is.
  //
  // And `or` short-circuits, so for an UNSAVED option the containment test never runs and the
  // inverted `remove` appends a second copy.
  it('appends a DUPLICATE exclusion for an unsaved option, asymmetrically', () => {
    const subject = anOption({ optionID: '' });
    const reward = aReward('pr-1');

    subject.addPromotionRewardExclusion(reward);
    subject.removePromotionRewardExclusion(reward);

    expect(reward.getExcludedOptions()).toHaveLength(2);
    expect(optionIDsOf(reward.getExcludedOptions())).toEqual(['', '']);
    expect(subject.getPromotionRewardExclusions()).toHaveLength(1);
  });

  it('proves the correct far-side member exists and works - it was simply never reached', () => {
    // `PromotionReward.removeExcludedOption` [model/entity/PromotionReward.cfc:L326-L335] is what
    // L130 SHOULD have called, and it withdraws from both sides exactly as expected.
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.addPromotionRewardExclusion(reward);
    reward.removeExcludedOption(subject);

    expect(reward.hasExcludedOption(subject)).toBe(false);
    expect(reward.getExcludedOptions()).toHaveLength(0);
    expect(subject.hasPromotionRewardExclusion(reward)).toBe(false);
    expect(subject.getPromotionRewardExclusions()).toHaveLength(0);
  });

  it('addPromotionQualifierExclusion excludes the option on both sides, as intended', () => {
    // CFML parity [model/entity/Option.cfc:L142-L144]: the `add` side is correct here too.
    const subject = anOption({ optionID: 'opt-1' });
    const qualifier = aQualifier('pq-1');

    subject.addPromotionQualifierExclusion(qualifier);

    expect(qualifier.hasExcludedOption(subject)).toBe(true);
    expect(optionIDsOf(qualifier.getExcludedOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionQualifierExclusion(qualifier)).toBe(true);
    expect(qualifierIDsOf(subject.getPromotionQualifierExclusions())).toEqual(['pq-1']);
  });

  // LEGACY-DEFECT [model/entity/Option.cfc:L145-L147]: removePromotionQualifierExclusion calls
  // addExcludedOption at L146 instead of removeExcludedOption, so a "remove" ADDS.
  // Preserved deliberately; do not fix without a product decision.
  it('removePromotionQualifierExclusion leaves the exclusion PRESENT - it never withdraws it', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const qualifier = aQualifier('pq-1');

    subject.addPromotionQualifierExclusion(qualifier);
    subject.removePromotionQualifierExclusion(qualifier);

    expect(qualifier.hasExcludedOption(subject)).toBe(true);
    expect(optionIDsOf(qualifier.getExcludedOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionQualifierExclusion(qualifier)).toBe(true);
    expect(qualifierIDsOf(subject.getPromotionQualifierExclusions())).toEqual(['pq-1']);
  });

  // LEGACY-DEFECT [model/entity/Option.cfc:L145-L147]: the same inversion, asserted from the other
  // direction.
  // Preserved deliberately; do not fix without a product decision.
  it('removePromotionQualifierExclusion CREATES an exclusion that did not exist', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const qualifier = aQualifier('pq-1');

    expect(qualifier.hasExcludedOption(subject)).toBe(false);

    subject.removePromotionQualifierExclusion(qualifier);

    expect(qualifier.hasExcludedOption(subject)).toBe(true);
    expect(optionIDsOf(qualifier.getExcludedOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionQualifierExclusion(qualifier)).toBe(true);
  });

  it('never withdraws the qualifier exclusion however many times it is asked', () => {
    const subject = anOption({ optionID: 'opt-1' });
    const qualifier = aQualifier('pq-1');

    subject.addPromotionQualifierExclusion(qualifier);
    subject.removePromotionQualifierExclusion(qualifier);
    subject.removePromotionQualifierExclusion(qualifier);
    subject.removePromotionQualifierExclusion(qualifier);

    expect(qualifier.hasExcludedOption(subject)).toBe(true);
    expect(qualifier.getExcludedOptions()).toHaveLength(1);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(1);
  });

  // LEGACY-NOTE [model/entity/Option.cfc:L146] with
  // [model/entity/PromotionQualifier.cfc:L261-L266]: the same secondary symptom on the qualifier
  // side, for the same short-circuit reason.
  it('appends a DUPLICATE qualifier exclusion for an unsaved option, asymmetrically', () => {
    const subject = anOption({ optionID: '' });
    const qualifier = aQualifier('pq-1');

    subject.addPromotionQualifierExclusion(qualifier);
    subject.removePromotionQualifierExclusion(qualifier);

    expect(qualifier.getExcludedOptions()).toHaveLength(2);
    expect(optionIDsOf(qualifier.getExcludedOptions())).toEqual(['', '']);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(1);
  });

  it('proves the correct qualifier far-side member exists and works', () => {
    // `PromotionQualifier.removeExcludedOption` [model/entity/PromotionQualifier.cfc:L269-L276] is
    // what L146 should have called.
    const subject = anOption({ optionID: 'opt-1' });
    const qualifier = aQualifier('pq-1');

    subject.addPromotionQualifierExclusion(qualifier);
    qualifier.removeExcludedOption(subject);

    expect(qualifier.hasExcludedOption(subject)).toBe(false);
    expect(qualifier.getExcludedOptions()).toHaveLength(0);
    expect(subject.hasPromotionQualifierExclusion(qualifier)).toBe(false);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(0);
  });

  it('confines both inversions to the EXCLUSION side, leaving the include side clean', () => {
    // The defects do not bleed across the link tables: `SwPromoRewardExclOption` and
    // `SwPromoQualExclOption` gain the row, while `SwPromoRewardOption` and `SwPromoQualOption`
    // are untouched.
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');
    const qualifier = aQualifier('pq-1');

    subject.removePromotionRewardExclusion(reward);
    subject.removePromotionQualifierExclusion(qualifier);

    expect(subject.getPromotionRewardExclusions()).toHaveLength(1);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(1);
    expect(subject.getPromotionRewards()).toHaveLength(0);
    expect(subject.getPromotionQualifiers()).toHaveLength(0);
    expect(reward.getOptions()).toHaveLength(0);
    expect(qualifier.getOptions()).toHaveLength(0);
  });

  it('keeps the two inversions independent of one another', () => {
    // A fresh far side per test is what this asserts in effect: exercising the reward inversion
    // must not touch the qualifier collections, and vice versa.
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.removePromotionRewardExclusion(reward);

    expect(subject.getPromotionRewardExclusions()).toHaveLength(1);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(0);
  });
});

describe('the images association is materialized through a narrow structural projection', () => {
  // `images` is materialized in `src/domain/entities/option.ts`, behind a narrow structural
  // projection.
  //
  // The projection names exactly three accessors - the join key, the stored filename and the
  // per-row directory column - because that is the reachable set.
  it('materializes as empty when the repository fetched no image rows', () => {
    expect(anOption({}).getImages()).toHaveLength(0);
  });

  it('reads back the projected rows it was hydrated with', () => {
    const subject = anOption({
      images: [
        anImageLink({ imageID: 'img-1', imageFile: 'small-front', directory: 'catalog' }),
        anImageLink({ imageID: 'img-2' }),
      ],
    });
    const images = subject.getImages();

    expect(images).toHaveLength(2);
    expect(images.map((image) => image.getImageID())).toEqual(['img-1', 'img-2']);
    expect(images[0]?.getImageFile()).toBe('small-front');
    expect(images[0]?.getDirectory()).toBe('catalog');
  });

  it('reports an absent filename and directory as undefined, since both columns are nullable', () => {
    const subject = anOption({ images: [anImageLink({ imageID: 'img-1' })] });
    const images = subject.getImages();

    expect(images[0]?.getImageFile()).toBeUndefined();
    expect(images[0]?.getDirectory()).toBeUndefined();
  });

  it('publishes no add/remove pair for images, because the source declares none', () => {
    // [model/entity/Option.cfc:L63] is `inverse="true"`, so the OWNING side is the many-to-one on
    // `model/entity/Image.cfc`, and `model/entity/Option.cfc` hand-writes no
    // `addImage`/`removeImage`.
    expect(prototypeMembers()).not.toContain('addImage');
    expect(prototypeMembers()).not.toContain('removeImage');
    expect(prototypeMembers()).not.toContain('setImages');
  });
});

describe('getImageDirectory concatenates one segment onto a base resolved elsewhere', () => {
  // Where `<segment>` stands for the single entity-name segment the source concatenates between
  // separators.

  it('appends its one segment to the resolved base', () => {
    const subject = anOption({ assetsImageBaseUrl: RESOLVED_ASSETS_IMAGE_BASE });

    expect(subject.getImageDirectory()).toBe(
      `${RESOLVED_ASSETS_IMAGE_BASE}/${OPTION_IMAGE_SUBDIRECTORY}/`,
    );
  });

  // LEGACY-NOTE [model/entity/Option.cfc:L82]: the source concatenates an unconditional leading
  // separator, so a base that ALREADY ends in one produces a DOUBLED separator.
  it('doubles the separator when the resolved base already ends in one', () => {
    const baseWithTrailingSeparator = `${RESOLVED_ASSETS_IMAGE_BASE}/`;
    const subject = anOption({ assetsImageBaseUrl: baseWithTrailingSeparator });

    expect(subject.getImageDirectory()).toBe(
      `${baseWithTrailingSeparator}/${OPTION_IMAGE_SUBDIRECTORY}/`,
    );
  });

  it('raises when the base was never materialized, rather than inventing a path', () => {
    // The second of the two members on this entity that can throw.
    const subject = anOption({});

    expect(() => subject.getImageDirectory()).toThrow(/hydrated without an assets image base/i);
  });

  it('does not read the base from any setting, so an unrelated option is unaffected', () => {
    // Two options, one hydrated with a base and one without, prove the value is per-row instance
    // state rather than ambient configuration: there is no module-level default for one row to
    // pick up from another.
    const withBase = anOption({
      optionID: 'opt-1',
      assetsImageBaseUrl: RESOLVED_ASSETS_IMAGE_BASE,
    });
    const withoutBase = anOption({ optionID: 'opt-2' });

    expect(withBase.getImageDirectory()).toBe(
      `${RESOLVED_ASSETS_IMAGE_BASE}/${OPTION_IMAGE_SUBDIRECTORY}/`,
    );
    expect(() => withoutBase.getImageDirectory()).toThrow();
  });
});

describe('the deliberate absences, each verified rather than assumed', () => {
  // [model/entity/Option.cfc:L151]/[model/entity/Option.cfc:L153] `Overridden Methods` and
  // [model/entity/Option.cfc:L155]/[model/entity/Option.cfc:L157] `ORM Event Hooks` are both
  // present-but-EMPTY banner pairs, as is
  // [model/entity/Option.cfc:L85]/[model/entity/Option.cfc:L87] `Non-Persistent Property Methods`.
  it('hosts no ORM lifecycle hook', () => {
    for (const hook of [
      'preInsert',
      'postInsert',
      'preUpdate',
      'postUpdate',
      'preDelete',
      'postDelete',
      'preLoad',
      'postLoad',
    ]) {
      expect(prototypeMembers()).not.toContain(hook);
    }
  });

  it('hosts no memoized accessor, so no memo can be poisoned', () => {
    // Two calls to the same accessor on the same instance return the same value because the field
    // is `readonly`, not because a cache was populated.
    const subject = anOption({ optionCode: 'small' });

    expect(subject.getOptionCode()).toBe('small');
    expect(subject.getOptionCode()).toBe('small');
    expect(prototypeMembers()).not.toContain('clearAttributeCache');
    expect(prototypeMembers()).not.toContain('clearCache');
  });

  it('declares no getSimpleRepresentation, so the inherited base-class case is not forced', () => {
    // `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58` runs
    // `simple_representation_exists_and_is_simple` against every entity inheriting it.
    expect(prototypeMembers()).not.toContain('getSimpleRepresentation');
    expect(prototypeMembers()).not.toContain('getSimpleRepresentationPropertyName');
  });

  it('hosts no smart list, because that is a framework query-builder artifact', () => {
    // `HibachiSmartList` is replaced by explicit typed repository queries throughout this port.
    expect(prototypeMembers()).not.toContain('getOptionSmartList');
    expect(prototypeMembers()).not.toContain('getSkusSmartList');
    expect(prototypeMembers()).not.toContain('getPromotionRewardsSmartList');
  });

  it('emulates none of the framework dynamic-dispatch patterns', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: `onMissingMethod` synthesised
    // `hasUniqueOrNullXXX`, `hasUniqueXXX`, `hasAnyXXX`, `getXXXAssignedIDList`, `getXXXID`,
    // `getXXXOptions`, `getXXXOptionsSmartList`, `getXXXSmartList`, `getXXXStruct` and
    // `getXXXCount`.
    for (const synthesised of [
      'hasAnySkus',
      'hasAnyPromotionRewards',
      'hasUniqueOptionCode',
      'hasUniqueOrNullOptionCode',
      'getSkusAssignedIDList',
      'getPromotionRewardsAssignedIDList',
      'getOptionGroupID',
      'getSkusCount',
      'getSkusStruct',
      'getAttributeValues',
      'getAttributeValue',
      'onMissingMethod',
    ]) {
      expect(prototypeMembers()).not.toContain(synthesised);
    }
  });

  it('injects no collaborator port, because Option has zero legacy getService() sites', () => {
    // A census of `getService(` across the eighteen in-scope entities returns 45 sites, every one
    // belonging to Sku (19), Product (18), ProductType (6), OptionGroup (1) or RoundingRule (1).
    expect(Option.length).toBe(1);
    expect(prototypeMembers()).not.toContain('getService');
    expect(prototypeMembers()).not.toContain('getHibachiScope');
    expect(prototypeMembers()).not.toContain('getSlatwallScope');
  });

  it('hosts no image-path helper beyond the ported concatenation', () => {
    // The ported member is `getImageDirectory` and nothing else: no filename builder, no extension
    // resolver, no URL assembler.
    expect(prototypeMembers()).not.toContain('getImageExtension');
    expect(prototypeMembers()).not.toContain('getImagePath');
    expect(prototypeMembers()).not.toContain('getResizedImagePath');
    expect(prototypeMembers()).not.toContain('getImageFileName');
  });
});

/**
 * The members this entity is intended to expose, in declaration order.
 */
const INTENDED_PUBLIC_SURFACE = [
  'getOptionID',
  'getOptionCode',
  'getOptionName',
  'getOptionDescription',
  'getSortOrder',
  'getOptionGroup',
  'getDefaultImageID',
  'getSkus',
  'getPromotionRewards',
  'getPromotionRewardExclusions',
  'getPromotionQualifiers',
  'getPromotionQualifierExclusions',
  'getRemoteID',
  'getCreatedDateTime',
  'getCreatedByAccountID',
  'getModifiedDateTime',
  'getModifiedByAccountID',
  'getImages',
  'getImageDirectory',
  'setOptionGroup',
  'removeOptionGroup',
  'isNew',
  'hasPromotionReward',
  'hasPromotionRewardExclusion',
  'hasPromotionQualifier',
  'hasPromotionQualifierExclusion',
  'addSku',
  'removeSku',
  'addPromotionReward',
  'removePromotionReward',
  'addPromotionRewardExclusion',
  'removePromotionRewardExclusion',
  'addPromotionQualifier',
  'removePromotionQualifier',
  'addPromotionQualifierExclusion',
  'removePromotionQualifierExclusion',
] as const;

/**
 * The one non-public prototype member, named so the exhaustiveness check below can be an EQUALITY
 * rather than a containment.
 */
const INTERNAL_PROTOTYPE_MEMBERS = ['constructor', 'isSameRowAs'] as const;

describe('the published surface is exactly the ported CFML surface', () => {
  it('exposes every member of the intended public surface as a function', () => {
    const subject = anOption({});

    for (const member of INTENDED_PUBLIC_SURFACE) {
      expect(typeof subject[member]).toBe('function');
    }
  });

  it('exposes exactly 36 public members and not one more', () => {
    // The count is asserted alongside the names so that an ADDITION is caught as loudly as a
    // removal.
    const surface = new Set<string>([...INTENDED_PUBLIC_SURFACE, ...INTERNAL_PROTOTYPE_MEMBERS]);
    const unexpected = prototypeMembers().filter((member) => !surface.has(member));

    expect(INTENDED_PUBLIC_SURFACE).toHaveLength(36);
    expect(unexpected).toEqual([]);
    expect(prototypeMembers()).toHaveLength(38);
  });

  it('carries the legacy names verbatim, including the two that promise a removal', () => {
    expect(prototypeMembers()).toContain('removePromotionRewardExclusion');
    expect(prototypeMembers()).toContain('removePromotionQualifierExclusion');
  });

  it('publishes no setter other than setOptionGroup, the one mutable association', () => {
    const setters = prototypeMembers().filter((member) => member.startsWith('set'));

    expect(setters).toEqual(['setOptionGroup']);
  });
});
