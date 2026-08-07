// slatwall-ts - sku / sku-currency / option / option-group test data.
//
// A deterministic factory returning one fully-formed `SwSku` - the sku, its `SwSkuOption` links,
// its `SwSkuCurrency` override rows and the four collaborator doubles those need.
//
// The graph it builds drives the currency resolution cascade [model/entity/Sku.cfc:L367-L433],
// including the Step 0 eligibility gate `if(len(setting('skuEligibleCurrencies')))`
// [model/entity/Sku.cfc:L373], and the four-member AND-of-EXISTS option graph that
// `getSkusBySelectedOptions` matches against. Option instances are SHARED across the members of
// one graph, because the `exists` subquery asks about the same `SwOption` row.
//
// CFML parity [meta/tests/unit/Helper.cfc:L49-L77]: the repository's only legacy
// fixture-construction artifact is a reference pattern rather than a port, and it assigned
// `productData` without `var`.

import { Option } from '../../src/domain/entities/option.js';
import { OptionGroup } from '../../src/domain/entities/optionGroup.js';
import { Sku } from '../../src/domain/entities/sku.js';
import { SkuCurrency } from '../../src/domain/entities/skuCurrency.js';
import { toCurrencyCode } from '../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../src/domain/valueObjects/money.js';
import { listToArray } from '../../src/lib/cfml/list.js';
import { cfEquals } from '../../src/lib/cfml/struct.js';
import { makeProductFixture } from './productFixtures.js';

import type { PriceGroup } from '../../src/domain/entities/priceGroup.js';
import type { PriceGroupRate } from '../../src/domain/entities/priceGroupRate.js';
import type { Product } from '../../src/domain/entities/product.js';
import type {
  SkuHydrationInput,
  SkuImageSettingValues,
  SkuPriceGroupResolver,
} from '../../src/domain/entities/sku.js';
import type { OptionSortTieBreaker } from '../../src/domain/entities/optionGroup.js';
import type { CurrencyConverter } from '../../src/domain/ports/currencyConverter.js';
import type { SettingKey, SettingsProvider } from '../../src/domain/ports/settingsProvider.js';
import type { SkuRepository } from '../../src/domain/ports/skuRepository.js';
import type { CurrencyCode } from '../../src/domain/valueObjects/currencyCode.js';
import type { CfBooleanInput } from '../../src/lib/cfml/truthiness.js';

// Structurally derived types.
//
// JUDGMENT CALL: four types this graph needs are declared outside its dependency whitelist - the
// promotion-reward and promotion-qualifier entities, the sale-price detail projection and the
// per-request current-account context.

/**
 * Element type of any array or readonly array.
 */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The promotion-reward entity as seen through the sku hydration surface: the inverse many-to-many
 * through `SwPromoRewardSku` [model/entity/Sku.cfc:L82] and its mirror `SwPromoRewardExclSku`
 * [model/entity/Sku.cfc:L83].
 */
type PromotionRewardRef = ElementOf<NonNullable<SkuHydrationInput['promotionRewards']>>;

/**
 * The promotion-qualifier entity as seen through the sku hydration surface: `SwPromoQualSku`
 * [model/entity/Sku.cfc:L84] and its exclusion mirror `SwPromoQualExclSku`
 * [model/entity/Sku.cfc:L85].
 */
type PromotionQualifierRef = ElementOf<NonNullable<SkuHydrationInput['promotionQualifiers']>>;

/**
 * The sale-price projection this sku answers `getSalePrice()` from.
 *
 * CFML parity [model/entity/Sku.cfc:L539-L544]: the legacy memo is filled by
 * `getProduct().getSkuSalePriceDetails( getSkuID() )`, which returns `{}` on a miss
 * [model/entity/Product.cfc:L182-L187].
 */
type SalePriceDetailRef = NonNullable<SkuHydrationInput['salePriceDetail']>;

/**
 * The per-request current-account context.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L262-L268]: the legacy reached the logged-in
 * account through the ambient `getSlatwallScope()` / `getHibachiScope()` accessors.
 */
type CurrentAccountContextRef = NonNullable<SkuHydrationInput['currentAccountContext']>;

// Variant discriminators. Every variation flows through the SINGLE `overrides` parameter as a
// discriminated field, so the caller selects a shape rather than a factory.

/**
 * Which member of the canonical four-sku AND-of-EXISTS graph to return.
 *
 * When this field is set, all four members are constructed and wired into one shared product and
 * the requested one is returned.
 */
type AndOfExistsMember = 'A' | 'B' | 'C' | 'D';

/**
 * The order the option groups are handed to the graph in.
 *
 * CFML parity [model/entity/OptionGroup.cfc:L70]: the association carries `orderby="sortOrder"` at
 * the ORM level, so Hibernate returned groups pre-sorted.
 */
type OptionGroupOrder = 'sortOrder' | 'reversed';

/**
 * Which `SwSkuCurrency` shape the sku carries, and therefore which cascade step wins for the
 * non-base currency.
 */
type SkuCurrencyVariant =
  /**
   * No rows at all. The base currency resolves through Step 1; every other eligible currency falls
   * through to Step 3 and is converted.
   */
  | 'none'
  /**
   * The documented default. One row for the NON-BASE currency carrying all three prices, so Step 2
   * wins and Step 3 is skipped - what validated persisted data looks like.
   */
  | 'secondaryOverride'
  /**
   * The highest-value variant in this file. One row for the non-base currency whose `price` is
   * present but whose `listPrice` and `renewalPrice` are absent, which strands both permanently -
   * see the header.
   */
  | 'secondaryPriceOnly'
  /**
   * Two rows for the same non-base currency carrying DIFFERENT prices.
   */
  | 'secondaryDuplicated'
  /**
   * One row for the non-base currency whose `price` is absent while `listPrice` is present -
   * invalid by validation.
   */
  | 'secondaryPriceAbsent'
  | 'baseOverride';

// Overrides. Declared here and not exported: the shape is an implementation detail of this
// factory.

interface SkuFixtureOverrides {
  /**
   * Prefix for every identifier this graph mints, so two graphs in one suite cannot collide.
   * Defaults to `'skfx'`.
   */
  readonly idPrefix?: string | undefined;

  /**
   * Overrides the derived `skuID`. Defaults to `` `${idPrefix}-sku` ``.
   */
  readonly skuID?: string | undefined;

  /**
   * CFML parity [model/entity/Sku.cfc:L53]: `activeFlag` defaults to `1`, i.e. `true`.
   */
  readonly activeFlag?: CfBooleanInput;

  /**
   * `SwSku.skuCode` is `unique="true" length="50"` [model/entity/Sku.cfc:L54] and
   * `model/validation/Sku.json` makes it required and unique, so graph members differ.
   */
  readonly skuCode?: string | undefined;

  /**
   * `big_decimal` [model/entity/Sku.cfc:L55], `default="0"`.
   */
  readonly listPrice?: Money | undefined;

  /**
   * `big_decimal` [model/entity/Sku.cfc:L56], `default="0"`, required on save.
   */
  readonly price?: Money | undefined;

  /**
   * `big_decimal` [model/entity/Sku.cfc:L57], `default="0"`.
   */
  readonly renewalPrice?: Money | undefined;

  /**
   * `SwSku.imageFile`, length 50 [model/entity/Sku.cfc:L58].
   */
  readonly imageFile?: string | undefined;

  /**
   * The three resolved image setting values `generateImageFileName` and `getImagePath` compose
   * with.
   *
   * ABSENT by DEFAULT, and that default is the interesting case rather than a shortcut: a sku
   * built without them REFUSES both methods.
   */
  readonly imageSettingValues?: SkuImageSettingValues | undefined;
  readonly userDefinedPriceFlag?: CfBooleanInput;

  /**
   * The denormalized quantity cache column [model/entity/Sku.cfc:L62].
   */
  readonly calculatedQATS?: number | undefined;
  readonly remoteID?: string | undefined;

  /**
   * Whether the sku reports itself unsaved. Defaults to `false`, matching the entity.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L600-L605]: `setProduct` short-circuits its containment
   * probe with `isNew() or...`, so a new sku is appended without the probe.
   */
  readonly isNew?: boolean | undefined;

  /**
   * Opaque identifier standing in for the out-of-scope `SwSubscriptionTerm` FK
   * [model/entity/Sku.cfc:L66].
   */
  readonly subscriptionTermID?: string | undefined;

  /**
   * `SwAlternateSkuCode` identifiers [model/entity/Sku.cfc:L69].
   */
  readonly alternateSkuCodeIDs?: readonly string[] | undefined;

  /**
   * `SwStock` identifiers [model/entity/Sku.cfc:L73].
   */
  readonly stockIDs?: readonly string[] | undefined;

  /**
   * `SwSkuAccessContent` identifiers [model/entity/Sku.cfc:L77] - out of scope.
   */
  readonly accessContentIDs?: readonly string[] | undefined;

  /**
   * `SwSkuSubsBenefit` identifiers [model/entity/Sku.cfc:L78] - out of scope.
   */
  readonly subscriptionBenefitIDs?: readonly string[] | undefined;

  /**
   * `SwSkuRenewalSubsBenefit` identifiers [model/entity/Sku.cfc:L79] - out of scope.
   */
  readonly renewalSubscriptionBenefitIDs?: readonly string[] | undefined;

  /**
   * `SwPhysicalSku` identifiers [model/entity/Sku.cfc:L87].
   */
  readonly physicalIDs?: readonly string[] | undefined;

  /**
   * Build the canonical four-sku graph and return this member. Absent by default, in which case a
   * single sku carrying the full option set is built and is the only candidate.
   */
  readonly andOfExistsMember?: AndOfExistsMember | undefined;

  /**
   * Supply the option set outright, bypassing the generated pool.
   */
  readonly options?: readonly Option[] | undefined;

  /**
   * Which order the generated option groups are handed over in. Defaults to `'sortOrder'`.
   */
  readonly optionGroupOrder?: OptionGroupOrder | undefined;

  /**
   * Add a FOURTH option belonging to the FIRST option group, so one sku carries two options from
   * the same group. Defaults to `false`.
   *
   * Invalid by validation, and labelled so deliberately: `model/validation/Sku.json` wires
   * `hasOneOptionPerOptionGroup` [model/entity/Sku.cfc:L772-L784] onto `options` for the `save`
   * context.
   */
  readonly duplicateOptionGroupOption?: boolean | undefined;

  /**
   * The deterministic tie-breaker each generated option group is given.
   */
  readonly optionSortTieBreaker?: OptionSortTieBreaker | undefined;

  /**
   * The value the settings double answers for `skuCurrency`.
   */
  readonly skuCurrency?: string | undefined;

  /**
   * The value the settings double answers for `skuEligibleCurrencies`. Defaults to `'USD,EUR'` -
   * two currencies, for the reason in the header.
   */
  readonly skuEligibleCurrencies?: string | undefined;

  /**
   * Which `SwSkuCurrency` shape to generate. Defaults to `'secondaryOverride'`.
   */
  readonly skuCurrencyVariant?: SkuCurrencyVariant | undefined;

  /**
   * Supply the `SwSkuCurrency` rows outright, bypassing the generated variant. Copied into a fresh
   * array owned by the returned sku.
   */
  readonly skuCurrencies?: readonly SkuCurrency[] | undefined;

  /**
   * Multipliers the currency-converter double applies, keyed by TARGET currency code and looked up
   * case-insensitively. Defaults to `{ EUR: '0.90' }`.
   *
   * Every value is a DECIMAL STRING, never a JavaScript number, because the double multiplies
   * through `Money` and money never touches a float.
   */
  readonly conversionRates?: Readonly<Record<string, string>> | undefined;

  /**
   * The owning product. Built by `makeProductFixture` when omitted; pass `undefined` explicitly to
   * leave the sku detached.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L65]: `product` is a REQUIRED many-to-one in the schema and
   * several sku methods dereference it with no guard, so a detached sku is a deliberately
   * degenerate shape whose only purpose is to reach those refusals.
   */
  readonly product?: Product | undefined;

  /**
   * Extra skus the product's option-resolution repository double should consider, on top of the
   * graph this call builds. Copied on the way in.
   */
  readonly selectedOptionsCandidateSkus?: readonly Sku[] | undefined;

  /**
   * The sale-price projection the returned sku answers from. ABSENT by default.
   *
   * JUDGMENT CALL: absence is the interesting default, because it is what makes the legacy
   * fall-back path reachable - see the annotation further down. Supplying one pins the hit
   * instead.
   */
  readonly salePriceDetail?: SalePriceDetailRef | undefined;

  /**
   * The `SwPriceGroupRateSku` link rows this sku participates in [model/entity/Sku.cfc:L86].
   * Defaults to `[]`; build real ones with the price-group fixture.
   *
   * There is no exclusion side on `Sku`, and none may be invented.
   */
  readonly priceGroupRates?: readonly PriceGroupRate[] | undefined;

  /**
   * What the price-group resolver double answers for `calculateSkuPriceBasedOnPriceGroup`.
   * Defaults to the sku's own price, because
   * CFML parity [model/service/PriceGroupService.cfc:L301-L314] makes that the legacy's explicit
   * pass-through when no rate applies.
   */
  readonly priceGroupPrice?: Money | undefined;

  /**
   * What the price-group resolver double answers for `calculateSkuPriceBasedOnCurrentAccount`.
   */
  readonly currentAccountPrice?: Money | undefined;

  /**
   * The per-request account context. Defaults to a context carrying a derived opaque `accountID`;
   * pass `undefined` to reach the entity's refusal.
   */
  readonly currentAccountContext?: CurrentAccountContextRef | undefined;

  /**
   * `SwPromoRewardSku` link rows [model/entity/Sku.cfc:L82]. Defaults to `[]`.
   */
  readonly promotionRewards?: readonly PromotionRewardRef[] | undefined;

  /**
   * `SwPromoRewardExclSku` link rows [model/entity/Sku.cfc:L83]. Defaults to `[]`.
   */
  readonly promotionRewardExclusions?: readonly PromotionRewardRef[] | undefined;

  /**
   * `SwPromoQualSku` link rows [model/entity/Sku.cfc:L84]. Defaults to `[]`.
   */
  readonly promotionQualifiers?: readonly PromotionQualifierRef[] | undefined;

  /**
   * `SwPromoQualExclSku` link rows [model/entity/Sku.cfc:L85]. Defaults to `[]`.
   */
  readonly promotionQualifierExclusions?: readonly PromotionQualifierRef[] | undefined;

  /**
   * Replaces the generated settings double outright.
   */
  readonly settingsProvider?: SettingsProvider | undefined;

  /**
   * Replaces the generated currency-converter double outright.
   */
  readonly currencyConverter?: CurrencyConverter | undefined;

  /**
   * Replaces the generated price-group resolver double outright.
   */
  readonly priceGroupResolver?: SkuPriceGroupResolver | undefined;

  /**
   * Replaces the generated sku repository double outright.
   */
  readonly skuRepository?: SkuRepository | undefined;

  /**
   * What the sku repository double answers for `getTransactionExistsFlag`. Defaults to `false`.
   *
   * CFML parity [model/dao/SkuDAO.cfc:L53]: the legacy counts order-item rows. Nothing is
   * persisted here, so `false` is the honest answer - and it is what unblocks the delete guard
   * `model/validation/Sku.json` places on `transactionExistsFlag`.
   */
  readonly transactionExistsFlag?: boolean | undefined;
}

// Documented defaults. Immutable primitives only, per the module-scope rule in the header.

/**
 * Identifier prefix. Distinct from the sibling fixtures' `'prfx'`.
 */
const DEFAULT_ID_PREFIX = 'skfx';

/**
 * CFML parity [model/entity/Sku.cfc:L53] versus [model/entity/Product.cfc:L53]: `Sku.activeFlag`
 * carries `default="1"` and `Product.activeFlag` carries no default. Modelled, not harmonised.
 */
const DEFAULT_ACTIVE_FLAG = true;
const DEFAULT_USER_DEFINED_PRICE_FLAG = false;

/**
 * `unique="true" length="50"` [model/entity/Sku.cfc:L54]. Shaped after `Helper.cfc`'s
 * `TESTPRODUCTXXX` so the lineage of the reference pattern stays visible.
 */
const LEGACY_SKU_CODE = 'TESTSKUXXX';

/**
 * The reference-calculation unit price. See the note on `SkuFixtureOverrides.price`.
 */
const SKU_PRICE = '19.99';

/**
 * `big_decimal` [model/entity/Sku.cfc:L55]. Above `SKU_PRICE`, as a list price is.
 */
const SKU_LIST_PRICE = '24.99';
const SKU_RENEWAL_PRICE = '17.99';

/**
 * The ORM default for all three money columns [model/entity/Sku.cfc:L55-L57], as a decimal string
 * rather than the number `0`. A real persisted value, not a stand-in for absence.
 */
const ZERO_DECIMAL = '0';

/**
 * The `skuCurrency` setting value [model/service/SettingService.cfc:L221].
 */
const BASE_CURRENCY_CODE = 'USD';

/**
 * The second eligible currency, which is what makes Step 2 and Step 3 separable.
 */
const SECONDARY_CURRENCY_CODE = 'EUR';

/**
 * The `skuEligibleCurrencies` setting value [model/service/SettingService.cfc:L222].
 */
const ELIGIBLE_CURRENCIES = `${BASE_CURRENCY_CODE},${SECONDARY_CURRENCY_CODE}`;

/**
 * Multiplier the converter double applies for the secondary currency.
 */
const SECONDARY_CONVERSION_RATE = '0.90';

/**
 * `SwSkuCurrency.price` for the secondary currency [model/entity/SkuCurrency.cfc:L53].
 */
const SECONDARY_OVERRIDE_PRICE = '17.49';
const SECONDARY_OVERRIDE_LIST_PRICE = '21.99';
const SECONDARY_OVERRIDE_RENEWAL_PRICE = '15.49';

/**
 * The price on the FIRST of two same-currency rows in the `'secondaryDuplicated'` variant, far
 * from `SECONDARY_OVERRIDE_PRICE` so a suite cannot pass while reading the wrong row.
 */
const SECONDARY_SUPERSEDED_PRICE = '8.88';

/**
 * `SwSkuCurrency.price` for the base currency in the `'baseOverride'` variant.
 */
const BASE_OVERRIDE_PRICE = '18.49';

/**
 * The denormalized quantity cache column [model/entity/Sku.cfc:L62].
 */
const CALCULATED_QATS = 7;
const REMOTE_ID = 'remote-test-sku';

/**
 * The audit timestamps [model/entity/Sku.cfc:L93, L95]. They match the sibling fixtures.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * `SwOptionGroup.optionGroupCode` values. All match `ENTITY_CODE_PATTERN`.
 */
const OPTION_GROUP_1_CODE = 'size';
const OPTION_GROUP_2_CODE = 'color';
const OPTION_GROUP_3_CODE = 'material';

/**
 * `SwOptionGroup.optionGroupName` values [model/entity/OptionGroup.cfc:L53].
 */
const OPTION_GROUP_1_NAME = 'Size';
const OPTION_GROUP_2_NAME = 'Color';
const OPTION_GROUP_3_NAME = 'Material';

/**
 * CFML parity `model/validation/Option.json` and `model/validation/OptionGroup.json`: `optionCode`
 * and `optionGroupCode` are each `required`, `unique` `AND` constrained by
 * `^[a-zA-Z0-9-_.|:~^]+$`.
 */
const OPTION_1_CODE = 'size-large';
const OPTION_2_CODE = 'color-red';
const OPTION_3_CODE = 'material-cotton';
const OPTION_4_CODE = 'size-small';

/**
 * `SwOption.optionName` values [model/entity/Option.cfc:L54].
 */
const OPTION_1_NAME = 'Large';
const OPTION_2_NAME = 'Red';
const OPTION_3_NAME = 'Cotton';
const OPTION_4_NAME = 'Small';

/**
 * `SwOptionGroup.sortOrder` values [model/entity/OptionGroup.cfc:L58], declared
 * `ormtype="integer" required="true"` with no default.
 */
const OPTION_GROUP_1_SORT_ORDER = 1;
const OPTION_GROUP_2_SORT_ORDER = 2;
const OPTION_GROUP_3_SORT_ORDER = 3;

/**
 * `SwOption.sortOrder` values [model/entity/Option.cfc:L56].
 *
 * CFML parity [model/entity/Option.cfc:L56] versus [model/entity/OptionGroup.cfc:L58]:
 * `Option.sortOrder` LACKS the `required="true"` its group carries and adds
 * `sortContext="optionGroup"`, so option ordering is scoped per GROUP. Preserved, not harmonised.
 */
const OPTION_1_SORT_ORDER = 1;
const OPTION_2_SORT_ORDER = 2;
const OPTION_3_SORT_ORDER = 3;
const OPTION_4_SORT_ORDER = 4;

/**
 * [model/entity/OptionGroup.cfc:L57] `imageGroupFlag` `default="0"`.
 */
const IMAGE_GROUP_FLAG = false;

/**
 * What the product's `nextOptionGroupSortOrder` reports: the highest group sort order plus one.
 *
 * LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder` deletes the
 * cached value only `<cfif not structKeyExists(variables,...)>` - an INVERTED condition, so it can
 * never fire and the cache survives for the component's whole lifetime.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-NOTE [model/dao/SkuDAO.cfc:L210-L214]: on an EMPTY `SwOptionGroup` table `max()` still
 * returns one row holding NULL, so `recordCount` is truthy and `NULL + 1` misbehaves.
 */
const NEXT_OPTION_GROUP_SORT_ORDER = OPTION_GROUP_3_SORT_ORDER + 1;

/**
 * The constant every generated option group's sort tie-breaker returns, replacing the
 * `randRange(1,100)` fallback at [model/service/HibachiUtilityService.cfc:L522].
 */
const OPTION_SORT_TIE_BREAKER_VALUE = 1;

/**
 * The value the caller wrote for `key`, or the documented default when the key was not written.
 *
 * Distinguishing "omitted" from "explicitly `undefined`" is not pedantry:
 * `exactOptionalPropertyTypes` is on, and `product`.
 */
function resolveOverride<TKey extends keyof SkuFixtureOverrides>(
  overrides: SkuFixtureOverrides | undefined,
  key: TKey,
  documentedDefault: SkuFixtureOverrides[TKey],
): SkuFixtureOverrides[TKey] {
  if (hasOverride(overrides, key)) {
    return overrides?.[key];
  }
  return documentedDefault;
}

/**
 * Was `key` written by the caller at all, whatever value it carries?
 */
function hasOverride(
  overrides: SkuFixtureOverrides | undefined,
  key: keyof SkuFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

// Module-scope pure builders. Functions, never data - see the no-mutable-module-state rule in the
// header.

/**
 * The audit columns every entity in one graph carries.
 */
type AuditTrail = {
  readonly createdDateTime: Date;
  readonly createdByAccountID: string;
  readonly modifiedDateTime: Date;
  readonly modifiedByAccountID: string;
};

/**
 * Fresh `Date` instances per graph: a `Date` is mutable, so it is never shared.
 */
function makeAuditTrail(idPrefix: string): AuditTrail {
  return {
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: `${idPrefix}-account-created`,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: `${idPrefix}-account-modified`,
  };
}

/**
 * A deterministic replacement for the option sort tie-breaker. A fresh closure per call, so no two
 * groups share one function object.
 */
function makeDeterministicOptionSortTieBreaker(): OptionSortTieBreaker {
  return (): number => OPTION_SORT_TIE_BREAKER_VALUE;
}

/**
 * The three option groups, freshly built, in the requested order.
 *
 * JUDGMENT CALL: `setOptionGroup` does not do the filling, because of the double-append hazard
 * recorded in the header; the graph is built directly and each array appended to once per option.
 *
 * JUDGMENT CALL: the same `optionSortTieBreaker` reference is handed to all three groups. It is a
 * pure function holding no state, so sharing it shares nothing - the copy-per-graph rule exists to
 * stop two graphs mutating one another.
 *
 * LEGACY-NOTE [model/entity/OptionGroup.cfc:L73-L79]: the legacy `getOptions()` returns
 * `variables.Options` with a CAPITAL O, which works only because CFML variable names are
 * case-insensitive.
 */
function makeFixtureOptionGroups(
  idPrefix: string,
  order: OptionGroupOrder,
  optionSortTieBreaker: OptionSortTieBreaker | undefined,
): OptionGroup[] {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  const groupOne: OptionGroup = new OptionGroup({
    optionGroupID: `${idPrefix}-optiongroup-1`,
    optionGroupName: OPTION_GROUP_1_NAME,
    optionGroupCode: OPTION_GROUP_1_CODE,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: IMAGE_GROUP_FLAG,
    sortOrder: OPTION_GROUP_1_SORT_ORDER,
    remoteID: undefined,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    options: [],
    optionSortTieBreaker,
  });

  const groupTwo: OptionGroup = new OptionGroup({
    optionGroupID: `${idPrefix}-optiongroup-2`,
    optionGroupName: OPTION_GROUP_2_NAME,
    optionGroupCode: OPTION_GROUP_2_CODE,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: IMAGE_GROUP_FLAG,
    sortOrder: OPTION_GROUP_2_SORT_ORDER,
    remoteID: undefined,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    options: [],
    optionSortTieBreaker,
  });

  const groupThree: OptionGroup = new OptionGroup({
    optionGroupID: `${idPrefix}-optiongroup-3`,
    optionGroupName: OPTION_GROUP_3_NAME,
    optionGroupCode: OPTION_GROUP_3_CODE,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: IMAGE_GROUP_FLAG,
    sortOrder: OPTION_GROUP_3_SORT_ORDER,
    remoteID: undefined,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    options: [],
    optionSortTieBreaker,
  });

  // 'reversed' hands them over descending - what a repository that forgot
  // [model/entity/OptionGroup.cfc:L70]'s `orderby="sortOrder"` would produce.
  return order === 'reversed' ? [groupThree, groupTwo, groupOne] : [groupOne, groupTwo, groupThree];
}

/**
 * The option pool, freshly built, one option per group - plus optionally a fourth duplicating the
 * first group. The pool is the shared-identity boundary: every sku in one graph draws its options
 * from it rather than building its own.
 *
 * LEGACY-NOTE [model/entity/Option.cfc:L66]: `Option.skus` is the INVERSE side of `SwSkuOption`
 * and is constructor-only here, so these options report an empty `getSkus()`.
 *
 * LEGACY-NOTE [model/entity/Option.cfc:L67-L70]: `Option` is the only entity in this slice
 * carrying both the inclusion and the exclusion side for both promotion rewards and qualifiers;
 * `Product` and `Sku` carry the inclusion sides only.
 */
function makeFixtureOptionPool(
  idPrefix: string,
  groups: readonly OptionGroup[],
  includeDuplicateGroupOption: boolean,
): Option[] {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  const option = (
    ordinal: number,
    optionCode: string,
    optionName: string,
    sortOrder: number,
    groupCode: string,
  ): Option =>
    new Option({
      optionID: `${idPrefix}-option-${String(ordinal)}`,
      optionCode,
      optionName,
      optionDescription: undefined,
      sortOrder,
      optionGroup: findOptionGroupByCode(groups, groupCode),
      defaultImageID: undefined,
      remoteID: undefined,
      createdDateTime: audit.createdDateTime,
      createdByAccountID: audit.createdByAccountID,
      modifiedDateTime: audit.modifiedDateTime,
      modifiedByAccountID: audit.modifiedByAccountID,
    });

  const pool: Option[] = [
    option(1, OPTION_1_CODE, OPTION_1_NAME, OPTION_1_SORT_ORDER, OPTION_GROUP_1_CODE),
    option(2, OPTION_2_CODE, OPTION_2_NAME, OPTION_2_SORT_ORDER, OPTION_GROUP_2_CODE),
    option(3, OPTION_3_CODE, OPTION_3_NAME, OPTION_3_SORT_ORDER, OPTION_GROUP_3_CODE),
  ];

  if (includeDuplicateGroupOption) {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L500-L510]: getOptionsByOptionGroupCodeStruct guards at
    // L501 on the code-keyed memo, then initialises the ID-keyed one on the line below - the WRONG
    // key, so the guard and the assignment never agree.
    // Preserved deliberately; do not fix without a product decision.
    //
    // LEGACY-DEFECT [model/entity/Sku.cfc:L512-L522]: getOptionsByOptionGroupIDStruct guards and
    // initialises the right key but L517 writes to `variables.OptionsByGroupIDStruct` - a
    // DIFFERENT NAME, not merely different casing.
    // Preserved deliberately; do not fix without a product decision.
    //
    // JUDGMENT CALL: both are fixed in the target as documented deliberate divergences, being
    // unobservable through the public contract, so this fourth option exercises the FIXED
    // de-duplication branch, otherwise unreachable.
    pool.push(option(4, OPTION_4_CODE, OPTION_4_NAME, OPTION_4_SORT_ORDER, OPTION_GROUP_1_CODE));
  }

  // The inverse collections are completed here rather than through `setOptionGroup`, per the
  // double-append hazard in the header.
  for (const held of pool) {
    const owningGroup: OptionGroup | undefined = held.getOptionGroup();
    if (owningGroup !== undefined) {
      owningGroup.getOptions().push(held);
    }
  }

  return pool;
}

/**
 * The group in `groups` whose code matches, compared case-insensitively.
 *
 * CFML parity [model/entity/Sku.cfc:L504]: the legacy keys its struct by `getOptionGroupCode()`
 * and CFML struct keys are case-INSENSITIVE, so a case-respecting comparison would be a
 * divergence.
 */
function findOptionGroupByCode(
  groups: readonly OptionGroup[],
  groupCode: string,
): OptionGroup | undefined {
  return groups.find((candidate: OptionGroup): boolean =>
    cfEquals(candidate.getOptionGroupCode() ?? '', groupCode),
  );
}

/**
 * Which pool positions each member of the canonical graph carries. A function rather than a table,
 * so the array is fresh per call.
 */
function optionIndexesForMember(member: AndOfExistsMember): readonly number[] {
  switch (member) {
    case 'A':
      return [0, 1];
    case 'B':
      return [0];
    case 'C':
      return [0, 1, 2];
    case 'D':
      // No options at all, and that is the point of this member.
      //
      // LEGACY-DEFECT [model/entity/Sku.cfc:L756-L769]: hasUniqueOptions builds `optionsList` from
      // this sku's options, so for an option-less sku the list is `""`; `listLen("")` is 0, no
      // `exists` clause is appended, and the HQL degenerates to
      // `select distinct sku... Inner join sku.options as opt where 0 = 0` plus the productID
      // filter - returning every OPTIONED SKU of the PRODUCT.
      // Preserved deliberately; do not fix without a product decision.
      //
      // JUDGMENT CALL: this edge case is newly catalogued - it is not among the plan's published
      // twenty, and it is deliberately left unnumbered in the port's thirty-entry register, which
      // is closed at thirty.
      return [];
  }
}

/**
 * Every member of the canonical graph, in construction order. A fresh array per call.
 */
function andOfExistsMembers(): readonly AndOfExistsMember[] {
  return ['A', 'B', 'C', 'D'];
}

/**
 * The pool entries named by `indexes`, as a FRESH array.
 */
function selectPoolOptions(pool: readonly Option[], indexes: readonly number[]): Option[] {
  const selected: Option[] = [];
  for (const index of indexes) {
    const candidate: Option | undefined = pool[index];
    if (candidate !== undefined) {
      selected.push(candidate);
    }
  }
  return selected;
}

/**
 * The two settings this sku never reads, present only so the settings double satisfies the port's
 * TOTAL contract: `SettingsProvider.setting` returns `string` and never `undefined`.
 *
 * Verified legacy defaults, in declaration order - the two URL keys
 * [model/service/SettingService.cfc:L178, L179].
 *
 * The reasoning the removed block recorded still holds and is the reason nothing replaces them
 * here: the two image keys reach the SKU by a DIFFERENT route.
 */
const GLOBAL_URL_KEY_PRODUCT = 'sp';
const GLOBAL_URL_KEY_PRODUCT_TYPE = 'spt';

/**
 * A hand-written in-memory stand-in for the settings port, and the only place the base currency
 * enters the graph.
 *
 * JUDGMENT CALL: the double records nothing, a recorded call list not being observable through the
 * `Sku` this factory returns.
 */
function makeFixtureSettingsProvider(
  skuCurrency: string,
  skuEligibleCurrencies: string,
): SettingsProvider {
  const table: Readonly<Record<SettingKey, string>> = {
    globalURLKeyProduct: GLOBAL_URL_KEY_PRODUCT,
    globalURLKeyProductType: GLOBAL_URL_KEY_PRODUCT_TYPE,
    skuCurrency,
    skuEligibleCurrencies,
  };

  return {
    setting(settingName: SettingKey): string {
      return table[settingName];
    },
  };
}

/**
 * A hand-written in-memory stand-in for the currency-converter port.
 *
 * Rates are decimal strings multiplied through `Money`, which closes the gap at
 * [model/service/PromotionService.cfc:L998] where the legacy `amountOff` branch multiplied as a
 * float.
 */
function makeFixtureCurrencyConverter(
  eligibleCurrencies: string,
  conversionRates: Readonly<Record<string, string>>,
): CurrencyConverter {
  // Snapshots taken inside the call, so a later mutation of the caller's own table cannot reach
  // into this graph.
  const rates: Readonly<Record<string, string>> = { ...conversionRates };
  const eligible: string = eligibleCurrencies;

  const parse = (currencyCodeList: string): CurrencyCode[] =>
    listToArray(currencyCodeList).map((entry: string): CurrencyCode => toCurrencyCode(entry));

  const rateFor = (currencyCode: string): string | undefined => {
    // CFML parity [model/entity/Sku.cfc:L385, L400]: the legacy compares codes with `eq`, and CFML
    // struct keys are case-insensitive too.
    for (const [key, value] of Object.entries(rates)) {
      if (cfEquals(key, currencyCode)) {
        return value;
      }
    }
    return undefined;
  };

  return {
    getAllActiveCurrencyIDList(): Promise<CurrencyCode[]> {
      return Promise.resolve(parse(eligible));
    },

    getCurrenciesByCurrencyCodeList(currencyCodeList: string): Promise<CurrencyCode[]> {
      return Promise.resolve(parse(currencyCodeList));
    },

    convertCurrency(
      amount: Money,
      originalCurrencyCode: CurrencyCode,
      convertToCurrencyCode: CurrencyCode,
    ): Promise<Money> {
      if (cfEquals(originalCurrencyCode, convertToCurrencyCode)) {
        return Promise.resolve(amount);
      }

      const rate: string | undefined = rateFor(convertToCurrencyCode);

      if (rate === undefined) {
        // CFML parity [model/service/CurrencyService.cfc:L100-L101]: an unreachable rate returns
        // the amount UNCONVERTED. It does not raise.
        return Promise.resolve(amount);
      }

      return Promise.resolve(amount.times(rate));
    },
  };
}

/**
 * A hand-written in-memory stand-in for the sku repository port.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L276, L282] is why the exception must be called
 * out: CFML copies arrays by VALUE on assignment, so the legacy
 * `var priceGroups = account.getPriceGroups();` followed by `arrayAppend` left the account's
 * collection untouched.
 */
function makeFixtureSkuRepository(
  candidates: readonly Sku[],
  transactionExistsFlag: boolean,
  nextOptionGroupSortOrder: number,
): SkuRepository {
  return {
    getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
      void productID;
      void skuID;

      // CFML parity [model/dao/SkuDAO.cfc:L53]: the legacy counts `SwOrderItem` rows, so `false`
      // is the honest answer here and unblocks the `transactionExistsFlag eq false` delete guard
      // in `model/validation/Sku.json`.
      return Promise.resolve(transactionExistsFlag);
    },

    getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
      // CFML parity [model/dao/SkuDAO.cfc:L102-L104]: the legacy also matches
      // `ascs.alternateSkuCode` through a LEFT JOIN on `alternateSkuCodes`.
      return Promise.resolve(
        candidates.find((candidate: Sku): boolean =>
          cfEquals(candidate.getSkuCode() ?? '', skuCode),
        ),
      );
    },

    getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
      // `every` is the per-option conjunction and the emptiness test below is the `inner join`.
      //
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L163]: a sibling method in the same DAO declares
      // `var hql &= "WHERE sku.product.productID =:productID ";` which combines `var` with a
      // COMPOUND-ASSIGNMENT operator and is not a valid declaration.
      // Preserved deliberately; do not fix without a product decision.
      const selectedOptionIDs: readonly string[] = listToArray(selectedOptions);

      return Promise.resolve(
        candidates.filter((candidate: Sku): boolean => {
          if (candidate.getOptions().length === 0) {
            return false;
          }
          if (productID !== undefined && !skuBelongsToProduct(candidate, productID)) {
            return false;
          }
          return selectedOptionIDs.every((selectedOptionID: string): boolean =>
            skuCarriesOptionID(candidate, selectedOptionID),
          );
        }),
      );
    },

    searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
      void term;
      void productTypeID;

      // CFML parity [model/dao/SkuDAO.cfc:L130-L148]: the legacy matches a search term against sku
      // and product columns and filters on a product-type path. An empty projection is a genuine
      // legacy answer for a term nothing matches.
      return Promise.resolve([]);
    },

    getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
      // CFML parity [model/dao/SkuDAO.cfc:L150-L170]: `fetchOptions` selects an eager option join.
      // Associations are materialized at the repository boundary here, so the options are present
      // either way and the flag changes nothing observable.
      void fetchOptions;

      // A NEW array, not the product's own, matching [model/service/SkuService.cfc:L221], which
      // returns the DAO's result rather than the field.
      return Promise.resolve([...product.getSkus()]);
    },

    getSortedProductSkusID(productID: string): Promise<string[]> {
      // CFML parity [model/dao/SkuDAO.cfc:L178-L198]: the ordering is
      // `SUM(SwOption.sortOrder * POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)) ASC`
      // base-10 positional weighting, so the first option group dominates.
      //
      // LEGACY-NOTE: these weights are ordering integers, not money, so they are not `Money`.
      //
      // TODO [model/dao/SkuDAO.cfc:L177]: the legacy carries a live `<!---
      // TODO: test to see if this query works with DB's other than MSSQL and MySQL --->`.
      //
      // LEGACY-DEFECT [model/service/SkuService.cfc:L236-L237]: the caller indexes its result array
      // with `arrayFind`'s answer and never guards it, so every option-less sku - which this query
      // drops - writes at position 0.
      // Preserved deliberately; do not fix without a product decision.
      const ordered: Sku[] = candidates
        .filter(
          (candidate: Sku): boolean =>
            candidate.getOptions().length > 0 && skuBelongsToProduct(candidate, productID),
        )
        .map((candidate: Sku): { readonly sku: Sku; readonly weight: number } => ({
          sku: candidate,
          weight: positionalOptionWeight(candidate, nextOptionGroupSortOrder),
        }))
        .sort(
          (
            left: { readonly sku: Sku; readonly weight: number },
            right: { readonly sku: Sku; readonly weight: number },
          ): number => left.weight - right.weight,
        )
        .map((entry: { readonly sku: Sku; readonly weight: number }): Sku => entry.sku);

      return Promise.resolve(ordered.map((candidate: Sku): string => candidate.getSkuID()));
    },

    saveSku(sku: Sku): Promise<Sku> {
      // No persistence: the instance is handed straight back, the `ormFlush()` of
      // [meta/tests/unit/Helper.cfc:L61] being deliberately dropped.
      return Promise.resolve(sku);
    },
  };
}

/**
 * Does one candidate sku carry the option named by `selectedOptionID`?
 *
 * CFML parity [model/dao/SkuDAO.cfc:L118]: `o.optionID = ?` bound through `cfqueryparam`, under a
 * MySQL collation that ignores case where TypeScript's `===` would not.
 */
function skuCarriesOptionID(candidate: Sku, selectedOptionID: string): boolean {
  return candidate
    .getOptions()
    .some((held: Option): boolean => cfEquals(held.getOptionID(), selectedOptionID));
}

/**
 * Does one candidate sku belong to the product named by `productID`?
 *
 * CFML parity [model/dao/SkuDAO.cfc:L124]: `and sku.product.id = ?`, the clause appended LAST. A
 * detached sku is excluded, which is what the join would do with a NULL FK.
 */
function skuBelongsToProduct(candidate: Sku, productID: string): boolean {
  const owningProduct: Product | undefined = candidate.getProduct();
  return owningProduct !== undefined && cfEquals(owningProduct.getProductID(), productID);
}

/**
 * The base-10 positional sort weight of one sku's option set.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L197]:
 * `SUM(SwOption.sortOrder * POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder))`. An
 * option whose group has no sort order contributes nothing, matching the INNER JOIN through
 * `SwOptionGroup`.
 */
function positionalOptionWeight(candidate: Sku, nextOptionGroupSortOrder: number): number {
  let weight = 0;

  for (const held of candidate.getOptions()) {
    const owningGroup: OptionGroup | undefined = held.getOptionGroup();
    const optionSortOrder: number | undefined = held.getSortOrder();

    if (owningGroup === undefined || optionSortOrder === undefined) {
      continue;
    }

    weight += optionSortOrder * Math.pow(10, nextOptionGroupSortOrder - owningGroup.getSortOrder());
  }

  return weight;
}

// LEGACY-DEFECT [model/entity/Sku.cfc:L258]: getPriceByPromotion() delegates to
// getService("promotionService").calculateSkuPriceBasedOnPromotion(...), and that method exists
// nowhere in the source, so the call raises.
// Preserved deliberately; do not fix without a product decision.
//
// Answering a plausible number would be inventing an implementation for a method that does not
// exist.

/**
 * A hand-written in-memory stand-in for the sku-facing slice of the price-group service. Three
 * methods, matching the port exactly.
 *
 * `getRateForSkuBasedOnPriceGroup` reproduces the SKU-LEVEL rung only
 * [model/service/PriceGroupService.cfc:L146-L150]: it loops the price group's rates and keeps the
 * LAST one whose `hasSku` answers true.
 */
function makeFixturePriceGroupResolver(
  priceGroupPrice: Money | undefined,
  currentAccountPrice: Money | undefined,
): SkuPriceGroupResolver {
  return {
    calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money {
      void priceGroup;
      return priceGroupPrice ?? sku.getPrice();
    },

    getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined {
      let found: PriceGroupRate | undefined = undefined;
      for (const rate of priceGroup.getPriceGroupRates()) {
        if (rate.hasSku(sku)) {
          // No `break`, on purpose: [model/service/PriceGroupService.cfc:L146-L150] keeps looping,
          // so a later matching rate supersedes an earlier one.
          found = rate;
        }
      }
      return found;
    },

    calculateSkuPriceBasedOnCurrentAccount(
      sku: Sku,
      context: CurrentAccountContextRef,
    ): Promise<Money> {
      void context;

      // CFML parity [model/service/PriceGroupService.cfc:L271-L298]: the legacy seeds its
      // candidate array with `sku.getPrice()` and returns the LOWEST, so defaulting to the base
      // price is the legacy answer for an account with no price groups.
      //
      // LEGACY-NOTE [model/entity/Sku.cfc:L487-L495]: `getLivePrice` appends `getSalePrice()` then
      // `getCurrentAccountPrice()`, sorts `"numeric" "asc"` and takes `prices[1]` - the minimum.
      return Promise.resolve(currentAccountPrice ?? sku.getPrice());
    },
  };
}

/**
 * The `SwSkuCurrency` rows for one variant, freshly built.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L68]: `currencyCode` is declared
 * `insert="false" update="false"`, a read-only projection of the fk, so the entity exposes no
 * setter.
 *
 * LEGACY-NOTE [model/entity/SkuCurrency.cfc:L89-L94]: `setSku` appends `this` when
 * `isNew() or !arguments.sku.hasSkuCurrency( this )`, so calling it twice on a new instance
 * creates two rows. Every row here is handed to the sku through hydration instead.
 */
function makeFixtureSkuCurrencies(
  idPrefix: string,
  variant: SkuCurrencyVariant,
  baseCurrencyCode: string,
  secondaryCurrencyCode: string,
): SkuCurrency[] {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  const row = (
    suffix: string,
    currencyCode: string,
    price: Money | undefined,
    listPrice: Money | undefined,
    renewalPrice: Money | undefined,
  ): SkuCurrency =>
    new SkuCurrency({
      skuCurrencyID: `${idPrefix}-skucurrency-${suffix}`,
      price,
      renewalPrice,
      listPrice,
      currencyCode: toCurrencyCode(currencyCode),
      sku: undefined,
      remoteID: undefined,
      createdDateTime: audit.createdDateTime,
      createdByAccountID: audit.createdByAccountID,
      modifiedDateTime: audit.modifiedDateTime,
      modifiedByAccountID: audit.modifiedByAccountID,
    });

  switch (variant) {
    case 'none':
      return [];

    case 'secondaryOverride':
      // The documented default: one row for the non-base currency carrying all three prices, so
      // Step 2 [model/entity/Sku.cfc:L399-L414] wins and Step 3 is skipped, the `price` key now
      // existing.
      return [
        row(
          'secondary',
          secondaryCurrencyCode,
          Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
          Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
          Money.fromDecimalString(SECONDARY_OVERRIDE_RENEWAL_PRICE),
        ),
      ];

    case 'secondaryPriceOnly':
      // The highest-value shape in this file.
      //
      // LEGACY-DEFECT [model/entity/Sku.cfc:L416]: Step 3 is gated on
      // `if(!structKeyExists(variables.currencyDetails[... ], "price"))` - the price key alone.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The DATA is contract-honest - see the validation contract in the header.
      return [
        row(
          'secondary',
          secondaryCurrencyCode,
          Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
          undefined,
          undefined,
        ),
      ];

    case 'secondaryDuplicated':
      // LEGACY-DEFECT [model/entity/Sku.cfc:L399-L414]: Step 2 loops every `skuCurrencies` entry
      // and its `if` body has no `break`, so when two rows carry the same currency code the LAST
      // one wins for the prices and for the `skuCurrencyID` recorded at
      // [model/entity/Sku.cfc:L412].
      // Preserved deliberately; do not fix without a product decision.
      return [
        row(
          'secondary-first',
          secondaryCurrencyCode,
          Money.fromDecimalString(SECONDARY_SUPERSEDED_PRICE),
          Money.fromDecimalString(SECONDARY_SUPERSEDED_PRICE),
          Money.fromDecimalString(SECONDARY_SUPERSEDED_PRICE),
        ),
        row(
          'secondary-second',
          secondaryCurrencyCode,
          Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
          Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
          Money.fromDecimalString(SECONDARY_OVERRIDE_RENEWAL_PRICE),
        ),
      ];

    case 'secondaryPriceAbsent':
      // Invalid by validation, on purpose and labelled so - `model/validation/SkuCurrency.json`
      // requires `price` on save, so this row could never have been persisted.
      return [
        row(
          'secondary',
          secondaryCurrencyCode,
          undefined,
          Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
          undefined,
        ),
      ];

    case 'baseOverride':
      // One row for the BASE currency, so Step 1 writes the sku's own columns and Step 2 then
      // OVERWRITES them and stamps a `skuCurrencyID` [model/entity/Sku.cfc:L412].
      return [
        row(
          'base',
          baseCurrencyCode,
          Money.fromDecimalString(BASE_OVERRIDE_PRICE),
          Money.fromDecimalString(SKU_LIST_PRICE),
          Money.fromDecimalString(SKU_RENEWAL_PRICE),
        ),
      ];
  }
}

/**
 * The identifier the requested graph member is minted.
 */
function memberSkuID(idPrefix: string, member: AndOfExistsMember | undefined): string {
  return member === undefined ? `${idPrefix}-sku` : `${idPrefix}-sku-${member.toLowerCase()}`;
}

/**
 * The sku code the requested graph member is minted.
 */
function memberSkuCode(member: AndOfExistsMember | undefined): string {
  return member === undefined ? LEGACY_SKU_CODE : `${LEGACY_SKU_CODE}-${member}`;
}

/**
 * The distinct option groups reachable from a caller-supplied option set, in first-appearance
 * order, so the product still reports the groups its skus reference.
 */
function distinctOptionGroups(options: readonly Option[]): OptionGroup[] {
  const groups: OptionGroup[] = [];

  for (const held of options) {
    const owningGroup: OptionGroup | undefined = held.getOptionGroup();
    if (owningGroup === undefined) {
      continue;
    }
    const alreadyHeld: boolean = groups.some((candidate: OptionGroup): boolean =>
      cfEquals(candidate.getOptionGroupID(), owningGroup.getOptionGroupID()),
    );
    if (!alreadyHeld) {
      groups.push(owningGroup);
    }
  }

  return groups;
}

/**
 * The first eligible currency that is not the base currency.
 */
function firstNonBaseCurrency(
  eligibleCurrencies: string,
  baseCurrencyCode: string,
): string | undefined {
  return listToArray(eligibleCurrencies).find(
    (entry: string): boolean => !cfEquals(entry, baseCurrencyCode),
  );
}

/**
 * One fully-formed `SwSku`, with the option links, currency-override rows and collaborator doubles
 * its two must-preserve behaviours require.
 *
 * @param overrides Every variation this module offers, as documented fields.
 * @returns The requested sku, wired into its product and into the candidate set.
 */
export function makeSkuFixture(overrides?: SkuFixtureOverrides): Sku {
  // `??` where the default is simply a value; `resolveOverride` where an explicit `undefined` must
  // survive as absence.

  const idPrefix: string = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;
  const member: AndOfExistsMember | undefined = overrides?.andOfExistsMember;

  const skuID: string = overrides?.skuID ?? memberSkuID(idPrefix, member);
  const skuCode: string | undefined = resolveOverride(overrides, 'skuCode', memberSkuCode(member));

  // CFML parity [model/entity/Sku.cfc:L53] versus [model/entity/Product.cfc:L53]: a sku built here
  // is ACTIVE and a product built by the sibling fixture is not. `resolveOverride` is used so an
  // explicit `false` survives instead of being eaten by truthiness.
  const activeFlag: CfBooleanInput = resolveOverride(overrides, 'activeFlag', DEFAULT_ACTIVE_FLAG);
  const userDefinedPriceFlag: CfBooleanInput = resolveOverride(
    overrides,
    'userDefinedPriceFlag',
    DEFAULT_USER_DEFINED_PRICE_FLAG,
  );

  const imageFile: string | undefined = overrides?.imageFile;
  const imageSettingValues: SkuImageSettingValues | undefined = overrides?.imageSettingValues;
  const remoteID: string | undefined = resolveOverride(overrides, 'remoteID', REMOTE_ID);
  const calculatedQATS: number | undefined = resolveOverride(
    overrides,
    'calculatedQATS',
    CALCULATED_QATS,
  );
  const subscriptionTermID: string | undefined = overrides?.subscriptionTermID;
  const isNew: boolean | undefined = resolveOverride(overrides, 'isNew', false);

  // `price` defaults to the reference-calculation unit price, keeping the 19.99 x 3 chain
  // reachable.
  const price: Money | undefined = resolveOverride(
    overrides,
    'price',
    Money.fromDecimalString(SKU_PRICE),
  );
  const listPrice: Money | undefined = resolveOverride(
    overrides,
    'listPrice',
    Money.fromDecimalString(SKU_LIST_PRICE),
  );
  const renewalPrice: Money | undefined = resolveOverride(
    overrides,
    'renewalPrice',
    Money.fromDecimalString(SKU_RENEWAL_PRICE),
  );

  const skuCurrency: string = overrides?.skuCurrency ?? BASE_CURRENCY_CODE;
  const skuEligibleCurrencies: string = overrides?.skuEligibleCurrencies ?? ELIGIBLE_CURRENCIES;
  const secondaryCurrencyCode: string =
    firstNonBaseCurrency(skuEligibleCurrencies, skuCurrency) ?? SECONDARY_CURRENCY_CODE;

  // A fresh table per call, never a shared module-scope object.
  const conversionRates: Readonly<Record<string, string>> = overrides?.conversionRates ?? {
    [secondaryCurrencyCode]: SECONDARY_CONVERSION_RATE,
  };

  const skuCurrencyVariant: SkuCurrencyVariant =
    overrides?.skuCurrencyVariant ?? 'secondaryOverride';

  // Caller-supplied options become the pool and the groups are derived from them, so the product
  // still reports the groups its skus reference.

  const optionGroupOrder: OptionGroupOrder = overrides?.optionGroupOrder ?? 'sortOrder';
  const duplicateOptionGroupOption: boolean = overrides?.duplicateOptionGroupOption ?? false;
  const optionSortTieBreaker: OptionSortTieBreaker | undefined = resolveOverride(
    overrides,
    'optionSortTieBreaker',
    makeDeterministicOptionSortTieBreaker(),
  );

  const callerOptions: readonly Option[] | undefined = overrides?.options;
  const callerSuppliedOptions: boolean = hasOverride(overrides, 'options');

  const optionGroups: OptionGroup[] = callerSuppliedOptions
    ? distinctOptionGroups(callerOptions ?? [])
    : makeFixtureOptionGroups(idPrefix, optionGroupOrder, optionSortTieBreaker);

  const optionPool: readonly Option[] = callerSuppliedOptions
    ? [...(callerOptions ?? [])]
    : makeFixtureOptionPool(idPrefix, optionGroups, duplicateOptionGroupOption);

  // JUDGMENT CALL: `Option` INSTANCES are shared across the skus of one graph, deliberately,
  // because the `exists` subquery means "the same `SwOption` ROW".
  const targetOptions: Option[] = callerSuppliedOptions
    ? [...(callerOptions ?? [])]
    : member === undefined
      ? [...optionPool]
      : selectPoolOptions(optionPool, optionIndexesForMember(member));

  // `SkuHydrationInput` declares EXACTLY four collaborator ports and all four are supplied.

  const settingsProvider: SettingsProvider | undefined = hasOverride(overrides, 'settingsProvider')
    ? overrides?.settingsProvider
    : makeFixtureSettingsProvider(skuCurrency, skuEligibleCurrencies);

  const currencyConverter: CurrencyConverter | undefined = hasOverride(
    overrides,
    'currencyConverter',
  )
    ? overrides?.currencyConverter
    : makeFixtureCurrencyConverter(skuEligibleCurrencies, conversionRates);

  const priceGroupResolver: SkuPriceGroupResolver | undefined = hasOverride(
    overrides,
    'priceGroupResolver',
  )
    ? overrides?.priceGroupResolver
    : makeFixturePriceGroupResolver(overrides?.priceGroupPrice, overrides?.currentAccountPrice);

  // The one LIVE ARRAY in this FILE. The product must exist before any sku can be wired to it, yet
  // the product's option-resolution repository must answer with those very skus.
  const candidates: Sku[] = [...(overrides?.selectedOptionsCandidateSkus ?? [])];

  const transactionExistsFlag: boolean = overrides?.transactionExistsFlag ?? false;

  const skuRepository: SkuRepository | undefined = hasOverride(overrides, 'skuRepository')
    ? overrides?.skuRepository
    : makeFixtureSkuRepository(candidates, transactionExistsFlag, NEXT_OPTION_GROUP_SORT_ORDER);

  // Built with no skus and appended to from the owning side, which is how the cycle is broken.
  //
  // LEGACY-DEFECT [model/entity/Sku.cfc:L442-L447]: getDefaultFlag() is
  // `getProduct().getDefaultSku().getSkuID() == getSkuID()` with no guard on either dereference,
  // so a sku whose product has no default sku raises - and `model/validation/Sku.json` requires
  // `defaultFlag eq false` on DELETE.
  // Preserved deliberately; do not fix without a product decision.
  const product: Product | undefined = hasOverride(overrides, 'product')
    ? overrides?.product
    : makeProductFixture({
        idPrefix,
        productID: `${idPrefix}-product`,
        skus: [],
        optionGroups,
        nextOptionGroupSortOrder: NEXT_OPTION_GROUP_SORT_ORDER,
        ...(skuRepository === undefined ? {} : { skuRepository }),
      });

  // Fresh arrays, including when the caller supplied one, per the copy-the-containers rule in the
  // header: one shared instance would let an `addOption` in one suite surface in another.

  const skuCurrencies: SkuCurrency[] = hasOverride(overrides, 'skuCurrencies')
    ? [...(overrides?.skuCurrencies ?? [])]
    : makeFixtureSkuCurrencies(idPrefix, skuCurrencyVariant, skuCurrency, secondaryCurrencyCode);

  const priceGroupRates: PriceGroupRate[] = [...(overrides?.priceGroupRates ?? [])];
  const promotionRewards: PromotionRewardRef[] = [...(overrides?.promotionRewards ?? [])];
  const promotionRewardExclusions: PromotionRewardRef[] = [
    ...(overrides?.promotionRewardExclusions ?? []),
  ];
  const promotionQualifiers: PromotionQualifierRef[] = [...(overrides?.promotionQualifiers ?? [])];
  const promotionQualifierExclusions: PromotionQualifierRef[] = [
    ...(overrides?.promotionQualifierExclusions ?? []),
  ];

  // The inert opaque identifier sets standing in for out-of-scope associations.
  const alternateSkuCodeIDs: readonly string[] = [...(overrides?.alternateSkuCodeIDs ?? [])];
  const stockIDs: readonly string[] = [...(overrides?.stockIDs ?? [])];
  const accessContentIDs: readonly string[] = [...(overrides?.accessContentIDs ?? [])];
  const subscriptionBenefitIDs: readonly string[] = [...(overrides?.subscriptionBenefitIDs ?? [])];
  const renewalSubscriptionBenefitIDs: readonly string[] = [
    ...(overrides?.renewalSubscriptionBenefitIDs ?? []),
  ];
  const physicalIDs: readonly string[] = [...(overrides?.physicalIDs ?? [])];

  // JUDGMENT CALL: `Sku.getSalePrice()` [model/entity/Sku.cfc:L546-L551] returns
  // `getSalePriceDetails()["salePrice"]` when the key exists and otherwise falls back to
  // `getPrice()`, not to zero.
  //
  // LEGACY-NOTE [model/entity/Sku.cfc:L539-L544, L557, L564]: the legacy memo is filled through
  // `getProduct().getSkuSalePriceDetails( getSkuID() )`, answering `{}` on a miss
  // [model/entity/Product.cfc:L182-L187]; the port hands the projection to the sku directly.
  const salePriceDetail: SalePriceDetailRef | undefined = overrides?.salePriceDetail;

  const currentAccountContext: CurrentAccountContextRef | undefined = resolveOverride(
    overrides,
    'currentAccountContext',
    { accountID: `${idPrefix}-account` },
  );

  const audit: AuditTrail = makeAuditTrail(idPrefix);

  // Every OPTIONAL member is written through a conditional spread.

  const hydrationInput: SkuHydrationInput = {
    skuID,

    // Always present, always owned by this graph.
    options: targetOptions,
    skuCurrencies,
    priceGroupRates,
    promotionRewards,
    promotionRewardExclusions,
    promotionQualifiers,
    promotionQualifierExclusions,
    alternateSkuCodeIDs,
    stockIDs,
    accessContentIDs,
    subscriptionBenefitIDs,
    renewalSubscriptionBenefitIDs,
    physicalIDs,

    // The audit columns [model/entity/Sku.cfc:L93-L96]; the two account keys are inert.
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,

    // The two booleans [model/entity/Sku.cfc:L53, L59].
    ...(activeFlag === undefined ? {} : { activeFlag }),
    ...(userDefinedPriceFlag === undefined ? {} : { userDefinedPriceFlag }),

    // The scalar columns [model/entity/Sku.cfc:L54, L58, L62, L90].
    ...(skuCode === undefined ? {} : { skuCode }),
    ...(imageFile === undefined ? {} : { imageFile }),
    ...(imageSettingValues === undefined ? {} : { imageSettingValues }),
    ...(calculatedQATS === undefined ? {} : { calculatedQATS }),
    ...(remoteID === undefined ? {} : { remoteID }),

    // The three money columns [model/entity/Sku.cfc:L55-L57], all `default="0"`.
    ...(price === undefined ? {} : { price }),
    ...(listPrice === undefined ? {} : { listPrice }),
    ...(renewalPrice === undefined ? {} : { renewalPrice }),

    // The out-of-scope subscription FK [model/entity/Sku.cfc:L66].
    ...(subscriptionTermID === undefined ? {} : { subscriptionTermID }),

    // The non-persistent slots.
    ...(salePriceDetail === undefined ? {} : { salePriceDetail }),
    ...(currentAccountContext === undefined ? {} : { currentAccountContext }),
    ...(isNew === undefined ? {} : { isNew }),
    ...(settingsProvider === undefined ? {} : { settingsProvider }),
    ...(currencyConverter === undefined ? {} : { currencyConverter }),
    ...(priceGroupResolver === undefined ? {} : { priceGroupResolver }),
    ...(skuRepository === undefined ? {} : { skuRepository }),
  };

  const target: Sku = new Sku(hydrationInput);

  // `Sku.setProduct` is called EXACTLY once per sku, per the at-most-once rule in the header,
  // because its `isNew() or !hasSku(this)` probe would append a duplicate row on a second call.

  const wire = (sku: Sku): void => {
    if (product !== undefined) {
      sku.setProduct(product);
    }
    candidates.push(sku);
  };

  if (member === undefined) {
    wire(target);
    return target;
  }

  // The canonical four-sku graph.
  for (const graphMember of andOfExistsMembers()) {
    if (graphMember === member) {
      wire(target);
      continue;
    }

    const siblingAudit: AuditTrail = makeAuditTrail(idPrefix);

    wire(
      new Sku({
        skuID: memberSkuID(idPrefix, graphMember),
        skuCode: memberSkuCode(graphMember),
        activeFlag: DEFAULT_ACTIVE_FLAG,
        userDefinedPriceFlag: DEFAULT_USER_DEFINED_PRICE_FLAG,
        price: Money.fromDecimalString(SKU_PRICE),
        listPrice: Money.fromDecimalString(ZERO_DECIMAL),
        renewalPrice: Money.fromDecimalString(ZERO_DECIMAL),
        options: selectPoolOptions(optionPool, optionIndexesForMember(graphMember)),
        skuCurrencies: [],
        priceGroupRates: [],
        promotionRewards: [],
        promotionRewardExclusions: [],
        promotionQualifiers: [],
        promotionQualifierExclusions: [],
        alternateSkuCodeIDs: [],
        stockIDs: [],
        accessContentIDs: [],
        subscriptionBenefitIDs: [],
        renewalSubscriptionBenefitIDs: [],
        physicalIDs: [],
        createdDateTime: siblingAudit.createdDateTime,
        createdByAccountID: siblingAudit.createdByAccountID,
        modifiedDateTime: siblingAudit.modifiedDateTime,
        modifiedByAccountID: siblingAudit.modifiedByAccountID,
        ...(currentAccountContext === undefined ? {} : { currentAccountContext }),
        ...(settingsProvider === undefined ? {} : { settingsProvider }),
        ...(currencyConverter === undefined ? {} : { currencyConverter }),
        ...(priceGroupResolver === undefined ? {} : { priceGroupResolver }),
        ...(skuRepository === undefined ? {} : { skuRepository }),
      }),
    );
  }

  return target;
}
