/**
 * Sale-price seeding - the pass that enters sale prices into the discount competition.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L142]: the accumulator is spelled
 * `orderItemQulifiedDiscounts` in the source - "Qulified", missing the `a`.
 */

import type { Promotion } from '../../domain/entities/promotion.js';
import type {
  OrderItemQualifiedDiscounts,
  QualifiedDiscount,
} from '../../domain/promotionEngine/qualifiedDiscountTypes.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import type { OrderView } from '../../domain/views/orderView.js';
import { structKeyExists } from '../../lib/cfml/struct.js';

/**
 * Resolves a {@link Promotion} from an opaque promotion identifier.
 *
 * JUDGMENT CALL: the framework accessor becomes a constructor-injected collaborator typed to this
 * local interface rather than a fourteenth port or a new member on
 * `../../domain/ports/promotionRepository.js`.
 *
 * The declaration is module-local and unexported: publishing it would make it an importable
 * contract any adapter may implement, which is a port in everything but the folder it sits in.
 */
interface SalePricePromotionResolver {
  getPromotion(promotionID: string): Promise<Promotion>;
}

/**
 * Store `value` on `target` under `key` as an own, enumerable data property.
 *
 * CFML parity [model/service/PromotionService.cfc:L152]: a CFML struct has no prototype chain and
 * no reserved keys, so `orderItemQulifiedDiscounts[ '__proto__' ]` held its array like any other
 * order item.
 *
 * @param target the caller's accumulator.
 * @param key the opaque order-item identifier.
 * @param value the potential-discount array to store.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Seeds sale-price records into the qualified-discount accumulator.
 *
 * A class rather than a bare function so the promotion resolver arrives as an explicit,
 * compile-checked constructor argument - the replacement for the legacy convention-scanned bean
 * factory.
 *
 * INSTANCES CARRY no MUTABLE STATE: the only field is the `readonly` resolver, and the accumulator
 * written into belongs to the caller.
 */
export class SalePriceSeeder {
  constructor(private readonly promotionResolver: SalePricePromotionResolver) {}

  /**
   * Runs the sale-price seeding pass over one order.
   *
   * The accumulator is supplied by the caller, not returned.
   *
   * JUDGMENT CALL: this method is `async` because the promotion resolution at
   * [model/service/PromotionService.cfc:L157] reaches persistent storage, and for no other reason.
   *
   * @param order the order to seed, as the read-only anti-corruption view.
   * @param orderItemQualifiedDiscounts the caller's accumulator, written in place.
   */
  public async seedSalePriceDiscounts(
    order: OrderView,
    orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
  ): Promise<void> {
    const orderItems: readonly OrderItemView[] = order.orderItems;

    // CFML parity [model/service/PromotionService.cfc:L157]: `this.getPromotion(id)` resolves
    // through the ORM session, whose identity map answers the second request for an identifier
    // with the very same entity instance it answered the first with.
    //
    // A field on the seeder would survive between unrelated requests on a warm container.
    const resolvedPromotions = new Map<string, Promotion>();

    for (const orderItem of orderItems) {
      const salePriceDetails = orderItem.sku.getSalePriceDetails();

      const skuPrice = orderItem.sku.getPrice();

      // CFML parity [model/service/PromotionService.cfc:L148]: the gate is a CONJUNCTION of two
      // independent tests joined by a SHORT-CIRCUITING `&&`, and both halves are reproduced in
      // order - key presence first, comparison second.
      if (
        salePriceDetails !== undefined &&
        structKeyExists(salePriceDetails, 'salePrice') &&
        salePriceDetails.salePrice.isLessThan(skuPrice)
      ) {
        const salePrice = salePriceDetails.salePrice;
        const quantity = orderItem.quantity;
        const orderItemID = orderItem.orderItemID;

        const discountAmount = skuPrice.times(quantity).minus(salePrice.times(quantity));

        const potentialDiscounts: QualifiedDiscount[] = [];
        // `putOwnStructKey`, not `orderItemQualifiedDiscounts[orderItemID] = …`: the key is an
        // opaque identifier from the order view, and a plain assignment for `__proto__` would
        // store nothing.
        putOwnStructKey(orderItemQualifiedDiscounts, orderItemID, potentialDiscounts);

        // The identity map declared at the top of the pass is consulted FIRST, exactly as the ORM
        // session consults its own before reaching storage.
        const memoizedPromotion = resolvedPromotions.get(salePriceDetails.promotionID);
        let promotion: Promotion;

        if (memoizedPromotion !== undefined) {
          promotion = memoizedPromotion;
        } else {
          promotion = await this.promotionResolver.getPromotion(salePriceDetails.promotionID);
          resolvedPromotions.set(salePriceDetails.promotionID, promotion);
        }

        // [model/service/PromotionService.cfc:L154-L159] `arrayAppend` of exactly one record, into
        // the array created one line above. The record has EXACTLY three members; see the header
        // note on the L121-L131 docblock, which promises five.
        potentialDiscounts.push({
          promotionRewardID: '',
          promotion,
          discountAmount,
        });
      }
    }
  }
}
