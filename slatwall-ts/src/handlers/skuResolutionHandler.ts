// The SKU resolution Lambda entrypoint.
//
// A thin primary adapter over five already-ported read operations.

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';

// `listToArray` counts the selected-options list exactly as the statement builder parses it - one
// element, one correlated `exists` clause - which is what makes the work bound measure the work.
import { listToArray } from '../lib/cfml/list.js';
import { structGet, structKeyList } from '../lib/cfml/struct.js';
import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';
import type { CompositionRoot, RequestScope } from './bootstrap.js';
import { bootstrapCompositionRoot } from './bootstrap.js';
import type { ErrorMappingContext, MappedFieldIssue } from './errorMapper.js';
import {
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  resolveServerRequestId,
  routeDiagnosticLabel,
  resolveRequestPrincipal,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import type { RouteAction, RoutedCapability } from './router.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';

// Section 1 - the operation set.

/**
 * The operations this capability publishes, under their VERBATIM legacy CFML names.
 *
 * `./router.js` deliberately publishes one route per capability and no operation-selection surface
 * of its own.
 *
 * Withdrawal is the aap-aligned answer rather than a reduction in scope.
 */
export type SkuResolutionOperation = 'getProductSkusBySelectedOptions' | 'getSkuBySkuCode';

/**
 * The capability this handler answers for, and only this one.
 *
 * Passed to `resolveRouteForCapability` so that a request whose path belongs to one of the other
 * four capabilities is reported exactly as an unmatched route.
 */
const SKU_RESOLUTION_CAPABILITY: RoutedCapability = 'skuResolution';

/**
 * The action `ROUTE_TABLE.skuResolution` declares.
 */
const SKU_RESOLUTION_ACTION: RouteAction = 'resolveSkus';

/**
 * The query parameter that names the operation.
 *
 * A single explicit discriminator, rather than inferring the operation from which other parameters
 * happen to be present.
 */
const OPERATION_QUERY_PARAMETER = 'operation';

/**
 * A query parameter is singular on this transport; repeats are refused rather than collapsed.
 */
const MAXIMUM_VALUES_PER_PARAMETER = 1;

// All three decisions now live once, in `./errorMapper.js`, beside the failure half of the same
// contract it already owned - the response construction, the header set.

// Section 2 - the types the service tier hands over.
//
// Derived from the service surface rather than imported from `src/domain/entities/`.
//
// JUDGMENT CALL, with two reasons and one cost, all stated.

/**
 * The SKU entity as the ported service tier publishes it.
 *
 * `SkuService.getSkuBySkuCode` is declared `Promise<Sku | undefined>`, so unwrapping the promise
 * and stripping the miss arm yields exactly the `Sku` class.
 */
type ResolvedSku = NonNullable<Awaited<ReturnType<RequestScope['skuService']['getSkuBySkuCode']>>>;

/**
 * One per-currency entry of the four-step cascade [model/entity/Sku.cfc:L367-L433], as the entity
 * publishes it.
 *
 * Derived from the accessor's return type for the reason recorded on the section header.
 */
type ResolvedCurrencyDetail = NonNullable<ReturnType<ResolvedSku['getCurrencyDetails']>[string]>;

// Section 3 - the published response shape.

/**
 * One per-currency price entry, rendered for transport.
 *
 * Each optional member spells `| undefined` alongside the `?`, which is what
 * `exactOptionalPropertyTypes` requires in order for an absent value to be assignable at all.
 */
export interface CurrencyDetailProjection {
  /**
   * The `SwSkuCurrency` row the prices came from, or `''` when they came from the SKU's own
   * columns or from a conversion [model/entity/Sku.cfc:L382, L412].
   */
  readonly skuCurrencyID: string;

  /**
   * The price in this currency, at full precision. Omitted when the cascade recorded none.
   */
  readonly price?: string | undefined;

  /**
   * The cascade's own presentation string for `price`, verbatim.
   */
  readonly priceFormatted?: string | undefined;

  /**
   * The list price in this currency, at full precision. Omitted when the cascade recorded none.
   */
  readonly listPrice?: string | undefined;

  /**
   * The cascade's own presentation string for `listPrice`, verbatim.
   */
  readonly listPriceFormatted?: string | undefined;

  /**
   * The renewal price in this currency, at full precision. Omitted when the cascade recorded none.
   */
  readonly renewalPrice?: string | undefined;

  /**
   * The cascade's own presentation string for `renewalPrice`, verbatim.
   */
  readonly renewalPriceFormatted?: string | undefined;

  /**
   * `false` when the price came from the SKU's own columns or an override row, `true` when it was
   * converted on the fly [model/entity/Sku.cfc:L396, L411, L427].
   */
  readonly converted?: boolean | undefined;
}

/**
 * A SKU, rendered for transport.
 *
 * `getCurrencyCode()` is also absent, for a different reason: it resolves `skuCurrency` through
 * the settings port and raises when no provider was injected.
 *
 * Everything present is a synchronous, total accessor over already-materialized state.
 */
export interface SkuProjection {
  /**
   * [model/entity/Sku.cfc:L52] the primary key.
   */
  readonly skuID: string;

  /**
   * [model/entity/Sku.cfc:L54]. OMITTED when the SKU carries none - never `''` and never `null`.
   */
  readonly skuCode?: string | undefined;
  readonly activeFlag: boolean;

  /**
   * [model/entity/Sku.cfc:L56] `price`, at full precision.
   */
  readonly price: string;

  /**
   * [model/entity/Sku.cfc:L55] `listPrice`, at full precision.
   */
  readonly listPrice: string;

  /**
   * [model/entity/Sku.cfc:L57] `renewalPrice`, at full precision.
   */
  readonly renewalPrice: string;

  /**
   * [model/entity/Sku.cfc:L58]. Omitted when the SKU carries no image file name.
   */
  readonly imageFile?: string | undefined;
  readonly userDefinedPriceFlag: boolean;

  /**
   * The SKU's option identifiers as a CFML comma-delimited list, exactly as the entity builds it.
   *
   * Carried in list form rather than as an array, because that is the shape the legacy accessor
   * publishes and because it is the shape `getProductSkusBySelectedOptions` CONSUMES.
   */
  readonly optionIDList: string;

  /**
   * The owning product's identifier [model/entity/Sku.cfc:L65].
   */
  readonly productID?: string | undefined;

  /**
   * The materialized per-currency price map [model/entity/Sku.cfc:L367-L433].
   *
   * `{}` when the eligibility gate at [model/entity/Sku.cfc:L373] was closed, or when this SKU was
   * hydrated for a path that needs no currency-aware price.
   */
  readonly currencyDetails: Readonly<Record<string, CurrencyDetailProjection>>;
}

/**
 * What one dispatched operation produced, discriminated by the operation that produced it.
 *
 * A discriminated union on `operation` rather than a single loose envelope, so a consumer - and
 * the compiler - cannot read `skus` off a response that answered a single SKU.
 */
export type SkuResolutionOutcome =
  | {
      /**
       * Must-preserve: AND-of-EXISTS option matching [model/dao/SkuDAO.cfc:L107-L128].
       */
      readonly operation: 'getProductSkusBySelectedOptions';
      /**
       * Every matching sku, in the order the service returned them. Never re-ordered here.
       */
      readonly skus: readonly SkuProjection[];
    }
  | {
      readonly operation: 'getSkuBySkuCode';
      /**
       * The matching SKU, or nothing. On a miss this member is OMITTED from the serialized
       * document - see {@link serializeOutcome} for why omission is the faithful encoding and why
       * neither `null`, `0` nor `{}` is used.
       */
      readonly sku?: SkuProjection | undefined;
    };

/**
 * The capability-specific payload of a successful response.
 *
 * The `requestId` member is GONE from here rather than duplicated: the shared envelope carries it
 * once, at the top level, and echoing it twice would let the two copies disagree.
 *
 * Published as a type so the net-new test tier can parse a body without restating its shape,
 * exactly as `./errorMapper.js` publishes `ErrorResponseBody` for the failure side.
 */
export interface SkuResolutionResultDocument {
  /**
   * What the dispatched operation produced.
   */
  readonly outcome: SkuResolutionOutcome;
}

// Section 4 - request validation.
//
// CFML `required string x` rejects a missing argument and accepts an empty one.
//
// What the schemas do enforce is that the parameters an operation needs are PRESENT.

/**
 * The operation name, validated against the closed set.
 *
 * A `z.enum` over the same two literals {@link SkuResolutionOperation} declares.
 *
 * Three literals were removed - `searchSkusByProductType`, `getTransactionExistsFlag` and
 * `findSkus`.
 */
const operationSchema = z.enum(['getProductSkusBySelectedOptions', 'getSkuBySkuCode']);

/**
 * The operation name in the position it actually occupies: a member of the query struct.
 *
 * This one stays non-strict while every schema below is strict, and the asymmetry is required
 * rather than an oversight.
 */
const operationEnvelopeSchema = z.object({
  operation: operationSchema,
});

/**
 * And it is a bound on event content, not on an http request line, which is what makes it load
 * bearing rather than decorative.
 */
export const MAXIMUM_SELECTED_OPTIONS_BYTES = 8 * 1024;

/**
 * How many elements {@link MAXIMUM_SELECTED_OPTIONS_BYTES} can admit on its own. Derived, not a
 * rule.
 *
 * A CONSEQUENCE, not A SECOND RULE - and computed rather than written down, so the two figures
 * cannot drift apart.
 *
 * It is still published, and the reason is unchanged: it makes the byte bound's own cost legible.
 */
export const MAXIMUM_SELECTED_OPTION_ELEMENTS = Math.floor(
  (MAXIMUM_SELECTED_OPTIONS_BYTES + 1) / 2,
);

/**
 * The most correlated subqueries one ROUTED invocation will ask the database to carry, which is the
 * resource-exhaustion bound on this route.
 *
 * Handler as CREATE with no source file, so there is no legacy HTTP route whose admission
 * behaviour this could contradict.
 *
 * Expressed as a power of two purely so the relationships above are checkable by eye: it is a
 * quarter of {@link MAXIMUM_SELECTED_OPTION_ELEMENTS} and a sixty-fourth of the protocol ceiling.
 */
export const MAXIMUM_SELECTED_OPTION_SUBQUERIES = 1024;

/**
 * `selectedOptions` stays a comma-delimited string all the way to the SQL.
 *
 * AAP 0.6.5's batch limits govern unbounded bulk mutation - `processProduct_updateSkus`
 * [model/service/ProductService.cfc:L216-L233], which saves per sku, and `createSkus`
 * [model/service/SkuService.cfc:L109-L121].
 *
 * So this schema carries no pattern, no trim, no case fold and no de-duplication, and the
 * comma-list the caller sent is the comma-list the service receives.
 */
const getProductSkusBySelectedOptionsSchema = z.object({
  operation: z.literal('getProductSkusBySelectedOptions'),
  selectedOptions: z
    .string()
    .refine(
      (value: string): boolean =>
        Buffer.byteLength(value, 'utf8') <= MAXIMUM_SELECTED_OPTIONS_BYTES,
      { message: 'must not be longer than the published bound' },
    )
    // The work bound, argued in full on {@link MAXIMUM_SELECTED_OPTION_SUBQUERIES}.
    //
    // The message names the WORK and neither the parameter's members nor the caller's value: a
    // refusal here publishes no submitted text.
    .refine(
      (value: string): boolean => listToArray(value).length <= MAXIMUM_SELECTED_OPTION_SUBQUERIES,
      { message: 'must not exceed the published correlated-subquery bound' },
    ),
  productID: z.string(),
});

/**
 * So the pass-through is restored, and with it the downstream behaviour: a routed caller that
 * omits `skuCode` reaches the service exactly as an in-process caller does.
 *
 * An EMPTY `skuCode` is ADMITTED, unchanged and independent of all of the above: `z.string()`
 * accepts `''`, the legacy would bind `''` and match nothing.
 */
const getSkuBySkuCodeSchema = z.object({
  operation: z.literal('getSkuBySkuCode'),
  skuCode: z.string().optional(),
});

/**
 * The closed parameter set for each surviving routed operation.
 */
const PUBLISHED_PARAMETER_NAMES: Readonly<Record<SkuResolutionOperation, readonly string[]>> =
  Object.freeze({
    getProductSkusBySelectedOptions: Object.freeze(
      Object.keys(getProductSkusBySelectedOptionsSchema.shape),
    ),
    getSkuBySkuCode: Object.freeze(Object.keys(getSkuBySkuCodeSchema.shape)),
  });

/**
 * Whether every caller-supplied key belongs to the named operation's published parameter set.
 */
function hasClosedParameterSet(
  operation: SkuResolutionOperation,
  parameters: Readonly<Record<string, string | undefined>>,
): boolean {
  const published = PUBLISHED_PARAMETER_NAMES[operation];

  for (const supplied of Object.keys(parameters)) {
    if (supplied !== OPERATION_QUERY_PARAMETER && !published.includes(supplied)) {
      return false;
    }
  }

  return true;
}

/**
 * Fixed, non-reflective refusal for a key outside the named operation's closed set.
 */
const UNPUBLISHED_PARAMETER_ISSUE: MappedFieldIssue = Object.freeze({
  path: 'queryStringParameters',
  message:
    'carries a parameter the named operation does not publish; the query surface is closed, and ' +
    'an unrecognized parameter is refused rather than silently dropped',
});

/**
 * Fixed refusal for any parameter supplied more than once.
 */
const REPEATED_PARAMETER_ISSUE: MappedFieldIssue = Object.freeze({
  path: 'multiValueQueryStringParameters',
  message:
    'carries a parameter more than once; each parameter of this capability admits exactly one ' +
    'value, and a repeated parameter is refused whole rather than collapsed to one of the values',
});

// `productTypeID` is singular on the sku side and plural on the product side.

// Section 5 - what is deliberately not exposed.
//
// Enumerated in source rather than left to inference, because "this handler does not publish X" is
// only auditable if X is named.

/**
 * The members of the two ported services that this routed surface does not publish, each with the
 * reason it is absent.
 *
 * LEGACY-DEFECT [model/dao/SkuDAO.cfc:L163]: `var hql &= "WHERE..."` re-declares a variable
 * already declared at L152, which is not valid CFML.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder` deletes the memo
 * only when the memo does not exist, so the condition is inverted and the clear can never fire.
 * Preserved deliberately; do not fix without a product decision.
 *
 * TODO CARRY-FORWARD [model/dao/SkuDAO.cfc:L177]: "test to see if this query works with DB's other
 * than MSSQL and MySQL" - the legacy TODO on `getSortedProductSkusID`, whose `ORDER BY` branches
 * on the database product name.
 */
export const NON_EXPOSED_SURFACE_NOTES: Readonly<Record<string, string>> = Object.freeze({
  // LEGACY-DEFECT [model/service/SkuService.cfc:L281]: `getSkuStocksDeletableFlag` calls a DAO
  // method that does not exist; it fails as a raw engine error, not a Hibachi message.
  // Preserved deliberately; do not fix without a product decision.
  getSkuStocksDeletableFlag:
    'Not exposed. [model/service/SkuService.cfc:L281] delegates to a SkuDAO method that does not ' +
    'exist and cannot be dispatched, so the legacy raises on every call. Reproduced at the service ' +
    'tier, deliberately omitted from the seven-member SkuRepository port, and no replacement query ' +
    'is authored anywhere.',

  /**
   * Takes a hydrated `Product`. Unreachable at this tier, and that is a property of the
   * composition root rather than a choice made here.
   */
  getProductSkus:
    'Not exposed. [model/service/SkuService.cfc:L220] takes a hydrated Product entity. ' +
    'RequestScope publishes no repository and no service publishes a load-by-identifier, and a ' +
    'primary adapter constructs no entity, so no Product instance can be obtained here. The ' +
    'option-based SKU resolution the AAP assigns to this capability is reached through ' +
    'getProductSkusBySelectedOptions, which takes identifiers.',

  /**
   * Same entity-argument boundary, plus an ordering contract that must not be re-derived.
   */
  getSortedProductSkus:
    'Not exposed. [model/service/SkuService.cfc:L246] takes a hydrated Product entity, for the same ' +
    'reason as getProductSkus. Its ordering by option-group sort order ' +
    '[model/dao/SkuDAO.cfc:L172-L202] is CONTRACT and is reproduced in the repository statement; no ' +
    'sorting, re-sorting or re-ordering of any returned collection happens in this module.',

  /**
   * The unbounded creation path is not published by this read-only capability.
   */
  createSkus:
    'Not exposed. Three independent reasons, each sufficient: it takes a hydrated Product entity; ' +
    'it is a durable mutation and the shared route table declares this capability GET-only, so a ' +
    'mutation behind it would invent HTTP semantics the source never had; and its odometer over the ' +
    'full cartesian product of option groups [model/service/SkuService.cfc:L105-L121] is unbounded ' +
    'by construction.',

  /**
   * A durable mutation delegating to a STUB port. Absent for the same route-shape reason.
   */
  processImageUpload:
    'Not exposed. [model/service/SkuService.cfc:L210] is a durable write that delegates to the ' +
    'imageStore STUB port, whose stub behaviour is documented at the composition root. The route ' +
    'table declares this capability GET-only, so no write is routable here; publishing a stubbed ' +
    'write would let a caller mistake stub output for a real successful write. No image business ' +
    'logic is added anywhere in this module.',

  /**
   * Out of scope, and one branch of it raises where a sibling branch is guarded.
   */
  subscriptionAndContentAccessSkuCreation:
    'Not exposed. The subscription branch [model/service/SkuService.cfc:L139-L170] and the ' +
    'contentAccess branch [L172-L202] are out of scope; the contentAccess branch has NO port and ' +
    'none is invented. The missing-guard asymmetry is preserved as written: [L142] and [L147] test ' +
    'for their input before reading it while [L163-L165] reads renewalSubscriptionBenefits with no ' +
    'guard and therefore raises. The guard is NOT added.',

  /**
   * Out-of-scope features that happen to live in an in-scope service file.
   */
  outOfScopeProductProcesses:
    'Not exposed. processProduct_addProductReview [model/service/ProductService.cfc:L157], ' +
    'processProduct_addSubscriptionTerm [model/service/ProductService.cfc:L173], ' +
    'processProduct_uploadDefaultImage [model/service/ProductService.cfc:L235] and ' +
    'loadDataFromFile [model/service/ProductService.cfc:L65] serve out-of-scope features. ' +
    'loadDataFromFile additionally sets a one-hour request timeout at ' +
    '[model/service/ProductService.cfc:L66], which no request behind an API gateway can be given; no ' +
    'job queue, step function or queue hop is invented to work around that, because the source had ' +
    'none.',
  getTransactionExistsFlag:
    'WITHDRAWN from the routed surface, because it could never have answered. ' +
    '[model/service/SkuService.cfc:L285-L287] declares no parameters and forwards none, and ' +
    'MysqlSkuRepository.getTransactionExistsFlag raises a named SkuColumnError when neither ' +
    'productID nor skuID is supplied - which is CORRECT PARITY, because ' +
    '[model/dao/SkuDAO.cfc:L59-L63] takes its <cfelse> arm and executes with an UNDEFINED ' +
    'arguments.productID, so the legacy cannot serve that call either. Against the real composition ' +
    'the route could only ever produce a 500. Withdrawn rather than repaired: supplying an ' +
    'identifier means widening a signature the AAP fixes at getTransactionExistsFlag(): ' +
    'Promise<boolean> (AAP 0.4.2), and this tier holds no authority to reshape it. The service keeps ' +
    'its faithful raise and its own coverage; no test double papers over it here.',
  searchSkusByProductType:
    'WITHDRAWN from the routed surface, because it is unbounded. Returns Sku[] complete and unpaged ' +
    '[model/service/SkuService.cfc:L271-L273], and no member of that signature can bound it. ' +
    'Bounding it means adding a parameter the legacy does not have, which is a signature reshaping ' +
    'this tier may not allocate. AAP 0.4.1 specifies this entrypoint as exposing ' +
    'getProductSkusBySelectedOptions and SKU lookup, so the action was never AAP-named. Still ' +
    'reachable in-process by any caller holding the service, with its own service-tier coverage.',
  findSkus:
    'WITHDRAWN from the routed surface, because it is unbounded. Returns a whole SkuPage, and ' +
    'SkuQueryCriteria declares NO paging ' +
    'members at all, so a routed contract has nothing to bound - a page size cannot be required of a ' +
    'caller and then forwarded to a criteria object with nowhere to put it. Adding paging members ' +
    'reshapes a signature the AAP has already spent its smart-list allocation on (AAP 0.6.2). Never ' +
    'AAP-named for this entrypoint. Still reachable in-process, with its own service-tier coverage.',

  /**
   * The whole of the excluded pipeline, named so the boundary is explicit.
   */
  outOfScopeModules:
    'Not exposed. Nothing from OrderService, checkout, cart, payment, shipping, fulfillment, ' +
    'account, subscription, vendor or tax; nothing from the Taffy REST layer; nothing from the Mura ' +
    'CMS bridge; no integration adapter other than Google, which belongs to a different capability; ' +
    'and no org/Hibachi/** capability, which is a boundary to extract from and never modify.',
});

// Section 6 - projection.
//
// Pure, synchronous, total functions from an entity to a transport shape.

/**
 * Render a monetary value for transport, at FULL PRECISION.
 *
 * A response body is a machine-readable document, not a display surface.
 *
 * The `Money` surface is CLOSED and is used exactly as published: no `Number()`, no `parseFloat`,
 * no `toFixed` on a raw number, no arithmetic.
 *
 * @param amount the monetary value to render.
 * @returns every significant digit of the value as a plain decimal numeral.
 */
function renderMoney(amount: { toDecimalString(): string }): string {
  return amount.toDecimalString();
}

/**
 * Render one per-currency cascade entry.
 *
 * The `*Formatted` members are the cascade's own presentation strings and are copied verbatim -
 * this module formats nothing.
 *
 * @param detail one entry of the materialized per-currency map.
 * @returns the transport form of that entry.
 */
function projectCurrencyDetail(detail: ResolvedCurrencyDetail): CurrencyDetailProjection {
  return {
    skuCurrencyID: detail.skuCurrencyID,
    price: detail.price === undefined ? undefined : renderMoney(detail.price),
    priceFormatted: detail.priceFormatted,
    listPrice: detail.listPrice === undefined ? undefined : renderMoney(detail.listPrice),
    listPriceFormatted: detail.listPriceFormatted,
    renewalPrice: detail.renewalPrice === undefined ? undefined : renderMoney(detail.renewalPrice),
    renewalPriceFormatted: detail.renewalPriceFormatted,
    converted: detail.converted,
  };
}

/**
 * Render the whole materialized per-currency map.
 *
 * The `undefined` arm of the read is handled explicitly even though a key just returned by
 * `structKeyList` must be present: `noUncheckedIndexedAccess` is on, a non-null assertion is
 * banned throughout `src/**`.
 *
 * @param sku the SKU whose map is to be rendered.
 * @returns the transport form of the map; `{}` when the map is empty, which is a legitimate state.
 */
function projectCurrencyDetails(
  sku: ResolvedSku,
): Readonly<Record<string, CurrencyDetailProjection>> {
  const details = sku.getCurrencyDetails();
  const projected: Record<string, CurrencyDetailProjection> = {};

  for (const currencyCode of structKeyList(details)) {
    const detail = structGet(details, currencyCode);

    if (detail === undefined) {
      continue;
    }

    projected[currencyCode] = projectCurrencyDetail(detail);
  }

  return projected;
}

/**
 * `skuCode`, `imageFile` and `productID` are carried as `undefined` when absent and are therefore
 * omitted from the serialized document.
 *
 * @param sku the SKU to render.
 * @returns its transport form.
 */
function projectSku(sku: ResolvedSku): SkuProjection {
  const product = sku.getProduct();

  return {
    skuID: sku.getSkuID(),
    skuCode: sku.getSkuCode(),
    activeFlag: sku.getActiveFlag(),
    price: renderMoney(sku.getPrice()),
    listPrice: renderMoney(sku.getListPrice()),
    renewalPrice: renderMoney(sku.getRenewalPrice()),
    imageFile: sku.getImageFile(),
    userDefinedPriceFlag: sku.getUserDefinedPriceFlag(),
    optionIDList: sku.getOptionsIDList(),
    productID: product === undefined ? undefined : product.getProductID(),
    currencyDetails: projectCurrencyDetails(sku),
  };
}

/**
 * Render a collection of SKUs.
 *
 * Order is preserved exactly, and nothing else happens to the collection.
 *
 * @param skus the collection exactly as the service returned it.
 * @returns the same collection, same length, same order, in transport form.
 */
function projectSkus(skus: readonly ResolvedSku[]): readonly SkuProjection[] {
  return skus.map((sku) => projectSku(sku));
}

// Section 7 - validation and dispatch, as two steps.
//
// Interleaving the two - validating each operation's arguments inside its dispatch arm - would put
// the composition root and an open request scope ahead of an argument-level rejection.

/**
 * One validated invocation: the operation, plus exactly the arguments that operation takes.
 *
 * A discriminated union on `operation`, so the dispatcher reads only arguments the operation
 * actually declares, and the compiler rejects a reference to any other.
 */
type ValidatedInvocation =
  | {
      readonly operation: 'getProductSkusBySelectedOptions';
      /**
       * Comma-delimited, verbatim. Never parsed, split, trimmed, sorted or de-duplicated.
       */
      readonly selectedOptions: string;
      readonly productID: string;
    }
  | {
      readonly operation: 'getSkuBySkuCode';
      readonly skuCode?: string | undefined;
    };

/**
 * Validate a request into an invocation, or throw.
 *
 * @param parameters the request's query parameters, unvalidated.
 * @returns a fully-typed invocation.
 * @throws the validator's error when the operation is unrecognized, or when an argument the
 * operation requires is absent or ill-typed.
 */
function validateInvocation(
  parameters: Readonly<Record<string, string | undefined>>,
): ValidatedInvocation {
  const { operation } = operationEnvelopeSchema.parse(parameters);

  switch (operation) {
    case 'getProductSkusBySelectedOptions': {
      const input = getProductSkusBySelectedOptionsSchema.parse(parameters);

      return {
        operation,
        selectedOptions: input.selectedOptions,
        productID: input.productID,
      };
    }

    case 'getSkuBySkuCode': {
      const input = getSkuBySkuCodeSchema.parse(parameters);

      return { operation, skuCode: input.skuCode };
    }
  }
}

/**
 * Invoke EXACTLY one ported service method and project its result.
 *
 * One `switch` over a closed union, one service call per arm, and no logic between them.
 *
 * @param invocation the validated operation and its arguments.
 * @param scope THIS invocation's request scope.
 * @returns what the invoked operation produced, in transport form.
 * @throws whatever the invoked service method throws.
 */
async function invokeOperation(
  invocation: ValidatedInvocation,
  scope: RequestScope,
): Promise<SkuResolutionOutcome> {
  switch (invocation.operation) {
    case 'getProductSkusBySelectedOptions': {
      const skus = await scope.productService.getProductSkusBySelectedOptions(
        invocation.selectedOptions,
        invocation.productID,
      );

      return { operation: invocation.operation, skus: projectSkus(skus) };
    }

    case 'getSkuBySkuCode': {
      const sku = await scope.skuService.getSkuBySkuCode(invocation.skuCode);

      // `undefined` on a miss, carried through. Not `0`, not `null`, not an empty object, and not
      // a sku with zeroed prices.
      return {
        operation: invocation.operation,
        sku: sku === undefined ? undefined : projectSku(sku),
      };
    }
  }
}

// Section 8 - the handler.

/**
 * The one member of the Lambda invocation context this module reads.
 *
 * JUDGMENT CALL: a minimal structural shape rather than the full `Context` interface.
 */
export interface InvocationIdentity {
  /**
   * The platform's identifier for this invocation.
   */
  readonly awsRequestId: string;
}

/**
 * The signature this module publishes as its Lambda entry point.
 *
 * The invocation context is OPTIONAL because it is only a fallback source of the correlation
 * identifier.
 */
export type SkuResolutionHandler = (
  event: APIGatewayProxyEvent,
  context?: InvocationIdentity,
) => Promise<APIGatewayProxyResult>;

/**
 * The two collaborators this handler reaches outside itself.
 */
export interface SkuResolutionHandlerDependencies {
  /**
   * Obtain the wired graph.
   *
   * Defaults to `bootstrapCompositionRoot` with no overrides, which is the production path:
   * idempotent and memoized, so the first invocation on a cold container performs the wiring.
   */
  readonly bootstrap: () => Promise<CompositionRoot>;

  /**
   * Where this module's own structured lines go, and where `./errorMapper.js` emits through.
   */
  readonly logger: Logger;
}

// `awsRequestId` is the identifier the platform's own START/END/REPORT lines carry for this
// execution.

/**
 * The query parameters of the request, as a struct.
 *
 * API Gateway supplies `null` rather than an empty object when a request carries no query string,
 * so the two cases are collapsed to one empty struct here.
 *
 * @param event the proxy event.
 * @returns the query parameters, or an empty struct.
 */
function readQueryParameters(
  event: APIGatewayProxyEvent,
): Readonly<Record<string, string | undefined>> {
  return event.queryStringParameters ?? {};
}

/**
 * The largest number of values any one query parameter carried.
 *
 * API Gateway reports every value of a repeated parameter on `multiValueQueryStringParameters`
 * while the single-valued map keeps only one of them, so counting there is the only way to notice.
 *
 * @param event the proxy event.
 * @returns the maximum multiplicity across supplied parameters; `1` when nothing repeated.
 */
function countSuppliedValues(event: APIGatewayProxyEvent): number {
  const repeated = event.multiValueQueryStringParameters;

  if (repeated === null || repeated === undefined) {
    return 1;
  }

  let widest = 1;
  for (const values of Object.values(repeated)) {
    if (values !== undefined && values.length > widest) {
      widest = values.length;
    }
  }

  return widest;
}

/**
 * Serialize a success body.
 *
 * @param outcome what the dispatched operation produced.
 * @param requestId the correlation identifier the shared envelope echoes.
 * @returns the response, with the shared success status, header set and envelope.
 */
function serializeOutcome(outcome: SkuResolutionOutcome, requestId: string): APIGatewayProxyResult {
  const document: SkuResolutionResultDocument = { outcome };

  return jsonSuccessResponse(requestId, SKU_RESOLUTION_CAPABILITY, SKU_RESOLUTION_ACTION, document);
}

/**
 * How many results an outcome carried, for the log line only.
 *
 * A COUNT, which is legible and carries no secret - the same reasoning the composition root
 * applies when it logs a row count.
 *
 * @param outcome what the dispatched operation produced.
 * @returns the number of SKUs the outcome carried; `0` for the boolean operation and for a miss.
 */
function countResults(outcome: SkuResolutionOutcome): number {
  switch (outcome.operation) {
    case 'getProductSkusBySelectedOptions':
      return outcome.skus.length;

    case 'getSkuBySkuCode':
      return outcome.sku === undefined ? 0 : 1;
  }
}

/**
 * Build the SKU resolution handler.
 *
 * The primary unit's factory. {@link handler} is this function called with no arguments, which is
 * the production path.
 *
 * Exactly one request scope per invocation, and none held between them.
 *
 * @param overrides collaborators to substitute.
 * @returns the Lambda entry point.
 */
export function createSkuResolutionHandler(
  overrides?: Partial<SkuResolutionHandlerDependencies>,
): SkuResolutionHandler {
  const dependencies: SkuResolutionHandlerDependencies = {
    bootstrap: overrides?.bootstrap ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot()),
    logger: overrides?.logger ?? processLogger,
  };

  return async (
    event: APIGatewayProxyEvent,
    context?: InvocationIdentity,
  ): Promise<APIGatewayProxyResult> => {
    const requestId = resolveServerRequestId(event, context);
    let mappingContext: ErrorMappingContext = {
      requestId,
      logger: dependencies.logger,
    };

    try {
      const resolution = resolveRouteForCapability(
        routeRequestFromEvent(event),
        SKU_RESOLUTION_CAPABILITY,
        mappingContext,
      );

      if (!resolution.matched) {
        return resolution.response;
      }

      // Matches the method with `listFindNoCase`, so `event.httpMethod` may differ from the
      // table's declaration in case and would put a caller-controlled string on the log line for
      // no diagnostic gain.
      mappingContext = {
        requestId,
        route: routeDiagnosticLabel(resolution.route.methods, resolution.route.path),
        logger: dependencies.logger,
      };

      if (resolution.route.action !== SKU_RESOLUTION_ACTION) {
        return routeNotFoundResponse(mappingContext);
      }

      // Fail closed after routing and before query parsing or graph construction. Identity comes
      // only from the authorizer context; `requestContext.identity` remains deliberately unread.
      const principalResolution = resolveRequestPrincipal(event);
      if (!principalResolution.identified) {
        return unauthenticatedResponse(mappingContext);
      }
      if (countSuppliedValues(event) > MAXIMUM_VALUES_PER_PARAMETER) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          REPEATED_PARAMETER_ISSUE,
        ]);
      }

      const parameters = readQueryParameters(event);
      const requestedOperation = parameters[OPERATION_QUERY_PARAMETER];

      if (requestedOperation === undefined || requestedOperation === '') {
        return invalidRequestResponse('missingQueryParameter', mappingContext);
      }

      // TOTAL VALIDATION, before any WIRING. Nothing below this line runs for a request whose
      // operation is unrecognized or whose arguments are unusable - see the section 7 header.
      const invocation = validateInvocation(parameters);

      if (!hasClosedParameterSet(invocation.operation, parameters)) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          UNPUBLISHED_PARAMETER_ISSUE,
        ]);
      }

      const compositionRoot = await dependencies.bootstrap();
      const scope = await compositionRoot.createRequestScope({
        accountID: principalResolution.principal.accountID,
      });

      const outcome = await invokeOperation(invocation, scope);
      dependencies.logger.info('sku resolution operation completed', {
        capability: SKU_RESOLUTION_CAPABILITY,
        operation: outcome.operation,
        requestId,
        route: mappingContext.route,
        resultCount: countResults(outcome),
      });

      return serializeOutcome(outcome, requestId);
    } catch (thrown: unknown) {
      // The single mapping point.
      //
      // Three failure shapes reach this arm and are each handled there.
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/**
 * The lambda entry point.
 *
 * The primary exported unit of this module and the symbol the bundle publishes.
 */
export const handler: SkuResolutionHandler = createSkuResolutionHandler();
