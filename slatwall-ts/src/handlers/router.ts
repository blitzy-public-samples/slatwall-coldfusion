// The explicit route table for the primary (Lambda) adapters.
//
// Resolve an incoming request onto exactly one of the five bounded capabilities the service
// exposes, and do nothing else.
//
// `ROUTE_TABLE` is frozen data and `resolveRoute` is a pure function over it; neither invokes
// anything.
//
// The five capability handler modules that own these routes - catalogQueryHandler,
// skuResolutionHandler, promotionApplicationHandler, priceResolutionHandler and
// productFeedHandler.

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { listAppend, listFindNoCase, listToArray } from '../lib/cfml/list.js';
import { cfEquals, structGet, structKeyList } from '../lib/cfml/struct.js';
import type { ErrorMappingContext } from './errorMapper.js';
import { routeNotFoundResponse } from './errorMapper.js';

/**
 * The five bounded capabilities the service exposes, and no sixth.
 *
 * A string-literal union rather than the TypeScript enumeration construct: a union is erased on
 * emit, so nothing survives into the bundle as a runtime object.
 */
export type RoutedCapability =
  'catalogQuery' | 'skuResolution' | 'promotionApplication' | 'priceResolution' | 'productFeed';

/**
 * The operation each route names, as data.
 *
 * The identifier a handler dispatches on internally, distinct from {@link RoutedCapability} by
 * deliberate choice.
 */
export type RouteAction =
  'queryCatalog' | 'resolveSkus' | 'applyPromotions' | 'resolvePrices' | 'generateProductFeed';

/**
 * One row of the route table.
 */
export interface RouteDescriptor {
  /**
   * The capability - and therefore the handler - that owns this route.
   */
  readonly capability: RoutedCapability;

  /**
   * The operation the owning handler dispatches on.
   */
  readonly action: RouteAction;

  /**
   * The http methods this route answers, as a CFML comma-delimited list.
   *
   * JUDGMENT CALL: a comma-delimited list string, not a `readonly string[]`.
   */
  readonly methods: string;

  /**
   * The canonical path this route answers.
   */
  readonly path: string;
}

/**
 * The two pieces of an incoming request that routing actually depends on.
 */
export interface RouteRequest {
  /**
   * The request method exactly as received. Compared case-insensitively.
   */
  readonly method: string;

  /**
   * The request path exactly as received. Canonicalized before comparison.
   */
  readonly path: string;
}

/**
 * The outcome of resolution: either a route, or a response that says there is none.
 *
 * A discriminated union on `matched`, so a caller cannot read `route` without first proving the
 * match - the compiler enforces what would otherwise be a convention.
 *
 * The unmatched arm carries a READY RESPONSE rather than an error code or a reason string, which
 * is what keeps error mapping centralized in exactly one module: the status, header set.
 */
export type RouteResolution =
  | {
      readonly matched: true;
      /**
       * The matched row of {@link ROUTE_TABLE}.
       */
      readonly route: RouteDescriptor;
    }
  | {
      /**
       * No route matched, or the matched route belongs to another capability.
       */
      readonly matched: false;
      /**
       * The response to return, built by `./errorMapper.js`.
       */
      readonly response: APIGatewayProxyResult;
    };

/**
 * The separator that delimits path segments.
 *
 * Passed to the CFML list helpers as their delimiter set, which is how a path is canonicalized
 * without bespoke string surgery: `listToArray` drops empty elements, so a doubled.
 */
const PATH_DELIMITER = '/';

// The ROUTE TABLE - the whole URL surface of this service, in one place. Five capabilities, one
// route each.
//
// JUDGMENT CALL: exactly one route per capability, and no operation-selection surface in the
// router.

/**
 * The complete route table, keyed by capability.
 *
 * Every row declares the method, path and action name the owning capability handler answers.
 *
 * `Readonly<Record<RoutedCapability, RouteDescriptor>>` is the type that carries the guarantee:
 * every capability has exactly one route, and a key that is not a capability cannot be added.
 */
export const ROUTE_TABLE: Readonly<Record<RoutedCapability, RouteDescriptor>> = Object.freeze({
  catalogQuery: Object.freeze({
    capability: 'catalogQuery',
    action: 'queryCatalog',
    methods: 'GET,POST',
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
  promotionApplication: Object.freeze({
    capability: 'promotionApplication',
    action: 'applyPromotions',
    methods: 'POST',
    path: '/promotions/application',
  }),

  // Price resolution. The price-group and currency resolution surface AAP 0.4.1 assigns this
  // entrypoint: twelve READ operations, each naming one entity by identifier and answering one
  // resolved value.
  priceResolution: Object.freeze({
    capability: 'priceResolution',
    action: 'resolvePrices',
    methods: 'POST',
    path: '/prices/resolution',
  }),

  // Product feed. The one capability with a legacy framework antecedent.
  productFeed: Object.freeze({
    capability: 'productFeed',
    action: 'generateProductFeed',
    methods: 'GET',
    path: '/feeds/google/products',
  }),
});

/**
 * Reduce an incoming path to the canonical form the table is written in.
 *
 * Built entirely out of the CFML list primitives with the path separator as the delimiter set,
 * because their documented semantics are exactly the ones wanted: `listToArray` drops empty
 * elements.
 *
 * @param path the request path exactly as received.
 * @returns the canonical path: one leading separator, no empty segment, no trailing separator.
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
 * actually attempted with, so a reader can compare it against the table directly.
 *
 * This value reaches the LOG only, and is sanitized on the way: `./errorMapper.js`
 * character-filters and length-bounds the route before writing its structured log line.
 */
function describeRequestedRoute(method: string, canonicalPath: string): string {
  return `${method} ${canonicalPath}`;
}

/**
 * Find the row of {@link ROUTE_TABLE} that answers this method and path.
 *
 * The walk is the CFML keys-then-index-back idiom, and all three comparisons are the
 * case-insensitive ones audited in the module header.
 *
 * @param method the request method exactly as received.
 * @param canonicalPath a path already through `canonicalizeRoutePath`.
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
 * `undefined`.
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
 * `route` is a REQUIRED member whose type includes `undefined`, not an optional member.
 */
interface RouteLookup {
  /**
   * The matching row of {@link ROUTE_TABLE}, or `undefined` when none matches.
   */
  readonly route: RouteDescriptor | undefined;
  /**
   * The label the request is reported under if it has to be reported.
   */
  readonly requestedRoute: string;
}

/**
 * Canonicalize once, then both match and label from the same canonical path.
 *
 * The single entry point into resolution, shared by both exported resolvers, which guarantees the
 * two agree on canonicalization, on matching and on the label - and.
 *
 * @param request the method and path to resolve.
 * @returns the matching descriptor if there is one, plus the diagnostic label.
 */
function lookupRoute(request: RouteRequest): RouteLookup {
  const canonicalPath = canonicalizeRoutePath(request.path);

  return {
    route: findRoute(request.method, canonicalPath),
    requestedRoute: describeRequestedRoute(request.method, canonicalPath),
  };
}

/**
 * Resolve a request onto one of the five capabilities, or onto a not-found response.
 *
 * A miss returns a ready response built by `routeNotFoundResponse` in `./errorMapper.js`.
 *
 * @param request the method and path to resolve.
 * @param context correlation identifier, and optionally a logger, for the not-found path.
 * @returns a matched descriptor, or an unmatched result carrying the response to return.
 * @example
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
 * @param request the method and path to resolve.
 * @param capability the calling handler's own capability.
 * @param context correlation identifier, and optionally a logger.
 * @returns a matched descriptor whose `capability` is exactly `capability`, or an unmatched result
 * carrying the response to return.
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
 * A pure two-member projection and deliberately nothing more: no header, body, query string,
 * caller identity or authorizer context is read.
 *
 * @param event the proxy event, version 1.0 payload.
 * @returns the method and path to resolve, unmodified.
 */
export function routeRequestFromEvent(event: APIGatewayProxyEvent): RouteRequest {
  return { method: event.httpMethod, path: event.path };
}
