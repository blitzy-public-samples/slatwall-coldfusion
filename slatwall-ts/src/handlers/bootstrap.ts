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
//   `createRequestGraph`, once per request:
//     * entity memos - `variables.currencyDetails`, `variables.livePrice`
//       [model/entity/Sku.cfc], `variables.brandName` [model/entity/Product.cfc];
//     * `RoundingRuleService.variables.roundingRuleDetails`
//       [model/service/RoundingRuleService.cfc:L67-L77];
//     * `SkuDAO.variables.nextOptionGroupSortOrder`
//       [model/dao/SkuDAO.cfc:L204-L220];
//     * the European Central Bank daily-rate table
//       [model/service/CurrencyService.cfc:L105].
//
//   ★★ AND ONE PIECE OF TIER-2 STATE IS READ RATHER THAN MEMOIZED: the address-zone
//   locations that every shipping-related promotion restriction is decided by. The
//   legacy reached them by walking a Hibernate association INSIDE the request
//   [model/service/AddressService.cfc:L60-L61]; the target has no ORM, and the
//   `AddressZoneEvaluator` port is SYNCHRONOUS by contract, so they are materialized
//   once per request by `createRequestScope` before the graph is assembled. THIS IS
//   WHY `createRequestScope` IS ASYNCHRONOUS. Module scope may not hold them: zone
//   membership decides a discount, and a warm container answering one invocation from
//   another's zone configuration would keep applying a promotion an administrator had
//   already withdrawn. See section 4.2.
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
//   AND THE WIRING IS ALSO PROVEN ONCE, AT INITIALIZATION. Tier 1 assembles ONE
//   complete graph - all six repositories, all seven services, the Google feed
//   graph - validates every binding on it, and DISCARDS it, before any
//   `CompositionRoot` is exposed or any success is logged. So completeness of the
//   wiring is settled up front while the memo-bearing instances a request actually
//   uses are still built per request. The probe issues no statement: every
//   constructor in the graph assigns its collaborators and returns.
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

// The only Node built-in this file imports, and it is imported for exactly one purpose: minting the
// 32-character identifiers the two framework writers below assign to new rows, in place of the
// `generator="uuid"` the ORM applied [model/entity/Brand.cfc:L52, model/entity/RoundingRule.cfc:L52].
// A CJS-safe named import from a built-in - no `import.meta`, no top-level await - so it respects the
// bundling constraint recorded at the top of this file.
import { randomUUID } from 'node:crypto';

import { appConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { cfEquals, structGet } from '../lib/cfml/struct.js';
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
// VALUE imports, not `import type`: the two framework writers below CONSTRUCT these entities to describe
// the row they just wrote, the way each writing repository constructs the entity it persisted.
import { Brand } from '../domain/entities/brand.js';
import { RoundingRule } from '../domain/entities/roundingRule.js';
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
import { GoogleFeedService } from '../integrations/google/googleFeedService.js';
import { GoogleIntegration } from '../integrations/google/integration.js';

// `AppConfig` is imported as a TYPE and is deliberately NOT re-exported: `CompositionRoot` used to
// publish it whole, which put a directly readable database credential on the public surface (F17). The
// six shapes beside it are the pieces `CompositionDiagnostics` republishes, each either secret-free or
// already redacted.
import type {
  AppConfig,
  CurrencyConfig,
  DatabasePoolConfig,
  DatabaseTlsMode,
  EnvironmentSource,
  FeedConfig,
  RuntimeEnvironment,
  TlsMinimumVersion,
} from '../lib/config.js';
import type { CfBooleanInput } from '../lib/cfml/truthiness.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
  SqlRow,
} from '../repositories/mysql/connection.js';
import {
  resolveAuditActorAccountID,
  resolveStampedModifiedByAccountID,
  sqlUpdateAssignment,
} from '../repositories/mysql/connection.js';
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
import type { SalePriceDetail, SalePriceResolver } from '../domain/ports/promotionRepository.js';
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
import type { Sku, SkuImageSettingValues, SkuPriceGroupResolver } from '../domain/entities/sku.js';
import type { CfStruct } from '../lib/cfml/struct.js';
import { Money } from '../domain/valueObjects/money.js';
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
   *
   * SUPPLYING ONE GOVERNS EVERY DATE-DEPENDENT READ OF THE REQUEST, NOT JUST THE
   * ENTITY METHODS. The scope keeps its epoch as a primitive and hands both pricing
   * adapters a clock over it, so the promotion-period window
   * [model/dao/PromotionDAO.cfc:L117], the sale-price reduction [:L306], the
   * subscription-eligibility window [model/dao/PriceGroupDAO.cfc:L65,L70] and the
   * feed's build stamp all resolve to the value passed here. The instance passed in
   * is read once and never retained, so mutating it afterwards changes nothing.
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
   * Whether the authenticated account carries the ADMIN flag - the second half of
   * the audit-stamping gate, and the ONLY thing this member is used for.
   *
   * SECURITY REVIEW DISPOSITION - RAISED AS S-07, ACCEPTED. The finding is that
   * the repositories wrote `createdByAccountID` / `modifiedByAccountID` from the
   * caller-supplied ENTITY, so a request body chose the row's recorded
   * authorship. `HibachiEntity` never did that. Its gate, verbatim
   * [org/Hibachi/HibachiEntity.cfc:L628, L633]:
   *   !getHibachiScope().getAccount().isNew() && getHibachiScope().getAccount().getAdminAccountFlag()
   * `HibachiScope.getAccount()` is `getSession().getAccount()`
   * [org/Hibachi/HibachiScope.cfc:L134-L135], and a session only holds an account
   * after `loginAccount(account, accountAuthentication)`
   * [org/Hibachi/HibachiSessionService.cfc:L45-L49]. The actor was therefore
   * SERVER-ESTABLISHED FROM AN AUTHENTICATED SESSION and never read from request
   * payload. Worth recording: that inlined gate is exactly
   * `getLoggedInFlag() && getLoggedInAsAdminFlag()`
   * [org/Hibachi/HibachiScope.cfc:L40-L52], written out rather than called.
   *
   * WHY THIS ARRIVES AS AN INPUT RATHER THAN BEING COMPUTED HERE. The two halves
   * of the gate are not equally reproducible:
   *
   *  - `!account.isNew()` means "a persisted account exists", which `accountID`
   *    above already answers - a present, non-empty identifier IS that half.
   *  - `getAdminAccountFlag()` is a property of the `Account` ENTITY, and the
   *    account module is explicitly out of scope (AAP 0.2.2 excludes
   *    `AccountService.cfc` "and their entities"). There is no account entity, no
   *    account repository and no permission port in this slice, so THIS TIER
   *    CANNOT EVALUATE THE FLAG ITSELF. Computing it would mean inventing an
   *    elevation decision, which is what
   *    `src/repositories/mysql/mysqlPriceGroupRepository.ts:459-465` already
   *    refuses to do for the same column.
   *
   * So it is stated by the tier that authenticated the request - the same tier
   * that supplies `accountID`, and the same trust boundary. That is the point of
   * the fix: the value moves from the ENTITY BODY, which is untrusted payload, to
   * the REQUEST SCOPE, which the authenticating handler owns. Whether that
   * handler authenticates correctly is an authorizer concern outside this AAP.
   *
   * ABSENT MEANS FALSE, AND FALSE STAMPS NOTHING. Omitting this member yields
   * `UNATTRIBUTED_AUDIT_ACTOR` semantics - the non-admin arm of the legacy gate,
   * under which `preInsert` never reached its setter. An unattributed row is the
   * correct outcome of an unestablished elevation; a wrongly attributed one is
   * not. Nothing here defaults to `true`.
   */
  readonly adminAccountFlag?: boolean | undefined;

  /**
   * The candidate host the product feed should render, as observed on the
   * request - AND NOTHING ELSE.
   *
   * RULING B: the host is CAPTURED AT CONSTRUCTION, never passed as a method
   * argument, which is what keeps `ProductFeedPort.generateProductFeed()`
   * zero-parameter. Supplied only by `productFeedHandler.ts`, the sole
   * entrypoint driving the feed and the sole holder of the event the host is
   * derived from. Omitted, `RequestScope.productFeedPort` is `undefined` and no
   * feed can be rendered - which is the safe outcome, not a degraded one.
   *
   * ★ THE ALLOW-LIST IS NO LONGER PART OF THIS INPUT, and that is the whole
   * point of the member's shape.
   *
   * An earlier revision typed this as a `FeedHostRequest` carrying BOTH a
   * `candidate` and an `allowedHosts` array, on the reasoning that
   * `../lib/config.js` published no allow-list and a hard-coded host would be
   * configuration baked into code. The first half of that reasoning has been
   * fixed rather than worked around - `AppConfig.feed.allowedHosts` now exists -
   * and the second half never justified the outcome: letting the checked party
   * write the list makes the check vacuous.
   *
   * A security review raised it as finding S-15, MEDIUM, CWE-346 and CWE-20: a
   * caller could pass `attacker.example` as the candidate and
   * `['attacker.example']` as the allow-list and mint a trusted origin. Its
   * required resolution - "Remove `allowedHosts` from request scope; inject an
   * immutable deployment-owned canonical origin/allow-list" - is implemented
   * here and in `AppConfig.feed.allowedHosts` (`../lib/config.js`).
   * `FeedHostRequest` is deleted rather than deprecated, so there is no shape
   * left that could carry a caller-supplied list.
   *
   * ★ AND THE VALIDATING MINT NO LONGER LIVES IN THE INTEGRATION MODULE, WHICH IS
   * THE OTHER HALF OF THE SAME REVISION. A completeness review found that
   * `../integrations/google/googleFeedService.js` had grown eight symbols the
   * module's authority does not give it - a branded `TrustedFeedHost`, the
   * `toTrustedFeedHost` mint, an exported `UntrustedFeedHostError`, and a private
   * host GRAMMAR duplicating the one `./rssFeedRenderer.js` already owns - and
   * removed all eight, returning that constructor to a plain `feedHost: string`.
   * Its resolution guidance is followed literally: "if origin policy is separately
   * authorized, keep it at the request-handler/configuration boundary". S-15 is
   * that separate authorization, and THIS FILE is that boundary, so the refusal now
   * lives here, in `assertAllowedFeedHost`, and reads a list only a deployment can
   * write. Nothing about it was re-duplicated: the host GRAMMAR and the 259-character
   * bound stay solely in the renderer, which refuses a malformed origin before it
   * composes one, so this root checks MEMBERSHIP and nothing else.
   *
   * What survives is exactly the legacy behaviour: the host is observed on the
   * request, as `CGI.HTTP_HOST` was
   * [integrationServices/google/views/feed/product.cfm:L14], and it is then
   * checked - now against a list the request cannot influence. PROVENANCE remains
   * the caller's obligation and is stated on the service constructor too: a
   * well-formed host that is on the list is admitted, and no check anywhere can
   * tell whether a caller took it from configuration or from an event header.
   */
  readonly feedHost?: string | undefined;
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
 * The price-group capability this root publishes: `PriceGroupService` MINUS its order pass.
 *
 * ★ THE OMISSION IS THE POINT, AND IT IS EXPRESSED AS A TYPE SO THE COMPILER ENFORCES IT.
 * `updateOrderAmountsWithPriceGroups` [model/service/PriceGroupService.cfc:L364] must run BEFORE
 * `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58], because the promotion
 * pass reads price-group state in its branch CONDITION at
 * [model/service/PromotionService.cfc:L241-L254] - an ineligible item discounts from `getPrice()`
 * while an eligible one discounts from `getSkuPrice()` plus a correction term. In the legacy that
 * ordering held only because `OrderService` happened to call the two in sequence
 * [model/service/OrderService.cfc:L60-L61]. Publishing the pass as an independently callable member
 * would reproduce exactly that arrangement: an obligation carried by convention, whose violation
 * changes the amount a customer is charged. It is therefore NOT published, and
 * `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions` is the only route to it.
 *
 * EVERYTHING ELSE THE MANDATED HANDLER NEEDS IS STILL HERE. `priceResolutionHandler.ts` is specified
 * as the entrypoint exposing the price-group and currency resolution surface (AAP 0.4.1), so
 * `calculateSkuPriceBasedOnCurrentAccount`, `calculateSkuPriceBasedOnAccount`,
 * `calculateSkuPriceBasedOnPriceGroup`, `getBestPriceGroupDetailsBasedOnSkuAndAccount` and the three
 * `getRateFor*BasedOnPriceGroup` members remain reachable - as do the four write and framework-read
 * members. `Omit` subtracts ONE member and leaves the other twelve exactly as the service declares
 * them, so this is a narrowing of REACH and never a narrowing of the ported surface: B4 interface
 * parity is a property of `src/services/priceGroupService.ts`, which still declares all thirteen.
 */
export type PriceResolutionCapability = Omit<
  PriceGroupService,
  'updateOrderAmountsWithPriceGroups'
>;

/**
 * The promotion capability this root publishes: `PromotionService` MINUS its order pass.
 *
 * ★ THE SAME OMISSION FOR THE SAME REASON, ON THE OTHER SIDE OF THE ORDERING OBLIGATION.
 * `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58] is the pass that READS
 * what the price-group pass wrote, so it is the one that would silently compute a different discount
 * if it ran first. Withholding it means the sequence cannot be inverted by any caller, because there
 * is no member to call in the wrong order.
 *
 * THE ELEVEN QUERY MEMBERS ARE UNTOUCHED, including the five that the transformation plan promotes
 * from `private` to exported specifically so they can be tested and reused -
 * `getDiscountAmount` [model/service/PromotionService.cfc:L987],
 * `getPromotionPeriodQualificationDetails` [:L549], `getQualifierQualificationDetails` [:L629],
 * `getPromotionPeriodQualifiedFulfillmentIDList` [:L752] and
 * `getPromotionPeriodOrderItemQualificationCount` [:L783] - plus
 * `getSalePriceDetailsForProductSkus` [:L1022], which the product adapter's sale-price collaborator
 * is adapted from.
 */
export type PromotionQueryCapability = Omit<PromotionService, 'updateOrderAmountsWithPromotions'>;

/**
 * One request's worth of wired graph.
 *
 * Created by `CompositionRoot.createRequestScope` and discarded when the
 * invocation ends. Everything reachable from here that holds a memo was
 * constructed for THIS request only.
 *
 * ★ THE TWO PRICING SERVICES ARE PUBLISHED NARROWED. `createRequestGraph` constructs
 * the whole `PriceGroupService` and the whole `PromotionService`, hands them to the
 * collaborators that need every member - the `SkuPriceGroupResolver` the SKU entity
 * is injected with, the sale-price resolver the product adapter holds, and the
 * composing function below - and publishes THE SAME INSTANCES narrowed to the two
 * capability types. Neither capability declares an order pass, so
 * `updateOrderAmountsWithPriceGroupsThenPromotions` is the only route by which
 * either pass can be CALLED by code that compiles. The guarantee is a compile-time
 * one and is stated as such on that member rather than overclaimed here. See
 * {@link PriceResolutionCapability} and {@link PromotionQueryCapability}.
 */
export interface RequestScope extends SalePriceResolver {
  /**
   * The instant every date comparison in this request resolves against.
   *
   * A FRESH COPY ON EVERY READ, AND SAFE TO MUTATE. The graph holds its epoch as a PRIMITIVE and
   * every consumer - this member included - takes its own `Date` from the injected request clock, so
   * what you receive is not the baseline any repository, entity or the feed service compares
   * against: moving it moves nothing, and it does not even move a later read of this member. That is
   * what lets one request bind ONE instant across the promotion, sale-price, price-group and feed
   * paths without also making that instant reachable for mutation.
   *
   * ★ QUOTE-THEN-REVISE. This docblock already promised "a copy … moving it moves nothing", and QA
   * testing (INFO-2) found the second half true and the first half half-true: the member handed back
   * ONE `Date` that the projection had copied out once, so a caller who mutated what it read saw its
   * own mutation on the next read. The graph consumers were never affected - that was measured too -
   * but the fix belongs where the claim was made, so the member is now an accessor over the request
   * clock rather than a captured instance. Reading it twice yields two `Date`s with one time value.
   */
  readonly now: Date;

  /** The explicit replacement for `getHibachiScope()` / `getSlatwallScope()`. */
  readonly currentAccountContext: CurrentAccountContext;

  // ★★★ THE SIX RAW REPOSITORIES USED TO BE PUBLISHED HERE, AND THEIR ABSENCE IS THE POINT.
  //
  // The six lines that stood between `currentAccountContext` and `roundingRuleService` were:
  //
  //     readonly productRepository: ProductRepository;
  //     readonly skuRepository: SkuRepository;
  //     readonly optionRepository: OptionRepository;
  //     readonly productTypeRepository: ProductTypeRepository;
  //     readonly promotionRepository: PromotionRepository;
  //     readonly priceGroupRepository: PriceGroupRepository;
  //
  // They carried SEVEN durable mutations onto the request-tier surface - `saveProduct` and
  // `deleteProduct` [src/domain/ports/productRepository.ts], `saveSku`, `saveProductType`,
  // `savePriceGroup`, `savePriceGroupRate` and `deletePriceGroup` - each reachable without the
  // service that owns its invariants. Concretely, and this is the part that makes it a defect
  // rather than an untidiness: `productRepository.saveProduct` writes a product WITHOUT the
  // unique-URL-title resolution that `ProductService.saveProduct` performs through its injected
  // `UrlTitleGenerator`, so a row saved that way carries whatever `urlTitle` the caller happened
  // to hand it, colliding with an existing one. `savePriceGroup` writes a price group without
  // going through the service that owns the tier, and the price-group and promotion order passes
  // are withheld from this interface precisely so their sequence cannot be inverted - a guarantee
  // that means nothing while the underlying repositories are one member away.
  //
  // ★★ AND THE NARROWING IS THE SAME ARGUMENT THIS INTERFACE ALREADY MAKES ONE MEMBER LOWER,
  // APPLIED CONSISTENTLY. `priceGroupService` and `promotionService` are published as capability
  // types rather than as whole services, and the reasoning recorded there - "an ordering
  // obligation that a caller can violate is exactly the arrangement the legacy had" - does not
  // stop being true when the bypass is spelled `priceGroupRepository` instead of
  // `priceGroupService.updateOrderAmountsWithPriceGroups`. Narrowing the services while leaving
  // the adapters underneath them published was half a boundary.
  //
  // WHERE THEY LIVE NOW: on the module-private `RequestGraph`, which is where every collaborator
  // that legitimately needs one already reached them from. Nothing in `src/` read them off this
  // interface - `router.ts` never mentions `RequestScope` at all - so no production caller loses
  // a capability, and no ported service loses a collaborator.
  //
  // WHAT REPLACES THEM FOR A SUITE THAT GENUINELY NEEDS THE ADAPTER INSTANCE:
  // {@link CompositionRoot.createInspectableRequestScope}, which performs ONE assembly and hands
  // back the scope together with the adapters that scope closes over. See its documentation for
  // what it does and does not claim.

  readonly roundingRuleService: RoundingRuleService;
  readonly brandService: BrandService;
  readonly optionService: OptionService;
  readonly skuService: SkuService;
  readonly productService: ProductService;

  /**
   * The price-group surface, NARROWED. The name records which service it came
   * from; the type records what a caller may do with it. Reaching for
   * `updateOrderAmountsWithPriceGroups` here is a compile error, by design - see
   * {@link PriceResolutionCapability}.
   *
   * Every method AAP 0.4.1 requires of `priceResolutionHandler.ts` survives -
   * `calculateSkuPriceBasedOnCurrentAccount`, `calculateSkuPriceBasedOnAccount`,
   * `calculateSkuPriceBasedOnPriceGroup`,
   * `calculateSkuPriceBasedOnPriceGroupRate`,
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount`, all three `getRateFor*`
   * cascade entry points, `getPriceGroupDataJSON`, `updatePriceGroupSKUSettings`,
   * `savePriceGroupRate` and `deletePriceGroup`. Only
   * `updateOrderAmountsWithPriceGroups` is withdrawn, and only because running it
   * alone is never correct.
   */
  readonly priceGroupService: PriceResolutionCapability;

  /**
   * The promotion surface, NARROWED the same way. Reaching for
   * `updateOrderAmountsWithPromotions` here is a compile error - see
   * {@link PromotionQueryCapability}.
   *
   * Every other published method survives, including the four the AAP 0.4.2
   * interface-parity table names as must-preserve or visibility-widened:
   * `getDiscountAmount`, `getPromotionCodeUseCount`,
   * `getPromotionCodeAccountUseCount`, `getOrderItemInQualifier`,
   * `getOrderItemInReward`, `getSalePriceDetailsForProductSkus`,
   * `getShippingMethodOptionsDiscountAmountDetails`,
   * `getPromotionPeriodQualificationDetails` and
   * `getQualifierQualificationDetails`. Only
   * `updateOrderAmountsWithPromotions` is withdrawn.
   */
  readonly promotionService: PromotionQueryCapability;

  /** The currency converter for this request; never shared across requests. */
  readonly currencyConverter: CurrencyConverter;

  /**
   * The feed port, present only when `RequestScopeInput.feedHost` was supplied.
   * Its host and clock are closed over at construction - RULING B.
   */
  readonly productFeedPort: ProductFeedPort | undefined;

  // `getSalePriceDetailsForProductSkus(productID)` IS INHERITED, NOT REDECLARED. This interface
  // `extends SalePriceResolver`, the second contract exported by
  // ../domain/ports/promotionRepository.js, whose own documentation says it is the one interface in
  // the ports folder with NO adapter file and that it is "satisfied in `src/handlers/bootstrap.ts`
  // by adapting the ported `src/services/promotionService.ts` surface ... and injected into the
  // `Product` entity from there". Extending it is how that sentence becomes a fact the compiler
  // checks rather than a claim a reader has to trust: this scope cannot be constructed without
  // satisfying the resolver, and `Product` can be handed `scope` itself as its
  // `salePriceResolver`. The member replaces the `getService("promotionService")` locator at
  // [model/entity/Product.cfc:L519] - transformation rule T2 - and the signature lives on the port
  // rather than here so the two cannot drift. (`CfStruct<T>` is `Readonly<Record<string, T>>`, so
  // the inherited `Record`-typed signature and the ported service's `CfStruct` return are the same
  // structural type - the narrowing at the satisfaction site below records that too.)
  //
  // ★ IT IS NOT WHAT HYDRATES A REPOSITORY-LOADED PRODUCT, AND MUST NOT BE MISTAKEN FOR IT.
  // `MysqlProductRepository` holds the SAME adapter as a collaborator and resolves the map on its
  // read path before every `Product` it constructs, so a product loaded through `productRepository`
  // already carries its sale-price detail and no caller has to remember to attach it. The inherited
  // member is what serves the callers that construct a `Product` BY HAND - the handler tier
  // building an entity from a payload rather than from a row - which is the only case the
  // repository cannot reach.
  //
  // ★ IT WAS RE-DECLARED INLINE HERE FOR ONE REVISION, AND NAMING THE CONTRACT AGAIN IS THE RECORD
  // OF THAT REVERSION. The signature was written out longhand as
  // `getSalePriceDetailsForProductSkus(productID: string): Promise<CfStruct<SalePriceDetail>>` while
  // `SalePriceResolver` was un-exported from the port, which left the contract with no published name
  // and this file as its only structural statement. Two things followed, both silent: the return
  // narrowed from the service's `Record<string, SalePriceDetail>` to a `Readonly` view of it for no
  // stated reason, and a drift in the port's signature could no longer break this file, because there
  // was no longer a signature in the port to drift from. Extending the exported contract restores
  // both - the shape is the port's shape verbatim, and it is now load-bearing.

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
   * ★ QUOTE-THEN-REVISE, AND THE CLAIM IS NOW THE STRONGER ONE. This paragraph
   * used to read: "Stated precisely, because the weaker claim is the true one and
   * overstating it would mislead the next reader: this is NOT the only route by
   * which EITHER pass is individually reachable. `priceGroupService` and
   * `promotionService` are published on this same interface, so their methods can
   * be called directly." That was an honest description of a real hazard, and
   * honesty about a hazard is not a substitute for closing it: an ordering
   * obligation that a caller can violate is exactly the arrangement the legacy
   * had, where the sequence held only because `OrderService` happened to call the
   * two in order [model/service/OrderService.cfc:L60-L61]. A security review
   * raised the same thing as finding S-05, MEDIUM, CWE-840.
   *
   * The reasoning that produced the weaker claim was that withdrawing the
   * services would break a mandated handler, since `priceResolutionHandler.ts`
   * must expose the price-group and currency resolution surface (AAP 0.4.1). That
   * premise assumed publishing the SERVICE was the only way to publish the
   * SURFACE. It is not. The two members above are published as narrowed
   * capabilities - {@link PriceResolutionCapability} and
   * {@link PromotionQueryCapability} - which carry every resolution, query, write
   * and framework-read member the handlers need and omit exactly the two order
   * passes. See the two member docs for the enumerations. Nothing is withdrawn
   * that any specified handler calls, so the mandated surface is intact and the
   * bypass has no name to be called by.
   *
   * ★ WHY WITHDRAWAL IS SOUND RATHER THAN MERELY TIDY: running either pass alone
   * is never correct, so there is no legitimate caller to break. The promotion
   * pass reads `getAppliedPriceGroup()` in a branch CONDITION
   * [model/service/PromotionService.cfc:L241] and the two arms discount from
   * DIFFERENT base prices [:L241-L254], and AAP 0.6.1 makes the ordering
   * "explicit and non-optional in the composition root". Running the passes in
   * the wrong order therefore changes the amount a customer is charged, and a
   * withdrawn method cannot be called in the wrong order.
   *
   * ★ WHAT THIS DOES AND DOES NOT CLAIM. It is a COMPILE-TIME guarantee, not a
   * capability revocation, and the distinction is the honest one to record rather
   * than claiming an unforgeable boundary. The assembler holds the complete
   * services to compose them and publishes THE SAME INSTANCES narrowed to the two
   * capability types, so a caller determined to defeat the type could assert its
   * way back to the full class. That is a deliberate act with a visible cast, not
   * the accidental bypass the finding described.
   *
   * ★ AND THE NARROWING IS DELIBERATELY A TYPE AND NOT A FORWARDING OBJECT. An
   * alternative resolution published two hand-written objects forwarding twelve and
   * eleven members, which would additionally make the withheld members absent at
   * runtime. It was not adopted: twenty-three forwarding members must be kept in
   * step with two services by hand, the published capability would no longer BE the
   * instance the composed operation runs - so no suite could observe the two passes
   * through the surface that publishes them, which is what
   * `tests/unit/handlers/bootstrap.test.ts` does - and the runtime absence closed no
   * finding that the type does not already close.
   */
  updateOrderAmountsWithPriceGroupsThenPromotions(order: OrderView): Promise<OrderPricingResult>;
}

/**
 * What a caller may learn about how this process was configured.
 *
 * ★★★ THIS EXISTS BECAUSE `CompositionRoot` USED TO PUBLISH `config: AppConfig` WHOLE, and code
 * review raised that as MAJOR / Security - Least Privilege: the root "publishes full `AppConfig`,
 * including directly readable database password/TLS material from `config.ts:220-248`", with the
 * decisive observation that "serialization redaction does not prevent direct access". That last
 * sentence is the whole finding in nine words. `DatabaseConnectionConfig` DOES carry a careful
 * `toJSON()` that replaces the credential, the host and the account with a marker - but `toJSON` is
 * consulted by `JSON.stringify`, and nothing at all stops `root.config.database.password`.
 *
 * ★★ SO THE REDACTION IS MOVED FROM THE SERIALIZER TO THE TYPE. Every member below is either a value
 * with no never-echoed promise attached to it, or a value that has already been through
 * `AppConfig.database.toJSON()`. `AppConfig` itself is no longer reachable from the published surface,
 * so a consumer cannot read a credential whether or not it thinks to serialize first.
 *
 * ★★ AND THE REDACTION BOUNDARY IS BORROWED, NOT INVENTED. `DatabaseConnectionConfig.toJSON`'s own
 * docblock already fixes which side each field falls on - "the port and the schema name remain visible,
 * because those two are what make a misconfiguration diagnosable and neither carries a never-echoed
 * promise" - and cites three sources for it. Re-deciding that here would create a second boundary to
 * keep in step with the first, so `database` below is literally that projection's output.
 *
 * WHY PUBLISH ANYTHING AT ALL. The finding permits "an explicitly redacted, purpose-built diagnostic
 * projection if needed", and it is: a deployment that cannot see which dialect it committed to, which
 * schema it opened, which hosts its feed will serve or whether conversion rates were supplied has no
 * way to diagnose a misconfiguration short of reading logs. None of those four is a secret.
 */
export interface CompositionDiagnostics {
  /** `development` | `test` | `production`, as resolved. */
  readonly environment: RuntimeEnvironment;

  /** The dialect this composition committed to. Always `'MySQL'`. */
  readonly dialect: DatabaseDialect;

  /**
   * EXACTLY `AppConfig.database.toJSON()`: port and schema visible, host, account and credential
   * replaced by that projection's redaction marker. Typed as its return type rather than as
   * `DatabaseConnectionConfig` so no member of the live config is reachable through it.
   */
  readonly database: Readonly<Record<string, string | number>>;

  /** Four operational numbers. None is a target, and none carries a secret. */
  readonly pool: DatabasePoolConfig;

  /**
   * Whether the channel is protected and how weak the protocol may be - WITHOUT the trust anchor.
   *
   * `mode` and `minimumVersion` are the two facts an operator needs to see, and both are enumerations.
   * `certificateAuthority` is deliberately reduced to a BOOLEAN: the finding named "TLS material"
   * alongside the password, and while a CA certificate is public by construction, publishing its bytes
   * serves no diagnostic purpose that "is one configured?" does not serve.
   */
  readonly tls: {
    readonly mode: DatabaseTlsMode;
    readonly minimumVersion: TlsMinimumVersion;
    readonly certificateAuthorityConfigured: boolean;
  };

  /** The product-feed allow-list. Public hostnames this deployment will serve a feed for. */
  readonly feed: FeedConfig;

  /** The supplied conversion rates and when they were retrieved. Public reference data. */
  readonly currency: CurrencyConfig;
}

/**
 * The module-scope graph, created once and reused across warm invocations.
 */
export interface CompositionRoot {
  /**
   * What this process was configured to do, REDACTED.
   *
   * ★★ THIS MEMBER WAS `config: AppConfig` AND ITS DOCBLOCK READ, IN FULL, "The resolved process
   * configuration." That was accurate and that was the problem: the resolved configuration includes a
   * database password as a directly readable `string`. See {@link CompositionDiagnostics} for what
   * replaced it and why the redaction had to move from the serializer into the type.
   *
   * `AppConfig` remains reachable INSIDE this module - `ModuleScopeGraph.config` still holds it,
   * because the pool factory and the feed host allow-list genuinely need the live values - and that
   * shape is un-exported. Module-local is the whole of the fix.
   */
  readonly diagnostics: CompositionDiagnostics;

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

  /**
   * Open one request's scope. Called exactly once per invocation.
   *
   * ★★ ASYNCHRONOUS, AND THE PROMISE IS LOAD-BEARING RATHER THAN INCIDENTAL. This member
   * used to return a `RequestScope` directly, because scope construction was pure wiring
   * over state tier one had already read. It no longer is: the address-zone locations that
   * gate every shipping-related promotion are per-request state, and the
   * `AddressZoneEvaluator` port that consumes them is SYNCHRONOUS by contract - so the one
   * remaining place the read can happen is here, before the graph is assembled. See
   * section 4.2 and `createRequestScope`.
   *
   * The refusals this call can produce - an unlisted product-feed host among them - are
   * therefore REJECTIONS now rather than synchronous throws. What is refused, and the fact
   * that nothing is constructed and no feed statement is issued when it is refused, has
   * not changed.
   */
  createRequestScope(input?: RequestScopeInput): Promise<RequestScope>;

  /**
   * Open one request's scope AND the six adapters that scope was assembled with.
   *
   * ★★★ THE ASSEMBLY-INSPECTION HOOK, WHICH EXISTS BECAUSE {@link RequestScope} NO LONGER
   * PUBLISHES THE ADAPTERS. Withdrawing them closed a real bypass - see the block of retired
   * declarations on that interface - but it also withdrew the only route by which a suite could
   * reach the CONCRETE adapter in order to observe what the composed pricing operation does with
   * it. That observation is not a convenience: `MySqlPriceGroupRepository.getPriceGroupsByID` is
   * the set-based keyed read the composed operation issues, it is deliberately NOT a port member
   * because `src/domain/ports/priceGroupRepository.ts` locks its count at six, and so the only
   * holder of its concrete type is this composition root.
   *
   * ★★ ONE ASSEMBLY, NOT TWO, AND THAT IS THE WHOLE REASON THIS RETURNS A PAIR rather than being
   * a second method beside `createRequestScope`. Two calls would build two graphs, and a suite
   * that spied on the second graph's adapter while exercising the first graph's scope would be
   * mocking a method nobody calls - passing for the wrong reason, silently, forever. The adapters
   * returned here are BY IDENTITY the ones the returned scope's services and composed operation
   * closed over.
   *
   * ★★ WHAT THIS DOES AND DOES NOT CLAIM, stated in the same terms this file already uses for the
   * withheld order passes: the narrowing on `RequestScope` is a COMPILE-TIME guarantee about the
   * REQUEST TIER, not a capability revocation. Request-tier code is handed a `RequestScope`; it is
   * not handed this root, and it cannot reach an adapter through the scope it holds. A module that
   * holds the root can call this - just as it could already import
   * `MySqlPriceGroupRepository` directly and construct one - so this hook adds visibility of the
   * assembled graph rather than a capability the tier-one holder lacked. Naming it for what it is
   * beats leaving the adapters on the request-tier contract for want of a name.
   *
   * @param input the same per-request input `createRequestScope` accepts.
   */
  createInspectableRequestScope(input?: RequestScopeInput): Promise<InspectableRequestScope>;
}

/**
 * The six MySQL adapters one request's graph was assembled with.
 *
 * Each member is typed to its PORT rather than to its adapter class, exactly as the retired
 * `RequestScope` members were, so that a suite reaching for concrete behaviour has to narrow
 * deliberately with an `instanceof` and cannot drift into asserting against an implementation
 * detail by accident.
 */
export interface RequestScopeAdapters {
  readonly productRepository: ProductRepository;
  readonly skuRepository: SkuRepository;
  readonly optionRepository: OptionRepository;
  readonly productTypeRepository: ProductTypeRepository;
  readonly promotionRepository: PromotionRepository;
  readonly priceGroupRepository: PriceGroupRepository;
}

/**
 * One request's scope together with the adapters it was assembled with, from a single assembly.
 *
 * The two halves are returned as siblings rather than the adapters being hung off the scope,
 * because hanging them off the scope is precisely what was withdrawn: a member added back under
 * any name would put the adapters within reach of code that holds only a scope, which is the
 * arrangement the narrowing exists to prevent.
 */
export interface InspectableRequestScope {
  readonly scope: RequestScope;
  readonly adapters: RequestScopeAdapters;
}

/**
 * The test seam, and the only way to build a root that is not memoized.
 *
 * Passing any overrides bypasses the module memo entirely, so a suite can drive
 * the whole graph against a fake executor without patching module state and
 * without a live database. Passing none is the production path.
 *
 * ★ CONFIGURATION IS DELIBERATELY NOT AMONG THESE OVERRIDES, AND THAT ABSENCE IS
 * THE GUARANTEE: ONE COMPOSITION READS EXACTLY ONE CONFIGURATION. Exactly TWO
 * readers can participate in a composition, and both read the SAME memoized
 * process configuration - `appConfig.load()`, which memoizes at
 * `src/lib/config.ts:L1116`:
 *
 *   1. this root, for its own configuration and its one dialect decision;
 *   2. the pool factory in `../repositories/mysql/connection.js`, when no
 *      `executor` override is supplied.
 *
 * QUOTE-THEN-REVISE - THERE WAS A THIRD READER, AND IT WAS A DEFECT. This list
 * used to carry one more entry: "the two dialect-dependent statement builders -
 * `../repositories/mysql/sql/salePricePromotionRewards.sql.js` and
 * `../repositories/mysql/sql/sortedProductSkus.sql.js` - each of which calls
 * `resolveConfiguredDialect()` INSIDE its own body at request time, because the
 * legacy read the engine at the query site itself through
 * `getApplicationValue("databaseType")` [model/dao/PromotionDAO.cfc:L482,
 * model/dao/SkuDAO.cfc:L194] and neither legacy method declared a dialect
 * argument." QA testing found what that cost, and it was not theoretical: loading
 * the validated configuration made COMPOSING A SQL STRING demand the five `DB_*`
 * values that have no default, so under the credential-free composition below -
 * the only one a committed suite may use - those builders THREW
 * `ConfigurationError` and took the product feed,
 * `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022],
 * `skuRepository.getSortedProductSkusID` and 19 shipped tests with them, breaking
 * the empty-environment contract in `tests/setup.ts`.
 *
 * The CFML citation did not support the design either. `getApplicationValue` read
 * AMBIENT APPLICATION scope - a value `config/configORM.cfm:L1-L15` resolved ONCE
 * at startup - not a fresh probe per query, and AAP transformation rule T6
 * replaces ambient scope with an explicit parameter rather than reproducing it. So
 * the dialect is now an ARGUMENT (AAP T6: an explicit parameter passed down the
 * call chain; AAP 0.4.3: dialect-PARAMETERIZED SQL sites), supplied by each MySQL
 * adapter's own `STATEMENT_DIALECT` constant, pinned by `assertMySqlDialect` at
 * module load - which is what `mysqlProductRepository.ts`,
 * `mysqlProductTypeRepository.ts` and `mysqlPriceGroupRepository.ts` already did.
 * NO REQUEST-TIME PATH IN THIS SUBTREE READS CONFIGURATION ANY MORE.
 *
 * ★ AN EXPLICIT `environment` SOURCE IS ACCEPTED, AND THE GUARANTEE IS HELD BY AN
 * ENFORCED GUARD RATHER THAN BY ITS ABSENCE. The hazard is real and the mechanism
 * is exact: `appConfig.load(source)` is validated fresh and NEVER memoized
 * [src/lib/config.ts:L1543-L1549], so a supplied source governs THIS root's
 * dialect decision while reader 2 would go on reading `process.env` - and a pool
 * could then be built from a configuration the root never saw. Deleting the member
 * would remove that divergence by construction - but it would also remove the only
 * way to compose this graph without a credential, and a committed suite may not
 * carry a host, an account name or an authentication value (see the
 * `tests/setup.ts` contract). The member therefore stays and the one remaining
 * reader is closed explicitly:
 *
 *   READER 2 - THE POOL FACTORY - is closed by requiring `executor` alongside
 *   `environment`. `assertSingleConfigurationAuthority` refuses the combination
 *   outright, so no pool is ever created from a configuration this root did not
 *   read, and the refusal is a thrown error rather than a comment.
 *
 * The retired reader 3 needs no guard, because it no longer reads anything. Its
 * engine is a literal in the adapter that owns it, so a supplied source cannot make
 * a composition assert one engine and emit another's SQL: this root's
 * `assertMySqlDialect` admits nothing but MySQL, MySQL is the only text those
 * adapters can emit, and a builder handed a non-MySQL dialect refuses with
 * `UnsupportedDialectError` rather than emitting MySQL text under another engine's
 * name.
 *
 * A suite that needs the real `process.env` path stubs the environment and calls
 * `appConfig.reset()` instead, which is what every integration suite here does.
 */
export interface CompositionOverrides {
  /**
   * A prepared-statement executor to use INSTEAD of the module-scope pool.
   * Supplying one means no pool is ever created.
   */
  readonly executor?: PreparedStatementExecutor | undefined;

  /**
   * The European Central Bank reference rates.
   *
   * Absent, the documented empty table is used - see section 4.3, where the
   * choice is recorded as a JUDGMENT CALL against
   * [model/service/CurrencyService.cfc:L100-L101].
   */
  readonly europeanCentralBankRates?: EuropeanCentralBankRateTable | undefined;

  /**
   * The environment to resolve configuration FROM, instead of `process.env`.
   *
   * Supplying one is what lets a suite compose the whole graph with no credential
   * anywhere in the repository. It must be accompanied by `executor`, and it must
   * name the MySQL dialect; both conditions are enforced, not merely documented -
   * see the two guards described above and `assertSingleConfigurationAuthority`.
   */
  readonly environment?: EnvironmentSource | undefined;
}

/**
 * Refuse a set of overrides that would give one composition two configurations.
 *
 * This is the enforcement half of the single-authority guarantee stated on
 * {@link CompositionOverrides}. It runs before anything is resolved, so a
 * composition that would have diverged never gets as far as building a pool or
 * emitting a statement.
 *
 * @param overrides the overrides this composition was handed.
 */
function assertSingleConfigurationAuthority(overrides: CompositionOverrides): void {
  if (overrides.environment === undefined) {
    return;
  }

  if (overrides.executor === undefined) {
    throw new TypeError(
      'CompositionOverrides.environment requires CompositionOverrides.executor. An explicit ' +
        'environment source is not memoized, so the pool factory in ' +
        'repositories/mysql/connection.ts would go on reading process.env and this composition ' +
        'would hold two configurations at once.',
    );
  }

  // NO DIALECT CHECK HERE, DELIBERATELY. The tier-1 dialect assertion is the one
  // decision site: it reads the SUPPLIED source and refuses anything but MySQL - so
  // there is exactly one refusal message naming one site, and a second assertion here
  // would only duplicate it under a second name. The statement builders no longer
  // resolve a dialect at all (they take one and refuse a non-MySQL value), so there
  // is no second configuration reader left for a guard here to close.
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
 * ONE OF THE SEVEN SETTINGS-PORT KEYS, and this constant is the DECLARED LEGACY
 * DEFAULT the provider is built from. The image subsystem does not resolve it
 * separately: `imageSettingValues` reads it back OUT of `settingsProvider` at
 * section 6 step 5, so `SkuImageSettingValues` and
 * `ImageStore.generateSkuImageFileName` receive a value that came through the one
 * flat provider rather than a second, parallel resolution of the same setting.
 * That single-authority shape is the point - the legacy read was itself a
 * `setting(...)` call, on the PRODUCT [model/entity/Sku.cfc:L138].
 */
const PRODUCT_IMAGE_DEFAULT_EXTENSION_DEFAULT = 'jpg';

/**
 * `setting('productImageOptionCodeDelimiter')` [model/service/SettingService.cfc:L192],
 * whose legacy option list is exactly `['-','_']`
 * [model/service/SettingService.cfc:L346-L347].
 *
 * Also one of the seven settings-port keys, resolved through the provider exactly
 * as the extension above is [model/entity/Sku.cfc:L135].
 */
const PRODUCT_IMAGE_OPTION_CODE_DELIMITER_DEFAULT = '-';

/**
 * `setting('productTitleString')` [model/service/SettingService.cfc:L193], declared
 * `{fieldType="text", defaultValue="${brand.brandName} ${productName}"}`.
 *
 * A TEMPLATE, NOT A TITLE, AND NOT A JAVASCRIPT TEMPLATE LITERAL. This is a plain
 * single-quoted string: the `${...}` markers are legacy template syntax that
 * `hibachiUtilityService.replaceStringTemplate` resolves against the entity graph
 * [model/entity/Product.cfc:L542], and nothing in this subtree evaluates them.
 *
 * The seventh-declared of the seven port keys, and the only one whose consumer is
 * not ported: `Product.getTitle()` stays out because that renderer lives under
 * `org/Hibachi/`, the boundary this migration extracts from and never ports. The
 * setting itself belongs to the in-scope product subsystem, so it is resolved
 * here and published on the port regardless.
 */
const PRODUCT_TITLE_STRING_DEFAULT = '${brand.brandName} ${productName}';

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

/**
 * The two setting names the feed view reads, exactly as it spells them
 * [integrationServices/google/views/feed/product.cfm:L58].
 *
 * They are bound values rather than interpolated text, and their case is preserved as declared even
 * though the statement folds them, because they are also the keys the resolved rows are bucketed under
 * and `cfEquals` compares those the way CFML's struct keys did.
 */
const SKU_SHIPPING_WEIGHT_SETTING_NAME = 'skuShippingWeight';
const SKU_SHIPPING_WEIGHT_UNIT_CODE_SETTING_NAME = 'skuShippingWeightUnitCode';

/**
 * `setting('skuShippingWeight')` [model/service/SettingService.cfc:L232], `1`.
 *
 * ★★ THIS IS THE LAST STEP OF A CASCADE, NOT THE ANSWER. It used to be both, and a code review was
 * right to object: a declared default returned unconditionally "masquerades as a resolved override".
 * The legacy seeds it up front [model/service/SettingService.cfc:L482-L487] and it survives only when
 * every relationship probe misses, which is precisely the position it now occupies in
 * `SqlSkuFeedSettingResolver`.
 */
const SKU_SHIPPING_WEIGHT_DEFAULT = '1';

/** `setting('skuShippingWeightUnitCode')` [model/service/SettingService.cfc:L233], `"lb"`. The last step of the cascade; see above. */
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
 * ★ IT IS NO LONGER THE ONLY PRODUCTION POSSIBILITY, which was the real defect.
 * A deployment can now supply rates through `ECB_REFERENCE_RATES`, resolved and
 * integrity-checked by `AppConfig.currency` (`../lib/config.js`). This constant is
 * what remains when it configures none - the honest unavailable state - rather than
 * the only state production could ever reach. See
 * {@link EUROPEAN_CENTRAL_BANK_RATE_MAX_AGE_DAYS} for the disposition of the
 * pass-through itself.
 *
 * TODO: Add integration support
 *   Carried forward verbatim from [model/service/CurrencyService.cfc:L81]. It is
 *   flagged, never silently completed: a rate integration is what would let this
 *   table be populated from a live source rather than from configuration.
 */
const EMPTY_EUROPEAN_CENTRAL_BANK_RATES: EuropeanCentralBankRateTable = Object.freeze({});

/**
 * How old a supplied rate table may be before its age is reported, in days.
 *
 * CFML parity [model/service/CurrencyService.cfc:L105]: the legacy refetched
 * whenever `variables.europeanCentralBankRates.retrieved <= dateFormat(now() - 1,
 * "yyyy-mm-dd")` - a one-day window, and the only freshness rule the source has.
 * The number is one because the legacy's is one; it is not tuned.
 *
 * ★ STALENESS IS REPORTED, NOT ENFORCED, AND THAT IS THE FAITHFUL READING RATHER
 * THAN THE LENIENT ONE. Read the legacy's failure path precisely: the one-day test
 * triggers a REFETCH, and the refetch is wrapped in a `catch (any e) {}` that is
 * completely empty [L127-L128]. When the source is unreachable, nothing is
 * assigned, and [L130] returns the PREVIOUS table - so the legacy serves stale
 * rates indefinitely rather than discarding them. Discarding a stale table here
 * would therefore be a divergence, and it would be a divergence in the wrong
 * direction: an expired table converts at a day-old rate, while a discarded one
 * converts at 1:1. A day of drift on a EUR/USD rate is cents; 1:1 is tens of
 * percent.
 *
 * SECURITY REVIEW DISPOSITION - RAISED AS S-20, ACCEPTED IN PART AND DECLINED IN
 * PART, WITH THE SPLIT STATED RATHER THAN BLURRED.
 *
 * Raised as finding S-20, HIGH, CWE-754 and CWE-840: production composition always
 * supplied an empty rate table, so missing cross-currency rates returned the
 * original `Money` unchanged and indistinguishably "succeeded", enabling 1:1
 * USD/EUR/JPY pricing wherever no SKU-level override existed. Its required
 * resolution had two parts - "Wire an authenticated, integrity-checked,
 * freshness-bounded rate source" and "or fail closed on unavailable cross-currency
 * rates, retaining same-currency pass-through only".
 *
 * ACCEPTED - the supply and integrity half, which is where the real defect was:
 *   * Rates are now deployment-owned configuration, so production has a supply
 *     route at all. Previously the ONLY route was `CompositionOverrides`, a test
 *     seam, which is why every production conversion was 1:1.
 *   * They are integrity-checked before the process starts: three-letter code
 *     shape, plain unsigned decimal numeral, and STRICT POSITIVITY - a zero source
 *     rate would divide by zero at [L90] and a zero target rate would price
 *     everything at nothing.
 *   * Their age is required, recorded and reported against this bound, so a stale
 *     table is visible instead of silent.
 *   * Every pass-through is now reported through `CurrencyPassThroughObserver`, so
 *     1:1 conversions are alertable rather than invisible.
 *
 * DECLINED - the "fail closed" half, on a cited mandate:
 *   * AAP 0.8.1 Preserve-Exactly names "the price-group and currency resolution
 *     cascade" as must-preserve area #2, and this pass-through is a step of it.
 *   * [model/service/CurrencyService.cfc:L100-L101] is unambiguous, comment
 *     included: "If no conversion could be done, just return the original amount",
 *     then `return arguments.amount;`. Raising instead would convert a successful
 *     legacy price resolution into a failure.
 *   * The consumer makes that concrete. Step 3 of the SKU currency cascade
 *     [model/entity/Sku.cfc:L416-L428] calls `convertCurrency` while BUILDING the
 *     per-currency price map, and only for currencies steps 1 and 2 left unset. A
 *     throw there does not decline one price - it aborts `getCurrencyDetails()`, so
 *     every currency on that SKU becomes unavailable, including the base-currency
 *     price that steps 1 and 2 resolved correctly and that has nothing to do with
 *     any rate. Failing closed would take a wrong price for one currency and turn it
 *     into no price for all of them.
 *   * AAP 0.9.3 requires the currency cascade to be tested "at all four steps,
 *     including the eligibility gate producing an empty map and every accessor then
 *     returning `undefined`", and states that a defect silently fixed fails the
 *     gate.
 *
 * The severity assessment is not disputed. What the decline says is narrower than
 * "this is fine": it says the REMEDY is a configured rate source - now possible for
 * the first time - plus alerting on the reported pass-through, not a throw inside a
 * cascade that cannot absorb one.
 */
const EUROPEAN_CENTRAL_BANK_RATE_MAX_AGE_DAYS = 1;

/** Milliseconds in a day, for the age comparison above. */
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Report the age of the configured rate table, ONCE, at module-graph construction.
 *
 * Cardinality is the point of doing it here rather than per conversion: the table is
 * fixed for the lifetime of the execution container, so one line per container says
 * everything a repeated line would, and a per-conversion warning on a busy path would
 * bury the signal it exists to raise.
 *
 * Reports and returns. Nothing is discarded and nothing throws - see
 * {@link EUROPEAN_CENTRAL_BANK_RATE_MAX_AGE_DAYS} for why serving a stale table is
 * the faithful behaviour and why discarding it would be worse for money.
 *
 * ONLY COUNTS ARE PUBLISHED, never a rate or a code. `../lib/logger.js` fails closed
 * on unrecognized context keys, and a rate table is commercial data that has no
 * business in a log line; `rowCount` and `ageInDays` carry the whole signal.
 *
 * `ageInDays` IS LOAD-BEARING ON A LOGGER ALLOW-LIST ENTRY, and the coupling is
 * worth naming because it is invisible from here and fails silently. That module
 * redacts any context key it does not enumerate, so before `ageindays` was added to
 * its `LEGIBLE_DIAGNOSTIC_KEYS` this function's staleness warning emitted
 * `ageInDays: "[REDACTED]"` - a warning that could say something was stale but not
 * how stale, which is the one thing an operator needs from it. Renaming this key
 * without adding the new spelling there would restore that failure, and no test in
 * this file would notice; `tests/unit/lib/logger.test.ts` pins the name for exactly
 * that reason. The same holds for the two currency codes published by the
 * pass-through observer wired in `createModuleScopeGraph`.
 */
function reportRateTableAge(
  retrievedAt: Date | undefined,
  rates: EuropeanCentralBankRateTable,
): void {
  const rowCount = Object.keys(rates).length;

  if (rowCount === 0) {
    // The unavailable state, and it is not an anomaly to warn about on every cold
    // start: a deployment that publishes a single currency configures no rates and
    // is correct to. The pass-through observer reports it if it is ever REACHED,
    // which is the event that actually matters.
    logger.info('No currency conversion rates are configured; conversions will pass through', {
      rowCount,
    });
    return;
  }

  if (retrievedAt === undefined) {
    // Unreachable through configuration - `../lib/config.js` refuses a rate table
    // with no retrieval instant - so this arm exists for the override seam, where a
    // suite supplies a table directly and no instant accompanies it.
    logger.info('Currency conversion rates supplied without a retrieval instant', { rowCount });
    return;
  }

  const ageInDays = Math.floor((Date.now() - retrievedAt.getTime()) / MILLISECONDS_PER_DAY);

  if (ageInDays > EUROPEAN_CENTRAL_BANK_RATE_MAX_AGE_DAYS) {
    logger.warn('Currency conversion rates are older than the one-day refresh window', {
      rowCount,
      ageInDays,
    });
    return;
  }

  logger.info('Currency conversion rates resolved from configuration', { rowCount, ageInDays });
}

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
 * Unreachable through any published entry point: all THREE late bindings are closed
 * before `createRequestGraph` returns - and that closure is now ASSERTED there
 * rather than merely arranged - and no delegate is invoked during construction. It
 * exists so that the three construction cycles are broken without a cast, a
 * non-null assertion or an `any` - see section 7.
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

/**
 * A runtime value violated a contract this module's TYPES declare, so nothing was attempted.
 *
 * ★ WHY A TYPED CONTRACT STILL NEEDS A RUNTIME REFUSAL. Every type in this file erases at emit, and
 * two of them are reached across a boundary a compiler cannot police: a closed string union arriving
 * from a caller that a bundler, a `JSON.parse` or an untyped consumer produced, and the return value
 * of an INJECTED port implementation. QA testing found both, and in each case the failure was silent
 * or opaque rather than named:
 *
 *   * `createUniqueURLTitle('Nike', <out-of-union table>)` indexed a frozen three-key statement table
 *     with no membership test, so `executor.execute(undefined, ['nike','nike-%'])` was issued and the
 *     method RETURNED `"nike"` - an unsuffixed "unique" answer with the database never consulted.
 *     Against the real pool the driver raised an opaque `TypeError` about Buffer types instead. NO SQL
 *     INJECTION WAS POSSIBLE and none is now: the table name is never interpolated, the three
 *     statements are frozen literals, and this class exists for the silent wrong answer, not for an
 *     injection.
 *   * a `PreparedStatementExecutor` whose `execute` answered `null` or a non-array produced
 *     `Cannot read properties of null (reading 'map')` and `rows.map is not a function` from inside a
 *     tier-1 read, naming neither the port nor the statement.
 *
 * Module-local, following every sibling fault type in this section: the constructor is not exported,
 * a caller identifies it by `name`, and the message names the CONTRACT and the site - never a value,
 * a credential, a title, an identifier or a statement.
 */
class CompositionContractError extends Error {
  public constructor(contract: string, site: string) {
    super(
      `The composition root refused to continue: ${contract}. The site was '${site}'. This is a ` +
        'programming error at a boundary the compiler cannot police, not a data condition, so ' +
        'nothing was read, nothing was written and no result may be read as an answer.',
    );
    this.name = 'CompositionContractError';
  }
}

/**
 * The rows a statement answered, or a named refusal.
 *
 * `PreparedStatementExecutor.execute` declares `Promise<readonly SqlRow[]>`, and every implementation
 * in this repository honours it - but the port is an INJECTION POINT, so the one shape this root
 * cannot verify at compile time is what a substituted implementation actually returns. QA testing
 * (INFO-3) drove `null` and a non-array through it and got raw `TypeError`s from inside the row
 * readers, which named neither the port nor the statement.
 *
 * Applied at the two TIER-1 reads, which are the reads that run before any request exists and whose
 * failure would otherwise abort a composition with an unattributable message. The request-tier
 * adapters consume the same port and are covered by their own column readers.
 *
 * @param rows whatever the injected executor answered.
 * @param statementLabel the statement's own label, so a refusal is attributable.
 * @returns the rows, unchanged, when the contract holds.
 */
function requireStatementRows(rows: readonly SqlRow[], statementLabel: string): readonly SqlRow[] {
  // The predicate is captured as a BOOLEAN rather than used as a type guard, deliberately:
  // `Array.isArray` narrows a `readonly T[]` to `any[]`, and returning that would launder an `any`
  // through a function whose whole purpose is to defend a declared type. The parameter therefore keeps
  // its declared type on both sides of the check, and nothing is cast or asserted.
  const answeredAnArray: boolean = Array.isArray(rows);

  if (!answeredAnArray) {
    throw new CompositionContractError(
      'the injected PreparedStatementExecutor answered a result set that is not an array, which its ' +
        'own declared return type forbids',
      statementLabel,
    );
  }

  return rows;
}

/**
 * An assembled request graph was missing a binding, so the root was NOT exposed.
 *
 * ★ THIS IS THE REFUSAL THAT REPLACES A SILENT PARTIAL ROOT. Tier 1 assembles one
 * complete request graph and validates every binding on it BEFORE
 * `bootstrapCompositionRoot` resolves and before any success is logged, so a wiring
 * hole surfaces as a named, identified failure at initialization rather than as an
 * `undefined` collaborator reached deep inside a priced order. A rejected
 * initialization also clears the memo, so a later invocation on the same warm
 * container retries rather than inheriting the hole.
 *
 * Module-local, following every sibling fault type in this section: the constructor
 * is not exported, and the message names the BINDING and nothing else - no value, no
 * credential and no configuration is echoed.
 */
class CompositionIncompleteError extends Error {
  public constructor(binding: string) {
    super(
      `The composition root assembled a request graph whose '${binding}' binding is ` +
        'absent, so no composition root was exposed. This is a programming error in ' +
        'the composition root, not a data condition.',
    );
    this.name = 'CompositionIncompleteError';
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
const SELECT_OPTIONS_WITH_GROUP_BY_ID = 'bootstrapSelectOptionsWithGroupByID';
const SELECT_OPTION_GROUP_BY_ID = 'bootstrapSelectOptionGroupByID';
const SELECT_OPTIONS_BY_OPTION_GROUP_ID = 'bootstrapSelectOptionsByOptionGroupID';
const SELECT_ACCOUNT_PRICE_GROUP_IDS = 'bootstrapSelectAccountPriceGroupIDs';
const SELECT_PRICE_GROUP_PAGE_IDS = 'bootstrapSelectPriceGroupPageIDs';
const SELECT_PROMOTION_BY_ID = 'bootstrapSelectPromotionByID';
// Was `SELECT_UNIQUE_URL_TITLE = 'bootstrapSelectUniqueUrlTitle'`, when the statement answered one
// candidate at a time. It now reads a whole slug family in one go, so the label follows the statement
// rather than describing the question the caller used to ask it repeatedly.
const SELECT_URL_TITLE_FAMILY = 'bootstrapSelectUrlTitleFamily';
const SELECT_ADDRESS_ZONE_LOCATIONS = 'bootstrapSelectAddressZoneLocations';

// The two statements behind per-SKU setting resolution. They are a PAIR and neither is useful alone:
// the settings read supplies the candidate rows, the path read supplies the walk order those rows are
// probed in [model/service/SettingService.cfc:L550-L558].
const SELECT_SKU_FEED_SETTINGS = 'bootstrapSelectSkuFeedSettings';
const SELECT_PRODUCT_TYPE_PATHS = 'bootstrapSelectProductTypePaths';

// The framework-generated writes. `HibachiService.save` [org/Hibachi/HibachiService.cfc:L155] reached
// `getHibachiDAO().save(target=...)`, whose statement Hibernate produced from the entity's
// persistent-property metadata - so these labels name statements that exist in no legacy DAO, which is
// exactly why they are hosted here rather than on a repository port.
const INSERT_ROUNDING_RULE = 'bootstrapInsertRoundingRule';
const UPDATE_ROUNDING_RULE = 'bootstrapUpdateRoundingRule';
const INSERT_BRAND = 'bootstrapInsertBrand';
const UPDATE_BRAND = 'bootstrapUpdateBrand';
const SELECT_BRAND_BY_URL_TITLE = 'bootstrapSelectBrandByUrlTitle';

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

/**
 * The same read as {@link SELECT_OPTION_WITH_GROUP_BY_ID_SQL}, for a SET of keys.
 *
 * ★★ PROJECTION, JOIN AND PREDICATE ARE THE SINGULAR FORM'S, WIDENED IN EXACTLY
 * ONE RESPECT. Same column list, same LEFT JOIN onto `SwOptionGroup` - LEFT
 * because `Option.optionGroup` is a nullable many-to-one
 * [model/entity/Option.cfc:L59] and an inner join would silently drop an option
 * whose group column is null - and the same primary-key equality, stated over N
 * keys. No `ORDER BY` is added: the only caller reads its own request order, and
 * `IN (...)` guarantees no row order to read anyway.
 *
 * E5: one positional `?` per identifier. `identifierCount` is derived from an
 * array length inside this module and can never carry caller input.
 *
 * @param identifierCount - how many keys the statement will bind, one or more.
 *   `IN ()` is a MySQL syntax error, so the caller returns before reaching this
 *   builder when its key set is empty.
 */
function buildSelectOptionsWithGroupByIDSql(identifierCount: number): string {
  return [
    'SELECT',
    OPTION_COLUMN_NAMES.map((columnName: string): string => `swOption.${columnName}`).join(', '),
    `, ${OPTION_GROUP_COLUMNS_SQL}`,
    'FROM SwOption swOption',
    'LEFT JOIN SwOptionGroup optionGroup ON swOption.optionGroupID = optionGroup.optionGroupID',
    `WHERE swOption.optionID IN (${new Array<string>(identifierCount).fill('?').join(', ')})`,
  ].join(' ');
}

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
 * [model/entity/OptionGroup.cfc:L70] - ONE COLUMN, no second term - so
 * Hibernate emitted `ORDER BY sortOrder` and nothing more. That is reproduced
 * exactly.
 *
 * ★★ NO TIE-BREAKER, AND THE ABSENCE IS THE BEHAVIOUR. Two options sharing a
 * sort order are ordered by whatever the database returns, and that is what the
 * legacy did. `sortOrder` is a nullable integer on `Option`
 * [model/entity/Option.cfc:L56], so ties and nulls are both reachable in real
 * data.
 *
 * ★ QUOTE-THEN-REVISE. This statement used to read
 * `ORDER BY sortOrder, optionID` and justified the extra term thus: "`optionID`
 * breaks a tie so that two options sharing a sort order do not swap between
 * reads; `sortOrder` itself is nullable on `Option`
 * [model/entity/Option.cfc:L56]."
 *
 * The premise was true and the conclusion did not follow from it. Determinism
 * across reads is a property the legacy DID NOT HAVE, so adding it is not
 * fidelity - it is a new ordering the source never expressed, applied to a
 * collection whose order is observable. `Product.getSkus(sorted=true)` and
 * `SkuService.getSortedProductSkus` order SKUs by option-group sort order, and
 * `ProductService.getFormattedOptionGroups` presents options positionally, so a
 * tie resolved differently from the source is a different rendered order. The
 * AAP budgets exactly three deliberate divergences project-wide and all three
 * are spent [AAP 0.6.7]; a fourth cannot be introduced for a convenience, and a
 * silent one least of all.
 */
const SELECT_OPTIONS_BY_OPTION_GROUP_ID_SQL = [
  `SELECT ${OPTION_COLUMN_NAMES.join(', ')}`,
  'FROM SwOption',
  'WHERE optionGroupID = ?',
  'ORDER BY sortOrder',
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
 * The price-group page - THE FIRST TEN ROWS, UNORDERED.
 *
 * ★★ NO `ORDER BY`, BUT A `LIMIT`. The two absences are NOT symmetrical, and
 * treating them as though they were is what made this statement return the whole
 * table.
 *
 * WHERE THE TEN COMES FROM. [model/service/PriceGroupService.cfc:L233] calls
 * `this.getPriceGroupSmartList()` with NO ARGUMENTS, so every paging parameter
 * takes its declared default: `HibachiSmartList.setup` declares
 * `numeric pageRecordsStart=1, numeric pageRecordsShow=10`
 * [org/Hibachi/HibachiSmartList.cfc:L39]. `getPageRecords()` then executes
 * `ormExecuteQuery(getHQL(), getHQLParams(), false, {offset=getPageRecordsStart()-1,
 * maxresults=getPageRecordsShow(), …})` [org/Hibachi/HibachiSmartList.cfc:L759-L764].
 * With `currentPageDeclaration` at its initial value `getPageRecordsStart()`
 * returns 1 [L793-L797], so the executed query is `offset 0, maxresults 10` -
 * MySQL `LIMIT 10`. The page size is therefore DECLARED IN THE SOURCE, not
 * absent from it.
 *
 * WHY NO `ORDER BY` ALL THE SAME. The caller declares no sort, and
 * `HibachiSmartList` applies none unless one is configured, so the ten rows are
 * whichever ten the database volunteers. That is the legacy outcome and it is
 * preserved - the same treatment `getActivePromotionRewards` receives, where the
 * missing `ORDER BY` [model/dao/PromotionDAO.cfc:L51-L132] is what makes reward
 * order non-deterministic and is reproduced rather than repaired. An unordered
 * `LIMIT` is an unstable page, and that instability is the ported behaviour.
 *
 * ★ QUOTE-THEN-REVISE. This statement used to be
 * `'SELECT priceGroupID FROM SwPriceGroup'` under the heading "NO `ORDER BY` AND
 * NO LIMIT, and both absences are deliberate", justified thus:
 * "[model/service/PriceGroupService.cfc:L233-L236] builds a framework smart list
 * and iterates `getPageRecords()` without declaring either a sort or a page size,
 * so asserting one here would invent observable behaviour."
 *
 * The reasoning conflated "the CALLER states no page size" with "NO page size is
 * stated". The caller does not have to: it invokes a framework method whose own
 * signature supplies the default, and reading `getPageRecords` rather than only
 * its call site is what settles it. The consequence was not cosmetic - the method
 * is named `getPriceGroupPageRecords` and returned every row in `SwPriceGroup`,
 * so `getPriceGroupDataJSON` serialized the entire table plus each row's rates
 * where the legacy serialized at most ten. Refusing to state the limit did not
 * avoid inventing behaviour; it invented unbounded behaviour instead.
 *
 * ★ THE TEN IS A LITERAL, NOT A PARAMETER, and deliberately so. Nothing in this
 * slice reaches page two: the only caller is
 * `getPriceGroupDataJSON` [model/service/PriceGroupService.cfc:L230-L260], which
 * never touches `pageRecordsStart`, `currentPageDeclaration` or
 * `pageRecordsShow`. Binding an offset or a page size would be modelling a
 * capability no in-scope code exercises. MySQL also forbids a placeholder in
 * `LIMIT` for a prepared statement in the general case, so a literal keeps the
 * statement parameterless - which is exactly how the executor already calls it.
 */
const SELECT_PRICE_GROUP_PAGE_IDS_SQL = 'SELECT priceGroupID FROM SwPriceGroup LIMIT 10';

/**
 * The greatest number of price groups one page read will hydrate.
 *
 * SECURITY REVIEW DISPOSITION - RAISED AS S-08, ACCEPTED. The finding names the price-group page
 * path among its unbounded surfaces, and the fan-out is precisely this: `hydrateByIdentifier` issues
 * ONE `getPriceGroup` per distinct identifier the page returned, each of which materializes that
 * group's rates and their link tables. A wide page therefore costs one statement per row plus that
 * row's whole rate graph.
 *
 * ★ THE CEILING BOUNDS THE HYDRATION, NOT THE STATEMENT, and it is now a DEFENSIVE invariant rather
 * than the primary bound. The disposition was written when the statement above selected every row of
 * `SwPriceGroup`; reading `getPageRecords` rather than only its call site settled that the source
 * declares `pageRecordsShow=10` [org/Hibachi/HibachiSmartList.cfc:L39, L759-L764], so the statement
 * now carries `LIMIT 10` and the database itself is the first bound. This ceiling stays because it
 * costs nothing and it is the layer that still holds if a driver, a dialect switch or a future
 * paging parameter ever widens that page: what is refused is turning an implausible number of rows
 * into entities, however many rows the read volunteered. No `ORDER BY` is invented either way - AAP
 * 0.9.5's scope gate and the parity note above forbid inventing the sort a `LIMIT` would need to be
 * stable, and the instability is the ported behaviour.
 *
 * JUDGMENT CALL on the number, stated as one: 1,000. Price groups are an administrator-maintained
 * pricing taxonomy, not transactional data - the legacy admin edits them one at a time and the only
 * consumer here, `getPriceGroupDataJSON`, serializes the page into a single JSON document. A
 * thousand is far above any installation the source suggests and far below what the per-group
 * statement fan-out could survive.
 *
 * The sibling read `getAccountPriceGroups` needs no ceiling of its own: it is keyed on one account
 * and bounded by that account's own `SwAccountPriceGroup` rows, so it cannot widen with the table.
 */
const MAX_PRICE_GROUP_PAGE_RECORDS = 1_000;

/** One promotion, for `PromotionFrameworkReads.getPromotion`. */
const SELECT_PROMOTION_BY_ID_SQL = [
  'SELECT promotionID, promotionName, promotionSummary, promotionDescription, activeFlag,',
  'defaultImageID, remoteID, createdDateTime, createdByAccountID, modifiedDateTime,',
  'modifiedByAccountID',
  'FROM SwPromotion',
  'WHERE promotionID = ?',
].join(' ');

/**
 * Every title in one slug's FAMILY - the bare slug and everything prefixed `slug-` - read in a
 * single statement, one literal per table.
 *
 * ★★★ QUOTE-THEN-REVISE. This constant was `SELECT_UNIQUE_URL_TITLE_SQL`, three statements of the
 * form `SELECT urlTitle FROM SwBrand WHERE urlTitle = ?`, and its docblock read: "The uniqueness
 * probe behind `createUniqueURLTitle`, one literal per table. CFML parity
 * [model/dao/DataDAO.cfc:L115-L131]: `verifyUniqueTableValue` runs `SELECT #column# FROM #tableName#
 * WHERE #column# = <cfqueryparam …/>` and returns `false` when `rs.recordCount` is non-zero."
 *
 * That parity claim was accurate and is the reason the statement had to change. Answering ONE
 * candidate per statement is what forced the caller into a serial loop, and a serial loop inside a
 * request budget is what a security review then asked to be capped - producing a cap that refused a
 * state the legacy resolved (finding F9). Reading the whole family ONCE removes the loop's round
 * trips rather than its outcome: the candidate test is still `stored == candidate`, performed against
 * a set instead of against the database, so every answer is the answer the legacy gave.
 *
 * TWO DISJUNCTS, AND NEITHER SUBSUMES THE OTHER. The bare slug does not match `slug-%`, and no
 * suffixed title equals the bare slug, so both terms are required to cover the candidate sequence
 * `slug`, `slug-2`, `slug-3`, …
 *
 * ★★ THE `LIKE` PATTERN CANNOT CARRY A METACHARACTER, AND THAT IS A PROOF RATHER THAN A HOPE. The
 * slug reaching the second parameter has already passed
 * `replace(/[^a-z0-9 -]/g, '')` followed by `replace(/ +/g, '-')`
 * [model/service/DataService.cfc:L57-L58], so it consists only of `[a-z0-9-]`. Every LIKE
 * metacharacter - `%`, `_` and the backslash escape - is outside that class and has therefore
 * already been stripped. No pattern escaping is needed, and adding one would be dead code whose
 * absence a reader could not verify.
 *
 * DELIBERATELY BROADER THAN THE CANDIDATE SEQUENCE, AND NARROWED IN MEMORY. `slug-%` also matches a
 * genuine unrelated title such as `nike-air-max` when the slug is `nike-air`. Those rows are read and
 * then simply fail the membership test for every candidate, because the test is string equality
 * against `slug-<n>`. Expressing the digit constraint in SQL instead would need `REGEXP`, which
 * cannot use the index a prefix `LIKE` can.
 *
 * The legacy interpolated the table and column names; here the closed three-member union
 * `UrlTitleTableName` selects between three FIXED statements, so no identifier is ever spliced into
 * SQL.
 */
const SELECT_URL_TITLE_FAMILY_SQL: Readonly<Record<UrlTitleTableName, string>> = Object.freeze({
  SwBrand: 'SELECT urlTitle FROM SwBrand WHERE urlTitle = ? OR urlTitle LIKE ?',
  SwProduct: 'SELECT urlTitle FROM SwProduct WHERE urlTitle = ? OR urlTitle LIKE ?',
  SwProductType: 'SELECT urlTitle FROM SwProductType WHERE urlTitle = ? OR urlTitle LIKE ?',
});

/**
 * Every address zone's locations, keyed by zone, in ONE parameterless statement.
 *
 * WHAT A ZONE "LOCATION" PHYSICALLY IS, because the answer is not the obvious one.
 * There is no `AddressZoneLocation` entity anywhere in the legacy model. The
 * association is declared at [model/entity/AddressZone.cfc:L61] as
 *   `cfc="Address" fieldtype="many-to-many" linktable="SwAddressZoneLocation"`
 *   `fkcolumn="addressZoneID" inversejoincolumn="addressID"`
 * so `SwAddressZoneLocation` is a LINK TABLE carrying exactly those two columns, and a
 * zone's locations ARE `SwAddress` rows [model/entity/Address.cfc:L49 `table="SwAddress"`].
 * The four columns the zone test reads are declared without a `column=` attribute
 * [model/entity/Address.cfc:L59-L62], so Hibernate names each column after its property
 * and the physical names are the property names.
 *
 * ★ AN `INNER JOIN`, AND THE CHOICE IS A MONEY DECISION RATHER THAN A STYLE ONE. A
 * `LEFT JOIN` would answer a link row whose `SwAddress` row is absent as a location
 * with all four fields NULL - and a location that constrains NO field matches EVERY
 * address [model/service/AddressService.cfc:L63-L74], so one orphaned link row would
 * silently admit every address into that zone and apply its shipping promotion to
 * everyone. Hibernate's many-to-many traversal produces no such phantom element
 * either: the association is declared `cascade="all-delete-orphan"`, so the legacy
 * never walks one. An orphan link row is therefore DROPPED here, which is both the
 * legacy outcome and the safe one.
 *
 * NO `WHERE` AND NO PARAMETER, deliberately. The zone identifiers this index must
 * answer for are not known when it is built: they are discovered mid-algorithm, from
 * `PromotionQualifier.getShippingAddressZoneIDs()`
 * [model/entity/PromotionQualifier.cfc:L75] and
 * `PromotionReward.getShippingAddressZoneIDs()` [model/entity/PromotionReward.cfc:L77],
 * inside a SYNCHRONOUS predicate that cannot issue a statement of its own. Binding a
 * key set would therefore mean guessing it, and guessing low is exactly the failure
 * this read exists to repair.
 *
 * NO `ORDER BY` EITHER, and that absence is faithful rather than an oversight. The
 * legacy walks the Hibernate collection in whatever order the association yields
 * [model/service/AddressService.cfc:L60-L61] and stops at the FIRST location whose set
 * fields all match [L75-L78], so location order is observable only through which
 * matching location wins - and every matching location produces the identical verdict
 * `true`. Inventing a sort would assert an ordering the source does not declare.
 *
 * ★ IT IS BOUNDED BY ADMINISTRATOR CONFIGURATION, NOT BY CUSTOMER DATA, WHICH IS WHY
 * IT CARRIES NO CEILING. The row count is the number of zone-to-location LINKS, i.e.
 * `SwAddressZoneLocation`'s own size - an administrator-maintained shipping and tax
 * taxonomy, the same class of data as the price-group taxonomy. It does NOT scale with
 * `SwAddress`, even though the join reads that table: only addresses an administrator
 * enrolled in a zone are linked. And a ceiling here could not be a defensive
 * invariant the way `MAX_PRICE_GROUP_PAGE_RECORDS` is: refusing rows would silently
 * shrink a zone and stop a configured promotion from applying, which is the very
 * defect this statement repairs.
 */
const SELECT_ADDRESS_ZONE_LOCATIONS_SQL = [
  'SELECT zoneLocation.addressZoneID,',
  'location.postalCode, location.city, location.stateCode, location.countryCode',
  'FROM SwAddressZoneLocation zoneLocation',
  'INNER JOIN SwAddress location ON zoneLocation.addressID = location.addressID',
].join(' ');

/**
 * Every column `SwSetting` discriminates a setting row by, in the order the legacy `WHERE` clause
 * tests them.
 *
 * ★★★ THE LIST IS THE PREDICATE, WHICH IS WHY IT IS EXHAUSTIVE RATHER THAN NARROWED TO THE FOUR THE
 * FEED USES. `getSettingRecordBySettingRelationships` [model/service/SettingService.cfc:L768-L870]
 * emits, for EVERY one of these columns, one of two clauses and never neither:
 *   participating  ->  `AND LOWER(<col>) = <cfqueryparam LCASE(value)>`
 *   otherwise      ->  `AND <col> IS NULL`
 * So a row carrying an `accountID` is INVISIBLE to a lookup that does not mention accounts, even
 * though the feed's lookup never mentions one. Selecting only `skuID`, `productID`, `productTypeID`
 * and `brandID` would silently promote such a row into an answer it never had, which is the opposite
 * of the defect being repaired. All seventeen are read so all seventeen can be required NULL.
 *
 * SIXTEEN FOREIGN KEYS PLUS ONE PLAIN COLUMN. `cmsContentID` is declared as an ordinary string
 * property [model/entity/Setting.cfc:L57] rather than a `fkcolumn`, while the other sixteen are
 * `many-to-one` foreign keys [model/entity/Setting.cfc:L60-L75]. The legacy `WHERE` makes no such
 * distinction and neither does this, because both are just columns to the predicate.
 */
const SETTING_RELATIONSHIP_COLUMNS: readonly string[] = Object.freeze([
  'accountID',
  'contentID',
  'cmsContentID',
  'brandID',
  'emailID',
  'emailTemplateID',
  'fulfillmentMethodID',
  'paymentMethodID',
  'productID',
  'productTypeID',
  'shippingMethodID',
  'shippingMethodRateID',
  'siteID',
  'skuID',
  'subscriptionTermID',
  'subscriptionUsageID',
  'taskID',
]);

/**
 * The candidate setting rows for the feed's two keys.
 *
 * REPLACES `getAllSettingsQuery` [model/dao/SettingDAO.cfc:L51-L62], whose whole body was
 * `SELECT * FROM SwSetting` - every row of the table, cached on the service
 * [model/service/SettingService.cfc:L424-L430] and then filtered in-engine by a query-of-queries
 * [model/service/SettingService.cfc:L777]. Query-of-queries has no counterpart here, so the filtering
 * moves into TypeScript; what stays is the shape, which is one read for the whole batch.
 *
 * ★★ NARROWED TO TWO NAMES, AND THE NARROWING CANNOT CHANGE AN ANSWER. Every legacy probe opens with
 * `LOWER(allSettings.settingName) = <cfqueryparam LCASE(settingName)>`
 * [model/service/SettingService.cfc:L783], so a row of any other name was already unreachable. Reading
 * the two names the feed asks for [integrationServices/google/views/feed/product.cfm:L58] discards
 * only rows the predicate would have discarded, while turning a whole-table read into an indexed one.
 * The comparison is `LOWER(...) IN (?, ?)` rather than `IN (?, ?)` because that is the comparison the
 * legacy performed, and a case-sensitive column collation would otherwise miss a row the legacy found.
 *
 * NO `ORDER BY`, DELIBERATELY. The legacy probe has none either, and on a multi-row match CFML reads
 * row 1 of the result set [model/service/SettingService.cfc:L525-L527] - whichever row that is. The
 * resolver reproduces that by keeping the FIRST row it encounters per key, so a table holding two
 * equally-specific rows is answered as non-deterministically here as it was there. Imposing an order
 * would be inventing a tie-break the legacy never had.
 */
const SELECT_SKU_FEED_SETTINGS_SQL = [
  `SELECT settingName, settingValue, ${SETTING_RELATIONSHIP_COLUMNS.join(', ')}`,
  'FROM SwSetting',
  'WHERE LOWER(settingName) IN (?, ?)',
].join(' ');

/**
 * The materialized ancestry paths of the product types a batch mentions.
 *
 * `productTypeIDPath` IS A STORED COLUMN, NOT A COMPUTATION [model/entity/ProductType.cfc:L53], and
 * that is why this is one flat read rather than a recursive CTE. `HibachiEntity.buildIDPathList`
 * [org/Hibachi/HibachiEntity.cfc:L308-L322] walks parents with `listPrepend`, so the stored list runs
 * ROOT FIRST and LEAF LAST, and `preInsert`/`preUpdate` [model/entity/ProductType.cfc:L306, L311]
 * refresh it on every write. The legacy read exactly this column
 * [model/service/SettingService.cfc:L552] and so does this.
 *
 * @param identifierCount - how many product-type keys the statement binds, one or more. `IN ()` is a
 *   MySQL syntax error, so the caller returns before reaching this builder when the batch mentions no
 *   product type at all.
 */
function buildSelectProductTypePathsSql(identifierCount: number): string {
  return [
    'SELECT productTypeID, productTypeIDPath',
    'FROM SwProductType',
    `WHERE productTypeID IN (${new Array<string>(identifierCount).fill('?').join(', ')})`,
  ].join(' ');
}

/**
 * The `SwRoundingRule` column set [model/entity/RoundingRule.cfc:L52-L62].
 *
 * FOUR SCALARS AND FOUR AUDIT COLUMNS, AND DELIBERATELY NO `remoteID`. Its sibling `SwBrand` DOES
 * declare one [model/entity/Brand.cfc:L74]; `RoundingRule` declares none, so writing one would invent
 * a column. `priceGroupRates` [model/entity/RoundingRule.cfc:L65] is `inverse="true"`, which makes the
 * CHILD the owning side - Hibernate wrote `SwPriceGroupRate.roundingRuleID`, never anything here - so
 * the association is not part of this row's write.
 */
const ROUNDING_RULE_COLUMNS: readonly string[] = Object.freeze([
  'roundingRuleID',
  'roundingRuleName',
  'roundingRuleExpression',
  'roundingRuleDirection',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

/**
 * The UPDATE set list: the key moves to the WHERE clause, and the two created-* columns are WRITE-ONCE.
 *
 * `createdDateTime` and `createdByAccountID` are excluded because `HibachiEntity.preUpdate`
 * [org/Hibachi/HibachiEntity.cfc:L651-L679] never restamps them - `setCreatedByAccount` appears only
 * in `preInsert` [:L628-L630]. `modifiedByAccountID` STAYS in the list and is rendered by
 * `sqlUpdateAssignment`, which emits `COALESCE(?, modifiedByAccountID)` for it so a refused actor gate
 * PRESERVES the previous attribution instead of erasing it.
 */
const UPDATED_ROUNDING_RULE_COLUMNS: readonly string[] = Object.freeze(
  ROUNDING_RULE_COLUMNS.filter(
    (columnName) =>
      columnName !== 'roundingRuleID' &&
      columnName !== 'createdDateTime' &&
      columnName !== 'createdByAccountID',
  ),
);

const INSERT_ROUNDING_RULE_SQL = [
  `INSERT INTO SwRoundingRule (${ROUNDING_RULE_COLUMNS.join(', ')})`,
  `VALUES (${ROUNDING_RULE_COLUMNS.map(() => '?').join(', ')})`,
].join(' ');

const UPDATE_ROUNDING_RULE_SQL = [
  'UPDATE SwRoundingRule',
  `SET ${UPDATED_ROUNDING_RULE_COLUMNS.map((columnName) => sqlUpdateAssignment(columnName)).join(', ')}`,
  'WHERE roundingRuleID = ?',
].join(' ');

/**
 * The `SwBrand` column set [model/entity/Brand.cfc:L52-L57, L74, L77-L80].
 *
 * SIX SCALARS INCLUDING `remoteID`, PLUS FOUR AUDIT COLUMNS. `urlTitle` carries `unique="true"`
 * [model/entity/Brand.cfc:L55], which is the database half of the `"unique":true` rule
 * [model/validation/Brand.json] - so a duplicate is refused by the service BEFORE the statement runs,
 * and the constraint remains the backstop rather than the primary check.
 *
 * NONE OF THE ASSOCIATIONS IS WRITTEN HERE, and that is read off the mapping rather than assumed:
 * `attributeValues` and `products` are `one-to-many ... inverse="true"` [:L60-L61], and all six
 * many-to-many collections [:L66-L72] are declared `inverse="true"` too - so `Brand` is the owning side
 * of NOTHING. Hibernate never wrote a `SwPromoRewardBrand` or `SwVendorBrand` row on behalf of a brand
 * save, so neither does this. Contrast `savePriceGroupRate`, which DOES reconcile its link tables
 * precisely because its six associations omit `inverse`.
 */
const BRAND_COLUMNS: readonly string[] = Object.freeze([
  'brandID',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'brandName',
  'brandWebsite',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

/** The UPDATE set list, on the same write-once reasoning as the rounding rule's. */
const UPDATED_BRAND_COLUMNS: readonly string[] = Object.freeze(
  BRAND_COLUMNS.filter(
    (columnName) =>
      columnName !== 'brandID' &&
      columnName !== 'createdDateTime' &&
      columnName !== 'createdByAccountID',
  ),
);

const INSERT_BRAND_SQL = [
  `INSERT INTO SwBrand (${BRAND_COLUMNS.join(', ')})`,
  `VALUES (${BRAND_COLUMNS.map(() => '?').join(', ')})`,
].join(' ');

const UPDATE_BRAND_SQL = [
  'UPDATE SwBrand',
  `SET ${UPDATED_BRAND_COLUMNS.map((columnName) => sqlUpdateAssignment(columnName)).join(', ')}`,
  'WHERE brandID = ?',
].join(' ');

/**
 * The uniqueness probe behind [model/validation/Brand.json]'s `"urlTitle": {"unique":true}` rule.
 *
 * ★ THIS IS A TRANSCRIPTION, NOT A DESIGN. The rule was answered by
 * `HibachiDAO.isUniqueProperty` [org/Hibachi/HibachiDAO.cfc:L130-L147], whose entire body is
 *
 *   `from #entityName# e where e.#property# = :propertyValue and e.#entityIDproperty# != :entityID`
 *
 * so the `AND brandID <> ?` clause below is the ported `!= :entityID`, not an addition. Without it an
 * UPDATE that leaves the title unchanged would collide with itself and refuse every re-save of an
 * existing brand - which is exactly why the legacy carried the term.
 *
 * ONE STATEMENT SERVES BOTH PATHS: on an INSERT the minted identifier cannot match any stored row, and
 * the legacy passed `getPrimaryIDValue()` there too - `""` for an unsaved entity - so it likewise used
 * one query for both.
 *
 * `LIMIT 1` because existence is the whole question - the legacy tested `arrayLen(results)` and nothing
 * else. The identifier is selected only so a diagnostic can name the row that already holds the title.
 */
const SELECT_BRAND_BY_URL_TITLE_SQL = [
  'SELECT brandID FROM SwBrand',
  'WHERE urlTitle = ? AND brandID <> ?',
  'LIMIT 1',
].join(' ');

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
// 4.1  settingsProvider - SYNCHRONOUS, seven keys, non-optional `string`
// ---------------------------------------------------------------------------

/**
 * The single flat settings resolver.
 *
 * The legacy reached settings through FOUR DISTINCT SURFACES - a bare
 * `setting(...)` on self, `getHibachiScope().setting(...)`, the `settingService`
 * collaborator, and `<associatedEntity>.setting(...)`. All four collapse into
 * this one injected resolver; it is NOT an entity-graph traversal.
 *
 * `SettingKey` is locked at SEVEN literals by
 * `src/domain/ports/settingsProvider.ts`, and this provider supplies EVERY ONE OF
 * THEM - there is no second settings surface anywhere in the composition. The
 * three product/image keys are IN the union and are resolved here:
 * `productImageDefaultExtension` [model/service/SettingService.cfc:L191],
 * `productImageOptionCodeDelimiter` [L192] and `productTitleString` [L193]. The
 * image subsystem's `SkuImageSettingValues` is therefore DERIVED from this
 * provider at section 6 step 5 rather than built from the constants directly,
 * which is what makes the provider the single authority for a setting's value.
 *
 * `skuAllowBackorderFlag` [L219], `globalURLKeyBrand` [L177], the shipping-weight
 * keys [L232-L233] and the missing-image and assets-folder keys [L184, L164] are
 * deliberately ABSENT - each belongs to a subsystem this migration does not port,
 * and the last two travel with the subsystems that own them (sections 4.5 and
 * 4.7). NO EIGHTH KEY MAY BE ADDED to make anything compile.
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
    // The seven keys in the order their declarations appear in
    // `model/service/SettingService.cfc`, so the table can be checked against the
    // legacy file top to bottom: L178, L179, L191, L192, L193, L221, L222.
    this.values = Object.freeze({
      globalURLKeyProduct: GLOBAL_URL_KEY_PRODUCT_DEFAULT,
      globalURLKeyProductType: GLOBAL_URL_KEY_PRODUCT_TYPE_DEFAULT,
      productImageDefaultExtension: PRODUCT_IMAGE_DEFAULT_EXTENSION_DEFAULT,
      productImageOptionCodeDelimiter: PRODUCT_IMAGE_OPTION_CODE_DELIMITER_DEFAULT,
      productTitleString: PRODUCT_TITLE_STRING_DEFAULT,
      skuCurrency: SKU_CURRENCY_DEFAULT,
      skuEligibleCurrencies,
    });
  }

  /**
   * The declared value of one setting.
   *
   * ★ RESOLVED CASE-INSENSITIVELY, BECAUSE A CFML STRUCT KEY IS. The legacy reads are struct lookups -
   * `setting('skuCurrency')` [model/entity/Sku.cfc:L360-L365] reaches
   * `HibachiScope`'s settings struct, and CFML matches struct keys without regard to case - so
   * `SKUCURRENCY` and `skucurrency` named the same setting there and answered the same value. This
   * lookup used to be a plain index, which is case-SENSITIVE: QA testing (INFO-4) found
   * `setting('SKUCURRENCY')` answering `undefined` under a signature that promises `string`.
   *
   * No runtime hazard was demonstrated - the closed `SettingKey` union is the compile-time guard and
   * every in-repo call site passes a literal - but AAP 0.1.1 requires every ported struct-keyed lookup
   * to be AUDITED rather than assumed, and this one was assumed. `structGet` from
   * `../lib/cfml/struct.js` is the module that already owns CFML key semantics for this port, so the
   * resolution goes through it rather than through a second case-folding rule invented here.
   *
   * THE UNION IS NOT WIDENED. The parameter type is unchanged, so no new setting name becomes
   * askable; what changed is only that a legal name spelled in another case resolves the way CFML
   * resolved it.
   *
   * @param settingName one of the seven names this composition declares.
   * @returns the declared value.
   */
  public setting(settingName: SettingKey): string {
    return structGet(this.values, settingName) ?? this.values[settingName];
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
 * `subscriptionTermProvider`. It is reached through the `addressService` collaborator
 * [model/service/PromotionService.cfc:L53] from THREE in-scope call sites: the
 * fulfillment-reward branch of the discount pipeline [:L362], the shipping-address-zone
 * qualifier gate [:L684], and
 * `getShippingMethodOptionsDiscountAmountDetails` [:L1063].
 *
 * SYNCHRONOUS, because the legacy body reaches neither the DAO nor the ORM: it walks an
 * already-loaded collection and compares strings. Associations are materialized ahead
 * of the call (T3) and laziness is never simulated.
 *
 * ★★★ QUOTE-THEN-REVISE, AND THE OLD SENTENCE NAMED THE DEFECT WITHOUT NOTICING IT.
 * This paragraph used to finish: "the caller supplies an ALREADY-MATERIALISED
 * zone-locations array." No caller does, and none can. `AddressZone` is not one of the
 * eighteen in-scope entities, so every in-scope layer publishes a zone association as
 * OPAQUE IDENTIFIERS and holds no locations -
 * `PromotionQualifier.getShippingAddressZoneIDs()`
 * [model/entity/PromotionQualifier.cfc:L75] and
 * `PromotionReward.getShippingAddressZoneIDs()` [model/entity/PromotionReward.cfc:L77] -
 * so all three call sites above hand over `addressZoneLocations: []`. An implementation
 * that tests only the supplied array therefore reads "this zone has no locations" for
 * EVERY configured zone, answers `false` every time, and silently disables every
 * address-zone restriction in the promotion engine. That is not a narrow edge case: it
 * is the whole feature, and it changes what customers are charged.
 *
 * ★ THE PORT ALREADY REQUIRED THE FIX, IN TERMS. `AddressZoneProjection` states the
 * obligation as three rules: test the supplied locations when the list is NON-EMPTY;
 * resolve from `addressZoneID` when it is EMPTY, because "an empty list from a caller
 * that publishes no locations is 'not supplied', not 'none exist'"; and keep a zone that
 * GENUINELY has no locations un-entered all the same. All three are implemented below,
 * and the third is what stops the repair from widening a zone.
 *
 * ★ RESOLUTION STAYS SYNCHRONOUS, WHICH IS WHY THE INDEX IS A CONSTRUCTOR ARGUMENT.
 * The port declares `isAddressInZone(...): boolean`, never `Promise<boolean>`, and both
 * qualification call sites are themselves synchronous - so this class may not issue a
 * statement, and the zone-to-locations state must exist BEFORE the call. It is
 * materialized once per request by `readAddressZoneLocationIndex` and handed in, exactly
 * as the SKU currency-detail map is materialized during hydration so that
 * `getPriceByCurrencyCode` can stay a synchronous accessor.
 *
 * ★ AND THE INDEX IS PER REQUEST, NOT PER CONTAINER. Zone membership decides a discount,
 * so a warm Lambda container must never answer one invocation from another's zone
 * configuration: an administrator who removes a zone location must not keep seeing the
 * promotion apply. This class is therefore constructed in `createRequestGraph` and is
 * NOT among the module-scope adapters, which are restricted to collaborators that hold
 * no state at all.
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
  /**
   * @param addressZoneLocations - THIS REQUEST'S zone-to-locations index, already
   *   materialized. Keyed by folded `addressZoneID`; see
   *   {@link readAddressZoneLocationIndex}.
   */
  public constructor(private readonly addressZoneLocations: AddressZoneLocationIndex) {}

  public isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean {
    // [model/service/AddressService.cfc:L58] `var addressInZone = false;`
    let addressInZone = false;

    // [L60] `for(var i=1; i<=arrayLen(arguments.addressZone.getAddressZoneLocations()); i++)`
    for (const location of this.resolveAddressZoneLocations(addressZone)) {
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

  /**
   * WHICH locations this zone is tested on - the one decision the port delegates here.
   *
   * A NON-EMPTY supplied list is authoritative and nothing is resolved: a caller that
   * has already materialized the association knows its own zone better than any index
   * does, and re-resolving would let a stale index override a fresh caller.
   *
   * An EMPTY supplied list means NOT SUPPLIED, so this request's index is consulted.
   * That distinction is the whole of the repair, and the two cases must not be
   * conflated in either direction.
   *
   * ★ AN ABSENT KEY YIELDS AN EMPTY ARRAY, AND THEREFORE `false` AT THE CALLER. That is
   * the third rule of the port's obligation kept intact: a zone the index does not know -
   * because it genuinely has no locations, or because no such zone exists - is NOT
   * entered. `addressInZone` starts `false` [model/service/AddressService.cfc:L58] and
   * the loop body never runs, exactly as the legacy loop over an empty Hibernate
   * collection never runs. Resolving by identifier must not soften a restriction into a
   * match, and it does not.
   *
   * ★ THE LOOKUP FOLDS CASE, BECAUSE CFML COMPARES IDENTIFIERS CASE-INSENSITIVELY. The
   * port says so explicitly - "an implementation that resolves against a keyed store
   * must fold case when it looks this up rather than assume the caller normalized it" -
   * and the identifier travels verbatim from a link row, so its stored casing is
   * whatever the administrator's data carries. `foldIdentifier` is the same folding this
   * file already applies to driver column names.
   */
  private resolveAddressZoneLocations(
    addressZone: AddressZoneProjection,
  ): readonly AddressZoneLocationProjection[] {
    if (addressZone.addressZoneLocations.length !== 0) {
      return addressZone.addressZoneLocations;
    }

    return this.addressZoneLocations.get(foldIdentifier(addressZone.addressZoneID)) ?? NO_LOCATIONS;
  }
}

/**
 * One request's zone-to-locations state: folded `addressZoneID` to that zone's locations.
 *
 * A `ReadonlyMap`, so the index cannot be added to, cleared or re-keyed after the request
 * that built it - and a `readonly` array per entry, so a zone's locations cannot be
 * appended to either. Immutability is the point: the promotion engine consults this
 * index from inside a synchronous predicate, many times per order, and a value that
 * could change between two consultations would make one order's discounts depend on when
 * within the order each zone happened to be tested.
 *
 * Module-local, like every other internal shape of this file's wiring.
 */
type AddressZoneLocationIndex = ReadonlyMap<string, readonly AddressZoneLocationProjection[]>;

/** The answer for a zone the index does not carry. Shared because it is frozen and empty. */
const NO_LOCATIONS: readonly AddressZoneLocationProjection[] = Object.freeze([]);

/**
 * An index carrying no zone at all.
 *
 * Used by tier one's validation probe, which builds a request graph WITHOUT issuing a
 * statement. Shared safely because the type forbids writing to it and nothing in this
 * module holds a mutable handle on it.
 */
const NO_ADDRESS_ZONE_LOCATIONS: AddressZoneLocationIndex = new Map();

/**
 * Read every zone's locations, once, for THIS request.
 *
 * ONE STATEMENT FOR EVERY ZONE, deliberately, and this is the shape that keeps the port
 * synchronous. The alternative - one keyed read per zone identifier the engine
 * encounters - cannot be written at all: the identifiers surface inside
 * `getQualifierQualificationDetails`, which returns `QualifierQualification` and not a
 * promise, so there is no `await` available at the site that would need one. It would
 * also be an N+1 against the promotion loop, which is precisely what materializing an
 * association at a boundary exists to prevent.
 *
 * ROWS ARE GROUPED IN ARRIVAL ORDER, which is the faithful treatment: the legacy walks
 * the Hibernate collection in association order and stops at the first match
 * [model/service/AddressService.cfc:L60-L61, L75-L78], the statement declares no
 * `ORDER BY` because the source declares no sort, and every matching location yields the
 * same verdict - so arrival order is preserved without asserting that any particular
 * order is correct.
 *
 * ★ AN ABSENT COLUMN VALUE BECOMES `null`, NEVER AN OMITTED KEY, AND THE DIFFERENCE IS
 * ENFORCED BY THE COMPILER. `AddressZoneLocationProjection` declares each field
 * `?: string | null`, and under `exactOptionalPropertyTypes` an explicit `undefined` is
 * NOT assignable to such a member - so each field is written as a REQUIRED
 * `string | null`, which is assignable to the optional one. `null` is also the honest
 * projection of a NULL column, and `locationValueExcludes` already reads `null` as "this
 * location constrains nothing on this field", which is the `!isNull(location.getX())`
 * guard at [model/service/AddressService.cfc:L63-L74].
 *
 * ★ THE ZONE IDENTIFIER IS REQUIRED RATHER THAN OPTIONAL. It is the link table's own
 * foreign key [model/entity/AddressZone.cfc:L61 `fkcolumn="addressZoneID"`], so a NULL
 * there is not a location without a constraint - it is a row that cannot be attributed
 * to any zone. `readIdentifier` refuses it by name rather than silently filing it under
 * the empty string, where it would become a location of a zone nobody configured.
 */
async function readAddressZoneLocationIndex(
  executor: PreparedStatementExecutor,
): Promise<AddressZoneLocationIndex> {
  const rows = requireStatementRows(
    await executor.execute(SELECT_ADDRESS_ZONE_LOCATIONS_SQL),
    SELECT_ADDRESS_ZONE_LOCATIONS,
  );
  const locationsByFoldedZoneID = new Map<string, AddressZoneLocationProjection[]>();

  for (const row of rows) {
    const foldedZoneID = foldIdentifier(
      readIdentifier(row, 'addressZoneID', SELECT_ADDRESS_ZONE_LOCATIONS),
    );

    const location: AddressZoneLocationProjection = {
      postalCode: readOptionalText(row, 'postalCode', SELECT_ADDRESS_ZONE_LOCATIONS) ?? null,
      city: readOptionalText(row, 'city', SELECT_ADDRESS_ZONE_LOCATIONS) ?? null,
      stateCode: readOptionalText(row, 'stateCode', SELECT_ADDRESS_ZONE_LOCATIONS) ?? null,
      countryCode: readOptionalText(row, 'countryCode', SELECT_ADDRESS_ZONE_LOCATIONS) ?? null,
    };

    const existing = locationsByFoldedZoneID.get(foldedZoneID);

    if (existing === undefined) {
      locationsByFoldedZoneID.set(foldedZoneID, [location]);
    } else {
      existing.push(location);
    }
  }

  // Frozen per zone on the way out, into a SECOND map, so the returned index's
  // immutability is not merely a type-level claim over arrays that the grouping pass
  // still holds a mutable handle to.
  const index = new Map<string, readonly AddressZoneLocationProjection[]>();

  for (const [foldedZoneID, locations] of locationsByFoldedZoneID) {
    index.set(foldedZoneID, Object.freeze(locations));
  }

  return index;
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
// in `createRequestGraph`, never at module scope.
//
// The surface is THREE async methods - `getAllActiveCurrencyIDList`,
// `getCurrenciesByCurrencyCodeList` and `convertCurrency`. There is no
// `getCurrencySmartList`: `model/service/CurrencyService.cfc` declares exactly
// four functions [L57, L69, L79, L104] and none of them is that, so nothing here
// declares or calls one.

// ---------------------------------------------------------------------------
// 4.4  urlTitleGenerator - ASYNC, executor-backed
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RETIRED - `MAX_URL_TITLE_COLLISION_ATTEMPTS = 100` and `UrlTitleCollisionLimitError`, and this
// tombstone records what they claimed so the reversal is checkable rather than merely absent.
//
// The constant's docblock opened "SECURITY REVIEW DISPOSITION - RAISED AS S-19, ACCEPTED", and the
// finding it accepted was real: URL-title "collision handling loops indefinitely and issues one
// serial query per suffix. Collision-heavy data can consume the invocation until timeout" (CWE-834
// uncontrolled loop, CWE-400 resource exhaustion). Required resolution: "Set an attempt cap; prefer
// atomic uniqueness/upsert or bounded CSPRNG fallback; return generic conflict after the cap."
//
// ★★★ THE DIAGNOSIS STANDS; THE REMEDY DID NOT. A code review then raised F9, MAJOR: the generator
// "throws after 100 collisions, while Brand/Product callers ... require the next available suffix and
// the legacy loop continues until success", and required "a set-based/deterministic next-suffix
// implementation that still succeeds for every valid state; do not expose a 101st-collision error."
//
// Reading the two findings together resolves them, because they object to DIFFERENT THINGS. S-19
// objects to N SERIAL ROUND TRIPS. F9 objects to REFUSING A VALID STATE. The cap addressed the first
// by causing the second - and it did not have to, because the round trips and the answer are
// separable. `SqlUrlTitleGenerator` now reads the slug's whole family in ONE statement and walks the
// legacy candidate sequence against that set in memory. S-19's resource concern is discharged more
// completely than the cap discharged it: the round-trip count is now 1 rather than "at most 101", and
// it no longer scales with the data at all. F9's totality requirement is met because the walk cannot
// fail - see the loop's own termination note.
//
// ★★ THE CONSTANT'S TWO REJECTED ALTERNATIVES ARE STILL REJECTED, AND FOR ITS OWN REASONS. It argued
// an ATOMIC uniqueness/upsert "would be the right answer if this port wrote anything. It does not: it
// performs a read and hands a string back to a caller that owns the write", and that a CSPRNG
// FALLBACK "would durably store a title in a format the legacy could never produce, in a
// user-visible column". Both hold. What is implemented is neither of them and is not the cap either;
// it is the fourth option the finding did not enumerate, which is to stop needing the loop.
//
// The error class's own docblock argued it was "GENERIC BY CONSTRUCTION, which is the half of finding
// S-19 that is about disclosure rather than about resources. It names NEITHER the candidate title nor
// the table." That property is preserved by construction now rather than by wording: there is no
// refusal to disclose anything through.
// ---------------------------------------------------------------------------

/**
 * WHY A HOST TRAIT TABLE EXISTS INSTEAD OF THE HOST ITSELF.
 *
 * A comment review raised it as a MAJOR SECURITY finding that the withdrawn mint's error echoed the
 * rejected candidate verbatim - `The feed host ${JSON.stringify(candidate)} ...` - under a JSDoc claim
 * that a pre-validation host "is not a secret". It can be. The very traits that get a candidate
 * refused are the ones that make it sensitive: a `user:password@` authority carries credentials, and a
 * query string can carry a token. Either would then be written to whatever collects the throw.
 *
 * So a refusal describes the candidate rather than reproducing it. Each entry is a trait a reader can
 * act on when diagnosing a misconfiguration, and none of them can carry a secret: a trait NAME is a
 * constant from this table, not a substring of the input.
 *
 * EACH ENTRY NAMES A CLASS OF CHARACTER RATHER THAN A POSITION OR A VALUE, which is what makes the
 * summary non-reversible - it cannot be read back into the candidate. Several may match one
 * candidate, and all that do are reported: `https://host/x` carries both a scheme separator and a
 * path separator.
 *
 * THE TABLE DESCRIBES; IT DOES NOT ADJUDICATE. `assertAllowedFeedHost` refuses on emptiness and on
 * non-membership, and nothing else, so a trait listed here is a diagnostic observation about a
 * candidate that was already refused - not the ground of the refusal. That distinction is why the
 * two NORMALISATION traits from the withdrawn feed-service version of this table are absent: it
 * reported `leading or trailing whitespace` and `an uppercase letter`, because the mint it served
 * shape-checked AFTER normalising and a reader needed to know the value had been rewritten. This
 * boundary folds case and trims edges on BOTH sides before comparing, so neither can be why a
 * candidate failed, and reporting them would invite exactly the wrong fix.
 */
const REJECTED_FEED_HOST_TRAITS: ReadonlyArray<readonly [string, RegExp]> = Object.freeze([
  Object.freeze(['a scheme separator', /:\/\//] as const),
  Object.freeze(['credentials', /@/] as const),
  Object.freeze(['a path separator', /\//] as const),
  Object.freeze(['a query separator', /\?/] as const),
  Object.freeze(['a fragment separator', /#/] as const),
  Object.freeze(['whitespace', /\s/] as const),
  Object.freeze(['a character outside printable ASCII', /[^\u0020-\u007e]/] as const),
]);

/**
 * Describe a refused feed-host candidate WITHOUT reproducing it.
 *
 * The summary is a character count plus the trait names that matched, both of which are derived
 * facts rather than input bytes: no substring, no prefix and no normalised form is included. It
 * backs both the exception's message and its `candidateSummary`, so neither can leak what the other
 * withholds.
 *
 * THE TWO DEGENERATE CANDIDATES GET THEIR OWN WORDING, adopted from the comment review that
 * introduced this function on the withdrawn mint. An empty value and a whitespace-only value are
 * the two misconfigurations an operator is most likely to have - an unset variable and a value that
 * survived a copy-paste - and telling them apart costs nothing, because neither summary reveals
 * anything the length did not already.
 */
function summarizeRejectedFeedHost(candidate: string): string {
  if (candidate.length === 0) {
    return 'an empty string';
  }

  const measurement = `${String(candidate.length)} character${candidate.length === 1 ? '' : 's'} long`;

  if (candidate.trim().length === 0) {
    return `${measurement}, of whitespace only`;
  }

  const traits: string[] = REJECTED_FEED_HOST_TRAITS.filter(([, pattern]) =>
    pattern.test(candidate),
  ).map(([trait]) => trait);

  return traits.length === 0
    ? `${measurement}, carrying no disallowed character class`
    : `${measurement} and contains ${traits.join(', ')}`;
}

/**
 * A feed host that this deployment does not serve.
 *
 * ★ IT IS DECLARED HERE, IN THE COMPOSITION ROOT, AND THAT PLACEMENT IS THE POINT. The type used to
 * be exported from `../integrations/google/googleFeedService.js` alongside a branded `TrustedFeedHost`
 * and the `toTrustedFeedHost` mint that produced it. A completeness review withdrew all of that: the
 * feed module's authority excludes an allow-list BY NAME - alongside an API key, a token check, a
 * signature check and a rate limit - because the legacy endpoint is public and unauthenticated as a
 * matter of source fact [integrationServices/google/controllers/feed.cfc:L54-L56], and authorization
 * is an API Gateway concern owned outside this subtree.
 *
 * The same review's resolution guidance is what puts the refusal here rather than deleting it: "if
 * origin policy is separately authorized, keep it at the request-handler/configuration boundary".
 * Security finding S-15 is that separate authorization and this file is that boundary. So the feed
 * module went back to a plain `feedHost: string` with no brand, no mint and no grammar of its own,
 * and the deployment-owned membership check moved to the one module that already reads process
 * configuration and already owns every trust boundary in the graph.
 *
 * `message` carries the reason and a redacted summary; `candidateSummary` and `reason` expose the two
 * halves separately, so a caller can log the diagnosis, or branch on the ground of the refusal,
 * without parsing a sentence and without ever handling the value. Both members are carried over
 * from the withdrawn feed-service version of this error, which a comment review shaped; only the
 * `candidate` member it replaced is gone, and deliberately so.
 */
export class UntrustedFeedHostError extends Error {
  public readonly candidateSummary: string;

  public readonly reason: string;

  public constructor(candidate: string, reason: string) {
    const candidateSummary = summarizeRejectedFeedHost(candidate);

    super(
      `A candidate feed host was refused: ${reason}. The value itself is not reproduced; it was ${candidateSummary}.`,
    );
    this.name = 'UntrustedFeedHostError';
    this.candidateSummary = candidateSummary;
    this.reason = reason;
  }
}

/**
 * Admit a feed host only if this DEPLOYMENT lists it, and answer the normalized form.
 *
 * TWO REFUSALS AND NO MORE. An empty or whitespace-only candidate is refused because there is
 * nothing to serve; a candidate absent from the configured list is refused because a list the
 * request cannot write is the only kind worth consulting. An EMPTY LIST therefore refuses
 * everything, which is the deliberate default: a deployment that configured no `FEED_ALLOWED_HOSTS`
 * does not serve a feed, and cannot be made to serve one by a request.
 *
 * NORMALIZATION IS `trim().toLowerCase()` ON BOTH SIDES, and it is the only rewriting performed.
 * Host names are case-insensitive, so folding is parity rather than leniency, and the entries a
 * deployment writes are folded too so a capitalized configuration value still matches.
 *
 * THE HOST GRAMMAR IS DELIBERATELY NOT RE-CHECKED HERE. `../integrations/google/rssFeedRenderer.js`
 * owns the character class and the 259-character bound, and refuses a malformed origin before it
 * composes one; a second copy in this file is exactly the duplication a completeness review removed
 * from the feed service. Membership subsumes it for admission purposes anyway - a candidate that is
 * not a bare authority cannot equal an allow-list entry that is one.
 *
 * @param candidate the host observed on the request; never trusted for provenance.
 * @param allowedHosts the frozen, deployment-owned list resolved once at module scope.
 * @returns the normalized host, which is what the feed service closes over.
 * @throws UntrustedFeedHostError when the candidate is empty or is not listed.
 */
function assertAllowedFeedHost(candidate: string, allowedHosts: readonly string[]): string {
  const normalized = candidate.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new UntrustedFeedHostError(candidate, 'it is empty or contains only whitespace');
  }

  const permitted = allowedHosts.some((allowed) => allowed.trim().toLowerCase() === normalized);

  if (!permitted) {
    throw new UntrustedFeedHostError(candidate, 'it is not on this deployment\u2019s allow-list');
  }

  return normalized;
}

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
 *
 * ★★★ ITS COLLISION LOOP IS TOTAL, AND IT ISSUES EXACTLY ONE STATEMENT. This paragraph used to read
 * "ITS COLLISION LOOP IS BOUNDED HERE, WHERE THE LEGACY'S IS NOT", pointing at a 100-attempt ceiling
 * that raised `UrlTitleCollisionLimitError` on the hundred-and-first suffix. A code review raised
 * that as F9, MAJOR: the callers "require the next available suffix and the legacy loop continues
 * until success". The retirement tombstone above records both findings and why reading the slug's
 * whole family in one statement discharges each of them rather than trading one for the other.
 */
class SqlUrlTitleGenerator implements UrlTitleGenerator {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  public async createUniqueURLTitle(
    titleString: string,
    tableName: UrlTitleTableName,
  ): Promise<string> {
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

    // ★★★ THE ONE STATEMENT, AND THE ONLY STRUCTURAL CHANGE FROM THE LEGACY BODY. Everything below
    // this line is [model/service/DataService.cfc:L55-L70] unchanged, with `verifyUniqueTableValue`
    // resolved from a set instead of from a round trip. The legacy asked the database once per
    // candidate; this asks once per call and then asks the answer.
    const takenTitles = await this.readUrlTitleFamily(tableName, urlTitle);

    // [L55] `var addon = 1;` - one, not two, so that the first suffix [L65-L66] produces is `-2`.
    let addon = 1;

    // [L60] `var returnTitle = urlTitle;` - the unsuffixed candidate is tried
    // first, which is why the FIRST SUFFIX IS `-2` and never `-1`.
    let returnTitle = urlTitle;

    // [L64-L68] `while(!unique) { addon++; returnTitle = "#urlTitle#-#addon#"; unique = ... }`
    //
    // ★★★ WHY THIS TERMINATES, WITHOUT A CEILING AND WITHOUT AN UNREACHABLE BRANCH. Every iteration
    // produces a DISTINCT string - `addon` strictly increases, so no two iterations propose the same
    // candidate - and the loop continues only while the proposal is a member of `takenTitles`, which
    // is finite and never grows during the walk. So it runs at most `takenTitles.size` times and
    // then answers. There is no counter to exhaust, no error to raise, and no branch a test cannot
    // reach: the totality is structural rather than asserted, which is exactly what F9 required.
    //
    // ★★ AND GAP REUSE IS PRESERVED BECAUSE THE WALK IS ASCENDING. A family holding `slug`, `slug-2`
    // and `slug-4` answers `slug-3`, not `slug-5` - the legacy tested candidates in the same order
    // and stopped at the same one. Deriving the answer from `MAX(suffix) + 1` would have been simpler
    // and would have skipped the gap, which is observable in the column a customer sees.
    while (takenTitles.has(returnTitle)) {
      addon += 1;
      returnTitle = `${urlTitle}-${String(addon)}`;
    }

    // [L70] `return returnTitle;`
    return returnTitle;
  }

  /**
   * Every stored title in this slug's family, folded for the comparison the column's collation
   * performs.
   *
   * REPLACES `verifyUniqueTableValue` [model/dao/DataDAO.cfc:L115-L131], whose whole body was
   * `SELECT #column# FROM #tableName# WHERE #column# = <cfqueryparam …/>` followed by
   * `if(rs.recordCount) return false`. That test survives verbatim in the caller as
   * `takenTitles.has(candidate)`; what has gone is the one-question-per-round-trip shape.
   *
   * ★★ THE FOLD IS THE COLLATION'S BEHAVIOUR, NOT LENIENCY ADDED HERE. `SwBrand.urlTitle`,
   * `SwProduct.urlTitle` and `SwProductType.urlTitle` are ordinary `varchar` columns under the
   * schema's default collation, which is case-INSENSITIVE - so the legacy
   * `WHERE urlTitle = 'nike-air'` matched a stored `Nike-Air` and its caller treated that slug as
   * taken. Comparing case-sensitively here would answer `nike-air` as free and then let the write
   * fail on the `unique="true"` constraint [model/entity/Brand.cfc:L55]. Every candidate is already
   * lowercase, so folding the STORED side is what reproduces the match.
   *
   * A ROW WHOSE `urlTitle` IS NULL CONTRIBUTES NOTHING, which is why the read is optional rather
   * than required: the column is nullable on all three tables, `WHERE urlTitle = ?` never matches
   * NULL in SQL, and neither disjunct can return such a row - so this is defence against a driver
   * surprise rather than a live branch, and it must not become a `''` entry that makes the empty
   * slug look taken.
   */
  private async readUrlTitleFamily(
    tableName: UrlTitleTableName,
    urlTitle: string,
  ): Promise<ReadonlySet<string>> {
    // ★ THE TABLE IS RESOLVED BEFORE IT IS USED, AND AN UNKNOWN ONE IS REFUSED BY NAME. This read
    // used to index `SELECT_URL_TITLE_FAMILY_SQL[tableName]` inline, trusting the closed
    // `UrlTitleTableName` union - and a union erases at emit. QA testing drove eight out-of-union
    // values through `createUniqueURLTitle` (`'SwSku'`, `'information_schema.tables'`, `''`,
    // `'swbrand'`, `undefined`, `null`, `42`, and a `DROP TABLE` string) and recorded the outcome:
    // `executor.execute(undefined, ['nike','nike-%'])` was issued and the method RETURNED `'nike'` -
    // an unsuffixed answer that reads as "this title is unique" with the database never consulted.
    // Against the real pool the driver raised an opaque Buffer-type `TypeError` instead.
    //
    // A SILENT WRONG ANSWER IS THE HAZARD, NOT INJECTION. The name is never interpolated: the three
    // statements are frozen per-table literals and the values are bound. `'swbrand'` is refused too,
    // where CFML's identifier comparison was case-insensitive - the union spells the three physical
    // tables exactly, and admitting a folded spelling here would mean choosing a statement by a
    // comparison this port does not perform anywhere else.
    const familyStatement: string | undefined = SELECT_URL_TITLE_FAMILY_SQL[tableName];

    if (familyStatement === undefined) {
      throw new CompositionContractError(
        'createUniqueURLTitle was given a table that is not one of the three the url-title union ' +
          'declares (SwBrand, SwProduct, SwProductType), so no statement exists for it and no ' +
          'title may be reported as available',
        SELECT_URL_TITLE_FAMILY,
      );
    }

    // The bare slug, then the family prefix. The pattern needs no escaping - see
    // `SELECT_URL_TITLE_FAMILY_SQL` for why the sanitization above makes a metacharacter
    // impossible. An EMPTY slug is passed through exactly as the legacy passed it: the candidates
    // become `''`, `'-2'`, `'-3'`, … and the pattern `'-%'`, which is what
    // [model/service/DataService.cfc:L57-L60] produces for a title of `'!!!'`.
    const rows = requireStatementRows(
      await this.executor.execute(familyStatement, [urlTitle, `${urlTitle}-%`]),
      SELECT_URL_TITLE_FAMILY,
    );

    const takenTitles = new Set<string>();

    for (const row of rows) {
      const storedTitle = readOptionalText(row, 'urlTitle', SELECT_URL_TITLE_FAMILY);

      if (storedTitle !== undefined) {
        takenTitles.add(storedTitle.toLowerCase());
      }
    }

    // Only the ROW COUNT is published. `../lib/logger.js` fails closed on any context key it does
    // not recognize as legible, and neither a table name nor a candidate title is on that list - so
    // passing them would emit `[REDACTED]` and mislead a reader into thinking something was
    // recorded. The statement label attributes the line.
    logger.debug(`Read the urlTitle family (${SELECT_URL_TITLE_FAMILY})`, {
      rowCount: takenTitles.size,
    });

    return takenTitles;
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
 * One probe's participating relationship columns, as `[column, value]` pairs.
 *
 * This is the TypeScript spelling of `settingDetails.settingRelationships`
 * [model/service/SettingService.cfc:L519], and its emptiness is meaningful rather than degenerate: the
 * empty candidate is step 5 of the cascade, the probe that requires every column to be NULL.
 */
type SettingRelationshipCandidate = readonly (readonly [string, string])[];

/**
 * Setting rows indexed for O(1) probing: setting name, then relationship key, to setting value.
 *
 * The inner key is built by {@link buildSettingRelationshipKey}, which is what lets a six-step cascade
 * over hundreds of SKUs cost no I/O and no scanning.
 */
type SettingRowIndex = ReadonlyMap<string, ReadonlyMap<string, string>>;

/**
 * The canonical key of a relationship set: which columns are non-NULL, and to what.
 *
 * ★★★ THIS ONE FUNCTION IS THE WHOLE OF THE LEGACY `WHERE` CLAUSE, which is why it is worth being
 * explicit about the correspondence. `getSettingRecordBySettingRelationships`
 * [model/service/SettingService.cfc:L768-L870] emits `LOWER(col) = ?` for a participating column and
 * `col IS NULL` for every other, so a row matches a probe if and only if the row's set of non-NULL
 * relationship columns is EXACTLY the probe's participating set, value for value. Two sets are equal
 * exactly when their canonical keys are, so a string comparison decides it.
 *
 * SORTED, BECAUSE A SET HAS NO ORDER. `{ productTypeID, brandID }` and `{ brandID, productTypeID }` are
 * the same probe and must key identically; the legacy compared struct keys, which are unordered.
 *
 * FOLDED, BECAUSE THE LEGACY FOLDED. Both sides of every comparison are wrapped in `LOWER(...)`
 * [model/service/SettingService.cfc:L783 onwards], so the key lowercases values. Column names are
 * already canonical - they come from {@link SETTING_RELATIONSHIP_COLUMNS}, not from a row.
 *
 * SEPARATED BY CONTROL CHARACTERS so no identifier can forge a key boundary. A value containing `=` or
 * `&` would otherwise be able to look like two pairs, and the whole point of the key is that it means
 * exactly one set.
 */
function buildSettingRelationshipKey(candidate: SettingRelationshipCandidate): string {
  return [...candidate]
    .map(([columnName, value]): string => `${columnName}\u0001${value.toLowerCase()}`)
    .sort()
    .join('\u0002');
}

/**
 * Folds the rows of `SELECT_SKU_FEED_SETTINGS_SQL` into a probe-able index.
 *
 * ★★ A ROW WHOSE `settingValue` IS NULL STILL WINS, AND ANSWERS THE EMPTY STRING. The legacy assigns
 * `settingDetails.settingValue = settingRecord.settingValue` and sets `foundValue = true` in the same
 * breath [model/service/SettingService.cfc:L525-L527], and a NULL query column reads as `''` in CFML -
 * so a row deliberately blanking a setting SHORT-CIRCUITS the cascade at its own level rather than
 * falling through to an ancestor or to the declared default. Mapping NULL to `''` here, rather than to
 * `undefined`, is what preserves that: `undefined` is reserved for "no row matched", and conflating the
 * two would let a blanked setting inherit a value the merchant blanked it to suppress.
 *
 * ★★ AN EMPTY-STRING RELATIONSHIP COLUMN PARTICIPATES; IT DOES NOT COUNT AS NULL. `col IS NULL` is
 * false for `''` in SQL, and so is `LOWER(col) = '<some-id>'`, which means such a row was unreachable
 * from every probe the legacy issued. Recording `''` as a participating value reproduces exactly that:
 * no candidate this resolver builds carries an empty value, so no candidate can match it.
 *
 * FIRST ROW WINS ON A TIE, matching CFML's read of row 1 of a multi-row result
 * [model/service/SettingService.cfc:L525]. See `SELECT_SKU_FEED_SETTINGS_SQL` on why no `ORDER BY`
 * imposes which row that is.
 */
function indexSettingRows(rows: readonly SqlRow[]): SettingRowIndex {
  const index = new Map<string, Map<string, string>>();

  for (const row of rows) {
    const settingName = readIdentifier(row, 'settingName', SELECT_SKU_FEED_SETTINGS);
    const settingValue = readOptionalText(row, 'settingValue', SELECT_SKU_FEED_SETTINGS) ?? '';

    const participating: [string, string][] = [];

    for (const columnName of SETTING_RELATIONSHIP_COLUMNS) {
      const value = readOptionalText(row, columnName, SELECT_SKU_FEED_SETTINGS);

      if (value !== undefined) {
        participating.push([columnName, value]);
      }
    }

    const foldedName = settingName.toLowerCase();
    const byRelationship = index.get(foldedName) ?? new Map<string, string>();
    const relationshipKey = buildSettingRelationshipKey(participating);

    if (!byRelationship.has(relationshipKey)) {
      byRelationship.set(relationshipKey, settingValue);
    }

    index.set(foldedName, byRelationship);
  }

  return index;
}

/** One probe against the index: the row's value, or `undefined` when no row matched. */
function lookupSettingValue(
  settingRows: SettingRowIndex,
  settingName: string,
  candidate: SettingRelationshipCandidate,
): string | undefined {
  return settingRows.get(settingName.toLowerCase())?.get(buildSettingRelationshipKey(candidate));
}

/**
 * The five probes of the `sku` lookup order, in the exact sequence the legacy issues them.
 *
 * The sixth step - the declared default - is not a probe and is not listed; it is the caller's `return`
 * once this sequence is exhausted.
 *
 * ★★ AN ABSENT IDENTIFIER SKIPS ITS PROBES RATHER THAN PROBING FOR AN EMPTY ONE, and the two are
 * equivalent. When a product has no product type, `getValueByPropertyIdentifier` yields an empty path,
 * `listLen("")` is 0, and the legacy's `else` branch sets `relationshipValue = ""`
 * [model/service/SettingService.cfc:L558-L560] - so it probes `LOWER(productTypeID) = ''`, which no
 * row with a NULL or populated column can satisfy. Omitting a probe that cannot match and issuing one
 * that cannot match reach the same next step. The lone divergence is a row that literally stores an
 * empty string in a foreign-key column, which Hibernate never wrote - it writes NULL for an absent
 * association - and which `indexSettingRows` keeps unreachable in either reading.
 *
 * ★★ THE BRAND CONJUNCT IS WALKED TO EXHAUSTION BEFORE THE PATH-ONLY STEP BEGINS. The legacy advances
 * `nextLookupOrderIndex` only once `nextPathListIndex` reaches 0
 * [model/service/SettingService.cfc:L586-L589], so EVERY segment is tried with the brand before ANY
 * segment is tried without it. A leaf-plus-brand setting therefore beats a root-only setting, and
 * interleaving the two steps would invert that for every product whose type has a parent.
 */
function buildSkuSettingCandidates(
  subject: SkuFeedSettingSubject,
  productTypePaths: ReadonlyMap<string, readonly string[]>,
): readonly SettingRelationshipCandidate[] {
  const candidates: SettingRelationshipCandidate[] = [
    // Step 1. The object's own identifier [model/service/SettingService.cfc:L519-L523].
    [['skuID', subject.skuID]],
    // Step 2. Lookup entry 1, `product.productID` [model/service/SettingService.cfc:L104].
    [['productID', subject.productID]],
  ];

  // LEAF FIRST, THEN OUTWARDS TO THE ROOT. The stored path runs root-first
  // [org/Hibachi/HibachiEntity.cfc:L315] and the legacy indexes it downwards
  // [model/service/SettingService.cfc:L552-L557], so reversing the stored order IS the walk order.
  const storedPath =
    subject.productTypeID === undefined ? [] : (productTypePaths.get(subject.productTypeID) ?? []);
  const walkOrder = [...storedPath].reverse();

  // Step 3. Lookup entry 2, `productTypeIDPath & brand.brandID`, once per segment.
  if (subject.brandID !== undefined) {
    for (const productTypeID of walkOrder) {
      candidates.push([
        ['productTypeID', productTypeID],
        ['brandID', subject.brandID],
      ]);
    }
  }

  // Step 4. Lookup entry 3, `productTypeIDPath` alone, once per segment.
  for (const productTypeID of walkOrder) {
    candidates.push([['productTypeID', productTypeID]]);
  }

  // Step 5. No relationships at all [model/service/SettingService.cfc:L594-L608] - the row an
  // administrator sets as the installation-wide value, which requires all seventeen columns NULL.
  candidates.push([]);

  return candidates;
}

// ★★★ `DeclaredDefaultSkuFeedSettingResolver` WAS HERE, AND IT WAS THE ANSWER TO THE WRONG QUESTION.
//
// It answered `{ skuShippingWeight: '1', skuShippingWeightUnitCode: 'lb' }` for every subject, and
// justified that with a sentence quoted from the port's own docblock - a resolver "is free to answer
// from one query, from a warmed table or FROM DECLARED DEFAULTS". Its reasoning ran:
//
//   "declared defaults are what this composition can honestly answer with ... a per-SKU override lives
//    in `SwSetting` rows whose resolution order [model/service/SettingService.cfc:L104] walks the
//    product, the product-type path and the brand - a lookup that belongs to a settings owner, not to
//    this root, and that no in-scope port exposes."
//
// ★★ THE PORT QUOTATION WAS ACCURATE AND THE CONCLUSION STILL DID NOT FOLLOW. "Free to answer from
// declared defaults" licenses a default as the CASCADE'S LAST STEP, which is exactly what it is in the
// legacy [model/service/SettingService.cfc:L482-L487]; it does not license skipping the five steps in
// front of it. Code review put it precisely: "Do not masquerade defaults as resolved overrides." A
// merchant who sets a 12 lb shipping weight on a product type and reads `1 lb` in the feed has not been
// given a default - they have been given a wrong answer that is indistinguishable from a right one.
//
// ★★ AND "NO IN-SCOPE PORT EXPOSES IT" WAS TRUE BUT IRRELEVANT, for the same reason it was in F13 and
// F14. `src/domain/ports/settingsProvider.ts` is locked at its four keys and stays locked; the thirteen
// ports are unchanged. What the absence of a port rules out is a PORT-SHAPED solution, not a solution.
// This resolver is a module-local structural collaborator over `PreparedStatementExecutor`, the same
// construct `SqlUrlTitleGenerator`, `SqlPriceGroupFrameworkReads`, `SqlBrandFrameworkWrites` and
// `readAddressZoneLocationIndex` already use, and it consumes no B4 ledger slot because it is not a
// ported CFML surface.
//
// The review offered a second option - "or refuse feed generation until available". That is rejected on
// the evidence of F1, F2 and F8, all three of which were refusals of valid states that had to be
// removed in this same review cycle. A catalog with no `SwSetting` overrides at all is the ordinary
// case, and the legacy served it from the declared defaults without complaint.

/**
 * Per-SKU shipping-weight settings for the product feed, resolved through the legacy precedence.
 *
 * WHAT THE LEGACY DOES, IN ONE PLACE. `local.sku.setting('skuShippingWeight')`
 * [integrationServices/google/views/feed/product.cfm:L58] reaches `getSettingDetails`
 * [model/service/SettingService.cfc:L466-L610], which seeds the declared default, matches the prefix
 * `sku` against `settingPrefixInOrder` [model/service/SettingService.cfc:L81-L100], and then probes
 * `SwSetting` in this order:
 *
 *   1. `{ skuID }`                              the object's own identifier [L519-L523]
 *   2. `{ productID }`                          lookup entry 1 [L104]
 *   3. `{ productTypeID, brandID }`             lookup entry 2, ONE PROBE PER PATH SEGMENT
 *   4. `{ productTypeID }`                      lookup entry 3, ONE PROBE PER PATH SEGMENT
 *   5. `{ }`                                    no relationships at all [L594-L608]
 *   6. the declared default                     seeded before any probe ran [L482-L487]
 *
 * ★★★ THE PATH IS WALKED LAST SEGMENT FIRST, AND THAT IS WHAT MAKES IT INHERITANCE.
 * `nextPathListIndex = listLen(pathList)` then `listGetAt(pathList, nextPathListIndex)` followed by
 * `nextPathListIndex--` [model/service/SettingService.cfc:L552-L557] walks DOWN. The stored list runs
 * root-first because `buildIDPathList` prepends [org/Hibachi/HibachiEntity.cfc:L315], so walking down
 * means LEAF FIRST, then its parent, then its grandparent, out to the root. A setting on the nearest
 * product type therefore beats one on a distant ancestor - and reversing the walk would silently invert
 * that, answering the root's value while a leaf override sat unread.
 *
 * ★★ THERE IS NO BRAND-ONLY STEP, however much one might expect one. The brand appears only as the
 * `&product.brand.brandID` conjunct of entry 2 [model/service/SettingService.cfc:L104], never alone, so
 * a row carrying a `brandID` and no `productTypeID` is unreachable from a SKU. That is not an omission
 * here; it is the lookup table, and inventing the missing step would answer settings the legacy never
 * found.
 *
 * ★★ TWO STATEMENTS FOR THE WHOLE BATCH, WHICH IS THE OTHER HALF OF THE FINDING. The port requires
 * batching - "a per-row call would issue one lookup per SKU, which is the N+1 shape the repository
 * boundary exists to make impossible" - and the legacy's own shape agrees: it read the table ONCE
 * [model/dao/SettingDAO.cfc:L51-L62] and memoized it, then probed in-engine. So the candidate rows and
 * the ancestry paths are each read once, however many SKUs the feed selected, and all six steps run in
 * memory over those two results. The statement count does not vary with the batch size.
 *
 * ANSWERING EVERY SUBJECT IS STILL THE CONTRACT, and it remains structurally guaranteed: step 6 is
 * unconditional, so the cascade cannot fall off its end. Duplicate subjects collapse onto one entry,
 * which is what a map keyed by SKU means.
 */
class SqlSkuFeedSettingResolver implements SkuFeedSettingResolver {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  public async resolveSkuShippingWeightSettings(
    subjects: readonly SkuFeedSettingSubject[],
  ): Promise<ReadonlyMap<string, ResolvedSkuShippingWeightSetting>> {
    const resolved = new Map<string, ResolvedSkuShippingWeightSetting>();

    // No subjects means no feed rows, and `IN ()` is a MySQL syntax error besides. The repository
    // already returns early on an empty selection; this guard makes the resolver safe on its own terms.
    if (subjects.length === 0) {
      return resolved;
    }

    const settingRows = await this.readSettingRows();
    const productTypePaths = await this.readProductTypePaths(subjects);

    for (const subject of subjects) {
      resolved.set(subject.skuID, {
        skuShippingWeight: this.resolveOne(
          SKU_SHIPPING_WEIGHT_SETTING_NAME,
          SKU_SHIPPING_WEIGHT_DEFAULT,
          subject,
          settingRows,
          productTypePaths,
        ),
        skuShippingWeightUnitCode: this.resolveOne(
          SKU_SHIPPING_WEIGHT_UNIT_CODE_SETTING_NAME,
          SKU_SHIPPING_WEIGHT_UNIT_CODE_DEFAULT,
          subject,
          settingRows,
          productTypePaths,
        ),
      });
    }

    // Legible keys only; see the note at `SqlUrlTitleGenerator`. `rowCount` is what was asked about and
    // `resultCount` what was answered, and they must agree - the cascade's last step is unconditional.
    // Neither a setting value nor an identifier is published: a shipping weight is not a secret, but
    // the logger admits a fixed key set and widening it for diagnostics is how that stops being true.
    logger.debug('Resolved per-SKU shipping-weight settings', {
      rowCount: subjects.length,
      resultCount: resolved.size,
    });

    return resolved;
  }

  /**
   * Runs the six-step cascade for ONE setting and ONE subject, in memory.
   *
   * Every step is a lookup into the index built by `readSettingRows`, so the cascade costs no I/O and
   * the ordering below is the whole of the behaviour. The first hit wins and the walk stops, which is
   * `foundValue` short-circuiting the legacy's `do { } while (!foundValue && ...)`
   * [model/service/SettingService.cfc:L544-L590].
   */
  private resolveOne(
    settingName: string,
    declaredDefault: string,
    subject: SkuFeedSettingSubject,
    settingRows: SettingRowIndex,
    productTypePaths: ReadonlyMap<string, readonly string[]>,
  ): string {
    for (const candidate of buildSkuSettingCandidates(subject, productTypePaths)) {
      const settingValue = lookupSettingValue(settingRows, settingName, candidate);

      if (settingValue !== undefined) {
        return settingValue;
      }
    }

    // Step 6. [model/service/SettingService.cfc:L482-L487] seeded this before any probe ran, so
    // reaching it means every probe missed rather than that no probe was attempted.
    return declaredDefault;
  }

  /** Step 1 of the two reads: every candidate row for the feed's two keys. */
  private async readSettingRows(): Promise<SettingRowIndex> {
    const rows = await this.executor.execute(SELECT_SKU_FEED_SETTINGS_SQL, [
      SKU_SHIPPING_WEIGHT_SETTING_NAME.toLowerCase(),
      SKU_SHIPPING_WEIGHT_UNIT_CODE_SETTING_NAME.toLowerCase(),
    ]);

    return indexSettingRows(rows);
  }

  /**
   * Step 2 of the two reads: the ancestry path of every product type the batch mentions.
   *
   * The batch is deduplicated first, so a feed of five hundred SKUs sharing one product type binds one
   * key rather than five hundred. A batch mentioning no product type at all skips the statement
   * entirely - there is nothing to ask about, and `IN ()` would not parse.
   */
  private async readProductTypePaths(
    subjects: readonly SkuFeedSettingSubject[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const leafIdentifiers = [
      ...new Set(
        subjects
          .map((subject) => subject.productTypeID)
          .filter((productTypeID): productTypeID is string => productTypeID !== undefined),
      ),
    ];

    if (leafIdentifiers.length === 0) {
      return new Map<string, readonly string[]>();
    }

    const rows = await this.executor.execute(
      buildSelectProductTypePathsSql(leafIdentifiers.length),
      leafIdentifiers,
    );

    const paths = new Map<string, readonly string[]>();

    for (const row of rows) {
      const productTypeID = readIdentifier(row, 'productTypeID', SELECT_PRODUCT_TYPE_PATHS);
      const storedPath = readOptionalText(row, 'productTypeIDPath', SELECT_PRODUCT_TYPE_PATHS);

      // `listToArray` drops empty elements exactly as CFML's does, so a trailing comma or a doubled
      // separator yields no phantom segment.
      paths.set(productTypeID, listToArray(storedPath ?? ''));
    }

    // A leaf whose row is absent, or whose stored path is empty, still has ONE known segment: itself.
    // The legacy could not observe an empty path here, because `getProductTypeIDPath`
    // [model/entity/ProductType.cfc:L251-L253] rebuilds the list from the live parent chain whenever the
    // column is null, and `buildIDPathList` always includes the entity it starts from
    // [org/Hibachi/HibachiEntity.cfc:L315]. Seeding the leaf reproduces the floor of that guarantee -
    // a leaf-level override is still found - without pretending to know an ancestry the column did not
    // record.
    for (const leafIdentifier of leafIdentifiers) {
      const knownPath = paths.get(leafIdentifier);

      if (knownPath === undefined || knownPath.length === 0) {
        paths.set(leafIdentifier, [leafIdentifier]);
      }
    }

    return paths;
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
   * A SET of options, each with its group, in ONE statement, keyed by case-folded
   * identifier.
   *
   * ★★ WHY IT EXISTS. `toCreateSkusInput` resolved the product-save payload's
   * option list by awaiting {@link SqlOptionEntityLoader.getOption} once per
   * distinct identifier. Nothing in that loop consumed the previous answer - each
   * option was only pushed into an array - so the serialization cost one round trip
   * per option group on the product and bought nothing. `SkuService.createSkus`
   * then runs a cartesian-product odometer over those very groups
   * [model/service/SkuService.cfc:L109-L121], so the list is not a pair: it is as
   * long as the product has option groups.
   *
   * FETCH SHAPE: IDENTICAL TO THE SINGULAR FORM, option for option. Each row still
   * yields its own `OptionGroup` with an EMPTY options collection, exactly as
   * {@link SqlOptionEntityLoader.getOption} hydrates it and for the reason recorded
   * there: both in-scope readers take only the group's identifier
   * [model/service/ProductService.cfc:L144], so materializing the group's siblings
   * would issue a query no caller reads. Two options sharing a group therefore
   * receive two group instances, which is what N singular calls produced as well -
   * this method is a statement-count change, not an identity change, and no
   * consumer compares group instances by reference.
   *
   * ★ KEYED BY CASE-FOLDED IDENTIFIER, AND UNORDERED. CFML identifiers are
   * case-insensitive; the map key is folded so a caller's spelling need not match
   * the stored row's. No order is published because `IN (...)` guarantees none and
   * the caller walks its own list.
   *
   * ★ A KEY THAT MATCHES NO ROW IS ABSENT FROM THE MAP, and that is the load-bearing
   * half of the contract. The miss is NOT reported here, because `SkuService`'s own
   * `resolveOptionByID` must be the thing that raises, at the exact legacy locator,
   * for an identifier the payload named and the schema does not carry. Reporting it
   * here would move the failure to the composition root and change the error a
   * caller sees.
   *
   * ★ AN EMPTY REQUEST ISSUES NO STATEMENT. Parity, not optimisation: N singular
   * calls issue N statements, so zero calls issue zero. It also prevents `IN ()`,
   * a MySQL syntax error. This is NOT the empty-string binding
   * `src/repositories/mysql/mysqlOptionRepository.ts` performs, and the two MUST NOT
   * be harmonised: that adapter reproduces `OptionDAO`'s LACK of an emptiness guard
   * inside a `NOT IN (...)` exclusion, where an empty list changes WHICH ROWS MATCH.
   * Here an empty list means the caller asked for nothing.
   *
   * @param optionIDs - the keys to load, in any order and with any repetition.
   *   Repeated keys - including keys repeated only in casing - are collapsed to ONE
   *   placeholder.
   */
  public async getOptionsByID(optionIDs: readonly string[]): Promise<ReadonlyMap<string, Option>> {
    // De-duplicated by FOLDED key while BINDING the first spelling seen, so the bound
    // parameters stay the caller's own values while `'ABC'` and `'abc'` cost one
    // placeholder rather than two.
    const requestedOptionIDs: string[] = [];
    const seenFoldedOptionIDs = new Set<string>();

    for (const optionID of optionIDs) {
      const foldedOptionID = foldIdentifier(optionID);

      if (seenFoldedOptionIDs.has(foldedOptionID)) {
        continue;
      }

      seenFoldedOptionIDs.add(foldedOptionID);
      requestedOptionIDs.push(optionID);
    }

    if (requestedOptionIDs.length === 0) {
      return new Map<string, Option>();
    }

    const rows = await this.executor.execute(
      buildSelectOptionsWithGroupByIDSql(requestedOptionIDs.length),
      requestedOptionIDs,
    );

    const optionsByFoldedID = new Map<string, Option>();

    for (const row of rows) {
      const optionGroup = hydrateOptionGroup(
        row,
        SELECT_OPTIONS_WITH_GROUP_BY_ID,
        OPTION_GROUP_ALIAS_PREFIX,
        [],
      );

      const option = hydrateOption(row, SELECT_OPTIONS_WITH_GROUP_BY_ID, optionGroup);

      optionsByFoldedID.set(foldIdentifier(option.getOptionID()), option);
    }

    return optionsByFoldedID;
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
 * The one set-based price-group read this root needs, and nothing else.
 *
 * ★★ MODULE-LOCAL AND UN-EXPORTED, SO THE PORT INVENTORY IS UNTOUCHED. This is
 * NOT a fourteenth port and NOT a seventh member of `PriceGroupRepository` -
 * `src/domain/ports/priceGroupRepository.ts` locks its count at SIX explicitly,
 * and that lock has already shaped two of its own designs (`savePriceGroupRate`'s
 * optional trailing parameter and `deletePriceGroup`'s internal probes). It is
 * declared here, satisfied structurally by `MySqlPriceGroupRepository`, and
 * checked where that instance is handed over - the same discipline
 * `OptionLoadingCollaborator` and `PriceGroupFrameworkReads` already follow from
 * the service tier.
 *
 * ★ WHY THE THREE CONSUMERS TAKE THIS RATHER THAN THE WHOLE PORT. Each of them
 * used exactly one repository member and nothing more, so each now declares
 * exactly what it uses. A narrower parameter is also what makes the fetch-shape
 * obligation visible at the call site: there is no singular by-key read on this
 * contract to fall back to, so a future reader cannot reintroduce a per-identifier
 * loop without first widening this interface.
 *
 * SEMANTICS, RESTATED HERE BECAUSE THIS IS THE CONTRACT THE CALLERS SEE:
 *
 *  * ONE statement for the whole key set, or NO statement at all when the set is
 *    empty. Never one per key.
 *  * The result is keyed by CASE-FOLDED identifier, because CFML identifiers are
 *    case-insensitive and MySQL's default collation matches them that way.
 *  * The map is UNORDERED. `IN (...)` guarantees no row order and none is
 *    imposed, so every caller rebuilds the order it wants from the list it
 *    already holds.
 *  * A key that matches no row is ABSENT from the map. The loader neither throws
 *    nor substitutes; each caller decides what a miss means, and the two callers
 *    here decide differently on purpose.
 *  * Every entity arrives with the fetch shape `getPriceGroup` gives it -
 *    rates, each rate's rounding rule and link collections, the parent chain to
 *    the root, and direct children one level - so substituting this for a loop of
 *    singular reads cannot change what a caller can see.
 */
interface PriceGroupSetLoader {
  getPriceGroupsByID(priceGroupIDs: readonly string[]): Promise<ReadonlyMap<string, PriceGroup>>;
}

/**
 * The two price-group reads `PriceGroupService` declares.
 *
 * Satisfied structurally, with no `implements` clause: the interface is
 * module-local to `priceGroupService.ts` and is checked at the constructor call.
 */
class SqlPriceGroupFrameworkReads {
  /**
   * One account's live price-group association, keyed by `accountID`, for the lifetime of THIS
   * INSTANCE - which is one request.
   *
   * ★★ INSTANCE STATE, NEVER MODULE STATE, AND THAT DISTINCTION IS THE WHOLE SAFETY ARGUMENT. This
   * class is constructed inside `createRequestScope`, so one instance serves one invocation and this
   * map dies with it. A module-level equivalent would survive on a warm container and leak one
   * account's subscription price groups into a later, unrelated request - which is one customer's
   * pricing applied to another's order. `src/lib/config.ts` and the connection pool are the only
   * module-scoped state in this subtree, and neither is per-account.
   *
   * WHY MEMOIZE AT ALL. `PriceGroupService.calculateSkuPriceBasedOnAccount`
   * [model/service/PriceGroupService.cfc:L276-L284] appends the account's subscription price groups
   * INTO the array this read returns, and [L351] and [L365] must then observe them - which they only
   * can if all three reads see one array. Under Hibernate that was the session's live collection and
   * required no arranging; here the memo IS the session. This is a FIDELITY mechanism, not a
   * performance one, and it must not be described as a cache.
   */
  private readonly accountPriceGroupAssociations = new Map<string, PriceGroup[]>();

  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly priceGroupSetLoader: PriceGroupSetLoader,
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
   *
   * ★★ RETURNS THE SAME MUTABLE ARRAY INSTANCE ON EVERY CALL FOR ONE ACCOUNT, as
   * {@link PriceGroupFrameworkReads.getAccountPriceGroups} in `../services/priceGroupService.ts`
   * requires. The statement is issued once per account per request; every later read is served from
   * {@link SqlPriceGroupFrameworkReads.accountPriceGroupAssociations}, INCLUDING any member the
   * service appended in between. Handing back a fresh array - by re-querying, by spreading, or by
   * freezing - would drop those appends on the floor and silently re-open the defect this reproduces.
   *
   * ★ QUOTE-THEN-REVISE. An earlier revision re-queried on every call and returned
   * `readonly PriceGroup[]`. `priceGroupService.ts` then copied what it received, and the two
   * decisions together made the legacy request-lifetime mutation unobservable - while that file's own
   * `LEGACY-DEFECT` marker went on asserting the behaviour was preserved. Neither half was wrong in
   * isolation; the pair silently dropped a marked defect.
   *
   * ★ NOTE ON THE EMPTY CASE: an account with no price groups memoizes an EMPTY array rather than
   * nothing, so a later append still lands somewhere the next reader will see, and the statement is
   * not re-issued per read.
   */
  public async getAccountPriceGroups(accountID: string): Promise<PriceGroup[]> {
    const memoized = this.accountPriceGroupAssociations.get(accountID);

    if (memoized !== undefined) {
      return memoized;
    }

    const rows = await this.executor.execute(SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL, [accountID]);
    const association = await this.hydrateByIdentifier(rows, SELECT_ACCOUNT_PRICE_GROUP_IDS);

    // Stored before returning, so the FIRST caller and every later one hold the same instance. A
    // second concurrent call for the same account can still race past the memo check above and issue
    // the statement twice; `Map.set` then makes the last-hydrated array the shared one. That is
    // acceptable here and deliberately not guarded with an in-flight-promise map: the service's
    // methods are awaited in sequence by every caller in this subtree, so the race is not reachable,
    // and the legacy has no concurrency semantics at this point to reproduce.
    this.accountPriceGroupAssociations.set(accountID, association);

    return association;
  }

  /**
   * The CURRENT PAGE of price groups - AT MOST TEN, UNORDERED.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L233-L236]: legacy builds a
   * framework smart list and iterates `getPageRecords()`, which executes with
   * `offset 0, maxresults 10` from `HibachiSmartList.setup`'s declared defaults
   * [org/Hibachi/HibachiSmartList.cfc:L39, L759-L764]. The page size IS stated by
   * the source, just not at the call site; NO SORT is stated anywhere, so none is
   * imposed. Both decisions live in `SELECT_PRICE_GROUP_PAGE_IDS_SQL` and are
   * derived there.
   *
   * ★ QUOTE-THEN-REVISE. This doc used to read: "NO PAGE SIZE AND NO SORT IS
   * ASSERTED, because the source states neither - see
   * `SELECT_PRICE_GROUP_PAGE_IDS_SQL`. Inventing either would invent observable
   * behaviour, so the page is the collection." The final clause was the error: "the
   * page is the collection" is not a neutral reading of a silent source, it is a
   * substantive claim that the source contradicts.
   */
  public async getPriceGroupPageRecords(): Promise<readonly PriceGroup[]> {
    const rows = await this.executor.execute(SELECT_PRICE_GROUP_PAGE_IDS_SQL);

    // S-08. REFUSED BEFORE HYDRATION, so a refused page costs one identifier statement rather than
    // one statement per row plus every rate graph. See {@link MAX_PRICE_GROUP_PAGE_RECORDS}.
    if (rows.length > MAX_PRICE_GROUP_PAGE_RECORDS) {
      throw new CompositionDataError(
        `statement '${SELECT_PRICE_GROUP_PAGE_IDS}' returned ${String(rows.length)} price groups ` +
          `and at most ${String(MAX_PRICE_GROUP_PAGE_RECORDS)} will be hydrated: each one costs a ` +
          'further statement and its whole rate graph',
      );
    }

    return this.hydrateByIdentifier(rows, SELECT_PRICE_GROUP_PAGE_IDS);
  }

  /**
   * Turn identifier rows into entities: de-duplicate, load the whole set at once, rebuild the order.
   *
   * A link table can name the same price group twice; the ORM association could
   * not, so the duplicate is collapsed rather than hydrated twice. A dangling
   * identifier is a foreign-key violation the `Sw*` schema forbids, so it is
   * reported rather than skipped: skipping would silently price an order as
   * though the account had fewer price groups than it does.
   *
   * ★★ ONE SET READ, NOT ONE READ PER IDENTIFIER, AND THE SHAPE IS THE WHOLE POINT. What Hibernate
   * answered these two reads with was a SINGLE association fetch. This method now issues one keyed
   * statement for the whole de-duplicated set and then walks the caller's own identifier list to
   * rebuild the order, so the number of round trips no longer scales with the size of the
   * association. Ordering is rebuilt HERE rather than requested in SQL because `IN (...)` guarantees
   * no row order, and imposing one would invent an ordering neither the link table nor the legacy
   * association expressed.
   *
   * ★ QUOTE-THEN-REVISE ON THE LOOP THIS REPLACES. The superseded body awaited
   * `priceGroupRepository.getPriceGroup(priceGroupID)` once per distinct identifier, inside the same
   * `for` loop that read the rows. Nothing in that loop depended on the previous iteration's answer -
   * the entities were only pushed into an array - so the serialization bought nothing and cost one
   * round trip per member of every account's price-group association and per row of the price-group
   * page. Serial execution is kept only where a later read genuinely needs an earlier result, which
   * inside the loader is the ancestry walk and nowhere else.
   *
   * ★ THE DE-DUPLICATION KEY IS NOW CASE-FOLDED, matching the map the loader answers with, and this
   * is a fidelity refinement rather than a divergence. Two spellings of one identifier resolve to ONE
   * stored row and therefore to ONE entity; pushing that single instance into the association twice
   * is something no ORM collection ever did. It is unreachable with framework-generated identifiers,
   * and it is folded anyway so that the membership decision and the lookup cannot disagree.
   *
   * FETCH SHAPE: unchanged, association for association. The loader hands back exactly what
   * `getPriceGroup` hands back, so the mutable association this method feeds -
   * {@link SqlPriceGroupFrameworkReads.accountPriceGroupAssociations} - holds entities identical to
   * the ones it held before.
   */
  private async hydrateByIdentifier(
    rows: readonly SqlRow[],
    statementLabel: string,
  ): Promise<PriceGroup[]> {
    const seenFoldedIdentifiers = new Set<string>();
    const requestedPriceGroupIDs: string[] = [];

    for (const row of rows) {
      const priceGroupID = readIdentifier(row, 'priceGroupID', statementLabel);
      const foldedPriceGroupID = foldIdentifier(priceGroupID);

      if (seenFoldedIdentifiers.has(foldedPriceGroupID)) {
        continue;
      }

      seenFoldedIdentifiers.add(foldedPriceGroupID);
      requestedPriceGroupIDs.push(priceGroupID);
    }

    const priceGroupsByFoldedID =
      await this.priceGroupSetLoader.getPriceGroupsByID(requestedPriceGroupIDs);

    const priceGroups: PriceGroup[] = [];

    for (const priceGroupID of requestedPriceGroupIDs) {
      const priceGroup = priceGroupsByFoldedID.get(foldIdentifier(priceGroupID));

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
 * A freshly minted 32-character identifier, in the shape `fieldtype="id" generator="uuid" length="32"`
 * expects [model/entity/RoundingRule.cfc:L52, model/entity/Brand.cfc:L52].
 *
 * The hyphens are stripped because the column is 32 characters and a canonical UUID string is 36 - the
 * same reduction `mysqlProductRepository` and `mysqlPriceGroupRepository` each perform for the same
 * reason. `node:crypto`'s `randomUUID` is the standard library's cryptographically strong v4 generator,
 * so no dependency is added for this (E3: the pinned set is closed).
 */
function mintFrameworkIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * The value-rounding delegate a persisted `RoundingRule` is reconstructed with.
 *
 * Declared module-locally and un-exported, mirroring `src/domain/entities/roundingRule.ts` and
 * `src/repositories/mysql/mysqlPromotionRepository.ts`, which each declare their own structural copy
 * for the same reason: the entity's own interface is not exported, and structurally identical
 * interfaces are the same type.
 */
interface FrameworkWriteValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

/**
 * Raised when a framework write affects a different number of rows than the one it addressed.
 *
 * ★ WHY THIS IS CHECKED AT ALL, GIVEN THE LEGACY NEVER CHECKED IT. Hibernate DID check: a flush whose
 * UPDATE matched no row raised `StaleObjectStateException` rather than continuing, so a lost update was
 * an error in the legacy too. With the ORM gone, `executeMutation` reports an affected count and
 * nothing else looks at it, so an UPDATE against a deleted rounding rule would otherwise be reported to
 * the caller as a successful save - the same class of false success this whole grouping exists to
 * remove. Reproducing the ORM's refusal is the faithful choice, not an added guarantee.
 */
class FrameworkWriteError extends Error {
  public constructor(statementLabel: string, identifier: string, affectedRows: number) {
    super(
      `${statementLabel} affected ${String(affectedRows)} rows for identifier ${identifier}; ` +
        'exactly one was expected. The row may have been deleted by another request.',
    );
    this.name = 'FrameworkWriteError';
  }
}

/**
 * Raised when a brand save would duplicate an existing `urlTitle`.
 *
 * [model/validation/Brand.json] declares `"urlTitle": [{"contexts":"save","required":true,"unique":true}]`
 * and [model/entity/Brand.cfc:L55] carries the matching `unique="true"`. The legacy framework evaluated
 * the `unique` rule BEFORE reaching the database, so a duplicate surfaced as a validation failure rather
 * than as a driver-level constraint violation; this reproduces that ordering.
 */
class BrandUrlTitleNotUniqueError extends Error {
  public constructor(urlTitle: string, conflictingBrandID: string) {
    super(
      `saveBrand refused: urlTitle "${urlTitle}" is already held by brand ${conflictingBrandID}. ` +
        'Declared unique at model/validation/Brand.json and model/entity/Brand.cfc:L55.',
    );
    this.name = 'BrandUrlTitleNotUniqueError';
  }
}

/**
 * The durable half of `super.save` for `SwRoundingRule`, over the request's executor.
 *
 * ★★★ THIS IS THE COLLABORATOR THAT MAKES `RoundingRuleService.saveRoundingRule` ACTUALLY SAVE.
 * Before it existed the method evicted its memo and resolved the input entity, which was
 * indistinguishable from a successful write to every caller. The service declares the contract it needs
 * as `RoundingRuleFrameworkWrites` in `../services/roundingRuleService.ts`; this class satisfies it
 * STRUCTURALLY, with no `implements` clause, exactly as the two `Sql*FrameworkReads` collaborators
 * satisfy theirs.
 *
 * ★★ NOT A PORT, AND NOT A REPOSITORY MEMBER. The domain port set is closed at THIRTEEN [AAP 0.2.1] and
 * `PromotionRepository` is specified as SEVEN READS, so the write could live in neither place - and the
 * review that required it asked for precisely "a narrow module-local/framework-write collaborator over
 * the executor - without a 14th domain port". Reads of this same table stay where they already are, on
 * `PromotionRepository.getRoundingRuleQuery` [model/dao/RoundingRuleDAO.cfc:L51]; owning a table's read
 * has never licensed writing to it in this subtree, and this class is what keeps those two facts
 * compatible.
 *
 * ★ PER REQUEST, because it closes over the request's `AuditActorContext`. An actor is who is signed in
 * for THIS invocation, so a container-scoped writer would stamp one request's account onto another's
 * row - the same reasoning that makes the four writing repositories per request.
 */
class SqlRoundingRuleFrameworkWrites {
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly auditActor: AuditActorContext,
    private readonly valueRounder: FrameworkWriteValueRounder,
  ) {}

  /**
   * Insert or update one rule and answer the persisted row.
   *
   * `isNew()` selects the path, reading the `unsavedvalue=""` sentinel
   * [model/entity/RoundingRule.cfc:L52] exactly as Hibernate did when deciding whether a managed
   * entity was transient.
   *
   * ONE CAPTURED INSTANT per save, written to every stamped column, matching the single `now()` each of
   * [org/Hibachi/HibachiEntity.cfc:L609] and [:L661] takes.
   *
   * NO TRANSACTION, and that is a considered position rather than an omission: this is ONE statement.
   * `executor.transaction` exists for a multi-statement unit whose partial application would be
   * incoherent - `savePriceGroupRate`'s row-plus-six-link-tables, say - and a single statement is
   * already atomic in MySQL. Wrapping it would add a `START TRANSACTION` and a `COMMIT` round trip to
   * buy nothing.
   */
  public async saveRoundingRule(rule: RoundingRule): Promise<RoundingRule> {
    const auditTimestamp = new Date();
    const stampedBy = resolveAuditActorAccountID(this.auditActor);

    if (rule.isNew()) {
      const mintedID = mintFrameworkIdentifier();

      const inserted = await this.executor.executeMutation(INSERT_ROUNDING_RULE_SQL, [
        mintedID,
        rule.getRoundingRuleName() ?? null,
        rule.getRoundingRuleExpression() ?? null,
        rule.getRoundingRuleDirection() ?? null,
        auditTimestamp,
        // A refused actor gate binds NULL on an INSERT, which is what the legacy produced: a skipped
        // `setCreatedByAccount` left the property unset and Hibernate inserted null.
        stampedBy ?? null,
        auditTimestamp,
        stampedBy ?? null,
      ]);

      if (inserted.affectedRows !== 1) {
        throw new FrameworkWriteError(INSERT_ROUNDING_RULE, mintedID, inserted.affectedRows);
      }

      return this.rehydrate(rule, mintedID, {
        createdDateTime: auditTimestamp,
        createdByAccountID: stampedBy,
        modifiedDateTime: auditTimestamp,
        modifiedByAccountID: stampedBy,
      });
    }

    const roundingRuleID = rule.getRoundingRuleID();

    const result = await this.executor.executeMutation(UPDATE_ROUNDING_RULE_SQL, [
      rule.getRoundingRuleName() ?? null,
      rule.getRoundingRuleExpression() ?? null,
      rule.getRoundingRuleDirection() ?? null,
      auditTimestamp,
      // Bound NULL when the gate refuses, and `sqlUpdateAssignment` has rendered this column as
      // `COALESCE(?, modifiedByAccountID)` so the DATABASE keeps the stored value rather than losing it.
      stampedBy ?? null,
      // The key binds LAST, because it belongs to the WHERE clause and every SET placeholder precedes it.
      roundingRuleID,
    ]);

    if (result.affectedRows !== 1) {
      throw new FrameworkWriteError(UPDATE_ROUNDING_RULE, roundingRuleID, result.affectedRows);
    }

    return this.rehydrate(rule, roundingRuleID, {
      createdDateTime: rule.getCreatedDateTime(),
      createdByAccountID: rule.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      // The TypeScript mirror of the statement's `COALESCE`, so the returned entity agrees with the row.
      modifiedByAccountID: resolveStampedModifiedByAccountID(
        this.auditActor,
        rule.getModifiedByAccountID(),
      ),
    });
  }

  /**
   * A fresh entity describing the row just written.
   *
   * FETCH SHAPE (T3): NO RE-READ. Re-selecting the row would issue a statement the caller did not ask
   * for and could hand back a different shape from the one it passed in - the same disposition
   * `mysqlPriceGroupRepository.savePriceGroupRate` records for its own return. The association is carried
   * through unchanged; it is `inverse="true"` [model/entity/RoundingRule.cfc:L65] and so was never part
   * of this write.
   */
  private rehydrate(
    rule: RoundingRule,
    roundingRuleID: string,
    stamps: {
      readonly createdDateTime: Date | undefined;
      readonly createdByAccountID: string | undefined;
      readonly modifiedDateTime: Date | undefined;
      readonly modifiedByAccountID: string | undefined;
    },
  ): RoundingRule {
    return new RoundingRule(
      {
        roundingRuleID,
        roundingRuleName: rule.getRoundingRuleName(),
        roundingRuleExpression: rule.getRoundingRuleExpression(),
        roundingRuleDirection: rule.getRoundingRuleDirection(),
        createdDateTime: stamps.createdDateTime,
        createdByAccountID: stamps.createdByAccountID,
        modifiedDateTime: stamps.modifiedDateTime,
        modifiedByAccountID: stamps.modifiedByAccountID,
        priceGroupRates: rule.getPriceGroupRates(),
      },
      this.valueRounder,
    );
  }
}

/**
 * The durable half of `super.save` for `SwBrand`, over the request's executor.
 *
 * ★★★ THIS IS THE COLLABORATOR THAT REPLACES A THROW. `BrandService.saveBrand` previously resolved the
 * URL title and then ALWAYS raised, so the service's only operation was permanently unavailable. The
 * contract is declared by the consumer as `BrandFrameworkWrites` in `../services/brandService.ts` and
 * satisfied structurally here, for the same reasons set out on `SqlRoundingRuleFrameworkWrites`.
 *
 * ★★ IT WRITES THE ROW AND NOTHING ELSE, WHICH IS READ OFF THE MAPPING RATHER THAN CHOSEN.
 * Every one of `Brand`'s eight associations is declared `inverse="true"` [model/entity/Brand.cfc:L60-L61,
 * L66-L72], making the brand the owning side of none of them. Hibernate wrote a link-table row only for
 * an OWNING-side collection, so a brand save never touched `SwPromoRewardBrand`, `SwVendorBrand` or any
 * other. Reconciling them here would write rows the legacy did not.
 */
class SqlBrandFrameworkWrites {
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly auditActor: AuditActorContext,
  ) {}

  /**
   * Insert or update one brand and answer the persisted row.
   *
   * THE UNIQUENESS RULE IS EVALUATED BEFORE THE WRITE, not left to the column constraint, because
   * [org/Hibachi/HibachiService.cfc:L151] validated before it reached the DAO - so a duplicate title was
   * a refused save rather than a driver error. The probe excludes the row being saved, so re-saving an
   * existing brand without changing its title is not a self-collision.
   *
   * ONE CAPTURED INSTANT, and the audit columns follow exactly the rules
   * `SqlRoundingRuleFrameworkWrites.saveRoundingRule` documents: NULL on insert when the gate refuses,
   * `COALESCE` on update so a refusal preserves the stored attribution.
   */
  public async saveBrand(brand: Brand): Promise<Brand> {
    const auditTimestamp = new Date();
    const stampedBy = resolveAuditActorAccountID(this.auditActor);
    const isInsert = brand.isNew();
    const brandID = isInsert ? mintFrameworkIdentifier() : brand.getBrandID();
    const urlTitle = brand.getUrlTitle();

    // `urlTitle` is REQUIRED as well as unique, and the service has already enforced requiredness - so
    // by here it is present, and only the uniqueness half remains. The probe runs on both paths: an
    // insert can collide with a stored row, and an update can collide with a DIFFERENT stored row.
    if (urlTitle !== undefined) {
      const conflicting = await this.executor.execute(SELECT_BRAND_BY_URL_TITLE_SQL, [
        urlTitle,
        brandID,
      ]);
      const conflict = conflicting[0];

      if (conflict !== undefined) {
        throw new BrandUrlTitleNotUniqueError(
          urlTitle,
          readIdentifier(conflict, 'brandID', SELECT_BRAND_BY_URL_TITLE),
        );
      }
    }

    if (isInsert) {
      const inserted = await this.executor.executeMutation(INSERT_BRAND_SQL, [
        brandID,
        // The flags are booleans on the entity [model/entity/Brand.cfc:L53-L54, `ormtype="boolean"`], and
        // the entity has already resolved CFML truthiness for them, so they bind directly.
        brand.getActiveFlag(),
        brand.getPublishedFlag(),
        urlTitle ?? null,
        brand.getBrandName() ?? null,
        brand.getBrandWebsite() ?? null,
        brand.getRemoteID() ?? null,
        auditTimestamp,
        stampedBy ?? null,
        auditTimestamp,
        stampedBy ?? null,
      ]);

      if (inserted.affectedRows !== 1) {
        throw new FrameworkWriteError(INSERT_BRAND, brandID, inserted.affectedRows);
      }

      return this.rehydrate(brand, brandID, {
        createdDateTime: auditTimestamp,
        createdByAccountID: stampedBy,
        modifiedDateTime: auditTimestamp,
        modifiedByAccountID: stampedBy,
      });
    }

    const result = await this.executor.executeMutation(UPDATE_BRAND_SQL, [
      brand.getActiveFlag(),
      brand.getPublishedFlag(),
      urlTitle ?? null,
      brand.getBrandName() ?? null,
      brand.getBrandWebsite() ?? null,
      brand.getRemoteID() ?? null,
      auditTimestamp,
      stampedBy ?? null,
      brandID,
    ]);

    if (result.affectedRows !== 1) {
      throw new FrameworkWriteError(UPDATE_BRAND, brandID, result.affectedRows);
    }

    return this.rehydrate(brand, brandID, {
      createdDateTime: brand.getCreatedDateTime(),
      createdByAccountID: brand.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: resolveStampedModifiedByAccountID(
        this.auditActor,
        brand.getModifiedByAccountID(),
      ),
    });
  }

  /**
   * A fresh entity describing the row just written, carrying the caller's associations unchanged.
   *
   * No re-read, for the reason given on the rounding-rule counterpart. All five association arrays are
   * passed through because none of them was written: they are inverse collections, and dropping them
   * would hand back a brand that had silently lost its in-memory graph.
   */
  private rehydrate(
    brand: Brand,
    brandID: string,
    stamps: {
      readonly createdDateTime: Date | undefined;
      readonly createdByAccountID: string | undefined;
      readonly modifiedDateTime: Date | undefined;
      readonly modifiedByAccountID: string | undefined;
    },
  ): Brand {
    return new Brand({
      brandID,
      activeFlag: brand.getActiveFlag(),
      publishedFlag: brand.getPublishedFlag(),
      urlTitle: brand.getUrlTitle(),
      brandName: brand.getBrandName(),
      brandWebsite: brand.getBrandWebsite(),
      remoteID: brand.getRemoteID(),
      products: brand.getProducts(),
      promotionRewards: brand.getPromotionRewards(),
      promotionRewardExclusions: brand.getPromotionRewardExclusions(),
      promotionQualifiers: brand.getPromotionQualifiers(),
      promotionQualifierExclusions: brand.getPromotionQualifierExclusions(),
      createdDateTime: stamps.createdDateTime,
      createdByAccountID: stamps.createdByAccountID,
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: stamps.modifiedByAccountID,
    });
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
  const rows = requireStatementRows(
    await executor.execute(SELECT_CURRENCY_RECORDS_SQL),
    SELECT_CURRENCY_RECORDS,
  );

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
  // builds its own in `createRequestGraph`.
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
//   6. ASSEMBLE THE COMPLETE REQUEST GRAPH ONCE - all six repositories, all seven
//      services and the Google feed graph, in the prescribed order - VALIDATE every
//      binding on it, and DISCARD it
//   7. publish a single explicitly-typed accessor
//
// ★ STEP 6 IS WHY NOTHING IS EXPOSED OR LOGGED AS A SUCCESS UNTIL THE WHOLE GRAPH
// HAS BEEN PROVEN BUILDABLE. Steps 1-5 build only what module scope may safely
// RETAIN; step 6 builds everything else too, checks it, and throws it away. So the
// two-tier split stays exactly what it was - anything holding a memo is constructed
// per request - while the completeness of the wiring is settled at initialization
// rather than discovered when a priced order reaches an absent collaborator. The
// probe issues no statement, so it needs no reachable server.
//
// Only genuinely stateless, immutable collaborators are RETAINED here. Anything
// holding a memo belongs to tier 2 - see section 7.
// ===========================================================================

/**
 * Everything tier 1 owns, handed to `createRequestGraph` as one value.
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
  // NO `addressZoneEvaluator`. It USED TO SIT HERE, as a parameterless
  // `new CfmlAddressZoneEvaluator()`, on the reading that it was "genuinely stateless" -
  // and it was stateless only because it resolved nothing, which is what made every
  // configured address zone answer `false`. Now that it holds THIS REQUEST'S
  // zone-to-locations index it is tier-2 state by definition, and this tier is
  // restricted to collaborators that hold none. It is constructed in
  // `createRequestGraph`; see section 4.2.
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
  //
  // THE SINGLE-AUTHORITY GUARANTEE stated on `CompositionOverrides` is what makes
  // this one read the composition's only configuration: with no override this is
  // the same memoized process configuration the pool factory reads - the only other
  // reader there is - and with a supplied source
  // `assertSingleConfigurationAuthority` has already refused the arrangement in
  // which that reader could disagree with it. The statement builders are not
  // readers at all: each receives its dialect from the module constant its own
  // MySQL adapter states.
  const config = appConfig.load(overrides.environment);

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
  //
  // THIS IS THE ONE AND ONLY DIALECT DECISION OF THE COMPOSITION, AND IT IS THE SAME
  // VALUE ITS OWN SQL IS BUILT FROM. `resolveDialect(config.dialect)` reads the frozen
  // configuration resolved immediately above and this line refuses anything but MySQL,
  // BEFORE any repository is constructed, before a pool exists and before a statement
  // is built. Every MySQL adapter states the same dialect for itself as a
  // `STATEMENT_DIALECT` module constant pinned by `assertMySqlDialect` at module load,
  // so the assertion below is what makes the two agree: a composition that passes it is
  // running against the engine those constants name, and one that would not is refused
  // here. Removing this assertion would let a process configured for another engine
  // wire up and then issue MySQL statements.
  //
  // QUOTE-THEN-REVISE. This paragraph used to end: "the two builders that resolve a
  // dialect at request time - `salePricePromotionRewards.sql.ts` and
  // `sortedProductSkus.sql.ts` - reach the same value through
  // `resolveConfiguredDialect()`, which is `resolveDialect(appConfig.load().dialect)` over
  // that same memo." The memo claim was only true when `process.env` was the source; with
  // a supplied `environment` those builders read a DIFFERENT source - the process one -
  // and on a credential-free checkout that read threw. Neither builder resolves a dialect
  // now; each RECEIVES one, so the check here and the text those builders emit agree by
  // construction rather than by both reading one memo. `resolveConfiguredDialect()`
  // therefore has exactly ONE caller left in the subtree, `getConnectionPool()` in
  // `../repositories/mysql/connection.js:L1360`, which an `executor` override bypasses
  // outright.
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
  // PRECEDENCE, AND WHY IT IS THIS WAY ROUND. An explicit override wins, because a
  // suite that supplies a table means it; otherwise the DEPLOYMENT's configured
  // table applies; and only when neither exists is the table empty. Before finding
  // S-20 the middle arm did not exist at all, which is why production was always
  // 1:1. See {@link EUROPEAN_CENTRAL_BANK_RATE_MAX_AGE_DAYS}.
  const europeanCentralBankRates =
    overrides.europeanCentralBankRates ??
    (Object.keys(config.currency.europeanCentralBankRates).length > 0
      ? config.currency.europeanCentralBankRates
      : EMPTY_EUROPEAN_CENTRAL_BANK_RATES);

  reportRateTableAge(config.currency.ratesRetrievedAt, europeanCentralBankRates);
  const skuEligibleCurrencies = await resolveEligibleCurrencyCodeList(
    currencyRecords,
    europeanCentralBankRates,
  );
  // ★ FROZEN AT CONSTRUCTION, BECAUSE "STATELESS AND IMMUTABLE" HAS TO BE TRUE OF THE INSTANCE AND
  // NOT ONLY OF ITS TABLE. The constructor freezes `this.values`, and the root that publishes this
  // provider is itself frozen - but freezing the root stops a member from being REPLACED, not the
  // object behind it from being EXTENDED. QA testing (INFO-3) walked exactly that gap:
  // `root.settingsProvider.setting = () => 'HACKED'` installed a shadowing own property, every later
  // `setting('skuCurrency')` answered `'HACKED'`, and because this is a TIER-ONE object the shadow
  // outlived the request and was still there for the next one on a warm container. Sealing the
  // instance makes that assignment a `TypeError` instead, at no cost: the class declares one field,
  // writes it once here, and `setting()` only reads.
  const settingsProvider = Object.freeze(new BootstrapSettingsProvider(skuEligibleCurrencies));

  // --- 5. The stateless adapters -----------------------------------------
  // Each is immutable and holds no memo, which is what makes module scope safe
  // for it. The image and feed setting values are resolved here, once, because
  // settings resolution is this layer's responsibility - a repository that
  // resolved its own would be configuration inside business code.
  //
  // THE TWO PRODUCT-IMAGE VALUES ARE READ BACK OUT OF THE PROVIDER, NOT OFF THE
  // CONSTANTS. Both are settings-port keys - `productImageOptionCodeDelimiter`
  // [model/service/SettingService.cfc:L192] and `productImageDefaultExtension`
  // [L191] - and the legacy read for each was itself a `setting(...)` call, made
  // on the PRODUCT [model/entity/Sku.cfc:L135, L138]. Deriving them here keeps ONE
  // authority per setting: a value the domain sees can only have come through
  // `settingsProvider`. `baseImageURL` is NOT a port key - it resolves
  // `getHibachiScope().getBaseImageURL()` [model/transient/HibachiScope.cfc:L186-L188]
  // over `globalAssetsImageFolderPath` [L164], which is deliberately outside the
  // union - so it stays a constant of this layer.
  const imageSettingValues: SkuImageSettingValues = {
    baseImageURL: BASE_IMAGE_URL_DEFAULT,
    productImageOptionCodeDelimiter: settingsProvider.setting('productImageOptionCodeDelimiter'),
    productImageDefaultExtension: settingsProvider.setting('productImageDefaultExtension'),
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
    urlTitleGenerator: new SqlUrlTitleGenerator(executor),
    imageStore: new RefusingImageStore(imageSettingValues),
    imageSettingValues,
    subscriptionTermProvider: new RefusingSubscriptionTermProvider(),
    // Takes the executor and reads lazily, inside the call - the same shape as
    // `SqlUrlTitleGenerator` and `SqlOptionEntityLoader` above. Construction stays I/O-free,
    // which is what lets the completeness probe build this graph with no reachable server.
    skuFeedSettingResolver: new SqlSkuFeedSettingResolver(executor),
    optionEntityLoader: new SqlOptionEntityLoader(executor),
    feedSettingValues,
    // No constructor parameters. [integrationServices/google/Integration.cfc:L51-L53]
    // `init()` returns `this` and the component holds no state;
    // [integrationServices/google/controllers/feed.cfc:L51] `productService` is
    // the fifth dead injection and is not wired.
    //
    // ★ FROZEN FOR THE SAME REASON AS `settingsProvider` ABOVE, AND THE SAME QA FINDING (INFO-3).
    // "No state" describes the class - every one of its eight members answers with a literal - but a
    // stateless instance is still EXTENSIBLE, and this one is published on the root and survives
    // between invocations. `root.integration.getDisplayName = () => 'Spoofed'` was accepted and
    // answered `'Spoofed'` thereafter; frozen, it raises instead. The prototype methods are
    // untouched, so [integrationServices/google/Integration.cfc:L59-L61]'s preserved `'Google'` -
    // and the display-name contradiction annotated at that file - still answer exactly as before.
    integration: Object.freeze(new GoogleIntegration()),
  };

  // --- 6. Assemble and validate the COMPLETE binding graph ----------------
  // ★ NOTHING IS EXPOSED AND NOTHING IS LOGGED AS A SUCCESS UNTIL THE WHOLE GRAPH
  // HAS BEEN BUILT ONCE, IN ORDER, AND CHECKED. `createRequestGraph` constructs the
  // six repositories, the seven services and the Google feed graph in the prescribed
  // sequence, closes the three deferred bindings and asserts them closed;
  // `assertCompleteRequestGraph` then walks every binding on the assembled value.
  // Only after both pass does this initializer log a success or hand a
  // `CompositionRoot` back, so an incomplete composition surfaces HERE - once, named,
  // at initialization - rather than as an absent collaborator inside a priced order.
  //
  // ★ THE PROBE IS DISCARDED, AND DISCARDING IT IS WHAT KEEPS THE TWO TIERS HONEST.
  // Every repository, every service and the currency converter carries a memo, and
  // three of them - `nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220],
  // `roundingRuleDetails` [model/service/RoundingRuleService.cfc:L67-L77] and the ECB
  // daily-rate memo [model/service/CurrencyService.cfc:L105] - are precisely the
  // legacy component-level caches this migration re-scopes. Retaining this graph
  // would put all three back into module scope on a warm container, which is the
  // hazard tier 2 exists to remove. So it is validated and dropped, and every request
  // builds its own; what tier 1 keeps is the PROOF that building it succeeds.
  //
  // ★ IT IS FREE OF I/O, WHICH IS WHY IT CAN RUN HERE AT ALL. Every constructor in
  // the graph assigns its collaborators and returns - not one issues a statement - so
  // this pass reads no row, opens no connection and needs no reachable server. The one
  // binding that cannot be built without a request is the feed PORT, and the graph
  // publishes that as a factory for exactly this reason: its presence is checked, its
  // host is not invented.
  //
  // The empty input is the honest probe: it exercises the same defaults a request
  // carrying no clock, no account and no feed host would, and its wall-clock read,
  // account context and currency memo are discarded with it.
  //
  // ★ AND THE EMPTY ZONE INDEX IS PART OF THAT SAME HONESTY. The address-zone index is
  // the one binding of the request graph that is READ rather than constructed, so the
  // probe supplies an empty one: it proves the evaluator is WIRED without issuing the
  // statement, which is what keeps this pass free of I/O and independent of a reachable
  // server. A zone lookup against the empty index answers no locations and therefore
  // `false`, which is the same restrictive verdict a request against a database with no
  // configured zones would get - so the probe cannot be misread as having proven a match.
  assertCompleteRequestGraph(createRequestGraph(graph, {}, NO_ADDRESS_ZONE_LOCATIONS));

  // --- 7. Publish -------------------------------------------------------
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
  logger.info(
    'Composition root wired; complete request graph assembled and validated; ' +
      'sku eligible currencies resolved eagerly',
    {
      rowCount: currencyRecords.length,
      resultCount: listToArray(skuEligibleCurrencies).length,
    },
  );

  return graph;
}

/**
 * Project the live configuration onto the redacted surface a caller may see.
 *
 * ★★ EVERY MEMBER IS COPIED OUT RATHER THAN THE OBJECT BEING RE-EXPOSED, which is what makes this a
 * projection and not a rename. `database` is the output of the config's own `toJSON()`, so the three
 * never-echoed fields are already markers by the time they arrive; `tls` is rebuilt from two
 * enumerations plus a boolean, so the trust anchor's bytes are not carried at all; and neither
 * `graph.config` nor `graph.config.database` is referenced by the returned value, so there is no path
 * back to a credential through it.
 *
 * `pool`, `feed` and `currency` are handed over as they stand. Each is already a frozen shape of
 * numbers, public hostnames and public reference data, and re-copying them would suggest a redaction
 * that is not happening.
 *
 * ★ THE PROJECTION AND ITS ONE REBUILT MEMBER ARE FROZEN. `appConfig` and `config.database` are
 * frozen, so a projection of them that was not would be the one mutable step in the chain - QA
 * testing (INFO-2) found exactly that, with `root.diagnostics.database = {}` succeeding. Freezing
 * changes nothing a reader can observe and makes a write a `TypeError` rather than a silent
 * substitution of a diagnostic surface another consumer holds.
 */
function projectCompositionDiagnostics(config: AppConfig): CompositionDiagnostics {
  return Object.freeze({
    environment: config.environment,
    dialect: config.dialect,
    database: Object.freeze(config.database.toJSON()),
    pool: config.pool,
    tls: Object.freeze({
      mode: config.tls.mode,
      minimumVersion: config.tls.minimumVersion,
      certificateAuthorityConfigured: config.tls.certificateAuthority !== undefined,
    }),
    feed: config.feed,
    currency: config.currency,
  });
}

/** Wrap the tier-1 graph in the published accessor. */
async function createCompositionRoot(overrides: CompositionOverrides): Promise<CompositionRoot> {
  const graph = await createModuleScopeGraph(overrides);

  // Frozen, for the reason recorded on `projectRequestScope`: this is a published object, every
  // tier-1 object beside it is frozen, and QA testing (INFO-2) found the root and its diagnostics
  // mutable while `appConfig` and the settings table were not.
  return Object.freeze({
    // `graph.config` STAYS INSIDE THE CLOSURE. What crosses the boundary is the redacted projection,
    // so `AppConfig` - and with it the database credential - is unreachable from the returned root.
    diagnostics: projectCompositionDiagnostics(graph.config),
    dialect: graph.dialect,
    settingsProvider: graph.settingsProvider,
    integration: graph.integration,
    createRequestScope: (input?: RequestScopeInput): Promise<RequestScope> =>
      createRequestScope(graph, input ?? {}),
    createInspectableRequestScope: (input?: RequestScopeInput): Promise<InspectableRequestScope> =>
      createInspectableRequestScope(graph, input ?? {}),
  });
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
    // BEFORE anything is resolved, and SYNCHRONOUSLY, so a composition that would hold
    // two configurations at once never reaches a pool factory or a statement builder.
    assertSingleConfigurationAuthority(overrides);

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
// SECTION 7 - TIER 2: THE PER-REQUEST GRAPH
//
// Invoked once per invocation, and once more at initialization as tier 1's
// validation probe. Everything constructed here is discarded when the invocation
// ends, which is what stops a warm container from carrying one invocation's state -
// and therefore one customer's price - into another's.
//
// ★ ASSEMBLY AND PUBLICATION ARE TWO FUNCTIONS, AND THE SPLIT IS LOAD-BEARING.
// `createRequestGraph` builds the graph and returns every binding as one value;
// `createRequestScope` projects that value onto the published surface and builds
// nothing. Separating them is what lets tier 1 assemble and validate a COMPLETE graph
// before any root is exposed - the assembler is callable on its own, with no request -
// and it is why the published surface reads as a short projection instead of being
// buried in a long function's return statement.
//
// ★ THE PRESCRIBED ORDER IS THE FILE'S STRUCTURE, NOT A CLAIM ABOUT IT.
// `createRequestGraph` runs: the request instant, the two per-request adapters a
// repository consumes, the three late bindings and their delegates, then ALL SIX
// REPOSITORIES AS ONE UNINTERRUPTED GROUP, then ALL SEVEN SERVICES AS ANOTHER, then
// the two narrowed capabilities, then the Google feed graph. Nothing but a repository
// is constructed inside the repository group and nothing but a service inside the
// service group. The forced deviation is that `currencyConverter` and
// `currentAccountContext` precede the repositories: `MysqlSkuRepository` consumes
// both, and an adapter a repository depends on cannot follow it.
//
// THREE CONSTRUCTION CYCLES ARE BROKEN HERE, ALL WITHOUT A CAST, WITHOUT `any` AND
// WITHOUT A NON-NULL ASSERTION:
//
//   1. `RoundingRuleService` needs a `PromotionRepository`, and
//      `MysqlPromotionRepository` needs a rounder that `RoundingRuleService`
//      provides. Broken by a ONE-METHOD DELEGATING OBJECT over a late binding.
//   2. `MysqlProductRepository` needs the SKU repository, which needs a
//      price-group resolver, which is `PriceGroupService`, which needs the product
//      repository. Broken the same way, with a THREE-METHOD DELEGATING OBJECT.
//   3. `MysqlProductRepository` also needs the sale-price capability that
//      `PromotionService` provides, and `PromotionService` is constructed after it.
//      Broken the same way, with a ONE-METHOD DELEGATING OBJECT. This is the
//      structural replacement for `getService("promotionService")` at
//      [model/entity/Product.cfc:L519] - transformation rule T2 - and it has to
//      reach the REPOSITORY rather than only the request scope, because the
//      repository is where a `Product` is constructed and the entity takes its
//      sale-price details as a constructed-with value.
//
// All three delegates are bound before `createRequestGraph` returns, none is invoked
// during construction, and the closure of all three is ASSERTED at the end of the
// assembler rather than merely arranged - so `CompositionWiringError` is unreachable
// through any published entry point. It exists so the compiler never has to be
// silenced, and the assertion exists so a later edit that reordered a service
// construction could not make it reachable silently.
// ===========================================================================

/**
 * ONE REQUEST'S COMPLETE BINDING GRAPH, as `createRequestGraph` assembles it.
 *
 * ★ THIS TYPE EXISTS SO THAT THE GRAPH CAN BE ASSEMBLED AND VALIDATED AS ONE VALUE,
 * ONCE, BEFORE A COMPOSITION ROOT IS EXPOSED. Every binding below is a member, so
 * `assertCompleteRequestGraph` can walk the whole set and refuse an incomplete one -
 * and adding a binding to the graph without adding it here is a compile error at the
 * `return` statement, which is what keeps "complete" honest rather than aspirational.
 *
 * MODULE-LOCAL AND UN-EXPORTED, exactly like `ModuleScopeGraph`. It is an internal
 * shape of this file's wiring, and the PUBLISHED shape is {@link RequestScope}, which
 * `createRequestScope` projects from this one.
 *
 * ★ IT CARRIES NEITHER COMPLETE PRICING SERVICE, AND THAT IS DELIBERATE. The whole
 * `PriceGroupService` and the whole `PromotionService` are constructed inside
 * `createRequestGraph` and stay in its closure; what appears here is the two NARROWED
 * capabilities plus the one composed order-pricing operation. So the guarantee that
 * the pricing order cannot be inverted is not weakened by extracting the assembly -
 * there is no shape in this module, internal or published, on which either order pass
 * is a callable member.
 *
 * ★ AND IT CARRIES A FEED-PORT FACTORY RATHER THAN A FEED PORT. A `ProductFeedPort`
 * needs a validated host authority that only a request carries; a factory can be
 * validated as PRESENT without being CALLED, so tier 1 can prove the binding exists
 * without inventing a host.
 */
interface RequestGraph {
  /**
   * The one instant this request's every date comparison resolves against.
   *
   * Satisfied by an ACCESSOR over the request clock, so reading it yields a fresh `Date` carrying
   * that one instant rather than a shared mutable instance. {@link RequestScope.now} forwards this
   * member through, which is why the published surface can promise a copy per read.
   */
  readonly now: Date;

  /** The explicit T6 replacement for ambient scope, built from this request's input. */
  readonly currentAccountContext: CurrentAccountContext;

  /** Per request, because the ECB daily-rate memo must not outlive one. */
  readonly currencyConverter: CurrencyConverter;

  /** The six MySQL adapters, each satisfying its correspondingly-named port. */
  readonly productRepository: ProductRepository;
  readonly skuRepository: SkuRepository;
  readonly optionRepository: OptionRepository;
  readonly productTypeRepository: ProductTypeRepository;
  readonly promotionRepository: PromotionRepository;
  readonly priceGroupRepository: PriceGroupRepository;

  /** The five ported services published whole, plus the two published narrowed. */
  readonly roundingRuleService: RoundingRuleService;
  readonly brandService: BrandService;
  readonly optionService: OptionService;
  readonly skuService: SkuService;
  readonly productService: ProductService;

  /** `PriceGroupService` minus its order pass. See {@link PriceResolutionCapability}. */
  readonly priceResolution: PriceResolutionCapability;

  /** `PromotionService` minus its order pass. See {@link PromotionQueryCapability}. */
  readonly promotionQueries: PromotionQueryCapability;

  /** The feed query side, built unconditionally - it needs no host. */
  readonly feedRepository: GoogleFeedRepository;

  /** The feed port, deferred to the request that carries a host to validate. */
  readonly createProductFeedPort: (feedHost: string) => ProductFeedPort;

  /** The same sale-price adapter the product repository hydrates through. */
  readonly getSalePriceDetailsForProductSkus: (
    productID: string,
  ) => Promise<CfStruct<SalePriceDetail>>;

  /** The ONE route by which either order pass executes, in the mandated order. */
  readonly updateOrderAmountsWithPriceGroupsThenPromotions: (
    order: OrderView,
  ) => Promise<OrderPricingResult>;
}

/**
 * Refuse an incomplete request graph, naming the binding that is absent.
 *
 * ★ WHAT THIS CATCHES THAT THE COMPILER DOES NOT. The `return` statement in
 * `createRequestGraph` already proves every member of {@link RequestGraph} is
 * PRESENT; it cannot prove that none of them is `undefined`, because a collaborator
 * whose own type admits `undefined` - or one supplied through an override - type-checks
 * either way. Walking the assembled value closes that gap, and it closes it at
 * initialization rather than at the moment a priced order reaches a hole.
 *
 * WIDENING TO `unknown` IS WHAT MAKES THE WALK CAST-FREE. A `RequestGraph` IS a
 * `Record<keyof RequestGraph, unknown>`, so the assignment needs no assertion, and
 * `Object.entries` over it yields every own binding with its name attached.
 *
 * @throws `CompositionIncompleteError` naming the first absent binding.
 */
function assertCompleteRequestGraph(requestGraph: RequestGraph): void {
  const bindings: Readonly<Record<keyof RequestGraph, unknown>> = requestGraph;

  for (const [binding, value] of Object.entries(bindings)) {
    if (value === undefined) {
      throw new CompositionIncompleteError(binding);
    }
  }
}

/**
 * Assemble one request's binding graph. SYNCHRONOUS, AND IT ISSUES NO STATEMENT.
 *
 * @param graph - tier one's shared, stateless bindings.
 * @param input - this request's clock, account and feed host, all optional.
 * @param addressZoneLocations - THIS REQUEST'S zone-to-locations index, already read.
 *   It is a PARAMETER rather than something this function fetches for itself precisely
 *   so that this function stays synchronous and I/O-free: tier one calls it once as a
 *   completeness probe, with no request and no reachable server, and that probe must not
 *   become a database round trip. `createRequestScope` performs the read and passes the
 *   result through; the probe passes {@link NO_ADDRESS_ZONE_LOCATIONS}.
 */
function createRequestGraph(
  graph: ModuleScopeGraph,
  input: RequestScopeInput,
  addressZoneLocations: AddressZoneLocationIndex,
): RequestGraph {
  // --- The request's instant, under an explicit UTC policy ----------------
  // A `Date` IS an absolute instant - it carries no zone - so threading one and
  // comparing with it is UTC by construction, with no local-time reading
  // anywhere. Resolved ONCE here so that every date comparison inside one
  // request sees the same instant rather than a drifting clock, which is what
  // makes `PromotionPeriod.isCurrent(now)` [model/entity/PromotionPeriod.cfc:L78]
  // deterministic.
  //
  // ★ THE EPOCH IS HELD AS A NUMBER, AND EVERY EXPOSURE OF IT IS A FRESH COPY.
  // `Date` is mutable, so holding one instance and handing it out would let any
  // consumer - a handler, a repository, an entity - move the baseline every other
  // consumer compares against. A primitive cannot be mutated, so the shared
  // instant is immutable by construction rather than by convention, and
  // `requestClock.now()` is the only way to obtain it.
  const requestEpochMilliseconds = (input.now ?? new Date()).getTime();

  // ★ THE ONE CLOCK OF THIS REQUEST, AND THE ONLY CLOCK ANY PRICING PATH READS.
  // Both date-comparing adapters take it as a required constructor parameter -
  // `MysqlPromotionRepository` for the promotion-period window
  // [model/dao/PromotionDAO.cfc:L117] and the sale-price reduction [:L306], and
  // `MySqlPriceGroupRepository` for the subscription-eligibility window
  // [model/dao/PriceGroupDAO.cfc:L65,L70] - and `GoogleFeedService` closes over an
  // instant drawn from it. In the legacy every one of those was `now()` inside ONE
  // ColdFusion request and they could not disagree; each adapter reading the host
  // clock for itself reproduces the call and loses the agreement, and price groups,
  // promotions, sale prices and the feed evaluating against different instants
  // changes the amount a customer is charged.
  //
  // ★ A NON-FINITE INSTANT IS REFUSED HERE, WHICH IS THE ONLY PLACE IT CAN BE REFUSED
  // CHEAPLY. `new Date('nonsense').getTime()` is `NaN`, and QA testing followed one all
  // the way to the database: the scope was created without complaint, and
  // `MySqlPriceGroupRepository.getAccountSubscriptionPriceGroups` bound
  // `[null, 'a', null]` - because the repository's date-to-parameter conversion maps a
  // non-finite instant to `null` BEFORE binding, so `connection.ts`'s own
  // `SqlParameterError` guard (which does reject a bound invalid `Date`) never fired.
  // Both date predicates of the subscription-eligibility window
  // [model/dao/PriceGroupDAO.cfc:L65,L70] then compared against SQL NULL, which is never
  // true, and the account SILENTLY LOST ITS SUBSCRIPTION PRICE GROUP - a wrong price with
  // no error anywhere.
  //
  // A `TypeError` rather than a named domain error, matching
  // `assertSingleConfigurationAuthority` above: an invalid `Date` is a caller programming
  // error at the handler seam, not a data condition and not a configuration condition. It
  // is raised BEFORE the clock exists, so no adapter, no service and no statement is built
  // from it, and the message names the member without echoing what was passed.
  if (!Number.isFinite(requestEpochMilliseconds)) {
    throw new TypeError(
      'RequestScopeInput.now is an invalid Date: its time value is not finite. Every date-dependent ' +
        'read of a request - the promotion-period window, the sale-price reduction, the ' +
        'subscription-eligibility window and the feed build stamp - resolves to this instant, and a ' +
        'non-finite one becomes SQL NULL rather than a comparison, which silently answers "no match" ' +
        'and changes the price a customer is charged. Omit the member to use the wall clock.',
    );
  }

  // It reads no clock: it answers the instant already captured above. `PromotionPeriod`
  // hydration receives the same value through the adapter, which copies again before
  // handing it to an entity.
  //
  // ★ AND IT IS ALSO WHAT THE PUBLISHED `now` MEMBER READS, rather than a `Date` captured here
  // once. This function used to hold `const now = requestClock.now()` and hand that ONE instance to
  // the graph, which the projection then copied onto the scope - so "every exposure is a fresh copy"
  // was true of every INTERNAL consumer and false of the one EXTERNAL member. QA testing (INFO-2)
  // measured the gap: mutating the `Date` a caller had already read back from `RequestScope.now`
  // was visible on the next read of that member. Nothing downstream ever moved - the graph holds a
  // primitive and each consumer draws its own reading - but the member's own documentation promised
  // a copy, so the member now takes its reading the same way everything else does. See the accessor
  // on the returned graph below and {@link RequestScope.now}.
  const requestClock = {
    now: (): Date => new Date(requestEpochMilliseconds),
  };

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
  //
  // ★ FROZEN, FOR CONSISTENCY WITH EVERY OTHER PUBLISHED OBJECT IN THIS FILE. `appConfig`,
  // `config.database`, the settings table, the pool executor and `UNATTRIBUTED_AUDIT_ACTOR`
  // are all `Object.freeze`d, and QA testing (INFO-2) recorded that the request tier was
  // not: `scope.currentAccountContext.accountID = 'HACK'` succeeded, with the compile-time
  // `readonly` as the only boundary. There is no isolation impact - every request gets its
  // own context and no in-repo mutator exists - but freezing makes the two halves of one
  // rule agree and turns a silent write into a `TypeError`.
  const currentAccountContext: CurrentAccountContext = Object.freeze(
    input.accountID === undefined ? {} : { accountID: input.accountID },
  );

  // --- The audit actor, per request (T6 applied to the last holdout) -------
  // S-07. `HibachiEntity` stamped both account columns from ambient scope
  // [org/Hibachi/HibachiEntity.cfc:L628-L630, L632-L635] and the port read them
  // off the caller's entity instead, which let a request body choose a row's
  // recorded authorship. Both halves now travel this one value.
  //
  // TWO TYPES, NOT ONE WIDENED. `CurrentAccountContext` above answers "whose
  // prices", carries one opaque identifier and explicitly refuses permission
  // members; the audit gate needs a permission - the admin flag. Widening it
  // would breach a contract that names the refusal, so `AuditActorContext` is
  // separate and `adminAccountFlag` is REQUIRED on it, so that no construction
  // site can omit the flag and stamp by accident.
  //
  // THE FLAG IS NOT INVENTED HERE. See `RequestScopeInput.adminAccountFlag`:
  // `getAdminAccountFlag()` belongs to the out-of-scope `Account` entity, so this
  // tier cannot evaluate it and does not pretend to. Absent means `false`, and
  // `false` stamps nothing.
  const auditActor: AuditActorContext = {
    ...(input.accountID === undefined ? {} : { accountID: input.accountID }),
    adminAccountFlag: input.adminAccountFlag ?? false,
  };

  // --- The currency converter, per request --------------------------------
  // Its own contract: an instance is safe to share within one request and must
  // NOT be cached across requests. The ECB daily-rate memo
  // [model/service/CurrencyService.cfc:L105] therefore cannot outlive a request
  // either, which is the fourth of the four legacy memo families this tier
  // re-scopes.
  // The third argument is finding S-20's observability half: a conversion that could
  // not be performed still returns the amount unchanged - that value is must-preserve
  // - but it no longer does so silently. Only the two currency CODES are published,
  // never the amount, because the amount is a customer's price and the codes are what
  // an operator needs to see.
  const currencyConverter: CurrencyConverter = new EuropeanCentralBankCurrencyConverter(
    graph.currencyRecords,
    graph.europeanCentralBankRates,
    (originalCurrencyCode: string, convertToCurrencyCode: string): void => {
      logger.warn('Currency conversion passed through unconverted; no reachable rate', {
        originalCurrencyCode,
        convertToCurrencyCode,
      });
    },
  );

  // --- THE THREE LATE BINDINGS AND THEIR DELEGATES ------------------------
  // ★ DECLARED AS ONE CONTIGUOUS BLOCK, AHEAD OF EVERY CONSTRUCTION, so that the
  // two groups that follow are each uninterrupted: all six repositories, then all
  // seven services. An earlier revision declared each cycle immediately before the
  // construction it unblocked, which meant a SERVICE was built in the middle of the
  // repository group and the prescribed order could not be read off the file. The
  // delegates cost nothing to hoist - none is invoked during construction - so the
  // ordering is now the file's structure rather than a claim about it.
  //
  // Each initializer is spelled out rather than left implicit: the whole point of
  // these variables is that they are UNBOUND for a stretch and bound thereafter,
  // and writing the first state down is what makes the sequence legible.

  // Cycle 1: rounding service <-> promotion repository.
  let roundingRuleServiceBinding: RoundingRuleService | undefined = undefined;

  // ONE METHOD, which is the whole of what both `mysqlPromotionRepository.ts` and
  // `mysqlPriceGroupRepository.ts` ask for. The delegate forwards; it decides
  // nothing, and it must not, because the rounding algorithm is decimal-STRING
  // manipulation whose behaviour is pinned by characterisation tests.
  //
  // ★ BOTH ADAPTERS NOW RECEIVE THIS SAME DELEGATE, WHERE THE PRICE-GROUP ONE USED
  // TO RECEIVE THE CONCRETE SERVICE. The old arrangement is what forced
  // `RoundingRuleService` to be constructed ahead of the repositories, since a
  // repository consumed it; routing both through the delegate removes that
  // constraint without weakening anything - the contract is one method, the
  // forwarding is verbatim, and the two adapters are now symmetric rather than
  // gratuitously different.
  const valueRounder = {
    roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
      if (roundingRuleServiceBinding === undefined) {
        throw new CompositionWiringError('roundingRuleService');
      }

      return roundingRuleServiceBinding.roundValueByRoundingRule(value, rule);
    },
  };

  // Cycle 2: product repository <-> SKU repository <-> price groups.
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

  // Cycle 3: product repository <-> promotion service.
  let promotionServiceBinding: PromotionService | undefined = undefined;

  /**
   * The sale-price capability `MysqlProductRepository` consults before it constructs
   * a `Product`, satisfied by adapting the ported `src/services/promotionService.ts`
   * surface - transformation rule T2, replacing the `getService("promotionService")`
   * locator at [model/entity/Product.cfc:L519].
   *
   * ★ IT GOES INTO THE REPOSITORY, NOT ONLY ONTO `RequestScope`, AND THAT IS THE
   * WHOLE POINT. `src/domain/entities/product.ts` takes `salePriceDetailsForSkus` as
   * an ALREADY-RESOLVED map rather than as a resolver, so the only moment at which a
   * hydrated product can acquire it is before its constructor runs - and the only
   * place that moment exists is the adapter that builds it from rows. A capability
   * published on the request scope alone would be reachable by a handler and unreachable
   * by the entity, which is exactly a detached helper: correct in isolation and
   * incapable of hydrating anything.
   *
   * ONE METHOD, forwarding verbatim and deciding nothing. `Record<string, T>` and
   * `CfStruct<T>` are the same structural type, so the ported service's return
   * satisfies the repository's module-local contract with no adaptation of the value.
   *
   * ★ IT IS ALSO THE SATISFACTION POINT FOR THE EXPORTED PORT, AND IS ANNOTATED SO THE
   * COMPILER SAYS SO. `SalePriceResolver` is the SECOND interface exported by
   * ../domain/ports/promotionRepository.js, and it is the one interface in that folder with
   * NO adapter file anywhere in the locked layout: its own documentation states that it "is
   * satisfied in `src/handlers/bootstrap.ts` by adapting the ported
   * `src/services/promotionService.ts` surface ... and it is injected into the `Product`
   * entity from there". This object is that whole adapter. Naming the type here is what makes
   * that sentence a fact `tsc` checks rather than a claim a reader has to trust, and it is why
   * the same object serves three consumers without a second one being built: the product
   * adapter's hydration collaborator, the `Product` entity's own injected port, and the
   * `SalePriceResolver` member `RequestScope` inherits.
   *
   * WHY THE BINDING RATHER THAN THE SERVICE. `promotionService` is constructed BELOW the
   * repository block because it needs `roundingRuleService`, which needs
   * `promotionRepository`; `productRepository` has to exist above that point because
   * `ProductService` takes it. Reading the late binding inside the method body - and refusing
   * with a NAMED `CompositionWiringError` if it is somehow still unset - is what lets ONE
   * service instance serve every consumer without depending on temporal-dead-zone behaviour
   * for the diagnosis. The binding is also one of the three the assertion loop below proves
   * closed before any root is exposed.
   */
  const salePriceResolver: SalePriceResolver = {
    getSalePriceDetailsForProductSkus(productID: string): Promise<CfStruct<SalePriceDetail>> {
      if (promotionServiceBinding === undefined) {
        throw new CompositionWiringError('promotionService');
      }

      return promotionServiceBinding.getSalePriceDetailsForProductSkus(productID);
    },
  };

  // --- THE SIX MYSQL REPOSITORIES, AS ONE UNINTERRUPTED GROUP -------------
  // Each receives the narrow executor as a constructor parameter and satisfies its
  // correspondingly-named port. The four that WRITE receive the SAME `auditActor`, as
  // their second parameter uniformly (S-07); the two that declare a one-method rounder
  // receive the SAME `valueRounder` delegate; and the two that compare dates receive
  // the SAME `requestClock`. Note that `MySqlPriceGroupRepository` spells its class
  // name with a capital S, which is the shipped name and is used verbatim rather than
  // "corrected".
  //
  // NOTHING BUT A REPOSITORY IS CONSTRUCTED BETWEEN HERE AND THE SERVICES BLOCK.
  // That is the prescribed order made structural: a reader checking it does not have
  // to trace which construction unblocked which, because the three delegates above
  // already unblocked all of them. It is also why the two rounding consumers take the
  // `valueRounder` DELEGATE rather than `roundingRuleService` itself - the service is
  // constructed in the services block below, after every repository.
  // NO `auditActor` HERE, AND THE ASYMMETRY IS DELIBERATE. `PromotionRepository` is locked
  // at SEVEN methods, every one of them a read, so this adapter issues no INSERT, no UPDATE
  // and no DELETE and has no write path for an actor to stamp. S-07 is unaffected: the four
  // adapters that DO write are the four that receive it, immediately below. See the
  // constructor doc on `MysqlPromotionRepository` for the withdrawn parameter.
  const promotionRepository: PromotionRepository = new MysqlPromotionRepository(
    graph.executor,
    valueRounder,
    requestClock,
  );

  // Held at its CONCRETE type as well, for the same reason `MysqlSkuRepository` is
  // below: one instance fills two roles. The `PriceGroupRepository` port is what
  // `PriceGroupService` and `RequestScope` consume, and the module-local
  // {@link PriceGroupSetLoader} - the set-based by-key read, which is deliberately
  // NOT a seventh port member - is what `SqlPriceGroupFrameworkReads` and
  // `projectPriceGroupIntents` consume. Narrowing first and widening back would
  // need a cast; keeping the concrete type needs none.
  const mysqlPriceGroupRepository = new MySqlPriceGroupRepository(
    graph.executor,
    auditActor,
    valueRounder,
    requestClock,
  );
  const priceGroupRepository: PriceGroupRepository = mysqlPriceGroupRepository;

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
  const mysqlSkuRepository = new MysqlSkuRepository(graph.executor, auditActor, {
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
    auditActor,
  );

  // The third argument is the `ProductSkuCascadeWriter` that reproduces
  // `cascade="all-delete-orphan"` on `Product.skus` [model/entity/Product.cfc:L73].
  // `MysqlSkuRepository.saveSku` satisfies it through its optional `productID` and
  // `executor` parameters, and the composition root
  // supplies THE SAME instance the collaborators bag carries, so one SKU adapter
  // serves both roles within a request and a cascaded write cannot diverge from a
  // direct one.
  //
  // `salePriceResolver` is the fifth collaborator, and it discharges the reach at
  // [model/entity/Product.cfc:L519] that the entity used to make through
  // `getService("promotionService")`. Every product this adapter hydrates carries it,
  // so `Product.getSalePriceDetailsForSkus()` resolves through the port on first use
  // rather than refusing.
  const productRepository: ProductRepository = new MysqlProductRepository(
    graph.executor,
    auditActor,
    {
      settingsProvider: graph.settingsProvider,
      skuRepository: mysqlSkuRepository,
      optionRepository,
      subscriptionTermProvider: graph.subscriptionTermProvider,
      salePriceResolver,
    },
    mysqlSkuRepository,
  );

  // --- THE SEVEN SERVICES, AS ONE UNINTERRUPTED GROUP ---------------------
  // In dependency order, and every one of them after every repository. Each of the
  // three late bindings above is closed inside this block, the moment the service it
  // names exists.
  //
  // The two `Sql*FrameworkReads` collaborators are constructed INLINE, as arguments to
  // the single service that declares each. They are that service's own framework-read
  // dependency rather than members of either group, so spelling them as separate
  // statements would put a non-service construction inside this block for no gain.
  //
  // The rounding-rule query is hosted on `promotionRepository` as
  // `getRoundingRuleQuery` (legacy `model/dao/RoundingRuleDAO.cfc:L51`), so there is
  // NO fourteenth `roundingRuleRepository` port. Its `roundingRuleDetails` memo
  // [model/service/RoundingRuleService.cfc:L67-L77] is an instance field, which is
  // precisely why this service is per request.
  //
  // ★ THE SECOND ARGUMENT IS THE DURABLE HALF OF `super.save`, and it is what makes
  // `saveRoundingRule` a save. `promotionRepository` carries the rounding-rule READ and
  // nothing more - the port is specified as seven reads [AAP 0.4.1] - so the write cannot
  // live there, and the port set is closed at thirteen so it cannot become a fourteenth
  // port either. It is therefore a MODULE-LOCAL STRUCTURAL COLLABORATOR over this
  // request's executor, constructed inline exactly as the two `Sql*FrameworkReads`
  // collaborators are, and satisfying the `RoundingRuleFrameworkWrites` contract the
  // SERVICE declares.
  //
  // It receives `valueRounder`, not `roundingRuleService`: the writer reconstructs the
  // persisted rule, and a `RoundingRule` needs a rounding delegate. Passing the delegate
  // rather than the service keeps the same one-method contract the two repositories get,
  // and the forward is lazy - resolved when a save actually happens, by which point the
  // binding two statements below is closed.
  const roundingRuleService = new RoundingRuleService(
    promotionRepository,
    new SqlRoundingRuleFrameworkWrites(graph.executor, auditActor, valueRounder),
  );

  roundingRuleServiceBinding = roundingRuleService;

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
    new SqlPriceGroupFrameworkReads(graph.executor, mysqlPriceGroupRepository),
  );

  priceGroupServiceBinding = priceGroupService;

  // Its ONLY collaborator [model/service/BrandService.cfc:L51] `dataService`,
  // which is BrandService's entire dependency surface.
  //
  // ★ THE SECOND ARGUMENT IS NOT A SECOND COLLABORATOR IN THE LEGACY SENSE - it is the
  // durable half of the `super.save` [model/service/BrandService.cfc:L77] that the legacy
  // component inherited rather than declared. `dataService` really is the only thing
  // `BrandService.cfc` injects; `super.save` came from the framework base
  // [org/Hibachi/HibachiService.cfc:L133-L169]. With that base deliberately unported
  // [AAP 0.5.3], its persistence half has to arrive from somewhere, and the composition
  // root is where the AAP puts every replaced framework responsibility. Before this
  // argument existed the service's only operation resolved a URL title and then always
  // threw, so the published capability could never succeed.
  const brandService = new BrandService(
    graph.urlTitleGenerator,
    new SqlBrandFrameworkWrites(graph.executor, auditActor),
  );

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
  //
  // ★ THE ZONE EVALUATOR IS CONSTRUCTED HERE, PER REQUEST, AND NO LONGER AT MODULE SCOPE.
  // It closes over THIS request's zone-to-locations index, so it is tier-2 state and
  // sharing one instance across warm invocations would let an administrator's removed
  // zone location keep applying a shipping promotion. Section 4.2 records why the index
  // exists at all: every in-scope caller publishes zone IDs and no locations, so an
  // evaluator with nothing to resolve against answers `false` for every configured zone.
  const promotionService = new PromotionService(
    promotionRepository,
    new CfmlAddressZoneEvaluator(addressZoneLocations),
    roundingRuleService,
    new SqlPromotionFrameworkReads(graph.executor),
  );

  // Cycle 3 closed. The product adapter has held `salePriceResolver` since its own
  // construction and calls nothing during it, so the first invocation of that
  // delegate cannot precede this line.
  promotionServiceBinding = promotionService;

  // --- The two narrowed pricing capabilities ------------------------------
  // ★ THIS IS WHERE THE ORDERING OBLIGATION STOPS BEING A CONVENTION. Both complete
  // services stay in the two locals above; what LEAVES this factory is the same two
  // instances NARROWED to the capability types, and neither capability has a name for
  // an order pass. `'updateOrderAmountsWithPriceGroups'` is not a member a caller can
  // write, so the sequence cannot be inverted by any code that compiles.
  //
  // ★ A TYPE NARROWING, AND DELIBERATELY NOT A FORWARDING OBJECT - THE ONE HONEST
  // LIMIT, STATED. An alternative resolution built two hand-written objects forwarding
  // twelve and eleven members, which would additionally have made the withheld members
  // absent AT RUNTIME. It was rejected for three reasons and the trade is recorded
  // rather than glossed: twenty-three forwarding members must be kept in step with two
  // services by hand; the published capability would no longer BE the instance the
  // composed operation runs, so no suite could observe either pass through the surface
  // that publishes it - which is exactly what `tests/unit/handlers/bootstrap.test.ts`
  // does when it substitutes a pass to prove the two run in the mandated order; and the
  // runtime absence closed no finding the type does not already close. The guarantee is
  // therefore a COMPILE-TIME one: a caller determined to defeat it could assert its way
  // back to the full class, which is a deliberate act with a visible cast rather than
  // the accidental bypass the finding described.
  //
  // The annotations are what enforce completeness: `Omit` leaves every surviving member
  // REQUIRED, so a service member renamed or dropped fails to compile here.
  const priceResolution: PriceResolutionCapability = priceGroupService;
  const promotionQueries: PromotionQueryCapability = promotionService;

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
  // `assertAllowedFeedHost` normalizes the candidate and then checks its MEMBERSHIP
  // of the allow-list, throwing `UntrustedFeedHostError` otherwise. An EMPTY
  // allow-list refuses everything, which is the safe failure and not a bypass.
  //
  // ★ MEMBERSHIP ONLY - THE HOST GRAMMAR IS NOT CHECKED HERE AND MUST NOT BE ADDED.
  // A completeness review removed a duplicated host grammar from
  // `../integrations/google/googleFeedService.js` on the ground that
  // `./rssFeedRenderer.js` already owns it - the same character class and the same
  // 259-character bound - and refuses a malformed origin before it composes one.
  // Re-creating that grammar in this file would recreate exactly the duplication that
  // was removed. It is not needed: a candidate that is not a bare authority cannot
  // equal an allow-list entry that is one, so `https://host/feed` is refused by the
  // membership check, and a malformed entry that somehow matched would still be
  // refused by the renderer.
  //
  // ★ THE ALLOW-LIST IS READ FROM PROCESS CONFIGURATION, NEVER FROM `input`.
  // This is the enforcement half of finding S-15's resolution; the type half is
  // on `RequestScopeInput.feedHost`, which carries a bare candidate string.
  // `graph.config` was resolved once at module scope from the process environment
  // and is frozen, so a request cannot reach it, widen it or reorder it. A
  // deployment that configured no `FEED_ALLOWED_HOSTS` has an empty list here and
  // therefore publishes no feed at all, whatever candidate a caller sends.
  //
  // ★ A FACTORY, NOT AN INSTANCE, AND THAT IS WHAT MAKES THE FEED BINDING
  // VALIDATABLE WITHOUT INVENTING A HOST. Every other binding in this graph can be
  // constructed from the module-scope graph alone, so tier 1 can assemble the whole
  // thing and check it; this one needs a host CANDIDATE that only a request carries,
  // and there is no default to fall back on - a hard-coded host would be exactly the
  // configuration-in-code this root forbids. Publishing the CAPABILITY TO BUILD it
  // rather than the built instance means the validation pass can confirm the binding
  // EXISTS without CALLING it, and a request that carries no feed host still gets no
  // feed port. `toTrustedFeedHost` therefore runs once per feed request, on that
  // request's own candidate and against the configured allow-list, exactly as before.
  //
  // The host reaching the service is the NORMALIZED one - trimmed and case-folded by the
  // check above - and the service then forwards it to the renderer byte for byte, which
  // is that module's own documented contract.
  const createProductFeedPort = (feedHost: string): ProductFeedPort =>
    new GoogleFeedService(
      feedRepository,
      assertAllowedFeedHost(feedHost, graph.config.feed.allowedHosts),
      // ★ NO SCHEME IS PASSED, AND THERE IS NO THIRD ARGUMENT BETWEEN THE HOST AND THE
      // CLOCK. Only the ALLOW-LIST for the origin's AUTHORITY is process configuration
      // (S-15). The SCHEME is not configuration at all: it is the frozen legacy `http://`
      // literal inside `../integrations/google/rssFeedRenderer.js`. An intervening
      // revision passed `graph.config.feed.scheme` here, accepting finding S-09; both
      // that argument and the config member it read are removed, because AAP 0.1.1 and
      // 0.8.1 freeze the product-feed contract and AAP 0.6.7 admits no fourth divergence.
      // A deployment needing HTTPS feed URLs terminates TLS in front of this service.
      //
      // A FRESH COPY of the request epoch, drawn the same way `RequestScope.now` draws its own: the
      // service closes over what it is handed, so sharing one mutable `Date` with any other consumer
      // would let whoever mutated it move the feed's `<lastBuildDate>` and every generated-at stamp
      // with it. Since no consumer shares an instance, no consumer can move another's baseline.
      requestClock.now(),
    );

  // --- THE THREE LATE BINDINGS, ASSERTED CLOSED ---------------------------
  // ★ THE ONE WIRING DEFECT THE COMPILER CANNOT CATCH, CHECKED RATHER THAN TRUSTED.
  // Each of the three is assigned by an unconditional straight-line statement above,
  // so a reader can see that all three are closed; what a reader cannot see is a
  // FUTURE edit that moves a service construction below a delegate's first use. Each
  // binding is read through a nullary reader so the check observes the variable's
  // DECLARED type rather than the assignment-narrowed one, which is what lets this be
  // written without a cast and without a non-null assertion.
  const lateBindings: Readonly<Record<string, () => unknown>> = {
    roundingRuleService: () => roundingRuleServiceBinding,
    priceGroupService: () => priceGroupServiceBinding,
    promotionService: () => promotionServiceBinding,
  };

  for (const [collaborator, readBinding] of Object.entries(lateBindings)) {
    if (readBinding() === undefined) {
      throw new CompositionWiringError(collaborator);
    }
  }

  return {
    // AN ACCESSOR, SO THE MEMBER IS A READING RATHER THAN A HELD INSTANCE. It satisfies
    // `readonly now: Date` exactly as a data property did - same name, same type, and still an own
    // enumerable key, so `assertCompleteRequestGraph` walks it and the published key set is
    // unchanged - while making every read a fresh `Date`. That is what lets the projection forward
    // it without re-copying and what closes the one exposure that outlived a read (INFO-2).
    get now(): Date {
      return requestClock.now();
    },
    currentAccountContext,
    currencyConverter,
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
    // THE NARROWED CAPABILITIES, AND NOT THE SERVICES - not even onto this
    // module-local shape. Neither this shape nor the published one declares an order
    // pass, so no member of either can be called in the wrong order; the composing
    // member below is the only one that names them, and it fixes their sequence.
    priceResolution,
    promotionQueries,
    feedRepository,
    createProductFeedPort,
    // The `SalePriceResolver` member `RequestScope` INHERITS, satisfied here. THE SAME
    // ADAPTER THE PRODUCT REPOSITORY HOLDS, not a second one built over the same
    // service, so a caller reaching it off the scope and a `Product` reaching it through
    // its injected port land on one implementation and cannot disagree - the capability a
    // handler reaches and the capability a hydration reaches cannot drift apart. The
    // forward is written as an arrow rather than as a detached member reference because a
    // detached one is what `@typescript-eslint/unbound-method` exists to reject.
    getSalePriceDetailsForProductSkus: (productID) =>
      salePriceResolver.getSalePriceDetailsForProductSkus(productID),
    updateOrderAmountsWithPriceGroupsThenPromotions: (order) =>
      updateOrderAmountsWithPriceGroupsThenPromotions(
        priceGroupService,
        promotionService,
        mysqlPriceGroupRepository,
        order,
      ),
  };
}

/**
 * Project one assembled request graph onto the PUBLISHED request scope.
 *
 * ★ ASSEMBLY AND PUBLICATION ARE TWO STEPS ON PURPOSE. `createRequestGraph` builds
 * the graph and knows nothing about what is published; this function publishes and
 * builds nothing. That separation is what allows tier 1 to assemble and validate a
 * complete graph before any root is exposed - the assembler is callable on its own -
 * and it is why the published surface is a short, readable projection rather than a
 * 500-line function's return statement.
 *
 * THE TWO PRICING MEMBERS KEEP THEIR NAMES AND CHANGE THEIR TYPES. `priceGroupService`
 * and `promotionService` carry the two NARROWED capabilities, so the names a handler
 * already reads by are preserved while the two order passes are unreachable through
 * them; see {@link PriceResolutionCapability} and {@link PromotionQueryCapability}.
 *
 * THE FEED PORT IS BUILT HERE, AND ONLY WHEN A HOST WAS SUPPLIED. That is the one
 * binding the graph publishes as a factory, so the decision "was a feed host carried
 * by this request?" lives at the boundary that reads the request - and a request
 * without one gets `undefined`, exactly as before.
 *
 * ★★ IT IS ASYNCHRONOUS, AND THE ONE READ IT PERFORMS IS WHY. This function used to be
 * synchronous, on the reading that "every read it needs was already performed once at
 * tier one". One is not: the address-zone locations the promotion engine restricts
 * discounts by are per-request state that tier one may not hold, and the port that
 * consumes them is SYNCHRONOUS by contract - so the read cannot happen inside the
 * predicate and cannot happen at module scope either. It happens here, once, before the
 * graph is assembled, which is the only remaining place it can. Section 4.2 carries the
 * full argument.
 *
 * ★ TWO CONSEQUENCES, BOTH RECORDED RATHER THAN GLOSSED. Opening a scope now issues
 * exactly ONE statement of its own, where it previously issued none - so the tier-1 /
 * tier-2 split is now "tier one is shared and read once; tier two is per request and
 * reads once" rather than "tier two reads nothing". And this function's refusals - the
 * feed-host allow-list check inside `createProductFeedPort` among them - are now REJECTED
 * promises rather than synchronous throws. The refusal itself is unchanged: no
 * `ProductFeedPort` is constructed for an unlisted host and no feed statement is issued.
 */
async function createRequestScope(
  graph: ModuleScopeGraph,
  input: RequestScopeInput,
): Promise<RequestScope> {
  // BEFORE the graph is assembled, because `CfmlAddressZoneEvaluator` takes the index as
  // a constructor argument and `PromotionService` takes the evaluator as one. There is no
  // later point at which it could be supplied without making the evaluator mutable, and a
  // mutable evaluator is exactly the cross-consultation instability the index type's own
  // note refuses.
  return projectRequestScope(await assembleRequestGraph(graph, input), input);
}

/**
 * Open one request's scope and hand back the adapters it was assembled with.
 *
 * The refusal semantics are the `createRequestScope` ones unchanged, because the refusal lives in
 * `createProductFeedPort` and this route reaches it through the same projection: an unlisted feed
 * host rejects with `UntrustedFeedHostError`, no port is constructed and no feed statement is
 * issued. See {@link CompositionRoot.createInspectableRequestScope}.
 */
async function createInspectableRequestScope(
  graph: ModuleScopeGraph,
  input: RequestScopeInput,
): Promise<InspectableRequestScope> {
  const requestGraph = await assembleRequestGraph(graph, input);

  // Frozen at both levels, for the reason recorded on `projectRequestScope`: the two halves are
  // published objects and every other published object in this file is frozen.
  return Object.freeze({
    scope: projectRequestScope(requestGraph, input),
    // Copied out member by member rather than spread from the graph, so that a member added to
    // `RequestGraph` later cannot arrive on this surface without someone deciding it should.
    adapters: Object.freeze({
      productRepository: requestGraph.productRepository,
      skuRepository: requestGraph.skuRepository,
      optionRepository: requestGraph.optionRepository,
      productTypeRepository: requestGraph.productTypeRepository,
      promotionRepository: requestGraph.promotionRepository,
      priceGroupRepository: requestGraph.priceGroupRepository,
    }),
  });
}

/**
 * Assemble one request's graph, performing the one read that has to precede assembly.
 *
 * EXTRACTED SO THAT THE TWO PUBLISHED ROUTES SHARE EXACTLY ONE ASSEMBLY PATH.
 * `createRequestScope` projects the request-tier surface from it and
 * `createInspectableRequestScope` projects that same surface plus the adapters. Neither can drift
 * from the other, and neither can quietly build a second graph - which is the failure mode
 * {@link CompositionRoot.createInspectableRequestScope} exists to rule out.
 *
 * `createRequestGraph` itself stays SYNCHRONOUS and I/O-FREE. The await belongs here, above it,
 * for the reason recorded on `createRequestScope`: `CfmlAddressZoneEvaluator` takes the index as a
 * constructor argument and the port it satisfies is synchronous by contract.
 */
async function assembleRequestGraph(
  graph: ModuleScopeGraph,
  input: RequestScopeInput,
): Promise<RequestGraph> {
  const addressZoneLocations = await readAddressZoneLocationIndex(graph.executor);

  return createRequestGraph(graph, input, addressZoneLocations);
}

/**
 * Project the request-tier surface from an assembled graph.
 *
 * ★ THE SIX REPOSITORY LINES THAT USED TO SIT BETWEEN `currentAccountContext` AND
 * `roundingRuleService` ARE GONE FROM THIS PROJECTION, which is the other half of withdrawing them
 * from {@link RequestScope}: the type stopped declaring them and this function stopped copying
 * them out. They remain on the graph, where the services that need them already hold them.
 */
function projectRequestScope(requestGraph: RequestGraph, input: RequestScopeInput): RequestScope {
  // ★ FROZEN, for the reason recorded on `currentAccountContext` in `createRequestGraph`: every
  // tier-1 object this file publishes is frozen, QA testing (INFO-2) found the request tier mutable,
  // and the compile-time `readonly` erases at emit. Freezing is shallow by design - the members are
  // services and adapters whose own state is theirs to manage - so what this closes is the
  // substitution of a whole member on a scope another consumer holds.
  return Object.freeze({
    // FORWARDED AS AN ACCESSOR, because the graph's own member is one: copying the value here would
    // put the held instance straight back onto the published surface, which is the arrangement
    // INFO-2 found. Reading through keeps the promise the member's docblock makes - one instant per
    // request, a fresh `Date` per read - and `Object.freeze` leaves an accessor readable while
    // refusing any attempt to replace it.
    get now(): Date {
      return requestGraph.now;
    },
    currentAccountContext: requestGraph.currentAccountContext,
    roundingRuleService: requestGraph.roundingRuleService,
    brandService: requestGraph.brandService,
    optionService: requestGraph.optionService,
    skuService: requestGraph.skuService,
    productService: requestGraph.productService,
    priceGroupService: requestGraph.priceResolution,
    promotionService: requestGraph.promotionQueries,
    currencyConverter: requestGraph.currencyConverter,
    productFeedPort:
      input.feedHost === undefined ? undefined : requestGraph.createProductFeedPort(input.feedHost),
    getSalePriceDetailsForProductSkus: requestGraph.getSalePriceDetailsForProductSkus,
    updateOrderAmountsWithPriceGroupsThenPromotions:
      requestGraph.updateOrderAmountsWithPriceGroupsThenPromotions,
  });
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
  //
  // ★★ ONE STATEMENT FOR THE WHOLE LIST, AND THE ORDER IS REBUILT HERE. The
  // de-duplicated identifiers are collected first, loaded together, then walked in
  // their original first-appearance order to build `resolvedOptions`. Order matters
  // to no consumer - `resolveOptionByID` matches by identifier - but rebuilding it
  // costs nothing and keeps this array byte-identical to what the per-identifier
  // loop produced, so the substitution is observably inert.
  //
  // ★ QUOTE-THEN-REVISE ON THE LOOP THIS REPLACES. The superseded body awaited
  // `optionLoader.getOption(optionID)` inside the de-duplication loop, one round
  // trip per distinct option, with each answer only pushed into an array. Nothing
  // there depended on an earlier result, so the serialization was accidental rather
  // than required - and the list is as long as the product has option groups,
  // because `SkuService.createSkus` fans it out into a cartesian product
  // [model/service/SkuService.cfc:L109-L121].
  const resolvedOptions: Option[] = [];

  if (optionIDList !== undefined && optionIDList.length > 0) {
    const requestedOptionIDs: string[] = [];
    const seenOptionIDs = new Set<string>();

    for (const optionID of listToArray(optionIDList)) {
      const foldedOptionID = foldIdentifier(optionID);

      if (seenOptionIDs.has(foldedOptionID)) {
        continue;
      }

      seenOptionIDs.add(foldedOptionID);
      requestedOptionIDs.push(optionID);
    }

    const optionsByFoldedID = await optionLoader.getOptionsByID(requestedOptionIDs);

    for (const optionID of requestedOptionIDs) {
      const option = optionsByFoldedID.get(foldIdentifier(optionID));

      // ABSENT STAYS ABSENT. `SkuService.resolveOptionByID` is the thing that raises
      // for an identifier the payload named and the schema does not carry, at the
      // exact legacy locator; skipping here is what lets it.
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
// ★ AND THE COMPOSED OPERATION IS THE ONLY ROUTE, WHICH IS WHAT MAKES THE CLAIM
// ABOVE UNCONDITIONAL. This function takes the COMPLETE services, and it is the
// only thing in the module that does: `createRequestGraph` keeps both complete
// instances in its closure and returns {@link PriceResolutionCapability} and
// {@link PromotionQueryCapability} in their place, each carrying every resolution,
// query and write member and neither carrying an order pass. So there is no second
// route by which either pass executes - not a discouraged one, not a documented-as-
// a-defect one, none. An earlier revision published the services whole and recorded
// the resulting hazard in prose on `RequestScope`; the record of that revision is
// kept there rather than deleted, because a reader deserves to know the guarantee
// was strengthened rather than always held.
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
  priceGroupSetLoader: PriceGroupSetLoader,
  order: OrderView,
): Promise<OrderPricingResult> {
  // PASS ONE. Emits intents rather than mutating an order aggregate, because the
  // order aggregate is out of scope - that inversion IS the anti-corruption seam.
  const priceGroupIntents = await priceGroupService.updateOrderAmountsWithPriceGroups(order);

  // The projection step that stands in for the legacy L370/L371 in-place writes.
  // Without it, pass two would read the pre-pass-one order and the L241
  // discriminator would take the wrong arm.
  const pricedOrder = await projectPriceGroupIntents(order, priceGroupIntents, priceGroupSetLoader);

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
 *   - `totalSaleQuantity` and `promotionCodeList`. Pass one changes an item's PRICE
 *     [model/service/PriceGroupService.cfc:L370] and nothing else, so a quantity
 *     count [model/entity/Order.cfc:L624-L631] and a promotion-code list are
 *     identical before and after it. Restating either would be busywork at best.
 *   - `fulfillmentChargeAfterDiscountTotal`. Pass one touches no fulfillment charge
 *     and no fulfillment promotion, so this member is likewise unchanged by it. It
 *     is also no longer read by pass two: `updateOrderAmountsWithPromotions` derives
 *     the order-level base from the fulfillment charges and the discounts ITS OWN
 *     pass-one arm applied, because [model/service/PromotionService.cfc:L417] reads
 *     that total AFTER the fulfillment arm has written to the live graph. See the
 *     note on `applyOrderReward` in `../services/promotionService.ts`.
 *
 * ★ WHAT IS RECOMPUTED, AND WHY LEAVING IT ALONE WAS WRONG.
 * `subtotal` IS a function of the prices pass one just rewrote. On the live graph it
 * is derived on demand - [model/entity/Order.cfc:L686-L699] sums each item's
 * `getExtendedPrice()`, signed by order-item type - so a `setPrice` at [L370]
 * necessarily changes what the next reader sees. Pass two has such a reader: the
 * qualifier gates at [model/service/PromotionService.cfc:L648, L650] test
 * `order.getSubtotal()` against a promotion qualifier's minimum and maximum, INSIDE
 * the promotion pass. Handing on the caller's pre-pass-one snapshot let a
 * price-group discount that should have dropped an order below a qualifier floor
 * leave that qualifier satisfied anyway - a promotion applied on a subtotal the
 * customer is not paying.
 *
 * `subtotalAfterItemDiscounts` is re-based rather than recomputed from scratch. Its
 * subtrahend, `getItemDiscountAmountTotal()` [model/entity/Order.cfc:L317-L330], is
 * the sum of the items' PERSISTED applied promotions, which the order-item view
 * deliberately does not carry - so it is recovered from the consistent pair the
 * caller supplied (`subtotal - subtotalAfterItemDiscounts`) and re-applied to the new
 * subtotal. That subtrahend is untouched by pass one, so the re-basing is exact
 * rather than an approximation, and it invents no aggregation this boundary does not
 * already hold.
 *
 * FETCH SHAPE: chosen entirely by the loader, not here. Each projected
 * `appliedPriceGroup` arrives materialized on the same terms
 * {@link MySqlPriceGroupRepository.getPriceGroup} materializes one - its rates, its
 * ancestry and its direct children - because the set loader is documented as identical to
 * the singular form association for association. This function narrows nothing and re-reads
 * nothing: it maps identifiers onto the entities the one keyed read already returned. The
 * only shape decision it makes is the negative one, that an intent naming a row the schema
 * does not carry is REFUSED rather than dropped.
 */
async function projectPriceGroupIntents(
  order: OrderView,
  intents: readonly PriceGroupAppliedIntent[],
  priceGroupSetLoader: PriceGroupSetLoader,
): Promise<OrderView> {
  if (intents.length === 0) {
    // Pass one wrote nothing, which is the L369 conditional declining for every
    // item - a NORMAL outcome, not a failure, and the L241 `isNull(...)` arm is
    // what pass two will then take. The order view is handed on untouched rather
    // than rebuilt, so no identity is disturbed for no reason. No total needs
    // restating either: with no price rewritten, every order-level member is exactly
    // as fresh as it was when the caller built it.
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

  // Resolve each DISTINCT price group once, IN ONE READ. `PriceGroupAppliedIntent`
  // carries the identifier, not the entity, so the entity has to be loaded for the
  // view - `reward.hasEligiblePriceGroup(...)` at
  // [model/service/PromotionService.cfc:L241] compares entities. De-duplicating is
  // a correctness measure as much as anything: two views of one price group could
  // answer that comparison differently.
  //
  // ★★ ONE STATEMENT FOR THE WHOLE SET. Pass one emits at most one intent per order
  // item, so a ten-line order naming ten price groups used to mean ten awaited
  // reads, issued one after another between the two passes even though no read
  // depended on any earlier one. The set loader collapses them, and the de-duplicated
  // set is what it is asked for so the database is never asked for a row twice.
  //
  // ★ AND IT REINFORCES THE DE-DUPLICATION ARGUMENT ABOVE RATHER THAN WEAKENING IT.
  // The loader keys its answer by identifier, so two intents naming one price group
  // receive THE SAME INSTANCE - which is precisely what makes the L241 entity
  // comparison answer the same way for both items. A per-identifier loop only
  // guaranteed that because the identifiers were de-duplicated first; one keyed read
  // guarantees it structurally.
  const requestedPriceGroupIDs = [...intentsByOrderItemID.values()].map(
    (intent) => intent.priceGroupID,
  );

  // Keyed by CASE-FOLDED identifier, matching the loader's own key, because CFML
  // identifiers are case-insensitive and the intent's spelling need not match the
  // stored row's.
  const priceGroupsByFoldedID =
    await priceGroupSetLoader.getPriceGroupsByID(requestedPriceGroupIDs);

  for (const priceGroupID of requestedPriceGroupIDs) {
    if (priceGroupsByFoldedID.has(foldIdentifier(priceGroupID))) {
      continue;
    }

    // The legacy L369 conditional tested `isObject(priceGroupDetails.priceGroup)`
    // before writing, so a non-object never reached `setAppliedPriceGroup`. An
    // intent naming a price group that cannot be loaded is therefore a broken
    // invariant rather than a data variation, and it is refused rather than
    // quietly dropped - dropping it would move the L241 discriminator to the
    // other arm and change the discount.
    //
    // Refused HERE, before any item is projected, so the refusal does not depend on
    // whether an order item happens to reference the unloadable group.
    throw new CompositionDataError(
      `price group "${priceGroupID}" named by a price-group intent could not be loaded`,
    );
  }

  const projectedOrderItems: OrderItemView[] = order.orderItems.map((orderItem): OrderItemView => {
    const intent = intentsByOrderItemID.get(orderItem.orderItemID);

    if (intent === undefined) {
      return orderItem;
    }

    const appliedPriceGroup = priceGroupsByFoldedID.get(foldIdentifier(intent.priceGroupID));

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

  // [model/entity/Order.cfc:L686-L699] re-derived over the projected items, exactly
  // as the live graph would derive it for the next reader.
  const projectedSubtotal = computeProjectedOrderSubtotal(projectedOrderItems);

  // [model/entity/Order.cfc:L700-L702] `getSubtotal() - getItemDiscountAmountTotal()`,
  // with the subtrahend recovered from the caller's own consistent pair; see the
  // note above for why that recovery is exact.
  const itemDiscountAmountTotal = order.subtotal.minus(order.subtotalAfterItemDiscounts);

  return {
    ...order,
    orderItems: projectedOrderItems,
    subtotal: projectedSubtotal,
    subtotalAfterItemDiscounts: projectedSubtotal.minus(itemDiscountAmountTotal),
  };
}

/**
 * `Order.getSubtotal()` re-derived over projected order items.
 *
 * SECURITY REVIEW DISPOSITION - RAISED AS S-22, ACCEPTED. This is the COMPOSITION-ROOT half
 * of the S-22 fix. The price-group pass's own output is projected back into the order view -
 * `subtotal` and `subtotalAfterItemDiscounts` both recomputed - so the promotion pass that
 * AAP 0.6.1 requires to run second observes post-price-group state rather than the caller's
 * original snapshot. Without this, a caller could hold the snapshot flat while price-group
 * rates moved the real item prices, and the promotion qualifier gate would be tested against
 * a subtotal that no longer described the order. The engine-side half is
 * `computeSubtotalAfterItemDiscounts` in `../services/promotionService.ts`.
 *
 * [model/entity/Order.cfc:L686-L699] is a SIGNED sum: an `oitSale` item adds its
 * extended price, an `oitReturn` item subtracts it, and any other type code makes the
 * legacy `throw()` at [L694] rather than contribute zero. The trichotomy is reproduced
 * including the throw - an unrecognised order-item type must not be able to quietly
 * shrink a subtotal that promotion qualifiers are about to be tested against.
 *
 * CFML parity [model/entity/Order.cfc:L689, L691]: the type-code comparisons are CFML
 * `==` on strings and therefore CASE-INSENSITIVE, so they are routed through the
 * case-folding helper rather than through `===`.
 *
 * The same legacy method is applied a second time inside the promotion engine, where
 * `computeSubtotalAfterItemDiscounts` in `../services/promotionService.ts` derives the
 * order-level reward base from it. The two sites are deliberately independent: this one
 * projects a view BETWEEN the passes, that one derives a discount base DURING pass two
 * when the item-discount subtrahend is provably zero, and neither may read the other's
 * tier. Both cite this legacy method so the shared rule is traceable from either.
 */
function computeProjectedOrderSubtotal(orderItems: readonly OrderItemView[]): Money {
  let subtotal = Money.zero;

  for (const orderItem of orderItems) {
    const typeCode = orderItem.orderItemType.systemCode;

    // [model/entity/Order.cfc:L689-L690]
    if (cfEquals(typeCode, 'oitSale')) {
      subtotal = subtotal.plus(orderItem.extendedPrice);
      continue;
    }

    // [model/entity/Order.cfc:L691-L692]
    if (cfEquals(typeCode, 'oitReturn')) {
      subtotal = subtotal.minus(orderItem.extendedPrice);
      continue;
    }

    // [model/entity/Order.cfc:L693-L694] the legacy `throw()`.
    throw new CompositionDataError(
      'there was an issue calculating the subtotal because of a orderItemType associated with one ' +
        `of the items. Reproduces model/entity/Order.cfc:L694 for orderItemID ` +
        `"${orderItem.orderItemID}" carrying orderItemType systemCode "${typeCode}".`,
    );
  }

  return subtotal;
}
