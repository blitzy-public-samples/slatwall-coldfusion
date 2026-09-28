/**
 * PROMOTION APPLICATION - the terminal step of the promotion engine's sales branch: decide which
 * single discount each order item receives, and emit it.
 *
 * LEGACY-NOTE [model/entity/PromotionReward.cfc:L57]: the preserved permission-string typo
 * `hb_permission="promotionPeriod.promtionRewards"` is published as sitting on L49; L49 of that
 * file is blank and the attribute is on the `component` declaration at L57.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L529-L535]: the order-item level is ADD-ONLY -
 * the block creates a record and calls four setters, performing no update, removal, merge or
 * de-duplication.
 *
 * The two order-type gates are sequential `if`s, not `if`/`else if`.
 */

import type {
  AddPromotionAppliedIntent,
  OrderItemQualifiedDiscounts,
  PromotionAppliedIntent,
  QualifiedDiscount,
} from '../../domain/promotionEngine/qualifiedDiscountTypes.js';
import type { Money } from '../../domain/valueObjects/money.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import type { OrderView } from '../../domain/views/orderView.js';
import { structGet, structKeyExists } from '../../lib/cfml/struct.js';

// LEGACY-NOTE [model/service/PromotionService.cfc:L532]: `../../domain/entities/promotion.js` is
// deliberately not imported, even though the legacy passes a live Promotion entity to
// `setPromotion` at L532.

/**
 * Build the one applied-promotion intent for one order item, from the discount record that won.
 *
 * The whole of [model/service/PromotionService.cfc:L530-L534] - the construction and its four
 * setters - expressed as data.
 *
 * @param orderItem the order item being priced.
 * @param bestQualifiedDiscount the record at the head of that order item's qualified-discount
 * list, already selected by the caller.
 */
function buildOrderItemDiscountIntent(
  orderItem: OrderItemView,
  bestQualifiedDiscount: QualifiedDiscount,
): AddPromotionAppliedIntent {
  // CFML parity [model/service/PromotionService.cfc:L533]: `setOrderItem( orderItem )` names the
  // target by passing the live entity; the intent names it by opaque identifier.
  const orderItemID: string = orderItem.orderItemID;

  // CFML parity [model/service/PromotionService.cfc:L532]: `setPromotion(...[1].promotion )`
  // passes the Promotion entity; the intent carries `promotionID`, resolved from that same entity.
  const promotionID: string = bestQualifiedDiscount.promotion.getPromotionID();

  // CFML parity [model/service/PromotionService.cfc:L534]:
  // `setDiscountAmount(...[1].discountAmount )` hands the accumulated amount straight through, and
  // so does this.
  const discountAmount: Money = bestQualifiedDiscount.discountAmount;

  return {
    // CFML parity [model/service/PromotionService.cfc:L531]: `setAppliedType('orderItem')` - the
    // exact literal, single-quoted lowercase-camel, neither derived nor uppercased nor replaced by
    // an enum.
    appliedType: 'orderItem',

    // The order-item level is add-only; see the ADD-ONLY note in this file's header.
    operation: 'add',

    promotionID,
    orderItemID,
    discountAmount,

    // `orderID` and `orderFulfillmentID` are OMITTED because the order-item variant of
    // `AddPromotionAppliedIntent` FORBIDS them - both are typed `?: never` on that variant.
  };
}

/**
 * @param order a read-only view of the order.
 * @param orderItemQualifiedDiscounts the qualified-discount accumulator, keyed by opaque
 * `orderItemID`, each list already sorted descending by discount amount by the passes that ran
 * before this one.
 * @returns one intent per order item that has at least one surviving qualified discount, in
 * order-item order.
 */
export function applyBestOrderItemDiscounts(
  order: OrderView,
  orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
): PromotionAppliedIntent[] {
  const appliedIntents: PromotionAppliedIntent[] = [];

  // LEGACY-NOTE [model/service/PromotionService.cfc:L524, L526]: the source calls
  // `arguments.order.getOrderItems()` twice per iteration - once in the loop condition and once to
  // bind the element - and the collection it returns is live.
  const orderItems = order.orderItems;

  // CFML parity [model/service/PromotionService.cfc:L524, L526]: the source is a 1-based counted
  // `for` that indexes the collection by `i`; the target iterates the captured array directly.
  for (const orderItem of orderItems) {
    const orderItemID = orderItem.orderItemID;

    // LEGACY-NOTE [model/service/PromotionService.cfc:L529, L532, L534]: the source looks the same
    // key up four times per qualifying iteration - inside `structKeyExists`, as the argument to
    // `arrayLen`, and once each at L532 and L534 - and the target performs one indexed lookup into
    // a local instead.
    const qualifiedDiscounts = structGet(orderItemQualifiedDiscounts, orderItemID);

    // CFML parity [model/service/PromotionService.cfc:L529]: the guard reproduces both of the
    // source's conditions, in the source's order, joined by short-circuiting `&&`.
    if (
      structKeyExists(orderItemQualifiedDiscounts, orderItemID) &&
      qualifiedDiscounts !== undefined &&
      qualifiedDiscounts.length > 0
    ) {
      // CFML parity [model/service/PromotionService.cfc:L532, L534]: both reads index `[1]`, and
      // CFML arrays are 1-based, so `[1]` is the FIRST element - index `0` here.
      const bestQualifiedDiscount = qualifiedDiscounts[0];

      // Narrowed rather than asserted, for the same reason as the conjunct above:
      // `noUncheckedIndexedAccess` types an array element read as possibly absent even after a
      // length test.
      if (bestQualifiedDiscount !== undefined) {
        appliedIntents.push(buildOrderItemDiscountIntent(orderItem, bestQualifiedDiscount));
      }
    }
  }

  return appliedIntents;
}
