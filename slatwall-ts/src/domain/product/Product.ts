/**
 * `Product` — the port of `model/entity/Product.cfc`, the aggregate root of the Catalog slice.
 *
 * The legacy declaration [model/entity/Product.cfc:L49] is
 * `component entityname="SlatwallProduct" table="SwProduct" persistent="true"
 * extends="HibachiEntity" cacheuse="transactional" hb_serviceName="productService"
 * hb_permission="this" hb_processContexts="updateSkus,addOptionGroup,addOption,addSubscriptionTerm"`.
 */

import {
  AUDIT_PROPERTY_NAMES,
  hasDeclaredProperty,
  readValueByPropertyIdentifier,
  requireDeclaredPropertyMetaData,
  type AuditableEntity,
  type AuditPropertyName,
  type DeclaredPropertyNameSet,
  type EntityPropertyMetaData,
  type AuditableManagedEntity,
} from '../base/AuditableEntity';
import type {
  ColumnPropertyDescriptor,
  EntityMetadataDeclaration,
  ManyToManyPropertyDescriptor,
  ManyToOnePropertyDescriptor,
  OneToManyPropertyDescriptor,
  PopulatePropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
import { readIdentifierOrUnsaved, readsAsUnsavedIdentifier } from '../base/populate';
import {
  DomainError,
  LegacyParityError,
  NotImplementedError,
  NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE,
  moreThanOneSkuReturnedMessage,
  noSkusFoundForSelectedOptionsMessage,
} from '../../errors/DomainError';
import { ValidationError, type ValidationErrors } from '../../errors/ValidationError';
import {
  replaceStringTemplate,
  type ExactDecimal,
  type PropertyIdentifierResolver,
} from '../../util/formatting';

/*
 * Translation decision — `import type` for the four in-scope collaborators, and why the mutual
 * cycles are correct rather than tolerated.
 */
import type { Brand } from './Brand';
import type { BaseProductTypeCode, ProductType, ProductTypeRootResolver } from './ProductType';
import type { Option } from '../option/Option';
import type { OptionGroup } from '../option/OptionGroup';

/*
 * The r-c local structural interfaces
 * `src/ports/**` is not on this module's dependency whitelist and `src/domain/sku/Sku.ts` does not
 * exist. Per the mandated R-C pattern, every out-of-scope collaborator — and `Sku`, which is
 * in-scope but not yet authored — is reached through a narrow, distinctly named, in-file,
 * type-only interface declaring exactly the members the ported code touches and nothing more, and
 * is supplied as an explicit parameter (AAP §0.7.3). Each carries one `TODO(boundary)` naming its rightful
 * owner, so no member is ever quietly dropped (TR-5).
 */

/** The three setting keys this entity reads, and the only three. */
export type ProductSettingName =
  'globalURLKeyProduct' | 'productDisplayTemplate' | 'productTitleString';

/**
 * Resolves the effective value of one of the three settings this entity reads.
 *
 * TODO(boundary): the rightful owner is `SettingResolverPort`, implemented by
 * `src/adapters/settings/StaticSettingResolver.ts` (§0.4.1.7). No file is created under
 * `src/ports/` by this module.
 */
export interface ProductSettingResolver {
  /**
   * @param settingName - One of the three keys this entity reads; the literal union is the point.
   * @returns The effective value, in the shape the legacy engine returned it.
   */
  setting(settingName: ProductSettingName): string;
}

/**
 * A member of this product's `skus` collection, as narrowly as the ported code uses one.
 *
 * TODO(boundary): the rightful owner of this element type is `src/domain/sku/Sku.ts`.
 */
export interface ProductSkuMember {
  setProduct(product: Product): void;

  removeProduct(product?: Product): void;
}

/**
 * Reads a SKU's primary identifier.
 *
 * TODO(boundary): superseded by a direct field read once `src/domain/sku/Sku.ts` exists.
 */
export type ProductSkuIdReader = (sku: ProductSkuMember) => string;

/**
 * An entity that this product owns one-to-many and that hands ownership back through
 * `setProduct` / `removeProduct`.
 *
 * TODO(boundary): the rightful owners are the attribute subsystem, the image subsystem behind
 * `ImagePathPort`, and the product-review surface — three families outside this slice.
 */
export interface ProductOwnedAssociation {
  setProduct(product: Product): void;

  removeProduct(product?: Product): void;
}

/**
 * The element type of a collection this port declares but never traverses — deliberately opaque.
 *
 * TODO(boundary): the rightful owners are the content, category, promotion, price-group, vendor and
 * physical-count subsystems. When a later slice converts any of them, replace this alias at the
 * corresponding field declaration with that family's real domain type.
 */
export type ProductOutOfScopeAssociation = object;

/**
 * The default SKU, as narrowly as the nine retained delegating members use it.
 *
 * TODO(boundary): the rightful owners are `PricingPort` for the four price and currency reads and
 * `ImagePathPort` for the five image reads (§0.2.2.7). No file is created under `src/ports/` here.
 */
export interface ProductDefaultSkuDelegate {
  getCurrencyCode(): string | undefined;

  /*
   * — the three monetary reads are {@link ExactDecimal}, matching `Sku`'s fields; `big_decimal` is
   * carried as exact digits rather than as a double. `getCurrencyCode` is unaffected.
   */
  getPrice(): ExactDecimal | undefined;

  getRenewalPrice(): ExactDecimal | undefined;

  getListPrice(): ExactDecimal | undefined;

  getImageDirectory(): string;

  getImagePath(): string;

  getImage(): string;

  getResizedImagePath(): string;

  getImageExistsFlag(): boolean;
}

/**
 * Resolves this product's SKUs from a selected-option list — the single capability
 * `getSkusBySelectedOptions` needs.
 *
 * TODO(boundary): the rightful owners are `src/services/ProductService.ts` and, beneath it,
 * `SkuRepository.findSkusBySelectedOptions` implemented by
 * `src/adapters/mysql/MySqlSkuRepository.ts` (§0.4.2.6).
 */
export interface ProductSkuOptionFinder {
  /**
   * @param selectedOptions - A comma-delimited list of option identifiers. The empty string is a
   * legal, meaningful input; see T5 on {@link product.getSkuBySelectedOptions}.
   *
   * @param productID - This product's 32-character identifier (IR-6).
   * @returns Every SKU of the product carrying all of the listed options.
   */
  getProductSkusBySelectedOptions(
    selectedOptions: string,
    productID: string,
  ): Promise<ProductSkuMember[]>;
}

/** Resolves the option groups in use by a product — the capability `getOptionGroups` needs. */
export interface ProductOptionGroupFinder {
  /**
   * @param productID - This product's 32-character identifier (IR-6).
   * @returns The product's option groups, distinct, ordered by `sortOrder` ascending.
   */
  getOptionGroupsForProduct(productID: string): Promise<OptionGroup[]>;
}

/**
 * Resolves the options of one option group that are in use by a product — the capability
 * `getOptionsByOptionGroup` needs.
 */
export interface ProductOptionFinder {
  /**
   * @param optionGroupID - The option group to restrict to; the legacy first filter.
   * @param productID - This product's 32-character identifier; the legacy second filter.
   * @returns The matching options, distinct, ordered by `sortOrder` ascending.
   */
  getOptionsForProductByOptionGroup(optionGroupID: string, productID: string): Promise<Option[]>;
}

/** One `{name, value}` selection entry. */
export interface ProductSelectOption {
  readonly name: string;

  readonly value: string;
}

/**
 * Resolves the options and option groups not yet used by a product — the capability
 * `getUnusedProductOptions` and `getUnusedProductOptionGroups` need.
 *
 * TODO(boundary): the rightful owner is `src/services/OptionService.ts` over
 * `OptionRepository.findUnusedOptions` and `OptionRepository.findUnusedOptionGroups` (§0.4.2.6).
 */
export interface ProductUnusedOptionFinder {
  /**
   * @param productID - This product's 32-character identifier (IR-6).
   * @param existingOptionGroupIDList - A comma-delimited list of option-group identifiers.
   */
  getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<ProductSelectOption[]>;

  /** @param existingOptionGroupIDList - A comma-delimited list of option-group identifiers. */
  getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<ProductSelectOption[]>;
}

/** Reports whether any transaction exists — the capability `getTransactionExistsFlag` needs. */
export interface ProductTransactionExistenceChecker {
  /**
   * Declares which slot means what, and exists to make a mis-binding fail to compile. Structurally
   * identical to `SkuTransactionExistenceChecker.argumentOrder` in `src/domain/sku/Sku.ts` — declared
   * separately, with no import between the two entity modules, so one object still satisfies both
   * contracts without this file taking a dependency on that one.
   */
  readonly argumentOrder: 'skuID-first-productID-second';

  /**
   * @param skuID - Accepted so one implementation serves the SKU-side checker too. This entity must
   * leave it `undefined`: the DAO lets `skuID` win when both are present
   * [model/dao/SkuDAO.cfc:L58-L64], so supplying it here would suppress the product-scoped branch.
   *
   * @param productID - The product to scope the question to; the legacy `Product.cfc:L626` argument.
   * @returns Whether a transaction references that product.
   */
  getTransactionExistsFlag(skuID?: string, productID?: string): Promise<boolean>;
}

/**
 * Resolves the subscription terms not yet used by a product — the capability
 * `getUnusedProductSubscriptionTerms` needs.
 *
 * TODO(boundary): the rightful owner is `SubscriptionTermPort` (§0.2.2.7).
 */
export interface ProductSubscriptionTermFinder {
  /**
   * @param productID - This product's 32-character identifier (IR-6).
   * @returns The subscription terms not yet attached to the product.
   */
  getUnusedProductSubscriptionTerms(productID: string): Promise<ProductOutOfScopeAssociation[]>;
}

/*
 * The sixteen excluded calculated members — §0.2.2.6, IR-3
 * §0.2.2.6 calls this "the exclusion most likely to be violated by accident", and IR-3 states the
 * failure mode exactly: without a stated boundary a downstream agent "would follow those getters and
 * drag half the platform into the port". This block is that stated boundary. Sixteen decisions,
 * each with a locator — not sixteen omissions.
 */

/**
 * A product — the port of `model/entity/Product.cfc` and the aggregate root of the Catalog.
 *
 * @example
 * ```ts
 * const product = new product;
 * product.productName = 'Nike Air';
 * product.urlTitle = 'nike-air-jorden';
 * ```
 */
export class Product implements AuditableEntity, AuditableManagedEntity {
  /*
   * Persistent properties — simple columns, [model/entity/Product.cfc:L52-L59]
   * Rule 1 — the persistent data surface is public fields, named exactly as the legacy properties.
   * CFML's generated `getX()` / `setX()` accessor pairs are not reproduced, and the reason is
   * decisive rather than stylistic: `../base/populate` implements CFML's null semantics as
   * `delete target[name]`, and an accessor-backed value cannot be deleted. Where the legacy keeps
   * both a backing variable and a hand-written getter that carries real behaviour, both are kept
   * (Rule 3) — this file does so for `template`, `title`, `brandName` and `price`.
   */

  /**
   * The primary identifier — [model/entity/Product.cfc:L52]:
   *
   * Property name="productID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   * unsavedvalue="" default="";
   */
  productID: string = '';

  /** [model/entity/Product.cfc:L53] `property name="activeFlag" ormtype="boolean"`. */
  declare activeFlag?: boolean;

  /** [model/entity/Product.cfc:L54] `property name="urlTitle" ormtype="string" unique="true"`. */
  declare urlTitle?: string;

  /**
   * [model/entity/Product.cfc:L55] `property name="productName" ormtype="string" notNull="true"`.
   */
  declare productName?: string;

  /**
   * [model/entity/Product.cfc:L56] `property name="productCode" ormtype="string" unique="true"`.
   */
  declare productCode?: string;

  /**
   * [model/entity/Product.cfc:L57]
   * `property name="productDescription" ormtype="string" length="4000" hb_formFieldType="wysiwyg"`.
   */
  declare productDescription?: string;

  /**
   * [model/entity/Product.cfc:L58]
   * `property name="publishedFlag" ormtype="boolean" default="false"`.
   */
  declare publishedFlag?: boolean;

  /**
   * [model/entity/Product.cfc:L59] `property name="sortOrder" ormtype="integer"`.
   *
   * TODO(boundary): the rightful owner is `src/adapters/mysql/UnitOfWork.ts`, which §0.4.1.7 makes
   * responsible for the implicit request-end commit gate and the ORM lifecycle hooks it replaces.
   */
  declare sortOrder?: number;

  /*
   * The four persisted calculated columns — [model/entity/Product.cfc:L62-L65]
   * these are real database columns on `SwProduct`, read straight off the row. They are declared
   * under the legacy comment `// Calculated Properties`, which invites exactly the confusion this
   * block exists to prevent: they are not members of the sixteen-name exclusion list, they perform
   * no computation, and they reach no service. Each is a plain optional persistent field, and each
   * carries an explicit `ormtype` in the source, recorded below because
   * `src/adapters/mysql/rowMappers.ts` needs it.
   */

  declare calculatedSalePrice?: ExactDecimal;

  /** [model/entity/Product.cfc:L63] `ormtype="integer"`. persisted, not computed here. */
  declare calculatedQATS?: number;

  declare calculatedAllowBackorderFlag?: boolean;

  /** [model/entity/Product.cfc:L65] `ormtype="string"`. persisted, not computed here. */
  declare calculatedTitle?: string;

  /*
   * Related object properties — many-to-one, [model/entity/Product.cfc:L62-L64 comment block, L68-L70]
   */

  /**
   * [model/entity/Product.cfc:L68]:
   *
   * Property name="brand" cfc="brand" fieldtype="many-to-one" fkcolumn="brandID"
   * hb_optionsNullRBKey="define.none" fetch="join";
   */
  declare brand?: Brand;

  /**
   * [model/entity/Product.cfc:L69]:
   *
   * Property name="productType" cfc="productType" fieldtype="many-to-one"
   * fkcolumn="productTypeID" fetch="join";
   */
  declare productType?: ProductType;

  /**
   * [model/entity/Product.cfc:L70]:
   *
   * Property name="defaultSku" cfc="Sku" fieldtype="many-to-one" fkcolumn="defaultSkuID"
   * cascade="delete" fetch="join";
   */
  declare defaultSku?: ProductDefaultSkuDelegate;

  /*
   * Related object properties — one-to-many, [model/entity/Product.cfc:L73-L76]
   * All four are `cascade="all-delete-orphan" inverse="true"`. `inverse="true"` is the fact that
   * shapes the bidirectional helpers: the many side owns the foreign key, which is why
   * {@link Product.addSku} and its three siblings hand ownership to the other entity through
   * `setProduct` instead of pushing onto the local array. `cascade="all-delete-orphan"` means
   * removing an element deletes its row; that execution belongs to `UnitOfWork.ts`.
   */

  /**
   * [model/entity/Product.cfc:L73]:
   *
   * Property name="skus" type="array" cfc="Sku" singularname="Sku" fieldtype="one-to-many"
   * fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
   */
  skus: ProductSkuMember[] = [];

  /**
   * [model/entity/Product.cfc:L74]:
   *
   * Property name="productImages" type="array" cfc="image" singularname="productImage"
   * fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan"
   * inverse="true";
   */
  productImages: ProductOwnedAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L75]:
   *
   * Property name="attributeValues" singularname="attributeValue" cfc="attributeValue"
   * fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan"
   * inverse="true";
   */
  attributeValues: ProductOwnedAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L76]:
   *
   * Property name="productReviews" singlularname="productReview" cfc="ProductReview"
   * fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan"
   * inverse="true";
   */
  productReviews: ProductOwnedAssociation[] = [];

  /*
   * Related object properties — many-to-many owner, [model/entity/Product.cfc:L79-L81]
   * these three are owner-side: none declares `inverse="true"`, so this entity owns the link
   * table. That is the opposite of every many-to-many on `Brand` and `ProductType`, which are all
   * inverse, and it is why the legacy `addListingPage` helper at [`:L712-L718`] mutates the local
   * `listingPages` array directly instead of delegating — the only such helper on this entity.
   */

  /**
   * [model/entity/Product.cfc:L79] — many-to-many owner over link table `SwProductListingPage`,
   * `cfc="Content"`, `singularname="listingPage"`, inverse join column `contentID`.
   */
  listingPages: ProductOutOfScopeAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L80] — many-to-many owner over link table `SwProductCategory`,
   * `cfc="Category"`, `singularname="category"`, inverse join column `categoryID`.
   */
  categories: ProductOutOfScopeAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L81] — many-to-many owner over link table `SwRelatedProduct`,
   * `cfc="Product"` and `type="array"`, `singularname="relatedProduct"`, inverse join column
   * `relatedProductID`.
   */
  relatedProducts: Product[] = [];

  /*
   * Related object properties — many-to-many inverse, [model/entity/Product.cfc:L84-L90]
   * Seven collections, every element family excluded by §0.2.2.1: `PromotionReward` and
   * `PromotionQualifier` (`Promotion*`, 9 files), `PriceGroupRate` (`PriceGroup*`, 4), `Vendor`
   * (`Vendor*`, 15) and `Physical` (`Physical*`, 6). All seven declare `inverse="true"`, so the
   * other side owns the link table, and all seven of their legacy helper pairs [`:L731-L785`] are
   * pure delegations into that other side — which is precisely why omitting the helpers leaves the
   * collections untraversed and the opaque element type honest.
   */

  promotionRewards: ProductOutOfScopeAssociation[] = [];

  promotionRewardExclusions: ProductOutOfScopeAssociation[] = [];

  promotionQualifiers: ProductOutOfScopeAssociation[] = [];

  promotionQualifierExclusions: ProductOutOfScopeAssociation[] = [];

  priceGroupRates: ProductOutOfScopeAssociation[] = [];

  vendors: ProductOutOfScopeAssociation[] = [];

  physicals: ProductOutOfScopeAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L93] `property name="remoteID" ormtype="string"`, under the legacy
   * `// Remote Properties` comment.
   */
  declare remoteID?: string;

  /*
   * Audit properties — [model/entity/Product.cfc:L96-L99]
   * All four declare `hb_populateEnabled="false"`, and product carries exactly four such
   * declarations — all audit, none anywhere else in the file. `ProductType` matches that. `Brand`
   * carries nine, because it flags five relationship properties as well; those five are
   * Brand-specific and are not copied here. The count is stated because the three files legitimately
   * differ and harmonising them would be wrong.
   */

  declare createdDateTime?: Date;

  /**
   * [model/entity/Product.cfc:L97] `hb_populateEnabled="false" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="createdByAccountID"`.
   */
  declare createdByAccount?: string;

  declare modifiedDateTime?: Date;

  /**
   * [model/entity/Product.cfc:L99] `hb_populateEnabled="false" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`.
   */
  declare modifiedByAccount?: string;

  /*
   * Non-persistent backing fields and per-instance memoization slots
   * Rule 3 — where the legacy keeps both a backing variable and a hand-written getter carrying real
   * behaviour, both are kept, and the declared property name is used consistently.
   */

  /** The display-template override consumed by {@link product.getTemplate}. */
  declare template?: string;

  /**
   * Per-instance memo for {@link Product.getTitle} — [model/entity/Product.cfc:L541-L544] caches into
   * `variables.title`, and `title` is a declared non-persistent property at [`:L110`].
   */
  declare title?: string;

  /**
   * Per-instance memo for {@link Product.getBrandName} — declared non-persistent at
   * [model/entity/Product.cfc:L105].
   */
  declare brandName?: string;

  /**
   * The price override consumed by {@link Product.getPrice} — declared non-persistent at
   * [model/entity/Product.cfc:L118] with `hb_formatType="currency"`.
   */
  declare price?: ExactDecimal;

  /**
   * Per-instance memo for {@link Product.getOptionGroupsStruct} — [model/entity/Product.cfc:L242-L248].
   */
  declare optionGroupsStruct?: Record<string, OptionGroup>;

  /**
   * Per-instance memo for {@link product.getOptionGroups} — [model/entity/Product.cfc:L252-L259].
   */
  declare optionGroups?: OptionGroup[];

  /**
   * Per-instance memo for {@link Product.getTransactionExistsFlag} —
   * [model/entity/Product.cfc:L625-L628]. Declared non-persistent at [`:L111`].
   */
  declare transactionExistsFlag?: boolean;

  /**
   * Per-instance memo for {@link Product.getUnusedProductOptions} —
   * [model/entity/Product.cfc:L636-L639]. Declared non-persistent at [`:L112`].
   */
  declare unusedProductOptions?: ProductSelectOption[];

  /**
   * Per-instance memo for {@link Product.getUnusedProductOptionGroups} —
   * [model/entity/Product.cfc:L643-L646]. Declared non-persistent at [`:L113`].
   */
  declare unusedProductOptionGroups?: ProductSelectOption[];

  /**
   * Whether this product has never been persisted — `true` while `productID` still holds the unsaved
   * value, and also when population has cleared the key outright (see
   * {@link readsAsUnsavedIdentifier}).
   */
  isNew(): boolean {
    return readsAsUnsavedIdentifier(this.productID);
  }

  /** The property whose value stands in for this entity in generic displays — `'productName'`. */
  getSimpleRepresentationPropertyName(): string {
    return 'productName';
  }

  /*
   * Collection accessors —, the live-array contract
   * every one of these returns the backing array by reference. Never `.slice`, never a spread
   * copy, never `ReadonlyArray`. This is load-bearing in both directions and a defensive copy
   * anywhere here converts a working mutation into a silent no-op:
   *
   * - Inbound: `brand.ts`'s port of the brand side splices the array returned by
   * `brand.getProducts()`, and {@link product.setBrand} appends into it
   * [model/entity/Product.cfc:L665].
   * - Outbound: {@link product.removeBrand} finds and splices the live array on the other entity
   * [`:L671-L673`].
   */

  /**
   * Every SKU of this product, as the live backing array.
   *
   * @returns The live `skus` array — mutations by the caller are intentional and visible here.
   */
  getSkus(): ProductSkuMember[] {
    return this.skus;
  }

  /**
   * Finds one of this product's SKUs by identifier — [model/entity/Product.cfc:L162-L169].
   *
   * @param readSkuID - Reads a SKU's 32-character identifier. TODO(boundary): collapses to
   * `sku.skuID` once `src/domain/sku/Sku.ts` exists.
   *
   * @param skuID - The identifier to match, compared with strict equality.
   * @returns The matching SKU, or `undefined` when none matches.
   */
  getSkuByID(readSkuID: ProductSkuIdReader, skuID: string): ProductSkuMember | undefined {
    for (const sku of this.getSkus()) {
      if (readSkuID(sku) === skuID) {
        return sku;
      }
    }
    return undefined;
  }

  /** This product's images, as the live backing array — [model/entity/Product.cfc:L178-L180]. */
  getImages(): ProductOwnedAssociation[] {
    return this.productImages;
  }

  /**
   * This product's images, as the live backing array — the framework-generated accessor name.
   *
   * @see {@link Product.getImages} for the hand-written legacy alias over the same array.
   */
  getProductImages(): ProductOwnedAssociation[] {
    return this.productImages;
  }

  /** This product's attribute values, as the live backing array. */
  getAttributeValues(): ProductOwnedAssociation[] {
    return this.attributeValues;
  }

  /** This product's reviews, as the live backing array. */
  getProductReviews(): ProductOwnedAssociation[] {
    return this.productReviews;
  }

  /**
   * This product's canonical public URL — [model/entity/Product.cfc:L207-L209].
   *
   * @param settings - Resolves `globalURLKeyProduct`. TODO(boundary): rightful owner is
   * `SettingResolverPort` via `src/adapters/settings/StaticSettingResolver.ts`.
   *
   * @returns The URL, with leading and trailing slashes.
   */
  getProductURL(settings: ProductSettingResolver): string {
    return `/${settings.setting('globalURLKeyProduct')}/${this.urlTitle ?? ''}/`;
  }

  /**
   * This product's URL as rendered inside a listing page — [model/entity/Product.cfc:L211-L213].
   *
   * @param settings - Resolves `globalURLKeyProduct`. Same boundary as
   * {@link product.getProductURL}.
   *
   * @returns The URL with a trailing slash and no leading slash.
   */
  getListingProductURL(settings: ProductSettingResolver): string {
    return `${settings.setting('globalURLKeyProduct')}/${this.urlTitle ?? ''}/`;
  }

  /**
   * The display template for this product — [model/entity/Product.cfc:L215-L221].
   *
   * @param settings - Resolves `productDisplayTemplate`, consulted only on the fallback path.
   * @returns The override when present and non-empty, otherwise the resolved setting value.
   */
  getTemplate(settings: ProductSettingResolver): string {
    const configuredTemplate = this.template;
    if (configuredTemplate === undefined || configuredTemplate === '') {
      return settings.setting('productDisplayTemplate');
    }
    return configuredTemplate;
  }

  /*
   * The option-to-sku resolution chain — §0.6.1, the hardest piece of the slice
   * The prompt names `getProductSkusBySelectedOptions` as the hardest piece of the Catalog, and
   * §0.6.1 explains why the name is misleading: the service method is a one-line delegation, and the
   * complexity lives one level down, in dynamically composed query text, and one level up — here, in
   * the arity assertions layered on top of it. This entity owns the upper half.
   */

  /**
   * Resolves the one SKU of this product matching a selection of options —
   * [model/entity/Product.cfc:L349-L364].
   *
   * @param skuOptionFinder - The option-resolution capability (Phase E). Consulted only when the
   * selection is non-empty.
   *
   * @param selectedOptions - A comma-delimited list of option identifiers. Defaults to the empty
   * string exactly as [`:L349`] declares, and the empty string selects path 2 or 3.
   *
   * @returns The single matching SKU.
   * @throws LegacyParityError - On every ambiguous or empty outcome; see the control flow above.
   */
  async getSkuBySelectedOptions(
    skuOptionFinder: ProductSkuOptionFinder,
    selectedOptions: string = '',
  ): Promise<ProductSkuMember | undefined> {
    if (selectedOptions.length > 0) {
      const matchingSkus = await this.getSkusBySelectedOptions(skuOptionFinder, selectedOptions);
      if (matchingSkus.length === 1) {
        // T4 depends on the query returning distinct rows; index 0 is the legacy's 1.
        const singleMatch = matchingSkus[0];
        if (singleMatch !== undefined) {
          return singleMatch;
        }
      } else if (matchingSkus.length > 1) {
        throw new LegacyParityError(moreThanOneSkuReturnedMessage(selectedOptions));
      } else if (matchingSkus.length < 1) {
        throw new LegacyParityError(noSkusFoundForSelectedOptionsMessage(selectedOptions));
      }
      /*
       * Formally unreachable: a length is exactly one, greater than one, or less than one. The
       * legacy simply fell out of its inner branch chain and returned null, and `noImplicitReturns`
       * requires that fall-through be written out. This is a transcription of the legacy implicit
       * null, not an additional guard, and it is also where the guarded index read lands if a
       * length of one ever coexisted with an absent element zero.
       */
      return undefined;
    } else if (this.getSkus().length === 1) {
      /*
       * Path 2 — the query is not called here. `getSkus` hands back the live array by reference
       * so binding it once is identical to the legacy's two calls at [`:L359`] and [`:L360`].
       */
      const productSkus = this.getSkus();
      const onlySku = productSkus[0];
      if (onlySku !== undefined) {
        return onlySku;
      }
      return undefined;
    } else {
      // path 3 — the else of the sku-count test. Not an argument guard. See the warning above.
      throw new LegacyParityError(NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE);
    }
  }

  /**
   * Every SKU of this product carrying all of the selected options —
   * [model/entity/Product.cfc:L366-L368].
   *
   * @param skuOptionFinder - The option-resolution capability. TODO(boundary): rightful owners are
   * `src/services/ProductService.ts` and, beneath it,
   * `skuRepository.findSkusBySelectedOptions` in `src/adapters/mysql/MySqlSkuRepository.ts`.
   *
   * @param selectedOptions - Comma-delimited option identifiers; defaults to the empty string exactly
   * as [`:L366`] declares, and is forwarded unmodified.
   *
   * @returns Every matching SKU, distinct, option-bearing only.
   */
  async getSkusBySelectedOptions(
    skuOptionFinder: ProductSkuOptionFinder,
    selectedOptions: string = '',
  ): Promise<ProductSkuMember[]> {
    return skuOptionFinder.getProductSkusBySelectedOptions(selectedOptions, this.productID);
  }

  /*
   * The option-structure members — retained, every one named explicitly by §0.4.1.4
   * §0.4.1.4's Domain Layer row names `getOptionGroupsStruct`, `getOptionGroups`,
   * `getOptionsByOptionGroup`, `getSkuBySelectedOptions`, `getSkusBySelectedOptions`,
   * `getBaseProductType`, `getUnusedProductOptions` and `getUnusedProductOptionGroups` as the members
   * the port carries. Three of them compose a paginated dynamic query in their legacy body, which
   * would otherwise place outside this layer entirely — so the tension is real and it is resolved the
   * way TR-5 dictates: the member is retained, the query moves out, and the capability comes back in
   * as an explicit parameter. The member is never quietly dropped, and no query text is written here.
   */

  /**
   * This product's option groups keyed by option-group identifier —
   * [model/entity/Product.cfc:L241-L249].
   *
   * @param optionGroupFinder - Forwarded to {@link Product.getOptionGroups} on a cache miss only.
   * @returns The live memoized map — by reference, consistent with the contract on collections.
   */
  async getOptionGroupsStruct(
    optionGroupFinder: ProductOptionGroupFinder,
  ): Promise<Record<string, OptionGroup>> {
    const memoizedStruct = this.optionGroupsStruct;
    if (memoizedStruct !== undefined) {
      return memoizedStruct;
    }
    const builtStruct: Record<string, OptionGroup> = {};
    for (const optionGroup of await this.getOptionGroups(optionGroupFinder)) {
      builtStruct[optionGroup.optionGroupID] = optionGroup;
    }
    this.optionGroupsStruct = builtStruct;
    return builtStruct;
  }

  /**
   * The option groups in use by this product — [model/entity/Product.cfc:L251-L261].
   *
   * @param optionGroupFinder - Consulted once per instance, on a cache miss only.
   * @returns The option groups, distinct and ordered by sort order ascending.
   */
  async getOptionGroups(optionGroupFinder: ProductOptionGroupFinder): Promise<OptionGroup[]> {
    const memoizedOptionGroups = this.optionGroups;
    if (memoizedOptionGroups !== undefined) {
      return memoizedOptionGroups;
    }
    const resolvedOptionGroups = await optionGroupFinder.getOptionGroupsForProduct(this.productID);
    this.optionGroups = resolvedOptionGroups;
    return resolvedOptionGroups;
  }

  /**
   * How many option groups this product uses — [model/entity/Product.cfc:L263-L265].
   *
   * @param optionGroupFinder - Forwarded to {@link Product.getOptionGroups}.
   * @returns The number of option groups in use.
   */
  async getOptionGroupCount(optionGroupFinder: ProductOptionGroupFinder): Promise<number> {
    return (await this.getOptionGroups(optionGroupFinder)).length;
  }

  /**
   * The options this product uses within one option group — [model/entity/Product.cfc:L340-L347].
   *
   * @param optionFinder - The option-resolution capability. TODO(boundary): rightful owners are
   * `src/services/OptionService.ts` and `smartListQueryPort` over
   * `src/adapters/mysql/SmartListQueryBuilder.ts`.
   *
   * @param optionGroupID - The option group to restrict to; required in the legacy signature too.
   * @returns The matching options, distinct and ordered by sort order ascending.
   */
  async getOptionsByOptionGroup(
    optionFinder: ProductOptionFinder,
    optionGroupID: string,
  ): Promise<Option[]> {
    return optionFinder.getOptionsForProductByOptionGroup(optionGroupID, this.productID);
  }

  /**
   * The options not yet used by this product — [model/entity/Product.cfc:L635-L640].
   *
   * @param unusedOptionFinder - TODO(boundary): rightful owner is `src/services/OptionService.ts`.
   * @param optionGroupFinder - Needed to build the existing-group list on a cache miss.
   * @returns The unused options as `{name, value}` entries.
   */
  async getUnusedProductOptions(
    unusedOptionFinder: ProductUnusedOptionFinder,
    optionGroupFinder: ProductOptionGroupFinder,
  ): Promise<ProductSelectOption[]> {
    const memoizedUnusedOptions = this.unusedProductOptions;
    if (memoizedUnusedOptions !== undefined) {
      return memoizedUnusedOptions;
    }
    const existingOptionGroupIDList = await buildExistingOptionGroupIDList(this, optionGroupFinder);
    const resolvedUnusedOptions = await unusedOptionFinder.getUnusedProductOptions(
      this.productID,
      existingOptionGroupIDList,
    );
    this.unusedProductOptions = resolvedUnusedOptions;
    return resolvedUnusedOptions;
  }

  /**
   * The option groups not yet used by this product — [model/entity/Product.cfc:L642-L647].
   *
   * @param unusedOptionFinder - TODO(boundary): rightful owner is `src/services/OptionService.ts`.
   * @param optionGroupFinder - Needed to build the existing-group list on a cache miss.
   * @returns The unused option groups as `{name, value}` entries.
   */
  async getUnusedProductOptionGroups(
    unusedOptionFinder: ProductUnusedOptionFinder,
    optionGroupFinder: ProductOptionGroupFinder,
  ): Promise<ProductSelectOption[]> {
    const memoizedUnusedOptionGroups = this.unusedProductOptionGroups;
    if (memoizedUnusedOptionGroups !== undefined) {
      return memoizedUnusedOptionGroups;
    }
    const existingOptionGroupIDList = await buildExistingOptionGroupIDList(this, optionGroupFinder);
    const resolvedUnusedOptionGroups =
      await unusedOptionFinder.getUnusedProductOptionGroups(existingOptionGroupIDList);
    this.unusedProductOptionGroups = resolvedUnusedOptionGroups;
    return resolvedUnusedOptionGroups;
  }

  /* Title and brand-name members. */

  /**
   * This product's rendered title — [model/entity/Product.cfc:L540-L545].
   *
   * @param settings - Resolves `productTitleString`. TODO(boundary): rightful owner is
   * `SettingResolverPort` via `src/adapters/settings/StaticSettingResolver.ts`.
   *
   * @returns The interpolated title, with unresolved tokens left verbatim.
   */
  getTitle(settings: ProductSettingResolver): string {
    const memoizedTitle = this.title;
    if (memoizedTitle !== undefined) {
      return memoizedTitle;
    }
    const resolveIdentifier: PropertyIdentifierResolver = (propertyIdentifier) =>
      resolveProductPropertyIdentifier(this, propertyIdentifier);
    const renderedTitle = replaceStringTemplate(
      settings.setting('productTitleString'),
      resolveIdentifier,
    );
    this.title = renderedTitle;
    return renderedTitle;
  }

  /**
   * This product's brand name — [model/entity/Product.cfc:L524-L532].
   *
   * @returns The brand name on the first call when a brand is present, `''` thereafter.
   */
  getBrandName(): string {
    const memoizedBrandName = this.brandName;
    if (memoizedBrandName === undefined) {
      this.brandName = '';
      const assignedBrand = this.brand;
      if (assignedBrand !== undefined) {
        // Returns without storing — the preserved defect. Do not hoist the cache write above this.
        return assignedBrand.brandName ?? '';
      }
    }
    return this.brandName ?? '';
  }

  /*
   * Members delegated to the default SKU — [model/entity/Product.cfc:L319, "Start: Functions that
   * delegate to the default sku"] and the second non-persistent block [`:l116-l123`]
   * §0.2.2.6 states positively that the port carries "url and title members; image-path members; and
   * the validation-support members", and the retain/omit decision rule above admits a non-persistent
   * member unless (a) it is one of the sixteen excluded names, (b) its body composes a paginated
   * dynamic query, or (c) its body reaches a framework facility forbids declaring.
   *
   * TODO(boundary): the rightful owners are `PricingPort` for the price reads and `ImagePathPort` for
   * the image reads (§0.2.2.7). Both are declared in `src/ports/**`, which this module does not
   * import; the collaborator is the `defaultSku` field itself, typed structurally per Phase E.
   */

  /** This product's currency code, from its default SKU — [model/entity/Product.cfc:L555-L559]. */
  getCurrencyCode(): string | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getCurrencyCode();
    }
    return undefined;
  }

  /** This product's price — [model/entity/Product.cfc:L561-L568]. */
  getPrice(): ExactDecimal | undefined {
    const overriddenPrice = this.price;
    if (overriddenPrice !== undefined) {
      return overriddenPrice;
    }
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getPrice();
    }
    return undefined;
  }

  /** This product's renewal price, from its default SKU — [model/entity/Product.cfc:L570-L574]. */
  getRenewalPrice(): ExactDecimal | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getRenewalPrice();
    }
    return undefined;
  }

  /** This product's list price, from its default SKU — [model/entity/Product.cfc:L576-L580]. */
  getListPrice(): ExactDecimal | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getListPrice();
    }
    return undefined;
  }

  /**
   * Reads this product's default SKU where the legacy dereferenced it without a guard.
   *
   */
  private requireDefaultSkuDelegate(locator: string): ProductDefaultSkuDelegate {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku === undefined) {
      throw new DomainError(
        `Product ${this.isNew() ? '(unsaved)' : this.productID} has no default SKU, so ${locator} ` +
          `cannot resolve. The legacy code dereferences the default SKU without a guard at that line ` +
          `and raises here too.`,
        { context: { productID: this.productID, locator } },
      );
    }
    return assignedDefaultSku;
  }

  /**
   * The directory holding this product's images — [model/entity/Product.cfc:L320-L322].
   *
   * @throws {DomainError} when no default SKU is assigned.
   */
  getImageDirectory(): string {
    return this.requireDefaultSkuDelegate('model/entity/Product.cfc:L321').getImageDirectory();
  }

  /**
   * The path of this product's image — [model/entity/Product.cfc:L324-L326].
   *
   * @throws {DomainError} when no default SKU is assigned.
   */
  getImagePath(): string {
    return this.requireDefaultSkuDelegate('model/entity/Product.cfc:L325').getImagePath();
  }

  /**
   * This product's rendered image — [model/entity/Product.cfc:L328-L330].
   *
   * @throws {DomainError} when no default SKU is assigned.
   */
  getImage(): string {
    return this.requireDefaultSkuDelegate('model/entity/Product.cfc:L329').getImage();
  }

  /**
   * The path of a resized variant of this product's image — [model/entity/Product.cfc:L332-L334].
   *
   * @throws {DomainError} when no default SKU is assigned.
   */
  getResizedImagePath(): string {
    return this.requireDefaultSkuDelegate('model/entity/Product.cfc:L333').getResizedImagePath();
  }

  /**
   * Whether this product's image file exists — [model/entity/Product.cfc:L336-L338].
   *
   * TODO(boundary): `ImagePathPort`.
   *
   * @throws {DomainError} when no default SKU is assigned.
   */
  getImageExistsFlag(): boolean {
    return this.requireDefaultSkuDelegate('model/entity/Product.cfc:L337').getImageExistsFlag();
  }

  /*
   * Bidirectional helper methods — [model/entity/Product.cfc:L659-L785]
   * The legacy block spans ten relationship pairs. Five pairs are retained — the brand pair and the
   * four one-to-many pairs — and five are omitted with their locators recorded in the omitted
   * collection helpers block below.
   */

  /**
   * Assigns this product's brand and registers the product on the brand's side —
   * [model/entity/Product.cfc:L662-L667].
   *
   * @param brand - The brand to assign. Required, exactly as [`:L662`] declares it.
   */
  setBrand(brand: Brand): void {
    this.brand = brand;
    if (this.isNew() || !brand.hasProduct(this)) {
      brand.getProducts().push(this);
    }
  }

  /**
   * Clears this product's brand and unregisters it from the brand's side —
   * [model/entity/Product.cfc:L668-L677].
   *
   * @param brand - The brand to unregister from. Defaults to this product's currently assigned brand.
   */
  removeBrand(brand?: Brand): void {
    const targetBrand = brand ?? this.brand;
    if (targetBrand !== undefined) {
      const brandProducts = targetBrand.getProducts();
      const index = brandProducts.indexOf(this);
      if (index !== -1) {
        brandProducts.splice(index, 1);
      }
    }
    // Unconditional, exactly as [model/entity/Product.cfc:L676]. Outside the guard by design.
    delete this.brand;
  }

  /**
   * Adds a SKU to this product — [model/entity/Product.cfc:L696-L698].
   *
   * TODO(boundary): collapses to the real type once `src/domain/sku/Sku.ts` exists.
   */
  addSku(sku: ProductSkuMember): void {
    sku.setProduct(this);
  }

  /**
   * Removes a SKU from this product — [model/entity/Product.cfc:L699-L701].
   *
   * TODO(boundary): collapses to the real type once `src/domain/sku/Sku.ts` exists.
   */
  removeSku(sku: ProductSkuMember): void {
    sku.removeProduct(this);
  }

  /**
   * Adds an attribute value to this product — [model/entity/Product.cfc:L680-L682].
   *
   * TODO(boundary): the attribute service is out of scope; the element type is the shared structural
   * association until an attribute-value module exists.
   */
  addAttributeValue(attributeValue: ProductOwnedAssociation): void {
    attributeValue.setProduct(this);
  }

  /** Removes an attribute value from this product — [model/entity/Product.cfc:L683-L685]. */
  removeAttributeValue(attributeValue: ProductOwnedAssociation): void {
    attributeValue.removeProduct(this);
  }

  /**
   * Adds an image to this product — [model/entity/Product.cfc:L688-L690].
   *
   * TODO(boundary): the image domain module and `ImagePathPort`.
   */
  addProductImage(productImage: ProductOwnedAssociation): void {
    productImage.setProduct(this);
  }

  /** Removes an image from this product — [model/entity/Product.cfc:L691-L693]. */
  removeProductImage(productImage: ProductOwnedAssociation): void {
    productImage.removeProduct(this);
  }

  /**
   * Adds a review to this product — [model/entity/Product.cfc:L704-L706].
   *
   * TODO(boundary): the product-review domain module.
   */
  addProductReview(productReview: ProductOwnedAssociation): void {
    productReview.setProduct(this);
  }

  /** Removes a review from this product — [model/entity/Product.cfc:L707-L709]. */
  removeProductReview(productReview: ProductOwnedAssociation): void {
    productReview.removeProduct(this);
  }

  /* Product-type, validation-support and boundary members. */

  /**
   * This product's base product type, resolved through its product type —
   * [model/entity/Product.cfc:L493-L495].
   *
   * @param rootProductTypeResolver - Forwarded to `ProductType.getBaseProductType`.
   * @returns The base product type code, or `undefined` when the assigned product type's root resolves
   * without a system code. Never `undefined` for a missing product type or an unresolvable root —
   * both of those raise.
   */
  async getBaseProductType(
    rootProductTypeResolver: ProductTypeRootResolver,
  ): Promise<BaseProductTypeCode | undefined> {
    const assignedProductType = this.productType;
    if (assignedProductType === undefined) {
      throw new DomainError(
        `Product ${this.isNew() ? '(unsaved)' : this.productID} has no product type, so ` +
          'model/entity/Product.cfc:L494 cannot resolve. The legacy code dereferences the product ' +
          'type without a guard at that line and raises here too.',
        { context: { productID: this.productID, locator: 'model/entity/Product.cfc:L494' } },
      );
    }
    return assignedProductType.getBaseProductType(rootProductTypeResolver);
  }

  /**
   * Whether any transaction exists that would block deleting this product —
   * [model/entity/Product.cfc:L624-L629].
   *
   * @param transactionChecker - Supply `createTransactionExistenceChecker` from
   * `src/adapters/mysql/MySqlSkuRepository.ts`. It adapts `skuRepository.transactionExists`, which
   * ports the ten-way existence chain at [model/dao/SkuDAO.cfc:L53-L98], onto this caller-ordered
   * contract. Its declared return type is the intersection of this interface and the SKU-side one, so
   * the crossing is checked at compile time where it is written.
   */
  async getTransactionExistsFlag(
    transactionChecker: ProductTransactionExistenceChecker,
  ): Promise<boolean> {
    const memoizedFlag = this.transactionExistsFlag;
    if (memoizedFlag !== undefined) {
      return memoizedFlag;
    }
    // productID occupies the second parameter — model/service/SkuService.cfc:L285-L287 forwards whatever
    // the caller names, and [model/entity/Product.cfc:L626] names only this one. The first must stay
    // `undefined` — a supplied
    // skuID wins at SkuDAO.cfc:L58-L64 and would suppress the product-scoped branch at :L61.
    const resolvedFlag = await transactionChecker.getTransactionExistsFlag(
      undefined,
      this.productID,
    );
    this.transactionExistsFlag = resolvedFlag;
    return resolvedFlag;
  }

  /**
   * The subscription terms not yet used by this product — [model/entity/Product.cfc:L649-L654].
   *
   * @param subscriptionTermFinder - Optional. TODO(boundary): rightful owner is `SubscriptionTermPort`
   * (§0.2.2.7), over the subscription branch of `skuService.createSkus`.
   *
   * @returns The unused subscription terms, or an empty array when the capability is absent.
   */
  async getUnusedProductSubscriptionTerms(
    subscriptionTermFinder?: ProductSubscriptionTermFinder,
  ): Promise<ProductOutOfScopeAssociation[]> {
    if (subscriptionTermFinder === undefined) {
      return [];
    }
    return subscriptionTermFinder.getUnusedProductSubscriptionTerms(this.productID);
  }

  /**
   * This product's options grouped by option group — [model/entity/Product.cfc:L631-L633].
   *
   * @returns Never returns; see below.
   * @throws NotImplementedError - Always. The collaborator this delegates to does not exist.
   */
  getProductOptionsByGroup(): never {
    throw new NotImplementedError(
      'Product.getProductOptionsByGroup',
      'Carried across as defect D5 (AAP §0.6.7.3): the legacy body at ' +
        'model/entity/Product.cfc:L631-L633 delegates to a product-service member that is declared ' +
        'nowhere in the repository, so the call was unresolvable at runtime. The member is retained ' +
        'under TR-5 rather than dropped, and the missing collaborator is deliberately not invented.',
    );
  }

  /*
   * Not ported — the omission record
   * Every member of the legacy component with no counterpart on this class, grouped by the reason it
   * has none, so each omission reads as a decision (TR-5). The sixteen excluded calculated members
   * are catalogued separately above. Nothing below is stubbed.
   */

  /*
   * Validation contract — `model/validation/Product.json`, comment-only
   * not one rule below is implemented, evaluated or enforced in this file.
   * `src/validation/rules/product.rules.ts` owns them, evaluated by `src/validation/Validator.ts`
   * (§0.4.1.5). They are documented here because IR-4 is explicit that declarative validation is
   * behaviour rather than configuration, and because four members on this class exist solely to feed
   * them — the "validation-support members" §0.2.2.6 puts on the positive carry list.
   */

  /*
   * The traceable test contract — `test/domain/Product.test.ts` (owned by another agent)
   * §0.6.5 requires every converted member to be labelled TRACEABLE or NET-NEW, and to state the
   * ratio honestly rather than implying parity. For this entity the ratio is stark and is not softened:
   * One own legacy assertion plus four inherited ones. Everything else is NET-NEW.
   */

  /*
   * The managed-entity contract — [org/Hibachi/**], inherited in CFML, declared here (IR-1 / TR-3)
   * Seven members every legacy entity received down the
   * `HibachiObject` -> `HibachiTransient` -> `HibachiEntity` -> `model/entity/HibachiEntity.cfc`
   * inheritance chain, and which `src/validation/Validator.ts` and
   * `src/ports/UniquePropertyPort.ts` both require by name. Neither contract can be satisfied by a
   * plain data class, which is why they are declared rather than assumed.
   */

  /**
   * `Product` — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of the
   * component's fully qualified name. Interpolated into every validation message
   * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216].
   *
   * @returns The bare class name.
   */
  getClassName(): string {
    return PRODUCT_CLASS_NAME;
  }

  /**
   * `SlatwallProduct` — [org/Hibachi/HibachiEntity.cfc:L287-L289]. Live metadata reflection is replaced by the
   * declared constant, per TR-3.
   *
   * @returns The mapped ORM entity name, not the physical table name.
   */
  getEntityName(): string {
    return PRODUCT_ENTITY_NAME;
  }

  /**
   * `productID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP §0.7.3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return PRODUCT_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's value — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return readIdentifierOrUnsaved(this.productID);
  }

  /**
   * Whether this entity declares the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(PRODUCT_DECLARED_PROPERTIES, propertyIdentifier);
  }

  /**
   * Resolves a declared property's metadata, raising for an undeclared name —
   * [org/Hibachi/HibachiTransient.cfc:L738-L747], whose present-key branch is at [:L741-L743] and
   * whose throw is at [:L746]. The non-optional return type is faithful to that declaration.
   *
   * @param propertyName - The name to resolve.
   * @returns The metadata for that property.
   * @throws DomainError - When no property of that name is declared. Withheld from every response
   * by the deny-by-default presentation, because it signals a fault in the port rather than
   * anything a caller can provoke.
   */
  getPropertyMetaData(propertyName: string): EntityPropertyMetaData {
    return requireDeclaredPropertyMetaData(
      PRODUCT_DECLARED_PROPERTIES,
      propertyName,
      PRODUCT_CLASS_NAME,
    );
  }

  /**
   * Reads a value by property identifier, walking a path delimited by either `.` or `_` —
   * [org/Hibachi/HibachiTransient.cfc:L466-L481]. An unresolvable path yields `''`, never an absent
   * value; `readValueByPropertyIdentifier` documents all four traversal rules and why each is
   * behaviour rather than convenience.
   *
   * @param propertyIdentifier - A property name, or a delimited path.
   * @returns The resolved value, or `''`.
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown {
    return readValueByPropertyIdentifier(this, propertyIdentifier);
  }

  /*
   * Errors / messages — [org/Hibachi/HibachiTransient.cfc:L26-L67]
   * The entity is an error carrier, and within this slice that is load-bearing rather than
   * incidental. [model/service/SkuService.cfc:L143], [`:L148`] and [`:L174`] attach their
   * required-field failures to the product — `product.addError(name, rbKey(...))` — and
   * [`:L151`] and [`:L179`] then gate every SKU-creating branch on `product.hasErrors()`. A
   * product with no way to hold an error cannot express either half of that contract: the
   * failures have nowhere to land, and the gate that reads them is unwritable.
   */

  /**
   * This product's error bean. Lazily created so an unerrored product carries no allocation, and
   * per-instance so it cannot be shared — the two properties `getHibachiErrors()` has.
   */
  private errorBean: ValidationError | undefined = undefined;

  /** Returns this product's error bean, creating it on first demand. */
  private requireErrorBean(): ValidationError {
    this.errorBean ??= new ValidationError();
    return this.errorBean;
  }

  /** A struct of all the errors for this entity — [org/Hibachi/HibachiTransient.cfc:L29-L31]. */
  public getErrors(): ValidationErrors {
    return this.requireErrorBean().getErrors();
  }

  /** The error messages held under one error name — [org/Hibachi/HibachiTransient.cfc:L34-L44]. */
  public getError(errorName: string): readonly string[] {
    return this.requireErrorBean().getError(errorName);
  }

  /** Whether this entity has any error — [org/Hibachi/HibachiTransient.cfc:L47-L53]. */
  public hasErrors(): boolean {
    return this.requireErrorBean().hasErrors();
  }

  /** Whether one specific error key exists — [org/Hibachi/HibachiTransient.cfc:L56-L58]. */
  public hasError(errorName: string): boolean {
    return this.requireErrorBean().hasError(errorName);
  }

  /** Adds one error under one name — [org/Hibachi/HibachiTransient.cfc:L61-L63]. */
  public addError(errorName: string, errorMessage: string): void {
    this.requireErrorBean().addError(errorName, errorMessage);
  }

  /** Merges a whole struct of errors in — [org/Hibachi/HibachiTransient.cfc:L66-L68]. */
  public addErrors(errors: ValidationErrors): void {
    this.requireErrorBean().addErrors(errors);
  }
}

/*
 * Module-level helpers
 * Declared as module-scope functions rather than as private methods, matching the sibling
 * `ProductType.ts`, which places its own path-building helpers after its class in exactly this shape.
 * None of the four sibling entity modules declares a single `private` or `#` member, so the convention
 * is consistent across the folder and is followed here.
 */

/**
 * Flattens the keys of a product's option-group map into one comma-delimited string.
 *
 * @param product - The product whose option-group keys are wanted.
 * @param optionGroupFinder - Forwarded to `Product.getOptionGroupsStruct`.
 * @returns The comma-delimited identifier list, in unspecified key order.
 */
async function buildExistingOptionGroupIDList(
  product: Product,
  optionGroupFinder: ProductOptionGroupFinder,
): Promise<string> {
  return Object.keys(await product.getOptionGroupsStruct(optionGroupFinder)).join(',');
}

/**
 * Resolves one template identifier against a product, for `Product.getTitle`.
 *
 * @param product - The entity the identifier is resolved against.
 * @param propertyIdentifier - A bare or single-dotted property identifier, delimiters already stripped.
 * @returns The resolved string value; `''` for a declared but unresolved property; or `undefined`
 * to leave a genuinely undeclared token verbatim.
 */
function resolveProductPropertyIdentifier(
  product: Product,
  propertyIdentifier: string,
): string | undefined {
  const separatorIndex = propertyIdentifier.indexOf('.');
  if (separatorIndex === -1) {
    return readProductStringProperty(product, propertyIdentifier);
  }

  const relationshipName = propertyIdentifier.slice(0, separatorIndex);
  const relatedPropertyName = propertyIdentifier.slice(separatorIndex + 1);
  // Two or more dots: the remainder still contains a separator, so it is beyond the supported depth.
  if (relatedPropertyName.includes('.')) {
    return undefined;
  }

  if (relationshipName === 'brand') {
    return readBrandStringProperty(product.brand, relatedPropertyName);
  }

  if (relationshipName === 'productType') {
    return readProductTypeStringProperty(product.productType, relatedPropertyName);
  }

  return undefined;
}

/**
 * Reads one string-valued property off a product by name.
 *
 * @param product - The entity to read from.
 * @param propertyName - The property name, matched exactly and case-sensitively.
 * @returns The value; `''` when a declared string property is absent; or `undefined` when the name
 * is not one of the declared string properties this template resolver supports.
 */
function readProductStringProperty(product: Product, propertyName: string): string | undefined {
  switch (propertyName) {
    case 'productID':
      return product.productID;
    case 'productName':
      return product.productName ?? '';
    case 'productCode':
      return product.productCode ?? '';
    case 'productDescription':
      return product.productDescription ?? '';
    case 'urlTitle':
      return product.urlTitle ?? '';
    case 'calculatedTitle':
      return product.calculatedTitle ?? '';
    case 'remoteID':
      return product.remoteID ?? '';
    default:
      return undefined;
  }
}

/**
 * Reads one string-valued property off a brand by name, for single-dotted identifiers.
 *
 * @param brand - The related brand, when the relationship has an assigned instance.
 * @param propertyName - The property name, matched exactly and case-sensitively.
 * @returns The value; `''` when the relationship or declared string value is absent; or `undefined`
 * when the related property is undeclared by this resolver.
 */
function readBrandStringProperty(
  brand: Brand | undefined,
  propertyName: string,
): string | undefined {
  switch (propertyName) {
    case 'brandID':
      return brand?.brandID ?? '';
    case 'brandName':
      return brand?.brandName ?? '';
    case 'brandWebsite':
      return brand?.brandWebsite ?? '';
    case 'urlTitle':
      return brand?.urlTitle ?? '';
    case 'remoteID':
      return brand?.remoteID ?? '';
    default:
      return undefined;
  }
}

/**
 * Reads one string-valued property off a product type by name, for single-dotted identifiers.
 *
 * @param productType - The related product type, when the relationship has an assigned instance.
 * @param propertyName - The property name, matched exactly and case-sensitively.
 * @returns The value; `''` when the relationship or declared string value is absent; or `undefined`
 * when the related property is undeclared by this resolver.
 */
function readProductTypeStringProperty(
  productType: ProductType | undefined,
  propertyName: string,
): string | undefined {
  switch (propertyName) {
    case 'productTypeID':
      return productType?.productTypeID ?? '';
    case 'productTypeName':
      return productType?.productTypeName ?? '';
    case 'productTypeDescription':
      return productType?.productTypeDescription ?? '';
    case 'productTypeIDPath':
      return productType?.productTypeIDPath ?? '';
    case 'systemCode':
      return productType?.systemCode ?? '';
    case 'urlTitle':
      return productType?.urlTitle ?? '';
    case 'remoteID':
      return productType?.remoteID ?? '';
    default:
      return undefined;
  }
}

/*
 * R-B — the population contract
 * this class declares no `populate` method, by mandate. The legacy override at
 * [model/entity/HibachiEntity.cfc:L56] delegated to the framework's metadata-driven pass, which
 * walked `getProperties()` and dispatched on each property's `fieldtype` at runtime
 * [org/Hibachi/HibachiTransient.cfc]. In the target, `../base/populate` owns population outright and
 * forbids an entity declaring the member at all. What this file owns instead is the declaration of
 * which properties are populatable and how — the descriptor set below, which is the typed, compile-
 * checked replacement for that metadata walk (TR-3).
 */

/** Every property name `model/entity/Product.cfc` declares, in source order. */
export type ProductPropertyName =
  | 'productID'
  | 'activeFlag'
  | 'urlTitle'
  | 'productName'
  | 'productCode'
  | 'productDescription'
  | 'publishedFlag'
  | 'sortOrder'
  | 'calculatedSalePrice'
  | 'calculatedQATS'
  | 'calculatedAllowBackorderFlag'
  | 'calculatedTitle'
  | 'brand'
  | 'productType'
  | 'defaultSku'
  | 'skus'
  | 'productImages'
  | 'attributeValues'
  | 'productReviews'
  | 'listingPages'
  | 'categories'
  | 'relatedProducts'
  | 'promotionRewards'
  | 'promotionRewardExclusions'
  | 'promotionQualifiers'
  | 'promotionQualifierExclusions'
  | 'priceGroupRates'
  | 'vendors'
  | 'physicals'
  | 'remoteID'
  | 'price'
  | AuditPropertyName;

/** The twenty `persistent="false"` properties [model/entity/Product.cfc:L102-L123] declares. */
export type ProductNonPersistentPropertyName =
  | 'allowBackorderFlag'
  | 'baseProductType'
  | 'brandName'
  | 'brandOptions'
  | 'estimatedReceivalDetails'
  | 'qats'
  | 'salePriceDetailsForSkus'
  | 'title'
  | 'transactionExistsFlag'
  | 'unusedProductOptions'
  | 'unusedProductOptionGroups'
  | 'unusedProductSubscriptionTerms'
  | 'currencyCode'
  | 'defaultProductImageFiles'
  | 'price'
  | 'renewalPrice'
  | 'listPrice'
  | 'livePrice'
  | 'salePrice'
  | 'currentAccountPrice';

/**
 * Product's frozen metadata declaration — what `manageEntity` reads to compose the seven framework
 * introspection members onto an instance.
 */
export const PRODUCT_ENTITY_METADATA: EntityMetadataDeclaration<ProductPropertyName> =
  Object.freeze({
    className: 'Product',
    entityName: 'SlatwallProduct',
    primaryIDPropertyName: 'productID',
    properties: Object.freeze({
      productID: true,
      activeFlag: true,
      urlTitle: true,
      productName: true,
      productCode: true,
      productDescription: true,
      publishedFlag: true,
      sortOrder: true,
      calculatedSalePrice: true,
      calculatedQATS: true,
      calculatedAllowBackorderFlag: true,
      calculatedTitle: true,
      brand: true,
      productType: true,
      defaultSku: true,
      skus: true,
      productImages: true,
      attributeValues: true,
      productReviews: true,
      listingPages: true,
      categories: true,
      relatedProducts: true,
      promotionRewards: true,
      promotionRewardExclusions: true,
      promotionQualifiers: true,
      promotionQualifierExclusions: true,
      priceGroupRates: true,
      vendors: true,
      physicals: true,
      remoteID: true,
      price: true,
      createdDateTime: true,
      createdByAccount: true,
      modifiedDateTime: true,
      modifiedByAccount: true,
    } satisfies Readonly<Record<ProductPropertyName, true>>),
    declaredNonFieldProperties: Object.freeze({
      allowBackorderFlag: true,
      baseProductType: true,
      brandName: true,
      brandOptions: true,
      estimatedReceivalDetails: true,
      qats: true,
      salePriceDetailsForSkus: true,
      title: true,
      transactionExistsFlag: true,
      unusedProductOptions: true,
      unusedProductOptionGroups: true,
      unusedProductSubscriptionTerms: true,
      currencyCode: true,
      defaultProductImageFiles: true,
      price: true,
      renewalPrice: true,
      listPrice: true,
      livePrice: true,
      salePrice: true,
      currentAccountPrice: true,
    } satisfies Readonly<Record<ProductNonPersistentPropertyName, true>>),
  } satisfies EntityMetadataDeclaration<ProductPropertyName>);

/*
 * The per-entity metadata constants — one source, two vocabularies
 * `PRODUCT_ENTITY_METADATA` above is the single frozen declaration of this entity's class name, ORM entity name,
 * primary-identifier property name and declared-property set. The four constants below name those
 * same four facts individually, because the entity's own metadata members and the population
 * descriptor set read them one at a time, and a named constant states the intent better at each of
 * those sites than reaching into a record does.
 */

/**
 * The bare class name — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of
 * the component's fully qualified name. Carries no `Slatwall` prefix.
 */
export const PRODUCT_CLASS_NAME: string = PRODUCT_ENTITY_METADATA.className;

/**
 * The mapped ORM entity name declared by the `entityname` attribute at [`:L49`] and read at
 * [org/Hibachi/HibachiEntity.cfc:L287-L289].
 */
export const PRODUCT_ENTITY_NAME: string = PRODUCT_ENTITY_METADATA.entityName;

/**
 * The name of the primary identifier property — [`:L52`], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 */
export const PRODUCT_PRIMARY_ID_PROPERTY_NAME: string =
  PRODUCT_ENTITY_METADATA.primaryIDPropertyName;

/**
 * Every property name the legacy entity declares, as a keyed set — the port of the
 * `getPropertiesStruct()` structure [org/Hibachi/HibachiTransient.cfc:L739] that both `hasProperty`
 * [:L764] and `getPropertyMetaData` [:L741] key into. Membership is an own-key test in both.
 */
export const PRODUCT_DECLARED_PROPERTIES: DeclaredPropertyNameSet<string> = Object.freeze({
  ...PRODUCT_ENTITY_METADATA.properties,
  ...(PRODUCT_ENTITY_METADATA.declaredNonFieldProperties ?? {}),
});

/**
 * The eleven simple persistent columns population may write, in legacy declaration order —
 * [model/entity/Product.cfc:L53-L59] then [`:L62-L65`].
 */
const PRODUCT_SIMPLE_PROPERTY_DESCRIPTORS: readonly ColumnPropertyDescriptor<ProductPropertyName>[] =
  [
    { name: 'activeFlag', valueType: 'boolean' },
    { name: 'urlTitle', valueType: 'string' },
    { name: 'productName', valueType: 'string', notNull: true },
    { name: 'productCode', valueType: 'string' },
    { name: 'productDescription', valueType: 'string' },
    { name: 'publishedFlag', valueType: 'boolean' },
    { name: 'sortOrder', valueType: 'integer' },
    { name: 'calculatedSalePrice', valueType: 'bigDecimal' },
    { name: 'calculatedQATS', valueType: 'integer' },
    { name: 'calculatedAllowBackorderFlag', valueType: 'boolean' },
    { name: 'calculatedTitle', valueType: 'string' },
    /*
     * `price` is the non-persistent override at `model/entity/Product.cfc:L118`. The legacy
     * `getProperties()` walk includes non-persistent declarations, so `populate` writes this slot and
     * `getPrice()` reads it before consulting the default SKU (`Product.cfc:L561-L563`).
     */
    { name: 'price', valueType: 'bigDecimal' },
  ];

/**
 * `remoteID` — [model/entity/Product.cfc:L93]. A populate-enabled simple column, declared separately
 * from the eleven above because it sits after the relationship block in the legacy source and
 * declaration order is preserved.
 */
const PRODUCT_REMOTE_ID_DESCRIPTOR: ColumnPropertyDescriptor<ProductPropertyName> = {
  name: 'remoteID',
  valueType: 'string',
};

/**
 * The four audit properties as populate-disabled descriptors, generated from `AUDIT_PROPERTY_NAMES`
 * in `../base/AuditableEntity` rather than hand-written, so this list cannot drift from that
 * authority. `../base/populate` also excludes the four structurally; the flags are declared here as
 * well because [model/entity/Product.cfc:L96-L99] carries them on all four properties and the
 * descriptor set is the faithful record of that declaration.
 */
const PRODUCT_AUDIT_PROPERTY_DESCRIPTORS: readonly PopulatePropertyDescriptor<
  Product,
  AuditPropertyName
>[] = AUDIT_PROPERTY_NAMES.map<PopulatePropertyDescriptor<Product, AuditPropertyName>>(
  (auditPropertyName) => ({ name: auditPropertyName, populateEnabled: false }),
);

/** The collaborators each populatable relationship needs before population can act on it. */
export interface ProductPopulationCollaborators {
  /** The `brand` many-to-one — [model/entity/Product.cfc:L68]. */
  readonly brand?: {
    readonly loader: RelatedEntityLoader<Brand>;
    readonly populate: SubPropertyPopulator<Brand>;
  };

  /** The `productType` many-to-one — [model/entity/Product.cfc:L69]. */
  readonly productType?: {
    readonly loader: RelatedEntityLoader<ProductType>;
    readonly populate: SubPropertyPopulator<ProductType>;
  };

  /** The `defaultSku` many-to-one — [model/entity/Product.cfc:L70], `cascade="delete"`. */
  readonly defaultSku?: {
    readonly loader: RelatedEntityLoader<ProductDefaultSkuDelegate>;
    readonly populate: SubPropertyPopulator<ProductDefaultSkuDelegate>;
  };

  /**
   * The `skus` one-to-many — [model/entity/Product.cfc:L73].
   *
   * TODO(boundary): collapses to the real SKU type once `src/domain/sku/Sku.ts` exists.
   */
  readonly skus?: {
    readonly loader: RelatedEntityLoader<ProductSkuMember>;
    readonly populate: SubPropertyPopulator<ProductSkuMember>;
  };

  /**
   * The `productImages` one-to-many — [model/entity/Product.cfc:L74], element component `Image`.
   *
   * TODO(boundary): the image domain module and `ImagePathPort`.
   */
  readonly productImages?: {
    readonly loader: RelatedEntityLoader<ProductOwnedAssociation>;
    readonly populate: SubPropertyPopulator<ProductOwnedAssociation>;
  };

  /**
   * The `attributeValues` one-to-many — [model/entity/Product.cfc:L75].
   *
   * TODO(boundary): the attribute subsystem, out of scope per §0.2.2.1.
   */
  readonly attributeValues?: {
    readonly loader: RelatedEntityLoader<ProductOwnedAssociation>;
    readonly populate: SubPropertyPopulator<ProductOwnedAssociation>;
  };

  /**
   * The `productReviews` one-to-many — [model/entity/Product.cfc:L76].
   *
   * TODO(boundary): the product-review domain module, out of scope per §0.2.2.4.
   */
  readonly productReviews?: {
    readonly loader: RelatedEntityLoader<ProductOwnedAssociation>;
    readonly populate: SubPropertyPopulator<ProductOwnedAssociation>;
  };

  /** The `relatedProducts` many-to-many — [model/entity/Product.cfc:L81]. */
  readonly relatedProducts?: {
    readonly loader: RelatedEntityLoader<Product>;
    readonly populate: SubPropertyPopulator<Product>;
  };
}

/**
 * Builds Product's population contract — the declared replacement for the legacy metadata walk.
 *
 * TODO(boundary): the rightful owners are the content, category, promotion, price-group, vendor and
 * physical subsystems, all outside this slice (TR-5). No port file is created, no service is
 * imported and no shape is invented for any of them.
 *
 * @param collaborators - Per-relationship collaborators. Omit the whole argument, or any individual
 * group, to obtain a contract in which that relationship is not declared and its payload key is
 * ignored exactly as the nine omitted collections are.
 *
 * @returns Product's population contract, with `persistent: true` and its properties in legacy
 * declaration order.
 *
 * @example
 * ```ts
 * // The nested-product-type payload of regression issue_1097.
 * ```
 */
export function createProductPropertyDescriptors(
  collaborators: ProductPopulationCollaborators = {},
): PropertyDescriptorSet<Product, ProductPropertyName> {
  /*
   * Every `relatedPrimaryIdPropertyName` below was read from the related entity's own
   * `fieldtype="id"` declaration, not assumed from a naming pattern (AAP §0.7.3). The pattern happens to hold
   * uniformly here, which is exactly why guessing would have felt safe and why each was verified
   * individually instead:
   *
   * brandID [model/entity/Brand.cfc:L52]
   * productTypeID [model/entity/ProductType.cfc:L52]
   * skuID [model/entity/Sku.cfc:L52] — used for `defaultSku` and `skus`
   */
  const brandDescriptors: readonly ManyToOnePropertyDescriptor<ProductPropertyName, Brand>[] =
    collaborators.brand === undefined
      ? []
      : [
          {
            kind: 'many-to-one',
            name: 'brand',
            relatedPrimaryIdPropertyName: 'brandID',
            loader: collaborators.brand.loader,
            populateRelated(brand, data) {
              collaborators.brand?.populate(brand, data);
            },
          },
        ];

  const productTypeDescriptors: readonly ManyToOnePropertyDescriptor<
    ProductPropertyName,
    ProductType
  >[] =
    collaborators.productType === undefined
      ? []
      : [
          {
            kind: 'many-to-one',
            name: 'productType',
            relatedPrimaryIdPropertyName: 'productTypeID',
            loader: collaborators.productType.loader,
            populateRelated(productType, data) {
              collaborators.productType?.populate(productType, data);
            },
          },
        ];

  const defaultSkuDescriptors: readonly ManyToOnePropertyDescriptor<
    ProductPropertyName,
    ProductDefaultSkuDelegate
  >[] =
    collaborators.defaultSku === undefined
      ? []
      : [
          {
            kind: 'many-to-one',
            name: 'defaultSku',
            relatedPrimaryIdPropertyName: 'skuID',
            loader: collaborators.defaultSku.loader,
            populateRelated(defaultSku, data) {
              collaborators.defaultSku?.populate(defaultSku, data);
            },
          },
        ];

  /*
   * `singularName: 'Sku'` reproduces the legacy `singularname="Sku"` at [model/entity/Product.cfc:L73]
   * verbatim, capital S included — the one collection on this entity whose singular name is
   * capitalised, where `productImage`, `attributeValue` and `productReview` are not. Nothing here
   * concatenates the value into a member name (AAP §0.7.3, TR-3); it is declared provenance, and `addRelated`
   * is the explicit replacement for the legacy composed dispatch.
   */
  const skusDescriptors: readonly OneToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    ProductSkuMember
  >[] =
    collaborators.skus === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'skus',
            relatedPrimaryIdPropertyName: 'skuID',
            singularName: 'Sku',
            loader: collaborators.skus.loader,
            addRelated(product, sku) {
              product.addSku(sku);
            },
            populateRelated(sku, data) {
              collaborators.skus?.populate(sku, data);
            },
          },
        ];

  const productImagesDescriptors: readonly OneToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    ProductOwnedAssociation
  >[] =
    collaborators.productImages === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'productImages',
            relatedPrimaryIdPropertyName: 'imageID',
            singularName: 'productImage',
            loader: collaborators.productImages.loader,
            addRelated(product, productImage) {
              product.addProductImage(productImage);
            },
            populateRelated(productImage, data) {
              collaborators.productImages?.populate(productImage, data);
            },
          },
        ];

  const attributeValuesDescriptors: readonly OneToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    ProductOwnedAssociation
  >[] =
    collaborators.attributeValues === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'attributeValues',
            relatedPrimaryIdPropertyName: 'attributeValueID',
            singularName: 'attributeValue',
            loader: collaborators.attributeValues.loader,
            addRelated(product, attributeValue) {
              product.addAttributeValue(attributeValue);
            },
            populateRelated(attributeValue, data) {
              collaborators.attributeValues?.populate(attributeValue, data);
            },
          },
        ];

  const productReviewsDescriptors: readonly OneToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    ProductOwnedAssociation
  >[] =
    collaborators.productReviews === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'productReviews',
            relatedPrimaryIdPropertyName: 'productReviewID',
            singularName: 'productReview',
            loader: collaborators.productReviews.loader,
            addRelated(product, productReview) {
              product.addProductReview(productReview);
            },
            populateRelated(productReview, data) {
              collaborators.productReviews?.populate(productReview, data);
            },
          },
        ];

  /*
   * The only many-to-many descriptor on this entity, and the only place in this file that mutates a
   * local collection — both consequences of owner-side ownership of the link table [`:L81`].
   */
  const relatedProductsDescriptors: readonly ManyToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    Product
  >[] =
    collaborators.relatedProducts === undefined
      ? []
      : [
          {
            kind: 'many-to-many',
            name: 'relatedProducts',
            relatedPrimaryIdPropertyName: 'productID',
            singularName: 'relatedProduct',
            loader: collaborators.relatedProducts.loader,
            addRelated(product, relatedProduct) {
              product.relatedProducts.push(relatedProduct);
            },
            removeRelated(product, relatedProduct) {
              const index = product.relatedProducts.indexOf(relatedProduct);
              if (index !== -1) {
                product.relatedProducts.splice(index, 1);
              }
            },
            readRelated(product) {
              return product.relatedProducts;
            },
            readRelatedPrimaryId(relatedProduct) {
              return relatedProduct.productID;
            },
            populateRelated(relatedProduct, data) {
              collaborators.relatedProducts?.populate(relatedProduct, data);
            },
          },
        ];

  return {
    /*
     * The legacy `getClassName` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
     * [model/entity/Product.cfc:L49] — the bare component name. It is the arm 3 operand of the
     * population gate [org/Hibachi/HibachiTransient.cfc:L190] and the key the out-of-scope permission
     * records are stored under [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141], so the legacy
     * spelling is carried rather than a TypeScript class name that bundling may rewrite.
     */
    entityName: PRODUCT_CLASS_NAME,

    /*
     * [model/entity/Product.cfc:L49] declares `persistent="true"`, so this is `true` — and the flag is
     * load-bearing rather than informational. `../base/populate` uses it as the first arm of the legacy
     * authorisation test [org/Hibachi/HibachiTransient.cfc:L186-L190]: a transient process object
     * short-circuits that test and populates freely, whereas a persistent entity such as Product has
     * per-property access control consulted. All three arms are live in that module, with arms 2 and 3
     * resolved through `PopulationAuthorizationPort` from `../../ports/AccountContextPort`.
     */
    persistent: true,

    /*
     * In legacy declaration order, with every gap accounted for.
     */
    properties: [
      ...PRODUCT_SIMPLE_PROPERTY_DESCRIPTORS,
      ...brandDescriptors,
      ...productTypeDescriptors,
      ...defaultSkuDescriptors,
      ...skusDescriptors,
      ...productImagesDescriptors,
      ...attributeValuesDescriptors,
      ...productReviewsDescriptors,
      ...relatedProductsDescriptors,
      PRODUCT_REMOTE_ID_DESCRIPTOR,
      ...PRODUCT_AUDIT_PROPERTY_DESCRIPTORS,
    ],
  };
}

/** Product's dependency-free population contract. */
export const PRODUCT_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<Product, ProductPropertyName> =
  createProductPropertyDescriptors();
