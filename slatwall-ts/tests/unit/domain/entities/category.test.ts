// slatwall-ts - characterization suite pinning `src/domain/entities/category.ts`
//
// `Category` ports model/entity/Category.cfc (137 lines), a read-mostly catalog leaf and one of
// only three in-scope entities carrying a materialized comma-delimited ID path.
//
// The defect register assigns no numbered defect to Category, both bidirectional pairs are the
// CORRECT pattern, and this entity declares no non-persistent property to memoize.

import { describe, expect, it } from 'vitest';

import { Category } from '../../../../src/domain/entities/category.js';
import type { CategoryPreUpdateSnapshot } from '../../../../src/domain/entities/category.js';

/**
 * The overrides a test may supply when building a subject.
 *
 * Every slot is optional here and required on the class constructor.
 *
 * The two flag slots accept the same wide input union the constructor does, modelled structurally
 * rather than by importing the helper's own type because this tier may reach into `src/domain/**`
 * only.
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
 * `childCategories` defaults to a NEWLY CONSTRUCTED array on every call: the class does not copy
 * what it is handed and the accessor returns that very array.
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
 * Separate from {@link aCategory} because the element type is the port's anti-corruption
 * projection of an `SwContent` row reached across the `SwContentCategory` link table
 * [model/entity/Category.cfc:L70].
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

/**
 * The `categoryID` of every element, in order - the readable form of an ID-path assertion.
 */
function idsOf(categories: readonly Category[]): readonly string[] {
  return categories.map((category) => category.getCategoryID());
}

/**
 * Every member name the shipped class carries at runtime, sorted.
 *
 * `Object.getOwnPropertyNames(Category.prototype)` cannot drift the way a hand-maintained list
 * can.
 */
function shippedMemberNames(): readonly string[] {
  return Object.getOwnPropertyNames(Category.prototype).sort();
}

describe('the shipped member surface is exactly the ported one', () => {
  // CFML parity [model/entity/Category.cfc:L49]: `accessors="true"` generated one getter per
  // property, and the component hand-writes four bidirectional helpers plus two hooks.
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
  // component authors no helper pair for it, unlike model/entity/Brand.cfc, which does author one
  // for its own products collection.
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
  // `isSimpleValue(getSimpleRepresentation())`. model/entity/Category.cfc DECLARES no
  // `getSimpleRepresentation`.
  it('exposes no getSimpleRepresentation, so the inherited legacy case is not forced', () => {
    expect(shippedMemberNames()).not.toContain('getSimpleRepresentation');
  });

  // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: the framework synthesised members
  // through `onMissingMethod` - eleven dispatch patterns including `hasUnique*`, `hasAny*`,
  // `get*Options`, `get*SmartList`, `get*Struct`, `get*Count` and `get*AssignedIDList`.
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

  // CFML parity [org/Hibachi/HibachiEntity.cfc:L559, L565]: the EAV fallback guards on
  // `hasProperty("attributeValues")`.
  it('carries no attribute-value surface, matching an entity that declares none', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getAttributeValue');
    expect(members).not.toContain('getAttributeValues');
    expect(members).not.toContain('clearAttributeCache');
  });

  // CFML parity [model/entity/Category.cfc:L49]: `hb_serviceName="contentService"` routes Category
  // crud to ContentService by design - the source itself resolves the ambiguity.
  it('reaches no service: hb_serviceName="contentService" is a framework routing hint, not a member', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getService');
    expect(members).not.toContain('getCategoryService');
    expect(members).not.toContain('getContentService');
    expect(members).not.toContain('getHibachiScope');
    expect(members).not.toContain('getSlatwallScope');
  });

  // CFML parity [model/entity/Category.cfc:L86-L88, L120-L122]: two banner pairs in the source are
  // EMPTY - "Non-Persistent Property Methods" and "Overridden Methods" - as is "Non-Persistent
  // Properties" at L81-L84.
  it('invents no non-persistent property behind the two empty banners', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getCategoryNameOptions');
    expect(members).not.toContain('getParentCategoryOptions');
  });
});

describe('a fresh, unhydrated row', () => {
  // CFML parity [model/entity/Category.cfc:L52]: the id property declares both `unsavedvalue=""`
  // and `default=""`, so the empty string is the legacy contract and not a sentinel of this port's
  // invention.
  it('defaults categoryID to the empty string, so isNew() is honest', () => {
    const category = aCategory();

    expect(category.getCategoryID()).toBe('');
    expect(category.isNew()).toBe(true);
  });

  it('is not new once a persisted id is present', () => {
    expect(aCategory({ categoryID: 'saved-category' }).isNew()).toBe(false);
  });

  // An id explicitly supplied as `''` is the same state as an omitted one, because
  // `unsavedvalue=""` makes them the same value in the legacy schema.
  it('treats an explicitly empty id exactly as an absent one', () => {
    const category = aCategory({ categoryID: '' });

    expect(category.getCategoryID()).toBe('');
    expect(category.isNew()).toBe(true);
  });

  // CFML parity [model/entity/Category.cfc:L54, L59, L62, L73]: every nullable string column reads
  // as `undefined` when the column is SQL NULL, never as `''` and never as a fabricated
  // placeholder.
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
  // for a root category, and also when the repository chose not to fetch it.
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

  // CFML parity [model/entity/Category.cfc:L76, L78]: both timestamps are `ormtype="timestamp"`
  // with `hb_populateEnabled="false"`.
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

  // CFML parity [model/entity/Category.cfc:L77, L79]: `createdByAccount` and `modifiedByAccount`
  // are `cfc="Account" fieldtype="many-to-one"` and model/entity/Account.cfc is out of scope, so
  // each collapses to the OPAQUE foreign-key column the association named.
  it('collapses both audit associations to opaque account id columns', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getCreatedByAccount');
    expect(members).not.toContain('getModifiedByAccount');
    expect(members).toContain('getCreatedByAccountID');
    expect(members).toContain('getModifiedByAccountID');
  });

  // CFML parity [model/entity/Category.cfc:L73] vs [model/entity/ProductType.cfc:L80]: Category's
  // `remoteID` declares `hint="Only used when integrated with a remote system"` while
  // ProductType's identical column carries no hint.
  it('round-trips remoteID, the one hint-carrying column in this entity', () => {
    expect(aCategory({ remoteID: 'remote-system-key-42' }).getRemoteID()).toBe(
      'remote-system-key-42',
    );
  });
});

describe('restrictAccessFlag and allowProductAssignmentFlag have no ORM default', () => {
  // CFML parity [model/entity/Category.cfc:L55-L56]: a case-insensitive read finds exactly two
  // `ormtype="boolean"` properties and neither declares a `default=`; the only `default=` in the
  // file is the `default=""` on the id property at L52.
  //
  // CFML parity [model/entity/Sku.cfc:L57]: the default asymmetry, annotated and not normalised.
  it('reads an ABSENT value as false on both flags', () => {
    const category = aCategory();

    expect(category.getRestrictAccessFlag()).toBe(false);
    expect(category.getAllowProductAssignmentFlag()).toBe(false);
  });

  // SQL NULL is an EXPECTED value for these two columns, not an error, so it resolves to `false`
  // rather than raising.
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

  // The two flags are INDEPENDENT columns. Asserting that guards against a hydration
  // transposition, the one defect class a per-flag test cannot catch alone.
  it('keeps the two flags independent of one another', () => {
    const category = aCategory({ restrictAccessFlag: true, allowProductAssignmentFlag: false });

    expect(category.getRestrictAccessFlag()).toBe(true);
    expect(category.getAllowProductAssignmentFlag()).toBe(false);

    const transposed = aCategory({ restrictAccessFlag: false, allowProductAssignmentFlag: true });

    expect(transposed.getRestrictAccessFlag()).toBe(false);
    expect(transposed.getAllowProductAssignmentFlag()).toBe(true);
  });

  // Both accessors return a genuine `boolean`, never the raw input passed through.
  it('returns a real boolean rather than passing the raw column through', () => {
    const category = aCategory({ restrictAccessFlag: 'yes', allowProductAssignmentFlag: 1 });

    expect(typeof category.getRestrictAccessFlag()).toBe('boolean');
    expect(typeof category.getAllowProductAssignmentFlag()).toBe('boolean');
  });
});

// CFML parity [model/entity/Category.cfc:L59, L62]: cmsCategoryID (index RI_CMSCATEGORYID) and the
// site association (fkcolumn siteID) are preserved as INERT persisted columns so the Sw* schema
// contract is unbroken.
//
// JUDGMENT CALL: those five names are DOCUMENTATION here rather than assertions, because the
// shipped module exports no schema-metadata constant - asserting one would mean inventing the
// constant first.
describe('cmsCategoryID is an inert persisted column', () => {
  it('round-trips the Mura join key completely unchanged', () => {
    const category = aCategory({ categoryID: 'category-1', cmsCategoryID: '00000000-ABCD-1234' });

    expect(category.getCmsCategoryID()).toBe('00000000-ABCD-1234');
  });
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
  // CFML parity [model/entity/Category.cfc:L62]: the `site` many-to-one declares property
  // name="site" cfc="Site" fieldtype="many-to-one" fkcolumn="siteID"; `Site` is a Mura CMS entity,
  // is not one of the eighteen in-scope entities, and no `site.ts` may be created.
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

describe('the contents many-to-many is projected across its join key', () => {
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
  // `SwProductCategory` - [model/entity/Product.cfc:L80] declares `categories` with no `inverse`
  // attribute.
  //
  // CFML parity [model/entity/Category.cfc:L66, L69, L70]: a metadata inconsistency, recorded and
  // not propagated. `type="array"` is on `childCategories` L66 and `contents` L70 but omitted on
  // `products` L69, though all three are collections.
  it('reads as an empty array and offers no mutator', () => {
    const category = aCategory({ categoryID: 'category-1' });

    expect(category.getProducts()).toEqual([]);
    expect(shippedMemberNames()).not.toContain('addProduct');
    expect(shippedMemberNames()).not.toContain('removeProduct');
  });
});

// CFML parity [model/entity/Category.cfc:L120-L122]: the Overridden Methods block is literally
// empty, so there is no lazy `getCategoryIDPath()`. Plain accessor only, deliberately unlike
// PriceGroup.cfc:L195-L200 and ProductType.cfc:L251, which both memoize.
describe('getCategoryIDPath is a plain accessor', () => {
  it('returns undefined when nothing has stored a path', () => {
    expect(aCategory({ categoryID: 'category-1' }).getCategoryIDPath()).toBeUndefined();
  });

  // The DECISIVE ASSERTION. This category has a parent, so a lazy getter of the PriceGroup kind
  // would compute and return `parent-1,child-1` on the first read.
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

  // CFML parity [model/entity/Category.cfc:L53]: property name="categoryIDPath" ormtype="string"
  // length="4000"; The 4000-character limit is part of the `SwCategory` schema contract, but it is
  // a PERSISTENCE concern enforced by the column.
  it('enforces no runtime length limit, though the column contract is 4000 characters', () => {
    const overlongPath = 'x'.repeat(4100);
    const category = aCategory({ categoryID: 'category-1' });

    category.setCategoryIDPath(overlongPath);

    expect(category.getCategoryIDPath()).toBe(overlongPath);
    expect(category.getCategoryIDPath()).toHaveLength(4100);
  });

  // CFML parity [model/entity/Category.cfc:L128, L133]: `setCategoryIDPath` is the one generated
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

// CFML parity [model/entity/Category.cfc:L126-L129, L131-L134]: both hooks call super FIRST and
// set the path SECOND - the OPPOSITE ordering to PriceGroup.cfc:L206-L214 and
// ProductType.cfc:L305-L313, which set the path before super.
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
  // hierarchies here are deliberately acyclic and shallow, which keeps these tests about ordering
  // and contents.
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

  // CFML parity [model/entity/Category.cfc:L132-L133]: the legacy `preUpdate` forwards `oldData`
  // to `super.preUpdate(argumentcollection=arguments)` and then rebuilds the path UNCONDITIONALLY,
  // so no ported branch can depend on the snapshot.
  it('ignores oldData entirely, as the legacy body does', () => {
    const root = aCategory({ categoryID: 'root-1' });
    const withSnapshot = aCategory({ categoryID: 'child-1', parentCategory: root });
    const withoutSnapshot = aCategory({ categoryID: 'child-1', parentCategory: root });

    // The exported snapshot type models the prior persisted row column-for-column.
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

  // The observable half of the ordering contract.
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

  // Hydrating a row is not saving one, so neither hook may run from the constructor: rebuilding on
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

// CFML parity [model/entity/Category.cfc:L90-L118]: the component declares EXACTLY four
// bidirectional helpers - addChildCategory L93-L95, removeChildCategory L96-L98, setParentCategory
// L101-L106 and removeParentCategory L107-L116.
describe('addChildCategory and removeChildCategory are pure delegations', () => {
  it('exposes exactly the four legacy helper names, plus the member the L103 guard calls', () => {
    const members = shippedMemberNames();

    expect(members).toContain('addChildCategory');
    expect(members).toContain('removeChildCategory');
    expect(members).toContain('setParentCategory');
    expect(members).toContain('removeParentCategory');

    // CFML parity [model/entity/Category.cfc:L103]: `hasChildCategory` is CALLED there but never
    // DECLARED - it is the accessor ColdFusion generates for a collection carrying
    // `singularname="childCategory"` [model/entity/Category.cfc:L66].
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

  // CFML parity [model/entity/Category.cfc:L97]: the mirror, on the same terms, the inversion
  // check passing at the call site - `arguments.childCategory.removeParentCategory( this )`.
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

  // The 1-BASED to 0-BASED index change, asserted where it bites.
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
  // CFML parity [model/entity/Category.cfc:L102-L105]: both statements are reproduced in the
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

  // The guard, for a saved row. `isNew() or !parentCategory.hasChildCategory( this )`
  // short-circuits on `isNew()` first.
  it('refuses a duplicate append for a SAVED category', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const child = aCategory({ categoryID: 'child-1' });

    child.setParentCategory(parent);
    child.setParentCategory(parent);

    expect(idsOf(parent.getChildCategories())).toEqual(['child-1']);
  });

  // [model/entity/Category.cfc:L103]: because `isNew()` is evaluated FIRST and short-circuits the
  // `or`, an UNSAVED category's membership is never tested and the append simply happens, every
  // time it is called.
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
  // REFERENCE identity, but under Hibernate reference identity was row identity because the
  // session returned one instance per row.
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

  // The reference fallback is not a courtesy: every unsaved category has `categoryID  ''`, so
  // keys alone would report all of them as one member.
  it('finds an unsaved member by reference identity', () => {
    const parent = aCategory({ categoryID: 'parent-1' });
    const unsaved = aCategory();
    unsaved.setParentCategory(parent);

    expect(parent.hasChildCategory(unsaved)).toBe(true);
  });

  // JUDGMENT CALL: this case pins a consequence of that containment rule rather than any legacy
  // behaviour, recorded as shipped reality rather than as parity or a defect.
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
  // CFML parity [model/entity/Category.cfc:L107-L110]: the parameter is `any parentCategory` and
  // is not `required`; the body probes `structKeyExists(arguments, "parentCategory")` and, when
  // omitted, defaults it from `variables.parentCategory`.
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

  // The unconditional clear.
  // CFML parity [model/entity/Category.cfc:L115]: `structDelete(variables, "parentCategory")` sits
  // outside the `if(index > 0)` block at L112-L114, so it runs on every path - including where the
  // far-side search found nothing.
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

  // CFML parity [model/entity/Category.cfc:L107-L116]: the method never verifies that an
  // explicitly supplied argument is this category's current parent, so it clears the near side
  // anyway and searches the WRONG collection.
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

  // CFML parity [model/entity/Category.cfc:L108-L111]: with the argument omitted and no parent
  // set, the legacy defaults `arguments.parentCategory` to a null `variables.parentCategory` and
  // calls `getChildCategories()` on it at L111.
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

describe('the entity carries no validation surface', () => {
  // CFML parity [model/validation/]: absence by design, verified by direct enumeration. The folder
  // holds 96 `.json` files and Category.json does not exist.
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

describe('every subject is independent', () => {
  // A warm Lambda container keeps module state alive between unrelated invocations, so the port
  // makes every entity memo and every collection request-scoped.
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

// A cyclic parent chain is accepted, exactly as the legacy setter accepts one.
//
// NET-NEW coverage - `meta/tests/` holds no Category test, and there is no
// `model/validation/Category.json` either - pinning legacy PARITY rather than a divergence.
//
// No adapter materializes a category ancestry, because nothing in the ported slice reads one.

describe('Category - a cyclic parent chain is accepted, per legacy parity', () => {
  it('accepts a category as its own parent', () => {
    const subject = aCategory({ categoryID: 'cat-self' });

    // CFML parity [model/entity/Category.cfc:L101-L105]: nothing is validated.
    subject.setParentCategory(subject);

    expect(subject.getParentCategory()).toBe(subject);
  });

  it('accepts a descendant as its parent, closing a multi-level cycle', () => {
    const root = aCategory({ categoryID: 'cat-root' });
    const mid = aCategory({ categoryID: 'cat-mid' });
    const leaf = aCategory({ categoryID: 'cat-leaf' });
    mid.setParentCategory(root);
    leaf.setParentCategory(mid);

    root.setParentCategory(leaf);

    expect(root.getParentCategory()).toBe(leaf);
    expect(leaf.getParentCategory()).toBe(mid);
    expect(mid.getParentCategory()).toBe(root);
  });

  it('maintains the far side when it closes a cycle, just as for any other parent', () => {
    // The legacy guard at [model/entity/Category.cfc:L103] is a MEMBERSHIP test, not an acyclicity
    // test.
    const root = aCategory({ categoryID: 'cat-far-root' });
    const leaf = aCategory({ categoryID: 'cat-far-leaf' });
    leaf.setParentCategory(root);

    root.setParentCategory(leaf);

    expect(leaf.getChildCategories()).toContain(root);
    expect(root.getChildCategories()).toContain(leaf);
  });

  it('accepts a cycle through addChildCategory too, since it delegates to the setter', () => {
    const root = aCategory({ categoryID: 'cat-add-root' });
    const leaf = aCategory({ categoryID: 'cat-add-leaf' });
    leaf.setParentCategory(root);

    leaf.addChildCategory(root);

    expect(root.getParentCategory()).toBe(leaf);
  });

  it('still assigns every well-founded reparent, so a legitimate move is unaffected', () => {
    const oldRoot = aCategory({ categoryID: 'cat-old-root' });
    const newRoot = aCategory({ categoryID: 'cat-new-root' });
    const movable = aCategory({ categoryID: 'cat-movable' });
    movable.setParentCategory(oldRoot);

    movable.setParentCategory(newRoot);

    expect(movable.getParentCategory()).toBe(newRoot);
    // PreInsert still builds a path, because this hierarchy is well-founded.
    movable.preInsert();
    expect(movable.getCategoryIDPath()).toBe('cat-new-root,cat-movable');
  });
});
