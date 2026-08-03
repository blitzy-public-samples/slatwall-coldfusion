// Settings resolver port: one synchronous, injected, string-returning resolver over a CLOSED union
// of FOUR setting keys.
//
// The legacy platform reads a setting four different ways; all four collapse into this flat port.
// It takes a key and returns a value - it is not an entity-graph traversal, and it is not a general
// settings API.
//
// The four keys and their legacy defaults are `skuCurrency` (defaultValue="USD")
// [model/service/SettingService.cfc:L221], `skuEligibleCurrencies` [:L222], `globalURLKeyProduct`
// [:L178] and `globalURLKeyProductType` [:L179]. The defaults live at those declarations, not in
// the entities that read them - notably there is no hardcoded "USD" anywhere in
// `model/entity/Sku.cfc`.
export type SettingKey =
  /**
   * URL key segment for a product detail page.
   *
   * `globalURLKeyProduct = {fieldType="text",defaultValue="sp"}`
   * [model/service/SettingService.cfc:L178] - default `"sp"`.
   *
   * Read by `Product.getProductURL()` [model/entity/Product.cfc:L208], which returns
   * `"/#setting('globalURLKeyProduct')#/#getURLTitle()#/"`, and by `Product.getListingProductURL()`
   * [model/entity/Product.cfc:L212], which returns the same value without the leading slash. This
   * is the one entity method carrying legacy coverage, so the key's spelling and its default are
   * both pinned by an existing assertion [meta/tests/unit/entity/ProductTest.cfc:L58-L61].
   */
  | 'globalURLKeyProduct'
  /**
   * URL key segment for a product-type page.
   *
   * `globalURLKeyProductType = {fieldType="text",defaultValue="spt"}`
   * [model/service/SettingService.cfc:L179] - default `"spt"`.
   *
   * Resolved at the service tier, alongside `globalURLKeyProduct`, when a product-type URL is
   * built. No in-scope ENTITY reads it: there is no `setting('globalURLKeyProductType')` call site
   * anywhere under `model/entity/`. Its only non-admin legacy consumer is the out-of-scope CMS
   * bridge [integrationServices/mura/model/handler/MuraEventHandler.cfc:L108-L109], which is not
   * ported. It is published here because the transformation plan names it as one of this port's
   * keys, and because the product-type save path is in scope.
   */
  | 'globalURLKeyProductType'
  /**
   * The base currency a SKU's own price columns are denominated in.
   *
   * `skuCurrency = {fieldType="select", defaultValue="USD"}`
   * [model/service/SettingService.cfc:L221] - default `"USD"`.
   *
   * THE `"USD"` DEFAULT LIVES AT THAT DECLARATION AND NOWHERE IN THE ENTITY.
   * `Sku.getCurrencyCode()` [model/entity/Sku.cfc:L360-L365] memoizes `this.setting('skuCurrency')`
   * and has no literal fallback of any kind - there is no `"USD"` anywhere in `Sku.cfc`.
   * Reproducing the default as an entity-side literal would move the decision out of configuration
   * and change what a differently configured installation charges.
   *
   * Read again three times inside the currency cascade: as the step-1 base-currency comparison
   * [model/entity/Sku.cfc:L385], and as the step-3 conversion source [model/entity/Sku.cfc:L418,
   * L422, L425]. Preserving the cascade exactly is a must-preserve requirement, so this key's name
   * and default are load-bearing on price.
   *
   * Deliberately typed as a plain `string`, NOT a branded currency-code type: the published entity
   * signature is `Sku.getCurrencyCode(): string`, and a branded return here would contradict it.
   */
  | 'skuCurrency'
  /**
   * The currencies a SKU may be priced in - and the GATE on the whole cascade.
   *
   * `skuEligibleCurrencies` =
   *   {fieldType="listingMultiselect",
   *   listingMultiselectEntityName="Currency",
   *   defaultValue=getCurrencyService().getAllActiveCurrencyIDList()}
   * [model/service/SettingService.cfc:L222].
   *
   * STEP 0, THE GATE. `Sku.getCurrencyDetails()` wraps its entire body -
   * [model/entity/Sku.cfc:L374-L430], every one of the cascade's three steps - in
   * `if(len(setting('skuEligibleCurrencies')))` [model/entity/Sku.cfc:L373]. When that resolves
   * empty the memo initialized at [model/entity/Sku.cfc:L369] stays `{}`, and because
   * `getPriceByCurrencyCode`, `getListPriceByCurrencyCode` and `getRenewalPriceByCurrencyCode`
   * [model/entity/Sku.cfc:L269-L285] have no `else` and no fallback, EVERY price accessor on the
   * SKU then yields nothing. A port that drops the gate, or that returns a non-empty stand-in when
   * the setting is genuinely empty, changes prices.
   *
   * THE DEFAULT IS RUNTIME-COMPUTED, NOT A LITERAL:
   * `getCurrencyService().getAllActiveCurrencyIDList()` is a live data lookup, which sits awkwardly
   * against a synchronous resolver. The resolution is one-sided and binding: THE COMPOSITION ROOT
   * MUST RESOLVE THIS DEFAULT EAGERLY - before the provider instance is handed to the domain layer
   * - so that `setting()` can stay synchronous. That is the same "materialize at the boundary"
   * discipline the SKU currency-detail map uses. This key therefore gains no `async` variant, no
   * second method, no initialization hook and no promise-returning overload; see the matching note
   * on {@link SettingsProvider} and on its `setting` method.
   *
   * THE VALUE IS A RAW COMMA-DELIMITED LIST, and it is returned as such for signature parity:
   * [model/entity/Sku.cfc:L375] hands it straight to `addInFilter('currencyCode', ...)` without
   * splitting it. Parsing belongs to the consumer, using the CFML list helpers in `src/lib/cfml/`.
   * There is deliberately no `string[]` convenience accessor on this port.
   */
  | 'skuEligibleCurrencies';

/**
 * The settings resolution surface the domain depends on.
 *
 * Constructor-injected into every entity and service that reads a setting, replacing all four
 * legacy resolution surfaces listed in the file header. The domain never resolves a setting any
 * other way, and in particular never reads process configuration or an environment variable to
 * obtain one.
 *
 * IMPLEMENTED IN THE COMPOSITION ROOT. There is no adapter file for this port anywhere in the
 * target layout - `src/repositories/mysql/**` implements the six repository ports only - so the
 * composition root constructs the instance and supplies the legacy defaults, then hands the
 * finished provider inward.
 *
 * IT IS ONE OF FIVE SUCH PORTS, and the figure is stated so it can be checked against the folder
 * rather than trusted: this one plus `addressZoneEvaluator`, `urlTitleGenerator`, `imageStore` and
 * `subscriptionTermProvider`. No file under `src/` declares `implements` for any of the five. The
 * remaining eight of the thirteen ports all have an implementing file - six MySQL adapters under
 * `src/repositories/mysql/`, plus `currencyConverter` at
 * `src/integrations/europeanCentralBankCurrencyConverter.ts` and `productFeedPort` at
 * `src/integrations/google/googleFeedService.ts`. The figure has been corrected twice as those two
 * adapters shipped, from seven to six to five, which is the argument for deriving it from the
 * folder every time rather than restating a remembered number.
 *
 * THE COMPOSITION ROOT MUST RESOLVE EVERY RUNTIME-COMPUTED DEFAULT EAGERLY, before the provider
 * instance reaches the domain layer. Exactly one key needs this: `skuEligibleCurrencies` declares
 * its default as `getCurrencyService().getAllActiveCurrencyIDList()`
 * [model/service/SettingService.cfc:L222], a live data lookup rather than a literal. Resolving it
 * up front is what allows `setting()` below to remain synchronous, and it is the ONLY sanctioned
 * answer to that tension - this port gains no `async` variant, no second method, no initialization
 * hook and no promise-returning overload.
 *
 * REQUEST-SCOPED, NOT MODULE-SCOPED. The legacy resolver memoizes into
 * `variables.settingDetailsCache` on the component [model/service/SettingService.cfc:L452-L459],
 * which on a warm container would become state shared between unrelated invocations. Any caching an
 * implementation does must therefore live on the per-request instance, so that one request can
 * never observe a value resolved for another. This is a correctness constraint on where the state
 * lives, not a tuning choice.
 */
export interface SettingsProvider {
  /**
   * Resolve one setting to its effective value.
   *
   * SYNCHRONOUS, DELIBERATELY. Not `async`, and it does not return a promise.
   * `Sku.getCurrencyDetails()` reads the gate at [model/entity/Sku.cfc:L373] from a synchronous
   * body, and the SKU's currency accessors - `getPriceByCurrencyCode`,
   * `getListPriceByCurrencyCode`, `getRenewalPriceByCurrencyCode` - are published as synchronous. A
   * promise here would cascade `async` into all of them and break that published contract, so the
   * async boundary is drawn at the repository, never here.
   *
   * That constraint meets a real complication in exactly one key. `skuEligibleCurrencies` declares
   * a RUNTIME-COMPUTED default - `getCurrencyService().getAllActiveCurrencyIDList()`
   * [model/service/SettingService.cfc:L222] - which is a live data lookup rather than a literal.
   * THE COMPOSITION ROOT MUST RESOLVE IT EAGERLY, before this provider is handed to the domain
   * layer, so that this method can stay synchronous. That is the same "materialize at the boundary"
   * discipline the SKU currency-detail map uses. It is the whole solution: this port gains no
   * `async` variant, no second method, no initialization hook and no promise-returning overload.
   *
   * NEVER RETURNS UNDEFINED, and the return type says so. Legacy `setting()` always resolves to the
   * declared default: `getSettingDetails()` initializes `settingValue` to `""`
   * [model/service/SettingService.cfc:L473-L479], seeds it from the declared `defaultValue` when
   * one exists [model/service/SettingService.cfc:L481-L486], and `getSettingValue()` returns that
   * field on both its cached and uncached paths [model/service/SettingService.cfc:L459, L465].
   * Widening this to `string | undefined` would push a null check into every consumer that legacy
   * never had. An implementation that cannot resolve a value must supply the declared default
   * rather than return nothing.
   *
   * ALWAYS A STRING, even where the legacy declaration suggests otherwise. The legacy return type
   * is `any` [model/entity/HibachiEntity.cfc:L129] and the stored value is textual on every path;
   * `skuEligibleCurrencies` in particular arrives as a raw comma-delimited list and is consumed as
   * one [model/entity/Sku.cfc:L375]. Callers that need another shape convert explicitly - list
   * parsing through the CFML helpers in `src/lib/cfml/`, currency arithmetic through `Money` -
   * which keeps every such conversion visible at its call site instead of hidden in a resolver.
   *
   * NAMED `setting` VERBATIM FROM CFML. Interface parity is the acceptance contract for this port,
   * so the method is not renamed to `get`, `getSetting` or `resolve`, and the argument keeps the
   * legacy name `settingName` [model/entity/HibachiEntity.cfc:L129].
   *
   * @param settingName - One of the four keys in {@link SettingKey}. A key
   *   outside that union is rejected at compile time; the legacy engine deferred
   *   the equivalent rejection to a runtime throw
   *   [model/service/SettingService.cfc:L513].
   * @returns The effective value: the value configured for this installation, or
   *   the default declared in `model/service/SettingService.cfc` when none is
   *   configured.
   */
  setting(settingName: SettingKey): string;
}
