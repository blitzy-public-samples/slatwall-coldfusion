/**
 * Read-only order shapes: the ROOT of the anti-corruption boundary between the ported promotion
 * and price-group engines and the Order aggregate, which stays in CFML.
 *
 * `PromotionService.updateOrderAmountsWithPromotions(required any order)`
 * [model/service/PromotionService.cfc:L58] takes an Order, and
 * `PriceGroupService.updateOrderAmountsWithPriceGroups(required any order)`
 * [model/service/PriceGroupService.cfc:L364] takes one too - yet `model/service/OrderService.cfc`
 * and every order.
 *
 * JUDGMENT CALL: a value the legacy schema permits to be absent is modelled as a REQUIRED member
 * whose type includes `undefined`, never as an optional `?:` member.
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
 * CFML parity [model/entity/Order.cfc:L65]: the legacy association is a many-to-one to the generic
 * `Type` entity, which is out of scope; the promotion engine reads exactly one field from it.
 */
export interface OrderTypeView {
  /**
   * The type's system code.
   *
   * The engine reads it only to recognise a return or exchange order, whose reward branch
   * [model/service/PromotionService.cfc:L542-L544] is an empty no-op. That branch's legacy TODO is
   * carried forward verbatim where the branch itself lives, in `src/services/promotionService.ts`.
   */
  readonly systemCode: string;
}

/**
 * One order, as the promotion and price-group engines read it.
 *
 * The member set is exhaustive and closed at twelve: ten censused accessors plus two structural
 * members whose provenance is labelled honestly below.
 *
 * `model/service/PriceGroupService.cfc` adds no eleventh accessor: its only reads are `getAccount`
 * [model/service/PriceGroupService.cfc:L365, L367] and `getOrderItems`
 * [model/service/PriceGroupService.cfc:L366, L367, L369, L370, L371].
 */
export interface OrderView {
  /**
   * The order's opaque identifier.
   *
   * Structural, not census-derived - and labelled as such deliberately.
   */
  readonly orderID: string;

  /**
   * The order's items, already populated.
   *
   * Read at [model/service/PromotionService.cfc:L64, L65, L66] by the backwards clear-out loop, at
   * L145 by sale-price seeding, at L203 by the merchandise reward branch, at L524 and L526 by the
   * final best-discount apply, at L720 and at L797.
   */
  readonly orderItems: readonly OrderItemView[];

  /**
   * The order's fulfillments, already populated.
   */
  readonly orderFulfillments: readonly OrderFulfillmentView[];

  /**
   * The promotions ALREADY applied to the order itself, as persisted state.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L431-L439]: the order-level branch indexes
   * element `[1]` of this collection, assuming at most one promotion is applied per order, and it
   * does so on the `else` arm of the L427 emptiness test.
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly appliedPromotions: readonly AppliedPromotionView[];

  /**
   * The total quantity across the order's sale items.
   *
   * A count, not money, and therefore genuinely a `number`.
   *
   * PRE-COMPUTED - see the class note on the five pre-computed members.
   * CFML parity [model/entity/Order.cfc:L624-L631]: a derived accessor that sums `getQuantity()`
   * over items whose type code is `"oitSale"`, not a column.
   */
  readonly totalSaleQuantity: number;

  /**
   * The order's subtotal.
   *
   * Read by the minimum- and maximum-order-subtotal qualifier gates
   * [model/service/PromotionService.cfc:L648, L650].
   *
   * PRE-COMPUTED - see the class note on the five pre-computed members.
   */
  readonly subtotal: Money;

  /**
   * The order's type, carrying only the system code the engine tests.
   */
  readonly orderType: OrderTypeView;

  /**
   * The owning account's opaque identifier, or `undefined` when the order has no account.
   *
   * The out-of-scope account, reduced to an identifier - invariant.
   *
   * Declared as a REQUIRED member whose type includes `undefined`, not as an optional `?:` member
   * see the JUDGMENT CALL in this module's header.
   */
  readonly accountID: string | undefined;

  /**
   * The order's subtotal net of the discounts already applied to its items.
   *
   * L417 sits inside the order-level reward branch, whose gate is
   * `} else if (orderRewards and reward.getRewardType() eq "order" ) {`
   * [model/service/PromotionService.cfc:L415].
   *
   * If(!orderRewards and pr == arrayLen(promotionRewards)) { pr = 0; orderRewards = true; }.
   */
  readonly subtotalAfterItemDiscounts: Money;

  /**
   * The order's promotion codes as a comma-delimited list.
   *
   * And again at [model/service/PromotionService.cfc:L1040], where the shipping-method-option path
   * reaches it through `getOrderFulfillment().getOrder().getPromotionCodeList()`.
   *
   * PRE-COMPUTED - see the class note on the five pre-computed members.
   */
  readonly promotionCodeList: string;

  /**
   * The order's fulfillment charges net of the discounts already applied to its fulfillments.
   *
   * No longer read by the promotion engine, for the same reason as its sibling, but by
   * reconstruction rather than by identity.
   *
   * Why the MEMBER REMAINS: as for its sibling - a faithful projection of
   * [model/entity/Order.cfc:L356-L363], retained, not load-bearing, and never to be reintroduced
   * as a discount base.
   */
  readonly fulfillmentChargeAfterDiscountTotal: Money;

  /**
   * The currency the order's amounts are denominated in.
   *
   * Typed `CurrencyCode` rather than `string`: the branded type makes the three-character
   * constraint the column already declares checkable at the boundary.
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
 * [model/service/PromotionService.cfc:L1057] uses it purely as the hop to the shipping method.
 */
export interface ShippingMethodRateView {
  /**
   * The shipping method this rate is for.
   *
   * Non-nullable: [model/service/PromotionService.cfc:L1057] dereferences
   * `getShippingMethodRate().getShippingMethod()` with no absence test, in pointed contrast to the
   * fulfillment-level gate at [model/service/PromotionService.cfc:L355].
   */
  readonly shippingMethod: ShippingMethodView;
}

/**
 * One shipping-method option, as `getShippingMethodOptionsDiscountAmountDetails` reads it.
 *
 * Because the legacy chain reaches `shippingMethodOption.getOrderFulfillment().getOrder()`, the
 * shape transitively requires `OrderView`.
 *
 * CFML parity [model/service/PromotionService.cfc:L1059-L1063]: this address-zone loop passes
 * `.getOrderFulfillment().getAddress()` straight to `isAddressInZone` with no
 * `!isNull(...) && !...isNew()` guard.
 */
export interface ShippingMethodOptionView {
  /**
   * The fulfillment this option belongs to.
   */
  readonly orderFulfillment: OrderFulfillmentView;

  /**
   * The owning order, FLATTENED directly onto the option rather than nested inside the
   * fulfillment.
   *
   * This flattening is what breaks the cycle, and it is the whole reason this shape lives in this
   * module.
   *
   * An opaque `orderID` would not suffice here, and this is the one place in these three modules
   * where that is true.
   */
  readonly order: OrderView;

  /**
   * The rate whose shipping method the reward's shipping-method collection is tested against.
   */
  readonly shippingMethodRate: ShippingMethodRateView;

  /**
   * The option's total charge: the base the fulfillment discount is computed from.
   *
   * Non-nullable, and `Money.zero` is not a substitute for a charge that could not be resolved: a
   * discount computed from a base of nothing is zero.
   */
  readonly totalCharge: Money;
}
