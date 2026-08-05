/**
 * BUNDLE ENTRY POINT: the promotion-application capability.
 *
 * A Lambda primary adapter and nothing else. It parses an API Gateway proxy event, resolves the
 * route through `./router.js`, opens exactly one request scope from the graph `./bootstrap.js`
 * publishes, invokes ONE already-composed operation on it, serialises what comes back, and funnels
 * every thrown value through `./errorMapper.js`. It evaluates no qualification, computes no
 * discount, performs no `Money` arithmetic, manipulates no usage ledger, sorts nothing, strips
 * nothing, walks no materialised path, issues no SQL, constructs no entity, no service, no
 * repository, no port and no connection pool, and resolves no setting.
 *
 * ===========================================================================================
 * WHY THIS FILE EXISTS - THE CROSS-SERVICE EXECUTION ORDERING
 *
 *   `PriceGroupService.updateOrderAmountsWithPriceGroups` MUST RUN BEFORE
 *   `PromotionService.updateOrderAmountsWithPromotions`.
 *
 * THE WRITER, verbatim [model/service/PriceGroupService.cfc:L364-L375]:
 *
 *   L364 public void function updateOrderAmountsWithPriceGroups(required any order) {
 *   L365   if( !isNull(arguments.order.getAccount()) && arrayLen(arguments.order.getAccount().getPriceGroups()) ) {
 *   L366     for(var i=1; i<=arrayLen(arguments.order.getOrderItems()); i++){
 *   L367       var priceGroupDetails = getBestPriceGroupDetailsBasedOnSkuAndAccount(...);
 *   L369       if(priceGroupDetails.price < arguments.order.getOrderItems()[i].getPrice() && isObject(priceGroupDetails.priceGroup)) {
 *   L370         arguments.order.getOrderItems()[i].setPrice( priceGroupDetails.price );
 *   L371         arguments.order.getOrderItems()[i].setAppliedPriceGroup( priceGroupDetails.priceGroup );
 *
 * THE READER, verbatim [model/service/PromotionService.cfc:L241-L254]:
 *
 *   L241 if( isNull(orderItem.getAppliedPriceGroup()) || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() ) ) {
 *   L244   var discountAmount = getDiscountAmount(reward, orderItem.getPrice(), discountQuantity);
 *   L246 } else {
 *   L249   var originalDiscountAmount = getDiscountAmount(reward, orderItem.getSkuPrice(), discountQuantity);
 *   L252   var discountAmount = precisionEvaluate('originalDiscountAmount - (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())');
 *   L254 }
 *
 * THE BRANCH MAPPING, AS VERIFIED IN THE SOURCE AND NOT AS PARAPHRASED ELSEWHERE:
 *
 *   - A NULL applied price group, OR a reward that DOES list the applied group as eligible,
 *     discounts from `getPrice()` with NO correction term (L241 -> L244).
 *   - Otherwise - an applied price group the reward does NOT list as eligible - the discount comes
 *     from `getSkuPrice()` PLUS the correction term
 *     `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())` (L246 -> L249, L252).
 *
 * `getAppliedPriceGroup()` is read IN THE BRANCH CONDITION ITSELF at L241, so the ordering
 * obligation holds WHICHEVER ARM RUNS. There is no price-group-free path that escapes it. And the
 * write at L370/L371 is CONDITIONAL - gated by the account test at L365 and the better-price test
 * at L369 - so an order item may legitimately still carry NO applied price group after the pass has
 * run, which is precisely the `isNull(...)` arm of L241. "No account" and "no better rate" are
 * therefore not licence to skip the pass: it must run FIRST and UNCONDITIONALLY.
 *
 * Recorded, not repaired: `var discountAmount` is declared inside BOTH L241 arms yet read outside
 * them at L257. That is legal CFML - `var` is function-scoped, not block-scoped - and it is a source
 * observation rather than a target concern.
 *
 * HOW THE ORDERING IS ENFORCED HERE - STRUCTURALLY, NOT BY DISCIPLINE. In the legacy system it held
 * only because `model/service/OrderService.cfc` happened to call the two services in sequence; that
 * component declares `priceGroupService` at [model/service/OrderService.cfc:L60] and
 * `promotionService` at [:L61] among its sixteen collaborators, and it is out of scope, so the
 * accidental guarantee is gone. `./bootstrap.js` therefore publishes the two passes as ONE composed
 * operation - `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions` - and withholds both
 * individual passes behind `Omit<>` capability types, so there is no member left to call in the
 * wrong order. This file invokes THAT ONE OPERATION. It never calls the two passes as two
 * separately-sequenced steps that a later edit could transpose, and it re-exposes
 * `updateOrderAmountsWithPriceGroups` nowhere.
 *
 * NO ORDERING PARAMETER EXISTS ANYWHERE ON THIS SURFACE. There is no `sequence`, `phase`,
 * `runAfter`, `pipeline`, `order` or `skipPriceGroups` member on the request payload, on the
 * dependency bundle or on anything this module declares. A parameter letting a caller choose the
 * order would reproduce exactly the arrangement the composition removed.
 * ===========================================================================================
 *
 * THE ANTI-CORRUPTION SEAM: VIEWS IN, INTENTS OUT
 *
 * `updateOrderAmountsWithPromotions(required any order)` [model/service/PromotionService.cfc:L58]
 * takes an Order, and `model/service/OrderService.cfc` with every order, cart, checkout and payment
 * entity is out of scope. The input is therefore a READ-ONLY order-shaped VIEW
 * (`../domain/views/orderView.js`, `orderItemView.js`, `orderFulfillmentView.js`) and never a live
 * ORM aggregate, and the output is applied-promotion INTENTS keyed by the opaque `orderID`,
 * `orderItemID` and `orderFulfillmentID` strings. `model/entity/PromotionApplied.cfc` holds real
 * foreign keys into those out-of-scope entities - `orderItem` [:L58], `orderFulfillment` [:L59] and
 * `order` [:L61] - and this boundary reaches them ONLY as opaque identifiers. Nothing here mutates
 * order state, writes back to an order, or persists anything at all.
 *
 * The `void`-to-intents reshaping of `updateOrderAmountsWithPromotions` is ALREADY ALLOCATED to the
 * services tier; this adapter consumes it. `src/handlers/**` owns ZERO slots of the signature-
 * reshaping, visibility-widening or deliberate-divergence ledgers and spends none.
 *
 * ★★ WHY THIS ADAPTER ADMITS AN ORDER VIEW AND NEVER MINTS ONE.
 *
 * The AAP describes this entrypoint as "accepting an order view", and that verb is exact.
 * Materialising one is a REPOSITORIES-tier act and is structurally out of this tier's reach, for
 * three independent reasons that a reader should be able to check rather than take on trust:
 *
 *   1. `OrderItemView.sku` is a ported `Sku` ENTITY, because the engine walks a deep graph through
 *      it - `getSkuID()`, `getProduct().getProductType().getProductTypeIDPath()`, `getOptions()`,
 *      `getSalePriceDetails()` [model/service/PromotionService.cfc:L808-L818, L864-L865, L146-L150].
 *   2. `OrderItemView.appliedPriceGroup` is a ported `PriceGroup` entity, because L241 compares
 *      ENTITIES through `reward.hasEligiblePriceGroup(...)`.
 *   3. `OrderView.currencyCode` is a BRANDED value object whose only mint lives in
 *      `../domain/valueObjects/currencyCode.js`.
 *
 * Constructing any of the three is entity construction, which this tier does not do, and
 * `RequestScope` publishes no SKU-by-identifier loader, no price-group loader and - deliberately, as
 * `./bootstrap.js` records at length - none of the six MySQL adapters. So a caller holding a wire
 * document materialises it on the tier that owns hydration and hands the RESULT here; this adapter
 * validates what it is given, refuses what it cannot vouch for, and never fabricates a member.
 * Refusing is the safe outcome, and it is a complete one: no member is ever defaulted, and in
 * particular an absent price NEVER becomes zero, because a zero price sells product for free.
 *
 * THE ONE OTHER OPERATION. `getSalePriceDetailsForProductSkus(productID)`
 * [model/service/PromotionService.cfc:L1022] takes a plain string and is therefore fully
 * serviceable from a wire payload with nothing to materialise. It is the single additional
 * already-ported service method this adapter reaches, it is published on `RequestScope` through the
 * `SalePriceResolver` contract in `../domain/ports/promotionRepository.js`, and it is selected by
 * the payload rather than by a second route.
 *
 * THE FIVE ORDER-DEPENDENCE VECTORS, AND THIS FILE'S OBLIGATION TOWARDS THEM - WHICH IS NEGATIVE.
 * `updateOrderAmountsWithPromotions` is 489 lines in one function
 * [model/service/PromotionService.cfc:L58-L546] and is order-dependent five separate ways, every
 * one of which decides money and every one of which belongs to the services tier. This adapter
 * disturbs none of them:
 *
 *   V1 - THE MUTABLE USAGE LEDGER. `promotionRewardUsageDetails[rewardID].usedInOrder` is
 *        incremented in place [model/service/PromotionService.cfc:L297], so whether a later reward
 *        is allowed depends on which earlier ones ran. The collection comes from
 *        `getActivePromotionRewards()` [model/dao/PromotionDAO.cfc:L51-L132], which declares NO
 *        `ORDER BY`, so iteration order is genuinely non-deterministic at a tie - and that
 *        non-determinism IS the legacy behaviour. Nothing here adds an `ORDER BY`, sorts the
 *        rewards or stabilises the tie.
 *   V2 - THE HAND-ROLLED TWO-PASS LOOP. `if(!orderRewards and pr == arrayLen(promotionRewards)) {
 *        pr = 0; orderRewards = true; }` [model/service/PromotionService.cfc:L458-L461], with
 *        `var orderRewards = false;` at [:L166]. The reset sits INSIDE the loop body, so the
 *        order-level pass NEVER RUNS when the reward collection is empty. Nothing here helpfully
 *        runs an order-level pass in that case.
 *   V3 - OVER-USE STRIPPING READS A LEAKED VARIABLE (defect 9, below). Preserved by the services
 *        tier; nothing here repairs it.
 *   V4 - TWO INSERTION SORTS IN OPPOSITE DIRECTIONS. Qualified discounts are insert-sorted
 *        DESCENDING by amount [model/service/PromotionService.cfc:L266-L294] and only index `[1]`,
 *        the single largest, is ever applied [:L524-L537]; the usage array is insert-sorted
 *        ASCENDING by `discountPerUseValue` [:L301-L329] so the cheapest-per-use are stripped
 *        first. Both orderings are load-bearing. This adapter re-sorts nothing, re-ranks nothing,
 *        and returns exactly the intents the engine emitted, in the order it emitted them.
 *   V5 - AN UNGUARDED DIVISION. `discountPerUseValue = precisionEvaluate('discountAmount /
 *        discountQuantity')` [model/service/PromotionService.cfc:L299] has no zero check on the
 *        divisor. None is added here.
 *
 * THE PRESERVED NO-OP. The return/exchange branch [model/service/PromotionService.cfc:L542-L544]
 * carries a legacy `// TODO [issue #1766]` and does nothing at all. It is ported verbatim by the
 * services tier, still does nothing, and still carries its ticket reference; a placeholder
 * regression test named `issue_1766` documents the gap, following the `issue_<ticket#>` convention
 * of [meta/tests/unit/IssuesTest.cfc]. No return or exchange handling is implemented here, and an
 * EMPTY intent array is the correct - not the degenerate - result for such an order.
 *
 * TEST COVERAGE FOR THIS MODULE IS NET-NEW, NOT PARITY. Only three legacy test files touch the
 * in-scope slice - [meta/tests/unit/entity/BrandTest.cfc], [meta/tests/unit/entity/ProductTest.cfc]
 * and the EMPTY [meta/tests/functional/admin/entity/ProductTest.cfc] - and none of them touches a
 * handler, an order-shaped input or a routing surface. Nothing here may be presented as
 * carried-forward coverage. The assertions, including the one proving that reversing the two passes
 * changes the computed discount, live in `tests/unit/handlers/promotionApplicationHandler.test.ts`
 * and are authored there, not here; this module's obligation is to be structurally testable for
 * them, which is what {@link createPromotionApplicationHandler} is for.
 *
 * NO USER-SPECIFIED RULES EXIST FOR THIS PROJECT. The rules source was queried and reports that
 * none were provided, so no rule is cited anywhere in this file and none is invented. Every
 * constraint below traces to the Agent Action Plan, to the folder's own requirements, or to an
 * explicit `JUDGMENT CALL` note. Their absence is not licence to lower the bar: the enterprise
 * standard the AAP enumerates - maximal strictness, mechanically enforced layer boundaries, all
 * money through `Money`, environment-driven configuration with no credential in source, one primary
 * exported unit with no barrel, and an in-code annotation for every judgment call and preserved
 * defect - is what this file is held to.
 *
 * PARAMETERIZED SQL: NOT APPLICABLE HERE, stated rather than silently omitted. This module contains
 * no query, no query fragment and no database access; that obligation rests wholly with
 * `src/repositories/mysql/**`, the only layer that speaks to the `Sw*` schema. Schema continuity is
 * untouched - no migration, no rename, no new table, no column change.
 *
 * NO INFRASTRUCTURE AND NO DEPLOYMENT DESCRIPTOR. No OpenAPI document, no SAM `Events` block, no
 * `serverless.yml`, no Terraform, no CDK, no CloudFormation. "Deployable" means a successful build
 * and package step emitting Lambda-compatible artifacts; `slatwall-ts/esbuild.config.mjs` - one
 * level above this folder - already lists this file among its candidate entry points, and no
 * bundler, manifest or configuration file is authored, edited or duplicated here.
 *
 * NO NON-FUNCTIONAL REQUIREMENT IS INVENTED. There is no service-level objective, latency target,
 * throughput figure, capacity number or availability claim anywhere in this file or its comments.
 * The bound in {@link ORDER_DOCUMENT_LIMITS} is a SAFETY bound on how much work one invocation will
 * accept, never a performance target. The legacy 60-second order-placement, 45-second
 * payment-transaction and 30-second dependency-scan lock timeouts are NOTED here and deliberately
 * NOT implemented. `cfthread` occurs zero times across the in-scope slice, so no worker thread is
 * introduced.
 *
 * NO `import.meta` AND NO TOP-LEVEL `await`. The Lambda artifact is emitted CommonJS because
 * bundling this dependency set to ESM builds cleanly and then fails at runtime with `Dynamic
 * require of "node:buffer"` through `mysql2` -> `sql-escaper`. That is a settled decision recorded
 * in `slatwall-ts/README.md`; it is not re-litigated and it is not "fixed" in source.
 *
 * DEPENDENCY DIRECTION. This module imports `./bootstrap.js`, `./router.js`, `./errorMapper.js` and
 * `../lib/logger.js`; none of them imports it, and no other capability handler is imported here.
 * `src/handlers/**` is the inversion point of the layer graph: it imports inward and nothing imports
 * from it. There is no barrel and no `index.ts` anywhere in this subtree.
 *
 * THE TWO STUB PORTS ARE UNREACHABLE FROM THIS CAPABILITY. `imageStore` and
 * `subscriptionTermProvider` exist because a handful of out-of-scope branches inside in-scope services
 * reach for them - image upload [model/service/SkuService.cfc:L210-L218] and the subscription and
 * content-access SKU-creation paths [:L139-L202] - and neither branch is on any path this entrypoint
 * takes. Nothing here imports, constructs or calls either one.
 */

import { z } from 'zod';

import { bootstrapCompositionRoot } from './bootstrap.js';
import { invalidRequestResponse, mapErrorToApiGatewayResponse } from './errorMapper.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';
import { logger as defaultLogger } from '../lib/logger.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { CompositionRoot, OrderPricingResult, RequestScope } from './bootstrap.js';
import type { ErrorMappingContext, InvalidRequestReason, MappedFieldIssue } from './errorMapper.js';
import type { SalePriceDetail } from '../domain/ports/promotionRepository.js';
import type { PriceGroupAppliedIntent } from '../services/priceGroupService.js';
import type { PromotionService } from '../services/promotionService.js';
import type { Money } from '../domain/valueObjects/money.js';
import type {
  OrderFulfillmentView,
  ShippingAddressView,
} from '../domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../domain/views/orderItemView.js';
import type { OrderView } from '../domain/views/orderView.js';
import type { Logger } from '../lib/logger.js';

// `../domain/ports/addressZoneEvaluator.js` is DELIBERATELY NOT IMPORTED, and saying so is worth more
// than the silence. `AddressZoneEvaluator` is a LIVE port that performs a real comparison against real
// zone locations, and it is reached from `getShippingMethodOptionsDiscountAmountDetails`
// [model/service/PromotionService.cfc:L1032] on the SERVICES tier - never from a handler - because the
// zone decision it makes is a business decision this adapter must not make. The empty-collection
// semantics that make it dangerous to touch are recorded on {@link probeOrderFulfillment}.

// ===========================================================================
// SECTION 1 - THE PUBLISHED SURFACE
//
// One PRIMARY exported unit - the Lambda `handler` - plus co-located supporting
// types, on the same terms the thirteen ports publish an interface alongside the
// projections it needs. `createPromotionApplicationHandler` is the injection seam
// and follows the idiom `bootstrapCompositionRoot(overrides)` already
// established: passing dependencies builds an isolated handler, passing none is
// the production path. There is no barrel and no `index.ts`.
// ===========================================================================

/**
 * The capability this handler answers for.
 *
 * Declared as a local constant rather than being re-derived, so the value handed to
 * `resolveRouteForCapability` and the value written to every log line are provably the same string.
 * `RoutedCapability` is a string-literal union in `./router.js`, so a typo here is a compile error
 * at the call site rather than a silent 404.
 */
const CAPABILITY = 'promotionApplication';

/**
 * The two operations this capability serves, selected by the request payload.
 *
 * A string-literal union rather than the TypeScript enumeration construct: a union is erased on
 * emit, so nothing survives into the bundle as a runtime object.
 *
 * ★ NEITHER MEMBER NAMES AN EXECUTION ORDER, AND NO MEMBER EVER WILL. `applyPromotions` reaches the
 * ONE composed operation whose internal price-group-then-promotion sequence is fixed inside
 * `./bootstrap.js` and is not parameterised, not reorderable and not observable from here. There is
 * deliberately no `applyPriceGroups` member, because running that pass alone is never correct - see
 * the ordering statement in the module header - and `./bootstrap.js` withholds it from
 * `RequestScope` for exactly that reason. Selecting an OPERATION is not selecting a SEQUENCE.
 *
 * JUDGMENT CALL: the operation is chosen by the payload rather than by a second route. `./router.js`
 * records the same decision from the other side - "exactly one route per capability, with the
 * handler deciding which of its own service methods a given payload calls for" - because four of the
 * five handler rows in the AAP's transformation table have no legacy source file at all, so any URL
 * sub-vocabulary enumerated in the table would be a surface this migration was never asked to
 * design.
 */
export type PromotionApplicationOperation = 'applyPromotions' | 'salePriceDetails';

/**
 * How this adapter obtains the read-only order view it hands to the composed operation.
 *
 * ★ THE SEAM EXISTS BECAUSE MATERIALISING AN ORDER VIEW IS NOT A HANDLER-TIER ACT. See the module
 * header for the three independent reasons - a ported `Sku` entity, a ported `PriceGroup` entity and
 * a branded `CurrencyCode` - and for why `RequestScope` publishes no loader for any of them. An
 * admission either vouches for the value it was handed or REFUSES it; it never fabricates a member,
 * never defaults an absent price to zero, and never mutates what it admits.
 *
 * Receiving the whole decoded request rather than just its `order` member is deliberate: an
 * admission may need the envelope's correlation identifier to report precisely what it refused, and
 * narrowing the parameter later is additive whereas widening it is not.
 *
 * @param request the decoded, schema-validated request envelope for the pricing operation.
 * @returns the order view to price.
 * @throws {@link OrderViewAdmissionError} when the value cannot be vouched for. Refusal is a normal
 *   outcome of an unvouchable input, and is mapped to a client-shaped response by the handler.
 */
export type OrderViewAdmission = (request: ApplyPromotionsRequest) => Promise<OrderView>;

/**
 * Everything this handler is parameterised over, so that the clock, the order view and the composed
 * operation are all injectable and observable without patching module state.
 *
 * Every member is optional and every one may be passed as an explicit `undefined`, because
 * `exactOptionalPropertyTypes` is enabled and a suite overriding one member must not be forced to
 * restate the rest. `createPromotionApplicationHandler({})` is the production configuration.
 */
export interface PromotionApplicationDependencies {
  /**
   * The composition root accessor. Defaults to `bootstrapCompositionRoot` from `./bootstrap.js` -
   * the idempotent, memoized async initializer, awaited INSIDE the handler and never at module top
   * level.
   *
   * A suite substitutes a function returning a root built over a fake executor, which is how the
   * COMPOSED OPERATION becomes observable: the ordering assertion drives
   * `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions` through this member, and the
   * INJECTED CLOCK reaches the graph the same way, because `CompositionRoot.createRequestScope`
   * accepts `now` and publishes it as `RequestScope.now`.
   */
  readonly compositionRoot?: (() => Promise<CompositionRoot>) | undefined;

  /**
   * How the order view is obtained. Defaults to {@link admitMaterializedOrderView}.
   *
   * This is the member a suite supplies a golden fixture through, and the member a strangler-fig
   * proxy that already holds a materialised aggregate supplies its own resolution through.
   */
  readonly admitOrderView?: OrderViewAdmission | undefined;

  /**
   * Where structured diagnostics are written. Defaults to the module-level logger, which emits JSON
   * to stdout and is captured natively by the platform. No logging library is introduced.
   */
  readonly logger?: Logger | undefined;

  /**
   * THE INJECTED CLOCK, under an explicit UTC POLICY.
   *
   * ★ ABSENT BY DEFAULT, AND THE ABSENCE IS THE PRODUCTION PATH RATHER THAN AN OMISSION. When no
   * clock is supplied this handler passes no `now` to `CompositionRoot.createRequestScope`, and the
   * scope then reads the wall clock ONCE at scope creation and publishes it as `RequestScope.now` -
   * so every date comparison in one invocation resolves against the SAME instant rather than a
   * drifting one. That is why there is no `new Date()` anywhere in this file: the instant is bound by
   * the tier that owns the request graph, and this adapter only observes it.
   *
   * A `Date` IS an absolute instant, so UTC is a property of the value and the policy is discharged
   * by threading one rather than by formatting anything - every rendering on the response body uses
   * `toISOString()`, which is UTC by definition. Threading it is what makes the mandated widening
   * `PromotionPeriod.isCurrent(now: Date)` [model/entity/PromotionPeriod.cfc:L78] deterministic,
   * along with the promotion-period window and the sale-price expiration comparison. That widening is
   * ALREADY ALLOCATED to the entities tier and no second widening is introduced here.
   *
   * ★ THE INSTANT IS NEVER READ FROM THE REQUEST PAYLOAD, deliberately. A caller choosing the
   * evaluation instant could walk an expired promotion period back inside its window, so the payload
   * carries no such member and none may be added.
   */
  readonly clock?: (() => Date) | undefined;
}

/**
 * The handler signature this module exports.
 *
 * `context` is optional so the function is directly callable without fabricating a platform context
 * object; the platform always supplies one and passes a third callback argument that this handler,
 * being `async`, deliberately ignores.
 */
export type PromotionApplicationHandler = (
  event: APIGatewayProxyEvent,
  context?: Context,
) => Promise<APIGatewayProxyResult>;

/**
 * The members every decoded request carries, whichever operation it selected.
 *
 * Not exported: consumers work with {@link PromotionApplicationRequest} and the two arms below. This
 * interface exists only so the three shared members are declared once and cannot drift.
 */
interface PromotionApplicationRequestEnvelope {
  /**
   * The caller-supplied idempotency key. See {@link IDEMPOTENCY_KEY_PATTERN} for what it is required
   * to look like and SECTION 2, obligation (2), for why it is required at all.
   */
  readonly idempotencyKey: string;

  /** Correlation identifier for this invocation, already reduced to a safe token. */
  readonly requestId: string;

  /**
   * The authenticated account, as an OPAQUE identifier, or absent for the logged-out arm.
   *
   * Absence is a STATE, not a missing value: [model/service/PriceGroupService.cfc:L262-L268]
   * branches on the logged-in flag and only then reads the account, and the else arm at [:L265-L266]
   * returns the SKU's own price. `RequestScopeInput.accountID` carries exactly this and nothing else,
   * so omitting it IS that else arm. The out-of-scope Account entity is never dereferenced, never
   * imported and never constructed.
   */
  readonly accountID?: string;
}

/**
 * A request for the composed price-group-then-promotion operation.
 *
 * `order` is `unknown` on purpose. A schema can prove the envelope's own members and can prove that
 * an `order` member is PRESENT, but it cannot prove that an order view's entity-bearing members are
 * ported entities - so the envelope carries the value forward unexamined and
 * {@link OrderViewAdmission} is the single place that decides whether it may be vouched for. Typing it
 * `unknown` rather than a permissive object shape is what forces that decision to be made somewhere
 * explicit instead of dissolving into optional members nobody checks.
 */
export interface ApplyPromotionsRequest extends PromotionApplicationRequestEnvelope {
  readonly operation: 'applyPromotions';

  /** The order to price. Stated as a value; its absence is refused by the admission. */
  readonly order?: unknown;
}

/**
 * A request for `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022].
 *
 * `productID` is REQUIRED on this arm rather than optional across both, which is what removes the
 * otherwise-unreachable "selected this operation but sent no product" branch from the dispatcher: the
 * discriminated envelope schema refuses such a payload with a member path before it is ever decoded.
 */
export interface SalePriceDetailsRequest extends PromotionApplicationRequestEnvelope {
  readonly operation: 'salePriceDetails';

  /** The product whose SKUs' sale-price details are wanted. An opaque identifier. */
  readonly productID: string;
}

/** The decoded request, discriminated on the operation the payload selected. */
export type PromotionApplicationRequest = ApplyPromotionsRequest | SalePriceDetailsRequest;

/**
 * Raised when an order view cannot be vouched for.
 *
 * A named class so the handler can recognise a refusal by `instanceof` and report it as a
 * client-shaped rejection, while anything else that escapes the composed operation stays an
 * unrecognised server-shaped failure. `reason` and `fields` carry only a closed literal and a set of
 * member PATHS - never a submitted value, never a driver message, never a SQL fragment - because a
 * refusal is not a place to echo input back.
 */
export class OrderViewAdmissionError extends Error {
  /** The closed reason `./errorMapper.js` owns the wording for. */
  public readonly reason: 'unsupportedBodyShape' | 'unusableRequestInput';

  /** Dotted paths within the submitted document, and the constraint each failed. */
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
 * A FLAT projection of the engine's intent union, and flat on purpose: every member of that union is
 * declared on every variant - the inapplicable ones as `?: never` - so each can be read once and
 * omitted when absent, with no discrimination and therefore no arm left unhandled.
 *
 * `discountAmount` is a DECIMAL STRING and never a JSON number. `Money` is the sole arithmetic
 * surface in this port and IEEE-754 has no place in a monetary value, so the amount crosses the wire
 * through `Money`'s own presentation surface. See {@link renderMonetaryAmount} for which of the two
 * renderings is used and why.
 *
 * An absent member is OMITTED rather than rendered as `null` or `0`. `exactOptionalPropertyTypes`
 * makes that distinction expressible, and it is load-bearing: substituting `0` for an absent amount
 * would state a discount the engine never decided.
 */
export interface PromotionAppliedIntentDocument {
  /** `add` | `update` | `remove`, exactly as the engine decided it. */
  readonly operation: string;

  /**
   * `order` | `orderItem` | `orderFulfillment` - the three values the engine actually writes
   * [model/service/PromotionService.cfc:L402, L448, L531]. The union is NOT widened here and no
   * fourth applied type is invented.
   */
  readonly appliedType: string;

  /** The promotion, as an opaque identifier. Absent only on a removal that names no promotion. */
  readonly promotionID?: string;

  /** Opaque target identifier at order level [model/entity/PromotionApplied.cfc:L61]. */
  readonly orderID?: string;

  /** Opaque target identifier at item level [model/entity/PromotionApplied.cfc:L58]. */
  readonly orderItemID?: string;

  /** Opaque target identifier at fulfillment level [model/entity/PromotionApplied.cfc:L59]. */
  readonly orderFulfillmentID?: string;

  /** The persisted row a removal detaches. Opaque; carried, never parsed. */
  readonly promotionAppliedID?: string;

  /** The discount, as a decimal string. Forbidden on a removal, so absent there. */
  readonly discountAmount?: string;
}

/**
 * One price-group intent, rendered for the wire.
 *
 * Published alongside the promotion intents rather than withheld, because the two passes ran as ONE
 * operation and reporting only half of what it decided would hide the price that the promotion pass
 * then discounted from. `price` is what [model/service/PriceGroupService.cfc:L370] wrote and
 * `priceGroupID` identifies what [:L371] wrote - the member the L241 discriminator reads.
 *
 * ★ THIS IS A REPORT OF WHAT PASS ONE DECIDED, NOT AN INDEPENDENTLY CALLABLE PRICE-GROUP PASS.
 * `updateOrderAmountsWithPriceGroups` is not re-exposed anywhere in this module and cannot be
 * reached through it; the only route to either pass is the one composed operation.
 */
export interface PriceGroupAppliedIntentDocument {
  /** The order item, as an opaque identifier. */
  readonly orderItemID: string;

  /** The price pass one chose, as a decimal string. */
  readonly price: string;

  /** The winning price group, as an opaque identifier. */
  readonly priceGroupID: string;
}

/**
 * One SKU's sale-price detail, rendered for the wire.
 *
 * Mirrors `SalePriceDetail` from `../domain/ports/promotionRepository.js` member for member, with
 * money as decimal strings and the expiration instant as an ISO-8601 string in UTC. Optional members
 * are OMITTED when absent, never coerced: `originalPrice` and `roundingRuleID` are genuinely
 * optional on the port, and an absent `salePriceExpirationDateTime` means the sale does not expire
 * rather than that it expired at the epoch.
 */
export interface SalePriceDetailDocument {
  /** Opaque SKU identifier. */
  readonly skuID: string;

  /** Which level of the cascade won. */
  readonly discountLevel: string;

  /** How the sale price was derived. */
  readonly salePriceDiscountType: string;

  /** The sale price, as a decimal string. */
  readonly salePrice: string;

  /** The promotion, as an opaque identifier. */
  readonly promotionID: string;

  /** The undiscounted price, when the port carried one. */
  readonly originalPrice?: string;

  /** The rounding rule applied, as an opaque identifier, when one was applied. */
  readonly roundingRuleID?: string;

  /** When the sale price stops applying, ISO-8601 in UTC. Omitted when it does not expire. */
  readonly salePriceExpirationDateTime?: string;
}

/**
 * The success body this handler returns.
 *
 * `idempotencyKey` and `requestId` are echoed so a caller can join a retried invocation to the
 * decision it already received, and an operator can join either to the log stream. `evaluatedAt` is
 * the instant the request scope bound - `RequestScope.now` - rendered ISO-8601 in UTC, which is what
 * makes the promotion-period window [model/entity/PromotionPeriod.cfc:L78] and the sale-price
 * expiration comparison auditable after the fact.
 */
export interface PromotionApplicationResponseBody {
  /** Which operation ran. */
  readonly operation: PromotionApplicationOperation;

  /** Echo of the caller's idempotency key. */
  readonly idempotencyKey: string;

  /** Echo of the correlation identifier, as a safe token. */
  readonly requestId: string;

  /** The single instant every date comparison in this invocation resolved against, UTC. */
  readonly evaluatedAt: string;

  /** What the promotion pass decided. Empty is a valid - and for a return order, correct - result. */
  readonly promotionIntents?: readonly PromotionAppliedIntentDocument[];

  /** What the price-group pass decided, reported for completeness. */
  readonly priceGroupIntents?: readonly PriceGroupAppliedIntentDocument[];

  /** Sale-price details keyed by opaque SKU identifier. Present only for `salePriceDetails`. */
  readonly salePriceDetails?: Readonly<Record<string, SalePriceDetailDocument>>;
}

// ===========================================================================
// SECTION 2 - THE EXECUTION-MODEL OBLIGATIONS
//
// There is no ambient `cftransaction` on this runtime and a retry is a platform
// fact rather than an exceptional event, so the three obligations below are
// discharged explicitly. All three are stated as CORRECTNESS and EXPLICITNESS.
// No throughput, latency, batch-rate or capacity figure appears in any of them,
// and the numeric bounds are SAFETY bounds, never performance targets.
//
// (1) EXPLICIT BOUNDS. {@link ORDER_DOCUMENT_LIMITS} caps how much work one
//     invocation will accept. Exceeding a bound is REJECTED through
//     `./errorMapper.js` with the offending member's path; the document is NEVER
//     silently truncated, because a truncated order is priced against items the
//     caller did not send and the caller is never told.
//
// (2) IDEMPOTENCY ON RETRY. A caller-supplied {@link PromotionApplicationRequest.idempotencyKey}
//     is REQUIRED and is echoed on the response. What makes honouring it
//     inexpensive here is a property of the operation rather than a mechanism this
//     adapter adds: BOTH passes RETURN INTENTS AND MUTATE NOTHING - the
//     anti-corruption inversion in `../domain/views/orderView.js` - so this
//     entrypoint performs NO durable write at all, and re-running it with the same
//     document and the same bound instant yields the same decision without a second
//     row anywhere. The key therefore serves the party that DOES persist: it
//     travels with the intents so a persisting consumer can recognise a replay,
//     and it is the join key an operator uses to prove two invocations decided the
//     same thing. Nothing here caches a response under it, because caching a
//     decision would make a warm container answer from one request inside another -
//     exactly what the per-request scope exists to prevent.
//
// (3) THE COMPENSATION STORY, WRITTEN OUT. A partial failure of THIS entrypoint
//     leaves NOTHING BEHIND TO COMPENSATE FOR, and that is a consequence of (2):
//     an invocation that fails at admission, inside either pass, or during
//     serialisation has written no row, detached no row, and altered no order,
//     so there is no half-applied discount to unwind and no reconciliation to
//     schedule. The caller's remedy is to retry with the same idempotency key.
//     The compensation obligation is REAL but it belongs to whoever persists the
//     intents: the promotion pass emits a COMPLETE set of `add`, `update` and
//     `remove` instructions for the order it was given - which is why the legacy's
//     three backwards clear-out loops [model/service/PromotionService.cfc:L64-L80]
//     are replaced by intents rather than reproduced - so a persisting consumer
//     reconciles the stored set against the emitted set in one transaction of its
//     own and never applies a partial set. If it cannot complete that transaction
//     it discards the whole set and retries the invocation; discarding is safe
//     precisely because this entrypoint holds no state to discard.
// ===========================================================================

/**
 * How much work one invocation will accept.
 *
 * SAFETY BOUNDS, NOT PERFORMANCE TARGETS, and every one of them is a bound on a CALLER-SUPPLIED
 * quantity. The legacy engine's own bulk hazards sit behind other capabilities - the per-SKU save
 * loop [model/service/ProductService.cfc:L216-L233] and the cartesian-product odometer whose
 * combination count is the product of every option group's size and is therefore unbounded by
 * construction [model/service/SkuService.cfc:L109-L121] - but the obligation is the same wherever a
 * caller decides the size of the work: state the bound, refuse past it, and never truncate.
 *
 * The two identifier lengths are SCHEMA-DERIVED rather than chosen: `productID`
 * [model/entity/Product.cfc] and every other `fieldtype="id"` column in the `Sw*` schema is declared
 * `ormtype="string" length="32"`, so a longer value cannot name a row and is refused before it can
 * reach a statement builder.
 *
 * Frozen, because this object is exported and a caller holding the reference must not be able to
 * reshape the bound a warm container enforces.
 */
export const ORDER_DOCUMENT_LIMITS: Readonly<{
  readonly maximumOrderItems: number;
  readonly maximumOrderFulfillments: number;
  readonly maximumIdempotencyKeyLength: number;
  readonly maximumIdentifierLength: number;
}> = Object.freeze({
  maximumOrderItems: 500,
  maximumOrderFulfillments: 100,
  maximumIdempotencyKeyLength: 128,
  maximumIdentifierLength: 32,
});

/**
 * The shape an idempotency key must take.
 *
 * Letters, digits, `_`, `.` and `-` only. Bounded and character-filtered for the same reason
 * `./errorMapper.js` filters a classifier token and `./router.js` bounds a route diagnostic: the
 * value is CALLER-AUTHORED, it is echoed into a response body and written to a log line, and
 * excluding whitespace, quotes and punctuation is what makes it structurally impossible for a
 * sentence, a SQL fragment or a credential to pass itself off as a correlation token. No `g` flag,
 * so the regular expression carries no `lastIndex` state between calls.
 */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;

/** The same shape, applied to the platform-supplied correlation identifier. */
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

/** Substituted when a correlation identifier is absent or is not shaped like a token. */
const UNIDENTIFIED_REQUEST = 'unidentifiedRequest';

/**
 * How many field-level complaints one refusal publishes.
 *
 * A bound rather than the whole set, matching the bound `./errorMapper.js` already applies to a
 * thrown validation failure: an unbounded complaint list is work a caller can ask for, and the
 * complaints past the first several add nothing an operator cannot get from the log stream under the
 * same correlation identifier.
 */
const MAX_PUBLISHED_ADMISSION_ISSUES = 10;

// ===========================================================================
// SECTION 3 - REQUEST ENVELOPE VALIDATION
//
// `zod` validates the ENVELOPE: the operation selector, the idempotency key, the
// opaque identifiers and the safety bounds. It is exactly the right tool there -
// plain data, a closed discriminant and issue paths this handler can publish
// verbatim.
//
// ★ IT IS DELIBERATELY NOT USED TO RECONSTRUCT THE ORDER VIEW, and the reason is
// a correctness one rather than a stylistic one. `z.object` returns a NEW object
// and STRIPS every key its shape does not declare, so validating an order document
// through it and handing the RESULT to the engine would mean one forgotten member -
// `subtotalAfterItemDiscounts`, say, which the order-level branch reads at
// [model/service/PromotionService.cfc:L417] - silently arriving as `undefined`
// inside a money calculation. `../domain/views/orderItemView.js` also assigns the
// construction of the view to "whatever constructs the view", and that is not this
// tier. So the order view is VOUCHED FOR AND HANDED ON UNTOUCHED - no key
// stripped, no member fabricated, no identity disturbed - by SECTION 4, which
// reports member paths of its own.
//
// No validation rule is invented for `PromotionQualifier`, `PromotionApplied` or
// `PromotionAccount`. Those three deliberately have NO file under
// `model/validation/` - unlike `Promotion.json`, `PromotionCode.json`,
// `PromotionReward.json` and `PromotionPeriod.json`, which exist and are ported by
// the tier that owns them - and an absence that the source chose is not a gap to
// fill in here.
//
// Nothing is exposed for `PromotionAccount` at all. It is INERT in this slice: it
// has no validation file, no service method references it, and
// `model/service/PromotionService.cfc` never touches it.
// ===========================================================================

/**
 * An opaque `Sw*` identifier as it may appear on the wire.
 *
 * Bounded by the schema's own `length="32"` declaration rather than by a number chosen here, and
 * required to be non-empty because an empty identifier names no row. CARRIED, NEVER PARSED: no
 * meaning is read out of the characters.
 */
const OPAQUE_IDENTIFIER = z
  .string()
  .min(1, { message: 'must not be empty' })
  .max(ORDER_DOCUMENT_LIMITS.maximumIdentifierLength, {
    message: 'must not be longer than the identifier column it names',
  });

/**
 * The four address members the zone evaluator compares.
 *
 * Typed `keyof ShippingAddressView` rather than as bare strings, so a member renamed on the view
 * breaks this list at compile time instead of turning its probe into a silent no-op. These are exactly
 * the four the legacy compares, in the order it compares them: postal code
 * [model/service/AddressService.cfc:L63], city [:L66], state code [:L69], country code [:L72]. Each
 * is skipped when the ZONE LOCATION leaves it unset, which is why every one of them is nullable on
 * both sides.
 */
const ADDRESS_COMPARISON_MEMBERS: readonly (keyof ShippingAddressView)[] = [
  'postalCode',
  'city',
  'stateCode',
  'countryCode',
];

/** The idempotency key, bounded and character-filtered. See {@link IDEMPOTENCY_KEY_PATTERN}. */
const IDEMPOTENCY_KEY = z
  .string()
  .min(1, { message: 'must not be empty' })
  .max(ORDER_DOCUMENT_LIMITS.maximumIdempotencyKeyLength, {
    message: 'must not be longer than the published bound',
  })
  .regex(IDEMPOTENCY_KEY_PATTERN, {
    message: 'must contain only letters, digits, underscore, dot or hyphen',
  });

/**
 * The envelope for the composed price-group-then-promotion operation.
 *
 * The `order` member is deliberately ABSENT from this shape - see the section note - and is read off
 * the raw document and carried forward as `unknown`.
 */
const APPLY_PROMOTIONS_ENVELOPE = z.object({
  operation: z.literal('applyPromotions'),
  idempotencyKey: IDEMPOTENCY_KEY,
  accountID: OPAQUE_IDENTIFIER.optional(),
});

/**
 * The envelope for `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022].
 *
 * `productID` is a plain string on the legacy signature and stays one, so this operation needs
 * nothing materialised.
 */
const SALE_PRICE_DETAILS_ENVELOPE = z.object({
  operation: z.literal('salePriceDetails'),
  idempotencyKey: IDEMPOTENCY_KEY,
  productID: OPAQUE_IDENTIFIER,
  accountID: OPAQUE_IDENTIFIER.optional(),
});

/**
 * The request envelope, discriminated on the operation.
 *
 * A discriminated union rather than one permissive shape with everything optional: it makes "a
 * `salePriceDetails` request without a `productID`" a validation failure with a member path rather
 * than a value the handler has to re-check later, and it makes adding a third operation without
 * giving it an envelope a compile error.
 */
const REQUEST_ENVELOPE_SCHEMA = z.discriminatedUnion('operation', [
  APPLY_PROMOTIONS_ENVELOPE,
  SALE_PRICE_DETAILS_ENVELOPE,
]);

// ===========================================================================
// SECTION 4 - ORDER-VIEW ADMISSION
//
// The single place that decides whether a value may be handed to the composed
// operation as an `OrderView`. It VOUCHES; it does not build, and it does not
// modify. Every probe below is a member the two passes actually read, and the
// citation beside it is where they read it.
//
// ★ WHAT THIS PROVES AND WHAT IT DOES NOT - stated plainly rather than overclaimed.
// It proves that every member the engine reads is PRESENT and of the right KIND,
// including that the three entity-bearing members expose the methods the engine
// calls on them. It does NOT prove that `sku` was produced by
// `src/repositories/mysql/mysqlSkuRepository.ts`, nor that `price` is an instance
// of the `Money` class - neither class is importable here, because a handler
// constructs no entity and `Money` is imported for its TYPE alone so that nothing
// type-only survives into the bundle. A structural admission is therefore what is
// achievable at this boundary, and it is the honest name for it.
//
// ★ AND THE CONSEQUENCE IS DELIBERATE: A PLAIN JSON PROJECTION IS REFUSED. A wire
// document carries `sku` as an object with no methods and `price` as a number or a
// string, so it fails these probes and is rejected with the member paths that
// failed. That is the SAFE outcome and the correct one: the alternative - accepting
// it and letting the engine read `undefined` out of a missing accessor - would put a
// silent zero into a discount calculation, and a zero price sells product for free
// [model/entity/Sku.cfc:L269-L273 has no `else` and no fallback for exactly this
// reason]. A caller holding a wire document materialises it on the tier that owns
// hydration - `src/repositories/mysql/**`, AAP transformation rule T3 - and hands
// the result in through {@link PromotionApplicationDependencies.admitOrderView}.
// ===========================================================================

/** A non-null, non-array object. The only shape any probe below descends into. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Which of `methodNames` the value does NOT expose as a callable.
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
 * `toDecimalString` is how a monetary value reaches persistence at full precision and how it reaches
 * the wire here; `toFixed2` is the two-decimal presentation form; `compare` is how the engine
 * expresses the source's `> 0` tests [model/service/PromotionService.cfc:L257, L378, L424] through
 * the value object, since `Money` publishes no `isPositive` and no `isZero`.
 */
const MONEY_ACCESSORS: readonly string[] = ['toDecimalString', 'toFixed2', 'compare'];

/**
 * The `Sku` accessors the two passes reach through `OrderItemView.sku`.
 *
 * Every one is a call site, not a guess: sale-price seeding reads `getSalePriceDetails()` and
 * `getPrice()` [model/service/PromotionService.cfc:L146, L148, L150]; reward matching reads
 * `getSkuID()` and walks `getProduct()` [:L808-L818]; qualifier membership tests `getOptions()`
 * [:L885, L914].
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
 * [model/service/PromotionService.cfc:L241], which compares ENTITIES, so an identifier accessor is
 * the minimum a candidate must expose to be recognisable as one.
 */
const PRICE_GROUP_ACCESSORS: readonly string[] = ['getPriceGroupID'];

/** One complaint, recorded against the member path that produced it. */
function recordIssue(issues: MappedFieldIssue[], path: string, message: string): void {
  if (issues.length < MAX_PUBLISHED_ADMISSION_ISSUES) {
    issues.push({ path, message });
  }
}

/** A required non-empty string member. */
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

/** A required finite numeric COUNT. Never money - counts are the only plain numbers on these views. */
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

/** A required monetary member, probed against {@link MONEY_ACCESSORS}. */
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

/** A required nested object carrying exactly the identifier members named. */
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

/** A required array member, bounded. Returns the entries so a caller can descend into them. */
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
    // OBLIGATION (1) FROM SECTION 2: the document is REFUSED, never truncated. The bound is
    // published on ORDER_DOCUMENT_LIMITS so a caller can split its own work deliberately rather
    // than discovering a silently shortened result.
    recordIssue(issues, path, `must not carry more than ${String(maximumLength)} entries`);
  }
  return value;
}

/**
 * A member that must be PRESENT and is either a materialised entity or an explicit `undefined`.
 *
 * ★ PRESENCE AND ABSENCE ARE DIFFERENT REQUESTS, AND BOTH VIEWS SAY SO. `exactOptionalPropertyTypes`
 * is enabled and `../domain/views/orderItemView.js` records the rule it imposes: a value the legacy
 * schema permits to be null is a REQUIRED member whose type includes `undefined`, never an optional
 * `?:` member, so "the producer must state an absence rather than omit it". This probe enforces
 * exactly that, which is why it tests `Object.hasOwn` rather than `!== undefined`.
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
    // The stated-absence arm. For `appliedPriceGroup` this is precisely the `isNull(...)` arm of
    // [model/service/PromotionService.cfc:L241] - the item discounts from `getPrice()` with no
    // correction term - and it is a NORMAL state, because the write at
    // [model/service/PriceGroupService.cfc:L370-L371] is gated by [:L365] and [:L369] and may
    // legitimately decline for every item. It is NEVER defaulted to a fabricated price group:
    // inventing one would push a price-group-free item down the `getSkuPrice()` arm and apply a
    // correction term that has nothing to correct.
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

/** A member that must be present and is either a string or an explicit `undefined`. */
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
 * A type predicate rather than a `void` collector, so the shape this vouches for is stated in the
 * signature and the compiler ties it to `../domain/views/orderItemView.js`: a member renamed there
 * leaves this function narrowing to a shape it no longer proves, which is exactly the kind of drift a
 * structural admission must not develop silently.
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

  // BOTH price bases and BOTH extended prices, because the L241 discriminator needs all four:
  // `getPrice()` on the first arm [:L244]; `getSkuPrice()` plus
  // `getExtendedSkuPrice() - getExtendedPrice()` on the second [:L249, L252].
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

  // The owning fulfillment, as an opaque identifier only
  // [model/entity/PromotionApplied.cfc:L59].
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
 * ★★ THE RESTRICTIVE-versus-PERMISSIVE EMPTY-COLLECTION DISTINCTION, AND WHY IT IS A MONEY BUG TO
 * COLLAPSE THEM. `address` below is the value that eventually reaches
 * `AddressZoneEvaluator.isAddressInZone` (`../domain/ports/addressZoneEvaluator.js`), a LIVE port
 * reached from `getShippingMethodOptionsDiscountAmountDetails`
 * [model/service/PromotionService.cfc:L1032] on the services tier. That evaluator is RESTRICTIVE BY
 * CONSTRUCTION [model/service/AddressService.cfc:L57-L82]: `var addressInZone = false;` [:L58], a
 * loop over `getAddressZoneLocations()` [:L60], and `return addressInZone;` [:L81] - so an EMPTY
 * locations collection means the loop body never runs and the answer is FALSE. EMPTY MEANS NOT IN
 * ZONE.
 *
 * The reward and qualifier include/exclude collections take the OPPOSITE default: an empty
 * collection means NO RESTRICTION, which is why every one of those gates is written
 * `arrayLen(collection) && !collection.hasX(...)` - the length test is what makes emptiness
 * permissive. Two collections, two opposite empty-set meanings, both deciding whether a discount
 * applies. Collapsing them - treating an empty zone as "unrestricted", or an empty include list as
 * "matches nothing" - changes the amount a customer is charged in opposite directions. Neither
 * default is applied here: this probe establishes only that `address` was STATED, and every zone and
 * membership decision stays on the tier that owns it.
 *
 * A type predicate for the same reason {@link probeOrderItem} is one.
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

  // ABSENT IS A REAL STATE, not a missing value: the shipping-method gate at
  // [model/service/PromotionService.cfc:L701] tests `isNull(orderFulfillment.getShippingMethod())`
  // explicitly, so a pickup fulfillment states `undefined` here.
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
  // trap. Each of the four comparison members is nullable in the legacy schema, and the evaluator
  // SKIPS a null one [model/service/AddressService.cfc:L63, L66, L69, L72] rather than failing on
  // it, so all four are `string | undefined` and all four must be stated.
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
        // [model/service/PromotionService.cfc:L703] reads `getAddress().getNewFlag()`, so the flag is
        // a definite boolean rather than an optional one.
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
 * A genuine TypeScript type predicate over `unknown`, narrowed by property probes - never a cast, no
 * `as`, no non-null assertion and no `@ts-expect-error`. The value is handed on EXACTLY as received;
 * this function reads and never writes.
 *
 * @param value the candidate, of genuinely unknown type.
 * @param issues accumulator the caller supplies; complaints are appended in probe order.
 * @returns whether the value may be vouched for as an {@link OrderView}.
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

  // The order-type gate. [model/service/PromotionService.cfc:L61] and [:L542] BOTH read
  // `getOrderType().getSystemCode()`, and the two conditionals are SEQUENTIAL rather than
  // else-if - an exchange order runs the sales branch and then enters the empty return branch - so
  // this member is read whichever branch applies.
  probeNestedIdentifiers(value, 'orderType', 'order.orderType', ['systemCode'], issues);

  // The out-of-scope Account, reduced to an opaque identifier and nothing else. Stated absence is
  // the logged-out arm [model/service/PriceGroupService.cfc:L265-L266].
  probeNullableString(value, 'accountID', 'order.accountID', issues);

  // The comma-delimited promotion-code list. It stays a STRING for signature parity: the legacy
  // binds it with `cfqueryparam ... list="true"` [model/dao/PromotionDAO.cfc], so the list form is
  // load-bearing and must not be modernised into an array at this boundary.
  if (typeof value['promotionCodeList'] !== 'string') {
    recordIssue(issues, 'order.promotionCodeList', 'must be a comma-delimited string');
  }

  // A count [model/entity/Order.cfc:L624-L631], read at
  // [model/service/PromotionService.cfc:L785] as the seed for the qualification count.
  probeCount(value, 'totalSaleQuantity', 'order.totalSaleQuantity', issues);

  // The three order-level monetary members the engine reads: the qualifier minimum and maximum
  // gates test `getSubtotal()` [model/service/PromotionService.cfc:L648, L650]; the order-level
  // reward branch reads `getSubtotalAfterItemDiscounts()` [:L417]; and the fulfillment total is the
  // order-level base the same branch measures against.
  probeMoney(value, 'subtotal', 'order.subtotal', issues);
  probeMoney(value, 'subtotalAfterItemDiscounts', 'order.subtotalAfterItemDiscounts', issues);
  probeMoney(
    value,
    'fulfillmentChargeAfterDiscountTotal',
    'order.fulfillmentChargeAfterDiscountTotal',
    issues,
  );

  // The branded three-character currency code [model/entity/Order.cfc:L54
  // `ormtype="string" length="3"`]. Probed for the column's own constraint and nothing more: no
  // currency is minted here, and no code is normalised or defaulted.
  const currencyCode = value['currencyCode'];
  if (typeof currencyCode !== 'string' || currencyCode.length !== 3) {
    recordIssue(issues, 'order.currencyCode', 'must be a three-character currency code');
  }

  // Order-level applied promotions. Read at [model/service/PromotionService.cfc:L427] as the
  // first-writer-wins test, and never removed from here - the legacy's three backwards clear-out
  // loops [:L64-L80] are replaced by emitted intents, so this collection is read-only.
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

  // Every entry is probed, not just the first failure, so one refusal reports every unusable member
  // the caller can fix in a single edit. The per-entry verdicts are combined rather than discarded:
  // `issues.length` alone would also be sound, but AND-ing the predicates is what ties this
  // function's own narrowing to the two entry shapes it descends into.
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
 * The production admission: vouch for the order view the request carried, or refuse it.
 *
 * Asynchronous because {@link OrderViewAdmission} is - a strangler-fig proxy substituting its own
 * resolution will reach a hydration tier, and forcing that shape on the port is what keeps this one
 * substitutable. This implementation awaits nothing, which is the whole point: it performs no read,
 * no query and no construction.
 *
 * @throws {@link OrderViewAdmissionError} with the member paths that failed.
 */
function admitMaterializedOrderView(request: ApplyPromotionsRequest): Promise<OrderView> {
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

  // Handed on UNTOUCHED - the same object, with every member the caller supplied and no member this
  // adapter added. Nothing here freezes, copies, sorts or reorders it: the reward iteration order is
  // legacy-non-deterministic by construction [model/dao/PromotionDAO.cfc:L51-L132 declares no
  // `ORDER BY`] and the collections the engine reads must arrive exactly as the caller composed
  // them.
  return Promise.resolve(candidate);
}

// ===========================================================================
// SECTION 5 - SERIALISATION
//
// Rendering only. No arithmetic, no aggregation, no re-ranking and no filtering:
// the intents leave in the order and the quantity the engine emitted them, and the
// single best discount per order item that [model/service/PromotionService.cfc:L524-L537]
// applies is the single intent this boundary reports for that item.
// ===========================================================================

/**
 * One monetary value, rendered for the wire.
 *
 * `toDecimalString()` AND NOT `toFixed2()`, and the difference is money. `Money.toDecimalString`
 * renders every significant digit; `toFixed2` applies the CFML `'0.00'` mask and therefore ROUNDS. An
 * intent is a write-side instruction destined for a `big_decimal` column - `discountAmount`
 * [model/entity/PromotionApplied.cfc:L51] and `amount` [model/entity/PriceGroupRate.cfc] are both
 * declared `big_decimal` - and a `big_decimal` column is precisely one that declines to round on the
 * caller's behalf. The legacy engine did not round on the way to the database either: its
 * `numberFormat(discountAmount, "0.00")` [model/service/PromotionService.cfc:L1017] is
 * return-value PRESENTATION at the end of a calculating function, not a persistence step.
 *
 * `Money`'s own presentation surface is the only route. There is no `Number()`, no `parseFloat`, no
 * `toFixed` on a raw number and no arithmetic of any kind here, and `Money.zero` is never used as a
 * fallback: an absent amount is an OMITTED member, because stating zero would state a discount the
 * engine never decided.
 */
function renderMonetaryAmount(amount: Money): string {
  return amount.toDecimalString();
}

/** The promotion-intent union, reached structurally so no additional module is imported for it. */
type PromotionIntent = OrderPricingResult['promotionIntents'][number];

/**
 * One applied-promotion intent, rendered flat.
 *
 * FLAT AND TOTAL, with no discrimination and therefore no unhandled arm. Every member of the intent
 * union is declared on every variant - the inapplicable ones as `?: never` - so each is read once,
 * yields `T | undefined`, and is omitted when absent. `discountAmount` is forbidden on a removal and
 * `promotionAppliedID` is present only on the removal of a persisted row, and both facts fall out of
 * that reading rather than needing a branch.
 *
 * The conditional spreads are what `exactOptionalPropertyTypes` requires: an omitted key and a key
 * written as `undefined` are different states under it, and this renders the former.
 *
 * `appliedType` is passed through as the engine set it - `orderFulfillment`
 * [model/service/PromotionService.cfc:L402], `order` [:L448] or `orderItem` [:L531]. Those are the
 * three values the engine writes; the union is NOT widened and no fourth type is invented.
 *
 * `currencyCode` is deliberately NOT rendered. LEGACY-NOTE
 * [model/entity/PromotionApplied.cfc:L53]: the column exists, yet `setCurrencyCode` occurs nowhere in
 * `model/service/PromotionService.cfc`, so every row the promotion engine writes leaves it null - and
 * the intent surface declares no such member for exactly that reason. Synthesising one here would
 * write a currency the legacy engine never chose.
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
 *
 * Reports what [model/service/PriceGroupService.cfc:L370] and [:L371] decided. It does not re-expose
 * the pass: there is no member on this module through which `updateOrderAmountsWithPriceGroups` can
 * be called.
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
 * The three optional members are OMITTED when the port carried nothing, never coerced. An absent
 * `originalPrice` is not zero and an absent `salePriceExpirationDateTime` is not the epoch: the first
 * would understate a saving and the second would expire a live sale.
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
 * The exact shape `getSalePriceDetailsForProductSkus` answers with.
 *
 * Derived from the PORTED SERVICE's own signature [model/service/PromotionService.cfc:L1022] rather
 * than restated, so a drift in that return type breaks this boundary at compile time instead of
 * producing a response document that quietly stops matching what the service returns. B4 interface
 * parity is a property of `../services/promotionService.js`; this is how the wire contract stays tied
 * to it.
 */
type SalePriceDetailsResult = Awaited<
  ReturnType<PromotionService['getSalePriceDetailsForProductSkus']>
>;

/** Sale-price details, keyed by the opaque SKU identifier the query grouped on. */
function renderSalePriceDetails(
  details: SalePriceDetailsResult,
): Readonly<Record<string, SalePriceDetailDocument>> {
  const rendered: Record<string, SalePriceDetailDocument> = {};
  for (const [skuID, detail] of Object.entries(details)) {
    rendered[skuID] = renderSalePriceDetail(detail);
  }
  return rendered;
}

/**
 * The headers every response from this handler carries.
 *
 * Deliberately identical to the set `./errorMapper.js` builds, so a caller sees one content type and
 * one caching directive whether the invocation succeeded or failed. `no-store` because a priced order
 * is specific to one account, one instant and one document, and an intermediary caching it would
 * serve one customer's discount to another. Frozen, because this module is instantiated once per
 * container and shared across every invocation it serves.
 *
 * No header invents a semantic the source never had: there is no `retry-after`, no rate-limit header
 * and no cross-origin header - the target renders no user interface at all and no browser is a
 * client of it.
 */
const JSON_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/**
 * The one success status this handler returns.
 *
 * 200 and nothing else. Both operations are decisions rather than durable writes - the passes emit
 * intents and mutate nothing - so there is no resource created to report and no acceptance to
 * acknowledge. No status semantic the source never had is invented: no 201, no 202, no 401, no 403,
 * no 409, no 422 and no 429, and no retry-after, rate-limit or circuit-breaker behaviour of any kind.
 * The failure statuses are `./errorMapper.js`'s three and are not re-decided here.
 */
const SUCCESS_STATUS = 200;

/** Build the success response. */
function successResponse(body: PromotionApplicationResponseBody): APIGatewayProxyResult {
  return {
    statusCode: SUCCESS_STATUS,
    headers: JSON_RESPONSE_HEADERS,
    body: JSON.stringify(body),
  };
}

// ===========================================================================
// SECTION 6 - EVENT DECODING
//
// Everything between the platform's event and the decoded envelope. The division
// of labour `./errorMapper.js` documents is followed exactly: a failure this
// handler ESTABLISHES ITSELF - an absent body, a body that will not parse, a body
// that is not an object - is reported by NAMING a closed reason through
// `invalidRequestResponse`, while a SCHEMA failure is THROWN and recognised by
// `mapErrorToApiGatewayResponse`, which publishes the member paths and withholds
// the submitted values. No sentence is composed here; that module owns the words,
// and it is selective rather than a pass-through precisely so a driver message, a
// connection string or a SQL fragment can never reach a response body.
// ===========================================================================

/** The outcome of decoding, before schema validation is attempted. */
type EnvelopeDecoding =
  | { readonly ok: true; readonly request: PromotionApplicationRequest }
  | { readonly ok: false; readonly reason: InvalidRequestReason };

/**
 * Reduce the platform's correlation identifier to a safe token.
 *
 * The platform's own request identifier is preferred, then the event's; neither is caller-authored
 * under a proxy integration, but this handler is a function and a direct invoker can put anything in
 * either field. The value is ECHOED INTO A RESPONSE BODY by `./errorMapper.js` and written to every
 * log line, so it is held to the same bounded, character-filtered token shape `./errorMapper.js`
 * applies to a classifier and `./router.js` applies to a route diagnostic. A value that is not shaped
 * like a token is REPLACED, not truncated: a partial echo of an unexpected value is still an echo.
 */
function readCorrelationIdentifier(
  event: APIGatewayProxyEvent,
  context: Context | undefined,
): string {
  const candidates: readonly unknown[] = [context?.awsRequestId, event.requestContext?.requestId];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && SAFE_REQUEST_ID_PATTERN.test(candidate)) {
      return candidate;
    }
  }

  return UNIDENTIFIED_REQUEST;
}

/**
 * Lift the request body out of the event as text.
 *
 * `isBase64Encoded` is honoured because the platform sets it and ignoring it would turn a perfectly
 * well-formed document into an unparsable one. A body that is present but blank is treated as ABSENT,
 * which is the honest reading: whitespace is not a document.
 *
 * @returns the body text, or `undefined` when there is none.
 */
function readRequestBodyText(event: APIGatewayProxyEvent): string | undefined {
  const body = event.body;
  if (typeof body !== 'string' || body.trim().length === 0) {
    return undefined;
  }

  if (event.isBase64Encoded) {
    const decoded = Buffer.from(body, 'base64').toString('utf8');
    return decoded.trim().length === 0 ? undefined : decoded;
  }

  return body;
}

/**
 * Decode and validate the request envelope.
 *
 * The schema is invoked with `parse`, so a validation failure is THROWN as a `ZodError` and
 * `mapErrorToApiGatewayResponse` recognises it, publishes the failing member paths and the constraint
 * descriptions, and withholds every submitted value. That is deliberately not re-implemented here.
 *
 * `order` is copied across ONLY when the document actually carries the key, so that
 * {@link admitMaterializedOrderView}'s `Object.hasOwn` test distinguishes "no order was sent" from "an
 * order was sent and is unusable" and reports the two differently.
 */
function decodeRequestEnvelope(event: APIGatewayProxyEvent, requestId: string): EnvelopeDecoding {
  const text = readRequestBodyText(event);
  if (text === undefined) {
    return { ok: false, reason: 'missingRequestBody' };
  }

  let document: unknown;
  try {
    // Declared `unknown` rather than inferred, so nothing untyped escapes this statement.
    document = JSON.parse(text);
  } catch {
    // The caught value is deliberately not inspected. `./errorMapper.js` records that a `SyntaxError`
    // is NOT among its recognized shapes - this service's own code produces that shape too - so the
    // reason is one this handler STATES rather than one anybody infers.
    return { ok: false, reason: 'unparsableRequestBody' };
  }

  if (!isRecord(document)) {
    // Covers a scalar, `null` and an array. An array is a JSON document but not this document.
    return { ok: false, reason: 'unsupportedBodyShape' };
  }

  const envelope = REQUEST_ENVELOPE_SCHEMA.parse(document);
  const accountID = envelope.accountID;

  if (envelope.operation === 'salePriceDetails') {
    return {
      ok: true,
      request: {
        operation: 'salePriceDetails',
        idempotencyKey: envelope.idempotencyKey,
        requestId,
        productID: envelope.productID,
        ...(accountID === undefined ? {} : { accountID }),
      },
    };
  }

  return {
    ok: true,
    request: {
      operation: 'applyPromotions',
      idempotencyKey: envelope.idempotencyKey,
      requestId,
      ...(accountID === undefined ? {} : { accountID }),
      ...(Object.hasOwn(document, 'order') ? { order: document['order'] } : {}),
    },
  };
}

// ===========================================================================
// SECTION 7 - DISPATCH AND THE ORDERING CONSTRAINT
// ===========================================================================

/**
 * Run the operation the payload selected against one request scope.
 *
 * Separated from the factory so the ordering constraint sits in a function short enough to read whole,
 * and so a suite can observe the composed operation being invoked exactly once.
 */
async function runSelectedOperation(
  request: PromotionApplicationRequest,
  scope: RequestScope,
  admitOrderView: OrderViewAdmission,
  sink: Logger,
): Promise<PromotionApplicationResponseBody> {
  // THE INJECTED CLOCK, OBSERVED AND NOT READ. `scope.now` is the single instant this request bound;
  // there is no `new Date()` anywhere in this module. ISO-8601, hence UTC.
  const evaluatedAt = scope.now.toISOString();

  if (request.operation === 'salePriceDetails') {
    // THE ONE OTHER ALREADY-PORTED SERVICE METHOD this adapter reaches
    // [model/service/PromotionService.cfc:L1022], published on `RequestScope` through the
    // `SalePriceResolver` contract in `../domain/ports/promotionRepository.js`. Its input is a plain
    // string, so there is nothing to materialise and no order view involved.
    const details = await scope.getSalePriceDetailsForProductSkus(request.productID);

    sink.info('resolved sale-price details for a product', {
      capability: CAPABILITY,
      operation: request.operation,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      // A COUNT of what was resolved. No identifier, no price and no amount reaches a log line.
      resolvedSkuCount: Object.keys(details).length,
    });

    return {
      operation: request.operation,
      idempotencyKey: request.idempotencyKey,
      requestId: request.requestId,
      evaluatedAt,
      salePriceDetails: renderSalePriceDetails(details),
    };
  }

  // VOUCHED FOR, NEVER MINTED - see SECTION 4.
  const order = await admitOrderView(request);

  // =========================================================================
  // ★★★ THE CROSS-SERVICE EXECUTION ORDERING, DISCHARGED IN ONE CALL.
  //
  //   `PriceGroupService.updateOrderAmountsWithPriceGroups` MUST RUN BEFORE
  //   `PromotionService.updateOrderAmountsWithPromotions`.
  //
  // THE WRITER: [model/service/PriceGroupService.cfc:L370-L371] performs
  // `setPrice( priceGroupDetails.price )` and then
  // `setAppliedPriceGroup( priceGroupDetails.priceGroup )` - the second of which
  // writes EXACTLY the member the promotion pass branches on.
  //
  // THE READER: [model/service/PromotionService.cfc:L241] tests
  // `isNull(orderItem.getAppliedPriceGroup()) || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() )`.
  // A null applied group, or a reward that DOES list it as eligible, discounts from
  // `getPrice()` with NO correction term [:L244]; anything else discounts from
  // `getSkuPrice()` PLUS the correction term [:L249, L252]. Because the member is read
  // in the branch CONDITION ITSELF, the obligation holds whichever arm runs - and
  // because the write at L370/L371 is gated by [:L365] and [:L369], an item may
  // legitimately still have no applied group afterwards, which is that first arm. So the
  // price-group pass runs FIRST and UNCONDITIONALLY: "no account" and "no better rate"
  // are outcomes of the pass, never reasons to skip it.
  //
  // THIS IS ONE CALL AND NOT TWO, AND THAT IS THE ENFORCEMENT. `./bootstrap.js` composes
  // the two passes - and the projection between them that stands in for the legacy
  // in-place writes - inside a module-private function, and withholds both individual
  // passes from `RequestScope` behind `Omit<>` capability types. There is therefore no
  // member left to call in the wrong order, no `sequence`, `phase`, `runAfter`,
  // `pipeline`, `order` or `skipPriceGroups` argument anywhere on this call, and no way
  // for a later edit to this file to transpose two steps that were never two steps. In
  // the legacy the ordering held only because `model/service/OrderService.cfc` happened
  // to call the two services in sequence at [:L129] and [:L132], having declared them
  // adjacently at [:L60] and [:L61]; that component is out of scope and its accidental
  // guarantee is gone.
  // =========================================================================
  const pricing: OrderPricingResult =
    await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

  // Rendered in EMITTED ORDER. No sort, no re-rank, no filter and no de-duplication: the DESCENDING
  // insert-sort of qualified discounts [model/service/PromotionService.cfc:L266-L294], the
  // ASCENDING insert-sort of reward usage [:L301-L329] and the single-best-discount-per-item
  // application [:L524-L537] are all load-bearing decisions the engine already made.
  const promotionIntents = pricing.promotionIntents.map(renderPromotionIntent);
  const priceGroupIntents = pricing.priceGroupIntents.map(renderPriceGroupIntent);

  sink.info('priced an order through the composed price-group-then-promotion operation', {
    capability: CAPABILITY,
    operation: request.operation,
    requestId: request.requestId,
    idempotencyKey: request.idempotencyKey,
    // COUNTS ONLY. No order identifier, no item identifier and no monetary amount reaches a log
    // line: an order document is caller-authored and a log stream is not the place to reproduce one.
    orderItemCount: order.orderItems.length,
    orderFulfillmentCount: order.orderFulfillments.length,
    promotionIntentCount: promotionIntents.length,
    priceGroupIntentCount: priceGroupIntents.length,
  });

  return {
    operation: request.operation,
    idempotencyKey: request.idempotencyKey,
    requestId: request.requestId,
    evaluatedAt,
    // An EMPTY array is a valid result and, for a return order, the CORRECT one - see the preserved
    // `issue #1766` no-op in the register below.
    promotionIntents,
    priceGroupIntents,
  };
}

// ===========================================================================
// SECTION 8 - THE HANDLER
// ===========================================================================

/**
 * Build a promotion-application handler over an explicit dependency bundle.
 *
 * THE INJECTION SEAM, and the reason this module needs no module-level monkey-patching to be
 * testable: the CLOCK arrives through {@link PromotionApplicationDependencies.clock}, the ORDER VIEW
 * through {@link PromotionApplicationDependencies.admitOrderView}, and the COMPOSED OPERATION through
 * {@link PromotionApplicationDependencies.compositionRoot} - which is also how a suite drives the
 * ordering assertion that reversing the two passes changes the computed discount.
 *
 * `createPromotionApplicationHandler()` with no argument is the production configuration and is what
 * {@link handler} is built from.
 *
 * @param dependencies the bundle; every member optional, every default the production one.
 */
export function createPromotionApplicationHandler(
  dependencies: PromotionApplicationDependencies = {},
): PromotionApplicationHandler {
  // Resolved ONCE, at construction, so the request path performs no defaulting.
  //
  // The production default calls `bootstrapCompositionRoot()` with NO overrides, which is what keeps
  // the module memo in play: `./bootstrap.js` records that ANY overrides bypass the memo entirely, so
  // passing them here would build a fresh graph - and a fresh connection pool - on every invocation.
  const openCompositionRoot: () => Promise<CompositionRoot> =
    dependencies.compositionRoot ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot());
  const admitOrderView: OrderViewAdmission =
    dependencies.admitOrderView ?? admitMaterializedOrderView;
  const sink: Logger = dependencies.logger ?? defaultLogger;
  const clock: (() => Date) | undefined = dependencies.clock;

  return async (event: APIGatewayProxyEvent, context?: Context): Promise<APIGatewayProxyResult> => {
    const requestId = readCorrelationIdentifier(event, context);

    // Reassigned once, after the route is known, so a failure anywhere below is reported against the
    // route being served. `route` is composed from the FROZEN table row and never from the caller's
    // path, so nothing caller-authored reaches it.
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

      mappingContext = {
        requestId,
        route: `${resolution.route.methods} ${resolution.route.path}`,
        logger: sink,
      };

      const decoding = decodeRequestEnvelope(event, requestId);
      if (!decoding.ok) {
        return invalidRequestResponse(decoding.reason, mappingContext);
      }

      // ONE await of the idempotent, memoized initializer, INSIDE the handler and never at module
      // top level - which is also what keeps this module free of a top-level `await`, a construct the
      // CommonJS Lambda bundle could not carry.
      const root = await openCompositionRoot();

      // EXACTLY ONE FRESH PER-REQUEST SCOPE, opened here and never held, cached or reused across
      // invocations. That is what stops a warm container from carrying one invocation's state - and
      // therefore one customer's price - into another's. Request state is read from the event and from
      // this scope; it is NEVER read from `../lib/config.js`, which is static process configuration
      // and is not a request scope.
      //
      // `now` is passed as whatever the injected clock yields, which in production is `undefined` -
      // the scope then binds the instant itself, once, and publishes it as `scope.now`.
      const scope = await root.createRequestScope({
        now: clock?.(),
        accountID: decoding.request.accountID,
      });

      return successResponse(
        await runSelectedOperation(decoding.request, scope, admitOrderView, sink),
      );
    } catch (thrown: unknown) {
      // Narrowed by `instanceof`, never cast. An admission refusal is a CLIENT-shaped rejection
      // carrying member paths and no submitted value; everything else - including the deliberately
      // throwing `Sku.getPriceByPromotion` stub, which this handler neither calls nor silences - goes
      // to `mapErrorToApiGatewayResponse`, which recognises the framework's dead-call-target contract
      // and a schema failure and reduces anything else to a fixed sentence.
      if (thrown instanceof OrderViewAdmissionError) {
        return invalidRequestResponse(thrown.reason, mappingContext, thrown.fields);
      }

      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/**
 * THE LAMBDA ENTRY POINT.
 *
 * The PRIMARY exported unit of this module, and the symbol the platform invokes. Built over the
 * production dependency bundle, so the memoized composition root, the structural order-view admission
 * and the scope-bound clock are all in force.
 *
 * `slatwall-ts/esbuild.config.mjs` - one level above this folder - already lists this file among its
 * candidate entry points and emits it as an independently deployable CommonJS artifact. No bundler,
 * manifest or configuration file is authored, edited or duplicated here, and no infrastructure or
 * deployment descriptor of any kind accompanies it.
 */
export const handler: PromotionApplicationHandler = createPromotionApplicationHandler();

// ===========================================================================
// SECTION 9 - THE PRESERVED-DEFECT REGISTER FOR THIS BOUNDARY
//
// Behaviour preservation extends to defects. The five below are the ones whose
// consequences cross THIS boundary - they shape which intents arrive, what they
// are worth, and what the two use-count members return - so they are recorded
// here where a reader of the wire contract will meet them. Each is reproduced by
// the tier that owns it and NONE is repaired anywhere. Comments are part of the
// deliverable: `slatwall-ts/tsconfig.build.json` sets `removeComments: false` and
// the bundle is emitted unminified precisely so this audit trail survives.
//
// ---------------------------------------------------------------------------
// LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: the over-use
// stripping loop iterates `for(var prID in promotionRewardUsageDetails)` and tests
// `promotionRewardUsageDetails[ prID ].usedInOrder > ... .maximumUsePerOrder` at
// L471 - but then computes `needToRemove` from
// `promotionRewardUsageDetails[ reward.getPromotionRewardID() ].maximumUsePerOrder`
// at L472, and walks
// `promotionRewardUsageDetails[ reward.getPromotionRewardID() ].orderItemsUsage`
// at L475-L477, indexing by the `reward` variable LEFT OVER from the preceding
// reward loop rather than by `prID`. Maximum-use-per-order is therefore enforced
// against whichever reward happened to be last, for EVERY key in the ledger.
// Preserved deliberately; do not fix without a product decision.
//
//   TODO [defect 9]: enforcing the limit against `prID` instead of the leaked
//   `reward` changes the amount a customer is charged. It needs a product decision
//   and a repricing plan, not a code change. This handler returns whatever intents
//   that loop leaves behind and repairs nothing: it adds no `ORDER BY` and no sort
//   to the reward collection, which `getActivePromotionRewards`
//   [model/dao/PromotionDAO.cfc:L51-L132] deliberately leaves unordered, so which
//   reward is "last" stays as non-deterministic in the target as it is in the source.
//
// ---------------------------------------------------------------------------
// LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: the qualification
// details struct writes `qualificationDetails.qualifiedFulfillments =
// explicitlyQualifiedFulfillmentIDs` at L622, a key that is never initialised and
// never read - the caller reads `qualifiedFulfillmentIDs` instead. A documented
// dead field.
// Preserved deliberately; do not fix without a product decision.
//
// ---------------------------------------------------------------------------
// LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-zone
// clause reads
// `arrayLen(qualifier.getShippingAddressZones()) && (orderFulfillment.getAddress().getNewFlag()
// || !qualifier.hasShippingMethod(orderFulfillment.getShippingMethod()))` - it
// RE-TESTS the shipping method instead of testing whether the address falls in one
// of the declared zones, so the zone condition is never evaluated at that site.
// Preserved deliberately; do not fix without a product decision.
//
//   Consequence at this boundary: a fulfillment's `address` is carried and probed by
//   SECTION 4 because the engine dereferences `getAddress().getNewFlag()` there, yet
//   the zone comparison the clause was written for does not happen. Nothing here
//   compensates for that, and nothing here collapses the RESTRICTIVE empty-collection
//   default of `isAddressInZone` [model/service/AddressService.cfc:L57-L82] into the
//   PERMISSIVE default the include/exclude collections use - see
//   {@link probeOrderFulfillment} for why collapsing them is a money bug.
//
// ---------------------------------------------------------------------------
// LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the clamp that
// "makes sure that the discount never exceeds the original amount" compares the
// PRE-rounding value - `if(discountAmountPreRounding > originalAmount)` - but
// overwrites the POST-rounding one, `discountAmount = originalAmount`. A rounded
// discount that exceeds the original amount is therefore not clamped, and an
// unrounded one that does is clamped even when rounding had brought it back inside.
// Preserved deliberately; do not fix without a product decision.
//
//   Consequence at this boundary: the `discountAmount` on an emitted intent is
//   whatever that clamp produced. It is rendered through `Money.toDecimalString()`
//   and is never re-clamped, re-rounded or bounded here.
//
// ---------------------------------------------------------------------------
// LEGACY-DEFECT [model/service/PromotionService.cfc:L1094-L1100]: both
// `getPromotionCodeUseCount` and `getPromotionCodeAccountUseCount` declare
// `returntype="boolean"` and then `return getPromotionDAO()....` - a NUMERIC count.
// The ported service types the HONEST return, `Promise<number>`, so the legacy
// declaration is RECORDED here rather than reproduced as a lie in the type system.
// Preserved deliberately; do not fix without a product decision.
//
//   Neither member is routed to from this handler - the use-count surface belongs to
//   the promotion-code administration path, not to order pricing - but the defect is
//   registered because the counts it returns are what the use-limit enforcement this
//   boundary carries is measured against.
//
// ---------------------------------------------------------------------------
// PRESERVED SOURCE TYPO, NOT RENAMED. `hb_permission="promotionPeriod.promtionRewards"`
// [model/entity/PromotionReward.cfc:L57] is misspelled in the source. It sits on the
// component declaration and is a DATA CONTRACT - a permission key the legacy admin
// resolves by name - so it is preserved VERBATIM by the entity that carries it and is
// not renamed. The internal-only accumulator key `orderItemQulifiedDiscounts`
// [model/service/PromotionService.cfc:L82-L133] is by contrast purely internal and is
// renamed in the target with a comment recording the original spelling. Neither
// identifier appears on this module's wire contract.
//
// ---------------------------------------------------------------------------
// PRESERVED NO-OP, STILL DOING NOTHING. [model/service/PromotionService.cfc:L542-L544]
// carries `// TODO [issue #1766]: In the future allow for return Items to have negative
// promotions applied.` and an EMPTY body. It is ported verbatim by the services tier,
// still does nothing, and still carries its ticket reference; a placeholder regression
// test named `issue_1766` documents the gap, following the `issue_<ticket#>` convention
// of [meta/tests/unit/IssuesTest.cfc]. No return or exchange handling is implemented
// here and no negative-discount concept is encoded anywhere on this contract: for a
// return order the correct result is an EMPTY intent array, and that is what this
// handler serialises.
//
// ---------------------------------------------------------------------------
// NOT MODELLED HERE, AND DELIBERATELY SO. The migration's three deliberate divergences
// are allocated elsewhere and this file claims none of them: the un-`var`'d
// `discountAmount` leaking into component scope [model/service/PromotionService.cfc:L1007,
// L1009] and the `amountOff` branch's raw floating-point multiplication [:L998] are
// SERVICES-tier divergences, and the entity memo defects [model/entity/Sku.cfc:L500-L522,
// model/entity/Product.cfc:L524-L532] are an ENTITIES-tier divergence. `src/handlers/**`
// owns ZERO slots of the divergence, signature-reshaping, visibility-widening and
// entity-widening ledgers, and spends none.
// ===========================================================================
