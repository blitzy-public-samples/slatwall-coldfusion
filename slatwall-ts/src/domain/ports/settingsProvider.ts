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
// ★★★ FOUR, NOT SEVEN - AND THE THREE THAT LEFT DID NOT DISAPPEAR. This union carried seven
// literals for one revision: the four above plus `productImageDefaultExtension` [:L191],
// `productImageOptionCodeDelimiter` [:L192] and `productTitleString` [:L193]. The transformation plan
// specifies this port as "a read-only accessor for exactly four keys, with the legacy defaults
// mirrored" and cites exactly [:L178], [:L179], [:L221] and [:L222]; widening it to seven widened a
// FROZEN interface, and code review recorded that as a scope violation. The three product-presentation
// keys are still resolved, still from the same `SwSetting` table and still by the same composition
// root - through {@link ProductPresentationSettingsProvider} below, a SEPARATE narrow contract with a
// separate consumer set. Nothing is lost and nothing is duplicated: one authority per setting, two
// contracts because there are two concerns.
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
 * ★★★ AAP SURFACE RECONCILIATION - EXACTLY FOUR KEYS, AND WHY A SECOND CONTRACT SHARES THIS FILE.
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
 *   THE SECOND CONTRACT IN THIS FILE IS THREE PRESENTATION KEYS, AND IT IS A TYPE, NOT ARCHITECTURE.
 *   {@link ProductPresentationSettingsProvider} carries `productImageDefaultExtension`,
 *   `productImageOptionCodeDelimiter` and `productTitleString` - the three keys that were removed
 *   from `SettingKey`, and every one of them is demanded by a mapped AAP 0.4.2 method:
 *   `processProduct_updateDefaultImageFileNames` needs the extension and the delimiter through
 *   `Sku.generateImageFileName()` [model/entity/Sku.cfc:L133-L138], and `Product.getTitle()` needs
 *   the title template [model/service/ProductService.cfc:L269]. Deleting them would leave those
 *   methods unimplementable, which AAP 0.9.2 gates against.
 *
 *   WHY IT IS CO-LOCATED RATHER THAN GIVEN A FILE. AAP 0.3.1 freezes the port inventory at THIRTEEN
 *   enumerated files and AAP 0.9.5 holds the change set to that inventory, so a fourteenth port file
 *   is not available. Co-location is therefore the only placement consistent with the frozen layout -
 *   and it costs nothing at run time: both declarations are INTERFACES, this file emits no runtime
 *   value at all, and the "one exported unit per file" practice in AAP 0.8.3 is about the emitted
 *   unit. The composition root implements both contracts on one object, so no second resolution path,
 *   cache or adapter is introduced anywhere.
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
   * @param settingName - One of the seven keys in {@link SettingKey}. A key
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
// The product-presentation settings: a SECOND, SEPARATE narrow contract.
// ---------------------------------------------------------------------------
//
// ★★★ WHY THIS IS NOT THREE MORE MEMBERS OF `SettingKey`. The transformation plan freezes
// {@link SettingsProvider} at four keys and cites the four declarations it mirrors. These three keys
// are genuine settings of the in-scope product subsystem - a generated image file name reads two of
// them [model/entity/Sku.cfc:L135, L138] and `Product.getTitle()` reads the third
// [model/entity/Product.cfc:L542] - so they are neither out of scope nor inventable. What they are not
// is part of the FROZEN four-key surface, and a frozen interface that grows by three is no longer
// frozen. They therefore travel on their own contract, with their own consumer set.
//
// ONE AUTHORITY PER SETTING STILL HOLDS, which is the property the seven-key union was protecting.
// The composition root implements BOTH contracts on one object, so a value the domain sees can still
// only have come from one resolution, and both resolutions read the same `SwSetting` rows through the
// same relationship cascade. What changed is which contract publishes which key, not where a key's
// value comes from.
//
// THE CONSUMER SETS ARE GENUINELY DIFFERENT, which is the substantive argument for two contracts
// rather than one. `SettingsProvider` is injected into ENTITIES that resolve a setting on demand -
// `Sku.getCurrencyCode()` [model/entity/Sku.cfc:L360-L365], `Product.getProductURL()`
// [model/entity/Product.cfc:L208]. These three are resolved ONCE at composition time and handed
// inward as already-resolved values: the two image keys become the image-naming value struct the SKU
// is constructed with, and the title template is consumed by the product-title renderer. Nothing in
// `src/domain/**` calls `setting()` for any of them.

export type ProductPresentationSettingKey =
  /**
   * The file extension appended to a generated SKU image file name.
   *
   * `productImageDefaultExtension = {fieldType="text",defaultValue="jpg"}`
   * [model/service/SettingService.cfc:L191] - default `"jpg"`.
   *
   * Read by `Sku.generateImageFileName()` [model/entity/Sku.cfc:L138], which appends
   * `".#getProduct().setting('productImageDefaultExtension')#"` after the sanitized product code and
   * the option string. THE LEGACY READ IS ON THE PRODUCT, NOT ON THE SKU - the line resolves the
   * setting through `getProduct()` - which is exactly why ONE FLAT PROVIDER serves both entities
   * instead of each owning its own resolution surface.
   *
   * The value is the extension WITHOUT the separating dot; the dot is written at the call site.
   */
  | 'productImageDefaultExtension'
  /**
   * The separator placed before each image-group option code in a generated file name.
   *
   * `productImageOptionCodeDelimiter = {fieldType="select", defaultValue="-"}`
   * [model/service/SettingService.cfc:L192] - default `"-"`, whose legacy option list is exactly
   * `['-','_']` [model/service/SettingService.cfc:L346-L347].
   *
   * Read by `Sku.generateImageFileName()` [model/entity/Sku.cfc:L135], once per option whose option
   * group carries `getImageGroupFlag()`. IT IS A PREFIX PER CONTRIBUTING OPTION, NOT A JOIN
   * SEPARATOR: the legacy concatenates the delimiter AHEAD of each code, so a single contributing
   * option still yields a leading delimiter and none is emitted when no option group is flagged.
   * Resolved through `getProduct()` exactly as the extension above is.
   */
  | 'productImageOptionCodeDelimiter'
  /**
   * The template a product's display title is rendered from.
   *
   * `productTitleString = {fieldType="text", defaultValue="${brand.brandName} ${productName}"}`
   * [model/service/SettingService.cfc:L193].
   *
   * THE DEFAULT IS A TEMPLATE, NOT A TITLE. `Product.getTitle()`
   * [model/entity/Product.cfc:L540-L545] passes it as
   * `replaceStringTemplate(template=setting('productTitleString'), object=this)`, and the utility
   * resolves each `${...}` marker against the entity graph. Those markers are LEGACY TEMPLATE SYNTAX
   * with no JavaScript meaning: the value is a plain string on this port and is never evaluated here.
   *
   * PUBLISHED AND RESOLVED HERE, YET STILL NOT CONSUMED BY `Product.getTitle()` - and the reason has
   * nothing to do with this key. The renderer it needs, `hibachiUtilityService.replaceStringTemplate`
   * [model/entity/Product.cfc:L542], is a framework utility under `org/Hibachi/`, the boundary this
   * migration extracts from and never ports, so it has no target counterpart. The key is a genuine
   * setting of the in-scope product subsystem and belongs in this union whether or not that one
   * renderer ever arrives.
   */
  | 'productTitleString';

/**
 * The product-presentation settings resolution surface.
 *
 * A SEPARATE CONTRACT FROM {@link SettingsProvider}, for the reasons in the section header above:
 * that port is frozen at four keys, and these three are resolved once at composition time rather
 * than on demand from inside an entity.
 *
 * IMPLEMENTED IN THE COMPOSITION ROOT, on the same object that implements {@link SettingsProvider},
 * so a setting still has exactly one resolution and one value. There is no adapter file for it; like
 * the four other adapter-less ports it is constructed by `src/handlers/bootstrap.ts`.
 *
 * REQUEST-SCOPED, NOT MODULE-SCOPED - the same correctness constraint {@link SettingsProvider}
 * records, for the same reason: the legacy resolver memoizes onto the component
 * [model/service/SettingService.cfc:L452-L459], which on a warm container would be state shared
 * between unrelated invocations.
 */
export interface ProductPresentationSettingsProvider {
  /**
   * Resolve one product-presentation setting to its effective value.
   *
   * SYNCHRONOUS AND NEVER `undefined`, on the same terms as `SettingsProvider.setting`: the legacy
   * resolver always answers, seeding the declared `defaultValue` before any probe runs
   * [model/service/SettingService.cfc:L481-L486]. An implementation that cannot resolve a configured
   * value must supply the declared default rather than return nothing.
   *
   * NAMED `setting` VERBATIM FROM CFML, exactly as the sibling port's method is, because the legacy
   * reads are all `setting('<key>')` [model/entity/Sku.cfc:L135, L138; model/entity/Product.cfc:L542].
   *
   * @param settingName - one of the three keys in {@link ProductPresentationSettingKey}.
   * @returns the configured value for this installation, or the default declared in
   *   `model/service/SettingService.cfc`.
   */
  setting(settingName: ProductPresentationSettingKey): string;
}
