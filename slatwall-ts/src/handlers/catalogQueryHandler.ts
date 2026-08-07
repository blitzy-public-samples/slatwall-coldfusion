// The catalog Lambda entrypoint.
//
// JUDGMENT CALL, and it is a deliberate narrowing rather than an oversight. Every one of the nine
// mutations names an entity that ALREADY EXISTS, by identifier, and none of them creates a row.
//
// LEGACY-DEFECT [model/service/ProductService.cfc:L220]: the repricing loop declares its counter
// as `for(i=1; i <= arrayLen(skus); i++)` with no `var`, so it leaks into the component variables
// scope.
// Preserved deliberately; do not fix without a product decision.
//
// LEGACY-DEFECT [model/service/ProductService.cfc:L119]: `processProduct_addOptionGroup` gives
// every existing SKU `options[1]` - the first option of the newly added group - rather than an
// option matched to that SKU.
// Preserved deliberately; do not fix without a product decision.

// The bundle format is a settled question and is not revisited here.

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { z } from 'zod';

import { listFindNoCase, listToArray } from '../lib/cfml/list.js';
// The published CFML case-folding primitive.
import { cfFoldKey } from '../lib/cfml/struct.js';
import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';
import type { OptionService } from '../services/optionService.js';
import type { ProductPage, ProductQueryCriteria } from '../services/productService.js';
import type { CompositionRoot, RequestScope } from './bootstrap.js';
import { bootstrapCompositionRoot } from './bootstrap.js';
import {
  MAX_PLACEHOLDER_COUNT,
  isPreparablePlaceholderCount,
} from '../repositories/mysql/connection.js';
import type { ErrorMappingContext, InvalidRequestReason, MappedFieldIssue } from './errorMapper.js';
import {
  PROTOTYPE_MEMBER_FIELD_ISSUE,
  containsPrototypeMemberKey,
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  resolveServerRequestId,
  routeDiagnosticLabel,
  forbiddenResponse,
  resolveRequestPrincipal,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import type { RouteAction, RoutedCapability } from './router.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';

// The capability this entrypoint owns, and the one action it implements.

/**
 * The capability this handler answers for, and no other.
 *
 * Handed to `resolveRouteForCapability` so that a request whose path belongs to one of the other
 * four capabilities is reported exactly as an unmatched route.
 */
const OWNED_CAPABILITY: RoutedCapability = 'catalogQuery';

/**
 * The route action this handler implements.
 *
 * `./router.js` owns RESOLUTION and this file owns INVOCATION, so the action arrives as DATA on
 * the matched descriptor and is checked here before anything is invoked.
 */
const IMPLEMENTED_ACTION: RouteAction = 'queryCatalog';

// The entity and payload types this file names, all derived from the request scope.
//
// Not one of them is imported from `src/domain/entities/**` or restated here, and that is the same
// discipline the product projection below already follows.

/**
 * The seven read-only entity loads, as the scope publishes them.
 */
type CatalogEntityLoaders = RequestScope['entityLoaders'];

/**
 * A product, as the loader answers one. `NonNullable` because a miss is handled separately.
 */
type CatalogProduct = NonNullable<
  Awaited<ReturnType<CatalogEntityLoaders['getProductByProductID']>>
>;

/**
 * A product type, on the same terms.
 */
type CatalogProductType = NonNullable<
  Awaited<ReturnType<CatalogEntityLoaders['getProductTypeByProductTypeID']>>
>;

/**
 * A brand, on the same terms.
 */
type CatalogBrand = NonNullable<Awaited<ReturnType<CatalogEntityLoaders['getBrandByBrandID']>>>;

/**
 * An option, inferred out of the map the option load answers.
 *
 * The load publishes `ReadonlyMap<string, Option>` rather than an array - see the loader for why a
 * map is what lets a caller tell which identifier missed.
 */
type CatalogOption =
  Awaited<ReturnType<CatalogEntityLoaders['getOptionsByOptionIDList']>> extends ReadonlyMap<
    string,
    infer TOption
  >
    ? TOption
    : never;

/**
 * The `ProductService` surface the scope publishes, whole.
 */
type CatalogProductService = RequestScope['productService'];

/**
 * The `BrandService` surface the scope publishes: one method.
 */
type CatalogBrandService = RequestScope['brandService'];

/**
 * [model/process/Product_AddOptionGroup.cfc:L49-L57], as the service declares it.
 */
type AddOptionGroupPayload = Parameters<CatalogProductService['processProduct_addOptionGroup']>[1];

/**
 * [model/process/Product_AddOption.cfc:L49-L57], as the service declares it.
 */
type AddOptionPayload = Parameters<CatalogProductService['processProduct_addOption']>[1];

/**
 * [model/process/Product_UpdateSkus.cfc:L49-L60], as the service declares it.
 */
type UpdateSkusPayload = Parameters<CatalogProductService['processProduct_updateSkus']>[1];

/**
 * The `required struct data` of [model/service/ProductService.cfc:L198].
 */
type DeleteDefaultImagePayload = Parameters<
  CatalogProductService['processProduct_deleteDefaultImage']
>[1];

/**
 * The save payload of [model/service/ProductService.cfc:L264].
 */
type SaveProductPayload = Parameters<CatalogProductService['saveProduct']>[1];

/**
 * The save payload of [model/service/ProductService.cfc:L294].
 */
type SaveProductTypePayload = Parameters<CatalogProductService['saveProductType']>[1];

/**
 * The save payload of [model/service/BrandService.cfc:L67].
 */
type SaveBrandPayload = Parameters<CatalogBrandService['saveBrand']>[1];

// The published operation vocabulary.

/**
 * The operations this capability publishes, named VERBATIM after the ported service methods they
 * invoke.
 *
 * A string-literal union rather than the TypeScript enumeration construct.
 */
export type CatalogQueryOperation =
  // The five reads, served on `GET`.
  | 'findProducts'
  | 'getFormattedOptionGroups'
  | 'getUnusedProductOptions'
  | 'getUnusedProductOptionGroups'
  | 'getOptionsForSelect'
  // The nine mutations, served on `POST`.
  | 'processProduct_addOptionGroup'
  | 'processProduct_addOption'
  | 'processProduct_updateSkus'
  | 'processProduct_deleteDefaultImage'
  | 'processProduct_updateDefaultImageFileNames'
  | 'saveProduct'
  | 'saveProductType'
  | 'deleteProduct'
  | 'saveBrand';

/**
 * The published operations as data, in the order they are documented.
 *
 * Frozen because this module is instantiated once per container and shared across every invocation
 * it serves, and `readonly` is a compile-time claim only.
 */
const CATALOG_QUERY_OPERATIONS: readonly CatalogQueryOperation[] = Object.freeze([
  'findProducts',
  'getFormattedOptionGroups',
  'getUnusedProductOptions',
  'getUnusedProductOptionGroups',
  'getOptionsForSelect',
  'processProduct_addOptionGroup',
  'processProduct_addOption',
  'processProduct_updateSkus',
  'processProduct_deleteDefaultImage',
  'processProduct_updateDefaultImageFileNames',
  'saveProduct',
  'saveProductType',
  'deleteProduct',
  'saveBrand',
]);

/**
 * The transport facts about each operation: the one method it answers on, and whether re-sending
 * it converges.
 *
 * One table rather than two, so a row cannot exist in one and not the other.
 *
 * `./router.js` matches a route on a comma list, so it can admit `GET,POST` for this path - but
 * the operation is not part of the path.
 */
export const CATALOG_OPERATION_TRANSPORT: Readonly<
  Record<CatalogQueryOperation, { readonly method: 'GET' | 'POST'; readonly resendable: boolean }>
> = Object.freeze({
  // The five reads. They write nothing at all, so re-running one is not merely safe but strictly
  // more correct than replaying a recorded body.
  findProducts: { method: 'GET', resendable: true },
  getFormattedOptionGroups: { method: 'GET', resendable: true },
  getUnusedProductOptions: { method: 'GET', resendable: true },
  getUnusedProductOptionGroups: { method: 'GET', resendable: true },
  getOptionsForSelect: { method: 'GET', resendable: true },
  processProduct_addOptionGroup: { method: 'POST', resendable: false },
  processProduct_addOption: { method: 'POST', resendable: false },

  // CONVERGES. It ASSIGNS the supplied price to every SKU rather than adjusting by it
  // [model/service/ProductService.cfc:L222-L227], so a second run with the same payload writes the
  // same values.
  processProduct_updateSkus: { method: 'POST', resendable: true },

  // Does not CONVERGE in the SENSE that MATTERS: the first run removes the named image and the
  // second finds nothing to remove, so the two runs do not answer identically even where the end
  // state is the same.
  processProduct_deleteDefaultImage: { method: 'POST', resendable: false },

  // CONVERGES. It recomputes each SKU's default image file name from the SKU's own options
  // [model/service/ProductService.cfc:L208-L214], which is a pure function of state already
  // stored.
  processProduct_updateDefaultImageFileNames: { method: 'POST', resendable: true },
  saveProduct: { method: 'POST', resendable: false },
  saveProductType: { method: 'POST', resendable: false },

  // Same asymmetry as the image deletion: the second run answers `false` where the first answered
  // `true`, because the row is gone.
  deleteProduct: { method: 'POST', resendable: false },

  // ACCUMULATES. Same URL-title generation as the two product saves
  // [model/service/BrandService.cfc:L70, L72].
  saveBrand: { method: 'POST', resendable: false },
});

/**
 * The query-string parameter that names the operation.
 *
 * JUDGMENT CALL: the operation travels as a query-string parameter and is REQUIRED, with no
 * default.
 *
 * And it is the selector for the nine mutations too, which carry a body.
 */
const OPERATION_PARAMETER = 'operation';

// Each shape below is a PROJECTION built from published accessors, never a serialized entity.

/**
 * One matched product, reduced to the two columns the executed statement selects.
 *
 * `productID` is always present: the ported entity answers it as a definite `string`, empty for an
 * unsaved product.
 */
export interface CatalogProductProjection {
  /**
   * [model/entity/Product.cfc:L52] via `Product.getProductID()`.
   */
  readonly productID: string;

  /**
   * [model/entity/Product.cfc:L55] via `Product.getProductName()`. Omitted when absent.
   */
  readonly productName?: string;
}

/**
 * The projection of one `ProductPage`.
 *
 * The paging members and the query contract are carried through exactly as the service published
 * them.
 */
export interface CatalogProductPageProjection {
  /**
   * The matched products, in repository order. Never reordered here.
   */
  readonly records: readonly CatalogProductProjection[];

  /**
   * How many products matched before the paging window was applied.
   */
  readonly recordsCount: number;

  /**
   * The zero-based start index the service actually applied.
   */
  readonly pageRecordsStart: number;

  /**
   * The window size actually applied. Omitted when the whole result set was returned.
   */
  readonly pageRecordsShow?: number;

  /**
   * The entity the legacy smart list was built against [model/service/ProductService.cfc:L343].
   */
  readonly entityName: ProductPage['entityName'];

  /**
   * The related-property joins the executed statement performs. Empty, and published as such.
   */
  readonly joins: ProductPage['joins'];

  /**
   * The properties the executed statement matches the keyword against.
   */
  readonly keywordProperties: ProductPage['keywordProperties'];
}

/**
 * One select row, exactly as the option port publishes it.
 *
 * Derived from the ported method's own return type rather than redeclared, so this file cannot
 * drift from the contract it forwards.
 */
export type CatalogSelectOptionProjection = Awaited<
  ReturnType<OptionService['getUnusedProductOptions']>
>[number];

/**
 * What one served operation returns, discriminated by the operation that produced it.
 *
 * A union rather than a widened bag, so a caller - and the suite that asserts on it - can tell
 * from the `operation` member alone which payload shape `result` carries.
 */
export type CatalogQueryResult =
  | {
      readonly operation: 'findProducts';
      readonly result: CatalogProductPageProjection;
    }
  | {
      readonly operation:
        'getUnusedProductOptions' | 'getUnusedProductOptionGroups' | 'getOptionsForSelect';
      readonly result: readonly CatalogSelectOptionProjection[];
    }
  | {
      readonly operation: 'getFormattedOptionGroups';
      readonly result: readonly CatalogFormattedOptionGroupProjection[];
    }
  | {
      readonly operation:
        | 'processProduct_addOptionGroup'
        | 'processProduct_addOption'
        | 'processProduct_updateSkus'
        | 'processProduct_deleteDefaultImage'
        | 'processProduct_updateDefaultImageFileNames'
        | 'saveProduct';
      readonly result: CatalogSavedProductProjection;
    }
  | {
      readonly operation: 'saveProductType';
      readonly result: CatalogSavedProductTypeProjection;
    }
  | {
      readonly operation: 'saveBrand';
      readonly result: CatalogSavedBrandProjection;
    }
  | {
      readonly operation: 'deleteProduct';
      readonly result: CatalogDeletionProjection;
    }
  | {
      readonly operation: CatalogQueryOperation;
      readonly unresolved: CatalogUnresolvedReason;
    }
  | {
      /**
       * A ported SAVE-CONTEXT RULE refused the payload, and these are the properties it named.
       */
      readonly operation: 'saveProduct' | 'saveProductType' | 'saveBrand';
      readonly refusedRules: readonly MappedFieldIssue[];
    };

/**
 * One formatted option group, exactly as `ProductService.getFormattedOptionGroups` publishes it.
 */
export type CatalogFormattedOptionGroupProjection = ReturnType<
  CatalogProductService['getFormattedOptionGroups']
>[number];

/**
 * A product after a mutation, reduced to the identifier, the name and the resolved URL title.
 */
export interface CatalogSavedProductProjection {
  /**
   * [model/entity/Product.cfc:L52] via `Product.getProductID()`.
   */
  readonly productID: string;

  /**
   * [model/entity/Product.cfc:L55] via `Product.getProductName()`. Omitted when absent.
   */
  readonly productName?: string;

  /**
   * [model/entity/Product.cfc:L54] via `Product.getUrlTitle()`. Omitted when absent.
   */
  readonly urlTitle?: string;
}
export interface CatalogSavedProductTypeProjection {
  /**
   * [model/entity/ProductType.cfc:L52] via `ProductType.getProductTypeID()`.
   */
  readonly productTypeID: string;

  /**
   * [model/entity/ProductType.cfc:L57] via `ProductType.getProductTypeName()`. Omitted when
   * absent.
   */
  readonly productTypeName?: string;

  /**
   * [model/entity/ProductType.cfc:L56] via `ProductType.getUrlTitle()`. Omitted when absent.
   */
  readonly urlTitle?: string;
}
export interface CatalogSavedBrandProjection {
  /**
   * [model/entity/Brand.cfc:L52] via `Brand.getBrandID()`.
   */
  readonly brandID: string;

  /**
   * [model/entity/Brand.cfc:L56] via `Brand.getBrandName()`. Omitted when absent.
   */
  readonly brandName?: string;

  /**
   * [model/entity/Brand.cfc:L55] via `Brand.getUrlTitle()`. Omitted when absent.
   */
  readonly urlTitle?: string;
}

/**
 * What `deleteProduct` answered.
 *
 * `ProductService.deleteProduct` answers `false` when the enforceable delete-context rule refuses
 * a product with transactions may not be deleted - and it does not throw.
 */
export interface CatalogDeletionProjection {
  /**
   * Whether the row was removed. `false` means a delete-context rule refused it.
   */
  readonly deleted: boolean;
}

/**
 * An identifier the request named matches no row.
 *
 * Reasoning is the module header's and is the same reasoning `./priceResolutionHandler.js` records
 * across its own five tokens: `RequestEntityLoaders` answers a miss with `undefined` rather than a
 * throw.
 *
 * There is no `optionGroupNotFound` and no `optionNotFound` for the two add operations, and the
 * absence is deliberate.
 */
export type CatalogUnresolvedReason =
  'productNotFound' | 'productTypeNotFound' | 'brandNotFound' | 'optionNotFound';

/**
 * The payload this capability places in the shared success envelope's `result` member.
 */
export type CatalogQueryResultDocument =
  | {
      /**
       * The operation that produced `result`.
       */
      readonly operation: CatalogQueryOperation;

      /**
       * The projected payload.
       */
      readonly result: CatalogServedPayload;
    }
  | {
      /**
       * The operation that could not be bound.
       */
      readonly operation: CatalogQueryOperation;

      /**
       * Which identifier the request named that matches no row.
       *
       * A second arm rather than an optional member on the first, so `result` and `unresolved` are
       * mutually exclusive by construction.
       */
      readonly unresolved: CatalogUnresolvedReason;
    };

/**
 * Every payload shape a served catalog operation can place in `result`.
 *
 * A union of the projections rather than a widened bag, and each member is the projection its own
 * operation produces.
 */
export type CatalogServedPayload =
  | CatalogProductPageProjection
  | readonly CatalogSelectOptionProjection[]
  | readonly CatalogFormattedOptionGroupProjection[]
  | CatalogSavedProductProjection
  | CatalogSavedProductTypeProjection
  | CatalogSavedBrandProjection
  | CatalogDeletionProjection;

// The bound on the work one invocation may request.

/**
 * How many operations one invocation may name.
 *
 * JUDGMENT CALL: the count is a target-chosen SAFETY bound. It is not a target, not a quota, not a
 * rate and not a capacity figure, and it carries no time dimension of any kind.
 */
const MAXIMUM_OPERATIONS_PER_INVOCATION = 1;

// The batch limits are the services' own, supplied by the composition root.
//
// A second remedy: a durable record keyed by caller plus canonical request digest, with key/digest
// mismatch refusal and TTL and byte bounds.

// Reading the request.
//
// Every lookup into a header, query or path map yields `T | undefined` under
// `noUncheckedIndexedAccess`, and every one of them is handled explicitly below.

/**
 * How many times the operation parameter was supplied.
 *
 * API Gateway reports a repeated query parameter on `multiValueQueryStringParameters`, and the
 * single-valued map keeps only one of them.
 */
function countSuppliedOperations(event: APIGatewayProxyEvent): number {
  const repeated = event.multiValueQueryStringParameters;
  if (repeated !== null) {
    const values = repeated[OPERATION_PARAMETER];
    if (values !== undefined) {
      return values.length;
    }
  }

  const single = event.queryStringParameters;
  if (single !== null && single[OPERATION_PARAMETER] !== undefined) {
    return 1;
  }

  return 0;
}

/**
 * The supplied query parameters, minus the operation selector.
 *
 * The selector is removed because it names the operation rather than being an input to it, and
 * each operation's parameter set is closed - see {@link hasClosedParameterSet}.
 */
function readOperationParameters(event: APIGatewayProxyEvent): Record<string, string> {
  const supplied = event.queryStringParameters;
  const parameters: Record<string, string> = {};

  if (supplied === null) {
    return parameters;
  }

  for (const [name, value] of Object.entries(supplied)) {
    if (name === OPERATION_PARAMETER || value === undefined) {
      continue;
    }
    defineOwnParameter(parameters, name, value);
  }

  return parameters;
}

/**
 * Define one query parameter as an enumerable own property.
 *
 * Assignment is not equivalent for the reserved name `__proto__`: on an ordinary object it reaches
 * the inherited setter instead of creating a key.
 */
function defineOwnParameter(target: Record<string, string>, name: string, value: string): void {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

/**
 * Recognize the operation a caller named, exactly.
 *
 * JUDGMENT CALL: the comparison is CASE-SENSITIVE, unlike the path matching in `./router.js`, and
 * the difference is deliberate. That module folds case because it is reproducing two CFML
 * comparisons that fold case [Application.cfc:L130, L133].
 */
function recognizeOperation(candidate: string): CatalogQueryOperation | undefined {
  for (const operation of CATALOG_QUERY_OPERATIONS) {
    if (operation === candidate) {
      return operation;
    }
  }
  return undefined;
}

// They validate the WIRE FORM of a query string - every value in one is a string.
//
// They restate no business rule, and one case makes the distinction concrete.
//
// An empty value is not a missing value, and that fidelity point is load-bearing twice over.

/**
 * A query-string value that carries a non-negative integer.
 *
 * The pattern admits digits only - no sign, no decimal point, no exponent and no whitespace.
 *
 * This is a WIRE-FORM parse and not a restatement of the service's rule.
 */
const nonNegativeIntegerParameter = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer with no sign, decimal point or exponent')
  .transform((value: string): number => Number.parseInt(value, 10))
  .refine((value: number): boolean => Number.isSafeInteger(value), {
    message: 'must not exceed the largest integer this runtime can represent exactly',
  });

/**
 * How many records one routed `findProducts` request may ask for.
 *
 * The routed contract therefore requires a page size rather than defaulting one.
 */
const MAXIMUM_PAGE_RECORDS = 500;

/**
 * A page size: a non-negative integer, required, and at most {@link MAXIMUM_PAGE_RECORDS}.
 */
const boundedPageSizeParameter = nonNegativeIntegerParameter.refine(
  (value: number): boolean => value <= MAXIMUM_PAGE_RECORDS,
  { message: `must be at most ${String(MAXIMUM_PAGE_RECORDS)} records for one routed request` },
);

/**
 * The closed criteria shape `findProducts` accepts.
 *
 * One member per member of `ProductQueryCriteria`, and no index signature: the framework smart
 * list's open-ended, string-keyed filter surface is not reopened here (AAP 0.6.2).
 *
 * `keyword` is REQUIRED because the service declares it required, and the service declares it
 * required because the statement binds it unconditionally.
 */
const findProductsParameters = z.object({
  keyword: z.string(),
  productTypeIDs: z.string().optional(),
  pageRecordsStart: nonNegativeIntegerParameter.optional(),
  pageRecordsShow: boundedPageSizeParameter,
  currentURL: z.string().optional(),
});

/**
 * The closed shape `getUnusedProductOptions` accepts [model/service/OptionService.cfc:L72].
 *
 * Both parameters are declared `required` in the legacy signature, so both must be PRESENT here -
 * present and empty included, for the reason given above.
 */
const getUnusedProductOptionsParameters = z.object({
  productID: z.string(),
  existingOptionGroupIDList: z.string(),
});

/**
 * The closed shape `getUnusedProductOptionGroups` accepts [model/service/OptionService.cfc:L76].
 */
const getUnusedProductOptionGroupsParameters = z.object({
  existingOptionGroupIDList: z.string(),
});

/**
 * The empty published-parameter list every mutation carries.
 */
const NO_QUERY_PARAMETERS: readonly string[] = Object.freeze([]);

/**
 * The closed shape `getFormattedOptionGroups` accepts [model/service/ProductService.cfc:L70].
 *
 * One PARAMETER, and it is the product the formatted groups are read from.
 */
const getFormattedOptionGroupsParameters = z.object({
  productID: z.string(),
});

/**
 * The closed shape `getOptionsForSelect` accepts [model/service/OptionService.cfc:L55].
 *
 * The ported signature takes `readonly Option[]`, not A LIST, and this is the one operation where
 * the transport shape and the service shape genuinely differ.
 */
const getOptionsForSelectParameters = z.object({
  optionIDs: z.string(),
});

/**
 * The parameter names each operation publishes, derived from the schema that consumes them.
 *
 * Keyed by the operation union, so an operation without a parameter set is a compile error rather
 * than a silent hole.
 *
 * Payload travels in the JSON body, so any query parameter beyond the operation selector itself is
 * refused rather than ignored.
 */
const PUBLISHED_PARAMETER_NAMES: Readonly<Record<CatalogQueryOperation, readonly string[]>> =
  Object.freeze({
    findProducts: Object.freeze(Object.keys(findProductsParameters.shape)),
    getFormattedOptionGroups: Object.freeze(Object.keys(getFormattedOptionGroupsParameters.shape)),
    getUnusedProductOptions: Object.freeze(Object.keys(getUnusedProductOptionsParameters.shape)),
    getUnusedProductOptionGroups: Object.freeze(
      Object.keys(getUnusedProductOptionGroupsParameters.shape),
    ),
    getOptionsForSelect: Object.freeze(Object.keys(getOptionsForSelectParameters.shape)),
    processProduct_addOptionGroup: NO_QUERY_PARAMETERS,
    processProduct_addOption: NO_QUERY_PARAMETERS,
    processProduct_updateSkus: NO_QUERY_PARAMETERS,
    processProduct_deleteDefaultImage: NO_QUERY_PARAMETERS,
    processProduct_updateDefaultImageFileNames: NO_QUERY_PARAMETERS,
    saveProduct: NO_QUERY_PARAMETERS,
    saveProductType: NO_QUERY_PARAMETERS,
    deleteProduct: NO_QUERY_PARAMETERS,
    saveBrand: NO_QUERY_PARAMETERS,
  });

// The nine mutation payloads.
//
// The two deliberately wide member types are preserved as wide.

/**
 * An identifier naming a row that must already exist.
 *
 * NON-EMPTY, unlike the query-string identifiers above, and the asymmetry is deliberate rather
 * than inconsistent.
 */
const EXISTING_ROW_IDENTIFIER_RULE = 'is required and must name an existing row';

/**
 * The sentence is supplied twice, so an absent identifier and an empty one are refused
 * identically.
 */
const existingRowIdentifier = z
  .string(EXISTING_ROW_IDENTIFIER_RULE)
  .min(1, EXISTING_ROW_IDENTIFIER_RULE);

/**
 * A CFML flag as JSON carries one: a string, a number or a boolean, all three admitted.
 */
const cfmlFlagMember = z.union([z.string(), z.number(), z.boolean()]);

/**
 * A decimal amount as JSON carries one. Not converted to `Money` here - see the module header.
 */
const decimalAmountMember = z.union([z.string(), z.number()]);

/**
 * [model/process/Product_AddOptionGroup.cfc:L49-L57] plus the product the method's first parameter
 * names.
 */
const addOptionGroupBody = z.strictObject({
  productID: existingRowIdentifier,
  optionGroup: existingRowIdentifier,
});

/**
 * [model/process/Product_AddOption.cfc:L49-L57] plus the product.
 */
const addOptionBody = z.strictObject({
  productID: existingRowIdentifier,
  option: existingRowIdentifier,
});

/**
 * [model/process/Product_UpdateSkus.cfc:L49-L60] plus the product.
 *
 * All four payload members are OPTIONAL here because all four are optional on the ported input,
 * and the conditional requiredness between them is the service's schema to enforce.
 */
const updateSkusBody = z.strictObject({
  productID: existingRowIdentifier,
  updatePriceFlag: cfmlFlagMember.optional(),
  price: decimalAmountMember.optional(),
  updateListPriceFlag: cfmlFlagMember.optional(),
  listPrice: decimalAmountMember.optional(),
});

/**
 * The one sibling whose second parameter is `required struct data` rather than a process object
 * [model/service/ProductService.cfc:L198].
 *
 * `imageFile` is OPTIONAL because the legacy body gates every use of it behind
 * `structKeyExists(arguments.data, "imageFile")` [model/service/ProductService.cfc:L199].
 */
const deleteDefaultImageBody = z.strictObject({
  productID: existingRowIdentifier,
  imageFile: z.string().optional(),
});

/**
 * [model/service/ProductService.cfc:L208] takes the product and nothing else.
 */
const updateDefaultImageFileNamesBody = z.strictObject({
  productID: existingRowIdentifier,
});

/**
 * The `saveProduct` payload [model/service/ProductService.cfc:L264].
 *
 * Eight of the eleven members of `ProductSaveInput`, `AND` the three omitted are omitted on
 * principle.
 */
const saveProductBody = z.strictObject({
  productID: existingRowIdentifier,
  urlTitle: z.string().optional(),
  productName: z.string().optional(),
  productCode: z.string().optional(),
  productDescription: z.string().optional(),
  activeFlag: z.boolean().optional(),
  publishedFlag: z.boolean().optional(),
  sortOrder: z.number().optional(),
  remoteID: z.string().optional(),
});

/**
 * The `saveProductType` payload [model/service/ProductService.cfc:L294].
 *
 * `activeFlag` and `publishedFlag` are typed `boolean` rather than the CFML input union, matching
 * `ProductTypeSaveInput`.
 */
const saveProductTypeBody = z.strictObject({
  productTypeID: existingRowIdentifier,
  urlTitle: z.string().optional(),
  productTypeName: z.string().optional(),
  productTypeDescription: z.string().optional(),
  systemCode: z.string().optional(),
  activeFlag: z.boolean().optional(),
  publishedFlag: z.boolean().optional(),
});

/**
 * [model/service/ProductService.cfc:L317] takes the product and nothing else.
 */
const deleteProductBody = z.strictObject({
  productID: existingRowIdentifier,
});

/**
 * The `saveBrand` payload [model/service/BrandService.cfc:L67].
 */
const saveBrandBody = z.strictObject({
  brandID: existingRowIdentifier,
  urlTitle: z.string().optional(),
  brandName: z.string().optional(),
  activeFlag: cfmlFlagMember.optional(),
  publishedFlag: cfmlFlagMember.optional(),
  brandWebsite: z.string().optional(),
  remoteID: z.string().optional(),
});

/**
 * Whether every supplied parameter belongs to the operation's published set.
 *
 * Why this is a separate check rather than a strict schema.
 *
 * The grammar is genuinely closed: an unrecognized parameter is refused rather than ignored, so a
 * caller mis-spelling `pageRecordsShow` is told.
 */
function hasClosedParameterSet(
  operation: CatalogQueryOperation,
  parameters: Readonly<Record<string, string>>,
): boolean {
  const published = PUBLISHED_PARAMETER_NAMES[operation];

  for (const supplied of Object.keys(parameters)) {
    if (!published.includes(supplied)) {
      return false;
    }
  }

  return true;
}

// The refusals this file decides for itself.
//
// Every sentence below is FIXED and handler-authored, and none of them names a submitted value, a
// submitted key, a route, a host, a credential or a statement.

/**
 * The dotted label the operation selector is reported under.
 */
const OPERATION_ISSUE_PATH = OPERATION_PARAMETER;

/**
 * The label an unpublished query parameter is reported under. Names the container, never the key.
 */
const QUERY_STRING_ISSUE_PATH = 'queryStringParameters';

/**
 * The published operations, rendered once for the refusal sentences that list them.
 */
const PUBLISHED_OPERATION_LIST = CATALOG_QUERY_OPERATIONS.join(', ');

/**
 * No operation was named at all.
 */
const MISSING_OPERATION_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message: `is required and must name exactly one of: ${PUBLISHED_OPERATION_LIST}`,
});

/**
 * More operations were named than one invocation may serve.
 *
 * The sentence states the refusal and that nothing was truncated, because a caller that sent two
 * operations needs to know it received neither rather than silently the first.
 */
const TOO_MANY_OPERATIONS_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message:
    `may be supplied at most ${String(MAXIMUM_OPERATIONS_PER_INVOCATION)} time per request; ` +
    'a request naming more is refused whole and is never truncated to the first',
});

/**
 * The named operation is not one this capability publishes. The submitted token is not echoed.
 */
const UNKNOWN_OPERATION_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message: `must name one of the operations this capability publishes: ${PUBLISHED_OPERATION_LIST}`,
});

/**
 * A parameter outside the named operation's closed set was supplied. The key is not echoed.
 */
const UNPUBLISHED_PARAMETER_ISSUE: MappedFieldIssue = Object.freeze({
  path: QUERY_STRING_ISSUE_PATH,
  message:
    'carries a parameter the named operation does not publish; the criteria shape is closed, and ' +
    'an unrecognized parameter is refused rather than ignored',
});

/**
 * The named operation is not served on the request's method.
 *
 * The sentence names neither the method sent nor the operation named, and it deliberately does not
 * say which method would have worked.
 *
 * Not A 405, for the reason `./router.js` records for the whole subtree: FW/1 dispatched an action
 * by any method, so there is no method-not-allowed concept in the source to port.
 */
const OPERATION_METHOD_MISMATCH_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message:
    'names an operation this capability does not serve on the request method; each operation is ' +
    'served on exactly one method, and a request using the other one is refused rather than ' +
    'reinterpreted',
});

// The invocation plan.

/**
 * One validated request, discriminated by the operation it will invoke.
 *
 * Every entity argument is still an identifier at this point.
 */
type CatalogQueryInvocation =
  | {
      readonly operation: 'findProducts';
      readonly criteria: ProductQueryCriteria;
    }
  | {
      readonly operation: 'getFormattedOptionGroups';
      readonly productID: string;
    }
  | {
      readonly operation: 'getUnusedProductOptions';
      readonly productID: string;
      readonly existingOptionGroupIDList: string;
    }
  | {
      readonly operation: 'getUnusedProductOptionGroups';
      readonly existingOptionGroupIDList: string;
    }
  | {
      readonly operation: 'getOptionsForSelect';
      readonly optionIDs: string;
    }
  | {
      readonly operation: 'processProduct_addOptionGroup';
      readonly productID: string;
      readonly input: AddOptionGroupPayload;
    }
  | {
      readonly operation: 'processProduct_addOption';
      readonly productID: string;
      readonly input: AddOptionPayload;
    }
  | {
      readonly operation: 'processProduct_updateSkus';
      readonly productID: string;
      readonly input: UpdateSkusPayload;
    }
  | {
      readonly operation: 'processProduct_deleteDefaultImage';
      readonly productID: string;
      readonly input: DeleteDefaultImagePayload;
    }
  | {
      readonly operation: 'processProduct_updateDefaultImageFileNames';
      readonly productID: string;
    }
  | {
      readonly operation: 'saveProduct';
      readonly productID: string;
      readonly input: SaveProductPayload;
    }
  | {
      readonly operation: 'saveProductType';
      readonly productTypeID: string;
      readonly input: SaveProductTypePayload;
    }
  | {
      readonly operation: 'deleteProduct';
      readonly productID: string;
    }
  | {
      readonly operation: 'saveBrand';
      readonly brandID: string;
      readonly input: SaveBrandPayload;
    };

/**
 * Which caller comma-lists one plan carries, and what else the statement binds alongside each.
 *
 * Four of the fourteen operations carry one; the other ten carry none and answer an empty list.
 *
 * `findProducts` - `productTypeIDs` becomes `productTypeID in (...)` and the statement also binds
 * the required keyword [model/dao/ProductDAO.cfc:L422-L425], so one further placeholder.
 */
function describeCommaLists(
  invocation: CatalogQueryInvocation,
): readonly (readonly [
  parameterName: string,
  value: string | undefined,
  additionalPlaceholderCount: number,
  emptyListBindsOne: boolean,
])[] {
  switch (invocation.operation) {
    case 'findProducts':
      return [['productTypeIDs', invocation.criteria.productTypeIDs, 1, false]];

    case 'getUnusedProductOptions':
      return [['existingOptionGroupIDList', invocation.existingOptionGroupIDList, 1, true]];

    case 'getUnusedProductOptionGroups':
      return [['existingOptionGroupIDList', invocation.existingOptionGroupIDList, 0, true]];

    case 'getOptionsForSelect':
      return [['optionIDs', invocation.optionIDs, 0, false]];

    // The ten remaining operations bind identifiers one at a time and no caller-expanded list, so
    // there is no placeholder count a caller can influence.
    case 'getFormattedOptionGroups':
    case 'processProduct_addOptionGroup':
    case 'processProduct_addOption':
    case 'processProduct_updateSkus':
    case 'processProduct_deleteDefaultImage':
    case 'processProduct_updateDefaultImageFileNames':
    case 'saveProduct':
    case 'saveProductType':
    case 'deleteProduct':
    case 'saveBrand':
      return [];
  }
}

/**
 * The first admitted comma-list too wide for a preparable statement, or nothing.
 *
 * Capability's fourteen operations forward a comma-delimited identifier list that becomes one SQL
 * placeholder per ELEMENT - `existingOptionGroupIDList` at [model/dao/OptionDAO.cfc:L68, L107] -
 * and `findProducts` forwards a third, `productTypeIDs`.
 *
 * @returns the field-level issue to publish, or `undefined` when every list is preparable.
 */
function firstUnpreparableCommaList(
  invocation: CatalogQueryInvocation,
): MappedFieldIssue | undefined {
  const lists: readonly (readonly [
    parameterName: string,
    value: string | undefined,
    additionalPlaceholderCount: number,
    emptyListBindsOne: boolean,
  ])[] = describeCommaLists(invocation);

  for (const [parameterName, value, additionalPlaceholderCount, emptyListBindsOne] of lists) {
    if (value === undefined) {
      continue;
    }

    const elementCount = listToArray(value).length;
    const listPlaceholderCount = emptyListBindsOne ? Math.max(1, elementCount) : elementCount;
    const placeholderCount = listPlaceholderCount + additionalPlaceholderCount;

    if (!isPreparablePlaceholderCount(placeholderCount)) {
      const maximumListElements = MAX_PLACEHOLDER_COUNT - additionalPlaceholderCount;

      return Object.freeze({
        path: parameterName,
        message:
          `must name at most ${String(maximumListElements)} identifiers for this operation, which ` +
          'with the statement’s other bound values is the most MySQL can prepare; a longer list is ' +
          'refused whole rather than shortened, because dropping an element would change which ' +
          'records match',
      });
    }
  }

  return undefined;
}

/**
 * Validate the supplied parameters for one operation and produce the plan.
 *
 * Throws the schema's own rejection, which `./errorMapper.js` recognizes as a validation failure
 * and publishes as field paths plus constraint descriptions - never the submitted values.
 *
 * The switch is exhaustive over the closed operation union, so adding an operation without
 * planning it is a compile error rather than a runtime fall-through.
 */
function planInvocation(
  operation: CatalogQueryOperation,
  parameters: Readonly<Record<string, string>>,
  document: object | undefined,
): CatalogQueryInvocation {
  switch (operation) {
    case 'findProducts': {
      const supplied = findProductsParameters.parse(parameters);

      // Built member by member rather than forwarded wholesale, so that each member of the ported
      // criteria shape is visible at the seam.
      const criteria: ProductQueryCriteria = {
        keyword: supplied.keyword,
        productTypeIDs: supplied.productTypeIDs,
        pageRecordsStart: supplied.pageRecordsStart,
        pageRecordsShow: supplied.pageRecordsShow,
        currentURL: supplied.currentURL,
      };

      return { operation, criteria };
    }

    case 'getUnusedProductOptions': {
      const supplied = getUnusedProductOptionsParameters.parse(parameters);

      return {
        operation,
        productID: supplied.productID,
        existingOptionGroupIDList: supplied.existingOptionGroupIDList,
      };
    }

    case 'getUnusedProductOptionGroups': {
      const supplied = getUnusedProductOptionGroupsParameters.parse(parameters);

      return { operation, existingOptionGroupIDList: supplied.existingOptionGroupIDList };
    }

    case 'getFormattedOptionGroups': {
      const supplied = getFormattedOptionGroupsParameters.parse(parameters);

      return { operation, productID: supplied.productID };
    }

    case 'getOptionsForSelect': {
      const supplied = getOptionsForSelectParameters.parse(parameters);

      return { operation, optionIDs: supplied.optionIDs };
    }

    // From here on the payload comes from `document`, and `parameters` is provably empty.
    //
    // `document` is typed `object | undefined` and is parsed rather than asserted.

    case 'processProduct_addOptionGroup': {
      const supplied = addOptionGroupBody.parse(document);

      return {
        operation,
        productID: supplied.productID,
        input: { optionGroup: supplied.optionGroup },
      };
    }

    case 'processProduct_addOption': {
      const supplied = addOptionBody.parse(document);

      return { operation, productID: supplied.productID, input: { option: supplied.option } };
    }

    case 'processProduct_updateSkus': {
      const supplied = updateSkusBody.parse(document);

      // Built member by member, and every absence forwarded as ABSENCE under
      // `exactOptionalPropertyTypes`: `ProductUpdateSkusInput` declares all four members optional.
      const input: UpdateSkusPayload = {
        ...(supplied.updatePriceFlag === undefined
          ? {}
          : { updatePriceFlag: supplied.updatePriceFlag }),
        ...(supplied.price === undefined ? {} : { price: supplied.price }),
        ...(supplied.updateListPriceFlag === undefined
          ? {}
          : { updateListPriceFlag: supplied.updateListPriceFlag }),
        ...(supplied.listPrice === undefined ? {} : { listPrice: supplied.listPrice }),
      };

      return { operation, productID: supplied.productID, input };
    }

    case 'processProduct_deleteDefaultImage': {
      const supplied = deleteDefaultImageBody.parse(document);

      // `imageFile` absent is what the legacy `structKeyExists(arguments.data, "imageFile")` guard
      // at [model/service/ProductService.cfc:L199] tests for, so the key is omitted rather than
      // set to `undefined`.
      const input: DeleteDefaultImagePayload =
        supplied.imageFile === undefined ? {} : { imageFile: supplied.imageFile };

      return { operation, productID: supplied.productID, input };
    }

    case 'processProduct_updateDefaultImageFileNames': {
      const supplied = updateDefaultImageFileNamesBody.parse(document);

      return { operation, productID: supplied.productID };
    }

    case 'saveProduct': {
      const supplied = saveProductBody.parse(document);
      const input: SaveProductPayload = {
        ...(supplied.urlTitle === undefined ? {} : { urlTitle: supplied.urlTitle }),
        ...(supplied.productName === undefined ? {} : { productName: supplied.productName }),
        ...(supplied.productCode === undefined ? {} : { productCode: supplied.productCode }),
        ...(supplied.productDescription === undefined
          ? {}
          : { productDescription: supplied.productDescription }),
        ...(supplied.activeFlag === undefined ? {} : { activeFlag: supplied.activeFlag }),
        ...(supplied.publishedFlag === undefined ? {} : { publishedFlag: supplied.publishedFlag }),
        ...(supplied.sortOrder === undefined ? {} : { sortOrder: supplied.sortOrder }),
        ...(supplied.remoteID === undefined ? {} : { remoteID: supplied.remoteID }),
      };

      return { operation, productID: supplied.productID, input };
    }

    case 'saveProductType': {
      const supplied = saveProductTypeBody.parse(document);

      const input: SaveProductTypePayload = {
        ...(supplied.urlTitle === undefined ? {} : { urlTitle: supplied.urlTitle }),
        ...(supplied.productTypeName === undefined
          ? {}
          : { productTypeName: supplied.productTypeName }),
        ...(supplied.productTypeDescription === undefined
          ? {}
          : { productTypeDescription: supplied.productTypeDescription }),
        ...(supplied.systemCode === undefined ? {} : { systemCode: supplied.systemCode }),
        ...(supplied.activeFlag === undefined ? {} : { activeFlag: supplied.activeFlag }),
        ...(supplied.publishedFlag === undefined ? {} : { publishedFlag: supplied.publishedFlag }),
      };

      return { operation, productTypeID: supplied.productTypeID, input };
    }

    case 'deleteProduct': {
      const supplied = deleteProductBody.parse(document);

      return { operation, productID: supplied.productID };
    }

    case 'saveBrand': {
      const supplied = saveBrandBody.parse(document);

      const input: SaveBrandPayload = {
        ...(supplied.urlTitle === undefined ? {} : { urlTitle: supplied.urlTitle }),
        ...(supplied.brandName === undefined ? {} : { brandName: supplied.brandName }),
        ...(supplied.activeFlag === undefined ? {} : { activeFlag: supplied.activeFlag }),
        ...(supplied.publishedFlag === undefined ? {} : { publishedFlag: supplied.publishedFlag }),
        ...(supplied.brandWebsite === undefined ? {} : { brandWebsite: supplied.brandWebsite }),
        ...(supplied.remoteID === undefined ? {} : { remoteID: supplied.remoteID }),
      };

      return { operation, brandID: supplied.brandID, input };
    }
  }
}

/**
 * The element type of a matched product page, taken from the service's own published shape.
 *
 * Derived rather than imported: `src/domain/entities/product.ts` is not among this file's
 * dependencies.
 */
type MatchedProduct = ProductPage['records'][number];

/**
 * Rename one matched row's two members onto the two this surface publishes.
 *
 * The member is OMITTED when the row carries no name, which is the whole of how absence is
 * represented on this surface.
 */
function projectProduct(match: MatchedProduct): CatalogProductProjection {
  const productName = match.value;

  return productName === undefined ? { productID: match.id } : { productID: match.id, productName };
}

/**
 * Project one product page, preserving repository order exactly.
 */
function projectProductPage(page: ProductPage): CatalogProductPageProjection {
  const projected: CatalogProductPageProjection = {
    records: page.records.map(projectProduct),
    recordsCount: page.recordsCount,
    pageRecordsStart: page.pageRecordsStart,
    entityName: page.entityName,
    joins: page.joins,
    keywordProperties: page.keywordProperties,
  };

  return page.pageRecordsShow === undefined
    ? projected
    : { ...projected, pageRecordsShow: page.pageRecordsShow };
}

/**
 * Invoke EXACTLY one ported service method for the planned operation and project its result.
 *
 * Every arm is a single `await` on a single service member, and no arm computes, adjusts, combines
 * or re-derives anything the service returned.
 *
 * The switch is exhaustive over the plan union, so an unplanned arm is a compile error.
 */
async function invokeCatalogOperation(
  scope: RequestScope,
  invocation: CatalogQueryInvocation,
): Promise<CatalogQueryResult> {
  switch (invocation.operation) {
    case 'findProducts': {
      const page = await scope.productService.findProducts(invocation.criteria);

      return { operation: invocation.operation, result: projectProductPage(page) };
    }

    case 'getUnusedProductOptions': {
      const rows = await scope.optionService.getUnusedProductOptions(
        invocation.productID,
        invocation.existingOptionGroupIDList,
      );

      return { operation: invocation.operation, result: rows };
    }

    case 'getUnusedProductOptionGroups': {
      const rows = await scope.optionService.getUnusedProductOptionGroups(
        invocation.existingOptionGroupIDList,
      );

      return { operation: invocation.operation, result: rows };
    }

    case 'getFormattedOptionGroups': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      // SYNCHRONOUS, and awaited nowhere, because the ported method is synchronous: it traverses
      // the product's already-materialized option groups and reaches nothing
      // [model/service/ProductService.cfc:L70].
      return {
        operation: invocation.operation,
        result: scope.productService.getFormattedOptionGroups(product),
      };
    }

    case 'getOptionsForSelect': {
      // The caller's list, parsed with CFML list semantics - the same parse the option adapters
      // apply, so an untidy list is read here exactly as it would be read there.
      const requestedOptionIDs = listToArray(invocation.optionIDs);
      const loaded = await scope.entityLoaders.getOptionsByOptionIDList(requestedOptionIDs);

      // Answers an unordered map keyed by case-folded identifier, so the list is walked rather
      // than the map: the projection then carries the options in the order the caller named them.
      const options: CatalogOption[] = [];

      for (const optionID of requestedOptionIDs) {
        const option = loaded.get(cfFoldKey(optionID));

        if (option === undefined) {
          return { operation: invocation.operation, unresolved: 'optionNotFound' };
        }

        options.push(option);
      }
      return {
        operation: invocation.operation,
        result: scope.optionService.getOptionsForSelect(options),
      };
    }

    case 'processProduct_addOptionGroup': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }
      const saved = await scope.productService.processProduct_addOptionGroup(
        product,
        invocation.input,
      );

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'processProduct_addOption': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      const saved = await scope.productService.processProduct_addOption(product, invocation.input);

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'processProduct_updateSkus': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      // The batch bound is the service's.
      const saved = await scope.productService.processProduct_updateSkus(product, invocation.input);

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'processProduct_deleteDefaultImage': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      const saved = await scope.productService.processProduct_deleteDefaultImage(
        product,
        invocation.input,
      );

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'processProduct_updateDefaultImageFileNames': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      const saved = await scope.productService.processProduct_updateDefaultImageFileNames(product);

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'saveProduct': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      // The save returns whether or not it validated, exactly as the legacy returns
      // [model/service/ProductService.cfc:L291].
      const saved = await scope.productService.saveProduct(product, invocation.input);
      const refusedRules = failedSaveIssues(saved);

      return refusedRules === undefined
        ? { operation: invocation.operation, result: projectSavedProduct(saved) }
        : { operation: invocation.operation, refusedRules };
    }

    case 'saveProductType': {
      const productType = await scope.entityLoaders.getProductTypeByProductTypeID(
        invocation.productTypeID,
      );

      if (productType === undefined) {
        return { operation: invocation.operation, unresolved: 'productTypeNotFound' };
      }

      const saved = await scope.productService.saveProductType(productType, invocation.input);
      const refusedRules = failedSaveIssues(saved);

      return refusedRules === undefined
        ? { operation: invocation.operation, result: projectSavedProductType(saved) }
        : { operation: invocation.operation, refusedRules };
    }

    case 'deleteProduct': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      const deleted = await scope.productService.deleteProduct(product);

      return { operation: invocation.operation, result: { deleted } };
    }

    case 'saveBrand': {
      const brand = await scope.entityLoaders.getBrandByBrandID(invocation.brandID);

      if (brand === undefined) {
        return { operation: invocation.operation, unresolved: 'brandNotFound' };
      }

      const saved = await scope.brandService.saveBrand(brand, invocation.input);
      const refusedRules = failedSaveIssues(saved);

      return refusedRules === undefined
        ? { operation: invocation.operation, result: projectSavedBrand(saved) }
        : { operation: invocation.operation, refusedRules };
    }
  }
}

/**
 * Project one product after a mutation.
 */
function projectSavedProduct(product: CatalogProduct): CatalogSavedProductProjection {
  const productName = product.getProductName();
  const urlTitle = product.getUrlTitle();

  return {
    productID: product.getProductID(),
    ...(productName === undefined ? {} : { productName }),
    ...(urlTitle === undefined ? {} : { urlTitle }),
  };
}
function projectSavedProductType(
  productType: CatalogProductType,
): CatalogSavedProductTypeProjection {
  const productTypeName = productType.getProductTypeName();
  const urlTitle = productType.getUrlTitle();

  return {
    productTypeID: productType.getProductTypeID(),
    ...(productTypeName === undefined ? {} : { productTypeName }),
    ...(urlTitle === undefined ? {} : { urlTitle }),
  };
}
function projectSavedBrand(brand: CatalogBrand): CatalogSavedBrandProjection {
  const brandName = brand.getBrandName();
  const urlTitle = brand.getUrlTitle();

  return {
    brandID: brand.getBrandID(),
    ...(brandName === undefined ? {} : { brandName }),
    ...(urlTitle === undefined ? {} : { urlTitle }),
  };
}

/**
 * How many records a served result carries. Reported on the log line, never inferred from it.
 *
 * A result that is not a collection reports one, and an unresolved outcome reports ZERO.
 */
function countServedRecords(served: CatalogQueryResult): number {
  if ('unresolved' in served || 'refusedRules' in served) {
    return 0;
  }

  if (served.operation === 'findProducts') {
    return served.result.records.length;
  }

  return Array.isArray(served.result) ? served.result.length : 1;
}

/**
 * Build the response for one served result: the shared success envelope, or the 400 a failed
 * ported save rule earns.
 *
 * Two OUTCOMES and one FUNCTION, because the choice between them is a single question about the
 * result and nothing else.
 */
function servedOrRefused(
  served: CatalogQueryResult,
  requestId: string,
  context: ErrorMappingContext,
): APIGatewayProxyResult {
  if ('refusedRules' in served) {
    return invalidRequestResponse('unusableRequestInput', context, served.refusedRules);
  }

  const document: CatalogQueryResultDocument =
    'unresolved' in served
      ? { operation: served.operation, unresolved: served.unresolved }
      : { operation: served.operation, result: served.result };

  return jsonSuccessResponse(requestId, OWNED_CAPABILITY, IMPLEMENTED_ACTION, document);
}

// Reading the request body, for the nine mutations.

/**
 * A decoded request document, or this handler's own reason for refusing to decode one.
 *
 * Each refusal NAMES a reason from `./errorMapper.js`'s closed union and lets that module own the
 * sentence.
 */
type CatalogDocumentReading =
  | { readonly decoded: true; readonly document: object }
  | {
      readonly decoded: false;
      readonly reason: InvalidRequestReason;
      readonly fields?: readonly MappedFieldIssue[] | undefined;
    };

/**
 * Maximum decoded request document this compact payload grammar admits.
 *
 * JUDGMENT CALL: a target-chosen SAFETY bound on how much text one invocation will parse, stated
 * as one. It is not a target, a quota, a rate or a capacity figure and carries no time dimension.
 */
const MAXIMUM_REQUEST_DOCUMENT_BYTES = 8 * 1024;

/**
 * Encoded length above which a base64 body cannot decode within the byte ceiling.
 */
const MAXIMUM_ENCODED_BODY_LENGTH = Math.ceil((MAXIMUM_REQUEST_DOCUMENT_BYTES * 4) / 3) + 4;

/**
 * Decode a mutation's request body into a JSON object.
 *
 * A base64 body is decoded first - API Gateway sets `isBase64Encoded` for a binary media type, and
 * a caller that does so is not making a different request.
 */
function readRequestDocument(event: APIGatewayProxyEvent): CatalogDocumentReading {
  const rawBody = event.body;

  if (rawBody === null || rawBody.trim().length === 0) {
    return { decoded: false, reason: 'missingRequestBody' };
  }

  if (event.isBase64Encoded && rawBody.length > MAXIMUM_ENCODED_BODY_LENGTH) {
    return { decoded: false, reason: 'unusableRequestInput' };
  }

  const text = event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;

  if (Buffer.byteLength(text, 'utf8') > MAXIMUM_REQUEST_DOCUMENT_BYTES) {
    return { decoded: false, reason: 'unusableRequestInput' };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { decoded: false, reason: 'unparsableRequestBody' };
  }

  // An array and a bare scalar are both well-formed JSON and neither is a request document. The
  // schemas would reject them, but naming the shape here produces the more precise reason.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { decoded: false, reason: 'unsupportedBodyShape' };
  }

  // The one unrecognized key `z.strictObject` does not refuse, refused here instead.
  if (containsPrototypeMemberKey(parsed)) {
    return {
      decoded: false,
      reason: 'unusableRequestInput',
      fields: [PROTOTYPE_MEMBER_FIELD_ISSUE],
    };
  }

  return { decoded: true, document: parsed };
}

// A ported save rule that failed.

/**
 * The entity error register `HibachiTransient` published and the three ported saves reproduce.
 *
 * Structural, and derived from nothing: it is the shape the entities publish, and this file names
 * only the two members it reads.
 */
interface CatalogErrorRegister {
  hasErrors(): boolean;
  getErrors(): Readonly<Record<string, readonly string[]>>;
}

/**
 * The at-most-{@link MAXIMUM_PUBLISHED_SAVE_ISSUES} field issues one failed save publishes, or
 * nothing.
 *
 * This is why a failed save is a 400 rather than a 200 `OR` a throw.
 *
 * `getErrors()` is keyed by PROPERTY IDENTIFIER - a name declared in `model/validation/*.json` and
 * ported into the services, so a literal of this subtree's own source.
 *
 * @returns the issues to publish, or `undefined` when the entity validated.
 */
function failedSaveIssues(entity: CatalogErrorRegister): readonly MappedFieldIssue[] | undefined {
  if (!entity.hasErrors()) {
    return undefined;
  }

  const issues: MappedFieldIssue[] = [];

  for (const [propertyIdentifier, messages] of Object.entries(entity.getErrors())) {
    if (issues.length >= MAXIMUM_PUBLISHED_SAVE_ISSUES) {
      break;
    }

    issues.push(
      Object.freeze({
        path: propertyIdentifier,
        message: messages.join('; '),
      }),
    );
  }

  return issues;
}

/**
 * How many failed-rule issues one refusal publishes.
 *
 * JUDGMENT CALL: a target-chosen bound on RESPONSE SIZE, matching the discipline
 * `./errorMapper.js` applies to a validator's issue list. It is not a target, a quota, a rate or a
 * capacity figure and carries no time dimension.
 */
const MAXIMUM_PUBLISHED_SAVE_ISSUES = 20;

// The exported surface.

/**
 * What this handler may be built over, for a suite that needs to drive it without a database.
 *
 * Both members are optional and both default to the production wiring, so the exported `handler`
 * needs no arguments.
 *
 * `exactOptionalPropertyTypes` is on, so each member spells `| undefined` rather than relying on
 * the `?` alone.
 */
export interface CatalogQueryHandlerDependencies {
  /**
   * Resolve the wired composition root.
   *
   * This handler never constructs a service, a repository, a port or a pool of its own; it asks
   * this function for the root and asks the root for one request scope.
   */
  readonly compositionRoot?: (() => Promise<CompositionRoot>) | undefined;

  /**
   * Where structured lines are emitted. Defaults to the process logger, which writes JSON to
   * stdout for the platform to collect.
   */
  readonly logger?: Logger | undefined;
}

/**
 * The shape this module's Lambda entrypoint takes.
 *
 * Two parameters rather than the runtime's three: the callback form is not used, because an
 * `async` handler returns its result.
 */
export type CatalogQueryLambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult>;

/**
 * The operation the request names, from whichever query-string map carries it.
 *
 * The single-valued map is consulted first because it is what API Gateway always populates; the
 * multi-value map is the fallback for an event that carries only that one.
 */
function readNamedOperation(event: APIGatewayProxyEvent): string | undefined {
  const single = event.queryStringParameters;
  if (single !== null) {
    const named = single[OPERATION_PARAMETER];
    if (named !== undefined && named.trim().length > 0) {
      return named.trim();
    }
  }

  const repeated = event.multiValueQueryStringParameters;
  if (repeated !== null) {
    const values = repeated[OPERATION_PARAMETER];
    if (values !== undefined) {
      for (const value of values) {
        if (value.trim().length > 0) {
          return value.trim();
        }
      }
    }
  }

  return undefined;
}

/**
 * Build a catalog-query Lambda entrypoint.
 *
 * @param dependencies Optional test seams.
 * @returns A handler holding NO per-request state of its own - only the resolved logger and the
 * memoized composition-root accessor, both of which are read-only for the container's life.
 */
export function createCatalogQueryHandler(
  dependencies: CatalogQueryHandlerDependencies = {},
): CatalogQueryLambdaHandler {
  const resolveCompositionRoot =
    dependencies.compositionRoot ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot());
  const log = dependencies.logger ?? processLogger;

  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const requestId = resolveServerRequestId(event, context);
    let mappingContext: ErrorMappingContext = { requestId, logger: log };

    try {
      const resolution = resolveRouteForCapability(
        routeRequestFromEvent(event),
        OWNED_CAPABILITY,
        mappingContext,
      );

      if (!resolution.matched) {
        return resolution.response;
      }

      // From here on the diagnostic label is built ENTIRELY from the matched row's own frozen
      // members - its declared methods and its canonical path - and from nothing the caller sent.
      mappingContext = {
        requestId,
        route: routeDiagnosticLabel(resolution.route.methods, resolution.route.path),
        logger: log,
      };

      if (resolution.route.action !== IMPLEMENTED_ACTION) {
        return routeNotFoundResponse(mappingContext);
      }

      // The admission gate, in two steps: identified, then administrative.
      //
      // `getUnusedProductOptions` and `getUnusedProductOptionGroups` are consumed at exactly two
      // sites, `admin/views/entity/preprocessproduct_addoption.cfm:L60` and
      // `admin/views/entity/preprocessproduct_addoptiongroup.cfm:L60` - both inside `admin/`.
      const principalResolution = resolveRequestPrincipal(event);
      if (!principalResolution.identified) {
        // The reason is a closed literal from `./errorMapper.js`, carried in the message rather
        // than widening the logger's default-deny context allow-list. No claim name or caller text
        // appears.
        log.warn(`catalog query refused: no caller principal (${principalResolution.reason})`, {
          requestId,
          route: mappingContext.route,
        });

        return unauthenticatedResponse(mappingContext);
      }

      if (!principalResolution.principal.adminAccountFlag) {
        // No account identifier and no claim name on the log line.
        log.warn('catalog query refused: the caller principal carries no administrative claim', {
          requestId,
          route: mappingContext.route,
        });

        return forbiddenResponse(mappingContext);
      }
      if (countSuppliedOperations(event) > MAXIMUM_OPERATIONS_PER_INVOCATION) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          TOO_MANY_OPERATIONS_ISSUE,
        ]);
      }

      const named = readNamedOperation(event);
      if (named === undefined) {
        return invalidRequestResponse('missingQueryParameter', mappingContext, [
          MISSING_OPERATION_ISSUE,
        ]);
      }

      const operation = recognizeOperation(named);
      if (operation === undefined) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          UNKNOWN_OPERATION_ISSUE,
        ]);
      }

      // The route admits `GET,POST` and an operation answers to one of them.
      //
      // Asked before the body is read and before any schema runs, so a `GET` naming a mutation
      // costs no parse, and a `POST` naming a read is refused without its body being decoded.
      if (listFindNoCase(CATALOG_OPERATION_TRANSPORT[operation].method, event.httpMethod) === 0) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          OPERATION_METHOD_MISMATCH_ISSUE,
        ]);
      }
      const parameters = readOperationParameters(event);
      if (!hasClosedParameterSet(operation, parameters)) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          UNPUBLISHED_PARAMETER_ISSUE,
        ]);
      }

      // A read carries no body and none is read for one.
      let document: object | undefined;

      if (CATALOG_OPERATION_TRANSPORT[operation].method === 'POST') {
        const reading = readRequestDocument(event);

        if (!reading.decoded) {
          return invalidRequestResponse(reading.reason, mappingContext, reading.fields);
        }

        document = reading.document;
      }

      const invocation = planInvocation(operation, parameters, document);

      // The BOUND is the PROTOCOL'S, not A POLICY: above it MySQL cannot prepare the statement
      // however it is sent, so this rejects nothing the legacy could have answered.
      const overWideList = firstUnpreparableCommaList(invocation);
      if (overWideList !== undefined) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [overWideList]);
      }
      {
        // The per-request scope factory, invoked EXACTLY once per invocation.
        //
        // The authenticated account is carried into the scope even though no operation this
        // capability publishes consults it for PRICING.
        //
        // The value is the authorizer's, which is the entire point.
        const root = await resolveCompositionRoot();
        const scope = await root.createRequestScope({
          accountID: principalResolution.principal.accountID,
          adminAccountFlag: principalResolution.principal.adminAccountFlag,
        });

        const served = await invokeCatalogOperation(scope, invocation);

        // The operation name travels in the MESSAGE.
        log.info(`catalog query served: ${served.operation}`, {
          requestId,
          route: mappingContext.route,
          resultCount: countServedRecords(served),
        });

        return servedOrRefused(served, requestId, mappingContext);
      }
    } catch (thrown: unknown) {
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/**
 * The lambda entry point for the catalog-query capability.
 */
export const handler: APIGatewayProxyHandler = createCatalogQueryHandler();
