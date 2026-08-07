/**
 * `model/service/PromotionService.cfc` is the sole behavioural authority for this module.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L542-L544]: the legacy TODO the plan names by
 * ticket number - `//
 * TODO [issue #1766]`, the return/exchange branch that does nothing - sits in the facade's span
 * and is not absorbed here.
 *
 * LEGACY-NOTE [meta/tests/unit/service/]: no legacy test touches this behaviour.
 */

import type { PromotionReward } from '../../domain/entities/promotionReward.js';
import type {
  PromotionRewardUsageDetail,
  PromotionRewardUsageDetails,
  UnlimitedUseSentinel,
} from '../../domain/promotionEngine/rewardUsageTypes.js';
import type { Money } from '../../domain/valueObjects/money.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import { structGet, structKeyExists } from '../../lib/cfml/struct.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

/**
 * The value the legacy engine seeds into all three use limits to mean "the merchant configured no
 * limit": one million, exactly as written.
 *
 * [model/service/PromotionService.cfc:L223] compares the product
 * `qualificationQuantity * maximumUsePerQualification` against `maximumUsePerOrder`, so a seeded
 * sentinel is a multiplicand, and [model/service/PromotionService.cfc:L224] then assigns that same
 * product back into `maximumUsePerOrder`.
 */
const UNLIMITED_USE_UNTIL_CONFIGURED: UnlimitedUseSentinel = 1000000;

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port.
 *
 * CFML parity [model/service/PromotionService.cfc:L180, L183, L186]: the `!isNull(...)` half of
 * each of the three override guards.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is the right shape for a
 * general-purpose predicate but gives the compiler nothing to narrow with.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * The guard tests `> 0`, so a stored `0` FAILS it, the override never fires and the sentinel
 * survives.
 *
 * @param configuredLimit the persisted limit, `undefined` when the column is null.
 * @returns the configured limit when it is present and strictly positive, and {@link
 * UNLIMITED_USE_UNTIL_CONFIGURED} in every other case.
 */
function resolveUseLimit(configuredLimit: number | undefined): number {
  if (!isAbsent(configuredLimit) && configuredLimit > 0) {
    return configuredLimit;
  }

  return UNLIMITED_USE_UNTIL_CONFIGURED;
}

/**
 * Store `value` on `target` under `key` as an own, enumerable data property.
 *
 * CFML parity [model/service/PromotionService.cfc:L173-L178]: a CFML struct has no prototype chain
 * and no reserved keys, so `promotionRewardUsageDetails[ '__proto__' ]` accumulated usage exactly
 * like any other reward.
 *
 * @param target the ledger being seeded.
 * @param key the reward identifier.
 * @param value the seeded usage record.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
export class RewardUsageLedger {
  /**
   * Every reward's limits and running usage for this order, keyed by `promotionRewardID`.
   *
   * CFML parity [model/service/PromotionService.cfc:L139]: `var promotionRewardUsageDetails = {};`
   * a struct local to one invocation, starting empty and gaining a key per reward encountered.
   */
  private readonly ledger: PromotionRewardUsageDetails = {};

  /**
   * Named for the legacy variable at [model/service/PromotionService.cfc:L139] so that the
   * correspondence is visible at the call site.
   */
  public get promotionRewardUsageDetails(): PromotionRewardUsageDetails {
    return this.ledger;
  }

  /**
   * LEGACY-NOTE [model/service/PromotionService.cfc:L171]: the source comment on this block reads
   * "This will be used for the maxUsePerQualification & and maxUsePerItem up front, and then later
   * to remove discounts that violate max usage".
   *
   * @param reward the promotion reward being processed; only its identifier and its three use
   * limits are read.
   * @returns the existing entry when one is already present, otherwise the entry just seeded.
   */
  public ensureRewardEntry(reward: PromotionReward): PromotionRewardUsageDetail {
    const promotionRewardID = reward.getPromotionRewardID();

    // [model/service/PromotionService.cfc:L172] `if(!structKeyExists(...))` - the presence test is
    // delegated to the CFML `structKeyExists` port, which folds key case exactly as a CFML struct
    // does.
    if (structKeyExists(this.ledger, promotionRewardID)) {
      // The `!== undefined` test below therefore narrows a type rather than deciding behaviour: it
      // can only fail for a key stored with a literally `undefined` value, and nothing in this
      // module ever stores one.
      const existingUsage = structGet(this.ledger, promotionRewardID);

      if (existingUsage !== undefined) {
        // [model/service/PromotionService.cfc:L189] the guard's closing brace: when the entry
        // exists the legacy block does nothing at all. No re-seed, no re-read of the reward's
        // limits, no reset of accumulated usage.
        return existingUsage;
      }
    }

    // [model/service/PromotionService.cfc:L173-L179] the seed, and
    // [model/service/PromotionService.cfc:L180-L188] the three overrides, both expressed as one
    // construction; see the JUDGMENT CALL above.
    const seededUsage: PromotionRewardUsageDetail = {
      // [model/service/PromotionService.cfc:L174] `usedInOrder = 0`. A COUNT of uses, seeded to
      // the number zero - never `Money.zero`.
      usedInOrder: 0,
      maximumUsePerOrder: resolveUseLimit(reward.getMaximumUsePerOrder()),
      maximumUsePerItem: resolveUseLimit(reward.getMaximumUsePerItem()),
      maximumUsePerQualification: resolveUseLimit(reward.getMaximumUsePerQualification()),

      // [model/service/PromotionService.cfc:L178] `orderItemsUsage = []`. A fresh, EMPTY and
      // MUTABLE array per reward; the ascending insertion sort below is the only thing that ever
      // adds to it.
      orderItemsUsage: [],
    };
    putOwnStructKey(this.ledger, promotionRewardID, seededUsage);

    return seededUsage;
  }

  /**
   * Ratchets a reward's per-order use limit down to the allowance implied by how many times one
   * order item qualifies, when that allowance is strictly smaller than the limit already recorded.
   *
   * @param usage the ledger entry returned by {@link ensureRewardEntry} for the reward being
   * processed.
   * @param qualificationQuantity how many times this order item qualifies under the reward's
   * promotion period, read by the facade at [model/service/PromotionService.cfc:L222].
   */
  public ratchetMaximumUsePerOrder(
    usage: PromotionRewardUsageDetail,
    qualificationQuantity: number,
  ): void {
    // [model/service/PromotionService.cfc:L223, L224] the product both lines compute.
    const qualifiedUseAllowance = qualificationQuantity * usage.maximumUsePerQualification;

    // [model/service/PromotionService.cfc:L223] `lt` is strict; see the parity note above for why
    // this must not become `<=`.
    if (qualifiedUseAllowance < usage.maximumUsePerOrder) {
      // [model/service/PromotionService.cfc:L224] the ratchet, in place.
      usage.maximumUsePerOrder = qualifiedUseAllowance;
    }
  }

  /**
   * @param usage the ledger entry returned by {@link ensureRewardEntry} for the reward being
   * applied.
   * @param orderItem the read-only view of the order item receiving the discount; only its opaque
   * `orderItemID` is read, and it is never mutated.
   * @param discountQuantity how many uses this application consumes, already derived and clamped
   * by the facade at [model/service/PromotionService.cfc:L228-L238].
   * @param discountAmount the discount for this item, already computed by the facade at
   * [model/service/PromotionService.cfc:L244] or [model/service/PromotionService.cfc:L252].
   * @throws if `discountQuantity` is zero.
   */
  public recordOrderItemUsage(
    usage: PromotionRewardUsageDetail,
    orderItem: OrderItemView,
    discountQuantity: number,
    discountAmount: Money,
  ): void {
    // [model/service/PromotionService.cfc:L296-L297] "Increment the number of times this promotion
    // reward has been used" - `usedInOrder += discountQuantity`, in PLACE on the shared entry.
    usage.usedInOrder += discountQuantity;

    // LEGACY-NOTE [model/service/PromotionService.cfc:L299]: the divisor is unguarded, and the
    // absence of the guard is reproduced deliberately. The source applies no zero check to
    // `discountQuantity`, so a zero divisor raises a division-by-zero error in CFML.
    const discountPerUseValue = discountAmount.dividedBy(discountQuantity);

    this.insertUsageInAscendingOrder(
      usage,
      orderItem.orderItemID,
      discountQuantity,
      discountPerUseValue,
    );
  }

  /**
   * Files one usage record into a reward's `orderItemsUsage`, keeping the array in ascending order
   * of `discountPerUseValue`.
   *
   * CFML parity [model/service/PromotionService.cfc:L301-L329]: the ascending insertion sort.
   *
   * CFML parity [model/service/PromotionService.cfc:L304, L309]: CFML arrays are 1-BASED and
   * typescript arrays are 0-BASED, so the index mapping is stated explicitly.
   */
  private insertUsageInAscendingOrder(
    usage: PromotionRewardUsageDetail,
    orderItemID: string,
    discountQuantity: number,
    discountPerUseValue: Money,
  ): void {
    const orderItemsUsage = usage.orderItemsUsage;

    // [model/service/PromotionService.cfc:L304] the scan. `index` is the 0-based counterpart of
    // the legacy 1-based `oiu`; see the index-mapping note above.
    for (const [index, existingUsage] of orderItemsUsage.entries()) {
      // [model/service/PromotionService.cfc:L306] STRICTLY greater, expressed on the closed
      // `Money` surface: `isGreaterThan` is the comparison the value object publishes, and there
      // is no `min`.
      if (existingUsage.discountPerUseValue.isGreaterThan(discountPerUseValue)) {
        // [model/service/PromotionService.cfc:L309-L313] `arrayInsertAt(..., oiu, {...})`.
        orderItemsUsage.splice(index, 0, {
          orderItemID,
          discountQuantity,
          discountPerUseValue,
        });

        // [model/service/PromotionService.cfc:L315-L316] `usageAdded = true; break;` - insert at
        // the FIRST strictly greater position, then stop, and skip the append.
        return;
      }
    }

    // [model/service/PromotionService.cfc:L320-L329] `if(!usageAdded)` -
    // `arrayAppend(..., {...})`.
    orderItemsUsage.push({
      orderItemID,
      discountQuantity,
      discountPerUseValue,
    });
  }
}
