// The Google product-feed Lambda entrypoint, under test.
//
// Subject: `src/handlers/productFeedHandler.ts`, whose two exported values are
// `createProductFeedHandler` and `handler`.
//
// NET-NEW COVERAGE, never presented as parity: no legacy test file touches the feed, the Google
// adapter or the handler tier.
//
// `tests/unit/handlers` carries EIGHT suites: the five capability entrypoints - catalog query, SKU
// resolution, promotion application, price resolution and this one - plus `bootstrap.test.ts`.

// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75]: `getProductFeedQuery`
// is both unrunnable and dead - a trailing comma in the select list and a join with no `ON`.
// Preserved deliberately; do not fix without a product decision.

// LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L20]: the
// `g:google_product_category` element is emitted EMPTY, and there is no TODO comment on or beside
// that line.
// Preserved deliberately; do not fix without a product decision.

// LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the component tag declares
// `displayname="USA epay"` while `getDisplayName()` returns `"Google"`
// [integrationServices/google/Integration.cfc:L59-L61].
// Preserved deliberately; do not fix without a product decision.

// LEGACY-DEFECT [integrationServices/google/Integration.cfc:L73-L77]: `getSettingOptions` declares
// `returntype="array"` and contains no return statement on any path, so it answers null for every
// name.
// Preserved deliberately; do not fix without a product decision.

// CFML parity [integrationServices/google/controllers/feed.cfc:L60]: request.layout = false, so
// the target returns a bare document string with no layout wrapper.

// CFML parity [integrationServices/google/controllers/feed.cfc:L51-L52]: property productService
// (L51) is a DEAD DI/1 injection - the body uses only getSkuService() (L52, used at L63).

// CFML parity [integrationServices/google/views/feed/product.cfm:L14-L24]: the host is
// interpolated with a hardcoded http:// scheme from CGI.HTTP_HOST at
// [integrationServices/google/views/feed/product.cfm:L14],
// [integrationServices/google/views/feed/product.cfm:L15],
// [integrationServices/google/views/feed/product.cfm:L22],
// [integrationServices/google/views/feed/product.cfm:L23] and
// [integrationServices/google/views/feed/product.cfm:L24], which is why the target injects the
// feed host explicitly.

// CFML parity [integrationServices/IntegrationInterface.cfc:L65]: the doc comment (carrying the
// typo "seperated") describes a comma-separated LIST of types, so the contract permits multiples;
// Google returns a single-element list.

// CFML parity [integrationServices/google/Integration.cfc:L74]: the comparison uses eq and is
// case-insensitive.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { UntrustedFeedHostError } from '../../../src/handlers/bootstrap.js';
// A namespace import ALONGSIDE the named one, and the only namespace import in this file.
import * as productFeedHandlerModule from '../../../src/handlers/productFeedHandler.js';
import { createProductFeedHandler, handler } from '../../../src/handlers/productFeedHandler.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import { GoogleFeedService } from '../../../src/integrations/google/googleFeedService.js';
import { GoogleIntegration } from '../../../src/integrations/google/integration.js';
import { logger as processLogger } from '../../../src/lib/logger.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { FeedCriteria, ProductFeedPort } from '../../../src/domain/ports/productFeedPort.js';
import type {
  CompositionRoot,
  InspectableRequestScope,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import type { ErrorResponseBody } from '../../../src/handlers/errorMapper.js';
import type { Logger } from '../../../src/lib/logger.js';
import type { GoogleProductFeedRow } from '../../../src/integrations/google/googleFeedRepository.js';
import type {
  GoogleProductFeedRenderer,
  GoogleProductFeedRowSource,
} from '../../../src/integrations/google/googleFeedService.js';
import type { IntegrationType } from '../../../src/integrations/integrationInterface.js';

/**
 * The frozen route row this entrypoint answers, read from the shared table, not restated.
 */
const FEED_ROUTE = ROUTE_TABLE.productFeed;

/**
 * The origin host the document's links are composed from.
 *
 * A reserved-for-testing name, so it can never resolve anywhere.
 */
const FEED_HOST = 'shop.example.test';

/**
 * The instant this suite pins every request to, written as an explicit UTC ISO-8601 literal.
 *
 * No ambient clock read appears in this file - no argument-less `new Date`, no `Date.now`, no fake
 * timer.
 */
const REQUEST_INSTANT_ISO = '2024-03-05T12:34:56.000Z';

/**
 * The same instant as a `Date`. A pure conversion of the literal above, not a wall-clock read.
 */
const REQUEST_INSTANT = new Date(REQUEST_INSTANT_ISO);

/**
 * The instant the composition-root double falls back to when a request supplied none.
 *
 * The real root binds its own epoch once at scope creation.
 */
const SCOPE_FALLBACK_INSTANT_ISO = '2019-11-30T01:02:03.000Z';

/**
 * The fallback instant as a `Date`.
 */
const SCOPE_FALLBACK_INSTANT = new Date(SCOPE_FALLBACK_INSTANT_ISO);

/**
 * The identifier API Gateway stamps onto the event. Server-generated, never a caller's.
 */
const GATEWAY_REQUEST_ID = 'gateway-0000-0000-0000-000000000001';

/**
 * The correlation identifier the Lambda runtime supplies on its context object.
 */
const RUNTIME_REQUEST_ID = 'runtime-0000-0000-0000-000000000002';

/**
 * The label the route is reported under: the table's own methods and path, never a caller's.
 */
const FEED_ROUTE_LABEL = `${FEED_ROUTE.methods} ${FEED_ROUTE.path}`;

/**
 * The body message `src/handlers/errorMapper.ts` publishes for a request that matched no route.
 */
const ROUTE_NOT_FOUND_MESSAGE = 'The requested route does not exist.';

/**
 * The body message for unusable request input, schema-rejected or handler-established.
 */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

/**
 * The fixed, deliberately uninformative body message for an unrecognized failure.
 */
const GENERIC_FAILURE_MESSAGE = 'The request could not be completed.';

/**
 * The one content type a served feed declares.
 */
const FEED_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';

// All hand-written, all suite-local, all typed against the shipped contracts, and all built fresh
// inside each test.

/**
 * Refuse a member of a double that the entrypoint is not supposed to reach.
 *
 * The declared `never` return is what lets an accessor stand in for a member of any type at all.
 */
function unreachableMember(owner: string, member: string): never {
  throw new Error(
    `${owner}.${member} was read, and this entrypoint is not supposed to read it. ` +
      'The product-feed handler reaches CompositionRoot.integration, ' +
      'CompositionRoot.createRequestScope and RequestScope.productFeedPort and nothing else.',
  );
}

/**
 * One request's scope, publishing the feed port and refusing everything else.
 *
 * The real scope is built per invocation and discarded when the handler returns, which is what
 * keeps a warm container from serving one request's state to the next.
 */
class FeedRequestScopeDouble implements RequestScope {
  public readonly productFeedPort: ProductFeedPort | undefined;

  /**
   * The AAP 0.4.2 argument of `generateProductFeed`, published beside the port it is passed to.
   *
   * The real root publishes the two under one condition - a request that carried no feed host gets
   * neither - so this double takes them as one pair rather than as two independent members.
   */
  public readonly feedCriteria: FeedCriteria | undefined;

  public constructor(
    productFeedPort: ProductFeedPort | undefined,
    feedCriteria: FeedCriteria | undefined,
  ) {
    this.productFeedPort = productFeedPort;
    this.feedCriteria = feedCriteria;
  }

  public get now() {
    return unreachableMember('RequestScope', 'now');
  }

  public get currentAccountContext() {
    return unreachableMember('RequestScope', 'currentAccountContext');
  }

  // The feed binds no entity from an identifier: `generateProductFeed`'s one argument carries only
  // the request's origin authority and instant, and the four selection filters are invariants of
  // the ported statement.
  public get entityLoaders() {
    return unreachableMember('RequestScope', 'entityLoaders');
  }

  // The feed decides no price at all, so it has no price group to be entitled to.
  public get priceGroupEntitlements() {
    return unreachableMember('RequestScope', 'priceGroupEntitlements');
  }

  public get roundingRuleService() {
    return unreachableMember('RequestScope', 'roundingRuleService');
  }

  public get brandService() {
    return unreachableMember('RequestScope', 'brandService');
  }

  public get optionService() {
    return unreachableMember('RequestScope', 'optionService');
  }

  public get skuService() {
    return unreachableMember('RequestScope', 'skuService');
  }

  public get productService() {
    return unreachableMember('RequestScope', 'productService');
  }

  public get priceGroupService() {
    return unreachableMember('RequestScope', 'priceGroupService');
  }

  public get promotionService() {
    return unreachableMember('RequestScope', 'promotionService');
  }

  public get currencyConverter() {
    return unreachableMember('RequestScope', 'currencyConverter');
  }

  public materializeOrderView() {
    return unreachableMember('RequestScope', 'materializeOrderView');
  }

  public updateOrderAmountsWithPriceGroupsThenPromotions() {
    return unreachableMember('RequestScope', 'updateOrderAmountsWithPriceGroupsThenPromotions');
  }

  public getSalePriceDetailsForProductSkus() {
    return unreachableMember('RequestScope', 'getSalePriceDetailsForProductSkus');
  }

  /**
   * REFUSES, and the refusal is a claim about the feed route rather than a gap in the double.
   */
  public prepareAddressZoneEvaluation() {
    return unreachableMember('RequestScope', 'prepareAddressZoneEvaluation');
  }
}

/**
 * How a scope's feed port is decided from the input the handler supplied.
 *
 * A function rather than a fixed instance, because the composition root's documented behaviour is
 * that it builds the port if and only if a feed host was present.
 */
type FeedPortResolver = (input: RequestScopeInput) => ProductFeedPort | undefined;

/**
 * The composition root the entrypoint is handed.
 */
class FeedCompositionRootDouble implements CompositionRoot {
  public readonly integration = new GoogleIntegration();

  public readonly scopeInputs: RequestScopeInput[] = [];

  private readonly resolvePort: FeedPortResolver;

  private readonly scopeRejection: Error | undefined;

  public constructor(resolvePort: FeedPortResolver, scopeRejection?: Error) {
    this.resolvePort = resolvePort;
    this.scopeRejection = scopeRejection;
  }

  /**
   * Open one request's scope.
   *
   * Not `async`: the body awaits nothing, and declaring it `async` to look the part would trip
   * `require-await`.
   *
   * The recorded copy is a fresh object, so a later mutation of the handler's own input - there is
   * none, but a double must not be the reason a suite believes that - cannot rewrite history.
   */
  public createRequestScope(input?: RequestScopeInput): Promise<RequestScope> {
    const received: RequestScopeInput = input ?? {};
    this.scopeInputs.push({ ...received });

    if (this.scopeRejection !== undefined) {
      return Promise.reject(this.scopeRejection);
    }

    // The PAIR is DERIVED from one CONDITION, as the real projection derives it: a request that
    // carried no feed host gets neither the port nor the criteria.
    const port = this.resolvePort(received);
    const criteria: FeedCriteria | undefined =
      received.feedHost === undefined
        ? undefined
        : { feedHost: received.feedHost, now: received.now ?? SCOPE_FALLBACK_INSTANT };

    return Promise.resolve(new FeedRequestScopeDouble(port, criteria));
  }

  public get diagnostics() {
    return unreachableMember('CompositionRoot', 'diagnostics');
  }

  public get dialect() {
    return unreachableMember('CompositionRoot', 'dialect');
  }

  public get settingsProvider() {
    return unreachableMember('CompositionRoot', 'settingsProvider');
  }

  public createInspectableRequestScope(): Promise<InspectableRequestScope> {
    return unreachableMember('CompositionRoot', 'createInspectableRequestScope');
  }
}

/**
 * A feed port that answers with a fixed document and records how it was called.
 *
 * The rest parameter is the mechanical proof of the reshaping.
 */
class RecordingProductFeedPort implements ProductFeedPort {
  public readonly argumentCounts: number[] = [];

  /**
   * Every argument of every call, in call order, exactly as received.
   */
  public readonly received: unknown[][] = [];

  private readonly document: string;

  public constructor(document: string) {
    this.document = document;
  }

  public generateProductFeed(...args: readonly unknown[]): Promise<string> {
    this.argumentCounts.push(args.length);
    this.received.push([...args]);
    return Promise.resolve(this.document);
  }
}

/**
 * A feed port that fails the way its collaborators fail: by rejecting, unwrapped.
 *
 * The service under it catches nothing and defaults nothing - swallowing a read failure would
 * serve a document that silently omitted products a merchant is advertising.
 */
class FailingProductFeedPort implements ProductFeedPort {
  public callCount = 0;

  private readonly failure: Error;

  public constructor(failure: Error) {
    this.failure = failure;
  }

  public generateProductFeed(): Promise<string> {
    this.callCount += 1;
    return Promise.reject(this.failure);
  }
}

// The catalog, and the four selection predicates.
//
// The candidate catalog is built from the shipped entity fixtures - `makeProductFixture` and
// `makeSkuFixture`, both singular, both taking a plain object literal because their overrides
// interfaces are module-private.

/**
 * A product and the SKU that hangs off it, as the legacy loop iterated them.
 */
interface CatalogEntry {
  readonly product: ReturnType<typeof makeProductFixture>;
  readonly sku: ReturnType<typeof makeSkuFixture>;
}

/**
 * The axes a catalog entry varies on. Locally declared, not exported, and passed as a literal.
 */
interface CatalogEntrySpec {
  readonly key: string;
  readonly skuActiveFlag: boolean;
  readonly productActiveFlag: boolean;
  readonly productPublishedFlag: boolean;
  readonly calculatedQATS: number;
  readonly branded: boolean;
}

/**
 * The brand identifier a projected row carries when the LEFT join resolved a brand row.
 *
 * An invented sentinel, and deliberately not the fixture's own value: `Brand.getBrandID()` answers
 * the empty string on an unsaved fixture, and an empty string is PRESENT.
 */
const RESOLVED_BRAND_ID = 'brand-row-resolved-by-the-left-join';

/**
 * The image path every projected row carries. Required and non-optional on the row contract.
 */
const IMAGE_LINK_PATH = '/images/feed/placeholder-sku-image.jpg';

/**
 * Build one candidate catalog entry.
 *
 * A FRESH graph on every call, per this suite's isolation standard: no fixture instance is shared
 * between tests, and nothing is cached at module scope.
 */
function makeCatalogEntry(spec: CatalogEntrySpec): CatalogEntry {
  const product = makeProductFixture({
    idPrefix: spec.key,
    productID: `${spec.key}-product`,
    productCode: `${spec.key}-product-code`,
    urlTitle: `${spec.key}-url-title`,
    calculatedTitle: `${spec.key} calculated title`,
    activeFlag: spec.productActiveFlag,
    publishedFlag: spec.productPublishedFlag,
    calculatedQATS: spec.calculatedQATS,
    ...(spec.branded ? {} : { brand: undefined }),
  });

  const sku = makeSkuFixture({
    idPrefix: spec.key,
    skuID: `${spec.key}-sku`,
    skuCode: `${spec.key}-sku-code`,
    activeFlag: spec.skuActiveFlag,
    product,
  });

  return { product, sku };
}

/**
 * Project one catalog entry into the row shape the feed repository returns.
 *
 * The row contract carries the four filter columns precisely so the invariant is verifiable from
 * the returned data rather than only from statement text.
 */
function projectFeedRow(entry: CatalogEntry): GoogleProductFeedRow {
  const { product, sku } = entry;
  const brand = product.getBrand();

  return {
    skuID: sku.getSkuID(),
    productID: product.getProductID(),
    skuCode: sku.getSkuCode(),
    calculatedTitle: product.getCalculatedTitle(),
    productDescription: product.getProductDescription(),
    productTypeDescription: undefined,
    productTypeSimpleRepresentation: undefined,
    productUrlPath: product.getProductURL(),
    imageLinkPath: IMAGE_LINK_PATH,
    additionalImageLinkPaths: [],
    productPrice: product.getPrice(),
    skuPrice: undefined,
    skuSalePrice: undefined,
    salePriceExpirationDateTime: undefined,
    // The LEFT join's resolved key, absent exactly when no brand row answered
    // [integrationServices/google/controllers/feed.cfc:L66].
    brandID: brand === undefined ? undefined : RESOLVED_BRAND_ID,
    brandName: brand?.getBrandName(),
    productCode: product.getProductCode(),
    // Both weight members sit OUTSIDE the settings provider's four keys, so they are carried as
    // the projection's own strings [integrationServices/google/views/feed/product.cfm:L58].
    skuShippingWeight: '1',
    skuShippingWeightUnitCode: 'lb',
    skuActiveFlag: sku.getActiveFlag(),
    productActiveFlag: product.getActiveFlag(),
    productPublishedFlag: product.getPublishedFlag(),
    productCalculatedQATS: product.getCalculatedQATS() ?? 0,
  };
}

/**
 * The row source the feed service reads through: a pure recorder that filters nothing.
 *
 * What remains here is the honest handler-tier double: it stands in for
 * `GoogleFeedRepository.fetchProductFeedRows`, records how it was called.
 *
 * The narrowed `Pick<>` the service declares is what makes an in-memory double possible at all.
 */
class RecordingFeedRowSource implements GoogleProductFeedRowSource {
  public readonly argumentCounts: number[] = [];

  private readonly candidates: readonly CatalogEntry[];

  public constructor(candidates: readonly CatalogEntry[]) {
    this.candidates = candidates;
  }

  public fetchProductFeedRows(
    ...args: readonly unknown[]
  ): Promise<readonly GoogleProductFeedRow[]> {
    this.argumentCounts.push(args.length);

    // No FILTER and no SORT. The ported statement owns selection, and the legacy selection applies
    // no ordering at all, so imposing either here would be this suite deciding what the feed
    // contains.
    return Promise.resolve(this.candidates.map(projectFeedRow));
  }
}

/**
 * What one render call was handed. Copied out, so a later mutation cannot rewrite the record.
 */
interface RecordedRenderCall {
  readonly rows: readonly GoogleProductFeedRow[];
  readonly feedHost: string;
  readonly nowIso: string;
}

/**
 * The renderer seam, recorded.
 *
 * Substituted for the real renderer through the feed service's fourth constructor parameter, which
 * exists for exactly this.
 */
class RecordingFeedRenderer {
  public readonly calls: RecordedRenderCall[] = [];

  private readonly document: string;

  public constructor(document: string) {
    this.document = document;
  }

  public readonly render: GoogleProductFeedRenderer = (rows, feedHost, now) => {
    this.calls.push({ rows: [...rows], feedHost, nowIso: now.toISOString() });
    return this.document;
  };
}

/**
 * The candidate catalog, as DATA. Instances are built per test from these specs, never shared.
 *
 * Three entries qualify and five do not, and every non-qualifying entry fails exactly one
 * predicate, so a test that loses a predicate loses a specific row rather than an unattributable
 * count.
 */
const CATALOG_SPECS: readonly CatalogEntrySpec[] = Object.freeze([
  {
    key: 'branded',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 4,
    branded: true,
  },
  // The boundary itself: exactly one unit available to sell is INCLUDED.
  {
    key: 'quantityone',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 1,
    branded: true,
  },
  // The LEFT-join case: no brand row answers, and the product appears anyway.
  {
    key: 'brandless',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 7,
    branded: false,
  },
  // The other side of the boundary: nothing available to sell is EXCLUDED.
  {
    key: 'quantityzero',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 0,
    branded: true,
  },
  {
    key: 'quantitynegative',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: -3,
    branded: true,
  },
  {
    key: 'inactivesku',
    skuActiveFlag: false,
    productActiveFlag: true,
    productPublishedFlag: true,
    calculatedQATS: 9,
    branded: true,
  },
  {
    key: 'inactiveproduct',
    skuActiveFlag: true,
    productActiveFlag: false,
    productPublishedFlag: true,
    calculatedQATS: 9,
    branded: true,
  },
  {
    key: 'unpublishedproduct',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: false,
    calculatedQATS: 9,
    branded: true,
  },
]);

/**
 * Every candidate SKU code, in the order the row source hands them over.
 */
const CANDIDATE_SKU_CODES: readonly string[] = Object.freeze([
  'branded-sku-code',
  'quantityone-sku-code',
  'brandless-sku-code',
  'quantityzero-sku-code',
  'quantitynegative-sku-code',
  'inactivesku-sku-code',
  'inactiveproduct-sku-code',
  'unpublishedproduct-sku-code',
]);

/**
 * A fresh entity graph for every candidate, built per test.
 */
function makeCandidateCatalog(): readonly CatalogEntry[] {
  return CATALOG_SPECS.map(makeCatalogEntry);
}

/**
 * The axes a request varies on. Locally declared, not exported, passed as an object literal.
 */
interface FeedRequestOverrides {
  readonly method?: string;
  readonly path?: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly queryStringParameters?: Readonly<Record<string, string>> | null;
  readonly pathParameters?: Readonly<Record<string, string>> | null;
  readonly body?: string | null;
  readonly requestTimeEpoch?: number;
  readonly gatewayRequestId?: string;
}

/**
 * One version 1.0 API Gateway proxy request for the feed route.
 *
 * The method and path default to the FROZEN TABLE's own values rather than to literals restated
 * here.
 */
function feedRequestEvent(overrides: FeedRequestOverrides = {}): APIGatewayProxyEvent {
  const path = overrides.path ?? FEED_ROUTE.path;
  const httpMethod = overrides.method ?? FEED_ROUTE.methods;

  return {
    body: overrides.body ?? null,
    headers: { ...(overrides.headers ?? { host: FEED_HOST }) },
    multiValueHeaders: {},
    httpMethod,
    isBase64Encoded: false,
    path,
    pathParameters: overrides.pathParameters ?? null,
    queryStringParameters: overrides.queryStringParameters ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: 'account-placeholder',
      apiId: 'feed-api-placeholder',
      // The legacy action is public and unauthenticated as a matter of source fact -
      // `this.publicMethods="product"`, with the admin and secure method lists both empty
      // [integrationServices/google/controllers/feed.cfc:L54-L56].
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod,
      // JUDGMENT CALL: every member of the caller-identity block is the ABSENT value, and the
      // block is spelled out because the vendored `APIGatewayEventIdentity` shape declares fifteen
      // required members. Two of them are NAMED for a caller key.
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
        sourceIp: '203.0.113.7',
        user: null,
        userAgent: 'feed-consumer-placeholder',
        userArn: null,
      },
      path,
      stage: 'test',
      requestId: overrides.gatewayRequestId ?? GATEWAY_REQUEST_ID,
      // The handler's clock. A server-generated absolute instant, which is why reading it is a
      // pure conversion rather than a wall-clock read.
      requestTimeEpoch: overrides.requestTimeEpoch ?? REQUEST_INSTANT.getTime(),
      resourceId: 'feed-resource-placeholder',
      resourcePath: FEED_ROUTE.path,
    },
    resource: FEED_ROUTE.path,
  };
}

/**
 * A Lambda runtime context carrying a request identifier and refusing everything else.
 */
function lambdaContext(awsRequestId: string = RUNTIME_REQUEST_ID): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'product-feed-handler',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:placeholder:product-feed-handler',
    memoryLimitInMB: '512',
    awsRequestId,
    logGroupName: 'product-feed-handler-log-group',
    logStreamName: 'product-feed-handler-log-stream',
    getRemainingTimeInMillis: (): number =>
      unreachableMember('Context', 'getRemainingTimeInMillis'),
    done: (): void => unreachableMember('Context', 'done'),
    fail: (): void => unreachableMember('Context', 'fail'),
    succeed: (): void => unreachableMember('Context', 'succeed'),
  };
}

/**
 * One structured entry the logger wrote, parsed back out of its serialized line.
 */
interface RecordedLogEntry {
  readonly level: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/**
 * Everything one test's logger captured: the raw lines, and the ones that parsed as entries.
 */
interface SinkRecorder {
  /**
   * A logger writing to this recorder instead of stdout, handed to the handler under test.
   */
  readonly logger: Logger;
  /**
   * Every line the sink received, verbatim and unparsed.
   */
  readonly rawLines: readonly string[];
  /**
   * The lines that parsed as the documented envelope.
   */
  readonly entries: readonly RecordedLogEntry[];
  /**
   * Every raw line joined, so a leak anywhere in anything emitted is detectable.
   */
  readonly text: () => string;
}

/**
 * Build a per-test recording logger through the sink seam the logger publishes.
 *
 * The premise it rested on is also gone: `createProductFeedHandler` now accepts a logger, so this
 * suite injects one.
 */
function makeSinkRecorder(): SinkRecorder {
  const rawLines: string[] = [];
  const entries: RecordedLogEntry[] = [];

  const logger = processLogger.withSink((line: string): void => {
    rawLines.push(line);

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Kept in `rawLines` regardless. A line that does not parse is exactly the line an assertion
      // about disclosure must still be able to see, which is what the previous capture could not
      // do.
      return;
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const entry: { level?: unknown; message?: unknown; context?: unknown } = parsed;
      const context = entry.context;

      entries.push({
        level: String(entry.level),
        message: String(entry.message),
        context:
          typeof context === 'object' && context !== null
            ? Object.fromEntries(Object.entries(context))
            : {},
      });
    }
  });

  return { logger, rawLines, entries, text: (): string => rawLines.join('\n') };
}

/**
 * Read the error envelope out of a response body, narrowing rather than casting blindly.
 *
 * The envelope is the one `src/handlers/errorMapper.ts` publishes: a category, a safe message, the
 * correlation identifier, and field complaints only when there are any.
 */
function errorEnvelopeOf(response: APIGatewayProxyResult): ErrorResponseBody['error'] {
  const parsed: unknown = JSON.parse(response.body);

  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
    throw new Error('the response body is not the documented error envelope');
  }

  const { error } = parsed;

  if (typeof error !== 'object' || error === null) {
    throw new Error('the response envelope carries no error object');
  }

  return error as ErrorResponseBody['error'];
}

/**
 * The sole recorded scope input, proven to be the only one.
 */
function soleScopeInput(root: FeedCompositionRootDouble): RequestScopeInput {
  expect(root.scopeInputs).toHaveLength(1);
  const [input] = root.scopeInputs;

  if (input === undefined) {
    throw new Error('no request scope was opened');
  }

  return input;
}

/**
 * The sole recorded render call, proven to be the only one.
 */
function soleRenderCall(renderer: RecordingFeedRenderer): RecordedRenderCall {
  expect(renderer.calls).toHaveLength(1);
  const [call] = renderer.calls;

  if (call === undefined) {
    throw new Error('the renderer was never reached');
  }

  return call;
}

/**
 * The document the renderer double hands back.
 */
const RENDERED_DOCUMENT = [
  '  renderer-owned document; the handler may not touch it  ',
  'unescaped ampersand & unescaped angles < > and a bare quote "',
  '',
  '  trailing whitespace line  ',
].join('\n');

/**
 * A second, distinguishable document, for asserting that two invocations each get their own.
 */
const SECOND_RENDERED_DOCUMENT = 'a second renderer-owned document';

/**
 * What a test drives: the wired entrypoint, the root it will interrogate, and its own log capture.
 */
interface FeedHarness {
  readonly root: FeedCompositionRootDouble;
  /**
   * This handler's own sink. Fresh per harness, so no test can read another's emissions.
   */
  readonly emitted: SinkRecorder;
  readonly invoke: (
    event: APIGatewayProxyEvent,
    context?: Context,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Wire the entrypoint over a composition root of this suite's making, and over its own log sink.
 */
function harnessWith(resolvePort: FeedPortResolver, scopeRejection?: Error): FeedHarness {
  const root = new FeedCompositionRootDouble(resolvePort, scopeRejection);
  const emitted = makeSinkRecorder();

  return {
    root,
    emitted,
    invoke: createProductFeedHandler({
      compositionRoot: (): Promise<CompositionRoot> => Promise.resolve(root),
      logger: emitted.logger,
    }),
  };
}

/**
 * Wire the entrypoint over a root that publishes the given port whenever a feed host was supplied.
 *
 * The condition is the real root's documented behaviour - it builds the port if and only if
 * `feedHost` was present.
 */
function harnessWithPort(port: ProductFeedPort): FeedHarness {
  return harnessWith((input) => (input.feedHost === undefined ? undefined : port));
}

/**
 * What a test drives when it needs to see the rows and the render call the document came from.
 */
interface FeedServiceHarness extends FeedHarness {
  readonly rowSource: RecordingFeedRowSource;
  readonly renderer: RecordingFeedRenderer;
}

/**
 * Wire the entrypoint over the REAL feed service, reading a doubled row source and writing through
 * a doubled renderer.
 *
 * JUDGMENT CALL: `GoogleFeedService` itself is not doubled, and that is deliberate.
 */
function harnessWithFeedService(
  candidates: readonly CatalogEntry[],
  document: string = RENDERED_DOCUMENT,
): FeedServiceHarness {
  const rowSource = new RecordingFeedRowSource(candidates);
  const renderer = new RecordingFeedRenderer(document);

  const harness = harnessWith((input) =>
    input.feedHost === undefined
      ? undefined
      : // TWO arguments, not four: the host and the instant are per-request `FeedCriteria` members
        // rather than constructor state, so a service instance carries neither.
        new GoogleFeedService(rowSource, renderer.render),
  );

  return {
    root: harness.root,
    emitted: harness.emitted,
    invoke: harness.invoke,
    rowSource,
    renderer,
  };
}

/**
 * The SKU codes the renderer was handed, in the order it was handed them.
 */
function renderedSkuCodes(renderer: RecordingFeedRenderer): readonly (string | undefined)[] {
  return soleRenderCall(renderer).rows.map((row) => row.skuCode);
}

// There is no module-level log capture any more, and its own documentation is why it had to go.
//
// A `let recordedLog` stood here, reassigned by a `beforeEach`, defended like this: "the sink is
// intercepted for every test, and that is not a global console silence.

afterEach(() => {
  // Complementary to the global hook in `tests/setup.ts`, which restores spies and real timers
  // after every test in the tier.
  vi.restoreAllMocks();
});

// The module surface.

describe('the product-feed entrypoint module surface', () => {
  it('publishes exactly the factory and the entrypoint, with no default export', () => {
    // The two type exports - `CompositionRootProvider` and `ProductFeedHandler` - are erased on
    // emit, so the runtime export set is exactly the two values.
    expect(Object.keys(productFeedHandlerModule).sort()).toStrictEqual([
      'createProductFeedHandler',
      'handler',
    ]);
    expect('default' in productFeedHandlerModule).toBe(false);
  });

  it('declares two parameters, so the runtime completion callback cannot arrive as a third', () => {
    // The runtime passes its callback third.
    expect(handler).toBeTypeOf('function');
    expect(handler.length).toBe(2);
  });

  it('builds the production entrypoint through the same factory a suite calls', () => {
    // One construction path, so the shipped entrypoint and a suite's instance cannot diverge. The
    // factory performs no I/O and constructs nothing, so calling it here is safe with no
    // environment configured at all.
    const suiteInstance = createProductFeedHandler({
      compositionRoot: (): Promise<CompositionRoot> =>
        Promise.resolve(new FeedCompositionRootDouble(() => undefined)),
    });

    expect(suiteInstance).toBeTypeOf('function');
    expect(suiteInstance.length).toBe(handler.length);
    expect(suiteInstance).not.toBe(handler);
  });
});

// The reshaped contract: one criteria argument, and no narrowing input from a caller.
//
// Other two are the order-amount methods returning applied intents instead of mutating an order
// aggregate, and the two smart-list methods becoming typed repository queries.
//
// The evidence about the legacy is unchanged and still exact.

describe('the reshaped port contract', () => {
  it('invokes the port with EXACTLY ONE argument, the criteria', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(port.argumentCounts).toStrictEqual([1]);

    // One, not two: a second argument would mean a selection surface had appeared beside the
    // criteria, which the four invariant filters forbid.
    expect(port.received.map((args) => args.length)).toStrictEqual([1]);
  });

  it('passes the feed host and the instant AS the method argument, and nothing else', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    await invoke(feedRequestEvent(), lambdaContext());

    const input = soleScopeInput(root);

    expect(input.feedHost).toBe(FEED_HOST);
    expect(input.now?.toISOString()).toBe(REQUEST_INSTANT_ISO);
    expect(port.argumentCounts).toStrictEqual([1]);

    const [criteria] = port.received.map((args) => args[0] as FeedCriteria);
    if (criteria === undefined) {
      throw new Error('expected the recorded criteria to be readable');
    }

    // The same two values, arriving through the argument rather than the constructor.
    expect(criteria.feedHost).toBe(FEED_HOST);
    expect(criteria.now.toISOString()).toBe(REQUEST_INSTANT_ISO);

    // And nothing ELSE. No product identifier, page, limit, date window, currency or flag - the
    // key set is closed at two, so a selection member cannot be added without failing here.
    expect(Object.keys(criteria).sort()).toStrictEqual(['feedHost', 'now']);
  });

  it('ignores every query-string parameter a caller might use to narrow the feed', async () => {
    // Not one of these names exists on the contract, and none may be introduced: no product or
    // brand identifier, no date window, no page or limit, no currency, and no toggle, override or
    // "include inactive" flag.
    const narrowed = harnessWithFeedService(makeCandidateCatalog());
    const plain = harnessWithFeedService(makeCandidateCatalog());

    const narrowedResponse = await narrowed.invoke(
      feedRequestEvent({
        queryStringParameters: {
          productID: 'branded-product',
          brandID: RESOLVED_BRAND_ID,
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-12-31T23:59:59.000Z',
          page: '2',
          limit: '1',
          currencyCode: 'GBP',
          includeInactive: 'true',
          publishedFlag: '0',
        },
      }),
      lambdaContext(),
    );

    const plainResponse = await plain.invoke(feedRequestEvent(), lambdaContext());

    expect(narrowedResponse.statusCode).toBe(200);
    expect(narrowedResponse.body).toBe(plainResponse.body);
    expect(narrowed.rowSource.argumentCounts).toStrictEqual([0]);
    expect(renderedSkuCodes(narrowed.renderer)).toStrictEqual(CANDIDATE_SKU_CODES);
    expect(renderedSkuCodes(plain.renderer)).toStrictEqual(CANDIDATE_SKU_CODES);
  });

  it('ignores a request body and any path parameters', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(
      feedRequestEvent({
        body: '{"productID":"branded-product","includeInactive":true}',
        pathParameters: { productID: 'branded-product' },
      }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(harness.rowSource.argumentCounts).toStrictEqual([0]);
    expect(renderedSkuCodes(harness.renderer)).toStrictEqual(CANDIDATE_SKU_CODES);
  });

  it('opens exactly one request scope and reaches the port exactly once per invocation', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    await invoke(feedRequestEvent(), lambdaContext());

    expect(root.scopeInputs).toHaveLength(1);
    expect(port.argumentCounts).toStrictEqual([1]);
  });

  it('takes a fresh scope per invocation and memoizes no document between them', async () => {
    // A warm container serves many requests, so nothing may be retained: the scope is a local
    // binding inside the returned function and the document is produced anew each time.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    const first = await invoke(feedRequestEvent(), lambdaContext());
    const second = await invoke(feedRequestEvent(), lambdaContext());

    expect(root.scopeInputs).toHaveLength(2);
    expect(port.argumentCounts).toStrictEqual([1, 1]);
    expect(first.body).toBe(RENDERED_DOCUMENT);
    expect(second.body).toBe(RENDERED_DOCUMENT);
  });

  it('★★★ serves OVERLAPPING allowed-Host requests independently, sharing nothing', async () => {
    const concurrentHosts = ['shop.example.test', 'store.example.test', 'market.example.test'];
    const arrivedHosts: string[] = [];
    let admitAll: () => void = (): void => {};
    const allArrived = new Promise<void>((resolve) => {
      admitAll = resolve;
    });

    // A document that NAMES its own CRITERIA, which is what makes contamination visible: a shared
    // artifact would answer some caller with a host it never sent.
    const overlappingPort: ProductFeedPort = {
      generateProductFeed: async (criteria: FeedCriteria): Promise<string> => {
        arrivedHosts.push(criteria.feedHost);

        if (arrivedHosts.length === concurrentHosts.length) {
          admitAll();
        }

        await allArrived;

        return `<rss><channel><link>http://${criteria.feedHost}/</link></channel></rss>`;
      },
    };

    const { invoke, root } = harnessWithPort(overlappingPort);

    // Started together, awaited together: `map` dispatches all three before the first is awaited.
    const responses = await Promise.all(
      concurrentHosts.map((host) =>
        invoke(feedRequestEvent({ headers: { host } }), lambdaContext()),
      ),
    );
    expect(arrivedHosts.sort()).toStrictEqual([...concurrentHosts].sort());
    expect(root.scopeInputs).toHaveLength(3);
    expect(root.scopeInputs.map((input) => input.feedHost).sort()).toStrictEqual(
      [...concurrentHosts].sort(),
    );

    // Each CALLER RECEIVES its own ORIGIN and NOBODY ELSE'S. Asserted in both directions, because
    // an assertion that only checked for the right host would pass on a body that carried all
    // three.
    responses.forEach((response, index) => {
      const ownHost = concurrentHosts[index] ?? '';

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`http://${ownHost}/`);

      for (const otherHost of concurrentHosts.filter((host) => host !== ownHost)) {
        expect(response.body).not.toContain(otherHost);
      }
    });
  });
});

// The rows this tier forwards, and the selection it does not perform.
//
// This section was called "The four selection predicates" and it asserted a local algorithm.

/**
 * Build a catalog from a chosen subset of the specs, in spec order.
 */
function catalogFor(keys: readonly string[]): readonly CatalogEntry[] {
  return CATALOG_SPECS.filter((spec) => keys.includes(spec.key)).map(makeCatalogEntry);
}

describe('the rows this tier forwards, unchanged', () => {
  it('forwards EVERY row the source returned, selecting none of them itself', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    // All eight candidates reach the renderer, INCLUDING the five the shipped statement's `WHERE`
    // clause would have excluded.
    expect(renderedSkuCodes(harness.renderer)).toStrictEqual(CANDIDATE_SKU_CODES);
    expect(harness.rowSource.argumentCounts).toStrictEqual([0]);
  });

  it('leaves the row order exactly as the source returned it', async () => {
    // The legacy selection applies no ordering at all - no `ORDER BY`, no sort, no de-duplication
    // [integrationServices/google/controllers/feed.cfc:L63-L72] - so imposing one would be a
    // repair rather than a port.
    const reversedKeys = ['brandless', 'quantityone', 'branded'];
    const harness = harnessWithFeedService(catalogFor(reversedKeys).slice().reverse());

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(renderedSkuCodes(harness.renderer)).toStrictEqual([
      'brandless-sku-code',
      'quantityone-sku-code',
      'branded-sku-code',
    ]);
  });

  it('forwards every column of every row verbatim, including a row with no brand', async () => {
    const catalog = catalogFor(['branded', 'brandless']);
    const harness = harnessWithFeedService(catalog);
    // The brand name the CATALOGUE carries, read from the entity graph the row was projected from
    // not a literal restated here, which would assert this file against itself.
    const expectedBrandName = catalog[0]?.product.getBrand()?.getBrandName();

    await harness.invoke(feedRequestEvent(), lambdaContext());

    const rows = soleRenderCall(harness.renderer).rows;
    const branded = rows.find((row): boolean => row.skuCode === 'branded-sku-code');
    const brandless = rows.find((row): boolean => row.skuCode === 'brandless-sku-code');

    if (branded === undefined || brandless === undefined) {
      throw new Error('both candidates were expected to reach the renderer');
    }

    // The brand travels when there is one and STAYS ABSENT when there is not - it is not defaulted
    // to an empty string, which would make a brandless product look like a product branded "".
    expect(expectedBrandName).toBeTypeOf('string');
    expect(branded.brandName).toBe(expectedBrandName);
    expect(branded.brandID).toBe(RESOLVED_BRAND_ID);
    expect(brandless.brandName).toBeUndefined();
    expect(brandless.brandID).toBeUndefined();
    // And the four filter columns arrive as the source stated them, unread and unaltered by this
    // tier.
    expect(branded.skuActiveFlag).toBe(true);
    expect(branded.productActiveFlag).toBe(true);
    expect(branded.productPublishedFlag).toBe(true);
    expect(branded.productCalculatedQATS).toBe(4);
  });

  it('reaches the row source with NO argument, so no caller can narrow the selection', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(
      feedRequestEvent({
        queryStringParameters: { includeInactive: 'true', publishedFlag: '0' },
        body: '{"includeInactive":true}',
      }),
      lambdaContext(),
    );

    expect(harness.rowSource.argumentCounts).toStrictEqual([0]);
    expect(renderedSkuCodes(harness.renderer)).toStrictEqual(CANDIDATE_SKU_CODES);
  });
});

// Response shaping, and the renderer boundary.
//
// The response is a BARE DOCUMENT with no wrapper, which is what the legacy layout suppression
// becomes here [integrationServices/google/controllers/feed.cfc:L60].

describe('the served response', () => {
  it('answers 200 with the RSS content type as its only header', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(response.headers).toStrictEqual({
      'content-type': FEED_CONTENT_TYPE,
    });
  });

  it('invents no HTTP semantic the source never had', async () => {
    // No entity tag, no last-modified stamp, no cache directive, no content negotiation, no
    // compression negotiation, no pagination link and no conditional-request handling.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const headerNames = Object.keys(response.headers ?? {}).map((name) => name.toLowerCase());
    expect(headerNames).toStrictEqual(['content-type']);
    expect(response.headers?.['x-content-type-options']).toBeUndefined();
    for (const absent of [
      'etag',
      'last-modified',
      'cache-control',
      'vary',
      'content-encoding',
      'link',
      'expires',
      'www-authenticate',
    ]) {
      expect(headerNames).not.toContain(absent);
    }
  });

  it('returns the renderer document unmodified, whitespace and unescaped characters included', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    // Byte-for-byte identity. Not trimmed, not re-indented, not re-escaped, not re-encoded, not
    // compressed and not wrapped in an envelope.
    expect(response.body).toBe(RENDERED_DOCUMENT);
    expect(response.body.startsWith('  ')).toBe(true);
    expect(response.body.endsWith('  ')).toBe(true);
    expect(response.body).toContain(' & ');
    expect(response.body).toContain('< >');
    expect(response.body).not.toContain('&amp;');
  });

  it('returns whatever the renderer produced, whatever that happens to be', async () => {
    // The handler does no markup work of any kind, so a renderer answering a string that is not a
    // feed at all still travels through untouched.
    const harness = harnessWithFeedService(makeCandidateCatalog(), SECOND_RENDERED_DOCUMENT);

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.body).toBe(SECOND_RENDERED_DOCUMENT);
  });

  it('omits isBase64Encoded rather than declaring the text body as binary', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect('isBase64Encoded' in response).toBe(false);
  });

  it('serves an empty catalog as an ordinary outcome rather than an error', async () => {
    // A zero-row feed is a complete document in the legacy too: the item loop simply produced no
    // `<item>` [integrationServices/google/views/feed/product.cfm:L16]. Nothing short-circuits.
    const harness = harnessWithFeedService([]);

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(RENDERED_DOCUMENT);
    expect(soleRenderCall(harness.renderer).rows).toStrictEqual([]);
  });

  it('captures the feed host at construction and hands it to the renderer', async () => {
    // CFML parity [integrationServices/google/views/feed/product.cfm:L14-L24]: the legacy
    // interpolated `CGI.HTTP_HOST` into five URL sites of the document -
    // [integrationServices/google/views/feed/product.cfm:L14],
    // [integrationServices/google/views/feed/product.cfm:L15],
    // [integrationServices/google/views/feed/product.cfm:L22],
    // [integrationServices/google/views/feed/product.cfm:L23] and
    // [integrationServices/google/views/feed/product.cfm:L24] - and the scheme is the renderer's
    // own frozen `http://` literal.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleScopeInput(harness.root).feedHost).toBe(FEED_HOST);
    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('matches the host header case-insensitively and trims it', async () => {
    // HTTP header names are case-insensitive, a version 1.0 proxy event carries whatever casing
    // the client sent, and the CFML `CGI` scope was a case-insensitive struct holding one
    // `HTTP_HOST`.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(
      feedRequestEvent({ headers: { HOST: `  ${FEED_HOST}  ` } }),
      lambdaContext(),
    );

    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('takes the first non-empty host header when the request carries several casings', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(
      feedRequestEvent({ headers: { HOST: '   ', Host: '', host: FEED_HOST } }),
      lambdaContext(),
    );

    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('skips a header that is not the host, and one whose value is absent', async () => {
    // Two states the enumeration has to walk past before it finds the origin: a header with a
    // different NAME, and a header carrying the right name with no VALUE.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(
      feedRequestEvent({
        headers: {
          'x-request-shape': 'not-a-host-header',
          host: undefined,
          Host: FEED_HOST,
        },
      }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('consults no forwarded-host header and no gateway domain name', async () => {
    // Preferring either would publish an origin the legacy never published.
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(
      feedRequestEvent({
        headers: {
          host: FEED_HOST,
          'x-forwarded-host': 'forwarded.example.test',
          'x-original-host': 'original.example.test',
        },
      }),
      lambdaContext(),
    );

    expect(soleRenderCall(harness.renderer).feedHost).toBe(FEED_HOST);
  });

  it('pins the document to the instant the request carried, in UTC', async () => {
    // The legacy called `now()` inline while rendering, twice, and combined it with the server's
    // own `getTimeZoneInfo().utcHourOffset`
    // [integrationServices/google/views/feed/product.cfm:L30].
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(soleScopeInput(harness.root).now?.toISOString()).toBe(REQUEST_INSTANT_ISO);
    expect(soleRenderCall(harness.renderer).nowIso).toBe(REQUEST_INSTANT_ISO);
  });

  it('omits the instant entirely when the request carried no usable stamp', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(feedRequestEvent({ requestTimeEpoch: 0 }), lambdaContext());

    const input = soleScopeInput(harness.root);

    expect('now' in input).toBe(false);
    expect(soleRenderCall(harness.renderer).nowIso).toBe(SCOPE_FALLBACK_INSTANT_ISO);
  });

  it('treats a negative, non-finite or out-of-range stamp as no stamp at all', async () => {
    // Three unusable shapes, and the third is the one worth naming: an epoch beyond the maximum a
    // `Date` can represent is finite and positive, so it passes both cheap tests and yields an
    // INVALID date.
    const negative = harnessWithFeedService(makeCandidateCatalog());
    const nonFinite = harnessWithFeedService(makeCandidateCatalog());
    const outOfRange = harnessWithFeedService(makeCandidateCatalog());

    await negative.invoke(feedRequestEvent({ requestTimeEpoch: -1 }), lambdaContext());
    await nonFinite.invoke(feedRequestEvent({ requestTimeEpoch: Number.NaN }), lambdaContext());
    // One millisecond past the largest instant a `Date` can hold.
    await outOfRange.invoke(feedRequestEvent({ requestTimeEpoch: 8.64e15 + 1 }), lambdaContext());

    expect('now' in soleScopeInput(negative.root)).toBe(false);
    expect('now' in soleScopeInput(nonFinite.root)).toBe(false);
    expect('now' in soleScopeInput(outOfRange.root)).toBe(false);
    expect(soleRenderCall(negative.renderer).nowIso).toBe(SCOPE_FALLBACK_INSTANT_ISO);
    expect(soleRenderCall(nonFinite.renderer).nowIso).toBe(SCOPE_FALLBACK_INSTANT_ISO);
    expect(soleRenderCall(outOfRange.renderer).nowIso).toBe(SCOPE_FALLBACK_INSTANT_ISO);
  });

  it('establishes no account, because the legacy feed action established none', async () => {
    // Two members and no more travel on the scope input. `accountID` absent is the logged-out arm
    // rather than a missing value, and `adminAccountFlag` is not a concept the feed has.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    await invoke(feedRequestEvent(), lambdaContext());

    const input = soleScopeInput(root);

    expect(Object.keys(input).sort()).toStrictEqual(['feedHost', 'now']);
    expect('accountID' in input).toBe(false);
    expect('adminAccountFlag' in input).toBe(false);
  });
});

// The integration adapter, as this entrypoint consumes it.
//
// The two preserved adapter defects are driven here as well.

/**
 * The adapter's own member names, read off the class rather than restated as a literal list.
 */
function googleAdapterMemberNames(): readonly string[] {
  return Object.getOwnPropertyNames(GoogleIntegration.prototype)
    .filter((name) => name !== 'constructor')
    .sort();
}

/**
 * The four values the legacy contract documents
 * [integrationServices/IntegrationInterface.cfc:L68-L71].
 */
const DOCUMENTED_INTEGRATION_TYPES: readonly IntegrationType[] = Object.freeze([
  'shipping',
  'payment',
  'fw1',
  'custom',
]);

describe('the Google integration adapter surface', () => {
  it('publishes exactly eight members, and feed generation is not one of them', () => {
    expect(googleAdapterMemberNames()).toStrictEqual([
      'getAdminNavbarHTML',
      'getDisplayName',
      'getEventHandlers',
      'getIntegratedSettings',
      'getIntegrationTypes',
      'getSettingOptions',
      'getSettings',
      'init',
    ]);

    // The feed travels on `ProductFeedPort`, whose single member is reached through the request
    // scope. No member of the adapter mentions a feed, and none may be added that does.
    expect(googleAdapterMemberNames().some((name) => name.toLowerCase().includes('feed'))).toBe(
      false,
    );
  });

  it('registers as fw1', () => {
    // Typed rather than merely compared, so a value outside the vocabulary would fail to compile
    // as well as to assert.
    const registeredType: IntegrationType = new GoogleIntegration().getIntegrationTypes();

    expect(registeredType).toBe('fw1');
  });

  it('registers a value from the documented vocabulary, which carries no product-feed type', () => {
    expect(DOCUMENTED_INTEGRATION_TYPES).toHaveLength(4);
    expect(DOCUMENTED_INTEGRATION_TYPES).toStrictEqual(['shipping', 'payment', 'fw1', 'custom']);
    expect(
      DOCUMENTED_INTEGRATION_TYPES.includes(new GoogleIntegration().getIntegrationTypes()),
    ).toBe(true);

    // The vocabulary is a comma-separated LIST in the source's own words, so the contract permits
    // multiples; this adapter answers a single-element one.
    expect(new GoogleIntegration().getIntegrationTypes()).not.toContain(',');
  });

  it('answers Google for its display name', () => {
    // The `displayname="USA epay"` contradiction at
    // [integrationServices/google/Integration.cfc:L49] lives on the component tag and is recorded
    // in this file's header.
    expect(new GoogleIntegration().getDisplayName()).toBe('Google');
  });

  it('contributes no platform settings and exactly one integrated setting definition', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.getSettings()).toStrictEqual({});
    expect(adapter.getIntegratedSettings()).toStrictEqual({
      productGoogleProductType: { fieldType: 'select' },
    });

    // Exactly one key, and exactly one property on it: no label, default, requiredness flag,
    // option list, sort order or validation rule is invented, because no source line records one.
    expect(Object.keys(adapter.getIntegratedSettings())).toStrictEqual([
      'productGoogleProductType',
    ]);
  });

  it('answers nothing from getSettingOptions, on every path', () => {
    // The `getSettingOptions` defect at [integrationServices/google/Integration.cfc:L73-L77] is
    // recorded in this file's header: the legacy declares an array return, the body of its only
    // conditional is empty.
    const adapter = new GoogleIntegration();

    expect(adapter.getSettingOptions('productGoogleProductType')).toBeUndefined();
    expect(adapter.getSettingOptions('PRODUCTGOOGLEPRODUCTTYPE')).toBeUndefined();
    expect(adapter.getSettingOptions('somethingElseEntirely')).toBeUndefined();
    expect(adapter.getSettingOptions('')).toBeUndefined();
  });

  it('contributes no event handlers and no admin navigation markup', () => {
    // The two members the legacy component inherits rather than declares. Both answer the base
    // component's own value, and both are fresh per call so a caller cannot mutate a shared
    // result.
    const adapter = new GoogleIntegration();

    expect(adapter.getEventHandlers()).toStrictEqual([]);
    expect(adapter.getEventHandlers()).not.toBe(adapter.getEventHandlers());
    expect(adapter.getAdminNavbarHTML()).toBe('');
  });

  it('returns itself from init', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.init()).toBe(adapter);
  });

  it('records both adapter identities and the route action on the served-feed line', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const harness = harnessWithPort(port);

    await harness.invoke(feedRequestEvent(), lambdaContext());

    const served = harness.emitted.entries.filter((entry) => entry.level === 'info');

    expect(served).toHaveLength(1);

    const [line] = served;

    if (line === undefined) {
      throw new Error('the served-feed line was not emitted');
    }

    // The two ADAPTER CONSTANTS stay in the prose: neither has an allow-listed context key name of
    // its own, and message content keeps the logger's permissive default.
    expect(line.message).toContain('Google');
    expect(line.message).toContain('fw1');
    expect(line.context.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(line.context.route).toBe(FEED_ROUTE_LABEL);
    expect(line.context.capability).toBe('productFeed');
    expect(line.context.action).toBe(FEED_ROUTE.action);
    expect(JSON.stringify(line.context)).not.toContain('[REDACTED]');
  });

  it('measures nothing on the served-feed line', async () => {
    // No document size, item count, row count or elapsed time is recorded anywhere on this path.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const harness = harnessWithPort(port);

    await harness.invoke(feedRequestEvent(), lambdaContext());

    const [line] = harness.emitted.entries.filter((entry) => entry.level === 'info');

    if (line === undefined) {
      throw new Error('the served-feed line was not emitted');
    }

    expect(Object.keys(line.context).sort()).toStrictEqual([
      'action',
      'capability',
      'requestId',
      'route',
    ]);
  });
});

// The endpoint is public and unauthenticated - a source fact, not a licence.
//
// Verified in the source: `this.publicMethods="product"`, `this.anyAdminMethods=""` and
// `this.secureMethods=""` [integrationServices/google/controllers/feed.cfc:L54-L56].

describe('the public, unauthenticated endpoint', () => {
  it('serves a request that carries no credential of any kind', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(
      feedRequestEvent({ headers: { host: FEED_HOST } }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(RENDERED_DOCUMENT);
  });

  it('serves the same document whether or not a caller sends an authorization header', async () => {
    // Nothing on this path reads one, so sending one changes nothing - and it is never echoed back
    // either, in a header or in a body.
    const withHeader = harnessWithFeedService(makeCandidateCatalog());
    const without = harnessWithFeedService(makeCandidateCatalog());

    const authorized = await withHeader.invoke(
      feedRequestEvent({
        headers: { host: FEED_HOST, authorization: 'Bearer not-a-real-value' },
      }),
      lambdaContext(),
    );
    const anonymous = await without.invoke(feedRequestEvent(), lambdaContext());

    expect(authorized.statusCode).toBe(anonymous.statusCode);
    expect(authorized.body).toBe(anonymous.body);
    expect(authorized.body).not.toContain('Bearer');
    expect(Object.keys(authorized.headers ?? {})).toStrictEqual(['content-type']);
  });

  it('does not advertise itself as secured', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const headerNames = Object.keys(response.headers ?? {}).map((name) => name.toLowerCase());

    expect(headerNames).not.toContain('www-authenticate');
    expect(headerNames).not.toContain('authorization');
    expect(headerNames).toStrictEqual(['content-type']);
  });

  it('reaches no network while serving the feed', async () => {
    // The adapter is a STUB at the network boundary: it builds a document and returns it, and
    // nothing on this path opens a socket, holds a credential or talks to Merchant Center.
    const networkAttempt = vi.spyOn(globalThis, 'fetch');
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    expect(networkAttempt).not.toHaveBeenCalled();
  });
});

// Resolution goes through the SHARED table, which is what makes five independently bundled
// entrypoints agree on one URL surface and stops any of them answering for another.

describe('routing to the feed capability', () => {
  it('answers the row the shared table assigns to this capability', async () => {
    // Read from the table rather than restated, so a route rename cannot leave this suite green
    // against a URL the router no longer serves.
    expect(FEED_ROUTE.capability).toBe('productFeed');
    expect(FEED_ROUTE.action).toBe('generateProductFeed');
    expect(FEED_ROUTE.methods).toBe('GET');
    expect(FEED_ROUTE.path).toBe('/feeds/google/products');

    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(
      feedRequestEvent({ method: FEED_ROUTE.methods, path: FEED_ROUTE.path }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
  });

  it('reports an unknown path as not found, opening no scope and reaching no port', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent({ path: '/feeds/unknown' }), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(404);
    expect(envelope.category).toBe('routeNotFound');
    expect(envelope.message).toBe(ROUTE_NOT_FOUND_MESSAGE);
    expect(envelope.requestId).toBe(RUNTIME_REQUEST_ID);
    // Resolution comes FIRST, so nothing downstream is touched: no graph is reached, no scope
    // opened, no port invoked.
    expect(root.scopeInputs).toStrictEqual([]);
    expect(port.argumentCounts).toStrictEqual([]);
  });

  it('reports the right path with the wrong method as not found, inventing no other status', async () => {
    // A path matching with the wrong method is as much a non-route as one matching no row, so it
    // folds into the same arm. No method-specific status is introduced.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent({ method: 'POST' }), lambdaContext());

    expect(response.statusCode).toBe(404);
    expect(errorEnvelopeOf(response).category).toBe('routeNotFound');
    expect(root.scopeInputs).toStrictEqual([]);
    expect(port.argumentCounts).toStrictEqual([]);
  });

  it('reports another capability route as not found, leaking nothing about it', async () => {
    // Reporting a different outcome for "belongs to another capability" would leak the existence
    // of the other four into a response, so both misses answer identically.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const catalogRoute = ROUTE_TABLE.catalogQuery;
    const response = await invoke(
      feedRequestEvent({ method: catalogRoute.methods, path: catalogRoute.path }),
      lambdaContext(),
    );
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(404);
    expect(envelope.category).toBe('routeNotFound');
    expect(envelope.message).toBe(ROUTE_NOT_FOUND_MESSAGE);
    expect(response.body).not.toContain(catalogRoute.path);
    expect(response.body).not.toContain(catalogRoute.capability);
    expect(response.body).not.toContain(catalogRoute.action);
  });

  it('canonicalizes the path, so doubled and trailing separators still match', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(
      feedRequestEvent({ path: '//feeds//google//products//' }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(port.argumentCounts).toStrictEqual([1]);
  });

  it('matches the method and the path case-insensitively, per the legacy comparisons', async () => {
    // The legacy membership tests were `eq` on the path and `listFindNoCase` on the method list,
    // both case-insensitive, and the port carries that semantic forward rather than lower-casing
    // inputs.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(
      feedRequestEvent({ method: 'get', path: '/FEEDS/Google/PRODUCTS' }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(port.argumentCounts).toStrictEqual([1]);
  });

  it('logs the requested route, sanitized, and never echoes it into the body', async () => {
    // The path is the one caller-authored string that reaches a log line, so it is
    // character-filtered and segment-masked on the way, and it reaches no response body at all.
    const opaqueSegment = 'aaaaaaaa-bbbbbbbb-cccccccc-dd';
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const harness = harnessWithPort(port);

    const response = await harness.invoke(
      feedRequestEvent({ path: `${FEED_ROUTE.path}/${opaqueSegment}` }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(opaqueSegment);
    expect(response.body).not.toContain('aaaaaaaa');

    // The not-found line arrives on this handler's own sink, which it did not before: the
    // route-resolution context omitted the logger.
    const [line] = harness.emitted.entries.filter((entry) => entry.level === 'warn');

    if (line === undefined) {
      throw new Error('the not-found line was not emitted');
    }

    const loggedRoute = String(line.context.route);

    expect(loggedRoute.startsWith(`GET ${FEED_ROUTE.path}/`)).toBe(true);
    expect(loggedRoute).toContain(`[segment of ${String(opaqueSegment.length)} characters]`);
    expect(loggedRoute).not.toContain('aaaaaaaa');
  });

  it('correlates on the runtime request id when there is one, and the gateway id otherwise', async () => {
    const withRuntimeContext = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));
    const withoutContext = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const runtimeResponse = await withRuntimeContext.invoke(
      feedRequestEvent({ path: '/feeds/unknown' }),
      lambdaContext(),
    );
    // No context at all, which is why the parameter is optional on the shipped signature: a suite
    // asserting a routing outcome should not have to fabricate an entire runtime context.
    const gatewayResponse = await withoutContext.invoke(
      feedRequestEvent({ path: '/feeds/unknown' }),
    );

    expect(errorEnvelopeOf(runtimeResponse).requestId).toBe(RUNTIME_REQUEST_ID);
    expect(errorEnvelopeOf(gatewayResponse).requestId).toBe(GATEWAY_REQUEST_ID);
  });

  it('falls back to the gateway id when the runtime supplies an empty one', async () => {
    const { invoke } = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const response = await invoke(
      feedRequestEvent({ path: '/feeds/unknown' }),
      lambdaContext('   '),
    );

    // An empty runtime identifier is treated as absent rather than published as an empty
    // correlation key, and nothing is generated: an invented identifier would appear nowhere else
    // in the stream.
    expect(errorEnvelopeOf(response).requestId).toBe(GATEWAY_REQUEST_ID);
  });
});

// Validation and safe error mapping.
//
// The STATUS SET is MINIMAL and CLOSED: 200 for a served document, plus the three failure statuses
// this source-public handler reaches - 400 for client-shaped input.

/**
 * A read failure shaped the way a driver-level one arrives: statement text and bound values in the
 * message, and a machine code alongside it.
 *
 * The message content is what makes the test meaningful, so it is deliberately the kind of string
 * that must never be published.
 */
class FeedReadFailure extends Error {
  public readonly code = 'ER_PARSE_ERROR';

  public constructor() {
    super(
      "select SwSku.skuCode from SwSku inner join SwProduct on ... where SwSku.activeFlag = ? -- bound: ['1','shopper-supplied-value']",
    );
    this.name = 'FeedReadFailure';
  }
}

/**
 * The framework's terminal dead-call-target message, byte for byte.
 *
 * Reproduced from [org/Hibachi/HibachiEntity.cfc:L565] and its byte-identical service-tier copy at
 * [org/Hibachi/HibachiService.cfc:L280], grammatical error and trailing " entity." included.
 */
const DEAD_CALL_TARGET_MESSAGE =
  'You have called a method calculateSkuPriceBasedOnPromotion() which does not exists in the Sku entity.';

describe('validation and safe error mapping', () => {
  it('refuses a request that carries no host header, before anything reaches a service', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke, root } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent({ headers: {} }), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(400);
    expect(envelope.category).toBe('invalidRequest');
    expect(envelope.message).toBe(INVALID_REQUEST_MESSAGE);
    expect(root.scopeInputs).toStrictEqual([]);
    expect(port.argumentCounts).toStrictEqual([]);
  });

  it('refuses an empty or whitespace-only host header the same way', async () => {
    const empty = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));
    const blank = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const emptyResponse = await empty.invoke(
      feedRequestEvent({ headers: { host: '' } }),
      lambdaContext(),
    );
    const blankResponse = await blank.invoke(
      feedRequestEvent({ headers: { host: '   ' } }),
      lambdaContext(),
    );

    expect(emptyResponse.statusCode).toBe(400);
    expect(blankResponse.statusCode).toBe(400);
    expect(errorEnvelopeOf(emptyResponse).message).toBe(INVALID_REQUEST_MESSAGE);
    expect(errorEnvelopeOf(blankResponse).message).toBe(INVALID_REQUEST_MESSAGE);
    expect(empty.root.scopeInputs).toStrictEqual([]);
    expect(blank.root.scopeInputs).toStrictEqual([]);
  });

  it('names no header and attaches no field complaint to the refusal', async () => {
    // Naming the header would tell a caller how to shape a request this deployment has not been
    // configured to serve, so the reason is NAMED to the mapper - which owns the words.
    const { invoke } = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const response = await invoke(feedRequestEvent({ headers: {} }), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(envelope.fields).toBeUndefined();
    expect(response.body.toLowerCase()).not.toContain('host');
    expect(response.body).not.toContain('header');
    expect(response.body).not.toContain(FEED_ROUTE.path);
  });

  it('★★★ serves NO document for the default UNCONFIGURED deployment, which authorizes no host', async () => {
    // This suite drives a double of the composition root, so what it can pin is the transport
    // half: when the root refuses the observed host.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWith(
      () => port,
      new UntrustedFeedHostError(
        FEED_HOST,
        'this deployment authorizes no feed host at all; set FEED_ALLOWED_HOSTS to the authority ' +
          'this feed is published on before requesting it',
      ),
    );

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(400);
    expect(errorEnvelopeOf(response).category).toBe('invalidRequest');

    // No document was generated, so nothing about the catalog reached a caller-chosen origin.
    expect(port.argumentCounts).toStrictEqual([]);

    // And the actionable configuration name stays out of the RESPONSE - it belongs to the
    // operator's log line, not to whoever asked.
    expect(response.body).not.toContain('FEED_ALLOWED_HOSTS');
    expect(response.body).not.toContain(FEED_HOST);
  });

  it('reports a refused feed host as unusable input rather than as an authorization failure', async () => {
    // The refusal is about a value observed on the REQUEST, so reporting it as a fault of this
    // service would misdirect whoever reads it - and no authorization status is reached for
    // either.
    const candidate = 'rogue.example.test';
    const reason = 'it is not on the deployment-owned allow-list';
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { invoke } = harnessWith(() => port, new UntrustedFeedHostError(candidate, reason));

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(400);
    expect(envelope.category).toBe('invalidRequest');
    expect(envelope.message).toBe(INVALID_REQUEST_MESSAGE);
    expect(port.argumentCounts).toStrictEqual([]);

    // Neither the diagnosis nor the candidate reaches the body.
    expect(response.body).not.toContain(candidate);
    expect(response.body).not.toContain(reason);
    expect(response.body).not.toContain('allow-list');
  });

  it('★★★ sends the refusal diagnosis in ONE mapper-owned line, without the candidate', async () => {
    // The ground still reaches an operator, through `invalidRequestResponse`'s `logDetail` seam:
    // it is appended to the mapper's message and never to the body.
    const candidate = 'rogue.example.test';
    const reason = 'it is not on the deployment-owned allow-list';
    const harness = harnessWith(
      () => new RecordingProductFeedPort(RENDERED_DOCUMENT),
      new UntrustedFeedHostError(candidate, reason),
    );

    await harness.invoke(feedRequestEvent(), lambdaContext());

    // One line for the whole invocation - not one line that mentions the reason.
    expect(harness.emitted.entries).toHaveLength(1);

    const [line] = harness.emitted.entries;

    if (line === undefined) {
      throw new Error('the refusal was not logged');
    }

    expect(line.level).toBe('warn');
    // The mapper's own opening, with the handler-supplied ground appended to it.
    expect(line.message).toContain('request input rejected before it reached the services');
    expect(line.message).toContain(reason);
    expect(line.message).toContain(`${String(candidate.length)} characters long`);
    expect(line.message).not.toContain(candidate);
    expect(line.context.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(line.context.route).toBe(FEED_ROUTE_LABEL);
    // The closed reason literal is on the CONTEXT, which is what the mapper adds and the handler
    // could not: the class of problem alongside the ground of it.
    expect(line.context.invalidRequestReason).toBe('unusableRequestInput');
  });

  it('answers a feed read failure generically, letting no statement text or bound value out', async () => {
    // The specific hazard on this path.
    const failure = new FeedReadFailure();
    const port = new FailingProductFeedPort(failure);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(500);
    expect(envelope.category).toBe('unrecognized');
    expect(envelope.message).toBe(GENERIC_FAILURE_MESSAGE);
    expect(envelope.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(port.callCount).toBe(1);

    // No statement text, no bound value, no message, no stack, no route, no host and no code.
    expect(response.body).not.toContain('select');
    expect(response.body).not.toContain('SwSku');
    expect(response.body).not.toContain('shopper-supplied-value');
    expect(response.body).not.toContain('bound');
    expect(response.body).not.toContain(failure.code);
    expect(response.body).not.toContain('FeedReadFailure');
    expect(response.body).not.toContain(FEED_HOST);
    expect(response.body).not.toContain(FEED_ROUTE.path);
    // A stack frame's own indentation, which is the shape a leaked stack would arrive in.
    expect(response.body).not.toContain('    at ');
  });

  it('records the classification of that failure on the log stream, and not its message', async () => {
    // What the recording sink carries is what the body withholds: the correlation identifier, the
    // category, the status, the sanitized route, the thrown shape and the machine code.
    const failure = new FeedReadFailure();
    const harness = harnessWithPort(new FailingProductFeedPort(failure));

    await harness.invoke(feedRequestEvent(), lambdaContext());

    const failures = harness.emitted.entries.filter((entry) => entry.level === 'error');

    expect(failures).toHaveLength(1);

    const [line] = failures;

    if (line === undefined) {
      throw new Error('the failure was not logged');
    }

    expect(line.context.category).toBe('unrecognized');
    expect(line.context.statusCode).toBe(500);
    expect(line.context.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(line.context.route).toBe(FEED_ROUTE_LABEL);
    expect(line.context.thrownShape).toBe('FeedReadFailure');
    expect(line.context.errorCode).toBe(failure.code);
    expect(JSON.stringify(line)).not.toContain('SwSku');
    expect(JSON.stringify(line)).not.toContain('shopper-supplied-value');
  });

  it('reproduces the framework dead-call-target message verbatim', async () => {
    // The one case where a failure's own message is published, and safe because the recognizing
    // pattern enforces both of its slots as identifiers.
    const { invoke } = harnessWithPort(
      new FailingProductFeedPort(new Error(DEAD_CALL_TARGET_MESSAGE)),
    );

    const response = await invoke(feedRequestEvent(), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(500);
    expect(envelope.category).toBe('missingMethod');
    expect(envelope.message).toBe(DEAD_CALL_TARGET_MESSAGE);
    expect(envelope.message).toContain('does not exists');
  });

  it('★★★ answers generically when the scope publishes no feed port, in ONE emission', async () => {
    // This case was inverted, not repaired.
    //
    // Unreachable given a supplied host, since the real root builds the port if and only if one
    // was present - but the published type is honest about the member being optional.
    const harness = harnessWith(() => undefined);

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());
    const envelope = errorEnvelopeOf(response);

    expect(response.statusCode).toBe(500);
    expect(envelope.category).toBe('unrecognized');
    expect(envelope.message).toBe(GENERIC_FAILURE_MESSAGE);

    // EXACTLY one emission for the whole invocation, at error severity, and it is the mapper's.
    const errorLines = harness.emitted.entries.filter((entry) => entry.level === 'error');

    expect(errorLines).toHaveLength(1);

    const [line] = errorLines;

    if (line === undefined) {
      throw new Error('the fault was not logged at all');
    }

    expect(line.message).toBe('unrecognized failure mapped to a generic response');
    expect(line.context.requestId).toBe(RUNTIME_REQUEST_ID);
    expect(line.context.route).toBe(FEED_ROUTE_LABEL);
    // The DIAGNOSIS, carried by the thrown value's own class name rather than by a second line.
    expect(String(line.context.thrownShape)).toContain('MissingProductFeedPortError');
    // And no handler-authored wording survives anywhere in the stream.
    expect(harness.emitted.entries.map((entry) => entry.message).join('\n')).not.toContain(
      'the request scope published no product-feed port',
    );
    // The sentence never reaches the caller either - the body is the mapper's fixed one.
    expect(response.body).not.toContain('MissingProductFeedPortError');
    expect(response.body).not.toContain('product-feed port');
  });

  it('draws every status from the minimal set, reaching for no other', async () => {
    // Every branch this entrypoint has, driven once, and the union of their statuses compared
    // against the closed set.
    const served = await harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT)).invoke(
      feedRequestEvent(),
      lambdaContext(),
    );
    const unusable = await harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT)).invoke(
      feedRequestEvent({ headers: {} }),
      lambdaContext(),
    );
    const unrouted = await harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT)).invoke(
      feedRequestEvent({ path: '/feeds/unknown' }),
      lambdaContext(),
    );
    const refusedHost = await harnessWith(
      () => new RecordingProductFeedPort(RENDERED_DOCUMENT),
      new UntrustedFeedHostError('rogue.example.test', 'it is not served by this deployment'),
    ).invoke(feedRequestEvent(), lambdaContext());
    const readFailure = await harnessWithPort(
      new FailingProductFeedPort(new FeedReadFailure()),
    ).invoke(feedRequestEvent(), lambdaContext());
    const deadTarget = await harnessWithPort(
      new FailingProductFeedPort(new Error(DEAD_CALL_TARGET_MESSAGE)),
    ).invoke(feedRequestEvent(), lambdaContext());

    const observed = [
      served.statusCode,
      unusable.statusCode,
      unrouted.statusCode,
      refusedHost.statusCode,
      readFailure.statusCode,
      deadTarget.statusCode,
    ];

    expect([...new Set(observed)].sort((left, right) => left - right)).toStrictEqual([
      200, 400, 404, 500,
    ]);

    for (const invented of [401, 403, 409, 422, 429]) {
      expect(observed).not.toContain(invented);
    }
  });

  it('carries no retry, rate-limit or circuit-breaker semantic on any response', async () => {
    const responses = [
      await harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT)).invoke(
        feedRequestEvent(),
        lambdaContext(),
      ),
      await harnessWithPort(new FailingProductFeedPort(new FeedReadFailure())).invoke(
        feedRequestEvent(),
        lambdaContext(),
      ),
    ];

    for (const response of responses) {
      const headerNames = Object.keys(response.headers ?? {}).map((name) => name.toLowerCase());

      expect(headerNames).not.toContain('retry-after');
      expect(headerNames).not.toContain('x-ratelimit-limit');
      expect(headerNames).not.toContain('x-ratelimit-remaining');
      expect(response.body).not.toContain('retryAfter');
      expect(response.body).not.toContain('circuitBreaker');
    }
  });
});

describe('closed dispatch, capability-scoped assembly and the whole-feed tradeoff', () => {
  it('★★★ publishes exactly ONE route for this capability, whose action the module implements', () => {
    // One route, asserted rather than assumed: the capability publishes a single row and the
    // module implements the action that row names.
    expect(FEED_ROUTE.capability).toBe('productFeed');
    expect(FEED_ROUTE.action).toBe('generateProductFeed');
    const rowsForThisCapability = Object.values(ROUTE_TABLE).filter(
      (candidate) => candidate.capability === 'productFeed',
    );

    expect(rowsForThisCapability).toHaveLength(1);
  });

  it('★★★ verifies the route BEFORE reading the host, so an unrouted request opens no scope', async () => {
    // The ordering is observable without a second action: a request that resolves to no route
    // carries a perfectly good `Host` header and is still refused as a NON-ROUTE, and no scope is
    // opened.
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const { root, invoke } = harnessWithPort(port);

    const response = await invoke(
      feedRequestEvent({ path: '/feeds/not-a-route' }),
      lambdaContext(),
    );

    expect(response.statusCode).toBe(404);
    expect(errorEnvelopeOf(response).message).toBe(ROUTE_NOT_FOUND_MESSAGE);
    expect(root.scopeInputs).toStrictEqual([]);
    expect(port.argumentCounts).toStrictEqual([]);

    // And a request with no host on a route that does match is refused as unusable input instead -
    // which is what makes the 404 above attributable to ordering rather than to the host being
    // ignored everywhere.
    const hostless = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));
    const hostlessResponse = await hostless.invoke(
      feedRequestEvent({ headers: {} }),
      lambdaContext(),
    );

    expect(hostlessResponse.statusCode).toBe(400);
    expect(hostless.root.scopeInputs).toStrictEqual([]);
  });

  it('★★★ opens a plain scope because the feed evaluates no address zone', async () => {
    // Zone loading is now a request-scope capability rather than an input flag.
    const { root, invoke } = harnessWithPort(new RecordingProductFeedPort(RENDERED_DOCUMENT));

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);

    const input = soleScopeInput(root);

    expect(Object.keys(input).sort()).toStrictEqual(['feedHost', 'now']);
  });

  it('★★★ serves the WHOLE feed in one unpaginated, byte-identical artifact', async () => {
    // A document deliberately larger than the fixtures elsewhere in this file, so that "returned
    // whole" is a statement about a document with many items rather than about a short string.
    const items = Array.from(
      { length: 500 },
      (_unused, index) => `<item><g:id>sku-${String(index)}</g:id></item>`,
    );
    const wholeDocument = `<rss><channel>${items.join('')}</channel></rss>`;
    const port = new RecordingProductFeedPort(wholeDocument);
    const { invoke } = harnessWithPort(port);

    const response = await invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    // BYTE for BYTE, and the length is asserted separately so a truncation cannot hide behind a
    // prefix comparison.
    expect(response.body).toBe(wholeDocument);
    expect(response.body.length).toBe(wholeDocument.length);
    // Every item is present. A feed that dropped the tail is the specific failure this guards.
    expect(response.body).toContain('<g:id>sku-0</g:id>');
    expect(response.body).toContain('<g:id>sku-499</g:id>');
    expect(response.body.split('<item>')).toHaveLength(items.length + 1);

    // Read "with no ARGUMENTS... Because the port has no parameter to carry one and this handler
    // declares no criteria type." The port does declare one parameter, `FeedCriteria` per AAP
    // 0.4.2.
    expect(port.argumentCounts).toStrictEqual([1]);
    for (const args of port.received) {
      const [criteria] = args as [FeedCriteria];
      expect(Object.keys(criteria).sort()).toStrictEqual(['feedHost', 'now']);
    }

    // And no pagination semantic is declared anywhere on the response. Not as a header, not as a
    // link relation, and not as a body member - the body is the document and nothing wraps it.
    const headerNames = Object.keys(response.headers ?? {}).map((name) => name.toLowerCase());

    expect(headerNames).toStrictEqual(['content-type']);
    expect(headerNames).not.toContain('link');
    for (const paging of ['rel="next"', 'nextPageToken', 'nextCursor', 'hasMore', 'totalPages']) {
      expect(response.body).not.toContain(paging);
    }
  });

  it('★★★ characterizes capacity as PLATFORM ceilings and states no service level', async () => {
    const port = new RecordingProductFeedPort(RENDERED_DOCUMENT);
    const harness = harnessWithPort(port);

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);

    const emitted = harness.emitted.entries.map((entry) => JSON.stringify(entry)).join('\n');

    for (const measurement of [
      'documentBytes',
      'documentLength',
      'itemCount',
      'rowCount',
      'elapsedMs',
      'durationMs',
      'budget',
      'sla',
      'maxRows',
      'timeout',
    ]) {
      expect(emitted).not.toContain(measurement);
      expect(response.body).not.toContain(measurement);
    }

    // And no size-shaped header either: declaring a content length here would be this module
    // measuring the artifact, which the runtime does for itself.
    expect(Object.keys(response.headers ?? {}).map((name) => name.toLowerCase())).not.toContain(
      'content-length',
    );
  });
});

// The seam is now `{ compositionRoot, logger }`, both optional and both defaulting to the
// production wiring, so the exported `handler` is still built with no arguments.

describe('the logger seam', () => {
  it('sends the WHOLE invocation to the injected sink, leaving nothing for the default', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    const response = await harness.invoke(feedRequestEvent(), lambdaContext());

    expect(response.statusCode).toBe(200);
    // One LINE EMITTED and one LINE RECEIVED. The served path writes exactly one entry, and the
    // recorder holds exactly one raw line, so no part of this invocation's output went anywhere
    // else.
    expect(harness.emitted.rawLines).toHaveLength(1);
    expect(harness.emitted.entries).toHaveLength(1);
    expect(harness.emitted.entries[0]?.message).toContain('product feed');
  });

  it('keeps every line RAW, so an assertion about disclosure can fail on text that never parsed', async () => {
    const harness = harnessWithFeedService(makeCandidateCatalog());

    await harness.invoke(feedRequestEvent(), lambdaContext());

    const [raw] = harness.emitted.rawLines;

    if (raw === undefined) {
      throw new Error('the served-feed line was not emitted');
    }

    // The raw text is the serialized entry - the recorder stores it before parsing and keeps it
    // even when parsing fails.
    expect(raw.startsWith('{')).toBe(true);
    expect(harness.emitted.text()).toBe(raw);
    expect(JSON.parse(raw)).toBeTypeOf('object');
    // And nothing a caller sent reaches it: no credential-shaped header value, no query string.
    expect(harness.emitted.text()).not.toContain('Bearer');
    expect(harness.emitted.text()).not.toContain('includeInactive');
  });

  it('is fresh per harness, so one test cannot read another emissions', async () => {
    const first = harnessWithFeedService(makeCandidateCatalog());
    const second = harnessWithFeedService(makeCandidateCatalog());

    await first.invoke(feedRequestEvent(), lambdaContext());

    // The second harness has its own recorder and has served nothing, so it holds nothing. A
    // module-level capture shared between harnesses would have both reading the same array, which is
    // precisely the confusion this per-harness recorder rules out.
    expect(first.emitted.rawLines).toHaveLength(1);
    expect(second.emitted.rawLines).toHaveLength(0);

    await second.invoke(feedRequestEvent(), lambdaContext());

    expect(first.emitted.rawLines).toHaveLength(1);
    expect(second.emitted.rawLines).toHaveLength(1);
  });

  it('defaults BOTH members, so the production entrypoint needs no argument at all', () => {
    // Three constructions, all valid: no argument, an empty bundle, and one member only.
    const bare = createProductFeedHandler();
    const empty = createProductFeedHandler({});
    const rootOnly = createProductFeedHandler({
      compositionRoot: (): Promise<CompositionRoot> =>
        Promise.resolve(new FeedCompositionRootDouble(() => undefined)),
    });

    expect(bare.length).toBe(2);
    expect(empty.length).toBe(2);
    expect(rootOnly.length).toBe(2);
    expect(bare).not.toBe(handler);
    expect(empty).not.toBe(bare);
  });
});
