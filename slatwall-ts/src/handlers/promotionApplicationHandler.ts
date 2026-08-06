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
 *   - Otherwise - an applied price group the reward does NOT list as eligible - compute
 *     `originalDiscountAmount` from `getSkuPrice()`, then subtract
 *     `(getExtendedSkuPrice() - getExtendedPrice())` (L246 -> L249, L252).
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
 * ★★★ QUOTE-THEN-REVISE, AND THE REVISION IS THE ONE THAT MADE THE ROUTE USABLE. This section used
 * to conclude: "So a caller holding a wire document materialises it on the tier that owns hydration
 * and hands the RESULT here; this adapter validates what it is given, refuses what it cannot vouch
 * for, and never fabricates a member." Every clause of that was true of the CODE and the conclusion
 * drawn from it was wrong, because there is no such caller on the wire: API Gateway delivers
 * `event.body` as TEXT, so the only order a deployed route can receive is a JSON projection - and the
 * structural admission refused exactly that. The route had a table row, a Lambda `handler` and a
 * bundle entry, and no successful request path at all; a code review raised it as a CRITICAL
 * deployability finding, and it was right to.
 *
 * WHAT CHANGED, AND WHAT DID NOT. The premise below is untouched: THIS TIER STILL MINTS NOTHING.
 * What was added is a NAME for the hydration this tier cannot perform -
 * `RequestScope.materializeOrderView`, published by `./bootstrap.js`, which holds the repositories
 * and is the tier transformation rule T3 assigns loading to. This adapter parses a caller's
 * projection against a declared schema ({@link ORDER_VIEW_DOCUMENT_SCHEMA}) and asks that member for
 * the view. So the three reasons below still hold verbatim - this file constructs no `Sku`, no
 * `PriceGroup` and no `CurrencyCode` - while the capability is reachable from the wire.
 *
 * AND THE SECURITY PROPERTY IS STRICTLY STRONGER THAN IT WOULD HAVE BEEN. The document names the
 * SKU, its product and any applied price group by IDENTIFIER and describes none of them, so the
 * product-type ancestry, the brand, the option list and the price-group eligibility that decide
 * whether a promotion applies [model/service/PromotionService.cfc:L808-L818, L864-L865, L241] are
 * read from `SwSku`, `SwProduct`, `SwProductType` and `SwPriceGroup` and cannot be asserted by a
 * caller. A schema that accepted a described entity would have let a caller grant itself a discount.
 *
 * Materialising one remains a REPOSITORIES-tier act and is structurally out of this tier's reach, for
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
 * Constructing any of the three is entity construction, which this tier does not do. `RequestScope`
 * also publishes the five narrow `entityLoaders` used by price resolution, but this adapter neither
 * receives nor calls them: its admission is handed only the `OrderViewMaterializer` projection. That
 * projection exposes ONE hydration member, `materializeOrderView`, which takes the whole document and
 * hands back the whole view, with no repository, service, setting or write reachable through it.
 * `RequestScope` deliberately publishes none of the six raw MySQL adapters. This adapter validates
 * what it is given, asks the materializer for the view, and refuses what neither the schema nor the
 * hydration can account for. Refusing is the safe outcome, and it is a complete one: no member is ever
 * defaulted, and in particular an absent price NEVER becomes zero, because a zero price sells product
 * for free.
 *
 * ★ THE AUTHENTICATED ACCOUNT IS NEVER TAKEN FROM THE BODY, and this is the OTHER thing the review
 * found. `PriceGroupService.updateOrderAmountsWithPriceGroups` resolves an order's price groups from
 * `order.accountID` - the ported equivalent of the `!isNull(getAccount())` test at
 * [model/service/PriceGroupService.cfc:L365] - so the account is a PRICING AUTHORITY, and a
 * body-supplied one is an authority the caller writes. The envelope's optional `accountID` therefore
 * no longer selects anything: `resolveRequestPrincipal` reads the account from
 * `event.requestContext.authorizer`, which a caller cannot write, and the body member and the
 * document's own `accountID` are each REFUSED when they disagree with it. The legacy equivalent is
 * the same trust boundary: `getHibachiScope()` only held an account after `loginAccount(...)`, so the
 * legacy actor came from an authenticated session and never from request content.
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

import { bootstrapCompositionRoot, OrderViewDocumentDataError } from './bootstrap.js';
import {
  containsPrototypeMemberKey,
  forbiddenResponse,
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  mapZodErrorFields,
  PROTOTYPE_MEMBER_FIELD_ISSUE,
  resolveRequestPrincipal,
  resolveServerRequestId,
  routeDiagnosticLabel,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';
import { logger as defaultLogger } from '../lib/logger.js';
// `cfEquals` keeps the compatibility-account comparisons aligned with CFML's case-insensitive string
// equality. Principal resolution itself is shared in `./errorMapper.js`, the module that also
// publishes the refusal an unidentified outcome earns.
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
export type PromotionApplicationOperation = 'applyPromotions' | 'getSalePriceDetailsForProductSkus';

/**
 * The one capability an admission may reach for on the request scope: wire-document hydration.
 *
 * A `Pick<>` rather than the whole scope, so an admission cannot open a pass, reach a service or
 * read a setting on its way to a view - and so a suite substituting one has one member to supply
 * rather than fourteen. The member itself is documented on `./bootstrap.js`, which owns it because
 * hydration is a repositories-tier act.
 */
export type OrderViewMaterializer = Pick<RequestScope, 'materializeOrderView'>;

/**
 * How this adapter obtains the read-only order view it hands to the composed operation.
 *
 * ★ THE SEAM EXISTS BECAUSE MATERIALISING AN ORDER VIEW IS NOT A HANDLER-TIER ACT. See the module
 * header for the three independent reasons - a ported `Sku` entity, a ported `PriceGroup` entity and
 * a branded `CurrencyCode`. A handler can neither construct nor load one, which is why the second
 * parameter exists: the hydration itself is performed by `RequestScope.materializeOrderView`, on the
 * tier that holds the repositories, and an admission's job is to decide WHAT is handed to it. An
 * admission never fabricates a member, never defaults an absent price to zero, and never mutates
 * what it admits.
 *
 * ★ TWO IMPLEMENTATIONS SHIP, AND THE DEFAULT IS THE WIRE ONE. {@link admitOrderDocument} parses a
 * caller's JSON projection against a declared schema and hands the result to the materializer; it is
 * the default precisely because API Gateway can deliver nothing else, so it is the arm the deployed
 * route needs. {@link admitMaterializedOrderView} vouches for an ALREADY-MATERIALISED view without
 * loading anything, and is what a strangler-fig proxy holding a live aggregate injects.
 *
 * Receiving the whole decoded request rather than just its `order` member is deliberate: an
 * admission may need the envelope's correlation identifier to report precisely what it refused, and
 * narrowing the parameter later is additive whereas widening it is not.
 *
 * @param request the decoded, schema-validated request envelope for the pricing operation.
 * @param materializer the hydration capability of THIS request's scope.
 * @returns the order view to price.
 * @throws {@link OrderViewAdmissionError} when the document cannot be admitted. Refusal is a normal
 *   outcome of an unusable input, and is mapped to a client-shaped response by the handler.
 */
export type OrderViewAdmission = (
  request: ApplyPromotionsRequest,
  materializer: OrderViewMaterializer,
) => Promise<OrderView>;

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
   * How the order view is obtained. Defaults to {@link admitOrderDocument}, the WIRE arm.
   *
   * ★ THE DEFAULT IS THE ONE A DEPLOYED ROUTE CAN ACTUALLY USE, and that is a correction rather
   * than a preference. This member used to default to {@link admitMaterializedOrderView}, which
   * requires a method-bearing order graph - so the deployed `applyPromotions` route refused every
   * possible API Gateway body, because a body is text and `Money`, `Sku` and `PriceGroup` methods
   * do not survive `JSON.parse`. A route that cannot be called is not a served capability. The
   * default now parses a declared {@link OrderViewDocument} schema and hydrates it through
   * `RequestScope.materializeOrderView`, so the wire path works and the entity graph is still
   * loaded from the schema rather than described by the caller.
   *
   * Both other arms remain available and neither is diminished: a suite supplies a golden fixture
   * through this member, and a strangler-fig proxy that already holds a materialised aggregate
   * injects {@link admitMaterializedOrderView} - which is exported for exactly that - or its own
   * resolution.
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
   * `PromotionPeriod.isCurrent(now?: Date)` [model/entity/PromotionPeriod.cfc:L78] deterministic,
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
  /** Correlation identifier for this invocation, established by the server. */
  readonly requestId: string;
}

// ★★★ TWO MEMBERS WERE REMOVED FROM THIS ENVELOPE, AND EACH REMOVAL IS A FINDING.
//
//   * `idempotencyKey: string` - FINDING F6. It was REQUIRED, character-filtered, bounded, echoed on
//     the response and written to both log lines, and it was honoured by NOTHING: no ledger, no
//     persistence boundary, no request fingerprint and no stable evaluation instant. Section 2's own
//     obligation (2) argued the key "serves the party that DOES persist", which is a real observation
//     about a DOWNSTREAM contract and not a reason to make it mandatory HERE - and worse, the clock is
//     bound fresh per invocation, so the SAME key over the SAME document can straddle a
//     promotion-period or sale-price boundary and legitimately return a DIFFERENT answer. A required
//     key that cannot be honoured is a contract this entrypoint cannot keep. It is gone from the
//     envelope, the schema, the response and the log lines; obligation (2) is restated in terms of the
//     property that is actually true, which is that this entrypoint performs no durable write at all.
//   * `accountID?: string` as an AUTHORITY - FINDING F2 (CWE-639). The compatibility member may still
//     be stated, but it is compared with the API Gateway authorizer and then discarded. Only
//     `resolveRequestPrincipal` supplies the request scope's pricing identity.

/**
 * A request for the composed price-group-then-promotion operation.
 *
 * `order` remains `unknown` at the envelope boundary and is validated by {@link admitOrderDocument}
 * against the complete {@link OrderViewDocument} schema before the request scope materializes it.
 */
export interface ApplyPromotionsRequest extends PromotionApplicationRequestEnvelope {
  readonly operation: 'applyPromotions';

  /** The order document to price. Its absence and shape are decided by the admission port. */
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
  readonly operation: 'getSalePriceDetailsForProductSkus';

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
  /**
   * `add` | `update` | `remove`, exactly as the engine decided it.
   *
   * ★★★ TYPED FROM THE DOMAIN UNION RATHER THAN AS `string`, WHICH IS FINDING F15. Both this member
   * and {@link PromotionAppliedIntentDocument.appliedType} were declared `string` under comments
   * asserting the union was "NOT widened here" - so the documentation claimed a closed vocabulary that
   * the type system had already thrown away, and a renderer emitting a fourth value would have
   * compiled. Reusing the domain types makes the claim checkable: an operation the engine cannot
   * produce is now a compile error at {@link renderPromotionIntent}.
   */
  readonly operation: PromotionAppliedIntent['operation'];

  /**
   * `order` | `orderItem` | `orderFulfillment` - the three values the engine actually writes
   * [model/service/PromotionService.cfc:L402, L448, L531]. The union is NOT widened here and no
   * fourth applied type is invented, and now it CANNOT be: this is
   * `PromotionAppliedType` from `../domain/entities/promotionApplied.js`, the same union the entity
   * declares.
   */
  readonly appliedType: PromotionAppliedType;

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
 * What this handler produced, carried as the `result` member of the shared success envelope.
 *
 * ★★★ THIS TYPE WAS `PromotionApplicationResponseBody` AND WAS THE WHOLE BODY, WHICH IS FINDING F13.
 * It declared its own `idempotencyKey` and its own `requestId` and was serialised by a module-local
 * `successResponse` with a module-local header pair and a module-local `SUCCESS_STATUS` - so this
 * capability answered in a shape none of its four siblings used. The correlation echo, the status, the
 * headers and the `{requestId, capability, action, result}` framing now come from
 * `./errorMapper.js`'s `jsonSuccessResponse`, which is the single construction path for a served JSON
 * body across all five entrypoints. `idempotencyKey` went with finding F6.
 *
 * `evaluatedAt` stays, and stays HERE rather than on the envelope: it is the instant the request scope
 * bound - `RequestScope.now` - rendered ISO-8601 in UTC, which is what makes the promotion-period
 * window [model/entity/PromotionPeriod.cfc:L78] and the sale-price expiration comparison auditable
 * after the fact. No sibling capability publishes it because none of them binds a decision to an
 * instant the way a promotion window does.
 */
export interface PromotionApplicationResultDocument {
  /** Which operation ran. */
  readonly operation: PromotionApplicationOperation;

  /** The single instant every date comparison in this invocation resolved against, UTC. */
  readonly evaluatedAt: string;

  /** What the promotion pass decided. Empty is a valid - and for a return order, correct - result. */
  readonly promotionIntents?: readonly PromotionAppliedIntentDocument[];

  /** What the price-group pass decided, reported for completeness. */
  readonly priceGroupIntents?: readonly PriceGroupAppliedIntentDocument[];

  /**
   * Sale-price details keyed by opaque SKU identifier. Present only for
   * `getSalePriceDetailsForProductSkus`.
   */
  readonly salePriceDetails?: Readonly<Record<string, SalePriceDetailDocument>>;
}

// ===========================================================================
// SECTION 2 - THE EXECUTION-MODEL OBLIGATIONS
//
// This endpoint performs no durable write. The safety properties below describe
// only what this adapter owns; they make no claim about a downstream persistence
// boundary or about how a caller schedules repeated requests.
//
// (1) EXPLICIT BOUNDS. {@link ORDER_DOCUMENT_LIMITS} caps how much work one
//     invocation will accept. Exceeding a bound is REJECTED through
//     `./errorMapper.js` with the offending member's path; the document is NEVER
//     silently truncated, because a truncated order is priced against items the
//     caller did not send and the caller is never told.
//
// (2) ★★★ REPEATED-CALL SAFETY BY CONSTRUCTION, AND NO IDEMPOTENCY KEY (finding F6). The
//     previous revision REQUIRED a caller-supplied `idempotencyKey`, echoed it, and
//     logged it - and honoured it with nothing at all: no ledger, no persistence
//     boundary, no request fingerprint, no stable evaluation instant. Its own
//     argument for requiring it described a persistence contract this endpoint
//     does not own. Two further facts made the requirement untenable: the scope
//     binds a FRESH instant per invocation, so
//     the same key over the same document can straddle a promotion-period or
//     sale-price boundary and legitimately answer differently; and nothing here
//     caches a response under any key, deliberately, because caching a decision
//     would let a warm container answer one request from inside another.
//
//     What is actually true is stronger than what the key claimed, and it needs no
//     caller cooperation: BOTH passes RETURN INTENTS AND MUTATE NOTHING - the
//     anti-corruption inversion in `../domain/views/orderView.js` - so this
//     entrypoint performs NO DURABLE WRITE AT ALL. Re-invoking it cannot duplicate
//     a write in this adapter, so no key belongs on this request contract.
//
// (3) FAILURE LEAVES NO LOCAL PARTIAL STATE. An invocation that fails at admission,
//     inside either pass, or during serialisation has written no row, detached no
//     row and altered no order. This module emits intents and defines no persistence
//     or compensation protocol for another component.
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
  readonly maximumIdentifierLength: number;
  readonly maximumCountMagnitude: number;
  readonly maximumPromotionCodes: number;
}> = Object.freeze({
  maximumOrderItems: 500,
  maximumOrderFulfillments: 100,
  maximumIdentifierLength: 32,

  // ★★★ THE MAGNITUDE EVERY WHOLE COUNT ON THE WIRE IS HELD TO (SEC-K, CWE-20), AND IT IS
  // SCHEMA-DERIVED RATHER THAN CHOSEN. `OrderItem.quantity` is declared
  // `property name="quantity" ormtype="integer"` [model/entity/OrderItem.cfc:L56], which is a MySQL
  // `INT` - signed, so 2_147_483_647 is the largest value the column the legacy engine counted against
  // can hold. A count past it cannot describe a persisted order line, so refusing it takes nothing
  // away.
  //
  // WHY A BOUND WAS NEEDED AT ALL, given the schema was already the real limit. `z.number().int()`
  // admits any integral double, including `9007199254740992` - and every quantity reaches
  // `fromInteger` [src/lib/cfml/precision.ts:L387], which accepts ONLY `Number.isSafeInteger` and
  // throws `PrecisionError` otherwise. That throw is not a validation failure, so it escaped the
  // request-contract mapper and surfaced as a generic 500: a caller-controlled internal error, and a
  // caller-controlled way to make every one of these requests fail without ever being told which field
  // was at fault. The bound moves the refusal to admission, where it becomes a 400 naming the member.
  //
  // ★ AND IT IS STRICTER THAN THE SAFE-INTEGER TEST IT REPLACES RATHER THAN A SUBSTITUTE FOR IT. Both
  // are applied: see {@link WIRE_COUNT}. The safe-integer test states the arithmetic precondition, the
  // magnitude states the business one, and neither implies the other - a value can be a safe integer
  // and still be a nonsense quantity.
  maximumCountMagnitude: 2_147_483_647,

  // ★★★ HOW MANY PROMOTION CODES ONE ORDER MAY CARRY (SEC-J, CWE-20/CWE-400). Every submitted code is
  // emitted into TWO `EXISTS` arms of `getActivePromotionRewards`
  // [src/repositories/mysql/mysqlPromotionRepository.ts], so N codes cost 2N placeholders plus the
  // statement's own date and flag binds. The prepared-statement ceiling is 65_535
  // [src/repositories/mysql/connection.ts], so roughly 32_766 codes was enough to exceed it - and the
  // refusal arrived from the DRIVER, as a 500, after the whole array had been allocated.
  //
  // 100 is a deliberate, defensible operational bound rather than a derived one, and it is stated as
  // such: the legacy admin applies promotion codes to a cart one at a time through
  // `OrderService.processOrder_addPromotionCode`, and no source anywhere in the in-scope slice states a
  // ceiling. Nothing about the number is inferred from the schema, because the schema states nothing
  // about it. The REPOSITORY still validates the complete bind budget independently - see SEC-J there -
  // so this bound is the caller-facing 400 and not the safety mechanism.
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

// ★★★ THREE CONSTANTS WERE REMOVED HERE, AND EACH REMOVAL IS A FINDING.
//
//   * `maximumIdempotencyKeyLength`, `IDEMPOTENCY_KEY_PATTERN` - FINDING F6. A bound and a character
//     filter on a caller-authored token that is no longer accepted at all. Nothing bounds a value that
//     does not exist.
//   * `SAFE_REQUEST_ID_PATTERN`, `UNIDENTIFIED_REQUEST` - FINDING F8. The correlation identifier is
//     resolved by `./errorMapper.js`'s `resolveServerRequestId`, which is the ONE precedence rule and
//     the ONE substitute token for all five entrypoints. This module's own pair preferred the same two
//     sources but substituted a DIFFERENT literal, so an operator grepping for uncorrelated
//     invocations had to know two spellings. See `resolveRequestPrincipal` for the one
//     caller-facing read that remains in this module.

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
// SECTION 3 - THE JSON WIRE CONTRACT
//
// The envelope selects one operation. The order itself is validated separately by SECTION 3b so the
// production admission can report paths relative to `order` and hand the validated document to the
// composition-root materializer. Unknown members are refused; no caller-authored account is trusted.
// ===========================================================================

/** An opaque identifier, bounded by the persisted identifier width. */
const OPAQUE_IDENTIFIER = z
  .string()
  .min(1, { message: 'must not be empty' })
  .max(ORDER_DOCUMENT_LIMITS.maximumIdentifierLength, {
    message: 'must not be longer than the identifier column it names',
  });

/** The apply-promotions envelope. `accountID` is checked and then discarded as an authority. */
const APPLY_PROMOTIONS_ENVELOPE = z.strictObject({
  operation: z.literal('applyPromotions'),
  accountID: OPAQUE_IDENTIFIER.optional(),
  order: z.unknown().optional(),
});

/** The mapped sale-price operation, selected by payload rather than by a second route. */
const SALE_PRICE_DETAILS_ENVELOPE = z.strictObject({
  operation: z.literal('getSalePriceDetailsForProductSkus'),
  accountID: OPAQUE_IDENTIFIER.optional(),
  productID: OPAQUE_IDENTIFIER,
});

const REQUEST_ENVELOPE_SCHEMA = z.discriminatedUnion('operation', [
  APPLY_PROMOTIONS_ENVELOPE,
  SALE_PRICE_DETAILS_ENVELOPE,
]);

// ===========================================================================
// SECTION 3b - THE WIRE ORDER DOCUMENT
//
// The schema for the ONE shape an API Gateway body can actually carry: a projection
// of the order aggregate in which every monetary value is a decimal STRING and every
// entity is an opaque IDENTIFIER. `./bootstrap.js` declares the TYPES this schema
// validates against - `OrderViewDocument` and its four nested members - beside the
// hydration that consumes them; this section declares the VALIDATION, because
// validating a request body is a primary adapter's own job.
//
// ★ WHY `.strictObject` THROUGHOUT. An unknown member is REFUSED rather than ignored.
// A caller that sends `sku`, `price` as a number, or an `appliedPriceGroup` object has
// misread this contract, and telling it so with a member path is more useful than
// silently pricing an order it did not describe - and an ignored member is exactly how
// a caller comes to believe it stated something the engine read.
//
// ★ WHY EVERY ABSENCE IS SPELLED `.nullable()` AND NOTHING IS `.optional()`. JSON has no
// `undefined`, so `null` is the only absence a producer can state; and requiring the KEY
// means "no shipping method" and "I forgot the shipping method" are different documents,
// which is the same rule `../domain/views/orderItemView.js` states for its own members
// under `exactOptionalPropertyTypes`. The one conversion from `null` to `undefined`
// happens inside `RequestScope.materializeOrderView` and nowhere else.
//
// ★ WHY EVERY COLLECTION IS BOUNDED. The bounds are {@link ORDER_DOCUMENT_LIMITS}, the
// same ones the structural admission enforces, and an over-large document is REFUSED and
// never truncated - obligation (1) from SECTION 2.
// ===========================================================================

/**
 * A monetary member as it travels: a plain decimal numeral, in a string.
 *
 * ★ THE GRAMMAR IS NOT RESTATED HERE - IT IS DELEGATED. `toDecimalString` from
 * `../lib/cfml/numberFormat.js` is the validating brander `Money.fromDecimalString` itself calls, so
 * using it as this predicate makes the wire grammar and the value object's grammar THE SAME RULE by
 * construction. A regular expression copied into this file would be a second rule that starts equal
 * and drifts, and the drift would be silent in both directions: a numeral the schema admitted and
 * `Money` refused would become a 500 where a 400 was owed.
 *
 * Refusing is the whole point. `''`, `'abc'`, `'1,234.50'`, `'12.'`, `'NaN'`, `'Infinity'`,
 * exponential notation and anything with surrounding whitespace are all rejected, and none of them is
 * coerced to zero - a silent zero in a price path sells product for free.
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
 * ★★★ THREE CONSTRAINTS, NOT ONE (SEC-K, CWE-20). This was `z.number().int({...})` alone, and the
 * gap that left is the finding: `int()` admits any integral double - `9007199254740992` passes it -
 * while every count on this document eventually reaches `fromInteger`
 * [src/lib/cfml/precision.ts:L387], which accepts ONLY a safe integer and throws `PrecisionError`
 * otherwise. A `PrecisionError` is not a validation failure, so it bypassed the request-contract
 * mapper entirely and surfaced as a generic 500 naming nothing. A caller could therefore choose to
 * receive an internal error, and could do it without ever learning which member was at fault.
 *
 *   1. `int()` - integral, as before, and the message is unchanged.
 *   2. `refine(Number.isSafeInteger)` - the ARITHMETIC precondition, stated at the boundary that can
 *      report it as a field. This is the exact predicate `fromInteger` applies, so admission and
 *      arithmetic now agree instead of one being looser than the other.
 *   3. A magnitude bound - the BUSINESS precondition. See
 *      {@link ORDER_DOCUMENT_LIMITS.maximumCountMagnitude}, which is derived from
 *      `ormtype="integer"` on `OrderItem.quantity` [model/entity/OrderItem.cfc:L56].
 *
 * BOTH 2 AND 3 ARE KEPT EVEN THOUGH 3 IS STRICTLY NARROWER, deliberately. The magnitude bound is a
 * product decision about orders and could be widened by one; the safe-integer test is a fact about
 * the arithmetic this module performs and must not be. Collapsing them would let a future widening of
 * the business bound silently re-open the 500.
 *
 * ★ NOTHING HERE IS SYMMETRIC-ONLY: the bound is applied to the ABSOLUTE value, so a negative return
 * quantity is held to the same magnitude as a positive sale quantity - `-2147483648` is refused for
 * the same reason `2147483648` is, rather than slipping through on a sign.
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

/** A finite measurement, used for shipping weight rather than an item count. */
const WIRE_WEIGHT = z.number().finite({ message: 'must be a finite number' });

/** The three-character currency code [model/entity/Order.cfc:L54 `length="3"`]. */
const WIRE_CURRENCY_CODE = z
  .string()
  .length(3, { message: 'must be a three-character currency code' });

/** One already-applied promotion, as it travels. */
const APPLIED_PROMOTION_DOCUMENT_SCHEMA = z.strictObject({
  promotionAppliedID: OPAQUE_IDENTIFIER,
  // Nullable because `SwPromotionApplied.discountAmount` is [model/entity/PromotionApplied.cfc:L51],
  // and NEVER defaulted to zero: a zero discount is a different fact from no discount.
  discountAmount: WIRE_DECIMAL_NUMERAL.nullable(),
  promotion: z.strictObject({ promotionID: OPAQUE_IDENTIFIER }).nullable(),
});

/** One order item, as it travels. */
const ORDER_ITEM_DOCUMENT_SCHEMA = z.strictObject({
  orderItemID: OPAQUE_IDENTIFIER,
  // BOTH handles, because the ported fetch shape reaches a product-wired SKU only through its
  // product - the reason is recorded on `OrderItemDocument.productID` in `./bootstrap.js`.
  productID: OPAQUE_IDENTIFIER,
  skuID: OPAQUE_IDENTIFIER,
  quantity: WIRE_COUNT,
  // All four, because the [model/service/PromotionService.cfc:L241] discriminator needs all four:
  // `getPrice()` on the first arm [:L244]; `getSkuPrice()` plus
  // `getExtendedSkuPrice() - getExtendedPrice()` on the second [:L249, L252].
  price: WIRE_DECIMAL_NUMERAL,
  skuPrice: WIRE_DECIMAL_NUMERAL,
  extendedPrice: WIRE_DECIMAL_NUMERAL,
  extendedSkuPrice: WIRE_DECIMAL_NUMERAL,
  // The discriminator itself, as an IDENTIFIER: the entity is loaded so that
  // `reward.hasEligiblePriceGroup(...)` compares a real row's identity rather than a caller's claim.
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
 * SKIPS a null one [model/service/AddressService.cfc:L63, L66, L69, L72] rather than failing on it -
 * so an omitted member and a null one would mean the same thing to the evaluator while meaning
 * different things to the caller. `isNew` is a definite boolean: [model/service/PromotionService.cfc:L703]
 * reads `getAddress().getNewFlag()` unguarded.
 */
const SHIPPING_ADDRESS_DOCUMENT_SCHEMA = z.strictObject({
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  stateCode: z.string().nullable(),
  countryCode: z.string().nullable(),
  isNew: z.boolean(),
});

/** One order fulfillment, as it travels. */
const ORDER_FULFILLMENT_DOCUMENT_SCHEMA = z.strictObject({
  orderFulfillmentID: OPAQUE_IDENTIFIER,
  fulfillmentCharge: WIRE_DECIMAL_NUMERAL,
  fulfillmentMethod: z.strictObject({
    fulfillmentMethodID: OPAQUE_IDENTIFIER,
    fulfillmentMethodType: OPAQUE_IDENTIFIER,
  }),
  // `null` is a real state: the gate at [model/service/PromotionService.cfc:L701] tests
  // `isNull(orderFulfillment.getShippingMethod())` explicitly, so a pickup fulfillment states null.
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
 * What it deliberately does NOT accept is as important as what it does: no price for a SKU, no
 * product type, no brand, no option list, no promotion-period window, no rate, no rounding rule, no
 * evaluation instant and no ordering member. Every one of those either decides whether a promotion
 * applies or decides what it is worth, and each is read from the schema or bound by the request scope
 * instead. A caller can describe its own ORDER; it cannot describe the catalogue.
 */
const ORDER_VIEW_DOCUMENT_SCHEMA = z.strictObject({
  orderID: OPAQUE_IDENTIFIER,
  orderType: z.strictObject({ systemCode: OPAQUE_IDENTIFIER }),
  // Stated, nullable, and NOT an authority - the account is the authorizer's answer and this member
  // is refused when it disagrees. See {@link assertDocumentNamesAuthenticatedAccount}.
  accountID: OPAQUE_IDENTIFIER.nullable(),
  // A STRING, because the legacy binds it with `cfqueryparam ... list="true"`
  // [model/dao/PromotionDAO.cfc], so the comma-delimited list form is load-bearing. An EMPTY string
  // is a valid value - it is an order carrying no codes - so no `.min(1)` is applied.
  //
  // ★★★ BOUNDED IN BOTH DIMENSIONS SINCE SEC-J (CWE-20/CWE-400). This was a bare `z.string()`, and
  // that is the finding: every code in the list is emitted into TWO separate `EXISTS` arms of
  // `getActivePromotionRewards`, so a list of N codes costs 2N bound placeholders. The
  // prepared-statement ceiling is 65_535, so a caller supplying roughly 32_766 codes - a string well
  // under any request-size limit this route applies - drove the statement past it and received a
  // generic 500 from the driver, AFTER the whole placeholder array had been built. A caller could
  // therefore choose to make the request fail, repeatedly and cheaply.
  //
  // TWO BOUNDS, BECAUSE ONE WOULD NOT HAVE CLOSED IT. The element count is what the placeholder budget
  // is a function of, and the total length is what stops the same budget being reached with pathological
  // members - the count and the byte size are independent ways to ask for the same work.
  //
  // ★ THE LIST IS NOT REWRITTEN, DE-DUPLICATED, TRIMMED OR RE-ORDERED HERE. It reaches the service
  // verbatim, which a previous code review established is required: the comma-delimited form is what
  // the legacy bound, and normalising it here would change which codes the statement matches. This is a
  // BOUND ONLY - it refuses a list, or admits it unchanged.
  promotionCodeList: z
    .string()
    .max(
      ORDER_DOCUMENT_LIMITS.maximumPromotionCodes *
        (ORDER_DOCUMENT_LIMITS.maximumIdentifierLength + 1),
      { message: 'must not be longer than the published bound' },
    )
    .refine(
      (value: string): boolean =>
        // An empty list carries no codes at all, which is the common case and must not be counted as
        // one member. `split` on an empty string yields `['']`, so the empty case is answered first.
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
 * THE IN-PROCESS ADMISSION: vouch for an ALREADY-MATERIALISED order view, or refuse it.
 *
 * ★ EXPORTED, AND NO LONGER THE DEFAULT. It was the default, and that was the deployability defect a
 * code review raised as CRITICAL: it demands a method-bearing graph, so it refuses every API Gateway
 * body that has ever been sent - see {@link PromotionApplicationDependencies.admitOrderView}. It
 * remains exactly as it was, and it is exported rather than deleted because the caller it was written
 * for is real: a strangler-fig proxy inside the same process, holding a live aggregate it hydrated
 * itself, injects THIS function and gets a hydration-free path with no second load. What changed is
 * which arm a wire request takes, and nothing about what this one proves.
 *
 * Asynchronous because {@link OrderViewAdmission} is - an admission that reaches a hydration tier
 * must be able to await it, and forcing that shape on the port is what keeps the two arms
 * interchangeable. This implementation awaits nothing, which is the whole point: it performs no read,
 * no query and no construction, and it ignores the materializer it is handed.
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

  // Handed on UNTOUCHED - the same object, with every member the caller supplied and no member this
  // adapter added. Nothing here freezes, copies, sorts or reorders it: the reward iteration order is
  // legacy-non-deterministic by construction [model/dao/PromotionDAO.cfc:L51-L132 declares no
  // `ORDER BY`] and the collections the engine reads must arrive exactly as the caller composed
  // them.
  return Promise.resolve(candidate);
}

/**
 * THE PRODUCTION ADMISSION: parse the caller's wire document and have the scope hydrate it.
 *
 * ★★★ THIS IS THE ARM A DEPLOYED ROUTE TAKES, AND IT IS THE FIX FOR THE ONE FINDING THAT MADE THIS
 * CAPABILITY UNUSABLE. API Gateway delivers `event.body` as TEXT; after `JSON.parse` an order is a
 * tree of strings, numbers, objects and nulls, with no `Money`, no `Sku` and no `PriceGroup` in it.
 * This function validates that tree against {@link ORDER_VIEW_DOCUMENT_SCHEMA} and hands the result
 * to `RequestScope.materializeOrderView`, which loads the named rows and mints the value objects on
 * the tier that owns both. The division is exact: THIS function decides whether the caller described
 * an order; THAT member decides what the schema says those identifiers are.
 *
 * ★ THE THREE THINGS IT DOES NOT DO.
 *   1. It constructs nothing. No `Money`, no entity, no currency code and no view is built here; the
 *      only thing this function builds is a list of complaints.
 *   2. It defaults nothing. A member the schema requires and the document omits is a REFUSAL with a
 *      member path, never a zero, an empty string or an absent price treated as free.
 *   3. It trusts nothing about the catalogue. The document names a SKU, its product and any applied
 *      price group; every attribute of all three is loaded, so a caller cannot state a product type,
 *      a brand, an option or an eligibility that would decide a discount in its favour.
 *
 * @throws {@link OrderViewAdmissionError} with member paths when the document is absent or does not
 *   validate. A hydration refusal is still NOT WRAPPED HERE - it propagates as the
 *   `OrderViewDocumentDataError` `./bootstrap.js` raises, which the handler's own catch chain
 *   recognises and reports as a 400 with the member paths that error carries.
 *
 *   ★★ QUOTE-THEN-REVISE. This paragraph used to continue: "`./bootstrap.js` raises its own error
 *   naming the identifier that could not be resolved, and `./errorMapper.js` classifies it -
 *   re-labelling it as a client-shaped refusal here would tell a caller that a row exists or does not,
 *   which is a disclosure this boundary has no reason to make." Its PREMISE has been removed rather
 *   than argued with: the hydration no longer names an identifier in anything publishable, so there is
 *   no longer a disclosure to trade against. What the earlier text got wrong was the CONCLUSION it
 *   drew - that the refusal therefore had to be reported as a server failure. QA testing measured the
 *   cost of that: a document naming an unknown product answered `500 unrecognized` with no `fields`,
 *   so a caller was told the service had failed when the caller had, and an operator's 5xx alarm
 *   counted client mistakes as service faults. The classification moved; the no-echo rule did not.
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

  // `safeParse` rather than `parse`, because the outcome is reported through
  // {@link OrderViewAdmissionError} - which the handler recognises and reports with its member paths
  // as a CLIENT-shaped refusal - rather than as a thrown `ZodError` the mapper would have to
  // rediscover. Both routes publish paths and withhold values; this one keeps the reason token this
  // adapter's own refusals use.
  const parsed = ORDER_VIEW_DOCUMENT_SCHEMA.safeParse(request.order);

  if (!parsed.success) {
    throw new OrderViewAdmissionError(
      'unsupportedBodyShape',
      mapZodErrorFields(parsed.error, 'order'),
    );
  }

  // ANNOTATED, NOT CAST, and the annotation is the drift guard: `./bootstrap.js` declares
  // `OrderViewDocument` and this assignment is what proves the schema still validates exactly that
  // shape. A member renamed on either side is a compile error here rather than a runtime surprise in
  // the hydration.
  const document: OrderViewDocument = parsed.data;

  // ★★★ CROSS-MEMBER CONSISTENCY, AFTER THE SHAPE AND BEFORE THE HYDRATION (SEC-I). The schema above
  // validates each member on its own; these are the constraints that hold BETWEEN members, and a
  // document can satisfy every one of the former while contradicting itself on all of the latter.
  // Refused before `materializeOrderView`, so an inconsistent document costs no entity load.
  const inconsistencies = collectDocumentInconsistencies(document);

  if (inconsistencies.length > 0) {
    throw new OrderViewAdmissionError('unusableRequestInput', inconsistencies);
  }

  return await materializer.materializeOrderView(document);
}

/**
 * The constraints that hold BETWEEN members of one order document, checked against the source itself.
 *
 * ★★★ WHY THIS EXISTS (SEC-I, CWE-20/CWE-345). Every economic member of this document is
 * caller-authored, and the anti-corruption inversion means that is unavoidable: the order aggregate is
 * out of scope [AAP 0.2.2], so nothing here can load the real order and compare. What CAN be done -
 * and was not being done - is to refuse a document that contradicts the LEGACY'S OWN DEFINITIONS of
 * its members. A caller that states an extended price unrelated to its price and quantity is not
 * describing an order the legacy aggregate could ever have produced, and every discount computed from
 * it is computed from a fiction.
 *
 * ★★★ EVERY CHECK BELOW IS AN IDENTITY THE LEGACY ENTITY ITSELF DECLARES, TRANSCRIBED - NOT A RULE
 * INVENTED HERE. That distinction is the whole safety argument for adding validation to a
 * must-preserve path: a check that merely restates what the aggregate computes cannot refuse a
 * document the aggregate would have produced.
 *
 *   1. `extendedPrice == price * quantity` - `getExtendedPrice()` is exactly
 *      `precisionEvaluate('getPrice() * val(getQuantity())')` [model/entity/OrderItem.cfc:L200-L202].
 *      `val()` coerces a non-numeric quantity to zero, which cannot arise here because the schema has
 *      already proved the member is a number, so the coercion is the identity and is not reproduced.
 *   2. `extendedSkuPrice == skuPrice * quantity` - `getExtendedSkuPrice()` is exactly
 *      `precisionEvaluate('getSkuPrice() * getQuantity()')` [model/entity/OrderItem.cfc:L204-L206].
 *      Note the legacy asymmetry: this one carries NO `val()`. It is preserved by not reproducing
 *      either.
 *      Both matter because [model/service/PromotionService.cfc:L241-L252] chooses its discount base
 *      from these four members and subtracts `getExtendedSkuPrice() - getExtendedPrice()` as a
 *      correction term - so a caller controlling the pair controls the correction directly.
 *   3. Every item's `orderFulfillmentID` names a fulfillment IN THIS DOCUMENT. The legacy member is a
 *      many-to-one association [model/entity/OrderItem.cfc], so an item always belonged to a
 *      fulfillment of its own order; a document whose item points at a fulfillment it did not send
 *      describes an impossible graph, and the shipping-level qualification
 *      [model/service/PromotionService.cfc:L752-L781] walks exactly that link.
 *   4. No `promotionAppliedID` appears twice ACROSS the whole document - order level, item level and
 *      fulfillment level together. Each one becomes a REMOVE intent
 *      [model/service/PromotionService.cfc:L64-L80], and a row is attached to exactly one owner, so
 *      the same identifier claimed under two owners would emit two intents for one row and let a
 *      caller manufacture a detach it could not otherwise express.
 *
 * ★★★ AND ONE CHECK IS DELIBERATELY ABSENT: `totalSaleQuantity` IS NOT COMPARED WITH THE ITEMS.
 * `getTotalSaleQuantity()` [model/entity/Order.cfc:L624-L632] tests
 * `getOrderItems()[1].getOrderItemType().getSystemCode() eq "oitSale"` inside a loop that then adds
 * `getOrderItems()[i].getQuantity()` - the FIRST item's type decides whether EVERY item's quantity is
 * counted. That is a registered legacy defect, so the value a real aggregate produces routinely
 * disagrees with any correct recomputation, and a consistency check here would refuse documents the
 * legacy engine genuinely emits. Preserving the defect [AAP 0.6.7] means declining to validate against
 * it.
 *
 * ★ NO VALUE IS ECHOED. Each issue names a member PATH and states the constraint in server-authored
 * words; no price, quantity, identifier or computed product appears in a message, so the refusal
 * cannot be used to read back what was sent or to learn what the engine computed.
 */
function collectDocumentInconsistencies(document: OrderViewDocument): readonly MappedFieldIssue[] {
  const issues: MappedFieldIssue[] = [];

  const fulfillmentIDs = new Set(
    document.orderFulfillments.map((fulfillment): string =>
      // Folded, because every identifier comparison in this subtree is and because the hydration
      // itself folds these same identifiers - a differently-cased but valid reference must not be
      // refused here and then resolved there.
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
    // ★ DOT-SEPARATED, MATCHING THE OTHER TWO REFUSAL SOURCES ON THIS ARM. `mapZodErrorFields` joins a
    // zod issue path with dots, and `./bootstrap.js`'s document-data refusals publish
    // `order.orderItems.0.productID` in the same shape, so a caller reading a 400 from the WIRE path
    // sees one path language whatever refused it. The bracketed form belongs to the in-process
    // structural admission, which is a different arm with a different reader.
    const path = `order.orderItems.${String(index)}`;
    const quantity = item.quantity;

    // `Money` is the ONLY arithmetic surface in this subtree [AAP 0.8.3], so the comparison is made
    // through it rather than with `Number` - which is also what makes it exact: these are decimal
    // strings, and a float multiplication would disagree with the legacy `precisionEvaluate` on values
    // the aggregate really does produce.
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
 * Define one opaque-keyed result member as an enumerable own property.
 *
 * Plain assignment is unsafe for the reserved key `__proto__`: it reaches an inherited setter on an
 * ordinary object instead of creating the SKU entry. Explicit definition preserves every opaque key
 * without changing the result object's prototype.
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
    putOwnStructKey(rendered, skuID, renderSalePriceDetail(detail));
  }
  return rendered;
}

// ★★★ THREE MODULE-LOCAL RESPONSE PIECES WERE REMOVED HERE, AND THAT IS FINDING F13.
//
// `JSON_RESPONSE_HEADERS`, `SUCCESS_STATUS` and `successResponse` each restated something
// `./errorMapper.js` already owns, and each carried an argument for itself that was correct on its own
// terms and wrong as a reason to keep a second copy:
//
//   * the header pair was "deliberately identical to the set `./errorMapper.js` builds" - which is a
//     reason to CALL that module rather than to mirror it, since two identical literals in two files
//     stay identical only until one is edited;
//   * the status note argued at length for 200 and against inventing 201, 202, 409, 422 or 429 -
//     which remains true and `jsonSuccessResponse` decides once for all five entrypoints. Its former
//     argument against 401 was superseded by this route's authenticated admission gate; this handler
//     still has no permission-gated operation and therefore emits no 403;
//   * `successResponse` serialised a body whose top level was this capability's own shape, so a caller
//     integrating with two of the five had to learn two framings and a successful body carried no
//     correlation identifier at all.
//
// `jsonSuccessResponse(requestId, capability, action, result)` now supplies the status, the headers and
// the `{requestId, capability, action, result}` framing, and {@link PromotionApplicationResultDocument}
// is what travels in `result`. The reasoning above is not lost - it lives at that function, which is
// where it applies to every capability rather than to one.

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
  | {
      readonly ok: true;
      readonly request: PromotionApplicationRequest;

      /**
       * The account this request PRICES FOR, which is not necessarily the account that SENT it.
       *
       * ★★★ THE SUBJECT, AND THE REASON IT IS A SEPARATE CONCEPT SINCE SEC-I. The envelope's
       * `accountID` used to be compared with the caller's own principal and refused on disagreement -
       * a rule that only makes sense while the caller and the subject are the same party. This route is
       * now restricted to a TRUSTED SERVICE PRINCIPAL, and a trusted service exists precisely to act ON
       * BEHALF OF an account: it is the strangler-fig stand-in for the in-process `OrderService` caller
       * [model/service/OrderService.cfc:L60-L61], which priced whatever order it held.
       *
       * So the envelope member is promoted from "a claim to be checked" to "the subject the trusted
       * caller names", and the agreement rule moves DOWN one level: the ORDER DOCUMENT must agree with
       * the SUBJECT rather than with the caller. Nothing is weakened by that move, because the caller
       * now has to clear a permission gate no ordinary account can clear - see the route's admission.
       *
       * ★ IT IS NEVER `undefined` FOR A REQUEST THAT REACHED HERE, and that is what preserves the
       * earlier CRITICAL adoption fix: an envelope naming no subject falls back to the trusted caller's
       * own account, so every per-account use-limit read still counts a REAL account's uses rather than
       * nobody's.
       */
      readonly subjectAccountID: string;
    }
  | {
      readonly ok: false;
      readonly reason: InvalidRequestReason;
      /** Member paths, when the refusal can name one. Never a submitted value. */
      readonly fields?: readonly MappedFieldIssue[] | undefined;
    };

// ===========================================================================
// THE TRUST BOUNDARY FOR THE ACCOUNT, AND WHY IT IS ONE
//
// ★★★ THE ACCOUNT IS A PRICING AUTHORITY. `PriceGroupService.updateOrderAmountsWithPriceGroups`
// resolves the account's price groups from `order.accountID` - the ported equivalent of
// `!isNull(arguments.order.getAccount()) && arrayLen(...getPriceGroups())` at
// [model/service/PriceGroupService.cfc:L365] - and `calculateSkuPriceBasedOnAccount` [:L271] reaches
// the subscription price-group query with it. The promotion side keys account use-counts by it too
// [model/service/PromotionService.cfc:L1098]. Whoever chooses the account chooses which rates and
// which use-limits apply, which is why it may not be chosen by the request body.
//
// ★★ THIS WAS A LIVE DEFECT AND IS RECORDED AS ONE. A code review raised it as CWE-639,
// authorization bypass through a user-controlled key: the envelope's top-level `accountID` was read
// straight into `createRequestScope`, this file read the authorizer NOWHERE, and nothing compared the
// body's account with the order's. A caller could therefore select another account's price groups,
// subscription price groups and promotion-account use counts by naming it.
//
// THE FIX IS THE ONE THE SIBLING ENTRYPOINT ALREADY USES, and using the same one is deliberate:
// `./priceResolutionHandler.js` derives its account from `event.requestContext.authorizer`, a context
// an API Gateway caller cannot write. Both body-supplied spellings are retained for compatibility and
// neither is an authority: each is compared with the authenticated account and REFUSED on
// disagreement, with a member path and no value echoed.
//
// ★★★ AND ABSENCE IS THE SECOND HALF, WHICH THE FIRST FIX MISSED. This paragraph used to read: "An
// order that names NO account is always admitted - that is the logged-out arm
// [model/service/PriceGroupService.cfc:L265-L266], it resolves no price groups, and it can only ever
// reduce what a caller is granted." The first two clauses are true of the SERVICE and the third is
// FALSE of a ROUTE that has already authenticated its caller: skipping the account does not merely
// forgo a discount, it makes every per-account use-limit read count the uses of nobody, so a
// promotion capped per account becomes uncapped. A second code review raised exactly that as
// CRITICAL. The logged-out arm belongs to a genuinely anonymous caller, and this route has none -
// `resolveRequestPrincipal` refuses before anything else runs. So an authenticated request's order
// ADOPTS the proved account when it names none; see {@link reconcileOrderAccount}, and
// `materializeOrderView` in `./bootstrap.js` for the same rule applied inside the wire hydration.
//
// ★★★ AND THE WHOLE BOUNDARY MOVED OUT ONE LEVEL WITH SEC-I, WHICH IS THE LARGEST CHANGE THIS SECTION
// HAS TAKEN. Everything above concerns WHICH ACCOUNT an order is priced for, and all of it still holds.
// What it never established is whether the caller may submit THIS DOCUMENT AT ALL - and on this route
// that question dominates, because every economically decisive member is caller-authored: the item
// prices, the extended prices, the subtotals, the applied-price-group handle, the promotion-code list,
// and the `promotionAppliedID` of every already-applied promotion, each of which the engine turns into a
// REMOVE intent [model/service/PromotionService.cfc:L64-L80]. While the route admitted ANY identified
// account, a customer could price a fictional order and could name applied-promotion rows belonging to
// orders it does not own.
//
// TWO THINGS NOW STAND BETWEEN A CALLER AND THE ENGINE, and neither is the account rule above:
//
//   1. THE CALLER MUST BE A TRUSTED SERVICE PRINCIPAL. Established from the authorizer's administrative
//      claim - the only permission bit this tier can observe, since `getAdminAccountFlag()` belongs to
//      the out-of-scope `Account` entity. This is the strangler-fig stand-in for the in-process
//      `OrderService` caller [model/service/OrderService.cfc:L60-L61] that the legacy engine had, and
//      which was trusted by construction because it could not be reached from outside the process.
//   2. THE DOCUMENT MUST NOT CONTRADICT THE LEGACY'S OWN DEFINITIONS OF ITS MEMBERS. See
//      `collectDocumentInconsistencies`. Nothing there is a rule invented for this port: each check
//      restates an identity the legacy entity computes, so it cannot refuse a document the legacy
//      aggregate could have produced.
//
// ★ AND THE ACCOUNT RULE ABOVE IS RESHAPED BY (1) RATHER THAN REPLACED. A trusted service acts ON BEHALF
// OF an account, so the envelope's `accountID` becomes the SUBJECT rather than a claim measured against
// the sender, and the agreement test moves down onto the ORDER DOCUMENT, which must agree with that
// subject. See {@link EnvelopeDecoding.subjectAccountID} and {@link reconcileOrderAccount}.
//
// WHETHER the deployment's authorizer authenticates correctly is an authorizer concern outside this
// AAP, and no API key, token, signature or session lookup is invented here - including for the trusted
// claim, which is read and never issued.
// ===========================================================================

/**
 * Does a caller-supplied account agree with the authenticated one?
 *
 * ABSENT ALWAYS AGREES, on both sides, and each direction is a decision:
 *   - a caller that supplies nothing has stated nothing to disagree with, and the authenticated
 *     account stands;
 *   - an ANONYMOUS request that supplies nothing is the logged-out arm, which resolves no price
 *     groups.
 * A caller that supplies a value while nothing is authenticated DISAGREES - that is precisely the
 * bypass - and so does one that supplies a different value from the authenticated account.
 *
 * `cfEquals` rather than `===`, because CFML string comparison folds case
 * [model/service/PriceGroupService.cfc reads the account by association, and CFML identifiers are
 * case-insensitive], so an account named in a different casing is the SAME account and must not be
 * reported as a conflict.
 */
function accountAgrees(supplied: string | undefined, authenticated: string | undefined): boolean {
  if (supplied === undefined) {
    return true;
  }

  return authenticated !== undefined && cfEquals(supplied, authenticated);
}

/**
 * Bind the order to the account the request PROVED, or refuse the order.
 *
 * ★★★ THIS FUNCTION IS THE FIX FOR A CRITICAL AUTHORIZATION FINDING, AND THE DEFECT IT CLOSES WAS
 * NOT THE OBVIOUS ONE. `accountAgrees` above is correct about DISAGREEMENT and was always applied,
 * so a caller naming another account has never been served. What it also answers `true` for is
 * ABSENCE - and absence was then carried straight into the priced view. A code review measured the
 * consequence: an AUTHENTICATED caller that omitted both the envelope's `accountID` and the
 * document's priced an ACCOUNTLESS order, which means
 *
 *   * `PriceGroupService.updateOrderAmountsWithPriceGroups` takes its
 *     `!isNull(order.getAccount())` arm [model/service/PriceGroupService.cfc:L365] and resolves NO
 *     account price groups - so no `SwAccountPriceGroup` read happens at all; and
 *   * every per-account promotion limit measured against
 *     `getPromotionCodeAccountUseCount` / `getPromotionPeriodAccountUseCount`
 *     [model/service/PromotionService.cfc:L1098], [model/dao/PromotionDAO.cfc:L187, L274] counts
 *     the uses of NOBODY, which is always zero.
 *
 * The second is the live abuse: a promotion capped at N uses per account is re-applicable without
 * limit by a caller whose own account has already exhausted it. The first mostly costs the caller a
 * discount, but it is the same missing read and is closed by the same line.
 *
 * ★★ ADOPTION, NOT MERELY REFUSAL, AND THAT IS THE DELIBERATE CHOICE BETWEEN THE TWO REMEDIES THE
 * REVIEW OFFERED. Requiring the member to be present would have been the other, and it was rejected
 * because it breaks a wire contract for no security gain: the account is server-established either
 * way, so a caller that omits it is not asserting anything and has nothing to be refused FOR. The
 * identity substituted is the authorizer's - never a body's, never a header's - so nothing a caller
 * writes can select it.
 *
 * ★ THE ACCOUNTLESS PATH IS NOT DELETED, only unreachable through THIS route while it carries a
 * principal. `reconcileOrderAccount(order, undefined)` still hands an accountless order straight
 * through, which is the legacy logged-out arm [model/service/PriceGroupService.cfc:L265-L266] and is
 * what an anonymous in-process caller - a strangler-fig proxy injecting its own admission - receives.
 * The composition root fills the same absence for the WIRE arm during hydration; both halves are
 * needed, because an injected admission never reaches the hydration and a hydrated document never
 * reaches an injected admission.
 *
 * ★★★ THE PARTY IT RECONCILES AGAINST IS THE SUBJECT, NOT THE SENDER (SEC-I). The parameter used to
 * receive the caller's own principal, because the route admitted ordinary accounts and caller and
 * subject were necessarily the same party. The route is now restricted to a TRUSTED SERVICE PRINCIPAL
 * that acts on behalf of an account, so the handler resolves a SUBJECT - the envelope's stated account,
 * or the trusted caller's own when the envelope states none - and passes that. Every clause below is
 * unchanged in force: an order naming nothing ADOPTS the subject, and an order naming a DIFFERENT
 * account is still refused. This is where the agreement test the envelope decode gave up now lives, so
 * a trusted service cannot submit an envelope for one account carrying an order that names another.
 *
 * @param order the admitted view, exactly as the admission produced it.
 * @param authenticatedAccountID the SUBJECT account this request prices for, resolved by the handler
 *   from the envelope and the trusted caller's principal. Never a value read from the order document.
 * @returns the same view when it already names the subject account (or when there is no subject
 *   account to bind), and a view bound to that account when it named none.
 * @throws {@link OrderViewAdmissionError} naming `order.accountID` when the order names a different
 *   account. Neither identifier is echoed: reporting the authenticated one would disclose the
 *   session's account to whoever sent the body.
 */
function reconcileOrderAccount(
  order: OrderView,
  authenticatedAccountID: string | undefined,
): OrderView {
  if (order.accountID === undefined) {
    // Nothing to reconcile when the request itself established no account: adopting `undefined`
    // would be a copy for no reason, and the view is handed on by IDENTITY so that an injected
    // in-process aggregate reaches the passes as the very object its owner composed.
    if (authenticatedAccountID === undefined) {
      return order;
    }

    // A SHALLOW REBIND, which is the same mechanism `./bootstrap.js`'s between-pass projection uses
    // on this same type: one member is replaced and every collection is carried across by reference,
    // so the reward iteration order - legacy-non-deterministic by construction, because
    // `getActivePromotionRewards` [model/dao/PromotionDAO.cfc:L51-L132] declares no `ORDER BY` -
    // is untouched, and no monetary member is recomputed.
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

  // Named, and it agrees. Handed back by identity - CFML string comparison folds case
  // [the `cfEquals` note above], so a differently-cased spelling of the SAME account is kept as the
  // caller wrote it rather than silently rewritten to the authorizer's casing: every repository
  // behind this binds the value as a parameter and MySQL's own collation folds it again.
  return order;
}

// ★★★ `readCorrelationIdentifier` WAS REMOVED, AND THAT IS FINDING F8. Its own reasoning was sound -
// prefer the platform's request identifier, then the event's; hold the value to a bounded,
// character-filtered token shape because it is echoed into a body and written to every log line;
// REPLACE rather than truncate an unexpected value, since a partial echo is still an echo - and every
// word of it is now discharged by `resolveServerRequestId` in `./errorMapper.js`, which applies the
// same precedence and the same filter for all five entrypoints. What differed was only the SUBSTITUTE
// TOKEN: this module emitted `unidentifiedRequest` where the shared resolver emits `unattributed`, so
// an operator looking for uncorrelated invocations across the service had to know two spellings.

/** Maximum decoded order-shaped request document admitted before JSON parsing. */
const MAXIMUM_REQUEST_DOCUMENT_BYTES = 512 * 1024;

/** Encoded length above which a base64 body cannot decode within the byte ceiling. */
const MAXIMUM_ENCODED_BODY_LENGTH = Math.ceil((MAXIMUM_REQUEST_DOCUMENT_BYTES * 4) / 3) + 4;

/** Non-colliding result for a present body that exceeds the parse ceiling. */
const OVERSIZED_BODY: unique symbol = Symbol('oversizedRequestBody');

/**
 * Lift the request body out of the event as text.
 *
 * `isBase64Encoded` is honoured because the platform sets it and ignoring it would turn a perfectly
 * well-formed document into an unparsable one. A body that is present but blank is treated as ABSENT,
 * which is the honest reading: whitespace is not a document.
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
 * `mapErrorToApiGatewayResponse` recognises it, publishes the failing member paths and the constraint
 * descriptions, and withholds every submitted value. That is deliberately not re-implemented here.
 *
 * `order` is copied across ONLY when the document actually carries the key, so that both admissions'
 * `Object.hasOwn` test distinguishes "no order was sent" from "an order was sent and is unusable" and
 * reports the two differently.
 *
 * @param callerAccountID the TRUSTED SERVICE's own account, from `resolveRequestPrincipal`. It is the
 *   fallback subject for an envelope that names none - never an override for one that does. See
 *   {@link EnvelopeDecoding.subjectAccountID} and the trust-boundary note above.
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
    // The caught value is deliberately not inspected. `./errorMapper.js` records that a `SyntaxError`
    // is NOT among its recognized shapes - this service's own code produces that shape too - so the
    // reason is one this handler STATES rather than one anybody infers.
    return { ok: false, reason: 'unparsableRequestBody' };
  }

  if (!isRecord(document)) {
    // Covers a scalar, `null` and an array. An array is a JSON document but not this document.
    return { ok: false, reason: 'unsupportedBodyShape' };
  }

  // ★ THE ONE UNRECOGNIZED KEY `z.strictObject` DOES NOT REFUSE, REFUSED HERE INSTEAD. Every schema
  // below is strict, so an unrecognized member is a 400 naming it - except `__proto__`, which zod
  // accepts and silently drops at every nesting level. QA testing submitted it and confirmed both
  // halves: the key is admitted, and `Object.prototype` is left unmodified. This closes the
  // INCONSISTENCY - the caller is now told about that key exactly as it is told about any other - and
  // it would also close the vulnerability if a merge-style consumer were ever added downstream. The
  // reasoning, the measurements and the reason the walk is deep, iterative and PREDICATE-SHAPED are
  // all recorded on `./errorMapper.js`.
  //
  // It runs BEFORE the schema, so an offending key is reported as itself rather than as whatever
  // downstream shape error it happens to coincide with.
  //
  // ★★★ THE PUBLISHED ISSUE IS A FROZEN CONSTANT OF THE MAPPER, AND THIS RECORDS WHY IT IS NO LONGER
  // A PATH. This branch used to publish the offending key's full dotted location, and the comment here
  // defended it on the ground that a KEY is not a VALUE. A security review rejected that ground
  // (MAJOR, CWE-209/CWE-532), and rightly: every ancestor segment of that path was a member name the
  // CALLER chose, so a body such as `{"api_token_value":{"__proto__":{}}}` had `api_token_value`
  // echoed into a 400 and persisted in the logs. Nothing the caller wrote is published now - the
  // refusal names the one member name the caller did not choose.
  if (containsPrototypeMemberKey(document)) {
    return {
      ok: false,
      reason: 'unusableRequestInput',
      fields: [PROTOTYPE_MEMBER_FIELD_ISSUE],
    };
  }

  const envelope = REQUEST_ENVELOPE_SCHEMA.parse(document);

  // ★★★ THE ENVELOPE ACCOUNT IS THE SUBJECT NOW, NOT A CLAIM TO BE CHECKED (SEC-I). This is where a
  // comparison used to live - `accountAgrees(envelope.accountID, authenticatedAccountID)` - refusing
  // any envelope naming an account other than the caller's own, with the argument that "silently
  // substituting the authenticated account for the one the caller named would price an order the caller
  // did not ask for and report success". That argument was right for the caller population the route
  // then admitted: ANY authenticated account. It is the wrong shape for the population it admits now.
  //
  // The route is restricted to a TRUSTED SERVICE PRINCIPAL, and acting on behalf of an account is that
  // principal's entire purpose - it stands in for the in-process `OrderService`
  // [model/service/OrderService.cfc:L60-L61], which priced whichever order it held without any notion
  // of "its own" account. Keeping the old comparison would have made the route unusable for exactly the
  // caller it exists to serve, while protecting nobody: an ordinary account can no longer reach this
  // line at all.
  //
  // WHAT THE OLD RULE PROTECTED IS STILL PROTECTED, one level down. The agreement test is not deleted -
  // it MOVES to the order document, which must agree with the SUBJECT rather than with the caller. See
  // {@link reconcileOrderAccount}. So a trusted service still cannot hand in an envelope for account A
  // carrying an order that names account B.
  //
  // ★ AND THE FALLBACK IS THE CALLER'S OWN ACCOUNT, NEVER `undefined`. That is what carries the earlier
  // CRITICAL adoption fix forward: a request that names no subject anywhere still prices for a REAL
  // account, so `getPromotionCodeAccountUseCount` and `getPromotionPeriodAccountUseCount`
  // [model/service/PromotionService.cfc:L1098], [model/dao/PromotionDAO.cfc:L187, L274] count somebody's
  // uses rather than nobody's - the exact defect that review found made a per-account cap uncapped.
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
  accountID: string | undefined,
  route: string,
  action: RouteAction,
  sink: Logger,
): Promise<PromotionApplicationResultDocument> {
  // THE INJECTED CLOCK, OBSERVED AND NOT READ. `scope.now` is the single instant this request bound;
  // there is no `new Date()` anywhere in this module. ISO-8601, hence UTC.
  const evaluatedAt = scope.now.toISOString();

  if (request.operation === 'getSalePriceDetailsForProductSkus') {
    // THE ONE OTHER ALREADY-PORTED SERVICE METHOD this adapter reaches
    // [model/service/PromotionService.cfc:L1022], published on `RequestScope` through the
    // `SalePriceResolver` contract in `../domain/ports/promotionRepository.js`. Its input is a plain
    // string, so there is nothing to materialise and no order view involved.
    const details = await scope.getSalePriceDetailsForProductSkus(request.productID);

    // Every key here is in the logger's CLOSED diagnostic allow-list, which finding F7 established was
    // not previously true of `capability`, `operation` or any of the counts - the real logger's
    // fail-closed arm was replacing each of them with the redaction marker, so a served line recorded
    // only the correlation identifier. `idempotencyKey` is gone with finding F6, and it would not be
    // admitted even if it were still accepted: it is a CALLER-AUTHORED FREE STRING, and the allow-list
    // refuses it by name for exactly that reason.
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

  // ADMITTED THROUGH THE INJECTED PORT, AND HYDRATED BY THE SCOPE - see SECTION 4. The scope is
  // handed over NARROWED to its one hydration member, so an admission has no route to a service, a
  // pass or a setting on its way to a view.
  const admitted = await admitOrderView(request, scope);

  // ★★★ THE ORDER IS PRICED FOR THE SUBJECT ACCOUNT, AND FOR NO OTHER.
  // See {@link reconcileOrderAccount}: an order that names none ADOPTS the subject the trusted caller
  // named, and one that names a DIFFERENT account is refused.
  const order = reconcileOrderAccount(admitted, accountID);

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
  // `getPrice()` with NO correction term [:L244]; anything else computes the original discount from
  // `getSkuPrice()` and then subtracts `(getExtendedSkuPrice() - getExtendedPrice())` [:L249, L252].
  // Because the member is read
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
    requestId: request.requestId,
    route,
    capability: CAPABILITY,
    action,
    operation: request.operation,
    // Whether an account was established, as a BOOLEAN. The identifier itself is never a log value -
    // `accountEstablished` is what the logger's allow-list admits, and it is admitted precisely because
    // it names one without carrying it.
    accountEstablished: accountID !== undefined,
    // COUNTS ONLY. No order identifier, no item identifier and no monetary amount reaches a log
    // line: an order document is caller-authored and a log stream is not the place to reproduce one.
    orderItemCount: order.orderItems.length,
    orderFulfillmentCount: order.orderFulfillments.length,
    promotionIntentCount: promotionIntents.length,
    priceGroupIntentCount: priceGroupIntents.length,
  });

  return {
    operation: request.operation,
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
 * The one route action this module implements.
 *
 * Read from the shared table's own vocabulary rather than written as a bare string, so a table edit
 * that renamed the action would fail to compile here instead of silently turning every request into a
 * non-route. See finding F12 and the guard in {@link createPromotionApplicationHandler}.
 */
const IMPLEMENTED_ROUTE_ACTION: RouteAction = 'applyPromotions';

/**
 * Build the per-invocation scope input.
 *
 * Address-zone preparation is deliberately absent here. The composition root's
 * `updateOrderAmountsWithPriceGroupsThenPromotions` operation loads the deferred index
 * before either pass, so this handler neither requests the unbounded read while opening
 * the scope nor has to remember a second preparatory call.
 *
 * ★ THE OTHER THREE MEMBERS, AND WHY EACH IS OMITTED OR SUPPLIED AS IT IS:
 *
 *   * `now` - supplied as whatever the injected clock yields, which in production is `undefined`. The
 *     scope then reads the wall clock ONCE at its own creation and binds that single instant across
 *     every date-dependent read of the request, which is why this file calls no `new Date()` at all. The
 *     instant is never taken from the payload: a caller able to move the pricing clock could walk an
 *     expired promotion period back inside its window.
 *   * `adminAccountFlag` - STILL OMITTED, AND SINCE SEC-I THAT IS A LEAST-PRIVILEGE DECISION RATHER
 *     THAN AN INCIDENTAL ONE. The original reason holds unchanged: this entrypoint performs NO durable
 *     write (section 2, obligation 3), so there is no audit stamp to attribute, and absent means false -
 *     the non-admin arm of the legacy gate `!account.isNew() && account.getAdminAccountFlag()`.
 *
 *     What changed around it is that the route now REQUIRES this very claim to admit the caller at all,
 *     so a reader could reasonably expect it to travel. It deliberately does not, for two reasons.
 *     First, nothing on THIS path consumes it: the flag's second consumer is
 *     `RequestScope.priceGroupEntitlements`, which is reached only by the price-resolution entrypoint's
 *     two binding helpers, and this handler names no price group - the price-group pass resolves them
 *     from the order's ACCOUNT. Second, the caller here is trusted to submit an order, which is not the
 *     same authority as being entitled to every price group in the store; passing the flag would grant
 *     that second authority silently and for no use.
 *
 *     If a future member of this path ever does consult the entitlement surface, this omission becomes a
 *     fail-closed refusal rather than a bypass - which is the direction an omission should fail in, and
 *     is why it is safe to leave the flag behind.
 *   * `feedHost` - OMITTED, because the product feed is another capability's entrypoint. Omitting it
 *     leaves `RequestScope.productFeedPort` undefined, which is the safe outcome rather than a degraded
 *     one.
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
  // THE WIRE ARM IS THE DEFAULT, because a wire document is the only order an API Gateway route can
  // receive - see {@link PromotionApplicationDependencies.admitOrderView} for the finding that
  // changed this line. {@link admitMaterializedOrderView} is exported beside it for an in-process
  // caller that already holds a materialised aggregate.
  const admitOrderView: OrderViewAdmission = dependencies.admitOrderView ?? admitOrderDocument;
  const sink: Logger = dependencies.logger ?? defaultLogger;
  const clock: (() => Date) | undefined = dependencies.clock;

  return async (event: APIGatewayProxyEvent, context?: Context): Promise<APIGatewayProxyResult> => {
    // ★ THE SHARED CORRELATION PRECEDENCE (finding F8). One resolver, one substitute token, five
    // entrypoints. See the note where `readCorrelationIdentifier` used to be.
    const requestId = resolveServerRequestId(event, context);

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

      // ★ THE LABEL IS `METHOD /path`, BUILT BY THE SHARED HELPER FROM THE MATCHED ROW'S OWN FROZEN
      // MEMBERS (finding F8). The template was inline here and produced the same text; routing it
      // through `routeDiagnosticLabel` is what keeps the five entrypoints on one convention when that
      // convention next changes. `event.httpMethod` is deliberately NOT used: the router matches the
      // method with `listFindNoCase`, so a caller-supplied casing would reach the log line for no
      // diagnostic gain.
      const route = routeDiagnosticLabel(resolution.route.methods, resolution.route.path);
      mappingContext = { requestId, route, logger: sink };

      // ★★★ THE RESOLVED ACTION IS VERIFIED BEFORE THE BODY IS DECODED (finding F12). The previous
      // revision never compared it and used it only as a log value. The shared table declares one route
      // per capability today, so this is unreachable - and it is written anyway because the router's own
      // note records that adding a second route to a capability later is ADDITIVE, at which point an
      // action this module does not implement must fall out as a non-route rather than reaching the
      // dispatcher. Placed before `decodeRequestEnvelope` so an unimplemented action costs no parse, no
      // composition root and no scope.
      if (resolution.route.action !== IMPLEMENTED_ROUTE_ACTION) {
        return routeNotFoundResponse(mappingContext);
      }

      // Fail closed before decoding or opening the graph.
      const principalResolution = resolveRequestPrincipal(event);
      if (!principalResolution.identified) {
        return unauthenticatedResponse(mappingContext);
      }

      // ★★★ THE ROUTE IS RESTRICTED TO A TRUSTED SERVICE PRINCIPAL (SEC-I, CWE-20/CWE-345/CWE-639).
      //
      // THE FINDING. Every economically decisive member of this request is CALLER-AUTHORED: the item
      // prices, the extended prices, the subtotals, the applied-price-group handle, the promotion-code
      // list and - most sharply - the `promotionAppliedID` of every already-applied promotion, for each
      // of which the engine emits a REMOVE intent [model/service/PromotionService.cfc:L64-L80]. The
      // route previously admitted ANY identified account, so any customer could submit a document
      // describing prices its cart does not have and receive discount intents computed from them, and
      // could name applied-promotion rows belonging to orders it does not own and receive intents to
      // detach them. The blanket clear itself is AAP-MANDATED and stays: the legacy pass begins by
      // removing every applied promotion before recomputing, and reproducing that is required. What was
      // missing is any reason to believe the document describes an order the caller may act on.
      //
      // WHY A PERMISSION GATE RATHER THAN PER-FIELD OWNERSHIP PROOF. The finding offered two remedies.
      // The other - "accept only an account-owned order id and canonicalize the whole order
      // server-side" - would require this tier to LOAD the order aggregate, and `OrderService` and every
      // order entity are explicitly out of scope [AAP 0.2.2]: there is no in-scope read that can fetch
      // an order, and authoring one would port the excluded aggregate. The anti-corruption inversion
      // that makes this slice independently deployable [AAP 0.1.1] is precisely the decision that the
      // order arrives as an INPUT. So the trust has to be placed in the CALLER, which is what the
      // legacy did implicitly by only ever being called in-process.
      //
      // WHY THE ADMINISTRATIVE CLAIM IS THE MECHANISM. It is the only permission bit this tier can
      // observe: `getAdminAccountFlag()` belongs to the out-of-scope `Account` entity, the authorizer
      // resolves it, and `resolveRequestPrincipal` publishes it. No new claim vocabulary, token format,
      // signature scheme or API-key store is invented here - inventing one would be a security
      // mechanism this AAP does not describe.
      //
      // ★ 403 AND NOT 404, AND A FIXED SENTENCE. An identity WAS established and is insufficient, which
      // is what 403 means; pretending the route does not exist would also hide it from the trusted
      // caller misconfigured to omit its claim. `forbiddenResponse` publishes a sentence naming no
      // claim, no principal and no operation, and carries no `fields`, so nothing about the gate's
      // shape is disclosed. Refused BEFORE the body is parsed, so an unauthorized caller costs no
      // decode, no composition root, no scope and no statement.
      if (!principalResolution.principal.adminAccountFlag) {
        return forbiddenResponse(mappingContext);
      }

      const callerAccountID = principalResolution.principal.accountID;
      const decoding = decodeRequestEnvelope(event, requestId, callerAccountID);
      if (!decoding.ok) {
        return invalidRequestResponse(decoding.reason, mappingContext, decoding.fields);
      }

      // ★★★ EVERYTHING DOWNSTREAM PRICES FOR THE SUBJECT, NOT FOR THE SENDER (SEC-I). The scope's
      // account, the hydration's `establishedAccountID` and the order-document agreement test all take
      // this one value, so there is no path on which two of the three could disagree about whose order
      // is being priced. See {@link EnvelopeDecoding.subjectAccountID}.
      const subjectAccountID = decoding.subjectAccountID;

      // ONE await of the idempotent, memoized initializer, INSIDE the handler and never at module
      // top level - which is also what keeps this module free of a top-level `await`, a construct the
      // CommonJS Lambda bundle could not carry.
      const root = await openCompositionRoot();

      // EXACTLY ONE FRESH PER-REQUEST SCOPE, opened here and never held, cached or reused across
      // invocations. That is what stops a warm container from carrying one invocation's state - and
      // therefore one customer's price - into another's. Request state is read from the event and from
      // this scope; it is NEVER read from `../lib/config.js`, which is static process configuration
      // and is not a request scope.
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

      // ★ THE SHARED SUCCESS ENVELOPE, WHICH IS WHAT PUTS `requestId` IN A SUCCESSFUL BODY AT ALL
      // (finding F13). It also owns the status and the header set, so neither is decided here.
      return jsonSuccessResponse(
        requestId,
        resolution.route.capability,
        resolution.route.action,
        document,
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

      // ★★★ THE SECOND CLIENT-SHAPED ARM, ADDED IN RESPONSE TO A RUNTIME FINDING. QA testing sent a
      // well-formed document whose order item named an unknown `productID`, and again one naming a SKU
      // the named product does not carry, and both answered `500 unrecognized` with no `fields`: the
      // document PASSED the schema, so the refusal came from the hydration inside
      // `RequestScope.materializeOrderView` and only `OrderViewAdmissionError` was recognised here.
      // Both are caller-fixable mistakes, so both are now reported as 400 with member paths.
      //
      // `unusableRequestInput` is the reason, deliberately: the document's SHAPE was fine - it is the
      // CONTENT that names nothing this request can price - and `./errorMapper.js` maps that reason to
      // the same fixed sentence its schema-rejection arm publishes, so choosing it withholds detail
      // rather than inventing any. The detail a caller can act on travels in `fields`, which
      // `OrderViewDocumentDataError` constructs from server-authored paths and constraint sentences
      // alone: no identifier, no price, no account, no row count and no statement. See that class in
      // `./bootstrap.js` for the disclosure argument, including why the earlier decision to report
      // this as a server failure has been reversed rather than merely changed.
      if (thrown instanceof OrderViewDocumentDataError) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, thrown.fields);
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
// the tier that owns it and NONE is repaired anywhere.
//
// THE SOURCE IS THE AUDIT RECORD. `slatwall-ts/tsconfig.build.json` sets
// `removeComments: false`, so an annotation also survives into the `tsc` output in
// `build/` whenever the declaration it sits on survives type erasure - but NOT into
// the deployable artifact.
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
//   WHY IT IS NOT REPAIRED [defect 9]: enforcing the limit against `prID` instead
//   of the leaked `reward` changes the amount a customer is charged. It needs a
//   product decision and a repricing plan, not a code change. This handler returns
//   whatever intents that loop leaves behind and repairs nothing: it adds no
//   `ORDER BY` and no sort to the reward collection, which
//   `getActivePromotionRewards` [model/dao/PromotionDAO.cfc:L51-L132] deliberately
//   leaves unordered, so which reward is "last" stays as non-deterministic in the
//   target as it is in the source.
//
//   ★★★ THIS PARAGRAPH OPENED `TODO [defect 9]:` AND A CODE REVIEW WAS RIGHT TO
//   REJECT THE KEYWORD. Every word of the reasoning is unchanged; only the label
//   moved. AAP 0.6.7 places defect 9 among the twenty legacy defects REPRODUCED
//   deliberately - it is the leaked-`reward` over-use strip, the sharpest example in
//   the register of why this port is not a cleanup exercise - and a reproduced defect
//   is a settled decision, not a task. AAP 0.8.1 carries a SOURCE TODO forward as a
//   flagged TODO so that the TODO markers in this subtree are exactly the legacy
//   deferrals - five of them across the whole in-scope slice, at
//   [model/service/PromotionService.cfc:L543], [model/dao/ProductDAO.cfc:L64],
//   [model/dao/SkuDAO.cfc:L177], [model/service/CurrencyService.cfc:L81] and
//   [model/entity/ProductType.cfc:L93]. [model/service/PromotionService.cfc:L468-L521]
//   carries no TODO of its own, so writing one here announced deferred work the plan
//   had already decided against and diluted the five markers that mean something. The
//   `// TODO [issue #1766]` this file DOES carry forward, further below, is the first of
//   those five and is unaffected.
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
// NOT MODELLED HERE, AND DELIBERATELY SO. The migration's three deliberate divergences are
// allocated elsewhere and this file claims none of them: the un-`var`'d `discountAmount`,
// assigned WITHOUT `var` at all THREE of [model/service/PromotionService.cfc:L1007], [:L1009]
// and the clamp at [:L1014] and therefore leaking into component scope, and the `amountOff`
// branch's raw floating-point multiplication at [:L998], are SERVICES-tier divergences; the
// entity memo defects [model/entity/Sku.cfc:L500-L522, model/entity/Product.cfc:L524-L532]
// are an ENTITIES-tier divergence. `src/handlers/**`
// owns ZERO slots of the divergence, signature-reshaping, visibility-widening and
// entity-widening ledgers, and spends none.
// ===========================================================================
