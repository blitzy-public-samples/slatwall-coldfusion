// Settings resolver port: one synchronous, injected, string-returning resolver over a CLOSED union
// of four setting keys.
//
// The legacy platform reads a setting four different ways; all four collapse into this flat port.
//
// The four keys, in the order their declarations appear in `model/service/SettingService.cfc`,
// with the defaults declared there: `globalURLKeyProduct` ("sp")
// [model/service/SettingService.cfc:L178], `globalURLKeyProductType` ("spt")
// [model/service/SettingService.cfc:L179].
export type SettingKey =
  /**
   * URL key segment for a product detail page.
   */
  | 'globalURLKeyProduct'
  /**
   * URL key segment for a product-type page.
   *
   * Resolved at the service tier, alongside `globalURLKeyProduct`, when a product-type URL is
   * built.
   */
  | 'globalURLKeyProductType'
  /**
   * The base currency a SKU's own price columns are denominated in.
   *
   * `Sku.getCurrencyCode()` [model/entity/Sku.cfc:L360-L365] memoizes
   * `this.setting('skuCurrency')` and has no literal fallback of any kind - there is no `"USD"`
   * anywhere in `Sku.cfc`.
   *
   * Read again three times inside the currency cascade: as the step-1 base-currency comparison
   * [model/entity/Sku.cfc:L385].
   */
  | 'skuCurrency'
  /**
   * The currencies a SKU may be priced in - and the GATE on the whole cascade.
   *
   * `getCurrencyService().getAllActiveCurrencyIDList()` is a live data lookup, which sits
   * awkwardly against a synchronous resolver.
   */
  | 'skuEligibleCurrencies';

/**
 * The settings resolution surface the domain depends on.
 *
 * Constructor-injected into every entity and service that reads a setting, replacing all four
 * legacy resolution surfaces listed in the file header.
 *
 * It is one of six such PORTS, and the figure is stated so it can be checked against the folder
 * rather than trusted: this one plus `addressZoneEvaluator`, `urlTitleGenerator`, `imageStore`.
 */
export interface SettingsProvider {
  /**
   * Resolve one setting to its effective value.
   *
   * That constraint meets a real complication in exactly one key.
   *
   * Always A STRING, even where the legacy declaration suggests otherwise.
   *
   * @param settingName One of the FOUR keys in {@link SettingKey}.
   * @returns The effective value: the value configured for this installation, or the default
   * declared in `model/service/SettingService.cfc` when none is configured.
   */
  setting(settingName: SettingKey): string;
}

// The product-presentation settings, and why this file no longer declares a contract for them.
//
// `productImageOptionCodeDelimiter` and `productImageDefaultExtension` are the two members of the
// image-naming values a `Sku` is CONSTRUCTED with.
