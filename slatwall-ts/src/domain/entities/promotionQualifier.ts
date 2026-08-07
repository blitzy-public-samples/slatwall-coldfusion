// slatwall-ts - PromotionQualifier entity.
// Schema contract [model/entity/PromotionQualifier.cfc:L49]: table `SwPromoQual`, ORM entity name `SlatwallPromotionQualifier`; no migration,
// no rename, no column change.
//
// Port of model/entity/PromotionQualifier.cfc (373 lines): the GATE half of the promotion engine.
//
// Read that attribute list as exhaustive: `persistent="true"` is QUOTED, as on Promotion,
// PromotionCode, PromotionPeriod, PromotionApplied and PromotionAccount.
//
// Schema continuity is a binding constraint: entity property metadata is the contract.

import { isNullish } from '../../lib/cfml/truthiness.js';
import type { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Option } from './option.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { PromotionPeriod } from './promotionPeriod.js';
import type { Sku } from './sku.js';

// DELIBERATELY ABSENT, each for a stated reason: `decimal.js`, because only
// src/lib/cfml/precision.ts and src/lib/cfml/numberFormat.ts may import it and `Money` is the sole
// arithmetic surface regardless.

/**
 * The authoritative vocabulary of `rewardMatchingType` [model/entity/PromotionQualifier.cfc:L65].
 *
 * These are not five plausible values - they are the exact five that
 * `getRewardMatchingTypeOptions()` [model/entity/PromotionQualifier.cfc:L107-L115] offers, in the
 * source's own order, and L65 declares `hb_formFieldType="select"`.
 */
export type RewardMatchingType = 'any' | 'sku' | 'product' | 'productType' | 'brand';

/**
 * One row of `getRewardMatchingTypeOptions()`. [model/entity/PromotionQualifier.cfc:L107-L115]
 *
 * A `type` alias rather than an `interface`, and that is load-bearing: an `interface` is not
 * assignable to `Readonly<Record<string, unknown>>` (TS2322) because it has no implicit index
 * signature.
 *
 * `name` carries the resource-bundle KEY, unresolved: JavaRB is not ported, so the key is
 * preserved verbatim as an inert string rather than replaced by English text.
 */
type RewardMatchingTypeOption = {
  readonly name: string;
  readonly value: RewardMatchingType;
};

/**
 * A single promotion qualifier - the GATE that decides whether a promotion period applies.
 *
 * Matters more than usual here: the promotion engine reads several of the thirteen collections for
 * every order item on every qualifier.
 *
 * Two members can throw, and each says so on itself: `isDeletable()` and
 * `removePromotionPeriod()`.
 */
export class PromotionQualifier {
  // Persistent Properties [model/entity/PromotionQualifier.cfc:L51-L96]
  private readonly promotionQualifierID: string;

  /**
   * [model/entity/PromotionQualifier.cfc:L53] `ormtype="string" hb_formatType="rbKey"`. No
   * `length`, no `notnull`, no `default`.
   *
   * The discriminator the engine branches on, and the property
   * `getSimpleRepresentationPropertyName()` names.
   *
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L53]: deliberately not narrowed to a union.
   */
  private readonly qualifierType: string | undefined;

  // The ten numeric gates [model/entity/PromotionQualifier.cfc:L55-L64]
  //
  // | loc | property | ormtype | hb_formatType | hb_nullRBKey | TS type | | L55 |
  // minimumOrderQuantity | integer | - | define.0 | number | | L56 | maximumOrderQuantity |
  // integer |.
  //
  // EXACTLY TEN, verified by reading L55-L64 individually; L54 is a blank line.
  private readonly minimumOrderQuantity: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L56] `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   * `undefined` means unlimited - never `0`.
   */
  private readonly maximumOrderQuantity: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L57]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.0"`, so this gate is `Money` and never a
   * `number`.
   */
  private readonly minimumOrderSubtotal: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L58]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.unlimited"`. `Money`, and `undefined`
   * means UNLIMITED - coalescing this one to zero would disqualify every order.
   */
  private readonly maximumOrderSubtotal: Money | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L59] `ormtype="integer" hb_nullRBKey="define.0"`.
   */
  private readonly minimumItemQuantity: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L60] `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   */
  private readonly maximumItemQuantity: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L61]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.0"`. `Money`, compared against an order
   * item's price.
   */
  private readonly minimumItemPrice: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L62]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.unlimited"`. `Money`, and `undefined`
   * means unlimited.
   */
  private readonly maximumItemPrice: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L63]: `ormtype="big_decimal"` with
   * `hb_formatType="weight"` and `hb_nullRBKey="define.0"` - modelled as `number`, not as `Money`,
   * and that is deliberate.
   *
   * This entity performs zero arithmetic on either weight gate.
   */
  private readonly minimumFulfillmentWeight: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L64]: `ormtype="big_decimal"` with
   * `hb_formatType="weight"` and `hb_nullRBKey="define.unlimited"`. `number`, for the reasons
   * given on `minimumFulfillmentWeight`, and `undefined` means unlimited.
   */
  private readonly maximumFulfillmentWeight: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L65]
   * `ormtype="string" hb_formatType="rbKey" hb_formFieldType="select"`.
   *
   * Narrowed to {@link RewardMatchingType} because L107-L115 declares the vocabulary on the entity
   * itself and `hb_formFieldType="select"` makes that option list the admin form's domain.
   */
  private readonly rewardMatchingType: RewardMatchingType | undefined;

  /**
   * The one many-to-one on this entity, and `PromotionPeriod` is in scope, so this is a real
   * materialized association rather than an opaque identifier.
   */
  private promotionPeriod: PromotionPeriod | undefined;

  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L70-L71]: the
  // `// Related Entities (one-to-many)` banner is present with nothing under it. A cosmetic
  // structural fact with a real consequence: this entity owns no one-to-many collections at all.

  // The thirteen many-to-many collections [model/entity/PromotionQualifier.cfc:L73-L87]
  //
  // EXACTLY THIRTEEN, in the source's own three groups, separated by blank lines at L76 and L82
  // and semantically meaningful.
  //
  // GROUP A - fulfillment/shipping (3), `cfc` FulfillmentMethod / ShippingMethod / AddressZone.

  // The out-of-scope group a far sides are collapsed to opaque identifiers.
  //
  // Pairs for fourteen relationships, and the three without any helper are exactly Group a -
  // `fulfillmentMethods` [model/entity/PromotionQualifier.cfc:L73].

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L73]: legacy member `fulfillmentMethods`,
   * `cfc="FulfillmentMethod"`, link table `SwPromoQualFulfillmentMethod`,
   * `inversejoincolumn="fulfillmentMethodID"`.
   */
  private readonly fulfillmentMethodIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L74]: as above. Legacy member
   * `shippingMethods`, `cfc="ShippingMethod"`, link table `SwPromoQualShippingMethod`,
   * `inversejoincolumn="shippingMethodID"`.
   */
  private readonly shippingMethodIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L75]: as above. Legacy member
   * `shippingAddressZones`, `cfc="AddressZone"`, link table `SwPromoQualShipAddressZone`,
   * `inversejoincolumn="addressZoneID"`.
   */
  private readonly shippingAddressZoneIDs: readonly string[];

  /**
   * [model/entity/PromotionQualifier.cfc:L77] include list.
   */
  private readonly brands: Brand[];

  /**
   * [model/entity/PromotionQualifier.cfc:L78] include list. Read by `hasAnyOption()` at
   * [model/service/PromotionService.cfc:L914].
   */
  private readonly options: Option[];

  /**
   * [model/entity/PromotionQualifier.cfc:L79] include list.
   */
  private readonly skus: Sku[];

  /**
   * [model/entity/PromotionQualifier.cfc:L80] include list.
   */
  private readonly products: Product[];

  /**
   * [model/entity/PromotionQualifier.cfc:L81] include list.
   */
  private readonly productTypes: ProductType[];

  /**
   * [model/entity/PromotionQualifier.cfc:L83] exclude list, `type="array"`.
   */
  private readonly excludedBrands: Brand[];

  /**
   * [model/entity/PromotionQualifier.cfc:L84] exclude list, `type="array"`. Read by
   * `hasAnyExcludedOption()` at [model/service/PromotionService.cfc:L885].
   */
  private readonly excludedOptions: Option[];

  /**
   * [model/entity/PromotionQualifier.cfc:L85] exclude list.
   */
  private readonly excludedSkus: Sku[];

  /**
   * [model/entity/PromotionQualifier.cfc:L86] exclude list.
   */
  private readonly excludedProducts: Product[];

  /**
   * [model/entity/PromotionQualifier.cfc:L87] exclude list.
   */
  private readonly excludedProductTypes: ProductType[];

  /**
   * [model/entity/PromotionQualifier.cfc:L90] `ormtype="string"`, under the `// Remote Properties`
   * banner at L89.
   */
  private readonly remoteID: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L93] `hb_populateEnabled="false" ormtype="timestamp"`.
   *
   * `hb_populateEnabled="false"` is an inert fact here: it tells the legacy framework not to
   * populate the column from request data.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L94]: the declaration is
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`,
   * and `Account` is out of scope.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L95] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L96]:
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`.
   * Collapsed to the inert foreign-key column for the same reason as `createdByAccountID`.
   */
  private readonly modifiedByAccountID: string | undefined;

  // LEGACY-DEFECT [model/entity/PromotionQualifier.cfc:L99, L107]: a double orphan - the
  // `qualifierApplicationTypeOptions` property declared at L99 has no options method to fill it,
  // and `getRewardMatchingTypeOptions()` at L107 has no property behind it.
  // Preserved deliberately; do not fix without a product decision.

  // Persistent Properties.

  /**
   * Constructs a qualifier from a repository row plus its materialized associations.
   *
   * A single parameter object, matching the sibling entities: every column is a named member.
   */
  constructor(init: {
    readonly promotionQualifierID: string;
    readonly qualifierType?: string | undefined;
    readonly minimumOrderQuantity?: number | undefined;
    readonly maximumOrderQuantity?: number | undefined;
    readonly minimumOrderSubtotal?: Money | undefined;
    readonly maximumOrderSubtotal?: Money | undefined;
    readonly minimumItemQuantity?: number | undefined;
    readonly maximumItemQuantity?: number | undefined;
    readonly minimumItemPrice?: Money | undefined;
    readonly maximumItemPrice?: Money | undefined;
    readonly minimumFulfillmentWeight?: number | undefined;
    readonly maximumFulfillmentWeight?: number | undefined;
    readonly rewardMatchingType?: RewardMatchingType | undefined;
    readonly promotionPeriod?: PromotionPeriod | undefined;
    readonly fulfillmentMethodIDs?: readonly string[] | undefined;
    readonly shippingMethodIDs?: readonly string[] | undefined;
    readonly shippingAddressZoneIDs?: readonly string[] | undefined;
    readonly brands?: Brand[] | undefined;
    readonly options?: Option[] | undefined;
    readonly skus?: Sku[] | undefined;
    readonly products?: Product[] | undefined;
    readonly productTypes?: ProductType[] | undefined;
    readonly excludedBrands?: Brand[] | undefined;
    readonly excludedOptions?: Option[] | undefined;
    readonly excludedSkus?: Sku[] | undefined;
    readonly excludedProducts?: Product[] | undefined;
    readonly excludedProductTypes?: ProductType[] | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
  }) {
    this.promotionQualifierID = init.promotionQualifierID;
    this.qualifierType = init.qualifierType;

    // The ten gates are assigned through, never defaulted.
    this.minimumOrderQuantity = init.minimumOrderQuantity;
    this.maximumOrderQuantity = init.maximumOrderQuantity;
    this.minimumOrderSubtotal = init.minimumOrderSubtotal;
    this.maximumOrderSubtotal = init.maximumOrderSubtotal;
    this.minimumItemQuantity = init.minimumItemQuantity;
    this.maximumItemQuantity = init.maximumItemQuantity;
    this.minimumItemPrice = init.minimumItemPrice;
    this.maximumItemPrice = init.maximumItemPrice;
    this.minimumFulfillmentWeight = init.minimumFulfillmentWeight;
    this.maximumFulfillmentWeight = init.maximumFulfillmentWeight;

    this.rewardMatchingType = init.rewardMatchingType;
    this.promotionPeriod = init.promotionPeriod;

    this.fulfillmentMethodIDs = init.fulfillmentMethodIDs ?? [];
    this.shippingMethodIDs = init.shippingMethodIDs ?? [];
    this.shippingAddressZoneIDs = init.shippingAddressZoneIDs ?? [];

    // The ten in-scope collections are ADOPTED by REFERENCE rather than copied, which keeps the
    // accessors below live for the bidirectional helpers.
    this.brands = init.brands ?? [];
    this.options = init.options ?? [];
    this.skus = init.skus ?? [];
    this.products = init.products ?? [];
    this.productTypes = init.productTypes ?? [];
    this.excludedBrands = init.excludedBrands ?? [];
    this.excludedOptions = init.excludedOptions ?? [];
    this.excludedSkus = init.excludedSkus ?? [];
    this.excludedProducts = init.excludedProducts ?? [];
    this.excludedProductTypes = init.excludedProductTypes ?? [];

    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // Column Accessors The ORM-generated `get<Property>()` surface, authored explicitly.
  getPromotionQualifierID(): string {
    return this.promotionQualifierID;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L53] `undefined` when the column is NULL.
   */
  getQualifierType(): string | undefined {
    return this.qualifierType;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L55] `undefined` means no minimum, never `0`.
   */
  getMinimumOrderQuantity(): number | undefined {
    return this.minimumOrderQuantity;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L56] `undefined` means unlimited, never `0`.
   */
  getMaximumOrderQuantity(): number | undefined {
    return this.maximumOrderQuantity;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L57] `undefined` means no minimum.
   */
  getMinimumOrderSubtotal(): Money | undefined {
    return this.minimumOrderSubtotal;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L58] `undefined` means unlimited.
   */
  getMaximumOrderSubtotal(): Money | undefined {
    return this.maximumOrderSubtotal;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L59] `undefined` means no minimum.
   */
  getMinimumItemQuantity(): number | undefined {
    return this.minimumItemQuantity;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L60] `undefined` means unlimited.
   */
  getMaximumItemQuantity(): number | undefined {
    return this.maximumItemQuantity;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L61] `undefined` means no minimum.
   */
  getMinimumItemPrice(): Money | undefined {
    return this.minimumItemPrice;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L62] `undefined` means unlimited.
   */
  getMaximumItemPrice(): Money | undefined {
    return this.maximumItemPrice;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L63] `hb_formatType="weight"`, so a `number` and not
   * `Money`. `undefined` means no minimum.
   */
  getMinimumFulfillmentWeight(): number | undefined {
    return this.minimumFulfillmentWeight;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L64] `hb_formatType="weight"`, so a `number` and not
   * `Money`. `undefined` means unlimited.
   */
  getMaximumFulfillmentWeight(): number | undefined {
    return this.maximumFulfillmentWeight;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L65] one of the five {@link RewardMatchingType}.
   */
  getRewardMatchingType(): RewardMatchingType | undefined {
    return this.rewardMatchingType;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L68] the one many-to-one.
   *
   * `undefined` when the nullable `promotionPeriodID` foreign key is unset or when
   * `removePromotionPeriod()` has cleared it.
   */
  getPromotionPeriod(): PromotionPeriod | undefined {
    return this.promotionPeriod;
  }
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L94] the inert `createdByAccountID` column; `Account` is
   * out of scope, so no entity is returned.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L96] the inert `modifiedByAccountID` column; `Account` is
   * out of scope, so no entity is returned.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // Column Accessors.

  // Association Accessors.

  /**
   * [model/entity/PromotionQualifier.cfc:L73] the opaque identifiers behind
   * `SwPromoQualFulfillmentMethod`.
   */
  getFulfillmentMethodIDs(): readonly string[] {
    return this.fulfillmentMethodIDs;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L74] the opaque identifiers behind
   * `SwPromoQualShippingMethod`; empty by default.
   */
  getShippingMethodIDs(): readonly string[] {
    return this.shippingMethodIDs;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L75] the opaque identifiers behind
   * `SwPromoQualShipAddressZone`; empty by default.
   */
  getShippingAddressZoneIDs(): readonly string[] {
    return this.shippingAddressZoneIDs;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L77] the LIVE include list.
   */
  getBrands(): Brand[] {
    return this.brands;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L78] the LIVE include list.
   */
  getOptions(): Option[] {
    return this.options;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L79] the LIVE include list.
   */
  getSkus(): Sku[] {
    return this.skus;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L80] the LIVE include list.
   */
  getProducts(): Product[] {
    return this.products;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L81] the LIVE include list.
   */
  getProductTypes(): ProductType[] {
    return this.productTypes;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L83] the LIVE exclude list.
   */
  getExcludedBrands(): Brand[] {
    return this.excludedBrands;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L84] the LIVE exclude list.
   */
  getExcludedOptions(): Option[] {
    return this.excludedOptions;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L85] the LIVE exclude list.
   */
  getExcludedSkus(): Sku[] {
    return this.excludedSkus;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L86] the LIVE exclude list.
   */
  getExcludedProducts(): Product[] {
    return this.excludedProducts;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L87] the LIVE exclude list.
   */
  getExcludedProductTypes(): ProductType[] {
    return this.excludedProductTypes;
  }

  // Framework-Implicit Members.
  //
  // [org/Hibachi/HibachiEntity.cfc:L507-L565] dynamically dispatches eleven method-name patterns -
  // `hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`, `get*ID`, `get*Options`,
  // `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`, plus a `getAttributeValue`
  // fallback.

  /**
   * `isNew` - whether this qualifier has never been persisted.
   */
  isNew(): boolean {
    return this.promotionQualifierID === '';
  }

  /**
   * `hasBrand` - is this brand already in the INCLUDE list?
   */
  hasBrand(brand: Brand): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.brands, brand, (held: Brand) => held.getBrandID()) !==
      -1
    );
  }

  /**
   * `hasExcludedBrand` - is this brand already in the EXCLUDE list?
   */
  hasExcludedBrand(brand: Brand): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.excludedBrands, brand, (held: Brand) =>
        held.getBrandID(),
      ) !== -1
    );
  }

  /**
   * `hasOption` - is this option already in the INCLUDE list?
   */
  hasOption(option: Option): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.options, option, (held: Option) =>
        held.getOptionID(),
      ) !== -1
    );
  }

  /**
   * `hasExcludedOption` - is this option already in the EXCLUDE list?
   */
  hasExcludedOption(option: Option): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.excludedOptions, option, (held: Option) =>
        held.getOptionID(),
      ) !== -1
    );
  }

  /**
   * `hasSku` - is this sku already in the include list?
   */
  hasSku(sku: Sku): boolean {
    return PromotionQualifier.indexOfEntity(this.skus, sku, (held: Sku) => held.getSkuID()) !== -1;
  }

  /**
   * `hasExcludedSku` - is this sku already in the exclude list?
   */
  hasExcludedSku(sku: Sku): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.excludedSkus, sku, (held: Sku) => held.getSkuID()) !==
      -1
    );
  }

  /**
   * `hasProduct` - is this product already in the INCLUDE list?
   */
  hasProduct(product: Product): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.products, product, (held: Product) =>
        held.getProductID(),
      ) !== -1
    );
  }

  /**
   * `hasExcludedProduct` - is this product already in the EXCLUDE list?
   */
  hasExcludedProduct(product: Product): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.excludedProducts, product, (held: Product) =>
        held.getProductID(),
      ) !== -1
    );
  }

  /**
   * `hasProductType` - is this product type already in the INCLUDE list?
   */
  hasProductType(productType: ProductType): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.productTypes, productType, (held: ProductType) =>
        held.getProductTypeID(),
      ) !== -1
    );
  }

  /**
   * `hasExcludedProductType` - is this product type already in the EXCLUDE list?
   */
  hasExcludedProductType(productType: ProductType): boolean {
    return (
      PromotionQualifier.indexOfEntity(
        this.excludedProductTypes,
        productType,
        (held: ProductType) => held.getProductTypeID(),
      ) !== -1
    );
  }

  /**
   * `hasAnyOption` - does any supplied option appear in the INCLUDE list?
   *
   * Semantics, reproduced exactly: primary-key comparison, delegated to `hasOption()` so the
   * transient-identity nuance is decided in one place; `false` for an empty input array.
   *
   * Polarity determines what `false` means - see empty-collection convention #3 above.
   */
  hasAnyOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasOption(option));
  }

  /**
   * `hasAnyExcludedOption` - does any supplied option appear in the EXCLUDE list?
   */
  hasAnyExcludedOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasExcludedOption(option));
  }

  /**
   * Locates an entity inside one of this qualifier's collections, or `-1` when it is absent.
   *
   * Eleven `remove*` bodies in the source use CFML `arrayFind(...)` guarded by `if(index > 0)` /
   * `if(thisIndex > 0)` / `if(thatIndex > 0)`.
   *
   * Comparison follows the rule at the top of this section: primary key for a persisted candidate,
   * reference identity for a transient one whose key is still the `unsavedvalue=""` empty string.
   */
  private static indexOfEntity<TEntity>(
    collection: readonly TEntity[],
    candidate: TEntity,
    primaryKeyOf: (entity: TEntity) => string,
  ): number {
    const candidateID: string = primaryKeyOf(candidate);

    if (candidateID === '') {
      return collection.indexOf(candidate);
    }

    return collection.findIndex((held: TEntity) => primaryKeyOf(held) === candidateID);
  }

  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L101-L103]: `getSimpleRepresentation()` sits
  // before the `Non-Persistent Property Methods` banner at L105 - outside every banner section, in
  // the gap between the property block and the first banner.

  /**
   * `getSimpleRepresentation` - the qualifier's human label for the admin UI.
   *
   * `qualifierType` is nullable - [model/entity/PromotionQualifier.cfc:L53] declares no
   * `notnull` - but the null path is handled inside
   * the framework: [org/Hibachi/HibachiTransient.cfc:L508] returns `''`.
   *
   * Note the casing disagreement between the two keys, which is in the source:
   * [model/entity/PromotionQualifier.cfc:L102] hand-writes
   * `entity.promotionQualifier` with a lowercase initial letter.
   */
  getSimpleRepresentation(): string {
    const qualifierType: string | undefined = this.qualifierType;

    // The rbKey branch of `getFormattedValue` [org/Hibachi/HibachiTransient.cfc:L504-L510]: a
    // composed key when the value is present, the empty string when it is not.
    const formattedQualifierType: string =
      isNullish(qualifierType) || qualifierType === undefined
        ? ''
        : `entity.PromotionQualifier.qualifierType.${qualifierType}`;

    return `entity.promotionQualifier - ${formattedQualifierType}`;
  }

  // Non-Persistent Property Methods [model/entity/PromotionQualifier.cfc:L105-L117]
  // populated, holding exactly one member: `getRewardMatchingTypeOptions()`
  // [model/entity/PromotionQualifier.cfc:L107-L115].

  // LEGACY-DEFECT [model/entity/PromotionQualifier.cfc:L99, L107]: the DOUBLE ORPHAN - a dead
  // declared property and an undeclared method, pointing in opposite directions.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getRewardMatchingTypeOptions` - the five reward-matching modes the admin offers.
   * [model/entity/PromotionQualifier.cfc:L107-L115]
   *
   * This body is the authoritative vocabulary for `rewardMatchingType`
   * [model/entity/PromotionQualifier.cfc:L65] and is why that column is the one narrowed column on
   * this entity - see {@link RewardMatchingType} for the five values.
   */
  getRewardMatchingTypeOptions(): readonly [
    RewardMatchingTypeOption,
    RewardMatchingTypeOption,
    RewardMatchingTypeOption,
    RewardMatchingTypeOption,
    RewardMatchingTypeOption,
  ] {
    return [
      { name: 'entity.promotionQualifier.rewardMatchingType.any', value: 'any' },
      { name: 'entity.promotionQualifier.rewardMatchingType.sku', value: 'sku' },
      { name: 'entity.promotionQualifier.rewardMatchingType.product', value: 'product' },
      { name: 'entity.promotionQualifier.rewardMatchingType.productType', value: 'productType' },
      { name: 'entity.promotionQualifier.rewardMatchingType.brand', value: 'brand' },
    ];
  }

  // Non-Persistent Property Methods.

  // Eleven helper pairs for fourteen relationships - one many-to-one
  // [model/entity/PromotionQualifier.cfc:L68] plus thirteen many-to-many
  // [model/entity/PromotionQualifier.cfc:L73-L87], with hand-written helpers for only eleven.

  // Promotion Period (many-to-one) [model/entity/PromotionQualifier.cfc:L121]

  /**
   * `setPromotionPeriod` - point this qualifier at a period and synchronise the far side.
   * [model/entity/PromotionQualifier.cfc:L122-L127]
   *
   * The near-side assignment happens first [model/entity/PromotionQualifier.cfc:L123], before the
   * guard is evaluated, and it is unconditional - the field is overwritten even when the far side
   * already holds this qualifier.
   */
  setPromotionPeriod(promotionPeriod: PromotionPeriod): void {
    // [model/entity/PromotionQualifier.cfc:L123] Unconditional near-side assignment, ahead of the
    // guard.
    this.promotionPeriod = promotionPeriod;

    // [model/entity/PromotionQualifier.cfc:L124] `isNew() or !hasPromotionQualifier(this)`,
    // short-circuiting on the left operand exactly as CFML `or` does - so a transient qualifier
    // never runs the containment probe.
    if (this.isNew() || !promotionPeriod.hasPromotionQualifier(this)) {
      // [model/entity/PromotionQualifier.cfc:L125] In-place mutation of the far side's LIVE array.
      promotionPeriod.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removePromotionPeriod` - detach this qualifier from a promotion period, both sides.
   * [model/entity/PromotionQualifier.cfc:L128-L137]
   *
   * The parameter is optional - `any promotionPeriod` with no `required`
   * [model/entity/PromotionQualifier.cfc:L128] - and it is the only optional parameter in the
   * component.
   *
   * The clear happens after the throw point and is unconditional.
   *
   * @throws Error when no argument is supplied and `promotionPeriod` is already absent.
   */
  removePromotionPeriod(promotionPeriod?: PromotionPeriod): void {
    // [model/entity/PromotionQualifier.cfc:L129-L131] Default the target from the current field
    // when the caller omitted it.
    const target: PromotionPeriod | undefined = promotionPeriod ?? this.promotionPeriod;

    if (isNullish(target) || target === undefined) {
      throw new Error(
        'PromotionQualifier.removePromotionPeriod has no promotion period to detach from: ' +
          'model/entity/PromotionQualifier.cfc:L129-L132 defaults the omitted argument from ' +
          'variables.promotionPeriod and then calls getPromotionQualifiers() on it with no null ' +
          'guard, so an already-empty association is a CFML null-reference error. The foreign key ' +
          'is nullable - model/entity/PromotionQualifier.cfc:L68 declares no notnull - which is ' +
          'what makes this reachable. Note that the legacy clear at L136 sits AFTER this raise, ' +
          'so the association is left intact, exactly as here.',
      );
    }

    // [model/entity/PromotionQualifier.cfc:L132-L135] Locate and delete on the FAR side, against
    // its live array.
    const index: number = PromotionQualifier.indexOfEntity(
      target.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (index !== -1) {
      target.getPromotionQualifiers().splice(index, 1);
    }

    // [model/entity/PromotionQualifier.cfc:L136] `structDelete(variables, "promotionPeriod")` -
    // unconditional, and downstream of the raise above.
    this.promotionPeriod = undefined;
  }

  // The ten many-to-many owner pairs [model/entity/PromotionQualifier.cfc:L139-L337]
  //
  // All ten `add*` bodies share one identical two-guard shape and all ten `remove*` bodies one
  // identical two-deletion shape, so both are stated once here and referenced from each member.
  //
  // The `add*` shape - two independent guards, and they are not symmetric.
  addBrand(brand: Brand): void {
    // [model/entity/PromotionQualifier.cfc:L141-L143] Near side: the ARGUMENT's newness
    // short-circuits the containment probe.
    if (brand.isNew() || !this.hasBrand(brand)) {
      this.brands.push(brand);
    }

    // [model/entity/PromotionQualifier.cfc:L144-L146] Far side: this qualifier's newness
    // short-circuits the far-side probe.
    if (this.isNew() || !brand.hasPromotionQualifier(this)) {
      brand.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeBrand` - remove a brand from the INCLUDE list, both sides.
   */
  removeBrand(brand: Brand): void {
    // [model/entity/PromotionQualifier.cfc:L149-L152] Near side.
    const thisIndex: number = PromotionQualifier.indexOfEntity(this.brands, brand, (held: Brand) =>
      held.getBrandID(),
    );

    if (thisIndex !== -1) {
      this.brands.splice(thisIndex, 1);
    }

    // [model/entity/PromotionQualifier.cfc:L153-L156] Far side.
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      brand.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      brand.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Options (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L159]

  /**
   * `addOption` - add an option to the INCLUDE list and synchronise the far side.
   */
  addOption(option: Option): void {
    if (option.isNew() || !this.hasOption(option)) {
      this.options.push(option);
    }
    if (this.isNew() || !option.hasPromotionQualifier(this)) {
      option.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeOption` - remove an option from the INCLUDE list, both sides.
   */
  removeOption(option: Option): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.options,
      option,
      (held: Option) => held.getOptionID(),
    );

    if (thisIndex !== -1) {
      this.options.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      option.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      option.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Skus (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L179]
  //
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L179-L197]: nearly every line of this block
  // carries trailing whitespace in the source, including the sub-banner comment itself.

  /**
   * `addSku` - add a SKU to the INCLUDE list and synchronise the far side.
   */
  addSku(sku: Sku): void {
    if (sku.isNew() || !this.hasSku(sku)) {
      this.skus.push(sku);
    }
    if (this.isNew() || !sku.hasPromotionQualifier(this)) {
      sku.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeSku` - remove a SKU from the INCLUDE list, both sides.
   */
  removeSku(sku: Sku): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(this.skus, sku, (held: Sku) =>
      held.getSkuID(),
    );

    if (thisIndex !== -1) {
      this.skus.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      sku.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      sku.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Products (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L199]

  /**
   * `addProduct` - add a product to the INCLUDE list and synchronise the far side.
   */
  addProduct(product: Product): void {
    if (product.isNew() || !this.hasProduct(product)) {
      this.products.push(product);
    }
    if (this.isNew() || !product.hasPromotionQualifier(this)) {
      product.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeProduct` - remove a product from the INCLUDE list, both sides.
   */
  removeProduct(product: Product): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.products,
      product,
      (held: Product) => held.getProductID(),
    );

    if (thisIndex !== -1) {
      this.products.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      product.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      product.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Product Types (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L219]

  /**
   * `addProductType` - add a product type to the INCLUDE list and synchronise the far side.
   */
  addProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasProductType(productType)) {
      this.productTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPromotionQualifier(this)) {
      productType.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeProductType` - remove a product type from the INCLUDE list, both sides.
   */
  removeProductType(productType: ProductType): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.productTypes,
      productType,
      (held: ProductType) => held.getProductTypeID(),
    );

    if (thisIndex !== -1) {
      this.productTypes.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      productType.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      productType.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Excluded Brands (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L239]

  /**
   * `addExcludedBrand` - add a brand to the EXCLUDE list and synchronise the far side.
   */
  addExcludedBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasExcludedBrand(brand)) {
      this.excludedBrands.push(brand);
    }
    if (this.isNew() || !brand.hasPromotionQualifierExclusion(this)) {
      brand.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedBrand` - remove a brand from the EXCLUDE list, both sides.
   */
  removeExcludedBrand(brand: Brand): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedBrands,
      brand,
      (held: Brand) => held.getBrandID(),
    );

    if (thisIndex !== -1) {
      this.excludedBrands.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      brand.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      brand.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Excluded Options (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L259]

  /**
   * `addExcludedOption` - add an option to the EXCLUDE list and synchronise the far side.
   */
  addExcludedOption(option: Option): void {
    if (option.isNew() || !this.hasExcludedOption(option)) {
      this.excludedOptions.push(option);
    }
    if (this.isNew() || !option.hasPromotionQualifierExclusion(this)) {
      option.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedOption` - remove an option from the EXCLUDE list, both sides.
   */
  removeExcludedOption(option: Option): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedOptions,
      option,
      (held: Option) => held.getOptionID(),
    );

    if (thisIndex !== -1) {
      this.excludedOptions.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      option.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      option.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Excluded Skus (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L279]

  /**
   * `addExcludedSku` - add a SKU to the EXCLUDE list and synchronise the far side.
   */
  addExcludedSku(sku: Sku): void {
    if (sku.isNew() || !this.hasExcludedSku(sku)) {
      this.excludedSkus.push(sku);
    }
    if (this.isNew() || !sku.hasPromotionQualifierExclusion(this)) {
      sku.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedSku` - remove a SKU from the EXCLUDE list, both sides.
   */
  removeExcludedSku(sku: Sku): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedSkus,
      sku,
      (held: Sku) => held.getSkuID(),
    );

    if (thisIndex !== -1) {
      this.excludedSkus.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      sku.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      sku.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Excluded Products (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L299]

  /**
   * `addExcludedProduct` - add a product to the EXCLUDE list and synchronise the far side.
   */
  addExcludedProduct(product: Product): void {
    if (product.isNew() || !this.hasExcludedProduct(product)) {
      this.excludedProducts.push(product);
    }
    if (this.isNew() || !product.hasPromotionQualifierExclusion(this)) {
      product.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedProduct` - remove a product from the EXCLUDE list, both sides.
   */
  removeExcludedProduct(product: Product): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedProducts,
      product,
      (held: Product) => held.getProductID(),
    );

    if (thisIndex !== -1) {
      this.excludedProducts.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      product.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      product.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Excluded Product Types (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L319]

  /**
   * `addExcludedProductType` - add a product type to the EXCLUDE list and synchronise the far
   * side.
   */
  addExcludedProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasExcludedProductType(productType)) {
      this.excludedProductTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPromotionQualifierExclusion(this)) {
      productType.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedProductType` - remove a product type from the EXCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L328-L337] - the LAST member of the section, and the last
   * row of the inversion verdict table below.
   */
  removeExcludedProductType(productType: ProductType): void {
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedProductTypes,
      productType,
      (held: ProductType) => held.getProductTypeID(),
    );

    if (thisIndex !== -1) {
      this.excludedProductTypes.splice(thisIndex, 1);
    }
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      productType.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      productType.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Bidirectional Helper Methods [model/entity/PromotionQualifier.cfc:L339].

  // Custom Validation Methods [model/entity/PromotionQualifier.cfc:L341-L343] EMPTY, and
  // consequentially so: with no model/validation/PromotionQualifier.json either.

  // Custom Formatting Methods [model/entity/PromotionQualifier.cfc:L345-L347] empty.

  // Overridden Implicet Getters
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L349, L351]: EMPTY, and the banner misspells
  // "Implicit" - identically to PromotionCode.cfc.

  // Overridden Methods [model/entity/PromotionQualifier.cfc:L353-L363] POPULATED with
  // exactly two members: `getSimpleRepresentationPropertyName()`
  // [model/entity/PromotionQualifier.cfc:L355-L357] and `isDeletable()`
  // [model/entity/PromotionQualifier.cfc:L359-L361].
  getSimpleRepresentationPropertyName(): string {
    return 'qualifierType';
  }

  /**
   * `isDeletable` - may this qualifier be deleted?
   *
   * Operand order and short-circuiting are preserved, so when the period is expired the right-hand
   * operand is never evaluated and `Promotion.isDeletable()` is never reached - observable.
   *
   * @throws Error when `promotionPeriod` is absent, or when the reached period has no promotion.
   */
  isDeletable(): boolean {
    // [model/entity/PromotionQualifier.cfc:L360] The FIRST `getPromotionPeriod()` dereference,
    // evaluated ahead of everything else - which is why an absent period raises rather than
    // short-circuiting to `false`.
    const promotionPeriod: PromotionPeriod | undefined = this.promotionPeriod;

    if (isNullish(promotionPeriod) || promotionPeriod === undefined) {
      throw new Error(
        'PromotionQualifier.isDeletable cannot reach its promotion period: ' +
          'model/entity/PromotionQualifier.cfc:L360 calls getPromotionPeriod().isExpired() with ' +
          'no null guard, so an unmaterialized or cleared promotion period is a CFML ' +
          'null-reference error. The foreign key is nullable - ' +
          'model/entity/PromotionQualifier.cfc:L68 declares no notnull - and ' +
          'removePromotionPeriod() clears it outright, which is what makes this reachable.',
      );
    }

    // [model/entity/PromotionQualifier.cfc:L360] `!getPromotionPeriod().isExpired() &&...` - the
    // short-circuit arm. On this path the right-hand operand is never evaluated, so the promotion
    // is not reached and cannot raise.
    if (promotionPeriod.isExpired()) {
      return false;
    }
    const promotion = promotionPeriod.getPromotion();

    if (isNullish(promotion) || promotion === undefined) {
      throw new Error(
        'PromotionQualifier.isDeletable reached its promotion period but the period has no ' +
          'promotion: model/entity/PromotionQualifier.cfc:L360 calls ' +
          'getPromotionPeriod().getPromotion().isDeletable() with no null guard, and ' +
          'model/entity/PromotionPeriod.cfc:L59 is a nullable many-to-one that a repository may ' +
          'not have materialized. CFML raises a null-reference error here rather than answering ' +
          'false, and that answer is preserved.',
      );
    }

    return promotion.isDeletable();
  }

  // Overridden Methods.

  // ORM Event Hooks [model/entity/PromotionQualifier.cfc:L365-L367] empty.

  // Deprecated methods [model/entity/PromotionQualifier.cfc:L369-L371]: empty, as in
  // `model/entity/PromotionCode.cfc`.
}

// anti-contracts - members that deliberately do not exist on this class.
//
// No `getQualifierApplicationTypeOptions()` and no `rewardMatchingTypeOptions` property - the two
// halves of the double-orphan LEGACY-DEFECT above. Neither half is normalised.

// What the repository layer owns - the boundary, stated so it is not re-implemented here.
//
// Context only, implemented nowhere here: model/dao/PromotionDAO.cfc:L51
// `getActivePromotionRewards` has no `ORDER BY`.

// Test obligation: tests/unit/domain/entities/promotionQualifier.test.ts, net-new coverage.
//
// meta/tests/unit/entity/ contains no PromotionQualifierTest.cfc, so the suite must be labelled
// net-new and never presented as parity.
