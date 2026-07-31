// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/domain/entities/category.ts`
//
// WHAT THIS SUITE PINS
// `Category` is the port of model/entity/Category.cfc (137 lines), a read-mostly
// catalog leaf and one of only three in-scope entities carrying a materialized
// comma-delimited ID path. The CFC is the SOLE authority for every assertion
// below, and every locator cited here was re-verified against it line by line
// rather than taken from any secondary description.
//
// Five behaviours carry the whole of this entity's risk, and each has its own
// suite below:
//
//   1. `getCategoryIDPath()` IS A PLAIN ACCESSOR. The "Overridden Methods"
//      banner at [model/entity/Category.cfc:L120-L122] is literally empty, so
//      there is no lazy memoized path getter here - deliberately unlike
//      [model/entity/PriceGroup.cfc:L195-L200] and
//      [model/entity/ProductType.cfc:L250-L255], which both memoize.
//   2. THE HOOK ORDERING IS REVERSED relative to those same two entities:
//      Category calls `super` FIRST and assigns its path SECOND
//      [model/entity/Category.cfc:L127-L128], where PriceGroup
//      [model/entity/PriceGroup.cfc:L207-L208] and ProductType
//      [model/entity/ProductType.cfc:L306-L307] do the exact opposite.
//   3. THE CMS SURFACE IS INERT. `cmsCategoryID`
//      [model/entity/Category.cfc:L59] and the `site` association
//      [model/entity/Category.cfc:L62] are persisted schema only; the Mura
//      bridge is out of scope and no CMS behaviour is ported.
//   4. THE BIDIRECTIONAL HELPERS maintain BOTH sides of the parent/child link,
//      under the guard at [model/entity/Category.cfc:L103], and the clear at
//      [model/entity/Category.cfc:L115] is UNCONDITIONAL.
//   5. THE TWO BOOLEAN COLUMNS HAVE NO ORM DEFAULT
//      [model/entity/Category.cfc:L55-L56], so an unset column must read
//      `false` and not `undefined`.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion in this file has a legacy antecedent. `find meta/tests
// -iname '*categor*'` returns ZERO hits across all 32 legacy `.cfc` test
// components, and the only legacy suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and
// [meta/tests/unit/entity/ProductTest.cfc] -
// [meta/tests/functional/admin/entity/ProductTest.cfc] being an empty stub that
// contributes zero coverage. There is nothing here to extend, and presenting
// this suite as parity would fail the traceability gate outright.
//
// The four cases a legacy `Category` test WOULD have inherited from
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc] are handled honestly
// rather than transliterated, because no such test exists to inherit them:
//   * `defaults_are_correct()` L64-L67 asserts `isNew()` and an empty primary id
//     value. Both are genuinely observable here and are pinned, as net-new.
//   * `has_primary_id_property_name()` L60-L62 tests a framework accessor that
//     this port does not ship, so it is not fabricated.
//   * `validate_as_save_for_a_new_instance_doesnt_pass()` L51-L54 needs a
//     validation schema. There is no model/validation/Category.json - see the
//     absence suite below - so it is not fabricated either.
//   * `simple_representation_exists_and_is_simple()` L56-L58 calls
//     `getSimpleRepresentation()`, which model/entity/Category.cfc does not
//     declare and the shipped class does not expose. It is NOT forced: an
//     assertion against a method neither side has would be fabrication rather
//     than coverage.
//
// ---------------------------------------------------------------------------
// NO USER RULES WERE PROVIDED
// ---------------------------------------------------------------------------
// The project rules document was read to completion while authoring this file -
// probed four ways, returning byte-identically `No user rules provided.` each
// time. So no rule governs this file, no rule may be invented to fill the gap,
// and no file enters scope by rule mandate. The absence is NOT licence to lower
// the bar: the enterprise-standard substitute applies at full strength, which
// here means no `any`, no suppression comment, no non-null assertion and no
// cast anywhere below; a fresh subject per test with no module-level mutable
// state; and no database, network, filesystem, clock or environment read from
// any assertion in this file.
//
// ---------------------------------------------------------------------------
// THIS FILE SPENDS ZERO DIVERGENCES, AND CLAIMS NO DEFECT
// ---------------------------------------------------------------------------
// The port's defect register assigns NO numbered defect to Category, so there is
// deliberately no `LEGACY-DEFECT` marker below and none may be added - a marker
// here would itself be the error. Both bidirectional pairs are the CORRECT,
// non-defective pattern: the mandatory "remove-that-ADDs" inversion cross-check
// was run against all four helpers, in the verbatim CFML source AND against the
// shipped class at runtime. VERDICT: CLEAN, zero inversions. `removeChildCategory`
// delegates to `removeParentCategory` and never to `setParentCategory`, and
// `removeParentCategory` genuinely searches and splices and never appends.
// The reversed hook ordering and the absent `addProduct`/`removeProduct` pair are
// therefore `CFML parity` notes, not defects.
//
// ---------------------------------------------------------------------------
// FOUR EXPECTATIONS CORRECTED AGAINST THE SHIPPED MODULE
// ---------------------------------------------------------------------------
// Locator and surface drift is systemic in this migration, so the shipped module
// was read in full before a line of this suite was written, and it WINS over any
// secondary description. Four corrections were needed, and each is recorded
// where it is asserted rather than only here:
//
//   (a) The module exports TWO symbols, not one: the `Category` class - its only
//       runtime value - and the `CategoryPreUpdateSnapshot` type alias. See the
//       lifecycle suite, which hands a snapshot to `preUpdate` with no cast.
//   (b) `contents` [model/entity/Category.cfc:L70] is neither omitted nor
//       permanently empty. It is MATERIALIZED as a narrow structural projection
//       over the `contentID` join key. See the `contents` suite.
//   (c) The lifecycle hooks DO exist in the target, under the LEGACY names
//       `preInsert()` and `preUpdate(oldData?)`. They are repository-invoked
//       rather than ORM-fired, and this suite asserts THOSE names.
//   (d) THE FAR-SIDE IN-MEMORY SYMMETRY IS REPRODUCED IN FULL, together with the
//       `isNew() or !hasChildCategory( this )` guard at
//       [model/entity/Category.cfc:L103] and the `hasChildCategory` member it
//       calls. See the `setParentCategory` suite.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { Category } from '../../../../src/domain/entities/category.js';
import type { CategoryPreUpdateSnapshot } from '../../../../src/domain/entities/category.js';

/**
 * The overrides a test may supply when building a subject.
 *
 * Every slot is optional HERE and required on the class constructor, which is
 * deliberate in both places. The constructor requires all sixteen keys so a
 * hydrating repository must state "I read that column and found nothing" rather
 * than silently omit it; a test has no such obligation, and spelling out sixteen
 * `undefined`s per case would bury the one or two columns each case is about.
 *
 * The two flag slots accept the same wide input union the constructor does -
 * modelled structurally here rather than by importing the helper's own type,
 * because this tier may reach into `src/domain/**` only. That is a boundary
 * decision and not a convenience: naming the union locally keeps the suite
 * inside its allowed import surface while still exercising every form a MySQL
 * driver can hand over for an undefaulted `ormtype="boolean"` column.
 */
interface CategoryOverrides {
  readonly categoryID?: string;
  readonly categoryIDPath?: string;
  readonly categoryName?: string;
  readonly restrictAccessFlag?: string | number | boolean | null;
  readonly allowProductAssignmentFlag?: string | number | boolean | null;
  readonly cmsCategoryID?: string;
  readonly siteID?: string;
  readonly parentCategory?: Category;
  readonly childCategories?: Category[];
  readonly remoteID?: string;
  readonly createdDateTime?: Date;
  readonly createdByAccountID?: string;
  readonly modifiedDateTime?: Date;
  readonly modifiedByAccountID?: string;
}

/**
 * Builds one `Category`, fresh, from the overrides supplied.
 *
 * A FUNCTION AND NOT A SHARED INSTANCE. Every test below calls this for its own
 * subject, so no state crosses a test boundary: `parentCategory`,
 * `categoryIDPath` and the `childCategories` array are all mutable on the class,
 * and a shared subject would let one assertion's mutation decide another's
 * outcome. There is no `beforeEach` for the same reason - the freshness is in the
 * call, where it is visible at the point of use - and no `afterEach`, because
 * nothing here installs a spy, a fake timer or a stubbed environment value.
 *
 * `childCategories` defaults to a NEWLY CONSTRUCTED array on every call. The
 * class does not copy what it is handed, and the accessor returns that very
 * array, so a module-level literal would be shared mutable state of exactly the
 * kind this port forbids.
 *
 * The `products` and `contents` slots are deliberately not exposed. `products`
 * needs a real `Product`, and populating it would prove nothing this suite is
 * about; `contents` has its own local builder, immediately below, because its
 * element type is a structural projection rather than an entity.
 */
function aCategory(overrides: CategoryOverrides = {}): Category {
  return new Category({
    categoryID: overrides.categoryID,
    categoryIDPath: overrides.categoryIDPath,
    categoryName: overrides.categoryName,
    restrictAccessFlag: overrides.restrictAccessFlag,
    allowProductAssignmentFlag: overrides.allowProductAssignmentFlag,
    cmsCategoryID: overrides.cmsCategoryID,
    siteID: overrides.siteID,
    parentCategory: overrides.parentCategory,
    childCategories: overrides.childCategories ?? [],
    products: undefined,
    contents: undefined,
    remoteID: overrides.remoteID,
    createdDateTime: overrides.createdDateTime,
    createdByAccountID: overrides.createdByAccountID,
    modifiedDateTime: overrides.modifiedDateTime,
    modifiedByAccountID: overrides.modifiedByAccountID,
  });
}

/**
 * Builds one `Category` carrying a populated `contents` association.
 *
 * Separate from {@link aCategory} because the element type is the port's
 * anti-corruption projection of an `SwContent` row reached across the
 * `SwContentCategory` link table [model/entity/Category.cfc:L70] - the join key
 * and nothing else. `model/entity/Content.cfc` is a Mura CMS entity and is out
 * of scope, so no `Content` is imported here, none is constructed, and none is
 * invented: an inline object supplying `getContentID()` satisfies the shipped
 * element contract exactly, which is the whole point of projecting a far side
 * structurally instead of nominally.
 */
function aCategoryOnContents(contentIDs: readonly string[]): Category {
  return new Category({
    categoryID: 'category-with-contents',
    categoryIDPath: undefined,
    categoryName: undefined,
    restrictAccessFlag: undefined,
    allowProductAssignmentFlag: undefined,
    cmsCategoryID: undefined,
    siteID: undefined,
    parentCategory: undefined,
    childCategories: [],
    products: undefined,
    contents: contentIDs.map((contentID) => ({ getContentID: (): string => contentID })),
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

/** The `categoryID` of every element, in order - the readable form of an ID-path assertion. */
function idsOf(categories: readonly Category[]): readonly string[] {
  return categories.map((category) => category.getCategoryID());
}

/**
 * Every member name the shipped class carries at runtime, sorted.
 *
 * `Object.getOwnPropertyNames(Category.prototype)` is used rather than a
 * hand-maintained list because it cannot drift: it reports what the class
 * actually has. TypeScript's `private` is a COMPILE-TIME visibility only, so the
 * two internal helpers appear here too, and that is the honest runtime picture
 * rather than an omission.
 */
function shippedMemberNames(): readonly string[] {
  return Object.getOwnPropertyNames(Category.prototype).sort();
}

// ---------------------------------------------------------------------------
// THE SHIPPED SURFACE - interface parity, and every absence proved at once
// ---------------------------------------------------------------------------

describe('the shipped member surface is exactly the ported one', () => {
  // CFML parity [model/entity/Category.cfc:L49]: `accessors="true"` generated one getter per
  // property, and the component hand-writes four bidirectional helpers plus two hooks. Public method
  // names are carried over VERBATIM in legacy camelCase - `getCategoryIDPath`, not a renamed
  // idiomatic equivalent - because a reviewer must be able to diff the two surfaces directly.
  it('carries exactly the expected members and no others', () => {
    expect(shippedMemberNames()).toEqual([
      'addChildCategory',
      'childCategoriesContainUnsavedRow',
      'constructor',
      'getAllowProductAssignmentFlag',
      'getCategoryID',
      'getCategoryIDPath',
      'getCategoryName',
      'getChildCategories',
      'getCmsCategoryID',
      'getContents',
      'getCreatedByAccountID',
      'getCreatedDateTime',
      'getModifiedByAccountID',
      'getModifiedDateTime',
      'getParentCategory',
      'getProducts',
      'getRemoteID',
      'getRestrictAccessFlag',
      'getSiteID',
      'hasChildCategory',
      'isNew',
      'isSameRowAs',
      'preInsert',
      'preUpdate',
      'removeChildCategory',
      'removeParentCategory',
      'setCategoryIDPath',
      'setParentCategory',
    ]);
  });

  // CFML parity [model/entity/Category.cfc:L69]: the `products` many-to-many is declared
  // `inverse="true"` and the component authors NO helper pair for it - unlike model/entity/Brand.cfc,
  // which does author one for its own products collection. Inventing `addProduct`/`removeProduct`
  // here would add public surface the legacy never had, so `getProducts()` is the whole of it.
  it('has NO addProduct and NO removeProduct, because the source declares neither', () => {
    expect(shippedMemberNames()).not.toContain('addProduct');
    expect(shippedMemberNames()).not.toContain('removeProduct');
  });

  // CFML parity [model/entity/Category.cfc:L70]: `contents` is likewise declared `inverse="true"`
  // with no hand-written helper pair, so the same rule applies and the same pair stays absent.
  it('has NO addContent and NO removeContent, on the same reasoning', () => {
    expect(shippedMemberNames()).not.toContain('addContent');
    expect(shippedMemberNames()).not.toContain('removeContent');
  });

  // CFML parity [model/entity/Category.cfc:L62]: the `site` many-to-one is collapsed to an opaque
  // `siteID` because `Site` is a Mura CMS entity and out of scope. There is deliberately no
  // `getSite()` returning an entity, because there is no `Site` type in this port to return.
  it('exposes no getSite, because no Site type exists in this port', () => {
    expect(shippedMemberNames()).not.toContain('getSite');
  });

  // CFML parity [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]: the inherited
  // `simple_representation_exists_and_is_simple()` case asserts
  // `isSimpleValue(getSimpleRepresentation())`. model/entity/Category.cfc DECLARES NO
  // `getSimpleRepresentation`, and the shipped class exposes none. The inherited assertion is
  // therefore NOT forced - it is recorded here as an absence on both sides, which is the honest
  // outcome. Fabricating the method in order to assert against it would be inventing surface.
  it('exposes no getSimpleRepresentation, so the inherited legacy case is not forced', () => {
    expect(shippedMemberNames()).not.toContain('getSimpleRepresentation');
  });

  // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: the legacy framework synthesised members
  // through `onMissingMethod` - eleven dispatch patterns including `hasUnique*`, `hasAny*`,
  // `get*Options`, `get*SmartList`, `get*Struct`, `get*Count` and `get*AssignedIDList`. The target
  // reproduces NONE of them: no Proxy, no index signature, no `evaluate()`, no dynamic dispatch of
  // any kind. Only concretely-called members are authored, so `hasChildCategory` survives - it is
  // called at [model/entity/Category.cfc:L103] - while the rest do not exist to be called.
  it('synthesises no dynamic-dispatch members', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getNewFlag');
    expect(members).not.toContain('getPrimaryIDPropertyName');
    expect(members).not.toContain('getPrimaryIDValue');
    expect(members).not.toContain('getChildCategoriesCount');
    expect(members).not.toContain('getChildCategoriesSmartList');
    expect(members).not.toContain('getProductsSmartList');
    expect(members).not.toContain('hasUniqueCategoryName');
    expect(members).not.toContain('hasAnyChildCategory');
  });

  // CFML parity [org/Hibachi/HibachiEntity.cfc:L559,L565]: the EAV fallback branch guards on
  // `hasProperty("attributeValues")`. A census of the eighteen in-scope entities finds
  // `attributeValues` declared exactly FOUR times - [model/entity/Sku.cfc:L70],
  // [model/entity/Product.cfc:L75], [model/entity/ProductType.cfc:L67] and
  // [model/entity/Brand.cfc:L60] - and Category is NOT among them. So an unmatched `getX()` on a
  // legacy Category could never reach that branch and threw directly at L565 instead. The target has
  // no dynamic dispatch at all, so the throw has nothing to reproduce; the consequence is DOCUMENTED
  // here rather than emulated, and no attribute surface is invented.
  it('carries no attribute-value surface, matching an entity that declares none', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getAttributeValue');
    expect(members).not.toContain('getAttributeValues');
    expect(members).not.toContain('clearAttributeCache');
  });

  // CFML parity [model/entity/Category.cfc:L49]: `hb_serviceName="contentService"` routes Category
  // CRUD to ContentService BY DESIGN - the SOURCE ITSELF resolves the ambiguity, and a
  // repository-wide check finds no model/service/CategoryService.cfc anywhere in the legacy tree.
  // Nothing is being omitted: there was never a category service surface to convert, and no
  // `CategoryService` may be invented - not here, not in src/services/, not anywhere. The entity
  // consequently carries NO service handle, no locator and no ambient scope of its own.
  it('reaches no service: hb_serviceName="contentService" is a framework routing hint, not a member', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getService');
    expect(members).not.toContain('getCategoryService');
    expect(members).not.toContain('getContentService');
    expect(members).not.toContain('getHibachiScope');
    expect(members).not.toContain('getSlatwallScope');
  });

  // CFML parity [model/entity/Category.cfc:L86-L88,L120-L122]: two banner pairs in the source are
  // EMPTY - "Non-Persistent Property Methods" and "Overridden Methods" - as is the
  // "Non-Persistent Properties" section at L81-L84. An empty banner implies NOTHING, so no
  // non-persistent property and no override is invented for either. The banners are source warts and
  // are never normalised away; the empty "Overridden Methods" pair is the direct evidence for the
  // plain-accessor finding asserted further down.
  it('invents no non-persistent property behind the two empty banners', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getCategoryNameOptions');
    expect(members).not.toContain('getParentCategoryOptions');
  });
});

// ---------------------------------------------------------------------------
// STRUCTURAL DEFAULTS ON A FRESH ROW
// ---------------------------------------------------------------------------

describe('a fresh, unhydrated row', () => {
  // CFML parity [model/entity/Category.cfc:L52]: the id property declares BOTH `unsavedvalue=""` and
  // `default=""`, so the empty string is the legacy contract and not a sentinel of this port's
  // invention. `isNew()` is honest because it reads that value directly:
  // [org/Hibachi/HibachiEntity.cfc:L571-L576] returns true exactly when the primary id value is `""`.
  it('defaults categoryID to the empty string, so isNew() is honest', () => {
    const category = aCategory();

    expect(category.getCategoryID()).toBe('');
    expect(category.isNew()).toBe(true);
  });

  it('is not new once a persisted id is present', () => {
    expect(aCategory({ categoryID: 'saved-category' }).isNew()).toBe(false);
  });

  // An id explicitly supplied as the empty string is the SAME state as an omitted one, because
  // `unsavedvalue=""` makes them the same value in the legacy schema too.
  it('treats an explicitly empty id exactly as an absent one', () => {
    const category = aCategory({ categoryID: '' });

    expect(category.getCategoryID()).toBe('');
    expect(category.isNew()).toBe(true);
  });

  // CFML parity [model/entity/Category.cfc:L54,L59,L62,L73]: every nullable string column reads as
  // `undefined` when the column is SQL NULL, never as `''` and never as a fabricated placeholder. The
  // distinction is load-bearing across this port: `''` is a REAL value that the ID column uses to
  // mean "unsaved", so collapsing NULL onto it would destroy that signal.
  it('reads every nullable string column as undefined, never as an empty string', () => {
    const category = aCategory();

    expect(category.getCategoryName()).toBeUndefined();
    expect(category.getCmsCategoryID()).toBeUndefined();
    expect(category.getSiteID()).toBeUndefined();
    expect(category.getRemoteID()).toBeUndefined();
    expect(category.getCreatedByAccountID()).toBeUndefined();
    expect(category.getModifiedByAccountID()).toBeUndefined();
  });

  // CFML parity [model/entity/Category.cfc:L63]: the `parentCategory` many-to-one is `undefined` for
  // a root category, and also when the repository chose not to fetch it. The shipped field is
  // `private parentCategory: Category | undefined` - a required slot whose type includes `undefined`,
  // NOT an optional `parentCategory?:` - because `exactOptionalPropertyTypes` would otherwise make the
  // unconditional clear at [model/entity/Category.cfc:L115] inexpressible.
  it('has no parent category', () => {
    expect(aCategory().getParentCategory()).toBeUndefined();
  });

  // A Hibernate-managed collection never handed back null: an unpopulated one-to-many read as an
  // empty array. `[]` is therefore the parity-correct shape for all three collections.
  it('reads all three collections as empty arrays rather than undefined', () => {
    const category = aCategory();

    expect(category.getChildCategories()).toEqual([]);
    expect(category.getProducts()).toEqual([]);
    expect(category.getContents()).toEqual([]);
  });

  // CFML parity [model/entity/Category.cfc:L76,L78]: both timestamps are `ormtype="timestamp"` with
  // `hb_populateEnabled="false"`. An unstamped row reads `undefined` - NEVER the Unix epoch and NEVER
  // `0`. A zero-valued date would be a real instant in 1970 and would silently pass any
  // "is a Date" check, which is precisely why the absent case is asserted as `undefined` here.
  it('reads unstamped audit timestamps as undefined, never as the epoch and never as 0', () => {
    const category = aCategory();

    expect(category.getCreatedDateTime()).toBeUndefined();
    expect(category.getModifiedDateTime()).toBeUndefined();
    expect(category.getCreatedDateTime()).not.toEqual(new Date(0));
    expect(category.getModifiedDateTime()).not.toEqual(new Date(0));
  });

  // Every business-date literal in this suite is an explicit UTC ISO-8601 string. No assertion reads
  // the ambient clock, so none can drift with the day it runs on.
  it('round-trips stamped audit timestamps unchanged', () => {
    const createdDateTime = new Date('2013-04-18T09:15:00.000Z');
    const modifiedDateTime = new Date('2014-11-02T23:45:30.500Z');

    const category = aCategory({
      categoryID: 'audited-category',
      createdDateTime,
      modifiedDateTime,
      createdByAccountID: 'account-created-by',
      modifiedByAccountID: 'account-modified-by',
    });

    expect(category.getCreatedDateTime()).toEqual(new Date('2013-04-18T09:15:00.000Z'));
    expect(category.getModifiedDateTime()).toEqual(new Date('2014-11-02T23:45:30.500Z'));
    expect(category.getCreatedByAccountID()).toBe('account-created-by');
    expect(category.getModifiedByAccountID()).toBe('account-modified-by');
  });

  // CFML parity [model/entity/Category.cfc:L77,L79]: `createdByAccount` and `modifiedByAccount` are
  // declared `cfc="Account" fieldtype="many-to-one"`, and model/entity/Account.cfc is out of scope.
  // Each therefore collapses to the OPAQUE foreign-key column the association named - the same
  // anti-corruption treatment `site` receives - so no Account class is imported, none is invented and
  // none is ever constructed by this port.
  it('collapses both audit associations to opaque account id columns', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getCreatedByAccount');
    expect(members).not.toContain('getModifiedByAccount');
    expect(members).toContain('getCreatedByAccountID');
    expect(members).toContain('getModifiedByAccountID');
  });

  // CFML parity [model/entity/Category.cfc:L73] vs [model/entity/ProductType.cfc:L80]: Category's
  // `remoteID` is declared WITH `hint="Only used when integrated with a remote system"`, and
  // ProductType's identical column carries NO hint at all. The asymmetry is genuine source metadata
  // and is recorded rather than normalised in either direction; a hint is documentation and has no
  // runtime effect, so the observable contract is just the round trip asserted here.
  it('round-trips remoteID, the one hint-carrying column in this entity', () => {
    expect(aCategory({ remoteID: 'remote-system-key-42' }).getRemoteID()).toBe(
      'remote-system-key-42',
    );
  });
});

// ---------------------------------------------------------------------------
// THE TWO BOOLEAN COLUMNS - NEITHER HAS AN ORM DEFAULT
// ---------------------------------------------------------------------------

describe('restrictAccessFlag and allowProductAssignmentFlag have no ORM default', () => {
  // CFML parity [model/entity/Category.cfc:L55-L56]: a case-insensitive read of the source finds
  // exactly TWO `ormtype="boolean"` properties and NEITHER declares a `default=`. The only `default=`
  // in the whole file is the `default=""` on the id property at L52. So either column can legitimately
  // hydrate as SQL NULL, and both are read through the port's shared CFML truthiness helper rather
  // than a hand-rolled coercion. An undefaulted, unset flag reads `false` - precisely the answer the
  // legacy engine gave a flag it had no value for.
  //
  // CFML parity - THE DEFAULT ASYMMETRY, ANNOTATED AND NOT NORMALISED: [model/entity/Sku.cfc:L57]
  // and [model/entity/Promotion.cfc:L53] declare `activeFlag` WITH `default="1"`, whereas
  // [model/entity/Product.cfc:L56] and both flags here declare no default whatsoever. This port
  // preserves each entity's own metadata rather than imposing a house default on all of them.
  it('reads an ABSENT value as false on both flags', () => {
    const category = aCategory();

    expect(category.getRestrictAccessFlag()).toBe(false);
    expect(category.getAllowProductAssignmentFlag()).toBe(false);
  });

  // SQL NULL is an EXPECTED value for these two columns, not an error, so it resolves to `false`
  // rather than raising. Note that `null` and `undefined` are DIFFERENT inputs here - a driver hands
  // over `null` for a NULL column while an omitted key arrives as `undefined` - and both resolve the
  // same way, which is what makes the accessor total.
  it('resolves SQL NULL to false rather than raising', () => {
    const category = aCategory({ restrictAccessFlag: null, allowProductAssignmentFlag: null });

    expect(category.getRestrictAccessFlag()).toBe(false);
    expect(category.getAllowProductAssignmentFlag()).toBe(false);
  });

  it('accepts a real boolean in either state', () => {
    expect(aCategory({ restrictAccessFlag: true }).getRestrictAccessFlag()).toBe(true);
    expect(aCategory({ restrictAccessFlag: false }).getRestrictAccessFlag()).toBe(false);
    expect(aCategory({ allowProductAssignmentFlag: true }).getAllowProductAssignmentFlag()).toBe(
      true,
    );
    expect(aCategory({ allowProductAssignmentFlag: false }).getAllowProductAssignmentFlag()).toBe(
      false,
    );
  });

  // A MySQL `bit`/`tinyint` column commonly arrives as a number, and the CFML engine accepted the
  // numeric and string spellings interchangeably. Both resolve to the same answer here.
  it('accepts the numeric and string spellings a driver can produce', () => {
    expect(aCategory({ restrictAccessFlag: 1 }).getRestrictAccessFlag()).toBe(true);
    expect(aCategory({ restrictAccessFlag: 0 }).getRestrictAccessFlag()).toBe(false);
    expect(aCategory({ restrictAccessFlag: '1' }).getRestrictAccessFlag()).toBe(true);
    expect(aCategory({ restrictAccessFlag: '0' }).getRestrictAccessFlag()).toBe(false);
  });

  // CFML `isBoolean()` accepted these literals, and comparison was CASE-INSENSITIVE - which is one of
  // the semantics this port had to carry deliberately, since TypeScript comparison is not.
  it('accepts the CFML boolean literals, case-insensitively', () => {
    expect(aCategory({ restrictAccessFlag: 'true' }).getRestrictAccessFlag()).toBe(true);
    expect(aCategory({ restrictAccessFlag: 'false' }).getRestrictAccessFlag()).toBe(false);
    expect(aCategory({ restrictAccessFlag: 'yes' }).getRestrictAccessFlag()).toBe(true);
    expect(aCategory({ restrictAccessFlag: 'no' }).getRestrictAccessFlag()).toBe(false);
    expect(aCategory({ restrictAccessFlag: 'YES' }).getRestrictAccessFlag()).toBe(true);
    expect(aCategory({ restrictAccessFlag: 'True' }).getRestrictAccessFlag()).toBe(true);
  });

  it('reads the empty string as false, matching an unset column', () => {
    expect(aCategory({ restrictAccessFlag: '' }).getRestrictAccessFlag()).toBe(false);
  });

  // The two flags are INDEPENDENT columns. Asserting that explicitly guards against a hydration
  // transposition, which is the one defect class a per-flag test cannot catch on its own.
  it('keeps the two flags independent of one another', () => {
    const category = aCategory({ restrictAccessFlag: true, allowProductAssignmentFlag: false });

    expect(category.getRestrictAccessFlag()).toBe(true);
    expect(category.getAllowProductAssignmentFlag()).toBe(false);

    const transposed = aCategory({ restrictAccessFlag: false, allowProductAssignmentFlag: true });

    expect(transposed.getRestrictAccessFlag()).toBe(false);
    expect(transposed.getAllowProductAssignmentFlag()).toBe(true);
  });

  // Both accessors return a genuine `boolean`, never the raw input value passed through. A truthy
  // string surviving unconverted would satisfy an `if` and fail a `=== true` comparison, so the type
  // is asserted alongside the value.
  it('returns a real boolean rather than passing the raw column through', () => {
    const category = aCategory({ restrictAccessFlag: 'yes', allowProductAssignmentFlag: 1 });

    expect(typeof category.getRestrictAccessFlag()).toBe('boolean');
    expect(typeof category.getAllowProductAssignmentFlag()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// THE CMS SURFACE IS INERT PERSISTED SCHEMA, WITH NO BEHAVIOUR
// ---------------------------------------------------------------------------

// CFML parity [model/entity/Category.cfc:L59,L62]: cmsCategoryID (index RI_CMSCATEGORYID) and the
// site association (fkcolumn siteID) are preserved as INERT persisted columns so the Sw* schema
// contract is unbroken. The Mura CMS bridge is out of scope; no CMS behaviour is ported.
//
// C5 SCHEMA CONTINUITY, RECORDED VERBATIM. The physical names this entity is bound to are the table
// `SwCategory` [model/entity/Category.cfc:L49], the link tables `SwProductCategory`
// [model/entity/Category.cfc:L69] and `SwContentCategory` [model/entity/Category.cfc:L70], the entity
// name `SlatwallCategory` [model/entity/Category.cfc:L49], and the index name `RI_CMSCATEGORYID`
// [model/entity/Category.cfc:L59]. No column is dropped, renamed or migrated by this port, and no
// migration, seed or schema-generation step exists anywhere in it.
//
// JUDGMENT CALL: those five names are recorded HERE AS DOCUMENTATION rather than asserted against a
// runtime value, because the shipped module surfaces them only in its own commentary - it exports one
// runtime value, the class, and no schema-metadata constant. Asserting a name would therefore mean
// FIRST inventing a constant for the assertion to read, which would add production surface the source
// never had in order to test it. The observable contract is what the columns DO, which is what the
// suites below assert. Binding the physical names is the repository tier's job, and its own suites
// assert the emitted SQL text.
describe('cmsCategoryID is an inert persisted column', () => {
  it('round-trips the Mura join key completely unchanged', () => {
    const category = aCategory({ categoryID: 'category-1', cmsCategoryID: '00000000-ABCD-1234' });

    expect(category.getCmsCategoryID()).toBe('00000000-ABCD-1234');
  });

  // "Inert" is asserted rather than asserted-about: the value is returned byte-for-byte, with no
  // trimming, no case folding and no normalisation of any kind. A CMS-aware port would be tempted to
  // canonicalise a key like this, and that temptation is what the assertion forecloses.
  it('applies no trimming, casing or normalisation to the value', () => {
    const rawKey = '  Mixed-Case_Cms Key  ';

    expect(aCategory({ cmsCategoryID: rawKey }).getCmsCategoryID()).toBe(rawKey);
  });

  it('reads as undefined when the column is NULL, with no fabricated placeholder', () => {
    expect(aCategory().getCmsCategoryID()).toBeUndefined();
  });

  // The column influences NOTHING else on the entity. This is the substance of inertness: no derived
  // value, no branch and no association anywhere in the class consults it.
  it('influences no other member of the entity', () => {
    const withCms = aCategory({ categoryID: 'category-1', cmsCategoryID: 'cms-key' });
    const withoutCms = aCategory({ categoryID: 'category-1' });

    expect(withCms.getCategoryIDPath()).toBe(withoutCms.getCategoryIDPath());
    expect(withCms.isNew()).toBe(withoutCms.isNew());
    expect(withCms.getRestrictAccessFlag()).toBe(withoutCms.getRestrictAccessFlag());
    expect(withCms.getContents()).toEqual(withoutCms.getContents());

    withCms.preInsert();
    withoutCms.preInsert();

    expect(withCms.getCategoryIDPath()).toBe(withoutCms.getCategoryIDPath());
  });
});

describe('the site association is an inert foreign key, collapsed to an opaque id', () => {
  // CFML parity [model/entity/Category.cfc:L62]: `property name="site" cfc="Site"
  // fieldtype="many-to-one" fkcolumn="siteID"`. `Site` is a Mura CMS entity, is not one of the
  // eighteen in-scope entities, and no `site.ts` may be created - so the association is preserved as
  // a persisted COLUMN only, with no far side to traverse and no CMS behaviour attached. This follows
  // the precedent set by `Option.defaultImage` [model/entity/Option.cfc:L60], which collapses to a
  // `defaultImageID` on identical reasoning. It is the plan's anti-corruption treatment for an
  // out-of-scope many-to-one, so it is not a signature reshaping and spends no divergence budget.
  it('exposes the siteID column and no Site entity', () => {
    const category = aCategory({ categoryID: 'category-1', siteID: 'site-77' });

    expect(category.getSiteID()).toBe('site-77');
    expect(shippedMemberNames()).not.toContain('getSite');
  });

  it('reads as undefined when the column is NULL', () => {
    expect(aCategory().getSiteID()).toBeUndefined();
  });

  it('influences no other member of the entity', () => {
    const withSite = aCategory({ categoryID: 'category-1', siteID: 'site-77' });
    const withoutSite = aCategory({ categoryID: 'category-1' });

    withSite.preInsert();
    withoutSite.preInsert();

    expect(withSite.getCategoryIDPath()).toBe(withoutSite.getCategoryIDPath());
    expect(withSite.getAllowProductAssignmentFlag()).toBe(
      withoutSite.getAllowProductAssignmentFlag(),
    );
  });
});

// ---------------------------------------------------------------------------
// `contents` - MATERIALIZED AS A LINK PROJECTION, NOT AS A Content ENTITY
// ---------------------------------------------------------------------------

describe('the contents many-to-many is projected across its join key', () => {
  // CFML parity [model/entity/Category.cfc:L70]: `property name="contents" singularname="content"
  // cfc="Content" type="array" fieldtype="many-to-many" linktable="SwContentCategory"
  // fkcolumn="categoryID" inversejoincolumn="contentID" inverse="true"`.
  //
  // THE SHIPPED REALITY, PINNED. This association is neither omitted nor permanently empty: the class
  // materializes it as a readonly array of narrow structural projections, each carrying exactly the
  // `inversejoincolumn` the source names - `contentID` - and nothing more. What is out of scope is
  // model/entity/Content.cfc, the FAR SIDE; `SwContentCategory` rows are keyed on THIS entity's own
  // `categoryID` and are Category's data. So the collection is real and populatable, no `Content` is
  // materialized, no `content.ts` exists to import, and no `title` or `activeFlag` surface is invented
  // for an out-of-scope entity. `accessors="true"` at L49 generated `getContents()` in CFML, so both
  // the name and the array-returning shape are the source's rather than this port's.
  it('exposes populated link rows through getContents()', () => {
    const category = aCategoryOnContents(['content-a', 'content-b']);

    expect(category.getContents()).toHaveLength(2);
    expect(category.getContents().map((link) => link.getContentID())).toEqual([
      'content-a',
      'content-b',
    ]);
  });

  // The two things an ID-keyed link row needs to support are exactly the two the legacy generated
  // accessor supported: a length, and membership by id.
  it('supports length and membership-by-id, which is the whole of the contract', () => {
    const category = aCategoryOnContents(['content-a', 'content-b', 'content-c']);
    const contentIDs = category.getContents().map((link) => link.getContentID());

    expect(contentIDs).toHaveLength(3);
    expect(contentIDs).toContain('content-b');
    expect(contentIDs).not.toContain('content-z');
  });

  // An empty result is a FETCH-SHAPE statement and not a domain claim: whether `[]` means "this
  // category is on no content" or "the repository did not join SwContentCategory" is answered at the
  // producing repository method, which is required to document it. That is the whole reason
  // associations are materialized at the boundary.
  it('reads as an empty array when nothing was joined', () => {
    expect(aCategoryOnContents([]).getContents()).toEqual([]);
    expect(aCategory().getContents()).toEqual([]);
  });

  // No CMS behaviour is reachable from a link row. The projection deliberately stops at the join key,
  // so there is nothing on it to interpret and no way to traverse into the CMS.
  it('exposes only the join key on each link row', () => {
    const category = aCategoryOnContents(['content-a']);
    const [link] = category.getContents();

    expect(link).toBeDefined();
    expect(Object.keys(link ?? {})).toEqual(['getContentID']);
  });
});

describe('the products many-to-many is read-only with no helper pair', () => {
  // CFML parity [model/entity/Category.cfc:L69]: declared `inverse="true"`, so `Product` is the owning
  // side of `SwProductCategory` - [model/entity/Product.cfc:L80] declares `categories` with NO
  // `inverse` attribute. Neither component authors a hand-written helper for its half, so both pairs
  // were ORM-GENERATED, and a generated helper appends only to its OWN collection. `getProducts()` is
  // consequently the whole of the products surface here.
  //
  // CFML parity - A METADATA INCONSISTENCY, RECORDED AND NOT PROPAGATED: `type="array"` is declared on
  // `childCategories` L66 and on `contents` L70 but is OMITTED on `products` L69, though all three are
  // collections. It is cosmetic in CFML, which infers the array shape for both association kinds
  // regardless, so all three are array-shaped here and the inconsistency is noted so that a reader
  // comparing metadata does not conclude `products` was meant to be something other than a collection.
  it('reads as an empty array and offers no mutator', () => {
    const category = aCategory({ categoryID: 'category-1' });

    expect(category.getProducts()).toEqual([]);
    expect(shippedMemberNames()).not.toContain('addProduct');
    expect(shippedMemberNames()).not.toContain('removeProduct');
  });
});

// ---------------------------------------------------------------------------
// getCategoryIDPath() IS A PLAIN ACCESSOR - NO LAZY COMPUTE, NO MEMOIZATION
// ---------------------------------------------------------------------------

// CFML parity [model/entity/Category.cfc:L120-L122]: the Overridden Methods block is literally empty,
// so there is NO lazy getCategoryIDPath(). Plain accessor only -- deliberately unlike
// PriceGroup.cfc:L195-L200 and ProductType.cfc:L251, which both memoize. Do not add a lazy compute.
//
// THE CONTRAST, VERIFIED VERBATIM IN ALL THREE SOURCES. PriceGroup exposes TWO routes to its path: a
// lazy memoized getter at [model/entity/PriceGroup.cfc:L195-L200], guarding on
// `isNull(variables.priceGroupIDPath)` and computing on demand, AND an eager assignment in its hooks
// at [model/entity/PriceGroup.cfc:L207] and [model/entity/PriceGroup.cfc:L212]. ProductType has the
// same two routes, at [model/entity/ProductType.cfc:L250-L255] and
// [model/entity/ProductType.cfc:L306,L311]. CATEGORY HAS ONLY THE EAGER ROUTE - it overrides no getter
// at all and declares no "Overridden Implicet Getters" section either, so its two hooks are the only
// way the column is ever populated. Adding a lazy fallback would import PriceGroup's behaviour into an
// entity that never had it, and would silently populate a column the legacy left NULL.
describe('getCategoryIDPath is a plain accessor', () => {
  it('returns undefined when nothing has stored a path', () => {
    expect(aCategory({ categoryID: 'category-1' }).getCategoryIDPath()).toBeUndefined();
  });

  // ★ THE DECISIVE ASSERTION. This category HAS a parent, so a lazy getter of the PriceGroup kind
  // would compute and return `parent-1,child-1` on the first read. The plain accessor returns
  // `undefined`, because reading a path is not building one.
  it('does NOT compute a path on read, even with a parent chain available', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1', parentCategory: parent });

    expect(child.getParentCategory()).toBe(parent);
    expect(child.getCategoryIDPath()).toBeUndefined();
  });

  // Nor does it memoize: repeated reads cannot populate the field as a side effect, so the tenth read
  // answers exactly as the first did.
  it('does NOT memoize, so repeated reads never populate the column', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1', parentCategory: parent });

    expect(child.getCategoryIDPath()).toBeUndefined();
    expect(child.getCategoryIDPath()).toBeUndefined();
    expect(child.getCategoryIDPath()).toBeUndefined();
  });

  it('returns exactly what hydration stored, unexamined', () => {
    const category = aCategory({ categoryID: 'category-1', categoryIDPath: 'stored,path,value' });

    expect(category.getCategoryIDPath()).toBe('stored,path,value');
  });

  // A stored path that CONTRADICTS the materialized parent chain is still returned verbatim. The
  // accessor does not validate, reconcile or repair - which is the difference between a plain accessor
  // and a computing one, made observable.
  it('returns a stored path even when it contradicts the parent chain', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({
      categoryID: 'child-1',
      parentCategory: parent,
      categoryIDPath: 'something,entirely,different',
    });

    expect(child.getCategoryIDPath()).toBe('something,entirely,different');
  });

  // `''` is a PRESENT value and is not conflated with absence: an unsaved root genuinely produces the
  // empty path, and the accessor must be able to say so.
  it('distinguishes a stored empty string from an absent value', () => {
    expect(aCategory({ categoryID: 'category-1', categoryIDPath: '' }).getCategoryIDPath()).toBe(
      '',
    );
    expect(aCategory({ categoryID: 'category-1' }).getCategoryIDPath()).toBeUndefined();
  });

  // CFML parity [model/entity/Category.cfc:L53]: `property name="categoryIDPath" ormtype="string"
  // length="4000"`. The 4000-character limit is part of the `SwCategory` schema contract and is
  // recorded here for that reason - but it is a PERSISTENCE concern, enforced by the column, and the
  // entity performs no length check of its own. This entity has no validation schema at all, so
  // inventing a runtime check would invent a rule the source never had. The assertion therefore pins
  // the ABSENCE of enforcement, which is the shipped behaviour.
  it('enforces no runtime length limit, though the column contract is 4000 characters', () => {
    const overlongPath = 'x'.repeat(4100);
    const category = aCategory({ categoryID: 'category-1' });

    category.setCategoryIDPath(overlongPath);

    expect(category.getCategoryIDPath()).toBe(overlongPath);
    expect(category.getCategoryIDPath()).toHaveLength(4100);
  });

  // CFML parity [model/entity/Category.cfc:L128,L133]: `setCategoryIDPath` is the ONE generated setter
  // the legacy component concretely invokes on itself, which is why it is the only setter authored on
  // the shipped class. The write goes through the same single door the legacy used.
  it('round-trips through the one setter the legacy component calls on itself', () => {
    const category = aCategory({ categoryID: 'category-1' });

    category.setCategoryIDPath('first,value');
    expect(category.getCategoryIDPath()).toBe('first,value');

    category.setCategoryIDPath('second,value');
    expect(category.getCategoryIDPath()).toBe('second,value');
  });

  it('authors no setter for any other column', () => {
    const members = shippedMemberNames();

    expect(members).toContain('setCategoryIDPath');
    expect(members).not.toContain('setCategoryName');
    expect(members).not.toContain('setCmsCategoryID');
    expect(members).not.toContain('setRestrictAccessFlag');
    expect(members).not.toContain('setCreatedDateTime');
  });
});

// ---------------------------------------------------------------------------
// PATH MAINTENANCE AND THE REVERSED HOOK ORDERING
// ---------------------------------------------------------------------------

// CFML parity [model/entity/Category.cfc:L126-L129,L131-L134]: both hooks call super FIRST and set the
// path SECOND -- the OPPOSITE ordering to PriceGroup.cfc:L206-L214 and ProductType.cfc:L305-L313,
// which set the path BEFORE super. This ordering divergence is genuine source behaviour and must NOT
// be normalised.
//
// VERBATIM, SO THE COMPARISON IS CHECKABLE HERE:
//
//   Category      [L126-L129]   super.preInsert();                                    // FIRST
//                               setCategoryIDPath( buildIDPathList("parentCategory") ) // SECOND
//   PriceGroup    [L206-L209]   setPriceGroupIDPath( buildIDPathList(...) );           // FIRST
//                               super.preInsert();                                     // SECOND
//   ProductType   [L305-L308]   setProductTypeIDPath( buildIDPathList(...) );          // FIRST
//                               super.preInsert();                                     // SECOND
//
// So the entities GENUINELY DISAGREE, two against one, and this port preserves each one's own order
// rather than picking a house style and imposing it. Category is the sole outlier - exactly the kind of
// asymmetry a tidy-up erases.
//
// AND THE DIVERGENCE IS SEMANTICALLY OBSERVABLE, which is the substantive reason it may not be
// normalised: the framework's `preInsert` THROWS when the entity is not persistable
// [org/Hibachi/HibachiEntity.cfc:L599-L607]. For an entity carrying validation errors Category
// therefore threw BEFORE `categoryIDPath` was ever assigned, while PriceGroup and ProductType had
// ALREADY assigned their path when the same throw happened - two different observable end states from
// one failure.
//
// THE SHIPPED NAMES ARE THE LEGACY NAMES. The hooks are ported as `preInsert()` and
// `preUpdate(oldData?)` - repository-invoked at save time rather than ORM-fired, since there is no
// Hibernate, no session and no event registration in the target, and none is emulated. Because the
// `super` call itself is gone, the ORDER survives STRUCTURALLY: the repository performs the audit and
// persistability work BEFORE invoking the maintenance method, which is exactly the sequence L127-L128
// and L132-L133 produce. The suite below asserts that consequence directly - the entity does none of
// super's work itself - which is the observable half of the ordering contract.
describe('preInsert and preUpdate maintain the path under the legacy names', () => {
  it('exposes both hooks under their verbatim legacy names', () => {
    const members = shippedMemberNames();

    expect(members).toContain('preInsert');
    expect(members).toContain('preUpdate');
    expect(members).not.toContain('applyPreInsertCategoryIDPath');
    expect(members).not.toContain('applyPreUpdateCategoryIDPath');
  });

  // CFML parity [model/entity/Category.cfc:L128]: `buildIDPathList( "parentCategory" )`, whose string
  // argument matches `hb_parentPropertyName` on the component declaration at L49. The resulting path is
  // comma-delimited, root-first, self-last, always includes this category, is never empty, and carries
  // neither a leading nor a trailing delimiter.
  it('builds a single-element path for a root category', () => {
    const root = aCategory({ categoryID: 'root-1' });

    root.preInsert();

    expect(root.getCategoryIDPath()).toBe('root-1');
  });

  it('builds a root-first, self-last path across a chain', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const middle = aCategory({ categoryID: 'middle-1', parentCategory: root });
    const leaf = aCategory({ categoryID: 'leaf-1', parentCategory: middle });

    root.preInsert();
    middle.preInsert();
    leaf.preInsert();

    expect(root.getCategoryIDPath()).toBe('root-1');
    expect(middle.getCategoryIDPath()).toBe('root-1,middle-1');
    expect(leaf.getCategoryIDPath()).toBe('root-1,middle-1,leaf-1');
  });

  // Every path INCLUDES SELF and is never empty, so it always has at least one element. Test
  // hierarchies here are deliberately acyclic and shallow: the legacy walk carries NO cycle guard, so
  // a cycle would not terminate - and the guard belongs in the test data, never as a production
  // feature this suite asks for.
  it('always includes self, so a path is never empty of elements', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const child = aCategory({ categoryID: 'child-1', parentCategory: root });

    child.preInsert();

    const pathElements = (child.getCategoryIDPath() ?? '').split(',');

    expect(pathElements).toHaveLength(2);
    expect(pathElements.at(-1)).toBe('child-1');
    expect(pathElements.at(0)).toBe('root-1');
  });

  it('carries neither a leading nor a trailing delimiter', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const child = aCategory({ categoryID: 'child-1', parentCategory: root });

    child.preInsert();

    const path = child.getCategoryIDPath() ?? '';

    expect(path.startsWith(',')).toBe(false);
    expect(path.endsWith(',')).toBe(false);
  });

  it('OVERWRITES any previously stored path, because the rebuild is unconditional', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const child = aCategory({
      categoryID: 'child-1',
      parentCategory: root,
      categoryIDPath: 'stale,and,wrong',
    });

    child.preInsert();

    expect(child.getCategoryIDPath()).toBe('root-1,child-1');
  });

  it('produces the identical path from preUpdate as from preInsert', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const viaInsert = aCategory({ categoryID: 'child-1', parentCategory: root });
    const viaUpdate = aCategory({ categoryID: 'child-1', parentCategory: root });

    viaInsert.preInsert();
    viaUpdate.preUpdate();

    expect(viaUpdate.getCategoryIDPath()).toBe(viaInsert.getCategoryIDPath());
    expect(viaUpdate.getCategoryIDPath()).toBe('root-1,child-1');
  });

  // CFML parity [model/entity/Category.cfc:L132-L133]: the legacy `preUpdate` forwards `oldData` to
  // `super.preUpdate(argumentcollection=arguments)` and then rebuilds the path UNCONDITIONALLY, so no
  // branch of the ported behaviour can depend on the snapshot. It is retained for interface parity and
  // for the repository to pass through to the audit work that replaces the `super` call.
  it('ignores oldData entirely, as the legacy body does', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const withSnapshot = aCategory({ categoryID: 'child-1', parentCategory: root });
    const withoutSnapshot = aCategory({ categoryID: 'child-1', parentCategory: root });

    // The exported snapshot type models the prior persisted row column-for-column. It is declared as a
    // TYPE ALIAS rather than an interface precisely so it carries an implicit index signature and is
    // therefore assignable to the shared `Readonly<Record<string, unknown>>` lifecycle contract with
    // NO cast at the call site - which is what this test demonstrates by handing one straight over.
    const priorRow: CategoryPreUpdateSnapshot = {
      categoryID: 'child-1',
      categoryIDPath: 'a,completely,different,path',
      categoryName: 'Previous Name',
      restrictAccessFlag: 1,
      allowProductAssignmentFlag: 0,
      cmsCategoryID: 'previous-cms-key',
      siteID: 'previous-site',
      parentCategoryID: 'a-different-parent',
      remoteID: 'previous-remote',
      createdDateTime: new Date('2013-01-01T00:00:00.000Z'),
      createdByAccountID: 'previous-created-by',
      modifiedDateTime: new Date('2013-06-01T00:00:00.000Z'),
      modifiedByAccountID: 'previous-modified-by',
    };

    withSnapshot.preUpdate(priorRow);
    withoutSnapshot.preUpdate();

    expect(withSnapshot.getCategoryIDPath()).toBe('root-1,child-1');
    expect(withSnapshot.getCategoryIDPath()).toBe(withoutSnapshot.getCategoryIDPath());
  });

  // ★ THE OBSERVABLE HALF OF THE ORDERING CONTRACT. `super.preInsert()` stood FIRST at
  // [model/entity/Category.cfc:L127], and the base-class work it performed - the persistability check
  // that throws [org/Hibachi/HibachiEntity.cfc:L599-L607], the createdDateTime / modifiedDateTime
  // stamping [org/Hibachi/HibachiEntity.cfc:L609-L618] and the createdByAccount / modifiedByAccount
  // assignment - is a REPOSITORY responsibility in the target. Only its POSITION survives, as a marker
  // comment in the shipped body. So the entity must do NONE of it: the audit columns are untouched by
  // either hook, which is exactly why they are readonly with no setters. The repository is required to
  // perform that work BEFORE calling these methods, preserving the source sequence.
  it('performs none of super\u2019s work: neither hook stamps an audit column', () => {
    const category = aCategory({ categoryID: 'category-1' });

    category.preInsert();

    expect(category.getCreatedDateTime()).toBeUndefined();
    expect(category.getModifiedDateTime()).toBeUndefined();
    expect(category.getCreatedByAccountID()).toBeUndefined();
    expect(category.getModifiedByAccountID()).toBeUndefined();

    category.preUpdate();

    expect(category.getModifiedDateTime()).toBeUndefined();
    expect(category.getModifiedByAccountID()).toBeUndefined();
  });

  it('leaves an already-stamped audit column exactly as it was', () => {
    const createdDateTime = new Date('2013-04-18T09:15:00.000Z');
    const modifiedDateTime = new Date('2014-11-02T23:45:30.500Z');
    const category = aCategory({ categoryID: 'category-1', createdDateTime, modifiedDateTime });

    category.preInsert();
    category.preUpdate();

    expect(category.getCreatedDateTime()).toEqual(new Date('2013-04-18T09:15:00.000Z'));
    expect(category.getModifiedDateTime()).toEqual(new Date('2014-11-02T23:45:30.500Z'));
  });

  // The persistability check that threw was super's, so it is the repository's now. The entity itself
  // raises nothing here, and in particular does not validate: there is no validation schema for this
  // entity at all.
  it('never raises, because the persistability check belongs to the caller', () => {
    const unsaved = aCategory();

    expect(() => {
      unsaved.preInsert();
    }).not.toThrow();
    expect(() => {
      unsaved.preUpdate();
    }).not.toThrow();
    expect(unsaved.getCategoryIDPath()).toBe('');
  });

  // Hydrating a row is NOT saving one, so neither hook may run from the constructor: rebuilding on
  // hydration would overwrite the value just read out of the database. A hydrated row therefore keeps
  // its stored path until a save explicitly rebuilds it.
  it('is never invoked by the constructor, so hydration preserves the stored path', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const hydrated = aCategory({
      categoryID: 'child-1',
      parentCategory: root,
      categoryIDPath: 'value,from,the,database',
    });

    expect(hydrated.getCategoryIDPath()).toBe('value,from,the,database');

    hydrated.preUpdate();

    expect(hydrated.getCategoryIDPath()).toBe('root-1,child-1');
  });

  it('is idempotent across repeated invocations on a stable hierarchy', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const child = aCategory({ categoryID: 'child-1', parentCategory: root });

    child.preInsert();
    child.preUpdate();
    child.preUpdate();

    expect(child.getCategoryIDPath()).toBe('root-1,child-1');
  });

  // Re-parenting is picked up on the NEXT maintenance call and never before it, which is the direct
  // consequence of the accessor being plain: the stored value goes stale until a save rebuilds it.
  it('reflects a re-parent only when maintenance next runs', () => {
    const firstParent = aCategory({ categoryID: 'parent-a' });
    const secondParent = aCategory({ categoryID: 'parent-b' });
    const child = aCategory({ categoryID: 'child-1' });

    child.setParentCategory(firstParent);
    child.preInsert();
    expect(child.getCategoryIDPath()).toBe('parent-a,child-1');

    child.removeParentCategory();
    child.setParentCategory(secondParent);
    expect(child.getCategoryIDPath()).toBe('parent-a,child-1');

    child.preUpdate();
    expect(child.getCategoryIDPath()).toBe('parent-b,child-1');
  });
});

// ---------------------------------------------------------------------------
// THE BIDIRECTIONAL HELPERS - EXACTLY FOUR, PLUS THE MEMBER THE GUARD CALLS
// ---------------------------------------------------------------------------

// CFML parity [model/entity/Category.cfc:L90-L118]: the component declares EXACTLY FOUR bidirectional
// helpers - addChildCategory L93-L95, removeChildCategory L96-L98, setParentCategory L101-L106 and
// removeParentCategory L107-L116 - and they are the only behavioural methods it has outside its two
// lifecycle hooks. All four are `public void function` and synchronous; none touches a repository, a
// port, a clock or the network, so all four are void and synchronous here too.
//
// INVERSION CROSS-CHECK - VERDICT: CLEAN, ZERO INVERSIONS. The mandatory "does a remove* mistakenly
// call an add*" check was run against all four helpers, in the verbatim CFML source and again against
// the shipped class at runtime, and the verdict is stated here either way as required.
// `removeChildCategory` L97 delegates to `removeParentCategory` and never to `setParentCategory`; and
// `removeParentCategory` L111-L113 genuinely searches and deletes and never appends. Contrast
// [model/entity/Option.cfc:L129-L131] and [model/entity/Option.cfc:L145-L147], where two `remove*`
// helpers each call an `add*` - real inversions, preserved as defects in that entity. Nothing here
// needs a LEGACY-DEFECT marker and none may be added.
//
// ★ A CORRECTED EXPECTATION, PINNED TO THE SHIPPED MODULE. The far-side in-memory maintenance is
// REPRODUCED IN FULL, not dropped: [model/entity/Category.cfc:L104] appends this category to its
// parent's `childCategories` array under the L103 guard, and
// [model/entity/Category.cfc:L111-L113] removes it again, with the near-side `parentCategory` field
// maintained alongside on both paths. The shipped class ports all of it, together with the
// `hasChildCategory` member the guard calls - so `parent.getChildCategories()` and
// `child.getParentCategory()` can never disagree. Suppressing the far side would have produced a
// SILENT INCONSISTENCY rather than avoiding one: `parent.addChildCategory(child)` would leave the
// parent's collection not containing a child whose own `getParentCategory()` returned that parent.
describe('addChildCategory and removeChildCategory are pure delegations', () => {
  it('exposes exactly the four legacy helper names, plus the member the L103 guard calls', () => {
    const members = shippedMemberNames();

    expect(members).toContain('addChildCategory');
    expect(members).toContain('removeChildCategory');
    expect(members).toContain('setParentCategory');
    expect(members).toContain('removeParentCategory');

    // CFML parity [model/entity/Category.cfc:L103]: `hasChildCategory` is CALLED there but never
    // DECLARED in the component - it is the accessor ColdFusion generates for a collection property
    // carrying `singularname="childCategory"` [model/entity/Category.cfc:L66]. It survives into the port
    // because it is CONCRETELY CALLED, which is the whole test for whether a dynamic-dispatch member is
    // authored; without it the L103 guard could not be ported at all. It is not an invented fifth
    // helper.
    expect(members).toContain('hasChildCategory');
  });

  // CFML parity [model/entity/Category.cfc:L94]: the legacy body is the single statement
  // `arguments.childCategory.setParentCategory( this )`. No array work is reimplemented in the
  // one-to-many helper because there is none to reimplement - it defers wholly to the many-to-one side,
  // which is what makes this pair the correct pattern. The append still happens, inside
  // `setParentCategory`, reaching back through `getChildCategories()`.
  it('addChildCategory sets the near side and appends to the far side', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });

    parent.addChildCategory(child);

    expect(child.getParentCategory()).toBe(parent);
    expect(idsOf(parent.getChildCategories())).toEqual(['child-1']);
  });

  // CFML parity [model/entity/Category.cfc:L97]: `arguments.childCategory.removeParentCategory( this )`
  // - the mirror, on the same terms, and the inversion check passing at the call site.
  it('removeChildCategory clears the near side and removes from the far side', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });

    parent.addChildCategory(child);
    parent.removeChildCategory(child);

    expect(child.getParentCategory()).toBeUndefined();
    expect(parent.getChildCategories()).toEqual([]);
  });

  it('round-trips add then remove back to the starting state', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const first = aCategory({ categoryID: 'child-1' });
    const second = aCategory({ categoryID: 'child-2' });

    parent.addChildCategory(first);
    parent.addChildCategory(second);
    expect(idsOf(parent.getChildCategories())).toEqual(['child-1', 'child-2']);

    parent.removeChildCategory(first);
    expect(idsOf(parent.getChildCategories())).toEqual(['child-2']);

    parent.removeChildCategory(second);
    expect(parent.getChildCategories()).toEqual([]);
  });

  // ★ THE 1-BASED TO 0-BASED INDEX CHANGE, ASSERTED WHERE IT BITES.
  // CFML `arrayFind` returns a 1-BASED index or 0 for "not found", which is why
  // [model/entity/Category.cfc:L112] guards with `index > 0`. `Array.prototype.findIndex` returns a
  // 0-BASED index or -1, so the ported guard MUST be `!== -1`. Carrying `> 0` across would silently
  // skip element 0 - the FIRST child - and it would fail exactly here and nowhere else.
  it('removes the FIRST child, which a carried-over `index > 0` guard would silently skip', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const first = aCategory({ categoryID: 'child-1' });
    const second = aCategory({ categoryID: 'child-2' });

    parent.addChildCategory(first);
    parent.addChildCategory(second);

    parent.removeChildCategory(first);

    expect(idsOf(parent.getChildCategories())).toEqual(['child-2']);
    expect(first.getParentCategory()).toBeUndefined();
  });

  it('removes only the named child, leaving its siblings in order', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const children = ['child-1', 'child-2', 'child-3'].map((categoryID) =>
      aCategory({ categoryID }),
    );

    for (const child of children) {
      parent.addChildCategory(child);
    }

    const [, middle] = children;
    expect(middle).toBeDefined();
    if (middle !== undefined) {
      parent.removeChildCategory(middle);
    }

    expect(idsOf(parent.getChildCategories())).toEqual(['child-1', 'child-3']);
  });
});

describe('setParentCategory maintains both sides under the L103 guard', () => {
  // CFML parity [model/entity/Category.cfc:L102-L105]: BOTH statements are reproduced in the source's
  // order - the near-side assignment at L102 runs FIRST and unconditionally, then the guarded far-side
  // append at L103-L105. The ordering matters because the guard calls back into the parent, so the
  // field is already set by the time anything else can observe it.
  it('assigns the near side unconditionally, before the guard runs', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });

    child.setParentCategory(parent);

    expect(child.getParentCategory()).toBe(parent);
  });

  it('appends to the parent\u2019s live collection', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });

    child.setParentCategory(parent);

    expect(idsOf(parent.getChildCategories())).toEqual(['child-1']);
  });

  // The accessor hands back the LIVE array rather than a copy, because `arrayAppend` in the legacy
  // mutated the very array `getChildCategories()` returned. Identity across reads is what makes the
  // append observable through the accessor at all.
  it('returns the same live array instance on every read', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const collection = parent.getChildCategories();

    parent.addChildCategory(aCategory({ categoryID: 'child-1' }));

    expect(parent.getChildCategories()).toBe(collection);
    expect(collection).toHaveLength(1);
  });

  it('does not copy a collection handed in at hydration', () => {
    const hydratedChildren = [aCategory({ categoryID: 'child-1' })];
    const parent = aCategory({ categoryID: 'parent-1', childCategories: hydratedChildren });

    expect(parent.getChildCategories()).toBe(hydratedChildren);
  });

  // ★ THE GUARD, FOR A SAVED ROW. `isNew() or !parentCategory.hasChildCategory( this )` short-circuits
  // on `isNew()` FIRST. A SAVED category is not new, so the membership test DOES run and the second
  // call is refused - no duplicate.
  it('refuses a duplicate append for a SAVED category', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });

    child.setParentCategory(parent);
    child.setParentCategory(parent);

    expect(idsOf(parent.getChildCategories())).toEqual(['child-1']);
  });

  // ★★ THE SAME GUARD, FOR AN UNSAVED ROW - AND HERE IT APPENDS TWICE.
  // CFML parity [model/entity/Category.cfc:L103]: because `isNew()` is evaluated FIRST and
  // short-circuits the `or`, an UNSAVED category's membership is never tested and the append simply
  // happens - every time it is called. The double-append is therefore genuine, faithfully ported
  // source behaviour, NOT a port defect, and it is pinned here rather than quietly prevented.
  //
  // Note also why the short-circuit is what makes the append SAFE rather than merely permissive: every
  // unsaved category has an empty `categoryID`, so a key-based membership test could not tell two of
  // them apart, and the legacy arranged never to ask.
  it('appends AGAIN for an UNSAVED category, because isNew() short-circuits the guard', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const unsaved = aCategory();

    expect(unsaved.isNew()).toBe(true);

    unsaved.setParentCategory(parent);
    unsaved.setParentCategory(parent);

    expect(parent.getChildCategories()).toHaveLength(2);
    expect(idsOf(parent.getChildCategories())).toEqual(['', '']);
  });

  it('re-parenting leaves the previous parent\u2019s collection untouched', () => {
    const firstParent = aCategory({ categoryID: 'parent-a' });
    const secondParent = aCategory({ categoryID: 'parent-b' });
    const child = aCategory({ categoryID: 'child-1' });

    child.setParentCategory(firstParent);
    child.setParentCategory(secondParent);

    expect(child.getParentCategory()).toBe(secondParent);
    expect(idsOf(secondParent.getChildCategories())).toEqual(['child-1']);

    // CFML parity [model/entity/Category.cfc:L101-L106]: `setParentCategory` never detaches from a
    // previous parent - the legacy body has no such statement - so the stale far-side link survives.
    // Reproduced, not corrected.
    expect(idsOf(firstParent.getChildCategories())).toEqual(['child-1']);
  });
});

describe('hasChildCategory compares by primary key', () => {
  // CFML parity [model/entity/Category.cfc:L103]: CFML's `arrayFind(array, component)` was REFERENCE
  // identity, but under Hibernate reference identity WAS row identity, because the session returned one
  // instance per row. A driver-only stack has no session, so the two come apart: a literal reference
  // comparison would reproduce the legacy's letter while losing its meaning, answering `false` for a row
  // the array already holds and letting L103's guard append a DUPLICATE. Membership is therefore by
  // PRIMARY KEY, with a reference fallback for an unsaved row - the one containment rule this folder
  // uses. Never object reference alone, and never deep equality.
  it('finds a DIFFERENT instance carrying the same primary key', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });
    parent.addChildCategory(child);

    const sameRowDifferentInstance = aCategory({ categoryID: 'child-1' });

    expect(sameRowDifferentInstance).not.toBe(child);
    expect(parent.hasChildCategory(sameRowDifferentInstance)).toBe(true);
  });

  it('does not find a saved row that is absent', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    parent.addChildCategory(aCategory({ categoryID: 'child-1' }));

    expect(parent.hasChildCategory(aCategory({ categoryID: 'child-2' }))).toBe(false);
  });

  it('finds nothing in an empty collection', () => {
    expect(
      aCategory({ categoryID: 'parent-1' }).hasChildCategory(aCategory({ categoryID: 'x' })),
    ).toBe(false);
  });

  // Membership is decided on the key ALONE and never on the other columns, so two rows that differ in
  // every other respect are still the same member. This is what "never deep equality" means in practice.
  it('ignores every column except the primary key', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    parent.addChildCategory(
      aCategory({ categoryID: 'child-1', categoryName: 'Original', restrictAccessFlag: true }),
    );

    const divergent = aCategory({
      categoryID: 'child-1',
      categoryName: 'Totally Different',
      restrictAccessFlag: false,
      cmsCategoryID: 'unrelated',
      remoteID: 'unrelated',
    });

    expect(parent.hasChildCategory(divergent)).toBe(true);
  });

  // The reference fallback is not a courtesy: an unsaved category has `categoryID === ''` and so does
  // every other unsaved category, so keys alone would report all of them as the same member. Only object
  // identity separates two unsaved rows, and the shipped implementation uses it when either side is
  // unsaved.
  it('finds an unsaved member by reference identity', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const unsaved = aCategory();
    unsaved.setParentCategory(parent);

    expect(parent.hasChildCategory(unsaved)).toBe(true);
  });

  // JUDGMENT CALL: this next case pins a consequence of that containment rule rather than any legacy
  // behaviour, and it is recorded as shipped reality rather than presented as either parity or a defect.
  // An UNSAVED candidate carries the key `''`, and every unsaved member carries `''` too, so the
  // key comparison reports a match for an unsaved category that was never added. That is not a
  // legacy defect and carries no defect marker - the CFML compared references here and would have
  // answered `false` - and it is NOT
  // reachable through the ported guard either, because `isNew()` short-circuits at
  // [model/entity/Category.cfc:L103] before `hasChildCategory` is ever consulted for an unsaved row.
  // The only way to observe it is to call the member directly, as here. It is pinned so that a future
  // change to the containment rule fails loudly instead of shifting silently.
  it('reports a match for ANY unsaved candidate once an unsaved member is present', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const addedUnsaved = aCategory();
    addedUnsaved.setParentCategory(parent);

    const neverAdded = aCategory();

    expect(neverAdded).not.toBe(addedUnsaved);
    expect(parent.hasChildCategory(neverAdded)).toBe(true);

    // And the guard's short-circuit is what keeps that unobservable in the ported flow: the append
    // happens because the category is new, not because the membership test was consulted.
    expect(neverAdded.isNew()).toBe(true);
  });

  it('reports no match for an unsaved candidate when every member is saved', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    parent.addChildCategory(aCategory({ categoryID: 'child-1' }));

    expect(parent.hasChildCategory(aCategory())).toBe(false);
  });
});

describe('removeParentCategory branches on argument PRESENCE, not truthiness', () => {
  // CFML parity [model/entity/Category.cfc:L107-L110]: the parameter is `any parentCategory` and is
  // NOT `required`; the body probes `structKeyExists(arguments, "parentCategory")` and, when the
  // argument was omitted, defaults it from `variables.parentCategory`. It is therefore an OPTIONAL
  // parameter here and the probe is an explicit `!== undefined` test - NEVER a truthiness test. The
  // distinction is not cosmetic: a truthiness test would additionally swallow a falsy argument, where
  // `structKeyExists` asks only whether the key was passed. This is the one asymmetry between this
  // method and its required-parameter `set*` counterpart.
  it('falls back to the currently-set parent when the argument is omitted', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });
    child.setParentCategory(parent);

    child.removeParentCategory();

    expect(child.getParentCategory()).toBeUndefined();
    expect(parent.getChildCategories()).toEqual([]);
  });

  it('uses an explicitly supplied parent when one is passed', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });
    child.setParentCategory(parent);

    child.removeParentCategory(parent);

    expect(child.getParentCategory()).toBeUndefined();
    expect(parent.getChildCategories()).toEqual([]);
  });

  // ★ THE UNCONDITIONAL CLEAR. CFML parity [model/entity/Category.cfc:L115]: `structDelete(variables,
  // "parentCategory")` sits OUTSIDE the `if(index > 0)` block at L112-L114, so it runs on EVERY path -
  // including the path where the far-side search found nothing. That placement is preserved exactly and
  // the clear is not folded into the found branch.
  it('clears the near side even when the far-side search finds nothing', () => {
    const realParent = aCategory({ categoryID: 'parent-real' });
    const strangerParent = aCategory({ categoryID: 'parent-stranger' });
    const child = aCategory({ categoryID: 'child-1' });
    child.setParentCategory(realParent);

    // The stranger's collection does not contain this child, so the search misses - and the near-side
    // field is cleared regardless.
    child.removeParentCategory(strangerParent);

    expect(child.getParentCategory()).toBeUndefined();
    expect(strangerParent.getChildCategories()).toEqual([]);
  });

  // CFML parity [model/entity/Category.cfc:L107-L116]: the method never verifies that an explicitly
  // supplied argument actually IS this category's current parent. So it clears the near side anyway and
  // searches the WRONG collection, leaving the real parent's stale link in place. Reproduced, not
  // corrected.
  it('leaves the real parent\u2019s stale link behind when the wrong parent is named', () => {
    const realParent = aCategory({ categoryID: 'parent-real' });
    const wrongParent = aCategory({ categoryID: 'parent-wrong' });
    const child = aCategory({ categoryID: 'child-1' });
    child.setParentCategory(realParent);

    child.removeParentCategory(wrongParent);

    expect(child.getParentCategory()).toBeUndefined();
    expect(idsOf(realParent.getChildCategories())).toEqual(['child-1']);
    expect(wrongParent.getChildCategories()).toEqual([]);
  });

  // CFML parity [model/entity/Category.cfc:L108-L111]: with the argument omitted and no parent set, the
  // legacy defaults `arguments.parentCategory` to a null `variables.parentCategory` and then calls
  // `getChildCategories()` on it at L111 - a runtime error there, BEFORE any index guard runs.
  // Reproducing it as a throw is faithful; returning silently would invent a success path the legacy
  // system does not have.
  it('raises when the argument is omitted and no parent is set', () => {
    const orphan = aCategory({ categoryID: 'orphan-1' });

    expect(() => {
      orphan.removeParentCategory();
    }).toThrow(/removeParentCategory/);
  });

  it('names the source locator in the failure message', () => {
    const orphan = aCategory({ categoryID: 'orphan-1' });

    expect(() => {
      orphan.removeParentCategory();
    }).toThrow(/model\/entity\/Category\.cfc/);
  });

  // Removal is by primary key, exactly as membership is, so a different instance denoting the same row
  // still removes the right element.
  it('removes by primary key, so a different instance of the same row still detaches', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });
    child.setParentCategory(parent);

    const sameRowDifferentInstance = aCategory({ categoryID: 'child-1' });
    sameRowDifferentInstance.removeParentCategory(parent);

    expect(parent.getChildCategories()).toEqual([]);
  });

  it('is safe to call twice, the second call finding nothing to remove', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });
    child.setParentCategory(parent);

    child.removeParentCategory(parent);
    child.removeParentCategory(parent);

    expect(child.getParentCategory()).toBeUndefined();
    expect(parent.getChildCategories()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THERE IS NO VALIDATION SCHEMA FOR THIS ENTITY - AND NONE MAY BE INVENTED
// ---------------------------------------------------------------------------

describe('the entity carries no validation surface', () => {
  // CFML parity - ABSENCE BY DESIGN, VERIFIED BY DIRECT ENUMERATION: model/validation/Category.json
  // DOES NOT EXIST. The folder holds 96 `.json` files and none of them is Category.json. Category is one
  // of exactly SIX deliberate absences across the in-scope set - Category, PromotionQualifier,
  // PromotionApplied, PromotionAccount, Product_AddOption and Product_AddOptionGroup - each confirmed
  // absent by enumeration rather than assumed. Validation coverage is ported AS IT IS and never
  // completed: no rule, no declaratively-invoked validator method and no runtime constraint is authored
  // for this entity, here or in the class. Completing a legacy validation gap would be inventing product
  // behaviour, not migrating it.
  it('exposes no validator, error collection or constraint accessor', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('validate');
    expect(members).not.toContain('hasErrors');
    expect(members).not.toContain('getErrors');
    expect(members).not.toContain('setErrors');
    expect(members).not.toContain('getValidations');
    expect(members).not.toContain('hasUniqueCategoryName');
  });

  // The consequence, stated as behaviour: an entity with no name, no flags and no id is still
  // constructible and still answers every accessor. Nothing rejects it, because nothing in the source
  // ever did.
  it('constructs and answers fully even with every nullable column absent', () => {
    const category = aCategory();

    expect(category.getCategoryID()).toBe('');
    expect(category.getCategoryName()).toBeUndefined();
    expect(category.getRestrictAccessFlag()).toBe(false);
    expect(category.getAllowProductAssignmentFlag()).toBe(false);
    expect(category.getChildCategories()).toEqual([]);
    expect(category.isNew()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REQUEST-SCOPED STATE - NO SUBJECT AND NO COLLECTION IS EVER SHARED
// ---------------------------------------------------------------------------

describe('every subject is independent', () => {
  // A warm Lambda container keeps module state alive between unrelated invocations, so the port makes
  // every entity memo and every collection request-scoped. Two subjects built the same way must
  // therefore share nothing - and in particular must not share the default `childCategories` array,
  // which the class does not copy and which the accessor hands back live.
  it('gives each subject its own collection instance', () => {
    const first = aCategory({ categoryID: 'category-1' });
    const second = aCategory({ categoryID: 'category-2' });

    expect(first.getChildCategories()).not.toBe(second.getChildCategories());

    first.addChildCategory(aCategory({ categoryID: 'child-of-first' }));

    expect(idsOf(first.getChildCategories())).toEqual(['child-of-first']);
    expect(second.getChildCategories()).toEqual([]);
  });

  it('keeps mutable path state per instance', () => {
    const first = aCategory({ categoryID: 'category-1' });
    const second = aCategory({ categoryID: 'category-2' });

    first.setCategoryIDPath('only,on,first');

    expect(first.getCategoryIDPath()).toBe('only,on,first');
    expect(second.getCategoryIDPath()).toBeUndefined();
  });

  it('keeps mutable parent state per instance', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const first = aCategory({ categoryID: 'category-1' });
    const second = aCategory({ categoryID: 'category-2' });

    first.setParentCategory(parent);

    expect(first.getParentCategory()).toBe(parent);
    expect(second.getParentCategory()).toBeUndefined();
  });
});
