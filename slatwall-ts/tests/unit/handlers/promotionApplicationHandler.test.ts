/**
 * `src/handlers/promotionApplicationHandler.ts` - the promotion-application Lambda entrypoint.
 *
 * It owns the HANDLER SEAM and nothing beyond it: the request envelope, the wire order document
 * and its refusals, the account trust boundary.
 *
 * The composed operation is programmed with data, never computed.
 *
 * `meta/tests/` contains no handler-tier test of any kind - the legacy has no handler tier to test
 * and only three legacy files touch the in-scope slice at all.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_DOCUMENT_LIMITS,
  OrderViewAdmissionError,
  admitMaterializedOrderView,
  createPromotionApplicationHandler,
  handler as productionHandler,
} from '../../../src/handlers/promotionApplicationHandler.js';
// A namespace import alongside the named ones, for the single assertion a named import cannot
// express: that the module's runtime export set is exactly what it publishes and carries no
// default.
import * as promotionApplicationHandlerModule from '../../../src/handlers/promotionApplicationHandler.js';
// The caller-shaped hydration refusal the composition root raises, and the SECOND class this
// handler's catch chain recognizes.
import { OrderViewDocumentDataError } from '../../../src/handlers/bootstrap.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { listLen } from '../../../src/lib/cfml/list.js';
import { cfNumericEquals } from '../../../src/lib/cfml/numberFormat.js';
import { logger } from '../../../src/lib/logger.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type {
  CompositionRoot,
  OrderPricingResult,
  OrderViewDocument,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import type { ErrorResponseBody, SuccessResponseBody } from '../../../src/handlers/errorMapper.js';
import type {
  ApplyPromotionsRequest,
  PromotionApplicationDependencies,
  PromotionApplicationResultDocument,
} from '../../../src/handlers/promotionApplicationHandler.js';
import type { PromotionAppliedIntentDocument } from '../../../src/handlers/promotionApplicationHandler.js';
import type { PromotionAppliedType } from '../../../src/domain/entities/promotionApplied.js';
import type { PromotionAppliedIntent } from '../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import type { SalePriceDetail } from '../../../src/domain/ports/promotionRepository.js';
import type { AppliedPromotionView } from '../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../src/domain/views/orderView.js';
import type { DecimalString } from '../../../src/lib/cfml/numberFormat.js';
import type { LogSink, Logger } from '../../../src/lib/logger.js';
import type { PriceGroupAppliedIntent } from '../../../src/services/priceGroupService.js';

// Section 1 - suite-local typed doubles and sentinels.

/**
 * One applied-promotion intent, reached STRUCTURALLY off the shipped result type.
 *
 * `src/domain/promotionEngine/qualifiedDiscountTypes.ts` owns the union, and this is exactly the
 * indexed access the handler itself uses to reach it, so no module edge is added here.
 */
type PromotionIntent = OrderPricingResult['promotionIntents'][number];

/**
 * Raised when the handler reaches a collaborator this capability has no business touching.
 */
class WithheldCollaboratorError extends Error {
  public readonly member: string;

  public constructor(member: string) {
    super(
      `The promotion-application handler reached ${member}, which this capability does not use. ` +
        'Order pricing goes through the ONE composed operation ' +
        'updateOrderAmountsWithPriceGroupsThenPromotions and through nothing else.',
    );
    this.name = 'WithheldCollaboratorError';
    this.member = member;
  }
}

/**
 * Refuse a withheld collaborator, and type the refusal as `never`.
 *
 * `never` is assignable to every type, which is what lets a throwing getter satisfy a member typed
 * to a NOMINAL service class whose module is outside this file's dependency set - with no cast.
 */
function refuse(member: string): never {
  throw new WithheldCollaboratorError(member);
}

/**
 * Require a fixture or recorded value that a preceding action must have produced.
 */
function requirePresent<TValue>(value: TValue | undefined, description: string): TValue {
  if (value === undefined) {
    throw new TypeError(`${description} was not produced`);
  }

  return value;
}

/**
 * The ordered invocation log's labels.
 */
const ROOT_OPENED = 'compositionRoot.open';
const SCOPE_OPENED = 'createRequestScope';
const ORDER_ADMITTED = 'admitOrderView';
const ORDER_MATERIALIZED = 'materializeOrderView';
const SALE_PRICE_RESOLVED = 'getSalePriceDetailsForProductSkus';

/**
 * The one composed operation - `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions`.
 */
const COMPOSED_PRICING = 'updateOrderAmountsWithPriceGroupsThenPromotions';

/**
 * The single instant every date in this suite resolves against. Explicit UTC ISO-8601.
 */
const EVALUATED_AT = '2024-06-01T12:00:00.000Z';

/**
 * Invented, non-sensitive sentinels. Nothing here resembles a credential or a connection value.
 */
const PLATFORM_REQUEST_ID = 'req-promotion-application-0001';

const PRODUCT_ID = 'prod-golden-0001';
const SALE_PRICE_SKU_ID = 'sku-golden-0001';
const SALE_PRICE_PROMOTION_ID = 'promo-sale-price-0001';
const PROMOTION_ID = 'promo-applied-0001';

/**
 * The account an authorizer establishes, and a DIFFERENT one a caller might name.
 *
 * Two opaque identifiers and nothing more: no name, no email address and nothing else a person
 * could be identified by.
 */
const AUTHENTICATED_ACCOUNT_ID = 'acct-authenticated-0001';
const OTHER_ACCOUNT_ID = 'acct-someone-else-0002';

/**
 * The route this capability answers on, taken from the shipped frozen table rather than retyped.
 */
const CAPABILITY_ROUTE = ROUTE_TABLE.promotionApplication;

/**
 * The capability name a SERVICE grant has to name for this route to admit a caller.
 *
 * Read off the same frozen route row rather than retyped as a literal, so a suite cannot pass
 * against a token the shipped table does not publish.
 */
const PROMOTION_APPLICATION_CAPABILITY = CAPABILITY_ROUTE.capability;

/**
 * Everything one test wants to observe about how the handler drove its graph.
 */
interface PricingRecorder {
  /**
   * Labels in invocation order.
   */
  readonly log: string[];
  /**
   * Every `RequestScopeInput` the handler opened a scope with.
   */
  readonly scopeInputs: RequestScopeInput[];
  /**
   * Every order view handed to the composed operation.
   */
  readonly composedInputs: OrderView[];
  /**
   * Every decoded request an INJECTED admission was handed.
   */
  readonly admissionRequests: ApplyPromotionsRequest[];
  /**
   * Every wire document the scope's materializer was handed.
   */
  readonly materializedDocuments: OrderViewDocument[];
  /**
   * Every product identifier the sale-price operation was asked for.
   */
  readonly salePriceRequests: string[];
}

/**
 * A fresh recorder. Arrays are read back after the invocation; nothing is shared between tests.
 */
function makeRecorder(): PricingRecorder {
  return {
    log: [],
    scopeInputs: [],
    composedInputs: [],
    admissionRequests: [],
    materializedDocuments: [],
    salePriceRequests: [],
  };
}

/**
 * A caller-authored ANCESTOR key, deliberately named like a credential.
 */
const PLANTED_ANCESTOR_KEY = 'planted_api_token_value_4c17ea';

interface RecordingLogger {
  readonly logger: Logger;
  /**
   * Raw emitted lines, asserted as text so nothing can leak inside a field nobody inspected.
   */
  readonly lines: readonly string[];
}

/**
 * A recording logger built from the REAL module logger through its published sink seam.
 *
 * The shipped logger is used rather than a hand-written stand-in precisely because its mandatory,
 * non-disableable redaction list is part of what the safety cases prove is live.
 */
function makeRecordingLogger(): RecordingLogger {
  const lines: string[] = [];
  const sink: LogSink = (line: string): void => {
    lines.push(line);
  };

  return { logger: logger.withSink(sink).withLevel('debug'), lines };
}

// Section 2 - the composed pricing operation, programmed with data.

/**
 * What the composed operation is programmed to return, or to fail with.
 */
interface ProgrammedPricing {
  readonly priceGroupIntents: readonly PriceGroupAppliedIntent[];
  readonly promotionIntents: readonly PromotionIntent[];
  /**
   * A failure to raise INSTEAD of pricing, for the error-mapping cases.
   */
  readonly failure: Error | undefined;
}

/**
 * `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions`, as a recording double.
 *
 * It records the order view it was handed - which is what makes "the handler forwarded exactly
 * what the admission produced, unsorted and unfiltered" checkable.
 *
 * One member, and no way to reach either pass through it.
 */
function makeComposedPricingOperation(
  programmed: ProgrammedPricing,
  recorder: PricingRecorder,
): (order: OrderView) => Promise<OrderPricingResult> {
  return (order: OrderView): Promise<OrderPricingResult> => {
    recorder.log.push(COMPOSED_PRICING);
    recorder.composedInputs.push(order);

    if (programmed.failure !== undefined) {
      return Promise.reject(programmed.failure);
    }

    return Promise.resolve({
      priceGroupIntents: [...programmed.priceGroupIntents],
      promotionIntents: [...programmed.promotionIntents],
      pricedOrder: order,
    });
  };
}

// Section 3 - the request scope and composition root doubles.

/**
 * Everything the request-scope double needs to answer this capability, and nothing more.
 */
interface ScopeConfiguration {
  readonly now: Date;
  readonly pricing: ProgrammedPricing;
  readonly salePriceDetails: Record<string, SalePriceDetail>;
  /**
   * What `materializeOrderView` hands back, when a case drives the wire path.
   */
  readonly materialized: OrderView | undefined;
  /**
   * A hydration failure to raise instead, for the refusal cases.
   */
  readonly materializationFailure: Error | undefined;
}

/**
 * A `RequestScope` double.
 *
 * `currentAccountContext` is the explicit replacement for `getHibachiScope()` /
 * `getSlatwallScope()`.
 */
function makeRequestScopeDouble(
  config: ScopeConfiguration,
  recorder: PricingRecorder,
): RequestScope {
  const composed = makeComposedPricingOperation(config.pricing, recorder);

  return {
    // A FRESH `Date` on every read, carrying the one instant this request bound - the same
    // contract the shipped scope documents, so a caller mutating what it read moves nothing.
    get now(): Date {
      return new Date(config.now.getTime());
    },

    get currentAccountContext(): RequestScope['currentAccountContext'] {
      return refuse('RequestScope.currentAccountContext');
    },
    get entityLoaders(): RequestScope['entityLoaders'] {
      return refuse('RequestScope.entityLoaders');
    },
    // The promotion pass names no price group of its own - the price-group pass that precedes it
    // resolves them from the order - so an entitlement decision has nothing to decide here.
    get priceGroupEntitlements(): RequestScope['priceGroupEntitlements'] {
      return refuse('RequestScope.priceGroupEntitlements');
    },
    get roundingRuleService(): RequestScope['roundingRuleService'] {
      return refuse('RequestScope.roundingRuleService');
    },
    get brandService(): RequestScope['brandService'] {
      return refuse('RequestScope.brandService');
    },
    get optionService(): RequestScope['optionService'] {
      return refuse('RequestScope.optionService');
    },
    get skuService(): RequestScope['skuService'] {
      return refuse('RequestScope.skuService');
    },
    get productService(): RequestScope['productService'] {
      return refuse('RequestScope.productService');
    },
    get priceGroupService(): RequestScope['priceGroupService'] {
      return refuse('RequestScope.priceGroupService');
    },
    get promotionService(): RequestScope['promotionService'] {
      return refuse('RequestScope.promotionService');
    },
    get currencyConverter(): RequestScope['currencyConverter'] {
      return refuse('RequestScope.currencyConverter');
    },
    get productFeedPort(): RequestScope['productFeedPort'] {
      return refuse('RequestScope.productFeedPort');
    },
    // The AAP 0.4.2 argument of `generateProductFeed`, published beside the port it is passed to.
    // Refused here for the same reason the port is: the feed is a different capability.
    get feedCriteria(): RequestScope['feedCriteria'] {
      return refuse('RequestScope.feedCriteria');
    },

    /**
     * The hydration member the WIRE admission reaches.
     *
     * It records the document it was handed - which is how "the schema's output is what the
     * repositories tier receives" becomes checkable - and hands back the view the case programmed.
     */
    materializeOrderView: (document: OrderViewDocument): Promise<OrderView> => {
      recorder.log.push(ORDER_MATERIALIZED);
      recorder.materializedDocuments.push(document);

      if (config.materializationFailure !== undefined) {
        return Promise.reject(config.materializationFailure);
      }

      if (config.materialized === undefined) {
        return Promise.reject(
          new TypeError('the harness was not given an order view to materialize'),
        );
      }

      return Promise.resolve(config.materialized);
    },

    // [model/service/PromotionService.cfc:L1022] - the one other already-ported service method
    // this adapter reaches. Its input is a plain string, so there is nothing to materialise.
    getSalePriceDetailsForProductSkus: (
      productID: string,
    ): Promise<Record<string, SalePriceDetail>> => {
      recorder.log.push(SALE_PRICE_RESOLVED);
      recorder.salePriceRequests.push(productID);

      return Promise.resolve(config.salePriceDetails);
    },

    updateOrderAmountsWithPriceGroupsThenPromotions: composed,

    // The composed operation owns zone preparation. If the handler reaches this member directly,
    // the test double refuses and the case fails.
    prepareAddressZoneEvaluation: (): Promise<void> =>
      refuse('RequestScope.prepareAddressZoneEvaluation'),
  };
}

/**
 * A `CompositionRoot` double.
 */
function makeCompositionRootDouble(
  config: ScopeConfiguration,
  recorder: PricingRecorder,
): CompositionRoot {
  return {
    get diagnostics(): CompositionRoot['diagnostics'] {
      return refuse('CompositionRoot.diagnostics');
    },
    get dialect(): CompositionRoot['dialect'] {
      return refuse('CompositionRoot.dialect');
    },
    get settingsProvider(): CompositionRoot['settingsProvider'] {
      return refuse('CompositionRoot.settingsProvider');
    },
    get integration(): CompositionRoot['integration'] {
      return refuse('CompositionRoot.integration');
    },

    createRequestScope: (scopeInput?: RequestScopeInput): Promise<RequestScope> => {
      recorder.log.push(SCOPE_OPENED);

      if (scopeInput !== undefined) {
        recorder.scopeInputs.push(scopeInput);
      }

      return Promise.resolve(makeRequestScopeDouble(config, recorder));
    },

    createInspectableRequestScope: (): Promise<never> =>
      refuse('CompositionRoot.createInspectableRequestScope'),
  };
}

// Section 4 - the platform event, the documents, and the harness.

/**
 * A complete API Gateway proxy event, version 1.0 payload.
 *
 * Written out in full rather than narrowed, because the handler's parameter type is the platform's
 * own and a partial literal would not compile.
 */
function makeProxyEvent(overrides: {
  readonly httpMethod?: string;
  readonly path?: string;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestId?: string;
  /**
   * The authorizer context, which is the only part of this event a caller cannot author.
   *
   * Three states, all reachable and all meaningful: * OMITTED - the suite default: an
   * authenticated session for {@link AUTHENTICATED_ACCOUNT_ID}.
   */
  readonly authorizer?: Readonly<Record<string, unknown>> | null;
}): APIGatewayProxyEvent {
  return {
    body: overrides.body === undefined ? null : overrides.body,
    headers: { 'content-type': 'application/json' },
    multiValueHeaders: { 'content-type': ['application/json'] },
    httpMethod: overrides.httpMethod ?? CAPABILITY_ROUTE.methods,
    isBase64Encoded: overrides.isBase64Encoded ?? false,
    path: overrides.path ?? CAPABILITY_ROUTE.path,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: overrides.path ?? CAPABILITY_ROUTE.path,
    requestContext: {
      accountId: 'fixture-account-id',
      apiId: 'fixture-api-id',
      // An omitted override is the AUTHENTICATED session; an explicit `null` is the anonymous
      // request.
      authorizer:
        overrides.authorizer === undefined
          ? authorizerFor(AUTHENTICATED_ACCOUNT_ID)
          : overrides.authorizer,
      protocol: 'HTTP/1.1',
      httpMethod: overrides.httpMethod ?? CAPABILITY_ROUTE.methods,
      // JUDGMENT CALL: every member of `identity` below is REQUIRED by `@types/aws-lambda`'s
      // `APIGatewayEventIdentity` and none is optional, so the two credential-NAMED members must
      // be written for this literal to type-check.
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
        sourceIp: '198.51.100.7',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path: overrides.path ?? CAPABILITY_ROUTE.path,
      stage: 'fixture',
      requestId: overrides.requestId ?? PLATFORM_REQUEST_ID,
      requestTimeEpoch: new Date(EVALUATED_AT).getTime(),
      resourceId: 'fixture-resource-id',
      resourcePath: overrides.path ?? CAPABILITY_ROUTE.path,
    },
  };
}

/**
 * An authorizer context establishing one TRUSTED SERVICE caller, under the claim names the handler
 * reads.
 *
 * So the trusted caller now holds what a service holds and nothing more: the dedicated
 * `serviceScope` grant naming this route's own capability, and no administrative bit.
 */
function authorizerFor(accountID: string): Readonly<Record<string, unknown>> {
  return { accountID, serviceScope: PROMOTION_APPLICATION_CAPABILITY };
}

/**
 * An authorizer context establishing an ORDINARY account: identified, and not trusted.
 *
 * This is the caller the route refuses: identified, but carrying no trust marker.
 */
function untrustedAuthorizerFor(accountID: string): Readonly<Record<string, unknown>> {
  return { accountID };
}

/**
 * An authorizer context establishing a GENERAL ADMINISTRATOR: identified, administrative,
 * ungranted.
 */
function administratorAuthorizerFor(accountID: string): Readonly<Record<string, unknown>> {
  return { accountID, adminAccountFlag: true };
}

/**
 * The envelope for `applyPromotions`. `order` is whatever the caller is putting on the wire.
 */
function applyPromotionsDocument(
  orderMember: unknown,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    operation: 'applyPromotions',
    order: orderMember,
    ...extra,
  };
}

/**
 * A POST to the capability route carrying `document` as its JSON body.
 */
function postDocument(
  document: unknown,
  authorizer?: Readonly<Record<string, unknown>> | null,
): APIGatewayProxyEvent {
  return makeProxyEvent({
    body: JSON.stringify(document),
    ...(authorizer === undefined ? {} : { authorizer }),
  });
}

/**
 * One applied-promotion view, in the shape the wire document carries it.
 */
function wireAppliedPromotion(applied: AppliedPromotionView): Readonly<Record<string, unknown>> {
  const promotion = applied.promotion;

  return {
    promotionAppliedID: applied.promotionAppliedID,
    // `null`, never `0`: the column is nullable [model/entity/PromotionApplied.cfc:L51] and a zero
    // discount is a different fact from no discount.
    discountAmount:
      applied.discountAmount === undefined ? null : applied.discountAmount.toDecimalString(),
    promotion: promotion === undefined ? null : { promotionID: promotion.promotionID },
  };
}

/**
 * The PERSISTED product handle one order item names on the wire.
 *
 * This projection therefore uses the product's own identifier whenever the fixture supplies one,
 * and otherwise derives a DETERMINISTIC persisted-looking handle from the SKU's identifier.
 */
function wireProductID(item: OrderItemView): string {
  const product = item.sku.getProduct();

  if (product === undefined) {
    throw new TypeError(
      `the fixture sku ${item.sku.getSkuID()} carries no product, so no wire document can name one`,
    );
  }

  const declared = product.getProductID();

  return declared === '' ? `${item.sku.getSkuID()}-product` : declared;
}

/**
 * The order document a caller PUTs on the wire, projected from a materialised fixture.
 *
 * This is the shape the deployed route actually receives, and building it from a fixture rather
 * than by hand is deliberate: the projection is total.
 */
function wireOrderDocument(order: OrderView): Readonly<Record<string, unknown>> {
  return {
    orderID: order.orderID,
    orderType: { systemCode: order.orderType.systemCode },
    accountID: order.accountID ?? null,
    promotionCodeList: order.promotionCodeList,
    totalSaleQuantity: order.totalSaleQuantity,
    subtotal: order.subtotal.toDecimalString(),
    subtotalAfterItemDiscounts: order.subtotalAfterItemDiscounts.toDecimalString(),
    fulfillmentChargeAfterDiscountTotal:
      order.fulfillmentChargeAfterDiscountTotal.toDecimalString(),
    currencyCode: order.currencyCode,
    appliedPromotions: order.appliedPromotions.map(wireAppliedPromotion),
    orderItems: order.orderItems.map((item): Readonly<Record<string, unknown>> => {
      const appliedPriceGroup = item.appliedPriceGroup;

      return {
        orderItemID: item.orderItemID,
        productID: wireProductID(item),
        skuID: item.sku.getSkuID(),
        quantity: item.quantity,
        price: item.price.toDecimalString(),
        skuPrice: item.skuPrice.toDecimalString(),
        extendedPrice: item.extendedPrice.toDecimalString(),
        extendedSkuPrice: item.extendedSkuPrice.toDecimalString(),
        appliedPriceGroupID:
          appliedPriceGroup === undefined ? null : appliedPriceGroup.getPriceGroupID(),
        orderItemType: { systemCode: item.orderItemType.systemCode },
        orderFulfillmentID: item.orderFulfillmentID,
        appliedPromotions: item.appliedPromotions.map(wireAppliedPromotion),
      };
    }),
    orderFulfillments: order.orderFulfillments.map(
      (fulfillment): Readonly<Record<string, unknown>> => {
        const shippingMethod = fulfillment.shippingMethod;
        const address = fulfillment.address;

        return {
          orderFulfillmentID: fulfillment.orderFulfillmentID,
          fulfillmentCharge: fulfillment.fulfillmentCharge.toDecimalString(),
          fulfillmentMethod: {
            fulfillmentMethodID: fulfillment.fulfillmentMethod.fulfillmentMethodID,
            fulfillmentMethodType: fulfillment.fulfillmentMethod.fulfillmentMethodType,
          },
          // `null` is a REAL STATE here, not a missing value: the gate at
          // [model/service/PromotionService.cfc:L701] tests `isNull(getShippingMethod())`, so a
          // pickup fulfillment states it.
          shippingMethod:
            shippingMethod === undefined
              ? null
              : { shippingMethodID: shippingMethod.shippingMethodID },
          appliedPromotions: fulfillment.appliedPromotions.map(wireAppliedPromotion),
          totalShippingWeight: fulfillment.totalShippingWeight,
          address:
            address === undefined
              ? null
              : {
                  postalCode: address.postalCode ?? null,
                  city: address.city ?? null,
                  stateCode: address.stateCode ?? null,
                  countryCode: address.countryCode ?? null,
                  isNew: address.isNew,
                },
        };
      },
    ),
  };
}

/**
 * A POST of the `applyPromotions` envelope carrying the real wire document.
 */
function postApplyPromotions(
  order: OrderView,
  extra: Readonly<Record<string, unknown>> = {},
  authorizer?: Readonly<Record<string, unknown>> | null,
): APIGatewayProxyEvent {
  return postDocument(applyPromotionsDocument(wireOrderDocument(order), extra), authorizer);
}

/**
 * A POST of the `applyPromotions` envelope carrying the full WIRE document.
 */
function postWireOrder(
  order: OrderView,
  extra: Readonly<Record<string, unknown>> = {},
  authorizer?: Readonly<Record<string, unknown>> | null,
): APIGatewayProxyEvent {
  return postDocument(applyPromotionsDocument(wireOrderDocument(order), extra), authorizer);
}

/**
 * How one test configures the whole graph behind the handler.
 */
interface HarnessOptions {
  readonly now?: Date;
  /**
   * The injected clock. Absent means the handler passes no `now` and the scope binds its own.
   */
  readonly clock?: () => Date;
  /**
   * What the composed operation is programmed to hand back.
   */
  readonly promotionIntents?: readonly PromotionIntent[];
  readonly priceGroupIntents?: readonly PriceGroupAppliedIntent[];
  /**
   * A failure the composed operation raises instead of pricing.
   */
  readonly failure?: Error;
  readonly salePriceDetails?: Record<string, SalePriceDetail>;
  /**
   * Installs an admission that vouches for this MATERIALISED view and records what it was asked.
   *
   * The documented in-process seam: a strangler-fig proxy holding a live aggregate injects its own
   * resolution.
   */
  readonly admit?: OrderView;
  /**
   * Installs an admission that REFUSES, so the client-shaped refusal arm is drivable.
   */
  readonly refuseAdmission?: OrderViewAdmissionError;
  /**
   * What the scope's `materializeOrderView` hands back on the wire path.
   */
  readonly materialize?: OrderView;
  /**
   * A hydration failure the scope's materializer raises instead.
   */
  readonly materializationFailure?: Error;
}

/**
 * One handler, one recorder, one recording logger - all fresh, none shared.
 */
interface Harness {
  readonly recorder: PricingRecorder;
  readonly emitted: RecordingLogger;
  readonly invoke: (
    event: APIGatewayProxyEvent,
    context?: Context,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Build a handler over suite-local doubles.
 *
 * A FRESH SUBJECT per CALL, and every collaborator is constructed inside this function - no module
 * state, no shared graph, no memo.
 */
function makeHarness(options: HarnessOptions = {}): Harness {
  const recorder = makeRecorder();
  const emitted = makeRecordingLogger();

  const config: ScopeConfiguration = {
    now: options.now ?? new Date(EVALUATED_AT),
    salePriceDetails: options.salePriceDetails ?? {},
    materialized: options.materialize,
    materializationFailure: options.materializationFailure,
    pricing: {
      priceGroupIntents: options.priceGroupIntents ?? [],
      promotionIntents: options.promotionIntents ?? [],
      failure: options.failure,
    },
  };

  const root = makeCompositionRootDouble(config, recorder);
  const admitted = options.admit;
  const refusal = options.refuseAdmission;

  const admitOrderView: PromotionApplicationDependencies['admitOrderView'] =
    admitted === undefined && refusal === undefined
      ? undefined
      : (request: ApplyPromotionsRequest): Promise<OrderView> => {
          recorder.log.push(ORDER_ADMITTED);
          recorder.admissionRequests.push(request);

          // Narrowed to a concrete `Error` before it is rejected with, rather than rejected with a
          // possibly-absent value: an admission that refuses always refuses with the shipped
          // `OrderViewAdmissionError`.
          if (refusal !== undefined) {
            return Promise.reject(refusal);
          }

          if (admitted === undefined) {
            return Promise.reject(
              new TypeError('the harness installed an admission with nothing to admit'),
            );
          }

          return Promise.resolve(admitted);
        };

  const invoke = createPromotionApplicationHandler({
    compositionRoot: (): Promise<CompositionRoot> => {
      recorder.log.push(ROOT_OPENED);

      return Promise.resolve(root);
    },
    logger: emitted.logger,
    admitOrderView,
    clock: options.clock,
  });

  return { recorder, emitted, invoke };
}

// Section 5 - response readers.

/**
 * A non-null, non-array object. The only shape the readers below descend into.
 */
function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * An array of JSON objects, narrowed by a genuine predicate.
 *
 * `Array.isArray` alone narrows an `unknown` to `any[]`, and destructuring that reintroduces `any`
 * into a file that permits none.
 */
function isJsonObjectArray(value: unknown): value is readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value) && value.every(isJsonObject);
}

/**
 * The success body, narrowed by a genuine type predicate rather than asserted.
 *
 * The four echoed members are proven present and of the right kind, which is what every case below
 * reads.
 */
function isServedEnvelope(
  value: unknown,
): value is SuccessResponseBody<PromotionApplicationResultDocument> {
  if (
    !isJsonObject(value) ||
    typeof value['requestId'] !== 'string' ||
    typeof value['capability'] !== 'string' ||
    typeof value['action'] !== 'string'
  ) {
    return false;
  }

  const result: unknown = value['result'];

  return (
    isJsonObject(result) &&
    typeof result['operation'] === 'string' &&
    typeof result['evaluatedAt'] === 'string'
  );
}

/**
 * The whole served envelope of a 200 response. Throws rather than returning a half-checked value.
 */
function servedEnvelopeOf(
  result: APIGatewayProxyResult,
): SuccessResponseBody<PromotionApplicationResultDocument> {
  const body = result.body;
  const parsed: unknown = JSON.parse(body);

  if (!isServedEnvelope(parsed)) {
    throw new TypeError('the response body is not the shared success envelope');
  }

  return parsed;
}

/**
 * This capability's own document, read out of the shared envelope's `result` member.
 *
 * Kept as a separate reader so a case asserting on the DOCUMENT does not have to know it is
 * nested, and a case asserting on the ENVELOPE reaches {@link servedEnvelopeOf} instead.
 */
function successBodyOf(result: APIGatewayProxyResult): PromotionApplicationResultDocument {
  return servedEnvelopeOf(result).result;
}

/**
 * The error envelope, narrowed the same way.
 */
function isErrorBody(value: unknown): value is ErrorResponseBody {
  if (!isJsonObject(value)) {
    return false;
  }

  const error = value['error'];

  return (
    isJsonObject(error) &&
    typeof error['category'] === 'string' &&
    typeof error['message'] === 'string' &&
    typeof error['requestId'] === 'string'
  );
}

/**
 * The error envelope of a non-200 response.
 */
function errorBodyOf(result: APIGatewayProxyResult): ErrorResponseBody['error'] {
  const parsed: unknown = JSON.parse(result.body);

  if (!isErrorBody(parsed)) {
    throw new TypeError('the response body is not the documented error envelope');
  }

  return parsed.error;
}

/**
 * The promotion intents a success body carried, or an empty list when it carried none.
 */
function promotionIntentsOf(body: PromotionApplicationResultDocument): readonly {
  readonly appliedType: string;
  readonly operation: string;
  readonly orderItemID?: string;
  readonly orderID?: string;
  readonly discountAmount?: string;
}[] {
  return body.promotionIntents ?? [];
}

/**
 * The `discountAmount` an intent carried for one order item, as the DECIMAL STRING it crossed the
 * wire as.
 */
function wireDiscountForItem(
  body: PromotionApplicationResultDocument,
  orderItemID: string,
): DecimalString {
  const intent = promotionIntentsOf(body).find(
    (candidate): boolean => candidate.orderItemID === orderItemID,
  );

  if (intent === undefined || intent.discountAmount === undefined) {
    throw new TypeError(`no applied-promotion intent carried a discount for ${orderItemID}`);
  }

  return Money.fromDecimalString(intent.discountAmount).toDecimalString();
}

/**
 * Assert two monetary decimal strings are the same AMOUNT, by value.
 */
function expectSameAmount(actual: string, expected: string): void {
  expect(
    cfNumericEquals(actual, expected),
    `expected ${actual} to be the same amount of money as ${expected}`,
  ).toBe(true);
}

/**
 * The field paths a client-shaped refusal published, or an empty list.
 */
function fieldPathsOf(result: APIGatewayProxyResult): readonly string[] {
  return (errorBodyOf(result).fields ?? []).map((field): string => field.path);
}

// Complementary to the global `afterEach` in `tests/setup.ts`, which already restores spies and
// the real clock.
afterEach(() => {
  vi.restoreAllMocks();
});

// Section 6 - fixture helpers.

/**
 * The fixture's own overrides and capture shapes, reached structurally - neither is exported.
 */
type OrderViewFixtureOverridesRef = NonNullable<Parameters<typeof makeOrderViewFixture>[0]>;
type OrderViewCaptureRef = NonNullable<OrderViewFixtureOverridesRef['capture']>;

/**
 * The golden order and its capture sink.
 */
function makeGoldenOrder(overrides: OrderViewFixtureOverridesRef = {}): {
  readonly order: OrderView;
  readonly capture: OrderViewCaptureRef;
} {
  const capture: OrderViewCaptureRef = {};
  // The account default, and why it is set here rather than left to the fixture.
  //
  // Tested with `in` rather than `!== undefined` on purpose: `{ accountID: undefined }` is a case
  // stating that the order names no account, which is a different request from one that never
  // mentioned the member.
  const withAccount: OrderViewFixtureOverridesRef =
    'accountID' in overrides ? overrides : { ...overrides, accountID: AUTHENTICATED_ACCOUNT_ID };
  const order = makeOrderViewFixture({ ...withAccount, capture });

  return { order, capture };
}

/**
 * One order item of the golden order, index-checked rather than asserted.
 */
function itemAt(order: OrderView, index: number): OrderItemView {
  const item = order.orderItems[index];

  if (item === undefined) {
    throw new TypeError(`the golden order carries no item at index ${String(index)}`);
  }

  return item;
}

/**
 * Build a copy of an order document with one member removed, for the refusal cases.
 */
function documentWithout(
  document: Readonly<Record<string, unknown>>,
  member: string,
): Readonly<Record<string, unknown>> {
  const copy: Record<string, unknown> = { ...document };
  delete copy[member];

  return copy;
}

/**
 * Build a copy of an order document with one member replaced.
 */
function documentWith(
  document: Readonly<Record<string, unknown>>,
  member: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  return { ...document, [member]: value };
}

/**
 * One programmed order-item intent, at the amount a case names.
 */
function itemIntent(orderItemID: string, discountAmount: string): PromotionIntent {
  return {
    operation: 'add',
    appliedType: 'orderItem',
    orderItemID,
    promotionID: PROMOTION_ID,
    discountAmount: Money.fromDecimalString(discountAmount),
  };
}

// Concern 1 - the published module surface.

describe('the promotion-application module surface (NET-NEW)', () => {
  it('publishes the entrypoint, the factory and both admissions, with no default export', () => {
    const exported = Object.keys(promotionApplicationHandlerModule).sort();

    // The runtime export set. Types and interfaces emit nothing, so what remains is the four
    // values this module publishes plus the two frozen constants and the error class.
    expect(exported).toContain('handler');
    expect(exported).toContain('createPromotionApplicationHandler');
    expect(exported).toContain('admitMaterializedOrderView');
    expect(exported).toContain('ORDER_DOCUMENT_LIMITS');
    expect(exported).toContain('OrderViewAdmissionError');
    expect(exported).not.toContain('default');
  });

  it('builds the production entrypoint through the same factory a suite calls', () => {
    // Both are functions of two declared parameters - the event and the context - so the runtime's
    // third completion-callback argument cannot arrive as one this handler would have to ignore.
    expect(typeof productionHandler).toBe('function');
    expect(productionHandler.length).toBe(2);
    expect(createPromotionApplicationHandler().length).toBe(2);
  });

  it('publishes the document bounds it enforces, frozen', () => {
    expect(Object.isFrozen(ORDER_DOCUMENT_LIMITS)).toBe(true);
    expect(ORDER_DOCUMENT_LIMITS.maximumOrderItems).toBeGreaterThan(0);
    expect(ORDER_DOCUMENT_LIMITS.maximumOrderFulfillments).toBeGreaterThan(0);
    expect(ORDER_DOCUMENT_LIMITS.maximumIdentifierLength).toBeGreaterThan(0);
  });
});

// Concern 2 - the wire order document.

describe('the wire order document (NET-NEW)', () => {
  it('serves a PLAIN JSON ORDER DOCUMENT with no admission injected at all', async () => {
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const harness = makeHarness({
      // Nothing is injected but the graph itself: no `admit`, no `refuseAdmission`. The PRODUCTION
      // admission runs, parses the body, and asks the scope to hydrate it.
      materialize: order,
      promotionIntents: [itemIntent(firstItem.orderItemID, '7.49625')],
      priceGroupIntents: [
        {
          orderItemID: firstItem.orderItemID,
          price: Money.fromDecimalString('11.00'),
          priceGroupID: 'pg-wire-0001',
        },
      ],
    });

    const result = await harness.invoke(postWireOrder(order));
    const body = successBodyOf(result);

    expect(result.statusCode).toBe(200);
    // The document reached the hydration tier, and the composed operation ran on what came back.
    expect(harness.recorder.materializedDocuments).toHaveLength(1);
    expect(harness.recorder.composedInputs).toHaveLength(1);
    expect(harness.recorder.log).toEqual([
      ROOT_OPENED,
      SCOPE_OPENED,
      ORDER_MATERIALIZED,
      COMPOSED_PRICING,
    ]);
    // And the intents the engine decided are what the caller received.
    expect(promotionIntentsOf(body)).toHaveLength(1);
    expectSameAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.49625');
    expect(body.priceGroupIntents).toHaveLength(1);
  });

  it('serves that document with EVERY dependency but the root left at its production default', async () => {
    // The closest a unit suite can stand to the deployed entrypoint.
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const recorder = makeRecorder();
    const root = makeCompositionRootDouble(
      {
        now: new Date(EVALUATED_AT),
        salePriceDetails: {},
        materialized: order,
        materializationFailure: undefined,
        pricing: {
          priceGroupIntents: [],
          promotionIntents: [itemIntent(firstItem.orderItemID, '7.49625')],
          failure: undefined,
        },
      },
      recorder,
    );
    const subject = createPromotionApplicationHandler({
      compositionRoot: (): Promise<CompositionRoot> => Promise.resolve(root),
    });

    const result = await subject(postWireOrder(order));
    const body = successBodyOf(result);

    expect(result.statusCode).toBe(200);
    expect(recorder.materializedDocuments).toHaveLength(1);
    expect(promotionIntentsOf(body)).toHaveLength(1);
    expectSameAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.49625');
  });

  it('hands the hydration tier the document verbatim, identifiers and decimal strings alike', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });
    const firstItem = itemAt(order, 0);
    // The document is built once and compared against what the materializer received, so the
    // property under test is genuine PASS-THROUGH rather than a restatement of the projection: any
    // member this tier renamed.
    const sent = wireOrderDocument(order);

    await harness.invoke(postDocument(applyPromotionsDocument(sent)));

    const [document] = harness.recorder.materializedDocuments;

    if (document === undefined) {
      throw new TypeError('the wire document never reached the materializer');
    }

    expect(document).toEqual(sent);
    expect(document.orderID).toBe(order.orderID);
    expect(document.currencyCode).toBe(order.currencyCode);
    // A decimal STRING on the wire, and the same amount of money the fixture holds.
    expectSameAmount(document.subtotal, order.subtotal.toDecimalString());

    const [item] = document.orderItems;

    if (item === undefined) {
      throw new TypeError('the wire document carried no order items');
    }

    // Both handles travel, each NON-EMPTY, and the SKU is named rather than described: no price,
    // no product type, no brand and no option list.
    expect(item.skuID).toBe(firstItem.sku.getSkuID());
    expect(item.skuID).not.toBe('');
    expect(item.productID).not.toBe('');
    expect(Object.keys(item)).not.toContain('sku');
    expectSameAmount(item.price, firstItem.price.toDecimalString());
    expectSameAmount(item.extendedSkuPrice, firstItem.extendedSkuPrice.toDecimalString());
  });

  it('carries a pickup fulfillment whose shipping method is STATED as absent', async () => {
    const { order } = makeGoldenOrder({ includePickupFulfillment: true });
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(postWireOrder(order));
    const [document] = harness.recorder.materializedDocuments;

    expect(result.statusCode).toBe(200);

    if (document === undefined) {
      throw new TypeError('the wire document never reached the materializer');
    }

    // `null` rather than an omitted key.
    const stated = document.orderFulfillments.some(
      (fulfillment): boolean => fulfillment.shippingMethod === null,
    );
    expect(stated).toBe(true);
  });

  it('REFUSES a document whose monetary member is not a plain decimal numeral', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    // `'1,234.50'` is a formatted number, not a numeral. Coercing it would put a silent zero or a
    // truncated `1` into a price path, and a wrong price is money.
    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWith(wireOrderDocument(order), 'subtotal', '1,234.50')),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.subtotal');
    // The submitted value is never echoed - only the path and the constraint.
    expect(result.body).not.toContain('1,234.50');
    // Nothing was hydrated and nothing was priced.
    expect(harness.recorder.materializedDocuments).toHaveLength(0);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('REFUSES a document that omits a required member, naming the member', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWithout(wireOrderDocument(order), 'totalSaleQuantity')),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.totalSaleQuantity');
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('REFUSES an unknown member rather than ignoring it', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });
    const callerAuthoredKey = 'x-PLANTED-ORDER-KEY-9f2c41ab';

    // Ignoring an unknown member would let the caller believe it stated something the engine read.
    // Its NAME is caller-authored too, so the refusal keeps only the safe containing path.
    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWith(wireOrderDocument(order), callerAuthoredKey, {
            skuID: 'sku-not-a-member',
          }),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order');
    expect(result.body).not.toContain(callerAuthoredKey);
    expect(result.body).not.toContain('sku-not-a-member');
    expect(harness.recorder.materializedDocuments).toHaveLength(0);
  });

  it('REFUSES a per-item member that is the wrong kind, naming the indexed path', async () => {
    const { order } = makeGoldenOrder();
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    const harness = makeHarness({ materialize: order });
    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWith(document, 'orderItems', [{ ...firstItem, quantity: 'three' }, ...rest]),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.orderItems.0.quantity');
    expect(result.body).not.toContain('three');
  });

  it('reports an ABSENT order member differently from an unusable one', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const absent = await harness.invoke(postDocument({ operation: 'applyPromotions' }));
    const unusable = await harness.invoke(
      postDocument(applyPromotionsDocument({ orderID: 'order-with-nothing-else' })),
    );

    expect(absent.statusCode).toBe(400);
    expect(fieldPathsOf(absent)).toEqual(['order']);
    expect(errorBodyOf(absent).message).toBe('The request body is not the expected shape.');

    expect(unusable.statusCode).toBe(400);
    // Several member paths, because a caller fixing one shape wants every complaint at once.
    expect(fieldPathsOf(unusable).length).toBeGreaterThan(1);
    expect(errorBodyOf(unusable).message).toBe('The request body is not the expected shape.');
  });

  it('REFUSES an over-large order document and never truncates it', async () => {
    const { order } = makeGoldenOrder();
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    const overLarge = Array.from(
      { length: ORDER_DOCUMENT_LIMITS.maximumOrderItems + 1 },
      (_unused, index): Readonly<Record<string, unknown>> => ({
        ...firstItem,
        orderItemID: `${String(firstItem['orderItemID'])}-${String(index)}`,
      }),
    );

    const harness = makeHarness({ materialize: order });
    const result = await harness.invoke(
      postDocument(applyPromotionsDocument(documentWith(document, 'orderItems', overLarge))),
    );

    // REFUSED, not silently shortened: the bound is published on `ORDER_DOCUMENT_LIMITS` so a
    // caller can split its own work deliberately rather than discovering a truncated result.
    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.orderItems');
    expect(harness.recorder.materializedDocuments).toHaveLength(0);
  });

  it('lets an UNRECOGNIZED hydration failure reach the mapper, publishing none of its detail', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      materialize: order,
      // Not the caller-shaped document error - an arbitrary failure from inside the hydration
      // tier, whose message happens to carry identifiers.
      materializationFailure: new Error(
        'sku "sku-does-not-exist" is not carried by product "prod-golden-0001"',
      ),
    });

    const result = await harness.invoke(postWireOrder(order));

    expect(result.statusCode).toBe(500);
    expect(errorBodyOf(result).message).toBe('The request could not be completed.');
    expect(result.body).not.toContain('sku-does-not-exist');
    expect(result.body).not.toContain('prod-golden-0001');
    // The detail reaches the log stream under the same correlation identifier instead.
    expect(harness.emitted.lines.join('\n')).toContain(PLATFORM_REQUEST_ID);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('★ reports a caller-shaped document-data refusal as 400 with member paths', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      materialize: order,
      materializationFailure: new OrderViewDocumentDataError([
        {
          path: 'order.orderItems.0.productID',
          message: 'does not name a product this request can price',
        },
      ]),
    });

    const result = await harness.invoke(postWireOrder(order));

    expect(result.statusCode).toBe(400);
    expect(errorBodyOf(result).category).toBe('invalidRequest');
    expect(fieldPathsOf(result)).toStrictEqual(['order.orderItems.0.productID']);
    // The sentence is the mapper's fixed one, so choosing `unusableRequestInput` withheld detail
    // rather than inventing any.
    expect(errorBodyOf(result).message).toBe('The request input is not valid.');
    // Neither pass ran, so nothing was priced against a catalogue that could not be resolved.
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('★ publishes no submitted identifier when it refuses a document-data mistake', async () => {
    const { order } = makeGoldenOrder();
    // The two paths `loadDocumentSkus` emits for the sku/product disagreement, which is the
    // condition whose old 500 named both identifiers in its message.
    const harness = makeHarness({
      materialize: order,
      materializationFailure: new OrderViewDocumentDataError([
        {
          path: 'order.orderItems.0.skuID',
          message: 'does not name a sku carried by the product named on the same order item',
        },
        {
          path: 'order.orderItems.0.productID',
          message: 'names a product that does not carry the sku named on the same order item',
        },
      ]),
    });

    const result = await harness.invoke(postWireOrder(order));

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toStrictEqual([
      'order.orderItems.0.skuID',
      'order.orderItems.0.productID',
    ]);
    // The golden order's own identifiers are what a real refusal would have been tempted to echo.
    const firstItem = itemAt(order, 0);
    expect(result.body).not.toContain(firstItem.sku.getSkuID());
    expect(result.body).not.toContain(PRODUCT_ID);
  });
});

// Concern 3 - the in-process admission, still available and still strict.

describe('the in-process order-view admission (NET-NEW)', () => {
  it('vouches for a MATERIALISED view and hands it on untouched, hydrating nothing', async () => {
    const { order } = makeGoldenOrder();

    const admitted = await admitMaterializedOrderView({
      operation: 'applyPromotions',
      requestId: 'req',
      order,
    });

    // The same OBJECT, by identity: no copy, no freeze, no re-sort.
    expect(admitted).toBe(order);
    // One declared parameter, which is how it says it reaches no hydration tier at all: the port
    // hands every admission a materializer and this arm has no place to receive one.
    expect(admitMaterializedOrderView.length).toBe(1);
  });

  it('still REFUSES a plain JSON projection, which is why it is not the default any more', async () => {
    const { order } = makeGoldenOrder();

    const refusal = await admitMaterializedOrderView({
      operation: 'applyPromotions',
      requestId: 'req',
      order: wireOrderDocument(order),
    }).then(
      (): OrderViewAdmissionError | undefined => undefined,
      (thrown: unknown): OrderViewAdmissionError | undefined =>
        thrown instanceof OrderViewAdmissionError ? thrown : undefined,
    );

    // The refusal is CORRECT for this arm and always was: a wire document's `price` is a string
    // with no accessors.
    expect(refusal?.reason).toBe('unsupportedBodyShape');
    expect((refusal?.fields ?? []).map((field): string => field.path)).toContain(
      'order.orderItems[0].price',
    );
  });

  it('is injectable through the shipped dependency bundle and is then the arm that runs', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(itemAt(order, 0).orderItemID, '3.01')],
    });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);
    // The injected admission ran and the scope's hydration was never reached.
    expect(harness.recorder.log).toEqual([
      ROOT_OPENED,
      SCOPE_OPENED,
      ORDER_ADMITTED,
      COMPOSED_PRICING,
    ]);
    expect(harness.recorder.materializedDocuments).toHaveLength(0);
    // It was handed the WHOLE decoded request, not just the order member.
    const [request] = harness.recorder.admissionRequests;
    expect(request?.operation).toBe('applyPromotions');
    expect(request?.requestId).toBe(PLATFORM_REQUEST_ID);
    expect(request).not.toHaveProperty('idempotencyKey');
  });

  it('maps an admission refusal onto the shipped client-shaped response with its member paths', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      refuseAdmission: new OrderViewAdmissionError('unsupportedBodyShape', [
        { path: 'order.orderItems[0].sku', message: 'must expose the entity accessors: getSkuID' },
      ]),
    });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(400);
    expect(errorBodyOf(result).category).toBe('invalidRequest');
    expect(fieldPathsOf(result)).toEqual(['order.orderItems[0].sku']);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });
});

// Concern 4 - the account trust boundary.

/**
 * What a WIRE order document states about its account, read back out of a decoded request.
 *
 * The admission arm receives the PARSED DOCUMENT rather than a materialised view - money is still
 * a decimal string in it and a stated absence is `null`.
 */
function wireAccountStatementOf(document: unknown): unknown {
  if (!isJsonObject(document)) {
    throw new TypeError('the admission was handed something other than an order document');
  }

  return document['accountID'];
}

describe('the account trust boundary (NET-NEW)', () => {
  it('threads the AUTHENTICATED account into the request scope, and never the body member', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      // The body also names the account, and names it correctly, so the request is admitted - but
      // the value the scope receives comes from the authorizer either way.
      postApplyPromotions(
        order,
        { accountID: AUTHENTICATED_ACCOUNT_ID },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.scopeInputs).toHaveLength(1);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);
  });

  it('★★★ REFUSES an envelope and an order that name DIFFERENT accounts', async () => {
    // It was titled "REFUSES a body accountID that disagrees with the authenticated account" and
    // expected the refusal at path `accountID`.
    //
    // So the envelope member is no longer a claim measured against the sender - it NAMES the
    // SUBJECT - and the agreement test moved one level down, onto the document.
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(
        order,
        { accountID: OTHER_ACCOUNT_ID },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.accountID']);
    // Neither identifier is echoed - unchanged, and it was never the part that was wrong.
    expect(result.body).not.toContain(OTHER_ACCOUNT_ID);
    expect(result.body).not.toContain(AUTHENTICATED_ACCOUNT_ID);
    // Refused before the composed operation could price anything.
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('★★★ PRICES ON BEHALF OF the subject the trusted caller names, not the caller itself', async () => {
    // The capability the moved boundary buys, and the reason the old rule could not simply be
    // kept: a trusted service submits an order belonging to a DIFFERENT account and the whole
    // request.
    const { order } = makeGoldenOrder({ accountID: OTHER_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(
        order,
        { accountID: OTHER_ACCOUNT_ID },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    expect(result.statusCode).toBe(200);
    // And the scope was opened for the subject.
    expect(harness.recorder.scopeInputs).toHaveLength(1);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(OTHER_ACCOUNT_ID);
    expect(harness.recorder.composedInputs).toHaveLength(1);
  });

  it('★★ falls back to the TRUSTED CALLER\u2019s own account when the envelope names no subject', async () => {
    // The clause that carries the earlier CRITICAL adoption fix forward.
    const { order } = makeGoldenOrder({});
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);
  });

  it('REFUSES an order document naming a DIFFERENT account from the authenticated one', async () => {
    const { order } = makeGoldenOrder({ accountID: OTHER_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(
        order,
        { accountID: AUTHENTICATED_ACCOUNT_ID },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.accountID']);
    expect(result.body).not.toContain(OTHER_ACCOUNT_ID);
    // The order was admitted - that is where the account became visible - and then refused before
    // the composed operation could price it.
    expect(harness.recorder.log).toEqual([ROOT_OPENED, SCOPE_OPENED, ORDER_ADMITTED]);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('lets the 401 admission gate win before inspecting an anonymous body account', async () => {
    const { order } = makeGoldenOrder({ accountID: OTHER_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    // No authorizer context at all - stated explicitly, because the suite default is an
    // authenticated session - and a document naming an account.
    const result = await harness.invoke(postApplyPromotions(order, {}, null));

    expect(result.statusCode).toBe(401);
    expect(errorBodyOf(result).category).toBe('unauthenticated');
    expect(errorBodyOf(result)).not.toHaveProperty('fields');
    expect(harness.recorder.log).toEqual([]);
  });

  it('REFUSES an anonymous order even when the body names no account', async () => {
    const { order } = makeGoldenOrder({ accountID: undefined });
    const harness = makeHarness({ admit: order });

    // Anonymous on both sides, stated explicitly: no authorizer context and no account on the
    // order.
    const result = await harness.invoke(postApplyPromotions(order, {}, null));

    // The logged-out pricing arm still exists below the boundary, but this HTTP route no longer
    // exposes it anonymously. Authentication is established before any order is admitted.
    expect(result.statusCode).toBe(401);
    expect(errorBodyOf(result).category).toBe('unauthenticated');
    expect(harness.recorder.log).toEqual([]);
  });

  it('★★★ BINDS an authenticated session to its own account when the order names none', async () => {
    const { order } = makeGoldenOrder({ accountID: undefined });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);

    // View the COMPOSED OPERATION received names the authenticated account, so both
    // account-sensitive paths behind it have an account to read.
    const [priced] = harness.recorder.composedInputs;
    expect(priced?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);

    // The admission itself was handed the caller's request UNCHANGED, stating no account - the
    // reconciliation happens after admission, so an admission still sees exactly what was sent.
    expect(harness.recorder.admissionRequests).toHaveLength(1);
    expect(wireAccountStatementOf(harness.recorder.admissionRequests[0]?.order)).toBeNull();

    // And nothing ELSE was REWRITTEN. Every other member is carried across by reference or by
    // value, so binding the account cannot disturb the reward iteration order, an amount, or a
    // collection.
    expect(priced?.orderID).toBe(order.orderID);
    expect(priced?.orderItems).toBe(order.orderItems);
    expect(priced?.orderFulfillments).toBe(order.orderFulfillments);
    expect(priced?.appliedPromotions).toBe(order.appliedPromotions);
    expect(priced?.subtotal).toBe(order.subtotal);
    expect(priced?.subtotalAfterItemDiscounts).toBe(order.subtotalAfterItemDiscounts);
    expect(priced?.promotionCodeList).toBe(order.promotionCodeList);
    expect(priced?.currencyCode).toBe(order.currencyCode);

    // The caller's own object is not mutated: the binding is a fresh shallow view, so an
    // in-process strangler-fig proxy that injected a live aggregate still holds exactly what it
    // composed.
    expect(order.accountID).toBeUndefined();
  });

  it('★★★ binds the same account on the WIRE path, inside the hydration', async () => {
    const { order } = makeGoldenOrder({ accountID: undefined });
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postWireOrder(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.materializedDocuments[0]?.accountID).toBeNull();
    expect(harness.recorder.composedInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);
  });

  it('reads the authorizer claim CASE-INSENSITIVELY, as a CFML struct key read does', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    // An authorizer emitting `accountId` names the same claim as one emitting `accountID`.
    const result = await harness.invoke(
      postApplyPromotions(
        order,
        {},
        {
          accountId: AUTHENTICATED_ACCOUNT_ID,
          SERVICESCOPE: PROMOTION_APPLICATION_CAPABILITY,
        },
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);
  });

  it('compares the two accounts case-insensitively, as CFML string comparison does', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID.toUpperCase() });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    // The same account in a different casing is the same account, so this is not a conflict. CFML
    // identifiers are case-insensitive and reporting a conflict here would refuse a legitimate
    // request.
    expect(result.statusCode).toBe(200);
  });

  it('REFUSES a blank or non-string account claim as unusable authentication', async () => {
    const { order } = makeGoldenOrder({ accountID: undefined });
    const blank = makeHarness({ admit: order });
    const nonString = makeHarness({ admit: order });

    const blankResult = await blank.invoke(postApplyPromotions(order, {}, { accountID: '   ' }));
    const nonStringResult = await nonString.invoke(
      postApplyPromotions(order, {}, { accountID: 12345 }),
    );

    // Neither value can establish a principal. Refusal happens before a scope could coerce either
    // value into an account-scoped read.
    expect(blankResult.statusCode).toBe(401);
    expect(blank.recorder.log).toEqual([]);
    expect(nonStringResult.statusCode).toBe(401);
    expect(nonString.recorder.log).toEqual([]);
  });

  it('applies the same rule to the WIRE path, where the document is the only account statement', async () => {
    const { order } = makeGoldenOrder({ accountID: OTHER_ACCOUNT_ID });
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postWireOrder(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    // The document hydrated - the account only becomes readable once it has - and then the request
    // was refused before pricing. Hydration is a read; pricing is what the account decides.
    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.accountID']);
    expect(harness.recorder.materializedDocuments).toHaveLength(1);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('carries the account on getSalePriceDetailsForProductSkus too, from the authorizer alone', async () => {
    const harness = makeHarness({ salePriceDetails: {} });

    const result = await harness.invoke(
      postDocument(
        {
          operation: 'getSalePriceDetailsForProductSkus',
          productID: PRODUCT_ID,
          accountID: OTHER_ACCOUNT_ID,
        },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    // Nothing about this operation reads the account: `getSalePriceDetailsForProductSkus` takes a
    // productID and the sale-price statement is account-independent
    // [model/dao/PromotionDAO.cfc:L298].
    expect(result.statusCode).toBe(200);
    expect(harness.recorder.salePriceRequests).toEqual([PRODUCT_ID]);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(OTHER_ACCOUNT_ID);
  });
});

describe('the trusted-service trust boundary', () => {
  it('★★★ REFUSES an identified but UNTRUSTED account with 403, before parsing the body', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, untrustedAuthorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    // 403 and not 401: an identity was established and is insufficient. Not 404 either -
    // pretending the route is absent would also hide it from a trusted caller misconfigured to
    // omit its claim.
    expect(result.statusCode).toBe(403);
    expect(errorBodyOf(result).category).toBe('forbidden');
    // A FIXED sentence with no `fields`: nothing about the gate's shape, the claim it reads or the
    // principal that failed it is disclosed.
    expect(errorBodyOf(result)).not.toHaveProperty('fields');
    expect(result.body).not.toContain('adminAccountFlag');
    expect(result.body).not.toContain(AUTHENTICATED_ACCOUNT_ID);

    // Nothing was OPENED, ADMITTED or PRICED. The refusal precedes the decode, so an unauthorized
    // caller costs no parse, no composition root, no scope and no statement.
    expect(harness.recorder.log).toEqual([]);
  });

  it('★★★ refuses an untrusted caller even when the body is MALFORMED, so the gate wins', async () => {
    // Ordering assertion: a caller that is not permitted here must learn that, rather than
    // learning about its JSON - which would confirm the route's schema to a caller it does not
    // serve.
    const harness = makeHarness({});

    const result = await harness.invoke(
      makeProxyEvent({
        body: '{ this is not json',
        authorizer: untrustedAuthorizerFor(AUTHENTICATED_ACCOUNT_ID),
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(harness.recorder.log).toEqual([]);
  });

  it('★★★ REFUSES A GENERAL CATALOG ADMINISTRATOR, because an administrator is not a service', async () => {
    // This is that exact caller: identified, administrative, and holding no service grant.
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, administratorAuthorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    expect(result.statusCode).toBe(403);
    expect(errorBodyOf(result).category).toBe('forbidden');
    expect(errorBodyOf(result)).not.toHaveProperty('fields');
    // The refusal names neither claim, so a caller cannot learn which one would have satisfied it.
    expect(result.body).not.toContain('adminAccountFlag');
    expect(result.body).not.toContain('serviceScope');
    expect(harness.recorder.log).toEqual([]);
  });

  it('★★★ admits a SERVICE GRANT that carries no administrative bit at all', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(
        order,
        {},
        {
          accountID: AUTHENTICATED_ACCOUNT_ID,
          serviceScope: PROMOTION_APPLICATION_CAPABILITY,
        },
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.composedInputs).toHaveLength(1);
  });

  it('★★ refuses every non-admitted rendering of the service grant, and admits the closed set', async () => {
    // The same case asking the corrected question.
    const refusedRenderings: readonly unknown[] = [
      undefined, // the grant is absent entirely
      '', // present and empty
      '   ', // present and blank
      true, // a permission bit is not a grant
      1, // nor a number
      {}, // nor a struct
      [], // nor an array
      'catalogQuery', // a different capability
      'priceResolution,productFeed', // two different capabilities
      'promotion', // a prefix of the right name
      'promotionApplications', // a near-miss spelling
      'catalogQuery, promotionApplication', // padded element: `listFindNoCase` does not trim
    ];

    for (const refused of refusedRenderings) {
      const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
      const harness = makeHarness({ admit: order });

      const result = await harness.invoke(
        postApplyPromotions(
          order,
          {},
          {
            accountID: AUTHENTICATED_ACCOUNT_ID,
            serviceScope: refused,
          },
        ),
      );

      expect(result.statusCode, `rendering ${JSON.stringify(refused)} must not admit`).toBe(403);
      expect(harness.recorder.log).toEqual([]);
    }

    // Admitted: the capability named as an element, case folded exactly as CFML `eq` folds it,
    // alone or among others, with ordinary whitespace around the WHOLE claim value trimmed once.
    const admittedRenderings: readonly string[] = [
      'promotionApplication',
      'PROMOTIONAPPLICATION',
      'PromotionApplication',
      ' promotionApplication ',
      'catalogQuery,promotionApplication',
      'promotionApplication,priceResolution',
    ];

    for (const admitted of admittedRenderings) {
      const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
      const harness = makeHarness({ admit: order });

      const result = await harness.invoke(
        postApplyPromotions(
          order,
          {},
          {
            accountID: AUTHENTICATED_ACCOUNT_ID,
            serviceScope: admitted,
          },
        ),
      );

      expect(result.statusCode, `rendering ${JSON.stringify(admitted)} must admit`).toBe(200);
    }
  });

  it('★★★ cannot be granted the claim by the REQUEST - only the authorizer establishes it', async () => {
    // The BODY asserts both permissions - the grant this route reads and the administrative bit it
    // no longer reads - while the authorizer withholds them.
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      makeProxyEvent({
        body: JSON.stringify({
          ...applyPromotionsDocument(wireOrderDocument(order)),
          serviceScope: PROMOTION_APPLICATION_CAPABILITY,
          adminAccountFlag: true,
        }),
        authorizer: untrustedAuthorizerFor(AUTHENTICATED_ACCOUNT_ID),
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(harness.recorder.log).toEqual([]);
  });
});

describe('order-document self-consistency', () => {
  /**
   * The golden document, with one member of its FIRST order item replaced.
   */
  function documentWithFirstItemMember(
    order: OrderView,
    member: string,
    value: unknown,
  ): Readonly<Record<string, unknown>> {
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    return documentWith(document, 'orderItems', [{ ...firstItem, [member]: value }, ...rest]);
  }

  it('★★★ REFUSES an extendedPrice that is not price x quantity', async () => {
    // The identity is the legacy entity's own: `getExtendedPrice()` is exactly
    // `precisionEvaluate('getPrice() * val(getQuantity())')`
    // [model/entity/OrderItem.cfc:L200-L202].
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWithFirstItemMember(order, 'extendedPrice', '0.01')),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.orderItems.0.extendedPrice']);
    // REFUSED before the HYDRATION, so an inconsistent document costs no entity load, and
    // CERTAINLY before the passes: no intent of any kind is emitted for it.
    expect(harness.recorder.materializedDocuments).toEqual([]);
    expect(harness.recorder.composedInputs).toEqual([]);
    // Nothing submitted is echoed - not the value, not the product it was computed from.
    expect(result.body).not.toContain('0.01');
  });

  it('★★★ REFUSES an extendedSkuPrice that is not skuPrice x quantity', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWithFirstItemMember(order, 'extendedSkuPrice', '999.99')),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.orderItems.0.extendedSkuPrice']);
    expect(harness.recorder.materializedDocuments).toEqual([]);
  });

  it('★★ ADMITS the identity computed at full decimal precision, not at two places', async () => {
    // The comparison goes through `Money`, so a price with more than two decimal places multiplies
    // exactly.
    const { order } = makeGoldenOrder();
    const document = documentWithFirstItemMember(order, 'price', '1.005');
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    const quantity = firstItem['quantity'];

    if (typeof quantity !== 'number') {
      throw new TypeError('the wire projection did not produce a numeric quantity');
    }

    const consistent = documentWith(document, 'orderItems', [
      { ...firstItem, extendedPrice: (1.005 * quantity).toFixed(3) },
      ...rest,
    ]);
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(postDocument(applyPromotionsDocument(consistent)));

    expect(result.statusCode).toBe(200);
  });

  it('★★★ REFUSES an item naming a fulfillment the document does not carry', async () => {
    // `OrderItem.orderFulfillment` is a many-to-one, so an item always belonged to a fulfillment
    // of its own order.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWithFirstItemMember(order, 'orderFulfillmentID', 'fulfillment-not-in-this-order'),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.orderItems.0.orderFulfillmentID']);
    expect(result.body).not.toContain('fulfillment-not-in-this-order');
    expect(harness.recorder.materializedDocuments).toEqual([]);
  });

  it('★ folds identifier case on the fulfillment reference, so a valid reference is not refused', async () => {
    const { order } = makeGoldenOrder();
    const fulfillmentID = itemAt(order, 0).orderFulfillmentID;
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWithFirstItemMember(order, 'orderFulfillmentID', fulfillmentID.toUpperCase()),
        ),
      ),
    );

    expect(result.statusCode).toBe(200);
  });

  it('★★★ REFUSES the same promotionAppliedID claimed under two owners', async () => {
    // Each already-applied promotion becomes a REMOVE intent
    // [model/service/PromotionService.cfc:L64-L80], and a row is attached to exactly one owner.
    const { order } = makeGoldenOrder();
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    const duplicated = {
      promotionAppliedID: 'applied-claimed-twice',
      discountAmount: null,
      promotion: null,
    };
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWith(documentWith(document, 'appliedPromotions', [duplicated]), 'orderItems', [
            { ...firstItem, appliedPromotions: [duplicated] },
            ...rest,
          ]),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    // Reported at the SECOND claim, which is the one that cannot be honoured; the first is a
    // legitimate statement until the second contradicts it.
    expect(fieldPathsOf(result)).toEqual([
      'order.orderItems.0.appliedPromotions.0.promotionAppliedID',
    ]);
    expect(result.body).not.toContain('applied-claimed-twice');
    expect(harness.recorder.materializedDocuments).toEqual([]);
  });

  it('★★★ DOES NOT validate totalSaleQuantity against the items, because the legacy cannot', async () => {
    const { order } = makeGoldenOrder();
    const document = documentWith(wireOrderDocument(order), 'totalSaleQuantity', 4242);
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(postDocument(applyPromotionsDocument(document)));

    expect(result.statusCode).toBe(200);
  });
});

describe('caller-controlled statement and arithmetic bounds', () => {
  /**
   * The golden document with one member of its first order item replaced.
   */
  function withFirstItemQuantity(
    order: OrderView,
    quantity: unknown,
  ): Readonly<Record<string, unknown>> {
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    return documentWith(document, 'orderItems', [{ ...firstItem, quantity }, ...rest]);
  }

  it.each([
    ['just past the safe-integer boundary', 9_007_199_254_740_992],
    ['far past it', 1e300],
    ['negative and past it', -9_007_199_254_740_992],
  ])(
    '★★★ REFUSES a quantity %s with a 400 naming the member, never a 500',
    async (_label, quantity) => {
      // The DEFECT this CLOSES. `z.number().int()` admitted every one of these, and each then
      // reached `fromInteger` `src/lib/cfml/precision.ts`, which accepts only
      // `Number.isSafeInteger` and throws `PrecisionError`.
      const { order } = makeGoldenOrder();
      const harness = makeHarness({ materialize: order });

      const result = await harness.invoke(
        postDocument(applyPromotionsDocument(withFirstItemQuantity(order, quantity))),
      );

      expect(result.statusCode).toBe(400);
      expect(fieldPathsOf(result)).toContain('order.orderItems.0.quantity');
      // Nothing was hydrated and nothing was priced: the refusal is at admission.
      expect(harness.recorder.materializedDocuments).toEqual([]);
    },
  );

  it('★★ REFUSES a quantity beyond the persisted INT range, which is the business bound', async () => {
    // `OrderItem.quantity` is `ormtype="integer"` [model/entity/OrderItem.cfc:L56] - a MySQL
    // signed INT - so 2_147_483_648 cannot describe a persisted order line even though it is a
    // safe integer.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(applyPromotionsDocument(withFirstItemQuantity(order, 2_147_483_648))),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.orderItems.0.quantity');
  });

  it('★★ REFUSES a promotionCodeList naming more codes than the published bound', async () => {
    // The DEFECT this CLOSES. Every code is emitted into two `EXISTS` arms of
    // `getActivePromotionRewards`, so N codes cost 2N placeholders against a 65_535 protocol
    // ceiling.
    const { order } = makeGoldenOrder();
    const codes = Array.from(
      { length: ORDER_DOCUMENT_LIMITS.maximumPromotionCodes + 1 },
      (_unused, index) => `code${String(index)}`,
    ).join(',');
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWith(wireOrderDocument(order), 'promotionCodeList', codes)),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.promotionCodeList');
    expect(harness.recorder.materializedDocuments).toEqual([]);
  });

  it('★★ REFUSES an over-long promotionCodeList even when it names few codes', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWith(wireOrderDocument(order), 'promotionCodeList', 'x'.repeat(20_000)),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.promotionCodeList');
  });

  it('★★ SERVES a promotionCodeList AT the bound, and forwards it VERBATIM', async () => {
    const { order } = makeGoldenOrder();
    const codes = Array.from(
      { length: ORDER_DOCUMENT_LIMITS.maximumPromotionCodes },
      // Deliberately including a repeat and a mixed casing, so a de-duplicating or folding
      // implementation would be caught by the verbatim assertion below.
      (_unused, index) => (index === 0 ? 'DUP' : index === 1 ? 'dup' : `code${String(index)}`),
    ).join(',');
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWith(wireOrderDocument(order), 'promotionCodeList', codes)),
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.materializedDocuments[0]?.promotionCodeList).toBe(codes);
  });

  it('★ SERVES an EMPTY promotionCodeList, which is an order carrying no codes', async () => {
    // `split(',')` on an empty string yields one element, so a naive count would report 1 for a
    // list that names none. The empty case is answered before the count.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWith(wireOrderDocument(order), 'promotionCodeList', '')),
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.materializedDocuments[0]?.promotionCodeList).toBe('');
  });
});

describe('the authenticated admission gate (NET-NEW)', () => {
  it('refuses a request carrying no authorizer context before wiring the graph', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order, {}, null));

    expect(result.statusCode).toBe(401);
    expect(errorBodyOf(result).category).toBe('unauthenticated');
    expect(harness.recorder.log).toEqual([]);
  });

  it('refuses every context that names no usable account', async () => {
    const unusable: readonly Readonly<Record<string, unknown>>[] = [
      {},
      { unrelated: 'x' },
      { accountID: '' },
      { accountID: '  ' },
      { accountID: 42 },
    ];

    for (const authorizer of unusable) {
      const { order } = makeGoldenOrder();
      const harness = makeHarness({ admit: order });

      const result = await harness.invoke(postApplyPromotions(order, {}, authorizer));

      expect(result.statusCode).toBe(401);
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('refuses before reading or parsing the body', async () => {
    const harness = makeHarness();

    const result = await harness.invoke(
      makeProxyEvent({ body: '{ not json at all', authorizer: null }),
    );

    expect(result.statusCode).toBe(401);
    expect(errorBodyOf(result).message).not.toBe(UNPARSABLE_BODY_SENTENCE);
    expect(harness.recorder.log).toEqual([]);
  });

  it('still resolves the route first, so a wrong path is a 404 rather than a 401', async () => {
    const harness = makeHarness();

    const result = await harness.invoke(
      makeProxyEvent({ path: '/promotions/not-a-route', authorizer: null }),
    );

    expect(result.statusCode).toBe(404);
    expect(harness.recorder.log).toEqual([]);
  });

  it('publishes no claim name, internal reason, field detail or challenge', async () => {
    const result = await makeHarness().invoke(makeProxyEvent({ authorizer: null }));
    const headerNames = Object.keys(result.headers ?? {})
      .map((name): string => name.toLowerCase())
      .sort();

    expect(result.statusCode).toBe(401);
    expect(result.body).not.toContain('accountID');
    expect(result.body).not.toContain('noAuthorizerContext');
    expect(result.body).not.toContain('authoriz');
    expect(errorBodyOf(result)).not.toHaveProperty('fields');
    expect(headerNames).toEqual(['cache-control', 'content-type']);
    expect(headerNames).not.toContain('www-authenticate');
  });
});

// Concern 5 - delegation: one root, one scope, one composed operation.

describe('promotion-application delegation (NET-NEW)', () => {
  it('opens the root once, opens ONE scope, and invokes the composed operation exactly once', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);
    // One fresh scope per invocation, never held, cached or reused: that is what stops a warm
    // container from carrying one invocation's state - and therefore one customer's price - into
    // another's.
    expect(harness.recorder.log.filter((label): boolean => label === ROOT_OPENED)).toHaveLength(1);
    expect(harness.recorder.log.filter((label): boolean => label === SCOPE_OPENED)).toHaveLength(1);
    expect(
      harness.recorder.log.filter((label): boolean => label === COMPOSED_PRICING),
    ).toHaveLength(1);
  });

  it('takes a FRESH scope for every invocation and reuses nothing between them', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    await harness.invoke(postApplyPromotions(order));
    await harness.invoke(postApplyPromotions(order));

    expect(harness.recorder.log.filter((label): boolean => label === SCOPE_OPENED)).toHaveLength(2);
    expect(harness.recorder.composedInputs).toHaveLength(2);
  });

  it('threads the injected clock into the request scope', async () => {
    const { order } = makeGoldenOrder();
    const pinned = new Date('2024-02-29T00:00:00.000Z');
    const harness = makeHarness({ admit: order, now: pinned, clock: (): Date => pinned });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    expect(harness.recorder.scopeInputs[0]?.now?.toISOString()).toBe(pinned.toISOString());
    // Rendered through `toISOString`, hence UTC by definition, and read from the SCOPE rather than
    // from a clock this handler owns.
    expect(body.evaluatedAt).toBe(pinned.toISOString());
  });

  it('passes NO clock in the production configuration, so the scope binds the instant itself', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    // `now` absent, not present-and-undefined: the scope reads the wall clock once at its own
    // creation and publishes that single instant.
    expect(harness.recorder.scopeInputs[0]?.now).toBeUndefined();
    expect(body.evaluatedAt).toBe(EVALUATED_AT);
  });

  it('imposes NO ordering of its own on the order items it forwards', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    await harness.invoke(postApplyPromotions(order));

    const [forwarded] = harness.recorder.composedInputs;

    // Item order is preserved exactly.
    expect(forwarded?.orderItems.map((item): string => item.orderItemID)).toEqual(
      order.orderItems.map((item): string => item.orderItemID),
    );
    expect(forwarded).toBe(order);
  });

  it('forwards the order type verbatim and gates nothing on it', async () => {
    const { order } = makeGoldenOrder({ orderTypeSystemCode: 'otReturnOrder' });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));

    // The two order-type conditionals at [model/service/PromotionService.cfc:L61] and
    // [model/service/PromotionService.cfc:L542] are the ENGINE's, and
    // `tests/unit/services/promotionService.test.ts` owns them.
    expect(result.statusCode).toBe(200);
    expect(harness.recorder.composedInputs[0]?.orderType.systemCode).toBe('otReturnOrder');
    expect(promotionIntentsOf(successBodyOf(result))).toEqual([]);
  });

  it('reaches NEITHER individual order pass, and neither the price-resolution nor promotion queries', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));

    // Every withheld member of the scope and the root is a throwing getter, so a 200 here is
    // itself the assertion: had the handler touched `priceGroupService`, `promotionService`,
    // `currentAccountContext`, `diagnostics` or any other withheld member.
    expect(result.statusCode).toBe(200);
    expect(harness.emitted.lines.join('\n')).not.toContain('WithheldCollaboratorError');
  });

  it('and that guard is LIVE rather than vacuous - a withheld member really does throw', () => {
    const recorder = makeRecorder();
    const scope = makeRequestScopeDouble(
      {
        now: new Date(EVALUATED_AT),
        salePriceDetails: {},
        materialized: undefined,
        materializationFailure: undefined,
        pricing: { priceGroupIntents: [], promotionIntents: [], failure: undefined },
      },
      recorder,
    );

    // Proven by reading one, so the negative assertions above cannot be passing because the
    // getters are inert.
    expect((): unknown => scope.priceGroupService).toThrow(WithheldCollaboratorError);
    expect((): unknown => scope.promotionService).toThrow(/does not use/);
  });

  it('refuses every caller-authored ordering member before opening the graph', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    // There is no `sequence`, `phase`, `runAfter`, `pipeline`, `order` or `skipPriceGroups` member
    // on this contract, and a caller inventing one is sending an unknown envelope member.
    const result = await harness.invoke(
      postApplyPromotions(order, {
        sequence: 'promotionsThenPriceGroups',
        skipPriceGroups: true,
      }),
    );

    expect(result.statusCode).toBe(400);
    // The unknown member names are caller-authored and are therefore not reflected. The safe path
    // identifies their containing object: the request envelope itself.
    expect(fieldPathsOf(result)).toEqual(['']);
    expect(result.body).not.toContain('sequence');
    expect(result.body).not.toContain('skipPriceGroups');
    expect(result.body).not.toContain('promotionsThenPriceGroups');
    expect(harness.recorder.log).toEqual([]);
  });
});

// Concern 6 - the anti-corruption boundary: views in, intents out.

describe('the anti-corruption boundary (NET-NEW)', () => {
  it('never mutates or persists the order, its items or its fulfillments', async () => {
    const { order } = makeGoldenOrder();
    const before = JSON.stringify({
      orderID: order.orderID,
      subtotal: order.subtotal.toDecimalString(),
      items: order.orderItems.map((item): readonly string[] => [
        item.orderItemID,
        item.price.toDecimalString(),
        item.extendedPrice.toDecimalString(),
      ]),
      appliedPromotions: order.appliedPromotions.length,
    });
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(itemAt(order, 0).orderItemID, '3.01')],
    });

    await harness.invoke(postApplyPromotions(order));

    // The submitted view is READ and handed on.
    expect(
      JSON.stringify({
        orderID: order.orderID,
        subtotal: order.subtotal.toDecimalString(),
        items: order.orderItems.map((item): readonly string[] => [
          item.orderItemID,
          item.price.toDecimalString(),
          item.extendedPrice.toDecimalString(),
        ]),
        appliedPromotions: order.appliedPromotions.length,
      }),
    ).toBe(before);
  });

  it('emits intents keyed ONLY by opaque identifiers, across all three applied types', async () => {
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const fulfillment = order.orderFulfillments[0];

    if (fulfillment === undefined) {
      throw new TypeError('the golden order carries no fulfillment');
    }

    const harness = makeHarness({
      admit: order,
      promotionIntents: [
        itemIntent(firstItem.orderItemID, '3.01'),
        {
          operation: 'add',
          appliedType: 'order',
          orderID: order.orderID,
          promotionID: PROMOTION_ID,
          discountAmount: Money.fromDecimalString('5.00'),
        },
        {
          operation: 'add',
          appliedType: 'orderFulfillment',
          orderFulfillmentID: fulfillment.orderFulfillmentID,
          promotionID: PROMOTION_ID,
          discountAmount: Money.fromDecimalString('1.25'),
        },
      ],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    const intents = promotionIntentsOf(body);

    expect(intents.map((intent): string => intent.appliedType)).toEqual([
      'orderItem',
      'order',
      'orderFulfillment',
    ]);
    // `model/entity/PromotionApplied.cfc` holds real foreign keys into the out-of-scope Order,
    // OrderItem and OrderFulfillment [model/service/PromotionService.cfc:L58, L59, L61]; this
    // boundary reaches all three as OPAQUE strings only.
    const serialized = JSON.stringify(intents);
    expect(serialized).toContain(firstItem.orderItemID);
    expect(serialized).toContain(order.orderID);
    expect(serialized).toContain(fulfillment.orderFulfillmentID);
    expect(serialized).not.toContain('getSkuID');
    expect(serialized).not.toContain('_orm');
  });

  it('renders discountAmount at FULL PRECISION, never rounded to a presentation form', async () => {
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(firstItem.orderItemID, '7.49625')],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    // `Money.toDecimalString()` and not `toFixed2()`, and the difference is money: an intent is a
    // write-side instruction destined for a `big_decimal` column
    // [model/entity/PromotionApplied.cfc:L51].
    expectSameAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.49625');
    // The presentation form the legacy's own `numberFormat` would have produced is ABSENT from the
    // wire: a rounded amount reaching a `big_decimal` column is money quietly lost.
    expect(JSON.stringify(body.promotionIntents)).not.toContain('7.50');
  });

  it('OMITS discountAmount on a removal rather than rendering a zero', async () => {
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const harness = makeHarness({
      admit: order,
      promotionIntents: [
        {
          operation: 'remove',
          appliedType: 'orderItem',
          orderItemID: firstItem.orderItemID,
          promotionAppliedID: 'pa-existing-0001',
          // NULLABLE on the persisted-row removal shape alone: the legacy's blanket clear never
          // reads the association and the foreign key declares no `notnull`
          // [model/entity/PromotionApplied.cfc:L58].
          promotionID: PROMOTION_ID,
        },
      ],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    const [intent] = promotionIntentsOf(body);

    // A removal carries no amount at all: `discountAmount` is `?: never` on that variant, and a
    // zero would state a discount of nothing rather than the absence of one.
    expect(intent?.operation).toBe('remove');
    expect(intent === undefined ? true : 'discountAmount' in intent).toBe(false);
  });

  it('renders price-group intents alongside them, in the order the pass emitted', async () => {
    const { order } = makeGoldenOrder();
    const first = itemAt(order, 0);
    const second = itemAt(order, 1);
    const harness = makeHarness({
      admit: order,
      priceGroupIntents: [
        {
          orderItemID: second.orderItemID,
          price: Money.fromDecimalString('9.50'),
          priceGroupID: 'pg-second-0002',
        },
        {
          orderItemID: first.orderItemID,
          price: Money.fromDecimalString('11.00'),
          priceGroupID: 'pg-first-0001',
        },
      ],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    expect((body.priceGroupIntents ?? []).map((intent): string => intent.orderItemID)).toEqual([
      second.orderItemID,
      first.orderItemID,
    ]);
    expectSameAmount((body.priceGroupIntents ?? [])[0]?.price ?? '', '9.50');
  });

  it('serves an EMPTY intent set as an ordinary 200', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));
    const body = successBodyOf(result);

    // An empty array is a valid result and, for a return order, the CORRECT one - see the
    // preserved `issue #1766` no-op, which the services suite owns.
    expect(result.statusCode).toBe(200);
    expect(body.promotionIntents).toEqual([]);
    expect(body.priceGroupIntents).toEqual([]);
  });

  it('exposes nothing whatsoever for PromotionAccount, which is inert in this slice', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.body.toLowerCase()).not.toContain('promotionaccount');
  });
});

// Section 7 - safe diagnostics at the handler seam.
//
// Engine arithmetic and ordering belong to the services tier.

describe('safe handler diagnostics (NET-NEW)', () => {
  it('logs COUNTS about the priced order and no identifier or amount', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const firstItem = itemAt(order, 0);
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(firstItem.orderItemID, '3.01')],
    });

    await harness.invoke(postApplyPromotions(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)));

    const emitted = harness.emitted.lines.join('\n');

    // An order document is caller-authored and a log stream is not the place to reproduce one. The
    // whole capture is asserted as TEXT, so a leak inside a field nobody inspected still fails.
    expect(emitted).toContain('orderItemCount');
    expect(emitted).toContain('promotionIntentCount');
    expect(emitted).not.toContain(order.orderID);
    expect(emitted).not.toContain(firstItem.orderItemID);
    expect(emitted).not.toContain(AUTHENTICATED_ACCOUNT_ID);
    expect(emitted).not.toContain('3.01');
  });
});

// Concern 7 - the sale-price operation.

describe('the sale-price operation reachable through this adapter (NET-NEW)', () => {
  it('serves getSalePriceDetailsForProductSkus and renders every member safely', async () => {
    const harness = makeHarness({
      salePriceDetails: {
        [SALE_PRICE_SKU_ID]: {
          skuID: SALE_PRICE_SKU_ID,
          discountLevel: 'sku',
          salePriceDiscountType: 'percentageOff',
          salePrice: Money.fromDecimalString('17.49375'),
          originalPrice: Money.fromDecimalString('19.99'),
          promotionID: SALE_PRICE_PROMOTION_ID,
          roundingRuleID: 'rr-closest-0001',
          salePriceExpirationDateTime: new Date('2024-12-31T23:59:59.000Z'),
        },
      },
    });

    const result = await harness.invoke(
      postDocument({
        operation: 'getSalePriceDetailsForProductSkus',
        productID: PRODUCT_ID,
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.salePriceRequests).toEqual([PRODUCT_ID]);
    // No order view is involved: the legacy signature takes a plain string
    // [model/service/PromotionService.cfc:L1022], so there is nothing to materialise and nothing
    // to hydrate.
    expect(harness.recorder.composedInputs).toHaveLength(0);
    expect(harness.recorder.materializedDocuments).toHaveLength(0);

    const detail = successBodyOf(result).salePriceDetails?.[SALE_PRICE_SKU_ID];
    expect(detail?.skuID).toBe(SALE_PRICE_SKU_ID);
    expectSameAmount(detail?.salePrice ?? '', '17.49375');
    expectSameAmount(detail?.originalPrice ?? '', '19.99');
    expect(detail?.roundingRuleID).toBe('rr-closest-0001');
    // ISO-8601, hence UTC by definition.
    expect(detail?.salePriceExpirationDateTime).toBe('2024-12-31T23:59:59.000Z');
  });

  it('preserves a reserved opaque SKU key as an own sale-price member', async () => {
    const reservedSkuID = '__proto__';
    const salePriceDetails: Record<string, SalePriceDetail> = {};
    Object.defineProperty(salePriceDetails, reservedSkuID, {
      configurable: true,
      enumerable: true,
      value: {
        skuID: reservedSkuID,
        discountLevel: 'sku',
        salePriceDiscountType: 'amount',
        salePrice: Money.fromDecimalString('8.50'),
        promotionID: SALE_PRICE_PROMOTION_ID,
      },
      writable: true,
    });
    const harness = makeHarness({ salePriceDetails });

    const result = await harness.invoke(
      postDocument({
        operation: 'getSalePriceDetailsForProductSkus',
        productID: PRODUCT_ID,
      }),
    );
    const rendered = successBodyOf(result).salePriceDetails;

    expect(result.statusCode).toBe(200);
    expect(rendered).toBeDefined();
    expect(rendered === undefined ? false : Object.hasOwn(rendered, reservedSkuID)).toBe(true);
    expect(rendered?.[reservedSkuID]?.skuID).toBe(reservedSkuID);
    expect(Object.getPrototypeOf(rendered)).toBe(Object.prototype);
  });

  it('OMITS an absent sale-price member rather than coercing it to zero or the epoch', async () => {
    const harness = makeHarness({
      salePriceDetails: {
        [SALE_PRICE_SKU_ID]: {
          skuID: SALE_PRICE_SKU_ID,
          discountLevel: 'global',
          salePriceDiscountType: 'amount',
          salePrice: Money.fromDecimalString('9.99'),
          promotionID: SALE_PRICE_PROMOTION_ID,
        },
      },
    });

    const result = await harness.invoke(
      postDocument({
        operation: 'getSalePriceDetailsForProductSkus',
        productID: PRODUCT_ID,
      }),
    );

    const detail = successBodyOf(result).salePriceDetails?.[SALE_PRICE_SKU_ID];

    // An absent `originalPrice` is not zero - that would understate a saving - and an absent
    // expiration is not the epoch, which would expire a live sale. Both keys are simply ABSENT.
    expect(detail).toBeDefined();
    expect(detail === undefined ? true : 'originalPrice' in detail).toBe(false);
    expect(detail === undefined ? true : 'salePriceExpirationDateTime' in detail).toBe(false);
    expect(detail === undefined ? true : 'roundingRuleID' in detail).toBe(false);
    expect(result.body).not.toContain('1970-01-01');
  });

  it('serves an empty detail map without inventing a member', async () => {
    const harness = makeHarness({ salePriceDetails: {} });

    const result = await harness.invoke(
      postDocument({
        operation: 'getSalePriceDetailsForProductSkus',
        productID: PRODUCT_ID,
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(successBodyOf(result).salePriceDetails).toEqual({});
    // The comma-list helper is exercised on the empty string precisely because `listLen('')` is 0
    // and a naive `split(',').length` would answer 1 - the CFML semantics this subtree preserves.
    expect(listLen('')).toBe(0);
  });

  it('refuses a getSalePriceDetailsForProductSkus payload with no productID, by member path', async () => {
    const harness = makeHarness();

    const result = await harness.invoke(
      postDocument({ operation: 'getSalePriceDetailsForProductSkus' }),
    );

    // The discriminated envelope refuses it before the dispatcher, which is why the dispatcher has
    // no "selected this operation but sent no product" branch to test.
    expect(result.statusCode).toBe(400);
    expect(harness.recorder.salePriceRequests).toEqual([]);
  });
});

// Concern 8 - response shaping and safe error mapping.

/**
 * Internal diagnostic text that must reach the LOG and never a caller.
 *
 * Deliberately shaped like the thing that actually leaks in practice - a driver failure that has
 * embedded statement text.
 */
const WITHHELD_INTERNAL_DETAIL =
  'SELECT skuID FROM SwSku WHERE skuID = ? -- invented diagnostic text, callers must never see this';

/**
 * The framework's dead-call-target sentence, byte for byte.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]:
 * `'You have called a method #arguments.missingMethodName#() which does not exists in the #getClassName()# entity.'`
 * and "does not exists" is REPRODUCED, not corrected.
 *
 * The method named here is the real one:
 * LEGACY-DEFECT [model/entity/Sku.cfc:L258] `getPriceByPromotion` calls
 * `calculateSkuPriceBasedOnPromotion`, which does not exist on the service, so this sentence is
 * what that call site produces at runtime.
 * Preserved deliberately; do not fix without a product decision.
 */
const MISSING_METHOD_SENTENCE =
  'You have called a method calculateSkuPriceBasedOnPromotion() which does not exists in the Sku entity.';

/**
 * An error whose NAME is identifier-shaped and whose MESSAGE is the detail that must be withheld.
 */
class WithheldDetailError extends Error {
  public constructor() {
    super(WITHHELD_INTERNAL_DETAIL);
    this.name = 'WithheldDetailError';
  }
}

/**
 * The sentences `src/handlers/errorMapper.ts` owns, restated here so a drift in either side fails.
 */
const GENERIC_FAILURE_SENTENCE = 'The request could not be completed.';
const ROUTE_NOT_FOUND_SENTENCE = 'The requested route does not exist.';
const INVALID_INPUT_SENTENCE = 'The request input is not valid.';
const MISSING_BODY_SENTENCE = 'A request body is required and was not supplied.';
const UNPARSABLE_BODY_SENTENCE = 'The request body is not valid JSON.';
const UNSUPPORTED_SHAPE_SENTENCE = 'The request body is not the expected shape.';

/**
 * Every status this handler is permitted to return, and nothing else.
 */
const PERMITTED_STATUSES: readonly number[] = [200, 400, 401, 403, 404, 500];

/**
 * Header names that would invent a semantic the source never had.
 */
const FORBIDDEN_HEADER_NAMES: readonly string[] = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-circuit-state',
  'www-authenticate',
];

/**
 * Assert a response carries the two frozen headers and no invented third semantic.
 */
function expectSafeResponseEnvelope(result: APIGatewayProxyResult): void {
  expect(PERMITTED_STATUSES).toContain(result.statusCode);

  const headers = result.headers ?? {};
  expect(headers['content-type']).toBe('application/json; charset=utf-8');
  // `no-store`, because a priced order belongs to one account at one instant and an intermediary
  // caching it would serve one customer's discount to another.
  expect(headers['cache-control']).toBe('no-store');
  expect(headers['x-content-type-options']).toBeUndefined();

  const headerNames = Object.keys(headers).map((name): string => name.toLowerCase());
  expect(headerNames).toEqual(['content-type', 'cache-control']);
  for (const forbidden of FORBIDDEN_HEADER_NAMES) {
    expect(headerNames).not.toContain(forbidden);
  }
}

describe('response shaping and safe error mapping (NET-NEW)', () => {
  it('★★★ shapes a 200 as the SHARED envelope, with this capability nested under `result`', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));
    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(200);

    const served = servedEnvelopeOf(result);
    const body = served.result;

    // The shared envelope, member for member, in the order the mapper writes them.
    expect(Object.keys(served)).toEqual(['requestId', 'capability', 'action', 'result']);
    expect(served.requestId).toBe(PLATFORM_REQUEST_ID);
    expect(served.capability).toBe('promotionApplication');
    expect(served.action).toBe('applyPromotions');

    expect(body.operation).toBe('applyPromotions');
    // GONE, not moved: nothing in the served document names an idempotency key any more.
    expect(body).not.toHaveProperty('idempotencyKey');
    // And the correlation identifier is the ENVELOPE's, not the document's.
    expect(body).not.toHaveProperty('requestId');
    expect(body.evaluatedAt).toBe(EVALUATED_AT);
    // ISO-8601 in UTC, which is the whole point of an explicit instant rather than a server-local
    // one.
    expect(body.evaluatedAt.endsWith('Z')).toBe(true);
    expect(new Date(body.evaluatedAt).toISOString()).toBe(EVALUATED_AT);

    // Both intent collections are reported, and both are arrays even when a pass decided nothing -
    // an empty result is a decision, never an absence.
    expect(Array.isArray(body.promotionIntents)).toBe(true);
    expect(Array.isArray(body.priceGroupIntents)).toBe(true);
    // The `salePriceDetails` member belongs to the other operation and is omitted here rather than
    // sent as an empty object: `exactOptionalPropertyTypes` is on and absence is expressible.
    expect(Object.hasOwn(served.result, 'salePriceDetails')).toBe(false);

    // No status the source never had, and no 201/202 either: both operations are DECISIONS rather
    // than durable writes, so there is no resource created to report and no acceptance to
    // acknowledge.
    expect(result.statusCode).not.toBe(201);
    expect(result.statusCode).not.toBe(202);
  });

  it('★★★ is retry-safe BY CONSTRUCTION: the same document decides identically with NO key', async () => {
    const first = makeGoldenOrder();
    const firstHarness = makeHarness({
      admit: first.order,
      promotionIntents: [itemIntent(itemAt(first.order, 0).orderItemID, '3.01')],
    });
    const document = applyPromotionsDocument(wireOrderDocument(first.order));
    const firstResult = await firstHarness.invoke(
      makeProxyEvent({
        body: JSON.stringify(document),
        requestId: 'req-promotion-application-first',
        ...(first.order.accountID === undefined
          ? {}
          : { authorizer: authorizerFor(first.order.accountID) }),
      }),
    );

    const replay = makeGoldenOrder();
    const replayHarness = makeHarness({
      admit: replay.order,
      promotionIntents: [itemIntent(itemAt(replay.order, 0).orderItemID, '3.01')],
    });
    // The very same BYTES, re-sent. Not a second document that happens to look similar.
    const replayResult = await replayHarness.invoke(
      makeProxyEvent({
        body: JSON.stringify(document),
        requestId: 'req-promotion-application-replay',
        ...(replay.order.accountID === undefined
          ? {}
          : { authorizer: authorizerFor(replay.order.accountID) }),
      }),
    );

    expectSafeResponseEnvelope(replayResult);
    expect(replayResult.statusCode).toBe(200);

    const firstServed = servedEnvelopeOf(firstResult);
    const replayServed = servedEnvelopeOf(replayResult);

    // Neither response names a key, so there is nothing to echo and nothing to look up.
    expect(firstResult.body).not.toContain('idempotencyKey');
    expect(replayResult.body).not.toContain('idempotencyKey');

    // The correlation identifier is per INVOCATION, which is the one member that legitimately
    // differs.
    expect(firstServed.requestId).toBe('req-promotion-application-first');
    expect(replayServed.requestId).toBe('req-promotion-application-replay');
    expect(firstServed.requestId).not.toBe(replayServed.requestId);

    // And the DECISION is byte-identical. Compared on the serialised document rather than field by
    // field, so an added, dropped or reordered member fails this too.
    expect(JSON.stringify(replayServed.result)).toBe(JSON.stringify(firstServed.result));
    expect(promotionIntentsOf(replayServed.result)).toEqual(promotionIntentsOf(firstServed.result));
    expect(replayServed.result.priceGroupIntents).toEqual(firstServed.result.priceGroupIntents);

    // The replay RECOMPUTED - it drove the composed operation once, in the same order - rather
    // than being answered from a cached receipt. Recomputation is the mechanism; identity is the
    // guarantee.
    expect(replayHarness.recorder.composedInputs).toHaveLength(1);
    expect(replayHarness.recorder.log).toEqual(firstHarness.recorder.log);
  });

  it('answers 404 for an unmatched route WITHOUT ever opening a composition root', async () => {
    // The one path the production handler can be driven through in a unit suite.
    const result = await productionHandler(
      makeProxyEvent({ path: '/promotions/not-a-route', httpMethod: 'POST' }),
    );

    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(404);

    const error = errorBodyOf(result);
    expect(error.category).toBe('routeNotFound');
    expect(error.message).toBe(ROUTE_NOT_FOUND_SENTENCE);
    expect(error.requestId).toBe(PLATFORM_REQUEST_ID);
    // The submitted path is LOGGED, never echoed: reflecting a caller-authored path back serves no
    // diagnostic purpose the correlation identifier does not already serve.
    expect(result.body).not.toContain('not-a-route');
    expect(Object.hasOwn(error, 'fields')).toBe(false);
  });

  it('answers 404 for a route belonging to ANOTHER capability, disclosing nothing about it', async () => {
    // The four sibling capabilities are separate deployables.
    const otherCapabilityRoute = ROUTE_TABLE.priceResolution;
    expect(otherCapabilityRoute.path).not.toBe(CAPABILITY_ROUTE.path);

    const result = await productionHandler(
      makeProxyEvent({ path: otherCapabilityRoute.path, httpMethod: otherCapabilityRoute.methods }),
    );

    expect(result.statusCode).toBe(404);
    const error = errorBodyOf(result);
    expect(error.category).toBe('routeNotFound');
    expect(error.message).toBe(ROUTE_NOT_FOUND_SENTENCE);
    expect(result.body).not.toContain(otherCapabilityRoute.path);
    expect(result.body).not.toContain(otherCapabilityRoute.capability);
    expect(result.body).not.toContain(otherCapabilityRoute.action);
  });

  it('answers 400 with the shipped sentence for an absent, blank or unparsable body', async () => {
    // Three DISTINCT reasons, three DISTINCT frozen sentences, and not one of them interpolates a
    // media type, a parser position or a fragment of what was sent.
    const absent = makeHarness();
    const absentResult = await absent.invoke(makeProxyEvent({}));
    expectSafeResponseEnvelope(absentResult);
    expect(absentResult.statusCode).toBe(400);
    expect(errorBodyOf(absentResult).category).toBe('invalidRequest');
    expect(errorBodyOf(absentResult).message).toBe(MISSING_BODY_SENTENCE);

    const blank = makeHarness();
    const blankResult = await blank.invoke(makeProxyEvent({ body: '   \n\t  ' }));
    expect(blankResult.statusCode).toBe(400);
    expect(errorBodyOf(blankResult).message).toBe(MISSING_BODY_SENTENCE);

    const unparsable = makeHarness();
    const unparsableResult = await unparsable.invoke(
      makeProxyEvent({ body: '{"operation":"applyPromotions",' }),
    );
    expect(unparsableResult.statusCode).toBe(400);
    expect(errorBodyOf(unparsableResult).message).toBe(UNPARSABLE_BODY_SENTENCE);
    // The truncated fragment is not quoted back, and no parser position is disclosed.
    expect(unparsableResult.body).not.toContain('applyPromotions"');
    expect(unparsableResult.body.toLowerCase()).not.toContain('position');

    // None of the three reached the graph: no root, no scope, no pass.
    for (const harness of [absent, blank, unparsable]) {
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('answers 400 for a body that parsed but is not this document', async () => {
    // An array is a JSON document; it is not this document. `null` and a scalar fold into the same
    // reason, because the distinction a caller needs is "not the expected shape" and nothing
    // finer.
    for (const body of ['[]', 'null', '42', '"applyPromotions"']) {
      const harness = makeHarness();
      const result = await harness.invoke(makeProxyEvent({ body }));

      expectSafeResponseEnvelope(result);
      expect(result.statusCode).toBe(400);
      expect(errorBodyOf(result).category).toBe('invalidRequest');
      expect(errorBodyOf(result).message).toBe(UNSUPPORTED_SHAPE_SENTENCE);
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('★★ answers 400 for a `__proto__` own key, at the ROOT and NESTED alike', async () => {
    // The one unrecognized key `z.strictObject` does not refuse.
    //
    // An object literal `{ __proto__: {} }` invokes the prototype SETTER and creates no own
    // property.
    const bodies: readonly string[] = [
      '{"operation":"updateOrderAmountsWithPromotions","__proto__":{"p":1}}',
      '{"operation":"updateOrderAmountsWithPromotions","order":{"orderID":"o-1","__proto__":{"p":1}}}',
      `{"operation":"updateOrderAmountsWithPromotions","${PLANTED_ANCESTOR_KEY}":{"__proto__":{"p":1}}}`,
    ];

    for (const body of bodies) {
      const harness = makeHarness();
      const result = await harness.invoke(makeProxyEvent({ body }));

      expectSafeResponseEnvelope(result);
      expect(result.statusCode).toBe(400);
      expect(errorBodyOf(result).category).toBe('invalidRequest');
      // One fixed issue, whatever the depth. No ancestor, no value, no depth.
      expect(fieldPathsOf(result)).toStrictEqual(['__proto__']);
      expect(result.body).not.toContain(PLANTED_ANCESTOR_KEY);
      // And nothing the caller wrote reaches the diagnostic either.
      expect(harness.emitted.lines.join('\n')).not.toContain(PLANTED_ANCESTOR_KEY);
      expect(harness.emitted.lines.join('\n')).not.toContain('fieldPaths');
      // And the REFUSAL is TOTAL: no composition root was opened, so nothing was priced and no
      // connection was taken from the pool.
      expect(harness.recorder.log).toEqual([]);
    }
    expect(Object.prototype).not.toHaveProperty('p');
  });

  it('honours a base64-encoded body, because the platform sets that flag', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });
    const document = applyPromotionsDocument(wireOrderDocument(order));

    const result = await harness.invoke(
      makeProxyEvent({
        body: Buffer.from(JSON.stringify(document), 'utf8').toString('base64'),
        isBase64Encoded: true,
        ...(order.accountID === undefined ? {} : { authorizer: authorizerFor(order.accountID) }),
      }),
    );

    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(200);
    expect(successBodyOf(result).operation).toBe('applyPromotions');
    expect(harness.recorder.composedInputs).toHaveLength(1);
  });

  it('answers 400 with safe schema paths and never with caller-authored unknown names or values', async () => {
    const { order } = makeGoldenOrder();
    const forbiddenKey = 'idem key with spaces and a slash/';
    const smuggledAccountID = 'account-smuggled-in-the-body-0001';

    const cases: readonly {
      readonly document: Readonly<Record<string, unknown>>;
      readonly safePath: string;
      readonly absentFromBody: readonly string[];
    }[] = [
      {
        // `accountID` is a server-known compatibility member with an explicit refusal, so its
        // fixed path remains actionable. Only the submitted identifier is absent from the
        // response.
        document: applyPromotionsDocument(wireOrderDocument(order), {
          accountID: smuggledAccountID,
        }),
        safePath: 'accountID',
        absentFromBody: [smuggledAccountID, 'smuggled'],
      },
      {
        // The key is refused as an unrecognized member, and neither its NAME nor its VALUE reaches
        // the response body.
        document: applyPromotionsDocument(wireOrderDocument(order), {
          idempotencyKey: forbiddenKey,
        }),
        safePath: '',
        absentFromBody: ['idempotencyKey', forbiddenKey, 'spaces'],
      },
      {
        // The discriminated union makes "a getSalePriceDetailsForProductSkus request with no
        // productID" a validation failure carrying a member path, rather than a value some later
        // branch has to re-check.
        document: { operation: 'getSalePriceDetailsForProductSkus' },
        safePath: 'productID',
        absentFromBody: [],
      },
      {
        // A third operation nobody published: the discriminator itself fails, and the offending
        // value is not quoted back.
        document: { operation: 'deleteEverything' },
        safePath: 'operation',
        absentFromBody: ['deleteEverything'],
      },
    ];

    for (const testCase of cases) {
      const harness = makeHarness({ materialize: order });
      const result = await harness.invoke(postDocument(testCase.document));

      expect(result.statusCode).toBe(400);
      expect(errorBodyOf(result).message).toBe(INVALID_INPUT_SENTENCE);
      expect(fieldPathsOf(result)).toContain(testCase.safePath);
      for (const submittedValue of testCase.absentFromBody) {
        expect(result.body).not.toContain(submittedValue);
      }
    }
  });

  it('answers 500 with ONLY the generic sentence for an unrecognised failure', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, failure: new WithheldDetailError() });

    const result = await harness.invoke(postApplyPromotions(order));
    const failure = errorBodyOf(result);

    expect(result.statusCode).toBe(500);
    expectSafeResponseEnvelope(result);
    expect(failure.category).toBe('unrecognized');
    expect(failure.message).toBe(GENERIC_FAILURE_SENTENCE);
    expect(failure.requestId).toBe(PLATFORM_REQUEST_ID);
    // Three members exactly, and `fields` omitted rather than present and empty.
    expect(Object.keys(failure).sort()).toEqual(['category', 'message', 'requestId']);
    // A driver failure routinely embeds statement text and bound values, and none of it may reach
    // a caller. The classification goes to the log stream under the same correlation identifier.
    expect(result.body).not.toContain(WITHHELD_INTERNAL_DETAIL);
    expect(result.body).not.toContain('SwSku');
    expect(result.body).not.toContain('WithheldDetailError');
    expect(harness.emitted.lines.join('\n')).toContain('WithheldDetailError');
  });

  it('reproduces the framework dead-call-target sentence byte for byte, as a 500', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, failure: new Error(MISSING_METHOD_SENTENCE) });

    const result = await harness.invoke(postApplyPromotions(order));

    // The mapper recognises the framework's own contract by message shape - grammatical error
    // included and republishes it. This handler neither calls the dead target nor silences it.
    expect(result.statusCode).toBe(500);
    expect(errorBodyOf(result).category).toBe('missingMethod');
    expect(errorBodyOf(result).message).toBe(MISSING_METHOD_SENTENCE);
  });

  it('returns nothing but the permitted statuses, over every failure this suite can drive', async () => {
    const { order } = makeGoldenOrder();
    const statuses = [
      (await productionHandler(makeProxyEvent({ path: '/nowhere' }))).statusCode,
      (await makeHarness().invoke(makeProxyEvent({}))).statusCode,
      (await makeHarness().invoke(makeProxyEvent({ body: '{' }))).statusCode,
      (await makeHarness().invoke(makeProxyEvent({ body: '[]' }))).statusCode,
    ];
    statuses.push(
      (
        await makeHarness({ admit: order }).invoke(
          postDocument(
            applyPromotionsDocument(wireOrderDocument(order), { accountID: 'account-smuggled' }),
          ),
        )
      ).statusCode,
      (
        await makeHarness({
          refuseAdmission: new OrderViewAdmissionError('unsupportedBodyShape', []),
        }).invoke(postApplyPromotions(order))
      ).statusCode,
      (await makeHarness().invoke(makeProxyEvent({ authorizer: null }))).statusCode,
    );

    for (const status of statuses) {
      expect(PERMITTED_STATUSES).toContain(status);
    }
    // The handler owns one explicit unauthenticated arm, but invents no permission, conflict,
    // semantic-validation or rate-limit status and publishes no authentication challenge.
    expect(statuses).toContain(401);
    expect(statuses).not.toContain(403);
    expect(statuses).not.toContain(429);
  });

  it('correlates on the runtime request id when one is supplied, and the event id otherwise', async () => {
    const { order } = makeGoldenOrder();
    const runtime = makeHarness({ admit: order });
    const gateway = makeHarness({ admit: order });

    const runtimeContext: Context = {
      awsRequestId: 'runtime-0000-0000-0000-000000000009',
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'promotion-application',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:000000000000:function:promotion-application',
      memoryLimitInMB: '512',
      logGroupName: '/aws/lambda/promotion-application',
      logStreamName: '2024/06/01/[$LATEST]000000000000',
      getRemainingTimeInMillis: (): number => refuse('Context.getRemainingTimeInMillis'),
      done: (): void => refuse('Context.done'),
      fail: (): void => refuse('Context.fail'),
      succeed: (): void => refuse('Context.succeed'),
    };

    const withRuntime = servedEnvelopeOf(
      await runtime.invoke(postApplyPromotions(order), runtimeContext),
    );
    const withoutRuntime = servedEnvelopeOf(await gateway.invoke(postApplyPromotions(order)));

    expect(withRuntime.requestId).toBe('runtime-0000-0000-0000-000000000009');
    expect(withoutRuntime.requestId).toBe(PLATFORM_REQUEST_ID);
  });

  it('TRIMS a padded platform correlation identifier before publishing it', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const body = servedEnvelopeOf(
      await harness.invoke(
        makeProxyEvent({
          requestId: `  ${PLATFORM_REQUEST_ID}  `,
          body: JSON.stringify(applyPromotionsDocument(wireOrderDocument(order))),
        }),
      ),
    );

    expect(body.requestId).toBe(PLATFORM_REQUEST_ID);
  });
});

/**
 * Mutual assignability, as a compile-time proposition.
 */
type IsExactly<TLeft, TRight> = [TLeft] extends [TRight]
  ? [TRight] extends [TLeft]
    ? true
    : false
  : false;

describe('the four findings with no other home (NET-NEW)', () => {
  // Both `operation` and `appliedType` were declared `string` on the rendered intent, under
  // comments asserting that the union was "not widened here" and that "no fourth applied type is
  // invented".

  it('★★★ declares `appliedType` and `operation` as the DOMAIN unions', async () => {
    const appliedTypeIsTheDomainUnion: IsExactly<
      PromotionAppliedIntentDocument['appliedType'],
      PromotionAppliedType
    > = true;
    const operationIsTheDomainUnion: IsExactly<
      PromotionAppliedIntentDocument['operation'],
      PromotionAppliedIntent['operation']
    > = true;

    // Read so the two are not merely declared: a `noUnusedLocals` build would otherwise reject
    // them, and a reader deserves to see the proposition asserted rather than left as a bare
    // annotation.
    expect(appliedTypeIsTheDomainUnion).toBe(true);
    expect(operationIsTheDomainUnion).toBe(true);

    // And the vocabulary is exhaustive in both directions.
    const everyAppliedType: Record<PromotionAppliedType, true> = {
      order: true,
      orderItem: true,
      orderFulfillment: true,
    };
    const everyIntentOperation: Record<PromotionAppliedIntent['operation'], true> = {
      add: true,
      update: true,
      remove: true,
    };

    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(itemAt(order, 0).orderItemID, '3.01')],
    });
    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);

    const intents = promotionIntentsOf(successBodyOf(result));
    // NON-VACUITY: an empty collection would satisfy every membership test below.
    expect(intents.length).toBeGreaterThan(0);

    for (const intent of intents) {
      expect(Object.keys(everyAppliedType)).toContain(intent.appliedType);
      expect(Object.keys(everyIntentOperation)).toContain(intent.operation);
    }
  });

  // Every diagnostic key this handler emits is legible through the real logger.

  it('★★★ renders every diagnostic key it emits, not `[REDACTED]`', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(itemAt(order, 0).orderItemID, '3.01')],
    });

    expect((await harness.invoke(postApplyPromotions(order))).statusCode).toBe(200);

    const successLine = requirePresent(
      harness.emitted.lines.find((line): boolean => line.includes('priced an order')),
      'the success log line',
    );

    // The VALUES, rendered. Asserted as serialised JSON fragments so a key present with a redacted
    // value fails: `"capability":"[REDACTED]"` does not contain
    // `"capability":"promotionApplication"`.
    expect(successLine).toContain('"capability":"promotionApplication"');
    expect(successLine).toContain('"action":"applyPromotions"');
    expect(successLine).toContain('"operation":"applyPromotions"');
    expect(successLine).toContain('"route":"POST /promotions/application"');
    expect(successLine).toContain(`"requestId":"${PLATFORM_REQUEST_ID}"`);
    expect(successLine).toContain('"accountEstablished":true');
    // The four COUNTS, which are what makes a line diagnostically useful without reproducing an
    // order.
    expect(successLine).toContain('"orderItemCount":3');
    expect(successLine).toContain('"orderFulfillmentCount":2');
    expect(successLine).toContain('"promotionIntentCount":');
    expect(successLine).toContain('"priceGroupIntentCount":');
    // The WHOLE LINE, free of the marker. The assertion is on the UPPERCASE marker the logger
    // actually writes - a lowercase `[redacted]` could never match and would make this vacuous.
    expect(successLine).not.toContain('[REDACTED]');

    // And nothing from the order itself. Counts only: no order identifier, no item identifier, no
    // monetary amount.
    expect(successLine).not.toContain(order.orderID);
    expect(successLine).not.toContain(itemAt(order, 0).orderItemID);
    expect(successLine).not.toContain(order.subtotal.toDecimalString());
  });

  it('★★★ renders the OTHER log line too - the sale-price one', async () => {
    const harness = makeHarness({
      salePriceDetails: {
        [SALE_PRICE_SKU_ID]: {
          skuID: SALE_PRICE_SKU_ID,
          discountLevel: 'sku',
          salePriceDiscountType: 'percentageOff',
          salePrice: Money.fromDecimalString('17.49375'),
          promotionID: SALE_PRICE_PROMOTION_ID,
        },
      },
    });

    const result = await harness.invoke(
      postDocument({ operation: 'getSalePriceDetailsForProductSkus', productID: PRODUCT_ID }),
    );
    expect(result.statusCode).toBe(200);

    const line = requirePresent(
      harness.emitted.lines.find((candidate): boolean =>
        candidate.includes('resolved sale-price details'),
      ),
      'the sale-price log line',
    );

    expect(line).toContain('"capability":"promotionApplication"');
    expect(line).toContain('"action":"applyPromotions"');
    expect(line).toContain('"operation":"getSalePriceDetailsForProductSkus"');
    expect(line).toContain('"route":"POST /promotions/application"');
    expect(line).toContain('"resolvedSkuCount":1');
    expect(line).not.toContain('[REDACTED]');
    // A COUNT, never the identifiers or the amounts behind it.
    expect(line).not.toContain(SALE_PRICE_SKU_ID);
    expect(line).not.toContain('17.49375');
  });

  it('★★★ still REDACTS a key the allow-list does not admit, so the proof above is live', () => {
    // Without this the case above could pass because the logger admits everything.
    const probe = makeRecordingLogger();

    probe.logger.info('a probe line', {
      capability: 'promotionApplication',
      password: 'not-a-real-secret',
    });

    const line = requirePresent(probe.lines[0], 'the probe log line');

    expect(line).toContain('"capability":"promotionApplication"');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('not-a-real-secret');
  });

  // F9's consumer half: this handler does not prepare zones itself.
  //
  // The root now defers the unbounded zone read and the composed pricing operation prepares it
  // before either pass.

  it('★★★ leaves address-zone preparation to the composed pricing operation', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    expect((await harness.invoke(postApplyPromotions(order))).statusCode).toBe(200);

    const scopeInput = requirePresent(harness.recorder.scopeInputs[0], 'a request-scope input');
    expect(Object.keys(scopeInput).sort()).toStrictEqual(['accountID', 'now']);
    expect(harness.recorder.log).toContain(COMPOSED_PRICING);
  });

  it('★★★ publishes exactly ONE route for this capability, whose action the module implements', () => {
    const route = ROUTE_TABLE.promotionApplication;

    expect(route.capability).toBe('promotionApplication');
    expect(route.action).toBe('applyPromotions');
    expect(route.methods).toBe('POST');
    expect(route.path).toBe('/promotions/application');
    const rowsForThisCapability = Object.values(ROUTE_TABLE).filter(
      (candidate): boolean => candidate.capability === 'promotionApplication',
    );
    expect(rowsForThisCapability).toHaveLength(1);
  });

  it('★★★ does ROUTE work before BODY work, so an unusable request costs no parse', async () => {
    // The ordering is observable without a second action: send a syntactically broken body to a
    // route that does not match.
    const harness = makeHarness();
    const result = await harness.invoke(
      makeProxyEvent({ httpMethod: 'GET', path: '/promotions/application', body: '{' }),
    );

    expect(result.statusCode).toBe(404);
    expect(errorBodyOf(result).category).toBe('routeNotFound');
    // No composition root, no scope, no pass - and no parse.
    expect(harness.recorder.log).toEqual([]);
    expect(harness.recorder.scopeInputs).toHaveLength(0);

    // And the same broken body on the MATCHED route is answered as a body failure, which is what
    // makes the 404 above attributable to ordering rather than to the body being ignored
    // everywhere.
    const matched = makeHarness();
    const matchedResult = await matched.invoke(makeProxyEvent({ body: '{' }));

    expect(matchedResult.statusCode).toBe(400);
    expect(matched.recorder.scopeInputs).toHaveLength(0);
  });

  it('★★★ falls back to the SHARED unattributed identifier when the platform supplies none', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order, {}));
    expect(result.statusCode).toBe(200);
    expect(servedEnvelopeOf(result).requestId).toBe(PLATFORM_REQUEST_ID);

    // With the platform identifier withheld, the SHARED fallback is used rather than an empty
    // string, a generated value or a caller-supplied header.
    const anonymous = makeHarness({ materialize: order });
    const anonymousResult = await anonymous.invoke(
      makeProxyEvent({
        body: JSON.stringify(applyPromotionsDocument(wireOrderDocument(order))),
        requestId: '',
        ...(order.accountID === undefined ? {} : { authorizer: authorizerFor(order.accountID) }),
      }),
    );

    expect(anonymousResult.statusCode).toBe(200);
    expect(servedEnvelopeOf(anonymousResult).requestId).toBe('unattributed');
  });
});
