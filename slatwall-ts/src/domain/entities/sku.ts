// slatwall-ts - Sku entity.
//
// Port of model/entity/Sku.cfc (916 source lines), the largest and highest-risk entity in the
// slice.
//
// Note `persistent=true accessors=true output=false` UNQUOTED, the PriceGroup/PriceGroupRate
// shape, not the quoted form the promotion cluster uses.
//
// LEGACY-NOTE [model/entity/Sku.cfc:L367-L433]: the cascade's own inputs are asynchronous in the
// target `CurrencyConverter` declares every member async yet [model/entity/Sku.cfc:L269-L285] must
// stay synchronous to preserve the accessor contract.

import { listAppend, listToArray } from '../../lib/cfml/list.js';
import { numberFormat } from '../../lib/cfml/numberFormat.js';
import { cfEquals, structGet, structGetPath, structKeyExists } from '../../lib/cfml/struct.js';
import { cfBoolean, cfLen, isNullish, type CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { CurrentAccountContext } from '../ports/priceGroupRepository.js';
import type { SettingsProvider } from '../ports/settingsProvider.js';
import type { CurrencyConverter } from '../ports/currencyConverter.js';
import type { SkuRepository } from '../ports/skuRepository.js';
import { toCurrencyCode, type CurrencyCode } from '../valueObjects/currencyCode.js';
// `Money` is a VALUE import, not type-only, for one specific reason:
// [model/entity/Sku.cfc:L55-L57] declare `listPrice`, `price` and `renewalPrice` with
// `default="0"`.
import { Money } from '../valueObjects/money.js';
import type { Option } from './option.js';
import type { OptionGroup } from './optionGroup.js';
import type { PriceGroup } from './priceGroup.js';
import type { PriceGroupRate } from './priceGroupRate.js';
import type { Product } from './product.js';
import type { Promotion } from './promotion.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';
import type { SkuCurrency } from './skuCurrency.js';

/**
 * Store `value` on `target` under `key` as an own, enumerable data property.
 *
 * CFML parity [model/entity/Sku.cfc:L504, L516, L902]: a CFML struct has no prototype chain and no
 * reserved keys, so `variables.optionsByOptionGroupCode[ '__proto__' ]` was an ordinary key
 * holding an ordinary value.
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
 * One currency's resolved prices, as the four-step cascade [model/entity/Sku.cfc:L367-L433] leaves
 * them.
 *
 * `skuCurrencyID` is required while every price is optional because
 * [model/entity/Sku.cfc:L381-L382] creates the entry and seeds `skuCurrencyID` before any price is
 * considered: the outer key exists for every eligible currency even when no price is recorded for
 * it, so only sub-keys can be absent. That asymmetry is what the three accessors at
 * [model/entity/Sku.cfc:L269-L285] test, and it is why no sub-key is ever written as `undefined` -
 * [model/entity/Sku.cfc:L416] tests `structKeyExists(entry, "price")`, so a present-but-undefined
 * price would suppress the conversion step.
 */
export type CurrencyDetail = {
  /**
   * The `SwSkuCurrency` row this entry's prices came from, or `''` when they came from the sku's
   * own columns or from a conversion. [model/entity/Sku.cfc:L382, L412] -
   * [model/entity/Sku.cfc:L412] is the cascade's only non-empty write.
   */
  readonly skuCurrencyID: string;

  /**
   * [model/entity/Sku.cfc:L394] base currency, [model/entity/Sku.cfc:L409] override row,
   * [model/entity/Sku.cfc:L425] converted.
   */
  readonly price?: Money;

  /**
   * [model/entity/Sku.cfc:L395, L410, L426]. A presentation string, never money.
   */
  readonly priceFormatted?: string;

  /**
   * [model/entity/Sku.cfc:L391] base currency, [model/entity/Sku.cfc:L406] override row,
   * [model/entity/Sku.cfc:L422] converted.
   */
  readonly listPrice?: Money;

  /**
   * [model/entity/Sku.cfc:L392, L407, L423].
   */
  readonly listPriceFormatted?: string;

  /**
   * [model/entity/Sku.cfc:L387] base currency, [model/entity/Sku.cfc:L402] override row,
   * [model/entity/Sku.cfc:L418] converted.
   */
  readonly renewalPrice?: Money;

  /**
   * [model/entity/Sku.cfc:L388, L403, L419].
   */
  readonly renewalPriceFormatted?: string;

  /**
   * `false` when the price came from the sku's own columns [model/entity/Sku.cfc:L396] or from an
   * override row [model/entity/Sku.cfc:L411]; `true` when converted [model/entity/Sku.cfc:L427].
   */
  readonly converted?: boolean;
};

/**
 * The three money sub-keys of a {@link CurrencyDetail}, and nothing else.
 */
export type CurrencyDetailMoneyView = {
  readonly price?: Money;
  readonly listPrice?: Money;
  readonly renewalPrice?: Money;
};

/**
 * The cascade inputs that are the same for every sku, resolved once.
 *
 * This is an explicitness decision, not a performance one (B7).
 *
 * A discriminated union rather than optional members, because the gate at
 * [model/entity/Sku.cfc:L373] is genuinely binary and the members below are meaningful only on one
 * side of it.
 */
export type SkuCurrencyCascadeContext =
  | {
      /**
       * [model/entity/Sku.cfc:L373] `len(setting('skuEligibleCurrencies'))` was empty, so
       * [model/entity/Sku.cfc:L375]-[model/entity/Sku.cfc:L429] never run and the memo stays `{}`.
       */
      readonly eligibilityGateOpen: false;
    }
  | {
      readonly eligibilityGateOpen: true;

      /**
       * [model/entity/Sku.cfc:L385] the raw `skuCurrency` setting, compared case-insensitively
       * against each eligible code in step 1.
       */
      readonly skuCurrencySetting: string;

      /**
       * [model/entity/Sku.cfc:L418, L422, L425] the conversion SOURCE, branded once.
       */
      readonly baseCurrencyCode: CurrencyCode;

      /**
       * [model/entity/Sku.cfc:L371]+[model/entity/Sku.cfc:L375]+[model/entity/Sku.cfc:L377] the
       * eligible currency codes, in the order the listing returned them.
       */
      readonly eligibleCurrencies: readonly CurrencyCode[];

      /**
       * [model/entity/Sku.cfc:L425] the one cascade collaborator that cannot be hoisted, because
       * each call converts this sku's own price.
       *
       * LEGACY-NOTE [model/entity/Sku.cfc:L418, L422, L425]: the legacy makes the same three
       * per-currency conversion calls, against the same three columns, for every sku. Reproducing
       * them is required (B2).
       */
      readonly currencyConverter: CurrencyConverter;
    };

/**
 * The price-group collaborator this entity reaches at [model/entity/Sku.cfc:L262],
 * [model/entity/Sku.cfc:L266] and [model/entity/Sku.cfc:L437].
 *
 * LEGACY-NOTE [model/service/PriceGroupService.cfc:L140, L301, L262]: the three members below
 * belong to the price-group SERVICE surface. Recorded rather than added to the port: this file
 * does not own that port.
 */
export interface SkuPriceGroupResolver {
  calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money;
  getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined;

  /**
   * [model/entity/Sku.cfc:L437] -> `model/service/PriceGroupService.cfc:L262`. Async because the
   * legacy body reaches the account subscription price-group query.
   */
  calculateSkuPriceBasedOnCurrentAccount(sku: Sku, context: CurrentAccountContext): Promise<Money>;
}

/**
 * The sale-price detail row `getSalePriceDetails()` [model/entity/Sku.cfc:L539-L544] resolves,
 * derived from `Product`'s declared return type rather than re-declared.
 */
export type SkuSalePriceDetails = Awaited<ReturnType<Product['getSkuSalePriceDetails']>>;

/**
 * The resize arguments the image methods accept. Every member is optional because every one is
 * tested with `structKeyExists` before being read [model/entity/Sku.cfc:L159-L187, L198-L216].
 */
export type SkuImageResizeOptions = {
  readonly size?: string;
  readonly width?: number;
  readonly height?: number;
  readonly alt?: string;
  readonly resizeMethod?: string;
  readonly missingImagePath?: string;
};

/**
 * The three ALREADY-RESOLVED ambient values the two portable image members need.
 *
 * Every member is REQUIRED once the object exists, because a half-resolved set cannot compose
 * either string and an absent set is already expressible.
 */
export type SkuImageSettingValues = {
  /**
   * `getHibachiScope().getBaseImageURL()` as read at [model/entity/Sku.cfc:L146], already resolved
   * to URL form.
   */
  readonly baseImageURL: string;

  /**
   * `setting('productImageOptionCodeDelimiter')` as read at [model/entity/Sku.cfc:L135].
   */
  readonly productImageOptionCodeDelimiter: string;

  /**
   * `setting('productImageDefaultExtension')` as read at [model/entity/Sku.cfc:L138].
   */
  readonly productImageDefaultExtension: string;
};

/**
 * Everything needed to construct a hydrated `Sku`.
 *
 * Every collaborator is optional because not every hydration needs every one: a catalog listing
 * that reads `skuCode` has no business requiring a currency converter.
 */
export type SkuHydrationInput = {
  // Persistent properties [model/entity/Sku.cfc:L52-L59].
  readonly skuID: string;
  readonly activeFlag?: CfBooleanInput;
  readonly skuCode?: string;
  readonly listPrice?: Money;
  readonly price?: Money;
  readonly renewalPrice?: Money;
  readonly imageFile?: string;
  readonly userDefinedPriceFlag?: CfBooleanInput;

  // Calculated property [model/entity/Sku.cfc:L62].
  readonly calculatedQATS?: number;

  // Remote property [model/entity/Sku.cfc:L90] and audit properties
  // [model/entity/Sku.cfc:L93-L96].
  readonly remoteID?: string;
  readonly createdDateTime?: Date;
  readonly createdByAccountID?: string;
  readonly modifiedDateTime?: Date;
  readonly modifiedByAccountID?: string;

  // In-scope associations. Each defaults to `[]`, never to `undefined`.
  readonly product?: Product;
  readonly options?: Option[];
  readonly skuCurrencies?: SkuCurrency[];
  readonly priceGroupRates?: PriceGroupRate[];
  readonly promotionRewards?: PromotionReward[];
  readonly promotionRewardExclusions?: PromotionReward[];
  readonly promotionQualifiers?: PromotionQualifier[];
  readonly promotionQualifierExclusions?: PromotionQualifier[];

  // Inert opaque identifiers standing in for out-of-scope associations.
  readonly subscriptionTermID?: string;
  readonly alternateSkuCodeIDs?: readonly string[];
  readonly stockIDs?: readonly string[];
  readonly accessContentIDs?: readonly string[];
  readonly subscriptionBenefitIDs?: readonly string[];
  readonly renewalSubscriptionBenefitIDs?: readonly string[];
  readonly physicalIDs?: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L539-L544]: the legacy body delegates to the product, whose
   * ported method is asynchronous.
   */
  readonly salePriceDetail?: SkuSalePriceDetails;

  /**
   * The requesting account, explicit rather than ambient (T6).
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L262-L268]: the legacy path reads the account
   * from the request scope through the anomalous `getSlatwallScope()` while the rest of the
   * codebase uses `getHibachiScope()`.
   */
  readonly currentAccountContext?: CurrentAccountContext;

  /**
   * The resolved ambient values the two portable image members compose with.
   */
  readonly imageSettingValues?: SkuImageSettingValues;

  /**
   * An ALREADY-COMPLETED per-currency price map, injected rather than computed.
   *
   * Supplying it is the one construction path that RUNS no COLLABORATOR at all. {@link Sku.hydrate}
   * is the other: it runs the cascade [model/entity/Sku.cfc:L367-L433] once, against a context
   * resolved once for a whole batch.
   */
  readonly currencyDetails?: Readonly<Record<string, CurrencyDetail>>;
  readonly settingsProvider?: SettingsProvider;
  readonly currencyConverter?: CurrencyConverter;
  readonly priceGroupResolver?: SkuPriceGroupResolver;
  readonly skuRepository?: SkuRepository;

  /**
   * `true` when this row has not been persisted, which `HibachiEntity.isNew()` answers by testing
   * the primary key against its `unsavedvalue=""` [model/entity/Sku.cfc:L52].
   */
  readonly isNew?: boolean;
};

/**
 * `SlatwallSku`, table `SwSku` - a stock-keeping unit.
 *
 * Associations are already-populated arrays, returned as the live internal reference - see the
 * live-array proof above {@link Sku.getProduct}.
 *
 * LEGACY-NOTE [model/entity/Sku.cfc:L65]: `product` is declared without `fetch="join"`, so it is a
 * lazy many-to-one.
 */
export class Sku {
  // PERSISTENT PROPERTIES [model/entity/Sku.cfc:L52-L59], reproduced verbatim in source order with
  // every `hb_*` and `rbKey` attribute carried forward as an inert comment.

  /**
   * `property name="skuID" ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default="";`
   * [model/entity/Sku.cfc:L52] - the primary key, and the basis of every probe here.
   */
  private readonly skuID: string;

  /**
   * `property name="activeFlag" ormtype="boolean" default="1";` [model/entity/Sku.cfc:L53]
   *
   * One of exactly two persisted booleans on this component.
   */
  private activeFlag: boolean;

  /**
   * `property name="skuCode" ormtype="string" unique="true" length="50";`
   * [model/entity/Sku.cfc:L54]
   */
  private skuCode?: string;

  /**
   * `property name="listPrice" ormtype="big_decimal" hb_formatType="currency" default="0";`
   * [model/entity/Sku.cfc:L55]
   *
   * All three money columns on `Sku` `listPrice` [model/entity/Sku.cfc:L55], `price`
   * [model/entity/Sku.cfc:L56] and `renewalPrice` [model/entity/Sku.cfc:L57] declare
   * `default="0"`.
   */
  private listPrice: Money;

  /**
   * `property name="price" ormtype="big_decimal" hb_formatType="currency" default="0";`
   * [model/entity/Sku.cfc:L56]
   */
  private price: Money;

  /**
   * `property name="renewalPrice" ormtype="big_decimal" hb_formatType="currency" default="0";`
   * [model/entity/Sku.cfc:L57]
   */
  private renewalPrice: Money;

  /**
   * `property name="imageFile" ormtype="string" length="50";` [model/entity/Sku.cfc:L58]
   */
  private imageFile?: string;

  /**
   * `property name="userDefinedPriceFlag" ormtype="boolean" default="0";`
   * [model/entity/Sku.cfc:L59]
   *
   * The second and last persisted boolean on this component.
   */
  private userDefinedPriceFlag: boolean;

  /**
   * `property name="calculatedQATS" ormtype="integer";` [model/entity/Sku.cfc:L62] - a CALCULATED
   * property under its own banner: a persisted cache of the quantity-available-to-sell figure the
   * out-of-scope stock subsystem computes.
   */
  private calculatedQATS?: number;

  /**
   * `property name="remoteID" ormtype="string";` [model/entity/Sku.cfc:L90]
   */
  private remoteID?: string;

  // AUDIT PROPERTIES [model/entity/Sku.cfc:L93-L96]. All four declare
  // `hb_populateEnabled="false"`; there is no mass-assignment path in the target, so the attribute
  // is documentation of intent.

  /**
   * `property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";`
   * [model/entity/Sku.cfc:L93]
   */
  private createdDateTime?: Date;
  private createdByAccountID?: string;

  /**
   * `property name="modifiedDateTime" hb_populateEnabled="false" ormtype="timestamp";`
   * [model/entity/Sku.cfc:L95]
   */
  private modifiedDateTime?: Date;

  /**
   * As [model/entity/Sku.cfc:L96], collapsed to the raw foreign key for the same reason as
   * [model/entity/Sku.cfc:L94].
   */
  private modifiedByAccountID?: string;

  /**
   * `hb_cascadeCalculate="true"` marks the edge the framework walked when recalculating derived
   * values; there is no such engine in the target.
   */
  private product: Product | undefined;
  private readonly options: Option[];

  /**
   * Step 2 of the cascade reads this collection [model/entity/Sku.cfc:L399-L414].
   */
  private readonly skuCurrencies: SkuCurrency[];
  private readonly priceGroupRates: PriceGroupRate[];
  private readonly promotionRewards: PromotionReward[];

  /**
   * `SwPromoRewardExclSku` - the abbreviated link-table name is a schema contract, never
   * "corrected".
   */
  private readonly promotionRewardExclusions: PromotionReward[];
  private readonly promotionQualifiers: PromotionQualifier[];
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  // out-of-scope associations, collapsed to inert opaque identifiers.

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L66]: `subscriptionTerm` targets `cfc="SubscriptionTerm"`,
   * out of scope; collapsed to its raw foreign key with no subscription behaviour ported.
   */
  private subscriptionTermID?: string;

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L69]: `alternateSkuCodes` targets `cfc="AlternateSkuCode"`
   * with `inverse="true"` and `cascade="all-delete-orphan"`, out of scope; collapsed to opaque
   * identifiers and its helpers dropped.
   */
  private readonly alternateSkuCodeIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L73]: `stocks` targets `cfc="Stock"` with `inverse="true"`
   * and `cascade="all-delete-orphan"`, part of the out-of-scope stock/inventory/location
   * subsystem; collapsed to opaque identifiers and its helpers dropped.
   */
  private readonly stockIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L77]: `accessContents` targets `cfc="Content"`, out of
   * scope; collapsed to opaque identifiers.
   */
  private readonly accessContentIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L78]: `subscriptionBenefits` targets
   * `cfc="SubscriptionBenefit"`, out of scope; collapsed to opaque identifiers.
   */
  private readonly subscriptionBenefitIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L79]: `renewalSubscriptionBenefits` targets
   * `cfc="SubscriptionBenefit"` through link table `SwSkuRenewalSubsBenefit`, out of scope.
   */
  private readonly renewalSubscriptionBenefitIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L87]: `physicals` targets `cfc="Physical"` through link
   * table `SwPhysicalSku`, out of scope; collapsed to opaque identifiers.
   */
  private readonly physicalIDs: readonly string[];

  // Collaborators (T1) and explicit context (T6)

  private readonly settingsProvider?: SettingsProvider;
  private readonly currencyConverter?: CurrencyConverter;
  private readonly priceGroupResolver?: SkuPriceGroupResolver;
  private readonly skuRepository?: SkuRepository;
  private readonly currentAccountContext?: CurrentAccountContext;
  private readonly imageSettingValues?: SkuImageSettingValues;

  // pre-materialised read models.

  private readonly salePriceDetail?: SkuSalePriceDetails;
  private readonly newFlag: boolean;

  // INSTANCE-SCOPED MEMOS. Each corresponds to a `structKeyExists(variables, "...")` guard in the
  // source, where `undefined` means "the legacy `variables` key does not exist yet".
  //
  // Why each is an explicit `T | undefined` union rather than an optional member.

  /**
   * [model/entity/Sku.cfc:L361] `structKeyExists(variables, "currencyCode")`.
   */
  private currencyCodeMemo: string | undefined;

  /**
   * [model/entity/Sku.cfc:L368] `structKeyExists(variables, "currencyDetails")`.
   */
  private currencyDetailsMemo: Record<string, CurrencyDetail> | undefined;

  /**
   * [model/entity/Sku.cfc:L501] see the DEFECT 17 divergence.
   */
  private optionsByOptionGroupCodeStructMemo: Record<string, Option> | undefined;

  /**
   * [model/entity/Sku.cfc:L513] see the DEFECT 18 divergence.
   */
  private optionsByOptionGroupIDStructMemo: Record<string, Option> | undefined;

  /**
   * [model/entity/Sku.cfc:L525] `structKeyExists(variables, "optionsIDList")`.
   */
  private optionsIDListMemo: string | undefined;

  /**
   * [model/entity/Sku.cfc:L483] `structKeyExists(variables, "livePrice")`.
   */
  private livePriceMemo: Money | undefined;

  /**
   * [model/entity/Sku.cfc:L436] `structKeyExists(variables, "currentAccountPrice")`.
   */
  private currentAccountPriceMemo: Money | undefined;

  /**
   * [model/entity/Sku.cfc:L575] `structKeyExists(variables, "skuDefinition")`.
   */
  private skuDefinitionMemo: string | undefined;

  /**
   * [model/entity/Sku.cfc:L593] `structKeyExists(variables, "transactionExistsFlag")`.
   */
  private transactionExistsFlagMemo: boolean | undefined;

  /**
   * Constructs a hydrated `Sku`.
   */
  public constructor(input: SkuHydrationInput) {
    this.skuID = input.skuID;

    // [model/entity/Sku.cfc:L53] default="1" - through the CFML boolean helper because a persisted
    // boolean column can arrive as SQL NULL, `0`/`1`, or `'true'`.
    this.activeFlag = input.activeFlag === undefined ? true : cfBoolean(input.activeFlag);

    if (input.skuCode !== undefined) {
      this.skuCode = input.skuCode;
    }

    // [model/entity/Sku.cfc:L55-L57] all three money columns declare `default="0"`, so coercing an
    // absent value to `Money.zero` agrees with the source's own declared default. None of the three
    // declares `notnull`, so a row written outside the entity can still hold SQL NULL; on such a
    // row the legacy would leave the Step 2 struct sub-key absent, fall through to Step 3 and raise
    // inside `convertCurrency(null, ...)`, whereas this reads zero. The repository carries no DDL
    // to settle whether such a row can exist, so the declared default is followed rather than a
    // raise invented. Contrast the two readers that deliberately differ:
    // `priceGroupRepository.readMoney` answers `undefined` and `promotionRepository.readMoney`
    // throws, each because its own column has no declared default to fall back on.
    this.listPrice = input.listPrice ?? Money.zero;
    this.price = input.price ?? Money.zero;
    this.renewalPrice = input.renewalPrice ?? Money.zero;

    if (input.imageFile !== undefined) {
      this.imageFile = input.imageFile;
    }
    this.userDefinedPriceFlag =
      input.userDefinedPriceFlag === undefined ? false : cfBoolean(input.userDefinedPriceFlag);

    if (input.calculatedQATS !== undefined) {
      this.calculatedQATS = input.calculatedQATS;
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

    // An explicit `Product | undefined` union rather than an optional member, because
    // `removeProduct()` must be able to CLEAR it - [model/entity/Sku.cfc:L618] executes
    // `structDelete(variables, "product")`.
    this.product = input.product;

    // The live-array rule starts here: each collection adopts the caller's array rather than
    // copying it, so a repository wiring both sides of an association sees one array and not two.
    this.options = input.options ?? [];
    this.skuCurrencies = input.skuCurrencies ?? [];
    this.priceGroupRates = input.priceGroupRates ?? [];
    this.promotionRewards = input.promotionRewards ?? [];
    this.promotionRewardExclusions = input.promotionRewardExclusions ?? [];
    this.promotionQualifiers = input.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = input.promotionQualifierExclusions ?? [];

    if (input.subscriptionTermID !== undefined) {
      this.subscriptionTermID = input.subscriptionTermID;
    }
    this.alternateSkuCodeIDs = input.alternateSkuCodeIDs ?? [];
    this.stockIDs = input.stockIDs ?? [];
    this.accessContentIDs = input.accessContentIDs ?? [];
    this.subscriptionBenefitIDs = input.subscriptionBenefitIDs ?? [];
    this.renewalSubscriptionBenefitIDs = input.renewalSubscriptionBenefitIDs ?? [];
    this.physicalIDs = input.physicalIDs ?? [];

    if (input.salePriceDetail !== undefined) {
      this.salePriceDetail = input.salePriceDetail;
    }
    if (input.currentAccountContext !== undefined) {
      this.currentAccountContext = input.currentAccountContext;
    }
    if (input.settingsProvider !== undefined) {
      this.settingsProvider = input.settingsProvider;
    }
    if (input.currencyConverter !== undefined) {
      this.currencyConverter = input.currencyConverter;
    }
    if (input.priceGroupResolver !== undefined) {
      this.priceGroupResolver = input.priceGroupResolver;
    }
    if (input.skuRepository !== undefined) {
      this.skuRepository = input.skuRepository;
    }
    if (input.imageSettingValues !== undefined) {
      this.imageSettingValues = input.imageSettingValues;
    }

    // [model/entity/Sku.cfc:L368-L369] an injected map satisfies the memo guard at construction,
    // so the cascade never runs for it and every accessor reads it directly.
    if (input.currencyDetails !== undefined) {
      this.currencyDetailsMemo = { ...input.currencyDetails };
    }

    this.newFlag = input.isNew ?? false;
  }

  // PRIVATE HELPERS. No legacy counterpart; each exists so the same faithful decision is taken at
  // every site rather than re-improvised, and each records the CFML behaviour it reproduces.

  /**
   * Resolves an option's option group, reproducing the CFML raise when it is absent.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L504, L516, L776, L866, L902]: every one of those lines
   * chains `option.getOptionGroup().getOptionGroupXxx()` with no null check, and in CFML a null
   * `optionGroup` raises immediately.
   */
  private static requireOptionGroup(option: Option, locator: string): OptionGroup {
    const optionGroup = option.getOptionGroup();
    if (optionGroup === undefined) {
      throw new Error(
        `Sku: option '${option.getOptionID()}' has no option group, so ` +
          `[model/entity/Sku.cfc:${locator}] cannot be evaluated. The legacy body chains ` +
          `getOptionGroup() with no null check and raises in the same situation.`,
      );
    }
    return optionGroup;
  }

  /**
   * Resolves a value CFML used directly as a struct key, reproducing the raise when it is absent.
   *
   * LEGACY-NOTE: `structKeyExists(struct, javaCast("null", ""))` raises in CFML, so a null
   * option-group code or name was never survivable at [model/entity/Sku.cfc:L504-L505],
   * [model/entity/Sku.cfc:L776-L779] or [model/entity/Sku.cfc:L902].
   */
  private static requireKey(value: string | undefined, what: string, locator: string): string {
    if (value === undefined) {
      throw new Error(
        `Sku: ${what} is required as a struct key at [model/entity/Sku.cfc:${locator}]; ` +
          `CFML raises when a null value is used as a struct key.`,
      );
    }
    return value;
  }

  /**
   * The CASE-SENSITIVE `listFind` membership test, implemented locally.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L776]: the legacy call is `listFind`, the CASE-SENSITIVE
   * variant, while `src/lib/cfml/list.ts` exports only `listFindNoCase` among its five members.
   */
  private static listFindCaseSensitive(list: string, value: string): boolean {
    return listToArray(list).some((element: string) => element === value);
  }

  /**
   * The presentation form of a monetary value.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L388, L392, L395, L403, L407, L410]: these six sites call
   * `getFormattedValue("renewalPrice"|"listPrice"|"price")`, a `HibachiEntity` member that is not
   * ported, and [model/entity/Sku.cfc:L419].
   */
  private static formatCurrency(value: Money): string {
    return numberFormat(value.toDecimalString(), '0.00');
  }

  /**
   * Names the collaborator a member needs when it was not injected.
   */
  private missingCollaborator(collaborator: string, locator: string): Error {
    return new Error(
      `Sku '${this.skuID}': the ${collaborator} collaborator was not injected, so ` +
        `[model/entity/Sku.cfc:${locator}] cannot be evaluated. Repositories own hydration ` +
        `and must supply it.`,
    );
  }

  /**
   * The primary key [model/entity/Sku.cfc:L52].
   */
  public getSkuID(): string {
    return this.skuID;
  }
  public getActiveFlag(): boolean {
    return this.activeFlag;
  }
  public setActiveFlag(activeFlag: CfBooleanInput): void {
    this.activeFlag = cfBoolean(activeFlag);
  }

  /**
   * [model/entity/Sku.cfc:L54] `unique="true"`, `length="50"`, no default, so genuinely absent.
   */
  public getSkuCode(): string | undefined {
    return this.skuCode;
  }
  public setSkuCode(skuCode: string): void {
    this.skuCode = skuCode;
  }

  /**
   * [model/entity/Sku.cfc:L55] `default="0"`, therefore never absent - see the money-column
   * asymmetry on the field.
   */
  public getListPrice(): Money {
    return this.listPrice;
  }
  public setListPrice(listPrice: Money): void {
    this.listPrice = listPrice;
    this.livePriceMemo = undefined;
  }

  // Why the three money setters do not clear the cascade memo.

  /**
   * [model/entity/Sku.cfc:L56] `default="0"`, therefore never absent.
   */
  public getPrice(): Money {
    return this.price;
  }

  /**
   * [model/entity/Sku.cfc:L56] the cascade memo is deliberately not cleared; see the note above.
   */
  public setPrice(price: Money): void {
    this.price = price;
    this.livePriceMemo = undefined;
  }

  /**
   * [model/entity/Sku.cfc:L57] `default="0"`, therefore never absent.
   */
  public getRenewalPrice(): Money {
    return this.renewalPrice;
  }

  /**
   * [model/entity/Sku.cfc:L57] the cascade memo is deliberately not cleared; see the note above.
   */
  public setRenewalPrice(renewalPrice: Money): void {
    this.renewalPrice = renewalPrice;
    this.livePriceMemo = undefined;
  }
  public getImageFile(): string | undefined {
    return this.imageFile;
  }
  public getUserDefinedPriceFlag(): boolean {
    return this.userDefinedPriceFlag;
  }
  public setUserDefinedPriceFlag(userDefinedPriceFlag: CfBooleanInput): void {
    this.userDefinedPriceFlag = cfBoolean(userDefinedPriceFlag);
  }

  /**
   * [model/entity/Sku.cfc:L62] the persisted quantity-available-to-sell cache.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L62, L535]: the column is preserved but `getQATS()`
   * [model/entity/Sku.cfc:L535], which recomputes it, is OMITTED - it reaches the out-of-scope
   * stock subsystem. This accessor reads the stored figure and computes nothing.
   */
  public getCalculatedQATS(): number | undefined {
    return this.calculatedQATS;
  }
  public getRemoteID(): string | undefined {
    return this.remoteID;
  }
  public getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/Sku.cfc:L94] The `Account` association, collapsed to its foreign key.
   */
  public getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  public getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/Sku.cfc:L96] The `Account` association, collapsed to its foreign key.
   */
  public getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * [model/entity/Sku.cfc:L66] The out-of-scope `SubscriptionTerm` association, as its foreign
   * key.
   */
  public getSubscriptionTermID(): string | undefined {
    return this.subscriptionTermID;
  }

  /**
   * [model/entity/Sku.cfc:L69] Out-of-scope `AlternateSkuCode` identifiers.
   */
  public getAlternateSkuCodeIDs(): readonly string[] {
    return this.alternateSkuCodeIDs;
  }

  /**
   * [model/entity/Sku.cfc:L73] Out-of-scope `Stock` identifiers.
   */
  public getStockIDs(): readonly string[] {
    return this.stockIDs;
  }

  /**
   * [model/entity/Sku.cfc:L77] Out-of-scope `Content` identifiers.
   */
  public getAccessContentIDs(): readonly string[] {
    return this.accessContentIDs;
  }

  /**
   * [model/entity/Sku.cfc:L78] Out-of-scope `SubscriptionBenefit` identifiers.
   */
  public getSubscriptionBenefitIDs(): readonly string[] {
    return this.subscriptionBenefitIDs;
  }

  /**
   * [model/entity/Sku.cfc:L79] Out-of-scope renewal `SubscriptionBenefit` identifiers.
   */
  public getRenewalSubscriptionBenefitIDs(): readonly string[] {
    return this.renewalSubscriptionBenefitIDs;
  }

  /**
   * [model/entity/Sku.cfc:L87] Out-of-scope `Physical` identifiers.
   */
  public getPhysicalIDs(): readonly string[] {
    return this.physicalIDs;
  }

  /**
   * `true` when this row has never been persisted.
   */
  public isNew(): boolean {
    return this.newFlag;
  }

  /**
   * The property whose value represents this entity in a listing. [model/entity/Sku.cfc:L809-L811]
   * verbatim - `return "skuCode";` - under the `START: Overridden Methods` banner
   * [model/entity/Sku.cfc:L807].
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L809]: `noImplicitOverride` is enabled, but this class has
   * no TypeScript base class - the CFML `extends` chain is not ported - so what CFML called an
   * override is a plain method here.
   */
  public getSimpleRepresentationPropertyName(): string {
    return 'skuCode';
  }

  // Bidirectional removal on five siblings: the far side would delete from a throwaway.

  /**
   * The owning product [model/entity/Sku.cfc:L65]. `Product | undefined` because `removeProduct()`
   * [model/entity/Sku.cfc:L618] executes `structDelete(variables, "product")`; a refinement of the
   * legacy `any`, not a widening.
   */
  public getProduct(): Product | undefined {
    return this.product;
  }

  /**
   * LEGACY-NOTE [model/service/PromotionService.cfc:L885, L914, L951, L980]: the promotion engine
   * passes this array into the four `hasAnyOption`/`hasAnyExcludedOption` probes, which live on
   * the promotion entities - not on `Sku`.
   */
  public getOptions(): Option[] {
    return this.options;
  }

  /**
   * The per-currency price override rows [model/entity/Sku.cfc:L72]. Live array reference -
   * `SkuCurrency.setSku` appends to it directly, and step 2 of the cascade iterates it
   * [model/entity/Sku.cfc:L399-L414].
   */
  public getSkuCurrencies(): SkuCurrency[] {
    return this.skuCurrencies;
  }

  /**
   * The price-group rates that name this sku [model/entity/Sku.cfc:L86]. Live array reference;
   * far-side obligation proven by [model/entity/PriceGroupRate.cfc:L243, L251, L253], which
   * deletes from this exact array.
   */
  public getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * The promotion rewards that include this sku [model/entity/Sku.cfc:L82]. Live array reference;
   * far-side obligation proven by [model/entity/PromotionReward.cfc:L243, L251, L253].
   */
  public getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * The promotion rewards that exclude this sku [model/entity/Sku.cfc:L83]. Live array reference;
   * far-side obligation proven by [model/entity/PromotionReward.cfc:L343, L351, L353].
   */
  public getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /**
   * The promotion qualifiers that include this sku [model/entity/Sku.cfc:L84]. Live array
   * reference; far-side obligation proven by
   * [model/entity/PromotionQualifier.cfc:L185, L193, L195].
   */
  public getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * The promotion qualifiers that exclude this sku [model/entity/Sku.cfc:L85]. Live array
   * reference; far-side obligation proven by
   * [model/entity/PromotionQualifier.cfc:L285, L293, L295].
   */
  public getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  // Typescript must not emulate dynamic dispatch: no `Proxy`, no index signature, no `arguments`
  // struct emulation, no `evaluate()`, no `variables.` scope emulation.
  public hasOption(option: Option): boolean {
    const optionID = option.getOptionID();
    return this.options.some((held: Option) => held.getOptionID() === optionID);
  }

  /**
   * Compares by `skuCurrencyID`; called on the far side by `SkuCurrency.setSku`.
   */
  public hasSkuCurrency(skuCurrency: SkuCurrency): boolean {
    const skuCurrencyID = skuCurrency.getSkuCurrencyID();
    return this.skuCurrencies.some(
      (held: SkuCurrency) => held.getSkuCurrencyID() === skuCurrencyID,
    );
  }

  /**
   * A far-side obligation - called as `arguments.sku.hasPriceGroupRate(this)` at
   * [model/entity/PriceGroupRate.cfc:L243]. Compares by `priceGroupRateID`; `false` when empty.
   */
  public hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const priceGroupRateID = priceGroupRate.getPriceGroupRateID();
    return this.priceGroupRates.some(
      (held: PriceGroupRate) => held.getPriceGroupRateID() === priceGroupRateID,
    );
  }

  /**
   * A far-side obligation - [model/entity/PromotionReward.cfc:L242]. By `promotionRewardID`.
   */
  public hasPromotionReward(promotionReward: PromotionReward): boolean {
    const promotionRewardID = promotionReward.getPromotionRewardID();
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === promotionRewardID,
    );
  }

  /**
   * A far-side obligation - [model/entity/PromotionReward.cfc:L342]. By `promotionRewardID`.
   */
  public hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const promotionRewardID = promotionReward.getPromotionRewardID();
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === promotionRewardID,
    );
  }

  /**
   * A far-side obligation [model/entity/PromotionQualifier.cfc:L184]. By ID.
   */
  public hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const promotionQualifierID = promotionQualifier.getPromotionQualifierID();
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === promotionQualifierID,
    );
  }

  /**
   * A far-side obligation [model/entity/PromotionQualifier.cfc:L284]. By ID.
   */
  public hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const promotionQualifierID = promotionQualifier.getPromotionQualifierID();
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === promotionQualifierID,
    );
  }

  // Bidirectional helper methods. [model/entity/Sku.cfc:L601-L751].
  //
  // `addOption`/`removeOption` are absent from that count because `Sku.cfc` declares no
  // hand-written helper for `options`; the ORM generated them from
  // `fieldtype="many-to-many" singularname="option"` at [model/entity/Sku.cfc:L76].

  /**
   * Attaches this sku to a product, wiring both sides. [model/entity/Sku.cfc:L604-L608].
   *
   * The `isNew() or !arguments.product.hasSku(this)` short-circuit is preserved exactly: a
   * brand-new sku is appended without the containment probe.
   */
  public setProduct(product: Product): void {
    this.product = product;
    if (this.isNew() || !product.hasSku(this)) {
      product.getSkus().push(this);
    }
  }

  /**
   * Detaches this sku from a product, unwiring both sides. [model/entity/Sku.cfc:L610-L619].
   *
   * The omitted-argument default (`if(!structKeyExists(arguments, "product"))`) is reproduced as
   * an optional parameter, and `structDelete(variables, "product")` by assigning `undefined` -
   * never by `delete this.product`.
   */
  public removeProduct(product?: Product): void {
    const target = product ?? this.product;
    if (target === undefined) {
      // LEGACY-NOTE [model/entity/Sku.cfc:L611-L614]: with no argument and no `variables.product`,
      // CFML would raise on `arguments.product.getSkus()`. Raising here is the faithful port.
      throw new Error(
        `Sku '${this.skuID}': removeProduct was called with no argument and no owning ` +
          `product, which raises at [model/entity/Sku.cfc:L614].`,
      );
    }
    const farSideSkus: Sku[] = target.getSkus();
    const index = farSideSkus.findIndex((held: Sku) => held.getSkuID() === this.skuID);
    if (index !== -1) {
      farSideSkus.splice(index, 1);
    }
    this.product = undefined;
  }

  /**
   * ORM-generated from [model/entity/Sku.cfc:L76]; called by [model/entity/Option.cfc:L127] as
   * `arguments.sku.addOption(this)`.
   */
  public addOption(option: Option): void {
    if (this.isNew() || !this.hasOption(option)) {
      this.options.push(option);
      this.invalidateOptionMemos();
    }
  }

  /**
   * ORM-generated from [model/entity/Sku.cfc:L76]; called by [model/entity/Option.cfc:L131] as
   * `arguments.sku.removeOption(this)`.
   */
  public removeOption(option: Option): void {
    const optionID = option.getOptionID();
    const index = this.options.findIndex((held: Option) => held.getOptionID() === optionID);
    if (index !== -1) {
      this.options.splice(index, 1);
      this.invalidateOptionMemos();
    }
  }

  /**
   * Invalidates every memo derived from the option collection.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L501, L513, L525, L576]: the legacy component never
   * invalidates these memos, because a CFML request was short enough that a sku's options did not
   * change underneath them.
   */
  private invalidateOptionMemos(): void {
    this.optionsByOptionGroupCodeStructMemo = undefined;
    this.optionsByOptionGroupIDStructMemo = undefined;
    this.optionsIDListMemo = undefined;
    this.skuDefinitionMemo = undefined;
  }

  /**
   * [model/entity/Sku.cfc:L656-L658] `arguments.skuCurrency.setSku( this )`.
   *
   * The one-to-many is `inverse="true"` [model/entity/Sku.cfc:L72], so the far side owns the
   * foreign key and this helper delegates rather than appending.
   */
  public addSkuCurrency(skuCurrency: SkuCurrency): void {
    skuCurrency.setSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L659-L661] `arguments.skuCurrency.removeSku( this )`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L656-L661, L368]: neither helper clears
   * `variables.currencyDetails` in the legacy, so neither clears the cascade memo here.
   */
  public removeSkuCurrency(skuCurrency: SkuCurrency): void {
    skuCurrency.removeSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L672-L674] `arguments.promotionReward.addSku( this )`.
   */
  public addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L675-L677] `arguments.promotionReward.removeSku( this )`. Verdict:
   * clean.
   */
  public removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L680-L682] `arguments.promotionReward.addExcludedSku( this )`.
   *
   * Note the parameter name in the legacy source is `promotionReward`, not
   * `promotionRewardExclusion`: the exclusion is a role on the same entity, not a separate one.
   */
  public addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L683-L685] `arguments.promotionReward.removeExcludedSku( this )`.
   * Verdict: clean.
   */
  public removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L688-L690] `arguments.promotionQualifier.addSku( this )`.
   */
  public addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L691-L693] `arguments.promotionQualifier.removeSku( this )`. Verdict:
   * clean.
   */
  public removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L696-L698] `arguments.promotionQualifier.addExcludedSku( this )`.
   */
  public addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L699-L701] `arguments.promotionQualifier.removeExcludedSku( this )`.
   * Verdict: clean.
   */
  public removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedSku(this);
  }

  // Option methods [model/entity/Sku.cfc:L231-L253] and the two struct accessors at
  // [model/entity/Sku.cfc:L500-L522]

  /**
   * The option names, joined by a caller-supplied delimiter. [model/entity/Sku.cfc:L233-L239],
   * with the `delimiter=" "` default preserved, over the THREE-ARGUMENT
   * `listAppend(list, value, delimiter)`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L233 versus L885]: this method is a NON-DEPRECATED
   * near-duplicate of `displayOptions()` [model/entity/Sku.cfc:L885-L891], which sits in the
   * Deprecated Methods section carrying `// @hint: USE skuDefinition()`.
   */
  public getOptionsDisplay(delimiter = ' '): string {
    let dspOptions = '';
    for (const option of this.options) {
      dspOptions = listAppend(dspOptions, option.getOptionName() ?? '', delimiter);
    }
    return dspOptions;
  }

  /**
   * The option belonging to a given option group, by option-group ID.
   *
   * There is no `else`, so a miss yields nothing refined from the legacy `any` to
   * `Option | undefined`.
   */
  public getOptionByOptionGroupID(optionGroupID: string): Option | undefined {
    const struct = this.getOptionsByOptionGroupIDStruct();
    if (structKeyExists(struct, optionGroupID)) {
      return structGet(struct, optionGroupID);
    }
    return undefined;
  }

  /**
   * The option belonging to a given option group, by option-group CODE.
   *
   * LEGACY-DEFECT [model/entity/Sku.cfc:L247-L251]: the guard tests the CODE struct
   * (`structKeyExists(getOptionsByOptionGroupCodeStruct(), arguments.optionGroupCode)`) but the
   * lookup reads the ID struct with that same CODE key, and an option-group code is never a key in
   * an ID-keyed map.
   * Preserved deliberately; do not fix without a product decision.
   */
  public getOptionByOptionGroupCode(optionGroupCode: string): Option | undefined {
    if (structKeyExists(this.getOptionsByOptionGroupCodeStruct(), optionGroupCode)) {
      // The ID struct, with a CODE key the defect, reproduced exactly.
      return structGet(this.getOptionsByOptionGroupIDStruct(), optionGroupCode);
    }
    return undefined;
  }

  /**
   * The options of this sku, keyed by their option group's code.
   *
   * DELIBERATE DIVERGENCE [model/entity/Sku.cfc:L500-L510]: the code-keyed accessor guards on its
   * own memo but seeds `variables.optionsByOptionGroupIDStruct` at L502, so it clears the other
   * accessor's memo while never seeding its own. This seeds and returns the code-keyed map alone.
   * The divergence is unobservable through the public contract - it costs a recomputation, not a
   * different answer - and both memos are request-scoped here.
   */
  public getOptionsByOptionGroupCodeStruct(): Record<string, Option> {
    if (this.optionsByOptionGroupCodeStructMemo === undefined) {
      const struct: Record<string, Option> = {};
      for (const option of this.options) {
        const optionGroup = Sku.requireOptionGroup(option, 'L504');
        const optionGroupCode = Sku.requireKey(
          optionGroup.getOptionGroupCode(),
          'optionGroupCode',
          'L504-L505',
        );
        // Case-insensitive existence, as CFML struct keys are the first option per option group
        // wins [model/entity/Sku.cfc:L504].
        if (!structKeyExists(struct, optionGroupCode)) {
          // `putOwnStructKey`, not `struct[optionGroupCode] = option`: the key is a
          // `SwOptionGroup.optionGroupCode` column value, so it can be `__proto__`.
          putOwnStructKey(struct, optionGroupCode, option);
        }
      }
      this.optionsByOptionGroupCodeStructMemo = struct;
    }
    return this.optionsByOptionGroupCodeStructMemo;
  }

  /**
   * The options of this sku, keyed by their option group's ID.
   *
   * DELIBERATE DIVERGENCE [model/entity/Sku.cfc:L512-L522]: the source fills
   * `variables.OptionsByGroupIDStruct` and returns `variables.optionsByOptionGroupIDStruct`, two
   * different keys, so the map it hands back is always empty. This populates and returns the same
   * map. The divergence is unobservable through the public contract - the memo is request-scoped
   * here - and reproducing it would mean shipping an accessor that can only ever answer nothing.
   */
  public getOptionsByOptionGroupIDStruct(): Record<string, Option> {
    if (this.optionsByOptionGroupIDStructMemo === undefined) {
      const struct: Record<string, Option> = {};
      for (const option of this.options) {
        const optionGroup = Sku.requireOptionGroup(option, 'L516');
        const optionGroupID = optionGroup.getOptionGroupID();
        if (!structKeyExists(struct, optionGroupID)) {
          // `putOwnStructKey`, not `struct[optionGroupID] = option`: the identifier is a persisted
          // `SwOptionGroup.optionGroupID` value, so a malformed row can supply `__proto__` here
          // just as a code or a name can.
          putOwnStructKey(struct, optionGroupID, option);
        }
      }
      this.optionsByOptionGroupIDStructMemo = struct;
    }
    return this.optionsByOptionGroupIDStructMemo;
  }

  /**
   * This sku's option IDs as a comma-delimited list.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L524]: the legacy declares `returntype="string"` and returns
   * the comma list rather than an array.
   */
  public getOptionsIDList(): string {
    if (this.optionsIDListMemo === undefined) {
      let optionsIDList = '';
      for (const option of this.options) {
        optionsIDList = listAppend(optionsIDList, option.getOptionID());
      }
      this.optionsIDListMemo = optionsIDList;
    }
    return this.optionsIDListMemo;
  }

  /**
   * The `optionName` of the option that belongs to a given option group, or nothing.
   *
   * This replaces the `onMissingMethod` dispatcher override at [model/entity/Sku.cfc:L857-L873] -
   * the `@hint` is L857 and the declaration L858, not L852.
   *
   * The CFML dynamic form is not reproducible and must not be emulated: no `Proxy`, no index
   * signature, no `arguments` struct emulation, no `evaluate()`.
   */
  public getOptionNameByOptionGroupID(optionGroupID: string): string | undefined {
    for (const option of this.options) {
      const optionGroup = Sku.requireOptionGroup(option, 'L866');
      // Case-insensitive, as CFML `==` on strings is [model/entity/Sku.cfc:L866].
      if (cfEquals(optionGroup.getOptionGroupID(), optionGroupID)) {
        return option.getOptionName();
      }
    }
    return undefined;
  }

  // Price / currency methods [model/entity/Sku.cfc:L255-L287] plus the cascade at
  // [model/entity/Sku.cfc:L360-L433]

  /**
   * The price of this sku under a promotion.
   *
   * LEGACY-DEFECT [model/entity/Sku.cfc:L258]: the body calls
   * `promotionService.calculateSkuPriceBasedOnPromotion`, which exists nowhere in the source, so
   * every call throws at runtime.
   * Preserved deliberately; do not fix without a product decision.
   *
   * TODO (AAP 0.4.2, "Reproduced as a throwing stub with the TODO, not invented"): this method
   * cannot work until a `calculateSkuPriceBasedOnPromotion` implementation exists on the promotion
   * service.
   *
   * @param promotion retained for interface parity - the legacy signature declares it, so the port
   * declares it, even though the body cannot reach it.
   */
  public getPriceByPromotion(promotion: Promotion): never {
    throw new Error(
      `Sku '${this.skuID}': getPriceByPromotion cannot be evaluated for promotion ` +
        `'${promotion.getPromotionID()}'. [model/entity/Sku.cfc:L258] calls ` +
        `promotionService.calculateSkuPriceBasedOnPromotion, which does not exist anywhere ` +
        `in the source — not on PromotionService.cfc, not under org/Hibachi/, and not ` +
        `through HibachiService.onMissingMethod, whose dispatch list ` +
        `[org/Hibachi/HibachiService.cfc:L255-L280] does not include 'calculate*' and which ` +
        `throws at L280. LEGACY-DEFECT preserved deliberately.`,
    );
  }

  /**
   * The price of this sku under a price group.
   */
  public getPriceByPriceGroup(priceGroup: PriceGroup): Money {
    if (this.priceGroupResolver === undefined) {
      throw this.missingCollaborator('price-group resolver', 'L262');
    }
    return this.priceGroupResolver.calculateSkuPriceBasedOnPriceGroup(this, priceGroup);
  }

  /**
   * The price-group rate that applies to this sku under a price group.
   */
  public getAppliedPriceGroupRateByPriceGroup(priceGroup: PriceGroup): PriceGroupRate | undefined {
    if (this.priceGroupResolver === undefined) {
      throw this.missingCollaborator('price-group resolver', 'L266');
    }
    return this.priceGroupResolver.getRateForSkuBasedOnPriceGroup(this, priceGroup);
  }

  // The three currency accessors [model/entity/Sku.cfc:L269-L285]. Substituting `0` for any of
  // them would silently sell products for free. `getPriceByCurrencyCode` performs one
  // `structKeyExists`, on the outer currency key only; the other two perform a SECOND on their
  // sub-key.

  /**
   * This sku's price in a given currency, or nothing.
   *
   * `currencyCode` is a plain `string`, deliberately not the branded `CurrencyCode`: branding it
   * would route callers through `toCurrencyCode`, which THROWS on a malformed code.
   */
  public getPriceByCurrencyCode(currencyCode: string): Money | undefined {
    const currencyDetails = this.getCurrencyDetails();
    if (structKeyExists(currencyDetails, currencyCode)) {
      const detail = structGet(currencyDetails, currencyCode);
      // `structKeyExists` has already answered `true`, but the compiler cannot know that from a
      // case-insensitive lookup so the absent branch is stated rather than asserted away with `!`.
      return detail === undefined ? undefined : detail.price;
    }
    return undefined;
  }

  /**
   * This sku's list price in a given currency, or nothing. [model/entity/Sku.cfc:L275-L279].
   *
   * Two checks: the outer currency key and the `listPrice` sub-key.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L55-L57 vs L390, L405, L421]: which entries reach that state
   * is schema-driven rather than a translation choice.
   */
  public getListPriceByCurrencyCode(currencyCode: string): Money | undefined {
    return structGetPath<CurrencyDetailMoneyView>(
      this.getCurrencyDetails(),
      currencyCode,
      'listPrice',
    );
  }

  /**
   * This sku's renewal price in a given currency, or nothing.
   */
  public getRenewalPriceByCurrencyCode(currencyCode: string): Money | undefined {
    return structGetPath<CurrencyDetailMoneyView>(
      this.getCurrencyDetails(),
      currencyCode,
      'renewalPrice',
    );
  }

  /**
   * This sku's base currency code. [model/entity/Sku.cfc:L360-L365] - a memoised
   * `this.setting('skuCurrency')`.
   *
   * There is no hardcoded `"USD"` here and none in `Sku.cfc` either.
   */
  public getCurrencyCode(): string {
    if (this.currencyCodeMemo === undefined) {
      if (this.settingsProvider === undefined) {
        throw this.missingCollaborator('settings provider', 'L362');
      }
      this.currencyCodeMemo = this.settingsProvider.setting('skuCurrency');
    }
    return this.currencyCodeMemo;
  }

  /**
   * Must-preserve behaviour #3 - the four-step currency cascade. [model/entity/Sku.cfc:L367-L433]
   *
   * The cascade's own inputs are asynchronous in the target - every `CurrencyConverter` member
   * returns a promise - so the computation cannot live behind this signature.
   *
   * No accessor signature changes, and no accessor ever invents a zero to cover the gap.
   */
  public getCurrencyDetails(): Readonly<Record<string, CurrencyDetail>> {
    return this.currencyDetailsMemo ?? {};
  }

  /**
   * The hydration boundary for the currency cascade.
   *
   * Runs the four-step cascade [model/entity/Sku.cfc:L367-L433] against `sku` and answers the same
   * instance, now carrying its per-currency price map.
   *
   * @param sku the instance to materialise.
   * @param context the batch-resolved cascade inputs.
   */
  public static async hydrate(sku: Sku, context?: SkuCurrencyCascadeContext): Promise<Sku> {
    await sku.materializeCurrencyDetails(context);

    return sku;
  }

  /**
   * Resolves the cascade inputs that do not vary from one sku to the next.
   *
   * @param settingsProvider the settings port, for the two keys named above.
   * @param currencyConverter the currency port, held on the returned context for Step 3's per-sku
   * conversions.
   */
  public static async resolveCurrencyCascadeContext(
    settingsProvider: SettingsProvider,
    currencyConverter: CurrencyConverter,
  ): Promise<SkuCurrencyCascadeContext> {
    // [model/entity/Sku.cfc:L385, L418, L422, L425] and [model/entity/Sku.cfc:L373] resolved once,
    // for every sku that will be built against this context.
    const skuCurrencySetting = settingsProvider.setting('skuCurrency');
    const eligibleCurrenciesSetting = settingsProvider.setting('skuEligibleCurrencies');

    // Step 0 the eligibility gate [model/entity/Sku.cfc:L373]:
    // `if(len(setting('skuEligibleCurrencies')))`.
    if (cfLen(eligibleCurrenciesSetting) === 0) {
      return { eligibilityGateOpen: false };
    }

    // LEGACY-NOTE [model/entity/Sku.cfc:L379, L381, L385, L400, L418, L422, L425, L426]: the
    // legacy iterates Currency entities and reads `getCurrencyCode()` off each one.
    const eligibleCurrencies =
      await currencyConverter.getCurrenciesByCurrencyCodeList(eligibleCurrenciesSetting);

    // LEGACY-NOTE [model/entity/Sku.cfc:L418]: `toCurrencyCode` validates the three-character
    // shape and raises on a malformed value.
    return {
      eligibilityGateOpen: true,
      skuCurrencySetting,
      baseCurrencyCode: toCurrencyCode(skuCurrencySetting),
      eligibleCurrencies,
      currencyConverter,
    };
  }

  /**
   * Runs the four-step currency cascade and seeds the instance memo.
   *
   * The gate does not wrap the whole body, contrary to the common description of this method as
   * "entirely wrapped in `if(len(setting('skuEligibleCurrencies')))`".
   *
   * And why the port can still fuse [model/entity/Sku.cfc:L371] with [model/entity/Sku.cfc:L375].
   */
  private async materializeCurrencyDetails(context?: SkuCurrencyCascadeContext): Promise<void> {
    // [model/entity/Sku.cfc:L368] `if(!structKeyExists(variables, "currencyDetails"))` the memo
    // guard. A second call is a no-op, exactly as in the legacy.
    if (this.currencyDetailsMemo !== undefined) {
      return;
    }

    /**
     * The writable form of {@link CurrencyDetail}, derived so the two cannot drift apart.
     */
    type MutableCurrencyDetail = {
      -readonly [K in keyof CurrencyDetail]: CurrencyDetail[K];
    };

    // [model/entity/Sku.cfc:L369] OUTSIDE the GATE the memo is established first, and it is what
    // this instance answers if the gate turns out to be closed.
    const currencyDetails: Record<string, MutableCurrencyDetail> = {};

    // [model/entity/Sku.cfc:L371] outside the gate the `getService("currencyService")` locator
    // site, eliminated (T2).
    let cascadeContext = context;

    if (cascadeContext === undefined) {
      if (this.settingsProvider === undefined) {
        throw this.missingCollaborator('settings provider', 'L373');
      }
      if (this.currencyConverter === undefined) {
        throw this.missingCollaborator('currency converter', 'L371');
      }

      cascadeContext = await Sku.resolveCurrencyCascadeContext(
        this.settingsProvider,
        this.currencyConverter,
      );
    }

    // When it is closed the memo stays `{}` and every `getPriceByCurrencyCode()` yields nothing.
    if (cascadeContext.eligibilityGateOpen) {
      // [model/entity/Sku.cfc:L375]
      // `addInFilter('currencyCode', setting('skuEligibleCurrencies'))` fused with
      // [model/entity/Sku.cfc:L377] `getRecords()`, and both already performed see the note above
      // and {@link Sku.resolveCurrencyCascadeContext}.
      const { skuCurrencySetting, baseCurrencyCode, eligibleCurrencies, currencyConverter } =
        cascadeContext;

      // [model/entity/Sku.cfc:L377]
      // `for(var i = 1; i<=arrayLen(eligibleCurrencySL.getRecords()); i++)`
      for (const thisCurrency of eligibleCurrencies) {
        // Considered, with `skuCurrencyID` seeded to `""`.
        //
        // Nothing here pre-seeds a price sub-key, with a zero or with `undefined`.
        const detail: MutableCurrencyDetail = { skuCurrencyID: '' };
        currencyDetails[thisCurrency] = detail;

        // step 1 [model/entity/Sku.cfc:L385-L397] the sku's own columns, for the base
        // currency.
        if (cfEquals(thisCurrency, skuCurrencySetting)) {
          // LEGACY-NOTE [model/entity/Sku.cfc:L386, L390, L417, L421]: these four `isNull` guards
          // are STATICALLY SATISFIED in the target, because [model/entity/Sku.cfc:L55-L57] declare
          // `default="0"` on all three money columns so they can never be null.
          detail.renewalPrice = this.renewalPrice;
          detail.renewalPriceFormatted = Sku.formatCurrency(this.renewalPrice);
          detail.listPrice = this.listPrice;
          detail.listPriceFormatted = Sku.formatCurrency(this.listPrice);

          // [model/entity/Sku.cfc:L394-L395] `price` is written UNCONDITIONALLY, with no guard of
          // any kind in the legacy source.
          detail.price = this.price;
          detail.priceFormatted = Sku.formatCurrency(this.price);
          detail.converted = false;
        }

        // step 2 [model/entity/Sku.cfc:L399-L414] per-currency override rows from
        // `SwSkuCurrency`
        //
        // LEGACY-DEFECT [model/entity/Sku.cfc:L399-L414]: the absence of a `break` makes the
        // winning override row depend on row order, which no `ORDER BY` fixes.
        // Preserved deliberately; do not fix without a product decision.
        for (const skuCurrency of this.skuCurrencies) {
          // LEGACY-NOTE [model/entity/Sku.cfc:L400]: CFML `eq`, case-insensitive implemented
          // explicitly, as at [model/entity/Sku.cfc:L385].
          if (!cfEquals(skuCurrency.getCurrencyCode(), thisCurrency)) {
            continue;
          }

          // [model/entity/Sku.cfc:L401-L404] The legacy's own `isNull()` guard, reproduced where
          // the legacy put it. It is not redundant: [model/entity/SkuCurrency.cfc:L54] declares
          // `default="0"` but no `notnull`, and the ORM default is applied to a new instance
          // rather than to the column, so a stored NULL is readable here.
          const overrideRenewalPrice = skuCurrency.getRenewalPrice();
          // LEGACY-NOTE: `isNullish` carries the CFML `isNull()` semantics - null and undefined
          // both count - but it returns a plain boolean rather than a type predicate, so the
          // `!== undefined` conjunct is what narrows the type for the compiler. Neither is
          // redundant.
          if (!isNullish(overrideRenewalPrice) && overrideRenewalPrice !== undefined) {
            detail.renewalPrice = overrideRenewalPrice;
            detail.renewalPriceFormatted = Sku.formatCurrency(overrideRenewalPrice);
          }

          // [model/entity/Sku.cfc:L405-L408] The same guard on the same terms:
          // [model/entity/SkuCurrency.cfc:L55] also declares `default="0"` and no `notnull`.
          const overrideListPrice = skuCurrency.getListPrice();
          // Same pairing as the renewal-price guard above.
          if (!isNullish(overrideListPrice) && overrideListPrice !== undefined) {
            detail.listPrice = overrideListPrice;
            detail.listPriceFormatted = Sku.formatCurrency(overrideListPrice);
          }

          // LEGACY-NOTE [model/entity/Sku.cfc:L409]: CFML cannot store null in a struct key, so
          // when an override row's `price` is null the assignment leaves the sub-key absent rather
          // than storing a null. The legacy assigns it UNGUARDED, and `price`
          // [model/entity/SkuCurrency.cfc:L53] is the only one of the three money columns that
          // declares no default at all.
          const overridePrice = skuCurrency.getPrice();
          // `isNullish` carries CFML `isNull()` semantics; the `!== undefined` conjunct narrows
          // the type - see the note on the renewal-price guard above.
          if (!isNullish(overridePrice) && overridePrice !== undefined) {
            detail.price = overridePrice;
            detail.priceFormatted = Sku.formatCurrency(overridePrice);
          }

          // [model/entity/Sku.cfc:L411-L412] Both UNCONDITIONAL in the legacy, and both hold
          // non-null values, so both are written even when the override price was null.
          detail.converted = false;
          detail.skuCurrencyID = skuCurrency.getSkuCurrencyID();
        }

        // step 3 [model/entity/Sku.cfc:L416-L428] on-the-fly conversion.
        //
        // Note the mirror image: when Step 3 does run it overwrites whatever
        // `listPrice`/`renewalPrice` Step 2 may have set.
        //
        // The legacy comment at [model/entity/Sku.cfc:L415] reads `// Use a conversion mechinism`
        // the misspelling is preserved here rather than corrected.
        if (!structKeyExists(detail, 'price')) {
          // [model/entity/Sku.cfc:L417-L420] `isNull` statically satisfied see the Step 1 note.
          const convertedRenewalPrice = await currencyConverter.convertCurrency(
            this.renewalPrice,
            baseCurrencyCode,
            thisCurrency,
          );
          detail.renewalPrice = convertedRenewalPrice;
          detail.renewalPriceFormatted = Sku.formatCurrency(convertedRenewalPrice);
          const convertedListPrice = await currencyConverter.convertCurrency(
            this.listPrice,
            baseCurrencyCode,
            thisCurrency,
          );
          detail.listPrice = convertedListPrice;
          detail.listPriceFormatted = Sku.formatCurrency(convertedListPrice);
          const convertedPrice = await currencyConverter.convertCurrency(
            this.price,
            baseCurrencyCode,
            thisCurrency,
          );
          detail.price = convertedPrice;
          detail.priceFormatted = Sku.formatCurrency(convertedPrice);
          detail.converted = true;
        }
      }
    }

    // [model/entity/Sku.cfc:L369]/[model/entity/Sku.cfc:L432] the memo is seeded whether or not
    // the gate opened, which makes a closed gate answer `{}` instead of re-running on every call.
    this.currencyDetailsMemo = currencyDetails;
  }

  /**
   * The root of this sku's product-type path.
   *
   * ASYNC, because `Product.getBaseProductType()` is asynchronous in the target: it is
   * `listFirst(productTypeIDPath)`, the ROOT element of the materialised path.
   *
   * LEGACY-NOTE `model/validation/Product.json`: `baseProductType` sits on a live validation path
   * the schema gates it with `inList` over `"merchandise"` and `"subscription"` so its exact value
   * matters beyond this file.
   */
  public async getBaseProductType(): Promise<string | undefined> {
    if (this.product === undefined) {
      throw new Error(
        `Sku '${this.skuID}': getBaseProductType requires the owning product, which ` +
          `[model/entity/Sku.cfc:L357] dereferences unconditionally.`,
      );
    }
    return this.product.getBaseProductType();
  }

  /**
   * This sku's price for the requesting account. [model/entity/Sku.cfc:L435-L440] - a memoised
   * `getService("priceGroupService").calculateSkuPriceBasedOnCurrentAccount(sku=this)`.
   *
   * ASYNC because the price-group path reaches the account subscription price-group query
   * [model/dao/PriceGroupDAO.cfc:L52-L100].
   */
  public async getCurrentAccountPrice(): Promise<Money> {
    if (this.currentAccountPriceMemo === undefined) {
      if (this.priceGroupResolver === undefined) {
        throw this.missingCollaborator('price-group resolver', 'L437');
      }
      if (this.currentAccountContext === undefined) {
        throw this.missingCollaborator('current-account context', 'L437');
      }
      this.currentAccountPriceMemo =
        await this.priceGroupResolver.calculateSkuPriceBasedOnCurrentAccount(
          this,
          this.currentAccountContext,
        );
    }
    return this.currentAccountPriceMemo;
  }

  /**
   * `true` when this sku is its product's default sku. [model/entity/Sku.cfc:L442-L447] -
   * `if(getProduct().getDefaultSku().getSkuID() == getSkuID())`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L443]: CFML `==` on strings is case-insensitive, so the
   * comparison goes through `cfEquals`.
   */
  public getDefaultFlag(): boolean {
    if (this.product === undefined) {
      throw new Error(
        `Sku '${this.skuID}': getDefaultFlag requires the owning product, which ` +
          `[model/entity/Sku.cfc:L443] dereferences unconditionally.`,
      );
    }
    const defaultSku = this.product.getDefaultSku();
    if (defaultSku === undefined) {
      throw new Error(
        `Sku '${this.skuID}': getDefaultFlag requires the product's default sku, which ` +
          `[model/entity/Sku.cfc:L443] dereferences unconditionally.`,
      );
    }
    return cfEquals(defaultSku.getSkuID(), this.skuID);
  }

  /**
   * The lowest of this sku's three candidate prices. [model/entity/Sku.cfc:L482-L498] -
   * `getPrice()`, then `getSalePrice()`, then `getCurrentAccountPrice()`, ascending-sorted with
   * `prices[1]` taken.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L492]: `arraySort(prices, "numeric", "asc")` is a
   * FLOATING-POINT comparison of currency values, while the target compares through
   * `Money.compare`, which is exact decimal comparison.
   */
  public async getLivePrice(): Promise<Money> {
    if (this.livePriceMemo === undefined) {
      // [model/entity/Sku.cfc:L485] the array is seeded with the base price, then
      // [model/entity/Sku.cfc:L488] the sale price and [model/entity/Sku.cfc:L489] the
      // current-account price are appended, in that order.
      const candidates: Money[] = [this.getPrice(), this.getSalePrice()];
      candidates.push(await this.getCurrentAccountPrice());

      // [model/entity/Sku.cfc:L492]-[model/entity/Sku.cfc:L495] ascending sort then `[1]` i.e. the
      // minimum.
      let lowest: Money = this.getPrice();
      for (const candidate of candidates) {
        if (candidate.isLessThan(lowest)) {
          lowest = candidate;
        }
      }
      this.livePriceMemo = lowest;
    }
    return this.livePriceMemo;
  }

  // non-persistent property methods sale price [model/entity/Sku.cfc:L539-L565]

  /**
   * The winning sale-price detail row for this sku, or nothing. [model/entity/Sku.cfc:L539-L544] -
   * a memoised `getProduct().getSkuSalePriceDetails( getSkuID() )`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L541]: the product's ported `getSkuSalePriceDetails` is
   * ASYNCHRONOUS, being backed by the common-table-expression rewrite of the query-of-queries
   * chain at [model/dao/PromotionDAO.cfc:L544-L588].
   */
  public getSalePriceDetails(): SkuSalePriceDetails {
    return this.salePriceDetail;
  }

  /**
   * This sku's sale price, falling back to its base price.
   *
   * `Money`, never `undefined`, because `getPrice()` is `default="0"` so always present.
   */
  public getSalePrice(): Money {
    const details = this.salePriceDetail;
    if (details !== undefined) {
      return details.salePrice;
    }
    return this.getPrice();
  }

  /**
   * The discount type behind this sku's sale price, or `''`.
   */
  public getSalePriceDiscountType(): string {
    const details = this.salePriceDetail;
    if (details !== undefined) {
      return details.salePriceDiscountType;
    }
    return '';
  }

  /**
   * When this sku's sale price expires, or `''`.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L614-L622]: the corresponding product accessor is
   * spelled `getSalePricExpirationDateTime` missing the `e` in "Price".
   */
  public getSalePriceExpirationDateTime(): Date | '' {
    const details = this.salePriceDetail;
    if (details !== undefined && details.salePriceExpirationDateTime !== undefined) {
      return details.salePriceExpirationDateTime;
    }
    return '';
  }

  /**
   * Whether this sku's stock records can be deleted.
   *
   * LEGACY-DEFECT [model/entity/Sku.cfc:L569]: the memo reaches
   * `skuService.getSkuStocksDeletableFlag`, whose own body
   * [model/service/SkuService.cfc:L281-L282] delegates to a `SkuDAO` member that does not exist, so
   * the flag cannot be answered in the source either. No member is added to the SKU repository port
   * and no query is invented: the stock subsystem is out of scope.
   * Preserved deliberately; do not fix without a product decision.
   */
  public getStocksDeletableFlag(): never {
    throw new Error(
      `Sku '${this.skuID}': getStocksDeletableFlag cannot be evaluated. ` +
        `[model/entity/Sku.cfc:L569] calls skuService.getSkuStocksDeletableFlag, which is ` +
        `absent from the seven-member SkuRepository port, and the stock subsystem is out of ` +
        `scope. LEGACY-DEFECT preserved deliberately; the port is not extended here.`,
    );
  }

  /**
   * A human-readable definition of this sku, built from its options.
   * [model/entity/Sku.cfc:L574-L590].
   *
   * LEGACY-DEFECT [model/entity/Sku.cfc:L583]: `trim(variables.skuDefinition);` is a bare
   * statement whose return value is discarded.
   * Preserved deliberately; do not fix without a product decision.
   *
   * `.trim()` is not called, and `listAppend` passes the element through verbatim.
   */
  public async getSkuDefinition(): Promise<string> {
    if (this.skuDefinitionMemo === undefined) {
      // [model/entity/Sku.cfc:L576] seeded to `""`, and it stays `""` when no branch matches.
      let skuDefinition = '';
      const baseProductType = await this.getBaseProductType();

      if (baseProductType !== undefined && cfEquals(baseProductType, 'contentAccess')) {
        // [model/entity/Sku.cfc:L577-L578] the branch is EMPTY in the source. Nothing to do, and
        // nothing invented.
        skuDefinition = '';
      } else if (baseProductType !== undefined && cfEquals(baseProductType, 'merchandise')) {
        for (const option of this.options) {
          const optionGroup = Sku.requireOptionGroup(option, 'L581');
          const optionGroupName = optionGroup.getOptionGroupName() ?? '';
          const optionName = option.getOptionName() ?? '';
          // [model/entity/Sku.cfc:L581] the element begins with a SPACE, deliberately, and the
          // delimiter is a comma. Both are reproduced character for character.
          skuDefinition = listAppend(skuDefinition, ` ${optionGroupName}: ${optionName}`, ',');
        }
        // [model/entity/Sku.cfc:L583] `trim(variables.skuDefinition);` the discarded result.
      } else if (baseProductType !== undefined && cfEquals(baseProductType, 'subscription')) {
        throw new Error(
          `Sku '${this.skuID}': getSkuDefinition cannot be evaluated for a subscription sku. ` +
            `[model/entity/Sku.cfc:L585] reads getSubscriptionTerm().getSubscriptionTermName() ` +
            `and the JavaRB key 'entity.subscriptionTerm'; SubscriptionTerm is an out-of-scope ` +
            `entity and JavaRB is not ported, so the branch is refused rather than faked.`,
        );
      }

      this.skuDefinitionMemo = skuDefinition;
    }
    return this.skuDefinitionMemo;
  }

  /**
   * Whether any transaction references this sku.
   */
  public async getTransactionExistsFlag(): Promise<boolean> {
    if (this.transactionExistsFlagMemo === undefined) {
      if (this.skuRepository === undefined) {
        throw this.missingCollaborator('sku repository', 'L594');
      }
      // [model/entity/Sku.cfc:L594] `getTransactionExistsFlag( skuID=this.getSkuID() )` named
      // argument, so `productID` is genuinely absent rather than empty.
      this.transactionExistsFlagMemo = await this.skuRepository.getTransactionExistsFlag(
        undefined,
        this.skuID,
      );
    }
    return this.transactionExistsFlagMemo;
  }

  /**
   * Generates this sku's default image file name from its product code and its image-bearing
   * options.
   *
   * Why the ported service composes elsewhere: this member answers only for a sku hydrated with
   * its resolved {@link SkuImageSettingValues}, and
   * `ProductService.processProduct_updateDefaultImageFileNames` holds no such values.
   *
   * @returns the composed file name, e.g.
   * @throws Error when this sku has no product, or when one of its options has no option group.
   */
  public generateImageFileName(): string {
    // [model/entity/Sku.cfc:L135], [model/entity/Sku.cfc:L138] three unguarded `getProduct()`
    // dereferences in the source.
    const product = this.product;
    if (product === undefined) {
      throw new Error(
        `Sku '${this.skuID}': generateImageFileName was called on a sku with no product. ` +
          `[model/entity/Sku.cfc:L135] and [L138] dereference getProduct() without a guard, so ` +
          `this raises in CFML too. No file name is fabricated.`,
      );
    }

    // [model/entity/Sku.cfc:L132] `var optionString = "";`
    let optionString = '';

    // [model/entity/Sku.cfc:L133] `for(var option in getOptions())` the already-materialised
    // array.
    for (const option of this.options) {
      const optionGroup = option.getOptionGroup();
      if (optionGroup === undefined) {
        // LEGACY-NOTE [model/entity/Sku.cfc:L134]: the source dereferences
        // `option.getOptionGroup()` unconditionally against a nullable many-to-one
        // [model/entity/Option.cfc:L59], so a group-less option raises.
        throw new Error(
          `Sku '${this.skuID}': generateImageFileName reached option ` +
            `'${option.getOptionID()}', which has no option group. ` +
            `[model/entity/Sku.cfc:L134] dereferences getOptionGroup() without a guard against a ` +
            `nullable association [model/entity/Option.cfc:L59], so this raises in CFML too.`,
        );
      }

      // [model/entity/Sku.cfc:L134] only image-bearing groups contribute a segment.
      if (optionGroup.getImageGroupFlag()) {
        // [model/entity/Sku.cfc:L135] delimiter, then the sanitised option code.
        optionString += `${this.readOptionCodeDelimiter()}${Sku.sanitizeImageNameSegment(option.getOptionCode())}`;
      }
    }

    // [model/entity/Sku.cfc:L138] sanitised product code, the accumulated option segments, then a
    // literal `.` and the default extension.
    return `${Sku.sanitizeImageNameSegment(product.getProductCode())}${optionString}.${this.readDefaultImageExtension()}`;
  }

  /**
   * Assigns this sku's default image file name.
   *
   * No memo is invalidated here, unlike `setPrice` and its siblings.
   *
   * @param imageFile The composed file name.
   */
  public setImageFile(imageFile: string): void {
    this.imageFile = imageFile;
  }

  /**
   * The host-relative path of this sku's default image.
   *
   * Ported, not refused see the section banner for the full argument.
   *
   * an absent `imageFile` interpolates as an empty string, producing `<base>/product/default/`.
   *
   * @throws Error when the base image URL was not materialised at hydration.
   */
  public getImagePath(): string {
    const settingValues = this.requireImageSettingValues('getImagePath', 'L145-L147');

    // [model/entity/Sku.cfc:L146] `#getImageFile()#` on an unset column interpolates as empty.
    return `${settingValues.baseImageURL}/product/default/${this.imageFile ?? ''}`;
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L149-L151]: `getImage()` renders an `<img>` element through
   * `HibachiAssets`, framework code that is not ported.
   *
   * @param options the resize arguments `Product` forwards.
   */
  public getImage(options?: SkuImageResizeOptions): never {
    throw Sku.imageSubsystemRefusal(`getImage(${options?.size ?? ''})`, 'L149');
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L192-L219]: `getResizedImagePath()` reaches `imageService`
   * at [model/entity/Sku.cfc:L218] one of the nineteen locator sites to resize on demand. Refused:
   * `imageService` has no port and the image subsystem is out of scope.
   */
  public getResizedImagePath(options?: SkuImageResizeOptions): never {
    throw Sku.imageSubsystemRefusal(`getResizedImagePath(${options?.size ?? ''})`, 'L218');
  }
  public getImageExistsFlag(): never {
    throw Sku.imageSubsystemRefusal('getImageExistsFlag', 'L221');
  }

  /**
   * Builds the single, consistent refusal used by the three unportable image members.
   *
   * The reason it names is the reason that actually holds for all three: an out-of-scope
   * collaborator with no port, or a filesystem this runtime does not have.
   */
  private static imageSubsystemRefusal(member: string, locator: string): Error {
    return new Error(
      `Sku.${member} is not ported: [model/entity/Sku.cfc:${locator}] resizes or renders an ` +
        `image rather than composing a path. getImage and getResizedImagePath reach the ` +
        `un-ported imageService at [L189] and [L218]; getImageExistsFlag performs a fileExists ` +
        `check against a server filesystem. Both collaborators are out of scope and neither has ` +
        `a port. The signature exists only so product.ts compiles; no path is fabricated. ` +
        `Sku.getImagePath and Sku.generateImageFileName ARE ported - they are pure composition.`,
    );
  }
  private readOptionCodeDelimiter(): string {
    return this.imageSettingValues?.productImageOptionCodeDelimiter ?? '-';
  }

  /**
   * Answers the materialised value when one was supplied, and otherwise the metadata default the
   * source itself falls back to `{fieldType="text",defaultValue="jpg"}`
   * [model/service/SettingService.cfc:L191].
   */
  private readDefaultImageExtension(): string {
    return this.imageSettingValues?.productImageDefaultExtension ?? 'jpg';
  }

  /**
   * Resolves the materialised image-setting values, or raises naming the gap.
   */
  private requireImageSettingValues(member: string, locator: string): SkuImageSettingValues {
    if (this.imageSettingValues === undefined) {
      throw new Error(
        `Sku '${this.skuID}': ${member} was called on a sku hydrated without image setting ` +
          `values. [model/entity/Sku.cfc:${locator}] reads ` +
          `getHibachiScope().getBaseImageURL(), a framework scope accessor that is resolved ` +
          `outside the domain in this port and so must be supplied at construction. Unlike ` +
          `setting('productImageOptionCodeDelimiter') and ` +
          `setting('productImageDefaultExtension'), it carries no metadata default for CFML to ` +
          `fall back to [model/service/SettingService.cfc:L481-L482], so no default is ` +
          `substituted here either: every candidate value would be a well-formed wrong path ` +
          `rather than a detectable marker.`,
      );
    }
    return this.imageSettingValues;
  }

  /**
   * `reReplaceNoCase(value, "[^a-z0-9\-\_]", "", "all")` [model/entity/Sku.cfc:L135, L138].
   *
   * An absent input becomes `''`: the legacy interpolates a null column as an empty string, the
   * same reading {@link Sku.getImagePath} applies to `getImageFile()`.
   */
  private static sanitizeImageNameSegment(value: string | undefined): string {
    return (value ?? '').replace(/[^a-z0-9\-_]/gi, '');
  }

  // Custom validation methods [model/entity/Sku.cfc:L753-L784], under the long-form banner at
  // [model/entity/Sku.cfc:L753]
  //
  // The framework reaches them through the `hasUnique<Prop>` branch of the eleven-pattern
  // dispatcher at [org/Hibachi/HibachiEntity.cfc:L514].

  /**
   * Validates that no other sku already has this exact option combination.
   * [model/entity/Sku.cfc:L755-L769].
   *
   * Async, necessarily: `getProduct().getSkusBySelectedOptions(...)` reaches the AND-of-EXISTS SQL
   * at [model/dao/SkuDAO.cfc:L107-L128] - must-preserve behaviour.
   *
   * `listAppend` is PURE and emits no LEADING DELIMITER on an empty list, which lets the
   * accumulator start at `''` - load-bearing at [model/entity/Sku.cfc:L760].
   */
  public async hasUniqueOptions(): Promise<boolean> {
    let optionsList = '';
    for (const option of this.options) {
      optionsList = listAppend(optionsList, option.getOptionID());
    }
    if (this.product === undefined) {
      throw new Error(
        `Sku '${this.skuID}': hasUniqueOptions requires the owning product, which ` +
          `[model/entity/Sku.cfc:L763] dereferences unconditionally.`,
      );
    }
    const skus: Sku[] = await this.product.getSkusBySelectedOptions(optionsList);

    // [model/entity/Sku.cfc:L764-L768] the compound condition, character for character.
    const onlySku = skus.length === 1 ? skus[0] : undefined;
    if (skus.length === 0 || (onlySku !== undefined && cfEquals(onlySku.getSkuID(), this.skuID))) {
      return true;
    }
    return false;
  }

  /**
   * Validates that this sku has at most one option per option group.
   * [model/entity/Sku.cfc:L771-L784].
   *
   * Returns `false` on the FIRST duplicate option group and `true` after the loop completes, so an
   * empty option collection answers `true`.
   */
  public hasOneOptionPerOptionGroup(): boolean {
    let optionGroupList = '';
    for (const option of this.options) {
      const optionGroup = Sku.requireOptionGroup(option, 'L776');
      const optionGroupID = optionGroup.getOptionGroupID();
      // [model/entity/Sku.cfc:L776] the case-sensitive `listFind`, reproduced locally.
      if (Sku.listFindCaseSensitive(optionGroupList, optionGroupID)) {
        return false;
      }
      // [model/entity/Sku.cfc:L779] `listAppend` pure, no leading delimiter on an empty list.
      optionGroupList = listAppend(optionGroupList, optionGroupID);
    }
    return true;
  }

  // Deprecated methods [model/entity/Sku.cfc:L882-L912]
  //
  // Every `@hint` is preserved VERBATIM, including the shouty `NEVER USE`. The lint configuration
  // deliberately enables no `no-warning-comments` rule, so deprecation hints and TODOs are legal
  // by design rather than by oversight.

  /**
   * // @hint: USE skuDefinition()
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L885 versus L233]: this deprecated method and the
   * NON-deprecated `getOptionsDisplay()` [model/entity/Sku.cfc:L233-L239] have IDENTICAL bodies
   * the local variable is even spelled the same, `dspOptions`.
   *
   * Uses the THREE-ARGUMENT `listAppend(list, value, delimiter)`, which `src/lib/cfml/list.ts`
   * does declare, so the custom delimiter needs no local substitute.
   */
  public displayOptions(delimiter = ' '): string {
    let dspOptions = '';
    for (const option of this.options) {
      dspOptions = listAppend(dspOptions, option.getOptionName() ?? '', delimiter);
    }
    return dspOptions;
  }

  /**
   * // @hint: USE getOptionsByOptionGroupIDStruct()
   *
   * This method is the proof that defect 18 has no collision: its name resembles the stray write
   * target `variables.OptionsByGroupIDStruct`, but the body delegates and never touches
   * `variables` at all.
   */
  public getOptionsByGroupIDStruct(): Record<string, Option> {
    return this.getOptionsByOptionGroupIDStruct();
  }

  /**
   * // @hint: never use.
   *
   * Unlike the two struct accessors above there is no existence guard, so with two options in the
   * same option group the LAST one WINS here - the opposite of [model/entity/Sku.cfc:L504] and
   * [model/entity/Sku.cfc:L516].
   */
  public getOptionsValueStruct(): Record<string, string> {
    const options: Record<string, string> = {};
    for (const option of this.options) {
      const optionGroup = Sku.requireOptionGroup(option, 'L902');
      const optionGroupName = Sku.requireKey(
        optionGroup.getOptionGroupName(),
        'optionGroupName',
        'L902',
      );
      // No existence guard in the legacy the last option per group name wins.
      putOwnStructKey(options, optionGroupName, option.getOptionID());
    }
    return options;
  }

  /**
   * // @hint: USE getDefaultFlag()
   */
  public isNotDefaultSku(): boolean {
    return !this.getDefaultFlag();
  }
}

// Every member of `model/entity/Sku.cfc` that this port deliberately does not author, with the
// reason.
//
// LEGACY-NOTE [model/entity/Sku.cfc:L622-L637]: `setSubscriptionTerm` and `removeSubscriptionTerm`
// wire an out-of-scope `SubscriptionTerm`. Dropped; the column survives as `subscriptionTermID`.
