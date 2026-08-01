// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/domain/entities/option.ts`
//
// WHAT THIS SUITE PINS
// `model/entity/Option.cfc` is 160 lines of which twelve bidirectional helpers
// [L92-L147] are the only behaviour; everything else is property metadata. The
// helpers are therefore the subject, and TWO OF THEM ARE BROKEN IN THE SOURCE in
// the same way: a `remove*` that calls `addExcludedOption`. Those two are
// PRESERVED, not repaired, and pinning them is the single most important thing
// this file does - see the H21 block below.
//
// Four further areas are pinned: the `sortContext="optionGroup"` scoping of
// `sortOrder` [L56]; the near-side/far-side split of `setOptionGroup` and
// `removeOptionGroup` [L92-L107], including the unconditional near-side clear at
// [L106]; the five many-to-many-inverse collections and their abbreviated link
// tables [L66-L70]; and the four rules of `model/validation/Option.json`,
// asserted only to the extent an ENTITY can carry them.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// No assertion below has a legacy antecedent. Searching all 32 `.cfc` files under
// `meta/tests/` for `Option` as an entity subject returns no suite for it: the
// only legacy suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and
// [meta/tests/unit/entity/ProductTest.cfc], and
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub
// contributing zero coverage. There is nothing here to extend. Presenting this
// file as parity would fail the traceability gate, so it is declared net-new
// here, once, unambiguously.
//
// In particular the four inherited cases of
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] are NOT carried
// over as a base class - this port has no shared test base - and its
// `simple_representation_exists_and_is_simple` case [L56-L58] is deliberately
// NOT forced onto this entity, which declares no `getSimpleRepresentation`. That
// absence is explained where it would have been asserted rather than fabricated
// into a hollow test.
//
// ---------------------------------------------------------------------------
// THREE CORRECTIONS TO THE UPSTREAM SPECIFICATION, EACH VERIFIED FIRST-HAND
// ---------------------------------------------------------------------------
// The standing rule in this port is that SOURCE WINS over any specification
// number, and that a correction is recorded rather than silently applied. Three
// upstream claims about this entity's TARGET module are stale, and the shipped
// `src/domain/entities/option.ts` says so itself - it documents an earlier
// revision of its own that was corrected. All three were re-verified against the
// shipped module while authoring this file:
//
//   1. `getImageDirectory()` [model/entity/Option.cfc:L81-L83] was described as
//      OMITTED from the target, with the instruction to assert the member does
//      not exist. IT EXISTS. The shipped module ports it, resolving the two
//      out-of-scope INPUTS - `getURLFromPath` and
//      `setting('globalAssetsImageFolderPath')` - at the repository boundary and
//      keeping the one string concatenation the entity actually contributes. An
//      assertion that the member is absent would simply fail, so this suite pins
//      the shipped behaviour instead, including the RAISE case and the preserved
//      doubled-separator wart.
//   2. The `images` one-to-many [L63] was described as DROPPED. IT IS
//      MATERIALIZED, behind a narrow structural projection over the three
//      members anything in scope can reach. `model/entity/Image.cfc` remains
//      out of scope and no image entity is ported, which is exactly why the
//      projection is structural.
//   3. The far-side array symmetry and the `isNew() or !hasOption(this)` guard of
//      [L92-L107] were described as NOT reproduced. BOTH ARE REPRODUCED. The
//      upstream instruction was explicitly conditional - assert the
//      double-append hazard only if the shipped code reproduces it - and it does,
//      because `isNew()` short-circuits the guard. It is therefore asserted.
//
// A fourth correction is a matter of FRAMING rather than fact, and it changes what
// must be asserted. The two exclusion `remove*` helpers are described upstream as
// a "double-append hazard". THAT UNDERSTATES THEM: the fault is an INVERSION - a
// `remove` that adds - and a duplicate entry is only its secondary symptom, and
// only for an unsaved row. This suite asserts the inversion.
//
// Three narrower upstream details were checked and CONFIRMED CORRECT, so they are
// recorded as verified rather than corrected: `hb_permission` on [L49] is the
// nested path `optionGroup.options` and not `"this"`; `sortOrder` on [L56] carries
// no `required` attribute and no default; and only [L68] and [L70] of the five
// many-to-many declarations carry `type="array"`.
//
// ---------------------------------------------------------------------------
// INVERSION CROSS-CHECK VERDICT, COMPUTED RATHER THAN ASSUMED
// ---------------------------------------------------------------------------
// Every `remove*` member of `model/entity/Option.cfc` was read and classified.
// There are SIX, and the verdict is TWO INVERTED / FOUR CLEAN:
//
//   [L98-L107]  removeOptionGroup             CLEAN  - arrayFind/arrayDeleteAt
//   [L113-L115] removeSku                     CLEAN  - far-side removeOption
//   [L121-L123] removePromotionReward         CLEAN  - far-side removeOption
//   [L137-L139] removePromotionQualifier      CLEAN  - far-side removeOption
//   [L129-L131] removePromotionRewardExclusion    INVERTED - addExcludedOption at L130
//   [L145-L147] removePromotionQualifierExclusion INVERTED - addExcludedOption at L146
//
// The four clean cases are asserted alongside the two inverted ones. That
// contrast is not padding: it is what proves the two are defects rather than a
// house style, because the very same file gets the same job right four times.
//
// ---------------------------------------------------------------------------
// DIVERGENCE BUDGET: THIS FILE SPENDS ZERO
// ---------------------------------------------------------------------------
// The two inversions are OBSERVABLE THROUGH THE PUBLIC CONTRACT - a caller can
// see the exclusion still there afterwards - so they do not qualify for the
// unobservable-memo carve-out that `sku.test.ts` and `product.test.ts` spend on
// defects 17, 18 and 19. They are preserved with the uniform two-line marker and
// no divergence is claimed anywhere below.
//
// MARKER DISCIPLINE. `LEGACY-DEFECT` is used for exactly the two register
// defects. A verified legacy behaviour that is NOT a defect is marked
// `CFML parity`; a verified observation that is neither is marked `LEGACY-NOTE`;
// a translation choice is marked `JUDGMENT CALL`. Keeping the strongest marker
// scarce is what keeps it meaningful.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE MAY IMPORT, AND THE ONE ASSERTION THAT BOUNDARY COSTS
// ---------------------------------------------------------------------------
// The permitted surface is `src/domain/entities/option.ts` (the subject) plus its
// three sibling entities: `optionGroup.ts`, `promotionReward.ts` and
// `promotionQualifier.ts`. Nothing else - no repository, no handler, no
// integration, no `src/lib/**`, no fixture tier, no barrel. This port has no
// barrel at all.
//
// `src/domain/entities/sku.ts` IS DELIBERATELY NOT AMONG THEM, and that has one
// concrete consequence. `addSku`/`removeSku` [L110-L115] take a `Sku`, and `Sku`
// is a class with private fields - so it is NOMINALLY typed and no structural
// stand-in can satisfy the parameter. Rather than reach outside the permitted
// surface, or launder a double through an unsafe cast or a `@ts-expect-error`,
// this suite asserts the two members exist and are callable and states plainly
// that their behavioural delegation belongs to `sku.test.ts`. The boundary is
// honoured and the gap is declared; neither is worked around.
//
// ---------------------------------------------------------------------------
// FRESHNESS, DETERMINISM AND ISOLATION
// ---------------------------------------------------------------------------
// Every subject and every far side is built by a pure factory invoked INSIDE the
// test that uses it. There is no describe-scope subject, no module-level mutable
// binding and no `beforeEach`. That matters acutely here: the two preserved
// inversions MUTATE far-side collections, so a shared reward or qualifier would
// carry one test's appended entry into the next and could make a broken
// implementation look correct.
//
// `vi` is never imported, because there is nothing to intercept - the far sides
// are real sibling entities, which is what P3 prefers over a mocking library -
// so no spy restoration is needed. `tests/setup.ts` already registers a global
// `afterEach` restoring mocks and real timers in any case.
//
// Every date literal is an explicit UTC ISO-8601 instant. No `new Date()` with no
// argument, no `Date.now()`, and no fake timers: `tests/setup.ts` pins the process
// to UTC and hard-fails if it is not, so an instant written here means the same
// thing on every machine.
//
// ---------------------------------------------------------------------------
// NO USER RULES WERE PROVIDED
// ---------------------------------------------------------------------------
// Stated explicitly rather than assumed: the project rules document contains
// exactly "No user rules provided.", read to completion while authoring this
// file. No rule governs it, no rule is invented to fill the gap, and the absence
// is not licence to lower the bar - the enterprise-standard substitute applies at
// full strength.
//
// LICENCE. Carried forward at subtree level by `slatwall-ts/NOTICE-GPL.md`. No
// per-file GPL header, by project convention.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { Option } from '../../../../src/domain/entities/option.js';
import { ENTITY_CODE_PATTERN, OptionGroup } from '../../../../src/domain/entities/optionGroup.js';
import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';

/**
 * The already-resolved assets image base that `getImageDirectory` concatenates onto.
 *
 * JUDGMENT CALL: an OPAQUE TOKEN rather than a URL or a filesystem path. The entity
 * treats this value as an uninterpreted string - it dials nothing, opens nothing and
 * parses nothing - so a token proves the concatenation just as well as a realistic
 * value would, while keeping this suite free of any host name, address or path that
 * could be mistaken for an environment coordinate. It also has no separator of its
 * own, which is what lets the doubled-separator case below vary that one factor
 * alone.
 */
const RESOLVED_ASSETS_IMAGE_BASE = 'assets-base';

/**
 * The one path segment `getImageDirectory` contributes, named rather than inlined.
 *
 * JUDGMENT CALL: the expected directory is COMPOSED from named parts at every
 * assertion site instead of being written out as a single path literal. The
 * assertion is exactly as strict either way - it still pins the complete returned
 * string character for character - but composing it keeps the suite free of an
 * image-path literal, and it makes the two halves of the contract legible: the base
 * comes from outside the domain, and this segment is the entity's entire
 * contribution.
 */
const OPTION_IMAGE_SUBDIRECTORY = 'option';

/**
 * A structural stand-in for one `SwImage` row owned by an option.
 * [model/entity/Option.cfc:L63]
 *
 * JUDGMENT CALL: declared locally because the shipped module's own `OptionImageLink`
 * interface is MODULE-LOCAL AND UN-EXPORTED - deliberately so, to keep that
 * module's runtime export surface at exactly one unit - and therefore cannot be
 * imported. TypeScript matches it structurally, so a local mirror is the whole of
 * what is needed and nothing is being re-declared that the folder shares. Contrast
 * `ENTITY_CODE_PATTERN`, which IS shared and IS imported below rather than
 * re-declared.
 *
 * This is NOT an image-store port double. The `imageStore` port is a stub consumed
 * only by out-of-scope branches, and this suite constructs no port at all - the
 * entity injects none.
 */
interface ImageLinkDouble {
  getImageID(): string;
  getImageFile(): string | undefined;
  getDirectory(): string | undefined;
}

/**
 * Builds one `ImageLinkDouble` from plain data.
 *
 * A hand-written closure rather than `vi.fn()`: there is no call to record and
 * nothing to intercept, so an inline in-memory double is both sufficient and the
 * preferred form in this port.
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
 * Builds the `Option` under test with every persisted column and every materializable
 * association controllable.
 *
 * Each slot is written `?: T | undefined` rather than `?: T` because
 * `exactOptionalPropertyTypes` is enabled and a test must be able to say "this column
 * hydrated ABSENT" explicitly rather than by omission.
 *
 * `optionID` defaults to a saved-looking key so that a test which does not care about
 * newness does not accidentally exercise the unsaved-row branch of the guards; `??` is
 * correct for it because it falls back only on `null`/`undefined`, so an explicit `''`
 * survives as `''` - which the `isNew()` suites depend on.
 *
 * `skus` is ABSENT FROM THIS BUILDER ON PURPOSE. It is the one association whose
 * element type lives outside this suite's permitted import surface, so it can only ever
 * hydrate empty here; see the header. Every other association is settable.
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
 * A REAL sibling entity, never a double. `setOptionGroup` calls
 * `optionGroup.hasOption(this)` and `optionGroup.getOptions()`, and the whole point of
 * the near-side/far-side suites is what those two really do - a stand-in would be
 * asserting this suite's own assumptions back at itself.
 *
 * `options` is passed in so a test can start the group EMPTY or PRE-POPULATED, which is
 * what separates "the guard appended" from "the guard declined to append". Every other
 * column is fixed, so a group assertion reads as being about the association and
 * nothing else. `optionSortTieBreaker: undefined` selects the entity's own default
 * source; no assertion below depends on ordering, so the source is never scripted.
 *
 * `imageGroupFlag: 0` is passed as a bare literal rather than through that module's
 * `CfBooleanInput` alias: `src/lib/**` is outside this suite's permitted import
 * surface, and the literal satisfies the same contract.
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
 * Only the primary key is supplied. Every other slot on that constructor is optional
 * and its two option collections default to FRESH empty arrays, which is what makes a
 * per-test factory genuinely isolating: two rewards built by two tests can never share
 * a collection.
 *
 * The key defaults to a saved-looking value because `addExcludedOption` branches on
 * `this.isNew()` for its far-side append, so an accidentally-empty key would silently
 * change which branch a test exercises.
 */
function aReward(promotionRewardID = 'pr-1'): PromotionReward {
  return new PromotionReward({ promotionRewardID });
}

/** Builds the `PromotionQualifier` far side. Same contract as {@link aReward}. */
function aQualifier(promotionQualifierID = 'pq-1'): PromotionQualifier {
  return new PromotionQualifier({ promotionQualifierID });
}

/**
 * The `optionID` of every element, in collection order.
 *
 * Membership is compared BY PRIMARY KEY throughout this suite and never by object
 * identity or deep equality, which is what the ported containment predicates
 * themselves do. Mapping to keys first also makes a failure message name the row that
 * is wrong instead of dumping two entity graphs.
 */
function optionIDsOf(options: readonly Option[]): readonly string[] {
  return options.map((option) => option.getOptionID());
}

/** The `promotionRewardID` of every element, in collection order. */
function rewardIDsOf(rewards: readonly PromotionReward[]): readonly string[] {
  return rewards.map((reward) => reward.getPromotionRewardID());
}

/** The `promotionQualifierID` of every element, in collection order. */
function qualifierIDsOf(qualifiers: readonly PromotionQualifier[]): readonly string[] {
  return qualifiers.map((qualifier) => qualifier.getPromotionQualifierID());
}

/**
 * Every own member name on the class prototype, for the absence assertions.
 *
 * JUDGMENT CALL: absence is proved by scanning the prototype rather than by writing
 * `@ts-expect-error` against a call to the missing member. A prototype scan is a
 * RUNTIME proof that keeps its meaning if someone later adds the member back, whereas
 * a `@ts-expect-error` would itself start failing and would spend the strictness
 * allowance on a member that must simply never exist.
 */
function prototypeMembers(): readonly string[] {
  return Object.getOwnPropertyNames(Option.prototype);
}

describe('the persisted columns hydrate and read back exactly as declared', () => {
  // CFML parity [model/entity/Option.cfc:L49], verified verbatim:
  //
  //   component displayname="Option" entityname="SlatwallOption" table="SwOption"
  //   persistent=true output=false accessors=true extends="HibachiEntity"
  //   cacheuse="transactional" hb_serviceName="optionService"
  //   hb_permission="optionGroup.options"
  //
  // SCHEMA CONTINUITY. The physical table is `SwOption`, preserved verbatim - no
  // migration, no rename, no new column and no dropped column. The table name lives at
  // the repository boundary rather than on the entity, so it is RECORDED here rather
  // than fabricated into a hollow assertion; what IS assertable on the entity is that
  // every declared column round-trips, and that is what these cases do.
  //
  // TWO INERT `hb_*` ATTRIBUTES, NEITHER NORMALISED. `hb_serviceName="optionService"`
  // is correct and is NOT an `optionGroupService` - no such component exists, because
  // Option and OptionGroup CRUD are both served by model/service/OptionService.cfc.
  // `hb_permission` is the NESTED PATH `optionGroup.options`, verified, and NOT
  // `"this"` - the sibling [model/entity/OptionGroup.cfc:L49] uses `"this"`, and the
  // divergence is deliberate in the source: an Option is permissioned as a member of
  // its group's `options` collection rather than as a top-level entity. Both are
  // documentation strings with no runtime representation, here or in the shipped
  // module: JavaRB is not ported, no i18n runtime is introduced, and an `hb_*`
  // identifier or `rbKey` stays an inert constant.
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
    // CFML parity [model/entity/Option.cfc:L53-L56, L60, L73, L76-L79]: not one of
    // these declarations carries `required` or a `default`, so every one of them can
    // hydrate as SQL NULL. `undefined` is the honest reading of an existing row, and a
    // substituted `''` or `0` would misreport the column.
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
    // CFML parity [model/entity/Option.cfc:L55]: `length="4000"
    // hb_formFieldType="wysiwyg"`. Both attributes are inert.
    //
    // `hb_formFieldType="wysiwyg"` told the legacy ADMIN to render a rich-text editor.
    // The admin subsystem is out of scope, so it is an inert presentation hint with no
    // domain meaning: it does NOT imply the stored value is sanitised, escaped, parsed
    // or validated as HTML anywhere in this port, and nothing in the legacy did that
    // either. The markup below therefore comes back byte-identical.
    //
    // `length="4000"` is part of the schema contract and is NOT enforced at runtime,
    // because the legacy entity did not enforce it either - the database column length
    // did, and model/validation/Option.json declares no `maxLength` rule. A value past
    // that length is accepted here exactly as the entity accepted it there; rejecting
    // it would be this port inventing a constraint.
    const markup = '<h1>Small</h1><script>alert("x")</script>';
    const overlong = 'x'.repeat(4001);

    expect(anOption({ optionDescription: markup }).getOptionDescription()).toBe(markup);
    expect(anOption({ optionDescription: overlong }).getOptionDescription()).toHaveLength(4001);
  });

  it('treats defaultImageID as an inert persisted identifier with no image behaviour', () => {
    // CFML parity [model/entity/Option.cfc:L60]: `property name="defaultImage"
    // cfc="Image" fieldtype="many-to-one" fkcolumn="defaultImageID"`.
    //
    // THE COLUMN SURVIVES; THE ASSOCIATION DOES NOT. `model/entity/Image.cfc` is out of
    // scope and no image entity is ported, so there is no `Image` type to name and none
    // is invented. What remains is the raw opaque foreign key - the same treatment
    // `Category.cmsCategoryID` and `Category.site` get for the unported Mura bridge -
    // preserved so a row still round-trips unchanged. Dropping it would silently change
    // the schema contract.
    //
    // The identifier is opaque: no accessor resolves it, and there is no `getDefaultImage`
    // returning an entity.
    const subject = anOption({ defaultImageID: 'img-abc' });

    expect(subject.getDefaultImageID()).toBe('img-abc');
    expect(prototypeMembers()).not.toContain('getDefaultImage');
    expect(prototypeMembers()).not.toContain('setDefaultImage');
  });
});

describe('isNew() keys on the empty optionID, which unsavedvalue="" makes load-bearing', () => {
  // CFML parity [model/entity/Option.cfc:L52]: `property name="optionID"
  // ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue=""
  // default=""`.
  //
  // `default=""` means the column always holds a string, possibly the empty one, and
  // `unsavedvalue=""` is what makes that empty string load-bearing - it is precisely
  // what the legacy framework's `isNew()` keyed on. So the key is `string` and never
  // `string | undefined`, and `isNew()` is HONEST rather than a heuristic.
  //
  // This is not a curiosity. `isNew()` short-circuits the guard in `setOptionGroup`
  // [L94] and, on the far side, the guards in `PromotionReward.addExcludedOption` and
  // `PromotionQualifier.addExcludedOption`, so an unsaved row takes a different append
  // path from a saved one in three separate places.
  it('reports true for the empty key and false for a populated one', () => {
    expect(anOption({ optionID: '' }).isNew()).toBe(true);
    expect(anOption({ optionID: 'opt-9' }).isNew()).toBe(false);
  });

  it('never mints a key of its own, because generator="uuid" is a persistence instruction', () => {
    // The hydrating repository supplies the value; the entity does not generate one, so
    // an unsaved option stays unsaved no matter what is asked of it.
    const subject = anOption({ optionID: '' });

    expect(subject.getOptionID()).toBe('');
    subject.setOptionGroup(aGroup({}));
    expect(subject.getOptionID()).toBe('');
    expect(subject.isNew()).toBe(true);
  });
});

describe('the audit timestamps are Date | undefined and never an epoch stand-in', () => {
  // CFML parity [model/entity/Option.cfc:L76-L79]: the four audit properties, each
  // `hb_populateEnabled="false"`, two `ormtype="timestamp"` and two many-to-one
  // Account associations reduced to opaque `createdByAccountID` /
  // `modifiedByAccountID` keys because `model/entity/Account.cfc` is out of scope.
  //
  // AN ABSENT TIMESTAMP IS `undefined`, NEVER `new Date(0)`. The epoch is a real
  // instant in 1970 that compares, formats and sorts like data, so substituting it
  // would turn "never modified" into "modified before everything else" - a silent
  // reordering rather than a detectable gap.
  //
  // Also: `Option` has NO ORM event hook to maintain these columns. See the absence
  // suite - [model/entity/Option.cfc:L155]/[L157] is an EMPTY banner.
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
  // CFML parity [model/entity/Option.cfc:L56]: sortOrder carries
  // sortContext="optionGroup" -- ordering is scoped per option group, not globally.
  // Unlike OptionGroup.cfc:L58 it is NOT required="true" and has no default, so
  // undefined is a legitimate value.
  //
  // The full declaration, verified verbatim:
  //
  //   property name="sortOrder" ormtype="integer" sortContext="optionGroup";
  //
  // WHAT THE SCOPING MEANS, AND WHY IT IS STATED RATHER THAN MERELY QUOTED. The
  // ordinal is scoped to the OWNING GROUP: two options in DIFFERENT groups may
  // legitimately hold the same `sortOrder`, and comparing the `sortOrder` of options
  // drawn from different groups is meaningless. The legacy framework used the attribute
  // to decide which sibling set to renumber when the admin reordered a list; that
  // renumbering is a repository-and-service concern in this port, so the attribute has
  // no runtime representation on the entity - but the constraint it declares on how the
  // value may be READ is real.
  //
  // WHO CONSUMES THE COLUMN: [model/entity/OptionGroup.cfc:L70] declares the `options`
  // collection with `orderby="sortOrder"`, so the group's collection ordering is what
  // reads it. That ordering is deliberately NOT re-tested here - it belongs to
  // `optionGroup.test.ts`, which already pins it in detail. This suite pins only what
  // the OPTION side of the contract guarantees: the value, and its absence.
  //
  // LEGACY-NOTE [model/dao/SkuDAO.cfc:L192-L197]: the missing `required` has a
  // consequence invisible from the entity alone. `getSortedProductSkusID` orders by a
  // SUM over `SwOption.sortOrder`, so a NULL in this column makes the whole SUM for the
  // affected SKU NULL and REORDERS the result rather than merely omitting a term. The
  // legacy schema permits exactly that. It is recorded, not "fixed" by asserting the
  // column is always present - resolving an absent value is a decision for the
  // hydrating repository, where the fetch shape is documented.
  it('is undefined on an option hydrated without the column', () => {
    expect(anOption({}).getSortOrder()).toBeUndefined();
  });

  it('keeps zero as zero, because no default and no required means 0 is a real ordinal', () => {
    // `0` and `undefined` are different facts here and must not collapse into each
    // other: the first is "first in its group", the second is "unordered".
    expect(anOption({ sortOrder: 0 }).getSortOrder()).toBe(0);
    expect(anOption({ sortOrder: 0 }).getSortOrder()).not.toBeUndefined();
  });

  it('accepts a negative ordinal, since ormtype="integer" is signed and unconstrained', () => {
    // model/validation/Option.json declares no rule for `sortOrder` at all - no
    // `required`, no `minValue`, no `dataType`. Rejecting a negative value would be this
    // port inventing a constraint the legacy never had.
    expect(anOption({ sortOrder: -5 }).getSortOrder()).toBe(-5);
  });

  it('lets two options in DIFFERENT groups share one ordinal, which is what the scoping permits', () => {
    // This is the scoping stated as an assertion rather than only as prose: the same
    // ordinal in two groups is legal, so nothing on the entity may treat `sortOrder` as
    // globally unique.
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
  // CFML parity [model/validation/Option.json:L3], verified verbatim:
  //
  //   "optionCode": [{"contexts":"save","required":true,"unique":true,
  //                   "regex":"^[a-zA-Z0-9-_.|:~^]+$"}]
  //
  // ONE DECLARATION SITE, THREE CONSUMERS. The identical regex appears in exactly three
  // in-scope schemas - `optionCode` [model/validation/Option.json:L3],
  // `optionGroupCode` [model/validation/OptionGroup.json:L4] and `productCode`
  // [model/validation/Product.json:L10] - and the three strings are byte-identical. It
  // is declared ONCE, in `src/domain/entities/optionGroup.ts`, and IMPORTED here. It is
  // never re-declared in this file, never routed through a barrel and never through a
  // shared `types.ts`; this port has no barrel at all. Re-declaring it is precisely how
  // the three would drift apart.
  //
  // The subject module deliberately does NOT import the constant either: an entity
  // enforces no validation, so the import would bind no emitted reference and
  // `noUnusedLocals` would correctly fail the build. It references the constant by name
  // in a doc comment, and this suite - which DOES exercise it - imports it.
  //
  // ONLY THE FORMAT HALF OF THE RULE LIVES IN THE CONSTANT. `required` belongs to the
  // ported zod schema at the SERVICE tier and `unique` needs the database, so neither is
  // asserted here and NO zod assertion belongs in this file.
  it('is exactly the schema regex, source and flags alike', () => {
    expect(ENTITY_CODE_PATTERN.source).toBe('^[a-zA-Z0-9-_.|:~^]+$');
    expect(ENTITY_CODE_PATTERN.flags).toBe('');
  });

  it('carries no g or y flag, so the shared instance holds no lastIndex state', () => {
    // A `g`/`y` instance mutates `lastIndex` on every `test`, so one of the three
    // consumers could change another's result. Repeating one probe proves it does not.
    expect(ENTITY_CODE_PATTERN.global).toBe(false);
    expect(ENTITY_CODE_PATTERN.sticky).toBe(false);
    expect(ENTITY_CODE_PATTERN.test('small')).toBe(true);
    expect(ENTITY_CODE_PATTERN.test('small')).toBe(true);
    expect(ENTITY_CODE_PATTERN.lastIndex).toBe(0);
  });

  it('accepts the alphanumerics and the seven permitted punctuation characters', () => {
    // Reading the character class precisely: after `0-9` the `-` is a LITERAL hyphen and
    // not the start of a range, and `.`, `|`, `^` and `~` are literal inside a class. So
    // the permitted set is the ASCII alphanumerics plus `- _ . | : ~ ^`.
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
    // `+` requires at least one character, so `''` fails; the anchors make a single
    // offending character anywhere in the value fail the whole code.
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
    // A `save`-context rule constrains what may be WRITTEN and says nothing about what
    // an existing row may contain. The entity therefore accepts a code the regex would
    // reject, and the service tier is what refuses to save it. Asserting otherwise would
    // move enforcement somewhere the schema never put it.
    expect(ENTITY_CODE_PATTERN.test('not a valid code')).toBe(false);
    expect(anOption({ optionCode: 'not a valid code' }).getOptionCode()).toBe('not a valid code');
  });
});

describe('the save-context requirements are representable, and the delete gate reads `skus`', () => {
  // CFML parity [model/validation/Option.json], the complete file verified verbatim -
  // FOUR properties and no more:
  //
  //   "optionCode":  [{"contexts":"save","required":true,"unique":true,"regex":<shared>}]
  //   "optionName":  [{"contexts":"save","required":true}]
  //   "optionGroup": [{"contexts":"save","required":true}]
  //   "skus":        [{"contexts":"delete","maxCollection":0}]
  //
  // Every rule is enforced OUTSIDE this class, each in the layer that can actually
  // enforce it: `required` and the format constraint by the ported zod schema at the
  // service tier, `unique` by the repository because uniqueness needs the database, and
  // the delete gate likewise at the service tier. This entity hosts no `isDeletable`
  // and no validation method, and that is faithful rather than a gap.
  //
  // What IS assertable here is that the entity can REPRESENT both states of every
  // constrained property, so that a service-tier check has something honest to read.
  // That is what these cases pin.
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
    // `maxCollection: 0` refuses the delete while any SKU references the option, so the
    // gate's INPUT is the materialized collection - and zero is the permitting value.
    //
    // The populated case is NOT constructed here, and the reason is the import boundary
    // rather than an oversight: a `Sku` cannot be built from this suite's permitted
    // surface. `sku.test.ts` owns that side. See the header.
    expect(anOption({}).getSkus()).toHaveLength(0);
  });

  it('hosts no validation or deletability member, because those live at the service tier', () => {
    expect(prototypeMembers()).not.toContain('isDeletable');
    expect(prototypeMembers()).not.toContain('getSkusDeletableFlag');
    expect(prototypeMembers()).not.toContain('validate');
  });
});

describe('setOptionGroup assigns the near side and appends to the far side', () => {
  // CFML parity [model/entity/Option.cfc:L92-L97], verified verbatim:
  //
  //   public void function setOptionGroup(required any optionGroup) {
  //       variables.optionGroup = arguments.optionGroup;                        // L93
  //       if(isNew() or !arguments.optionGroup.hasOption( this )) {             // L94
  //           arrayAppend(arguments.optionGroup.getOptions(), this);            // L95
  //       }
  //   }
  //
  // A CORRECTION RECORDED RATHER THAN APPLIED SILENTLY. The upstream specification for
  // this suite stated that the far-side `arrayAppend` symmetry and the
  // `isNew() or !hasOption(this)` guard are NOT reproduced in the target, and instructed
  // that the double-append hazard be asserted only if the shipped module does reproduce
  // them. IT DOES - both the assignment at L93 and the guarded push at L94-L95 are
  // present in `src/domain/entities/option.ts`, verified first-hand. So the guard, the
  // append and the hazard are all asserted below against the shipped behaviour.
  //
  // The near side is the only MUTABLE field on this entity; every other field is
  // `readonly`. That is required rather than stylistic, because L93 assigns it and L106
  // clears it.
  //
  // This is also the load-bearing far side of [model/entity/OptionGroup.cfc:L92], whose
  // `addOption` does nothing but delegate here - so the two entities form one loop, and
  // the suite drives it from both ends below.
  it('assigns the near side and appends this option to the group collection', () => {
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(group);

    expect(subject.getOptionGroup()).toBe(group);
    expect(optionIDsOf(group.getOptions())).toEqual(['opt-1']);
  });

  it('is reached identically through OptionGroup.addOption, which only delegates', () => {
    // CFML parity [model/entity/OptionGroup.cfc:L91-L93]: `addOption` calls
    // `arguments.option.setOptionGroup( this )` and nothing else. Driving the loop from
    // the group end must therefore land in exactly the same state.
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
    // Membership is by PRIMARY KEY, not identity, so a re-hydrated instance of the same
    // row is recognised as already present. The near side is still reassigned - L93 runs
    // unconditionally, ahead of the guard.
    const alreadyHeld = anOption({ optionID: 'opt-1' });
    const group = aGroup({ options: [alreadyHeld] });
    const rehydrated = anOption({ optionID: 'opt-1' });

    rehydrated.setOptionGroup(group);

    expect(rehydrated.getOptionGroup()).toBe(group);
    expect(group.getOptions()).toHaveLength(1);
    expect(group.getOptions()[0]).toBe(alreadyHeld);
  });

  // LEGACY-NOTE [model/entity/Option.cfc:L94]: the guard is `isNew() or
  // !arguments.optionGroup.hasOption( this )`, and `or` SHORT-CIRCUITS. For an UNSAVED
  // option `isNew()` is true, so the containment test never runs and the append is
  // unconditional - calling `setOptionGroup` twice with the same group appends the same
  // option twice. Reproduced faithfully rather than tidied.
  //
  // It is a LEGACY-NOTE and not a LEGACY-DEFECT because it is not a member of the
  // twenty-defect register, and because the source's reasoning is visible: an unsaved
  // row has the empty key, so a key-based containment test cannot distinguish two
  // distinct new rows and would wrongly suppress the second append. The source chose
  // duplication over omission. The consequence is nonetheless real and is pinned so an
  // "improvement" here fails loudly.
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
    // LEGACY-NOTE [model/entity/Option.cfc:L92-L97]: `setOptionGroup` NEVER removes the
    // option from a previously-assigned group - there is no such statement in the source.
    // Reassignment therefore leaves the option in BOTH collections while its own field
    // names only the new one. `removeOptionGroup` [L98-L107] is the only member that
    // unlinks, and a caller that wants a move must call it first. Reproduced as written.
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
  // CFML parity [model/entity/Option.cfc:L98-L107], verified verbatim:
  //
  //   public void function removeOptionGroup(any optionGroup) {
  //       if(!structKeyExists(arguments, "optionGroup")) {                      // L99
  //           arguments.optionGroup = variables.optionGroup;                    // L100
  //       }
  //       var index = arrayFind(arguments.optionGroup.getOptions(), this);      // L102
  //       if(index > 0) {                                                       // L103
  //           arrayDeleteAt(arguments.optionGroup.getOptions(), index);         // L104
  //       }
  //       structDelete(variables, "optionGroup");                              // L106
  //   }
  //
  // Note the parameter is `any optionGroup` and NOT `required` - which is what makes the
  // L99-L101 defaulting reachable at all.
  //
  // JUDGMENT CALL on the index translation. CFML's `arrayFind` returns 0 when absent, so
  // L103's `index > 0` is the correct absent-test THERE. TypeScript's `findIndex` returns
  // -1, so `index > 0` would be a silent bug in the port - it would skip a legitimate
  // element at index 0. The shipped module uses `index !== -1`, which is the faithful
  // translation, and the case below deliberately removes the FIRST element so that a
  // regression to `> 0` fails here rather than passing unnoticed.
  it('removes an explicitly-named group and clears the near side', () => {
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(group);
    subject.removeOptionGroup(group);

    expect(subject.getOptionGroup()).toBeUndefined();
    expect(group.getOptions()).toHaveLength(0);
  });

  it('falls back to the currently-assigned group when called with no argument', () => {
    // This is the L99-L101 branch, reproduced in the target as a `!== undefined` test on
    // the optional parameter rather than as CFML's `structKeyExists(arguments, ...)`.
    const group = aGroup({ options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(group);
    subject.removeOptionGroup();

    expect(subject.getOptionGroup()).toBeUndefined();
    expect(group.getOptions()).toHaveLength(0);
  });

  it('removes the element at index 0, which a `> 0` index test would wrongly skip', () => {
    // The regression guard for the JUDGMENT CALL above: the option under test is the
    // FIRST element of the collection.
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

  // CFML parity [model/entity/Option.cfc:L103-L106]: the arrayDeleteAt at L104 is
  // guarded by `index > 0`, but the structDelete at L106 is UNCONDITIONAL -- the
  // near-side association is dropped even when the far side never held this option.
  it('clears the near side even when the named group never held this option', () => {
    const assigned = aGroup({ optionGroupID: 'og-assigned', options: [] });
    const stranger = aGroup({ optionGroupID: 'og-stranger', options: [] });
    const subject = anOption({ optionID: 'opt-1' });

    subject.setOptionGroup(assigned);
    expect(subject.getOptionGroup()).toBe(assigned);

    subject.removeOptionGroup(stranger);

    // The near side is gone although the stranger group was untouched, and although the
    // option is still sitting in the collection of the group it was actually assigned to.
    expect(subject.getOptionGroup()).toBeUndefined();
    expect(stranger.getOptions()).toHaveLength(0);
    expect(optionIDsOf(assigned.getOptions())).toEqual(['opt-1']);
  });

  it('clears the near side when the assigned group holds no options at all', () => {
    // The same unconditional clear, reached by the other route to `index === -1`: the
    // collection is empty, so there is nothing to splice and L106 still runs.
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
    // `variables.optionGroup` never set, L100 assigns null and L102 then calls
    // `getOptions()` on it - BEFORE any index guard runs. The legacy raised there, and
    // the target raises too rather than silently treating the call as a no-op.
    //
    // This is one of exactly two members on this entity that can throw; the other is
    // `getImageDirectory`.
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
  // CFML parity [model/entity/Option.cfc:L66-L70], all five verified verbatim. The
  // PHYSICAL LINK-TABLE NAMES ARE PRESERVED EXACTLY AS THE SOURCE ABBREVIATES THEM and
  // are never expanded - schema continuity is binding and these are existing tables:
  //
  //   L66 skus                         linktable="SwSkuOption"
  //   L67 promotionRewards             linktable="SwPromoRewardOption"
  //   L68 promotionRewardExclusions    linktable="SwPromoRewardExclOption"   type="array"
  //   L69 promotionQualifiers          linktable="SwPromoQualOption"
  //   L70 promotionQualifierExclusions linktable="SwPromoQualExclOption"     type="array"
  //
  // The source abbreviates `Promotion` to `Promo`, `Qualifier` to `Qual` and `Exclusion`
  // to `Excl` in these physical names. THE ABBREVIATION IS THE CONTRACT: the long forms
  // are not alternative spellings of the same tables, they are identifiers that do not
  // exist in the schema, so they are neither written nor asserted anywhere in this suite.
  //
  // ★ `Option` IS THE ONLY ENTITY IN THIS SLICE CARRYING BOTH THE INCLUSION AND THE
  // EXCLUSION SIDE FOR BOTH `promotionRewards` AND `promotionQualifiers`. That is why it
  // has FOUR promotion collections where its siblings have one or two, and it is also
  // why it is the one entity that could host this pair of defects at all: an inverted
  // `remove*` needs an exclusion collection to invert into.
  //
  // A SOURCE INCONSISTENCY, ANNOTATED AND DELIBERATELY NOT NORMALISED: only L68 and L70
  // declare `type="array"`. L66, L67 and L69 omit it, even though all five are
  // `many-to-many` with `inverse="true"` and all five materialize as arrays in practice.
  // The attribute is a CFML type hint for the ORM-generated accessor, so its presence or
  // absence changes nothing observable here - but it is recorded rather than smoothed
  // over, because pretending the five declarations are uniform would misreport the
  // source.
  //
  // ALL FIVE ARE `inverse="true"`, so the OWNING side is the other entity in every case
  // and every helper on this entity is a PURE FAR-SIDE DELEGATION. The delegation suites
  // follow this one.
  //
  // THESE FIVE ARE EXHAUSTIVE. No further inclusion or exclusion inverse association
  // exists on `model/entity/Option.cfc`, and none is invented: there is no
  // `promotionCodeExclusions`, no `priceGroupExclusions` and no `brandExclusions` here.
  it('exposes all five collection accessors', () => {
    const subject = anOption({});

    expect(typeof subject.getSkus).toBe('function');
    expect(typeof subject.getPromotionRewards).toBe('function');
    expect(typeof subject.getPromotionRewardExclusions).toBe('function');
    expect(typeof subject.getPromotionQualifiers).toBe('function');
    expect(typeof subject.getPromotionQualifierExclusions).toBe('function');
  });

  it('materializes every collection as empty when the repository fetched none', () => {
    // AN EMPTY RESULT IS A FETCH-SHAPE STATEMENT, NOT A DOMAIN CLAIM. Hibernate lazy
    // collections have no equivalent in a driver-only stack, so associations arrive
    // already materialized and an absent fetch is indistinguishable from a genuinely
    // empty one. That indistinguishability is an accepted consequence of not simulating
    // laziness; the fetch shape is documented at the producing repository method.
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
    // The two sides are different link tables and mean opposite things, so a reward on
    // the include side must never appear on the exclude side by accident. This is the
    // property the two preserved defects below put under pressure.
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
    // Every predicate compares the far side's own primary key, so a re-hydrated instance
    // of the same row answers true. This is the membership rule the whole suite uses.
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
    // CFML parity [model/entity/Option.cfc:L66-L70]: a key-only probe cannot work on an
    // UNSAVED far side, because `unsavedvalue=""` means every unsaved reward and every
    // unsaved qualifier carries the SAME empty primary key - so comparing keys would
    // report any unsaved instance as a member of any collection holding any other unsaved
    // instance. The legacy code sidesteps this the same way, by short-circuiting on
    // `isNew()` before it ever probes: `if(isNew() or !arguments.option.hasX(this))`.
    // The shipped predicates mirror that insight from the near side, switching to
    // reference comparison exactly when the candidate key is empty.
    //
    // THE PRIMARY-KEY RULE STILL HOLDS EVERYWHERE ELSE IN THIS SUITE. This is the one
    // branch where a key does not exist to compare, which is why it is pinned separately
    // rather than folded into the predicate test above. It is also the mechanism behind
    // the asymmetry recorded in the H21 suite below: an unsaved subject makes the far-side
    // guard short-circuit, which is what turns a no-op into a genuine duplicate.
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

    // The SAME instance is located.
    expect(subject.hasPromotionReward(heldReward)).toBe(true);
    expect(subject.hasPromotionRewardExclusion(heldExcludedReward)).toBe(true);
    expect(subject.hasPromotionQualifier(heldQualifier)).toBe(true);
    expect(subject.hasPromotionQualifierExclusion(heldExcludedQualifier)).toBe(true);

    // A DIFFERENT unsaved instance is not, even though its key is identically empty -
    // which is precisely what a key comparison would have got wrong. Each probe also
    // stays on its own collection: the inclusion side never answers for the exclusion
    // side, and neither answers for the other association.
    expect(subject.hasPromotionReward(new PromotionReward({ promotionRewardID: '' }))).toBe(false);
    expect(subject.hasPromotionReward(heldExcludedReward)).toBe(false);
    expect(subject.hasPromotionRewardExclusion(heldReward)).toBe(false);
    expect(
      subject.hasPromotionQualifier(new PromotionQualifier({ promotionQualifierID: '' })),
    ).toBe(false);
    expect(subject.hasPromotionQualifier(heldExcludedQualifier)).toBe(false);
    expect(subject.hasPromotionQualifierExclusion(heldQualifier)).toBe(false);
  });

  it('exposes addSku and removeSku, whose delegation is pinned by sku.test.ts', () => {
    // CFML parity [model/entity/Option.cfc:L110-L115], verified verbatim:
    //
    //   public void function addSku(required any sku)    { arguments.sku.addOption( this ); }
    //   public void function removeSku(required any sku) { arguments.sku.removeOption( this ); }
    //
    // Both are pure far-side delegations across `SwSkuOption` [L66], and the far side is
    // the OWNING side: `Sku` declares the `options` many-to-many with
    // `singularname="option"` [model/entity/Sku.cfc:L76] and hand-writes neither
    // accessor, so both are ORM-generated there.
    //
    // THE BEHAVIOURAL ASSERTION IS DELIBERATELY NOT MADE HERE, and the reason is the
    // import boundary rather than an oversight. `src/domain/entities/sku.ts` is outside
    // this suite's permitted surface, and `Sku` is a class with private fields - so it is
    // nominally typed and no structural stand-in can satisfy the parameter. The
    // alternatives were to reach outside the permitted surface, to launder a double
    // through an unsafe cast, or to abuse `@ts-expect-error`; all three are worse than
    // stating the boundary. `sku.test.ts` owns the delegation, driving the same loop from
    // the owning end.
    //
    // What IS assertable here is that both members exist on the published surface and are
    // callable - and interface parity is judged on that surface.
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

describe('the INCLUSION-side helpers delegate correctly - the control cases', () => {
  // CFML parity [model/entity/Option.cfc:L118-L123] and [L134-L139], verified verbatim:
  //
  //   public void function addPromotionReward(required any promotionReward) {
  //       arguments.promotionReward.addOption( this );                          // L119
  //   }
  //   public void function removePromotionReward(required any promotionReward) {
  //       arguments.promotionReward.removeOption( this );                       // L122
  //   }
  //   public void function addPromotionQualifier(required any promotionQualifier) {
  //       arguments.promotionQualifier.addOption( this );                       // L135
  //   }
  //   public void function removePromotionQualifier(required any promotionQualifier) {
  //       arguments.promotionQualifier.removeOption( this );                    // L138
  //   }
  //
  // THESE FOUR ARE THE CONTROL CASES, and they are the point of this describe block. Each
  // `add*` delegates to the far side's `addOption` and each `remove*` to the far side's
  // `removeOption` - the pattern as intended. Asserting them is what proves the two
  // exclusion helpers in the next block are DEFECTS rather than a house style: the very
  // same file, in the very same idiom, gets the identical job right here four times and
  // wrong there twice.
  //
  // INVERSION CROSS-CHECK VERDICT for this block: CLEAN, all four.
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
  // ═══════════════════════════════════════════════════════════════════════════════════
  // THE TWO PRESERVED DEFECTS THIS FILE OWNS. Both verified verbatim in the source, both
  // observable through the public contract, and both reproduced rather than repaired.
  //
  //   // L129-L131
  //   public void function removePromotionRewardExclusion(required any promotionReward) {
  //       arguments.promotionReward.addExcludedOption( this );      // L130  <-- should be removeExcludedOption
  //   }
  //   // L145-L147
  //   public void function removePromotionQualifierExclusion(required any promotionQualifier) {
  //       arguments.promotionQualifier.addExcludedOption( this );   // L146  <-- should be removeExcludedOption
  //   }
  //
  // Contrast their own `add*` partners at [L126-L128] and [L142-L144], which call the
  // SAME far-side method. The `add` and the `remove` of each pair are therefore
  // byte-identical in body and opposite in name.
  //
  // WHY THIS IS AN INVERSION AND NOT MERELY A DOUBLE APPEND. The upstream specification
  // frames these as a "double-append hazard". That understates them. A duplicate entry is
  // only the SECONDARY symptom, and only for an unsaved row - the far-side guard
  // suppresses it for a saved one. The PRIMARY fault is that the operation runs in the
  // wrong DIRECTION: asking to remove an exclusion adds one. So the assertions below pin
  // PRESENCE AFTER REMOVE, which is the observable outcome under either far-side
  // behaviour, and pin the duplicate separately as the narrower symptom it is.
  //
  // CONSEQUENCE IN PLAIN TERMS: once an option is excluded from a promotion reward or
  // qualifier, THIS API CAN NEVER WITHDRAW THE EXCLUSION. Worse, calling `remove*` on a
  // pair that was never linked CREATES the exclusion. Either way the promotion applies
  // to fewer items than an operator intends, which is why repairing it is a product
  // decision and not a refactor: it changes which order items receive a discount.
  //
  // NO DIVERGENCE IS SPENT HERE. The port's permitted divergences are reserved for the
  // unobservable memo defects in `sku.ts` and `product.ts`; a defect a caller can see
  // through the public contract does not qualify, so these two are preserved.
  //
  // FINAL INVERSION CROSS-CHECK VERDICT for the whole entity, restated where it matters
  // most: SIX `remove*` members, TWO INVERTED (L130, L146), FOUR CLEAN (removeOptionGroup
  // L98-L107, removeSku L113-L115, removePromotionReward L121-L123,
  // removePromotionQualifier L137-L139). The four clean cases are asserted in the
  // preceding block and in the `removeOptionGroup` block above.
  // ═══════════════════════════════════════════════════════════════════════════════════

  it('addPromotionRewardExclusion excludes the option on both sides, as intended', () => {
    // CFML parity [model/entity/Option.cfc:L126-L128]: the `add` side is CORRECT. It has
    // to be established first, otherwise the `remove` assertions below have no baseline.
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.addPromotionRewardExclusion(reward);

    expect(reward.hasExcludedOption(subject)).toBe(true);
    expect(optionIDsOf(reward.getExcludedOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionRewardExclusion(reward)).toBe(true);
    expect(rewardIDsOf(subject.getPromotionRewardExclusions())).toEqual(['pr-1']);
  });

  // LEGACY-DEFECT [model/entity/Option.cfc:L129-L131]: removePromotionRewardExclusion calls addExcludedOption at L130 instead of removeExcludedOption, so a "remove" ADDS and the exclusion can never be withdrawn through this method.
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

  // LEGACY-DEFECT [model/entity/Option.cfc:L129-L131]: removePromotionRewardExclusion calls addExcludedOption at L130 instead of removeExcludedOption, so a "remove" ADDS and the exclusion can never be withdrawn through this method.
  // Preserved deliberately; do not fix without a product decision.
  it('removePromotionRewardExclusion CREATES an exclusion that did not exist', () => {
    // The sharpest reading of the defect: no `add` first. A single `remove*` call on an
    // unlinked pair establishes the exclusion, because the body IS the add.
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

  // LEGACY-NOTE [model/entity/Option.cfc:L130] with
  // [model/entity/PromotionReward.cfc:L318-L325]: the SECONDARY symptom, and the one the
  // upstream "double-append" framing was reaching for. The far-side guard is
  // `option.isNew() or !this.hasExcludedOption(option)`, and `or` short-circuits - so for
  // an UNSAVED option the containment test never runs and the inverted `remove` appends a
  // second copy. For a saved option the guard absorbs it, which is exactly why presence,
  // not multiplicity, is the assertion that holds in both cases.
  //
  // Note the duplication is ASYMMETRIC: the near side is guarded by
  // `this.isNew() or !option.hasPromotionRewardExclusion(this)`, and the reward IS saved,
  // so that half is suppressed.
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
    // `PromotionReward.removeExcludedOption` [model/entity/PromotionReward.cfc:L326-L335]
    // is what L130 SHOULD have called, and it withdraws from both sides exactly as
    // expected. Asserting it here is what rules out the alternative explanation that the
    // capability was missing: it is not missing, it is unreached.
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
    // CFML parity [model/entity/Option.cfc:L142-L144]: the `add` side is CORRECT here too.
    const subject = anOption({ optionID: 'opt-1' });
    const qualifier = aQualifier('pq-1');

    subject.addPromotionQualifierExclusion(qualifier);

    expect(qualifier.hasExcludedOption(subject)).toBe(true);
    expect(optionIDsOf(qualifier.getExcludedOptions())).toEqual(['opt-1']);
    expect(subject.hasPromotionQualifierExclusion(qualifier)).toBe(true);
    expect(qualifierIDsOf(subject.getPromotionQualifierExclusions())).toEqual(['pq-1']);
  });

  // LEGACY-DEFECT [model/entity/Option.cfc:L145-L147]: removePromotionQualifierExclusion calls addExcludedOption at L146 instead of removeExcludedOption, so a "remove" ADDS and the exclusion can never be withdrawn through this method.
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

  // LEGACY-DEFECT [model/entity/Option.cfc:L145-L147]: removePromotionQualifierExclusion calls addExcludedOption at L146 instead of removeExcludedOption, so a "remove" ADDS and the exclusion can never be withdrawn through this method.
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
  // [model/entity/PromotionQualifier.cfc:L261-L266]: the same secondary symptom on the
  // qualifier side, for the same short-circuit reason.
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
    // `PromotionQualifier.removeExcludedOption`
    // [model/entity/PromotionQualifier.cfc:L269-L276] is what L146 should have called.
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
    // `SwPromoQualExclOption` gain the row, while `SwPromoRewardOption` and
    // `SwPromoQualOption` are untouched. That containment is worth pinning, because it is
    // what makes the include-side control cases above a valid contrast rather than a
    // coincidence.
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
    // A fresh far side per test is what this asserts in effect: exercising the reward
    // inversion must not touch the qualifier collections, and vice versa. Without
    // per-test factories a shared double would make this pass for the wrong reason.
    const subject = anOption({ optionID: 'opt-1' });
    const reward = aReward('pr-1');

    subject.removePromotionRewardExclusion(reward);

    expect(subject.getPromotionRewardExclusions()).toHaveLength(1);
    expect(subject.getPromotionQualifierExclusions()).toHaveLength(0);
  });
});

describe('the images association is materialized through a narrow structural projection', () => {
  // CFML parity [model/entity/Option.cfc:L63], verified verbatim:
  //
  //   property name="images" singularname="image" cfc="Image" type="array"
  //   fieldtype="one-to-many" fkcolumn="optionID" cascade="all-delete-orphan"
  //   inverse="true";
  //
  // A CORRECTION RECORDED RATHER THAN APPLIED SILENTLY. The upstream specification for
  // this suite stated that `images` is DROPPED in the target and instructed that no
  // `images` collection be asserted to exist. IT IS MATERIALIZED. Verified first-hand in
  // `src/domain/entities/option.ts`, which documents the reversal itself: an earlier
  // revision authored no member, and the correction observes that between "typed loosely"
  // and "dropped outright" there was a third option - a NARROW STRUCTURAL PROJECTION over
  // the members anything in scope can actually reach.
  //
  // `fkcolumn="optionID"` is why. The join key sits on the far `SwImage` row and points
  // HERE, so those rows are this option's own data even though `model/entity/Image.cfc` is
  // out of scope and no image entity is ported. Contrast `defaultImage` [L60], whose
  // payload is a scalar FK on THIS row and therefore survives as nothing more than an
  // opaque id; neither ruling implies the other.
  //
  // The projection names exactly three accessors - the join key, the stored filename and
  // the per-row directory column - because that is the reachable set. It is NOT an
  // `imageStore` port double: that port is a stub consumed only by out-of-scope branches,
  // and this suite constructs no port at all.
  //
  // WHERE THE `cascade="all-delete-orphan"` OBLIGATION WENT: to the MySQL repository, not
  // away. Deleting an Option must still delete its `SwImage` rows, and with no ORM to
  // honour the mapping that duty belongs at the boundary that issues DELETE. A domain
  // entity issues none, so there is nothing here to assert about it and the transfer is
  // recorded instead.
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
    // [L63] is `inverse="true"`, so the OWNING side is the many-to-one on
    // `model/entity/Image.cfc`, and `model/entity/Option.cfc` hand-writes no
    // `addImage`/`removeImage`. Inventing a pair would widen the surface the legacy
    // published.
    expect(prototypeMembers()).not.toContain('addImage');
    expect(prototypeMembers()).not.toContain('removeImage');
    expect(prototypeMembers()).not.toContain('setImages');
  });
});

describe('getImageDirectory concatenates one segment onto a base resolved elsewhere', () => {
  // CFML parity [model/entity/Option.cfc:L81-L83], verified verbatim:
  //
  //   public string function getImageDirectory() {
  //       return getURLFromPath(setting('globalAssetsImageFolderPath')) & <segment>;
  //   }
  //
  // where `<segment>` stands for the single entity-name segment the source concatenates
  // between separators. It is held in this suite as OPTION_IMAGE_SUBDIRECTORY and composed
  // at the assertion, so no asset-path literal is written anywhere - not in an expected
  // value and not in a transcription.
  //
  // A CORRECTION RECORDED RATHER THAN APPLIED SILENTLY. The upstream specification for
  // this suite stated that this member is OMITTED from the target and instructed that its
  // absence be asserted. IT EXISTS, verified first-hand in the shipped module, and an
  // absence assertion would simply fail.
  //
  // The upstream premises were true and did not support that conclusion. `getURLFromPath`
  // is a framework helper and `setting('globalAssetsImageFolderPath')` is outside the four
  // in-scope settings keys - `skuCurrency`, `skuEligibleCurrencies`, `globalURLKeyProduct`
  // and `globalURLKeyProductType` [model/service/SettingService.cfc:L221, L222, L178,
  // L179] - so this entity may not RESOLVE the base. That says nothing about whether it
  // may CONCATENATE onto a base resolved elsewhere. Removing a public method because two
  // of its INPUTS move outward would invert the anti-corruption boundary, whose whole
  // purpose is to relocate ambient lookups and KEEP the behaviour. The resolved base is
  // therefore materialized at the repository boundary and the entity contributes exactly
  // the one segment.
  //
  // No settings port is injected here and no framework helper is re-implemented; this
  // suite reads no setting and constructs no port.
  it('appends its one segment to the resolved base', () => {
    const subject = anOption({ assetsImageBaseUrl: RESOLVED_ASSETS_IMAGE_BASE });

    expect(subject.getImageDirectory()).toBe(
      `${RESOLVED_ASSETS_IMAGE_BASE}/${OPTION_IMAGE_SUBDIRECTORY}/`,
    );
  });

  // LEGACY-NOTE [model/entity/Option.cfc:L82]: the source concatenates an unconditional
  // leading separator, so a base that ALREADY ends in one produces a DOUBLED separator.
  // Reproduced verbatim rather than tidied: normalising it here would make this port emit
  // a different path than the CFML application emits for the same setting value, and both
  // write into the same filesystem. A trailing-separator policy, if one is ever wanted,
  // belongs at the boundary that resolves the base, where it would apply to every
  // consumer at once.
  it('doubles the separator when the resolved base already ends in one', () => {
    const baseWithTrailingSeparator = `${RESOLVED_ASSETS_IMAGE_BASE}/`;
    const subject = anOption({ assetsImageBaseUrl: baseWithTrailingSeparator });

    expect(subject.getImageDirectory()).toBe(
      `${baseWithTrailingSeparator}/${OPTION_IMAGE_SUBDIRECTORY}/`,
    );
  });

  it('raises when the base was never materialized, rather than inventing a path', () => {
    // The second of the two members on this entity that can throw. The declared return
    // type is `string` and interface parity forbids widening it, so there is no spare
    // value to spend on the absent case - and a default would not be a detectable marker
    // but a WELL-FORMED WRONG PATH. The legacy consumers of this value perform file
    // existence checks, deletes and moves against it
    // [admin/controllers/main.cfc:L118-L131], so handing a wrong directory to code that
    // deletes files is the one outcome worse than raising.
    //
    // This branch has NO legacy counterpart - `setting()` always resolved in CFML - so it
    // is not a reproduced source failure but the port declining to answer for a state the
    // legacy could not be in. That is why it carries no LEGACY-DEFECT marker.
    const subject = anOption({});

    expect(() => subject.getImageDirectory()).toThrow(/hydrated without an assets image base/i);
  });

  it('does not read the base from any setting, so an unrelated option is unaffected', () => {
    // Two options, one hydrated with a base and one without, prove the value is per-row
    // instance state rather than ambient configuration - there is no module-level default
    // for one row to pick up from another.
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
  // ─────────────────────────────────────────────────────────────────────────────────────
  // NO ORM EVENT HOOK AND NO OVERRIDDEN METHOD.
  // [model/entity/Option.cfc:L151]/[L153] `Overridden Methods` and [L155]/[L157]
  // `ORM Event Hooks` are BOTH present-but-EMPTY banner pairs, as is [L85]/[L87]
  // `Non-Persistent Property Methods`. Only the `Bidirectional Helper Methods` pair at
  // [L89]/[L149] contains anything. The banners are preserved as source warts in the
  // shipped module and are NEVER normalised away.
  //
  // An empty banner implies NOTHING on its own - it is not evidence that a member was
  // dropped - which is why the emptiness is stated rather than read as a gap. But the
  // consequences are real and assertable: this entity has no `preInsert`/`preUpdate`
  // maintenance for a repository to invoke on save, unlike `PriceGroup` with its
  // materialized path; and having no non-persistent property method, it carries NONE of
  // the memoized-accessor defects that afflict `Sku` and `Product`. That last point is
  // why this file spends zero divergences: there is no poisoned memo here to fix.
  // ─────────────────────────────────────────────────────────────────────────────────────
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
    // Two calls to the same accessor on the same instance return the same value because
    // the field is `readonly`, not because a cache was populated. There is no `clearCache`
    // style member to reset either.
    const subject = anOption({ optionCode: 'small' });

    expect(subject.getOptionCode()).toBe('small');
    expect(subject.getOptionCode()).toBe('small');
    expect(prototypeMembers()).not.toContain('clearAttributeCache');
    expect(prototypeMembers()).not.toContain('clearCache');
  });

  it('declares no getSimpleRepresentation, so the inherited base-class case is not forced', () => {
    // `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58` runs
    // `simple_representation_exists_and_is_simple` against every entity that inherits it.
    // `model/entity/Option.cfc` declares no `getSimpleRepresentation` and no
    // `hb_simpleRepresentationProperty`, and the framework base that would have supplied
    // one is not ported - this is a standalone class.
    //
    // The absence is therefore EXPLAINED rather than fabricated into a passing assertion.
    // Forcing the inherited case here would mean inventing a member the source never
    // declared, purely to have something to assert - which is exactly the failure mode the
    // net-new declaration at the top of this file exists to prevent. Contrast
    // `PromotionReward`, which DOES declare one and whose suite does assert it.
    expect(prototypeMembers()).not.toContain('getSimpleRepresentation');
    expect(prototypeMembers()).not.toContain('getSimpleRepresentationPropertyName');
  });

  it('hosts no smart list, because that is a framework query-builder artifact', () => {
    // `HibachiSmartList` is replaced by explicit typed repository queries throughout this
    // port. A domain entity must not host a dynamic query builder.
    expect(prototypeMembers()).not.toContain('getOptionSmartList');
    expect(prototypeMembers()).not.toContain('getSkusSmartList');
    expect(prototypeMembers()).not.toContain('getPromotionRewardsSmartList');
  });

  it('emulates none of the framework dynamic-dispatch patterns', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: `onMissingMethod`
    // synthesised `hasUniqueOrNullXXX`, `hasUniqueXXX`, `hasAnyXXX`,
    // `getXXXAssignedIDList`, `getXXXID`, `getXXXOptions`, `getXXXOptionsSmartList`,
    // `getXXXSmartList`, `getXXXStruct` and `getXXXCount`, then THREW at L565 for anything
    // else.
    //
    // The target has NO dynamic dispatch at all - no `Proxy`, no index signature, no
    // string dispatch - so only CONCRETELY-CALLED members exist, as explicitly-typed
    // methods. This is DOCUMENTED, not reproduced: an unknown accessor is a COMPILE error
    // here instead of a runtime throw there, which is strictly better and costs nothing,
    // because the compile error arrives before the code ships.
    //
    // `Option` also declares no `attributeValues` collection - only Sku, Product,
    // ProductType and Brand do - so there is no EAV read path on this entity and no
    // attribute getter to synthesise.
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
    // A census of `getService(` across the eighteen in-scope entities returns 45 sites,
    // every one of them belonging to Sku (19), Product (18), ProductType (6), OptionGroup
    // (1) or RoundingRule (1). `model/entity/Option.cfc` has NONE, so there is no service
    // locator to replace and no port to inject - and there is no ambient scope either:
    // context in this port is always an explicit parameter.
    //
    // The constructor therefore takes exactly ONE parameter, the hydration object. A
    // second parameter would be the signature of an injected port.
    expect(Option.length).toBe(1);
    expect(prototypeMembers()).not.toContain('getService');
    expect(prototypeMembers()).not.toContain('getHibachiScope');
    expect(prototypeMembers()).not.toContain('getSlatwallScope');
  });

  it('hosts no image-path helper beyond the ported concatenation', () => {
    // The ported member is `getImageDirectory` and nothing else: no filename builder, no
    // extension resolver, no URL assembler. Those belong to the image subsystem, which is
    // out of scope and reached through a stub port this suite never constructs.
    expect(prototypeMembers()).not.toContain('getImageExtension');
    expect(prototypeMembers()).not.toContain('getImagePath');
    expect(prototypeMembers()).not.toContain('getResizedImagePath');
    expect(prototypeMembers()).not.toContain('getImageFileName');
  });
});

/**
 * The members this entity is intended to expose, in declaration order.
 *
 * Written out rather than derived, so that a member disappearing from the module fails
 * here instead of quietly shrinking a derived list to match. Every name is the legacy
 * CFML name VERBATIM in camelCase - including the two inverted `remove*` names, which are
 * NOT renamed - because interface parity is the acceptance contract and a reviewer diffs
 * this list against the CFC.
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
 * The one non-public prototype member, named so the exhaustiveness check below can be an
 * EQUALITY rather than a containment.
 *
 * `isSameRowAs` is the private primary-key comparison that `removeOptionGroup` uses.
 * TypeScript's `private` is a compile-time visibility rule, so the method is still an own
 * property of the prototype at runtime and must be accounted for.
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
    // The count is asserted alongside the names so that an ADDITION is caught as loudly as
    // a removal. A member appearing here that the CFC never declared is a parity failure
    // just as much as a missing one.
    const surface = new Set<string>([...INTENDED_PUBLIC_SURFACE, ...INTERNAL_PROTOTYPE_MEMBERS]);
    const unexpected = prototypeMembers().filter((member) => !surface.has(member));

    expect(INTENDED_PUBLIC_SURFACE).toHaveLength(36);
    expect(unexpected).toEqual([]);
    expect(prototypeMembers()).toHaveLength(38);
  });

  it('carries the legacy names verbatim, including the two that promise a removal', () => {
    // The inverted members keep their misleading legacy names. Renaming either one would
    // break the interface-parity contract, and it would also hide the defect from a
    // reviewer diffing the two surfaces - the name is part of the evidence.
    expect(prototypeMembers()).toContain('removePromotionRewardExclusion');
    expect(prototypeMembers()).toContain('removePromotionQualifierExclusion');
  });

  it('publishes no setter other than setOptionGroup, the one mutable association', () => {
    const setters = prototypeMembers().filter((member) => member.startsWith('set'));

    expect(setters).toEqual(['setOptionGroup']);
  });
});
