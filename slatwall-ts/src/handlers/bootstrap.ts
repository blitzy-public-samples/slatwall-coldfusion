// ---------------------------------------------------------------------------
// slatwall-ts/src/handlers/bootstrap.ts
//
// THE COMPOSITION ROOT. The one place in this subtree where abstract ports are
// bound to concrete adapters.
//
// Derived from Slatwall 3.1.39 (GPL v3.0). Attribution is carried forward in
// `slatwall-ts/NOTICE-GPL.md`; the `/integrationServices/` special exception
// recorded at [readme.md:L63-L65] does NOT extend to this subtree.
//
// TRANSFORMATION MODE: REFERENCE - BEHAVIOUR ONLY, NO CODE COPIED.
//   AAP 0.4.1, Handlers table, row 1: "REFERENCE | org/Hibachi/DI1/ioc.cfc
//   (behavior only, never modified) | Composition root: every service,
//   repository, and port instantiated and wired once, explicitly." Not one line
//   of DI/1 is transcribed here, and no CFML file is modified by this work.
//
// TEST COVERAGE IS NET-NEW, NOT PARITY.
//   The only three legacy test files touching the in-scope slice are
//   `meta/tests/unit/entity/BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc`
//   and the EMPTY `meta/tests/functional/admin/entity/ProductTest.cfc`. Nothing
//   covers the handler tier, so every assertion about this file is NET-NEW
//   coverage and must be reported as such. Its suites live in
//   `slatwall-ts/tests/unit/handlers/` and are authored elsewhere; this file
//   authors none of them, and exports the graph in a shape those suites can
//   drive without monkey-patching module state - see `CompositionOverrides`.
//
// NOT A LAMBDA ENTRY POINT.
//   The five bundle entry points are `catalogQueryHandler.ts`,
//   `skuResolutionHandler.ts`, `promotionApplicationHandler.ts`,
//   `priceResolutionHandler.ts` and `productFeedHandler.ts`. This module is a
//   SHARED INTERNAL and deliberately exports no `handler`.
//
// ---------------------------------------------------------------------------
// WHAT IS BEING REPLACED
// ---------------------------------------------------------------------------
//   Legacy `property name="xService";` declarations were resolved by a DI/1
//   0.4.2 RUNTIME CONVENTION SCAN [org/Hibachi/DI1/ioc.cfc:L546 pins
//   `variables.config.version = '0.4.2'`], whose first scan held an exclusive
//   lock [org/Hibachi/DI1/ioc.cfc:L289]. Here every collaborator is an explicit,
//   compile-checked constructor argument, wired exactly once, in this one file:
//   no runtime scan, no service locator, and NO DI-CONTAINER PACKAGE - hand
//   wiring constructors IS the point of removing DI/1. The whole graph is
//   statically verifiable, and the legacy first-scan lock is retired as a side
//   effect. That lock, like the legacy 60-second order-placement and 45-second
//   payment-transaction locks, is NOTED AND DELIBERATELY NOT IMPLEMENTED.
//
//   DI/1 REMAINS PHYSICALLY IN THE REPOSITORY. AAP 0.5.3 is not a deletion
//   manifest - "Nothing is uninstalled, and no manifest is edited." `org/Hibachi/**`
//   is a boundary to extract FROM and NEVER modify; "not carried forward" means
//   only that the target does not depend on it.
//
//   THE CFML MONOLITH MUST KEEP RUNNING - the strangler-fig seam.
//   `model/service/OrderService.cfc` is OUT OF SCOPE and injects SIXTEEN
//   collaborators: `orderDAO` [L51] plus fifteen services [L53-L67], two of
//   which are the in-scope `priceGroupService` [L60] and `promotionService`
//   [L61]. The in-scope services are consumed BY the out-of-scope orchestrator,
//   which is exactly where a proxy boundary belongs, and the legacy runtime
//   keeps resolving its own DI/1 wiring unchanged.
//
//   "16+" IS A PROPERTY OF `OrderService`, NOT OF THE PORTED SLICE. Verified DI/1
//   collaborator counts, line by line: BrandService 1 [L51]; OptionService 2
//   [L51, L53]; PriceGroupService 3 [L51, L53, L54]; PromotionService 3 [L51,
//   L53, L54]; SkuService 5 [L51, L53-L56]; ProductService 8 [L52-L60, L55
//   blank]. The real work is inverting two call directions so the out-of-scope
//   order aggregate becomes an INPUT - see `updateOrderAmountsWithPriceGroupsThenPromotions`.
//
// ---------------------------------------------------------------------------
// THE FIVE DEAD DI/1 INJECTIONS - NONE OF THEM IS WIRED HERE
// ---------------------------------------------------------------------------
//   Each was declared as a DI/1 `property` and is never referenced anywhere in
//   its component's body, verified by reconciling every declaration against
//   every accessor call site. Wiring one would import coupling that does not
//   exist in the source, so each omission is annotated at the constructor it
//   would otherwise have appeared in:
//
//     1. [model/service/SkuService.cfc:L54]                  `productService`
//     2. [model/service/OptionService.cfc:L53]               `productService`
//     3. [model/service/ProductService.cfc:L57]              `contentService`
//     4. [model/service/ProductService.cfc:L54]              `productTypeDAO`
//     5. [integrationServices/google/controllers/feed.cfc:L51] `productService`
//
//   Corollary for 4: `productTypeDAO` is dead AS A ProductService COLLABORATOR,
//   yet `ProductService`'s ported constructor genuinely declares a
//   `ProductTypeRepository`. The port is wired because that constructor asks for
//   it, never because of the dead legacy declaration.
//   Corollary for 5: `GoogleIntegration` takes no constructor parameters at all.
//   [feed.cfc:L52] `skuService` IS live (used at L63) and its work is carried by
//   `googleFeedRepository.ts`.
//
// ---------------------------------------------------------------------------
// THE TWO-TIER STRUCTURE - THIS FILE'S ARCHITECTURE
// ---------------------------------------------------------------------------
//   TIER 1, module scope, created once and reused across warm invocations:
//   configuration, the dialect decision, THE ONE `mysql2` pool behind its narrow
//   prepared-statement executor, the eagerly-resolved settings provider, and the
//   stateless adapters. `getConnectionPool()` inside
//   `../repositories/mysql/connection.js` is THE SINGLE DOCUMENTED EXCEPTION to
//   the no-module-scope-mutable-state rule. Reusing one pool across warm
//   invocations is AN ENGINEERING DECISION ABOUT CONNECTION REUSE. It is not a
//   performance target, and this file asserts no latency, throughput, capacity,
//   uptime or availability figure of any kind.
//
//   TIER 2, per request: everything that holds a memo. On a warm container
//   module-level state persists between UNRELATED requests, so reproducing the
//   legacy component-level caches as module state would be actively unsafe - it
//   could leak one customer's discount into another's order. Every memo family
//   the legacy kept on a component or an entity is therefore created fresh by
//   `createRequestScope`:
//     * entity memos - `variables.currencyDetails`, `variables.livePrice`
//       [model/entity/Sku.cfc], `variables.brandName` [model/entity/Product.cfc];
//     * `RoundingRuleService.variables.roundingRuleDetails`
//       [model/service/RoundingRuleService.cfc:L67-L77];
//     * `SkuDAO.variables.nextOptionGroupSortOrder`
//       [model/dao/SkuDAO.cfc:L204-L220];
//     * the European Central Bank daily-rate table
//       [model/service/CurrencyService.cfc:L105].
//
//   JUDGMENT CALL: the seven services and the six repositories are constructed
//   PER REQUEST rather than at module scope, precisely because they own those
//   memos - `RoundingRuleService` holds `roundingRuleDetails` and
//   `MysqlSkuRepository` holds `nextOptionGroupSortOrder`, and the SKU entities
//   they hydrate hold theirs. The WIRING is still DEFINED exactly once, in this
//   one file; only the instances are per request. That is what a warm container
//   requires, and it is the same reasoning `mysqlPriceGroupRepository.ts` states
//   for refusing caching instance fields.
//
//   T6 - NO AMBIENT STATE. `getHibachiScope()` and the inconsistent
//   `getSlatwallScope()` [model/service/PriceGroupService.cfc:L262-L268] both
//   resolve to the same thing and are both replaced by an EXPLICIT CONTEXT
//   PARAMETER threaded down the call chain, which normalises the legacy naming
//   divergence out of existence. The clock is threaded the same way, under an
//   explicit UTC policy, which is what makes the one mandated entity widening
//   `isCurrent(now: Date)` [model/entity/PromotionPeriod.cfc:L78] usable.
//
// ---------------------------------------------------------------------------
// CJS BUNDLE CONSTRAINTS - SOLVED UPSTREAM, NOT RE-LITIGATED HERE
// ---------------------------------------------------------------------------
//   The Lambda bundle is emitted CommonJS because bundling this dependency set
//   to ESM builds cleanly and then fails at runtime with
//   `Dynamic require of "node:buffer" is not supported` from the MySQL driver's
//   CommonJS dependency chain. Consequence for this file, the most
//   CJS-sensitive in the subtree: NO `import.meta` and NO TOP-LEVEL `await`.
//   Everything asynchronous in tier 1 - the eager `skuEligibleCurrencies`
//   resolution above all - happens inside a memoized async initializer that a
//   handler awaits once per invocation.
// ---------------------------------------------------------------------------

import { appConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { cfEquals } from '../lib/cfml/struct.js';
import { listToArray } from '../lib/cfml/list.js';
import { getPreparedStatementExecutor } from '../repositories/mysql/connection.js';
import { assertMySqlDialect, resolveDialect } from '../repositories/mysql/dialect.js';
import { MysqlProductRepository } from '../repositories/mysql/mysqlProductRepository.js';
import { MysqlSkuRepository } from '../repositories/mysql/mysqlSkuRepository.js';
import { MysqlOptionRepository } from '../repositories/mysql/mysqlOptionRepository.js';
import { MysqlProductTypeRepository } from '../repositories/mysql/mysqlProductTypeRepository.js';
import { MysqlPromotionRepository } from '../repositories/mysql/mysqlPromotionRepository.js';
import { MySqlPriceGroupRepository } from '../repositories/mysql/mysqlPriceGroupRepository.js';
import { Option } from '../domain/entities/option.js';
import { OptionGroup } from '../domain/entities/optionGroup.js';
import { Promotion } from '../domain/entities/promotion.js';
import { toCurrencyCode } from '../domain/valueObjects/currencyCode.js';
import { RoundingRuleService } from '../services/roundingRuleService.js';
import { BrandService } from '../services/brandService.js';
import { OptionService } from '../services/optionService.js';
import { SkuService } from '../services/skuService.js';
import { ProductService } from '../services/productService.js';
import { PriceGroupService } from '../services/priceGroupService.js';
import { PromotionService } from '../services/promotionService.js';
import { EuropeanCentralBankCurrencyConverter } from '../integrations/europeanCentralBankCurrencyConverter.js';
import { GoogleFeedRepository } from '../integrations/google/googleFeedRepository.js';
import { GoogleFeedService, toTrustedFeedHost } from '../integrations/google/googleFeedService.js';
import { GoogleIntegration } from '../integrations/google/integration.js';

import type { AppConfig, EnvironmentSource } from '../lib/config.js';
import type { CfBooleanInput } from '../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlRow } from '../repositories/mysql/connection.js';
import type { DatabaseDialect } from '../repositories/mysql/dialect.js';
import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneLocationProjection,
  AddressZoneProjection,
} from '../domain/ports/addressZoneEvaluator.js';
import type { CurrencyConverter } from '../domain/ports/currencyConverter.js';
import type {
  ImageStore,
  ImageUploadResultProjection,
  SkuImageFileNameDescriptor,
} from '../domain/ports/imageStore.js';
import type { OptionRepository } from '../domain/ports/optionRepository.js';
import type { CurrentAccountContext } from '../domain/ports/priceGroupRepository.js';
import type { PriceGroupRepository } from '../domain/ports/priceGroupRepository.js';
import type { ProductRepository } from '../domain/ports/productRepository.js';
import type { ProductFeedPort } from '../domain/ports/productFeedPort.js';
import type { ProductTypeRepository } from '../domain/ports/productTypeRepository.js';
import type { PromotionRepository } from '../domain/ports/promotionRepository.js';
import type { SalePriceDetail } from '../domain/ports/promotionRepository.js';
import type { SettingKey, SettingsProvider } from '../domain/ports/settingsProvider.js';
import type { SkuRepository } from '../domain/ports/skuRepository.js';
import type {
  SubscriptionBenefitHandle,
  SubscriptionTermHandle,
  SubscriptionTermProvider,
} from '../domain/ports/subscriptionTermProvider.js';
import type { UrlTitleGenerator, UrlTitleTableName } from '../domain/ports/urlTitleGenerator.js';
import type { PriceGroup } from '../domain/entities/priceGroup.js';
import type { PriceGroupRate } from '../domain/entities/priceGroupRate.js';
import type { RoundingRule } from '../domain/entities/roundingRule.js';
import type { Sku, SkuImageSettingValues, SkuPriceGroupResolver } from '../domain/entities/sku.js';
import type { CfStruct } from '../lib/cfml/struct.js';
import type { Money } from '../domain/valueObjects/money.js';
import type { CurrencyRecordProjection } from '../integrations/europeanCentralBankCurrencyConverter.js';
import type { EuropeanCentralBankRateTable } from '../integrations/europeanCentralBankCurrencyConverter.js';
import type {
  ResolvedFeedSettingValues,
  ResolvedSkuShippingWeightSetting,
  SkuFeedSettingResolver,
  SkuFeedSettingSubject,
} from '../integrations/google/googleFeedRepository.js';
import type { OrderView } from '../domain/views/orderView.js';
import type { OrderItemView } from '../domain/views/orderItemView.js';
import type { PriceGroupAppliedIntent } from '../services/priceGroupService.js';
import type {
  OptionLoadingCollaborator,
  ProductSaveInput,
  SkuCreationCollaborator,
} from '../services/productService.js';
import type { CreateSkusInput } from '../services/skuService.js';
import type { PromotionAppliedIntent } from '../domain/promotionEngine/qualifiedDiscountTypes.js';

// ===========================================================================
// SECTION 1 - THE PUBLISHED SURFACE
//
// E7 / RULING D: one PRIMARY exported unit - `bootstrapCompositionRoot` - plus
// co-located supporting types, exactly as the thirteen ports publish an
// interface alongside the projections it needs. `resetCompositionRoot` is the
// memo's test seam and follows the idiom `appConfig.reset()` and
// `closeConnectionPool()` already established. There is NO barrel and no
// `index.ts` anywhere in this subtree, and nothing imports from this module -
// `src/handlers/` is the inversion point.
// ===========================================================================

/**
 * The per-invocation inputs a handler supplies when it opens a request scope.
 *
 * Every member is optional and every one may be passed as an explicit
 * `undefined`, because a handler assembles these from an API Gateway event
 * whose fields are themselves optional. `exactOptionalPropertyTypes` is on, so
 * each optional member spells `| undefined` rather than relying on the `?` alone.
 */
export interface RequestScopeInput {
  /**
   * THE INJECTED CLOCK, under an explicit UTC policy.
   *
   * A `Date` is an absolute instant, so threading one is what makes every
   * date-dependent entity method deterministic - the mandated widening
   * `PromotionPeriod.isCurrent(now: Date)` [model/entity/PromotionPeriod.cfc:L78]
   * above all. Absent, the scope reads the wall clock once, at scope creation,
   * so that every comparison inside one request sees the SAME instant rather
   * than a drifting one.
   */
  readonly now?: Date | undefined;

  /**
   * The authenticated account, as an opaque identifier.
   *
   * ABSENCE IS THE LOGGED-OUT ARM, not a missing value.
   * [model/service/PriceGroupService.cfc:L263] branches on
   * `getSlatwallScope().getLoggedInFlag()` and only then reads
   * `getHibachiScope().getAccount()` at L264; the L265-L266 else arm returns
   * `sku.getPrice()`. `CurrentAccountContext` carries `accountID?` and nothing
   * else, so omitting this member IS that else arm. It is never read from
   * `../lib/config.js`, which is static process configuration and never a
   * request scope.
   */
  readonly accountID?: string | undefined;

  /**
   * The host the product feed must render, plus the allow-list it is checked
   * against.
   *
   * RULING B: the host is CAPTURED AT CONSTRUCTION, never passed as a method
   * argument, which is what keeps `ProductFeedPort.generateProductFeed()`
   * zero-parameter. Supplied only by `productFeedHandler.ts`, the sole
   * entrypoint driving the feed and the sole holder of the event the host is
   * derived from. Omitted, `RequestScope.productFeedPort` is `undefined` and no
   * feed can be rendered - which is the safe outcome, not a degraded one.
   */
  readonly feedHost?: FeedHostRequest | undefined;
}

/**
 * A candidate feed host and the allow-list that admits it.
 *
 * Both halves come from the request adapter because neither exists anywhere
 * else: `../lib/config.js` publishes no feed-host allow-list, and a hard-coded
 * host would be configuration baked into code. An EMPTY allow-list refuses
 * everything, which is the safe failure rather than a bypass -
 * `toTrustedFeedHost` throws `UntrustedFeedHostError` and no feed is emitted.
 */
export interface FeedHostRequest {
  /** The unvalidated host authority, as observed on the request. */
  readonly candidate: string;

  /** The hosts this deployment admits. Empty refuses every candidate. */
  readonly allowedHosts: readonly string[];
}

/**
 * The result of the one composed pricing operation this root publishes.
 *
 * Both passes return INTENTS rather than mutating an order, because the order
 * aggregate is out of scope - the anti-corruption seam. `pricedOrder` is the
 * order view after the price-group pass has been projected onto it, which is
 * the exact input the promotion pass consumed.
 */
export interface OrderPricingResult {
  /** What the price-group pass decided, in the order it decided it. */
  readonly priceGroupIntents: readonly PriceGroupAppliedIntent[];

  /** What the promotion pass decided, given `pricedOrder`. */
  readonly promotionIntents: readonly PromotionAppliedIntent[];

  /** The order view the promotion pass actually read. */
  readonly pricedOrder: OrderView;
}

/**
 * One request's worth of wired graph.
 *
 * Created by `CompositionRoot.createRequestScope` and discarded when the
 * invocation ends. Everything reachable from here that holds a memo was
 * constructed for THIS request only.
 */
export interface RequestScope {
  /** The instant every date comparison in this request resolves against. */
  readonly now: Date;

  /** The explicit replacement for `getHibachiScope()` / `getSlatwallScope()`. */
  readonly currentAccountContext: CurrentAccountContext;

  readonly productRepository: ProductRepository;
  readonly skuRepository: SkuRepository;
  readonly optionRepository: OptionRepository;
  readonly productTypeRepository: ProductTypeRepository;
  readonly promotionRepository: PromotionRepository;
  readonly priceGroupRepository: PriceGroupRepository;

  readonly roundingRuleService: RoundingRuleService;
  readonly brandService: BrandService;
  readonly optionService: OptionService;
  readonly skuService: SkuService;
  readonly productService: ProductService;
  readonly priceGroupService: PriceGroupService;
  readonly promotionService: PromotionService;

  /** The currency converter for this request; never shared across requests. */
  readonly currencyConverter: CurrencyConverter;

  /**
   * The feed port, present only when `RequestScopeInput.feedHost` was supplied.
   * Its host and clock are closed over at construction - RULING B.
   */
  readonly productFeedPort: ProductFeedPort | undefined;

  /**
   * The sale-price details a caller needs when it hydrates a `Product`.
   *
   * `Product` takes `salePriceDetailsForSkus` as a RESOLVED VALUE rather than a
   * resolver port, so this is the capability that produces that value. It
   * replaces the `getService("promotionService")` locator at
   * [model/entity/Product.cfc:L519] - transformation rule T2.
   */
  getSalePriceDetailsForProductSkus(productID: string): Promise<CfStruct<SalePriceDetail>>;

  /**
   * THE PRICE-GROUP PASS AND THE PROMOTION PASS, AS ONE OPERATION WHOSE ORDER
   * THE CALLER CANNOT INVERT.
   *
   * See section 8. This is the ONLY route that runs BOTH passes, and its
   * internal sequence is not parameterised, not reorderable and not observable -
   * there is no `sequence`, `phase`, `runAfter` or `pipeline` argument anywhere
   * on it, and the composing function is module-private. Order pricing MUST go
   * through here.
   *
   * Stated precisely, because the weaker claim is the true one and overstating
   * it would mislead the next reader: this is NOT the only route by which
   * EITHER pass is individually reachable. `priceGroupService` and
   * `promotionService` are published on this same interface, so their methods
   * can be called directly. That is deliberate and unavoidable -
   * `priceResolutionHandler.ts` is specified as the entrypoint exposing the
   * price-group and currency resolution surface (AAP 0.4.1), which means
   * `calculateSkuPriceBasedOnCurrentAccount`,
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount` and
   * `calculateSkuPriceBasedOnPriceGroup` have to be reachable, and they live on
   * `PriceGroupService`. Withdrawing the service to make the stronger claim
   * literally true would break a mandated handler.
   *
   * So the guarantee this member carries is the one that matters for money:
   * NO CALLER CAN RUN THE TWO PASSES IN THE WRONG ORDER THROUGH THIS ROUTE, and
   * no other route runs the two passes at all. Calling
   * `priceGroupService.updateOrderAmountsWithPriceGroups` or
   * `promotionService.updateOrderAmountsWithPromotions` directly for order
   * pricing is a defect at the call site: the promotion pass READS
   * `getAppliedPriceGroup()` in its branch CONDITION
   * [model/service/PromotionService.cfc:L241], so the ordering obligation holds
   * whichever arm executes.
   */
  updateOrderAmountsWithPriceGroupsThenPromotions(order: OrderView): Promise<OrderPricingResult>;
}

/**
 * The module-scope graph, created once and reused across warm invocations.
 */
export interface CompositionRoot {
  /** The resolved process configuration. */
  readonly config: AppConfig;

  /** The dialect this composition committed to. Always `'MySQL'`. */
  readonly dialect: DatabaseDialect;

  /**
   * The settings provider, with `skuEligibleCurrencies` ALREADY RESOLVED.
   * Stateless and immutable, which is why it is safe at module scope.
   */
  readonly settingsProvider: SettingsProvider;

  /**
   * The Google integration adapter. No constructor parameters, no state -
   * [integrationServices/google/controllers/feed.cfc:L51] `productService` is
   * the fifth dead injection and is not wired.
   */
  readonly integration: GoogleIntegration;

  /** Open one request's scope. Called exactly once per invocation. */
  createRequestScope(input?: RequestScopeInput): RequestScope;
}

/**
 * The test seam, and the only way to build a root that is not memoized.
 *
 * Passing any overrides bypasses the module memo entirely, so a suite can drive
 * the whole graph against a fake executor without patching module state and
 * without a live database. Passing none is the production path.
 */
export interface CompositionOverrides {
  /**
   * A prepared-statement executor to use INSTEAD of the module-scope pool.
   * Supplying one means no pool is ever created.
   */
  readonly executor?: PreparedStatementExecutor | undefined;

  /**
   * An environment source for `appConfig.load`, instead of `process.env`.
   *
   * ★ IT GOVERNS THIS ROOT'S OWN CONFIGURATION AND DIALECT DECISION, AND NOT THE
   * DIALECT-COMPOSED SQL. Two statement builders -
   * `src/repositories/mysql/sql/salePricePromotionRewards.sql.ts` and the row-limit
   * fragment the price-group query uses - call `resolveConfiguredDialect()`, which
   * reads `process.env` DIRECTLY. In production both paths read the same process
   * environment and therefore agree; a suite that supplies a source here AND drives
   * one of those builders must stub the process environment too. Recorded because
   * the alternative - threading a config object into every SQL module - would push
   * configuration back into the layer that deliberately does not own it.
   */
  readonly environment?: EnvironmentSource | undefined;

  /**
   * The European Central Bank reference rates.
   *
   * Absent, the documented empty table is used - see section 4.3, where the
   * choice is recorded as a JUDGMENT CALL against
   * [model/service/CurrencyService.cfc:L100-L101].
   */
  readonly europeanCentralBankRates?: EuropeanCentralBankRateTable | undefined;
}

// ===========================================================================
// SECTION 2 - LEGACY-DECLARED VALUES THIS ROOT OWNS
//
// The composition root is the layer that resolves configuration; a repository or
// an entity that resolved its own would be configuration inside business code,
// which `googleFeedRepository.ts` refuses explicitly and at length. The values
// below are the DECLARED LEGACY DEFAULTS, each with its locator, and each is
// named rather than inlined at a call site so a reviewer can check it once.
//
// None of these is a credential, a secret, a host, an IP or a connection string.
// Every one of those comes from the environment through `../lib/config.js`, and
// none appears anywhere in this file.
// ===========================================================================

/**
 * `setting('globalURLKeyProduct')` [model/service/SettingService.cfc:L178].
 *
 * The first segment of a product path: `getProductURL()` returns
 * `"/#setting('globalURLKeyProduct')#/#getURLTitle()#/"`
 * [model/entity/Product.cfc:L207-L209].
 */
const GLOBAL_URL_KEY_PRODUCT_DEFAULT = 'sp';

/** `setting('globalURLKeyProductType')` [model/service/SettingService.cfc:L179]. */
const GLOBAL_URL_KEY_PRODUCT_TYPE_DEFAULT = 'spt';

/**
 * `setting('skuCurrency')` [model/service/SettingService.cfc:L221], declared
 * `{fieldType="select", defaultValue="USD"}`.
 *
 * THE "USD DEFAULT" LIVES IN THE SETTING DECLARATION, NOT IN CODE. There is no
 * hardcoded `"USD"` anywhere in `model/entity/Sku.cfc`; `getCurrencyCode()`
 * [L360-L365] merely memoizes `this.setting('skuCurrency')`. It is resolved
 * through the settings port with the same default and is never baked into an
 * entity.
 */
const SKU_CURRENCY_DEFAULT = 'USD';

/**
 * `setting('productImageDefaultExtension')` [model/service/SettingService.cfc:L191].
 *
 * NOT a settings-port key. `settingsProvider` is locked at four keys and this is
 * an IMAGE concern, so it travels with the image subsystem's configuration -
 * `SkuImageSettingValues` and `ImageStore.generateSkuImageFileName`.
 */
const PRODUCT_IMAGE_DEFAULT_EXTENSION_DEFAULT = 'jpg';

/**
 * `setting('productImageOptionCodeDelimiter')` [model/service/SettingService.cfc:L192],
 * whose legacy option list is exactly `['-','_']`
 * [model/service/SettingService.cfc:L346-L347].
 */
const PRODUCT_IMAGE_OPTION_CODE_DELIMITER_DEFAULT = '-';

/**
 * `getHibachiScope().getBaseImageURL()`, resolved to the host-relative prefix it
 * is.
 *
 * [model/transient/HibachiScope.cfc:L186-L188] computes
 * `getURLFromPath(setting('globalAssetsImageFolderPath'))`, and
 * `globalAssetsImageFolderPath` is declared as
 * `getApplicationValue('applicationRootMappingPath') & '/custom/assets/images'`
 * [model/service/SettingService.cfc:L164]. Under the URL form of that path the
 * application-root prefix disappears, leaving the host-relative remainder - and
 * host-relative is exactly what the consumers need: the feed view prepends the
 * host itself [integrationServices/google/views/feed/product.cfm:L23]. No
 * absolute URL and no host appears here.
 */
const BASE_IMAGE_URL_DEFAULT = '/custom/assets/images';

/**
 * The EFFECTIVE missing-image path, with the legacy three-candidate precedence
 * already resolved.
 *
 * [model/service/ImageService.cfc:L82-L89] substitutes, in order, the
 * caller-supplied `missingImagePath` - `setting('imageMissingImagePath')`,
 * declared `"/assets/images/missingimage.jpg"`
 * [model/service/SettingService.cfc:L184] - then `setting('globalMissingImagePath')`
 * [L85-L86], then the literal
 * `"#getApplicationValue('baseURL')#/assets/images/missingimage.jpg"` [L88].
 *
 * JUDGMENT CALL: each legacy candidate is selected by
 * `fileExists(expandPath(...))`, a FILESYSTEM PROBE that has no counterpart under
 * the target's execution model - the assets live behind an asset host. Resolving
 * the precedence here, once, is what the feed repository's contract asks of this
 * root, and the answer is the first candidate's declared default in its
 * host-relative form. The final legacy `else` is unconditional, so a missing
 * image ALWAYS resolved to some path and this member is therefore required
 * rather than optional.
 */
const MISSING_IMAGE_PATH_DEFAULT = '/assets/images/missingimage.jpg';

/** `setting('skuShippingWeight')` [model/service/SettingService.cfc:L232], `1`. */
const SKU_SHIPPING_WEIGHT_DEFAULT = '1';

/** `setting('skuShippingWeightUnitCode')` [model/service/SettingService.cfc:L233], `"lb"`. */
const SKU_SHIPPING_WEIGHT_UNIT_CODE_DEFAULT = 'lb';

/**
 * The site handed to `assertMySqlDialect`, so a refusal names where it happened.
 */
const DIALECT_DECISION_SITE = 'bootstrap.ts composition root';

/**
 * The European Central Bank rate table when no rates are supplied.
 *
 * JUDGMENT CALL: this empty default IS the E3 resolution. Reproducing
 * `getEuropeanCentralBankRates()` [model/service/CurrencyService.cfc:L104-L118]
 * needs BOTH an HTTP client and an XML parser, and the fourteen exactly-pinned
 * packages contain NEITHER. Adding one is forbidden, so the rates arrive as data
 * and the default is EMPTY.
 *
 * That choice is BEHAVIOURALLY FAITHFUL rather than degraded. When a rate is
 * missing the legacy does not raise: [L100-L101] reads
 * `// If no conversion could be done, just return the original amount` followed
 * by `return arguments.amount;`, and its `catch` around the fetch
 * [L127-L128] is empty, so a failed retrieval took exactly that path. An empty
 * table therefore models "the rate source is unavailable" with the legacy's own
 * behaviour, and step 3 of the SKU currency cascade
 * [model/entity/Sku.cfc:L416-L428] only runs where steps 1 and 2 set no price
 * key at all.
 *
 * TODO: Add integration support
 *   Carried forward verbatim from [model/service/CurrencyService.cfc:L81]. It is
 *   flagged, never silently completed: a rate integration is what would let this
 *   table be populated from a live source.
 */
const EMPTY_EUROPEAN_CENTRAL_BANK_RATES: EuropeanCentralBankRateTable = Object.freeze({});

// ===========================================================================
// SECTION 3 - FAULT REPORTING, SQL, AND ROW READING
//
// Every statement this root owns is a LITERAL constant with positional `?`
// placeholders, executed through the narrow prepared-statement executor. That
// preserves the injection-safety property `cfqueryparam` provided, and it is
// absolute: no value is ever interpolated into a statement, and the one shape
// that legitimately varies - the table a URL title is checked against - is a
// closed lookup of three literal statements rather than a name spliced into SQL.
//
// The readers mirror `mysqlSkuRepository.ts` member for member, deliberately, so
// that a row read here and the same row read there disagree about nothing.
// ===========================================================================

/**
 * A column the composition root read could not be interpreted.
 *
 * Module-local, following the sibling adapters: the constructor is not exported
 * and no message ever echoes a rejected value - only the column, the statement
 * that produced it, and the JavaScript type it arrived as.
 */
class CompositionColumnError extends Error {
  public constructor(columnName: string, observedType: string, statementLabel: string) {
    super(
      `Statement '${statementLabel}' produced column '${columnName}' as ${observedType}, ` +
        'which the composition root cannot interpret. The Sw* schema is unchanged by this ' +
        'migration, so a mismatch here indicates a driver or statement problem.',
    );
    this.name = 'CompositionColumnError';
  }
}

/**
 * A row the schema's own constraints say cannot exist.
 *
 * Raised where a foreign key resolves to nothing - a dangling reference the
 * legacy ORM association could not have produced, because the constraint that
 * forbids it is part of the `Sw*` schema this migration leaves unchanged.
 */
class CompositionDataError extends Error {
  public constructor(detail: string) {
    super(`The composition root read data the Sw* schema forbids: ${detail}.`);
    this.name = 'CompositionDataError';
  }
}

/**
 * A collaborator was reached before the wiring that binds it had completed.
 *
 * Unreachable through any published entry point: both late bindings are resolved
 * before `createRequestScope` returns, and neither delegate is invoked during
 * construction. It exists so that the two construction cycles are broken without
 * a cast, a non-null assertion or an `any` - see section 7.
 */
class CompositionWiringError extends Error {
  public constructor(collaborator: string) {
    super(
      `The composition root reached '${collaborator}' before its wiring completed. ` +
        'This is a programming error in the composition root, not a data condition.',
    );
    this.name = 'CompositionWiringError';
  }
}

/** The image store this root wires performs no I/O. See section 4.5. */
class ImageStoreNotConfiguredError extends Error {
  public constructor(operation: string, request: string) {
    super(
      `No image store is configured in this composition, so '${operation}' did not run. ` +
        'The image subsystem is out of scope for this migration; nothing was written, ' +
        'nothing was deleted, and no result may be read as a successful one. The request ' +
        `was: ${request}.`,
    );
    this.name = 'ImageStoreNotConfiguredError';
  }
}

/** The subscription term provider this root wires answers nothing. See section 4.6. */
class SubscriptionTermsNotConfiguredError extends Error {
  public constructor(operation: string, request: string) {
    super(
      `No subscription term provider is configured in this composition, so '${operation}' ` +
        'did not run. Subscription handling is out of scope for this migration; the absence ' +
        'of an answer must not be read as "no such record exists". The request was: ' +
        `${request}.`,
    );
    this.name = 'SubscriptionTermsNotConfiguredError';
  }
}

// --- Statement labels ------------------------------------------------------
// One label per statement, as constants rather than inline strings, because they
// appear in fault messages and are the handle a suite asserts emitted SQL by.

const SELECT_CURRENCY_RECORDS = 'bootstrapSelectCurrencyRecords';
const SELECT_OPTION_WITH_GROUP_BY_ID = 'bootstrapSelectOptionWithGroupByID';
const SELECT_OPTION_GROUP_BY_ID = 'bootstrapSelectOptionGroupByID';
const SELECT_OPTIONS_BY_OPTION_GROUP_ID = 'bootstrapSelectOptionsByOptionGroupID';
const SELECT_ACCOUNT_PRICE_GROUP_IDS = 'bootstrapSelectAccountPriceGroupIDs';
const SELECT_PRICE_GROUP_PAGE_IDS = 'bootstrapSelectPriceGroupPageIDs';
const SELECT_PROMOTION_BY_ID = 'bootstrapSelectPromotionByID';
const SELECT_UNIQUE_URL_TITLE = 'bootstrapSelectUniqueUrlTitle';

// --- Statements ------------------------------------------------------------

/**
 * The two `SwCurrency` columns the currency projection needs.
 *
 * NO `activeFlag` PREDICATE, deliberately. The projection feeds BOTH listing
 * methods of `CurrencyConverter`, and only one of them filters:
 * `getAllActiveCurrencyIDList` applies `activeFlag = 1`
 * [model/service/CurrencyService.cfc:L57-L67] while
 * `getCurrenciesByCurrencyCodeList` applies NO such filter, mirroring
 * [model/entity/Sku.cfc:L371] and [L375]. Filtering here would erase that
 * asymmetry, and the asymmetry decides prices. `SwCurrency`'s primary key is
 * `currencyCode` [model/entity/Currency.cfc:L52].
 */
const SELECT_CURRENCY_RECORDS_SQL = 'SELECT currencyCode, activeFlag FROM SwCurrency';

/** The `SwOption` columns, in the order `mysqlSkuRepository.ts` selects them. */
const OPTION_COLUMN_NAMES = [
  'optionID',
  'optionCode',
  'optionName',
  'optionDescription',
  'sortOrder',
  'optionGroupID',
  'defaultImageID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
];

/** The `SwOptionGroup` columns, aliased so a joined row cannot collide. */
const OPTION_GROUP_ALIAS_PREFIX = 'optionGroup_';

const OPTION_GROUP_COLUMN_NAMES = [
  'optionGroupID',
  'optionGroupName',
  'optionGroupCode',
  'optionGroupImage',
  'optionGroupDescription',
  'imageGroupFlag',
  'sortOrder',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
];

const OPTION_GROUP_COLUMNS_SQL = OPTION_GROUP_COLUMN_NAMES.map(
  (columnName: string): string =>
    `optionGroup.${columnName} AS ${OPTION_GROUP_ALIAS_PREFIX}${columnName}`,
).join(', ');

/**
 * One option with its group, for `OptionLoadingCollaborator.getOption`.
 *
 * The join is a LEFT JOIN because `Option.optionGroup` is a nullable
 * many-to-one [model/entity/Option.cfc:L59]; an inner join would silently drop
 * an option whose group column is null.
 */
const SELECT_OPTION_WITH_GROUP_BY_ID_SQL = [
  'SELECT',
  OPTION_COLUMN_NAMES.map((columnName: string): string => `swOption.${columnName}`).join(', '),
  `, ${OPTION_GROUP_COLUMNS_SQL}`,
  'FROM SwOption swOption',
  'LEFT JOIN SwOptionGroup optionGroup ON swOption.optionGroupID = optionGroup.optionGroupID',
  'WHERE swOption.optionID = ?',
].join(' ');

/** One option group, for `OptionLoadingCollaborator.getOptionGroup`. */
const SELECT_OPTION_GROUP_BY_ID_SQL = [
  `SELECT ${OPTION_GROUP_COLUMN_NAMES.join(', ')}`,
  'FROM SwOptionGroup',
  'WHERE optionGroupID = ?',
].join(' ');

/**
 * A group's options, ORDERED AS THE ORM ORDERS THEM.
 *
 * `OptionGroup.options` declares `orderby="sortOrder"`
 * [model/entity/OptionGroup.cfc:L70], so the ordering is the association's own
 * and is reproduced rather than invented. `optionID` breaks a tie so that two
 * options sharing a sort order do not swap between reads; `sortOrder` itself is
 * nullable on `Option` [model/entity/Option.cfc:L56].
 */
const SELECT_OPTIONS_BY_OPTION_GROUP_ID_SQL = [
  `SELECT ${OPTION_COLUMN_NAMES.join(', ')}`,
  'FROM SwOption',
  'WHERE optionGroupID = ?',
  'ORDER BY sortOrder, optionID',
].join(' ');

/**
 * The price groups assigned DIRECTLY to an account.
 *
 * `PriceGroup.accounts` is a many-to-many over link table
 * `SwAccountPriceGroup` with `fkcolumn="priceGroupID"` and
 * `inversejoincolumn="accountID"` [model/entity/PriceGroup.cfc:L67]. Only the
 * link rows are read here; each price group is then hydrated by its own
 * repository, so there is exactly one hydration path for a `PriceGroup`.
 */
const SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL = [
  'SELECT priceGroupID',
  'FROM SwAccountPriceGroup',
  'WHERE accountID = ?',
].join(' ');

/**
 * The price-group page.
 *
 * NO `ORDER BY` AND NO LIMIT, and both absences are deliberate.
 * [model/service/PriceGroupService.cfc:L233-L236] builds a framework smart list
 * and iterates `getPageRecords()` without declaring either a sort or a page
 * size, so asserting one here would invent observable behaviour. This is the
 * same treatment `getActivePromotionRewards` receives, where the missing
 * `ORDER BY` [model/dao/PromotionDAO.cfc:L51-L132] is what makes reward order
 * non-deterministic and is preserved rather than repaired.
 */
const SELECT_PRICE_GROUP_PAGE_IDS_SQL = 'SELECT priceGroupID FROM SwPriceGroup';

/** One promotion, for `PromotionFrameworkReads.getPromotion`. */
const SELECT_PROMOTION_BY_ID_SQL = [
  'SELECT promotionID, promotionName, promotionSummary, promotionDescription, activeFlag,',
  'defaultImageID, remoteID, createdDateTime, createdByAccountID, modifiedDateTime,',
  'modifiedByAccountID',
  'FROM SwPromotion',
  'WHERE promotionID = ?',
].join(' ');

/**
 * The uniqueness probe behind `createUniqueURLTitle`, one literal per table.
 *
 * CFML parity [model/dao/DataDAO.cfc:L115-L131]: `verifyUniqueTableValue` runs
 * `SELECT #column# FROM #tableName# WHERE #column# = <cfqueryparam …/>` and
 * returns `false` when `rs.recordCount` is non-zero. The legacy interpolated the
 * table and column names; here the closed three-member union
 * `UrlTitleTableName` selects between three FIXED statements, so no identifier
 * is ever spliced into SQL while the behaviour is identical.
 */
const SELECT_UNIQUE_URL_TITLE_SQL: Readonly<Record<UrlTitleTableName, string>> = Object.freeze({
  SwBrand: 'SELECT urlTitle FROM SwBrand WHERE urlTitle = ?',
  SwProduct: 'SELECT urlTitle FROM SwProduct WHERE urlTitle = ?',
  SwProductType: 'SELECT urlTitle FROM SwProductType WHERE urlTitle = ?',
});

// --- Row readers -----------------------------------------------------------

type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * Fold an identifier the way CFML folds one.
 *
 * A driver may answer a column under a different case than the statement asked
 * for, and CFML query columns are case-insensitive, so the lookup is too.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

function findColumn(row: SqlRow, columnName: string): ColumnLookup {
  if (Object.prototype.hasOwnProperty.call(row, columnName)) {
    return { found: true, value: row[columnName] };
  }

  const foldedColumnName = foldIdentifier(columnName);

  for (const presentColumnName of Object.keys(row)) {
    if (foldIdentifier(presentColumnName) === foldedColumnName) {
      return { found: true, value: row[presentColumnName] };
    }
  }

  return { found: false };
}

function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new CompositionColumnError(columnName, 'absent', statementLabel);
  }

  return lookup.value;
}

function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return 'a Date';
  }

  if (value instanceof Uint8Array) {
    return 'a Uint8Array';
  }

  return `a ${typeof value}`;
}

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value !== 'string') {
    throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

function readOptionalText(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): string | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isAbsent(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

function readOptionalInteger(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isAbsent(value)) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }

    throw new CompositionColumnError(
      columnName,
      'a big integer outside the exactly representable range',
      statementLabel,
    );
  }

  throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
}

function readRequiredInteger(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readOptionalInteger(row, columnName, statementLabel);

  if (value === undefined) {
    throw new CompositionColumnError(
      columnName,
      'null where the schema declares it required',
      statementLabel,
    );
  }

  return value;
}

function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isAbsent(value)) {
    return undefined;
  }

  if (!(value instanceof Date)) {
    throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * A boolean column, left in the persisted form the entity layer expects.
 *
 * The value is NOT coerced here. `CfBooleanInput` keeps a SQL NULL representable
 * so that `cfBoolean` can resolve it the way the legacy predicate did, and it is
 * what lets `Promotion` apply its own ORM default of `1` when the column is
 * absent [model/entity/Promotion.cfc:L56].
 */
function readFlag(row: SqlRow, columnName: string, statementLabel: string): CfBooleanInput {
  const value = requireColumn(row, columnName, statementLabel);

  if (isAbsent(value)) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Uint8Array) {
    const firstByte = value[0];

    return firstByte === undefined ? undefined : firstByte;
  }

  throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
}

// ===========================================================================
// SECTION 4 - THE NON-REPOSITORY PORT ADAPTERS
//
// The locked target layout provides adapter files only for the six MySQL
// repositories and the four Google integration modules, so ports outside those
// two families have nowhere else to be implemented and this file carries them.
// `src/handlers/` stays at exactly EIGHT files; adding a ninth would be a gate
// failure. The ESLint layer rule forbids `src/domain/**` from importing
// `src/handlers/**` and says nothing about imports OUT of `src/handlers/**`,
// which is precisely why these adapters are legal here and nowhere else.
//
// THE PORT SET REMAINS LOCKED AT THIRTEEN. No fourteenth port, no
// `roundingRuleRepository` - the rounding-rule query is hosted on
// `promotionRepository.getRoundingRuleQuery` - no content port, and no
// `CategoryService`: `model/entity/Category.cfc` declares
// `hb_serviceName="contentService"` BY DESIGN, and `SkuService`'s
// `contentService` is reached only inside the out-of-scope contentAccess branch
// [model/service/SkuService.cfc:L173-L202].
//
// ONLY TWO OF THE THIRTEEN PORTS ARE SYNCHRONOUS - `settingsProvider` and
// `addressZoneEvaluator`. A method is async if and only if its legacy body
// reached the DAO or the ORM. Every signature below is the port's, unchanged.
//
// RECONCILIATION, RECORDED RATHER THAN PAPERED OVER: six of the seven
// non-repository adapters are implemented inline below. The seventh,
// `CurrencyConverter`, is NOT - see section 4.3.
// ===========================================================================

// ---------------------------------------------------------------------------
// 4.1  settingsProvider - SYNCHRONOUS, four keys, non-optional `string`
// ---------------------------------------------------------------------------

/**
 * The single flat settings resolver.
 *
 * The legacy reached settings through FOUR DISTINCT SURFACES - a bare
 * `setting(...)` on self, `getHibachiScope().setting(...)`, the `settingService`
 * collaborator, and `<associatedEntity>.setting(...)`. All four collapse into
 * this one injected resolver; it is NOT an entity-graph traversal.
 *
 * `SettingKey` is locked at FOUR literals by
 * `src/domain/ports/settingsProvider.ts`. `skuAllowBackorderFlag`
 * [model/service/SettingService.cfc:L219] and `globalURLKeyBrand` [L177] are
 * deliberately absent, and so are the image and shipping-weight keys - those
 * travel with the subsystems that own them (see sections 4.5 and 4.7). NO FIFTH
 * KEY MAY BE ADDED to make anything compile.
 *
 * `setting()` returns `string`, never `string | undefined`, which is why
 * `skuEligibleCurrencies` MUST be resolved before an instance exists.
 */
class BootstrapSettingsProvider implements SettingsProvider {
  private readonly values: Readonly<Record<SettingKey, string>>;

  /**
   * @param skuEligibleCurrencies - the ALREADY-RESOLVED comma-delimited list.
   *   `skuEligibleCurrencies` is declared with a runtime-computed default,
   *   `getCurrencyService().getAllActiveCurrencyIDList()`
   *   [model/service/SettingService.cfc:L222] - a live data lookup, not a
   *   literal - so the composition root resolves it eagerly and hands the value
   *   in. See `resolveEligibleCurrencyCodeList`.
   */
  public constructor(skuEligibleCurrencies: string) {
    this.values = Object.freeze({
      globalURLKeyProduct: GLOBAL_URL_KEY_PRODUCT_DEFAULT,
      globalURLKeyProductType: GLOBAL_URL_KEY_PRODUCT_TYPE_DEFAULT,
      skuCurrency: SKU_CURRENCY_DEFAULT,
      skuEligibleCurrencies,
    });
  }

  public setting(settingName: SettingKey): string {
    return this.values[settingName];
  }
}

// ---------------------------------------------------------------------------
// 4.2  addressZoneEvaluator - A LIVE PORT, NOT A STUB
// ---------------------------------------------------------------------------

/**
 * Is one address inside one address zone?
 *
 * A LIVE, FULLY IMPLEMENTED ADAPTER. It is not a stub, it does not stand in for
 * anything, and it is not one of the two stub ports - those are `imageStore` and
 * `subscriptionTermProvider`. It is reached from
 * `PromotionService.getShippingMethodOptionsDiscountAmountDetails` through the
 * `addressService` collaborator [model/service/PromotionService.cfc:L53].
 *
 * SYNCHRONOUS, because the legacy body reaches neither the DAO nor the ORM: the
 * caller supplies an ALREADY-MATERIALISED zone-locations array. Associations are
 * materialized at the repository boundary (T3) and laziness is never simulated.
 *
 * ITS EMPTY-COLLECTION DEFAULT IS RESTRICTIVE, AND THAT IS PROVEN BY
 * CONSTRUCTION rather than assumed [model/service/AddressService.cfc:L57-L82]:
 * `addressInZone` starts FALSE at L58, the only assignment to true is inside the
 * loop body at L76, and L81 returns the flag. An empty locations collection
 * therefore never runs the body and the answer is FALSE - NOT IN ZONE.
 *
 * ★★★ THIS IS THE EXACT OPPOSITE OF THE PERMISSIVE EMPTY-COLLECTION DEFAULT USED
 * IN THE CALLER'S REWARD LOOP, WHERE AN EMPTY ELIGIBILITY COLLECTION MEANS "ALL
 * ARE ELIGIBLE". COLLAPSING THE TWO IS A MONEY BUG: a promotion whose zone list
 * is empty must not become a promotion that applies everywhere, and a reward
 * whose eligibility list is empty must not become a reward that applies nowhere.
 * The two defaults are kept distinct, deliberately, and this comment is the
 * record of that decision.
 */
class CfmlAddressZoneEvaluator implements AddressZoneEvaluator {
  public isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean {
    // [model/service/AddressService.cfc:L58] `var addressInZone = false;`
    let addressInZone = false;

    // [L60] `for(var i=1; i<=arrayLen(arguments.addressZone.getAddressZoneLocations()); i++)`
    for (const location of addressZone.addressZoneLocations) {
      // [L62] `var inLocation = true;` - reset for every location.
      let inLocation = true;

      // [L63-L74] four tests, each of the form
      // `if(!isNull(location.getX()) && location.getX() != address.getX())`.
      // The guard is on the LOCATION value: a location that does not constrain a
      // field imposes nothing. The order is the legacy's - postal code, city,
      // state code, country code - and every test runs, because the legacy sets
      // the flag rather than breaking out.
      if (locationValueExcludes(location, 'postalCode', address.postalCode)) {
        inLocation = false;
      }

      if (locationValueExcludes(location, 'city', address.city)) {
        inLocation = false;
      }

      if (locationValueExcludes(location, 'stateCode', address.stateCode)) {
        inLocation = false;
      }

      if (locationValueExcludes(location, 'countryCode', address.countryCode)) {
        inLocation = false;
      }

      // [L75-L78] the first fully-matching location wins and stops the search.
      if (inLocation) {
        addressInZone = true;
        break;
      }
    }

    // [L81] `return addressInZone;`
    return addressInZone;
  }
}

/**
 * One field of the four-field location test.
 *
 * Two CFML semantics are load-bearing here and both are reproduced explicitly:
 *
 *   1. The legacy tests `!isNull(location.getX())`, so an ABSENT location value
 *      constrains nothing and the field cannot exclude the address.
 *   2. CFML `!=` on strings is CASE-INSENSITIVE, so the comparison routes through
 *      `cfEquals` from `../lib/cfml/struct.js` rather than `!==`. Using `!==`
 *      would treat `"CA"` and `"ca"` as different states and refuse a zone the
 *      legacy admitted.
 *
 * An absent ADDRESS value is normalised to the empty string rather than
 * refused, because that is what CFML does: a null operand in a `!=` comparison
 * behaves as an empty string, so a present location value never matches an
 * absent address value. `cfEquals` raises on a null operand by contract, so the
 * normalisation happens here, at the boundary, where the CFML semantic is.
 */
function locationValueExcludes(
  location: AddressZoneLocationProjection,
  field: 'postalCode' | 'city' | 'stateCode' | 'countryCode',
  addressValue: string | null | undefined,
): boolean {
  const locationValue = location[field];

  if (locationValue === null || locationValue === undefined) {
    return false;
  }

  return !cfEquals(locationValue, addressValue ?? '');
}

// ---------------------------------------------------------------------------
// 4.3  currencyConverter - WIRED, NOT RE-IMPLEMENTED
// ---------------------------------------------------------------------------
//
// RECONCILIATION. The instruction to carry every non-repository adapter inline
// was written when `CurrencyConverter` had no adapter file. One now exists:
// `src/integrations/europeanCentralBankCurrencyConverter.ts` implements the port,
// names `src/handlers/bootstrap.ts` as the site that "constructs and wires this
// class", and is already consumed by the entity suites and the SKU fixtures.
// Three ports cite it. This root therefore WIRES it and does not duplicate it.
//
// Re-implementing it inline was considered and refused. The conversion is a
// MUST-PRESERVE money algorithm - a euro pivot, a guard whose evaluation order is
// behavioural, a silent fallback that is easy to "tidy" into a rejection, and a
// rounding step - and two copies of it would be two arithmetic surfaces for the
// same money, which is exactly what routing all arithmetic through `Money`
// exists to prevent. The adapter's own header makes the same argument: a
// composition root connects instances, it is not where a money algorithm hides.
//
// WHAT THIS ROOT DOES OWN is the one currency question that file deliberately
// does not answer - WHERE the records and the rates come from. The records are
// read once, eagerly, by `readCurrencyRecords`; the rates default to
// `EMPTY_EUROPEAN_CENTRAL_BANK_RATES`, whose reasoning and carried-forward TODO
// are recorded at that constant.
//
// THE INSTANCE IS PER REQUEST. Its own contract: "an instance is safe to share
// within one request and must NOT be cached across requests." It is constructed
// in `createRequestScope`, never at module scope.
//
// The surface is THREE async methods - `getAllActiveCurrencyIDList`,
// `getCurrenciesByCurrencyCodeList` and `convertCurrency`. There is no
// `getCurrencySmartList`: `model/service/CurrencyService.cfc` declares exactly
// four functions [L57, L69, L79, L104] and none of them is that, so nothing here
// declares or calls one.

// ---------------------------------------------------------------------------
// 4.4  urlTitleGenerator - ASYNC, executor-backed
// ---------------------------------------------------------------------------

/**
 * Unique URL-title generation, replacing the `dataService` collaborator.
 *
 * The legacy source the AAP never names is
 * `model/service/DataService.cfc:L53-L70`. It replaces the single dependency of
 * `model/service/BrandService.cfc:L51` - which is BrandService's ENTIRE
 * dependency surface - and the same dependency in
 * `model/service/ProductService.cfc:L264-L311`.
 *
 * It performs a UNIQUENESS READ, so the composition root supplies it the narrow
 * prepared-statement executor at wiring time. That is constructor injection, not
 * a service locator: the collaborator arrives as an argument and this class
 * cannot reach for anything else.
 *
 * LEGACY-DEFECT [model/service/ProductService.cfc:L268]: the product save path
 * guards the urlTitle with a null-only test, so a product already holding an
 * EMPTY urlTitle keeps it and never reaches this generator - unlike the brand and
 * product-type paths, which also test length.
 * Preserved deliberately; do not fix without a product decision.
 */
class SqlUrlTitleGenerator implements UrlTitleGenerator {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  public async createUniqueURLTitle(
    titleString: string,
    tableName: UrlTitleTableName,
  ): Promise<string> {
    // [model/service/DataService.cfc:L55] `var addon = 1;`
    let addon = 1;

    // [L57] `reReplace(lcase(trim(titleString)), "[^a-z0-9 \-]", "", "all")`.
    // `reReplace` is the CASE-SENSITIVE form, and that is correct here rather
    // than incidental: `lcase` has already removed every capital, so the
    // negated class has nothing left to strip. The regex is therefore written
    // WITHOUT the `i` flag, matching the legacy call exactly.
    const sanitized = titleString
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '');

    // [L58] `reReplace(urlTitle, "[ ]+", "-", "all")` - runs of spaces collapse
    // to a single hyphen.
    const urlTitle = sanitized.replace(/ +/g, '-');

    // [L60] `var returnTitle = urlTitle;` - the unsuffixed candidate is tried
    // first, which is why the FIRST SUFFIX IS `-2` and never `-1`.
    let returnTitle = urlTitle;
    let unique = await this.verifyUniqueUrlTitle(tableName, returnTitle);

    // [L64-L68] the suffix loop.
    while (!unique) {
      addon += 1;
      returnTitle = `${urlTitle}-${String(addon)}`;
      unique = await this.verifyUniqueUrlTitle(tableName, returnTitle);
    }

    // [L70] `return returnTitle;`
    return returnTitle;
  }

  /**
   * CFML parity [model/dao/DataDAO.cfc:L115-L131]: `if(rs.recordCount)` answers
   * NOT unique; anything else answers unique.
   */
  private async verifyUniqueUrlTitle(
    tableName: UrlTitleTableName,
    candidate: string,
  ): Promise<boolean> {
    const rows = await this.executor.execute(SELECT_UNIQUE_URL_TITLE_SQL[tableName], [candidate]);

    if (rows.length > 0) {
      // The column is selected so that the statement matches the legacy shape;
      // reading it would add nothing, since the legacy consults only the row
      // count. The label exists so a fault names the statement.
      // Only the ROW COUNT is published. `../lib/logger.js` fails closed on any
      // context key it does not recognize as legible, and neither a table name nor a
      // candidate title is on that list - so passing them would emit `[REDACTED]`
      // and mislead a reader into thinking something was recorded. The statement
      // label exists for attribution in a fault, not for this breadcrumb.
      logger.debug(`urlTitle candidate is already taken (${SELECT_UNIQUE_URL_TITLE})`, {
        rowCount: rows.length,
      });

      return false;
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// 4.5  imageStore - ONE OF EXACTLY TWO STUB PORTS
// ---------------------------------------------------------------------------

/** The two image settings this composition resolves, and nothing else. */
type ImageFileNameSettingValues = Pick<
  SkuImageSettingValues,
  'productImageDefaultExtension' | 'productImageOptionCodeDelimiter'
>;

/**
 * The image store wired by this composition.
 *
 * ★★ THE CHOSEN STUB BEHAVIOUR, DOCUMENTED HERE BECAUSE THE PORT REQUIRES IT TO
 * BE DOCUMENTED HERE: the two I/O members REFUSE. `saveImageFile` never answers
 * `true` and never answers `false`; `deleteImageFile` never returns normally.
 * Both reject with `ImageStoreNotConfiguredError`.
 *
 * WHY REFUSAL RATHER THAN A PLAUSIBLE ANSWER. The port's obligation is absolute:
 * a caller must never be able to mistake stub output for a real successful write.
 * `deleteImageFile` returns `void`, so a silent no-op would be
 * INDISTINGUISHABLE from a successful delete - it has no channel to report
 * anything, which is why the port's own containment rule says the refusal has to
 * be a throw. And `saveImageFile`'s boolean is a statement about PERSISTENCE:
 * answering `false` would claim the store ran and declined, which is a different
 * fact from "there is no store". Both members therefore say exactly what is
 * true.
 *
 * Nothing in scope is affected. AAP 0.2.1 places the image service among the
 * collaborators "exercised only by out-of-scope branches
 * [model/service/SkuService.cfc:L210-L218]", so no in-scope path reaches either
 * member. The legacy reached the image service through a `getService()` LOCATOR,
 * not through one of SkuService's five DI properties - which is why removing the
 * locator (T2) is what put this port here at all.
 *
 * NO IMAGE BUSINESS LOGIC IS ADDED HERE, and none may be: no resizing, no format
 * conversion, no thumbnailing, no provider selection, no upload validation. No
 * Node filesystem built-in and no cloud SDK is imported - the AWS SDK is not one
 * of the fourteen pinned packages. Because this store touches no filesystem it
 * cannot traverse one, so the port's root-containment obligation has nothing to
 * contain here; that is a property of this stub and NOT a discharge of the
 * obligation, and whoever replaces it inherits the obligation in full.
 *
 * `generateSkuImageFileName` IS FULLY IMPLEMENTED, deliberately and by contrast.
 * It is not a store operation at all - it is a NAME COMPOSER with no legacy
 * collaborator call behind it, reproducing `Sku.generateImageFileName()`
 * [model/entity/Sku.cfc:L131-L139], and the port specifies its composition
 * rather than leaving it to an implementation. Stubbing it would break
 * `ProductService.processProduct_updateDefaultImageFileNames`, which is in scope.
 */
class RefusingImageStore implements ImageStore {
  public constructor(private readonly settingValues: ImageFileNameSettingValues) {}

  public saveImageFile(
    uploadResult: ImageUploadResultProjection,
    filePath: string,
    allowedExtensions: string,
  ): Promise<boolean> {
    // The three parameter names are the legacy's, verbatim and in order
    // [model/service/SkuService.cfc:L212], and `allowedExtensions` has NO default:
    // `"jpg,jpeg,png,gif"` is a literal at the CALL SITE, a policy the caller owns.
    //
    // ★ THEY ARE REPORTED, NOT EVALUATED. An earlier revision parsed the extension
    // list and logged whether the client extension was permitted. That has been
    // removed: deciding whether an extension is allowed - or whether a path is
    // containable - IS image business logic, and none may be added at the
    // composition root. Worse, a refusal annotated "extension permitted" invites
    // exactly the misreading this stub exists to prevent. What the caller asked for
    // travels into the refusal instead, where it aids diagnosis and can decide
    // nothing.
    return Promise.reject(
      new ImageStoreNotConfiguredError(
        'saveImageFile',
        `filePath='${filePath}', allowedExtensions='${allowedExtensions}', ` +
          `clientFileExt='${uploadResult.clientFileExt}'`,
      ),
    );
  }

  public deleteImageFile(filePath: string): Promise<void> {
    // The port is explicit that a refusal here MUST be a throw: this method returns
    // nothing at all, so it has no channel through which to report one.
    return Promise.reject(
      new ImageStoreNotConfiguredError('deleteImageFile', `filePath='${filePath}'`),
    );
  }

  /**
   * Compose one SKU's default-image file name, per the port's five-point
   * specification.
   *
   *   1. Sanitise by removing every character outside `[^a-z0-9\-_]`
   *      CASE-INSENSITIVELY. [model/entity/Sku.cfc:L135] and [L138] both use
   *      `reReplaceNoCase`, and the `NoCase` is load-bearing: with
   *      case-insensitive matching the negated class does not match `A-Z`
   *      either, so CAPITAL LETTERS SURVIVE. Dropping the `i` flag would change
   *      the file name of every SKU whose product code has a capital in it.
   *   2. Sanitise the product code and EACH option code separately, never the
   *      joined result - a delimiter setting outside the permitted class would
   *      not survive its own sanitisation.
   *   3. Prefix EVERY option code with `productImageOptionCodeDelimiter`, so the
   *      name carries a leading delimiter on its first option segment and none
   *      at the end [L135].
   *   4. Append `"." + productImageDefaultExtension` [L138]. The dot belongs to
   *      the composition, not to the setting.
   *   5. Treat an absent product code or option code as the empty string, so a
   *      descriptor with neither composes to `".jpg"`. That is the value, not an
   *      invented fallback.
   *
   * It writes nothing, probes nothing and verifies nothing.
   */
  public generateSkuImageFileName(descriptor: SkuImageFileNameDescriptor): string {
    let fileName = sanitizeImageNameSegment(descriptor.productCode);

    for (const optionCode of descriptor.imageGroupOptionCodes) {
      fileName += this.settingValues.productImageOptionCodeDelimiter;
      fileName += sanitizeImageNameSegment(optionCode);
    }

    return `${fileName}.${this.settingValues.productImageDefaultExtension}`;
  }
}

/** Point 1 of the file-name specification, applied to one segment. */
function sanitizeImageNameSegment(segment: string | undefined): string {
  return (segment ?? '').replace(/[^a-z0-9\-_]/gi, '');
}

// ---------------------------------------------------------------------------
// 4.6  subscriptionTermProvider - THE OTHER STUB PORT
// ---------------------------------------------------------------------------

/**
 * The subscription term provider wired by this composition.
 *
 * ★★ THE CHOSEN STUB BEHAVIOUR, DOCUMENTED HERE: both members REFUSE, rejecting
 * with `SubscriptionTermsNotConfiguredError`. Neither ever answers `undefined`.
 *
 * WHY. `undefined` on these members means "no row matches" - a factual claim
 * about `SwSubscriptionTerm` and `SwSubscriptionBenefit` data that a provider
 * with no data source cannot make. Answering it would let a caller record a SKU
 * as having no subscription term when the truth is that nothing looked.
 *
 * Nothing in scope is affected, and the observable structure of the legacy
 * branches is unchanged: subscription handling is out of scope, the only callers
 * are `SkuService.createSkus`'s subscription branch
 * [model/service/SkuService.cfc:L139-L202] and
 * `ProductService.processProduct_addSubscriptionTerm`, and it replaces
 * `property name="subscriptionService"` at [model/service/SkuService.cfc:L55]
 * and [model/service/ProductService.cfc:L59] - a DI property, NOT a service
 * locator.
 *
 * LEGACY-DEFECT [model/service/SkuService.cfc:L163-L165]: the
 * `renewalSubscriptionBenefits` loop dereferences the loaded benefit with NO
 * null guard, unlike the guarded sites at [L142] and [L147], so an unknown
 * identifier raises there and is silently skipped at the other two.
 * Preserved deliberately; do not fix without a product decision.
 *
 * NO SUBSCRIPTION BUSINESS LOGIC IS ADDED HERE, and none may be. The two handles
 * are mutually non-assignable branded shapes and are neither collapsed into one
 * type nor into `string`. The `contentAccess` branch
 * [model/service/SkuService.cfc:L173-L202] has NO port and none is invented.
 */
class RefusingSubscriptionTermProvider implements SubscriptionTermProvider {
  public getSubscriptionTerm(
    subscriptionTermID: string,
  ): Promise<SubscriptionTermHandle | undefined> {
    // REFUSE, NEVER ANSWER `undefined`. The port documents `undefined` as "no row
    // matched", which is a FACTUAL CLAIM ABOUT DATA that a provider reaching no data
    // cannot make. Returning it would let [model/service/SkuService.cfc:L158]'s
    // guarded branch quietly skip work the legacy performed.
    return Promise.reject(
      new SubscriptionTermsNotConfiguredError(
        'getSubscriptionTerm',
        `subscriptionTermID='${subscriptionTermID}'`,
      ),
    );
  }

  public getSubscriptionBenefit(
    subscriptionBenefitID: string,
  ): Promise<SubscriptionBenefitHandle | undefined> {
    // LEGACY-DEFECT [model/service/SkuService.cfc:L163-L165]: the
    // `renewalSubscriptionBenefits` loop reaches this lookup with NO preceding
    // existence guard, unlike the guarded reads at [L142] and [L147], so the legacy
    // raised there on a null.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The refusal below reaches that unguarded site as a raise, which is what the
    // legacy did; the guarded sites still see a raise rather than a false negative.
    return Promise.reject(
      new SubscriptionTermsNotConfiguredError(
        'getSubscriptionBenefit',
        `subscriptionBenefitID='${subscriptionBenefitID}'`,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 4.7  The per-SKU feed setting resolver
// ---------------------------------------------------------------------------

/**
 * Per-SKU shipping-weight settings for the product feed.
 *
 * `googleFeedRepository.ts` states that a resolver "is free to answer from one
 * query, from a warmed table or FROM DECLARED DEFAULTS", and declared defaults
 * are what this composition can honestly answer with:
 * `skuShippingWeight` is declared `1` [model/service/SettingService.cfc:L232] and
 * `skuShippingWeightUnitCode` `"lb"` [L233]. Neither key is one of the four
 * `settingsProvider` admits, and a per-SKU override lives in `SwSetting` rows
 * whose resolution order [model/service/SettingService.cfc:L104] walks the
 * product, the product-type path and the brand - a lookup that belongs to a
 * settings owner, not to this root, and that no in-scope port exposes.
 *
 * ANSWERING EVERY SUBJECT IS THE CONTRACT. The returned map has one entry per
 * subject keyed by `skuID`; answering fewer would be a contract violation, and
 * the repository would have no value for the row it is building. Duplicate
 * subjects collapse onto one entry, which is what a map keyed by SKU means.
 *
 * ONLY `skuID` IS READ, AND THAT IS DELIBERATE. An earlier revision also counted
 * how many subjects carried a `productTypeID` and a `brandID`, to "keep the seam
 * visible". Those counters decided nothing, the logger redacts every key they
 * could have been published under, and a resolver that inspects the walk order's
 * inputs while ignoring the walk reads as a half-finished lookup rather than a
 * declared default. The three unused identifiers stay on the port because a real
 * resolver needs them; this one keys by SKU and answers the declared defaults.
 */
class DeclaredDefaultSkuFeedSettingResolver implements SkuFeedSettingResolver {
  public resolveSkuShippingWeightSettings(
    subjects: readonly SkuFeedSettingSubject[],
  ): Promise<ReadonlyMap<string, ResolvedSkuShippingWeightSetting>> {
    const resolved = new Map<string, ResolvedSkuShippingWeightSetting>();

    for (const subject of subjects) {
      resolved.set(subject.skuID, {
        skuShippingWeight: SKU_SHIPPING_WEIGHT_DEFAULT,
        skuShippingWeightUnitCode: SKU_SHIPPING_WEIGHT_UNIT_CODE_DEFAULT,
      });
    }

    // Legible keys only; see the note at `SqlUrlTitleGenerator`. `rowCount` is what
    // was asked about and `resultCount` what was answered, and they must agree -
    // every subject is answered, because the declared defaults apply unconditionally.
    logger.debug('Resolved per-SKU shipping-weight settings from declared defaults', {
      rowCount: subjects.length,
      resultCount: resolved.size,
    });

    return Promise.resolve(resolved);
  }
}

// ===========================================================================
// SECTION 5 - THE FRAMEWORK-GENERIC READS THIS ROOT OWNS
//
// Three ported services declare a collaborator interface for a read the legacy
// obtained from the Hibachi framework rather than from a DAO the AAP puts in
// scope - a generic `get<Entity>(primaryKey)` affordance, an ORM association on
// an out-of-scope entity, or a smart-list page. None of those is a port, none may
// become a fourteenth port, and none may widen an existing port. They are
// declared by the service that needs them FOR THIS ROOT TO SATISFY, and this is
// where they are satisfied.
//
// Every statement is a literal with positional parameters (E5). Each read's
// FETCH SHAPE is an explicit decision, recorded at the method, because
// Hibernate's lazy collections have no counterpart here and laziness is never
// simulated (T3).
// ===========================================================================

/**
 * Hydrate one `SwOptionGroup` row.
 *
 * `options` is taken BY REFERENCE by the entity, so passing a mutable array lets
 * the caller populate the association after construction and gives one `Option`
 * instance per row on both sides of the relationship.
 */
function hydrateOptionGroup(
  row: SqlRow,
  statementLabel: string,
  columnPrefix: string,
  options: Option[],
): OptionGroup | undefined {
  const optionGroupID = readOptionalText(row, `${columnPrefix}optionGroupID`, statementLabel);

  // A null group identifier is the LEFT JOIN answering "this option has no
  // group", which [model/entity/Option.cfc:L59] permits.
  if (optionGroupID === undefined) {
    return undefined;
  }

  return new OptionGroup({
    optionGroupID,
    optionGroupName: readOptionalText(row, `${columnPrefix}optionGroupName`, statementLabel),
    optionGroupCode: readOptionalText(row, `${columnPrefix}optionGroupCode`, statementLabel),
    optionGroupImage: readOptionalText(row, `${columnPrefix}optionGroupImage`, statementLabel),
    optionGroupDescription: readOptionalText(
      row,
      `${columnPrefix}optionGroupDescription`,
      statementLabel,
    ),
    imageGroupFlag: readFlag(row, `${columnPrefix}imageGroupFlag`, statementLabel),
    // `required="true"` on the column [model/entity/OptionGroup.cfc:L58], and the
    // entity declares it non-optional, so a null is a schema surprise rather
    // than a value to substitute for.
    sortOrder: readRequiredInteger(row, `${columnPrefix}sortOrder`, statementLabel),
    remoteID: readOptionalText(row, `${columnPrefix}remoteID`, statementLabel),
    createdDateTime: readTimestamp(row, `${columnPrefix}createdDateTime`, statementLabel),
    createdByAccountID: readOptionalText(row, `${columnPrefix}createdByAccountID`, statementLabel),
    modifiedDateTime: readTimestamp(row, `${columnPrefix}modifiedDateTime`, statementLabel),
    modifiedByAccountID: readOptionalText(
      row,
      `${columnPrefix}modifiedByAccountID`,
      statementLabel,
    ),
    options,
    // The entity supplies its own tie-breaker when none is handed in; this root
    // has no reason to substitute a different one.
    optionSortTieBreaker: undefined,
  });
}

/** Hydrate one `SwOption` row, binding it to an already-built group. */
function hydrateOption(
  row: SqlRow,
  statementLabel: string,
  optionGroup: OptionGroup | undefined,
): Option {
  return new Option({
    optionID: readIdentifier(row, 'optionID', statementLabel),
    optionCode: readOptionalText(row, 'optionCode', statementLabel),
    optionName: readOptionalText(row, 'optionName', statementLabel),
    optionDescription: readOptionalText(row, 'optionDescription', statementLabel),
    sortOrder: readOptionalInteger(row, 'sortOrder', statementLabel),
    optionGroup,
    defaultImageID: readOptionalText(row, 'defaultImageID', statementLabel),
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
  });
}

/**
 * The two entity-by-identifier loaders `ProductService` needs.
 *
 * ★ THE OPTION-HYDRATION GAP, AND ITS SANCTIONED RESOLUTION.
 * [model/service/SkuService.cfc:L74] and [model/service/ProductService.cfc:L115,
 * L130, L176] load `Option` and `OptionGroup` entities BY IDENTIFIER, using the
 * framework's generic `get<Entity>(primaryKey)` affordance that
 * `model/service/OptionService.cfc` never declared. Meanwhile
 * `src/domain/ports/optionRepository.ts` is CLOSED at exactly two members,
 * `getUnusedProductOptions` and `getUnusedProductOptionGroups`, and BOTH answer
 * `readonly SelectOption[]` rather than entities - so neither is an
 * entity-by-identifier loader and neither can be made into one.
 *
 * JUDGMENT CALL: `productService.ts` therefore declares the two loaders on its
 * own `OptionLoadingCollaborator` "for bootstrap to satisfy", and this class is
 * that satisfaction. NO MEMBER IS ADDED to `optionRepository`, NO NEW PORT FILE
 * is created, there is no fourteenth port, and no nineteenth entity is
 * introduced. The loaders read the same `Sw*` tables the option repository reads,
 * through the same executor, with prepared statements.
 */
class SqlOptionEntityLoader {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  /**
   * One option, with its group.
   *
   * FETCH SHAPE: the group arrives with an EMPTY options collection, exactly as
   * `mysqlSkuRepository.ts` hydrates a group reached through a SKU's option.
   * Both in-scope readers of an option loaded this way take only the group's
   * identifier - [model/service/ProductService.cfc:L144] compares
   * `existingOption.getOptionGroup().getOptionGroupID()` - so materializing the
   * group's siblings would issue a query no caller reads. A caller that needs the
   * siblings asks for the group itself, where they ARE materialized.
   */
  public async getOption(optionID: string): Promise<Option | undefined> {
    const rows = await this.executor.execute(SELECT_OPTION_WITH_GROUP_BY_ID_SQL, [optionID]);
    const row = rows[0];

    if (row === undefined) {
      return undefined;
    }

    const optionGroup = hydrateOptionGroup(
      row,
      SELECT_OPTION_WITH_GROUP_BY_ID,
      OPTION_GROUP_ALIAS_PREFIX,
      [],
    );

    return hydrateOption(row, SELECT_OPTION_WITH_GROUP_BY_ID, optionGroup);
  }

  /**
   * One option group, with its options materialized.
   *
   * FETCH SHAPE: the options ARE materialized, in the association's own order,
   * because the caller reads them - [model/service/ProductService.cfc:L115]
   * chains `getOptionGroup(id).getOptions()` and then indexes the first element
   * at [L117-L119]. Two statements rather than a join, so that a group with no
   * options is a group with an empty collection rather than a row that has to be
   * distinguished from an outer-join null.
   *
   * The relationship is populated in BOTH directions with ONE instance per row:
   * each option is constructed with this group, and each is pushed into the same
   * array the group holds by reference. That reproduces what
   * [model/entity/Option.cfc:L92-L96] maintains by hand on the legacy setter.
   */
  public async getOptionGroup(optionGroupID: string): Promise<OptionGroup | undefined> {
    const groupRows = await this.executor.execute(SELECT_OPTION_GROUP_BY_ID_SQL, [optionGroupID]);
    const groupRow = groupRows[0];

    if (groupRow === undefined) {
      return undefined;
    }

    const options: Option[] = [];
    const optionGroup = hydrateOptionGroup(groupRow, SELECT_OPTION_GROUP_BY_ID, '', options);

    if (optionGroup === undefined) {
      // Unreachable through this statement: `optionGroupID` is the primary key
      // and was matched by the WHERE clause, so it cannot read back as null.
      // Handled rather than asserted, because `!` is banned in `src/**`.
      throw new CompositionDataError(
        `option group '${optionGroupID}' matched a row whose primary key read back as null`,
      );
    }

    const optionRows = await this.executor.execute(SELECT_OPTIONS_BY_OPTION_GROUP_ID_SQL, [
      optionGroupID,
    ]);

    for (const optionRow of optionRows) {
      options.push(hydrateOption(optionRow, SELECT_OPTIONS_BY_OPTION_GROUP_ID, optionGroup));
    }

    return optionGroup;
  }
}

/**
 * The two price-group reads `PriceGroupService` declares.
 *
 * Satisfied structurally, with no `implements` clause: the interface is
 * module-local to `priceGroupService.ts` and is checked at the constructor call.
 */
class SqlPriceGroupFrameworkReads {
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly priceGroupRepository: PriceGroupRepository,
  ) {}

  /**
   * The price groups assigned DIRECTLY to an account.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L276, L351, L365]:
   * `account.getPriceGroups()`, the ORM association on the out-of-scope `Account`
   * entity, which is identified opaquely here.
   *
   * DIRECT ASSIGNMENT ONLY. It must NOT fold in subscription price groups:
   * `calculateSkuPriceBasedOnAccount` adds those itself at [L277-L284] while
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount` deliberately does not, and
   * quietly merging them here would erase a documented legacy defect.
   *
   * Each price group is hydrated by its own repository, so there is exactly one
   * hydration path for a `PriceGroup` and this read owns none of it.
   */
  public async getAccountPriceGroups(accountID: string): Promise<readonly PriceGroup[]> {
    const rows = await this.executor.execute(SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL, [accountID]);

    return this.hydrateByIdentifier(rows, SELECT_ACCOUNT_PRICE_GROUP_IDS);
  }

  /**
   * The CURRENT PAGE of price groups.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L233-L236]: legacy builds a
   * framework smart list and iterates `getPageRecords()`. NO PAGE SIZE AND NO
   * SORT IS ASSERTED, because the source states neither - see
   * `SELECT_PRICE_GROUP_PAGE_IDS_SQL`. Inventing either would invent observable
   * behaviour, so the page is the collection.
   */
  public async getPriceGroupPageRecords(): Promise<readonly PriceGroup[]> {
    const rows = await this.executor.execute(SELECT_PRICE_GROUP_PAGE_IDS_SQL);

    return this.hydrateByIdentifier(rows, SELECT_PRICE_GROUP_PAGE_IDS);
  }

  /**
   * Turn identifier rows into entities, de-duplicating identifiers first.
   *
   * A link table can name the same price group twice; the ORM association could
   * not, so the duplicate is collapsed rather than hydrated twice. A dangling
   * identifier is a foreign-key violation the `Sw*` schema forbids, so it is
   * reported rather than skipped: skipping would silently price an order as
   * though the account had fewer price groups than it does.
   */
  private async hydrateByIdentifier(
    rows: readonly SqlRow[],
    statementLabel: string,
  ): Promise<readonly PriceGroup[]> {
    const seenIdentifiers = new Set<string>();
    const priceGroups: PriceGroup[] = [];

    for (const row of rows) {
      const priceGroupID = readIdentifier(row, 'priceGroupID', statementLabel);

      if (seenIdentifiers.has(priceGroupID)) {
        continue;
      }

      seenIdentifiers.add(priceGroupID);

      const priceGroup = await this.priceGroupRepository.getPriceGroup(priceGroupID);

      if (priceGroup === undefined) {
        throw new CompositionDataError(
          `statement '${statementLabel}' named price group '${priceGroupID}', which SwPriceGroup ` +
            'does not contain',
        );
      }

      priceGroups.push(priceGroup);
    }

    return priceGroups;
  }
}

/**
 * The one promotion read `PromotionService` declares.
 *
 * Satisfied structurally, with no `implements` clause. The return is
 * NON-OPTIONAL, so an unknown identifier is reported rather than resolved to
 * `undefined`: the legacy reached this value through the framework's generic
 * entity loader on a foreign key the schema constrains, and a promotion reward
 * whose promotion has vanished cannot be priced.
 *
 * FETCH SHAPE: the promotion arrives with `promotionPeriods`, `promotionCodes`
 * and `appliedPromotions` UNMATERIALIZED - the entity resolves each absent
 * collection to an empty array. The service reads the promotion's own columns;
 * the periods and codes it works with arrive on the reward graph the promotion
 * repository already materialized, so fetching them again here would issue
 * queries no caller reads.
 */
class SqlPromotionFrameworkReads {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  public async getPromotion(promotionID: string): Promise<Promotion> {
    const rows = await this.executor.execute(SELECT_PROMOTION_BY_ID_SQL, [promotionID]);
    const row = rows[0];

    if (row === undefined) {
      throw new CompositionDataError(
        `promotion '${promotionID}' is referenced but SwPromotion does not contain it`,
      );
    }

    return new Promotion({
      promotionID: readIdentifier(row, 'promotionID', SELECT_PROMOTION_BY_ID),
      promotionName: readOptionalText(row, 'promotionName', SELECT_PROMOTION_BY_ID),
      promotionSummary: readOptionalText(row, 'promotionSummary', SELECT_PROMOTION_BY_ID),
      promotionDescription: readOptionalText(row, 'promotionDescription', SELECT_PROMOTION_BY_ID),
      // Handed over RAW, so the entity applies the ORM default of `1`
      // [model/entity/Promotion.cfc:L56] rather than this root deciding it.
      activeFlag: readFlag(row, 'activeFlag', SELECT_PROMOTION_BY_ID),
      defaultImageID: readOptionalText(row, 'defaultImageID', SELECT_PROMOTION_BY_ID),
      remoteID: readOptionalText(row, 'remoteID', SELECT_PROMOTION_BY_ID),
      createdDateTime: readTimestamp(row, 'createdDateTime', SELECT_PROMOTION_BY_ID),
      createdByAccountID: readOptionalText(row, 'createdByAccountID', SELECT_PROMOTION_BY_ID),
      modifiedDateTime: readTimestamp(row, 'modifiedDateTime', SELECT_PROMOTION_BY_ID),
      modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', SELECT_PROMOTION_BY_ID),
    });
  }
}

/**
 * Read every `SwCurrency` row, once, at composition time.
 *
 * The projection carries only `currencyCode` and `activeFlag`, which is the whole
 * of what the converter needs [model/entity/Currency.cfc:L52-L53]. `Currency` is
 * not one of the eighteen in-scope entities, so there is no entity to hydrate.
 *
 * VALIDATING THE THREE-CHARACTER WIDTH IS THE RECORD SUPPLIER'S JOB, at the
 * boundary where the row is read, which is here: `toCurrencyCode` brands the
 * value and raises on anything else. The converter's listing methods therefore
 * cannot raise, which is what makes their promises honest.
 */
async function readCurrencyRecords(
  executor: PreparedStatementExecutor,
): Promise<readonly CurrencyRecordProjection[]> {
  const rows = await executor.execute(SELECT_CURRENCY_RECORDS_SQL);

  return rows.map((row: SqlRow): CurrencyRecordProjection => ({
    currencyCode: toCurrencyCode(readIdentifier(row, 'currencyCode', SELECT_CURRENCY_RECORDS)),
    activeFlag: readFlag(row, 'activeFlag', SELECT_CURRENCY_RECORDS),
  }));
}

/**
 * The eagerly-resolved value of `setting('skuEligibleCurrencies')`.
 *
 * CFML parity [model/service/SettingService.cfc:L222]: the setting's default is
 * `getCurrencyService().getAllActiveCurrencyIDList()`, and
 * [model/service/CurrencyService.cfc:L57-L67] applies `addFilter('activeFlag', 1)`
 * and returns a COMMA-DELIMITED LIST STRING. Both properties are reproduced: the
 * `activeFlag` filter is applied here - the one place it belongs - and the result
 * is a list string, because that is what the setting's consumers read.
 *
 * THIS IS WHY THE COMPOSITION ROOT HAS AN ASYNCHRONOUS INITIALIZER AT ALL. The
 * settings port's `setting()` is SYNCHRONOUS and returns a non-optional
 * `string`, so the value cannot be resolved on demand; it must exist before the
 * provider is handed to the domain layer. It is resolved inside the memoized
 * initializer, never with a top-level `await` - the CJS bundle forbids one.
 *
 * The gate this feeds is real: `Sku.getCurrencyDetails()` wraps its entire body
 * in `if(len(setting('skuEligibleCurrencies')))` [model/entity/Sku.cfc:L373], so
 * an empty list leaves the currency map empty and EVERY currency accessor
 * answers nothing. An installation with no active currency row reaches exactly
 * that state, and it is preserved rather than papered over with a substituted
 * default.
 */
async function resolveEligibleCurrencyCodeList(
  records: readonly CurrencyRecordProjection[],
  rates: EuropeanCentralBankRateTable,
): Promise<string> {
  // THE ACTIVE FILTER IS NOT RE-IMPLEMENTED HERE. `getAllActiveCurrencyIDList`
  // already applies it, and a second copy of the same predicate could drift from
  // the one the SKU cascade reads - which would mean two different answers to
  // "which currencies are eligible" and therefore two different prices. A
  // TRANSIENT converter is built for this single question and DISCARDED: it is
  // never retained, never returned and never shared, which honours the adapter's
  // own rule that an instance must not be cached across requests. Every request
  // builds its own in `createRequestScope`.
  const eligibleCurrencyReader = new EuropeanCentralBankCurrencyConverter(records, rates);
  const activeCurrencyCodes = await eligibleCurrencyReader.getAllActiveCurrencyIDList();

  // The legacy returns a COMMA-DELIMITED LIST STRING, and the setting's readers
  // measure it with `len()` [model/entity/Sku.cfc:L373] and split it with
  // `listToArray`. The list form is therefore part of the contract, not a
  // formatting choice.
  return activeCurrencyCodes.join(',');
}

// ===========================================================================
// SECTION 6 - TIER 1: THE MODULE-SCOPE GRAPH
//
// Created once, reused across warm invocations, in this exact order:
//   1. read configuration
//   2. resolve the SQL dialect, failing hard
//   3. create THE ONE pool, behind its narrow executor
//   4. resolve the eager settings value and build the settings provider
//   5. build the stateless adapters
//   6. publish a single explicitly-typed accessor
//
// Only genuinely stateless, immutable collaborators live here. Anything holding a
// memo belongs to tier 2 - see section 7.
// ===========================================================================

/**
 * Everything tier 1 owns, handed to `createRequestScope` as one value.
 *
 * Module-local: it is an internal shape of this file's wiring, not part of the
 * published surface, so it is not exported.
 */
interface ModuleScopeGraph {
  readonly config: AppConfig;
  readonly dialect: DatabaseDialect;
  readonly executor: PreparedStatementExecutor;
  readonly settingsProvider: SettingsProvider;
  readonly currencyRecords: readonly CurrencyRecordProjection[];
  readonly europeanCentralBankRates: EuropeanCentralBankRateTable;
  readonly addressZoneEvaluator: AddressZoneEvaluator;
  readonly urlTitleGenerator: UrlTitleGenerator;
  readonly imageStore: ImageStore;
  readonly imageSettingValues: SkuImageSettingValues;
  readonly subscriptionTermProvider: SubscriptionTermProvider;
  readonly skuFeedSettingResolver: SkuFeedSettingResolver;
  readonly optionEntityLoader: SqlOptionEntityLoader;
  readonly feedSettingValues: ResolvedFeedSettingValues;
  readonly integration: GoogleIntegration;
}

/**
 * The memoized tier-1 promise.
 *
 * A PROMISE, not a resolved value, and that is the concurrency guard: the
 * assignment happens synchronously before the first `await` inside
 * `createModuleScopeGraph`, so two handlers racing on a cold container share ONE
 * in-flight initialization rather than starting two. A warm container re-resolves
 * nothing.
 */
let memoizedCompositionRoot: Promise<CompositionRoot> | undefined;

/**
 * Build the module-scope graph.
 *
 * ASYNCHRONOUS ONLY BECAUSE OF THE EAGER SETTINGS RESOLUTION. There is no
 * top-level `await` anywhere in this module - the CJS bundle mandate forbids one -
 * so the one asynchronous step lives here, inside the memoized initializer that a
 * handler awaits once per invocation.
 */
async function createModuleScopeGraph(overrides: CompositionOverrides): Promise<ModuleScopeGraph> {
  // --- 1. Configuration --------------------------------------------------
  // `../lib/config.js` is STATIC PROCESS CONFIGURATION and is never used as a
  // request scope. Credentials, host, port and TLS mode come from the
  // environment and from nowhere else: NO credential, password, secret,
  // hostname, IP or connection string appears in this file. That is not merely a
  // standard - it is what the legacy did too, in its own way.
  // `config/configApplication.cfm` sets only `this.name` [L1] and
  // `this.datasource.name = "Slatwall"` [L2], while `config/configORM.cfm:L3`
  // READS `this.datasource.username` and `.password` that `configApplication.cfm`
  // never sets: the legacy credentials lived in the ColdFusion administrator's
  // datasource definition, outside the source tree entirely.
  const config =
    overrides.environment === undefined ? appConfig.load() : appConfig.load(overrides.environment);

  // --- 2. The dialect decision -------------------------------------------
  // JUDGMENT CALL: THIS HARD FAILURE IS A DELIBERATE IMPROVEMENT OVER THE
  // LEGACY - IT IS NOT A PORT OF `<cfabort/>`.
  //
  // `config/configORM.cfm` is fifteen lines. Its `<cfabort />` at L6 guards the
  // DATASOURCE PROBE's `<cfcatch>` [L2-L8], and nothing else. The DIALECT chain
  // that follows - L9 `<cfif findNoCase("MySQL", …)>` → L10 `"MySQL"`, L11
  // `<cfelseif findNoCase("Microsoft", …)>` → L12 `"MicrosoftSQLServer"`, L13
  // `<cfelseif findNoCase("Oracle", …)>` → L14 `"Oracle10g"`, L15 `</cfif>` -
  // HAS NO `<cfelse>`. An unrecognized `DATABASE_PRODUCTNAME` therefore left
  // `this.ormSettings.dialect` SILENTLY UNSET and execution CONTINUED.
  //
  // Here it fails hard, at startup, with no silent default. `resolveDialect`
  // case-folds, which is `findNoCase`'s case-insensitive substring semantics
  // expressed as an exact match over a closed vocabulary - and case-folding is
  // required rather than cosmetic, because the DAO layer spells the product name
  // three ways (`"MySQL"`, `"mySQL"`, `"mySql"`). `assertMySqlDialect` then
  // narrows to the MySQL branch, which is the only branch this migration targets.
  const dialect = resolveDialect(config.dialect);

  assertMySqlDialect(dialect, DIALECT_DECISION_SITE);

  // --- 3. The one pool, behind the narrow executor -----------------------
  // `getPreparedStatementExecutor()` memoizes ONE `mysql2` pool at module scope
  // inside `../repositories/mysql/connection.js`, created outside every handler
  // so that it is reused across warm invocations. THAT POOL IS THE SINGLE
  // DOCUMENTED EXCEPTION to the no-module-scope-mutable-state rule in this
  // subtree, and reusing it is AN ENGINEERING DECISION ABOUT CONNECTION REUSE -
  // never a latency, throughput or capacity target, none of which this file
  // asserts.
  //
  // What travels onwards is the EXECUTOR, never the pool: every repository and
  // every read in this file receives it as a CONSTRUCTOR PARAMETER, no consumer
  // imports the pool module, and the raw pool is not exposed beyond this
  // function. An override replaces the executor outright, so a suite that
  // supplies one never causes a pool to be created at all.
  const executor = overrides.executor ?? getPreparedStatementExecutor();

  // --- 4. The eager settings resolution ----------------------------------
  const currencyRecords = await readCurrencyRecords(executor);
  const europeanCentralBankRates =
    overrides.europeanCentralBankRates ?? EMPTY_EUROPEAN_CENTRAL_BANK_RATES;
  const skuEligibleCurrencies = await resolveEligibleCurrencyCodeList(
    currencyRecords,
    europeanCentralBankRates,
  );
  const settingsProvider = new BootstrapSettingsProvider(skuEligibleCurrencies);

  // --- 5. The stateless adapters -----------------------------------------
  // Each is immutable and holds no memo, which is what makes module scope safe
  // for it. The image and feed setting values are resolved here, once, because
  // settings resolution is this layer's responsibility - a repository that
  // resolved its own would be configuration inside business code.
  const imageSettingValues: SkuImageSettingValues = {
    baseImageURL: BASE_IMAGE_URL_DEFAULT,
    productImageOptionCodeDelimiter: PRODUCT_IMAGE_OPTION_CODE_DELIMITER_DEFAULT,
    productImageDefaultExtension: PRODUCT_IMAGE_DEFAULT_EXTENSION_DEFAULT,
  };

  const feedSettingValues: ResolvedFeedSettingValues = {
    globalURLKeyProduct: settingsProvider.setting('globalURLKeyProduct'),
    baseImageURL: BASE_IMAGE_URL_DEFAULT,
    missingImagePath: MISSING_IMAGE_PATH_DEFAULT,
  };

  const graph: ModuleScopeGraph = {
    config,
    dialect,
    executor,
    settingsProvider,
    currencyRecords,
    europeanCentralBankRates,
    addressZoneEvaluator: new CfmlAddressZoneEvaluator(),
    urlTitleGenerator: new SqlUrlTitleGenerator(executor),
    imageStore: new RefusingImageStore(imageSettingValues),
    imageSettingValues,
    subscriptionTermProvider: new RefusingSubscriptionTermProvider(),
    skuFeedSettingResolver: new DeclaredDefaultSkuFeedSettingResolver(),
    optionEntityLoader: new SqlOptionEntityLoader(executor),
    feedSettingValues,
    // No constructor parameters. [integrationServices/google/Integration.cfc:L51-L53]
    // `init()` returns `this` and the component holds no state;
    // [integrationServices/google/controllers/feed.cfc:L51] `productService` is
    // the fifth dead injection and is not wired.
    integration: new GoogleIntegration(),
  };

  // ★ THE MESSAGE CARRIES THE SIGNAL; THE CONTEXT CARRIES ONLY LEGIBLE KEYS.
  // `../lib/logger.js` treats `environment`, `config` and `settings` as OPAQUE
  // CONTAINER keys and redacts a scalar under any of them, and it fails closed on
  // every key it does not recognize - so a payload naming the dialect, the database
  // or the executor source would emit a row of `[REDACTED]` and tell a reader
  // nothing. `rowCount` and `resultCount` ARE legible, and together they publish the
  // one fact worth publishing: how many currency rows were read against how many
  // eligible codes survived the `activeFlag` filter.
  //
  // The code count goes through `listToArray` rather than `String.split`, because
  // `skuEligibleCurrencies` IS a CFML list [model/service/SettingService.cfc:L222] and
  // that helper already carries CFML's `listLen` semantics - an empty list is zero
  // elements, not one empty one.
  logger.info('Composition root wired; sku eligible currencies resolved eagerly', {
    rowCount: currencyRecords.length,
    resultCount: listToArray(skuEligibleCurrencies).length,
  });

  return graph;
}

/** Wrap the tier-1 graph in the published accessor. */
async function createCompositionRoot(overrides: CompositionOverrides): Promise<CompositionRoot> {
  const graph = await createModuleScopeGraph(overrides);

  return {
    config: graph.config,
    dialect: graph.dialect,
    settingsProvider: graph.settingsProvider,
    integration: graph.integration,
    createRequestScope: (input?: RequestScopeInput): RequestScope =>
      createRequestScope(graph, input ?? {}),
  };
}

/**
 * THE ONE ENTRY POINT INTO THE WIRED GRAPH.
 *
 * Idempotent and memoized: the first caller starts the initialization, every
 * concurrent caller awaits the same in-flight promise, and a warm container
 * resolves immediately. A FAILED initialization clears the memo, so a later
 * invocation on the same warm container can retry rather than inheriting a
 * permanently rejected promise.
 *
 * NOT A LAMBDA HANDLER. Each of the five capability handlers awaits this once per
 * invocation and then opens exactly one request scope.
 *
 * @param overrides - the test seam. ANY overrides bypass the memo entirely, so a
 *   suite can build an isolated graph over a fake executor without patching
 *   module state, and production - which passes none - is unaffected.
 */
export function bootstrapCompositionRoot(
  overrides?: CompositionOverrides,
): Promise<CompositionRoot> {
  if (overrides !== undefined) {
    return createCompositionRoot(overrides);
  }

  memoizedCompositionRoot ??= createCompositionRoot({}).catch((error: unknown): never => {
    memoizedCompositionRoot = undefined;

    throw error;
  });

  return memoizedCompositionRoot;
}

/**
 * Discard the memoized graph.
 *
 * The seam a suite uses to prove that initialization is performed once, and the
 * same idiom `appConfig.reset()` and `closeConnectionPool()` already publish. It
 * does NOT close the pool - `closeConnectionPool()` owns that - because the pool's
 * lifetime is deliberately independent of this memo's.
 */
export function resetCompositionRoot(): void {
  memoizedCompositionRoot = undefined;
}

// ===========================================================================
// SECTION 7 - TIER 2: THE PER-REQUEST SCOPE
//
// Invoked exactly once per invocation. Everything constructed here is discarded
// when the invocation ends, which is what stops a warm container from carrying
// one invocation's state - and therefore one customer's price - into another's.
//
// TWO CONSTRUCTION CYCLES ARE BROKEN HERE, BOTH WITHOUT A CAST, WITHOUT `any` AND
// WITHOUT A NON-NULL ASSERTION:
//
//   1. `RoundingRuleService` needs a `PromotionRepository`, and
//      `MysqlPromotionRepository` needs a rounder that `RoundingRuleService`
//      provides. Broken by a ONE-METHOD DELEGATING OBJECT over a late binding.
//   2. `MysqlProductRepository` needs the SKU repository, which needs a
//      price-group resolver, which is `PriceGroupService`, which needs the product
//      repository. Broken the same way, with a THREE-METHOD DELEGATING OBJECT.
//
// Both delegates are bound before this function returns and neither is invoked
// during construction, so `CompositionWiringError` is unreachable through any
// published entry point. It exists so the compiler never has to be silenced.
// ===========================================================================

function createRequestScope(graph: ModuleScopeGraph, input: RequestScopeInput): RequestScope {
  // --- The request's instant, under an explicit UTC policy ----------------
  // A `Date` IS an absolute instant - it carries no zone - so threading one and
  // comparing with it is UTC by construction, with no local-time reading
  // anywhere. Resolved ONCE here so that every date comparison inside one
  // request sees the same instant rather than a drifting clock, which is what
  // makes `PromotionPeriod.isCurrent(now)` [model/entity/PromotionPeriod.cfc:L78]
  // deterministic.
  const now = input.now ?? new Date();

  // --- The explicit replacement for ambient scope (T6) --------------------
  // [model/service/PriceGroupService.cfc:L262-L266], verbatim:
  //   L262 public numeric function calculateSkuPriceBasedOnCurrentAccount(required any sku) {
  //   L263   if(getSlatwallScope().getLoggedInFlag()) {
  //   L264     return calculateSkuPriceBasedOnAccount(sku=arguments.sku, account=getHibachiScope().getAccount());
  //   L265   } else {
  //   L266     return sku.getPrice();
  // The legacy method takes ONE parameter and reads the account from ambient
  // scope, testing `getLoggedInFlag()` first. `CurrentAccountContext` carries
  // `accountID?` and NOTHING ELSE - no session, locale, currency, timezone,
  // permission, request identifier or logger - and an ABSENT identifier is
  // exactly the L265-L266 else arm. The type is honoured as
  // `src/domain/ports/priceGroupRepository.ts` declares it and is not extended.
  // It is constructed PER REQUEST and never read from `../lib/config.js`.
  const currentAccountContext: CurrentAccountContext =
    input.accountID === undefined ? {} : { accountID: input.accountID };

  // --- The currency converter, per request --------------------------------
  // Its own contract: an instance is safe to share within one request and must
  // NOT be cached across requests. The ECB daily-rate memo
  // [model/service/CurrencyService.cfc:L105] therefore cannot outlive a request
  // either, which is the fourth of the four legacy memo families this tier
  // re-scopes.
  const currencyConverter: CurrencyConverter = new EuropeanCentralBankCurrencyConverter(
    graph.currencyRecords,
    graph.europeanCentralBankRates,
  );

  // --- Cycle 1: rounding service <-> promotion repository -----------------
  // The initializer is spelled out rather than left implicit: the whole point of
  // this variable is that it is UNBOUND for a few statements and bound thereafter,
  // and writing that first state down is what makes the sequence legible.
  let roundingRuleServiceBinding: RoundingRuleService | undefined = undefined;

  // ONE METHOD, which is the whole of what both `mysqlPromotionRepository.ts` and
  // `mysqlPriceGroupRepository.ts` ask for. The delegate forwards; it decides
  // nothing, and it must not, because the rounding algorithm is decimal-STRING
  // manipulation whose behaviour is pinned by characterisation tests.
  const valueRounder = {
    roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
      if (roundingRuleServiceBinding === undefined) {
        throw new CompositionWiringError('roundingRuleService');
      }

      return roundingRuleServiceBinding.roundValueByRoundingRule(value, rule);
    },
  };

  const promotionRepository: PromotionRepository = new MysqlPromotionRepository(
    graph.executor,
    valueRounder,
  );

  // The rounding-rule query is hosted on `promotionRepository` as
  // `getRoundingRuleQuery` (legacy `model/dao/RoundingRuleDAO.cfc:L51`), so there
  // is NO fourteenth `roundingRuleRepository` port. Its `roundingRuleDetails`
  // memo [model/service/RoundingRuleService.cfc:L67-L77] is an instance field,
  // which is precisely why this service is per request.
  const roundingRuleService = new RoundingRuleService(promotionRepository);

  roundingRuleServiceBinding = roundingRuleService;

  // --- Cycle 2: product repository <-> SKU repository <-> price groups ----
  // Unbound for the span of the repository constructions below, bound immediately
  // after `PriceGroupService` exists. Spelled out for the same reason as above.
  let priceGroupServiceBinding: PriceGroupService | undefined = undefined;

  function requirePriceGroupService(): PriceGroupService {
    if (priceGroupServiceBinding === undefined) {
      throw new CompositionWiringError('priceGroupService');
    }

    return priceGroupServiceBinding;
  }

  /**
   * `SkuPriceGroupResolver`, satisfied by adapting the ported
   * `src/services/priceGroupService.ts` surface and injected into the `Sku`
   * entity from here - transformation rule T2, replacing the
   * `getService("priceGroupService")` locator at [model/entity/Sku.cfc:L437].
   *
   * `PriceGroupService` already declares `implements SkuPriceGroupResolver`, so
   * the instance IS one; this delegating object exists ONLY to break the
   * construction cycle, and it forwards all three members verbatim. Two are
   * SYNCHRONOUS - `calculateSkuPriceBasedOnPriceGroup`
   * [model/service/PriceGroupService.cfc:L301] and
   * `getRateForSkuBasedOnPriceGroup` [L140] - and one is ASYNC,
   * `calculateSkuPriceBasedOnCurrentAccount` [L262]. The `context` parameter that
   * method carries is the MANDATED T6 replacement of ambient state, not a
   * widening, and it consumes no budget.
   */
  const priceGroupResolver: SkuPriceGroupResolver = {
    calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money {
      return requirePriceGroupService().calculateSkuPriceBasedOnPriceGroup(sku, priceGroup);
    },

    getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined {
      return requirePriceGroupService().getRateForSkuBasedOnPriceGroup(sku, priceGroup);
    },

    calculateSkuPriceBasedOnCurrentAccount(
      sku: Sku,
      context: CurrentAccountContext,
    ): Promise<Money> {
      return requirePriceGroupService().calculateSkuPriceBasedOnCurrentAccount(sku, context);
    },
  };

  // --- The six MySQL repositories ----------------------------------------
  // Each receives the narrow executor as a constructor parameter and satisfies
  // its correspondingly-named port. `roundingRuleService` is handed to the two
  // that declare a one-method rounder; note that `MySqlPriceGroupRepository`
  // spells its class name with a capital S, which is the shipped name and is used
  // verbatim rather than "corrected".
  const priceGroupRepository: PriceGroupRepository = new MySqlPriceGroupRepository(
    graph.executor,
    roundingRuleService,
  );

  // `nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220] is an instance
  // field on this adapter, so the memo is per request.
  //
  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder`
  // guards the delete with `if not structKeyExists(variables, "nextOptionGroupSortOrder")`,
  // so it can only fire when there is nothing to clear and the memo therefore
  // survives for the life of the component.
  // Preserved deliberately; do not fix without a product decision.
  //
  // Request-scoping neutralizes the consequence without repairing the defect: a
  // memo that cannot be cleared still cannot outlive the request that created it.
  //
  // Held at its CONCRETE type, not narrowed to the port, because one instance
  // fills two roles below: the `SkuRepository` port that `ProductService` and
  // `SkuService` consume, and the `ProductSkuCascadeWriter` that the product
  // adapter borrows. Narrowing first and widening back would need a cast; keeping
  // the concrete type needs none.
  const mysqlSkuRepository = new MysqlSkuRepository(graph.executor, {
    settingsProvider: graph.settingsProvider,
    currencyConverter,
    priceGroupResolver,
    currentAccountContext,
    imageSettingValues: graph.imageSettingValues,
  });
  const skuRepository: SkuRepository = mysqlSkuRepository;

  const optionRepository: OptionRepository = new MysqlOptionRepository(graph.executor);
  const productTypeRepository: ProductTypeRepository = new MysqlProductTypeRepository(
    graph.executor,
  );

  // The third argument is the `ProductSkuCascadeWriter` that reproduces
  // `cascade="all-delete-orphan"` on `Product.skus` [model/entity/Product.cfc:L73].
  // `MysqlSkuRepository.saveSkuForProduct` satisfies it, and the composition root
  // supplies THE SAME instance the collaborators bag carries, so one SKU adapter
  // serves both roles within a request and a cascaded write cannot diverge from a
  // direct one.
  const productRepository: ProductRepository = new MysqlProductRepository(
    graph.executor,
    {
      settingsProvider: graph.settingsProvider,
      skuRepository: mysqlSkuRepository,
      optionRepository,
      subscriptionTermProvider: graph.subscriptionTermProvider,
    },
    mysqlSkuRepository,
  );

  // --- The seven services, in dependency order ---------------------------
  // `PriceGroupService` DECLARES ONLY THREE COLLABORATORS and never injects
  // `roundingRuleService` [model/service/PriceGroupService.cfc:L51, L53, L54].
  // Rounding in the price-group path is invoked through the ENTITY instead:
  // [L326-L328] calls `priceGroupRate.getRoundingRule().roundValue(newPrice)`, and
  // `RoundingRule.roundValue(value)` is a ONE-ARGUMENT ENTITY METHOD
  // [model/entity/RoundingRule.cfc:L66-L68] - an eighth `getService()`-adjacent
  // site. So `roundingRuleService` is NOT wired into `PriceGroupService` as a
  // collaborator, and its constructor does not ask for one.
  const priceGroupService = new PriceGroupService(
    priceGroupRepository,
    productRepository,
    new SqlPriceGroupFrameworkReads(graph.executor, priceGroupRepository),
  );

  priceGroupServiceBinding = priceGroupService;

  // Its ONLY collaborator [model/service/BrandService.cfc:L51] `dataService`,
  // which is BrandService's entire dependency surface.
  const brandService = new BrandService(graph.urlTitleGenerator);

  // Legacy [model/service/OptionService.cfc:L53] declared `property name="productService"`
  // but the component body never references it. Deliberately NOT wired: injecting
  // it would import coupling that does not exist in the source.
  const optionService = new OptionService(optionRepository);

  // Legacy [model/service/SkuService.cfc:L54] declared `property name="productService"`
  // but the component body never references it. Deliberately NOT wired: injecting
  // it would import coupling that does not exist in the source.
  //
  // The fourth and fifth arguments are passed as `undefined` ON PURPOSE, so the
  // service's OWN declared defaults for the creation batch limit and the
  // duplicate-SKU-code policy apply. Restating either here would duplicate a
  // value the service owns, and inventing one would assert a bound the source
  // does not state. The sixth is the resolved image settings, which is why
  // `Sku.generateImageFileName()` can compose a name at all.
  const skuService = new SkuService(
    skuRepository,
    graph.imageStore,
    graph.subscriptionTermProvider,
    undefined,
    undefined,
    graph.imageSettingValues,
  );

  /**
   * The two loaders and the one transform `ProductService` needs.
   *
   * `getOptionsForSelect` is the already-constructed `OptionService`'s own
   * synchronous method [model/service/OptionService.cfc:L55]; the two loaders are
   * this root's, per the option-hydration judgment call in section 5. Satisfied
   * structurally - no `implements` clause, no cast.
   */
  const optionLoading: OptionLoadingCollaborator = {
    getOptionsForSelect: (options) => optionService.getOptionsForSelect(options),
    getOptionGroup: (optionGroupID) => graph.optionEntityLoader.getOptionGroup(optionGroupID),
    getOption: (optionID) => graph.optionEntityLoader.getOption(optionID),
  };

  /**
   * SKU creation, satisfied by the already-constructed `SkuService`.
   *
   * The legacy call is `getSkuService().createSkus(...)` from
   * [model/service/ProductService.cfc:L58], a live collaborator - unlike the two
   * dead declarations noted below. The two payload shapes differ, and this root
   * reconciles them rather than casting between them; see
   * `toCreateSkusInput`.
   */
  const skuCreation: SkuCreationCollaborator = {
    createSkus: async (product, data) =>
      skuService.createSkus(product, await toCreateSkusInput(data, graph.optionEntityLoader)),
  };

  // Legacy [model/service/ProductService.cfc:L54] declared `property name="productTypeDAO"`
  // and [L57] `property name="contentService"`; the component body references
  // NEITHER. Both are deliberately NOT wired as ProductService collaborators for
  // that reason. The `productTypeRepository` argument below is present because
  // this service's own constructor declares it - `searchProductsByProductType`
  // and the product-type save path both use it - and NOT because of the dead
  // `productTypeDAO` declaration. Note also that [L55] IS BLANK, which is why the
  // eight declarations span L52-L60.
  const productService = new ProductService(
    productRepository,
    skuRepository,
    productTypeRepository,
    graph.urlTitleGenerator,
    graph.imageStore,
    graph.subscriptionTermProvider,
    skuCreation,
    optionLoading,
  );

  // Three collaborators, matching [model/service/PromotionService.cfc:L51, L53,
  // L54] exactly: the promotion DAO, the address service reduced to its one
  // in-scope method, and the rounding-rule service. The fourth argument is the
  // framework-generic promotion read the service declares for this root.
  const promotionService = new PromotionService(
    promotionRepository,
    graph.addressZoneEvaluator,
    roundingRuleService,
    new SqlPromotionFrameworkReads(graph.executor),
  );

  // --- The Google integration trio ---------------------------------------
  // `salePriceSource` is the promotion repository narrowed to
  // `getSalePricePromotionRewardsQuery`, and `valueRounder` the rounding service
  // narrowed to `roundValueByRoundingRuleID`; both are structural picks, so no
  // adapter object is needed.
  const feedRepository = new GoogleFeedRepository(
    graph.executor,
    graph.feedSettingValues,
    graph.skuFeedSettingResolver,
    promotionRepository,
    roundingRuleService,
  );

  // RULING B: the feed host and the clock are CLOSED OVER AT CONSTRUCTION, which
  // is what keeps `generateProductFeed()` ZERO-PARAMETER. There is no
  // `FeedCriteria` type anywhere in this migration, and the four feed filters -
  // `activeFlag = 1` [integrationServices/google/controllers/feed.cfc:L68],
  // `product.activeFlag = 1` [L69], `product.publishedFlag = 1` [L70] and
  // `addRange('product.calculatedQATS','1^')` [L72] - are INVARIANTS of the
  // repository's statement, never options a caller can reach. The renderer is
  // left to the service's default, which is the PURE SYNCHRONOUS function
  // `renderGoogleProductFeed(rows, feedHost, now)`; nothing here overrides it.
  //
  // `toTrustedFeedHost` validates the candidate's shape and then its membership
  // of the allow-list, throwing `UntrustedFeedHostError` otherwise. An EMPTY
  // allow-list refuses everything, which is the safe failure and not a bypass.
  const productFeedPort: ProductFeedPort | undefined =
    input.feedHost === undefined
      ? undefined
      : new GoogleFeedService(
          feedRepository,
          toTrustedFeedHost(input.feedHost.candidate, input.feedHost.allowedHosts),
          now,
        );

  return {
    now,
    currentAccountContext,
    productRepository,
    skuRepository,
    optionRepository,
    productTypeRepository,
    promotionRepository,
    priceGroupRepository,
    roundingRuleService,
    brandService,
    optionService,
    skuService,
    productService,
    priceGroupService,
    promotionService,
    currencyConverter,
    productFeedPort,
    getSalePriceDetailsForProductSkus: (productID) =>
      promotionService.getSalePriceDetailsForProductSkus(productID),
    updateOrderAmountsWithPriceGroupsThenPromotions: (order) =>
      updateOrderAmountsWithPriceGroupsThenPromotions(
        priceGroupService,
        promotionService,
        priceGroupRepository,
        order,
      ),
  };
}

/**
 * Reconcile the product-save payload with the SKU-creation payload.
 *
 * ★ TWO SIBLING CONTRACTS DIFFER, AND THE COMPOSITION ROOT IS WHERE THEY MEET.
 * `SkuCreationCollaborator.createSkus` declares `ProductSaveInput`, whose `price`
 * and `listPrice` are `Money`; `SkuService.createSkus` declares `CreateSkusInput`,
 * whose `price` and `listPrice` are the DECIMAL NUMERALS the legacy struct carried,
 * read with `isNumeric` and compared with `>` [model/service/SkuService.cfc:L93-L96].
 * Neither contract is wrong: the product tier holds resolved money, the SKU tier
 * reproduces a CFML struct read. Reconciling them is wiring, so it happens here,
 * and it happens by CONVERSION - never by a cast, an `any` or an assertion.
 *
 * ★ AND THIS IS WHERE OPTION HYDRATION LANDS - THE §5.3 JUDGMENT CALL, HONOURED
 * RATHER THAN RE-DECIDED. `CreateSkusInput.resolvedOptions` states that
 * [model/service/SkuService.cfc:L74]'s `getOption(id)` was `HibachiService`'s
 * generic `get<Entity>(primaryKey)` accessor, that `optionRepository` is LOCKED at
 * two members returning `SelectOption[]`, and that hydration is therefore the
 * BOUNDARY's responsibility. This is that boundary. NO member was added to
 * `optionRepository`, NO new port file was created, and there is no fourteenth
 * port.
 *
 * `data.options` is passed through UNTOUCHED, so the [L73] iteration order, the
 * [L74] one-based positional read and any duplicate identifiers all survive
 * exactly. Only the ID-to-entity step moves.
 *
 * ★ AN UNRESOLVABLE IDENTIFIER IS LEFT UNRESOLVED, DELIBERATELY. The loader's miss
 * is not reported here: the identifier is simply absent from `resolvedOptions`, and
 * `SkuService`'s own `resolveOptionByID` then raises at the exact legacy locator
 * with the exact legacy reasoning. Raising here instead would move a documented
 * failure away from the line that documents it.
 *
 * @param data The product-save payload the product tier hands over.
 * @param optionLoader This root's option loader.
 */
async function toCreateSkusInput(
  data: ProductSaveInput,
  optionLoader: SqlOptionEntityLoader,
): Promise<CreateSkusInput> {
  const optionIDList = data.options;

  // De-duplicated because `resolveOptionByID` matches by identifier rather than by
  // position, so one entity per DISTINCT identifier is exactly what it needs.
  // Folding the de-duplication key mirrors the case-folding comparison that helper
  // performs; a repeated identifier in `data.options` still yields a repeated read
  // there, which is the legacy's behaviour.
  const resolvedOptions: Option[] = [];

  if (optionIDList !== undefined && optionIDList.length > 0) {
    const seenOptionIDs = new Set<string>();

    for (const optionID of listToArray(optionIDList)) {
      const foldedOptionID = foldIdentifier(optionID);

      if (seenOptionIDs.has(foldedOptionID)) {
        continue;
      }

      seenOptionIDs.add(foldedOptionID);

      const option = await optionLoader.getOption(optionID);

      if (option !== undefined) {
        resolvedOptions.push(option);
      }
    }
  }

  if (data.price === undefined) {
    // LEGACY-NOTE [model/service/SkuService.cfc:L93]: `arguments.data.price` is read
    // with NO `structKeyExists` guard - at [L93], [L129], [L156], [L157], [L183] and
    // [L193] - so an absent price raised in CFML. It raises here too, for the same
    // reason and with no default substituted: `Money.zero` is never a fallback in a
    // price path, because a silent zero sells product for free. The one nuance worth
    // stating plainly is ORDER, not outcome: `SkuService` reads the price lazily at
    // each site so that the subscription and contentAccess arms - both out of scope -
    // raise on their own validation first, whereas this refusal precedes the call.
    // The call fails either way, and for the same cause.
    throw new CompositionDataError(
      'SKU creation was asked for without a price. [model/service/ProductService.cfc:L133] ' +
        'reads it unguarded from the default SKU, and [model/service/SkuService.cfc:L93] ' +
        'reads it unguarded again, so a missing price raised in the legacy as well. No ' +
        'default is substituted.',
    );
  }

  return {
    price: data.price.toDecimalString(),
    listPrice: data.listPrice === undefined ? undefined : data.listPrice.toDecimalString(),
    options: optionIDList,
    resolvedOptions,
  };
}

// ===========================================================================
// SECTION 8 - THE COMPOSED PRICING OPERATION
//
// ★ THE CROSS-SERVICE ORDERING CONSTRAINT, MADE STRUCTURALLY IMPOSSIBLE TO INVERT.
//
// `PriceGroupService.updateOrderAmountsWithPriceGroups()`
// [model/service/PriceGroupService.cfc:L364-L375] MUST run BEFORE
// `PromotionService.updateOrderAmountsWithPromotions()`
// [model/service/PromotionService.cfc:L58]. In the legacy system that held ONLY
// because `OrderService` happened to call them in that sequence - the two
// injections are adjacent, [model/service/OrderService.cfc:L60] and [L61] - and
// nothing in either service declared the dependency.
//
// THE WRITER, verbatim [model/service/PriceGroupService.cfc:L364-L375]:
//   L364 public void function updateOrderAmountsWithPriceGroups(required any order)
//   L365   guard: !isNull(order.getAccount()) && arrayLen(order.getAccount().getPriceGroups())
//   L367   getBestPriceGroupDetailsBasedOnSkuAndAccount(orderItems[i].getSku(), order.getAccount())
//   L369   conditional: priceGroupDetails.price < orderItems[i].getPrice() && isObject(priceGroupDetails.priceGroup)
//   L370     orderItems[i].setPrice(priceGroupDetails.price);
//   L371     orderItems[i].setAppliedPriceGroup(priceGroupDetails.priceGroup);
//
// THE READER, verbatim [model/service/PromotionService.cfc:L240-L257]. THE
// COMMONLY-REPEATED READING OF THIS BRANCH IS EXACTLY BACKWARDS; the source is
// authoritative and the transposition is not propagated here:
//   L240 // If there is not applied Price Group, or if this reward has the applied pricegroup as an eligible one then use priceExtended... otherwise use skuPriceExtended and then adjust the discount.
//   L241 if( isNull(orderItem.getAppliedPriceGroup()) || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() ) ) {
//   L244   var discountAmount = getDiscountAmount(reward, orderItem.getPrice(), discountQuantity);
//   L246 } else {
//   L249   var originalDiscountAmount = getDiscountAmount(reward, orderItem.getSkuPrice(), discountQuantity);
//   L252   var discountAmount = precisionEvaluate('originalDiscountAmount - (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())');
//   L254 }
//   L257 if(discountAmount > 0) {
// ⇒ NULL-OR-ELIGIBLE ⇒ `getPrice()` with NO correction.
// ⇒ OTHERWISE ⇒ `getSkuPrice()` PLUS the correction term.
//
// ★ THE COROLLARY THAT MAKES THE ORDERING UNCONDITIONAL: `getAppliedPriceGroup()`
// is read at L241 IN THE BRANCH CONDITION ITSELF, so the obligation holds
// whichever arm executes. And because the L370/L371 write is CONDITIONAL, an
// order item may legitimately still carry NO applied price group after the pass
// has run - which is precisely the L241 `isNull(...)` arm. The price-group pass
// must therefore run FIRST, UNCONDITIONALLY, and "it wrote nothing" is a valid
// outcome rather than a reason to skip it.
//
// ENFORCEMENT IS STRUCTURAL, NOT PARAMETRIC. The two passes are published to
// `promotionApplicationHandler.ts` as ONE composed operation whose internal
// sequence the caller cannot reach: no `sequence`, `phase`, `runAfter` or
// `pipeline` parameter exists on any port or on this function, because a
// parameter is something a caller can get wrong.
//
// Note in passing that `var discountAmount` is declared inside BOTH the L241 and
// L246 arms yet read outside them at L257. That is legal CFML - `var` is
// function-scoped, not block-scoped - and it is recorded rather than "fixed". The
// separate un-`var`'d assignment at [model/service/PromotionService.cfc:L1007,
// L1009] is one of the three deliberate divergences and is owned by the services
// tier, not by this file.
// ===========================================================================

async function updateOrderAmountsWithPriceGroupsThenPromotions(
  priceGroupService: PriceGroupService,
  promotionService: PromotionService,
  priceGroupRepository: PriceGroupRepository,
  order: OrderView,
): Promise<OrderPricingResult> {
  // PASS ONE. Emits intents rather than mutating an order aggregate, because the
  // order aggregate is out of scope - that inversion IS the anti-corruption seam.
  const priceGroupIntents = await priceGroupService.updateOrderAmountsWithPriceGroups(order);

  // The projection step that stands in for the legacy L370/L371 in-place writes.
  // Without it, pass two would read the pre-pass-one order and the L241
  // discriminator would take the wrong arm.
  const pricedOrder = await projectPriceGroupIntents(
    order,
    priceGroupIntents,
    priceGroupRepository,
  );

  // PASS TWO, over the projected order.
  const promotionIntents = await promotionService.updateOrderAmountsWithPromotions(pricedOrder);

  return { priceGroupIntents, promotionIntents, pricedOrder };
}

/**
 * Apply pass one's intents to a fresh read-only order view for pass two.
 *
 * WHAT IS REWRITTEN, and why each is exactly what the legacy wrote:
 *   - `price` ← the intent's price, standing in for `setPrice(...)`
 *     [model/service/PriceGroupService.cfc:L370].
 *   - `appliedPriceGroup` ← the intent's price group, standing in for
 *     `setAppliedPriceGroup(...)` [L371]. This is the member the L241
 *     discriminator reads.
 *   - `extendedPrice` ← recomputed as `price × quantity`. NOT optional:
 *     `extendedPrice` is a NON-PERSISTENT derived property in the legacy
 *     [model/entity/OrderItem.cfc:L89] computed at read time as
 *     `precisionEvaluate('getPrice() * val(getQuantity())')` [L200], so a
 *     `setPrice` necessarily changed it. `src/domain/views/orderItemView.ts` states
 *     that whatever constructs the view owns that computation, and here that is
 *     this function. Left stale, the L252 correction term would be computed from a
 *     price that no longer exists and the discount would be wrong.
 *
 * WHAT IS DELIBERATELY LEFT ALONE:
 *   - `skuPrice` and `extendedSkuPrice`, which are the UNDISCOUNTED baseline the
 *     L249/L252 arm measures against. Pass one never touches them
 *     [model/entity/OrderItem.cfc:L54, L204], and neither does this.
 *   - THE FIVE PRE-COMPUTED ORDER-LEVEL MEMBERS - `totalSaleQuantity`, `subtotal`,
 *     `subtotalAfterItemDiscounts`, `promotionCodeList` and
 *     `fulfillmentChargeAfterDiscountTotal`. `src/domain/views/orderView.ts`
 *     states that the view must not recompute them and that the caller supplies
 *     them. This function is not that caller: it is the anti-corruption boundary
 *     between an out-of-scope aggregate and an in-scope engine, and it holds
 *     neither the order-level aggregation rules
 *     [model/entity/Order.cfc:L624-L631, L686-L697, L700-L702] nor the fulfillment
 *     data they need. Recomputing them from what the views carry is not
 *     expressible, and INVENTING an aggregation here would fabricate money.
 *
 *     The honest consequence, recorded rather than glossed over: `subtotal` and
 *     `totalSaleQuantity` are unaffected by pass one, since pass one changes an
 *     item's price and neither of those is a function of the applied price group in
 *     a way this projection could restate - but `subtotalAfterItemDiscounts`, which
 *     [model/service/PromotionService.cfc:L417] reads for the order-level reward
 *     pass, is a snapshot the caller supplied. If that snapshot was taken before
 *     pass one, the order-level discount is computed from the pre-price-group base.
 *     That obligation belongs to whoever builds the `OrderView`, and it is stated
 *     here so the boundary is visible instead of silently absorbed.
 */
async function projectPriceGroupIntents(
  order: OrderView,
  intents: readonly PriceGroupAppliedIntent[],
  priceGroupRepository: PriceGroupRepository,
): Promise<OrderView> {
  if (intents.length === 0) {
    // Pass one wrote nothing, which is the L369 conditional declining for every
    // item - a NORMAL outcome, not a failure, and the L241 `isNull(...)` arm is
    // what pass two will then take. The order view is handed on untouched rather
    // than rebuilt, so no identity is disturbed for no reason.
    return order;
  }

  // Keyed by the opaque `orderItemID`, which is the only handle the
  // anti-corruption boundary carries into the out-of-scope aggregate. A later
  // intent for the same item wins, matching the legacy's repeated `setPrice` on
  // one object across iterations of the L366 loop.
  const intentsByOrderItemID = new Map<string, PriceGroupAppliedIntent>();

  for (const intent of intents) {
    intentsByOrderItemID.set(intent.orderItemID, intent);
  }

  // Resolve each DISTINCT price group once. `PriceGroupAppliedIntent` carries the
  // identifier, not the entity, so the entity has to be loaded for the view -
  // `reward.hasEligiblePriceGroup(...)` at [model/service/PromotionService.cfc:L241]
  // compares entities. De-duplicating is a correctness measure as much as
  // anything: two views of one price group could answer that comparison
  // differently.
  const priceGroupsByID = new Map<string, PriceGroup>();

  for (const priceGroupID of new Set(
    [...intentsByOrderItemID.values()].map((intent) => intent.priceGroupID),
  )) {
    const priceGroup = await priceGroupRepository.getPriceGroup(priceGroupID);

    if (priceGroup === undefined) {
      // The legacy L369 conditional tested `isObject(priceGroupDetails.priceGroup)`
      // before writing, so a non-object never reached `setAppliedPriceGroup`. An
      // intent naming a price group that cannot be loaded is therefore a broken
      // invariant rather than a data variation, and it is refused rather than
      // quietly dropped - dropping it would move the L241 discriminator to the
      // other arm and change the discount.
      throw new CompositionDataError(
        `price group "${priceGroupID}" named by a price-group intent could not be loaded`,
      );
    }

    priceGroupsByID.set(priceGroupID, priceGroup);
  }

  const projectedOrderItems: OrderItemView[] = order.orderItems.map((orderItem): OrderItemView => {
    const intent = intentsByOrderItemID.get(orderItem.orderItemID);

    if (intent === undefined) {
      return orderItem;
    }

    const appliedPriceGroup = priceGroupsByID.get(intent.priceGroupID);

    if (appliedPriceGroup === undefined) {
      // Unreachable: every distinct identifier was resolved above or threw.
      // Stated as a refusal so the compiler never needs an assertion.
      throw new CompositionDataError(
        `price group "${intent.priceGroupID}" was resolved but is missing from the projection map`,
      );
    }

    return {
      ...orderItem,
      price: intent.price,
      // [model/entity/OrderItem.cfc:L200] - derived, never stored, so a changed
      // price necessarily changes it.
      extendedPrice: intent.price.times(orderItem.quantity),
      appliedPriceGroup,
    };
  });

  return { ...order, orderItems: projectedOrderItems };
}
