// slatwall-ts - PromotionReward entity.
//
// PORT of model/entity/PromotionReward.cfc (426 lines, confirmed by reading the source in three
// windows: l1-l140, l140-l300, l300-l426).
//
// Schema continuity is a binding constraint: the entity property metadata is the contract.
//
// LEGACY-NOTE [model/entity/PromotionReward.cfc:L57]: the source attribute reads
// `hb_permission="promotionPeriod.promtionRewards"` - "promtion" is MISSPELLED, missing the second
// `o` of "promotion".

import { cfNumberToString, numberFormat } from '../../lib/cfml/numberFormat.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
import type { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Option } from './option.js';
import type { PriceGroup } from './priceGroup.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { PromotionPeriod } from './promotionPeriod.js';
import type { RoundingRule } from './roundingRule.js';
import type { Sku } from './sku.js';

// DELIBERATELY not IMPORTED, and each for a verified reason: - `decimal.js` -
// `../valueObjects/money.js` is the only domain module permitted to import it; all arithmetic and
// presentation of money goes through `Money`. - `../valueObjects/currencyCode.js`.

/**
 * The amount-type vocabulary, mined from `getAmountTypeOptions()`
 * [model/entity/PromotionReward.cfc:L120-L133].
 *
 * Narrowed to a union deliberately, and this is a considered decision rather than a default.
 *
 * Note the name/value mismatch on the third member: its display key is `define.fixedAmount` but
 * its stored value is `amount`.
 */
export type AmountType = 'percentageOff' | 'amountOff' | 'amount';

/**
 * The applicable-term vocabulary, mined from `getApplicableTermOptions()`
 * [model/entity/PromotionReward.cfc:L112-L118] - exactly three values, in source order.
 *
 * Narrowed for the same reason as `AmountType`: the source declares a real method-backed
 * enumeration.
 */
export type ApplicableTerm = 'both' | 'initial' | 'renewal';

/**
 * One entry of `getAmountTypeOptions()`.
 *
 * `name` holds the UNRESOLVED resource-bundle key verbatim, because JavaRB is not ported.
 */
interface AmountTypeOption {
  readonly name: string;
  readonly value: AmountType;
}
interface ApplicableTermOption {
  readonly name: string;
  readonly value: ApplicableTerm;
}

/**
 * Resolved resource-bundle text for `getSimpleRepresentation()`
 * [model/entity/PromotionReward.cfc:L106-L108].
 *
 * JavaRB is not ported and no i18n runtime is introduced, so resolved labels are supplied at
 * hydration rather than looked up.
 *
 * Module-local and not exported, for the same reason as the option interfaces above.
 */
interface PromotionRewardLabelProvider {
  getPromotionRewardEntityLabel(): string;
  getRewardTypeLabel(rewardType: string): string;
}

/**
 * `SlatwallPromotionReward`, table `SwPromoReward` [model/entity/PromotionReward.cfc:L57].
 */
export class PromotionReward {
  /**
   * `table` is the ABBREVIATED physical name and is never expanded.
   */
  static readonly entityMetadata: Readonly<Record<string, string>> = Object.freeze({
    displayname: 'Promotion Reward',
    entityname: 'SlatwallPromotionReward',
    table: 'SwPromoReward',
    persistent: 'true',
    extends: 'HibachiEntity',
    cacheuse: 'transactional',
    hb_serviceName: 'promotionService',
    hb_permission: 'promotionPeriod.promotionRewards',
  });

  // [model/entity/PromotionReward.cfc:L59] banner; declarations at L60-L67.

  /**
   * [model/entity/PromotionReward.cfc:L60]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`.
   */
  private readonly promotionRewardID: string;

  /**
   * [model/entity/PromotionReward.cfc:L61] `ormType="big_decimal" hb_formatType="custom"`.
   *
   * Typed `Money | undefined` - never `number`, never `string`, never a raw decimal, and never
   * defaulted to zero.
   *
   * `hb_formatType="custom"` is the directive `getAmountFormatted()`
   * [model/entity/PromotionReward.cfc:L401-L407] implements by hand; it is preserved here as inert
   * metadata.
   */
  private readonly amount: Money | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L62] `ormType="string" hb_formatType="rbKey"`.
   */
  private readonly amountType: AmountType | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L63] `ormType="string" hb_formatType="rbKey"`.
   *
   * LEGACY-NOTE [model/entity/PromotionReward.cfc:L48-L56]: the `rewardType` vocabulary is
   * documented only in a source comment block immediately above the component declaration.
   *
   * This property is therefore deliberately left as an un-narrowed `string`.
   */
  private readonly rewardType: string | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L64] `ormType="string" hb_formatType="rbKey"`. Narrowed to
   * `ApplicableTerm` - see `getApplicableTermOptions()`
   * [model/entity/PromotionReward.cfc:L112-L118].
   */
  private readonly applicableTerm: ApplicableTerm | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L65] `ormType="integer" hb_nullRBKey="define.unlimited"`.
   *
   * LEGACY-NOTE [model/entity/PromotionReward.cfc:L65-L67]: all three max-use limits carry
   * `hb_nullRBKey="define.unlimited"` and none has a `default` attribute. Null means unlimited -
   * the metadata states the permissive extreme in the schema itself.
   */
  private readonly maximumUsePerOrder: number | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L66] `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   * `undefined` means unlimited - see `maximumUsePerOrder` above.
   */
  private readonly maximumUsePerItem: number | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L67] `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   * `undefined` means unlimited - see `maximumUsePerOrder` above.
   */
  private readonly maximumUsePerQualification: number | undefined;

  // [model/entity/PromotionReward.cfc:L69] banner; declarations at L70-L71.

  /**
   * [model/entity/PromotionReward.cfc:L70]
   * `cfc="PromotionPeriod" fieldtype="many-to-one" fkcolumn="promotionPeriodID"`.
   *
   * it carries neither `fetch="join"` nor any `lazy=` attribute.
   *
   * MUTABLE: `setPromotionPeriod` assigns it [model/entity/PromotionReward.cfc:L141] and
   * `removePromotionPeriod` clears it [model/entity/PromotionReward.cfc:L154].
   */
  private promotionPeriod: PromotionPeriod | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L71]
   * `cfc="RoundingRule" fieldtype="many-to-one" fkcolumn="roundingRuleID" hb_optionsNullRBKey="define.none"`.
   *
   * LEGACY-NOTE [model/entity/PromotionReward.cfc:L71]: `hb_optionsNullRBKey="define.none"` means
   * an absent rounding rule is a legitimate selection, not an error state.
   */
  private readonly roundingRule: RoundingRule | undefined;

  // [model/entity/PromotionReward.cfc:L73] banner; declarations at L74-L90.
  //
  // LEGACY-NOTE [model/entity/PromotionReward.cfc:L74-L90]: the `type="array"` metadata
  // inconsistency.

  /**
   * Note the abbreviated link-table name - `...EligiblePriceGrp`, not `...EligiblePriceGroup`.
   */
  private readonly eligiblePriceGroups: PriceGroup[];

  /**
   * Group b, collapsed.
   *
   * LEGACY-NOTE: `FulfillmentMethod` is not one of the eighteen in-scope entities - it belongs to
   * the explicitly out-of-scope order/checkout/fulfillment pipeline.
   *
   * DELETE-CONTEXT TENSION: because this surfaces as an array of IDs rather than an entity graph.
   */
  private readonly fulfillmentMethodIDs: readonly string[];

  /**
   * Group b, collapsed.
   *
   * LEGACY-NOTE: `AddressZone` is out of scope, so this collapses to an inert readonly opaque-ID
   * array on the same terms as `fulfillmentMethodIDs` above, including the delete-context tension.
   * The source declares no helper pair for it.
   */
  private readonly shippingAddressZoneIDs: readonly string[];

  /**
   * Group b, collapsed.
   *
   * LEGACY-NOTE [model/entity/PromotionReward.cfc:L78]: `ShippingMethod` is part of the explicitly
   * out-of-scope order/checkout/shipping pipeline, so the collection itself is collapsed to opaque
   * `shippingMethodID` values rather than an entity array.
   *
   * So the owning half is reproduced and the far half is not, and the split is stated at each
   * member rather than used to justify dropping the whole thing.
   */
  private readonly shippingMethodIDs: string[];

  /**
   * Group c, include. [model/entity/PromotionReward.cfc:L80]
   * `singularname="brand" cfc="Brand" fieldtype="many-to-many" linktable="SwPromoRewardBrand" fkcolumn="promotionRewardID" inversejoincolumn="brandID"`.
   *
   * Empty means "nothing matches" (restrictive) - see semantics #4 in the module header.
   */
  private readonly brands: Brand[];

  /**
   * Group c, include. [model/entity/PromotionReward.cfc:L81]
   * `singularname="option" cfc="Option" fieldtype="many-to-many" linktable="SwPromoRewardOption" fkcolumn="promotionRewardID" inversejoincolumn="optionID"`.
   *
   * Read by `hasAnyOption()` on the live promotion-membership path
   * [model/service/PromotionService.cfc:L951].
   */
  private readonly options: Option[];

  /**
   * Group c, include. [model/entity/PromotionReward.cfc:L82]
   * `singularname="sku" cfc="Sku" fieldtype="many-to-many" linktable="SwPromoRewardSku" fkcolumn="promotionRewardID" inversejoincolumn="skuID"`.
   */
  private readonly skus: Sku[];
  private readonly products: Product[];
  private readonly productTypes: ProductType[];

  /**
   * Note the abbreviated `Excl` prefix - never expanded to `Excluded`.
   */
  private readonly excludedBrands: Brand[];

  /**
   * Read by `hasAnyExcludedOption()` on the live promotion-membership path
   * [model/service/PromotionService.cfc:L980].
   */
  private readonly excludedOptions: Option[];

  /**
   * Group d, exclude. [model/entity/PromotionReward.cfc:L88]
   * `singularname="excludedSku" cfc="Sku" fieldtype="many-to-many" linktable="SwPromoRewardExclSku" fkcolumn="promotionRewardID" inversejoincolumn="skuID"`.
   */
  private readonly excludedSkus: Sku[];
  private readonly excludedProducts: Product[];
  private readonly excludedProductTypes: ProductType[];

  // [model/entity/PromotionReward.cfc:L92] banner; declaration at L93.
  private readonly remoteID: string | undefined;

  // [model/entity/PromotionReward.cfc:L95] banner; declarations at L96-L99.
  //
  // Explicit UTC policy: both timestamps are `Date` values interpreted as UTC.

  /**
   * [model/entity/PromotionReward.cfc:L96] `hb_populateEnabled="false" ormtype="timestamp"`. UTC.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L97]
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`.
   *
   * LEGACY-NOTE: `Account` is out of SCOPE, so the association is collapsed to the inert opaque FK
   * column it is stored in.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L98] `hb_populateEnabled="false" ormtype="timestamp"`. UTC.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L99]
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`.
   *
   * LEGACY-NOTE: collapsed on exactly the same terms as `createdByAccountID` above - dropped
   * `getModifiedByAccount()` / `setModifiedByAccount()`, preserved `modifiedByAccountID` column.
   */
  private readonly modifiedByAccountID: string | undefined;

  // [model/entity/PromotionReward.cfc:L101] banner; declarations at L102-L104.
  //
  // CONTRAST model/entity/PromotionQualifier.cfc, which carries a DOUBLE orphan - a declared
  // property with no getter and a getter with no declared property.

  /**
   * Resolved resource-bundle text for `getSimpleRepresentation()`
   * [model/entity/PromotionReward.cfc:L106-L108]. Not a legacy property and not a service locator
   * JavaRB is not ported, so labels are supplied at hydration.
   */
  private readonly labelProvider: PromotionRewardLabelProvider | undefined;

  /**
   * Constructed by src/repositories/mysql/mysqlPromotionRepository.ts's row-to-entity factory from
   * one `SwPromoReward` row plus its materialized associations.
   *
   * The single-typed-input shape, the `?? []` collection defaults and the required primary key all
   * match the convention every shipped sibling entity in this folder established.
   *
   * No collaborator port is injected - this entity has zero `getService(` sites.
   */
  constructor(init: {
    readonly promotionRewardID: string;
    readonly amount?: Money | undefined;
    readonly amountType?: AmountType | undefined;
    readonly rewardType?: string | undefined;
    readonly applicableTerm?: ApplicableTerm | undefined;
    readonly maximumUsePerOrder?: number | undefined;
    readonly maximumUsePerItem?: number | undefined;
    readonly maximumUsePerQualification?: number | undefined;
    readonly promotionPeriod?: PromotionPeriod | undefined;
    readonly roundingRule?: RoundingRule | undefined;
    readonly eligiblePriceGroups?: PriceGroup[] | undefined;
    readonly fulfillmentMethodIDs?: readonly string[] | undefined;
    readonly shippingAddressZoneIDs?: readonly string[] | undefined;
    readonly shippingMethodIDs?: readonly string[] | undefined;
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
    readonly labelProvider?: PromotionRewardLabelProvider | undefined;
  }) {
    this.promotionRewardID = init.promotionRewardID;
    this.amount = init.amount;
    this.amountType = init.amountType;
    this.rewardType = init.rewardType;
    this.applicableTerm = init.applicableTerm;
    this.maximumUsePerOrder = init.maximumUsePerOrder;
    this.maximumUsePerItem = init.maximumUsePerItem;
    this.maximumUsePerQualification = init.maximumUsePerQualification;
    this.promotionPeriod = init.promotionPeriod;
    this.roundingRule = init.roundingRule;
    this.eligiblePriceGroups = init.eligiblePriceGroups ?? [];
    this.fulfillmentMethodIDs = init.fulfillmentMethodIDs ?? [];
    this.shippingAddressZoneIDs = init.shippingAddressZoneIDs ?? [];
    // COPIED, not aliased: the helpers below mutate this array in place, exactly as
    // [model/entity/PromotionReward.cfc:L180, L189] mutate `variables.shippingMethods`.
    this.shippingMethodIDs = [...(init.shippingMethodIDs ?? [])];
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
    this.labelProvider = init.labelProvider;
  }

  /**
   * [model/entity/PromotionReward.cfc:L60] The primary key.
   */
  getPromotionRewardID(): string {
    return this.promotionRewardID;
  }

  /**
   * [model/entity/PromotionReward.cfc:L61] `undefined` for a NULL column - never a substituted
   * `Money` zero. See the field documentation for the four-column no-default table.
   */
  getAmount(): Money | undefined {
    return this.amount;
  }

  /**
   * [model/entity/PromotionReward.cfc:L62] The Strategy discriminator.
   */
  getAmountType(): AmountType | undefined {
    return this.amountType;
  }

  /**
   * [model/entity/PromotionReward.cfc:L63] Deliberately an un-narrowed `string` - the five-value
   * vocabulary is documented only in the L48-L56 comment block and is not enforced anywhere.
   */
  getRewardType(): string | undefined {
    return this.rewardType;
  }
  getApplicableTerm(): ApplicableTerm | undefined {
    return this.applicableTerm;
  }

  /**
   * [model/entity/PromotionReward.cfc:L65] `undefined` means UNLIMITED
   * (`hb_nullRBKey="define.unlimited"`), never zero uses. Read directly by
   * src/services/promotion/overUseStripping.ts.
   */
  getMaximumUsePerOrder(): number | undefined {
    return this.maximumUsePerOrder;
  }

  /**
   * [model/entity/PromotionReward.cfc:L66] `undefined` means unlimited, never zero uses.
   */
  getMaximumUsePerItem(): number | undefined {
    return this.maximumUsePerItem;
  }

  /**
   * [model/entity/PromotionReward.cfc:L67] `undefined` means unlimited, never zero uses.
   */
  getMaximumUsePerQualification(): number | undefined {
    return this.maximumUsePerQualification;
  }
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/PromotionReward.cfc:L97] The collapsed `cfc="Account"` FK, exposed as the opaque
   * column value. There is deliberately no `getCreatedByAccount()`.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/PromotionReward.cfc:L99] The collapsed `cfc="Account"` FK. There is deliberately
   * no `getModifiedByAccount()`.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * [model/entity/PromotionReward.cfc:L70] The parent period, or `undefined` for an unattached
   * reward.
   */
  getPromotionPeriod(): PromotionPeriod | undefined {
    return this.promotionPeriod;
  }

  /**
   * [model/entity/PromotionReward.cfc:L71] The rounding rule the must-preserve discount math
   * reaches through, or `undefined`.
   */
  getRoundingRule(): RoundingRule | undefined {
    return this.roundingRule;
  }

  //
  // The three GROUP B accessors are the only `readonly` ones, because nothing mutates them.

  /**
   * [model/entity/PromotionReward.cfc:L74] LIVE reference. Link table
   * `SwPromoRewardEligiblePriceGrp`.
   */
  getEligiblePriceGroups(): PriceGroup[] {
    return this.eligiblePriceGroups;
  }

  /**
   * [model/entity/PromotionReward.cfc:L76] The collapsed Group B link rows for
   * `SwPromoRewardFulfillmentMethod`, as opaque `fulfillmentMethodID` values.
   *
   * FAR-SIDE CONTRACT for src/services: the promotion engine reads this collection when evaluating
   * fulfillment reward applicability.
   */
  getFulfillmentMethodIDs(): readonly string[] {
    return this.fulfillmentMethodIDs;
  }

  /**
   * [model/entity/PromotionReward.cfc:L77] The collapsed Group B link rows for
   * `SwPromoRewardShipAddressZone`, as opaque `addressZoneID` values.
   *
   * FAR-SIDE CONTRACT for src/services: zone membership must be resolved through the injected
   * `addressZoneEvaluator` port, ported from `AddressService.isAddressInZone`
   * [model/service/AddressService.cfc:L57].
   */
  getShippingAddressZoneIDs(): readonly string[] {
    return this.shippingAddressZoneIDs;
  }

  /**
   * [model/entity/PromotionReward.cfc:L78] The collapsed Group B link rows for
   * `SwPromoRewardShippingMethod`, as opaque `shippingMethodID` values.
   *
   * The LIVE ARRAY, exactly as [model/entity/PromotionReward.cfc:L183, L191, L193] returned the
   * live `variables.shippingMethods` to its callers - so a caller that read this before an
   * `addShippingMethod` observes the addition.
   */
  getShippingMethodIDs(): readonly string[] {
    return this.shippingMethodIDs;
  }

  /**
   * [model/entity/PromotionReward.cfc:L80] LIVE reference. Link table `SwPromoRewardBrand`.
   */
  getBrands(): Brand[] {
    return this.brands;
  }

  /**
   * [model/entity/PromotionReward.cfc:L81] LIVE reference. Link table `SwPromoRewardOption`.
   */
  getOptions(): Option[] {
    return this.options;
  }

  /**
   * [model/entity/PromotionReward.cfc:L82] LIVE reference. Link table `SwPromoRewardSku`.
   */
  getSkus(): Sku[] {
    return this.skus;
  }

  /**
   * [model/entity/PromotionReward.cfc:L83] LIVE reference. Link table `SwPromoRewardProduct`.
   */
  getProducts(): Product[] {
    return this.products;
  }

  /**
   * [model/entity/PromotionReward.cfc:L84] LIVE reference. Link table `SwPromoRewardProductType`.
   */
  getProductTypes(): ProductType[] {
    return this.productTypes;
  }

  /**
   * [model/entity/PromotionReward.cfc:L86] LIVE reference. Link table `SwPromoRewardExclBrand`.
   */
  getExcludedBrands(): Brand[] {
    return this.excludedBrands;
  }

  /**
   * [model/entity/PromotionReward.cfc:L87] LIVE reference. Link table `SwPromoRewardExclOption`.
   */
  getExcludedOptions(): Option[] {
    return this.excludedOptions;
  }

  /**
   * [model/entity/PromotionReward.cfc:L88] LIVE reference. Link table `SwPromoRewardExclSku`.
   */
  getExcludedSkus(): Sku[] {
    return this.excludedSkus;
  }

  /**
   * [model/entity/PromotionReward.cfc:L89] LIVE reference. Link table `SwPromoRewardExclProduct`.
   */
  getExcludedProducts(): Product[] {
    return this.excludedProducts;
  }

  /**
   * [model/entity/PromotionReward.cfc:L90] LIVE reference. Link table
   * `SwPromoRewardExclProductType`.
   */
  getExcludedProductTypes(): ProductType[] {
    return this.excludedProductTypes;
  }

  //
  // LEGACY-NOTE [model/entity/PromotionReward.cfc:L106-L108]: STRUCTURAL WART. This method sits at
  // L106-L108, ORPHANED between the last non-persistent property declaration (L104) and the first
  // `START:` banner (L110, "Non-Persistent Property Methods").

  /**
   * The `" - "` separator (space-hyphen-space) is emitted UNCONDITIONALLY by the source's string
   * interpolation, so a NULL `rewardType` leaves a trailing separator.
   *
   * `rbKey('entity.promotionReward')` and `getFormattedValue('rewardType')` are both framework
   * collaborators that are not ported: `rbKey` is JavaRB.
   *
   * @throws when the reward was hydrated without a label provider.
   */
  getSimpleRepresentation(): string {
    const provider: PromotionRewardLabelProvider | undefined = this.labelProvider;

    if (provider === undefined) {
      throw new Error(
        'PromotionReward.getSimpleRepresentation needs resolved text for two resource-bundle ' +
          "keys - 'entity.promotionReward' [model/entity/PromotionReward.cfc:L107] and " +
          "'entity.promotionReward.rewardType.<value>' " +
          '[org/Hibachi/HibachiTransient.cfc:L506] - and this reward was hydrated without a ' +
          'label provider. JavaRB is not ported, so resolved labels are supplied at hydration. ' +
          'No default is substituted: emitting the raw keys would leak identifiers into an ' +
          'admin screen and emitting English would fabricate translations.',
      );
    }

    // [org/Hibachi/HibachiTransient.cfc:L505-L509] the `rbKey` format branch: a key built from the
    // stored value, or `''` when the value is null.
    const rewardTypeLabel: string =
      this.rewardType === undefined ? '' : provider.getRewardTypeLabel(this.rewardType);

    return `${provider.getPromotionRewardEntityLabel()} - ${rewardTypeLabel}`;
  }

  // [model/entity/PromotionReward.cfc:L110] start banner, [model/entity/PromotionReward.cfc:L135]
  // end banner.

  /**
   * [model/entity/PromotionReward.cfc:L112-L118] The backing property for `applicableTermOptions`
   * [model/entity/PromotionReward.cfc:L103]. A flat, unconditional three-element list - contrast
   * `getAmountTypeOptions()` below, which branches.
   *
   * Returns a fresh fixed-length tuple on every call, in SOURCE ORDER, with the `rbKey` arguments
   * preserved VERBATIM as the unresolved `name` values because JavaRB is not ported.
   */
  getApplicableTermOptions(): readonly [
    ApplicableTermOption,
    ApplicableTermOption,
    ApplicableTermOption,
  ] {
    return [
      { name: 'define.both', value: 'both' },
      { name: 'define.initial', value: 'initial' },
      { name: 'define.renewal', value: 'renewal' },
    ];
  }

  /**
   * [model/entity/PromotionReward.cfc:L120-L133] The backing property for `amountTypeOptions`
   * [model/entity/PromotionReward.cfc:L102].
   *
   * A null `rewardType` fails the `== "order"` test in CFML and therefore takes the else branch.
   *
   * The third entry's name/value mismatch is preserved: display key `define.fixedAmount`, stored
   * value `amount`.
   */
  getAmountTypeOptions():
    | readonly [AmountTypeOption, AmountTypeOption]
    | readonly [AmountTypeOption, AmountTypeOption, AmountTypeOption] {
    // [model/entity/PromotionReward.cfc:L121] `getRewardType() == "order"`, case-folded. See the
    // note above.
    if ((this.rewardType ?? '').toLowerCase() === 'order') {
      // [model/entity/PromotionReward.cfc:L122-L125] the order branch: two options, no fixed
      // amount.
      return [
        { name: 'define.percentageOff', value: 'percentageOff' },
        { name: 'define.amountOff', value: 'amountOff' },
      ];
    }

    // [model/entity/PromotionReward.cfc:L127-L131] every other reward type - merchandise,
    // subscription, contentAccess, fulfillment, and a NULL rewardType: three options.
    return [
      { name: 'define.percentageOff', value: 'percentageOff' },
      { name: 'define.amountOff', value: 'amountOff' },
      { name: 'define.fixedAmount', value: 'amount' },
    ];
  }

  //
  // Why `indexOf` and not `findIndex` in the `remove*` helpers: CFML `arrayFind` on complex
  // objects compares by reference, so `indexOf` is the faithful equivalent there.

  /**
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] and the `unsavedvalue`/`default` semantics of the
   * primary key [model/entity/PromotionReward.cfc:L60].
   *
   * Called on this side by every `add*` guard's second clause
   * [model/entity/PromotionReward.cfc:L142, L162, L202, L222, L242, L262, L282, L302, L322, L342, L362, L382]
   * and on the FAR side by every `add*` guard's first clause.
   */
  isNew(): boolean {
    return this.promotionRewardID === '';
  }

  /**
   * mandatory. Dispatch [org/Hibachi/HibachiEntity.cfc:L517-L519]; implementation
   * [org/Hibachi/HibachiEntity.cfc:L340-L350] `hasAnyInProperty`.
   *
   * Call site: model/service/PromotionService.cfc:L951, inside `getOrderItemInReward`
   * `model/entity/PromotionReward.cfc` - the live promotion-membership path.
   *
   * Returns `false` for an empty input array, which is exactly what `hasAnyInProperty` does at
   * L340-L350.
   */
  hasAnyOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasOption(option));
  }

  /**
   * mandatory. Dispatch [org/Hibachi/HibachiEntity.cfc:L517-L519]; implementation
   * [org/Hibachi/HibachiEntity.cfc:L340-L350].
   *
   * Tests against the `excludedOptions` collection [model/entity/PromotionReward.cfc:L87] and
   * never against `options` [model/entity/PromotionReward.cfc:L81].
   */
  hasAnyExcludedOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasExcludedOption(option));
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in
   * model/entity/PromotionReward.cfc. Materialized because the source's own
   * `addEligiblePriceGroup` guard calls it at L159.
   */
  hasEligiblePriceGroup(priceGroup: PriceGroup): boolean {
    const candidateID: string = priceGroup.getPriceGroupID();
    if (candidateID === '') {
      return this.eligiblePriceGroups.includes(priceGroup);
    }
    return this.eligiblePriceGroups.some(
      (held: PriceGroup) => held.getPriceGroupID() === candidateID,
    );
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L199.
   */
  hasBrand(brand: Brand): boolean {
    const candidateID: string = brand.getBrandID();
    if (candidateID === '') {
      return this.brands.includes(brand);
    }
    return this.brands.some((held: Brand) => held.getBrandID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L219.
   */
  hasOption(option: Option): boolean {
    const candidateID: string = option.getOptionID();
    if (candidateID === '') {
      return this.options.includes(option);
    }
    return this.options.some((held: Option) => held.getOptionID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L239.
   */
  hasSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.skus.includes(sku);
    }
    return this.skus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L259.
   */
  hasProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.products.includes(product);
    }
    return this.products.some((held: Product) => held.getProductID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L279.
   */
  hasProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.productTypes.includes(productType);
    }
    return this.productTypes.some((held: ProductType) => held.getProductTypeID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L299.
   */
  hasExcludedBrand(brand: Brand): boolean {
    const candidateID: string = brand.getBrandID();
    if (candidateID === '') {
      return this.excludedBrands.includes(brand);
    }
    return this.excludedBrands.some((held: Brand) => held.getBrandID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L319.
   */
  hasExcludedOption(option: Option): boolean {
    const candidateID: string = option.getOptionID();
    if (candidateID === '') {
      return this.excludedOptions.includes(option);
    }
    return this.excludedOptions.some((held: Option) => held.getOptionID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L339.
   */
  hasExcludedSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.excludedSkus.includes(sku);
    }
    return this.excludedSkus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L359.
   */
  hasExcludedProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.excludedProducts.includes(product);
    }
    return this.excludedProducts.some((held: Product) => held.getProductID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guard site L379.
   */
  hasExcludedProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.excludedProductTypes.includes(productType);
    }
    return this.excludedProductTypes.some(
      (held: ProductType) => held.getProductTypeID() === candidateID,
    );
  }

  // [model/entity/PromotionReward.cfc:L137] start banner, [model/entity/PromotionReward.cfc:L397]
  // end banner - roughly 260 lines, the largest such block in any in-scope entity.
  //
  // Authored here: the many-to-one pair plus eleven many-to-many pairs.

  /**
   * The field is assigned FIRST [model/entity/PromotionReward.cfc:L141], then the guard is
   * evaluated [model/entity/PromotionReward.cfc:L142], then `this` is appended to the far side's
   * LIVE array [model/entity/PromotionReward.cfc:L143].
   *
   * The parameter is required, matching `required any promotionPeriod` at L140.
   *
   * LEGACY-NOTE [model/entity/PromotionReward.cfc:L140-L145]: orphan-reference asymmetry.
   */
  setPromotionPeriod(promotionPeriod: PromotionPeriod): void {
    this.promotionPeriod = promotionPeriod;

    if (this.isNew() || !promotionPeriod.hasPromotionReward(this)) {
      promotionPeriod.getPromotionRewards().push(this);
    }
  }

  /**
   * `isNullish()` supplies the CFML `isNull()`/absence parity for the substitution.
   */
  removePromotionPeriod(promotionPeriod?: PromotionPeriod): void {
    // [model/entity/PromotionReward.cfc:L147-L149] the absent-argument substitution.
    const targetPromotionPeriod: PromotionPeriod | undefined = isNullish(promotionPeriod)
      ? this.promotionPeriod
      : promotionPeriod;

    if (targetPromotionPeriod === undefined) {
      throw new Error(
        'PromotionReward.removePromotionPeriod was called with no argument on a reward that has ' +
          'no promotionPeriod. This reproduces the legacy runtime failure at ' +
          'model/entity/PromotionReward.cfc:L147-L150, where the omitted argument defaults to a ' +
          'null period and getPromotionRewards() is then invoked on it.',
      );
    }

    // [model/entity/PromotionReward.cfc:L150-L153] `arrayFind` is 1-based and returns 0 on a miss;
    // `indexOf` is 0-based and returns -1. Testing `> 0` here would silently refuse to remove the
    // FIRST sibling reward.
    const siblingRewards: PromotionReward[] = targetPromotionPeriod.getPromotionRewards();
    const index: number = siblingRewards.indexOf(this);

    if (index !== -1) {
      siblingRewards.splice(index, 1);
    }
    this.promotionPeriod = undefined;
  }

  // Parameter names follow the entity, not the property, in the source -
  // `addExcludedBrand( required any brand)` and not `excludedBrand`, and likewise `option`, `sku`,
  // `product`, `productType`.

  /**
   * [model/entity/PromotionReward.cfc:L158-L165] Guard L159 + L162. Include family.
   *
   * Parameter named `eligiblePriceGroup` - the one helper in this component whose parameter
   * follows the `singularname` rather than the entity name.
   */
  addEligiblePriceGroup(eligiblePriceGroup: PriceGroup): void {
    if (eligiblePriceGroup.isNew() || !this.hasEligiblePriceGroup(eligiblePriceGroup)) {
      this.eligiblePriceGroups.push(eligiblePriceGroup);
    }
    if (this.isNew() || !eligiblePriceGroup.hasPromotionReward(this)) {
      eligiblePriceGroup.getPromotionRewards().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L166-L175] Removes from both sides. Include family.
   */
  removeEligiblePriceGroup(eligiblePriceGroup: PriceGroup): void {
    const thisIndex: number = this.eligiblePriceGroups.indexOf(eligiblePriceGroup);
    if (thisIndex !== -1) {
      this.eligiblePriceGroups.splice(thisIndex, 1);
    }

    // [model/entity/PromotionReward.cfc:L171-L174] the far side's LIVE array.
    const farSide: PromotionReward[] = eligiblePriceGroup.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * Whether this reward already carries the given shipping-method link row.
   *
   * KEYED on the OPAQUE ID, because `ShippingMethod` is part of the out-of-scope order/checkout/
   * shipping pipeline and is not ported.
   *
   * @param shippingMethodID the `shippingMethodID` value of the link row.
   * @returns whether the identifier is already held.
   */
  hasShippingMethod(shippingMethodID: string): boolean {
    return this.shippingMethodIDs.includes(shippingMethodID);
  }

  /**
   * [model/entity/PromotionReward.cfc:L178-L185] Link table `SwPromoRewardShippingMethod`.
   * Parameter named `shippingMethod` in the source; ID-keyed here, so `shippingMethodID`.
   *
   * @param shippingMethodID the `shippingMethodID` value to link.
   */
  addShippingMethod(shippingMethodID: string): void {
    if (!this.hasShippingMethod(shippingMethodID)) {
      this.shippingMethodIDs.push(shippingMethodID);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L186-L195] Removes from the OWNING side only.
   *
   * FIRST OCCURRENCE only, which is the source's semantic and not a simplification: `arrayFind` at
   * [model/entity/PromotionReward.cfc:L187] answers the first position and `arrayDeleteAt` at
   * [model/entity/PromotionReward.cfc:L189] removes exactly that one element.
   *
   * @param shippingMethodID the `shippingMethodID` value to unlink.
   */
  removeShippingMethod(shippingMethodID: string): void {
    const thisIndex: number = this.shippingMethodIDs.indexOf(shippingMethodID);
    if (thisIndex !== -1) {
      this.shippingMethodIDs.splice(thisIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L198-L205] Guard L199 + L202. Include family.
   */
  addBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasBrand(brand)) {
      this.brands.push(brand);
    }
    if (this.isNew() || !brand.hasPromotionReward(this)) {
      brand.getPromotionRewards().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L206-L215] Removes from both sides. Include family.
   */
  removeBrand(brand: Brand): void {
    const thisIndex: number = this.brands.indexOf(brand);
    if (thisIndex !== -1) {
      this.brands.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = brand.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L218-L225] Guard L219 + L222. Include family.
   */
  addOption(option: Option): void {
    if (option.isNew() || !this.hasOption(option)) {
      this.options.push(option);
    }
    if (this.isNew() || !option.hasPromotionReward(this)) {
      option.getPromotionRewards().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L226-L235] Removes from both sides. Include family.
   */
  removeOption(option: Option): void {
    const thisIndex: number = this.options.indexOf(option);
    if (thisIndex !== -1) {
      this.options.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = option.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L238-L245] Guard L239 + L242. Include family.
   */
  addSku(sku: Sku): void {
    if (sku.isNew() || !this.hasSku(sku)) {
      this.skus.push(sku);
    }
    if (this.isNew() || !sku.hasPromotionReward(this)) {
      sku.getPromotionRewards().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L246-L255] Removes from both sides. Include family.
   */
  removeSku(sku: Sku): void {
    const thisIndex: number = this.skus.indexOf(sku);
    if (thisIndex !== -1) {
      this.skus.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = sku.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L258-L265] Guard L259 + L262. Include family.
   */
  addProduct(product: Product): void {
    if (product.isNew() || !this.hasProduct(product)) {
      this.products.push(product);
    }
    if (this.isNew() || !product.hasPromotionReward(this)) {
      product.getPromotionRewards().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L266-L275] Removes from both sides. Include family.
   */
  removeProduct(product: Product): void {
    const thisIndex: number = this.products.indexOf(product);
    if (thisIndex !== -1) {
      this.products.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = product.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L278-L285] Guard L279 + L282. Include family.
   */
  addProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasProductType(productType)) {
      this.productTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPromotionReward(this)) {
      productType.getPromotionRewards().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L286-L295] Removes from both sides. Include family.
   */
  removeProductType(productType: ProductType): void {
    const thisIndex: number = this.productTypes.indexOf(productType);
    if (thisIndex !== -1) {
      this.productTypes.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = productType.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L298-L305] Guard L299 + L302. Exclude family - calls
   * `hasPromotionRewardExclusion` / `getPromotionRewardExclusions()`, never the include members.
   *
   * Parameter named `brand`, not `excludedBrand` - the source's parameter follows the ENTITY.
   */
  addExcludedBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasExcludedBrand(brand)) {
      this.excludedBrands.push(brand);
    }
    if (this.isNew() || !brand.hasPromotionRewardExclusion(this)) {
      brand.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L306-L315] Removes from both sides. Exclude family.
   */
  removeExcludedBrand(brand: Brand): void {
    const thisIndex: number = this.excludedBrands.indexOf(brand);
    if (thisIndex !== -1) {
      this.excludedBrands.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = brand.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L318-L325] Guard L319 + L322. Exclude family.
   *
   * This relationship is the mirror-image control case: model/entity/Option.cfc:L129-L131's
   * `removePromotionRewardExclusion()` calls `addExcludedOption(this)` - a "remove" that adds.
   */
  addExcludedOption(option: Option): void {
    if (option.isNew() || !this.hasExcludedOption(option)) {
      this.excludedOptions.push(option);
    }
    if (this.isNew() || !option.hasPromotionRewardExclusion(this)) {
      option.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L326-L335] Removes from both sides. Exclude family.
   */
  removeExcludedOption(option: Option): void {
    const thisIndex: number = this.excludedOptions.indexOf(option);
    if (thisIndex !== -1) {
      this.excludedOptions.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = option.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L338-L345] Guard L339 + L342. Exclude family.
   */
  addExcludedSku(sku: Sku): void {
    if (sku.isNew() || !this.hasExcludedSku(sku)) {
      this.excludedSkus.push(sku);
    }
    if (this.isNew() || !sku.hasPromotionRewardExclusion(this)) {
      sku.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L346-L355] Removes from both sides. Exclude family.
   */
  removeExcludedSku(sku: Sku): void {
    const thisIndex: number = this.excludedSkus.indexOf(sku);
    if (thisIndex !== -1) {
      this.excludedSkus.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = sku.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L358-L365] Guard L359 + L362. Exclude family.
   */
  addExcludedProduct(product: Product): void {
    if (product.isNew() || !this.hasExcludedProduct(product)) {
      this.excludedProducts.push(product);
    }
    if (this.isNew() || !product.hasPromotionRewardExclusion(this)) {
      product.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L366-L375] Removes from both sides. Exclude family.
   */
  removeExcludedProduct(product: Product): void {
    const thisIndex: number = this.excludedProducts.indexOf(product);
    if (thisIndex !== -1) {
      this.excludedProducts.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = product.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L378-L385] Guard L379 + L382. Exclude family.
   */
  addExcludedProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasExcludedProductType(productType)) {
      this.excludedProductTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPromotionRewardExclusion(this)) {
      productType.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L386-L395] Removes from both sides. Exclude family.
   */
  removeExcludedProductType(productType: ProductType): void {
    const thisIndex: number = this.excludedProductTypes.indexOf(productType);
    if (thisIndex !== -1) {
      this.excludedProductTypes.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = productType.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  // [model/entity/PromotionReward.cfc:L399] start banner, [model/entity/PromotionReward.cfc:L409]
  // end banner.

  /**
   * The early-return shape is preserved - an `if` with a guarded return followed by a bare
   * fall-through return, not an `if`/`else`.
   *
   * LEGACY-NOTE [model/entity/PromotionReward.cfc:L61, L401-L407]: `amount` is `big_decimal` with
   * no `default=` attribute, so `getAmount()` can be NULL in the legacy engine.
   *
   * So there is no divergence to record on the currency branch - the two files agree, and are
   * required to.
   */
  getAmountFormatted(): string {
    const amount: Money | undefined = this.amount;

    // [model/entity/PromotionReward.cfc:L61] the no-default column.
    if (isNullish(amount) || amount === undefined) {
      return '';
    }

    // [model/entity/PromotionReward.cfc:L402-L404] the percentage branch, case-folded.
    //
    // `cfNumberToString`, not `numberFormat(..., '0.00')`: the legacy mask is
    // org/Hibachi/HibachiUtilityService.cfc:L62-L64, which is `arguments.value & "%"` - plain CFML
    // stringification with no mask at all - so a stored 12.50 must render "12.5%".
    if ((this.amountType ?? '').toLowerCase() === 'percentageoff') {
      return `${cfNumberToString(amount.toDecimalString())}%`;
    }

    // [model/entity/PromotionReward.cfc:L406] the currency branch, reached by `amountOff` and
    // `amount` alike. The two-decimal presentation and nothing more; the withheld symbol and
    // grouping are accounted for above.
    return numberFormat(amount.toDecimalString(), '0.00');
  }

  // [model/entity/PromotionReward.cfc:L411] start banner, [model/entity/PromotionReward.cfc:L421]
  // end banner.
  //
  // Neither carries the TypeScript `override` keyword, because this class extends nothing.

  /**
   * [model/entity/PromotionReward.cfc:L413-L415] Overrides the framework base's
   * `getSimpleRepresentationPropertyName()`.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'rewardType';
  }

  /**
   * The `&&` short-circuit and the operand order are preserved.
   *
   * `getPromotionPeriod()` is invoked twice in the single source expression.
   */
  isDeletable(): boolean {
    // [model/entity/PromotionReward.cfc:L418] FIRST dereference of `getPromotionPeriod()`.
    const promotionPeriodForExpiryTest: PromotionPeriod | undefined = this.getPromotionPeriod();

    if (promotionPeriodForExpiryTest === undefined) {
      throw new Error(
        'PromotionReward.isDeletable was called on a reward with no materialized ' +
          'promotionPeriod. model/entity/PromotionReward.cfc:L418 calls ' +
          'getPromotionPeriod().isExpired() with no null guard, so an unattached or unjoined ' +
          'reward is a CFML null-reference error there too.',
      );
    }

    // [model/entity/PromotionReward.cfc:L418] the FIRST operand,
    // `!getPromotionPeriod().isExpired()`. CFML `&&` short-circuits, so an expired period answers
    // `false` without the second dereference below.
    if (promotionPeriodForExpiryTest.isExpired()) {
      return false;
    }

    // [model/entity/PromotionReward.cfc:L418] the SECOND, separate `getPromotionPeriod()` call -
    // reproduced rather than hoisted.
    const promotionPeriodForPromotionTest: PromotionPeriod | undefined = this.getPromotionPeriod();

    if (promotionPeriodForPromotionTest === undefined) {
      throw new Error(
        'PromotionReward.isDeletable lost its promotionPeriod between the two ' +
          'getPromotionPeriod() calls that model/entity/PromotionReward.cfc:L418 makes in a ' +
          'single expression. The source dereferences the period twice with no null guard on ' +
          'either call, so this is the CFML null-reference error for the second one.',
      );
    }

    const promotion = promotionPeriodForPromotionTest.getPromotion();

    if (promotion === undefined) {
      throw new Error(
        'PromotionReward.isDeletable reached the second operand of its deletability test but ' +
          'the promotion period has no materialized promotion. ' +
          'model/entity/PromotionReward.cfc:L418 calls ' +
          'getPromotionPeriod().getPromotion().isDeletable() with no null guard. This branch is ' +
          'reached only when the period is NOT expired - an expired period short-circuits to ' +
          'false before touching the promotion.',
      );
    }

    // [model/entity/PromotionReward.cfc:L418] the second operand.
    return promotion.isDeletable();
  }
}
