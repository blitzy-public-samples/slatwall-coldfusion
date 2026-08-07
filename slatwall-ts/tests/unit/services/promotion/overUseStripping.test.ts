// slatwall-ts - Characterization suite for `src/services/promotion/overUseStripping.ts`.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L169, L465, L472]: why a leaked variable exists
// at all, and why the target surfaces it instead of hiding it. `reward` is bound by the reward
// iteration at L169; that loop closes at L465.
//
// JUDGMENT CALL: `leakedLastProcessedRewardID` is not a signature widening and must not be counted
// as one.
//
// Three sanctioned divergences are register entries 13 and 12, both owned by
// `discountAmount.test.ts`, and entry 19 in `src/domain/entities/product.ts`.

import { beforeEach, describe, expect, it } from 'vitest';

import type {
  OrderItemQualifiedDiscounts,
  QualifiedDiscount,
} from '../../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import type {
  OrderItemUsage,
  PromotionRewardUsageDetail,
  PromotionRewardUsageDetails,
  UnlimitedUseSentinel,
} from '../../../../src/domain/promotionEngine/rewardUsageTypes.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { stripOverUsedRewardDiscounts } from '../../../../src/services/promotion/overUseStripping.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// CFML parity [model/service/PromotionService.cfc:L175, L176, L177]: the seed writes the literal
// `1000000` into all three use limits, and this constant names that literal without altering it -
// same digits, and no numeric separator.
const UNLIMITED_USE_SENTINEL: UnlimitedUseSentinel = 1000000;

/**
 * The `Promotion` an accumulator entry carries, derived from the published contract rather than
 * imported from the entity module.
 *
 * JUDGMENT CALL: an indexed access on the already-imported `QualifiedDiscount` instead of an
 * `import type { Promotion }`.
 */
type AccumulatorPromotion = QualifiedDiscount['promotion'];

/**
 * Builds one `OrderItemUsage` record: the three published members and nothing else.
 */
function makeUsage(
  orderItemID: string,
  discountQuantity: number,
  discountPerUseValue: string,
): OrderItemUsage {
  return {
    orderItemID,
    discountQuantity,
    discountPerUseValue: Money.fromDecimalString(discountPerUseValue),
  };
}

/**
 * CFML parity [model/service/PromotionService.cfc:L176, L177]: `maximumUsePerItem` and
 * `maximumUsePerQualification` keep the seeded sentinel in every case below.
 */
function makeLedgerEntry(
  usedInOrder: number,
  maximumUsePerOrder: number,
  orderItemsUsage: OrderItemUsage[],
): PromotionRewardUsageDetail {
  return {
    usedInOrder,
    maximumUsePerOrder,
    maximumUsePerItem: UNLIMITED_USE_SENTINEL,
    maximumUsePerQualification: UNLIMITED_USE_SENTINEL,
    orderItemsUsage,
  };
}

/**
 * Builds one qualified-discount accumulator entry: the three published members and nothing else.
 */
function makeDiscount(
  promotionRewardID: string,
  discountAmount: string,
  promotion: AccumulatorPromotion,
): QualifiedDiscount {
  return {
    promotionRewardID,
    promotion,
    discountAmount: Money.fromDecimalString(discountAmount),
  };
}

/**
 * Renders the accumulator's observable state as an explicit deep copy of plain strings.
 *
 * The subject returns `void` and mutates its inputs, so a before/after comparison is the clearest
 * proof of what it did and what it left alone.
 */
function describeAccumulator(accumulator: OrderItemQualifiedDiscounts): Record<string, string[]> {
  const described: Record<string, string[]> = {};

  for (const [orderItemID, bucket] of Object.entries(accumulator)) {
    described[orderItemID] = bucket.map(
      (discount) => `${discount.promotionRewardID}@${discount.discountAmount.toDecimalString()}`,
    );
  }

  return described;
}

/**
 * Resolves one accumulator bucket, narrowing the `... | undefined` that `noUncheckedIndexedAccess`
 * produces.
 *
 * Narrowed by an explicit throw rather than by a postfix `!` or a cast: a non-null assertion here
 * would turn a broken scenario into a confusing downstream failure.
 */
function bucketOf(
  accumulator: OrderItemQualifiedDiscounts,
  orderItemID: string,
): QualifiedDiscount[] {
  const bucket: QualifiedDiscount[] | undefined = accumulator[orderItemID];

  if (bucket === undefined) {
    throw new Error(`this test scenario built no accumulator bucket for '${orderItemID}'`);
  }

  return bucket;
}

/**
 * Resolves one accumulator record by index, narrowing the indexed read the same way.
 */
function recordAt(bucket: QualifiedDiscount[], index: number): QualifiedDiscount {
  const record: QualifiedDiscount | undefined = bucket[index];

  if (record === undefined) {
    throw new Error(`this test scenario expected an accumulator record at index ${index}`);
  }

  return record;
}
function ledgerEntryOf(
  ledger: PromotionRewardUsageDetails,
  promotionRewardID: string,
): PromotionRewardUsageDetail {
  const entry: PromotionRewardUsageDetail | undefined = ledger[promotionRewardID];

  if (entry === undefined) {
    throw new Error(`this test scenario built no ledger entry for '${promotionRewardID}'`);
  }

  return entry;
}

/**
 * Resolves one usage record by index, narrowing the indexed read the same way.
 */
function usageAt(entry: PromotionRewardUsageDetail, index: number): OrderItemUsage {
  const usage: OrderItemUsage | undefined = entry.orderItemsUsage[index];

  if (usage === undefined) {
    throw new Error(`this test scenario expected an orderItemsUsage record at index ${index}`);
  }

  return usage;
}

/**
 * The five members the published `PromotionRewardUsageDetail` contract declares, sorted.
 */
const LEDGER_ENTRY_MEMBERS: readonly string[] = [
  'maximumUsePerItem',
  'maximumUsePerOrder',
  'maximumUsePerQualification',
  'orderItemsUsage',
  'usedInOrder',
];

describe('stripOverUsedRewardDiscounts - the ported over-use correction loop', () => {
  let fixtures: ReturnType<typeof makePromotionFixtures>;

  beforeEach(() => {
    fixtures = makePromotionFixtures();
  });

  describe('the shipped surface, confirmed before anything is asserted about behaviour', () => {
    it('is a synchronous three-parameter function that returns nothing', () => {
      expect(stripOverUsedRewardDiscounts.length).toBe(3);

      // Returns `void`, exactly as the legacy block emits nothing. The surviving discounts are
      // read back out of the accumulator by the application pass at
      // [model/service/PromotionService.cfc:L524-L537].
      const returned: void = stripOverUsedRewardDiscounts({}, {}, fixtures.leakedRewardID);

      expect(returned).toBeUndefined();
    });

    it('does not resolve the leaked identifier at all when no ledger key over-uses', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L472]: the leaked lookup sits INSIDE the
      // L471 gate, so it is reached only when some key has actually over-used.
      // Preserved deliberately; do not fix without a product decision.
      const accumulator: OrderItemQualifiedDiscounts = {
        [fixtures.opaqueOrderReferences.orderItemID]: [
          makeDiscount(fixtures.overusedRewardID, '8.00', fixtures.promotion),
        ],
      };

      const before: Record<string, string[]> = describeAccumulator(accumulator);

      expect(() => {
        stripOverUsedRewardDiscounts({}, accumulator, 'no-such-reward-was-ever-processed');
      }).not.toThrow();

      expect(describeAccumulator(accumulator)).toStrictEqual(before);
    });

    it('drives its whole outcome from the third parameter, on byte-identical first two', () => {
      // The proof that the leaked parameter is load-bearing. Two runs over identically-built
      // inputs, differing only in the third argument, reach opposite outcomes.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const leakedID: string = fixtures.leakedRewardID;

      const buildLedger = (): PromotionRewardUsageDetails => ({
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(ids.orderItemID, 1, '1.00')]),
        [leakedID]: makeLedgerEntry(1, UNLIMITED_USE_SENTINEL, [
          makeUsage(ids.secondOrderItemID, 2, '2.00'),
        ]),
      });

      const buildAccumulator = (): OrderItemQualifiedDiscounts => ({
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
        [ids.secondOrderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      });

      // LEGACY-DEFECT [model/service/PromotionService.cfc:L472, L475, L476, L477]: with the LEAKED
      // identifier, needToRemove is 6 - 1000000 = -999994, the strict `<` at L479 sends control to
      // the fractional branch, and the SECOND order item - the leaked reward's item.
      // Preserved deliberately; do not fix without a product decision.
      const leakedRunAccumulator: OrderItemQualifiedDiscounts = buildAccumulator();

      stripOverUsedRewardDiscounts(buildLedger(), leakedRunAccumulator, leakedID);

      expect(describeAccumulator(leakedRunAccumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@8`],
        [ids.secondOrderItemID]: [`${examinedID}@3999984`],
      });

      // With the examined reward's own identifier, needToRemove is 6 - 5 = 1, which is not less
      // than that reward's own discount quantity of.
      const repairedShapeAccumulator: OrderItemQualifiedDiscounts = buildAccumulator();

      stripOverUsedRewardDiscounts(buildLedger(), repairedShapeAccumulator, examinedID);

      expect(describeAccumulator(repairedShapeAccumulator)).toStrictEqual({
        [ids.orderItemID]: [],
        [ids.secondOrderItemID]: [`${examinedID}@8`],
      });
    });
  });

  describe('the precondition without which every defect-9 case is vacuous', () => {
    it('offers two distinct reward identifiers and two distinct order items', () => {
      expect(fixtures.overusedRewardID).not.toBe(fixtures.leakedRewardID);
      expect(fixtures.opaqueOrderReferences.orderItemID).not.toBe(
        fixtures.opaqueOrderReferences.secondOrderItemID,
      );
    });

    it('has the two ledger exhibits recording usage against different order items', () => {
      const examinedUsage: OrderItemUsage = usageAt(fixtures.overusedRewardUsageDetail, 0);
      const leakedUsage: OrderItemUsage = usageAt(fixtures.leakedRewardUsageDetail, 0);

      expect(examinedUsage.orderItemID).toBe(fixtures.opaqueOrderReferences.orderItemID);
      expect(leakedUsage.orderItemID).toBe(fixtures.opaqueOrderReferences.secondOrderItemID);
      expect(examinedUsage.orderItemID).not.toBe(leakedUsage.orderItemID);

      // `toStrictEqual` rather than a member-by-member check, so an unexpected FOURTH member on
      // the published three-member `OrderItemUsage` contract would fail here.
      expect(leakedUsage).toStrictEqual({
        orderItemID: fixtures.opaqueOrderReferences.secondOrderItemID,
        discountQuantity: 1,
        discountPerUseValue: Money.fromDecimalString('3.75'),
      });
    });

    it('has the examined exhibit genuinely over its own per-order limit', () => {
      // The L471 gate is what admits a key to the stripping body at all, so the exhibit must
      // satisfy it on its own pair of numbers - not on the leaked reward's.
      expect(fixtures.overusedRewardUsageDetail.usedInOrder).toBeGreaterThan(
        fixtures.overusedRewardUsageDetail.maximumUsePerOrder,
      );
      expect(fixtures.leakedRewardUsageDetail.usedInOrder).not.toBeGreaterThan(
        fixtures.leakedRewardUsageDetail.maximumUsePerOrder,
      );
    });
  });

  // The exact index map, row by row.
  describe('L471 compares the iterated key against ITSELF, and that line is CORRECT', () => {
    it('does not admit a within-limit key just because the leaked limit is smaller', () => {
      // CFML parity [model/service/PromotionService.cfc:L471]: this line indexes by the loop key
      // and is correct. The mixed indices on L472 below are the defect; aligning L471 to L472 would
      // spread it rather than fix it.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(2, 5, [makeUsage(ids.orderItemID, 1, '1.00')]),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 1, [makeUsage(ids.orderItemID, 1, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      };

      const before: Record<string, string[]> = describeAccumulator(accumulator);

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      // Nothing strips. The leaked key's own gate, `1 > 1`, is false as well, so neither key
      // enters.
      expect(describeAccumulator(accumulator)).toStrictEqual(before);
      expect(recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount.toFixed2()).toBe(
        '8.00',
      );
    });

    it('admits a key that is over its OWN limit while the leaked reward is well within its own', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L471]: the LEFT operand is also the
      // iterated key's own `usedInOrder`, not the leaked reward's.
      // Preserved deliberately; do not fix without a product decision.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      // NeedToRemove = 6 - 5 = 1, which is less than the leaked usage quantity of 4, so L486
      // rewrites the amount as 8 / 4 x (4 - 1) = 2 x 3 =.
      const rewritten: Money = recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount;

      expect(rewritten.toFixed2()).toBe('6.00');
      expect(rewritten.equals(Money.fromDecimalString('8.00').dividedBy(4).times(3))).toBe(true);
    });
  });

  describe('L472 mixes the indices, and the mix changes the money', () => {
    it('subtracts the LEAKED limit, not the examined reward\u2019s own', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L472]: the minuend is
      // `[prID].usedInOrder` and the subtrahend is `[leaked].maximumUsePerOrder`.
      // Preserved deliberately; do not fix without a product decision.
      //
      // 16.00 is the tidier figure and it is not the specification.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(ids.orderItemID, 5, '4.00')]),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 2, [makeUsage(ids.orderItemID, 5, '4.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '20.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      const rewritten: Money = recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount;

      expect(rewritten.toFixed2()).toBe('4.00');
      expect(rewritten.equals(Money.fromDecimalString('20.00').dividedBy(5).times(1))).toBe(true);

      // The figure a repaired L472 would have produced, asserted as not the outcome so that a
      // silent repair fails here loudly instead of passing quietly.
      expect(rewritten.equals(Money.fromDecimalString('16.00'))).toBe(false);
    });
  });

  describe('L475, L476 and L477 all read the LEAKED reward\u2019s usage list', () => {
    it('takes the loop bound from the leaked list even when the examined list is empty', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L475]: `arrayLen(...)` is applied to the
      // leaked reward's `orderItemsUsage`.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Entry 1 item first, quantity 1 3 < 1 is false -> deletion, needToRemove = 3 - 1 = 2 entry
      // 2 item second, quantity 4 2 < 4 is true -> 20 / 4 x (4 - 2) = 5 x 2 = 10.00.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(8, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [
          makeUsage(ids.orderItemID, 1, '1.00'),
          makeUsage(ids.secondOrderItemID, 4, '2.00'),
        ]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '10.00', fixtures.promotion)],
        [ids.secondOrderItemID]: [makeDiscount(examinedID, '20.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [],
        [ids.secondOrderItemID]: [`${examinedID}@10`],
      });
    });

    it('strips the leaked reward\u2019s ITEM and leaves the examined reward\u2019s item alone', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L476]: `orderItemID` comes from the
      // leaked reward's usage record.
      // Preserved deliberately; do not fix without a product decision.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [
          makeUsage(ids.secondOrderItemID, 4, '1.00'),
        ]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
        [ids.secondOrderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@8`],
        [ids.secondOrderItemID]: [`${examinedID}@6`],
      });
    });

    it('divides by the leaked reward\u2019s QUANTITY, not the examined reward\u2019s', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L477]: `thisDiscountQuantity` comes from
      // the LEAKED reward's usage record too, and it appears three times in the L486 expression -
      // as the divisor, and twice in the factor.
      // Preserved deliberately; do not fix without a product decision.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(ids.orderItemID, 10, '1.00')]),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      const rewritten: Money = recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount;

      expect(rewritten.toFixed2()).toBe('6.00');
      expect(rewritten.equals(Money.fromDecimalString('7.20'))).toBe(false);
    });
  });

  describe('L483 and L499 match on the ITERATED key, and both lines are CORRECT', () => {
    it('rewrites only the examined reward\u2019s record, leaving the leaked reward\u2019s intact', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L483]: the fractional branch's inner
      // test is `.promotionRewardID == prID` - the ITERATED key, not the leaked identifier - and
      // that is CORRECT.
      // Preserved deliberately; do not fix without a product decision.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const leakedID: string = fixtures.leakedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [leakedID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      // Descending by discount amount, as the facade's insertion sort at
      // [model/service/PromotionService.cfc:L266-L294] leaves each bucket.
      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [
          makeDiscount(leakedID, '30.00', fixtures.promotion),
          makeDiscount(examinedID, '20.00', fixtures.promotion),
          makeDiscount('', '10.00', fixtures.promotion),
        ],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, leakedID);

      // NeedToRemove = 1, quantity 4, so 20 / 4 x (4 - 1) = 5 x 3 = 15. Length is still three: the
      // fractional branch rewrites, it never removes.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${leakedID}@30`, `${examinedID}@15`, '@10'],
      });
    });

    it('deletes only the examined reward\u2019s record, leaving the others in order', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L499]: the deletion branch's inner test
      // is `.promotionRewardID == prID` as well, and is likewise CORRECT. NeedToRemove = 9 - 5 = 4
      // is not less than the quantity of.
      // Preserved deliberately; do not fix without a product decision.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const leakedID: string = fixtures.leakedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(9, 5, []),
        [leakedID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [
          makeDiscount(leakedID, '30.00', fixtures.promotion),
          makeDiscount(examinedID, '20.00', fixtures.promotion),
          makeDiscount('', '10.00', fixtures.promotion),
        ],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, leakedID);

      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${leakedID}@30`, '@10'],
      });
    });
  });

  // The bidirectional money effect.
  //
  // [model/service/PromotionService.cfc:L471] passes on the examined key's own numbers.
  //
  // Both directions are covered below, in separate cases, because a suite that pinned only the
  // shrink direction would leave the inflation free to be introduced or removed unnoticed.
  describe('the money moves in BOTH directions', () => {
    it('SHRINKS the discount when needToRemove comes out positive', () => {
      // The direction the algorithm nominally intends.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 3, '4.00')]),
      };

      const original: Money = Money.fromDecimalString('12.00');
      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '12.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      const rewritten: Money = recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount;

      expect(rewritten.toFixed2()).toBe('8.00');
      expect(rewritten.isLessThan(original)).toBe(true);
      expect(rewritten.compare(original)).toBe(-1);
    });

    it('INFLATES the discount beyond what any reward granted when needToRemove goes negative', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L472, L479, L486]: the leaked reward is
      // unconfigured, so its limit is still the seeded 1000000 and needToRemove comes out as 6 -
      // 1000000 = -999994.
      // Preserved deliberately; do not fix without a product decision.
      //
      // A discount of 4,999,980 on an item nobody discounted by more than.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, UNLIMITED_USE_SENTINEL, [
          makeUsage(ids.orderItemID, 2, '5.00'),
        ]),
      };

      const original: Money = Money.fromDecimalString('10.00');
      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '10.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      const rewritten: Money = recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount;

      expect(rewritten.toDecimalString()).toBe('4999980');
      expect(rewritten.equals(original.dividedBy(2).times(999996))).toBe(true);
      expect(rewritten.isGreaterThan(original)).toBe(true);
      expect(rewritten.compare(original)).toBe(1);
    });

    it('touches exactly ONE order item per over-using key, then stops for that key', () => {
      // The blast radius, asserted as a correctness statement about SCOPE.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, UNLIMITED_USE_SENTINEL, [
          makeUsage(ids.orderItemID, 2, '5.00'),
          makeUsage(ids.secondOrderItemID, 2, '5.00'),
        ]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '10.00', fixtures.promotion)],
        [ids.secondOrderItemID]: [makeDiscount(examinedID, '10.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@4999980`],
        [ids.secondOrderItemID]: [`${examinedID}@10`],
      });
    });
  });

  describe('the 1000000 sentinel interlock', () => {
    it('is the literal one million, written without a numeric separator', () => {
      // CFML parity [model/service/PromotionService.cfc:L175, L176, L177]: the seed writes exactly
      // this literal, and the published `UnlimitedUseSentinel` alias names it as a TYPE rather
      // than as a runtime constant so the domain layer emits no JavaScript for it.
      expect(fixtures.unlimitedUseSentinel).toBe(1000000);
      expect(UNLIMITED_USE_SENTINEL).toBe(fixtures.unlimitedUseSentinel);
    });

    it('makes the L486 factor approximately one million divided by the quantity', () => {
      // CFML parity [model/service/PromotionService.cfc:L486]: with the leaked reward
      // unconfigured, needToRemove is 2 - 1000000 = -999998 and the factor becomes (4 - (-999998))
      // / 4 = 1000002 / 4 - which is the sentinel divided by the quantity.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(2, 1, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, UNLIMITED_USE_SENTINEL, [
          makeUsage(ids.orderItemID, 4, '3.00'),
        ]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '12.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      const rewritten: Money = recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount;

      expect(rewritten.toDecimalString()).toBe('3000006');
      expect(rewritten.equals(Money.fromDecimalString('12.00').dividedBy(4).times(1000002))).toBe(
        true,
      );
    });

    it('rewrites discountAmount IN PLACE, keeping the record and the bucket identical', () => {
      // CFML parity [model/service/PromotionService.cfc:L486]: the source assigns back into
      // `orderItemQulifiedDiscounts[ orderItemID ][y].discountAmount`, so the element's identity,
      // its position and its sibling members all survive.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '2.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '10.00', fixtures.promotion)],
      };

      const bucketBefore: QualifiedDiscount[] = bucketOf(accumulator, ids.orderItemID);
      const recordBefore: QualifiedDiscount = recordAt(bucketBefore, 0);
      const amountBefore: Money = recordBefore.discountAmount;
      const promotionBefore: AccumulatorPromotion = recordBefore.promotion;

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(bucketOf(accumulator, ids.orderItemID)).toBe(bucketBefore);
      expect(recordAt(bucketBefore, 0)).toBe(recordBefore);
      expect(bucketBefore).toHaveLength(1);
      expect(recordBefore.promotion).toBe(promotionBefore);
      expect(recordBefore.promotionRewardID).toBe(examinedID);

      // 10 / 4 x (4 - 1) = 2.5 x 3 = 7.5. A new value object in the field, the old one unchanged.
      expect(recordBefore.discountAmount).not.toBe(amountBefore);
      expect(recordBefore.discountAmount.toFixed2()).toBe('7.50');
      expect(amountBefore.toFixed2()).toBe('10.00');

      // Exactly the three published members, so an extra key smuggled in by the rewrite would
      // fail.
      expect(Object.keys(recordBefore).sort()).toStrictEqual([
        'discountAmount',
        'promotion',
        'promotionRewardID',
      ]);
    });

    it('lets the unguarded division at L486 refuse a zero quantity rather than absorbing it', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L486]: the divisor is the leaked reward's
      // `discountQuantity` and there is no zero check on it - this is the L486 member of the
      // four-division set recorded at the top of this file.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, UNLIMITED_USE_SENTINEL, [
          makeUsage(ids.orderItemID, 0, '0.00'),
        ]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '10.00', fixtures.promotion)],
      };

      expect(() => {
        stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);
      }).toThrow(/zero divisor/);

      // The refusal happens before the assignment, so the stored amount is exactly as it was.
      expect(recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount.toFixed2()).toBe(
        '10.00',
      );
    });

    it('reads the ledger without writing to it', () => {
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const leakedID: string = fixtures.leakedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(ids.orderItemID, 7, '1.00')]),
        [leakedID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '2.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '10.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, leakedID);

      const examinedEntry: PromotionRewardUsageDetail = ledgerEntryOf(ledger, examinedID);
      const leakedEntry: PromotionRewardUsageDetail = ledgerEntryOf(ledger, leakedID);

      expect(examinedEntry.usedInOrder).toBe(6);
      expect(examinedEntry.maximumUsePerOrder).toBe(5);
      expect(examinedEntry.orderItemsUsage).toHaveLength(1);
      expect(usageAt(examinedEntry, 0)).toStrictEqual({
        orderItemID: ids.orderItemID,
        discountQuantity: 7,
        discountPerUseValue: Money.fromDecimalString('1.00'),
      });

      expect(leakedEntry.usedInOrder).toBe(1);
      expect(leakedEntry.maximumUsePerOrder).toBe(5);
      expect(leakedEntry.orderItemsUsage).toHaveLength(1);

      // The accumulator, by contrast, did change: 10 / 4 x (4 - 1) = 7.50.
      expect(recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount.toFixed2()).toBe(
        '7.50',
      );
    });
  });

  describe('the no-match outcome, which proves the leaked list chooses the items', () => {
    it('strips nothing when the leaked reward\u2019s items hold no record for the iterated key', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L475, L483]: the items visited come from
      // the LEAKED reward while the record matched inside each of them must belong to the ITERATED
      // key.
      // Preserved deliberately; do not fix without a product decision.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const leakedID: string = fixtures.leakedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [leakedID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(leakedID, '5.00', fixtures.promotion)],
      };

      const before: Record<string, string[]> = describeAccumulator(accumulator);

      stripOverUsedRewardDiscounts(ledger, accumulator, leakedID);

      expect(describeAccumulator(accumulator)).toStrictEqual(before);
      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${leakedID}@5`],
      });
    });
  });

  describe('L482 and L498 scan DOWNWARD, so the SMALLEST matching discount is reached first', () => {
    it('rewrites the smallest of three matching discounts in the fractional branch', () => {
      // CFML parity [model/service/PromotionService.cfc:L482]: the scan is
      // `for(var y=arrayLen(...); y>=1; y--)` and it breaks on its first match.
      //
      // Three matching records of distinct amounts, so the choice is unambiguous: 30, 20 and 10
      // all belong to the examined reward, and 10 is the one rewritten to 10 / 4 x (4 - 1) = 7.50.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [
          makeDiscount(examinedID, '30.00', fixtures.promotion),
          makeDiscount(examinedID, '20.00', fixtures.promotion),
          makeDiscount(examinedID, '10.00', fixtures.promotion),
        ],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@30`, `${examinedID}@20`, `${examinedID}@7.5`],
      });
    });

    it('deletes the smallest of three matching discounts in the deletion branch', () => {
      // CFML parity [model/service/PromotionService.cfc:L498]: the second scan runs downward too,
      // so the deletion also lands on the smallest matching discount - here the 10.00 - and the
      // two larger records survive with their identities and their relative order intact.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(9, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [
          makeDiscount(examinedID, '30.00', fixtures.promotion),
          makeDiscount(examinedID, '20.00', fixtures.promotion),
          makeDiscount(examinedID, '10.00', fixtures.promotion),
        ],
      };

      const bucket: QualifiedDiscount[] = bucketOf(accumulator, ids.orderItemID);
      const largest: QualifiedDiscount = recordAt(bucket, 0);
      const middle: QualifiedDiscount = recordAt(bucket, 1);

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      // CFML parity [model/service/PromotionService.cfc:L502]: `arrayDeleteAt(records, y)` becomes
      // a single-element removal at the matched index.
      expect(bucket).toHaveLength(2);
      expect(recordAt(bucket, 0)).toBe(largest);
      expect(recordAt(bucket, 1)).toBe(middle);
      expect(recordAt(bucket, 0).discountAmount.toFixed2()).toBe('30.00');
      expect(recordAt(bucket, 1).discountAmount.toFixed2()).toBe('20.00');
    });

    // The reverse direction is proven by the two behavioural cases above - the smallest matching
    // discount is the one rewritten and the one deleted - rather than by asserting a boolean the
    // fixture module authored.
  });

  describe('the accumulator lookups are UNGUARDED here, unlike the application pass at L529', () => {
    it('refuses an order item the accumulator has no bucket for', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L482, L498 versus L529]: the two scans
      // here apply `arrayLen()` straight to `orderItemQulifiedDiscounts[ orderItemID ]` with no
      // `structKeyExists` guard, and the identifier they index with came from the LEDGER rather
      // than from the accumulator's own key set.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [
          makeUsage(ids.secondOrderItemID, 4, '1.00'),
        ]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      };

      expect(() => {
        stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);
      }).toThrow(/accumulator has no bucket/);
    });

    it('refuses a leaked identifier the ledger has no entry for, once a key over-uses', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L472]: the leaked lookup is unguarded too.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      };

      expect(() => {
        stripOverUsedRewardDiscounts(ledger, accumulator, 'a-reward-absent-from-the-ledger');
      }).toThrow(/ledger has no entry/);
    });

    it('★ RESOLVES AN ACCUMULATOR KEY THAT DIFFERS ONLY IN CASE, as a CFML struct does', () => {
      // The unguarded-lookup contract above is untouched: a GENUINELY absent key still raises,
      // which the two cases either side of this one assert.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const lowerCasedItemID = ids.orderItemID.toLowerCase();
      const upperCasedItemID = ids.orderItemID.toUpperCase();

      // The two spellings must genuinely differ, or the case would prove nothing.
      expect(lowerCasedItemID).not.toBe(upperCasedItemID);

      const ledger: PromotionRewardUsageDetails = {
        // Over its per-order limit by one, and the usage names the LOWER-cased spelling.
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(lowerCasedItemID, 4, '1.00')]),
      };

      // The accumulator stores the UPPER-cased spelling of the same identifier.
      const accumulator: OrderItemQualifiedDiscounts = {
        [upperCasedItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      };

      expect(() => {
        stripOverUsedRewardDiscounts(ledger, accumulator, examinedID);
      }).not.toThrow();

      // The bucket was found and the discount was rewritten in place - the stripping actually
      // happened rather than being skipped - and no second key was created under either spelling.
      expect(Object.keys(accumulator)).toStrictEqual([upperCasedItemID]);

      const described = describeAccumulator(accumulator);
      const bucket = described[upperCasedItemID];

      expect(bucket).toBeDefined();
      expect(bucket).not.toStrictEqual([`${examinedID}@8.00`]);
    });

    it('★ MATCHES A CANDIDATE REWARD IDENTIFIER THAT DIFFERS ONLY IN CASE', () => {
      // CFML parity [model/service/PromotionService.cfc:L483, L499]: both scans compare with CFML
      // `==`, which is case-insensitive on strings.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      // The accumulator record carries the same reward identifier in a different case.
      const differentlyCasedRewardID = examinedID.toUpperCase();

      expect(differentlyCasedRewardID).not.toBe(examinedID);

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(differentlyCasedRewardID, '8.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, examinedID);

      // Matched, and therefore stripped: the amount is no longer the 8.00 it was granted at.
      expect(describeAccumulator(accumulator)).not.toStrictEqual({
        [ids.orderItemID]: [`${differentlyCasedRewardID}@8.00`],
      });
    });

    it('leaves a sale-price record alone even though the comparison now folds case', () => {
      // The empty-string `promotionRewardID` a sale-price seed carries
      // [model/service/PromotionService.cfc:L156] matches no real reward identifier under
      // `cfEquals` any more than it did under `===`.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount('', '45.00', fixtures.promotion)],
      };

      const before: Record<string, string[]> = describeAccumulator(accumulator);

      stripOverUsedRewardDiscounts(ledger, accumulator, examinedID);

      expect(describeAccumulator(accumulator)).toStrictEqual(before);
    });

    it('completes silently on the same absent identifier when no key over-uses', () => {
      // The other half of the same statement: the raise above is a property of the LOOKUP'S
      // POSITION, not of the identifier being absent.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(2, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      };

      const before: Record<string, string[]> = describeAccumulator(accumulator);

      expect(() => {
        stripOverUsedRewardDiscounts(ledger, accumulator, 'a-reward-absent-from-the-ledger');
      }).not.toThrow();

      expect(describeAccumulator(accumulator)).toStrictEqual(before);
    });
  });

  describe('the removal arithmetic at L489, L502, L505 and L514', () => {
    it('leaves an EMPTY ARRAY under an EXISTING key when the last record goes', () => {
      // CFML parity [model/service/PromotionService.cfc:L502]: the deletion removes an element
      // from the bucket; it never removes the bucket. So a bucket that held one record ends as an
      // empty array under a key that still exists.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(9, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '20.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(Object.hasOwn(accumulator, ids.orderItemID)).toBe(true);
      expect(bucketOf(accumulator, ids.orderItemID)).toStrictEqual([]);
      expect(Object.keys(accumulator)).toStrictEqual([ids.orderItemID]);
    });

    it('subtracts quantities as PLAIN INTEGERS across successive deletions until exactly zero', () => {
      // CFML parity [model/service/PromotionService.cfc:L505]:
      // `needToRemove - thisDiscountQuantity` subtracts a count from a count.
      //
      // Two deletions and no fractional rewrite, which is only possible if the counter stepped 3,
      // 2, 0 exactly.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(8, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [
          makeUsage(ids.orderItemID, 1, '1.00'),
          makeUsage(ids.secondOrderItemID, 2, '2.00'),
        ]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '4.00', fixtures.promotion)],
        [ids.secondOrderItemID]: [makeDiscount(examinedID, '6.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [],
        [ids.secondOrderItemID]: [],
      });
    });

    it('tests needToRemove for EXACTLY zero, so a negative counter does not stop the loop', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L514]: the test is `needToRemove == 0`,
      // reproduced as a strict `=== 0` and never relaxed to `<= 0`. The difference is behavioural
      // and this case is where it shows.
      // Preserved deliberately; do not fix without a product decision.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const leakedID: string = fixtures.leakedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [leakedID]: makeLedgerEntry(1, UNLIMITED_USE_SENTINEL, [
          makeUsage(ids.orderItemID, 2, '5.00'),
          makeUsage(ids.secondOrderItemID, 2, '5.00'),
        ]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(leakedID, '9.00', fixtures.promotion)],
        [ids.secondOrderItemID]: [makeDiscount(examinedID, '10.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, leakedID);

      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${leakedID}@9`],
        [ids.secondOrderItemID]: [`${examinedID}@4999980`],
      });
    });
  });

  describe('ITEM-LEVEL ONLY - order and fulfillment discounts are structurally immune', () => {
    it('leaves order-level and fulfillment-level discounts untouched', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L324-L467]: a real, exploitable
      // use-limit gap, measured rather than inferred.
      // Preserved deliberately; do not fix without a product decision.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(6, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
        [ids.orderFulfillmentID]: [makeDiscount(examinedID, '40.00', fixtures.promotion)],
        [ids.orderID]: [makeDiscount(examinedID, '80.00', fixtures.promotion)],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@6`],
        [ids.orderFulfillmentID]: [`${examinedID}@40`],
        [ids.orderID]: [`${examinedID}@80`],
      });
    });

    it('has no order-level or fulfillment-level member on any ledger entry', () => {
      // The structural root of the immunity above.
      const entries: PromotionRewardUsageDetail[] = Object.values(fixtures.rewardUsageDetails);

      expect(entries.length).toBeGreaterThan(1);

      for (const entry of entries) {
        expect(Object.keys(entry).sort()).toStrictEqual(LEDGER_ENTRY_MEMBERS);
      }
    });
  });

  describe('sale-price entries carry an empty reward identifier and can never be stripped', () => {
    it('leaves a sale-price record beside a stripped record completely alone', () => {
      // CFML parity [model/service/PromotionService.cfc:L156]: the sale-price seeding pass appends
      // accumulator entries whose `promotionRewardID` is the EMPTY STRING and creates no ledger
      // entry at all.
      //
      // The empty string is load-bearing and must never be replaced by `undefined`, `null`.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(9, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [
          makeDiscount('', '50.00', fixtures.promotion),
          makeDiscount(examinedID, '20.00', fixtures.promotion),
        ],
      };

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      // NeedToRemove = 4, quantity 4, so the deletion branch removes the examined reward's record
      // and the sale-price record survives at its full amount, in its original position.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: ['@50'],
      });
    });

    it('strips nothing at all from a bucket holding only sale-price records', () => {
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;

      const ledger: PromotionRewardUsageDetails = {
        [examinedID]: makeLedgerEntry(9, 5, []),
        [fixtures.leakedRewardID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      };

      const accumulator: OrderItemQualifiedDiscounts = {
        [ids.orderItemID]: [makeDiscount('', '50.00', fixtures.promotion)],
      };

      const before: Record<string, string[]> = describeAccumulator(accumulator);
      expect(Object.keys(ledger)).not.toContain('');
      expect(Object.keys(fixtures.rewardUsageDetails)).not.toContain('');

      stripOverUsedRewardDiscounts(ledger, accumulator, fixtures.leakedRewardID);

      expect(describeAccumulator(accumulator)).toStrictEqual(before);
    });
  });

  describe('per-case isolation and independence from the ledger\u2019s key order', () => {
    it('reaches the same outcome whichever order the ledger keys were inserted in', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L468]: CFML struct key order is
      // implementation-dependent and `PromotionDAO.getActivePromotionRewards()`
      // [model/dao/PromotionDAO.cfc:L51-L132] carries no `ORDER BY`.
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const leakedID: string = fixtures.leakedRewardID;

      const examinedEntry = (): PromotionRewardUsageDetail => makeLedgerEntry(6, 5, []);
      const leakedEntry = (): PromotionRewardUsageDetail =>
        makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]);
      const buildAccumulator = (): OrderItemQualifiedDiscounts => ({
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      });

      const examinedFirst: PromotionRewardUsageDetails = {
        [examinedID]: examinedEntry(),
        [leakedID]: leakedEntry(),
      };
      const leakedFirst: PromotionRewardUsageDetails = {
        [leakedID]: leakedEntry(),
        [examinedID]: examinedEntry(),
      };
      expect(Object.keys(examinedFirst)).not.toStrictEqual(Object.keys(leakedFirst));

      const examinedFirstAccumulator: OrderItemQualifiedDiscounts = buildAccumulator();
      const leakedFirstAccumulator: OrderItemQualifiedDiscounts = buildAccumulator();

      stripOverUsedRewardDiscounts(examinedFirst, examinedFirstAccumulator, leakedID);
      stripOverUsedRewardDiscounts(leakedFirst, leakedFirstAccumulator, leakedID);

      expect(describeAccumulator(leakedFirstAccumulator)).toStrictEqual(
        describeAccumulator(examinedFirstAccumulator),
      );
      expect(describeAccumulator(examinedFirstAccumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@6`],
      });
    });

    it('leaves a second, independently built pair of inputs entirely alone', () => {
      const ids = fixtures.opaqueOrderReferences;
      const examinedID: string = fixtures.overusedRewardID;
      const leakedID: string = fixtures.leakedRewardID;

      const buildLedger = (): PromotionRewardUsageDetails => ({
        [examinedID]: makeLedgerEntry(6, 5, []),
        [leakedID]: makeLedgerEntry(1, 5, [makeUsage(ids.orderItemID, 4, '1.00')]),
      });
      const buildAccumulator = (): OrderItemQualifiedDiscounts => ({
        [ids.orderItemID]: [makeDiscount(examinedID, '8.00', fixtures.promotion)],
      });

      const firstAccumulator: OrderItemQualifiedDiscounts = buildAccumulator();
      const secondAccumulator: OrderItemQualifiedDiscounts = buildAccumulator();
      const untouched: Record<string, string[]> = describeAccumulator(secondAccumulator);

      stripOverUsedRewardDiscounts(buildLedger(), firstAccumulator, leakedID);

      expect(describeAccumulator(firstAccumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@6`],
      });
      expect(describeAccumulator(secondAccumulator)).toStrictEqual(untouched);
      expect(describeAccumulator(secondAccumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@8`],
      });
      expect(bucketOf(secondAccumulator, ids.orderItemID)).not.toBe(
        bucketOf(firstAccumulator, ids.orderItemID),
      );
    });

    it('receives a freshly built fixture graph for every case', () => {
      const anotherGraph: ReturnType<typeof makePromotionFixtures> = makePromotionFixtures();

      expect(anotherGraph).not.toBe(fixtures);
      expect(anotherGraph.rewardUsageDetails).not.toBe(fixtures.rewardUsageDetails);
      expect(anotherGraph.overusedRewardUsageDetail).not.toBe(fixtures.overusedRewardUsageDetail);
      expect(anotherGraph.overusedRewardID).toBe(fixtures.overusedRewardID);
    });
  });
});
