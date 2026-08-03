// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/domain/entities/category.ts`
//
// `Category` ports model/entity/Category.cfc (137 lines), a read-mostly catalog leaf and one of
// only three in-scope entities carrying a materialized comma-delimited ID path. The CFC is the SOLE
// authority for every assertion below, each locator re-verified line by line, and the shipped
// module was read in full first - where the two disagree the SHIPPED MODULE WINS.
//
// Five behaviours carry this entity's whole risk, and each has its own suite:
//
//   1. `getCategoryIDPath()` IS A PLAIN ACCESSOR. The "Overridden Methods" banner at
//      [model/entity/Category.cfc:L120-L122] is literally empty, so there is no lazy memoized
//      path getter - unlike PriceGroup and ProductType, which both memoize.
//   2. THE HOOK ORDERING IS REVERSED: Category calls `super` FIRST and assigns its path SECOND
//      [model/entity/Category.cfc:L127-L128], where [model/entity/PriceGroup.cfc:L207-L208] and
//      [model/entity/ProductType.cfc:L306-L307] do the opposite.
//   3. THE CMS SURFACE IS INERT. `cmsCategoryID` [model/entity/Category.cfc:L59] and the `site`
//      association [L62] are persisted schema only; the Mura bridge is out of scope.
//   4. THE BIDIRECTIONAL HELPERS maintain BOTH sides of the parent/child link, under the guard at
//      [model/entity/Category.cfc:L103]; the clear at [L115] is UNCONDITIONAL.
//   5. THE TWO BOOLEAN COLUMNS HAVE NO ORM DEFAULT [model/entity/Category.cfc:L55-L56], so an
//      unset column must read `false` and not `undefined`.
//
// --- 100% net-new coverage - never to be presented as parity --------------
//
// MEASURED, not assumed: `find meta/tests -iname '*categor*'` returns ZERO hits across all 32
// legacy `.cfc` test components. The only legacy suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc], neither
// mentioning this entity, and [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty
// stub. Of the four cases a legacy Category test WOULD have inherited from
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc], only `defaults_are_correct()` [L64-L67] is
// observable, and it is pinned as net-new; `has_primary_id_property_name()` [L60-L62],
// `validate_as_save_for_a_new_instance_doesnt_pass()` [L51-L54] and
// `simple_representation_exists_and_is_simple()` [L56-L58] each need a framework accessor, a
// validation schema or a `getSimpleRepresentation()` that neither the CFC nor the shipped class
// provides - and there is no model/validation/Category.json.
//
// --- zero divergences spent, and no defect claimed -----------------------
//
// The defect register assigns no numbered defect to Category, both bidirectional pairs are the
// CORRECT pattern, and this entity declares no non-persistent property to memoize. The reversed
// hook ordering and the absent `addProduct`/`removeProduct` pair are `CFML parity` notes, not
// defects. Four expectations were corrected against the shipped module while writing this suite -
// the snapshot type alias, the materialized `contents` projection, the legacy-named hooks and the
// fully reproduced far-side symmetry - each recorded again at the assertion that pins it.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { Category } from '../../../../src/domain/entities/category.js';
import type { CategoryPreUpdateSnapshot } from '../../../../src/domain/entities/category.js';

/**
 * The overrides a test may supply when building a subject.
 *
 * Every slot is optional HERE and required on the class constructor, deliberately in both places:
 * the constructor requires all sixteen keys so a hydrating repository must state "I read that
 * column and found nothing" rather than silently omit it, and a test has no such obligation.
 *
 * The two flag slots accept the same wide input union the constructor does, modelled structurally
 * rather than by importing the helper's own type because this tier may reach into `src/domain/**`
 * only - while still exercising every form a MySQL driver hands over for an undefaulted
 * `ormtype="boolean"` column.
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
 * A FUNCTION AND NOT A SHARED INSTANCE. Every test calls this for its own subject, so no state
 * crosses a test boundary: `parentCategory`, `categoryIDPath` and the `childCategories` array are
 * all mutable on the class, and a shared subject would let one assertion's mutation decide
 * another's outcome. There is no `beforeEach` for the same reason, and no `afterEach` because
 * nothing here installs a spy, a fake timer or a stubbed environment value.
 *
 * `childCategories` defaults to a NEWLY CONSTRUCTED array on every call: the class does not copy
 * what it is handed and the accessor returns that very array, so a module-level literal would be
 * shared mutable state of the kind this port forbids. `products` and `contents` are deliberately
 * not exposed - `products` needs a real `Product`, and `contents` has its own builder below.
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
 * Separate from {@link aCategory} because the element type is the port's anti-corruption projection
 * of an `SwContent` row reached across the `SwContentCategory` link table
 * [model/entity/Category.cfc:L70] - the join key and nothing else. `model/entity/Content.cfc` is
 * out of scope, so an inline object supplying `getContentID()` satisfies the element contract.
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
 * `Object.getOwnPropertyNames(Category.prototype)` cannot drift the way a hand-maintained list can.
 * TypeScript's `private` is COMPILE-TIME visibility only, so the two internal helpers appear here
 * too - the honest runtime picture.
 */
function shippedMemberNames(): readonly string[] {
  return Object.getOwnPropertyNames(Category.prototype).sort();
}

// --- the shipped surface - interface parity, every absence proved at once ---

describe('the shipped member surface is exactly the ported one', () => {
  // CFML parity [model/entity/Category.cfc:L49]: `accessors="true"` generated one getter per
  // property, and the component hand-writes four bidirectional helpers plus two hooks. Public
  // method names are carried over VERBATIM in legacy camelCase - `getCategoryIDPath`, not a renamed
  // equivalent - so a reviewer can diff the two surfaces directly.
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

  // CFML parity [model/entity/Category.cfc:L69]: `products` is declared `inverse="true"` and the
  // component authors NO helper pair for it, unlike model/entity/Brand.cfc, which does author one
  // for its own products collection. Inventing `addProduct`/`removeProduct` would add public
  // surface the legacy never had.
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

  // CFML parity [model/entity/Category.cfc:L62]: there is deliberately no `getSite()` returning an
  // entity, because this port has no `Site` type to return - only the opaque `siteID`.
  it('exposes no getSite, because no Site type exists in this port', () => {
    expect(shippedMemberNames()).not.toContain('getSite');
  });

  // CFML parity [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]: the inherited
  // `simple_representation_exists_and_is_simple()` case asserts
  // `isSimpleValue(getSimpleRepresentation())`. model/entity/Category.cfc DECLARES NO
  // `getSimpleRepresentation`, and the shipped class exposes none.
  it('exposes no getSimpleRepresentation, so the inherited legacy case is not forced', () => {
    expect(shippedMemberNames()).not.toContain('getSimpleRepresentation');
  });

  // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: the framework synthesised members
  // through `onMissingMethod` - eleven dispatch patterns including `hasUnique*`, `hasAny*`,
  // `get*Options`, `get*SmartList`, `get*Struct`, `get*Count` and `get*AssignedIDList`. The target
  // reproduces NONE: no Proxy, no index signature, no `evaluate()`, no dynamic dispatch. Only
  // concretely-called members are authored, so `hasChildCategory` survives - called at
  // [model/entity/Category.cfc:L103] - while the rest do not exist to be called.
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

  // CFML parity [org/Hibachi/HibachiEntity.cfc:L559,L565]: the EAV fallback guards on
  // `hasProperty("attributeValues")`. Across the eighteen in-scope entities `attributeValues` is
  // declared exactly FOUR times - [model/entity/Sku.cfc:L70], [model/entity/Product.cfc:L75],
  // [model/entity/ProductType.cfc:L67] and [model/entity/Brand.cfc:L60] - and Category is NOT among
  // them, so an unmatched `getX()` on a legacy Category threw directly at L565.
  it('carries no attribute-value surface, matching an entity that declares none', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getAttributeValue');
    expect(members).not.toContain('getAttributeValues');
    expect(members).not.toContain('clearAttributeCache');
  });

  // CFML parity [model/entity/Category.cfc:L49]: `hb_serviceName="contentService"` routes Category
  // CRUD to ContentService BY DESIGN - the SOURCE ITSELF resolves the ambiguity, and a
  // repository-wide check finds no model/service/CategoryService.cfc in the legacy tree.
  it('reaches no service: hb_serviceName="contentService" is a framework routing hint, not a member', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getService');
    expect(members).not.toContain('getCategoryService');
    expect(members).not.toContain('getContentService');
    expect(members).not.toContain('getHibachiScope');
    expect(members).not.toContain('getSlatwallScope');
  });

  // CFML parity [model/entity/Category.cfc:L86-L88,L120-L122]: two banner pairs in the source are
  // EMPTY - "Non-Persistent Property Methods" and "Overridden Methods" - as is "Non-Persistent
  // Properties" at L81-L84.
  it('invents no non-persistent property behind the two empty banners', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getCategoryNameOptions');
    expect(members).not.toContain('getParentCategoryOptions');
  });
});

// --- structural defaults on a fresh row -----------------------------------

describe('a fresh, unhydrated row', () => {
  // CFML parity [model/entity/Category.cfc:L52]: the id property declares BOTH `unsavedvalue=""`
  // and `default=""`, so the empty string is the legacy contract and not a sentinel of this port's
  // invention. `isNew()` reads that value directly: [org/Hibachi/HibachiEntity.cfc:L571-L576]
  // returns true exactly when the primary id is `""`.
  it('defaults categoryID to the empty string, so isNew() is honest', () => {
    const category = aCategory();

    expect(category.getCategoryID()).toBe('');
    expect(category.isNew()).toBe(true);
  });

  it('is not new once a persisted id is present', () => {
    expect(aCategory({ categoryID: 'saved-category' }).isNew()).toBe(false);
  });

  // An id explicitly supplied as `''` is the SAME state as an omitted one, because
  // `unsavedvalue=""` makes them the same value in the legacy schema.
  it('treats an explicitly empty id exactly as an absent one', () => {
    const category = aCategory({ categoryID: '' });

    expect(category.getCategoryID()).toBe('');
    expect(category.isNew()).toBe(true);
  });

  // CFML parity [model/entity/Category.cfc:L54,L59,L62,L73]: every nullable string column reads as
  // `undefined` when the column is SQL NULL, never as `''` and never as a fabricated placeholder.
  it('reads every nullable string column as undefined, never as an empty string', () => {
    const category = aCategory();

    expect(category.getCategoryName()).toBeUndefined();
    expect(category.getCmsCategoryID()).toBeUndefined();
    expect(category.getSiteID()).toBeUndefined();
    expect(category.getRemoteID()).toBeUndefined();
    expect(category.getCreatedByAccountID()).toBeUndefined();
    expect(category.getModifiedByAccountID()).toBeUndefined();
  });

  // CFML parity [model/entity/Category.cfc:L63]: the `parentCategory` many-to-one is `undefined`
  // for a root category, and also when the repository chose not to fetch it. The shipped field is
  // `private parentCategory: Category | undefined` - a required slot whose type includes
  // `undefined`, not an optional `parentCategory?:` - because `exactOptionalPropertyTypes` would
  // make the unconditional clear at L115 inexpressible.
  it('has no parent category', () => {
    expect(aCategory().getParentCategory()).toBeUndefined();
  });

  // A Hibernate-managed collection never handed back null: an unpopulated one-to-many read as an
  // empty array, so `[]` is parity-correct for all three.
  it('reads all three collections as empty arrays rather than undefined', () => {
    const category = aCategory();

    expect(category.getChildCategories()).toEqual([]);
    expect(category.getProducts()).toEqual([]);
    expect(category.getContents()).toEqual([]);
  });

  // CFML parity [model/entity/Category.cfc:L76,L78]: both timestamps are `ormtype="timestamp"` with
  // `hb_populateEnabled="false"`. An unstamped row reads `undefined` - NEVER the Unix epoch and
  // NEVER `0`, because a zero-valued date is a real instant in 1970 and would silently pass an "is
  // a Date" check.
  it('reads unstamped audit timestamps as undefined, never as the epoch and never as 0', () => {
    const category = aCategory();

    expect(category.getCreatedDateTime()).toBeUndefined();
    expect(category.getModifiedDateTime()).toBeUndefined();
    expect(category.getCreatedDateTime()).not.toEqual(new Date(0));
    expect(category.getModifiedDateTime()).not.toEqual(new Date(0));
  });

  // Every business-date literal in this suite is an explicit UTC ISO-8601 string.
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
  // `cfc="Account" fieldtype="many-to-one"` and model/entity/Account.cfc is out of scope, so each
  // collapses to the OPAQUE foreign-key column the association named - the same treatment `site`
  // receives. No Account class is imported or invented.
  it('collapses both audit associations to opaque account id columns', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getCreatedByAccount');
    expect(members).not.toContain('getModifiedByAccount');
    expect(members).toContain('getCreatedByAccountID');
    expect(members).toContain('getModifiedByAccountID');
  });

  // CFML parity [model/entity/Category.cfc:L73] vs [model/entity/ProductType.cfc:L80]: Category's
  // `remoteID` declares `hint="Only used when integrated with a remote system"` while ProductType's
  // identical column carries NO hint. Genuine source metadata, recorded rather than normalised; a
  // hint has no runtime effect, so the observable contract is the round trip.
  it('round-trips remoteID, the one hint-carrying column in this entity', () => {
    expect(aCategory({ remoteID: 'remote-system-key-42' }).getRemoteID()).toBe(
      'remote-system-key-42',
    );
  });
});

// --- the two boolean columns - neither has an ORM default -----------------

describe('restrictAccessFlag and allowProductAssignmentFlag have no ORM default', () => {
  // CFML parity [model/entity/Category.cfc:L55-L56]: a case-insensitive read finds exactly TWO
  // `ormtype="boolean"` properties and NEITHER declares a `default=`; the only `default=` in the
  // file is the `default=""` on the id property at L52. Either column can hydrate as SQL NULL, both
  // read through the port's shared CFML truthiness helper, and an unset flag reads `false`.
  //
  // CFML parity [model/entity/Sku.cfc:L57]: THE DEFAULT ASYMMETRY, ANNOTATED AND NOT NORMALISED.
  // [model/entity/Sku.cfc:L57] and [model/entity/Promotion.cfc:L53] declare `activeFlag` WITH
  // `default="1"`; [model/entity/Product.cfc:L56] and both flags here declare none.
  it('reads an ABSENT value as false on both flags', () => {
    const category = aCategory();

    expect(category.getRestrictAccessFlag()).toBe(false);
    expect(category.getAllowProductAssignmentFlag()).toBe(false);
  });

  // SQL NULL is an EXPECTED value for these two columns, not an error, so it resolves to `false`
  // rather than raising. `null` and `undefined` are DIFFERENT inputs - a driver hands over `null`
  // for a NULL column, an omitted key arrives as `undefined` - and both resolve the same way, which
  // is what makes the accessor total.
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
  // numeric and string spellings alike.
  it('accepts the numeric and string spellings a driver can produce', () => {
    expect(aCategory({ restrictAccessFlag: 1 }).getRestrictAccessFlag()).toBe(true);
    expect(aCategory({ restrictAccessFlag: 0 }).getRestrictAccessFlag()).toBe(false);
    expect(aCategory({ restrictAccessFlag: '1' }).getRestrictAccessFlag()).toBe(true);
    expect(aCategory({ restrictAccessFlag: '0' }).getRestrictAccessFlag()).toBe(false);
  });

  // CFML `isBoolean()` accepted these literals, and comparison was CASE-INSENSITIVE - a semantic
  // this port carries deliberately, since TypeScript comparison is not.
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

  // The two flags are INDEPENDENT columns. Asserting that guards against a hydration transposition,
  // the one defect class a per-flag test cannot catch alone.
  it('keeps the two flags independent of one another', () => {
    const category = aCategory({ restrictAccessFlag: true, allowProductAssignmentFlag: false });

    expect(category.getRestrictAccessFlag()).toBe(true);
    expect(category.getAllowProductAssignmentFlag()).toBe(false);

    const transposed = aCategory({ restrictAccessFlag: false, allowProductAssignmentFlag: true });

    expect(transposed.getRestrictAccessFlag()).toBe(false);
    expect(transposed.getAllowProductAssignmentFlag()).toBe(true);
  });

  // Both accessors return a genuine `boolean`, never the raw input passed through. A truthy string
  // surviving unconverted would satisfy an `if` and fail a `=== true` comparison, so the type is
  // asserted with the value.
  it('returns a real boolean rather than passing the raw column through', () => {
    const category = aCategory({ restrictAccessFlag: 'yes', allowProductAssignmentFlag: 1 });

    expect(typeof category.getRestrictAccessFlag()).toBe('boolean');
    expect(typeof category.getAllowProductAssignmentFlag()).toBe('boolean');
  });
});

// --- the CMS surface is inert persisted schema, with no behaviour ---------

// CFML parity [model/entity/Category.cfc:L59,L62]: cmsCategoryID (index RI_CMSCATEGORYID) and the
// site association (fkcolumn siteID) are preserved as INERT persisted columns so the Sw* schema
// contract is unbroken. The Mura CMS bridge is out of scope; no CMS behaviour is ported.
//
// C5 SCHEMA CONTINUITY, RECORDED VERBATIM. The physical names this entity binds to are the table
// `SwCategory` and the entity name `SlatwallCategory` [model/entity/Category.cfc:L49], the link
// tables `SwProductCategory` [L69] and `SwContentCategory` [L70], and the index `RI_CMSCATEGORYID`
// [L59]. No column is dropped, renamed or migrated.
//
// JUDGMENT CALL: those five names are DOCUMENTATION here rather than assertions, because the
// shipped module exports no schema-metadata constant - asserting one would mean inventing the
// constant first. Binding the physical names is the repository tier's job, and its suites assert
// the SQL.
describe('cmsCategoryID is an inert persisted column', () => {
  it('round-trips the Mura join key completely unchanged', () => {
    const category = aCategory({ categoryID: 'category-1', cmsCategoryID: '00000000-ABCD-1234' });

    expect(category.getCmsCategoryID()).toBe('00000000-ABCD-1234');
  });

  // "Inert" is asserted rather than asserted-about: the value is returned byte-for-byte, with no
  // trimming and no normalisation.
  it('applies no trimming, casing or normalisation to the value', () => {
    const rawKey = '  Mixed-Case_Cms Key  ';

    expect(aCategory({ cmsCategoryID: rawKey }).getCmsCategoryID()).toBe(rawKey);
  });

  it('reads as undefined when the column is NULL, with no fabricated placeholder', () => {
    expect(aCategory().getCmsCategoryID()).toBeUndefined();
  });

  // The column influences nothing else on the entity.
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
  // CFML parity [model/entity/Category.cfc:L62]: the `site` many-to-one declares
  //   property name="site" cfc="Site" fieldtype="many-to-one" fkcolumn="siteID";
  // `Site` is a Mura CMS entity, is not one of the eighteen in-scope entities, and no `site.ts` may
  // be created, so the association is a persisted COLUMN only with no far side to traverse -
  // exactly as `Option.defaultImage` [model/entity/Option.cfc:L60] collapses to `defaultImageID`.
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

// --- `contents` - materialized as a link projection, not a Content entity -

describe('the contents many-to-many is projected across its join key', () => {
  // CFML parity [model/entity/Category.cfc:L70]: the `contents` many-to-many declares
  //   property name="contents" singularname="content" cfc="Content" type="array"
  //   fieldtype="many-to-many" linktable="SwContentCategory" fkcolumn="categoryID"
  //   inversejoincolumn="contentID" inverse="true";
  //
  // THE SHIPPED REALITY, PINNED. Neither omitted nor permanently empty: the class materializes a
  // readonly array of narrow structural projections carrying exactly the `inversejoincolumn` the
  // source names - `contentID` - and nothing more. Out of scope is model/entity/Content.cfc, the
  // FAR SIDE; `SwContentCategory` rows are keyed on THIS entity's own `categoryID`. So no `Content`
  // is materialized, no `content.ts` exists to import, and no `title` or `activeFlag` surface is
  // invented. `accessors="true"` at L49 generated `getContents()`, so both the name and the array
  // shape are the source's, not this port's.
  it('exposes populated link rows through getContents()', () => {
    const category = aCategoryOnContents(['content-a', 'content-b']);

    expect(category.getContents()).toHaveLength(2);
    expect(category.getContents().map((link) => link.getContentID())).toEqual([
      'content-a',
      'content-b',
    ]);
  });

  // The two things an ID-keyed link row must support are the two the legacy accessor supported: a
  // length, and membership by id.
  it('supports length and membership-by-id, which is the whole of the contract', () => {
    const category = aCategoryOnContents(['content-a', 'content-b', 'content-c']);
    const contentIDs = category.getContents().map((link) => link.getContentID());

    expect(contentIDs).toHaveLength(3);
    expect(contentIDs).toContain('content-b');
    expect(contentIDs).not.toContain('content-z');
  });

  // An empty result is a FETCH-SHAPE statement and not a domain claim: whether `[]` means "this
  // category is on no content" or "the repository did not join SwContentCategory" is answered at
  // the producing repository method, which documents it.
  it('reads as an empty array when nothing was joined', () => {
    expect(aCategoryOnContents([]).getContents()).toEqual([]);
    expect(aCategory().getContents()).toEqual([]);
  });

  // No CMS behaviour is reachable from a link row.
  it('exposes only the join key on each link row', () => {
    const category = aCategoryOnContents(['content-a']);
    const [link] = category.getContents();

    expect(link).toBeDefined();
    expect(Object.keys(link ?? {})).toEqual(['getContentID']);
  });
});

describe('the products many-to-many is read-only with no helper pair', () => {
  // CFML parity [model/entity/Category.cfc:L69]: declared `inverse="true"`, so `Product` owns
  // `SwProductCategory` - [model/entity/Product.cfc:L80] declares `categories` with NO `inverse`
  // attribute. Neither component authors a hand-written helper for its half, so both pairs were
  // ORM-GENERATED, and a generated helper appends only to its OWN collection.
  //
  // CFML parity [model/entity/Category.cfc:L66,L69,L70]: A METADATA INCONSISTENCY, RECORDED AND NOT
  // PROPAGATED. `type="array"` is on `childCategories` L66 and `contents` L70 but OMITTED on
  // `products` L69, though all three are collections. Cosmetic in CFML, which infers the shape.
  it('reads as an empty array and offers no mutator', () => {
    const category = aCategory({ categoryID: 'category-1' });

    expect(category.getProducts()).toEqual([]);
    expect(shippedMemberNames()).not.toContain('addProduct');
    expect(shippedMemberNames()).not.toContain('removeProduct');
  });
});

// --- getCategoryIDPath() is a plain accessor - no lazy compute, no memo ---

// CFML parity [model/entity/Category.cfc:L120-L122]: the Overridden Methods block is literally
// empty, so there is NO lazy `getCategoryIDPath()`. Plain accessor only, deliberately unlike
// PriceGroup.cfc:L195-L200 and ProductType.cfc:L251, which both memoize.
//
// THE CONTRAST, VERIFIED VERBATIM IN ALL THREE SOURCES. PriceGroup exposes TWO routes to its path:
// a lazy memoized getter at [model/entity/PriceGroup.cfc:L195-L200] guarding on
// `isNull(variables.priceGroupIDPath)`, AND an eager assignment in its hooks at
// [model/entity/PriceGroup.cfc:L207] and [L212]. ProductType has the same two routes, at
// [model/entity/ProductType.cfc:L250-L255] and [L306,L311]. CATEGORY HAS ONLY THE EAGER ROUTE - it
// overrides no getter and declares no "Overridden Implicet Getters" section, so its two hooks are
// the only way the column is populated. A lazy fallback would import PriceGroup's behaviour into an
// entity that never had it, and would silently populate a column the legacy left NULL.
describe('getCategoryIDPath is a plain accessor', () => {
  it('returns undefined when nothing has stored a path', () => {
    expect(aCategory({ categoryID: 'category-1' }).getCategoryIDPath()).toBeUndefined();
  });

  // THE DECISIVE ASSERTION. This category HAS a parent, so a lazy getter of the PriceGroup kind
  // would compute and return `parent-1,child-1` on the first read. The plain accessor returns
  // `undefined`, because reading a path is not building one.
  it('does NOT compute a path on read, even with a parent chain available', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1', parentCategory: parent });

    expect(child.getParentCategory()).toBe(parent);
    expect(child.getCategoryIDPath()).toBeUndefined();
  });

  // Nor does it memoize: repeated reads cannot populate the field as a side effect.
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

  // A stored path that CONTRADICTS the materialized parent chain is still returned verbatim.
  it('returns a stored path even when it contradicts the parent chain', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({
      categoryID: 'child-1',
      parentCategory: parent,
      categoryIDPath: 'something,entirely,different',
    });

    expect(child.getCategoryIDPath()).toBe('something,entirely,different');
  });

  // `''` is a PRESENT value and is not conflated with absence: an unsaved root genuinely produces
  // the empty path.
  it('distinguishes a stored empty string from an absent value', () => {
    expect(aCategory({ categoryID: 'category-1', categoryIDPath: '' }).getCategoryIDPath()).toBe(
      '',
    );
    expect(aCategory({ categoryID: 'category-1' }).getCategoryIDPath()).toBeUndefined();
  });

  // CFML parity [model/entity/Category.cfc:L53]:
  //   property name="categoryIDPath" ormtype="string" length="4000";
  // The 4000-character limit is part of the `SwCategory` schema contract, but it is a PERSISTENCE
  // concern enforced by the column. The entity performs no length check, and inventing one would
  // add a rule the source never had.
  it('enforces no runtime length limit, though the column contract is 4000 characters', () => {
    const overlongPath = 'x'.repeat(4100);
    const category = aCategory({ categoryID: 'category-1' });

    category.setCategoryIDPath(overlongPath);

    expect(category.getCategoryIDPath()).toBe(overlongPath);
    expect(category.getCategoryIDPath()).toHaveLength(4100);
  });

  // CFML parity [model/entity/Category.cfc:L128,L133]: `setCategoryIDPath` is the ONE generated
  // setter the legacy component concretely invokes on itself, which is why it is the only setter
  // authored on the shipped class.
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

// --- path maintenance and the reversed hook ordering ----------------------

// CFML parity [model/entity/Category.cfc:L126-L129,L131-L134]: both hooks call super FIRST and set
// the path SECOND - the OPPOSITE ordering to PriceGroup.cfc:L206-L214 and
// ProductType.cfc:L305-L313, which set the path BEFORE super. Genuine source behaviour, and must
// NOT be normalised.
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
// THE DIVERGENCE IS SEMANTICALLY OBSERVABLE, which is why it may not be normalised: the framework's
// `preInsert` THROWS when the entity is not persistable [org/Hibachi/HibachiEntity.cfc:L599-L607],
// so for an entity carrying validation errors Category threw BEFORE `categoryIDPath` was assigned
// while PriceGroup and ProductType had ALREADY assigned theirs - two observable end states from one
// failure. Category is the sole outlier.
//
// THE SHIPPED NAMES ARE THE LEGACY NAMES: `preInsert()` and `preUpdate(oldData?)`,
// repository-invoked at save time rather than ORM-fired. Because the `super` call is gone the ORDER
// survives STRUCTURALLY: the repository does its audit and persistability work BEFORE invoking the
// maintenance method.
describe('preInsert and preUpdate maintain the path under the legacy names', () => {
  it('exposes both hooks under their verbatim legacy names', () => {
    const members = shippedMemberNames();

    expect(members).toContain('preInsert');
    expect(members).toContain('preUpdate');
    expect(members).not.toContain('applyPreInsertCategoryIDPath');
    expect(members).not.toContain('applyPreUpdateCategoryIDPath');
  });

  // CFML parity [model/entity/Category.cfc:L128]: `buildIDPathList( "parentCategory" )`, whose
  // string argument matches `hb_parentPropertyName` on the component declaration at L49.
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
  // hierarchies here are deliberately acyclic and shallow, which keeps these tests about ordering and
  // contents. A cycle is a separate question and is asserted in its own block below: the legacy walk
  // carries no cycle guard, but this port REFUSES one - `setParentCategory` will not close a cycle and
  // the shared walk will not produce a path from one - the single documented divergence from
  // [org/Hibachi/HibachiEntity.cfc:L314-L321], reasoned in full on `buildIdPathList` in
  // src/domain/valueObjects/materializedIdPath.ts.
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
  // `super.preUpdate(argumentcollection=arguments)` and then rebuilds the path UNCONDITIONALLY, so
  // no ported branch can depend on the snapshot.
  it('ignores oldData entirely, as the legacy body does', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const withSnapshot = aCategory({ categoryID: 'child-1', parentCategory: root });
    const withoutSnapshot = aCategory({ categoryID: 'child-1', parentCategory: root });

    // The exported snapshot type models the prior persisted row column-for-column. It is a TYPE
    // ALIAS rather than an interface precisely so it carries an implicit index signature and is
    // therefore assignable to the shared `Readonly<Record<string, unknown>>` lifecycle contract
    // with NO cast at the call site, which is what this test demonstrates.
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

  // THE OBSERVABLE HALF OF THE ORDERING CONTRACT. `super.preInsert()` stood FIRST at
  // [model/entity/Category.cfc:L127], and the base-class work it performed - the persistability
  // check that throws [org/Hibachi/HibachiEntity.cfc:L599-L607], the createdDateTime /
  // modifiedDateTime stamping [org/Hibachi/HibachiEntity.cfc:L609-L618] and the createdByAccount /
  // modifiedByAccount assignment - is a REPOSITORY responsibility in the target; only its POSITION
  // survives. So the audit columns are untouched by either hook.
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

  // The persistability check that threw was super's, so it is the repository's now.
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
  // hydration would overwrite the value just read out of the database.
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

  // Re-parenting is picked up on the NEXT maintenance call and never before it - the direct
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

// --- the bidirectional helpers - four, plus the member the guard calls ----

// CFML parity [model/entity/Category.cfc:L90-L118]: the component declares EXACTLY FOUR
// bidirectional helpers - addChildCategory L93-L95, removeChildCategory L96-L98, setParentCategory
// L101-L106 and removeParentCategory L107-L116 - its only behavioural methods outside the two
// lifecycle hooks. All four are `public void function` and synchronous, and none reaches a
// repository, a port, a clock or the network, so all four are void and sync here too.
//
// INVERSION CROSS-CHECK - VERDICT: CLEAN, ZERO INVERSIONS, checked in the verbatim CFML source and
// again against the shipped class at runtime. `removeChildCategory` L97 delegates to
// `removeParentCategory` and never to `setParentCategory`; `removeParentCategory` L111-L113
// genuinely searches and deletes and never appends. Contrast [model/entity/Option.cfc:L129-L131]
// and [model/entity/Option.cfc:L145-L147], where two `remove*` helpers each call an `add*` - real
// inversions, preserved as defects there. Both pairs here are `CFML parity` notes.
//
// A CORRECTED EXPECTATION, PINNED TO THE SHIPPED MODULE. The far-side in-memory maintenance is
// REPRODUCED IN FULL: [model/entity/Category.cfc:L104] appends this category to its parent's
// `childCategories` under the L103 guard and [model/entity/Category.cfc:L111-L113] removes it
// again, the near-side `parentCategory` maintained alongside on both paths, together with the
// `hasChildCategory` member the guard calls - so `parent.getChildCategories()` and
// `child.getParentCategory()` cannot disagree. Suppressing the far side would have produced a
// SILENT INCONSISTENCY: `parent.addChildCategory(child)` would leave the parent's collection not
// containing a child whose own `getParentCategory()` returned that parent.
describe('addChildCategory and removeChildCategory are pure delegations', () => {
  it('exposes exactly the four legacy helper names, plus the member the L103 guard calls', () => {
    const members = shippedMemberNames();

    expect(members).toContain('addChildCategory');
    expect(members).toContain('removeChildCategory');
    expect(members).toContain('setParentCategory');
    expect(members).toContain('removeParentCategory');

    // CFML parity [model/entity/Category.cfc:L103]: `hasChildCategory` is CALLED there but never
    // DECLARED - it is the accessor ColdFusion generates for a collection carrying
    // `singularname="childCategory"` [model/entity/Category.cfc:L66]. It survives because it is
    // CONCRETELY CALLED, the whole test for authoring a dynamic-dispatch member; without it the
    // L103 guard could not be ported.
    expect(members).toContain('hasChildCategory');
  });

  // CFML parity [model/entity/Category.cfc:L94]: the legacy body is the single statement
  // `arguments.childCategory.setParentCategory( this )`. The append still happens, inside
  // `setParentCategory`, reaching back through `getChildCategories()`.
  it('addChildCategory sets the near side and appends to the far side', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });

    parent.addChildCategory(child);

    expect(child.getParentCategory()).toBe(parent);
    expect(idsOf(parent.getChildCategories())).toEqual(['child-1']);
  });

  // CFML parity [model/entity/Category.cfc:L97]: the mirror, on the same terms, the inversion check
  // passing at the call site - `arguments.childCategory.removeParentCategory( this )`.
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

  // THE 1-BASED TO 0-BASED INDEX CHANGE, ASSERTED WHERE IT BITES. CFML `arrayFind` returns a
  // 1-BASED index or 0 for "not found", which is why [model/entity/Category.cfc:L112] guards with
  // `index > 0`; `Array.prototype.findIndex` returns 0-BASED or -1, so the ported guard MUST be
  // `!== -1`. Carrying `> 0` across would silently skip element 0, the FIRST child.
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
  // CFML parity [model/entity/Category.cfc:L102-L105]: BOTH statements are reproduced in the
  // source's order - the near-side assignment at L102 runs FIRST and unconditionally, then the
  // guarded far-side append at L103-L105.
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
  // mutated the very array `getChildCategories()` returned - identity across reads is what makes
  // the append observable.
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

  // THE GUARD, FOR A SAVED ROW. `isNew() or !parentCategory.hasChildCategory( this )`
  // short-circuits on `isNew()` FIRST.
  it('refuses a duplicate append for a SAVED category', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });

    child.setParentCategory(parent);
    child.setParentCategory(parent);

    expect(idsOf(parent.getChildCategories())).toEqual(['child-1']);
  });

  // THE SAME GUARD, FOR AN UNSAVED ROW - AND HERE IT APPENDS TWICE. CFML parity
  // [model/entity/Category.cfc:L103]: because `isNew()` is evaluated FIRST and short-circuits the
  // `or`, an UNSAVED category's membership is never tested and the append simply happens, every
  // time it is called. Genuine ported source behaviour, NOT a port defect, and the short-circuit is
  // also what makes it SAFE rather than merely permissive.
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
    // previous parent - the legacy body has no such statement - so the stale far-side link
    // survives. Reproduced, not corrected.
    expect(idsOf(firstParent.getChildCategories())).toEqual(['child-1']);
  });
});

describe('hasChildCategory compares by primary key', () => {
  // CFML parity [model/entity/Category.cfc:L103]: CFML's `arrayFind(array, component)` was
  // REFERENCE identity, but under Hibernate reference identity WAS row identity because the session
  // returned one instance per row. A driver-only stack has no session, so the two come apart: a
  // literal reference comparison would keep the legacy's letter and lose its meaning, answering
  // `false` for a row the array already holds and letting L103's guard append a DUPLICATE.
  // Membership is by PRIMARY KEY, with a reference fallback for an unsaved row.
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

  // Membership is decided on the key ALONE, so two rows differing in every other respect are still
  // the same member.
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

  // The reference fallback is not a courtesy: every unsaved category has `categoryID === ''`, so
  // keys alone would report all of them as one member.
  it('finds an unsaved member by reference identity', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const unsaved = aCategory();
    unsaved.setParentCategory(parent);

    expect(parent.hasChildCategory(unsaved)).toBe(true);
  });

  // JUDGMENT CALL: this case pins a consequence of that containment rule rather than any legacy
  // behaviour, recorded as shipped reality rather than as parity or a defect. An UNSAVED candidate
  // carries the key `''`, and so does every unsaved member, so the key comparison reports a match
  // for an unsaved category that was never added. Not a legacy defect and no defect marker - the
  // CFML compared references and would have answered `false` - and not reachable through the ported
  // guard either, because `isNew()` short-circuits at [model/entity/Category.cfc:L103] before
  // `hasChildCategory` is ever consulted for an unsaved row.
  it('reports a match for ANY unsaved candidate once an unsaved member is present', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const addedUnsaved = aCategory();
    addedUnsaved.setParentCategory(parent);

    const neverAdded = aCategory();

    expect(neverAdded).not.toBe(addedUnsaved);
    expect(parent.hasChildCategory(neverAdded)).toBe(true);

    // The short-circuit keeps that unobservable in the ported flow: the append happens because the
    // category is new, not because the membership test was consulted.
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
  // NOT `required`; the body probes `structKeyExists(arguments, "parentCategory")` and, when
  // omitted, defaults it from `variables.parentCategory`. It is OPTIONAL here and the probe is an
  // explicit `!== undefined` test - NEVER truthiness, which would also swallow a falsy argument
  // where `structKeyExists` asks only whether the key was passed.
  //
  // This is the one asymmetry with the required-parameter `set*` counterpart.
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

  // THE UNCONDITIONAL CLEAR. CFML parity [model/entity/Category.cfc:L115]:
  //   `structDelete(variables, "parentCategory")` sits OUTSIDE the `if(index > 0)` block at
  //   L112-L114, so it runs on EVERY path - including where the far-side search found nothing.
  it('clears the near side even when the far-side search finds nothing', () => {
    const realParent = aCategory({ categoryID: 'parent-real' });
    const strangerParent = aCategory({ categoryID: 'parent-stranger' });
    const child = aCategory({ categoryID: 'child-1' });
    child.setParentCategory(realParent);

    // The stranger's collection does not contain this child, so the search misses - and the
    // near-side field is cleared anyway.
    child.removeParentCategory(strangerParent);

    expect(child.getParentCategory()).toBeUndefined();
    expect(strangerParent.getChildCategories()).toEqual([]);
  });

  // CFML parity [model/entity/Category.cfc:L107-L116]: the method never verifies that an explicitly
  // supplied argument IS this category's current parent, so it clears the near side anyway and
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

  // CFML parity [model/entity/Category.cfc:L108-L111]: with the argument omitted and no parent set,
  // the legacy defaults `arguments.parentCategory` to a null `variables.parentCategory` and calls
  // `getChildCategories()` on it at L111 - a runtime error BEFORE any index guard. Reproducing it
  // as a throw is faithful; returning silently would invent a success path.
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

  // Removal is by primary key, exactly as membership is, so a different instance denoting the same
  // row still removes the right element.
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

// --- this entity carries no validation surface ----------------------------

describe('the entity carries no validation surface', () => {
  // CFML parity [model/validation/]: ABSENCE BY DESIGN, VERIFIED BY DIRECT ENUMERATION. The folder
  // holds 96 `.json` files and Category.json DOES NOT EXIST. Category is one of exactly SIX
  // deliberate absences across the in-scope set: Category, PromotionQualifier, PromotionApplied,
  // PromotionAccount, Product_AddOption and Product_AddOptionGroup. Validation coverage is ported
  // AS IT IS: completing a legacy gap would invent product behaviour.
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
  // constructible and still answers every accessor. Nothing rejects it, because nothing in the
  // source did.
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

// --- request-scoped state - no subject and no collection is ever shared ---

describe('every subject is independent', () => {
  // A warm Lambda container keeps module state alive between unrelated invocations, so the port
  // makes every entity memo and every collection request-scoped. Two subjects built the same way
  // must share nothing - in particular not the default `childCategories` array, which the class
  // does not copy and which the accessor hands back live.
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

// ===========================================================================
// CYCLIC PARENT CHAINS ARE REFUSED, NOT FOLLOWED
//
// NET-NEW coverage - `meta/tests/` holds no Category test, and there is no
// `model/validation/Category.json` either - pinning the port's single documented
// divergence from the framework path builder at
// [org/Hibachi/HibachiEntity.cfc:L314-L321], which carries no visited set and no
// bound. Two boundaries refuse: `setParentCategory` will not CREATE a cycle, and
// the shared walk will not PRODUCE a path from one. The reasoning is set out once,
// on `buildIdPathList` in src/domain/valueObjects/materializedIdPath.ts.
//
// `Category` has NO lazy path getter of its own - [model/entity/Category.cfc:L120-L122]
// is an empty block - so the walk is reached only through `preInsert`, which is
// exactly what these tests exercise.
// ===========================================================================

describe('Category - cyclic parent chains are refused', () => {
  /** Runs an operation expected to be refused; throws if it succeeds instead. */
  const captureRefusal = (operation: () => unknown): { name: string; message: string } => {
    try {
      operation();
    } catch (thrown) {
      return thrown instanceof Error
        ? { name: thrown.name, message: thrown.message }
        : { name: 'NotAnError', message: 'a value that is not an Error was thrown' };
    }

    throw new Error(
      'the operation was expected to be refused, but it completed. A cyclic parentCategory chain ' +
        'must never be created and must never yield a path.',
    );
  };

  it('refuses a category as its own parent', () => {
    const subject = aCategory({ categoryID: 'cat-self' });

    const refusal = captureRefusal(() => {
      subject.setParentCategory(subject);
    });

    expect(refusal.message).toContain("Category 'cat-self' cannot take category 'cat-self'");
    expect(refusal.message).toContain('would make the parentCategory chain cyclic');
  });

  it('refuses a descendant as its parent, walking more than one level', () => {
    const root = aCategory({ categoryID: 'cat-root' });
    const middle = aCategory({ categoryID: 'cat-middle' });
    const leaf = aCategory({ categoryID: 'cat-leaf' });

    middle.setParentCategory(root);
    leaf.setParentCategory(middle);

    const refusal = captureRefusal(() => {
      root.setParentCategory(leaf);
    });

    expect(refusal.message).toContain("Category 'cat-root' cannot take category 'cat-leaf'");
  });

  it('changes nothing when it refuses, and preInsert still builds a path afterwards', () => {
    const root = aCategory({ categoryID: 'cat-keep-root' });
    const child = aCategory({ categoryID: 'cat-keep-child' });

    child.setParentCategory(root);

    const childrenBefore = [...root.getChildCategories()];

    captureRefusal(() => {
      root.setParentCategory(child);
    });

    expect(root.getParentCategory()).toBeUndefined();
    expect(child.getParentCategory()).toBe(root);
    expect(root.getChildCategories()).toStrictEqual(childrenBefore);

    child.preInsert();
    expect(child.getCategoryIDPath()).toBe('cat-keep-root,cat-keep-child');
  });

  it('refuses through addChildCategory too, since it delegates to the setter', () => {
    const root = aCategory({ categoryID: 'cat-add-root' });
    const leaf = aCategory({ categoryID: 'cat-add-leaf' });

    leaf.setParentCategory(root);

    const refusal = captureRefusal(() => {
      leaf.addChildCategory(root);
    });

    expect(refusal.message).toContain(
      "Category 'cat-add-root' cannot take category 'cat-add-leaf'",
    );
  });

  it('allows every well-founded reparent, so a legitimate move is not penalised', () => {
    const oldRoot = aCategory({ categoryID: 'cat-old-root' });
    const newRoot = aCategory({ categoryID: 'cat-new-root' });
    const movable = aCategory({ categoryID: 'cat-movable' });

    movable.setParentCategory(oldRoot);
    movable.setParentCategory(newRoot);

    expect(movable.getParentCategory()).toBe(newRoot);

    movable.preInsert();
    expect(movable.getCategoryIDPath()).toBe('cat-new-root,cat-movable');
  });

  it('refuses in preInsert when a cycle is forced past the setter guard', () => {
    // The two guards are independent, so the walk has to be provable without
    // relying on the setter having stopped anything. The bypass is confined here.
    const lower = aCategory({ categoryID: 'cat-forced-lower' });
    const upper = aCategory({ categoryID: 'cat-forced-upper' });

    for (const [node, parent] of [
      [lower, upper],
      [upper, lower],
    ] as const) {
      Object.defineProperty(node, 'parentCategory', {
        value: parent,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    const refusal = captureRefusal(() => {
      lower.preInsert();
    });

    expect(refusal.name).toBe('CyclicIdPathError');
    expect(refusal.message).toContain('contains a cycle');
    expect(refusal.message).toContain('No path was produced');
  });
});
