/**
 * Read-only order shapes: the ROOT of the anti-corruption boundary between the ported promotion
 * and price-group engines and the Order aggregate, which stays in CFML.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS THE KEYSTONE OF THE SLICE
 *
 * `PromotionService.updateOrderAmountsWithPromotions(required any order)`
 * [model/service/PromotionService.cfc:L58] takes an Order, and
 * `PriceGroupService.updateOrderAmountsWithPriceGroups(required any order)`
 * [model/service/PriceGroupService.cfc:L364] takes one too - yet `model/service/OrderService.cfc`
 * and every order, cart and checkout entity are out of scope. `OrderView` is the mechanism by
 * which that out-of-scope aggregate becomes an INPUT to an in-scope engine rather than a
 * DEPENDENCY of it, and that is what makes this slice independently deployable.
 *
 * THE CALL DIRECTION IS INVERTED HERE, NOT FOLLOWED. In the legacy system the orchestrator owns
 * the engines: `model/service/OrderService.cfc` declares sixteen injected collaborators
 * [model/service/OrderService.cfc:L51-L67], two of which are the in-scope services -
 * `property name="priceGroupService";` [model/service/OrderService.cfc:L60] and
 * `property name="promotionService";` [model/service/OrderService.cfc:L61] - and it drives them
 * both [model/service/OrderService.cfc:L129, L132]. In the target the engines own nothing: they
 * receive this shape and return intents. That is the strangler-fig seam, and the two services
 * sitting immediately beneath the out-of-scope orchestrator are precisely where it belongs.
 *
 * THIS IS NOT A 19TH DOMAIN ENTITY. The entity count under `src/domain/entities/` is closed at
 * eighteen and nothing here extends it. `model/entity/Order.cfc` was read for its ORM type
 * declarations and for nothing else; what follows is a PROJECTION of that entity, never a port of
 * it. There is no Order entity in this domain, no mutable aggregate, no persistence surface and no
 * ORM handle. `model/service/OrderService.cfc` was read only to census its injected collaborators
 * and the sequence in which it calls them - reading a file never turned it into a write target.
 *
 * THE FIVE INVARIANTS THESE SHAPES UPHOLD
 *
 *   1. READ-ONLY, ABSOLUTELY. Every member is `readonly` and every collection is a
 *      `readonly T[]`, nested structures included. There is no setter, no mutator, no
 *      `add*`/`remove*` helper, no persistence method, no ORM handle, no `save`, no `delete` and
 *      no method of any kind. This module declares types only and emits zero runtime JavaScript.
 *   2. NO MUTATION OF ORDER STATE, EVER. Legacy `updateOrderAmountsWithPromotions` returns void
 *      and mutates the order aggregate in place - `newAppliedPromotion.setOrder( arguments.order )`
 *      [model/service/PromotionService.cfc:L450] hands the live entity to a new persistent row,
 *      whose owning foreign key is declared at [model/entity/PromotionApplied.cfc:L61]. The target
 *      returns applied-promotion intents keyed by the opaque identifiers below instead. That is the
 *      single most consequential signature change in this migration, and it exists precisely
 *      because the order aggregate is out of scope. The same inversion applies to
 *      `PriceGroupService.updateOrderAmountsWithPriceGroups`.
 *   3. OPAQUE IDENTIFIERS. `orderID` is a plain string, and the out-of-scope Account is reduced to
 *      a plain `accountID`. Neither is ever dereferenced into an out-of-scope entity.
 *   4. MONEY IS `Money`. Every monetary member is the `Money` value object, never a `number`. The
 *      one plain `number` here is `totalSaleQuantity`, which is a count.
 *   5. NO ORM, NO LAZINESS. Collections arrive already populated, resolved by whatever constructs
 *      the view. These shapes never simulate lazy loading and never reach a port.
 *
 * ===========================================================================================
 * THE EXECUTION-ORDERING CONSTRAINT - AUTHORITATIVE STATEMENT
 *
 *   `PriceGroupService.updateOrderAmountsWithPriceGroups` MUST RUN BEFORE
 *   `PromotionService.updateOrderAmountsWithPromotions`.
 *
 * This module is where that constraint is authoritatively recorded; the notes on
 * `OrderItemView.appliedPriceGroup` and in `src/domain/ports/priceGroupRepository.ts`
 * cross-reference it.
 *
 * THE REASON IS [model/service/PromotionService.cfc:L241-L254], verbatim:
 *
 *   L241 if( isNull(orderItem.getAppliedPriceGroup()) || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() ) ) {
 *   L244   var discountAmount = getDiscountAmount(reward, orderItem.getPrice(), discountQuantity);
 *   L246 } else {
 *   L249   var originalDiscountAmount = getDiscountAmount(reward, orderItem.getSkuPrice(), discountQuantity);
 *   L252   var discountAmount = precisionEvaluate('originalDiscountAmount - (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())');
 *   L254 }
 *
 * The discount BASE is chosen differently for a price-group-eligible item than for an ineligible
 * one, and the discriminator `appliedPriceGroup` is WRITTEN by the price-group pass
 * [model/service/PriceGroupService.cfc:L371] and READ by the promotion pass
 * [model/service/PromotionService.cfc:L241].
 *
 * IN THE LEGACY SYSTEM THIS HELD ONLY BECAUSE THE ORCHESTRATOR HAPPENED TO CALL THEM IN THAT
 * SEQUENCE. `model/service/OrderService.cfc` is the only caller of either method anywhere in the
 * repository, and it states the intent in a comment while enforcing it with nothing but statement
 * order:
 *
 *   L128 // First Re-Calculate the 'amounts' base on price groups
 *   L129 getPriceGroupService().updateOrderAmountsWithPriceGroups( arguments.order );
 *   L131 // Then Re-Calculate the 'amounts' based on permotions ext.  This is done second so that the order already has priceGroup specific info added
 *   L132 getPromotionService().updateOrderAmountsWithPromotions( arguments.order );
 *
 * In the target the ordering must be explicit and non-optional in the composition root, and a test
 * must assert that reversing the two passes changes the computed discount. Because `OrderItemView`
 * carries BOTH price bases and BOTH extended prices, neither arm of the L241 discriminator is
 * lost.
 * ===========================================================================================
 *
 * THE THREE MUTATION SURFACES THESE SHAPES REPLACE
 *
 * (a) THE THREE BACKWARDS CLEAR-OUT LOOPS ARE REPLACED, NOT REPRODUCED. Before the main
 *     iteration the legacy engine removes every previously-applied promotion in three loops that
 *     count DOWN - the standard CFML idiom for removing while iterating:
 *     [model/service/PromotionService.cfc:L64-L68] for order items, reached as
 *     `order.getOrderItems()[oi].getAppliedPromotions()[pa].removeOrderItem()`;
 *     [model/service/PromotionService.cfc:L71-L75] for order fulfillments, ending in
 *     `removeOrderFulfillment()`; and [model/service/PromotionService.cfc:L78-L80] for the order
 *     itself, ending in `removeOrder()`. All three collections are exposed here as `readonly`, and
 *     the engine MUST NOT remove from them. The intent-returning inversion replaces the removal
 *     ENTIRELY: a consumer emits its own complete set of applied-promotion intents and whatever
 *     persists them reconciles against what is already stored. Nothing in this module offers a
 *     `removeAppliedPromotions`, a mutable array or any other deletion affordance, and none may be
 *     added. Note also that ITEM-level applied promotions are reached only through this order-level
 *     traversal, which is exactly why `OrderItemView` correctly has no `appliedPromotions` member.
 *
 * (b) THE INVERSION IS THREE-WAY: ADD, UPDATE-AMOUNT AND REMOVE. At order level the legacy engine
 *     performs three distinct kinds of mutation on `appliedPromotions`, all of them behind the
 *     `discountAmount > 0` gate at [model/service/PromotionService.cfc:L424]:
 *       UPDATE - [model/service/PromotionService.cfc:L435]
 *                `arguments.order.getAppliedPromotions()[1].setDiscountAmount(discountAmount)`,
 *                taken when the already-applied promotion is the SAME promotion
 *                [model/service/PromotionService.cfc:L434];
 *       REMOVE - [model/service/PromotionService.cfc:L439]
 *                `arguments.order.getAppliedPromotions()[1].removeOrder()`, taken when it is a
 *                DIFFERENT promotion, which then falls through to the add;
 *       ADD    - [model/service/PromotionService.cfc:L446-L451]: `this.newPromotionApplied()`
 *                (L447), `setAppliedType('order')` (L448), `setPromotion(...)` (L449),
 *                `setOrder( arguments.order )` (L450), `setDiscountAmount(...)` (L451).
 *     The fulfillment-level block [model/service/PromotionService.cfc:L378-L406] is structurally
 *     identical: initialisation test L381, `[1]` comparison L385, same-promotion test L388, UPDATE
 *     L389, REMOVE L393, ADD L401-L405 with `setAppliedType('orderFulfillment')`. The item-level
 *     apply [model/service/PromotionService.cfc:L524-L537] is add-only, with
 *     `setAppliedType('orderItem')` at L531.
 *     A CONSUMER DESIGN THAT EMITS ONLY "ADD" INTENTS CANNOT REPRODUCE L435 OR L439 AND WOULD
 *     SILENTLY CHANGE MONEY. This finding is recorded here so the consumer inherits it.
 *
 *     THE `readonly` INVARIANT IS DOING REAL WORK, not decorating. Because `appliedPromotions` is
 *     a `readonly` array and `AppliedPromotionView.discountAmount` is a `readonly` member,
 *     `setDiscountAmount` and `removeOrder` are STRUCTURALLY IMPOSSIBLE to express against this
 *     shape. The compiler enforces the seam; no reviewer has to.
 *
 * (c) THE PRICE-GROUP MUTATION SITES. `updateOrderAmountsWithPriceGroups` writes order items at
 *     [model/service/PriceGroupService.cfc:L370] `setPrice( priceGroupDetails.price )` and
 *     [model/service/PriceGroupService.cfc:L371] `setAppliedPriceGroup( priceGroupDetails.priceGroup )`,
 *     both behind the gate at [model/service/PriceGroupService.cfc:L365]
 *     `!isNull(arguments.order.getAccount()) && arrayLen(arguments.order.getAccount().getPriceGroups())`.
 *     Both writes are replaced by returned price-group intents. THIS VIEW CARRIES ONLY
 *     `accountID`: the L365 price-group lookup is satisfied inside the service tier through
 *     `src/domain/ports/priceGroupRepository.ts`, so no price-groups collection belongs here.
 *     A normalisation to note but NOT to carry: [model/service/PriceGroupService.cfc:L262-L268]
 *     reaches ambient request state through `getSlatwallScope()` at L263 and `getHibachiScope()`
 *     at L264 within the same seven-line method. Both are replaced by an explicit context
 *     parameter OWNED BY THE SERVICE TIER, so no current-account context member belongs here
 *     either.
 *
 * WHAT THESE SHAPES DELIBERATELY DO NOT DECLARE. No applied-promotion intent type and no
 * price-group intent type: those are the OUTPUT of the inversion and belong to a consumer subtree
 * (`src/domain/promotionEngine/**` or `src/services/**`). These three view modules declare INPUT
 * shapes only. No current-account context, per (c). No price-groups collection, per (c). No
 * thirteenth member on `OrderView`, because the census in `OrderView`'s own documentation is
 * exhaustive and closed.
 *
 * THE SIX EMPTY-COLLECTION SEMANTICS. An empty collection does not mean one thing in the legacy
 * source, it means six, and collapsing any of them into another changes money. The
 * fulfillment-side detail lives in `orderFulfillmentView.ts`; the whole set is referenced here
 * because a consumer of `OrderView` meets all six:
 *   1. PERMISSIVE on a REWARD's restriction collections - empty means NO RESTRICTION. The
 *      three-way fulfillment gate [model/service/PromotionService.cfc:L351-L355] reads
 *      `!arrayLen(reward.getFulfillmentMethods()) || reward.hasFulfillmentMethod(...)`, and the
 *      address-zone pattern [model/service/PromotionService.cfc:L357-L368] opens with
 *      `var addressIsInZone = true;` and only flips it to false once a zone collection proves
 *      non-empty. The same pattern recurs at [model/service/PromotionService.cfc:L1059-L1061].
 *   2. RESTRICTIVE in the EVALUATOR - the exact opposite. `isAddressInZone`
 *      [model/service/AddressService.cfc:L57-L58] initialises `addressInZone = false` and L60
 *      loops the zone's locations, so a zone with zero locations stays false: NOT IN ZONE.
 *   3. `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] returns FALSE on an empty
 *      entity array.
 *   4. The fulfillment three-way gate additionally carries the `[1]` assumption
 *      [model/service/PromotionService.cfc:L385-L393].
 *   5. `Brand.getProducts()` defaults to `[]` - declared `type="array"`
 *      [model/entity/Brand.cfc:L61] and asserted by the one legacy test that touches it
 *      [meta/tests/unit/entity/BrandTest.cfc:L58-L60].
 *   6. `!arrayLen(getAppliedPromotions())` [model/service/PromotionService.cfc:L427] at order
 *      level and [model/service/PromotionService.cfc:L381] at fulfillment level is a
 *      FIRST-WRITER-WINS INITIALISATION test - neither rule 1 nor rule 2. Keep it separate.
 *
 * AN ANTI-CORRUPTION TENSION, DOCUMENTED HERE AND ENFORCED ELSEWHERE. Because the domain exposes
 * deliberately-unmaterialized collections as empty readonly arrays, the delete-context
 * `maxCollection: 0` rules that reference them would trivially PASS in TypeScript where they
 * BLOCK in CFML: `"appliedOrderItems": [{"contexts":"delete","maxCollection":0}]`
 * [model/validation/PriceGroup.json:L5] and `"orders": [{"contexts":"delete","maxCollection":0}]`
 * [model/validation/PromotionCode.json:L12]. Both reciprocals point back at the order aggregate,
 * which reaches the in-scope engines as this read-only view and never as an association - so an
 * empty array here is an ABSENCE OF DATA, not evidence of a zero count. The consequence is
 * recorded here; enforcing those two rules belongs to the service and repository tiers, which can
 * count the rows.
 *
 * PARAMETERIZED SQL: NOT APPLICABLE HERE - stated rather than silently omitted. This module
 * declares types only and contains no query, no query helper and no database access of any kind.
 * The project-wide obligation to use prepared statements exclusively, which preserves the
 * injection safety `cfqueryparam` provided, rests wholly with `src/repositories/mysql/**` - the
 * only layer that speaks to the `Sw*` schema.
 *
 * TEST COVERAGE FOR THESE SHAPES IS NET-NEW, NOT PARITY. No legacy test under `meta/tests/`
 * touches any order-shaped input, so nothing here traces to a legacy antecedent and none of it may
 * be presented as carried-forward coverage. The golden multi-item, multi-reward order fixture that
 * drives the promotion pipeline end to end belongs to the test tier, not to this module.
 *
 * JUDGMENT CALL: a value the legacy schema permits to be absent is modelled as a REQUIRED member
 * whose type includes `undefined`, never as an optional `?:` member, because
 * `exactOptionalPropertyTypes` is enabled and an omitted key and a present-but-undefined key are
 * different states under it. The producer of these views must STATE an absence rather than omit
 * it. This matches the convention both sibling view modules already follow.
 */

import type { Money } from '../valueObjects/money.js';
import type { CurrencyCode } from '../valueObjects/currencyCode.js';
import type { OrderItemView } from './orderItemView.js';
import type {
  AppliedPromotionView,
  OrderFulfillmentView,
  ShippingMethodView,
} from './orderFulfillmentView.js';

/**
 * The order's type, reduced to the single field the engine reads.
 *
 * CFML parity [model/entity/Order.cfc:L65]: the legacy association is to the generic `Type`
 * entity, declared
 *
 *   property name="orderType" cfc="Type" fieldtype="many-to-one" fkcolumn="orderTypeID"
 *     hb_optionsSmartListData="f:parentType.systemCode=orderType";
 *
 * `Type` is out of scope, and the promotion engine reads exactly one field from it - the system
 * code. Carrying anything else would invent state no in-scope call site reads.
 *
 * Declared beside the main exported unit rather than in a file of its own: `src/domain/views/` is
 * complete at three modules - `orderItemView.ts`, `orderFulfillmentView.ts` and this one - and the
 * in-repo precedent for an auxiliary type living next to the unit it serves is the branded
 * `DecimalString` in `src/lib/cfml/numberFormat.ts`. `orderItemView.ts` declares its own
 * order-item-type shape locally by the same pattern: same pattern, different name, different
 * semantics, zero coupling between the two.
 */
export interface OrderTypeView {
  /**
   * The type's system code.
   *
   * The RAW string is carried rather than a narrowed union, because the legacy comparisons are
   * `listFindNoCase` tests against literals drawn from a `SwType` table this port does not
   * enumerate; narrowing here would reject codes the database legitimately holds.
   *
   * TWO GATES READ IT, AND THEY OVERLAP DELIBERATELY.
   *   * [model/service/PromotionService.cfc:L61] is the engine entry gate:
   *     `listFindNoCase("otSalesOrder,otExchangeOrder", arguments.order.getOrderType().getSystemCode())`.
   *     Everything the promotion engine does sits inside it, so an order type outside that list
   *     produces no discounts at all.
   *   * [model/service/PromotionService.cfc:L542] is a SECOND, independent gate:
   *     `listFindNoCase("otReturnOrder,otExchangeOrder", arguments.order.getOrderType().getSystemCode())`.
   *
   * `otExchangeOrder` appears in BOTH lists, so an exchange order runs the whole discount body and
   * THEN reaches the branch below. That is not an accident of reading; it is what the two literal
   * lists say.
   *
   * TODO [issue #1766]: In the future allow for return Items to have negative promotions applied.
   * This isn't import right now because you can determine how much you would like to refund
   * ordersItems.
   *
   * The TODO above is carried forward VERBATIM from [model/service/PromotionService.cfc:L543],
   * which is the entire body of the L542 branch - the branch does nothing today and must continue
   * to do nothing. It is reproduced here, on the member whose value reaches it, so the gap travels
   * with the type rather than being lost when the engine is decomposed. It must NOT be silently
   * completed: implementing negative promotions on return items is a product decision, and this
   * port makes none.
   */
  readonly systemCode: string;
}

/**
 * One order, as the promotion and price-group engines read it.
 *
 * THE MEMBER SET IS EXHAUSTIVE AND CLOSED AT TWELVE: ten censused accessors plus two structural
 * members whose provenance is labelled honestly below. Nothing may be added and nothing may be
 * dropped.
 *
 * THE CENSUS. Every `order.get*()` and `arguments.order.get*()` call site in
 * `model/service/PromotionService.cfc` was enumerated; it yields exactly TEN distinct accessors
 * across forty occurrences, and each member below carries the measured locators that prove it is
 * read:
 *
 *   getOrderItems                          10   L64 L65 L66 L145 L203 L524 L526 L720 L797 L800
 *   getOrderFulfillments                   10   L71 L72 L73 L348 L559 L663 L755 L756 L767 L768
 *   getAppliedPromotions                    7   L78 L79 L427 L431 L434 L435 L439
 *   getTotalSaleQuantity                    3   L644 L646 L785
 *   getSubtotal                             2   L648 L650
 *   getOrderType                            2   L61 L542
 *   getAccount                              2   L575 L576
 *   getSubtotalAfterItemDiscounts           1   L417
 *   getPromotionCodeList                    1   L165
 *   getFulfillmentChargeAfterDiscountTotal  1   L417
 *
 * `model/service/PriceGroupService.cfc` adds no eleventh accessor: its only reads are `getAccount`
 * [model/service/PriceGroupService.cfc:L365, L367] and `getOrderItems`
 * [model/service/PriceGroupService.cfc:L366, L367, L369, L370, L371], both already covered.
 *
 * THE FIVE PRE-COMPUTED MEMBERS, AND WHY THAT IS THE ANTI-CORRUPTION INVERSION. `totalSaleQuantity`
 * [model/entity/Order.cfc:L624], `subtotal` [model/entity/Order.cfc:L686],
 * `subtotalAfterItemDiscounts` [model/entity/Order.cfc:L700], `promotionCodeList`
 * [model/entity/Order.cfc:L570] and `fulfillmentChargeAfterDiscountTotal`
 * [model/entity/Order.cfc:L356] are COMPUTED METHODS on the legacy entity, not persisted columns.
 * On a read-only view they become pre-computed readonly members supplied by the caller, and the
 * view MUST NOT recompute them.
 *
 * That is the anti-corruption inversion and nothing else. THIS IS NOT AN OPTIMIZATION, NOT A CACHE
 * AND NOT A PERFORMANCE MEASURE. It is a scope boundary, and it is justified by fidelity to the
 * legacy computation rather than by anything about speed.
 *
 * ★ "THE VIEW MUST NOT RECOMPUTE THEM" IS A RULE ABOUT THE **VIEW**, NOT ABOUT ITS READERS - AND
 * TWO OF THE FIVE ARE COMPUTED ON DEMAND BY THE LEGACY, SO A READER THAT SNAPSHOTS THEM IS WRONG.
 * `subtotalAfterItemDiscounts` and `fulfillmentChargeAfterDiscountTotal` are read by the legacy at
 * [model/service/PromotionService.cfc:L417] AFTER the same invocation has written the item and
 * fulfillment discounts they are functions of. A value supplied from outside the invocation cannot
 * reflect that, so:
 *
 *   - the promotion engine DERIVES both at the moment of use, from the order items and from the
 *     discounts its own pass-one arm applied - `computeSubtotalAfterItemDiscounts` and
 *     `computeFulfillmentChargeAfterDiscountTotal` in `src/services/promotionService.ts`. It reads
 *     NEITHER member. What made the derivation possible is precisely that the engine holds pass one's
 *     output: from inside, the state `OrderItemView` and `OrderFulfillmentView` "deliberately do not
 *     carry" is state the engine computed itself and already has.
 *   - `subtotal` IS a function of item prices, which the price-group pass rewrites, so the
 *     composition root re-derives it between the two passes - `computeProjectedOrderSubtotal` in
 *     `src/handlers/bootstrap.ts` - because the qualifier gates at
 *     [model/service/PromotionService.cfc:L648, L650] read it INSIDE the promotion pass.
 *
 * None of that is the view recomputing anything: this module declares shape and cites provenance,
 * and every derivation above lives in the tier that owns the moment of use. `totalSaleQuantity` and
 * `promotionCodeList` are genuinely unaffected by either pass and are used exactly as supplied.
 */
export interface OrderView {
  /**
   * The order's opaque identifier.
   *
   * STRUCTURAL, NOT CENSUS-DERIVED - and labelled as such deliberately. `order.getOrderID()` does
   * NOT appear in `model/service/PromotionService.cfc` or in
   * `model/service/PriceGroupService.cfc`; the legacy engine never needs it because it hands over
   * the live entity instead. This member exists because the intent-returning inversion has nothing
   * else to key an order-level intent against: it replaces the legacy write
   * `newAppliedPromotion.setOrder( arguments.order )` [model/service/PromotionService.cfc:L450],
   * which populates the owning foreign key declared at
   * [model/entity/PromotionApplied.cfc:L61] - `property name="order" cfc="Order"
   * fieldtype="many-to-one" fkcolumn="orderID";`. Note that L448 is the sibling write
   * `setAppliedType('order')`, so an order-level intent is identified by the pair.
   *
   * OPAQUE - invariant 3. It is a key, never a handle: nothing in the domain loads an Order from
   * it, because there is no Order entity to load.
   *
   * Schema evidence [model/entity/Order.cfc:L52]:
   *
   *   property name="orderID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *     unsavedvalue="" default="";
   */
  readonly orderID: string;

  /**
   * The order's items, already populated.
   *
   * Read at [model/service/PromotionService.cfc:L64, L65, L66] by the backwards clear-out loop, at
   * L145 by sale-price seeding, at L203 by the merchandise reward branch, at L524 and L526 by the
   * final best-discount apply, at L720 and at L797, L800 by the qualification counters - and by the
   * price-group pass at [model/service/PriceGroupService.cfc:L366, L367, L369, L370, L371].
   *
   * ORM authority [model/entity/Order.cfc:L71]:
   *
   *   property name="orderItems" hb_populateEnabled="public" singularname="orderItem"
   *     cfc="OrderItem" fieldtype="one-to-many" fkcolumn="orderID" cascade="all-delete-orphan"
   *     inverse="true";
   *
   * `readonly OrderItemView[]` - invariants 1 and 5. The array is already materialized, and both
   * the array and each element are read-only, so the L370/L371 price-group writes and the L66
   * removal cannot be expressed against it.
   */
  readonly orderItems: readonly OrderItemView[];

  /**
   * The order's fulfillments, already populated.
   *
   * Read at [model/service/PromotionService.cfc:L71, L72, L73] by the backwards clear-out loop, at
   * L348 by the fulfillment reward branch, at L559 where every fulfillment ID seeds the
   * period's qualified-fulfillment list, at L663 by the fulfillment qualifier, and at L755, L756,
   * L767, L768 by the qualified-fulfillment-ID walk.
   *
   * ORM authority [model/entity/Order.cfc:L74]:
   *
   *   property name="orderFulfillments" hb_populateEnabled="public" singularname="orderFulfillment"
   *     cfc="OrderFulfillment" fieldtype="one-to-many" fkcolumn="orderID"
   *     cascade="all-delete-orphan" inverse="true";
   */
  readonly orderFulfillments: readonly OrderFulfillmentView[];

  /**
   * The promotions ALREADY applied to the order itself, as persisted state.
   *
   * Read at [model/service/PromotionService.cfc:L78, L79] by the backwards clear-out loop and at
   * L427, L431, L434, L435, L439 by the order-level reward branch. Those five reads are the whole
   * of surface (b) in this module's header: L427 is the first-writer-wins initialisation test,
   * L431 and L434 interrogate element `[1]`, and L435 and L439 are the UPDATE and REMOVE mutations
   * the intent-returning inversion replaces.
   *
   * `AppliedPromotionView` is IMPORTED from `./orderFulfillmentView.js` and is not redeclared here.
   * The shape is genuinely shared: order-level and fulfillment-level applied promotions are rows of
   * the same `SwPromotionApplied` table, distinguished only by which foreign key is populated
   * [model/entity/PromotionApplied.cfc:L59-L61] and by the `appliedType` string
   * [model/entity/PromotionApplied.cfc:L54]. Duplicating the type would let the two sides drift.
   *
   * ORM authority [model/entity/Order.cfc:L72]:
   *
   *   property name="appliedPromotions" singularname="appliedPromotion" cfc="PromotionApplied"
   *     fieldtype="one-to-many" fkcolumn="orderID" cascade="all-delete-orphan" inverse="true";
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L431-L439]: the order-level branch indexes
   * element `[1]` of this collection, assuming at most one promotion is applied per order, and it
   * does so on the `else` arm of the L427 emptiness test - so the index is guarded against an EMPTY
   * collection but nothing bounds a collection of two or more, and every element past the first is
   * invisible to the comparison, the update and the removal.
   * Preserved deliberately; do not fix without a product decision.
   *
   * CONTEXT, NOT CLAIMED: this module records that assumption so the consumer inherits it, but
   * claims no defect-register entry for it - reproducing it belongs to `src/services/**`. Two
   * obligations follow for that consumer. First, `noUncheckedIndexedAccess` is enabled, so element
   * `[1]` of this array types as `AppliedPromotionView | undefined` and the consumer must NARROW
   * it - no `!` assertion, no cast, both of which are independently forbidden in `src/**`. Second,
   * the assumption must be REPRODUCED rather than defensively generalised: iterating the whole
   * collection instead of taking the first element would change which discount survives, and
   * therefore change money.
   *
   * CFML parity [model/service/PromotionService.cfc:L426]: the comment introducing the order-level
   * emptiness test still reads "If there aren't any promotions applied to this order fulfillment
   * yet" - a copy-paste artifact from the structurally identical fulfillment block at L381. The
   * code is order-level; only the comment is wrong.
   */
  readonly appliedPromotions: readonly AppliedPromotionView[];

  /**
   * The total quantity across the order's sale items.
   *
   * A COUNT, NOT MONEY, and therefore genuinely a `number`. This is the only numeric member on this
   * shape that is not `Money`, and it must not be promoted to `Money` for symmetry.
   *
   * Read three times, always as a quantity: the minimum- and maximum-order-quantity qualifier gates
   * [model/service/PromotionService.cfc:L644, L646] compare it against the qualifier's bounds, and
   * [model/service/PromotionService.cfc:L785] seeds `allQualifiersCount` with it so that an order
   * with no item qualifiers qualifies every item quantity.
   *
   * PRE-COMPUTED - see the class note on the five pre-computed members. CFML parity
   * [model/entity/Order.cfc:L624-L631]: a derived accessor that sums `getQuantity()` over items
   * whose type code is `"oitSale"`, not a column.
   *
   * LEGACY-DEFECT [model/entity/Order.cfc:L624-L631]: the loop counter is declared `i` on L626 and
   * the accumulation on L628 correctly reads `getOrderItems()[i].getQuantity()`, but the type gate
   * on L627 reads `getOrderItems()[1].getOrderItemType().getSystemCode()` - element ONE, on every
   * iteration. The FIRST item's type therefore decides whether EVERY item's quantity is counted: a
   * first item that is not a sale item suppresses the whole total, and a first item that is one
   * admits the quantity of items that are not.
   * Preserved deliberately; do not fix without a product decision.
   *
   * CONTEXT, NOT CLAIMED: cited so that whatever produces this view reproduces the legacy
   * computation rather than "correcting" the index - a corrected total changes the L644 and L646
   * qualifier outcomes and therefore changes money. The defect sits in the out-of-scope Order
   * aggregate, so this module claims no register entry for it.
   */
  readonly totalSaleQuantity: number;

  /**
   * The order's subtotal.
   *
   * Read by the minimum- and maximum-order-subtotal qualifier gates
   * [model/service/PromotionService.cfc:L648, L650].
   *
   * PRE-COMPUTED - see the class note on the five pre-computed members. CFML parity
   * [model/entity/Order.cfc:L686-L697]: a derived accessor that ADDS each `"oitSale"` item's
   * `getExtendedPrice()` and SUBTRACTS each `"oitReturn"` item's, both through
   * `precisionEvaluate`, and THROWS for any other item type. The producer of this view owns that
   * computation, the sign convention and the throw.
   */
  readonly subtotal: Money;

  /**
   * The order's type, carrying only the system code the engine tests.
   *
   * Non-nullable: [model/service/PromotionService.cfc:L61] and
   * [model/service/PromotionService.cfc:L542] both dereference
   * `arguments.order.getOrderType().getSystemCode()` with no absence test. See
   * {@link OrderTypeView} for the two overlapping gates, for the carried-forward `issue #1766`
   * TODO the second gate guards, and for why the shape is reduced to one field.
   */
  readonly orderType: OrderTypeView;

  /**
   * The owning account's opaque identifier, or `undefined` when the order has no account.
   *
   * THE OUT-OF-SCOPE ACCOUNT, REDUCED TO AN IDENTIFIER - invariant 3. `Account` and
   * `model/service/AccountService.cfc` are out of scope, so the association is not traversed; only
   * the key crosses the boundary.
   *
   * PROOF THAT AN IDENTIFIER SUFFICES. [model/service/PriceGroupService.cfc:L277] reads
   * `getPriceGroupDAO().getAccountSubscriptionPriceGroups(arguments.account.getAccountID())` - the
   * data layer is handed the ID and nothing else. The account-scoped price-group and promotion
   * lookups are therefore expressible from this member alone, through
   * `src/domain/ports/priceGroupRepository.ts` and
   * `src/domain/ports/promotionRepository.ts`, with no Account entity anywhere.
   *
   * WHERE IT IS READ. `order.getAccount()` is a census hit in both in-scope services:
   * [model/service/PromotionService.cfc:L575] tests for its presence before
   * [model/service/PromotionService.cfc:L576] uses it for the promotion period's per-account use
   * count, and [model/service/PriceGroupService.cfc:L365, L367] gate and then drive the price-group
   * pass with it.
   *
   * `undefined` MEANS NO ACCOUNT, AND IT IS LOAD-BEARING IN BOTH SERVICES. At
   * [model/service/PromotionService.cfc:L574-L581] an absent account causes the per-account use
   * count to be SKIPPED ENTIRELY - which leaves `qualificationsMeet` true, so the promotion period
   * still qualifies. At [model/service/PriceGroupService.cfc:L365] an absent account short-circuits
   * the whole price-group pass, so no item receives an applied price group and every item takes the
   * `getPrice()` arm of the L241 discriminator. Fabricating an identifier for a guest order would
   * change both outcomes.
   *
   * Declared as a REQUIRED member whose type includes `undefined`, not as an optional `?:` member -
   * see the JUDGMENT CALL in this module's header. The legacy column always exists and is simply
   * nullable [model/entity/Order.cfc:L63]: `property name="account" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="accountID";` - declared with no required attribute.
   *
   * NOT A PRICE-GROUPS COLLECTION. [model/service/PriceGroupService.cfc:L365] also reads
   * `arguments.order.getAccount().getPriceGroups()`, and that second hop deliberately does NOT
   * become a member here; it is resolved from this identifier inside the service tier through the
   * price-group repository port. See surface (c) in this module's header.
   */
  readonly accountID: string | undefined;

  /**
   * The order's subtotal net of the discounts already applied to its items.
   *
   * READ EXACTLY ONCE, AND ONLY IN PASS TWO. [model/service/PromotionService.cfc:L417], verbatim:
   *
   *   L417 var totalDiscountableAmount = arguments.order.getSubtotalAfterItemDiscounts() + arguments.order.getFulfillmentChargeAfterDiscountTotal();
   *   L419 var discountAmount = getDiscountAmount(reward, totalDiscountableAmount, 1);
   *
   * L417 sits inside the order-level reward branch, whose gate is
   * `} else if (orderRewards and reward.getRewardType() eq "order" ) {`
   * [model/service/PromotionService.cfc:L415]. The `orderRewards` flag is declared false at
   * [model/service/PromotionService.cfc:L166], so this member is read ONLY after the item-level
   * pass has run - and it only has a meaningful value once item discounts have been applied. THAT
   * IS EXACTLY WHY THE TWO-PASS ITERATOR EXISTS.
   *
   * THE LEGACY TWO-PASS MECHANISM, AND ITS EMPTY-COLLECTION BEHAVIOUR. Pass two is produced by a
   * hand-rolled loop-counter reset [model/service/PromotionService.cfc:L458-L460]:
   *
   *   if(!orderRewards and pr == arrayLen(promotionRewards)) { pr = 0; orderRewards = true; }
   *
   * Because that reset lives INSIDE the loop body, PASS TWO NEVER RUNS AT ALL WHEN THE REWARD
   * COLLECTION IS EMPTY. A consumer that naively splits the loop into two clean passes changes
   * behaviour unless it reproduces that guard. Recorded here because this member is the value pass
   * two reads; reproducing the guard belongs to `src/services/promotion/twoPassRewardIterator.ts`.
   *
   * ★★ NO LONGER READ BY THE PROMOTION ENGINE, AND NOT AN OBLIGATION ON THE PRODUCER.
   * `src/services/promotionService.ts` derives pass two's base from live engine state instead, and
   * for this addend the derivation is an identity rather than an approximation: at L417 the item
   * discount total is necessarily ZERO, because the blanket clear at
   * [model/service/PromotionService.cfc:L64-L68] emptied every item's applied-promotion collection and
   * the item rows are created only at [L521-L537], after both passes and after over-use stripping. So
   * `getSubtotalAfterItemDiscounts()` equals `getSubtotal()` at the single point it is read, and the
   * engine recomputes `getSubtotal()` from the order items - `computeSubtotalAfterItemDiscounts` in
   * `src/services/promotionService.ts`, reproducing the `oitSale` / `oitReturn` discrimination of
   * [model/entity/Order.cfc:L686-L694] - rather than reading either pre-computed total from here.
   *
   * ★ QUOTE-THEN-REVISE. An earlier revision assigned the value to the view's producer: "PASS ONE'S
   * OUTPUT IS THE PRODUCER'S OBLIGATION. In the legacy engine the item-level discounts are applied in
   * place before L417 reads their effect. In the target the item pass returns intents instead, so the
   * value supplied here must reflect them; a stale snapshot taken before the item pass would compute
   * the order-level discount from the wrong base."
   *
   * The final clause is right and is exactly what condemned the obligation: pass one's output is
   * produced BY the invocation being fed, so a producer assembling the input beforehand cannot know
   * it. The obligation was undischargeable, and in practice the value carried was the pre-invocation
   * total. The derivation above replaces it.
   *
   * WHY THE MEMBER REMAINS. It is a faithful projection of a real legacy accessor
   * [model/entity/Order.cfc:L700-L702] that the source does read at L417, and this shape is the
   * anti-corruption record of what the engine's input looks like. Removing it would change the member
   * census on a claim about the target's internals rather than about the source. It is retained,
   * documented as not load-bearing, and MUST NOT be reintroduced as a discount base.
   *
   * PRE-COMPUTED - see the class note on the five pre-computed members. CFML parity
   * [model/entity/Order.cfc:L700-L702]: `precisionEvaluate('getSubtotal() -
   * getItemDiscountAmountTotal()')`, where `getItemDiscountAmountTotal()`
   * [model/entity/Order.cfc:L317-L327] sums each item's own applied-promotion discounts - state
   * `OrderItemView` deliberately does not carry.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L417]: the two amounts are combined with a
   * PLAIN `+`. Money arithmetic elsewhere in this service is guarded by `precisionEvaluate` at
   * every one of its nine sites - L150, L252, L299, L486, L990, L995, L1001, L1006 and L1007 - and
   * this line is not among them, so the order-level discount base is the only sum in the pass
   * computed with unguarded arithmetic.
   * Preserved deliberately; do not fix without a product decision.
   *
   * CONTEXT, NOT CLAIMED: `Money.plus()` closes that gap structurally, because every monetary
   * member on this shape is `Money` and `Money` has no unguarded arithmetic to offer. This module
   * records the gap so the reason the target is stricter than the source is visible at the point the
   * value enters the type; the deliberate-divergence accounting for float gaps belongs to
   * `src/services/**`, and this folder claims no defect-register entry. The legacy variable is named
   * `totalDiscountableAmount`.
   */
  readonly subtotalAfterItemDiscounts: Money;

  /**
   * The order's promotion codes as a comma-delimited list.
   *
   * CARRIED AS A `string` FOR VERBATIM PARITY, not as `readonly string[]`. The value is passed
   * straight through to the reward query as a list argument -
   * [model/service/PromotionService.cfc:L165]:
   *
   *   getPromotionDAO().getActivePromotionRewards(rewardTypeList="merchandise,subscription,contentAccess,order,fulfillment",
   *     promotionCodeList=arguments.order.getPromotionCodeList(), qualificationRequired=true)
   *
   * and again at [model/service/PromotionService.cfc:L1040], where the shipping-method-option path
   * reaches it through `getOrderFulfillment().getOrder().getPromotionCodeList()`. Splitting it here
   * would move the parse - and CFML's empty-list semantics with it - out of the one place that
   * consumes it. The `src/lib/cfml/list.ts` helpers exist precisely so a consumer can apply those
   * semantics deliberately rather than by accident.
   *
   * PRE-COMPUTED - see the class note on the five pre-computed members. CFML parity
   * [model/entity/Order.cfc:L570-L577]: `listAppend` over `getPromotionCodes()`, starting from `""`,
   * so an order with no promotion codes yields the EMPTY STRING rather than an absent value. That
   * distinction is why this member is a plain `string` and not `string | undefined`.
   */
  readonly promotionCodeList: string;

  /**
   * The order's fulfillment charges net of the discounts already applied to its fulfillments.
   *
   * In the SOURCE this is read exactly once, on the same line as its sibling: it is the second addend
   * of `totalDiscountableAmount` [model/service/PromotionService.cfc:L417]. Everything recorded on
   * {@link OrderView.subtotalAfterItemDiscounts} about pass two, about the L458-L460 guard and
   * about the plain `+` applies identically here and is not repeated.
   *
   * ★★ NO LONGER READ BY THE PROMOTION ENGINE, for the same reason as its sibling, but by
   * RECONSTRUCTION rather than by identity. `src/services/promotionService.ts` rebuilds this total per
   * fulfillment as `fulfillmentCharge` minus the discount pass one just selected for that fulfillment,
   * which is what [model/entity/Order.cfc:L356-L363] and
   * [model/entity/OrderFulfillment.cfc:L183-L193] compute over the live graph. Post-clear the only
   * applied-promotion row a fulfillment can hold is the one pass one created at [L401], so the
   * engine's own mirror of that row is a complete account of what there is to subtract.
   *
   * ★ QUOTE-THEN-REVISE. An earlier revision assigned this to the producer too - "PASS ONE'S
   * FULFILLMENT OUTPUT IS THE PRODUCER'S OBLIGATION ... in the target it returns intents, so the value
   * supplied here must reflect them" - and justified it with the sentence retained below, that the
   * total "is not derivable from `orderFulfillments` above". That non-derivability claim was the error:
   * it is not derivable from the VIEW alone, which is true and beside the point, because the engine
   * holds the missing term itself. The obligation was likewise undischargeable, pass one's output being
   * produced by the very invocation the input feeds.
   *
   * WHY THE MEMBER REMAINS: as for its sibling - a faithful projection of
   * [model/entity/Order.cfc:L356-L363], retained, not load-bearing, and never to be reintroduced as a
   * discount base.
   *
   * PRE-COMPUTED - see the class note on the five pre-computed members. CFML parity
   * [model/entity/Order.cfc:L356-L363]: a `precisionEvaluate` sum of each fulfillment's
   * `getChargeAfterDiscount()`, which is itself
   * `precisionEvaluate('getFulfillmentCharge() - getDiscountAmount()')`
   * [model/entity/OrderFulfillment.cfc:L183-L185] over that fulfillment's applied promotions
   * [model/entity/OrderFulfillment.cfc:L187-L193]. `OrderFulfillmentView` carries
   * `fulfillmentCharge` but no charge-after-discount member, so this total is not derivable from
   * `orderFulfillments` above - which is the anti-corruption boundary showing through, not an
   * omission.
   */
  readonly fulfillmentChargeAfterDiscountTotal: Money;

  /**
   * The currency the order's amounts are denominated in.
   *
   * STRUCTURAL, NOT CENSUS-DERIVED - and labelled as such deliberately. A case-insensitive search
   * for `currencyCode` across `model/service/PromotionService.cfc` and
   * `model/service/PriceGroupService.cfc` returns ZERO hits in both files. No in-scope service
   * method reads this value off the order.
   *
   * WHY IT IS CARRIED ANYWAY. The currency-aware SKU accessors need it, and a view may not fetch
   * it. `Sku.getPriceByCurrencyCode` [model/entity/Sku.cfc:L269-L273] and its list- and
   * renewal-price siblings [model/entity/Sku.cfc:L275-L285] take a currency code and return the
   * matching price or nothing at all - and invariant 5 forbids this shape from reaching a port to
   * resolve one. The order is the level at which the legacy schema records it, so it is carried
   * here and handed DOWN, which is also why `OrderItemView` correctly omits it even though
   * `model/entity/OrderItem.cfc:L55` declares an item-level column.
   *
   * Schema evidence [model/entity/Order.cfc:L54]: `property name="currencyCode" ormtype="string"
   * length="3";` - a real persisted `SwOrder` column, which is what makes this a projection of
   * existing state rather than an invented member. Schema continuity is untouched: this view adds
   * no table, no column and no migration.
   *
   * Typed `CurrencyCode` rather than `string`: the branded type makes the three-character
   * constraint the column already declares checkable at the boundary, and `CurrencyCode` is
   * assignable to `string` wherever a raw code is required.
   */
  readonly currencyCode: CurrencyCode;
}

/**
 * The shipping-method rate, reduced to the one association the engine reads off it.
 *
 * A CFML struct-shaped hop becomes a NAMED interface rather than an inline object literal, so the
 * shape has somewhere to be documented and somewhere for a fixture builder to name.
 *
 * The rate itself carries no member of its own here, because the legacy code reads none:
 * [model/service/PromotionService.cfc:L1057] uses it purely as the hop to the shipping method -
 * `reward.hasShippingMethod(arguments.shippingMethodOption.getShippingMethodRate().getShippingMethod())`.
 * The hop is preserved rather than flattened so the accessor chain in the target reads the way the
 * legacy chain does, which is what makes the two checkable against each other.
 *
 * `ShippingMethodView` is IMPORTED from `./orderFulfillmentView.js` and is not redeclared: it is the
 * same shipping method the fulfillment-level gate tests at
 * [model/service/PromotionService.cfc:L355], reduced to its identifier because membership of a
 * reward's collection is all that is ever asked of it.
 */
export interface ShippingMethodRateView {
  /**
   * The shipping method this rate is for.
   *
   * Non-nullable: [model/service/PromotionService.cfc:L1057] dereferences
   * `getShippingMethodRate().getShippingMethod()` with no absence test, in pointed contrast to the
   * fulfillment-level gate at [model/service/PromotionService.cfc:L355], which guards the very same
   * comparison with `!isNull(orderFulfillment.getShippingMethod())`. The asymmetry is the legacy
   * source's, and it is preserved rather than normalised: widening this member to include
   * `undefined` would invite a consumer to add a guard the legacy path does not have.
   */
  readonly shippingMethod: ShippingMethodView;
}

/**
 * One shipping-method option, as `getShippingMethodOptionsDiscountAmountDetails` reads it.
 *
 * JUDGMENT CALL: THIS SHAPE IS DECLARED HERE RATHER THAN IN `orderFulfillmentView.ts`, WHERE THE
 * FOLDER SPECIFICATION PLACED IT. A first-hand census of the legacy method proves that placement is
 * impossible, and the source wins over the specification.
 *
 * `PromotionService.getShippingMethodOptionsDiscountAmountDetails(required any shippingMethodOption)`
 * [model/service/PromotionService.cfc:L1032] reads EXACTLY THREE accessors off its argument, and one
 * of them dereferences UPWARD INTO THE ORDER:
 *
 *   getOrderFulfillment()    4 uses  L1040  .getOrder().getPromotionCodeList()
 *                                    L1049  .getOrder() passed WHOLE into
 *                                           getPromotionPeriodQualificationDetails(promotionPeriod=, order=)
 *                                    L1055  .getFulfillmentMethod()
 *                                    L1063  .getAddress()
 *   getShippingMethodRate()  1 use   L1057  .getShippingMethod() -> reward.hasShippingMethod(...)
 *   getTotalCharge()         1 use   L1071  the `price` argument of getDiscountAmount(reward, ..., 1)
 *
 * Because the legacy chain reaches `shippingMethodOption.getOrderFulfillment().getOrder()`, the
 * shape TRANSITIVELY REQUIRES `OrderView`. Declaring it in `orderFulfillmentView.ts` would force
 * that module to import `orderView.ts`, which already imports it - A CIRCULAR VIEW TYPE, and the end
 * of the folder's DAG. This module legitimately holds BOTH references already, so it is the only
 * cycle-free home. The dependency graph stays
 * `{ orderItemView, orderFulfillmentView } -> orderView`, with this module as the sink.
 *
 * TWO BEHAVIOURS THE CONSUMER MUST REPRODUCE, RECORDED HERE BECAUSE THE INPUT SHAPE IS WHERE THEY
 * ARE VISIBLE:
 *
 *   * THE `"" / 0` SEEDING IDIOM. [model/service/PromotionService.cfc:L1033-L1036] seeds
 *     `var details = { promotionID="", discountAmount=0 };` and the winner is captured only when it
 *     beats what is already there [model/service/PromotionService.cfc:L1073-L1075]:
 *     `if(discountAmount > details.discountAmount) { details.discountAmount = discountAmount;
 *     details.promotionID = reward.getPromotionPeriod().getPromotion().getPromotionID(); }`. So "no
 *     qualifying reward" is reported as an EMPTY promotion identifier with a ZERO amount, never as
 *     an absent result - and a strictly-greater-than comparison means a reward worth exactly zero
 *     never wins. The same `promotionRewardID = ""` idiom appears in sale-price seeding at
 *     [model/service/PromotionService.cfc:L156]. THE RETURN-DETAILS STRUCT IS NOT DECLARED HERE: it
 *     is an output shape and belongs to `src/services/**`. Only the idiom is recorded, so the
 *     consumer reproduces it.
 *   * A NARROWER REWARD PULL. [model/service/PromotionService.cfc:L1040] requests
 *     `rewardTypeList="fulfillment"` ONLY, in contrast to the five-type list
 *     `"merchandise,subscription,contentAccess,order,fulfillment"` at
 *     [model/service/PromotionService.cfc:L165]. This path is not a narrowed re-run of the main
 *     engine and must not be implemented as one.
 *
 * THE GATE THIS SHAPE FEEDS. [model/service/PromotionService.cfc:L1055-L1057] is structurally the
 * FIRST TWO clauses of the three-way fulfillment gate
 * [model/service/PromotionService.cfc:L351-L355], minus the qualified-fulfillment-ID clause, except
 * that here the fulfillment identity comes from `.getOrderFulfillment().getFulfillmentMethod()` and
 * the shipping method from `.getShippingMethodRate().getShippingMethod()`. Both clauses are
 * PERMISSIVE on an empty reward collection - rule 1 of the six empty-collection semantics in this
 * module's header. It is followed by the permissive address-zone pattern
 * [model/service/PromotionService.cfc:L1059-L1061]: `var addressIsInZone = true;` and then
 * `if(arrayLen(reward.getShippingAddressZones()))` flips it to false before any zone is tested.
 *
 * CFML parity [model/service/PromotionService.cfc:L1059-L1063]: this address-zone loop passes
 * `.getOrderFulfillment().getAddress()` straight to `isAddressInZone` with NO
 * `!isNull(...) && !...isNew()` guard, whereas the fulfillment-level equivalent
 * [model/service/PromotionService.cfc:L360] guards on exactly that before looping. The asymmetry is
 * the legacy source's; `OrderFulfillmentView.address` is `ShippingAddressView | undefined` and
 * carries an `isNew` flag, so both paths remain expressible and the consumer must choose per call
 * site rather than normalising the two.
 *
 * All five invariants in this module's header apply to this shape unchanged: it is read-only
 * throughout, it mutates nothing, its identifiers are opaque, its one amount is `Money`, and its
 * associations arrive already populated.
 */
export interface ShippingMethodOptionView {
  /**
   * The fulfillment this option belongs to.
   *
   * Satisfies the two accessors the legacy code reaches through it directly:
   * `.getFulfillmentMethod()` at [model/service/PromotionService.cfc:L1055] and `.getAddress()` at
   * [model/service/PromotionService.cfc:L1063]. It deliberately does NOT satisfy the two
   * `.getOrder()` hops at [model/service/PromotionService.cfc:L1040, L1049] - see
   * {@link ShippingMethodOptionView.order}.
   */
  readonly orderFulfillment: OrderFulfillmentView;

  /**
   * The owning order, FLATTENED directly onto the option rather than nested inside the fulfillment.
   *
   * THIS FLATTENING IS WHAT BREAKS THE CYCLE, and it is the whole reason this shape lives in this
   * module. The legacy chain reaches the order THROUGH the fulfillment
   * [model/service/PromotionService.cfc:L1040, L1049], but reproducing that nesting would require
   * `OrderFulfillmentView` to carry an `order` member, which would make
   * `orderFulfillmentView.ts` import `orderView.ts` while `orderView.ts` imports it back.
   * Attaching the order to the OPTION instead keeps both leaf views free of the sink and preserves
   * the folder's DAG. Whatever constructs this view resolves the same object the legacy chain would
   * have walked to.
   *
   * AN OPAQUE `orderID` WOULD NOT SUFFICE HERE, and this is the one place in these three modules
   * where that is true. [model/service/PromotionService.cfc:L1049] passes the order WHOLE into
   * `getPromotionPeriodQualificationDetails(promotionPeriod=..., order=...)`, which then reads
   * `getOrderFulfillments()` [model/service/PromotionService.cfc:L559], `getAccount()`
   * [model/service/PromotionService.cfc:L575, L576] and, through the qualifier evaluator,
   * `getTotalSaleQuantity()`, `getSubtotal()` and `getOrderItems()`. And
   * [model/service/PromotionService.cfc:L1040] needs `getPromotionCodeList()` before the query is
   * even built. Reducing the order to an identifier would force this path to reach a repository to
   * rehydrate what the caller already holds, which invariant 5 forbids outright.
   *
   * Invariant 3 is not weakened by this member: the order arrives as the same READ-ONLY projection
   * every other consumer receives, not as an entity handle, so nothing here can be written or
   * persisted.
   */
  readonly order: OrderView;

  /**
   * The rate whose shipping method the reward's shipping-method collection is tested against.
   *
   * Read at [model/service/PromotionService.cfc:L1057]. See {@link ShippingMethodRateView} for why
   * the hop is preserved rather than flattened to a bare shipping method.
   */
  readonly shippingMethodRate: ShippingMethodRateView;

  /**
   * The option's total charge: the base the fulfillment discount is computed from.
   *
   * `Money` - invariant 4. Read at [model/service/PromotionService.cfc:L1071] as the `price`
   * argument of `getDiscountAmount(reward, arguments.shippingMethodOption.getTotalCharge(), 1)`,
   * with a literal quantity of 1, so the whole charge is discounted once rather than per unit.
   *
   * Non-nullable, and `Money.zero` is NOT a substitute for a charge that could not be resolved: a
   * discount computed from a base of nothing is zero, which the strictly-greater-than comparison at
   * [model/service/PromotionService.cfc:L1073] would then discard, silently reporting "no promotion
   * applies" instead of failing. Whatever constructs this view must resolve the real charge.
   */
  readonly totalCharge: Money;
}
