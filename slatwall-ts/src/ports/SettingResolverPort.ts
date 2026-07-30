/**
 * Boundary port for platform-configuration reads made by the extracted Slatwall Catalog slice.
 *
 * This is a TYPE-ONLY module. It declares a contract and nothing else: no runtime code, no
 * imports, no input/output, no third-party package. It therefore emits nothing and contributes
 * zero bytes to the Lambda bundle, which is the property that lets the layers above it depend on
 * a settings capability without any of them depending on a settings implementation.
 *
 * LEGACY ORIGINS (reference only; the CFML tree is never modified — AAP §0.4.1.1 / TR-6):
 *   - model/entity/HibachiEntity.cfc:L128-L131 — `setting()`, the single accessor through which
 *     every in-scope entity reads configuration. Its declared return type is CFML's untyped
 *     `any`, and its body is one delegation:
 *       `getService("settingService").getSettingValue(settingName=..., object=this, ...)`
 *     The `object=this` argument is the load-bearing detail — see the RESOLUTION CONTEXT block.
 *   - model/service/SettingService.cfc:L443 — `getSettingValue(required string settingName,
 *     any object, array filterEntities, formatValue=false)`, the effective-value engine that
 *     `setting()` delegates to. Explicitly OUT OF SCOPE — AAP §0.2.2.1 excludes the
 *     `Setting*.cfc` family, which is exactly 3 files: model/entity/Setting.cfc,
 *     model/service/SettingService.cfc and model/dao/SettingDAO.cfc. That exclusion is
 *     precisely why this port exists.
 *   - config/dbdata/SlatwallSetting.xml.cfm — the `SwSetting` seed data. Its `settingValue`
 *     column is declared untyped at L6, and its `productTypeID` / `emailTemplateID` /
 *     `paymentMethodID` columns at L7-L9 are the scoping columns that make resolution
 *     per-object rather than global.
 *
 * REQUIREMENT SATISFIED — IR-2: "A narrow setting-resolution port is unavoidable. The slice
 * reads eighteen distinct configuration keys through `HibachiEntity.setting()`
 * [model/entity/HibachiEntity.cfc:L129], whose effective-value engine lives in the out-of-scope
 * `SettingService`. A typed `SettingResolverPort` covering exactly those keys — including the
 * interpolated `productImage<size>Width` / `productImage<size>Height` form — is required, rather
 * than porting the platform-wide settings engine."
 *
 * The emphasis on NARROW is the whole point. This module models the *contract* — which names may
 * be asked for, against which object, and what shape comes back. It deliberately models none of
 * the resolution *algorithm*: no hierarchy walk, no scoping precedence, no metadata defaults, no
 * caching. All of that stays inside the out-of-scope collaborator and its in-scope adapter.
 *
 * HEXAGONAL POSITION (AAP §0.7.3 S4). `src/ports/` is the innermost declaration layer. This file
 * imports nothing at all: not from `domain/`, and certainly not from `adapters/`, `services/`,
 * `config/`, `validation/`, `integrations/` or `handlers/`, all of which sit above it and would
 * invert the hexagon. It reads no environment variable — `src/config/env.ts` is the only file in
 * the subtree permitted to do that — contains no SQL and no `SwSetting` query, and names no AWS
 * type. Persistence belongs to `src/adapters/settings/StaticSettingResolver.ts`; AWS coupling
 * belongs to `src/handlers/**`.
 *
 * TESTABILITY (AAP §0.7.3 S6). Every declaration below is a plain structural type, so a bare
 * object literal satisfies the port — no class to extend, no abstract base, no registry, no
 * decorator, no framework. That matters because the legacy suite vendored no mocking library at
 * all and instead booted the entire FW/1 application and resolved collaborators through DI/1;
 * AAP §0.4.3.6 calls the difference "the single largest structural difference between the two
 * suites". `test/support/inMemoryRepositories.ts` hand-implements this contract. Coverage for it
 * is NET-NEW: AAP §0.6.5.2 verified that no legacy setting-service test of any kind exists.
 *
 * RULES. `review_rules` reports "No user rules provided." for this project, so zero files enter
 * scope by rule and no rule-derived constraint applies. Per UR4 that is not licence to lower the
 * bar: the nine binding standards of AAP §0.7.3 (S1 strict type safety, S2 parameterized SQL,
 * S3 explicit dependency injection, S4 hexagonal separation, S5 exact-version pinning, S6 one
 * labelled test per converted method, S7 preserve-and-annotate, S8 flag mismatches, S9 invent
 * nothing) govern this file instead, together with the prompt-borne constraints of AAP §0.7.4.
 *
 * NO DEFAULTS ARE SUPPLIED HERE (AAP §0.7.3 S9). Of the eighteen names below, exactly one —
 * `skuEligibleFulfillmentMethods` — is seeded at all, as three `productTypeID`-scoped rows at
 * config/dbdata/SlatwallSetting.xml.cfm:L14-L16. The remaining seventeen have no seeded row and
 * fall back to metadata defaults declared inside the out-of-scope
 * `model/service/SettingService.cfc`. Recording which names fall back, and to what, is
 * `src/adapters/settings/StaticSettingResolver.ts`'s job (AAP §0.4.1.7). This module therefore
 * declares no default, no fallback, no sentinel and no cache policy for any name.
 */

/*
 * THE EIGHTEEN NAMES — how the closed union was derived (AAP §0.8.2 Guideline 6).
 *
 * The figure is not decorative. It comes from an exhaustive census of `setting(` across the six
 * in-scope entity files, the four in-scope service files and the one in-scope view:
 *
 *   model/entity/Product.cfc                              6 calls
 *   model/entity/Sku.cfc                                 21 calls
 *   model/entity/Option.cfc                                1 call
 *   model/service/ProductService.cfc                       4 calls
 *   integrationServices/google/views/feed/product.cfm      2 calls (both on L58)
 *   model/entity/ProductType.cfc                           0
 *   model/entity/Brand.cfc                                 0
 *   model/entity/OptionGroup.cfc                           0
 *   model/service/SkuService.cfc                           0
 *   model/service/BrandService.cfc                         0
 *   model/service/OptionService.cfc                        0
 *
 * Collapsing those 34 calls by name yields 16 distinct literal names plus 2 interpolated forms:
 * 16 + 2 = 18, matching IR-2 exactly. Each literal carries its verified call-site locator below.
 *
 * WHY A CLOSED UNION AND NOT `string` (AAP §0.7.3 S1). The legacy parameter is
 * `required string settingName` [model/entity/HibachiEntity.cfc:L129], so CFML accepted arbitrary
 * text and a misspelling resolved to nothing at runtime — silently, because the names are
 * database row identifiers in `SwSetting.settingName`, not code symbols. Accepting a free-form
 * `string` here would reproduce that failure mode and would defeat IR-2's narrowness outright by
 * letting an out-of-slice name through unnoticed. With the union closed, a typo is a compile
 * error. There is deliberately no `string`-keyed overload and no escape hatch.
 *
 * Every name is reproduced byte-exactly, including its capitalisation, for the same reason: it
 * is a stored identifier, and a near-miss is a silent miss rather than a loud one.
 */

/**
 * The sixteen literal setting names the Catalog slice reads.
 *
 * Ordered exactly as IR-2's key table lists them, so the two can be diffed row by row: the five
 * names `Product` reads, then the eight `Sku` reads, then the two the Google product-feed view
 * reads, then the one `ProductService` reads. 5 + 8 + 2 + 1 = 16. `Option`'s single read shares a
 * name with one of the `Product` reads [model/entity/Option.cfc:L82 and
 * model/entity/Product.cfc:L224], so it appears at the third entry rather than on its own.
 */
export type CatalogSettingName =
  /** model/entity/Product.cfc:L208 (`getProductURL`), L212 (`getListingProductURL`). */
  | 'globalURLKeyProduct'
  /** model/entity/Product.cfc:L217 (`getTemplate`, the fallback branch). */
  | 'productDisplayTemplate'
  /**
   * model/entity/Product.cfc:L224 (`getAlternateImageDirectory`),
   * model/entity/Option.cfc:L82 (`getImageDirectory`),
   * model/service/ProductService.cfc:L200, L201, L240 — the three service reads take the
   * no-entity receiver form described in the RESOLUTION CONTEXT block below.
   */
  | 'globalAssetsImageFolderPath'
  /** model/entity/Product.cfc:L542 (`getTitle`, interpolated by `replaceStringTemplate`). */
  | 'productTitleString'
  /** model/entity/Product.cfc:L552 (`getAllowBackorderFlag`). */
  | 'skuAllowBackorderFlag'
  /** model/entity/Sku.cfc:L135 (`generateImageFileName`, the option-code separator). */
  | 'productImageOptionCodeDelimiter'
  /** model/entity/Sku.cfc:L138 (`generateImageFileName`, the file extension). */
  | 'productImageDefaultExtension'
  /** model/entity/Sku.cfc:L159, L160 (`getResizedImage`, the alt-text template). */
  | 'imageAltString'
  /** model/entity/Sku.cfc:L165 (`getResizedImage`), L199 (`getResizedImagePath`). */
  | 'imageMissingImagePath'
  /**
   * model/entity/Sku.cfc:L362 (`getCurrencyCode`), L385, L418, L422, L425
   * (`getCurrencyDetails`) — five reads, the most of any single name in the slice.
   */
  | 'skuCurrency'
  /** model/entity/Sku.cfc:L373, L375 (`getCurrencyDetails`, the eligibility list). */
  | 'skuEligibleCurrencies'
  /**
   * model/entity/Sku.cfc:L452 (`getEligibleFulfillmentMethods`). The only one of the eighteen
   * with seeded rows: config/dbdata/SlatwallSetting.xml.cfm:L14-L16.
   */
  | 'skuEligibleFulfillmentMethods'
  /** model/entity/Sku.cfc:L462, L470, L472 (`getNextEstimatedAvailableDate`). */
  | 'globalDateFormat'
  /** integrationServices/google/views/feed/product.cfm:L58 (`g:shipping_weight`, the value). */
  | 'skuShippingWeight'
  /** integrationServices/google/views/feed/product.cfm:L58 (`g:shipping_weight`, the unit). */
  | 'skuShippingWeightUnitCode'
  /** model/service/ProductService.cfc:L159 (`processProduct_addProductReview`). */
  | 'productAutoApproveReviewsFlag';

/*
 * THE TWO INTERPOLATED FORMS — and why the size segment stays OPEN.
 *
 * Four call sites build a setting name by interpolation rather than writing it out:
 *   model/entity/Sku.cfc:L184  `getProduct().setting("productImage#thisSize#Width")`
 *   model/entity/Sku.cfc:L185  `getProduct().setting("productImage#thisSize#Height")`
 *   model/entity/Sku.cfc:L212  `getProduct().setting("productImage#arguments.size#Width")`
 *   model/entity/Sku.cfc:L213  `getProduct().setting("productImage#arguments.size#Height")`
 *
 * A TypeScript template-literal type is the exact counterpart of CFML's `#...#` interpolation and
 * keeps the closed-union guarantee at the two ends of the name while leaving the middle open.
 * That openness is required, not convenient:
 *
 * TODO(parity): the two methods that build these names disagree about what the size segment can
 * contain, and the disagreement is carried across rather than repaired (AAP §0.7.3 S7 —
 * preserve and annotate; this file claims no S7 exception, the only declared one in the plan
 * being D18, which belongs to src/adapters/mysql/MySqlProductRepository.ts).
 *
 *   - `getResizedImage` [model/entity/Sku.cfc:L169-L187] lower-cases the incoming size first, at
 *     L171 (`lcase(arguments.size)`) or L174 (`lcase(arguments[1])`), and then runs a ladder at
 *     L177-L183 that maps only "l" to `Large`, "m" to `Medium` and "s" to `Small`. There is NO
 *     final `else`. Any other input therefore reaches L184-L185 unchanged in its lower-cased
 *     form: an incoming size of "XL" emits the name `productImagexlWidth`. The lower case is easy
 *     to miss, because the `lcase` at L171/L174 runs before the ladder and the ladder's three
 *     mapped outcomes are the only ones that get capitalised again.
 *   - `getResizedImagePath` [model/entity/Sku.cfc:L203-L216] lower-cases at L204 and then runs a
 *     ladder at L205-L211 that maps "l" to `Large`, "m" to `Medium` and — critically — has a
 *     final `else` mapping everything else to `Small`. Its L212-L213 reads can consequently only
 *     ever emit `productImageLargeWidth`, `productImageMediumWidth` or `productImageSmallWidth`
 *     and the three `Height` counterparts.
 *
 * So the same `size` input yields two different setting names depending on which method was
 * called. Typing the segment as a closed `'Large' | 'Medium' | 'Small'` union would make the
 * first method's behaviour unrepresentable, which would be a behaviour change rather than an
 * idiom change — forbidden by the Minimal Change Clause (AAP §0.8.1). `${string}` keeps both
 * behaviours expressible and keeps the prefix and suffix compile-checked.
 */

/**
 * A `productImage<size>Width` setting name.
 *
 * The `<size>` segment is intentionally unconstrained — see the parity note above and
 * model/entity/Sku.cfc:L184, L212.
 */
export type ProductImageWidthSettingName = `productImage${string}Width`;

/**
 * A `productImage<size>Height` setting name.
 *
 * The `<size>` segment is intentionally unconstrained — see the parity note above and
 * model/entity/Sku.cfc:L185, L213.
 */
export type ProductImageHeightSettingName = `productImage${string}Height`;

/**
 * The interpolated pair, which IR-2 names as a single form. Declared as a type in its own right
 * because the image-sizing consumers read the two together, always adjacently
 * [model/entity/Sku.cfc:L184-L185, L212-L213].
 */
export type ProductImageDimensionSettingName =
  ProductImageWidthSettingName | ProductImageHeightSettingName;

/**
 * Every setting name the Catalog slice may ask for: the 16 literals of {@link CatalogSettingName}
 * plus the 2 interpolated forms of {@link ProductImageDimensionSettingName}. 16 + 2 = 18, which
 * is the count IR-2 states, so a reviewer can check the figure without recounting the census.
 *
 * The union is closed on purpose. Anything outside the Catalog slice is a compile error here
 * rather than a silent runtime miss, and that is the mechanism by which this port stays narrow.
 */
export type SettingName = CatalogSettingName | ProductImageDimensionSettingName;

/*
 * THE RESOLVED VALUE — why one normalised shape, and where the coercion went
 * (AAP §0.8.2 Guideline 6; AAP §0.7.3 S1 permits "`string` with the coercion documented").
 *
 * The legacy accessor declares its return type as CFML's untyped `any`
 * [model/entity/HibachiEntity.cfc:L129], as does the engine behind it
 * [model/service/SettingService.cfc:L443], so the legacy type carries no information whatsoever.
 * What the legacy STORAGE says is far more useful: `SwSetting.settingValue` is declared without a
 * type at config/dbdata/SlatwallSetting.xml.cfm:L6, and every seeded value at L12-L21 is text.
 *
 * The four in-slice usage shapes are all coercions applied at the point of use, by CFML, on that
 * text — never by the accessor:
 *   - as text, measured: `len(setting('imageAltString'))`
 *     [model/entity/Sku.cfc:L159]
 *   - as a number, by a declared numeric return type:
 *     `public numeric function getAllowBackorderFlag()`
 *     `{ return setting("skuAllowBackorderFlag"); }`
 *     [model/entity/Product.cfc:L551-L552]
 *   - as a boolean, by truthiness in a condition:
 *     `if(arguments.product.setting('productAutoApproveReviewsFlag'))`
 *     [model/service/ProductService.cfc:L159]
 *   - as a delimited list, fed to a list filter:
 *     `addInFilter('currencyCode', setting('skuEligibleCurrencies'))`
 *     [model/entity/Sku.cfc:L375]
 *
 * TypeScript performs none of those coercions implicitly. Declaring a
 * `string | number | boolean` union here would therefore push a narrowing obligation onto every
 * consumer in the subtree — surface the legacy slice never had, and surface that would make the
 * already-committed `src/util/formatting.ts` signatures (`formatDate(value, mask: string)` at
 * L287, `replaceStringTemplate(template: string, ...)` at L419) unsatisfiable without a cast.
 * Declaring the single normalised text shape instead leaves the coercion exactly where CFML put
 * it — at the consumer — and keeps this port assignable to the narrow local resolver interfaces
 * that sibling domain files declare.
 *
 * Normalising whatever the engine hands back into that shape is the adapter's responsibility, not
 * this contract's: `src/adapters/settings/StaticSettingResolver.ts` owns it, along with the
 * metadata-default fallbacks it must document. Consistent with S9 this file names no value, no
 * default and no sentinel, and says nothing about what an unresolved name yields — that too is a
 * property of the out-of-scope engine.
 */

/**
 * The resolved effective value of a setting, in its normalised text shape.
 *
 * Named rather than written inline so the coercion contract has one documented home and one place
 * to change, should a later iteration widen it.
 */
export type SettingValue = string;

/*
 * ⭐ RESOLUTION CONTEXT — S8 DECISION (AAP §0.7.3 S8, AAP §0.8.2 Guideline 6).
 *
 * A bare `(name) => value` resolver would be UNFAITHFUL, and this is the single most important
 * semantic in the file. `setting()` passes `object=this` to the engine on every single call
 * [model/entity/HibachiEntity.cfc:L130], and the engine dispatches on that object's class name to
 * pick a lookup order [model/service/SettingService.cfc:L102-L112, L534], so resolution is
 * per-object and hierarchical rather than a flat global lookup. A census of the receiver forms in
 * the slice found six distinct shapes:
 *
 *   1. bare `setting('x')` — resolves against the enclosing entity, because `object=this`:
 *      model/entity/Product.cfc:L208, L212, L217, L224, L542, L552;
 *      model/entity/Sku.cfc:L159, L160, L165, L199, L373, L375, L452, L462, L470, L472;
 *      model/entity/Option.cfc:L82
 *   2. `this.setting('x')` — the same thing written explicitly:
 *      model/entity/Sku.cfc:L362, L385, L418, L422, L425
 *   3. ⭐ `getProduct().setting('x')` — resolves against the PRODUCT, not the SKU. All six
 *      image-related reads take this form: model/entity/Sku.cfc:L135, L138, L184, L185, L212,
 *      L213. A SKU-scoped global resolver would return the wrong effective value here.
 *   4. `arguments.product.setting('x')` — a service resolving against a passed-in Product:
 *      model/service/ProductService.cfc:L159
 *   5. `local.sku.setting('x')` — a view resolving against a Sku taken from a loop:
 *      integrationServices/google/views/feed/product.cfm:L58
 *   6. `getHibachiScope().setting('x')` — NO entity receiver at all; the request-scope object
 *      stands in: model/service/ProductService.cfc:L200, L201, L240
 *
 * The seed data corroborates per-object scoping independently of the code: `SwSetting` carries
 * `productTypeID`, `emailTemplateID` and `paymentMethodID` scoping columns
 * [config/dbdata/SlatwallSetting.xml.cfm:L7-L9], and the one seeded name of the eighteen,
 * `skuEligibleFulfillmentMethods`, appears as three rows each scoped to a different
 * `productTypeID` and never once globally [config/dbdata/SlatwallSetting.xml.cfm:L14-L16]. A
 * global resolver could not represent that data at all.
 *
 * WHY THE CONTEXT IS OPTIONAL rather than required. Two independent pieces of evidence:
 * form 6 above shows the slice really does read settings with no entity receiver
 * [model/service/ProductService.cfc:L200, L201, L240], and the engine's own signature declares
 * its `object` parameter WITHOUT `required` [model/service/SettingService.cfc:L443]. Omitting the
 * context is therefore a legal, source-evidenced call, not a shortcut. Optionality is also what
 * keeps this port structurally assignable to the narrow single-name resolver interfaces that
 * sibling domain files declare, since it leaves the required arity at one.
 *
 * WHY A DESCRIPTOR RATHER THAN THE ENTITY ITSELF. Passing a whole domain object would drag the
 * `domain/` layer into every port signature and, through the calculated properties of AAP
 * §0.2.2.6, put excluded collaborators back within reach. The pair below is the framework's OWN
 * narrow identity pair: `getEntityName()` with its `'Slatwall'` prefix stripped, and
 * `getPrimaryIDValue()`, are exactly what `HibachiEntity` itself uses to identify an object to a
 * service [model/entity/HibachiEntity.cfc:L121-L122, L143;
 * org/Hibachi/HibachiEntity.cfc:L244-L246, L287-L289]. It is a reduction, not an invention.
 *
 * TODO(boundary): the hierarchical resolution ALGORITHM is deliberately absent from this file. It
 * lives in the out-of-scope collaborator `model/service/SettingService.cfc`, which AAP §0.2.2.1
 * excludes along with the rest of the `Setting*.cfc` family, and it is substantial:
 *   - the lookup order is declared as data at model/service/SettingService.cfc:L102-L112, keyed by
 *     the resolving object's class name — `sku` walks to `product.productID`, then to the
 *     product's product-type path combined with its brand, then to the product-type path alone
 *     [L104]; `product` walks to its product-type path with brand, then to the path alone [L105];
 *     `productType` walks to `productTypeIDPath` [L106]
 *   - that order is applied by a do-while walk at model/service/SettingService.cfc:L534-L591,
 *     dispatched on `arguments.object.getClassName()` at L534 — which is exactly why the context
 *     below carries an entity kind rather than only an identifier
 *   - a per-name metadata block supplies fallbacks and value formatting when no row matches, and a
 *     request-scoped cache short-circuits the whole walk for names beginning "global" and for
 *     non-persistent objects [model/service/SettingService.cfc:L446-L451]
 *
 * Per TR-5 the port is declared, the gap is flagged here, and the member is not quietly dropped
 * from the interface; the in-scope implementation of that gap is
 * `src/adapters/settings/StaticSettingResolver.ts`. Reproducing any of the above here would cross
 * from contract into implementation and would contradict IR-2's rejection of porting the
 * platform-wide settings engine.
 */

/**
 * The kinds of object the slice resolves settings against.
 *
 * Exactly three, each evidenced by a real receiver in the census above — `Product`, `Sku` and
 * `Option`. `ProductType`, `Brand` and `OptionGroup` are deliberately absent: the census found
 * zero `setting(` calls in model/entity/ProductType.cfc, model/entity/Brand.cfc and
 * model/entity/OptionGroup.cfc, so listing them would be invented surface (AAP §0.7.3 S9).
 *
 * `Option` is worth a word, because it is the one kind with no hierarchy behind it. The engine's
 * lookup-order table declares entries for `sku`, `product` and `productType` but none for an
 * option [model/service/SettingService.cfc:L102-L112], and the single option read is of a
 * `global`-prefixed name [model/entity/Option.cfc:L82] which the engine short-circuits before any
 * walk [model/service/SettingService.cfc:L446-L448]. It appears here because it is a real receiver
 * in the slice, not because it brings a hierarchy.
 *
 * The names match the legacy entity names with the `'Slatwall'` prefix stripped, which is the same
 * reduction `HibachiEntity` applies at model/entity/HibachiEntity.cfc:L143, and they line up
 * one-for-one with the target domain classes in `src/domain/**`. The engine's own table keys the
 * same kinds with a lower-case initial [model/service/SettingService.cfc:L104-L106]; CFML struct
 * keys are case-insensitive, so the difference is presentation, and the capitalised form is chosen
 * to read as the target class names do.
 */
export type SettingResolutionEntityName = 'Product' | 'Sku' | 'Option';

/**
 * Identifies the object a setting is resolved against — the port's stand-in for the legacy
 * `object=this` argument at model/entity/HibachiEntity.cfc:L130.
 *
 * Both members are readonly because a resolution context describes a receiver; it is never a
 * mutable accumulator.
 */
export interface SettingResolutionContext {
  /** Which kind of object is resolving. See {@link SettingResolutionEntityName}. */
  readonly entityName: SettingResolutionEntityName;
  /**
   * That object's primary identifier — the counterpart of `getPrimaryIDValue()`
   * [org/Hibachi/HibachiEntity.cfc:L244-L246], which the legacy schema stores as a 32-character
   * string (IR-6).
   */
  readonly entityId: string;
}

/*
 * ⭐⭐ SYNCHRONY — S8 DECISION, EXECUTION-MODEL MISMATCH M8
 * (AAP §0.6.6 M8; AAP §0.7.3 S8; AAP §0.8.2 Guideline 6).
 *
 * The accessor below is synchronous. It returns a plain value, it is not `async`, and it does not
 * return a promise. That is a recorded decision, not an oversight, and this file is one of only
 * two in the subtree that owns an execution-model mismatch declaration from AAP §0.6.6.
 *
 * THE MISMATCH. The out-of-scope `SettingService` does not confine itself to request-scoped work:
 * `SettingService.updateStockCalculated` [model/service/SettingService.cfc:L717] launches a named
 * out-of-band thread — `thread action="run" name="updateStockThread"` at
 * model/service/SettingService.cfc:L722, reached from L918 and L954. A persistent ColdFusion or
 * Railo application server can carry such a thread past the end of the request that started it; a
 * single stateless Lambda invocation cannot, because nothing survives the invocation except
 * module-scope state on a warm container. AAP §0.6.6 M8 records the consequence verbatim:
 * "it constrains the `SettingResolverPort` contract, which is declared synchronous so no caller in
 * the slice depends on background completion."
 *
 * THE DECISION AND WHY IT IS THE RIGHT ONE. Declaring the accessor promise-returning would leak
 * that mismatch outward into every consumer in the subtree. It would make `Product.getProductURL`,
 * `Product.getTemplate`, `Sku.getCurrencyCode`, `Option.getImageDirectory` and their peers
 * asynchronous — members that are plain synchronous property getters in the legacy source
 * [model/entity/Product.cfc:L207-L209, L215-L221; model/entity/Sku.cfc:L360-L365;
 * model/entity/Option.cfc:L81-L83] — and it would force `await` into `src/domain/**` files whose
 * contracts forbid input/output altogether. The Google feed view would inherit it too, since it
 * reads two settings inline while rendering
 * [integrationServices/google/views/feed/product.cfm:L58]. A synchronous contract keeps all of
 * that faithful: no in-slice caller can come to depend on background completion, because the
 * contract gives it nothing to wait on. The already-committed `src/util/formatting.ts` states the
 * same conclusion from the consuming side at its L35-L39.
 *
 * WHAT SYNCHRONY DOES *NOT* CLAIM. It says nothing about how an implementation obtains values, and
 * it fixes no timing, cache lifetime, retry count or budget of any kind — S9 forbids inventing
 * such numbers, and none appears anywhere in this file. An implementation that needs input/output
 * to populate itself performs that work before the graph is wired, in
 * `src/adapters/settings/StaticSettingResolver.ts` and `src/config/container.ts`, so that the read
 * itself is a pure lookup.
 */

/*
 * MEMBERS DELIBERATELY NOT PORTED (AAP §0.7.3 S7 / S9 — annotate the omission, invent no surface).
 *
 * 1. `filterEntities` and `formatValue`. The legacy accessor declares three parameters —
 *    `setting(required string settingName, array filterEntities=[], formatValue=false)` at
 *    model/entity/HibachiEntity.cfc:L129 — but the census of all 34 in-slice call sites found that
 *    every single one passes the setting name and nothing else. Neither optional parameter is ever
 *    supplied anywhere in the slice. Declaring them would be modelling surface no caller uses, so
 *    the port takes the name and the resolution context only. Should a later slice need value
 *    formatting, `formatValue` reaches the same engine through
 *    model/service/SettingService.cfc:L443 and can be added then, with a call site to justify it.
 *
 * 2. `getSettingDetails()`. It sits immediately below `setting()` on the same class at
 *    model/entity/HibachiEntity.cfc:L134-L136, forwarding to
 *    model/service/SettingService.cfc:L468, and it returns the metadata *about* a setting rather
 *    than its value. The census found ZERO in-scope call sites, so it is deliberately absent. This
 *    is recorded rather than left silent so its absence reads as a decision rather than an
 *    oversight.
 *
 * 3. `getURLFromPath()`. Two of the reads catalogued above feed their result straight into it —
 *    model/entity/Product.cfc:L224 and model/entity/Option.cfc:L82, both wrapping
 *    `setting('globalAssetsImageFolderPath')` — which makes it look like a settings concern. It is
 *    not: it is a pure string transform over an already-resolved value, defined at
 *    org/Hibachi/HibachiObject.cfc:L83-L91, with no setting read and no input/output of its own. It
 *    belongs with the consumers that call it, not in this contract.
 */

/**
 * The contract through which the Catalog slice reads platform configuration.
 *
 * This is the in-scope replacement for `HibachiEntity.setting()`
 * [model/entity/HibachiEntity.cfc:L128-L131] and, behind it, for the out-of-scope effective-value
 * engine `SettingService.getSettingValue()` [model/service/SettingService.cfc:L443]. The legacy
 * member name is preserved so interface parity stays checkable name-by-name (TR-1), and the
 * argument order follows the legacy order: the setting name first, the resolving object second.
 *
 * Declared as a single-method structural interface on purpose, and every part of that shape is
 * load-bearing:
 *   - A METHOD rather than a property-with-function-type, so parameter types stay bivariant and a
 *     sibling that narrows the name to a single literal — as `src/domain/option/Option.ts` does
 *     for `'globalAssetsImageFolderPath'`, its only read [model/entity/Option.cfc:L82] — still
 *     accepts a full implementation of this port.
 *   - The context parameter OPTIONAL, which holds the required arity at one so that same
 *     narrowing stays structurally satisfied, and which is itself source-evidenced: see the
 *     RESOLUTION CONTEXT block above, model/service/ProductService.cfc:L200 and
 *     model/service/SettingService.cfc:L443.
 *   - No class, no abstract base, no registry and no service locator, so wiring is plain
 *     constructor or parameter injection performed once in `src/config/container.ts`
 *     (AAP §0.7.3 S3). The legacy `getService("settingService")` string lookup at
 *     model/entity/HibachiEntity.cfc:L130 disappears rather than being re-created (AAP §0.4.3.2
 *     rule R2), and a bare object literal satisfies the contract in tests (AAP §0.7.3 S6).
 *
 * @example Wiring a consumer against the port, and against a narrowed view of it.
 * ```ts
 * // A service or domain member receives the port and reads a global-scoped name.
 * const urlKey = settings.setting('globalURLKeyProduct');
 *
 * // A Sku reading an image name resolves against its PRODUCT, not against itself —
 * // the behaviour of getProduct().setting(...) at model/entity/Sku.cfc:L184.
 * const width = settings.setting(`productImage${size}Width`, {
 *   entityName: 'Product',
 *   entityId: productId,
 * });
 * ```
 */
export interface SettingResolverPort {
  /**
   * Resolves the effective value of one setting.
   *
   * Synchronous by decision — see the SYNCHRONY block above and AAP §0.6.6 M8.
   *
   * @param settingName One of the eighteen names the slice reads: a {@link CatalogSettingName} or
   *   one of the interpolated {@link ProductImageDimensionSettingName} forms. Closed on purpose,
   *   so an out-of-slice name or a typo is a compile error rather than a silent runtime miss.
   * @param context The object to resolve against — the port's stand-in for the legacy
   *   `object=this` argument [model/entity/HibachiEntity.cfc:L130]. Omit it for the no-entity form
   *   the slice uses at model/service/ProductService.cfc:L200, L201, L240, which the engine's own
   *   non-required `object` parameter permits [model/service/SettingService.cfc:L443].
   *   Implementations must therefore accept its absence; TypeScript's parameter bivariance would
   *   let an implementation declare it required, and such an implementation would still be
   *   accepted here while breaking every caller that legitimately omits it.
   * @returns The resolved value in its normalised text shape. See {@link SettingValue} for where
   *   the legacy per-use-site coercion went.
   */
  setting(settingName: SettingName, context?: SettingResolutionContext): SettingValue;
}

/**
 * The same contract in callable form, for consumers that want a resolver function rather than an
 * object with one method.
 *
 * Offered because `src/util/` already establishes exactly this idiom for narrow injected
 * collaborators — `PropertyIdentifierResolver` at src/util/formatting.ts:L327 and
 * `UniqueValueProbe` at src/util/urlTitle.ts:L58 — so a consumer written in that style needs no
 * adapter shim. It is the identical contract: same closed name union, same optional context, same
 * synchronous return, no `string`-keyed escape hatch. Being a type alias it costs nothing at
 * runtime, exactly like every other declaration in this file.
 */
export type SettingResolver = (
  settingName: SettingName,
  context?: SettingResolutionContext,
) => SettingValue;
