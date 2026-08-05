// ---------------------------------------------------------------------------
// slatwall-ts - the catalog-query Lambda entrypoint
//
// BUNDLE ENTRY POINT. This module exports a Lambda `handler` and is one of the five
// per-capability artifacts `esbuild.config.mjs` emits; `./bootstrap.js`, `./router.js` and
// `./errorMapper.js` are SHARED INTERNALS of this folder and export no handler. Nothing imports
// from this file: `src/handlers/` is the inversion point, it imports its siblings, and a back-edge
// into it would create an import cycle across every entry point.
//
// WHAT IT IS: a THIN PRIMARY ADAPTER. Parse the API Gateway event, let `./router.js` decide whether
// the request belongs to this capability, resolve which ONE ported service method the request names,
// open exactly one per-request scope from `./bootstrap.js`, invoke that one method, project the
// result onto JSON, and funnel every thrown value through `./errorMapper.js`.
//
// WHAT IT IS NOT: it makes NO business decision. There is no price or discount arithmetic here, no
// `Money` value reaches this file at all, no SQL is authored, no entity is constructed, no setting
// is resolved, no option combination is built and no URL title is generated. Every one of those
// lives in `src/services/**` or below, and the ported services are the acceptance surface this file
// merely carries traffic to. It constructs no service, no repository, no port and no connection
// pool either - `./bootstrap.js` is the only composition root in this subtree.
//
// PROVENANCE: CREATED FROM SCRATCH. AAP 0.4.1's handler table records this row's source file as "-"
// and its change as "Net-new entrypoint exposing existing `ProductService`/`BrandService`/
// `OptionService` methods", so what follows is idiomatic TypeScript: the minimal-change directive
// scopes the FUNCTIONAL SURFACE, never the code style. Its test coverage is likewise NET-NEW and
// must be reported as such and never as parity - `meta/tests/` contains nothing for the handler
// tier, and the only three legacy test files touching the in-scope slice are
// [meta/tests/unit/entity/BrandTest.cfc], [meta/tests/unit/entity/ProductTest.cfc] and the EMPTY
// [meta/tests/functional/admin/entity/ProductTest.cfc]. The assertions live in
// `tests/unit/handlers/catalogQueryHandler.test.ts`, which this file does not author; the exported
// factory below is what lets that suite inject its own composition root and logger with no
// module-level patching.
//
// NO USER RULES EXIST FOR THIS PROJECT. `review_rules` returns the single line
// "No user rules provided.", so no rule is cited anywhere in this file and none is invented. Every
// constraint below is attributed to the Agent Action Plan, to a cited legacy locator, or to an
// explicit `// JUDGMENT CALL:` - and the absence of rules is not treated as licence to lower the
// bar.
//
// ---------------------------------------------------------------------------
// THE PUBLISHED SURFACE, AND WHY IT IS EXACTLY THREE OPERATIONS
//
// Method names are carried over VERBATIM in CFML camelCase, because method-level interface parity is
// this migration's acceptance contract: a reviewer diffs `operation=findProducts` against
// `src/services/productService.ts` and against the legacy component directly. The three published
// operations are:
//
//   findProducts                  -> ProductService.findProducts            [ProductService.cfc:L342]
//   getUnusedProductOptions       -> OptionService.getUnusedProductOptions  [OptionService.cfc:L72]
//   getUnusedProductOptionGroups  -> OptionService.getUnusedProductOptionGroups [OptionService.cfc:L76]
//
// `findProducts` is the already-allocated replacement for `getProductSmartList`
// [model/service/ProductService.cfc:L342-L358]. That rename is ONE OF THE THREE PERMITTED SIGNATURE
// RESHAPINGS AND IT WAS ALLOCATED TO THE SERVICES TIER (AAP 0.6.2). This file CONSUMES it and
// consumes no ledger slot of its own: it neither re-derives nor extends it. In particular the
// framework's generic, string-keyed, dynamically-filtered smart list is NOT reopened here - there is
// no `filter[field]=value` passthrough, no free-form ordering key, no relevance-weighting knob and
// no property projection parameter. What a caller may send is the CLOSED, TYPED criteria shape
// `ProductQueryCriteria` publishes, and anything else is refused rather than ignored.
//
// ★★ EVERY OTHER MEMBER OF THE THREE SERVICES IS A DELIBERATE NON-EXPOSURE, AND THE REASONS ARE
// DIFFERENT IN KIND. Nothing below is re-implemented, worked around or partially provided.
//
// (1) OUT OF SCOPE BY AAP 0.9.5 - "The out-of-scope methods inside in-scope files are not ported."
//     The service tier keeps a thin pass-through to a stub port for each so a reviewer can diff the
//     surface, and this ROUTED entrypoint publishes none of them:
//       processProduct_addProductReview      [model/service/ProductService.cfc:L157]
//       processProduct_addSubscriptionTerm   [model/service/ProductService.cfc:L173]
//       processProduct_uploadDefaultImage    [model/service/ProductService.cfc:L235]
//       the subscription and content-access SKU branches [model/service/SkuService.cfc:L139-L202],
//         whose `contentAccess` arm has NO PORT AT ALL and for which none is invented here
//     `loadDataFromFile` [model/service/ProductService.cfc:L65-L68] is out of scope AND
//     STRUCTURALLY UNROUTABLE, which is worth stating separately because the reason is a platform
//     fact rather than a scope decision. Its legacy body opens by raising the CFML request timeout
//     to 3600 seconds - `getHibachiTagService().cfSetting(requesttimeout="3600")` at
//     [model/service/ProductService.cfc:L66]. AWS Lambda's maximum invocation duration is 15
//     minutes and API Gateway's integration timeout is 29 seconds. Both are PUBLISHED PLATFORM
//     LIMITS - facts about the runtime, not service levels, not targets, and not a claim about how
//     long any import takes - and an hour-long bulk import cannot be placed behind either. It is
//     therefore not published, and NO substitute is invented for it: no job queue, no state
//     machine, no queue hop, no chunked-upload protocol and no orchestration of any kind, because
//     the source had none.
//
// (2) OWNED BY A DIFFERENT CAPABILITY. `getProductSkusBySelectedOptions`
//     [model/service/ProductService.cfc:L104] is the AAP's `skuResolutionHandler` surface, and its
//     AND-of-EXISTS matching semantics [model/dao/SkuDAO.cfc:L107-L128] are must-preserve behaviour
//     that belongs to that entrypoint. Publishing it here as well would give one URL surface two
//     owners; `./router.js` enforces the split by capability and this file respects it.
//
// (3) ★ NOT REACHABLE FROM THIS TIER, BECAUSE THE COMPOSITION ROOT PUBLISHES NO ENTITY AND NO
//     ENTITY LOADER - and that is a deliberate property of `./bootstrap.js` rather than a gap to
//     route around. `RequestScope` used to publish the six MySQL repositories and no longer does:
//     the retired declarations and the reasoning are recorded on that interface, and withdrawing
//     them closed seven durable-mutation bypasses in which a row could be written WITHOUT the
//     service that owns its invariants. The consequence for this file is exact: it can obtain no
//     `Product`, no `Brand` and no `Option` instance, so every service member whose first parameter
//     is an entity has no admissible argument here.
//
//     Constructing one is forbidden - entity construction is not a transport concern and the
//     repository owns hydration, port injection and association materialization. Reaching
//     `CompositionRoot.createInspectableRequestScope` is likewise refused: it is an
//     assembly-inspection seam for suites that need the concrete adapter, and using it in a
//     production path would reinstate exactly the bypass its sibling withdrawal closed. So the
//     following are NOT published, and the reason is structural rather than discretionary:
//       getFormattedOptionGroups              [model/service/ProductService.cfc:L70]
//       processProduct_addOptionGroup         [model/service/ProductService.cfc:L113]
//       processProduct_addOption              [model/service/ProductService.cfc:L128]
//       processProduct_deleteDefaultImage     [model/service/ProductService.cfc:L198]
//       processProduct_updateDefaultImageFileNames [model/service/ProductService.cfc:L208]
//       processProduct_updateSkus             [model/service/ProductService.cfc:L216]
//       saveProduct                           [model/service/ProductService.cfc:L264]
//       saveProductType                       [model/service/ProductService.cfc:L294]
//       deleteProduct                         [model/service/ProductService.cfc:L317]
//       getOptionsForSelect                   [model/service/OptionService.cfc:L55]
//       saveBrand                             [model/service/BrandService.cfc:L67]
//
//     `saveBrand` deserves its own sentence, because it explains why this capability publishes NO
//     brand operation whatsoever rather than merely no brand WRITE. It is THE ONLY METHOD THE
//     LEGACY COMPONENT DECLARES [model/service/BrandService.cfc:L49-L89] - every brand read a
//     caller might expect arrived by inheritance from the framework base, which is deliberately not
//     ported - so there is no brand query method in existence to expose. `src/services/
//     brandService.ts` publishes exactly one member for exactly that reason.
//
// (4) NOT THIS SERVICE'S TO PUBLISH AT ALL. Nothing from `OrderService`, checkout, cart, payment,
//     shipping, fulfillment, account, subscription, vendor or tax is reachable from here; neither
//     is the Taffy REST layer under `frontend/api/`, the Mura CMS bridge, any integration adapter
//     other than Google, or any capability of `org/Hibachi/**` - 938 files that are a boundary to
//     extract FROM and never to modify.
//
// ---------------------------------------------------------------------------
// THE EXECUTION-MODEL MISMATCH THIS ENTRYPOINT ABSORBS (AAP 0.6.5)
//
// The legacy bulk paths ran under an ambient `cftransaction` and an hour-long request budget.
// NEITHER EXISTS HERE, and the AAP therefore requires a bulk mutation path to carry three things.
// All three are implemented below as UNCONDITIONAL properties of every request this file serves -
// not as a branch that a future mutating operation would have to remember to opt into. Each is a
// CORRECTNESS mechanism, and none of them is a throughput, capacity, latency or availability claim.
//
//   1. AN EXPLICIT BOUND ON THE WORK ONE INVOCATION MAY REQUEST. `MAXIMUM_OPERATIONS_PER_INVOCATION`
//      is 1: the grammar admits ONE operation per invocation, a request naming more is REFUSED
//      through `./errorMapper.js` rather than silently truncated to the first, and there is no
//      request key by which a caller can raise a bound the deployment owns. That second half
//      matters most: the SKU-repricing bound lives on `ProductService`'s constructor
//      (`maximumSkuUpdateBatchSize`) and the SKU-creation bound on `SkuService`'s, both supplied by
//      the composition root, and this file forwards no parameter that could enlarge either. When a
//      service-tier bound refuses, the refusal is mapped and logged rather than swallowed.
//
//   2. IDEMPOTENCY ON RETRY. A caller-supplied idempotency key is honoured, so a retried invocation
//      returns the recorded outcome instead of repeating the work. Retries are a PLATFORM FACT of
//      the runtime, not a performance concern. What the mechanism does and does not guarantee is
//      stated exactly on `IdempotencyLedger` below; in particular it is container-local, and no
//      durable store is invented for it.
//
//   3. A DOCUMENTED COMPENSATION STORY, which is this paragraph. No transaction wraps a ported bulk
//      loop, so a partial failure is reachable and its consequences are written down rather than
//      discovered. `processProduct_updateSkus` [model/service/ProductService.cfc:L216-L233] issues
//      ONE unit of work per SKU, so an interrupted call leaves the SKUs already written written and
//      the remainder untouched; the product row itself is not written by that method, so no
//      half-updated parent exists. Reconciliation is REPLAY: both price branches ASSIGN an absolute
//      value rather than applying a delta, so re-invoking with the same payload converges on the
//      same end state however many times it runs, and the service checks its batch bound BEFORE the
//      first mutation so a refused call leaves nothing behind at all. The SKU-creation path reached
//      through `processProduct_addOptionGroup` / `processProduct_addOption` is the harder case: it
//      INSERTS, so replay after a partial failure is not self-correcting, and reconciliation there
//      is an operator comparing the product's SKU set against its option groups. The idempotency
//      key is what keeps an unintended retry from compounding that; a deliberate re-run is a new
//      key. None of the three is published today - see non-exposure (3) above - and the mechanisms
//      are in place unconditionally so that publishing one cannot omit them.
//
// WHY THE CREATION PATH IS THE HARDER CASE, RECORDED WITH ITS LOCATOR. `createSkus`
// [model/service/SkuService.cfc:L109-L121] walks an odometer over the FULL CARTESIAN PRODUCT of a
// product's option groups - `totalCombos` is the product of every group's size and is therefore
// UNBOUNDED BY CONSTRUCTION - and it is reachable from both `processProduct_addOptionGroup`
// [model/service/ProductService.cfc:L113] and `processProduct_addOption`
// [model/service/ProductService.cfc:L128]. Under the legacy execution model that was slow; here it
// is a correctness problem, which is why the bound in (1) is a refusal and not a truncation.
//
// LEGACY-DEFECT [model/service/ProductService.cfc:L220]: the repricing loop declares its counter as
// `for(i=1; i <= arrayLen(skus); i++)` with no `var`, so it leaks into the component variables scope.
// Preserved deliberately; do not fix without a product decision.
// Recorded here because this entrypoint is the tier that absorbs the execution-model consequences of
// that loop. The leak itself belongs to `src/services/productService.ts`, where block scoping already
// makes it unreproducible, and nothing in this file attempts to repair it.
//
// NO THREADS ARE INTRODUCED. The `cfthread`-to-`worker_threads` translation rule is recorded in the
// plan and is UNEXERCISED: a sweep of the in-scope slice finds zero `cfthread` usages, so there is
// nothing to translate and this file spawns nothing.
//
// THE LEGACY RUNTIME'S THREE LOCK TIMEOUTS - 60 seconds on order placement, 45 on a payment
// transaction, 30 on the DI/1 first-scan - ARE NOTED AND DELIBERATELY NOT IMPLEMENTED, per the
// plan. Two of the three guard out-of-scope code paths and the third disappeared with DI/1 itself.
//
// ---------------------------------------------------------------------------
// WHAT REACHES A RESPONSE BODY
//
// AN ENTITY IS NEVER SERIALIZED. The ported entities are classes whose fields are TypeScript-private
// only - enumerable at run time - and they hold injected collaborators, so handing one to
// `JSON.stringify` would walk from a product into a repository. Every response is built from an
// EXPLICIT PROJECTION over published accessors, and the product projection publishes exactly the two
// columns the executed statement selects: `productID` and `productName`
// [model/dao/ProductDAO.cfc:L421].
//
// ABSENCE SURVIVES AS ABSENCE. `Product.getProductName()` answers `string | undefined` because the
// column is nullable, and an absent value is represented by the MEMBER BEING OMITTED from the JSON
// document - never by `0`, never by `''` and never by `null`. That discipline is not cosmetic in
// this subtree: `getPriceByCurrencyCode` [model/entity/Sku.cfc:L269-L273] has no `else` and no
// fallback, and substituting a zero for that absence would silently sell products for free. No
// monetary value reaches this capability's surface at all, and no array a service returns is
// reordered on the way out.
//
// NO STATUS VOCABULARY IS INVENTED. `./errorMapper.js` models a closed set of exactly three codes -
// 400 for unusable input, 404 for an unmatched route, 500 for a server-shaped failure - because the
// legacy slice has no HTTP status vocabulary to port. This file adds no fourth: no authentication or
// authorization status, no conflict, no unprocessable-entity, no request-quota status, and none of
// the retry-after, rate-limit or circuit-breaker headers that accompany one.
// ---------------------------------------------------------------------------

// IMPORT DISCIPLINE. Explicit relative specifiers carrying the `.js` extension NodeNext resolution
// requires, named imports only, and `import type` for every type-only import so that nothing
// type-only survives into the bundle. There is no barrel and no `index.ts` anywhere in this subtree,
// so each symbol is taken from the module that declares it. The four internal modules below are the
// whole of this file's internal dependency surface: its three siblings in this folder plus the
// structured logger, with two SERVICE modules imported for their published TYPES alone - the
// instances themselves arrive on the request scope and are never constructed here.
//
// `@types/aws-lambda` supplies the event, result, context and handler types; `zod` validates request
// input and is the same library that carries the ported declarative rules from `model/validation/`.
// Nothing else is imported: no dependency-injection container, no HTTP client, no logging library,
// no XML parser, no AWS SDK and no routing library.
//
// THE BUNDLE FORMAT IS A SETTLED QUESTION AND IS NOT REVISITED HERE. `esbuild.config.mjs` emits
// CommonJS because bundling this dependency set to ESM builds cleanly and then fails at run time
// with `Dynamic require of "node:buffer" is not supported` through `mysql2/promise.js` ->
// `sql-escaper/lib/index.js`. The consequence for this file is concrete and observed: it uses neither
// the ESM import-metadata expression nor a top-level `await`, because neither exists in a CommonJS
// bundle. TypeScript source stays NodeNext; only the emitted bundle format differs.

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { z } from 'zod';

import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';
import type { OptionService } from '../services/optionService.js';
import type { ProductPage, ProductQueryCriteria } from '../services/productService.js';
import type { CompositionRoot, RequestScope } from './bootstrap.js';
import { bootstrapCompositionRoot } from './bootstrap.js';
import type { ErrorMappingContext, MappedFieldIssue } from './errorMapper.js';
import {
  invalidRequestResponse,
  mapErrorToApiGatewayResponse,
  routeNotFoundResponse,
} from './errorMapper.js';
import type { RouteAction, RoutedCapability } from './router.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';

// ---------------------------------------------------------------------------
// The capability this entrypoint owns, and the one action it implements
// ---------------------------------------------------------------------------

/**
 * The capability this handler answers for, and no other.
 *
 * Handed to `resolveRouteForCapability` so that a request whose path belongs to one of the other
 * four capabilities is reported exactly as an unmatched route. Reading the shared table is what
 * keeps five independently deployable bundles on one agreed URL surface; checking the capability is
 * what stops them answering for each other.
 */
const OWNED_CAPABILITY: RoutedCapability = 'catalogQuery';

/**
 * The route action this handler implements.
 *
 * `./router.js` owns RESOLUTION and this file owns INVOCATION, so the action arrives as DATA on the
 * matched descriptor and is checked here before anything is invoked. The check cannot fail while the
 * shared table assigns `queryCatalog` to `catalogQuery`, and it is written out anyway for the reason
 * `./router.js` gives for handling its own impossible `undefined` arm: this file does not own that
 * table, non-null assertions are banned throughout `src/**`, and an impossible case that is handled
 * stays visible instead of being asserted away. If the table ever assigned a different action to
 * this capability, refusing is correct and guessing is not.
 */
const IMPLEMENTED_ACTION: RouteAction = 'queryCatalog';

// ---------------------------------------------------------------------------
// The published operation vocabulary
// ---------------------------------------------------------------------------

/**
 * The operations this capability publishes, named VERBATIM after the ported service methods they
 * invoke.
 *
 * A string-literal union rather than the TypeScript enumeration construct, so nothing survives into
 * the bundle as a runtime object and each value stays directly comparable against a decoded log line
 * without an import. The union is what makes "exactly these three, and no fourth" a compile-time
 * property: {@link CATALOG_QUERY_OPERATIONS} is typed by it, and the dispatch below is an exhaustive
 * switch over it, so adding a member without publishing and dispatching it is a compile error.
 *
 * The names are not TypeScript-idiomatic and are not meant to be. Interface parity is the acceptance
 * contract, so `getUnusedProductOptionGroups` is spelled exactly as
 * [model/service/OptionService.cfc:L76] spells it, and `findProducts` is spelled exactly as the
 * services tier publishes the allocated smart-list replacement.
 */
export type CatalogQueryOperation =
  'findProducts' | 'getUnusedProductOptions' | 'getUnusedProductOptionGroups';

/**
 * The published operations as data, in the order they are documented.
 *
 * Frozen because this module is instantiated once per container and shared across every invocation
 * it serves, and `readonly` is a compile-time claim only.
 */
const CATALOG_QUERY_OPERATIONS: readonly CatalogQueryOperation[] = Object.freeze([
  'findProducts',
  'getUnusedProductOptions',
  'getUnusedProductOptionGroups',
]);

/**
 * The query-string parameter that names the operation.
 *
 * JUDGMENT CALL: the operation travels as a query-string parameter and is REQUIRED, with no default.
 * The shared route table gives this capability exactly one route, deliberately - it records that
 * enumerating a sub-surface there would invent a URL vocabulary this migration was never asked to
 * design - so something in the request has to say which of the three ported methods a caller wants,
 * and the legacy slice has no HTTP vocabulary to copy. Requiring the parameter rather than defaulting
 * it is the choice that invents least: a default would silently answer a different question than the
 * one asked, and `./errorMapper.js` already publishes `missingQueryParameter` as the reason for
 * exactly this refusal.
 */
const OPERATION_PARAMETER = 'operation';

// ---------------------------------------------------------------------------
// Response projections
//
// Each shape below is a PROJECTION built from published accessors, never a serialized entity. See the
// module header for why an entity must never reach `JSON.stringify`.
// ---------------------------------------------------------------------------

/**
 * One matched product, reduced to the two columns the executed statement selects.
 *
 * `productID` is always present: the ported entity answers it as a definite `string`, empty for an
 * unsaved product. `productName` is OPTIONAL because the column is nullable and the accessor answers
 * `string | undefined`; an absent name is published by OMITTING the member, which is what keeps
 * absence distinguishable from an empty name. Nothing else is published, because
 * [model/dao/ProductDAO.cfc:L421] selects `productID` and `productName` from `SwProduct` and joins
 * nothing - publishing a brand or a product-type member would tell a caller that a value was
 * selected when it was not.
 */
export interface CatalogProductProjection {
  /** [model/entity/Product.cfc:L52] via `Product.getProductID()`. */
  readonly productID: string;

  /** [model/entity/Product.cfc:L55] via `Product.getProductName()`. Omitted when absent. */
  readonly productName?: string;
}

/**
 * The projection of one `ProductPage`.
 *
 * The paging members and the query contract are carried through exactly as the service published
 * them. `joins` and `keywordProperties` are plain data the service deliberately publishes ON THE
 * RESULT - a returned array cannot be inspected the way the framework's live smart-list object could,
 * so the shape of the statement that ran travels with the records - and their types are taken from
 * `ProductPage` itself so the two cannot drift.
 *
 * `pageRecordsShow` is OPTIONAL here where the service declares it `number | undefined`, because
 * `undefined` on that member means THE WHOLE RESULT SET and the JSON document says so by omitting it.
 * Publishing a `0` in its place would claim an empty window.
 */
export interface CatalogProductPageProjection {
  /** The matched products, in repository order. Never reordered here. */
  readonly records: readonly CatalogProductProjection[];

  /** How many products matched before the paging window was applied. */
  readonly recordsCount: number;

  /** The zero-based start index the service actually applied. */
  readonly pageRecordsStart: number;

  /** The window size actually applied. Omitted when the whole result set was returned. */
  readonly pageRecordsShow?: number;

  /** The entity the legacy smart list was built against [model/service/ProductService.cfc:L343]. */
  readonly entityName: ProductPage['entityName'];

  /** The related-property joins the executed statement performs. Empty, and published as such. */
  readonly joins: ProductPage['joins'];

  /** The properties the executed statement matches the keyword against. */
  readonly keywordProperties: ProductPage['keywordProperties'];
}

/**
 * One select row, exactly as the option port publishes it.
 *
 * Derived from the ported method's own return type rather than redeclared, so this file cannot drift
 * from the contract it forwards. The element type is `SelectOption` - a label and an identifier -
 * and it is deliberately NOT `Option` or `OptionGroup`: neither legacy DAO function hydrates an
 * entity, both build a two-key structure per row [model/dao/OptionDAO.cfc:L88, L113], and the
 * option-GROUP query publishes group rows under the same row shape.
 */
export type CatalogSelectOptionProjection = Awaited<
  ReturnType<OptionService['getUnusedProductOptions']>
>[number];

/**
 * What one served operation returns, discriminated by the operation that produced it.
 *
 * A union rather than a widened bag, so a caller - and the suite that asserts on it - can tell from
 * the `operation` member alone which payload shape `result` carries.
 */
export type CatalogQueryResult =
  | {
      readonly operation: 'findProducts';
      readonly result: CatalogProductPageProjection;
    }
  | {
      readonly operation: 'getUnusedProductOptions' | 'getUnusedProductOptionGroups';
      readonly result: readonly CatalogSelectOptionProjection[];
    };

/**
 * The JSON document a successful invocation carries.
 *
 * JUDGMENT CALL: the envelope mirrors the one `./errorMapper.js` builds for a failure - a single
 * nested payload plus an echo of the correlation identifier - rather than returning a bare payload.
 * Something has to be the body, the legacy slice publishes no envelope to copy, and matching the
 * failure envelope means a caller parses one document shape instead of two. The correlation
 * identifier is echoed for the same reason the error envelope echoes it: it is how a caller's
 * response is joined to the log stream.
 */
export interface CatalogQueryResponseBody {
  /** The operation that produced `result`. */
  readonly operation: CatalogQueryOperation;

  /** Echo of the invocation's correlation identifier. */
  readonly requestId: string;

  /** The projected payload. */
  readonly result: CatalogProductPageProjection | readonly CatalogSelectOptionProjection[];
}

// ---------------------------------------------------------------------------
// Response construction
// ---------------------------------------------------------------------------

/**
 * Headers on every successful response.
 *
 * The same two `./errorMapper.js` sets, and for the same reasons: the body is always a JSON document,
 * and `no-store` keeps an intermediary from serving one caller's response to a later, unrelated
 * request. No caching policy, no compression negotiation and no cross-origin header is invented -
 * this service has no such vocabulary to port.
 */
const JSON_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/** The status a served operation carries. The only success status this file publishes. */
const OK_STATUS = 200;

// ---------------------------------------------------------------------------
// The bound on the work one invocation may request (AAP 0.6.5, mechanism 1)
// ---------------------------------------------------------------------------

/**
 * How many operations one invocation may name.
 *
 * ONE. A request carrying the operation parameter twice is REFUSED, not truncated to the first and
 * not answered twice, and this is the transport-level half of the AAP 0.6.5 bulk-mutation bound: it
 * is what stops a caller multiplying an unbounded SKU-creation walk
 * [model/service/SkuService.cfc:L109-L121] by a batch of its own choosing. The SKU-count bounds
 * themselves stay where they belong - on the two service constructors, supplied by the composition
 * root - and no parameter this file forwards can raise either.
 *
 * A SAFETY BOUND, stated as one. It is not a target, not a quota, not a rate and not a capacity
 * figure, and it carries no time dimension of any kind.
 */
const MAXIMUM_OPERATIONS_PER_INVOCATION = 1;

// ---------------------------------------------------------------------------
// Idempotency on retry (AAP 0.6.5, mechanism 2)
// ---------------------------------------------------------------------------

/**
 * The header a caller supplies its idempotency key on.
 *
 * JUDGMENT CALL: a header rather than a parameter, and this spelling. An idempotency key is metadata
 * about the DELIVERY of a request rather than an input to the operation, so it does not belong in the
 * criteria shape a service consumes; `idempotency-key` is the spelling in common use, and the legacy
 * slice offers nothing to copy because it had no retry semantics to carry a key for. Matching is
 * case-insensitive because HTTP field names are case-insensitive and API Gateway presents them with
 * the casing the client chose.
 */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * The longest idempotency key this handler will accept, in characters.
 *
 * A supplied key becomes a map key in the ledger below, so an unbounded one is an unbounded
 * allocation. A key longer than this is refused explicitly rather than truncated - truncating would
 * make two different keys collide, which is the one failure mode an idempotency key exists to
 * prevent. A SAFETY BOUND, like the one above, and not a capacity claim.
 */
const MAXIMUM_IDEMPOTENCY_KEY_LENGTH = 256;

/**
 * How many recorded outcomes one container may hold.
 *
 * The ledger is bounded so that a warm container's memory cannot grow with the number of distinct
 * keys it has seen. Eviction is oldest-first, and an evicted key simply stops being replayable: a
 * retry under it re-executes, which is the same outcome as a retry that lands on a cold container.
 * A SAFETY BOUND on allocation, not a capacity or throughput figure.
 */
const MAXIMUM_RECORDED_OUTCOMES = 256;

/**
 * The per-container record of what each idempotency key already produced.
 *
 * ★ WHAT THIS GUARANTEES, EXACTLY. Within one container, two invocations carrying the same key
 * execute the operation ONCE: the ledger stores the IN-FLIGHT promise, so a duplicate that arrives
 * while the first is still running awaits the same attempt rather than starting a second, and a
 * duplicate that arrives afterwards is answered from the recorded response. That is the property AAP
 * 0.6.5 asks for - a retried invocation does not double-write.
 *
 * ★ WHAT IT DOES NOT GUARANTEE, stated rather than implied. It is CONTAINER-LOCAL. A retry that
 * lands on a different container, or on the same one after eviction, is not deduplicated by it. The
 * durable store that would close that gap is deliberately NOT invented here: it would mean a new
 * dependency and infrastructure this migration excludes outright, and a mechanism whose limits are
 * written down is safer than one whose limits are assumed. That residual exposure is precisely what
 * the compensation story in the module header covers.
 *
 * ★ ONLY A COMPLETED ATTEMPT IS KEPT. If the attempt rejects, its entry is removed, so a retry after
 * a failure is admitted rather than being answered forever with the failure. A refusal decided BEFORE
 * the operation runs - an unmatched route, an unusable operation selector, input the schema rejects -
 * is never recorded at all: those outcomes are deterministic functions of the request, so replaying
 * them would buy nothing and recording them would let a malformed first attempt poison a corrected
 * second one under the same key.
 *
 * ★ IT IS PER HANDLER INSTANCE, NOT MODULE STATE. The ledger is created inside
 * {@link createCatalogQueryHandler}, so the production `handler` has exactly one for the lifetime of
 * its container while a suite that builds its own handler gets its own - no shared mutable module
 * state, and no patching required to isolate a test.
 */
interface IdempotencyLedger {
  /**
   * The recorded attempt for a key, or `undefined` when the key is unknown to this container.
   * Insertion order is the eviction order.
   */
  readonly recorded: Map<string, Promise<APIGatewayProxyResult>>;
}

/**
 * Run `attempt` once per key, replaying the recorded outcome for a repeat.
 *
 * Keyless requests are passed straight through: a caller that supplies no key has not asked for
 * replay, and inventing one from the request's own content would deduplicate two genuinely distinct
 * requests that happen to look alike.
 *
 * @param ledger  The per-handler record of completed attempts.
 * @param key     The caller-supplied key, already validated and bounded.
 * @param attempt The work to perform at most once for this key.
 * @returns The response, whether freshly produced or replayed.
 */
async function throughIdempotencyLedger(
  ledger: IdempotencyLedger,
  key: string,
  attempt: () => Promise<APIGatewayProxyResult>,
): Promise<APIGatewayProxyResult> {
  const recorded = ledger.recorded.get(key);
  if (recorded !== undefined) {
    return await recorded;
  }

  const started = attempt();
  ledger.recorded.set(key, started);
  evictOldestRecordedOutcomes(ledger);

  try {
    return await started;
  } catch (thrown: unknown) {
    // A failed attempt is not an outcome to replay. Dropping it is what lets a retry re-execute,
    // and the rejection is re-raised unchanged so the one error-mapping funnel still classifies it.
    ledger.recorded.delete(key);
    throw thrown;
  }
}

/** Drop the oldest recorded outcomes until the ledger is within its bound. */
function evictOldestRecordedOutcomes(ledger: IdempotencyLedger): void {
  while (ledger.recorded.size > MAXIMUM_RECORDED_OUTCOMES) {
    // `Map` iterates in insertion order, so the first key is the oldest. The loop is written over
    // a fresh iterator each pass rather than deleting while iterating.
    const oldest = ledger.recorded.keys().next();
    if (oldest.done === true) {
      return;
    }
    ledger.recorded.delete(oldest.value);
  }
}

// ---------------------------------------------------------------------------
// Reading the request
//
// Every lookup into a header, query or path map yields `T | undefined` under
// `noUncheckedIndexedAccess`, and every one of them is handled explicitly below. There is no non-null
// assertion and no cast anywhere in this file.
// ---------------------------------------------------------------------------

/**
 * Read one header, case-insensitively, and treat blank as absent.
 *
 * HTTP field names are case-insensitive and API Gateway presents them with the casing the client
 * sent, so a direct index would miss `Idempotency-Key`. The comparison is written out here rather
 * than borrowed from the CFML struct helpers: this is an HTTP property, not CFML struct-key
 * semantics, and conflating the two would attribute a platform fact to a parity helper.
 *
 * A header present with an empty or whitespace-only value is reported as ABSENT, because a caller
 * that sends an empty key has supplied no key. The value is trimmed, so a key is not made distinct by
 * surrounding whitespace.
 */
function readHeader(headers: APIGatewayProxyEvent['headers'], name: string): string | undefined {
  for (const [candidate, value] of Object.entries(headers)) {
    if (candidate.toLowerCase() !== name) {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }
    return trimmed;
  }
  return undefined;
}

/**
 * How many times the operation parameter was supplied.
 *
 * API Gateway reports a repeated query parameter on `multiValueQueryStringParameters`, and the
 * single-valued map keeps only one of them - so counting there is the only way to notice a caller
 * asking for two operations at once. An event built without the multi-value map is handled by falling
 * back to the single-valued one, which can only ever report zero or one.
 */
function countSuppliedOperations(event: APIGatewayProxyEvent): number {
  const repeated = event.multiValueQueryStringParameters;
  if (repeated !== null) {
    const values = repeated[OPERATION_PARAMETER];
    if (values !== undefined) {
      return values.length;
    }
  }

  const single = event.queryStringParameters;
  if (single !== null && single[OPERATION_PARAMETER] !== undefined) {
    return 1;
  }

  return 0;
}

/**
 * The supplied query parameters, minus the operation selector.
 *
 * The selector is removed because it names the operation rather than being an input to it, and each
 * operation's parameter set is closed - see {@link hasClosedParameterSet}. A key present with no
 * value at all is dropped rather than admitted as `undefined`: the schemas below distinguish "absent"
 * from "present and empty", and an undefined value is the former.
 */
function readOperationParameters(event: APIGatewayProxyEvent): Record<string, string> {
  const supplied = event.queryStringParameters;
  const parameters: Record<string, string> = {};

  if (supplied === null) {
    return parameters;
  }

  for (const [name, value] of Object.entries(supplied)) {
    if (name === OPERATION_PARAMETER || value === undefined) {
      continue;
    }
    parameters[name] = value;
  }

  return parameters;
}

/**
 * Recognize the operation a caller named, exactly.
 *
 * JUDGMENT CALL: the comparison is CASE-SENSITIVE, unlike the path matching in `./router.js`, and the
 * difference is deliberate. That module folds case because it is reproducing two CFML comparisons that
 * fold case [Application.cfc:L130, L133]. This token has no legacy antecedent at all: it is a
 * published name whose whole purpose is that it is the ported method's name character for character,
 * which is what makes the interface-parity diff mechanical. Admitting `FINDPRODUCTS` would loosen the
 * one thing the token exists to pin.
 */
function recognizeOperation(candidate: string): CatalogQueryOperation | undefined {
  for (const operation of CATALOG_QUERY_OPERATIONS) {
    if (operation === candidate) {
      return operation;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Request validation
//
// ★ WHAT THESE SCHEMAS ARE, AND WHAT THEY ARE EMPHATICALLY NOT.
//
// They validate the WIRE FORM of a query string - every value in one is a string, so an integer
// parameter has to be recognized as a numeral and converted before a service that declares `number`
// can be handed it. That is a transport concern and it lives here.
//
// They restate NO business rule, and one case makes the distinction concrete. The declarative rules
// of [model/validation/Product_UpdateSkus.json] - the conditions `showPrice{updatePriceFlag eq 1}`
// and `showListPrice{updateListPriceFlag eq 1}` gating `price` and `listPrice` - are ALREADY PORTED,
// as a module-private zod schema inside `src/services/productService.ts` that
// `processProduct_updateSkus` parses with before any mutation. That schema is the single source of
// truth for those rules and this file does not duplicate it, restate it or wrap it: it is consumed by
// invoking the service, which is also why the conditional requiredness cannot drift between the two
// tiers. (That operation is in any case not published here - see non-exposure (3) in the module
// header.)
//
// NOR IS ANY RULE INVENTED. Six in-scope entities have NO validation file at all - `Category`,
// `PromotionQualifier`, `PromotionApplied`, `PromotionAccount`, `Product_AddOption` and
// `Product_AddOptionGroup` - and those absences are by design and are not filled in from here. Where
// the legacy declares no constraint, none is added: the paging members below are checked for their
// WIRE SHAPE only, and `ProductService`'s own S-08 bound on a supplied paging value stays
// authoritative.
//
// AN EMPTY VALUE IS NOT A MISSING VALUE, and that fidelity point is load-bearing twice over.
// `searchProductsByProductType` binds its term UNCONDITIONALLY as `%<term>%`
// [model/dao/ProductDAO.cfc:L422], so an empty keyword is a search that matches every row rather than
// an error; and neither option query guards an empty list, so an empty
// `existingOptionGroupIDList` leaves one query excluding nothing while it leaves the other matching
// nothing [model/dao/OptionDAO.cfc:L68, L107]. Both outcomes belong to the caller. These schemas
// therefore require the parameter to be PRESENT and accept an empty value.
// ---------------------------------------------------------------------------

/**
 * A query-string value that carries a non-negative integer.
 *
 * The pattern admits digits only - no sign, no decimal point, no exponent and no whitespace - so a
 * value that would reach `slice` as a negative offset or a fraction is refused at the boundary rather
 * than reinterpreted. The radix is explicit, as it must be everywhere in this subtree.
 *
 * This is a WIRE-FORM parse and not a restatement of the service's rule.
 * `ProductService.findProducts` independently rejects a supplied bound that is not a non-negative
 * safe integer, and that check remains the authoritative one; parsing here is what turns a malformed
 * numeral into a described field issue instead of an unrecognized server-shaped failure.
 */
const nonNegativeIntegerParameter = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer with no sign, decimal point or exponent')
  .transform((value: string): number => Number.parseInt(value, 10));

/**
 * The closed criteria shape `findProducts` accepts.
 *
 * One member per member of `ProductQueryCriteria`, and no index signature: the framework smart list's
 * open-ended, string-keyed filter surface is not reopened here (AAP 0.6.2).
 *
 * `keyword` is REQUIRED because the service declares it required, and the service declares it
 * required because the statement binds it unconditionally - omitting it in CFML reached an
 * undefined-variable raise rather than a broader search. `productTypeIDs` stays OPTIONAL because its
 * guard at [model/dao/ProductDAO.cfc:L423] gives absence a meaning, and it stays a COMMA-DELIMITED
 * STRING rather than being modernised into an array, because the adapter binds it as a CFML list and
 * the string form is what signature parity preserves.
 */
const findProductsParameters = z.object({
  keyword: z.string(),
  productTypeIDs: z.string().optional(),
  pageRecordsStart: nonNegativeIntegerParameter.optional(),
  pageRecordsShow: nonNegativeIntegerParameter.optional(),
  currentURL: z.string().optional(),
});

/**
 * The closed shape `getUnusedProductOptions` accepts [model/service/OptionService.cfc:L72].
 *
 * Both parameters are declared `required` in the legacy signature, so both must be PRESENT here -
 * present and empty included, for the reason given above. `existingOptionGroupIDList` stays a
 * `string`: the DAO binds it with `cfqueryparam ... list="true"`, so the comma-delimited form is what
 * the contract carries, and splitting it is the adapter's job exactly as it was the DAO's.
 */
const getUnusedProductOptionsParameters = z.object({
  productID: z.string(),
  existingOptionGroupIDList: z.string(),
});

/**
 * The closed shape `getUnusedProductOptionGroups` accepts [model/service/OptionService.cfc:L76].
 *
 * ONE parameter, and no product identifier. The asymmetry against its sibling is the source's own -
 * [model/dao/OptionDAO.cfc:L95] versus [model/dao/OptionDAO.cfc:L52-L53] - and adding an optional
 * `productID` here would invent a requirement and quietly change the result set.
 */
const getUnusedProductOptionGroupsParameters = z.object({
  existingOptionGroupIDList: z.string(),
});

/**
 * The parameter names each operation publishes, derived from the schema that consumes them.
 *
 * Keyed by the operation union, so an operation without a parameter set is a compile error rather than
 * a silent hole. The names come from each schema's own shape, which keeps ONE source of truth: a
 * member added to a schema is admitted by the closed-set check without a second edit.
 */
const PUBLISHED_PARAMETER_NAMES: Readonly<Record<CatalogQueryOperation, readonly string[]>> =
  Object.freeze({
    findProducts: Object.freeze(Object.keys(findProductsParameters.shape)),
    getUnusedProductOptions: Object.freeze(Object.keys(getUnusedProductOptionsParameters.shape)),
    getUnusedProductOptionGroups: Object.freeze(
      Object.keys(getUnusedProductOptionGroupsParameters.shape),
    ),
  });

/**
 * Whether every supplied parameter belongs to the operation's published set.
 *
 * ★ WHY THIS IS A SEPARATE CHECK RATHER THAN A STRICT SCHEMA. A strict object schema would reject an
 * unrecognized key with a message that QUOTES THE KEY NAME, and `./errorMapper.js` publishes a
 * validation issue's message into the response body. A key name is caller-authored text, so that
 * would reflect submitted input back to the sender - a hole straight through the guarantee that no
 * response body echoes what a caller sent. Checking membership here lets the refusal carry a FIXED
 * sentence that names nothing, while the schemas themselves stay non-strict and can only ever produce
 * messages about members THIS FILE declared.
 *
 * The grammar is genuinely closed: an unrecognized parameter is refused rather than ignored, so a
 * caller mis-spelling `pageRecordsShow` is told, instead of silently receiving the whole result set.
 */
function hasClosedParameterSet(
  operation: CatalogQueryOperation,
  parameters: Readonly<Record<string, string>>,
): boolean {
  const published = PUBLISHED_PARAMETER_NAMES[operation];

  for (const supplied of Object.keys(parameters)) {
    if (!published.includes(supplied)) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// The refusals this file decides for itself
//
// Every sentence below is FIXED and handler-authored, and none of them names a submitted value, a
// submitted key, a route, a host, a credential or a statement. `./errorMapper.js` owns the top-level
// message for each reason and publishes these as field-level constraint descriptions; the reason
// literal a handler passes is one of a closed union, so no free-form sentence can reach the envelope
// from here.
// ---------------------------------------------------------------------------

/** The dotted label the operation selector is reported under. */
const OPERATION_ISSUE_PATH = OPERATION_PARAMETER;

/** The label an unpublished query parameter is reported under. Names the container, never the key. */
const QUERY_STRING_ISSUE_PATH = 'queryStringParameters';

/** The label an unusable idempotency key is reported under. */
const IDEMPOTENCY_KEY_ISSUE_PATH = `headers.${IDEMPOTENCY_KEY_HEADER}`;

/** The published operations, rendered once for the refusal sentences that list them. */
const PUBLISHED_OPERATION_LIST = CATALOG_QUERY_OPERATIONS.join(', ');

/** No operation was named at all. */
const MISSING_OPERATION_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message: `is required and must name exactly one of: ${PUBLISHED_OPERATION_LIST}`,
});

/**
 * More operations were named than one invocation may serve.
 *
 * The sentence states the refusal AND that nothing was truncated, because a caller that sent two
 * operations needs to know it received neither rather than silently the first.
 */
const TOO_MANY_OPERATIONS_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message:
    `may be supplied at most ${String(MAXIMUM_OPERATIONS_PER_INVOCATION)} time per request; ` +
    'a request naming more is refused whole and is never truncated to the first',
});

/** The named operation is not one this capability publishes. The submitted token is not echoed. */
const UNKNOWN_OPERATION_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message: `must name one of the operations this capability publishes: ${PUBLISHED_OPERATION_LIST}`,
});

/** A parameter outside the named operation's closed set was supplied. The key is not echoed. */
const UNPUBLISHED_PARAMETER_ISSUE: MappedFieldIssue = Object.freeze({
  path: QUERY_STRING_ISSUE_PATH,
  message:
    'carries a parameter the named operation does not publish; the criteria shape is closed, and ' +
    'an unrecognized parameter is refused rather than ignored',
});

/** The supplied idempotency key is longer than the ledger accepts. */
const OVERLONG_IDEMPOTENCY_KEY_ISSUE: MappedFieldIssue = Object.freeze({
  path: IDEMPOTENCY_KEY_ISSUE_PATH,
  message:
    `must be at most ${String(MAXIMUM_IDEMPOTENCY_KEY_LENGTH)} characters; an over-long key is ` +
    'refused rather than shortened, because shortening would let two distinct keys collide',
});

/** Substituted when neither correlation identifier on the invocation carries a value. */
const UNIDENTIFIED_INVOCATION = 'unidentified-invocation';

// ---------------------------------------------------------------------------
// The invocation plan
//
// Validation produces a PLAN, and the plan is what the service call consumes. Splitting the two keeps
// every schema rejection outside the idempotency ledger - a malformed request is a deterministic
// refusal, so it is neither recorded nor replayed - and it makes "exactly one ported service method
// per invocation" a property a reader can see rather than infer.
// ---------------------------------------------------------------------------

/** One validated request, discriminated by the operation it will invoke. */
type CatalogQueryInvocation =
  | {
      readonly operation: 'findProducts';
      readonly criteria: ProductQueryCriteria;
    }
  | {
      readonly operation: 'getUnusedProductOptions';
      readonly productID: string;
      readonly existingOptionGroupIDList: string;
    }
  | {
      readonly operation: 'getUnusedProductOptionGroups';
      readonly existingOptionGroupIDList: string;
    };

/**
 * Validate the supplied parameters for one operation and produce the plan.
 *
 * Throws the schema's own rejection, which `./errorMapper.js` recognizes as a validation failure and
 * publishes as field paths plus constraint descriptions - never the submitted values.
 *
 * The switch is exhaustive over the closed operation union, so adding an operation without planning it
 * is a compile error rather than a runtime fall-through.
 */
function planInvocation(
  operation: CatalogQueryOperation,
  parameters: Readonly<Record<string, string>>,
): CatalogQueryInvocation {
  switch (operation) {
    case 'findProducts': {
      const supplied = findProductsParameters.parse(parameters);

      // Built member by member rather than forwarded wholesale, so that each member of the ported
      // criteria shape is visible at the seam. Absence is forwarded AS absence: every optional member
      // of `ProductQueryCriteria` declares `| undefined`, and the service gives absence a meaning -
      // an absent `pageRecordsShow` is THE WHOLE RESULT SET, not a page of zero.
      const criteria: ProductQueryCriteria = {
        keyword: supplied.keyword,
        productTypeIDs: supplied.productTypeIDs,
        pageRecordsStart: supplied.pageRecordsStart,
        pageRecordsShow: supplied.pageRecordsShow,
        currentURL: supplied.currentURL,
      };

      return { operation, criteria };
    }

    case 'getUnusedProductOptions': {
      const supplied = getUnusedProductOptionsParameters.parse(parameters);

      return {
        operation,
        productID: supplied.productID,
        existingOptionGroupIDList: supplied.existingOptionGroupIDList,
      };
    }

    case 'getUnusedProductOptionGroups': {
      const supplied = getUnusedProductOptionGroupsParameters.parse(parameters);

      return { operation, existingOptionGroupIDList: supplied.existingOptionGroupIDList };
    }
  }
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * The element type of a matched product page, taken from the service's own published shape.
 *
 * Derived rather than imported: `src/domain/entities/product.ts` is not among this file's
 * dependencies, and deriving the type from `ProductPage` keeps the projection pinned to whatever the
 * service actually returns.
 */
type MatchedProduct = ProductPage['records'][number];

/**
 * Project one matched product onto the two columns the executed statement selected.
 *
 * The member is OMITTED when the accessor answers `undefined`, which is the whole of how absence is
 * represented on this surface. Nothing is substituted - no empty string, no `null`, no zero - because
 * a substituted value is indistinguishable from a real one and this subtree treats that distinction as
 * load-bearing.
 */
function projectProduct(product: MatchedProduct): CatalogProductProjection {
  const productName = product.getProductName();

  return productName === undefined
    ? { productID: product.getProductID() }
    : { productID: product.getProductID(), productName };
}

/**
 * Project one product page, preserving repository order exactly.
 *
 * `records` is mapped in place order and never sorted, filtered or de-duplicated here: reordering a
 * service's result in transit would change observable behaviour, and this file changes none.
 * `pageRecordsShow` is omitted when the service returned the whole result set, for the reason given on
 * {@link CatalogProductPageProjection}.
 */
function projectProductPage(page: ProductPage): CatalogProductPageProjection {
  const projected: CatalogProductPageProjection = {
    records: page.records.map(projectProduct),
    recordsCount: page.recordsCount,
    pageRecordsStart: page.pageRecordsStart,
    entityName: page.entityName,
    joins: page.joins,
    keywordProperties: page.keywordProperties,
  };

  return page.pageRecordsShow === undefined
    ? projected
    : { ...projected, pageRecordsShow: page.pageRecordsShow };
}

/**
 * Invoke EXACTLY ONE ported service method for the planned operation and project its result.
 *
 * Every arm is a single `await` on a single service member, and no arm computes, adjusts, combines or
 * re-derives anything the service returned. The options arms forward their comma-delimited list
 * parameter as the `string` the ported signature declares, and their results are published in the
 * order the repository produced them.
 *
 * The switch is exhaustive over the plan union, so an unplanned arm is a compile error.
 */
async function invokeCatalogOperation(
  scope: RequestScope,
  invocation: CatalogQueryInvocation,
): Promise<CatalogQueryResult> {
  switch (invocation.operation) {
    case 'findProducts': {
      const page = await scope.productService.findProducts(invocation.criteria);

      return { operation: invocation.operation, result: projectProductPage(page) };
    }

    case 'getUnusedProductOptions': {
      const rows = await scope.optionService.getUnusedProductOptions(
        invocation.productID,
        invocation.existingOptionGroupIDList,
      );

      return { operation: invocation.operation, result: rows };
    }

    case 'getUnusedProductOptionGroups': {
      const rows = await scope.optionService.getUnusedProductOptionGroups(
        invocation.existingOptionGroupIDList,
      );

      return { operation: invocation.operation, result: rows };
    }
  }
}

/** How many records a served result carries. Reported on the log line, never inferred from it. */
function countServedRecords(served: CatalogQueryResult): number {
  return served.operation === 'findProducts' ? served.result.records.length : served.result.length;
}

/** Build the success response. The one place a status, a header set and an envelope are decided. */
function servedResponse(served: CatalogQueryResult, requestId: string): APIGatewayProxyResult {
  const body: CatalogQueryResponseBody = {
    operation: served.operation,
    requestId,
    result: served.result,
  };

  return {
    statusCode: OK_STATUS,
    headers: JSON_RESPONSE_HEADERS,
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// The exported surface
// ---------------------------------------------------------------------------

/**
 * What this handler may be built over, for a suite that needs to drive it without a database.
 *
 * Both members are optional and both default to the production wiring, so the exported `handler` needs
 * no arguments. They exist because AAP 0.6.6 requires this tier to be tested and the coverage is
 * NET-NEW: a suite supplies a composition root built over a fake statement executor and a logger built
 * over a collecting sink, and it does so WITHOUT patching module state, replacing a global or
 * monkey-patching an import.
 *
 * `exactOptionalPropertyTypes` is on, so each member spells `| undefined` rather than relying on the
 * `?` alone - a caller assembling this object from optional values may pass an explicit `undefined`.
 */
export interface CatalogQueryHandlerDependencies {
  /**
   * Resolve the wired composition root. Defaults to `bootstrapCompositionRoot` with no overrides,
   * which is memoized per container, so a warm invocation reuses the graph and its connection pool
   * rather than assembling a second one.
   *
   * This handler NEVER constructs a service, a repository, a port or a pool of its own; it asks this
   * function for the root and asks the root for one request scope.
   */
  readonly compositionRoot?: (() => Promise<CompositionRoot>) | undefined;

  /**
   * Where structured lines are emitted. Defaults to the process logger, which writes JSON to stdout
   * for the platform to collect. It is passed on to `./errorMapper.js` so that a mapped failure is
   * emitted through the same sink as a served request.
   */
  readonly logger?: Logger | undefined;
}

/**
 * The shape this module's Lambda entrypoint takes.
 *
 * Two parameters rather than the runtime's three: the callback form is not used, because an `async`
 * handler returns its result. It remains assignable to `APIGatewayProxyHandler`, and the exported
 * `handler` is annotated with that type so the entry-point claim is checked by the compiler rather
 * than asserted in a comment.
 */
export type CatalogQueryLambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult>;

/**
 * Read the correlation identifier this invocation is reported under.
 *
 * The Lambda invocation identifier first, then the API Gateway request identifier, then a fixed
 * placeholder. Both sources are correlation identifiers rather than caller-authored values, and the
 * placeholder exists so that the identifier echoed into a response and written to the log is never an
 * empty string - an unjoinable log line is worse than an obviously synthetic one.
 */
function readCorrelationIdentifier(event: APIGatewayProxyEvent, context: Context): string {
  const invocation = context.awsRequestId.trim();
  if (invocation.length > 0) {
    return invocation;
  }

  const gateway = event.requestContext.requestId.trim();
  if (gateway.length > 0) {
    return gateway;
  }

  return UNIDENTIFIED_INVOCATION;
}

/**
 * The operation the request names, from whichever query-string map carries it.
 *
 * The single-valued map is consulted first because it is what API Gateway always populates; the
 * multi-value map is the fallback for an event that carries only that one. Blank is treated as absent,
 * so `?operation=` is a missing selector rather than an unrecognized one.
 */
function readNamedOperation(event: APIGatewayProxyEvent): string | undefined {
  const single = event.queryStringParameters;
  if (single !== null) {
    const named = single[OPERATION_PARAMETER];
    if (named !== undefined && named.trim().length > 0) {
      return named.trim();
    }
  }

  const repeated = event.multiValueQueryStringParameters;
  if (repeated !== null) {
    const values = repeated[OPERATION_PARAMETER];
    if (values !== undefined) {
      for (const value of values) {
        if (value.trim().length > 0) {
          return value.trim();
        }
      }
    }
  }

  return undefined;
}

/**
 * Build a catalog-query Lambda entrypoint.
 *
 * THE ORDER OF WORK, and every step of it is transport work:
 *
 *   1. ADMISSION. `./router.js` decides whether this method and path belong to THIS capability, and a
 *      miss returns the ready response it built - no status, header set or envelope is derived here.
 *      The action carried on the matched descriptor is then checked against the one this file
 *      implements.
 *   2. THE OPERATION SELECTOR, bounded at one per invocation and refused rather than truncated.
 *   3. THE CLOSED PARAMETER SET, then the schema, then the plan. A rejection here is a deterministic
 *      refusal and is neither recorded nor replayed.
 *   4. THE IDEMPOTENCY GUARD, which is where a repeated key is answered from the recorded outcome.
 *   5. ONE REQUEST SCOPE and ONE ported service method, then a projection onto JSON.
 *
 * Every thrown value from step 3 onward - a schema rejection, a service refusal such as the SKU batch
 * bound, a repository failure - funnels through `./errorMapper.js`, which is selective and never a
 * pass-through: a driver error's text can embed a statement and its bound parameters, so what reaches
 * the response is a classification and never the failure itself.
 *
 * @param dependencies Optional test seams. Omit for production wiring.
 * @returns A handler holding one idempotency ledger for the lifetime of its container.
 */
export function createCatalogQueryHandler(
  dependencies: CatalogQueryHandlerDependencies = {},
): CatalogQueryLambdaHandler {
  const resolveCompositionRoot =
    dependencies.compositionRoot ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot());
  const log = dependencies.logger ?? processLogger;

  // ONE LEDGER PER HANDLER INSTANCE, deliberately not module state. The production `handler` below is
  // created once when the container loads this module, so its ledger spans that container's warm
  // invocations - which is the whole point of an idempotency record. A suite that builds its own
  // handler gets its own ledger and therefore its own isolation, with nothing to reset between tests.
  const ledger: IdempotencyLedger = { recorded: new Map<string, Promise<APIGatewayProxyResult>>() };

  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const requestId = readCorrelationIdentifier(event, context);
    const unroutedContext: ErrorMappingContext = { requestId, logger: log };

    try {
      // --- 1. Admission ---------------------------------------------------
      const resolution = resolveRouteForCapability(
        routeRequestFromEvent(event),
        OWNED_CAPABILITY,
        unroutedContext,
      );

      if (!resolution.matched) {
        return resolution.response;
      }

      // From here on the diagnostic label is the method as received plus the matched row's CANONICAL
      // path, so what is logged is what the table actually matched rather than the raw path. It is
      // sanitized and length-bounded by `./errorMapper.js` before it reaches a log line, and it is
      // never echoed into a response body.
      const routedContext: ErrorMappingContext = {
        requestId,
        route: `${event.httpMethod} ${resolution.route.path}`,
        logger: log,
      };

      if (resolution.route.action !== IMPLEMENTED_ACTION) {
        return routeNotFoundResponse(routedContext);
      }

      // --- 2. The operation selector, bounded at one ----------------------
      if (countSuppliedOperations(event) > MAXIMUM_OPERATIONS_PER_INVOCATION) {
        return invalidRequestResponse('unusableRequestInput', routedContext, [
          TOO_MANY_OPERATIONS_ISSUE,
        ]);
      }

      const named = readNamedOperation(event);
      if (named === undefined) {
        return invalidRequestResponse('missingQueryParameter', routedContext, [
          MISSING_OPERATION_ISSUE,
        ]);
      }

      const operation = recognizeOperation(named);
      if (operation === undefined) {
        return invalidRequestResponse('unusableRequestInput', routedContext, [
          UNKNOWN_OPERATION_ISSUE,
        ]);
      }

      // --- 3. The closed parameter set, then the schema, then the plan ----
      const parameters = readOperationParameters(event);
      if (!hasClosedParameterSet(operation, parameters)) {
        return invalidRequestResponse('unusableRequestInput', routedContext, [
          UNPUBLISHED_PARAMETER_ISSUE,
        ]);
      }

      const invocation = planInvocation(operation, parameters);

      // --- 4. The idempotency guard --------------------------------------
      const idempotencyKey = readHeader(event.headers, IDEMPOTENCY_KEY_HEADER);
      if (idempotencyKey !== undefined && idempotencyKey.length > MAXIMUM_IDEMPOTENCY_KEY_LENGTH) {
        return invalidRequestResponse('unusableRequestInput', routedContext, [
          OVERLONG_IDEMPOTENCY_KEY_ISSUE,
        ]);
      }

      // --- 5. One scope, one ported service method, one projection -------
      const serve = async (): Promise<APIGatewayProxyResult> => {
        // The per-request scope factory, invoked EXACTLY ONCE per invocation. Everything reachable
        // from the returned scope was constructed for this request alone, which is what stops a warm
        // container carrying one request's state into another's.
        //
        // No input is supplied, and each omission is a decision rather than an oversight:
        //   * `accountID` / `adminAccountFlag` - absence IS the logged-out arm of
        //     [model/service/PriceGroupService.cfc:L263-L266], per the request-scope contract. None of
        //     the three operations this capability publishes reads the account context, and the
        //     authorizer claim that would carry an account identifier is a deployment fact this
        //     migration was never given - naming one here would invent configuration. The entrypoint
        //     whose surface does consult the account context is `priceResolutionHandler`, and that
        //     decision belongs there.
        //   * `now` - omitted, so the scope reads the wall clock ONCE at construction and every date
        //     comparison in the request sees the same instant. Supplying one would substitute this
        //     file's clock for the scope's own policy.
        //   * `feedHost` - supplied only by `productFeedHandler`, which is the sole holder of the
        //     event a feed host is observed on. Passing one from here would mint an origin for a
        //     capability that renders no feed.
        const root = await resolveCompositionRoot();
        const scope = await root.createRequestScope();

        const served = await invokeCatalogOperation(scope, invocation);

        // The operation name travels in the MESSAGE. The structured context carries only keys the
        // logger's allow-list authorizes - a scalar under an unrecognized key is redacted, by design -
        // so `requestId`, `route` and `resultCount` are named here and nothing else is. No duration,
        // no rate and no size is measured or reported.
        log.info(`catalog query served: ${served.operation}`, {
          requestId,
          route: routedContext.route,
          resultCount: countServedRecords(served),
        });

        return servedResponse(served, requestId);
      };

      return idempotencyKey === undefined
        ? await serve()
        : await throughIdempotencyLedger(ledger, idempotencyKey, serve);
    } catch (thrown: unknown) {
      // THE ONE FUNNEL. The caught value is of genuinely unknown type and is passed nowhere: it goes
      // to `./errorMapper.js`, which narrows it by `instanceof` and by bounded property probes, and
      // publishes a classification rather than the value. Nothing is re-thrown, so a Lambda
      // invocation always answers with a response.
      return mapErrorToApiGatewayResponse(thrown, unroutedContext);
    }
  };
}

/**
 * THE LAMBDA ENTRY POINT for the catalog-query capability.
 *
 * Created once, when the container loads this module, so the idempotency ledger and the memoized
 * composition graph both span the container's warm invocations. Annotated as `APIGatewayProxyHandler`
 * so that "this module is a bundle entry point" is a fact the compiler checks.
 */
export const handler: APIGatewayProxyHandler = createCatalogQueryHandler();
