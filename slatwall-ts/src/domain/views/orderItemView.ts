/**
 * Read-only order-item shape: the anti-corruption boundary between the ported promotion and
 * price-group engines and the Order aggregate, which stays in CFML.
 *
 * WHY THIS FILE EXISTS. `PromotionService.updateOrderAmountsWithPromotions` takes an Order
 * [model/service/PromotionService.cfc:L58], and `PriceGroupService.updateOrderAmountsWithPriceGroups`
 * takes one too [model/service/PriceGroupService.cfc:L364], yet `model/service/OrderService.cfc` and
 * every order, cart and checkout entity are out of scope. This module carries exactly the order-item
 * state those two engines read, and nothing that would let them write. That inversion is what turns
 * an out-of-scope aggregate into an INPUT to an in-scope engine rather than a DEPENDENCY of it, and
 * it is what makes this slice independently deployable.
 *
 * `model/entity/OrderItem.cfc` was read for its ORM type declarations and for nothing else. What
 * follows is a projection of that entity, not a port of it: there is no OrderItem entity in this
 * domain, and reading a file never converted it into a write target.
 *
 * THE FIVE INVARIANTS THIS SHAPE UPHOLDS
 *
 *   1. READ-ONLY, ABSOLUTELY. Every member is `readonly`. There is no setter, no mutator, no
 *      `add*`/`remove*` helper, no persistence method, no ORM handle, no `save`, no `delete` and no
 *      method of any kind.
 *   2. NO MUTATION OF ORDER STATE, EVER. Legacy `updateOrderAmountsWithPromotions` returns void and
 *      mutates the order aggregate in place - `newAppliedPromotion.setOrderItem( orderItem )`
 *      [model/service/PromotionService.cfc:L533] hands the live entity to a new persistent row. The
 *      target returns applied-promotion intents keyed by the opaque identifiers below instead. That
 *      is the single most consequential signature change in this migration, and it exists precisely
 *      because the order aggregate is out of scope.
 *   3. OPAQUE IDENTIFIERS. `orderItemID` and `orderFulfillmentID` are plain strings. They are the
 *      keys the engines emit intents against, and neither is ever dereferenced into an out-of-scope
 *      entity.
 *   4. MONEY IS `Money`. Every amount member is the `Money` value object, never a `number`. The one
 *      plain `number` here is `quantity`, which is a count.
 *   5. NO ORM, NO LAZINESS. Associations arrive already populated, resolved by whatever constructs
 *      the view. This shape never simulates lazy loading and never reaches a port.
 *
 * PARAMETERIZED SQL: NOT APPLICABLE HERE - stated rather than silently omitted. This module declares
 * types only and contains no query, no query helper and no database access of any kind. The
 * project-wide obligation to use prepared statements exclusively, which preserves the injection
 * safety `cfqueryparam` provided, rests wholly with `src/repositories/mysql/**` - the only layer that
 * speaks to the `Sw*` schema.
 *
 * TEST COVERAGE FOR THIS SHAPE IS NET-NEW, NOT PARITY. No legacy test under `meta/tests/` touches any
 * order-shaped input, so nothing here traces to a legacy antecedent and none of it may be presented
 * as carried-forward coverage.
 *
 * `orderView.ts` holds the authoritative statement of the cross-service execution-ordering constraint
 * that governs `appliedPriceGroup`; the note on that member cross-references it.
 *
 * JUDGMENT CALL: a value the legacy schema permits to be absent is modelled as a REQUIRED member
 * whose type includes `undefined`, never as an optional `?:` member, because
 * `exactOptionalPropertyTypes` is enabled and an omitted key and a present-but-undefined key are
 * different states under it. The producer of this view must state an absence rather than omit it.
 */

import type { Money } from '../valueObjects/money.js';
import type { Sku } from '../entities/sku.js';
import type { PriceGroup } from '../entities/priceGroup.js';
import type { AppliedPromotionView } from './orderFulfillmentView.js';

/**
 * The order item's type, reduced to the single field the engine reads.
 *
 * CFML parity [model/entity/OrderItem.cfc:L61]: the legacy association is to the generic `Type`
 * entity, and its full declaration is
 *
 *   property name="orderItemType" cfc="Type" fieldtype="many-to-one" fkcolumn="orderItemTypeID"
 *     hb_optionsSmartListData="f:parentType.systemCode=orderItemType" fetch="join";
 *
 * `Type` is out of scope, and the promotion engine reads exactly one field from it - the system code,
 * compared against the literal `"oitSale"` at [model/service/PromotionService.cfc:L206]. Carrying
 * anything else would be inventing state no in-scope call site reads.
 *
 * Declared beside the main exported unit rather than in a file of its own: `src/domain/views/` is
 * complete at three modules - this one, `orderFulfillmentView.ts` and `orderView.ts` - and the
 * in-repo precedent for an auxiliary type living next to the unit it serves is the non-exported
 * `TwoDecimalMask` in `src/lib/cfml/numberFormat.ts:L22`. It is deliberately NOT exported, so no
 * sibling view module can couple itself to it; `orderView.ts` declares its own order-type shape
 * locally by the same pattern. A consumer that genuinely needs to name this shape - a fixture
 * builder, say - reaches it structurally through the indexed access
 * `OrderItemView['orderItemType']`, which needs no export.
 */
interface OrderItemTypeView {
  /**
   * The type's system code.
   *
   * CFML parity [model/service/PromotionService.cfc:L206]: `orderItem.getOrderItemType()
   * .getSystemCode() == "oitSale"` is the gate that admits an item to the merchandise reward branch.
   * The raw string is carried rather than a narrowed union, because the legacy comparison is against
   * one literal out of a `SwType` table this port does not enumerate, and narrowing here would
   * reject codes the database legitimately holds.
   */
  readonly systemCode: string;
}

/**
 * One order item, as the promotion and price-group engines read it.
 *
 * THE MEMBER SET IS EXHAUSTIVE AND CLOSED AT ELEVEN. A census of every `orderItem.get*()` call site
 * in `model/service/PromotionService.cfc` yields exactly eleven distinct accessors and no more:
 * `getSku` (36 occurrences), `getOrderItemID` (18), `getQuantity` (6), `getPrice` (3),
 * `getAppliedPriceGroup` (2), `getAppliedPromotions` (1, at L65-L66), and `getSkuPrice`,
 * `getOrderItemType`, `getOrderFulfillment`, `getExtendedSkuPrice` and `getExtendedPrice` (1 each).
 * Each member below carries the locators that prove it is read. Nothing may be added that no call
 * site reads, and nothing that is read may be dropped.
 *
 * ★ QUOTE-THEN-REVISE ON THE MEMBER COUNT. An earlier revision declared the set "CLOSED AT TEN" and
 * justified excluding the eleventh like this: "No `appliedPromotions`. The item's applied-promotion
 * collection [model/entity/OrderItem.cfc:L71] is reached only through the order-level traversal
 * `order.getOrderItems()[oi].getAppliedPromotions()` [model/service/PromotionService.cfc:L65-L66],
 * which is one of the three backwards clear-out loops that the intent-returning inversion REPLACES
 * rather than reproduces. That collection therefore belongs to the order shape."
 *
 * Two things in that justification are wrong, and the census rule this file states is what settles
 * it. First, the traversal at L65-L66 IS an `orderItem.get*()` call site, so by the very rule quoted
 * above - "nothing that is read may be dropped" - the accessor belongs in the census. Second, the
 * collection does NOT belong to the order shape: `OrderView.appliedPromotions` carries
 * [model/entity/Order.cfc:L72], `fkcolumn="orderID"`, which is the ORDER's own one-to-many. The
 * item's collection is a different association with a different foreign key,
 * [model/entity/OrderItem.cfc:L71] `fkcolumn="orderItemID"`, and no other member of any view carries
 * it. Attributing it to the order shape did not relocate it - it dropped it.
 *
 * And the "REPLACES rather than reproduces" premise does not hold either. The clear-out loops are
 * reproduced, not replaced: the inversion changes only HOW they reach persistence. Because the order
 * aggregate is out of scope, the engine cannot detach a row by mutating a live ORM association the
 * way [model/entity/PromotionApplied.cfc:L103] does; it must EMIT a remove intent per detached row,
 * and it cannot emit one for a row it was never shown. See `RemovePromotionAppliedIntent` in
 * `../promotionEngine/qualifiedDiscountTypes.ts`, which carries the matching item-level variant.
 *
 * WHAT THIS SHAPE DELIBERATELY DOES NOT CARRY
 *
 *   * No `currencyCode`. [model/entity/OrderItem.cfc:L55] does declare
 *     `property name="currencyCode" ormtype="string" length="3";`, but a case-insensitive search for
 *     `currencyCode` across both `model/service/PromotionService.cfc` and
 *     `model/service/PriceGroupService.cfc` returns zero hits. The currency code is carried
 *     structurally on the order, and the engine hands it down to the currency-aware `Sku` accessors.
 *     Adding it here would invent a member no in-scope call site reads.
 *   * No `extendedPriceAfterDiscount`. The legacy accessor exists
 *     [model/entity/OrderItem.cfc:L208], and a search for it across both in-scope services returns
 *     zero hits.
 *
 * THE THREE-WAY ABSENCE CONVENTION. Absence is not one thing in the legacy source, it is three, and
 * collapsing any of them into another changes money. Every consumer of this shape is bound by all
 * three:
 *
 *   1. A MISSING SKU PRICE IS ABSENT, NEVER ZERO. `getPriceByCurrencyCode`
 *      [model/entity/Sku.cfc:L269-L273] performs a single `structKeyExists` and has no `else` and no
 *      fallback, so an unknown currency yields null. `getListPriceByCurrencyCode` and
 *      `getRenewalPriceByCurrencyCode` [model/entity/Sku.cfc:L275-L285] add a SECOND
 *      `structKeyExists` on the sub-key, so they yield absent even for a currency that IS present in
 *      the map. Substituting `0` for any of those would silently sell products for free.
 *   2. A MISSING PRODUCT SALE PRICE IS ZERO, NEVER ABSENT. `Product.getSalePrice()`
 *      [model/entity/Product.cfc:L594-L601] falls through to `return 0;` on L600 because the
 *      statement at L598, `getSkus()[1].getSalePrice();`, has no `return`. Cited here as CONTEXT for
 *      how consumers must read an absent sale price, NOT as a defect this module claims or owns: the
 *      defect-register entry and its deliberate preservation belong to `src/domain/entities/**`.
 *   3. A MISSING LIMIT OR BOUND MEANS UNLIMITED OR FOREVER. Promotion use limits and promotion-period
 *      start and end bounds stay absent rather than being filled with a sentinel, because absence is
 *      the legacy encoding of "no limit" and "no expiry".
 */
export interface OrderItemView {
  /**
   * The item's opaque identifier. [model/entity/OrderItem.cfc:L52]
   *
   *   property name="orderItemID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *     unsavedvalue="" default="";
   *
   * OPAQUE - invariant 3. The engine uses this value as a key three ways and dereferences it none: as
   * the key of the qualified-discount accumulator
   * [model/service/PromotionService.cfc:L152, L155, L260, L269, L288], as the identifier on the
   * per-item usage rows of the reward ledger [model/service/PromotionService.cfc:L310, L324], and as
   * the key of the per-period qualification counts
   * [model/service/PromotionService.cfc:L212, L213, L217, L222].
   *
   * It is also what the applied-promotion intent is emitted against. Legacy
   * [model/service/PromotionService.cfc:L529-L534] tests the accumulator for this key, then writes
   * `setAppliedType('orderItem')` on L531 and hands the live entity over with
   * `setOrderItem( orderItem )` on L533. The target emits this identifier on an intent instead, which
   * is invariant 2 in practice.
   */
  readonly orderItemID: string;

  /**
   * The SKU being sold, as the real `Sku` entity class - not a stand-in and not a projection.
   *
   * CFML parity [model/entity/OrderItem.cfc:L63]:
   *
   *   property name="sku" cfc="Sku" fieldtype="many-to-one" fkcolumn="skuID"
   *     hb_cascadeCalculate="true" fetch="join";
   *
   * `fetch="join"` records that the legacy mapping resolved this association together with the item,
   * so carrying it already materialized is fidelity to the legacy shape rather than a departure from
   * it - invariant 5 in practice.
   *
   * The real class is required because the engine walks a deep graph through it and every hop is a
   * method on a ported entity. Sale-price seeding reads `getSalePriceDetails()` and `getPrice()`
   * [model/service/PromotionService.cfc:L146, L148, L150]. Reward matching compares `getSkuID()`,
   * `getProduct().getProductID()`, `getProduct().getProductType().getProductTypeID()` and
   * `getProduct().getBrand().getBrandID()` [model/service/PromotionService.cfc:L808-L818]. Qualifier
   * membership walks the materialized `getProduct().getProductType().getProductTypeIDPath()`
   * [model/service/PromotionService.cfc:L864-L865, L899-L900] and tests option membership through
   * `getOptions()` [model/service/PromotionService.cfc:L885, L914]. A flattened projection would lose
   * every one of those, and the currency-aware price accessors with them.
   */
  readonly sku: Sku;

  /**
   * How many units of the SKU this item covers.
   *
   * A COUNT, NOT MONEY, and therefore genuinely a `number`. ORM authority
   * [model/entity/OrderItem.cfc:L56]:
   *
   *   property name="quantity" hb_populateEnabled="public" ormtype="integer";
   *
   * `ormtype="integer"` is the whole argument. This is the only numeric member on this shape that is
   * not `Money`, and it must not be promoted to `Money` for symmetry. It is read at
   * [model/service/PromotionService.cfc:L150] twice inside a single `precisionEvaluate`, at
   * [model/service/PromotionService.cfc:L231, L232] where it clamps the discount quantity to the
   * quantity actually ordered, and at [model/service/PromotionService.cfc:L729, L730] where it
   * becomes a qualification count.
   *
   * Downstream it is the multiplicand on both sides of the discount arithmetic -
   * `precisionEvaluate('arguments.price * arguments.quantity')`
   * [model/service/PromotionService.cfc:L990] and `reward.getAmount() * quantity`
   * [model/service/PromotionService.cfc:L998] - so it enters the calculation as a count and the
   * arithmetic itself stays inside `Money`.
   */
  readonly quantity: number;

  /**
   * The unit price actually charged, which may already be a price-group price.
   *
   * THE TWO PRICE BASES, AND WHY BOTH ARE MANDATORY. This is the behavioural reason this module
   * exists, and the four money members on this shape are load-bearing together rather than
   * individually. [model/service/PromotionService.cfc:L241-L254], verbatim:
   *
   *   L241 if( isNull(orderItem.getAppliedPriceGroup()) || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() ) ) {
   *   L244   var discountAmount = getDiscountAmount(reward, orderItem.getPrice(), discountQuantity);
   *   L246 } else {
   *   L249   var originalDiscountAmount = getDiscountAmount(reward, orderItem.getSkuPrice(), discountQuantity);
   *   L252   var discountAmount = precisionEvaluate('originalDiscountAmount - (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())');
   *   L254 }
   *
   * The discriminator is TWO-PART: no applied price group at all, OR the reward naming that price
   * group among its eligible ones, selects `price`; anything else selects `skuPrice` plus the
   * correction term `originalDiscountAmount - (extendedSkuPrice - extendedPrice)`. Both arms are
   * reachable, so this shape must carry all four of `price`, `skuPrice`, `extendedPrice` and
   * `extendedSkuPrice`, or one arm becomes unreproducible. A tidier shape carrying a single price base
   * would fail the must-preserve contract for promotion discount math.
   *
   * THIS member is the base the FIRST arm selects, passed straight to the discount calculation
   * [model/service/PromotionService.cfc:L244]. It is also read by the minimum- and
   * maximum-item-price qualifier gates [model/service/PromotionService.cfc:L875, L877].
   *
   * ORM authority [model/entity/OrderItem.cfc:L53]: `property name="price" ormtype="big_decimal";`
   *
   * CFML parity [model/entity/OrderItem.cfc:L53-L54]: `price` and `skuPrice` are declared
   * `ormtype="big_decimal"` with NO `default="0"`, whereas `listPrice`, `price` and `renewalPrice` on
   * the SKU all DO declare `default="0"` [model/entity/Sku.cfc:L55-L57]. That asymmetry is meaningful
   * and is not normalised away here - it is preserved as a PROHIBITION rather than as a wider type,
   * because no in-scope reader guards these accessors. L244, L249 and L252 dereference them
   * unconditionally, and so do the two qualifier gates above, whose `isNull` tests interrogate the
   * qualifier's own bounds and never the item's price. Both members are therefore non-nullable and
   * their producer must resolve them - and `Money.zero` is NOT a substitute for a price that could not
   * be resolved, because a discount computed from a base of nothing is not the legacy answer.
   */
  readonly price: Money;

  /**
   * The SKU's own unit price, before any price group was applied.
   *
   * The base the SECOND arm of the L241 discriminator selects, for an item that IS price-group
   * constrained by a group the reward does not accept [model/service/PromotionService.cfc:L249].
   * Retained precisely because that arm needs a base untouched by the price-group pass; see
   * {@link OrderItemView.price} for the verbatim discriminator and for why all four money members are
   * mandatory together.
   *
   * ORM authority [model/entity/OrderItem.cfc:L54]: `property name="skuPrice" ormtype="big_decimal";`
   * - declared with NO `default="0"`, and non-nullable here for the same reason and under the same
   * prohibition recorded on {@link OrderItemView.price}.
   */
  readonly skuPrice: Money;

  /**
   * The extended charged amount: unit price times quantity.
   *
   * The subtrahend of the second arm's correction term
   * [model/service/PromotionService.cfc:L252]. Mandatory for the same reason as its three siblings;
   * see {@link OrderItemView.price}.
   *
   * CFML parity [model/entity/OrderItem.cfc:L200]: computed on the legacy entity as
   * `precisionEvaluate('getPrice() * val(getQuantity())')`, declared non-persistent at
   * [model/entity/OrderItem.cfc:L89]. It arrives here ALREADY COMPUTED because of the
   * anti-corruption inversion, and for no other reason: recomputing it inside the engine would mean
   * porting the out-of-scope `OrderItem` behaviour that computes it, which is exactly what this
   * boundary exists to avoid. Whatever constructs the view owns that computation.
   */
  readonly extendedPrice: Money;

  /**
   * The extended SKU amount: SKU unit price times quantity.
   *
   * The minuend of the second arm's correction term [model/service/PromotionService.cfc:L252].
   * Mandatory for the same reason as its three siblings; see {@link OrderItemView.price}.
   *
   * CFML parity [model/entity/OrderItem.cfc:L204]: computed on the legacy entity as
   * `precisionEvaluate('getSkuPrice() * getQuantity()')`. Note that the legacy entity declares a
   * non-persistent property for `extendedPrice` [model/entity/OrderItem.cfc:L89] but none for this
   * value - only the method exists. It arrives here ALREADY COMPUTED for the same anti-corruption
   * reason as `extendedPrice`, and for no other.
   */
  readonly extendedSkuPrice: Money;

  /**
   * The price group whose rate produced `price`, or `undefined` when none did.
   *
   * `undefined` MEANS NOT PRICE-GROUP ELIGIBLE, and this member is the discriminator at
   * [model/service/PromotionService.cfc:L241]: `isNull(orderItem.getAppliedPriceGroup())` selects the
   * `price` arm outright, and only a present group is offered to
   * `reward.hasEligiblePriceGroup(...)`. NEVER default this to a `PriceGroup` - fabricating a group
   * would push a price-group-free item down the `skuPrice` arm and apply a correction term that has
   * nothing to correct.
   *
   * Declared as a REQUIRED member whose type includes `undefined`, not as an optional `?:` member.
   * The legacy column always exists and is simply nullable
   * [model/entity/OrderItem.cfc:L60]: `property name="appliedPriceGroup" cfc="PriceGroup"
   * fieldtype="many-to-one" fkcolumn="appliedPriceGroupID";` - and under
   * `exactOptionalPropertyTypes` an omitted key and a present-but-undefined key are not
   * interchangeable.
   *
   * EXECUTION ORDERING - `updateOrderAmountsWithPriceGroups` MUST RUN BEFORE
   * `updateOrderAmountsWithPromotions`. This member is written by the price-group pass:
   * [model/service/PriceGroupService.cfc:L371-L372] performs `setPrice( priceGroupDetails.price )`
   * and then `setAppliedPriceGroup( priceGroupDetails.priceGroup )`. It is read by the promotion pass
   * at [model/service/PromotionService.cfc:L241]. In the legacy system that ordering held only
   * because `OrderService` happened to call the two services in that sequence -
   * [model/service/OrderService.cfc:L60-L61] injects `priceGroupService` and then
   * `promotionService` - and nothing enforced it. In the target it is explicit. `orderView.ts` holds
   * the authoritative statement of this constraint; this note cross-references it.
   *
   * The association is traversed ONE WAY ONLY. The reciprocal `PriceGroup.appliedOrderItems`
   * one-to-many [model/entity/PriceGroup.cfc:L62] is deliberately not materialized on the ported
   * `PriceGroup`, precisely because the order aggregate reaches the in-scope engines as a read-only
   * view and never as an association.
   */
  readonly appliedPriceGroup: PriceGroup | undefined;

  /**
   * The item's type, carrying only the system code the engine tests.
   *
   * Non-nullable: [model/service/PromotionService.cfc:L206] dereferences
   * `orderItem.getOrderItemType().getSystemCode()` with no absence test, and the legacy mapping
   * fetches the association eagerly [model/entity/OrderItem.cfc:L61 `fetch="join"`]. See
   * {@link OrderItemTypeView} for why the shape is reduced to one field and why it is declared here
   * rather than in a file of its own.
   */
  readonly orderItemType: OrderItemTypeView;

  /**
   * The owning fulfillment's opaque identifier.
   *
   * OPAQUE, and a deliberate structural decision rather than an omission. The engine reads the owning
   * fulfillment exactly once, and only for its identifier:
   * [model/service/PromotionService.cfc:L209] evaluates
   * `arrayFind( ...qualifiedFulfillmentIDs, orderItem.getOrderFulfillment().getOrderFulfillmentID() )`
   * to confirm the item sits in a fulfillment the promotion period qualified. No other in-scope call
   * site touches the association at all.
   *
   * Because only the identifier is read, this member is a plain `string` and NOT a nested
   * `OrderFulfillmentView`. Nesting the fulfillment view here would make the two modules import each
   * other, because `orderFulfillmentView.ts` would then be both this module's dependency and - via
   * the shared `AppliedPromotionView` below - its dependent. Carrying the identifier instead keeps
   * the folder's dependency graph a DAG and upholds invariant 3. The asymmetry is verified in the
   * source: the fulfillment reward branch [model/service/PromotionService.cfc:L345-L410] contains no
   * `orderItem.get*()` reference whatsoever, so `orderFulfillmentView.ts` has no reason to import
   * this module in either direction.
   *
   * ORM authority [model/entity/OrderItem.cfc:L66]: `property name="orderFulfillment"
   * cfc="OrderFulfillment" fieldtype="many-to-one" fkcolumn="orderFulfillmentID";`
   */
  readonly orderFulfillmentID: string;

  /**
   * The applied-promotion records this item is carrying when the engine receives it - that is,
   * whatever a PREVIOUS invocation left behind. NOT the records this invocation will produce.
   *
   * WHY THIS MEMBER EXISTS, AND WHY OMITTING IT LOSES MONEY. The engine's very first act is a
   * blanket clear [model/service/PromotionService.cfc:L61-L80]: three reverse-index loops detach
   * every previously applied promotion before any qualification runs. The item arm is L64-L68:
   *
   *   for(var oi=arrayLen(arguments.order.getOrderItems()); oi >= 1; oi--) {
   *     for(var pa=arrayLen(arguments.order.getOrderItems()[oi].getAppliedPromotions()); pa >= 1; pa--) {
   *       arguments.order.getOrderItems()[oi].getAppliedPromotions()[pa].removeOrderItem();
   *     }
   *   }
   *
   * `removeOrderItem()` [model/entity/PromotionApplied.cfc:L103] `arrayDeleteAt`s from this very
   * association, so in the legacy the clear is a side effect on a live ORM graph. Here the aggregate
   * is out of scope and the only channel back to persistence is the returned intent array, so the
   * engine must EMIT one remove intent per row - and it can only emit intents for rows it was shown.
   * Without this member the item half of L61-L80 becomes unexpressible, and a stale item discount
   * survives a recalculation that no longer qualifies it.
   *
   * READ EXACTLY ONCE, AND ONLY BY THE CLEAR. No qualification gate, no membership test, no discount
   * calculation and no winner comparison may read this collection. The post-clear state is EMPTY, and
   * every subsequent legacy read of an item's applied promotions - including the L521-L537 creation
   * block - therefore sees an empty association. A consumer that let these rows compete with the
   * current pass's rewards would reproduce neither the legacy nor anything correct.
   *
   * The element type is shared with `OrderFulfillmentView.appliedPromotions` and
   * `OrderView.appliedPromotions` because all three associations point at the same entity,
   * [model/entity/PromotionApplied.cfc], and the clear addresses a row the same way at all three
   * levels. Duplicating the shape per level would let the three sides drift.
   *
   * ★ QUOTE-THEN-REVISE. That sentence used to end "and the clear reads the same two fields at all
   * three levels." It reads NEITHER of them. The clear at [model/service/PromotionService.cfc:L64-L68,
   * L71-L75, L78-L80] calls `removeOrderItem()` / `removeOrderFulfillment()` / `removeOrder()` on the
   * row OBJECT, reached by reverse index - the row's own identity is the whole address, and both of the
   * fields the old sentence named are NULLABLE anyway [model/entity/PromotionApplied.cfc:L53, L58].
   * The shared shape now carries `promotionAppliedID` for exactly this reason; see
   * `AppliedPromotionView` in `./orderFulfillmentView.js`.
   *
   * ORM authority [model/entity/OrderItem.cfc:L71]: `property name="appliedPromotions"
   * singularname="appliedPromotion" cfc="PromotionApplied" fieldtype="one-to-many"
   * fkcolumn="orderItemID" inverse="true" cascade="all-delete-orphan";`
   *
   * That `fkcolumn="orderItemID"` is what makes this a DISTINCT association from
   * `OrderView.appliedPromotions`, which carries [model/entity/Order.cfc:L72] `fkcolumn="orderID"`.
   * The two are not views of one collection and must never be conflated.
   */
  readonly appliedPromotions: readonly AppliedPromotionView[];
}
