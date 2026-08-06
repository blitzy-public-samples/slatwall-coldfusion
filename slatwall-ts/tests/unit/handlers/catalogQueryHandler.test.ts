// ---------------------------------------------------------------------------
// The catalog-query Lambda entrypoint, under test.
//
// NET-NEW COVERAGE, never presented as parity: no legacy test file reaches the handler tier. The two
// legacy-extended suites in this subtree are the brand and product entity suites, and neither is this
// one.
//
// A handler is a primary adapter, so every `describe` below serves exactly one of four concerns:
// request parsing and validation, delegation to the composed services, API Gateway response shaping,
// and domain/error mapping. Nothing here asserts a price, a discount, a rounding outcome or a cascade
// result, and SQL shape and parameter binding are owned by the repository integration tests.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE ASSERTS, AND THE FOUR CONCERNS IT IS ALLOWED TO ASSERT ABOUT
//
// A handler is a PRIMARY ADAPTER and carries no business logic, so every `describe` below serves
// exactly one of four concerns: request parsing and validation, delegation to the composed services,
// API Gateway response shaping, and domain/error mapping. Nothing here asserts a price, a discount,
// a rounding outcome or a cascade result - those belong to the service, entity and value-object
// suites that own them, and duplicating them here would move an assertion away from the code it
// guards.
//
// THE SUBJECT IS BUILT THROUGH THE SHIPPED FACTORY. `createCatalogQueryHandler({ compositionRoot,
// logger })` is the substitution API the module publishes for exactly this purpose, so every test
// below drives a handler whose logger writes to a recording sink and whose composition root is
// assembled over an INJECTED statement executor and an EXPLICIT environment source. No connection pool
// is created, no statement leaves this file, no environment variable is read from the process, no
// `.env` is loaded, no credential exists anywhere here, and no network, filesystem or clock is touched.
// The suite passes with a COMPLETELY EMPTY environment.
//
// ★★ QUOTE-THEN-REVISE. Those two sentences used to say the composition root was "a hand-written
// in-memory double" and that "NO REAL COMPOSITION ROOT IS EVER CALLED". Both were true, and the price
// of them was a `double as unknown as CompositionRoot` cast that a code review found - a crossing that
// "defeats contract-drift detection for every unimplemented member" and leaves an unintended read
// observing `undefined` instead of failing. The root is now the REAL one, built through the documented
// override arm that bypasses both the pool and the module memo, wrapped in a delegating decorator that
// counts the scopes it opened. Nothing is asserted or suppressed anywhere in this file.
//
// NO MOCKING LIBRARY IS USED for the doubles themselves: they are ordinary objects, typed member for
// member against the shipped classes through `Pick<>`, which is what makes a signature change in
// `src/services/productService.ts` or `src/services/optionService.ts` break this file at COMPILE time
// rather than silently pass. `vi` is vitest itself and is used for two things only - restoring in the
// per-suite `afterEach`, and installing those same typed objects on the three service prototypes the
// real request scope's real instances inherit from. There is no `vi.mock`, no `vi.doMock`, no
// `vi.resetModules`, no `vi.stubEnv`, no `vi.stubGlobal` and no global stream is touched.
//
// ★ THE THREE LINES OF THE SUBJECT THIS SUITE DELIBERATELY DOES NOT REACH, named so the gap reads as
// a decision rather than an oversight:
//
//   * the `return` guard inside the ledger's eviction loop, taken only if the map's iterator were
//     exhausted while the map still reported more entries than its bound - defensive by construction
//     and unreachable while both statements are true of the same `Map`;
//   * the production default `bootstrapCompositionRoot()` inside `createCatalogQueryHandler`, which
//     MUST NOT be invoked: calling it would resolve the real configuration and build a connection
//     pool, which is the one thing this suite exists not to do;
//   * the action-mismatch refusal, unreachable while the FROZEN shared route table assigns
//     `queryCatalog` to `catalogQuery`. The shipped module records it as an impossible case that is
//     handled rather than asserted away, and reaching it would mean reshaping the exported table -
//     a hack that would prove nothing about the request path.
//
// ---------------------------------------------------------------------------
// TWO PLACES WHERE THE SHIPPED SOURCE DIFFERS FROM THIS SUITE'S BRIEF, MIRRORED AS SHIPPED
//
// Both are recorded here rather than worked around, because the instruction is to mirror what
// shipped and to raise the difference - never to reshape `src/**` so a test can pass.
//
//  1. THE PUBLISHED SURFACE IS THREE OPERATIONS, NOT SIXTEEN. The brief lists the whole of
//     `ProductService`, plus `BrandService.saveBrand` and `OptionService.getOptionsForSelect`. The
//     shipped module publishes exactly `findProducts`, `getUnusedProductOptions` and
//     `getUnusedProductOptionGroups`, and documents every other member as a DELIBERATE
//     NON-EXPOSURE in four categories: out of scope by AAP 0.9.5; owned by `skuResolutionHandler`;
//     unreachable because the composition root publishes no entity and no entity loader, so a
//     method whose first parameter is an entity has no admissible argument at this tier; and not
//     this service's to publish at all. This suite therefore EXERCISES the three and asserts
//     NON-EXPOSURE for the rest, at the route and operation level, with a tripwire on every
//     unpublished member proving no service call escapes.
//
//  2. THE `Product_UpdateSkus` CONDITIONAL RULES ARE NOT REACHABLE FROM HERE, SO THEY ARE NOT
//     ASSERTED HERE. [model/validation/Product_UpdateSkus.json] gates `price` on
//     `showPrice{updatePriceFlag eq 1}` and `listPrice` on `showListPrice{updateListPriceFlag eq 1}`,
//     and those rules ARE ported - as a module-private zod schema inside
//     `src/services/productService.ts` that `processProduct_updateSkus`
//     [model/service/ProductService.cfc:L216-L233] parses with before any mutation. That operation
//     is not published by this capability, and the handler deliberately neither duplicates nor
//     restates the schema. Asserting the two conditional paths through this entrypoint would
//     require inventing a route the shipped router does not have. What IS asserted here is the
//     honest transport-level fact: the operation is refused, and no schema for those rules exists in
//     this tier to drift from the one that owns them.
//
// IMPORT DISCIPLINE. Explicit relative specifiers carrying the `.js` extension NodeNext resolution
// requires, named imports only, and `import type` on its own statement for every type-only import.
// There is no barrel anywhere in this subtree. Every module below is one this suite is permitted to
// depend on: the subject, its three siblings in `src/handlers/`, the three ported services whose
// surface it forwards to, the money value object, the structured logger, and the two fixture
// factories. Nothing else is imported - in particular NOT `src/lib/config.ts`, which fails fast on
// an unset dialect and would break the empty-environment contract the moment it were loaded, and NOT
// `liveDatabaseTestsEnabled` from `tests/setup.ts`, which exists to gate database suites and would
// only invite the conditional skipping this suite is forbidden to use.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { Money } from '../../../src/domain/valueObjects/money.js';
// ★★★ THE REAL COMPOSITION ROOT, IMPORTED BECAUSE A DOUBLE CANNOT BE ONE WITHOUT A CAST.
//
// A code review found `asCompositionRoot(double)` here - a `double as unknown as CompositionRoot`
// crossing that "defeats contract-drift detection for every unimplemented member", and leaves an
// unintended read observing `undefined` rather than failing loudly. Its own documentation explained why
// the cast existed: `RequestScope` publishes `productService`, `optionService`, `brandService`,
// `skuService` and `roundingRuleService` as the CLASS types, every one of those classes holds
// `private readonly` collaborators, and a TypeScript type with private members can only be satisfied by
// an instance of the declaring class. That reasoning was sound; the conclusion was not the only one
// available.
//
// The way out is to stop hand-writing a root at all: `bootstrapCompositionRoot({ executor, environment })`
// assembles the REAL one over an injected statement executor and an explicit environment source - no
// pool, no socket, no `process.env` - which is the construction `tests/unit/handlers/bootstrap.test.ts`
// is built on. The scope it hands back IS a `RequestScope`, so nothing needs asserting, and the
// programmable answers below are installed on the class PROTOTYPES the real instances inherit from,
// each through one typed `vi.spyOn`. The `Pick<>` service surfaces are unchanged and still fully typed,
// so a signature change in any of the three services still breaks this file at compile time - and now
// the OTHER members of `RequestScope` are checked too rather than suppressed.
import { bootstrapCompositionRoot, resetCompositionRoot } from '../../../src/handlers/bootstrap.js';
import type {
  CompositionRoot,
  InspectableRequestScope,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import { appConfig } from '../../../src/lib/config.js';
import type { EnvironmentSource } from '../../../src/lib/config.js';
import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import { MAX_PLACEHOLDER_COUNT } from '../../../src/repositories/mysql/connection.js';
import type {
  CatalogProductPageProjection,
  CatalogQueryLambdaHandler,
  CatalogQueryOperation,
  CatalogQueryResultDocument,
  CatalogSelectOptionProjection,
} from '../../../src/handlers/catalogQueryHandler.js';
import { createCatalogQueryHandler, handler } from '../../../src/handlers/catalogQueryHandler.js';
import type { ErrorResponseBody, SuccessResponseBody } from '../../../src/handlers/errorMapper.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import type { LogSink } from '../../../src/lib/logger.js';
import { logger } from '../../../src/lib/logger.js';
// VALUE imports, not type-only: the programmable answers are installed on these classes' prototypes,
// which is what the real request scope's real instances inherit from.
import { BrandService } from '../../../src/services/brandService.js';
import { OptionService } from '../../../src/services/optionService.js';
import type { ProductPage, ProductQueryCriteria } from '../../../src/services/productService.js';
import {
  ProductPagingCriteriaError,
  ProductService,
} from '../../../src/services/productService.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// ---------------------------------------------------------------------------
// The route this capability owns, read from the shared table rather than restated
// ---------------------------------------------------------------------------

/**
 * The catalog-query row of the shipped route table.
 *
 * READ, NEVER RESTATED. Writing `'/catalog/products'` as a literal here would create a second
 * declaration of the URL surface that could drift from the first, and the point of an explicit route
 * table is that there is exactly one. Every request below is built from this row, so a change to the
 * table moves this suite with it instead of silently orphaning it.
 */
const CATALOG_ROUTE = ROUTE_TABLE.catalogQuery;

/** Another capability's route, used to prove this bundle does not answer for its siblings. */
const SKU_RESOLUTION_ROUTE = ROUTE_TABLE.skuResolution;

/** A third, whose method differs, used to prove the method is part of the match. */
const PROMOTION_APPLICATION_ROUTE = ROUTE_TABLE.promotionApplication;

// ---------------------------------------------------------------------------
// Non-sensitive sentinels
//
// Every value below is invented, obviously synthetic, and carries no credential of any kind, no
// host and no address. Identifier shapes follow [meta/tests/unit/Helper.cfc:L51-L60]:
// a 32-character hexadecimal primary key and a `TESTPRODUCT`-style code.
// ---------------------------------------------------------------------------

/** A saved product's primary key. 32 hexadecimal characters, as the legacy helper's fixture is. */
const FIRST_PRODUCT_ID = 'aaaa1111222233334444555566667777';

/** A second, so ordering assertions can tell two records apart. */
const SECOND_PRODUCT_ID = 'bbbb9999888877776666555544443333';

/** A third, for the unnamed-product case. */
const THIRD_PRODUCT_ID = 'cccc1234123412341234123412341234';

/** A SKU primary key, used to prove no SKU member reaches this capability's surface. */
const SENTINEL_SKU_ID = 'dddd5555666677778888999900001111';

/** A SKU code, in the shape [meta/tests/unit/Helper.cfc:L56] uses. */
const SENTINEL_SKU_CODE = 'TESTPRODUCTXXX-1';

/** The opaque account identifier the default authorizer context establishes. */
const CALLER_ACCOUNT_ID = 'eeee1111222233334444555566667777';

/**
 * The default authorizer context: an identified caller carrying the ADMINISTRATIVE claim.
 *
 * ★★★ THE DEFAULT USED TO BE `{ accountID: CALLER_ACCOUNT_ID }` ALONE, AND THAT WAS THE DEFECT
 * (F45, CWE-862). Every one of the three operations this capability publishes is administrative in
 * the source - `getUnusedProductOptions` and `getUnusedProductOptionGroups` are consumed only by
 * `admin/views/entity/preprocessproduct_addoption.cfm:L60` and its option-group twin, inside an
 * application whose controllers declare `this.publicMethods=''`, and `findProducts` stands in for
 * `searchProductsByProductType` [model/dao/ProductDAO.cfc:L419-L437], which has no caller anywhere in
 * the legacy tree and whose statement carries no `activeFlag`/`publishedFlag` predicate. A default
 * principal WITHOUT the claim therefore drove 130 cases through a gate that should have refused it,
 * and the suite could not have noticed the missing authorization because it never asserted it.
 *
 * The default now carries the claim, so every operation case exercises a caller the route legitimately
 * serves, and the gate itself is asserted explicitly by the cases that omit or falsify the claim.
 */
const ADMIN_AUTHORIZER_CONTEXT: Readonly<Record<string, unknown>> = Object.freeze({
  accountID: CALLER_ACCOUNT_ID,
  adminAccountFlag: true,
});

/**
 * A unit price, as a DECIMAL STRING.
 *
 * [meta/tests/unit/Helper.cfc:L55] writes `price = 100` as a bare number, and that is the
 * anti-pattern this port exists to remove: money is constructed from a decimal string through `Money`
 * and never from a numeric literal. It appears here for ONE purpose - to prove that a product
 * carrying money publishes none of it on this capability's surface.
 */
const SENTINEL_UNIT_PRICE = '19.99';

/** A denormalized sale price, likewise a decimal string and likewise never published. */
const SENTINEL_SALE_PRICE = '17.49';

/** The product-type identifier the legacy helper uses verbatim [meta/tests/unit/Helper.cfc:L58]. */
const MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/** An option-group identifier list, deliberately UNTIDY - see the forwarding assertions. */
const UNTIDY_OPTION_GROUP_ID_LIST = ' Zulu , alpha ,alpha,,BRAVO ';

/** The Lambda invocation identifier every test asserts is echoed back. */
const INVOCATION_ID = 'test-invocation-0f6c1d2e';

/** The API Gateway identifier, used only where the invocation identifier is blank. */
const GATEWAY_REQUEST_ID = 'test-gateway-4b7a9c30';

/**
 * The fixed placeholder the SHARED resolver substitutes when neither identifier carries a value.
 *
 * ★★ THE VALUE MOVED WITH THE RESOLVER. This suite used to assert a per-handler
 * `'unidentified-invocation'`; API review (finding F8) found five different correlation policies
 * across the five entrypoints and collapsed them into `resolveServerRequestId` in
 * `../../../src/handlers/errorMapper.js`, whose placeholder is `'unattributed'`. The literal is
 * restated here rather than imported because the shared module keeps it module-private - a test that
 * imported it could not detect the constant being changed to an empty string, which is exactly the
 * regression the assertion below exists to catch.
 */
const UNATTRIBUTED_REQUEST_ID = 'unattributed';

/**
 * The request instant, as an explicit UTC ISO-8601 literal.
 *
 * The event type declares `requestTimeEpoch`, so a value is required; deriving it from a written-out
 * UTC literal keeps it deterministic and keeps this file free of `new Date()` and `Date.now()`.
 * NOTHING in this suite asserts on it, and no behaviour of this handler depends on it - the request
 * instant that matters is the one the composition root captures, and this capability supplies none.
 */
const REQUEST_TIME = '2024-06-01T00:00:00.000Z';

/** `requestTimeEpoch` for {@link REQUEST_TIME}. Parsed from the literal rather than hard-coded. */
const REQUEST_TIME_EPOCH = Date.parse(REQUEST_TIME);

/**
 * The value the platform-required `getRemainingTimeInMillis` member answers.
 *
 * The AWS `Context` type declares that member, so a constructed context must have one. It is
 * arbitrary, the handler never calls it, and NO assertion in this suite reads it. It is not a budget,
 * a target, a duration claim or a service level of any kind.
 */
const PLATFORM_REQUIRED_REMAINING_TIME = 30_000;

// ---------------------------------------------------------------------------
// Building an API Gateway event
// ---------------------------------------------------------------------------

/** What a test varies about one request. Everything omitted takes the admissible default. */
interface EventOverrides {
  /** HTTP method as RECEIVED. Defaults to the method the matched route declares. */
  readonly method?: string | undefined;

  /** Request path as RECEIVED. Defaults to the matched route's canonical path. */
  readonly path?: string | undefined;

  /** Single-valued query parameters. `null` models an event API Gateway left unpopulated. */
  readonly query?: Readonly<Record<string, string>> | null | undefined;

  /** Multi-valued query parameters. Defaults to `null`; supply one to repeat a parameter. */
  readonly repeatedQuery?: Readonly<Record<string, readonly string[]>> | null | undefined;

  /**
   * Request headers, with the casing a client chose. Defaults to none.
   *
   * The value type admits `undefined` because the platform's own header type does: a field may be
   * PRESENT with no value, and the subject has to decide what that means. Modelling it here is what
   * lets that decision be asserted rather than assumed.
   */
  readonly headers?: Readonly<Record<string, string | undefined>> | undefined;

  /** The API Gateway correlation identifier. Defaults to {@link GATEWAY_REQUEST_ID}. */
  readonly gatewayRequestId?: string | undefined;

  /**
   * The authorizer context. Omitted means an authenticated caller; `null` means
   * no authorizer context.
   */
  readonly authorizer?: Readonly<Record<string, unknown>> | null | undefined;
}

/**
 * Build one proxy event.
 *
 * Constructed member by member rather than asserted into shape: every field the AWS type declares is
 * present with an admissible value, so the subject is driven through the same surface the runtime
 * hands it. The identity block is entirely null except for a documented loopback source address,
 * because a source address is a required member of the platform type and nothing in this suite reads
 * it.
 */
function makeEvent(overrides: EventOverrides = {}): APIGatewayProxyEvent {
  const method = overrides.method ?? CATALOG_ROUTE.methods;
  const path = overrides.path ?? CATALOG_ROUTE.path;

  const repeated: Record<string, string[]> = {};
  if (overrides.repeatedQuery !== undefined && overrides.repeatedQuery !== null) {
    for (const [name, values] of Object.entries(overrides.repeatedQuery)) {
      repeated[name] = [...values];
    }
  }

  return {
    body: null,
    headers: overrides.headers === undefined ? {} : { ...overrides.headers },
    multiValueHeaders: {},
    httpMethod: method,
    isBase64Encoded: false,
    path,
    pathParameters: null,
    queryStringParameters:
      overrides.query === undefined ? {} : overrides.query === null ? null : { ...overrides.query },
    multiValueQueryStringParameters:
      overrides.repeatedQuery === undefined || overrides.repeatedQuery === null ? null : repeated,
    stageVariables: null,
    requestContext: {
      accountId: '000000000000',
      apiId: 'catalog-query-test-api',
      authorizer:
        overrides.authorizer === undefined ? { ...ADMIN_AUTHORIZER_CONTEXT } : overrides.authorizer,
      protocol: 'HTTP/1.1',
      httpMethod: method,
      identity: {
        accessKey: null,
        accountId: null,
        // Two required members of the platform identity type, explicitly nulled. Neither ever holds a
        // value in this suite, and nothing reads them.
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        // A required member of the platform type. The loopback address is the least meaningful value
        // that satisfies it, nothing in this suite reads it, and it is not a deployment fact.
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path,
      stage: 'test',
      requestId: overrides.gatewayRequestId ?? GATEWAY_REQUEST_ID,
      requestTime: REQUEST_TIME,
      requestTimeEpoch: REQUEST_TIME_EPOCH,
      resourceId: 'catalog-query-test-resource',
      resourcePath: path,
    },
    resource: path,
  };
}

/**
 * Build one Lambda context.
 *
 * The three deprecated callback members are required by the platform type and are implemented as
 * no-ops taking no parameters, which is assignable and keeps every `any` the platform declares out
 * of this file entirely.
 */
function makeContext(awsRequestId: string = INVOCATION_ID): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'catalogQuery',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:test-region:000000000000:function:catalogQuery',
    memoryLimitInMB: '512',
    awsRequestId,
    logGroupName: '/aws/lambda/catalogQuery',
    logStreamName: 'catalog-query-test-stream',
    getRemainingTimeInMillis: (): number => PLATFORM_REQUIRED_REMAINING_TIME,
    done: (): undefined => undefined,
    fail: (): undefined => undefined,
    succeed: (): undefined => undefined,
  };
}

// ---------------------------------------------------------------------------
// Reading a response, and reading the log stream
// ---------------------------------------------------------------------------

/**
 * Whether a parsed JSON value is an object whose members can be read by name.
 *
 * A user-defined type predicate rather than an assertion, so a malformed document narrows honestly
 * instead of being claimed to be something it is not. Arrays are excluded because a JSON array is an
 * object and none of the documents read below is one.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a decoded document is the success envelope the subject publishes.
 *
 * ★ A TYPE PREDICATE, NOT A TYPE ASSERTION, AND THAT DISTINCTION IS THE WHOLE POINT. A wire document
 * arrives as `unknown` - `JSON.parse` is annotated so below rather than left as the `any` its
 * declaration hands back - and it has to re-enter the type system somewhere. Doing it with a checked
 * predicate means the three members the published type declares are actually VERIFIED at run time,
 * so a subject that stopped emitting one would fail here loudly instead of satisfying an assertion
 * against a document that no longer has the shape claimed for it. The nested payload is re-checked
 * where it is read, in {@link readProductPage} and {@link readSelectRows}.
 */
function isServedBody(value: unknown): value is ServedEnvelope {
  if (
    !isRecord(value) ||
    typeof value['requestId'] !== 'string' ||
    typeof value['capability'] !== 'string' ||
    typeof value['action'] !== 'string'
  ) {
    return false;
  }

  const payload = value['result'];

  return (
    isRecord(payload) && typeof payload['operation'] === 'string' && payload['result'] !== undefined
  );
}

/**
 * Whether a decoded document is the failure envelope
 * `../../../src/handlers/errorMapper.js` publishes.
 *
 * Checked the same way, one level deeper: the nested `error` member must itself carry a category, a
 * message and the correlation identifier. `fields` is deliberately NOT required - the mapper omits it
 * entirely when there is nothing to report, and requiring it here would make this predicate reject
 * the very envelopes it is meant to read.
 */
function isFailureBody(value: unknown): value is ErrorResponseBody {
  if (!isRecord(value)) {
    return false;
  }
  const failure = value['error'];
  return (
    isRecord(failure) &&
    typeof failure['category'] === 'string' &&
    typeof failure['message'] === 'string' &&
    typeof failure['requestId'] === 'string'
  );
}

/**
 * The SHARED success envelope, with this capability's payload inside it.
 *
 * ★★ THIS USED TO BE `CatalogQueryResponseBody`, a per-handler `{operation, requestId, result}` this
 * file exported for itself. API review (finding F13) found all four JSON entrypoints had each derived
 * their own envelope - two of them without a correlation identifier at all - so the envelope moved to
 * `../../../src/handlers/errorMapper.js` as `SuccessResponseBody`, beside the failure envelope it was
 * modelled on. `operation` travels INSIDE the payload now, because it is a capability-specific
 * selector rather than part of the cross-handler contract.
 */
type ServedEnvelope = SuccessResponseBody<CatalogQueryResultDocument>;

/** The success envelope a served response carries, verified before it is typed. */
function readServedBody(response: APIGatewayProxyResult): ServedEnvelope {
  const parsed: unknown = JSON.parse(response.body);
  if (!isServedBody(parsed)) {
    throw new Error(`a served response body is not the published envelope: ${response.body}`);
  }
  return parsed;
}

/** The failure envelope a mapped response carries, verified before it is typed. */
function readFailureBody(response: APIGatewayProxyResult): ErrorResponseBody {
  const parsed: unknown = JSON.parse(response.body);
  if (!isFailureBody(parsed)) {
    throw new Error(`a failure body is not the published envelope: ${response.body}`);
  }
  return parsed;
}

/** One emitted log line, decoded. `context` is absent from a line that carried none. */
interface RecordedLogLine {
  readonly raw: string;
  readonly level: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/**
 * Decode one emitted line.
 *
 * The logger serializes `{ timestamp, level, message, context }`, and each member is narrowed here
 * with `typeof` rather than asserted, so a line that is not what this suite expects fails loudly at
 * the point of reading instead of quietly satisfying an assertion.
 */
function decodeLogLine(raw: string): RecordedLogLine {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(`the logger emitted a line that is not a JSON object: ${raw}`);
  }
  const level = parsed['level'];
  const message = parsed['message'];
  const context = parsed['context'];
  if (typeof level !== 'string' || typeof message !== 'string') {
    throw new Error(`the logger emitted a line without a level and a message: ${raw}`);
  }
  return { raw, level, message, context: isRecord(context) ? context : {} };
}

// ---------------------------------------------------------------------------
// The result shapes a double answers with
// ---------------------------------------------------------------------------

/**
 * One matched product, typed from the service's OWN published page shape.
 *
 * Derived rather than imported, exactly as the subject derives it: `src/domain/entities/product.ts`
 * is not among this suite's dependencies, and taking the element type from `ProductPage` keeps the
 * fixtures pinned to whatever `findProducts` actually returns.
 */
type MatchedProduct = ProductPage['records'][number];

/** What a test varies about one page. Everything omitted is derived from the records. */
interface ProductPageOverrides {
  readonly recordsCount?: number | undefined;
  readonly pageRecordsStart?: number | undefined;
  /** ABSENT MEANS THE WHOLE RESULT SET, on the service's contract and therefore here. */
  readonly pageRecordsShow?: number | undefined;
}

/**
 * Build one `ProductPage` the way the ported service publishes one.
 *
 * `entityName`, `joins` and `keywordProperties` are the EXECUTED statement's contract, not the
 * framework smart list's configuration: [model/dao/ProductDAO.cfc:L421] selects from `SwProduct`
 * alone and matches `productName like`, so the join list is empty and there is exactly one keyword
 * property at weight 1. Publishing more here would let this suite pass while the service told callers
 * a brand-name match would work.
 */
/**
 * One matched search row, in the shape the ported statement's own projection carries.
 *
 * ★★★ WHY THIS REPLACED `makeProductFixture` IN EVERY `makeProductPage` CALL (F38). The service used
 * to answer hydrated `Product` entities here, so these cases had to build a whole product graph -
 * priced, SKU-carrying, collaborator-holding - to assert a two-member projection. Code review recorded
 * the hydration behind that as unasked-for work: [model/dao/ProductDAO.cfc:L419-L436] issues ONE
 * statement selecting `productID, productName` and returns `{"id","value"}` per row. `ProductPage`
 * now carries those rows, so the fixture is the row, and the two members are the legacy's own keys.
 *
 * `value` is OMITTED rather than set when no name is given, because that is how the port represents a
 * NULL `SwProduct.productName` [model/entity/Product.cfc:L55] and the omission is what the projection
 * has to carry through.
 */
function matchRow(id: string, value?: string): MatchedProduct {
  return value === undefined ? { id } : { id, value };
}

function makeProductPage(
  records: readonly MatchedProduct[],
  overrides: ProductPageOverrides = {},
): ProductPage {
  return {
    records,
    recordsCount: overrides.recordsCount ?? records.length,
    pageRecordsStart: overrides.pageRecordsStart ?? 0,
    pageRecordsShow: overrides.pageRecordsShow,
    entityName: 'SlatwallProduct',
    joins: [],
    keywordProperties: [{ propertyIdentifier: 'productName', weight: 1 }],
  };
}

/**
 * One select row, in the shape both legacy option queries build.
 *
 * CFML parity [model/dao/OptionDAO.cfc:L88, L113]: neither function hydrates an entity. Both append a
 * TWO-KEY structure per row - a display `name` and an identifier `value` - which is why the ported
 * surface answers `SelectOption[]` and not `Option[]` or `OptionGroup[]`, and why this helper has
 * exactly two parameters.
 */
function selectRow(name: string, value: string): CatalogSelectOptionProjection {
  return { name, value };
}

// ---------------------------------------------------------------------------
// The doubles
//
// ★ WHY THESE ARE `Pick<>` OVER THE SHIPPED CLASSES RATHER THAN HAND-WRITTEN SHAPES. A restated
// signature is a signature that can drift: if `findProducts` gained a parameter or its criteria type
// changed, a hand-copied shape would keep compiling and this suite would keep passing while asserting
// the wrong contract. Taking each member's type from the class itself makes that a compile error.
// It also means the tripwires below are typed too - a non-exposure assertion that would still compile
// if the member were renamed would not be worth much.
// ---------------------------------------------------------------------------

/**
 * Every member of `ProductService` that could conceivably be reached from a catalog request.
 *
 * ONE of them - `findProducts` - is published by the shipped entrypoint. The other fourteen are named
 * here precisely BECAUSE they are not: each is implemented as a tripwire, so a route that ever
 * reached one fails this suite loudly rather than passing unnoticed. The list is the union of the
 * shipped module's four non-exposure categories, so it is checkable against that documentation
 * member for member.
 */
type ProductServiceDouble = Pick<
  ProductService,
  | 'deleteProduct'
  | 'findProducts'
  | 'getFormattedOptionGroups'
  | 'getProductSkusBySelectedOptions'
  | 'loadDataFromFile'
  | 'processProduct_addOption'
  | 'processProduct_addOptionGroup'
  | 'processProduct_addProductReview'
  | 'processProduct_addSubscriptionTerm'
  | 'processProduct_deleteDefaultImage'
  | 'processProduct_updateDefaultImageFileNames'
  | 'processProduct_updateSkus'
  | 'processProduct_uploadDefaultImage'
  | 'saveProduct'
  | 'saveProductType'
>;

/**
 * The whole of `OptionService`.
 *
 * Two of the three are published; `getOptionsForSelect` [model/service/OptionService.cfc:L55] is not,
 * because it takes already-materialised `Option` entities and this tier can obtain none.
 */
type OptionServiceDouble = Pick<
  OptionService,
  'getOptionsForSelect' | 'getUnusedProductOptionGroups' | 'getUnusedProductOptions'
>;

/**
 * The whole of `BrandService`, which is one method.
 *
 * CFML parity [model/service/BrandService.cfc:L49-L89]: `saveBrand` at L67 is the ONLY function the
 * legacy component declares - every brand read a caller might expect arrived by inheritance from the
 * framework base, which is deliberately not ported. So there is no brand QUERY method in existence
 * for a catalog-query capability to publish, and the tripwire below asserts that the one method that
 * does exist stays unreachable.
 */
type BrandServiceDouble = Pick<BrandService, 'saveBrand'>;

/**
 * A configuration source answering the five keys that have no default, and nothing else.
 *
 * NOT A CREDENTIAL. `.invalid` is the reserved never-resolvable TLD [RFC 2606] and both
 * account-shaped values are the literal string that says what they are. No pool is ever built from
 * this: the executor below is injected, so `getPreparedStatementExecutor()` is never reached.
 */
const CATALOG_ENVIRONMENT: EnvironmentSource = Object.freeze({
  // A NAMED host, because `DB_TLS_MODE` below is `verify-identity` and `src/lib/config.ts` refuses
  // that mode against an IP literal (F47) - a certificate binds to host NAMES, so an address would
  // silently reduce the mode to a chain-only check. `.invalid` is the reserved never-resolvable TLD
  // [RFC 2606], and the injected executor means nothing here ever connects.
  DB_HOST: 'slatwall-database.invalid',
  DB_USER: 'unused-by-this-suite',
  DB_PASSWORD: 'unused-by-this-suite',
  // F48: this fixture paired a non-loopback host with `disabled` transport, which the configuration
  // contract refuses outright - cleartext is admitted only for a provable loopback destination, in
  // every environment. The fixture describes a suite that never connects, so the mode is raised to
  // the recommended `verify-identity`, which the NAMED host above satisfies and which needs no
  // trust anchor.
  DB_TLS_MODE: 'verify-identity',
  DB_DIALECT: 'mySql',
});

/**
 * The statement executor the real graph is assembled over.
 *
 * Answers every read with NO ROWS and refuses every write. This suite asserts nothing about SQL - the
 * three published operations are answered from data on the class prototypes - so the executor exists
 * only to keep the composition root away from a connection pool. A write reaching it would be a
 * finding, since a query capability performs none.
 */
class CatalogExecutor implements PreparedStatementExecutor {
  public execute(sql: string, params?: readonly unknown[]): Promise<readonly SqlRow[]> {
    void sql;
    void params;

    return Promise.resolve([]);
  }

  public executeMutation(sql: string, params?: readonly unknown[]): Promise<SqlMutationResult> {
    void params;

    throw new Error(
      `a mutation reached the catalog-query capability, which publishes reads: ${sql}`,
    );
  }

  public transaction<TValue>(
    work: (tx: PreparedStatementExecutor) => Promise<TValue>,
  ): Promise<TValue> {
    void work;

    throw new Error(
      'a transaction was opened by the catalog-query capability, which writes nothing',
    );
  }
}

/**
 * A composition root that DELEGATES to a real one and counts the scopes it was asked for.
 *
 * ★★ A DELEGATING DECORATOR IN PLACE OF A CAST, AND THE FORWARDING IS TOTAL. The published root is
 * `Object.freeze`d so a spy cannot be installed on it, and a class that `implements CompositionRoot`
 * forwards every member to the real graph - so the compiler checks the WHOLE contract, a member added
 * to `CompositionRoot` breaks this file, and an unintended read reaches the real object rather than
 * observing `undefined`. That is exactly what the cast this replaced gave up.
 */
class RecordingCompositionRoot implements CompositionRoot {
  public constructor(
    private readonly inner: CompositionRoot,
    private readonly counters: { scopesOpened: number },
    private readonly scopeInputs: (RequestScopeInput | undefined)[],
  ) {}

  public get diagnostics(): CompositionRoot['diagnostics'] {
    return this.inner.diagnostics;
  }

  public get dialect(): CompositionRoot['dialect'] {
    return this.inner.dialect;
  }

  public get settingsProvider(): CompositionRoot['settingsProvider'] {
    return this.inner.settingsProvider;
  }

  public get integration(): CompositionRoot['integration'] {
    return this.inner.integration;
  }

  public createRequestScope(input?: RequestScopeInput): Promise<RequestScope> {
    this.counters.scopesOpened += 1;
    this.scopeInputs.push(input);

    return this.inner.createRequestScope(input);
  }

  public createInspectableRequestScope(
    input?: RequestScopeInput,
  ): Promise<InspectableRequestScope> {
    return this.inner.createInspectableRequestScope(input);
  }
}

/**
 * Install one bed's programmed answers on the three service classes the capability reaches.
 *
 * ★ ON THE PROTOTYPES, BECAUSE THAT IS WHAT THE REAL SCOPE'S REAL INSTANCES INHERIT FROM, and one
 * typed `vi.spyOn` per member, so each installation is checked against the shipped signature. Every
 * member of all three surfaces is installed - the three published answers AND the fifteen tripwires -
 * so no call can reach a real implementation and no real implementation can reach a repository.
 *
 * Restored by this file's `afterEach`, by the global hook in `tests/setup.ts` and by
 * `vitest.config.ts`'s `restoreMocks`, three belts for one obligation.
 */
function installServiceAnswers(
  productService: ProductServiceDouble,
  optionService: OptionServiceDouble,
  brandService: BrandServiceDouble,
): void {
  vi.spyOn(ProductService.prototype, 'findProducts').mockImplementation(
    productService.findProducts,
  );
  vi.spyOn(ProductService.prototype, 'deleteProduct').mockImplementation(
    productService.deleteProduct,
  );
  vi.spyOn(ProductService.prototype, 'getFormattedOptionGroups').mockImplementation(
    productService.getFormattedOptionGroups,
  );
  vi.spyOn(ProductService.prototype, 'getProductSkusBySelectedOptions').mockImplementation(
    productService.getProductSkusBySelectedOptions,
  );
  vi.spyOn(ProductService.prototype, 'loadDataFromFile').mockImplementation(
    productService.loadDataFromFile,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_addOption').mockImplementation(
    productService.processProduct_addOption,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_addOptionGroup').mockImplementation(
    productService.processProduct_addOptionGroup,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_addProductReview').mockImplementation(
    productService.processProduct_addProductReview,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_addSubscriptionTerm').mockImplementation(
    productService.processProduct_addSubscriptionTerm,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_deleteDefaultImage').mockImplementation(
    productService.processProduct_deleteDefaultImage,
  );
  vi.spyOn(
    ProductService.prototype,
    'processProduct_updateDefaultImageFileNames',
  ).mockImplementation(productService.processProduct_updateDefaultImageFileNames);
  vi.spyOn(ProductService.prototype, 'processProduct_updateSkus').mockImplementation(
    productService.processProduct_updateSkus,
  );
  vi.spyOn(ProductService.prototype, 'processProduct_uploadDefaultImage').mockImplementation(
    productService.processProduct_uploadDefaultImage,
  );
  vi.spyOn(ProductService.prototype, 'saveProduct').mockImplementation(productService.saveProduct);
  vi.spyOn(ProductService.prototype, 'saveProductType').mockImplementation(
    productService.saveProductType,
  );

  vi.spyOn(OptionService.prototype, 'getUnusedProductOptions').mockImplementation(
    optionService.getUnusedProductOptions,
  );
  vi.spyOn(OptionService.prototype, 'getUnusedProductOptionGroups').mockImplementation(
    optionService.getUnusedProductOptionGroups,
  );
  vi.spyOn(OptionService.prototype, 'getOptionsForSelect').mockImplementation(
    optionService.getOptionsForSelect,
  );

  vi.spyOn(BrandService.prototype, 'saveBrand').mockImplementation(brandService.saveBrand);
}

/**
 * Record that an unpublished member was invoked, then refuse.
 *
 * Both halves matter. The RECORD is what lets every test assert, unconditionally, that no unpublished
 * service member was touched - including the tests where the handler is expected to refuse long
 * before a service is reached. The REFUSAL is what makes a leak impossible to miss: the thrown error
 * funnels through the shipped error mapper and turns the response into a server-shaped failure, so a
 * test expecting a 400 or a 200 fails on the status as well as on the record.
 */
function refuseUnpublishedCall(touched: string[], member: string): never {
  touched.push(member);
  throw new Error(
    `${member} was invoked, and no route of the catalog-query capability publishes it. ` +
      'The shipped entrypoint documents it as a deliberate non-exposure.',
  );
}

// ---------------------------------------------------------------------------
// The test bed
// ---------------------------------------------------------------------------

/** A promise a test opens by hand, so a call can be held in flight deterministically. */
interface Gate {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

/**
 * Build a gate.
 *
 * Used only where the point is that a SECOND request arriving
 * while the first is still running must not start a second execution. Holding the first call open
 * explicitly is how that is proven without a timer, a sleep or any dependence on scheduling.
 */
function makeGate(): Gate {
  let open: () => void = (): undefined => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** What each published operation answers with, and where a test programmes a failure instead. */
interface CatalogQueryOutcomes {
  /** What `findProducts` resolves to. */
  productPage: ProductPage;

  /**
   * When set, `findProducts` throws this instead of resolving.
   *
   * Typed `Error` rather than `unknown` deliberately, and it costs nothing: the non-`Error` arm of the
   * mapper is still exercised, by a PLAIN OBJECT that satisfies the `Error` interface structurally
   * while failing `instanceof Error` at run time. That is the exact case the shipped mapper argues
   * about - "a thrown string, or a plain object carrying a `message` member, is a structure the
   * logger's key-based policy would traverse and emit verbatim" - so it is the more valuable fixture
   * as well as the one that keeps this suite free of an escape hatch.
   */
  findProductsRejectsWith: Error | undefined;

  /** What `getUnusedProductOptions` resolves to. */
  unusedOptions: readonly CatalogSelectOptionProjection[];

  /** What `getUnusedProductOptionGroups` resolves to. */
  unusedOptionGroups: readonly CatalogSelectOptionProjection[];

  /** When set, `getUnusedProductOptions` throws this instead of resolving. */
  unusedOptionsRejectsWith: Error | undefined;

  /** When set, every published operation awaits it before answering. */
  gate: Promise<void> | undefined;
}

/** The two arguments `getUnusedProductOptions` is called with, recorded verbatim. */
interface RecordedUnusedOptionsCall {
  readonly productID: string;
  readonly existingOptionGroupIDList: string;
}

/** One fully wired subject plus everything a test needs to observe about it. */
interface CatalogQueryTestBed {
  /** Invoke the subject with a fresh event and context. */
  readonly invoke: (
    overrides?: EventOverrides,
    awsRequestId?: string,
  ) => Promise<APIGatewayProxyResult>;

  /** The subject itself, for the few tests that drive two invocations concurrently. */
  readonly subject: CatalogQueryLambdaHandler;

  /** Programmable answers. Mutable by design; a fresh bed is built for every test. */
  readonly outcomes: CatalogQueryOutcomes;

  /** Every criteria object `findProducts` was handed, in call order. */
  readonly findProductsCalls: ProductQueryCriteria[];

  /** Every argument pair `getUnusedProductOptions` was handed, in call order. */
  readonly unusedProductOptionsCalls: RecordedUnusedOptionsCall[];

  /** Every list string `getUnusedProductOptionGroups` was handed, in call order. */
  readonly unusedProductOptionGroupsCalls: string[];

  /** Any unpublished service member that was reached. Asserted EMPTY by every test. */
  readonly unpublishedTouches: string[];

  /** Every line the subject emitted, raw. */
  readonly logLines: string[];

  /** How many times the composition root was resolved and a request scope opened. */
  readonly counters: { rootsResolved: number; scopesOpened: number };

  /** Every input used to open a request scope, in invocation order. */
  readonly scopeInputs: readonly (RequestScopeInput | undefined)[];
}

/**
 * Wire one subject over hand-written in-memory doubles.
 *
 * A FRESH BED PER TEST, always. The shipped handler is created per INSTANCE
 * rather than at module scope, so building a new subject is the whole of the isolation this suite
 * needs - there is no module state to reset, no global to restore and no cache to clear. Recorded
 * arrays are created here too, so no observation can leak from one test into the next.
 */
function makeTestBed(): CatalogQueryTestBed {
  const findProductsCalls: ProductQueryCriteria[] = [];
  const unusedProductOptionsCalls: RecordedUnusedOptionsCall[] = [];
  const unusedProductOptionGroupsCalls: string[] = [];
  const unpublishedTouches: string[] = [];
  const logLines: string[] = [];
  const counters = { rootsResolved: 0, scopesOpened: 0 };
  const scopeInputs: (RequestScopeInput | undefined)[] = [];

  const outcomes: CatalogQueryOutcomes = {
    productPage: makeProductPage([]),
    findProductsRejectsWith: undefined,
    unusedOptions: [],
    unusedOptionGroups: [],
    unusedOptionsRejectsWith: undefined,
    gate: undefined,
  };

  const passThroughGate = async (): Promise<void> => {
    const gate = outcomes.gate;
    if (gate !== undefined) {
      await gate;
    }
  };

  const productService: ProductServiceDouble = {
    findProducts: async (criteria: ProductQueryCriteria): Promise<ProductPage> => {
      // The criteria object is recorded BY REFERENCE deliberately: the subject builds a fresh one per
      // invocation and never retains it, so identity is exactly what a delegation assertion wants.
      findProductsCalls.push(criteria);
      await passThroughGate();
      if (outcomes.findProductsRejectsWith !== undefined) {
        throw outcomes.findProductsRejectsWith;
      }
      return outcomes.productPage;
    },

    // The fourteen tripwires. Each names the legacy locator its non-exposure is argued from, so the
    // list reads against the shipped module's own four categories rather than as an opaque block.
    deleteProduct: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.deleteProduct [L317]'),
    getFormattedOptionGroups: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.getFormattedOptionGroups [L70]'),
    getProductSkusBySelectedOptions: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.getProductSkusBySelectedOptions [L104]',
      ),
    loadDataFromFile: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.loadDataFromFile [L65]'),
    processProduct_addOption: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.processProduct_addOption [L128]'),
    processProduct_addOptionGroup: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_addOptionGroup [L113]',
      ),
    processProduct_addProductReview: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_addProductReview [L157]',
      ),
    processProduct_addSubscriptionTerm: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_addSubscriptionTerm [L173]',
      ),
    processProduct_deleteDefaultImage: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_deleteDefaultImage [L198]',
      ),
    processProduct_updateDefaultImageFileNames: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_updateDefaultImageFileNames [L208]',
      ),
    processProduct_updateSkus: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.processProduct_updateSkus [L216]'),
    processProduct_uploadDefaultImage: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_uploadDefaultImage [L235]',
      ),
    saveProduct: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.saveProduct [L264]'),
    saveProductType: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.saveProductType [L294]'),
  };

  const optionService: OptionServiceDouble = {
    getUnusedProductOptions: async (
      productID: string,
      existingOptionGroupIDList: string,
    ): Promise<readonly CatalogSelectOptionProjection[]> => {
      unusedProductOptionsCalls.push({ productID, existingOptionGroupIDList });
      await passThroughGate();
      if (outcomes.unusedOptionsRejectsWith !== undefined) {
        throw outcomes.unusedOptionsRejectsWith;
      }
      return outcomes.unusedOptions;
    },

    getUnusedProductOptionGroups: async (
      existingOptionGroupIDList: string,
    ): Promise<readonly CatalogSelectOptionProjection[]> => {
      unusedProductOptionGroupsCalls.push(existingOptionGroupIDList);
      await passThroughGate();
      return outcomes.unusedOptionGroups;
    },

    getOptionsForSelect: () =>
      refuseUnpublishedCall(unpublishedTouches, 'OptionService.getOptionsForSelect [L55]'),
  };

  const brandService: BrandServiceDouble = {
    saveBrand: () => refuseUnpublishedCall(unpublishedTouches, 'BrandService.saveBrand [L67]'),
  };

  // The programmed answers reach the REAL services through their prototypes. Installed here, once per
  // bed, so a test that never invokes the subject still gets its tripwires armed.
  installServiceAnswers(productService, optionService, brandService);

  // ONE REAL GRAPH PER BED, built lazily on first resolution and reused, which is what the production
  // memo does per container. `bootstrapCompositionRoot` with overrides bypasses the module memo by
  // design, so nothing is left behind for a sibling file - and `resetCompositionRoot()` in the hooks is
  // a second belt.
  let rootPromise: Promise<CompositionRoot> | undefined;
  const openRoot = async (): Promise<CompositionRoot> => {
    const inner = await bootstrapCompositionRoot({
      executor: new CatalogExecutor(),
      environment: CATALOG_ENVIRONMENT,
    });

    return new RecordingCompositionRoot(inner, counters, scopeInputs);
  };

  // The logger is pinned to `debug` AND redirected to a recording sink. Pinning is what makes the
  // suite independent of `LOG_LEVEL`: a pinned threshold is never resolved from the environment, so
  // the emissions asserted below are the same under an empty environment as under any other.
  const sink: LogSink = (line: string): void => {
    logLines.push(line);
  };
  const recordingLogger = logger.withSink(sink).withLevel('debug');

  const subject = createCatalogQueryHandler({
    compositionRoot: (): Promise<CompositionRoot> => {
      counters.rootsResolved += 1;
      rootPromise ??= openRoot();

      return rootPromise;
    },
    logger: recordingLogger,
  });

  return {
    invoke: async (
      overrides: EventOverrides = {},
      awsRequestId: string = INVOCATION_ID,
    ): Promise<APIGatewayProxyResult> =>
      await subject(makeEvent(overrides), makeContext(awsRequestId)),
    subject,
    outcomes,
    findProductsCalls,
    unusedProductOptionsCalls,
    unusedProductOptionGroupsCalls,
    unpublishedTouches,
    logLines,
    counters,
    scopeInputs,
  };
}

/** The query string for one operation, with the selector in place. */
function queryFor(
  operation: string,
  parameters: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  // ★★ `pageRecordsShow` IS SUPPLIED FOR EVERY `findProducts` REQUEST THAT DOES NOT NAME ITS OWN.
  // Static-performance review (finding F10) made the page size a REQUIRED member of the routed
  // contract, because omitting it means THE WHOLE PRODUCT RESULT SET to `ProductService.findProducts`
  // and this handler then projects and stringifies it into one body. Folding a default in here keeps
  // the cases that are ABOUT something else from having to restate it; the cases that are about the
  // bound name it explicitly and are unaffected by this line.
  const pageDefault =
    operation === 'findProducts' && parameters['pageRecordsShow'] === undefined
      ? { pageRecordsShow: '25' }
      : {};

  return { operation, ...pageDefault, ...parameters };
}

/** The published operations, as the three selector values a caller may send. */
const PUBLISHED_OPERATIONS: readonly CatalogQueryOperation[] = [
  'findProducts',
  'getUnusedProductOptions',
  'getUnusedProductOptionGroups',
];

/** A minimal, valid parameter set for each published operation. */
const VALID_PARAMETERS: Readonly<Record<CatalogQueryOperation, Readonly<Record<string, string>>>> =
  {
    findProducts: { keyword: 'jorden', pageRecordsShow: '25' },
    getUnusedProductOptions: {
      productID: FIRST_PRODUCT_ID,
      existingOptionGroupIDList: UNTIDY_OPTION_GROUP_ID_LIST,
    },
    getUnusedProductOptionGroups: { existingOptionGroupIDList: UNTIDY_OPTION_GROUP_ID_LIST },
  };

// ---------------------------------------------------------------------------
// Reading one element, one page, one row set, one field report
//
// `noUncheckedIndexedAccess` is on and a postfix `!` is not used anywhere in this file, so each
// reader below narrows explicitly and fails with a described error rather than asserting an index is
// populated.
// ---------------------------------------------------------------------------

/** The element at `index`, or a described failure. */
function atIndex<TElement>(items: readonly TElement[], index: number): TElement {
  const found = items[index];
  if (found === undefined) {
    throw new Error(`expected an element at index ${String(index)}, found none`);
  }
  return found;
}

/**
 * The product page a served response carries.
 *
 * Narrowed with `in` rather than with an array check: the published `result` member is a union of a
 * page and a row array, and only the page declares `records`.
 */
function readProductPage(response: APIGatewayProxyResult): CatalogProductPageProjection {
  const result = readServedBody(response).result.result;
  if (!('records' in result)) {
    throw new Error('expected a product page, and the response carried a select-row array');
  }
  return result;
}

/** The select rows a served response carries. */
function readSelectRows(response: APIGatewayProxyResult): readonly CatalogSelectOptionProjection[] {
  const result = readServedBody(response).result.result;
  if ('records' in result) {
    throw new Error('expected select rows, and the response carried a product page');
  }
  return result;
}

/** The field-level report a client-shaped failure carries, or a described failure. */
function readFieldIssues(
  response: APIGatewayProxyResult,
): readonly { readonly path: string; readonly message: string }[] {
  const fields = readFailureBody(response).error.fields;
  if (fields === undefined) {
    throw new Error(`expected a field-level report, and the body carried none: ${response.body}`);
  }
  return fields;
}

/** Every decoded line the subject emitted. */
function decodedLines(bed: CatalogQueryTestBed): readonly RecordedLogLine[] {
  return bed.logLines.map(decodeLogLine);
}

/**
 * A driver-shaped failure: an `Error` whose message embeds a statement AND a value bound into it.
 *
 * THE FIXTURE IS THE WHOLE ARGUMENT for why the mapper is selective rather than a pass-through, so it
 * is built to be maximally leaky: a `SELECT`, a physical table name and a bound literal in one
 * message, plus a machine code of the shape a driver reports. Nothing in it is a real credential, a
 * real host or a real value from anywhere - `sentinel-bound-value` is invented for this file. Built by
 * `Object.assign` so the returned type is the intersection the assertions need, with no cast.
 */
function driverShapedFailure(): Error {
  return Object.assign(
    new Error(
      "select productID, productName from SwProduct where productName like 'sentinel-bound-value'",
    ),
    { name: 'DriverError', code: 'ER_BAD_FIELD_ERROR' },
  );
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe('catalogQueryHandler', () => {
  let bed: CatalogQueryTestBed;

  beforeEach(() => {
    resetCompositionRoot();
    appConfig.reset();
    bed = makeTestBed();
  });

  // A PER-SUITE `afterEach`, KEPT DELIBERATELY ALONGSIDE THE GLOBAL ONE. `tests/setup.ts` already
  // registers a global hook that restores mocks and real timers, and `vitest.config.ts` sets
  // `restoreMocks` and `clearMocks`. This one is complementary rather than redundant: it states the
  // obligation locally, so a spy added to this file later is restored by this file's own contract
  // instead of depending on configuration two directories away. It also empties the recorded log
  // lines, which no global hook knows about.
  afterEach(() => {
    vi.restoreAllMocks();
    bed.logLines.length = 0;
    // The composition memo and `appConfig` are module state. Every bed builds its graph through the
    // override arm, which bypasses the memo by design, and clearing both here means this file leaves
    // neither behind for a sibling suite in the same worker.
    resetCompositionRoot();
    appConfig.reset();
  });

  it('publishes a Lambda entry point, without any test invoking it', () => {
    // The module-level `handler` is created when the container loads the module. Asserting only that
    // it EXISTS is deliberate: invoking it would reach the real composition root, the real
    // configuration and therefore a connection pool, which this suite must never do. The factory
    // below is what every other test drives, and it is a DIFFERENT instance - each handler owns its
    // own composition-root resolver, which is why building one per test is the whole of the isolation.
    expect(typeof handler).toBe('function');
    expect(bed.subject).not.toBe(handler);
    expect(bed.counters.rootsResolved).toBe(0);
    expect(bed.counters.scopesOpened).toBe(0);
  });

  // =========================================================================
  // CONCERN 1 - REQUEST PARSING AND VALIDATION: route admission
  // =========================================================================

  describe('concern 1, request parsing: admission through the shipped route table', () => {
    it('serves the canonical route this capability owns', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      expect(response.statusCode).toBe(200);
      expect(CATALOG_ROUTE.path).toBe('/catalog/products');
      expect(CATALOG_ROUTE.methods).toBe('GET');
      expect(CATALOG_ROUTE.action).toBe('queryCatalog');
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('matches the path case-insensitively', async () => {
      // CFML parity [Application.cfc:L130, L133]: the routing convention being replaced compared
      // subsystem names with `eq` and with `listFindNoCase`, both case-insensitive. The router folds
      // case for that reason, and the casing written in the route table is therefore a readability
      // choice rather than part of the contract.
      const response = await bed.invoke({
        path: CATALOG_ROUTE.path.toUpperCase(),
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('matches the method case-insensitively', async () => {
      const response = await bed.invoke({
        method: CATALOG_ROUTE.methods.toLowerCase(),
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('canonicalizes a path carrying a trailing, doubled or absent leading separator', async () => {
      const untidy = `${CATALOG_ROUTE.path.replace('/catalog', '//catalog')}/`;
      const response = await bed.invoke({
        path: untidy,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('answers a sibling capability\u2019s route as an unmatched route', async () => {
      const response = await bed.invoke({
        path: SKU_RESOLUTION_ROUTE.path,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(404);
      expect(readFailureBody(response).error.category).toBe('routeNotFound');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('answers another capability\u2019s method and path as an unmatched route', async () => {
      const response = await bed.invoke({
        method: PROMOTION_APPLICATION_ROUTE.methods,
        path: PROMOTION_APPLICATION_ROUTE.path,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(404);
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('refuses a method the owned route does not declare', async () => {
      const response = await bed.invoke({
        method: 'POST',
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(404);
      expect(readFailureBody(response).error.category).toBe('routeNotFound');
    });

    it('refuses a path no row of the table declares', async () => {
      const response = await bed.invoke({
        path: '/catalog/products/extra',
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(404);
    });

    it('publishes the unmatched-route envelope without echoing the requested path', async () => {
      const requested = '/catalog/products/unknown-segment';
      const response = await bed.invoke({ path: requested });
      const failure = readFailureBody(response).error;

      expect(failure.category).toBe('routeNotFound');
      expect(failure.message).toBe('The requested route does not exist.');
      expect(failure.requestId).toBe(INVOCATION_ID);
      expect(failure.fields).toBeUndefined();
      expect(response.body).not.toContain('unknown-segment');
    });

    it('opens no request scope and resolves no composition root for an unmatched route', async () => {
      await bed.invoke({ path: '/nothing/here' });

      // The bound this proves is a CORRECTNESS one: nothing is constructed for a request that was
      // never this capability's to serve, so a refused request cannot reach a service or a statement.
      expect(bed.counters.rootsResolved).toBe(0);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(bed.unpublishedTouches).toEqual([]);
    });
  });

  // =========================================================================
  // CONCERN 1 - REQUEST PARSING AND VALIDATION: the admission gate
  // =========================================================================

  describe('concern 1, request parsing: the admission gate', () => {
    it('refuses a request carrying no authorizer context', async () => {
      const response = await bed.invoke({
        authorizer: null,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(401);
      expect(readFailureBody(response).error.category).toBe('unauthenticated');
      expect(bed.counters.rootsResolved).toBe(0);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('refuses every context that names no usable account', async () => {
      for (const authorizer of [
        {},
        { unrelated: 'x' },
        { accountID: '' },
        { accountID: '   ' },
        { accountID: 42 },
      ]) {
        const fresh = makeTestBed();

        const response = await fresh.invoke({
          authorizer,
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(401);
        expect(fresh.counters.rootsResolved).toBe(0);
        expect(fresh.findProductsCalls).toEqual([]);
      }
    });

    it('refuses before the selector, parameter closure and schema are evaluated', async () => {
      for (const query of [
        {},
        { operation: 'nonsense' },
        queryFor('findProducts', { keyword: 'jorden', nosuchparameter: 'x' }),
        queryFor('findProducts'),
      ]) {
        const fresh = makeTestBed();
        const response = await fresh.invoke({ authorizer: null, query });

        expect(response.statusCode).toBe(401);
        expect(fresh.counters.rootsResolved).toBe(0);
      }
    });

    it('still resolves the route first, so a wrong path is a 404 rather than a 401', async () => {
      const unmatched = await bed.invoke({ authorizer: null, path: '/nothing/here' });
      const sibling = await bed.invoke({
        authorizer: null,
        path: SKU_RESOLUTION_ROUTE.path,
      });

      expect(unmatched.statusCode).toBe(404);
      expect(sibling.statusCode).toBe(404);
    });

    it('publishes no claim name, internal reason or field detail in the refusal', async () => {
      const response = await bed.invoke({ authorizer: null });
      const failure = readFailureBody(response).error;

      expect(failure.message).toBe('The request was not served.');
      expect(failure.fields).toBeUndefined();
      expect(response.body).not.toContain('accountID');
      expect(response.body).not.toContain('authoriz');
      expect(response.body).not.toContain('noAuthorizerContext');
      expect(response.body).not.toContain('noAccountClaim');
      expect(failure.requestId).toBe(INVOCATION_ID);
    });

    it('emits no authentication challenge because no scheme is declared', async () => {
      const response = await bed.invoke({ authorizer: null });

      // ★ TWO HEADERS, STILL CLOSED. `x-content-type-options: nosniff` briefly joined the shared
      // response set and a code review removed it as an invented HTTP semantic (AAP 0.8.1); what this
      // case asserts is unchanged - no `www-authenticate`, because this route declares no challenge
      // scheme.
      expect(
        Object.keys(response.headers ?? {})
          .map((name): string => name.toLowerCase())
          .sort(),
      ).toEqual(['cache-control', 'content-type']);
    });

    it('logs only the closed refusal category and no caller-authored claim text', async () => {
      await bed.invoke({ authorizer: null });

      const warnings = decodedLines(bed).filter((line) => line.level === 'warn');
      expect(warnings).toHaveLength(2);
      expect(atIndex(warnings, 0).message).toContain('no caller principal');
      expect(atIndex(warnings, 0).message).toContain('noAuthorizerContext');
      expect(atIndex(warnings, 1).message).toContain('serves no unidentified caller');
      for (const warning of warnings) {
        expect(warning.raw).not.toContain('accountID');
      }
    });

    it('opens the request scope with the account the gate established', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.scopeInputs).toStrictEqual([{ accountID: CALLER_ACCOUNT_ID }]);
    });

    it('reads the account claim case-insensitively', async () => {
      const response = await bed.invoke({
        authorizer: { accountId: CALLER_ACCOUNT_ID, ADMINACCOUNTFLAG: true },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      // BOTH claims are read case-insensitively, which is CFML struct-key semantics and the reason
      // `structGet` is used for each. An authorizer that spells either differently is the same caller.
      expect(response.statusCode).toBe(200);
      expect(bed.scopeInputs).toStrictEqual([{ accountID: CALLER_ACCOUNT_ID }]);
    });

    it('serves the administrative default caller past the gate', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★★ refuses an IDENTIFIED caller carrying no administrative claim, with 403 (F45)', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: queryFor('findProducts', { keyword: '' }),
      });

      // AN EMPTY KEYWORD MATCHES EVERY ROW and the statement carries no `activeFlag`/`publishedFlag`
      // predicate, so this is the exact request that enumerated inactive and unpublished catalog data
      // for any identified account. 403, not 401 - an identity WAS established and is insufficient -
      // and not 400, because nothing about the input was malformed.
      expect(response.statusCode).toBe(403);
      expect(readFailureBody(response).error.category).toBe('forbidden');
      expect(bed.findProductsCalls).toHaveLength(0);
      expect(bed.scopeInputs).toStrictEqual([]);
    });

    it('refuses every non-admitted rendering of the administrative claim, and admits the closed two', async () => {
      // The vocabulary is `errorMapper`'s and is not widened here: a real `boolean true`, or one of
      // the two truthy STRINGS API Gateway can carry. A NUMBER is refused - including `1`, which is
      // admitted as the string `'1'` and refused as the numeral - because a claim that arrives
      // untyped is not a claim this route will guess at. Fail-closed is the direction for a
      // permission bit.
      for (const refused of [
        false,
        'false',
        '0',
        0,
        1,
        '',
        ' ',
        'no',
        'yes',
        null,
        undefined,
        {},
        [],
      ]) {
        const fresh = makeTestBed();
        const response = await fresh.invoke({
          authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: refused },
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(403);
        expect(fresh.findProductsCalls).toHaveLength(0);
      }

      for (const admitted of [true, 'true', '1', ' TRUE ', 'True']) {
        const fresh = makeTestBed();
        const response = await fresh.invoke({
          authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: admitted },
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(200);
        expect(fresh.findProductsCalls).toHaveLength(1);
      }
    });

    it('refuses a non-administrative caller on EVERY published operation, not just the search', async () => {
      // The finding names the two option operations as "admin-only" explicitly, so the gate is
      // asserted on all three rather than on the one that happens to be listed first.
      for (const query of [
        queryFor('findProducts', { keyword: 'jorden' }),
        queryFor('getUnusedProductOptions', {
          productID: FIRST_PRODUCT_ID,
          existingOptionGroupIDList: '',
        }),
        queryFor('getUnusedProductOptionGroups', { existingOptionGroupIDList: '' }),
      ]) {
        const fresh = makeTestBed();
        const response = await fresh.invoke({
          authorizer: { accountID: CALLER_ACCOUNT_ID },
          query,
        });

        expect(response.statusCode).toBe(403);
      }
    });

    it('publishes nothing about the claim in the 403, and costs no statement', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });
      const failure = readFailureBody(response).error;

      // The 403 sentence is the 401 sentence: an attacker learns WHICH refusal occurred from the
      // status and nothing else from the body. No claim name, no account identifier, no field path.
      expect(failure.message).toBe('The request was not served.');
      expect(failure.fields).toBeUndefined();
      expect(response.body).not.toContain('adminAccountFlag');
      expect(response.body).not.toContain('admin');
      expect(response.body).not.toContain(CALLER_ACCOUNT_ID);
      expect(bed.scopeInputs).toStrictEqual([]);
    });

    it('logs the administrative refusal without the account identifier or the claim name', async () => {
      await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      const warnings = decodedLines(bed).filter((line) => line.level === 'warn');

      expect(warnings).toHaveLength(2);
      expect(atIndex(warnings, 0).message).toContain('no administrative claim');
      expect(atIndex(warnings, 1).message).toContain('not permitted the operation');
      for (const warning of warnings) {
        expect(warning.raw).not.toContain(CALLER_ACCOUNT_ID);
      }
    });
  });

  // =========================================================================
  // CONCERN 1 - REQUEST PARSING AND VALIDATION: the operation selector
  // =========================================================================

  describe('concern 1, request parsing: the operation selector', () => {
    it('requires the selector, and names the three published operations when it is absent', async () => {
      const response = await bed.invoke({ query: {} });
      const failure = readFailureBody(response).error;
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(failure.category).toBe('invalidRequest');
      expect(failure.message).toBe('A required query parameter is missing.');
      expect(issue.path).toBe('operation');
      for (const operation of PUBLISHED_OPERATIONS) {
        expect(issue.message).toContain(operation);
      }
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('treats a blank selector as absent rather than unrecognized', async () => {
      const response = await bed.invoke({ query: { operation: '' } });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe(
        'A required query parameter is missing.',
      );
    });

    it('treats a whitespace-only selector as absent', async () => {
      const response = await bed.invoke({ query: { operation: '   ' } });

      expect(readFailureBody(response).error.message).toBe(
        'A required query parameter is missing.',
      );
    });

    it('treats an unpopulated query-string map as no selector at all', async () => {
      const response = await bed.invoke({ query: null });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe(
        'A required query parameter is missing.',
      );
    });

    it('refuses an operation it does not publish, without echoing what was submitted', async () => {
      const response = await bed.invoke({ query: { operation: 'getProductSmartList' } });
      const failure = readFailureBody(response).error;

      expect(response.statusCode).toBe(400);
      expect(failure.category).toBe('invalidRequest');
      expect(failure.message).toBe('The request input is not valid.');
      expect(response.body).not.toContain('getProductSmartList');
      expect(atIndex(readFieldIssues(response), 0).path).toBe('operation');
    });

    it('compares the selector CASE-SENSITIVELY', async () => {
      // JUDGMENT CALL: the selector is compared case-sensitively while the PATH is not, and the
      // asymmetry is asserted rather than smoothed over. The path comparison folds case because it
      // reproduces two CFML comparisons that fold case [Application.cfc:L130, L133]; this selector has
      // no legacy antecedent at all - it exists to BE the ported method's name character for
      // character, which is what makes the interface-parity diff mechanical. Admitting `FINDPRODUCTS`
      // would loosen the one thing the selector exists to pin.
      const response = await bed.invoke({
        query: { operation: 'findProducts'.toUpperCase(), keyword: 'jorden' },
      });

      expect(response.statusCode).toBe(400);
      expect(bed.findProductsCalls).toEqual([]);
    });

    it.each(PUBLISHED_OPERATIONS)('recognizes the published operation %s', async (operation) => {
      const response = await bed.invoke({
        query: queryFor(operation, VALID_PARAMETERS[operation]),
      });

      expect(response.statusCode).toBe(200);
      expect(readServedBody(response).result.operation).toBe(operation);
    });

    it('reads the selector from the multi-value map when the single-valued map lacks it', async () => {
      const response = await bed.invoke({
        // The page size is named here rather than left to `queryFor`, because this case assembles the
        // single-valued map directly in order to leave `operation` out of it.
        query: { keyword: 'jorden', pageRecordsShow: '25' },
        repeatedQuery: { operation: ['findProducts'] },
      });

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });
  });

  // =========================================================================
  // CONCERN 1 - REQUEST PARSING AND VALIDATION: the closed criteria shape
  // =========================================================================

  describe('concern 1, request parsing: the closed, typed criteria shape', () => {
    it('requires the keyword, because the statement binds it unconditionally', async () => {
      // CFML parity [model/dao/ProductDAO.cfc:L422]: the term is bound as `%<term>%` BEFORE the
      // `structKeyExists` guard that protects the product-type list at [L423], so omitting it in CFML
      // reached an undefined-variable raise rather than a broader search. The ported criteria type
      // declares it required for that reason, and a request omitting it is refused here rather than
      // one layer down.
      const response = await bed.invoke({ query: queryFor('findProducts') });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe('The request input is not valid.');
      expect(issue.path).toBe('keyword');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('accepts a keyword that is present and EMPTY, which is a search matching every row', async () => {
      // An empty value is not a missing value. [model/dao/ProductDAO.cfc:L422] binds `%%` for an
      // empty term, which matches every row - an outcome that belongs to the caller, not an error.
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: '' }) });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).keyword).toBe('');
    });

    it('refuses a parameter the named operation does not publish, without echoing the key', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', unpublishedKnob: 'true' }),
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe('queryStringParameters');
      // The refusal names the CONTAINER, never the key: a key name is caller-authored text, and a
      // response body that echoed it would be a hole through the no-echo guarantee.
      expect(response.body).not.toContain('unpublishedKnob');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it.each([['__proto__'], ['constructor'], ['prototype']])(
      'refuses the reserved key %s, so the closed grammar has no inherited-property bypass',
      async (reservedKey) => {
        const response = await bed.invoke({
          query: queryFor('findProducts', { keyword: 'jorden', [reservedKey]: 'injected' }),
        });

        expect(response.statusCode).toBe(400);
        expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
        expect(response.body).not.toContain(reservedKey);
        expect(response.body).not.toContain('injected');
        expect(bed.findProductsCalls).toEqual([]);
        expect(bed.counters.scopesOpened).toBe(0);
      },
    );

    it('leaves Object.prototype untouched after a reserved-key request', async () => {
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', ['__proto__']: 'polluted' }),
      });

      expect(Object.prototype).not.toHaveProperty('polluted');
      expect(Object.keys({})).toHaveLength(0);
    });

    it('does not reopen the framework smart list\u2019s dynamic filter surface', async () => {
      // AAP 0.6.2: `getProductSmartList` [model/service/ProductService.cfc:L342-L358] interpreted a
      // `struct data={}` at run time as filters, ranges, orders and page bounds. Its replacement is a
      // CLOSED typed shape, and this is what that means on the wire: a string-keyed filter is refused
      // rather than ignored, so a caller is told instead of silently receiving an unfiltered result.
      const response = await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          'filter[brand.brandName]': 'nike',
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('carries currentURL, which is part of the surface being diffed and is not interpreted', async () => {
      // CFML parity [model/service/ProductService.cfc:L342]: the legacy signature declares
      // `currentURL=""`, so the member survives for signature parity. Nothing derives behaviour from
      // it, and this asserts exactly that: it is forwarded unchanged and changes nothing.
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', currentURL: '/sp/nike-air-jorden/' }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).currentURL).toBe('/sp/nike-air-jorden/');
    });

    it.each([
      ['a non-numeral', 'twelve'],
      ['a signed numeral', '-1'],
      ['a fractional numeral', '1.5'],
      ['an exponent', '1e3'],
      ['a padded numeral', ' 4 '],
    ])('refuses %s as a paging bound', async (_description, supplied) => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsStart: supplied }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('pageRecordsStart');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('converts a wire numeral to a number rather than forwarding the string', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          pageRecordsStart: '20',
          pageRecordsShow: '5',
        }),
      });
      const criteria = atIndex(bed.findProductsCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(criteria.pageRecordsStart).toBe(20);
      expect(criteria.pageRecordsShow).toBe(5);
    });

    it.each([
      ['just above the safe-integer ceiling', '9007199254740992'],
      ['far above it', '99999999999999999999'],
      ['absurdly long', '1'.repeat(400)],
    ])('refuses %s as a paging bound at the boundary', async (_description, supplied) => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: supplied }),
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe('pageRecordsShow');
      expect(issue.message).toContain('largest integer this runtime can represent exactly');
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('admits the largest exactly-representable integer', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          pageRecordsStart: String(Number.MAX_SAFE_INTEGER),
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).pageRecordsStart).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('forwards a supplied window of ZERO as zero, never as absence', async () => {
      // The distinction is load-bearing on the service's contract, where the member remains OPTIONAL:
      // an absent `pageRecordsShow` reaching `ProductService.findProducts` means the whole result set,
      // so a `0` that decayed into absence on the way through would return everything to a caller that
      // asked for nothing. The routed contract refuses absence (see the paging-bound block below), but
      // it does so by REJECTING the request rather than by substituting a window, which is what keeps
      // this case and that one from contradicting each other.
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '0' }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).pageRecordsShow).toBe(0);
    });

    it('requires both parameters of getUnusedProductOptions', async () => {
      // CFML parity [model/service/OptionService.cfc:L72]: both arguments are declared `required`.
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', { productID: FIRST_PRODUCT_ID }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('existingOptionGroupIDList');
      expect(bed.unusedProductOptionsCalls).toEqual([]);
    });

    it('publishes NO product identifier on getUnusedProductOptionGroups', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L94-L95] against [model/dao/OptionDAO.cfc:L51-L53]: the
      // group query takes ONE argument and the option query takes two. The asymmetry is the source's
      // own, and admitting an optional `productID` here would invent a requirement and quietly change
      // the result set.
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', {
          existingOptionGroupIDList: UNTIDY_OPTION_GROUP_ID_LIST,
          productID: FIRST_PRODUCT_ID,
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
    });

    it('accepts an EMPTY option-group list, which the legacy queries never guarded', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L68, L107]: neither query guards an empty list, so an
      // empty value leaves one of them excluding nothing while it leaves the other matching nothing.
      // Both outcomes belong to the caller, so the parameter must be PRESENT and may be empty.
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', { existingOptionGroupIDList: '' }),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.unusedProductOptionGroupsCalls).toEqual(['']);
    });

    it('restates none of the Product_UpdateSkus conditional rules at this tier', async () => {
      // The rules of [model/validation/Product_UpdateSkus.json] - `price` required under
      // `showPrice{updatePriceFlag eq 1}` and `listPrice` required under
      // `showListPrice{updateListPriceFlag eq 1}` - are ported as a module-private schema inside
      // `src/services/productService.ts`, which `processProduct_updateSkus`
      // [model/service/ProductService.cfc:L216-L233] parses with before any mutation. That operation
      // is not published here, so there is no path through this entrypoint on which either
      // conditional could be exercised, and duplicating the schema is exactly how two tiers drift.
      // What is asserted instead is that neither condition name is admitted as a parameter of any
      // published operation, and that the operation itself is refused.
      const refusedOperation = await bed.invoke({
        query: queryFor('processProduct_updateSkus', { updatePriceFlag: '1', price: '19.99' }),
      });
      expect(refusedOperation.statusCode).toBe(400);
      expect(readFailureBody(refusedOperation).error.message).toBe(
        'The request input is not valid.',
      );

      for (const conditionalMember of [
        'price',
        'listPrice',
        'updatePriceFlag',
        'updateListPriceFlag',
      ]) {
        const refusedParameter = await bed.invoke({
          query: queryFor('findProducts', { keyword: 'jorden', [conditionalMember]: '1' }),
        });
        expect(refusedParameter.statusCode).toBe(400);
        expect(atIndex(readFieldIssues(refusedParameter), 0).path).toBe('queryStringParameters');
      }

      expect(bed.unpublishedTouches).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('reads no operation parameter when only the multi-value map was populated', async () => {
      // An event whose single-valued query map is unpopulated is admissible: the selector is then read
      // from the multi-value map, and the operation's parameters are simply ABSENT. The schema refuses
      // the request on the missing keyword rather than the handler inventing one from the repeated map,
      // which would silently accept a parameter the closed shape never agreed to read from there.
      const response = await bed.invoke({
        query: null,
        repeatedQuery: { operation: ['findProducts'] },
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('keyword');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('invents no schema for the six entities that have no validation file by design', async () => {
      // `Category`, `PromotionQualifier`, `PromotionApplied`, `PromotionAccount`, `Product_AddOption`
      // and `Product_AddOptionGroup` carry NO validation file, and those absences are deliberate.
      // Nothing named after one of them is admitted here, so no rule is invented where the legacy
      // declares none.
      for (const invented of [
        'category',
        'promotionQualifier',
        'promotionApplied',
        'promotionAccount',
        'productAddOption',
        'productAddOptionGroup',
      ]) {
        const response = await bed.invoke({
          query: queryFor('findProducts', { keyword: 'jorden', [invented]: 'anything' }),
        });

        expect(response.statusCode).toBe(400);
        expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
      }
    });
  });

  // =========================================================================
  // CONCERN 2 - DELEGATION TO THE COMPOSED SERVICES
  // =========================================================================

  // -------------------------------------------------------------------------
  // Concern 1, continued: the two admission bounds a routed request must clear
  //
  // ★★ BOTH BOUNDS ARE NEW, AND NEITHER IS A STYLE PREFERENCE. Review found two ways one caller could
  // ask this entrypoint for unbounded work:
  //
  //   * FINDING F10 - the page size was OPTIONAL on the routed contract, and an absent one means THE
  //     WHOLE `SwProduct` MATCH SET to `ProductService.findProducts`, which this handler then projects
  //     and JSON-stringifies into a single API Gateway body. The service member stays optional, so no
  //     in-process caller was truncated; the REQUEST is what now has to name a window.
  //   * FINDING F17 - a comma-delimited identifier list becomes one SQL predicate and one placeholder
  //     PER ELEMENT, and the MySQL wire protocol cannot carry more than 65535 placeholders in one
  //     prepared statement.
  //
  // Both are enforced at ADMISSION, so the answer is a client-shaped 400 naming the member rather than
  // the generic 500 an unrecognized throw from the statement builder would produce. Both REFUSE rather
  // than clamp or shorten: answering a narrower question than the one asked, silently, is the failure
  // mode these cases exist to prevent.
  // -------------------------------------------------------------------------
  describe('concern 1, request parsing: the two admission bounds (F10, F17)', () => {
    it('REFUSES a findProducts request that names no page size at all', async () => {
      const response = await bed.invoke({
        query: { operation: 'findProducts', keyword: 'jorden' },
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('pageRecordsShow');
      // The refusal happens BEFORE any service work, so the unbounded query is never issued.
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('accepts a page size AT the ceiling and forwards it unchanged', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '500' }),
      });

      // AT the bound is accepted, not rejected: the boundary is inclusive, and pinning it here is what
      // stops a later off-by-one from narrowing the surface without a failing test.
      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.findProductsCalls, 0).pageRecordsShow).toBe(500);
    });

    it('REFUSES a page size one record above the ceiling, and does not clamp it', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '501' }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('pageRecordsShow');
      expect(bed.findProductsCalls).toEqual([]);
      // NOT clamped to the ceiling: a 200 carrying 500 records would answer a different question than
      // the one asked and would tell the caller nothing about why.
      expect(response.statusCode).not.toBe(200);
    });

    it('names the constraint without echoing the submitted value back', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '999999' }),
      });

      const issue = atIndex(readFieldIssues(response), 0);
      expect(issue.path).toBe('pageRecordsShow');
      expect(issue.message).toContain('500');
      expect(response.body).not.toContain('999999');
    });

    it('admits a comma list well inside the protocol ceiling', async () => {
      const groups = Array.from(
        { length: 64 },
        (unused, index) => `${MERCHANDISE_PRODUCT_TYPE_ID}-${String(index)}`,
      );
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', {
          existingOptionGroupIDList: groups.join(','),
        }),
      });

      expect(response.statusCode).toBe(200);
      // Forwarded as the COMMA-DELIMITED STRING the ported signature declares, byte for byte: not
      // split, not trimmed, not sorted, not de-duplicated and not re-joined.
      expect(atIndex(bed.unusedProductOptionGroupsCalls, 0)).toBe(groups.join(','));
    });

    it('REFUSES a comma list the wire protocol could not bind, naming the member', async () => {
      const overWide = Array.from({ length: MAX_PLACEHOLDER_COUNT + 1 }, (unused, index) =>
        String(index),
      ).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', { existingOptionGroupIDList: overWide }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('existingOptionGroupIDList');
      expect(atIndex(readFieldIssues(response), 0).message).toContain('65535');
      // Refused before the service is reached, so no statement is built and no scope is opened.
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('admits a group-only list exactly at the protocol ceiling', async () => {
      const atCeiling = Array.from({ length: MAX_PLACEHOLDER_COUNT }, (unused, index) =>
        String(index),
      ).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', {
          existingOptionGroupIDList: atCeiling,
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.unusedProductOptionGroupsCalls, 0)).toBe(atCeiling);
    });

    it('counts the keyword bind in the findProducts placeholder ceiling', async () => {
      const overWide = Array.from({ length: MAX_PLACEHOLDER_COUNT }, (unused, index) =>
        String(index),
      ).join(',');
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', productTypeIDs: overWide }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('productTypeIDs');
      expect(atIndex(readFieldIssues(response), 0).message).toContain(
        String(MAX_PLACEHOLDER_COUNT - 1),
      );
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('counts the trailing productID bind in the unused-options placeholder ceiling', async () => {
      const overWide = Array.from({ length: MAX_PLACEHOLDER_COUNT }, (unused, index) =>
        String(index),
      ).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', {
          productID: FIRST_PRODUCT_ID,
          existingOptionGroupIDList: overWide,
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('existingOptionGroupIDList');
      expect(atIndex(readFieldIssues(response), 0).message).toContain(
        String(MAX_PLACEHOLDER_COUNT - 1),
      );
      expect(bed.unusedProductOptionsCalls).toEqual([]);
    });

    it('does not let the refusal reach the caller as a 500', async () => {
      // The point of asking at admission rather than letting the statement builder raise: the same
      // refusal arriving from `src/repositories/mysql/sql/**` is an unrecognized throw, and
      // `./errorMapper.js` maps an unrecognized throw to a generic 500 with no field report at all.
      const overWide = Array.from({ length: 70000 }, (unused, index) => String(index)).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', {
          productID: FIRST_PRODUCT_ID,
          existingOptionGroupIDList: overWide,
        }),
      });

      expect(response.statusCode).toBe(400);
      // The mapper's own client-shaped category, the same one every schema rejection carries - NOT the
      // `unrecognized` category an escaped statement-builder throw would have been given.
      expect(readFailureBody(response).error.category).toBe('invalidRequest');
      expect(atIndex(readFieldIssues(response), 0).path).toBe('existingOptionGroupIDList');
    });
  });

  describe('concern 2, delegation: one ported service method per invocation', () => {
    it('resolves the composition root once, opens one scope, and calls findProducts once', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      expect(response.statusCode).toBe(200);
      expect(bed.counters.rootsResolved).toBe(1);
      expect(bed.counters.scopesOpened).toBe(1);
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionsCalls).toEqual([]);
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
    });

    it('forwards every supplied criteria member unchanged', async () => {
      await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          productTypeIDs: `${MERCHANDISE_PRODUCT_TYPE_ID},${MERCHANDISE_PRODUCT_TYPE_ID}`,
          pageRecordsStart: '10',
          pageRecordsShow: '25',
          currentURL: '/sp/',
        }),
      });

      expect(atIndex(bed.findProductsCalls, 0)).toEqual({
        keyword: 'jorden',
        productTypeIDs: `${MERCHANDISE_PRODUCT_TYPE_ID},${MERCHANDISE_PRODUCT_TYPE_ID}`,
        pageRecordsStart: 10,
        pageRecordsShow: 25,
        currentURL: '/sp/',
      });
    });

    it('forwards ABSENCE as absence on every member that is still optional', async () => {
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '25' }),
      });
      const criteria = atIndex(bed.findProductsCalls, 0);

      // Absence is forwarded as `undefined`, never as a substituted value: an absent `productTypeIDs`
      // means "do not restrict", so a `0` or an `''` in its place would silently ask a different
      // question.
      expect(criteria.productTypeIDs).toBeUndefined();
      expect(criteria.pageRecordsStart).toBeUndefined();
      expect(criteria.currentURL).toBeUndefined();

      // ★★ `pageRecordsShow` IS NO LONGER ONE OF THEM, AND THAT IS THE FIX RATHER THAN AN OVERSIGHT.
      // Static-performance review (finding F10) established that forwarding an absent page size means
      // THE WHOLE `SwProduct` RESULT SET to `ProductService.findProducts`, which this handler then
      // projects and stringifies into a single API Gateway body under a fixed response-size ceiling.
      // The bound therefore lives on the ROUTED contract - a request that names no page size is
      // refused at 400, which the paging-bound block below pins - and the value the caller supplied
      // is what reaches the service, unchanged and unsubstituted. `ProductQueryCriteria` still
      // declares the member optional, so no service caller was truncated by this.
      expect(criteria.pageRecordsShow).toBe(25);
    });

    it('keeps productTypeIDs a COMMA-DELIMITED STRING rather than modernising it', async () => {
      // CFML parity [model/dao/ProductDAO.cfc:L419, L424]: the adapter binds it as a CFML list, so
      // the string form is what signature parity preserves. The plural spelling is the repository's
      // own and is not harmonised with the SKU repository's singular one.
      const supplied = `${MERCHANDISE_PRODUCT_TYPE_ID},dddd,,eeee`;
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', productTypeIDs: supplied }),
      });

      expect(atIndex(bed.findProductsCalls, 0).productTypeIDs).toBe(supplied);
    });

    it('forwards the option list to getUnusedProductOptions exactly as received', async () => {
      // `existingOptionGroupIDList` STAYS A STRING for signature parity
      // [model/service/OptionService.cfc:L72], and comma-list expansion belongs to the binding layer:
      // [model/dao/OptionDAO.cfc:L68] binds it with `cfqueryparam ... list="true"`. So the handler
      // must forward it UNMODIFIED - untrimmed, unsorted, uncase-folded and undeduplicated.
      await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });
      const call = atIndex(bed.unusedProductOptionsCalls, 0);

      expect(call.productID).toBe(FIRST_PRODUCT_ID);
      expect(call.existingOptionGroupIDList).toBe(UNTIDY_OPTION_GROUP_ID_LIST);
      expect(call.existingOptionGroupIDList).not.toBe(UNTIDY_OPTION_GROUP_ID_LIST.trim());
      expect(call.existingOptionGroupIDList).not.toBe(UNTIDY_OPTION_GROUP_ID_LIST.toLowerCase());
      expect(call.existingOptionGroupIDList).not.toBe(
        UNTIDY_OPTION_GROUP_ID_LIST.split(',')
          .map((entry) => entry.trim())
          .sort()
          .join(','),
      );
    });

    it('forwards the option list to getUnusedProductOptionGroups exactly as received', async () => {
      await bed.invoke({
        query: queryFor(
          'getUnusedProductOptionGroups',
          VALID_PARAMETERS.getUnusedProductOptionGroups,
        ),
      });

      expect(bed.unusedProductOptionGroupsCalls).toEqual([UNTIDY_OPTION_GROUP_ID_LIST]);
    });

    it('publishes option rows in repository order, without re-sorting them', async () => {
      // Ordering is established in SQL - `ORDER BY SwOptionGroup.optionGroupName, SwOption.optionName`
      // [model/dao/OptionDAO.cfc:L82-L84] - so a handler that re-sorted would be making a decision the
      // statement already made. The rows below are deliberately NOT in alphabetical order, and the
      // response must carry them exactly as the service answered.
      bed.outcomes.unusedOptions = [
        selectRow('Size - Large', 'opt-large'),
        selectRow('Colour - Zulu Blue', 'opt-zulu'),
        selectRow('Colour - alpha Red', 'opt-alpha'),
      ];

      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });

      expect(readSelectRows(response).map((row) => row.value)).toEqual([
        'opt-large',
        'opt-zulu',
        'opt-alpha',
      ]);
    });

    it('leaves the composite option name unsplit, unreformatted and unre-derived', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L88]: the row's `name` is built in the DAO as
      // `"#rs.optionGroupName# - #rs.optionName#"` - a space, a hyphen and a space. The handler
      // publishes that one string; it does not split it back into two members, re-join it with a
      // different separator, or re-derive it from anything.
      const composite = 'Colour - Zulu Blue';
      bed.outcomes.unusedOptions = [selectRow(composite, 'opt-zulu')];

      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });
      const row = atIndex(readSelectRows(response), 0);

      expect(row).toEqual({ name: composite, value: 'opt-zulu' });
      expect(Object.keys(row).sort()).toEqual(['name', 'value']);
      expect(response.body).toContain(composite);
    });

    it('publishes group rows keyed on the option-group identifier', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L113]: the group query appends
      // `{name=rs.optionGroupName, value=rs.optionGroupID}`, so `value` is a GROUP identifier here
      // while it is an OPTION identifier in the sibling query. Same row shape, different key.
      bed.outcomes.unusedOptionGroups = [selectRow('Colour', 'group-colour')];

      const response = await bed.invoke({
        query: queryFor(
          'getUnusedProductOptionGroups',
          VALID_PARAMETERS.getUnusedProductOptionGroups,
        ),
      });

      expect(readSelectRows(response)).toEqual([{ name: 'Colour', value: 'group-colour' }]);
    });

    it('opens exactly one scope per invocation across repeated, distinct requests', async () => {
      await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', {
          existingOptionGroupIDList: 'group-colour',
        }),
      });

      expect(bed.counters.scopesOpened).toBe(2);
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionGroupsCalls).toHaveLength(1);
    });
  });

  // =========================================================================
  // CONCERN 2 - DELEGATION: what is NOT routable, and the tripwires proving it
  //
  // Every operation named below is refused at the selector, and the tripwire on the corresponding
  // service member is asserted untouched. The two halves matter together: a refusal alone would not
  // prove that some other path reached the member, and a silent tripwire alone would not prove the
  // caller was told.
  // =========================================================================

  describe('concern 2, delegation: the deliberate non-exposures', () => {
    /** Out of scope by AAP 0.9.5, though reachable from an in-scope file. */
    const outOfScopeOperations: readonly string[] = [
      'processProduct_addProductReview',
      'processProduct_addSubscriptionTerm',
      'processProduct_uploadDefaultImage',
      'loadDataFromFile',
    ];

    /** Unreachable at this tier because the composition root publishes no entity and no loader. */
    const entityArgumentOperations: readonly string[] = [
      'getFormattedOptionGroups',
      'processProduct_addOptionGroup',
      'processProduct_addOption',
      'processProduct_updateSkus',
      'processProduct_deleteDefaultImage',
      'processProduct_updateDefaultImageFileNames',
      'saveProduct',
      'saveProductType',
      'deleteProduct',
      'getOptionsForSelect',
      'saveBrand',
    ];

    /** Owned by a different capability, or by a subsystem this migration excludes outright. */
    const otherOwnersOperations: readonly string[] = [
      'getProductSkusBySelectedOptions',
      'createSkus',
      'getProductSmartList',
      'getSkuSmartList',
      'updateOrderAmountsWithPromotions',
      'updateOrderAmountsWithPriceGroups',
      'processOrder',
      'processPayment',
      'processShipping',
      'processFulfillment',
      'saveAccount',
      'saveSubscriptionUsage',
      'saveVendorOrder',
      'calculateTaxAmount',
      'generateProductFeed',
    ];

    it.each(outOfScopeOperations)('publishes no route reaching %s', async (operation) => {
      const response = await bed.invoke({ query: { operation } });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.category).toBe('invalidRequest');
      expect(bed.unpublishedTouches).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it.each(entityArgumentOperations)('publishes no route reaching %s', async (operation) => {
      const response = await bed.invoke({ query: { operation } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it.each(otherOwnersOperations)('publishes no route reaching %s', async (operation) => {
      const response = await bed.invoke({ query: { operation } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('publishes no route to the hour-long bulk import, which no route could carry', async () => {
      // `loadDataFromFile` [model/service/ProductService.cfc:L65-L68] opens by raising the CFML
      // request timeout to 3600 seconds through `cfSetting(requesttimeout="3600")` at [L66]. The
      // Lambda runtime's maximum invocation duration is 900 seconds, so an hour-long budget cannot be
      // carried onto it at all - a fact about the runtime, not a service level, not a target and not a
      // claim about how long any import takes. It is therefore not published, and NO substitute is
      // invented for it: no job queue, no state machine, no queue hop and no chunked-upload protocol,
      // because the source had none. This assertion is about ROUTABILITY only and measures nothing.
      const response = await bed.invoke({ query: { operation: 'loadDataFromFile' } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
      expect(Object.keys(ROUTE_TABLE)).not.toContain('bulkImport');
    });

    it('publishes no route to the subscription or content-access SKU-creation branches', async () => {
      // A nuance worth stating exactly: those branches are NOT separate methods. The next function
      // declared after `createSkus` [model/service/SkuService.cfc:L58] is `processImageUpload` at
      // [L210], so [L139-L202] is an INTERNAL BRANCH of `createSkus` reached on the product type. They
      // therefore cannot be "not ported" - only not EXPOSED, which is what is asserted here. The
      // creation path is reachable in the service tier through `processProduct_addOptionGroup` and
      // `processProduct_addOption`, and neither of those is published either.
      for (const operation of [
        'createSkus',
        'processProduct_addOptionGroup',
        'processProduct_addOption',
      ]) {
        const response = await bed.invoke({ query: { operation } });
        expect(response.statusCode).toBe(400);
      }

      expect(bed.unpublishedTouches).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('answers for its own capability only, across every other row of the table', async () => {
      // `org/Hibachi/**` is a boundary to extract FROM and never to port, the Taffy REST layer under
      // `frontend/api/` is out of scope, the Mura CMS bridge is not ported, and no integration adapter
      // other than Google exists. None of them has a route, so none of them is reachable: the table is
      // the whole URL surface, and this capability admits exactly one row of it.
      const foreignRoutes = Object.values(ROUTE_TABLE).filter(
        (route) => route.capability !== CATALOG_ROUTE.capability,
      );
      expect(foreignRoutes).toHaveLength(4);

      for (const route of foreignRoutes) {
        const response = await bed.invoke({
          method: route.methods,
          path: route.path,
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(404);
        expect(readFailureBody(response).error.category).toBe('routeNotFound');
      }

      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unpublishedTouches).toEqual([]);
    });
  });

  // =========================================================================
  // CONCERN 3 - API GATEWAY RESPONSE SHAPING
  // =========================================================================

  describe('concern 3, response shaping: the served envelope', () => {
    it('answers 200 with a JSON content type and a no-store cache directive', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      expect(response.statusCode).toBe(200);
      // ★ AN EXACT SET OF TWO, so an invented third fails - which is how the `nosniff` header a code
      // review withdrew stays withdrawn.
      expect(response.headers).toEqual({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
    });

    it('carries the shared envelope members, with the operation inside the payload', async () => {
      // ★★ THE SHAPE THIS ASSERTS IS THE CROSS-HANDLER ONE, NOT THIS FILE'S OWN. Finding F13 found
      // four entrypoints each publishing a differently-shaped success - two with no correlation
      // identifier at all - so `jsonSuccessResponse` now owns the outer document for all of them:
      // `requestId`, `capability`, `action`, `result`. The capability-specific selector travels
      // INSIDE `result`, which is why `operation` is asserted one level down. Both key sets are
      // pinned exactly so an added member is a failure rather than a silent widening.
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const body = readServedBody(response);

      expect(body.requestId).toBe(INVOCATION_ID);
      expect(body.capability).toBe('catalogQuery');
      // The ROUTE action, which is fixed for this entrypoint - not the operation selector, which is
      // per-request and travels inside the payload. The two are asserted separately on purpose.
      expect(body.action).toBe('queryCatalog');
      expect(Object.keys(body).sort()).toEqual(['action', 'capability', 'requestId', 'result']);

      expect(body.result.operation).toBe('findProducts');
      expect(Object.keys(body.result).sort()).toEqual(['operation', 'result']);
    });

    it('projects a product onto exactly the two columns the statement selects', async () => {
      // [model/dao/ProductDAO.cfc:L421] selects `productID, productName` from `SwProduct` and joins
      // nothing. Publishing a brand or a product-type member would tell a caller that a value was
      // selected when it was not, so the projection is closed at two.
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden')]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const record = atIndex(readProductPage(response).records, 0);

      expect(record).toEqual({ productID: FIRST_PRODUCT_ID, productName: 'Nike Air Jorden' });
      expect(Object.keys(record).sort()).toEqual(['productID', 'productName']);
    });

    it('OMITS an absent product name rather than substituting a value for it', async () => {
      // Absence survives as absence. `Product.getProductName()` answers `string | undefined` because
      // the column is nullable, and the member is omitted from the JSON document - never `null`, never
      // `''`, never `0`. That discipline is not cosmetic in this subtree: `getPriceByCurrencyCode`
      // [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, and substituting a zero for
      // that absence would silently sell products for free.
      bed.outcomes.productPage = makeProductPage([matchRow(THIRD_PRODUCT_ID)]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: '' }) });
      const record = atIndex(readProductPage(response).records, 0);

      expect(record).toEqual({ productID: THIRD_PRODUCT_ID });
      expect('productName' in record).toBe(false);
      // Asserted against the serialized RECORD rather than the whole body, deliberately: the body
      // legitimately names `productName` once more, as the keyword property the executed statement
      // matches on. Reading the wider document would have made this assertion pass for the wrong
      // reason on a page whose metadata happened to change.
      expect(JSON.stringify(record)).not.toContain('productName');
      expect(JSON.stringify(record)).not.toContain('null');
      expect(JSON.stringify(record)).not.toContain('""');
    });

    it('★★★ publishes NO monetary value and NO SKU member, and can no longer even be handed one (F38)', async () => {
      // ★★★ QUOTE-THEN-REVISE. This case used to seed the page with a FULLY HYDRATED product - priced,
      // sale-priced and carrying a priced SKU - under a note reading "The fixture is deliberately
      // fully priced and carries a SKU, so the assertion is about the projection being closed rather
      // than about the data happening to be empty." That fixture was possible because the service
      // answered entities from its search path, which is exactly what code review recorded as
      // unasked-for work: [model/dao/ProductDAO.cfc:L421] selects two columns and
      // [L429-L436] returns them. `ProductPage.records` now carries those rows, so a monetary value
      // cannot be put into the page AT ALL - the seeding this case used to perform does not compile.
      //
      // The property is therefore proven twice over now, and the stronger half is the directives:
      // seeding money is a TYPE error, so the projection is closed by construction rather than by a
      // mapping function that remembers to leave things out. The run-time assertions are kept because
      // they are what a reader checks, and the two sentinels are still asserted absent from the body.
      const priced = makeProductFixture({
        productID: FIRST_PRODUCT_ID,
        productName: 'Nike Air Jorden',
        price: Money.fromDecimalString(SENTINEL_UNIT_PRICE),
        calculatedSalePrice: Money.fromDecimalString(SENTINEL_SALE_PRICE),
        skus: [
          makeSkuFixture({
            skuID: SENTINEL_SKU_ID,
            skuCode: SENTINEL_SKU_CODE,
            price: Money.fromDecimalString(SENTINEL_UNIT_PRICE),
          }),
        ],
      });

      // @ts-expect-error - a page cannot carry an ENTITY any more; `records` is a row list (F38).
      void (() => makeProductPage([priced]));

      // @ts-expect-error - and a row cannot carry a price, a sale price or a SKU either.
      void (() => matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden', priced.getPrice()));

      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden')]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const record = atIndex(readProductPage(response).records, 0);

      expect(Object.keys(record).sort()).toEqual(['productID', 'productName']);
      expect(response.body).not.toContain(SENTINEL_UNIT_PRICE);
      expect(response.body).not.toContain(SENTINEL_SALE_PRICE);
      expect(response.body).not.toContain(SENTINEL_SKU_ID);
      expect(response.body).not.toContain(SENTINEL_SKU_CODE);
    });

    it('serializes no entity, so no collaborator can be walked into the document', async () => {
      // The ported entities are classes whose fields are TypeScript-private only - enumerable at run
      // time - and they hold injected collaborators, so handing one to `JSON.stringify` would walk
      // from a product into a repository. Every response is an EXPLICIT projection, and this asserts
      // the observable consequence: none of the entity's own field names appears in the document.
      //
      // ★ IT IS NOW TRUE FOR A SECOND, INDEPENDENT REASON (F38), and the case is kept for the first.
      // The search path answers rows rather than entities, so on THIS route there is no entity in the
      // service's result to serialize even by accident. The projection discipline is still what the
      // case pins, because the other arms of this capability do return entities.
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden')]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      for (const internal of [
        'settingsProvider',
        'skuRepository',
        'optionRepository',
        'productRepository',
        'salePriceResolver',
        'urlTitle',
        'productCode',
        'calculatedTitle',
      ]) {
        expect(response.body).not.toContain(internal);
      }
    });

    it('preserves repository order and never reorders, filters or de-duplicates records', async () => {
      bed.outcomes.productPage = makeProductPage([
        matchRow(SECOND_PRODUCT_ID, 'Zulu Trainer'),
        matchRow(FIRST_PRODUCT_ID, 'Alpha Trainer'),
        matchRow(SECOND_PRODUCT_ID, 'Zulu Trainer'),
      ]);

      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'trainer' }),
      });

      expect(readProductPage(response).records.map((record) => record.productID)).toEqual([
        SECOND_PRODUCT_ID,
        FIRST_PRODUCT_ID,
        SECOND_PRODUCT_ID,
      ]);
    });

    it('OMITS the paging window when the service returned the whole result set', async () => {
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID)], { recordsCount: 7 });

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const page = readProductPage(response);

      expect('pageRecordsShow' in page).toBe(false);
      expect(page.recordsCount).toBe(7);
      expect(page.pageRecordsStart).toBe(0);
    });

    it('publishes the paging window the service actually applied when there was one', async () => {
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID)], {
        recordsCount: 42,
        pageRecordsStart: 20,
        pageRecordsShow: 1,
      });

      const response = await bed.invoke({
        query: queryFor('findProducts', {
          keyword: 'jorden',
          pageRecordsStart: '20',
          pageRecordsShow: '1',
        }),
      });
      const page = readProductPage(response);

      expect(page.pageRecordsShow).toBe(1);
      expect(page.pageRecordsStart).toBe(20);
      expect(page.recordsCount).toBe(42);
    });

    it('carries the executed statement\u2019s query contract, not the smart list\u2019s configuration', async () => {
      // AAP 0.6.2 again, on the way out this time: the executed statement joins NOTHING and matches
      // ONE property, so `joins` is empty and `keywordProperties` has a single entry. An empty join
      // list is a fact worth publishing - it is what tells a caller that a product with no brand, no
      // product type and no default SKU is still returned.
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const page = readProductPage(response);

      expect(page.entityName).toBe('SlatwallProduct');
      expect(page.joins).toEqual([]);
      expect(page.keywordProperties).toEqual([{ propertyIdentifier: 'productName', weight: 1 }]);
    });

    it('publishes an empty match as an empty record list, inventing no default', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'nothing' }),
      });
      const page = readProductPage(response);

      expect(page.records).toEqual([]);
      expect(page.recordsCount).toBe(0);
    });

    it('publishes an empty option result as an empty array', async () => {
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });

      expect(readSelectRows(response)).toEqual([]);
    });

    it('falls back to the gateway identifier when the invocation identifier is blank', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'x' }) }, '');

      expect(readServedBody(response).requestId).toBe(GATEWAY_REQUEST_ID);
    });

    it('falls back to a fixed placeholder when neither identifier carries a value', async () => {
      const response = await bed.invoke(
        { query: queryFor('findProducts', { keyword: 'x' }), gatewayRequestId: '   ' },
        '   ',
      );

      // An unjoinable log line is worse than an obviously synthetic identifier, which is why the
      // placeholder exists and why it is never an empty string.
      expect(readServedBody(response).requestId).toBe(UNATTRIBUTED_REQUEST_ID);
    });

    it('emits a body that is valid JSON on every published operation', async () => {
      for (const operation of PUBLISHED_OPERATIONS) {
        const response = await bed.invoke({
          query: queryFor(operation, VALID_PARAMETERS[operation]),
        });

        expect(response.statusCode).toBe(200);
        // A block body rather than a concise one, so the parsed value is discarded rather than
        // returned: returning it would hand an `any` back out of the assertion callback.
        expect(() => {
          JSON.parse(response.body);
        }).not.toThrow();
      }
    });
  });

  // =========================================================================
  // CONCERN 4 - DOMAIN AND ERROR MAPPING
  // =========================================================================

  describe('concern 4, error mapping: what reaches a caller and what reaches the log', () => {
    it('maps an unrecognized service failure to a server-shaped generic response', async () => {
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsShow', 9);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const failure = readFailureBody(response).error;

      expect(response.statusCode).toBe(500);
      expect(failure.category).toBe('unrecognized');
      expect(failure.message).toBe('The request could not be completed.');
      expect(failure.requestId).toBe(INVOCATION_ID);
      // No stack, no cause, no error class and no member of the failure's own state: the envelope
      // carries exactly three members, and `fields` is omitted rather than present and empty.
      expect(Object.keys(failure).sort()).toEqual(['category', 'message', 'requestId']);
      expect(response.body).not.toContain('Paging criterion');
      expect(response.body).not.toContain('ProductPagingCriteriaError');
    });

    it('routes the classification of that failure to the log instead', async () => {
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsStart', 3);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const emitted = decodedLines(bed);
      const mapped = emitted.filter((line) => line.level === 'error');
      const line = atIndex(mapped, 0);

      // THE SPLIT IS THE POINT: the caller receives a fixed sentence and a correlation identifier,
      // while the operator receives the classification under the SAME identifier. The class name
      // reaches the line and not the body, and the correlation identifier is what joins the two.
      expect(line.context['thrownShape']).toBe('ProductPagingCriteriaError');
      expect(line.context['category']).toBe('unrecognized');
      expect(line.context['statusCode']).toBe(500);
      expect(line.context['requestId']).toBe(INVOCATION_ID);
      expect(response.body).not.toContain('ProductPagingCriteriaError');
      expect(response.body).not.toContain(CATALOG_ROUTE.path);

      // ★★ THE ROUTE NOW REACHES THIS LINE, AND THE INVERSION IS THE FIX. This assertion used to read
      // `toBe(false)` under a comment recording it as a judgment call - the shipped handler held the
      // routed diagnostic in a block its single `catch` funnel sat outside, so every mapped failure
      // was logged through the UNROUTED context and an operator investigating a 500 could not tell
      // WHICH endpoint had failed without correlating by hand. Observability review (finding F8)
      // named that as the defect rather than as intended behaviour, and the handler now carries ONE
      // mapping context that GAINS the route once it is resolved and is the same object the `catch`
      // reads. The label is the shared `METHOD /path` form, so it is comparable across all five
      // entrypoints, and it still reaches the LOG only - the body assertion above is unchanged.
      expect(line.context['route']).toBe(`${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`);
    });

    it('labels the route from the TABLE, never from the method the caller sent', async () => {
      // The router matches the method with `listFindNoCase`, so a lower-case `get` is admitted. The
      // logged label must still be the table's own declaration: it is one of a closed set of five, so
      // an operator can group by it, and a caller cannot steer what appears on the line.
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsStart', 3);

      const response = await bed.invoke({
        method: CATALOG_ROUTE.methods.toLowerCase(),
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });
      const line = atIndex(
        decodedLines(bed).filter((emitted) => emitted.level === 'error'),
        0,
      );

      expect(response.statusCode).toBe(500);
      expect(line.context['route']).toBe(`${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`);
      expect(line.context['route']).not.toContain(CATALOG_ROUTE.methods.toLowerCase());
    });

    it('reports the requested route rather than a canonical row for a pre-resolution miss', async () => {
      const response = await bed.invoke({ method: 'DELETE' });
      const line = atIndex(
        decodedLines(bed).filter((entry) => entry.level === 'warn'),
        0,
      );

      expect(response.statusCode).toBe(404);
      expect(line.context['requestId']).toBe(INVOCATION_ID);
      expect(String(line.context['route'])).toContain('DELETE');
      expect(String(line.context['route'])).not.toBe(
        `${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`,
      );
    });

    it('lets NEITHER a statement nor a bound value out, in the body or on the log', async () => {
      // This split exists because a driver failure's text can embed the statement it was executing
      // together with the values bound into it. The mapper publishes a classification rather than the
      // failure, so the statement reaches neither destination - and the machine code, which carries no
      // narrative at all, reaches the log alone.
      bed.outcomes.unusedOptionsRejectsWith = driverShapedFailure();

      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', VALID_PARAMETERS.getUnusedProductOptions),
      });
      const line = atIndex(
        decodedLines(bed).filter((entry) => entry.level === 'error'),
        0,
      );

      expect(response.statusCode).toBe(500);
      expect(readFailureBody(response).error.message).toBe('The request could not be completed.');
      for (const leak of ['SwProduct', 'sentinel-bound-value', 'select productID']) {
        expect(response.body).not.toContain(leak);
        expect(line.raw).not.toContain(leak);
      }
      expect(line.context['errorCode']).toBe('ER_BAD_FIELD_ERROR');
      expect(line.context['thrownShape']).toBe('DriverError');
    });

    it('reproduces the framework dead-call-target contract byte for byte', async () => {
      // This is the ONE case where a failure's own message is published, and it is safe because the
      // recognizing pattern enforces both of its slots as identifiers. Withholding it would lose an
      // observable behavioural contract: the framework's terminal `onMissingMethod` throw is the same
      // sentence at [org/Hibachi/HibachiEntity.cfc:L565] and [org/Hibachi/HibachiService.cfc:L280],
      // and the method name below is the legacy typo at [model/entity/Product.cfc:L614] so the fixture
      // is a real call target rather than an invented one. It must NOT be conflated with the different,
      // grammatically correct variant at [org/Hibachi/HibachiObject.cfc:L126].
      const contract =
        'You have called a method getSalePricExpirationDateTime() which does not exists in the ' +
        'Product entity.';
      bed.outcomes.findProductsRejectsWith = new Error(contract);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const failure = readFailureBody(response).error;

      // LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565]: "does not exists" is ungrammatical.
      // Preserved deliberately; do not fix without a product decision.
      expect(failure.message).toBe(contract);
      expect(failure.message).toContain('does not exists');
      expect(failure.category).toBe('missingMethod');
      // Server-shaped, because a call target that does not exist is this service's defect and not the
      // caller's mistake.
      expect(response.statusCode).toBe(500);
    });

    it('maps a thrown value that is not an Error INSTANCE at all', async () => {
      // A plain object carrying `name` and `message`: it satisfies the `Error` interface structurally
      // and fails `instanceof Error` at run time, which is precisely the shape the shipped mapper
      // singles out - a structure the logger's key-based policy would otherwise traverse and emit
      // verbatim. Classifying at the call site is what closes that case, and this asserts it does.
      bed.outcomes.findProductsRejectsWith = {
        name: 'PlainObjectFailure',
        message: 'select productID from SwProduct where productName like\u0020\u0027leaky\u0027',
      };

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const line = atIndex(
        decodedLines(bed).filter((entry) => entry.level === 'error'),
        0,
      );

      expect(response.statusCode).toBe(500);
      expect(readFailureBody(response).error.message).toBe('The request could not be completed.');
      expect(response.body).not.toContain('SwProduct');
      expect(response.body).not.toContain('PlainObjectFailure');
      expect(line.raw).not.toContain('SwProduct');
      // `typeof`, not the object's own `name`: the shape description is derived rather than read off a
      // value the thrower controls, so a caller-authored `name` cannot reach a log line through it.
      expect(line.context['thrownShape']).toBe('object');
    });

    it('always answers with a response, never rethrowing out of the invocation', async () => {
      bed.outcomes.findProductsRejectsWith = driverShapedFailure();

      // A Lambda invocation that threw would surface as an unhandled failure with no envelope at all,
      // so the funnel returning a response is itself the assertion.
      await expect(
        bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) }),
      ).resolves.toMatchObject({ statusCode: 500 });
    });

    it('publishes the closed status set this authenticated route can reach', async () => {
      const served = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const unmatched = await bed.invoke({ path: '/nothing/here' });
      const unusable = await bed.invoke({ query: {} });
      const unidentified = await bed.invoke({
        authorizer: null,
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      bed.outcomes.findProductsRejectsWith = driverShapedFailure();
      const failed = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      // Authentication adds the one 401 arm. There is no administrative operation, conflict,
      // semantic-validation tier or request quota, and none of their accompanying headers.
      expect([
        served.statusCode,
        unmatched.statusCode,
        unusable.statusCode,
        unidentified.statusCode,
        failed.statusCode,
      ]).toEqual([200, 404, 400, 401, 500]);
      for (const response of [served, unmatched, unusable, unidentified, failed]) {
        expect(Object.keys(response.headers ?? {}).sort()).toEqual([
          'cache-control',
          'content-type',
        ]);
      }
    });

    it('emits one served line carrying the correlation identifier, route and record count', async () => {
      bed.outcomes.productPage = makeProductPage([
        matchRow(FIRST_PRODUCT_ID),
        matchRow(SECOND_PRODUCT_ID),
      ]);

      await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const emitted = decodedLines(bed);
      const line = atIndex(emitted, 0);

      expect(emitted).toHaveLength(1);
      expect(line.level).toBe('info');
      expect(line.message).toBe('catalog query served: findProducts');
      expect(line.context['requestId']).toBe(INVOCATION_ID);
      expect(line.context['resultCount']).toBe(2);
      // No duration, no rate and no size is measured or reported on this line, and nothing here asks
      // for one: the three keys above are the whole of its structured context.
      expect(Object.keys(line.context).sort()).toEqual(['requestId', 'resultCount', 'route']);
    });

    it('reports the CANONICAL matched route on the log line, not the path as received', async () => {
      await bed.invoke({
        path: '//CATALOG/products/',
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(atIndex(decodedLines(bed), 0).context['route']).toBe(
        `${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`,
      );
    });

    it('counts the rows it served when the payload is a select-row array', async () => {
      bed.outcomes.unusedOptionGroups = [
        selectRow('Colour', 'group-colour'),
        selectRow('Size', 'group-size'),
        selectRow('Fit', 'group-fit'),
      ];

      await bed.invoke({
        query: queryFor(
          'getUnusedProductOptionGroups',
          VALID_PARAMETERS.getUnusedProductOptionGroups,
        ),
      });

      expect(atIndex(decodedLines(bed), 0).context['resultCount']).toBe(3);
    });

    it('emits a warning, not a served line, for input it refuses before the services', async () => {
      await bed.invoke({ query: { operation: 'notAnOperation' } });
      const line = atIndex(decodedLines(bed), 0);

      expect(line.level).toBe('warn');
      expect(line.context['invalidRequestReason']).toBe('unusableRequestInput');
      // ★★ A COUNT RATHER THAN THE PATHS, AND THIS ASSERTION WAS REVISED TO REQUIRE IT. The shared
      // refusal builder used to copy every published field path onto the log stream under `fieldPaths`,
      // and a security review found (MAJOR, CWE-209/CWE-532) that one producer of those paths assembled
      // them out of the CALLER's own key names. The paths are still published to the caller in the
      // response body - which the refusal cases above assert - while the line carries only a closed
      // reason and a number. `operation` is a member name this handler wrote, so nothing was lost HERE;
      // the change is that no caller can put its own text on the stream through this member.
      expect(line.context['fieldIssueCount']).toBe(1);
      expect(line.context['fieldPaths']).toBeUndefined();
    });
  });

  // =========================================================================
  // CONCERN 2 - DELEGATION: the per-invocation bound and duplicate-request replay
  //
  // Every operation this capability publishes is a READ. The assertions below are about the bound on
  // how many operations one invocation may name, and about the container-local replay cache that
  // answers a repeated key from the first attempt. None of them is a capacity, rate, duration or
  // availability claim, and none of them measures anything.
  // =========================================================================

  describe('concern 2, delegation: the invocation bound and duplicate-request replay', () => {
    /** A valid findProducts request, used wherever the request itself is not what varies. */
    const validRequest: EventOverrides = { query: queryFor('findProducts', { keyword: 'jorden' }) };

    /**
     * Build a valid request carrying an `idempotency-key` header.
     *
     * ★ THE HEADER IS INERT NOW, and these cases exist to prove it. Finding F5 withdrew the ledger
     * that read it; the helper is kept so the proofs are written against the same request shape the
     * removed mechanism consumed.
     */
    function keyedRequest(key: string, headerName = 'idempotency-key'): EventOverrides {
      return {
        query: queryFor('findProducts', { keyword: 'jorden' }),
        headers: { [headerName]: key },
      };
    }

    it('bounds one invocation at ONE operation and refuses the whole request rather than truncating', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
        repeatedQuery: { operation: ['findProducts', 'getUnusedProductOptionGroups'] },
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe('operation');
      expect(issue.message).toContain('at most 1 time per request');
      expect(issue.message).toContain('never truncated');
      // NEITHER operation ran. Truncating to the first would have executed one of the two operations
      // the caller asked for, which is the outcome the bound exists to prevent.
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('bounds the count and not the distinctness, so a repeated selector is refused too', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
        repeatedQuery: { operation: ['findProducts', 'findProducts'] },
      });

      expect(response.statusCode).toBe(400);
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('exposes no parameter by which a caller could raise a bound the deployment owns', async () => {
      // The two service-tier bounds live on `ProductService`'s and `SkuService`'s constructors, both
      // supplied by the composition root. Neither is reachable from a request: the criteria shape is
      // closed, so a parameter named after either is refused rather than forwarded.
      for (const knob of [
        'maximumSkuUpdateBatchSize',
        'maximumSkuCreationBatchSize',
        'batchSize',
        'limit',
      ]) {
        const response = await bed.invoke({
          query: queryFor('findProducts', { keyword: 'jorden', [knob]: '1000000' }),
        });

        expect(response.statusCode).toBe(400);
        expect(atIndex(readFieldIssues(response), 0).path).toBe('queryStringParameters');
        expect(bed.findProductsCalls).toEqual([]);
      }
    });

    it('maps a service-tier bound refusal rather than swallowing it', async () => {
      // `findProducts` independently refuses a supplied paging bound that is not a non-negative safe
      // integer, and that refusal is the service's to make. What this tier owes is that the refusal
      // becomes a response and a log line instead of disappearing.
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsShow', 12);

      const response = await bed.invoke(validRequest);

      expect(response.statusCode).toBe(500);
      expect(decodedLines(bed).filter((line) => line.level === 'error')).toHaveLength(1);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★★ HONOURS NO IDEMPOTENCY KEY, because this read-only route no longer carries a ledger', async () => {
      // ★★★ SECURITY / API FINDING F5 (CWE-400, cache confusion). THIRTEEN CASES USED TO SIT HERE,
      // pinning a per-container ledger: replay under one key, in-flight sharing, key trimming,
      // case-insensitive header matching, oldest-first eviction at 256 entries, and a 256-character
      // key bound. Every one of them described a mechanism that has been REMOVED, and their removal
      // is the fix rather than a loss of coverage.
      //
      // WHAT WAS WRONG WITH IT. The ledger was keyed on the RAW CALLER KEY and nothing else - no
      // operation, no parameters, no caller identity, no request digest - so a caller reusing one key
      // for a DIFFERENT action received the FIRST action's body, complete with the first request's
      // correlation identifier. The 256-entry bound was a COUNT bound that retained 256 COMPLETE
      // response bodies.
      //
      // WHY REMOVAL RATHER THAN REPAIR. The route is `GET /catalog/products` and all three published
      // operations are READS, so re-running one cannot double-write anything: the endpoint is
      // idempotent by construction and re-executing a retry is strictly more correct than replaying a
      // stale body. AAP 0.6.5's idempotency obligation is stated for BULK MUTATION paths and this
      // capability publishes none. The alternative review offered - a durable record keyed by caller
      // plus canonical request digest - means new infrastructure this migration excludes outright
      // (AAP 0.2.2), for a read path that gains nothing from it.
      //
      // The two cases below are what replaces thirteen: the key is inert, and a retry re-executes.
      const first = await bed.invoke(keyedRequest('idem-0001'));
      const second = await bed.invoke(keyedRequest('idem-0001'), 'a-different-invocation');

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      // TWO executions and TWO scopes: nothing is recorded and nothing is replayed.
      expect(bed.findProductsCalls).toHaveLength(2);
      expect(bed.counters.scopesOpened).toBe(2);
      expect(second).not.toBe(first);
    });

    it("★★ answers every response with THIS invocation's correlation identifier, never a recorded one", async () => {
      // The sharpest consequence of the old ledger: a replayed response carried the FIRST request's
      // correlation identifier, so an operator joining a caller's response to the log stream landed on
      // a different invocation. Each response now carries its own.
      const first = await bed.invoke(keyedRequest('idem-0002'));
      const second = await bed.invoke(keyedRequest('idem-0002'), 'a-different-invocation');

      expect(readServedBody(first).requestId).toBe(INVOCATION_ID);
      expect(readServedBody(second).requestId).toBe('a-different-invocation');
    });

    it("★★★ CANNOT REPLAY ONE OPERATION'S BODY FOR ANOTHER, which was the defect itself", async () => {
      // The wrong-operation replay, reproduced as a positive assertion. Under the old ledger the
      // second call - a DIFFERENT operation under the SAME key - was answered with the first
      // operation's body. Each operation now answers for itself.
      const products = await bed.invoke(keyedRequest('idem-0003'));
      const optionGroups = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', { existingOptionGroupIDList: '' }),
        headers: { 'idempotency-key': 'idem-0003' },
      });

      expect(readServedBody(products).result.operation).toBe('findProducts');
      expect(readServedBody(optionGroups).result.operation).toBe('getUnusedProductOptionGroups');
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionGroupsCalls).toHaveLength(1);
    });

    it('★★ retains NO response body across invocations, so a warm container holds no caller data', async () => {
      // The count bound retained 256 complete bodies; nothing is retained now. A distinct key per
      // call proves the point without depending on the removed eviction order.
      for (let index = 0; index < 8; index += 1) {
        const response = await bed.invoke(keyedRequest(`idem-retain-${String(index)}`));
        expect(response.statusCode).toBe(200);
      }

      // Every one executed: there is no record to answer from.
      expect(bed.findProductsCalls).toHaveLength(8);
      expect(bed.counters.scopesOpened).toBe(8);
    });

    it('★★ imposes NO length bound on the inert key, because nothing keys anything on it', async () => {
      // A 257-character key used to be a 400 naming that header path. The header is no longer
      // read at all, so it cannot make a valid request invalid - which is the right outcome for a
      // field this route does not consume.
      const response = await bed.invoke(keyedRequest('k'.repeat(1024)));

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★ SHARES NO IN-FLIGHT CALL between two concurrent requests carrying one key', async () => {
      // The last of the removed mechanisms, and the one that needed a held call to prove either way:
      // the old ledger recorded the PROMISE, so a second request arriving under the same key while the
      // first was still running was handed the first's eventual body. Two callers therefore shared one
      // execution AND one correlation identifier.
      //
      // Held open explicitly rather than raced on a timer: the gate keeps both calls inside
      // `ProductService.findProducts` until the assertion below has observed BOTH arrivals, so this
      // proves independence without depending on scheduling.
      const gate = makeGate();
      bed.outcomes.gate = gate.promise;

      const first = bed.invoke(keyedRequest('idem-inflight'));
      const second = bed.invoke(keyedRequest('idem-inflight'), 'a-second-invocation');

      // Both are inside the service before either has returned: no sharing, no coalescing.
      await vi.waitFor(() => {
        expect(bed.findProductsCalls).toHaveLength(2);
      });

      gate.open();
      const [firstResponse, secondResponse] = await Promise.all([first, second]);

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      expect(bed.counters.scopesOpened).toBe(2);
      // Each answered under its OWN identifier, which a shared in-flight promise could not have done.
      expect(readServedBody(firstResponse).requestId).toBe(INVOCATION_ID);
      expect(readServedBody(secondResponse).requestId).toBe('a-second-invocation');
    });

    it('reaches nothing at all when it refuses', async () => {
      await bed.invoke({ query: {} });
      await bed.invoke({ query: { operation: 'processProduct_updateSkus' } });
      await bed.invoke({ path: SKU_RESOLUTION_ROUTE.path });
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', unknownKnob: '1' }),
      });

      // Every refusal above is decided BEFORE anything is constructed: no composition root resolved,
      // no request scope opened, no service member reached.
      expect(bed.counters.rootsResolved).toBe(0);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('introduces no thread, worker or timer of its own', async () => {
      // The `cfthread`-to-`worker_threads` translation rule is recorded in the plan and is
      // UNEXERCISED: a sweep of the in-scope slice finds zero `cfthread` usages, so there is nothing
      // to translate. One invocation therefore performs exactly one unit of work, sequentially, and
      // that is observable as one scope and one service call.
      await bed.invoke(validRequest);

      expect(bed.counters.scopesOpened).toBe(1);
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionsCalls).toEqual([]);
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
    });
  });
});
