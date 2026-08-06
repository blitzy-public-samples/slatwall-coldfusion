// ---------------------------------------------------------------------------
// tests/unit/domain/entities/sku.test.ts
//
// The isolated unit suite for `src/domain/entities/sku.ts`, the port of the
// 916-line `model/entity/Sku.cfc` — the largest entity in the slice and the
// highest-consequence suite in this folder.
//
// WHAT THIS SUITE PINS
//
//   1. THE THREE `undefined`-NEVER-ZERO CURRENCY ACCESSORS
//      [model/entity/Sku.cfc:L269-L285]. `getPriceByCurrencyCode` has ONE
//      `structKeyExists` guard [L270]; `getListPriceByCurrencyCode` [L276] and
//      `getRenewalPriceByCurrencyCode` [L282] have TWO. None has an `else` and
//      none has a trailing `return`, so a miss is CFML null. Substituting `0`
//      would silently sell products for free, which is why the null gate is the
//      single most consequential parity check in the whole plan.
//
//   2. THE FOUR-STEP CURRENCY RESOLUTION CASCADE [L367-L433] — one of the
//      project's three must-preserve areas. The eligibility gate [L373], the
//      unconditional per-currency seeding [L381-L382], Step 1's unconditional
//      `price` write and case-insensitive `eq` [L385, L394], Step 2's
//      LAST-match-wins overwrite with NO `break` [L399-L414], Step 3's guard on
//      the `"price"` sub-key ALONE [L416], and the `converted` tri-state.
//
//   3. TWO OF THE THREE MEMBERS OF THE PROJECT'S ONLY DOMAIN-SIDE DELIBERATE
//      DIVERGENCE — legacy defects 17 [L500-L510] and 18 [L512-L522], the two
//      option-struct memo bugs, which are FIXED here. The third member, defect
//      19 (`Product.getBrandName()`), belongs to `product.test.ts`.
//
//   4. THE DEFECTS THAT ARE *NOT* FIXED, because they change a returned value:
//      the H1 code/ID key mismatch [L247-L251], defect 16's non-existent
//      service call [L258], the discarded `trim` [L583], the unguarded
//      `getDefaultFlag` chain [L442-L447], D28/H4's off-port service reach
//      [L569], the silently-discarded `skuID` argument [L594] and the
//      option-less `hasUniqueOptions` spurious failure [L756-L769].
//
//   5. THE A2 MEMO-ISOLATION PROOF. This suite is one of the two assigned
//      owners: a second, independent `Sku` never observes the first instance's
//      `currencyDetails` or `livePrice`, and the same holds for every other memo
//      the shipped surface exposes.
//
// ---------------------------------------------------------------------------
// TRACEABILITY (C8) — NET-NEW COVERAGE PLUS EXACTLY ONE ROUTED LEGACY CASE.
// NEVER TO BE PRESENTED AS PARITY.
//
//   NET-NEW. No file under `meta/tests/**` takes `Sku` as its subject. There is
//   no `SkuTest.cfc`; `meta/tests/unit/service/` and `meta/tests/unit/dao/`
//   contain nothing in scope. Every assertion below except the one named next is
//   therefore net-new coverage authored for this port, and calling it parity
//   would be false.
//
//   ROUTED LEGACY CASE — `issue_1348`, from
//   `meta/tests/unit/IssuesTest.cfc:L126-L138`, which carries two real, fully
//   portable assertions. It keeps the legacy `issue_<ticket#>` naming
//   convention. See the `issue_1348` block near the end of this file.
//
//   The four inherited cases of `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67`
//   are NOT claimed as legacy coverage for `Sku`: that base component was mixed
//   into `BrandTest.cfc` and `ProductTest.cfc` only, never into a Sku test.
//
// ---------------------------------------------------------------------------
// CORRECTIONS TO THE UPSTREAM SPECIFICATION, EACH VERIFIED FIRST-HAND.
// THE STANDING RULE IS THAT THE SOURCE WINS.
//
//   C1. `meta/tests/unit/entity/` holds TWELVE `.cfc` files, not three
//       (Access, AccountAddress, AccountPayment, Account, Address,
//       AttributeValue, Brand, OrderPayment, PaymentTransaction, Product,
//       SlatwallEntityTestBase, Vendor). The load-bearing fact is unchanged and
//       verified: there is no `SkuTest.cfc`, and only `BrandTest.cfc` and
//       `ProductTest.cfc` target an in-scope entity. The NET-NEW declaration
//       above therefore stands.
//
//   C2. `SlatwallEntityTestBase.cfc` is 70 lines with its four cases at
//       L51-L67, not L51-L67 of a differently sized file.
//
//   C3. LOCATOR DRIFT, corrected: the `skuService` reach in
//       `getStocksDeletableFlag` is at L569 (not L568); `getTransactionExistsFlag`
//       reaches the service at L594; `calculateSkuPriceBasedOnCurrentAccount` is
//       called at L437 (not L436); `onMissingMethod` spans L857-L873 (not
//       L852-L878); `getSkuDefinition` spans L574-L590 with the discarded
//       `trim` at L583.
//
//   C4. `model/validation/` holds 96 JSON files. `Sku.json` is present and is
//       exactly 15 lines carrying exactly eight property entries.
//
//   C5. ★ THE ASYNC SPLIT DIFFERS FROM THE SPECIFICATION.
//       `getBaseProductType`, `getSkuDefinition` and `getLivePrice` are ALL
//       ASYNCHRONOUS on the shipped class, because `ProductType.getBaseProductType()`
//       performs a repository load of the root element of the materialized path
//       [model/entity/ProductType.cfc:L112] and `getCurrentAccountPrice()`
//       reaches the price-group resolver [model/entity/Sku.cfc:L437]. The async
//       audit below asserts the shipped split, not the specified one.
//
//   C6. ★ THE ELIGIBILITY GATE ENCLOSES MORE THAN SPECIFIED. With the gate shut,
//       the currency port is NOT consulted at all — the shipped module fuses
//       [L371]'s smart-list construction with [L375]'s filter into a single
//       `getCurrenciesByCurrencyCodeList` call that sits INSIDE the gate. What
//       does survive outside it is the memo seeding [L369] and, ahead of the
//       gate, BOTH collaborator presence checks. All three facts are asserted.
//
//   C7. ★ THERE IS NO EXPLICIT CONTEXT PARAMETER on
//       `getCurrentAccountPrice()`. The requesting account is CONSTRUCTOR-INJECTED
//       as `currentAccountContext`, which honours transformation rule T6 without
//       spending an entity-layer signature widening — and the widening budget is
//       exactly ONE for the whole entity layer, already spent by
//       `PromotionPeriod.isCurrent(now)`.
//
//   C8. `getSalePriceDetails()` does NOT delegate to
//       `Product.getSkuSalePriceDetails()`. The detail row is pre-materialised
//       during hydration so that the three synchronous readers [L546, L553,
//       L560] keep the contract `product.ts` depends on. There is no separate
//       memo for it.
//
//   C9. ★ THE `subscription` BRANCH OF `getSkuDefinition` THROWS. It is not an
//       inert `rbKey` string constant: [L585] reads
//       `getSubscriptionTerm().getSubscriptionTermName()` and the JavaRB key
//       `entity.subscriptionTerm`, and both the entity and JavaRB are
//       out of scope, so the shipped module refuses rather than faking an answer.
//
//   C10. Nine sibling suites exist in this folder at the time of writing; this
//        is the tenth of an eventual eighteen.
//
// ---------------------------------------------------------------------------
// DIVERGENCE BUDGET: THIS FILE SPENDS TWO OF THE THREE MEMBERS OF (c).
//
//   Exactly THREE deliberate divergences exist across the whole project, and the
//   domain layer owns only (c) — the unobservable entity-memo carve-out.
//   (a) is the un-`var`'d `discountAmount` [model/service/PromotionService.cfc:L1007, L1009, L1014]
//   and (b) is the `amountOff` raw-float gap [model/service/PromotionService.cfc:L998];
//   both are sibling-owned by `src/services`. Divergence (c) has three members:
//   defects 17 and 18, asserted HERE, and defect 19, asserted in
//   `product.test.ts`. A FOURTH DIVERGENCE IS FORBIDDEN and this file requests
//   none.
//
// MARKER DISCIPLINE
//
//   `// LEGACY-DEFECT [<path>:<locator>]: …` followed on the next line by
//   `// Preserved deliberately; do not fix without a product decision.` — for
//   every assertion that pins defective legacy behaviour.
//   `// CFML parity [<path>:<locator>]: …` — for a non-defect semantic
//   translation.
//   `// JUDGMENT CALL: …` — where a translation choice was made.
//   `// DELIBERATE DIVERGENCE (c) …` — the two authorized memo fixes, each
//   carrying the exact phrase "documented deliberate divergence (c)".
//
// WHAT THIS SUITE MAY IMPORT
//
//   `vitest`, `src/domain/**` and `tests/fixtures/**`, and nothing else. No
//   handler, no repository, no integration, no `src/lib/config.ts`, no
//   `src/lib/logger.ts`, no `decimal.js`, no `mysql2`, no `aws-lambda`, no
//   `dotenv`. `src/lib/cfml/*` is imported only where the shipped entity's own
//   behaviour flows through it. Tests are not a back door around the
//   domain-inward lint boundary, which is enforced mechanically on
//   `src/domain/**` only and therefore honoured here by discipline.
//
//   JUDGMENT CALL: `src/domain/entities/productType.ts` is imported even though
//   it is not among this file's nominated dependencies. It is unavoidable —
//   `Sku.getSkuDefinition()` [L574-L590] and `Sku.getBaseProductType()` [L356-L358]
//   both resolve the base product type through the product's `ProductType`, and
//   `Product.getBaseProductType()` throws when that association is absent
//   [model/entity/Product.cfc:L494]. The import is inside the permitted
//   `src/domain/**` boundary, adds no package, and no other route exists.
//
// FRESHNESS, DETERMINISM AND ISOLATION (A2)
//
//   Every subject is constructed FRESH inside the test that uses it, by a pure
//   factory. There is no describe-scope subject, no module-level mutable
//   binding, no shared double and no snapshot. Recording doubles are handed a
//   call log created inside the test, so two tests can never observe each
//   other's calls. `tests/setup.ts` owns UTC (`process.env.TZ`) and registers a
//   global `afterEach` running `vi.restoreAllMocks()` and `vi.useRealTimers()`;
//   this file installs no timers, stubs no globals and needs no `vi`. Every
//   business date is an explicit UTC ISO-8601 instant — never a bare
//   `new Date()`, never `Date.now()`.
//
//   `Sku` receives NO clock. Only `promotionPeriod.ts` and `promotionCode.ts`
//   take `now: () => Date`, as a plain constructor parameter rather than a port.
//
// NO USER RULES WERE PROVIDED (UR4)
//
//   `review_rules` was read to completion and reports that no user rules exist,
//   matching AAP §0.7. No rule governs this file, no file enters scope by rule
//   mandate and no rule is invented. Their absence is not licence to lower the
//   bar: the enterprise-standard practices stand in their place and are treated
//   as binding.
//
// LICENCE
//
//   Carried forward at subtree level by `slatwall-ts/NOTICE-GPL.md`. No per-file
//   GPL header, by project convention.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { Option } from '../../../../src/domain/entities/option.js';
import { ENTITY_CODE_PATTERN, OptionGroup } from '../../../../src/domain/entities/optionGroup.js';
import { PriceGroup } from '../../../../src/domain/entities/priceGroup.js';
import { PriceGroupRate } from '../../../../src/domain/entities/priceGroupRate.js';
import { ProductType } from '../../../../src/domain/entities/productType.js';
import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import { Sku } from '../../../../src/domain/entities/sku.js';
import { SkuCurrency } from '../../../../src/domain/entities/skuCurrency.js';
import { toCurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { listFindNoCase, listToArray } from '../../../../src/lib/cfml/list.js';
import { numberFormat } from '../../../../src/lib/cfml/numberFormat.js';
import { structGet, structKeyExists } from '../../../../src/lib/cfml/struct.js';
import { makeProductFixture } from '../../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

import type { Product } from '../../../../src/domain/entities/product.js';
import type { CurrencyDetail, SkuPriceGroupResolver } from '../../../../src/domain/entities/sku.js';
import type { CurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';

// ---------------------------------------------------------------------------
// NAMED INPUTS
//
// ★ NO CURRENCY LITERAL IN THIS FILE IS AN ENTITY DEFAULT. The `"USD"` default
// lives in a SETTING DECLARATION — `skuCurrency = {fieldType="select",
// defaultValue="USD"}` [model/service/SettingService.cfc:L221] — and
// `Sku.getCurrencyCode()` [model/entity/Sku.cfc:L360-L365] merely memoises
// `this.setting('skuCurrency')`. Every constant below is therefore an INPUT
// handed to the settings double, and the tests that matter prove the entity
// follows whatever the setting says rather than a baked-in code. The sibling
// eligible-currency setting is at [model/service/SettingService.cfc:L222].
// ---------------------------------------------------------------------------

/** The value the settings double answers for `skuCurrency`. */
const SETTING_SKU_CURRENCY = 'USD';

/** A second eligible currency, covered by a `SwSkuCurrency` row or a conversion. */
const SECONDARY_CURRENCY_CODE = 'EUR';

/** A third eligible currency, never covered by a row, so it always converts. */
const TERTIARY_CURRENCY_CODE = 'GBP';

/** A currency that is never eligible, used to probe the outer-key miss. */
const INELIGIBLE_CURRENCY_CODE = 'JPY';

/** The value the settings double answers for `skuEligibleCurrencies`. */
const SETTING_SKU_ELIGIBLE_CURRENCIES = `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`;

/** The two URL-key settings this entity never reads; present so the double is total. */
const SETTING_GLOBAL_URL_KEY_PRODUCT = 'sp';
const SETTING_GLOBAL_URL_KEY_PRODUCT_TYPE = 'spt';

/**
 * The fixture's own default money columns, restated so expectations read as
 * decimal strings rather than as arithmetic (P4).
 */
const FIXTURE_PRICE = '19.99';
const FIXTURE_LIST_PRICE = '24.99';
const FIXTURE_RENEWAL_PRICE = '17.99';

/** The fixture's `SwSkuCurrency` override amounts for the secondary currency. */
const SECONDARY_OVERRIDE_PRICE = '17.49';
const SECONDARY_OVERRIDE_LIST_PRICE = '21.99';
const SECONDARY_OVERRIDE_RENEWAL_PRICE = '15.49';

/** The superseded first row of the duplicated-row variant. */
const SECONDARY_SUPERSEDED_PRICE = '8.88';

/** The fixture's `SwSkuCurrency` override amount for the BASE currency. */
const BASE_OVERRIDE_PRICE = '18.49';

/** Conversion rates handed to the currency double, never computed in a test. */
const SECONDARY_CONVERSION_RATE = '0.90';
const TERTIARY_CONVERSION_RATE = '0.80';

/** Every business date in this file is an explicit UTC ISO-8601 instant. */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';
const SALE_PRICE_EXPIRATION_UTC = '2024-12-31T23:59:59.000Z';

/** The three base product types the legacy `getSkuDefinition` branches on. */
const BASE_TYPE_MERCHANDISE = 'merchandise';
const BASE_TYPE_CONTENT_ACCESS = 'contentAccess';
const BASE_TYPE_SUBSCRIPTION = 'subscription';

// ---------------------------------------------------------------------------
// HAND-WRITTEN IN-LINE DOUBLES AND BUILDERS
//
// Every one is a pure function declared in this file (P7 forbids a shared helper
// MODULE, a test base class, a mocks directory and a nineteenth suite; it does
// not forbid local factories). No mocking library is used and none may be added
// (P3); `vi` is not even imported, because nothing here needs intercepting.
//
// ★ NO DI CONTAINER, NO SERVICE LOCATOR, NO AMBIENT REQUEST SCOPE, NO
// BOOTSTRAP, NO DATABASE, NO NETWORK, NO FILESYSTEM, NO `.env`, NO CREDENTIAL
// AND NO SUPERUSER ELEVATION. The whole suite passes with a completely empty
// environment (P6), which is the exact opposite of
// `meta/tests/unit/SlatwallUnitTestBase.cfc`, whose L52 instantiates the real
// application, L60 bootstraps it and L62 elevates to superuser before every
// test. That component is the anti-pattern; traceability means the same
// assertions about the same behaviour, never the same test architecture (C1).
// ---------------------------------------------------------------------------

/** A settings-port call log, created inside the test that reads it. */
type SettingsCallLog = string[];

/**
 * A recording stand-in for the settings port.
 *
 * The port declares `setting(name): string` and never `undefined`, so the table
 * is TOTAL over the four keys the shipped `SettingKey` union publishes
 * [model/service/SettingService.cfc:L178, L179, L221, L222] - the catch-all
 * return below answers every key this sku never reads. It once had to be total over SEVEN, because
 * three product-presentation keys travelled on a second settings contract; those are resolved values
 * now and this sku receives the two it needs as `SkuImageSettingValues`. The parameter is
 * typed `string` rather than the port's narrower union so that no port module
 * has to be imported; a function accepting `string` satisfies one declared to
 * accept a subset of `string`.
 */
function makeRecordingSettingsProvider(
  skuCurrency: string,
  skuEligibleCurrencies: string,
  log: SettingsCallLog,
): { setting: (settingName: string) => string } {
  const table: Record<string, string> = {
    globalURLKeyProduct: SETTING_GLOBAL_URL_KEY_PRODUCT,
    globalURLKeyProductType: SETTING_GLOBAL_URL_KEY_PRODUCT_TYPE,
    skuCurrency,
    skuEligibleCurrencies,
  };

  return {
    setting(settingName: string): string {
      log.push(settingName);
      return table[settingName] ?? '';
    },
  };
}

/** One recorded `convertCurrency` invocation, captured as decimal strings (P4). */
type ConversionCall = {
  readonly amount: string;
  readonly originalCurrencyCode: string;
  readonly convertToCurrencyCode: string;
};

/** Everything a currency-port double records, so a test can count consultations. */
type CurrencyConverterLog = {
  readonly listings: string[];
  readonly conversions: ConversionCall[];
};

/** A fresh, empty currency-port log. */
function makeCurrencyConverterLog(): CurrencyConverterLog {
  return { listings: [], conversions: [] };
}

/**
 * A recording stand-in for the currency-conversion port.
 *
 * CFML parity [model/entity/Sku.cfc:L371, L375]: the legacy builds a currency
 * smart list and then narrows it with `addInFilter('currencyCode', …)`. The
 * shipped module fuses those two statements into one
 * `getCurrenciesByCurrencyCodeList` call, so THAT is what `listings` counts.
 *
 * CFML parity [model/service/CurrencyService.cfc:L100-L101]: AN UNSUPPLIED RATE
 * IS A SILENT PASS-THROUGH, not a failure. The legacy returns the amount
 * unconverted when either code is absent from the rate table, and the cascade
 * still marks the currency `converted = true` at [model/entity/Sku.cfc:L427], so
 * a par-priced currency is deliberately indistinguishable from a converted one.
 * An earlier revision of this double rejected instead; that made one unlisted
 * currency fail `getCurrencyDetails()` outright, which is strictly worse than
 * the behaviour it was trying to expose.
 *
 * The equal-code identity below is a DOUBLE SIMPLIFICATION and is not claimed as
 * parity: the legacy has no equal-code test, so it divides and multiplies by the
 * same rate and rounds, answering the input rounded to cents. The cascade cannot
 * reach that case — Step 1 writes the base currency's price unconditionally at
 * [model/entity/Sku.cfc:L394], so Step 3's guard at [L416] excludes it — and the
 * production converter inside `src/handlers/bootstrap.ts` reproduces the real
 * branch structure, pinned by `tests/unit/handlers/bootstrap.test.ts`. This
 * pointer used to name
 * `src/integrations/europeanCentralBankCurrencyConverter.ts`, a module withdrawn
 * as unplanned architecture.
 */
function makeRecordingCurrencyConverter(
  rates: Readonly<Record<string, string>>,
  log: CurrencyConverterLog,
): {
  getAllActiveCurrencyIDList: () => Promise<CurrencyCode[]>;
  getCurrenciesByCurrencyCodeList: (currencyCodeList: string) => Promise<CurrencyCode[]>;
  convertCurrency: (
    amount: Money,
    originalCurrencyCode: CurrencyCode,
    convertToCurrencyCode: CurrencyCode,
  ) => Promise<Money>;
} {
  const parse = (currencyCodeList: string): CurrencyCode[] =>
    listToArray(currencyCodeList).map((code) => toCurrencyCode(code));

  return {
    getAllActiveCurrencyIDList(): Promise<CurrencyCode[]> {
      log.listings.push('getAllActiveCurrencyIDList');
      return Promise.resolve(parse(SETTING_SKU_ELIGIBLE_CURRENCIES));
    },

    getCurrenciesByCurrencyCodeList(currencyCodeList: string): Promise<CurrencyCode[]> {
      log.listings.push(currencyCodeList);
      return Promise.resolve(parse(currencyCodeList));
    },

    convertCurrency(
      amount: Money,
      originalCurrencyCode: CurrencyCode,
      convertToCurrencyCode: CurrencyCode,
    ): Promise<Money> {
      log.conversions.push({
        amount: amount.toDecimalString(),
        originalCurrencyCode,
        convertToCurrencyCode,
      });

      if (originalCurrencyCode.toUpperCase() === convertToCurrencyCode.toUpperCase()) {
        return Promise.resolve(amount);
      }

      const rate = rates[convertToCurrencyCode];

      if (rate === undefined) {
        // CFML parity [model/service/CurrencyService.cfc:L100-L101]: unconverted,
        // not rejected. The call is still recorded above, so a suite can prove the
        // conversion WAS attempted and still answered at par.
        return Promise.resolve(amount);
      }

      return Promise.resolve(amount.times(rate));
    },
  };
}

/** One recorded price-group-resolver invocation. */
type ResolverCall = {
  readonly member: string;
  readonly skuID: string;
  readonly priceGroupID: string;
  readonly accountID: string;
};

/**
 * A recording stand-in for the price-group resolver declared BY `sku.ts` itself.
 *
 * CFML parity [model/entity/Sku.cfc:L262, L266, L437]: three
 * `getService("priceGroupService")` locator calls become one injected port, and
 * the sku always passes ITSELF. `getRateForSkuBasedOnPriceGroup` keeps the
 * LAST match rather than the first, because the legacy loop at
 * [model/service/PriceGroupService.cfc:L146-L150] has no `break`.
 */
function makeRecordingPriceGroupResolver(
  priceGroupPrice: Money,
  currentAccountPrice: Money,
  log: ResolverCall[],
): SkuPriceGroupResolver {
  return {
    calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money {
      log.push({
        member: 'calculateSkuPriceBasedOnPriceGroup',
        skuID: sku.getSkuID(),
        priceGroupID: priceGroup.getPriceGroupID(),
        accountID: '',
      });
      return priceGroupPrice;
    },

    getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined {
      log.push({
        member: 'getRateForSkuBasedOnPriceGroup',
        skuID: sku.getSkuID(),
        priceGroupID: priceGroup.getPriceGroupID(),
        accountID: '',
      });

      let winner: PriceGroupRate | undefined;

      for (const rate of priceGroup.getPriceGroupRates()) {
        if (rate.hasSku(sku)) {
          winner = rate;
        }
      }

      return winner;
    },

    calculateSkuPriceBasedOnCurrentAccount(
      sku: Sku,
      context: { readonly accountID?: string },
    ): Promise<Money> {
      log.push({
        member: 'calculateSkuPriceBasedOnCurrentAccount',
        skuID: sku.getSkuID(),
        priceGroupID: '',
        accountID: context.accountID ?? '',
      });
      return Promise.resolve(currentAccountPrice);
    },
  };
}

/** One recorded sku-repository invocation, arguments included. */
type SkuRepositoryCall = {
  readonly member: string;
  readonly args: readonly (string | undefined)[];
};

/**
 * A recording stand-in for the SEVEN-MEMBER sku repository port.
 *
 * ★ THE PORT LEDGER IS THIRTEEN AND `skuRepository` IS LOCKED AT SEVEN MEMBERS.
 * Nothing is added here to make `getStocksDeletableFlag` [L569] work: that member
 * lives on `model/service/SkuService.cfc:L281`, not on the DAO, and therefore does
 * not exist on the port. See the D28/H4 block below.
 *
 * ★ THIS BLOCK READ "EIGHT-MEMBER" FOR ONE REVISION. The port briefly carried a
 * `saveSkus` collection form, and this stand-in mirrored it. That member has been
 * removed - the port's own header fixes the arithmetic at seven and locks it - so the
 * mirror is back to seven. The observation made at the time still holds: a WRITE
 * member never softened the absent READ, and the refusal asserted below was a refusal
 * at seven, at eight, and at seven again.
 */
function makeRecordingSkuRepository(
  selectedOptionsResult: readonly Sku[],
  transactionExistsFlag: boolean,
  log: SkuRepositoryCall[],
): {
  getTransactionExistsFlag: (productID?: string, skuID?: string) => Promise<boolean>;
  getSkuBySkuCode: (skuCode: string) => Promise<Sku | undefined>;
  getSkusBySelectedOptions: (selectedOptions: string, productID?: string) => Promise<Sku[]>;
  searchSkusByProductType: (term?: string, productTypeID?: string) => Promise<Sku[]>;
  getProductSkus: (product: Product, fetchOptions: boolean) => Promise<Sku[]>;
  getSortedProductSkusID: (productID: string) => Promise<string[]>;
  saveSku: (sku: Sku) => Promise<Sku>;
} {
  return {
    getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
      log.push({ member: 'getTransactionExistsFlag', args: [productID, skuID] });
      return Promise.resolve(transactionExistsFlag);
    },

    getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
      log.push({ member: 'getSkuBySkuCode', args: [skuCode] });
      return Promise.resolve(undefined);
    },

    getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
      log.push({ member: 'getSkusBySelectedOptions', args: [selectedOptions, productID] });
      return Promise.resolve([...selectedOptionsResult]);
    },

    searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
      log.push({ member: 'searchSkusByProductType', args: [term, productTypeID] });
      return Promise.resolve([]);
    },

    getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
      log.push({ member: 'getProductSkus', args: [String(fetchOptions)] });
      return Promise.resolve([...product.getSkus()]);
    },

    getSortedProductSkusID(productID: string): Promise<string[]> {
      log.push({ member: 'getSortedProductSkusID', args: [productID] });
      return Promise.resolve([]);
    },

    saveSku(sku: Sku): Promise<Sku> {
      log.push({ member: 'saveSku', args: [sku.getSkuID()] });
      return Promise.resolve(sku);
    },
  };
}

/** An `SwOptionGroup` row, every constructor key written out explicitly. */
function makeOptionGroupDouble(
  optionGroupID: string,
  optionGroupCode: string,
  optionGroupName: string,
  sortOrder: number,
): OptionGroup {
  return new OptionGroup({
    optionGroupID,
    optionGroupName,
    optionGroupCode,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: false,
    sortOrder,
    remoteID: undefined,
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    options: [],
    // A DETERMINISTIC tie breaker. The class defaults to `randRange(1,100)`
    // [model/entity/OptionGroup.cfc], which no assertion may depend on.
    optionSortTieBreaker: () => 1,
  });
}

/** An `SwOption` row bound to `optionGroup`, with the inverse side completed. */
function makeOptionDouble(
  optionID: string,
  optionCode: string,
  optionName: string,
  optionGroup: OptionGroup,
  sortOrder: number,
): Option {
  const option = new Option({
    optionID,
    optionCode,
    optionName,
    optionDescription: undefined,
    sortOrder,
    optionGroup,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
  });

  optionGroup.getOptions().push(option);

  return option;
}

/** A `SwSkuCurrency` row. `price` may be absent — [model/entity/SkuCurrency.cfc:L53] has no default. */
function makeSkuCurrencyDouble(
  skuCurrencyID: string,
  currencyCode: string,
  price: Money | undefined,
  listPrice: Money | undefined,
  renewalPrice: Money | undefined,
): SkuCurrency {
  return new SkuCurrency({
    skuCurrencyID,
    price,
    renewalPrice,
    listPrice,
    currencyCode: toCurrencyCode(currencyCode),
    sku: undefined,
    remoteID: undefined,
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
  });
}

/**
 * A `SwProductType` row whose `systemCode` is populated, so
 * `getBaseProductType()` [model/entity/ProductType.cfc:L110-L115] answers it
 * without a repository round-trip: the legacy guard `isNull(getSystemCode()) ||
 * getSystemCode() == ""` is false, and [L114] returns the code directly.
 */
function makeProductTypeDouble(systemCode: string): ProductType {
  return new ProductType({ productTypeID: `pt-${systemCode}`, systemCode });
}

/** A sku whose product resolves the given base product type. */
function makeSkuWithBaseProductType(systemCode: string, options?: readonly Option[]): Sku {
  const product = makeProductFixture({
    productID: 'basetype-product',
    skus: [],
    productType: makeProductTypeDouble(systemCode),
  });

  return options === undefined ? makeSkuFixture({ product }) : makeSkuFixture({ product, options });
}

/**
 * A sku whose product answers `getSkusBySelectedOptions` from `result`.
 *
 * ★ THIS MODELS A RESULT, NEVER A QUERY. The AND-of-EXISTS matching semantics of
 * [model/dao/SkuDAO.cfc:L107-L128] belong to `tests/integration` (P5); a domain
 * suite must not assert SQL.
 */
function makeSkuWithSelectionResult(
  result: readonly Sku[],
  log: SkuRepositoryCall[],
  options?: readonly Option[],
): Sku {
  const product = makeProductFixture({
    productID: 'selection-product',
    skus: [],
    skuRepository: makeRecordingSkuRepository(result, false, log),
  });

  return options === undefined ? makeSkuFixture({ product }) : makeSkuFixture({ product, options });
}

/**
 * The currency-detail entry for `currencyCode`, or a hard failure.
 *
 * `noUncheckedIndexedAccess` makes every map read `CurrencyDetail | undefined`,
 * so the absent case is stated rather than asserted away with a non-null
 * assertion — which this file does not use even though the test lint profile
 * would permit one (P1).
 */
function requireDetail(
  details: Readonly<Record<string, CurrencyDetail>>,
  currencyCode: string,
): CurrencyDetail {
  const detail = details[currencyCode];

  if (detail === undefined) {
    throw new Error(`sku.test.ts: no currency-detail entry for '${currencyCode}'.`);
  }

  return detail;
}

/** The option at `index`, or a hard failure. Same rationale as {@link requireDetail}. */
function requireOption(options: readonly Option[], index: number): Option {
  const option = options[index];

  if (option === undefined) {
    throw new Error(`sku.test.ts: no option at index ${String(index)}.`);
  }

  return option;
}

/** The `SwSkuCurrency` row at `index`, or a hard failure. Same rationale as {@link requireDetail}. */
function requireSkuCurrency(skuCurrencies: readonly SkuCurrency[], index: number): SkuCurrency {
  const skuCurrency = skuCurrencies[index];

  if (skuCurrency === undefined) {
    throw new Error(`sku.test.ts: no sku currency at index ${String(index)}.`);
  }

  return skuCurrency;
}

/** The option group of `option`, or a hard failure. */
function requireOptionGroupOf(option: Option): OptionGroup {
  const optionGroup = option.getOptionGroup();

  if (optionGroup === undefined) {
    throw new Error(`sku.test.ts: option '${option.getOptionID()}' has no option group.`);
  }

  return optionGroup;
}

/**
 * The DECLARED PARAMETER COUNT of a named member, or `-1` when it is absent.
 *
 * Interface parity is the acceptance contract (C4), and a widened signature is a
 * parity break — so arity is worth asserting directly. Reading it through an
 * indexed `Record<string, unknown>` rather than through `subject.member.length`
 * is deliberate: detaching a class method to inspect it trips
 * `@typescript-eslint/unbound-method`, and the lint configuration is never
 * weakened to accommodate a test (P1).
 */
function arityOf(subject: object, name: string): number {
  const member = (subject as unknown as Record<string, unknown>)[name];

  return typeof member === 'function' ? (member as (...args: never[]) => unknown).length : -1;
}

// ===========================================================================
// B1 — THE THREE `undefined`-NEVER-ZERO CURRENCY ACCESSORS
// [model/entity/Sku.cfc:L269-L285]
//
// ★★★ MUST-PRESERVE AREA 2, AND THE SINGLE MOST CONSEQUENTIAL PARITY CHECK IN
// THE PLAN.
// ===========================================================================

describe('Sku currency accessors — undefined is never zero [model/entity/Sku.cfc:L269-L285]', () => {
  it('returns undefined from all three accessors for a currency absent from the details map', async () => {
    const sku = makeSkuFixture();
    await Sku.hydrate(sku);

    // CFML parity [model/entity/Sku.cfc:L269-L273]: no else branch and no
    // trailing return ⇒ CFML null ⇒ undefined. Returning 0 here would silently
    // sell products for free.
    expect(sku.getPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();

    // CFML parity [model/entity/Sku.cfc:L275-L279, L281-L285]: the same absent
    // outer key fails the FIRST of the two guards on each of these.
    expect(sku.getListPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();
    expect(sku.getRenewalPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();
  });

  it('returns undefined from list and renewal when the outer key is PRESENT but the sub-key is absent', async () => {
    // The `SwSkuCurrency` row carries a price and nothing else, so cascade
    // Step 2 [L409] writes `price` and Step 3 is then skipped entirely by the
    // guard at [L416] — leaving `listPrice` and `renewalPrice` genuinely absent
    // under a currency key that DOES exist. This is the case the double guard
    // exists for.
    const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(structKeyExists(details, SECONDARY_CURRENCY_CODE)).toBe(true);

    // CFML parity [model/entity/Sku.cfc:L276]: the second structKeyExists tests
    // the "listPrice" sub-key, so a present currency entry without one answers
    // nothing rather than zero.
    expect(sku.getListPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)).toBeUndefined();

    // CFML parity [model/entity/Sku.cfc:L282]: the same double guard, on
    // "renewalPrice".
    expect(sku.getRenewalPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)).toBeUndefined();

    // …while the sub-key that IS present answers a real amount.
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toDecimalString()).toBe(
      SECONDARY_OVERRIDE_PRICE,
    );
  });

  it('returns a real Money from each accessor when its sub-key is present', async () => {
    const sku = makeSkuFixture();
    await Sku.hydrate(sku);

    // The base currency is filled by Step 1 [L385-L397] from the sku's own
    // columns. Expectations are decimal strings, never computed floats (P4).
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toDecimalString()).toBe(FIXTURE_PRICE);
    expect(sku.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toDecimalString()).toBe(
      FIXTURE_LIST_PRICE,
    );
    expect(sku.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toDecimalString()).toBe(
      FIXTURE_RENEWAL_PRICE,
    );

    // The secondary currency is filled by Step 2 [L399-L414] from its
    // `SwSkuCurrency` row.
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toDecimalString()).toBe(
      SECONDARY_OVERRIDE_PRICE,
    );
    expect(sku.getListPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toDecimalString()).toBe(
      SECONDARY_OVERRIDE_LIST_PRICE,
    );
    expect(sku.getRenewalPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toDecimalString()).toBe(
      SECONDARY_OVERRIDE_RENEWAL_PRICE,
    );
  });

  it('matches the currency key CASE-INSENSITIVELY, as a CFML struct key does', async () => {
    const sku = makeSkuFixture();
    await Sku.hydrate(sku);

    // CFML parity [model/entity/Sku.cfc:L270]: CFML struct keys are
    // case-insensitive, so the lookup goes through `structKeyExists` /
    // `structGet` from src/lib/cfml/struct.ts rather than a bare TypeScript
    // property read.
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY.toLowerCase())?.toDecimalString()).toBe(
      FIXTURE_PRICE,
    );
    expect(
      sku.getListPriceByCurrencyCode(SECONDARY_CURRENCY_CODE.toLowerCase())?.toDecimalString(),
    ).toBe(SECONDARY_OVERRIDE_LIST_PRICE);
  });

  it('★ answers undefined and NOT zero for missing data — validation gate 6', async () => {
    const sku = makeSkuFixture();
    await Sku.hydrate(sku);

    const price = sku.getPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE);

    expect(price).toBeUndefined();

    // A zero substitution would satisfy neither of the next two claims. The
    // consequence is not cosmetic: `Sku.price` is the amount a customer is
    // charged, and a zero here would sell the product for free.
    expect(price).not.toBeInstanceOf(Money);
    expect(price ?? 'ABSENT').toBe('ABSENT');

    // And stated in the bluntest possible terms. The widening to `unknown` is
    // needed only because the shipped return type is `Money | undefined`, which is
    // itself the proof: `0` is not even assignable to it.
    expect(price as unknown).not.toBe(0);
    expect(price as unknown).not.toBe('0');
    expect(price as unknown).not.toBe('0.00');

    // What the WRONG answer would have looked like, recorded so the difference
    // is unmistakable.
    expect(Money.zero.toFixed2()).toBe('0.00');
  });

  it('★ D37 — every eligible currency always carries a `price`, so the single guard is never exercised', async () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L269-L273]: unlike its list/renewal
    // siblings at L276 and L282, this accessor has only the OUTER
    // structKeyExists guard, so a present currency entry lacking a "price"
    // sub-key is unguarded.
    // Preserved deliberately; do not fix without a product decision.
    //
    // CFML parity [model/entity/Sku.cfc:L416, L425]: the case is UNREACHABLE
    // through the real cascade. Step 3's guard tests the "price" sub-key alone,
    // and [L425] then sets `.price` unconditionally for every currency Steps 1
    // and 2 left alone — so the defect is LATENT, not live. That is what this
    // test proves, across all three of the cascade's filling paths at once.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE},${TERTIARY_CURRENCY_CODE}`,
      conversionRates: {
        [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE,
        [TERTIARY_CURRENCY_CODE]: TERTIARY_CONVERSION_RATE,
      },
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    for (const currencyCode of Object.keys(details)) {
      expect(structKeyExists(requireDetail(details, currencyCode), 'price')).toBe(true);
      expect(sku.getPriceByCurrencyCode(currencyCode)).toBeInstanceOf(Money);
    }
  });

  it('★ D37 — pins the shipped resolution of the unguarded read: undefined, never a throw', () => {
    // A priceless entry is UNREACHABLE THROUGH THE CASCADE — the test directly
    // above proves it, because [L394], [L409] and [L425] between them set
    // `.price` for every eligible currency, which is what makes D37 latent
    // rather than live. So the entry has to arrive some other way, and it does:
    // `SkuHydrationInput.currencyDetails` injects a completed map without
    // running the cascade at all. That injection path is the reason this test
    // can assert the ACCESSOR and not merely the helpers underneath it.
    //
    // Both levels are asserted below, in that order: the helpers first, because
    // they are what the accessor's two-step read at [L270-L271] is built from,
    // and then the accessor itself on a real entity.
    //
    // JUDGMENT CALL: this asserts the shipped reality rather than a prediction.
    // CFML would raise "element PRICE is undefined" here; the ported accessor
    // answers undefined instead, because the shipped body reads the sub-key off
    // an already-resolved entry rather than re-entering the struct.
    const priceless: Record<string, CurrencyDetail> = {
      [SETTING_SKU_CURRENCY]: { skuCurrencyID: '' },
    };

    expect(structKeyExists(priceless, SETTING_SKU_CURRENCY)).toBe(true);

    const entry = structGet(priceless, SETTING_SKU_CURRENCY);

    expect(entry).toBeDefined();
    expect(entry?.price).toBeUndefined();

    // …and the same read through the published accessor, on an entity whose memo
    // was injected rather than computed. No collaborator runs here and no
    // hydration boundary is crossed: the constructor seeds the memo from the
    // input, so the cascade never fires for this instance.
    const injected = new Sku({ skuID: 'injected-priceless-sku', currencyDetails: priceless });

    // The OUTER key is unambiguously present — this is not the "currency absent"
    // state — and the accessor still answers nothing rather than raising.
    expect(Object.keys(injected.getCurrencyDetails())).toStrictEqual([SETTING_SKU_CURRENCY]);
    expect(injected.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();

    // The other two accessors reach the same answer by a DIFFERENT route: their
    // second `structKeyExists` at [L276-L277] and [L282-L283] short-circuits
    // before any sub-key read happens. Same undefined, different mechanism.
    expect(injected.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(injected.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
  });
});

// ===========================================================================
// B2 — THE FOUR-STEP CURRENCY RESOLUTION CASCADE
// [model/entity/Sku.cfc:L367-L433]
//
// ★★★ MUST-PRESERVE AREA 2. Every step is asserted, and the two places where
// the shipped module contradicts the specification (corrections C6 and the
// Step-1 sub-key ruling) are asserted as the source has them.
// ===========================================================================

describe('Sku.getCurrencyDetails — the four-step cascade [model/entity/Sku.cfc:L367-L433]', () => {
  it('★ leaves the memo empty and every accessor answering nothing when the eligibility gate is shut', async () => {
    // CFML parity [model/entity/Sku.cfc:L373]: the whole cascade body sits
    // behind `if(len(setting('skuEligibleCurrencies')))`. An empty setting leaves
    // the memo {} and every currency accessor returns undefined — including for
    // the BASE currency, which is the counter-intuitive half.
    const sku = makeSkuFixture({ skuEligibleCurrencies: '', skuCurrencyVariant: 'none' });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(Object.keys(details)).toStrictEqual([]);
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)).toBeUndefined();
  });

  it('★ CORRECTION C6 — with the gate shut the memo IS still seeded but the currency port is NOT consulted', async () => {
    // CFML parity [model/entity/Sku.cfc:L368-L371 vs L373]: [L369] (the memo
    // init) sits INSIDE the [L368] memo guard but OUTSIDE the [L373] eligibility
    // gate, so a closed gate still establishes the memo and a second call is a
    // no-op. [L371]'s currency-service locator is different: the shipped module
    // fuses it with [L375]'s `addInFilter` into ONE
    // `getCurrenciesByCurrencyCodeList` call, and that call sits INSIDE the gate.
    //
    // This corrects the upstream note, which expected the currency port to be
    // consulted exactly once with the gate shut. Verified against
    // src/domain/entities/sku.ts; the SOURCE WINS.
    const settingsLog: SettingsCallLog = [];
    const currencyLog = makeCurrencyConverterLog();

    const sku = makeSkuFixture({
      settingsProvider: makeRecordingSettingsProvider(SETTING_SKU_CURRENCY, '', settingsLog),
      currencyConverter: makeRecordingCurrencyConverter({}, currencyLog),
      skuCurrencyVariant: 'none',
    });

    const first = (await Sku.hydrate(sku)).getCurrencyDetails();
    const second = (await Sku.hydrate(sku)).getCurrencyDetails();

    // The memo is established: the same object comes back and nothing recomputes.
    expect(second).toBe(first);
    expect(sku.getCurrencyDetails()).toBe(first);

    // The settings port WAS consulted, once per key, ahead of the gate.
    expect(settingsLog).toStrictEqual(['skuCurrency', 'skuEligibleCurrencies']);

    // The currency port was NOT consulted at all.
    expect(currencyLog.listings).toStrictEqual([]);
    expect(currencyLog.conversions).toStrictEqual([]);
  });

  it('★ CORRECTION C6 — both collaborator presence checks run BEFORE the gate, not inside it', async () => {
    // The eligibility gate cannot excuse a missing collaborator: [L373]'s
    // settings check and [L371]'s currency check both precede the gate in the
    // shipped body, so a sku with an empty eligible list STILL fails when either
    // is absent. Asserting this is what proves the gate's true extent.
    const withoutSettings = makeSkuFixture({
      settingsProvider: undefined,
      skuEligibleCurrencies: '',
    });

    await expect(Sku.hydrate(withoutSettings)).rejects.toThrow(
      /settings provider .* \[model\/entity\/Sku\.cfc:L373\]/,
    );

    const withoutConverter = makeSkuFixture({
      currencyConverter: undefined,
      skuEligibleCurrencies: '',
      skuCurrencyVariant: 'none',
    });

    await expect(Sku.hydrate(withoutConverter)).rejects.toThrow(
      /currency converter .* \[model\/entity\/Sku\.cfc:L371\]/,
    );
  });

  it('STEP 0 — seeds an entry for every eligible currency unconditionally, with skuCurrencyID ""', async () => {
    // CFML parity [model/entity/Sku.cfc:L381-L382]: the outer key and the
    // `skuCurrencyID = ""` seed are written BEFORE any price is considered, so
    // the OUTER key always exists for an eligible currency and only SUB-keys can
    // ever be absent. That asymmetry is the whole reason the three accessors at
    // [L269-L285] differ.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      conversionRates: { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(Object.keys(details)).toStrictEqual([SETTING_SKU_CURRENCY, SECONDARY_CURRENCY_CODE]);

    // Neither currency has a `SwSkuCurrency` row, so [L412] never fires and the
    // seeded empty string survives on both.
    expect(requireDetail(details, SETTING_SKU_CURRENCY).skuCurrencyID).toBe('');
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).skuCurrencyID).toBe('');
  });

  it('STEP 1 — fills the base currency from the sku\u2019s own columns, price unconditionally', async () => {
    // CFML parity [model/entity/Sku.cfc:L385-L397]: only the currency equal to
    // `setting('skuCurrency')` is touched; [L394] writes `price` with no guard,
    // [L386] and [L390] guard renewal and list on non-nullness, and [L396] marks
    // the entry unconverted.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: SETTING_SKU_CURRENCY,
      skuCurrencyVariant: 'none',
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();
    const detail = requireDetail(details, SETTING_SKU_CURRENCY);

    expect(detail.price?.toDecimalString()).toBe(FIXTURE_PRICE);
    expect(detail.listPrice?.toDecimalString()).toBe(FIXTURE_LIST_PRICE);
    expect(detail.renewalPrice?.toDecimalString()).toBe(FIXTURE_RENEWAL_PRICE);
    expect(detail.converted).toBe(false);
    expect(detail.skuCurrencyID).toBe('');
  });

  it('★ STEP 1 — the two non-null guards are STATICALLY satisfied, so all six sub-keys always appear', async () => {
    // CORRECTION: the specification asks for a Step-1 case in which
    // `listPrice`/`renewalPrice` are explicitly nulled so the sub-keys are
    // absent. THAT CASE IS UNREACHABLE on the shipped class, and the reason is
    // itself a ported contract: [model/entity/Sku.cfc:L55-L57] declare
    // `listPrice`, `price` and `renewalPrice` with `default="0"`, so all three
    // are NON-OPTIONAL `Money` on the entity and [L386]/[L390] can never fail.
    // The four genuinely optional money columns elsewhere in the slice —
    // `SkuCurrency.price` [model/entity/SkuCurrency.cfc:L53],
    // `PriceGroupRate.amount`, `PromotionApplied.discountAmount` and
    // `PromotionReward.amount` — are what the contrast proves.
    //
    // Sub-key absence is therefore reachable only through a Step-2-only entry,
    // which the `secondaryPriceOnly` variant covers above.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: SETTING_SKU_CURRENCY,
      skuCurrencyVariant: 'none',
    });
    const detail = requireDetail(
      (await Sku.hydrate(sku)).getCurrencyDetails(),
      SETTING_SKU_CURRENCY,
    );

    for (const subKey of [
      'price',
      'priceFormatted',
      'listPrice',
      'listPriceFormatted',
      'renewalPrice',
      'renewalPriceFormatted',
      'converted',
    ]) {
      expect(structKeyExists(detail, subKey)).toBe(true);
    }
  });

  it('★ STEP 1 — distinguishes a genuine zero price from a missing price', async () => {
    // A zero is a VALUE and is reported as one; absence is reported as absence.
    // Collapsing the two is exactly the mistake the null gate exists to prevent.
    const sku = makeSkuFixture({
      price: Money.fromDecimalString('0'),
      skuEligibleCurrencies: SETTING_SKU_CURRENCY,
      skuCurrencyVariant: 'none',
    });
    await Sku.hydrate(sku);

    const zero = sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY);

    expect(zero).toBeInstanceOf(Money);
    expect(zero?.toFixed2()).toBe('0.00');

    // …while a currency that is not eligible still answers nothing.
    expect(sku.getPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();
  });

  it('STEP 1 — matches the base currency CASE-INSENSITIVELY, as CFML `eq` does', async () => {
    // CFML parity [model/entity/Sku.cfc:L385]: `thisCurrency.getCurrencyCode() eq
    // this.setting('skuCurrency')` is CFML `eq`, which is case-insensitive, so it
    // goes through `cfEquals` rather than `===`. The eligible list names the
    // currency in lower case while the setting names it in upper case, and Step 1
    // must still fire.
    //
    // `converted === false` is the discriminator: had Step 1 been skipped, Step 3
    // would have filled the entry instead and marked it converted.
    const sku = makeSkuFixture({
      skuCurrency: SETTING_SKU_CURRENCY,
      skuEligibleCurrencies: SETTING_SKU_CURRENCY.toLowerCase(),
      skuCurrencyVariant: 'none',
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();
    const detail = requireDetail(details, SETTING_SKU_CURRENCY.toLowerCase());

    expect(detail.converted).toBe(false);
    expect(detail.price?.toDecimalString()).toBe(FIXTURE_PRICE);
  });

  it('★ STEP 2 — a SwSkuCurrency row for the base currency OVERWRITES what Step 1 wrote', async () => {
    // CFML parity [model/entity/Sku.cfc:L399-L414]: Step 2 runs after Step 1 over
    // the same entry, so an override row replaces the sku's own column value
    // [L409], records the row's identifier [L412] and keeps the entry unconverted
    // [L411].
    const sku = makeSkuFixture({
      skuEligibleCurrencies: SETTING_SKU_CURRENCY,
      skuCurrencyVariant: 'baseOverride',
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();
    const detail = requireDetail(details, SETTING_SKU_CURRENCY);

    expect(detail.price?.toDecimalString()).toBe(BASE_OVERRIDE_PRICE);
    expect(detail.converted).toBe(false);
    expect(detail.skuCurrencyID).not.toBe('');
    expect(detail.skuCurrencyID).toContain('skucurrency');
  });

  it('★★ STEP 2 — is LAST-match-wins, because the legacy loop has NO break', async () => {
    // CFML parity [model/entity/Sku.cfc:L399-L414]: the loop has no break, so the
    // LAST matching SwSkuCurrency row wins. This is the OPPOSITE of the
    // first-match-wins dedupe at L504/L516 in this same file.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'secondaryDuplicated',
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();
    const detail = requireDetail(details, SECONDARY_CURRENCY_CODE);

    // The first row carries the superseded amount; the second must win.
    expect(detail.price?.toDecimalString()).not.toBe(SECONDARY_SUPERSEDED_PRICE);
    expect(detail.price?.toDecimalString()).toBe(SECONDARY_OVERRIDE_PRICE);
    expect(detail.skuCurrencyID).toMatch(/-secondary-second$/);
  });

  it('STEP 2 — writes price while LEAVING Step 1\u2019s list and renewal prices in place', async () => {
    // CFML parity [model/entity/Sku.cfc:L401, L405]: the renewal and list writes
    // are guarded on the ROW's values being non-null, while [L409]'s price write
    // is not. A base-currency row carrying only a price therefore overwrites the
    // price and leaves Step 1's list and renewal prices standing.
    //
    // LEGACY-NOTE [model/entity/Sku.cfc:L409]: CFML cannot store null in a struct
    // key, so a null row value leaves the sub-key ABSENT rather than storing null
    // — which is precisely what lets [L416]'s `structKeyExists` test decide
    // whether Step 3 runs.
    const baseOnlyPriceRow = makeSkuCurrencyDouble(
      'row-base-price-only',
      SETTING_SKU_CURRENCY,
      Money.fromDecimalString(BASE_OVERRIDE_PRICE),
      undefined,
      undefined,
    );

    const sku = makeSkuFixture({
      skuEligibleCurrencies: SETTING_SKU_CURRENCY,
      skuCurrencies: [baseOnlyPriceRow],
    });
    const detail = requireDetail(
      (await Sku.hydrate(sku)).getCurrencyDetails(),
      SETTING_SKU_CURRENCY,
    );

    expect(detail.price?.toDecimalString()).toBe(BASE_OVERRIDE_PRICE);
    expect(detail.listPrice?.toDecimalString()).toBe(FIXTURE_LIST_PRICE);
    expect(detail.renewalPrice?.toDecimalString()).toBe(FIXTURE_RENEWAL_PRICE);
    expect(detail.skuCurrencyID).toBe('row-base-price-only');
    expect(detail.converted).toBe(false);
  });
});

describe('Sku currency cascade — Step 3 and the memo [model/entity/Sku.cfc:L416-L432]', () => {
  it('★★ STEP 3 — converts a currency that Steps 1 and 2 left alone, and marks it converted', async () => {
    // CFML parity [model/entity/Sku.cfc:L416-L428]: the guard is on the "price"
    // sub-key ALONE, so a currency with no base match and no override row is
    // filled entirely by conversion and flagged `converted = true` at [L427].
    //
    // CFML parity [model/entity/Sku.cfc:L415]: the legacy comment introducing
    // this step reads `// Use a conversion mechinism` — "mechanism" is misspelled
    // in the source. Source warts are annotated, never normalised.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      conversionRates: { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();
    const detail = requireDetail(details, SECONDARY_CURRENCY_CODE);

    expect(detail.converted).toBe(true);

    // Expected amounts are decimal strings produced by the injected rate, never
    // by arithmetic written in this file (P4).
    expect(
      detail.price?.equals(Money.fromDecimalString(FIXTURE_PRICE).times(SECONDARY_CONVERSION_RATE)),
    ).toBe(true);
    expect(
      detail.listPrice?.equals(
        Money.fromDecimalString(FIXTURE_LIST_PRICE).times(SECONDARY_CONVERSION_RATE),
      ),
    ).toBe(true);
    expect(
      detail.renewalPrice?.equals(
        Money.fromDecimalString(FIXTURE_RENEWAL_PRICE).times(SECONDARY_CONVERSION_RATE),
      ),
    ).toBe(true);

    // The seeded identifier survives: no SwSkuCurrency row was involved.
    expect(detail.skuCurrencyID).toBe('');
  });

  it('★★ STEP 3 — an eligible currency with NO rate is priced AT PAR and still flagged converted', async () => {
    // CFML parity [model/service/CurrencyService.cfc:L100-L101]: when either
    // currency code is missing from the rate table the conversion service returns
    // the amount UNCONVERTED rather than raising. Step 3 does not inspect the
    // answer, so [L427] still writes `converted = true`.
    //
    // ★ THIS IS THE HIGHEST-CONSEQUENCE BRANCH OF THE WHOLE CASCADE, and it is
    // the one an implementation is most tempted to "improve". Two wrong answers
    // are available and both are worse than par:
    //   * REJECTING. Step 3 awaits each conversion INSIDE the body that builds
    //     the price map, so one unlisted exotic currency would fail
    //     `getCurrencyDetails()` outright and the sku would carry NO prices at
    //     all — including the base-currency price at [L394] that never needed
    //     converting. One missing rate would delist the product.
    //   * SUBSTITUTING ZERO. That sells the product for free, which is the exact
    //     hazard the `undefined`-not-`0` accessor contract at [L269-L285] exists
    //     to prevent.
    //
    // So a par price is deliberately INDISTINGUISHABLE from a converted one here.
    // The `converted` flag records that Step 3 ran, not that a rate was found,
    // and no port member reports the difference because the legacy had none.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      // The rate table is deliberately EMPTY for the secondary currency.
      conversionRates: {},
    });
    // Driven through the class's own static entry point, which is the only public way in:
    // `materializeCurrencyDetails` is PRIVATE on the shipped entity so that the async half of
    // the cascade is not published on the instance, and `Sku.hydrate` is the seam a repository
    // awaits. The detail map is then read back through the synchronous accessor - the same two
    // steps every sibling case in this block takes.
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    // Both currencies are still seeded — nothing was dropped.
    expect(Object.keys(details)).toStrictEqual([SETTING_SKU_CURRENCY, SECONDARY_CURRENCY_CODE]);

    const converted = requireDetail(details, SECONDARY_CURRENCY_CODE);

    expect(converted.converted).toBe(true);
    expect(converted.price?.toDecimalString()).toBe(FIXTURE_PRICE);
    expect(converted.listPrice?.toDecimalString()).toBe(FIXTURE_LIST_PRICE);
    expect(converted.renewalPrice?.toDecimalString()).toBe(FIXTURE_RENEWAL_PRICE);

    // Every accessor answers, and none of them answers zero.
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toDecimalString()).toBe(
      FIXTURE_PRICE,
    );
    expect(sku.getListPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toDecimalString()).toBe(
      FIXTURE_LIST_PRICE,
    );
    expect(sku.getRenewalPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toDecimalString()).toBe(
      FIXTURE_RENEWAL_PRICE,
    );

    // The BASE currency is untouched by the secondary currency's missing rate,
    // which is the half a rejecting converter would have destroyed.
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toDecimalString()).toBe(FIXTURE_PRICE);
    expect(requireDetail(details, SETTING_SKU_CURRENCY).converted).toBe(false);
  });

  it('★ STEP 3 — the conversion IS attempted for the unrated currency, three times, positionally', async () => {
    // Proving the pass-through is the CONVERTER's answer and not a skipped call.
    // [model/entity/Sku.cfc:L418, L422, L425] invoke conversion three times per
    // Step-3 currency, each as (value, skuCurrency, thisCurrencyCode), and the
    // recording double answers at par for all three.
    const currencyLog = makeCurrencyConverterLog();

    const sku = makeSkuFixture({
      settingsProvider: makeRecordingSettingsProvider(
        SETTING_SKU_CURRENCY,
        `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
        [],
      ),
      currencyConverter: makeRecordingCurrencyConverter({}, currencyLog),
      skuCurrencyVariant: 'none',
    });

    await Sku.hydrate(sku);

    expect(currencyLog.conversions).toStrictEqual([
      {
        amount: FIXTURE_RENEWAL_PRICE,
        originalCurrencyCode: SETTING_SKU_CURRENCY,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
      },
      {
        amount: FIXTURE_LIST_PRICE,
        originalCurrencyCode: SETTING_SKU_CURRENCY,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
      },
      {
        amount: FIXTURE_PRICE,
        originalCurrencyCode: SETTING_SKU_CURRENCY,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
      },
    ]);
  });

  it('★★ STEP 3 — is skipped ENTIRELY when a price exists, so list and renewal stay absent', async () => {
    // CFML parity [model/entity/Sku.cfc:L416]: the Step-3 guard tests only the
    // "price" sub-key, so a currency that already has a price never receives
    // converted list or renewal prices even when those sub-keys are missing.
    const currencyLog = makeCurrencyConverterLog();

    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'secondaryPriceOnly',
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        currencyLog,
      ),
    });
    const detail = requireDetail(
      (await Sku.hydrate(sku)).getCurrencyDetails(),
      SECONDARY_CURRENCY_CODE,
    );

    expect(detail.price?.toDecimalString()).toBe(SECONDARY_OVERRIDE_PRICE);
    expect(structKeyExists(detail, 'listPrice')).toBe(false);
    expect(structKeyExists(detail, 'renewalPrice')).toBe(false);
    expect(detail.converted).toBe(false);

    // Not one conversion was attempted: both eligible currencies were satisfied
    // by Steps 1 and 2.
    expect(currencyLog.conversions).toStrictEqual([]);
  });

  it('★ STEP 3 — fires for an override row whose price is absent, and then OVERWRITES the row\u2019s list price', async () => {
    // CFML parity [model/entity/Sku.cfc:L411-L412 vs L416-L428]: an override row
    // with a null price still writes `converted = false` and a non-empty
    // `skuCurrencyID` unconditionally, but leaves the `price` sub-key absent — so
    // Step 3 then fires, overwrites `converted` to true and replaces the list
    // price the row had supplied. The surviving `skuCurrencyID` is the fingerprint
    // that proves Step 2 ran first.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'secondaryPriceAbsent',
      conversionRates: { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
    });
    const detail = requireDetail(
      (await Sku.hydrate(sku)).getCurrencyDetails(),
      SECONDARY_CURRENCY_CODE,
    );

    expect(detail.converted).toBe(true);
    expect(detail.skuCurrencyID).not.toBe('');
    expect(
      detail.price?.equals(Money.fromDecimalString(FIXTURE_PRICE).times(SECONDARY_CONVERSION_RATE)),
    ).toBe(true);
    expect(detail.listPrice?.toDecimalString()).not.toBe(SECONDARY_OVERRIDE_LIST_PRICE);
  });

  it('★ the `converted` flag is a tri-state across one single result', async () => {
    // Three currencies, three filling paths, one call: base by Step 1, secondary
    // by Step 2, tertiary by Step 3.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE},${TERTIARY_CURRENCY_CODE}`,
      conversionRates: {
        [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE,
        [TERTIARY_CURRENCY_CODE]: TERTIARY_CONVERSION_RATE,
      },
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(requireDetail(details, SETTING_SKU_CURRENCY).converted).toBe(false);
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).converted).toBe(false);
    expect(requireDetail(details, TERTIARY_CURRENCY_CODE).converted).toBe(true);

    // …and only the Step-2 entry carries a row identifier.
    expect(requireDetail(details, SETTING_SKU_CURRENCY).skuCurrencyID).toBe('');
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).skuCurrencyID).not.toBe('');
    expect(requireDetail(details, TERTIARY_CURRENCY_CODE).skuCurrencyID).toBe('');
  });

  it('★ calls the conversion port with (amount, base currency, target currency), renewal then list then price', async () => {
    // CFML parity [model/entity/Sku.cfc:L418, L422, L425]: all three conversions
    // read `this.setting('skuCurrency')` as the SOURCE and the currency under
    // consideration as the TARGET, and they occur in that order — renewal price
    // first, then list price, then price.
    const currencyLog = makeCurrencyConverterLog();

    const sku = makeSkuFixture({
      settingsProvider: makeRecordingSettingsProvider(
        SETTING_SKU_CURRENCY,
        `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
        [],
      ),
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        currencyLog,
      ),
      skuCurrencyVariant: 'none',
    });
    await Sku.hydrate(sku);

    // One fused listing call [L371 + L375], carrying the eligibility setting.
    expect(currencyLog.listings).toStrictEqual([
      `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
    ]);

    // Only the non-base currency converts, and the argument order is exact.
    expect(currencyLog.conversions).toStrictEqual([
      {
        amount: FIXTURE_RENEWAL_PRICE,
        originalCurrencyCode: SETTING_SKU_CURRENCY,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
      },
      {
        amount: FIXTURE_LIST_PRICE,
        originalCurrencyCode: SETTING_SKU_CURRENCY,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
      },
      {
        amount: FIXTURE_PRICE,
        originalCurrencyCode: SETTING_SKU_CURRENCY,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
      },
    ]);
  });

  it('★ resolves the base currency ENTIRELY through the settings port — no hardcoded currency', async () => {
    // CFML parity [model/entity/Sku.cfc:L360-L365]: `getCurrencyCode()` memoises
    // `this.setting('skuCurrency')` and nothing else. The `"USD"` default lives in
    // the SETTING DECLARATION [model/service/SettingService.cfc:L221], and the
    // eligible-currency default at [L222] is a runtime-computed active-currency
    // list. Change the setting and Step 1 targets a different currency; nothing in
    // the entity says otherwise.
    const sku = makeSkuFixture({
      skuCurrency: TERTIARY_CURRENCY_CODE,
      skuEligibleCurrencies: `${TERTIARY_CURRENCY_CODE},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      conversionRates: { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
    });

    expect(sku.getCurrencyCode()).toBe(TERTIARY_CURRENCY_CODE);

    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    // Step 1 now targets the tertiary currency…
    expect(requireDetail(details, TERTIARY_CURRENCY_CODE).converted).toBe(false);
    expect(requireDetail(details, TERTIARY_CURRENCY_CODE).price?.toDecimalString()).toBe(
      FIXTURE_PRICE,
    );

    // …and the currency that was the base in every other test now converts.
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).converted).toBe(true);
  });

  it('formats every money sub-key through the CFML numberFormat parity path', async () => {
    // CFML parity [model/entity/Sku.cfc:L395, L410, L426]: the legacy renders
    // these with `getFormattedValue`/`formatValue` under a currency format type.
    // The port renders them with `numberFormat(value, "0.00")` from
    // src/lib/cfml/numberFormat.ts, which is ROUND_HALF_UP over an
    // arbitrary-precision decimal — never float arithmetic (P4).
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      conversionRates: { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(requireDetail(details, SETTING_SKU_CURRENCY).priceFormatted).toBe(
      numberFormat(FIXTURE_PRICE, '0.00'),
    );

    const convertedPrice = Money.fromDecimalString(FIXTURE_PRICE).times(SECONDARY_CONVERSION_RATE);

    // Full precision is retained in the amount and only the PRESENTATION is
    // rounded to two places — the distinction the value object exists to keep.
    expect(convertedPrice.toDecimalString()).toBe('17.991');
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).priceFormatted).toBe(
      numberFormat(convertedPrice.toDecimalString(), '0.00'),
    );
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).priceFormatted).toBe('17.99');
  });

  it('computes the details map ONCE and answers {} until it has been materialised', async () => {
    // CFML parity [model/entity/Sku.cfc:L368]: the memo guard makes a second call
    // a no-op. `getCurrencyDetails()` is the synchronous reader and answers an
    // empty map before materialisation rather than triggering work — which is how
    // the legacy synchronous contract at [L269-L273] survives the loss of
    // Hibernate's lazy loading.
    const currencyLog = makeCurrencyConverterLog();

    const sku = makeSkuFixture({
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        currencyLog,
      ),
    });

    expect(sku.getCurrencyDetails()).toStrictEqual({});
    expect(currencyLog.listings).toStrictEqual([]);

    const first = (await Sku.hydrate(sku)).getCurrencyDetails();
    const second = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(currencyLog.listings).toHaveLength(1);
    expect(second).toBe(first);
    expect(sku.getCurrencyDetails()).toBe(first);
  });
});

// ===========================================================================
// B2b — THE HYDRATION BOUNDARY ITSELF
// `Sku.hydrate` and `Sku.resolveCurrencyCascadeContext`
//
// ★★ These two statics have NO legacy counterpart and are NOT a reshaping of
// one. In CFML the cascade was an ordinary synchronous private read behind a
// memo guard [model/entity/Sku.cfc:L368], because Hibernate resolved the
// currency list lazily and `getService("currencyService")` was a synchronous
// locator [L371]. Neither survives the port: the currency port is asynchronous.
// So the ASYNC HALF of [L367-L433] moved off the published instance surface —
// the cascade is PRIVATE, and these two statics are the only way to reach it.
//
// What that buys is stated as a testable claim rather than an intention:
//   1. `getCurrencyDetails()` KEEPS its legacy name, parameter list and
//      SYNCHRONOUS return, and so do the three accessors it feeds. No
//      signature moved, so the interface-parity budget is untouched.
//   2. The invariant half of the cascade — the two settings reads and the
//      eligible-currency listing, none of which vary from one sku to the next —
//      is resolvable ONCE for a whole result set and injectable per sku. This is
//      an EXPLICITNESS property, not a performance claim: it makes the number of
//      collaborator consultations a fixed, stated fact rather than something a
//      reader has to infer from a loop.
//   3. `{}` from `getCurrencyDetails()` can no longer mean "nobody remembered to
//      call the materialiser". It means what it means in the legacy, and only
//      that: the [L373] gate was shut, or hydration ran no cascade at all.
// ===========================================================================

describe('Sku.hydrate / Sku.resolveCurrencyCascadeContext — the hydration boundary', () => {
  it('★★ resolves the invariant cascade inputs in EXACTLY THREE collaborator calls', async () => {
    // Two settings reads [model/entity/Sku.cfc:L385/L418 and L373] and one
    // currency listing [L371 fused with L375]. Nothing else in the cascade is
    // sku-independent: every `convertCurrency` at [L418], [L422] and [L425]
    // converts THAT sku's own price, so those are intrinsically per-sku and are
    // deliberately not part of this context.
    const settingsLog: SettingsCallLog = [];
    const currencyLog = makeCurrencyConverterLog();

    const context = await Sku.resolveCurrencyCascadeContext(
      makeRecordingSettingsProvider(
        SETTING_SKU_CURRENCY,
        `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
        settingsLog,
      ),
      makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        currencyLog,
      ),
    );

    expect(settingsLog).toStrictEqual(['skuCurrency', 'skuEligibleCurrencies']);
    expect(currencyLog.listings).toStrictEqual([
      `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
    ]);
    expect(currencyLog.conversions).toStrictEqual([]);

    // The open arm carries the branded base code and the eligible list.
    expect(context.eligibilityGateOpen).toBe(true);
    if (!context.eligibilityGateOpen) {
      throw new Error('the gate is open for a populated eligible-currency setting');
    }
    expect(context.baseCurrencyCode).toBe(SETTING_SKU_CURRENCY);
    expect([...context.eligibleCurrencies]).toStrictEqual([
      SETTING_SKU_CURRENCY,
      SECONDARY_CURRENCY_CODE,
    ]);
  });

  it('★ answers a CLOSED-GATE context without consulting the currency port at all', async () => {
    // [model/entity/Sku.cfc:L373]: `if(len(setting('skuEligibleCurrencies')))`.
    // The gate is evaluated HERE, once, so a shut gate short-circuits [L371]'s
    // listing for the whole batch rather than once per sku.
    const settingsLog: SettingsCallLog = [];
    const currencyLog = makeCurrencyConverterLog();

    const context = await Sku.resolveCurrencyCascadeContext(
      makeRecordingSettingsProvider(SETTING_SKU_CURRENCY, '', settingsLog),
      makeRecordingCurrencyConverter({}, currencyLog),
    );

    expect(context).toStrictEqual({ eligibilityGateOpen: false });
    expect(settingsLog).toStrictEqual(['skuCurrency', 'skuEligibleCurrencies']);
    expect(currencyLog.listings).toStrictEqual([]);

    // …and a sku hydrated from it lands in the legacy's closed-gate state.
    const sku = makeSkuFixture({ skuCurrencyVariant: 'none' });

    await Sku.hydrate(sku, context);

    expect(sku.getCurrencyDetails()).toStrictEqual({});
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
  });

  it('★★ A SUPPLIED CONTEXT IS ACTUALLY USED — the sku\u2019s own settings and listing ports go untouched', async () => {
    // ★ THIS IS THE TEST THAT WOULD CATCH THE CONTEXT BEING IGNORED. A batch
    // context that is threaded through but then quietly re-resolved per sku would
    // still produce correct prices, so correctness alone cannot detect it. What
    // detects it is the sku's OWN collaborator log staying empty.
    const ownSettingsLog: SettingsCallLog = [];
    const ownCurrencyLog = makeCurrencyConverterLog();
    const batchSettingsLog: SettingsCallLog = [];
    const batchCurrencyLog = makeCurrencyConverterLog();

    const eligible = `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`;
    const context = await Sku.resolveCurrencyCascadeContext(
      makeRecordingSettingsProvider(SETTING_SKU_CURRENCY, eligible, batchSettingsLog),
      makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        batchCurrencyLog,
      ),
    );

    // Two skus, one context. Their own ports are recorded separately.
    const first = makeSkuFixture({
      idPrefix: 'ctx-first',
      skuCurrencyVariant: 'none',
      settingsProvider: makeRecordingSettingsProvider(
        SETTING_SKU_CURRENCY,
        eligible,
        ownSettingsLog,
      ),
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        ownCurrencyLog,
      ),
    });
    const second = makeSkuFixture({
      idPrefix: 'ctx-second',
      skuCurrencyVariant: 'none',
      settingsProvider: makeRecordingSettingsProvider(
        SETTING_SKU_CURRENCY,
        eligible,
        ownSettingsLog,
      ),
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        ownCurrencyLog,
      ),
    });

    await Sku.hydrate(first, context);
    await Sku.hydrate(second, context);

    // Both are fully hydrated — the cascade really ran for each of them.
    expect(Object.keys(first.getCurrencyDetails()).sort()).toStrictEqual(
      [SETTING_SKU_CURRENCY, SECONDARY_CURRENCY_CODE].sort(),
    );
    expect(Object.keys(second.getCurrencyDetails()).sort()).toStrictEqual(
      [SETTING_SKU_CURRENCY, SECONDARY_CURRENCY_CODE].sort(),
    );

    // ★ AND NEITHER SKU CONSULTED ITS OWN SETTINGS OR LISTING PORT. The invariant
    // half was resolved once, up front, and injected.
    expect(ownSettingsLog).toStrictEqual([]);
    expect(ownCurrencyLog.listings).toStrictEqual([]);

    // The batch ports were consulted exactly once each, for BOTH skus together.
    expect(batchSettingsLog).toStrictEqual(['skuCurrency', 'skuEligibleCurrencies']);
    expect(batchCurrencyLog.listings).toHaveLength(1);

    // The PER-SKU half is the exception, and it is per-sku on purpose: Step 3
    // [model/entity/Sku.cfc:L416-L428] converts THAT sku's own renewal price
    // [L418], list price [L422] and price [L425], so three conversions land on
    // the context's converter for each sku's one non-base currency. Six in total,
    // and no amount of batching can reduce them: each one reads a column that
    // differs from one sku to the next.
    expect(batchCurrencyLog.conversions).toHaveLength(6);
  });

  it('★ a supplied context makes the cascade reachable for a sku with NO collaborators of its own', async () => {
    // The two collaborator-presence checks live in the FALLBACK branch only, which
    // is the whole point of a batch context: the resolution has already happened,
    // so this sku needs neither port. Compare correction C6 above, where no context
    // is supplied and both checks fire.
    const context = await Sku.resolveCurrencyCascadeContext(
      makeRecordingSettingsProvider(SETTING_SKU_CURRENCY, SETTING_SKU_CURRENCY, []),
      makeRecordingCurrencyConverter({}, makeCurrencyConverterLog()),
    );

    const orphan = makeSkuFixture({
      settingsProvider: undefined,
      currencyConverter: undefined,
      skuCurrencyVariant: 'none',
      price: Money.fromDecimalString('10.00'),
    });

    await Sku.hydrate(orphan, context);

    expect(orphan.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
  });

  it('★ hydrate returns THE SAME INSTANCE and is idempotent', async () => {
    // It is a boundary, not a factory. Returning the argument is what lets a
    // caller write `const sku = await Sku.hydrate(buildIt())` without losing the
    // identity every already-wired reference depends on — the sku fixtures wire
    // the instance into a shared product graph before hydration ever happens.
    const currencyLog = makeCurrencyConverterLog();
    const sku = makeSkuFixture({
      skuCurrencyVariant: 'none',
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        currencyLog,
      ),
    });

    const returned = await Sku.hydrate(sku);

    expect(returned).toBe(sku);

    const memo = sku.getCurrencyDetails();

    expect(await Sku.hydrate(sku)).toBe(sku);
    expect(sku.getCurrencyDetails()).toBe(memo);
    expect(currencyLog.listings).toHaveLength(1);
  });

  it('★★ an INJECTED map establishes the memo with no collaborator and no hydration call', async () => {
    // `SkuHydrationInput.currencyDetails` is the second way the memo is
    // established, and it runs nothing. It exists for the save round-trip: the
    // legacy hands the SAME OBJECT back from a save, so its memo survives
    // trivially, whereas a target that rebuilds the entity from the saved row
    // would drop it. Injection is how the map crosses that gap.
    const settingsLog: SettingsCallLog = [];
    const currencyLog = makeCurrencyConverterLog();

    const source = makeSkuFixture({
      settingsProvider: makeRecordingSettingsProvider(
        SETTING_SKU_CURRENCY,
        SETTING_SKU_CURRENCY,
        settingsLog,
      ),
      currencyConverter: makeRecordingCurrencyConverter({}, currencyLog),
      skuCurrencyVariant: 'none',
      price: Money.fromDecimalString('10.00'),
    });

    await Sku.hydrate(source);

    const computed = source.getCurrencyDetails();

    expect(Object.keys(computed)).toStrictEqual([SETTING_SKU_CURRENCY]);

    // A brand-new entity, no ports at all, map handed to the constructor.
    const carried = new Sku({ skuID: 'carried-sku', currencyDetails: computed });

    expect(carried.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');

    // COPIED, not adopted: the map is this instance's, so a later mutation of the
    // caller's object cannot reach inside it.
    expect(carried.getCurrencyDetails()).not.toBe(computed);
    expect(carried.getCurrencyDetails()).toStrictEqual(computed);

    // …and the injected memo satisfies the [L368] guard, so hydration is a no-op
    // even though this sku has no collaborators that could have served one.
    await Sku.hydrate(carried);

    expect(carried.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
  });
});

// ===========================================================================
// B3 — DIVERGENCE (c): LEGACY DEFECTS 17 AND 18 ARE FIXED
// [model/entity/Sku.cfc:L500-L510, L512-L522]
//
// Two of the three members of the project's only domain-side deliberate
// divergence live here. A FOURTH DIVERGENCE IS FORBIDDEN.
// ===========================================================================

describe('Sku option structs — the two authorized memo fixes [model/entity/Sku.cfc:L500-L522]', () => {
  it('★ returns a populated struct keyed by optionGroupID', () => {
    // DELIBERATE DIVERGENCE (c) [model/entity/Sku.cfc:L512-L522]: legacy [L517]
    // writes to `variables.OptionsByGroupIDStruct` — a THIRD stray name, missing
    // the word "Option" rather than differing only in casing — while [L514] and
    // [L521] use `variables.optionsByOptionGroupIDStruct`. Nothing ever populates
    // the key that is returned, so the legacy method ALWAYS answers an empty
    // struct. Fixed here — documented deliberate divergence (c).
    //
    // It qualifies because it is unobservable through the public contract in the
    // only sense that matters to the carve-out: it causes a wrong-but-inert
    // result rather than a different price, and the memo is request-scoped
    // anyway (A2).
    const sku = makeSkuFixture();
    const options = sku.getOptions();
    const struct = sku.getOptionsByOptionGroupIDStruct();

    expect(Object.keys(struct)).toHaveLength(options.length);

    for (const option of options) {
      const optionGroupID = requireOptionGroupOf(option).getOptionGroupID();

      expect(structKeyExists(struct, optionGroupID)).toBe(true);
      expect(structGet(struct, optionGroupID)).toBe(option);
    }
  });

  it('★ returns a populated struct keyed by optionGroupCode', () => {
    // DELIBERATE DIVERGENCE (c) [model/entity/Sku.cfc:L500-L510]: legacy [L502]
    // initialises the WRONG KEY — `variables.optionsByOptionGroupIDStruct = {}` —
    // while [L501], [L504], [L505] and [L509] all address
    // `variables.optionsByOptionGroupCodeStruct`. The inner guard at [L504]
    // therefore reads a struct that does not exist and RAISES on the first
    // option; with no options the loop never runs and [L509] returns the same
    // non-existent key, so the method is broken on EVERY path. As a side effect
    // [L502] also clobbers the ID memo to `{}`.
    // Fixed here — documented deliberate divergence (c).
    const sku = makeSkuFixture();
    const options = sku.getOptions();
    const struct = sku.getOptionsByOptionGroupCodeStruct();

    expect(Object.keys(struct)).toHaveLength(options.length);

    for (const option of options) {
      const optionGroupCode = requireOptionGroupOf(option).getOptionGroupCode() ?? '';

      expect(structKeyExists(struct, optionGroupCode)).toBe(true);
      expect(structGet(struct, optionGroupCode)).toBe(option);
    }
  });

  it('★ keeps the FIRST option per key in BOTH corrected structs', () => {
    // CFML parity [model/entity/Sku.cfc:L504, L516]: the inner guard keeps the
    // FIRST option per key. This is the OPPOSITE of the last-match-wins overwrite
    // in the currency cascade Step 2 at L399-L414 and in the price-group service
    // rate loop at [model/service/PriceGroupService.cfc:L146-L150].
    const sku = makeSkuFixture({ duplicateOptionGroupOption: true });
    const options = sku.getOptions();
    const firstOption = requireOption(options, 0);
    const lastOption = requireOption(options, options.length - 1);
    const sharedGroup = requireOptionGroupOf(firstOption);

    // The graph really does contain two options in one group, in this order.
    expect(requireOptionGroupOf(lastOption).getOptionGroupID()).toBe(
      sharedGroup.getOptionGroupID(),
    );
    expect(lastOption.getOptionID()).not.toBe(firstOption.getOptionID());

    expect(structGet(sku.getOptionsByOptionGroupIDStruct(), sharedGroup.getOptionGroupID())).toBe(
      firstOption,
    );
    expect(
      structGet(sku.getOptionsByOptionGroupCodeStruct(), sharedGroup.getOptionGroupCode() ?? ''),
    ).toBe(firstOption);
  });

  it('answers an empty struct — not a raise — for a sku with no options', () => {
    // The legacy CODE variant raised even here, because [L509] returned a key
    // [L502] never created. The corrected behaviour is an empty struct, which is
    // also the one thing the legacy ID variant already got right.
    const sku = makeSkuFixture({ options: [] });

    expect(sku.getOptionsByOptionGroupIDStruct()).toStrictEqual({});
    expect(sku.getOptionsByOptionGroupCodeStruct()).toStrictEqual({});
  });

  it('★ keeps the two structs INDEPENDENT — the legacy cross-method memo poisoning is gone', () => {
    // Legacy [L502] initialised the ID memo from inside the CODE method, so
    // calling the code variant first satisfied [L513]'s guard and left the ID
    // variant permanently empty. Removing that cross-talk is part of divergence
    // (c), and the order of the two calls below is the proof.
    const sku = makeSkuFixture();
    const expectedKeyCount = sku.getOptions().length;

    const codeStruct = sku.getOptionsByOptionGroupCodeStruct();
    const idStruct = sku.getOptionsByOptionGroupIDStruct();

    expect(Object.keys(codeStruct)).toHaveLength(expectedKeyCount);
    expect(Object.keys(idStruct)).toHaveLength(expectedKeyCount);
    expect(idStruct).not.toBe(codeStruct);
  });

  it('memoises both structs per INSTANCE, and both memos are request-scoped', () => {
    // CFML parity [model/entity/Sku.cfc:L501, L513]: both are memoised into
    // `variables`. A2: every memo on this class is instance-scoped and every
    // instance is request-scoped — nothing is hoisted to module scope, because on
    // a warm container that would leak one request's option graph into another's.
    // This is state management, not an optimisation (C7).
    const sku = makeSkuFixture();

    expect(sku.getOptionsByOptionGroupIDStruct()).toBe(sku.getOptionsByOptionGroupIDStruct());
    expect(sku.getOptionsByOptionGroupCodeStruct()).toBe(sku.getOptionsByOptionGroupCodeStruct());

    const other = makeSkuFixture({ idPrefix: 'other', options: [] });

    expect(other.getOptionsByOptionGroupIDStruct()).toStrictEqual({});
    expect(Object.keys(sku.getOptionsByOptionGroupIDStruct())).not.toHaveLength(0);
  });
});

// ===========================================================================
// B3a — THE THREE OPTION-GROUP-KEYED STRUCTS ACCEPT A RESERVED JAVASCRIPT KEY
// [model/entity/Sku.cfc:L504, L516, L902]
//
// A CFML struct has no prototype chain and no reserved keys, so an option group
// whose CODE, ID or NAME happens to read `__proto__`, `constructor` or
// `toString` was an ordinary key holding an ordinary value. A TypeScript object
// literal inherits `Object.prototype`, which still exposes the legacy
// `__proto__` ACCESSOR, so the plain assignment these three accessors used to
// perform was intercepted: the entry was silently discarded while every key
// around it was recorded, and the record's own prototype was replaced.
//
// These cases are the parity proof for that repair. They are net-new — no
// `meta/tests/**` file exercises a reserved key — and they assert the CFML
// behaviour, not a hardening heuristic: the key is stored VERBATIM and is
// readable back, exactly as any other option-group code would be.
// ===========================================================================

describe('Sku option-group structs — a reserved JS key is an ordinary CFML key [model/entity/Sku.cfc:L504, L516, L902]', () => {
  /** Every key the JavaScript object model treats specially but CFML did not. */
  const RESERVED_KEYS: readonly string[] = ['__proto__', 'constructor', 'toString'];

  /**
   * A sku carrying exactly one option, whose option group is identified, coded
   * AND named by `reservedKey`.
   *
   * All three are set to the same string on purpose: the three accessors under
   * test key by three DIFFERENT columns — code [L504], ID [L516] and name [L902]
   * — so one fixture drives all three without three separate builds.
   */
  const makeSkuWithReservedOptionGroupKey = (reservedKey: string): Sku => {
    const optionGroup = new OptionGroup({
      optionGroupID: reservedKey,
      optionGroupName: reservedKey,
      optionGroupCode: reservedKey,
      optionGroupImage: undefined,
      optionGroupDescription: undefined,
      imageGroupFlag: false,
      sortOrder: 1,
      remoteID: undefined,
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
      options: [],
      optionSortTieBreaker: undefined,
    });

    const option = new Option({
      optionID: 'reserved-key-option',
      optionCode: 'reserved-key-option-code',
      optionName: 'Reserved Key Option',
      optionDescription: undefined,
      sortOrder: 1,
      optionGroup,
      defaultImageID: undefined,
      remoteID: undefined,
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
    });

    return makeSkuFixture({ options: [option] });
  };

  it.each(RESERVED_KEYS)(
    '★ records %s as a real own key in the CODE struct, and leaves the prototype alone',
    (reservedKey) => {
      // The whole hazard in one assertion pair: the key is PRESENT (a plain
      // assignment to `__proto__` would have recorded nothing at all) and the
      // record is still an ordinary object whose prototype was not swapped.
      const struct =
        makeSkuWithReservedOptionGroupKey(reservedKey).getOptionsByOptionGroupCodeStruct();

      expect(Object.keys(struct)).toStrictEqual([reservedKey]);
      expect(Object.prototype.hasOwnProperty.call(struct, reservedKey)).toBe(true);
      expect(Object.getPrototypeOf(struct)).toBe(Object.prototype);
      expect(structKeyExists(struct, reservedKey)).toBe(true);
      expect(structGet(struct, reservedKey)?.getOptionID()).toBe('reserved-key-option');
    },
  );

  it.each(RESERVED_KEYS)(
    '★ records %s as a real own key in the ID struct, and leaves the prototype alone',
    (reservedKey) => {
      const struct =
        makeSkuWithReservedOptionGroupKey(reservedKey).getOptionsByOptionGroupIDStruct();

      expect(Object.keys(struct)).toStrictEqual([reservedKey]);
      expect(Object.prototype.hasOwnProperty.call(struct, reservedKey)).toBe(true);
      expect(Object.getPrototypeOf(struct)).toBe(Object.prototype);
      expect(structGet(struct, reservedKey)?.getOptionID()).toBe('reserved-key-option');
    },
  );

  it.each(RESERVED_KEYS)(
    '★ records %s as a real own key in the deprecated VALUE struct [L902]',
    (reservedKey) => {
      // [L902] keys by the option group's NAME and stores the option's ID, and it
      // has NO existence guard. Neither of those facts changes here; only the
      // write mechanism did.
      const struct = makeSkuWithReservedOptionGroupKey(reservedKey).getOptionsValueStruct();

      expect(Object.keys(struct)).toStrictEqual([reservedKey]);
      expect(Object.getPrototypeOf(struct)).toBe(Object.prototype);
      expect(structGet(struct, reservedKey)).toBe('reserved-key-option');
    },
  );

  it('★ does not leak the value onto Object.prototype, so no later object inherits it', () => {
    // The consequence a plain `struct['__proto__'] = option` would have had.
    // Asserted on a FRESH literal built after the accessors ran, which is the
    // only way to observe global contamination.
    const sku = makeSkuWithReservedOptionGroupKey('__proto__');

    sku.getOptionsByOptionGroupCodeStruct();
    sku.getOptionsByOptionGroupIDStruct();
    sku.getOptionsValueStruct();

    const bystander: Record<string, unknown> = {};

    expect(Object.keys(bystander)).toHaveLength(0);
    expect(bystander['optionGroupID']).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'optionGroupID')).toBe(false);
  });

  it('keeps the CASE-INSENSITIVE first-wins guard, so a case variant does NOT add a second key', () => {
    // CFML parity [model/entity/Sku.cfc:L504, L516]: struct keys are
    // case-insensitive and the guard is `if (!exists)`, so the FIRST option per
    // key wins. `putOwnStructKey` decides only HOW the surviving key is stored,
    // never WHICH key is chosen — this case is the proof that the two concerns
    // stayed separate.
    const build = (suffix: string, code: string): Option => {
      const group = new OptionGroup({
        optionGroupID: code,
        optionGroupName: code,
        optionGroupCode: code,
        optionGroupImage: undefined,
        optionGroupDescription: undefined,
        imageGroupFlag: false,
        sortOrder: 1,
        remoteID: undefined,
        createdDateTime: undefined,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
        options: [],
        optionSortTieBreaker: undefined,
      });

      return new Option({
        optionID: `reserved-key-option-${suffix}`,
        optionCode: `reserved-key-option-code-${suffix}`,
        optionName: `Reserved Key Option ${suffix}`,
        optionDescription: undefined,
        sortOrder: 1,
        optionGroup: group,
        defaultImageID: undefined,
        remoteID: undefined,
        createdDateTime: undefined,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
      });
    };

    const sku = makeSkuFixture({
      options: [build('first', '__proto__'), build('second', '__PROTO__')],
    });

    const codeStruct = sku.getOptionsByOptionGroupCodeStruct();

    // ONE key, spelled the way the FIRST option spelled it, holding the FIRST option.
    expect(Object.keys(codeStruct)).toStrictEqual(['__proto__']);
    expect(structGet(codeStruct, '__PROTO__')?.getOptionID()).toBe('reserved-key-option-first');
    expect(Object.getPrototypeOf(codeStruct)).toBe(Object.prototype);
  });
});

// ===========================================================================
// B4 — H1: THE THIRD KEY MISMATCH IS PRESERVED, NOT FIXED
// [model/entity/Sku.cfc:L241-L251]
// ===========================================================================

describe('Sku.getOptionByOptionGroup* — H1 preserved [model/entity/Sku.cfc:L241-L251]', () => {
  it('resolves an option by optionGroupID, and answers nothing for an unknown group', () => {
    // CFML parity [model/entity/Sku.cfc:L241-L245]: this accessor is CORRECT — it
    // guards the ID struct at [L242] and reads the ID struct at [L243]. The miss
    // path falls off the end with no return, which is CFML null.
    const sku = makeSkuFixture();
    const option = requireOption(sku.getOptions(), 0);
    const optionGroupID = requireOptionGroupOf(option).getOptionGroupID();

    expect(sku.getOptionByOptionGroupID(optionGroupID)).toBe(option);
    expect(sku.getOptionByOptionGroupID('no-such-option-group')).toBeUndefined();
  });

  it('★ MISSES even for a valid, present optionGroupCode', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L247-L251]: guards the optionGroupCode
    // struct at L248 but reads the optionGroupID struct with a code key at L249,
    // so this accessor always misses.
    // Preserved deliberately; do not fix without a product decision.
    //
    // JUDGMENT CALL: this does NOT qualify for divergence (c). Defects 17, 18 and
    // 19 caused redundant recomputation or a poisoned cache; this one changes a
    // RETURNED VALUE, which makes it observable through the public contract and
    // therefore something only a product decision may alter. Fixing 17 and 18
    // actually SHARPENS it: the code struct is now correctly populated, so the
    // [L249] key mismatch is the sole remaining cause of the miss and the miss is
    // now deterministic rather than incidental.
    const sku = makeSkuFixture();
    const option = requireOption(sku.getOptions(), 0);
    const optionGroup = requireOptionGroupOf(option);
    const optionGroupCode = optionGroup.getOptionGroupCode() ?? '';

    // The code really is present, and the corrected code struct really does hold
    // it — so nothing about the fixture explains the miss.
    expect(optionGroupCode).not.toBe('');
    expect(structKeyExists(sku.getOptionsByOptionGroupCodeStruct(), optionGroupCode)).toBe(true);

    expect(sku.getOptionByOptionGroupCode(optionGroupCode)).toBeUndefined();
  });

  it('★ shows the contrast on one fixture: the ID accessor hits where the code accessor misses', () => {
    const sku = makeSkuFixture();
    const option = requireOption(sku.getOptions(), 0);
    const optionGroup = requireOptionGroupOf(option);

    expect(sku.getOptionByOptionGroupID(optionGroup.getOptionGroupID())).toBe(option);
    expect(sku.getOptionByOptionGroupCode(optionGroup.getOptionGroupCode() ?? '')).toBeUndefined();
  });
});

// ===========================================================================
// B5 — getOptionsIDList  [model/entity/Sku.cfc:L524-L533]
// ===========================================================================

describe('Sku.getOptionsIDList [model/entity/Sku.cfc:L524-L533]', () => {
  it('answers the empty string for a sku with no options', () => {
    // CFML parity [model/entity/Sku.cfc:L526]: the accumulator is seeded to `""`
    // and the loop at [L527] never runs, so `""` is returned — one of the five
    // distinct empty-collection semantics, and NOT interchangeable with the
    // others (B25).
    expect(makeSkuFixture({ options: [] }).getOptionsIDList()).toBe('');
  });

  it('answers a comma list of option identifiers in options order, with NO leading delimiter', () => {
    // CFML parity [model/entity/Sku.cfc:L528]: `listAppend` with the default
    // delimiter. `src/lib/cfml/list.ts`'s `listAppend` returns the value itself
    // when the list is empty, which is exactly why no leading comma appears.
    const sku = makeSkuFixture();
    const expected = sku
      .getOptions()
      .map((option) => option.getOptionID())
      .join(',');

    expect(sku.getOptionsIDList()).toBe(expected);
    expect(sku.getOptionsIDList().startsWith(',')).toBe(false);
    expect(listToArray(sku.getOptionsIDList())).toHaveLength(sku.getOptions().length);
  });

  it('memoises the list per instance, and the memo is request-scoped', () => {
    // CFML parity [model/entity/Sku.cfc:L525]: the memo guard. Mutating the LIVE
    // options array directly — which `getOptions()` deliberately hands back
    // uncopied — bypasses `addOption`'s invalidation and is therefore the honest
    // way to observe that a memo exists at all.
    const sku = makeSkuFixture();
    const memoised = sku.getOptionsIDList();
    const strayGroup = makeOptionGroupDouble('stray-group', 'stray', 'Stray', 9);

    sku.getOptions().push(makeOptionDouble('stray-option', 'stray-code', 'Stray', strayGroup, 9));

    expect(sku.getOptionsIDList()).toBe(memoised);
    expect(sku.getOptionsIDList()).not.toContain('stray-option');

    // A2: a second instance computes its own answer and never sees the first's.
    expect(makeSkuFixture({ idPrefix: 'other', options: [] }).getOptionsIDList()).toBe('');
  });
});

// ===========================================================================
// B6 — getSkuDefinition and THE DISCARDED trim()
// [model/entity/Sku.cfc:L574-L590]
// ===========================================================================

describe('Sku.getSkuDefinition [model/entity/Sku.cfc:L574-L590]', () => {
  it('★ retains the LEADING SPACE on every segment of a merchandise definition', async () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L583]: trim() is called but its return
    // value is discarded, so the leading space introduced at L581 is never
    // removed.
    // Preserved deliberately; do not fix without a product decision.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);
    const definition = await sku.getSkuDefinition();

    expect(definition.startsWith(' ')).toBe(true);
    expect(definition).not.toBe(definition.trim());
  });

  it('joins multiple options with a comma, each segment " <group>: <option>"', async () => {
    // CFML parity [model/entity/Sku.cfc:L581]: the appended element is
    // `" #optionGroupName#: #optionName#"` and the delimiter is an explicit `","`.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);
    const expected = sku
      .getOptions()
      .map(
        (option) =>
          ` ${requireOptionGroupOf(option).getOptionGroupName() ?? ''}: ${option.getOptionName() ?? ''}`,
      )
      .join(',');

    expect(await sku.getSkuDefinition()).toBe(expected);
  });

  it('★ answers the empty string for a contentAccess sku, because the legacy branch is EMPTY', async () => {
    // CFML parity [model/entity/Sku.cfc:L577-L578]: the contentAccess branch is
    // literally empty, so the seeded "" is returned.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_CONTENT_ACCESS);

    expect(await sku.getSkuDefinition()).toBe('');
  });

  it('answers the empty string for a base type matching NONE of the three branches', async () => {
    // CFML parity [model/entity/Sku.cfc:L576]: the seed survives when no branch
    // matches. Nothing is invented for the unmatched case.
    const sku = makeSkuWithBaseProductType('bundle');

    expect(await sku.getSkuDefinition()).toBe('');
  });

  it('compares the base product type CASE-INSENSITIVELY, as CFML `eq` does', async () => {
    // CFML parity [model/entity/Sku.cfc:L577, L579, L584]: all three comparisons
    // are CFML `eq`, so they go through `cfEquals` and an upper-cased system code
    // still selects the merchandise branch.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE.toUpperCase());
    const definition = await sku.getSkuDefinition();

    expect(definition).not.toBe('');
    expect(definition.startsWith(' ')).toBe(true);
  });

  it('★ CORRECTION C9 — REFUSES a subscription sku rather than faking a definition', async () => {
    // CFML parity [model/entity/Sku.cfc:L584-L585]: the subscription branch reads
    // `getSubscriptionTerm().getSubscriptionTermName()` and the JavaRB key
    // `rbKey('entity.subscriptionTerm')`. `SubscriptionTerm` is an out-of-scope
    // entity — collapsed to an opaque `subscriptionTermID` — and JavaRB is not
    // ported, so the shipped module THROWS rather than returning a placeholder.
    //
    // This corrects the upstream note, which expected an inert rbKey string
    // constant. Returning '' or a placeholder here would be a wrong answer
    // presented as a right one; the refusal is the honest port. No i18n runtime is
    // introduced anywhere.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_SUBSCRIPTION);

    await expect(sku.getSkuDefinition()).rejects.toThrow(/subscription sku/);
  });

  it('memoises the definition per instance (A2)', async () => {
    const sku = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);
    const first = await sku.getSkuDefinition();
    const strayGroup = makeOptionGroupDouble('stray-group', 'stray', 'Stray', 9);

    sku.getOptions().push(makeOptionDouble('stray-option', 'stray-code', 'Stray', strayGroup, 9));

    expect(await sku.getSkuDefinition()).toBe(first);
    expect(await sku.getSkuDefinition()).not.toContain('Stray');
  });

  it('answers the empty string for a merchandise sku with no options', async () => {
    // The merchandise branch runs but its loop does not, so the seed survives.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE, []);

    expect(await sku.getSkuDefinition()).toBe('');
  });
});

// ===========================================================================
// B7 — THE getSalePrice* FAMILY  [model/entity/Sku.cfc:L539-L565]
//
// This family is the CORRECT control that proves Product's defect 20.
// ===========================================================================

describe('Sku sale-price accessors [model/entity/Sku.cfc:L539-L565]', () => {
  const SALE_PRICE = '12.34';
  const SALE_SKU_ID = 'salepricesku';

  const saleDetail = {
    skuID: SALE_SKU_ID,
    discountLevel: 'sku',
    salePriceDiscountType: 'percentageOff',
    salePrice: Money.fromDecimalString(SALE_PRICE),
    promotionID: 'promotion-under-test',
    salePriceExpirationDateTime: new Date(SALE_PRICE_EXPIRATION_UTC),
  } as const;

  it('★ CORRECTION C8 — answers the PRE-MATERIALISED detail row, computing nothing', () => {
    // CFML parity [model/entity/Sku.cfc:L539-L544]: the legacy memoises
    // `getProduct().getSkuSalePriceDetails( getSkuID() )`. `Product`'s ported
    // member is ASYNCHRONOUS — it is backed by the CTE rewrite of the
    // query-of-queries chain at [model/dao/PromotionDAO.cfc:L544-L588] — and
    // making this accessor async would cascade onto the three synchronous readers
    // at [L546], [L553] and [L560] that `product.ts` depends on. The row is
    // therefore materialised during hydration and read synchronously, exactly as
    // the currency cascade is. There is no product delegation and no second memo.
    //
    // This corrects the upstream note, which expected a delegation.
    const sku = makeSkuFixture({ skuID: SALE_SKU_ID, salePriceDetail: saleDetail });

    expect(sku.getSalePriceDetails()).toBe(saleDetail);
    expect(sku.getSalePriceDetails()).toBe(sku.getSalePriceDetails());
  });

  it('answers nothing when no sale-price row was projected', () => {
    // `undefined` where the legacy answered an empty struct: all three readers
    // test for their key first, so absence and an empty struct are
    // indistinguishable to every caller.
    expect(makeSkuFixture().getSalePriceDetails()).toBeUndefined();
  });

  it('★ getSalePrice falls back to getPrice — the control that proves Product defect 20', () => {
    // CFML parity [model/entity/Sku.cfc:L546-L551]: Sku correctly falls back to
    // getPrice(). This is the control that proves Product.getSalePrice()
    // [model/entity/Product.cfc:L594-L601] returning 0 is legacy defect 20 — its
    // [L598] statement has no `return`, so execution falls through to `return 0`.
    // Do NOT propagate that defect here.
    const withSale = makeSkuFixture({ skuID: SALE_SKU_ID, salePriceDetail: saleDetail });
    const withoutSale = makeSkuFixture();

    expect(withSale.getSalePrice().toDecimalString()).toBe(SALE_PRICE);
    expect(withoutSale.getSalePrice().toDecimalString()).toBe(FIXTURE_PRICE);
    expect(withoutSale.getSalePrice().equals(withoutSale.getPrice())).toBe(true);

    // …and it is never zero-by-accident, which is the whole difference.
    expect(withoutSale.getSalePrice().toFixed2()).not.toBe('0.00');
  });

  it('getSalePriceDiscountType answers the empty string on a miss, never undefined', () => {
    // CFML parity [model/entity/Sku.cfc:L557]: `""` is returned, not null, because
    // callers concatenate and compare this value as a string.
    expect(makeSkuFixture().getSalePriceDiscountType()).toBe('');
    expect(
      makeSkuFixture({
        skuID: SALE_SKU_ID,
        salePriceDetail: saleDetail,
      }).getSalePriceDiscountType(),
    ).toBe('percentageOff');
  });

  it('★ getSalePriceExpirationDateTime is CORRECTLY SPELLED here and answers "" on a miss', () => {
    // CFML parity [model/entity/Sku.cfc:L560-L565]: the union `Date | ''` is
    // faithful — [L562] returns a timestamp and [L564] returns an empty string,
    // and CFML's `any` return type permitted both.
    //
    // CFML parity [model/entity/Product.cfc:L614, L618]: the product's
    // DECLARATION at L614 is spelled correctly while its CALL SITE at L618 reads
    // `getSalePricExpirationDateTime()` — missing the `e` in "Price". That typo
    // belongs to `product.ts`'s surface and is NOT imported into this suite.
    const withSale = makeSkuFixture({ skuID: SALE_SKU_ID, salePriceDetail: saleDetail });

    expect(makeSkuFixture().getSalePriceExpirationDateTime()).toBe('');

    const expiration = withSale.getSalePriceExpirationDateTime();

    expect(expiration).toBeInstanceOf(Date);

    // Every business date in this suite is an explicit UTC ISO-8601 instant.
    expect(expiration instanceof Date ? expiration.toISOString() : '').toBe(
      SALE_PRICE_EXPIRATION_UTC,
    );
  });

  it('answers "" for the expiration when the row exists but carries no expiry', () => {
    // The reader tests BOTH the row and the sub-key [L561], so a projected row
    // with no expiry still answers the empty string.
    const sku = makeSkuFixture({
      skuID: SALE_SKU_ID,
      salePriceDetail: {
        skuID: SALE_SKU_ID,
        discountLevel: 'global',
        salePriceDiscountType: 'amount',
        salePrice: Money.fromDecimalString(SALE_PRICE),
        promotionID: 'promotion-without-expiry',
      },
    });

    expect(sku.getSalePriceExpirationDateTime()).toBe('');
    expect(sku.getSalePrice().toDecimalString()).toBe(SALE_PRICE);
  });
});

// ===========================================================================
// B8 — getLivePrice, THE THREE-WAY MINIMUM  [model/entity/Sku.cfc:L482-L498]
// ===========================================================================

describe('Sku.getLivePrice [model/entity/Sku.cfc:L482-L498]', () => {
  const SALE_SKU_ID = 'livepricesku';

  const saleDetailAt = (salePrice: string) =>
    ({
      skuID: SALE_SKU_ID,
      discountLevel: 'sku',
      salePriceDiscountType: 'amount',
      salePrice: Money.fromDecimalString(salePrice),
      promotionID: 'promotion-live-price',
    }) as const;

  it('★ answers the MINIMUM of price, salePrice and currentAccountPrice', async () => {
    // CFML parity [model/entity/Sku.cfc:L485-L495]: the array is seeded with
    // getPrice(), the sale price and the current-account price are appended, the
    // array is sorted `"numeric" "asc"` and `prices[1]` is taken. `prices[1]`
    // after an ascending sort IS the minimum, so the port takes the minimum
    // directly rather than sorting three elements and indexing.
    //
    // Every comparison here is a Money/decimal-string comparison. No expected
    // value in this suite is a computed JavaScript float (P4).
    const currentAccountWins = makeSkuFixture({
      skuID: SALE_SKU_ID,
      salePriceDetail: saleDetailAt('15.00'),
      currentAccountPrice: Money.fromDecimalString('9.99'),
    });
    const saleWins = makeSkuFixture({
      skuID: SALE_SKU_ID,
      salePriceDetail: saleDetailAt('11.11'),
      currentAccountPrice: Money.fromDecimalString('14.00'),
    });
    const basePriceWins = makeSkuFixture({
      skuID: SALE_SKU_ID,
      salePriceDetail: saleDetailAt('25.00'),
      currentAccountPrice: Money.fromDecimalString('31.00'),
    });

    expect((await currentAccountWins.getLivePrice()).toDecimalString()).toBe('9.99');
    expect((await saleWins.getLivePrice()).toDecimalString()).toBe('11.11');
    expect((await basePriceWins.getLivePrice()).toDecimalString()).toBe(FIXTURE_PRICE);
  });

  it('still answers the minimum when two candidates tie', async () => {
    // The seed at [L485] and the appended candidate are equal, so `isLessThan`
    // never fires and the seeded value stands. Whichever of two equal Money values
    // is returned, the ANSWER is the same amount — which is the only observable
    // property.
    const sku = makeSkuFixture({
      skuID: SALE_SKU_ID,
      salePriceDetail: saleDetailAt(FIXTURE_PRICE),
      currentAccountPrice: Money.fromDecimalString(FIXTURE_PRICE),
    });

    expect((await sku.getLivePrice()).toDecimalString()).toBe(FIXTURE_PRICE);
    expect((await sku.getLivePrice()).equals(sku.getPrice())).toBe(true);
  });

  it('falls back to the base price on all three candidates when nothing undercuts it', async () => {
    // With no sale row the sale accessor answers getPrice() [L550], and the
    // fixture resolver answers getPrice() for an account with no price groups —
    // which is the legacy answer at [model/service/PriceGroupService.cfc:L271-L298],
    // not a convenience.
    const sku = makeSkuFixture();

    expect((await sku.getLivePrice()).toDecimalString()).toBe(FIXTURE_PRICE);
  });

  it('★ CORRECTION — the legacy null-sort hazard is STRUCTURALLY ELIMINATED, not reproduced', async () => {
    // CFML parity [model/entity/Sku.cfc:L489, L492]: the legacy appends
    // `getCurrentAccountPrice()` and then sorts `arraySort(prices,"numeric","asc")`.
    // `Product.getCurrentAccountPrice()` [model/entity/Product.cfc:L588-L592] has no
    // `else` and no trailing return, so it can hand back NULL, and a `"numeric"`
    // sort over a null throws.
    //
    // JUDGMENT CALL: the ported resolver member returns a non-nullable
    // `Promise<Money>`, so there is no null to append and the throw is
    // unreachable. That is a TYPE-LEVEL fix, not a behavioural divergence — the
    // minimum of the same three candidates is unchanged — so it does not consume
    // one of the three authorized divergences. The upstream note expected this
    // suite to pin a throw, a skip or a coercion; the shipped surface makes all
    // three unreachable, and the honest assertion is that the candidate is always
    // a Money.
    const sku = makeSkuFixture();
    const candidate = await sku.getCurrentAccountPrice();

    expect(candidate).toBeInstanceOf(Money);
    expect((await sku.getLivePrice()).toDecimalString()).toBe(FIXTURE_PRICE);
  });

  it('memoises the live price per instance, and the memo is request-scoped (A2)', async () => {
    const resolverLog: ResolverCall[] = [];
    const sku = makeSkuFixture({
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('5.00'),
        Money.fromDecimalString('7.77'),
        resolverLog,
      ),
    });

    const first = await sku.getLivePrice();

    expect(first.toDecimalString()).toBe('7.77');
    expect(await sku.getLivePrice()).toBe(first);
    expect(
      resolverLog.filter((call) => call.member === 'calculateSkuPriceBasedOnCurrentAccount'),
    ).toHaveLength(1);

    // A second instance computes its own answer from its own collaborators.
    const otherLog: ResolverCall[] = [];
    const other = makeSkuFixture({
      idPrefix: 'other',
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('5.00'),
        Money.fromDecimalString('18.18'),
        otherLog,
      ),
    });

    expect((await other.getLivePrice()).toDecimalString()).toBe('18.18');
    expect((await sku.getLivePrice()).toDecimalString()).toBe('7.77');
  });
});

// ===========================================================================
// B9 — getCurrentAccountPrice AND THE T6 SCOPE REPLACEMENT
// [model/entity/Sku.cfc:L435-L440]
// ===========================================================================

describe('Sku.getCurrentAccountPrice [model/entity/Sku.cfc:L435-L440]', () => {
  it('delegates through the injected resolver, always passing ITSELF as the sku', async () => {
    // CFML parity [model/entity/Sku.cfc:L437]: the legacy
    // `getService("priceGroupService").calculateSkuPriceBasedOnCurrentAccount(sku=this)`
    // becomes one constructor-injected port, and the `sku=this` argument is
    // carried over verbatim. Transformation rule T2: no service locator survives.
    const resolverLog: ResolverCall[] = [];
    const sku = makeSkuFixture({
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('5.00'),
        Money.fromDecimalString('12.12'),
        resolverLog,
      ),
    });

    expect((await sku.getCurrentAccountPrice()).toDecimalString()).toBe('12.12');
    expect(resolverLog).toEqual([
      {
        member: 'calculateSkuPriceBasedOnCurrentAccount',
        skuID: sku.getSkuID(),
        priceGroupID: '',
        accountID: 'skfx-account',
      },
    ]);
  });

  it('★ CORRECTION C7 — the request scope becomes a CONSTRUCTOR-INJECTED context, not a parameter', async () => {
    // CFML parity [model/entity/Sku.cfc:L437 and model/service/PriceGroupService.cfc:L262-L268]:
    // the service reads the ambient request scope through `getSlatwallScope()` —
    // itself an inconsistency, since the rest of the codebase uses
    // `getHibachiScope()` — and both are replaced by an explicit context
    // (transformation rule T6). No ambient state is available to this suite at all.
    //
    // The upstream note expected an explicit METHOD PARAMETER. The shipped
    // accessor takes NONE: the legacy signature is `getCurrentAccountPrice()` with
    // no arguments, interface parity is the acceptance contract (C4), and the
    // entity-layer signature-widening budget is spent — the single permitted
    // widening is `PromotionPeriod.isCurrent(now)`, owned by a sibling suite. The
    // context is therefore hydrated in, exactly as the ports are, and it still
    // flows through explicitly.
    const resolverLog: ResolverCall[] = [];
    const sku = makeSkuFixture({
      currentAccountContext: { accountID: 'account-under-test' },
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('5.00'),
        Money.fromDecimalString('3.33'),
        resolverLog,
      ),
    });

    // Zero declared parameters — the legacy arity, preserved.
    expect(arityOf(sku, 'getCurrentAccountPrice')).toBe(0);

    await sku.getCurrentAccountPrice();

    expect(resolverLog[0]?.accountID).toBe('account-under-test');
  });

  it('refuses honestly when the resolver or the context was not hydrated', async () => {
    // Both refusals cite [L437], the line that dereferences unconditionally. A
    // silent `Money.zero` here would be a free product (B1.4's failure mode by
    // another route).
    const noResolver = makeSkuFixture({ priceGroupResolver: undefined });
    const noContext = makeSkuFixture({ currentAccountContext: undefined });

    await expect(noResolver.getCurrentAccountPrice()).rejects.toThrow(
      /price-group resolver collaborator was not injected/,
    );
    await expect(noResolver.getCurrentAccountPrice()).rejects.toThrow(
      /\[model\/entity\/Sku\.cfc:L437\]/,
    );
    await expect(noContext.getCurrentAccountPrice()).rejects.toThrow(
      /current-account context collaborator was not injected/,
    );
  });

  it('memoises the account price per instance [model/entity/Sku.cfc:L436]', async () => {
    const resolverLog: ResolverCall[] = [];
    const sku = makeSkuFixture({
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('5.00'),
        Money.fromDecimalString('1.23'),
        resolverLog,
      ),
    });

    const first = await sku.getCurrentAccountPrice();

    expect(await sku.getCurrentAccountPrice()).toBe(first);
    expect(resolverLog).toHaveLength(1);
  });
});

// ===========================================================================
// B10 — getPriceByPromotion: DEFECT 16, A THROWING STUB
// [model/entity/Sku.cfc:L257-L259]
// ===========================================================================

describe('Sku.getPriceByPromotion — defect 16 [model/entity/Sku.cfc:L257-L259]', () => {
  const promotionUnderTest = new Promotion({
    promotionID: 'promotion-defect-16',
    promotionName: 'Defect 16 probe',
  });

  it('★ THROWS, because the method it calls does not exist anywhere in the source', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L258]: the body calls
    // getService("promotionService").calculateSkuPriceBasedOnPromotion(), a method
    // that does not exist, so the legacy accessor throws at runtime.
    // Preserved deliberately; do not fix without a product decision.
    //
    // Verified by repository-wide search: `calculateSkuPriceBasedOnPromotion`
    // occurs at exactly ONE place in the entire tree — this call site. It is not
    // on `model/service/PromotionService.cfc`, not under `org/Hibachi/`, and not
    // reachable through `HibachiService.onMissingMethod`, whose dispatch list
    // [org/Hibachi/HibachiService.cfc:L255-L280] contains no `calculate*` prefix
    // and which throws at [L280].
    const sku = makeSkuFixture();

    expect(() => sku.getPriceByPromotion(promotionUnderTest)).toThrow(
      /calculateSkuPriceBasedOnPromotion, which does not exist/,
    );
  });

  it('★ reaches the refusal with a WELL-FORMED promotion, so it cannot be an argument fault', () => {
    // JUDGMENT CALL: NO promotion-price port was invented to make this member
    // work, and no 14th port exists. The ledger is locked at thirteen —
    // productRepository, skuRepository, optionRepository, productTypeRepository,
    // promotionRepository, priceGroupRepository, settingsProvider,
    // currencyConverter, addressZoneEvaluator, urlTitleGenerator, imageStore,
    // subscriptionTermProvider, productFeedPort. Fabricating a fourteenth to make
    // a broken accessor return a number would convert a visible runtime failure
    // into an invisible wrong price.
    const sku = makeSkuFixture();

    // The refusal names the promotion, which proves the argument was accepted,
    // dereferenced and only THEN did the missing service call fail.
    expect(promotionUnderTest.getPromotionID()).toBe('promotion-defect-16');
    expect(() => sku.getPriceByPromotion(promotionUnderTest)).toThrow(
      /promotion 'promotion-defect-16'/,
    );
    expect(() => sku.getPriceByPromotion(promotionUnderTest)).toThrow(
      /\[model\/entity\/Sku\.cfc:L258\]/,
    );
  });

  it('is declared as never-returning, so no caller can silently consume a price from it', () => {
    // The `never` return type is how the compiler prevents this defect from being
    // absorbed into arithmetic. A caller cannot bind its result to a Money.
    const sku = makeSkuFixture();

    expect(() => sku.getPriceByPromotion(promotionUnderTest)).toThrow(Error);
  });
});

// ===========================================================================
// B11 — THE PRICE-GROUP ACCESSORS, THE CORRECT CONTROL
// [model/entity/Sku.cfc:L261-L267]
// ===========================================================================

describe('Sku price-group accessors [model/entity/Sku.cfc:L261-L267]', () => {
  const makePriceGroupWithRates = (rates: PriceGroupRate[]): PriceGroup =>
    new PriceGroup({
      priceGroupID: 'pricegroup-under-test',
      priceGroupIDPath: 'pricegroup-under-test',
      activeFlag: true,
      priceGroupName: 'Wholesale',
      priceGroupCode: 'wholesale',
      parentPriceGroup: undefined,
      childPriceGroups: [],
      priceGroupRates: rates,
      promotionRewards: [],
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: undefined,
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: undefined,
    });

  it('getPriceByPriceGroup answers a real Money through the injected resolver, passing ITSELF', () => {
    // CFML parity [model/entity/Sku.cfc:L262]: `calculateSkuPriceBasedOnPriceGroup(sku=this, priceGroup=...)`
    // — the locator becomes the port and `sku=this` is carried over verbatim.
    const resolverLog: ResolverCall[] = [];
    const sku = makeSkuFixture({
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('13.13'),
        Money.fromDecimalString('5.00'),
        resolverLog,
      ),
    });
    const priceGroup = makePriceGroupWithRates([]);

    expect(sku.getPriceByPriceGroup(priceGroup).toDecimalString()).toBe('13.13');
    expect(resolverLog).toEqual([
      {
        member: 'calculateSkuPriceBasedOnPriceGroup',
        skuID: sku.getSkuID(),
        priceGroupID: 'pricegroup-under-test',
        accountID: '',
      },
    ]);
  });

  it('★ getAppliedPriceGroupRateByPriceGroup names its sku argument CORRECTLY — the ProductType control', () => {
    // CFML parity [model/entity/Sku.cfc:L265-L267]: this call names the sku
    // argument correctly. It is the control that proves
    // ProductType.getAppliedPriceGroupRateByPriceGroup
    // [model/entity/ProductType.cfc:L117-L119] passing `product=this` to a
    // REQUIRED `productType` parameter [model/service/PriceGroupService.cfc:L57]
    // is a defect that throws. That defect belongs to `productType.test.ts`; this
    // suite owns the correct half of the contrast.
    const resolverLog: ResolverCall[] = [];
    const sku = makeSkuFixture({
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('13.13'),
        Money.fromDecimalString('5.00'),
        resolverLog,
      ),
    });
    const applicable = new PriceGroupRate({
      priceGroupRateID: 'rate-applicable',
      amount: Money.fromDecimalString('10.00'),
      amountType: 'amount',
      skus: [sku],
    });
    const priceGroup = makePriceGroupWithRates([applicable]);

    expect(sku.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toBe(applicable);
    expect(resolverLog[0]?.member).toBe('getRateForSkuBasedOnPriceGroup');
    expect(resolverLog[0]?.skuID).toBe(sku.getSkuID());
  });

  it('answers nothing when no rate in the price group applies to this sku', () => {
    // `PriceGroupRate.hasSku` compares by PRIMARY KEY, never by identity, so a
    // structurally identical sku with a different id does not match.
    const sku = makeSkuFixture();
    const foreign = makeSkuFixture({ idPrefix: 'foreign' });
    const priceGroup = makePriceGroupWithRates([
      new PriceGroupRate({ priceGroupRateID: 'rate-foreign', skus: [foreign] }),
    ]);

    expect(sku.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toBeUndefined();
  });

  it('★ keeps the LAST matching rate, because the legacy service loop has no break', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L146-L150]: the rate loop
    // has no `break`, so a later matching rate supersedes an earlier one. This is
    // the SAME direction as the currency cascade's Step 2 and the OPPOSITE of the
    // first-match-wins option structs at [model/entity/Sku.cfc:L504, L516].
    const sku = makeSkuFixture();
    const first = new PriceGroupRate({ priceGroupRateID: 'rate-first', skus: [sku] });
    const last = new PriceGroupRate({ priceGroupRateID: 'rate-last', skus: [sku] });
    const priceGroup = makePriceGroupWithRates([first, last]);

    expect(sku.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toBe(last);
  });

  it('refuses honestly when the resolver was not hydrated, citing L262 and L266 respectively', () => {
    const sku = makeSkuFixture({ priceGroupResolver: undefined });
    const priceGroup = makePriceGroupWithRates([]);

    expect(() => sku.getPriceByPriceGroup(priceGroup)).toThrow(/\[model\/entity\/Sku\.cfc:L262\]/);
    expect(() => sku.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toThrow(
      /\[model\/entity\/Sku\.cfc:L266\]/,
    );
  });
});

// ===========================================================================
// B12 — getDefaultFlag IS UNGUARDED  [model/entity/Sku.cfc:L442-L447]
// ===========================================================================

describe('Sku.getDefaultFlag [model/entity/Sku.cfc:L442-L447]', () => {
  it('answers true when the product default sku matches, false when it does not', () => {
    // CFML parity [model/entity/Sku.cfc:L443, L446]: `true` on a match and an
    // explicit `false` otherwise. The comparison is CFML `==` on strings, which is
    // CASE-INSENSITIVE, so it goes through `cfEquals` rather than `===`.
    const theDefault = makeSkuFixture({ idPrefix: 'thedefault' });
    const product = makeProductFixture({
      productID: 'defaultflag-product',
      skus: [],
      defaultSku: theDefault,
    });
    const isDefault = makeSkuFixture({ skuID: theDefault.getSkuID(), product });
    const isNotDefault = makeSkuFixture({ skuID: 'some-other-sku', product });

    expect(isDefault.getDefaultFlag()).toBe(true);
    expect(isNotDefault.getDefaultFlag()).toBe(false);

    // The deprecated inverse [L907-L910] is exactly `!getDefaultFlag()`.
    expect(isDefault.isNotDefaultSku()).toBe(false);
    expect(isNotDefault.isNotDefaultSku()).toBe(true);
  });

  it('★ THROWS when the product is absent, and again when the product has no default sku', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L442-L447]: the
    // getProduct().getDefaultSku().getSkuID() chain is unguarded, so a sku with no
    // product or a product with no default sku throws instead of returning false.
    // Preserved deliberately; do not fix without a product decision.
    //
    // Answering `false` here would be the tempting repair and the wrong one: a sku
    // whose product has no default sku is a DATA FAULT, and `false` hides it. Note
    // the mirror image at [model/entity/Product.cfc:L589] and [L595], which DO
    // guard — so the asymmetry is within the legacy itself, not introduced here.
    const noProduct = makeSkuFixture({ product: undefined });
    const productWithoutDefault = makeSkuFixture();

    expect(() => noProduct.getDefaultFlag()).toThrow(/requires the owning product/);
    expect(() => noProduct.getDefaultFlag()).toThrow(/\[model\/entity\/Sku\.cfc:L443\]/);
    expect(() => productWithoutDefault.getDefaultFlag()).toThrow(
      /requires the product's default sku/,
    );
  });

  it('★ compares by PRIMARY KEY only — never object identity, never deep equality', () => {
    // Two distinct instances carrying the same `skuID` are the same row. The
    // legacy compares `getSkuID()` values, so identity is irrelevant, and a
    // case-different id still matches because CFML `==` folds case.
    const theDefault = makeSkuFixture({ idPrefix: 'pk', skuID: 'PK-SKU' });
    const product = makeProductFixture({
      productID: 'pk-product',
      skus: [],
      defaultSku: theDefault,
    });
    const sameRowDifferentInstance = makeSkuFixture({ skuID: 'PK-SKU', product });
    const sameRowFoldedCase = makeSkuFixture({ skuID: 'pk-sku', product });

    expect(sameRowDifferentInstance).not.toBe(theDefault);
    expect(sameRowDifferentInstance.getDefaultFlag()).toBe(true);
    expect(sameRowFoldedCase.getDefaultFlag()).toBe(true);
  });
});

// ===========================================================================
// B13 — getStocksDeletableFlag: D28 / H4, PRESERVED AS FAILING
// [model/entity/Sku.cfc:L567-L572]
// ===========================================================================

describe('Sku.getStocksDeletableFlag — D28/H4 [model/entity/Sku.cfc:L567-L572]', () => {
  it('★ REFUSES, because the member it needs is absent from the seven-member port', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L567-L572]: the L569 call reaches
    // skuService.getSkuStocksDeletableFlag [model/service/SkuService.cfc:L281],
    // which is absent from the skuRepository port surface, so the ported accessor
    // cannot be satisfied.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The locator is L569, NOT the L568 the upstream note cites — verified
    // first-hand against `model/entity/Sku.cfc`. SOURCE WINS.
    const sku = makeSkuFixture();

    expect(() => sku.getStocksDeletableFlag()).toThrow(
      /getStocksDeletableFlag cannot be evaluated/,
    );
    expect(() => sku.getStocksDeletableFlag()).toThrow(/\[model\/entity\/Sku\.cfc:L569\]/);
  });

  it('★ names the reason precisely: the member lives on the SERVICE, not the DAO', () => {
    // JUDGMENT CALL: NO port member was added to make this pass. The ledger stays
    // at thirteen ports and `skuRepository` declares seven members —
    // getTransactionExistsFlag, getSkuBySkuCode, getSkusBySelectedOptions,
    // searchSkusByProductType, getProductSkus, getSortedProductSkusID, saveSku.
    // `getSkuStocksDeletableFlag` is a SkuService method, the stock subsystem is out
    // of scope, and inventing an EIGHTH member for it would import an out-of-scope
    // aggregate through the back door.
    //
    // ★ THE COUNT MOVED AWAY FROM SEVEN AND BACK, AND THE POINT NEVER MOVED. For one
    // revision the port carried a `saveSkus` collection form and this comment argued
    // that the eighth member imported nothing, taking only `Sku` entities this slice
    // already models. That member has been removed, so the original wording stands
    // again verbatim. What was forbidden throughout was a member that would drag the
    // STOCK subsystem in, and that is still forbidden and still absent — which is why
    // this case's assertions never changed.
    const sku = makeSkuFixture();

    expect(() => sku.getStocksDeletableFlag()).toThrow(/getSkuStocksDeletableFlag/);
    expect(() => sku.getStocksDeletableFlag()).toThrow(/seven-member SkuRepository port/);

    // A hydrated repository changes nothing — the gap is in the CONTRACT, not the
    // wiring, which is exactly why a refusal rather than a stub is honest.
    const repositoryLog: SkuRepositoryCall[] = [];
    const wired = makeSkuFixture({
      skuRepository: makeRecordingSkuRepository([], true, repositoryLog),
    });

    expect(() => wired.getStocksDeletableFlag()).toThrow(/cannot be evaluated/);
    expect(repositoryLog).toEqual([]);
  });

  it('is declared as never-returning, so the delete gate cannot silently read `true`', () => {
    // `model/validation/Sku.json` gates deletion on `transactionExistsFlag` being
    // false — see B19 — and a fabricated `true` here would open a delete path the
    // legacy never opened.
    const sku = makeSkuFixture();

    expect(() => sku.getStocksDeletableFlag()).toThrow(Error);
  });
});

// ===========================================================================
// B14 — getTransactionExistsFlag: ASYNC, AND A DISCARDED ARGUMENT
// [model/entity/Sku.cfc:L592-L596]
// ===========================================================================

describe('Sku.getTransactionExistsFlag [model/entity/Sku.cfc:L592-L596]', () => {
  it('★ is ASYNCHRONOUS and resolves the port value', async () => {
    // CFML parity [model/entity/Sku.cfc:L594]: the body reaches the DAO, so per
    // the async boundary rule the ported member returns a promise. `await` is used
    // throughout; the lint profile enforces no-floating-promises, await-thenable
    // and require-await.
    const repositoryLog: SkuRepositoryCall[] = [];
    const sku = makeSkuFixture({
      skuRepository: makeRecordingSkuRepository([], true, repositoryLog),
    });

    const pending = sku.getTransactionExistsFlag();

    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toBe(true);

    const falseCase = makeSkuFixture({
      idPrefix: 'notransactions',
      skuRepository: makeRecordingSkuRepository([], false, repositoryLog),
    });

    expect(await falseCase.getTransactionExistsFlag()).toBe(false);
  });

  it('★ passes the skuID as the SECOND argument, leaving productID genuinely absent', async () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L594]: the entity passes skuID= to
    // SkuService.getTransactionExistsFlag() [model/service/SkuService.cfc:L285],
    // which declares no parameters, so CFML silently discards the argument and the
    // result is global rather than per-sku.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The ported call site does NOT pretend otherwise: it forwards the id to the
    // repository's `skuID` parameter — the port that DOES accept one, because
    // [model/dao/SkuDAO.cfc:L53] filters on it — while `productID` stays
    // `undefined` rather than becoming an empty string, because the legacy used a
    // NAMED argument and never supplied a product. Whether the answer is
    // sku-scoped is therefore a property of the SERVICE the legacy called, and
    // that gap is recorded here rather than papered over.
    const repositoryLog: SkuRepositoryCall[] = [];
    const sku = makeSkuFixture({
      skuID: 'transaction-probe-sku',
      skuRepository: makeRecordingSkuRepository([], true, repositoryLog),
    });

    await sku.getTransactionExistsFlag();

    expect(repositoryLog).toEqual([
      { member: 'getTransactionExistsFlag', args: [undefined, 'transaction-probe-sku'] },
    ]);
  });

  it('memoises the flag per instance [model/entity/Sku.cfc:L593], and the memo is request-scoped', async () => {
    const repositoryLog: SkuRepositoryCall[] = [];
    const sku = makeSkuFixture({
      skuRepository: makeRecordingSkuRepository([], true, repositoryLog),
    });

    expect(await sku.getTransactionExistsFlag()).toBe(true);
    expect(await sku.getTransactionExistsFlag()).toBe(true);
    expect(repositoryLog).toHaveLength(1);

    // A2: a second instance queries its own collaborator.
    const otherLog: SkuRepositoryCall[] = [];
    const other = makeSkuFixture({
      idPrefix: 'other',
      skuRepository: makeRecordingSkuRepository([], false, otherLog),
    });

    expect(await other.getTransactionExistsFlag()).toBe(false);
    expect(otherLog).toHaveLength(1);
    expect(await sku.getTransactionExistsFlag()).toBe(true);
  });

  it('refuses honestly when the repository was not hydrated, citing L594', async () => {
    const sku = makeSkuFixture({ skuRepository: undefined });

    await expect(sku.getTransactionExistsFlag()).rejects.toThrow(
      /sku repository collaborator was not injected/,
    );
    await expect(sku.getTransactionExistsFlag()).rejects.toThrow(
      /\[model\/entity\/Sku\.cfc:L594\]/,
    );
  });
});

// ===========================================================================
// B15 — hasUniqueOptions: ASYNC, AND THE NO-OPTIONS SPURIOUS FAILURE
// [model/entity/Sku.cfc:L756-L769]
// ===========================================================================

describe('Sku.hasUniqueOptions [model/entity/Sku.cfc:L756-L769]', () => {
  it('★ is ASYNCHRONOUS, unlike its sibling validator', async () => {
    // CFML parity [model/entity/Sku.cfc:L763]: this method reaches
    // product.getSkusBySelectedOptions, which reaches the DAO, so per the async
    // boundary rule it becomes async in the target. Its sibling
    // hasOneOptionPerOptionGroup does not.
    const repositoryLog: SkuRepositoryCall[] = [];
    const sku = makeSkuWithSelectionResult([], repositoryLog);

    const pending = sku.hasUniqueOptions();

    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toBe(true);
  });

  it('answers true for an EMPTY result set [model/entity/Sku.cfc:L764]', async () => {
    // `!arrayLen(skus)` is the first limb of the compound condition: no sku carries
    // this option combination, so it is unique by definition.
    const repositoryLog: SkuRepositoryCall[] = [];

    expect(await makeSkuWithSelectionResult([], repositoryLog).hasUniqueOptions()).toBe(true);
  });

  it('answers true for exactly ONE result that is THIS sku, compared by primary key', async () => {
    // The second limb: `skus[1].getSkuID() == getSkuID()`. CFML `==` folds case, so
    // the comparison goes through `cfEquals`, and it is a PRIMARY-KEY comparison —
    // a different instance carrying the same id is the same row.
    const repositoryLog: SkuRepositoryCall[] = [];
    const selfRow = makeSkuFixture({ idPrefix: 'selfrow', skuID: 'skfx-sku' });
    const sku = makeSkuWithSelectionResult([selfRow], repositoryLog);

    expect(sku.getSkuID()).toBe('skfx-sku');
    expect(selfRow).not.toBe(sku);
    expect(await sku.hasUniqueOptions()).toBe(true);
  });

  it('answers false for exactly ONE result that is a DIFFERENT sku [model/entity/Sku.cfc:L768]', async () => {
    const repositoryLog: SkuRepositoryCall[] = [];
    const rival = makeSkuFixture({ idPrefix: 'rival', skuID: 'rival-sku' });
    const sku = makeSkuWithSelectionResult([rival], repositoryLog);

    expect(await sku.hasUniqueOptions()).toBe(false);
  });

  it('answers false for TWO OR MORE results, even when one of them is this sku', async () => {
    // The `arrayLen(skus) == 1` guard is inside the second limb, so a self match
    // buried in a longer result set does not rescue the sku.
    const repositoryLog: SkuRepositoryCall[] = [];
    const selfRow = makeSkuFixture({ idPrefix: 'selfrow', skuID: 'skfx-sku' });
    const rival = makeSkuFixture({ idPrefix: 'rival', skuID: 'rival-sku' });
    const sku = makeSkuWithSelectionResult([selfRow, rival], repositoryLog);

    expect(await sku.hasUniqueOptions()).toBe(false);
  });

  it('★ THE NO-OPTIONS SPURIOUS FAILURE — an option-less sku fails its own save validation', async () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L756-L769]: with no options the built
    // list is empty, the option filter degenerates, and every sibling sku comes
    // back, so a legitimately option-less sku fails the hasUniqueOptions save
    // validation.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★ THIS MODELS A RESULT, NEVER A QUERY. The AND-of-EXISTS matching semantics
    // of [model/dao/SkuDAO.cfc:L107-L128] belong to `tests/integration` (P5); a
    // domain suite must not assert SQL. The double simply returns what the
    // degenerate filter would have returned.
    const repositoryLog: SkuRepositoryCall[] = [];
    const siblingA = makeSkuFixture({ idPrefix: 'sibling-a', skuID: 'sibling-a-sku' });
    const siblingB = makeSkuFixture({ idPrefix: 'sibling-b', skuID: 'sibling-b-sku' });
    const optionLess = makeSkuWithSelectionResult([siblingA, siblingB], repositoryLog, []);

    expect(optionLess.getOptions()).toHaveLength(0);
    expect(optionLess.getOptionsIDList()).toBe('');
    expect(await optionLess.hasUniqueOptions()).toBe(false);

    // The empty list is what was handed to the query — the mechanism, recorded.
    expect(repositoryLog[0]?.args[0]).toBe('');
  });

  it('★ builds the option list with NO leading delimiter [model/entity/Sku.cfc:L757-L761]', async () => {
    // `listAppend` on an empty list returns the value itself, so the list handed to
    // the query begins with an option id and not with a comma. A leading comma
    // would silently add an empty element to the AND-of-EXISTS filter.
    const repositoryLog: SkuRepositoryCall[] = [];
    const sku = makeSkuWithSelectionResult([], repositoryLog);
    const expected = sku
      .getOptions()
      .map((option) => option.getOptionID())
      .join(',');

    await sku.hasUniqueOptions();

    expect(repositoryLog[0]?.args[0]).toBe(expected);
    expect(repositoryLog[0]?.args[0]?.startsWith(',')).toBe(false);
    expect(repositoryLog[0]?.args[1]).toBe('selection-product');
  });

  it('refuses honestly when the product is absent, citing L763', async () => {
    // The legacy chains `getProduct().getSkusBySelectedOptions(...)` with no guard.
    const sku = makeSkuFixture({ product: undefined });

    await expect(sku.hasUniqueOptions()).rejects.toThrow(/requires the owning product/);
    await expect(sku.hasUniqueOptions()).rejects.toThrow(/\[model\/entity\/Sku\.cfc:L763\]/);
  });
});

// ===========================================================================
// B16 — hasOneOptionPerOptionGroup: SYNC, AND CASE-SENSITIVE
// [model/entity/Sku.cfc:L771-L784]
// ===========================================================================

describe('Sku.hasOneOptionPerOptionGroup [model/entity/Sku.cfc:L771-L784]', () => {
  it('★ is SYNCHRONOUS, in deliberate contrast with hasUniqueOptions', () => {
    // CFML parity: a method is async IFF its legacy body reaches the DAO/ORM. This
    // body traverses nothing but the already-materialised option collection, so it
    // stays synchronous even though its sibling validator — invoked from the SAME
    // `options` entry of `model/validation/Sku.json` — does not.
    const result = makeSkuFixture().hasOneOptionPerOptionGroup();

    expect(typeof result).toBe('boolean');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('answers true for zero options and true for one option per group', () => {
    // Zero options: the loop never runs and [L783] returns true. This is a
    // DIFFERENT empty-collection semantic from hasUniqueOptions above, which fails
    // spuriously on the same input — two of the five distinct semantics, side by
    // side on one entity (B25).
    expect(makeSkuFixture({ options: [] }).hasOneOptionPerOptionGroup()).toBe(true);

    const oneEach = makeSkuFixture();
    const groupIDs = oneEach
      .getOptions()
      .map((option) => requireOptionGroupOf(option).getOptionGroupID());

    expect(new Set(groupIDs).size).toBe(groupIDs.length);
    expect(oneEach.hasOneOptionPerOptionGroup()).toBe(true);
  });

  it('answers false on the FIRST duplicated option group [model/entity/Sku.cfc:L777]', () => {
    // The fixture's fourth pool option belongs to GROUP 1, so the default sku with
    // `duplicateOptionGroupOption` carries two options from one group.
    const duplicated = makeSkuFixture({ duplicateOptionGroupOption: true });
    const groupIDs = duplicated
      .getOptions()
      .map((option) => requireOptionGroupOf(option).getOptionGroupID());

    expect(groupIDs.length).toBeGreaterThan(new Set(groupIDs).size);
    expect(duplicated.hasOneOptionPerOptionGroup()).toBe(false);
  });

  it('★★ THE GROUP-ID TEST IS CASE-SENSITIVE — ids differing only in case are DIFFERENT groups', () => {
    // CFML parity [model/entity/Sku.cfc:L776]: this is listFind, not
    // listFindNoCase, so the group-id comparison is CASE-SENSITIVE — a deliberate
    // contrast with the case-insensitive `eq` comparisons elsewhere in this file
    // (the cascade at [L385], the base-type branches at [L577]/[L579]/[L584], the
    // dispatch match at [L866] and the default-sku test at [L443]).
    //
    // ★ JUDGMENT CALL: `listFind` is NOT among the five exports of
    // `src/lib/cfml/list.ts` — which exports listLen, listGetAt, listAppend,
    // listToArray and listFindNoCase. NO export was added to that module: A1
    // forbids editing `src/**`, and substituting `listFindNoCase` would silently
    // flip case sensitivity ON A LIVE SAVE-VALIDATION PATH. The shipped entity
    // therefore implements the case-sensitive test locally over `listToArray` with
    // an exact `===`.
    const lowerGroup = makeOptionGroupDouble('casegroup', 'case', 'Case lower', 1);
    const upperGroup = makeOptionGroupDouble('CASEGROUP', 'CASE', 'Case upper', 2);
    const sku = makeSkuFixture({
      options: [
        makeOptionDouble('case-option-lower', 'case-lower', 'Lower', lowerGroup, 1),
        makeOptionDouble('case-option-upper', 'case-upper', 'Upper', upperGroup, 2),
      ],
    });

    expect(sku.hasOneOptionPerOptionGroup()).toBe(true);

    // …and the case-INSENSITIVE helper would have answered the opposite, which is
    // precisely the substitution that must never be made.
    expect(listFindNoCase('casegroup', 'CASEGROUP')).toBe(1);
  });

  it('★ listFindNoCase is a 1-BASED INDEX, never a boolean — asserted explicitly', () => {
    // ★★ `if (listFindNoCase(...))` IS FORBIDDEN. The helper answers a 1-based
    // index or 0, so the only safe test is an explicit numeric comparison. The same
    // prohibition covers `if (index > 0)` against a `findIndex` result, whose miss
    // value is -1 rather than 0.
    const groupList = 'alpha,beta,gamma';

    expect(listFindNoCase(groupList, 'ALPHA')).toBe(1);
    expect(listFindNoCase(groupList, 'gamma')).toBe(3);
    expect(listFindNoCase(groupList, 'delta')).toBe(0);
    expect(listFindNoCase(groupList, 'delta') !== 0).toBe(false);
    expect(listFindNoCase(groupList, 'beta') !== 0).toBe(true);
  });

  it('★ both validators are DECLARATIVELY INVOKED and both are reachable on the shipped surface', async () => {
    // `model/validation/Sku.json`'s `options` entry names BOTH
    // `hasUniqueOptions` and `hasOneOptionPerOptionGroup` on the `save` context.
    // These are two of the five declaratively-invoked entity validators that exist
    // project-wide — the others being
    // RoundingRule.hasExpressionWithListOfNumericValuesOnly,
    // PromotionCode.hasUniquePromotionCode and
    // Promotion.getPromotionCodesDeletableFlag. A validator the schema names but
    // the entity does not expose would fail silently at save time, so both are
    // asserted present.
    const repositoryLog: SkuRepositoryCall[] = [];
    const sku = makeSkuWithSelectionResult([], repositoryLog);

    // Both are declared, both take no arguments, and — more importantly than
    // either — both are actually INVOCABLE, which a `typeof` probe alone would not
    // prove.
    expect(arityOf(sku, 'hasUniqueOptions')).toBe(0);
    expect(arityOf(sku, 'hasOneOptionPerOptionGroup')).toBe(0);
    expect(sku.hasOneOptionPerOptionGroup()).toBe(true);
    expect(await sku.hasUniqueOptions()).toBe(true);
  });

  it('refuses honestly when an option carries no option group, citing L776', () => {
    // The legacy chains `getOptions()[i].getOptionGroup().getOptionGroupID()` with
    // no null check and raises in the same situation.
    const orphan = new Option({
      optionID: 'orphan-option',
      optionCode: 'orphan',
      optionName: 'Orphan',
      optionDescription: undefined,
      sortOrder: 1,
      optionGroup: undefined,
      defaultImageID: undefined,
      remoteID: undefined,
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: undefined,
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: undefined,
    });
    const sku = makeSkuFixture({ options: [orphan] });

    expect(() => sku.hasOneOptionPerOptionGroup()).toThrow(/has no option group/);
    expect(() => sku.hasOneOptionPerOptionGroup()).toThrow(/\[model\/entity\/Sku\.cfc:L776\]/);
  });
});

// ===========================================================================
// B17 — getOptionNameByOptionGroupID: THE EXPLICIT onMissingMethod REPLACEMENT
// [model/entity/Sku.cfc:L857-L873]
// ===========================================================================

describe('Sku.getOptionNameByOptionGroupID [model/entity/Sku.cfc:L857-L873]', () => {
  it('answers the option name for a known option group id', () => {
    // CFML parity [model/entity/Sku.cfc:L861-L869]: the legacy override tested
    // `left(missingMethodName,3) == "get"`, sliced the remainder with
    // `right(name, len(name)-3)`, and compared it against each option's
    // `getOptionGroupID()`, returning `getOptionName()` on a match.
    const sku = makeSkuFixture();
    const firstOption = requireOption(sku.getOptions(), 0);
    const firstGroupID = requireOptionGroupOf(firstOption).getOptionGroupID();

    expect(sku.getOptionNameByOptionGroupID(firstGroupID)).toBe(firstOption.getOptionName());
  });

  it('★ matches CASE-INSENSITIVELY, as CFML `==` on strings does [model/entity/Sku.cfc:L866]', () => {
    const sku = makeSkuFixture();
    const firstOption = requireOption(sku.getOptions(), 0);
    const firstGroupID = requireOptionGroupOf(firstOption).getOptionGroupID();

    expect(sku.getOptionNameByOptionGroupID(firstGroupID.toUpperCase())).toBe(
      firstOption.getOptionName(),
    );
    expect(sku.getOptionNameByOptionGroupID(firstGroupID.toLowerCase())).toBe(
      firstOption.getOptionName(),
    );
  });

  it('★ answers the FIRST match when two options share an option group id', () => {
    // The legacy returns from inside the loop, so the first match wins — the same
    // direction as the two option structs at [L504]/[L516] and the OPPOSITE of the
    // currency cascade's Step 2 at [L399-L414].
    const sharedGroup = makeOptionGroupDouble('sharedgroup', 'shared', 'Shared', 1);
    const sku = makeSkuFixture({
      options: [
        makeOptionDouble('shared-first', 'shared-first', 'First', sharedGroup, 1),
        makeOptionDouble('shared-second', 'shared-second', 'Second', sharedGroup, 2),
      ],
    });

    expect(sku.getOptionNameByOptionGroupID('sharedgroup')).toBe('First');
  });

  it('★ answers undefined on a miss, and there is NO dynamic dispatch to fall through to', () => {
    // CFML parity [model/entity/Sku.cfc:L857-L873]: the onMissingMethod override
    // becomes one explicit, typed method. There is no dynamic dispatch in the
    // target, so the legacy super fall-through at L872 is documented rather than
    // reproduced.
    //
    // ★ JUDGMENT CALL: no Proxy, index signature, tokenizer, `evaluate()`, `eval`,
    // `new Function` or `vm` was built to emulate CFML dispatch. A typed accessor
    // is the whole point of the migration; re-creating dynamic dispatch would
    // reintroduce exactly the runtime-resolution risk the port exists to remove.
    const sku = makeSkuFixture();

    expect(sku.getOptionNameByOptionGroupID('no-such-group')).toBeUndefined();
    expect(
      makeSkuFixture({ options: [] }).getOptionNameByOptionGroupID('anything'),
    ).toBeUndefined();
  });

  it('records the legacy SHADOWING HAZARD without reproducing it', () => {
    // CFML parity [model/entity/Sku.cfc:L857-L861]: the legacy hazard was that ANY
    // unknown `getXXX()` reached this override, so an option group whose id
    // happened to spell a real property name could never be reached — the real
    // getter took precedence and the override never ran. Conversely an option group
    // id could be addressed as a method name at all only by accident of naming.
    //
    // In the target the accessor takes the group id as an ARGUMENT, so no
    // collision with a property name is possible and the hazard is structurally
    // absent. The group id below deliberately spells a real property name to make
    // the point.
    const collidingGroup = makeOptionGroupDouble('skuCode', 'colliding', 'Colliding', 1);
    const sku = makeSkuFixture({
      options: [
        makeOptionDouble('colliding-option', 'colliding', 'Colliding value', collidingGroup, 1),
      ],
    });

    expect(sku.getSkuCode()).toBe('TESTSKUXXX');
    expect(sku.getOptionNameByOptionGroupID('skuCode')).toBe('Colliding value');
  });

  it('refuses honestly when an option carries no option group, citing L866', () => {
    const orphanGroupless = new Option({
      optionID: 'orphan-dispatch',
      optionCode: 'orphan',
      optionName: 'Orphan',
      optionDescription: undefined,
      sortOrder: 1,
      optionGroup: undefined,
      defaultImageID: undefined,
      remoteID: undefined,
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: undefined,
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: undefined,
    });
    const sku = makeSkuFixture({ options: [orphanGroupless] });

    expect(() => sku.getOptionNameByOptionGroupID('anything')).toThrow(
      /\[model\/entity\/Sku\.cfc:L866\]/,
    );
  });
});

// ===========================================================================
// B18 — THE FOUR INHERITED-BASE BEHAVIOURS, DOCUMENTED RATHER THAN FABRICATED
//
// The shipped entities port NO Hibachi base class. Each behaviour below is
// therefore characterized as the LEGACY CONTRACT in a comment, and the SHIPPED
// REALITY is asserted. Nothing is invented to make a base behaviour appear.
// ===========================================================================

describe('Sku inherited-base behaviours — documented, not fabricated', () => {
  /**
   * Reads a member by name without weakening the type system.
   *
   * `as unknown as Record<string, unknown>` is the strict-mode way to probe for a
   * member that the shipped type deliberately does not declare. No `any`, no
   * `@ts-ignore`, and no postfix `!` (P1).
   */
  const memberOf = (subject: object, name: string): unknown =>
    (subject as unknown as Record<string, unknown>)[name];

  it('★ THE UNKNOWN-GETTER SPLIT — 4 silent / 14 throw, and NEITHER survives here', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L559-L561 and L565]:
    // `Sku.cfc:L70` declares `attributeValues type="array"`, which made Sku one of
    // exactly FOUR in-scope entities — with `Product.cfc:L75`,
    // `ProductType.cfc:L67` and `Brand.cfc:L60` — whose unknown `getX()` routed
    // SILENTLY to `getAttributeValue('X')` and answered `''` at [L559-L561], while
    // the other fourteen threw through [L565].
    //
    // In the target there is NO dynamic dispatch at all, so neither half of the
    // split is reachable and the entire EAV read path is deliberately absent. Do
    // not invent `getAttributeValue`, an attribute-value read path, or a
    // nineteenth entity module: `attributeValue.test.ts` must never exist.
    const sku = makeSkuFixture();

    expect(memberOf(sku, 'getAttributeValue')).toBeUndefined();
    expect(memberOf(sku, 'getAttributeValues')).toBeUndefined();
    expect(memberOf(sku, 'onMissingMethod')).toBeUndefined();

    // What DOES exist is the one explicit, typed replacement for the override —
    // asserted in full in B17.
    expect(typeof sku.getOptionNameByOptionGroupID).toBe('function');
  });

  it('★ THE PARTIAL CACHE INVALIDATION — the legacy contract recorded, the members absent', () => {
    // CFML parity [model/entity/HibachiEntity.cfc:L246-L252]: `clearAttributeCache()`
    // cleared ONLY `attributeValuesByAttributeIDStruct` and
    // `attributeValuesByAttributeCodeStruct`, leaving `attributeValuesForEntity`
    // and `assignedAttributeSetSmartList` STALE. That smart list was shadowed at
    // FOUR sites — the base at [model/entity/HibachiEntity.cfc:L205],
    // [model/entity/Sku.cfc:L813], [model/entity/ProductType.cfc:L280] and — a
    // fourth site the upstream note omits, verified first-hand —
    // [model/entity/Product.cfc:L795].
    //
    // ALL of them are omitted in the target, so this assertion is documentary: the
    // shipped module exposes no attribute cache and no smart list, and none is
    // created here. Hibachi smart lists are replaced by typed repository queries
    // (see AAP §0.6.2), not cloned.
    const sku = makeSkuFixture();

    expect(memberOf(sku, 'clearAttributeCache')).toBeUndefined();
    expect(memberOf(sku, 'getAssignedAttributeSetSmartList')).toBeUndefined();
    expect(memberOf(sku, 'getAssignedOrderItemAttributeSetSmartList')).toBeUndefined();
  });

  it('★ getNewFlag, getPrintTemplates and getEmailTemplates are NOT ported — only isNew() is', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L571-L576, L578-L580, L582-L584]:
    // the base supplied `getNewFlag()` alongside `getPrintTemplates()` and
    // `getEmailTemplates()`, both of which answered `[]`. Only `isNew()` is
    // authored per entity, because only `isNew()` carries behaviour the in-scope
    // slice reaches — the far-side association guards read it.
    const persisted = makeSkuFixture();
    const unsaved = makeSkuFixture({ idPrefix: 'unsaved', isNew: true });

    expect(persisted.isNew()).toBe(false);
    expect(unsaved.isNew()).toBe(true);

    expect(memberOf(persisted, 'getNewFlag')).toBeUndefined();
    expect(memberOf(persisted, 'getPrintTemplates')).toBeUndefined();
    expect(memberOf(persisted, 'getEmailTemplates')).toBeUndefined();
  });

  it('★ THE ORM EVENT HOOKS BANNER AT [L878-L880] IS LITERALLY EMPTY — so nothing exists here', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L598-L619]: the base `preInsert()`
    // threw when `!isPersistable()` and stamped created/modified timestamps from
    // `now()`. `Sku.cfc` declares NO hooks of its own — its
    // `START: ORM Event Hooks` / `END: ORM Event Hooks` banner pair at
    // [model/entity/Sku.cfc:L878-L880] encloses nothing at all — so there is no
    // Sku-specific hook behaviour to characterize, and none is invented.
    //
    // ⚠️ The base hook's raw `writeDump(getErrors())` debug output at
    // [org/Hibachi/HibachiEntity.cfc:L605] is NEVER ported: dumping internal state
    // to a response is not behaviour worth preserving.
    //
    // Timestamp maintenance moves to the repository tier, where the four audit
    // columns are hydrated. The entity only READS them.
    const sku = makeSkuFixture();

    expect(memberOf(sku, 'preInsert')).toBeUndefined();
    expect(memberOf(sku, 'preUpdate')).toBeUndefined();
    expect(memberOf(sku, 'isPersistable')).toBeUndefined();

    // Every business date on this entity is an explicit UTC instant, supplied by
    // hydration rather than read from a clock.
    expect(sku.getCreatedDateTime()?.toISOString()).toBe(CREATED_DATE_TIME_UTC);
    expect(sku.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_DATE_TIME_UTC);
  });

  it('records the DEAD RETRY at [model/entity/HibachiEntity.cfc:L180-L183] as unexercised', () => {
    // CFML parity [model/entity/HibachiEntity.cfc:L180-L183]: [L182] re-calls the
    // enclosing method with IDENTICAL arguments, so the "retry" can only ever
    // repeat the same failure — a no-op dressed as resilience. It is recorded as
    // present-but-unexercised rather than given an invented test path, because no
    // in-scope call site reaches it and fabricating one would assert behaviour the
    // slice does not have.
    const sku = makeSkuFixture();

    expect(memberOf(sku, 'getPropertyMetaData')).toBeUndefined();
  });

  it('explains the absent SlatwallEntityTestBase concepts instead of fabricating them', () => {
    // CFML parity [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67]: the
    // legacy base contributed four cases to whichever entity test mixed it in. It
    // was mixed into `BrandTest.cfc` and `ProductTest.cfc` ONLY — never into a Sku
    // test, because no `SkuTest.cfc` exists — so those four cases are NOT legacy
    // coverage for Sku and are not claimed as such (C8).
    //
    // Of the base's concepts, the shipped surface exposes exactly one analogue:
    // `getSimpleRepresentationPropertyName()`. There is no primary-id-property-name
    // accessor, no `getEntityName()`, and no metadata reflection — their absence is
    // documented here rather than asserted into existence.
    const sku = makeSkuFixture();

    expect(sku.getSimpleRepresentationPropertyName()).toBe('skuCode');
    expect(memberOf(sku, 'getPrimaryIDPropertyName')).toBeUndefined();
    expect(memberOf(sku, 'getEntityName')).toBeUndefined();
    expect(memberOf(sku, 'getSimpleRepresentation')).toBeUndefined();
  });
});

// ===========================================================================
// B19 — THE DECLARATIVE VALIDATION CONTRACT  [model/validation/Sku.json]
//
// ★ SCOPE STATEMENT, VERIFIED FIRST-HAND. The shipped domain layer carries NO
// zod schema: `sku.ts` states plainly that the entity contributes "property
// metadata and these two methods and nothing else: no `zod` import, no schema
// declaration, no validation runner", and the only `from 'zod'` importers in
// `src/**` are `src/services/productService.ts` and
// `src/handlers/errorMapper.ts` — both of which this suite is FORBIDDEN to
// import (P2; tests are not a back door around the domain-inward boundary).
//
// Each of the eight rules is therefore recorded here as the legacy contract, and
// exercised to exactly the extent the DOMAIN surface can honour it. Nothing is
// invented, no schema is imported, and no rule the legacy lacks is added.
// ===========================================================================

describe('Sku declarative validation contract [model/validation/Sku.json]', () => {
  it('exposes every member the eight rules read, so none of them can fail silently', () => {
    // The file is 15 lines with EXACTLY eight property entries:
    //   defaultFlag           delete  eq false
    //   listPrice             save    numeric, minValue 0            (NOT required)
    //   options               save    hasUniqueOptions
    //   options               save    hasOneOptionPerOptionGroup
    //   price                 save    required, numeric, minValue 0
    //   renewalPrice          save    numeric, minValue 0            (NOT required)
    //   skuCode               save    required, unique               (NO regex)
    //   transactionExistsFlag delete  eq false
    //   physicalCounts        delete  maxCollection 0                (ORPHANED — see below)
    const theDefault = makeSkuFixture({ idPrefix: 'thedefault' });
    const product = makeProductFixture({
      productID: 'validation-product',
      skus: [],
      defaultSku: theDefault,
    });
    const sku = makeSkuFixture({ skuID: theDefault.getSkuID(), product });

    // delete-context gates
    expect(typeof sku.getDefaultFlag).toBe('function');
    expect(typeof sku.getTransactionExistsFlag).toBe('function');
    // save-context money columns
    expect(typeof sku.getPrice).toBe('function');
    expect(typeof sku.getListPrice).toBe('function');
    expect(typeof sku.getRenewalPrice).toBe('function');
    // save-context identity
    expect(typeof sku.getSkuCode).toBe('function');
    // save-context collection validators
    expect(typeof sku.hasUniqueOptions).toBe('function');
    expect(typeof sku.hasOneOptionPerOptionGroup).toBe('function');
  });

  it('★ price is NON-OPTIONAL Money because [model/entity/Sku.cfc:L55-L57] all declare default="0"', () => {
    // CFML parity [model/entity/Sku.cfc:L55, L56, L57]: `listPrice`, `price` and
    // `renewalPrice` are each `ormtype="big_decimal" hb_formatType="currency"` AND
    // each carries `default="0"`, so all three are NON-optional `Money` on the
    // shipped entity. That contrast is what proves the four no-default money
    // columns elsewhere — `SkuCurrency.price` [L53], `PriceGroupRate.amount` [L54],
    // `PromotionApplied.discountAmount` [L53] and `PromotionReward.amount` [L61] —
    // are genuinely optional.
    //
    // The `minValue: 0` floor on all three is a SCHEMA rule, not an entity
    // invariant: the entity accepts a negative amount, exactly as the legacy did,
    // and the floor is enforced at validation time. That distinction is what
    // `issue_1348` below exercises.
    const sku = makeSkuFixture();

    expect(sku.getPrice()).toBeInstanceOf(Money);
    expect(sku.getListPrice()).toBeInstanceOf(Money);
    expect(sku.getRenewalPrice()).toBeInstanceOf(Money);
    expect(sku.getPrice().toDecimalString()).toBe(FIXTURE_PRICE);
    expect(sku.getListPrice().toDecimalString()).toBe(FIXTURE_LIST_PRICE);
    expect(sku.getRenewalPrice().toDecimalString()).toBe(FIXTURE_RENEWAL_PRICE);

    // The ORM default, observable when hydration supplies nothing.
    const bare = new Sku({ skuID: 'bare-sku' });

    expect(bare.getPrice().toFixed2()).toBe('0.00');
    expect(bare.getListPrice().toFixed2()).toBe('0.00');
    expect(bare.getRenewalPrice().toFixed2()).toBe('0.00');
  });

  it('★ skuCode carries NO PATTERN — a code the shared entity-code regex rejects is still accepted', () => {
    // CFML parity [model/validation/Sku.json]: skuCode is required+unique with NO
    // pattern, unlike productCode, optionCode and optionGroupCode which share
    // ^[a-zA-Z0-9-_.|:~^]+$. Do not add a pattern the legacy schema lacks.
    const offending = 'SKU CODE/WITH SPACES';

    expect(ENTITY_CODE_PATTERN.test('VALID-CODE_1.2')).toBe(true);
    expect(ENTITY_CODE_PATTERN.test(offending)).toBe(false);

    // …and the entity accepts it without complaint, which is the legacy behaviour.
    const sku = makeSkuFixture({ skuCode: offending });

    expect(sku.getSkuCode()).toBe(offending);

    // The setter is equally permissive [model/entity/Sku.cfc:L54].
    sku.setSkuCode('another code with spaces');
    expect(sku.getSkuCode()).toBe('another code with spaces');
  });

  it('★★ THE ORPHANED physicalCounts RULE — a documented dead declaration', () => {
    // CFML parity [model/validation/Sku.json + model/entity/Sku.cfc:L87]: the
    // physicalCounts delete gate is ORPHANED — Sku declares "physicals"
    // (SwPhysicalSku), and physicalCounts exists as a property only on
    // model/entity/Physical.cfc:L59. Documented as a dead declaration; not a
    // defect, not a divergence.
    //
    // Five schemas carry the gate — Brand.json, Location.json, Product.json,
    // ProductType.json and Sku.json — and exactly one entity declares the
    // property. It is NOT one of the thirty numbered defects, it is NOT one of the
    // three authorized divergences, and it does NOT expand the six-file
    // validation-absence inventory. It is pinned in the same way as
    // `PriceGroupRate.json`'s orphaned `conditions.isNotGlobal`.
    //
    // ★ AND WHY IT WENT UNNOTICED FOR SO LONG: the four entities carrying this
    // orphan are EXACTLY the four that declare `attributeValues`, so an unknown
    // `getPhysicalCounts()` routed silently to `getAttributeValue('PhysicalCounts')`
    // and answered `''` at [org/Hibachi/HibachiEntity.cfc:L559-L561] instead of
    // throwing at [L565]. A dead gate that reads `''` never fires and never
    // complains.
    const sku = makeSkuFixture();

    // What Sku actually declares — the INVERSE many-to-many over `SwPhysicalSku`,
    // collapsed to opaque identifiers because `Physical` is out of scope.
    expect(Array.isArray(sku.getPhysicalIDs())).toBe(true);
    expect(sku.getPhysicalIDs()).toEqual([]);

    // What the schema names, and what does not exist.
    expect((sku as unknown as Record<string, unknown>)['getPhysicalCounts']).toBeUndefined();
  });

  it('★ DOES NOT COMPLETE THE LEGACY GAPS — no activeFlag, skuCurrencies, stocks or orderItems rule', () => {
    // `model/validation/Sku.json` has NO activeFlag rule, NO skuCurrencies gate,
    // NO stocks gate and NO orderItems gate. Their absence is asserted, not
    // repaired: adding validation the legacy lacks would change save and delete
    // outcomes on a live path.
    //
    // The six schemas verified ABSENT project-wide must REMAIN absent:
    // Category.json, PromotionQualifier.json, PromotionApplied.json,
    // PromotionAccount.json, Product_AddOption.json and
    // Product_AddOptionGroup.json.
    const sku = makeSkuFixture();

    // activeFlag defaults to "1" [model/entity/Sku.cfc:L53] and is freely settable
    // in either direction — no rule constrains it.
    expect(sku.getActiveFlag()).toBe(true);
    sku.setActiveFlag(false);
    expect(sku.getActiveFlag()).toBe(false);
    sku.setActiveFlag(true);
    expect(sku.getActiveFlag()).toBe(true);

    // The three ungated collections are readable and unconstrained.
    expect(Array.isArray(sku.getSkuCurrencies())).toBe(true);
    expect(Array.isArray(sku.getStockIDs())).toBe(true);
    expect(sku.getStockIDs()).toEqual([]);
  });
});

// ===========================================================================
// B20 — ★ THE ROUTED LEGACY CASE
// [meta/tests/unit/IssuesTest.cfc:L126-L138]
//
// This is the ONLY legacy-derived case in this file. Everything else is
// NET-NEW and is never presented as parity (C8).
//
// The legacy body, verbatim in substance:
//   var product = entityNew("Product"); ... var sku = entityNew("Sku");
//   sku.setProduct(product); sku.setSkuCode("issue_1348"); sku.setPrice(-20);
//   sku.validate(context="save");
//   assert( sku.hasError('price') );
//   assert( right( sku.getError('price')[1], 8) neq "_missing" );
//
// ★ THE HARNESS IS DROPPED, THE ASSERTIONS ARE CARRIED (C1). No `entityNew`,
// no `ormFlush`, no `entityDelete`, no `javaCast("null","")`, no
// `request.slatwallScope`, no `getService(...)`, and nothing from
// `meta/tests/unit/SlatwallUnitTestBase.cfc` — whose [L52] `createObject`,
// [L60] `bootstrap()` and [L62] superuser elevation are the anti-pattern this
// migration exists to leave behind. Traceability means the same assertions
// about the same behaviour, not the same test architecture.
//
// ⚠️ `meta/tests/unit/IssuesTest.cfc:L55` declares its local WITHOUT `var`,
// exactly as `meta/tests/unit/Helper.cfc:L53` does. That is HARNESS HYGIENE,
// not one of the preserved defects, and it is deliberately NOT reproduced here:
// every local in this file is `const` or `let`.
// ===========================================================================

describe('issue_1348 — routed legacy case [meta/tests/unit/IssuesTest.cfc:L126-L138]', () => {
  const NEGATIVE_PRICE = '-20';

  it('issue_1348 accepts a negative price on the entity, so the violation can only be the FLOOR', () => {
    // ★ THE `_missing` DECODE, proven where it can be proven. The legacy asserts
    // `right(errorKey, 8) neq "_missing"` — i.e. the finding must be a MIN-VALUE
    // violation and never a "required/missing" one. `model/validation/Sku.json`'s
    // `price` rule carries BOTH `required: true` AND `minValue: 0`, so the decode
    // is mechanical: because the value is PRESENT, the required limb is satisfied
    // and only the floor can fire.
    //
    // The domain layer owns presence; the service tier owns error-key assembly
    // (see the scope statement on B19). Both halves of the legacy assertion are
    // therefore asserted at the layer that can honour them, and neither is faked.
    const product = makeProductFixture({ productID: 'issue-1348-product', skus: [] });
    const sku = makeSkuFixture({
      skuID: 'issue-1348-sku',
      skuCode: 'issue_1348',
      price: Money.fromDecimalString(NEGATIVE_PRICE),
      product,
    });

    // Legacy assertion 2, decoded: the value is PRESENT, so no `*_missing` key can
    // be produced for it. Presence is a domain property and is asserted here.
    expect(sku.getPrice()).toBeInstanceOf(Money);
    expect(sku.getPrice().toDecimalString()).toBe(NEGATIVE_PRICE);

    // Legacy assertion 1, precondition: the present value violates `minValue: 0`,
    // which is the sole remaining finding the schema can produce for `price`.
    expect(sku.getPrice().isLessThan(Money.zero)).toBe(true);
    expect(sku.getPrice().toFixed2()).toBe('-20.00');
  });

  it('issue_1348 keeps the legacy fixture wiring — setProduct, setSkuCode, setPrice', () => {
    // The three legacy mutations are carried over by NAME, through the ported
    // setters, so the case still reads as the original issue did. `setProduct`
    // completes the far-side graph at [model/entity/Sku.cfc:L614] the same way the
    // legacy ORM did.
    const product = makeProductFixture({ productID: 'issue-1348-wiring', skus: [] });
    const sku = makeSkuFixture({ skuID: 'issue-1348-wiring-sku', product: undefined });

    sku.setProduct(product);
    sku.setSkuCode('issue_1348');
    sku.setPrice(Money.fromDecimalString(NEGATIVE_PRICE));

    expect(sku.getProduct()).toBe(product);
    expect(product.getSkus()).toContain(sku);
    expect(sku.getSkuCode()).toBe('issue_1348');
    expect(sku.getPrice().toDecimalString()).toBe(NEGATIVE_PRICE);
  });

  it('issue_1348 proves a NON-negative price clears the floor, which is the contrast the ticket needs', () => {
    // Without this half the previous assertion could pass for the wrong reason.
    // Zero is ON the floor rather than below it — `minValue: 0` is inclusive.
    const atFloor = makeSkuFixture({ skuID: 'issue-1348-zero', price: Money.zero });
    const aboveFloor = makeSkuFixture({ skuID: 'issue-1348-above' });

    expect(atFloor.getPrice().isLessThan(Money.zero)).toBe(false);
    expect(aboveFloor.getPrice().isLessThan(Money.zero)).toBe(false);
    expect(aboveFloor.getPrice().toDecimalString()).toBe(FIXTURE_PRICE);
  });
});

// ===========================================================================
// B21 — ★★ A2 MEMO ISOLATION
//
// This suite is one of the TWO assigned owners of the cross-instance memo
// proof. Reproducing any of these memos as module state would leak one
// customer's price into another customer's request.
// ===========================================================================

describe('Sku memo isolation — every memo is request-scoped (A2)', () => {
  it('★★ a second instance does NOT observe the first instance currencyDetails memo', async () => {
    // A2: all entity memos are request-scoped. Reproducing them as module state
    // would leak one customer's price into another's request.
    const firstLog = makeCurrencyConverterLog();
    const first = makeSkuFixture({
      idPrefix: 'first',
      price: Money.fromDecimalString('10.00'),
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        firstLog,
      ),
      skuCurrencyVariant: 'none',
    });

    const secondLog = makeCurrencyConverterLog();
    const second = makeSkuFixture({
      idPrefix: 'second',
      price: Money.fromDecimalString('40.00'),
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        secondLog,
      ),
      skuCurrencyVariant: 'none',
    });

    await Sku.hydrate(first);
    await Sku.hydrate(second);

    // `toFixed2()` rather than `toDecimalString()`: the latter is FULL PRECISION
    // WITH NO SCALE, so `Money.fromDecimalString('10.00').toDecimalString()` is
    // `'10'`. Two-decimal presentation goes through the `numberFormat` parity path
    // [model/service/PromotionService.cfc:L1017], which is what `toFixed2()` is.
    expect(first.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
    expect(second.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('40.00');

    // Each instance consulted its OWN converter exactly once.
    expect(firstLog.listings).toHaveLength(1);
    expect(secondLog.listings).toHaveLength(1);

    // …and a THIRD, never-materialised instance sees neither of them.
    expect(makeSkuFixture({ idPrefix: 'third' }).getCurrencyDetails()).toEqual({});
  });

  it('★★ a second instance does NOT observe the first instance livePrice memo', async () => {
    const firstLog: ResolverCall[] = [];
    const first = makeSkuFixture({
      idPrefix: 'first',
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('5.00'),
        Money.fromDecimalString('2.22'),
        firstLog,
      ),
    });

    expect((await first.getLivePrice()).toDecimalString()).toBe('2.22');

    const secondLog: ResolverCall[] = [];
    const second = makeSkuFixture({
      idPrefix: 'second',
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('5.00'),
        Money.fromDecimalString('16.16'),
        secondLog,
      ),
    });

    expect((await second.getLivePrice()).toDecimalString()).toBe('16.16');
    expect((await first.getLivePrice()).toDecimalString()).toBe('2.22');
  });

  it('proves isolation for currencyCode, currentAccountPrice, skuDefinition and optionsIDList', async () => {
    // Four more of the nine memos the shipped surface exposes, each proven on two
    // independent instances with different inputs.
    const firstSettingsLog: SettingsCallLog = [];
    const first = makeSkuFixture({
      idPrefix: 'first',
      settingsProvider: makeRecordingSettingsProvider(
        SETTING_SKU_CURRENCY,
        SETTING_SKU_ELIGIBLE_CURRENCIES,
        firstSettingsLog,
      ),
    });
    const secondSettingsLog: SettingsCallLog = [];
    const second = makeSkuFixture({
      idPrefix: 'second',
      settingsProvider: makeRecordingSettingsProvider(
        TERTIARY_CURRENCY_CODE,
        SETTING_SKU_ELIGIBLE_CURRENCIES,
        secondSettingsLog,
      ),
    });

    // currencyCode [L360-L365]
    expect(first.getCurrencyCode()).toBe(SETTING_SKU_CURRENCY);
    expect(second.getCurrencyCode()).toBe(TERTIARY_CURRENCY_CODE);
    expect(first.getCurrencyCode()).toBe(SETTING_SKU_CURRENCY);
    expect(firstSettingsLog).toEqual(['skuCurrency']);

    // currentAccountPrice [L435-L440]
    const accountFirst = makeSkuFixture({
      idPrefix: 'acct-first',
      currentAccountPrice: Money.fromDecimalString('3.03'),
    });
    const accountSecond = makeSkuFixture({
      idPrefix: 'acct-second',
      currentAccountPrice: Money.fromDecimalString('4.04'),
    });

    expect((await accountFirst.getCurrentAccountPrice()).toDecimalString()).toBe('3.03');
    expect((await accountSecond.getCurrentAccountPrice()).toDecimalString()).toBe('4.04');

    // skuDefinition [L574-L590]
    const merchandise = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);
    const contentAccess = makeSkuWithBaseProductType(BASE_TYPE_CONTENT_ACCESS);

    expect(await merchandise.getSkuDefinition()).not.toBe('');
    expect(await contentAccess.getSkuDefinition()).toBe('');
    expect(await merchandise.getSkuDefinition()).not.toBe('');

    // optionsIDList [L524-L533]
    const withOptions = makeSkuFixture({ idPrefix: 'withopts' });
    const withoutOptions = makeSkuFixture({ idPrefix: 'withoutopts', options: [] });

    expect(withOptions.getOptionsIDList()).not.toBe('');
    expect(withoutOptions.getOptionsIDList()).toBe('');
    expect(withOptions.getOptionsIDList()).not.toBe('');
  });

  it('proves isolation for transactionExistsFlag and the two option structs', async () => {
    const trueLog: SkuRepositoryCall[] = [];
    const flagTrue = makeSkuFixture({
      idPrefix: 'flag-true',
      skuRepository: makeRecordingSkuRepository([], true, trueLog),
    });
    const falseLog: SkuRepositoryCall[] = [];
    const flagFalse = makeSkuFixture({
      idPrefix: 'flag-false',
      skuRepository: makeRecordingSkuRepository([], false, falseLog),
    });

    expect(await flagTrue.getTransactionExistsFlag()).toBe(true);
    expect(await flagFalse.getTransactionExistsFlag()).toBe(false);
    expect(await flagTrue.getTransactionExistsFlag()).toBe(true);
    expect(trueLog).toHaveLength(1);
    expect(falseLog).toHaveLength(1);

    // The two option structs of B3, on two independent instances.
    const populated = makeSkuFixture({ idPrefix: 'populated' });
    const empty = makeSkuFixture({ idPrefix: 'empty', options: [] });

    expect(Object.keys(populated.getOptionsByOptionGroupIDStruct())).toHaveLength(3);
    expect(Object.keys(populated.getOptionsByOptionGroupCodeStruct())).toHaveLength(3);
    expect(empty.getOptionsByOptionGroupIDStruct()).toEqual({});
    expect(empty.getOptionsByOptionGroupCodeStruct()).toEqual({});
    expect(Object.keys(populated.getOptionsByOptionGroupIDStruct())).toHaveLength(3);
  });

  it('★ every subject is constructed FRESH, and there is no mutable module-level state', () => {
    // No shared subject, no `beforeEach` mutation of a module-scoped variable, and
    // no spy to restore — every double in this file is hand-written and call-local,
    // so `vi.restoreAllMocks()` (registered globally by `tests/setup.ts`) has
    // nothing of ours to undo. Two fixtures built with identical arguments are
    // nonetheless independent objects with independent collections.
    const a = makeSkuFixture();
    const b = makeSkuFixture();

    expect(a).not.toBe(b);
    expect(a.getOptions()).not.toBe(b.getOptions());
    expect(a.getSkuCurrencies()).not.toBe(b.getSkuCurrencies());

    a.setSkuCode('MUTATED-A');

    expect(b.getSkuCode()).toBe('TESTSKUXXX');
  });

  it('records the four legacy caches that must NEVER become module state', () => {
    // CFML parity — the four component-level mutable caches in the in-scope slice,
    // each of which becomes cross-invocation state on a warm Lambda container and
    // is therefore request-scoped in the target:
    //
    //   1. `SkuDAO.variables.nextOptionGroupSortOrder`
    //      [model/dao/SkuDAO.cfc:L204-L220] — and its clear method
    //      `clearNextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L222-L226] has an
    //      INVERTED condition, so it can never fire. Documentary only: that cache
    //      belongs to the repository tier, not to this suite.
    //   2. `RoundingRuleService.variables.roundingRuleDetails`
    //      [model/service/RoundingRuleService.cfc:L67-L77] — service tier.
    //   3. The un-`var`'d `discountAmount`
    //      [model/service/PromotionService.cfc:L1007, L1009, L1014] — divergence (a),
    //      sibling-owned by `src/services`.
    //   4. Every entity memo, including `variables.currencyDetails`,
    //      `variables.livePrice` and `variables.brandName` — owned here and by
    //      `product.test.ts`.
    //
    // Memoisation in this port is justified as REQUEST-SCOPED STATE MANAGEMENT and
    // never as an optimisation (C7): the legacy "improves performance" framing at
    // [model/service/RoundingRuleService.cfc:L66] is deliberately not carried
    // forward, and no assertion in this file measures time.
    const sku = makeSkuFixture();

    expect(
      (sku as unknown as Record<string, unknown>)['clearNextOptionGroupSortOrder'],
    ).toBeUndefined();
    expect((sku as unknown as Record<string, unknown>)['nextOptionGroupSortOrder']).toBeUndefined();
  });

  it('★ option-collection mutations through the ported setters INVALIDATE the derived memos', () => {
    // CFML parity [model/entity/Sku.cfc:L500-L533]: the legacy component never
    // invalidated these memos, because a CFML request was short-lived and the
    // entity died with it. A ported entity that outlives a single read must
    // invalidate, or `addOption` would silently leave three stale answers behind.
    // The invalidation is scoped to the option memos only. The CASCADE memo is
    // deliberately never invalidated by anything — see the test below — and the
    // live-price memo is invalidated by the three money setters.
    const sku = makeSkuFixture();
    const beforeList = sku.getOptionsIDList();
    const strayGroup = makeOptionGroupDouble('stray-group', 'stray', 'Stray', 9);
    const stray = makeOptionDouble('stray-option', 'stray-code', 'Stray', strayGroup, 9);

    expect(Object.keys(sku.getOptionsByOptionGroupIDStruct())).toHaveLength(3);

    sku.addOption(stray);

    expect(sku.getOptionsIDList()).not.toBe(beforeList);
    expect(sku.getOptionsIDList()).toContain('stray-option');
    expect(Object.keys(sku.getOptionsByOptionGroupIDStruct())).toHaveLength(4);
    expect(Object.keys(sku.getOptionsByOptionGroupCodeStruct())).toHaveLength(4);

    sku.removeOption(stray);

    expect(sku.getOptionsIDList()).toBe(beforeList);
    expect(Object.keys(sku.getOptionsByOptionGroupIDStruct())).toHaveLength(3);
  });

  it('★★ money setters invalidate the live-price memo and DELIBERATELY LEAVE THE CASCADE MEMO ALONE', async () => {
    // CFML parity [model/entity/Sku.cfc:L55-L57, L368]: `setPrice`,
    // `setListPrice` and `setRenewalPrice` are ORM-GENERATED — [L49] declares
    // `accessors=true` and the component writes none of the three by hand — so
    // NOTHING in the legacy touches `variables.currencyDetails` when a price
    // changes. The only writes to that struct in the whole component are inside
    // the cascade body at [L369-L427], and there is no `structDelete` for it
    // anywhere. The component demonstrably knows that idiom, too: it uses it at
    // [L618] for `product` and [L636] for `subscriptionTerm`. Choosing not to use
    // it for `currencyDetails` is a decision, not an omission.
    //
    // So a sku whose price is changed after the cascade has run keeps reporting
    // the OLD per-currency prices — in the legacy, and here. That is what this
    // test pins.
    //
    // ★ AND THE TARGET HAS A SECOND, INDEPENDENT REASON. With the cascade
    // reachable only through `Sku.hydrate` (the memo guard at [L368] makes a
    // repeat call a no-op), a cleared memo could never be refilled. A single
    // `setPrice` would have turned a fully-priced sku into one whose three
    // currency accessors answer nothing at all — the state a closed [L373] gate
    // produces, arrived at by a completely different route. Not clearing is both
    // the faithful behaviour and the only safe one.
    //
    // `livePriceMemo` is the asymmetric case and IS cleared. The legacy does not
    // clear that one either ([L482-L498] has no `structDelete`), so the clear is a
    // pre-existing target-only refinement; it is retained because `getLivePrice()`
    // rebuilds on demand from data already on the instance, making a cleared live
    // price RECOVERABLE where a cleared cascade memo is not.
    const converterLog = makeCurrencyConverterLog();
    const sku = makeSkuFixture({
      price: Money.fromDecimalString('10.00'),
      skuCurrencyVariant: 'none',
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        converterLog,
      ),
    });

    await Sku.hydrate(sku);

    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
    expect((await sku.getLivePrice()).toFixed2()).toBe('10.00');

    const memoBefore = sku.getCurrencyDetails();

    sku.setPrice(Money.fromDecimalString('6.00'));

    // ★ THE CASCADE MEMO SURVIVES, BY REFERENCE. Not merely equal — the very same
    // object, which is the strongest available statement that nothing reset it.
    expect(sku.getCurrencyDetails()).toBe(memoBefore);

    // …and it still reports the PRE-CHANGE price, which is exactly the legacy's
    // observable behaviour. A `6.00` here would mean the memo had been rebuilt; an
    // `undefined` here would mean it had been cleared. It is neither.
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');

    // The column itself DID change — the setter is not a no-op — which is what
    // makes the stale memo a genuine observation rather than an artefact.
    expect(sku.getPrice().toFixed2()).toBe('6.00');

    // No collaborator ran on the setter path, so nothing re-entered the cascade.
    expect(converterLog.listings).toHaveLength(1);

    // The live-price memo, by contrast, WAS cleared and rebuilt on demand.
    expect((await sku.getLivePrice()).toFixed2()).toBe('6.00');

    // And a further `Sku.hydrate` is still a no-op: the [L368] guard sees the memo
    // and returns, so the stale entry is not quietly repaired behind the caller.
    await Sku.hydrate(sku);

    expect(sku.getCurrencyDetails()).toBe(memoBefore);
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
  });
});

// ===========================================================================
// B22 — PORTS, NO LOCATORS, NO AMBIENT SCOPE, NO CLOCK
// ===========================================================================

describe('Sku collaborators — explicit ports only', () => {
  it('★ is built ENTIRELY by hand from explicit constructor ports, with no framework anywhere', () => {
    // No DI container, no service locator, no ambient request scope, no bootstrap,
    // no database, no network, no filesystem, no `.env`, no credentials and no
    // superuser elevation. The whole suite passes with a completely empty
    // environment (P6), which is the exact opposite of
    // `meta/tests/unit/SlatwallUnitTestBase.cfc` — whose [L52]
    // `createObject("component","Slatwall.Application")`, [L60] `bootstrap()` and
    // [L62] superuser elevation before every test are the anti-pattern this
    // migration exists to leave behind.
    const bare = new Sku({ skuID: 'hand-built-sku' });

    expect(bare.getSkuID()).toBe('hand-built-sku');
    expect(bare.getOptions()).toEqual([]);
    expect(bare.getSkuCurrencies()).toEqual([]);
    expect(bare.getCurrencyDetails()).toEqual({});
    expect(bare.isNew()).toBe(false);
  });

  it('★ NO SERVICE LOCATOR CALL SURVIVES — all 19 of this entity legacy sites are ports now', () => {
    // Sku has NINETEEN entity-internal legacy `getService()` sites — the most of
    // any in-scope entity — out of FORTY-FIVE across the eighteen entities (Product
    // 18, Sku 19, ProductType 6, OptionGroup 1, RoundingRule 1; the other thirteen
    // have zero). Verified Sku sites: promotionService [L258]; priceGroupService
    // [L262], [L266], [L437]; currencyService [L371], [L418], [L422], [L425];
    // skuService [L569], [L594]; plus the out-of-scope locationService/stockService
    // cluster around [L295-L300].
    //
    // ★ THE 45-VERSUS-7 RECONCILIATION: the AAP's service-locator table has SEVEN
    // rows because it counts DISTINCT port mappings, while 45 counts CALL SITES.
    // Both figures are correct at different granularity. The upstream figure of 46
    // is wrong — verified first-hand by enumeration. SOURCE WINS.
    const sku = makeSkuFixture();
    const probe = sku as unknown as Record<string, unknown>;

    expect(probe['getService']).toBeUndefined();
    expect(probe['getHibachiScope']).toBeUndefined();
    expect(probe['getSlatwallScope']).toBeUndefined();
    expect(probe['getBeanFactory']).toBeUndefined();
  });

  it('★ NO CLOCK is injected into Sku — every date in this suite is an explicit UTC literal', () => {
    // Only `promotionPeriod.ts` and `promotionCode.ts` take `now: () => Date`, and
    // in both cases it is a PLAIN CONSTRUCTOR PARAMETER — explicitly not a port,
    // not `config.ts`, and not a fourteenth port. `Sku` has no time-dependent
    // predicate, so it receives none.
    //
    // No bare `new Date()` and no `Date.now()` appears anywhere in this file for a
    // business date, and no global fake timers are installed — `tests/setup.ts`
    // owns UTC setup and the global `afterEach` restore.
    const sku = makeSkuFixture();
    const probe = sku as unknown as Record<string, unknown>;

    expect(probe['now']).toBeUndefined();
    expect(probe['clock']).toBeUndefined();
    expect(process.env['TZ']).toBe('UTC');
    expect(new Date(CREATED_DATE_TIME_UTC).toISOString()).toBe(CREATED_DATE_TIME_UTC);
    expect(sku.getCreatedDateTime()?.toISOString()).toBe(CREATED_DATE_TIME_UTC);
  });

  it('★ THE PORT LEDGER IS LOCKED AT THIRTEEN, and Sku consumes exactly four of them', async () => {
    // The thirteen: productRepository, skuRepository, optionRepository,
    // productTypeRepository, promotionRepository, priceGroupRepository,
    // settingsProvider, currencyConverter, addressZoneEvaluator,
    // urlTitleGenerator, imageStore, subscriptionTermProvider, productFeedPort.
    // `hibachiUtilityService` is NOT a port. No fourteenth port may be invented —
    // not to satisfy `getPriceByPromotion` (B10) and not to satisfy
    // `getStocksDeletableFlag` (B13).
    //
    // Sku consumes four collaborators: settingsProvider, currencyConverter,
    // skuRepository and the sku-shaped price-group resolver. Each refuses honestly
    // when absent, which is how a missing wire surfaces as a loud failure instead
    // of a wrong price.
    const noSettings = makeSkuFixture({ settingsProvider: undefined });
    const noConverter = makeSkuFixture({ currencyConverter: undefined });

    expect(() => noSettings.getCurrencyCode()).toThrow(
      /settings provider collaborator was not injected/,
    );
    expect(() => noSettings.getCurrencyCode()).toThrow(/\[model\/entity\/Sku\.cfc:L362\]/);

    // The cascade resolves BOTH collaborators before the L373 gate, so either
    // absence is reported at its own locator.
    await expect(Sku.hydrate(noSettings)).rejects.toThrow(/\[model\/entity\/Sku\.cfc:L373\]/);
    await expect(Sku.hydrate(noConverter)).rejects.toThrow(/\[model\/entity\/Sku\.cfc:L371\]/);
  });

  it('prefers hand-written in-memory doubles over module mocking', () => {
    // `vi` is built in and permitted, and NO mocking library may be added (P3). No
    // `vi.mock` call appears in this file: every collaborator is a plain object
    // literal implementing the port, which keeps the recorded call log readable and
    // the type checking real.
    const settingsLog: SettingsCallLog = [];
    const provider = makeRecordingSettingsProvider(
      SETTING_SKU_CURRENCY,
      SETTING_SKU_ELIGIBLE_CURRENCIES,
      settingsLog,
    );

    expect(provider.setting('skuCurrency')).toBe(SETTING_SKU_CURRENCY);
    expect(provider.setting('skuEligibleCurrencies')).toBe(SETTING_SKU_ELIGIBLE_CURRENCIES);
    expect(provider.setting('globalURLKeyProduct')).toBe(SETTING_GLOBAL_URL_KEY_PRODUCT);
    expect(provider.setting('globalURLKeyProductType')).toBe(SETTING_GLOBAL_URL_KEY_PRODUCT_TYPE);
    expect(settingsLog).toEqual([
      'skuCurrency',
      'skuEligibleCurrencies',
      'globalURLKeyProduct',
      'globalURLKeyProductType',
    ]);
  });
});

// ===========================================================================
// B23 — THE ASYNC BOUNDARY AUDIT
// ===========================================================================

describe('Sku async boundary audit', () => {
  it('★ the SYNCHRONOUS members answer values, not promises', () => {
    // CFML parity: a method is async IFF its legacy body reaches the DAO/ORM.
    // Methods that only traverse already-materialized associations or perform pure
    // arithmetic stay synchronous. getCurrencyDetails() stays SYNC because the
    // currency-detail map is materialized at the repository boundary during
    // hydration — the legacy contract at L269-L273 is a plain synchronous accessor
    // and must remain one.
    const sku = makeSkuFixture();

    expect(sku.getCurrencyDetails()).not.toBeInstanceOf(Promise);
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).not.toBeInstanceOf(Promise);
    expect(sku.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)).not.toBeInstanceOf(Promise);
    expect(sku.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)).not.toBeInstanceOf(Promise);
    expect(sku.getCurrencyCode()).not.toBeInstanceOf(Promise);
    expect(sku.getOptionsByOptionGroupIDStruct()).not.toBeInstanceOf(Promise);
    expect(sku.getOptionsByOptionGroupCodeStruct()).not.toBeInstanceOf(Promise);
    expect(sku.getOptionsIDList()).not.toBeInstanceOf(Promise);
    expect(sku.hasOneOptionPerOptionGroup()).not.toBeInstanceOf(Promise);
    expect(sku.getSalePrice()).not.toBeInstanceOf(Promise);
    expect(sku.getSalePriceDiscountType()).not.toBeInstanceOf(Promise);
    expect(sku.getSalePriceExpirationDateTime()).not.toBeInstanceOf(Promise);
    expect(sku.getOptionsDisplay()).not.toBeInstanceOf(Promise);
  });

  it('★ CORRECTION C5 — getBaseProductType, getSkuDefinition and getLivePrice are ALL ASYNC', async () => {
    // The upstream note lists all three as synchronous. Verified first-hand against
    // the shipped module, they are not, and the reason is a genuine chain rather
    // than a style choice:
    //
    //   `ProductType.getBaseProductType()` [model/entity/ProductType.cfc:L110-L115]
    //   walks `productTypeIDPath` through the product-type repository when
    //   `systemCode` is empty, so it is async. `Product.getBaseProductType()`
    //   [model/entity/Product.cfc:L494] delegates to it, `Sku.getBaseProductType()`
    //   [model/entity/Sku.cfc:L356-L358] delegates to THAT, `getSkuDefinition()`
    //   [L577] branches on the result, and `getLivePrice()` [L489] awaits
    //   `getCurrentAccountPrice()`. SOURCE WINS.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);

    expect(sku.getBaseProductType()).toBeInstanceOf(Promise);
    expect(sku.getSkuDefinition()).toBeInstanceOf(Promise);
    expect(sku.getLivePrice()).toBeInstanceOf(Promise);
    expect(sku.getCurrentAccountPrice()).toBeInstanceOf(Promise);
    expect(sku.hasUniqueOptions()).toBeInstanceOf(Promise);
    expect(sku.getTransactionExistsFlag()).toBeInstanceOf(Promise);
    expect(Sku.hydrate(sku)).toBeInstanceOf(Promise);

    // Awaited so nothing floats — the lint profile enforces no-floating-promises.
    await Promise.all([
      sku.getBaseProductType(),
      sku.getSkuDefinition(),
      sku.getLivePrice(),
      sku.getCurrentAccountPrice(),
      sku.hasUniqueOptions(),
      sku.getTransactionExistsFlag(),
      Sku.hydrate(sku),
    ]);
  });

  it('★ getBaseProductType is a PURE, UNGUARDED delegation to the product', async () => {
    // CFML parity [model/entity/Sku.cfc:L356-L358]: `return getProduct().getBaseProductType();`
    // — one statement, no guard. A sku with no product raises, and a product with
    // no product type raises at [model/entity/Product.cfc:L494]. Neither is
    // softened into a default, because a merchandise-versus-subscription
    // misclassification changes which sku-definition branch runs.
    //
    // ★ `ProductType.getBaseProductType()` uses `listFirst` on `productTypeIDPath`,
    // so it answers element ONE — the ROOT. Any "second element" claim is wrong;
    // verified first-hand at [model/entity/ProductType.cfc:L110-L115]. SOURCE WINS.
    const withType = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);

    expect(await withType.getBaseProductType()).toBe(BASE_TYPE_MERCHANDISE);

    // The default fixture product DOES carry a merchandise product type, so the
    // second refusal has to be provoked with a product built WITHOUT one — the
    // fixture distinguishes "key omitted" from "key passed as undefined", and the
    // latter genuinely leaves the association absent.
    const noProduct = makeSkuFixture({ product: undefined });
    const noProductType = makeSkuFixture({
      product: makeProductFixture({
        productID: 'typeless-product',
        skus: [],
        productType: undefined,
      }),
    });

    await expect(noProduct.getBaseProductType()).rejects.toThrow(Error);
    await expect(noProductType.getBaseProductType()).rejects.toThrow(
      /\[model\/entity\/Product\.cfc:L494\]/,
    );
  });
});

// ===========================================================================
// B24 — ASSOCIATION, FAR-SIDE AND STRUCTURAL PARITY
// ===========================================================================

describe('Sku association and structural parity', () => {
  it('★ G3 IS MIXED — the shipped far-side behaviour is tested, never an assumed convention', () => {
    // Far-side graph symmetry is REPRODUCED in priceGroupRate.ts,
    // promotionApplied.ts, promotionPeriod.ts, promotionCode.ts,
    // promotionQualifier.ts, promotionReward.ts and priceGroup.ts, and NOT
    // reproduced in option.ts, skuCurrency.ts, category.ts and brand.ts. There is
    // therefore no folder-wide convention to lean on.
    //
    // Verified first-hand for `sku.ts`: `setProduct` DOES complete the far side
    // [model/entity/Sku.cfc:L614] with the `isNew() || !hasSku(this)` guard, and
    // `removeProduct` DOES remove this sku from the product's collection. That is
    // the shipped behaviour, and that is what is asserted.
    const product = makeProductFixture({ productID: 'farside-product', skus: [] });
    const sku = makeSkuFixture({ product: undefined });

    expect(product.getSkus()).toEqual([]);

    sku.setProduct(product);

    expect(sku.getProduct()).toBe(product);
    expect(product.hasSku(sku)).toBe(true);
    expect(product.getSkus()).toHaveLength(1);

    // Idempotent: the guard prevents a duplicate append.
    sku.setProduct(product);

    expect(product.getSkus()).toHaveLength(1);

    sku.removeProduct(product);

    expect(sku.getProduct()).toBeUndefined();
    expect(product.getSkus()).toEqual([]);
  });

  it('★ every association comparison is by PRIMARY KEY only — asserted here for hasOption', () => {
    // ★★★ THE CLAIM WAS WIDER THAN THE EVIDENCE, AND A CODE REVIEW SAID SO. This case used to open
    // "`hasOption`, `hasSkuCurrency`, `hasPriceGroupRate` and the four promotion predicates all
    // compare identifiers" and then exercise `hasOption` ALONE - so six of the seven probes were
    // named but never called. The sentence now describes what this case does, and the other six are
    // asserted in `the seven association probes` block below, each against a real far side.
    //
    // A structurally identical collaborator carrying a different id is a different row; two instances
    // sharing an id are the same row.
    const sku = makeSkuFixture();
    const mine = requireOption(sku.getOptions(), 0);
    const sameRow = makeOptionDouble(
      mine.getOptionID(),
      'different-code',
      'Different name',
      makeOptionGroupDouble('different-group', 'diff', 'Different', 7),
      99,
    );
    const foreign = makeOptionDouble(
      'foreign-option',
      mine.getOptionCode() ?? '',
      mine.getOptionName() ?? '',
      requireOptionGroupOf(mine),
      mine.getSortOrder() ?? 1,
    );

    expect(sku.hasOption(mine)).toBe(true);
    expect(sameRow).not.toBe(mine);
    expect(sku.hasOption(sameRow)).toBe(true);
    expect(sku.hasOption(foreign)).toBe(false);
  });

  it('★★ the EIGHT promotion delegations wire and unwire BOTH sides, per family', () => {
    // ★★★ NONE OF THESE EIGHT WAS EVER CALLED, which a code review measured: the four include/exclude
    // pairs were covered only by structural claims elsewhere in this file, so an inverted add/remove,
    // a delegation pointed at the wrong family, or one that pushed onto a local array instead of
    // reaching the far side would all have passed. Each is a single-line delegation to the OWNING
    // side [model/entity/Sku.cfc:L672-L701], and each far side mutates BOTH collections
    // [model/entity/PromotionReward.cfc:L258-L275, PromotionQualifier.cfc:L301-L306].
    const sku = makeSkuFixture({ skuID: 'sku-1' });
    const reward = new PromotionReward({ promotionRewardID: 'reward-1' });
    const excludedReward = new PromotionReward({ promotionRewardID: 'reward-2' });
    const qualifier = new PromotionQualifier({ promotionQualifierID: 'qualifier-1' });
    const excludedQualifier = new PromotionQualifier({ promotionQualifierID: 'qualifier-2' });

    sku.addPromotionReward(reward);
    sku.addPromotionRewardExclusion(excludedReward);
    sku.addPromotionQualifier(qualifier);
    sku.addPromotionQualifierExclusion(excludedQualifier);

    // Both sides of all four links, and NO cross-contamination between the include and exclude
    // collections of either family - `SwPromoRewardSku` versus `SwPromoRewardExclSku` [L82, L83] and
    // `SwPromoQualSku` versus `SwPromoQualExclSku` [L84, L85] are different tables.
    expect(sku.getPromotionRewards()).toEqual([reward]);
    expect(reward.getSkus()).toEqual([sku]);
    expect(sku.getPromotionRewardExclusions()).toEqual([excludedReward]);
    expect(excludedReward.getExcludedSkus()).toEqual([sku]);
    expect(excludedReward.getSkus()).toHaveLength(0);

    expect(sku.getPromotionQualifiers()).toEqual([qualifier]);
    expect(qualifier.getSkus()).toEqual([sku]);
    expect(sku.getPromotionQualifierExclusions()).toEqual([excludedQualifier]);
    expect(excludedQualifier.getExcludedSkus()).toEqual([sku]);
    expect(excludedQualifier.getSkus()).toHaveLength(0);

    sku.removePromotionReward(reward);
    sku.removePromotionRewardExclusion(excludedReward);
    sku.removePromotionQualifier(qualifier);
    sku.removePromotionQualifierExclusion(excludedQualifier);

    expect(sku.getPromotionRewards()).toHaveLength(0);
    expect(reward.getSkus()).toHaveLength(0);
    expect(sku.getPromotionRewardExclusions()).toHaveLength(0);
    expect(excludedReward.getExcludedSkus()).toHaveLength(0);
    expect(sku.getPromotionQualifiers()).toHaveLength(0);
    expect(qualifier.getSkus()).toHaveLength(0);
    expect(sku.getPromotionQualifierExclusions()).toHaveLength(0);
    expect(excludedQualifier.getExcludedSkus()).toHaveLength(0);
  });

  it('★★ a SECOND add is a no-op for a saved sku, and a NEW sku is admitted twice', () => {
    // Guard `if(sku.isNew() or !hasSku(sku))` on the far side: a saved sku is compared by identifier,
    // so the link table cannot acquire a duplicate row; an unsaved one short-circuits the guard and IS
    // appended twice. Both halves are legacy behaviour and both are pinned, so neither an added
    // `includes` check nor a dropped guard can pass.
    const saved = makeSkuFixture({ skuID: 'sku-1' });
    const reward = new PromotionReward({ promotionRewardID: 'reward-1' });

    saved.addPromotionReward(reward);
    saved.addPromotionReward(reward);

    expect(reward.getSkus()).toHaveLength(1);
    expect(saved.getPromotionRewards()).toHaveLength(1);

    const draft = makeSkuFixture({ skuID: 'sku-draft', isNew: true });
    const otherReward = new PromotionReward({ promotionRewardID: 'reward-2' });

    expect(draft.isNew()).toBe(true);

    draft.addPromotionReward(otherReward);
    draft.addPromotionReward(otherReward);

    expect(otherReward.getSkus()).toHaveLength(2);
    // The SKU side is guarded by `sku.hasPromotionReward(reward)`, which compares the reward's own
    // identifier, so it holds one.
    expect(draft.getPromotionRewards()).toHaveLength(1);
  });

  it('★★ the seven association probes each compare their OWN collection, by identifier', () => {
    // The six probes the primary-key case named but never called, plus `hasOption` again for
    // completeness - each against a real far side, each with a same-key twin and a foreign instance,
    // and each asserted NOT to answer for a sibling collection.
    const sku = makeSkuFixture({ skuID: 'sku-1', skuCurrencies: [], priceGroupRates: [] });

    const currency = makeSkuCurrencyDouble(
      'sku-currency-1',
      'USD',
      undefined,
      undefined,
      undefined,
    );
    const rate = new PriceGroupRate({ priceGroupRateID: 'rate-1' });
    const reward = new PromotionReward({ promotionRewardID: 'reward-1' });
    const excludedReward = new PromotionReward({ promotionRewardID: 'reward-2' });
    const qualifier = new PromotionQualifier({ promotionQualifierID: 'qualifier-1' });
    const excludedQualifier = new PromotionQualifier({ promotionQualifierID: 'qualifier-2' });

    // Hydration-shaped wiring for the two collections with no add/remove pair on this entity, and
    // delegation-shaped wiring for the four promotion families.
    sku.getSkuCurrencies().push(currency);
    sku.getPriceGroupRates().push(rate);
    sku.addPromotionReward(reward);
    sku.addPromotionRewardExclusion(excludedReward);
    sku.addPromotionQualifier(qualifier);
    sku.addPromotionQualifierExclusion(excludedQualifier);

    // SAME-KEY TWINS are the same row, because a repository read produces a fresh instance per read.
    expect(
      sku.hasSkuCurrency(
        makeSkuCurrencyDouble('sku-currency-1', 'EUR', undefined, undefined, undefined),
      ),
    ).toBe(true);
    expect(sku.hasPriceGroupRate(new PriceGroupRate({ priceGroupRateID: 'rate-1' }))).toBe(true);
    expect(sku.hasPromotionReward(new PromotionReward({ promotionRewardID: 'reward-1' }))).toBe(
      true,
    );
    expect(
      sku.hasPromotionRewardExclusion(new PromotionReward({ promotionRewardID: 'reward-2' })),
    ).toBe(true);
    expect(
      sku.hasPromotionQualifier(new PromotionQualifier({ promotionQualifierID: 'qualifier-1' })),
    ).toBe(true);
    expect(
      sku.hasPromotionQualifierExclusion(
        new PromotionQualifier({ promotionQualifierID: 'qualifier-2' }),
      ),
    ).toBe(true);

    // A DIFFERENT key is a different row.
    expect(
      sku.hasSkuCurrency(
        makeSkuCurrencyDouble('sku-currency-9', 'USD', undefined, undefined, undefined),
      ),
    ).toBe(false);
    expect(sku.hasPriceGroupRate(new PriceGroupRate({ priceGroupRateID: 'rate-9' }))).toBe(false);

    // AND EACH PROBE READS ONE COLLECTION. Crossing the include and exclude members over is the
    // mistake a shared helper makes, so it is asserted in both directions per family.
    expect(sku.hasPromotionReward(excludedReward)).toBe(false);
    expect(sku.hasPromotionRewardExclusion(reward)).toBe(false);
    expect(sku.hasPromotionQualifier(excludedQualifier)).toBe(false);
    expect(sku.hasPromotionQualifierExclusion(qualifier)).toBe(false);
  });

  it('★ THE LIVE-ARRAY RULE IS ABSOLUTE — association accessors do NOT return defensive copies', () => {
    // Hibernate handed back the LIVE collection, and the legacy relies on that:
    // `optionGroup.getOptions().push(option)` is how the inverse side of
    // `SwSkuOption` is completed during hydration. A defensive copy would silently
    // break graph construction, so the shipped accessors return the array itself
    // and this suite pins that rather than wishing otherwise.
    const sku = makeSkuFixture();

    expect(sku.getOptions()).toBe(sku.getOptions());
    expect(sku.getSkuCurrencies()).toBe(sku.getSkuCurrencies());
    expect(sku.getPriceGroupRates()).toBe(sku.getPriceGroupRates());
    expect(sku.getPromotionRewards()).toBe(sku.getPromotionRewards());
    expect(sku.getPromotionRewardExclusions()).toBe(sku.getPromotionRewardExclusions());
    expect(sku.getPromotionQualifiers()).toBe(sku.getPromotionQualifiers());
    expect(sku.getPromotionQualifierExclusions()).toBe(sku.getPromotionQualifierExclusions());
  });

  it('★ preserves the ABBREVIATED physical table names in every structural claim (C5)', () => {
    // The eleven link and child tables this entity touches keep their legacy
    // physical names: SwSkuOption [L76], SwSkuAccessContent [L77],
    // SwSkuSubsBenefit [L78], SwSkuRenewalSubsBenefit [L79], SwPromoRewardSku
    // [L82], SwPromoRewardExclSku [L83], SwPromoQualSku [L84], SwPromoQualExclSku
    // [L85], SwPriceGroupRateSku [L86], SwPhysicalSku [L87] and SwSkuCurrency
    // [L72]. No migration, seed or schema-generation hook exists anywhere in this
    // subtree, and the existing `Sw*` schema is read and written unchanged.
    //
    // The four out-of-scope many-to-many sides survive as OPAQUE IDENTIFIER
    // ARRAYS, which is how the schema contract is kept without importing an
    // out-of-scope aggregate.
    const sku = makeSkuFixture();

    expect(sku.getAccessContentIDs()).toEqual([]);
    expect(sku.getSubscriptionBenefitIDs()).toEqual([]);
    expect(sku.getRenewalSubscriptionBenefitIDs()).toEqual([]);
    expect(sku.getPhysicalIDs()).toEqual([]);
    expect(sku.getAlternateSkuCodeIDs()).toEqual([]);
    expect(sku.getStockIDs()).toEqual([]);
    expect(sku.getSubscriptionTermID()).toBeUndefined();
  });

  it('★ ANNOTATES the source warts at [L49], [L61-L62] and [L69-L87] rather than normalising them', () => {
    // Three warts, recorded and left alone:
    //
    //   1. [model/entity/Sku.cfc:L49] the attribute order is
    //      `persistent, accessors, output` — the REVERSE of every sibling entity —
    //      and there is NO `displayname` attribute at all.
    //   2. [model/entity/Sku.cfc:L61-L62] a `// Calculated Properties` banner
    //      enclosing `calculatedQATS ormtype="integer"`, a section NO other
    //      in-scope entity has.
    //   3. [model/entity/Sku.cfc:L69-L87] the `type="array"` declaration is
    //      INCONSISTENT: `attributeValues` [L70], `skuCurrencies` [L72],
    //      `promotionRewardExclusions` [L83], `promotionQualifierExclusions` [L85]
    //      and `physicals` [L87] carry it, while `alternateSkuCodes` [L69],
    //      `stocks` [L73] and `options` [L76] do not.
    //
    // `ormtype`/`ormType` casing, the `type="array"` inconsistency, the
    // abbreviated table names and the banner warts are all left exactly as found.
    const sku = makeSkuFixture();

    // The calculated property is a plain integer column with NO default
    // [model/entity/Sku.cfc:L62], so it is genuinely absent until a query projects
    // it — which is precisely why it sits under its own banner rather than among
    // the persistent properties above.
    expect(sku.getCalculatedQATS()).toBe(7);
    expect(new Sku({ skuID: 'unprojected-sku' }).getCalculatedQATS()).toBeUndefined();

    // `activeFlag` [L53] DOES carry `default="1"`, unlike most siblings.
    expect(new Sku({ skuID: 'flag-sku' }).getActiveFlag()).toBe(true);
  });

  it('★★ carries remoteID through hydration, present and absent, as its own persisted column', () => {
    // ★★★ THIS COLUMN HAD NO NON-NULL BEHAVIOURAL COVERAGE, which a code review measured: every
    // hand-built double in this suite passes `remoteID: undefined`, and the repository suite
    // hydrated it as `null` in every row - so nothing anywhere read a populated one. It is the
    // external-system correlation column [model/entity/Sku.cfc:L90], the one value an ERP or a
    // legacy Slatwall installation uses to recognise a row it already knows about, so an accessor
    // wired to the wrong field or a hydration that dropped it would break reconciliation silently
    // while every test stayed green.
    const correlated = new Sku({ skuID: 'sku-1', remoteID: 'legacy-erp-SKU-00417' });
    const uncorrelated = new Sku({ skuID: 'sku-2' });

    expect(correlated.getRemoteID()).toBe('legacy-erp-SKU-00417');
    expect(uncorrelated.getRemoteID()).toBeUndefined();

    // The fixture's own default is a populated one, so the fixture path is covered too rather than
    // being assumed equivalent to a hand-built double.
    expect(makeSkuFixture({ skuID: 'sku-3' }).getRemoteID()).toBe('remote-test-sku');

    // ABSENCE IS EXPLICIT, not defaulted: the column is nullable with no `default` attribute, so an
    // absent value must stay absent rather than becoming '' or the sku's own identifier.
    expect(makeSkuFixture({ skuID: 'sku-4', remoteID: undefined }).getRemoteID()).toBeUndefined();

    // And the EMPTY STRING is preserved as the distinct third state a persisted blank produces.
    expect(new Sku({ skuID: 'sku-5', remoteID: '' }).getRemoteID()).toBe('');
  });

  it('★ THE FOUR DEPRECATED METHODS ARE PORTED, because deprecated is not absent (C4)', () => {
    // [model/entity/Sku.cfc:L882-L912] is a POPULATED `Deprecated Methods` banner
    // pair — unusual in this folder; `PromotionCode.cfc:L189-L191` has the same
    // pair and it is EMPTY. All four are on the public surface, so all four are
    // ported and their shipped behaviour is asserted.
    //
    // LEGACY-NOTE [model/entity/Sku.cfc:L885 versus L233]: `displayOptions()` and
    // the non-deprecated `getOptionsDisplay()` have IDENTICAL bodies — the local is
    // even spelled the same, `dspOptions`. The duplication is recorded, not
    // resolved.
    const sku = makeSkuFixture();

    // 1 + 2: identical bodies, default delimiter `' '`.
    expect(sku.displayOptions()).toBe(sku.getOptionsDisplay());
    expect(sku.displayOptions('|')).toBe(sku.getOptionsDisplay('|'));
    expect(sku.getOptionsDisplay()).toContain('Large');

    // 3: pure delegation to the corrected ID struct.
    expect(sku.getOptionsByGroupIDStruct()).toEqual(sku.getOptionsByOptionGroupIDStruct());

    // 4: keyed by option-group NAME, valued with the option ID, LAST wins — the
    // legacy has no existence guard here, unlike [L504] and [L516].
    const valueStruct = sku.getOptionsValueStruct();
    const firstOption = requireOption(sku.getOptions(), 0);
    const firstGroupName = requireOptionGroupOf(firstOption).getOptionGroupName() ?? '';

    expect(structGet(valueStruct, firstGroupName)).toBe(firstOption.getOptionID());
    expect(structKeyExists(valueStruct, firstGroupName)).toBe(true);
  });

  it('★ getOptionsValueStruct is LAST-match-wins, opposite to the two option structs', () => {
    // No `if(!structKeyExists(...))` guard at [L902], so a later option under the
    // same group NAME overwrites an earlier one. Three opposing dedupe directions
    // coexist on this one entity: first-wins at [L504]/[L516], last-wins here and
    // in the currency cascade's Step 2 at [L399-L414]. Collapsing any of them into
    // a single convention would change which price or which option a customer sees.
    const sharedGroup = makeOptionGroupDouble('shared-value-group', 'sharedvalue', 'Shared', 1);
    const sku = makeSkuFixture({
      options: [
        makeOptionDouble('value-first', 'value-first', 'First', sharedGroup, 1),
        makeOptionDouble('value-last', 'value-last', 'Last', sharedGroup, 2),
      ],
    });

    expect(structGet(sku.getOptionsValueStruct(), 'Shared')).toBe('value-last');
    // …while the ID struct keeps the FIRST, on the very same fixture.
    expect(
      structGet(sku.getOptionsByOptionGroupIDStruct(), 'shared-value-group')?.getOptionID(),
    ).toBe('value-first');
  });

  it('★ rbKey identifiers stay INERT STRING CONSTANTS — no i18n runtime is introduced', () => {
    // JavaRB is deliberately not ported (AAP §0.5.3). Resource-bundle identifiers
    // behind `rbKey`, `hb_rbKey` and `hb_nullRBKey` survive as plain strings so the
    // legacy admin can still resolve them, and no lookup runtime is added.
    //
    // The one Sku site that would have needed a live lookup —
    // `rbKey('entity.subscriptionTerm')` at [model/entity/Sku.cfc:L585] — is the
    // subscription branch, which REFUSES rather than fabricating a translation (see
    // B6). That refusal is why no i18n runtime is required anywhere here.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_SUBSCRIPTION);
    const probe = sku as unknown as Record<string, unknown>;

    expect(probe['rbKey']).toBeUndefined();
    expect(probe['getRBKey']).toBeUndefined();
    expect(probe['getHibachiRBService']).toBeUndefined();
  });
});

// ===========================================================================
// B25 — THE FIVE DISTINCT EMPTY-COLLECTION SEMANTICS
//
// Collapsing any one of these into another is a money bug.
// ===========================================================================

describe('Sku empty-collection semantics — five distinct answers, not one', () => {
  it('★ names all five, and pins the three this entity can observe', () => {
    // The five, verbatim from the shipped domain documentation:
    //
    //   1. PERMISSIVE IN THE CALLER'S LOOP — an empty `addressZones` collection
    //      means the caller's loop never runs and the qualifier passes
    //      [model/service/PromotionService.cfc:L333-L420].
    //   2. RESTRICTIVE IN THE EVALUATOR — an empty `locations` collection makes
    //      `isAddressInZone` answer false [model/service/AddressService.cfc:L57].
    //   3. `hasAnyInProperty` RETURNS FALSE ON EMPTY
    //      [org/Hibachi/HibachiEntity.cfc:L348] — which is PERMISSIVE on an
    //      exclude-list and RESTRICTIVE on an include-list, i.e. two of the five
    //      from one helper.
    //   4. THE FULFILMENT THREE-WAY GATE
    //      [model/service/PromotionService.cfc:L333-L420].
    //   5. `Brand.getProducts()` MUST DEFAULT TO `[]`, which is what
    //      `meta/tests/unit/entity/BrandTest.cfc`'s `defaults_are_correct()`
    //      asserts — sibling-owned by `brand.test.ts`.
    //
    // On Sku specifically, an empty `options` collection produces FOUR different
    // answers from five readers, and they are not interchangeable.
    const optionLess = makeSkuFixture({ options: [] });

    // (a) the empty STRING, from the `''` seed at [L526].
    expect(optionLess.getOptionsIDList()).toBe('');
    // (b) the empty STRUCT, twice — the corrected divergence-(c) behaviour.
    expect(optionLess.getOptionsByOptionGroupIDStruct()).toEqual({});
    expect(optionLess.getOptionsByOptionGroupCodeStruct()).toEqual({});
    // (c) PERMISSIVE `true`, because the loop at [L774] never runs.
    expect(optionLess.hasOneOptionPerOptionGroup()).toBe(true);
    // (d) the empty DISPLAY string, from the same `''` seed pattern at [L234].
    expect(optionLess.getOptionsDisplay()).toBe('');
  });

  it('★ and hasUniqueOptions answers the OPPOSITE way on the very same empty collection', async () => {
    // The fifth reader of the same empty collection fails SPURIOUSLY — see B15.6.
    // Two validators on one `options` entry of `model/validation/Sku.json`, reading
    // one empty collection, disagreeing: `hasOneOptionPerOptionGroup` passes while
    // `hasUniqueOptions` fails. That is why "empty means permissive" can never be
    // applied as a blanket rule.
    const repositoryLog: SkuRepositoryCall[] = [];
    const siblings = [
      makeSkuFixture({ idPrefix: 'sib-a', skuID: 'sib-a-sku' }),
      makeSkuFixture({ idPrefix: 'sib-b', skuID: 'sib-b-sku' }),
    ];
    const optionLess = makeSkuWithSelectionResult(siblings, repositoryLog, []);

    expect(optionLess.hasOneOptionPerOptionGroup()).toBe(true);
    expect(await optionLess.hasUniqueOptions()).toBe(false);
  });

  it('★ an empty currency-detail map yields undefined from all three accessors, never zero', () => {
    // The currency map's empty semantic is the highest-consequence of the lot: an
    // empty map is UNPRICED, and unpriced must never read as free. This restates
    // the B1/B2.1 gate from the empty-collection angle deliberately, because that
    // is the reading under which the mistake gets made.
    const sku = makeSkuFixture();

    expect(sku.getCurrencyDetails()).toEqual({});
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();
  });

  it('an empty price-group rate collection resolves to NO rate, not to a zero-amount rate', () => {
    // A fabricated zero-amount rate would apply a 100% discount. `undefined` is the
    // only safe answer, and it is the legacy answer.
    const sku = makeSkuFixture();
    const emptyPriceGroup = new PriceGroup({
      priceGroupID: 'empty-pricegroup',
      priceGroupIDPath: 'empty-pricegroup',
      activeFlag: true,
      priceGroupName: 'Empty',
      priceGroupCode: 'empty',
      parentPriceGroup: undefined,
      childPriceGroups: [],
      priceGroupRates: [],
      promotionRewards: [],
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: undefined,
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: undefined,
    });

    expect(sku.getPriceGroupRates()).toEqual([]);
    expect(sku.getAppliedPriceGroupRateByPriceGroup(emptyPriceGroup)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE IMAGE BLOCK  [model/entity/Sku.cfc:L131-L147, L149-L151, L192-L227]
//
// THE TWO PORTED BODIES, VERBATIM:
//
//   L131  public string function generateImageFileName() {
//   L132    var optionString = "";
//   L133    for(var option in getOptions()){
//   L134      if(option.getOptionGroup().getImageGroupFlag()){
//   L135        optionString &= getProduct().setting('productImageOptionCodeDelimiter')
//                                & reReplaceNoCase(option.getOptionCode(), "[^a-z0-9\-\_]","","all");
//             }
//           }
//   L138    return reReplaceNoCase(getProduct().getProductCode(), "[^a-z0-9\-\_]","","all")
//              & optionString & ".#getProduct().setting('productImageDefaultExtension')#";
//         }
//
//   L145  public string function getImagePath() {
//   L146    return "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#";
//         }
//
// ★★ WHY THESE TWO SHIP WHILE THE OTHER THREE REFUSE, AND WHY THEY TREAT AN ABSENT
// SETTING SET DIFFERENTLY FROM EACH OTHER. Both read an ambient value the domain may
// not resolve, so both take the resolved values through the constructor. But the
// SOURCE could not fail in the same way in both places, and the port mirrors that
// rather than applying one blanket policy:
//
//   - `generateImageFileName` reads two SETTINGS, and both carry a metadata
//     `defaultValue` - `productImageDefaultExtension` `"jpg"` and
//     `productImageOptionCodeDelimiter` `"-"`
//     [model/service/SettingService.cfc:L191-L192] - which `setting()` falls back to
//     at [L481-L482]. So `setting()` CANNOT FAIL for either key, and a port that
//     raised on an unmaterialised set would refuse where the source answers. It
//     MIRRORS the defaults instead.
//   - `getImagePath` reads `getHibachiScope().getBaseImageURL()`, a framework SCOPE
//     ACCESSOR with no metadata default and nothing to fall back to. It raises,
//     because every candidate default would be a well-formed WRONG path.
//
// The distinction is load-bearing: `saveProduct` [model/service/ProductService.cfc:
// L282] runs `updateDefaultImageFileNames` for EVERY new product, so a raising
// `generateImageFileName` would make every product save fail.
// ═══════════════════════════════════════════════════════════════════════════

describe('Sku image members — the two that ship and the three that refuse', () => {
  /** An `SwOptionGroup` row whose `imageGroupFlag` [model/entity/OptionGroup.cfc:L57] is SET. */
  function makeImageBearingOptionGroup(optionGroupID: string, sortOrder: number): OptionGroup {
    return new OptionGroup({
      optionGroupID,
      optionGroupName: `Group ${optionGroupID}`,
      optionGroupCode: optionGroupID,
      optionGroupImage: undefined,
      optionGroupDescription: undefined,
      // The one difference from `makeOptionGroupDouble`, which hardcodes `false`
      // because the shared fixture mirrors the column default.
      imageGroupFlag: true,
      sortOrder,
      remoteID: undefined,
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: undefined,
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: undefined,
      options: [],
      optionSortTieBreaker: () => 1,
    });
  }

  const CONFIGURED_SETTINGS = {
    baseImageURL: 'https://cdn.example/assets/images',
    productImageOptionCodeDelimiter: '_',
    productImageDefaultExtension: 'webp',
  } as const;

  it('★ mirrors the SETTING METADATA DEFAULTS when no image settings were materialised', () => {
    // ★★ THE M10 BLOCKER, ASSERTED AS BEHAVIOUR. An earlier revision raised here,
    // reasoning by analogy with `getImagePath`. That analogy was wrong: the two
    // settings this member reads both declare a `defaultValue`
    // [model/service/SettingService.cfc:L191-L192] and `setting()` applies it at
    // [L481-L482], so CFML ALWAYS answers. `'-'` and `'jpg'` are those two declared
    // values, mirrored at the read site because that is where CFML applies them.
    const product = makeProductFixture();
    const sku = new Sku({ skuID: 'sku-default-settings', product, options: [] });

    // [L138]: sanitised product code, no option segments, literal `.`, extension.
    // `TESTPRODUCTXXX` is [meta/tests/unit/Helper.cfc:L56] verbatim.
    expect(sku.generateImageFileName()).toBe('TESTPRODUCTXXX.jpg');
  });

  it('★ prefers the CONFIGURED delimiter and extension when the set was materialised', () => {
    // The mirrored defaults are a fallback, not a hardcoding - a materialised set
    // wins, which is what makes the mirroring safe rather than a second source of
    // truth. Both values differ from the metadata defaults so neither can pass by
    // coincidence.
    const product = makeProductFixture();
    const sku = new Sku({
      skuID: 'sku-configured-settings',
      product,
      options: [],
      imageSettingValues: CONFIGURED_SETTINGS,
    });

    expect(sku.generateImageFileName()).toBe('TESTPRODUCTXXX.webp');
  });

  it('★ contributes a segment for image-bearing groups ONLY, in materialised option order', () => {
    // [L134] gates the segment on `getOptionGroup().getImageGroupFlag()`. A
    // non-image group contributes NOTHING - not an empty delimiter, not a placeholder
    // - so the two halves are asserted against the same sku rather than separately.
    const product = makeProductFixture();
    const imageGroup = makeImageBearingOptionGroup('image-group', 1);
    const plainGroup = makeOptionGroupDouble('plain-group', 'plain-group', 'Plain', 2);

    const imageOption = makeOptionDouble('opt-image', 'RED', 'Red', imageGroup, 1);
    const plainOption = makeOptionDouble('opt-plain', 'LARGE', 'Large', plainGroup, 1);

    const sku = new Sku({
      skuID: 'sku-mixed-groups',
      product,
      options: [imageOption, plainOption],
    });

    // `-RED` only. `LARGE` is dropped because its group's flag is clear.
    expect(sku.generateImageFileName()).toBe('TESTPRODUCTXXX-RED.jpg');
    expect(sku.generateImageFileName()).not.toContain('LARGE');

    // [L133] iterates `getOptions()` in the order the array carries, so TWO image
    // groups append in that order and the delimiter precedes EACH segment.
    const secondImageGroup = makeImageBearingOptionGroup('image-group-2', 3);
    const secondImageOption = makeOptionDouble(
      'opt-image-2',
      'XL',
      'Extra Large',
      secondImageGroup,
      1,
    );

    const twoSegments = new Sku({
      skuID: 'sku-two-image-groups',
      product,
      options: [imageOption, plainOption, secondImageOption],
    });

    expect(twoSegments.generateImageFileName()).toBe('TESTPRODUCTXXX-RED-XL.jpg');
  });

  it('★ sanitises with reReplaceNoCase semantics, so CAPITALS SURVIVE', () => {
    // ★ THE `NoCase` IN `reReplaceNoCase` IS THE WHOLE POINT [L135, L138]. The CFML
    // character class lists lower-case `a-z` only, but the case-insensitive variant
    // folds case, so `A-Z` are NOT stripped. A port that used a case-sensitive regex
    // would turn `ABC-1` into `-1` and rename every image file in the catalogue.
    const product = makeProductFixture({ productCode: 'AB C/1*2' });
    const imageGroup = makeImageBearingOptionGroup('image-group', 1);
    const option = makeOptionDouble('opt-1', 'R E D!', 'Red', imageGroup, 1);

    const sku = new Sku({ skuID: 'sku-dirty-codes', product, options: [option] });

    // Space, slash, asterisk and exclamation mark are outside `[^a-z0-9\-\_]`;
    // letters, digits, hyphen and underscore survive - in BOTH cases.
    expect(sku.generateImageFileName()).toBe('ABC12-RED.jpg');
  });

  it('★ treats an absent product code as an empty segment rather than raising', () => {
    // `reReplaceNoCase` over a null column yields the empty string in CFML, so a
    // product with no code composes to just the extension. Reproduced, because the
    // legacy emits exactly that name and a raise would emit none.
    const product = makeProductFixture({ productCode: undefined });
    const sku = new Sku({ skuID: 'sku-no-code', product, options: [] });

    expect(sku.generateImageFileName()).toBe('.jpg');
  });

  it('★ RAISES for a sku with no product, naming the unguarded source dereference', () => {
    // LEGACY-DEFECT parity: [L135] and [L138] dereference `getProduct()` three times
    // with no guard against a nullable many-to-one, so a product-less sku raises in
    // CFML too. Preserved rather than defaulted - fabricating a name would write a
    // file the application could never find.
    const orphan = new Sku({ skuID: 'sku-orphan', options: [] });

    expect(() => orphan.generateImageFileName()).toThrow(
      /generateImageFileName was called on a sku with no product/,
    );
    expect(() => orphan.generateImageFileName()).toThrow(/model\/entity\/Sku\.cfc:L135/);
  });

  it('★ RAISES for an option with no option group, naming the nullable association', () => {
    // [L134] dereferences `option.getOptionGroup()` unconditionally, and
    // [model/entity/Option.cfc:L59] declares that association NULLABLE. Skipping the
    // option instead would emit a DIFFERENT file name than the CFML application
    // emits for the same rows, which is why the raise is reproduced.
    const product = makeProductFixture();
    const groupless = new Option({
      optionID: 'opt-groupless',
      optionCode: 'RED',
      optionName: 'Red',
      optionDescription: undefined,
      sortOrder: 1,
      optionGroup: undefined,
      defaultImageID: undefined,
      remoteID: undefined,
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: undefined,
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: undefined,
    });

    const sku = new Sku({ skuID: 'sku-groupless-option', product, options: [groupless] });

    expect(() => sku.generateImageFileName()).toThrow(/which has no option group/);
    expect(() => sku.generateImageFileName()).toThrow(/model\/entity\/Option\.cfc:L59/);
  });

  it('★ setImageFile assigns the column that getImagePath and getImageFile read', () => {
    // The mutator exists because `processProduct_updateDefaultImageFileNames`
    // [model/service/ProductService.cfc:L208-L214] runs
    // `sku.setImageFile( sku.generateImageFileName() )` over every sku of the
    // product. Without it that write had nowhere to land and the method was a no-op
    // reporting success.
    const product = makeProductFixture();
    const sku = new Sku({
      skuID: 'sku-set-image-file',
      product,
      options: [],
      imageSettingValues: CONFIGURED_SETTINGS,
    });

    expect(sku.getImageFile()).toBeUndefined();

    sku.setImageFile(sku.generateImageFileName());

    expect(sku.getImageFile()).toBe('TESTPRODUCTXXX.webp');
    expect(sku.getImagePath()).toBe(
      'https://cdn.example/assets/images/product/default/TESTPRODUCTXXX.webp',
    );

    // It overwrites rather than first-winning: the caller decides whether to write.
    sku.setImageFile('manually-chosen.png');

    expect(sku.getImageFile()).toBe('manually-chosen.png');
  });

  it('★ getImagePath interpolates an UNSET imageFile as the empty string, exactly as CFML does', () => {
    // [L146] interpolates `#getImageFile()#` directly. A null column interpolates as
    // empty, so the path is the directory with a trailing slash - a real legacy
    // outcome, not an error case, and one the feed renderer's fallback depends on.
    const sku = new Sku({
      skuID: 'sku-no-image-file',
      options: [],
      imageSettingValues: CONFIGURED_SETTINGS,
    });

    expect(sku.getImagePath()).toBe('https://cdn.example/assets/images/product/default/');

    // ⚠ AND IT NEEDS NO PRODUCT. Unlike `generateImageFileName`, [L146] never
    // dereferences `getProduct()`, so a product-less sku answers rather than raising.
    // The two members' preconditions differ and are asserted separately.
    expect(sku.getProduct()).toBeUndefined();
  });

  it('★ getImagePath RAISES without materialised settings, and names ONLY the accessor that has no default', () => {
    // ★★ THE REFUSAL IS NARROW, AND AN EARLIER REVISION'S WAS NOT. This member alone
    // needs the materialised set, because `getBaseImageURL()` is a framework SCOPE
    // accessor rather than a setting and so has nothing to fall back to. The message
    // must therefore NOT claim the two settings raise as well - they demonstrably do
    // not, three cases above - and it cites [L481-L482] precisely to record why the
    // treatment differs.
    const sku = new Sku({ skuID: 'sku-unmaterialised-settings', options: [] });

    expect(() => sku.getImagePath()).toThrow(/getImagePath was called on a sku hydrated without/);
    expect(() => sku.getImagePath()).toThrow(/getBaseImageURL/);
    expect(() => sku.getImagePath()).toThrow(/SettingService\.cfc:L481-L482/);

    // The same instance still composes a file name, which is the sharpest statement
    // of the asymmetry: one member answers and the other refuses, on identical input.
    const withProduct = new Sku({
      skuID: 'sku-unmaterialised-settings-2',
      product: makeProductFixture(),
      options: [],
    });

    expect(withProduct.generateImageFileName()).toBe('TESTPRODUCTXXX.jpg');
    expect(() => withProduct.getImagePath()).toThrow(/getBaseImageURL/);
  });

  it('★ the three unportable members refuse, and say that the other two are ported', () => {
    // A materialised set does NOT unlock these. `getImage` [L149] and
    // `getResizedImagePath` [L218] reach the un-ported `imageService`; and
    // `getImageExistsFlag` [L221] performs a filesystem existence check this runtime
    // has no filesystem for. Those are collaborator and platform obstacles, not
    // settings obstacles, so the refusal deliberately does not cite the settings port
    // - and it states positively that the two composition members DO ship, so a
    // reader of one message cannot conclude the whole block was abandoned.
    const sku = new Sku({
      skuID: 'sku-unportable-image-members',
      product: makeProductFixture(),
      options: [],
      imageSettingValues: CONFIGURED_SETTINGS,
    });

    for (const invoke of [
      () => sku.getImage(),
      () => sku.getResizedImagePath(),
      () => sku.getImageExistsFlag(),
    ]) {
      expect(invoke).toThrow(/is not ported/);
      expect(invoke).toThrow(
        /Sku\.getImagePath and Sku\.generateImageFileName ARE ported - they are pure composition/,
      );
    }

    // And the resize argument reaches the message, which proves the signature was
    // retained for parity rather than reduced to a nullary stub.
    expect(() => sku.getImage({ size: 'large' })).toThrow(/getImage\(large\)/);
    expect(() => sku.getResizedImagePath({ size: 'small' })).toThrow(
      /getResizedImagePath\(small\)/,
    );
  });
});

// ===========================================================================
// B26 — THE THREE MUTATORS: setUserDefinedPriceFlag AND THE SkuCurrency PAIR
//
// Three converted public members whose behaviour is asserted here directly rather
// than inferred from the paths that happen to pass through them.
//
//   [model/entity/Sku.cfc:L59]        `userDefinedPriceFlag ormtype="boolean" default="0"`
//   [model/entity/Sku.cfc:L656-L658]  addSkuCurrency    -> arguments.skuCurrency.setSku( this )
//   [model/entity/Sku.cfc:L659-L661]  removeSkuCurrency -> arguments.skuCurrency.removeSku( this )
//
// ★ WHY THE FLAG SETTER IS WORTH ITS OWN CASES. `userDefinedPriceFlag` is declared
// at [L59] and read by NOTHING else in the component — verified by a whole-file
// search of `model/entity/Sku.cfc`, which returns exactly that one line. It is one
// of only TWO `ormtype="boolean"` columns on this entity, alongside `activeFlag`
// [L53], so it is the entity's canonical persisted-flag boundary: the place where a
// driver value of `1`, `'1'`, `'true'`, `true` or SQL NULL becomes a TypeScript
// boolean. Getting that table wrong would not be a formatting slip; it would make
// an off flag read as on for a whole class of hydrations. The whole decision table
// is therefore pinned, including the ONE input that raises.
//
// ★ WHY THE CURRENCY PAIR IS WORTH ITS OWN CASES. `skuCurrencies` is
// `inverse="true"` [model/entity/Sku.cfc:L72], so the FAR side owns the foreign key
// and both helpers delegate rather than appending. The delegation is not
// incidental: `SkuCurrency.setSku` [model/entity/SkuCurrency.cfc:L90-L93] assigns
// its own field FIRST and then appends onto the array `Sku.getSkuCurrencies()` hands
// back — the same live array Step 2 of the currency cascade iterates at
// [model/entity/Sku.cfc:L399-L414]. Mutating that collection therefore changes
// which prices the cascade produces, which is exactly why both ported helpers clear
// the currency-details memo and why the round trip below re-materialises to prove
// it. A memo that survived a collection mutation would answer a converted Step 3
// price where a persisted Step 2 override exists, or the reverse — a money bug that
// no accessor-level assertion would catch.
//
// NO DEFECT AND NO DIVERGENCE IS CLAIMED HERE. Both helpers are CLEAN under the
// inversion cross-check — L657 calls `setSku` and L660 calls `removeSku`, neither is
// an `add*` — and the canonical register (see the index in
// `tests/unit/domain/entities/promotionReward.test.ts`) carries no entry against any
// of the three members. The memo clearing is the request-scoped-state treatment
// already justified at B21 and is recorded as such, never as an optimisation (C7).
// ===========================================================================

describe('Sku.setUserDefinedPriceFlag — the persisted-flag boundary [model/entity/Sku.cfc:L59]', () => {
  it('starts false, because the column declares default="0" and not NULL', () => {
    const bare = new Sku({ skuID: 'flag-default-sku' });

    // The constructor resolves an omitted flag to `false` rather than leaving it
    // absent, which is what `default="0"` [L59] means. `boolean`, never
    // `boolean | undefined`: an unset flag has an answer, and the answer is off.
    expect(bare.getUserDefinedPriceFlag()).toBe(false);
    expect(typeof bare.getUserDefinedPriceFlag()).toBe('boolean');
  });

  it('accepts every value CFML accepts, and answers what CFML answered', () => {
    // The full decision table, driven rather than sampled. Every row is a value a
    // MySQL driver or an admin payload can legitimately deliver for
    // `ormtype="boolean"`: a real boolean, `0`/`1`, the string forms of those, the
    // four CFML boolean literals in mixed case and with surrounding whitespace, a
    // numeric string that is neither `0` nor `1`, and the empty string — which is
    // falsy in CFML per the currency-eligibility gate at [model/entity/Sku.cfc:L373]
    // and is NOT an error.
    const table: readonly {
      readonly input: string | number | boolean;
      readonly answer: boolean;
    }[] = [
      { input: true, answer: true },
      { input: false, answer: false },
      { input: 1, answer: true },
      { input: 0, answer: false },
      { input: 2, answer: true },
      { input: '1', answer: true },
      { input: '0', answer: false },
      { input: 'true', answer: true },
      { input: 'false', answer: false },
      { input: 'yes', answer: true },
      { input: 'no', answer: false },
      { input: '  TRUE  ', answer: true },
      { input: 'No', answer: false },
      { input: '2', answer: true },
      { input: '0.0', answer: false },
      { input: '', answer: false },
      { input: '   ', answer: false },
    ];

    for (const { input, answer } of table) {
      const sku = new Sku({ skuID: 'flag-table-sku' });

      sku.setUserDefinedPriceFlag(input);

      expect(sku.getUserDefinedPriceFlag()).toBe(answer);
    }
  });

  it('resolves SQL NULL to false, because an undefaulted flag column can hydrate as null', () => {
    const fromNull = new Sku({ skuID: 'flag-null-sku' });
    const fromUndefined = new Sku({ skuID: 'flag-undefined-sku' });

    // The persisted-flag boundary, and the one behaviour the conversion helper adds
    // over a general boolean context: nine `ormtype="boolean"` properties across five
    // in-scope entities declare no default at all, so SQL NULL is an expected
    // hydration rather than a data fault, and it reads as the same `false` the legacy
    // engine gave a flag it had no value for. A general boolean context RAISES for
    // null instead, and that asymmetry is deliberate — resolving it there would make
    // an absent value indistinguishable from a deliberate off.
    fromNull.setUserDefinedPriceFlag(null);
    fromUndefined.setUserDefinedPriceFlag(undefined);

    expect(fromNull.getUserDefinedPriceFlag()).toBe(false);
    expect(fromUndefined.getUserDefinedPriceFlag()).toBe(false);
  });

  it('RAISES for a present value that carries no boolean meaning, rather than answering false', () => {
    const sku = new Sku({ skuID: 'flag-raise-sku' });

    // A column that hydrates as `'maybe'` is a schema surprise, not a false. CFML
    // itself raises a conversion error for a non-empty string that is neither a
    // boolean literal nor numeric, so answering `false` here would INVENT a behaviour
    // the legacy platform never had and hand back a plausible-looking negative for
    // input that means nothing. `'Y'`, `'on'` and a truncated `'tru'` would all have
    // looked like a deliberate off.
    expect(() => sku.setUserDefinedPriceFlag('maybe')).toThrow();
    expect(() => sku.setUserDefinedPriceFlag('Y')).toThrow();

    // The raise leaves the previous answer in place; no partial write happens.
    expect(sku.getUserDefinedPriceFlag()).toBe(false);
  });

  it('keeps its legacy one-parameter shape and touches no memo', async () => {
    const converterLog = makeCurrencyConverterLog();
    const sku = makeSkuFixture({
      skuCurrencyVariant: 'none',
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        converterLog,
      ),
    });

    // The cascade is reached through {@link Sku.hydrate} because the async half is not
    // published on the instance: `materializeCurrencyDetails` is PRIVATE on the shipped
    // entity, so an earlier draft's `await sku.materializeCurrencyDetails()` here did not
    // compile against it. Same run, same memo, one documented seam.
    await Sku.hydrate(sku);
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeDefined();

    sku.setUserDefinedPriceFlag(true);

    // Interface parity (C4): one declared parameter, exactly as
    // `setUserDefinedPriceFlag(required boolean userDefinedPriceFlag)` implies — no
    // context, no clock and no options bag is added. And unlike the money setters at
    // B21, this setter clears NOTHING: the cascade at [L367-L433] never reads the
    // flag, so invalidating the currency memo here would discard a valid map for a
    // column no derived value depends on.
    expect(arityOf(sku, 'setUserDefinedPriceFlag')).toBe(1);
    expect(sku.getUserDefinedPriceFlag()).toBe(true);
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeDefined();
    expect(Object.keys(sku.getCurrencyDetails())).not.toHaveLength(0);
  });
});

describe('Sku.addSkuCurrency / removeSkuCurrency — the inverse pair [model/entity/Sku.cfc:L656-L661]', () => {
  it('delegates to the far side, which sets its own sku and appends to the live array', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'none' });
    const row = makeSkuCurrencyDouble(
      'skucurrency-added',
      SECONDARY_CURRENCY_CODE,
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
      Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
      Money.fromDecimalString(SECONDARY_OVERRIDE_RENEWAL_PRICE),
    );

    expect(sku.getSkuCurrencies()).toStrictEqual([]);
    expect(row.getSku()).toBeUndefined();

    sku.addSkuCurrency(row);

    // [L657] is a single delegation, so BOTH sides of the association move and they
    // move because `SkuCurrency.setSku` moved them — the near side owns no append of
    // its own. The far side assigns its `sku` field BEFORE the guarded append
    // [model/entity/SkuCurrency.cfc:L90-L93], so the field is already set by the time
    // anything else can observe it.
    expect(row.getSku()).toBe(sku);
    expect(sku.getSkuCurrencies()).toStrictEqual([row]);
    expect(sku.hasSkuCurrency(row)).toBe(true);
  });

  it('appends onto the SAME array the cascade iterates, not a copy of it', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'none' });
    const captured = sku.getSkuCurrencies();
    const row = makeSkuCurrencyDouble(
      'skucurrency-live',
      SECONDARY_CURRENCY_CODE,
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
      undefined,
      undefined,
    );

    sku.addSkuCurrency(row);

    // ★ LIVE ARRAY REFERENCE. `arrayAppend(arguments.sku.getSkuCurrencies(), this)`
    // [model/entity/SkuCurrency.cfc:L92] mutated the very array the accessor returns,
    // and Step 2 of the cascade iterates that array at [model/entity/Sku.cfc:L399-L414].
    // A defensive copy here would leave the cascade permanently blind to every row
    // added after hydration.
    expect(sku.getSkuCurrencies()).toBe(captured);
    expect(captured).toHaveLength(1);
  });

  it('is guarded by primary key for a SAVED row, so adding it twice yields one entry', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'none' });
    const row = makeSkuCurrencyDouble(
      'skucurrency-saved',
      SECONDARY_CURRENCY_CODE,
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
      undefined,
      undefined,
    );

    sku.addSkuCurrency(row);
    sku.addSkuCurrency(row);

    // `isNew() or !arguments.sku.hasSkuCurrency( this )`
    // [model/entity/SkuCurrency.cfc:L91]: a saved row has a non-empty
    // `skuCurrencyID`, so `isNew()` is false, the membership test DOES run and it
    // compares by `skuCurrencyID`. One row, one entry.
    expect(sku.getSkuCurrencies()).toHaveLength(1);
  });

  it('appends an UNSAVED row twice, because the isNew() short-circuit skips the guard', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'none' });
    const unsaved = makeSkuCurrencyDouble(
      '',
      SECONDARY_CURRENCY_CODE,
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
      undefined,
      undefined,
    );

    sku.addSkuCurrency(unsaved);
    sku.addSkuCurrency(unsaved);

    // CFML `or` SHORT-CIRCUITS, and `isNew()` is true for a row whose
    // `skuCurrencyID` is the `unsavedvalue=""` empty string
    // [model/entity/SkuCurrency.cfc:L52], so the membership test never runs and the
    // append is unconditional. Reproduced faithfully rather than tidied: the source
    // chose duplication over omission because a key-based test cannot tell two
    // distinct new rows apart, and every unsaved row shares the same empty key. It is
    // a `CFML parity` fact, not a register entry — the same treatment
    // `option.test.ts` gives the identical short-circuit on `setOptionGroup`.
    expect(sku.getSkuCurrencies()).toHaveLength(2);
  });

  it('completes the round trip, so an added row can be removed from both sides', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'none' });
    const row = makeSkuCurrencyDouble(
      'skucurrency-roundtrip',
      SECONDARY_CURRENCY_CODE,
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
      undefined,
      undefined,
    );

    sku.addSkuCurrency(row);
    expect(sku.getSkuCurrencies()).toStrictEqual([row]);
    expect(row.getSku()).toBe(sku);

    sku.removeSkuCurrency(row);

    // [L660] delegates to `SkuCurrency.removeSku`, which splices the far-side array
    // when it finds the row [model/entity/SkuCurrency.cfc:L99-L102] and then clears
    // its own `sku` field OUTSIDE that guard, at [L103]. Both effects are asserted
    // against a link this case actually established, because the pair is only proven
    // total if the same row can be seen to arrive and then leave.
    expect(sku.getSkuCurrencies()).toStrictEqual([]);
    expect(row.getSku()).toBeUndefined();
    expect(sku.hasSkuCurrency(row)).toBe(false);
  });

  it('removes a hydrated row that never had its own sku assigned', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryOverride' });
    const held = requireSkuCurrency(sku.getSkuCurrencies(), 0);

    // A row that arrived through hydration sits in the collection without its own
    // `sku` field having been assigned — the shape every repository-built entity has,
    // since the far side is populated only by `setSku`. Removal has to work from that
    // state too, and the splice keys on the ROW, not on the row's back-reference.
    expect(held.getSku()).toBeUndefined();

    sku.removeSkuCurrency(held);

    expect(sku.getSkuCurrencies()).toStrictEqual([]);
    expect(sku.hasSkuCurrency(held)).toBe(false);
  });

  it('finds element ZERO, because the 1-based arrayFind guard was translated and not copied', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryOverride' });
    const first = requireSkuCurrency(sku.getSkuCurrencies(), 0);

    sku.removeSkuCurrency(first);

    // ★ THE OFF-BY-ONE THAT DID NOT HAPPEN. The far-side lookup is
    // `findIndex(...) !== -1`, the 0-based translation of CFML's 1-based
    // `arrayFind(...) > 0` [model/entity/SkuCurrency.cfc:L99-L100]. Carrying `> 0`
    // across literally would have made index 0 fail the guard, silently refusing to
    // remove the FIRST row — and on a single-row collection, which
    // `'secondaryOverride'` is and which real data usually is, that means refusing
    // every removal. The row removed here is at index 0 precisely so the case fails
    // if that translation is ever regressed.
    expect(sku.getSkuCurrencies()).toStrictEqual([]);
  });

  it('leaves a foreign collection alone, but still clears the row own sku unconditionally', () => {
    const owner = makeSkuFixture({ skuID: 'owner-sku', skuCurrencyVariant: 'none' });
    const other = makeSkuFixture({ skuID: 'other-sku', skuCurrencyVariant: 'none' });
    const row = makeSkuCurrencyDouble(
      'skucurrency-foreign',
      TERTIARY_CURRENCY_CODE,
      Money.fromDecimalString(BASE_OVERRIDE_PRICE),
      undefined,
      undefined,
    );

    owner.addSkuCurrency(row);

    expect(() => other.removeSkuCurrency(row)).not.toThrow();

    // ★ THE CLEAR SITS OUTSIDE THE GUARD, and this is the case that shows it. The
    // splice at [model/entity/SkuCurrency.cfc:L99-L102] finds nothing in the OTHER
    // sku's array, so that array is untouched — and `this.sku = javaCast("null","")`
    // at [L103] runs anyway. The result is a row that has lost its back-reference
    // while still sitting in its owner's collection: the two accessors now disagree.
    // Reproduced rather than repaired, because the legacy clear is unconditional and a
    // guarded clear would answer a live sku for a row a caller has explicitly removed.
    expect(other.getSkuCurrencies()).toStrictEqual([]);
    expect(owner.getSkuCurrencies()).toStrictEqual([row]);
    expect(row.getSku()).toBeUndefined();
  });

  it('★ neither helper clears the currency-details memo — hydration decides the price', async () => {
    const converterLog = makeCurrencyConverterLog();
    const sku = makeSkuFixture({
      skuCurrencyVariant: 'none',
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        converterLog,
      ),
    });

    // With no override rows, the secondary currency falls all the way through to
    // Step 3 and is CONVERTED [model/entity/Sku.cfc:L416-L428].
    const converted = requireDetail(
      (await Sku.hydrate(sku)).getCurrencyDetails(),
      SECONDARY_CURRENCY_CODE,
    );
    expect(converted.converted).toBe(true);
    expect(converted.skuCurrencyID).toBe('');

    const convertedPrice = converted.price?.toFixed2();
    const conversionsAfterHydration = converterLog.conversions.length;
    expect(convertedPrice).toBeDefined();
    expect(conversionsAfterHydration).toBeGreaterThan(0);

    const override = makeSkuCurrencyDouble(
      'skucurrency-memo',
      SECONDARY_CURRENCY_CODE,
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
      Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
      Money.fromDecimalString(SECONDARY_OVERRIDE_RENEWAL_PRICE),
    );

    sku.addSkuCurrency(override);

    // ★★ THIS CASE ASSERTS THE OPPOSITE OF WHAT AN EARLIER DRAFT OF IT ASSERTED, and the
    // reversal is recorded here rather than performed as a silent rewrite. The earlier draft
    // read '★ both helpers invalidate the currency-details memo, so the cascade re-runs
    // honestly' and asserted `expect(sku.getCurrencyDetails()).toEqual({})` after each
    // mutation. It was written against a revision of `sku.ts` in which `addSkuCurrency` and
    // `removeSkuCurrency` each cleared `currencyDetailsMemo`. That clearing has since been
    // removed from the entity, on the two grounds recorded there against
    // [model/entity/Sku.cfc:L656-L661, L368]: neither legacy helper touches
    // `variables.currencyDetails`, so clearing it INVENTED an invalidation the source does
    // not have; and with the cascade reachable only through {@link Sku.hydrate}, whose [L368]
    // memo guard makes a second run a no-op, a cleared memo could never be refilled — one
    // `addSkuCurrency` would have turned a fully priced sku into one whose three currency
    // accessors answer nothing at all. Every answer the earlier draft checked is still
    // checked below; only the direction changes, and its Step 2 expectations move to a sku
    // hydrated AFTER the mutation, which is the one order in which they are reachable.
    expect(sku.getSkuCurrencies()).toStrictEqual([override]);

    // The map is untouched, so the converted answer stands even though a persisted override
    // now sits in the very collection Step 2 reads [L399-L414]. That is the legacy outcome
    // rather than a target compromise: `variables.currencyDetails` outlives every mutation
    // within a request there too.
    const afterAdd = requireDetail(sku.getCurrencyDetails(), SECONDARY_CURRENCY_CODE);
    expect(afterAdd.converted).toBe(true);
    expect(afterAdd.skuCurrencyID).toBe('');
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toFixed2()).toBe(convertedPrice);
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toFixed2()).not.toBe(
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE).toFixed2(),
    );

    // Re-hydrating does not help either, because [L368]'s guard short-circuits on a populated
    // memo. The converter is not consulted a second time, and that is what proves the cascade
    // genuinely did not re-run rather than re-running to the same answer.
    const rehydrated = requireDetail(
      (await Sku.hydrate(sku)).getCurrencyDetails(),
      SECONDARY_CURRENCY_CODE,
    );
    expect(rehydrated.converted).toBe(true);
    expect(rehydrated.skuCurrencyID).toBe('');
    expect(converterLog.conversions).toHaveLength(conversionsAfterHydration);

    // Removing it is equally inert on the memo; the far-side collection is the only thing
    // that moves.
    sku.removeSkuCurrency(override);
    expect(sku.getSkuCurrencies()).toStrictEqual([]);
    expect(requireDetail(sku.getCurrencyDetails(), SECONDARY_CURRENCY_CODE).converted).toBe(true);
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toFixed2()).toBe(convertedPrice);

    // ★ AND THE STEP 2 ANSWERS THE EARLIER DRAFT WAS AFTER, ASSERTED WHERE THEY ARE
    // REACHABLE. A sku that receives the same override BEFORE its cascade runs takes Step 2
    // for that currency [L399-L414]: `converted` is false, the winning row's identifier is
    // recorded, and the override price beats the conversion. Add-then-hydrate answers the
    // override; hydrate-then-add does not. The mutators move the collection, and the
    // hydration boundary decides the price.
    const hydratedAfterAdd = makeSkuFixture({
      skuCurrencyVariant: 'none',
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        makeCurrencyConverterLog(),
      ),
    });

    hydratedAfterAdd.addSkuCurrency(
      makeSkuCurrencyDouble(
        'skucurrency-memo',
        SECONDARY_CURRENCY_CODE,
        Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
        Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
        Money.fromDecimalString(SECONDARY_OVERRIDE_RENEWAL_PRICE),
      ),
    );

    const stepTwo = requireDetail(
      (await Sku.hydrate(hydratedAfterAdd)).getCurrencyDetails(),
      SECONDARY_CURRENCY_CODE,
    );
    expect(stepTwo.converted).toBe(false);
    expect(stepTwo.skuCurrencyID).toBe('skucurrency-memo');
    expect(stepTwo.price?.toFixed2()).toBe(
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE).toFixed2(),
    );
  });

  it('keeps both legacy signatures at one parameter and adds no far-side member', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'none' });

    // Interface parity (C4): `addSkuCurrency(required any skuCurrency)` and
    // `removeSkuCurrency(required any skuCurrency)` each declare exactly one
    // parameter, and the port refines `any` to the concrete entity without widening
    // either signature. `any` is refined, never widened — that is not a parity break.
    expect(arityOf(sku, 'addSkuCurrency')).toBe(1);
    expect(arityOf(sku, 'removeSkuCurrency')).toBe(1);
  });
});

// ===========================================================================
// The three audit/remote columns that carried no case of their own
// ===========================================================================
//
// ★★★ ADDED BECAUSE A MECHANICAL METHOD INVENTORY FOUND THEM UNNAMED, and that is the whole point of
// having one. A code review reported that the traceability map "proves module-to-suite presence, not
// every public method". Deriving the inventory from source rather than curating it by hand reduced the
// real gap on this entity to exactly three names - `getRemoteID`, `getCreatedByAccountID` and
// `getModifiedByAccountID` - every one of which is a persisted column this port reads and therefore
// owes an assertion, however simple.
//
// They are grouped rather than split across three describes because they share one contract: each is a
// nullable column, each is read and never computed, and two of them are an out-of-scope `Account`
// association deliberately collapsed to its foreign key so that no account entity enters this slice.
// Gate `A24` now fails if any public method of a ported entity goes unnamed again.

describe('Sku: the audit and remote-integration columns', () => {
  it('reads remoteID, and reports its absence as undefined rather than as an empty string', () => {
    // [model/entity/Sku.cfc:L90]. The column is nullable, so `undefined` is the honest absent value -
    // coercing it to `''` would make an unset external identifier indistinguishable from a blank one.
    // Constructed directly rather than through `makeSkuFixture`, which pins these columns to fixed
    // values so that the AND-of-EXISTS fixtures stay comparable. A case about absence needs to be able
    // to OMIT a column, which the fixture deliberately does not let it do.
    expect(new Sku({ skuID: 'remote-1', remoteID: 'erp-sku-40119' }).getRemoteID()).toBe(
      'erp-sku-40119',
    );
    expect(new Sku({ skuID: 'remote-2' }).getRemoteID()).toBeUndefined();
  });

  it('★★ collapses both audit Account associations to their foreign keys, never to an entity', () => {
    // [model/entity/Sku.cfc:L94, L96]. `Account` is out of scope, so the association is preserved as an
    // opaque identifier: the schema contract stays intact and no account behaviour enters this port.
    const stamped = new Sku({
      skuID: 'stamped-1',
      createdByAccountID: 'acct-created-1',
      modifiedByAccountID: 'acct-modified-2',
    });

    expect(stamped.getCreatedByAccountID()).toBe('acct-created-1');
    expect(stamped.getModifiedByAccountID()).toBe('acct-modified-2');

    // Both are plain strings. An accessor that returned an object here would mean an out-of-scope
    // entity had been hydrated into this slice.
    expect(typeof stamped.getCreatedByAccountID()).toBe('string');
    expect(typeof stamped.getModifiedByAccountID()).toBe('string');
  });

  it('and leaves both audit keys undefined on a row that was never stamped', () => {
    const unstamped = new Sku({ skuID: 'unstamped-1' });

    expect(unstamped.getCreatedByAccountID()).toBeUndefined();
    expect(unstamped.getModifiedByAccountID()).toBeUndefined();
  });
});
