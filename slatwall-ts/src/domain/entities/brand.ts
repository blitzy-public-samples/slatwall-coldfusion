// slatwall-ts - Brand entity.
// Schema contract [model/entity/Brand.cfc:L49]: table `SwBrand`, ORM entity name `SlatwallBrand`; no migration,
// no rename, no column change.
//
// `getProducts()` returning an empty array on a bare construction is a pinned legacy contract,
// asserted by `defaults_are_correct()` in meta/tests/unit/entity/BrandTest.cfc, which is why
// `tests/unit/domain/entities/brand.test.ts` is legacy-extended coverage rather than net-new.
//
// LEGACY-NOTE [model/entity/Brand.cfc:L66-L71]: six inverse many-to-many collections are declared
// here - `SwPromoRewardBrand`, `SwPromoRewardExclBrand`, `SwPromoQualBrand`, `SwPromoQualExclBrand`,
// `SwVendorBrand` and `SwPhysicalBrand`. The last two belong to the out-of-scope vendor and
// physical modules, so they are recorded for schema continuity and never queried.

import { cfBoolean } from '../../lib/cfml/truthiness.js';
import { cfFoldKey } from '../../lib/cfml/struct.js';

import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { Product } from './product.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';

/**
 * The far side of the `SwVendorBrand` link table, reduced to the two members this entity calls.
 *
 * model/entity/Vendor.cfc is out of SCOPE - the plan excludes the vendor module in full - and the
 * entity folder is a hard-locked eighteen files with no `vendor.ts` among them.
 *
 * Both parameters are REQUIRED here even though a caller only ever passes `this`.
 */
export interface VendorBrandLink {
  addBrand(brand: Brand): void;
  removeBrand(brand: Brand): void;
}

/**
 * model/entity/Physical.cfc is out of scope and absent from the eighteen-file budget.
 */
export interface PhysicalBrandLink {
  addBrand(brand: Brand): void;
  removeBrand(brand: Brand): void;
}

/**
 * The far side of the `brandID` many-to-one, reduced to the two members this entity calls.
 *
 * Why a structural contract rather than the `Product` class itself, when `Product` is in scope and
 * is imported above.
 *
 * The `Product` type import is not redundant and is not removable: it types the materialized
 * `products` collection and its accessor, which is the association this entity genuinely owns.
 */
export interface ProductBrandLink {
  setBrand(brand: Brand): void;
  removeBrand(brand: Brand): void;
}

/**
 * Inclusion and exclusion are INDEPENDENT link tables, which is why all four members sit in one
 * contract rather than being split: `SwPromoRewardBrand` owned by
 * [model/entity/PromotionReward.cfc:L80], whose owning-side helpers are
 * [model/entity/PromotionReward.cfc:L198, L206] and whose far side is
 * [model/entity/Brand.cfc:L106, L110].
 */
export interface PromotionRewardBrandLink {
  addBrand(brand: Brand): void;
  removeBrand(brand: Brand): void;
  addExcludedBrand(brand: Brand): void;
  removeExcludedBrand(brand: Brand): void;
}
export interface PromotionQualifierBrandLink {
  addBrand(brand: Brand): void;
  removeBrand(brand: Brand): void;
  addExcludedBrand(brand: Brand): void;
  removeExcludedBrand(brand: Brand): void;
}

/**
 * A `SwBrand` row - the manufacturer or label a product is sold under.
 *
 * Every field is `readonly` and there is no setter anywhere: the legacy component declares no
 * `set*` override of its own.
 */
export class Brand {
  /**
   * Primary key. [model/entity/Brand.cfc:L52]
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one.
   */
  private readonly brandID: string;
  private readonly activeFlag: boolean;
  private readonly publishedFlag: boolean;

  // LEGACY-NOTE [model/entity/Brand.cfc:L53-L54]: boolean hydration.

  /**
   * `unique="true"` is a schema fact recorded here and enforced elsewhere: model/validation/
   * Brand.json marks `urlTitle` required and unique in the save context.
   */
  private readonly urlTitle: string | undefined;

  /**
   * Required in the save context per model/validation/Brand.json, and not checked here.
   */
  private readonly brandName: string | undefined;

  /**
   * `hb_formatType="url"` is a framework PRESENTATION hint - it told the admin how to render the
   * value.
   */
  private readonly brandWebsite: string | undefined;

  // Two helpers are dropped with it: `addAttributeValue` [model/entity/Brand.cfc:L90-L92], whose
  // body is `arguments.attributeValue.setBrand( this );`, and `removeAttributeValue`
  // [model/entity/Brand.cfc:L93-L95].
  //
  // The dispatcher consequence, and this file has a concrete instance of it.

  /**
   * The `products` one-to-many. [model/entity/Brand.cfc:L61]
   *
   * This field carries the one hard legacy test contract in this file.
   *
   * model/validation/Brand.json declares `products: [{"contexts":"delete","maxCollection":0}]` - a
   * guard meaning "refuse to delete a brand that still has products".
   */
  private readonly products: Product[];

  // The source's own banner for this section is EMPTY, and that is a fact rather than an
  // oversight: Brand OWNS no many-to-many association at all.

  // LEGACY-NOTE [model/entity/Brand.cfc:L60-L71]: two METADATA INCONSISTENCIES run across this
  // block, both cosmetic in CFML because the engine treats the collections identically, and both
  // recorded rather than normalised:.

  /**
   * Inverse side of `SwPromoRewardBrand`. [model/entity/Brand.cfc:L66]
   */
  private readonly promotionRewards: PromotionReward[];

  /**
   * Inverse side of `SwPromoRewardExclBrand`. [model/entity/Brand.cfc:L67]
   */
  private readonly promotionRewardExclusions: PromotionReward[];

  /**
   * Inverse side of `SwPromoQualBrand`. [model/entity/Brand.cfc:L68]
   */
  private readonly promotionQualifiers: PromotionQualifier[];

  /**
   * Inverse side of `SwPromoQualExclBrand`. [model/entity/Brand.cfc:L69]
   */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  // model/entity/Vendor.cfc and model/entity/Physical.cfc are both out of scope - the plan
  // excludes the vendor module outright, and Physical belongs to the physical-inventory subsystem.
  //
  // The bidirectional helpers for both, however, are fully ported.

  /**
   * The external-system correlation key used by the legacy import paths.
   */
  private readonly remoteID: string | undefined;

  // All four carry `hb_populateEnabled="false"`, which is how the legacy framework excluded them
  // from mass assignment.
  //
  // The two account associations point at model/entity/Account.cfc, which is explicitly out of
  // scope - the plan excludes AccountService and the entire account module.

  /**
   * No ORM default, so `undefined` when the column is NULL.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, as an OPAQUE identifier. [model/entity/Brand.cfc:L78]
   */
  private readonly createdByAccountID: string | undefined;
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, as an OPAQUE identifier. [model/entity/Brand.cfc:L80]
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwBrand` row, or - given nothing at all - a brand-new unsaved entity.
   *
   * A single readonly parameter object, and an inline object type rather than a second exported
   * interface.
   *
   * DEPARTURE from the required-slot convention used by `promotionAccount.ts`, taken for one
   * specific reason: `new Brand()` has to reproduce `getService("brandService").newBrand()`.
   */
  constructor(
    init: {
      readonly brandID?: string | undefined;
      readonly activeFlag?: CfBooleanInput;
      readonly publishedFlag?: CfBooleanInput;
      readonly urlTitle?: string | undefined;
      readonly brandName?: string | undefined;
      readonly brandWebsite?: string | undefined;
      readonly products?: Product[] | undefined;
      readonly promotionRewards?: PromotionReward[] | undefined;
      readonly promotionRewardExclusions?: PromotionReward[] | undefined;
      readonly promotionQualifiers?: PromotionQualifier[] | undefined;
      readonly promotionQualifierExclusions?: PromotionQualifier[] | undefined;
      readonly remoteID?: string | undefined;
      readonly createdDateTime?: Date | undefined;
      readonly createdByAccountID?: string | undefined;
      readonly modifiedDateTime?: Date | undefined;
      readonly modifiedByAccountID?: string | undefined;
    } = {},
  ) {
    // `default=""` at [model/entity/Brand.cfc:L52] is ported as the literal default, not as a
    // sentinel of this port's invention. `isNew()` reads it directly.
    this.brandID = init.brandID ?? '';

    // Both flags through the shared helper - see the boolean-hydration LEGACY-NOTE above. An
    // undefaulted, unset column reads `false`, which is the answer the legacy engine gave a flag
    // it had no value for.
    this.activeFlag = cfBoolean(init.activeFlag);
    this.publishedFlag = cfBoolean(init.publishedFlag);

    this.urlTitle = init.urlTitle;
    this.brandName = init.brandName;
    this.brandWebsite = init.brandWebsite;

    // `products` defaults to `[]` because meta/tests/unit/entity/BrandTest.cfc asserts it.
    this.products = init.products ?? [];

    // The same `[]` default is applied to the other three materialized collections purely for
    // internal consistency - an absent association reads as an empty array everywhere on this
    // class.
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionRewardExclusions = init.promotionRewardExclusions ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = init.promotionQualifierExclusions ?? [];

    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // `accessors=true` on [model/entity/Brand.cfc:L49] made ColdFusion generate one getter per
  // persistent property, and callers throughout the legacy tree use them - so these are part of
  // the interface-parity contract.
  //
  // Two accessors the framework would have generated are deliberately absent.

  /**
   * [model/entity/Brand.cfc:L52] Always a string; `''` for an unsaved entity.
   */
  getBrandID(): string {
    return this.brandID;
  }

  /**
   * [model/entity/Brand.cfc:L53] Coerced through `cfBoolean()` during hydration.
   */
  getActiveFlag(): boolean {
    return this.activeFlag;
  }

  /**
   * [model/entity/Brand.cfc:L54] Coerced through `cfBoolean()` during hydration.
   */
  getPublishedFlag(): boolean {
    return this.publishedFlag;
  }
  getUrlTitle(): string | undefined {
    return this.urlTitle;
  }
  getBrandName(): string | undefined {
    return this.brandName;
  }

  /**
   * [model/entity/Brand.cfc:L57] A plain string; `hb_formatType="url"` is presentation metadata.
   */
  getBrandWebsite(): string | undefined {
    return this.brandWebsite;
  }

  /**
   * RETURNS `Product[]` and never `undefined`. meta/tests/unit/entity/BrandTest.cfc's
   * `defaults_are_correct()` asserts this equals `[]` on a bare construction.
   *
   * `getProducts()` is LIVE because `Product.setBrand` reaches back through it: `Brand.addProduct`
   * [model/entity/Brand.cfc:L98-L100] delegates to `arguments.product.setBrand(this)`.
   */
  getProducts(): Product[] {
    return this.products;
  }

  /**
   * [model/entity/Brand.cfc:L66] Rewards that INCLUDE this brand. Empty when unmaterialized.
   *
   * LIVE, per the ownership contract on {@link Brand.getProducts}:
   * [model/entity/PromotionReward.cfc:L203] appends through it and
   * [model/entity/PromotionReward.cfc:L211-L213] removes through it.
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * [model/entity/Brand.cfc:L67] Rewards that EXCLUDE this brand - a different link table.
   */
  getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /**
   * [model/entity/Brand.cfc:L68] Qualifiers that INCLUDE this brand.
   *
   * LIVE: `PromotionQualifier.addBrand` / `removeBrand` append and remove through it, mirroring
   * the `PromotionReward` pair exactly.
   */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * [model/entity/Brand.cfc:L69] Qualifiers that EXCLUDE this brand - a different link table.
   *
   * LIVE: `PromotionQualifier.addExcludedBrand` / `removeExcludedBrand` append and remove through
   * it.
   */
  getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /**
   * [model/entity/Brand.cfc:L77] `undefined` for a NULL column - never the epoch, never `0`.
   */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/Brand.cfc:L78] Opaque FK; no `Account` entity is ever constructed.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /**
   * [model/entity/Brand.cfc:L79] `undefined` for a NULL column.
   */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/Brand.cfc:L80] Opaque FK; no `Account` entity is ever constructed.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // [model/entity/Brand.cfc:L83-L85]
  // [model/entity/Brand.cfc:L83-L85] the source's non-persistent property section is empty.

  /**
   * Whether this instance has been persisted yet.
   *
   * The empty-string test is not an approximation of the framework: `isNew()` at
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] is exactly this test.
   */
  isNew(): boolean {
    return this.brandID === '';
  }

  // The error register - the framework's refusal channel.

  /**
   * The accumulated errors, keyed by FOLDED error name and carrying each name's ORIGINAL spelling.
   *
   * Two pieces of state per entry, because a CFML struct carries both.
   */
  private readonly errors = new Map<
    string,
    { readonly name: string; readonly messages: string[] }
  >();

  /**
   * Every error, keyed by error name [org/Hibachi/HibachiTransient.cfc:L30-L32]. Frozen
   * projection.
   */
  getErrors(): Readonly<Record<string, readonly string[]>> {
    const projected: Record<string, readonly string[]> = {};

    for (const entry of this.errors.values()) {
      // `defineProperty` rather than assignment: an error name is server-authored here, but the
      // projection is a plain object and `__proto__` must never be interceptable on one.
      Object.defineProperty(projected, entry.name, {
        value: Object.freeze([...entry.messages]),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }

    return Object.freeze(projected);
  }

  /**
   * Whether this entity carries any error [org/Hibachi/HibachiTransient.cfc:L47-L53].
   */
  hasErrors(): boolean {
    return this.errors.size > 0;
  }

  /**
   * Whether one named error is present [org/Hibachi/HibachiTransient.cfc:L57-L59].
   */
  hasError(errorName: string): boolean {
    return this.errors.has(cfFoldKey(errorName));
  }

  /**
   * The messages under one name, or an EMPTY ARRAY [org/Hibachi/HibachiTransient.cfc:L34-L43].
   */
  getError(errorName: string): readonly string[] {
    return Object.freeze([...(this.errors.get(cfFoldKey(errorName))?.messages ?? [])]);
  }

  /**
   * Record one error; messages accumulate [org/Hibachi/HibachiTransient.cfc:L61-L64].
   */
  addError(errorName: string, errorMessage: string): void {
    const key = cfFoldKey(errorName);
    const existing = this.errors.get(key);

    if (existing === undefined) {
      this.errors.set(key, { name: errorName, messages: [errorMessage] });
      return;
    }

    existing.messages.push(errorMessage);
  }

  // five probes, none with a
  // hand-written legacy body: all are synthesised by the dispatcher at
  // [org/Hibachi/HibachiEntity.cfc:L507-L565].
  //
  // The project-wide containment rule: compare by primary key, with a reference fallback when the
  // candidate is unsaved.

  /**
   * Called by `Product.setBrand` [model/entity/Product.cfc:L664]:
   * `if(isNew() or !arguments.brand.hasProduct( this ))`.
   */
  hasProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.products.includes(product);
    }
    return this.products.some((held: Product) => held.getProductID() === candidateID);
  }

  /**
   * Called by `PromotionReward.addBrand` [model/entity/PromotionReward.cfc:L202]:
   * `if(isNew() or !arguments.brand.hasPromotionReward( this ))`.
   */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewards.includes(promotionReward);
    }
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addExcludedBrand` [model/entity/PromotionReward.cfc:L302]:
   * `if(isNew() or !arguments.brand.hasPromotionRewardExclusion( this ))`.
   *
   * A different link table from its sibling above - `SwPromoRewardExclBrand` rather than
   * `SwPromoRewardBrand` - so it probes a different collection.
   */
  hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewardExclusions.includes(promotionReward);
    }
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addBrand` [model/entity/PromotionQualifier.cfc:L144]:
   * `if(isNew() or !arguments.brand.hasPromotionQualifier( this ))`.
   */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifiers.includes(promotionQualifier);
    }
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addExcludedBrand` [model/entity/PromotionQualifier.cfc:L244]:
   * `if(isNew() or !arguments.brand.hasPromotionQualifierExclusion( this ))`.
   *
   * A different link table from its sibling above - `SwPromoQualExclBrand` rather than
   * `SwPromoQualBrand`.
   */
  hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifierExclusions.includes(promotionQualifier);
    }
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  // [model/entity/Brand.cfc:L87-L155]
  //
  // The legacy block holds EIGHT pairs and SIXTEEN methods in total - not the four pairs the brief
  // described - under eight inline sub-banners at L89, L97, L105, L114, L122, L131, L139 and L147.

  // Products (one-to-many) [model/entity/Brand.cfc:L97]
  addProduct(product: ProductBrandLink): void {
    product.setBrand(this);
  }
  removeProduct(product: ProductBrandLink): void {
    product.removeBrand(this);
  }

  // Promotion Rewards (many-to-many - inverse) [model/entity/Brand.cfc:L105]

  /**
   * The link row lands in `SwPromoRewardBrand`, owned by [model/entity/PromotionReward.cfc:L80].
   */
  addPromotionReward(promotionReward: PromotionRewardBrandLink): void {
    promotionReward.addBrand(this);
  }
  removePromotionReward(promotionReward: PromotionRewardBrandLink): void {
    promotionReward.removeBrand(this);
  }

  // Promotion Reward Exclusions (many-to-many - inverse) [model/entity/Brand.cfc:L114]

  /**
   * A different link table from `addPromotionReward` - `SwPromoRewardExclBrand`, owned by
   * [model/entity/PromotionReward.cfc:L86].
   */
  addPromotionRewardExclusion(promotionReward: PromotionRewardBrandLink): void {
    promotionReward.addExcludedBrand(this);
  }
  removePromotionRewardExclusion(promotionReward: PromotionRewardBrandLink): void {
    promotionReward.removeExcludedBrand(this);
  }

  // Promotion Qualifiers (many-to-many - inverse) [model/entity/Brand.cfc:L122]
  addPromotionQualifier(promotionQualifier: PromotionQualifierBrandLink): void {
    promotionQualifier.addBrand(this);
  }
  removePromotionQualifier(promotionQualifier: PromotionQualifierBrandLink): void {
    promotionQualifier.removeBrand(this);
  }

  // Promotion Qualifier Exclusions (many-to-many - inverse) [model/entity/Brand.cfc:L131]
  addPromotionQualifierExclusion(promotionQualifier: PromotionQualifierBrandLink): void {
    promotionQualifier.addExcludedBrand(this);
  }

  /**
   * The exact twin of [model/entity/Option.cfc:L145-L147], which is broken - it calls
   * `addExcludedOption(this)` from inside its `remove*`.
   */
  removePromotionQualifierExclusion(promotionQualifier: PromotionQualifierBrandLink): void {
    promotionQualifier.removeExcludedBrand(this);
  }

  // Vendors (many-to-many - inverse) [model/entity/Brand.cfc:L139]

  /**
   * Typed by {@link VendorBrandLink} because model/entity/Vendor.cfc is out of scope; the helper
   * itself is ported in full, since it only ever delegates outward.
   */
  addVendor(vendor: VendorBrandLink): void {
    vendor.addBrand(this);
  }
  removeVendor(vendor: VendorBrandLink): void {
    vendor.removeBrand(this);
  }

  // Physicals (many-to-many - inverse) [model/entity/Brand.cfc:L147]

  /**
   * Typed by {@link PhysicalBrandLink}; model/entity/Physical.cfc is out of scope.
   */
  addPhysical(physical: PhysicalBrandLink): void {
    physical.addBrand(this);
  }
  removePhysical(physical: PhysicalBrandLink): void {
    physical.removeBrand(this);
  }

  // [model/entity/Brand.cfc:L155]
}

// LEGACY-NOTE [model/entity/Brand.cfc:L157-L163]: the two remaining sections of the legacy
// component - Overridden Methods and Validation - are EMPTY in the source, so nothing is authored
// for either here.

// Test contract - legacy-extended (parity), not net-new.
//
// `tests/unit/domain/entities/brand.test.ts` is owed and is authored elsewhere; the test tier is
// owned by another agent and `slatwall-ts/tests` holds no entity suite yet.
//
// Brand is one of only two in-scope entities whose coverage may be labelled PARITY - the other is
// Product.
