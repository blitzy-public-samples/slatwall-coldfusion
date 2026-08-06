// slatwall-ts - Characterization suite for `src/services/promotion/overUseStripping.ts`.
//
// SUBJECT: the ported over-use correction loop, [model/service/PromotionService.cfc:L467-L521].
// This suite OWNS numbered defect register entry 9 and order-dependence vector 3, and it is the
// sharpest single example in the migration of why this port is not a cleanup exercise: the legacy
// loop enforces maximum-use-per-order against the WRONG ledger key, and repairing it changes the
// amount a customer is charged.
//
// ★ THE GOVERNING SENTENCE FOR EVERY ASSERTION BELOW. Must-preserve area (i) is promotion discount
// math TOGETHER WITH USE-LIMIT ENFORCEMENT, and this loop IS the use-limit enforcement. Therefore:
// A TEST THAT EXPECTS CORRECTED USE-LIMIT ENFORCEMENT IS ITSELF WRONG. Where an assertion below
// pins an answer that looks arithmetically absurd, the absurd answer is the specification, and the
// comment beside it names the tidier figure a "fix" would have produced so a reviewer can see that
// the difference was measured rather than overlooked.
//
// NET-NEW COVERAGE - NOT PARITY WITH ANY LEGACY TEST. There is no legacy antecedent for this
// suite and none is implied. `meta/tests/unit/service/` holds only `AccountServiceTest.cfc`,
// `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc`; a
// case-insensitive search of `meta/tests/` for "promotion" returns ZERO files. The only two
// legacy-extended suites in the whole project are `tests/unit/domain/entities/brand.test.ts` and
// `tests/unit/domain/entities/product.test.ts`, which carry forward `defaults_are_correct()` and
// `productUrlIsCorrectlyFormatted()` respectively. Nothing here is presented as carried forward.
//
// PARAMETERIZED SQL - NOT APPLICABLE, AND HERE IS WHY. The subject is a pure in-memory correction
// pass over two plain structures: it opens no connection, issues no statement and binds no
// placeholder, and the module it tests imports no driver. Every SQL-shape and placeholder-binding
// assertion in this project therefore lives in `tests/integration/repositories/`, which is the one
// tier that owns a statement's text and its bound values. Asserting SQL here would assert it in a
// place that cannot observe it.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L169, L465, L472]: WHY A LEAKED VARIABLE EXISTS
// AT ALL, and why the target surfaces it instead of hiding it. `reward` is bound by the reward
// iteration at L169; that loop CLOSES AT L465. The stripping block opens at L468 and reads
// `reward.getPromotionRewardID()` four times, at L472, L475, L476 and L477 - after the loop that
// owned the variable has ended. CFML's function-level scope leaves the binding alive holding the
// LAST reward processed, so the block silently measures every ledger key against that one reward.
// TypeScript has no such shared mutable scope, so the shipped module accepts the identifier as an
// explicit third parameter named to advertise exactly what it is.
//
// JUDGMENT CALL: `leakedLastProcessedRewardID` IS NOT A SIGNATURE WIDENING and must not be counted
// as one. The project's single sanctioned signature widening is already spent on
// `isCurrent(now?: Date)` in `src/domain/entities/promotionPeriod.ts`, and none remains. This
// parameter does not widen a ported signature, because there is no ported signature to widen:
// L467-L521 is inline code inside `updateOrderAmountsWithPromotions()` and has no name, no
// parameter list and no return type of its own. The parameter is the explicit re-expression of a
// CFML scope leak inside a module whose shape is not parity-constrained. The four budget ledgers
// are untouched by this file: ZERO signature reshapings, ZERO visibility widenings, ZERO signature
// widenings, ZERO deliberate divergences.
//
// ★ DEFECT 9 IS PRESERVED, NOT FIXED, AND PRESERVING IT SPENDS NO DIVERGENCE BUDGET. The project's
// three sanctioned divergences are register entries 13 and 12, both owned by
// `discountAmount.test.ts`, and entry 19 in `src/domain/entities/product.ts`. Entry 9 is not among
// them and no fourth divergence is permitted anywhere.
//
// C4 - INTERFACE PARITY, AND WHY IT DOES NOT BIND THE NAME UNDER TEST. Public method names are
// carried over verbatim in CFML camelCase wherever a named CFML method was ported. No such name
// appears in this file: the subject is an inline fragment, so `stripOverUsedRewardDiscounts` is a
// TypeScript name that displaces no legacy identifier and is not parity-constrained. It is used
// here exactly as the shipped module spells it, and this suite adapts to that module rather than
// the other way round.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L299, L486, L743, L831]: THE FOUR UNGUARDED
// DIVISIONS, AND AN OMISSION IN THE PLAN. The transformation plan names the unguarded division at
// L299 and stops there. Reading the slice finds FOUR, and none of them may be guarded: L299 in the
// usage ledger, L486 in THIS module, L743 in qualifier qualification and L831 in promotion-period
// qualification. Where the plan and the source disagree, the SOURCE WINS - so L486 is treated as a
// real unguarded division that the plan simply does not mention. Ownership is split so no two
// suites assert the same divisor twice: L486 belongs here, L299 to `rewardUsageLedger.test.ts`,
// L743 to `qualifierQualification.test.ts` and L831 to `promotionPeriodQualification.test.ts`.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L468]: THE LEDGER'S KEY ORDER IS UNSPECIFIED AT
// BOTH ENDS OF THE PORT, so this suite neither sorts the keys nor asserts an order over them. L468
// walks a plain CFML struct, whose key order is implementation-dependent, and the ledger was filled
// in whatever order `PromotionDAO.getActivePromotionRewards()`
// [model/dao/PromotionDAO.cfc:L51-L132] returned rewards - itself unspecified, because that query
// carries no `ORDER BY`. Every case below is therefore designed so its outcome cannot depend on key
// order: exactly one ledger key ever satisfies the L471 gate, and one case proves the point
// directly by running the same values under two different insertion orders.
//
// (Two orders that ARE specified, and are deliberately not re-asserted here: `orderItemsUsage` is
// ascending by `discountPerUseValue`, owned by `rewardUsageLedger.test.ts`; and each accumulator
// bucket is descending by discount amount, owned by the facade's insertion sort at
// [model/service/PromotionService.cfc:L266-L294]. This suite consumes the descending order as a
// precondition and asserts only what the descending SCAN does with it.)

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
// same digits, and NO numeric separator, so the value greps identically in the target and in the
// source. Its type comes from the published `UnlimitedUseSentinel` alias rather than being
// re-declared, and the first case in the sentinel block below proves the two agree.
//
// ★ WHY THE LITERAL, AND NOT SOMETHING TIDIER. The sentinel does ARITHMETIC rather than merely
// being compared: L472 subtracts it, and L486 then divides and multiplies by the result. Had the
// seed been the IEEE-754 non-finite value, L472 would yield a non-finite difference and L486 a
// non-finite factor, so the recomputed discount would be non-finite too - A DIFFERENT WRONG ANSWER,
// not a better one. Had it been the largest exactly-representable safe integer, every figure
// asserted below would change. So no substitution is acceptable: not a non-finite value, not the
// safe-integer maximum, not `null`, not `undefined`, and not an optional key. One million, exactly.
const UNLIMITED_USE_SENTINEL: UnlimitedUseSentinel = 1000000;

/**
 * The `Promotion` an accumulator entry carries, derived from the published contract rather than
 * imported from the entity module.
 *
 * JUDGMENT CALL: an indexed access on the already-imported `QualifiedDiscount` instead of an
 * `import type { Promotion }`. The subject needs no entity - it reads `promotionRewardID` and
 * rewrites `discountAmount`, and never calls a method on the promotion - so importing the entity
 * would add a dependency this suite does not exercise. Deriving the type keeps one owner for the
 * contract: if `QualifiedDiscount.promotion` ever changed, this alias would follow automatically
 * rather than drifting. It is a derivation, not a re-declaration of a published type.
 */
type AccumulatorPromotion = QualifiedDiscount['promotion'];

/**
 * Builds one `OrderItemUsage` record: the three published members and nothing else.
 *
 * `discountPerUseValue` is MONEY and is never read by the subject - the ledger's ascending order by
 * that member is established upstream at [model/service/PromotionService.cfc:L301-L329] and owned
 * by `rewardUsageLedger.test.ts`. It is supplied because the contract requires it, and it is
 * supplied as a decimal string routed through `Money` so no raw floating-point value ever enters
 * these structures.
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
 * Builds one reward-usage ledger entry.
 *
 * ★ THE MEASURE-KIND SPLIT, ENFORCED BY THE PARAMETER TYPES. `usedInOrder` and
 * `maximumUsePerOrder` are PLAIN INTEGER COUNTS and are never wrapped in `Money`; only
 * `discountAmount` and `discountPerUseValue` are monetary. The subject's one monetary operation is
 * the recomputation at [model/service/PromotionService.cfc:L486]; its `needToRemove` arithmetic at
 * L472 and L505 is integer arithmetic over counts.
 *
 * CFML parity [model/service/PromotionService.cfc:L176, L177]: `maximumUsePerItem` and
 * `maximumUsePerQualification` keep the seeded sentinel in every case below. That is faithful
 * rather than lazy - the seed at L173-L179 writes the sentinel into all three limits, and the
 * stripping block reads NEITHER of these two. Only `maximumUsePerOrder` is varied, because only
 * `maximumUsePerOrder` is read.
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
 * proof of what it did and what it left alone. Rendering to strings rather than deep-cloning the
 * objects means the comparison observes exactly the two things the subject can change - which
 * records survive, in what order, and at what amount - without dragging a `Promotion` entity's
 * internals into the equality.
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
 * would turn a broken scenario into a confusing downstream failure, and this raises at the exact
 * line the setup went wrong. The message names the scenario, not the subject, so it can never be
 * mistaken for the subject's own unguarded-lookup failure asserted further down.
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

/**
 * Resolves one reward-usage ledger entry, narrowing the indexed read the same way.
 */
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

/** The five members the published `PromotionRewardUsageDetail` contract declares, sorted. */
const LEDGER_ENTRY_MEMBERS: readonly string[] = [
  'maximumUsePerItem',
  'maximumUsePerOrder',
  'maximumUsePerQualification',
  'orderItemsUsage',
  'usedInOrder',
];

describe('stripOverUsedRewardDiscounts - the ported over-use correction loop', () => {
  // A2 - REQUEST-SCOPED STATE, REBUILT FOR EVERY CASE. `makePromotionFixtures()` returns a fresh
  // graph per call and the subject mutates its inputs in place, so a graph shared across cases
  // would let one case's stripping decide another's outcome. This is the suite's ONLY module-level
  // binding and it is reassigned before every case; no ledger, no accumulator and no counter is
  // held at module scope.
  let fixtures: ReturnType<typeof makePromotionFixtures>;

  beforeEach(() => {
    fixtures = makePromotionFixtures();
  });

  describe('the shipped surface, confirmed before anything is asserted about behaviour', () => {
    it('is a synchronous three-parameter function that returns nothing', () => {
      // The subject takes the ledger, the accumulator and the leaked reward identifier - three
      // parameters, none optional. Arity is asserted because the third parameter is the whole point
      // of the module: a two-parameter version could only be one that had resolved the leak, which
      // is the change this port forbids.
      expect(stripOverUsedRewardDiscounts.length).toBe(3);

      // Returns `void`, exactly as the legacy block emits nothing. The surviving discounts are read
      // back out of the accumulator by the application pass at
      // [model/service/PromotionService.cfc:L524-L537].
      const returned: void = stripOverUsedRewardDiscounts({}, {}, fixtures.leakedRewardID);

      expect(returned).toBeUndefined();
    });

    it('does not resolve the leaked identifier at all when no ledger key over-uses', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L472]: the leaked lookup sits INSIDE the
      // L471 gate, so it is reached only when some key has actually over-used. An empty ledger
      // therefore completes silently even though the leaked identifier names nothing at all - and a
      // hoisted lookup, however tidy, would raise here instead. That difference is observable, so
      // the position of the lookup is part of the behaviour.
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
      // ★ THE PROOF THAT THE LEAKED PARAMETER IS LOAD-BEARING. Two runs over identically-built
      // inputs, differing ONLY in the third argument, reach opposite outcomes. Passing the examined
      // reward's own identifier - which is what a repaired implementation would effectively do -
      // strips the examined reward's own item; passing the genuinely-leaked identifier inflates a
      // different item instead.
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
      // the fractional branch, and the SECOND order item - the leaked reward's item, not the
      // examined reward's - is rewritten to 8 / 2 x (2 - (-999994)) = 4 x 999996 = 3999984.
      // Preserved deliberately; do not fix without a product decision.
      const leakedRunAccumulator: OrderItemQualifiedDiscounts = buildAccumulator();

      stripOverUsedRewardDiscounts(buildLedger(), leakedRunAccumulator, leakedID);

      expect(describeAccumulator(leakedRunAccumulator)).toStrictEqual({
        [ids.orderItemID]: [`${examinedID}@8`],
        [ids.secondOrderItemID]: [`${examinedID}@3999984`],
      });

      // With the examined reward's own identifier, needToRemove is 6 - 5 = 1, which is NOT less
      // than that reward's own discount quantity of 1, so the deletion branch runs and the FIRST
      // order item loses its discount outright. Same inputs, wholly different money.
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
      // ★ NON-NEGOTIABLE. If the examined key and the leaked key coincided, the wrong-key read
      // would return the right value and defect 9 would be invisible; if the two rewards' usage
      // entries named the same order item, the wrong ITEM read would likewise be undetectable.
      // Every case below is built on this pair being genuinely distinct, so it is asserted rather
      // than assumed.
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

      // `toStrictEqual` rather than a member-by-member check, so an unexpected FOURTH member on the
      // published three-member `OrderItemUsage` contract would fail here.
      expect(leakedUsage).toStrictEqual({
        orderItemID: fixtures.opaqueOrderReferences.secondOrderItemID,
        discountQuantity: 1,
        discountPerUseValue: Money.fromDecimalString('3.75'),
      });
    });

    it('has the examined exhibit genuinely over its own per-order limit', () => {
      // The L471 gate is what admits a key to the stripping body at all, so the exhibit must
      // satisfy it on its OWN pair of numbers - not on the leaked reward's.
      expect(fixtures.overusedRewardUsageDetail.usedInOrder).toBeGreaterThan(
        fixtures.overusedRewardUsageDetail.maximumUsePerOrder,
      );
      expect(fixtures.leakedRewardUsageDetail.usedInOrder).not.toBeGreaterThan(
        fixtures.leakedRewardUsageDetail.maximumUsePerOrder,
      );
    });
  });

  // =========================================================================
  // THE EXACT INDEX MAP, ROW BY ROW.
  //
  //   L468  `for(var prID in promotionRewardUsageDetails)`         - key iteration
  //   L471  `[prID]` on BOTH sides of the `>`                      - CORRECT, do not "fix"
  //   L472  `[prID].usedInOrder` less `[leaked].maximumUsePerOrder` - MIXED, preserved
  //   L475  `[leaked].orderItemsUsage` as the loop bound           - LEAKED, preserved
  //   L476  `[leaked].orderItemsUsage[x].orderItemID`              - LEAKED, preserved
  //   L477  `[leaked].orderItemsUsage[x].discountQuantity`         - LEAKED, preserved
  //   L483  `.promotionRewardID == prID`                           - CORRECT
  //   L499  `.promotionRewardID == prID`                           - CORRECT
  //
  // Stated plainly: the GATE uses the iterated key, the LIMIT and the ITEM LIST come from whichever
  // reward happened to be processed last, and the inner MATCH uses the iterated key again. So
  // maximum-use-per-order is enforced against the wrong reward for every key in the ledger.
  //
  // Each case below isolates exactly one row by holding every other variable equal between the two
  // ledger entries, so a failure names the row that changed rather than merely reporting that some
  // figure moved.
  // =========================================================================
  describe('L471 compares the iterated key against ITSELF, and that line is CORRECT', () => {
    it('does not admit a within-limit key just because the leaked limit is smaller', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L471]: THIS LINE IS CORRECT AND MUST NOT
      // BE "FIXED". Seeing the mixed indices on L472 immediately below, the tempting change is to
      // make L471 match it. This case is what such a change would break: the examined reward has
      // used 2 against its own limit of 5, so `2 > 5` is FALSE and it never enters the body - even
      // though the leaked reward's limit is 1, which would have made `2 > 1` TRUE and stripped a
      // discount that no limit was actually exceeded for. A well-meaning refactor is as likely to
      // break a correct line as to repair a broken one, so the correct line is pinned too.
      // Preserved deliberately; do not fix without a product decision.
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

      // Nothing strips. The leaked key's own gate, `1 > 1`, is false as well, so neither key enters.
      expect(describeAccumulator(accumulator)).toStrictEqual(before);
      expect(recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount.toFixed2()).toBe(
        '8.00',
      );
    });

    it('admits a key that is over its OWN limit while the leaked reward is well within its own', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L471]: the LEFT operand is also the
      // iterated key's own `usedInOrder`, not the leaked reward's. Here the examined reward has used
      // 6 against its own limit of 5 and DOES enter, even though the leaked reward has used only 1.
      // Had the left operand leaked too, `1 > 5` would be false and nothing would strip at all.
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

      // needToRemove = 6 - 5 = 1, which is less than the leaked usage quantity of 4, so L486
      // rewrites the amount as 8 / 4 x (4 - 1) = 2 x 3 = 6.
      const rewritten: Money = recordAt(bucketOf(accumulator, ids.orderItemID), 0).discountAmount;

      expect(rewritten.toFixed2()).toBe('6.00');
      expect(rewritten.equals(Money.fromDecimalString('8.00').dividedBy(4).times(3))).toBe(true);
    });
  });

  describe('L472 mixes the indices, and the mix changes the money', () => {
    it('subtracts the LEAKED limit, not the examined reward\u2019s own', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L472]: the minuend is
      // `[prID].usedInOrder` and the subtrahend is `[leaked].maximumUsePerOrder`. Everything else
      // here is held equal between the two entries - same order item, same discount quantity of 5 -
      // so the ONLY variable is which reward supplies the limit, and both runs take the same
      // fractional branch. The two answers still differ by a factor of four:
      //
      //   with the LEAKED limit of 2   needToRemove = 6 - 2 = 4   20 / 5 x (5 - 4) =  4.00  <- pinned
      //   with its OWN limit of 5      needToRemove = 6 - 5 = 1   20 / 5 x (5 - 1) = 16.00  <- a "fix"
      //
      // 16.00 is the tidier figure and it is NOT the specification. Preserving 4.00 is preserving
      // the amount the migrated system charges.
      // Preserved deliberately; do not fix without a product decision.
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

      // The figure a repaired L472 would have produced, asserted as NOT the outcome so that a
      // silent repair fails here loudly instead of passing quietly.
      expect(rewritten.equals(Money.fromDecimalString('16.00'))).toBe(false);
    });
  });

  describe('L475, L476 and L477 all read the LEAKED reward\u2019s usage list', () => {
    it('takes the loop bound from the leaked list even when the examined list is empty', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L475]: `arrayLen(...)` is applied to the
      // LEAKED reward's `orderItemsUsage`. The examined reward's own list is EMPTY here, so a bound
      // taken from it would iterate zero times and strip nothing; the leaked list holds two entries,
      // and both are visited. Both limits are 5, so needToRemove is the same whichever entry
      // supplies it - fixed at 8 - 5 = 3 - and the row under isolation is the loop bound alone.
      //
      //   entry 1  item first,  quantity 1   3 < 1 is false  -> deletion, needToRemove = 3 - 1 = 2
      //   entry 2  item second, quantity 4   2 < 4 is true   -> 20 / 4 x (4 - 2) = 5 x 2 = 10.00
      //
      // Preserved deliberately; do not fix without a product decision.
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
      // LEAKED reward's usage record. Both entries carry the same limit of 5 and the same quantity
      // of 4, so the only difference is WHICH item each names - and the second item is the one
      // rewritten while the first, which is the examined reward's own, is untouched. Had L476 read
      // the examined reward's usage, `1 < 4` would still hold and the FIRST item would have been
      // rewritten instead.
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
      // the LEAKED reward's usage record too, and it appears three times in the L486 expression - as
      // the divisor, and twice in the factor. Both entries name the SAME order item and carry the
      // same limit of 5 here, so the only variable is the quantity:
      //
      //   with the LEAKED quantity of 4   8 /  4 x ( 4 - 1) = 2.0 x 3 = 6.00  <- pinned
      //   with its OWN quantity of 10     8 / 10 x (10 - 1) = 0.8 x 9 = 7.20  <- a "fix"
      //
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
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L483]: the fractional branch's inner test
      // is `.promotionRewardID == prID` - the ITERATED key, not the leaked identifier - and that is
      // CORRECT. The consequence is a genuinely mixed enforcement: the leaked reward chose WHICH
      // item is visited and WHAT the arithmetic is, while the iterated key chooses WHOSE discount
      // absorbs it. The leaked reward's own record on the same item sits untouched at 30.00.
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

      // needToRemove = 1, quantity 4, so 20 / 4 x (4 - 1) = 5 x 3 = 15. Length is still three: the
      // fractional branch rewrites, it never removes.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        [ids.orderItemID]: [`${leakedID}@30`, `${examinedID}@15`, '@10'],
      });
    });

    it('deletes only the examined reward\u2019s record, leaving the others in order', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L499]: the deletion branch's inner test is
      // `.promotionRewardID == prID` as well, and is likewise CORRECT. needToRemove = 9 - 5 = 4 is
      // NOT less than the quantity of 4, so the `else` at L495 runs and L502 removes the matched
      // element outright. The two neighbours survive, in their original relative order.
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

  // =========================================================================
  // THE BIDIRECTIONAL MONEY EFFECT.
  //
  // The consequence of defect 9 is NOT merely "too little gets stripped". Trace it:
  //
  //   1. [L471] passes on the examined key's own numbers.
  //   2. [L472] subtracts the LEAKED limit, so the difference goes NEGATIVE whenever that limit
  //      exceeds the examined key's usage.
  //   3. [L479] `needToRemove < thisDiscountQuantity` is then true for any positive quantity, so
  //      control enters the FRACTIONAL branch rather than the deletion branch.
  //   4. [L486] the factor `(quantity - needToRemove) / quantity` EXCEEDS 1, so the stored amount is
  //      INFLATED rather than reduced.
  //   5. [L489] zeroes the counter and [L514] then breaks.
  //
  // Both directions are covered below, in separate cases, because a suite that pinned only the
  // shrink direction would leave the inflation free to be introduced or removed unnoticed.
  // =========================================================================
  describe('the money moves in BOTH directions', () => {
    it('SHRINKS the discount when needToRemove comes out positive', () => {
      // The direction the algorithm nominally intends. Both limits are 5, so needToRemove is
      // 6 - 5 = 1 either way and the mixed index is not what is under test here - only the shrink
      // outcome is: 12 / 3 x (3 - 1) = 4 x 2 = 8, which is less than the 12 the reward granted.
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
      // unconfigured, so its limit is still the seeded 1000000 and needToRemove comes out as
      // 6 - 1000000 = -999994. The strict `<` at L479 is satisfied, the fractional branch runs, and
      // the factor (2 - (-999994)) / 2 = 499998 is applied to a 10.00 discount:
      //
      //   10 / 2 x (2 - (-999994)) = 5 x 999996 = 4999980
      //
      // A discount of 4,999,980 on an item nobody discounted by more than 10. There is NO CLAMP in
      // the source and none is added: no lower bound, no upper bound, no non-negativity check on
      // needToRemove and no sanity ceiling on the result. Adding one would repair defect 9 by the
      // back door and change the amount charged.
      // Preserved deliberately; do not fix without a product decision.
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
      // The blast radius, asserted as a correctness statement about SCOPE. [L489] sets the counter
      // to zero the moment the fractional branch acts, and [L514]'s exact-zero test then breaks the
      // usage loop - so the leaked reward's SECOND item is never reached, even though it sits in the
      // same list and would inflate identically if it were. One item inflated, one item untouched.
      //
      // Not a runaway - but not confined to a single ledger key either, because every key in the
      // ledger measures itself against the same leaked limit.
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
      // this literal, and the published `UnlimitedUseSentinel` alias names it as a TYPE rather than
      // as a runtime constant so the domain layer emits no JavaScript for it. The fixture graph and
      // this suite must agree on the value, or every figure in the inflation cases would be
      // measuring something else.
      expect(fixtures.unlimitedUseSentinel).toBe(1000000);
      expect(UNLIMITED_USE_SENTINEL).toBe(fixtures.unlimitedUseSentinel);
    });

    it('makes the L486 factor approximately one million divided by the quantity', () => {
      // CFML parity [model/service/PromotionService.cfc:L486]: with the leaked reward unconfigured,
      // needToRemove is 2 - 1000000 = -999998 and the factor becomes
      // (4 - (-999998)) / 4 = 1000002 / 4 - which is the sentinel divided by the quantity, to within
      // the examined reward's own two units of usage. The recomputed amount is therefore
      //
      //   12 / 4 x (4 - (-999998)) = 3 x 1000002 = 3000006
      //
      // ★ AND THIS IS WHY THE LITERAL MATTERS. Substitute the IEEE-754 non-finite value for the
      // seed and the factor is non-finite, so the discount is non-finite: A DIFFERENT WRONG ANSWER,
      // not a better one, and one that would silently defeat every decimal assertion in this suite.
      // Substitute the largest exactly-representable safe integer and every figure changes. `null`,
      // `undefined` or an optional key would make L472's subtraction and L471's comparison
      // inexpressible without inventing a branch the source does not have. One million, exactly.
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
      // its position and its sibling members all survive. The published `QualifiedDiscount` declares
      // `discountAmount` MUTABLE - alone among its three members - precisely so that assignment can
      // be reproduced literally rather than by rebuilding the entry.
      //
      // Because the subject returns `void`, this is asserted on the inputs: same accumulator object,
      // same bucket array, same record object, and a NEW `Money` in the field. `Money` itself is
      // immutable, so the amount captured beforehand still reads 10.00 afterwards.
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

      // Exactly the three published members, so an extra key smuggled in by the rewrite would fail.
      expect(Object.keys(recordBefore).sort()).toStrictEqual([
        'discountAmount',
        'promotion',
        'promotionRewardID',
      ]);
    });

    it('lets the unguarded division at L486 refuse a zero quantity rather than absorbing it', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L486]: the divisor is the leaked reward's
      // `discountQuantity` and there is no zero check on it - this is the L486 member of the
      // four-division set recorded at the top of this file, the one the transformation plan omits.
      // `precisionEvaluate` raises on a zero divisor in CFML, so the target raises too, and the
      // error is allowed to propagate: not caught, not defaulted to `Money.zero`, not
      // short-circuited by an early return.
      //
      // A zero quantity is reachable only through the inflation path, since a non-negative
      // needToRemove could never be less than zero and would take the deletion branch instead. So
      // this case is defect 9's doing as well.
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
      // SCOPE BOUNDARY. The subject READS `usedInOrder`, `maximumUsePerOrder` and `orderItemsUsage`
      // and writes NONE of them - the only structure it mutates is the accumulator. Incrementing
      // `usedInOrder` belongs to the reward iteration at
      // [model/service/PromotionService.cfc:L297]; nothing in L467-L521 assigns into the ledger.
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
      // key. When those two disagree - the leaked reward's item carries a discount for some other
      // reward entirely - the descending scan finds no match, so neither L486 nor L502 runs and the
      // accumulator is left exactly as it arrived. The examined reward stays over its limit,
      // unenforced.
      //
      // This is the complement of the leaked-index cases: together they show the leaked list
      // genuinely decides which items are touched, because pointing it somewhere unhelpful disables
      // the whole pass.
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
      // `for(var y=arrayLen(...); y>=1; y--)` and it breaks on its first match. Each bucket arrives
      // sorted DESCENDING by discount amount from the facade's insertion sort at L266-L294, so
      // walking the indices downward reaches the SMALLEST matching discount first. That is the
      // semantic consequence, and it is load-bearing: an upward first-match would select the LARGEST
      // discount for that reward and pay out different money.
      //
      // Three matching records of distinct amounts, so the choice is unambiguous: 30, 20 and 10 all
      // belong to the examined reward, and 10 is the one rewritten to 10 / 4 x (4 - 1) = 7.50.
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
      // CFML parity [model/service/PromotionService.cfc:L498]: the second scan runs downward too, so
      // the deletion also lands on the smallest matching discount - here the 10.00 - and the two
      // larger records survive with their identities and their relative order intact.
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

      // CFML parity [model/service/PromotionService.cfc:L502]: `arrayDeleteAt(records, y)` becomes a
      // single-element removal at the matched index. Exactly one element goes, and the survivors are
      // the SAME objects in the SAME order - nothing is rebuilt, reinserted or re-sorted.
      expect(bucket).toHaveLength(2);
      expect(recordAt(bucket, 0)).toBe(largest);
      expect(recordAt(bucket, 1)).toBe(middle);
      expect(recordAt(bucket, 0).discountAmount.toFixed2()).toBe('30.00');
      expect(recordAt(bucket, 1).discountAmount.toFixed2()).toBe('20.00');
    });

    // The reverse direction is proven by the two behavioural cases above - the smallest matching
    // discount is the one rewritten and the one deleted - rather than by asserting a boolean the
    // fixture module authored. Reversing the scan changes the money, and those cases fail when it
    // is reversed; a self-agreeing flag would not.
  });

  describe('the accumulator lookups are UNGUARDED here, unlike the application pass at L529', () => {
    it('refuses an order item the accumulator has no bucket for', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L482, L498 versus L529]: the two scans here
      // apply `arrayLen()` straight to `orderItemQulifiedDiscounts[ orderItemID ]` with NO
      // `structKeyExists` guard, and the identifier they index with came from the LEDGER rather than
      // from the accumulator's own key set - so the two structures can genuinely disagree. CFML
      // raises when `arrayLen()` is applied to an absent struct key, so the faithful target
      // behaviour is to raise as well. Skipping the item instead would add control flow the source
      // does not have and would hide the one condition under which the two structures fell out of
      // step. NO GUARD IS ADDED.
      //
      // The contrast is deliberate: `promotionApplication.ts` ports L529, whose guard tests
      // `structKeyExists(...)` AND `arrayLen(...)`. That guarded side is asserted by
      // `promotionApplication.test.ts` and is not duplicated here.
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
      // The legacy reaches it only from inside the L471 gate, so it raises exactly when some key has
      // over-used - and the shipped module performs the lookup in the same place for that reason.
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
      // ★ THIS MODULE ONCE READ THE ACCUMULATOR CASE-SENSITIVELY WHILE ITS NEIGHBOUR READ IT
      // CASE-INSENSITIVELY. `./promotionApplication.ts` ports L529 through `structKeyExists` +
      // `structGet`, so an `orderItemID` differing only in case resolved there; the two scans here
      // used plain bracket access, so the SAME identifier against the SAME structure raised "the
      // accumulator has no bucket for orderItemID". CFML struct keys are case-insensitive at both
      // sites [model/service/PromotionService.cfc:L482, L498, L529], so one module folding while its
      // neighbour does not is a defect regardless of whether the input is reachable today.
      //
      // The unguarded-lookup contract above is untouched: a GENUINELY absent key still raises, which
      // the two cases either side of this one assert. Folding case does not invent a bucket.
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
      // `==`, which is case-insensitive on strings. A superseded revision used `===` here, so a
      // candidate whose `promotionRewardID` differed in case from the key being stripped matched
      // NOTHING and the over-used discount survived at its full amount. `cfEquals` folds case exactly
      // as `==` did, and it agrees with `===` on every equal spelling, so no existing outcome moves.
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
      // [model/service/PromotionService.cfc:L156] matches no real reward identifier under `cfEquals`
      // any more than it did under `===`, so sale-price discounts remain structurally immune to
      // use-limit stripping. `cfEquals` is asserted not to raise on an empty operand either - it
      // raises only on null and undefined, neither of which this structure can hold.
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
      // POSITION, not of the identifier being absent. With the examined key inside its limit the
      // gate never opens, the lookup is never performed, and the absent identifier costs nothing.
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
      // CFML parity [model/service/PromotionService.cfc:L502]: the deletion removes an element from
      // the bucket; it never removes the bucket. So a bucket that held one record ends as an empty
      // array under a key that still exists.
      //
      // That state is exactly what the application pass's SECOND condition at L529 exists to catch -
      // `structKeyExists` passes while `arrayLen(...)` is zero - which is why neither of its two
      // tests is redundant. The assertion about L529's behaviour belongs to
      // `promotionApplication.test.ts`; what is asserted here is only that this pass PRODUCES the
      // state.
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
      // CFML parity [model/service/PromotionService.cfc:L505]: `needToRemove - thisDiscountQuantity`
      // subtracts a COUNT from a COUNT. The source wraps it in no `precisionEvaluate`, so the target
      // routes it through neither `Money` nor the precise-arithmetic helpers - it is plain integer
      // arithmetic on a plain `number`.
      //
      // The progression is observable through its effects, with both limits held at 5 so
      // needToRemove starts at 8 - 5 = 3:
      //
      //   entry 1  quantity 1   3 is not less than 1  -> delete, 3 - 1 = 2   continue
      //   entry 2  quantity 2   2 is not less than 2  -> delete, 2 - 2 = 0   [L514] breaks
      //
      // Two deletions and no fractional rewrite, which is only possible if the counter stepped
      // 3, 2, 0 exactly.
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
      // reproduced as a strict `=== 0` and NEVER relaxed to `<= 0`. The difference is behavioural and
      // this case is where it shows.
      //
      // The leaked reward is unconfigured, so needToRemove starts at 6 - 1000000 = -999994. The first
      // usage entry names an item whose bucket holds no record for the examined reward, so the
      // fractional branch finds no match, nothing is rewritten, and [L489] never runs - the counter
      // is still -999994 when L514 tests it. Being negative rather than zero, the loop CONTINUES,
      // and the second usage entry is reached and inflated to 10 / 2 x (2 - (-999994)) = 4999980.
      //
      // Relax the test to `<= 0` and the loop would break after the first entry, leaving the second
      // item at 10.00. Same inputs, different money - which is why the exact comparison is pinned.
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
      // ★ LEGACY-DEFECT [model/service/PromotionService.cfc:L324-L467]: A REAL, EXPLOITABLE
      // USE-LIMIT GAP, MEASURED RATHER THAN INFERRED. A census of `promotionRewardUsageDetails`
      // across the source file finds occurrences on lines 105 to 323 and then again from 468 - and
      // ZERO between L324 and L467, the span holding the fulfillment-reward branch (L345-L412) and
      // the order-reward branch (L415-L455). Neither branch reads or writes the ledger.
      //
      // Since this pass can only visit identifiers it finds in some ledger entry's
      // `orderItemsUsage`, and no order-level or fulfillment-level use is ever recorded there,
      // order-level and fulfillment-level discounts can NEVER be stripped however far their reward
      // exceeds its per-order limit. Their discounts are included in the state below and proven
      // untouched while an item-level discount beside them is rewritten.
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
      // The structural root of the immunity above. The published `PromotionRewardUsageDetail`
      // declares exactly five members and NONE of them records order-level or fulfillment-level
      // use, so there is nothing for the stripping loop to find even in principle. Asserted over
      // every entry the fixture graph seeds, not just the two exhibits, so a new member added to the
      // contract would fail here rather than quietly widening the pass.
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
      // accumulator entries whose `promotionRewardID` is the EMPTY STRING and creates no ledger entry
      // at all. The two membership tests at L483 and L499 compare against `prID`, which is always a
      // real ledger key, so the empty identifier can never be selected.
      //
      // ★ THE EMPTY STRING IS LOAD-BEARING and must never be replaced by `undefined`, `null`, a
      // synthetic identifier or a symbol: each of those would change either the comparison or the
      // shape of the published contract, and the immunity here is EMERGENT from the comparison
      // rather than enforced by any filter. No explicit test for `''` appears in the subject and
      // none should. The sentinel's creation is asserted by `salePriceSeeding.test.ts`.
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

      // needToRemove = 4, quantity 4, so the deletion branch removes the examined reward's record and
      // the sale-price record survives at its full amount, in its original position.
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

      // No ledger key is the empty string - here, and in the fixture graph's own seeded ledger - so
      // the match at L483 and L499 has nothing it could ever select.
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
      // [model/dao/PromotionDAO.cfc:L51-L132] carries no `ORDER BY`, so the ledger's key order is
      // unspecified at both ends of the port. This case therefore does NOT sort the keys and does
      // NOT assert an order over them - it asserts that the outcome does not depend on one, by
      // running the same values under two genuinely different insertion orders.
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

      // The two really are built in different orders, so the comparison below is not vacuous. This
      // asserts a property of the test's own inputs, never of the ledger contract.
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
      // A2 - the subject mutates its arguments, so two pairs built side by side must not share a
      // single object between them. Stripping the first pair changes nothing about the second, which
      // still reads exactly as it was constructed.
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
      // The graph rebuilt in `beforeEach` is a new object each time, so a ledger mutated by one case
      // cannot be observed by the next. Asserted directly rather than trusted.
      const anotherGraph: ReturnType<typeof makePromotionFixtures> = makePromotionFixtures();

      expect(anotherGraph).not.toBe(fixtures);
      expect(anotherGraph.rewardUsageDetails).not.toBe(fixtures.rewardUsageDetails);
      expect(anotherGraph.overusedRewardUsageDetail).not.toBe(fixtures.overusedRewardUsageDetail);
      expect(anotherGraph.overusedRewardID).toBe(fixtures.overusedRewardID);
    });
  });
});
