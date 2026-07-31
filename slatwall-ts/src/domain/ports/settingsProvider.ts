// ---------------------------------------------------------------------------
// slatwall-ts - the settings resolver port
//
// PURPOSE
//   One synchronous, injected, string-returning resolver over a CLOSED union of
//   seven setting keys. The legacy platform reads a setting four different ways;
//   all four collapse into this single flat port. It takes a key and returns a
//   value, full stop. It is NOT an entity-graph traversal.
//
// THE FOUR LEGACY SURFACES THIS ONE PORT REPLACES
//   (a) a bare `setting(...)` inherited on the component itself
//         declared [model/entity/HibachiEntity.cfc:L129]
//         used     [model/entity/Product.cfc:L208], [model/entity/Sku.cfc:L373]
//         the `this.setting(...)` spelling at [model/entity/Sku.cfc:L362] is the
//         same surface reached through the public scope of the same component
//   (b) `getHibachiScope().setting(...)`
//         declared [model/transient/HibachiScope.cfc:L201]
//         used     [model/service/ImageService.cfc:L85-L86]
//         also the shape the one legacy assertion uses, through the request
//         scope: [meta/tests/unit/entity/ProductTest.cfc:L61]
//   (c) the injected `settingService` collaborator
//         declared e.g. [model/service/OrderService.cfc:L62]
//         resolved by  [model/service/SettingService.cfc:L443]
//   (d) `<associatedEntity>.setting(...)` - a SKU reading a PRODUCT's setting
//         used     [model/entity/Sku.cfc:L135], [model/entity/Sku.cfc:L138]
//
//   Collapsing them loses nothing. Surfaces (a), (b) and (d) are each a
//   one-line delegation to the same `SettingService.getSettingValue()`, and the
//   only thing that distinguished them was WHICH object was handed over as the
//   relationship context. Resolving that context is the adapter's job, behind
//   this port, not the domain's.
//
//   The legacy signature is `setting(required string settingName, array
//   filterEntities=[], formatValue=false)` [model/entity/HibachiEntity.cfc:L129].
//   The two trailing arguments are absent here because NO in-scope call site
//   passes either one - verified across every `setting(` site in
//   [model/entity/Sku.cfc] and [model/entity/Product.cfc] and across the six
//   in-scope services. So the one-parameter form is exact parity for the
//   in-scope surface, not a narrowing of it, and no signature-reshaping budget
//   is spent here. For the same reason the sibling helper `getSettingDetails()`
//   [model/entity/HibachiEntity.cfc:L134] has no counterpart on this port: no
//   in-scope call site reaches for it.
//
// THIS MODULE EMITS NO RUNTIME JAVASCRIPT
//   Interfaces and type aliases only. No class, no `const`, no function body,
//   no object literal of defaults, and no `enum` - a TypeScript `enum` would
//   emit a runtime object, which is precisely why the key vocabulary is a
//   string-literal union instead. Compiled, this file yields nothing but the
//   `export {}` marker that keeps it a module. That is the defining property of
//   `src/domain/ports/**`: if anything else appears in the emit, the file is
//   wrong.
//
// THIS FILE IMPORTS NOTHING
//   `src/domain/**` may import only from `src/domain/**` and `src/lib/**`, and
//   the `slatwall-ts/domain-layer-boundary` block in `eslint.config.mjs` makes a
//   reach into `src/repositories/**`, `src/handlers/**`, `src/integrations/**`,
//   or into `mysql2` / `dotenv` / `aws-lambda` / `@aws-sdk/**`, a build failure
//   rather than a review comment. This port needs none of it: zero import
//   statements, and therefore no runtime edge into any other module.
//
//   Two omissions are deliberate rather than incidental. `src/lib/config.ts` is
//   STATIC PROCESS CONFIGURATION and must never serve as a settings resolver -
//   ending that conflation is why this port exists. And `decimal.js` is an
//   implementation detail of the `Money` value object, never of a port; no key
//   in this closed set is monetary, so no monetary type appears here at all.
//
// WHO IMPLEMENTS IT
//   Nothing inside `src/domain/**` ever does; the domain declares ports and
//   consumes them. `src/repositories/mysql/**` holds adapters for the six
//   repository ports only, so this port has no adapter file anywhere in the
//   target layout - it is one of the seven whose only legal implementation home
//   is the composition root, `src/handlers/bootstrap.ts`. That is also where the
//   legacy default values are supplied. Keeping every default there and out of
//   the domain is the whole point: it is why `"USD"` lives at
//   [model/service/SettingService.cfc:L221] and nowhere in
//   [model/entity/Sku.cfc].
//
// THESE NAMES ARE CANONICAL
//   Every subtree that will consume this port - entities, services,
//   repositories, handlers, integrations - is empty as this file is written, so
//   no downstream import error can correct a name chosen here. The interface
//   name, the method name `setting`, and the seven key strings are published as
//   final. Interface parity is the acceptance contract, so the method keeps its
//   verbatim CFML name rather than becoming `get`, `getSetting` or `resolve`,
//   and each key is the legacy key string character for character.
//
// THE VOCABULARY IS CLOSED AT SEVEN KEYS
//   Four are named in the transformation plan - `globalURLKeyProduct` [L178],
//   `globalURLKeyProductType` [L179], `skuCurrency` [L221] and
//   `skuEligibleCurrencies` [L222]. Three more are here because in-scope entity
//   methods genuinely reach for them and would otherwise need a second
//   resolution path: `productImageDefaultExtension` [L191] and
//   `productImageOptionCodeDelimiter` [L192], read by
//   `Sku.generateImageFileName()` [model/entity/Sku.cfc:L135, L138], and
//   `productTitleString` [L193], read by `Product.getTitle()`
//   [model/entity/Product.cfc:L542].
//
//   An eighth key is a scope violation. These are deliberately EXCLUDED, each
//   because its only consumer sits outside this slice:
//     skuAllowBackorderFlag         [model/service/SettingService.cfc:L219]
//                                   reached only from the out-of-scope
//                                   inventory branch at
//                                   [model/entity/Product.cfc:L552]
//     globalURLKeyBrand             [L177] - adjacent, but out of scope
//     imageAltString                [L183] - image branches only,
//     imageMissingImagePath         [L184]   [model/entity/Sku.cfc:L159-L165,
//                                            L199]
//     globalAssetsImageFolderPath   [L164] - [model/entity/Product.cfc:L224]
//     skuEligibleFulfillmentMethods [L223] - [model/entity/Sku.cfc:L452]
//     globalDateFormat              [L163] - [model/entity/Sku.cfc:L462-L472]
//     productDisplayTemplate        [L190] - [model/entity/Product.cfc:L217];
//                                   note it declares no `defaultValue` at all
//   An entity method needing one of these is omitted with a documented comment
//   in the entity layer instead. Do not add the key here to make it compile.
//
//   Closing the union is only possible because every in-scope call site names
//   its key with a literal. The dynamic form does exist in the legacy source -
//   `getProduct().setting("productImage#thisSize#Width")`
//   [model/entity/Sku.cfc:L184-L185, L212-L213] composes the key from a
//   variable - but exclusively inside the out-of-scope image-sizing branches
//   that the image-store stub port stands in for. So no dynamic-key overload or
//   escape hatch is offered, and a key outside the union is a compile error,
//   which is the entire point of declaring it.
//
//   CFML setting names are matched case-insensitively; TypeScript literals are
//   not. The union therefore fixes ONE canonical spelling per key - the spelling
//   at the legacy declaration - so no case-variant lookup can arise in the
//   target. Any case folding a real settings store needs belongs to the adapter
//   behind this port.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that and nothing more. No rule is
//   invented to fill the gap, no file enters scope by rule mandate, and the
//   absence is not treated as license to lower the bar: the enterprise
//   substitute standard applies at full strength - maximal strictness, no `any`
//   and no suppression comment, one exported unit plus its supporting type, no
//   barrel, no default baked into a domain file as a literal, and every
//   judgment call annotated where it was made.
//
// TEST COVERAGE IS NET-NEW
//   Not parity, and it must never be presented as parity. No legacy test
//   touches `SettingService` at all - `meta/tests/unit/service/` holds only
//   AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
//   UtilityRBServiceTest. Only three legacy suites touch this slice anywhere:
//   [meta/tests/unit/entity/BrandTest.cfc],
//   [meta/tests/unit/entity/ProductTest.cfc], and
//   [meta/tests/functional/admin/entity/ProductTest.cfc], which is an empty
//   stub - a component declaration with no test methods - and so contributes
//   nothing. The single legacy assertion that transitively touches a key in this
//   union does so through the entity, not through this port:
//   `productUrlIsCorrectlyFormatted()` [meta/tests/unit/entity/ProductTest.cfc:L58-L61]
//   expects `/<globalURLKeyProduct>/nike-air-jorden/`. Tests live in
//   `slatwall-ts/tests/**` and are authored separately; none is written here.
// ---------------------------------------------------------------------------

/**
 * The closed vocabulary of settings this slice may resolve.
 *
 * Seven members, in the order they are declared in
 * `model/service/SettingService.cfc`. A string outside this union is a compile
 * error by design: the legacy engine would have thrown at runtime instead, since
 * `getSettingDetails()` raises "You have asked for a setting with an invalid
 * prefix" for an unrecognized prefix [model/service/SettingService.cfc:L513].
 *
 * Declarations are quoted exactly as they appear in the source, including the
 * inconsistent spacing after the comma, so a reviewer can diff them against the
 * cited line without allowing for normalization.
 */
export type SettingKey =
  /**
   * URL key segment for a product detail page.
   *
   * `globalURLKeyProduct = {fieldType="text",defaultValue="sp"}`
   * [model/service/SettingService.cfc:L178] - default `"sp"`.
   *
   * Read by `Product.getProductURL()` [model/entity/Product.cfc:L208], which
   * returns `"/#setting('globalURLKeyProduct')#/#getURLTitle()#/"`, and by
   * `Product.getListingProductURL()` [model/entity/Product.cfc:L212], which
   * returns the same value without the leading slash. This is the one entity
   * method carrying legacy coverage, so the key's spelling and its default are
   * both pinned by an existing assertion
   * [meta/tests/unit/entity/ProductTest.cfc:L58-L61].
   */
  | 'globalURLKeyProduct'
  /**
   * URL key segment for a product-type page.
   *
   * `globalURLKeyProductType = {fieldType="text",defaultValue="spt"}`
   * [model/service/SettingService.cfc:L179] - default `"spt"`.
   *
   * Resolved at the service tier, alongside `globalURLKeyProduct`, when a
   * product-type URL is built. No in-scope ENTITY reads it: there is no
   * `setting('globalURLKeyProductType')` call site anywhere under
   * `model/entity/`. Its only non-admin legacy consumer is the out-of-scope
   * CMS bridge [integrationServices/mura/model/handler/MuraEventHandler.cfc:L108-L109],
   * which is not ported. It is published here because the transformation plan
   * names it as one of this port's keys, and because the product-type save path
   * is in scope.
   */
  | 'globalURLKeyProductType'
  /**
   * File extension appended to a generated SKU image file name.
   *
   * `productImageDefaultExtension = {fieldType="text",defaultValue="jpg"}`
   * [model/service/SettingService.cfc:L191] - default `"jpg"`.
   *
   * Read by `Sku.generateImageFileName()` [model/entity/Sku.cfc:L138], where it
   * is interpolated as the suffix after the product code and the option string.
   * Note the surface: a SKU resolves it through its associated product,
   * `getProduct().setting(...)`, which is legacy surface (d) above. The value is
   * a bare extension with no leading dot - the dot is written by the call site.
   */
  | 'productImageDefaultExtension'
  /**
   * Separator placed before each image-bearing option code in that file name.
   *
   * `productImageOptionCodeDelimiter = {fieldType="select", defaultValue="-"}`
   * [model/service/SettingService.cfc:L192] - default `"-"`.
   *
   * Read by `Sku.generateImageFileName()` [model/entity/Sku.cfc:L135], once per
   * option whose option group carries `getImageGroupFlag()`, again through
   * `getProduct().setting(...)`. It is a single delimiter character, not a list.
   */
  | 'productImageOptionCodeDelimiter'
  /**
   * Template from which a product's display title is composed.
   *
   * `productTitleString = {fieldType="text", defaultValue="${brand.brandName} ${productName}"}`
   * [model/service/SettingService.cfc:L193] - default
   * `"${brand.brandName} ${productName}"`.
   *
   * Read by `Product.getTitle()` [model/entity/Product.cfc:L542] and handed
   * straight to `hibachiUtilityService.replaceStringTemplate(template=..., object=this)`.
   *
   * The `${...}` placeholders belong to the VALUE, not to this port's contract.
   * This port returns the template UNEXPANDED, exactly as legacy `setting()`
   * does; substituting property values against a product is the consumer's
   * work. Do not interpolate here, and do not mistake the value for a finished
   * label.
   */
  | 'productTitleString'
  /**
   * The base currency a SKU's own price columns are denominated in.
   *
   * `skuCurrency = {fieldType="select", defaultValue="USD"}`
   * [model/service/SettingService.cfc:L221] - default `"USD"`.
   *
   * THE `"USD"` DEFAULT LIVES AT THAT DECLARATION AND NOWHERE IN THE ENTITY.
   * `Sku.getCurrencyCode()` [model/entity/Sku.cfc:L360-L365] memoizes
   * `this.setting('skuCurrency')` and has no literal fallback of any kind -
   * there is no `"USD"` anywhere in `Sku.cfc`. Reproducing the default as an
   * entity-side literal would move the decision out of configuration and change
   * what a differently configured installation charges.
   *
   * Read again three times inside the currency cascade: as the step-1
   * base-currency comparison [model/entity/Sku.cfc:L385], and as the step-3
   * conversion source [model/entity/Sku.cfc:L418, L422, L425]. Preserving the
   * cascade exactly is a must-preserve requirement, so this key's name and
   * default are load-bearing on price.
   *
   * Deliberately typed as a plain `string`, NOT a branded currency-code type:
   * the published entity signature is `Sku.getCurrencyCode(): string`, and a
   * branded return here would contradict it.
   */
  | 'skuCurrency'
  /**
   * The currencies a SKU may be priced in - and the GATE on the whole cascade.
   *
   * `skuEligibleCurrencies = {fieldType="listingMultiselect", listingMultiselectEntityName="Currency", defaultValue=getCurrencyService().getAllActiveCurrencyIDList()}`
   * [model/service/SettingService.cfc:L222].
   *
   * STEP 0, THE GATE. `Sku.getCurrencyDetails()` wraps its entire body -
   * [model/entity/Sku.cfc:L374-L430], every one of the cascade's three steps -
   * in `if(len(setting('skuEligibleCurrencies')))` [model/entity/Sku.cfc:L373].
   * When that resolves empty the memo initialized at
   * [model/entity/Sku.cfc:L369] stays `{}`, and because
   * `getPriceByCurrencyCode`, `getListPriceByCurrencyCode` and
   * `getRenewalPriceByCurrencyCode` [model/entity/Sku.cfc:L269-L285] have no
   * `else` and no fallback, EVERY price accessor on the SKU then yields nothing.
   * A port that drops the gate, or that returns a non-empty stand-in when the
   * setting is genuinely empty, changes prices.
   *
   * THE DEFAULT IS RUNTIME-COMPUTED, NOT A LITERAL:
   * `getCurrencyService().getAllActiveCurrencyIDList()` is a live data lookup,
   * which sits awkwardly against a synchronous resolver. The resolution is
   * one-sided and binding: THE COMPOSITION ROOT, `src/handlers/bootstrap.ts`,
   * MUST RESOLVE THIS DEFAULT EAGERLY - before the provider instance is handed
   * to the domain layer - so that `setting()` can stay synchronous. That is the
   * same "materialize at the boundary" discipline the SKU currency-detail map
   * uses. This key therefore gains no `async` variant, no second method, no
   * initialization hook and no promise-returning overload; see the matching note
   * on {@link SettingsProvider} and on its `setting` method.
   *
   * THE VALUE IS A RAW COMMA-DELIMITED LIST, and it is returned as such for
   * signature parity: [model/entity/Sku.cfc:L375] hands it straight to
   * `addInFilter('currencyCode', ...)` without splitting it. Parsing belongs to
   * the consumer, using the CFML list helpers in `src/lib/cfml/`. There is
   * deliberately no `string[]` convenience accessor on this port.
   */
  | 'skuEligibleCurrencies';

/**
 * The settings resolution surface the domain depends on.
 *
 * Constructor-injected into every entity and service that reads a setting,
 * replacing all four legacy resolution surfaces listed in the file header. The
 * domain never resolves a setting any other way, and in particular never reads
 * process configuration or an environment variable to obtain one.
 *
 * IMPLEMENTED IN THE COMPOSITION ROOT. There is no adapter file for this port
 * anywhere in the target layout - `src/repositories/mysql/**` implements the six
 * repository ports only - so `src/handlers/bootstrap.ts` constructs the instance
 * and supplies the legacy defaults, then hands the finished provider inward.
 *
 * THE COMPOSITION ROOT MUST RESOLVE EVERY RUNTIME-COMPUTED DEFAULT EAGERLY,
 * before the provider instance reaches the domain layer. Exactly one key needs
 * this: `skuEligibleCurrencies` declares its default as
 * `getCurrencyService().getAllActiveCurrencyIDList()`
 * [model/service/SettingService.cfc:L222], a live data lookup rather than a
 * literal. Resolving it up front is what allows `setting()` below to remain
 * synchronous, and it is the ONLY sanctioned answer to that tension - this port
 * gains no `async` variant, no second method, no initialization hook and no
 * promise-returning overload.
 *
 * REQUEST-SCOPED, NOT MODULE-SCOPED. The legacy resolver memoizes into
 * `variables.settingDetailsCache` on the component
 * [model/service/SettingService.cfc:L452-L459], which on a warm container would
 * become state shared between unrelated invocations. Any caching an
 * implementation does must therefore live on the per-request instance, so that
 * one request can never observe a value resolved for another. This is a
 * correctness constraint on where the state lives, not a tuning choice.
 */
export interface SettingsProvider {
  /**
   * Resolve one setting to its effective value.
   *
   * SYNCHRONOUS, DELIBERATELY. Not `async`, and it does not return a promise.
   * `Sku.getCurrencyDetails()` reads the gate at [model/entity/Sku.cfc:L373] from
   * a synchronous body, and the SKU's currency accessors -
   * `getPriceByCurrencyCode`, `getListPriceByCurrencyCode`,
   * `getRenewalPriceByCurrencyCode` - are published as synchronous. A promise
   * here would cascade `async` into all of them and break that published
   * contract, so the async boundary is drawn at the repository, never here.
   *
   * That constraint meets a real complication in exactly one key.
   * `skuEligibleCurrencies` declares a RUNTIME-COMPUTED default -
   * `getCurrencyService().getAllActiveCurrencyIDList()`
   * [model/service/SettingService.cfc:L222] - which is a live data lookup rather
   * than a literal. THE COMPOSITION ROOT MUST RESOLVE IT EAGERLY, before this
   * provider is handed to the domain layer, so that this method can stay
   * synchronous. That is the same "materialize at the boundary" discipline the
   * SKU currency-detail map uses. It is the whole solution: this port gains no
   * `async` variant, no second method, no initialization hook and no
   * promise-returning overload.
   *
   * NEVER RETURNS UNDEFINED, and the return type says so. Legacy `setting()`
   * always resolves to the declared default: `getSettingDetails()` initializes
   * `settingValue` to `""` [model/service/SettingService.cfc:L473-L479], seeds it
   * from the declared `defaultValue` when one exists
   * [model/service/SettingService.cfc:L481-L486], and `getSettingValue()` returns
   * that field on both its cached and uncached paths
   * [model/service/SettingService.cfc:L459, L465]. Widening this to
   * `string | undefined` would push a null check into every consumer that legacy
   * never had. An implementation that cannot resolve a value must supply the
   * declared default rather than return nothing.
   *
   * ALWAYS A STRING, even where the legacy declaration suggests otherwise. The
   * legacy return type is `any` [model/entity/HibachiEntity.cfc:L129] and the
   * stored value is textual on every path; `skuEligibleCurrencies` in particular
   * arrives as a raw comma-delimited list and is consumed as one
   * [model/entity/Sku.cfc:L375]. Callers that need another shape convert
   * explicitly - list parsing through the CFML helpers in `src/lib/cfml/`,
   * currency arithmetic through `Money` - which keeps every such conversion
   * visible at its call site instead of hidden in a resolver.
   *
   * NAMED `setting` VERBATIM FROM CFML. Interface parity is the acceptance
   * contract for this port, so the method is not renamed to `get`, `getSetting`
   * or `resolve`, and the argument keeps the legacy name `settingName`
   * [model/entity/HibachiEntity.cfc:L129].
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
