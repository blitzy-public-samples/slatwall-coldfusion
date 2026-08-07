// The isolated unit suite for `src/domain/entities/sku.ts`, the port of the 916-line
// `model/entity/Sku.cfc` the largest entity in the slice and the highest-consequence suite in this
// folder.
//
// The four-step currency resolution cascade [model/entity/Sku.cfc:L367-L433] one of the project's
// three must-preserve areas.
//
// JUDGMENT CALL: `src/domain/entities/productType.ts` is imported even though it is not among this
// file's nominated dependencies.

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

/**
 * The value the settings double answers for `skuCurrency`.
 */
const SETTING_SKU_CURRENCY = 'USD';

/**
 * A second eligible currency, covered by a `SwSkuCurrency` row or a conversion.
 */
const SECONDARY_CURRENCY_CODE = 'EUR';

/**
 * A third eligible currency, never covered by a row, so it always converts.
 */
const TERTIARY_CURRENCY_CODE = 'GBP';

/**
 * A currency that is never eligible, used to probe the outer-key miss.
 */
const INELIGIBLE_CURRENCY_CODE = 'JPY';

/**
 * The value the settings double answers for `skuEligibleCurrencies`.
 */
const SETTING_SKU_ELIGIBLE_CURRENCIES = `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`;

/**
 * The two URL-key settings this entity never reads; present so the double is total.
 */
const SETTING_GLOBAL_URL_KEY_PRODUCT = 'sp';
const SETTING_GLOBAL_URL_KEY_PRODUCT_TYPE = 'spt';

/**
 * The fixture's own default money columns, restated so expectations read as decimal strings rather
 * than as arithmetic (P4).
 */
const FIXTURE_PRICE = '19.99';
const FIXTURE_LIST_PRICE = '24.99';
const FIXTURE_RENEWAL_PRICE = '17.99';

/**
 * The fixture's `SwSkuCurrency` override amounts for the secondary currency.
 */
const SECONDARY_OVERRIDE_PRICE = '17.49';
const SECONDARY_OVERRIDE_LIST_PRICE = '21.99';
const SECONDARY_OVERRIDE_RENEWAL_PRICE = '15.49';
const SECONDARY_SUPERSEDED_PRICE = '8.88';

/**
 * The fixture's `SwSkuCurrency` override amount for the BASE currency.
 */
const BASE_OVERRIDE_PRICE = '18.49';

/**
 * Conversion rates handed to the currency double, never computed in a test.
 */
const SECONDARY_CONVERSION_RATE = '0.90';
const TERTIARY_CONVERSION_RATE = '0.80';

/**
 * Every business date in this file is an explicit UTC ISO-8601 instant.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';
const SALE_PRICE_EXPIRATION_UTC = '2024-12-31T23:59:59.000Z';

/**
 * The three base product types the legacy `getSkuDefinition` branches on.
 */
const BASE_TYPE_MERCHANDISE = 'merchandise';
const BASE_TYPE_CONTENT_ACCESS = 'contentAccess';
const BASE_TYPE_SUBSCRIPTION = 'subscription';

// hand-written in-line doubles and builders.
//
// Every one is a pure function declared in this file (P7 forbids a shared helper MODULE, a test
// base class, a mocks directory and a nineteenth suite; it does not forbid local factories).

/**
 * A settings-port call log, created inside the test that reads it.
 */
type SettingsCallLog = string[];

/**
 * A recording stand-in for the settings port.
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

/**
 * One recorded `convertCurrency` invocation, captured as decimal strings (P4).
 */
type ConversionCall = {
  readonly amount: string;
  readonly originalCurrencyCode: string;
  readonly convertToCurrencyCode: string;
};

/**
 * Everything a currency-port double records, so a test can count consultations.
 */
type CurrencyConverterLog = {
  readonly listings: string[];
  readonly conversions: ConversionCall[];
};

/**
 * A fresh, empty currency-port log.
 */
function makeCurrencyConverterLog(): CurrencyConverterLog {
  return { listings: [], conversions: [] };
}

/**
 * A recording stand-in for the currency-conversion port.
 *
 * CFML parity [model/entity/Sku.cfc:L371, L375]: the legacy builds a currency smart list and then
 * narrows it with `addInFilter('currencyCode', …)`.
 *
 * CFML parity [model/service/CurrencyService.cfc:L100-L101]: an unsupplied rate is a silent
 * pass-through, not a failure.
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
        // CFML parity [model/service/CurrencyService.cfc:L100-L101]: unconverted, not rejected.
        // The call is still recorded above, so a suite can prove the conversion was attempted and
        // still answered at par.
        return Promise.resolve(amount);
      }

      return Promise.resolve(amount.times(rate));
    },
  };
}

/**
 * One recorded price-group-resolver invocation.
 */
type ResolverCall = {
  readonly member: string;
  readonly skuID: string;
  readonly priceGroupID: string;
  readonly accountID: string;
};

/**
 * A recording stand-in for the price-group resolver declared by `sku.ts` itself.
 *
 * CFML parity [model/entity/Sku.cfc:L262, L266, L437]: three `getService("priceGroupService")`
 * locator calls become one injected port, and the sku always passes ITSELF.
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

/**
 * One recorded sku-repository invocation, arguments included.
 */
type SkuRepositoryCall = {
  readonly member: string;
  readonly args: readonly (string | undefined)[];
};

/**
 * A recording stand-in for the SEVEN-MEMBER sku repository port.
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

/**
 * An `SwOptionGroup` row, every constructor key written out explicitly.
 */
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
    // `model/entity/OptionGroup.cfc`, which no assertion may depend on.
    optionSortTieBreaker: () => 1,
  });
}

/**
 * An `SwOption` row bound to `optionGroup`, with the inverse side completed.
 */
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

/**
 * A `SwSkuCurrency` row. `price` may be absent [model/entity/SkuCurrency.cfc:L53] has no default.
 */
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
 * A `SwProductType` row whose `systemCode` is populated, so `getBaseProductType()`
 * [model/entity/ProductType.cfc:L110-L115] answers it without a repository round-trip: the legacy
 * guard `isNull(getSystemCode()) || getSystemCode() == ""` is false.
 */
function makeProductTypeDouble(systemCode: string): ProductType {
  return new ProductType({ productTypeID: `pt-${systemCode}`, systemCode });
}

/**
 * A sku whose product resolves the given base product type.
 */
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

/**
 * The option at `index`, or a hard failure. Same rationale as {@link requireDetail}.
 */
function requireOption(options: readonly Option[], index: number): Option {
  const option = options[index];

  if (option === undefined) {
    throw new Error(`sku.test.ts: no option at index ${String(index)}.`);
  }

  return option;
}

/**
 * The `SwSkuCurrency` row at `index`, or a hard failure. Same rationale as {@link requireDetail}.
 */
function requireSkuCurrency(skuCurrencies: readonly SkuCurrency[], index: number): SkuCurrency {
  const skuCurrency = skuCurrencies[index];

  if (skuCurrency === undefined) {
    throw new Error(`sku.test.ts: no sku currency at index ${String(index)}.`);
  }

  return skuCurrency;
}

/**
 * The option group of `option`, or a hard failure.
 */
function requireOptionGroupOf(option: Option): OptionGroup {
  const optionGroup = option.getOptionGroup();

  if (optionGroup === undefined) {
    throw new Error(`sku.test.ts: option '${option.getOptionID()}' has no option group.`);
  }

  return optionGroup;
}

/**
 * The declared parameter count of a named member, or `-1` when it is absent.
 */
function arityOf(subject: object, name: string): number {
  const member = (subject as unknown as Record<string, unknown>)[name];

  return typeof member === 'function' ? (member as (...args: never[]) => unknown).length : -1;
}

// B1 the three `undefined`-NEVER-ZERO currency accessors [model/entity/Sku.cfc:L269-L285]

describe('Sku currency accessors — undefined is never zero [model/entity/Sku.cfc:L269-L285]', () => {
  it('returns undefined from all three accessors for a currency absent from the details map', async () => {
    const sku = makeSkuFixture();
    await Sku.hydrate(sku);

    // CFML parity [model/entity/Sku.cfc:L269-L273]: no else branch and no trailing return ⇒ CFML
    // null ⇒ undefined. Returning 0 here would silently sell products for free.
    expect(sku.getPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();

    // CFML parity [model/entity/Sku.cfc:L275-L279, L281-L285]: the same absent outer key fails the
    // FIRST of the two guards on each of these.
    expect(sku.getListPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();
    expect(sku.getRenewalPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();
  });

  it('returns undefined from list and renewal when the outer key is PRESENT but the sub-key is absent', async () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(structKeyExists(details, SECONDARY_CURRENCY_CODE)).toBe(true);

    // CFML parity [model/entity/Sku.cfc:L276]: the second structKeyExists tests the "listPrice"
    // sub-key, so a present currency entry without one answers nothing rather than zero.
    expect(sku.getListPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)).toBeUndefined();

    // CFML parity [model/entity/Sku.cfc:L282]: the same double guard, on "renewalPrice".
    expect(sku.getRenewalPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)).toBeUndefined();

    // …while the sub-key that is present answers a real amount.
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toDecimalString()).toBe(
      SECONDARY_OVERRIDE_PRICE,
    );
  });

  it('returns a real Money from each accessor when its sub-key is present', async () => {
    const sku = makeSkuFixture();
    await Sku.hydrate(sku);

    // The base currency is filled by Step 1 [model/entity/Sku.cfc:L385-L397] from the sku's own
    // columns. Expectations are decimal strings, never computed floats (P4).
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toDecimalString()).toBe(FIXTURE_PRICE);
    expect(sku.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toDecimalString()).toBe(
      FIXTURE_LIST_PRICE,
    );
    expect(sku.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toDecimalString()).toBe(
      FIXTURE_RENEWAL_PRICE,
    );

    // The secondary currency is filled by Step 2 [model/entity/Sku.cfc:L399-L414] from its
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

    // CFML parity [model/entity/Sku.cfc:L270]: CFML struct keys are case-insensitive, so the
    // lookup goes through `structKeyExists` / `structGet` from src/lib/cfml/struct.ts rather than
    // a bare TypeScript property read.
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

    // A zero substitution would satisfy neither of the next two claims. The consequence is not
    // cosmetic: `Sku.price` is the amount a customer is charged, and a zero here would sell the
    // product for free.
    expect(price).not.toBeInstanceOf(Money);
    expect(price ?? 'ABSENT').toBe('ABSENT');

    // And stated in the bluntest possible terms. The widening to `unknown` is needed only because
    // the shipped return type is `Money | undefined`, which is itself the proof: `0` is not even
    // assignable to it.
    expect(price as unknown).not.toBe(0);
    expect(price as unknown).not.toBe('0');
    expect(price as unknown).not.toBe('0.00');

    // What the WRONG answer would have looked like, recorded so the difference is unmistakable.
    expect(Money.zero.toFixed2()).toBe('0.00');
  });

  it('★ D37 — every eligible currency always carries a `price`, so the single guard is never exercised', async () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L269-L273]: unlike its list/renewal siblings at L276 and
    // L282, this accessor has only the OUTER structKeyExists guard, so a present currency entry
    // lacking a "price" sub-key is unguarded.
    // Preserved deliberately; do not fix without a product decision.
    //
    // CFML parity [model/entity/Sku.cfc:L416, L425]: the case is UNREACHABLE through the real
    // cascade.
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
    // Both levels are asserted below, in that order: the helpers first, because they are what the
    // accessor's two-step read at [model/entity/Sku.cfc:L270-L271] is built from.
    //
    // JUDGMENT CALL: this asserts the shipped reality rather than a prediction.
    const priceless: Record<string, CurrencyDetail> = {
      [SETTING_SKU_CURRENCY]: { skuCurrencyID: '' },
    };

    expect(structKeyExists(priceless, SETTING_SKU_CURRENCY)).toBe(true);

    const entry = structGet(priceless, SETTING_SKU_CURRENCY);

    expect(entry).toBeDefined();
    expect(entry?.price).toBeUndefined();

    // …and the same read through the published accessor, on an entity whose memo was injected
    // rather than computed.
    const injected = new Sku({ skuID: 'injected-priceless-sku', currencyDetails: priceless });

    // The OUTER key is unambiguously present this is not the "currency absent" state and the
    // accessor still answers nothing rather than raising.
    expect(Object.keys(injected.getCurrencyDetails())).toStrictEqual([SETTING_SKU_CURRENCY]);
    expect(injected.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();

    // The other two accessors reach the same answer by a DIFFERENT route: their second
    // `structKeyExists` at [model/entity/Sku.cfc:L276-L277] and [model/entity/Sku.cfc:L282-L283]
    // short-circuits before any sub-key read happens.
    expect(injected.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(injected.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
  });
});

// B2 the four-step currency resolution cascade [model/entity/Sku.cfc:L367-L433]

describe('Sku.getCurrencyDetails — the four-step cascade [model/entity/Sku.cfc:L367-L433]', () => {
  it('★ leaves the memo empty and every accessor answering nothing when the eligibility gate is shut', async () => {
    // CFML parity [model/entity/Sku.cfc:L373]: the whole cascade body sits behind
    // `if(len(setting('skuEligibleCurrencies')))`.
    const sku = makeSkuFixture({ skuEligibleCurrencies: '', skuCurrencyVariant: 'none' });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(Object.keys(details)).toStrictEqual([]);
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)).toBeUndefined();
  });

  it('★ CORRECTION C6 — with the gate shut the memo IS still seeded but the currency port is NOT consulted', async () => {
    // CFML parity [model/entity/Sku.cfc:L368-L371 vs L373]: [model/entity/Sku.cfc:L369] (the memo
    // init) sits INSIDE the [model/entity/Sku.cfc:L368] memo guard but OUTSIDE the
    // [model/entity/Sku.cfc:L373] eligibility gate, so a closed gate still establishes the memo
    // and a second call is a no-op.
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

    // The settings port was consulted, once per key, ahead of the gate.
    expect(settingsLog).toStrictEqual(['skuCurrency', 'skuEligibleCurrencies']);

    // The currency port was not consulted at all.
    expect(currencyLog.listings).toStrictEqual([]);
    expect(currencyLog.conversions).toStrictEqual([]);
  });

  it('★ CORRECTION C6 — both collaborator presence checks run BEFORE the gate, not inside it', async () => {
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
    // CFML parity [model/entity/Sku.cfc:L381-L382]: the outer key and the `skuCurrencyID = ""`
    // seed are written before any price is considered, so the OUTER key always exists for an
    // eligible currency and only SUB-keys can ever be absent.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      conversionRates: { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    expect(Object.keys(details)).toStrictEqual([SETTING_SKU_CURRENCY, SECONDARY_CURRENCY_CODE]);

    // Neither currency has a `SwSkuCurrency` row, so [model/entity/Sku.cfc:L412] never fires and
    // the seeded empty string survives on both.
    expect(requireDetail(details, SETTING_SKU_CURRENCY).skuCurrencyID).toBe('');
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).skuCurrencyID).toBe('');
  });

  it('STEP 1 — fills the base currency from the sku\u2019s own columns, price unconditionally', async () => {
    // CFML parity [model/entity/Sku.cfc:L385-L397]: only the currency equal to
    // `setting('skuCurrency')` is touched; [model/entity/Sku.cfc:L394] writes `price` with no
    // guard, [model/entity/Sku.cfc:L386] and [model/entity/Sku.cfc:L390] guard renewal and list on
    // non-nullness, and [model/entity/Sku.cfc:L396] marks the entry unconverted.
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
    // Sub-key absence is therefore reachable only through a Step-2-only entry, which the
    // `secondaryPriceOnly` variant covers above.
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
    // A zero is a VALUE and is reported as one; absence is reported as absence. Collapsing the two
    // is exactly the mistake the null gate exists to prevent.
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
    // CFML parity [model/entity/Sku.cfc:L385]:
    // `thisCurrency.getCurrencyCode() eq this.setting('skuCurrency')` is CFML `eq`, which is
    // case-insensitive, so it goes through `cfEquals` rather than `===`.
    //
    // `converted === false` is the discriminator: had Step 1 been skipped, Step 3 would have
    // filled the entry instead and marked it converted.
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
    // CFML parity [model/entity/Sku.cfc:L399-L414]: Step 2 runs after Step 1 over the same entry,
    // so an override row replaces the sku's own column value [model/entity/Sku.cfc:L409], records
    // the row's identifier [model/entity/Sku.cfc:L412] and keeps the entry unconverted
    // [model/entity/Sku.cfc:L411].
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
    // CFML parity [model/entity/Sku.cfc:L399-L414]: the loop has no break, so the LAST matching
    // SwSkuCurrency row wins. This is the OPPOSITE of the first-match-wins dedupe at L504/L516 in
    // this same file.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'secondaryDuplicated',
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();
    const detail = requireDetail(details, SECONDARY_CURRENCY_CODE);
    expect(detail.price?.toDecimalString()).not.toBe(SECONDARY_SUPERSEDED_PRICE);
    expect(detail.price?.toDecimalString()).toBe(SECONDARY_OVERRIDE_PRICE);
    expect(detail.skuCurrencyID).toMatch(/-secondary-second$/);
  });

  it('STEP 2 — writes price while LEAVING Step 1\u2019s list and renewal prices in place', async () => {
    // CFML parity [model/entity/Sku.cfc:L401, L405]: the renewal and list writes are guarded on
    // the ROW's values being non-null, while [model/entity/Sku.cfc:L409]'s price write is not.
    //
    // LEGACY-NOTE [model/entity/Sku.cfc:L409]: CFML cannot store null in a struct key, so a null
    // row value leaves the sub-key ABSENT rather than storing null which is precisely what lets
    // [model/entity/Sku.cfc:L416]'s `structKeyExists` test decide whether Step 3 runs.
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
    // CFML parity [model/entity/Sku.cfc:L416-L428]: the guard is on the "price" sub-key ALONE, so
    // a currency with no base match and no override row is filled entirely by conversion and
    // flagged `converted = true` at [model/entity/Sku.cfc:L427].
    //
    // CFML parity [model/entity/Sku.cfc:L415]: the legacy comment introducing this step reads
    // `// Use a conversion mechinism` "mechanism" is misspelled in the source. Source warts are
    // annotated, never normalised.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      conversionRates: { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
    });
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();
    const detail = requireDetail(details, SECONDARY_CURRENCY_CODE);

    expect(detail.converted).toBe(true);

    // Expected amounts are decimal strings produced by the injected rate, never by arithmetic
    // written in this file (P4).
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
    // CFML parity [model/service/CurrencyService.cfc:L100-L101]: when either currency code is
    // missing from the rate table the conversion service returns the amount UNCONVERTED rather
    // than raising.
    //
    // The one an implementation is most tempted to "improve".
    //
    // So a par price is deliberately INDISTINGUISHABLE from a converted one here.
    const sku = makeSkuFixture({
      skuEligibleCurrencies: `${SETTING_SKU_CURRENCY},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      // The rate table is deliberately EMPTY for the secondary currency.
      conversionRates: {},
    });
    // Driven through the class's own static entry point, which is the only public way in:
    // `materializeCurrencyDetails` is PRIVATE on the shipped entity so that the async half of the
    // cascade is not published on the instance.
    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    // Both currencies are still seeded nothing was dropped.
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

    // The BASE currency is untouched by the secondary currency's missing rate, which is the half a
    // rejecting converter would have destroyed.
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toDecimalString()).toBe(FIXTURE_PRICE);
    expect(requireDetail(details, SETTING_SKU_CURRENCY).converted).toBe(false);
  });

  it('★ STEP 3 — the conversion IS attempted for the unrated currency, three times, positionally', async () => {
    // Proving the pass-through is the CONVERTER's answer and not a skipped call.
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
    // CFML parity [model/entity/Sku.cfc:L416]: the Step-3 guard tests only the "price" sub-key, so
    // a currency that already has a price never receives converted list or renewal prices even
    // when those sub-keys are missing.
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

    // Not one conversion was attempted: both eligible currencies were satisfied by Steps 1 and.
    expect(currencyLog.conversions).toStrictEqual([]);
  });

  it('★ STEP 3 — fires for an override row whose price is absent, and then OVERWRITES the row\u2019s list price', async () => {
    // CFML parity [model/entity/Sku.cfc:L411-L412 vs L416-L428]: an override row with a null price
    // still writes `converted = false` and a non-empty `skuCurrencyID` unconditionally, but leaves
    // the `price` sub-key absent so Step 3 then fires.
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
    // Three currencies, three filling paths, one call: base by Step 1, secondary by Step 2,
    // tertiary by Step.
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
    // CFML parity [model/entity/Sku.cfc:L418, L422, L425]: all three conversions read
    // `this.setting('skuCurrency')` as the SOURCE and the currency under consideration as the
    // TARGET, and they occur in that order renewal price first, then list price, then price.
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

    // One fused listing call [model/entity/Sku.cfc:L371, L375], carrying the eligibility setting.
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
    // `this.setting('skuCurrency')` and nothing else.
    const sku = makeSkuFixture({
      skuCurrency: TERTIARY_CURRENCY_CODE,
      skuEligibleCurrencies: `${TERTIARY_CURRENCY_CODE},${SECONDARY_CURRENCY_CODE}`,
      skuCurrencyVariant: 'none',
      conversionRates: { [SECONDARY_CURRENCY_CODE]: SECONDARY_CONVERSION_RATE },
    });

    expect(sku.getCurrencyCode()).toBe(TERTIARY_CURRENCY_CODE);

    const details = (await Sku.hydrate(sku)).getCurrencyDetails();

    // Step 1 now targets the tertiary currency….
    expect(requireDetail(details, TERTIARY_CURRENCY_CODE).converted).toBe(false);
    expect(requireDetail(details, TERTIARY_CURRENCY_CODE).price?.toDecimalString()).toBe(
      FIXTURE_PRICE,
    );

    // …and the currency that was the base in every other test now converts.
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).converted).toBe(true);
  });

  it('formats every money sub-key through the CFML numberFormat parity path', async () => {
    // CFML parity [model/entity/Sku.cfc:L395, L410, L426]: the legacy renders these with
    // `getFormattedValue`/`formatValue` under a currency format type.
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

    // Full precision is retained in the amount and only the PRESENTATION is rounded to two places
    // the distinction the value object exists to keep.
    expect(convertedPrice.toDecimalString()).toBe('17.991');
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).priceFormatted).toBe(
      numberFormat(convertedPrice.toDecimalString(), '0.00'),
    );
    expect(requireDetail(details, SECONDARY_CURRENCY_CODE).priceFormatted).toBe('17.99');
  });

  it('computes the details map ONCE and answers {} until it has been materialised', async () => {
    // CFML parity [model/entity/Sku.cfc:L368]: the memo guard makes a second call a no-op.
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

// B2b the hydration boundary itself `Sku.hydrate` and `Sku.resolveCurrencyCascadeContext`
//
// These two statics have no legacy counterpart and are not a reshaping of one.

describe('Sku.hydrate / Sku.resolveCurrencyCascadeContext — the hydration boundary', () => {
  it('★★ resolves the invariant cascade inputs in EXACTLY THREE collaborator calls', async () => {
    // Two settings reads [model/entity/Sku.cfc:L373, L385, L418] and one currency listing
    // [model/entity/Sku.cfc:L371, L375].
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
    // [model/entity/Sku.cfc:L373]: `if(len(setting('skuEligibleCurrencies')))`. The gate is
    // evaluated here, once, so a shut gate short-circuits [model/entity/Sku.cfc:L371]'s listing
    // for the whole batch rather than once per sku.
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
    // Context that is threaded through but then quietly re-resolved per sku would still produce
    // correct prices, so correctness alone cannot detect it. What detects it is the sku's own
    // collaborator log staying empty.
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

    // Both are fully hydrated the cascade really ran for each of them.
    expect(Object.keys(first.getCurrencyDetails()).sort()).toStrictEqual(
      [SETTING_SKU_CURRENCY, SECONDARY_CURRENCY_CODE].sort(),
    );
    expect(Object.keys(second.getCurrencyDetails()).sort()).toStrictEqual(
      [SETTING_SKU_CURRENCY, SECONDARY_CURRENCY_CODE].sort(),
    );

    // And neither sku consulted its own settings or listing port. The invariant half was resolved
    // once, up front, and injected.
    expect(ownSettingsLog).toStrictEqual([]);
    expect(ownCurrencyLog.listings).toStrictEqual([]);

    // The batch ports were consulted exactly once each, for both skus together.
    expect(batchSettingsLog).toStrictEqual(['skuCurrency', 'skuEligibleCurrencies']);
    expect(batchCurrencyLog.listings).toHaveLength(1);

    // The PER-SKU half is the exception, and it is per-sku on purpose: Step 3
    // [model/entity/Sku.cfc:L416-L428] converts that sku's own renewal price
    // [model/entity/Sku.cfc:L418], list price [model/entity/Sku.cfc:L422] and price
    // [model/entity/Sku.cfc:L425].
    expect(batchCurrencyLog.conversions).toHaveLength(6);
  });

  it('★ a supplied context makes the cascade reachable for a sku with NO collaborators of its own', async () => {
    // The two collaborator-presence checks live in the FALLBACK branch only, which is the whole
    // point of a batch context: the resolution has already happened, so this sku needs neither
    // port.
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
    // It is a boundary, not a factory.
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
    // `SkuHydrationInput.currencyDetails` is the second way the memo is established, and it runs
    // nothing.
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

    // COPIED, not adopted: the map is this instance's, so a later mutation of the caller's object
    // cannot reach inside it.
    expect(carried.getCurrencyDetails()).not.toBe(computed);
    expect(carried.getCurrencyDetails()).toStrictEqual(computed);

    // …and the injected memo satisfies the [model/entity/Sku.cfc:L368] guard, so hydration is a
    // no-op even though this sku has no collaborators that could have served one.
    await Sku.hydrate(carried);

    expect(carried.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
  });
});

// B3 divergence (c): legacy defects 17 and 18 are fixed
// [model/entity/Sku.cfc:L500-L510, L512-L522]
//
// Two of the three members of the project's only domain-side deliberate divergence live here.

describe('Sku option structs — the two authorized memo fixes [model/entity/Sku.cfc:L500-L522]', () => {
  it('★ returns a populated struct keyed by optionGroupID', () => {
    // DELIBERATE DIVERGENCE (c) [model/entity/Sku.cfc:L512-L522]: legacy
    // [model/entity/Sku.cfc:L517] writes to `variables.OptionsByGroupIDStruct` a third stray name.
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
    // CFML parity [model/entity/Sku.cfc:L504, L516]: the inner guard keeps the FIRST option per
    // key.
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
    // The legacy CODE variant raised even here, because [model/entity/Sku.cfc:L509] returned a key
    // [model/entity/Sku.cfc:L502] never created. The corrected behaviour is an empty struct, which
    // is also the one thing the legacy ID variant already got right.
    const sku = makeSkuFixture({ options: [] });

    expect(sku.getOptionsByOptionGroupIDStruct()).toStrictEqual({});
    expect(sku.getOptionsByOptionGroupCodeStruct()).toStrictEqual({});
  });

  it('★ keeps the two structs INDEPENDENT — the legacy cross-method memo poisoning is gone', () => {
    // Legacy [model/entity/Sku.cfc:L502] initialised the ID memo from inside the CODE method, so
    // calling the code variant first satisfied [model/entity/Sku.cfc:L513]'s guard and left the ID
    // variant permanently empty.
    const sku = makeSkuFixture();
    const expectedKeyCount = sku.getOptions().length;

    const codeStruct = sku.getOptionsByOptionGroupCodeStruct();
    const idStruct = sku.getOptionsByOptionGroupIDStruct();

    expect(Object.keys(codeStruct)).toHaveLength(expectedKeyCount);
    expect(Object.keys(idStruct)).toHaveLength(expectedKeyCount);
    expect(idStruct).not.toBe(codeStruct);
  });

  it('memoises both structs per INSTANCE, and both memos are request-scoped', () => {
    // CFML parity [model/entity/Sku.cfc:L501, L513]: both are memoised into `variables`.
    const sku = makeSkuFixture();

    expect(sku.getOptionsByOptionGroupIDStruct()).toBe(sku.getOptionsByOptionGroupIDStruct());
    expect(sku.getOptionsByOptionGroupCodeStruct()).toBe(sku.getOptionsByOptionGroupCodeStruct());

    const other = makeSkuFixture({ idPrefix: 'other', options: [] });

    expect(other.getOptionsByOptionGroupIDStruct()).toStrictEqual({});
    expect(Object.keys(sku.getOptionsByOptionGroupIDStruct())).not.toHaveLength(0);
  });
});

// A CFML struct has no prototype chain and no reserved keys, so an option group whose CODE, ID or
// NAME happens to read `__proto__`.

describe('Sku option-group structs — a reserved JS key is an ordinary CFML key [model/entity/Sku.cfc:L504, L516, L902]', () => {
  /**
   * Every key the JavaScript object model treats specially but CFML did not.
   */
  const RESERVED_KEYS: readonly string[] = ['__proto__', 'constructor', 'toString'];

  /**
   * A sku carrying exactly one option, whose option group is identified, coded and named by
   * `reservedKey`.
   *
   * All three are set to the same string on purpose: the three accessors under test key by three
   * DIFFERENT columns code [model/entity/Sku.cfc:L504].
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
      // The whole hazard in one assertion pair: the key is PRESENT (a plain assignment to
      // `__proto__` would have recorded nothing at all) and the record is still an ordinary object
      // whose prototype was not swapped.
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
      // [model/entity/Sku.cfc:L902] keys by the option group's NAME and stores the option's ID,
      // and it has no existence guard. Neither of those facts changes here; only the write
      // mechanism did.
      const struct = makeSkuWithReservedOptionGroupKey(reservedKey).getOptionsValueStruct();

      expect(Object.keys(struct)).toStrictEqual([reservedKey]);
      expect(Object.getPrototypeOf(struct)).toBe(Object.prototype);
      expect(structGet(struct, reservedKey)).toBe('reserved-key-option');
    },
  );

  it('★ does not leak the value onto Object.prototype, so no later object inherits it', () => {
    // The consequence a plain `struct['__proto__'] = option` would have had. Asserted on a FRESH
    // literal built after the accessors ran, which is the only way to observe global
    // contamination.
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
    // CFML parity [model/entity/Sku.cfc:L504, L516]: struct keys are case-insensitive and the
    // guard is `if (!exists)`, so the FIRST option per key wins.
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

    // One key, spelled the way the FIRST option spelled it, holding the FIRST option.
    expect(Object.keys(codeStruct)).toStrictEqual(['__proto__']);
    expect(structGet(codeStruct, '__PROTO__')?.getOptionID()).toBe('reserved-key-option-first');
    expect(Object.getPrototypeOf(codeStruct)).toBe(Object.prototype);
  });
});

// B4 H1: the third key mismatch is preserved, not fixed [model/entity/Sku.cfc:L241-L251]

describe('Sku.getOptionByOptionGroup* — H1 preserved [model/entity/Sku.cfc:L241-L251]', () => {
  it('resolves an option by optionGroupID, and answers nothing for an unknown group', () => {
    // CFML parity [model/entity/Sku.cfc:L241-L245]: this accessor is CORRECT it guards the ID
    // struct at [model/entity/Sku.cfc:L242] and reads the ID struct at
    // [model/entity/Sku.cfc:L243]. The miss path falls off the end with no return, which is CFML
    // null.
    const sku = makeSkuFixture();
    const option = requireOption(sku.getOptions(), 0);
    const optionGroupID = requireOptionGroupOf(option).getOptionGroupID();

    expect(sku.getOptionByOptionGroupID(optionGroupID)).toBe(option);
    expect(sku.getOptionByOptionGroupID('no-such-option-group')).toBeUndefined();
  });

  it('★ MISSES even for a valid, present optionGroupCode', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L247-L251]: guards the optionGroupCode struct at L248
    // but reads the optionGroupID struct with a code key at L249, so this accessor always misses.
    // Preserved deliberately; do not fix without a product decision.
    //
    // JUDGMENT CALL: this does not qualify for divergence (c).
    const sku = makeSkuFixture();
    const option = requireOption(sku.getOptions(), 0);
    const optionGroup = requireOptionGroupOf(option);
    const optionGroupCode = optionGroup.getOptionGroupCode() ?? '';

    // The code really is present, and the corrected code struct really does hold it so nothing
    // about the fixture explains the miss.
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

// B5 getOptionsIDList [model/entity/Sku.cfc:L524-L533]

describe('Sku.getOptionsIDList [model/entity/Sku.cfc:L524-L533]', () => {
  it('answers the empty string for a sku with no options', () => {
    // CFML parity [model/entity/Sku.cfc:L526]: the accumulator is seeded to `""` and the loop at
    // [model/entity/Sku.cfc:L527] never runs, so `""` is returned one of the five distinct
    // empty-collection semantics, and not interchangeable with the others (B25).
    expect(makeSkuFixture({ options: [] }).getOptionsIDList()).toBe('');
  });

  it('answers a comma list of option identifiers in options order, with NO leading delimiter', () => {
    // CFML parity [model/entity/Sku.cfc:L528]: `listAppend` with the default delimiter.
    // `src/lib/cfml/list.ts`'s `listAppend` returns the value itself when the list is empty, which
    // is exactly why no leading comma appears.
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
    // CFML parity [model/entity/Sku.cfc:L525]: the memo guard. Mutating the LIVE options array
    // directly which `getOptions()` deliberately hands back uncopied bypasses `addOption`'s
    // invalidation and is therefore the honest way to observe that a memo exists at all.
    const sku = makeSkuFixture();
    const memoised = sku.getOptionsIDList();
    const strayGroup = makeOptionGroupDouble('stray-group', 'stray', 'Stray', 9);

    sku.getOptions().push(makeOptionDouble('stray-option', 'stray-code', 'Stray', strayGroup, 9));

    expect(sku.getOptionsIDList()).toBe(memoised);
    expect(sku.getOptionsIDList()).not.toContain('stray-option');
    expect(makeSkuFixture({ idPrefix: 'other', options: [] }).getOptionsIDList()).toBe('');
  });
});

// B6 getSkuDefinition and the discarded trim() [model/entity/Sku.cfc:L574-L590]

describe('Sku.getSkuDefinition [model/entity/Sku.cfc:L574-L590]', () => {
  it('★ retains the LEADING SPACE on every segment of a merchandise definition', async () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L583]: trim() is called but its return value is
    // discarded, so the leading space introduced at L581 is never removed.
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
    // CFML parity [model/entity/Sku.cfc:L577-L578]: the contentAccess branch is literally empty,
    // so the seeded "" is returned.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_CONTENT_ACCESS);

    expect(await sku.getSkuDefinition()).toBe('');
  });

  it('answers the empty string for a base type matching NONE of the three branches', async () => {
    // CFML parity [model/entity/Sku.cfc:L576]: the seed survives when no branch matches. Nothing
    // is invented for the unmatched case.
    const sku = makeSkuWithBaseProductType('bundle');

    expect(await sku.getSkuDefinition()).toBe('');
  });

  it('compares the base product type CASE-INSENSITIVELY, as CFML `eq` does', async () => {
    // CFML parity [model/entity/Sku.cfc:L577, L579, L584]: all three comparisons are CFML `eq`, so
    // they go through `cfEquals` and an upper-cased system code still selects the merchandise
    // branch.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE.toUpperCase());
    const definition = await sku.getSkuDefinition();

    expect(definition).not.toBe('');
    expect(definition.startsWith(' ')).toBe(true);
  });

  it('★ CORRECTION C9 — REFUSES a subscription sku rather than faking a definition', async () => {
    // CFML parity [model/entity/Sku.cfc:L584-L585]: the subscription branch reads
    // `getSubscriptionTerm().getSubscriptionTermName()` and the JavaRB key
    // `rbKey('entity.subscriptionTerm')`.
    //
    // This corrects the upstream note, which expected an inert rbKey string constant.
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

// B7 the getSalePrice* family [model/entity/Sku.cfc:L539-L565]

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
    // `getProduct().getSkuSalePriceDetails( getSkuID() )`.
    //
    // This corrects the upstream note, which expected a delegation.
    const sku = makeSkuFixture({ skuID: SALE_SKU_ID, salePriceDetail: saleDetail });

    expect(sku.getSalePriceDetails()).toBe(saleDetail);
    expect(sku.getSalePriceDetails()).toBe(sku.getSalePriceDetails());
  });

  it('answers nothing when no sale-price row was projected', () => {
    // `undefined` where the legacy answered an empty struct: all three readers test for their key
    // first, so absence and an empty struct are indistinguishable to every caller.
    expect(makeSkuFixture().getSalePriceDetails()).toBeUndefined();
  });

  it('★ getSalePrice falls back to getPrice — the control that proves Product defect 20', () => {
    // CFML parity [model/entity/Sku.cfc:L546-L551]: Sku correctly falls back to getPrice().
    const withSale = makeSkuFixture({ skuID: SALE_SKU_ID, salePriceDetail: saleDetail });
    const withoutSale = makeSkuFixture();

    expect(withSale.getSalePrice().toDecimalString()).toBe(SALE_PRICE);
    expect(withoutSale.getSalePrice().toDecimalString()).toBe(FIXTURE_PRICE);
    expect(withoutSale.getSalePrice().equals(withoutSale.getPrice())).toBe(true);

    // …and it is never zero-by-accident, which is the whole difference.
    expect(withoutSale.getSalePrice().toFixed2()).not.toBe('0.00');
  });

  it('getSalePriceDiscountType answers the empty string on a miss, never undefined', () => {
    // CFML parity [model/entity/Sku.cfc:L557]: `""` is returned, not null, because callers
    // concatenate and compare this value as a string.
    expect(makeSkuFixture().getSalePriceDiscountType()).toBe('');
    expect(
      makeSkuFixture({
        skuID: SALE_SKU_ID,
        salePriceDetail: saleDetail,
      }).getSalePriceDiscountType(),
    ).toBe('percentageOff');
  });

  it('★ getSalePriceExpirationDateTime is CORRECTLY SPELLED here and answers "" on a miss', () => {
    // CFML parity [model/entity/Sku.cfc:L560-L565]: the union `Date | ''` is faithful
    // [model/entity/Sku.cfc:L562] returns a timestamp and [model/entity/Sku.cfc:L564] returns an
    // empty string, and CFML's `any` return type permitted both.
    //
    // CFML parity [model/entity/Product.cfc:L614, L618]: the product's DECLARATION at L614 is
    // spelled correctly while its CALL SITE at L618 reads `getSalePricExpirationDateTime()`
    // missing the `e` in "Price".
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
    // The reader tests both the row and the sub-key [model/entity/Sku.cfc:L561], so a projected
    // row with no expiry still answers the empty string.
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

// B8 getLivePrice, the three-way minimum [model/entity/Sku.cfc:L482-L498]

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
    // CFML parity [model/entity/Sku.cfc:L485-L495]: the array is seeded with getPrice(), the sale
    // price and the current-account price are appended, the array is sorted `"numeric" "asc"` and
    // `prices[1]` is taken.
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
    // The seed at [model/entity/Sku.cfc:L485] and the appended candidate are equal, so
    // `isLessThan` never fires and the seeded value stands.
    const sku = makeSkuFixture({
      skuID: SALE_SKU_ID,
      salePriceDetail: saleDetailAt(FIXTURE_PRICE),
      currentAccountPrice: Money.fromDecimalString(FIXTURE_PRICE),
    });

    expect((await sku.getLivePrice()).toDecimalString()).toBe(FIXTURE_PRICE);
    expect((await sku.getLivePrice()).equals(sku.getPrice())).toBe(true);
  });

  it('falls back to the base price on all three candidates when nothing undercuts it', async () => {
    // With no sale row the sale accessor answers getPrice() [model/entity/Sku.cfc:L550], and the
    // fixture resolver answers getPrice() for an account with no price groups which is the legacy
    // answer at [model/service/PriceGroupService.cfc:L271-L298].
    const sku = makeSkuFixture();

    expect((await sku.getLivePrice()).toDecimalString()).toBe(FIXTURE_PRICE);
  });

  it('★ CORRECTION — the legacy null-sort hazard is STRUCTURALLY ELIMINATED, not reproduced', async () => {
    // CFML parity [model/entity/Sku.cfc:L489, L492]: the legacy appends `getCurrentAccountPrice()`
    // and then sorts `arraySort(prices,"numeric","asc")`.
    //
    // JUDGMENT CALL: the ported resolver member returns a non-nullable `Promise<Money>`, so there
    // is no null to append and the throw is unreachable.
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

// B9 getCurrentAccountPrice and the T6 scope replacement [model/entity/Sku.cfc:L435-L440]

describe('Sku.getCurrentAccountPrice [model/entity/Sku.cfc:L435-L440]', () => {
  it('delegates through the injected resolver, always passing ITSELF as the sku', async () => {
    // CFML parity [model/entity/Sku.cfc:L437]: the legacy
    // `getService("priceGroupService").calculateSkuPriceBasedOnCurrentAccount(sku=this)` becomes
    // one constructor-injected port, and the `sku=this` argument is carried over verbatim.
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
    // the service reads the ambient request scope through `getSlatwallScope()` itself an
    // inconsistency.
    const resolverLog: ResolverCall[] = [];
    const sku = makeSkuFixture({
      currentAccountContext: { accountID: 'account-under-test' },
      priceGroupResolver: makeRecordingPriceGroupResolver(
        Money.fromDecimalString('5.00'),
        Money.fromDecimalString('3.33'),
        resolverLog,
      ),
    });

    // Zero declared parameters the legacy arity, preserved.
    expect(arityOf(sku, 'getCurrentAccountPrice')).toBe(0);

    await sku.getCurrentAccountPrice();

    expect(resolverLog[0]?.accountID).toBe('account-under-test');
  });

  it('refuses honestly when the resolver or the context was not hydrated', async () => {
    // Both refusals cite [model/entity/Sku.cfc:L437], the line that dereferences unconditionally.
    // A silent `Money.zero` here would be a free product (B1.4's failure mode by another route).
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

// B10 getPriceByPromotion: defect 16, a throwing stub [model/entity/Sku.cfc:L257-L259]

describe('Sku.getPriceByPromotion — defect 16 [model/entity/Sku.cfc:L257-L259]', () => {
  const promotionUnderTest = new Promotion({
    promotionID: 'promotion-defect-16',
    promotionName: 'Defect 16 probe',
  });

  it('★ THROWS, because the method it calls does not exist anywhere in the source', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L258]: the body calls
    // getService("promotionService").calculateSkuPriceBasedOnPromotion(), a method that does not
    // exist, so the legacy accessor throws at runtime.
    // Preserved deliberately; do not fix without a product decision.
    const sku = makeSkuFixture();

    expect(() => sku.getPriceByPromotion(promotionUnderTest)).toThrow(
      /calculateSkuPriceBasedOnPromotion, which does not exist/,
    );
  });

  it('★ reaches the refusal with a WELL-FORMED promotion, so it cannot be an argument fault', () => {
    // JUDGMENT CALL: no promotion-price port was invented to make this member work, and no 14th
    // port exists.
    const sku = makeSkuFixture();
    expect(promotionUnderTest.getPromotionID()).toBe('promotion-defect-16');
    expect(() => sku.getPriceByPromotion(promotionUnderTest)).toThrow(
      /promotion 'promotion-defect-16'/,
    );
    expect(() => sku.getPriceByPromotion(promotionUnderTest)).toThrow(
      /\[model\/entity\/Sku\.cfc:L258\]/,
    );
  });

  it('is declared as never-returning, so no caller can silently consume a price from it', () => {
    // The `never` return type is how the compiler prevents this defect from being absorbed into
    // arithmetic. A caller cannot bind its result to a Money.
    const sku = makeSkuFixture();

    expect(() => sku.getPriceByPromotion(promotionUnderTest)).toThrow(Error);
  });
});

// B11 the price-group accessors, the correct control [model/entity/Sku.cfc:L261-L267]

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
    // CFML parity [model/entity/Sku.cfc:L262]:
    // `calculateSkuPriceBasedOnPriceGroup(sku=this, priceGroup=...)` the locator becomes the port
    // and `sku=this` is carried over verbatim.
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
    // CFML parity [model/entity/Sku.cfc:L265-L267]: this call names the sku argument correctly.
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
    // `PriceGroupRate.hasSku` compares by PRIMARY KEY, never by identity, so a structurally
    // identical sku with a different id does not match.
    const sku = makeSkuFixture();
    const foreign = makeSkuFixture({ idPrefix: 'foreign' });
    const priceGroup = makePriceGroupWithRates([
      new PriceGroupRate({ priceGroupRateID: 'rate-foreign', skus: [foreign] }),
    ]);

    expect(sku.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toBeUndefined();
  });

  it('★ keeps the LAST matching rate, because the legacy service loop has no break', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L146-L150]: the rate loop has no `break`,
    // so a later matching rate supersedes an earlier one.
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

// B12 getDefaultFlag is unguarded [model/entity/Sku.cfc:L442-L447]

describe('Sku.getDefaultFlag [model/entity/Sku.cfc:L442-L447]', () => {
  it('answers true when the product default sku matches, false when it does not', () => {
    // CFML parity [model/entity/Sku.cfc:L443, L446]: `true` on a match and an explicit `false`
    // otherwise. The comparison is CFML `==` on strings, which is CASE-INSENSITIVE, so it goes
    // through `cfEquals` rather than `===`.
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

    // The deprecated inverse [model/entity/Sku.cfc:L907-L910] is exactly `!getDefaultFlag()`.
    expect(isDefault.isNotDefaultSku()).toBe(false);
    expect(isNotDefault.isNotDefaultSku()).toBe(true);
  });

  it('★ THROWS when the product is absent, and again when the product has no default sku', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L442-L447]: the getProduct().getDefaultSku().getSkuID()
    // chain is unguarded, so a sku with no product or a product with no default sku throws instead
    // of returning false.
    // Preserved deliberately; do not fix without a product decision.
    const noProduct = makeSkuFixture({ product: undefined });
    const productWithoutDefault = makeSkuFixture();

    expect(() => noProduct.getDefaultFlag()).toThrow(/requires the owning product/);
    expect(() => noProduct.getDefaultFlag()).toThrow(/\[model\/entity\/Sku\.cfc:L443\]/);
    expect(() => productWithoutDefault.getDefaultFlag()).toThrow(
      /requires the product's default sku/,
    );
  });

  it('★ compares by PRIMARY KEY only — never object identity, never deep equality', () => {
    // Two distinct instances carrying the same `skuID` are the same row. The legacy compares
    // `getSkuID()` values, so identity is irrelevant, and a case-different id still matches
    // because CFML `==` folds case.
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

// B13 getStocksDeletableFlag: D28 / H4, preserved as failing [model/entity/Sku.cfc:L567-L572]

describe('Sku.getStocksDeletableFlag — D28/H4 [model/entity/Sku.cfc:L567-L572]', () => {
  it('★ REFUSES, because the member it needs is absent from the seven-member port', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L567-L572]: the L569 call reaches
    // skuService.getSkuStocksDeletableFlag [model/service/SkuService.cfc:L281], which is absent
    // from the skuRepository port surface, so the ported accessor cannot be satisfied.
    // Preserved deliberately; do not fix without a product decision.
    const sku = makeSkuFixture();

    expect(() => sku.getStocksDeletableFlag()).toThrow(
      /getStocksDeletableFlag cannot be evaluated/,
    );
    expect(() => sku.getStocksDeletableFlag()).toThrow(/\[model\/entity\/Sku\.cfc:L569\]/);
  });

  it('★ names the reason precisely: the member lives on the SERVICE, not the DAO', () => {
    // JUDGMENT CALL: no port member was added to make this pass.
    //
    // Revision the port carried a `saveSkus` collection form and this comment argued that the
    // eighth member imported nothing, taking only `Sku` entities this slice already models.
    const sku = makeSkuFixture();

    expect(() => sku.getStocksDeletableFlag()).toThrow(/getSkuStocksDeletableFlag/);
    expect(() => sku.getStocksDeletableFlag()).toThrow(/seven-member SkuRepository port/);

    // A hydrated repository changes nothing the gap is in the CONTRACT, not the wiring, which is
    // exactly why a refusal rather than a stub is honest.
    const repositoryLog: SkuRepositoryCall[] = [];
    const wired = makeSkuFixture({
      skuRepository: makeRecordingSkuRepository([], true, repositoryLog),
    });

    expect(() => wired.getStocksDeletableFlag()).toThrow(/cannot be evaluated/);
    expect(repositoryLog).toEqual([]);
  });

  it('is declared as never-returning, so the delete gate cannot silently read `true`', () => {
    // `model/validation/Sku.json` gates deletion on `transactionExistsFlag` being false see B19
    // and a fabricated `true` here would open a delete path the legacy never opened.
    const sku = makeSkuFixture();

    expect(() => sku.getStocksDeletableFlag()).toThrow(Error);
  });
});

// B14 getTransactionExistsFlag: async, and a discarded argument [model/entity/Sku.cfc:L592-L596]

describe('Sku.getTransactionExistsFlag [model/entity/Sku.cfc:L592-L596]', () => {
  it('★ is ASYNCHRONOUS and resolves the port value', async () => {
    // CFML parity [model/entity/Sku.cfc:L594]: the body reaches the DAO, so per the async boundary
    // rule the ported member returns a promise. `await` is used throughout; the lint profile
    // enforces no-floating-promises, await-thenable and require-await.
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
    // SkuService.getTransactionExistsFlag() [model/service/SkuService.cfc:L285], which declares no
    // parameters, so CFML silently discards the argument and the result is global rather than
    // per-sku.
    // Preserved deliberately; do not fix without a product decision.
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

// B15 hasUniqueOptions: async, and the no-options spurious failure
// [model/entity/Sku.cfc:L756-L769]

describe('Sku.hasUniqueOptions [model/entity/Sku.cfc:L756-L769]', () => {
  it('★ is ASYNCHRONOUS, unlike its sibling validator', async () => {
    // CFML parity [model/entity/Sku.cfc:L763]: this method reaches
    // product.getSkusBySelectedOptions, which reaches the DAO, so per the async boundary rule it
    // becomes async in the target. Its sibling hasOneOptionPerOptionGroup does not.
    const repositoryLog: SkuRepositoryCall[] = [];
    const sku = makeSkuWithSelectionResult([], repositoryLog);

    const pending = sku.hasUniqueOptions();

    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toBe(true);
  });

  it('answers true for an EMPTY result set [model/entity/Sku.cfc:L764]', async () => {
    // `!arrayLen(skus)` is the first limb of the compound condition: no sku carries this option
    // combination, so it is unique by definition.
    const repositoryLog: SkuRepositoryCall[] = [];

    expect(await makeSkuWithSelectionResult([], repositoryLog).hasUniqueOptions()).toBe(true);
  });

  it('answers true for exactly ONE result that is THIS sku, compared by primary key', async () => {
    // The second limb: `skus[1].getSkuID() == getSkuID()`.
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
    // The `arrayLen(skus) == 1` guard is inside the second limb, so a self match buried in a
    // longer result set does not rescue the sku.
    const repositoryLog: SkuRepositoryCall[] = [];
    const selfRow = makeSkuFixture({ idPrefix: 'selfrow', skuID: 'skfx-sku' });
    const rival = makeSkuFixture({ idPrefix: 'rival', skuID: 'rival-sku' });
    const sku = makeSkuWithSelectionResult([selfRow, rival], repositoryLog);

    expect(await sku.hasUniqueOptions()).toBe(false);
  });

  it('★ THE NO-OPTIONS SPURIOUS FAILURE — an option-less sku fails its own save validation', async () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L756-L769]: with no options the built list is empty, the
    // option filter degenerates, and every sibling sku comes back, so a legitimately option-less
    // sku fails the hasUniqueOptions save validation.
    // Preserved deliberately; do not fix without a product decision.
    const repositoryLog: SkuRepositoryCall[] = [];
    const siblingA = makeSkuFixture({ idPrefix: 'sibling-a', skuID: 'sibling-a-sku' });
    const siblingB = makeSkuFixture({ idPrefix: 'sibling-b', skuID: 'sibling-b-sku' });
    const optionLess = makeSkuWithSelectionResult([siblingA, siblingB], repositoryLog, []);

    expect(optionLess.getOptions()).toHaveLength(0);
    expect(optionLess.getOptionsIDList()).toBe('');
    expect(await optionLess.hasUniqueOptions()).toBe(false);

    // The empty list is what was handed to the query the mechanism, recorded.
    expect(repositoryLog[0]?.args[0]).toBe('');
  });

  it('★ builds the option list with NO leading delimiter [model/entity/Sku.cfc:L757-L761]', async () => {
    // `listAppend` on an empty list returns the value itself, so the list handed to the query
    // begins with an option id and not with a comma.
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

// B16 hasOneOptionPerOptionGroup: sync, and case-sensitive [model/entity/Sku.cfc:L771-L784]

describe('Sku.hasOneOptionPerOptionGroup [model/entity/Sku.cfc:L771-L784]', () => {
  it('★ is SYNCHRONOUS, in deliberate contrast with hasUniqueOptions', () => {
    // CFML parity: a method is async IFF its legacy body reaches the DAO/ORM.
    const result = makeSkuFixture().hasOneOptionPerOptionGroup();

    expect(typeof result).toBe('boolean');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('answers true for zero options and true for one option per group', () => {
    // Zero options: the loop never runs and [model/entity/Sku.cfc:L783] returns true.
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
    // JUDGMENT CALL: `listFind` is not among the five exports of `src/lib/cfml/list.ts` which
    // exports listLen, listGetAt, listAppend, listToArray and listFindNoCase.
    const lowerGroup = makeOptionGroupDouble('casegroup', 'case', 'Case lower', 1);
    const upperGroup = makeOptionGroupDouble('CASEGROUP', 'CASE', 'Case upper', 2);
    const sku = makeSkuFixture({
      options: [
        makeOptionDouble('case-option-lower', 'case-lower', 'Lower', lowerGroup, 1),
        makeOptionDouble('case-option-upper', 'case-upper', 'Upper', upperGroup, 2),
      ],
    });

    expect(sku.hasOneOptionPerOptionGroup()).toBe(true);

    // …and the case-INSENSITIVE helper would have answered the opposite, which is precisely the
    // substitution that must never be made.
    expect(listFindNoCase('casegroup', 'CASEGROUP')).toBe(1);
  });

  it('★ listFindNoCase is a 1-BASED INDEX, never a boolean — asserted explicitly', () => {
    // `if (listFindNoCase(...))` is FORBIDDEN. The helper answers a 1-based index or 0, so the
    // only safe test is an explicit numeric comparison.
    const groupList = 'alpha,beta,gamma';

    expect(listFindNoCase(groupList, 'ALPHA')).toBe(1);
    expect(listFindNoCase(groupList, 'gamma')).toBe(3);
    expect(listFindNoCase(groupList, 'delta')).toBe(0);
    expect(listFindNoCase(groupList, 'delta') !== 0).toBe(false);
    expect(listFindNoCase(groupList, 'beta') !== 0).toBe(true);
  });

  it('★ both validators are DECLARATIVELY INVOKED and both are reachable on the shipped surface', async () => {
    // `model/validation/Sku.json`'s `options` entry names both `hasUniqueOptions` and
    // `hasOneOptionPerOptionGroup` on the `save` context.
    const repositoryLog: SkuRepositoryCall[] = [];
    const sku = makeSkuWithSelectionResult([], repositoryLog);

    // Both are declared, both take no arguments, and more importantly than either both are
    // actually INVOCABLE, which a `typeof` probe alone would not prove.
    expect(arityOf(sku, 'hasUniqueOptions')).toBe(0);
    expect(arityOf(sku, 'hasOneOptionPerOptionGroup')).toBe(0);
    expect(sku.hasOneOptionPerOptionGroup()).toBe(true);
    expect(await sku.hasUniqueOptions()).toBe(true);
  });

  it('refuses honestly when an option carries no option group, citing L776', () => {
    // The legacy chains `getOptions()[i].getOptionGroup().getOptionGroupID()` with no null check
    // and raises in the same situation.
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

// B17 getOptionNameByOptionGroupID: the explicit onMissingMethod replacement
// [model/entity/Sku.cfc:L857-L873]

describe('Sku.getOptionNameByOptionGroupID [model/entity/Sku.cfc:L857-L873]', () => {
  it('answers the option name for a known option group id', () => {
    // CFML parity [model/entity/Sku.cfc:L861-L869]: the legacy override tested
    // `left(missingMethodName,3) == "get"`, sliced the remainder with `right(name, len(name)-3)`,
    // and compared it against each option's `getOptionGroupID()`.
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
    // The legacy returns from inside the loop, so the first match wins the same direction as the
    // two option structs at [model/entity/Sku.cfc:L504]/[model/entity/Sku.cfc:L516] and the
    // OPPOSITE of the currency cascade's Step 2 at [model/entity/Sku.cfc:L399-L414].
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
    // CFML parity [model/entity/Sku.cfc:L857-L873]: the onMissingMethod override becomes one
    // explicit, typed method. There is no dynamic dispatch in the target, so the legacy super
    // fall-through at L872 is documented rather than reproduced.
    //
    // JUDGMENT CALL: no Proxy, index signature, tokenizer, `evaluate()`, `eval`, `new Function` or
    // `vm` was built to emulate CFML dispatch.
    const sku = makeSkuFixture();

    expect(sku.getOptionNameByOptionGroupID('no-such-group')).toBeUndefined();
    expect(
      makeSkuFixture({ options: [] }).getOptionNameByOptionGroupID('anything'),
    ).toBeUndefined();
  });

  it('records the legacy SHADOWING HAZARD without reproducing it', () => {
    // CFML parity [model/entity/Sku.cfc:L857-L861]: the legacy hazard was that any unknown
    // `getXXX()` reached this override.
    //
    // In the target the accessor takes the group id as an ARGUMENT, so no collision with a
    // property name is possible and the hazard is structurally absent.
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

// B18 the four inherited-base behaviours, documented rather than fabricated.

describe('Sku inherited-base behaviours — documented, not fabricated', () => {
  /**
   * Reads a member by name without weakening the type system.
   *
   * `as unknown as Record<string, unknown>` is the strict-mode way to probe for a member that the
   * shipped type deliberately does not declare.
   * `@ts-ignore`, and no postfix `!` (P1).
   */
  const memberOf = (subject: object, name: string): unknown =>
    (subject as unknown as Record<string, unknown>)[name];

  it('★ THE UNKNOWN-GETTER SPLIT — 4 silent / 14 throw, and NEITHER survives here', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L559-L561 and L565]: `Sku.cfc:L70` declares
    // `attributeValues type="array"`, which made Sku one of exactly four in-scope entities with
    // `Product.cfc:L75`, `ProductType.cfc:L67` and `Brand.cfc:L60` whose unknown `getX()` routed
    // SILENTLY to `getAttributeValue('X')` and answered `''` at [model/entity/Sku.cfc:L559-L561].
    const sku = makeSkuFixture();

    expect(memberOf(sku, 'getAttributeValue')).toBeUndefined();
    expect(memberOf(sku, 'getAttributeValues')).toBeUndefined();
    expect(memberOf(sku, 'onMissingMethod')).toBeUndefined();

    // What does exist is the one explicit, typed replacement for the override asserted in full in
    // B17.
    expect(typeof sku.getOptionNameByOptionGroupID).toBe('function');
  });

  it('★ THE PARTIAL CACHE INVALIDATION — the legacy contract recorded, the members absent', () => {
    // CFML parity [model/entity/HibachiEntity.cfc:L246-L252]: `clearAttributeCache()` cleared only
    // `attributeValuesByAttributeIDStruct` and `attributeValuesByAttributeCodeStruct`, leaving
    // `attributeValuesForEntity` and `assignedAttributeSetSmartList` stale.
    const sku = makeSkuFixture();

    expect(memberOf(sku, 'clearAttributeCache')).toBeUndefined();
    expect(memberOf(sku, 'getAssignedAttributeSetSmartList')).toBeUndefined();
    expect(memberOf(sku, 'getAssignedOrderItemAttributeSetSmartList')).toBeUndefined();
  });

  it('★ getNewFlag, getPrintTemplates and getEmailTemplates are NOT ported — only isNew() is', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L571-L576, L578-L580, L582-L584]: the base
    // supplied `getNewFlag()` alongside `getPrintTemplates()` and `getEmailTemplates()`, both of
    // which answered `[]`.
    const persisted = makeSkuFixture();
    const unsaved = makeSkuFixture({ idPrefix: 'unsaved', isNew: true });

    expect(persisted.isNew()).toBe(false);
    expect(unsaved.isNew()).toBe(true);

    expect(memberOf(persisted, 'getNewFlag')).toBeUndefined();
    expect(memberOf(persisted, 'getPrintTemplates')).toBeUndefined();
    expect(memberOf(persisted, 'getEmailTemplates')).toBeUndefined();
  });

  it('★ THE ORM EVENT HOOKS BANNER AT [L878-L880] IS LITERALLY EMPTY — so nothing exists here', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L598-L619]: the base `preInsert()` threw when
    // `!isPersistable()` and stamped created/modified timestamps from `now()`.
    //
    // Timestamp maintenance moves to the repository tier, where the four audit columns are
    // hydrated.
    const sku = makeSkuFixture();

    expect(memberOf(sku, 'preInsert')).toBeUndefined();
    expect(memberOf(sku, 'preUpdate')).toBeUndefined();
    expect(memberOf(sku, 'isPersistable')).toBeUndefined();

    // Every business date on this entity is an explicit UTC instant, supplied by hydration rather
    // than read from a clock.
    expect(sku.getCreatedDateTime()?.toISOString()).toBe(CREATED_DATE_TIME_UTC);
    expect(sku.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_DATE_TIME_UTC);
  });

  it('records the DEAD RETRY at [model/entity/HibachiEntity.cfc:L180-L183] as unexercised', () => {
    // CFML parity [model/entity/HibachiEntity.cfc:L180-L183]:
    // [model/entity/HibachiEntity.cfc:L182] re-calls the enclosing method with IDENTICAL
    // arguments, so the "retry" can only ever repeat the same failure a no-op dressed as
    // resilience.
    const sku = makeSkuFixture();

    expect(memberOf(sku, 'getPropertyMetaData')).toBeUndefined();
  });

  it('explains the absent SlatwallEntityTestBase concepts instead of fabricating them', () => {
    // CFML parity [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67]: the legacy base
    // contributed four cases to whichever entity test mixed it in.
    //
    // Of the base's concepts, the shipped surface exposes exactly one analogue:
    // `getSimpleRepresentationPropertyName()`.
    const sku = makeSkuFixture();

    expect(sku.getSimpleRepresentationPropertyName()).toBe('skuCode');
    expect(memberOf(sku, 'getPrimaryIDPropertyName')).toBeUndefined();
    expect(memberOf(sku, 'getEntityName')).toBeUndefined();
    expect(memberOf(sku, 'getSimpleRepresentation')).toBeUndefined();
  });
});

// B19 the declarative validation contract `model/validation/Sku.json`
//
// Each of the eight rules is therefore recorded here as the legacy contract, and exercised to
// exactly the extent the DOMAIN surface can honour it.

describe('Sku declarative validation contract [model/validation/Sku.json]', () => {
  it('exposes every member the eight rules read, so none of them can fail silently', () => {
    // The file is 15 lines with EXACTLY eight property entries: defaultFlag delete eq false
    // listPrice save numeric.
    const theDefault = makeSkuFixture({ idPrefix: 'thedefault' });
    const product = makeProductFixture({
      productID: 'validation-product',
      skus: [],
      defaultSku: theDefault,
    });
    const sku = makeSkuFixture({ skuID: theDefault.getSkuID(), product });
    expect(typeof sku.getDefaultFlag).toBe('function');
    expect(typeof sku.getTransactionExistsFlag).toBe('function');
    // save-context money columns.
    expect(typeof sku.getPrice).toBe('function');
    expect(typeof sku.getListPrice).toBe('function');
    expect(typeof sku.getRenewalPrice).toBe('function');
    expect(typeof sku.getSkuCode).toBe('function');
    // save-context collection validators.
    expect(typeof sku.hasUniqueOptions).toBe('function');
    expect(typeof sku.hasOneOptionPerOptionGroup).toBe('function');
  });

  it('★ price is NON-OPTIONAL Money because [model/entity/Sku.cfc:L55-L57] all declare default="0"', () => {
    // CFML parity [model/entity/Sku.cfc:L55, L56, L57]: `listPrice`, `price` and `renewalPrice`
    // are each `ormtype="big_decimal" hb_formatType="currency"` `AND` each carries `default="0"`,
    // so all three are NON-optional `Money` on the shipped entity.
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
    // CFML parity `model/validation/Sku.json`: skuCode is required+unique with no pattern, unlike
    // productCode, optionCode and optionGroupCode which share ^[a-zA-Z0-9-_.|:~^]+$. Do not add a
    // pattern the legacy schema lacks.
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
    // CFML parity [model/validation/Sku.json + model/entity/Sku.cfc:L87]: the physicalCounts
    // delete gate is ORPHANED Sku declares "physicals" (SwPhysicalSku), and physicalCounts exists
    // as a property only on model/entity/Physical.cfc:L59.
    const sku = makeSkuFixture();

    // What Sku actually declares the INVERSE many-to-many over `SwPhysicalSku`, collapsed to
    // opaque identifiers because `Physical` is out of scope.
    expect(Array.isArray(sku.getPhysicalIDs())).toBe(true);
    expect(sku.getPhysicalIDs()).toEqual([]);

    // What the schema names, and what does not exist.
    expect((sku as unknown as Record<string, unknown>)['getPhysicalCounts']).toBeUndefined();
  });

  it('★ DOES NOT COMPLETE THE LEGACY GAPS — no activeFlag, skuCurrencies, stocks or orderItems rule', () => {
    // `model/validation/Sku.json` has no activeFlag rule, no skuCurrencies gate, no stocks gate
    // and no orderItems gate.
    //
    // The six schemas verified ABSENT project-wide must REMAIN absent: Category.json,
    // PromotionQualifier.json, PromotionApplied.json, PromotionAccount.json.
    const sku = makeSkuFixture();

    // ActiveFlag defaults to "1" [model/entity/Sku.cfc:L53] and is freely settable in either
    // direction no rule constrains it.
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

// B20 the routed legacy case [meta/tests/unit/IssuesTest.cfc:L126-L138]
//
// The harness is dropped, the assertions are carried (C1).
//
// `meta/tests/unit/IssuesTest.cfc:L55` declares its local without `var`, exactly as
// `meta/tests/unit/Helper.cfc:L53` does.

describe('issue_1348 — routed legacy case [meta/tests/unit/IssuesTest.cfc:L126-L138]', () => {
  const NEGATIVE_PRICE = '-20';

  it('issue_1348 accepts a negative price on the entity, so the violation can only be the FLOOR', () => {
    // The domain layer owns presence; the service tier owns error-key assembly (see the scope
    // statement on B19).
    const product = makeProductFixture({ productID: 'issue-1348-product', skus: [] });
    const sku = makeSkuFixture({
      skuID: 'issue-1348-sku',
      skuCode: 'issue_1348',
      price: Money.fromDecimalString(NEGATIVE_PRICE),
      product,
    });

    // Legacy assertion 2, decoded: the value is PRESENT, so no `*_missing` key can be produced for
    // it. Presence is a domain property and is asserted here.
    expect(sku.getPrice()).toBeInstanceOf(Money);
    expect(sku.getPrice().toDecimalString()).toBe(NEGATIVE_PRICE);
    expect(sku.getPrice().isLessThan(Money.zero)).toBe(true);
    expect(sku.getPrice().toFixed2()).toBe('-20.00');
  });

  it('issue_1348 keeps the legacy fixture wiring — setProduct, setSkuCode, setPrice', () => {
    // The three legacy mutations are carried over by NAME, through the ported setters, so the case
    // still reads as the original issue did.
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
    // Without this half the previous assertion could pass for the wrong reason. Zero is on the
    // floor rather than below it `minValue: 0` is inclusive.
    const atFloor = makeSkuFixture({ skuID: 'issue-1348-zero', price: Money.zero });
    const aboveFloor = makeSkuFixture({ skuID: 'issue-1348-above' });

    expect(atFloor.getPrice().isLessThan(Money.zero)).toBe(false);
    expect(aboveFloor.getPrice().isLessThan(Money.zero)).toBe(false);
    expect(aboveFloor.getPrice().toDecimalString()).toBe(FIXTURE_PRICE);
  });
});

// This suite is one of the two assigned owners of the cross-instance memo proof.

describe('Sku memo isolation — every memo is request-scoped (A2)', () => {
  it('★★ a second instance does NOT observe the first instance currencyDetails memo', async () => {
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

    // `toFixed2()` rather than `toDecimalString()`: the latter is full precision with no scale, so
    // `Money.fromDecimalString('10.00').toDecimalString()` is `'10'`.
    expect(first.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
    expect(second.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('40.00');

    // Each instance consulted its own converter exactly once.
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
    // Four more of the nine memos the shipped surface exposes, each proven on two independent
    // instances with different inputs.
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
    expect(first.getCurrencyCode()).toBe(SETTING_SKU_CURRENCY);
    expect(second.getCurrencyCode()).toBe(TERTIARY_CURRENCY_CODE);
    expect(first.getCurrencyCode()).toBe(SETTING_SKU_CURRENCY);
    expect(firstSettingsLog).toEqual(['skuCurrency']);
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
    const merchandise = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);
    const contentAccess = makeSkuWithBaseProductType(BASE_TYPE_CONTENT_ACCESS);

    expect(await merchandise.getSkuDefinition()).not.toBe('');
    expect(await contentAccess.getSkuDefinition()).toBe('');
    expect(await merchandise.getSkuDefinition()).not.toBe('');
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
    // No shared subject, no `beforeEach` mutation of a module-scoped variable, and no spy to
    // restore every double in this file is hand-written and call-local.
    const a = makeSkuFixture();
    const b = makeSkuFixture();

    expect(a).not.toBe(b);
    expect(a.getOptions()).not.toBe(b.getOptions());
    expect(a.getSkuCurrencies()).not.toBe(b.getSkuCurrencies());

    a.setSkuCode('MUTATED-A');

    expect(b.getSkuCode()).toBe('TESTSKUXXX');
  });

  it('records the four legacy caches that must NEVER become module state', () => {
    // `SkuDAO.variables.nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220] and its clear
    // method `clearNextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L222-L226] has an INVERTED
    // condition.
    const sku = makeSkuFixture();

    expect(
      (sku as unknown as Record<string, unknown>)['clearNextOptionGroupSortOrder'],
    ).toBeUndefined();
    expect((sku as unknown as Record<string, unknown>)['nextOptionGroupSortOrder']).toBeUndefined();
  });

  it('★ option-collection mutations through the ported setters INVALIDATE the derived memos', () => {
    // CFML parity [model/entity/Sku.cfc:L500-L533]: the legacy component never invalidated these
    // memos, because a CFML request was short-lived and the entity died with it.
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
    // So a sku whose price is changed after the cascade has run keeps reporting the OLD
    // per-currency prices in the legacy, and here.
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

    // The cascade memo survives, by REFERENCE. Not merely equal the very same object, which is the
    // strongest available statement that nothing reset it.
    expect(sku.getCurrencyDetails()).toBe(memoBefore);

    // …and it still reports the PRE-CHANGE price, which is exactly the legacy's observable
    // behaviour. A `6.00` here would mean the memo had been rebuilt; an `undefined` here would
    // mean it had been cleared.
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');

    // The column itself did change the setter is not a no-op which is what makes the stale memo a
    // genuine observation rather than an artefact.
    expect(sku.getPrice().toFixed2()).toBe('6.00');

    // No collaborator ran on the setter path, so nothing re-entered the cascade.
    expect(converterLog.listings).toHaveLength(1);

    // The live-price memo, by contrast, was cleared and rebuilt on demand.
    expect((await sku.getLivePrice()).toFixed2()).toBe('6.00');

    // And a further `Sku.hydrate` is still a no-op: the [model/entity/Sku.cfc:L368] guard sees the
    // memo and returns, so the stale entry is not quietly repaired behind the caller.
    await Sku.hydrate(sku);

    expect(sku.getCurrencyDetails()).toBe(memoBefore);
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)?.toFixed2()).toBe('10.00');
  });
});

// B22 ports, no locators, no ambient scope, no clock.

describe('Sku collaborators — explicit ports only', () => {
  it('★ is built ENTIRELY by hand from explicit constructor ports, with no framework anywhere', () => {
    // No DI container, no service locator, no ambient request scope, no bootstrap, no database, no
    // network, no filesystem, no `.env`, no credentials and no superuser elevation.
    const bare = new Sku({ skuID: 'hand-built-sku' });

    expect(bare.getSkuID()).toBe('hand-built-sku');
    expect(bare.getOptions()).toEqual([]);
    expect(bare.getSkuCurrencies()).toEqual([]);
    expect(bare.getCurrencyDetails()).toEqual({});
    expect(bare.isNew()).toBe(false);
  });

  it('★ NO SERVICE LOCATOR CALL SURVIVES — all 19 of this entity legacy sites are ports now', () => {
    // The 45-VERSUS-7 reconciliation: the AAP's service-locator table has seven rows because it
    // counts distinct port mappings, while 45 counts call sites.
    const sku = makeSkuFixture();
    const probe = sku as unknown as Record<string, unknown>;

    expect(probe['getService']).toBeUndefined();
    expect(probe['getHibachiScope']).toBeUndefined();
    expect(probe['getSlatwallScope']).toBeUndefined();
    expect(probe['getBeanFactory']).toBeUndefined();
  });

  it('★ NO CLOCK is injected into Sku — every date in this suite is an explicit UTC literal', () => {
    // Only `promotionPeriod.ts` and `promotionCode.ts` take `now: () => Date`, and in both cases
    // it is a plain constructor parameter explicitly not a port, not `config.ts`, and not a
    // fourteenth port.
    //
    // No bare `new Date()` and no `Date.now()` appears anywhere in this file for a business date.
    const sku = makeSkuFixture();
    const probe = sku as unknown as Record<string, unknown>;

    expect(probe['now']).toBeUndefined();
    expect(probe['clock']).toBeUndefined();
    expect(process.env['TZ']).toBe('UTC');
    expect(new Date(CREATED_DATE_TIME_UTC).toISOString()).toBe(CREATED_DATE_TIME_UTC);
    expect(sku.getCreatedDateTime()?.toISOString()).toBe(CREATED_DATE_TIME_UTC);
  });

  it('★ THE PORT LEDGER IS LOCKED AT THIRTEEN, and Sku consumes exactly four of them', async () => {
    // The thirteen: productRepository, skuRepository, optionRepository, productTypeRepository,
    // promotionRepository, priceGroupRepository, settingsProvider, currencyConverter,
    // addressZoneEvaluator, urlTitleGenerator.
    //
    // Sku consumes four collaborators: settingsProvider, currencyConverter, skuRepository and the
    // sku-shaped price-group resolver.
    const noSettings = makeSkuFixture({ settingsProvider: undefined });
    const noConverter = makeSkuFixture({ currencyConverter: undefined });

    expect(() => noSettings.getCurrencyCode()).toThrow(
      /settings provider collaborator was not injected/,
    );
    expect(() => noSettings.getCurrencyCode()).toThrow(/\[model\/entity\/Sku\.cfc:L362\]/);

    // The cascade resolves both collaborators before the L373 gate, so either absence is reported
    // at its own locator.
    await expect(Sku.hydrate(noSettings)).rejects.toThrow(/\[model\/entity\/Sku\.cfc:L373\]/);
    await expect(Sku.hydrate(noConverter)).rejects.toThrow(/\[model\/entity\/Sku\.cfc:L371\]/);
  });

  it('prefers hand-written in-memory doubles over module mocking', () => {
    // `vi` is built in and permitted, and no mocking library may be added (P3).
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

// B23 the async boundary audit.

describe('Sku async boundary audit', () => {
  it('★ the SYNCHRONOUS members answer values, not promises', () => {
    // CFML parity: a method is async IFF its legacy body reaches the DAO/ORM.
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
    // `ProductType.getBaseProductType()` [model/entity/ProductType.cfc:L110-L115] walks
    // `productTypeIDPath` through the product-type repository when `systemCode` is empty, so it is
    // async.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);

    expect(sku.getBaseProductType()).toBeInstanceOf(Promise);
    expect(sku.getSkuDefinition()).toBeInstanceOf(Promise);
    expect(sku.getLivePrice()).toBeInstanceOf(Promise);
    expect(sku.getCurrentAccountPrice()).toBeInstanceOf(Promise);
    expect(sku.hasUniqueOptions()).toBeInstanceOf(Promise);
    expect(sku.getTransactionExistsFlag()).toBeInstanceOf(Promise);
    expect(Sku.hydrate(sku)).toBeInstanceOf(Promise);

    // Awaited so nothing floats the lint profile enforces no-floating-promises.
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
    // one statement, no guard. A sku with no product raises, and a product with no product type
    // raises at [model/entity/Product.cfc:L494].
    //
    // `ProductType.getBaseProductType()` uses `listFirst` on `productTypeIDPath`, so it answers
    // element one the ROOT.
    const withType = makeSkuWithBaseProductType(BASE_TYPE_MERCHANDISE);

    expect(await withType.getBaseProductType()).toBe(BASE_TYPE_MERCHANDISE);

    // The default fixture product does carry a merchandise product type.
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

// B24 association, far-side and structural parity.

describe('Sku association and structural parity', () => {
  it('★ G3 IS MIXED — the shipped far-side behaviour is tested, never an assumed convention', () => {
    // Far-side graph symmetry is REPRODUCED in priceGroupRate.ts, promotionApplied.ts,
    // promotionPeriod.ts, promotionCode.ts, promotionQualifier.ts, promotionReward.ts and
    // priceGroup.ts.
    //
    // Verified first-hand for `sku.ts`: `setProduct` does complete the far side
    // [model/entity/Sku.cfc:L614] with the `isNew() || !hasSku(this)` guard.
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
    // A structurally identical collaborator carrying a different id is a different row; two
    // instances sharing an id are the same row.
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
    const sku = makeSkuFixture({ skuID: 'sku-1' });
    const reward = new PromotionReward({ promotionRewardID: 'reward-1' });
    const excludedReward = new PromotionReward({ promotionRewardID: 'reward-2' });
    const qualifier = new PromotionQualifier({ promotionQualifierID: 'qualifier-1' });
    const excludedQualifier = new PromotionQualifier({ promotionQualifierID: 'qualifier-2' });

    sku.addPromotionReward(reward);
    sku.addPromotionRewardExclusion(excludedReward);
    sku.addPromotionQualifier(qualifier);
    sku.addPromotionQualifierExclusion(excludedQualifier);

    // Both sides of all four links, and no cross-contamination between the include and exclude
    // collections of either family.
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
    // Guard `if(sku.isNew() or !hasSku(sku))` on the far side: a saved sku is compared by
    // identifier, so the link table cannot acquire a duplicate row; an unsaved one short-circuits
    // the guard and is appended twice.
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

    // SAME-KEY TWINS are the same row, because a repository read produces a fresh instance per
    // read.
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

    // A different key is a different row.
    expect(
      sku.hasSkuCurrency(
        makeSkuCurrencyDouble('sku-currency-9', 'USD', undefined, undefined, undefined),
      ),
    ).toBe(false);
    expect(sku.hasPriceGroupRate(new PriceGroupRate({ priceGroupRateID: 'rate-9' }))).toBe(false);

    // And each PROBE READS one COLLECTION. Crossing the include and exclude members over is the
    // mistake a shared helper makes, so it is asserted in both directions per family.
    expect(sku.hasPromotionReward(excludedReward)).toBe(false);
    expect(sku.hasPromotionRewardExclusion(reward)).toBe(false);
    expect(sku.hasPromotionQualifier(excludedQualifier)).toBe(false);
    expect(sku.hasPromotionQualifierExclusion(qualifier)).toBe(false);
  });

  it('★ THE LIVE-ARRAY RULE IS ABSOLUTE — association accessors do NOT return defensive copies', () => {
    // Hibernate handed back the LIVE collection, and the legacy relies on that:
    // `optionGroup.getOptions().push(option)` is how the inverse side of `SwSkuOption` is
    // completed during hydration.
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
    // The four out-of-scope many-to-many sides survive as opaque identifier arrays, which is how
    // the schema contract is kept without importing an out-of-scope aggregate.
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
    // [model/entity/Sku.cfc:L49] the attribute order is `persistent, accessors, output` the
    // REVERSE of every sibling entity and there is no `displayname` attribute at all.
    //
    // `ormtype`/`ormType` casing, the `type="array"` inconsistency, the abbreviated table names
    // and the banner warts are all left exactly as found.
    const sku = makeSkuFixture();

    // The calculated property is a plain integer column with no default
    // [model/entity/Sku.cfc:L62].
    expect(sku.getCalculatedQATS()).toBe(7);
    expect(new Sku({ skuID: 'unprojected-sku' }).getCalculatedQATS()).toBeUndefined();

    // `activeFlag` [model/entity/Sku.cfc:L53] does carry `default="1"`, unlike most siblings.
    expect(new Sku({ skuID: 'flag-sku' }).getActiveFlag()).toBe(true);
  });

  it('★★ carries remoteID through hydration, present and absent, as its own persisted column', () => {
    const correlated = new Sku({ skuID: 'sku-1', remoteID: 'legacy-erp-SKU-00417' });
    const uncorrelated = new Sku({ skuID: 'sku-2' });

    expect(correlated.getRemoteID()).toBe('legacy-erp-SKU-00417');
    expect(uncorrelated.getRemoteID()).toBeUndefined();

    // The fixture's own default is a populated one, so the fixture path is covered too rather than
    // being assumed equivalent to a hand-built double.
    expect(makeSkuFixture({ skuID: 'sku-3' }).getRemoteID()).toBe('remote-test-sku');

    // ABSENCE is EXPLICIT, not defaulted: the column is nullable with no `default` attribute, so
    // an absent value must stay absent rather than becoming '' or the sku's own identifier.
    expect(makeSkuFixture({ skuID: 'sku-4', remoteID: undefined }).getRemoteID()).toBeUndefined();

    // And the EMPTY STRING is preserved as the distinct third state a persisted blank produces.
    expect(new Sku({ skuID: 'sku-5', remoteID: '' }).getRemoteID()).toBe('');
  });

  it('★ THE FOUR DEPRECATED METHODS ARE PORTED, because deprecated is not absent (C4)', () => {
    // [model/entity/Sku.cfc:L882-L912] is a POPULATED `Deprecated Methods` banner pair unusual in
    // this folder; `PromotionCode.cfc:L189-L191` has the same pair and it is EMPTY.
    //
    // LEGACY-NOTE [model/entity/Sku.cfc:L885 versus L233]: `displayOptions()` and the
    // non-deprecated `getOptionsDisplay()` have IDENTICAL bodies the local is even spelled the
    // same, `dspOptions`. The duplication is recorded, not resolved.
    const sku = makeSkuFixture();

    // 1 + 2: identical bodies, default delimiter `' '`.
    expect(sku.displayOptions()).toBe(sku.getOptionsDisplay());
    expect(sku.displayOptions('|')).toBe(sku.getOptionsDisplay('|'));
    expect(sku.getOptionsDisplay()).toContain('Large');

    // 3: pure delegation to the corrected ID struct.
    expect(sku.getOptionsByGroupIDStruct()).toEqual(sku.getOptionsByOptionGroupIDStruct());

    // 4: keyed by option-group NAME, valued with the option ID, LAST wins the legacy has no
    // existence guard here, unlike [model/entity/Sku.cfc:L504] and [model/entity/Sku.cfc:L516].
    const valueStruct = sku.getOptionsValueStruct();
    const firstOption = requireOption(sku.getOptions(), 0);
    const firstGroupName = requireOptionGroupOf(firstOption).getOptionGroupName() ?? '';

    expect(structGet(valueStruct, firstGroupName)).toBe(firstOption.getOptionID());
    expect(structKeyExists(valueStruct, firstGroupName)).toBe(true);
  });

  it('★ getOptionsValueStruct is LAST-match-wins, opposite to the two option structs', () => {
    // No `if(!structKeyExists(...))` guard at [model/entity/Sku.cfc:L902], so a later option under
    // the same group NAME overwrites an earlier one.
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
    // JavaRB is deliberately not ported (AAP §0.5.3).
    //
    // The one Sku site that would have needed a live lookup `rbKey('entity.subscriptionTerm')` at
    // [model/entity/Sku.cfc:L585] is the subscription branch.
    const sku = makeSkuWithBaseProductType(BASE_TYPE_SUBSCRIPTION);
    const probe = sku as unknown as Record<string, unknown>;

    expect(probe['rbKey']).toBeUndefined();
    expect(probe['getRBKey']).toBeUndefined();
    expect(probe['getHibachiRBService']).toBeUndefined();
  });
});

// B25 the five distinct empty-collection semantics.
//
// Collapsing any one of these into another is a money bug.

describe('Sku empty-collection semantics — five distinct answers, not one', () => {
  it('★ names all five, and pins the three this entity can observe', () => {
    // PERMISSIVE in the CALLER'S LOOP an empty `addressZones` collection means the caller's loop
    // never runs and the qualifier passes [model/service/PromotionService.cfc:L333-L420].
    //
    // On Sku specifically, an empty `options` collection produces four different answers from five
    // readers, and they are not interchangeable.
    const optionLess = makeSkuFixture({ options: [] });

    // (a) the empty STRING, from the `''` seed at [model/entity/Sku.cfc:L526].
    expect(optionLess.getOptionsIDList()).toBe('');
    // (b) the empty STRUCT, twice the corrected divergence-(c) behaviour.
    expect(optionLess.getOptionsByOptionGroupIDStruct()).toEqual({});
    expect(optionLess.getOptionsByOptionGroupCodeStruct()).toEqual({});
    // (c) PERMISSIVE `true`, because the loop at [model/entity/Sku.cfc:L774] never runs.
    expect(optionLess.hasOneOptionPerOptionGroup()).toBe(true);
    // (d) the empty DISPLAY string, from the same `''` seed pattern at
    // [model/entity/Sku.cfc:L234].
    expect(optionLess.getOptionsDisplay()).toBe('');
  });

  it('★ and hasUniqueOptions answers the OPPOSITE way on the very same empty collection', async () => {
    // The fifth reader of the same empty collection fails SPURIOUSLY see B15.6.
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
    // The currency map's empty semantic is the highest-consequence of the lot: an empty map is
    // UNPRICED, and unpriced must never read as free.
    const sku = makeSkuFixture();

    expect(sku.getCurrencyDetails()).toEqual({});
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getListPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getRenewalPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeUndefined();
    expect(sku.getPriceByCurrencyCode(INELIGIBLE_CURRENCY_CODE)).toBeUndefined();
  });

  it('an empty price-group rate collection resolves to NO rate, not to a zero-amount rate', () => {
    // A fabricated zero-amount rate would apply a 100% discount. `undefined` is the only safe
    // answer, and it is the legacy answer.
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

// `generateImageFileName` reads two SETTINGS, and both carry a metadata `defaultValue` -
// `productImageDefaultExtension` `"jpg"` and `productImageOptionCodeDelimiter` `"-"`
// [model/service/SettingService.cfc:L191-L192].

describe('Sku image members — the two that ship and the three that refuse', () => {
  /**
   * An `SwOptionGroup` row whose `imageGroupFlag` [model/entity/OptionGroup.cfc:L57] is SET.
   */
  function makeImageBearingOptionGroup(optionGroupID: string, sortOrder: number): OptionGroup {
    return new OptionGroup({
      optionGroupID,
      optionGroupName: `Group ${optionGroupID}`,
      optionGroupCode: optionGroupID,
      optionGroupImage: undefined,
      optionGroupDescription: undefined,
      // The one difference from `makeOptionGroupDouble`, which hardcodes `false` because the
      // shared fixture mirrors the column default.
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
    const product = makeProductFixture();
    const sku = new Sku({ skuID: 'sku-default-settings', product, options: [] });

    // [model/entity/Sku.cfc:L138]: sanitised product code, no option segments, literal `.`,
    // extension. `TESTPRODUCTXXX` is [meta/tests/unit/Helper.cfc:L56] verbatim.
    expect(sku.generateImageFileName()).toBe('TESTPRODUCTXXX.jpg');
  });

  it('★ prefers the CONFIGURED delimiter and extension when the set was materialised', () => {
    // The mirrored defaults are a fallback, not a hardcoding - a materialised set wins, which is
    // what makes the mirroring safe rather than a second source of truth.
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
    // [model/entity/Sku.cfc:L134] gates the segment on `getOptionGroup().getImageGroupFlag()`.
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

    // [model/entity/Sku.cfc:L133] iterates `getOptions()` in the order the array carries, so two
    // image groups append in that order and the delimiter precedes each segment.
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
    // The `NoCase` `IN` `reReplaceNoCase` is the WHOLE POINT [model/entity/Sku.cfc:L135, L138].
    // The CFML character class lists lower-case `a-z` only, but the case-insensitive variant folds
    // case, so `A-Z` are not stripped.
    const product = makeProductFixture({ productCode: 'AB C/1*2' });
    const imageGroup = makeImageBearingOptionGroup('image-group', 1);
    const option = makeOptionDouble('opt-1', 'R E D!', 'Red', imageGroup, 1);

    const sku = new Sku({ skuID: 'sku-dirty-codes', product, options: [option] });

    // Space, slash, asterisk and exclamation mark are outside `[^a-z0-9\-\_]`; letters, digits,
    // hyphen and underscore survive - in both cases.
    expect(sku.generateImageFileName()).toBe('ABC12-RED.jpg');
  });

  it('★ treats an absent product code as an empty segment rather than raising', () => {
    // `reReplaceNoCase` over a null column yields the empty string in CFML, so a product with no
    // code composes to just the extension.
    const product = makeProductFixture({ productCode: undefined });
    const sku = new Sku({ skuID: 'sku-no-code', product, options: [] });

    expect(sku.generateImageFileName()).toBe('.jpg');
  });

  it('★ RAISES for a sku with no product, naming the unguarded source dereference', () => {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L135, L138]: the two lines
    // dereference `getProduct()` three times with no guard against a nullable many-to-one, so a
    // product-less sku raises in CFML too.
    // Preserved deliberately; do not fix without a product decision.
    const orphan = new Sku({ skuID: 'sku-orphan', options: [] });

    expect(() => orphan.generateImageFileName()).toThrow(
      /generateImageFileName was called on a sku with no product/,
    );
    expect(() => orphan.generateImageFileName()).toThrow(/model\/entity\/Sku\.cfc:L135/);
  });

  it('★ RAISES for an option with no option group, naming the nullable association', () => {
    // [model/entity/Sku.cfc:L134] dereferences `option.getOptionGroup()` unconditionally, and
    // [model/entity/Option.cfc:L59] declares that association NULLABLE.
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
    // `sku.setImageFile( sku.generateImageFileName() )` over every sku of the product.
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
    // [model/entity/Sku.cfc:L146] interpolates `#getImageFile()#` directly.
    const sku = new Sku({
      skuID: 'sku-no-image-file',
      options: [],
      imageSettingValues: CONFIGURED_SETTINGS,
    });

    expect(sku.getImagePath()).toBe('https://cdn.example/assets/images/product/default/');

    // And it NEEDS no PRODUCT. Unlike `generateImageFileName`, [model/entity/Sku.cfc:L146] never
    // dereferences `getProduct()`, so a product-less sku answers rather than raising.
    expect(sku.getProduct()).toBeUndefined();
  });

  it('★ getImagePath RAISES without materialised settings, and names ONLY the accessor that has no default', () => {
    const sku = new Sku({ skuID: 'sku-unmaterialised-settings', options: [] });

    expect(() => sku.getImagePath()).toThrow(/getImagePath was called on a sku hydrated without/);
    expect(() => sku.getImagePath()).toThrow(/getBaseImageURL/);
    expect(() => sku.getImagePath()).toThrow(/SettingService\.cfc:L481-L482/);

    // The same instance still composes a file name, which is the sharpest statement of the
    // asymmetry: one member answers and the other refuses, on identical input.
    const withProduct = new Sku({
      skuID: 'sku-unmaterialised-settings-2',
      product: makeProductFixture(),
      options: [],
    });

    expect(withProduct.generateImageFileName()).toBe('TESTPRODUCTXXX.jpg');
    expect(() => withProduct.getImagePath()).toThrow(/getBaseImageURL/);
  });

  it('★ the three unportable members refuse, and say that the other two are ported', () => {
    // A materialised set does not unlock these.
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
    expect(() => sku.getImage({ size: 'large' })).toThrow(/getImage\(large\)/);
    expect(() => sku.getResizedImagePath({ size: 'small' })).toThrow(
      /getResizedImagePath\(small\)/,
    );
  });
});

// B26 the three mutators: setUserDefinedPriceFlag and the SkuCurrency pair.
//
// Three converted public members whose behaviour is asserted here directly rather than inferred
// from the paths that happen to pass through them.

describe('Sku.setUserDefinedPriceFlag — the persisted-flag boundary [model/entity/Sku.cfc:L59]', () => {
  it('starts false, because the column declares default="0" and not NULL', () => {
    const bare = new Sku({ skuID: 'flag-default-sku' });

    // The constructor resolves an omitted flag to `false` rather than leaving it absent, which is
    // what `default="0"` [model/entity/Sku.cfc:L59] means.
    expect(bare.getUserDefinedPriceFlag()).toBe(false);
    expect(typeof bare.getUserDefinedPriceFlag()).toBe('boolean');
  });

  it('accepts every value CFML accepts, and answers what CFML answered', () => {
    // The full decision table, driven rather than sampled.
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

    // The persisted-flag boundary, and the one behaviour the conversion helper adds over a general
    // boolean context: nine `ormtype="boolean"` properties across five in-scope entities declare
    // no default at all.
    fromNull.setUserDefinedPriceFlag(null);
    fromUndefined.setUserDefinedPriceFlag(undefined);

    expect(fromNull.getUserDefinedPriceFlag()).toBe(false);
    expect(fromUndefined.getUserDefinedPriceFlag()).toBe(false);
  });

  it('RAISES for a present value that carries no boolean meaning, rather than answering false', () => {
    const sku = new Sku({ skuID: 'flag-raise-sku' });

    // A column that hydrates as `'maybe'` is a schema surprise, not a false.
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
    await Sku.hydrate(sku);
    expect(sku.getPriceByCurrencyCode(SETTING_SKU_CURRENCY)).toBeDefined();

    sku.setUserDefinedPriceFlag(true);

    // Interface parity (C4): one declared parameter, exactly as
    // `setUserDefinedPriceFlag(required boolean userDefinedPriceFlag)` implies no context, no
    // clock and no options bag is added.
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

    // [model/entity/Sku.cfc:L657] is a single delegation, so both sides of the association move
    // and they move because `SkuCurrency.setSku` moved them the near side owns no append of its
    // own.
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

    // Live array reference.
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

    // CFML `or` SHORT-CIRCUITS, and `isNew()` is true for a row whose `skuCurrencyID` is the
    // `unsavedvalue=""` empty string [model/entity/SkuCurrency.cfc:L52], so the membership test
    // never runs and the append is unconditional.
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

    // [model/entity/Sku.cfc:L660] delegates to `SkuCurrency.removeSku`, which splices the far-side
    // array when it finds the row [model/entity/SkuCurrency.cfc:L99-L102] and then clears its own
    // `sku` field OUTSIDE that guard, at [model/entity/SkuCurrency.cfc:L103].
    expect(sku.getSkuCurrencies()).toStrictEqual([]);
    expect(row.getSku()).toBeUndefined();
    expect(sku.hasSkuCurrency(row)).toBe(false);
  });

  it('removes a hydrated row that never had its own sku assigned', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryOverride' });
    const held = requireSkuCurrency(sku.getSkuCurrencies(), 0);

    // A row that arrived through hydration sits in the collection without its own `sku` field
    // having been assigned the shape every repository-built entity has, since the far side is
    // populated only by `setSku`.
    expect(held.getSku()).toBeUndefined();

    sku.removeSkuCurrency(held);

    expect(sku.getSkuCurrencies()).toStrictEqual([]);
    expect(sku.hasSkuCurrency(held)).toBe(false);
  });

  it('finds element ZERO, because the 1-based arrayFind guard was translated and not copied', () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryOverride' });
    const first = requireSkuCurrency(sku.getSkuCurrencies(), 0);

    sku.removeSkuCurrency(first);

    // The off-by-one that did not happen. The far-side lookup is `findIndex(...) !== -1`, the
    // 0-based translation of CFML's 1-based `arrayFind(...) > 0`
    // [model/entity/SkuCurrency.cfc:L99-L100].
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

    // The clear sits outside the guard, and this is the case that shows it.
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

    // With no override rows, the secondary currency falls all the way through to Step 3 and is
    // CONVERTED [model/entity/Sku.cfc:L416-L428].
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
    expect(sku.getSkuCurrencies()).toStrictEqual([override]);

    // The map is untouched, so the converted answer stands even though a persisted override now
    // sits in the very collection Step 2 reads [model/entity/Sku.cfc:L399-L414].
    const afterAdd = requireDetail(sku.getCurrencyDetails(), SECONDARY_CURRENCY_CODE);
    expect(afterAdd.converted).toBe(true);
    expect(afterAdd.skuCurrencyID).toBe('');
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toFixed2()).toBe(convertedPrice);
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toFixed2()).not.toBe(
      Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE).toFixed2(),
    );
    const rehydrated = requireDetail(
      (await Sku.hydrate(sku)).getCurrencyDetails(),
      SECONDARY_CURRENCY_CODE,
    );
    expect(rehydrated.converted).toBe(true);
    expect(rehydrated.skuCurrencyID).toBe('');
    expect(converterLog.conversions).toHaveLength(conversionsAfterHydration);

    // Removing it is equally inert on the memo; the far-side collection is the only thing that
    // moves.
    sku.removeSkuCurrency(override);
    expect(sku.getSkuCurrencies()).toStrictEqual([]);
    expect(requireDetail(sku.getCurrencyDetails(), SECONDARY_CURRENCY_CODE).converted).toBe(true);
    expect(sku.getPriceByCurrencyCode(SECONDARY_CURRENCY_CODE)?.toFixed2()).toBe(convertedPrice);
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
    // `removeSkuCurrency(required any skuCurrency)` each declare exactly one parameter.
    expect(arityOf(sku, 'addSkuCurrency')).toBe(1);
    expect(arityOf(sku, 'removeSkuCurrency')).toBe(1);
  });
});

// The three audit/remote columns that carried no case of their own.
//
// They are grouped rather than split across three describes because they share one contract: each
// is a nullable column, each is read and never computed.

describe('Sku: the audit and remote-integration columns', () => {
  it('reads remoteID, and reports its absence as undefined rather than as an empty string', () => {
    // [model/entity/Sku.cfc:L90]. The column is nullable, so `undefined` is the honest absent
    // value - coercing it to `''` would make an unset external identifier indistinguishable from a
    // blank one.
    expect(new Sku({ skuID: 'remote-1', remoteID: 'erp-sku-40119' }).getRemoteID()).toBe(
      'erp-sku-40119',
    );
    expect(new Sku({ skuID: 'remote-2' }).getRemoteID()).toBeUndefined();
  });

  it('★★ collapses both audit Account associations to their foreign keys, never to an entity', () => {
    // [model/entity/Sku.cfc:L94, L96]. `Account` is out of scope, so the association is preserved
    // as an opaque identifier: the schema contract stays intact and no account behaviour enters
    // this port.
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
