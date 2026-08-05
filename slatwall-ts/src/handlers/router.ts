// ---------------------------------------------------------------------------
// The explicit route table for the primary (Lambda) adapters.
//
// Resolve an incoming request onto exactly one of the five bounded capabilities the service
// exposes, and do nothing else. The whole URL surface is declared once, declaratively, in
// `ROUTE_TABLE` below, so it reads in one place instead of being reconstructed from five separate
// handlers. This module owns RESOLUTION; a handler owns INVOCATION. That split keeps the dependency
// direction one-way: a capability handler imports this module and this module imports NONE of them,
// because importing one would create an import cycle across every bundle entry point and defeat
// single-artifact-per-capability bundling.
//
// `ROUTE_TABLE` is frozen data and `resolveRoute` is a pure function over it; neither invokes
// anything. This module is a SHARED INTERNAL of `src/handlers/` and deliberately exports NO Lambda
// `handler`, so it is NOT a bundle entry point: `esbuild.config.mjs` enumerates exactly the five
// capability handlers and pulls this module into whichever of their artifacts import it. Bundling it
// as an entry point of its own would emit an artifact with no `handler` for the runtime to call, so
// the entry-point list deliberately excludes it.
//
// THE FIVE CAPABILITY HANDLER MODULES THAT OWN THESE ROUTES - catalogQueryHandler,
// skuResolutionHandler, promotionApplicationHandler, priceResolutionHandler and productFeedHandler -
// are present in this subtree, as is the composition root `src/handlers/bootstrap.ts` that wires
// them. Each must consult THIS one shared table, which is
// how five independently deployable bundles are held to a single agreed URL surface with no
// overlap.
//
// PROVENANCE: REFERENCE, BEHAVIOUR ONLY - no code is copied and `Application.cfc` is never
// modified. AAP transformation rule T5 records this row as an explicit route table replacing FW/1
// subsystem convention routing. The legacy hook is `getSubsystemDirPrefix()` at
// [Application.cfc:L126-L137], whose own comment at [Application.cfc:L128] reads "Allows for
// integration services to have a seperate directory structure" - quoted verbatim, spelling
// included, because a source quotation is evidence. That hook is the SOLE reason the `google`
// subsystem was routable at all: any subsystem name outside the fixed list `admin,frontend,public`
// resolved to `integrationServices/<subsystem>/`, which is how the framework located
// [integrationServices/google/controllers/feed.cfc] and its one published action. The
// directory-prefix string building is NOT reproduced: nothing here is concatenated into a path and
// no value this module produces reaches a file system. The adjacent hook
// `customizeViewOrLayoutPath` [Application.cfc:L140-L168] is likewise not ported - it is a
// VIEW-RESOLUTION concern for out-of-scope subsystems, and the target renders no interface.
//
// FW/1 IS REFERENCE ONLY AND REMAINS PHYSICALLY IN THE REPOSITORY.
// [org/Hibachi/FW1/framework.cfc:L1885] pins `variables.framework.version` to '2.1'. This module
// replaces that framework's routing RESPONSIBILITY, not the framework: every file under
// `org/Hibachi/FW1/` stays untouched, as does `Application.cfc`. One REFERENCE-ONLY observation
// justifies a decision below: FW/1's routing failures were TYPED and therefore distinguishable from
// domain failures - a missing service component [org/Hibachi/FW1/framework.cfc:L963], a missing
// service method [org/Hibachi/FW1/framework.cfc:L1231], an action carrying an embedded
// sub-directory path [org/Hibachi/FW1/framework.cfc:L2024], and a missing view immediately after
// it. That is why an unmatched request is delegated to the dedicated route-not-found path in
// `./errorMapper.js` rather than mapped as a domain failure. The framework's exception TYPE NAMES
// are NOT carried forward: reproducing them would invent a contract the target does not owe.
//
// THE CFML CASE-INSENSITIVITY TRAP, AUDITED RATHER THAN ASSUMED. Both comparisons in the legacy
// hook fold case in CFML and would be case-SENSITIVE in TypeScript if written naively:
// `arguments.subsystem eq ''` [Application.cfc:L130], where CFML `eq` on strings folds case, and
// `listFindNoCase('admin,frontend,public', ...)` [Application.cfc:L133], explicitly
// case-insensitive comma-list membership. Matching therefore goes through the shared parity helpers
// rather than an ad-hoc `.toLowerCase()` scattered inline: `cfEquals` from `../lib/cfml/struct.js`
// reproduces the L130 comparison and `listFindNoCase` from `../lib/cfml/list.js` the L133
// membership test. ONE consequence is deliberate and load-bearing: an incoming path is matched
// WITHOUT REGARD TO CASE, so `/CATALOG/PRODUCTS` resolves the same capability as
// `/catalog/products`. That is the legacy semantic, not a convenience.
//
// A METHOD MISMATCH RESOLVES TO NOT-FOUND. FW/1 had no HTTP-method dispatch whatsoever - an action
// was reached by any method - so there is no method-not-allowed concept in it to port, and
// `./errorMapper.js` likewise models a closed status set of exactly three codes, none of them a
// method-not-allowed. Inventing a fourth status, or an `Allow` header, would be inventing HTTP
// semantics neither the source nor the error mapper has.
//
// BUSINESS LOGIC IS FORBIDDEN HERE, as are authentication, authorization, session and permission
// logic: the one in-scope legacy controller publishes its action outright -
// [integrationServices/google/controllers/feed.cfc:L54-L56] sets `this.publicMethods="product"`
// with an empty admin-method list and an empty secure-method list - and that is a FACTUAL PROPERTY
// OF THE SOURCE, not licence to invent an auth tier. No routing library is imported: the table is
// hand-written application source.
// ---------------------------------------------------------------------------

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { listAppend, listFindNoCase, listToArray } from '../lib/cfml/list.js';
import { cfEquals, structGet, structKeyList } from '../lib/cfml/struct.js';
import type { ErrorMappingContext } from './errorMapper.js';
import { routeNotFoundResponse } from './errorMapper.js';

/**
 * The five bounded capabilities the service exposes, and no sixth.
 *
 * The set is fixed by the AAP's resolution of handler granularity: one handler module per bounded
 * capability, sharing a common bootstrap - catalog query, SKU resolution, promotion application,
 * price resolution and product feed. Each member names the handler that owns it, `<member>Handler`;
 * those five modules are the unfulfilled obligation recorded in the module header, so the mapping
 * states intended ownership rather than an existing import.
 *
 * A string-literal union rather than the TypeScript enumeration construct: a union is erased on
 * emit, so nothing survives into the bundle as a runtime object, and the values stay directly
 * comparable against a decoded log line without an import. `ROUTE_TABLE` is keyed by this union,
 * which makes "exactly these five capabilities" a COMPILE-TIME guarantee rather than a review
 * convention.
 */
export type RoutedCapability =
  'catalogQuery' | 'skuResolution' | 'promotionApplication' | 'priceResolution' | 'productFeed';

/**
 * The operation each route names, as data.
 *
 * The identifier a handler dispatches on internally, distinct from {@link RoutedCapability} by
 * deliberate choice. A capability names WHICH bundle owns the request, an action names WHAT is to
 * be done, and conflating them would mean renaming a deployed capability in order to add an
 * operation. Actions are DATA and nothing more - this module never invokes one.
 *
 * `generateProductFeed` is not a name chosen here: it is the target signature the AAP's interface
 * mapping table assigns to the legacy `void function product(required struct rc)`
 * [integrationServices/google/controllers/feed.cfc:L58], carried over verbatim. The other four are
 * net-new entry-point names, because the AAP records those four handler rows with no legacy source
 * file at all.
 */
export type RouteAction =
  'queryCatalog' | 'resolveSkus' | 'applyPromotions' | 'resolvePrices' | 'generateProductFeed';

/**
 * One row of the route table.
 *
 * Four members, all load-bearing at run time. Nothing decorative is carried: a description or
 * provenance string would be dead weight in the bundle, and the build configuration keeps comments
 * precisely so documentation lives beside each row instead of inside it.
 */
export interface RouteDescriptor {
  /** The capability - and therefore the handler - that owns this route. */
  readonly capability: RoutedCapability;

  /** The operation the owning handler dispatches on. */
  readonly action: RouteAction;

  /**
   * The HTTP methods this route answers, as a CFML COMMA-DELIMITED LIST.
   *
   * JUDGMENT CALL: a comma-delimited list string, not a `readonly string[]`. The membership test
   * being replaced is literally `listFindNoCase('admin,frontend,public', arguments.subsystem)`
   * [Application.cfc:L133] over a comma-delimited literal, and keeping the declaration in list form
   * is what lets `listFindNoCase` be the membership test verbatim, keeping the one comparison a
   * reviewer must audit in the same shape as the comparison it came from. Callers wanting the array
   * form have `listToArray`. The helper's empty-element semantics are relied on: a stray separator
   * contributes no element, so a malformed list cannot admit an empty method name.
   */
  readonly methods: string;

  /**
   * The canonical path this route answers.
   *
   * RELATIVE ONLY. No scheme, host, domain, stage name or account-specific prefix appears in any
   * row - those are deployment facts, and hard-coding one would both invent configuration and
   * defeat the environment-driven configuration standard. A request path is canonicalized before
   * comparison (see `canonicalizeRoutePath`), so every value here is written in the same canonical
   * form: exactly one leading separator, no trailing separator, no empty segment. Matching is
   * case-insensitive, per the legacy `eq` semantics, so the casing used here is a readability
   * choice and not part of the contract.
   */
  readonly path: string;
}

/**
 * The two pieces of an incoming request that routing actually depends on.
 *
 * Deliberately NOT an API Gateway event. Resolution needs a method and a path and nothing else, so
 * taking them directly keeps the primary function a pure function of two strings: trivially
 * testable, and impossible to accidentally read a header, a body or a caller identity out of.
 * `routeRequestFromEvent` exists for callers holding an event.
 */
export interface RouteRequest {
  /** The request method exactly as received. Compared case-insensitively. */
  readonly method: string;

  /** The request path exactly as received. Canonicalized before comparison. */
  readonly path: string;
}

/**
 * The outcome of resolution: either a route, or a response that says there is none.
 *
 * A discriminated union on `matched`, so a caller cannot read `route` without first proving the
 * match - the compiler enforces what would otherwise be a convention.
 *
 * The unmatched arm carries a READY RESPONSE rather than an error code or a reason string, which is
 * what keeps error mapping centralized in exactly one module: the status, header set, body envelope
 * and log emission for an unmatched request are all decided inside `./errorMapper.js`, and a
 * handler returns what it is given.
 */
export type RouteResolution =
  | {
      /** A route matched. */
      readonly matched: true;
      /** The matched row of {@link ROUTE_TABLE}. */
      readonly route: RouteDescriptor;
    }
  | {
      /** No route matched, or the matched route belongs to another capability. */
      readonly matched: false;
      /** The response to return, built by `./errorMapper.js`. */
      readonly response: APIGatewayProxyResult;
    };

/**
 * The separator that delimits path segments.
 *
 * Passed to the CFML list helpers as their delimiter set, which is how a path is canonicalized
 * without bespoke string surgery: `listToArray` drops empty elements, so a doubled, leading or
 * trailing separator contributes nothing, and `listAppend` never emits a leading separator while
 * the accumulator is still empty.
 */
const PATH_DELIMITER = '/';

// ---------------------------------------------------------------------------
// THE ROUTE TABLE - the whole URL surface of this service, in one place. Five capabilities, one
// route each.
//
// JUDGMENT CALL: exactly one route per capability, and no operation-selection surface in the
// router. The AAP resolves handler granularity as "one handler module per bounded capability" and
// describes the routing approach as a single routed entrypoint with an explicit route table; the
// narrow reading - one route per capability, with the handler deciding which of its own service
// methods a given payload calls for - invents nothing, because four of the five handler rows in the
// AAP's transformation table have no legacy source file at all, so any sub-surface enumerated here
// would be a URL vocabulary this migration was never asked to design. It also makes the
// five-capability guarantee mechanical: because the table is a `Record` keyed by the capability
// union, the compiler rejects both a missing capability and a sixth one, which a path-keyed table
// could not do. Adding a second route to a capability later is additive; adding a SIXTH CAPABILITY
// is a product decision.
//
// The legacy antecedent: exactly ONE of these five capabilities was reachable through the FW/1
// subsystem convention at all - the product feed, whose framework action was `google:feed.product`
// under the action grammar `subsystem:section.item` [org/Hibachi/FW1/framework.cfc:L1806]. Its
// subsystem resolved through the hook quoted in the module header, which is what made the
// controller at [integrationServices/google/controllers/feed.cfc:L58] reachable. Its sibling
// controller [integrationServices/google/controllers/main.cfc] declares an EMPTY component body
// with no action of any kind, so it contributes no route and none is invented for it.
// ---------------------------------------------------------------------------

/**
 * The complete route table, keyed by capability.
 *
 * Every row declares the method, path and action name the owning capability handler answers; those
 * handler modules are the unfulfilled obligation recorded in the module header, and the per-row
 * prose describes the surface each capability exposes through ported services.
 *
 * `Readonly<Record<RoutedCapability, RouteDescriptor>>` is the type that carries the guarantee:
 * every capability has exactly one route, and a key that is not a capability cannot be added.
 * Because the key set is closed, an index into this record is a `RouteDescriptor` and never widens
 * to `undefined`, which is why the walk below is written without a non-null assertion. Frozen so a
 * caller holding the exported reference cannot reshape the routing of a warm container - `readonly`
 * is compile-time only, and this module is instantiated once per container and shared across every
 * invocation it serves.
 */
export const ROUTE_TABLE: Readonly<Record<RoutedCapability, RouteDescriptor>> = Object.freeze({
  // Catalog query. The read surface of the ported product, brand and option services - the typed
  // replacements for the framework smart lists, which the plan renames deliberately rather than
  // cloning.
  catalogQuery: Object.freeze({
    capability: 'catalogQuery',
    action: 'queryCatalog',
    methods: 'GET',
    path: '/catalog/products',
  }),

  // SKU resolution. Option-based SKU selection, whose AND-of-EXISTS matching semantics
  // [model/dao/SkuDAO.cfc:L107-L128] are must-preserve behaviour, together with direct SKU lookup.
  skuResolution: Object.freeze({
    capability: 'skuResolution',
    action: 'resolveSkus',
    methods: 'GET',
    path: '/catalog/skus',
  }),

  // Promotion application. Accepts an order-shaped read-only document and returns applied-promotion
  // intents; it mutates no order, which is the anti-corruption seam that lets an out-of-scope
  // aggregate drive an in-scope engine. POST because the document travels in the request body. The
  // price-group pass must run BEFORE this one - the discount base price is chosen from price-group
  // state [model/service/PromotionService.cfc:L241-L254] that pass produces - and that ordering is
  // enforced where the two passes are sequenced, NOT here: a route table encoding an execution
  // order would be making a business decision.
  promotionApplication: Object.freeze({
    capability: 'promotionApplication',
    action: 'applyPromotions',
    methods: 'POST',
    path: '/promotions/application',
  }),

  // Price resolution. The price-group and currency resolution surface, likewise taking a read-only
  // order-shaped document and returning intents.
  priceResolution: Object.freeze({
    capability: 'priceResolution',
    action: 'resolvePrices',
    methods: 'POST',
    path: '/prices/resolution',
  }),

  // Product feed. The one capability with a legacy framework antecedent. The path is a plain
  // declarative URL and deliberately does NOT echo `integrationServices/google/`: reproducing that
  // prefix would reproduce the directory-building convention this file replaces, and no value here
  // is ever concatenated into a path. GET because the legacy action served a document to a machine
  // consumer.
  productFeed: Object.freeze({
    capability: 'productFeed',
    action: 'generateProductFeed',
    methods: 'GET',
    path: '/feeds/google/products',
  }),
});

// ---------------------------------------------------------------------------
// Resolution internals
// ---------------------------------------------------------------------------

/**
 * Reduce an incoming path to the canonical form the table is written in.
 *
 * Built entirely out of the CFML list primitives with the path separator as the delimiter set,
 * because their documented semantics are exactly the ones wanted: `listToArray` DROPS EMPTY
 * ELEMENTS, so a leading, trailing or doubled separator contributes nothing and `//catalog//`
 * reduces to the same single segment as `catalog`; and `listAppend` emits NO LEADING SEPARATOR
 * while the accumulator is empty. The single leading separator is then added once, unconditionally,
 * so the result is always absolute. An empty or separator-only path reduces to the root `'/'`,
 * which matches no row because every row names at least one segment, the counterpart to the legacy
 * hook returning no prefix for an empty subsystem [Application.cfc:L130-L132], falling out of the
 * table rather than needing its own branch.
 *
 * NOTHING ELSE IS DONE TO THE PATH. It is not lower-cased - matching folds case through `cfEquals`
 * instead, so the caller's own casing survives into the diagnostic label - and it is NOT
 * percent-decoded, which would introduce behaviour the source never had and is unnecessary:
 * comparison is against five fixed literals containing no character requiring an escape, so an
 * encoded path simply matches nothing. An embedded `..` or `.` segment is likewise preserved
 * verbatim, matches nothing, and is harmless, because no value produced here is ever concatenated
 * into a path or handed to a file system.
 *
 * @param path - the request path exactly as received.
 * @returns the canonical path: one leading separator, no empty segment, no trailing
 *          separator. Never empty.
 */
function canonicalizeRoutePath(path: string): string {
  const segments = listToArray(path, PATH_DELIMITER);

  let rejoined = '';
  for (const segment of segments) {
    rejoined = listAppend(rejoined, segment, PATH_DELIMITER);
  }

  return `${PATH_DELIMITER}${rejoined}`;
}

/**
 * The label a routing failure is reported under.
 *
 * The method exactly as the caller sent it, then the canonical path - the pair the match was
 * actually attempted with, so a reader can compare it against the table directly. The method is NOT
 * case-normalized: folding is a matching concern that belongs in the helpers.
 *
 * This value reaches the LOG only, and is sanitized on the way: `./errorMapper.js`
 * character-filters and length-bounds the route before writing its structured log line, because a
 * path is caller-authored and a natural carrier for a token or a signed parameter, and it never
 * echoes the route into a response body.
 */
function describeRequestedRoute(method: string, canonicalPath: string): string {
  return `${method} ${canonicalPath}`;
}

/**
 * Find the row of {@link ROUTE_TABLE} that answers this method and path.
 *
 * The walk is the CFML keys-then-index-back idiom, and all three comparisons are the
 * case-insensitive ones audited in the module header. `structKeyList` then `structGet` takes the
 * struct's keys and indexes back into the struct with one of them; `structGet` matches its key
 * case-insensitively, which is the CFML struct-key semantic, and reports absence as `undefined`
 * rather than substituting a value. `cfEquals` on the path reproduces [Application.cfc:L130] and
 * `listFindNoCase` on the method list [Application.cfc:L133].
 *
 * `listFindNoCase` returns a 1-BASED POSITION and `0` for absent, never a boolean, so the test
 * below is written as an explicit `=== 0` rather than leaning on JavaScript treating `0` as falsy.
 * That coincidence would read as though the helper answered a yes/no question when it answers
 * "where", and the helper's own documentation forbids relying on it.
 *
 * The `undefined` arm of the `structGet` read is handled explicitly even though the closed key set
 * makes it unreachable: `noUncheckedIndexedAccess` is on and a non-null assertion is banned
 * throughout `src/**`, so handling absence keeps the impossible case visible instead of asserted
 * away. PATH FIRST, then method: a path matching with the wrong method is as much a non-route as
 * one matching no row, so the cheap discriminator goes first and no method mismatch is implied to
 * be a distinguishable outcome.
 *
 * @param method - the request method exactly as received.
 * @param canonicalPath - a path already through `canonicalizeRoutePath`.
 * @returns the matching descriptor, or `undefined` when nothing matches.
 */
function findRoute(method: string, canonicalPath: string): RouteDescriptor | undefined {
  for (const capabilityKey of structKeyList(ROUTE_TABLE)) {
    const route = structGet(ROUTE_TABLE, capabilityKey);

    if (route === undefined) {
      continue;
    }

    if (!cfEquals(route.path, canonicalPath)) {
      continue;
    }

    if (listFindNoCase(route.methods, method) === 0) {
      continue;
    }

    return route;
  }

  return undefined;
}

/**
 * Copy the caller's error-mapping context with the requested route attached.
 *
 * The route is set unconditionally, and overrides any value the caller had already put there,
 * because this module always knows the method and path it failed to match.
 *
 * `exactOptionalPropertyTypes` is on, so `route` is set to a definite string and never to
 * `undefined`. The spread preserves `logger` exactly as supplied, which keeps the not-found
 * emission observable from a test without this module importing a logger of its own.
 */
function withRequestedRoute(
  context: ErrorMappingContext,
  requestedRoute: string,
): ErrorMappingContext {
  return { ...context, route: requestedRoute };
}

/**
 * What one lookup yields: the matching row if there is one, and the label to report the request
 * under if there is not.
 *
 * `route` is a REQUIRED member whose type includes `undefined`, not an optional member. Under
 * `exactOptionalPropertyTypes` those differ, and the required form is the honest one: a lookup
 * always answers the question, and `undefined` is the answer "nothing matched" rather than "no
 * answer was recorded".
 */
interface RouteLookup {
  /** The matching row of {@link ROUTE_TABLE}, or `undefined` when none matches. */
  readonly route: RouteDescriptor | undefined;
  /** The label the request is reported under if it has to be reported. */
  readonly requestedRoute: string;
}

/**
 * Canonicalize once, then both match and label from the same canonical path.
 *
 * The single entry point into resolution, shared by both exported resolvers, which guarantees the
 * two agree on canonicalization, on matching and on the label - and, because each resolver then
 * builds at most one not-found response, makes "exactly one log emission per unmatched request" a
 * structural property.
 *
 * @param request - the method and path to resolve.
 * @returns the matching descriptor if there is one, plus the diagnostic label.
 */
function lookupRoute(request: RouteRequest): RouteLookup {
  const canonicalPath = canonicalizeRoutePath(request.path);

  return {
    route: findRoute(request.method, canonicalPath),
    requestedRoute: describeRequestedRoute(request.method, canonicalPath),
  };
}

// ---------------------------------------------------------------------------
// Exported surface
// ---------------------------------------------------------------------------

/**
 * Resolve a request onto one of the five capabilities, or onto a not-found response.
 *
 * THE PRIMARY UNIT OF THIS MODULE, and the whole of what replaces FW/1's subsystem-convention
 * routing: a request names a capability and exactly one destination is returned for it, with no
 * directory prefix, convention scan or path construction anywhere.
 *
 * A miss returns a READY RESPONSE built by `routeNotFoundResponse` in `./errorMapper.js`. No
 * status, header set or body envelope is constructed here, which keeps error mapping - and the
 * prohibition on leaking a credential, a connection string or a SQL fragment into a response body -
 * centralized in one module, and that delegation also emits the single structured log line for the
 * failure under the correlation identifier the caller supplied. Both kinds of miss, no path match
 * and a path match whose method the route does not answer, produce the same unmatched result.
 *
 * Never throws, and one helper involved makes that worth stating precisely. Canonicalization is
 * total over any string, `structKeyList` and `structGet` are total with absence answered as
 * `undefined` and handled explicitly, and `listFindNoCase` answers a position and `0`. `cfEquals`
 * is NOT total - it raises `CfmlComparisonError` for a `null` or `undefined` operand, matching
 * CFML, where a null reaching `eq` raises - but it cannot raise HERE, and that is a property of the
 * operands: the left is `route.path` off a frozen `ROUTE_TABLE` literal whose rows declare `path`
 * as a definite `string`, and the right is a template literal. Neither can be nullish, so the
 * raising branch is unreachable and deliberately not guarded - inventing `false` there is exactly
 * the silent-negative failure the raise removes.
 *
 * @param request - the method and path to resolve. Case-insensitive in both.
 * @param context - correlation identifier, and optionally a logger, for the not-found path.
 *                  Its `route` member is filled in here.
 * @returns a matched descriptor, or an unmatched result carrying the response to return.
 *
 * @example
 *   ```ts
 *   const resolution = resolveRoute(routeRequestFromEvent(event), { requestId });
 *   if (!resolution.matched) {
 *     return resolution.response;
 *   }
 *   // `resolution.route.action` is what this handler dispatches on.
 *   ```
 */
export function resolveRoute(request: RouteRequest, context: ErrorMappingContext): RouteResolution {
  const { route, requestedRoute } = lookupRoute(request);

  if (route === undefined) {
    return {
      matched: false,
      response: routeNotFoundResponse(withRequestedRoute(context, requestedRoute)),
    };
  }

  return { matched: true, route };
}

/**
 * Resolve a request and accept it only when it belongs to the given capability.
 *
 * THIS IS THE FUNCTION A CAPABILITY HANDLER CALLS, and the mechanism that makes one shared table
 * serve five independently deployable bundles: reading the shared table guarantees the five agree
 * on a single URL surface, and checking the capability here guarantees they do not answer for each
 * other.
 *
 * A route resolving to a DIFFERENT capability is reported exactly as an unmatched route - inventing
 * a distinct outcome would leak the existence of the other four capabilities into a response - so
 * both misses fold into ONE arm, which means one not-found response and hence exactly one log
 * emission per unmatched request, guaranteed by the shape of the function.
 *
 * @param request - the method and path to resolve.
 * @param capability - the calling handler's own capability.
 * @param context - correlation identifier, and optionally a logger.
 * @returns a matched descriptor whose `capability` is exactly `capability`, or an unmatched
 *          result carrying the response to return.
 */
export function resolveRouteForCapability(
  request: RouteRequest,
  capability: RoutedCapability,
  context: ErrorMappingContext,
): RouteResolution {
  const { route, requestedRoute } = lookupRoute(request);

  if (route === undefined || route.capability !== capability) {
    return {
      matched: false,
      response: routeNotFoundResponse(withRequestedRoute(context, requestedRoute)),
    };
  }

  return { matched: true, route };
}

/**
 * Lift the method and path out of an API Gateway proxy event.
 *
 * A pure two-member projection and deliberately nothing more: no header, body, query string, caller
 * identity or authorizer context is read, so nothing a caller sent can influence routing beyond the
 * method and the path. `event.path` is the RESOURCE PATH and carries no stage segment - the
 * stage-prefixed form lives on the event's request context and is not read here - which is what
 * lets the table hold relative paths only.
 *
 * Only the version 1.0 proxy payload is modelled, matching the response type `./errorMapper.js`
 * already builds; a second would mean inventing a request surface the plan does not describe. A
 * caller holding a different shape constructs a {@link RouteRequest} and calls {@link resolveRoute}
 * directly, which is why the primary function takes two strings rather than an event.
 *
 * @param event - the proxy event, version 1.0 payload.
 * @returns the method and path to resolve, unmodified.
 */
export function routeRequestFromEvent(event: APIGatewayProxyEvent): RouteRequest {
  return { method: event.httpMethod, path: event.path };
}
