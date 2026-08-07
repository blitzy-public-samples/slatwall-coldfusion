// slatwall-ts - the Category entity.
// Schema contract [model/entity/Category.cfc:L49]: table `SwCategory`, ORM entity name `SlatwallCategory`; no migration,
// no rename, no column change.
//
// A 1:1 logic extraction of model/entity/Category.cfc (137 lines), which is the SOLE authority for
// everything below.
//
// Every `hb_*` value is preserved verbatim in this header as inert documentation, so the legacy
// admin can still resolve it.

import { buildIdPathList } from '../valueObjects/materializedIdPath.js';
import { cfBoolean } from '../../lib/cfml/truthiness.js';

import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { Product } from './product.js';

/**
 * The prior persisted state of one `SwCategory` row, as handed to the ported `preUpdate`
 * maintenance method.
 *
 * This is the target's stand-in for the `struct oldData` parameter at
 * [model/entity/Category.cfc:L131].
 *
 * Every slot is a REQUIRED key typed `T | undefined`, not an optional `?:` slot.
 */
export type CategoryPreUpdateSnapshot = {
  readonly categoryID: string | undefined;
  readonly categoryIDPath: string | undefined;
  readonly categoryName: string | undefined;
  readonly restrictAccessFlag: CfBooleanInput;
  readonly allowProductAssignmentFlag: CfBooleanInput;
  /**
   * [model/entity/Category.cfc:L59] The inert Mura CMS join key.
   */
  readonly cmsCategoryID: string | undefined;
  /**
   * The `siteID` foreign-key column [model/entity/Category.cfc:L62], inert.
   */
  readonly siteID: string | undefined;
  /**
   * The `parentCategoryID` foreign-key column [model/entity/Category.cfc:L63].
   */
  readonly parentCategoryID: string | undefined;
  readonly remoteID: string | undefined;
  readonly createdDateTime: Date | undefined;
  /**
   * The `createdByAccountID` column [model/entity/Category.cfc:L77], opaque.
   */
  readonly createdByAccountID: string | undefined;
  readonly modifiedDateTime: Date | undefined;
  /**
   * The `modifiedByAccountID` column [model/entity/Category.cfc:L79], opaque.
   */
  readonly modifiedByAccountID: string | undefined;
};

/**
 * The anti-corruption projection of one `SwContent` row, as reached across the `SwContentCategory`
 * link table. [model/entity/Category.cfc:L70]
 */
interface ContentCategoryLink {
  /**
   * The `SwContent.contentID` primary key. [model/entity/Content.cfc:L52], reached through
   * `inversejoincolumn="contentID"` on [model/entity/Category.cfc:L70].
   */
  getContentID(): string;
}

/**
 * One `SwCategory` row: a read-mostly leaf in the catalog, and one of the three in-scope entities
 * carrying a materialized comma-delimited ID path.
 *
 * Associations are materialized at the repository boundary and laziness is not simulated.
 */
export class Category {
  /**
   * `''` means unsaved, which is the legacy `unsavedvalue=""` / `default=""` contract rather than
   * a sentinel of this port's invention - `isNew()` reads it directly.
   */
  private readonly categoryID: string;

  /**
   * MUTABLE, and one of only two mutable fields on this class: the two ported
   * lifecycle-maintenance methods assign it through `setCategoryIDPath`.
   */
  private categoryIDPath: string | undefined;

  /**
   * [model/entity/Category.cfc:L54] `property name="categoryName" ormtype="string";`
   */
  private readonly categoryName: string | undefined;

  // LEGACY-NOTE [model/entity/Category.cfc:L55-L56]: boolean hydration. A case-insensitive read of
  // this source finds exactly two `ormtype="boolean"` properties - `restrictAccessFlag` L55 and
  // `allowProductAssignmentFlag` L56 - and neither declares a `default=`.

  /**
   * [model/entity/Category.cfc:L55] Coerced through `cfBoolean()` during hydration.
   */
  private readonly restrictAccessFlag: boolean;

  /**
   * [model/entity/Category.cfc:L56] Coerced through `cfBoolean()` during hydration.
   */
  private readonly allowProductAssignmentFlag: boolean;

  /**
   * Contrast the treatment of `site` immediately below: that one is also inert, but it is an
   * ASSOCIATION and so collapses to an opaque ID.
   */
  private readonly cmsCategoryID: string | undefined;

  /**
   * The `siteID` foreign-key column. [model/entity/Category.cfc:L62]
   *
   * This follows the precedent already set by `Option.defaultImage` [model/entity/Option.cfc:L60],
   * which collapses to a `defaultImageID` on the same reasoning.
   */
  private readonly siteID: string | undefined;

  /**
   * The far side of the `parentCategory` many-to-one. [model/entity/Category.cfc:L63]
   *
   * SELF-REFERENTIAL, so it is typed to this very class and needs no import at all.
   *
   * Declared as a required property with an `undefined` union, not as an optional
   * `parentCategory?: Category`.
   */
  private parentCategory: Category | undefined;

  /**
   * SELF-REFERENTIAL, typed to this very class, no import required.
   *
   * `cascade="all-delete-orphan"` is not honoured by this entity, and no attempt is made here to
   * honour it.
   */
  private readonly childCategories: Category[];

  // LEGACY-NOTE [model/entity/Category.cfc:L69-L70]: a metadata inconsistency, reproduced
  // uniformly rather than propagated.

  /**
   * `Product` is in scope, so this is typed to the real sibling class through a TYPE-ONLY import.
   */
  private readonly products: readonly Product[];

  /**
   * The materialized `contents` many-to-many. [model/entity/Category.cfc:L70]
   *
   * Schema continuity is unaffected in either direction. model/entity/Category.cfc is
   * reference-only and remains completely untouched, `SwContentCategory` is neither dropped nor
   * altered nor migrated.
   *
   * delete-context `maxCollection:0` rule references a collection the domain does not materialize,
   * the rule trivially passes in TypeScript where it would have BLOCKED the delete in CFML.
   */
  private readonly contents: readonly ContentCategoryLink[];
  private readonly remoteID: string | undefined;

  // All four declare `hb_populateEnabled="false"`, so the legacy framework refused to populate
  // them from request data.

  /**
   * [model/entity/Category.cfc:L76] `ormtype="timestamp"`, `hb_populateEnabled="false"`.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column [model/entity/Category.cfc:L77], opaque.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/Category.cfc:L78] `ormtype="timestamp"`, `hb_populateEnabled="false"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column [model/entity/Category.cfc:L79], opaque.
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwCategory` row.
   *
   * A single readonly parameter object, matching the convention the sibling entities established:
   * an inline object type rather than a second exported interface.
   *
   * Every slot is a required key, and each nullable one is typed `T | undefined` rather than as an
   * optional `?:`.
   */
  constructor(init: {
    readonly categoryID: string | undefined;
    readonly categoryIDPath: string | undefined;
    readonly categoryName: string | undefined;
    readonly restrictAccessFlag: CfBooleanInput;
    readonly allowProductAssignmentFlag: CfBooleanInput;
    readonly cmsCategoryID: string | undefined;
    readonly siteID: string | undefined;
    readonly parentCategory: Category | undefined;
    readonly childCategories: Category[] | undefined;
    readonly products: readonly Product[] | undefined;
    readonly contents: readonly ContentCategoryLink[] | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    // `default=""` and `unsavedvalue=""` at [model/entity/Category.cfc:L52] are ported as the
    // literal legacy default, not as a sentinel of this port's invention. `isNew()` reads it
    // directly.
    this.categoryID = init.categoryID ?? '';

    this.categoryIDPath = init.categoryIDPath;
    this.categoryName = init.categoryName;

    // Both flags through the shared helper - see the boolean-hydration LEGACY-NOTE above. An
    // undefaulted, unset column reads `false`, which is the answer the legacy engine gave a flag
    // it had no value for.
    this.restrictAccessFlag = cfBoolean(init.restrictAccessFlag);
    this.allowProductAssignmentFlag = cfBoolean(init.allowProductAssignmentFlag);

    this.cmsCategoryID = init.cmsCategoryID;
    this.siteID = init.siteID;
    this.parentCategory = init.parentCategory;

    // A collection defaults to EMPTY rather than to `undefined`, because a Hibernate-managed
    // collection never handed back null - an unpopulated one-to-many read as an empty array.
    this.childCategories = init.childCategories ?? [];
    this.products = init.products ?? [];
    this.contents = init.contents ?? [];

    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // `accessors="true"` on [model/entity/Category.cfc:L49] made ColdFusion generate every one of
  // these, so there is no hand-written legacy body to port.

  /**
   * [model/entity/Category.cfc:L52] Always a string; `''` means unsaved.
   */
  getCategoryID(): string {
    return this.categoryID;
  }

  /**
   * Single most easily-missed asymmetry in the entity, so it is recorded explicitly rather than
   * left to inference.
   *
   * `PriceGroup` exposes two routes to its path: a LAZY MEMOIZED getter at
   * [model/entity/PriceGroup.cfc:L195-L200], which guards on `isNull(variables.priceGroupIDPath)`
   * and computes on demand.
   */
  getCategoryIDPath(): string | undefined {
    return this.categoryIDPath;
  }

  /**
   * [model/entity/Category.cfc:L53] - the ORM-generated setter for the path.
   *
   * Concretely called at [model/entity/Category.cfc:L128] and [model/entity/Category.cfc:L133],
   * inside the two lifecycle hooks.
   */
  setCategoryIDPath(categoryIDPath: string): void {
    this.categoryIDPath = categoryIDPath;
  }

  /**
   * [model/entity/Category.cfc:L54] `undefined` when the column is NULL.
   */
  getCategoryName(): string | undefined {
    return this.categoryName;
  }

  /**
   * [model/entity/Category.cfc:L55] Coerced through `cfBoolean()`; no ORM default exists.
   */
  getRestrictAccessFlag(): boolean {
    return this.restrictAccessFlag;
  }

  /**
   * [model/entity/Category.cfc:L56] Coerced through `cfBoolean()`; no ORM default exists.
   */
  getAllowProductAssignmentFlag(): boolean {
    return this.allowProductAssignmentFlag;
  }

  /**
   * [model/entity/Category.cfc:L59] The inert Mura CMS join key, index `RI_CMSCATEGORYID`.
   *
   * Exposed so the column can be round-tripped on save and so the schema contract stays whole.
   */
  getCmsCategoryID(): string | undefined {
    return this.cmsCategoryID;
  }

  /**
   * The inert `siteID` foreign key. [model/entity/Category.cfc:L62]
   *
   * Returns the opaque column value and not an entity - there is no `Site` class in this port and
   * no `getSite()` on this class.
   */
  getSiteID(): string | undefined {
    return this.siteID;
  }

  /**
   * The materialized far side of the `parentCategory` many-to-one. [model/entity/Category.cfc:L63]
   *
   * `undefined` for a root category, and also when the repository chose not to fetch the parent.
   *
   * This is the accessor `buildIdPathList` walks when either maintenance method rebuilds the path,
   * and it satisfies that module's `ParentNodeAccessor` contract directly.
   */
  getParentCategory(): Category | undefined {
    return this.parentCategory;
  }

  /**
   * The materialized `childCategories` one-to-many. [model/entity/Category.cfc:L66]
   *
   * Never `undefined` - see the constructor note on collections.
   */
  getChildCategories(): Category[] {
    return this.childCategories;
  }

  /**
   * The materialized `products` many-to-many. [model/entity/Category.cfc:L69]
   */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /**
   * The materialized `contents` many-to-many, projected across the `SwContentCategory` link table.
   * [model/entity/Category.cfc:L70]
   *
   * An empty result is a fetch-shape statement, not a domain claim, exactly as for every other
   * collection on this class.
   */
  getContents(): readonly ContentCategoryLink[] {
    return this.contents;
  }

  /**
   * [model/entity/Category.cfc:L73] "Only used when integrated with a remote system".
   */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * The `createdByAccountID` column [model/entity/Category.cfc:L77], opaque.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * The `modifiedByAccountID` column [model/entity/Category.cfc:L79], opaque.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree, and concretely called at exactly one
   * site in this component: [model/entity/Category.cfc:L103], inside the `setParentCategory`
   * guard.
   *
   * The empty-string test is not an approximation of the framework - it is literally what the
   * framework does.
   */
  isNew(): boolean {
    return this.categoryID === '';
  }

  // [model/entity/Category.cfc:L90-L118]
  //
  // These four are the only behavioural methods the legacy component declares outside its two
  // lifecycle hooks, and both pairs are the correct, non-defective pattern.

  // [model/entity/Category.cfc:L103-L105] appends this category to its parent's `childCategories`
  // array under a guard, and [model/entity/Category.cfc:L111-L113] removes it again.

  // Child Categories (one-to-many) [model/entity/Category.cfc:L92]

  /**
   * Bidirectional helper for the `childCategories` one-to-many. [model/entity/Category.cfc:L93]
   *
   * The parameter is `required` in the source, so it is a plain required parameter here, and it is
   * typed `Category` because the association is SELF-REFERENTIAL - this very class.
   */
  addChildCategory(childCategory: Category): void {
    childCategory.setParentCategory(this);
  }

  /**
   * Bidirectional helper for the `childCategories` one-to-many. [model/entity/Category.cfc:L96]
   *
   * Note that it delegates to `removeParentCategory`, not to `setParentCategory`.
   */
  removeChildCategory(childCategory: Category): void {
    childCategory.removeParentCategory(this);
  }

  // Parent Category (many-to-one) [model/entity/Category.cfc:L100]

  /**
   * Bidirectional helper for the `parentCategory` many-to-one. [model/entity/Category.cfc:L101]
   *
   * Both statements are reproduced, in the source's order: the near-side assignment at
   * [model/entity/Category.cfc:L102] runs first and unconditionally.
   *
   * The parameter is `required` in the source, so it is a plain required parameter here -
   * deliberately not optional, which is the one asymmetry between this method and its `remove*`
   * counterpart.
   */
  setParentCategory(parentCategory: Category): void {
    // CFML parity [model/entity/Category.cfc:L101-L105]: the legacy body validates nothing before
    // assigning, and neither does this one. A cyclic parent chain is accepted here exactly as it
    // is accepted there.
    this.parentCategory = parentCategory;

    // [model/entity/Category.cfc:L103-L105] - the guarded append onto the parent's LIVE array.
    if (this.isNew() || !parentCategory.hasChildCategory(this)) {
      parentCategory.getChildCategories().push(this);
    }
  }

  /**
   * Whether `childCategory` is already a member of this category's materialized children.
   *
   * Generated because it is concretely called, which is the whole test for whether a
   * dynamic-dispatch member survives into this port.
   *
   * Containment rule this folder uses, shared with `optionGroup.ts`, `priceGroup.ts`,
   * `promotionCode.ts`, `promotionApplied.ts` and `promotionPeriod.ts`.
   */
  hasChildCategory(childCategory: Category): boolean {
    const candidateCategoryID: string = childCategory.getCategoryID();

    if (candidateCategoryID === '' || this.childCategoriesContainUnsavedRow()) {
      return this.childCategories.some(
        (child) => child === childCategory || child.getCategoryID() === candidateCategoryID,
      );
    }

    return this.childCategories.some((child) => child.getCategoryID() === candidateCategoryID);
  }

  /**
   * Whether this category's materialized children include at least one row that has never been
   * persisted.
   *
   * Private, and it exists only to keep {@link Category.hasChildCategory} readable.
   */
  private childCategoriesContainUnsavedRow(): boolean {
    return this.childCategories.some((child) => child.getCategoryID() === '');
  }

  /**
   * Bidirectional helper for the `parentCategory` many-to-one. [model/entity/Category.cfc:L107]
   *
   * the source parameter is `any parentCategory` and is **not** `required`.
   *
   * There is deliberately no `variables.` scope object, no `structKeyExists` helper and no
   * `structDelete` emulation.
   *
   * @throws Error when the argument is omitted and this category has no parent set, reproducing
   * the null dereference at [model/entity/Category.cfc:L111].
   */
  removeParentCategory(parentCategory?: Category): void {
    const resolvedParentCategory: Category | undefined =
      parentCategory !== undefined ? parentCategory : this.parentCategory;

    if (resolvedParentCategory === undefined) {
      throw new Error(
        'Category.removeParentCategory was called with no argument on a category that has no ' +
          'parentCategory. This reproduces the legacy runtime failure at ' +
          'model/entity/Category.cfc:L108-L111, where the omitted argument defaults to a null ' +
          'parent and getChildCategories() is then invoked on it before any index guard runs.',
      );
    }

    // [model/entity/Category.cfc:L111] array index base change: CFML `arrayFind` returns a 1-BASED
    // index, or 0 for "not found", which is why the source guards with `index > 0` at L112.
    //
    // Containment is by PRIMARY KEY with a reference fallback for an unsaved row, exactly as in
    // `hasChildCategory` above.
    const siblingCategories: Category[] = resolvedParentCategory.getChildCategories();
    const index: number = siblingCategories.findIndex((child: Category) => this.isSameRowAs(child));
    if (index !== -1) {
      siblingCategories.splice(index, 1);
    }

    // [model/entity/Category.cfc:L115] - `structDelete(variables, "parentCategory")`,
    // unconditional and outside the found-branch above.
    this.parentCategory = undefined;
  }

  /**
   * Whether `candidate` denotes the same `SwCategory` row as this instance.
   *
   * Private, with no legacy counterpart by name: it stands for CFML's `arrayFind(array, this)`
   * comparison.
   *
   * Identical in shape to the helpers of the same name on `option.ts`, `promotionCode.ts` and
   * `promotionApplied.ts`, deliberately: one containment rule across the folder.
   */
  private isSameRowAs(candidate: Category): boolean {
    const candidateCategoryID: string = candidate.getCategoryID();

    if (candidateCategoryID === '' || this.categoryID === '') {
      return candidate === this;
    }

    return candidateCategoryID === this.categoryID;
  }

  // [model/entity/Category.cfc:L118]

  // [model/entity/Category.cfc:L120-L122] - EMPTY in the source, and nothing is authored for it.

  // [model/entity/Category.cfc:L124-L136]
  //
  // LEGACY-NOTE [model/entity/Category.cfc:L127] and [model/entity/Category.cfc:L132] - the
  // `super` calls. There is no base class in the target and none is emulated.

  /**
   * The ported `preInsert` hook. [model/entity/Category.cfc:L126]
   *
   * Invoked by the repository at save time, mirroring where the ORM event fired.
   */
  preInsert(): void {
    // Ordering marker - [model/entity/Category.cfc:L127] `super.preInsert();` stood here, before
    // the assignment below.
    //
    // This is the OPPOSITE of [model/entity/PriceGroup.cfc:L207], which assigns its path first and
    // only then calls `super.preInsert()` at L208.
    this.setCategoryIDPath(
      buildIdPathList<Category>(
        this,
        (node) => node.getCategoryID(),
        (node) => node.getParentCategory(),
      ),
    );
  }

  /**
   * The ported `preUpdate` hook. [model/entity/Category.cfc:L131]
   *
   * The PARAMETER is DELIBERATELY not READ, because the legacy body does not read it either:
   * L132-L133 forwards it to `super.preUpdate()` and then rebuilds the path unconditionally.
   *
   * @param oldData the prior persisted row, mirroring the `struct oldData` parameter at
   * [model/entity/Category.cfc:L131].
   */
  preUpdate(oldData?: Readonly<Record<string, unknown>>): void {
    // Ordering marker - [model/entity/Category.cfc:L132]
    // `super.preUpdate(argumentcollection=arguments);` stood here, before the assignment below,
    // forwarding `oldData` on.
    //
    // This is the OPPOSITE of [model/entity/PriceGroup.cfc:L212], which assigns its path first and
    // only then calls `super.preUpdate(...)` at L213.

    // [model/entity/Category.cfc:L133], character-for-character the same call the `preInsert` hook
    // makes at L128 - the source repeats it, and so does this port.
    this.setCategoryIDPath(
      buildIdPathList<Category>(
        this,
        (node) => node.getCategoryID(),
        (node) => node.getParentCategory(),
      ),
    );
  }

  // [model/entity/Category.cfc:L136]
}
