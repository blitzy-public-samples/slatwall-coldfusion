// The Google product-feed Lambda entrypoint.
//
// The one handler in this folder that ports a legacy method body:
// `public void function product(required struct rc)`
// [integrationServices/google/controllers/feed.cfc:L58].
//
// Steps 2 to 4 are the row source, owned by `../integrations/google/googleFeedRepository.js`.
//
// The markers below sit at MODULE SCOPE so `tsc` emits them into `build/` under
// `tsconfig.build.json`'s `removeComments: false`.

// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75]: `getProductFeedQuery` is
// both dead and unrunnable - its select list ends in a trailing comma before `FROM` and its
// `INNER JOIN` carries no `ON` clause.
// Preserved deliberately; do not fix without a product decision.

// LEGACY-NOTE [integrationServices/google/controllers/feed.cfc:L63-L72]: that DAO is not the
// provenance of this handler and is not repaired, transcribed or treated as the feed query.

// LEGACY-NOTE [integrationServices/google/controllers/feed.cfc:L51]: the controller declares a
// `productService` property that its body never reads - the only collaborator it reaches for is
// the SKU service at [integrationServices/google/controllers/feed.cfc:L63].

// LEGACY-NOTE [integrationServices/google/controllers/feed.cfc:L54-L56]: the feed action is public
// and unauthenticated in the source - `this.publicMethods="product"`, `this.anyAdminMethods=""`,
// `this.secureMethods=""`.

import { bootstrapCompositionRoot, UntrustedFeedHostError } from './bootstrap.js';
import {
  invalidRequestResponse,
  mapErrorToApiGatewayResponse,
  resolveServerRequestId,
  routeDiagnosticLabel,
  routeNotFoundResponse,
} from './errorMapper.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';
import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { CompositionRoot, RequestScopeInput } from './bootstrap.js';
import type { ErrorMappingContext } from './errorMapper.js';
import type { RouteAction, RoutedCapability } from './router.js';
import type { FeedCriteria, ProductFeedPort } from '../domain/ports/productFeedPort.js';

/**
 * The capability this entrypoint answers for, and the only one it answers for.
 *
 * Typed to the router's closed union rather than left a bare string, so a typo is a compile error
 * and not a permanently unmatched route.
 */
const FEED_CAPABILITY: RoutedCapability = 'productFeed';

/**
 * The request header the feed's origin is observed on.
 *
 * The legacy template composed every URL in the document from `CGI.HTTP_HOST`
 * [integrationServices/google/views/feed/product.cfm:L14].
 */
const HOST_HEADER_NAME = 'host';

/**
 * The status a served feed carries.
 *
 * The legacy slice has no HTTP status vocabulary at all, so this is the success code and nothing
 * is built on top of it.
 */
const FEED_RESPONSE_STATUS = 200;

/**
 * The only header a served feed carries.
 *
 * JUDGMENT CALL: `content-type` is declared as RSS, and nothing else is declared.
 *
 * `./errorMapper.js` does set `cache-control: no-store` on its own failure responses, which is
 * that module's decision about a failure envelope and is not extended to a served document here.
 */
const FEED_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/rss+xml; charset=utf-8',
});

/**
 * How this module reaches the wired graph.
 *
 * A nullary function returning the composition root, which is precisely the shape of
 * `bootstrapCompositionRoot` when it is called the way production calls it - with no overrides.
 */
export type CompositionRootProvider = () => Promise<CompositionRoot>;

/**
 * What this handler may be built over, for a suite that needs to drive it without a database.
 *
 * Both members are optional and both default to the production wiring, so the exported `handler`
 * is still built with no arguments and the deployed behaviour is unchanged.
 */
export interface ProductFeedHandlerDependencies {
  /**
   * How to reach the wired graph.
   */
  readonly compositionRoot?: CompositionRootProvider | undefined;

  /**
   * Where structured lines are emitted. Defaults to the process logger, which writes JSON to
   * stdout for the platform to collect.
   */
  readonly logger?: Logger | undefined;
}

/**
 * The entry signature this module publishes.
 */
export type ProductFeedHandler = (
  event: APIGatewayProxyEvent,
  context?: Context,
) => Promise<APIGatewayProxyResult>;

// Reading the request.
//
// Everything in this section is a projection of the event and decides nothing about the feed's
// contents.

/**
 * The host the feed's URLs will be composed from, as observed on this request.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L14]: the legacy read
 * `CGI.HTTP_HOST`, which is the request's `Host` header verbatim, and composed five URLs in the
 * document from it. So the header is read here - and only that header.
 *
 * JUDGMENT CALL: `x-forwarded-host` is deliberately not consulted, and neither is the gateway's
 * own `requestContext.domainName`.
 *
 * @returns the trimmed host, or `undefined` when the request carried none.
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
 * `new Date(epochMilliseconds)` is a PURE CONVERSION of a number the event supplied and is not a
 * wall-clock read; the construct this file must not contain - and does not.
 *
 * @returns the request instant, or `undefined` when the event carries no usable stamp - a
 * non-finite, non-positive or out-of-range value.
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
 * The two values are still supplied here and this is still their only call site - what changed is
 * where they go.
 *
 * The `now` member is OMITTED rather than passed as `undefined` when the event carried no usable
 * stamp.
 */
function feedRequestScopeInput(feedHost: string, event: APIGatewayProxyEvent): RequestScopeInput {
  const requestInstant = readRequestInstant(event);

  return requestInstant === undefined ? { feedHost } : { feedHost, now: requestInstant };
}

/**
 * Wrap the rendered document in the response the runtime returns.
 *
 * The string is returned EXACTLY as the renderer produced it: not trimmed, re-indented,
 * pretty-printed, re-escaped, re-encoded, compressed, chunked or wrapped in an envelope.
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

/**
 * The one route action this module implements.
 *
 * Revision carried a `JUDGMENT CALL` arguing that "a switch over a one-member set would be
 * unreachable code pretending to be a decision", and used the resolved action as a LOG VALUE only.
 *
 * Typed to the router's own `RouteAction` union rather than written as a bare string.
 */
const IMPLEMENTED_ROUTE_ACTION: RouteAction = 'generateProductFeed';

/**
 * Raised when a scope built for a hosted feed request published no port.
 */
class MissingProductFeedPortError extends Error {
  public constructor() {
    super('The request scope published no product-feed port.');
    this.name = 'MissingProductFeedPortError';
  }
}

// The assertion for all of this lives in `tests/unit/handlers/productFeedHandler.test.ts`, which
// drives the whole document through unpaginated and byte-identical.

// What is already true, so the residual is bounded rather than open.

/**
 * Build the feed entrypoint over a given route into the wired graph.
 *
 * JUDGMENT CALL: a second exported value, and it exists as the INJECTION SEAM. The standard for
 * this subtree is one primary exported unit per file plus its co-located supporting types, and
 * {@link handler} is that primary unit.
 *
 * Nothing is composed here or `IN` the returned function.
 *
 * @param dependencies how to reach the wired graph and where to emit.
 * @returns the Lambda entrypoint.
 */
export function createProductFeedHandler(
  dependencies: ProductFeedHandlerDependencies = {},
): ProductFeedHandler {
  const bootstrap: CompositionRootProvider =
    dependencies.compositionRoot ?? bootstrapCompositionRoot;
  const logger: Logger = dependencies.logger ?? processLogger;

  return async (event: APIGatewayProxyEvent, context?: Context): Promise<APIGatewayProxyResult> => {
    const requestId = resolveServerRequestId(event, context);
    const resolution = resolveRouteForCapability(routeRequestFromEvent(event), FEED_CAPABILITY, {
      requestId,
      logger,
    });

    if (!resolution.matched) {
      return resolution.response;
    }

    const { route } = resolution;
    const routeLabel = routeDiagnosticLabel(route.methods, route.path);

    // The premise held only while this handler could not be built over a different sink.
    //
    // It still carries no event, no headers and no body, so nothing a caller sent can reach a
    // response body through this parameter.
    const mappingContext: ErrorMappingContext = { requestId, route: routeLabel, logger };
    if (route.action !== IMPLEMENTED_ROUTE_ACTION) {
      return routeNotFoundResponse(mappingContext);
    }

    const feedHost = readObservedFeedHost(event);

    if (feedHost === undefined) {
      // Unusable request input, established by this handler before anything reached a service, so
      // the reason is NAMED and `./errorMapper.js` owns the words.
      return invalidRequestResponse('unusableRequestInput', mappingContext);
    }

    try {
      // Awaited inside the handler, never at module scope.
      const root = await bootstrap();

      // Exactly one scope per invocation, held in a local and discarded when this function
      // returns.
      const scope = await root.createRequestScope(feedRequestScopeInput(feedHost, event));

      const feedPort: ProductFeedPort | undefined = scope.productFeedPort;

      // The criteria comes from the scope, not from this file, and that is deliberate.
      const feedCriteria: FeedCriteria | undefined = scope.feedCriteria;

      if (feedPort === undefined || feedCriteria === undefined) {
        // Unreachable given a supplied feed host - the composition root publishes the port and the
        // criteria under one condition, `feedHost` was proven present above.
        //
        // Both are TESTED in one CONDITION because the root publishes them together; testing only
        // the port would leave the criteria narrowing to a caller's assumption.
        throw new MissingProductFeedPortError();
      }

      // The renderer is a pure synchronous function and this await belongs to the repository read
      // alone.
      const feedDocument = await feedPort.generateProductFeed(feedCriteria);

      // One operational line, and deliberately no measurement on it.
      //
      // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the component tag declares
      // `displayname="USA epay"` while `getDisplayName()` returns `"Google"`
      // [integrationServices/google/Integration.cfc:L59-L61].
      // Preserved deliberately; do not fix without a product decision.
      logger.info(
        `the product feed was served by the ${root.integration.getDisplayName()} integration ` +
          `adapter, which registers as ${root.integration.getIntegrationTypes()}`,
        { requestId, route: routeLabel, capability: FEED_CAPABILITY, action: route.action },
      );

      return feedDocumentResponse(feedDocument);
    } catch (thrown: unknown) {
      if (thrown instanceof UntrustedFeedHostError) {
        // JUDGMENT CALL: a host this deployment does not serve is reported as unusable request
        // input rather than as a server defect.
        //
        // The error's own sentence is the right value to pass, because of how the class is built:
        // it composes the ground of the refusal together with a SUMMARY of the candidate.
        return invalidRequestResponse(
          'unusableRequestInput',
          mappingContext,
          undefined,
          `the observed feed host is not served by this deployment: ${thrown.message}`,
        );
      }

      // Everything else goes through the one mapper, unexamined.
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

// The two markers below are written as module-scope comments rather than folded into the doc block
// that follows, because module scope is the position `tsc` emits from under
// `removeComments: false`.

// LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L20]: the document's
// `g:google_product_category` element is emitted EMPTY, and there is no adjacent source TODO.
// Preserved deliberately; do not fix without a product decision.

// LEGACY-DEFECT [integrationServices/google/Integration.cfc:L73-L77]: `getSettingOptions` declares
// `returntype="array"` while the body of its only conditional is empty, so it returns null.
// Preserved deliberately; do not fix without a product decision.
/**
 * The primary exported unit: the Lambda entrypoint for the Google product feed.
 *
 * The lambda adapter itself still validates and still reads the event.
 *
 * Built through {@link createProductFeedHandler} with no argument, so this and a suite's own
 * instance share one construction path and cannot diverge.
 */
export const handler: ProductFeedHandler = createProductFeedHandler();
