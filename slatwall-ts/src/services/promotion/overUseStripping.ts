// slatwall-ts - Promotion over-use stripping: use-limit enforcement, reproduced.
//
// PORTED from the post-pass over-use stripping loop
// [model/service/PromotionService.cfc:L467-L521], inline code inside
// `updateOrderAmountsWithPromotions()` [model/service/PromotionService.cfc:L58-L546].
//
// `PriceGroupService.updateOrderAmountsWithPriceGroups()`
// [model/service/PriceGroupService.cfc:L364-L375] must run before
// `updateOrderAmountsWithPromotions()`, because [model/service/PromotionService.cfc:L241] chooses
// the discount base price by price-group eligibility.

// The defect this module owns: numbered register entry 9, reproduced rather than repaired.
//
// AAP 0.6.1 Vector 3 states of this exact block that it "must be ported as written, because the
// prompt's must-preserve directive covers promotion discount math and use-limit enforcement.

// LEGACY-NOTE [model/service/PromotionService.cfc:L529]: the application pass needs both of its
// conditions precisely because of this module.
//
// JUDGMENT CALL: `src/lib/cfml/precision.ts` is not imported, even though it is a permitted
// dependency and L486 is one of the nine `precisionEvaluate` sites.

import type {
  OrderItemQualifiedDiscounts,
  QualifiedDiscount,
} from '../../domain/promotionEngine/qualifiedDiscountTypes.js';
import type {
  PromotionRewardUsageDetail,
  PromotionRewardUsageDetails,
} from '../../domain/promotionEngine/rewardUsageTypes.js';
import type { Money } from '../../domain/valueObjects/money.js';
import { cfEquals, structGet } from '../../lib/cfml/struct.js';

// What this does not change: a genuinely absent key still raises from both resolvers below -
// folding case does not invent an entry.

/**
 * One accumulator entry located by a descending scan, paired with the array index it was found at.
 *
 * Module-local and unexported: it exists so the two branches of
 * [model/service/PromotionService.cfc:L479] can share a single search while acting differently on
 * the result.
 */
interface MatchedQualifiedDiscount {
  readonly index: number;
  readonly discount: QualifiedDiscount;
}
// CFML parity [model/service/PromotionService.cfc:L472, L475, L476, L477]: CFML raises when a
// struct is indexed by an absent key and a member is then read from the result, so an absent key
// raises here too rather than resolving to a default.
function resolveLedgerEntry(
  promotionRewardUsageDetails: PromotionRewardUsageDetails,
  promotionRewardID: string,
): PromotionRewardUsageDetail {
  const usageDetail: PromotionRewardUsageDetail | undefined = structGet(
    promotionRewardUsageDetails,
    promotionRewardID,
  );

  if (usageDetail === undefined) {
    throw new Error(
      `The reward-usage ledger has no entry for promotionRewardID '${promotionRewardID}'. ` +
        'This reproduces the legacy runtime failure at ' +
        'model/service/PromotionService.cfc:L472, L475, L476 and L477, where the LEAKED `reward` ' +
        'variable indexes promotionRewardUsageDetails with no structKeyExists guard. The entry ' +
        'is seeded for every reward encountered at L172-L189, before the L197 qualification ' +
        'gate, so a miss here means the caller passed a reward ID that was never processed.',
    );
  }

  return usageDetail;
}

/**
 * Resolves one order item's bucket of qualified discounts, narrowing the indexed read that
 * `noUncheckedIndexedAccess` widens to `... | undefined`.
 */
// CFML parity [model/service/PromotionService.cfc:L482, L498]: the legacy applies `arrayLen()`
// directly to `orderItemQulifiedDiscounts[ orderItemID ]` with no `structKeyExists` guard, and
// CFML raises when that key is absent.
function resolveQualifiedDiscountsForOrderItem(
  orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
  orderItemID: string,
): QualifiedDiscount[] {
  // `structGet`, not a bracket read: the accumulator is a CFML struct and
  // `./promotionApplication.ts` already reads this same structure case-insensitively.
  const qualifiedDiscounts: QualifiedDiscount[] | undefined = structGet(
    orderItemQualifiedDiscounts,
    orderItemID,
  );

  if (qualifiedDiscounts === undefined) {
    throw new Error(
      `The qualified-discount accumulator has no bucket for orderItemID '${orderItemID}'. ` +
        'This reproduces the legacy runtime failure at ' +
        'model/service/PromotionService.cfc:L482 and L498, where the accumulator is indexed ' +
        "with an orderItemID taken from the ledger's orderItemsUsage rather than from the " +
        "accumulator's own key set, and no structKeyExists guard is performed - unlike L529, " +
        'which guards. Silently skipping would add control flow the source does not have.',
    );
  }

  return qualifiedDiscounts;
}

/**
 * Finds the HIGHEST-INDEXED accumulator entry belonging to `promotionRewardID`, or `undefined`
 * when the bucket holds none.
 */
// The `undefined` check inside the loop is a type narrowing, not a behavioural branch: `y` is
// always within `[0, length)` and both buckets are dense, so the element can never be absent.
function findLastRewardDiscount(
  qualifiedDiscounts: QualifiedDiscount[],
  promotionRewardID: string,
): MatchedQualifiedDiscount | undefined {
  for (let y = qualifiedDiscounts.length - 1; y >= 0; y -= 1) {
    const candidate: QualifiedDiscount | undefined = qualifiedDiscounts[y];

    if (candidate !== undefined && cfEquals(candidate.promotionRewardID, promotionRewardID)) {
      return { index: y, discount: candidate };
    }
  }

  return undefined;
}

/**
 * @param promotionRewardUsageDetails the reward-usage ledger, keyed by `promotionRewardID`.
 * @param orderItemQualifiedDiscounts the qualified-discount accumulator, keyed by opaque
 * `orderItemID`.
 * @param leakedLastProcessedRewardID the `promotionRewardID` of the LAST reward the L165-L465
 * iteration processed.
 * @returns nothing. The legacy block returns nothing and emits nothing; the surviving discounts
 * are read back out of the accumulator by the application pass.
 * @throws Error when the ledger has no entry for `leakedLastProcessedRewardID`, or when the
 * accumulator has no bucket for an `orderItemID` the ledger names.
 */
export function stripOverUsedRewardDiscounts(
  promotionRewardUsageDetails: PromotionRewardUsageDetails,
  orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
  leakedLastProcessedRewardID: string,
): void {
  // LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: the loop compares `[prID]` on both
  // sides at L471 but subtracts the leaked `reward`'s `maximumUsePerOrder` at L472 and iterates that
  // reward's `orderItemsUsage` at L475-L477. `reward` escaped the loop that closed at L465, so it
  // holds the last reward processed and per-order limits are enforced against it for every key in
  // the ledger. The effect is bidirectional: it can under-enforce a limit and it can inflate a
  // discount.
  // Preserved deliberately; do not fix without a product decision.
  // [model/service/PromotionService.cfc:L467-L468] Now that all the potential discounts for
  // orderItems are set up sorted by best price, strip out any discount that would exceed the
  // maximum order use counts.
  for (const [prID, prIDUsage] of Object.entries(promotionRewardUsageDetails)) {
    // [model/service/PromotionService.cfc:L470-L471] If this promotion reward was used more than
    // it should have been, start stripping out from the arrays in order.
    if (prIDUsage.usedInOrder > prIDUsage.maximumUsePerOrder) {
      // L472 mixes indices, and the mix is preserved exactly. The left operand is
      // `[prID].usedInOrder`; the right operand is `[leaked].maximumUsePerOrder`.
      const leakedUsage: PromotionRewardUsageDetail = resolveLedgerEntry(
        promotionRewardUsageDetails,
        leakedLastProcessedRewardID,
      );

      // Plain integer count, never `Money`. It can be negative (see the bidirectional chain above)
      // and it is neither clamped nor floored nor guarded.
      let needToRemove: number = prIDUsage.usedInOrder - leakedUsage.maximumUsePerOrder;

      // [model/service/PromotionService.cfc:L474-L475] "Loop over the items it was applied to an
      // remove the quantity necessary to meet the total needToRemoveQuantity" - the source
      // comment.
      for (const usageEntry of leakedUsage.orderItemsUsage) {
        // L476 and L477 both read from the LEAKED reward's usage record. Preserved.
        const orderItemID: string = usageEntry.orderItemID;
        const thisDiscountQuantity: number = usageEntry.discountQuantity;

        // Both L479 branches begin by resolving this same bucket, so it is resolved once here.
        const qualifiedDiscounts: QualifiedDiscount[] = resolveQualifiedDiscountsForOrderItem(
          orderItemQualifiedDiscounts,
          orderItemID,
        );

        // [model/service/PromotionService.cfc:L479] Strict `<`. When `needToRemove` is negative
        // this is TRUE for any positive quantity, which is how the inflation path reaches the
        // fractional branch.
        if (needToRemove < thisDiscountQuantity) {
          // [model/service/PromotionService.cfc:L481-L483] Descending scan for this reward's
          // entry.
          const match: MatchedQualifiedDiscount | undefined = findLastRewardDiscount(
            qualifiedDiscounts,
            prID,
          );

          if (match !== undefined) {
            // [model/service/PromotionService.cfc:L485-L486] Set the discountAmount as some
            // fraction of the original discountAmount.
            //
            // CFML parity [model/service/PromotionService.cfc:L486]: `precisionEvaluate` raises on
            // a zero divisor.
            const recomputedDiscountAmount: Money = match.discount.discountAmount
              .dividedBy(thisDiscountQuantity)
              .times(thisDiscountQuantity - needToRemove);

            match.discount.discountAmount = recomputedDiscountAmount;

            // [model/service/PromotionService.cfc:L488-L489] Update the needToRemove.
            needToRemove = 0;

            // [model/service/PromotionService.cfc:L491-L492] Break out of the item discount loop.
          }
        } else {
          // [model/service/PromotionService.cfc:L497-L499] Descending scan for this reward's
          // entry. L499's `== prID` is CORRECT and is preserved as written.
          const match: MatchedQualifiedDiscount | undefined = findLastRewardDiscount(
            qualifiedDiscounts,
            prID,
          );

          if (match !== undefined) {
            // [model/service/PromotionService.cfc:L501-L502] Remove from the array.
            qualifiedDiscounts.splice(match.index, 1);

            // [model/service/PromotionService.cfc:L504-L505] Update the needToRemove.
            needToRemove = needToRemove - thisDiscountQuantity;

            // [model/service/PromotionService.cfc:L507-L508] Break out of the item discount loop -
            // again expressed by the single-match scan.
          }
        }

        // [model/service/PromotionService.cfc:L513-L514] If we don't need to remove any more.
        //
        // CFML parity [model/service/PromotionService.cfc:L514]: the legacy test is an EQUALITY
        // test, `needToRemove == 0`, reproduced as strict `=== 0` rather than "improved" to
        // `<= 0`.
        if (needToRemove === 0) {
          break;
        }
      }
    }
    // [model/service/PromotionService.cfc:L519-L521] End of the promotion reward loop for removing
    // anything that was overused.
  }
}
