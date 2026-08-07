// slatwall-ts - Product entity.
//
// Port of model/entity/Product.cfc (841 lines), the second-largest in-scope entity after
// model/entity/Sku.cfc.
//
// Schema continuity is binding: table `SwProduct`, entity name `SlatwallProduct`, no migration, no
// rename, no column change.
//
// LEGACY-NOTE [model/entity/Product.cfc:L254 vs L341/L637/L644/L651]: the service name's casing
// and quoting are inconsistent in the source - [model/entity/Product.cfc:L254] writes
// `getService("OptionService")` with a capital `O` and double quotes.

import { listAppend, listToArray } from '../../lib/cfml/list.js';
import {
  cfEquals,
  cfFoldKey,
  structGet,
  structKeyExists,
  structKeyList,
  type CfStruct,
} from '../../lib/cfml/struct.js';
import { cfBoolean, cfLen, cfTruthy, type CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { AttributeSetSummary, ProductRepository } from '../ports/productRepository.js';
import type { OptionRepository, SelectOption } from '../ports/optionRepository.js';
import type { SalePriceDetail, SalePriceResolver } from '../ports/promotionRepository.js';
import type { SettingsProvider } from '../ports/settingsProvider.js';
import type { SkuRepository } from '../ports/skuRepository.js';
import type { SubscriptionTermProvider } from '../ports/subscriptionTermProvider.js';
import { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Category } from './category.js';
import type { Option } from './option.js';
import type { OptionGroup } from './optionGroup.js';
import type { PriceGroupRate } from './priceGroupRate.js';
import type { ProductType } from './productType.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';
import type { Sku } from './sku.js';

// The import surface.

// The property contract - every `property name=` declaration, transcribed verbatim.
//
// They are declared as `ProductLegacyMetadata` below so they survive into the emitted JavaScript
// and remain greppable from the legacy admin's point of view.

/**
 * The inert legacy metadata this component carries, preserved verbatim.
 */
export const ProductLegacyMetadata = {
  entityName: 'SlatwallProduct',
  table: 'SwProduct',
  serviceName: 'productService',
  permission: 'this',
  /**
   * [model/entity/Product.cfc:L49] The four admin process contexts. Three of the four name
   * in-scope process objects; `addSubscriptionTerm` names an out-of-scope one and is preserved
   * anyway.
   */
  processContexts: 'updateSkus,addOptionGroup,addOption,addSubscriptionTerm',
  /**
   * [model/entity/Product.cfc:L68] The brand select's null-option resource-bundle key.
   */
  brandOptionsNullRBKey: 'define.none',
  /**
   * [model/entity/Product.cfc:L57] The admin form-field type for `productDescription`.
   */
  productDescriptionFormFieldType: 'wysiwyg',
  /**
   * [model/entity/Product.cfc:L118-L123] The format type on all six delegated money properties.
   */
  delegatedPriceFormatType: 'currency',
  /**
   * `model/validation/Product.json` The `productCode` format constraint, recorded as the schema's
   * own text.
   *
   * It is deliberately not value-imported from there: a value import between two entity modules
   * would turn the type-only `entities` cycle into a runtime one.
   */
  productCodeRegexText: '^[a-zA-Z0-9-_.|:~^]+$',
} as const;

/**
 * Everything the repository boundary supplies when it hydrates one `Product`.
 *
 * A single input object rather than a positional parameter list, matching the folder precedent set
 * by `SkuHydrationInput` in./sku.js.
 *
 * Only `productID` is REQUIRED, and that is a live contract:
 * `src/repositories/mysql/mysqlPriceGroupRepository.ts` constructs `new Product({ productID })` to
 * carry an identity across the price-group boundary without materializing a graph.
 */
export type ProductHydrationInput = {
  /**
   * [model/entity/Product.cfc:L52] `fieldtype="id" generator="uuid" unsavedvalue="" default=""`.
   *
   * The `unsavedvalue=""` / `default=""` pair is what makes `isNew()` computable: an unsaved
   * product carries the empty string, never a UUID.
   */
  readonly productID: string;

  /**
   * [model/entity/Product.cfc:L53] `ormtype="boolean"`, no default - may arrive as SQL null.
   */
  readonly activeFlag?: CfBooleanInput;

  /**
   * [model/entity/Product.cfc:L54] `ormtype="string" unique="true"`.
   */
  readonly urlTitle?: string;

  /**
   * [model/entity/Product.cfc:L55] `ormtype="string" notNull="true"`.
   *
   * `notNull="true"` is an ORM-level constraint the target does not re-declare (B5, prohibition
   * 18): the column stays as it is and enforcement stays where it already lives.
   */
  readonly productName?: string;

  /**
   * [model/entity/Product.cfc:L56] `ormtype="string" unique="true"`.
   */
  readonly productCode?: string;

  /**
   * [model/entity/Product.cfc:L57] `length="4000" hb_formFieldType="wysiwyg"`.
   */
  readonly productDescription?: string;

  /**
   * [model/entity/Product.cfc:L58] `ormtype="boolean" default="false"`.
   *
   * The one boolean on this component that declares a default.
   */
  readonly publishedFlag?: CfBooleanInput;

  /**
   * [model/entity/Product.cfc:L59] `ormtype="integer"`. Not money; stays `number`.
   */
  readonly sortOrder?: number;
  readonly calculatedSalePrice?: Money;

  /**
   * [model/entity/Product.cfc:L63] `ormtype="integer"`. A quantity, not money.
   */
  readonly calculatedQATS?: number;

  /**
   * [model/entity/Product.cfc:L64] `ormtype="boolean"`, no default.
   */
  readonly calculatedAllowBackorderFlag?: CfBooleanInput;

  /**
   * [model/entity/Product.cfc:L65] `ormtype="string"`. The persisted snapshot of `getTitle()`.
   */
  readonly calculatedTitle?: string;

  /**
   * [model/entity/Product.cfc:L68] `fetch="join"` - EAGER. Nullable FK `brandID`, so a product
   * genuinely may have no brand and `undefined` is a real answer, not an unloaded association.
   */
  readonly brand?: Brand;

  /**
   * [model/entity/Product.cfc:L69] `fetch="join"` - eager.
   */
  readonly productType?: ProductType;

  /**
   * [model/entity/Product.cfc:L70] `fetch="join" cascade="delete"` - eager.
   */
  readonly defaultSku?: Sku;

  /**
   * [model/entity/Product.cfc:L73] `cascade="all-delete-orphan" inverse="true"`.
   */
  readonly skus?: Sku[];

  /**
   * [model/entity/Product.cfc:L80] link table `SwProductCategory`,
   * `inversejoincolumn="categoryID"`.
   */
  readonly categories?: readonly Category[];

  /**
   * [model/entity/Product.cfc:L81] self-referential many-to-many over `SwRelatedProduct`.
   *
   * Read-only: no helper on either side mutates it in place, and nothing in the in-scope slice
   * reads it either.
   */
  readonly relatedProducts?: readonly Product[];

  /**
   * [model/entity/Product.cfc:L84] `SwPromoRewardProduct`. Mutable and live - see §2.2.
   */
  readonly promotionRewards?: PromotionReward[];

  /**
   * [model/entity/Product.cfc:L85] `SwPromoRewardExclProduct`. Mutable and live - see §2.2.
   */
  readonly promotionRewardExclusions?: PromotionReward[];

  /**
   * [model/entity/Product.cfc:L86] `SwPromoQualProduct`. Mutable and live - see §2.2.
   */
  readonly promotionQualifiers?: PromotionQualifier[];

  /**
   * [model/entity/Product.cfc:L87] `SwPromoQualExclProduct`. Mutable and live - see §2.2.
   */
  readonly promotionQualifierExclusions?: PromotionQualifier[];

  /**
   * [model/entity/Product.cfc:L88] `SwPriceGroupRateProduct`. Mutable and live - see §2.2.
   */
  readonly priceGroupRates?: PriceGroupRate[];

  /**
   * The option groups reachable through this product's skus' options.
   */
  readonly optionGroups?: readonly OptionGroup[];

  /**
   * [model/entity/Product.cfc:L93] `ormtype="string"`. The remote-system correlation id.
   */
  readonly remoteID?: string;

  /**
   * [model/entity/Product.cfc:L96] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  readonly createdDateTime?: Date;

  /**
   * [model/entity/Product.cfc:L97] `cfc="Account" fkcolumn="createdByAccountID"`.
   *
   * COLLAPSED to an opaque ID per §1.5: `Account` is not one of the eighteen in scope, so the FK
   * survives as an inert column and no `Account` type is imported and no entity accessor authored.
   */
  readonly createdByAccountID?: string;

  /**
   * [model/entity/Product.cfc:L98] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  readonly modifiedDateTime?: Date;

  /**
   * [model/entity/Product.cfc:L99] Collapsed to an opaque ID, exactly as `createdByAccountID`.
   */
  readonly modifiedByAccountID?: string;

  /**
   * [model/entity/Product.cfc:L118] `hb_formatType="currency" persistent="false"`.
   */
  readonly price?: Money;

  /**
   * The sale-price details for this product's skus, keyed by `skuID`.
   */
  readonly salePriceDetailsForSkus?: CfStruct<SalePriceDetail>;

  /**
   * `max(SwOptionGroup.sortOrder) + 1` across all option groups.
   *
   * [model/dao/SkuDAO.cfc:L204-L220] `getNextOptionGroupSortOrder()` - a GLOBAL aggregate over
   * `SwOptionGroup`, seeded to `1` when the table is empty.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L222-L226]: the legacy caches this value on the DAO
   * component and its `clearNextOptionGroupSortOrder` guard is INVERTED - it deletes the key only
   * when the key does not exist - so the cache can never be cleared.
   */
  readonly nextOptionGroupSortOrder?: number;

  /**
   * Resolves the four published settings keys. Synchronous: `setting(key: SettingKey): string`.
   *
   * Needed for exactly one key on this component - `globalURLKeyProduct`, read at
   * [model/entity/Product.cfc:L208] and [model/entity/Product.cfc:L212].
   */
  readonly settingsProvider?: SettingsProvider;

  /**
   * That key's default value is declared at [model/service/SettingService.cfc:L193] and must not
   * be transcribed into this file in any form, not even inside a comment (E6, prohibition 5).
   *
   * OPTIONAL, on exactly the terms `settingsProvider` is optional: hydration builds products for
   * paths that never render a title.
   */
  readonly productTitleTemplate?: string;

  /**
   * Discharges the [model/entity/Product.cfc:L367] and [model/entity/Product.cfc:L626] reaches.
   *
   * GetSkusBySelectedOptions(selectedOptions, productID?) <- [model/entity/Product.cfc:L367], a
   * MUST-PRESERVE behaviour getTransactionExistsFlag(productID?, skuID?) <-
   * [model/entity/Product.cfc:L626]
   */
  readonly skuRepository?: SkuRepository;

  /**
   * Discharges the [model/entity/Product.cfc:L637] and [model/entity/Product.cfc:L644] reaches,
   * both on a LIVE validation path (§6.1).
   */
  readonly optionRepository?: OptionRepository;

  /**
   * Discharges the one ported attribute path: `getAttributeSets`
   * [model/entity/Product.cfc:L832-L838].
   */
  readonly productRepository?: ProductRepository;

  /**
   * The subscription STUB port, injected so the refusal at `getUnusedProductSubscriptionTerms`
   * names a real collaborator rather than an imaginary one.
   */
  readonly subscriptionTermProvider?: SubscriptionTermProvider;

  /**
   * Discharges the [model/entity/Product.cfc:L519] reach - `getSalePriceDetailsForSkus()`
   * [model/entity/Product.cfc:L517-L522] - under §3.9 branch (a).
   *
   * `SalePriceResolver` is the second interface exported by../ports/promotionRepository.js, and it
   * exists for exactly this constructor parameter.
   */
  readonly salePriceResolver?: SalePriceResolver;
};

/**
 * What `getAttributeSets` hands back: the port's own read projection, unchanged.
 *
 * Re-exported under a `Product`-scoped name so a caller can spell the return type without
 * importing the port itself, which keeps the port a repository-boundary concern.
 */
export type ProductAttributeSet = AttributeSetSummary;

/**
 * What the two unused-* accessors hand back: the option repository's own `{name, value}`
 * projection.
 *
 * Not `Option[]` and not `OptionGroup[]`, though the specification named those.
 */
export type ProductUnusedOption = SelectOption;

/**
 * Store `value` on `target` under `key` as an own, enumerable data property.
 *
 * CFML parity [model/entity/Product.cfc:L243-L246]: a CFML struct has no prototype chain and no
 * reserved keys, so an option group whose identifier is `__proto__` occupied an ordinary key.
 *
 * @param target the record being built.
 * @param key the externally sourced key.
 * @param value the value to store.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * `SlatwallProduct` / `SwProduct` - the aggregate root of the catalog half of this migration.
 *
 * `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] returns `false` on an empty
 * `entityArray`, and that `false` is PERMISSIVE on an exclude list and RESTRICTIVE on an include
 * list - and this class hands the promotion engine both families.
 */
export class Product {
  // Persistent columns [model/entity/Product.cfc:L52-L59]

  /**
   * [model/entity/Product.cfc:L52] `''` for an unsaved product - see {@link Product.isNew}.
   */
  private readonly productID: string;

  /**
   * [model/entity/Product.cfc:L53] `ormtype="boolean"`, no default.
   */
  private activeFlag: boolean;

  /**
   * [model/entity/Product.cfc:L54] `unique="true"`. Read by {@link Product.getProductURL}.
   */
  private urlTitle: string | undefined;

  /**
   * [model/entity/Product.cfc:L55] `notNull="true"` at the ORM level; required on save.
   */
  private productName: string | undefined;

  /**
   * [model/entity/Product.cfc:L56] `unique="true"`; format constraint recorded as inert text.
   */
  private productCode: string | undefined;

  /**
   * [model/entity/Product.cfc:L57] `length="4000" hb_formFieldType="wysiwyg"`.
   */
  private productDescription: string | undefined;

  /**
   * [model/entity/Product.cfc:L58] `default="false"` - the one boolean here that declares one.
   */
  private publishedFlag: boolean;
  private sortOrder: number | undefined;

  // Calculated columns [model/entity/Product.cfc:L62-L65] Persisted snapshots the ORM maintained.

  /**
   * [model/entity/Product.cfc:L62] `ormtype="big_decimal"`, no default - hence `| undefined`.
   */
  private readonly calculatedSalePrice: Money | undefined;

  /**
   * [model/entity/Product.cfc:L63] `ormtype="integer"`. Snapshot of the omitted `getQATS()`.
   */
  private readonly calculatedQATS: number | undefined;

  /**
   * [model/entity/Product.cfc:L64] `ormtype="boolean"`, no default.
   */
  private readonly calculatedAllowBackorderFlag: boolean;

  /**
   * [model/entity/Product.cfc:L65] The persisted snapshot of `getTitle()`.
   */
  private readonly calculatedTitle: string | undefined;

  // Eager many-to-ones [model/entity/Product.cfc:L68-L70] - all three `fetch="join"`
  private brand: Brand | undefined;

  /**
   * [model/entity/Product.cfc:L69] EAGER. Read by {@link Product.getBaseProductType}.
   */
  private readonly productType: ProductType | undefined;

  /**
   * [model/entity/Product.cfc:L70] eager, `cascade="delete"`.
   *
   * Not `readonly`: {@link Product.setDefaultSku} reassigns it, reproducing the Hibachi-generated
   * setter that [model/service/SkuService.cfc:L102, L134, L167, L189, L198] calls while creating a
   * product's first SKUs.
   */
  private defaultSku: Sku | undefined;

  // A defensive copy would silently break bidirectional removal: the far side would splice a
  // throwaway array and the association would survive.

  /**
   * [model/entity/Product.cfc:L73] live. Defaults to `[]`.
   */
  private readonly skus: Sku[];

  /**
   * [model/entity/Product.cfc:L80] read-only projection; read by `getCategoryIDs()`.
   */
  private readonly categories: readonly Category[];

  /**
   * [model/entity/Product.cfc:L81] READ-ONLY projection; nothing in the slice reads it.
   */
  private readonly relatedProducts: readonly Product[];

  /**
   * [model/entity/Product.cfc:L84] live - `SwPromoRewardProduct`.
   */
  private readonly promotionRewards: PromotionReward[];

  /**
   * [model/entity/Product.cfc:L85] live - `SwPromoRewardExclProduct`.
   */
  private readonly promotionRewardExclusions: PromotionReward[];

  /**
   * [model/entity/Product.cfc:L86] live - `SwPromoQualProduct`.
   */
  private readonly promotionQualifiers: PromotionQualifier[];

  /**
   * [model/entity/Product.cfc:L87] live - `SwPromoQualExclProduct`.
   */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  /**
   * [model/entity/Product.cfc:L88] live - `SwPriceGroupRateProduct`.
   */
  private readonly priceGroupRates: PriceGroupRate[];

  // Remote and audit columns [model/entity/Product.cfc:L93-L99]
  private remoteID: string | undefined;
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/Product.cfc:L97] Opaque ID - `Account` is out of scope (§1.5).
   */
  private readonly createdByAccountID: string | undefined;
  private readonly modifiedDateTime: Date | undefined;

  /**
   * [model/entity/Product.cfc:L99] Opaque ID - `Account` is out of scope (§1.5).
   */
  private readonly modifiedByAccountID: string | undefined;

  // non-persistent state supplied at hydration.

  /**
   * [model/entity/Product.cfc:L118] The override slot `getPrice()` probes FIRST.
   */
  private readonly price: Money | undefined;

  /**
   * VARIANT C memo [model/entity/Product.cfc:L518], reduced and rounded, keyed by `skuID`.
   *
   * Not `readonly`, and the reason is the legacy shape rather than convenience: the memo key the
   * source probes at [model/entity/Product.cfc:L518] is SPELLED
   * `variables.salePriceDetailsForSkus`.
   */
  private salePriceDetailsForSkus: CfStruct<SalePriceDetail> | undefined;

  /**
   * `max(SwOptionGroup.sortOrder) + 1` - the radix of the sorted-sku weighting.
   */
  private readonly nextOptionGroupSortOrder: number | undefined;

  // INJECTED PORTS - the collaborators that discharge the surviving outward reaches (T1/T2)

  /**
   * Resolves `globalURLKeyProduct` for [model/entity/Product.cfc:L208] and
   * [model/entity/Product.cfc:L212]. Synchronous.
   */
  private readonly settingsProvider: SettingsProvider | undefined;

  /**
   * The resolved `productTitleString` value `getTitle()` renders at
   * [model/entity/Product.cfc:L542]. DATA, not A PORT - see the constructor-input member for why
   * the second resolver contract it replaced is gone.
   */
  private readonly productTitleTemplate: string | undefined;

  /**
   * Discharges [model/entity/Product.cfc:L367] `getSkusBySelectedOptions` and
   * [model/entity/Product.cfc:L626] `getTransactionExistsFlag`.
   */
  private readonly skuRepository: SkuRepository | undefined;

  /**
   * Discharges [model/entity/Product.cfc:L637] and [model/entity/Product.cfc:L644], the unused-*
   * pair on the live validation path.
   */
  private readonly optionRepository: OptionRepository | undefined;

  /**
   * Discharges [model/entity/Product.cfc:L833] `getAttributeSets`, the one ported attribute path.
   */
  private readonly productRepository: ProductRepository | undefined;

  /**
   * The subscription STUB port. Present so a refusal can name a real collaborator.
   */
  private readonly subscriptionTermProvider: SubscriptionTermProvider | undefined;

  /**
   * Discharges [model/entity/Product.cfc:L519] `getSalePriceDetailsForProductSkus`, the §3.9
   * branch (a) reach.
   */
  private readonly salePriceResolver: SalePriceResolver | undefined;

  // The three-way seed/guard pattern, and why the variation is the behaviour.
  //
  // VARIANT A - seed then guard (the seed survives when the guard fails): getSalePriceDiscountType
  // [model/entity/Product.cfc:L604-L612] seed "none".

  /**
   * Variant b memo [model/entity/Product.cfc:L252].
   */
  private optionGroups: readonly OptionGroup[] | undefined;

  /**
   * Variant c memo [model/entity/Product.cfc:L242]. Keyed by `optionGroupID`.
   */
  private optionGroupsStruct: CfStruct<OptionGroup> | undefined;

  /**
   * Variant a memo [model/entity/Product.cfc:L525] - defect 19's memo, repaired here.
   */
  private brandName: string | undefined;

  /**
   * Variant a memo [model/entity/Product.cfc:L605], seeded `"none"`.
   */
  private salePriceDiscountType: string | undefined;

  /**
   * Variant c memo [model/entity/Product.cfc:L625].
   */
  private transactionExistsFlag: boolean | undefined;

  /**
   * Variant c memo [model/entity/Product.cfc:L636].
   */
  private unusedProductOptions: readonly SelectOption[] | undefined;

  /**
   * Variant c memo [model/entity/Product.cfc:L643].
   */
  private unusedProductOptionGroups: readonly SelectOption[] | undefined;

  /**
   * VARIANT C memo [model/entity/Product.cfc:L541] - the rendered title template.
   *
   * It needs a second field, and that second field is the point.
   */
  private title = '';

  /**
   * Whether {@link Product.title} has been rendered. Reproduces the legacy `structKeyExists`
   * guard.
   */
  private titleRendered = false;

  /**
   * Hydrate one product from a repository row.
   *
   * Only `productID` is required; every other member is optional and its absence is a MEANINGFUL
   * state rather than a hole to plug.
   *
   * With `exactOptionalPropertyTypes` on, an optional field cannot be assigned `undefined`
   * explicitly, which is why the nullable members are assigned under a presence test rather than
   * with `?? Undefined`.
   */
  public constructor(input: ProductHydrationInput) {
    this.productID = input.productID;

    // [model/entity/Product.cfc:L53] no default declared, so a NULL column reads as `false`
    // through the CFML boolean helper rather than through JavaScript truthiness.
    this.activeFlag = cfBoolean(input.activeFlag);

    // [model/entity/Product.cfc:L58] `default="false"` - reproduced, and `cfBoolean(undefined)` is
    // `false`, so the declared default and the NULL-column reading coincide here.
    this.publishedFlag = cfBoolean(input.publishedFlag);

    // [model/entity/Product.cfc:L64] no default declared.
    this.calculatedAllowBackorderFlag = cfBoolean(input.calculatedAllowBackorderFlag);

    if (input.urlTitle !== undefined) {
      this.urlTitle = input.urlTitle;
    }
    if (input.productName !== undefined) {
      this.productName = input.productName;
    }
    if (input.productCode !== undefined) {
      this.productCode = input.productCode;
    }
    if (input.productDescription !== undefined) {
      this.productDescription = input.productDescription;
    }
    if (input.sortOrder !== undefined) {
      this.sortOrder = input.sortOrder;
    }

    // [model/entity/Product.cfc:L62] MONETARY and with no `default="0"`, so absence is preserved
    // rather than zeroed (E4 and the four-no-default-columns asymmetry documented on the class).
    if (input.calculatedSalePrice !== undefined) {
      this.calculatedSalePrice = input.calculatedSalePrice;
    }
    if (input.calculatedQATS !== undefined) {
      this.calculatedQATS = input.calculatedQATS;
    }
    if (input.calculatedTitle !== undefined) {
      this.calculatedTitle = input.calculatedTitle;
    }

    // [model/entity/Product.cfc:L68-L70] the three EAGER `fetch="join"` many-to-ones.
    if (input.brand !== undefined) {
      this.brand = input.brand;
    }
    if (input.productType !== undefined) {
      this.productType = input.productType;
    }
    if (input.defaultSku !== undefined) {
      this.defaultSku = input.defaultSku;
    }

    // The six LIVE collections and the two read-only projections.
    this.skus = input.skus ?? [];
    this.categories = input.categories ?? [];
    this.relatedProducts = input.relatedProducts ?? [];
    this.promotionRewards = input.promotionRewards ?? [];
    this.promotionRewardExclusions = input.promotionRewardExclusions ?? [];
    this.promotionQualifiers = input.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = input.promotionQualifierExclusions ?? [];
    this.priceGroupRates = input.priceGroupRates ?? [];

    // The option-group memo may be pre-seeded by the repository.
    if (input.optionGroups !== undefined) {
      this.optionGroups = input.optionGroups;
    }

    if (input.remoteID !== undefined) {
      this.remoteID = input.remoteID;
    }
    if (input.createdDateTime !== undefined) {
      this.createdDateTime = input.createdDateTime;
    }
    if (input.createdByAccountID !== undefined) {
      this.createdByAccountID = input.createdByAccountID;
    }
    if (input.modifiedDateTime !== undefined) {
      this.modifiedDateTime = input.modifiedDateTime;
    }
    if (input.modifiedByAccountID !== undefined) {
      this.modifiedByAccountID = input.modifiedByAccountID;
    }

    if (input.price !== undefined) {
      this.price = input.price;
    }
    if (input.salePriceDetailsForSkus !== undefined) {
      this.salePriceDetailsForSkus = input.salePriceDetailsForSkus;
    }
    if (input.nextOptionGroupSortOrder !== undefined) {
      this.nextOptionGroupSortOrder = input.nextOptionGroupSortOrder;
    }

    if (input.settingsProvider !== undefined) {
      this.settingsProvider = input.settingsProvider;
    }
    if (input.productTitleTemplate !== undefined) {
      this.productTitleTemplate = input.productTitleTemplate;
    }
    if (input.skuRepository !== undefined) {
      this.skuRepository = input.skuRepository;
    }
    if (input.optionRepository !== undefined) {
      this.optionRepository = input.optionRepository;
    }
    if (input.productRepository !== undefined) {
      this.productRepository = input.productRepository;
    }
    if (input.subscriptionTermProvider !== undefined) {
      this.subscriptionTermProvider = input.subscriptionTermProvider;
    }
    if (input.salePriceResolver !== undefined) {
      this.salePriceResolver = input.salePriceResolver;
    }
  }

  /**
   * The uniform refusal for a collaborator that hydration failed to supply.
   *
   * Matched verbatim in shape to src/domain/entities/sku.ts's helper of the same name, so the two
   * largest entities in the folder fail identically.
   */
  private missingCollaborator(collaborator: string, locator: string): Error {
    return new Error(
      `Product '${this.productID}': the ${collaborator} collaborator was not injected, so ` +
        `[model/entity/Product.cfc:${locator}] cannot be evaluated. Repositories own hydration ` +
        `and must supply it.`,
    );
  }

  // Generated persistent-property accessors.
  //
  // Hibernate generated these; they are authored explicitly because TypeScript must not emulate
  // dynamic dispatch (prohibition 11) - no `Proxy`, no index signature, no `variables.` emulation.

  /**
   * [model/entity/Product.cfc:L52] `''` when unsaved - see {@link Product.isNew}.
   */
  public getProductID(): string {
    return this.productID;
  }
  public getActiveFlag(): boolean {
    return this.activeFlag;
  }

  /**
   * [model/entity/Product.cfc:L54] Read by {@link Product.getProductURL} as `getURLTitle()`.
   */
  public getUrlTitle(): string | undefined {
    return this.urlTitle;
  }
  public getProductName(): string | undefined {
    return this.productName;
  }
  public getProductCode(): string | undefined {
    return this.productCode;
  }
  public getProductDescription(): string | undefined {
    return this.productDescription;
  }
  public getPublishedFlag(): boolean {
    return this.publishedFlag;
  }
  public getSortOrder(): number | undefined {
    return this.sortOrder;
  }

  /**
   * [model/entity/Product.cfc:L62] The persisted sale-price snapshot.
   */
  public getCalculatedSalePrice(): Money | undefined {
    return this.calculatedSalePrice;
  }

  /**
   * [model/entity/Product.cfc:L63] Snapshot of the omitted `getQATS()`.
   */
  public getCalculatedQATS(): number | undefined {
    return this.calculatedQATS;
  }

  /**
   * [model/entity/Product.cfc:L64] Snapshot of the omitted `getAllowBackorderFlag()`.
   */
  public getCalculatedAllowBackorderFlag(): boolean {
    return this.calculatedAllowBackorderFlag;
  }

  /**
   * [model/entity/Product.cfc:L65] The persisted snapshot of `getTitle()`, and not a substitute
   * for it.
   */
  public getCalculatedTitle(): string | undefined {
    return this.calculatedTitle;
  }

  /**
   * [model/entity/Product.cfc:L68] eager `fetch="join"`.
   */
  public getBrand(): Brand | undefined {
    return this.brand;
  }

  /**
   * [model/entity/Product.cfc:L69] eager `fetch="join"`.
   */
  public getProductType(): ProductType | undefined {
    return this.productType;
  }

  /**
   * [model/entity/Product.cfc:L70] eager `fetch="join"`.
   *
   * Called live by `Sku.getDefaultFlag()` in./sku.ts, which reproduces
   * [model/entity/Sku.cfc:L443]'s unconditional dereference by raising when this answers nothing.
   */
  public getDefaultSku(): Sku | undefined {
    return this.defaultSku;
  }

  /**
   * [model/entity/Product.cfc:L80] READ-ONLY projection; the source of `getCategoryIDs()`.
   */
  public getCategories(): readonly Category[] {
    return this.categories;
  }

  /**
   * [model/entity/Product.cfc:L81] read-only projection.
   */
  public getRelatedProducts(): readonly Product[] {
    return this.relatedProducts;
  }
  public getRemoteID(): string | undefined {
    return this.remoteID;
  }
  public getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/Product.cfc:L97] The opaque account identifier, not an `Account` entity.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L97]: `createdByAccount` is `cfc="Account"`, which is
   * not one of the eighteen in-scope entities, so the association collapses to its foreign key per
   * §1.5.
   */
  public getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  public getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/Product.cfc:L99] The opaque account identifier, not an `Account` entity.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L99]: `modifiedByAccount` is `cfc="Account"`, out of
   * scope, so the association collapses to its foreign key per §1.5.
   */
  public getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * Whether this instance has never been persisted.
   *
   * The empty-string test is literally what the framework does: `isNew()`
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`.
   */
  public isNew(): boolean {
    return this.productID === '';
  }

  // The error register - the framework's refusal channel.

  /**
   * The accumulated errors, keyed by error name.
   *
   * `variables.errors[arguments.errorName] = []` [org/Hibachi/HibachiErrors.cfc:L15-L19] LOOKS up
   * case-insensitively but REMEMBERS the case of the key as first written - so a later
   * `addError('URLTITLE',...)` appends to the entry `addError('urlTitle',...)` created.
   */
  private readonly errors = new Map<
    string,
    { readonly name: string; readonly messages: string[] }
  >();

  /**
   * Every error on this entity, keyed by error name.
   *
   * CFML parity [org/Hibachi/HibachiTransient.cfc:L30-L32]: a struct of arrays. Returned as a
   * frozen projection rather than the live map, so a caller reads the register and cannot corrupt
   * it - `addError` is the only writer.
   */
  public getErrors(): Readonly<Record<string, readonly string[]>> {
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
   * Whether this entity carries any error at all.
   *
   * CFML parity [org/Hibachi/HibachiTransient.cfc:L47-L53]: `structCount(getErrors())` is truthy.
   * This is the member every save site gates on
   * [org/Hibachi/HibachiService.cfc:L153; model/service/ProductService.cfc:L276, L286].
   */
  public hasErrors(): boolean {
    return this.errors.size > 0;
  }

  /**
   * Whether one named error is present.
   *
   * CFML parity [org/Hibachi/HibachiTransient.cfc:L57-L59]: `structKeyExists(getErrors(), name)`.
   * Matched without regard to case, because a CFML struct key is - see `cfFoldKey`.
   */
  public hasError(errorName: string): boolean {
    return this.errors.has(cfFoldKey(errorName));
  }

  /**
   * The messages recorded under one error name, or an empty array.
   *
   * CFML parity [org/Hibachi/HibachiTransient.cfc:L34-L43]: `getError` checks presence first and
   * "default behavior if the error isn't found is to return an empty array" - never undefined and
   * never a raise.
   */
  public getError(errorName: string): readonly string[] {
    return Object.freeze([...(this.errors.get(cfFoldKey(errorName))?.messages ?? [])]);
  }

  /**
   * Record one error against this entity.
   *
   * CFML parity [org/Hibachi/HibachiTransient.cfc:L61-L64]: two required arguments, no return, and
   * messages ACCUMULATE under one name rather than replacing.
   *
   * @param errorName the property identifier or rule name the error belongs to.
   * @param errorMessage the message, already resolved.
   */
  public addError(errorName: string, errorMessage: string): void {
    const key = cfFoldKey(errorName);
    const existing = this.errors.get(key);

    if (existing === undefined) {
      this.errors.set(key, { name: errorName, messages: [errorMessage] });
      return;
    }

    existing.messages.push(errorMessage);
  }

  // Containment probes - the six far-side contract members (§2)
  //
  // With one necessary exception - the unsaved-candidate reference fallback.

  /**
   * Called by `PriceGroupRate.addProduct` [model/entity/PriceGroupRate.cfc:L223]:
   * `if(isNew() or !arguments.product.hasPriceGroupRate( this ))`.
   */
  public hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const candidateID: string = priceGroupRate.getPriceGroupRateID();
    if (candidateID === '') {
      return this.priceGroupRates.includes(priceGroupRate);
    }
    return this.priceGroupRates.some(
      (held: PriceGroupRate) => held.getPriceGroupRateID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addProduct` [model/entity/PromotionQualifier.cfc:L204]:
   * `if(isNew() or !arguments.product.hasPromotionQualifier( this ))`. Include side
   * [model/entity/Product.cfc:L86].
   */
  public hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifiers.includes(promotionQualifier);
    }
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addExcludedProduct` [model/entity/PromotionQualifier.cfc:L304].
   * Exclude side [model/entity/Product.cfc:L87].
   */
  public hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifierExclusions.includes(promotionQualifier);
    }
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addProduct` [model/entity/PromotionReward.cfc:L262]:
   * `if(isNew() or !arguments.product.hasPromotionReward( this ))`. Include side
   * [model/entity/Product.cfc:L84].
   */
  public hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewards.includes(promotionReward);
    }
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addExcludedProduct` [model/entity/PromotionReward.cfc:L362].
   * Exclude side [model/entity/Product.cfc:L85].
   */
  public hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewardExclusions.includes(promotionReward);
    }
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `Sku.setProduct` [model/entity/Sku.cfc:L607]:
   * `if(isNew() or !arguments.product.hasSku( this ))`.
   *
   * The sixth probe, absent from the §2.1 table - see the section banner.
   */
  public hasSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.skus.includes(sku);
    }
    return this.skus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  // The five live-array accessors (§2.1 / §2.2)
  //
  // And the per-array inventory of which far-side helper pushes into and splices out of which
  // array is on the MATERIALIZED ASSOCIATIONS banner above.

  /**
   * [model/entity/Product.cfc:L88] live. Mutated by `PriceGroupRate.add/removeProduct`.
   */
  public getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * [model/entity/Product.cfc:L86] live. Mutated by `PromotionQualifier.addProduct`.
   */
  public getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * [model/entity/Product.cfc:L87] live. Mutated by `PromotionQualifier.addExcludedProduct`.
   */
  public getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  /**
   * [model/entity/Product.cfc:L84] live. Mutated by `PromotionReward.addProduct`.
   */
  public getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * [model/entity/Product.cfc:L85] live. Mutated by `PromotionReward.addExcludedProduct`.
   */
  public getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  // The title template.

  /**
   * The product's display title, rendered from the `productTitleString` template.
   *
   * `replaceStringTemplate` is ported here rather than as a shared utility, and that is a scope
   * decision, not an oversight.
   *
   * Memoized per instance, never per module, and the guard is `structKeyExists` not truthiness.
   *
   * @returns the rendered title.
   * @throws when
   */
  public getTitle(): string {
    if (this.titleRendered) {
      return this.title;
    }
    const template: string | undefined = this.productTitleTemplate;

    if (template === undefined) {
      throw this.missingCollaborator('resolved product title template', 'L542');
    }

    // CFML parity [org/Hibachi/HibachiUtilityService.cfc:L71]: reMatchNoCase("\${[^}]+}",
    // arguments.template) The character class is negated and therefore non-greedy by construction
    // `${a} ${b}` yields two markers, not one spanning both - and it cannot match an empty body.
    const markers: string[] = template.match(/\$\{[^}]+\}/g) ?? [];

    let rendered = template;

    for (const marker of markers) {
      // CFML parity [org/Hibachi/HibachiUtilityService.cfc:L80]: replace(replace(templateKeys[i],
      // "${", ""), "}", "") Two SINGLE replacements - not `replaceAll` - so only the FIRST `${`
      // and the FIRST `}` are stripped.
      const valueKey = marker.replace('${', '').replace('}', '');

      const resolved = this.resolveTitlePropertyIdentifier(valueKey);

      // Outcome 3: an unknown identifier leaves its marker in place. `undefined` means "no such
      // property", which is not the same as the empty string outcome 2 produces.
      if (resolved === undefined) {
        continue;
      }

      // CFML parity [org/Hibachi/HibachiUtilityService.cfc:L96]: `replace(..., "all")` - every
      // occurrence of the marker, which is why a template naming the same property twice renders
      // it twice.
      //
      // The replacement side does need escaping, and this is the one place the port must add
      // something the legacy had no need of.
      rendered = rendered.replaceAll(marker, resolved.replaceAll('$', '$$$$'));
    }

    this.title = rendered;
    this.titleRendered = true;

    return rendered;
  }

  /**
   * The value of one `${...}` property identifier, or `undefined` when this component declares no
   * such property.
   *
   * The identifier is folded and its delimiters are normalised, both for CFML parity.
   *
   * Every scalar is stringified the way CFML interpolates it, and the two non-string kinds are
   * called out because they are the ones a reader would assume rather than check.
   */
  private resolveTitlePropertyIdentifier(valueKey: string): string | undefined {
    const identifier = cfFoldKey(valueKey.replaceAll('_', '.'));

    switch (identifier) {
      case 'productid':
        return this.productID;
      case 'activeflag':
        return this.getActiveFlag() ? 'true' : 'false';
      case 'urltitle':
        return this.urlTitle ?? '';
      case 'productname':
        return this.productName ?? '';
      case 'productcode':
        return this.productCode ?? '';
      case 'productdescription':
        return this.productDescription ?? '';
      case 'publishedflag':
        return this.getPublishedFlag() ? 'true' : 'false';
      case 'sortorder':
        return this.sortOrder === undefined ? '' : String(this.sortOrder);

      // Declared because the legacy gate reads them as properties like any other, ORM-maintained
      // or not.
      case 'calculatedsaleprice':
        return this.calculatedSalePrice?.toDecimalString() ?? '';
      case 'calculatedqats':
        return this.calculatedQATS === undefined ? '' : String(this.calculatedQATS);
      case 'calculatedallowbackorderflag':
        return this.getCalculatedAllowBackorderFlag() ? 'true' : 'false';
      case 'calculatedtitle':
        return this.calculatedTitle ?? '';
      case 'remoteid':
        return this.remoteID ?? '';

      // the
      // default template's first marker is `${brand.brandName}`
      // [model/service/SettingService.cfc:L193].
      case 'brand.brandid':
        return this.brand?.getBrandID() ?? '';
      case 'brand.brandname':
        return this.brand?.getBrandName() ?? '';
      case 'brand.urltitle':
        return this.brand?.getUrlTitle() ?? '';
      case 'brand.brandwebsite':
        return this.brand?.getBrandWebsite() ?? '';
      case 'brand.activeflag':
        return this.brand === undefined ? '' : this.brand.getActiveFlag() ? 'true' : 'false';
      case 'brand.publishedflag':
        return this.brand === undefined ? '' : this.brand.getPublishedFlag() ? 'true' : 'false';
      case 'brand.remoteid':
        return this.brand?.getRemoteID() ?? '';
      case 'producttype.producttypeid':
        return this.productType?.getProductTypeID() ?? '';
      case 'producttype.producttypename':
        return this.productType?.getProductTypeName() ?? '';
      case 'producttype.producttypedescription':
        return this.productType?.getProductTypeDescription() ?? '';
      case 'producttype.urltitle':
        return this.productType?.getUrlTitle() ?? '';
      case 'producttype.systemcode':
        return this.productType?.getSystemCode() ?? '';
      case 'producttype.activeflag':
        return this.productType === undefined
          ? ''
          : this.productType.getActiveFlag()
            ? 'true'
            : 'false';
      case 'producttype.publishedflag':
        return this.productType === undefined
          ? ''
          : this.productType.getPublishedFlag()
            ? 'true'
            : 'false';
      case 'producttype.remoteid':
        return this.productType?.getRemoteID() ?? '';

      // only
      // the two identity scalars.
      case 'defaultsku.skuid':
        return this.defaultSku?.getSkuID() ?? '';
      case 'defaultsku.skucode':
        return this.defaultSku?.getSkuCode() ?? '';

      default:
        return undefined;
    }
  }

  // The url pair - `getProductURL()` is the only legacy-tested entity method in the subtree.

  /**
   * The product detail url - the one entity method in this whole subtree that an existing legacy
   * test pins.
   *
   * SYNCHRONOUS, because `SettingsProvider.setting()` is synchronous by design - the composition
   * root resolves every default eagerly so the domain layer never awaits a setting.
   *
   * Declared once, at [model/service/SettingService.cfc:L178], as the `defaultValue` of the
   * `globalURLKeyProduct` text setting, and the legacy entity carries no literal fallback.
   */
  public getProductURL(): string {
    if (this.settingsProvider === undefined) {
      throw this.missingCollaborator('settings provider', 'L208');
    }
    const urlKey: string = this.settingsProvider.setting('globalURLKeyProduct');
    return `/${urlKey}/${this.urlTitle ?? ''}/`;
  }

  /**
   * The same URL without the leading slash, for use inside a listing page's own path.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L211-L213]: the only difference from `getProductURL()`
   * is the absent leading slash - the trailing one is present in both.
   */
  public getListingProductURL(): string {
    if (this.settingsProvider === undefined) {
      throw this.missingCollaborator('settings provider', 'L212');
    }
    const urlKey: string = this.settingsProvider.setting('globalURLKeyProduct');
    return `${urlKey}/${this.urlTitle ?? ''}/`;
  }

  /**
   * The comma-delimited list of this product's category IDs.
   *
   * `listAppend` from `../../lib/cfml/list.js` is used rather than `Array.join`, because the
   * helper is pure and emits no leading delimiter on an empty list.
   *
   * `Category` is ported as a read-mostly leaf: its `cmsCategoryID` column (index
   * `RI_CMSCATEGORYID`) and its `site` association survive as INERT persisted columns with no CMS
   * behaviour.
   */
  public getCategoryIDs(): string {
    let categoryIDs = '';
    for (const category of this.categories) {
      categoryIDs = listAppend(categoryIDs, category.getCategoryID());
    }
    return categoryIDs;
  }

  /**
   * Preserved as throwing - the legacy body calls a method that does not exist.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L191-L197]: `getPageIDs()` iterates `getPages()`,
   * which is undeclared, so the call reaches [org/Hibachi/HibachiEntity.cfc:L559] and then throws
   * at [model/entity/Product.cfc:L565].
   * Preserved deliberately; do not fix without a product decision.
   */
  public getPageIDs(): never {
    throw new Error(
      `Product '${this.productID}': getPageIDs() cannot return. ` +
        `[model/entity/Product.cfc:L193] iterates getPages(), which is not declared on the ` +
        `component and corresponds to no property - the component declares listingPages at [L82], ` +
        `not pages. In CFML the call reaches the onMissingMethod dispatcher at ` +
        `[org/Hibachi/HibachiEntity.cfc:L507-L565], matches no name pattern, falls through to the ` +
        `getAttributeValue fallback at [L559] and terminates at the throw at [L565]. This throw is ` +
        `the faithful port of that behaviour, not a stub awaiting implementation.`,
    );
  }

  // Overridden methods [model/entity/Product.cfc:L789-L791]

  /**
   * Which property represents this product in a listing.
   */
  public getSimpleRepresentationPropertyName(): string {
    return 'productName';
  }

  // orm-generated property setters.

  /**
   * Assigns this product's URL title.
   *
   * LEGACY-NOTE: the source spells the accessor `setURLTitle`, CFML's convention for the property
   * `urlTitle` [model/entity/Product.cfc:L54].
   */
  public setUrlTitle(urlTitle: string): void {
    this.urlTitle = urlTitle;
  }

  // The remaining populate targets - the orm-generated scalar setters.
  //
  // This is not a general `populate`, and it deliberately is not.

  /**
   * [model/entity/Product.cfc:L55] The ORM-generated `setProductName()`. Populate target.
   */
  public setProductName(productName: string): void {
    this.productName = productName;
  }

  /**
   * [model/entity/Product.cfc:L56] The ORM-generated `setProductCode()`. Populate target.
   */
  public setProductCode(productCode: string): void {
    this.productCode = productCode;
  }

  /**
   * [model/entity/Product.cfc:L57] The ORM-generated `setProductDescription()`. Populate target.
   */
  public setProductDescription(productDescription: string): void {
    this.productDescription = productDescription;
  }

  /**
   * [model/entity/Product.cfc:L53] The ORM-generated `setActiveFlag()`. Populate target.
   *
   * Takes a definite `boolean`: the column declares `default="true"` and the getter already
   * resolves an absent one, so there is no third state for a caller to write.
   */
  public setActiveFlag(activeFlag: boolean): void {
    this.activeFlag = activeFlag;
  }

  /**
   * [model/entity/Product.cfc:L58] The ORM-generated `setPublishedFlag()`. Populate target.
   */
  public setPublishedFlag(publishedFlag: boolean): void {
    this.publishedFlag = publishedFlag;
  }

  /**
   * [model/entity/Product.cfc:L59] The ORM-generated `setSortOrder()`. Populate target.
   */
  public setSortOrder(sortOrder: number): void {
    this.sortOrder = sortOrder;
  }

  /**
   * [model/entity/Product.cfc:L67] The ORM-generated `setRemoteID()`. Populate target.
   */
  public setRemoteID(remoteID: string): void {
    this.remoteID = remoteID;
  }

  /**
   * Designates - or clears - this product's default SKU.
   *
   * The parameter is `Sku | undefined` because CLEARING the designation is a real operation, not
   * only setting one.
   *
   * `cascade="delete"` on the mapping is a PERSISTENCE concern and is not honoured here: assigning
   * `undefined` detaches the reference, it does not delete the previously-held sku row.
   *
   * @param defaultSku the SKU to designate, or `undefined` to clear the designation.
   */
  public setDefaultSku(defaultSku: Sku | undefined): void {
    this.defaultSku = defaultSku;
  }

  // Bidirectional helper methods [model/entity/Product.cfc:L659-L787]
  //
  // Of the thirteen pairs, SEVEN have an in-scope far side and are authored below - Brand, Sku,
  // PromotionReward, PromotionRewardExclusion, PromotionQualifier.

  // Brand (many-to-one) [model/entity/Product.cfc:L661]

  /**
   * Points this product at a brand, wiring both sides.
   *
   * `getProducts()` on the far side hands back src/domain/entities/brand.ts's LIVE array, and this
   * push mutates it.
   */
  public setBrand(brand: Brand): void {
    this.brand = brand;
    if (this.isNew() || !brand.hasProduct(this)) {
      brand.getProducts().push(this);
    }
  }

  /**
   * Detaches this product from a brand, unwiring both sides.
   *
   * `index > 0` becomes `!== -1`, and that is not a style change.
   */
  public removeBrand(brand?: Brand): void {
    const target = brand ?? this.brand;
    if (target === undefined) {
      // LEGACY-NOTE [model/entity/Product.cfc:L669-L672]: with no argument and no
      // `variables.brand`, CFML raises on `arguments.brand.getProducts()`. Raising here is the
      // faithful port.
      throw new Error(
        `Product '${this.productID}': removeBrand was called with no argument and no owning ` +
          `brand, which raises at [model/entity/Product.cfc:L672].`,
      );
    }
    const farSideProducts: Product[] = target.getProducts();
    const index = farSideProducts.findIndex(
      (held: Product) => held.getProductID() === this.productID,
    );
    if (index !== -1) {
      farSideProducts.splice(index, 1);
    }
    this.brand = undefined;
  }

  // Skus (one-to-many) [model/entity/Product.cfc:L695]

  /**
   * [model/entity/Product.cfc:L696-L698] verbatim: `arguments.sku.setProduct( this );`
   */
  public addSku(sku: Sku): void {
    sku.setProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L699-L701] verbatim: `arguments.sku.removeProduct( this );`
   */
  public removeSku(sku: Sku): void {
    sku.removeProduct(this);
  }

  // Promotion Rewards (many-to-many, inverse) [model/entity/Product.cfc:L731]

  /**
   * [model/entity/Product.cfc:L732-L734]: `arguments.promotionReward.addProduct( this );`
   */
  public addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L735-L737]: `arguments.promotionReward.removeProduct( this );`
   */
  public removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeProduct(this);
  }

  // Promotion Reward Exclusions (many-to-many, inverse) [model/entity/Product.cfc:L739]

  /**
   * [model/entity/Product.cfc:L740-L742] `promotionReward.addExcludedProduct( this )`.
   */
  public addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L743-L745]: `...removeExcludedProduct( this );`
   */
  public removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedProduct(this);
  }

  // Promotion Qualifiers (many-to-many, inverse) [model/entity/Product.cfc:L747]

  /**
   * [model/entity/Product.cfc:L748-L750]: `arguments.promotionQualifier.addProduct( this );`
   */
  public addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L751-L753]: `arguments.promotionQualifier.removeProduct( this );`
   */
  public removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeProduct(this);
  }

  // Promotion Qualifier Exclusions (many-to-many, inverse) [model/entity/Product.cfc:L755]

  /**
   * [model/entity/Product.cfc:L756-L758]: `...addExcludedProduct( this );`
   */
  public addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L759-L761]: `...removeExcludedProduct( this );`
   */
  public removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedProduct(this);
  }

  // Price Group Rates (many-to-many, inverse) [model/entity/Product.cfc:L763]

  /**
   * [model/entity/Product.cfc:L764-L766]: `arguments.priceGroupRate.addProduct( this );`
   */
  public addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.addProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L767-L769]: `arguments.priceGroupRate.removeProduct( this );`
   */
  public removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removeProduct(this);
  }

  // The option-group memo trio [model/entity/Product.cfc:L241-L265]
  //
  // These three feed the live validation path and therefore cannot be omitted:
  // `model/validation/Product.json` requires `unusedProductOptions` and
  // `unusedProductOptionGroups` with `minCollection:1` in the `addOption` and `addOptionGroup`
  // contexts.

  /**
   * This product's option groups, ordered by `sortOrder` ascending.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L253]: SEED-THEN-OVERWRITE WART.
   * `variables.optionGroups = []` is DEAD - [model/entity/Product.cfc:L258] reassigns
   * unconditionally on the next executable line, so the empty array can never be observed.
   */
  public getOptionGroups(): readonly OptionGroup[] {
    // The `!structKeyExists(variables, "optionGroups")` probe at [model/entity/Product.cfc:L252]
    // distinguishes "hydration materialized this association, possibly as empty" from "hydration
    // never materialized it at all".
    if (this.optionGroups === undefined) {
      throw new Error(
        `Product '${this.productID}': getOptionGroups() requires its option groups to have been ` +
          `materialized during hydration. [model/entity/Product.cfc:L254-L258] resolves them ` +
          `through a HibachiSmartList - DISTINCT, filtered on options.skus.product.productID, ` +
          `ordered by sortOrder ASC - which is deliberately not cloned, and no declared port member ` +
          `serves the query. Answering an empty array instead would silently satisfy the ` +
          `minCollection:1 rules in model/validation/Product.json that read through this value.`,
      );
    }
    return this.optionGroups;
  }

  /**
   * The same option groups, keyed by `optionGroupID`.
   *
   * The return is `CfStruct<OptionGroup>`, not `Record<string, OptionGroup>`, and the difference
   * is correctness: CFML struct keys are case-insensitive and TypeScript's are not.
   */
  public getOptionGroupsStruct(): CfStruct<OptionGroup> {
    if (this.optionGroupsStruct === undefined) {
      // [model/entity/Product.cfc:L243] the accumulator, then [model/entity/Product.cfc:L244-L246]
      // the loop. Built as a mutable record and published through the readonly `CfStruct` alias,
      // so no caller can write into the memo.
      const accumulator: Record<string, OptionGroup> = {};
      for (const optionGroup of this.getOptionGroups()) {
        // `putOwnStructKey`, not `accumulator[id] = optionGroup`: the key is a persisted
        // identifier column, so it can be `__proto__` and a plain assignment would drop it.
        putOwnStructKey(accumulator, optionGroup.getOptionGroupID(), optionGroup);
      }
      this.optionGroupsStruct = accumulator;
    }
    return this.optionGroupsStruct;
  }

  /**
   * How many option groups this product has.
   */
  public getOptionGroupCount(): number {
    return this.getOptionGroups().length;
  }

  // must-preserve behaviour - option-to-sku resolution [model/entity/Product.cfc:L340-L368]
  //
  // One of the three areas the plan names as behaviour that must survive unchanged.

  /**
   * The options of one option group that this product's SKUs actually carry.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L345]: `sortOrder` on `Option` is
   * `sortContext="optionGroup"` - ordered within an option group, exactly the scope this method
   * filters to, so a plain ascending sort reproduces the intended order.
   */
  public getOptionsByOptionGroup(optionGroupID: string): readonly Option[] {
    const seen = new Set<string>();
    const matches: Option[] = [];

    for (const sku of this.skus) {
      for (const option of sku.getOptions()) {
        const group = option.getOptionGroup();
        if (group === undefined || group.getOptionGroupID() !== optionGroupID) {
          continue;
        }
        const optionID = option.getOptionID();
        if (seen.has(optionID)) {
          continue;
        }
        seen.add(optionID);
        matches.push(option);
      }
    }

    // [model/entity/Product.cfc:L345] `addOrder("sortOrder|ASC")`. MySQL sorts `NULL` FIRST on an
    // ascending order, so an option with no sort order precedes every option that has one.
    matches.sort((left: Option, right: Option) => {
      const leftOrder = left.getSortOrder();
      const rightOrder = right.getSortOrder();
      if (leftOrder === undefined && rightOrder === undefined) {
        return 0;
      }
      if (leftOrder === undefined) {
        return -1;
      }
      if (rightOrder === undefined) {
        return 1;
      }
      return leftOrder - rightOrder;
    });

    return matches;
  }

  /**
   * MUST-PRESERVE. The single SKU identified by a comma-delimited list of selected option IDs.
   *
   * Why the return type is `Sku | undefined` when every visible branch returns or throws.
   */
  public async getSkuBySelectedOptions(selectedOptions = ''): Promise<Sku | undefined> {
    // [model/entity/Product.cfc:L350] `if(len(arguments.selectedOptions) > 0)`.
    if (cfLen(selectedOptions) > 0) {
      // [model/entity/Product.cfc:L351] - the delegate, which is where the AND-of-EXISTS SQL is
      // reached.
      const skus: Sku[] = await this.getSkusBySelectedOptions(selectedOptions);
      if (skus.length === 1) {
        return skus[0];
      }
      if (skus.length > 1) {
        throw new Error(
          `More than one sku is returned when the selected options are: ${selectedOptions}`,
        );
      }
      if (skus.length < 1) {
        throw new Error(`No Skus are found for these selected options: ${selectedOptions}`);
      }
      // [model/entity/Product.cfc:L358] the chain closes here with no `else`. Unreachable, and
      // deliberately not closed.
      return undefined;
    }

    // [model/entity/Product.cfc:L359-L360] no options submitted, but a single-sku product needs
    // none.
    const ownSkus: Sku[] = this.getSkus();
    if (ownSkus.length === 1) {
      return ownSkus[0];
    }

    // [model/entity/Product.cfc:L361-L363] - misspellings preserved verbatim.
    throw new Error(
      'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
    );
  }

  /**
   * MUST-PRESERVE. Every SKU of this product that carries all of the selected options.
   *
   * The empty-string default is reproduced and is not short-circuited.
   */
  public async getSkusBySelectedOptions(selectedOptions = ''): Promise<Sku[]> {
    if (this.skuRepository === undefined) {
      throw this.missingCollaborator('sku repository', 'L367');
    }
    return this.skuRepository.getSkusBySelectedOptions(selectedOptions, this.productID);
  }

  // The sku and price accessor cluster - money-critical
  // [model/entity/Product.cfc:L155-L187, L555-L601]
  //
  // Every monetary return in this cluster is `Money`, never `number`.

  /**
   * This product's SKUs - LIVE on the default call, a projection when either flag is set.
   *
   * The unflagged call returns the live array, exactly as [model/entity/Product.cfc:L157] returns
   * `variables.skus` itself; the flagged calls return a new array, exactly as
   * [model/entity/Product.cfc:L159] returns the service's result.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L232-L238]: the legacy sort is unsafe and the port
   * is not.
   */
  public getSkus(sorted = false, fetchOptions = false): Sku[] {
    // [model/entity/Product.cfc:L156-L158] the unflagged fast path - the LIVE ARRAY, by reference.
    if (!sorted && !fetchOptions) {
      return this.skus;
    }

    // [model/entity/Product.cfc:L159] the delegating path. A NEW array in the legacy, and a new
    // array here.
    const projection: Sku[] = [...this.skus];

    // [model/service/SkuService.cfc:L223] - the three-clause guard, verbatim in order. The third
    // clause deliberately probes only the FIRST element.
    const firstSku = projection.length > 0 ? projection[0] : undefined;
    const firstSkuHasOptions = firstSku !== undefined && firstSku.getOptions().length > 0;
    if (!sorted || projection.length <= 1 || !firstSkuHasOptions) {
      return projection;
    }

    // [model/dao/SkuDAO.cfc:L172-L202] - the positional weighting.
    const radixCeiling = this.nextOptionGroupSortOrder;
    if (radixCeiling === undefined) {
      return projection;
    }

    const weights = new Map<string, number>();
    for (const sku of projection) {
      let weight = 0;
      for (const option of sku.getOptions()) {
        const optionSortOrder = option.getSortOrder();
        const group = option.getOptionGroup();
        if (optionSortOrder === undefined || group === undefined) {
          // A term the SQL could not have contributed either: `SwOption.sortOrder` is NULLable and
          // `SUM` skips NULL products, and the inner join drops an option with no group.
          continue;
        }
        weight += optionSortOrder * Math.pow(10, radixCeiling - group.getSortOrder());
      }
      weights.set(sku.getSkuID(), weight);
    }

    projection.sort((left: Sku, right: Sku) => {
      const leftWeight = weights.get(left.getSkuID()) ?? 0;
      const rightWeight = weights.get(right.getSkuID()) ?? 0;
      return leftWeight - rightWeight;
    });

    return projection;
  }

  /**
   * One of this product's SKUs by id, or nothing.
   *
   * [model/entity/Product.cfc:L163] calls `getSkus()` UNFLAGGED, so the search runs over the live
   * array in insertion order.
   *
   * [model/entity/Product.cfc:L164] is `skus[i].getSkuID() == arguments.skuID`, which matched a
   * caller identifier spelled in another case; `===` did not, and answered `undefined` for a SKU
   * this product genuinely owns.
   */
  public getSkuByID(skuID: string): Sku | undefined {
    for (const sku of this.getSkus()) {
      if (cfEquals(sku.getSkuID(), skuID)) {
        return sku;
      }
    }
    return undefined;
  }

  /**
   * The winning sale-price detail row for one of this product's SKUs, or nothing.
   *
   * [model/entity/Product.cfc:L182-L187] probes `getSalePriceDetailsForSkus()` for the key,
   * returns the entry when present, and returns `{}` otherwise.
   *
   * `{}` BECOMES `undefined`, safely rather than conveniently: every legacy reader tests for its
   * key first - [model/entity/Sku.cfc:L547] and [model/entity/Product.cfc:L554] both guard with
   * `structKeyExists`.
   */
  public async getSkuSalePriceDetails(skuID: string): Promise<SalePriceDetail | undefined> {
    if (this.salePriceDetailsForSkus === undefined && this.salePriceResolver === undefined) {
      return undefined;
    }
    const details = await this.getSalePriceDetailsForSkus();
    // [model/entity/Product.cfc:L183] the containment probe, then [model/entity/Product.cfc:L184]
    // the read. Both case-insensitive, as CFML's are.
    if (!structKeyExists(details, skuID)) {
      // [model/entity/Product.cfc:L186] `return {};` - absent, which every caller already treats
      // as "no sale price".
      return undefined;
    }
    return structGet(details, skuID);
  }

  /**
   * Every SKU's winning sale-price detail for this product, keyed by SKU identifier, memoized.
   *
   * @returns The reduced, rounded detail map.
   * @throws When hydration supplied neither the pre-reduced map nor the resolver - the uniform
   * refusal, because a defaulted empty map here would read as "this product is on no promotion".
   */
  public async getSalePriceDetailsForSkus(): Promise<CfStruct<SalePriceDetail>> {
    // [model/entity/Product.cfc:L518] `if(!structKeyExists(variables, "salePriceDetailsForSkus"))`
    // the memo probe, which in the target is also the test of whether hydration pre-seeded the
    // map.
    if (this.salePriceDetailsForSkus === undefined) {
      if (this.salePriceResolver === undefined) {
        throw this.missingCollaborator('sale-price resolver', 'L519');
      }
      // [model/entity/Product.cfc:L519] the T2 reach, memoized into the same slot the source
      // memoizes into.
      this.salePriceDetailsForSkus = await this.salePriceResolver.getSalePriceDetailsForProductSkus(
        this.productID,
      );
    }
    // [model/entity/Product.cfc:L521] `return variables.salePriceDetailsForSkus;`
    return this.salePriceDetailsForSkus;
  }

  // Delegating price accessors [model/entity/Product.cfc:L555-L601]

  /**
   * The currency code of this product's default SKU, or nothing.
   *
   * This method reads no setting - it delegates, full stop.
   *
   * `string` where present, not the branded `CurrencyCode` - that is the SKU's decision, matched
   * rather than re-decided, which is why `../valueObjects/currencyCode.js` is not imported here.
   */
  public getCurrencyCode(): string | undefined {
    // [model/entity/Product.cfc:L556] lazy-load probe on `defaultSku`; statically true once
    // hydration materialized it.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getCurrencyCode();
  }

  /**
   * This product's price - the override slot first, then the default SKU.
   */
  public getPrice(): Money | undefined {
    // [model/entity/Product.cfc:L562] PROBE 3 of 11 - the override slot. Checked FIRST,
    // deliberately.
    if (this.price !== undefined) {
      return this.price;
    }
    // [model/entity/Product.cfc:L565] PROBE 4 of 11 - the default SKU. `Sku.getPrice()` is `Money`
    // (its column declares `default="0"`), so the only source of `undefined` here is an
    // unmaterialized default SKU.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getPrice();
  }

  /**
   * The default SKU's renewal price, or nothing.
   */
  public getRenewalPrice(): Money | undefined {
    // [model/entity/Product.cfc:L571] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getRenewalPrice();
  }

  /**
   * The default SKU's list price, or nothing.
   */
  public getListPrice(): Money | undefined {
    // [model/entity/Product.cfc:L577] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getListPrice();
  }

  /**
   * The default SKU's live price, or nothing.
   *
   * `async`, because `Sku.getLivePrice()` is async - it resolves through the price-group path.
   */
  public async getLivePrice(): Promise<Money | undefined> {
    // [model/entity/Product.cfc:L583] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getLivePrice();
  }

  /**
   * The default SKU's price for the requesting account, or nothing.
   *
   * Chain ends in `PriceGroupService.calculateSkuPriceBasedOnCurrentAccount`
   * [model/service/PriceGroupService.cfc:L262-L268], which reaches the request scope through
   * `getSlatwallScope()` - the one anomalous scope accessor in the codebase.
   */
  public async getCurrentAccountPrice(): Promise<Money | undefined> {
    // [model/entity/Product.cfc:L589] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getCurrentAccountPrice();
  }

  // The defect cluster.
  //
  // Plus two methods preserved as throwing that carry no defect number, and one memo variant that
  // exists only to be contrasted with DEFECT.

  /**
   * DELIBERATE DIVERGENCE [model/entity/Product.cfc:L524-L532]: the memo poisoning is repaired
   * rather than reproduced.
   *
   * Why this one is repaired and defect 20 is not: the defect is a poisoned memo, not a different
   * answer.
   *
   * MEMO VARIANT A (seed then guard), and the only variant-A member here whose seed was reachable
   * through a bug rather than by design.
   */
  public getBrandName(): string {
    // [model/entity/Product.cfc:L525] the memo guard. This is a MEMO probe, not one of the eleven
    // lazy-load probes.
    if (this.brandName === undefined) {
      // [model/entity/Product.cfc:L526] the seed. It survives when the brand is absent, which is
      // legitimate and preserved.
      this.brandName = '';
      // [model/entity/Product.cfc:L527] PROBE 1 of 11 - lazy-load probe on `brand`; statically
      // true once hydration materialized the eager `fetch="join"` association at
      // [model/entity/Product.cfc:L68].
      if (this.brand !== undefined) {
        // The FIX. [model/entity/Product.cfc:L528] reads `return getBrand().getBrandName();` -
        // computing the value and returning it without the assignment.
        this.brandName = this.brand.getBrandName() ?? '';
      }
    }
    return this.brandName;
  }

  /**
   * This product's sale price, or zero.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L598]: the second branch evaluates
   * `getSkus()[1].getSalePrice()` without returning it, so the method falls through to
   * `return 0` for every product that has skus but no default sku.
   * Preserved deliberately; do not fix without a product decision.
   *
   * `Money.fromDecimalString('0')` rather than `Money.zero`, because that constant carries an
   * explicit prohibition on its own declaration.
   */
  public getSalePrice(): Money {
    // [model/entity/Product.cfc:L595] probe 9 of 11 - lazy-load probe on `defaultSku`.
    if (this.defaultSku !== undefined) {
      // [model/entity/Product.cfc:L596] the only arm that returns a real sale price.
      // `Sku.getSalePrice()` is `Money`, never undefined, because it falls back to `getPrice()`
      // whose column declares `default="0"`.
      return this.defaultSku.getSalePrice();
    }

    // [model/entity/Product.cfc:L597] `else if (arrayLen(getSkus()))` - CFML numeric truthiness on
    // an array length, so a non-empty array enters the branch.
    const ownSkus: Sku[] = this.getSkus();
    if (cfTruthy(ownSkus.length)) {
      const firstSku = ownSkus[0];
      if (firstSku !== undefined) {
        // [model/entity/Product.cfc:L598] the DISCARDED CALL. Evaluated for its observable effects
        // and its result thrown away, exactly as the source does.
        void firstSku.getSalePrice();
      }
    }

    // [model/entity/Product.cfc:L600] the terminal zero - reached by both the
    // no-default-sku-with-skus path and the nothing-at-all path.
    return Money.fromDecimalString('0');
  }

  /**
   * The discount type behind this product's sale price, or the string `"none"`.
   *
   * `"none"` is the product-level stand-in, and it differs from the sku-level one.
   */
  public getSalePriceDiscountType(): string {
    // [model/entity/Product.cfc:L605] memo guard.
    if (this.salePriceDiscountType === undefined) {
      // [model/entity/Product.cfc:L606] the seed, which survives a missing default SKU.
      this.salePriceDiscountType = 'none';
      // [model/entity/Product.cfc:L607] probe 10 of 11 - lazy-load probe on `defaultSku`.
      if (this.defaultSku !== undefined) {
        // [model/entity/Product.cfc:L608] the assignment defect 19 is missing.
        this.salePriceDiscountType = this.defaultSku.getSalePriceDiscountType();
      }
    }
    return this.salePriceDiscountType;
  }

  /**
   * Defect 25 - preserved as a throw. dual-mode in CFML, single-mode in the port.
   */
  public getSalePriceExpirationDateTime(): never {
    throw new Error(
      `Product '${this.productID}': getSalePriceExpirationDateTime() cannot return. ` +
        `[model/entity/Product.cfc:L617] guards on lazy-load state, which eager materialization ` +
        `makes always true, so [model/entity/Product.cfc:L618] is always reached - and it calls the ` +
        `MISSPELLED getSalePricExpirationDateTime (no "e" in "Price"), which Sku does not declare; ` +
        `its correct spelling is at [model/entity/Sku.cfc:L560]. In CFML that call reaches the ` +
        `onMissingMethod dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565], matches ` +
        `get<Prop> against a nonexistent property, falls through to the getAttributeValue fallback ` +
        `at [L559] and throws at [L565]; and the returntype="date" coercion declared at ` +
        `[model/entity/Product.cfc:L614] could not be satisfied by that fallback either. This ` +
        `throw reproduces the arm the port always takes; it is not a stub awaiting implementation.`,
    );
  }

  /**
   * Preserved as throwing - the legacy body calls an undefined function.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L631-L633]: `getProductOptionsByGroup()` calls
   * `getProductService()`, which is not a method on this component or its bases, so the call
   * reaches [org/Hibachi/HibachiEntity.cfc:L559] and throws at [model/entity/Product.cfc:L565].
   * Preserved deliberately; do not fix without a product decision.
   */
  public getProductOptionsByGroup(): never {
    throw new Error(
      `Product '${this.productID}': getProductOptionsByGroup() cannot return. ` +
        `[model/entity/Product.cfc:L632] calls getProductService(), which is not declared on the ` +
        `component, on model/entity/HibachiEntity.cfc, or as a generated accessor - every other ` +
        `outward reach in the component uses getService("..."). In CFML the call reaches the ` +
        `onMissingMethod dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565], matches get<Prop> ` +
        `against a nonexistent ProductService property, falls through to the getAttributeValue ` +
        `fallback at [L559] and throws at [L565]. ProductService declares no ` +
        `getProductOptionsByGroup method either, so the intended target does not exist. This throw ` +
        `is the faithful port, not a stub awaiting implementation.`,
    );
  }

  // The unused-* trio - a live validation path [model/entity/Product.cfc:L635-L654]
  //
  // So none may be omitted, even though the third serves an out-of-scope subsystem: a validation
  // rule pointing at an absent accessor is a broken contract, not a tidy one.
  //
  // All three pass the option-group IDS as a comma-delimited string.

  /**
   * The option-group id list the unused-* queries filter against. Reproduces
   * `structKeyList(getOptionGroupsStruct())` as it appears at [model/entity/Product.cfc:L637] and
   * [model/entity/Product.cfc:L644].
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L637, L644]: CFML struct key order is unordered while
   * `Object.keys` returns insertion order, so the two implementations can emit the same ids in a
   * different sequence.
   */
  private buildExistingOptionGroupIDList(): string {
    let existingOptionGroupIDList = '';
    for (const optionGroupID of structKeyList(this.getOptionGroupsStruct())) {
      existingOptionGroupIDList = listAppend(existingOptionGroupIDList, optionGroupID);
    }
    return existingOptionGroupIDList;
  }

  /**
   * Options not yet used by this product, for the `addOption` form.
   * [model/entity/Product.cfc:L635-L640].
   *
   * Two positional arguments, in the legacy order: the product id first, the option-group id list
   * second.
   */
  public async getUnusedProductOptions(): Promise<readonly SelectOption[]> {
    // [model/entity/Product.cfc:L636] memo probe. VARIANT C: no seed to fall back on, so a failed
    // reach must raise rather than answer an empty array - `minCollection:1` would otherwise fail
    // for the wrong reason.
    if (this.unusedProductOptions === undefined) {
      if (this.optionRepository === undefined) {
        throw this.missingCollaborator('option repository', 'L637');
      }
      // [model/entity/Product.cfc:L637] - two positional arguments, legacy order preserved.
      this.unusedProductOptions = await this.optionRepository.getUnusedProductOptions(
        this.productID,
        this.buildExistingOptionGroupIDList(),
      );
    }
    return this.unusedProductOptions;
  }

  /**
   * Option groups not yet used by this product, for the `addOptionGroup` form.
   * [model/entity/Product.cfc:L642-L647].
   *
   * One argument, not two - the asymmetry between the two sibling methods.
   */
  public async getUnusedProductOptionGroups(): Promise<readonly SelectOption[]> {
    // [model/entity/Product.cfc:L643] memo probe. Variant c.
    if (this.unusedProductOptionGroups === undefined) {
      if (this.optionRepository === undefined) {
        throw this.missingCollaborator('option repository', 'L644');
      }
      // [model/entity/Product.cfc:L644] - one argument.
      this.unusedProductOptionGroups = await this.optionRepository.getUnusedProductOptionGroups(
        this.buildExistingOptionGroupIDList(),
      );
    }
    return this.unusedProductOptionGroups;
  }

  /**
   * Subscription terms not yet used by this product, for the `addSubscriptionTerm` form.
   * [model/entity/Product.cfc:L649-L654].
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L76]: the out-of-scope `productReviews` collection
   * declares `singlularname="productReview"`, misspelled in the source. Quoted rather than
   * corrected: the attribute value is ORM metadata the legacy admin still resolves.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L649-L654]: subscription is out of scope.
   */
  public async getUnusedProductSubscriptionTerms(): Promise<never> {
    // The `async` keyword is load-bearing here, and the `await` is what keeps it legal - the
    // opposite treatment from `getSkuSalePriceDetails` above, deliberately.
    await Promise.resolve();
    throw new Error(
      `Product '${this.productID}': getUnusedProductSubscriptionTerms() is not available in this ` +
        `slice. [model/entity/Product.cfc:L651] reaches ` +
        `subscriptionService.getUnusedProductSubscriptionTerms(productID), and subscription is out ` +
        `of scope: ../ports/subscriptionTermProvider.js declares only getSubscriptionTerm and ` +
        `getSubscriptionBenefit and documents this method as deliberately not declared, so there is ` +
        `no port member to delegate to and none may be invented. The accessor exists because ` +
        `model/validation/Product.json requires unusedProductSubscriptionTerms with ` +
        `minCollection:1 in the addSubscriptionTerm context; it refuses rather than returning an ` +
        `empty array, which would fail that rule for the wrong reason. ` +
        `A subscription term provider was ` +
        `${this.subscriptionTermProvider === undefined ? 'not wired' : 'wired'} on this instance.`,
    );
  }

  // Remaining outward reaches.

  /**
   * Whether any transaction already references one of this product's SKUs.
   * [model/entity/Product.cfc:L624-L629].
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L626]: the legacy writes `this.getProductID()` with an
   * explicit `this.` scope where the surrounding methods write the bare `getProductID()`, as do
   * [model/entity/Product.cfc:L256] and [model/entity/Product.cfc:L344]. Both resolve identically
   * in CFML.
   */
  public async getTransactionExistsFlag(): Promise<boolean> {
    // [model/entity/Product.cfc:L625] memo probe. Variant c.
    if (this.transactionExistsFlag === undefined) {
      if (this.skuRepository === undefined) {
        throw this.missingCollaborator('sku repository', 'L626');
      }
      // [model/entity/Product.cfc:L626] - `productID` only; `skuID` deliberately not supplied.
      this.transactionExistsFlag = await this.skuRepository.getTransactionExistsFlag(
        this.productID,
      );
    }
    return this.transactionExistsFlag;
  }

  /**
   * This product's base product type - the root of its product-type path.
   * [model/entity/Product.cfc:L493-L495].
   *
   * The legacy dereferences [model/entity/Product.cfc:L494] unconditionally - no `isNull` guard,
   * no `structKeyExists` probe - so a product with no product type raises there.
   */
  public async getBaseProductType(): Promise<string | undefined> {
    if (this.productType === undefined) {
      throw new Error(
        `Product '${this.productID}': getBaseProductType() requires the product type, which ` +
          `[model/entity/Product.cfc:L494] dereferences unconditionally.`,
      );
    }
    return this.productType.getBaseProductType();
  }

  /**
   * Attribute sets assigned to this product, optionally narrowed by attribute-set type code.
   * [model/entity/Product.cfc:L832-L838], inside the `Deprecated Methods` section
   * [model/entity/Product.cfc:L830]-[model/entity/Product.cfc:L840].
   *
   * This is the one ported route into the attribute subsystem; the `attributeValues` eav read path
   * is not ported (see the omission register).
   */
  public async getAttributeSets(
    attributeSetTypeCode: readonly string[] = [],
  ): Promise<AttributeSetSummary[]> {
    if (this.productRepository === undefined) {
      throw this.missingCollaborator('product repository', 'L833');
    }

    // [model/entity/Product.cfc:L801] the fixed base filter, then
    // [model/entity/Product.cfc:L834-L836] the conditional addition. `includes` rather than an
    // index test - see the index-base note above.
    const effectiveTypeCodes: string[] = ['astProduct'];
    if (
      attributeSetTypeCode.includes('astProductCustomization') ||
      attributeSetTypeCode.includes('astOrderItem')
    ) {
      effectiveTypeCodes.push('astOrderItem');
    }

    // [model/entity/Product.cfc:L810] the product-type disjunct: `productTypeIDPath` split on
    // commas.
    const productTypeIDs: readonly string[] =
      this.productType === undefined ? [] : listToArray(this.productType.getProductTypeIDPath());

    // [model/entity/Product.cfc:L837] `return smartList.getRecords();`
    return this.productRepository.getAttributeSets(effectiveTypeCodes, productTypeIDs);
  }

  // The omission register.
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L178-L180, L223-L225, L267-L339, L497-L515]: the image
  // path requires `globalAssetsImageFolderPath` [model/service/SettingService.cfc:L164], which is
  // not one of the four keys published by../ports/settingsProvider.js.
}
