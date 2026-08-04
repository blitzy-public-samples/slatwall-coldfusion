/**
 * skuHandler — the AWS boundary for the extracted Catalog SKU surface.
 *
 * Authority: AAP §0.4.1.9 row 3 — "slatwall-ts/src/handlers/skuHandler.ts | create |
 * model/service/SkuService.cfc | Exposes the SKU surface." The member surface is fixed by
 * AAP §0.4.2.2 (the nine declared members) and AAP §0.4.2.5 (the one synthesized member).
 *
 * What this file is
 * Each member below narrows the proxy event, calls one service member, and shapes the outcome
 * through ./httpResponse (AAP §0.3.2, quoting AWS's own reference layout: "the handler responsible
 * only for translating AWS-specific input into domain calls"). There is no query, no combination
 * enumeration, no validation rule, no field mapping and no SQL anywhere in this file, because every
 * one of those belongs to a layer beneath it.
 */

import type { CatalogContainer } from '../config/container';
import type { Sku } from '../domain/sku/Sku';
import type {
  EntityCrudType,
  HandlerAccessClassification,
  InvocationSecurityResolver,
  RequestAuthorizationContext,
} from '../ports/AccountContextPort';
import type { SmartListInput, SmartListResult } from '../ports/SmartListQueryPort';
import type { TransactionalWriteRunner } from '../config/container';
import type { ProductWithErrorState, SkuService } from '../services/SkuService';
import { collectSkuBatchErrors, skuBatchHasErrors } from '../services/SkuService';

/* A type-only reference to the transaction boundary, and the one reason it is here. */
import type { UnitOfWork } from '../adapters/mysql/UnitOfWork';

/* The one error class this boundary constructs, and it is not a classification decision. */
import { ValidationError } from '../errors/ValidationError';

import {
  errorResponse,
  forbiddenResponse,
  invalidRequestBodyResponse,
  messageResponse,
  notFoundResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
  readQueryStringParameter,
  readSmartListInput,
  resolveRequestAuthorization,
  toInvocationSecurityRequest,
  unauthorizedResponse,
  createActionDispatcher,
  HTTP_STATUS,
  type ActionRoute,
  type ActionRouteTable,
  type APIGatewayProxyEvent,
  type APIGatewayProxyHandler,
  type APIGatewayProxyResult,
  type CatalogAuthorizationEvent,
} from './httpResponse';
import type { ExactDecimal } from '../util/formatting';

/* Request parameter names. */

/** The path parameter carrying a product's primary identifier. */
const PRODUCT_ID_PATH_PARAMETER = 'productID';

/** The path parameter carrying a SKU's primary identifier. */
const SKU_ID_PATH_PARAMETER = 'skuID';

/** The path parameter carrying a SKU's code. */
const SKU_CODE_PATH_PARAMETER = 'skuCode';

/** The query parameter carrying the sorting flag. */
const SORTED_QUERY_PARAMETER = 'sorted';

/** The query parameter carrying the eager-fetch flag. */
const FETCH_OPTIONS_QUERY_PARAMETER = 'fetchOptions';

/** The query parameter carrying the search term. */
const TERM_QUERY_PARAMETER = 'term';

/** The query parameter carrying the product-type identifier — singular, and deliberately so. */
const PRODUCT_TYPE_ID_QUERY_PARAMETER = 'productTypeID';

/** The query parameter carrying the SKU identifier the transaction probe is scoped to. */
const SKU_ID_QUERY_PARAMETER = 'skuID';

/** The query parameter carrying the product identifier the transaction probe is scoped to. */
const PRODUCT_ID_QUERY_PARAMETER = 'productID';

/** The identifier value that means "this record has never been persisted". */
const UNSAVED_IDENTIFIER = '';

/* Entity names for the authorisation gate. */

/** The legacy CFML component name — `model/entity/Sku.cfc`. */
const SKU_ENTITY_NAME = 'Sku';

/** The legacy CFML component name — `model/entity/Product.cfc`. */
const PRODUCT_ENTITY_NAME = 'Product';

/**
 * The prefix every routed SKU action carries, so the resolver is told which action it is gating.
 */
const SKU_ACTION_PREFIX = 'sku.';

/** What the gate answers: either the refusal to return, or the authorised invocation context. */
type SkuAuthorizationOutcome =
  | { readonly refusal: APIGatewayProxyResult; readonly authorization?: undefined }
  | { readonly refusal?: undefined; readonly authorization: RequestAuthorizationContext };

/* CFML boolean literals. */

/** The values CFML reads as boolean true. */
const CFML_TRUE_LITERALS: readonly string[] = Object.freeze(['true', 'yes', '1']);

/** The values CFML reads as boolean false. */
const CFML_FALSE_LITERALS: readonly string[] = Object.freeze(['false', 'no', '0']);

/* The smart list data vocabulary — moved, not deleted. */

/* Bad-request texts. */

const PRODUCT_ID_REQUIRED_MESSAGE = `A "${PRODUCT_ID_PATH_PARAMETER}" path parameter is required`;

const SKU_ID_REQUIRED_MESSAGE = `A "${SKU_ID_PATH_PARAMETER}" path parameter is required`;

/*
 * Used by exactly one member, and not by the other that reads the same parameter.
 * {@link SkuHandler.processImageUpload} refuses an unaddressed code with this text, because its service
 * contract takes `required any Sku` [model/service/SkuService.cfc:L210] — an entity this boundary must
 * resolve before it can call. {@link SkuHandler.getSkuBySkuCode} does not, because there the code is the
 * argument and [:L289] declares it without `required`, so this member forwards the absence. a revision
 * used it in both places; the contract no longer includes the second use.
 */
const SKU_CODE_REQUIRED_MESSAGE = `A "${SKU_CODE_PATH_PARAMETER}" path parameter is required`;

const SORTED_REQUIRED_MESSAGE = `A "${SORTED_QUERY_PARAMETER}" query parameter is required`;

const SORTED_NOT_BOOLEAN_MESSAGE = `The "${SORTED_QUERY_PARAMETER}" query parameter must be a boolean`;

const FETCH_OPTIONS_NOT_BOOLEAN_MESSAGE = `The "${FETCH_OPTIONS_QUERY_PARAMETER}" query parameter must be a boolean`;

/* The injection seams. */

/**
 * The SKU-service surface this handler consumes — the injection seam, and the parity check itself.
 */
export type SkuSurface = Pick<
  SkuService,
  | 'createSkus'
  | 'processImageUpload'
  | 'getProductSkus'
  | 'getSortedProductSkus'
  | 'searchSkusByProductType'
  | 'getSkuStocksDeletableFlag'
  | 'getTransactionExistsFlag'
  | 'getSkuBySkuCode'
  | 'getSkuSmartList'
  | 'newSku'
>;

/** What {@link createSkuHandler} is actually given: the parity seam minus the writing member. */
export type RoutedSkuSurface = Omit<SkuSurface, 'createSkus'>;

/**
 * Resolves an addressed product identifier into the product entity three service members require.
 */
export type ProductResolver = (productID: string) => Promise<ProductWithErrorState | null>;

/** The transaction-scoped capabilities {@link SkuHandler.createSkus} runs against. */
export interface SkuWriteGraph {
  /** Loads the aggregate the batch mutates, through the transaction's own scope. */
  readonly resolveProduct: ProductResolver;

  /**
   * The one write member this graph exists for — see {@link SkuSurface} for the full service surface.
   */
  readonly skuService: Pick<SkuSurface, 'createSkus'>;
}

/* Compile-time guards — two pairings that a comment could only assert. */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/*
 * The concrete service must satisfy the surface this boundary mounts. Without this, dropping or
 * renaming a member on `SkuService` would not be caught here — the boundary would simply mount a
 * narrower surface and the parity claim in the header would quietly stop being true.
 */
type _SkuServiceSatisfiesSkuSurface = AssertAssignable<SkuService, SkuSurface>;

/*
 * The write runner's commit gate must be exactly what `UnitOfWork.run` demands of its own gate. The
 * runner is injected as a port, so nothing else in this module forces the two to agree; if the unit
 * of work ever changed the shape of its gate, every handler that supplies one would keep compiling
 * against the stale shape and the divergence would surface only at run time.
 */
type _WriteRunnerGateMatchesUnitOfWork = AssertAssignable<
  /*
   * Index 2, not 1: `runWrite` takes the invocation's authorised security context first as of review
   * finding, so the gate is the third parameter. `unitOfWork.run` is unchanged — it never saw
   * a principal and still does not — which is why only the left index moved.
   */
  Parameters<TransactionalWriteRunner<SkuWriteGraph>['runWrite']>[2],
  Parameters<UnitOfWork['run']>[1]
>;

/* The writing boundary — one transaction per sku-creation invocation (M5, M6) */

/**
 * The transaction runner this boundary needs, declared structurally so no adapter is imported.
 *
 * @typeParam TScope - The runner's scope type, left open so this file never names one. The real
 * implementation supplies `TransactionScope`; a test supplies whatever its double hands out.
 */
export interface ScopedTransactionRunner<TScope> {
  runScoped<TGraph, TResult>(
    buildGraph: (scope: TScope) => TGraph,
    work: (graph: TGraph) => Promise<TResult>,
    reportErrors: (result: TResult) => boolean,
  ): Promise<TResult>;
}

/** The two collaborators SKU creation needs, both bound to one transaction's scope. */
export interface SkuCreationGraph {
  /**
   * Scope-bound product read — the same bridge {@link ProductResolver} describes, inside the boundary.
   */
  readonly resolveProduct: ProductResolver;
  /** Scope-bound writing service, narrowed to the single member the boundary invokes. */
  readonly skuService: Pick<SkuSurface, 'createSkus'>;
}

/** What one SKU-creation transaction produced, and the object the M5 gate is asked about. */
export interface SkuCreationOutcome {
  /** The resolved product, or `null` when no row matched the addressed identifier. */
  readonly product: ProductWithErrorState | null;
  /**
   * The service's unconditional `true`, or `null` when no product was found and nothing was attempted.
   */
  readonly created: boolean | null;
}

/**
 * The route's only route to a write: one product identifier and one unreshaped payload in, one settled
 * transaction out.
 */
export type ProductSkuCreationBoundary = (
  productID: string,
  data: Record<string, unknown>,
) => Promise<boolean | null>;

/**
 * Compose the writing boundary: one transaction per invocation, over collaborators built for it.
 *
 * @typeParam TScope - The runner's scope type; inferred, never named in this file.
 * @typeParam TGraph - The concrete graph the composition root builds. Constrained to
 * {@link SkuCreationGraph} so the boundary can use it while the root stays free to build more.
 *
 * @param runner - The transaction runner, structurally `UnitOfWork.runScoped`.
 * @param buildGraph - Builds the scope-bound collaborators. It must pass the scope's executor to every
 * repository it constructs; that single obligation is what M6's visibility guarantee rests on.
 */
export function createProductSkuCreationBoundary<TScope, TGraph extends SkuCreationGraph>(
  runner: ScopedTransactionRunner<TScope>,
  buildGraph: (scope: TScope) => TGraph,
): ProductSkuCreationBoundary {
  return async (productID: string, data: Record<string, unknown>): Promise<boolean | null> => {
    const outcome = await runner.runScoped(
      buildGraph,
      async (graph): Promise<SkuCreationOutcome> => {
        const product = await graph.resolveProduct(productID);

        if (product === null) {
          return { product: null, created: null };
        }

        /*
         * M6: the payload reaches the service unreshaped, and the call runs on the same executor the
         * read above used, so each insert is visible to the next SKU's uniqueness read (AAP §0.6.2).
         */
        return { product, created: await graph.skuService.createSkus(product, data) };
      },
      /*
       * The M5 gate — `model/service/ProductService.cfc:L286-L288` re-read, over the whole batch.
       */
      (settled: SkuCreationOutcome): boolean =>
        settled.product !== null && skuBatchHasErrors(settled.product),
    );

    return outcome.created;
  };
}

/* Event slices. */

/**
 * The slice {@link SkuHandler.createSkus} reads: the product identifier from the path and the `data`
 * payload from the body.
 */
export type CreateSkusEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.processImageUpload} reads: the SKU code from the path and the
 * `imageUploadResult` payload from the body.
 */
export type ProcessImageUploadEvent = Pick<
  APIGatewayProxyEvent,
  'body' | 'pathParameters' | 'headers'
>;

/**
 * The slice {@link SkuHandler.getProductSkus} reads: the product identifier from the path and the two
 * boolean flags from the query string.
 */
export type ProductSkusEvent = Pick<
  APIGatewayProxyEvent,
  'pathParameters' | 'queryStringParameters' | 'headers'
>;

/**
 * The slice {@link SkuHandler.getSortedProductSkus} reads: the product identifier from the path.
 */
export type SortedProductSkusEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.searchSkusByProductType} reads: the two optional query parameters.
 */
export type SearchSkusEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.getSkuStocksDeletableFlag} reads: the SKU identifier from the path.
 */
export type SkuIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/** The slice {@link SkuHandler.getSkuBySkuCode} reads: the SKU code from the path. */
export type SkuCodeEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.getTransactionExistsFlag} reads: the two optional query identifiers.
 */
export type TransactionExistsEvent = Pick<
  APIGatewayProxyEvent,
  'queryStringParameters' | 'headers'
>;

/**
 * The slice {@link SkuHandler.getSkuSmartList} reads: the whole query-string container, which stands in
 * for the FW/1 request context the legacy member received.
 */
export type SkuSmartListEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters' | 'headers'>;

/** The slice of the proxy event the injected authorisation resolver is given. */
export type SkuAuthorizationEvent = CatalogAuthorizationEvent;

/* Response shapes. */

/** The SKU representation a route returns: an explicit, minimal projection of the domain object. */
export interface SkuResponse {
  readonly skuID: string;
  readonly skuCode?: string;
  /*
   * — the three prices serialise as JSON strings, and that is the point. They are
   * {@link ExactDecimal}: `ormtype="big_decimal"` [model/entity/Sku.cfc:L55-L57], carried as exact digits
   * everywhere else in this port. Declaring them `number` here would put the rounding back at the very
   * last step, because `JSON.stringify` would emit a bare numeric literal and every mainstream JSON
   * parser reads one as an IEEE 754 double — so `9007199254740993.01` would reach the client as
   * `9007199254740994` after surviving the database, the mapper, the domain and the service intact.
   */
  readonly price: ExactDecimal;
  readonly listPrice: ExactDecimal;
  readonly renewalPrice: ExactDecimal;
  readonly activeFlag: boolean;
  readonly userDefinedPriceFlag: boolean;
  readonly imageFile?: string;
}

/** The paginated SKU representation {@link SkuHandler.getSkuSmartList} returns. */
export interface SkuSmartListResponse {
  readonly records: readonly SkuResponse[];
  readonly pageRecords: readonly SkuResponse[];
  readonly recordsCount: number;
  readonly pageRecordsStart: number;
  readonly pageRecordsEnd: number;
  readonly currentPage: number;
  readonly totalPages: number;
}

/* The authorisation matrix. */

/** What one routed SKU operation requires of a principal, in the legacy's own vocabulary. */
type SkuAccessRequirement = {
  readonly classification: Extract<HandlerAccessClassification, 'secure'>;
  readonly entityName: string;

  /** The one operation this route performs, and therefore the one question it asks. */
  readonly crudType: EntityCrudType;

  /**
   * A second, subordinate question, asked only after the primary one is granted —'s
   * conjunctive half.
   */
  readonly subordinate?: {
    readonly entityName: string;
    readonly crudType: EntityCrudType;
  };
};

const SECURE_SKU_IMAGE_WRITE_REQUIREMENT: SkuAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: SKU_ENTITY_NAME,
  crudType: 'update',
});

/**
 * The requirement every SKU read states: a logged-in account whose permission groups grant `read` on
 * `Sku`.
 */
const SECURE_SKU_READ_REQUIREMENT: SkuAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: SKU_ENTITY_NAME,
  crudType: 'read',
});

/**
 * The requirement SKU creation states: a logged-in account whose permission groups grant `update` on
 * `Product` and `create` on `Sku`.
 */
const SECURE_PRODUCT_SAVE_REQUIREMENT: SkuAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudType: 'update',
  /*
   * 's subordinate half: the route creates SKUs under the product it updates, and ./skuHandler
   * asks the same `Sku` question for its own image write, so one resource stays governed by one
   * permission wherever it is reached from.
   */
  subordinate: Object.freeze({ entityName: SKU_ENTITY_NAME, crudType: 'create' }),
});

/** The access classification of every routed SKU operation, and the evidence for each row. */
export const SKU_ACCESS_MATRIX: Readonly<Record<keyof SkuHandler, SkuAccessRequirement>> =
  Object.freeze({
    createSkus: SECURE_PRODUCT_SAVE_REQUIREMENT,
    processImageUpload: SECURE_SKU_IMAGE_WRITE_REQUIREMENT,
    getProductSkus: SECURE_SKU_READ_REQUIREMENT,
    getSortedProductSkus: SECURE_SKU_READ_REQUIREMENT,
    searchSkusByProductType: SECURE_SKU_READ_REQUIREMENT,
    getSkuStocksDeletableFlag: SECURE_SKU_READ_REQUIREMENT,
    getTransactionExistsFlag: SECURE_SKU_READ_REQUIREMENT,
    getSkuBySkuCode: SECURE_SKU_READ_REQUIREMENT,
    getSkuSmartList: SECURE_SKU_READ_REQUIREMENT,
  });

/* The routed surface. */

/** The routed SKU operations, ready to be mounted by src/handlers/router.ts. */
export interface SkuHandler {
  /** Creates a product's SKUs from a submitted payload. */
  readonly createSkus: (event: CreateSkusEvent) => Promise<APIGatewayProxyResult>;

  /** Records the result of an image upload against a SKU. */
  readonly processImageUpload: (event: ProcessImageUploadEvent) => Promise<APIGatewayProxyResult>;

  /** Lists a product's SKUs, optionally in option-group order. */
  readonly getProductSkus: (event: ProductSkusEvent) => Promise<APIGatewayProxyResult>;

  /** Lists a product's SKUs in option-group order. */
  readonly getSortedProductSkus: (event: SortedProductSkusEvent) => Promise<APIGatewayProxyResult>;

  /** Searches SKUs, optionally narrowed to one product type. */
  readonly searchSkusByProductType: (event: SearchSkusEvent) => Promise<APIGatewayProxyResult>;

  /** Reports whether a SKU's stock records may be deleted — and never actually answers. */
  readonly getSkuStocksDeletableFlag: (event: SkuIdentifierEvent) => Promise<APIGatewayProxyResult>;

  /**
   * Publishes the transaction-existence probe, scoped by either optional identifier the legacy accepts.
   */
  readonly getTransactionExistsFlag: (
    event: TransactionExistsEvent,
  ) => Promise<APIGatewayProxyResult>;

  /** Finds one SKU by its code, falling back to alternate codes. */
  readonly getSkuBySkuCode: (event: SkuCodeEvent) => Promise<APIGatewayProxyResult>;

  /** Returns a paginated, filterable SKU list. */
  readonly getSkuSmartList: (event: SkuSmartListEvent) => Promise<APIGatewayProxyResult>;
}

/* Input narrowing. */

/**
 * Reads the addressed product identifier, or reports that none was addressed.
 */
function readProductIdentifier(
  event: Pick<APIGatewayProxyEvent, 'pathParameters'>,
): string | undefined {
  const productID: string | undefined = readPathParameter(event, PRODUCT_ID_PATH_PARAMETER);

  if (productID === undefined || productID === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return productID;
}

/**
 * Reads the addressed SKU identifier, or reports that none was addressed.
 */
function readSkuIdentifier(
  event: Pick<APIGatewayProxyEvent, 'pathParameters'>,
): string | undefined {
  const skuID: string | undefined = readPathParameter(event, SKU_ID_PATH_PARAMETER);

  if (skuID === undefined || skuID === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return skuID;
}

/**
 * Reads the addressed SKU code, or reports that none was addressed.
 */
function readSkuCode(event: Pick<APIGatewayProxyEvent, 'pathParameters'>): string | undefined {
  return readPathParameter(event, SKU_CODE_PATH_PARAMETER);
}

/**
 * Reads one of the transaction probe's two optional scope identifiers from the query string.
 */
function readTransactionScopeIdentifier(
  event: Pick<APIGatewayProxyEvent, 'queryStringParameters'>,
  name: string,
): string | undefined {
  const identifier: string | undefined = readQueryStringParameter(event, name);

  if (identifier === undefined || identifier === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return identifier;
}

/**
 * Reads one query parameter as a boolean, distinguishing "absent" from "not a boolean".
 */
function readCfmlBoolean(
  event: Pick<APIGatewayProxyEvent, 'queryStringParameters'>,
  name: string,
): boolean | null | undefined {
  const raw: string | undefined = readQueryStringParameter(event, name);

  if (raw === undefined) {
    return undefined;
  }

  const folded = raw.toLowerCase();

  if (CFML_TRUE_LITERALS.includes(folded)) {
    return true;
  }

  if (CFML_FALSE_LITERALS.includes(folded)) {
    return false;
  }

  return null;
}

/* The smart-list query-string reader lives in ./httpResponse, not here. */

/* Response projection. */

/**
 * Projects a SKU onto the minimal representation a route returns.
 */
function toSkuResponse(sku: Sku): SkuResponse {
  const response: SkuResponse = {
    skuID: sku.skuID,
    ...(sku.skuCode !== undefined ? { skuCode: sku.skuCode } : {}),
    price: sku.price,
    listPrice: sku.listPrice,
    renewalPrice: sku.renewalPrice,
    activeFlag: sku.activeFlag,
    userDefinedPriceFlag: sku.userDefinedPriceFlag,
    ...(sku.imageFile !== undefined ? { imageFile: sku.imageFile } : {}),
  };

  return response;
}

/**
 * Projects a collection of SKUs, preserving order and cardinality exactly.
 */
function toSkuResponses(skus: readonly Sku[]): readonly SkuResponse[] {
  return skus.map(toSkuResponse);
}

/**
 * Projects a smart list page, carrying its five paging numbers across untouched.
 */
function toSkuSmartListResponse(result: SmartListResult<Sku>): SkuSmartListResponse {
  /*
   * Each SKU is projected once, not once per collection it appears in. `pageRecords` is a
   * window over `records` — `../adapters/mysql/SmartListQueryBuilder` derives both from one selection —
   * so projecting the two collections independently built a second, identical `SkuResponse` for every
   * SKU inside the current page and threw one of the two away. The memo below is filled on first
   * encounter and read on every later one.
   */
  const projectionBySku = new Map<Sku, SkuResponse>();
  const project = (sku: Sku): SkuResponse => {
    const remembered = projectionBySku.get(sku);

    if (remembered !== undefined) {
      return remembered;
    }

    const projection = toSkuResponse(sku);
    projectionBySku.set(sku, projection);
    return projection;
  };

  return {
    records: result.records.map(project),
    pageRecords: result.pageRecords.map(project),
    recordsCount: result.recordsCount,
    pageRecordsStart: result.pageRecordsStart,
    pageRecordsEnd: result.pageRecordsEnd,
    currentPage: result.currentPage,
    totalPages: result.totalPages,
  };
}

/* The factory. */

/**
 * Builds the routed SKU boundary over an already-constructed service.
 *
 * @param skuService - The SKU service to delegate to, narrowed to the nine members this boundary reads
 * or processes through. A full service instance satisfies it, and so does an object literal —
 * which is what makes every member below assertable without a repository, a database, a network
 * call or an AWS runtime, in a repository that vendors no mocking library (AAP §0.4.3.6).
 *
 * @example
 * ```ts
 * // In router.ts, which owns every route:
 * ```
 */
export function createSkuHandler(
  skuService: RoutedSkuSurface,
  resolveProduct: ProductResolver,
  resolveAuthorization: InvocationSecurityResolver,
  writeRunner: TransactionalWriteRunner<SkuWriteGraph>,
): SkuHandler {
  /**
   * Runs the gate `setupRequest()` [org/Hibachi/Hibachi.cfc:L188] ran, for one routed member.
   *
   */
  const refuseUnauthorized = (
    event: SkuAuthorizationEvent,
    member: keyof SkuHandler,
    entityID?: string,
  ): SkuAuthorizationOutcome => {
    const requirement: SkuAccessRequirement = SKU_ACCESS_MATRIX[member];

    /*
     * — one resolution, carrying the whole question: the routed action, the single
     * operation attempted, the entity from this file's own constants, and the addressed identifier when
     * the route addresses one. Still exactly once per invocation, including for the row that also asks a
     * subordinate question below.
     */
    const authorization: RequestAuthorizationContext = resolveAuthorization(
      toInvocationSecurityRequest(event, {
        action: `${SKU_ACTION_PREFIX}${member}`,
        crudType: requirement.crudType,
        entityName: requirement.entityName,
        ...(entityID === undefined ? {} : { entityID }),
      }),
    );
    const account = authorization.accountContext.getCurrentAccount();

    // Steps 1 and 2. `newFlag` is `isNew()`, so true means "not logged in".
    if (account === undefined || account.newFlag) {
      return { refusal: unauthorizedResponse() };
    }

    /*
     * Step 3 — the row's single primary question. The addressed identifier travels with it
     * so a deployment may scope the grant to the row being acted on.
     */
    if (
      !authorization.entityAuthorization.authenticateEntity({
        crudType: requirement.crudType,
        entityName: requirement.entityName,
        ...(entityID === undefined ? {} : { entityID }),
      })
    ) {
      return { refusal: forbiddenResponse() };
    }

    /*
     * Step 4 —'s subordinate question, a conjunction with step 3. asked of the same resolved
     * context, so the resolver is still invoked once. The addressed identifier is deliberately not
     * forwarded: it identifies the product, and attaching it to a question about `Sku` would tell a
     * resolver something untrue.
     */
    if (
      requirement.subordinate !== undefined &&
      !authorization.entityAuthorization.authenticateEntity({
        crudType: requirement.subordinate.crudType,
        entityName: requirement.subordinate.entityName,
      })
    ) {
      return { refusal: forbiddenResponse() };
    }

    /* The authorised context is returned, not discarded —; see ./productHandler's gate. */
    return { authorization };
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L58]
   * `public boolean function createSkus(required any product, required struct data )`.
   */
  const createSkus = async (event: CreateSkusEvent): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed product is read first so the gate asks about the operation
     * actually performed (an UPDATE of that product, plus the SKU creations under it) and can name
     * the row it is performed on. Nothing is done with it until after the refusal.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(event, 'createSkus', productID);

    if (refusal !== undefined) {
      return refusal;
    }

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    /* The batch runs inside one transaction, through the boundary-scoped service rather than the captured one. */
    let batchProduct: ProductWithErrorState | null = null;

    /*
     * Read through a function, not directly, and the reason is type-system rather than stylistic.
     * `batchProduct` is assigned only inside the work callback, so at the `catch` below the compiler's
     * control-flow analysis still holds the initialiser's `null` and narrows any direct test against it
     * to `never`. Reading it through a function body — where the declared type applies rather than the
     * narrowed one — recovers the real type with no cast and no assertion, which is what the strict
     * settings this package pins are there to force.
     */
    const capturedBatch = (): ProductWithErrorState | null => batchProduct;

    try {
      const created: boolean | null = await writeRunner.runWrite(
        /*
         * — the gate's own context, so the SKU inserts, their property population and their
         * audit stamps all run as the principal this route just authorised.
         */
        authorization,
        async (graph: SkuWriteGraph): Promise<boolean | null> => {
          /*
           * Read through the transaction's scope, never the captured resolver — see {@link SkuWriteGraph}
           * for why the sibling set the uniqueness rule observes depends on it (M6).
           */
          const product = await graph.resolveProduct(productID);

          if (product === null) {
            /*
             * A missing product is not a failed batch. Nothing has been written, so the gate below finds
             * no findings and the empty transaction commits; the 404 is shaped after it returns.
             */
            return null;
          }

          batchProduct = product;

          /*
           * M6: `body.value` is passed straight through. Do not interpose a transformation here — see the
           * warning above this member. Judgment (n): the boolean is serialised exactly as returned.
           */
          return graph.skuService.createSkus(product, body.value);
        },
        /*
         * The complete predicate, not `product.hasErrors()`. `skuBatchHasErrors` reads the product's bag
         * and every SKU's, because per-SKU rule findings deliberately never merge upward — its own contract
         * carries the full reasoning. Narrowing this to the product alone would silently reinstate exactly
         * the defect above for the commonest failure there is: a batch whose SKU codes collide.
         */
        () => batchProduct !== null && skuBatchHasErrors(batchProduct),
      );

      return created === null ? notFoundResponse() : okResponse(created);
    } catch (error) {
      /*
       * The error surface is asymmetric and both halves converge here. When the gate reports findings
       * the boundary rejects, because declining to commit is the only way a boundary can express the
       * legacy's "settled as a rollback" branch — but the findings themselves live on the product, not
       * on the rejection. They are lifted into a ../errors/ValidationError so a caller sees the keys the
       * rule sets declare, copied unchanged as AAP §0.4.1.11 requires. Any other rejection, including
       * the fallthrough `throw("There was an unexpected error when creating this product")` at
       * [model/service/SkuService.cfc:L204], travels out untouched with its message preserved.
       */
      const failedBatch = capturedBatch();

      if (failedBatch !== null && skuBatchHasErrors(failedBatch)) {
        const failure = new ValidationError();

        /*
         * The complete bag, matching the complete gate. `skuBatchHasErrors` above refuses on a finding
         * that lives on a SKU rather than on the product, so lifting `failedBatch.getErrors()` alone
         * would publish an empty `errors` member for exactly that case — a refusal with nothing said
         * about what was refused. The collector merges the product's bag with every SKU's.
         */
        failure.addErrors(collectSkuBatchErrors(failedBatch));

        return errorResponse(failure);
      }

      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L210]
   * `public any function processImageUpload(required any Sku, required struct imageUploadResult)`.
   */
  const processImageUpload = async (
    event: ProcessImageUploadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'processImageUpload');

    if (refusal !== undefined) {
      return refusal;
    }

    const skuCode: string | undefined = readSkuCode(event);

    if (skuCode === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SKU_CODE_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      // Judgment (j): the contract takes the entity, so the addressed code is resolved first.
      const sku: Sku | null = await skuService.getSkuBySkuCode(skuCode);

      if (sku === null) {
        return notFoundResponse();
      }

      /*
       * The verdict is the answer, raw. [model/service/SkuService.cfc:L213-L217] contains exactly two
       * returns, `return true;` and `return false;`, so the boolean is the member's observable value and
       * this boundary publishes it unwrapped — no envelope, no `{ saved: … }` object and no status
       * substitution, none of which the legacy has any counterpart for (AAP §0.7.3). ./httpResponse
       * serialises a bare boolean exactly as it serialises a projected entity.
       */
      return okResponse(await skuService.processImageUpload(sku, body.value));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L220]
   * `public array function getProductSkus(required any product, required boolean sorted, boolean
   * fetchOptions=false)`.
   *
   * TODO(parity) D13 — a sorted request can fail, and the failure is preserved unguarded.
   * [:L234-L238] computes `var index = arrayFind(sortedArray, skuID)` and assigns
   * `sortedArrayReturn[index] = skus[i]`. `arrayFind` answers 0 on a miss and CFML arrays are one-based,
   * so position 0 does not exist and the assignment throws. AAP §0.6.7.4 records why the miss is
   * reachable rather than hypothetical: `getSortedProductSkusID` [model/dao/SkuDAO.cfc:L172] returns
   * only option-bearing SKUs, so an option-less SKU in the collection is absent from the sorted list.
   *
   */
  const getProductSkus = async (event: ProductSkusEvent): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getProductSkus');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    /*
     * Discrepancy 2: `sorted` is required, so absence is refused rather than defaulted. The reader's
     * three states are all distinguished — see {@link readCfmlBoolean}.
     */
    const sorted: boolean | null | undefined = readCfmlBoolean(event, SORTED_QUERY_PARAMETER);

    if (sorted === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SORTED_REQUIRED_MESSAGE);
    }

    if (sorted === null) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SORTED_NOT_BOOLEAN_MESSAGE);
    }

    const fetchOptions: boolean | null | undefined = readCfmlBoolean(
      event,
      FETCH_OPTIONS_QUERY_PARAMETER,
    );

    /*
     * Present but unrecognised is refused; absent is forwarded as absence, so the service's own
     * `fetchOptions = false` default at [:L220] remains the single place that default lives.
     */
    if (fetchOptions === null) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, FETCH_OPTIONS_NOT_BOOLEAN_MESSAGE);
    }

    try {
      const product = await resolveProduct(productID);

      if (product === null) {
        return notFoundResponse();
      }

      /*
       * D13: nothing here guards the sorted path. Two call shapes rather than one, so that omitting
       * `fetchOptions` really omits the argument instead of supplying a value on the legacy's behalf.
       */
      const skus =
        fetchOptions === undefined
          ? await skuService.getProductSkus(product, sorted)
          : await skuService.getProductSkus(product, sorted, fetchOptions);

      return okResponse(toSkuResponses(skus));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L246]
   * `public array function getSortedProductSkus(required any product)`.
   *
   * TODO(parity) D13 — it carries the same unguarded index-zero failure at [:L262-L266], for the same
   * reason and with the same treatment as the sibling member: no guard, no skip, no filter, no fallback,
   * no pre-check. Judgment (d) records the full account once.
   */
  const getSortedProductSkus = async (
    event: SortedProductSkusEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getSortedProductSkus');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const product = await resolveProduct(productID);

      if (product === null) {
        return notFoundResponse();
      }

      // D13: unguarded, deliberately. Judgment (d).
      return okResponse(toSkuResponses(await skuService.getSortedProductSkus(product)));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L271]
   * `public any function searchSkusByProductType(string term,string productTypeID)`.
   */
  const searchSkusByProductType = async (
    event: SearchSkusEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'searchSkusByProductType');

    if (refusal !== undefined) {
      return refusal;
    }

    /*
     * Both optional (Discrepancy 3): read, and forward whatever came — including nothing. Values are
     * not trimmed, case-folded or wildcard-wrapped here; the repository owns the term's treatment.
     */
    const term: string | undefined = readQueryStringParameter(event, TERM_QUERY_PARAMETER);
    const productTypeID: string | undefined = readQueryStringParameter(
      event,
      PRODUCT_TYPE_ID_QUERY_PARAMETER,
    );

    try {
      // Judgment (f): singular `productTypeID`, second, exactly as [:L271] declares it.
      return okResponse(await skuService.searchSkusByProductType(term, productTypeID));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L281]
   * `public boolean function getSkuStocksDeletableFlag( required string skuID )`.
   *
   * TODO(parity) D4 — this route can never succeed, and it says so instead of pretending.
   * [:L282] forwards to `getSkuDAO().getSkuStocksDeletableFlag(...)`, and that DAO member is declared
   * nowhere in the legacy repository — model/dao/SkuDAO.cfc declares six public members and none of them
   * is it — so the only legacy path that reaches it, `Sku.getStocksDeletableFlag()`
   * [model/entity/Sku.cfc:L567-L572], has never been able to resolve. ../services/SkuService therefore
   * returns a rejected promise carrying a not-implemented failure, which AAP §0.4.2.2 requires: the member
   * is ported "as an explicit not-implemented boundary that documents the defect".
   */
  const getSkuStocksDeletableFlag = async (
    event: SkuIdentifierEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getSkuStocksDeletableFlag');

    if (refusal !== undefined) {
      return refusal;
    }

    const skuID: string | undefined = readSkuIdentifier(event);

    if (skuID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SKU_ID_REQUIRED_MESSAGE);
    }

    try {
      /*
       * D4: the service's promise always rejects, so control always leaves through the catch below and
       * the not-implemented failure reaches the caller intact. Nothing is substituted for it.
       */
      return okResponse(await skuService.getSkuStocksDeletableFlag(skuID));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L285]
   * `public boolean function getTransactionExistsFlag`.
   *
   */
  const getTransactionExistsFlag = async (
    event: TransactionExistsEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getTransactionExistsFlag');

    if (refusal !== undefined) {
      return refusal;
    }

    /*
     * Both optional, both forwarded as received — including as nothing. Judgment (h): an argument the
     * legacy declares without `required` is forwarded absent rather than refused here.
     */
    const skuID: string | undefined = readTransactionScopeIdentifier(event, SKU_ID_QUERY_PARAMETER);
    const productID: string | undefined = readTransactionScopeIdentifier(
      event,
      PRODUCT_ID_QUERY_PARAMETER,
    );

    try {
      /*
       * SKU-first, matching ../services/SkuService's own parameter order. The single crossing onto the
       * repository's product-first order happens inside that service, not here.
       */
      return okResponse(await skuService.getTransactionExistsFlag(skuID, productID));
    } catch (error) {
      /*
       * An unscoped probe lands here, carrying the repository's own refusal. It is shaped like any other
       * service failure — deliberately not reclassified into a fixed status, because the failure belongs
       * to the legacy [model/dao/SkuDAO.cfc:L90] rather than to this boundary.
       */
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L289]
   * `public any function getSkuBySkuCode( string skuCode )`.
   */
  const getSkuBySkuCode = async (event: SkuCodeEvent): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getSkuBySkuCode');

    if (refusal !== undefined) {
      return refusal;
    }

    /*
     * `readSkuCode` reports only genuine absence; an empty code is a value, not a sentinel. Both are
     * forwarded, because [:L289] declares the argument without `required`.
     */
    const skuCode: string | undefined = readSkuCode(event);

    try {
      /*
       * No precheck. `undefined` is forwarded, and the service's own `DomainError` — raised at the point
       * [model/dao/SkuDAO.cfc:L102]'s `required` fails in the legacy — is what answers. See the section
       * above for why this boundary authors no 400 of its own.
       */
      const sku: Sku | null = await skuService.getSkuBySkuCode(skuCode);

      // A miss stays a miss. Projected, never serialised whole; see {@link SkuResponse}.
      return sku === null ? notFoundResponse() : okResponse(toSkuResponse(sku));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L309]
   * `public any function getSkuSmartList(struct data={}, currentURL="")`.
   */
  const getSkuSmartList = async (event: SkuSmartListEvent): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getSkuSmartList');

    if (refusal !== undefined) {
      return refusal;
    }

    // Judgment (l): the recognised subset of the query string, and nothing invented.
    const data: SmartListInput = readSmartListInput(event);

    try {
      // `currentURL` omitted deliberately; see the note above. The page is projected, never whole.
      return okResponse(toSkuSmartListResponse(await skuService.getSkuSmartList(data)));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /*
   * Frozen, and exactly nine members. `newSku` is declared on {@link SkuSurface} and deliberately not
   * published here — {@link SkuHandler} records the three pieces of evidence for that, and because the
   * returned object is typed as that interface, router.ts has no member to mount even by accident. There
   * is no `countSku*`, `listSku*`, `exportSku*` or compound reader either: AAP §0.4.2.5 reproduces
   * synthesis "only where used", and the slice uses none of them.
   */
  return Object.freeze({
    createSkus,
    processImageUpload,
    getProductSkus,
    getSortedProductSkus,
    searchSkusByProductType,
    getSkuStocksDeletableFlag,
    getTransactionExistsFlag,
    getSkuBySkuCode,
    getSkuSmartList,
  });
}

/* The Lambda entry point. */

/** The actions this entry point serves, in the legacy `slatAction` vocabulary. */
export type SkuRouteKey =
  | 'sku.createSkus'
  | 'sku.processImageUpload'
  | 'sku.getProductSkus'
  | 'sku.getSortedProductSkus'
  | 'sku.searchSkusByProductType'
  | 'sku.getSkuStocksDeletableFlag'
  | 'sku.getTransactionExistsFlag'
  | 'sku.getSkuBySkuCode'
  | 'sku.getSkuSmartList';

/**
 * Builds the SKU handler from the composition root.
 *
 * @param container the memoized service graph
 * @param resolveAuthorization the per-invocation authorisation resolver. Defaults to
 * `./httpResponse.ts`'s registered-resolver reader — the deployment's resolver when one is
 * registered, the constant deny-all context otherwise, so the default remains fail-closed.
 */
export function createSkuHandlerFromContainer(
  container: Pick<CatalogContainer, 'skuService' | 'skuWriteRunner'> & {
    /*
     * One product member, not the service. `../config/container.ts`'s folded sku-surface section records why the narrow
     * aggregate read it supplies is the same statement `productService.getProduct` compiles.
     */
    readonly productService: Pick<CatalogContainer['productService'], 'getProduct'>;
  },
  resolveAuthorization: InvocationSecurityResolver = resolveRequestAuthorization,
): SkuHandler {
  return createSkuHandler(
    container.skuService,
    (productID: string) => container.productService.getProduct(productID),
    resolveAuthorization,
    container.skuWriteRunner,
  );
}

/**
 * Maps each served action name onto the member that answers it.
 */
export function createSkuRoutes(handlers: SkuHandler): ActionRouteTable<SkuRouteKey> {
  /*
   * The literal is annotated before it is frozen, and the order is load-bearing. `object.freeze` takes
   * the literal through a generic parameter, which loses its freshness and with it TypeScript's
   * excess-property check — a route name not declared in the union above would then compile silently. A
   * first draft did exactly that and was caught by adding an undeclared key and watching it pass.
   * Annotating this binding restores the check in both directions: an undeclared key is rejected here,
   * and a declared key with no entry is reported as missing.
   */
  const routes: Record<SkuRouteKey, ActionRoute> = {
    'sku.createSkus': (event: APIGatewayProxyEvent) => handlers.createSkus(event),
    'sku.processImageUpload': (event: APIGatewayProxyEvent) => handlers.processImageUpload(event),
    'sku.getProductSkus': (event: APIGatewayProxyEvent) => handlers.getProductSkus(event),
    'sku.getSortedProductSkus': (event: APIGatewayProxyEvent) =>
      handlers.getSortedProductSkus(event),
    'sku.searchSkusByProductType': (event: APIGatewayProxyEvent) =>
      handlers.searchSkusByProductType(event),
    'sku.getSkuStocksDeletableFlag': (event: APIGatewayProxyEvent) =>
      handlers.getSkuStocksDeletableFlag(event),
    'sku.getTransactionExistsFlag': (event: APIGatewayProxyEvent) =>
      handlers.getTransactionExistsFlag(event),
    'sku.getSkuBySkuCode': (event: APIGatewayProxyEvent) => handlers.getSkuBySkuCode(event),
    'sku.getSkuSmartList': (event: APIGatewayProxyEvent) => handlers.getSkuSmartList(event),
  };

  return Object.freeze(routes);
}

/** The dispatcher, built once per container and reused for every later invocation. */
let dispatchSkuAction: ActionRoute | undefined;

/**
 * The shape `../config/container`'s `getSkuSurfaceGraph` publishes, used to type the deferred require inside
 * {@link handler}.
 */
type SkuSurfaceModule = typeof import('../config/container');

/**
 * The Lambda entry point for the SKU surface.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (dispatchSkuAction === undefined) {
      /*
       * A deferred CommonJS `require`, deliberately not a dynamic `import`. The difference was
       * measured, not assumed, and it decided this line.
       */
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see above.
      const { getSkuSurfaceGraph } = require('../config/container') as SkuSurfaceModule;
      const container = getSkuSurfaceGraph();

      dispatchSkuAction = createActionDispatcher<SkuRouteKey>({
        routes: createSkuRoutes(createSkuHandlerFromContainer(container)),
        beginInvocation: () => {
          container.beginInvocation();
        },
      });
    }

    return await dispatchSkuAction(event);
  } catch (error: unknown) {
    return errorResponse(error);
  }
};

/** Compile-time proof that the export above satisfies the runtime's handler contract. */
type _SkuHandlerSatisfiesLambdaContract = AssertAssignable<typeof handler, APIGatewayProxyHandler>;

/* The deployment registration seam, re-exported so it is reachable from the packaged artifact. */

/*
 * This artifact serves the gated SKU surface, so a deployment that mounts `handler` above — rather than
 * `./router.ts`'s aggregate — needs the registration seam on this module. Every SKU route is gated,
 * including the creation route that owns AAP §0.6.2's read-back ordering, so without a registered
 * resolver this artifact answers `401` and nothing else.
 */
/*
 * Why a re-export is necessary and not merely tidy. `registerRequestAuthorizationResolver` is declared
 * in `./httpResponse.ts` §8.1, which is not a build entry point — `build/esbuild.mjs` lists it under
 * `NON_ENTRY_HANDLER_MODULES` precisely because it is a shared helper. esbuild therefore inlines it into
 * every entry it bundles, and an inlined module's exports do not survive: a deployment that requires the
 * emitted artifact sees only what the entry module exports. Measured before this block existed,
 * `Object.keys(require('./dist/handlers/router.js'))` was exactly `['createRouter', 'handler']`, and the
 * registration function appeared nowhere in any of the five gated bundles.
 */
export { registerRequestAuthorizationResolver } from './httpResponse';

export type { CatalogAuthorizationRequest, CatalogAuthorizationResolver } from './httpResponse';
