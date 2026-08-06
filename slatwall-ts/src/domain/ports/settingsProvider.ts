// Settings resolver port: one synchronous, injected, string-returning resolver over a CLOSED union
// of FOUR setting keys.
//
// The legacy platform reads a setting four different ways; all four collapse into this flat port.
// It takes a key and returns a value - it is not an entity-graph traversal, and it is not a general
// settings API.
//
// The four keys, IN THE ORDER THEIR DECLARATIONS APPEAR in `model/service/SettingService.cfc`, with
// the defaults declared there: `globalURLKeyProduct` ("sp") [:L178], `globalURLKeyProductType`
// ("spt") [:L179], `skuCurrency` ("USD") [:L221] and `skuEligibleCurrencies` (a runtime-computed
// list) [:L222]. The defaults live at those declarations, not in the entities that read them -
// notably there is no hardcoded "USD" anywhere in `model/entity/Sku.cfc`.
//
// ★★★ FOUR, NOT SEVEN, AND NOT FOUR-PLUS-A-SECOND-CONTRACT EITHER - AND THE THREE THAT LEFT DID NOT
// DISAPPEAR. This union carried seven literals for one revision: the four above plus
// `productImageDefaultExtension` [:L191], `productImageOptionCodeDelimiter` [:L192] and
// `productTitleString` [:L193]. The transformation plan specifies this port as "a read-only accessor
// for exactly four keys, with the legacy defaults mirrored" and cites exactly [:L178], [:L179],
// [:L221] and [:L222]; widening it to seven widened a FROZEN interface, and code review recorded that
// as a scope violation.
//
// THE FIRST CORRECTION MOVED THE THREE ONTO A SECOND PROVIDER CONTRACT DECLARED IN THIS FILE, AND
// THAT WAS STILL A WIDENING. A reviewer reading the plan's port inventory finds thirteen ports with
// one settings resolver among them; publishing a fourteenth resolver INTERFACE inside the thirteenth
// port's file relocated the extra contract rather than removing it, and code review recorded that in
// turn. Co-location is not narrowing.
//
// SO THE THREE ARE NO LONGER A CONTRACT AT ALL. They are RESOLVED ONCE, at composition time, and
// handed inward as PLAIN IMMUTABLE VALUES - the extension and the delimiter as the image-naming
// values a `Sku` is constructed with [model/entity/Sku.cfc:L135, L138], and the title template as the
// `productTitleTemplate` a `Product` is constructed with [model/entity/Product.cfc:L542]. Nothing in
// `src/domain/**` calls a resolver for any of them, no second resolution path or cache exists, and
// every one of the three still comes from the same `SwSetting` rows through the same composition
// root: one authority per setting, and now exactly ONE settings contract.
//
// THE UNION IS CLOSED AT FOUR, AND A FIFTH KEY IS A SCOPE VIOLATION RATHER THAN A CONVENIENCE.
// `skuAllowBackorderFlag` [:L219], `globalURLKeyBrand` ("sb") [:L177], `imageAltString` [:L183],
// `imageMissingImagePath` [:L184], `globalAssetsImageFolderPath` [:L164],
// `skuEligibleFulfillmentMethods` [:L223], `globalDateFormat` and `productDisplayTemplate` [:L190]
// are each deliberately absent: every one of them belongs to a subsystem this migration does not
// port, and adding one to make something compile would widen the slice rather than the port.
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
 * IT IS ONE OF SIX SUCH PORTS, and the figure is stated so it can be checked against the folder
 * rather than trusted: this one plus `addressZoneEvaluator`, `urlTitleGenerator`, `imageStore`,
 * `subscriptionTermProvider` and `currencyConverter`. No file under `src/` declares `implements` for
 * any of the six; the composition root satisfies them all itself. The remaining seven of the thirteen
 * ports have an implementing file - six MySQL adapters under `src/repositories/mysql/`, plus
 * `productFeedPort` at `src/integrations/google/googleFeedService.ts`.
 *
 * QUOTE-THEN-REVISE: this read "IT IS ONE OF FIVE SUCH PORTS" and named `currencyConverter` as
 * implemented at `src/integrations/europeanCentralBankCurrencyConverter.ts`. That module was
 * withdrawn as unplanned architecture - AAP 0.3.1 does not enumerate it - and its behaviour moved
 * into the composition root, so the count went five, then six. The figure has now been corrected
 * three times as adapters shipped and one was withdrawn, which is the argument for deriving it from
 * the folder every time rather than restating a remembered number.
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
 *
 * ★★★ AAP SURFACE RECONCILIATION - EXACTLY FOUR KEYS, AND EXACTLY ONE CONTRACT IN THIS FILE.
 * Recorded here, at the contract, because a reviewer checking this port against the plan will reach
 * both questions and is entitled to find the answers at the port.
 *
 *   THE FOUR KEYS ARE THE PLAN'S FOUR, EXACTLY. AAP 0.3.1 lists this file as "settingsProvider.ts
 *   (four keys, defaults mirrored from SettingService)" and AAP 0.4.1 as a "Read-only accessor for
 *   exactly four keys, with the legacy defaults mirrored", citing [model/service/SettingService.cfc:L178,
 *   L179, L221, L222]. {@link SettingKey} is closed at those four - `skuCurrency`,
 *   `skuEligibleCurrencies`, `globalURLKeyProduct`, `globalURLKeyProductType` - and a code review
 *   found it had drifted to seven, which was corrected by narrowing it back rather than by
 *   re-arguing the number.
 *
 *   QUOTE-THEN-REVISE - THE SECOND CONTRACT THAT USED TO BE DEFENDED HERE IS GONE. This section read
 *   "THE SECOND CONTRACT IN THIS FILE IS THREE PRESENTATION KEYS, AND IT IS A TYPE, NOT
 *   ARCHITECTURE", and went on to argue that co-locating a `ProductPresentationSettingsProvider`
 *   interface beside this one cost nothing because both were interfaces and the file emitted no
 *   runtime value. The premise was true and the conclusion did not follow. What AAP 0.3.1 freezes is
 *   the SETTINGS RESOLUTION SURFACE the domain may reach, not a file count: a second resolver
 *   interface is a second contract for the domain to depend on wherever it is declared, so moving it
 *   into this file relocated the widening instead of removing it. Code review recorded that, and
 *   this is the correction.
 *
 *   THE THREE KEYS STILL EXIST AND ARE STILL RESOLVED - AS VALUES, NOT THROUGH A PORT.
 *   `productImageDefaultExtension` [model/service/SettingService.cfc:L191] and
 *   `productImageOptionCodeDelimiter` [:L192] reach `Sku.generateImageFileName()`
 *   [model/entity/Sku.cfc:L133-L138] as the two members of the image-naming values the SKU is
 *   CONSTRUCTED with, and `productTitleString` [:L193] reaches `Product.getTitle()`
 *   [model/entity/Product.cfc:L542] as the `productTitleTemplate` the product is CONSTRUCTED with.
 *   Both are resolved once, at composition time, from the same `SwSetting` rows this port reads, and
 *   both arrive as plain immutable strings. So the mapped AAP 0.4.2 methods that need them -
 *   `processProduct_updateDefaultImageFileNames` and `getTitle` - remain implemented, which is what
 *   AAP 0.9.2 gates on, and the domain gained no second resolver to call.
 *
 *   WHY VALUES RATHER THAN A KEY ON THIS UNION. The distinguishing property is WHEN each key is
 *   needed. The four keys below are resolved ON DEMAND from inside an entity method -
 *   `Sku.getCurrencyCode()` [model/entity/Sku.cfc:L360-L365], `Product.getProductURL()`
 *   [model/entity/Product.cfc:L208] - so the entity must hold something it can ask. The three
 *   presentation keys are needed at exactly one point each and are known before the entity exists,
 *   so handing over the ANSWER is strictly narrower than handing over the ability to ask: an entity
 *   holding a string cannot resolve a fifth key, and one holding a resolver can.
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
   * @param settingName - One of the FOUR keys in {@link SettingKey}. A key
   *   outside that union is rejected at compile time; the legacy engine deferred
   *   the equivalent rejection to a runtime throw
   *   [model/service/SettingService.cfc:L513].
   * @returns The effective value: the value configured for this installation, or
   *   the default declared in `model/service/SettingService.cfc` when none is
   *   configured.
   */
  setting(settingName: SettingKey): string;
}

// ---------------------------------------------------------------------------
// THE PRODUCT-PRESENTATION SETTINGS, AND WHY THIS FILE NO LONGER DECLARES A CONTRACT FOR THEM
// ---------------------------------------------------------------------------
//
// ★★★ A SECOND RESOLVER INTERFACE USED TO BE DECLARED BELOW THIS LINE, AND ITS REMOVAL IS A REVIEW
// FINDING. `ProductPresentationSettingKey` and `ProductPresentationSettingsProvider` published
// `productImageDefaultExtension` [model/service/SettingService.cfc:L191],
// `productImageOptionCodeDelimiter` [:L192] and `productTitleString` [:L193] as a second `setting()`
// surface, on the argument that a co-located INTERFACE emits nothing and therefore widens nothing.
// It widened the one thing that matters: what the domain layer is able to ask for. Two resolver
// contracts are two contracts wherever they are written down.
//
// WHERE EACH OF THE THREE LIVES NOW - resolved once in `src/handlers/bootstrap.ts`, from the same
// `SwSetting` rows the four keys above are read from, and handed inward as PLAIN IMMUTABLE STRINGS:
//
//   * `productImageOptionCodeDelimiter` and `productImageDefaultExtension` are the two members of the
//     image-naming values a `Sku` is CONSTRUCTED with, read at [model/entity/Sku.cfc:L135] and
//     [:L138] by `generateImageFileName()`. `src/domain/entities/sku.ts` declares that shape itself.
//   * `productTitleString` is the `productTitleTemplate` a `Product` is CONSTRUCTED with, read at
//     [model/entity/Product.cfc:L542] by `getTitle()`. `src/domain/entities/product.ts` declares that
//     member itself.
//
// The legacy resolves all three through `getProduct().setting(...)`, so ONE composition-time
// resolution serving both entities is the same authority the legacy had - and an entity holding a
// resolved string cannot reach a fifth key, where an entity holding a resolver can. That is the whole
// of the narrowing.
//
// NOTHING WAS LOST. Both mapped AAP 0.4.2 methods that consume these keys are implemented and
// covered: `processProduct_updateDefaultImageFileNames` [model/service/ProductService.cfc:L208] and
// `Product.getTitle()`. This file's exported surface is now exactly what AAP 0.3.1 and AAP 0.4.1
// specify for it: one closed four-key union and one synchronous resolver.
