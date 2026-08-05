// ---------------------------------------------------------------------------
// The catalog-query Lambda entrypoint.
//
// A THIN PRIMARY ADAPTER over three already-ported service methods. It parses the API Gateway
// event, lets `./router.js` decide whether the request belongs to this capability, resolves which
// ONE method the request names, opens exactly one per-request scope from `./bootstrap.js`, invokes
// that method, projects the result onto JSON, and funnels every thrown value through
// `./errorMapper.js`.
//
// One route, `queryCatalog`, and exactly three operations. Method names are carried over verbatim in
// CFML camelCase because method-level interface parity is this migration's acceptance contract:
//
//   findProducts                  -> ProductService.findProducts
//                                    [model/service/ProductService.cfc:L342]
//   getUnusedProductOptions       -> OptionService.getUnusedProductOptions
//                                    [model/service/OptionService.cfc:L72]
//   getUnusedProductOptionGroups  -> OptionService.getUnusedProductOptionGroups
//                                    [model/service/OptionService.cfc:L76]
//
// `findProducts` is the already-allocated replacement for `getProductSmartList`
// [model/service/ProductService.cfc:L342-L358]; that rename belongs to the services tier and is
// consumed here. The framework's generic, string-keyed, dynamically-filtered smart list is NOT
// reopened: what a caller may send is the closed, typed `ProductQueryCriteria` shape, and anything
// else is refused rather than ignored.
//
// NO BUSINESS LOGIC LIVES HERE. No price or discount arithmetic, no `Money` value, no SQL, no entity
// construction, no setting resolution, no option-combination building and no URL-title generation.
// It constructs no service, no repository, no port and no connection pool either - `./bootstrap.js`
// is the only composition root in this subtree.
//
// SCOPE EXCLUSIONS, so that "this handler does not publish X" is auditable rather than inferred:
//
//   * Out of scope by AAP 0.9.5 - `processProduct_addProductReview`
//     [model/service/ProductService.cfc:L157], `processProduct_addSubscriptionTerm` [:L173],
//     `processProduct_uploadDefaultImage` [:L235], the subscription and content-access SKU branches
//     [model/service/SkuService.cfc:L139-L202], and `loadDataFromFile` [:L65-L68], whose legacy body
//     opens by raising the CFML request timeout to 3600 seconds - a budget no Lambda invocation has,
//     since the runtime's maximum invocation duration is 15 minutes. No job queue, state machine or
//     chunked-upload protocol is invented in its place, because the source had none.
//   * Owned by another capability - `getProductSkusBySelectedOptions`
//     [model/service/ProductService.cfc:L104] and its AND-of-EXISTS matching
//     [model/dao/SkuDAO.cfc:L107-L128] belong to `./skuResolutionHandler.js`.
//   * Unreachable at this tier - `RequestScope` publishes no entity and no entity loader, so every
//     service member whose first parameter is an entity has no admissible argument here:
//     `getFormattedOptionGroups` [model/service/ProductService.cfc:L70],
//     `processProduct_addOptionGroup` [:L113], `processProduct_addOption` [:L128],
//     `processProduct_deleteDefaultImage` [:L198], `processProduct_updateDefaultImageFileNames`
//     [:L208], `processProduct_updateSkus` [:L216], `saveProduct` [:L264], `saveProductType`
//     [:L294], `deleteProduct` [:L317], `getOptionsForSelect`
//     [model/service/OptionService.cfc:L55] and `saveBrand` [model/service/BrandService.cfc:L67].
//     Constructing an entity is not a transport concern; the repository owns hydration.
//   * Not this service's to publish - nothing from `OrderService`, checkout, cart, payment,
//     shipping, fulfillment, account, subscription, vendor or tax; nothing from the Taffy REST layer
//     under `frontend/api/`; no Mura CMS bridge; no integration adapter; and nothing from
//     `org/Hibachi/**`, which is a boundary to extract from and never to modify.
//
// `saveBrand` is why this capability publishes no brand operation at all rather than merely no brand
// write: it is the only method the legacy component declares
// [model/service/BrandService.cfc:L49-L89], every brand read having arrived by inheritance from the
// framework base, which is deliberately not ported. There is no brand query method in existence to
// expose.
//
// WHAT REACHES A RESPONSE BODY. An entity is never serialized: the ported entities hold injected
// collaborators, so handing one to `JSON.stringify` would walk from a product into a repository.
// Every response is an explicit projection over published accessors, and the product projection
// publishes exactly the two columns the executed statement selects, `productID` and `productName`
// [model/dao/ProductDAO.cfc:L421]. Absence survives as absence - an absent value is represented by
// the member being OMITTED, never by `0`, `''` or `null`, the same discipline that keeps
// `getPriceByCurrencyCode` [model/entity/Sku.cfc:L269-L273] from silently selling products for free.
//
// `./errorMapper.js` owns the closed failure vocabulary. This authenticated route reaches 400 for
// unusable input, 401 for an unidentified caller, 404 for an unmatched route and 500 for a
// server-shaped failure. It has no administrative operation and therefore emits no 403; it also
// invents no conflict, semantic-validation or request-quota status and no retry-after, rate-limit,
// challenge or circuit-breaker header.
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
// REQUEST-SHAPE SAFETY FOR THIS READ-ONLY ENTRYPOINT
//
// The grammar admits exactly one operation per invocation. `findProducts` additionally requires a
// bounded page size, and every caller-expanded comma list is refused before wiring if the complete
// prepared statement would exceed MySQL's protocol placeholder ceiling. Each refusal is whole:
// nothing is silently truncated, reordered or deduplicated.
//
// All three published operations are reads. Re-running one writes nothing, so no response replay
// ledger, mutation idempotency mechanism or compensation protocol belongs in this adapter. The
// mutating Product/SKU service methods remain outside the routed surface.
//
// LEGACY-DEFECT [model/service/ProductService.cfc:L220]: the repricing loop declares its counter as
// `for(i=1; i <= arrayLen(skus); i++)` with no `var`, so it leaks into the component variables scope.
// Preserved deliberately; do not fix without a product decision.
//
// The leak belongs to `src/services/productService.ts`, where block scoping already makes it
// unreproducible, and nothing in this file attempts to repair it.
//
// The `cfthread`-to-`worker_threads` translation rule is UNEXERCISED - a sweep of the in-scope slice
// finds zero `cfthread` usages - and the legacy runtime's three lock timeouts are noted in the plan
// and deliberately not implemented.
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

import { listToArray } from '../lib/cfml/list.js';
import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';
import type { OptionService } from '../services/optionService.js';
import type { ProductPage, ProductQueryCriteria } from '../services/productService.js';
import type { CompositionRoot, RequestScope } from './bootstrap.js';
import { bootstrapCompositionRoot } from './bootstrap.js';
import {
  MAX_PLACEHOLDER_COUNT,
  isPreparablePlaceholderCount,
} from '../repositories/mysql/connection.js';
import type { ErrorMappingContext, MappedFieldIssue } from './errorMapper.js';
import {
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  resolveServerRequestId,
  routeDiagnosticLabel,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import { resolveRequestPrincipal } from './requestPrincipal.js';
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
 * The payload this capability places in the shared success envelope's `result` member.
 *
 * ★★ THE ENVELOPE ITSELF IS NO LONGER DECLARED HERE, AND THAT IS FINDING F13's FIX. This file used
 * to export a `CatalogQueryResponseBody` of `{operation, requestId, result}`, on the reasoning that
 * "matching the failure envelope means a caller parses one document shape instead of two". The
 * reasoning was right and the execution was local: API review found all four JSON entrypoints had
 * each derived their OWN envelope, two of them without a correlation identifier at all, so a caller
 * parsed four shapes rather than one. The envelope is now `SuccessResponseBody` in
 * `./errorMapper.js` - `{requestId, capability, action, result}` - built by `jsonSuccessResponse`,
 * which also owns the header set. `operation` travels INSIDE this payload, because it is a
 * capability-specific selector rather than part of the cross-handler contract.
 */
export interface CatalogQueryResultDocument {
  /** The operation that produced `result`. */
  readonly operation: CatalogQueryOperation;

  /** The projected payload. */
  readonly result: CatalogProductPageProjection | readonly CatalogSelectOptionProjection[];
}

// ---------------------------------------------------------------------------
// Response construction
// ---------------------------------------------------------------------------

// ★ THE LOCAL HEADER SET AND SUCCESS STATUS THAT USED TO SIT HERE ARE GONE. Both were duplicates
// of `./errorMapper.js`'s, which is now the single construction path for a successful response as
// well as a failed one (finding F13). Duplicating them was how the four JSON entrypoints came to
// disagree about what a success looks like.

// ---------------------------------------------------------------------------
// The bound on the work one invocation may request
// ---------------------------------------------------------------------------

/**
 * How many operations one invocation may name.
 *
 * ONE. A request carrying the operation parameter twice is REFUSED, not truncated to the first and
 * not answered twice, so a caller cannot ask one invocation to answer for several. The bounds that
 * govern the ported services' own loops stay where they belong - on the two service constructors,
 * supplied by the composition root - and no parameter this file forwards can raise either.
 *
 * JUDGMENT CALL: the count is a target-chosen SAFETY bound. It is not a target, not a quota, not a
 * rate and not a capacity figure, and it carries no time dimension of any kind.
 */
const MAXIMUM_OPERATIONS_PER_INVOCATION = 1;

// ---------------------------------------------------------------------------
// Duplicate-request replay
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ★★★ THE IDEMPOTENCY LEDGER THAT USED TO SIT HERE IS GONE, AND ITS ABSENCE IS THE FIX.
//
// This block declared an `idempotency-key` header, a 256-character key bound, a 256-entry
// per-container ledger of completed responses, `throughIdempotencyLedger` and
// `evictOldestRecordedOutcomes`. Security and API review (finding F5, CWE-400 / cache
// confusion) established three defects in it, and they share one cause:
//
//   THE LEDGER WAS KEYED ON THE RAW CALLER KEY AND NOTHING ELSE - no operation, no
//   parameters, no caller identity, no request digest. So a caller reusing one key for a
//   DIFFERENT action received the FIRST action's body, complete with the first request's
//   correlation identifier, and had no way to tell. That is not idempotency; it is a cache
//   answering the wrong question, and the 256-entry bound was a COUNT bound that retained
//   256 COMPLETE RESPONSE BODIES.
//
// ★★ AND THE MECHANISM WAS NEVER NEEDED ON THIS ENDPOINT. The route is
// `GET /catalog/products` and all three operations it publishes are READS -
// `findProducts`, `getUnusedProductOptions`, `getUnusedProductOptionGroups`. A read
// performs no durable write, so re-running it cannot double-write anything: the endpoint
// is idempotent by construction, and re-executing a retry is not merely safe but strictly
// more correct than replaying a stale body. AAP 0.6.5's idempotency obligation is stated
// for BULK MUTATION paths, and this capability exposes none - the non-exposure record above
// lists the mutating product operations it deliberately does not publish.
//
// THE ALTERNATIVE WAS CONSIDERED AND REJECTED. Review offered a second remedy: a durable
// record keyed by caller plus canonical request digest, with key/digest mismatch refusal
// and TTL and byte bounds. That means a new durable store, which is infrastructure this
// migration excludes outright (AAP 0.2.2), for a read path that gains nothing from it.
// Removal is the honest answer, and it removes the retained bodies with it.
//
// WHAT REPLACES IT FOR A RETRY: the request runs again. Nothing is recorded, nothing is
// evicted, and every response carries THIS invocation's own correlation identifier.
//
// The request grammar and transport bounds above continue to constrain each invocation; none of
// them is presented as mutation infrastructure for this read-only route.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reading the request
//
// Every lookup into a header, query or path map yields `T | undefined` under
// `noUncheckedIndexedAccess`, and every one of them is handled explicitly below. There is no non-null
// assertion and no cast anywhere in this file.
// ---------------------------------------------------------------------------

// ★ THE HEADER READER THAT USED TO SIT HERE IS GONE WITH ITS ONE CONSUMER. It existed to read the
// `idempotency-key` header case-insensitively; finding F5 withdrew that mechanism, and this handler
// now reads no header at all. Nothing in the three published operations is carried on one.

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
    defineOwnParameter(parameters, name, value);
  }

  return parameters;
}

/**
 * Define one query parameter as an enumerable own property.
 *
 * Assignment is not equivalent for the reserved name `__proto__`: on an ordinary object it reaches
 * the inherited setter instead of creating a key, which would let that caller-authored name disappear
 * before the closed-parameter check. Defining the property explicitly keeps every supplied name visible
 * to `Object.keys` and therefore subject to the same refusal.
 */
function defineOwnParameter(target: Record<string, string>, name: string, value: string): void {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
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
  .transform((value: string): number => Number.parseInt(value, 10))
  .refine((value: number): boolean => Number.isSafeInteger(value), {
    message: 'must not exceed the largest integer this runtime can represent exactly',
  });

/**
 * How many records one routed `findProducts` request may ask for.
 *
 * ★★★ A BOUND ON THE ROUTED CONTRACT, AND DELIBERATELY NOT ON THE SERVICE. Static-performance review
 * (finding F10) established that omitting `pageRecordsShow` means THE WHOLE PRODUCT RESULT SET
 * [src/services/productService.ts, the paging block of `findProducts`], which this handler then
 * projects and `JSON.stringify`s into one response body. `ProductService` is right to define absence
 * that way - the legacy declared no page size at that call site and inventing one would silently
 * truncate a caller's results - so the bound belongs to the LAMBDA SURFACE, which is a different
 * caller with a different contract, and NOT to the service. Nothing about
 * `ProductService.findProducts` changes, and no other consumer of it is truncated.
 *
 * THE ROUTED CONTRACT THEREFORE REQUIRES A PAGE SIZE rather than defaulting one. A default would be
 * this file choosing how many records a caller wanted; requiring it makes the caller say, and makes
 * "the whole result set" unexpressible through this route rather than merely discouraged.
 *
 * A SAFETY BOUND ON ALLOCATION, stated as one. It bounds how large a single response document this
 * process will build; it is not a target, a quota, a rate, a page-per-second figure or a capacity
 * claim, and it carries no time dimension of any kind. Zero is admitted, because a caller asking for
 * a count is asking a legitimate question and `recordsCount` answers it without any records.
 */
const MAXIMUM_PAGE_RECORDS = 500;

/**
 * A page size: a non-negative integer, required, and at most {@link MAXIMUM_PAGE_RECORDS}.
 *
 * Refused rather than clamped. Clamping would answer a different question than the one asked and
 * would tell the caller nothing, which is the same reason an over-long list is refused whole rather
 * than shortened.
 */
const boundedPageSizeParameter = nonNegativeIntegerParameter.refine(
  (value: number): boolean => value <= MAXIMUM_PAGE_RECORDS,
  { message: `must be at most ${String(MAXIMUM_PAGE_RECORDS)} records for one routed request` },
);

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
  pageRecordsShow: boundedPageSizeParameter,
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
 * The first admitted comma-list too wide for a preparable statement, or nothing.
 *
 * ★★★ THE HANDLER HALF OF FINDING F17, AND ITS WHOLE VALUE IS THE STATUS IT PRODUCES. Two of this
 * capability's three operations forward a comma-delimited identifier list that becomes one SQL
 * placeholder PER ELEMENT - `existingOptionGroupIDList` at [model/dao/OptionDAO.cfc:L68, L107] - and
 * `findProducts` forwards a third, `productTypeIDs`, at [model/dao/ProductDAO.cfc:L423]. The adapters
 * now refuse a list above the protocol's own placeholder ceiling, but a refusal raised down there is
 * an unrecognized throw that `./errorMapper.js` reduces to a generic 500. Asked HERE, the same
 * refusal is a client-shaped 400 carrying the offending parameter's name.
 *
 * IT IS A COUNT TEST AND NOTHING ELSE. The list is parsed the way the adapter parses it - CFML list
 * semantics, so empty elements are dropped - and its placeholder count is combined with the
 * statement's other binds: the required keyword for `findProducts`, the trailing product identifier
 * for `getUnusedProductOptions`, and none for `getUnusedProductOptionGroups`. The two option
 * operations also reproduce their adapter's one-empty-string bind when the parsed list is empty.
 * No element is trimmed, sorted, deduplicated, case-folded, reordered or dropped to fit, because
 * each of those changes which rows the statement matches. Every complete statement that IS
 * preparable is forwarded byte for byte, exactly as before.
 *
 * THE BOUND IS THE PROTOCOL'S OWN. `COM_STMT_PREPARE_OK` reports a prepared statement's placeholder
 * count in a two-byte field, so a list above the ceiling could not be prepared by the server however
 * it was sent: nothing the legacy could have answered is refused, and no throughput, capacity or
 * latency figure is involved.
 *
 * @returns the field-level issue to publish, or `undefined` when every list is preparable.
 */
function firstUnpreparableCommaList(
  invocation: CatalogQueryInvocation,
): MappedFieldIssue | undefined {
  const lists: readonly (readonly [
    parameterName: string,
    value: string | undefined,
    additionalPlaceholderCount: number,
    emptyListBindsOne: boolean,
  ])[] =
    invocation.operation === 'findProducts'
      ? [['productTypeIDs', invocation.criteria.productTypeIDs, 1, false]]
      : invocation.operation === 'getUnusedProductOptions'
        ? [['existingOptionGroupIDList', invocation.existingOptionGroupIDList, 1, true]]
        : [['existingOptionGroupIDList', invocation.existingOptionGroupIDList, 0, true]];

  for (const [parameterName, value, additionalPlaceholderCount, emptyListBindsOne] of lists) {
    if (value === undefined) {
      continue;
    }

    const elementCount = listToArray(value).length;
    const listPlaceholderCount = emptyListBindsOne ? Math.max(1, elementCount) : elementCount;
    const placeholderCount = listPlaceholderCount + additionalPlaceholderCount;

    if (!isPreparablePlaceholderCount(placeholderCount)) {
      const maximumListElements = MAX_PLACEHOLDER_COUNT - additionalPlaceholderCount;

      return Object.freeze({
        path: parameterName,
        message:
          `must name at most ${String(maximumListElements)} identifiers for this operation, which ` +
          'with the statement’s other bound values is the most MySQL can prepare; a longer list is ' +
          'refused whole rather than shortened, because dropping an element would change which ' +
          'records match',
      });
    }
  }

  return undefined;
}

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
      // of `ProductQueryCriteria` declares `| undefined`, and the service gives absence a meaning.
      //
      // ★ `pageRecordsShow` IS THE ONE MEMBER THIS SURFACE WILL NOT LEAVE ABSENT. Absent means THE
      // WHOLE RESULT SET to the service, which is correct for a service caller and is a whole-catalog
      // buffer for an HTTP one, so the routed contract requires it (finding F10). It is always
      // present here and always at or below {@link MAXIMUM_PAGE_RECORDS}.
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

/**
 * Build the success response THROUGH THE SHARED ENVELOPE.
 *
 * The status, the header set and the envelope shape are all `./errorMapper.js`'s now - the same
 * module that decides them for a failure - so this function's whole remaining job is to name the
 * capability, the action and the payload. See {@link CatalogQueryResultDocument} for why `operation`
 * sits inside the payload rather than beside it.
 */
function servedResponse(served: CatalogQueryResult, requestId: string): APIGatewayProxyResult {
  const document: CatalogQueryResultDocument = {
    operation: served.operation,
    result: served.result,
  };

  return jsonSuccessResponse(requestId, OWNED_CAPABILITY, IMPLEMENTED_ACTION, document);
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

// ★ THE LOCAL CORRELATION READER THAT USED TO SIT HERE IS GONE. It implemented the
// invocation-then-gateway-then-placeholder precedence for this handler alone, and observability
// review (finding F8) found the five entrypoints had each implemented their own - one of them the
// other way round. The policy now lives once, in `./errorMapper.js` as `resolveServerRequestId`,
// beside the envelope that echoes it. Its precedence is the one this reader used; only the
// substituted literal differs, and that literal is now `./errorMapper.js`'s to name.

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
 *   4. THE COMMA-LIST FEASIBILITY BOUND, asked at admission so an over-wide identifier list is a 400
 *      naming the offending member rather than the generic 500 an escaped statement-builder throw
 *      would produce (finding F17). No idempotency guard sits at this step any more; the ledger that
 *      used to occupy it was withdrawn under finding F5, for the reasons recorded at its former site.
 *   5. ONE REQUEST SCOPE and ONE ported service method, then a projection onto JSON.
 *
 * Every thrown value from step 3 onward - a schema rejection, a service refusal such as the SKU batch
 * bound, a repository failure - funnels through `./errorMapper.js`, which is selective and never a
 * pass-through: a driver error's text can embed a statement and its bound parameters, so what reaches
 * the response is a classification and never the failure itself.
 *
 * @param dependencies Optional test seams. Omit for production wiring.
 * @returns A handler holding NO per-request state of its own - only the resolved logger and the
 *          memoized composition-root accessor, both of which are read-only for the container's life.
 */
export function createCatalogQueryHandler(
  dependencies: CatalogQueryHandlerDependencies = {},
): CatalogQueryLambdaHandler {
  const resolveCompositionRoot =
    dependencies.compositionRoot ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot());
  const log = dependencies.logger ?? processLogger;

  // ★ NO LEDGER. The per-handler idempotency record that used to be created here is gone with the
  // mechanism it served - see the block where it was declared for why a read-only GET endpoint never
  // needed one and why keying it on the raw caller key alone was a defect (finding F5). Nothing in
  // this factory now holds state that outlives an invocation.

  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const requestId = resolveServerRequestId(event, context);

    // ★★★ ONE MUTABLE CONTEXT, PROMOTED THE MOMENT A ROUTE IS RESOLVED, AND THAT IS FINDING F8's
    // FIX. This used to be two separate constants - an unrouted one built here and a routed one
    // built inside the `try` - and the `catch` at the bottom mapped through the UNROUTED one. So
    // every failure raised AFTER route resolution, which is every service failure this handler can
    // see, reached the log stream with no route on it: the one diagnostic that says which URL
    // surface was being served. The context is now a single binding that GAINS the route and is the
    // same object the catch reads.
    let mappingContext: ErrorMappingContext = { requestId, logger: log };

    try {
      // --- 1. Admission ---------------------------------------------------
      const resolution = resolveRouteForCapability(
        routeRequestFromEvent(event),
        OWNED_CAPABILITY,
        mappingContext,
      );

      if (!resolution.matched) {
        return resolution.response;
      }

      // From here on the diagnostic label is built ENTIRELY from the matched row's own frozen members
      // - its declared methods and its canonical path - and from NOTHING the caller sent. That
      // distinction is the reason `routeDiagnosticLabel` documents itself as safe to log: the router
      // matches the method with `listFindNoCase`, so `event.httpMethod` may differ from the table's
      // declaration in case and would put a caller-controlled string on the log line for no
      // diagnostic gain. Using the row instead means the label is one of a CLOSED set of five, so an
      // operator can group by it and a caller cannot influence it. It reaches the log stream only and
      // is never echoed into a response body; the shared helper is what makes all five entrypoints
      // label a route identically.
      mappingContext = {
        requestId,
        route: routeDiagnosticLabel(resolution.route.methods, resolution.route.path),
        logger: log,
      };

      if (resolution.route.action !== IMPLEMENTED_ACTION) {
        return routeNotFoundResponse(mappingContext);
      }

      // ★★ THE ADMISSION GATE. This route once served every anonymous request, and security review
      // recorded the exposure as CRITICAL (CWE-306/CWE-862) together with the consequence it enabled
      // (HIGH, CWE-200): `keyword` is required-but-may-be-empty, so an empty keyword matches every
      // row, while the ported catalog statement intentionally preserves the legacy predicates and
      // carries no `activeFlag`/`publishedFlag` restriction. Inactive and unpublished rows were
      // therefore anonymously enumerable.
      //
      // Authentication closes that enumeration at the route entrance without changing the
      // must-preserve result set. Adding `activeFlag`/`publishedFlag` to
      // [model/dao/ProductDAO.cfc:L420-L427] would be a new catalog filter and AAP 0.6.7 permits no
      // such divergence. The product FEED applies those filters because its own legacy statement
      // does; this catalog query does not.
      //
      // The refusal follows route resolution and precedes the selector, parameter closure, schema
      // and graph construction. An unidentified caller therefore costs no parse, connection or
      // statement, while a path this capability does not own remains a 404 rather than a revealing
      // 401.
      const principalResolution = resolveRequestPrincipal(event);
      if (!principalResolution.identified) {
        // The reason is a closed literal from `requestPrincipal`, carried in the message rather than
        // widening the logger's default-deny context allow-list. No claim name or caller text appears.
        log.warn(`catalog query refused: no caller principal (${principalResolution.reason})`, {
          requestId,
          route: mappingContext.route,
        });

        return unauthenticatedResponse(mappingContext);
      }

      // --- 2. The operation selector, bounded at one ----------------------
      if (countSuppliedOperations(event) > MAXIMUM_OPERATIONS_PER_INVOCATION) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          TOO_MANY_OPERATIONS_ISSUE,
        ]);
      }

      const named = readNamedOperation(event);
      if (named === undefined) {
        return invalidRequestResponse('missingQueryParameter', mappingContext, [
          MISSING_OPERATION_ISSUE,
        ]);
      }

      const operation = recognizeOperation(named);
      if (operation === undefined) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          UNKNOWN_OPERATION_ISSUE,
        ]);
      }

      // --- 3. The closed parameter set, then the schema, then the plan ----
      const parameters = readOperationParameters(event);
      if (!hasClosedParameterSet(operation, parameters)) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          UNPUBLISHED_PARAMETER_ISSUE,
        ]);
      }

      const invocation = planInvocation(operation, parameters);

      // --- 4. The comma-list feasibility bound ---------------------------
      // ★★★ ASKED HERE SO THE ANSWER IS A CLIENT-SHAPED 400 NAMING THE FIELD. Security review
      // (finding F17) established that a caller comma-list becomes one SQL predicate and one
      // placeholder PER ELEMENT. The statement builders now refuse above the protocol's own
      // ceiling - see `isPreparablePlaceholderCount` - but a refusal raised down there arrives
      // as an unrecognized throw and `./errorMapper.js` maps it to a GENERIC 500, which tells a
      // caller its request failed and nothing about why. Asked at admission, the same refusal is
      // a 400 carrying the offending member's path.
      //
      // THE BOUND IS THE PROTOCOL'S, NOT A POLICY: above it MySQL cannot prepare the statement
      // however it is sent, so this rejects nothing the legacy could have answered. No element is
      // trimmed, sorted, deduplicated, case-folded, reordered or dropped to fit.
      const overWideList = firstUnpreparableCommaList(invocation);
      if (overWideList !== undefined) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [overWideList]);
      }

      // --- 5. One scope, one ported service method, one projection -------
      {
        // The per-request scope factory, invoked EXACTLY ONCE per invocation. Everything reachable
        // from the returned scope was constructed for this request alone, which is what stops a warm
        // container carrying one request's state into another's.
        //
        // The authenticated account is carried into the scope even though these three reads do not
        // consult it, so the scope cannot represent a logged-out caller after this route admitted one.
        // The remaining omissions are deliberate:
        //   * `now` - omitted, so the scope reads the wall clock ONCE at construction and every date
        //     comparison in the request sees the same instant. Supplying one would substitute this
        //     file's clock for the scope's own policy.
        //   * `feedHost` - supplied only by `productFeedHandler`, which is the sole holder of the
        //     event a feed host is observed on. Passing one from here would mint an origin for a
        //     capability that renders no feed.
        const root = await resolveCompositionRoot();
        const scope = await root.createRequestScope({
          accountID: principalResolution.principal.accountID,
        });

        const served = await invokeCatalogOperation(scope, invocation);

        // The operation name travels in the MESSAGE. The structured context carries only keys the
        // logger's allow-list authorizes - a scalar under an unrecognized key is redacted, by design -
        // so `requestId`, `route` and `resultCount` are named here and nothing else is. No duration,
        // no rate and no size is measured or reported.
        log.info(`catalog query served: ${served.operation}`, {
          requestId,
          route: mappingContext.route,
          resultCount: countServedRecords(served),
        });

        return servedResponse(served, requestId);
      }
    } catch (thrown: unknown) {
      // THE ONE FUNNEL. The caught value is of genuinely unknown type and is passed nowhere: it goes
      // to `./errorMapper.js`, which narrows it by `instanceof` and by bounded property probes, and
      // publishes a classification rather than the value. Nothing is re-thrown, so a Lambda
      // invocation always answers with a response.
      // ★ THE ROUTED CONTEXT, not an unrouted one. `mappingContext` carries the route from the
      // moment resolution succeeded, so a service failure is logged against the URL surface that
      // was being served rather than against nothing (finding F8).
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/**
 * THE LAMBDA ENTRY POINT for the catalog-query capability.
 *
 * Created once, when the container loads this module, so the memoized composition graph and its
 * connection pool span the container's warm invocations. THAT IS THE ONLY STATE THAT SPANS THEM: no
 * response body, no caller-supplied key and no per-request value is retained between invocations
 * (finding F5). Annotated as `APIGatewayProxyHandler` so that "this module is a bundle entry point" is
 * a fact the compiler checks.
 */
export const handler: APIGatewayProxyHandler = createCatalogQueryHandler();
