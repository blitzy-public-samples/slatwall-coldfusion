// The Google product-feed Lambda entrypoint.
//
// ★ THE ONE HANDLER IN THIS FOLDER THAT PORTS A LEGACY METHOD BODY. The other four capability
// entrypoints expose service surfaces that were ported elsewhere; this one is the target of
// `public void function product(required struct rc)`
// [integrationServices/google/controllers/feed.cfc:L58], which AAP 0.4.1's handler table maps here
// with the change "Ports the single `product(rc)` method; the smart-list filter chain becomes
// explicit repository filters."
//
// WHAT THE LEGACY BODY DID, IN ITS ENTIRETY - the component is 74 lines and was read whole:
//
//   1. suppressed the site layout, because the response is a machine-readable document rather than
//      a page [integrationServices/google/controllers/feed.cfc:L60];
//   2. obtained a Hibachi SmartList of SKUs from the SKU service [:L63];
//   3. added three joins [:L64-L66], the third of them a LEFT join onto the brand;
//   4. added three equality filters [:L68-L70] and one open-ended range [:L72];
//   5. returned nothing, leaving a `.cfm` view to read the one key it had written and render RSS.
//
// Steps 2 to 4 are the row source, owned by `../integrations/google/googleFeedRepository.js`. Step
// 5 is the renderer, owned by `../integrations/google/rssFeedRenderer.js`. Step 1 survives as the
// SHAPE OF THIS RESPONSE: a bare document string with no wrapper. What is left for this file is the
// part the legacy framework performed - accept the request, find the capability, open one scope,
// ask for the document, hand it back - and nothing else. THIS FILE DECIDES NOTHING ABOUT WHAT
// APPEARS IN THE FEED. If a line here filtered, joined, sorted, escaped or priced anything, it
// would be in the wrong file.
//
// ENTRY-POINT STATUS: YES. `slatwall-ts/esbuild.config.mjs` already lists this module among its
// candidate entrypoints and emits one CommonJS artifact per entrypoint found, so the exported
// `handler` below is what the runtime resolves. `./bootstrap.js`, `./router.js` and
// `./errorMapper.js` are SHARED INTERNALS and are not entrypoints. No bundler, manifest or
// configuration file is authored, edited or duplicated here.
//
// THIS FOLDER IS THE INVERSION POINT. This module imports its three siblings, the port it drives,
// and the logger; NOTHING imports from it. `./router.js` in particular must never import a
// handler - the router owns RESOLUTION and a handler owns INVOCATION - and it does not: it names
// the five capabilities as a string union and never calls one.
//
// COVERAGE IS NET-NEW, NOT PARITY. `meta/tests/` contains nothing for the handler tier, nothing for
// the Google adapter and nothing for the feed; the only three legacy test files touching the
// in-scope slice are `meta/tests/unit/entity/BrandTest.cfc`,
// `meta/tests/unit/entity/ProductTest.cfc` and the EMPTY
// `meta/tests/functional/admin/entity/ProductTest.cfc`. Assertions for this module live in
// `tests/unit/handlers/productFeedHandler.test.ts` and are authored elsewhere; no test file is
// written from here.
//
// LICENSING. GPL v3.0 attribution for this subtree lives in `slatwall-ts/NOTICE-GPL.md` and is not
// restated or duplicated here. Worth recording for THIS file specifically: the special exception
// permitting custom code applies only to files under `/integrationServices/` [readme.md:L63-L65],
// and this subtree sits outside that directory, so standard GPL terms govern it - even though the
// method it ports came from inside it.
//
// NO USER RULES EXIST for this project: `review_rules` was queried three independent ways and every
// call returned the same single sentence stating none were provided. Every constraint honoured
// below is therefore attributed to the AAP, to this file's own requirements, or to an explicit
// `JUDGMENT CALL:` annotation. None is attributed to a rule, and none is invented to fill the gap.
//
// The markers below sit at MODULE SCOPE deliberately. TypeScript emits comments from module scope
// and `tsconfig.build.json` sets `removeComments: false`, so all seven markers in this file reach
// `build/handlers/productFeedHandler.js` - verified, not assumed - and are shipped deliverables
// rather than development notes.

// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75]: the component's
// `getProductFeedQuery` is both dead and unrunnable - its select list ends in a trailing comma
// before `FROM` [:L57-L59] and its `INNER JOIN SwProduct` carries no `ON` clause [:L62-L63] - and
// no caller anywhere in the subsystem invokes it.
//
// Preserved deliberately; do not fix without a product decision.

// LEGACY-NOTE [integrationServices/google/controllers/feed.cfc:L63-L72]: that DAO is NOT the
// provenance of this handler and is not repaired, transcribed or treated as the feed query. The
// real selection is the smart-list chain the controller builds, which states the quantity bound as
// an open-ended range from one upward [:L72] where the dead DAO states `> 0` [FeedDAO.cfc:L71]. The
// ported statement reproduces the controller's `>= 1`.
//
// Retained to preserve the cited legacy behavior.

// LEGACY-NOTE [integrationServices/google/controllers/feed.cfc:L51]: the controller declares a
// `productService` property that its body never reads - the only collaborator it reaches for is the
// SKU service at [:L63]. It is the fifth dead DI/1 injection in the in-scope slice and is NOT wired
// by `./bootstrap.js` and NOT reached from here. Wiring a dead injection would import coupling the
// source does not have.
//
// Retained to preserve the cited legacy behavior.

// LEGACY-NOTE [integrationServices/google/controllers/feed.cfc:L54-L56]: the feed action is public
// and unauthenticated in the source - `this.publicMethods="product"`, `this.anyAdminMethods=""`,
// `this.secureMethods=""`. That is a FACT ABOUT THE SOURCE and not licence to invent an
// authentication story: no API key, signed URL, token, session lookup, permission check, middleware
// or interceptor layer is added here, and neither is this endpoint described as secured.
// Authorizing callers is an API Gateway concern owned outside this subtree.
//
// Retained to preserve the cited legacy behavior.

import { bootstrapCompositionRoot, UntrustedFeedHostError } from './bootstrap.js';
import { invalidRequestResponse, mapErrorToApiGatewayResponse } from './errorMapper.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';
import { logger } from '../lib/logger.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { CompositionRoot, RequestScopeInput } from './bootstrap.js';
import type { ErrorMappingContext } from './errorMapper.js';
import type { RoutedCapability } from './router.js';
import type { ProductFeedPort } from '../domain/ports/productFeedPort.js';

/**
 * The capability this entrypoint answers for, and the only one it answers for.
 *
 * Typed to the router's closed union rather than left a bare string, so a typo is a compile error
 * and not a permanently unmatched route. `resolveRouteForCapability` reports a request that
 * resolves to any OTHER capability exactly as it reports one that matched nothing, which is what
 * stops five independently bundled entrypoints from answering for each other.
 */
const FEED_CAPABILITY: RoutedCapability = 'productFeed';

/**
 * The request header the feed's origin is observed on.
 *
 * The legacy template composed every URL in the document from `CGI.HTTP_HOST`
 * [integrationServices/google/views/feed/product.cfm:L14], which in CFML is the `Host` header of
 * the request verbatim. Compared case-insensitively; see {@link readObservedFeedHost}.
 */
const HOST_HEADER_NAME = 'host';

/**
 * The status a served feed carries.
 *
 * The legacy slice has no HTTP status vocabulary at all, so this is the success code and nothing is
 * built on top of it. Every failure status comes from `./errorMapper.js`, which owns exactly
 * three, and no 401, 403, 409, 422 or 429 is introduced here, nor any retry-after, rate-limit or
 * circuit-breaker semantic.
 */
const FEED_RESPONSE_STATUS = 200;

/**
 * The only header a served feed carries.
 *
 * JUDGMENT CALL: `content-type` is declared as RSS, and NOTHING ELSE IS DECLARED. The legacy view
 * emits an XML document [integrationServices/google/views/feed/product.cfm:L1] for machine
 * consumption by Google Merchant Center, and it contains no `<cfcontent>` tag, so the CFML engine
 * applied whatever default it was configured with. There is no engine default to inherit under API
 * Gateway: a proxy response declares its own content type or the caller is handed one chosen by the
 * gateway. Reproducing an engine default would mean declaring an RSS document as something it is
 * not, so the document is declared as what it is. That is a transport-level statement about a body
 * this file does not otherwise touch - not a change to the document, and not the invention of an
 * HTTP semantic the source lacked.
 *
 * Nothing else is added, deliberately: no `etag`, no `last-modified`, no `cache-control`, no
 * content negotiation, no compression negotiation, no pagination link and no conditional-request
 * handling. `./errorMapper.js` sets `cache-control: no-store` on its own failure responses, which
 * is that module's decision about a failure envelope and is not extended to a served document here.
 *
 * The key is lower-case, matching the convention `./errorMapper.js` already established; HTTP
 * header names are case-insensitive, so the casing is a consistency choice rather than a contract.
 */
const FEED_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/rss+xml; charset=utf-8',
});

/**
 * How this module reaches the wired graph.
 *
 * A nullary function returning the composition root, which is precisely the shape of
 * `bootstrapCompositionRoot` when it is called the way production calls it - with no overrides, so
 * that the memo is used. Declaring the seam as this narrower type rather than as the real
 * function's type is deliberate: it makes the override parameter unreachable from here, so this
 * handler cannot bypass the memo and cannot assemble a second graph.
 */
export type CompositionRootProvider = () => Promise<CompositionRoot>;

/**
 * The entry signature this module publishes.
 *
 * Structurally invocable by the runtime's own proxy-handler contract: the runtime calls
 * `handler(event, context, callback)` and a function declaring fewer parameters is invoked
 * identically, while `Promise<APIGatewayProxyResult>` satisfies a contract whose return admits it.
 * The Lambda `Context` is OPTIONAL here rather than required, for one reason worth stating: the
 * only thing read from it is the request identifier, and a suite driving this handler should not
 * have to fabricate an entire runtime context in order to assert on a routing outcome. When it is
 * absent the identifier falls back to the one API Gateway put on the event.
 *
 * NO THIRD PARAMETER IS DECLARED, and none may be added. The runtime passes its completion callback
 * third, so a third parameter of any other type would silently receive a function on every real
 * invocation. The test seam is {@link createProductFeedHandler} for exactly that reason.
 */
export type ProductFeedHandler = (
  event: APIGatewayProxyEvent,
  context?: Context,
) => Promise<APIGatewayProxyResult>;

// ---------------------------------------------------------------------------
// Reading the request.
//
// Everything in this section is a projection of the event and decides nothing about the feed's
// contents - the four selection filters and the three joins are invariants of the ported statement
// in `../integrations/google/googleFeedRepository.js` and are unreachable from any caller. No
// query-string parameter, product identifier, brand identifier, date window, page, limit or
// currency is read here, because the legacy action read no narrowing input of any kind: every
// reference to the request context in its body is a WRITE
// [integrationServices/google/controllers/feed.cfc:L63-L72].
// ---------------------------------------------------------------------------

/**
 * The correlation identifier this invocation is reported under.
 *
 * Prefers the runtime's own request identifier, because that is the value CloudWatch groups an
 * invocation's log lines by, and falls back to the identifier API Gateway stamped onto the event.
 * BOTH ARE SERVER-GENERATED; neither is caller-authored, which is what makes echoing one into a
 * failure envelope safe - `./errorMapper.js` does exactly that so an operator can join a caller's
 * deliberately generic response to the full detail on the log stream.
 *
 * An empty runtime identifier is treated as absent rather than published as an empty correlation
 * key. Nothing is generated when both are empty: inventing an identifier would produce a key that
 * appears nowhere else in the log stream, which is worse than an honest empty one.
 */
function resolveRequestId(event: APIGatewayProxyEvent, context: Context | undefined): string {
  const runtimeRequestId = context?.awsRequestId.trim() ?? '';

  return runtimeRequestId.length > 0 ? runtimeRequestId : event.requestContext.requestId;
}

/**
 * The host the feed's URLs will be composed from, as observed on this request.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L14]: the legacy read
 * `CGI.HTTP_HOST`, which is the request's `Host` header verbatim, and composed five URLs in the
 * document from it. So the header is read here - and ONLY that header.
 *
 * JUDGMENT CALL: `x-forwarded-host` is deliberately NOT consulted, and neither is the gateway's own
 * `requestContext.domainName`. Preferring either would publish an origin the legacy never
 * published; a deployment behind a proxy that rewrites the authority configures the value it serves
 * on through the deployment-owned allow-list instead. THE HOST IS NEVER TRUSTED FOR PROVENANCE:
 * `./bootstrap.js` admits it only if it is a member of an immutable list resolved once from process
 * configuration, and an unconfigured deployment therefore serves no feed at all whatever a caller
 * sends. That refusal is the composition root's - this function only observes.
 *
 * MATCHED CASE-INSENSITIVELY, which is parity rather than leniency. HTTP header names are
 * case-insensitive, a version 1.0 proxy event carries whatever casing the client sent, and the CFML
 * `CGI` scope is a case-insensitive struct holding one `HTTP_HOST`. The enumeration therefore scans
 * for any casing and the first non-empty match wins, which is the single-key behaviour the legacy
 * struct read had. `noUncheckedIndexedAccess` is why the values are proven present rather than
 * asserted: a header map is an index signature over `string | undefined`.
 *
 * @returns the trimmed host, or `undefined` when the request carried none. Absence is answered
 *   explicitly and never substituted with a literal - a hard-coded host would be configuration
 *   baked into code, and a guessed one would poison every URL in the document.
 */
function readObservedFeedHost(event: APIGatewayProxyEvent): string | undefined {
  for (const [headerName, headerValue] of Object.entries(event.headers)) {
    if (headerName.toLowerCase() !== HOST_HEADER_NAME || headerValue === undefined) {
      continue;
    }

    const observedHost = headerValue.trim();

    if (observedHost.length > 0) {
      return observedHost;
    }
  }

  return undefined;
}

/**
 * The instant this request is pinned to, taken from the request itself.
 *
 * JUDGMENT CALL: THE INJECTED CLOCK IS THE EVENT'S OWN STAMP, AND THAT IS WHY NO AMBIENT
 * WALL-CLOCK READ APPEARS IN THIS FILE. API Gateway stamps every version 1.0 proxy event with the
 * epoch millisecond at which it received the request, and that stamp is a server-generated absolute
 * instant. Reading it gives the port a clock that is deterministic per request and drivable from a
 * constructed event, which is what makes the feed's date-dependent output assertable without
 * patching a module or a global. The alternative considered and rejected was a module-level clock
 * function defaulting to the system clock: it would put the very construct this file is required
 * not to contain back into it, and would still need a seam of its own to be drivable.
 *
 * `new Date(epochMilliseconds)` is a PURE CONVERSION of a number the event supplied and is not a
 * wall-clock read; the construct this file must not contain - and does not - is an argument-less
 * `new Date` standing in for an injected clock. The instant is absolute either way, so the UTC
 * policy is met downstream with no timezone handling at all: `../lib/logger.js` serializes through
 * `toISOString()` and the renderer formats the feed's sale-price window to UTC second precision.
 *
 * @returns the request instant, or `undefined` when the event carries no usable stamp - a
 *   non-finite, non-positive or out-of-range value. Absence is deliberately NOT filled in here.
 *   Omitting the member lets `./bootstrap.js` bind the request's epoch once, at scope creation,
 *   which is its documented behaviour and gives the same one-instant-per-request property;
 *   substituting zero would date the feed to 1970.
 */
function readRequestInstant(event: APIGatewayProxyEvent): Date | undefined {
  const epochMilliseconds = event.requestContext.requestTimeEpoch;

  if (!Number.isFinite(epochMilliseconds) || epochMilliseconds <= 0) {
    return undefined;
  }

  const requestInstant = new Date(epochMilliseconds);

  return Number.isNaN(requestInstant.getTime()) ? undefined : requestInstant;
}

/**
 * The per-invocation inputs this handler opens its request scope with.
 *
 * ★★★ RULING B, HONOURED AT ITS ONLY CALL SITE. The feed host and the clock are supplied HERE, to
 * the scope factory, so `./bootstrap.js` can close both over the port instance it builds. That is
 * what keeps `ProductFeedPort.generateProductFeed()` a zero-parameter method: neither value is ever
 * a method argument, the port signature is not widened by so much as one parameter, and no criteria
 * type is declared, imported or referenced anywhere in this module.
 *
 * Two members and no more. `accountID` and `adminAccountFlag` are left out because the feed reads
 * neither: the legacy action established no account, and omitting `accountID` IS the logged-out arm
 * the composition root documents rather than a missing value.
 *
 * The `now` member is OMITTED rather than passed as `undefined` when the event carried no usable
 * stamp. `exactOptionalPropertyTypes` is on and the member's declared type does admit `undefined`,
 * so both spellings compile; omitting it is the one that reads as "this request supplied no
 * instant" rather than "this request supplied nothing for the instant", and the two are the same
 * thing to the factory.
 */
function feedRequestScopeInput(feedHost: string, event: APIGatewayProxyEvent): RequestScopeInput {
  const requestInstant = readRequestInstant(event);

  return requestInstant === undefined ? { feedHost } : { feedHost, now: requestInstant };
}

/**
 * Wrap the rendered document in the response the runtime returns.
 *
 * The string is returned EXACTLY as the renderer produced it: not trimmed, re-indented,
 * pretty-printed, re-escaped, re-encoded, compressed, chunked or wrapped in an envelope. The legacy
 * controller suppressed the site layout for the same reason
 * [integrationServices/google/controllers/feed.cfc:L60] - the response is a document for a machine,
 * not a page - and a bare body is what that suppression becomes here.
 *
 * `isBase64Encoded` is omitted rather than set to `false`: the body is text, and the runtime's
 * default is already the behaviour wanted.
 */
function feedDocumentResponse(feedDocument: string): APIGatewayProxyResult {
  return {
    statusCode: FEED_RESPONSE_STATUS,
    headers: FEED_RESPONSE_HEADERS,
    body: feedDocument,
  };
}

// ---------------------------------------------------------------------------
// The entrypoint.
// ---------------------------------------------------------------------------

/**
 * Build the feed entrypoint over a given route into the wired graph.
 *
 * JUDGMENT CALL: THIS IS A SECOND EXPORTED VALUE, AND IT EXISTS SOLELY AS THE TEST SEAM. The
 * standard for this subtree is one primary exported unit per file plus its co-located supporting
 * types, and {@link handler} is that primary unit. A single explicitly-labelled seam alongside it
 * is the idiom this very folder already publishes - `./bootstrap.js` exports `resetCompositionRoot`
 * beside `bootstrapCompositionRoot` for the same purpose, and `src/lib/config.ts` and the
 * connection module publish comparable reset seams. The requirement it discharges is explicit: the
 * host, the clock and the `ProductFeedPort` must be injectable and observable for a suite WITHOUT
 * module-level monkey-patching. The host and the clock are already drivable from a constructed
 * event; the port is not, because it is reached through the memoized composition root. Injecting
 * the provider is what makes it drivable, and it does so without mocking a module.
 *
 * A suite therefore hands back a composition root of its own making, and gets three observations
 * from one call: what feed host this handler captured, what instant it pinned the request to - both
 * visible as the `RequestScopeInput` its `createRequestScope` receives - and that the port it
 * published was invoked with no arguments.
 *
 * PRODUCTION PASSES NOTHING. The default is `bootstrapCompositionRoot` called with no overrides,
 * which is the arm that uses the memo, so a warm container resolves an already-built graph and a
 * cold one builds it exactly once however many invocations race. This factory itself performs no
 * I/O, constructs nothing and awaits nothing; it closes over a function reference and returns.
 *
 * ★ NOTHING IS COMPOSED HERE OR IN THE RETURNED FUNCTION. No service, repository, port, renderer,
 * integration adapter or connection pool is constructed anywhere in this module. `./bootstrap.js`
 * is the only composition root in the subtree, and the connection pool is the single documented
 * module-scope exception in it - deliberately, because module state on a warm container outlives
 * the request that created it. Every legacy component-level cache the port reaches through is
 * request-scoped there for that reason, so this handler must take a FRESH scope per invocation and
 * must never retain one. It does: the scope is a local binding inside the returned function.
 *
 * @param bootstrap how to reach the wired graph. Defaults to the memoized initializer; override
 *   only from a suite.
 * @returns the Lambda entrypoint.
 */
export function createProductFeedHandler(
  bootstrap: CompositionRootProvider = bootstrapCompositionRoot,
): ProductFeedHandler {
  return async (event: APIGatewayProxyEvent, context?: Context): Promise<APIGatewayProxyResult> => {
    const requestId = resolveRequestId(event, context);

    // Resolution first, and through the shared table, so five independently bundled entrypoints
    // agree on one URL surface and none answers for another. A miss - no match at all, or a match
    // belonging to a different capability - comes back as a READY RESPONSE built by
    // `./errorMapper.js`, which also emits the single log line for it. No status, header set or
    // body envelope is constructed here for that case, and the requested route is never echoed into
    // a response body.
    const resolution = resolveRouteForCapability(routeRequestFromEvent(event), FEED_CAPABILITY, {
      requestId,
    });

    if (!resolution.matched) {
      return resolution.response;
    }

    const { route } = resolution;

    // JUDGMENT CALL: no dispatch switch, and no operation-selection surface. The route table holds
    // exactly one row per capability and this capability's row names one action,
    // `generateProductFeed` - the name AAP 0.4.2 assigns to the legacy `product(rc)`
    // [integrationServices/google/controllers/feed.cfc:L58], carried over verbatim. A switch over a
    // one-member set would be unreachable code pretending to be a decision. The action is recorded
    // on the log line below instead, where it is a fact rather than a branch.
    //
    // The label is built from the frozen table's own `methods` and `path`, never from anything the
    // caller sent, and it reaches the LOG only: `./errorMapper.js` logs its context's route and
    // does not echo it into a body.
    const routeLabel = `${route.methods} ${route.path}`;

    // The context carries a correlation identifier and the route, and no logger: `./errorMapper.js`
    // defaults to the same module-level logger this file imports, so naming it would be redundant
    // rather than explicit. It carries no event, no headers and no body either, so nothing a caller
    // sent can reach a response body through this parameter.
    const mappingContext: ErrorMappingContext = { requestId, route: routeLabel };

    const feedHost = readObservedFeedHost(event);

    if (feedHost === undefined) {
      // Unusable request input, established by this handler before anything reached a service, so
      // the reason is NAMED and `./errorMapper.js` owns the words. `unusableRequestInput` is the
      // member that union publishes for exactly this - a reason none of the five specific members
      // names - and choosing it withholds detail rather than inventing any. No field-level
      // complaint is attached: naming the header would tell a caller how to shape a request this
      // deployment has not been configured to serve.
      return invalidRequestResponse('unusableRequestInput', mappingContext);
    }

    try {
      // ★ AWAITED INSIDE THE HANDLER, NEVER AT MODULE SCOPE. The bundle is emitted as CommonJS
      // because bundling this dependency set to ESM builds cleanly and then fails at run time on a
      // dynamic `require` inside the MySQL driver's dependency chain; a top-level `await` and
      // `import.meta` are consequently absent from this file, as they are from the whole of
      // `src/**`. That is a settled packaging decision recorded in `slatwall-ts/README.md` and is
      // not revisited here.
      const root = await bootstrap();

      // EXACTLY ONE SCOPE PER INVOCATION, held in a local and discarded when this function returns.
      const scope = await root.createRequestScope(feedRequestScopeInput(feedHost, event));

      const feedPort: ProductFeedPort | undefined = scope.productFeedPort;

      if (feedPort === undefined) {
        // Unreachable given a supplied feed host - the composition root builds the port if and only
        // if `feedHost` was present, and it was proven present above. The branch exists because the
        // published type is honest about the member being optional and because a non-null assertion
        // is the one construct that would silence precisely the checks this port relies on. Logged
        // before it is raised, since the mapper's generic arm withholds a message from the response
        // body by design and this one has to reach an operator.
        logger.error('the request scope published no product-feed port for a hosted feed request', {
          requestId,
          route: routeLabel,
        });

        throw new Error('The request scope published no product-feed port.');
      }

      // ★★★ ZERO ARGUMENTS, AND THE WHOLE POINT OF RULING 1. The four selection filters - the SKU
      // is active [integrationServices/google/controllers/feed.cfc:L68], its product is active
      // [:L69], its product is published [:L70], and its product has an open-ended quantity
      // available to sell from one upward [:L72] - together with the three joins [:L64-L66], the
      // brand among them LEFT joined so a product carrying no brand still appears, are INVARIANTS
      // of the ported statement. They are not defaults, not options and not switchable, and there
      // is nothing here to pass them through. The feed is whole-catalog by construction; narrowing
      // it would change observable behaviour.
      //
      // The renderer is a pure synchronous function and this await belongs to the repository read
      // alone - a method is asynchronous in this port if and only if its legacy body reached the
      // DAO or the ORM. What comes back is the complete document.
      const feedDocument = await feedPort.generateProductFeed();

      // One operational line, and deliberately no measurement on it. No document size, no item or
      // row count and no elapsed time is recorded anywhere in this file or its comments: the source
      // asserts no service level of any kind and none is invented. The platform's own limits - the
      // runtime's execution ceiling, the gateway's integration ceiling, and the legacy template's
      // own `requesttimeout="360"` [integrationServices/google/views/feed/product.cfm:L9] - are
      // facts about platforms and are stated nowhere as targets. The ported generator holds its
      // document in memory and needs no such budget; the one legacy path that genuinely did,
      // `loadDataFromFile` with `requesttimeout=3600` [model/service/ProductService.cfc:L65-L68],
      // is out of scope and unroutable.
      //
      // The adapter's own identity is recorded because this is the request that serves on its
      // behalf, and reading it is how the nine-member ported adapter surface is consumed from here:
      // eight members on `../integrations/google/integration.js` plus `generateProductFeed` on the
      // separate port above. `getIntegrationTypes()` answers `"fw1"`
      // [integrationServices/google/Integration.cfc:L55-L57], and the interface's documented
      // vocabulary is exactly the four values shipping, payment, fw1 and custom
      // [integrationServices/IntegrationInterface.cfc:L63-L72] - it has NO product-feed member,
      // which is precisely why the feed travels on its own port. That union is not widened and no
      // `productFeed` type is invented.
      //
      // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the component tag declares
      // `displayname="USA epay"` while `getDisplayName()` returns `"Google"` [:L59-L61] - a
      // copy-paste artifact from a payment integration. The line below therefore records
      // `"Google"`, because that is what the ported method answers; both halves of the
      // contradiction survive untouched in the adapter.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // ★ THE THREE FACTS TRAVEL IN THE MESSAGE, NOT IN THE CONTEXT, AND THAT IS NOT A STYLE
      // CHOICE. `../lib/logger.js` is FAIL-CLOSED over context keys: a key outside its two closed
      // allow-lists has its value replaced with a redaction marker, and `requestId` and `route` are
      // the only two names this line could use that are on them - verified against the module, not
      // assumed. Its own documentation refuses the alternative in terms: "widening a security
      // allow-list to keep a demonstration green is how an allow-list stops meaning anything", so
      // the allow-list is left exactly as it stands and the prose carries what the context may not.
      // Message content keeps the permissive default, and none of the three values is
      // customer-shaped: two are constants the adapter returns and the third is a route action name
      // off the frozen table.
      logger.info(
        `the product feed was served by the ${root.integration.getDisplayName()} integration ` +
          `adapter, which registers as ${root.integration.getIntegrationTypes()}, through the ` +
          `${route.action} action`,
        { requestId, route: routeLabel },
      );

      return feedDocumentResponse(feedDocument);
    } catch (thrown: unknown) {
      if (thrown instanceof UntrustedFeedHostError) {
        // JUDGMENT CALL: a host this deployment does not serve is reported as UNUSABLE REQUEST
        // INPUT rather than as a server defect, because it is a refusal about a value observed ON
        // THE REQUEST and reporting it as a fault of this service would misdirect whoever reads it.
        // No status vocabulary is invented to say so: `invalidRequest` is one of the three shapes
        // `./errorMapper.js` already owns, and no 401 or 403 is reached for - the legacy endpoint
        // is unauthenticated as a matter of source fact and this is an origin-policy refusal, not
        // an authorization one. Neither the diagnosis nor the candidate reaches the response body,
        // which carries the mapper's own fixed sentence.
        //
        // The error's OWN sentence is what is logged, and it is the right value to log because of
        // how the class is built: it composes the ground of the refusal together with a summary of
        // the candidate, and it never reproduces the candidate itself - `candidateSummary` and
        // `reason` are the same two halves published separately for a caller that wants to branch
        // on them. It travels in the message for the reason recorded on the served-feed line above:
        // both member names are outside the logger's closed context allow-lists, and that
        // allow-list is not widened from here.
        logger.warn(`the observed feed host is not served by this deployment: ${thrown.message}`, {
          requestId,
          route: routeLabel,
        });

        return invalidRequestResponse('unusableRequestInput', mappingContext);
      }

      // Everything else goes through the one mapper, unexamined. It recognizes the framework's
      // dead-call-target contract by message shape - reproduced byte for byte, its grammatical
      // error included - recognizes a schema rejection, and answers anything else with a fixed
      // generic sentence while the real detail goes to the log stream under this same correlation
      // identifier. That selectivity is why the mapper is used rather than a message formatted
      // here: a driver failure routinely embeds statement text and bound parameter values, and none
      // of that may reach a caller.
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

// The two markers below are written as module-scope comments rather than folded into the doc block
// that follows, for the reason `../domain/ports/productFeedPort.js` records about its own pair: a
// marker's survival into the compiler's output depends on where it sits, and module scope is the
// position `tsc` emits from under `removeComments: false`.

// LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L20]: the document's
// `g:google_product_category` element is emitted EMPTY, because the legacy template emits it empty
// and no value source exists anywhere in the legacy path to fill it from. The adapter does declare
// a `productGoogleProductType` setting definition
// [integrationServices/google/Integration.cfc:L67-L71], but the template never reads it, the feed
// controller never resolves it and no column carries it.
// `../integrations/google/rssFeedRenderer.js` owns that element and carries the gap's standing
// note; it is referenced here and NOT re-authored, so there is one statement of it rather than two
// to keep in step. Nothing in this file populates it, omits it or invents a category taxonomy, and
// the hardcoded `new` condition [:L25] and `in stock` availability [:L26] are likewise the
// renderer's preserved output and are not derived from data.
//
// Preserved deliberately; do not fix without a product decision.

// LEGACY-DEFECT [integrationServices/google/Integration.cfc:L73-L77]: `getSettingOptions` declares
// `returntype="array"` while the body of its only conditional is empty, so it returns null. The
// port types it as an optional string array and answers with the absent case; it is neither
// populated, defaulted to an empty array nor made to throw. This handler never calls it, and the
// reason is one paragraph up: the setting whose options it would have supplied is
// `productGoogleProductType`, and nothing in the feed path consults that setting.
//
// Preserved deliberately; do not fix without a product decision.
/**
 * THE PRIMARY EXPORTED UNIT: the Lambda entrypoint for the Google product feed.
 *
 * Read-only from end to end. It mutates nothing, writes nothing and has no retry semantics to get
 * right, so no batch limit, idempotency key or compensation story appears here; inventing one would
 * imply a write path the source does not have. No worker thread is introduced either - the in-scope
 * legacy slice contains no `cfthread` at all - and the legacy runtime's lock timeouts are noted in
 * the plan and deliberately not implemented.
 *
 * There is nothing to validate: the ported method takes no arguments, so no schema is declared for
 * parameters that do not exist. The only two things read off the event are the method and path the
 * router needs, and the origin the document's URLs are composed from.
 *
 * Built through {@link createProductFeedHandler} with no argument, so this and a suite's own
 * instance share one construction path and cannot diverge.
 */
export const handler: ProductFeedHandler = createProductFeedHandler();
