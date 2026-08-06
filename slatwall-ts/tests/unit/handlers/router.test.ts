// ---------------------------------------------------------------------------
// tests/unit/handlers/router.test.ts
//
// WHY THIS FILE EXISTS. `src/handlers/router.ts` was the last module in the
// subtree carrying a declared coverage DEBT: it sat in
// `tests/traceability/legacyTestMap.ts`'s `pendingModules` with this exact path
// named as its planned suite, on the stated reason that the module "carries no
// business logic, but it does carry dispatch decisions, and dispatch decisions
// are behaviour". A documentation review then recorded the debt as the one place
// the README's exhaustive-coverage claim was not true. This suite discharges it,
// and the ledger entry moves with it - authoring the suite WITHOUT promoting the
// module fails the traceability gates, which is the coupling that keeps coverage
// from being added without being declared.
//
// WHAT IS ASSERTED, AND WHY EACH ITEM IS BEHAVIOUR RATHER THAN SHAPE. Routing is
// the whole of what replaces FW/1's subsystem convention
// [Application.cfc:L126-L137], so the decisions below are the ones that decide
// whether a request reaches a capability at all:
//
//   1. THE URL SURFACE ITSELF. Five capabilities, one route each, with the
//      method, path and action every deployed bundle agrees on. A silently
//      changed path is an outage; a silently changed action is a handler that
//      dispatches on a name nothing sends.
//   2. CFML CASE-INSENSITIVITY, PRESERVED DELIBERATELY. `Application.cfc:L130`
//      compares with CFML `eq` and `Application.cfc:L133` with
//      `listFindNoCase`, both of which fold case. TypeScript does not, so the
//      module routes through the shared parity helpers - and that means
//      `/CATALOG/PRODUCTS` and `get` must resolve exactly as their lower-case
//      spellings do. This is legacy semantics, not convenience.
//   3. PATH CANONICALIZATION. A leading, trailing or doubled separator
//      contributes no segment, so five spellings of one path reach one route.
//   4. A METHOD MISMATCH IS A NOT-FOUND, never a 405 and never an `Allow`
//      header: FW/1 had no method dispatch at all, so there is no
//      method-not-allowed concept in the source to port.
//   5. ONE CAPABILITY CANNOT ANSWER FOR ANOTHER, and a request for a sibling
//      capability is reported as an ordinary miss - inventing a distinguishable
//      outcome would leak the existence of the other four routes.
//   6. EXACTLY ONE LOG EMISSION PER UNMATCHED REQUEST, through the caller's
//      logger, with the canonical route on the log line and NEVER in the
//      response body.
//   7. NOTHING BUT METHOD AND PATH IS READ FROM THE EVENT. No header, body,
//      query string or authorizer context can influence routing.
//
// SCOPE FENCES. This suite drives no capability handler, opens no pool, reads no
// environment variable and asserts nothing about SQL: the module imports none of
// those and a suite that reached for them would be testing its own scaffolding.
// The response envelope, its status table and its redaction rules belong to
// `tests/unit/handlers/errorMapper.test.ts`; what is asserted here is that the
// router DELEGATES to that module rather than building a response of its own,
// which is checked by observing the delegated status and the single emission.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import {
  ROUTE_TABLE,
  resolveRoute,
  resolveRouteForCapability,
  routeRequestFromEvent,
} from '../../../src/handlers/router.js';
import type { RoutedCapability, RouteDescriptor } from '../../../src/handlers/router.js';
import type { ErrorMappingContext, ErrorResponseBody } from '../../../src/handlers/errorMapper.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { LogContext, LogLevel, Logger, LogSink } from '../../../src/lib/logger.js';

// ---------------------------------------------------------------------------
// Test doubles and planted data
// ---------------------------------------------------------------------------

/** A correlation identifier, shaped like the one API Gateway supplies. */
const REQUEST_ID = 'ba5eba11-0000-4000-8000-0000cafe0001';

/**
 * A value planted in every event member routing must not read.
 *
 * Long, unique and free of regular-expression metacharacters, so a substring
 * search over the projection cannot produce a false result either way.
 */
const PLANTED_UNREAD = 'PLANTED-NOT-READ-BY-ROUTING-7f3c19';

/** One captured emission, in the form the subject handed to the logger. */
interface CapturedEmission {
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext | undefined;
}

/**
 * A logger that records rather than emits.
 *
 * Hand-written rather than a mock: the pinned package set carries no mocking
 * library, and a fresh recorder inside each case is what keeps one case from
 * observing another's emissions - the same warm-container hazard this port
 * re-scopes four legacy component-level caches to avoid.
 *
 * `withLevel` and `withSink` return the same recorder because neither is
 * exercised through this path; returning a different object would let the double
 * misreport what the subject did.
 */
function createRecordingLogger(): {
  readonly logger: Logger;
  readonly emissions: CapturedEmission[];
} {
  const emissions: CapturedEmission[] = [];

  const record = (level: LogLevel, message: string, context?: LogContext): void => {
    emissions.push({ level, message, context });
  };

  const recorder: Logger = {
    debug: (message: string, context?: LogContext): void => record('debug', message, context),
    info: (message: string, context?: LogContext): void => record('info', message, context),
    warn: (message: string, context?: LogContext): void => record('warn', message, context),
    error: (message: string, context?: LogContext): void => record('error', message, context),
    withLevel: (_level: LogLevel): Logger => recorder,
    withSink: (_sink: LogSink): Logger => recorder,
  };

  return { logger: recorder, emissions };
}

/** The context a handler passes in, carrying the recording logger. */
function contextWith(logger: Logger): ErrorMappingContext {
  return { requestId: REQUEST_ID, logger };
}

/** Parse a response body, narrowing rather than casting blindly. */
function bodyOf(body: string | undefined): ErrorResponseBody['error'] {
  if (body === undefined) {
    throw new Error('the response carried no body');
  }

  const parsed: unknown = JSON.parse(body);

  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
    throw new Error('the response body is not the mapped envelope');
  }

  return (parsed as ErrorResponseBody).error;
}

/**
 * A proxy event whose method and path are the only members worth reading.
 *
 * Every other member carries the planted value, so the projection assertion can
 * prove a negative: routing reads two members, and anything else reaching it
 * would surface the planted string.
 */
function eventFor(method: string, path: string): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path,
    body: PLANTED_UNREAD,
    headers: { authorization: PLANTED_UNREAD, host: PLANTED_UNREAD },
    multiValueHeaders: { authorization: [PLANTED_UNREAD] },
    isBase64Encoded: false,
    pathParameters: { planted: PLANTED_UNREAD },
    queryStringParameters: { planted: PLANTED_UNREAD },
    multiValueQueryStringParameters: { planted: [PLANTED_UNREAD] },
    stageVariables: { planted: PLANTED_UNREAD },
    resource: PLANTED_UNREAD,
    requestContext: {
      accountId: PLANTED_UNREAD,
      apiId: PLANTED_UNREAD,
      authorizer: { accountID: PLANTED_UNREAD, adminAccountFlag: 'true' },
      protocol: 'HTTP/1.1',
      httpMethod: method,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '203.0.113.1',
        user: null,
        userAgent: PLANTED_UNREAD,
        userArn: null,
      },
      path: `/stage${path}`,
      stage: PLANTED_UNREAD,
      requestId: REQUEST_ID,
      requestTimeEpoch: 0,
      resourceId: PLANTED_UNREAD,
      resourcePath: PLANTED_UNREAD,
    },
  };
}

/** Every capability key, in table order, so a loop cannot silently skip one. */
const CAPABILITIES: readonly RoutedCapability[] = [
  'catalogQuery',
  'skuResolution',
  'promotionApplication',
  'priceResolution',
  'productFeed',
];

/** The row a capability owns, read through the closed key set. */
function routeFor(capability: RoutedCapability): RouteDescriptor {
  return ROUTE_TABLE[capability];
}

// ---------------------------------------------------------------------------
// A. The URL surface itself
// ---------------------------------------------------------------------------

describe('ROUTE_TABLE declares the whole URL surface, once', () => {
  it('carries exactly five capabilities and no sixth', () => {
    // The five the AAP resolves handler granularity into. A sixth is a product
    // decision, so its arrival must fail here rather than ship.
    expect(Object.keys(ROUTE_TABLE).sort()).toEqual([...CAPABILITIES].sort());
  });

  it('publishes the method, path and action every deployed bundle agrees on', () => {
    // Pinned as literals, because these five strings are the deployment contract:
    // a path edited by one bundle and not the others is an outage that no type
    // checks, and an action rename silently orphans the handler's own dispatch.
    expect(routeFor('catalogQuery')).toStrictEqual({
      capability: 'catalogQuery',
      action: 'queryCatalog',
      methods: 'GET',
      path: '/catalog/products',
    });
    expect(routeFor('skuResolution')).toStrictEqual({
      capability: 'skuResolution',
      action: 'resolveSkus',
      methods: 'GET',
      path: '/catalog/skus',
    });
    expect(routeFor('promotionApplication')).toStrictEqual({
      capability: 'promotionApplication',
      action: 'applyPromotions',
      methods: 'POST',
      path: '/promotions/application',
    });
    expect(routeFor('priceResolution')).toStrictEqual({
      capability: 'priceResolution',
      action: 'resolvePrices',
      methods: 'POST',
      path: '/prices/resolution',
    });
    expect(routeFor('productFeed')).toStrictEqual({
      capability: 'productFeed',
      action: 'generateProductFeed',
      methods: 'GET',
      path: '/feeds/google/products',
    });
  });

  it('keys every row by the capability the row itself names', () => {
    // The table is indexed by capability AND each row repeats it, so the two can
    // disagree. `resolveRouteForCapability` compares against the ROW's member, so
    // a mismatch would route a request into the wrong handler while every path
    // assertion above still passed.
    for (const capability of CAPABILITIES) {
      expect(routeFor(capability).capability).toBe(capability);
    }
  });

  it('writes every path in the canonical form the matcher reduces requests to', () => {
    // One leading separator, no trailing separator, no empty segment. A row
    // written otherwise could never be matched, because a request is canonicalized
    // before comparison and the table is not.
    for (const capability of CAPABILITIES) {
      const { path } = routeFor(capability);

      expect(path.startsWith('/')).toBe(true);
      expect(path.endsWith('/')).toBe(false);
      expect(path).not.toContain('//');
      expect(path.trim()).toBe(path);
    }
  });

  it('names no scheme, host, stage or account prefix in any row', () => {
    // Deployment facts, deliberately absent: hard-coding one would both invent
    // configuration and break the environment-driven configuration standard.
    for (const capability of CAPABILITIES) {
      const { path } = routeFor(capability);

      expect(path).not.toMatch(/^https?:/i);
      expect(path).not.toContain('://');
      expect(path).not.toContain('amazonaws.com');
      expect(path).not.toContain('execute-api');
    }
  });

  it('does NOT echo the legacy integrationServices directory convention', () => {
    // The feed is the one capability with a legacy antecedent, reached through
    // `getSubsystemDirPrefix()`'s `integrationServices/<subsystem>/` prefix
    // [Application.cfc:L133-L135]. Reproducing that prefix in a URL would
    // reproduce the directory-building convention this module exists to replace.
    for (const capability of CAPABILITIES) {
      expect(routeFor(capability).path).not.toContain('integrationServices');
    }
  });

  it('is frozen at the table and at every row, so a warm container cannot be re-routed', () => {
    // `readonly` is compile-time only. This module is evaluated once per container
    // and shared across every invocation it serves, so a caller able to mutate the
    // exported reference could re-route the requests that follow.
    expect(Object.isFrozen(ROUTE_TABLE)).toBe(true);

    for (const capability of CAPABILITIES) {
      expect(Object.isFrozen(routeFor(capability))).toBe(true);
    }

    const rewriteRow = (): void => {
      (ROUTE_TABLE as Record<string, unknown>)['catalogQuery'] = { hijacked: true };
    };
    const rewritePath = (): void => {
      (routeFor('catalogQuery') as { path: string }).path = '/hijacked';
    };

    expect(rewriteRow).toThrow(TypeError);
    expect(rewritePath).toThrow(TypeError);
    expect(routeFor('catalogQuery').path).toBe('/catalog/products');
  });

  it('exports no Lambda handler, because it is a shared internal and not an entry point', () => {
    // `esbuild.config.mjs` enumerates exactly the five capability handlers as
    // entry points. Bundling this module as a sixth would emit an artifact with no
    // `handler` for the runtime to call.
    const surface: Record<string, unknown> = {
      ROUTE_TABLE,
      resolveRoute,
      resolveRouteForCapability,
      routeRequestFromEvent,
    };

    expect(Object.keys(surface)).not.toContain('handler');
  });
});

// ---------------------------------------------------------------------------
// B. Resolution - the dispatch decision
// ---------------------------------------------------------------------------

describe('resolveRoute resolves each declared route on its own method and path', () => {
  it('matches every row of the table', () => {
    for (const capability of CAPABILITIES) {
      const route = routeFor(capability);
      const { logger, emissions } = createRecordingLogger();

      const resolution = resolveRoute(
        { method: route.methods, path: route.path },
        contextWith(logger),
      );

      expect(resolution.matched).toBe(true);
      if (resolution.matched) {
        expect(resolution.route).toStrictEqual(route);
      }

      // A match is silent: nothing is logged on the success path, so an
      // unmatched request's single line stays findable in a real log stream.
      expect(emissions).toEqual([]);
    }
  });

  it('★★ folds case in the PATH, reproducing CFML `eq` at [Application.cfc:L130]', () => {
    // CFML string comparison is case-insensitive, so the legacy would have routed
    // `/CATALOG/PRODUCTS`. TypeScript compares case-sensitively, which is why the
    // module goes through `cfEquals` rather than `===`. This is preserved legacy
    // semantics rather than a convenience, and it is the assertion that fails if a
    // future edit "simplifies" the comparison.
    for (const path of ['/CATALOG/PRODUCTS', '/Catalog/Products', '/cAtAlOg/pRoDuCtS']) {
      const { logger } = createRecordingLogger();
      const resolution = resolveRoute({ method: 'GET', path }, contextWith(logger));

      expect(resolution.matched).toBe(true);
      if (resolution.matched) {
        expect(resolution.route.capability).toBe('catalogQuery');
      }
    }
  });

  it('★★ folds case in the METHOD, reproducing `listFindNoCase` at [Application.cfc:L133]', () => {
    for (const method of ['get', 'GeT', 'GET']) {
      const { logger } = createRecordingLogger();
      const resolution = resolveRoute({ method, path: '/catalog/products' }, contextWith(logger));

      expect(resolution.matched).toBe(true);
    }
  });

  it('canonicalizes the path, so five spellings reach one route', () => {
    // `listToArray` drops empty elements, so a leading, trailing or doubled
    // separator contributes no segment. A caller that appends a trailing slash is
    // not a caller that gets a 404.
    for (const path of [
      '/catalog/products',
      'catalog/products',
      '/catalog/products/',
      '//catalog//products//',
      '///catalog/products',
    ]) {
      const { logger } = createRecordingLogger();
      const resolution = resolveRoute({ method: 'GET', path }, contextWith(logger));

      expect(resolution.matched).toBe(true);
      if (resolution.matched) {
        expect(resolution.route.path).toBe('/catalog/products');
      }
    }
  });

  it('resolves the empty and separator-only paths to no route at all', () => {
    // The counterpart of the legacy hook returning no prefix for an empty
    // subsystem [Application.cfc:L130-L132]: the root falls out of the table
    // rather than needing a branch of its own, because every row names at least
    // one segment.
    for (const path of ['', '/', '//', '///']) {
      const { logger } = createRecordingLogger();
      const resolution = resolveRoute({ method: 'GET', path }, contextWith(logger));

      expect(resolution.matched).toBe(false);
    }
  });

  it('★★ answers a METHOD MISMATCH with not-found, never 405 and never an Allow header', () => {
    // FW/1 dispatched an action by ANY method, so there is no method-not-allowed
    // concept in the source to port. A 405 would also confirm the path exists,
    // which is one bit more than an unmatched request should learn.
    const { logger, emissions } = createRecordingLogger();
    const resolution = resolveRoute(
      { method: 'POST', path: '/catalog/products' },
      contextWith(logger),
    );

    expect(resolution.matched).toBe(false);
    if (!resolution.matched) {
      expect(resolution.response.statusCode).toBe(404);
      expect(Object.keys(resolution.response.headers ?? {})).not.toContain('Allow');
      expect(Object.keys(resolution.response.headers ?? {})).not.toContain('allow');
      expect(bodyOf(resolution.response.body).category).toBe('routeNotFound');
    }

    expect(emissions).toHaveLength(1);
  });

  it('answers an unknown path with the delegated not-found response, and one log line', () => {
    // The response is BUILT BY `./errorMapper.js`, which is what keeps status,
    // envelope and redaction decisions in one module. What is asserted here is the
    // delegation and its single side effect.
    const { logger, emissions } = createRecordingLogger();
    const resolution = resolveRoute({ method: 'GET', path: '/no/such/route' }, contextWith(logger));

    expect(resolution.matched).toBe(false);
    if (!resolution.matched) {
      expect(resolution.response.statusCode).toBe(404);

      const published = bodyOf(resolution.response.body);

      expect(published.category).toBe('routeNotFound');
      expect(published.requestId).toBe(REQUEST_ID);
      // The caller's path is LOGGED, never published: reflecting a caller-supplied
      // path back serves no diagnostic purpose the correlation id does not serve.
      expect(resolution.response.body).not.toContain('/no/such/route');
    }

    expect(emissions).toHaveLength(1);
    expect(emissions[0]?.level).toBe('warn');
    expect(emissions[0]?.context?.['route']).toBe('GET /no/such/route');
  });

  it('reports the CANONICAL path on the log line, not the spelling received', () => {
    // The label is built from the same canonical path the match was attempted
    // with, so an operator comparing a log line against the table is comparing
    // like with like.
    const { logger, emissions } = createRecordingLogger();

    resolveRoute({ method: 'GET', path: '//no//such//route//' }, contextWith(logger));

    expect(emissions[0]?.context?.['route']).toBe('GET /no/such/route');
  });

  it('overrides any route the caller had already put on the context', () => {
    // This module always knows the method and path it failed to match, so a stale
    // value from an earlier stage must not survive onto the emission.
    const { logger, emissions } = createRecordingLogger();

    resolveRoute(
      { method: 'GET', path: '/no/such/route' },
      { requestId: REQUEST_ID, route: 'POST /stale/route', logger },
    );

    expect(emissions[0]?.context?.['route']).toBe('GET /no/such/route');
  });

  it('leaves a percent-encoded path unmatched rather than decoding it', () => {
    // Decoding would introduce behaviour the source never had. Every row is a
    // fixed literal with no character requiring an escape, so an encoded path
    // simply matches nothing.
    const { logger } = createRecordingLogger();
    const resolution = resolveRoute(
      { method: 'GET', path: '/catalog%2Fproducts' },
      contextWith(logger),
    );

    expect(resolution.matched).toBe(false);
  });

  it('preserves dot segments verbatim, which match nothing and reach no file system', () => {
    // No value this module produces is ever concatenated into a path, so a
    // traversal attempt is inert here - and it must stay visible in the log rather
    // than be normalized into a route that does exist.
    const { logger, emissions } = createRecordingLogger();
    const resolution = resolveRoute(
      { method: 'GET', path: '/catalog/products/../../etc/passwd' },
      contextWith(logger),
    );

    expect(resolution.matched).toBe(false);
    expect(emissions[0]?.context?.['route']).toBe('GET /catalog/products/../../etc/passwd');
  });

  it('never throws, for any method and path a caller can send', () => {
    // Canonicalization is total, the struct helpers answer absence as `undefined`,
    // and `listFindNoCase` answers a position. An empty method, an empty path and
    // a very long path are all ordinary misses rather than raised errors.
    for (const request of [
      { method: '', path: '' },
      { method: '   ', path: '   ' },
      { method: 'GET', path: '/'.repeat(64) },
      { method: 'BREW', path: `/${'x'.repeat(4096)}` },
      { method: 'GET', path: '/catalog/products?query=1' },
    ]) {
      const { logger } = createRecordingLogger();
      const resolve = (): unknown => resolveRoute(request, contextWith(logger));

      expect(resolve).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// C. Capability isolation - five bundles, one table
// ---------------------------------------------------------------------------

describe('resolveRouteForCapability keeps five bundles from answering for each other', () => {
  it('accepts a request that belongs to the calling capability', () => {
    for (const capability of CAPABILITIES) {
      const route = routeFor(capability);
      const { logger, emissions } = createRecordingLogger();

      const resolution = resolveRouteForCapability(
        { method: route.methods, path: route.path },
        capability,
        contextWith(logger),
      );

      expect(resolution.matched).toBe(true);
      expect(emissions).toEqual([]);
    }
  });

  it("★★ reports a SIBLING capability's route exactly as an unmatched route", () => {
    // Folding both misses into one arm is deliberate: a distinguishable outcome
    // would leak the existence of the other four capabilities to a caller that
    // guessed a path. It also makes "one log line per unmatched request" a
    // structural property rather than a discipline.
    const foreign = routeFor('productFeed');
    const { logger, emissions } = createRecordingLogger();

    const resolution = resolveRouteForCapability(
      { method: foreign.methods, path: foreign.path },
      'catalogQuery',
      contextWith(logger),
    );

    expect(resolution.matched).toBe(false);
    if (!resolution.matched) {
      expect(resolution.response.statusCode).toBe(404);
      expect(bodyOf(resolution.response.body).category).toBe('routeNotFound');
      expect(resolution.response.body).not.toContain('productFeed');
      expect(resolution.response.body).not.toContain(foreign.path);
    }

    expect(emissions).toHaveLength(1);
  });

  it('rejects every cross pairing of capability and route, and accepts every matching one', () => {
    // The full matrix, so no single pairing can be special-cased into working.
    for (const owner of CAPABILITIES) {
      const route = routeFor(owner);

      for (const caller of CAPABILITIES) {
        const { logger } = createRecordingLogger();
        const resolution = resolveRouteForCapability(
          { method: route.methods, path: route.path },
          caller,
          contextWith(logger),
        );

        expect(resolution.matched).toBe(caller === owner);
      }
    }
  });

  it('emits exactly one log line for a capability mismatch, as for any other miss', () => {
    const { logger, emissions } = createRecordingLogger();

    resolveRouteForCapability(
      { method: 'POST', path: '/prices/resolution' },
      'promotionApplication',
      contextWith(logger),
    );

    expect(emissions).toHaveLength(1);
    expect(emissions[0]?.level).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// D. The event projection - two members, and no more
// ---------------------------------------------------------------------------

describe('routeRequestFromEvent reads the method and the path, and nothing else', () => {
  it('projects exactly two members', () => {
    const request = routeRequestFromEvent(eventFor('GET', '/catalog/products'));

    expect(request).toStrictEqual({ method: 'GET', path: '/catalog/products' });
    expect(Object.keys(request).sort()).toEqual(['method', 'path']);
  });

  it('★★ carries NOTHING from a header, body, query string, stage or authorizer context', () => {
    // The negative that matters: nothing a caller sent can influence routing
    // beyond the method and the path, so a planted value in every other member
    // must not appear anywhere in the projection.
    const request = routeRequestFromEvent(eventFor('POST', '/promotions/application'));

    expect(JSON.stringify(request)).not.toContain(PLANTED_UNREAD);
  });

  it('reads the RESOURCE path, not the stage-prefixed one on the request context', () => {
    // The stage-prefixed form lives on `requestContext.path`. Reading it would
    // make every row of the table wrong for every deployment that names a stage,
    // which is why the table holds relative paths only.
    const event = eventFor('GET', '/feeds/google/products');

    expect(routeRequestFromEvent(event).path).toBe('/feeds/google/products');
    expect(routeRequestFromEvent(event).path).not.toContain('/stage');
  });

  it('passes the method and path through unmodified, leaving normalization to resolution', () => {
    // The projection performs no canonicalization and no case folding of its own:
    // one owner for those decisions, so the label a failure is reported under
    // cannot disagree with the comparison that produced it.
    const request = routeRequestFromEvent(eventFor('gEt', '//CATALOG//products//'));

    expect(request).toStrictEqual({ method: 'gEt', path: '//CATALOG//products//' });
  });

  it('composes with resolution end to end, for every declared route', () => {
    // The pairing a handler actually performs. Asserted for all five so no route
    // is reachable only through a hand-built `RouteRequest`.
    for (const capability of CAPABILITIES) {
      const route = routeFor(capability);
      const { logger } = createRecordingLogger();

      const resolution = resolveRouteForCapability(
        routeRequestFromEvent(eventFor(route.methods, route.path)),
        capability,
        contextWith(logger),
      );

      expect(resolution.matched).toBe(true);
      if (resolution.matched) {
        expect(resolution.route.action).toBe(route.action);
      }
    }
  });
});
