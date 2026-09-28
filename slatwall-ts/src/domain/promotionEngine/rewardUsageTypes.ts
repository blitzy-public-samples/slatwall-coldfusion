/**
 * The three `src/domain/promotionEngine/` modules import nothing from each other, which is what
 * lets any one be regenerated without touching the other two.
 *
 * LEGACY-NOTE [model/entity/PromotionReward.cfc:L57]: the
 * `hb_permission="promotionPeriod.promtionRewards"` typo - a genuine data contract, preserved
 * verbatim and never renamed - is on the component declaration at L57 alongside
 * `table="SwPromoReward"`, not at L49.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L252]: the price-group discount correction is on
 * L252, not L248 - L248 is a comment and L249 is the `getDiscountAmount` call.
 */
import type { PromotionReward } from '../entities/promotionReward.js';
import type { Money } from '../valueObjects/money.js';

/**
 * The literal the legacy engine seeds into all three use limits to mean "no limit": one million,
 * exactly as written.
 *
 * CFML parity [model/service/PromotionService.cfc:L175, L176, L177]: the seed at L173-L179 writes
 * `1000000` into `maximumUsePerOrder`, `maximumUsePerItem` and `maximumUsePerQualification`, and
 * this alias names that literal without changing it.
 */
export type UnlimitedUseSentinel = 1000000;

/**
 * One record of one promotion reward having been used on one order item.
 *
 * Every member is `readonly`, on the evidence: no source line ever rewrites a field of an existing
 * usage record - L309 and L323 construct FRESH objects, and the two lines that read a record back.
 */
export interface OrderItemUsage {
  /**
   * Which order item this usage was recorded against.
   *
   * OPAQUE: the value of `orderItem.getOrderItemID()`
   * [model/service/PromotionService.cfc:L310, L324], never branded, never parsed and never
   * resolved back to an OrderItem.
   */
  readonly orderItemID: string;

  /**
   * How many units of that order item this reward was applied to.
   *
   * A count, so genuinely `number` and never `Money`: derived at
   * [model/service/PromotionService.cfc:L228] as
   * `qualificationQuantity * maximumUsePerQualification`, then clamped twice - to the order item's
   * own quantity at L231-L233 and to `maximumUsePerItem` at L236-L238.
   */
  readonly discountQuantity: number;
  readonly discountPerUseValue: Money;
}

/**
 * One promotion reward's use limits and its running usage, as the engine accumulates them.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L180, L183, L186]: each override is guarded by
 * `!isNull(x) && x > 0`, so a stored limit of ZERO - or a negative - leaves the `1000000` sentinel
 * in place and the reward is treated as UNLIMITED.
 */
export interface PromotionRewardUsageDetail {
  /**
   * How many units this reward has been applied to across the whole order so far.
   *
   * CFML parity [model/service/PromotionService.cfc:L297]: `usedInOrder += discountQuantity`
   * accumulates in PLACE, once per order item that qualifies, inside the reward loop that closes
   * at L465.
   */
  usedInOrder: number;

  /**
   * The most units this reward may be applied to across the whole order.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L223-L224]: the ratchet is a sixth way
   * `updateOrderAmountsWithPromotions` is order-dependent, beyond the five recorded on
   * `qualifiedDiscountTypes.ts`.
   */
  maximumUsePerOrder: number;

  /**
   * The most units this reward may be applied to on any single order item.
   *
   * `readonly` on the evidence: exactly one line writes it, the seed-time override at
   * [model/service/PromotionService.cfc:L184].
   */
  readonly maximumUsePerItem: number;

  /**
   * The most units this reward may be applied to per qualification.
   *
   * `readonly` on the evidence: exactly one line writes it, the seed-time override at
   * [model/service/PromotionService.cfc:L187].
   */
  readonly maximumUsePerQualification: number;

  /**
   * A `readonly` PROPERTY holding a MUTABLE array: the property is never reassigned - the array is
   * created empty by the seed at [model/service/PromotionService.cfc:L178] - while its CONTENTS
   * are mutated twice.
   *
   * CFML parity [model/service/PromotionService.cfc:L306]: the comparison is strictly `>`, so on
   * an exact tie the incumbent keeps its earlier position - first-in wins.
   */
  readonly orderItemsUsage: OrderItemUsage[];
}
export type PromotionRewardUsageKey = ReturnType<PromotionReward['getPromotionRewardID']>;

/**
 * Reproduction is owned by `src/services/promotion/overUseStripping.ts`; this file's narrower
 * obligation is to keep the defect EXPRESSIBLE.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: the over-use correction loop
 * iterates the ledger by key but indexes its limits at L472, L479 and L486 through the `reward`
 * variable left over from the previous loop, so per-order use limits are enforced against whichever
 * reward ran last. It can increase a discount, not only under-enforce one.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L166, L458-L461]: the two-pass reward iteration
 * is implemented by mutating the loop counter.
 */
export type PromotionRewardUsageDetails = Record<
  PromotionRewardUsageKey,
  PromotionRewardUsageDetail
>;
