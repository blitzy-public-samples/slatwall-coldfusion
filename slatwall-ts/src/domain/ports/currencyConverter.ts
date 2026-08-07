// slatwall-ts - the CurrencyConverter port.
//
// One LEGACY TODO is CARRIED FORWARD, on `convertCurrency` The project carries source TODOs
// forward as explicitly flagged TODOs rather than silently completing them. Exactly one falls
// inside this port's source, at [model/service/CurrencyService.cfc:L81].

import type { Money } from '../valueObjects/money.js';
import type { CurrencyCode } from '../valueObjects/currencyCode.js';

/**
 * The two currency capabilities the in-scope slice needs, as one injected collaborator.
 *
 * Replaces the `getService("currencyService")` service-locator lookups embedded inside the SKU
 * entity at [model/entity/Sku.cfc:L371, L418, L422, L425] with a constructor-injected interface.
 *
 * `getAllActiveCurrencyIDList` is required by a different AAP row, not by this one.
 */
export interface CurrencyConverter {
  // JUDGMENT CALL: The legacy comma-delimited return is exposed as an array so callers do not
  // parse a list.
  /**
   * List the currency codes flagged active.
   *
   * CFML parity [model/service/CurrencyService.cfc:L57-L67]: the legacy method filters
   * `activeFlag` to 1, selects `currencyCode`, and appends each record to a comma-delimited
   * string.
   *
   * @returns every active currency code.
   */
  getAllActiveCurrencyIDList(): Promise<CurrencyCode[]>;

  // LEGACY-NOTE [model/entity/Sku.cfc:L371-L375]: this lookup applies no active-currency filter,
  // so an eligible-currency setting naming an inactive currency still yields it. Retained to
  // preserve the cited legacy behavior.
  /**
   * Resolve the currencies named by a comma-delimited currency-code list.
   *
   * CFML parity [model/entity/Sku.cfc:L371-L375]: the cascade takes a Currency smart list and
   * narrows it with an in filter on the eligible-currency setting.
   *
   * @param currencyCodeList a comma-delimited list of currency codes, in the form the
   * `skuEligibleCurrencies` setting stores.
   * @returns the currencies whose code appears in the list.
   */
  getCurrenciesByCurrencyCodeList(currencyCodeList: string): Promise<CurrencyCode[]>;

  // TODO [model/service/CurrencyService.cfc:L81]: add integration support so a configured
  // currency-conversion integration can supply the rate.
  /**
   * Convert an amount between two currencies.
   *
   * @param amount the amount expressed in `originalCurrencyCode`.
   * @param originalCurrencyCode the currency `amount` is denominated in.
   * @param convertToCurrencyCode the currency to express the result in.
   * @returns the converted amount, or `amount` unchanged when no rate is available.
   */
  convertCurrency(
    amount: Money,
    originalCurrencyCode: CurrencyCode,
    convertToCurrencyCode: CurrencyCode,
  ): Promise<Money>;
}
