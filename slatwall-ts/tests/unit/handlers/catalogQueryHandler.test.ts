// The catalog-query Lambda entrypoint, under test.
//
// NET-NEW COVERAGE, never presented as parity: no legacy test file reaches the handler tier.
//
// A handler is a primary adapter, so every `describe` below serves exactly one of four concerns:
// request parsing and validation, delegation to the composed services, API Gateway response
// shaping.
//
// A handler is a PRIMARY ADAPTER and carries no business logic, so every `describe` below serves
// exactly one of four concerns: request parsing and validation, delegation to the composed
// services.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { Money } from '../../../src/domain/valueObjects/money.js';
// The real composition root, imported because a double cannot be one without a cast.
//
// NO `double as unknown as CompositionRoot` CROSSING. Such a cast defeats contract-drift detection
// for every unimplemented member and leaves an unintended read observing `undefined` rather than
// failing loudly. The pressure for one is real: `RequestScope` publishes `productService`,
// `optionService`, `brandService`, `skuService` and `roundingRuleService` as the CLASS types, every
// one of those classes holds `private readonly` collaborators, and a TypeScript type with private
// members can only be satisfied by an instance of the declaring class. The seam below answers that
// without a cast.
//
// The way out is to stop hand-writing a root at all: `bootstrapCompositionRoot({ executor, environment })`
// assembles the REAL one over an injected statement executor and an explicit environment source - no
// pool, no socket, no `process.env` - which is the construction `tests/unit/handlers/bootstrap.test.ts`
// is built on. The scope it hands back IS a `RequestScope`, so nothing needs asserting, and the
// programmable answers below are installed on the class PROTOTYPES the real instances inherit from,
// each through one typed `vi.spyOn`. The `Pick<>` service surfaces are unchanged and still fully typed,
// so a signature change in any of the three services still breaks this file at compile time - and now
// the OTHER members of `RequestScope` are checked too rather than suppressed.
// The two stub-port refusal classes join the composition-root factory: the F-04 arm narrows them with
// `instanceof`, so a case has to be able to construct the real thing rather than a look-alike.
import {
  ImageStoreNotConfiguredError,
  SubscriptionTermsNotConfiguredError,
  bootstrapCompositionRoot,
  resetCompositionRoot,
} from '../../../src/handlers/bootstrap.js';
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
import {
  CATALOG_OPERATION_TRANSPORT,
  createCatalogQueryHandler,
  handler,
} from '../../../src/handlers/catalogQueryHandler.js';
import type { ErrorResponseBody, SuccessResponseBody } from '../../../src/handlers/errorMapper.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import type { LogSink } from '../../../src/lib/logger.js';
import { logger } from '../../../src/lib/logger.js';
// VALUE imports, not type-only: the programmable answers are installed on these classes'
// prototypes, which is what the real request scope's real instances inherit from.
import { BrandService } from '../../../src/services/brandService.js';
import { OptionService } from '../../../src/services/optionService.js';
import type {
  FormattedOptionGroup,
  ProductPage,
  ProductQueryCriteria,
} from '../../../src/services/productService.js';
import {
  MissingAssociationError,
  ProductPagingCriteriaError,
  ProductService,
} from '../../../src/services/productService.js';
import type { SelectOption } from '../../../src/domain/ports/optionRepository.js';
// Seven read-only entity loads on `RequestScope.entityLoaders` FORWARD a repository read verbatim,
// and the published loaders object is frozen.
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';
// The four ENTITY TYPES are TYPE-ONLY, and nothing in this suite constructs one: the product comes
// from the fixture factory, the product type off the product's own graph.
import type { Brand } from '../../../src/domain/entities/brand.js';
import type { Option } from '../../../src/domain/entities/option.js';
import type { Product } from '../../../src/domain/entities/product.js';
import type { ProductType } from '../../../src/domain/entities/productType.js';
// The subject's own list primitive, so a declared method list and an option-identifier list are
// parsed here exactly as the subject parses them.
import { listToArray } from '../../../src/lib/cfml/list.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// The route this capability owns, read from the shared table rather than restated.

/**
 * The catalog-query row of the shipped route table.
 */
const CATALOG_ROUTE = ROUTE_TABLE.catalogQuery;

/**
 * Another capability's route, used to prove this bundle does not answer for its siblings.
 */
const SKU_RESOLUTION_ROUTE = ROUTE_TABLE.skuResolution;

/**
 * A third, whose method differs, used to prove the method is part of the match.
 */
const PROMOTION_APPLICATION_ROUTE = ROUTE_TABLE.promotionApplication;

/**
 * The FIRST method the catalog row declares, as a request would carry it.
 *
 * `CATALOG_ROUTE.methods` is a comma list and is not a method.
 */
function firstDeclaredCatalogMethod(): string {
  const declared = listToArray(CATALOG_ROUTE.methods)[0];

  if (declared === undefined) {
    throw new Error('the catalog route declares no method at all');
  }

  return declared;
}

/**
 * The method a given catalog operation is served on.
 *
 * READ from the row's declared list, never from a literal: the reads take the first declared
 * method and the mutations take the second.
 */
function methodForOperation(operation: CatalogQueryOperation): string {
  const declared = listToArray(CATALOG_ROUTE.methods);
  const index = MUTATION_OPERATIONS.includes(operation) ? 1 : 0;
  const method = declared[index];

  if (method === undefined) {
    throw new Error(
      `the catalog route declares ${String(declared.length)} methods; ${operation} needs the ` +
        `one at index ${String(index)}`,
    );
  }

  return method;
}

// Every value below is invented, obviously synthetic, and carries no credential of any kind, no
// host and no address.

/**
 * A saved product's primary key. 32 hexadecimal characters, as the legacy helper's fixture is.
 */
const FIRST_PRODUCT_ID = 'aaaa1111222233334444555566667777';

/**
 * A second, so ordering assertions can tell two records apart.
 */
const SECOND_PRODUCT_ID = 'bbbb9999888877776666555544443333';

/**
 * A third, for the unnamed-product case.
 */
const THIRD_PRODUCT_ID = 'cccc1234123412341234123412341234';

/**
 * A SKU primary key, used to prove no SKU member reaches this capability's surface.
 */
const SENTINEL_SKU_ID = 'dddd5555666677778888999900001111';

/**
 * A SKU code, in the shape [meta/tests/unit/Helper.cfc:L56] uses.
 */
const SENTINEL_SKU_CODE = 'TESTPRODUCTXXX-1';

/**
 * The opaque account identifier the default authorizer context establishes.
 */
const CALLER_ACCOUNT_ID = 'eeee1111222233334444555566667777';

/**
 * A saved brand's primary key, in the same 32-hexadecimal shape.
 */
const SENTINEL_BRAND_ID = 'ffff1111222233334444555566667777';

/**
 * The brand name the synthetic `SwBrand` row carries.
 */
const SENTINEL_BRAND_NAME = 'Test Brand';

/**
 * The brand slug the synthetic `SwBrand` row carries.
 */
const SENTINEL_BRAND_URL_TITLE = 'test-brand';

/**
 * A saved option's primary key.
 */
const FIRST_OPTION_ID = '1111aaaa2222bbbb3333cccc4444dddd';

/**
 * A second option, so a two-element list can assert the caller's own order is preserved.
 */
const SECOND_OPTION_ID = '5555eeee6666ffff77778888aaaa9999';

/**
 * The option group both synthetic options belong to.
 */
const SENTINEL_OPTION_GROUP_ID = '9999ffff8888eeee7777dddd6666cccc';

/**
 * Identifiers that are well-formed and name no ROW, one per loadable entity.
 *
 * The miss is driven by the caller's own identifier, not by emptying a fixture.
 *
 * Each is a well-formed 32-hexadecimal key, so nothing about the refusal can be attributed to a
 * malformed value: the schema admits all four and the load simply answers nothing.
 */
const ABSENT_PRODUCT_ID = '0000dead0000dead0000dead0000dead';
const ABSENT_PRODUCT_TYPE_ID = '1111dead1111dead1111dead1111dead';
const ABSENT_BRAND_ID = '2222dead2222dead2222dead2222dead';
const ABSENT_OPTION_ID = '3333dead3333dead3333dead3333dead';

/**
 * The default authorizer context: an identified caller carrying the ADMINISTRATIVE claim.
 *
 * The default now carries the claim, so every operation case exercises a caller the route
 * legitimately serves.
 */
const ADMIN_AUTHORIZER_CONTEXT: Readonly<Record<string, unknown>> = Object.freeze({
  accountID: CALLER_ACCOUNT_ID,
  adminAccountFlag: true,
});

/**
 * A unit price, as a decimal string.
 */
const SENTINEL_UNIT_PRICE = '19.99';

/**
 * A denormalized sale price, likewise a decimal string and likewise never published.
 */
const SENTINEL_SALE_PRICE = '17.49';

/**
 * The product-type identifier the legacy helper uses verbatim [meta/tests/unit/Helper.cfc:L58].
 */
const MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * The product type the product fixture's own graph carries.
 *
 * Aliased rather than restated, so the identifier the product-type LOAD is programmed with is
 * provably the same one the fixture's entity answers.
 */
const SENTINEL_PRODUCT_TYPE_ID = MERCHANDISE_PRODUCT_TYPE_ID;

/**
 * An option-group identifier list, deliberately UNTIDY - see the forwarding assertions.
 */
const UNTIDY_OPTION_GROUP_ID_LIST = ' Zulu , alpha ,alpha,,BRAVO ';

/**
 * The Lambda invocation identifier every test asserts is echoed back.
 */
const INVOCATION_ID = 'test-invocation-0f6c1d2e';

/**
 * The API Gateway identifier, used only where the invocation identifier is blank.
 */
const GATEWAY_REQUEST_ID = 'test-gateway-4b7a9c30';

/**
 * The fixed placeholder the SHARED resolver substitutes when neither identifier carries a value.
 */
const UNATTRIBUTED_REQUEST_ID = 'unattributed';

/**
 * The request instant, as an explicit UTC ISO-8601 literal.
 */
const REQUEST_TIME = '2024-06-01T00:00:00.000Z';

/**
 * `requestTimeEpoch` for {@link REQUEST_TIME}. Parsed from the literal rather than hard-coded.
 */
const REQUEST_TIME_EPOCH = Date.parse(REQUEST_TIME);

/**
 * The value the platform-required `getRemainingTimeInMillis` member answers.
 *
 * The AWS `Context` type declares that member, so a constructed context must have one.
 */
const PLATFORM_REQUIRED_REMAINING_TIME = 30_000;

// Building an API Gateway event.

/**
 * What a test varies about one request. Everything omitted takes the admissible default.
 */
interface EventOverrides {
  /**
   * HTTP method as RECEIVED. Defaults to the method the matched route declares.
   */
  readonly method?: string | undefined;

  /**
   * Request path as RECEIVED. Defaults to the matched route's canonical path.
   */
  readonly path?: string | undefined;

  /**
   * Single-valued query parameters. `null` models an event API Gateway left unpopulated.
   */
  readonly query?: Readonly<Record<string, string>> | null | undefined;

  /**
   * Multi-valued query parameters. Defaults to `null`; supply one to repeat a parameter.
   */
  readonly repeatedQuery?: Readonly<Record<string, readonly string[]>> | null | undefined;

  /**
   * Request headers, with the casing a client chose. Defaults to none.
   */
  readonly headers?: Readonly<Record<string, string | undefined>> | undefined;

  /**
   * The API Gateway correlation identifier. Defaults to {@link GATEWAY_REQUEST_ID}.
   */
  readonly gatewayRequestId?: string | undefined;

  /**
   * The authorizer context. Omitted means an authenticated caller; `null` means no authorizer
   * context.
   */
  readonly authorizer?: Readonly<Record<string, unknown>> | null | undefined;

  /**
   * The raw request body, exactly as API Gateway would deliver it.
   */
  readonly body?: string | null | undefined;

  /**
   * Whether the platform base64-encoded the body. Defaults to `false`.
   *
   * Modelled because the subject branches on it: API Gateway sets it for a binary media type, and
   * a caller that does so is not making a different request.
   */
  readonly isBase64Encoded?: boolean | undefined;
}

/**
 * Build one proxy event.
 *
 * Constructed member by member rather than asserted into shape: every field the AWS type declares
 * is present with an admissible value.
 */
function makeEvent(overrides: EventOverrides = {}): APIGatewayProxyEvent {
  // `CATALOG_ROUTE.method` is a CFML comma list, `'GET,POST'` - the capability serves five reads on
  // `GET` and nine mutations on `POST` - so a default has to pick one of the two.
  const method = overrides.method ?? firstDeclaredCatalogMethod();
  const path = overrides.path ?? CATALOG_ROUTE.path;

  const repeated: Record<string, string[]> = {};
  if (overrides.repeatedQuery !== undefined && overrides.repeatedQuery !== null) {
    for (const [name, values] of Object.entries(overrides.repeatedQuery)) {
      repeated[name] = [...values];
    }
  }

  return {
    body: overrides.body === undefined ? null : overrides.body,
    headers: overrides.headers === undefined ? {} : { ...overrides.headers },
    multiValueHeaders: {},
    httpMethod: method,
    isBase64Encoded: overrides.isBase64Encoded ?? false,
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
        // Two required members of the platform identity type, explicitly nulled. Neither ever
        // holds a value in this suite, and nothing reads them.
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        // A required member of the platform type. The loopback address is the least meaningful
        // value that satisfies it, nothing in this suite reads it, and it is not a deployment
        // fact.
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
 * no-ops taking no parameters.
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

// Reading a response, and reading the log stream.

/**
 * Whether a parsed JSON value is an object whose members can be read by name.
 *
 * A user-defined type predicate rather than an assertion, so a malformed document narrows honestly
 * instead of being claimed to be something it is not.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a decoded document is the success envelope the subject publishes.
 *
 * A type predicate, not a type assertion, and that distinction is the whole point.
 *
 * The payload is a two-arm union now, and both arms are admitted here.
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

  if (!isRecord(payload) || typeof payload['operation'] !== 'string') {
    return false;
  }

  const carriesResult = payload['result'] !== undefined;
  const carriesUnresolved = typeof payload['unresolved'] === 'string';

  // EXACTLY one, checked as an exclusive or rather than as two independent tests, because a
  // document carrying both would mean the subject had emitted a shape its own union cannot
  // describe.
  return carriesResult !== carriesUnresolved;
}

/**
 * Whether a decoded document is the failure envelope `../../../src/handlers/errorMapper.js`
 * publishes.
 *
 * Checked the same way, one level deeper: the nested `error` member must itself carry a category,
 * a message and the correlation identifier.
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
 */
type ServedEnvelope = SuccessResponseBody<CatalogQueryResultDocument>;

/**
 * The success envelope a served response carries, verified before it is typed.
 */
function readServedBody(response: APIGatewayProxyResult): ServedEnvelope {
  const parsed: unknown = JSON.parse(response.body);
  if (!isServedBody(parsed)) {
    throw new Error(`a served response body is not the published envelope: ${response.body}`);
  }
  return parsed;
}

/**
 * The failure envelope a mapped response carries, verified before it is typed.
 */
function readFailureBody(response: APIGatewayProxyResult): ErrorResponseBody {
  const parsed: unknown = JSON.parse(response.body);
  if (!isFailureBody(parsed)) {
    throw new Error(`a failure body is not the published envelope: ${response.body}`);
  }
  return parsed;
}

/**
 * One emitted log line, decoded. `context` is absent from a line that carried none.
 */
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
 * with `typeof` rather than asserted.
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

// The result shapes a double answers with.

/**
 * One matched product, typed from the service's own published page shape.
 *
 * Derived rather than imported, exactly as the subject derives it:
 * `src/domain/entities/product.ts` is not among this suite's dependencies.
 */
type MatchedProduct = ProductPage['records'][number];

/**
 * What a test varies about one page. Everything omitted is derived from the records.
 */
interface ProductPageOverrides {
  readonly recordsCount?: number | undefined;
  readonly pageRecordsStart?: number | undefined;
  /**
   * Absent means the whole result set, on the service's contract and therefore here.
   */
  readonly pageRecordsShow?: number | undefined;
}

/**
 * One matched search row, in the shape the ported statement's own projection carries.
 */
function matchRow(id: string, value?: string): MatchedProduct {
  return value === undefined ? { id } : { id, value };
}

/**
 * Build one `ProductPage` the way the ported service publishes one.
 *
 * `entityName`, `joins` and `keywordProperties` are the EXECUTED statement's contract, not the
 * framework smart list's configuration: [model/dao/ProductDAO.cfc:L421] selects from `SwProduct`
 * alone and matches `productName like`, so the join list is empty and there is exactly one keyword
 * property.
 */
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
 * CFML parity [model/dao/OptionDAO.cfc:L88, L113]: neither function hydrates an entity.
 */
function selectRow(name: string, value: string): CatalogSelectOptionProjection {
  return { name, value };
}

// Why these are `Pick<>` over the shipped classes rather than hand-written shapes.

/**
 * Every member of `ProductService` that could conceivably be reached from a catalog request.
 *
 * One of them - `findProducts` - is published by the shipped entrypoint.
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
 * Two of the three are published; `getOptionsForSelect` [model/service/OptionService.cfc:L55] is
 * not, because it takes already-materialised `Option` entities and this tier can obtain none.
 */
type OptionServiceDouble = Pick<
  OptionService,
  'getOptionsForSelect' | 'getUnusedProductOptionGroups' | 'getUnusedProductOptions'
>;

/**
 * The whole of `BrandService`, which is one method.
 *
 * CFML parity [model/service/BrandService.cfc:L49-L89]: `saveBrand` at L67 is the only function
 * the legacy component declares - every brand read a caller might expect arrived by inheritance
 * from the framework base, which is deliberately not ported.
 */
type BrandServiceDouble = Pick<BrandService, 'saveBrand'>;

// The nine mutation payload types, derived from the service signatures.
//
// Not RESTATED, on exactly the reasoning the `Pick<>` surfaces above are chosen for.

type AddOptionGroupPayload = Parameters<ProductService['processProduct_addOptionGroup']>[1];
type AddOptionPayload = Parameters<ProductService['processProduct_addOption']>[1];
type UpdateSkusPayload = Parameters<ProductService['processProduct_updateSkus']>[1];
type DeleteDefaultImagePayload = Parameters<ProductService['processProduct_deleteDefaultImage']>[1];
type SaveProductPayload = Parameters<ProductService['saveProduct']>[1];
type SaveProductTypePayload = Parameters<ProductService['saveProductType']>[1];
type SaveBrandPayload = Parameters<BrandService['saveBrand']>[1];

/**
 * A configuration source answering the five keys that have no default, and nothing else.
 */
const CATALOG_ENVIRONMENT: EnvironmentSource = Object.freeze({
  DB_HOST: 'slatwall-database.invalid',
  DB_USER: 'unused-by-this-suite',
  DB_PASSWORD: 'unused-by-this-suite',
  DB_TLS_MODE: 'verify-identity',
  DB_DIALECT: 'mySql',
});

/**
 * A `SwBrand` row the brand loader can hydrate, or none.
 */
function brandRow(brandID: string): SqlRow {
  return {
    brandID,
    activeFlag: 1,
    publishedFlag: 1,
    urlTitle: SENTINEL_BRAND_URL_TITLE,
    brandName: SENTINEL_BRAND_NAME,
    brandWebsite: null,
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
  };
}

/**
 * One `SwOption` row joined to its `SwOptionGroup`, in the projection the option load asks for.
 *
 * The group's columns carry the `optionGroup_` alias prefix the statement aliases them with, and
 * `optionGroup_sortOrder` is a NUMBER because the group hydration reads it as a required integer.
 */
function optionRow(optionID: string): SqlRow {
  return {
    optionID,
    optionCode: `${optionID}-code`,
    optionName: `${optionID}-name`,
    optionDescription: null,
    sortOrder: 1,
    optionGroupID: SENTINEL_OPTION_GROUP_ID,
    defaultImageID: null,
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    optionGroup_optionGroupID: SENTINEL_OPTION_GROUP_ID,
    optionGroup_optionGroupName: 'Colour',
    optionGroup_optionGroupCode: 'colour',
    optionGroup_optionGroupImage: null,
    optionGroup_optionGroupDescription: null,
    optionGroup_imageGroupFlag: 0,
    optionGroup_sortOrder: 1,
    optionGroup_remoteID: null,
    optionGroup_createdDateTime: null,
    optionGroup_createdByAccountID: null,
    optionGroup_modifiedDateTime: null,
    optionGroup_modifiedByAccountID: null,
  };
}

/**
 * The statement executor the real graph is assembled over.
 *
 * It answers exactly two statements and nothing else, and the two it answers are the two entity
 * loads that have no prototype to programme.
 *
 * Recognition is by the table the statement names, not by an exact string.
 */
class CatalogExecutor implements PreparedStatementExecutor {
  /**
   * Brand identifiers this executor will answer a row for. Empty means every brand is a miss.
   */
  public readonly knownBrandIDs = new Set<string>();

  /**
   * Option identifiers this executor will answer a row for. Empty means every option is a miss.
   */
  public readonly knownOptionIDs = new Set<string>();

  /**
   * Every statement it was asked to execute, in order, for a case that wants to assert the shape.
   */
  public readonly executed: string[] = [];

  public execute(sql: string, params?: readonly unknown[]): Promise<readonly SqlRow[]> {
    this.executed.push(sql);

    const bound = params ?? [];

    if (sql.includes('FROM SwBrand')) {
      const brandID = bound[0];

      return Promise.resolve(
        typeof brandID === 'string' && this.knownBrandIDs.has(brandID) ? [brandRow(brandID)] : [],
      );
    }

    if (sql.includes('FROM SwOption swOption')) {
      const rows: SqlRow[] = [];

      for (const optionID of bound) {
        if (typeof optionID === 'string' && this.knownOptionIDs.has(optionID)) {
          rows.push(optionRow(optionID));
        }
      }

      return Promise.resolve(rows);
    }

    return Promise.resolve([]);
  }

  public executeMutation(sql: string, params?: readonly unknown[]): Promise<SqlMutationResult> {
    void params;

    throw new Error(
      `a mutation statement reached the catalog capability's executor: ${sql}. Every published ` +
        'mutation goes through the service that owns its invariants, whose prototype this suite ' +
        'programmes, so no statement of its own should arrive here.',
    );
  }

  public transaction<TValue>(
    work: (tx: PreparedStatementExecutor) => Promise<TValue>,
  ): Promise<TValue> {
    void work;

    throw new Error(
      "a transaction was opened against the catalog capability's executor; every published mutation " +
        'is answered by a programmed service prototype, which opens none',
    );
  }
}

/**
 * A composition root that DELEGATES to a real one and counts the scopes it was asked for.
 *
 * A delegating decorator in place of a cast, and the forwarding is total.
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
 * Typed `vi.spyOn` per member, so each installation is checked against the shipped signature.
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
 * The world the two repository-backed entity loads answer from.
 *
 * Each load matches on the identifier it is given rather than answering unconditionally.
 */
function installEntityLoads(world: LoadableCatalogWorld): void {
  vi.spyOn(MysqlProductRepository.prototype, 'getProductByProductID').mockImplementation(
    (productID: string): Promise<Product | undefined> => {
      world.productLoads.push(productID);

      const held = world.product;

      return Promise.resolve(
        held !== undefined && held.getProductID() === productID ? held : undefined,
      );
    },
  );

  vi.spyOn(
    MysqlProductTypeRepository.prototype,
    'getProductTypeByProductTypeID',
  ).mockImplementation((productTypeID: string): Promise<ProductType | undefined> => {
    world.productTypeLoads.push(productTypeID);

    const held = world.productType;

    return Promise.resolve(
      held !== undefined && held.getProductTypeID() === productTypeID ? held : undefined,
    );
  });
}

/**
 * What the two repository-backed loads hold, and the record of what was asked of them.
 */
interface LoadableCatalogWorld {
  /**
   * The one product that can be loaded, or none. Mutable, so a case can programme a miss.
   */
  product: Product | undefined;

  /**
   * The one product type that can be loaded, or none.
   */
  productType: ProductType | undefined;

  /**
   * Every product identifier the load was asked for, in order.
   */
  readonly productLoads: string[];

  /**
   * Every product-type identifier the load was asked for, in order.
   */
  readonly productTypeLoads: string[];
}

/**
 * Record that an unpublished member was invoked, then refuse.
 */
function refuseUnpublishedCall(touched: string[], member: string): never {
  touched.push(member);
  throw new Error(
    `${member} was invoked, and no route of the catalog-query capability publishes it. ` +
      'The shipped entrypoint documents it as a deliberate non-exposure.',
  );
}

/**
 * A promise a test opens by hand, so a call can be held in flight deterministically.
 */
interface Gate {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

/**
 * Used only where the point is that a SECOND request arriving while the first is still running
 * must not start a second execution.
 */
function makeGate(): Gate {
  let open: () => void = (): undefined => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/**
 * What each published operation answers with, and where a test programmes a failure instead.
 */
interface CatalogQueryOutcomes {
  /**
   * What `findProducts` resolves to.
   */
  productPage: ProductPage;

  /**
   * When set, `findProducts` throws this instead of resolving.
   *
   * Typed `Error` rather than `unknown` deliberately, and it costs nothing: the non-`Error` arm of
   * the mapper is still exercised.
   */
  findProductsRejectsWith: Error | undefined;

  /**
   * What `getUnusedProductOptions` resolves to.
   */
  unusedOptions: readonly CatalogSelectOptionProjection[];

  /**
   * What `getUnusedProductOptionGroups` resolves to.
   */
  unusedOptionGroups: readonly CatalogSelectOptionProjection[];

  /**
   * When set, `getUnusedProductOptions` throws this instead of resolving.
   */
  unusedOptionsRejectsWith: Error | undefined;

  /**
   * What `getFormattedOptionGroups` answers.
   */
  formattedOptionGroups: readonly FormattedOptionGroup[];

  /**
   * What `deleteProduct` answers. `false` is the ported delete-context refusal, not an error.
   */
  productDeleted: boolean;

  /**
   * When set, `processProduct_updateSkus` throws this - the SKU batch bound's shape.
   */
  updateSkusRejectsWith: Error | undefined;

  /**
   * When set, `processProduct_deleteDefaultImage` throws this.
   *
   * ADDED FOR THE F-04 ARM. `./bootstrap.js`'s `RefusingImageStore` rejects with
   * `ImageStoreNotConfiguredError`, and this operation is ROUTED - so the adapter has to narrow that
   * refusal and answer 501 rather than let it reach the generic 500 arm.
   */
  deleteDefaultImageRejectsWith: Error | undefined;

  /**
   * When set, `processProduct_addOptionGroup` throws this.
   *
   * ADDED FOR THE F-12 ARM. The service resolves the caller's `optionGroup` identifier and raises
   * `MissingAssociationError` when it names no row [model/service/ProductService.cfc:L115]. That is a
   * CLIENT-shaped failure and the adapter has to narrow it rather than let it reach the generic 500 arm,
   * so a case needs to be able to programme it.
   */
  addOptionGroupRejectsWith: Error | undefined;

  /**
   * Save-context rules to record on the entity instead of validating, as `[property, message]` pairs.
   *
   * The failure is programmed on the entity, not as a throw, because that is the ported contract -
   * the three saves return the entity with its errors and never raise for a failed rule.
   */
  saveProductRuleFailures: readonly (readonly [string, string])[];
  saveProductTypeRuleFailures: readonly (readonly [string, string])[];
  saveBrandRuleFailures: readonly (readonly [string, string])[];

  /**
   * When set, every published operation awaits it before answering.
   */
  gate: Promise<void> | undefined;
}

/**
 * The two arguments `getUnusedProductOptions` is called with, recorded verbatim.
 */
interface RecordedUnusedOptionsCall {
  readonly productID: string;
  readonly existingOptionGroupIDList: string;
}

/**
 * One process-method call: the BOUND ENTITY and the payload, both by reference.
 */
interface RecordedProductCall<TPayload> {
  readonly product: Product;
  readonly input: TPayload;
}

/**
 * One save call: the bound entity and its payload.
 *
 * Generic over both, because three different entities are saved through this capability and each
 * carries a different payload.
 */
interface RecordedSaveCall<TEntity, TPayload> {
  readonly entity: TEntity;
  readonly data: TPayload;
}

/**
 * One fully wired subject plus everything a test needs to observe about it.
 */
interface CatalogQueryTestBed {
  /**
   * Invoke the subject with a fresh event and context.
   */
  readonly invoke: (
    overrides?: EventOverrides,
    awsRequestId?: string,
  ) => Promise<APIGatewayProxyResult>;

  /**
   * The subject itself, for the few tests that drive two invocations concurrently.
   */
  readonly subject: CatalogQueryLambdaHandler;

  /**
   * Programmable answers. Mutable by design; a fresh bed is built for every test.
   */
  readonly outcomes: CatalogQueryOutcomes;

  /**
   * Every criteria object `findProducts` was handed, in call order.
   */
  readonly findProductsCalls: ProductQueryCriteria[];

  /**
   * Every argument pair `getUnusedProductOptions` was handed, in call order.
   */
  readonly unusedProductOptionsCalls: RecordedUnusedOptionsCall[];

  /**
   * Every list string `getUnusedProductOptionGroups` was handed, in call order.
   */
  readonly unusedProductOptionGroupsCalls: string[];

  /**
   * Every product `getFormattedOptionGroups` was handed, in call order.
   */
  readonly formattedOptionGroupsCalls: Product[];

  /**
   * Every option array `getOptionsForSelect` was handed, by REFERENCE and in order.
   */
  readonly optionsForSelectCalls: (readonly Option[])[];

  /**
   * The nine mutation call records, each holding the bound entity and the payload verbatim.
   */
  readonly addOptionGroupCalls: RecordedProductCall<AddOptionGroupPayload>[];
  readonly addOptionCalls: RecordedProductCall<AddOptionPayload>[];
  readonly updateSkusCalls: RecordedProductCall<UpdateSkusPayload>[];
  readonly deleteDefaultImageCalls: RecordedProductCall<DeleteDefaultImagePayload>[];
  readonly updateDefaultImageFileNamesCalls: Product[];
  readonly saveProductCalls: RecordedSaveCall<Product, SaveProductPayload>[];
  readonly saveProductTypeCalls: RecordedSaveCall<ProductType, SaveProductTypePayload>[];
  readonly saveBrandCalls: RecordedSaveCall<Brand, SaveBrandPayload>[];
  readonly deleteProductCalls: Product[];

  /**
   * The statement executor the graph was built over, so a case can programme a load or a miss.
   */
  readonly executor: CatalogExecutor;

  /**
   * The two repository-backed loads' world, so a case can programme a miss or read what was asked.
   */
  readonly world: LoadableCatalogWorld;

  /**
   * Any unpublished service member that was reached. Asserted EMPTY by every test.
   */
  readonly unpublishedTouches: string[];

  /**
   * Every line the subject emitted, raw.
   */
  readonly logLines: string[];

  /**
   * How many times the composition root was resolved and a request scope opened.
   */
  readonly counters: { rootsResolved: number; scopesOpened: number };

  /**
   * Every input used to open a request scope, in invocation order.
   */
  readonly scopeInputs: readonly (RequestScopeInput | undefined)[];
}

/**
 * Wire one subject over hand-written in-memory doubles.
 */
function makeTestBed(): CatalogQueryTestBed {
  const findProductsCalls: ProductQueryCriteria[] = [];
  const unusedProductOptionsCalls: RecordedUnusedOptionsCall[] = [];
  const unusedProductOptionGroupsCalls: string[] = [];
  const formattedOptionGroupsCalls: Product[] = [];
  const optionsForSelectCalls: (readonly Option[])[] = [];
  const addOptionGroupCalls: RecordedProductCall<AddOptionGroupPayload>[] = [];
  const addOptionCalls: RecordedProductCall<AddOptionPayload>[] = [];
  const updateSkusCalls: RecordedProductCall<UpdateSkusPayload>[] = [];
  const deleteDefaultImageCalls: RecordedProductCall<DeleteDefaultImagePayload>[] = [];
  const updateDefaultImageFileNamesCalls: Product[] = [];
  const saveProductCalls: RecordedSaveCall<Product, SaveProductPayload>[] = [];
  const saveProductTypeCalls: RecordedSaveCall<ProductType, SaveProductTypePayload>[] = [];
  const saveBrandCalls: RecordedSaveCall<Brand, SaveBrandPayload>[] = [];
  const deleteProductCalls: Product[] = [];
  const unpublishedTouches: string[] = [];
  const logLines: string[] = [];
  const counters = { rootsResolved: 0, scopesOpened: 0 };
  const scopeInputs: (RequestScopeInput | undefined)[] = [];

  // The product fixture is built once per bed and is the entity every product-bound operation
  // binds to.
  const loadableProduct = makeProductFixture({ productID: FIRST_PRODUCT_ID });
  const loadableProductType = loadableProduct.getProductType();

  const world: LoadableCatalogWorld = {
    product: loadableProduct,
    productType: loadableProductType,
    productLoads: [],
    productTypeLoads: [],
  };

  const outcomes: CatalogQueryOutcomes = {
    productPage: makeProductPage([]),
    findProductsRejectsWith: undefined,
    unusedOptions: [],
    unusedOptionGroups: [],
    unusedOptionsRejectsWith: undefined,
    formattedOptionGroups: [],
    productDeleted: true,
    updateSkusRejectsWith: undefined,
    deleteDefaultImageRejectsWith: undefined,
    addOptionGroupRejectsWith: undefined,
    saveProductRuleFailures: [],
    saveProductTypeRuleFailures: [],
    saveBrandRuleFailures: [],
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
      // The criteria object is recorded by REFERENCE deliberately: the subject builds a fresh one
      // per invocation and never retains it, so identity is exactly what a delegation assertion
      // wants.
      findProductsCalls.push(criteria);
      await passThroughGate();
      if (outcomes.findProductsRejectsWith !== undefined) {
        throw outcomes.findProductsRejectsWith;
      }
      return outcomes.productPage;
    },

    getFormattedOptionGroups: (product): FormattedOptionGroup[] => {
      formattedOptionGroupsCalls.push(product);

      return [...outcomes.formattedOptionGroups];
    },

    processProduct_addOptionGroup: async (product, input): Promise<Product> => {
      addOptionGroupCalls.push({ product, input });
      await passThroughGate();

      if (outcomes.addOptionGroupRejectsWith !== undefined) {
        throw outcomes.addOptionGroupRejectsWith;
      }

      return product;
    },

    processProduct_addOption: async (product, input): Promise<Product> => {
      addOptionCalls.push({ product, input });
      await passThroughGate();

      return product;
    },

    processProduct_updateSkus: async (product, input): Promise<Product> => {
      updateSkusCalls.push({ product, input });
      await passThroughGate();

      if (outcomes.updateSkusRejectsWith !== undefined) {
        throw outcomes.updateSkusRejectsWith;
      }

      return product;
    },

    processProduct_deleteDefaultImage: async (product, input): Promise<Product> => {
      deleteDefaultImageCalls.push({ product, input });
      await passThroughGate();

      if (outcomes.deleteDefaultImageRejectsWith !== undefined) {
        throw outcomes.deleteDefaultImageRejectsWith;
      }

      return product;
    },

    processProduct_updateDefaultImageFileNames: async (product): Promise<Product> => {
      updateDefaultImageFileNamesCalls.push(product);
      await passThroughGate();

      return product;
    },

    saveProduct: async (product, data): Promise<Product> => {
      saveProductCalls.push({ entity: product, data });
      await passThroughGate();

      // Handing back the entity even when rules failed is the ported contract: the legacy
      // `HibachiService.save` returns the same entity whether it validated or not.
      for (const [propertyIdentifier, message] of outcomes.saveProductRuleFailures) {
        product.addError(propertyIdentifier, message);
      }

      return product;
    },

    saveProductType: async (productType, data): Promise<ProductType> => {
      saveProductTypeCalls.push({ entity: productType, data });
      await passThroughGate();

      for (const [propertyIdentifier, message] of outcomes.saveProductTypeRuleFailures) {
        productType.addError(propertyIdentifier, message);
      }

      return productType;
    },

    deleteProduct: async (product): Promise<boolean> => {
      deleteProductCalls.push(product);
      await passThroughGate();

      return outcomes.productDeleted;
    },

    // Out of scope by AAP 0.9.5 though reachable from an in-scope file, or owned by another
    // capability. Each names the legacy locator its non-exposure is argued from.
    getProductSkusBySelectedOptions: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.getProductSkusBySelectedOptions [L104]',
      ),
    loadDataFromFile: () =>
      refuseUnpublishedCall(unpublishedTouches, 'ProductService.loadDataFromFile [L65]'),
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
    processProduct_uploadDefaultImage: () =>
      refuseUnpublishedCall(
        unpublishedTouches,
        'ProductService.processProduct_uploadDefaultImage [L235]',
      ),
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

    getOptionsForSelect: (options): SelectOption[] => {
      // Recorded by REFERENCE, and that is the assertion this double exists for: the handler loads
      // the caller's named options and hands the array straight through, so identity - and above
      // all ORDER.
      optionsForSelectCalls.push(options);

      return options.map((option): SelectOption => ({
        name: option.getOptionName() ?? '',
        value: option.getOptionID(),
      }));
    },
  };

  const brandService: BrandServiceDouble = {
    saveBrand: async (brand, data): Promise<Brand> => {
      saveBrandCalls.push({ entity: brand, data });
      await passThroughGate();

      for (const [propertyIdentifier, message] of outcomes.saveBrandRuleFailures) {
        brand.addError(propertyIdentifier, message);
      }

      return brand;
    },
  };

  // The programmed answers reach the REAL services through their prototypes. Installed here, once
  // per bed, so a test that never invokes the subject still gets its tripwires armed.
  installServiceAnswers(productService, optionService, brandService);

  // And the two repository-backed entity loads, on the same terms and for the same reason.
  installEntityLoads(world);

  // One REAL GRAPH per BED, built lazily on first resolution and reused, which is what the
  // production memo does per container.
  const executor = new CatalogExecutor();

  let rootPromise: Promise<CompositionRoot> | undefined;
  const openRoot = async (): Promise<CompositionRoot> => {
    const inner = await bootstrapCompositionRoot({
      executor,
      environment: CATALOG_ENVIRONMENT,
    });

    return new RecordingCompositionRoot(inner, counters, scopeInputs);
  };

  // The logger is pinned to `debug` and redirected to a recording sink.
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
    formattedOptionGroupsCalls,
    optionsForSelectCalls,
    addOptionGroupCalls,
    addOptionCalls,
    updateSkusCalls,
    deleteDefaultImageCalls,
    updateDefaultImageFileNamesCalls,
    saveProductCalls,
    saveProductTypeCalls,
    saveBrandCalls,
    deleteProductCalls,
    executor,
    world,
    unpublishedTouches,
    logLines,
    counters,
    scopeInputs,
  };
}

/**
 * The query string for one operation, with the selector in place.
 */
function queryFor(
  operation: string,
  parameters: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  const pageDefault =
    operation === 'findProducts' && parameters['pageRecordsShow'] === undefined
      ? { pageRecordsShow: '25' }
      : {};

  return { operation, ...pageDefault, ...parameters };
}

/**
 * The five operations served on the first declared method, with their criteria in the query
 * string.
 */
const READ_OPERATIONS: readonly CatalogQueryOperation[] = [
  'findProducts',
  'getFormattedOptionGroups',
  'getUnusedProductOptions',
  'getUnusedProductOptionGroups',
  'getOptionsForSelect',
];

/**
 * The nine operations served on the second declared method, with their payload in the request
 * body.
 */
const MUTATION_OPERATIONS: readonly CatalogQueryOperation[] = [
  'processProduct_addOptionGroup',
  'processProduct_addOption',
  'processProduct_updateSkus',
  'processProduct_deleteDefaultImage',
  'processProduct_updateDefaultImageFileNames',
  'saveProduct',
  'saveProductType',
  'deleteProduct',
  'saveBrand',
];

/**
 * All fourteen published operations, in the order the subject documents them.
 *
 * ASSEMBLED from the two LISTS rather than written a third time, so the split and the whole cannot
 * disagree.
 */
const PUBLISHED_OPERATIONS: readonly CatalogQueryOperation[] = [
  ...READ_OPERATIONS,
  ...MUTATION_OPERATIONS,
];

/**
 * A minimal, valid QUERY-STRING parameter set for each published operation.
 *
 * The nine mutations map to the EMPTY set, and that is asserted behaviour rather than a filler:
 * every mutation publishes no query parameter at all.
 */
const VALID_PARAMETERS: Readonly<Record<CatalogQueryOperation, Readonly<Record<string, string>>>> =
  {
    findProducts: { keyword: 'jorden', pageRecordsShow: '25' },
    getFormattedOptionGroups: { productID: FIRST_PRODUCT_ID },
    getUnusedProductOptions: {
      productID: FIRST_PRODUCT_ID,
      existingOptionGroupIDList: UNTIDY_OPTION_GROUP_ID_LIST,
    },
    getUnusedProductOptionGroups: { existingOptionGroupIDList: UNTIDY_OPTION_GROUP_ID_LIST },
    getOptionsForSelect: { optionIDs: `${FIRST_OPTION_ID},${SECOND_OPTION_ID}` },
    processProduct_addOptionGroup: {},
    processProduct_addOption: {},
    processProduct_updateSkus: {},
    processProduct_deleteDefaultImage: {},
    processProduct_updateDefaultImageFileNames: {},
    saveProduct: {},
    saveProductType: {},
    deleteProduct: {},
    saveBrand: {},
  };

/**
 * A minimal, valid JSON BODY for each published operation, or `undefined` for the five reads.
 *
 * Every mutation body names an existing row by identifier, which is the routed transport policy
 * the subject documents: row creation is not published.
 */
const VALID_BODIES: Readonly<
  Record<CatalogQueryOperation, Readonly<Record<string, unknown>> | undefined>
> = {
  findProducts: undefined,
  getFormattedOptionGroups: undefined,
  getUnusedProductOptions: undefined,
  getUnusedProductOptionGroups: undefined,
  getOptionsForSelect: undefined,
  processProduct_addOptionGroup: {
    productID: FIRST_PRODUCT_ID,
    optionGroup: SENTINEL_OPTION_GROUP_ID,
  },
  processProduct_addOption: { productID: FIRST_PRODUCT_ID, option: FIRST_OPTION_ID },
  // BOTH FLAGS, because both are REQUIRED members now and this table's job is to hold a body that
  // is genuinely valid. A runtime finding (F-03) measured what "optional" cost: three of four
  // schema-admitted payloads answered HTTP 500, because `processProduct_updateSkus` reads EACH flag
  // through `cfTruthy` at the line CFML reads it [model/service/ProductService.cfc:L222, L226] and an
  // ABSENT flag makes that read raise. `updateListPriceFlag` is set to `0`, so the list-price branch is
  // deliberately not taken and this body still exercises exactly one repricing branch.
  processProduct_updateSkus: {
    productID: FIRST_PRODUCT_ID,
    updatePriceFlag: 1,
    price: SENTINEL_UNIT_PRICE,
    updateListPriceFlag: 0,
  },
  processProduct_deleteDefaultImage: { productID: FIRST_PRODUCT_ID },
  processProduct_updateDefaultImageFileNames: { productID: FIRST_PRODUCT_ID },
  saveProduct: { productID: FIRST_PRODUCT_ID, productName: 'Renamed Product' },
  saveProductType: { productTypeID: SENTINEL_PRODUCT_TYPE_ID, productTypeName: 'Merchandise' },
  deleteProduct: { productID: FIRST_PRODUCT_ID },
  saveBrand: { brandID: SENTINEL_BRAND_ID, brandName: 'Renamed Brand' },
};

/**
 * Invoke one published operation the way a caller would have to.
 *
 * One ENTRY POINT for all FOURTEEN, so a loop over the published surface drives each on the method
 * it is served on, with its criteria in the place that operation carries them.
 *
 * The two prerequisites the mutations need are established here as well: the brand and the two
 * options are made loadable.
 */
async function invokeOperation(
  bed: CatalogQueryTestBed,
  operation: CatalogQueryOperation,
  overrides: EventOverrides = {},
): Promise<APIGatewayProxyResult> {
  bed.executor.knownBrandIDs.add(SENTINEL_BRAND_ID);
  bed.executor.knownOptionIDs.add(FIRST_OPTION_ID);
  bed.executor.knownOptionIDs.add(SECOND_OPTION_ID);

  const body = VALID_BODIES[operation];

  return await bed.invoke({
    method: methodForOperation(operation),
    query: queryFor(operation, VALID_PARAMETERS[operation]),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...overrides,
  });
}

/**
 * The `result` payload of a served document, or a failure naming what it carried instead.
 */
function readServedPayload(response: APIGatewayProxyResult): unknown {
  const document = readServedBody(response).result;

  if ('unresolved' in document) {
    throw new Error(
      `the response reported an unresolved outcome (${document.unresolved}) rather than a payload`,
    );
  }

  return document.result;
}

/**
 * The `unresolved` reason of a served document, or a failure naming what it carried instead.
 */
function readUnresolvedReason(response: APIGatewayProxyResult): string {
  const document = readServedBody(response).result;

  if (!('unresolved' in document)) {
    throw new Error('the response carried a payload rather than an unresolved outcome');
  }

  return document.unresolved;
}

// Reading one element, one page, one row set, one field report.
//
// `noUncheckedIndexedAccess` is on and a postfix `!` is not used anywhere in this file.

/**
 * The element at `index`, or a described failure.
 */
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
 * Narrowed twice now, and both narrowings are structural - no cast and no assertion.
 */
function readProductPage(response: APIGatewayProxyResult): CatalogProductPageProjection {
  const document = readServedBody(response).result;

  if ('unresolved' in document) {
    throw new Error(
      `the response reported an unresolved outcome (${document.unresolved}) rather than a page`,
    );
  }

  const payload = document.result;

  if (!('records' in payload)) {
    throw new Error('expected a product page, and the response carried another projection');
  }

  return payload;
}

/**
 * The select rows a served response carries, narrowed the same structural way.
 */
function readSelectRows(response: APIGatewayProxyResult): readonly CatalogSelectOptionProjection[] {
  const document = readServedBody(response).result;

  if ('unresolved' in document) {
    throw new Error(
      `the response reported an unresolved outcome (${document.unresolved}) rather than rows`,
    );
  }

  const payload = document.result;

  if (!Array.isArray(payload)) {
    throw new Error('expected an array of select rows, and the response carried an object');
  }

  // The element type is narrowed by the operation, not by inspection.
  for (const row of payload) {
    if (isRecord(row) && 'options' in row) {
      throw new Error(
        'expected select rows, and the response carried formatted option GROUPS; read those with ' +
          'readFormattedOptionGroups instead',
      );
    }
  }

  return payload as readonly CatalogSelectOptionProjection[];
}

/**
 * The formatted option groups a served response carries.
 */
function readFormattedOptionGroups(
  response: APIGatewayProxyResult,
): readonly FormattedOptionGroup[] {
  const document = readServedBody(response).result;

  if ('unresolved' in document) {
    throw new Error(
      `the response reported an unresolved outcome (${document.unresolved}) rather than groups`,
    );
  }

  const payload = document.result;

  if (!Array.isArray(payload)) {
    throw new Error(
      'expected an array of formatted option groups, and the response carried an object',
    );
  }

  return payload as readonly FormattedOptionGroup[];
}

/**
 * The field-level report a client-shaped failure carries, or a described failure.
 */
function readFieldIssues(
  response: APIGatewayProxyResult,
): readonly { readonly path: string; readonly message: string }[] {
  const fields = readFailureBody(response).error.fields;
  if (fields === undefined) {
    throw new Error(`expected a field-level report, and the body carried none: ${response.body}`);
  }
  return fields;
}

/**
 * Every decoded line the subject emitted.
 */
function decodedLines(bed: CatalogQueryTestBed): readonly RecordedLogLine[] {
  return bed.logLines.map(decodeLogLine);
}

/**
 * A driver-shaped failure: an `Error` whose message embeds a statement and a value bound into it.
 *
 * The FIXTURE is the WHOLE ARGUMENT for why the mapper is selective rather than a pass-through, so
 * it is built to be maximally leaky: a `SELECT`.
 */
function driverShapedFailure(): Error {
  return Object.assign(
    new Error(
      "select productID, productName from SwProduct where productName like 'sentinel-bound-value'",
    ),
    { name: 'DriverError', code: 'ER_BAD_FIELD_ERROR' },
  );
}

describe('catalogQueryHandler', () => {
  let bed: CatalogQueryTestBed;

  beforeEach(() => {
    resetCompositionRoot();
    appConfig.reset();
    bed = makeTestBed();
  });

  // A per-suite `afterEach`, kept deliberately alongside the global one.
  afterEach(() => {
    vi.restoreAllMocks();
    bed.logLines.length = 0;
    // The composition memo and `appConfig` are module state.
    resetCompositionRoot();
    appConfig.reset();
  });

  it('publishes a Lambda entry point, without any test invoking it', () => {
    // The module-level `handler` is created when the container loads the module.
    expect(typeof handler).toBe('function');
    expect(bed.subject).not.toBe(handler);
    expect(bed.counters.rootsResolved).toBe(0);
    expect(bed.counters.scopesOpened).toBe(0);
  });

  // Concern 1 - request parsing and validation: route admission.

  describe('concern 1, request parsing: admission through the shipped route table', () => {
    it('serves the canonical route this capability owns', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      expect(response.statusCode).toBe(200);
      expect(CATALOG_ROUTE.path).toBe('/catalog/products');
      // Declares a COMMA LIST: the five reads answer on the first method and the nine mutations on
      // the second.
      expect(CATALOG_ROUTE.methods).toBe('GET,POST');
      expect(CATALOG_ROUTE.action).toBe('queryCatalog');
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('matches the path case-insensitively', async () => {
      // CFML parity [Application.cfc:L130, L133]: the routing convention being replaced compared
      // subsystem names with `eq` and with `listFindNoCase`, both case-insensitive.
      const response = await bed.invoke({
        path: CATALOG_ROUTE.path.toUpperCase(),
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('matches the method case-insensitively', async () => {
      // One method is sent, not the row's whole comma list:
      // `listFindNoCase('GET,POST','GET,POST')` answers 0, so a request whose method literally
      // were the declaration would be unmatched.
      const response = await bed.invoke({
        method: firstDeclaredCatalogMethod().toLowerCase(),
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
      expect(listToArray(CATALOG_ROUTE.methods)).not.toContain('DELETE');

      const response = await bed.invoke({
        method: 'DELETE',
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
      expect(bed.counters.rootsResolved).toBe(0);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(bed.unpublishedTouches).toEqual([]);
    });
  });

  // Concern 1 - request parsing and validation: the admission gate.

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

    it('opens the request scope with the account AND the administrative claim the gate established', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.scopeInputs).toStrictEqual([
        { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
      ]);
    });

    it('reads the account claim case-insensitively', async () => {
      const response = await bed.invoke({
        authorizer: { accountId: CALLER_ACCOUNT_ID, ADMINACCOUNTFLAG: true },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      // Both claims are read case-insensitively, which is CFML struct-key semantics and the reason
      // `structGet` is used for each. An authorizer that spells either differently is the same
      // caller.
      expect(response.statusCode).toBe(200);
      expect(bed.scopeInputs).toStrictEqual([
        { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
      ]);
    });

    it.each([['true'], ['1'], [' TRUE '], ['True']])(
      '★★ carries the RESOLVED boolean into the scope for the string rendering %s, never the raw claim',
      async (rendering) => {
        // The authorizer can carry the flag as one of several truthy strings, and the scope member
        // is typed `boolean`.
        const fresh = makeTestBed();
        const response = await fresh.invoke({
          authorizer: { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: rendering },
          query: queryFor('findProducts', { keyword: 'jorden' }),
        });

        expect(response.statusCode).toBe(200);
        expect(fresh.scopeInputs).toStrictEqual([
          { accountID: CALLER_ACCOUNT_ID, adminAccountFlag: true },
        ]);
      },
    );

    it('★★★ cannot be told the actor by the REQUEST - the claim comes only from the authorizer', async () => {
      // The stamped actor must be server-established, or the audit trail records whatever the
      // caller asserted about itself.
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: {
          ...queryFor('findProducts', { keyword: 'jorden' }),
          adminAccountFlag: 'true',
        },
        headers: {
          adminAccountFlag: 'true',
          'x-admin-account-flag': 'true',
        },
        body: JSON.stringify({ adminAccountFlag: true, accountID: 'acct-somebody-else' }),
      });

      expect(response.statusCode).toBe(403);
      expect(readFailureBody(response).error.category).toBe('forbidden');

      // Refused before any scope was opened, so no spoofed actor could reach the audit stamp even
      // transiently, and the response never names the claim it read.
      expect(bed.scopeInputs).toStrictEqual([]);
      expect(bed.findProductsCalls).toHaveLength(0);
      expect(response.body).not.toContain('adminAccountFlag');
    });

    it('serves the administrative default caller past the gate', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★★ refuses an IDENTIFIED caller carrying no administrative claim, with 403', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: queryFor('findProducts', { keyword: '' }),
      });

      // An empty keyword matches every ROW and the statement carries no
      // `activeFlag`/`publishedFlag` predicate, so this is the exact request that enumerated
      // inactive and unpublished catalog data for any identified account. 403, not 401.
      expect(response.statusCode).toBe(403);
      expect(readFailureBody(response).error.category).toBe('forbidden');
      expect(bed.findProductsCalls).toHaveLength(0);
      expect(bed.scopeInputs).toStrictEqual([]);
    });

    it('refuses every non-admitted rendering of the administrative claim, and admits the closed two', async () => {
      // The vocabulary is `errorMapper`'s and is not widened here: a real `boolean true`, or one
      // of the two truthy STRINGS API Gateway can carry.
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
      for (const operation of PUBLISHED_OPERATIONS) {
        const fresh = makeTestBed();
        const response = await invokeOperation(fresh, operation, {
          authorizer: { accountID: CALLER_ACCOUNT_ID },
        });

        expect(response.statusCode).toBe(403);
        expect(fresh.counters.scopesOpened).toBe(0);
        expect(fresh.executor.executed).toEqual([]);
        expect(fresh.world.productLoads).toEqual([]);
        expect(fresh.unpublishedTouches).toEqual([]);
      }
    });

    it('publishes nothing about the claim in the 403, and costs no statement', async () => {
      const response = await bed.invoke({
        authorizer: { accountID: CALLER_ACCOUNT_ID },
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });
      const failure = readFailureBody(response).error;

      // The 403 sentence is the 401 sentence: an attacker learns which refusal occurred from the
      // status and nothing else from the body. No claim name, no account identifier, no field
      // path.
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

  // Concern 1 - request parsing and validation: the operation selector.

  describe('concern 1, request parsing: the operation selector', () => {
    it('requires the selector, and names all FOURTEEN published operations when it is absent', async () => {
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
      // asymmetry is asserted rather than smoothed over.
      const response = await bed.invoke({
        query: { operation: 'findProducts'.toUpperCase(), keyword: 'jorden' },
      });

      expect(response.statusCode).toBe(400);
      expect(bed.findProductsCalls).toEqual([]);
    });
    it.each(PUBLISHED_OPERATIONS)('recognizes the published operation %s', async (operation) => {
      const response = await invokeOperation(bed, operation);

      expect(response.statusCode).toBe(200);
      expect(readServedBody(response).result.operation).toBe(operation);
    });

    it('reads the selector from the multi-value map when the single-valued map lacks it', async () => {
      const response = await bed.invoke({
        // The page size is named here rather than left to `queryFor`, because this case assembles
        // the single-valued map directly in order to leave `operation` out of it.
        query: { keyword: 'jorden', pageRecordsShow: '25' },
        repeatedQuery: { operation: ['findProducts'] },
      });

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★★ treats an OMITTED query-string map as no selector, rather than answering a 500', async () => {
      // THE F-01 CLOSURE, AND WHY IT NEEDS AN EVENT THE TYPE SYSTEM SAYS CANNOT EXIST.
      // `@types/aws-lambda` declares both query maps as `{...} | null`, so the three readers in the
      // subject guarded only `!== null` and that type-checked. The type describes what API GATEWAY
      // sends, not what every caller of a Lambda sends: a direct invocation, a test event, an event
      // built by another AWS service and any hand-written JSON may simply OMIT the member, and an
      // omitted member reads back `undefined`. Each reader then indexed `undefined`, the resulting
      // `TypeError` escaped as an unrecognized failure, and a caller who sent no query string at all
      // received HTTP 500 - which runtime acceptance testing reproduced (finding F-01).
      //
      // The double assertion is deliberate and is the ONLY way to state this case: the shape being
      // asserted about is one the compiler is convinced is impossible, and the whole point is that the
      // runtime disagrees. Nothing in `src/**` uses this escape; it is confined to constructing the
      // event.
      const complete = makeEvent({ query: { operation: 'findProducts', keyword: 'jorden' } });
      const {
        queryStringParameters: _single,
        multiValueQueryStringParameters: _repeated,
        ...withoutQueryMaps
      } = complete;
      const malformed = withoutQueryMaps as unknown as APIGatewayProxyEvent;

      expect(Object.hasOwn(malformed, 'queryStringParameters')).toBe(false);
      expect(Object.hasOwn(malformed, 'multiValueQueryStringParameters')).toBe(false);

      const response = await bed.subject(malformed, makeContext());

      // The DOCUMENTED fallback: zero supplied selectors, so the 400 that names the missing parameter -
      // the same answer `query: null` already produced. Not a 500, and not a served response either.
      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.category).toBe('invalidRequest');
      expect(readFailureBody(response).error.message).toBe(
        'A required query parameter is missing.',
      );
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('★★ serves a MUTATION whose event omits both query maps, from the body alone', async () => {
      // The mutation arm reaches all three readers - `countSuppliedOperations`, `readNamedOperation`
      // and `readOperationParameters` - and the last of them used to call `Object.entries(undefined)`.
      // A mutation legitimately carries an EMPTY parameter set, so the corrected guard has to yield the
      // empty set rather than refuse; the selector still has to arrive, so it is put on the multi-value
      // map only, leaving the single-valued one omitted.
      const complete = makeEvent({
        method: 'POST',
        repeatedQuery: { operation: ['processProduct_updateDefaultImageFileNames'] },
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID }),
      });
      const { queryStringParameters: _single, ...withoutSingleMap } = complete;
      const malformed = withoutSingleMap as unknown as APIGatewayProxyEvent;

      expect(Object.hasOwn(malformed, 'queryStringParameters')).toBe(false);

      const response = await bed.subject(malformed, makeContext());

      expect(response.statusCode).toBe(200);
      expect(bed.updateDefaultImageFileNamesCalls).toHaveLength(1);
    });
  });

  // Concern 1 - request parsing and validation: the closed criteria shape.

  describe('concern 1, request parsing: the closed, typed criteria shape', () => {
    it('requires the keyword, because the statement binds it unconditionally', async () => {
      // CFML parity [model/dao/ProductDAO.cfc:L422]: the term is bound as `%<term>%` before the
      // `structKeyExists` guard that protects the product-type list at
      // [model/dao/ProductDAO.cfc:L423], so omitting it in CFML reached an undefined-variable
      // raise rather than a broader search.
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
      // AAP 0.6.2: `getProductSmartList` [model/service/ProductService.cfc:L342-L358] interpreted
      // a `struct data={}` at run time as filters, ranges, orders and page bounds.
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
      // `currentURL=""`, so the member survives for signature parity. Nothing derives behaviour
      // from it, and this asserts exactly that: it is forwarded unchanged and changes nothing.
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
      // The distinction is load-bearing on the service's contract, where the member remains
      // OPTIONAL: an absent `pageRecordsShow` reaching `ProductService.findProducts` means the
      // whole result set.
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
      // CFML parity [model/dao/OptionDAO.cfc:L94-L95] against [model/dao/OptionDAO.cfc:L51-L53]:
      // the group query takes one argument and the option query takes two.
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
      // empty value leaves one of them excluding nothing while it leaves the other matching
      // nothing.
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptionGroups', { existingOptionGroupIDList: '' }),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.unusedProductOptionGroupsCalls).toEqual(['']);
    });

    it('restates none of the Product_UpdateSkus conditional rules at this tier', async () => {
      // The rules of `model/validation/Product_UpdateSkus.json` - `price` required under
      // `showPrice{updatePriceFlag eq 1}` and `listPrice` required under
      // `showListPrice{updateListPriceFlag eq 1}` - are ported as a module-private schema inside
      // `src/services/productService.ts`.
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
      // An event whose single-valued query map is unpopulated is admissible: the selector is then
      // read from the multi-value map, and the operation's parameters are simply ABSENT.
      const response = await bed.invoke({
        query: null,
        repeatedQuery: { operation: ['findProducts'] },
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('keyword');
      expect(bed.findProductsCalls).toEqual([]);
    });

    it('invents no schema for the six entities that have no validation file by design', async () => {
      // `Category`, `PromotionQualifier`, `PromotionApplied`, `PromotionAccount`,
      // `Product_AddOption` and `Product_AddOptionGroup` carry no validation file, and those
      // absences are deliberate.
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

  // Concern 2 - delegation to the composed services.

  // Concern 1, continued: the two admission bounds a routed request must clear.
  //
  // Both are enforced at ADMISSION, so the answer is a client-shaped 400 naming the member rather
  // than the generic 500 an unrecognized throw from the statement builder would produce.
  describe('concern 1, request parsing: the two admission bounds', () => {
    it('REFUSES a findProducts request that names no page size at all', async () => {
      const response = await bed.invoke({
        query: { operation: 'findProducts', keyword: 'jorden' },
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('pageRecordsShow');
      // The refusal happens before any service work, so the unbounded query is never issued.
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('accepts a page size AT the ceiling and forwards it unchanged', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', pageRecordsShow: '500' }),
      });

      // At the bound is accepted, not rejected: the boundary is inclusive, and pinning it here is
      // what stops a later off-by-one from narrowing the surface without a failing test.
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
      // Not clamped to the ceiling: a 200 carrying 500 records would answer a different question
      // than the one asked and would tell the caller nothing about why.
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
      // refusal arriving from `src/repositories/mysql/sql/**` is an unrecognized throw.
      const overWide = Array.from({ length: 70000 }, (unused, index) => String(index)).join(',');
      const response = await bed.invoke({
        query: queryFor('getUnusedProductOptions', {
          productID: FIRST_PRODUCT_ID,
          existingOptionGroupIDList: overWide,
        }),
      });

      expect(response.statusCode).toBe(400);
      // The mapper's own client-shaped category, the same one every schema rejection carries - not
      // the `unrecognized` category an escaped statement-builder throw would have been given.
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

      // Absence is forwarded as `undefined`, never as a substituted value: an absent
      // `productTypeIDs` means "do not restrict", so a `0` or an `''` in its place would silently
      // ask a different question.
      expect(criteria.productTypeIDs).toBeUndefined();
      expect(criteria.pageRecordsStart).toBeUndefined();
      expect(criteria.currentURL).toBeUndefined();
      expect(criteria.pageRecordsShow).toBe(25);
    });

    it('keeps productTypeIDs a COMMA-DELIMITED STRING rather than modernising it', async () => {
      // CFML parity [model/dao/ProductDAO.cfc:L419, L424]: the adapter binds it as a CFML list, so
      // the string form is what signature parity preserves. The plural spelling is the
      // repository's own and is not harmonised with the SKU repository's singular one.
      const supplied = `${MERCHANDISE_PRODUCT_TYPE_ID},dddd,,eeee`;
      await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden', productTypeIDs: supplied }),
      });

      expect(atIndex(bed.findProductsCalls, 0).productTypeIDs).toBe(supplied);
    });

    it('forwards the option list to getUnusedProductOptions exactly as received', async () => {
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
      // `"#rs.optionGroupName# - #rs.optionName#"` - a space, a hyphen and a space.
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

  // Eleven operations therefore need positive coverage, and each needs it on five counts: it is
  // recognized, it is served on exactly one method, it is admitted only for an administrator.

  describe('concern 2, delegation: the eleven operations beyond the original five', () => {
    it('publishes exactly fourteen operations, of which nine are mutations', () => {
      // The three lists are assembled rather than restated - see `PUBLISHED_OPERATIONS` - so this
      // case pins the SHAPE of the surface and nothing else.
      expect(READ_OPERATIONS).toHaveLength(5);
      expect(MUTATION_OPERATIONS).toHaveLength(9);
      expect(PUBLISHED_OPERATIONS).toHaveLength(14);
      expect(new Set(PUBLISHED_OPERATIONS).size).toBe(14);
    });

    it.each(MUTATION_OPERATIONS)(
      'refuses %s on the read method, before any body is read',
      async (operation) => {
        const body = VALID_BODIES[operation];
        const response = await bed.invoke({
          method: firstDeclaredCatalogMethod(),
          query: queryFor(operation, VALID_PARAMETERS[operation]),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const issue = atIndex(readFieldIssues(response), 0);

        expect(response.statusCode).toBe(400);
        expect(readFailureBody(response).error.category).toBe('invalidRequest');
        expect(issue.path).toBe('operation');
        expect(issue.message).toContain('does not serve on the request method');
        expect(bed.counters.scopesOpened).toBe(0);
      },
    );

    it.each(READ_OPERATIONS)('refuses %s on the mutation method', async (operation) => {
      const response = await bed.invoke({
        method: methodForOperation('saveProduct'),
        query: queryFor(operation, VALID_PARAMETERS[operation]),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('operation');
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('names neither the method sent nor the method that would have worked', async () => {
      // Both are withheld for the reasons the subject states: `httpMethod` is caller-controlled
      // text and may not be echoed, and disclosing the correct verb would let a caller map the
      // surface by probing it.
      const response = await bed.invoke({
        method: firstDeclaredCatalogMethod(),
        query: queryFor('saveBrand'),
        body: JSON.stringify(VALID_BODIES.saveBrand),
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('saveBrand');
      expect(response.body).not.toContain('POST');
      expect(response.body).not.toContain('GET');
    });

    it('admits a lower-case rendering of the mutation method, as the router does', async () => {
      // Checked with `listFindNoCase` over a single-member list, which is the same primitive and
      // the same case-folding the router applies [Application.cfc:L133].
      const response = await invokeOperation(bed, 'saveProduct', {
        method: methodForOperation('saveProduct').toLowerCase(),
      });

      expect(response.statusCode).toBe(200);
      expect(bed.saveProductCalls).toHaveLength(1);
    });

    it.each(MUTATION_OPERATIONS)(
      'publishes NO query parameter on %s beyond the selector',
      async (operation) => {
        // The nine mutations map to the empty parameter set, so the body is provably the only
        // payload location.
        const body = VALID_BODIES[operation];
        const response = await bed.invoke({
          method: methodForOperation(operation),
          query: { operation, keyword: 'jorden' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const issue = atIndex(readFieldIssues(response), 0);

        expect(response.statusCode).toBe(400);
        expect(issue.path).toBe('queryStringParameters');
        expect(response.body).not.toContain('jorden');
        expect(bed.counters.scopesOpened).toBe(0);
      },
    );

    // Hydration: the entity the service is handed is the one the loader answered.

    it('hands processProduct_addOptionGroup the loaded product and the payload verbatim', async () => {
      const response = await invokeOperation(bed, 'processProduct_addOptionGroup');
      const call = atIndex(bed.addOptionGroupCalls, 0);

      expect(response.statusCode).toBe(200);
      // Identity, not equality.
      expect(call.product).toBe(bed.world.product);
      expect(bed.world.productLoads).toEqual([FIRST_PRODUCT_ID]);
      expect(call.input).toEqual({ optionGroup: SENTINEL_OPTION_GROUP_ID });
    });

    it('hands processProduct_addOption the loaded product and the payload verbatim', async () => {
      const response = await invokeOperation(bed, 'processProduct_addOption');
      const call = atIndex(bed.addOptionCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.product).toBe(bed.world.product);
      expect(call.input).toEqual({ option: FIRST_OPTION_ID });
    });

    it('forwards the updateSkus payload unaltered, and restates none of its conditional rules', async () => {
      // The conditional gate is the service's.
      const response = await invokeOperation(bed, 'processProduct_updateSkus');
      const call = atIndex(bed.updateSkusCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.product).toBe(bed.world.product);
      expect(call.input).toEqual({
        updatePriceFlag: 1,
        price: SENTINEL_UNIT_PRICE,
        updateListPriceFlag: 0,
      });
      expect(typeof call.input.price).toBe('string');
    });

    it('forwards an OMITTED updateSkus AMOUNT as absence rather than as a substituted value', async () => {
      // THE OMITTED MEMBER IS NOW AN AMOUNT RATHER THAN A FLAG, AND THE SUPERSEDED CASE IS RECORDED
      // BECAUSE ITS PREMISE WAS THE DEFECT. It sent `{productID}` alone and asserted a 200 with an
      // EMPTY forwarded payload - which is exactly the request runtime testing (finding F-03) measured
      // answering HTTP 500, because the service reads each flag through `cfTruthy` and an absent flag
      // makes that read raise [model/service/ProductService.cfc:L222, L226]. A body with no flags is
      // not servable, so asserting it was served was asserting the wrong thing. The two FLAGS are
      // required members now; the two AMOUNTS remain conditional, which is [model/validation/
      // Product_UpdateSkus.json]'s own distinction, so absence-forwarding is asserted on one of those.
      const response = await invokeOperation(bed, 'processProduct_updateSkus', {
        body: JSON.stringify({
          productID: FIRST_PRODUCT_ID,
          updatePriceFlag: 0,
          updateListPriceFlag: 0,
        }),
      });
      const call = atIndex(bed.updateSkusCalls, 0);

      expect(response.statusCode).toBe(200);
      // `exactOptionalPropertyTypes` is on, so absence is forwarded AS absence: neither amount key is
      // present at all rather than present carrying `undefined`, and no `0`, `''` or `false` is
      // invented for either.
      expect(Object.keys(call.input).sort()).toEqual(['updateListPriceFlag', 'updatePriceFlag']);
      expect(Object.hasOwn(call.input, 'price')).toBe(false);
      expect(Object.hasOwn(call.input, 'listPrice')).toBe(false);
    });

    it('refuses an updateSkus body that omits a flag, rather than answering a server error', async () => {
      // THE F-03 CLOSURE, ASSERTED AS THE CONTRACT RATHER THAN AS AN IMPLEMENTATION DETAIL. Three
      // payloads this schema used to ADMIT answered HTTP 500 `unrecognized`. Each is refused here as a
      // 400 naming the missing member, and the service is never reached - which is the whole point: a
      // schema that admits a payload is a published promise that the payload is servable.
      for (const body of [
        { productID: FIRST_PRODUCT_ID },
        { productID: FIRST_PRODUCT_ID, updatePriceFlag: 1, price: SENTINEL_UNIT_PRICE },
        { productID: FIRST_PRODUCT_ID, updatePriceFlag: 0 },
      ]) {
        bed.updateSkusCalls.length = 0;

        const refused = await invokeOperation(bed, 'processProduct_updateSkus', {
          body: JSON.stringify(body),
        });

        expect(refused.statusCode).toBe(400);
        expect(readFailureBody(refused).error.message).toBe('The request input is not valid.');
        expect(readFailureBody(refused).error.fields?.map((issue) => issue.path)).toContain(
          'updateListPriceFlag',
        );
        expect(bed.updateSkusCalls).toEqual([]);
      }
    });

    it('refuses an updateSkus flag whose value no CFML boolean context could convert', async () => {
      // THE SECOND HALF OF F-03. `cfTruthy` RAISES for a non-empty string that is neither a boolean
      // literal nor numeric, so a flag of `'active'` was admitted by the old string-or-number union and
      // then became a 500 four layers down. The wire grammar now delegates to `cfTruthy` itself, so
      // admission and conversion are one rule and the refusal names the member.
      const refused = await invokeOperation(bed, 'processProduct_updateSkus', {
        body: JSON.stringify({
          productID: FIRST_PRODUCT_ID,
          updatePriceFlag: 'active',
          updateListPriceFlag: 0,
        }),
      });

      expect(refused.statusCode).toBe(400);
      expect(readFailureBody(refused).error.fields?.map((issue) => issue.path)).toContain(
        'updatePriceFlag',
      );
      expect(bed.updateSkusCalls).toEqual([]);

      // And every form a CFML boolean context DOES accept is still admitted, including the empty
      // string, which `cfTruthy` reads as falsy per the currency-eligibility gate
      // [model/entity/Sku.cfc:L373].
      for (const flag of [true, false, 0, 1, '0', '1', 'yes', 'no', 'true', 'false', '']) {
        bed.updateSkusCalls.length = 0;

        const admitted = await invokeOperation(bed, 'processProduct_updateSkus', {
          body: JSON.stringify({
            productID: FIRST_PRODUCT_ID,
            updatePriceFlag: 0,
            updateListPriceFlag: flag,
          }),
        });

        expect(admitted.statusCode).toBe(200);
        expect(bed.updateSkusCalls).toHaveLength(1);
      }
    });

    it('forwards the optional deleteDefaultImage member only when it was supplied', async () => {
      // The asymmetry against the sibling process objects is the SOURCE'S: the legacy body gates
      // every use of `imageFile` behind `structKeyExists(arguments.data, "imageFile")`
      // [model/service/ProductService.cfc:L199].
      const withoutMember = await invokeOperation(bed, 'processProduct_deleteDefaultImage');
      expect(withoutMember.statusCode).toBe(200);
      expect(Object.keys(atIndex(bed.deleteDefaultImageCalls, 0).input)).toEqual([]);

      const withMember = await invokeOperation(bed, 'processProduct_deleteDefaultImage', {
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID, imageFile: 'red-large.jpg' }),
      });
      expect(withMember.statusCode).toBe(200);
      expect(atIndex(bed.deleteDefaultImageCalls, 1).input).toEqual({ imageFile: 'red-large.jpg' });
    });

    it('hands processProduct_updateDefaultImageFileNames the product and nothing else', async () => {
      // [model/service/ProductService.cfc:L208] takes the product alone, so the ported signature
      // is unary and the body carries only the identifier that names it.
      const response = await invokeOperation(bed, 'processProduct_updateDefaultImageFileNames');

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.updateDefaultImageFileNamesCalls, 0)).toBe(bed.world.product);
    });

    it('hands saveProduct the loaded product and the eight-member scalar payload', async () => {
      const response = await invokeOperation(bed, 'saveProduct', {
        body: JSON.stringify({
          productID: FIRST_PRODUCT_ID,
          productName: 'Renamed Product',
          productCode: 'TESTPRODUCTXXX',
          activeFlag: false,
          sortOrder: 7,
        }),
      });
      const call = atIndex(bed.saveProductCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.entity).toBe(bed.world.product);
      expect(call.data).toEqual({
        productName: 'Renamed Product',
        productCode: 'TESTPRODUCTXXX',
        activeFlag: false,
        sortOrder: 7,
      });
    });

    it.each([['options'], ['listPrice'], ['productTypeID']])(
      'refuses the SKU-collaboration member %s on saveProduct',
      async (member) => {
        // CHECKABLE. Two of `ProductSaveInput`'s eleven members are typed `Money`, and this tier
        // mints no `Money` at all; the third drives SKU creation through a method whose name says
        // it saves a product.
        const response = await invokeOperation(bed, 'saveProduct', {
          body: JSON.stringify({ productID: FIRST_PRODUCT_ID, [member]: '19.99' }),
        });

        expect(response.statusCode).toBe(400);
        expect(response.body).not.toContain(member);
        expect(bed.saveProductCalls).toEqual([]);
      },
    );

    it('★ ADMITS price on saveProduct and hands the service a Money, so the save rule is satisfiable', async () => {
      // THE F-07 CLOSURE. `price` is a DECLARED NON-PERSISTENT PROPERTY
      // [model/entity/Product.cfc:L118]; `populate` writes it like any other simple column; and
      // `getPrice()` probes that slot BEFORE the default SKU [model/entity/Product.cfc:L561-L568]. So
      // the legacy satisfied the `save`-context `price` rule FROM THE PAYLOAD. Publishing the member
      // restores that, and the value arrives as the `Money` `ProductSaveInput` declares - minted here
      // from a numeral the schema validated with `Money`'s own brander, so admission cannot disagree
      // with minting.
      const response = await invokeOperation(bed, 'saveProduct', {
        body: JSON.stringify({
          productID: FIRST_PRODUCT_ID,
          productName: 'Renamed Product',
          price: '9.99',
        }),
      });
      const call = atIndex(bed.saveProductCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.data.price).toBeInstanceOf(Money);
      expect(call.data.price?.toFixed2()).toBe('9.99');
    });

    it('★ refuses a saveProduct price no Money could hold, as a field issue rather than a 500', async () => {
      // Every one of these is a value `Money.fromDecimalString` throws on. Admitting them and letting
      // the mint throw would be a 500 for a caller mistake; the delegated predicate makes it a 400
      // naming `price`. `''` is included deliberately - it is falsy, not absent, and a blank price is
      // not a price.
      for (const price of ['', 'abc', '1,234.50', '12.', 'NaN', 'Infinity', '1e3', ' 9.99 ']) {
        bed.saveProductCalls.length = 0;

        const refused = await invokeOperation(bed, 'saveProduct', {
          body: JSON.stringify({ productID: FIRST_PRODUCT_ID, price }),
        });

        expect(refused.statusCode).toBe(400);
        expect(readFailureBody(refused).error.fields?.map((issue) => issue.path)).toContain(
          'price',
        );
        expect(bed.saveProductCalls).toEqual([]);
      }

      // A JSON NUMBER is refused too: a double is precisely how IEEE-754 drift would enter, and
      // `toDecimalString` refuses a non-string for that reason.
      const refusedNumber = await invokeOperation(bed, 'saveProduct', {
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID, price: 9.99 }),
      });

      expect(refusedNumber.statusCode).toBe(400);
      expect(bed.saveProductCalls).toEqual([]);
    });

    it('hands saveProductType the loaded product type, resolved off the product fixture', async () => {
      const response = await invokeOperation(bed, 'saveProductType');
      const call = atIndex(bed.saveProductTypeCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.entity).toBe(bed.world.productType);
      expect(bed.world.productTypeLoads).toEqual([SENTINEL_PRODUCT_TYPE_ID]);
      expect(call.data).toEqual({ productTypeName: 'Merchandise' });
    });

    it('hands saveBrand a brand HYDRATED FROM THE STATEMENT, since no brand repository exists', async () => {
      const response = await invokeOperation(bed, 'saveBrand');
      const call = atIndex(bed.saveBrandCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(call.entity.getBrandID()).toBe(SENTINEL_BRAND_ID);
      expect(call.entity.getBrandName()).toBe(SENTINEL_BRAND_NAME);
      expect(call.data).toEqual({ brandName: 'Renamed Brand' });
      expect(bed.executor.executed.some((sql) => sql.includes('FROM SwBrand'))).toBe(true);
    });

    it('admits the CFML flag union on saveBrand, and the resolved boolean on saveProductType', async () => {
      // Neither schema is harmonised with the other: each admits exactly what its SERVICE
      // declares.
      const brandResponse = await invokeOperation(bed, 'saveBrand', {
        body: JSON.stringify({ brandID: SENTINEL_BRAND_ID, activeFlag: '1' }),
      });
      expect(brandResponse.statusCode).toBe(200);
      expect(atIndex(bed.saveBrandCalls, 0).data).toEqual({ activeFlag: '1' });

      const typeResponse = await invokeOperation(bed, 'saveProductType', {
        body: JSON.stringify({ productTypeID: SENTINEL_PRODUCT_TYPE_ID, activeFlag: '1' }),
      });
      expect(typeResponse.statusCode).toBe(400);
      expect(bed.saveProductTypeCalls).toEqual([]);
    });

    it('hands deleteProduct the loaded product and publishes the boolean it answered', async () => {
      const response = await invokeOperation(bed, 'deleteProduct');

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.deleteProductCalls, 0)).toBe(bed.world.product);
      expect(readServedPayload(response)).toEqual({ deleted: true });
    });

    it('★★★ publishes a REFUSED delete as a 200 carrying false, not as an error', async () => {
      // [model/service/ProductService.cfc:L317-L339] returns `false` when the delete-context rule
      // refuses - a transaction exists against one of the product's SKUs - and it does not raise.
      bed.outcomes.productDeleted = false;

      const response = await invokeOperation(bed, 'deleteProduct');

      expect(response.statusCode).toBe(200);
      expect(readServedPayload(response)).toEqual({ deleted: false });
      expect(
        atIndex(
          decodedLines(bed).filter((line) => line.level === 'info'),
          0,
        ).context['resultCount'],
      ).toBe(1);
    });

    // The two synchronous reads the false rationale had ruled out.

    it('serves getFormattedOptionGroups from the loaded product, without awaiting it', async () => {
      // SYNCHRONOUS in the services tier: the ported body traverses the product's
      // already-materialized option groups and reaches nothing
      // [model/service/ProductService.cfc:L70].
      bed.outcomes.formattedOptionGroups = [
        {
          optionGroupName: 'Colour',
          options: [{ name: 'Red', value: FIRST_OPTION_ID }],
        },
      ];

      const response = await invokeOperation(bed, 'getFormattedOptionGroups');

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.formattedOptionGroupsCalls, 0)).toBe(bed.world.product);
      expect(readFormattedOptionGroups(response)).toEqual(bed.outcomes.formattedOptionGroups);
    });

    it('serves getOptionsForSelect from options loaded IN THE CALLER\u2019S OWN ORDER', async () => {
      // The order is the caller's, and that is a decision rather than an accident. The load
      // answers an unordered map keyed by case-folded identifier, so the subject walks the
      // caller's list instead of the map.
      const response = await invokeOperation(bed, 'getOptionsForSelect', {
        body: null,
        query: queryFor('getOptionsForSelect', {
          optionIDs: `${SECOND_OPTION_ID},${FIRST_OPTION_ID}`,
        }),
      });
      const handed = atIndex(bed.optionsForSelectCalls, 0);

      expect(response.statusCode).toBe(200);
      expect(handed.map((option) => option.getOptionID())).toEqual([
        SECOND_OPTION_ID,
        FIRST_OPTION_ID,
      ]);
      expect(readSelectRows(response).map((row) => row.value)).toEqual([
        SECOND_OPTION_ID,
        FIRST_OPTION_ID,
      ]);
    });

    it('parses the option list with CFML list semantics, dropping empty elements only', async () => {
      // The same parse the option adapters apply, so an untidy list is read here exactly as it
      // would be read there: empty elements are dropped and nothing is trimmed, sorted,
      // deduplicated or case-folded.
      const response = await invokeOperation(bed, 'getOptionsForSelect', {
        query: queryFor('getOptionsForSelect', {
          optionIDs: `${FIRST_OPTION_ID},,${FIRST_OPTION_ID}`,
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.optionsForSelectCalls, 0)).toHaveLength(2);
    });

    // An identifier that names no row: a served `unresolved`, never a 404.

    it.each([
      [
        'processProduct_addOptionGroup',
        { productID: ABSENT_PRODUCT_ID, optionGroup: SENTINEL_OPTION_GROUP_ID },
      ],
      ['processProduct_addOption', { productID: ABSENT_PRODUCT_ID, option: FIRST_OPTION_ID }],
      // BOTH FLAGS, because both are REQUIRED members - see the F-03 cases above. Without them the
      // request would be refused by the SCHEMA before any product load, so this case would assert
      // "absent product answers productNotFound" against a request that never looked one up.
      [
        'processProduct_updateSkus',
        { productID: ABSENT_PRODUCT_ID, updatePriceFlag: 0, updateListPriceFlag: 0 },
      ],
      ['processProduct_deleteDefaultImage', { productID: ABSENT_PRODUCT_ID }],
      ['processProduct_updateDefaultImageFileNames', { productID: ABSENT_PRODUCT_ID }],
      ['saveProduct', { productID: ABSENT_PRODUCT_ID }],
      ['deleteProduct', { productID: ABSENT_PRODUCT_ID }],
    ] as const)(
      'answers %s naming an absent product with a served productNotFound',
      async (operation, body) => {
        const response = await bed.invoke({
          method: methodForOperation(operation),
          query: queryFor(operation),
          body: JSON.stringify(body),
        });

        // A 200, `AND` the ground is structural rather than aesthetic. `./errorMapper.js` reaches
        // 404 on exactly one category - `routeNotFound` - and the router already answers 404 for a
        // path no row declares.
        expect(response.statusCode).toBe(200);
        expect(readUnresolvedReason(response)).toBe('productNotFound');
        expect(bed.world.productLoads).toEqual([ABSENT_PRODUCT_ID]);
      },
    );

    it('answers saveProductType naming an absent product type with productTypeNotFound', async () => {
      const response = await bed.invoke({
        method: methodForOperation('saveProductType'),
        query: queryFor('saveProductType'),
        body: JSON.stringify({ productTypeID: ABSENT_PRODUCT_TYPE_ID }),
      });

      expect(response.statusCode).toBe(200);
      expect(readUnresolvedReason(response)).toBe('productTypeNotFound');
      expect(bed.saveProductTypeCalls).toEqual([]);
    });

    it('answers saveBrand naming an absent brand with brandNotFound', async () => {
      const response = await bed.invoke({
        method: methodForOperation('saveBrand'),
        query: queryFor('saveBrand'),
        body: JSON.stringify({ brandID: ABSENT_BRAND_ID }),
      });

      expect(response.statusCode).toBe(200);
      expect(readUnresolvedReason(response)).toBe('brandNotFound');
      expect(bed.saveBrandCalls).toEqual([]);
    });

    it('answers getFormattedOptionGroups naming an absent product with productNotFound', async () => {
      const response = await bed.invoke({
        query: queryFor('getFormattedOptionGroups', { productID: ABSENT_PRODUCT_ID }),
      });

      expect(response.statusCode).toBe(200);
      expect(readUnresolvedReason(response)).toBe('productNotFound');
      expect(bed.formattedOptionGroupsCalls).toEqual([]);
    });

    it('★★ refuses the WHOLE getOptionsForSelect request when ONE named option is absent', async () => {
      // A single miss is one outcome for the request rather than a silently shorter array, because
      // a shorter array cannot be aligned with the list that was asked for.
      bed.executor.knownOptionIDs.add(FIRST_OPTION_ID);

      const response = await bed.invoke({
        query: queryFor('getOptionsForSelect', {
          optionIDs: `${FIRST_OPTION_ID},${ABSENT_OPTION_ID}`,
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(readUnresolvedReason(response)).toBe('optionNotFound');
      expect(bed.optionsForSelectCalls).toEqual([]);
    });

    it('reports an unresolved outcome as ZERO records on the served log line', async () => {
      const response = await bed.invoke({
        method: methodForOperation('deleteProduct'),
        query: queryFor('deleteProduct'),
        body: JSON.stringify({ productID: ABSENT_PRODUCT_ID }),
      });
      const served = atIndex(
        decodedLines(bed).filter((line) => line.level === 'info'),
        0,
      );

      expect(response.statusCode).toBe(200);
      expect(served.message).toContain('deleteProduct');
      expect(served.context['resultCount']).toBe(0);
    });

    it('publishes no identifier back to the caller in an unresolved outcome', async () => {
      // The reason is one of a closed set of four literals of this subtree, so the document names
      // what was not found without echoing the value that was submitted.
      const response = await bed.invoke({
        method: methodForOperation('saveBrand'),
        query: queryFor('saveBrand'),
        body: JSON.stringify({ brandID: ABSENT_BRAND_ID, brandName: 'Submitted Name' }),
      });

      expect(response.body).not.toContain(ABSENT_BRAND_ID);
      expect(response.body).not.toContain('Submitted Name');
    });

    // A ported save rule that failed: a 400 built from the entity's own register.

    it('★★★ answers 400 when a ported saveProduct rule fails, reading the entity error register', async () => {
      // The three saves do not throw for a failed save-context rule: the legacy
      // `HibachiService.save` [org/Hibachi/HibachiService.cfc:L151-L167] returns the same entity
      // whether it validated or not.
      bed.outcomes.saveProductRuleFailures = [['productName', 'is required']];

      const response = await invokeOperation(bed, 'saveProduct');
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.category).toBe('invalidRequest');
      // Everything published is server-authored.
      expect(issue.path).toBe('productName');
      expect(issue.message).toBe('is required');
      expect(bed.saveProductCalls).toHaveLength(1);
    });

    it('joins several rule messages for one property into one issue', async () => {
      bed.outcomes.saveProductTypeRuleFailures = [
        ['urlTitle', 'is required'],
        ['urlTitle', 'must be unique'],
      ];

      const response = await invokeOperation(bed, 'saveProductType');
      const issues = readFieldIssues(response);

      expect(response.statusCode).toBe(400);
      expect(issues).toHaveLength(1);
      expect(atIndex(issues, 0).path).toBe('urlTitle');
      expect(atIndex(issues, 0).message).toBe('is required; must be unique');
    });

    it('answers 400 when a ported saveBrand rule fails, on the same terms', async () => {
      bed.outcomes.saveBrandRuleFailures = [['brandName', 'is required']];

      const response = await invokeOperation(bed, 'saveBrand');

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe('brandName');
    });

    it('publishes no submitted value alongside a failed save rule', async () => {
      bed.outcomes.saveProductRuleFailures = [['productCode', 'must be unique']];

      const response = await invokeOperation(bed, 'saveProduct', {
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID, productCode: 'SUBMITTEDCODE' }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('SUBMITTEDCODE');
      expect(response.body).not.toContain(FIRST_PRODUCT_ID);
    });

    // The request body: five refusal shapes, each with its own stated reason.

    it.each(MUTATION_OPERATIONS)('requires a body on %s', async (operation) => {
      const response = await bed.invoke({
        method: methodForOperation(operation),
        query: queryFor(operation),
        body: null,
      });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe(
        'A request body is required and was not supplied.',
      );
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it('treats a whitespace-only body as no body at all', async () => {
      const response = await invokeOperation(bed, 'deleteProduct', { body: '   \n  ' });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe(
        'A request body is required and was not supplied.',
      );
    });

    it('refuses an unparsable body with the JSON reason, not a generic failure', async () => {
      // Stated as a REASON rather than inferred from a caught `SyntaxError`, because this
      // service's own code can produce that shape too - so the classification is chosen by the
      // handler that knows.
      const response = await invokeOperation(bed, 'deleteProduct', { body: '{"productID":' });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe('The request body is not valid JSON.');
      expect(bed.counters.scopesOpened).toBe(0);
    });

    it.each([['[]'], ['"a string"'], ['42'], ['null']])(
      'refuses the well-formed but non-document body %s',
      async (body) => {
        // Each is valid JSON and none is a request document. The schemas would reject them, but
        // naming the SHAPE here produces the more precise reason.
        const response = await invokeOperation(bed, 'deleteProduct', { body });

        expect(response.statusCode).toBe(400);
        expect(readFailureBody(response).error.message).toBe(
          'The request body is not the expected shape.',
        );
      },
    );

    it('refuses a body above the byte ceiling, without echoing any of it', async () => {
      // A target-chosen SAFETY bound on how much text one invocation will parse, stated as one.
      const oversized = JSON.stringify({
        productID: FIRST_PRODUCT_ID,
        productDescription: 'x'.repeat(9 * 1024),
      });

      const response = await invokeOperation(bed, 'saveProduct', { body: oversized });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe('The request input is not valid.');
      expect(response.body).not.toContain('xxxx');
      expect(bed.saveProductCalls).toEqual([]);
    });

    it('decodes a base64 body, because a binary media type is not a different request', async () => {
      const response = await invokeOperation(bed, 'deleteProduct', {
        body: Buffer.from(JSON.stringify({ productID: FIRST_PRODUCT_ID }), 'utf8').toString(
          'base64',
        ),
        isBase64Encoded: true,
      });

      expect(response.statusCode).toBe(200);
      expect(atIndex(bed.deleteProductCalls, 0)).toBe(bed.world.product);
    });

    it('refuses a base64 body too long to decode within the ceiling', async () => {
      const response = await invokeOperation(bed, 'saveProduct', {
        body: 'A'.repeat(20 * 1024),
        isBase64Encoded: true,
      });

      expect(response.statusCode).toBe(400);
      expect(readFailureBody(response).error.message).toBe('The request input is not valid.');
    });

    it('★★★ refuses a body carrying __proto__, which the pinned validator would silently drop', async () => {
      const before = Object.getPrototypeOf({}) as object;

      const response = await invokeOperation(bed, 'saveProduct', {
        body: '{"productID":"' + FIRST_PRODUCT_ID + '","nested":{"__proto__":{"polluted":true}}}',
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe('__proto__');
      expect(issue.message).toBe('is not a member this request accepts');
      expect(response.body).not.toContain('nested');
      expect(response.body).not.toContain('polluted');
      expect(Object.getPrototypeOf({})).toBe(before);
      expect('polluted' in ({} as Record<string, unknown>)).toBe(false);
      expect(bed.saveProductCalls).toEqual([]);
    });

    it.each(MUTATION_OPERATIONS)(
      'refuses an unrecognized member in the %s body',
      async (operation) => {
        const body = { ...(VALID_BODIES[operation] ?? {}), unrecognizedMember: 'sentinel' };
        const response = await invokeOperation(bed, operation, { body: JSON.stringify(body) });

        expect(response.statusCode).toBe(400);
        // `mapZodErrorFields` recognizes an unrecognized-key issue by ISSUE CODE, keeps only the
        // schema-authored container path and substitutes a fixed sentence - so neither the member
        // name nor its value is echoed.
        expect(response.body).not.toContain('unrecognizedMember');
        expect(response.body).not.toContain('sentinel');
      },
    );

    it.each(MUTATION_OPERATIONS)(
      'refuses a %s body that tries to name the operation itself',
      async (operation) => {
        // The selector has exactly one location, and the schemas enforce it.
        const body = { ...(VALID_BODIES[operation] ?? {}), operation };
        const response = await invokeOperation(bed, operation, { body: JSON.stringify(body) });

        expect(response.statusCode).toBe(400);
        // And the REFUSAL COSTS nothing. The schema runs at step 4 and the scope is opened at step
        // 6, so a body that fails validation never reaches a connection, a statement or a service.
        expect(bed.counters.scopesOpened).toBe(0);
        expect(bed.executor.executed).toEqual([]);
      },
    );

    it.each(MUTATION_OPERATIONS)('requires the row identifier on %s', async (operation) => {
      const supplied = VALID_BODIES[operation] ?? {};
      const identifierName = atIndex(Object.keys(supplied), 0);
      const withoutIdentifier = Object.fromEntries(
        Object.entries(supplied).filter(([name]) => name !== identifierName),
      );

      const response = await invokeOperation(bed, operation, {
        body: JSON.stringify(withoutIdentifier),
      });
      const issue = atIndex(readFieldIssues(response), 0);

      expect(response.statusCode).toBe(400);
      expect(issue.path).toBe(identifierName);
      expect(issue.message).toContain('must name an existing row');
    });

    it.each(MUTATION_OPERATIONS)('refuses an EMPTY row identifier on %s', async (operation) => {
      // An empty identifier is not an absent one, and neither is admissible: the transport policy
      // is that every mutation names an EXISTING row, so row creation is not published at all.
      const supplied = VALID_BODIES[operation] ?? {};
      const identifierName = atIndex(Object.keys(supplied), 0);

      const response = await invokeOperation(bed, operation, {
        body: JSON.stringify({ ...supplied, [identifierName]: '' }),
      });

      expect(response.statusCode).toBe(400);
      expect(atIndex(readFieldIssues(response), 0).path).toBe(identifierName);
    });

    it('IGNORES a body sent with a read rather than refusing it', async () => {
      // No read schema could describe a body, and refusing one would invent a rule the source has
      // no counterpart for. The body is not read at all on a read arm, which is what this asserts.
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
        body: '{"this":"is not read"}',
      });

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('does not let an unparsable body break a read', async () => {
      const response = await bed.invoke({
        query: queryFor('findProducts', { keyword: 'jorden' }),
        body: '{{{',
      });

      expect(response.statusCode).toBe(200);
    });

    // Mutation safety: what a mutation does not reach.

    it.each(MUTATION_OPERATIONS)('executes no statement of its own for %s', async (operation) => {
      // Raises on `executeMutation` and on `transaction`, so a write arriving there would fail
      // loudly: it would mean this adapter had bypassed the service.
      const response = await invokeOperation(bed, operation);

      expect(response.statusCode).toBe(200);
      expect(bed.unpublishedTouches).toEqual([]);
      for (const sql of bed.executor.executed) {
        expect(sql.toLowerCase()).toContain('select');
      }
    });

    it.each(MUTATION_OPERATIONS)('opens exactly one request scope for %s', async (operation) => {
      const response = await invokeOperation(bed, operation);

      expect(response.statusCode).toBe(200);
      expect(bed.counters.scopesOpened).toBe(1);
      expect(atIndex(bed.scopeInputs, 0)).toEqual({
        accountID: CALLER_ACCOUNT_ID,
        adminAccountFlag: true,
      });
    });

    it('maps the SKU batch bound the service raises rather than swallowing it', async () => {
      // The bound is the SERVICE'S - a transactional-integrity limit on one unit of work, supplied
      // by the composition root and defaulting to 1000 - and no second bound is applied at this
      // tier.
      bed.outcomes.updateSkusRejectsWith = new Error('the SKU update batch exceeds its bound');

      const response = await invokeOperation(bed, 'processProduct_updateSkus');

      expect(response.statusCode).toBe(500);
      expect(readFailureBody(response).error.message).toBe('The request could not be completed.');
      expect(response.body).not.toContain('bound');
    });

    it('publishes the transport policy for every operation, resendable or not', () => {
      expect(CATALOG_OPERATION_TRANSPORT.processProduct_updateSkus.resendable).toBe(true);
      expect(
        CATALOG_OPERATION_TRANSPORT.processProduct_updateDefaultImageFileNames.resendable,
      ).toBe(true);

      // TWO MORE ARE RESENDABLE THAN WERE, AND THE COUNT MOVED FROM 7 TO 5 FOR A MEASURED REASON.
      // `processProduct_addOptionGroup` and `processProduct_addOption` were declared non-resendable on
      // the LEGACY's behaviour, at a time when neither persisted anything at all (finding F-06) so the
      // claim could not be checked. Both now write, and both CONVERGE by explicit design: `addOption`
      // through `Sku.hasOption`, which exists so `SwSkuOption` cannot take a duplicate row, and
      // `createSkus` through its retry reconciliation, which SKIPS a combination the product already
      // carried. Measured three runs deep against MySQL on both the source and packaged tiers:
      // `SwSkuOption` 8 -> 12 -> 12 -> 12 and `SwSku` 4 -> 8 -> 8 -> 8, with identical `skuCode` sets.
      expect(CATALOG_OPERATION_TRANSPORT.processProduct_addOptionGroup.resendable).toBe(true);
      expect(CATALOG_OPERATION_TRANSPORT.processProduct_addOption.resendable).toBe(true);

      const nonResendable = MUTATION_OPERATIONS.filter(
        (operation) => !CATALOG_OPERATION_TRANSPORT[operation].resendable,
      );
      expect(nonResendable).toHaveLength(5);
      // The five that remain: a delete cannot be re-answered identically, and the three saves plus
      // `deleteProduct` each answer differently once the row has changed or gone.
      expect([...nonResendable].sort()).toEqual([
        'deleteProduct',
        'processProduct_deleteDefaultImage',
        'saveBrand',
        'saveProduct',
        'saveProductType',
      ]);

      for (const operation of READ_OPERATIONS) {
        expect(CATALOG_OPERATION_TRANSPORT[operation].resendable).toBe(true);
        expect(CATALOG_OPERATION_TRANSPORT[operation].method).toBe(firstDeclaredCatalogMethod());
      }
    });
  });

  // Concern 2 - delegation: what is not routable, and the tripwires proving it.
  //
  // Every operation named below is refused at the selector, and the tripwire on the corresponding
  // service member is asserted untouched.

  describe('concern 2, delegation: the deliberate non-exposures', () => {
    /**
     * Out of scope by AAP 0.9.5, though reachable from an in-scope file.
     */
    const outOfScopeOperations: readonly string[] = [
      'processProduct_addProductReview',
      'processProduct_addSubscriptionTerm',
      'processProduct_uploadDefaultImage',
      'loadDataFromFile',
    ];

    /**
     * Owned by a different capability, or by a subsystem this migration excludes outright.
     */
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

    it.each(otherOwnersOperations)('publishes no route reaching %s', async (operation) => {
      const response = await bed.invoke({ query: { operation } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('publishes no route to the hour-long bulk import, which no route could carry', async () => {
      // `loadDataFromFile` [model/service/ProductService.cfc:L65-L68] opens by raising the CFML
      // request timeout to 3600 seconds through `cfSetting(requesttimeout="3600")` at
      // [model/service/ProductService.cfc:L66].
      const response = await bed.invoke({ query: { operation: 'loadDataFromFile' } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
      expect(Object.keys(ROUTE_TABLE)).not.toContain('bulkImport');
    });

    it('publishes no route to createSkus, whose subscription branches are internal to it', async () => {
      const response = await bed.invoke({ query: { operation: 'createSkus' } });

      expect(response.statusCode).toBe(400);
      expect(bed.unpublishedTouches).toEqual([]);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(PUBLISHED_OPERATIONS).toContain('processProduct_addOptionGroup');
      expect(PUBLISHED_OPERATIONS).toContain('processProduct_addOption');
    });

    it('answers for its own capability only, across every other row of the table', async () => {
      // `org/Hibachi/**` is a boundary to extract from and never to port, the Taffy REST layer
      // under `frontend/api/` is out of scope, the Mura CMS bridge is not ported.
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

  // Concern 3 - API gateway response shaping.

  describe('concern 3, response shaping: the served envelope', () => {
    it('answers 200 with a JSON content type and a no-store cache directive', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });

      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
    });

    it('carries the shared envelope members, with the operation inside the payload', async () => {
      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const body = readServedBody(response);

      expect(body.requestId).toBe(INVOCATION_ID);
      expect(body.capability).toBe('catalogQuery');
      // The ROUTE action, which is fixed for this entrypoint - not the operation selector, which
      // is per-request and travels inside the payload. The two are asserted separately on purpose.
      expect(body.action).toBe('queryCatalog');
      expect(Object.keys(body).sort()).toEqual(['action', 'capability', 'requestId', 'result']);

      expect(body.result.operation).toBe('findProducts');
      expect(Object.keys(body.result).sort()).toEqual(['operation', 'result']);
    });

    it('projects a product onto exactly the two columns the statement selects', async () => {
      // [model/dao/ProductDAO.cfc:L421] selects `productID, productName` from `SwProduct` and
      // joins nothing.
      bed.outcomes.productPage = makeProductPage([matchRow(FIRST_PRODUCT_ID, 'Nike Air Jorden')]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: 'jorden' }) });
      const record = atIndex(readProductPage(response).records, 0);

      expect(record).toEqual({ productID: FIRST_PRODUCT_ID, productName: 'Nike Air Jorden' });
      expect(Object.keys(record).sort()).toEqual(['productID', 'productName']);
    });

    it('OMITS an absent product name rather than substituting a value for it', async () => {
      // Absence survives as absence. `Product.getProductName()` answers `string | undefined`
      // because the column is nullable, and the member is omitted from the JSON document - never
      // `null`, never `''`, never `0`.
      bed.outcomes.productPage = makeProductPage([matchRow(THIRD_PRODUCT_ID)]);

      const response = await bed.invoke({ query: queryFor('findProducts', { keyword: '' }) });
      const record = atIndex(readProductPage(response).records, 0);

      expect(record).toEqual({ productID: THIRD_PRODUCT_ID });
      expect('productName' in record).toBe(false);
      // Asserted against the serialized RECORD rather than the whole body, deliberately: the body
      // legitimately names `productName` once more, as the keyword property the executed statement
      // matches on.
      expect(JSON.stringify(record)).not.toContain('productName');
      expect(JSON.stringify(record)).not.toContain('null');
      expect(JSON.stringify(record)).not.toContain('""');
    });

    it('★★★ publishes NO monetary value and NO SKU member, and can no longer even be handed one', async () => {
      // The property is therefore proven twice over now, and the stronger half is the directives:
      // seeding money is a TYPE error.
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

      // @ts-expect-error - a page cannot carry an ENTITY; `records` is a row list.
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
      // The ported entities are classes whose fields are TypeScript-private only - enumerable at
      // run time - and they hold injected collaborators.
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
      // AAP 0.6.2 again, on the way out this time: the executed statement joins nothing and
      // matches one property, so `joins` is empty and `keywordProperties` has a single entry.
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
        const response = await invokeOperation(bed, operation);

        expect(response.statusCode).toBe(200);
        // A block body rather than a concise one, so the parsed value is discarded rather than
        // returned: returning it would hand an `any` back out of the assertion callback.
        expect(() => {
          JSON.parse(response.body);
        }).not.toThrow();
      }
    });
  });

  // Concern 4 - domain and error mapping.

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

      // The SPLIT is the POINT: the caller receives a fixed sentence and a correlation identifier,
      // while the operator receives the classification under the same identifier.
      expect(line.context['thrownShape']).toBe('ProductPagingCriteriaError');
      expect(line.context['category']).toBe('unrecognized');
      expect(line.context['statusCode']).toBe(500);
      expect(line.context['requestId']).toBe(INVOCATION_ID);
      expect(response.body).not.toContain('ProductPagingCriteriaError');
      expect(response.body).not.toContain(CATALOG_ROUTE.path);
      expect(line.context['route']).toBe(`${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`);
    });

    it('labels the route from the TABLE, never from the method the caller sent', async () => {
      // The router matches the method with `listFindNoCase`, so a lower-case `get` is admitted.
      //
      // `sanitizeRouteDiagnostic` cut at the first character outside `[A-Za-z0-9/_. -]`, so
      // widening this row to `GET,POST` made every catalog line read
      // `GET[trailing content dropped]` - a reduction that never happened.
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsStart', 3);

      const response = await bed.invoke({
        method: firstDeclaredCatalogMethod().toLowerCase(),
        query: queryFor('findProducts', { keyword: 'jorden' }),
      });
      const line = atIndex(
        decodedLines(bed).filter((emitted) => emitted.level === 'error'),
        0,
      );

      expect(response.statusCode).toBe(500);
      expect(line.context['route']).toBe(`${CATALOG_ROUTE.methods} ${CATALOG_ROUTE.path}`);
      expect(line.context['route']).not.toContain('[trailing content dropped]');
      expect(line.context['route']).not.toContain(firstDeclaredCatalogMethod().toLowerCase());
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
      // together with the values bound into it.
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

    it('★★★ maps a MissingAssociationError to a 400 naming the MEMBER and never the value', async () => {
      // THE F-12 CLOSURE. Runtime acceptance testing sent a well-formed, schema-admitted payload
      // naming a nonexistent `optionGroup` and received HTTP 500 `unrecognized` with no `fields`: the
      // payload PASSED the schema, so the refusal came from the service resolving the reference, and
      // `./errorMapper.js`'s recognizer set is deliberately CLOSED - so it could only reach its generic
      // arm. The caller was told this service had failed when the caller had, and an operator's 5xx
      // alarm counted a typo as an outage. The adapter now narrows the typed failure by `instanceof`.
      bed.outcomes.addOptionGroupRejectsWith = new MissingAssociationError([
        { path: 'optionGroup', message: 'must name an existing record' },
      ]);

      const response = await invokeOperation(bed, 'processProduct_addOptionGroup');
      const failure = readFailureBody(response).error;

      expect(response.statusCode).toBe(400);
      expect(failure.category).toBe('invalidRequest');
      // The SAME fixed sentence the schema-rejection arm publishes: `unusableRequestInput` is chosen
      // precisely so no invented specificity reaches the body.
      expect(failure.message).toBe('The request input is not valid.');
      expect(failure.fields).toStrictEqual([
        { path: 'optionGroup', message: 'must name an existing record' },
      ]);

      // NOTHING that identifies a row travels: not the submitted identifier, not a table, not a count.
      for (const leak of [SENTINEL_OPTION_GROUP_ID, 'SwOptionGroup', 'select ']) {
        expect(response.body).not.toContain(leak);
      }

      // And it is NOT logged as a server failure, so a 5xx alarm never sees it.
      expect(decodedLines(bed).filter((entry) => entry.level === 'error')).toEqual([]);
    });

    it('★★★ maps a stub-port refusal to 501, so a routed operation stops answering 500', async () => {
      // THE F-04 CLOSURE. `processProduct_deleteDefaultImage` is ROUTED, and the only argument that
      // makes it meaningful drove it into `RefusingImageStore.deleteImageFile`, whose rejection fell
      // through `./errorMapper.js`'s deliberately closed recognizer set to 500 `unrecognized` - on both
      // the source and packaged tiers. AAP 0.2.1 designates the image service a STUB PORT, so nothing
      // failed: this deployment does not implement it, and 501 says so.
      bed.outcomes.deleteDefaultImageRejectsWith = new ImageStoreNotConfiguredError(
        'deleteImageFile',
        "filePath='product/default/nike.jpg'",
      );

      const response = await invokeOperation(bed, 'processProduct_deleteDefaultImage', {
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID, imageFile: 'nike.jpg' }),
      });
      const failure = readFailureBody(response).error;

      expect(response.statusCode).toBe(501);
      expect(failure.category).toBe('notImplemented');
      expect(failure.message).toContain('does not implement');
      expect(failure.fields).toBeUndefined();

      // The composition detail stays on the log stream: nothing internal reaches the body.
      for (const leak of [
        'ImageStoreNotConfiguredError',
        'RefusingImageStore',
        'deleteImageFile',
        'product/default',
        'nike.jpg',
      ]) {
        expect(response.body).not.toContain(leak);
      }

      // And it is NOT logged at error level, so a 5xx alarm never counts a by-design limitation.
      expect(decodedLines(bed).filter((entry) => entry.level === 'error')).toEqual([]);
    });

    it('★★ maps the SUBSCRIPTION stub-port refusal the same way, for consistency', async () => {
      // No routed operation reaches this - `processProduct_addSubscriptionTerm` is out of scope and
      // unpublished - so it is consistency rather than a second bug fix. Both stub ports refuse
      // identically, so both are classified identically, and publishing that method later cannot
      // reintroduce the 500 through the other port.
      bed.outcomes.deleteDefaultImageRejectsWith = new SubscriptionTermsNotConfiguredError(
        'getSubscriptionTerm',
        "subscriptionTermID='st-1'",
      );

      const response = await invokeOperation(bed, 'processProduct_deleteDefaultImage');

      expect(response.statusCode).toBe(501);
      expect(readFailureBody(response).error.category).toBe('notImplemented');
      expect(response.body).not.toContain('SubscriptionTermsNotConfiguredError');
    });

    it('★★★ refuses an unusable imageFile as a 400 naming the member, never a 500', async () => {
      // THE SECOND HALF OF THE REFUSAL. `{"productID":"prod-1","imageFile":""}` answers 400 and not
      // 500: an unconstrained string member would reach the service's path-traversal guard, which
      // raises a plain `Error`, and an empty or traversing name is a CALLER mistake. The schema
      // delegates to that very guard, so admission and application are one rule and the refusal
      // names `imageFile`.
      for (const imageFile of [
        '',
        '   ',
        '../secrets.env',
        'a/b.jpg',
        'a\\b.jpg',
        '.',
        '..',
        '%2e%2e/x.jpg',
        'x'.repeat(300),
      ]) {
        bed.deleteDefaultImageCalls.length = 0;

        const refused = await invokeOperation(bed, 'processProduct_deleteDefaultImage', {
          body: JSON.stringify({ productID: FIRST_PRODUCT_ID, imageFile }),
        });

        expect(refused.statusCode).toBe(400);
        expect(readFailureBody(refused).error.fields?.map((issue) => issue.path)).toContain(
          'imageFile',
        );
        // The service is never reached, so the guard is never the thing that has to refuse.
        expect(bed.deleteDefaultImageCalls).toEqual([]);
      }

      // A usable name is still forwarded verbatim, and absence is still absence - the legacy's
      // `structKeyExists` gate [model/service/ProductService.cfc:L199] is untouched.
      const served = await invokeOperation(bed, 'processProduct_deleteDefaultImage', {
        body: JSON.stringify({ productID: FIRST_PRODUCT_ID, imageFile: 'red-large.jpg' }),
      });

      expect(served.statusCode).toBe(200);
      expect(atIndex(bed.deleteDefaultImageCalls, 0).input).toEqual({ imageFile: 'red-large.jpg' });
    });

    it('★★ leaves a SERVER-STATE dereference failure on the generic 500 arm', async () => {
      // The other half of the same decision, asserted so the distinction cannot erode into
      // "everything is a 400". `requireAssociation` raises a plain `Error` when the absent value is
      // SERVER STATE - an existing product's missing default SKU, an existing option's missing group -
      // because no payload member names it and no caller can correct it. That is a data-integrity
      // failure and belongs on the 500 arm.
      bed.outcomes.addOptionGroupRejectsWith = new Error(
        'Default SKU could not be resolved. The legacy body at ' +
          'model/service/ProductService.cfc:L133 dereferences it without a null check and fails at ' +
          'the same point when it is absent.',
      );

      const response = await invokeOperation(bed, 'processProduct_addOptionGroup');
      const failure = readFailureBody(response).error;

      expect(response.statusCode).toBe(500);
      expect(failure.category).toBe('unrecognized');
      expect(failure.message).toBe('The request could not be completed.');
      expect(failure.fields).toBeUndefined();
      // The message is withheld from the BODY and kept on the log stream, as for any unrecognized
      // failure.
      expect(response.body).not.toContain('ProductService.cfc');
    });

    it('reproduces the framework dead-call-target contract byte for byte', async () => {
      // This is the one case where a failure's own message is published, and it is safe because
      // the recognizing pattern enforces both of its slots as identifiers.
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
      // Server-shaped, because a call target that does not exist is this service's defect and not
      // the caller's mistake.
      expect(response.statusCode).toBe(500);
    });

    it('maps a thrown value that is not an Error INSTANCE at all', async () => {
      // A plain object carrying `name` and `message`: it satisfies the `Error` interface
      // structurally and fails `instanceof Error` at run time, which is precisely the shape the
      // shipped mapper singles out.
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
      // `typeof`, not the object's own `name`: the shape description is derived rather than read
      // off a value the thrower controls, so a caller-authored `name` cannot reach a log line
      // through it.
      expect(line.context['thrownShape']).toBe('object');
    });

    it('always answers with a response, never rethrowing out of the invocation', async () => {
      bed.outcomes.findProductsRejectsWith = driverShapedFailure();

      // A Lambda invocation that threw would surface as an unhandled failure with no envelope at
      // all, so the funnel returning a response is itself the assertion.
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
      // No duration, no rate and no size is measured or reported on this line, and nothing here
      // asks for one: the three keys above are the whole of its structured context.
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
      expect(line.context['fieldIssueCount']).toBe(1);
      expect(line.context['fieldPaths']).toBeUndefined();
    });
  });

  // CONCERN 2 - DELEGATION: the per-invocation bound and duplicate-request replay.

  describe('concern 2, delegation: the invocation bound and duplicate-request replay', () => {
    /**
     * A valid findProducts request, used wherever the request itself is not what varies.
     */
    const validRequest: EventOverrides = { query: queryFor('findProducts', { keyword: 'jorden' }) };

    /**
     * Build a valid request carrying an `idempotency-key` header.
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
      // Neither operation ran. Truncating to the first would have executed one of the two
      // operations the caller asked for, which is the outcome the bound exists to prevent.
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
      // The two service-tier bounds live on `ProductService`'s and `SkuService`'s constructors,
      // both supplied by the composition root.
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
      // `findProducts` independently refuses a supplied paging bound that is not a non-negative
      // safe integer, and that refusal is the service's to make.
      bed.outcomes.findProductsRejectsWith = new ProductPagingCriteriaError('pageRecordsShow', 12);

      const response = await bed.invoke(validRequest);

      expect(response.statusCode).toBe(500);
      expect(decodedLines(bed).filter((line) => line.level === 'error')).toHaveLength(1);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★★ HONOURS NO IDEMPOTENCY KEY, because the route no longer carries a ledger', async () => {
      // The two cases below are what replaces thirteen: the key is inert, and a retry re-executes.
      const first = await bed.invoke(keyedRequest('idem-0001'));
      const second = await bed.invoke(keyedRequest('idem-0001'), 'a-different-invocation');

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      // Two executions and two scopes: nothing is recorded and nothing is replayed.
      expect(bed.findProductsCalls).toHaveLength(2);
      expect(bed.counters.scopesOpened).toBe(2);
      expect(second).not.toBe(first);
    });

    it("★★ answers every response with THIS invocation's correlation identifier, never a recorded one", async () => {
      const first = await bed.invoke(keyedRequest('idem-0002'));
      const second = await bed.invoke(keyedRequest('idem-0002'), 'a-different-invocation');

      expect(readServedBody(first).requestId).toBe(INVOCATION_ID);
      expect(readServedBody(second).requestId).toBe('a-different-invocation');
    });

    it("★★★ CANNOT REPLAY ONE OPERATION'S BODY FOR ANOTHER, which was the defect itself", async () => {
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
      for (let index = 0; index < 8; index += 1) {
        const response = await bed.invoke(keyedRequest(`idem-retain-${String(index)}`));
        expect(response.statusCode).toBe(200);
      }

      // Every one executed: there is no record to answer from.
      expect(bed.findProductsCalls).toHaveLength(8);
      expect(bed.counters.scopesOpened).toBe(8);
    });

    it('★★ imposes NO length bound on the inert key, because nothing keys anything on it', async () => {
      const response = await bed.invoke(keyedRequest('k'.repeat(1024)));

      expect(response.statusCode).toBe(200);
      expect(bed.findProductsCalls).toHaveLength(1);
    });

    it('★★ SHARES NO IN-FLIGHT CALL between two concurrent requests carrying one key', async () => {
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
      // Each answered under its own identifier, which a shared in-flight promise could not have
      // done.
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

      // Every refusal above is decided before anything is constructed: no composition root
      // resolved, no request scope opened, no service member reached.
      expect(bed.counters.rootsResolved).toBe(0);
      expect(bed.counters.scopesOpened).toBe(0);
      expect(bed.findProductsCalls).toEqual([]);
      expect(bed.unpublishedTouches).toEqual([]);
    });

    it('introduces no thread, worker or timer of its own', async () => {
      await bed.invoke(validRequest);

      expect(bed.counters.scopesOpened).toBe(1);
      expect(bed.findProductsCalls).toHaveLength(1);
      expect(bed.unusedProductOptionsCalls).toEqual([]);
      expect(bed.unusedProductOptionGroupsCalls).toEqual([]);
    });
  });
});
