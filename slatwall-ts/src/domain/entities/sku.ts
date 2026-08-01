// ---------------------------------------------------------------------------
// src/domain/entities/sku.ts
//
// PORT OF `model/entity/Sku.cfc` (916 source lines), the largest and
// highest-risk entity in the in-scope slice.
//
// THE LEGACY COMPONENT DECLARATION, TRANSCRIBED VERBATIM FROM
// [model/entity/Sku.cfc:L49] — every attribute is a schema/behaviour contract
// (B5) and none is normalised:
//
//   component entityname="SlatwallSku" table="SwSku" persistent=true
//             accessors=true output=false extends="HibachiEntity"
//             cacheuse="transactional" hb_serviceName="skuService"
//             hb_permission="this" {
//
// `table="SwSku"` and every column, link table, `fkcolumn` and
// `inversejoincolumn` value below is reproduced exactly. No migration, no
// rename, no new table, no column change (B5).
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE OWNS
// ---------------------------------------------------------------------------
//
//   * MUST-PRESERVE BEHAVIOUR #3 — the four-step currency cascade
//     `getCurrencyDetails()` [model/entity/Sku.cfc:L367-L433].
//   * THE SINGLE HIGHEST-CONSEQUENCE PARITY CHECK IN THE MIGRATION PLAN —
//     `getPriceByCurrencyCode()` [L269-L273] answering `undefined`, NEVER `0`.
//   * DEFECT 16 — `getPriceByPromotion()` [L258] calls a method that does not
//     exist, so it throws. Reproduced as a throwing stub.
//   * DEFECT 17 [L500-L510] and DEFECT 18 [L512-L522] — the folder's TWO
//     permitted deliberate divergences, both spent here. The third belongs to
//     `product.ts` (DEFECT 19). NO FOURTH DIVERGENCE MAY EVER BE SPENT.
//   * The `onMissingMethod` dispatcher override [L857-L873], re-expressed as a
//     statically-typed method.
//   * The two declaratively-invoked `model/validation/Sku.json` validators
//     `hasUniqueOptions()` [L756] and `hasOneOptionPerOptionGroup()` [L772].
//   * 19 `getService(` locator sites, more than any other entity — all
//     eliminated (T2). See the ledger below.
//
// ---------------------------------------------------------------------------
// LOCATOR-DRIFT CAUTION
// ---------------------------------------------------------------------------
//
// Every locator in this file was re-verified line-by-line against the verbatim
// source. Three widely-circulated locator sets carry drift and are NOT used:
//
//   * currencyService is at L371/L418/L422/L425 — not L379/L421.
//   * priceGroupService is at L262/L266/L437 — not L436.
//   * skuService is at L569/L594 — not L568.
//   * `onMissingMethod` is declared at L858 inside the L857-L873 window — not
//     at L852.
//
// Two further corrections established by direct measurement of the source:
//
//   * THE 19 LOCATOR SITES ARE L189, L218, L258, L262, L266, L295, L296, L300,
//     L310, **L330**, L371, L418, L422, L425, L437, L451, L569, L594, L816.
//     Enumerations that list eighteen omit L330
//     (`getAssignedOrderItemAttributeSetSmartList` [L327], whose body reaches
//     `attributeService` at L330). Counted by grep: 19 occurrences.
//   * THE BOOLEAN CENSUS. `Sku.cfc` declares exactly TWO persisted booleans:
//     `activeFlag ormtype="boolean" default="1"` [L53] and
//     `userDefinedPriceFlag ormtype="boolean" default="0"` [L59]. A census
//     reporting «`"0"` x 4 and `"1"` x 1» is counting `default="0|1"` STRING
//     occurrences, which sweeps in the three `big_decimal` money columns at
//     L55-L57. There is no camelCase `ormType="boolean"` in this component.
//
// ---------------------------------------------------------------------------
// THE 19 LOCATOR SITES AND WHAT REPLACED EACH (T2)
// ---------------------------------------------------------------------------
//
//   L258        promotionService    REMOVED. The call target does not exist —
//                                   DEFECT 16. No port is injected for it.
//   L371        currencyService     injected `CurrencyConverter` port
//   L418,L422,  currencyService     injected `CurrencyConverter` port
//   L425                            (`convertCurrency`)
//   L262,L266,  priceGroupService   injected price-group resolver
//   L437
//   L569        skuService          the member is ABSENT from the port —
//                                   DEFECT 28. Throwing stub.
//   L594        skuService          injected `SkuRepository` port
//   L189,L218   imageService        method OMITTED / refused (image subsystem)
//   L295,L296,  location/stock/     method OMITTED (stock subsystem)
//   L300,L310   inventoryService
//   L330,L816   attributeService    method OMITTED (EAV + smart list)
//   L451        fulfillmentService  method OMITTED (fulfillment subsystem)
//
// A SEPARATE INHERITED LOCATOR SURFACE IS DELIBERATELY NOT PORTED.
// `Sku.cfc` declares `extends="HibachiEntity"` unqualified, which resolves to
// `model/entity/HibachiEntity.cfc` (274 lines), which itself extends
// `Slatwall.org.Hibachi.HibachiEntity` — a THREE-level chain. The intermediate
// class holds twelve further `getService(...)` sites (L123, L130, L135, L145,
// L178, L180, L182, L194, L196, L207, L257, L266), seven of them
// `attributeService`. They are moot here because the EAV path is not ported,
// and they are recorded so that none is silently re-implemented.
//
// ---------------------------------------------------------------------------
// THE PORTS THIS ENTITY REACHES, AND THE TWO GAPS IN THEM
// ---------------------------------------------------------------------------
//
// Constructor injection, no service locator, no runtime scan (T1). Four
// collaborators, every one an explicit compile-checked constructor argument:
//
//   1. `SettingsProvider`  — `setting('skuCurrency')` [L362, L385, L418, L422,
//      L425] and `setting('skuEligibleCurrencies')` [L373, L375]. SYNCHRONOUS,
//      which is what lets `getCurrencyCode()` stay synchronous.
//   2. `CurrencyConverter` — the eligible-currency listing [L371] and the three
//      conversions [L418, L422, L425]. EVERY MEMBER IS ASYNC; see the
//      async-boundary ruling below.
//   3. a price-group resolver — [L262], [L266], [L437].
//   4. `SkuRepository`     — `getTransactionExistsFlag` [L594].
//
// GAP 1 — `PriceGroupRepository` DOES NOT DECLARE THE THREE MEMBERS [L262],
// [L266] AND [L437] REACH. Its six members are `getAccountSubscriptionPriceGroups`,
// `getPriceGroup`, `getPriceGroupRate`, `savePriceGroup`, `savePriceGroupRate`
// and `deletePriceGroup`. `calculateSkuPriceBasedOnPriceGroup`,
// `getRateForSkuBasedOnPriceGroup` and `calculateSkuPriceBasedOnCurrentAccount`
// are PRICE-GROUP SERVICE members, and the canonical port list has thirteen
// entries with no fourteenth permitted. This file therefore declares the narrow
// structural collaborator {@link SkuPriceGroupResolver} locally, names the
// three missing members in its documentation, and imports the real
// {@link CurrentAccountContext} from the port so the context type is not
// invented. Nothing is added to a port file.
//
// GAP 2 — `SkuRepository` DOES NOT DECLARE `getSkuStocksDeletableFlag`, which
// [L569] reaches. That is DEFECT 28 and it is preserved as a throwing stub
// rather than papered over. Its seven declared members are
// `getTransactionExistsFlag`, `getSkuBySkuCode`, `getSkusBySelectedOptions`,
// `searchSkusByProductType`, `getProductSkus`, `getSortedProductSkusID` and
// `saveSku`.
//
// A THIRD CORRECTION WORTH RECORDING: `SettingsProvider` publishes FOUR keys —
// `globalURLKeyProduct`, `globalURLKeyProductType`, `skuCurrency` and
// `skuEligibleCurrencies` — not seven. `productImageDefaultExtension`,
// `productImageOptionCodeDelimiter` and `productTitleString` are NOT on it.
// That is independent confirmation that the image path cannot be ported: it
// reads settings the port does not carry, exactly the reasoning that omitted
// `Option.getImageDirectory()` [model/entity/Option.cfc:L81-L83].
//
// ---------------------------------------------------------------------------
// THE ASYNC BOUNDARY, AND WHY `getCurrencyDetails()` IS STILL SYNCHRONOUS
// ---------------------------------------------------------------------------
//
// A method is `async` here if and only if its legacy body reaches the DAO, the
// ORM or a port member that does. Applying that rule:
//
//   SYNC   getCurrencyCode, getCurrencyDetails, getPriceByCurrencyCode,
//          getListPriceByCurrencyCode, getRenewalPriceByCurrencyCode,
//          getPriceByPriceGroup, getAppliedPriceGroupRateByPriceGroup,
//          getDefaultFlag, getSalePriceDetails, getSalePrice,
//          getSalePriceDiscountType, getSalePriceExpirationDateTime,
//          the option methods, the option structs, hasOneOptionPerOptionGroup,
//          every probe, every bidirectional helper, the deprecated block
//   ASYNC  materializeCurrencyDetails, getCurrentAccountPrice, getLivePrice,
//          getBaseProductType, getSkuDefinition, getTransactionExistsFlag,
//          hasUniqueOptions
//
// LEGACY-NOTE [model/entity/Sku.cfc:L367-L433]: the cascade's own inputs are
// asynchronous in the target — `CurrencyConverter` declares every member async
// — yet [L269-L285] must stay synchronous to preserve the accessor contract.
// The resolution is the one the port itself documents: the cascade runs during
// hydration through {@link Sku.materializeCurrencyDetails}, and
// {@link Sku.getCurrencyDetails} reads the instance memo synchronously. NO
// LEGACY SIGNATURE CHANGES. An un-materialised sku answers `{}`, which is
// precisely what the legacy answers when the eligibility gate at [L373] is
// closed, so the un-materialised state is a behaviour the legacy already has
// rather than a new one this port introduces.
//
// ---------------------------------------------------------------------------
// BUDGETS — ALL RESPECTED, WITH THE ARITHMETIC SHOWN
// ---------------------------------------------------------------------------
//
//   Entity-layer signature widenings ....... 0 spent (0 available; the
//       project's single widening was spent on `PromotionPeriod.isCurrent`).
//       In particular `getCurrentAccountPrice()` [L435] takes NO parameter:
//       transformation rule T6 removes the ambient `getSlatwallScope()` read by
//       threading an explicit {@link CurrentAccountContext} through the
//       CONSTRUCTOR, which eliminates ambient state without touching the
//       signature.
//   Signature reshapings ................... 0
//   Visibility widenings .................... 0
//   ORM lifecycle-hook reshapings ........... 0. The ORM Event Hooks banner
//       pair [L878]/[L880] is COMPLETELY EMPTY — there is no `preInsert` and no
//       `preUpdate` on this component, so there is nothing to reshape.
//   Deliberate divergences .................. 2 spent — DEFECT 17 [L500-L510]
//       and DEFECT 18 [L512-L522]. Both are annotated at the site.
//
// Return types are REFINED where the legacy declares `any` and the body proves
// a narrower contract (`Money | undefined` rather than `any`, `Option |
// undefined` rather than `any`). Refining `any` is not a widening: it adds no
// parameter, removes no member and changes no name.
//
// ---------------------------------------------------------------------------
// DEFECTS: PRESERVED (7) VERSUS FIXED (2)
// ---------------------------------------------------------------------------
//
//   PRESERVED
//     * DEFECT 16 [L258]  — `getPriceByPromotion` calls the nonexistent
//       `calculateSkuPriceBasedOnPromotion`; throws.
//     * DEFECT 28 [L569]  — `getStocksDeletableFlag` reaches a DAO member that
//       does not exist on the port; throws.
//     * [L247-L251]        — `getOptionByOptionGroupCode` guards the CODE
//       struct and then reads the ID struct with a CODE key.
//     * [L583]             — `trim(variables.skuDefinition)` is a bare
//       statement whose result is discarded, so the leading space stays.
//     * [L771]             — the `@hint` on `hasOneOptionPerOptionGroup`
//       duplicates [L755] and describes a different check.
//     * [L400-L414]        — Step 2 of the cascade has no `break`, so the LAST
//       matching `SwSkuCurrency` row wins.
//     * [L416]             — Step 3 is gated on `"price"` ALONE, so a currency
//       with a price but no list price gets no converted list price either.
//
//   FIXED (the two permitted divergences)
//     * DEFECT 17 [L500-L510] and DEFECT 18 [L512-L522].
//
// ---------------------------------------------------------------------------
// PRESENTATION RULING FOR THE SIX `*Formatted` SUB-KEYS
// ---------------------------------------------------------------------------
//
// Steps 1 and 2 call `getFormattedValue("renewalPrice"|"listPrice"|"price")` —
// a `HibachiEntity` member that is not ported — and Step 3 calls the
// THREE-argument `formatValue(value, "currency", {currencyCode=...})`, which
// differs from the two-argument form used at
// [model/entity/PriceGroupRate.cfc:L266]. Option (a) of the ruling is taken:
// all six sites delegate to `numberFormat(money.toDecimalString(), '0.00')`,
// matching the precedent set by `priceGroupRate.ts` and `promotionReward.ts`.
// The framework formatter's currency-symbol and locale behaviour is NOT
// reproduced, and no formatting dependency is introduced — the pinned
// dependency set is fixed (E3).
//
// ---------------------------------------------------------------------------
// TEST COVERAGE — NET-NEW (B8)
// ---------------------------------------------------------------------------
//
// `tests/unit/domain/entities/sku.test.ts` is NET-NEW COVERAGE with NO legacy
// antecedent. `meta/tests/unit/entity/` contains `BrandTest.cfc` and
// `ProductTest.cfc` and nothing else, so nothing in the legacy suite asserts
// anything about `Sku`. That coverage must never be presented as parity. This
// file does not author it.
//
// E9: licence continuity is satisfied at subtree level by
// `slatwall-ts/NOTICE-GPL.md`. No per-file GPL header.
//
// No user-specified rules were provided for this project; their absence is not
// licence to lower the bar and no rule has been invented to fill the gap.
// ---------------------------------------------------------------------------

import { listAppend, listToArray } from '../../lib/cfml/list.js';
import { numberFormat } from '../../lib/cfml/numberFormat.js';
import { cfEquals, structGet, structGetPath, structKeyExists } from '../../lib/cfml/struct.js';
import { cfBoolean, cfLen, isNullish, type CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { CurrentAccountContext } from '../ports/priceGroupRepository.js';
import type { SettingsProvider } from '../ports/settingsProvider.js';
import type { CurrencyConverter } from '../ports/currencyConverter.js';
import type { SkuRepository } from '../ports/skuRepository.js';
import { toCurrencyCode, type CurrencyCode } from '../valueObjects/currencyCode.js';
// `Money` is a VALUE import, not a type-only one, for one specific reason:
// [model/entity/Sku.cfc:L55-L57] declare `listPrice`, `price` and
// `renewalPrice` with `default="0"`, so hydration must be able to MATERIALISE a
// zero. `Money.zero` is that zero. See {@link Sku.price}.
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

// ---------------------------------------------------------------------------
// EXPORTED TYPES
//
// One exported unit per file is the project rule, and it governs RUNTIME units.
// The types below are the class's own vocabulary: they exist only to describe
// its members, they are erased at emit, and putting them in a shared module
// would create exactly the barrel this project forbids. They are declared here,
// beside the class, and exported here.
// ---------------------------------------------------------------------------

/**
 * One currency's resolved prices, as the four-step cascade
 * [model/entity/Sku.cfc:L367-L433] leaves them.
 *
 * ★ WHY `skuCurrencyID` IS REQUIRED AND EVERY PRICE IS OPTIONAL. [L381-L382]
 * creates the entry and seeds `skuCurrencyID` to `''` UNCONDITIONALLY, before
 * any price is considered:
 *
 *   variables.currencyDetails[ thisCurrency.getCurrencyCode() ] = {};
 *   variables.currencyDetails[ thisCurrency.getCurrencyCode() ].skuCurrencyID = "";
 *
 * So the OUTER map key always exists for every eligible currency, even when no
 * price is ever recorded for it, and only SUB-keys can be absent. That single
 * fact is why the three accessors at [L269-L285] are asymmetric: one of them
 * needs only the outer check and two of them need a second one.
 *
 * ★ ABSENT IS NOT PRESENT-AND-UNDEFINED. Under `exactOptionalPropertyTypes` an
 * omitted `price` and a `price` holding `undefined` are different types, and
 * the cascade depends on the difference: [L416] tests `structKeyExists(entry,
 * "price")`, so installing an `undefined` price would SUPPRESS the conversion
 * step. Nothing in this file ever writes `undefined` into one of these
 * sub-keys, and nothing ever pre-seeds one with a zero.
 */
export type CurrencyDetail = {
  /**
   * The `SwSkuCurrency` row this entry's prices came from, or `''` when they
   * came from the sku's own columns or from a conversion. [L382, L412] — [L412]
   * is the only write of a non-empty value anywhere in the cascade.
   */
  readonly skuCurrencyID: string;

  /** [L394] base currency, [L409] override row, [L425] converted. */
  readonly price?: Money;

  /** [L395, L410, L426]. A presentation string, never money. */
  readonly priceFormatted?: string;

  /** [L391] base currency, [L406] override row, [L422] converted. */
  readonly listPrice?: Money;

  /** [L392, L407, L423]. */
  readonly listPriceFormatted?: string;

  /** [L387] base currency, [L402] override row, [L418] converted. */
  readonly renewalPrice?: Money;

  /** [L388, L403, L419]. */
  readonly renewalPriceFormatted?: string;

  /**
   * `false` when the price came from the sku's own columns [L396] or from an
   * override row [L411]; `true` when it was converted [L427]. Absent when the
   * currency matched no step at all, which is reachable: a currency that is
   * neither the base currency nor an override row still gets an entry at
   * [L381], and if the sku's own price is absent the conversion step installs
   * nothing.
   */
  readonly converted?: boolean;
};

/**
 * The three money sub-keys of a {@link CurrencyDetail}, and nothing else.
 *
 * This exists so the two-level reads at [model/entity/Sku.cfc:L276] and [L282]
 * can be typed precisely. `structGetPath<TInner>` returns
 * `TInner[keyof TInner] | undefined`; handed the full {@link CurrencyDetail}
 * that union would include `string` and `boolean`, and the accessors would then
 * need a narrowing step that reads like a cast. Handed this view it is exactly
 * `Money | undefined`, which is the published contract. A
 * {@link CurrencyDetail} is assignable to this view — extra members are
 * permitted — so no conversion and no `any` is involved.
 */
export type CurrencyDetailMoneyView = {
  readonly price?: Money;
  readonly listPrice?: Money;
  readonly renewalPrice?: Money;
};

/**
 * The price-group collaborator this entity reaches at [model/entity/Sku.cfc:L262],
 * [L266] and [L437].
 *
 * ★ WHY THIS IS DECLARED HERE AND NOT IMPORTED. All three legacy calls target
 * `priceGroupService`, and `PriceGroupRepository` — the canonical port — does
 * NOT declare any of them. Its six members are `getAccountSubscriptionPriceGroups`,
 * `getPriceGroup`, `getPriceGroupRate`, `savePriceGroup`, `savePriceGroupRate`
 * and `deletePriceGroup`.
 *
 * LEGACY-NOTE [model/service/PriceGroupService.cfc:L140, L301, L262]: the three
 * members named below — `getRateForSkuBasedOnPriceGroup`,
 * `calculateSkuPriceBasedOnPriceGroup` and
 * `calculateSkuPriceBasedOnCurrentAccount` — belong to the price-group SERVICE
 * surface and are absent from the `PriceGroupRepository` port. Recorded rather
 * than added: this file does not own that port, and the canonical port list
 * admits no fourteenth entry.
 *
 * The implementation is supplied by the composition root, which is also where
 * the two service-tier asymmetries this entity must not smooth over are
 * enforced:
 *
 *   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L174]: the parent
 *     recursion of the five-level cascade calls
 *     `getRateForProductBasedOnPriceGroup`, NOT the sku variant. The asymmetry
 *     is real and it is enforced at `src/services`, not here.
 *   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L316-L340]: ONLY the
 *     `percentageOff` branch applies the rounding rule; `amountOff` and
 *     `amount` skip it. Also enforced at `src/services`, not here.
 */
export interface SkuPriceGroupResolver {
  /** [model/entity/Sku.cfc:L262] → `model/service/PriceGroupService.cfc:L301`. */
  calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money;

  /** [model/entity/Sku.cfc:L266] → `model/service/PriceGroupService.cfc:L140`. */
  getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined;

  /**
   * [model/entity/Sku.cfc:L437] → `model/service/PriceGroupService.cfc:L262`.
   * Async because the legacy body reaches the account subscription price-group
   * query. The context argument is what replaces the ambient
   * `getSlatwallScope()` read (T6).
   */
  calculateSkuPriceBasedOnCurrentAccount(sku: Sku, context: CurrentAccountContext): Promise<Money>;
}

/**
 * The sale-price detail row `getSalePriceDetails()` [model/entity/Sku.cfc:L539-L544]
 * resolves, derived from `Product`'s declared return type rather than re-declared.
 *
 * `Product.getSkuSalePriceDetails()` returns the promotion port's
 * `SalePriceDetail`. Naming that type directly would mean importing
 * `../ports/promotionRepository.js`, which is NOT among this file's declared
 * dependencies, so the type is derived from the one module that legitimately
 * publishes it to this file. No shape is invented and no dependency is added.
 */
export type SkuSalePriceDetails = Awaited<ReturnType<Product['getSkuSalePriceDetails']>>;

/**
 * The resize arguments the image methods accept.
 *
 * Every member is optional because every one is tested with `structKeyExists`
 * before being read [model/entity/Sku.cfc:L159-L187, L198-L216]. The shape
 * exists only so the refusing stubs below present the signature `Product`
 * forwards to them; nothing in this file reads a member of it.
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
 * Everything needed to construct a hydrated `Sku`.
 *
 * REPOSITORIES OWN HYDRATION. This file does not query, does not open a
 * connection and does not import a driver. `src/repositories/mysql/**` reads
 * the row, materialises the associations, chooses and documents the fetch shape,
 * injects the collaborators, and — when currency-aware prices are needed —
 * awaits {@link Sku.materializeCurrencyDetails}.
 *
 * Every collaborator is optional because not every hydration needs every one: a
 * catalog listing that reads `skuCode` has no business requiring a currency
 * converter. A member that is genuinely needed and absent produces an explicit
 * error naming it — never a silent zero, never a silent empty result.
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

  // Calculated property [L62].
  readonly calculatedQATS?: number;

  // Remote property [L90] and audit properties [L93-L96].
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
   * Pre-materialised sale-price detail for this sku, as
   * `Product.getSkuSalePriceDetails()` [model/entity/Product.cfc] would return
   * it.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L539-L544]: the legacy body delegates to
   * the product, whose ported method is asynchronous. It is supplied here
   * instead so that `getSalePrice()` [L546], `getSalePriceDiscountType()`
   * [L553] and `getSalePriceExpirationDateTime()` [L560] keep the synchronous
   * contract their callers rely on.
   */
  readonly salePriceDetail?: SkuSalePriceDetails;

  /**
   * The requesting account, explicit rather than ambient (T6).
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L262-L268]: the legacy
   * path reads the account from the request scope through the anomalous
   * `getSlatwallScope()` while the rest of the codebase uses
   * `getHibachiScope()`. Both are replaced by this explicit context, which
   * normalises the inconsistency. `src/lib/config.ts` is static process
   * configuration and is NEVER used as a request scope.
   */
  readonly currentAccountContext?: CurrentAccountContext;

  // Collaborator ports.
  readonly settingsProvider?: SettingsProvider;
  readonly currencyConverter?: CurrencyConverter;
  readonly priceGroupResolver?: SkuPriceGroupResolver;
  readonly skuRepository?: SkuRepository;

  /**
   * `true` when this row has not been persisted, which is what
   * `HibachiEntity.isNew()` answers by testing the primary key against its
   * `unsavedvalue=""` [model/entity/Sku.cfc:L52]. Supplied explicitly so the
   * answer does not depend on guessing how a repository spells an unsaved key.
   */
  readonly isNew?: boolean;
};

/**
 * `SlatwallSku`, table `SwSku` — a stock-keeping unit.
 *
 * ★ THIS IS A CLASS, NOT AN INTERFACE, AND THAT IS NOT NEGOTIABLE. The legacy
 * component carries behaviour, not data: the four-step currency cascade is a
 * method [model/entity/Sku.cfc:L367-L433], the dispatcher override is a method
 * [L858], and the two declarative validators are methods [L756, L772].
 * Collapsing that behaviour into free functions would break interface parity,
 * and interface parity IS the acceptance contract (B4). Method names are
 * therefore the legacy CFML names VERBATIM in camelCase — `getPriceByCurrencyCode`,
 * `getCurrencyDetails`, `getOptionsByOptionGroupIDStruct`, `hasUniqueOptions`,
 * `hasOneOptionPerOptionGroup`, `isNotDefaultSku`, `displayOptions` — even where
 * a different name would read better in TypeScript.
 *
 * ★ EVERY MEMO IS INSTANCE-SCOPED AND EVERY INSTANCE IS REQUEST-SCOPED. The
 * legacy component memoises `currencyCode` [L361], `currencyDetails` [L368],
 * both option structs [L501, L513], `optionsIDList` [L525], `livePrice` [L483]
 * and `imageName` [L795] into `variables`, which on a warm container would
 * persist between unrelated requests and could leak one customer's pricing into
 * another's. Not one of them is hoisted to module scope here. The same ruling
 * governs the other three legacy caches in this slice —
 * `SkuDAO.variables.nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220],
 * whose clear method's condition is inverted so it can never fire
 * [model/dao/SkuDAO.cfc:L222-L226]; `RoundingRuleService.variables.roundingRuleDetails`
 * [model/service/RoundingRuleService.cfc:L67-L77]; and the un-`var`'d
 * `discountAmount` [model/service/PromotionService.cfc:L1007] — all of which
 * become request-scoped in their own modules.
 *
 * ★ ASSOCIATIONS ARE ALREADY-POPULATED ARRAYS. Hibernate lazy loading has no
 * equivalent in a driver-only stack and this file does not simulate it. Every
 * in-scope collection arrives materialised, and the fetch shape that produced it
 * is a documented decision at the repository method rather than an implicit
 * traversal here. That is what removes the N+1 hazard.
 *
 * LEGACY-NOTE [model/entity/Sku.cfc:L65]: `product` is declared WITHOUT
 * `fetch="join"`, so it is a lazy many-to-one. `Sku` is not one of the four
 * eager-fetch sites in the slice — those are `Product.brand`
 * [model/entity/Product.cfc:L68], `Product.productType` [L69],
 * `Product.defaultSku` [L70] and `PromotionPeriod.promotion`
 * [model/entity/PromotionPeriod.cfc:L59].
 *
 * ★ THE FIVE DISTINCT EMPTY-COLLECTION SEMANTICS. Collapsing any of these into
 * another is a money bug, so all five are recorded and none is collapsed:
 *
 *   1. PERMISSIVE IN THE CALLER'S LOOP — an empty `addressZones` on a reward
 *      means NO RESTRICTION [model/service/PromotionService.cfc:L333-L420].
 *   2. RESTRICTIVE IN THE EVALUATOR — an empty `locations` on an address zone
 *      means NOT IN ZONE [model/service/AddressService.cfc:L57].
 *   3. `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] returns
 *      `false` on an empty `entityArray`, and that same `false` is PERMISSIVE on
 *      an exclude-list and RESTRICTIVE on an include-list — two of the five.
 *   4. THE FULFILMENT THREE-WAY GATE [model/service/PromotionService.cfc:L333-L420]
 *      treats an empty collection as no restriction, under a
 *      single-promotion-per-fulfilment `[1]` assumption.
 *   5. `Brand.getProducts()` MUST default to `[]`, which is the one thing the
 *      legacy entity suite actually asserts
 *      [meta/tests/unit/entity/BrandTest.cfc].
 *
 * Every in-scope collection on this class therefore defaults to `[]` and never
 * to `undefined`.
 *
 * ★ THE LIVE-ARRAY RULE IS ABSOLUTE. Five sibling entities mutate arrays this
 * class returns. See {@link Sku.getOptions} for the full argument; every
 * collection accessor below returns the live internal reference, never a copy,
 * never a spread, never a frozen or `readonly` view.
 */
export class Sku {
  // -------------------------------------------------------------------------
  // PERSISTENT PROPERTIES [model/entity/Sku.cfc:L52-L59]
  //
  // Reproduced verbatim, in source order, with every `hb_*` and `rbKey`
  // attribute carried forward as an inert comment. JavaRB is NOT ported and NO
  // i18n runtime is introduced: the resource-bundle identifiers survive as
  // string literals in these comments so the legacy admin can still resolve
  // them.
  // -------------------------------------------------------------------------

  /**
   * `property name="skuID" ormtype="string" length="32" fieldtype="id"
   *  generator="uuid" unsavedvalue="" default="";` [L52]
   *
   * The primary key, and the basis of EVERY probe on this class.
   */
  private readonly skuID: string;

  /**
   * `property name="activeFlag" ormtype="boolean" default="1";` [L53]
   *
   * One of exactly TWO persisted booleans on this component. Hydrated through
   * `cfBoolean` because a boolean column can arrive from SQL as `1`, `'1'`,
   * `'true'` or NULL, and CFML accepted all of them.
   */
  private activeFlag: boolean;

  /**
   * `property name="skuCode" ormtype="string" unique="true" length="50";` [L54]
   *
   * No default, so genuinely absent until set.
   */
  private skuCode?: string;

  /**
   * `property name="listPrice" ormtype="big_decimal" hb_formatType="currency"
   *  default="0";` [L55]
   *
   * ★ THE MONEY-COLUMN ASYMMETRY, AND WHY THIS FILE IS ON THE OTHER SIDE OF IT.
   * All three money columns on `Sku` — `listPrice` [L55], `price` [L56] and
   * `renewalPrice` [L57] — declare `default="0"`. That is the OPPOSITE of every
   * other money column in the slice: `SkuCurrency.price`
   * [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount`
   * [model/entity/PriceGroupRate.cfc:L54], `PromotionApplied.discountAmount`
   * [model/entity/PromotionApplied.cfc:L53] and `PromotionReward.amount`
   * [model/entity/PromotionReward.cfc:L61] all declare NO default. The ORM
   * schema itself encodes the asymmetry, so the port does too: these three are
   * non-optional `Money` defaulting to `Money.zero` on hydration, while the four
   * no-default columns elsewhere stay `Money | undefined`.
   *
   * ★ THE CONSEQUENCE FOR THE CASCADE. Because these three can never be null,
   * the `isNull(...)` guards at [L386], [L390], [L417] and [L421] are
   * STATICALLY SATISFIED, which is exactly why the corresponding writes are
   * unconditional in this port. The genuinely nullable guards at [L401] and
   * [L405] read `SkuCurrency` columns, which have no default, and those guards
   * survive as real runtime checks. See {@link Sku.materializeCurrencyDetails}.
   *
   * ★ ALL MONEY IS `Money` (E4). No `number` for money anywhere in this file and
   * no floating-point operation on a monetary value. `Money` wraps an
   * arbitrary-precision decimal and is the only arithmetic surface in the
   * target.
   */
  private listPrice: Money;

  /**
   * `property name="price" ormtype="big_decimal" hb_formatType="currency"
   *  default="0";` [L56]
   */
  private price: Money;

  /**
   * `property name="renewalPrice" ormtype="big_decimal" hb_formatType="currency"
   *  default="0";` [L57]
   */
  private renewalPrice: Money;

  /**
   * `property name="imageFile" ormtype="string" length="50";` [L58]
   *
   * The column is PRESERVED — it is part of the schema contract (B5) and
   * `Product` reads it — even though every method that interprets it belongs to
   * the out-of-scope image subsystem. See the refusing stubs below.
   */
  private imageFile?: string;

  /**
   * `property name="userDefinedPriceFlag" ormtype="boolean" default="0";` [L59]
   *
   * The second and last persisted boolean on this component.
   */
  private userDefinedPriceFlag: boolean;

  /**
   * `property name="calculatedQATS" ormtype="integer";` [L62]
   *
   * A CALCULATED property, sitting under its own banner. It is a persisted cache
   * of the quantity-available-to-sell figure that the out-of-scope stock
   * subsystem computes, so the column is preserved and nothing here computes it.
   * NOT money: it is a `quantity`, an integer, and `ormtype="integer"` says so.
   */
  private calculatedQATS?: number;

  /**
   * `property name="remoteID" ormtype="string";` [L90]
   *
   * The external-system correlation identifier. Inert here.
   */
  private remoteID?: string;

  // -------------------------------------------------------------------------
  // AUDIT PROPERTIES [model/entity/Sku.cfc:L93-L96]
  //
  // All four declare `hb_populateEnabled="false"`, meaning the framework's
  // mass-assignment path must never write them. There is no mass-assignment
  // path in the target, so the attribute is carried forward as documentation of
  // the intent rather than as an enforced rule.
  //
  // UTC POLICY: every `Date` on this class is an instant in UTC. CFML compared
  // dates in the server's local timezone, which made the answer depend on where
  // the server was; the target fixes the reference frame explicitly. NO CLOCK IS
  // INJECTED INTO THIS ENTITY — unlike `PromotionPeriod`, `Sku` has no
  // date-dependent predicate, so there is nothing here that needs to know what
  // time it is.
  //
  // Both `Account` foreign keys collapse to inert opaque identifiers because
  // `Account` is out of scope. The column, its name and its value survive; the
  // association does not.
  // -------------------------------------------------------------------------

  /** `property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";` [L93] */
  private createdDateTime?: Date;

  /**
   * `property name="createdByAccount" cfc="Account" fieldtype="many-to-one"
   *  fkcolumn="createdByAccountID" hb_populateEnabled="false";` [L94]
   *
   * Collapsed to the raw foreign key. Precedent:
   * `Promotion.defaultImage` → `defaultImageID?: string`.
   */
  private createdByAccountID?: string;

  /** `property name="modifiedDateTime" hb_populateEnabled="false" ormtype="timestamp";` [L95] */
  private modifiedDateTime?: Date;

  /** As [L96], collapsed to the raw foreign key for the same reason as [L94]. */
  private modifiedByAccountID?: string;

  // -------------------------------------------------------------------------
  // IN-SCOPE ASSOCIATIONS
  // -------------------------------------------------------------------------

  /**
   * `property name="product" cfc="Product" fieldtype="many-to-one"
   *  fkcolumn="productID" hb_cascadeCalculate="true";` [L65]
   *
   * `hb_cascadeCalculate="true"` marks the edge the framework walks when
   * recalculating derived values. There is no cascading recalculation engine in
   * the target; the attribute is recorded so the intent is not lost.
   *
   * Optional because `removeProduct()` [L618] does `structDelete(variables,
   * "product")`, so absence is a state the legacy entity genuinely reaches.
   */
  private product: Product | undefined;

  /**
   * `property name="options" singularname="option" cfc="Option"
   *  fieldtype="many-to-many" linktable="SwSkuOption" fkcolumn="skuID"
   *  inversejoincolumn="optionID";` [L76]
   *
   * The OWNING side of the many-to-many. Read by nine methods in this file and
   * by the promotion entities' `hasAnyOption`/`hasAnyExcludedOption` probes.
   */
  private readonly options: Option[];

  /**
   * `property name="skuCurrencies" singularname="skuCurrency" cfc="SkuCurrency"
   *  fieldtype="one-to-many" fkcolumn="skuID" cascade="all-delete-orphan"
   *  inverse="true";` [L72]
   *
   * STEP 2 OF THE CASCADE READS THIS COLLECTION [L399-L414].
   *
   * `cascade="all-delete-orphan"` is an ORM obligation with no equivalent here;
   * honouring it belongs to the repository that deletes the sku, and it is
   * recorded there rather than faked here.
   */
  private readonly skuCurrencies: SkuCurrency[];

  /**
   * `property name="priceGroupRates" singularname="priceGroupRate"
   *  cfc="PriceGroupRate" fieldtype="many-to-many" linktable="SwPriceGroupRateSku"
   *  fkcolumn="skuID" inversejoincolumn="priceGroupRateID" inverse="true";` [L86]
   *
   * The INVERSE side. `PriceGroupRate` owns the link table and mutates this very
   * array — see {@link Sku.getPriceGroupRates}.
   */
  private readonly priceGroupRates: PriceGroupRate[];

  /**
   * `property name="promotionRewards" singularname="promotionReward"
   *  cfc="PromotionReward" fieldtype="many-to-many" linktable="SwPromoRewardSku"
   *  inverse="true";` [L82]
   */
  private readonly promotionRewards: PromotionReward[];

  /**
   * `property name="promotionRewardExclusions" singularname="promotionRewardExclusion"
   *  cfc="PromotionReward" fieldtype="many-to-many"
   *  linktable="SwPromoRewardExclSku" inverse="true";` [L83]
   *
   * `SwPromoRewardExclSku` — the abbreviated link-table name is a schema
   * contract and is never "corrected" (B5).
   */
  private readonly promotionRewardExclusions: PromotionReward[];

  /**
   * `property name="promotionQualifiers" singularname="promotionQualifier"
   *  cfc="PromotionQualifier" fieldtype="many-to-many" linktable="SwPromoQualSku"
   *  inverse="true";` [L84]
   */
  private readonly promotionQualifiers: PromotionQualifier[];

  /**
   * `property name="promotionQualifierExclusions"
   *  singularname="promotionQualifierExclusion" cfc="PromotionQualifier"
   *  fieldtype="many-to-many" linktable="SwPromoQualExclSku" inverse="true";` [L85]
   */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  // -------------------------------------------------------------------------
  // OUT-OF-SCOPE ASSOCIATIONS, COLLAPSED TO INERT OPAQUE IDENTIFIERS
  //
  // Every association whose `cfc=` target is not one of the eighteen in-scope
  // entities collapses to an opaque identifier or is omitted outright. No
  // out-of-scope entity is ever imported, not even as a type, and no
  // entity-array accessor is ever authored for one. The precedents are
  // consistent across the folder: `Promotion.defaultImage` → `defaultImageID`;
  // `PromotionCode.accounts` and `.orders` dropped;
  // `PromotionQualifier`'s three out-of-scope many-to-manys →
  // `readonly string[]`; `PromotionReward.shippingMethods` →
  // `shippingMethodIDs: readonly string[]` with its helper pair dropped.
  //
  // "OMIT"/"DROP" means "do not author this member in the new TypeScript file,
  // and annotate why". It is never a deletion of a legacy file: the CFML
  // monolith must keep running, and every `.cfc` here is reference only.
  // -------------------------------------------------------------------------

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L66]: `subscriptionTerm` targets
   * `cfc="SubscriptionTerm"`, an out-of-scope subscription entity; collapsed to
   * its raw foreign key so the schema contract survives with no subscription
   * behaviour ported.
   */
  private subscriptionTermID?: string;

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L69]: `alternateSkuCodes` targets
   * `cfc="AlternateSkuCode"` with `inverse="true"` and
   * `cascade="all-delete-orphan"`, out of scope; collapsed to opaque identifiers
   * and its bidirectional helpers dropped. The unhonoured cascade obligation is
   * recorded in the repositories sibling, not here.
   */
  private readonly alternateSkuCodeIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L73]: `stocks` targets `cfc="Stock"` with
   * `inverse="true"` and `cascade="all-delete-orphan"`, part of the out-of-scope
   * stock/inventory/location subsystem; collapsed to opaque identifiers and its
   * bidirectional helpers dropped.
   */
  private readonly stockIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L77]: `accessContents` targets
   * `cfc="Content"`, out of scope; collapsed to opaque identifiers.
   */
  private readonly accessContentIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L78]: `subscriptionBenefits` targets
   * `cfc="SubscriptionBenefit"`, out of scope; collapsed to opaque identifiers.
   */
  private readonly subscriptionBenefitIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L79]: `renewalSubscriptionBenefits` targets
   * `cfc="SubscriptionBenefit"` through link table
   * `SwSkuRenewalSubsBenefit`, out of scope; collapsed to opaque identifiers.
   */
  private readonly renewalSubscriptionBenefitIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L87]: `physicals` targets `cfc="Physical"`
   * through link table `SwPhysicalSku`, out of scope; collapsed to opaque
   * identifiers.
   *
   * LEGACY-NOTE [model/validation/Sku.json]: the delete-context validation rules
   * use `maxCollection:0` against collections the domain deliberately does not
   * materialise — `"physicalCounts": [{"contexts":"delete","maxCollection":0}]`
   * on Sku, Product, Brand and ProductType, plus `PriceGroup.appliedOrderItems`
   * and `PromotionCode.orders`. Because this collection is a list of identifiers
   * rather than a materialised entity graph, those rules would trivially PASS in
   * TypeScript where they BLOCK in CFML. That is an anti-corruption tension, it is
   * recorded here, and delete-context enforcement itself belongs to the service
   * and repository tiers rather than to this entity.
   *
   * ★ AND A SHARPER FINDING FROM READING THE TWO FILES TOGETHER: the rule names
   * the property `physicalCounts`, but [model/entity/Sku.cfc:L87] declares
   * `physicals` — with `singularname="physical"`, `cfc="Physical"` and linktable
   * `SwPhysicalSku`. THERE IS NO `physicalCounts` PROPERTY ON THIS ENTITY AT ALL.
   * So the delete-context rule targets a property the component does not declare,
   * which means it cannot have been protecting anything in CFML either. Recorded
   * as a legacy quirk; nothing is renamed and nothing is invented to satisfy it
   * (B5).
   */
  private readonly physicalIDs: readonly string[];

  // -------------------------------------------------------------------------
  // COLLABORATORS (T1) AND EXPLICIT CONTEXT (T6)
  // -------------------------------------------------------------------------

  private readonly settingsProvider?: SettingsProvider;
  private readonly currencyConverter?: CurrencyConverter;
  private readonly priceGroupResolver?: SkuPriceGroupResolver;
  private readonly skuRepository?: SkuRepository;
  private readonly currentAccountContext?: CurrentAccountContext;

  // -------------------------------------------------------------------------
  // PRE-MATERIALISED READ MODELS
  // -------------------------------------------------------------------------

  private readonly salePriceDetail?: SkuSalePriceDetails;
  private readonly newFlag: boolean;

  // -------------------------------------------------------------------------
  // INSTANCE-SCOPED MEMOS
  //
  // Each corresponds to a `structKeyExists(variables, "...")` guard in the
  // legacy source. `undefined` here means "the legacy `variables` key does not
  // exist yet", which is exactly the state the guard tests.
  //
  // LAZY-LOAD PROBES BECOME STATIC CHECKS. Where the legacy tested
  // `structKeyExists(variables, "<association>")` it was testing Hibernate's
  // lazy-load state, not business state. With eager materialisation those probes
  // are statically true, so each is ported as a plain `!== undefined` check with
  // this note attached rather than as a pretend laziness test.
  //
  // ★ WHY EACH IS AN EXPLICIT `T | undefined` UNION RATHER THAN AN OPTIONAL
  // MEMBER. Under `exactOptionalPropertyTypes` an optional member `x?: T` cannot
  // be ASSIGNED `undefined`, and these slots must be clearable — a setter that
  // changes a price has to invalidate the cascade memo. The alternative,
  // `delete this.x`, is never the right instrument: it mutates the object's shape
  // instead of its value. The union states the honest model, which is that the
  // slot always exists and holds `undefined` until the value is computed.
  //
  // This is the opposite decision from {@link CurrencyDetail}'s price sub-keys,
  // where "absent" and "present-but-undefined" MUST stay distinguishable because
  // [L416] tests `structKeyExists`. Both decisions are deliberate, and they point
  // in opposite directions for a reason.
  // -------------------------------------------------------------------------

  /** [model/entity/Sku.cfc:L361] `structKeyExists(variables, "currencyCode")`. */
  private currencyCodeMemo: string | undefined;

  /** [model/entity/Sku.cfc:L368] `structKeyExists(variables, "currencyDetails")`. */
  private currencyDetailsMemo: Record<string, CurrencyDetail> | undefined;

  /** [model/entity/Sku.cfc:L501] — see the DEFECT 17 divergence. */
  private optionsByOptionGroupCodeStructMemo: Record<string, Option> | undefined;

  /** [model/entity/Sku.cfc:L513] — see the DEFECT 18 divergence. */
  private optionsByOptionGroupIDStructMemo: Record<string, Option> | undefined;

  /** [model/entity/Sku.cfc:L525] `structKeyExists(variables, "optionsIDList")`. */
  private optionsIDListMemo: string | undefined;

  /** [model/entity/Sku.cfc:L483] `structKeyExists(variables, "livePrice")`. */
  private livePriceMemo: Money | undefined;

  /** [model/entity/Sku.cfc:L436] `structKeyExists(variables, "currentAccountPrice")`. */
  private currentAccountPriceMemo: Money | undefined;

  /** [model/entity/Sku.cfc:L576] `structKeyExists(variables, "skuDefinition")`. */
  private skuDefinitionMemo: string | undefined;

  /** [model/entity/Sku.cfc:L593] `structKeyExists(variables, "transactionExistsFlag")`. */
  private transactionExistsFlagMemo: boolean | undefined;

  /**
   * Constructs a hydrated `Sku`.
   *
   * The three `default="0"` money columns [L55-L57] are coerced to `Money.zero`
   * here when absent, which is what makes them non-optional for the rest of the
   * file. Every in-scope collection defaults to `[]`. Every collaborator is
   * optional and is checked at the point of use, so a partially-hydrated sku
   * fails loudly at the member that needs the missing collaborator instead of
   * silently answering zero.
   */
  public constructor(input: SkuHydrationInput) {
    this.skuID = input.skuID;

    // [L53] default="1" — hydrated through the CFML boolean helper because a
    // persisted boolean column can arrive as SQL NULL, `0`/`1`, or `'true'`.
    this.activeFlag = input.activeFlag === undefined ? true : cfBoolean(input.activeFlag);

    if (input.skuCode !== undefined) {
      this.skuCode = input.skuCode;
    }

    // [L55-L57] default="0" — the asymmetry documented on the fields above.
    this.listPrice = input.listPrice ?? Money.zero;
    this.price = input.price ?? Money.zero;
    this.renewalPrice = input.renewalPrice ?? Money.zero;

    if (input.imageFile !== undefined) {
      this.imageFile = input.imageFile;
    }

    // [L59] default="0".
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

    // Declared as an explicit `Product | undefined` union rather than an optional
    // member, because `removeProduct()` must be able to CLEAR it — [L618] executes
    // `structDelete(variables, "product")`. Under `exactOptionalPropertyTypes` an
    // optional member cannot be assigned `undefined`, and `delete this.product` is
    // never the right instrument.
    this.product = input.product;

    // ★ THE LIVE-ARRAY RULE STARTS HERE. Each collection adopts the caller's
    // array when one is supplied, rather than copying it, so a repository that
    // wires both sides of an association sees one array and not two.
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

    this.newFlag = input.isNew ?? false;
  }

  // =========================================================================
  // PRIVATE HELPERS
  //
  // These have no legacy counterpart. They exist so that the same faithful
  // decision is taken at every site rather than being re-improvised, and each
  // records which CFML behaviour it reproduces.
  // =========================================================================

  /**
   * Resolves an option's option group, reproducing the CFML raise when it is
   * absent.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L504, L516, L776, L866, L902]: every one of
   * those lines chains `option.getOptionGroup().getOptionGroupXxx()` with no null
   * check. In CFML a null `optionGroup` raises immediately, so raising here is
   * the faithful port. Skipping the option instead would invent a tolerance the
   * legacy never had, and would silently change the contents of two struct
   * accessors and the answer of a live validator.
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
   * Resolves a value that CFML used directly as a struct key, reproducing the
   * raise when it is absent.
   *
   * LEGACY-NOTE: `structKeyExists(struct, javaCast("null", ""))` raises in CFML,
   * so a null option-group code or name was never a survivable state at
   * [model/entity/Sku.cfc:L504-L505], [L776-L779] or [L902].
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
   * LEGACY-NOTE [model/entity/Sku.cfc:L776]: the legacy call is `listFind`, the
   * CASE-SENSITIVE variant. `src/lib/cfml/list.ts` intentionally exports only
   * `listFindNoCase`, and its five-member export surface is
   * `listLen`, `listGetAt`, `listAppend`, `listToArray`, `listFindNoCase`.
   * Substituting `listFindNoCase` would silently change case sensitivity on a
   * live validation path, and adding a member to that module is not this file's
   * to do — so the case-sensitive test is implemented here, over `listToArray`,
   * with an exact `===` comparison. Case sensitivity is preserved deliberately.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L776]: `if(listFind(...))` relies on CFML
   * truthiness of a 1-BASED numeric index, where `0` means "not found". A ported
   * caller must never write `if (listFindNoCase(...))` or compare a `findIndex`
   * result with `> 0`. This helper returns a `boolean` so the hazard cannot
   * reach the call site at all.
   */
  private static listFindCaseSensitive(list: string, value: string): boolean {
    return listToArray(list).some((element: string) => element === value);
  }

  /**
   * The presentation form of a monetary value.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L388, L392, L395, L403, L407, L410]: these
   * six sites call `getFormattedValue("renewalPrice"|"listPrice"|"price")`, a
   * `HibachiEntity` member that is not ported, and [L419], [L423] and [L426] call
   * the THREE-argument `formatValue(value, "currency", {currencyCode=...})`.
   * Both collapse to `numberFormat(value, '0.00')`, following the precedent set
   * by `priceGroupRate.ts` for `formatValue(v, "currency")`
   * [model/entity/PriceGroupRate.cfc:L266]. THE CURRENCY-SYMBOL AND LOCALE
   * BEHAVIOUR OF THE FRAMEWORK FORMATTER IS NOT REPRODUCED, and the per-currency
   * argument of the three-argument form has no effect on the output. No
   * formatting dependency is introduced.
   */
  private static formatCurrency(value: Money): string {
    return numberFormat(value.toDecimalString(), '0.00');
  }

  /** Names the collaborator a member needs when it was not injected. */
  private missingCollaborator(collaborator: string, locator: string): Error {
    return new Error(
      `Sku '${this.skuID}': the ${collaborator} collaborator was not injected, so ` +
        `[model/entity/Sku.cfc:${locator}] cannot be evaluated. Repositories own hydration ` +
        `and must supply it.`,
    );
  }

  // =========================================================================
  // PERSISTENT PROPERTY ACCESSORS
  //
  // `accessors=true` on the component declaration [L49] generated a getter and a
  // setter for every persistent property. Only the ones the in-scope slice
  // actually reaches are authored; the rest are recorded in the omission ledger
  // at the foot of this file.
  // =========================================================================

  /** The primary key [L52]. */
  public getSkuID(): string {
    return this.skuID;
  }

  /** [L53] */
  public getActiveFlag(): boolean {
    return this.activeFlag;
  }

  /** [L53] */
  public setActiveFlag(activeFlag: CfBooleanInput): void {
    this.activeFlag = cfBoolean(activeFlag);
  }

  /** [L54] `unique="true"`, `length="50"`, no default, so genuinely absent. */
  public getSkuCode(): string | undefined {
    return this.skuCode;
  }

  /** [L54] */
  public setSkuCode(skuCode: string): void {
    this.skuCode = skuCode;
  }

  /**
   * [L55] `default="0"`, therefore never absent. See the field documentation for
   * why this file sits on the non-optional side of the money-column asymmetry.
   */
  public getListPrice(): Money {
    return this.listPrice;
  }

  /** [L55] */
  public setListPrice(listPrice: Money): void {
    this.listPrice = listPrice;
    // The cascade [L367-L433] reads this column, so a change invalidates its memo
    // and the memo of the live price that depends on it.
    this.currencyDetailsMemo = undefined;
    this.livePriceMemo = undefined;
  }

  /** [L56] `default="0"`, therefore never absent. */
  public getPrice(): Money {
    return this.price;
  }

  /** [L56] */
  public setPrice(price: Money): void {
    this.price = price;
    this.currencyDetailsMemo = undefined;
    this.livePriceMemo = undefined;
  }

  /** [L57] `default="0"`, therefore never absent. */
  public getRenewalPrice(): Money {
    return this.renewalPrice;
  }

  /** [L57] */
  public setRenewalPrice(renewalPrice: Money): void {
    this.renewalPrice = renewalPrice;
    this.currencyDetailsMemo = undefined;
    this.livePriceMemo = undefined;
  }

  /**
   * [L58] `length="50"`.
   *
   * The column is read by `Product`'s default-image path. Every method in THIS
   * file that would interpret it belongs to the out-of-scope image subsystem, so
   * the raw value is exposed and nothing here interprets it.
   */
  public getImageFile(): string | undefined {
    return this.imageFile;
  }

  /** [L59] */
  public getUserDefinedPriceFlag(): boolean {
    return this.userDefinedPriceFlag;
  }

  /** [L59] */
  public setUserDefinedPriceFlag(userDefinedPriceFlag: CfBooleanInput): void {
    this.userDefinedPriceFlag = cfBoolean(userDefinedPriceFlag);
  }

  /**
   * [L62] The persisted quantity-available-to-sell cache.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L62, L535]: the column is preserved (B5)
   * but `getQATS()` [L535], which recomputes it, is OMITTED — it reaches the
   * out-of-scope stock subsystem. This accessor reads the stored figure and
   * computes nothing.
   */
  public getCalculatedQATS(): number | undefined {
    return this.calculatedQATS;
  }

  /** [L90] */
  public getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [L93] UTC. */
  public getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [L94] The `Account` association, collapsed to its foreign key. */
  public getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [L95] UTC. */
  public getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [L96] The `Account` association, collapsed to its foreign key. */
  public getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /** [L66] The out-of-scope `SubscriptionTerm` association, as its foreign key. */
  public getSubscriptionTermID(): string | undefined {
    return this.subscriptionTermID;
  }

  /** [L69] Out-of-scope `AlternateSkuCode` identifiers. */
  public getAlternateSkuCodeIDs(): readonly string[] {
    return this.alternateSkuCodeIDs;
  }

  /** [L73] Out-of-scope `Stock` identifiers. */
  public getStockIDs(): readonly string[] {
    return this.stockIDs;
  }

  /** [L77] Out-of-scope `Content` identifiers. */
  public getAccessContentIDs(): readonly string[] {
    return this.accessContentIDs;
  }

  /** [L78] Out-of-scope `SubscriptionBenefit` identifiers. */
  public getSubscriptionBenefitIDs(): readonly string[] {
    return this.subscriptionBenefitIDs;
  }

  /** [L79] Out-of-scope renewal `SubscriptionBenefit` identifiers. */
  public getRenewalSubscriptionBenefitIDs(): readonly string[] {
    return this.renewalSubscriptionBenefitIDs;
  }

  /** [L87] Out-of-scope `Physical` identifiers. */
  public getPhysicalIDs(): readonly string[] {
    return this.physicalIDs;
  }

  /**
   * `true` when this row has never been persisted.
   *
   * Framework member, dispatched from
   * [org/Hibachi/HibachiEntity.cfc:L507-L565] rather than declared on
   * `Sku.cfc`. It is on the far-side contract of five sibling entities, which
   * call it before wiring a bidirectional association:
   * [model/entity/PromotionQualifier.cfc:L181, L281],
   * [model/entity/PromotionReward.cfc:L239, L339] and
   * [model/entity/PriceGroupRate.cfc:L240].
   */
  public isNew(): boolean {
    return this.newFlag;
  }

  /**
   * The property whose value represents this entity in a listing.
   *
   * [model/entity/Sku.cfc:L809-L811] verbatim — `return "skuCode";`. It sits under
   * the `START: Overridden Methods` banner [L807] and overrides the
   * `HibachiEntity` default.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L810]: the returned literal is `"skuCode"`
   * — the PERSISTENT property at [L54] — and NOT `"skuDefinition"`, even though
   * `skuDefinition` [L119] is the richer human-readable form and
   * `getSkuDefinition()` [L574] exists to compute it. Ported as the literal it is.
   * Nothing here resolves the named property dynamically, because dynamic
   * property resolution is exactly what this migration removes (B1).
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L809]: `noImplicitOverride` is enabled, but
   * this class has no TypeScript base class — the CFML `extends="HibachiEntity"`
   * chain is not ported — so what CFML called an override is a plain method here.
   * The same is true of every other member on this class that overrode something
   * in CFML.
   */
  public getSimpleRepresentationPropertyName(): string {
    return 'skuCode';
  }

  // =========================================================================
  // ASSOCIATION ACCESSORS
  //
  // ★★★ THE LIVE-ARRAY RULE IS ABSOLUTE, AND HERE IS THE PROOF.
  //
  // Five sibling entities own the far side of an association with `Sku` and
  // mutate the array this class hands back:
  //
  //   [model/entity/PriceGroupRate.cfc:L243, L251-L253]
  //       arguments.sku.hasPriceGroupRate(this)
  //       arrayDeleteAt(arguments.sku.getPriceGroupRates(), thatIndex)
  //   [model/entity/PromotionReward.cfc:L243, L251-L253]
  //       arrayDeleteAt(arguments.sku.getPromotionRewards(), thatIndex)
  //   [model/entity/PromotionReward.cfc:L343, L351-L353]
  //       arrayDeleteAt(arguments.sku.getPromotionRewardExclusions(), thatIndex)
  //   [model/entity/PromotionQualifier.cfc:L185, L193-L195]
  //       arrayDeleteAt(arguments.sku.getPromotionQualifiers(), thatIndex)
  //   [model/entity/PromotionQualifier.cfc:L285, L293-L295]
  //       arrayDeleteAt(arguments.sku.getPromotionQualifierExclusions(), thatIndex)
  //   [model/entity/SkuCurrency.cfc]
  //       arrayAppend(arguments.sku.getSkuCurrencies(), this)
  //   [model/entity/Option.cfc:L127, L131]
  //       arguments.sku.addOption(this) / arguments.sku.removeOption(this)
  //
  // RETURNING A DEFENSIVE COPY, A SPREAD, A FROZEN ARRAY OR A `readonly` VIEW
  // FROM ANY OF THESE ACCESSORS SILENTLY BREAKS BIDIRECTIONAL REMOVAL ON FIVE
  // SIBLING ENTITIES: the far side would delete from a throwaway array and the
  // link would survive. Every accessor below therefore returns the live internal
  // reference, and the ported siblings already depend on that.
  //
  // ★ WHAT THE FAR-SIDE `has*` PROBES COMPARE. In CFML the framework's
  // collection-contains test resolves through Hibernate session identity, which
  // for a managed entity is primary-key equality. The ported probes therefore
  // compare BY PRIMARY KEY — never by object reference and never by deep
  // equality — so two hydrations of the same row are correctly recognised as the
  // same association member.
  //
  // ★ THE INDEX-BASE CHANGE. CFML `arrayFind` is 1-BASED and returns `0` when
  // absent, which is why every legacy call site reads `if(index > 0)`. TypeScript
  // `findIndex` is 0-BASED and returns `-1` when absent. WRITING
  // `if (index > 0)` AGAINST A `findIndex` RESULT SILENTLY DROPS THE FIRST
  // ELEMENT. Every removal below tests `!== -1`.
  // =========================================================================

  /**
   * The owning product [L65].
   *
   * `Product | undefined` because `removeProduct()` [L618] executes
   * `structDelete(variables, "product")`, so absence is a state the legacy
   * entity genuinely reaches. That is a refinement of the legacy `any`, not a
   * widening.
   */
  public getProduct(): Product | undefined {
    return this.product;
  }

  /**
   * The options that define this sku [L76].
   *
   * ★ LIVE ARRAY REFERENCE — see the block comment above.
   * [model/entity/Option.cfc:L127] and [L131] route `Option.addSku` /
   * `Option.removeSku` back through {@link Sku.addOption} and
   * {@link Sku.removeOption}, which mutate this array in place.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L885, L914, L951, L980]: the
   * promotion engine passes this array into `PromotionQualifier.hasAnyOption`,
   * `hasAnyExcludedOption`, `PromotionReward.hasAnyOption` and
   * `hasAnyExcludedOption`. Those probes live on the promotion entities — NOT on
   * `Sku` — and they compare BY `optionID` through the implicit
   * collection-contains of [org/Hibachi/HibachiEntity.cfc:L340-L350], not by
   * object reference and not by deep equality. `Sku`'s only obligation is to
   * expose the collection they read.
   */
  public getOptions(): Option[] {
    return this.options;
  }

  /**
   * The per-currency price override rows [L72].
   *
   * ★ LIVE ARRAY REFERENCE. `SkuCurrency.setSku` appends to this array directly.
   * STEP 2 OF THE CASCADE ITERATES IT [L399-L414].
   */
  public getSkuCurrencies(): SkuCurrency[] {
    return this.skuCurrencies;
  }

  /**
   * The price-group rates that name this sku [L86].
   *
   * ★ LIVE ARRAY REFERENCE. [model/entity/PriceGroupRate.cfc:L251-L253] deletes
   * from this exact array.
   *
   * FAR-SIDE OBLIGATION — proven by [model/entity/PriceGroupRate.cfc:L243, L251,
   * L253].
   */
  public getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * The promotion rewards that include this sku [L82].
   *
   * ★ LIVE ARRAY REFERENCE. FAR-SIDE OBLIGATION — proven by
   * [model/entity/PromotionReward.cfc:L243, L251, L253].
   */
  public getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * The promotion rewards that exclude this sku [L83].
   *
   * ★ LIVE ARRAY REFERENCE. FAR-SIDE OBLIGATION — proven by
   * [model/entity/PromotionReward.cfc:L343, L351, L353].
   */
  public getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /**
   * The promotion qualifiers that include this sku [L84].
   *
   * ★ LIVE ARRAY REFERENCE. FAR-SIDE OBLIGATION — proven by
   * [model/entity/PromotionQualifier.cfc:L185, L193, L195].
   */
  public getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * The promotion qualifiers that exclude this sku [L85].
   *
   * ★ LIVE ARRAY REFERENCE. FAR-SIDE OBLIGATION — proven by
   * [model/entity/PromotionQualifier.cfc:L285, L293, L295].
   */
  public getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  // =========================================================================
  // FRAMEWORK-DISPATCHED PROBES — Branch 3, `hasAny*`/`has*`
  //
  // NONE of these is declared in `Sku.cfc`. Every one is generated at runtime by
  // the eleven-pattern dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565]
  // — `hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`,
  // `get*ID`, `get*Options`, `get*OptionsSmartList`, `get*SmartList`,
  // `get*Struct`, `get*Count`, then a `getAttributeValue` fallback at [L559],
  // terminating in a throw at [L565].
  //
  // ★ TYPESCRIPT MUST NOT EMULATE DYNAMIC DISPATCH. No `Proxy`, no index
  // signature, no `arguments` struct emulation, no `evaluate()`, no `variables.`
  // scope emulation (B1). Only the concretely-called patterns are generated, each
  // as an explicitly-typed method carrying the dispatch locator.
  //
  // ★ `Sku` IS ONE OF ONLY FOUR ENTITIES THAT COULD REACH THE [L559] EAV
  // FALLBACK, because that branch requires `hasProperty("attributeValues")` and
  // only `Sku` [L70], `Product` [model/entity/Product.cfc:L75], `ProductType`
  // [model/entity/ProductType.cfc:L67] and `Brand` [model/entity/Brand.cfc:L60]
  // declare it. For the other fourteen entities an unmatched `get…` throws
  // directly at [L565]. The EAV path is not ported (see the omission ledger), so
  // the fallback is unreachable here by construction rather than by accident.
  // =========================================================================

  /**
   * `true` when `option` is already among this sku's options.
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L507-L565]; compares by
   * `optionID`. Relied on by {@link Sku.addOption} and, transitively, by
   * [model/entity/Option.cfc:L127].
   */
  public hasOption(option: Option): boolean {
    const optionID = option.getOptionID();
    return this.options.some((held: Option) => held.getOptionID() === optionID);
  }

  /**
   * `true` when `skuCurrency` is already among this sku's override rows.
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L507-L565]; compares by
   * `skuCurrencyID`. Called on the far side by `SkuCurrency.setSku`.
   */
  public hasSkuCurrency(skuCurrency: SkuCurrency): boolean {
    const skuCurrencyID = skuCurrency.getSkuCurrencyID();
    return this.skuCurrencies.some(
      (held: SkuCurrency) => held.getSkuCurrencyID() === skuCurrencyID,
    );
  }

  /**
   * FAR-SIDE OBLIGATION — called as `arguments.sku.hasPriceGroupRate(this)` at
   * [model/entity/PriceGroupRate.cfc:L243].
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L507-L565]; compares by
   * `priceGroupRateID`; answers `false` on an empty collection.
   */
  public hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const priceGroupRateID = priceGroupRate.getPriceGroupRateID();
    return this.priceGroupRates.some(
      (held: PriceGroupRate) => held.getPriceGroupRateID() === priceGroupRateID,
    );
  }

  /**
   * FAR-SIDE OBLIGATION — [model/entity/PromotionReward.cfc:L242].
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L507-L565]; compares by
   * `promotionRewardID`.
   */
  public hasPromotionReward(promotionReward: PromotionReward): boolean {
    const promotionRewardID = promotionReward.getPromotionRewardID();
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === promotionRewardID,
    );
  }

  /**
   * FAR-SIDE OBLIGATION — [model/entity/PromotionReward.cfc:L342].
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L507-L565]; compares by
   * `promotionRewardID`.
   */
  public hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const promotionRewardID = promotionReward.getPromotionRewardID();
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === promotionRewardID,
    );
  }

  /**
   * FAR-SIDE OBLIGATION — [model/entity/PromotionQualifier.cfc:L184].
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L507-L565]; compares by
   * `promotionQualifierID`.
   */
  public hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const promotionQualifierID = promotionQualifier.getPromotionQualifierID();
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === promotionQualifierID,
    );
  }

  /**
   * FAR-SIDE OBLIGATION — [model/entity/PromotionQualifier.cfc:L284].
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L507-L565]; compares by
   * `promotionQualifierID`.
   */
  public hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const promotionQualifierID = promotionQualifier.getPromotionQualifierID();
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === promotionQualifierID,
    );
  }

  // =========================================================================
  // BIDIRECTIONAL HELPER METHODS
  // [model/entity/Sku.cfc:L601-L751] under the
  // `START: Bidirectional Helper Methods` banner
  //
  // ★★★ THE `remove*` INVERSION CROSS-CHECK — MANDATORY, AND HERE IS THE
  // VERDICT TABLE.
  //
  // [model/entity/Option.cfc:L129-L131] and [L145-L147] contain a real inversion
  // defect: two `remove*` methods that call `add*` on the far side. Every one of
  // the THIRTEEN `remove*` helpers declared in `Sku.cfc` was therefore read
  // verbatim and checked. THE RESULT IS THIRTEEN CLEAN, ZERO INVERTED — no
  // inversion defect exists on this component, so nothing is preserved under a
  // defect marker here and no divergence is spent on one.
  //
  //   #   remove* helper                       line   far-side call                              verdict
  //   1   removeProduct                        L610   arrayDeleteAt(product.getSkus(), index)    CLEAN
  //   2   removeSubscriptionTerm               L628   arrayDeleteAt(subsTerm.getSkus(), index)   CLEAN  (out of scope — dropped)
  //   3   removeAlternateSkuCode               L643   alternateSkuCode.removeSku(this)           CLEAN  (out of scope — dropped)
  //   4   removeAttributeValue                 L651   attributeValue.removeSku(this)             CLEAN  (out of scope — dropped)
  //   5   removeSkuCurrency                    L659   skuCurrency.removeSku(this)                CLEAN
  //   6   removeStock                          L667   stock.removeSku(this)                      CLEAN  (out of scope — dropped)
  //   7   removePromotionReward                L675   promotionReward.removeSku(this)            CLEAN
  //   8   removePromotionRewardExclusion       L683   promotionReward.removeExcludedSku(this)    CLEAN
  //   9   removePromotionQualifier             L691   promotionQualifier.removeSku(this)         CLEAN
  //  10   removePromotionQualifierExclusion    L699   promotionQualifier.removeExcludedSku(this) CLEAN
  //  11   removeAccessContent                  L712   arrayDeleteAt both sides                   CLEAN  (out of scope — dropped)
  //  12   removeSubscriptionBenefit            L732   arrayDeleteAt both sides                   CLEAN  (out of scope — dropped)
  //  13   removePhysical                       L747   physical.removeSku(this)                   CLEAN  (out of scope — dropped)
  //
  // Six of the thirteen are in scope and are authored below. The other seven
  // target out-of-scope entities and are DROPPED with a note, following the
  // precedent that dropped `Brand.addAttributeValue`
  // [model/entity/Brand.cfc:L90] and `removeAttributeValue` [L93]. Consistent
  // with the rest of the folder — `ProductType` CLEAN x11, `PriceGroup` CLEAN
  // x8, `PriceGroupRate` CLEAN x4, `PromotionApplied` CLEAN x4,
  // `PromotionAccount` CLEAN x2, `PromotionPeriod` CLEAN x3, `PromotionCode`
  // CLEAN x3, `Promotion` CLEAN x3, `PromotionQualifier` CLEAN x11,
  // `PromotionReward` CLEAN x13.
  //
  // `addOption` and `removeOption` are NOT in that table because `Sku.cfc`
  // declares no hand-written helper for `options` — the ORM generated them from
  // the `fieldtype="many-to-many" singularname="option"` declaration at [L76].
  // They are authored here because [model/entity/Option.cfc:L127, L131] call
  // them by name.
  // =========================================================================

  /**
   * Attaches this sku to a product, wiring both sides.
   *
   * [model/entity/Sku.cfc:L604-L608] verbatim:
   *
   *   variables.product = arguments.product;
   *   if(isNew() or !arguments.product.hasSku( this )) {
   *     arrayAppend(arguments.product.getSkus(), this);
   *   }
   *
   * The `isNew() or` short-circuit is preserved exactly: a brand-new sku is
   * appended WITHOUT the containment probe, which is how the legacy avoided a
   * probe against an unsaved key.
   */
  public setProduct(product: Product): void {
    this.product = product;
    if (this.isNew() || !product.hasSku(this)) {
      product.getSkus().push(this);
    }
  }

  /**
   * Detaches this sku from a product, unwiring both sides.
   *
   * [model/entity/Sku.cfc:L610-L619] verbatim:
   *
   *   if(!structKeyExists(arguments, "product")) { arguments.product = variables.product; }
   *   var index = arrayFind(arguments.product.getSkus(), this);
   *   if(index > 0) { arrayDeleteAt(arguments.product.getSkus(), index); }
   *   structDelete(variables, "product");
   *
   * The omitted-argument default is reproduced as an optional parameter. The
   * `structDelete` is reproduced by assigning `undefined` — NEVER by
   * `delete this.product`, because `exactOptionalPropertyTypes` makes assignment
   * the correct and checkable form.
   *
   * ★ `index > 0` BECOMES `!== -1`. The legacy test is correct for a 1-based
   * `arrayFind`; carrying it over literally against a 0-based `findIndex` would
   * silently refuse to remove the FIRST sku of a product.
   */
  public removeProduct(product?: Product): void {
    const target = product ?? this.product;
    if (target === undefined) {
      // LEGACY-NOTE [model/entity/Sku.cfc:L611-L614]: with no argument and no
      // `variables.product`, CFML would raise on `arguments.product.getSkus()`.
      // Raising here is the faithful port.
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
   * ORM-generated from [model/entity/Sku.cfc:L76]; called by
   * [model/entity/Option.cfc:L127] as `arguments.sku.addOption(this)`.
   *
   * `Sku` is the OWNING side of `SwSkuOption`, so this is the side that holds the
   * array. Guarded by {@link Sku.hasOption} so the link table cannot acquire a
   * duplicate row.
   */
  public addOption(option: Option): void {
    if (this.isNew() || !this.hasOption(option)) {
      this.options.push(option);
      this.invalidateOptionMemos();
    }
  }

  /**
   * ORM-generated from [model/entity/Sku.cfc:L76]; called by
   * [model/entity/Option.cfc:L131] as `arguments.sku.removeOption(this)`.
   *
   * `!== -1`, not `> 0`.
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
   * LEGACY-NOTE [model/entity/Sku.cfc:L501, L513, L525, L576]: the legacy
   * component never invalidates these memos, because a CFML request was short
   * enough that a sku's options did not change underneath them. The target keeps
   * instances request-scoped for the same reason, and invalidating on mutation is
   * strictly safer without changing any answer the legacy could produce within a
   * single request.
   */
  private invalidateOptionMemos(): void {
    this.optionsByOptionGroupCodeStructMemo = undefined;
    this.optionsByOptionGroupIDStructMemo = undefined;
    this.optionsIDListMemo = undefined;
    this.skuDefinitionMemo = undefined;
  }

  /**
   * [model/entity/Sku.cfc:L656-L658] — `arguments.skuCurrency.setSku( this )`.
   *
   * The one-to-many is `inverse="true"` [L72], so the far side owns the foreign
   * key and this helper delegates rather than appending. Verdict: CLEAN.
   */
  public addSkuCurrency(skuCurrency: SkuCurrency): void {
    skuCurrency.setSku(this);
    this.currencyDetailsMemo = undefined;
  }

  /**
   * [model/entity/Sku.cfc:L659-L661] — `arguments.skuCurrency.removeSku( this )`.
   *
   * Verdict: CLEAN — it calls `removeSku`, not `setSku`.
   */
  public removeSkuCurrency(skuCurrency: SkuCurrency): void {
    skuCurrency.removeSku(this);
    this.currencyDetailsMemo = undefined;
  }

  /** [model/entity/Sku.cfc:L672-L674] — `arguments.promotionReward.addSku( this )`. */
  public addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L675-L677] — `arguments.promotionReward.removeSku( this )`.
   * Verdict: CLEAN.
   */
  public removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L680-L682] — `arguments.promotionReward.addExcludedSku( this )`.
   *
   * Note the parameter name in the legacy source is `promotionReward`, not
   * `promotionRewardExclusion`: the exclusion is a role on the same entity, not a
   * separate one.
   */
  public addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L683-L685] — `arguments.promotionReward.removeExcludedSku( this )`.
   * Verdict: CLEAN.
   */
  public removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedSku(this);
  }

  /** [model/entity/Sku.cfc:L688-L690] — `arguments.promotionQualifier.addSku( this )`. */
  public addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L691-L693] — `arguments.promotionQualifier.removeSku( this )`.
   * Verdict: CLEAN.
   */
  public removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeSku(this);
  }

  /** [model/entity/Sku.cfc:L696-L698] — `arguments.promotionQualifier.addExcludedSku( this )`. */
  public addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L699-L701] — `arguments.promotionQualifier.removeExcludedSku( this )`.
   * Verdict: CLEAN.
   */
  public removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedSku(this);
  }

  // =========================================================================
  // OPTION METHODS
  // [model/entity/Sku.cfc:L231-L253] and the two struct accessors at
  // [L500-L522]
  //
  // ★ A BANNER WART WORTH RECORDING. `Sku.cfc` mixes TWO banner styles. The long
  // form — `// =============== START: Custom Validation Methods ====================`
  // — appears at [L753], [L786], [L788], [L790], [L792], [L876], [L878], [L880],
  // [L882] and [L912]. A SHORT form appears at EIGHT sites: [L128]
  // (`// START: Image Methods`), [L229] (`// END: Image Methods`), [L231]
  // (`// START: Option Methods`), [L253], [L255], [L287], [L289] and [L317].
  // NO OTHER IN-SCOPE ENTITY USES THE SHORT FORM. Enumerations that report four
  // short-form sites are undercounting. It is a wart, it is recorded, and it is
  // NOT normalised.
  // =========================================================================

  /**
   * The option names, joined by a caller-supplied delimiter.
   *
   * [model/entity/Sku.cfc:L233-L239] verbatim, `delimiter=" "` default preserved.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L233 versus L885]: this method is a
   * NON-DEPRECATED near-duplicate of `displayOptions()` [L885-L891], which sits
   * in the Deprecated Methods section carrying the hint
   * `// @hint: USE skuDefinition()`. The two bodies differ only in their local
   * variable name. Both are ported, in their respective sections, because both
   * are on the public surface (B4) — and the duplication itself is recorded here
   * rather than resolved.
   *
   * Uses the THREE-ARGUMENT `listAppend(list, value, delimiter)`, which
   * `src/lib/cfml/list.ts` does declare.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L236]: the ported `Option.getOptionName()`
   * is typed `string | undefined` because the column carries no default, and the
   * legacy passes it straight into `listAppend` with no null check.
   * `model/validation/Option.json` declares `optionName` as
   * `{"contexts":"save","required":true}`, so a persisted option always has one —
   * the absent branch is unreachable for validated data. `''` is substituted
   * rather than raising, because an empty element keeps the element COUNT correct
   * and a raise in a display helper would be a harsher answer than the legacy
   * gives.
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
   * [model/entity/Sku.cfc:L241-L245]. THIS ONE IS CLEAN: it guards the ID struct
   * and reads the ID struct with an ID key. Contrast
   * {@link Sku.getOptionByOptionGroupCode} directly below, which is not.
   *
   * There is no `else`, so a miss yields nothing — refined from the legacy `any`
   * to `Option | undefined`.
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
   * LEGACY-DEFECT [model/entity/Sku.cfc:L247-L251]: the guard tests the CODE
   * struct but the lookup reads the ID struct — with a CODE key.
   * Preserved deliberately; do not fix without a product decision.
   *
   * The legacy body verbatim:
   *
   *   if(structKeyExists(getOptionsByOptionGroupCodeStruct(), arguments.optionGroupCode)) {
   *     return getOptionsByOptionGroupIDStruct()[ arguments.optionGroupCode ];
   *   }
   *
   * An option-group CODE is never a key in the ID-keyed map, so once the guard
   * passes the lookup misses and the method yields nothing.
   *
   * ★ WHY THIS IS PRESERVED WHILE DEFECTS 17 AND 18 ARE FIXED. This is a
   * CROSS-STRUCT mismatch and it is OBSERVABLE THROUGH THE PUBLIC CONTRACT: a
   * caller asking for an option by group code gets nothing back, and that
   * nothing is the answer the legacy system gives today. It therefore does NOT
   * qualify for the divergence justification — which requires the defect to be
   * unobservable — and it must NOT be "fixed" to read the code struct.
   *
   * ★ A COLLATERAL CONSEQUENCE OF THE DIVERGENCE, RECORDED AND NOT REPAIRED.
   * In the legacy system this method's miss is INCIDENTAL: DEFECT 18 leaves the
   * ID struct permanently empty, so the lookup would have missed regardless of
   * which key it used. With DEFECTS 17 and 18 fixed the ID struct is genuinely
   * populated, so the miss becomes DETERMINISTIC — it now misses precisely
   * because a code is not an ID. The observable answer is unchanged (nothing);
   * only the reason changed. That is recorded here rather than repaired.
   *
   * `noUncheckedIndexedAccess` already types the lookup as `Option | undefined`.
   * No `!`, no fallback.
   */
  public getOptionByOptionGroupCode(optionGroupCode: string): Option | undefined {
    if (structKeyExists(this.getOptionsByOptionGroupCodeStruct(), optionGroupCode)) {
      // The ID struct, with a CODE key — the defect, reproduced exactly.
      return structGet(this.getOptionsByOptionGroupIDStruct(), optionGroupCode);
    }
    return undefined;
  }

  /**
   * The options of this sku, keyed by their option group's CODE.
   *
   * DELIBERATE DIVERGENCE [model/entity/Sku.cfc:L500-L510]: the legacy body
   * guards, populates and returns `variables.optionsByOptionGroupCodeStruct`, but
   * its initialisation at [L502] targets `variables.optionsByOptionGroupIDStruct`
   * — the WRONG KEY.
   * Fixed because it is unobservable through the public contract; memos are
   * request-scoped.
   *
   * The legacy body verbatim:
   *
   *   if(!structKeyExists(variables, "optionsByOptionGroupCodeStruct")) {
   *     variables.optionsByOptionGroupIDStruct = {};                      // <- WRONG KEY
   *     for(var option in getOptions()) {
   *       if( !structKeyExists(variables.optionsByOptionGroupCodeStruct, option.getOptionGroup().getOptionGroupCode())){
   *         variables.optionsByOptionGroupCodeStruct[ option.getOptionGroup().getOptionGroupCode() ] = option;
   *       }
   *     }
   *   }
   *   return variables.optionsByOptionGroupCodeStruct;
   *
   * ★ THE SHARPER CHARACTERISATION — THIS DEFECT CROSS-CONTAMINATES ITS SIBLING.
   * Describing it as "guards on the wrong `variables` key" understates it. Two
   * distinct consequences follow, and the second is the serious one:
   *
   *   (a) `variables.optionsByOptionGroupCodeStruct` is never initialised, so
   *       [L504]'s `structKeyExists` against it fails on the first iteration and
   *       [L505] then creates the struct implicitly by assignment. This method's
   *       own answer therefore happens to come out right.
   *   (b) IT POISONS THE OTHER MEMO. After this method runs,
   *       `variables.optionsByOptionGroupIDStruct` exists as `{}`. So the guard
   *       at [L513] inside `getOptionsByOptionGroupIDStruct()` is FALSE, that
   *       method skips its population loop entirely, and it returns an EMPTY MAP
   *       — for the rest of the request.
   *
   * ★ THE JUSTIFICATION FOR FIXING, STATED VERBATIM. These are unobservable
   * through the public contract — they cause redundant recomputation or a
   * poisoned/empty cache rather than a different intended returned value — and
   * the memos become request-scoped anyway.
   *
   * ★ TWO OF THE FOLDER'S THREE DIVERGENCES ARE SPENT HERE AND ON
   * {@link Sku.getOptionsByOptionGroupIDStruct}. The third belongs to
   * `product.ts` (DEFECT 19, `Product.getBrandName`
   * [model/entity/Product.cfc:L524-L532]). NO FOURTH DIVERGENCE MAY EVER BE
   * SPENT — every other defect on this component is preserved.
   *
   * The inner guard is `if (!exists)`, so THE FIRST option per key wins and a
   * later option sharing an option group is discarded. Key comparison is
   * case-insensitive, matching CFML struct-key semantics.
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
        // Case-insensitive existence, as CFML struct keys are — the first
        // option per option group wins [L504].
        if (!structKeyExists(struct, optionGroupCode)) {
          struct[optionGroupCode] = option;
        }
      }
      this.optionsByOptionGroupCodeStructMemo = struct;
    }
    return this.optionsByOptionGroupCodeStructMemo;
  }

  /**
   * The options of this sku, keyed by their option group's ID.
   *
   * DELIBERATE DIVERGENCE [model/entity/Sku.cfc:L512-L522]: the guard [L513], the
   * initialisation [L514], the inner existence test [L516] and the return [L521]
   * all use `optionsByOptionGroupIDStruct`, but THE WRITE AT [L517] TARGETS
   * `variables.OptionsByGroupIDStruct` — a genuinely different name, not merely
   * different capitalisation of the same one — so the returned map is ALWAYS
   * EMPTY.
   * Fixed because it is unobservable through the public contract; memos are
   * request-scoped.
   *
   * The legacy body verbatim:
   *
   *   if(!structKeyExists(variables, "optionsByOptionGroupIDStruct")) {
   *     variables.optionsByOptionGroupIDStruct = {};                      // correct
   *     for(var option in getOptions()) {
   *       if( !structKeyExists(variables.optionsByOptionGroupIDStruct, option.getOptionGroup().getOptionGroupID())){
   *         variables.OptionsByGroupIDStruct[ option.getOptionGroup().getOptionGroupID() ] = option;   // <- STRAY TARGET
   *       }
   *     }
   *   }
   *   return variables.optionsByOptionGroupIDStruct;                      // <- always empty
   *
   * CFML struct KEYS are case-insensitive, but `OptionsByGroupIDStruct` and
   * `optionsByOptionGroupIDStruct` are not case variants of one another —
   * `OptionGroup` is missing from the first. They are two different `variables`
   * members.
   *
   * ★★★ THE COLLISION HAZARD IS RESOLVED: THERE IS NO COLLISION. The obvious
   * worry is that the deprecated `getOptionsByGroupIDStruct()` [L894-L896] reads
   * the stray target. It does not — its body is `return
   * getOptionsByOptionGroupIDStruct();`, pure delegation. So
   * `variables.OptionsByGroupIDStruct` is written by [L517] and read by NOTHING
   * anywhere in the component: A PURE DEAD WRITE. That closes the open question,
   * and it is the reason fixing [L517] cannot disturb any other member.
   *
   * ★ THE JUSTIFICATION FOR FIXING, STATED VERBATIM. These are unobservable
   * through the public contract — they cause redundant recomputation or a
   * poisoned/empty cache rather than a different intended returned value — and
   * the memos become request-scoped anyway.
   *
   * ★ THE COLLATERAL CONSEQUENCE THAT IS NOT FIXED is documented on
   * {@link Sku.getOptionByOptionGroupCode}: with this map genuinely populated,
   * that method's miss becomes deterministic instead of incidental.
   *
   * The first option per key wins [L516].
   */
  public getOptionsByOptionGroupIDStruct(): Record<string, Option> {
    if (this.optionsByOptionGroupIDStructMemo === undefined) {
      const struct: Record<string, Option> = {};
      for (const option of this.options) {
        const optionGroup = Sku.requireOptionGroup(option, 'L516');
        const optionGroupID = optionGroup.getOptionGroupID();
        if (!structKeyExists(struct, optionGroupID)) {
          struct[optionGroupID] = option;
        }
      }
      this.optionsByOptionGroupIDStructMemo = struct;
    }
    return this.optionsByOptionGroupIDStructMemo;
  }

  /**
   * This sku's option IDs as a comma-delimited list.
   *
   * [model/entity/Sku.cfc:L524-L533] verbatim. `listAppend` is PURE and emits NO
   * LEADING DELIMITER on an empty list, which is what makes the accumulator start
   * at `''` correctly — load-bearing at [L528], and equally at [L760], [L779] and
   * [L888].
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L524]: the legacy declares
   * `returntype="string"` and returns the comma list rather than an array. The
   * list form is preserved for interface parity even though an `Option[]` would
   * be the idiomatic TypeScript answer — the list is what callers pass onward
   * into `getSkusBySelectedOptions`.
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
   * The name of the option belonging to the option group with the given ID.
   *
   * ★ THIS REPLACES THE `onMissingMethod` DISPATCHER OVERRIDE AT
   * [model/entity/Sku.cfc:L857-L873]. The locator is L857 (the `@hint`) through
   * L873, with the declaration on L858 — NOT L852. The legacy body verbatim:
   *
   *   // @hint we override the oMM to look for options by optionGroupID
   *   public any function onMissingMethod(required string missingMethodName, required struct missingMethodArguments) {
   *     // getXXX()      Where XXX is a optionGroupID
   *     if (left(arguments.missingMethodName, 3) == "get") {
   *       var potentialOptionGroupID = right(arguments.missingMethodName, len(arguments.missingMethodName)-3);
   *       for(var i=1; i<=arrayLen(getOptions()); i++) {
   *         if(getOptions()[i].getOptionGroup().getOptionGroupID() == potentialOptionGroupID) {
   *           return getOptions()[i].getOptionName();
   *         }
   *       }
   *     }
   *     return super.onMissingMethod(argumentCollection=arguments);
   *   }
   *
   * ★ THE CFML DYNAMIC FORM IS NOT REPRODUCIBLE, AND MUST NOT BE EMULATED. There
   * is no `Proxy`, no index signature, no `arguments` struct emulation and no
   * `evaluate()` anywhere in this file (B1). The capability the override actually
   * provides — "give me the option name for this option group" — is expressed as
   * this one explicitly-typed method, which is what a caller can be
   * compile-checked against.
   *
   * ★ THE SHADOWING HAZARD, DOCUMENTED. Because the override intercepts EVERY
   * unmatched `get*` call and compares the suffix against runtime optionGroupID
   * values, an optionGroupID that happened to equal a legitimate property suffix
   * would SHADOW the framework's own dispatch for that property — the option
   * name would be returned where the framework member was intended. This is a
   * legacy HAZARD rather than a numbered defect: it requires a specific
   * coincidence of data to fire, and it cannot fire here at all, because the
   * capability is now a named method with a typed parameter.
   *
   * ★ WHERE THE FALL-THROUGH WENT. [L872] delegates to
   * `super.onMissingMethod(...)`, landing in the eleven-pattern dispatcher at
   * [org/Hibachi/HibachiEntity.cfc:L507-L565]. Because `Sku` declares
   * `attributeValues` [L70] it is one of only four entities that can reach the
   * EAV fallback at [org/Hibachi/HibachiEntity.cfc:L559] before the throw at
   * [L565]. The EAV path is not ported, so neither the fallback nor the throw has
   * a target here — the concretely-called dispatcher patterns are authored as
   * explicit methods instead.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L866]: the legacy comparison uses CFML `==`
   * on strings, which is CASE-INSENSITIVE. `eqeqeq` forbids `==` here, so
   * case-insensitivity is implemented EXPLICITLY through `cfEquals` rather than
   * being inherited from the operator.
   *
   * Returns the FIRST match's option name, or nothing when no option group
   * matches — refined from the legacy `any` to `string | undefined`.
   */
  public getOptionNameByOptionGroupID(optionGroupID: string): string | undefined {
    for (const option of this.options) {
      const optionGroup = Sku.requireOptionGroup(option, 'L866');
      // Case-insensitive, as CFML `==` on strings is [L866].
      if (cfEquals(optionGroup.getOptionGroupID(), optionGroupID)) {
        return option.getOptionName();
      }
    }
    return undefined;
  }

  // =========================================================================
  // PRICE / CURRENCY METHODS
  // [model/entity/Sku.cfc:L255-L287] plus the cascade at [L360-L433]
  // =========================================================================

  /**
   * The price of this sku under a promotion.
   *
   * LEGACY-DEFECT [model/entity/Sku.cfc:L258]: the body calls
   * `promotionService.calculateSkuPriceBasedOnPromotion`, WHICH DOES NOT EXIST,
   * so every invocation raises.
   * Preserved deliberately; do not fix without a product decision.
   *
   * The legacy body verbatim:
   *
   *   public numeric function getPriceByPromotion( required any promotion) {
   *     return getService("promotionService").calculateSkuPriceBasedOnPromotion(sku=this, promotion=arguments.promotion);
   *   }
   *
   * ★ THE ABSENCE IS ESTABLISHED FOUR INDEPENDENT WAYS, NOT ASSUMED.
   *   1. `calculateSkuPriceBasedOnPromotion` appears nowhere in the non-Hibachi
   *      tree — `model/service/PromotionService.cfc` does not declare it.
   *   2. It appears nowhere under `org/Hibachi/`.
   *   3. `HibachiService.onMissingMethod`
   *      [org/Hibachi/HibachiService.cfc:L255-L280] dispatches ONLY
   *      `getSmartList`, `get`, `new`, `list`, `save`, `delete`, `count`,
   *      `export` and `process`. A name beginning `calculate` matches none of
   *      them.
   *   4. That dispatcher therefore falls through to its own throw at
   *      [org/Hibachi/HibachiService.cfc:L280].
   *
   * TODO [model/entity/Sku.cfc:L258]: this method cannot work until a
   * `calculateSkuPriceBasedOnPromotion` implementation exists on the promotion
   * service. Carried over as a flagged TODO rather than silently completed (B3).
   *
   * ★ THE MISSING METHOD IS NOT INVENTED. No port is injected for [L258] — it is
   * the ONE locator site of the nineteen that is REMOVED rather than replaced. No
   * price is returned, no `undefined` is returned, and nothing is delegated.
   * Behaviour preservation extends to defects: a method that raises at runtime
   * today raises in the target. The return type is `never`, which is the honest
   * type of a body that cannot produce a value, and which remains assignable
   * wherever the legacy `numeric` was expected.
   *
   * @param promotion the promotion whose price is being requested. Retained for
   *   interface parity (B4): the legacy signature declares it, so the port
   *   declares it, even though the body cannot reach it.
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
   *
   * [model/entity/Sku.cfc:L261-L263]. The `getService("priceGroupService")`
   * locator at [L262] becomes the injected resolver. The legacy declares
   * `numeric`, which is `Money` here (E4).
   */
  public getPriceByPriceGroup(priceGroup: PriceGroup): Money {
    if (this.priceGroupResolver === undefined) {
      throw this.missingCollaborator('price-group resolver', 'L262');
    }
    return this.priceGroupResolver.calculateSkuPriceBasedOnPriceGroup(this, priceGroup);
  }

  /**
   * The price-group rate that applies to this sku under a price group.
   *
   * [model/entity/Sku.cfc:L265-L267]. The locator at [L266] becomes the injected
   * resolver. The legacy declares `any`; the service method it calls,
   * `getRateForSkuBasedOnPriceGroup` [model/service/PriceGroupService.cfc:L140],
   * resolves a rate OR NOTHING, so `PriceGroupRate | undefined` is the honest
   * refinement.
   *
   * The two service-tier asymmetries this must not smooth over are documented on
   * {@link SkuPriceGroupResolver}: the parent recursion at
   * [model/service/PriceGroupService.cfc:L174] calls the PRODUCT variant rather
   * than the sku variant, and only the `percentageOff` branch at [L316-L340]
   * applies the rounding rule. Both are enforced in the service tier.
   */
  public getAppliedPriceGroupRateByPriceGroup(priceGroup: PriceGroup): PriceGroupRate | undefined {
    if (this.priceGroupResolver === undefined) {
      throw this.missingCollaborator('price-group resolver', 'L266');
    }
    return this.priceGroupResolver.getRateForSkuBasedOnPriceGroup(this, priceGroup);
  }

  /* -------------------------------------------------------------------------
   * ★★★ THE THREE CURRENCY ACCESSORS
   *     [model/entity/Sku.cfc:L269-L285]
   *
   * ★★★ SUBSTITUTING `0` FOR ANY OF THESE WOULD SILENTLY SELL PRODUCTS FOR FREE.
   *
   * All three return `Money | undefined`. NEVER `0`. NEVER a fallback. NEVER a
   * default. No `??  Money.zero`, no `structGet(..., default)`, no `!`. This is
   * the single highest-consequence parity check in the migration plan, and the
   * reason is arithmetic rather than stylistic: a currency for which no price was
   * resolved must be UNPRICED, and an unpriced sku must not be purchasable at
   * zero.
   *
   * ★ THREE OPPOSITE ABSENCE CONVENTIONS COEXIST IN THIS CODEBASE, ALL THREE
   *   LOAD-BEARING, AND NONE MAY BE COLLAPSED INTO ANOTHER:
   *
   *   1. `Sku.getPriceByCurrencyCode()` -> `Money | undefined`, NEVER `0`.
   *      Absence means UNPRICED. That is this file.
   *   2. `Product.getSalePrice()` -> `0`, NEVER `undefined`.
   *      [model/entity/Product.cfc:L598] reads `getSkus()[1].getSalePrice();`
   *      with NO `return`, so execution falls through to `return 0` — DEFECT 20,
   *      owned by `product.ts`. Absence means ZERO there.
   *   3. Promotion use-limits and period bounds stay `undefined`, NEVER `0` and
   *      never an epoch date, because `undefined` means UNLIMITED / FOREVER —
   *      the PERMISSIVE extreme, the opposite of both of the above.
   *
   * ★ THE SINGLE-VERSUS-DOUBLE CHECK ASYMMETRY IS REPRODUCED, NOT HARMONISED.
   * `getPriceByCurrencyCode` performs ONE `structKeyExists` — on the outer
   * currency key only. The other two perform a SECOND `structKeyExists` on their
   * sub-key. The three are NOT made uniform.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L270 versus L276, L282]: the asymmetry is
   * survivable in practice because Step 3 of the cascade [L425] sets `.price`
   * UNCONDITIONALLY, so a currency present in the map normally has a price. It is
   * not guaranteed: an override row with a null price leaves the sub-key absent
   * and, if the sku's own price is also unresolvable, `.price` stays absent while
   * the outer key exists. In that state `getPriceByCurrencyCode` reads an absent
   * sub-key and yields nothing anyway — which is why the asymmetry has never
   * bitten. IT IS IN THE SOURCE AND IT STAYS.
   * ---------------------------------------------------------------------- */

  /**
   * This sku's price in a given currency, or nothing.
   *
   * [model/entity/Sku.cfc:L269-L273] verbatim:
   *
   *   if(structKeyExists(getCurrencyDetails(), arguments.currencyCode)) {
   *     return getCurrencyDetails()[ arguments.currencyCode ].price;
   *   }
   *
   * NO `else`. NO FALLBACK. ONE check, on the outer key only.
   *
   * `currencyCode` is a plain `string`, deliberately NOT the branded
   * `CurrencyCode`: branding it would route callers through `toCurrencyCode`,
   * which THROWS on a malformed code, and an exception is not the same answer as
   * "this sku has no price in that currency". The yields-nothing contract is
   * preserved for every input.
   *
   * Key comparison is case-insensitive through
   * `src/lib/cfml/struct.ts`'s `structKeyExists`, matching CFML struct semantics.
   */
  public getPriceByCurrencyCode(currencyCode: string): Money | undefined {
    const currencyDetails = this.getCurrencyDetails();
    if (structKeyExists(currencyDetails, currencyCode)) {
      const detail = structGet(currencyDetails, currencyCode);
      // `structKeyExists` has already answered `true`, but the compiler cannot
      // know that from a case-insensitive lookup — so the absent branch is stated
      // rather than asserted away with `!`.
      return detail === undefined ? undefined : detail.price;
    }
    return undefined;
  }

  /**
   * This sku's list price in a given currency, or nothing.
   *
   * [model/entity/Sku.cfc:L275-L279] verbatim:
   *
   *   if(structKeyExists(getCurrencyDetails(), arguments.currencyCode) && structKeyExists(getCurrencyDetails()[ arguments.currencyCode ], "listPrice")) {
   *     return getCurrencyDetails()[ arguments.currencyCode ].listPrice;
   *   }
   *
   * TWO checks: the outer currency key AND the `listPrice` sub-key. It therefore
   * yields nothing EVEN FOR A CURRENCY PRESENT IN THE MAP that has no list price
   * recorded — a state the cascade genuinely produces, because [L381-L382] create
   * the entry unconditionally while a list price is not always written.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L55-L57 vs L390, L405, L421]: it is worth
   * being exact about WHICH entries can reach that state, because the answer
   * differs between the legacy engine and the port and the difference is
   * schema-driven rather than a translation choice. Legacy L390/L405/L421 each
   * guard their write with `isNull(...)`. In the port, the sku's OWN three money
   * columns are non-optional — [L55] `listPrice`, [L56] `price` and [L57]
   * `renewalPrice` all declare `default="0"`, so the column cannot be null and
   * the guard is statically satisfied — while `SwSkuCurrency`'s price columns
   * declare no default and stay `Money | undefined`
   * [model/entity/SkuCurrency.cfc:L53]. The observable consequence: a BASE-currency
   * entry always carries all six sub-keys, so this accessor can only answer
   * `undefined` for (a) a currency absent from the map entirely, or (b) an entry
   * written by Step 2 alone whose `SwSkuCurrency` row recorded a price but no list
   * price — in which case Step 3's guard on `"price"` ALONE [L416] also skips the
   * conversion that would otherwise have supplied one. Both paths are exercised.
   *
   * `structGetPath` is the two-level accessor built for exactly this, and it is
   * handed {@link CurrencyDetailMoneyView} so its return type is precisely
   * `Money | undefined`.
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
   *
   * [model/entity/Sku.cfc:L281-L285] verbatim, with the same double check as
   * {@link Sku.getListPriceByCurrencyCode} — the outer currency key AND the
   * `renewalPrice` sub-key — and with the same two reachable `undefined` paths
   * recorded on that method: an absent currency, or a Step-2-only entry that
   * recorded a price but no renewal price.
   */
  public getRenewalPriceByCurrencyCode(currencyCode: string): Money | undefined {
    return structGetPath<CurrencyDetailMoneyView>(
      this.getCurrencyDetails(),
      currencyCode,
      'renewalPrice',
    );
  }

  /**
   * This sku's base currency code.
   *
   * [model/entity/Sku.cfc:L360-L365] verbatim:
   *
   *   if(!structKeyExists(variables, "currencyCode")) {
   *     variables.currencyCode = this.setting('skuCurrency');
   *   }
   *   return variables.currencyCode;
   *
   * ★ THERE IS NO HARDCODED `"USD"` ANYWHERE IN THIS FILE, AND THERE IS NONE IN
   * `Sku.cfc` EITHER. The default lives in the setting DECLARATION —
   * `skuCurrency = {fieldType="select", defaultValue="USD"}` at
   * [model/service/SettingService.cfc:L221] — and is resolved through the
   * settings port. This is worth stating plainly because the cascade is commonly
   * described as an "order -> SKU -> skuCurrency -> USD-default" chain, which
   * leads readers to expect the literal to be in the entity. Baking it in here
   * would move a configurable default into compiled code (E6).
   *
   * Synchronous, because `SettingsProvider.setting` is synchronous.
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
   * ★★★ MUST-PRESERVE BEHAVIOUR #3 — THE FOUR-STEP CURRENCY CASCADE.
   * [model/entity/Sku.cfc:L367-L433]
   *
   * Returns the memoised per-currency price map. SYNCHRONOUS, because
   * {@link Sku.getPriceByCurrencyCode} and its two siblings are synchronous and
   * that contract is the acceptance criterion.
   *
   * The cascade's own inputs are asynchronous in the target — every
   * `CurrencyConverter` member returns a promise — so the computation itself
   * lives in {@link Sku.materializeCurrencyDetails}, which a repository awaits
   * during hydration. This method only reads the result.
   *
   * ★ AN UN-MATERIALISED SKU ANSWERS `{}`, AND THAT IS A LEGACY BEHAVIOUR RATHER
   * THAN A NEW ONE. [L368-L369] seed the memo to `{}` and [L373] gates everything
   * that would fill it, so the legacy answers `{}` whenever
   * `skuEligibleCurrencies` is empty — and then every accessor yields nothing.
   * The target reaches the identical state when the cascade has not been
   * materialised. No accessor signature changes, and no accessor ever invents a
   * zero to cover the gap.
   */
  public getCurrencyDetails(): Readonly<Record<string, CurrencyDetail>> {
    return this.currencyDetailsMemo ?? {};
  }

  /**
   * Runs the four-step currency cascade and seeds the instance memo.
   *
   * ★ THIS IS THE ASYNC HALF OF [model/entity/Sku.cfc:L367-L433]. It is not a
   * reshaping of any legacy signature: `getCurrencyDetails()` keeps its name,
   * its parameter list and its synchronous return, and this method exists purely
   * because the collaborator it needs is asynchronous in the target. The
   * `CurrencyConverter` port documents the same arrangement from the other side:
   * "the currency-detail map is materialised during entity hydration, before the
   * domain ever sees the SKU".
   *
   * Idempotent: it reproduces the [L368] memo guard, so a second call is a no-op.
   *
   * -------------------------------------------------------------------------
   * ★★★ A FINDING THAT CONTRADICTS THE COMMONLY-CITED DESCRIPTION OF THIS
   *     METHOD: THE GATE DOES NOT WRAP THE WHOLE BODY.
   *
   * The cascade is widely described as "the entire body is wrapped in
   * `if(len(setting('skuEligibleCurrencies')))`". THE SOURCE CONTRADICTS THAT.
   * The gate OPENS at [L373] and CLOSES at [L430], so two statements sit OUTSIDE
   * it:
   *
   *   [L369]  variables.currencyDetails = {};                       <- OUTSIDE
   *   [L371]  var eligibleCurrencySL = getService("currencyService")
   *                                      .getCurrencySmartList();   <- OUTSIDE
   *
   * Only [L375]-[L429] — the `addInFilter` and the whole per-currency loop — are
   * inside. The memo is therefore established, and the currency collaborator
   * consulted, on every first call even when the gate is closed. Reproduced
   * below in that order.
   *
   * ★ AND WHY THE PORT CAN STILL FUSE [L371] WITH [L375]. `getCurrencySmartList()`
   * CONSTRUCTS a smart list; it executes no query. The query runs at [L377],
   * where `getRecords()` is first called — INSIDE the gate. The
   * `CurrencyConverter` port models [L371]+[L375] as the single member
   * `getCurrenciesByCurrencyCodeList(currencyCodeList)`, whose own documentation
   * cites [L371-L375] and records that it applies no active-currency filter —
   * faithful, because the legacy smart list is unfiltered and `addInFilter` on
   * `currencyCode` is its only filter. Placing that fused call inside the gate is
   * therefore observationally identical to the legacy: when the gate is closed,
   * neither implementation queries anything. What the target still performs
   * outside the gate is the collaborator resolution that [L371] performs there.
   * -------------------------------------------------------------------------
   */
  public async materializeCurrencyDetails(): Promise<Readonly<Record<string, CurrencyDetail>>> {
    // [L368] `if(!structKeyExists(variables, "currencyDetails"))` — the memo
    // guard. A second call is a no-op, exactly as in the legacy.
    if (this.currencyDetailsMemo !== undefined) {
      return this.currencyDetailsMemo;
    }

    /**
     * The writable form of {@link CurrencyDetail}, derived rather than
     * re-declared so the two can never drift apart. Function-scoped because it
     * is an implementation detail of this one method.
     */
    type MutableCurrencyDetail = {
      -readonly [K in keyof CurrencyDetail]: CurrencyDetail[K];
    };

    // [L369] OUTSIDE THE GATE — the memo is established first, and it is what
    // the method answers if the gate turns out to be closed.
    const currencyDetails: Record<string, MutableCurrencyDetail> = {};

    // [L371] OUTSIDE THE GATE — the `getService("currencyService")` locator site,
    // eliminated (T2). Resolving the collaborator here rather than inside the
    // gate is what preserves [L371]'s position relative to [L373].
    if (this.settingsProvider === undefined) {
      throw this.missingCollaborator('settings provider', 'L373');
    }
    if (this.currencyConverter === undefined) {
      throw this.missingCollaborator('currency converter', 'L371');
    }
    const settingsProvider = this.settingsProvider;
    const currencyConverter = this.currencyConverter;

    // [L385, L418, L422, L425] all read this setting. Resolved once.
    const skuCurrencySetting = settingsProvider.setting('skuCurrency');
    const eligibleCurrenciesSetting = settingsProvider.setting('skuEligibleCurrencies');

    // ★ STEP 0 — THE ELIGIBILITY GATE [L373]: `if(len(setting('skuEligibleCurrencies')))`.
    //
    // `cfLen` reproduces CFML `len()` exactly. IF THIS SETTING RESOLVES EMPTY THE
    // MEMO STAYS `{}` AND EVERY `getPriceByCurrencyCode()` YIELDS NOTHING. A port
    // that drops the gate changes behaviour. The setting's own default is a
    // runtime-computed active-currency list
    // [model/service/SettingService.cfc:L222], so a normal installation has it
    // populated — but the gate is real and it is reproduced.
    if (cfLen(eligibleCurrenciesSetting) > 0) {
      // [L375] `addInFilter('currencyCode', setting('skuEligibleCurrencies'))`
      // fused with [L377] `getRecords()` — see the note above.
      //
      // LEGACY-NOTE [model/entity/Sku.cfc:L379, L381, L385, L400, L418, L422,
      // L425, L426]: the legacy iterates Currency ENTITIES and reads
      // `getCurrencyCode()` off each one. `Currency` is out of scope, and every
      // one of those lines reads nothing but the code, so the port answers with
      // currency CODES directly. No behaviour depends on any other Currency
      // member.
      const eligibleCurrencies: CurrencyCode[] =
        await currencyConverter.getCurrenciesByCurrencyCodeList(eligibleCurrenciesSetting);

      // The conversion SOURCE currency for Step 3 [L418, L422, L425]. Branded
      // once, outside the loop.
      //
      // LEGACY-NOTE [model/entity/Sku.cfc:L418]: `toCurrencyCode` validates the
      // three-character shape and raises on a malformed value. That is
      // deliberate here and it is NOT the yields-nothing price path: this is the
      // configured base currency of the whole catalogue, so a malformed value is
      // a configuration fault that must surface rather than silently mis-price.
      const baseCurrencyCode = toCurrencyCode(skuCurrencySetting);

      // [L377] `for(var i = 1; i<=arrayLen(eligibleCurrencySL.getRecords()); i++)`
      for (const thisCurrency of eligibleCurrencies) {
        // ★ [L381-L382] — EVERY ELIGIBLE CURRENCY GETS AN ENTRY, UNCONDITIONALLY,
        // BEFORE ANY PRICE IS CONSIDERED, WITH `skuCurrencyID` SEEDED TO `""`:
        //
        //   variables.currencyDetails[ thisCurrency.getCurrencyCode() ] = {};
        //   variables.currencyDetails[ thisCurrency.getCurrencyCode() ].skuCurrencyID = "";
        //
        // So the OUTER map key always exists for every eligible currency even
        // when no price is ever recorded, and only SUB-keys can be absent. That
        // is the whole reason the three accessors at [L269-L285] are asymmetric.
        //
        // NOTHING HERE PRE-SEEDS A PRICE SUB-KEY, with a zero or with
        // `undefined`. Under `exactOptionalPropertyTypes` an absent sub-key and a
        // sub-key holding `undefined` are different types, and [L416] tests
        // `structKeyExists`, so installing `undefined` would SUPPRESS Step 3.
        const detail: MutableCurrencyDetail = { skuCurrencyID: '' };
        currencyDetails[thisCurrency] = detail;

        // ═══ STEP 1 [L385-L397] — THE SKU'S OWN COLUMNS, FOR THE BASE CURRENCY
        //
        // LEGACY-NOTE [model/entity/Sku.cfc:L385]: the legacy comparison is CFML
        // `eq`, which is CASE-INSENSITIVE. `eqeqeq` forbids the loose operators
        // here, so case-insensitivity is implemented EXPLICITLY through
        // `cfEquals` rather than inherited from the operator.
        if (cfEquals(thisCurrency, skuCurrencySetting)) {
          // [L386-L389] `if(!isNull(getRenewalPrice()))`.
          //
          // LEGACY-NOTE [model/entity/Sku.cfc:L386, L390, L417, L421]: these four
          // `isNull` guards are STATICALLY SATISFIED in the target, because
          // [L55-L57] declare `default="0"` on all three money columns so they
          // can never be null. The guards are recorded here and the writes are
          // unconditional — which is precisely the behaviour the defaults
          // produce in the legacy too. Contrast Step 2, whose guards read
          // `SkuCurrency` columns that have NO default and therefore survive as
          // real runtime checks.
          detail.renewalPrice = this.renewalPrice;
          detail.renewalPriceFormatted = Sku.formatCurrency(this.renewalPrice);

          // [L390-L393]
          detail.listPrice = this.listPrice;
          detail.listPriceFormatted = Sku.formatCurrency(this.listPrice);

          // [L394-L395] — `price` is written UNCONDITIONALLY, with no guard of
          // any kind in the legacy source.
          detail.price = this.price;
          detail.priceFormatted = Sku.formatCurrency(this.price);

          // [L396]
          detail.converted = false;
        }

        // ═══ STEP 2 [L399-L414] — PER-CURRENCY OVERRIDE ROWS FROM `SwSkuCurrency`
        //
        // ★ THERE IS NO `break`. The legacy loop runs to completion, so WHEN
        // MULTIPLE `SwSkuCurrency` ROWS SHARE A CURRENCY CODE THE LAST MATCH
        // WINS. Reproduced exactly.
        //
        // LEGACY-DEFECT [model/entity/Sku.cfc:L399-L414]: the absence of a
        // `break` makes the winning override row depend on row order, which no
        // `ORDER BY` fixes.
        // Preserved deliberately; do not fix without a product decision.
        //
        // These values OVERWRITE anything Step 1 wrote.
        for (const skuCurrency of this.skuCurrencies) {
          // LEGACY-NOTE [model/entity/Sku.cfc:L400]: CFML `eq`, case-insensitive
          // — implemented explicitly, as at [L385].
          if (!cfEquals(skuCurrency.getCurrencyCode(), thisCurrency)) {
            continue;
          }

          // [L401-L404] A GENUINE runtime guard: `SkuCurrency.renewalPrice`
          // [model/entity/SkuCurrency.cfc] declares NO default, so it really can
          // be null.
          const overrideRenewalPrice = skuCurrency.getRenewalPrice();
          // LEGACY-NOTE: `isNullish` carries the CFML `isNull()` semantics — null AND
          // undefined both count — but it returns a plain boolean rather than a type
          // predicate, so the `!== undefined` conjunct is what narrows the type for the
          // compiler. Both are stated; neither is redundant.
          if (!isNullish(overrideRenewalPrice) && overrideRenewalPrice !== undefined) {
            detail.renewalPrice = overrideRenewalPrice;
            detail.renewalPriceFormatted = Sku.formatCurrency(overrideRenewalPrice);
          }

          // [L405-L408] Likewise genuine.
          const overrideListPrice = skuCurrency.getListPrice();
          // LEGACY-NOTE: `isNullish` carries the CFML `isNull()` semantics — null AND
          // undefined both count — but it returns a plain boolean rather than a type
          // predicate, so the `!== undefined` conjunct is what narrows the type for the
          // compiler. Both are stated; neither is redundant.
          if (!isNullish(overrideListPrice) && overrideListPrice !== undefined) {
            detail.listPrice = overrideListPrice;
            detail.listPriceFormatted = Sku.formatCurrency(overrideListPrice);
          }

          // [L409-L410] The legacy writes `price` here with NO guard:
          //
          //   variables.currencyDetails[...].price = getSkuCurrencies()[c].getPrice();
          //
          // LEGACY-NOTE [model/entity/Sku.cfc:L409]: CFML CANNOT STORE NULL IN A
          // STRUCT KEY, so when an override row's `price` is null the assignment
          // leaves the sub-key ABSENT rather than storing a null. That is not a
          // detail — it is exactly what allows Step 3's `structKeyExists(entry,
          // "price")` test at [L416] to pass and convert for that currency. The
          // sub-key is therefore written only when the override price is present,
          // which reproduces the legacy outcome precisely.
          const overridePrice = skuCurrency.getPrice();
          // LEGACY-NOTE: `isNullish` carries the CFML `isNull()` semantics — null AND
          // undefined both count — but it returns a plain boolean rather than a type
          // predicate, so the `!== undefined` conjunct is what narrows the type for the
          // compiler. Both are stated; neither is redundant.
          if (!isNullish(overridePrice) && overridePrice !== undefined) {
            detail.price = overridePrice;
            detail.priceFormatted = Sku.formatCurrency(overridePrice);
          }

          // [L411-L412] Both UNCONDITIONAL in the legacy, and both hold non-null
          // values, so both are written even when the override price was null.
          // The consequence is real and is reproduced: such an entry carries
          // `converted = false` and a non-empty `skuCurrencyID`, and then Step 3
          // fires and overwrites `converted` to `true`.
          detail.converted = false;
          detail.skuCurrencyID = skuCurrency.getSkuCurrencyID();
        }

        // ═══ STEP 3 [L416-L428] — ON-THE-FLY CONVERSION
        //
        // ★ THE GUARD IS ON `"price"` ALONE:
        //
        //   if(!structKeyExists(variables.currencyDetails[ ... ], "price")) {
        //
        // LEGACY-DEFECT [model/entity/Sku.cfc:L416]: because the guard tests only
        // `price`, a currency for which Step 1 or Step 2 set a price SKIPS STEP 3
        // ENTIRELY — including its `listPrice` and `renewalPrice` conversions. So
        // a currency with a base or override price but no list price gets NO
        // converted list price either, and `getListPriceByCurrencyCode` yields
        // nothing for it.
        // Preserved deliberately; do not fix without a product decision.
        //
        // Note the mirror image: when Step 3 DOES run it overwrites whatever
        // `listPrice`/`renewalPrice` Step 2 may have set. Also reproduced.
        //
        // The legacy comment at [L415] reads `// Use a conversion mechinism` —
        // the misspelling is preserved here rather than corrected.
        if (!structKeyExists(detail, 'price')) {
          // [L417-L420] `isNull` statically satisfied — see the Step 1 note.
          const convertedRenewalPrice = await currencyConverter.convertCurrency(
            this.renewalPrice,
            baseCurrencyCode,
            thisCurrency,
          );
          detail.renewalPrice = convertedRenewalPrice;
          detail.renewalPriceFormatted = Sku.formatCurrency(convertedRenewalPrice);

          // [L421-L424]
          const convertedListPrice = await currencyConverter.convertCurrency(
            this.listPrice,
            baseCurrencyCode,
            thisCurrency,
          );
          detail.listPrice = convertedListPrice;
          detail.listPriceFormatted = Sku.formatCurrency(convertedListPrice);

          // [L425-L426] UNCONDITIONAL.
          const convertedPrice = await currencyConverter.convertCurrency(
            this.price,
            baseCurrencyCode,
            thisCurrency,
          );
          detail.price = convertedPrice;
          detail.priceFormatted = Sku.formatCurrency(convertedPrice);

          // [L427]
          detail.converted = true;
        }
      }
    }

    // [L369]/[L432] — the memo is seeded whether or not the gate opened, which is
    // what makes a closed gate answer `{}` instead of re-running on every call.
    this.currencyDetailsMemo = currencyDetails;
    return this.currencyDetailsMemo;
  }

  /**
   * The root of this sku's product-type path.
   *
   * [model/entity/Sku.cfc:L356-L358] — `return getProduct().getBaseProductType();`,
   * pure delegation.
   *
   * ASYNC, because `Product.getBaseProductType()` is asynchronous in the target:
   * it is `listFirst(productTypeIDPath)`, the ROOT element of the materialised
   * path, and resolving that path reaches the repository. THE DEPENDENCY MODULE
   * WINS over any description of this method as synchronous — a synchronous
   * signature here would simply not compile against `product.ts`.
   *
   * LEGACY-NOTE [model/validation/Product.json]: `baseProductType` sits on a live
   * validation path — the schema gates it with `inList` over `"merchandise"` and
   * `"subscription"` — so its exact value matters beyond this file.
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
   * This sku's price for the requesting account.
   *
   * [model/entity/Sku.cfc:L435-L440] verbatim:
   *
   *   if(!structKeyExists(variables, "currentAccountPrice")) {
   *     variables.currentAccountPrice = getService("priceGroupService").calculateSkuPriceBasedOnCurrentAccount(sku=this);
   *   }
   *   return variables.currentAccountPrice;
   *
   * ★ T6 — AMBIENT STATE REPLACED BY AN EXPLICIT CONTEXT, WITHOUT WIDENING THE
   * SIGNATURE. The legacy service method reads the requesting account from the
   * request scope, and it does so through the anomalous `getSlatwallScope()`
   * [model/service/PriceGroupService.cfc:L262-L268] while the rest of the
   * codebase uses `getHibachiScope()`. Both are eliminated: the account arrives
   * as a {@link CurrentAccountContext} injected through THE CONSTRUCTOR, and this
   * method still takes NO PARAMETER.
   *
   * That placement is deliberate. Adding a `context` parameter would be a
   * signature widening, and the entity-layer widening budget is ZERO — the
   * project's single widening was spent on `PromotionPeriod.isCurrent`. It would
   * also break `product.ts`, which calls `defaultSku.getCurrentAccountPrice()`
   * with no arguments. Constructor injection satisfies T6 in full — there is no
   * ambient read anywhere in the call chain — at no budget cost.
   *
   * `src/lib/config.ts` is static process configuration and is NEVER used as a
   * request scope.
   *
   * ASYNC because the price-group path reaches the account subscription
   * price-group query [model/dao/PriceGroupDAO.cfc:L52-L100]. That is a genuine
   * port reach, so async is correct.
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
   * `true` when this sku is its product's default sku.
   *
   * [model/entity/Sku.cfc:L442-L447] verbatim:
   *
   *   if(getProduct().getDefaultSku().getSkuID() == getSkuID()) { return true; }
   *   return false;
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L443]: CFML `==` on strings is
   * CASE-INSENSITIVE, so the comparison goes through `cfEquals` rather than
   * `===`. Two chained dereferences are unguarded in the legacy and raise when
   * either is absent; that is reproduced rather than softened into `false`,
   * because a sku whose product has no default sku is a data fault and answering
   * `false` would hide it.
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
   * The lowest of this sku's three candidate prices.
   *
   * [model/entity/Sku.cfc:L482-L498] verbatim:
   *
   *   var prices = [getPrice()];
   *   arrayAppend(prices, getSalePrice());
   *   arrayAppend(prices, getCurrentAccountPrice());
   *   arraySort(prices, "numeric", "asc");
   *   variables.livePrice = prices[1];
   *
   * The three candidates and their order are preserved. `prices[1]` after an
   * ascending sort is the MINIMUM, so the port takes the minimum directly rather
   * than sorting a three-element array and indexing it.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L492]: `arraySort(prices, "numeric", "asc")`
   * is a FLOATING-POINT comparison of currency values. The target compares
   * through `Money.compare`, which is exact decimal comparison. Selecting the
   * minimum of three values is order-insensitive, so the answer is identical
   * except where two candidates differ only below float precision — a case in
   * which the legacy result was arbitrary anyway. No float arithmetic touches
   * currency in this port (E4).
   *
   * ASYNC because `getCurrentAccountPrice()` is.
   */
  public async getLivePrice(): Promise<Money> {
    if (this.livePriceMemo === undefined) {
      // [L485] the array is seeded with the base price, then [L488] the sale
      // price and [L489] the current-account price are appended, in that order.
      const candidates: Money[] = [this.getPrice(), this.getSalePrice()];
      candidates.push(await this.getCurrentAccountPrice());

      // [L492]-[L495] ascending sort then `[1]` — i.e. the minimum.
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

  // =========================================================================
  // NON-PERSISTENT PROPERTY METHODS — SALE PRICE
  // [model/entity/Sku.cfc:L539-L565]
  // =========================================================================

  /**
   * The winning sale-price detail row for this sku, or nothing.
   *
   * [model/entity/Sku.cfc:L539-L544] verbatim:
   *
   *   if(!structKeyExists(variables, "salePriceDetails")) {
   *     variables.salePriceDetails = getProduct().getSkuSalePriceDetails( getSkuID() );
   *   }
   *   return variables.salePriceDetails;
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L541]: the legacy delegates to the product,
   * whose ported `getSkuSalePriceDetails` is ASYNCHRONOUS — it is backed by the
   * common-table-expression rewrite of the query-of-queries chain at
   * [model/dao/PromotionDAO.cfc:L544-L588]. Making this accessor async would
   * cascade onto `getSalePrice()`, `getSalePriceDiscountType()` and
   * `getSalePriceExpirationDateTime()`, whose synchronous contracts `product.ts`
   * depends on. The detail row is therefore pre-materialised during hydration and
   * read synchronously here — the same technique, and the same justification, as
   * the currency cascade.
   *
   * `undefined` where the legacy answers an empty struct: the three readers below
   * both test for their key before reading it, so absence and an empty struct are
   * indistinguishable to every caller.
   */
  public getSalePriceDetails(): SkuSalePriceDetails {
    return this.salePriceDetail;
  }

  /**
   * This sku's sale price, falling back to its base price.
   *
   * [model/entity/Sku.cfc:L546-L551] verbatim:
   *
   *   if(structKeyExists(getSalePriceDetails(), "salePrice")) {
   *     return getSalePriceDetails()[ "salePrice"];
   *   }
   *   return getPrice();
   *
   * ★ NOTE THE CONTRAST WITH THE CURRENCY ACCESSORS. Here a fallback IS correct —
   * the legacy declares it explicitly at [L550] — whereas
   * `getPriceByCurrencyCode` has no fallback at all. The two conventions sit
   * fifty lines apart in the same component and mean opposite things. Neither is
   * copied onto the other.
   *
   * `Money`, never `undefined`, because `getPrice()` is `default="0"` and
   * therefore always present.
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
   *
   * [model/entity/Sku.cfc:L553-L558]. `''` on absence, exactly as [L557] returns
   * it — NOT `undefined`, because callers concatenate and compare this value as a
   * string.
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
   * [model/entity/Sku.cfc:L560-L565]. The union `Date | ''` is faithful: [L562]
   * returns a timestamp and [L564] returns an empty string, and CFML's `any`
   * return type permitted both. Collapsing it to `Date | undefined` would change
   * what a caller sees.
   *
   * UTC, per the file-level policy.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L614-L622]: the corresponding product
   * accessor is spelled `getSalePricExpirationDateTime` — missing the `e` in
   * "Price". That typo is on `product.ts`'s surface, not this one; it is recorded
   * here so the difference in spelling between the two is understood to be
   * legacy rather than a porting error.
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
   * LEGACY-DEFECT [model/entity/Sku.cfc:L569]: the body reaches
   * `skuService.getSkuStocksDeletableFlag`, which is NOT among the seven members
   * of the SKU repository port — `getTransactionExistsFlag`
   * [model/dao/SkuDAO.cfc:L53], `getSkuBySkuCode` [L102],
   * `getSkusBySelectedOptions` [L107], `searchSkusByProductType` [L130],
   * `getProductSkus` [L150], `getSortedProductSkusID` [L172] and `saveSku`. The
   * call therefore cannot resolve.
   * Preserved deliberately; do not fix without a product decision.
   *
   * The legacy body verbatim:
   *
   *   if(!structKeyExists(variables, "stocksDeletableFlag")) {
   *     variables.stocksDeletableFlag = getService("skuService").getSkuStocksDeletableFlag( skuID=this.getSkuID() );
   *   }
   *   return variables.stocksDeletableFlag;
   *
   * TODO [model/entity/Sku.cfc:L569]: this method cannot work until a
   * stocks-deletable query exists on the SKU repository port. Flagged rather than
   * completed (B3).
   *
   * ★ NO MEMBER IS ADDED TO THE PORT AND NO IMPLEMENTATION IS INVENTED. Returning
   * a hardcoded `true` would authorise deleting stock records that may be
   * referenced; returning a hardcoded `false` would silently block a legitimate
   * delete. Both are worse than an explicit refusal, so this follows the DEFECT
   * 16 precedent: a throwing stub that names exactly what is missing. The `never`
   * return type is the honest type of a body that cannot produce a value, and it
   * remains assignable wherever the legacy `boolean` was expected.
   *
   * The stocks subsystem is out of scope in any case, so nothing in the ported
   * slice calls this.
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
   *
   * [model/entity/Sku.cfc:L574-L590] verbatim:
   *
   *   if(!structKeyExists(variables, "skuDefinition")) {
   *     variables.skuDefinition = "";
   *     if(getBaseProductType() eq "contentAccess") {
   *
   *     } else if (getBaseProductType() eq "merchandise") {
   *       for(var option in getOptions()) {
   *         variables.skuDefinition = listAppend(variables.skuDefinition, " #option.getOptionGroup().getOptionGroupName()#: #option.getOptionName()#", ",");
   *       }
   *       trim(variables.skuDefinition);
   *     } else if (getBaseProductType() eq "subscription") {
   *       variables.skuDefinition = "#rbKey('entity.subscriptionTerm')#: #getSubscriptionTerm().getSubscriptionTermName()#";
   *     }
   *   }
   *   return variables.skuDefinition;
   *
   * ★★★ LEGACY-DEFECT [model/entity/Sku.cfc:L583]: `trim(variables.skuDefinition);`
   * IS A BARE STATEMENT WHOSE RETURN VALUE IS DISCARDED. `trim` in CFML is a pure
   * function — it returns the trimmed string and mutates nothing — so the leading
   * space that [L581] deliberately prepends to every element IS NEVER REMOVED.
   * Every merchandise sku definition therefore begins with a space, and each
   * comma-separated element after the first begins with one too.
   * Preserved deliberately; do not fix without a product decision.
   *
   * ★ THE LEADING SPACE IS PRESERVED. `.trim()` is NOT called here, and
   * `src/lib/cfml/list.ts` is not allowed to compensate for it either —
   * `listAppend` is pure and passes the element through verbatim, which is what
   * makes the faithful reproduction possible. This defect is explicitly owned by
   * this file.
   *
   * ★ THE `contentAccess` BRANCH IS GENUINELY EMPTY IN THE SOURCE [L577-L578].
   * It is not an omission by this port: the legacy body has no statements, so the
   * definition stays `""` for a content-access sku.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L584-L585]: the `subscription` branch reads
   * `getSubscriptionTerm().getSubscriptionTermName()` and a JavaRB resource key
   * `rbKey('entity.subscriptionTerm')`. `SubscriptionTerm` is an out-of-scope
   * entity — collapsed here to `subscriptionTermID` — and JavaRB is not ported, so
   * the branch cannot be reproduced. It is REFUSED rather than faked: returning
   * `''` or a placeholder for a subscription sku would be a wrong answer
   * presented as a right one, and every other out-of-scope collapse in this file
   * refuses in the same way.
   *
   * ASYNC because `getBaseProductType()` is.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L577, L579, L584]: the three comparisons are
   * CFML `eq`, CASE-INSENSITIVE, so they go through `cfEquals` rather than `===`.
   * `getBaseProductType()` can answer nothing, in which case no branch matches
   * and the definition stays `""` — which is also what CFML does, since `eq`
   * against a null left operand there compares against the empty string.
   */
  public async getSkuDefinition(): Promise<string> {
    if (this.skuDefinitionMemo === undefined) {
      // [L576] seeded to `""`, and it stays `""` when no branch matches.
      let skuDefinition = '';
      const baseProductType = await this.getBaseProductType();

      if (baseProductType !== undefined && cfEquals(baseProductType, 'contentAccess')) {
        // [L577-L578] — the branch is EMPTY in the source. Nothing to do, and
        // nothing invented.
        skuDefinition = '';
      } else if (baseProductType !== undefined && cfEquals(baseProductType, 'merchandise')) {
        for (const option of this.options) {
          const optionGroup = Sku.requireOptionGroup(option, 'L581');
          const optionGroupName = optionGroup.getOptionGroupName() ?? '';
          const optionName = option.getOptionName() ?? '';
          // [L581] — the element begins with a SPACE, deliberately, and the
          // delimiter is a comma. Both are reproduced character for character.
          skuDefinition = listAppend(skuDefinition, ` ${optionGroupName}: ${optionName}`, ',');
        }
        // [L583] `trim(variables.skuDefinition);` — the discarded result. The
        // statement is intentionally NOT written here, because writing
        // `skuDefinition.trim()` without assigning it would be dead code that a
        // linter removes, and writing `skuDefinition = skuDefinition.trim()`
        // would FIX the defect. The absence is the port; this comment is the
        // record of it.
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
   *
   * [model/entity/Sku.cfc:L592-L597] verbatim. The `getService("skuService")`
   * locator at [L594] becomes the injected repository, and unlike [L569] the
   * member GENUINELY EXISTS on the port — `getTransactionExistsFlag`, backed by
   * [model/dao/SkuDAO.cfc:L53].
   *
   * ASYNC, because the repository member is. The legacy passes `skuID` only, so
   * the `productID` parameter of the port member is left unsupplied.
   */
  public async getTransactionExistsFlag(): Promise<boolean> {
    if (this.transactionExistsFlagMemo === undefined) {
      if (this.skuRepository === undefined) {
        throw this.missingCollaborator('sku repository', 'L594');
      }
      // [L594] `getTransactionExistsFlag( skuID=this.getSkuID() )` — named
      // argument, so `productID` is genuinely absent rather than empty.
      this.transactionExistsFlagMemo = await this.skuRepository.getTransactionExistsFlag(
        undefined,
        this.skuID,
      );
    }
    return this.transactionExistsFlagMemo;
  }

  // =========================================================================
  // IMAGE METHODS — REFUSED, NOT IMPLEMENTED
  // [model/entity/Sku.cfc:L128-L229], under the SHORT-FORM banner pair
  // [L128]/[L229]
  //
  // ★ WHY FOUR OF THESE EXIST AT ALL, WHEN THE IMAGE SUBSYSTEM IS OUT OF SCOPE.
  // `product.ts` — an already-shipped sibling — calls exactly four of them on its
  // default sku: `getImagePath()`, `getImage(options)`, `getResizedImagePath(options)`
  // and `getImageExistsFlag()`. Omitting them outright would break that module's
  // compilation, and module-level correctness is not optional. They are therefore
  // present as EXPLICIT REFUSALS: the signature exists so the module compiles, and
  // the body states precisely why the behaviour cannot be ported.
  //
  // ★ WHY THE BEHAVIOUR CANNOT BE PORTED, CONCRETELY. The image path is built
  // from `productImageDefaultExtension` and `productImageOptionCodeDelimiter`
  // [model/service/SettingService.cfc:L191-L192] and from
  // `globalAssetsImageFolderPath`. THE SETTINGS PORT PUBLISHES ONLY FOUR KEYS —
  // `globalURLKeyProduct`, `globalURLKeyProductType`, `skuCurrency` and
  // `skuEligibleCurrencies` — so NONE of the image settings is reachable. The
  // resize methods additionally reach `imageService` at [L189] and [L218], an
  // out-of-scope collaborator with no port. This is the identical reasoning that
  // omitted `Option.getImageDirectory()` [model/entity/Option.cfc:L81-L83].
  //
  // `never` is assignable to `string` and to `boolean`, so each refusal satisfies
  // its caller's expected type without an assertion, without `any`, and without
  // returning a fabricated path that a browser would then request.
  // =========================================================================

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L145-L147]: `getImagePath()` composes
   * `globalAssetsImageFolderPath` with the generated image file name. Refused
   * because the settings port publishes no image keys.
   */
  public getImagePath(): never {
    throw Sku.imageSubsystemRefusal('getImagePath', 'L145');
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L149-L151]: `getImage()` renders an `<img>`
   * element through `HibachiAssets`, which is framework code that is not ported.
   *
   * @param options the resize arguments `Product` forwards. Retained for
   *   signature parity; the body cannot reach them.
   */
  public getImage(options?: SkuImageResizeOptions): never {
    throw Sku.imageSubsystemRefusal(`getImage(${options?.size ?? ''})`, 'L149');
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L192-L219]: `getResizedImagePath()` reaches
   * `imageService` at [L218] — one of the nineteen locator sites — to resize on
   * demand. Refused: `imageService` has no port and the image subsystem is out of
   * scope.
   */
  public getResizedImagePath(options?: SkuImageResizeOptions): never {
    throw Sku.imageSubsystemRefusal(`getResizedImagePath(${options?.size ?? ''})`, 'L218');
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L221-L227]: `getImageExistsFlag()` performs a
   * filesystem existence check against the composed image path. Refused for the
   * same reason as {@link Sku.getImagePath}.
   */
  public getImageExistsFlag(): never {
    throw Sku.imageSubsystemRefusal('getImageExistsFlag', 'L221');
  }

  /** Builds the single, consistent refusal used by all four image members. */
  private static imageSubsystemRefusal(member: string, locator: string): Error {
    return new Error(
      `Sku.${member} is not ported: [model/entity/Sku.cfc:${locator}] belongs to the ` +
        `out-of-scope image subsystem. It reads productImageDefaultExtension, ` +
        `productImageOptionCodeDelimiter and globalAssetsImageFolderPath, none of which is ` +
        `among the four keys the SettingsProvider port publishes, and the resize path ` +
        `additionally reaches the un-ported imageService. The signature exists only so ` +
        `product.ts compiles; no path is fabricated.`,
    );
  }

  // =========================================================================
  // CUSTOM VALIDATION METHODS
  // [model/entity/Sku.cfc:L753-L784], under the LONG-FORM banner at [L753]
  //
  // ★ BOTH OF THESE ARE INVOKED DECLARATIVELY, AND THAT MAKES THEM LIVE.
  // `model/validation/Sku.json` names them, verbatim:
  //
  //   "options": [
  //     {"contexts":"save","method":"hasUniqueOptions"},
  //     {"contexts":"save","method":"hasOneOptionPerOptionGroup"}
  //   ],
  //
  // The framework reaches them through Branch 2 of the eleven-pattern dispatcher
  // — the `hasUnique<Prop>` branch at [org/Hibachi/HibachiEntity.cfc:L514]. An
  // exhaustive `"method":"…"` census across all FIFTEEN in-scope validation
  // schemas found exactly FIVE declaratively-invoked entity methods, and TWO OF
  // THE FIVE ARE THESE.
  //
  // ★ TWO FURTHER `Sku.json` RULES REACH MEMBERS OF THIS CLASS, and both are
  // delete-context rather than save-context:
  //
  //   "defaultFlag":            [{"contexts":"delete","eq":false}]
  //   "transactionExistsFlag":  [{"contexts":"delete","eq":false}]
  //
  // They read {@link Sku.getDefaultFlag} and {@link Sku.getTransactionExistsFlag}
  // — a sku may not be deleted while it is its product's default or while a
  // transaction references it. Both members are authored; the rules themselves are
  // composed and run at the service tier.
  //
  // The remaining `Sku.json` rules are plain property constraints —
  // `price` `{"required":true,"dataType":"numeric","minValue":0}`,
  // `listPrice` and `renewalPrice` `{"dataType":"numeric","minValue":0}`, and
  // `skuCode` `{"required":true,"unique":true}`. `minValue: 0` on all three money
  // columns is worth noting alongside their `default="0"`: the schema and the ORM
  // agree that zero is a legitimate stored price, which is exactly why a zero
  // MUST NOT be invented for an unpriced currency — the two states would become
  // indistinguishable.
  //
  // ★ SCHEMA ENFORCEMENT LIVES AT THE SERVICE TIER. This file carries the
  // property metadata and these two methods and nothing else: no `zod` import, no
  // schema declaration, no validation runner. The service tier composes the
  // schema and calls these methods; the entity only answers them.
  // =========================================================================

  /**
   * Validates that no other sku already has this exact option combination.
   *
   * [model/entity/Sku.cfc:L755-L769] verbatim, including the `@hint`:
   *
   *   // @hint this method validates that this skus has a unique option combination that no other sku has
   *   public any function hasUniqueOptions() {
   *     var optionsList = "";
   *     for(var i=1; i<=arrayLen(getOptions()); i++){
   *       optionsList = listAppend(optionsList, getOptions()[i].getOptionID());
   *     }
   *     var skus = getProduct().getSkusBySelectedOptions(selectedOptions=optionsList);
   *     if(!arrayLen(skus) || (arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID() )) {
   *       return true;
   *     }
   *     return false;
   *   }
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L514].
   *
   * ★ ASYNC, NECESSARILY. `getProduct().getSkusBySelectedOptions(...)` reaches the
   * AND-of-EXISTS SQL at [model/dao/SkuDAO.cfc:L107-L128] — MUST-PRESERVE
   * BEHAVIOUR — so the ported product method is asynchronous and so is this one.
   * The legacy declares `any`; `boolean` is the honest return.
   *
   * `listAppend` is PURE and emits NO LEADING DELIMITER on an empty list, which is
   * what lets the accumulator start at `''` — load-bearing at [L760].
   *
   * THE COMPOUND CONDITION AT [L764] IS REPRODUCED EXACTLY: `true` when the
   * result array is EMPTY, OR when it holds EXACTLY ONE sku whose `skuID` equals
   * this sku's; `false` in every other case. In particular a result of two skus,
   * one of which is this one, answers `false`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L764]: `skus[1].getSkuID() == getSkuID()`
   * uses CFML `==`, CASE-INSENSITIVE, so the comparison goes through `cfEquals`.
   */
  public async hasUniqueOptions(): Promise<boolean> {
    // [L757-L761]
    let optionsList = '';
    for (const option of this.options) {
      optionsList = listAppend(optionsList, option.getOptionID());
    }

    // [L763]
    if (this.product === undefined) {
      throw new Error(
        `Sku '${this.skuID}': hasUniqueOptions requires the owning product, which ` +
          `[model/entity/Sku.cfc:L763] dereferences unconditionally.`,
      );
    }
    const skus: Sku[] = await this.product.getSkusBySelectedOptions(optionsList);

    // [L764-L768] — the compound condition, character for character.
    const onlySku = skus.length === 1 ? skus[0] : undefined;
    if (skus.length === 0 || (onlySku !== undefined && cfEquals(onlySku.getSkuID(), this.skuID))) {
      return true;
    }
    return false;
  }

  /**
   * Validates that this sku has at most one option per option group.
   *
   * [model/entity/Sku.cfc:L771-L784] verbatim, including the `@hint`:
   *
   *   // @hint this method validates that this skus has a unique option combination that no other sku has
   *   public any function hasOneOptionPerOptionGroup() {
   *     var optionGroupList = "";
   *     for(var i=1; i<=arrayLen(getOptions()); i++){
   *       if(listFind(optionGroupList, getOptions()[i].getOptionGroup().getOptionGroupID())) {
   *         return false;
   *       } else {
   *         optionGroupList = listAppend(optionGroupList, getOptions()[i].getOptionGroup().getOptionGroupID());
   *       }
   *     }
   *     return true;
   *   }
   *
   * LEGACY-DEFECT [model/entity/Sku.cfc:L771]: the `@hint` on this method is a
   * VERBATIM COPY of the one at [L755] — "this method validates that this skus has
   * a unique option combination that no other sku has" — but this method tests
   * something entirely different: one option per option group, not uniqueness
   * across skus. Both hints are preserved verbatim above.
   * Preserved deliberately; do not fix without a product decision.
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L514]. SYNCHRONOUS — the body
   * reaches nothing but the materialised option collection. The legacy declares
   * `any`; `boolean` is the honest return.
   *
   * Returns `false` on the FIRST duplicate option group and `true` after the loop
   * completes, so an empty option collection answers `true`.
   *
   * ★ THE `listFind` GAP, RESOLVED WITHOUT TOUCHING A SIBLING MODULE. [L776] calls
   * the CASE-SENSITIVE `listFind`. `src/lib/cfml/list.ts` exports exactly five
   * members and `listFind` is not one of them; `listFindNoCase` is. Substituting
   * it would silently change case sensitivity ON A LIVE VALIDATION PATH, and
   * adding a member to that module is not this file's to do. The case-sensitive
   * test is therefore implemented locally — see
   * {@link Sku.listFindCaseSensitive} — over `listToArray` with an exact `===`.
   * Case sensitivity is preserved deliberately.
   *
   * ★ AND THE TRUTHINESS HAZARD IS DESIGNED OUT. `if(listFind(...))` relies on
   * CFML truthiness of a 1-BASED index where `0` means "not found". A ported
   * caller must never write `if (listFindNoCase(...))`, and must never compare a
   * `findIndex` result with `> 0`. The local helper returns a `boolean`, so the
   * hazard cannot reach this call site at all.
   */
  public hasOneOptionPerOptionGroup(): boolean {
    let optionGroupList = '';
    for (const option of this.options) {
      const optionGroup = Sku.requireOptionGroup(option, 'L776');
      const optionGroupID = optionGroup.getOptionGroupID();
      // [L776] the CASE-SENSITIVE `listFind`, reproduced locally.
      if (Sku.listFindCaseSensitive(optionGroupList, optionGroupID)) {
        return false;
      }
      // [L779] `listAppend` — pure, no leading delimiter on an empty list.
      optionGroupList = listAppend(optionGroupList, optionGroupID);
    }
    return true;
  }

  // =========================================================================
  // DEPRECATED METHODS
  // [model/entity/Sku.cfc:L882-L912]
  //
  // ★ A SECTION THAT IS POPULATED, WHICH IS UNUSUAL IN THIS FOLDER. A
  // `START: Deprecated Methods` / `END: Deprecated Methods` banner pair has been
  // seen once before — [model/entity/PromotionCode.cfc:L189]/[L191] — and it was
  // EMPTY there. `Sku`'s pair is POPULATED, with FOUR methods. All four are
  // ported, because deprecated is not the same as absent and interface parity is
  // the acceptance contract (B4).
  //
  // Every `@hint` is preserved VERBATIM, including the shouty `NEVER USE`. The
  // lint configuration deliberately enables no `no-warning-comments` rule, so
  // deprecation hints and TODOs are legal by design rather than by oversight.
  // =========================================================================

  /**
   * // @hint: USE skuDefinition()
   *
   * [model/entity/Sku.cfc:L884-L891] verbatim, `delimiter=" "` default preserved.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L885 versus L233]: this deprecated method
   * and the NON-deprecated `getOptionsDisplay()` [L233-L239] have IDENTICAL
   * bodies — the local variable is even spelled the same, `dspOptions`. One
   * carries a deprecation hint and the other does not. Both are on the public
   * surface, so both are ported; the duplication is recorded rather than resolved.
   *
   * Uses the THREE-ARGUMENT `listAppend(list, value, delimiter)`, which
   * `src/lib/cfml/list.ts` does declare, so the custom delimiter needs no local
   * substitute. Its no-leading-delimiter-on-an-empty-list behaviour is
   * load-bearing at [L888], exactly as at [L528], [L760] and [L779]. The `''`
   * substitution for an absent option name is the same decision, for the same
   * reason, as {@link Sku.getOptionsDisplay}.
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
   * [model/entity/Sku.cfc:L893-L896] — `return getOptionsByOptionGroupIDStruct();`,
   * PURE DELEGATION with no body of its own.
   *
   * ★★★ THIS METHOD IS THE PROOF THAT DEFECT 18 HAS NO COLLISION. The concern
   * about fixing [L517] is that something might read the stray write target
   * `variables.OptionsByGroupIDStruct`, whose name resembles this method's. It
   * does not: this body delegates to `getOptionsByOptionGroupIDStruct()` and never
   * touches `variables` at all. So the stray target is written by [L517] and read
   * by NOTHING anywhere in the 916-line component — a pure dead write — which is
   * why repairing it cannot disturb any other member. See
   * {@link Sku.getOptionsByOptionGroupIDStruct}.
   */
  public getOptionsByGroupIDStruct(): Record<string, Option> {
    return this.getOptionsByOptionGroupIDStruct();
  }

  /**
   * // @hint: NEVER USE
   *
   * [model/entity/Sku.cfc:L898-L905] verbatim.
   *
   * ★ NOTE WHAT IT IS KEYED AND VALUED BY, BECAUSE BOTH ARE COUNTER-INTUITIVE.
   * [L902] keys by the option group's NAME — `getOptionGroupName()`, not its code
   * and not its ID — and the VALUE is the option's ID, `getOptionID()`, not the
   * option entity and not the option's name:
   *
   *   options[getOptions()[i].getOptionGroup().getOptionGroupName()] = getOptions()[i].getOptionID();
   *
   * That name/ID crossing is very likely why the hint says NEVER USE. It is
   * reproduced exactly, and the hint is preserved verbatim.
   *
   * Unlike the two struct accessors above there is NO existence guard, so with
   * two options in the same option group THE LAST ONE WINS here — the opposite of
   * [L504] and [L516], where the first wins. Reproduced.
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
      // No existence guard in the legacy — the last option per group name wins.
      options[optionGroupName] = option.getOptionID();
    }
    return options;
  }

  /**
   * // @hint: USE getDefaultFlag()
   *
   * [model/entity/Sku.cfc:L907-L910] — `return !getDefaultFlag();`. The legacy
   * declares `boolean`, which is honest here.
   */
  public isNotDefaultSku(): boolean {
    return !this.getDefaultFlag();
  }
}

// ---------------------------------------------------------------------------
// THE OMISSION LEDGER
//
// Every member of `model/entity/Sku.cfc` that this port deliberately does NOT
// author, with the reason. Nothing below is stubbed with fake behaviour, and
// nothing below is deleted from the legacy tree — "OMIT" means "do not author
// this member in the new TypeScript file, and annotate why". The CFML monolith
// keeps running unchanged.
//
// ── IMAGE / ASSET SUBSYSTEM ────────────────────────────────────────────────
// LEGACY-NOTE [model/entity/Sku.cfc:L131-L139]: `generateImageFileName()` composes
//   a file name from the product code, the option-code delimiter setting and the
//   default extension setting. OMITTED: `productImageOptionCodeDelimiter`
//   [model/service/SettingService.cfc:L192] and `productImageDefaultExtension`
//   [L191] are not among the four keys the SettingsProvider port publishes.
// LEGACY-NOTE [model/entity/Sku.cfc:L141-L143]: `getImageExtension()` reads
//   `productImageDefaultExtension`. OMITTED for the same reason.
// LEGACY-NOTE [model/entity/Sku.cfc:L153-L190]: `getResizedImage()` reaches
//   `imageService` at [L189] — locator site 1 of 19. OMITTED: no port, image
//   subsystem out of scope. Nothing in the ported slice calls it.
// LEGACY-NOTE [model/entity/Sku.cfc:L794-L799]: `getImageName()` memoises
//   `generateImageFileName()`. OMITTED transitively. It sits under the POPULATED
//   `START: Overridden Implicit Getters` banner pair [L792]/[L801] and is that
//   section's only member.
//   (`getImagePath`, `getImage`, `getResizedImagePath` and `getImageExistsFlag`
//   are NOT omitted — `product.ts` calls them, so they exist as explicit
//   refusals. See the image section of the class.)
//
// ── STOCK / INVENTORY / LOCATION SUBSYSTEM ─────────────────────────────────
// LEGACY-NOTE [model/entity/Sku.cfc:L291-L322]: `getQuantity(quantityType,
//   locationID, stockID)` — about 32 lines carrying FOUR of the nineteen locator
//   sites, at [L295] `locationService`, [L296] and [L300] `stockService` and
//   [L310] `inventoryService`. OMITTED: three out-of-scope collaborators, none
//   with a port.
// LEGACY-NOTE [model/entity/Sku.cfc:L535-L537]: `getQATS()` is
//   `getQuantity("QATS")`. OMITTED transitively. The persisted
//   `calculatedQATS` column [L62] is preserved and readable (B5); only the
//   recomputation is omitted.
// LEGACY-NOTE [model/entity/Sku.cfc:L459-L480]: `getNextEstimatedAvailableDate()`
//   calls `getQuantity("QIATS")`, `getQuantity("QNC")`,
//   `getProduct().getEstimatedReceivalDates(...)` and the `globalDateFormat`
//   setting. OMITTED: stock subsystem, plus a setting the port does not publish.
//   (Its own [L474] `quantityNeeded - dates[i].quantity;` is a discarded-result
//   statement of the same family as [L583] — recorded, and moot here.)
//
// ── FULFILMENT SUBSYSTEM ───────────────────────────────────────────────────
// LEGACY-NOTE [model/entity/Sku.cfc:L449-L457]: `getEligibleFulfillmentMethods()`
//   reaches `fulfillmentService` at [L451] — locator site 16 of 19 — and reads
//   `skuEligibleFulfillmentMethods` [L452], a setting the port does not publish.
//   OMITTED on both counts.
//
// ── SUBSCRIPTION SUBSYSTEM ─────────────────────────────────────────────────
// LEGACY-NOTE [model/entity/Sku.cfc:L622-L637]: `setSubscriptionTerm` and
//   `removeSubscriptionTerm` wire an out-of-scope `SubscriptionTerm`. DROPPED;
//   the column survives as `subscriptionTermID`. The
//   `subscriptionTermProvider` port is a STUB used only by out-of-scope branches
//   and is NOT injected into this entity.
// LEGACY-NOTE [model/entity/Sku.cfc:L724-L741]: `addSubscriptionBenefit` /
//   `removeSubscriptionBenefit`, and [L640-L645] `addAlternateSkuCode` /
//   `removeAlternateSkuCode`, and [L664-L669] `addStock` / `removeStock`, and
//   [L704-L721] `addAccessContent` / `removeAccessContent`, and [L744-L749]
//   `addPhysical` / `removePhysical`. All DROPPED: out-of-scope far sides. See the
//   inversion verdict table for their CLEAN verdicts.
//
// ── ORDER AGGREGATE ────────────────────────────────────────────────────────
// LEGACY-NOTE [model/entity/Sku.cfc:L71]: `orderItems` declares explicit
//   `lazy="extra"` and targets the OUT-OF-SCOPE order aggregate. NOT
//   MATERIALISED, and `addOrderItem`/`removeOrderItem`/`hasOrderItem` are
//   DROPPED, following the `PriceGroup.appliedOrderItems` precedent. The order
//   aggregate is an INPUT to the in-scope services through read-only views, never
//   a dependency of them — that inversion is what makes the slice independently
//   deployable.
// LEGACY-NOTE [model/entity/Sku.cfc:L327-L334]: `getAssignedOrderItemAttributeSetSmartList()`
//   reaches `attributeService` at [L330] — THE LOCATOR SITE THAT
//   EIGHTEEN-ITEM ENUMERATIONS OMIT — and builds a smart list over the order-item
//   attribute sets. OMITTED twice over: order aggregate and EAV.
//
// ── THE EAV / ATTRIBUTE PATH ───────────────────────────────────────────────
// LEGACY-NOTE [model/entity/Sku.cfc:L70]: `attributeValues` (`type="array"`,
//   `cfc="AttributeValue"`, `cascade="all-delete-orphan"`, `inverse="true"`) is one
//   of exactly FOUR such declarations across the eighteen in-scope entities — the
//   others being [model/entity/Product.cfc:L75], [model/entity/ProductType.cfc:L67]
//   and [model/entity/Brand.cfc:L60]. NOT MATERIALISED, NO 19th ENTITY FILE
//   CREATED, and the EAV READ PATH IS NOT PORTED. `addAttributeValue` [L648] and
//   `removeAttributeValue` [L651] are DROPPED, following the precedent that
//   dropped `Brand.addAttributeValue` [model/entity/Brand.cfc:L90] and
//   `removeAttributeValue` [L93]. The unhonoured `cascade="all-delete-orphan"`
//   obligation is recorded in the repositories sibling, not here.
//
//   The attribute subsystem is reached in exactly TWO ways across the slice: this
//   non-ported EAV path, and `ProductDAO.getAttributeSets`
//   [model/dao/ProductDAO.cfc:L52], which IS ported. Only the second survives.
//
// LEGACY-NOTE [model/entity/Sku.cfc:L813-L840]: `getAssignedAttributeSetSmartList()`
//   is an override reaching `attributeService` at [L816] — locator site 19 of 19 —
//   and builds a `HibachiSmartList` with four `joinRelatedProperty` calls and a
//   hand-concatenated where clause over `productTypeIDPath`. OMITTED, matching the
//   `ProductType.getAssignedAttributeSetSmartList()`
//   [model/entity/ProductType.cfc:L280] precedent. `HibachiSmartList` is a
//   framework artefact deliberately replaced by explicit typed repository queries
//   — `getProductSmartList`/`getSkuSmartList` become `findProducts`/`findSkus`.
//   NO SMART LIST IS EVER REIMPLEMENTED.
//
// ── FRAMEWORK OVERRIDES ────────────────────────────────────────────────────
// LEGACY-NOTE [model/entity/Sku.cfc:L842-L855]: `getPropertyMetaData(propertyName)`
//   is a `HibachiEntity` override whose comment at [L842] uses `@help` rather than
//   the `@hint` used everywhere else in the component. It exists solely to make
//   the `onMissingMethod` override work: when the argument is 32 characters long
//   it treats it as an optionGroupID and returns the matching option's
//   `optionName` metadata. OMITTED — it serves dynamic property resolution, which
//   this migration removes, and the capability it enabled is now the explicitly
//   typed {@link Sku.getOptionNameByOptionGroupID}.
// LEGACY-NOTE [model/entity/Sku.cfc:L857-L873]: `onMissingMethod` itself is
//   REPLACED rather than omitted — see {@link Sku.getOptionNameByOptionGroupID}.
// LEGACY-NOTE [model/entity/Sku.cfc:L99]: the non-persistent `adminIcon` property
//   and its accessor serve the out-of-scope admin application. OMITTED.
//
// ── EMPTY AND STRUCTURAL SECTIONS, RECORDED SO THE ABSENCES ARE NOT MISREAD ──
// LEGACY-NOTE [model/entity/Sku.cfc:L878]/[L880]: the `ORM Event Hooks` banner
//   pair is COMPLETELY EMPTY. There is no `preInsert` and no `preUpdate` on this
//   component, so the ORM lifecycle-hook reshaping budget is spent zero times —
//   there is nothing to reshape. Contrast
//   [model/entity/PriceGroup.cfc:L206]/[L211], which does carry both hooks.
// LEGACY-NOTE [model/entity/Sku.cfc:L788]/[L790]: the `Custom Formatting Methods`
//   banner pair is EMPTY.
// LEGACY-NOTE [model/entity/Sku.cfc:L803]/[L805]: the `Overridden Smart List
//   Getters` banner pair is EMPTY. Enumerations of this component's empty sections
//   that list only [L788]/[L790] and [L878]/[L880] are missing this one.
// LEGACY-NOTE [model/entity/Sku.cfc:L123-L125]: the `Deprecated Properties`
//   section is EMPTY — in contrast to the `Deprecated Methods` section
//   [L882]/[L912], which carries four members.
// LEGACY-NOTE [model/entity/Sku.cfc:L117]: the non-persistent property
//   `salePriceDiscountAmount` is DECLARED but has NO accessor method anywhere in
//   the 916 lines. Nothing to port; recorded so the gap is understood to be
//   legacy.
//
// ── THE UNEXPLAINED LINE GAPS, NOW EXPLAINED ───────────────────────────────
// Three gaps in the source have been checked against the verbatim text and every
// one is banner and blank-line whitespace, not missing code. The
// banner/blank-line hypothesis holds here as it does across the rest of the
// folder:
//   [L121]→[L131]  the last non-persistent property, then [L123-L125] the empty
//                  `Deprecated Properties` section and [L128] the short-form
//                  `START: Image Methods` banner, then `generateImageFileName`.
//   [L599]→[L603]  `END: Non-Persistent Property Methods` [L599], then
//                  `START: Bidirectional Helper Methods` [L601], then the
//                  `// Product (many-to-one)` sub-banner [L603].
//   [L747]→[L756]  `removePhysical` ends [L749], `END: Bidirectional Helper
//                  Methods` [L751], `START: Custom Validation Methods` [L753],
//                  the `@hint` [L755], then `hasUniqueOptions` [L756].
//
// ── PRESERVED SPELLING ─────────────────────────────────────────────────────
// Misspellings and banner warts in the source are preserved verbatim wherever
// they are quoted — `mechinism` at [L415], the duplicated `@hint` at [L771], the
// `@help` at [L842], and the eight short-form banner sites. NO SPELLING IS
// CORRECTED IN ANY COMMENT.
//
// ── AND WHAT IS NOT HERE AT ALL ────────────────────────────────────────────
// No SLA, latency, throughput, uptime or performance figure appears anywhere in
// this file or its comments (B7). The legacy runtime's 60-second
// order-placement, 45-second payment-transaction and 30-second DI/1 first-scan
// lock timeouts are noted and deliberately not implemented; all three sit in
// out-of-scope code paths, and the third disappears with DI/1 itself.
//
// No `cfthread` usage exists anywhere in the in-scope slice, so the
// `cfthread`-to-`worker_threads` translation rule is recorded for completeness
// and is not exercised by this file.
// ---------------------------------------------------------------------------
