/**
 * productHandler — the AWS boundary for the extracted Catalog Product surface.
 *
 * Authority: AAP §0.4.1.9 row 2 — "`slatwall-ts/src/handlers/productHandler.ts` | create |
 * `model/service/ProductService.cfc` | Exposes the product surface; **M1** flagged for the importer
 * entry point." §0.3.1's tree states the same thing more briefly: `productHandler.ts <- ProductService
 * public surface`. The member surface is fixed by AAP §0.4.2.1 (the fifteen declared members) and
 * AAP §0.4.2.5 (the three synthesized members the slice actually uses).
 *
 * What this file is
 * Each routed member below narrows the proxy event, calls one service member, and shapes the outcome
 * through ./httpResponse (AAP §0.3.2, quoting AWS's own reference layout: "the handler responsible
 * only for translating AWS-specific input into domain calls"). There is no query, no combination
 * enumeration, no validation rule, no field mapping and no SQL anywhere in this file, because every
 * one of those belongs to a layer beneath it.
 */

import type { CatalogContainer } from '../config/container';
import type { Product } from '../domain/product/Product';
/* Two error types are constructed in this file, and neither is mapped here. */
import { NotImplementedError } from '../errors/DomainError';
import { ValidationError } from '../errors/ValidationError';
import type { ProductType } from '../domain/product/ProductType';
import type { ProductAddOption } from '../domain/process/ProductAddOption';
import type { ProductAddOptionGroup } from '../domain/process/ProductAddOptionGroup';
import type { ProductUpdateSkus } from '../domain/process/ProductUpdateSkus';
import type { Sku } from '../domain/sku/Sku';
import type { ExactDecimal } from '../util/formatting';
import type {
  EntityCrudType,
  HandlerAccessClassification,
  InvocationSecurityResolver,
  RequestAuthorizationContext,
} from '../ports/AccountContextPort';
import type { SmartListInput, SmartListResult } from '../ports/SmartListQueryPort';
import type { TransactionalWriteRunner } from '../config/container';
import type { SelectOption } from '../services/OptionService';
import type {
  FormattedOptionGroups,
  ProductService,
  ProductTypeWithErrorState,
} from '../services/ProductService';
/* The one value import from a sibling service, and it is the commit gate. */
import { collectSkuBatchErrors, skuBatchHasErrors } from '../services/SkuService';
import type { ProductWithErrorState } from '../services/SkuService';

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

/* Request parameter names. */

/** The addressed product's primary identifier — `model/entity/Product.cfc:L52`. */
const PRODUCT_ID_PATH_PARAMETER = 'productID';

/** The addressed product type's primary identifier — `model/entity/ProductType.cfc:L52`. */
const PRODUCT_TYPE_ID_PATH_PARAMETER = 'productTypeID';

/** The selected option identifiers, as the legacy's own delimited list. */
const SELECTED_OPTIONS_QUERY_PARAMETER = 'selectedOptions';

/**
 * The importer's source location — `model/service/ProductService.cfc:L65` argument 1, `required`.
 */
const FILE_URL_QUERY_PARAMETER = 'fileURL';

/**
 * The importer's text qualifier — `model/service/ProductService.cfc:L65` argument 2, optional with a
 * default of the empty string.
 */
const TEXT_QUALIFIER_QUERY_PARAMETER = 'textQualifier';

/* Sentinels and entity names. */

/** The identifier value that identifies nothing. */
const UNSAVED_IDENTIFIER = '';

/** The entity name the authorisation gate asks about for product operations. */
const PRODUCT_ENTITY_NAME = 'Product';

/** The entity name the gate asks about for product-type operations. */
const PRODUCT_TYPE_ENTITY_NAME = 'ProductType';

/**
 * The prefix every routed product action carries, so the resolver is told which action it is gating.
 */
const PRODUCT_ACTION_PREFIX = 'product.';

/** What the gate answers: either the refusal to return, or the authorised invocation context. */
type ProductAuthorizationOutcome =
  | { readonly refusal: APIGatewayProxyResult; readonly authorization?: undefined }
  | { readonly refusal?: undefined; readonly authorization: RequestAuthorizationContext };

/** The entity name the gate asks about for the one member that reads SKUs. */
const SKU_ENTITY_NAME = 'Sku';

/* There is deliberately no list-delimiter constant in this file. */

/* The smart-list data vocabulary is not declared here. */

/* Process-object payload keys. */

/** `model/process/Product_AddOptionGroup.cfc:L55` — the option group identifier, a string. */
const OPTION_GROUP_DATA_KEY = 'optionGroup';

/** `model/process/Product_AddOption.cfc:L55` — the option identifier, a string. */
const OPTION_DATA_KEY = 'option';

/**
 * `model/process/Product_UpdateSkus.cfc:L55` — the first of two interleaved flag-and-value pairs.
 */
const UPDATE_PRICE_FLAG_DATA_KEY = 'updatePriceFlag';

/** `model/process/Product_UpdateSkus.cfc:L56`, resource-bundle key `entity.sku.price`. */
const PRICE_DATA_KEY = 'price';

/**
 * `model/process/Product_UpdateSkus.cfc:L57` — the second flag, gating its own condition independently.
 */
const UPDATE_LIST_PRICE_FLAG_DATA_KEY = 'updateListPriceFlag';

/** `model/process/Product_UpdateSkus.cfc:L58`, resource-bundle key `entity.sku.listPrice`. */
const LIST_PRICE_DATA_KEY = 'listPrice';

/* Bad-request texts. */

const PRODUCT_ID_REQUIRED_MESSAGE = `A "${PRODUCT_ID_PATH_PARAMETER}" path parameter is required`;

const PRODUCT_TYPE_ID_REQUIRED_MESSAGE = `A "${PRODUCT_TYPE_ID_PATH_PARAMETER}" path parameter is required`;

const SELECTED_OPTIONS_REQUIRED_MESSAGE = `A "${SELECTED_OPTIONS_QUERY_PARAMETER}" query parameter is required`;

const FILE_URL_REQUIRED_MESSAGE = `A "${FILE_URL_QUERY_PARAMETER}" query parameter is required`;

/*
 * The three routes a JSON payload cannot satisfy — an explicit boundary, not a deterministic 500.
 */

/**
 * Builds the refusal for a route whose process-object collaborators are outside this slice.
 *
 * @param member the routed member being refused, recorded in the error's own context for the server-side
 * diagnostic only — ./httpResponse publishes a neutral text and never the name (AAP §0.8.3.9)
 */
function refuseUnsatisfiableProcessObject(
  member: keyof ProductHandler,
  locator: string,
): NotImplementedError {
  return new NotImplementedError(
    `ProductService.${member}`,
    'it requires a legacy process object exposing callable accessors, which a JSON payload cannot ' +
      'carry and no in-scope collaborator can construct',
    { context: { locator } },
  );
}

/* The injected service seam. */

/**
 * The eighteen product-service members this boundary depends on — the parity contract, in one place.
 */
export interface ProductHandlerService {
  /* ---- The fifteen declared members, in legacy declaration order (AAP §0.4.2.1) ----. */

  /**
   * `model/service/ProductService.cfc:L65` —
   * `public void function loadDataFromFile(required string fileURL, string textQualifier = "")`.
   */
  readonly loadDataFromFile: (fileURL: string, textQualifier?: string) => Promise<void>;

  /**
   * `model/service/ProductService.cfc:L70` — `public any function getFormattedOptionGroups(required any
   * product)`.
   */
  readonly getFormattedOptionGroups: (product: Product) => Promise<FormattedOptionGroups>;

  /**
   * `model/service/ProductService.cfc:L104` —
   * `public any function getProductSkusBySelectedOptions(required string selectedOptions, required string
   * productID)`.
   */
  readonly getProductSkusBySelectedOptions: (
    selectedOptions: string,
    productID: string,
  ) => Promise<Sku[]>;

  /**
   * `model/service/ProductService.cfc:L113` — was `processProduct_addOptionGroup(required any product,
   * required any processObject)`. Judgment (c) records the renaming.
   */
  readonly processProductAddOptionGroup: (
    product: Product,
    processObject: ProductAddOptionGroup,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L128` — was `processProduct_addOption(required any product,
   * required any processObject)`.
   */
  readonly processProductAddOption: (
    product: Product,
    processObject: ProductAddOption,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L157` — was `processProduct_addProductReview(required any product,
   * required any processObject)`. boundary-stubbed: the product-review entity and the account context are
   * both outside the slice, so the service narrows the process object structurally and the parameter is
   * `unknown` rather than a typed process object.
   */
  readonly processProductAddProductReview: (
    product: Product,
    processObject: unknown,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L173` — was `processProduct_addSubscriptionTerm(required any
   * product, required any processObject)`. BOUNDARY-STUBBED behind `SubscriptionTermPort`, and the member
   * that carries defect D6.
   */
  readonly processProductAddSubscriptionTerm: (
    product: Product,
    processObject: unknown,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L198` — was `processProduct_deleteDefaultImage(required any
   * product, required struct data)`. conditionally boundary-limited: the file-system delete at
   * [:L200-L201] is outside the slice, but [:L199]'s absent-key path is a legitimate no-op that answers the
   * product.
   */
  readonly processProductDeleteDefaultImage: (
    product: Product,
    data: Record<string, unknown>,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L208` — was `processProduct_updateDefaultImageFileNames( required
   * any product )`. fully ported despite AAP §0.4.2.1's "Boundary-stubbed" annotation: [:L209-L211] reaches
   * only `SettingResolverPort`, which is in scope. One argument only — it is the single
   * process member that takes no payload at all, and no second argument is added to make it uniform with
   * its siblings.
   */
  readonly processProductUpdateDefaultImageFileNames: (product: Product) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L216` — was `processProduct_updateSkus(required any product,
   * required any processObject)`. fully ported, and the one process member with its own validation rule
   * set (`model/validation/Product_UpdateSkus.json`, two conditional groups keyed on the flags).
   */
  readonly processProductUpdateSkus: (
    product: Product,
    processObject: ProductUpdateSkus,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L235` — was `processProduct_uploadDefaultImage(required any
   * product, required any processObject)`. boundary-stubbed: the temp directory and the tag service.
   */
  readonly processProductUploadDefaultImage: (
    product: Product,
    processObject: unknown,
  ) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L264` — `public any function saveProduct(required any product,
   * required struct data)`. Entity FIRST, payload SECOND, both `required`.
   */
  readonly saveProduct: (product: Product, data: Record<string, unknown>) => Promise<Product>;

  /**
   * `model/service/ProductService.cfc:L294` — `public any function saveProductType(required any
   * productType, required struct data)`.
   */
  readonly saveProductType: (
    productType: ProductType,
    data: Record<string, unknown>,
  ) => Promise<ProductTypeWithErrorState>;

  /**
   * `model/service/ProductService.cfc:L317` — `public boolean function deleteProduct(required any
   * product)`. A boolean, and it is reported as one.
   */
  readonly deleteProduct: (product: Product) => Promise<boolean>;

  /**
   * `model/service/ProductService.cfc:L342` — `public any function getProductSmartList(struct data={},
   * currentURL="")`.
   */
  readonly getProductSmartList: (
    data?: SmartListInput,
    currentURL?: string,
  ) => Promise<SmartListResult<Product>>;

  /* ---- The three IR-1 synthesized members (AAP §0.4.2.5) ----. */

  /**
   * The `new` prefix branch [org/Hibachi/HibachiService.cfc:L264-L265]. No source declaration exists.
   */
  readonly newProduct: () => Product;

  /**
   * The `get` prefix branch [org/Hibachi/HibachiService.cfc:L258], whose handler reads the identifier as
   * positional argument 1 at [:L325]. AAP §0.4.2.5 declares the target as
   * `getProduct(productID: string): Promise<Product | null>`.
   */
  readonly getProduct: (productID: string) => Promise<Product | null>;

  /**
   * The same `get` branch, for the product type. AAP §0.4.2.5 declares the target as
   * `getProductType(productTypeID: string): Promise<ProductType | null>`, and
   * [model/service/ProductService.cfc]'s own save path is one of its legacy call sites.
   */
  readonly getProductType: (productTypeID: string) => Promise<ProductType | null>;
}

/**
 * Compile-time assertion helper: resolves to `TActual` when it is assignable to `TExpected`, and fails the
 * build otherwise. Type-only, so it contributes nothing to the bundle. The same helper
 * ./services/ProductService and ./brandHandler use for their own guards, spelled identically so the
 * pattern is recognisable across the subtree.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * The parity guard — the real `ProductService` really does satisfy {@link ProductHandlerService}.
 */
type _ProductServiceSatisfiesProductHandlerService = AssertAssignable<
  ProductService,
  ProductHandlerService
>;

/** The transaction-scoped capabilities a write route is allowed to reach. */
export type ProductWriteGraph = Pick<
  ProductHandlerService,
  | 'newProduct'
  | 'getProduct'
  | 'getProductType'
  | 'processProductAddOptionGroup'
  | 'processProductAddOption'
  | 'processProductAddProductReview'
  | 'processProductAddSubscriptionTerm'
  | 'processProductDeleteDefaultImage'
  | 'processProductUpdateDefaultImageFileNames'
  | 'processProductUpdateSkus'
  | 'processProductUploadDefaultImage'
  | 'saveProduct'
  | 'saveProductType'
  | 'deleteProduct'
>;

/* Event slices. */

/** The slice the authorisation gate itself reads. Every event slice below is assignable to it. */
export type ProductAuthorizationEvent = CatalogAuthorizationEvent;

/** A route that addresses one product by identifier and reads no payload. */
export type ProductIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/** A route that addresses one product and carries a JSON payload. */
export type ProductPayloadEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'headers'>;

/** The product save route — an optional identifier plus a payload. */
export type ProductSaveEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'headers'>;

/** A route that addresses one product type by identifier and carries a JSON payload. */
export type ProductTypePayloadEvent = Pick<
  APIGatewayProxyEvent,
  'body' | 'pathParameters' | 'headers'
>;

/** A route that addresses one product type by identifier and reads no payload. */
export type ProductTypeIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The option-to-SKU resolution route — a product identifier in the path, the selected options in the
 * query string.
 */
export type SelectedOptionsEvent = Pick<
  APIGatewayProxyEvent,
  'pathParameters' | 'queryStringParameters' | 'headers'
>;

/** The importer route — both of its arguments arrive in the query string. */
export type LoadDataFromFileEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters' | 'headers'>;

/** The smart list route — the recognised query-string vocabulary, and nothing else. */
export type ProductSmartListEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters' | 'headers'>;

/** The `newProduct` route reads nothing but the headers the gate needs. */
export type NewProductEvent = Pick<APIGatewayProxyEvent, 'headers'>;

/* Response contracts. */

/** The minimal representation of a product a route returns. */
export interface ProductResponse {
  readonly productID: string;
  readonly activeFlag?: boolean;
  readonly urlTitle?: string;
  readonly productName?: string;
  readonly productCode?: string;
  readonly productDescription?: string;
  readonly publishedFlag?: boolean;
  readonly sortOrder?: number;
  /*
   * Exact decimal, so it serializes as a JSON string rather than a number, and that is deliberate.
   * `Product.calculatedSalePrice` is an `ExactDecimal` — the stored digits at the stored scale — because
   * `SwProduct.calculatedSalePrice` holds values no IEEE 754 double can represent exactly. Coercing
   * it to `number` here would reintroduce, at the very last step, the precision loss the domain type
   * exists to prevent, and would do it silently. There is no parity cost: the legacy exposes no JSON
   * response for this entity at all — `index.cfm` and the FW/1 `slatAction` convention render views — so
   * this shape owes nothing to a legacy counterpart and is free to be the correct one.
   */
  readonly calculatedSalePrice?: ExactDecimal;
  readonly calculatedQATS?: number;
  readonly calculatedAllowBackorderFlag?: boolean;
  readonly calculatedTitle?: string;
  readonly brandID?: string;
  readonly productTypeID?: string;
}

/** The minimal representation of a product type a route returns. */
export interface ProductTypeResponse {
  readonly productTypeID: string;
  readonly productTypeIDPath?: string;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
  readonly urlTitle?: string;
  readonly productTypeName?: string;
  readonly productTypeDescription?: string;
  readonly systemCode?: string;
  readonly parentProductTypeID?: string;
}

/** The minimal representation of a SKU the one SKU-returning product route emits. */
export interface ProductSkuResponse {
  readonly skuID: string;
  readonly skuCode?: string;
  /*
   * The three monetary members are `ExactDecimal` for the reason given on
   * {@link ProductResponse.calculatedSalePrice}: they serialize as digit-exact JSON strings.
   */
  readonly price: ExactDecimal;
  readonly listPrice: ExactDecimal;
  readonly renewalPrice: ExactDecimal;
  readonly activeFlag: boolean;
  readonly userDefinedPriceFlag: boolean;
  readonly imageFile?: string;
}

/** One selectable option, as `optionService.getOptionsForSelect` shapes it. */
export interface ProductSelectOptionResponse {
  readonly name: string;
  readonly value: string;
}

/** The formatted option groups a product exposes, keyed by option-group name. */
export type FormattedOptionGroupsResponse = Readonly<
  Record<string, readonly ProductSelectOptionResponse[]>
>;

/** A page of products, with the smart list's own seven members. */
export interface ProductSmartListResponse {
  readonly records: readonly ProductResponse[];
  readonly pageRecords: readonly ProductResponse[];
  readonly recordsCount: number;
  readonly pageRecordsStart: number;
  readonly pageRecordsEnd: number;
  readonly currentPage: number;
  readonly totalPages: number;
}

/* The access matrix. */

/** What one routed member requires of its caller. */
type ProductAccessRequirement = {
  readonly classification: Extract<HandlerAccessClassification, 'secure'>;

  /** The entity the route targets. A module constant, never a request value. */
  readonly entityName: string;

  /** The one operation this route performs, and therefore the one question it asks. */
  readonly crudType: EntityCrudType;

  /**
   * The question asked instead when the request addresses no resource — i.e. when it creates one.
   */
  readonly unaddressedCrudType?: EntityCrudType;

  /** A second, subordinate question, asked only after the primary one is granted. */
  readonly subordinate?: {
    readonly entityName: string;
    readonly crudType: EntityCrudType;
  };
};

/**
 * There is no `ANY_LOGIN_REQUIREMENT` and no `'anyLogin'` arm of the requirement union: every route is
 * classified, and an unclassified route cannot short-circuit the entity question (CWE-862, CWE-639).
 */

/** A logged-in account whose permission groups grant `read` on `Product`. */
const SECURE_PRODUCT_READ_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudType: 'read',
});

/** A logged-in account whose permission groups grant `create` on `Product`. */
const SECURE_PRODUCT_CREATE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudType: 'create',
});

/**
 * A logged-in account granted `update` on `Product` for an addressed product, `create` for a new one.
 */
const SECURE_PRODUCT_SAVE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudType: 'update',
  unaddressedCrudType: 'create',
});

/** A logged-in account granted `update` on `product`, for a route that mutates one it addresses. */
const SECURE_PRODUCT_PROCESS_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudType: 'update',
});

/** `update` on `product` and `update` on `Sku`, for a process route that writes SKU state. */
const SECURE_PRODUCT_PROCESS_WITH_SKU_WRITE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudType: 'update',
  subordinate: Object.freeze({ entityName: SKU_ENTITY_NAME, crudType: 'update' }),
});

/** A logged-in account whose permission groups grant `delete` on `Product`. */
const SECURE_PRODUCT_DELETE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudType: 'delete',
});

/** A logged-in account whose permission groups grant `read` on `ProductType`. */
const SECURE_PRODUCT_TYPE_READ_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_TYPE_ENTITY_NAME,
  crudType: 'read',
});

/** A logged-in account granted `update` on `productType`. */
const SECURE_PRODUCT_TYPE_SAVE_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_TYPE_ENTITY_NAME,
  crudType: 'update',
});

/** A logged-in account whose permission groups grant `read` on `Sku`. */
const SECURE_SKU_READ_REQUIREMENT: ProductAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: SKU_ENTITY_NAME,
  crudType: 'read',
});

/** The access classification of every routed product operation, and the evidence for each row. */
export const PRODUCT_ACCESS_MATRIX: Readonly<
  Record<keyof ProductHandler, ProductAccessRequirement>
> = Object.freeze({
  loadDataFromFile: SECURE_PRODUCT_SAVE_REQUIREMENT,
  getFormattedOptionGroups: SECURE_PRODUCT_READ_REQUIREMENT,
  getProductSkusBySelectedOptions: SECURE_SKU_READ_REQUIREMENT,
  processProductAddOptionGroup: SECURE_PRODUCT_PROCESS_WITH_SKU_WRITE_REQUIREMENT,
  processProductAddOption: SECURE_PRODUCT_PROCESS_WITH_SKU_WRITE_REQUIREMENT,
  processProductAddProductReview: SECURE_PRODUCT_PROCESS_REQUIREMENT,
  processProductAddSubscriptionTerm: SECURE_PRODUCT_PROCESS_REQUIREMENT,
  processProductDeleteDefaultImage: SECURE_PRODUCT_PROCESS_WITH_SKU_WRITE_REQUIREMENT,
  processProductUpdateDefaultImageFileNames: SECURE_PRODUCT_PROCESS_WITH_SKU_WRITE_REQUIREMENT,
  processProductUpdateSkus: SECURE_PRODUCT_PROCESS_WITH_SKU_WRITE_REQUIREMENT,
  processProductUploadDefaultImage: SECURE_PRODUCT_PROCESS_WITH_SKU_WRITE_REQUIREMENT,
  saveProduct: SECURE_PRODUCT_SAVE_REQUIREMENT,
  saveProductType: SECURE_PRODUCT_TYPE_SAVE_REQUIREMENT,
  deleteProduct: SECURE_PRODUCT_DELETE_REQUIREMENT,
  getProductSmartList: SECURE_PRODUCT_READ_REQUIREMENT,
  newProduct: SECURE_PRODUCT_CREATE_REQUIREMENT,
  getProductType: SECURE_PRODUCT_TYPE_READ_REQUIREMENT,
  getProduct: SECURE_PRODUCT_READ_REQUIREMENT,
});

/* The routed surface. */

/** The routed product operations, ready to be mounted by src/handlers/router.ts. */
export interface ProductHandler {
  readonly loadDataFromFile: (event: LoadDataFromFileEvent) => Promise<APIGatewayProxyResult>;
  readonly getFormattedOptionGroups: (
    event: ProductIdentifierEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly getProductSkusBySelectedOptions: (
    event: SelectedOptionsEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductAddOptionGroup: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductAddOption: (event: ProductPayloadEvent) => Promise<APIGatewayProxyResult>;
  readonly processProductAddProductReview: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductAddSubscriptionTerm: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductDeleteDefaultImage: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductUpdateDefaultImageFileNames: (
    event: ProductIdentifierEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly processProductUpdateSkus: (event: ProductPayloadEvent) => Promise<APIGatewayProxyResult>;
  readonly processProductUploadDefaultImage: (
    event: ProductPayloadEvent,
  ) => Promise<APIGatewayProxyResult>;
  readonly saveProduct: (event: ProductSaveEvent) => Promise<APIGatewayProxyResult>;
  readonly saveProductType: (event: ProductTypePayloadEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteProduct: (event: ProductIdentifierEvent) => Promise<APIGatewayProxyResult>;
  readonly getProductSmartList: (event: ProductSmartListEvent) => Promise<APIGatewayProxyResult>;
  readonly newProduct: (event: NewProductEvent) => Promise<APIGatewayProxyResult>;
  readonly getProductType: (event: ProductTypeIdentifierEvent) => Promise<APIGatewayProxyResult>;
  readonly getProduct: (event: ProductIdentifierEvent) => Promise<APIGatewayProxyResult>;
}

/** A `product` really does carry the error surface the commit gate reads. */
type _ProductCarriesErrorState = AssertAssignable<Product, ProductWithErrorState>;

/* The commit-gate failure, translated into the findings that caused it. */

/**
 * Translates a failed product write into its keyed findings, when findings are what caused it.
 *
 */
function liftProductWriteFindings(error: unknown, subject: ProductWithErrorState | null): unknown {
  if (subject === null || !skuBatchHasErrors(subject)) {
    return error;
  }

  const failure = new ValidationError();

  /*
   * The complete bag, matching the complete gate. The gate refuses on a finding that lives on a SKU
   * rather than on the product, so lifting `subject.getErrors()` alone would publish an empty `errors`
   * member for exactly that case — a refusal saying nothing about what was refused.
   */
  failure.addErrors(collectSkuBatchErrors(subject));

  return failure;
}

/**
 * The product-type variant: its bag is its own, and there is no SKU batch to merge.
 */
function liftProductTypeWriteFindings(
  error: unknown,
  subject: ProductTypeWithErrorState | null,
): unknown {
  if (subject === null || !subject.hasErrors()) {
    return error;
  }

  const failure = new ValidationError();

  failure.addErrors(subject.getErrors());

  return failure;
}

/* Request readers. */

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
 * Reads the addressed product-type identifier, or reports that none was addressed.
 */
function readProductTypeIdentifier(
  event: Pick<APIGatewayProxyEvent, 'pathParameters'>,
): string | undefined {
  const productTypeID: string | undefined = readPathParameter(
    event,
    PRODUCT_TYPE_ID_PATH_PARAMETER,
  );

  if (productTypeID === undefined || productTypeID === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return productTypeID;
}

/**
 * Reads the selected-option list, distinguishing "not supplied" from "supplied and empty".
 */
function readSelectedOptions(
  event: Pick<APIGatewayProxyEvent, 'queryStringParameters'>,
): string | undefined {
  return readQueryStringParameter(event, SELECTED_OPTIONS_QUERY_PARAMETER);
}

/*
 * The smart-list input reader and its five supporting declarations were removed from this file.
 */

/* Process-object assembly. */

/**
 * Reads one data property that the legacy declares as text.
 */
function readProcessText(data: Record<string, unknown>, key: string): string | undefined {
  const value: unknown = data[key];

  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value;
}

/**
 * Reads one data property that the legacy declares as `string | number`.
 */
function readProcessScalar(
  data: Record<string, unknown>,
  key: string,
): string | number | undefined {
  const value: unknown = data[key];

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return undefined;
}

/**
 * Assembles the `addOptionGroup` process object.
 */
function buildAddOptionGroupProcessObject(
  product: Product,
  data: Record<string, unknown>,
): ProductAddOptionGroup {
  const optionGroup: string | undefined = readProcessText(data, OPTION_GROUP_DATA_KEY);

  return {
    product,
    ...(optionGroup !== undefined ? { [OPTION_GROUP_DATA_KEY]: optionGroup } : {}),
  };
}

/**
 * Assembles the `addOption` process object.
 */
function buildAddOptionProcessObject(
  product: Product,
  data: Record<string, unknown>,
): ProductAddOption {
  const option: string | undefined = readProcessText(data, OPTION_DATA_KEY);

  return {
    product,
    ...(option !== undefined ? { [OPTION_DATA_KEY]: option } : {}),
  };
}

/**
 * Assembles the `updateSkus` process object.
 */
function buildUpdateSkusProcessObject(
  product: Product,
  data: Record<string, unknown>,
): ProductUpdateSkus {
  const updatePriceFlag: string | number | undefined = readProcessScalar(
    data,
    UPDATE_PRICE_FLAG_DATA_KEY,
  );
  const price: string | number | undefined = readProcessScalar(data, PRICE_DATA_KEY);
  const updateListPriceFlag: string | number | undefined = readProcessScalar(
    data,
    UPDATE_LIST_PRICE_FLAG_DATA_KEY,
  );
  const listPrice: string | number | undefined = readProcessScalar(data, LIST_PRICE_DATA_KEY);

  return {
    product,
    ...(updatePriceFlag !== undefined ? { updatePriceFlag } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(updateListPriceFlag !== undefined ? { updateListPriceFlag } : {}),
    ...(listPrice !== undefined ? { listPrice } : {}),
  };
}

/* Response projection. */

/**
 * Projects a product onto the minimal representation a route returns.
 */
function toProductResponse(product: Product): ProductResponse {
  const response: ProductResponse = {
    productID: product.productID,
    ...(product.activeFlag !== undefined ? { activeFlag: product.activeFlag } : {}),
    ...(product.urlTitle !== undefined ? { urlTitle: product.urlTitle } : {}),
    ...(product.productName !== undefined ? { productName: product.productName } : {}),
    ...(product.productCode !== undefined ? { productCode: product.productCode } : {}),
    ...(product.productDescription !== undefined
      ? { productDescription: product.productDescription }
      : {}),
    ...(product.publishedFlag !== undefined ? { publishedFlag: product.publishedFlag } : {}),
    ...(product.sortOrder !== undefined ? { sortOrder: product.sortOrder } : {}),
    ...(product.calculatedSalePrice !== undefined
      ? { calculatedSalePrice: product.calculatedSalePrice }
      : {}),
    ...(product.calculatedQATS !== undefined ? { calculatedQATS: product.calculatedQATS } : {}),
    ...(product.calculatedAllowBackorderFlag !== undefined
      ? { calculatedAllowBackorderFlag: product.calculatedAllowBackorderFlag }
      : {}),
    ...(product.calculatedTitle !== undefined ? { calculatedTitle: product.calculatedTitle } : {}),
    ...(product.brand !== undefined ? { brandID: product.brand.brandID } : {}),
    ...(product.productType !== undefined
      ? { productTypeID: product.productType.productTypeID }
      : {}),
  };

  return response;
}

/**
 * Projects a collection of products, preserving order and cardinality exactly.
 */
function toProductResponses(products: readonly Product[]): readonly ProductResponse[] {
  return products.map(toProductResponse);
}

/**
 * Projects a smart list page, carrying its five paging numbers across untouched.
 */
function toProductSmartListResponse(result: SmartListResult<Product>): ProductSmartListResponse {
  return {
    records: toProductResponses(result.records),
    pageRecords: toProductResponses(result.pageRecords),
    recordsCount: result.recordsCount,
    pageRecordsStart: result.pageRecordsStart,
    pageRecordsEnd: result.pageRecordsEnd,
    currentPage: result.currentPage,
    totalPages: result.totalPages,
  };
}

/**
 * Projects a product type onto the minimal representation a route returns.
 */
function toProductTypeResponse(productType: ProductType): ProductTypeResponse {
  const response: ProductTypeResponse = {
    productTypeID: productType.productTypeID,
    ...(productType.productTypeIDPath !== undefined
      ? { productTypeIDPath: productType.productTypeIDPath }
      : {}),
    ...(productType.activeFlag !== undefined ? { activeFlag: productType.activeFlag } : {}),
    ...(productType.publishedFlag !== undefined
      ? { publishedFlag: productType.publishedFlag }
      : {}),
    ...(productType.urlTitle !== undefined ? { urlTitle: productType.urlTitle } : {}),
    ...(productType.productTypeName !== undefined
      ? { productTypeName: productType.productTypeName }
      : {}),
    ...(productType.productTypeDescription !== undefined
      ? { productTypeDescription: productType.productTypeDescription }
      : {}),
    ...(productType.systemCode !== undefined ? { systemCode: productType.systemCode } : {}),
    ...(productType.parentProductType !== undefined
      ? { parentProductTypeID: productType.parentProductType.productTypeID }
      : {}),
  };

  return response;
}

/**
 * Projects one SKU onto the minimal representation the option-resolution route returns.
 */
function toProductSkuResponse(sku: Sku): ProductSkuResponse {
  const response: ProductSkuResponse = {
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
 * Projects the SKUs the option-resolution route returns, preserving order and cardinality exactly.
 */
function toProductSkuResponses(skus: readonly Sku[]): readonly ProductSkuResponse[] {
  return skus.map(toProductSkuResponse);
}

/**
 * Projects the formatted option groups, preserving key order and collapse semantics.
 */
function toFormattedOptionGroupsResponse(
  groups: FormattedOptionGroups,
): FormattedOptionGroupsResponse {
  return Object.fromEntries(
    Object.entries(groups).map(([optionGroupName, options]) => [
      optionGroupName,
      options.map((option: SelectOption) => ({ name: option.name, value: option.value })),
    ]),
  );
}

/* The factory. */

/**
 * Builds the routed product boundary over an already-constructed service.
 */
export function createProductHandler(
  productService: ProductHandlerService,
  resolveAuthorization: InvocationSecurityResolver,
  writeRunner: TransactionalWriteRunner<ProductWriteGraph>,
): ProductHandler {
  /**
   * Runs the gate `setupRequest()` [org/Hibachi/Hibachi.cfc:L188] ran, for one routed member.
   */
  const refuseUnauthorized = (
    event: ProductAuthorizationEvent,
    member: keyof ProductHandler,
    entityID?: string,
  ): ProductAuthorizationOutcome => {
    const requirement: ProductAccessRequirement = PRODUCT_ACCESS_MATRIX[member];

    /*
     * — the question follows the operation. A row that declares an unaddressed arm asks
     * that question when the request addresses nothing, and its primary question otherwise; every other
     * row asks its single primary question. Exactly one primary question is asked, so there is no
     * "first grant wins" disjunction left for a narrower grant to escalate through.
     */
    const crudType: EntityCrudType =
      entityID === undefined && requirement.unaddressedCrudType !== undefined
        ? requirement.unaddressedCrudType
        : requirement.crudType;

    /*
     * — one resolution, carrying the whole question. The resolver is handed the routed
     * action, the single operation attempted, the entity from this file's own constants and the
     * addressed identifier — not the bare header slice it used to receive. Still exactly once per
     * invocation, including for a row that also asks a subordinate question below.
     */
    const authorization: RequestAuthorizationContext = resolveAuthorization(
      toInvocationSecurityRequest(event, {
        action: `${PRODUCT_ACTION_PREFIX}${member}`,
        crudType,
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
     * Step 3 — the entity question, from the matrix row. No step returns before this one: there is no
     * `'anyLogin'` short-circuit, for the reason recorded above {@link SECURE_PRODUCT_READ_REQUIREMENT}.
     */
    if (
      !authorization.entityAuthorization.authenticateEntity({
        crudType,
        entityName: requirement.entityName,
        ...(entityID === undefined ? {} : { entityID }),
      })
    ) {
      return { refusal: forbiddenResponse() };
    }

    /*
     * Step 4 —'s subordinate question, a conjunction with step 3 rather than an
     * alternative to it. Asked only where the route writes a child resource this deliverable models,
     * and asked of the same resolved context, so the resolver is still invoked once. The addressed
     * identifier is deliberately not forwarded: it identifies the product, and passing a product's
     * identifier on a question about `Sku` would tell a resolver something untrue.
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

    /*
     * The authorised context is returned, not discarded —. every write route hands it to
     * the transaction boundary, so property population and audit stamping run under the principal this
     * gate approved instead of under whatever `../config/container.ts` memoised.
     */
    return { authorization };
  };

  /**
   * Runs one write against an addressed product, inside one transaction, behind the complete commit gate.
   */
  const runProductWrite = async <TResult>(
    /*
     * — the authorised context of the invocation performing this write. It is the first
     * parameter, exactly as it is on `TransactionalWriteRunner.runWrite`, so a route cannot open a
     * transaction without having been through the gate: there is no overload that omits it.
     */
    security: RequestAuthorizationContext,
    productID: string,
    work: (graph: ProductWriteGraph, product: Product) => Promise<TResult>,
  ): Promise<TResult | null> => {
    let subject: Product | null = null;

    /*
     * Read through a function so the declared type survives: assigning inside the closure narrows the
     * binding to `never` for the reader below, and a function body sees the declared type instead. This is
     * the same device ./skuHandler uses for its captured batch, and it needs no cast (AAP §0.7.3).
     */
    const capturedSubject = (): ProductWithErrorState | null => subject;

    try {
      return await writeRunner.runWrite<TResult | null>(
        security,
        async (graph) => {
          const product: Product | null = await graph.getProduct(productID);

          if (product === null) {
            return null;
          }

          subject = product;

          return work(graph, product);
        },
        () => subject !== null && skuBatchHasErrors(subject),
      );
    } catch (error) {
      /*
       * The roll-back is translated into the findings that caused it — see
       * {@link liftProductWriteFindings}. Without this the gate above refused, the boundary raised its own
       * generic `DomainError`, and the caller received a 500 with every keyed finding discarded.
       */
      throw liftProductWriteFindings(error, capturedSubject());
    }
  };

  /* Declared member 1 of 15. */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L65]
   * `public void function loadDataFromFile(required string fileURL, string textQualifier = "")`.
   *
   * M1 (AAP §0.6.6) — the member this route exposes declares a one-hour request budget:
   * [model/service/ProductService.cfc:L66] calls
   * `getHibachiTagService().cfSetting(requesttimeout="3600")`. AWS Lambda's published maximum function
   * timeout is 15 minutes, so 3600 seconds is unrepresentable in a single invocation. AAP §0.6.6 requires
   * the importer to be documented as needing an out-of-band model — chunked or queued — rather than
   * silently re-timed to fit, so this boundary invents no chunk size, page size, batch size, queue,
   * retry count, backoff schedule, concurrency limit or replacement timeout, and caps nothing at 900
   * seconds. The entry point is nevertheless routed, gated and callable: TR-5 forbids quietly dropping a
   * member from the interface, so the limitation is stated rather than hidden.
   *
   * Two further mismatches compound M1. M3 — [model/dao/ProductDAO.cfc:L177] opens `transaction{` inside
   * the record loop, so the importer commits once per row and a mid-file failure leaves a partially
   * imported catalogue; that per-row boundary belongs to the repository, which is why this is the one
   * write that does not run inside {@link runProductWrite} and why {@link ProductWriteGraph} omits the
   * member so the compiler prevents it being called from inside a transaction. M4 —
   * [model/dao/ProductDAO.cfc:L87] performs the one live retrieval, through
   * `getService("utilityTagService").cfhttp(...)`; the only other retrieval text, a `new http()` sequence
   * at [:L89-L98], is commented out under the note at [:L88] that the script-based method does not work
   * for a tab delimiter, so it is an abandoned alternative rather than a live fallback.
   *
   * TODO(parity) — the location read at {@link FILE_URL_QUERY_PARAMETER} is caller-controlled and would
   * be dereferenced server-side, and no layer in this port refuses it (CWE-918, part of M4). AAP §0.6.7.7
   * authorises exactly one departure from behavioural preservation, D18, and AAP §0.8.2 guideline 4 admits
   * no proportionality test, so the location is forwarded unexamined. What stands in its place is a wiring
   * requirement rather than a refusal: `ProductImportSourcePolicy` is a required member of any retrieving
   * reader on `../ports/repositories/ProductRepository`, so an operator who supplies retrieval supplies a
   * policy with it, and the only reader this subtree ships retrieves nothing and declines with a
   * `NotImplementedError`, answered below as `501` with neutral text that echoes no location.
   */
  const loadDataFromFile = async (event: LoadDataFromFileEvent): Promise<APIGatewayProxyResult> => {
    /*
     * Only the refusal is taken: the importer reaches the pool-bound service and owns its own
     * per-row transaction boundaries (M3), so no invocation graph is rebuilt here for an authorised
     * context to be bound into. A route that opens a transaction must pass it on.
     */
    const { refusal } = refuseUnauthorized(event, 'loadDataFromFile');

    if (refusal !== undefined) {
      return refusal;
    }

    const fileURL: string | undefined = readQueryStringParameter(event, FILE_URL_QUERY_PARAMETER);

    if (fileURL === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, FILE_URL_REQUIRED_MESSAGE);
    }

    /* Optional at [:L65], so absence is forwarded as absence and the service's default applies. */
    const textQualifier: string | undefined = readQueryStringParameter(
      event,
      TEXT_QUALIFIER_QUERY_PARAMETER,
    );

    try {
      /*
       * The two call forms are distinguished rather than collapsed, because passing `undefined`
       * explicitly is not the same as omitting the argument under `exactOptionalPropertyTypes`, and
       * omitting it is what lets the service's own default apply.
       */
      if (textQualifier === undefined) {
        await productService.loadDataFromFile(fileURL);
      } else {
        await productService.loadDataFromFile(fileURL, textQualifier);
      }

      return okResponse(null);
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* Declared member 2 of 15. */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L70]
   * `public any function getFormattedOptionGroups(required any product)`.
   */
  const getFormattedOptionGroups = async (
    event: ProductIdentifierEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal } = refuseUnauthorized(event, 'getFormattedOptionGroups', productID);

    if (refusal !== undefined) {
      return refusal;
    }

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const product: Product | null = await productService.getProduct(productID);

      if (product === null) {
        return notFoundResponse();
      }

      return okResponse(
        toFormattedOptionGroupsResponse(await productService.getFormattedOptionGroups(product)),
      );
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* Declared member 3 of 15 — the prompt's own worked example. */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L104]
   * `public any function getProductSkusBySelectedOptions(required string selectedOptions, required string
   * productID)`.
   *
   */
  const getProductSkusBySelectedOptions = async (
    event: SelectedOptionsEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal } = refuseUnauthorized(event, 'getProductSkusBySelectedOptions', productID);

    if (refusal !== undefined) {
      return refusal;
    }

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    /*
     * Absence is answered because [:L104] declares it `required`; an empty list is a value, not an
     * absence, and travels on untouched (T5).
     */
    const selectedOptions: string | undefined = readSelectedOptions(event);

    if (selectedOptions === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SELECTED_OPTIONS_REQUIRED_MESSAGE);
    }

    try {
      // options first, product second — the legacy order, and an inversion here would type-check.
      return okResponse(
        toProductSkuResponses(
          await productService.getProductSkusBySelectedOptions(selectedOptions, productID),
        ),
      );
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* Declared members 4 through 11 of 15 — the process pipeline. */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L113] — was
   * `public any function processProduct_addOptionGroup(required any product, required any processObject)`.
   *
   * TODO(parity) D14 — [model/service/ProductService.cfc:L113-L126] adds only `options[1]`, the first
   * option of the new group, to every existing SKU. AAP §0.6.7.4 registers that as observed behaviour;
   * ./services/ProductService carries it unrepaired, and this boundary neither compensates for it nor
   * exposes a second call form that would work around it (AAP §0.8.2 Guideline 4).
   */
  const processProductAddOptionGroup = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(
      event,
      'processProductAddOptionGroup',
      productID,
    );

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

    try {
      const updated: Product | null = await runProductWrite(
        authorization,
        productID,
        (graph, product) =>
          graph.processProductAddOptionGroup(
            product,
            buildAddOptionGroupProcessObject(product, body.value),
          ),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L128] — was
   * `public any function processProduct_addOption(required any product, required any processObject)`.
   */
  const processProductAddOption = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(
      event,
      'processProductAddOption',
      productID,
    );

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

    try {
      const updated: Product | null = await runProductWrite(
        authorization,
        productID,
        (graph, product) =>
          graph.processProductAddOption(product, buildAddOptionProcessObject(product, body.value)),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L157] — was
   * `public any function processProduct_addProductReview(required any product, required any processObject)`.
   */
  const processProductAddProductReview = (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * Not `async`, and the absence is evidence rather than style. Nothing in this member awaits
     * anything, because nothing in it reaches the service, the graph or the database: it answers the
     * request-shape questions and then reports the boundary. `Promise.resolve` keeps the member's declared
     * contract — the routed shape is `(event) => Promise<APIGatewayProxyResult>` — while an `async` body
     * with no `await` would advertise work that is not performed.
     */
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    /*
     * Only the refusal is taken: this route opens no transaction — it answers the boundary's own
     * `501` (AAP §0.2.2.6/§0.2.2.1) — so there is no graph for an authorised context to be bound
     * into. A route that does write must destructure `authorization` and pass it on.
     */
    const { refusal } = refuseUnauthorized(event, 'processProductAddProductReview', productID);

    if (refusal !== undefined) {
      return Promise.resolve(refusal);
    }

    if (productID === undefined) {
      return Promise.resolve(messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE));
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return Promise.resolve(invalidRequestBodyResponse(body.problem));
    }

    /*
     * The boundary is answered here, before any transaction is opened — see
     * {@link refuseUnsatisfiableProcessObject}. The request-shape checks above still run, so a caller that
     * addressed nothing or sent an unparseable body still learns that first; a well-formed request is then
     * refused as unavailable rather than being carried into a service narrowing it provably cannot pass and
     * an opaque `500` that named no reason. The member remains routed and declared (TR-5).
     */
    return Promise.resolve(
      errorResponse(
        refuseUnsatisfiableProcessObject(
          'processProductAddProductReview',
          'model/service/ProductService.cfc:L157-L171',
        ),
      ),
    );
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L173] — was
   * `public any function processProduct_addSubscriptionTerm(required any product, required any
   * processObject)`.
   *
   * TODO(parity) D6 — the member cannot complete and is carried unrepaired:
   * `model/service/ProductService.cfc:L173` declares only `(product, processObject)` while `:L181` reads
   * `arguments.data.listPrice`, so the reference is undefined at run time whenever the guard at `:L180`
   * admits it.
   */
  const processProductAddSubscriptionTerm = (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * Not `async`, and the absence is evidence rather than style. Nothing in this member awaits
     * anything, because nothing in it reaches the service, the graph or the database: it answers the
     * request-shape questions and then reports the boundary. `Promise.resolve` keeps the member's declared
     * contract — the routed shape is `(event) => Promise<APIGatewayProxyResult>` — while an `async` body
     * with no `await` would advertise work that is not performed.
     */
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    /*
     * Only the refusal is taken: this route opens no transaction — it answers the boundary's own
     * `501` (AAP §0.2.2.6/§0.2.2.1) — so there is no graph for an authorised context to be bound
     * into. A route that does write must destructure `authorization` and pass it on.
     */
    const { refusal } = refuseUnauthorized(event, 'processProductAddSubscriptionTerm', productID);

    if (refusal !== undefined) {
      return Promise.resolve(refusal);
    }

    if (productID === undefined) {
      return Promise.resolve(messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE));
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return Promise.resolve(invalidRequestBodyResponse(body.problem));
    }

    /*
     * The boundary is answered here, before any transaction is opened — see
     * {@link refuseUnsatisfiableProcessObject}. The request-shape checks above still run, so a caller that
     * addressed nothing or sent an unparseable body still learns that first; a well-formed request is then
     * refused as unavailable rather than being carried into a service narrowing it provably cannot pass and
     * an opaque `500` that named no reason. The member remains routed and declared (TR-5).
     */
    return Promise.resolve(
      errorResponse(
        refuseUnsatisfiableProcessObject(
          'processProductAddSubscriptionTerm',
          'model/service/ProductService.cfc:L173-L196',
        ),
      ),
    );
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L198] — was
   * `public any function processProduct_deleteDefaultImage(required any product, required struct data)`.
   */
  const processProductDeleteDefaultImage = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(
      event,
      'processProductDeleteDefaultImage',
      productID,
    );

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

    try {
      const updated: Product | null = await runProductWrite(
        authorization,
        productID,
        (graph, product) => graph.processProductDeleteDefaultImage(product, body.value),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L208] — was
   * `public any function processProduct_updateDefaultImageFileNames( required any product )`.
   */
  const processProductUpdateDefaultImageFileNames = async (
    event: ProductIdentifierEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(
      event,
      'processProductUpdateDefaultImageFileNames',
      productID,
    );

    if (refusal !== undefined) {
      return refusal;
    }

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const updated: Product | null = await runProductWrite(
        authorization,
        productID,
        (graph, product) => graph.processProductUpdateDefaultImageFileNames(product),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L216] — was
   * `public any function processProduct_updateSkus(required any product, required any processObject)`.
   */
  const processProductUpdateSkus = async (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(
      event,
      'processProductUpdateSkus',
      productID,
    );

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

    try {
      const updated: Product | null = await runProductWrite(
        authorization,
        productID,
        (graph, product) =>
          graph.processProductUpdateSkus(
            product,
            buildUpdateSkusProcessObject(product, body.value),
          ),
      );

      return updated === null ? notFoundResponse() : okResponse(toProductResponse(updated));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L235] — was
   * `public any function processProduct_uploadDefaultImage(required any product, required any
   * processObject)`.
   */
  const processProductUploadDefaultImage = (
    event: ProductPayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * Not `async`, and the absence is evidence rather than style. Nothing in this member awaits
     * anything, because nothing in it reaches the service, the graph or the database: it answers the
     * request-shape questions and then reports the boundary. `Promise.resolve` keeps the member's declared
     * contract — the routed shape is `(event) => Promise<APIGatewayProxyResult>` — while an `async` body
     * with no `await` would advertise work that is not performed.
     */
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    /*
     * Only the refusal is taken: this route opens no transaction — it answers the boundary's own
     * `501` (AAP §0.2.2.6/§0.2.2.1) — so there is no graph for an authorised context to be bound
     * into. A route that does write must destructure `authorization` and pass it on.
     */
    const { refusal } = refuseUnauthorized(event, 'processProductUploadDefaultImage', productID);

    if (refusal !== undefined) {
      return Promise.resolve(refusal);
    }

    if (productID === undefined) {
      return Promise.resolve(messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE));
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return Promise.resolve(invalidRequestBodyResponse(body.problem));
    }

    /*
     * The boundary is answered here, before any transaction is opened — see
     * {@link refuseUnsatisfiableProcessObject}. The request-shape checks above still run, so a caller that
     * addressed nothing or sent an unparseable body still learns that first; a well-formed request is then
     * refused as unavailable rather than being carried into a service narrowing it provably cannot pass and
     * an opaque `500` that named no reason. The member remains routed and declared (TR-5).
     */
    return Promise.resolve(
      errorResponse(
        refuseUnsatisfiableProcessObject(
          'processProductUploadDefaultImage',
          'model/service/ProductService.cfc:L235-L257',
        ),
      ),
    );
  };

  /* Declared member 12 of 15. */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L264]
   * `public any function saveProduct(required any product, required struct data)`.
   */
  const saveProduct = async (event: ProductSaveEvent): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(event, 'saveProduct', productID);

    if (refusal !== undefined) {
      return refusal;
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    let subject: Product | null = null;
    let outcome: Product | null = null;

    /* Read through functions for the narrowing reason recorded on {@link runProductWrite}. */
    const capturedSubject = (): ProductWithErrorState | null => subject;
    const capturedOutcome = (): ProductWithErrorState | null => outcome;

    try {
      const saved: Product | null = await writeRunner.runWrite<Product | null>(
        /* — the gate's own context; see {@link runProductWrite}. */
        authorization,
        async (graph) => {
          const product: Product | null =
            productID === undefined ? graph.newProduct() : await graph.getProduct(productID);

          if (product === null) {
            return null;
          }

          subject = product;
          outcome = await graph.saveProduct(product, body.value);

          return outcome;
        },
        () =>
          (subject !== null && skuBatchHasErrors(subject)) ||
          (outcome !== null && skuBatchHasErrors(outcome)),
      );

      return saved === null ? notFoundResponse() : okResponse(toProductResponse(saved));
    } catch (error) {
      /*
       * Both references are offered to the lift, in the gate's own order, because the persister may
       * answer with a different instance and the findings may therefore live on either one. The gate above
       * asks the subject first, so the lift does too — a refusal is published with the bag of whichever
       * instance the gate itself refused on.
       */
      const withSubject = liftProductWriteFindings(error, capturedSubject());

      return errorResponse(
        withSubject === error ? liftProductWriteFindings(error, capturedOutcome()) : withSubject,
      );
    }
  };

  /* Declared member 13 of 15. */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L294]
   * `public any function saveProductType(required any productType, required struct data)`.
   */
  const saveProductType = async (
    event: ProductTypePayloadEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productTypeID: string | undefined = readProductTypeIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(event, 'saveProductType', productTypeID);

    if (refusal !== undefined) {
      return refusal;
    }

    if (productTypeID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_TYPE_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    /*
     * Captured rather than read from the resolved value, for the same reason `saveProduct` captures its
     * two references: the gate is a zero-argument predicate the transaction boundary evaluates before it
     * decides to commit, so it cannot be handed the work's result.
     */
    let outcome: ProductTypeWithErrorState | null = null;

    /* Read through a function for the narrowing reason recorded on {@link runProductWrite}. */
    const capturedOutcome = (): ProductTypeWithErrorState | null => outcome;

    try {
      const saved: ProductTypeWithErrorState | null =
        await writeRunner.runWrite<ProductTypeWithErrorState | null>(
          /* — the gate's own context; see {@link runProductWrite}. */
          authorization,
          async (graph) => {
            const productType: ProductType | null = await graph.getProductType(productTypeID);

            if (productType === null) {
              return null;
            }

            outcome = await graph.saveProductType(productType, body.value);

            return outcome;
          },
          () => outcome !== null && outcome.hasErrors(),
        );

      return saved === null ? notFoundResponse() : okResponse(toProductTypeResponse(saved));
    } catch (error) {
      /*
       * The roll-back is translated into the product type's own findings — see
       * {@link liftProductTypeWriteFindings}. Letting the roll-back report the failure on its own is not
       * enough: the boundary's raise is a plain `DomainError`, which publishes 500 with every keyed
       * finding withheld, so a caller whose product-type name was rejected would learn nothing about
       * which rule rejected it.
       */
      return errorResponse(liftProductTypeWriteFindings(error, capturedOutcome()));
    }
  };

  /* Declared member 14 of 15. */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L317]
   * `public boolean function deleteProduct(required any product)`.
   */
  const deleteProduct = async (event: ProductIdentifierEvent): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(event, 'deleteProduct', productID);

    if (refusal !== undefined) {
      return refusal;
    }

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const deleted: boolean | null = await runProductWrite(
        authorization,
        productID,
        (graph, product) => graph.deleteProduct(product),
      );

      return deleted === null ? notFoundResponse() : okResponse(deleted);
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* Declared member 15 of 15. */

  /**
   * Ports the boundary for [model/service/ProductService.cfc:L342]
   * `public any function getProductSmartList(struct data={}, currentURL="")`.
   */
  const getProductSmartList = async (
    event: ProductSmartListEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getProductSmartList');

    if (refusal !== undefined) {
      return refusal;
    }

    try {
      const result: SmartListResult<Product> = await productService.getProductSmartList(
        readSmartListInput(event),
      );

      return okResponse(toProductSmartListResponse(result));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /* The three synthesized members — IR-1. */

  /**
   * Ports the boundary for the synthesized `newProduct` — the `new` prefix branch
   * [org/Hibachi/HibachiService.cfc:L262], whose handler at [:L318] took no argument.
   */
  const newProduct = (event: NewProductEvent): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'newProduct');

    if (refusal !== undefined) {
      return Promise.resolve(refusal);
    }

    try {
      return Promise.resolve(okResponse(toProductResponse(productService.newProduct())));
    } catch (error) {
      return Promise.resolve(errorResponse(error));
    }
  };

  /**
   * Ports the boundary for the synthesized `getProductType(productTypeID)` — the `get` prefix branch
   * [org/Hibachi/HibachiService.cfc:L258], whose handler read the identifier as positional argument 1 at
   * [:L325].
   */
  const getProductType = async (
    event: ProductTypeIdentifierEvent,
  ): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productTypeID: string | undefined = readProductTypeIdentifier(event);
    const { refusal } = refuseUnauthorized(event, 'getProductType', productTypeID);

    if (refusal !== undefined) {
      return refusal;
    }

    if (productTypeID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_TYPE_ID_REQUIRED_MESSAGE);
    }

    try {
      const productType: ProductType | null = await productService.getProductType(productTypeID);

      return productType === null
        ? notFoundResponse()
        : okResponse(toProductTypeResponse(productType));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for the synthesized `getProduct(productID)` — the same `get` prefix branch
   * [org/Hibachi/HibachiService.cfc:L258], reading the identifier as positional argument 1 at [:L325].
   */
  const getProduct = async (event: ProductIdentifierEvent): Promise<APIGatewayProxyResult> => {
    /*
     * — the addressed identifier is read first so the gate asks about the operation
     * actually performed and can name the row it is performed on. Nothing is done with it until
     * after the refusal, so no branch below discloses anything to an unauthorised caller.
     */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal } = refuseUnauthorized(event, 'getProduct', productID);

    if (refusal !== undefined) {
      return refusal;
    }

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const product: Product | null = await productService.getProduct(productID);

      return product === null ? notFoundResponse() : okResponse(toProductResponse(product));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /*
   * Exactly the eighteen approved operations, in the same order as {@link ProductHandler} and
   * {@link PRODUCT_ACCESS_MATRIX} — the fifteen declared members in legacy declaration order, then the
   * three synthesized. Because the returned object is typed by the interface and the matrix is keyed on
   * `keyof ProductHandler`, all three lists are the same list by construction: a member added to one
   * without the others does not compile, which is how "no additional synthesized method is routed" stops
   * being a promise and becomes a property.
   */
  return Object.freeze({
    loadDataFromFile,
    getFormattedOptionGroups,
    getProductSkusBySelectedOptions,
    processProductAddOptionGroup,
    processProductAddOption,
    processProductAddProductReview,
    processProductAddSubscriptionTerm,
    processProductDeleteDefaultImage,
    processProductUpdateDefaultImageFileNames,
    processProductUpdateSkus,
    processProductUploadDefaultImage,
    saveProduct,
    saveProductType,
    deleteProduct,
    getProductSmartList,
    newProduct,
    getProductType,
    getProduct,
  });
}

/* The Lambda entry point. */

/** The actions this entry point serves, in the legacy `slatAction` vocabulary. */
export type ProductRouteKey =
  | 'product.loadDataFromFile'
  | 'product.getFormattedOptionGroups'
  | 'product.getProductSkusBySelectedOptions'
  | 'product.processProductAddOptionGroup'
  | 'product.processProductAddOption'
  | 'product.processProductAddProductReview'
  | 'product.processProductAddSubscriptionTerm'
  | 'product.processProductDeleteDefaultImage'
  | 'product.processProductUpdateDefaultImageFileNames'
  | 'product.processProductUpdateSkus'
  | 'product.processProductUploadDefaultImage'
  | 'product.saveProduct'
  | 'product.saveProductType'
  | 'product.deleteProduct'
  | 'product.getProductSmartList'
  | 'product.newProduct'
  | 'product.getProductType'
  | 'product.getProduct';

/**
 * Builds the product handler from the composition root.
 *
 * @param container the memoized service graph
 * @param resolveAuthorization the per-invocation authorisation resolver. Defaults to
 * `./httpResponse.ts`'s registered-resolver reader — the deployment's resolver when one is
 * registered, the constant deny-all context otherwise, so the default remains fail-closed.
 */
export function createProductHandlerFromContainer(
  container: Pick<CatalogContainer, 'productService' | 'productWriteRunner'>,
  resolveAuthorization: InvocationSecurityResolver = resolveRequestAuthorization,
): ProductHandler {
  return createProductHandler(
    container.productService,
    resolveAuthorization,
    container.productWriteRunner,
  );
}

/**
 * Maps each served action name onto the member that answers it.
 */
export function createProductRoutes(handlers: ProductHandler): ActionRouteTable<ProductRouteKey> {
  /*
   * The literal is annotated before it is frozen, and the order is load-bearing. `object.freeze` takes
   * the literal through a generic parameter, which loses its freshness and with it TypeScript's
   * excess-property check — a route name not declared in the union above would then compile silently. A
   * first draft did exactly that and was caught by adding an undeclared key and watching it pass.
   * Annotating this binding restores the check in both directions: an undeclared key is rejected here,
   * and a declared key with no entry is reported as missing.
   */
  const routes: Record<ProductRouteKey, ActionRoute> = {
    'product.loadDataFromFile': (event: APIGatewayProxyEvent) => handlers.loadDataFromFile(event),
    'product.getFormattedOptionGroups': (event: APIGatewayProxyEvent) =>
      handlers.getFormattedOptionGroups(event),
    'product.getProductSkusBySelectedOptions': (event: APIGatewayProxyEvent) =>
      handlers.getProductSkusBySelectedOptions(event),
    'product.processProductAddOptionGroup': (event: APIGatewayProxyEvent) =>
      handlers.processProductAddOptionGroup(event),
    'product.processProductAddOption': (event: APIGatewayProxyEvent) =>
      handlers.processProductAddOption(event),
    'product.processProductAddProductReview': (event: APIGatewayProxyEvent) =>
      handlers.processProductAddProductReview(event),
    'product.processProductAddSubscriptionTerm': (event: APIGatewayProxyEvent) =>
      handlers.processProductAddSubscriptionTerm(event),
    'product.processProductDeleteDefaultImage': (event: APIGatewayProxyEvent) =>
      handlers.processProductDeleteDefaultImage(event),
    'product.processProductUpdateDefaultImageFileNames': (event: APIGatewayProxyEvent) =>
      handlers.processProductUpdateDefaultImageFileNames(event),
    'product.processProductUpdateSkus': (event: APIGatewayProxyEvent) =>
      handlers.processProductUpdateSkus(event),
    'product.processProductUploadDefaultImage': (event: APIGatewayProxyEvent) =>
      handlers.processProductUploadDefaultImage(event),
    'product.saveProduct': (event: APIGatewayProxyEvent) => handlers.saveProduct(event),
    'product.saveProductType': (event: APIGatewayProxyEvent) => handlers.saveProductType(event),
    'product.deleteProduct': (event: APIGatewayProxyEvent) => handlers.deleteProduct(event),
    'product.getProductSmartList': (event: APIGatewayProxyEvent) =>
      handlers.getProductSmartList(event),
    'product.newProduct': (event: APIGatewayProxyEvent) => handlers.newProduct(event),
    'product.getProductType': (event: APIGatewayProxyEvent) => handlers.getProductType(event),
    'product.getProduct': (event: APIGatewayProxyEvent) => handlers.getProduct(event),
  };

  return Object.freeze(routes);
}

/** The dispatcher, built once per container and reused for every later invocation. */
let dispatchProductAction: ActionRoute | undefined;

/**
 * The shape `../config/container`'s `getProductSurfaceGraph` publishes, used to type the deferred require inside
 * {@link handler}.
 */
type ProductSurfaceModule = typeof import('../config/container');

/**
 * The Lambda entry point for the product surface.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (dispatchProductAction === undefined) {
      /*
       * A deferred CommonJS `require`, deliberately not a dynamic `import`. The difference was
       * measured, not assumed, and it decided this line.
       */
      const { getProductSurfaceGraph } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see above.
        require('../config/container') as ProductSurfaceModule;
      const container = getProductSurfaceGraph();

      dispatchProductAction = createActionDispatcher<ProductRouteKey>({
        routes: createProductRoutes(createProductHandlerFromContainer(container)),
        beginInvocation: () => {
          container.beginInvocation();
        },
      });
    }

    return await dispatchProductAction(event);
  } catch (error: unknown) {
    return errorResponse(error);
  }
};

/** Compile-time proof that the export above satisfies the runtime's handler contract. */
type _ProductHandlerSatisfiesLambdaContract = AssertAssignable<
  typeof handler,
  APIGatewayProxyHandler
>;

/* The deployment registration seam, re-exported so it is reachable from the packaged artifact. */

/*
 * This artifact serves the gated product surface, so a deployment that mounts `handler` above — rather
 * than `./router.ts`'s aggregate — needs the registration seam on this module. Every product route is
 * gated, so without a registered resolver this artifact answers `401` and nothing else.
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
