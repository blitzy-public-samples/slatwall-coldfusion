// ---------------------------------------------------------------------------
// slatwall-ts - Sku entity
//
// Port of model/entity/Sku.cfc (916 source lines), the largest and highest-risk entity in the
// slice. It owns MUST-PRESERVE BEHAVIOUR #3, the four-step currency cascade `getCurrencyDetails()`
// [model/entity/Sku.cfc:L367-L433], and with it the highest-consequence parity check in the
// migration: `getPriceByCurrencyCode()` [L269-L273] answers `undefined`, NEVER `0`, because a `0`
// default would silently sell products for free. It also owns the `onMissingMethod` override [L858]
// and the two declaratively-invoked model/validation/Sku.json validators `hasUniqueOptions()`
// [L756] and `hasOneOptionPerOptionGroup()` [L772].
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/Sku.cfc:L49]
//
//   component entityname="SlatwallSku" table="SwSku" persistent=true accessors=true output=false
//             extends="HibachiEntity" cacheuse="transactional" hb_serviceName="skuService"
//             hb_permission="this" {
//
// Note `persistent=true accessors=true output=false` UNQUOTED, the PriceGroup/PriceGroupRate shape,
// not the quoted form the promotion cluster uses. Schema continuity is binding: `SwSku` and every
// column, link table, `fkcolumn` and `inversejoincolumn` below is reproduced exactly.
//
// LOCATOR-DRIFT CAUTION, three widely-circulated sets are wrong and NOT used: currencyService is at
// L371/L418/L422/L425, not L379/L421; price-group reads at L262/L266/L437, not L436; skuService at
// L569/L594, not L568.
//
// THE 19 `getService(` LOCATOR SITES AND WHAT REPLACED EACH - the largest such surface in the
// slice: L189, L218, L258, L262, L266, L295, L296, L300, L310, L330, L371, L418, L422, L425, L437,
// L451, L569, L594, L816. Enumerations reporting eighteen omit L330, the `attributeService` read
// inside `getAssignedOrderItemAttributeSetSmartList` [L327]. All are eliminated by injection (T2):
//
//   SYNC   getCurrencyCode, getCurrencyDetails, getPriceByCurrencyCode,
//          getListPriceByCurrencyCode, getRenewalPriceByCurrencyCode,
//          getPriceByPriceGroup, getAppliedPriceGroupRateByPriceGroup,
//          getDefaultFlag, getSalePriceDetails, getSalePrice,
//          getSalePriceDiscountType, getSalePriceExpirationDateTime,
//          the option methods, the option structs, hasOneOptionPerOptionGroup,
//          every probe, every bidirectional helper, the deprecated block
//   ASYNC  getCurrentAccountPrice, getLivePrice, getBaseProductType,
//          getSkuDefinition, getTransactionExistsFlag, hasUniqueOptions
//   ASYNC, AND NOT ON THE PORTED INSTANCE SURFACE AT ALL
//          Sku.hydrate, Sku.resolveCurrencyCascadeContext (static hydration
//          seams), and the PRIVATE materializeCurrencyDetails they drive
//
// LEGACY-NOTE [model/entity/Sku.cfc:L367-L433]: the cascade's own inputs are
// asynchronous in the target — `CurrencyConverter` declares every member async
// — yet [L269-L285] must stay synchronous to preserve the accessor contract.
// The resolution is the one the port itself documents: the cascade runs during
// hydration, behind {@link Sku.hydrate}, and {@link Sku.getCurrencyDetails}
// reads the instance memo synchronously. NO LEGACY SIGNATURE CHANGES.
//
// ★ AND THE ASYNC HALF IS NOT PUBLISHED ON THE INSTANCE. `materializeCurrencyDetails`
// is PRIVATE, so this entity adds no ordering protocol that a caller could get
// wrong — the alternative, a public async materialiser, would have made three
// synchronous getters answer `{}` for any caller who forgot to await it first,
// and an empty map is precisely what a missing price must never be confusable
// with. `{}` from `getCurrencyDetails()` now carries only the two meanings the
// legacy gives it: the eligibility gate at [L373] was closed, or this hydration
// materialised no currency map because its consumer needs none.
//
// FOUR INJECTED COLLABORATORS, each an explicit compile-checked constructor argument (T1):
// `SettingsProvider`, whose members are SYNCHRONOUS - which lets `getCurrencyCode()` stay
// synchronous - for `setting('skuCurrency')` [L362, L385, L418, L422, L425] and
// `setting('skuEligibleCurrencies')` [L373, L375]; `CurrencyConverter`, EVERY MEMBER ASYNC, for the
// eligible-currency listing [L371] and the three conversions [L418, L422, L425]; a price-group
// resolver for [L262], [L266], [L437]; `SkuRepository` for `getTransactionExistsFlag` [L594].
//
// GAP 1 - `PriceGroupRepository` DOES NOT DECLARE THE THREE MEMBERS [L262], [L266] AND [L437]
// REACH; they are PRICE-GROUP SERVICE members. So this file declares the narrow structural
// collaborator {@link SkuPriceGroupResolver} locally and imports the real
// {@link CurrentAccountContext} from the port rather than inventing it. Nothing is added to a port
// file.
//
// GAP 2 - `SkuRepository` DOES NOT DECLARE `getSkuStocksDeletableFlag`, which [L569] reaches. That
// is DEFECT 28, preserved as a throwing stub rather than papered over.
//
// THE ASYNC BOUNDARY. A method is `async` if and only if its legacy body reaches the DAO, the ORM
// or a port member that does. Exactly seven qualify - `materializeCurrencyDetails`,
// `getCurrentAccountPrice`, `getLivePrice`, `getBaseProductType`, `getSkuDefinition`,
// `getTransactionExistsFlag` and `hasUniqueOptions`; EVERY OTHER MEMBER IS SYNCHRONOUS.
//
// `getCurrentAccountPrice()` [L435] takes NO parameter: rule T6 removes the ambient
// `getSlatwallScope()` read by threading {@link CurrentAccountContext} through the CONSTRUCTOR.
// Return types are REFINED where the legacy declares `any` and the body proves a narrower contract,
// which adds no parameter, removes no member and changes no name.
//
// DEFECTS - SEVEN PRESERVED, each with its full marker at its own site: DEFECT 16 [L258], DEFECT 28
// [L569], [L247-L251], [L583], [L771], [L400-L414], [L416]. TWO FIXED as deliberate divergences,
// likewise annotated at each site: DEFECT 17 [L500-L510] and DEFECT 18 [L512-L522], both
// unobservable through the public contract.
//
// PRESENTATION RULING FOR THE SIX `*Formatted` SUB-KEYS. Steps 1 and 2 call the unported
// `HibachiEntity.getFormattedValue`, Step 3 the THREE-argument
//   `formatValue(value, "currency", {currencyCode=...})`,
// which differs from the two-argument form at [model/entity/PriceGroupRate.cfc:L266]. All six sites
// delegate to `numberFormat(money.toDecimalString(), '0.00')`; the framework formatter's
// currency-symbol and locale behaviour is NOT reproduced and no formatting dependency is
// introduced.
//
// TEST OBLIGATION: tests/unit/domain/entities/sku.test.ts is NET-NEW COVERAGE -
// meta/tests/unit/entity/ holds only BrandTest.cfc and ProductTest.cfc - so it must never be
// presented as parity.
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
// `Money` is a VALUE import, not type-only, for one specific reason: [model/entity/Sku.cfc:L55-L57]
// declare `listPrice`, `price` and `renewalPrice` with `default="0"`, so hydration must be able to
// MATERIALISE a zero. `Money.zero` is that zero.
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

// EXPORTED TYPES. One exported unit per file governs RUNTIME units; the types below are the class's
// own vocabulary, erased at emit, and moving them to a shared module would create exactly the
// barrel this project forbids.

/**
 * One currency's resolved prices, as the four-step cascade [model/entity/Sku.cfc:L367-L433] leaves
 * them.
 *
 * WHY `skuCurrencyID` IS REQUIRED AND EVERY PRICE IS OPTIONAL. [L381-L382] creates the entry and
 * seeds `skuCurrencyID` to `''` UNCONDITIONALLY, before any price is considered:
 *
 *   variables.currencyDetails[ thisCurrency.getCurrencyCode() ] = {};
 *   variables.currencyDetails[ thisCurrency.getCurrencyCode() ].skuCurrencyID = "";
 *
 * So the OUTER map key always exists for every eligible currency, even when no price is ever
 * recorded for it, and only SUB-keys can be absent. That single fact is why the three accessors at
 * [L269-L285] are asymmetric: one needs only the outer check and two need a second one.
 *
 * ABSENT IS NOT PRESENT-AND-UNDEFINED. Under `exactOptionalPropertyTypes` an omitted `price` and a
 * `price` holding `undefined` are different types, and the cascade depends on the difference:
 * [L416] tests `structKeyExists(entry, "price")`, so installing an `undefined` price would SUPPRESS
 * the conversion step. Nothing here ever writes `undefined` into a sub-key or pre-seeds one with
 * zero.
 */
/**
 * Store `value` on `target` under `key` as an OWN, enumerable data property.
 *
 * ★ WHY THIS EXISTS INSTEAD OF `target[key] = value`. Every key written through
 * this function is EXTERNALLY SOURCED — an option-group code, an option-group
 * name or an option-group identifier, all of them column values out of
 * `SwOptionGroup`. A plain object inherits `Object.prototype`, which still
 * exposes the legacy `__proto__` accessor, so `target['__proto__'] = value`
 * CALLS THAT SETTER rather than creating a property: the entry is silently
 * DISCARDED while every key around it is recorded, and when the value is an
 * object the record's own prototype is replaced. `Object.defineProperty` states
 * the intent explicitly — an own, enumerable, writable, configurable data
 * property — so the write cannot be intercepted at all.
 *
 * CFML parity [model/entity/Sku.cfc:L504, L516, L902]: a CFML struct has no
 * prototype chain and no reserved keys, so `variables.optionsByOptionGroupCode[
 * '__proto__' ]` was an ordinary key holding an ordinary value. Restoring that
 * is what this function does; the plain assignment it replaces was the
 * divergence.
 *
 * The same mechanism, and the same reasoning, is already used by
 * `src/lib/logger.ts` `redactPlainObject`, which policed the identical hazard on
 * caller-supplied context keys.
 *
 * ★ IT IS NOT A CASE-FOLDING WRITE. Key matching stays exactly where it was:
 * the two guarded accessors keep their `structKeyExists` pre-test from
 * `../../lib/cfml/struct.js` and {@link Sku.getOptionsValueStruct} keeps having
 * none, so which option wins per group is unchanged. This function decides only
 * HOW the surviving key is stored, never WHICH key is chosen.
 *
 * ★ THE PROTOTYPE OF `target` IS DELIBERATELY LEFT ALONE. `Object.create(null)`
 * would also close the hazard, but it would change the identity of a value three
 * public accessors hand back, and the memo objects are compared structurally by
 * the suite. `defineProperty` gives the identical guarantee with no observable
 * change to anything but the pathological key.
 *
 * @param target the record being built. Mutated in place.
 * @param key the externally sourced key. Used verbatim, never normalised.
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

export type CurrencyDetail = {
  /**
   * The `SwSkuCurrency` row this entry's prices came from, or `''` when they came from the sku's
   * own columns or from a conversion. [L382, L412] - [L412] is the cascade's only non-empty write.
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
   * `false` when the price came from the sku's own columns [L396] or from an override row [L411];
   * `true` when converted [L427]. Absent when the currency matched no step at all, which is
   * reachable: a currency that is neither the base currency nor an override row still gets an entry
   * at [L381], and if the sku's own price is absent the conversion step installs nothing.
   */
  readonly converted?: boolean;
};

/**
 * The three money sub-keys of a {@link CurrencyDetail}, and nothing else.
 *
 * This exists so the two-level reads at [model/entity/Sku.cfc:L276] and [L282] can be typed
 * precisely. `structGetPath<TInner>` returns `TInner[keyof TInner] | undefined`; handed the full
 * {@link CurrencyDetail} that union would include `string` and `boolean` and the accessors would
 * need a narrowing step that reads like a cast. Handed this view it is exactly `Money | undefined`,
 * the published contract. A {@link CurrencyDetail} is assignable here, so no cast and no `any` is
 * used.
 */
export type CurrencyDetailMoneyView = {
  readonly price?: Money;
  readonly listPrice?: Money;
  readonly renewalPrice?: Money;
};

/**
 * The cascade inputs that are the SAME for every sku, resolved once.
 *
 * ★ WHY THIS TYPE EXISTS. The four-step cascade [model/entity/Sku.cfc:L367-L433]
 * reads exactly three things that do not vary from one sku to the next — the
 * `skuCurrency` setting [L385, L418, L422, L425], the `skuEligibleCurrencies`
 * setting [L373, L375], and the eligible-currency listing [L371]+[L375]+[L377] —
 * and one thing that does: the sku's own price columns, which Step 3 converts
 * [L418, L422, L425]. Separating the two is what lets a repository resolve the
 * invariant part ONCE for a whole result set and hand the same value to every
 * sku it builds, instead of re-asking the same collaborators the same questions
 * per row.
 *
 * ★ THIS IS AN EXPLICITNESS DECISION, NOT A PERFORMANCE ONE (B7). What it buys
 * is that the number of collaborator calls a hydration makes is a property a
 * reader can state by looking at {@link Sku.resolveCurrencyCascadeContext} —
 * three, always — rather than something that has to be derived from how many rows
 * the statement happened to return. No claim about speed is made here or
 * anywhere else in this file.
 *
 * A DISCRIMINATED UNION RATHER THAN OPTIONAL MEMBERS, because the gate at [L373]
 * is genuinely binary and the members below are meaningful only on one side of
 * it. When the gate is closed there is no base currency to brand and no listing
 * to hold, and the type says so instead of carrying three `undefined`s that
 * every reader has to re-check.
 */
export type SkuCurrencyCascadeContext =
  | {
      /**
       * [model/entity/Sku.cfc:L373] `len(setting('skuEligibleCurrencies'))` was
       * empty, so [L375]-[L429] never run and the memo stays `{}`.
       */
      readonly eligibilityGateOpen: false;
    }
  | {
      readonly eligibilityGateOpen: true;

      /**
       * [model/entity/Sku.cfc:L385] the raw `skuCurrency` setting, compared
       * case-insensitively against each eligible code in Step 1.
       */
      readonly skuCurrencySetting: string;

      /**
       * [model/entity/Sku.cfc:L418, L422, L425] the conversion SOURCE, branded
       * once.
       *
       * ★ BRANDED INSIDE THE GATE, DELIBERATELY. `toCurrencyCode` raises on a
       * malformed value, and the legacy only ever reads `skuCurrency` at [L385]
       * and [L418]-[L425] — all of which sit INSIDE the gate. Branding it here
       * rather than at the callsite preserves the consequence: a malformed
       * `skuCurrency` setting does NOT raise while the gate is closed, because
       * the legacy never touches it there either.
       */
      readonly baseCurrencyCode: CurrencyCode;

      /**
       * [model/entity/Sku.cfc:L371]+[L375]+[L377] the eligible currency codes,
       * in the order the listing returned them.
       */
      readonly eligibleCurrencies: readonly CurrencyCode[];

      /**
       * [model/entity/Sku.cfc:L425] the ONE cascade collaborator that cannot be
       * hoisted, because each call converts THIS sku's own price.
       *
       * LEGACY-NOTE [model/entity/Sku.cfc:L418, L422, L425]: the legacy makes the
       * same three per-currency conversion calls, against the same three columns,
       * for every sku. Reproducing them is required (B2). `CurrencyConverter`
       * declares exactly three members — `getAllActiveCurrencyIDList`,
       * `getCurrenciesByCurrencyCodeList` and `convertCurrency` — and no
       * rate-table member, so there is nothing further to resolve up front, and
       * inventing a fourth port member is not this file's to do.
       */
      readonly currencyConverter: CurrencyConverter;
    };

/**
 * The price-group collaborator this entity reaches at [model/entity/Sku.cfc:L262], [L266] and
 * [L437]. Declared locally rather than imported because all three legacy calls target
 * `priceGroupService` and the canonical `PriceGroupRepository` port declares none of them - see GAP
 * 1 in the file header. The implementation is supplied by the composition root.
 *
 * LEGACY-NOTE [model/service/PriceGroupService.cfc:L140, L301, L262]: the three members below
 * belong to the price-group SERVICE surface. Recorded rather than added to the port: this file does
 * not own that port.
 *
 * Two service-tier asymmetries this entity must not smooth over are enforced there, not here:
 *   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L174]: the parent recursion of the
 *     five-level
 *     cascade calls `getRateForProductBasedOnPriceGroup`, NOT the sku variant.
 *   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L316-L340]: ONLY the `percentageOff` branch
 *     applies the rounding rule; `amountOff` and `amount` skip it.
 */
export interface SkuPriceGroupResolver {
  /** [model/entity/Sku.cfc:L262] → `model/service/PriceGroupService.cfc:L301`. */
  calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money;

  /** [model/entity/Sku.cfc:L266] → `model/service/PriceGroupService.cfc:L140`. */
  getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined;

  /**
   * [model/entity/Sku.cfc:L437] -> `model/service/PriceGroupService.cfc:L262`. Async because the
   * legacy body reaches the account subscription price-group query. The context argument is what
   * replaces the ambient `getSlatwallScope()` read (T6).
   */
  calculateSkuPriceBasedOnCurrentAccount(sku: Sku, context: CurrentAccountContext): Promise<Money>;
}

/**
 * The sale-price detail row `getSalePriceDetails()` [model/entity/Sku.cfc:L539-L544] resolves,
 * derived from `Product`'s declared return type rather than re-declared. Naming the promotion
 * port's `SalePriceDetail` directly would mean importing `../ports/promotionRepository.js`, which
 * is not among this file's declared dependencies, so the type is derived from the one module that
 * legitimately publishes it here. No shape is invented and no dependency is added.
 */
export type SkuSalePriceDetails = Awaited<ReturnType<Product['getSkuSalePriceDetails']>>;

/**
 * The resize arguments the image methods accept. Every member is optional because every one is
 * tested with `structKeyExists` before being read [model/entity/Sku.cfc:L159-L187, L198-L216]. The
 * shape exists only so the refusing stubs below present the signature `Product` forwards to them.
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
 * ★ WHY THIS TYPE EXISTS RATHER THAN A SETTINGS-PORT LOOKUP, AND THE REASON IS
 * PER MEMBER RATHER THAN BLANKET. `baseImageURL` is not a settings key at all: it
 * resolves `getHibachiScope().getBaseImageURL()`
 * [model/transient/HibachiScope.cfc:L186-L188] over `globalAssetsImageFolderPath`
 * [model/service/SettingService.cfc:L164], which the seven-key `SettingsProvider`
 * union deliberately excludes. `productImageOptionCodeDelimiter` [:L192] and
 * `productImageDefaultExtension` [:L191] ARE on that union - they are its third
 * and fourth literals - but THE LEGACY RESOLVES BOTH ON THE PRODUCT, NOT ON THE
 * SKU: `getProduct().setting('productImageOptionCodeDelimiter')`
 * [model/entity/Sku.cfc:L135] and
 * `getProduct().setting('productImageDefaultExtension')` [L138]. So the SKU
 * receives all three ALREADY RESOLVED, arriving together as one materialized
 * bundle at the repository boundary, and the composition root resolves the two
 * settings THROUGH the one flat provider on the way in - never a second time and
 * never here. What that establishes is only that this entity may not RESOLVE
 * them; it says nothing about whether the entity may COMPOSE a string out of them
 * once they have been resolved somewhere that legitimately can. The distinction is
 * exactly the one already drawn for `Option.getImageDirectory()`
 * [model/entity/Option.cfc:L81-L83], whose base URL arrives the same way through
 * `Option.assetsImageBaseUrl`, and for the feed adapter's
 * `ResolvedFeedSettingValues`. Relocating an ambient lookup is the whole point of
 * the anti-corruption boundary; deleting the behaviour that surrounded it inverts
 * that boundary instead of honouring it.
 *
 * Every member is REQUIRED once the object exists, because a half-resolved set
 * cannot compose either string and an absent set is already expressible - the
 * whole object is optional on {@link SkuHydrationInput}. A repository reading
 * `SwSku` for the promotion engine has no reason to resolve an image path, and
 * that absence is a real hydration state rather than an error.
 *
 * ★ WHAT AN ABSENT SET MEANS IS DECIDED PER MEMBER, BY WHETHER THE SOURCE COULD
 * FAIL THERE. `productImageOptionCodeDelimiter` and
 * `productImageDefaultExtension` both carry a metadata `defaultValue`
 * [model/service/SettingService.cfc:L191-L192] that `setting()` falls back to
 * [model/service/SettingService.cfc:L481-L482], so
 * {@link Sku.generateImageFileName} mirrors those defaults instead of raising.
 * `getBaseImageURL()` is a scope accessor with no such default, so
 * {@link Sku.getImagePath} raises. Neither treatment is a policy choice about
 * absent inputs; each is what the corresponding source expression does.
 */
export type SkuImageSettingValues = {
  /**
   * `getHibachiScope().getBaseImageURL()` as read at
   * [model/entity/Sku.cfc:L146], already resolved to URL form.
   *
   * The scope accessor is framework code on the un-ported Hibachi base, so the
   * value is resolved outside the domain and handed in. Read by
   * {@link Sku.getImagePath}.
   */
  readonly baseImageURL: string;

  /**
   * `setting('productImageOptionCodeDelimiter')` as read at
   * [model/entity/Sku.cfc:L135].
   *
   * `productImageOptionCodeDelimiter = {fieldType="text", defaultValue="-"}`
   * [model/service/SettingService.cfc:L192]. Read by
   * {@link Sku.generateImageFileName}.
   */
  readonly productImageOptionCodeDelimiter: string;

  /**
   * `setting('productImageDefaultExtension')` as read at
   * [model/entity/Sku.cfc:L138].
   *
   * `productImageDefaultExtension = {fieldType="text", defaultValue="jpg"}`
   * [model/service/SettingService.cfc:L191]. Read by
   * {@link Sku.generateImageFileName}, which prefixes it with a literal `.`.
   */
  readonly productImageDefaultExtension: string;
};

/**
 * Everything needed to construct a hydrated `Sku`.
 *
 * REPOSITORIES OWN HYDRATION. This file does not query, does not open a
 * connection and does not import a driver. `src/repositories/mysql/**` reads
 * the row, materialises the associations, chooses and documents the fetch shape,
 * injects the collaborators, and passes the result through
 * {@link Sku.hydrate} — the one boundary at which the currency cascade runs.
 *
 * Every collaborator is optional because not every hydration needs every one: a catalog listing
 * that reads `skuCode` has no business requiring a currency converter. A member that is genuinely
 * needed and absent produces an explicit error naming it - never a silent zero, never a silent
 * empty result.
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
  //
  // ★★★ THE FOUR AUDIT MEMBERS ARE REPOSITORY-CONTROLLED DATA, NOT A CALLER-FACING CHANNEL, AND THAT
  // DISTINCTION IS ENFORCED WHERE WRITES HAPPEN RATHER THAN HERE. They are accepted because a hydration
  // input has to be able to PROJECT A ROW - `src/repositories/mysql/mysqlSkuRepository.ts` reads all
  // four out of `SwSku` and constructs the entity from them - and no handler maps external input into
  // any of them. What a code review flagged is what would follow if a write seam were ever exposed, so
  // the write side is where it is closed: S-07 makes the UPDATE resolve `createdByAccountID` and
  // `modifiedByAccountID` against the STORED values through `COALESCE`, and the same review closed the
  // timestamp half by removing `createdDateTime` from the UPDATE assignment list outright. A
  // hand-built `Sku` therefore cannot rewrite an existing row's creation chronology or its actors, no
  // matter what these members claim.
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
   * Pre-materialised sale-price detail for this sku, as `Product.getSkuSalePriceDetails()` would
   * return it.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L539-L544]: the legacy body delegates to the product, whose
   * ported method is asynchronous. It is supplied here instead so that `getSalePrice()` [L546],
   * `getSalePriceDiscountType()` [L553] and `getSalePriceExpirationDateTime()` [L560] keep the
   * synchronous contract their callers rely on.
   */
  readonly salePriceDetail?: SkuSalePriceDetails;

  /**
   * The requesting account, explicit rather than ambient (T6).
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L262-L268]: the legacy path reads the account
   * from the request scope through the anomalous `getSlatwallScope()` while the rest of the
   * codebase uses `getHibachiScope()`. Both are replaced by this explicit context, which normalises
   * the inconsistency. `src/lib/config.ts` is static process configuration and is NEVER a request
   * scope.
   */
  readonly currentAccountContext?: CurrentAccountContext;

  /**
   * The resolved ambient values the two portable image members compose with.
   *
   * Supplied by whichever repository method — or service constructing a draft —
   * needs `getImagePath()` or `generateImageFileName()` to answer a CONFIGURED
   * value rather than a default. Omitting it is a real hydration state and the two
   * members treat it differently, because their inputs differ:
   * {@link Sku.generateImageFileName} falls back to the setting metadata defaults
   * the source itself falls back to [model/service/SettingService.cfc:L191-L192,
   * L481-L482], while {@link Sku.getImagePath} raises, because
   * `getBaseImageURL()` has no metadata default to mirror. See
   * {@link SkuImageSettingValues} for why the values are resolved outside the
   * domain at all.
   */
  readonly imageSettingValues?: SkuImageSettingValues;

  /**
   * An ALREADY-COMPLETED per-currency price map, injected rather than computed.
   *
   * ★ THIS IS THE SECOND OF THE TWO WAYS THE CASCADE MEMO IS ESTABLISHED, AND IT
   * IS THE ONE THAT RUNS NO COLLABORATOR AT ALL. {@link Sku.hydrate} is the
   * other: it runs the cascade [model/entity/Sku.cfc:L367-L433] once, against a
   * context resolved once for a whole batch. This member is for the hydration
   * paths that already HOLD a completed map and would otherwise recompute it —
   * chiefly a save round-trip, which rebuilds the instance from an entity whose
   * map was materialised when it was first read.
   *
   * Supplying it seeds the memo at construction, so [L368]'s
   * `structKeyExists(variables, "currencyDetails")` guard is satisfied before any
   * accessor is reached and {@link Sku.hydrate} becomes a no-op — the same
   * idempotence the legacy memo guard gives.
   *
   * Absent means "this hydration did not materialise the map", and then
   * {@link Sku.getCurrencyDetails} answers `{}` — which is exactly the state
   * [L369] establishes and [L373] leaves in place when the eligibility gate is
   * closed. No accessor invents a zero to cover it.
   */
  readonly currencyDetails?: Readonly<Record<string, CurrencyDetail>>;

  // Collaborator ports.
  readonly settingsProvider?: SettingsProvider;
  readonly currencyConverter?: CurrencyConverter;
  readonly priceGroupResolver?: SkuPriceGroupResolver;
  readonly skuRepository?: SkuRepository;

  /**
   * `true` when this row has not been persisted, which `HibachiEntity.isNew()` answers by testing
   * the primary key against its `unsavedvalue=""` [model/entity/Sku.cfc:L52]. Supplied explicitly
   * so the answer does not depend on guessing how a repository spells an unsaved key.
   */
  readonly isNew?: boolean;
};

/**
 * `SlatwallSku`, table `SwSku` - a stock-keeping unit.
 *
 * A CLASS, NOT AN INTERFACE: the legacy component carries behaviour - the currency cascade
 * [model/entity/Sku.cfc:L367-L433], the dispatcher override [L858], the two declarative validators
 * [L756, L772] - and interface parity is the acceptance contract, so every public method name is
 * the legacy CFML name verbatim in camelCase.
 *
 * EVERY MEMO IS INSTANCE-SCOPED AND EVERY INSTANCE REQUEST-SCOPED. The legacy memoises into
 * `variables` at [model/entity/Sku.cfc:L361], [L368], [L483], [L501], [L513], [L525] and [L795],
 * which on a warm container would persist between unrelated requests and could leak one customer's
 * pricing into another's. Not one is hoisted to module scope, and the same ruling governs the
 * slice's other three legacy caches [model/dao/SkuDAO.cfc:L204-L226],
 * [model/service/RoundingRuleService.cfc:L67-L77] and [model/service/PromotionService.cfc:L1007].
 *
 * ASSOCIATIONS ARE ALREADY-POPULATED ARRAYS, returned as the live internal reference - see the
 * live-array proof above {@link Sku.getProduct}. Laziness is not simulated and the fetch shape is a
 * documented decision at the repository method. Every in-scope collection defaults to `[]`, never
 * `undefined` [meta/tests/unit/entity/BrandTest.cfc]. An empty collection is PERMISSIVE on an
 * exclude list and RESTRICTIVE on an include list [org/Hibachi/HibachiEntity.cfc:L340-L350]; the
 * two polarities are never normalised.
 *
 * LEGACY-NOTE [model/entity/Sku.cfc:L65]: `product` is declared WITHOUT `fetch="join"`, so it is a
 * lazy many-to-one. `Sku` is not one of the slice's four eager-fetch sites - `Product.brand`
 * [model/entity/Product.cfc:L68], `Product.productType` [L69], `Product.defaultSku` [L70] and
 * `PromotionPeriod.promotion` [model/entity/PromotionPeriod.cfc:L59].
 */
export class Sku {
  // PERSISTENT PROPERTIES [model/entity/Sku.cfc:L52-L59], reproduced verbatim in source order with
  // every `hb_*` and `rbKey` attribute carried forward as an inert comment. JavaRB is not ported,
  // so the resource-bundle identifiers survive as string literals the legacy admin can still
  // resolve.

  /**
   * `property name="skuID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *  unsavedvalue="" default="";` [L52] - the primary key, and the basis of every probe here.
   */
  private readonly skuID: string;

  /**
   * `property name="activeFlag" ormtype="boolean" default="1";` [L53]
   *
   * One of exactly TWO persisted booleans on this component. Hydrated through `cfBoolean` because
   * the column can arrive from SQL as `1`, `'1'`, `'true'` or NULL and CFML accepted all four.
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
   * survive as real runtime checks. See {@link Sku.hydrate}.
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
   * The column is PRESERVED — it is part of the schema contract (B5) — and it is
   * both READ and WRITTEN inside the ported slice. {@link Sku.getImagePath}
   * composes it into a path and {@link Sku.setImageFile} assigns it, the latter
   * driven by `processProduct_updateDefaultImageFileNames`
   * [model/service/ProductService.cfc:L208-L213]. The members that RESIZE or
   * RENDER an image remain refusals; see the image section below for the line
   * between the two.
   *
   * NOT `readonly`, because of that setter.
   */
  private imageFile?: string;

  /**
   * `property name="userDefinedPriceFlag" ormtype="boolean" default="0";` [L59]
   *
   * The second and last persisted boolean on this component.
   */
  private userDefinedPriceFlag: boolean;

  /**
   * `property name="calculatedQATS" ormtype="integer";` [L62] - a CALCULATED property under its own
   * banner: a persisted cache of the quantity-available-to-sell figure the out-of-scope stock
   * subsystem computes. NOT money; `ormtype="integer"` says so.
   */
  private calculatedQATS?: number;

  /**
   * `property name="remoteID" ormtype="string";` [L90]
   *
   * The external-system correlation identifier. Inert here.
   */
  private remoteID?: string;

  // AUDIT PROPERTIES [model/entity/Sku.cfc:L93-L96]. All four declare `hb_populateEnabled="false"`;
  // there is no mass-assignment path in the target, so the attribute is documentation of intent.
  // UTC POLICY: every `Date` here is an instant in UTC, where CFML compared in the server's local
  // timezone. NO CLOCK IS INJECTED - unlike `PromotionPeriod`, `Sku` has no date-dependent
  // predicate. Both `Account` foreign keys collapse to inert opaque identifiers: the column
  // survives, the association does not.

  /** `property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";` [L93] */
  private createdDateTime?: Date;

  /**
   * `property name="createdByAccount" cfc="Account" fieldtype="many-to-one"
   *  fkcolumn="createdByAccountID" hb_populateEnabled="false";` [L94] - collapsed to the raw
   *  foreign
   * key, as `Promotion.defaultImage` -> `defaultImageID?`.
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
   * `property name="product" cfc="Product" fieldtype="many-to-one" fkcolumn="productID"
   *  hb_cascadeCalculate="true";` [L65]
   *
   * `hb_cascadeCalculate="true"` marks the edge the framework walked when recalculating derived
   * values; there is no such engine in the target. Optional because `removeProduct()` [L618] does
   * `structDelete(variables, "product")`, so absence is a state the legacy entity reaches.
   */
  private product: Product | undefined;

  /**
   * `property name="options" singularname="option" cfc="Option" fieldtype="many-to-many"
   *  linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID";` [L76] - the OWNING
   *  side,
   * read by nine methods here and by the promotion entities' option probes.
   */
  private readonly options: Option[];

  /**
   * `property name="skuCurrencies" singularname="skuCurrency" cfc="SkuCurrency"
   *  fieldtype="one-to-many" fkcolumn="skuID" cascade="all-delete-orphan" inverse="true";` [L72]
   *
   * STEP 2 OF THE CASCADE READS THIS COLLECTION [L399-L414]. `cascade="all-delete-orphan"` is an
   * ORM obligation owned by the repository that deletes the sku.
   */
  private readonly skuCurrencies: SkuCurrency[];

  /**
   * `property name="priceGroupRates" singularname="priceGroupRate" cfc="PriceGroupRate"
   *  fieldtype="many-to-many" linktable="SwPriceGroupRateSku" fkcolumn="skuID"
   *  inversejoincolumn="priceGroupRateID" inverse="true";` [L86] - the INVERSE side;
   * `PriceGroupRate` owns the link table and mutates this very array.
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
   *  cfc="PromotionReward" fieldtype="many-to-many" linktable="SwPromoRewardExclSku"
   *  inverse="true";` [L83]
   *
   * `SwPromoRewardExclSku` - the abbreviated link-table name is a schema contract, never
   * "corrected".
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

  // OUT-OF-SCOPE ASSOCIATIONS, COLLAPSED TO INERT OPAQUE IDENTIFIERS. Every association whose
  // `cfc=` target is not one of the eighteen in-scope entities collapses to an opaque identifier or
  // is omitted; no out-of-scope entity is imported, not even as a type, and no entity-array
  // accessor is authored for one. "Omit" means "do not author this member here and annotate why" -
  // never a deletion of a legacy file, since the CFML monolith must keep running and every `.cfc`
  // is reference only.

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L66]: `subscriptionTerm` targets `cfc="SubscriptionTerm"`,
   * out of scope; collapsed to its raw foreign key with no subscription behaviour ported.
   */
  private subscriptionTermID?: string;

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L69]: `alternateSkuCodes` targets `cfc="AlternateSkuCode"`
   * with `inverse="true"` and `cascade="all-delete-orphan"`, out of scope; collapsed to opaque
   * identifiers and its helpers dropped. The unhonoured cascade obligation is recorded in the
   * repositories.
   */
  private readonly alternateSkuCodeIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L73]: `stocks` targets `cfc="Stock"` with `inverse="true"`
   * and `cascade="all-delete-orphan"`, part of the out-of-scope stock/inventory/location subsystem;
   * collapsed to opaque identifiers and its helpers dropped.
   */
  private readonly stockIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L77]: `accessContents` targets `cfc="Content"`, out of scope;
   * collapsed to opaque identifiers.
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
   * LEGACY-NOTE [model/entity/Sku.cfc:L87]: `physicals` targets `cfc="Physical"` through link table
   * `SwPhysicalSku`, out of scope; collapsed to opaque identifiers.
   *
   * LEGACY-NOTE [model/validation/Sku.json]: the delete-context rules use `maxCollection:0` against
   * collections the domain deliberately does not materialise -
   *   `"physicalCounts": [{"contexts":"delete","maxCollection":0}]`
   * on Sku, Product, Brand and ProductType, plus `PriceGroup.appliedOrderItems` and
   * `PromotionCode.orders` - so they would trivially PASS in TypeScript where they BLOCK in CFML.
   * Delete-context enforcement belongs to the service and repository tiers. And the rule names
   * `physicalCounts`, which THIS ENTITY DOES NOT DECLARE AT ALL: [L87] declares `physicals`, so the
   * rule cannot have been protecting anything in CFML either. Recorded as a legacy quirk; nothing
   * is renamed and nothing invented to satisfy it.
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

  /**
   * The resolved image-path ingredients. NOT a collaborator: it holds values, not
   * behaviour, which is why it sits here rather than behind a port. See
   * {@link SkuImageSettingValues}.
   */
  private readonly imageSettingValues?: SkuImageSettingValues;

  // -------------------------------------------------------------------------
  // PRE-MATERIALISED READ MODELS
  // -------------------------------------------------------------------------

  private readonly salePriceDetail?: SkuSalePriceDetails;
  private readonly newFlag: boolean;

  // INSTANCE-SCOPED MEMOS. Each corresponds to a `structKeyExists(variables, "...")` guard in the
  // source, where `undefined` means "the legacy `variables` key does not exist yet".
  //
  // ★ WHY EACH IS AN EXPLICIT `T | undefined` UNION RATHER THAN AN OPTIONAL
  // MEMBER. Under `exactOptionalPropertyTypes` an optional member `x?: T` cannot
  // be ASSIGNED `undefined`, and some of these slots must be clearable — a setter
  // that changes a price invalidates the LIVE-PRICE memo, which recomputes on
  // demand. The alternative, `delete this.x`, is never the right instrument: it
  // mutates the object's shape instead of its value. The union states the honest
  // model, which is that the slot always exists and holds `undefined` until the
  // value is computed.
  //
  // ★ THE CASCADE MEMO IS THE ONE THAT IS NEVER CLEARED, and the reason is
  // recorded in full at the three money setters: the legacy's ORM-generated
  // setters do not clear `variables.currencyDetails` either. `undefined` there
  // means "not yet materialised", and it becomes a value exactly once — at
  // construction from {@link SkuHydrationInput.currencyDetails}, or inside
  // {@link Sku.hydrate}.
  //
  // EACH IS AN EXPLICIT `T | undefined` UNION RATHER THAN AN OPTIONAL MEMBER, because under
  // `exactOptionalPropertyTypes` an optional member cannot be ASSIGNED `undefined` and these slots
  // must be clearable - a setter that changes a price has to invalidate the cascade memo. That is
  // the OPPOSITE decision from {@link CurrencyDetail}'s price sub-keys, where absent and
  // present-but-undefined MUST stay distinguishable because [L416] tests `structKeyExists`.

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
   * Constructs a hydrated `Sku`. The three `default="0"` money columns [L55-L57] are coerced to
   * `Money.zero` when absent, which makes them non-optional for the rest of the file; every
   * in-scope collection defaults to `[]`; every collaborator is optional and checked at the point
   * of use, so a partially-hydrated sku fails loudly at the member that needs it instead of
   * answering zero.
   */
  public constructor(input: SkuHydrationInput) {
    this.skuID = input.skuID;

    // [L53] default="1" - through the CFML boolean helper because a persisted boolean column can
    // arrive as SQL NULL, `0`/`1`, or `'true'`.
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

    // An explicit `Product | undefined` union rather than an optional member, because
    // `removeProduct()` must be able to CLEAR it - [L618] executes
    //   `structDelete(variables, "product")` -
    // and under `exactOptionalPropertyTypes` an optional member cannot be assigned `undefined`.
    this.product = input.product;

    // THE LIVE-ARRAY RULE STARTS HERE: each collection adopts the caller's array rather than
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

    // [model/entity/Sku.cfc:L368-L369] — an injected map satisfies the memo guard
    // at construction, so the cascade never runs for it and every accessor reads
    // it directly. Copied rather than adopted: `CurrencyDetail` is deeply readonly
    // and the caller's object is not this instance's to share.
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
   * chains `option.getOptionGroup().getOptionGroupXxx()` with NO null check, and in CFML a null
   * `optionGroup` raises immediately. Skipping the option instead would invent a tolerance the
   * legacy never had, silently changing two struct accessors and the answer of a live validator.
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
   * option-group code or name was never survivable at [model/entity/Sku.cfc:L504-L505], [L776-L779]
   * or [L902].
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
   * Substituting it would silently change case sensitivity on a live validation path, and adding a
   * member to that module is not this file's to do - so the case-sensitive test is implemented here
   * over `listToArray` with an exact `===` comparison. Case sensitivity is preserved deliberately.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L776]: `if(listFind(...))` relies on CFML truthiness of a
   * 1-BASED index where `0` means "not found". This helper returns a `boolean` so no caller can
   * write `if (listFindNoCase(...))` or compare a `findIndex` result with `> 0`.
   */
  private static listFindCaseSensitive(list: string, value: string): boolean {
    return listToArray(list).some((element: string) => element === value);
  }

  /**
   * The presentation form of a monetary value.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L388, L392, L395, L403, L407, L410]: these six sites call
   * `getFormattedValue("renewalPrice"|"listPrice"|"price")`, a `HibachiEntity` member that is not
   * ported, and [L419], [L423] and [L426] call the THREE-argument
   *   `formatValue(value, "currency", {currencyCode=...})`.
   * Both collapse to `numberFormat(value, '0.00')`, following
   * [model/entity/PriceGroupRate.cfc:L266]. THE FRAMEWORK FORMATTER'S CURRENCY-SYMBOL AND LOCALE
   * BEHAVIOUR IS NOT REPRODUCED, and the three-argument form's per-currency argument has no effect
   * on the output.
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

  // PERSISTENT PROPERTY ACCESSORS. `accessors=true` [L49] generated a getter and setter for every
  // persistent property; only those the in-scope slice reaches are authored, and the rest are
  // recorded in the omission ledger at the foot of this file.

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

  /** [L55] `default="0"`, therefore never absent - see the money-column asymmetry on the field. */
  public getListPrice(): Money {
    return this.listPrice;
  }

  /** [L55] */
  public setListPrice(listPrice: Money): void {
    this.listPrice = listPrice;
    this.livePriceMemo = undefined;
  }

  // -------------------------------------------------------------------------
  // ★ WHY THE THREE MONEY SETTERS DO NOT CLEAR THE CASCADE MEMO.
  //
  // LEGACY-NOTE [model/entity/Sku.cfc:L55-L57, L368]: `setListPrice`, `setPrice`
  // and `setRenewalPrice` are ORM-GENERATED accessors — `Sku.cfc` declares
  // `accessors="true"` and writes none of the three by hand — so NOTHING in the
  // legacy touches `variables.currencyDetails` when a price changes. The memo is
  // established once, guarded by `structKeyExists` at [L368], and thereafter
  // survives every price mutation. A sku whose price is changed after the cascade
  // has run reports the OLD per-currency prices in the legacy, and reports them
  // here too.
  //
  // An earlier revision of this file cleared the memo in all three setters. That
  // invented an invalidation the source does not have, and it also created a
  // state the source cannot reach: with the cascade reachable only through
  // {@link Sku.hydrate}, a cleared memo could never be refilled, so a single
  // `setPrice` would have turned a fully-priced sku into one whose three currency
  // accessors answer nothing at all. Removed on both counts — fidelity first, and
  // the hazard second.
  //
  // `livePriceMemo` is a different case and IS still cleared, and the distinction
  // is worth stating precisely rather than leaving implied. The legacy clears
  // neither memo: `variables.livePrice` [L482-L498] has no `structDelete` either,
  // and the component demonstrably knows that idiom — it uses it at [L618] for
  // `product` and at [L636] for `subscriptionTerm`. So clearing `livePriceMemo`
  // is a pre-existing target-only refinement, not a faithful reproduction. It is
  // retained rather than removed for one reason: `getLivePrice()` rebuilds itself
  // on demand from data already on the instance, so a cleared live price is
  // RECOVERABLE where a cleared cascade memo is not. That asymmetry — recoverable
  // versus not — is the whole difference between the two, and it is what makes
  // removing one and keeping the other coherent rather than arbitrary.
  // -------------------------------------------------------------------------

  /** [L56] `default="0"`, therefore never absent. */
  public getPrice(): Money {
    return this.price;
  }

  /** [L56] — the cascade memo is deliberately NOT cleared; see the note above. */
  public setPrice(price: Money): void {
    this.price = price;
    this.livePriceMemo = undefined;
  }

  /** [L57] `default="0"`, therefore never absent. */
  public getRenewalPrice(): Money {
    return this.renewalPrice;
  }

  /** [L57] — the cascade memo is deliberately NOT cleared; see the note above. */
  public setRenewalPrice(renewalPrice: Money): void {
    this.renewalPrice = renewalPrice;
    this.livePriceMemo = undefined;
  }

  /**
   * [L58] `length="50"`.
   *
   * The column is read by `Product`'s default-image path, and by two members of
   * this class that ARE ported - {@link Sku.getImagePath} composes a URL from it
   * [model/entity/Sku.cfc:L145-L147] and {@link Sku.setImageFile} writes it. The
   * raw value is exposed unchanged; the interpretation happens in those members,
   * next to the settings they need, not here.
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
   * [L62] the persisted quantity-available-to-sell cache.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L62, L535]: the column is preserved but `getQATS()` [L535],
   * which recomputes it, is OMITTED - it reaches the out-of-scope stock subsystem. This accessor
   * reads the stored figure and computes nothing.
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
   * `true` when this row has never been persisted. A framework member dispatched from
   * [org/Hibachi/HibachiEntity.cfc:L507-L565] rather than declared on `Sku.cfc`, and on the
   * far-side contract of five sibling entities, which call it before wiring a bidirectional
   * association: [model/entity/PromotionQualifier.cfc:L181, L281],
   * [model/entity/PromotionReward.cfc:L239, L339] and [model/entity/PriceGroupRate.cfc:L240].
   */
  public isNew(): boolean {
    return this.newFlag;
  }

  /**
   * The property whose value represents this entity in a listing. [model/entity/Sku.cfc:L809-L811]
   * verbatim - `return "skuCode";` - under the `START: Overridden Methods` banner [L807].
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L810]: the literal is `"skuCode"`, the PERSISTENT property at
   * [L54], and NOT `"skuDefinition"`, even though `skuDefinition` [L119] is the richer
   * human-readable form and `getSkuDefinition()` [L574] exists to compute it. Ported as the literal
   * it is; nothing resolves the named property dynamically, because dynamic property resolution is
   * exactly what this migration removes.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L809]: `noImplicitOverride` is enabled, but this class has no
   * TypeScript base class - the CFML `extends` chain is not ported - so what CFML called an
   * override is a plain method here, as for every other such member on this class.
   */
  public getSimpleRepresentationPropertyName(): string {
    return 'skuCode';
  }

  // ASSOCIATION ACCESSORS - THE LIVE-ARRAY RULE IS ABSOLUTE, AND HERE IS THE PROOF. Five sibling
  // entities own the far side of an association with `Sku` and mutate, in place, the very array
  // this class hands back:
  //
  //   [model/entity/PriceGroupRate.cfc:L243, L251-L253] -> getPriceGroupRates()
  //   [model/entity/PromotionReward.cfc:L243, L251-L253] -> getPromotionRewards()
  //   [model/entity/PromotionReward.cfc:L343, L351-L353] -> getPromotionRewardExclusions()
  //   [model/entity/PromotionQualifier.cfc:L185, L193-L195] -> getPromotionQualifiers()
  //   [model/entity/PromotionQualifier.cfc:L285, L293-L295] -> getPromotionQualifierExclusions()
  //   [model/entity/SkuCurrency.cfc] -> getSkuCurrencies()
  //   [model/entity/Option.cfc:L127, L131] -> addOption() / removeOption()
  //
  // A DEFENSIVE COPY, SPREAD, FROZEN ARRAY OR `readonly` VIEW FROM ANY OF THESE SILENTLY BREAKS
  // BIDIRECTIONAL REMOVAL ON FIVE SIBLINGS: the far side would delete from a throwaway. The CFML
  // collection-contains test resolves through Hibernate session identity, primary-key equality for
  // a managed entity, so the ported `has*` probes compare BY PRIMARY KEY. And CFML `arrayFind` is
  // 1-BASED, returning `0` when absent, which is why every legacy site reads `if(index > 0)`;
  // `findIndex` is 0-BASED and returns `-1`, so carrying `> 0` over would SILENTLY DROP THE FIRST
  // ELEMENT. Every removal tests `!== -1`.

  /**
   * The owning product [L65]. `Product | undefined` because `removeProduct()` [L618] executes
   * `structDelete(variables, "product")`; a refinement of the legacy `any`, not a widening.
   */
  public getProduct(): Product | undefined {
    return this.product;
  }

  /**
   * The options that define this sku [L76]. LIVE ARRAY REFERENCE - [model/entity/Option.cfc:L127]
   * and [L131] route `Option.addSku` / `Option.removeSku` back through {@link Sku.addOption} and
   * {@link Sku.removeOption}, which mutate this array in place.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L885, L914, L951, L980]: the promotion engine
   * passes this array into the four `hasAnyOption`/`hasAnyExcludedOption` probes, which live on the
   * promotion entities - NOT on `Sku` - and compare BY `optionID` through the implicit
   * collection-contains of [org/Hibachi/HibachiEntity.cfc:L340-L350]. `Sku`'s only obligation is to
   * expose the collection they read.
   */
  public getOptions(): Option[] {
    return this.options;
  }

  /**
   * The per-currency price override rows [L72]. LIVE ARRAY REFERENCE - `SkuCurrency.setSku` appends
   * to it directly, and STEP 2 OF THE CASCADE ITERATES IT [L399-L414].
   */
  public getSkuCurrencies(): SkuCurrency[] {
    return this.skuCurrencies;
  }

  /**
   * The price-group rates that name this sku [L86]. LIVE ARRAY REFERENCE; FAR-SIDE OBLIGATION
   * proven by [model/entity/PriceGroupRate.cfc:L243, L251, L253], which deletes from this exact
   * array.
   */
  public getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * The promotion rewards that include this sku [L82]. LIVE ARRAY REFERENCE; far-side obligation
   * proven by [model/entity/PromotionReward.cfc:L243, L251, L253].
   */
  public getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * The promotion rewards that exclude this sku [L83]. LIVE ARRAY REFERENCE; far-side obligation
   * proven by [model/entity/PromotionReward.cfc:L343, L351, L353].
   */
  public getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /**
   * The promotion qualifiers that include this sku [L84]. LIVE ARRAY REFERENCE; far-side obligation
   * proven by [model/entity/PromotionQualifier.cfc:L185, L193, L195].
   */
  public getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * The promotion qualifiers that exclude this sku [L85]. LIVE ARRAY REFERENCE; far-side obligation
   * proven by [model/entity/PromotionQualifier.cfc:L285, L293, L295].
   */
  public getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  // FRAMEWORK-DISPATCHED PROBES. None is declared in `Sku.cfc`; each is generated at runtime by the
  // eleven-pattern dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565] - `hasUniqueOrNull*`,
  // `hasUnique*`, `hasAny*`, `get*AssignedIDList`, `get*ID`, `get*Options`, `get*OptionsSmartList`,
  // `get*SmartList`, `get*Struct`, `get*Count`, then a `getAttributeValue` fallback at [L559],
  // terminating in a throw at [L565].
  //
  // TYPESCRIPT MUST NOT EMULATE DYNAMIC DISPATCH: no `Proxy`, no index signature, no `arguments`
  // struct emulation, no `evaluate()`, no `variables.` scope emulation. Only concretely-called
  // patterns are authored, each carrying its dispatch locator.
  //
  // `Sku` is one of only FOUR entities that could reach the [L559] EAV fallback - that branch needs
  // `hasProperty("attributeValues")`, declared only by `Sku` [L70], `Product`
  // [model/entity/Product.cfc:L75], `ProductType` [model/entity/ProductType.cfc:L67] and `Brand`
  // [model/entity/Brand.cfc:L60]; for the other fourteen an unmatched `get...` throws at [L565].
  // The EAV path is not ported, so the fallback is unreachable by construction.

  /**
   * `true` when `option` is already among this sku's options; compares by `optionID`. Relied on by
   * {@link Sku.addOption} and, transitively, by [model/entity/Option.cfc:L127].
   */
  public hasOption(option: Option): boolean {
    const optionID = option.getOptionID();
    return this.options.some((held: Option) => held.getOptionID() === optionID);
  }

  /** Compares by `skuCurrencyID`; called on the far side by `SkuCurrency.setSku`. */
  public hasSkuCurrency(skuCurrency: SkuCurrency): boolean {
    const skuCurrencyID = skuCurrency.getSkuCurrencyID();
    return this.skuCurrencies.some(
      (held: SkuCurrency) => held.getSkuCurrencyID() === skuCurrencyID,
    );
  }

  /**
   * FAR-SIDE OBLIGATION - called as `arguments.sku.hasPriceGroupRate(this)` at
   * [model/entity/PriceGroupRate.cfc:L243]. Compares by `priceGroupRateID`; `false` when empty.
   */
  public hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const priceGroupRateID = priceGroupRate.getPriceGroupRateID();
    return this.priceGroupRates.some(
      (held: PriceGroupRate) => held.getPriceGroupRateID() === priceGroupRateID,
    );
  }

  /** FAR-SIDE OBLIGATION - [model/entity/PromotionReward.cfc:L242]. By `promotionRewardID`. */
  public hasPromotionReward(promotionReward: PromotionReward): boolean {
    const promotionRewardID = promotionReward.getPromotionRewardID();
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === promotionRewardID,
    );
  }

  /** FAR-SIDE OBLIGATION - [model/entity/PromotionReward.cfc:L342]. By `promotionRewardID`. */
  public hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const promotionRewardID = promotionReward.getPromotionRewardID();
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === promotionRewardID,
    );
  }

  /** FAR-SIDE OBLIGATION [model/entity/PromotionQualifier.cfc:L184]. By ID. */
  public hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const promotionQualifierID = promotionQualifier.getPromotionQualifierID();
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === promotionQualifierID,
    );
  }

  /** FAR-SIDE OBLIGATION [model/entity/PromotionQualifier.cfc:L284]. By ID. */
  public hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const promotionQualifierID = promotionQualifier.getPromotionQualifierID();
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === promotionQualifierID,
    );
  }

  // BIDIRECTIONAL HELPER METHODS. [model/entity/Sku.cfc:L601-L751].
  //
  // THE `remove*` INVERSION CROSS-CHECK. [model/entity/Option.cfc:L129-L131] and [L145-L147] carry
  // a real inversion defect - two `remove*` methods that call `add*` on the far side - so all
  // THIRTEEN `remove*` helpers declared in `Sku.cfc` (L610, L628, L643, L651, L659, L667, L675,
  // L683, L691, L699, L712, L732, L747) were read verbatim and checked. THIRTEEN CLEAN, ZERO
  // INVERTED: nothing is preserved under a defect marker here and no divergence is spent on one.
  // Six are in scope and authored below; the other seven target out-of-scope entities and are
  // DROPPED with a note.
  //
  // `addOption`/`removeOption` are absent from that count because `Sku.cfc` declares no
  // hand-written helper for `options`; the ORM generated them from
  //   `fieldtype="many-to-many" singularname="option"`
  // at [L76], and [model/entity/Option.cfc:L127, L131] call them by name.

  /**
   * Attaches this sku to a product, wiring both sides. [model/entity/Sku.cfc:L604-L608].
   *
   * The `isNew() or !arguments.product.hasSku(this)` short-circuit is preserved exactly: a
   * brand-new sku is appended WITHOUT the containment probe, which is how the legacy avoided
   * probing against an unsaved key.
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
   * The omitted-argument default (`if(!structKeyExists(arguments, "product"))`) is reproduced as an
   * optional parameter, and `structDelete(variables, "product")` by assigning `undefined` - NEVER
   * by `delete this.product`, because `exactOptionalPropertyTypes` makes assignment the checkable
   * form.
   *
   * `index > 0` BECOMES `!== -1`: the legacy test is correct for a 1-based `arrayFind`, but carried
   * over literally against a 0-based `findIndex` it would refuse to remove a product's FIRST sku.
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
   * `arguments.sku.addOption(this)`. `Sku` is the OWNING side of `SwSkuOption`, so this side holds
   * the array; guarded by {@link Sku.hasOption} so the link table cannot acquire a duplicate row.
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
   * LEGACY-NOTE [model/entity/Sku.cfc:L501, L513, L525, L576]: the legacy component never
   * invalidates these memos, because a CFML request was short enough that a sku's options did not
   * change underneath them. Instances stay request-scoped here for the same reason, and
   * invalidating on mutation is strictly safer without changing any answer the legacy could produce
   * in one request.
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
   * The one-to-many is `inverse="true"` [L72], so the far side owns the foreign key and this helper
   * delegates rather than appending. Verdict: CLEAN.
   */
  public addSkuCurrency(skuCurrency: SkuCurrency): void {
    skuCurrency.setSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L659-L661] — `arguments.skuCurrency.removeSku( this )`.
   *
   * Verdict: CLEAN — it calls `removeSku`, not `setSku`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L656-L661, L368]: neither helper clears
   * `variables.currencyDetails` in the legacy, so neither clears the cascade memo
   * here. The reasoning is the one recorded at the three money setters, and it
   * applies with more force to this pair: the collection these helpers maintain is
   * Step 2's own input [L399-L414], so clearing the memo without a way to refill
   * it would silently drop every per-currency override the sku had.
   */
  public removeSkuCurrency(skuCurrency: SkuCurrency): void {
    skuCurrency.removeSku(this);
  }

  /** [model/entity/Sku.cfc:L672-L674] — `arguments.promotionReward.addSku( this )`. */
  public addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L675-L677] — `arguments.promotionReward.removeSku( this )`. Verdict:
   * CLEAN.
   */
  public removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L680-L682] — `arguments.promotionReward.addExcludedSku( this )`.
   *
   * Note the parameter name in the legacy source is `promotionReward`, not
   * `promotionRewardExclusion`: the exclusion is a role on the same entity, not a separate one.
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
   * [model/entity/Sku.cfc:L691-L693] — `arguments.promotionQualifier.removeSku( this )`. Verdict:
   * CLEAN.
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
  // OPTION METHODS [model/entity/Sku.cfc:L231-L253] and the two struct accessors at [L500-L522]
  //
  // A BANNER WART WORTH RECORDING. `Sku.cfc` mixes TWO banner styles. The long form -
  //   `// ===== START: Custom Validation Methods =====` -
  // appears at [L753], [L786], [L788], [L790], [L792], [L876], [L878], [L880], [L882] and [L912]. A
  // SHORT form appears at EIGHT sites: [L128]
  //   (`// START: Image Methods`),
  // [L229], [L231] (`// START: Option Methods`), [L253], [L255], [L287], [L289] and [L317]. NO
  // OTHER IN-SCOPE ENTITY USES THE SHORT FORM, and enumerations reporting four short-form sites are
  // undercounting. It is recorded and it is NOT normalised.
  // =========================================================================

  /**
   * The option names, joined by a caller-supplied delimiter. [model/entity/Sku.cfc:L233-L239], with
   * the `delimiter=" "` default preserved, over the THREE-ARGUMENT
   *   `listAppend(list, value, delimiter)`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L233 versus L885]: this method is a NON-DEPRECATED
   * near-duplicate of `displayOptions()` [L885-L891], which sits in the Deprecated Methods section
   * carrying `// @hint: USE skuDefinition()`. The two bodies differ only in their local variable
   * name. Both are ported, in their respective sections, because both are on the public surface.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L236]: the ported `Option.getOptionName()` is
   *   `string | undefined`
   * because the column carries no default, and the legacy passes it straight into `listAppend` with
   * no null check. `model/validation/Option.json` declares `optionName` as
   * `{"contexts":"save","required":true}`, so the absent branch is unreachable for validated data.
   * `''` is substituted rather than raising, because an empty element keeps the element COUNT
   * correct and a raise in a display helper would be harsher than the legacy.
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
   * [model/entity/Sku.cfc:L241-L245]. THIS ONE IS CLEAN: it guards the ID struct and reads the ID
   * struct with an ID key. Contrast {@link Sku.getOptionByOptionGroupCode} directly below, which is
   * not.
   *
   * There is no `else`, so a miss yields nothing — refined from the legacy `any` to
   *   `Option | undefined`.
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
   * an ID-keyed map, so the method always yields nothing.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * WHY THIS IS PRESERVED WHILE THE TWO STRUCT DEFECTS ARE FIXED: this mismatch IS observable
   * through the public contract - a caller asking for an option by group code gets nothing back -
   * so it does not qualify for the unobservable-divergence justification.
   *
   * A COLLATERAL CONSEQUENCE, RECORDED AND NOT REPAIRED: in the legacy the miss is incidental,
   * since the ID struct is permanently empty anyway. With that struct genuinely populated the miss
   * becomes DETERMINISTIC - it now misses precisely because a code is not an ID. The observable
   * answer is unchanged; only the reason is.
   *
   * `noUncheckedIndexedAccess` already types the lookup as `Option | undefined`. No `!`, no
   * fallback.
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
   * DELIBERATE DIVERGENCE [model/entity/Sku.cfc:L500-L510]: the body guards, populates and returns
   * `variables.optionsByOptionGroupCodeStruct`, but its initialisation at [L502] targets the wrong
   * member:
   *
   *   variables.optionsByOptionGroupIDStruct = {};                      // <- WRONG KEY
   *
   * Two consequences follow, and the second is the serious one. The code struct is never
   * initialised, so [L504]'s `structKeyExists` fails on the first iteration and [L505] creates the
   * struct implicitly by assignment - this method's own answer happens to come out right. But it
   * POISONS THE OTHER MEMO: `variables.optionsByOptionGroupIDStruct` now exists as `{}`, so the
   * guard at [L513] inside `getOptionsByOptionGroupIDStruct()` is false, that method skips its
   * population loop, and it returns an EMPTY MAP for the rest of the request.
   *
   * Fixed because both consequences are unobservable through the public contract - they cause
   * redundant recomputation or a poisoned cache rather than a different intended returned value -
   * and the memos are request-scoped.
   *
   * The inner guard is `if (!exists)`, so THE FIRST option per key wins and a later option sharing
   * an option group is discarded. Key comparison is case-insensitive, matching CFML struct-key
   * semantics.
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
        // Case-insensitive existence, as CFML struct keys are — the first option per option group
        // wins [L504].
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
   * DELIBERATE DIVERGENCE [model/entity/Sku.cfc:L512-L522]: the guard [L513], the initialisation
   * [L514], the inner existence test [L516] and the return [L521] all use
   * `optionsByOptionGroupIDStruct`, but the write at [L517] targets a different member entirely:
   *
   *   variables.OptionsByGroupIDStruct[ option.getOptionGroup().getOptionGroupID() ] = option;
   *
   * `OptionsByGroupIDStruct` is not a case variant of `optionsByOptionGroupIDStruct` -
   * `OptionGroup` is missing from it - so the returned map is ALWAYS EMPTY. Fixed because it is
   * unobservable through the public contract: it yields an empty cache rather than a different
   * intended value, and memos are request-scoped.
   *
   * THE COLLISION HAZARD IS RESOLVED: THERE IS NO COLLISION. The deprecated
   * `getOptionsByGroupIDStruct()` [L894-L896] does NOT read the stray target - its body is pure
   * delegation - so `variables.OptionsByGroupIDStruct` is written by [L517] and read by nothing
   * anywhere in the component. A pure dead write, so fixing [L517] cannot disturb any other member.
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
          // `putOwnStructKey`, not `struct[optionGroupID] = option`: the identifier is a
          // persisted `SwOptionGroup.optionGroupID` value, so a malformed row can supply
          // `__proto__` here just as a code or a name can.
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
   * [model/entity/Sku.cfc:L524-L533] verbatim. `listAppend` is PURE and emits NO LEADING DELIMITER
   * on an empty list, which makes the accumulator start at `''` correctly — load-bearing at [L528],
   * and equally at [L760], [L779] and [L888].
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L524]: the legacy declares `returntype="string"` and returns
   * the comma list rather than an array. The list form is preserved for interface parity even
   * though an `Option[]` would be the idiomatic TypeScript answer — the list is what callers pass
   * onward into `getSkusBySelectedOptions`.
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
   * THIS REPLACES THE `onMissingMethod` DISPATCHER OVERRIDE AT [model/entity/Sku.cfc:L857-L873] -
   * the `@hint` is L857 and the declaration L858, NOT L852. The legacy body intercepts every
   * unmatched `get*` call, treats the suffix after `get` as a potential optionGroupID, scans
   * `getOptions()` for a match and returns that option's `optionName`, otherwise delegating to
   * `super.onMissingMethod(...)` at [L872] - which lands in the eleven-pattern dispatcher described
   * in the banner above.
   *
   * THE CFML DYNAMIC FORM IS NOT REPRODUCIBLE AND MUST NOT BE EMULATED: no `Proxy`, no index
   * signature, no `arguments` struct emulation, no `evaluate()`. The typed replacement is
   * compile-checkable and designs out the SHADOWING HAZARD, since the legacy override would return
   * an option name in place of a framework member whenever an optionGroupID equalled a legitimate
   * property suffix.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L866]: the legacy comparison uses CFML `==` on strings, which
   * is CASE-INSENSITIVE. `eqeqeq` forbids `==`, so case-insensitivity is implemented EXPLICITLY
   * through `cfEquals`. Returns the FIRST match's option name, or nothing - refined from the legacy
   * `any`.
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
  // PRICE / CURRENCY METHODS [model/entity/Sku.cfc:L255-L287] plus the cascade at [L360-L433]
  // =========================================================================

  /**
   * The price of this sku under a promotion.
   *
   * LEGACY-DEFECT [model/entity/Sku.cfc:L258]: the body calls
   * `promotionService.calculateSkuPriceBasedOnPromotion`, WHICH DOES NOT EXIST, so every invocation
   * raises.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * THE ABSENCE IS ESTABLISHED, NOT ASSUMED: the name appears nowhere in the non-Hibachi tree nor
   * under `org/Hibachi/`, and `HibachiService.onMissingMethod`
   * [org/Hibachi/HibachiService.cfc:L255-L280] dispatches only `getSmartList`, `get`, `new`,
   * `list`, `save`, `delete`, `count`, `export` and `process`, so a `calculate*` name falls through
   * to that dispatcher's own throw at [L280].
   *
   * TODO [model/entity/Sku.cfc:L258]: this method cannot work until a
   * `calculateSkuPriceBasedOnPromotion` implementation exists on the promotion service. Carried
   * over as a flagged TODO rather than silently completed.
   *
   * THE MISSING METHOD IS NOT INVENTED. No port is injected for [L258] - the ONE locator site of
   * the nineteen that is REMOVED rather than replaced - and nothing is returned or delegated.
   * `never` remains assignable wherever the legacy `numeric` was.
   *
   * @param promotion retained for interface parity - the legacy signature declares it, so the port
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
   * [model/entity/Sku.cfc:L261-L263]. The `getService("priceGroupService")` locator at [L262]
   * becomes the injected resolver. The legacy declares `numeric`, which is `Money` here (E4).
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
   * [model/entity/Sku.cfc:L265-L267]. The locator at [L266] becomes the injected resolver. The
   * legacy declares `any`; the service method it calls, `getRateForSkuBasedOnPriceGroup`
   * [model/service/PriceGroupService.cfc:L140], resolves a rate OR NOTHING, so
   *   `PriceGroupRate | undefined`
   * is the honest refinement.
   *
   * The two service-tier asymmetries this must not smooth over are documented on
   * {@link SkuPriceGroupResolver}: the parent recursion at
   * [model/service/PriceGroupService.cfc:L174] calls the PRODUCT variant rather than the sku
   * variant, and only the `percentageOff` branch at [L316-L340] applies the rounding rule. Both are
   * enforced in the service tier.
   */
  public getAppliedPriceGroupRateByPriceGroup(priceGroup: PriceGroup): PriceGroupRate | undefined {
    if (this.priceGroupResolver === undefined) {
      throw this.missingCollaborator('price-group resolver', 'L266');
    }
    return this.priceGroupResolver.getRateForSkuBasedOnPriceGroup(this, priceGroup);
  }

  /* -------------------------------------------------------------------------
   * THE THREE CURRENCY ACCESSORS [model/entity/Sku.cfc:L269-L285]
   *
   * SUBSTITUTING `0` FOR ANY OF THESE WOULD SILENTLY SELL PRODUCTS FOR FREE. All three return
   * `Money | undefined` - never `0`, no `?? Money.zero`, no `structGet(..., default)`, no `!`. A
   * currency for which no price resolved must be UNPRICED, and an unpriced sku must not be
   * purchasable at zero. The slice's absence conventions are opposite and none may be collapsed
   * into another: UNPRICED here; ZERO in `Product.getSalePrice()`, which falls through to
   *   `return 0`
   * at [model/entity/Product.cfc:L598]; UNLIMITED / FOREVER for promotion use-limits and period
   * bounds.
   *
   * THE SINGLE-VERSUS-DOUBLE CHECK ASYMMETRY IS REPRODUCED, NOT HARMONISED.
   * `getPriceByCurrencyCode` performs ONE `structKeyExists`, on the outer currency key only; the
   * other two perform a SECOND on their sub-key. LEGACY-NOTE [model/entity/Sku.cfc:L270 versus
   * L276, L282]: the asymmetry survives because Step 3 [L425] sets `.price` UNCONDITIONALLY, and
   * where it does not - an override row with a null price - `getPriceByCurrencyCode` reads an
   * absent sub-key and yields nothing anyway. IT IS IN THE SOURCE AND IT STAYS.
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
   * `currencyCode` is a plain `string`, deliberately NOT the branded `CurrencyCode`: branding it
   * would route callers through `toCurrencyCode`, which THROWS on a malformed code, and an
   * exception is not the same answer as "this sku has no price in that currency".
   *
   * Key comparison is case-insensitive through `src/lib/cfml/struct.ts`'s `structKeyExists`.
   */
  public getPriceByCurrencyCode(currencyCode: string): Money | undefined {
    const currencyDetails = this.getCurrencyDetails();
    if (structKeyExists(currencyDetails, currencyCode)) {
      const detail = structGet(currencyDetails, currencyCode);
      // `structKeyExists` has already answered `true`, but the compiler cannot know that from a
      // case-insensitive lookup — so the absent branch is stated rather than asserted away with
      // `!`.
      return detail === undefined ? undefined : detail.price;
    }
    return undefined;
  }

  /**
   * This sku's list price in a given currency, or nothing. [model/entity/Sku.cfc:L275-L279].
   *
   * TWO checks: the outer currency key AND the `listPrice` sub-key. It therefore yields nothing
   * EVEN FOR A CURRENCY PRESENT IN THE MAP that has no list price recorded - a state the cascade
   * genuinely produces, because [L381-L382] create the entry unconditionally while a list price is
   * not always written.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L55-L57 vs L390, L405, L421]: which entries reach that state
   * is schema-driven rather than a translation choice. Legacy L390/L405/L421 each guard their write
   * with `isNull(...)`; in the port the sku's OWN money columns are non-optional - [L55]
   * `listPrice`, [L56] `price` and [L57] `renewalPrice` all declare `default="0"` - while
   * `SwSkuCurrency`'s price columns declare no default and stay `Money | undefined`
   * [model/entity/SkuCurrency.cfc:L53]. So a BASE-currency entry always carries all six sub-keys,
   * and this accessor can only answer `undefined` for (a) a currency absent from the map, or (b) an
   * entry written by Step 2 alone whose row recorded a price but no list price - in which case Step
   * 3's guard on `"price"` ALONE [L416] also skips the conversion that would have supplied one.
   * Both paths are exercised.
   *
   * `structGetPath` is handed {@link CurrencyDetailMoneyView} so its return type is precisely
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
   * {@link Sku.getListPriceByCurrencyCode} — the outer currency key AND the `renewalPrice` sub-key
   * — and with the same two reachable `undefined` paths recorded on that method: an absent
   * currency, or a Step-2-only entry that recorded a price but no renewal price.
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
   * THERE IS NO HARDCODED `"USD"` HERE AND NONE IN `Sku.cfc` EITHER. The default lives in the
   * setting DECLARATION - `skuCurrency = {fieldType="select", defaultValue="USD"}` at
   * [model/service/SettingService.cfc:L221] - and is resolved through the settings port. The
   * cascade is commonly described as an "order -> SKU -> skuCurrency -> USD-default" chain, which
   * invites the literal to be baked in here; that would move a configurable default into compiled
   * code.
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
   * MUST-PRESERVE BEHAVIOUR #3 - THE FOUR-STEP CURRENCY CASCADE. [model/entity/Sku.cfc:L367-L433]
   *
   * Returns the memoised per-currency price map. SYNCHRONOUS, because
   * {@link Sku.getPriceByCurrencyCode} and its two siblings are synchronous and that contract is
   * the acceptance criterion; the asynchronous computation lives in
   * {@link Sku.materializeCurrencyDetails}, which a repository awaits during hydration.
   *
   * ★ A PURE READ, AND THERE IS NO PROTOCOL A CONSUMER CAN GET WRONG. The
   * cascade's own inputs are asynchronous in the target — every
   * `CurrencyConverter` member returns a promise — so the computation cannot live
   * behind this signature. It lives instead behind {@link Sku.hydrate}, the
   * hydration boundary, and the method that performs it is PRIVATE. A `Sku` that
   * reaches the domain has therefore already been through that boundary, which is
   * exactly what `src/domain/ports/currencyConverter.ts` states from the other
   * side: the map is "materialised during entity hydration, before the domain
   * ever sees the SKU". This method publishes no ordering requirement of its own,
   * and no consumer has to know one.
   *
   * ★ WHEN IT ANSWERS `{}`, AND WHY THAT IS THE LEGACY'S OWN STATE. [L369] seeds
   * the memo to `{}` and [L373] gates everything that would fill it, so the
   * legacy answers `{}` for any sku whose `skuEligibleCurrencies` setting is
   * empty — and then every accessor yields nothing. `{}` here means the same two
   * things and nothing else: the eligibility gate was closed, or this hydration
   * did not materialise the map at all (a bare instance built for a path that
   * needs no currency-aware price, such as an identifier-only projection). What
   * it can no longer mean is "the map is computable but nobody has asked for it
   * yet" — that state was reachable while the materialiser was a public method a
   * caller had to remember to await, and it is not reachable now.
   *
   * No accessor signature changes, and no accessor ever invents a zero to cover
   * the gap.
   */
  public getCurrencyDetails(): Readonly<Record<string, CurrencyDetail>> {
    return this.currencyDetailsMemo ?? {};
  }

  /**
   * ★★ THE HYDRATION BOUNDARY FOR THE CURRENCY CASCADE.
   *
   * Runs the four-step cascade [model/entity/Sku.cfc:L367-L433] against `sku` and
   * answers the same instance, now carrying its per-currency price map. Every
   * repository read path funnels through here, and nothing else in the target
   * can start the cascade.
   *
   * ★ WHY THIS IS A STATIC FACTORY AND NOT A METHOD ON THE INSTANCE. The cascade
   * is asynchronous in the target and the three accessors that read its result
   * are synchronous by contract [L269-L285], so the two halves cannot share one
   * signature. Publishing the async half as an INSTANCE method would add a
   * protocol the legacy component does not have — a step a caller must perform,
   * in the right order, before three innocuous-looking getters answer honestly —
   * and a missed step would show up as an empty map rather than as an error. A
   * static boundary removes the hazard instead of documenting it:
   * {@link Sku.materializeCurrencyDetails} is PRIVATE, reachable from here
   * because `private` in TypeScript is scoped to the class rather than to the
   * instance, and unreachable from anywhere else.
   *
   * ★ INTERFACE PARITY IS UNAFFECTED (B4). No legacy signature moves.
   * `getCurrencyDetails()` keeps its name, its empty parameter list and its
   * synchronous return; so do all three currency accessors. This member has no
   * legacy counterpart at all — it is the T3 hydration seam, in the same family
   * as the repository row-to-entity factories, not a ported method.
   *
   * IDEMPOTENT, reproducing [L368]'s memo guard: a sku whose map is already
   * present — because it was materialised earlier, or because
   * {@link SkuHydrationInput.currencyDetails} injected it — is returned untouched
   * and no collaborator is called.
   *
   * @param sku the instance to materialise.
   * @param context the batch-resolved cascade inputs. Omitting it makes this
   *   method resolve a context from the sku's OWN injected collaborators, which
   *   is the single-sku path; supplying one is the batch path, and it is how a
   *   repository keeps the invariant part of the cascade to one resolution for a
   *   whole result set. See {@link SkuCurrencyCascadeContext}.
   */
  public static async hydrate(sku: Sku, context?: SkuCurrencyCascadeContext): Promise<Sku> {
    await sku.materializeCurrencyDetails(context);

    return sku;
  }

  /**
   * Resolves the cascade inputs that do not vary from one sku to the next.
   *
   * ★ THIS IS THE BATCH BOUNDARY, AND IT MAKES EXACTLY THREE COLLABORATOR CALLS.
   * Two synchronous settings reads — `skuCurrency` [model/entity/Sku.cfc:L385]
   * and `skuEligibleCurrencies` [L373] — and, only when the gate opens, ONE
   * eligible-currency listing [L371]+[L375]+[L377]. That count is a constant of
   * this method rather than a function of how many skus a caller goes on to
   * build: one context serves a result set of one row and a result set of five
   * hundred identically.
   *
   * ★ AN EXPLICITNESS DECISION, NOT A PERFORMANCE ONE (B7). What it buys is that
   * the collaborator traffic of a hydration is stated in one place a reader can
   * point at. No latency, throughput or availability claim is made here or
   * anywhere else in this file.
   *
   * ★ THE GATE'S POSITION IS PRESERVED EXACTLY, INCLUDING THE PART THAT LOOKS
   * WRONG. [L369] and [L371] sit OUTSIDE the gate — the memo is established and
   * the currency collaborator consulted even when the gate is closed — while
   * [L375]-[L429] sit inside. The listing call is fused with [L375] and therefore
   * placed INSIDE the gate here, which is observationally identical:
   * `getCurrencySmartList()` at [L371] CONSTRUCTS a smart list and executes
   * nothing, and the query does not run until `getRecords()` at [L377], inside
   * the gate. `CurrencyConverter.getCurrenciesByCurrencyCodeList` models
   * [L371]+[L375] as one member and cites that range itself. What still happens
   * outside the gate is the collaborator RESOLUTION that [L371] performs there —
   * the two arguments to this method.
   *
   * @param settingsProvider the settings port, for the two keys named above.
   * @param currencyConverter the currency port, held on the returned context for
   *   Step 3's per-sku conversions.
   */
  public static async resolveCurrencyCascadeContext(
    settingsProvider: SettingsProvider,
    currencyConverter: CurrencyConverter,
  ): Promise<SkuCurrencyCascadeContext> {
    // [L385, L418, L422, L425] and [L373] — resolved once, for every sku that
    // will be built against this context.
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
    if (cfLen(eligibleCurrenciesSetting) === 0) {
      return { eligibilityGateOpen: false };
    }

    // LEGACY-NOTE [model/entity/Sku.cfc:L379, L381, L385, L400, L418, L422, L425,
    // L426]: the legacy iterates Currency ENTITIES and reads `getCurrencyCode()`
    // off each one. `Currency` is out of scope, and every one of those lines reads
    // nothing but the code, so the port answers with currency CODES directly. No
    // behaviour depends on any other Currency member.
    const eligibleCurrencies =
      await currencyConverter.getCurrenciesByCurrencyCodeList(eligibleCurrenciesSetting);

    // LEGACY-NOTE [model/entity/Sku.cfc:L418]: `toCurrencyCode` validates the
    // three-character shape and raises on a malformed value. That is deliberate
    // here and it is NOT the yields-nothing price path: this is the configured
    // base currency of the whole catalogue, so a malformed value is a
    // configuration fault that must surface rather than silently mis-price. It is
    // branded INSIDE the gate because every legacy read of `skuCurrency` is
    // inside it too.
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
   * ★ PRIVATE, AND THAT IS THE POINT. This is the ASYNC HALF of
   * [model/entity/Sku.cfc:L367-L433], and it is reachable only through
   * {@link Sku.hydrate}. It is not a reshaping of any legacy signature:
   * `getCurrencyDetails()` keeps its name, its parameter list and its synchronous
   * return, and this method exists purely because the collaborator it needs is
   * asynchronous in the target. The `CurrencyConverter` port documents the same
   * arrangement from the other side: "the currency-detail map is materialised
   * during entity hydration, before the domain ever sees the SKU" — and keeping
   * this member private is what makes that sentence true rather than aspirational.
   *
   * THE GATE DOES NOT WRAP THE WHOLE BODY, contrary to the common description of this method as
   * "entirely wrapped in `if(len(setting('skuEligibleCurrencies')))`". It OPENS at [L373] and
   * CLOSES at [L430], so [L369] `variables.currencyDetails = {}` and [L371]
   * `getCurrencySmartList()` sit OUTSIDE it and only [L375]-[L429] are inside. The memo is
   * therefore established, and the currency collaborator consulted, on every first call even when
   * the gate is closed.
   *
   * ★ THE INVARIANT INPUTS ARRIVE PRE-RESOLVED. Everything the cascade reads that
   * is the same for every sku — both settings, the eligible-currency listing, the
   * branded base currency — comes in on the {@link SkuCurrencyCascadeContext}.
   * What stays here is the part that is genuinely per-sku: Step 1's reads of this
   * instance's own columns, Step 2's walk of its own `skuCurrencies`, and Step 3's
   * conversions of its own prices. When no context is supplied one is resolved
   * from this instance's own collaborators, which is the single-sku path.
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
   * consulted, on every first call even when the gate is closed. Reproduced in
   * that order, across this method and
   * {@link Sku.resolveCurrencyCascadeContext}: the memo is established HERE,
   * before the gate is consulted at all, and the collaborator resolution happens
   * THERE, before the gate is evaluated.
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
   * neither implementation queries anything.
   * -------------------------------------------------------------------------
   */
  private async materializeCurrencyDetails(context?: SkuCurrencyCascadeContext): Promise<void> {
    // [L368] `if(!structKeyExists(variables, "currencyDetails"))` — the memo
    // guard. A second call is a no-op, exactly as in the legacy.
    if (this.currencyDetailsMemo !== undefined) {
      return;
    }

    /** The writable form of {@link CurrencyDetail}, derived so the two cannot drift apart. */
    type MutableCurrencyDetail = {
      -readonly [K in keyof CurrencyDetail]: CurrencyDetail[K];
    };

    // [L369] OUTSIDE THE GATE — the memo is established first, and it is what
    // this instance answers if the gate turns out to be closed.
    const currencyDetails: Record<string, MutableCurrencyDetail> = {};

    // [L371] OUTSIDE THE GATE — the `getService("currencyService")` locator site,
    // eliminated (T2). A supplied context has already performed this resolution
    // ONCE for the whole batch; without one, this instance's own collaborators
    // are used, which is the single-sku path. Either way the resolution precedes
    // the gate, which is what preserves [L371]'s position relative to [L373].
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

    // ★ STEP 0 — THE ELIGIBILITY GATE [L373], evaluated once per batch in
    // {@link Sku.resolveCurrencyCascadeContext} and carried on the context.
    //
    // WHEN IT IS CLOSED THE MEMO STAYS `{}` AND EVERY `getPriceByCurrencyCode()`
    // YIELDS NOTHING. A port that drops the gate changes behaviour.
    if (cascadeContext.eligibilityGateOpen) {
      // [L375] `addInFilter('currencyCode', setting('skuEligibleCurrencies'))`
      // fused with [L377] `getRecords()`, and both already performed — see the
      // note above and {@link Sku.resolveCurrencyCascadeContext}.
      const { skuCurrencySetting, baseCurrencyCode, eligibleCurrencies, currencyConverter } =
        cascadeContext;

      // [L377] `for(var i = 1; i<=arrayLen(eligibleCurrencySL.getRecords()); i++)`
      for (const thisCurrency of eligibleCurrencies) {
        // [L381-L382] EVERY ELIGIBLE CURRENCY GETS AN ENTRY, UNCONDITIONALLY, BEFORE ANY PRICE IS
        // CONSIDERED, WITH `skuCurrencyID` SEEDED TO `""`. So the OUTER map key always exists for
        // every eligible currency even when no price is ever recorded, and only SUB-keys can be
        // absent - which is the whole reason the three accessors at [L269-L285] are asymmetric.
        //
        // NOTHING HERE PRE-SEEDS A PRICE SUB-KEY, with a zero or with `undefined`. Under
        // `exactOptionalPropertyTypes` an absent sub-key and a sub-key holding `undefined` are
        // different types, and [L416] tests `structKeyExists`, so installing `undefined` would
        // SUPPRESS Step 3.
        const detail: MutableCurrencyDetail = { skuCurrencyID: '' };
        currencyDetails[thisCurrency] = detail;

        // ═══
        // STEP 1 [L385-L397] — THE SKU'S OWN COLUMNS, FOR THE BASE CURRENCY
        //
        // LEGACY-NOTE [model/entity/Sku.cfc:L385]: the legacy comparison is CFML `eq`, which is
        // CASE-INSENSITIVE. `eqeqeq` forbids the loose operators here, so case-insensitivity is
        // implemented EXPLICITLY through `cfEquals` rather than inherited from the operator.
        if (cfEquals(thisCurrency, skuCurrencySetting)) {
          // [L386-L389] `if(!isNull(getRenewalPrice()))`.
          //
          // LEGACY-NOTE [model/entity/Sku.cfc:L386, L390, L417, L421]: these four `isNull` guards
          // are STATICALLY SATISFIED in the target, because [L55-L57] declare `default="0"` on all
          // three money columns so they can never be null. The guards are recorded here and the
          // writes are unconditional — precisely the behaviour the defaults produce in the legacy
          // too. Contrast Step 2, whose guards read `SkuCurrency` columns that have NO default and
          // therefore survive as real runtime checks.
          detail.renewalPrice = this.renewalPrice;
          detail.renewalPriceFormatted = Sku.formatCurrency(this.renewalPrice);

          // [L390-L393]
          detail.listPrice = this.listPrice;
          detail.listPriceFormatted = Sku.formatCurrency(this.listPrice);

          // [L394-L395] — `price` is written UNCONDITIONALLY, with no guard of any kind in the
          // legacy source.
          detail.price = this.price;
          detail.priceFormatted = Sku.formatCurrency(this.price);

          // [L396]
          detail.converted = false;
        }

        // ═══
        // STEP 2 [L399-L414] — PER-CURRENCY OVERRIDE ROWS FROM `SwSkuCurrency`
        //
        // THERE IS NO `break`. The legacy loop runs to completion, so WHEN MULTIPLE `SwSkuCurrency`
        // ROWS SHARE A CURRENCY CODE THE LAST MATCH WINS. Reproduced exactly.
        //
        // LEGACY-DEFECT [model/entity/Sku.cfc:L399-L414]: the absence of a `break` makes the
        // winning override row depend on row order, which no `ORDER BY` fixes.
        //
        // Preserved deliberately; do not fix without a product decision.
        //
        // These values OVERWRITE anything Step 1 wrote.
        for (const skuCurrency of this.skuCurrencies) {
          // LEGACY-NOTE [model/entity/Sku.cfc:L400]: CFML `eq`, case-insensitive — implemented
          // explicitly, as at [L385].
          if (!cfEquals(skuCurrency.getCurrencyCode(), thisCurrency)) {
            continue;
          }

          // [L401-L404] A GENUINE runtime guard: `SkuCurrency.renewalPrice`
          // [model/entity/SkuCurrency.cfc] declares NO default, so it really can be null.
          const overrideRenewalPrice = skuCurrency.getRenewalPrice();
          // LEGACY-NOTE: `isNullish` carries the CFML `isNull()` semantics - null AND undefined
          // both count - but it returns a plain boolean rather than a type predicate, so the
          //   `!== undefined`
          // conjunct is what narrows the type for the compiler. Neither is redundant.
          if (!isNullish(overrideRenewalPrice) && overrideRenewalPrice !== undefined) {
            detail.renewalPrice = overrideRenewalPrice;
            detail.renewalPriceFormatted = Sku.formatCurrency(overrideRenewalPrice);
          }

          // [L405-L408] Likewise genuine.
          const overrideListPrice = skuCurrency.getListPrice();
          // Same pairing as the renewal-price guard above.
          if (!isNullish(overrideListPrice) && overrideListPrice !== undefined) {
            detail.listPrice = overrideListPrice;
            detail.listPriceFormatted = Sku.formatCurrency(overrideListPrice);
          }

          // [L409-L410] The legacy writes `price` here with NO guard:
          //
          //   variables.currencyDetails[...].price = getSkuCurrencies()[c].getPrice();
          //
          // LEGACY-NOTE [model/entity/Sku.cfc:L409]: CFML CANNOT STORE NULL IN A STRUCT KEY, so
          // when an override row's `price` is null the assignment leaves the sub-key ABSENT rather
          // than storing a null. That is not a detail — it is what allows Step 3's
          // `structKeyExists(entry, "price")` test at [L416] to pass and convert for that currency.
          // The sub-key is therefore written only when the override price is present, which
          // reproduces the legacy outcome precisely.
          const overridePrice = skuCurrency.getPrice();
          // `isNullish` carries CFML `isNull()` semantics; the `!== undefined` conjunct narrows the
          // type - see the note on the renewal-price guard above.
          if (!isNullish(overridePrice) && overridePrice !== undefined) {
            detail.price = overridePrice;
            detail.priceFormatted = Sku.formatCurrency(overridePrice);
          }

          // [L411-L412] Both UNCONDITIONAL in the legacy, and both hold non-null values, so both
          // are written even when the override price was null. The consequence is real and is
          // reproduced: such an entry carries `converted = false` and a non-empty `skuCurrencyID`,
          // and then Step 3 fires and overwrites `converted` to `true`.
          detail.converted = false;
          detail.skuCurrencyID = skuCurrency.getSkuCurrencyID();
        }

        // ═══
        // STEP 3 [L416-L428] — ON-THE-FLY CONVERSION
        //
        // THE GUARD IS ON `"price"` ALONE:
        //
        //   if(!structKeyExists(variables.currencyDetails[ ... ], "price")) {
        //
        // LEGACY-DEFECT [model/entity/Sku.cfc:L416]: because the guard tests only `price`, a
        // currency for which Step 1 or Step 2 set a price SKIPS STEP 3 ENTIRELY — including its
        // `listPrice` and `renewalPrice` conversions. So a currency with a base or override price
        // but no list price gets NO converted list price either, and `getListPriceByCurrencyCode`
        // yields nothing for it.
        //
        // Preserved deliberately; do not fix without a product decision.
        //
        // Note the mirror image: when Step 3 DOES run it overwrites whatever
        // `listPrice`/`renewalPrice` Step 2 may have set. Also reproduced.
        //
        // The legacy comment at [L415] reads `// Use a conversion mechinism` — the misspelling is
        // preserved here rather than corrected.
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

    // [L369]/[L432] — the memo is seeded whether or not the gate opened, which makes a closed gate
    // answer `{}` instead of re-running on every call.
    this.currencyDetailsMemo = currencyDetails;
  }

  /**
   * The root of this sku's product-type path.
   *
   * [model/entity/Sku.cfc:L356-L358] — `return getProduct().getBaseProductType();`, pure
   * delegation.
   *
   * ASYNC, because `Product.getBaseProductType()` is asynchronous in the target: it is
   * `listFirst(productTypeIDPath)`, the ROOT element of the materialised path, and resolving that
   * path reaches the repository. THE DEPENDENCY MODULE WINS over any description of this method as
   * synchronous — a synchronous signature here would simply not compile against `product.ts`.
   *
   * LEGACY-NOTE [model/validation/Product.json]: `baseProductType` sits on a live validation path —
   * the schema gates it with `inList` over `"merchandise"` and `"subscription"` — so its exact
   * value matters beyond this file.
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
   * T6 - AMBIENT STATE REPLACED BY AN EXPLICIT CONTEXT, WITHOUT WIDENING THE SIGNATURE. The legacy
   * service method reads the requesting account from the request scope, through the anomalous
   * `getSlatwallScope()` [model/service/PriceGroupService.cfc:L262-L268] while the rest of the
   * codebase uses `getHibachiScope()`. Both are eliminated: the account arrives as a
   * {@link CurrentAccountContext} injected through THE CONSTRUCTOR, and this method still takes NO
   * PARAMETER.
   *
   * That placement is deliberate. A `context` parameter would widen an entity-layer signature,
   * which this port does not do, and it would break `product.ts`, which calls
   * `defaultSku.getCurrentAccountPrice()` with no arguments. Constructor injection satisfies T6 in
   * full: there is no ambient read anywhere in the call chain. `src/lib/config.ts` is static
   * process configuration and is NEVER used as a request scope.
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
   * LEGACY-NOTE [model/entity/Sku.cfc:L443]: CFML `==` on strings is CASE-INSENSITIVE, so the
   * comparison goes through `cfEquals`. The two chained dereferences are unguarded in the legacy
   * and raise when either is absent; that is reproduced rather than softened into `false`, because
   * a sku whose product has no default sku is a data fault and answering `false` would hide it.
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
   * `prices[1]` taken. The candidates and their order are preserved; `prices[1]` after an ascending
   * sort IS the minimum, so the port takes the minimum directly rather than sorting a three-element
   * array.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L492]: `arraySort(prices, "numeric", "asc")` is a
   * FLOATING-POINT comparison of currency values, while the target compares through
   * `Money.compare`, which is exact decimal comparison. Selecting a minimum is order-insensitive,
   * so the answer is identical except where two candidates differ only below float precision - a
   * case in which the legacy result was arbitrary anyway. No float arithmetic touches currency in
   * this port.
   *
   * ASYNC because `getCurrentAccountPrice()` is.
   */
  public async getLivePrice(): Promise<Money> {
    if (this.livePriceMemo === undefined) {
      // [L485] the array is seeded with the base price, then [L488] the sale price and [L489] the
      // current-account price are appended, in that order.
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
  // NON-PERSISTENT PROPERTY METHODS — SALE PRICE [model/entity/Sku.cfc:L539-L565]
  // =========================================================================

  /**
   * The winning sale-price detail row for this sku, or nothing. [model/entity/Sku.cfc:L539-L544] -
   * a memoised `getProduct().getSkuSalePriceDetails( getSkuID() )`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L541]: the product's ported `getSkuSalePriceDetails` is
   * ASYNCHRONOUS, being backed by the common-table-expression rewrite of the query-of-queries chain
   * at [model/dao/PromotionDAO.cfc:L544-L588]. Making this accessor async would cascade onto
   * `getSalePrice()`, `getSalePriceDiscountType()` and `getSalePriceExpirationDateTime()`, whose
   * synchronous contracts `product.ts` depends on, so the detail row is pre-materialised during
   * hydration and read synchronously here - the same technique as the currency cascade.
   *
   * `undefined` where the legacy answers an empty struct: the three readers below each test for
   * their key before reading it, so absence and an empty struct are indistinguishable to every
   * caller.
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
   * NOTE THE CONTRAST WITH THE CURRENCY ACCESSORS. Here a fallback IS correct — the legacy declares
   * it explicitly at [L550] — whereas `getPriceByCurrencyCode` has no fallback at all. The two
   * conventions sit fifty lines apart in the same component and mean opposite things. Neither is
   * copied onto the other.
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
   *
   * [model/entity/Sku.cfc:L553-L558]. `''` on absence, exactly as [L557] returns it — NOT
   * `undefined`, because callers concatenate and compare this value as a string.
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
   * [model/entity/Sku.cfc:L560-L565]. The union `Date | ''` is faithful: [L562] returns a timestamp
   * and [L564] returns an empty string, and CFML's `any` return type permitted both. Collapsing it
   * to `Date | undefined` would change what a caller sees.
   *
   * UTC, per the file-level policy.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L614-L622]: the corresponding product accessor is spelled
   * `getSalePricExpirationDateTime` — missing the `e` in "Price". That typo is on `product.ts`'s
   * surface, not this one; it is recorded here so the difference in spelling between the two is
   * understood to be legacy rather than a porting error.
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
   * `skuService.getSkuStocksDeletableFlag`, which is NOT among the seven members of the SKU
   * repository port - `getTransactionExistsFlag` [model/dao/SkuDAO.cfc:L53], `getSkuBySkuCode`
   * [L102], `getSkusBySelectedOptions` [L107], `searchSkusByProductType` [L130], `getProductSkus`
   * [L150], `getSortedProductSkusID` [L172] and `saveSku` - so the call cannot resolve.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * TODO [model/entity/Sku.cfc:L569]: this method cannot work until a stocks-deletable query exists
   * on the SKU repository port. Flagged rather than completed.
   *
   * NO MEMBER IS ADDED TO THE PORT AND NO IMPLEMENTATION IS INVENTED. A hardcoded `true` would
   * authorise deleting stock records that may be referenced; a hardcoded `false` would silently
   * block a legitimate delete. Both are worse than an explicit refusal, so this follows the DEFECT
   * 16 precedent: a throwing stub naming exactly what is missing. `never` is the honest type of a
   * body that cannot produce a value and remains assignable wherever the legacy `boolean` was
   * expected.
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
   * LEGACY-DEFECT [model/entity/Sku.cfc:L583]: `trim(variables.skuDefinition);` IS A BARE STATEMENT
   * WHOSE RETURN VALUE IS DISCARDED. `trim` in CFML is pure, so the leading space that [L581]
   * prepends to every element IS NEVER REMOVED, and every merchandise definition begins with a
   * space, as does each comma-separated element after the first.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * `.trim()` is NOT called, and `listAppend` passes the element through verbatim.
   *
   * THE `contentAccess` BRANCH IS GENUINELY EMPTY IN THE SOURCE [L577-L578], so the definition
   * stays `""` for a content-access sku; that is not an omission by this port.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L584-L585]: the `subscription` branch reads
   * `getSubscriptionTerm().getSubscriptionTermName()` and the JavaRB key
   * `rbKey('entity.subscriptionTerm')`. `SubscriptionTerm` is out of scope - collapsed here to
   * `subscriptionTermID` - and JavaRB is not ported, so the branch is REFUSED rather than faked.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L577, L579, L584]: the three comparisons are CFML `eq`,
   * CASE-INSENSITIVE, so they go through `cfEquals`. `getBaseProductType()` can answer nothing, in
   * which case no branch matches and the definition stays `""` - also what CFML does, since `eq`
   * against a null left operand compares against the empty string. ASYNC because
   * `getBaseProductType()` is.
   */
  public async getSkuDefinition(): Promise<string> {
    if (this.skuDefinitionMemo === undefined) {
      // [L576] seeded to `""`, and it stays `""` when no branch matches.
      let skuDefinition = '';
      const baseProductType = await this.getBaseProductType();

      if (baseProductType !== undefined && cfEquals(baseProductType, 'contentAccess')) {
        // [L577-L578] — the branch is EMPTY in the source. Nothing to do, and nothing invented.
        skuDefinition = '';
      } else if (baseProductType !== undefined && cfEquals(baseProductType, 'merchandise')) {
        for (const option of this.options) {
          const optionGroup = Sku.requireOptionGroup(option, 'L581');
          const optionGroupName = optionGroup.getOptionGroupName() ?? '';
          const optionName = option.getOptionName() ?? '';
          // [L581] — the element begins with a SPACE, deliberately, and the delimiter is a comma.
          // Both are reproduced character for character.
          skuDefinition = listAppend(skuDefinition, ` ${optionGroupName}: ${optionName}`, ',');
        }
        // [L583] `trim(variables.skuDefinition);` — the discarded result. The statement is
        // intentionally NOT written here, because writing `skuDefinition.trim()` without assigning
        // it would be dead code that a linter removes, and writing
        //   `skuDefinition = skuDefinition.trim()`
        // would FIX the defect. The absence is the port; this comment is the record of it.
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
   * [model/entity/Sku.cfc:L592-L597] verbatim. The `getService("skuService")` locator at [L594]
   * becomes the injected repository, and unlike [L569] the member GENUINELY EXISTS on the port —
   * `getTransactionExistsFlag`, backed by [model/dao/SkuDAO.cfc:L53].
   *
   * ASYNC, because the repository member is. The legacy passes `skuID` only, so the `productID`
   * parameter of the port member is left unsupplied.
   */
  public async getTransactionExistsFlag(): Promise<boolean> {
    if (this.transactionExistsFlagMemo === undefined) {
      if (this.skuRepository === undefined) {
        throw this.missingCollaborator('sku repository', 'L594');
      }
      // [L594] `getTransactionExistsFlag( skuID=this.getSkuID() )` — named argument, so `productID`
      // is genuinely absent rather than empty.
      this.transactionExistsFlagMemo = await this.skuRepository.getTransactionExistsFlag(
        undefined,
        this.skuID,
      );
    }
    return this.transactionExistsFlagMemo;
  }

  // =========================================================================
  // IMAGE METHODS — TWO PORTED, THREE REFUSED
  // [model/entity/Sku.cfc:L128-L229], under the SHORT-FORM banner pair
  // [L128]/[L229]
  //
  // ★ WHERE THE LINE FALLS, AND WHY IT IS NOT "THE IMAGE SUBSYSTEM IS OUT OF
  // SCOPE, SO ALL OF IT GOES". An earlier revision of this section refused all
  // five members on two grounds, each stated as independently sufficient: that no
  // ambient value behind `productImageDefaultExtension`,
  // `productImageOptionCodeDelimiter` [model/service/SettingService.cfc:L191-L192]
  // or the base image URL is RESOLVABLE from here — the legacy resolves the first
  // two on the PRODUCT [model/entity/Sku.cfc:L135, L138] and the third through the
  // request scope, so none of the three is this entity's to look up; and that the
  // resizer reaches the un-ported `imageService`. BOTH PREMISES ARE TRUE. The
  // first supports nothing.
  //
  // Not being able to RESOLVE an ambient value says nothing about whether this
  // entity may COMPOSE a string once the value has been resolved somewhere that
  // legitimately can. Two of the five members are nothing BUT composition:
  //
  //   [L145-L147] getImagePath()           — three literals and one column
  //   [L131-L139] generateImageFileName()  — two regex replaces over data this
  //                                          entity already holds
  //
  // Neither touches a filesystem, an HTTP request, a renderer or `imageService`.
  // Refusing them relocated the ambient lookups AND THEN DELETED THE BEHAVIOUR
  // AROUND THEM, which inverts the anti-corruption boundary rather than honouring
  // it. This is settled precedent inside this very folder: the identical argument
  // was raised against `Option.getImageDirectory()`
  // [model/entity/Option.cfc:L81-L83] and rejected there for exactly these
  // reasons, with the resolved base arriving through `Option.assetsImageBaseUrl`.
  // The resolved values arrive here the same way, through
  // {@link SkuImageSettingValues}.
  //
  // ★ THE THREE THAT GENUINELY CANNOT BE PORTED, AND WHY EACH IS DIFFERENT.
  //   getImage()             [L149-L151] delegates to `getResizedImage()`, which
  //                          reaches `imageService` at [L189].
  //   getResizedImagePath()  [L192-L219] reaches `imageService` at [L218].
  //   getImageExistsFlag()   [L221-L227] performs a `fileExists` check against
  //                          the server filesystem.
  // An out-of-scope collaborator with no port, and a filesystem this runtime does
  // not have. These stay REFUSALS: the signature exists so `product.ts` — an
  // already-shipped sibling that calls all of `getImagePath()`, `getImage()`,
  // `getResizedImagePath()` and `getImageExistsFlag()` on its default sku —
  // compiles, and the body states why. `never` is assignable to `string` and to
  // `boolean`, so each refusal satisfies its caller's type without an assertion,
  // without `any`, and without fabricating a path a browser would then request.
  // =========================================================================

  /**
   * Generates this sku's default image file name from its product code and its
   * image-bearing options.
   *
   * [model/entity/Sku.cfc:L131-L139] verbatim, preceded by its own hint at
   * [L130] — `Generates the image path based upon product code, and image options
   * for this sku`:
   *
   *   var optionString = "";
   *   for(var option in getOptions()){
   *     if(option.getOptionGroup().getImageGroupFlag()){
   *       optionString &= getProduct().setting('productImageOptionCodeDelimiter')
   *         & reReplaceNoCase(option.getOptionCode(), "[^a-z0-9\-\_]","","all");
   *     }
   *   }
   *   return reReplaceNoCase(getProduct().getProductCode(), "[^a-z0-9\-\_]","","all")
   *     & optionString & ".#getProduct().setting('productImageDefaultExtension')#";
   *
   * ★ IT IS A LIVE PUBLIC MEMBER, NOT A DEAD ONE - AND IT IS NOT THE COMPOSER THE
   * PORTED SERVICE REACHES FOR. Both halves need stating, because an earlier revision of
   * this note asserted only the first and named a caller that has since moved.
   *
   * WHY IT IS PORTED: `generateImageFileName()` is a PUBLIC method of
   * `model/entity/Sku.cfc` [L131-L139], and interface parity at the entity surface is
   * part of the acceptance contract, so omitting it would drop a published member. Its
   * legacy caller is `processProduct_updateDefaultImageFileNames`
   * [model/service/ProductService.cfc:L208-L213], which loops this product's skus and runs
   * `sku.setImageFile( sku.generateImageFileName() )` on each - a process dispatched from
   * `saveProduct` itself [L282] for every NEW product. Omitting the member left that path
   * with nothing to call, which is the gap this member closed.
   *
   * WHY THE PORTED SERVICE COMPOSES ELSEWHERE: this member answers only for a sku
   * HYDRATED WITH its resolved {@link SkuImageSettingValues}, and
   * `ProductService.processProduct_updateDefaultImageFileNames` holds no such values -
   * `productImageOptionCodeDelimiter` and `productImageDefaultExtension` are outside the
   * closed `SettingKey` union, and the service is not the tier that resolves them. It
   * therefore evaluates the image-group filter itself, which needs the entity graph, and
   * delegates the string composition to `ImageStore.generateSkuImageFileName(descriptor)`,
   * the seam that owns the image subsystem and the two settings. BOTH COMPOSERS PRODUCE
   * THE SAME NAME FOR THE SAME SKU - see {@link Sku.setImageFile}, the single landing point
   * for either - and this one is exercised directly by
   * `tests/unit/domain/entities/sku.test.ts`, including the raises below.
   *
   * ⚠ `reReplaceNoCase(x, "[^a-z0-9\-\_]", "", "all")` BECOMES `/[^a-z0-9\-_]/gi`,
   * AND THE `i` FLAG IS LOAD-BEARING. The CFML class lists lower-case `a-z` only,
   * but the NoCase variant folds case, so upper-case letters are KEPT rather than
   * stripped. A literal port to `/[^a-z0-9\-_]/g` would silently delete every
   * capital from a product code — `ABC-1` would become `-1` — so the flag is the
   * difference between a working file name and a broken one. `"all"` is the
   * global flag; the inner `\_` escape is redundant in both dialects and is
   * dropped without effect.
   *
   * ⚠ THE OPTION-GROUP DEREFERENCE AT [L134] IS UNGUARDED IN THE SOURCE AND STAYS
   * UNGUARDED HERE. `option.getOptionGroup()` is a nullable many-to-one
   * [model/entity/Option.cfc:L59] — there is no `notNull="true"` on it — so an
   * option with no group raises in CFML, and raises here. Skipping such an option
   * instead would be a repair, and would silently produce a DIFFERENT file name
   * than the CFML application produces from the same rows while both write into
   * the same `SwSku.imageFile` column.
   *
   * The same reasoning applies to `getProduct()` at [L135] and [L138]: the legacy
   * dereferences it three times without a guard, so an orphaned sku raises.
   *
   * ★★ IT DOES NOT RAISE ON UNMATERIALISED SETTINGS, AND THAT IS THE SOURCE'S OWN
   * BEHAVIOUR RATHER THAN A SOFTENING OF IT. Both values this member reads carry a
   * `defaultValue` in the setting metadata —
   * `productImageDefaultExtension = {fieldType="text",defaultValue="jpg"}`
   * [model/service/SettingService.cfc:L191] and
   * `productImageOptionCodeDelimiter = {fieldType="select", defaultValue="-"}`
   * [model/service/SettingService.cfc:L192] — and `setting()` falls back to that
   * metadata default whenever no configured record answers:
   * `settingDetails.settingValue = getSettingMetaData(arguments.settingName).defaultValue`
   * [model/service/SettingService.cfc:L481-L482]. `setting()` therefore CANNOT fail
   * for either key, so a port that raised on an unmaterialised set would refuse
   * where the source answers. The fallback is applied at the READ SITE because that
   * is exactly where CFML applies it — `setting()` is the thing that defaults — and
   * the mirrored values are the AAP's prescribed treatment for a setting default
   * (§0.4.1, `settingsProvider`: "defaults mirrored from SettingService").
   *
   * Contrast {@link Sku.getImagePath}, which reads
   * `getHibachiScope().getBaseImageURL()` — a scope accessor with NO metadata
   * default — and therefore still raises when it was not materialised. The two
   * members differ because their inputs differ, not because the rule differs.
   *
   * @returns the composed file name, e.g. `ABC-1-RED.jpg`.
   * @throws Error when this sku has no product, or when one of its options has no
   *   option group. Each case names the source locator it reproduces. An
   *   unmaterialised image-setting set is NOT among them; see above.
   */
  public generateImageFileName(): string {
    // [L135], [L138] — three unguarded `getProduct()` dereferences in the source.
    const product = this.product;
    if (product === undefined) {
      throw new Error(
        `Sku '${this.skuID}': generateImageFileName was called on a sku with no product. ` +
          `[model/entity/Sku.cfc:L135] and [L138] dereference getProduct() without a guard, so ` +
          `this raises in CFML too. No file name is fabricated.`,
      );
    }

    // [L132] `var optionString = "";`
    let optionString = '';

    // [L133] `for(var option in getOptions())` — the already-materialised array.
    for (const option of this.options) {
      const optionGroup = option.getOptionGroup();
      if (optionGroup === undefined) {
        // LEGACY-NOTE [model/entity/Sku.cfc:L134]: the source dereferences
        // `option.getOptionGroup()` unconditionally against a nullable
        // many-to-one [model/entity/Option.cfc:L59], so a group-less option
        // raises. Reproduced rather than skipped — skipping would emit a
        // different file name than the CFML application emits for the same rows.
        throw new Error(
          `Sku '${this.skuID}': generateImageFileName reached option ` +
            `'${option.getOptionID()}', which has no option group. ` +
            `[model/entity/Sku.cfc:L134] dereferences getOptionGroup() without a guard against a ` +
            `nullable association [model/entity/Option.cfc:L59], so this raises in CFML too.`,
        );
      }

      // [L134] only image-bearing groups contribute a segment.
      if (optionGroup.getImageGroupFlag()) {
        // [L135] delimiter, then the sanitised option code.
        optionString += `${this.readOptionCodeDelimiter()}${Sku.sanitizeImageNameSegment(option.getOptionCode())}`;
      }
    }

    // [L138] sanitised product code, the accumulated option segments, then a
    // literal `.` and the default extension.
    return `${Sku.sanitizeImageNameSegment(product.getProductCode())}${optionString}.${this.readDefaultImageExtension()}`;
  }

  /**
   * Assigns this sku's default image file name.
   *
   * ⭐ AN ORM-GENERATED SETTER, authored because it is concretely called from
   * in-scope code: `processProduct_updateDefaultImageFileNames`
   * [model/service/ProductService.cfc:L210] runs
   * `sku.setImageFile( sku.generateImageFileName() )` for every sku of the
   * product. The member-generation principle is to author the concretely-called
   * dispatch patterns as explicitly-typed methods and to emulate nothing — no
   * `Proxy`, no index signature, no string-keyed write.
   *
   * PURELY IN MEMORY. The legacy loop writes the column and leaves persistence to
   * whatever save follows; nothing here touches a filesystem, and no image is
   * moved, copied or deleted. The `SwSku.imageFile` column is written by
   * `src/repositories/mysql/mysqlSkuRepository.ts`.
   *
   * ★ THE NAME IT TAKES MAY COME FROM EITHER OF TWO COMPOSERS, AND IT DOES NOT
   * CARE WHICH. `sku.generateImageFileName()` immediately above answers for a sku
   * hydrated with its resolved {@link SkuImageSettingValues};
   * `ImageStore.generateSkuImageFileName(descriptor)` answers for
   * `ProductService.processProduct_updateDefaultImageFileNames`, which holds no
   * such values and delegates the composition to the image subsystem that owns the
   * two settings. Both produce the same name for the same sku, and this setter is
   * the single landing point for it - which is why it stays a plain assignment with
   * no validation: the legacy statement applies none, and adding one here would
   * make the two composers answerable to a rule neither of them was written under.
   *
   * NO MEMO IS INVALIDATED HERE, unlike `setPrice` and its siblings. `imageFile`
   * participates in no currency cascade, no live price and no brand name; the three
   * memos this class holds are all price-derived and none of them reads this
   * column. Clearing them would be harmless and would also be a false signal that
   * they depended on it.
   *
   * @param imageFile - The composed file name. Non-optional: the legacy statement
   *   always assigns a value, `length="50"` is the column's only constraint, and no
   *   length check is added here because the legacy applied none at the assignment.
   */
  public setImageFile(imageFile: string): void {
    this.imageFile = imageFile;
  }

  /**
   * The host-relative path of this sku's default image.
   *
   * [model/entity/Sku.cfc:L145-L147] verbatim:
   *
   *   return "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#";
   *
   * PORTED, NOT REFUSED — see the section banner for the full argument. The body
   * is one interpolation over three literals and one persisted column; the single
   * ambient input, `getHibachiScope().getBaseImageURL()`, is resolved outside the
   * domain and arrives through {@link SkuImageSettingValues}.
   *
   * ⚠ AN ABSENT `imageFile` INTERPOLATES AS AN EMPTY STRING, producing
   * `<base>/product/default/`. That is the reading this port already applies to a
   * null interpolated into a CFML string — `buildProductTypeBreadcrumb` in
   * src/integrations/google/googleFeedRepository.ts contributes an empty name and
   * still emits its separator for exactly the same reason — so it is applied here
   * too rather than being decided twice, differently, in two files. A sku with no
   * image file is a real state: `SwSku.imageFile` is nullable [L58] and only
   * `processProduct_updateDefaultImageFileNames` ever populates it.
   *
   * ⚠ IT RAISES WHEN THE BASE WAS NOT MATERIALISED, and the reasoning is
   * `Option.getImageDirectory()`'s verbatim: the legacy declares
   * `returntype="string"`, interface parity is the acceptance contract, so
   * widening to `string | undefined` is not available — and a default is worse
   * than raising, because an absent base yields `/product/default/`, which is not
   * a marker a caller can detect but a WELL-FORMED WRONG PATH. This is not a
   * legacy failure being reproduced; `getBaseImageURL()` always resolved in CFML.
   * It is the port declining to invent an answer for a state the legacy could not
   * be in.
   *
   * @throws Error when the base image URL was not materialised at hydration.
   */
  public getImagePath(): string {
    const settingValues = this.requireImageSettingValues('getImagePath', 'L145-L147');

    // [L146] — `#getImageFile()#` on an unset column interpolates as empty.
    return `${settingValues.baseImageURL}/product/default/${this.imageFile ?? ''}`;
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L149-L151]: `getImage()` renders an `<img>` element through
   * `HibachiAssets`, framework code that is not ported.
   *
   * @param options the resize arguments `Product` forwards. Retained for
   *   signature parity; the body cannot reach them.
   */
  public getImage(options?: SkuImageResizeOptions): never {
    throw Sku.imageSubsystemRefusal(`getImage(${options?.size ?? ''})`, 'L149');
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L192-L219]: `getResizedImagePath()` reaches `imageService` at
   * [L218] — one of the nineteen locator sites — to resize on demand. Refused: `imageService` has
   * no port and the image subsystem is out of scope.
   */
  public getResizedImagePath(options?: SkuImageResizeOptions): never {
    throw Sku.imageSubsystemRefusal(`getResizedImagePath(${options?.size ?? ''})`, 'L218');
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L221-L227]: `getImageExistsFlag()` performs a filesystem
   * existence check against the composed image path. Refused for the same reason as
   * {@link Sku.getImagePath}.
   */
  public getImageExistsFlag(): never {
    throw Sku.imageSubsystemRefusal('getImageExistsFlag', 'L221');
  }

  /**
   * Builds the single, consistent refusal used by the three unportable image
   * members.
   *
   * The reason it names is the reason that actually holds for all three: an
   * out-of-scope collaborator with no port, or a filesystem this runtime does not
   * have. It deliberately does NOT cite the settings port, because the two members
   * whose only obstacle was a settings lookup are now ported — see the section
   * banner.
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

  /**
   * `getProduct().setting('productImageOptionCodeDelimiter')`
   * [model/entity/Sku.cfc:L135].
   *
   * Answers the materialised value when one was supplied, and otherwise the
   * metadata default the source itself falls back to —
   * `{fieldType="select", defaultValue="-"}`
   * [model/service/SettingService.cfc:L192], applied by
   * [model/service/SettingService.cfc:L481-L482]. See
   * {@link Sku.generateImageFileName} for why defaulting rather than raising is
   * the faithful reading for this key.
   */
  private readOptionCodeDelimiter(): string {
    return this.imageSettingValues?.productImageOptionCodeDelimiter ?? '-';
  }

  /**
   * `getProduct().setting('productImageDefaultExtension')`
   * [model/entity/Sku.cfc:L138].
   *
   * Answers the materialised value when one was supplied, and otherwise the
   * metadata default the source itself falls back to —
   * `{fieldType="text",defaultValue="jpg"}`
   * [model/service/SettingService.cfc:L191], applied by
   * [model/service/SettingService.cfc:L481-L482]. The leading `.` is NOT part of
   * this value: [L138] writes the separator as its own literal, and that split is
   * preserved.
   */
  private readDefaultImageExtension(): string {
    return this.imageSettingValues?.productImageDefaultExtension ?? 'jpg';
  }

  /**
   * Resolves the materialised image-setting values, or raises naming the gap.
   *
   * ★ REACHED BY {@link Sku.getImagePath} ONLY, AND THAT NARROWING IS DELIBERATE.
   * An earlier revision shared this helper with
   * {@link Sku.generateImageFileName}, which made both members raise on an
   * unmaterialised set. That was wrong for the file-name member: the two settings
   * it reads carry metadata defaults and `setting()` cannot fail for them
   * [model/service/SettingService.cfc:L191-L192, L481-L482], so raising refused
   * where the source answers. `getBaseImageURL()` has no such default, so this
   * helper — and the raise — belong to the path that reads it. See
   * {@link Sku.getImagePath} for why raising beats defaulting THERE.
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
   * `reReplaceNoCase(value, "[^a-z0-9\-\_]", "", "all")`
   * [model/entity/Sku.cfc:L135, L138].
   *
   * ★ THE `i` FLAG IS THE WHOLE POINT. The CFML character class lists lower-case
   * `a-z`, but `reReplaceNoCase` folds case, so `A-Z` survive. Without the flag
   * every capital would be stripped and `ABC-1` would become `-1`. `"all"` is the
   * global flag. The `\_` escape is redundant in both dialects and is dropped with
   * no effect on the matched set.
   *
   * An absent input becomes `''`: the legacy interpolates a null column as an
   * empty string, the same reading {@link Sku.getImagePath} applies to
   * `getImageFile()`.
   */
  private static sanitizeImageNameSegment(value: string | undefined): string {
    return (value ?? '').replace(/[^a-z0-9\-_]/gi, '');
  }

  // =========================================================================
  // CUSTOM VALIDATION METHODS [model/entity/Sku.cfc:L753-L784], under the LONG-FORM banner at
  // [L753]
  //
  // BOTH ARE INVOKED DECLARATIVELY, AND THAT MAKES THEM LIVE. `model/validation/Sku.json` names
  // them, verbatim:
  //
  //   "options": [
  //     {"contexts":"save","method":"hasUniqueOptions"},
  //     {"contexts":"save","method":"hasOneOptionPerOptionGroup"}
  //   ],
  //
  // The framework reaches them through the `hasUnique<Prop>` branch of the eleven-pattern
  // dispatcher at [org/Hibachi/HibachiEntity.cfc:L514]. An exhaustive `"method":"..."` census
  // across all FIFTEEN in-scope validation schemas found exactly FIVE declaratively-invoked entity
  // methods, and TWO OF THE FIVE ARE THESE. Two further `Sku.json` rules reach members of this
  // class, both delete-context:
  //   `"defaultFlag": [{"contexts":"delete","eq":false}]` and
  //   `"transactionExistsFlag": [{"contexts":"delete","eq":false}]`.
  // So a sku may not be deleted while it is its product's default or while a transaction references
  // it. The rest are property constraints: `price`
  // `{"required":true,"dataType":"numeric","minValue":0}`, `listPrice` and `renewalPrice`
  // `{"dataType":"numeric","minValue":0}`, and `skuCode` `{"required":true,"unique":true}`.
  // `minValue: 0` alongside their `default="0"` means schema and ORM agree that zero is a
  // legitimate stored price, which is exactly why a zero MUST NOT be invented for an unpriced
  // currency - the two states would become indistinguishable.
  //
  // SCHEMA ENFORCEMENT LIVES AT THE SERVICE TIER: this file carries the property metadata and these
  // two methods only - no `zod` import, no schema declaration, no validation runner.

  /**
   * Validates that no other sku already has this exact option combination.
   * [model/entity/Sku.cfc:L755-L769]. Dispatched from [org/Hibachi/HibachiEntity.cfc:L514].
   *
   * ASYNC, NECESSARILY: `getProduct().getSkusBySelectedOptions(...)` reaches the AND-of-EXISTS SQL
   * at [model/dao/SkuDAO.cfc:L107-L128] - MUST-PRESERVE BEHAVIOUR - so the ported product method is
   * asynchronous and so is this one. The legacy declares `any`; `boolean` is the honest return.
   *
   * `listAppend` is PURE and emits NO LEADING DELIMITER on an empty list, which lets the
   * accumulator start at `''` - load-bearing at [L760].
   *
   * THE COMPOUND CONDITION AT [L764] IS REPRODUCED EXACTLY: `true` when the result array is EMPTY,
   * OR when it holds EXACTLY ONE sku whose `skuID` equals this sku's; `false` in every other case.
   * In particular a result of two skus, one of which is this one, answers `false`.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L764]: `skus[1].getSkuID() == getSkuID()` uses CFML `==`,
   * CASE-INSENSITIVE, so the comparison goes through `cfEquals`.
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
   * [model/entity/Sku.cfc:L771-L784].
   *
   * LEGACY-DEFECT [model/entity/Sku.cfc:L771]: the `@hint` on this method is a VERBATIM COPY of the
   * one at [L755] - "this method validates that this skus has a unique option combination that no
   * other sku has" - but this method tests something entirely different: one option per option
   * group, not uniqueness across skus.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * Dispatched from [org/Hibachi/HibachiEntity.cfc:L514]. SYNCHRONOUS - the body reaches nothing
   * but the materialised option collection. The legacy declares `any`; `boolean` is the honest
   * return.
   *
   * Returns `false` on the FIRST duplicate option group and `true` after the loop completes, so an
   * empty option collection answers `true`. [L776] calls the CASE-SENSITIVE `listFind` and [L779]
   * `listAppend`; both are handled by {@link Sku.listFindCaseSensitive}, whose documentation
   * records why the case-sensitive test is implemented locally and how the 1-based-index truthiness
   * hazard is designed out.
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
  // DEPRECATED METHODS [model/entity/Sku.cfc:L882-L912]
  //
  // A SECTION THAT IS POPULATED, WHICH IS UNUSUAL IN THIS FOLDER. A `START: Deprecated Methods` /
  // `END: Deprecated Methods` banner pair has been seen once before —
  // [model/entity/PromotionCode.cfc:L189]/[L191] — and it was EMPTY there. `Sku`'s pair is
  // POPULATED, with FOUR methods. All four are ported, because deprecated is not the same as absent
  // and interface parity is the acceptance contract (B4).
  //
  // Every `@hint` is preserved VERBATIM, including the shouty `NEVER USE`. The lint configuration
  // deliberately enables no `no-warning-comments` rule, so deprecation hints and TODOs are legal by
  // design rather than by oversight.
  // =========================================================================

  /**
   * // @hint: USE skuDefinition()
   *
   * [model/entity/Sku.cfc:L884-L891] verbatim, `delimiter=" "` default preserved.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L885 versus L233]: this deprecated method and the
   * NON-deprecated `getOptionsDisplay()` [L233-L239] have IDENTICAL bodies — the local variable is
   * even spelled the same, `dspOptions`. One carries a deprecation hint and the other does not.
   * Both are on the public surface, so both are ported; the duplication is recorded rather than
   * resolved.
   *
   * Uses the THREE-ARGUMENT `listAppend(list, value, delimiter)`, which `src/lib/cfml/list.ts` does
   * declare, so the custom delimiter needs no local substitute. Its
   * no-leading-delimiter-on-an-empty-list behaviour is load-bearing at [L888], exactly as at
   * [L528], [L760] and [L779]. The `''` substitution for an absent option name is the same
   * decision, for the same reason, as {@link Sku.getOptionsDisplay}.
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
   * [model/entity/Sku.cfc:L893-L896] - `return getOptionsByOptionGroupIDStruct();`, PURE
   * DELEGATION.
   *
   * THIS METHOD IS THE PROOF THAT DEFECT 18 HAS NO COLLISION: its name resembles the stray write
   * target `variables.OptionsByGroupIDStruct`, but the body delegates and never touches `variables`
   * at all, so that target is written by [L517] and read by nothing in the 916-line component.
   */
  public getOptionsByGroupIDStruct(): Record<string, Option> {
    return this.getOptionsByOptionGroupIDStruct();
  }

  /**
   * // @hint: NEVER USE
   *
   * [model/entity/Sku.cfc:L898-L905]. NOTE WHAT IT IS KEYED AND VALUED BY, BECAUSE BOTH ARE
   * COUNTER-INTUITIVE: [L902] keys by the option group's NAME - `getOptionGroupName()`, not its
   * code and not its ID - and the VALUE is `getOptionID()`, not the option entity and not its name.
   * That crossing is very likely why the hint says NEVER USE; it is reproduced exactly.
   *
   * Unlike the two struct accessors above there is NO existence guard, so with two options in the
   * same option group THE LAST ONE WINS here - the opposite of [L504] and [L516].
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
      // The write still goes through `putOwnStructKey`, because the guard's absence
      // decides WHICH option wins and the write mechanism decides only whether the
      // winner is actually stored. An option group named `__proto__` was recorded by
      // CFML and must be recorded here.
      putOwnStructKey(options, optionGroupName, option.getOptionID());
    }
    return options;
  }

  /**
   * // @hint: USE getDefaultFlag()
   *
   * [model/entity/Sku.cfc:L907-L910] — `return !getDefaultFlag();`. The legacy declares `boolean`,
   * which is honest here.
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
// ★ THIS SECTION IS SHORTER THAN IT WAS, AND THE REASON IS RECORDED RATHER THAN
//   QUIETLY APPLIED. `generateImageFileName()` [L131-L139] and `getImagePath()`
//   [L145-L147] were previously listed here as omitted-or-refused on the grounds
//   that the settings they read are not among the `SettingsProvider` keys.
//   THAT PREMISE IS FALSE AS WELL AS INSUFFICIENT, and the count it rested on was
//   wrong: the union holds SEVEN keys, and two of the three values these members
//   compose with - `setting('productImageOptionCodeDelimiter')` [L135] and
//   `setting('productImageDefaultExtension')` [L138] - ARE on it
//   [model/service/SettingService.cfc:L192, :L191], while the third,
//   `getHibachiScope().getBaseImageURL()` [L146], is a framework scope accessor and
//   never was a settings key at all. Even where a value genuinely does sit off the
//   union, the premise establishes only that this entity may not RESOLVE that value,
//   not that it may not COMPOSE a string out of values resolved elsewhere. BOTH ARE
//   NOW PORTED, with the resolved values arriving through `SkuImageSettingValues`
//   exactly as `Option.assetsImageBaseUrl` supplies `Option.getImageDirectory()`
//   [model/entity/Option.cfc:L81-L83]. See the image section of the class.
//
//   ★ AND THE COMPOSITION EXISTS A SECOND TIME, ONE LAYER OUT, WHICH IS NOT A
//   DUPLICATE. `ImageStore.generateSkuImageFileName(descriptor)` composes the same
//   name for `ProductService.processProduct_updateDefaultImageFileNames`
//   [model/service/ProductService.cfc:L208-L214]. The two are not interchangeable
//   and neither is redundant: THIS member serves a caller holding a SKU that was
//   hydrated with its resolved `imageSettingValues`, and answers without reaching
//   any port; the PORT member serves the service, which holds no
//   `SkuImageSettingValues` and must not - `productImageOptionCodeDelimiter`
//   [model/service/SettingService.cfc:L192] and `productImageDefaultExtension`
//   [L191] are resolved once by the composition root through the seven-key
//   `SettingsProvider` union and then travel with the image subsystem, which is
//   where their CONSUMPTION belongs even though their RESOLUTION is the port's. The
//   service therefore supplies the halves only IT can supply - the option
//   traversal via `getOptions()`, filtered on
//   `option.getOptionGroup().getImageGroupFlag()` [model/entity/Sku.cfc:L133], and
//   the assignment via `setImageFile()` - and delegates the composition.
// LEGACY-NOTE [model/entity/Sku.cfc:L141-L143]: `getImageExtension()` is
//   `listLast(getImageFile(), ".")`. OMITTED, and NOT for a settings reason — it
//   reads no setting at all. (An earlier revision of this ledger recorded it as
//   omitted because it reads `productImageDefaultExtension`; that is not what the
//   body does, and the corrected reason is the one below.) Nothing in the ported
//   slice calls it: the four image members `product.ts` reaches are
//   `getImagePath`, `getImage`, `getResizedImagePath` and `getImageExistsFlag`,
//   and the only other in-scope caller of anything here is
//   `processProduct_updateDefaultImageFileNames`
//   [model/service/ProductService.cfc:L208-L213], which calls
//   `generateImageFileName()` and `setImageFile()`.
// LEGACY-NOTE [model/entity/Sku.cfc:L153-L190]: `getResizedImage()` reaches
//   `imageService` at [L189] — locator site 1 of 19. OMITTED: no port, image
//   subsystem out of scope. Nothing in the ported slice calls it.
// LEGACY-NOTE [model/entity/Sku.cfc:L794-L799]: `getImageName()` memoises
//   `generateImageFileName()`. OMITTED, and now for a narrower reason than
//   before: its delegate exists, but no in-scope caller reads the memo — the one
//   in-scope caller calls `generateImageFileName()` directly at
//   [model/service/ProductService.cfc:L210]. Authoring the memo would add a
//   second, staleable source of truth for a value nothing asks this entity to
//   cache. It sits under the POPULATED `START: Overridden Implicit Getters`
//   banner pair [L792]/[L801] and is that section's only member.
//   (`getImage`, `getResizedImagePath` and `getImageExistsFlag` are not omitted
//   either — `product.ts` calls them, so they exist as explicit refusals.)
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
// IMAGE / ASSET SUBSYSTEM, OMITTED because this entity may not RESOLVE the ambient values those
// members read - the legacy resolves them on the PRODUCT and through the request scope - and because
// `imageService` has no port: `generateImageFileName()` [model/entity/Sku.cfc:L131-L139],
// `getImageExtension()` [L141-L143], `getResizedImage()` [L153-L190] and `getImageName()`
// [L794-L799], the only member of the POPULATED `Overridden Implicit Getters` pair [L792]/[L801].
// `getImagePath`, `getImage`, `getResizedImagePath` and `getImageExistsFlag` are NOT omitted -
// `product.ts` calls them, so they exist above as explicit refusals.
//
// STOCK / INVENTORY / LOCATION, OMITTED: `getQuantity(quantityType, locationID, stockID)`
// [model/entity/Sku.cfc:L291-L322], which carries four of the nineteen locator sites - [L295]
// `locationService`, [L296] and [L300] `stockService`, [L310] `inventoryService` - plus `getQATS()`
// [L535-L537] and `getNextEstimatedAvailableDate()` [L459-L480] transitively. The persisted
// `calculatedQATS` column [L62] stays readable; only the recomputation is omitted.
//
// FULFILMENT: `getEligibleFulfillmentMethods()` [model/entity/Sku.cfc:L449-L457] reaches
// `fulfillmentService` at [L451] and reads `skuEligibleFulfillmentMethods` [L452], a setting the
// port does not publish. OMITTED on both counts.
//
// OUT-OF-SCOPE FAR SIDES, DROPPED with their columns preserved:
// `setSubscriptionTerm`/`removeSubscriptionTerm` [model/entity/Sku.cfc:L622-L637] (the column
// survives as `subscriptionTermID`, and the `subscriptionTermProvider` stub port is NOT injected
// here), `addSubscriptionBenefit`/`removeSubscriptionBenefit` [L724-L741],
// `addAlternateSkuCode`/`removeAlternateSkuCode` [L640-L645], `addStock`/`removeStock` [L664-L669],
// `addAccessContent`/`removeAccessContent` [L704-L721] and `addPhysical`/`removePhysical`
// [L744-L749].
//
// ORDER AGGREGATE. `orderItems` [model/entity/Sku.cfc:L71] declares explicit `lazy="extra"` and
// targets the out-of-scope order aggregate: NOT MATERIALISED, and `addOrderItem`, `removeOrderItem`
// and `hasOrderItem` are DROPPED, following the `PriceGroup.appliedOrderItems` precedent - the
// order aggregate is an INPUT through read-only views, never a dependency.
// `getAssignedOrderItemAttributeSetSmartList()` [L327-L334] reaches `attributeService` at [L330],
// the site eighteen-item enumerations omit, and is OMITTED twice over.
//
// THE EAV / ATTRIBUTE PATH. `attributeValues` [model/entity/Sku.cfc:L70] (`type="array"`,
// `cfc="AttributeValue"`, `cascade="all-delete-orphan"`, `inverse="true"`) is one of exactly FOUR
// such declarations across the eighteen in-scope entities, with [model/entity/Product.cfc:L75],
// [model/entity/ProductType.cfc:L67] and [model/entity/Brand.cfc:L60]. NOT MATERIALISED, NO 19th
// ENTITY FILE CREATED, EAV READ PATH NOT PORTED; `addAttributeValue` [L648] and
// `removeAttributeValue` [L651] are DROPPED, following dropped `Brand.addAttributeValue`
// [model/entity/Brand.cfc:L90] and `removeAttributeValue` [L93], with the unhonoured
// `cascade="all-delete-orphan"` obligation recorded in the repositories sibling. The subsystem is
// reached in exactly TWO ways across the slice: this non-ported path, and
// `ProductDAO.getAttributeSets` [model/dao/ProductDAO.cfc:L52], which IS ported.
// `getAssignedAttributeSetSmartList()` [L813-L840] reaches `attributeService` at [L816] and builds
// a `HibachiSmartList`; OMITTED, matching [model/entity/ProductType.cfc:L280].
//
// FRAMEWORK OVERRIDES. `getPropertyMetaData(propertyName)` [model/entity/Sku.cfc:L842-L855] exists
// solely to make the `onMissingMethod` override work, returning an option's `optionName` metadata
// when the argument is 32 characters long; OMITTED, because that capability is now the typed
// {@link Sku.getOptionNameByOptionGroupID}, so `onMissingMethod` [L857-L873] is REPLACED rather
// than omitted. The non-persistent `adminIcon` [L99] serves the out-of-scope admin application:
// OMITTED.
//
// EMPTY AND STRUCTURAL SECTIONS. The `ORM Event Hooks` pair [model/entity/Sku.cfc:L878]/[L880] is
// COMPLETELY EMPTY, unlike [model/entity/PriceGroup.cfc:L206]/[L211]; the
//   `Custom Formatting Methods`
// pair [L788]/[L790] and the `Overridden Smart List Getters` pair [L803]/[L805] are EMPTY;
// `Deprecated Properties` [L123-L125] is EMPTY while `Deprecated Methods` [L882]/[L912] carries
// four members; and `salePriceDiscountAmount` [L117] is DECLARED with NO accessor anywhere in the
// 916 lines.
//
// PRESERVED SPELLING. `mechinism` [model/entity/Sku.cfc:L415], the duplicated `@hint` [L771] and
// the `@help` [L842] are quoted verbatim wherever they appear above. NO SPELLING IS CORRECTED.
// ---------------------------------------------------------------------------
