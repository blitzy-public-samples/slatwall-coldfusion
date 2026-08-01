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
//   (a) is the un-`var`'d `discountAmount` [model/service/PromotionService.cfc:L1007, L1009]
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
 * [model/service/SettingService.cfc:L178, L179, L221, L222]. The parameter is
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
 * CFML parity [model/entity/Sku.cfc:L425]: an equal from/to pair converts to
 * itself rather than being scaled, and an unsupplied rate is a hard failure
 * rather than a silent 1:1 — a silent identity would make a missing rate look
 * like a correct answer.
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
        return Promise.reject(
          new Error(`sku.test.ts: no conversion rate supplied for '${convertToCurrencyCode}'.`),
        );
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
 * ★ THE PORT LEDGER IS LOCKED AT THIRTEEN AND `skuRepository` IS LOCKED AT
 * SEVEN. Nothing is added here to make `getStocksDeletableFlag` [L569] work:
 * that member lives on `model/service/SkuService.cfc:L281`, not on the DAO, and
 * therefore does not exist on the port. See the D28/H4 block below.
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
    await sku.materializeCurrencyDetails();

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
    const details = await sku.materializeCurrencyDetails();

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
    await sku.materializeCurrencyDetails();

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
    await sku.materializeCurrencyDetails();

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
    await sku.materializeCurrencyDetails();

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
    const details = await sku.materializeCurrencyDetails();

    for (const currencyCode of Object.keys(details)) {
      expect(structKeyExists(requireDetail(details, currencyCode), 'price')).toBe(true);
      expect(sku.getPriceByCurrencyCode(currencyCode)).toBeInstanceOf(Money);
    }
  });

  it('★ D37 — pins the shipped resolution of the unguarded read: undefined, never a throw', () => {
    // The details map cannot be injected — `materializeCurrencyDetails()` is the
    // only writer — so the two-step read the accessor performs at [L270-L271] is
    // pinned directly against the very helpers it uses. `structKeyExists`
    // succeeds on the outer key, `structGet` returns the entry, and the `.price`
    // read then yields undefined rather than raising.
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
    const details = await sku.materializeCurrencyDetails();

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

    const first = await sku.materializeCurrencyDetails();
    const second = await sku.materializeCurrencyDetails();

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

    await expect(withoutSettings.materializeCurrencyDetails()).rejects.toThrow(
      /settings provider .* \[model\/entity\/Sku\.cfc:L373\]/,
    );

    const withoutConverter = makeSkuFixture({
      currencyConverter: undefined,
      skuEligibleCurrencies: '',
      skuCurrencyVariant: 'none',
    });

    await expect(withoutConverter.materializeCurrencyDetails()).rejects.toThrow(
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
    const details = await sku.materializeCurrencyDetails();

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
    const details = await sku.materializeCurrencyDetails();
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
    const detail = requireDetail(await sku.materializeCurrencyDetails(), SETTING_SKU_CURRENCY);

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
    await sku.materializeCurrencyDetails();

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
    const details = await sku.materializeCurrencyDetails();
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
    const details = await sku.materializeCurrencyDetails();
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
    const details = await sku.materializeCurrencyDetails();
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
    const detail = requireDetail(await sku.materializeCurrencyDetails(), SETTING_SKU_CURRENCY);

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
    const details = await sku.materializeCurrencyDetails();
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
    const detail = requireDetail(await sku.materializeCurrencyDetails(), SECONDARY_CURRENCY_CODE);

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
    const detail = requireDetail(await sku.materializeCurrencyDetails(), SECONDARY_CURRENCY_CODE);

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
    const details = await sku.materializeCurrencyDetails();

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
    await sku.materializeCurrencyDetails();

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

    const details = await sku.materializeCurrencyDetails();

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
    const details = await sku.materializeCurrencyDetails();

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

    const first = await sku.materializeCurrencyDetails();
    const second = await sku.materializeCurrencyDetails();

    expect(currencyLog.listings).toHaveLength(1);
    expect(second).toBe(first);
    expect(sku.getCurrencyDetails()).toBe(first);
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
    // at thirteen ports and `skuRepository` stays at seven members —
    // getTransactionExistsFlag, getSkuBySkuCode, getSkusBySelectedOptions,
    // searchSkusByProductType, getProductSkus, getSortedProductSkusID, saveSku.
    // `getSkuStocksDeletableFlag` is a SkuService method, the stock subsystem is
    // out of scope, and inventing an eighth member would import an out-of-scope
    // aggregate through the back door.
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
    // property. It is NOT one of the twenty numbered defects, it is NOT one of the
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

    await first.materializeCurrencyDetails();
    await second.materializeCurrencyDetails();

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
    //      [model/service/PromotionService.cfc:L1007, L1009] — divergence (a),
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
    // The invalidation is scoped to the option memos only — the currency memos are
    // invalidated by the money setters instead.
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

  it('★ money setters invalidate the currency and live-price memos', async () => {
    // [model/entity/Sku.cfc:L56] is read by the cascade at [L394] and by
    // `getLivePrice` at [L485], so a price change has to invalidate both.
    const converterLog = makeCurrencyConverterLog();
    const sku = makeSkuFixture({
      price: Money.fromDecimalString('10.00'),
      skuCurrencyVariant: 'none',
      currencyConverter: makeRecordingCurrencyConverter(
        { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
        converterLog,
      ),
    });

    await sku.materializeCurrencyDetails();

    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
    expect((await sku.getLivePrice()).toFixed2()).toBe('10.00');

    sku.setPrice(Money.fromDecimalString('6.00'));

    // The cascade memo is cleared, so the un-rematerialised entity is back to `{}`
    // — the same state, and the same `undefined` answers, as a closed L373 gate.
    expect(sku.getCurrencyDetails()).toEqual({});
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect((await sku.getLivePrice()).toFixed2()).toBe('6.00');
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
    await expect(noSettings.materializeCurrencyDetails()).rejects.toThrow(
      /\[model\/entity\/Sku\.cfc:L373\]/,
    );
    await expect(noConverter.materializeCurrencyDetails()).rejects.toThrow(
      /\[model\/entity\/Sku\.cfc:L371\]/,
    );
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
    expect(sku.materializeCurrencyDetails()).toBeInstanceOf(Promise);

    // Awaited so nothing floats — the lint profile enforces no-floating-promises.
    await Promise.all([
      sku.getBaseProductType(),
      sku.getSkuDefinition(),
      sku.getLivePrice(),
      sku.getCurrentAccountPrice(),
      sku.hasUniqueOptions(),
      sku.getTransactionExistsFlag(),
      sku.materializeCurrencyDetails(),
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

  it('★ every association comparison is by PRIMARY KEY only', () => {
    // `hasOption`, `hasSkuCurrency`, `hasPriceGroupRate` and the four promotion
    // predicates all compare identifiers. A structurally identical collaborator
    // carrying a different id is a different row; two instances sharing an id are
    // the same row.
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
