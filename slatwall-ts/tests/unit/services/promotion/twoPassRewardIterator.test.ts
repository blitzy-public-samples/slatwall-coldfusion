// slatwall-ts - characterization suite pinning `src/services/promotion/twoPassRewardIterator.ts`
//
// JUDGMENT CALL: the callback-shaped `iterate` consumes no signature reshaping.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L417]: the order arm's first statement sums
// `getSubtotalAfterItemDiscounts()` and `getFulfillmentChargeAfterDiscountTotal()` with a PLAIN
// `+` and no `precisionEvaluate`.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L167]: `cfthread` usage across the in-scope
// slice is VERIFIED ZERO - a case-insensitive census over `model/service/`, `model/dao/` and
// `model/entity/` returns no occurrence at all.

import { beforeEach, describe, expect, it } from 'vitest';

import { Money } from '../../../../src/domain/valueObjects/money.js';
import { TwoPassRewardIterator } from '../../../../src/services/promotion/twoPassRewardIterator.js';
import type { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type { PromotionRepository } from '../../../../src/domain/ports/promotionRepository.js';
import type { OrderView } from '../../../../src/domain/views/orderView.js';
import type {
  RewardVisitOutcome,
  TwoPassRewardIterationResult,
} from '../../../../src/services/promotion/twoPassRewardIterator.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// The literals the source fixes, each named exactly once.

/**
 * The reward-type list at [model/service/PromotionService.cfc:L165], character for character.
 */
const L165_REWARD_TYPE_LIST = 'merchandise,subscription,contentAccess,order,fulfillment';
const L165_REWARD_TYPE_COUNT = 5;

/**
 * [model/service/PromotionService.cfc:L165] `qualificationRequired=true`, stated explicitly.
 */
const L165_QUALIFICATION_REQUIRED = true;

/**
 * The THREE-value list the order-item arm matches against
 * [model/service/PromotionService.cfc:L200], via `listFindNoCase`.
 */
const L200_REWARD_TYPE_LIST = 'merchandise,subscription,contentAccess';

/**
 * [model/service/PromotionService.cfc:L345], matched with CFML `eq`.
 */
const L345_REWARD_TYPE = 'fulfillment';

/**
 * [model/service/PromotionService.cfc:L415], matched with CFML `eq`.
 */
const L415_REWARD_TYPE = 'order';

/**
 * [model/service/PromotionService.cfc:L419]
 * `getDiscountAmount(reward, totalDiscountableAmount, 1)` - the order reward is computed with
 * QUANTITY 1, never the order's item count and never its total sale quantity.
 */
const L419_ORDER_REWARD_QUANTITY = 1;

/**
 * The value the subject returns for `lastProcessedRewardID` when nothing was processed.
 */
const NO_REWARD_PROCESSED_ID = '';

/**
 * The three-value L200 list, split and case-folded once.
 *
 * `src/lib/cfml/list.ts` is deliberately not imported: it is not among this suite's declared
 * dependencies.
 */
const L200_REWARD_TYPES: readonly string[] = L200_REWARD_TYPE_LIST.split(',').map(
  (rewardType: string): string => rewardType.toLowerCase(),
);

// The hand-written in-memory doubles.
//
// Every double below is declared in this FILE, is constructed fresh in `beforeEach`, and holds no
// module-level mutable state.

/**
 * Raised by the seven port members the subject must never reach.
 *
 * The strongest available statement that this subject touches exactly one repository operation.
 */
function unreachedRepositoryMember(member: string): never {
  throw new Error(
    `the repository double's ${member} was reached while iterating promotion rewards. The ` +
      'two-pass iteration block reaches getActivePromotionRewards and nothing else ' +
      '[model/service/PromotionService.cfc:L165], so reaching any other member means the subject ' +
      'has grown a collaboration this suite does not describe.',
  );
}

/**
 * One recorded reward fetch, holding the three argument values exactly as they arrived.
 */
interface RecordedActiveRewardQuery {
  readonly rewardTypeList: string;
  readonly promotionCodeList: string;
  readonly qualificationRequired: boolean | undefined;
}

/**
 * In-memory stand-in for the one port the shipped constructor takes.
 *
 * Replaces the legacy `property name="promotionDAO" type="any";`
 * [model/service/PromotionService.cfc:L51], which a DI/1 convention scan resolved at run time.
 *
 * Hands back the reward order it was given, unsorted and unfiltered.
 */
class RecordingPromotionRepository implements PromotionRepository {
  /**
   * Every reward fetch, in call order. One entry per `iterate`, never one per pass.
   */
  readonly activeRewardQueries: RecordedActiveRewardQuery[] = [];

  constructor(private readonly rewards: readonly PromotionReward[]) {}

  getActivePromotionRewards(
    rewardTypeList: string,
    promotionCodeList: string,
    qualificationRequired?: boolean,
  ): Promise<PromotionReward[]> {
    this.activeRewardQueries.push({ rewardTypeList, promotionCodeList, qualificationRequired });

    return Promise.resolve([...this.rewards]);
  }

  // The other seven members of the port. Every one raises by name.
  readonly getPromotionPeriodUseCount: PromotionRepository['getPromotionPeriodUseCount'] = () =>
    unreachedRepositoryMember('getPromotionPeriodUseCount');

  readonly getPromotionPeriodAccountUseCount: PromotionRepository['getPromotionPeriodAccountUseCount'] =
    () => unreachedRepositoryMember('getPromotionPeriodAccountUseCount');

  readonly getPromotionCodeUseCount: PromotionRepository['getPromotionCodeUseCount'] = () =>
    unreachedRepositoryMember('getPromotionCodeUseCount');

  readonly getPromotionCodeAccountUseCount: PromotionRepository['getPromotionCodeAccountUseCount'] =
    () => unreachedRepositoryMember('getPromotionCodeAccountUseCount');

  readonly getSalePricePromotionRewardsQuery: PromotionRepository['getSalePricePromotionRewardsQuery'] =
    () => unreachedRepositoryMember('getSalePricePromotionRewardsQuery');

  readonly getRoundingRuleQuery: PromotionRepository['getRoundingRuleQuery'] = () =>
    unreachedRepositoryMember('getRoundingRuleQuery');
}

/**
 * Which arm of the facade's chained construct the reward-level guards would select.
 *
 * `undefined` means no ARM MATCHED, which is a first-class outcome rather than an error: L454
 * closes the chain with no FINAL `else`, so a reward can be visited and take no branch at all.
 */
type RewardArm = 'orderItem' | 'fulfillment' | 'order';

/**
 * Selection only - never an arm body.
 *
 * CFML parity [model/service/PromotionService.cfc:L200, L345, L415]: all three matches are
 * CASE-INSENSITIVE in CFML - `listFindNoCase` by name, and `eq` because CFML string comparison
 * ignores case - while TypeScript comparison is case-SENSITIVE.
 */
function selectRewardArm(
  rewardType: string | undefined,
  isOrderRewardsPass: boolean,
): RewardArm | undefined {
  if (rewardType === undefined) {
    return undefined;
  }

  const foldedRewardType: string = rewardType.toLowerCase();
  if (!isOrderRewardsPass && L200_REWARD_TYPES.includes(foldedRewardType)) {
    return 'orderItem';
  }
  if (!isOrderRewardsPass && foldedRewardType === L345_REWARD_TYPE) {
    return 'fulfillment';
  }
  if (isOrderRewardsPass && foldedRewardType === L415_REWARD_TYPE) {
    return 'order';
  }

  // L454 closes the chain and there is no final `else`, so no arm runs.
  return undefined;
}

/**
 * One recorded visit, exactly as the subject handed it over.
 */
interface RecordedVisit {
  readonly rewardID: string;
  readonly rewardType: string | undefined;
  readonly isOrderRewardsPass: boolean;
  /**
   * Which arm the caller's guards selected, or `undefined` when none matched.
   */
  readonly arm: RewardArm | undefined;
}

/**
 * What the order arm read off the order view, recorded without computing a discount.
 */
interface RecordedOrderArmRead {
  /**
   * [model/service/PromotionService.cfc:L417] first operand - the POST-ITEM-DISCOUNT subtotal,
   * presented to two decimal places.
   */
  readonly subtotalAfterItemDiscounts: string;
  /**
   * [model/service/PromotionService.cfc:L417] second operand.
   */
  readonly fulfillmentChargeAfterDiscountTotal: string;
  /**
   * [model/service/PromotionService.cfc:L417] the two combined through `Money.plus()`.
   */
  readonly totalDiscountableAmount: string;
  /**
   * [model/service/PromotionService.cfc:L419] the third argument to `getDiscountAmount`. Exactly
   * `1`.
   */
  readonly quantity: number;
  /**
   * Which visit produced this read, zero-based across the whole iteration.
   */
  readonly visitIndex: number;
}

/**
 * Per-reward qualification, decided by the case rather than computed by the subject.
 */
type QualificationDecision = (reward: PromotionReward, isOrderRewardsPass: boolean) => boolean;

/**
 * Every reward's period qualifies. The ordinary configuration.
 */
const everyPeriodQualifies: QualificationDecision = () => true;

/**
 * The caller's side of the collaboration, recorded so the visit sequence can be asserted whole.
 *
 * Both write into the same logs, so a case can swap one for the other and compare outcomes
 * directly.
 */
class VisitRecorder {
  readonly visits: RecordedVisit[] = [];

  readonly orderArmReads: RecordedOrderArmRead[] = [];

  readonly dispatchLog: string[] = [];

  constructor(
    private readonly order: OrderView,
    private readonly qualifies: QualificationDecision = everyPeriodQualifies,
  ) {}

  readonly synchronousVisitor = (
    reward: PromotionReward,
    isOrderRewardsPass: boolean,
  ): RewardVisitOutcome => {
    this.dispatchLog.push(`enter:${reward.getPromotionRewardID()}`);
    const outcome: RewardVisitOutcome = this.record(reward, isOrderRewardsPass);
    this.dispatchLog.push(`leave:${reward.getPromotionRewardID()}`);

    return outcome;
  };

  readonly asynchronousVisitor = async (
    reward: PromotionReward,
    isOrderRewardsPass: boolean,
  ): Promise<RewardVisitOutcome> => {
    this.dispatchLog.push(`enter:${reward.getPromotionRewardID()}`);
    // Two real microtask turns, so a subject that dispatched without awaiting would interleave
    // visibly in `dispatchLog`.
    await Promise.resolve();
    const outcome: RewardVisitOutcome = this.record(reward, isOrderRewardsPass);
    await Promise.resolve();
    this.dispatchLog.push(`leave:${reward.getPromotionRewardID()}`);

    return outcome;
  };

  /**
   * The rewards visited during pass one, in visit order.
   */
  passOneRewardIDs(): readonly string[] {
    return this.visits
      .filter((visit: RecordedVisit): boolean => !visit.isOrderRewardsPass)
      .map((visit: RecordedVisit): string => visit.rewardID);
  }

  /**
   * The rewards visited during pass two, in visit order.
   */
  passTwoRewardIDs(): readonly string[] {
    return this.visits
      .filter((visit: RecordedVisit): boolean => visit.isOrderRewardsPass)
      .map((visit: RecordedVisit): string => visit.rewardID);
  }

  /**
   * The pass flag for every visit, in visit order.
   */
  flagSequence(): readonly boolean[] {
    return this.visits.map((visit: RecordedVisit): boolean => visit.isOrderRewardsPass);
  }

  /**
   * The arm selected for every visit, in visit order.
   */
  armSequence(): readonly (RewardArm | undefined)[] {
    return this.visits.map((visit: RecordedVisit): RewardArm | undefined => visit.arm);
  }

  private record(reward: PromotionReward, isOrderRewardsPass: boolean): RewardVisitOutcome {
    const rewardType: string | undefined = reward.getRewardType();
    const arm: RewardArm | undefined = selectRewardArm(rewardType, isOrderRewardsPass);

    this.visits.push({
      rewardID: reward.getPromotionRewardID(),
      rewardType,
      isOrderRewardsPass,
      arm,
    });

    if (arm === 'order') {
      // [model/service/PromotionService.cfc:L417] the plain-`+` sum, expressed through `Money`.
      const totalDiscountableAmount: Money = this.order.subtotalAfterItemDiscounts.plus(
        this.order.fulfillmentChargeAfterDiscountTotal,
      );

      this.orderArmReads.push({
        subtotalAfterItemDiscounts: this.order.subtotalAfterItemDiscounts.toFixed2(),
        fulfillmentChargeAfterDiscountTotal:
          this.order.fulfillmentChargeAfterDiscountTotal.toFixed2(),
        totalDiscountableAmount: totalDiscountableAmount.toFixed2(),
        // [model/service/PromotionService.cfc:L419] the literal third argument. No discount is
        // computed from it here.
        quantity: L419_ORDER_REWARD_QUANTITY,
        visitIndex: this.visits.length - 1,
      });
    }

    return { qualificationsMeet: this.qualifies(reward, isOrderRewardsPass) };
  }
}

/**
 * Wraps an order view so every member read is recorded, delegating each one unchanged.
 *
 * `OrderView` is LOCKED at TWELVE MEMBERS and is imported rather than redeclared, so this facade
 * enumerates the same twelve and adds nothing.
 *
 * What it buys: proof of what the subject does not reach for.
 */
function makeReadRecordingOrderView(order: OrderView, memberReads: string[]): OrderView {
  return {
    get orderID() {
      memberReads.push('orderID');

      return order.orderID;
    },
    get orderItems() {
      memberReads.push('orderItems');

      return order.orderItems;
    },
    get orderFulfillments() {
      memberReads.push('orderFulfillments');

      return order.orderFulfillments;
    },
    get appliedPromotions() {
      memberReads.push('appliedPromotions');

      return order.appliedPromotions;
    },
    get totalSaleQuantity() {
      memberReads.push('totalSaleQuantity');

      return order.totalSaleQuantity;
    },
    get subtotal() {
      memberReads.push('subtotal');

      return order.subtotal;
    },
    get orderType() {
      memberReads.push('orderType');

      return order.orderType;
    },
    get accountID() {
      memberReads.push('accountID');

      return order.accountID;
    },
    get subtotalAfterItemDiscounts() {
      memberReads.push('subtotalAfterItemDiscounts');

      return order.subtotalAfterItemDiscounts;
    },
    get promotionCodeList() {
      memberReads.push('promotionCodeList');

      return order.promotionCodeList;
    },
    get fulfillmentChargeAfterDiscountTotal() {
      memberReads.push('fulfillmentChargeAfterDiscountTotal');

      return order.fulfillmentChargeAfterDiscountTotal;
    },
    get currencyCode() {
      memberReads.push('currencyCode');

      return order.currencyCode;
    },
  };
}

/**
 * How many contiguous runs of the same value a flag sequence contains.
 *
 * `1` means a single pass ran, `2` means exactly two, and `3` would mean a third pass exists.
 */
function countFlagRuns(flags: readonly boolean[]): number {
  let runs = 0;
  let previous: boolean | undefined;

  for (const flag of flags) {
    if (previous === undefined || flag !== previous) {
      runs += 1;
    }
    previous = flag;
  }

  return runs;
}

describe('TwoPassRewardIterator - the ported two-pass reward iteration mechanism', () => {
  let promotionFixtures: ReturnType<typeof makePromotionFixtures>;
  let order: OrderView;
  let memberReads: string[];
  let recordingOrder: OrderView;
  let repository: RecordingPromotionRepository;
  let subject: TwoPassRewardIterator;
  let recorder: VisitRecorder;

  /**
   * Builds a fresh subject over an explicitly supplied reward order.
   *
   * The reward order is a parameter and never a default, because
   * [model/dao/PromotionDAO.cfc:L51-L132] imposes none - see the census note at the head of this
   * file.
   */
  function subjectOver(rewards: readonly PromotionReward[]): {
    readonly subject: TwoPassRewardIterator;
    readonly repository: RecordingPromotionRepository;
  } {
    const freshRepository = new RecordingPromotionRepository(rewards);

    return { subject: new TwoPassRewardIterator(freshRepository), repository: freshRepository };
  }

  /**
   * A recorder over the recording order view, with a per-case qualification decision.
   */
  function recorderWith(qualifies: QualificationDecision): VisitRecorder {
    return new VisitRecorder(recordingOrder, qualifies);
  }

  beforeEach(() => {
    promotionFixtures = makePromotionFixtures();
    order = makeOrderViewFixture();
    memberReads = [];
    recordingOrder = makeReadRecordingOrderView(order, memberReads);
    repository = new RecordingPromotionRepository(promotionFixtures.promotionRewards);
    subject = new TwoPassRewardIterator(repository);
    recorder = new VisitRecorder(recordingOrder);
  });
  describe('the shipped surface, confirmed before anything is asserted about behaviour', () => {
    it('exposes one class taking exactly one collaborator', () => {
      expect(typeof TwoPassRewardIterator).toBe('function');
      // One constructor parameter: the promotion port.
      expect(TwoPassRewardIterator.length).toBe(1);
      expect(subject).toBeInstanceOf(TwoPassRewardIterator);
    });

    it('exposes one method, `iterate`, taking the order view and the visitor', () => {
      expect(typeof subject.iterate).toBe('function');
      expect(TwoPassRewardIterator.prototype.iterate.length).toBe(2);
    });

    it('answers a promise, because L165 reaches persistence and nothing else here is async', async () => {
      const pending = subject.iterate(recordingOrder, recorder.synchronousVisitor);

      expect(pending).toBeInstanceOf(Promise);

      await pending;
    });

    it('answers a result carrying exactly one member', async () => {
      const result: TwoPassRewardIterationResult = await subject.iterate(
        recordingOrder,
        recorder.synchronousVisitor,
      );

      // `toStrictEqual` on the key list, so an unexpected extra member fails.
      expect(Object.keys(result)).toStrictEqual(['lastProcessedRewardID']);
    });

    it('accepts a synchronous visitor and an asynchronous one, and answers the same result', async () => {
      // The shipped `RewardVisitor` return type is a union of a promise and a plain value, so both
      // shapes are exercised rather than one being assumed.
      const synchronousResult: TwoPassRewardIterationResult = await subject.iterate(
        recordingOrder,
        recorder.synchronousVisitor,
      );

      const asynchronousRun = subjectOver(promotionFixtures.promotionRewards);
      const asynchronousRecorder = new VisitRecorder(recordingOrder);
      const asynchronousResult: TwoPassRewardIterationResult =
        await asynchronousRun.subject.iterate(
          recordingOrder,
          asynchronousRecorder.asynchronousVisitor,
        );

      expect(asynchronousResult).toStrictEqual(synchronousResult);
      expect(asynchronousRecorder.visits).toStrictEqual(recorder.visits);
    });
  });
  describe('L165 - the reward fetch, reached once per iteration and never once per pass', () => {
    it('reaches the port exactly once even though the collection is traversed twice', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // The fetch sits before the traversal, so two passes still mean one query.
      expect(repository.activeRewardQueries.length).toBe(1);
      expect(recorder.visits.length).toBe(promotionFixtures.promotionRewards.length * 2);
    });

    it('passes the three L165 argument values exactly, `qualificationRequired` explicitly true', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      expect(repository.activeRewardQueries).toStrictEqual([
        {
          rewardTypeList: L165_REWARD_TYPE_LIST,
          promotionCodeList: order.promotionCodeList,
          qualificationRequired: L165_QUALIFICATION_REQUIRED,
        },
      ]);
    });

    it('asks for five reward types, in the sequence L165 writes them', () => {
      const requestedRewardTypes: readonly string[] = L165_REWARD_TYPE_LIST.split(',');

      expect(requestedRewardTypes.length).toBe(L165_REWARD_TYPE_COUNT);
      expect(requestedRewardTypes).toStrictEqual([
        'merchandise',
        'subscription',
        'contentAccess',
        'order',
        'fulfillment',
      ]);

      // The same five values the entity's vocabulary comment lists - but in a DIFFERENT sequence:
      // the entity puts `fulfillment` before `order`.
      expect([...promotionFixtures.rewardTypeVocabulary]).toStrictEqual([
        'merchandise',
        'subscription',
        'contentAccess',
        'fulfillment',
        'order',
      ]);
      expect([...requestedRewardTypes].sort()).toStrictEqual(
        [...promotionFixtures.rewardTypeVocabulary].sort(),
      );
    });

    it('states `qualificationRequired` rather than omitting it, keeping the two call shapes apart', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      const [query] = repository.activeRewardQueries;

      expect(query).toBeDefined();
      if (query === undefined) {
        throw new Error('the reward fetch was not recorded, so its shape cannot be asserted.');
      }

      // LEGACY-NOTE [model/service/PromotionService.cfc:L165, L1040]: the flag is present here and
      // absent at L1040.
      expect(query.qualificationRequired).toBe(true);
      expect(query.rewardTypeList).not.toBe(L345_REWARD_TYPE);
    });

    it('preserves the reward order it was handed, in both passes, and imposes none of its own', async () => {
      // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: zero `ORDER BY` in the whole file, so
      // the order below is SUPPLIED rather than discovered.
      const suppliedOrder: readonly PromotionReward[] = [
        promotionFixtures.contentAccessReward,
        promotionFixtures.orderReward,
        promotionFixtures.subscriptionReward,
        promotionFixtures.fulfillmentReward,
      ];
      const suppliedIDs: readonly string[] = suppliedOrder.map((reward: PromotionReward): string =>
        reward.getPromotionRewardID(),
      );

      const run = subjectOver(suppliedOrder);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      expect(runRecorder.passOneRewardIDs()).toStrictEqual(suppliedIDs);
      expect(runRecorder.passTwoRewardIDs()).toStrictEqual(suppliedIDs);
    });
  });
  describe('exactly two passes, never three - the count proof rather than the comment', () => {
    it('visits every reward exactly twice for the default three-reward collection', async () => {
      const rewardCount: number = promotionFixtures.promotionRewards.length;

      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // [model/service/PromotionService.cfc:L458] is compound -
      // `!orderRewards and pr == arrayLen(promotionRewards)` - and
      // [model/service/PromotionService.cfc:L460] sets `orderRewards = true` inside the body it
      // guards.
      expect(rewardCount).toBe(3);
      expect(recorder.visits.length).toBe(2 * rewardCount);
      expect(recorder.visits.length).not.toBe(3 * rewardCount);
    });

    it.each([1, 2, 4, 5])(
      'visits every reward exactly twice for a collection of %i',
      async (rewardCount: number) => {
        const supplied: readonly PromotionReward[] = [
          promotionFixtures.merchandiseReward,
          promotionFixtures.subscriptionReward,
          promotionFixtures.contentAccessReward,
          promotionFixtures.fulfillmentReward,
          promotionFixtures.orderReward,
        ].slice(0, rewardCount);

        expect(supplied.length).toBe(rewardCount);

        const run = subjectOver(supplied);
        const runRecorder = new VisitRecorder(recordingOrder);

        await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

        expect(runRecorder.visits.length).toBe(2 * rewardCount);
      },
    );

    it('groups those visits into exactly two runs of the pass flag', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // The count says how MANY visits happened; this says how THEY were GROUPED. Two runs means
      // one uninterrupted pass with the flag false followed by one with it true.
      expect(countFlagRuns(recorder.flagSequence())).toBe(2);
    });

    it('reports the whole flag sequence as all-false then all-true, not merely at the ends', async () => {
      const rewardCount: number = promotionFixtures.promotionRewards.length;

      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      const expectedFlags: readonly boolean[] = [
        ...Array.from({ length: rewardCount }, (): boolean => false),
        ...Array.from({ length: rewardCount }, (): boolean => true),
      ];

      expect(recorder.flagSequence()).toStrictEqual(expectedFlags);
    });
  });
  describe('pass two is a complete re-traversal of the same collection in the same order', () => {
    it('re-visits every element, matching pass one element for element', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // CFML parity [model/service/PromotionService.cfc:L459]: `pr = 0` relies on the loop's own
      // `pr++` firing immediately afterwards, so `pr` becomes `1` - the FIRST element of a 1-based
      // CFML array.
      const passOne: readonly string[] = recorder.passOneRewardIDs();
      const passTwo: readonly string[] = recorder.passTwoRewardIDs();

      expect(passOne).toStrictEqual(
        promotionFixtures.promotionRewards.map((reward: PromotionReward): string =>
          reward.getPromotionRewardID(),
        ),
      );
      expect(passTwo).toStrictEqual(passOne);
    });

    it('re-visits the first element too, so the second pass is not a continuation', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      const passTwo: readonly string[] = recorder.passTwoRewardIDs();
      const firstPassTwoRewardID: string | undefined = passTwo[0];
      const firstSuppliedReward: PromotionReward | undefined =
        promotionFixtures.promotionRewards[0];

      expect(firstPassTwoRewardID).toBeDefined();
      expect(firstSuppliedReward).toBeDefined();
      if (firstPassTwoRewardID === undefined || firstSuppliedReward === undefined) {
        throw new Error(
          'pass two recorded no first visit, so the re-traversal cannot be asserted.',
        );
      }

      expect(firstPassTwoRewardID).toBe(firstSuppliedReward.getPromotionRewardID());
    });
  });
  describe('all three arms are gated on the pass flag, so the passes differ in reachability', () => {
    it('hands the flag false to every pass-one visit and true to every pass-two visit', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      const passOneFlags: readonly boolean[] = recorder.visits
        .slice(0, promotionFixtures.promotionRewards.length)
        .map((visit: RecordedVisit): boolean => visit.isOrderRewardsPass);
      const passTwoFlags: readonly boolean[] = recorder.visits
        .slice(promotionFixtures.promotionRewards.length)
        .map((visit: RecordedVisit): boolean => visit.isOrderRewardsPass);

      expect(passOneFlags.every((flag: boolean): boolean => flag === false)).toBe(true);
      expect(passTwoFlags.every((flag: boolean): boolean => flag === true)).toBe(true);
    });

    it('routes the four pass-one reward types only while the flag is false', async () => {
      const supplied: readonly PromotionReward[] = [
        promotionFixtures.merchandiseReward,
        promotionFixtures.subscriptionReward,
        promotionFixtures.contentAccessReward,
        promotionFixtures.fulfillmentReward,
      ];

      const run = subjectOver(supplied);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      // L200 matches the first three through `listFindNoCase`; L345 matches `fulfillment` through
      // a SEPARATE `eq` test.
      expect([...promotionFixtures.passOneRewardTypes]).toStrictEqual([
        'merchandise',
        'subscription',
        'contentAccess',
        'fulfillment',
      ]);
      expect(runRecorder.armSequence()).toStrictEqual([
        'orderItem',
        'orderItem',
        'orderItem',
        'fulfillment',
        // Pass two: every one of them is visited again, and none takes an arm, because L200 and
        // L345 both guard on `!orderRewards`.
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    });

    it('routes the one pass-two reward type only while the flag is true', async () => {
      const run = subjectOver([promotionFixtures.orderReward]);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      expect(promotionFixtures.passTwoRewardType).toBe(L415_REWARD_TYPE);
      // Visited twice; the arm is reachable only on the second visit, because L415 guards on
      // `orderRewards`.
      expect(runRecorder.armSequence()).toStrictEqual([undefined, 'order']);
    });

    it('visits an order-type reward during pass one and gives it no branch there', async () => {
      const run = subjectOver([promotionFixtures.orderReward, promotionFixtures.merchandiseReward]);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      const passOneVisits: readonly RecordedVisit[] = runRecorder.visits.filter(
        (visit: RecordedVisit): boolean => !visit.isOrderRewardsPass,
      );
      const orderRewardPassOneVisit: RecordedVisit | undefined = passOneVisits.find(
        (visit: RecordedVisit): boolean =>
          visit.rewardID === promotionFixtures.orderReward.getPromotionRewardID(),
      );

      // Both halves are asserted: the visit HAPPENS, and no arm is selected for it.
      expect(orderRewardPassOneVisit).toBeDefined();
      if (orderRewardPassOneVisit === undefined) {
        throw new Error('the order reward was never visited during pass one.');
      }

      expect(orderRewardPassOneVisit.isOrderRewardsPass).toBe(false);
      expect(orderRewardPassOneVisit.arm).toBeUndefined();
      // And no order-level read was produced during pass one either.
      expect(runRecorder.orderArmReads.length).toBe(1);
    });

    it('visits item and fulfillment rewards during pass two and gives them no branch there', async () => {
      const run = subjectOver([
        promotionFixtures.merchandiseReward,
        promotionFixtures.fulfillmentReward,
      ]);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      const passTwoVisits: readonly RecordedVisit[] = runRecorder.visits.filter(
        (visit: RecordedVisit): boolean => visit.isOrderRewardsPass,
      );

      expect(passTwoVisits.length).toBe(2);
      expect(passTwoVisits.every((visit: RecordedVisit): boolean => visit.arm === undefined)).toBe(
        true,
      );
      // Pass two RAN and matched nothing, which is a different outcome from pass two never running
      // the edge-outcome cases below separate the two.
      expect(runRecorder.orderArmReads.length).toBe(0);
    });

    it('visits a reward whose type matches nothing twice, and gives it no branch in either pass', async () => {
      // There is no FINAL `else` at [model/service/PromotionService.cfc:L454], so an unrecognised
      // reward type is simply not routed.
      const unrecognisedGraph = makePromotionFixtures({
        idPrefix: 'unrecognised-',
        rewardType: 'storeCredit',
      });
      const unrecognisedReward: PromotionReward = unrecognisedGraph.merchandiseReward;

      expect(unrecognisedReward.getRewardType()).toBe('storeCredit');

      const run = subjectOver([unrecognisedReward]);
      const runRecorder = new VisitRecorder(recordingOrder);

      const result: TwoPassRewardIterationResult = await run.subject.iterate(
        recordingOrder,
        runRecorder.synchronousVisitor,
      );

      expect(runRecorder.visits.length).toBe(2);
      expect(runRecorder.armSequence()).toStrictEqual([undefined, undefined]);
      expect(runRecorder.flagSequence()).toStrictEqual([false, true]);
      // It still counts as processed, so it still authorises pass two and still leaks its own
      // identifier - routing and processing are separate questions.
      expect(result).toStrictEqual({
        lastProcessedRewardID: unrecognisedReward.getPromotionRewardID(),
      });
    });

    it('visits a reward with no recorded type twice, and gives it no branch in either pass', async () => {
      const absentTypeGraph = makePromotionFixtures({
        idPrefix: 'absent-type-',
        rewardType: undefined,
      });
      const absentTypeReward: PromotionReward = absentTypeGraph.merchandiseReward;

      expect(absentTypeReward.getRewardType()).toBeUndefined();

      const run = subjectOver([absentTypeReward]);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      expect(runRecorder.visits.length).toBe(2);
      expect(runRecorder.armSequence()).toStrictEqual([undefined, undefined]);
    });

    it('matches a mixed-case reward type, because both legacy sites compare without case', async () => {
      // CFML parity [model/service/PromotionService.cfc:L200]: `listFindNoCase` is
      // case-insensitive by name, and CFML `eq` at L345 and L415 ignores case too - while
      // TypeScript string comparison is case-SENSITIVE.
      const mixedCaseReward: PromotionReward = promotionFixtures.mixedCaseRewardTypeReward;

      expect(mixedCaseReward.getRewardType()).toBe('Merchandise');
      expect([...promotionFixtures.rewardTypeVocabulary]).not.toContain('Merchandise');

      const run = subjectOver([mixedCaseReward]);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      expect(runRecorder.armSequence()).toStrictEqual(['orderItem', undefined]);
    });

    it('agrees with the published dispatch map on which pass each reward type belongs to', async () => {
      const supplied: readonly PromotionReward[] = [
        promotionFixtures.merchandiseReward,
        promotionFixtures.subscriptionReward,
        promotionFixtures.contentAccessReward,
        promotionFixtures.fulfillmentReward,
        promotionFixtures.orderReward,
      ];

      const run = subjectOver(supplied);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      // For each mapped reward type, the pass in which an arm was selected must be the pass the
      // map names - so the two-pass mechanism and the documented routing cannot drift apart.
      const routedPassByRewardType = new Map<string, readonly boolean[]>();
      for (const visit of runRecorder.visits) {
        if (visit.arm === undefined || visit.rewardType === undefined) {
          continue;
        }
        const routedFlags: readonly boolean[] = routedPassByRewardType.get(visit.rewardType) ?? [];
        routedPassByRewardType.set(visit.rewardType, [...routedFlags, visit.isOrderRewardsPass]);
      }

      expect(promotionFixtures.rewardTypeDispatchMap.length).toBe(L165_REWARD_TYPE_COUNT);
      for (const mapping of promotionFixtures.rewardTypeDispatchMap) {
        const routedFlags: readonly boolean[] | undefined = routedPassByRewardType.get(
          mapping.rewardType,
        );

        expect(routedFlags).toBeDefined();
        if (routedFlags === undefined) {
          throw new Error(
            `reward type ${mapping.rewardType} was never routed, so its pass cannot be asserted.`,
          );
        }

        // Routed in exactly one of the two passes, and it is the one the map names.
        expect(routedFlags).toStrictEqual([mapping.pass === 'two']);
      }
    });
  });
  describe('exactly two edge outcomes suppress pass two, and there is no third', () => {
    // Both arise from the same structural fact: the reset at
    // [model/service/PromotionService.cfc:L458-L461] sits INSIDE the loop body and INSIDE the L197
    // qualification gate.

    it('OUTCOME 1 - an empty collection means the loop body never runs, so pass two never runs', async () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L167, L458-L461]: with
      // `arrayLen(promotionRewards) == 0` the L167 body never executes, so the L458 condition is
      // never evaluated and no reset can occur.
      const emptyOrdering = promotionFixtures.rewardOrderings.find(
        (candidate): boolean => candidate.name === 'empty',
      );

      expect(emptyOrdering).toBeDefined();
      if (emptyOrdering === undefined) {
        throw new Error('the fixture supplies no explicit empty reward ordering.');
      }

      expect(emptyOrdering.rewards.length).toBe(0);
      expect(emptyOrdering.reachesPassTwo).toBe(false);

      const run = subjectOver(emptyOrdering.rewards);
      const runRecorder = new VisitRecorder(recordingOrder);

      const result: TwoPassRewardIterationResult = await run.subject.iterate(
        recordingOrder,
        runRecorder.synchronousVisitor,
      );

      expect(runRecorder.visits.length).toBe(0);
      expect(runRecorder.flagSequence()).toStrictEqual([]);
      expect(runRecorder.orderArmReads.length).toBe(0);
      expect(countFlagRuns(runRecorder.flagSequence())).toBe(0);
      expect(result).toStrictEqual({ lastProcessedRewardID: NO_REWARD_PROCESSED_ID });
      // The fetch still happened - it precedes the traversal.
      expect(run.repository.activeRewardQueries.length).toBe(1);
    });

    it('OUTCOME 2 - a non-qualifying LAST reward suppresses the entire pass, though pass one completed', async () => {
      // The reset sits inside the L197 gate, so if the FINAL element's period fails qualification
      // control never reaches L458.
      const supplied: readonly PromotionReward[] = [
        promotionFixtures.merchandiseReward,
        promotionFixtures.fulfillmentReward,
        promotionFixtures.orderReward,
      ];
      const lastRewardID: string = promotionFixtures.orderReward.getPromotionRewardID();

      const run = subjectOver(supplied);
      const runRecorder = recorderWith(
        (reward: PromotionReward): boolean => reward.getPromotionRewardID() !== lastRewardID,
      );

      const result: TwoPassRewardIterationResult = await run.subject.iterate(
        recordingOrder,
        runRecorder.synchronousVisitor,
      );

      // Pass one ran to completion - all three rewards were visited.
      expect(runRecorder.passOneRewardIDs()).toStrictEqual(
        supplied.map((reward: PromotionReward): string => reward.getPromotionRewardID()),
      );
      // And pass two never happened at all.
      expect(runRecorder.passTwoRewardIDs()).toStrictEqual([]);
      expect(runRecorder.visits.length).toBe(supplied.length);
      expect(countFlagRuns(runRecorder.flagSequence())).toBe(1);
      expect(runRecorder.orderArmReads.length).toBe(0);
      // The identifier is still surfaced, because L169 binds before the L197 gate is reached.
      expect(result).toStrictEqual({ lastProcessedRewardID: lastRewardID });
    });

    it('a non-qualifying MIDDLE reward does not suppress pass two, so suppression is specific to the last', async () => {
      const supplied: readonly PromotionReward[] = [
        promotionFixtures.merchandiseReward,
        promotionFixtures.fulfillmentReward,
        promotionFixtures.orderReward,
      ];
      const middleRewardID: string = promotionFixtures.fulfillmentReward.getPromotionRewardID();

      const run = subjectOver(supplied);
      const runRecorder = recorderWith(
        (reward: PromotionReward): boolean => reward.getPromotionRewardID() !== middleRewardID,
      );

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      expect(runRecorder.passOneRewardIDs()).toStrictEqual(
        supplied.map((reward: PromotionReward): string => reward.getPromotionRewardID()),
      );
      // Pass two does run: the gate the reset sits inside is the LAST element's, and that one met.
      expect(runRecorder.passTwoRewardIDs()).toStrictEqual(
        supplied.map((reward: PromotionReward): string => reward.getPromotionRewardID()),
      );
      expect(runRecorder.visits.length).toBe(2 * supplied.length);
      expect(countFlagRuns(runRecorder.flagSequence())).toBe(2);
    });

    it('a collection in which NO reward qualifies also runs pass one only', async () => {
      const run = subjectOver(promotionFixtures.promotionRewards);
      const runRecorder = recorderWith((): boolean => false);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      // Not a third outcome - the same OUTCOME 2, reached because the last element is among those
      // that failed. Recorded here so the boundary between the two outcomes stays visible.
      expect(runRecorder.visits.length).toBe(promotionFixtures.promotionRewards.length);
      expect(runRecorder.passTwoRewardIDs()).toStrictEqual([]);
    });

    it('a single-element collection collapses into the same two outcomes and adds no third', async () => {
      const qualifyingRun = subjectOver([promotionFixtures.orderReward]);
      const qualifyingRecorder = new VisitRecorder(recordingOrder);

      await qualifyingRun.subject.iterate(recordingOrder, qualifyingRecorder.synchronousVisitor);

      // Its own gate is the last element's gate, so it authorises pass two by itself.
      expect(qualifyingRecorder.visits.length).toBe(2);
      expect(countFlagRuns(qualifyingRecorder.flagSequence())).toBe(2);

      const failingRun = subjectOver([promotionFixtures.orderReward]);
      const failingRecorder = recorderWith((): boolean => false);

      await failingRun.subject.iterate(recordingOrder, failingRecorder.synchronousVisitor);

      expect(failingRecorder.visits.length).toBe(1);
      expect(countFlagRuns(failingRecorder.flagSequence())).toBe(1);
    });

    it('reports the pass-two reachability the fixture publishes for every named ordering', async () => {
      for (const ordering of promotionFixtures.rewardOrderings) {
        const run = subjectOver(ordering.rewards);
        const runRecorder = new VisitRecorder(recordingOrder);

        await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

        const passTwoRan: boolean = runRecorder.passTwoRewardIDs().length > 0;

        expect(passTwoRan).toBe(ordering.reachesPassTwo);
        expect(runRecorder.visits.length).toBe(
          ordering.reachesPassTwo ? 2 * ordering.rewards.length : ordering.rewards.length,
        );
      }
    });
  });
  describe('the pass-two order arm reads state that only pass one can have produced', () => {
    // These cases assert the SEQUENCING GUARANTEE the subject provides and the two values the arm
    // reads off the order view.

    it('reaches the order arm only after every pass-one visit has finished', async () => {
      const rewardCount: number = promotionFixtures.promotionRewards.length;

      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      expect(recorder.orderArmReads.length).toBe(1);

      const [orderArmRead] = recorder.orderArmReads;

      expect(orderArmRead).toBeDefined();
      if (orderArmRead === undefined) {
        throw new Error('the order arm was never reached, so its reads cannot be asserted.');
      }

      // An index at or beyond the collection length can only be a pass-two visit.
      expect(orderArmRead.visitIndex).toBeGreaterThanOrEqual(rewardCount);
      expect(recorder.visits.length).toBe(2 * rewardCount);
    });

    it('reads the POST-ITEM-DISCOUNT subtotal, which is not the plain subtotal', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      const [orderArmRead] = recorder.orderArmReads;

      expect(orderArmRead).toBeDefined();
      if (orderArmRead === undefined) {
        throw new Error('the order arm was never reached, so its reads cannot be asserted.');
      }

      // The distinction is the whole point of the ordering: `subtotal` is the pre-discount figure
      // and `subtotalAfterItemDiscounts` is the one L417 reads.
      expect(orderArmRead.subtotalAfterItemDiscounts).toBe(
        order.subtotalAfterItemDiscounts.toFixed2(),
      );
      expect(orderArmRead.subtotalAfterItemDiscounts).toBe('117.95');
      expect(order.subtotal.toFixed2()).toBe('129.95');
      expect(orderArmRead.subtotalAfterItemDiscounts).not.toBe(order.subtotal.toFixed2());
    });

    it('sums BOTH L417 operands through Money, so neither one alone is the total', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      const [orderArmRead] = recorder.orderArmReads;

      expect(orderArmRead).toBeDefined();
      if (orderArmRead === undefined) {
        throw new Error('the order arm was never reached, so its reads cannot be asserted.');
      }

      // LEGACY-NOTE [model/service/PromotionService.cfc:L417]: the legacy statement is
      // `getSubtotalAfterItemDiscounts() + getFulfillmentChargeAfterDiscountTotal()` - a plain `+`
      // with no `precisionEvaluate`, and the only addition site of its kind in the in-scope slice.
      const expectedTotal: Money = Money.fromDecimalString('117.95').plus(
        Money.fromDecimalString('9.50'),
      );

      expect(orderArmRead.fulfillmentChargeAfterDiscountTotal).toBe(
        order.fulfillmentChargeAfterDiscountTotal.toFixed2(),
      );
      expect(orderArmRead.fulfillmentChargeAfterDiscountTotal).toBe('9.50');
      expect(orderArmRead.totalDiscountableAmount).toBe(expectedTotal.toFixed2());
      expect(orderArmRead.totalDiscountableAmount).toBe('127.45');
      // Both operands genuinely participate - the total is neither of them.
      expect(orderArmRead.totalDiscountableAmount).not.toBe(
        orderArmRead.subtotalAfterItemDiscounts,
      );
      expect(orderArmRead.totalDiscountableAmount).not.toBe(
        orderArmRead.fulfillmentChargeAfterDiscountTotal,
      );
      // And the sum agrees with the order view's own two members, computed independently.
      expect(
        order.subtotalAfterItemDiscounts
          .plus(order.fulfillmentChargeAfterDiscountTotal)
          .equals(expectedTotal),
      ).toBe(true);
    });

    it('computes the order reward with quantity exactly 1', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      const [orderArmRead] = recorder.orderArmReads;

      expect(orderArmRead).toBeDefined();
      if (orderArmRead === undefined) {
        throw new Error('the order arm was never reached, so its reads cannot be asserted.');
      }

      // [model/service/PromotionService.cfc:L419]
      // `getDiscountAmount(reward, totalDiscountableAmount, 1)`. Never the order's item count,
      // never its total sale quantity.
      expect(orderArmRead.quantity).toBe(1);
      expect(orderArmRead.quantity).toBe(L419_ORDER_REWARD_QUANTITY);
      expect(order.totalSaleQuantity).toBe(9);
      expect(orderArmRead.quantity).not.toBe(order.totalSaleQuantity);
      expect(orderArmRead.quantity).not.toBe(order.orderItems.length);
    });

    it('produces no order-arm read at all when pass two never runs', async () => {
      const lastRewardID: string = promotionFixtures.orderReward.getPromotionRewardID();
      const run = subjectOver(promotionFixtures.promotionRewards);
      const runRecorder = recorderWith(
        (reward: PromotionReward): boolean => reward.getPromotionRewardID() !== lastRewardID,
      );

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      expect(runRecorder.orderArmReads).toStrictEqual([]);
    });
  });
  describe('the leaked last-processed reward identifier - the iteration\u2019s second job', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L169, L465, L468-L521]:
    // `var reward = promotionRewards[pr];` is bound inside the loop but, CFML function scope
    // having no block scoping, it SURVIVES the loop's close at L465.

    it('surfaces the identifier as a plain string, present even when nothing was processed', async () => {
      const populatedResult: TwoPassRewardIterationResult = await subject.iterate(
        recordingOrder,
        recorder.synchronousVisitor,
      );

      expect(typeof populatedResult.lastProcessedRewardID).toBe('string');

      const emptyRun = subjectOver([]);
      const emptyRecorder = new VisitRecorder(recordingOrder);
      const emptyResult: TwoPassRewardIterationResult = await emptyRun.subject.iterate(
        recordingOrder,
        emptyRecorder.synchronousVisitor,
      );

      // Not optional and not nullable: the key is present in both cases, and its type is `string`
      // in both.
      expect(typeof emptyResult.lastProcessedRewardID).toBe('string');
      expect(Object.keys(emptyResult)).toStrictEqual(['lastProcessedRewardID']);
      expect(emptyResult.lastProcessedRewardID).toBe(NO_REWARD_PROCESSED_ID);
    });

    it('names the final element after a two-pass iteration', async () => {
      const supplied: readonly PromotionReward[] = [
        promotionFixtures.merchandiseReward,
        promotionFixtures.fulfillmentReward,
        promotionFixtures.orderReward,
      ];
      const run = subjectOver(supplied);
      const runRecorder = new VisitRecorder(recordingOrder);

      const result: TwoPassRewardIterationResult = await run.subject.iterate(
        recordingOrder,
        runRecorder.synchronousVisitor,
      );

      // Pass two re-traverses the whole collection, so the binding that survives is the final
      // element as pass two saw it - the same element pass one ended on.
      expect(result).toStrictEqual({
        lastProcessedRewardID: promotionFixtures.orderReward.getPromotionRewardID(),
      });
      expect(runRecorder.visits.length).toBe(2 * supplied.length);
    });

    it('names the final element after a suppressed pass two as well', async () => {
      const supplied: readonly PromotionReward[] = [
        promotionFixtures.merchandiseReward,
        promotionFixtures.orderReward,
      ];
      const lastRewardID: string = promotionFixtures.orderReward.getPromotionRewardID();
      const run = subjectOver(supplied);
      const runRecorder = recorderWith(
        (reward: PromotionReward): boolean => reward.getPromotionRewardID() !== lastRewardID,
      );

      const result: TwoPassRewardIterationResult = await run.subject.iterate(
        recordingOrder,
        runRecorder.synchronousVisitor,
      );

      // L169 binds before the L197 gate is evaluated, so a reward that fails qualification has
      // still been processed for the purpose of the leak. That asymmetry is the legacy behaviour.
      expect(result).toStrictEqual({ lastProcessedRewardID: lastRewardID });
      expect(runRecorder.passTwoRewardIDs()).toStrictEqual([]);
    });

    it('names whichever element the supplied order puts last, not a fixed reward', async () => {
      const reversed: readonly PromotionReward[] = [
        promotionFixtures.orderReward,
        promotionFixtures.fulfillmentReward,
        promotionFixtures.merchandiseReward,
      ];
      const run = subjectOver(reversed);
      const runRecorder = new VisitRecorder(recordingOrder);

      const result: TwoPassRewardIterationResult = await run.subject.iterate(
        recordingOrder,
        runRecorder.synchronousVisitor,
      );

      // Which reward is "last" is a property of the SUPPLIED order, and the supplied order is the
      // engine's own unspecified one - see the zero-`ORDER BY` note.
      expect(result).toStrictEqual({
        lastProcessedRewardID: promotionFixtures.merchandiseReward.getPromotionRewardID(),
      });
    });

    it('names a single reward when the collection holds one', async () => {
      const run = subjectOver([promotionFixtures.subscriptionReward]);
      const runRecorder = new VisitRecorder(recordingOrder);

      const result: TwoPassRewardIterationResult = await run.subject.iterate(
        recordingOrder,
        runRecorder.synchronousVisitor,
      );

      expect(result).toStrictEqual({
        lastProcessedRewardID: promotionFixtures.subscriptionReward.getPromotionRewardID(),
      });
    });

    it('THE SAFETY PROOF - an identifier is present exactly when a reward was processed', async () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L172-L189, L197]: the reward-usage ledger
      // seed sits before the L197 gate, so it runs for every reward the traversal encounters,
      // qualified or not.

      // Direction 1: nothing processed => nothing for the stripping block to iterate, and the
      // identifier is the empty string that will never be read.
      const emptyRun = subjectOver([]);
      const emptyRecorder = new VisitRecorder(recordingOrder);
      const emptyResult: TwoPassRewardIterationResult = await emptyRun.subject.iterate(
        recordingOrder,
        emptyRecorder.synchronousVisitor,
      );

      expect(emptyRecorder.visits.length).toBe(0);
      expect(emptyResult.lastProcessedRewardID).toBe(NO_REWARD_PROCESSED_ID);
      expect(emptyResult.lastProcessedRewardID.length).toBe(0);

      // Direction 2: at least one reward processed => a non-empty identifier is present, and it is
      // the identifier of a reward that was genuinely visited.
      const populatedRun = subjectOver(promotionFixtures.promotionRewards);
      const populatedRecorder = new VisitRecorder(recordingOrder);
      const populatedResult: TwoPassRewardIterationResult = await populatedRun.subject.iterate(
        recordingOrder,
        populatedRecorder.synchronousVisitor,
      );

      expect(populatedRecorder.visits.length).toBeGreaterThan(0);
      expect(populatedResult.lastProcessedRewardID.length).toBeGreaterThan(0);
      expect(
        populatedRecorder.visits.map((visit: RecordedVisit): string => visit.rewardID),
      ).toContain(populatedResult.lastProcessedRewardID);
    });

    it('holds the biconditional when qualification fails for every reward', async () => {
      // The direction that matters most: a reward can be processed without qualifying, and the
      // identifier is still present, because the seed precedes the gate.
      const run = subjectOver(promotionFixtures.promotionRewards);
      const runRecorder = recorderWith((): boolean => false);

      const result: TwoPassRewardIterationResult = await run.subject.iterate(
        recordingOrder,
        runRecorder.synchronousVisitor,
      );

      expect(runRecorder.visits.length).toBeGreaterThan(0);
      expect(result.lastProcessedRewardID.length).toBeGreaterThan(0);
    });
  });
  describe('dispatch is strictly serial, and both passes are strictly ordered', () => {
    it('completes each visit before beginning the next, with an asynchronous visitor', async () => {
      const run = subjectOver(promotionFixtures.promotionRewards);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.asynchronousVisitor);

      // Structural, not timed: the log must alternate enter/leave for the same reward with no
      // interleaving, which is what awaiting each visit before starting the next produces.
      const expectedLog: readonly string[] = [
        ...promotionFixtures.promotionRewards,
        ...promotionFixtures.promotionRewards,
      ].flatMap((reward: PromotionReward): readonly string[] => [
        `enter:${reward.getPromotionRewardID()}`,
        `leave:${reward.getPromotionRewardID()}`,
      ]);

      expect(runRecorder.dispatchLog).toStrictEqual(expectedLog);
    });

    it('never has two visits open at once', async () => {
      const run = subjectOver(promotionFixtures.promotionRewards);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.asynchronousVisitor);

      let open = 0;
      let highWaterMark = 0;
      for (const entry of runRecorder.dispatchLog) {
        if (entry.startsWith('enter:')) {
          open += 1;
          highWaterMark = Math.max(highWaterMark, open);
        } else {
          open -= 1;
        }
      }

      expect(highWaterMark).toBe(1);
      expect(open).toBe(0);
    });

    it('awaits the visitor before deciding whether pass two is authorised', async () => {
      // The reset condition consumes the gate outcome the visitor reports, so a subject that did
      // not await an asynchronous visitor could not see it.
      const lastRewardID: string = promotionFixtures.orderReward.getPromotionRewardID();
      const run = subjectOver(promotionFixtures.promotionRewards);
      const runRecorder = recorderWith(
        (reward: PromotionReward): boolean => reward.getPromotionRewardID() !== lastRewardID,
      );

      await run.subject.iterate(recordingOrder, runRecorder.asynchronousVisitor);

      expect(runRecorder.passTwoRewardIDs()).toStrictEqual([]);
      expect(runRecorder.visits.length).toBe(promotionFixtures.promotionRewards.length);
    });

    it('finishes the whole of pass one before beginning pass two', async () => {
      const rewardCount: number = promotionFixtures.promotionRewards.length;
      const run = subjectOver(promotionFixtures.promotionRewards);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.asynchronousVisitor);

      // Pass two depends on the output of both of pass one's arms, because L417 sums a value that
      // exists only once ITEM discounts have been applied and one that exists only once
      // FULFILLMENT discounts have been applied.
      const firstPassTwoIndex: number = runRecorder.visits.findIndex(
        (visit: RecordedVisit): boolean => visit.isOrderRewardsPass,
      );

      expect(firstPassTwoIndex).toBe(rewardCount);
      expect(
        runRecorder.visits
          .slice(0, rewardCount)
          .every((visit: RecordedVisit): boolean => !visit.isOrderRewardsPass),
      ).toBe(true);
    });
  });
  describe('per-invocation isolation - no state survives an iteration', () => {
    it('shares no visit state between two successive iterations of the same subject', async () => {
      const firstRecorder = new VisitRecorder(recordingOrder);
      const secondRecorder = new VisitRecorder(recordingOrder);

      const firstResult: TwoPassRewardIterationResult = await subject.iterate(
        recordingOrder,
        firstRecorder.synchronousVisitor,
      );
      const secondResult: TwoPassRewardIterationResult = await subject.iterate(
        recordingOrder,
        secondRecorder.synchronousVisitor,
      );

      // The second iteration's recorded visits are its own: the same count, the same sequence, and
      // no accumulation from the first.
      expect(secondRecorder.visits.length).toBe(firstRecorder.visits.length);
      expect(secondRecorder.visits).toStrictEqual(firstRecorder.visits);
      expect(secondResult).toStrictEqual(firstResult);
      // Two iterations, two fetches - the port is reached once per iteration.
      expect(repository.activeRewardQueries.length).toBe(2);
    });

    it('does not let one iteration\u2019s suppressed pass two affect the next', async () => {
      const lastRewardID: string = promotionFixtures.orderReward.getPromotionRewardID();
      const suppressedRecorder = recorderWith(
        (reward: PromotionReward): boolean => reward.getPromotionRewardID() !== lastRewardID,
      );
      const ordinaryRecorder = new VisitRecorder(recordingOrder);

      await subject.iterate(recordingOrder, suppressedRecorder.synchronousVisitor);
      await subject.iterate(recordingOrder, ordinaryRecorder.synchronousVisitor);

      expect(suppressedRecorder.passTwoRewardIDs()).toStrictEqual([]);
      expect(ordinaryRecorder.passTwoRewardIDs().length).toBe(
        promotionFixtures.promotionRewards.length,
      );
    });

    it('does not let one iteration\u2019s authorised pass two affect a later suppressed one', async () => {
      const lastRewardID: string = promotionFixtures.orderReward.getPromotionRewardID();
      const ordinaryRecorder = new VisitRecorder(recordingOrder);
      const suppressedRecorder = recorderWith(
        (reward: PromotionReward): boolean => reward.getPromotionRewardID() !== lastRewardID,
      );

      await subject.iterate(recordingOrder, ordinaryRecorder.synchronousVisitor);
      await subject.iterate(recordingOrder, suppressedRecorder.synchronousVisitor);

      // The pass flag never survives an iteration, so a previously authorised pass two cannot leak
      // forward into one the gate should have suppressed.
      expect(ordinaryRecorder.passTwoRewardIDs().length).toBe(
        promotionFixtures.promotionRewards.length,
      );
      expect(suppressedRecorder.passTwoRewardIDs()).toStrictEqual([]);
    });

    it('gives two independently constructed subjects independent outcomes', async () => {
      const authorised = subjectOver(promotionFixtures.promotionRewards);
      const authorisedRecorder = new VisitRecorder(recordingOrder);
      const empty = subjectOver([]);
      const emptyRecorder = new VisitRecorder(recordingOrder);

      await authorised.subject.iterate(recordingOrder, authorisedRecorder.synchronousVisitor);
      await empty.subject.iterate(recordingOrder, emptyRecorder.synchronousVisitor);

      expect(authorisedRecorder.visits.length).toBe(2 * promotionFixtures.promotionRewards.length);
      expect(emptyRecorder.visits.length).toBe(0);
      expect(authorised.repository.activeRewardQueries.length).toBe(1);
      expect(empty.repository.activeRewardQueries.length).toBe(1);
    });
  });
  describe('the boundary this iteration does not cross', () => {
    it('reads exactly one of the order view\u2019s twelve members, and it is the promotion-code list', async () => {
      // The recorder reads from the RAW fixture order here, so `memberReads` captures the
      // SUBJECT's reads alone. Everything the order arm reads is the caller's business, not the
      // iteration's.
      const isolatedRecorder = new VisitRecorder(order);

      await subject.iterate(recordingOrder, isolatedRecorder.synchronousVisitor);

      expect(memberReads).toStrictEqual(['promotionCodeList']);
    });

    it('never reads the price-group state the cross-service ordering constraint turns on', async () => {
      // The discriminator at [model/service/PromotionService.cfc:L241] is
      // `orderItem.getAppliedPriceGroup()`, which lives on the ORDER ITEMS - so a subject that
      // read `orderItems` would be participating in the price-base selection at L241-L252.
      const isolatedRecorder = new VisitRecorder(order);

      await subject.iterate(recordingOrder, isolatedRecorder.synchronousVisitor);

      expect(memberReads).not.toContain('orderItems');
      expect(memberReads).not.toContain('orderFulfillments');
      expect(memberReads).not.toContain('appliedPromotions');
      expect(memberReads).not.toContain('subtotalAfterItemDiscounts');
      expect(memberReads).not.toContain('fulfillmentChargeAfterDiscountTotal');
      // And the fixture really does supply both arms of the L241 discriminator, so the absence
      // above is a genuine choice rather than an empty order making it moot.
      const itemsWithPriceGroup = order.orderItems.filter(
        (item): boolean => item.appliedPriceGroup !== undefined,
      );
      const itemsWithoutPriceGroup = order.orderItems.filter(
        (item): boolean => item.appliedPriceGroup === undefined,
      );

      expect(itemsWithPriceGroup.length).toBeGreaterThan(0);
      expect(itemsWithoutPriceGroup.length).toBeGreaterThan(0);
    });

    it('reaches exactly one member of the promotion port and no other', async () => {
      // The other seven port members raise by name, so this passing at all is the assertion.
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      expect(repository.activeRewardQueries.length).toBe(1);
    });

    it('never mutates the order view it was given', async () => {
      const before: readonly unknown[] = Object.values(order);

      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // The anti-corruption boundary: the order aggregate is an INPUT, never a dependency and
      // never a mutation target. The applied-promotion intents the facade emits are its own
      // business.
      expect(Object.values(order)).toStrictEqual(before);
      expect(Object.isFrozen(order)).toBe(true);
    });

    it('never mutates the reward collection it was handed', async () => {
      const supplied: readonly PromotionReward[] = [
        promotionFixtures.merchandiseReward,
        promotionFixtures.orderReward,
      ];
      const suppliedIDsBefore: readonly string[] = supplied.map((reward: PromotionReward): string =>
        reward.getPromotionRewardID(),
      );

      const run = subjectOver(supplied);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.synchronousVisitor);

      // No append, no delete, no reassignment and no sort - which is what makes capturing the
      // collection length once equivalent to the legacy `arrayLen` re-evaluation at L167 and L458.
      expect(supplied.length).toBe(2);
      expect(
        supplied.map((reward: PromotionReward): string => reward.getPromotionRewardID()),
      ).toStrictEqual(suppliedIDsBefore);
    });
  });
});
