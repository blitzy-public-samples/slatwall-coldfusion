/**
 * Bundle entry point: the promotion-application capability.
 *
 * A NULL applied price group, or a reward that does list the applied group as eligible, discounts
 * from `getPrice()` with no correction term (L241 -> L244).
 *
 * `getAppliedPriceGroup()` is read in the branch condition itself at L241, so the ordering
 * obligation holds whichever arm runs.
 *
 * The PRESERVED NO-OP. The return/exchange branch [model/service/PromotionService.cfc:L542-L544]
 * carries a legacy `//
 * TODO [issue #1766]` and does nothing at all.
 */

import { z } from 'zod';

import { bootstrapCompositionRoot, OrderViewDocumentDataError } from './bootstrap.js';
import {
  containsPrototypeMemberKey,
  forbiddenResponse,
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  mapZodErrorFields,
  principalHasServiceScope,
  PROTOTYPE_MEMBER_FIELD_ISSUE,
  resolveRequestPrincipal,
  resolveServerRequestId,
  routeDiagnosticLabel,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';
import { logger as defaultLogger } from '../lib/logger.js';
// `cfEquals` keeps the compatibility-account comparisons aligned with CFML's case-insensitive
// string equality.
import { cfEquals } from '../lib/cfml/struct.js';
import { toDecimalString } from '../lib/cfml/numberFormat.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type {
  CompositionRoot,
  OrderPricingResult,
  OrderViewDocument,
  RequestScope,
  RequestScopeInput,
} from './bootstrap.js';
import type { RouteAction } from './router.js';
import type { ErrorMappingContext, InvalidRequestReason, MappedFieldIssue } from './errorMapper.js';
import type { PromotionAppliedType } from '../domain/entities/promotionApplied.js';
import type { PromotionAppliedIntent } from '../domain/promotionEngine/qualifiedDiscountTypes.js';
import type { SalePriceDetail } from '../domain/ports/promotionRepository.js';
import type { PriceGroupAppliedIntent } from '../services/priceGroupService.js';
import type { PromotionService } from '../services/promotionService.js';
import type {
  OrderFulfillmentView,
  ShippingAddressView,
} from '../domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../domain/views/orderItemView.js';
import type { OrderView } from '../domain/views/orderView.js';
import { Money } from '../domain/valueObjects/money.js';
import type { Logger } from '../lib/logger.js';

// `../domain/ports/addressZoneEvaluator.js` is deliberately not imported, and saying so is worth
// more than the silence.

// Section 1 - the published surface.

/**
 * The capability this handler answers for.
 *
 * Declared as a local constant rather than being re-derived, so the value handed to
 * `resolveRouteForCapability` and the value written to every log line are provably the same
 * string.
 */
const CAPABILITY = 'promotionApplication';

/**
 * The two operations this capability serves, selected by the request payload.
 *
 * A string-literal union rather than the TypeScript enumeration construct: a union is erased on
 * emit, so nothing survives into the bundle as a runtime object.
 *
 * JUDGMENT CALL: the operation is chosen by the payload rather than by a second route.
 */
export type PromotionApplicationOperation = 'applyPromotions' | 'getSalePriceDetailsForProductSkus';

/**
 * The one capability an admission may reach for on the request scope: wire-document hydration.
 *
 * A `Pick<>` rather than the whole scope, so an admission cannot open a pass, reach a service or
 * read a setting on its way to a view.
 */
export type OrderViewMaterializer = Pick<RequestScope, 'materializeOrderView'>;

/**
 * How this adapter obtains the read-only order view it hands to the composed operation.
 *
 * @param request the decoded, schema-validated request envelope for the pricing operation.
 * @param materializer the hydration capability of THIS request's scope.
 * @returns the order view to price.
 * @throws {@link OrderViewAdmissionError} when the document cannot be admitted.
 */
export type OrderViewAdmission = (
  request: ApplyPromotionsRequest,
  materializer: OrderViewMaterializer,
) => Promise<OrderView>;

/**
 * Everything this handler is parameterised over, so that the clock, the order view and the
 * composed operation are all injectable and observable without patching module state.
 *
 * Every member is optional and every one may be passed as an explicit `undefined`.
 */
export interface PromotionApplicationDependencies {
  /**
   * The composition root accessor. Defaults to `bootstrapCompositionRoot` from `./bootstrap.js` -
   * the idempotent, memoized async initializer, awaited INSIDE the handler and never at module top
   * level.
   *
   * A suite substitutes a function returning a root built over a fake executor, which is how the
   * COMPOSED OPERATION becomes observable: the ordering assertion drives
   * `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions` through this member.
   */
  readonly compositionRoot?: (() => Promise<CompositionRoot>) | undefined;

  /**
   * How the order view is obtained. Defaults to {@link admitOrderDocument}, the WIRE arm.
   *
   * The default is the one a deployed route can actually use, and that is a correction rather than
   * a preference.
   *
   * Both other arms remain available and neither is diminished: a suite supplies a golden fixture
   * through this member.
   */
  readonly admitOrderView?: OrderViewAdmission | undefined;

  /**
   * Where structured diagnostics are written. Defaults to the module-level logger, which emits
   * JSON to stdout and is captured natively by the platform.
   */
  readonly logger?: Logger | undefined;

  /**
   * The injected clock, under an explicit UTC policy.
   *
   * Clock is supplied this handler passes no `now` to `CompositionRoot.createRequestScope`, and
   * the scope then reads the wall clock once at scope creation and publishes it as
   * `RequestScope.now`.
   *
   * A `Date` is an absolute instant, so UTC is a property of the value and the policy is
   * discharged by threading one rather than by formatting anything.
   */
  readonly clock?: (() => Date) | undefined;
}

/**
 * The handler signature this module exports.
 *
 * `context` is optional so the function is directly callable without fabricating a platform
 * context object; the platform always supplies one and passes a third callback argument that this
 * handler.
 */
export type PromotionApplicationHandler = (
  event: APIGatewayProxyEvent,
  context?: Context,
) => Promise<APIGatewayProxyResult>;

/**
 * The members every decoded request carries, whichever operation it selected.
 *
 * Not exported: consumers work with {@link PromotionApplicationRequest} and the two arms below.
 */
interface PromotionApplicationRequestEnvelope {
  /**
   * Correlation identifier for this invocation, established by the server.
   */
  readonly requestId: string;
}

/**
 * A request for the composed price-group-then-promotion operation.
 */
export interface ApplyPromotionsRequest extends PromotionApplicationRequestEnvelope {
  readonly operation: 'applyPromotions';

  /**
   * The order document to price. Its absence and shape are decided by the admission port.
   */
  readonly order?: unknown;
}

/**
 * A request for `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022].
 *
 * `productID` is REQUIRED on this arm rather than optional across both.
 */
export interface SalePriceDetailsRequest extends PromotionApplicationRequestEnvelope {
  readonly operation: 'getSalePriceDetailsForProductSkus';

  /**
   * The product whose SKUs' sale-price details are wanted. An opaque identifier.
   */
  readonly productID: string;
}

/**
 * The decoded request, discriminated on the operation the payload selected.
 */
export type PromotionApplicationRequest = ApplyPromotionsRequest | SalePriceDetailsRequest;

/**
 * Raised when an order view cannot be vouched for.
 *
 * A named class so the handler can recognise a refusal by `instanceof` and report it as a
 * client-shaped rejection.
 */
export class OrderViewAdmissionError extends Error {
  /**
   * The closed reason `./errorMapper.js` owns the wording for.
   */
  public readonly reason: 'unsupportedBodyShape' | 'unusableRequestInput';

  /**
   * Dotted paths within the submitted document, and the constraint each failed.
   */
  public readonly fields: readonly MappedFieldIssue[];

  public constructor(
    reason: 'unsupportedBodyShape' | 'unusableRequestInput',
    fields: readonly MappedFieldIssue[],
  ) {
    super('The order view could not be admitted.');
    this.name = 'OrderViewAdmissionError';
    this.reason = reason;
    this.fields = fields;
  }
}

/**
 * One applied-promotion intent, rendered for the wire.
 *
 * A FLAT projection of the engine's intent union, and flat on purpose: every member of that union
 * is declared on every variant - the inapplicable ones as `?: never`.
 *
 * `discountAmount` is a decimal string and never a JSON number.
 */
export interface PromotionAppliedIntentDocument {
  /**
   * `add` | `update` | `remove`, exactly as the engine decided it.
   */
  readonly operation: PromotionAppliedIntent['operation'];

  /**
   * `order` | `orderItem` | `orderFulfillment` - the three values the engine actually writes
   * [model/service/PromotionService.cfc:L402, L448, L531].
   */
  readonly appliedType: PromotionAppliedType;

  /**
   * The promotion, as an opaque identifier. Absent only on a removal that names no promotion.
   */
  readonly promotionID?: string;

  /**
   * Opaque target identifier at order level [model/entity/PromotionApplied.cfc:L61].
   */
  readonly orderID?: string;

  /**
   * Opaque target identifier at item level [model/entity/PromotionApplied.cfc:L58].
   */
  readonly orderItemID?: string;

  /**
   * Opaque target identifier at fulfillment level [model/entity/PromotionApplied.cfc:L59].
   */
  readonly orderFulfillmentID?: string;

  /**
   * The persisted row a removal detaches. Opaque; carried, never parsed.
   */
  readonly promotionAppliedID?: string;

  /**
   * The discount, as a decimal string. Forbidden on a removal, so absent there.
   */
  readonly discountAmount?: string;
}

/**
 * One price-group intent, rendered for the wire.
 *
 * `updateOrderAmountsWithPriceGroups` is not re-exposed anywhere in this module and cannot be
 * reached through it; the only route to either pass is the one composed operation.
 */
export interface PriceGroupAppliedIntentDocument {
  /**
   * The order item, as an opaque identifier.
   */
  readonly orderItemID: string;

  /**
   * The price pass one chose, as a decimal string.
   */
  readonly price: string;

  /**
   * The winning price group, as an opaque identifier.
   */
  readonly priceGroupID: string;
}

/**
 * One SKU's sale-price detail, rendered for the wire.
 *
 * Mirrors `SalePriceDetail` from `../domain/ports/promotionRepository.js` member for member, with
 * money as decimal strings and the expiration instant as an ISO-8601 string in UTC.
 */
export interface SalePriceDetailDocument {
  /**
   * Opaque SKU identifier.
   */
  readonly skuID: string;

  /**
   * Which level of the cascade won.
   */
  readonly discountLevel: string;

  /**
   * How the sale price was derived.
   */
  readonly salePriceDiscountType: string;

  /**
   * The sale price, as a decimal string.
   */
  readonly salePrice: string;

  /**
   * The promotion, as an opaque identifier.
   */
  readonly promotionID: string;

  /**
   * The undiscounted price, when the port carried one.
   */
  readonly originalPrice?: string;

  /**
   * The rounding rule applied, as an opaque identifier, when one was applied.
   */
  readonly roundingRuleID?: string;

  /**
   * When the sale price stops applying, ISO-8601 in UTC. Omitted when it does not expire.
   */
  readonly salePriceExpirationDateTime?: string;
}

/**
 * What this handler produced, carried as the `result` member of the shared success envelope.
 *
 * `evaluatedAt` stays, and stays here rather than on the envelope: it is the instant the request
 * scope bound - `RequestScope.now` - rendered ISO-8601 in UTC.
 */
export interface PromotionApplicationResultDocument {
  /**
   * Which operation ran.
   */
  readonly operation: PromotionApplicationOperation;

  /**
   * The single instant every date comparison in this invocation resolved against, UTC.
   */
  readonly evaluatedAt: string;

  /**
   * What the promotion pass decided. Empty is a valid - and for a return order, correct - result.
   */
  readonly promotionIntents?: readonly PromotionAppliedIntentDocument[];
  readonly priceGroupIntents?: readonly PriceGroupAppliedIntentDocument[];

  /**
   * Sale-price details keyed by opaque SKU identifier. Present only for
   * `getSalePriceDetailsForProductSkus`.
   */
  readonly salePriceDetails?: Readonly<Record<string, SalePriceDetailDocument>>;
}

// Section 2 - the execution-model obligations.
//
// Explicit bounds. {@link ORDER_DOCUMENT_LIMITS} caps how much work one invocation will accept.

/**
 * How much work one invocation will accept.
 *
 * Safety bounds, not performance targets, and every one of them is a bound on a caller-supplied
 * quantity.
 *
 * The two identifier lengths are SCHEMA-DERIVED rather than chosen: `productID`
 * `model/entity/Product.cfc` and every other `fieldtype="id"` column in the `Sw*` schema is
 * declared `ormtype="string" length="32"`.
 */
export const ORDER_DOCUMENT_LIMITS: Readonly<{
  readonly maximumOrderItems: number;
  readonly maximumOrderFulfillments: number;
  readonly maximumIdentifierLength: number;
  readonly maximumCountMagnitude: number;
  readonly maximumPromotionCodes: number;
}> = Object.freeze({
  maximumOrderItems: 500,
  maximumOrderFulfillments: 100,
  maximumIdentifierLength: 32,

  // schema-derived rather than chosen.
  //
  // Why a bound was needed at all, given the schema was already the real limit.
  maximumCountMagnitude: 2_147_483_647,
  maximumPromotionCodes: 100,
});

/**
 * The four address members the legacy zone matcher compares.
 *
 * Kept as a typed closed set so the structural admission cannot silently omit a member that the
 * promotion engine may read.
 */
const ADDRESS_COMPARISON_MEMBERS: readonly (keyof ShippingAddressView)[] = [
  'postalCode',
  'city',
  'stateCode',
  'countryCode',
];

/**
 * How many field-level complaints one refusal publishes.
 *
 * A bound rather than the whole set, matching the bound `./errorMapper.js` already applies to a
 * thrown validation failure: an unbounded complaint list is work a caller can ask for.
 */
const MAX_PUBLISHED_ADMISSION_ISSUES = 10;

// Section 3 - the JSON wire contract.

/**
 * An opaque identifier, bounded by the persisted identifier width.
 */
const OPAQUE_IDENTIFIER = z
  .string()
  .min(1, { message: 'must not be empty' })
  .max(ORDER_DOCUMENT_LIMITS.maximumIdentifierLength, {
    message: 'must not be longer than the identifier column it names',
  });

/**
 * The apply-promotions envelope. `accountID` is checked and then discarded as an authority.
 */
const APPLY_PROMOTIONS_ENVELOPE = z.strictObject({
  operation: z.literal('applyPromotions'),
  accountID: OPAQUE_IDENTIFIER.optional(),
  order: z.unknown().optional(),
});

/**
 * The mapped sale-price operation, selected by payload rather than by a second route.
 */
const SALE_PRICE_DETAILS_ENVELOPE = z.strictObject({
  operation: z.literal('getSalePriceDetailsForProductSkus'),
  accountID: OPAQUE_IDENTIFIER.optional(),
  productID: OPAQUE_IDENTIFIER,
});

const REQUEST_ENVELOPE_SCHEMA = z.discriminatedUnion('operation', [
  APPLY_PROMOTIONS_ENVELOPE,
  SALE_PRICE_DETAILS_ENVELOPE,
]);

// Section 3b - the wire order document.
//
// Why every absence is spelled `.nullable()` and nothing is `.optional()`.

/**
 * A monetary member as it travels: a plain decimal numeral, in a string.
 */
const WIRE_DECIMAL_NUMERAL = z.string().refine(
  (value: string): boolean => {
    try {
      toDecimalString(value);

      return true;
    } catch {
      // The caught value is deliberately not inspected: this is a PREDICATE, and the reported
      // message is the schema's own so that no library's wording reaches a response body.
      return false;
    }
  },
  { message: 'must be a plain decimal numeral, as a string' },
);

/**
 * A signed whole count. Negative quantities remain valid for return items.
 *
 * Both 2 `AND` 3 are kept even though 3 is strictly narrower, deliberately.
 *
 * Nothing here is SYMMETRIC-ONLY: the bound is applied to the ABSOLUTE value, so a negative return
 * quantity is held to the same magnitude as a positive sale quantity.
 */
const WIRE_COUNT = z
  .number()
  .int({ message: 'must be a whole number' })
  .refine((value: number): boolean => Number.isSafeInteger(value), {
    message: 'must be a whole number small enough to be represented exactly',
  })
  .refine(
    (value: number): boolean => Math.abs(value) <= ORDER_DOCUMENT_LIMITS.maximumCountMagnitude,
    {
      message: `must be a whole number whose magnitude is at most ${String(
        ORDER_DOCUMENT_LIMITS.maximumCountMagnitude,
      )}`,
    },
  );

/**
 * A finite measurement, used for shipping weight rather than an item count.
 */
const WIRE_WEIGHT = z.number().finite({ message: 'must be a finite number' });

/**
 * The three-character currency code [model/entity/Order.cfc:L54 `length="3"`].
 */
const WIRE_CURRENCY_CODE = z
  .string()
  .length(3, { message: 'must be a three-character currency code' });

/**
 * One already-applied promotion, as it travels.
 */
const APPLIED_PROMOTION_DOCUMENT_SCHEMA = z.strictObject({
  promotionAppliedID: OPAQUE_IDENTIFIER,
  // Nullable because `SwPromotionApplied.discountAmount` is
  // [model/entity/PromotionApplied.cfc:L51], and never defaulted to zero: a zero discount is a
  // different fact from no discount.
  discountAmount: WIRE_DECIMAL_NUMERAL.nullable(),
  promotion: z.strictObject({ promotionID: OPAQUE_IDENTIFIER }).nullable(),
});

/**
 * One order item, as it travels.
 */
const ORDER_ITEM_DOCUMENT_SCHEMA = z.strictObject({
  orderItemID: OPAQUE_IDENTIFIER,
  // Both handles, because the ported fetch shape reaches a product-wired SKU only through its
  // product - the reason is recorded on `OrderItemDocument.productID` in `./bootstrap.js`.
  productID: OPAQUE_IDENTIFIER,
  skuID: OPAQUE_IDENTIFIER,
  quantity: WIRE_COUNT,
  // All four, because the [model/service/PromotionService.cfc:L241] discriminator needs all four:
  // `getPrice()` on the first arm [model/service/PromotionService.cfc:L244].
  price: WIRE_DECIMAL_NUMERAL,
  skuPrice: WIRE_DECIMAL_NUMERAL,
  extendedPrice: WIRE_DECIMAL_NUMERAL,
  extendedSkuPrice: WIRE_DECIMAL_NUMERAL,
  // The discriminator itself, as an IDENTIFIER: the entity is loaded so that
  // `reward.hasEligiblePriceGroup(...)` compares a real row's identity rather than a caller's
  // claim.
  appliedPriceGroupID: OPAQUE_IDENTIFIER.nullable(),
  orderItemType: z.strictObject({ systemCode: OPAQUE_IDENTIFIER }),
  orderFulfillmentID: OPAQUE_IDENTIFIER,
  appliedPromotions: z
    .array(APPLIED_PROMOTION_DOCUMENT_SCHEMA)
    .max(ORDER_DOCUMENT_LIMITS.maximumOrderItems, {
      message: 'must not carry more than the published bound',
    }),
});

/**
 * One shipping address, as it travels.
 *
 * All four comparison members are nullable and all four must be STATED, because the zone evaluator
 * SKIPS a null one [model/service/AddressService.cfc:L63, L66, L69, L72] rather than failing on
 * it.
 */
const SHIPPING_ADDRESS_DOCUMENT_SCHEMA = z.strictObject({
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  stateCode: z.string().nullable(),
  countryCode: z.string().nullable(),
  isNew: z.boolean(),
});

/**
 * One order fulfillment, as it travels.
 */
const ORDER_FULFILLMENT_DOCUMENT_SCHEMA = z.strictObject({
  orderFulfillmentID: OPAQUE_IDENTIFIER,
  fulfillmentCharge: WIRE_DECIMAL_NUMERAL,
  fulfillmentMethod: z.strictObject({
    fulfillmentMethodID: OPAQUE_IDENTIFIER,
    fulfillmentMethodType: OPAQUE_IDENTIFIER,
  }),
  // `null` is a real state: the gate at [model/service/PromotionService.cfc:L701] tests
  // `isNull(orderFulfillment.getShippingMethod())` explicitly, so a pickup fulfillment states
  // null.
  shippingMethod: z.strictObject({ shippingMethodID: OPAQUE_IDENTIFIER }).nullable(),
  appliedPromotions: z
    .array(APPLIED_PROMOTION_DOCUMENT_SCHEMA)
    .max(ORDER_DOCUMENT_LIMITS.maximumOrderItems, {
      message: 'must not carry more than the published bound',
    }),
  totalShippingWeight: WIRE_WEIGHT,
  address: SHIPPING_ADDRESS_DOCUMENT_SCHEMA.nullable(),
});

/**
 * The order document a caller PUTs on the wire, validated member for member.
 *
 * What it deliberately does not accept is as important as what it does: no price for a SKU, no
 * product type, no brand, no option list, no promotion-period window, no rate, no rounding rule.
 */
const ORDER_VIEW_DOCUMENT_SCHEMA = z.strictObject({
  orderID: OPAQUE_IDENTIFIER,
  orderType: z.strictObject({ systemCode: OPAQUE_IDENTIFIER }),
  // Stated, nullable, and not an authority - the account is the authorizer's answer and this
  // member is refused when it disagrees. See {@link assertDocumentNamesAuthenticatedAccount}.
  accountID: OPAQUE_IDENTIFIER.nullable(),
  // A string, because the legacy passes the comma-delimited list through `listToArray`
  // [model/dao/PromotionDAO.cfc:L126] into an `IN (:promotionCodeList)` binding
  // [model/dao/PromotionDAO.cfc:L90], so the list form is load-bearing.
  promotionCodeList: z
    .string()
    .max(
      ORDER_DOCUMENT_LIMITS.maximumPromotionCodes *
        (ORDER_DOCUMENT_LIMITS.maximumIdentifierLength + 1),
      { message: 'must not be longer than the published bound' },
    )
    .refine(
      (value: string): boolean =>
        // An empty list carries no codes at all, which is the common case and must not be counted
        // as one member. `split` on an empty string yields `['']`, so the empty case is answered
        // first.
        value.length === 0 ||
        value.split(',').length <= ORDER_DOCUMENT_LIMITS.maximumPromotionCodes,
      { message: 'must not name more promotion codes than the published bound' },
    ),
  totalSaleQuantity: WIRE_COUNT,
  subtotal: WIRE_DECIMAL_NUMERAL,
  subtotalAfterItemDiscounts: WIRE_DECIMAL_NUMERAL,
  fulfillmentChargeAfterDiscountTotal: WIRE_DECIMAL_NUMERAL,
  currencyCode: WIRE_CURRENCY_CODE,
  appliedPromotions: z
    .array(APPLIED_PROMOTION_DOCUMENT_SCHEMA)
    .max(ORDER_DOCUMENT_LIMITS.maximumOrderItems, {
      message: 'must not carry more than the published bound',
    }),
  orderItems: z.array(ORDER_ITEM_DOCUMENT_SCHEMA).max(ORDER_DOCUMENT_LIMITS.maximumOrderItems, {
    message: 'must not carry more than the published bound',
  }),
  orderFulfillments: z
    .array(ORDER_FULFILLMENT_DOCUMENT_SCHEMA)
    .max(ORDER_DOCUMENT_LIMITS.maximumOrderFulfillments, {
      message: 'must not carry more than the published bound',
    }),
});

// Section 4 - order-view admission.
//
// The single place that decides whether a value may be handed to the composed operation as an
// `OrderView`.
//
// Document carries `sku` as an object with no methods and `price` as a number or a string, so it
// fails these probes and is rejected with the member paths that failed.

/**
 * A non-null, non-array object. The only shape any probe below descends into.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Which of `methodNames` the value does not expose as a callable.
 *
 * Returning the MISSING names rather than a boolean is what lets a refusal name the accessor that
 * was absent, which is the difference between a diagnosable rejection and an opaque one.
 */
function missingMethods(
  value: Readonly<Record<string, unknown>>,
  methodNames: readonly string[],
): readonly string[] {
  return methodNames.filter((name) => typeof value[name] !== 'function');
}

/**
 * The accessors `Money` publishes that this port depends on.
 *
 * `toDecimalString` is how a monetary value reaches persistence at full precision and how it
 * reaches the wire here; `toFixed2` is the two-decimal presentation form.
 */
const MONEY_ACCESSORS: readonly string[] = ['toDecimalString', 'toFixed2', 'compare'];

/**
 * The `Sku` accessors the two passes reach through `OrderItemView.sku`.
 *
 * Every one is a call site, not a guess: sale-price seeding reads `getSalePriceDetails()` and
 * `getPrice()` [model/service/PromotionService.cfc:L146, L148, L150]; reward matching reads
 * `getSkuID()` and walks `getProduct()` [model/service/PromotionService.cfc:L808-L818].
 */
const SKU_ACCESSORS: readonly string[] = [
  'getSkuID',
  'getProduct',
  'getOptions',
  'getPrice',
  'getSalePriceDetails',
];

/**
 * The `PriceGroup` accessor reached through `OrderItemView.appliedPriceGroup`.
 *
 * The member is offered to `reward.hasEligiblePriceGroup(...)` at
 * [model/service/PromotionService.cfc:L241], which compares ENTITIES.
 */
const PRICE_GROUP_ACCESSORS: readonly string[] = ['getPriceGroupID'];

/**
 * One complaint, recorded against the member path that produced it.
 */
function recordIssue(issues: MappedFieldIssue[], path: string, message: string): void {
  if (issues.length < MAX_PUBLISHED_ADMISSION_ISSUES) {
    issues.push({ path, message });
  }
}

/**
 * A required non-empty string member.
 */
function probeIdentifier(
  container: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: MappedFieldIssue[],
): void {
  const value = container[key];
  if (typeof value !== 'string' || value.length === 0) {
    recordIssue(issues, path, 'must be a non-empty opaque identifier');
  }
}

/**
 * A required finite numeric COUNT. Never money - counts are the only plain numbers on these views.
 */
function probeCount(
  container: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: MappedFieldIssue[],
): void {
  const value = container[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    recordIssue(issues, path, 'must be a finite number');
  }
}

/**
 * A required monetary member, probed against {@link MONEY_ACCESSORS}.
 */
function probeMoney(
  container: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: MappedFieldIssue[],
): void {
  const value = container[key];
  if (!isRecord(value)) {
    recordIssue(issues, path, 'must be a materialised monetary value');
    return;
  }
  const absent = missingMethods(value, MONEY_ACCESSORS);
  if (absent.length > 0) {
    recordIssue(issues, path, `must expose the monetary accessors: ${absent.join(', ')}`);
  }
}

/**
 * A required nested object carrying exactly the identifier members named.
 */
function probeNestedIdentifiers(
  container: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  memberKeys: readonly string[],
  issues: MappedFieldIssue[],
): void {
  const value = container[key];
  if (!isRecord(value)) {
    recordIssue(issues, path, 'must be an object');
    return;
  }
  for (const memberKey of memberKeys) {
    probeIdentifier(value, memberKey, `${path}.${memberKey}`, issues);
  }
}

/**
 * A required array member, bounded. Returns the entries so a caller can descend into them.
 */
function probeBoundedArray(
  container: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  maximumLength: number,
  issues: MappedFieldIssue[],
): readonly unknown[] {
  const value = container[key];
  if (!Array.isArray(value)) {
    recordIssue(issues, path, 'must be an array');
    return [];
  }
  if (value.length > maximumLength) {
    // Obligation (1) from section 2: the document is refused, never truncated.
    recordIssue(issues, path, `must not carry more than ${String(maximumLength)} entries`);
  }
  return value;
}

/**
 * A member that must be PRESENT and is either a materialised entity or an explicit `undefined`.
 *
 * Presence and absence are different requests, and both views say so.
 */
function probeNullableEntity(
  container: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  accessors: readonly string[],
  issues: MappedFieldIssue[],
): void {
  if (!Object.hasOwn(container, key)) {
    recordIssue(issues, path, 'must be stated, as the value or as an explicit undefined');
    return;
  }
  const value = container[key];
  if (value === undefined) {
    // The stated-absence arm.
    return;
  }
  if (!isRecord(value)) {
    recordIssue(issues, path, 'must be a materialised entity when present');
    return;
  }
  const absent = missingMethods(value, accessors);
  if (absent.length > 0) {
    recordIssue(issues, path, `must expose the entity accessors: ${absent.join(', ')}`);
  }
}

/**
 * A member that must be present and is either a string or an explicit `undefined`.
 */
function probeNullableString(
  container: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: MappedFieldIssue[],
): void {
  if (!Object.hasOwn(container, key)) {
    recordIssue(issues, path, 'must be stated, as the value or as an explicit undefined');
    return;
  }
  const value = container[key];
  if (value !== undefined && typeof value !== 'string') {
    recordIssue(issues, path, 'must be a string when present');
  }
}

/**
 * Probe one order item, mirroring `OrderItemView` member for member.
 *
 * @returns whether this entry may be vouched for; complaints are appended to `issues` either way.
 */
function probeOrderItem(
  entry: unknown,
  path: string,
  issues: MappedFieldIssue[],
): entry is OrderItemView {
  const before = issues.length;

  if (!isRecord(entry)) {
    recordIssue(issues, path, 'must be an object');
    return false;
  }

  // The opaque handle every emitted intent is keyed by [model/entity/PromotionApplied.cfc:L58].
  probeIdentifier(entry, 'orderItemID', `${path}.orderItemID`, issues);

  // The deep graph the engine walks. See SKU_ACCESSORS for the call sites.
  probeNullableEntity(entry, 'sku', `${path}.sku`, SKU_ACCESSORS, issues);

  // A COUNT, and the one numeric member here that is not money
  // [model/entity/OrderItem.cfc:L56 `ormtype="integer"`]. Read at
  // [model/service/PromotionService.cfc:L231-L232] where it clamps the discount quantity.
  probeCount(entry, 'quantity', `${path}.quantity`, issues);

  // Both price bases and both extended prices, because the L241 discriminator needs all four:
  // `getPrice()` on the first arm [model/service/PromotionService.cfc:L244].
  probeMoney(entry, 'price', `${path}.price`, issues);
  probeMoney(entry, 'skuPrice', `${path}.skuPrice`, issues);
  probeMoney(entry, 'extendedPrice', `${path}.extendedPrice`, issues);
  probeMoney(entry, 'extendedSkuPrice', `${path}.extendedSkuPrice`, issues);

  // The L241 discriminator itself, written by [model/service/PriceGroupService.cfc:L371].
  probeNullableEntity(
    entry,
    'appliedPriceGroup',
    `${path}.appliedPriceGroup`,
    PRICE_GROUP_ACCESSORS,
    issues,
  );

  // Dereferenced with no absence test at [model/service/PromotionService.cfc:L206].
  probeNestedIdentifiers(entry, 'orderItemType', `${path}.orderItemType`, ['systemCode'], issues);

  // The owning fulfillment, as an opaque identifier only [model/entity/PromotionApplied.cfc:L59].
  probeIdentifier(entry, 'orderFulfillmentID', `${path}.orderFulfillmentID`, issues);

  probeBoundedArray(
    entry,
    'appliedPromotions',
    `${path}.appliedPromotions`,
    ORDER_DOCUMENT_LIMITS.maximumOrderItems,
    issues,
  );

  return issues.length === before;
}

/**
 * Probe one order fulfillment, mirroring `OrderFulfillmentView` member for member.
 *
 * The reward and qualifier include/exclude collections take the OPPOSITE default: an empty
 * collection means no RESTRICTION, which is why every one of those gates is written
 * `arrayLen(collection) && !collection.hasX(...)`.
 *
 * @returns whether this entry may be vouched for; complaints are appended to `issues` either way.
 */
function probeOrderFulfillment(
  entry: unknown,
  path: string,
  issues: MappedFieldIssue[],
): entry is OrderFulfillmentView {
  const before = issues.length;

  if (!isRecord(entry)) {
    recordIssue(issues, path, 'must be an object');
    return false;
  }

  probeIdentifier(entry, 'orderFulfillmentID', `${path}.orderFulfillmentID`, issues);
  probeMoney(entry, 'fulfillmentCharge', `${path}.fulfillmentCharge`, issues);
  probeNestedIdentifiers(
    entry,
    'fulfillmentMethod',
    `${path}.fulfillmentMethod`,
    ['fulfillmentMethodID', 'fulfillmentMethodType'],
    issues,
  );

  // ABSENT is A REAL STATE, not a missing value: the shipping-method gate at
  // [model/service/PromotionService.cfc:L701] tests `isNull(orderFulfillment.getShippingMethod())`
  // explicitly.
  if (!Object.hasOwn(entry, 'shippingMethod')) {
    recordIssue(
      issues,
      `${path}.shippingMethod`,
      'must be stated, as the value or as an explicit undefined',
    );
  } else {
    const shippingMethod = entry['shippingMethod'];
    if (shippingMethod !== undefined) {
      if (isRecord(shippingMethod)) {
        probeIdentifier(
          shippingMethod,
          'shippingMethodID',
          `${path}.shippingMethod.shippingMethodID`,
          issues,
        );
      } else {
        recordIssue(issues, `${path}.shippingMethod`, 'must be an object when present');
      }
    }
  }

  probeBoundedArray(
    entry,
    'appliedPromotions',
    `${path}.appliedPromotions`,
    ORDER_DOCUMENT_LIMITS.maximumOrderItems,
    issues,
  );

  // A weight, hence a count rather than money.
  probeCount(entry, 'totalShippingWeight', `${path}.totalShippingWeight`, issues);

  // The address the zone evaluator consumes. See this function's docblock for the empty-collection
  // trap.
  if (!Object.hasOwn(entry, 'address')) {
    recordIssue(
      issues,
      `${path}.address`,
      'must be stated, as the value or as an explicit undefined',
    );
    return false;
  }

  const address = entry['address'];
  if (address !== undefined) {
    if (isRecord(address)) {
      for (const member of ADDRESS_COMPARISON_MEMBERS) {
        probeNullableString(address, member, `${path}.address.${member}`, issues);
      }
      if (typeof address['isNew'] !== 'boolean') {
        // [model/service/PromotionService.cfc:L703] reads `getAddress().getNewFlag()`, so the flag
        // is a definite boolean rather than an optional one.
        recordIssue(issues, `${path}.address.isNew`, 'must be a boolean');
      }
    } else {
      recordIssue(issues, `${path}.address`, 'must be an object when present');
    }
  }

  return issues.length === before;
}

/**
 * Does this value carry every member the two passes read, in the right kind?
 *
 * @param value the candidate, of genuinely unknown type.
 * @param issues accumulator the caller supplies; complaints are appended in probe order.
 * @returns whether the value may be vouched for as an {@link OrderView}.
 * `as`, no non-null assertion and no `@ts-expect-error`. The value is handed on EXACTLY as received;
 */
function vouchesForMaterializedOrderView(
  value: unknown,
  issues: MappedFieldIssue[],
): value is OrderView {
  if (!isRecord(value)) {
    recordIssue(issues, 'order', 'must be a materialised order view object');
    return false;
  }

  // The opaque order handle [model/entity/PromotionApplied.cfc:L61].
  probeIdentifier(value, 'orderID', 'order.orderID', issues);

  // The order-type gate.
  probeNestedIdentifiers(value, 'orderType', 'order.orderType', ['systemCode'], issues);

  // The out-of-scope Account, reduced to an opaque identifier and nothing else. Stated absence is
  // the logged-out arm [model/service/PriceGroupService.cfc:L265-L266].
  probeNullableString(value, 'accountID', 'order.accountID', issues);

  // The comma-delimited promotion-code list.
  if (typeof value['promotionCodeList'] !== 'string') {
    recordIssue(issues, 'order.promotionCodeList', 'must be a comma-delimited string');
  }

  // A count [model/entity/Order.cfc:L624-L631], read at [model/service/PromotionService.cfc:L785]
  // as the seed for the qualification count.
  probeCount(value, 'totalSaleQuantity', 'order.totalSaleQuantity', issues);

  // The three order-level monetary members the engine reads: the qualifier minimum and maximum
  // gates test `getSubtotal()` [model/service/PromotionService.cfc:L648, L650]; the order-level
  // reward branch reads `getSubtotalAfterItemDiscounts()`
  // [model/service/PromotionService.cfc:L417].
  probeMoney(value, 'subtotal', 'order.subtotal', issues);
  probeMoney(value, 'subtotalAfterItemDiscounts', 'order.subtotalAfterItemDiscounts', issues);
  probeMoney(
    value,
    'fulfillmentChargeAfterDiscountTotal',
    'order.fulfillmentChargeAfterDiscountTotal',
    issues,
  );

  // The branded three-character currency code
  // [model/entity/Order.cfc:L54 `ormtype="string" length="3"`].
  const currencyCode = value['currencyCode'];
  if (typeof currencyCode !== 'string' || currencyCode.length !== 3) {
    recordIssue(issues, 'order.currencyCode', 'must be a three-character currency code');
  }

  // Order-level applied promotions.
  probeBoundedArray(
    value,
    'appliedPromotions',
    'order.appliedPromotions',
    ORDER_DOCUMENT_LIMITS.maximumOrderItems,
    issues,
  );

  const orderItems = probeBoundedArray(
    value,
    'orderItems',
    'order.orderItems',
    ORDER_DOCUMENT_LIMITS.maximumOrderItems,
    issues,
  );

  // Every entry is probed, not just the first failure, so one refusal reports every unusable
  // member the caller can fix in a single edit.
  let itemsVouched = true;
  for (const [index, entry] of orderItems.entries()) {
    if (!probeOrderItem(entry, `order.orderItems[${String(index)}]`, issues)) {
      itemsVouched = false;
    }
  }

  const orderFulfillments = probeBoundedArray(
    value,
    'orderFulfillments',
    'order.orderFulfillments',
    ORDER_DOCUMENT_LIMITS.maximumOrderFulfillments,
    issues,
  );

  let fulfillmentsVouched = true;
  for (const [index, entry] of orderFulfillments.entries()) {
    if (!probeOrderFulfillment(entry, `order.orderFulfillments[${String(index)}]`, issues)) {
      fulfillmentsVouched = false;
    }
  }

  return issues.length === 0 && itemsVouched && fulfillmentsVouched;
}

/**
 * The in-process admission: vouch for an already-materialised order view, or refuse it.
 *
 * Asynchronous because {@link OrderViewAdmission} is - an admission that reaches a hydration tier
 * must be able to await it.
 *
 * @throws {@link OrderViewAdmissionError} with the member paths that failed.
 */
export function admitMaterializedOrderView(request: ApplyPromotionsRequest): Promise<OrderView> {
  const issues: MappedFieldIssue[] = [];

  if (!Object.hasOwn(request, 'order')) {
    return Promise.reject(
      new OrderViewAdmissionError('unusableRequestInput', [
        { path: 'order', message: 'is required for this operation' },
      ]),
    );
  }

  const candidate = request.order;
  if (!vouchesForMaterializedOrderView(candidate, issues)) {
    return Promise.reject(new OrderViewAdmissionError('unsupportedBodyShape', issues));
  }

  // Handed on UNTOUCHED - the same object, with every member the caller supplied and no member
  // this adapter added.
  return Promise.resolve(candidate);
}

/**
 * The production admission: parse the caller's wire document and have the scope hydrate it.
 *
 * @throws {@link OrderViewAdmissionError} with member paths when the document is absent or does
 * not validate.
 */
async function admitOrderDocument(
  request: ApplyPromotionsRequest,
  materializer: OrderViewMaterializer,
): Promise<OrderView> {
  if (!Object.hasOwn(request, 'order')) {
    // The same distinction the structural arm draws, in the same words: "no order was sent" is a
    // different report from "an order was sent and is unusable".
    throw new OrderViewAdmissionError('unusableRequestInput', [
      { path: 'order', message: 'is required for this operation' },
    ]);
  }
  const parsed = ORDER_VIEW_DOCUMENT_SCHEMA.safeParse(request.order);

  if (!parsed.success) {
    throw new OrderViewAdmissionError(
      'unsupportedBodyShape',
      mapZodErrorFields(parsed.error, 'order'),
    );
  }
  const document: OrderViewDocument = parsed.data;
  const inconsistencies = collectDocumentInconsistencies(document);

  if (inconsistencies.length > 0) {
    throw new OrderViewAdmissionError('unusableRequestInput', inconsistencies);
  }

  return await materializer.materializeOrderView(document);
}

/**
 * The constraints that hold BETWEEN members of one order document, checked against the source
 * itself.
 *
 * `extendedPrice == price * quantity` - `getExtendedPrice()` is exactly
 * `precisionEvaluate('getPrice() * val(getQuantity())')` [model/entity/OrderItem.cfc:L200-L202].
 *
 * And one check is deliberately absent: `totalSaleQuantity` is not compared with the items.
 */
function collectDocumentInconsistencies(document: OrderViewDocument): readonly MappedFieldIssue[] {
  const issues: MappedFieldIssue[] = [];

  const fulfillmentIDs = new Set(
    document.orderFulfillments.map((fulfillment): string =>
      // Folded, because every identifier comparison in this subtree is and because the hydration
      // itself folds these same identifiers.
      fulfillment.orderFulfillmentID.toLowerCase(),
    ),
  );

  // One pass over every applied-promotion collection in the document, at all three levels.
  const seenAppliedIDs = new Set<string>();
  const noteAppliedPromotions = (
    appliedPromotions: readonly { readonly promotionAppliedID: string }[],
    path: string,
  ): void => {
    for (const [index, applied] of appliedPromotions.entries()) {
      const folded = applied.promotionAppliedID.toLowerCase();

      if (seenAppliedIDs.has(folded)) {
        recordIssue(
          issues,
          `${path}.${String(index)}.promotionAppliedID`,
          'must not name an applied promotion already named elsewhere in this order',
        );
        continue;
      }

      seenAppliedIDs.add(folded);
    }
  };

  noteAppliedPromotions(document.appliedPromotions, 'order.appliedPromotions');

  for (const [index, item] of document.orderItems.entries()) {
    // dot-separated, matching the other two refusal sources on this arm.
    const path = `order.orderItems.${String(index)}`;
    const quantity = item.quantity;

    // `Money` is the only arithmetic surface in this subtree [AAP 0.8.3], so the comparison is
    // made through it rather than with `Number` - which is also what makes it exact: these are
    // decimal strings.
    if (
      !Money.fromDecimalString(item.extendedPrice).equals(
        Money.fromDecimalString(item.price).times(quantity),
      )
    ) {
      recordIssue(
        issues,
        `${path}.extendedPrice`,
        'must equal the item price multiplied by the item quantity',
      );
    }

    if (
      !Money.fromDecimalString(item.extendedSkuPrice).equals(
        Money.fromDecimalString(item.skuPrice).times(quantity),
      )
    ) {
      recordIssue(
        issues,
        `${path}.extendedSkuPrice`,
        'must equal the item SKU price multiplied by the item quantity',
      );
    }

    if (!fulfillmentIDs.has(item.orderFulfillmentID.toLowerCase())) {
      recordIssue(
        issues,
        `${path}.orderFulfillmentID`,
        'must name an order fulfillment carried by this order',
      );
    }

    noteAppliedPromotions(item.appliedPromotions, `${path}.appliedPromotions`);
  }

  for (const [index, fulfillment] of document.orderFulfillments.entries()) {
    noteAppliedPromotions(
      fulfillment.appliedPromotions,
      `order.orderFulfillments.${String(index)}.appliedPromotions`,
    );
  }

  return issues;
}

// Section 5 - serialisation.

/**
 * One monetary value, rendered for the wire.
 *
 * `toDecimalString()` and not `toFixed2()`, and the difference is money.
 */
function renderMonetaryAmount(amount: Money): string {
  return amount.toDecimalString();
}

/**
 * The promotion-intent union, reached structurally so no additional module is imported for it.
 */
type PromotionIntent = OrderPricingResult['promotionIntents'][number];

/**
 * One applied-promotion intent, rendered flat.
 *
 * FLAT and TOTAL, with no discrimination and therefore no unhandled arm.
 *
 * The conditional spreads are what `exactOptionalPropertyTypes` requires: an omitted key and a key
 * written as `undefined` are different states under it, and this renders the former.
 */
function renderPromotionIntent(intent: PromotionIntent): PromotionAppliedIntentDocument {
  const promotionID: string | undefined = intent.promotionID;
  const orderID: string | undefined = intent.orderID;
  const orderItemID: string | undefined = intent.orderItemID;
  const orderFulfillmentID: string | undefined = intent.orderFulfillmentID;
  const promotionAppliedID: string | undefined = intent.promotionAppliedID;
  const discountAmount: Money | undefined = intent.discountAmount;

  return {
    operation: intent.operation,
    appliedType: intent.appliedType,
    ...(promotionID === undefined ? {} : { promotionID }),
    ...(orderID === undefined ? {} : { orderID }),
    ...(orderItemID === undefined ? {} : { orderItemID }),
    ...(orderFulfillmentID === undefined ? {} : { orderFulfillmentID }),
    ...(promotionAppliedID === undefined ? {} : { promotionAppliedID }),
    ...(discountAmount === undefined
      ? {}
      : { discountAmount: renderMonetaryAmount(discountAmount) }),
  };
}

/**
 * One price-group intent, rendered.
 */
function renderPriceGroupIntent(intent: PriceGroupAppliedIntent): PriceGroupAppliedIntentDocument {
  return {
    orderItemID: intent.orderItemID,
    price: renderMonetaryAmount(intent.price),
    priceGroupID: intent.priceGroupID,
  };
}

/**
 * One SKU's sale-price detail, rendered.
 *
 * The three optional members are OMITTED when the port carried nothing, never coerced.
 */
function renderSalePriceDetail(detail: SalePriceDetail): SalePriceDetailDocument {
  const originalPrice: Money | undefined = detail.originalPrice;
  const roundingRuleID: string | undefined = detail.roundingRuleID;
  const expiration: Date | undefined = detail.salePriceExpirationDateTime;

  return {
    skuID: detail.skuID,
    discountLevel: detail.discountLevel,
    salePriceDiscountType: detail.salePriceDiscountType,
    salePrice: renderMonetaryAmount(detail.salePrice),
    promotionID: detail.promotionID,
    ...(originalPrice === undefined ? {} : { originalPrice: renderMonetaryAmount(originalPrice) }),
    ...(roundingRuleID === undefined ? {} : { roundingRuleID }),
    // ISO-8601, hence UTC by definition - the explicit UTC policy discharged at the boundary.
    ...(expiration === undefined ? {} : { salePriceExpirationDateTime: expiration.toISOString() }),
  };
}

/**
 * Define one opaque-keyed result member as an enumerable own property.
 *
 * Plain assignment is unsafe for the reserved key `__proto__`: it reaches an inherited setter on
 * an ordinary object instead of creating the SKU entry.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

/**
 * The exact shape `getSalePriceDetailsForProductSkus` answers with.
 *
 * Derived from the PORTED SERVICE's own signature [model/service/PromotionService.cfc:L1022]
 * rather than restated.
 */
type SalePriceDetailsResult = Awaited<
  ReturnType<PromotionService['getSalePriceDetailsForProductSkus']>
>;

/**
 * Sale-price details, keyed by the opaque SKU identifier the query grouped on.
 */
function renderSalePriceDetails(
  details: SalePriceDetailsResult,
): Readonly<Record<string, SalePriceDetailDocument>> {
  const rendered: Record<string, SalePriceDetailDocument> = {};
  for (const [skuID, detail] of Object.entries(details)) {
    putOwnStructKey(rendered, skuID, renderSalePriceDetail(detail));
  }
  return rendered;
}

// `jsonSuccessResponse(requestId, capability, action, result)` now supplies the status, the
// headers and the `{requestId, capability, action, result}` framing.

// Section 6 - event decoding.
//
// Everything between the platform's event and the decoded envelope.

/**
 * The outcome of decoding, before schema validation is attempted.
 */
type EnvelopeDecoding =
  | {
      readonly ok: true;
      readonly request: PromotionApplicationRequest;

      /**
       * The account this request PRICES for, which is not necessarily the account that SENT it.
       *
       * So the envelope member is promoted from "a claim to be checked" to "the subject the
       * trusted caller names".
       *
       * It is never `undefined` for A REQUEST that REACHED here, and that is what preserves the
       * earlier CRITICAL adoption fix: an envelope naming no subject falls back to the trusted
       * caller's own account.
       */
      readonly subjectAccountID: string;
    }
  | {
      readonly ok: false;
      readonly reason: InvalidRequestReason;
      /**
       * Member paths, when the refusal can name one. Never a submitted value.
       */
      readonly fields?: readonly MappedFieldIssue[] | undefined;
    };

// The trust boundary for the account, and why it is one.
//
// The fix is the one the sibling entrypoint already uses, and using the same one is deliberate:
// `./priceResolutionHandler.js` derives its account from `event.requestContext.authorizer`.
//
// And the account rule above is reshaped by (1) rather than replaced.

/**
 * Does a caller-supplied account agree with the authenticated one?
 *
 * ABSENT always AGREES, on both sides, and each direction is a decision: a caller that supplies
 * nothing has stated nothing to disagree with, and the authenticated account stands.
 *
 * `cfEquals` rather than `===`, because CFML string comparison folds case
 * [model/service/PriceGroupService.cfc reads the account by association, and CFML identifiers are case-insensitive].
 */
function accountAgrees(supplied: string | undefined, authenticated: string | undefined): boolean {
  if (supplied === undefined) {
    return true;
  }

  return authenticated !== undefined && cfEquals(supplied, authenticated);
}

/**
 * @param order the admitted view, exactly as the admission produced it.
 * @param authenticatedAccountID the SUBJECT account this request prices for, resolved by the
 * handler from the envelope and the trusted caller's principal.
 * @returns the same view when it already names the subject account (or when there is no subject
 * account to bind), and a view bound to that account when it named none.
 * @throws {@link OrderViewAdmissionError} naming `order.accountID` when the order names a
 * different account.
 */
function reconcileOrderAccount(
  order: OrderView,
  authenticatedAccountID: string | undefined,
): OrderView {
  if (order.accountID === undefined) {
    // Nothing to reconcile when the request itself established no account: adopting `undefined`
    // would be a copy for no reason.
    if (authenticatedAccountID === undefined) {
      return order;
    }

    // A SHALLOW REBIND, which is the same mechanism `./bootstrap.js`'s between-pass projection
    // uses on this same type: one member is replaced and every collection is carried across by
    // reference, so the reward iteration order.
    return { ...order, accountID: authenticatedAccountID };
  }

  if (!accountAgrees(order.accountID, authenticatedAccountID)) {
    throw new OrderViewAdmissionError('unusableRequestInput', [
      {
        path: 'order.accountID',
        message: 'must name the authenticated account, or be omitted',
      },
    ]);
  }

  // Named, and it agrees.
  return order;
}

/**
 * Maximum decoded order-shaped request document admitted before JSON parsing.
 */
const MAXIMUM_REQUEST_DOCUMENT_BYTES = 512 * 1024;

/**
 * Encoded length above which a base64 body cannot decode within the byte ceiling.
 */
const MAXIMUM_ENCODED_BODY_LENGTH = Math.ceil((MAXIMUM_REQUEST_DOCUMENT_BYTES * 4) / 3) + 4;

/**
 * Non-colliding result for a present body that exceeds the parse ceiling.
 */
const OVERSIZED_BODY: unique symbol = Symbol('oversizedRequestBody');

/**
 * Lift the request body out of the event as text.
 *
 * `isBase64Encoded` is honoured because the platform sets it and ignoring it would turn a
 * perfectly well-formed document into an unparsable one.
 *
 * @returns the body text, `undefined` when absent, or {@link OVERSIZED_BODY} past the ceiling.
 */
function readRequestBodyText(
  event: APIGatewayProxyEvent,
): string | undefined | typeof OVERSIZED_BODY {
  const body = event.body;
  if (typeof body !== 'string' || body.trim().length === 0) {
    return undefined;
  }

  if (event.isBase64Encoded) {
    if (body.length > MAXIMUM_ENCODED_BODY_LENGTH) {
      return OVERSIZED_BODY;
    }

    const decoded = Buffer.from(body, 'base64').toString('utf8');

    if (Buffer.byteLength(decoded, 'utf8') > MAXIMUM_REQUEST_DOCUMENT_BYTES) {
      return OVERSIZED_BODY;
    }

    return decoded.trim().length === 0 ? undefined : decoded;
  }

  if (Buffer.byteLength(body, 'utf8') > MAXIMUM_REQUEST_DOCUMENT_BYTES) {
    return OVERSIZED_BODY;
  }

  return body;
}

/**
 * Decode and validate the request envelope, and bind it to the AUTHENTICATED account.
 *
 * The schema is invoked with `parse`, so a validation failure is THROWN as a `ZodError` and
 * `mapErrorToApiGatewayResponse` recognises it, publishes the failing member paths and the
 * constraint descriptions.
 *
 * `order` is copied across only when the document actually carries the key.
 *
 * @param event the proxy event whose body carries the envelope.
 * @param requestId the platform request identifier, carried into every refusal.
 * @param callerAccountID the TRUSTED SERVICE's own account, from `resolveRequestPrincipal`.
 */
function decodeRequestEnvelope(
  event: APIGatewayProxyEvent,
  requestId: string,
  callerAccountID: string,
): EnvelopeDecoding {
  const text = readRequestBodyText(event);
  if (text === undefined) {
    return { ok: false, reason: 'missingRequestBody' };
  }
  if (text === OVERSIZED_BODY) {
    return { ok: false, reason: 'unusableRequestInput' };
  }

  let document: unknown;
  try {
    // Declared `unknown` rather than inferred, so nothing untyped escapes this statement.
    document = JSON.parse(text);
  } catch {
    // The caught value is deliberately not inspected.
    return { ok: false, reason: 'unparsableRequestBody' };
  }

  if (!isRecord(document)) {
    // Covers a scalar, `null` and an array. An array is a JSON document but not this document.
    return { ok: false, reason: 'unsupportedBodyShape' };
  }

  // The one unrecognized key `z.strictObject` does not refuse, refused here instead.
  //
  // It runs before the schema, so an offending key is reported as itself rather than as whatever
  // downstream shape error it happens to coincide with.
  if (containsPrototypeMemberKey(document)) {
    return {
      ok: false,
      reason: 'unusableRequestInput',
      fields: [PROTOTYPE_MEMBER_FIELD_ISSUE],
    };
  }

  const envelope = REQUEST_ENVELOPE_SCHEMA.parse(document);

  // The route is restricted to a trusted service principal, and acting on behalf of an account is
  // that principal's entire purpose - it stands in for the in-process `OrderService`
  // [model/service/OrderService.cfc:L60-L61].
  const subjectAccountID = envelope.accountID ?? callerAccountID;

  if (envelope.operation === 'getSalePriceDetailsForProductSkus') {
    return {
      ok: true,
      subjectAccountID,
      request: {
        operation: 'getSalePriceDetailsForProductSkus',
        requestId,
        productID: envelope.productID,
      },
    };
  }

  return {
    ok: true,
    subjectAccountID,
    request: {
      operation: 'applyPromotions',
      requestId,
      order: envelope.order,
    },
  };
}

// Section 7 - dispatch and the ordering constraint.

/**
 * Run the operation the payload selected against one request scope.
 *
 * Separated from the factory so the ordering constraint sits in a function short enough to read
 * whole, and so a suite can observe the composed operation being invoked exactly once.
 */
async function runSelectedOperation(
  request: PromotionApplicationRequest,
  scope: RequestScope,
  admitOrderView: OrderViewAdmission,
  accountID: string | undefined,
  route: string,
  action: RouteAction,
  sink: Logger,
): Promise<PromotionApplicationResultDocument> {
  // The injected clock, observed and not read. `scope.now` is the single instant this request
  // bound; there is no `new Date()` anywhere in this module.
  const evaluatedAt = scope.now.toISOString();

  if (request.operation === 'getSalePriceDetailsForProductSkus') {
    // The one other already-ported service method this adapter reaches
    // [model/service/PromotionService.cfc:L1022].
    const details = await scope.getSalePriceDetailsForProductSkus(request.productID);
    sink.info('resolved sale-price details for a product', {
      requestId: request.requestId,
      route,
      capability: CAPABILITY,
      action,
      operation: request.operation,
      // A COUNT of what was resolved. No identifier, no price and no amount reaches a log line.
      resolvedSkuCount: Object.keys(details).length,
    });

    return {
      operation: request.operation,
      evaluatedAt,
      salePriceDetails: renderSalePriceDetails(details),
    };
  }

  // Admitted through the injected port, and hydrated by the scope - see section.
  const admitted = await admitOrderView(request, scope);

  // See {@link reconcileOrderAccount}: an order that names none ADOPTS the subject the trusted
  // caller named, and one that names a DIFFERENT account is refused.
  const order = reconcileOrderAccount(admitted, accountID);

  // The cross-service execution ordering, discharged in one call.
  //
  // The reader: [model/service/PromotionService.cfc:L241] tests
  // `isNull(orderItem.getAppliedPriceGroup()) || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() )`.
  //
  // This is one call and not two, `AND` that is the enforcement.
  const pricing: OrderPricingResult =
    await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

  // Rendered in emitted order.
  const promotionIntents = pricing.promotionIntents.map(renderPromotionIntent);
  const priceGroupIntents = pricing.priceGroupIntents.map(renderPriceGroupIntent);

  sink.info('priced an order through the composed price-group-then-promotion operation', {
    requestId: request.requestId,
    route,
    capability: CAPABILITY,
    action,
    operation: request.operation,
    // Whether an account was established, as a BOOLEAN.
    accountEstablished: accountID !== undefined,
    // COUNTS only. No order identifier, no item identifier and no monetary amount reaches a log
    // line: an order document is caller-authored and a log stream is not the place to reproduce
    // one.
    orderItemCount: order.orderItems.length,
    orderFulfillmentCount: order.orderFulfillments.length,
    promotionIntentCount: promotionIntents.length,
    priceGroupIntentCount: priceGroupIntents.length,
  });

  return {
    operation: request.operation,
    evaluatedAt,
    // An EMPTY array is a valid result and, for a return order, the CORRECT one - see the
    // preserved `issue #1766` no-op in the register below.
    promotionIntents,
    priceGroupIntents,
  };
}

// Section 8 - the handler.

/**
 * The one route action this module implements.
 */
const IMPLEMENTED_ROUTE_ACTION: RouteAction = 'applyPromotions';

/**
 * Build the per-invocation scope input.
 *
 * If a future member of this path ever does consult the entitlement surface, this omission becomes
 * a fail-closed refusal rather than a bypass.
 */
function buildRequestScopeInput(
  accountID: string | undefined,
  clock: (() => Date) | undefined,
): RequestScopeInput {
  return { now: clock?.(), accountID };
}

/**
 * Build a promotion-application handler over an explicit dependency bundle.
 *
 * @param dependencies the bundle; every member optional, every default the production one.
 */
export function createPromotionApplicationHandler(
  dependencies: PromotionApplicationDependencies = {},
): PromotionApplicationHandler {
  // Resolved once, at construction, so the request path performs no defaulting.
  //
  // The production default calls `bootstrapCompositionRoot()` with no overrides, which is what
  // keeps the module memo in play: `./bootstrap.js` records that any overrides bypass the memo
  // entirely.
  const openCompositionRoot: () => Promise<CompositionRoot> =
    dependencies.compositionRoot ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot());
  const admitOrderView: OrderViewAdmission = dependencies.admitOrderView ?? admitOrderDocument;
  const sink: Logger = dependencies.logger ?? defaultLogger;
  const clock: (() => Date) | undefined = dependencies.clock;

  return async (event: APIGatewayProxyEvent, context?: Context): Promise<APIGatewayProxyResult> => {
    const requestId = resolveServerRequestId(event, context);

    // Reassigned once, after the route is known, so a failure anywhere below is reported against
    // the route being served.
    let mappingContext: ErrorMappingContext = { requestId, logger: sink };

    try {
      const resolution = resolveRouteForCapability(
        routeRequestFromEvent(event),
        CAPABILITY,
        mappingContext,
      );
      if (!resolution.matched) {
        // A READY response built by `./errorMapper.js`, already logged there. A route belonging to
        // another capability folds into this same arm, so nothing leaks about the other four.
        return resolution.response;
      }
      const route = routeDiagnosticLabel(resolution.route.methods, resolution.route.path);
      mappingContext = { requestId, route, logger: sink };
      if (resolution.route.action !== IMPLEMENTED_ROUTE_ACTION) {
        return routeNotFoundResponse(mappingContext);
      }

      // Fail closed before decoding or opening the graph.
      const principalResolution = resolveRequestPrincipal(event);
      if (!principalResolution.identified) {
        return unauthenticatedResponse(mappingContext);
      }
      if (!principalHasServiceScope(principalResolution.principal, CAPABILITY)) {
        return forbiddenResponse(mappingContext);
      }

      const callerAccountID = principalResolution.principal.accountID;
      const decoding = decodeRequestEnvelope(event, requestId, callerAccountID);
      if (!decoding.ok) {
        return invalidRequestResponse(decoding.reason, mappingContext, decoding.fields);
      }

      // Account, the hydration's `establishedAccountID` and the order-document agreement test all
      // take this one value, so there is no path on which two of the three could disagree about
      // whose order is being priced.
      const subjectAccountID = decoding.subjectAccountID;

      // One await of the idempotent, memoized initializer, INSIDE the handler and never at module
      // top level - which is also what keeps this module free of a top-level `await`.
      const root = await openCompositionRoot();

      // Exactly one fresh per-request scope, opened here and never held, cached or reused across
      // invocations.
      const scope = await root.createRequestScope(buildRequestScopeInput(subjectAccountID, clock));

      const document = await runSelectedOperation(
        decoding.request,
        scope,
        admitOrderView,
        subjectAccountID,
        route,
        resolution.route.action,
        sink,
      );
      return jsonSuccessResponse(
        requestId,
        resolution.route.capability,
        resolution.route.action,
        document,
      );
    } catch (thrown: unknown) {
      // Narrowed by `instanceof`, never cast.
      if (thrown instanceof OrderViewAdmissionError) {
        return invalidRequestResponse(thrown.reason, mappingContext, thrown.fields);
      }

      // `unusableRequestInput` is the reason, deliberately: the document's SHAPE was fine - it is
      // the CONTENT that names nothing this request can price.
      if (thrown instanceof OrderViewDocumentDataError) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, thrown.fields);
      }

      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/**
 * The lambda entry point.
 *
 * The PRIMARY exported unit of this module, and the symbol the platform invokes.
 *
 * `slatwall-ts/esbuild.config.mjs` - one level above this folder - already lists this file among
 * its candidate entry points and emits it as an independently deployable CommonJS artifact.
 */
export const handler: PromotionApplicationHandler = createPromotionApplicationHandler();

// The preserved defects this route exposes are annotated where they are implemented: the over-use
// stripping index mix in `../services/promotion/overUseStripping.ts`, the dead
// `qualifiedFulfillments` key and the shipping-zone re-test in
// `../services/promotion/promotionPeriodQualification.ts`, and the pre-rounding clamp in
// `../services/promotion/discountAmount.ts`. This boundary reproduces their outcomes and repairs
// none of them.
//
// The return-and-exchange branch [model/service/PromotionService.cfc:L542-L544] is still the empty
// no-op it is in the source, carrying its `issue #1766` reference in
// `../services/promotionService.ts`.
