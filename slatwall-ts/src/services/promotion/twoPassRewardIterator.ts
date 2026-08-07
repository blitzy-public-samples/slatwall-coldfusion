// The two-pass promotion-reward iteration mechanism.
//
// Ports the reward fetch and the hand-rolled two-pass traversal inside
// `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58]: the DAO call at
// L165, the pass flag at L166, the traversal at L167 and the loop-counter reset at L458-L461.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L61]: the two order-type gates are SEQUENTIAL
// `if` statements rather than an `if`/`else if` pair, and both are facade-owned.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L197]: the period-qualification memo is
// populated at L192-L194 and read at L197, both outside this module's range, so the gate is
// neither owned nor evaluated here.

import type { PromotionReward } from '../../domain/entities/promotionReward.js';
import type { PromotionRepository } from '../../domain/ports/promotionRepository.js';
import type { OrderView } from '../../domain/views/orderView.js';

export interface RewardVisitOutcome {
  /**
   * Whether the reward's promotion period met its general use-count qualification -
   * [model/service/PromotionService.cfc:L197].
   */
  readonly qualificationsMeet: boolean;
}

/**
 * @param reward One reward from the fetched collection, in the order the collection arrived -
 * [model/service/PromotionService.cfc:L169] `var reward = promotionRewards[pr];`.
 * @param isOrderRewardsPass The legacy `orderRewards` flag
 * [model/service/PromotionService.cfc:L166] as the source would see it on this visit: `false`
 * throughout pass one and `true` throughout pass two.
 * @returns The gate outcome for this reward, awaited by the iterator.
 */
export type RewardVisitor = (
  reward: PromotionReward,
  isOrderRewardsPass: boolean,
) => Promise<RewardVisitOutcome> | RewardVisitOutcome;

// LEGACY-NOTE [model/service/PromotionService.cfc:L169, L472, L475, L476, L477]: the
// last-processed reward identifier is surfaced SOLELY so that register entry 9 can be reproduced
// faithfully - never to repair it.

/**
 * What one full invocation of the iteration reports back.
 */
export interface TwoPassRewardIterationResult {
  /**
   * The `promotionRewardID` of the LAST reward this invocation processed -
   * [model/service/PromotionService.cfc:L169] made explicit.
   *
   * Which reward this is after a two-pass invocation: pass two re-traverses the whole collection,
   * so the value that survives is the final element as seen by pass two.
   */
  readonly lastProcessedRewardID: string;
}

/**
 * The two-pass promotion-reward iteration mechanism - order-dependence vector.
 *
 * That cross-service constraint is not enforced by this module.
 *
 * @see {@link RewardVisitor} for what the caller supplies.
 */
export class TwoPassRewardIterator {
  /**
   * @param promotionRepository The promotion port, sole collaborator.
   */
  constructor(private readonly promotionRepository: PromotionRepository) {}

  /**
   * Fetch the active rewards and traverse them in two ordered passes.
   *
   * `async` for exactly one reason: L165 reaches persistence through the repository port.
   *
   * Fetch [model/service/PromotionService.cfc:L165] - three arguments, values reproduced exactly,
   * result order untouched.
   *
   * @param order The read-only order view.
   * @param onReward The per-reward visitor.
   * @returns The last-processed reward identifier, for the register-entry-9 hand-off.
   */
  async iterate(order: OrderView, onReward: RewardVisitor): Promise<TwoPassRewardIterationResult> {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L165, L1040]: two distinct call shapes reach
    // the same DAO method, and they must not be normalised into one.

    // LEGACY-NOTE [model/service/PromotionService.cfc:L165, L200, L714, L794]: the reward-type
    // comma list appears at three sites in three different forms, and each literal stays exactly
    // where and as it is written.

    // [model/service/PromotionService.cfc:L164] Loop over all Potential Discounts that require
    // qualifications.
    //
    // [model/service/PromotionService.cfc:L165] The three argument VALUES are reproduced exactly:
    // the five-token reward-type list in source order, the order's promotion-code list, and
    // `qualificationRequired` explicitly `true`.
    const promotionRewards: readonly PromotionReward[] =
      await this.promotionRepository.getActivePromotionRewards(
        'merchandise,subscription,contentAccess,order,fulfillment',
        order.promotionCodeList,
        true,
      );

    // LEGACY-NOTE [model/service/PromotionService.cfc:L167, L458]: `arrayLen(promotionRewards)` is
    // re-evaluated on every loop-condition check and again inside the reset condition; the bound
    // is captured once here instead.
    const rewardCount: number = promotionRewards.length;

    let lastProcessedRewardID = '';

    // [model/service/PromotionService.cfc:L166] `var orderRewards = false;` - the legacy
    // identifier carried over verbatim. Per-invocation local.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L458-L461]: the exactly-two-passes proof,
    // encoded rather than inherited.
    let orderRewards = false;
    for (const [index, reward] of promotionRewards.entries()) {
      lastProcessedRewardID = reward.getPromotionRewardID();

      const outcome: RewardVisitOutcome = await onReward(reward, orderRewards);

      // [model/service/PromotionService.cfc:L197] the gate, which closes at L463.
      if (outcome.qualificationsMeet) {
        // [model/service/PromotionService.cfc:L457] This forces the loop to repeat looking for
        // "order" discounts.
        //
        // CFML parity [model/service/PromotionService.cfc:L459]: `pr = 0` does not skip an
        // element.
        if (!orderRewards && index === rewardCount - 1) {
          orderRewards = true;
        }
      }
    }
    // [model/service/PromotionService.cfc:L465] END of PromotionReward Loop.

    // LEGACY-NOTE [model/service/PromotionService.cfc:L167, L197, L458-L461]: both EDGE OUTCOMES
    // from the header are encoded by this guard, and there is no third - an EMPTY collection
    // leaves `rewardCount` at 0 so the L458 condition is never evaluated.
    if (orderRewards) {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L200, L415, L459]: pass two is a COMPLETE
      // RE-TRAVERSAL of the same collection in the same order, not a continuation of pass one.
      for (const reward of promotionRewards) {
        lastProcessedRewardID = reward.getPromotionRewardID();

        await onReward(reward, orderRewards);
      }
    }

    return { lastProcessedRewardID };
  }
}
