// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning
// `src/services/promotion/twoPassRewardIterator.ts`
//
// The subject is the ported form of the hand-rolled two-pass reward loop that sits inside
// `public void function updateOrderAmountsWithPromotions(required any order)`
// [model/service/PromotionService.cfc:L58]. Four anchors, read verbatim from the source:
//
//   L165        the reward fetch - a KEYWORD call with THREE named arguments
//   L166        `var orderRewards = false;` - the pass flag
//   L167        `for(var pr=1; pr<=arrayLen(promotionRewards); pr++) {` - the traversal
//   L457-L461   the loop-counter reset that manufactures the second pass
//
// with L169 (the binding that leaks), L172-L189 (the ledger seed), L197 (the qualification gate),
// L463 (that gate's close) and L465 (the loop's close) as load-bearing context.
//
// THIS SUITE OWNS ORDER-DEPENDENCE VECTOR 2 - the two-pass loop - AND NO NUMBERED DEFECT FROM THE
// REGISTER. Pass ordering decides which state each reward sees, so it sits squarely inside
// must-preserve area #1: promotion discount math TOGETHER WITH use-limit enforcement. Running pass
// two where the legacy would not, or skipping it where the legacy would run it, changes the amount
// a customer is charged.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and saying so is a requirement rather than a
// courtesy: presenting net-new coverage as parity fails the traceability gate. Verified while this
// suite was authored:
//
//   * `meta/tests/unit/service/` holds exactly four components - `AccountServiceTest.cfc`,
//     `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc` - none of
//     them in scope.
//   * `grep -rli 'promotion' meta/tests/` returns ZERO files. No legacy test anywhere in the tree
//     so much as mentions a promotion.
//
// Across the whole migration only `tests/unit/domain/entities/brand.test.ts` and
// `tests/unit/domain/entities/product.test.ts` extend a legacy suite, and
// `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub contributing zero coverage
// to anybody. There is no antecedent for this file and no lineage is claimed for it.
//
// ---------------------------------------------------------------------------
// NO USER-SPECIFIED RULES EXIST, AND THE ABSENCE WAS VERIFIED
// ---------------------------------------------------------------------------
// The project's rules source was queried four independent ways while this suite was authored -
// unpaged, over the full range, over an early range, and at a high offset well past any plausible
// end of document - and returned the identical single-line sentinel every time. It is a fixed
// sentinel and not a truncated read: a genuinely paginated document would answer empty at a high
// offset.
//
// Consequently NO user-specified rule governs this file, no rule is invented to fill the gap, and
// the absence is NOT treated as licence to lower the bar. The enterprise practices this migration
// commits to apply at full strength in their place. The rules source remains the authoritative
// answer should rules ever be added; this note records its result and does not substitute for it.
//
// ---------------------------------------------------------------------------
// INTERFACE PARITY: THIS SUBJECT HOSTS NO LEGACY METHOD NAME
// ---------------------------------------------------------------------------
// None of the frozen legacy identifiers appears in this file. The subject is extracted from INLINE
// CFML - L165 is a local assignment, L166 a local flag, L167 a `for` header and L457-L461 an `if`
// body - so there is no CFML parameter list and no CFML method name to preserve. Its TypeScript
// name is therefore new and descriptive, is not parity-constrained, and the assertions below use
// the SHIPPED name exactly as `src/services/promotion/twoPassRewardIterator.ts` declares it.
// `updateOrderAmountsWithPromotions` stays on the facade and is asserted in
// `../promotionService.test.ts`.
//
// ---------------------------------------------------------------------------
// THE FOUR BUDGET LEDGERS - DISTINCT, NEVER CONFLATED, AND ALL FOUR READ ZERO HERE
// ---------------------------------------------------------------------------
// JUDGMENT CALL: the callback-shaped `iterate` consumes NO signature reshaping. The migration
// permits exactly three - the two anti-corruption inversions, the two smart-list renames
// (`findProducts`, `findSkus`), and the feed adapter's `generateProductFeed` - and this subject is
// a NEW INTERNAL MODULE rather than a reshaped legacy public method, so it spends none of them. A
// fourth reshaping anywhere would be a gate failure, and nothing here is one. Stated explicitly so
// nobody miscounts the ledger by reading a callback parameter as a reshaped signature.
//
//   * Visibility widenings: ZERO consumed here. All five - #1, #3 and #4 in
//     `./promotionPeriodQualification.ts`, #2 in `./qualifierQualification.ts`, #5 in
//     `./discountAmount.ts` - live elsewhere in this folder, and THE LEDGER IS EXHAUSTED.
//   * Signature widenings: ZERO remain. The single one was already spent on
//     `isCurrent(now)` in `src/domain/entities/promotionPeriod.ts`.
//   * Deliberate divergences: ZERO here. THIS SUBJECT MAY NOT DIVERGE IN ANY RESPECT. All three
//     are spent elsewhere - register entries 13 and 12 in `./discountAmount.ts`, register entry 19
//     in `src/domain/entities/product.ts`.
//
// ---------------------------------------------------------------------------
// P4, THE SINGLE ARITHMETIC SURFACE: LARGELY NOT APPLICABLE HERE, AND HERE IS WHY
// ---------------------------------------------------------------------------
// The subject iterates and dispatches. It performs no money arithmetic of its own: the only
// numbers in its range are a collection length and a traversal index, both plain integer counts,
// and it does not import `../../domain/valueObjects/money.js` at all. Where a monetary value is
// referenced below - the L417 sum, which this suite is the owner of the NOTE for - it is expressed
// as `Money` and combined with `Money.plus()`. NO raw floating-point arithmetic appears anywhere
// in this file, including in expected values, and no zero default is substituted for an absent
// amount.
//
// `Money`'s surface is closed, and only its published members are used here: the decimal-string
// factory, `plus()`, `equals()` and `toFixed2()`. No `negate`, `abs`, `min`, `max`, `sum`, `round`,
// `floor`, `ceil`, `percentOf`, `allocate`, `toNumber` or `valueOf` exists to reach for. There is
// no `precisionEvaluate` string-expression evaluator in the target and none is simulated.
//
// ---------------------------------------------------------------------------
// P5, PARAMETERIZED SQL: NOT APPLICABLE HERE, AND HERE IS WHY
// ---------------------------------------------------------------------------
// The subject does reach a repository PORT - that is what makes `iterate` asynchronous - but this
// suite touches no SQL, opens no connection, binds no parameter and imports no database driver.
// The port is satisfied entirely by the hand-written in-memory double below. Every SQL-shape and
// parameter-binding assertion belongs exclusively to `tests/integration/repositories/`, and none
// is duplicated here. Nothing in this file reads the environment, so it passes with a completely
// empty one.
//
// ---------------------------------------------------------------------------
// THE BRANCH TOPOLOGY THIS SUITE MUST NOT REPRODUCE - ALL THREE ARE FACADE-OWNED
// ---------------------------------------------------------------------------
// The subject dispatches; it does not contain the arm bodies. No assertion below concerns what any
// arm body COMPUTES:
//
//   L200-L341   the order-item arm body - the ledger writes, the two opposing insertion sorts and
//               the price-base selection.
//   L345-L412   the fulfillment arm body.
//   L415-L455   the order arm body.
//
// All three belong to `../promotionService.test.ts` and to the sibling mechanics suites. The
// assertions here concern only WHICH rewards are visited, IN WHAT ORDER, WITH WHAT FLAG and HOW
// MANY TIMES. Where the order arm is involved at all, this file asserts the SEQUENCING GUARANTEE
// that makes the arm's reads valid - never the discount it derives from them.
//
// ---------------------------------------------------------------------------
// THE CROSS-SERVICE ORDERING CONSTRAINT, DOCUMENTED HERE
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L241-L252]: the orientation below was verified
// directly against the source, and an older brief has the two arms TRANSPOSED. WHERE A BRIEF AND
// THE SOURCE DISAGREE THE SOURCE WINS. As written:
//
//   THE `if` ARM [L241] - taken when there is NO applied price group OR the reward lists it as an
//   ELIGIBLE one - computes from `orderItem.getPrice()` [L244] with NO CORRECTION TERM.
//
//   THE `else` ARM [L246] computes from `orderItem.getSkuPrice()` [L249] and then applies the
//   L252 correction `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`.
//
// `appliedPriceGroup` is the discriminator, and it is WRITTEN BY THE PRICE-GROUP PASS -
// `updateOrderAmountsWithPriceGroups` sets each item's price at
// [model/service/PriceGroupService.cfc:L370] and its applied price group at [L371]. Therefore:
//
//   `PriceGroupService.updateOrderAmountsWithPriceGroups()`
//   MUST RUN BEFORE
//   `PromotionService.updateOrderAmountsWithPromotions()`.
//
// In the legacy system that held ONLY because the out-of-scope `OrderService` happened to inject
// both services [model/service/OrderService.cfc:L60-L61] and call them in that sequence. In the
// target it is explicit and non-optional, and the two collaborating artifacts are
// `../priceGroupService.ts` and `src/handlers/promotionApplicationHandler.ts`. THE BIDIRECTIONAL
// PROOF - the case asserting that reversing the two passes changes the computed discount - lives
// in `../promotionService.test.ts` and is referenced here rather than duplicated. What this file
// does assert about the constraint is narrower and squarely its own: that the subject reads none
// of the price-group state itself.
//
// ---------------------------------------------------------------------------
// THE L417 PRECISION NOTE - A NOTE, AND NOT A SEVENTH VECTOR
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L417]: the order arm's first statement sums
// `getSubtotalAfterItemDiscounts()` and `getFulfillmentChargeAfterDiscountTotal()` with a PLAIN
// `+` and NO `precisionEvaluate` - the only addition site of its kind in the whole in-scope slice.
// In the target `Money.plus()` closes that gap structurally, which is why the L417 assertion below
// combines the two operands through `Money` rather than through arithmetic on numbers.
//
// KEEP IT DISTINCT FROM `amountOff`'s FLOAT GAP. Register entry 12's raw floating-point
// multiplication at [L998] is a SEPARATE precision defect, owned by `./discountAmount.test.ts` as
// deliberate divergence (b). L417 IS A NOTE HERE. IT IS NOT A DIVERGENCE AND IT CONSUMES NONE.
//
// THE ORDER-DEPENDENCE VECTOR COUNT STAYS AT SIX. L417 is not a seventh. The six are:
//
//   1. the mutable reward-usage ledger threaded through the loop  - `./rewardUsageLedger.ts`
//   2. THE TWO-PASS LOOP - THIS FILE
//   3. the over-use stripping leak (register entry 9)             - `./overUseStripping.ts`
//   4. the two opposing insertion sorts                           - `./rewardUsageLedger.ts`
//   5. the unguarded division at L299                             - `./rewardUsageLedger.ts`
//   6. the L223-L224 maximum-use-per-order ratchet                - a folder-analysis finding
//      beyond the five the plan publishes
//
// ---------------------------------------------------------------------------
// THE ABSENT RESULT ORDERING, AND THE TWO CALL SHAPES
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: `getActivePromotionRewards` imposes NO
// ordering, and THE ABSENCE IS PRESERVED. Verified by census while this suite was authored: a
// case-insensitive search for "order by" across the WHOLE of `model/dao/PromotionDAO.cfc` returns
// ZERO OCCURRENCES. Iteration order is therefore whatever the engine happens to produce, and
// because the traversal threads a mutable ledger through it [model/service/PromotionService.cfc:
// L297] the legacy outcome is genuinely non-deterministic at the boundary of a tie. So: every case
// below SUPPLIES THE REWARD ORDER EXPLICITLY through the repository double, no case claims the
// repository returns rewards in any particular order, and nothing here sorts to compensate. What
// is asserted is only that the subject PRESERVES WHATEVER ORDER IT WAS GIVEN, in both passes.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L165, L1040]: TWO DISTINCT CALL SHAPES reach the
// same DAO method and they must NEVER be normalised into one. L165 - this subject's call - passes
// all three arguments and states `qualificationRequired=true` explicitly. L1040, inside the
// facade's shipping-method-option path, passes `rewardTypeList="fulfillment"` ONLY plus a
// promotion-code list and OMITS `qualificationRequired` entirely, relying on the DAO's own
// `default="false"` [model/dao/PromotionDAO.cfc:L54]. Both branches of that flag are live. This
// file asserts the L165 shape; the L1040 shape belongs to `../promotionService.test.ts` and is
// recorded here purely so the two are never merged.
//
// ---------------------------------------------------------------------------
// NO CONCURRENCY, AND THE CENSUS THAT SETTLES IT
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L167]: `cfthread` usage across the in-scope
// slice is VERIFIED ZERO - a case-insensitive census over `model/service/`, `model/dao/` and
// `model/entity/` returns no occurrence at all. The two passes are strictly ordered and strictly
// sequential, and each reward's visit completes before the next begins. This file therefore
// asserts nothing about concurrency and USES none: no promise-aggregating dispatch over rewards,
// no worker-thread parallelism, no parallel visiting. The serial-dispatch case below proves the
// sequencing structurally, from the recorded order of callback entry and exit, with no timing
// claim of any kind. An iterator is the natural place someone would reach for parallelism, which
// is exactly why the prohibition is recorded here rather than assumed.
//
// The legacy runtime's 60-second, 45-second and 30-second lock timeouts are noted and not
// implemented, and nothing below asserts them. No service-level objective is stated anywhere in
// this file, because the legacy source states none.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The literals the source fixes, each named exactly once
// ---------------------------------------------------------------------------

/**
 * The reward-type list at [model/service/PromotionService.cfc:L165], character for character.
 *
 * FIVE reward types. Note the sequence: `order` precedes `fulfillment` here, whereas the entity's
 * own vocabulary comment [model/entity/PromotionReward.cfc:L49-L56] lists `fulfillment` before
 * `order`. Neither sequence is normalised against the other and neither literal is built from the
 * other - the source writes each one where it writes it.
 */
const L165_REWARD_TYPE_LIST = 'merchandise,subscription,contentAccess,order,fulfillment';

/** How many reward types L165 asks for. Asserted rather than assumed. */
const L165_REWARD_TYPE_COUNT = 5;

/** [model/service/PromotionService.cfc:L165] `qualificationRequired=true`, stated explicitly. */
const L165_QUALIFICATION_REQUIRED = true;

/**
 * The THREE-value list the order-item arm matches against
 * [model/service/PromotionService.cfc:L200], via `listFindNoCase`.
 */
const L200_REWARD_TYPE_LIST = 'merchandise,subscription,contentAccess';

/** [model/service/PromotionService.cfc:L345], matched with CFML `eq`. */
const L345_REWARD_TYPE = 'fulfillment';

/** [model/service/PromotionService.cfc:L415], matched with CFML `eq`. */
const L415_REWARD_TYPE = 'order';

/**
 * [model/service/PromotionService.cfc:L419] `getDiscountAmount(reward, totalDiscountableAmount, 1)`
 * - the order reward is computed with QUANTITY 1, never the order's item count and never its total
 * sale quantity.
 */
const L419_ORDER_REWARD_QUANTITY = 1;

/**
 * The value the subject returns for `lastProcessedRewardID` when nothing was processed.
 *
 * [model/service/PromotionService.cfc:L169] has no counterpart to this: in CFML the `reward`
 * binding simply never comes into existence. The target needs a concrete plain `string`, and the
 * empty one is exactly the case in which the reward-usage ledger is empty too - see the
 * biconditional safety proof below.
 */
const NO_REWARD_PROCESSED_ID = '';

/**
 * The three-value L200 list, split and case-folded once.
 *
 * `src/lib/cfml/list.ts` is deliberately NOT imported: it is not among this suite's declared
 * dependencies, and what is needed here is a plain split of a literal this file owns rather than
 * CFML list semantics applied to engine data.
 */
const L200_REWARD_TYPES: readonly string[] = L200_REWARD_TYPE_LIST.split(',').map(
  (rewardType: string): string => rewardType.toLowerCase(),
);

// ---------------------------------------------------------------------------
// The hand-written in-memory doubles
//
// Every double below is declared IN THIS FILE, is constructed fresh in `beforeEach`, and holds no
// module-level mutable state. No assertion library, no mocking library and no builder library is
// introduced: the thirteen pinned packages are fixed, and `vi` is not needed here because nothing
// is spied on.
// ---------------------------------------------------------------------------

/**
 * Raised by the seven port members the subject must never reach.
 *
 * The strongest available statement that this subject touches exactly ONE repository operation, and
 * it is enforced at run time rather than asserted in prose: the legacy component declares a single
 * DAO collaborator, `promotionDAO` [model/service/PromotionService.cfc:L51], and the block this
 * subject was extracted from reaches exactly one of its methods, at L165.
 */
function unreachedRepositoryMember(member: string): never {
  throw new Error(
    `the repository double's ${member} was reached while iterating promotion rewards. The ` +
      'two-pass iteration block reaches getActivePromotionRewards and nothing else ' +
      '[model/service/PromotionService.cfc:L165], so reaching any other member means the subject ' +
      'has grown a collaboration this suite does not describe.',
  );
}

/** One recorded reward fetch, holding the three argument values exactly as they arrived. */
interface RecordedActiveRewardQuery {
  readonly rewardTypeList: string;
  readonly promotionCodeList: string;
  readonly qualificationRequired: boolean | undefined;
}

/**
 * In-memory stand-in for the one port the shipped constructor takes.
 *
 * Replaces the legacy `property name="promotionDAO" type="any";`
 * [model/service/PromotionService.cfc:L51], which a DI/1 convention scan resolved at run time. Here
 * it is an explicit constructor argument typed to a port INTERFACE, which is transformation rule
 * T1 - and it is why constructing the subject needs nothing but one object.
 *
 * HANDS BACK THE REWARD ORDER IT WAS GIVEN, unsorted and unfiltered. That is the whole point: the
 * DAO imposes no ordering, so each case states its own order and this double must not invent one.
 * A fresh array is returned per call so a case cannot reach the array the subject iterates.
 *
 * NOT `async`, deliberately: the port answers a promise, and returning a resolved one keeps the
 * double free of an `await` it has no work to wait for.
 */
class RecordingPromotionRepository implements PromotionRepository {
  /** Every reward fetch, in call order. One entry per `iterate`, never one per pass. */
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
 * `undefined` means NO ARM MATCHED, which is a first-class outcome rather than an error: L454
 * closes the chain with NO FINAL `else`, so a reward can be visited and take no branch at all.
 */
type RewardArm = 'orderItem' | 'fulfillment' | 'order';

/**
 * SELECTION ONLY - never an arm body.
 *
 * Reproduces the three reward-level guards and nothing behind them:
 *
 *   L200  `if( !orderRewards and listFindNoCase("merchandise,subscription,contentAccess", ...) )`
 *   L345  `} else if (!orderRewards and reward.getRewardType() eq "fulfillment" )`
 *   L415  `} else if (orderRewards and reward.getRewardType() eq "order" )`
 *   L454  closes the chain - NO FINAL `else`
 *
 * This lives in the SUITE rather than in the subject because the subject deliberately owns no arm:
 * it hands each reward and the pass flag to a caller and lets the caller dispatch. Modelling the
 * caller's selection is what makes the pass flag's consequence observable.
 *
 * CFML parity [model/service/PromotionService.cfc:L200, L345, L415]: all three matches are
 * CASE-INSENSITIVE in CFML - `listFindNoCase` by name, and `eq` because CFML string comparison
 * ignores case - while TypeScript comparison is case-SENSITIVE. Both operands are therefore
 * case-folded before comparison, which is the translation decision that keeps a reward whose type
 * is spelled `'Merchandise'` matching the L200 arm exactly as the legacy engine matches it.
 */
function selectRewardArm(
  rewardType: string | undefined,
  isOrderRewardsPass: boolean,
): RewardArm | undefined {
  if (rewardType === undefined) {
    return undefined;
  }

  const foldedRewardType: string = rewardType.toLowerCase();

  // L200. `includes` returns a boolean, so there is no 1-based index or `-1` sentinel to
  // misread - `listFindNoCase` answers a 1-based index or `0`, and `findIndex` answers `-1`, and
  // neither convention is relied on here.
  if (!isOrderRewardsPass && L200_REWARD_TYPES.includes(foldedRewardType)) {
    return 'orderItem';
  }

  // L345.
  if (!isOrderRewardsPass && foldedRewardType === L345_REWARD_TYPE) {
    return 'fulfillment';
  }

  // L415.
  if (isOrderRewardsPass && foldedRewardType === L415_REWARD_TYPE) {
    return 'order';
  }

  // L454 closes the chain and there is no final `else`, so no arm runs.
  return undefined;
}

/** One recorded visit, exactly as the subject handed it over. */
interface RecordedVisit {
  readonly rewardID: string;
  readonly rewardType: string | undefined;
  readonly isOrderRewardsPass: boolean;
  /** Which arm the caller's guards selected, or `undefined` when none matched. */
  readonly arm: RewardArm | undefined;
}

/**
 * What the order arm read off the order view, recorded without computing a discount.
 *
 * [model/service/PromotionService.cfc:L417] and [L419] only. The discount those two values feed is
 * `getDiscountAmount`'s business and is asserted in `./discountAmount.test.ts`.
 */
interface RecordedOrderArmRead {
  /** [L417] first operand - the POST-ITEM-DISCOUNT subtotal, presented to two decimal places. */
  readonly subtotalAfterItemDiscounts: string;
  /** [L417] second operand. */
  readonly fulfillmentChargeAfterDiscountTotal: string;
  /** [L417] the two combined through `Money.plus()`. */
  readonly totalDiscountableAmount: string;
  /** [L419] the third argument to `getDiscountAmount`. Exactly `1`. */
  readonly quantity: number;
  /**
   * Which visit produced this read, zero-based across the whole iteration.
   *
   * Its value is what proves the read happened in the SECOND pass: an index at or beyond the
   * collection length can only have been reached after every pass-one visit finished, which is the
   * ordering the L417 operands depend on.
   */
  readonly visitIndex: number;
}

/** Per-reward qualification, decided by the case rather than computed by the subject. */
type QualificationDecision = (reward: PromotionReward, isOrderRewardsPass: boolean) => boolean;

/** Every reward's period qualifies. The ordinary configuration. */
const everyPeriodQualifies: QualificationDecision = () => true;

/**
 * The caller's side of the collaboration, recorded so the visit sequence can be asserted whole.
 *
 * Supplies TWO callback shapes, because the shipped `RewardVisitor` return type is a union of a
 * promise and a plain value and the subject must handle both:
 *
 *   `synchronousVisitor`  returns a plain {@link RewardVisitOutcome}
 *   `asynchronousVisitor` returns a promise for one
 *
 * Both write into the SAME logs, so a case can swap one for the other and compare outcomes
 * directly. `dispatchLog` records entry and exit separately, which is what lets the serial-dispatch
 * case prove sequencing from structure alone.
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
    // visibly in `dispatchLog`. This is a STRUCTURAL sequencing probe, not a timed one: no clock is
    // read and no duration is asserted.
    await Promise.resolve();
    const outcome: RewardVisitOutcome = this.record(reward, isOrderRewardsPass);
    await Promise.resolve();
    this.dispatchLog.push(`leave:${reward.getPromotionRewardID()}`);

    return outcome;
  };

  /** The rewards visited during pass one, in visit order. */
  passOneRewardIDs(): readonly string[] {
    return this.visits
      .filter((visit: RecordedVisit): boolean => !visit.isOrderRewardsPass)
      .map((visit: RecordedVisit): string => visit.rewardID);
  }

  /** The rewards visited during pass two, in visit order. */
  passTwoRewardIDs(): readonly string[] {
    return this.visits
      .filter((visit: RecordedVisit): boolean => visit.isOrderRewardsPass)
      .map((visit: RecordedVisit): string => visit.rewardID);
  }

  /** The pass flag for every visit, in visit order. */
  flagSequence(): readonly boolean[] {
    return this.visits.map((visit: RecordedVisit): boolean => visit.isOrderRewardsPass);
  }

  /** The arm selected for every visit, in visit order. */
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
        // [L419] the literal third argument. No discount is computed from it here.
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
 * `OrderView` is LOCKED AT TWELVE MEMBERS and is imported rather than redeclared, so this facade
 * enumerates the same twelve and adds nothing. Getters satisfy `readonly` properties, so the
 * wrapper is a structurally exact `OrderView` and the subject cannot tell it apart from the
 * fixture's own.
 *
 * What it buys: proof of what the subject does NOT reach for. The price-group state the
 * cross-service ordering constraint turns on lives on the ORDER ITEMS, so a subject that read
 * `orderItems` would be participating in the price-base selection at L241-L252 - facade territory.
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
 * `1` means a single pass ran, `2` means exactly two, and `3` would mean a third pass exists. This
 * is the structural half of the exactly-two-passes proof: the count assertion says how many visits
 * happened, and this says how they were grouped.
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
  // A2 - REQUEST-SCOPED STATE. Every one of these is rebuilt before every case, and the suite holds
  // no mutable module-level state at all. On a warm container a module-level binding survives
  // between UNRELATED invocations, so reward state parked at module scope could let one customer's
  // discount answer another customer's order - which is why the subject keeps its working state in
  // per-invocation locals and why this suite mirrors that.
  let promotionFixtures: ReturnType<typeof makePromotionFixtures>;
  let order: OrderView;
  let memberReads: string[];
  let recordingOrder: OrderView;
  let repository: RecordingPromotionRepository;
  let subject: TwoPassRewardIterator;
  let recorder: VisitRecorder;

  /**
   * Builds a fresh subject over an EXPLICITLY SUPPLIED reward order.
   *
   * The reward order is a parameter and never a default, because
   * [model/dao/PromotionDAO.cfc:L51-L132] imposes none - see the census note at the head of this
   * file. Every case that varies the collection states its own order through this helper.
   */
  function subjectOver(rewards: readonly PromotionReward[]): {
    readonly subject: TwoPassRewardIterator;
    readonly repository: RecordingPromotionRepository;
  } {
    const freshRepository = new RecordingPromotionRepository(rewards);

    return { subject: new TwoPassRewardIterator(freshRepository), repository: freshRepository };
  }

  /** A recorder over the recording order view, with a per-case qualification decision. */
  function recorderWith(qualifies: QualificationDecision): VisitRecorder {
    return new VisitRecorder(recordingOrder, qualifies);
  }

  beforeEach(() => {
    promotionFixtures = makePromotionFixtures();
    order = makeOrderViewFixture();
    memberReads = [];
    recordingOrder = makeReadRecordingOrderView(order, memberReads);
    // The default ordering, stated rather than assumed: two pass-one rewards then the order reward
    // last, which is the arrangement in which the L458-L461 reset can fire.
    repository = new RecordingPromotionRepository(promotionFixtures.promotionRewards);
    subject = new TwoPassRewardIterator(repository);
    recorder = new VisitRecorder(recordingOrder);
  });

  // -------------------------------------------------------------------------
  describe('the shipped surface, confirmed before anything is asserted about behaviour', () => {
    it('exposes one class taking exactly one collaborator', () => {
      expect(typeof TwoPassRewardIterator).toBe('function');
      // ONE constructor parameter: the promotion port. Transformation rule T1 - an explicit,
      // compile-checked argument in place of the DI/1 convention scan over
      // `property name="promotionDAO";` [model/service/PromotionService.cfc:L51].
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

      // `toStrictEqual` on the key list, so an unexpected extra member fails. The legacy block
      // publishes no pass-two flag, no pass count, no visited count and no collection length, and
      // an invented one would be exactly the kind of state that must not appear.
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

  // -------------------------------------------------------------------------
  describe('L165 - the reward fetch, reached once per iteration and never once per pass', () => {
    it('reaches the port exactly once even though the collection is traversed twice', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // The fetch sits BEFORE the traversal, so two passes still mean one query. A subject that
      // re-fetched for pass two would answer 2 here, and could observe a different collection on
      // the second traversal - which the re-traversal case below would then contradict.
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

      // The SAME five values the entity's vocabulary comment lists - but in a DIFFERENT sequence:
      // the entity puts `fulfillment` before `order`. Neither literal is normalised against the
      // other, and neither is derived from the other.
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

      // LEGACY-NOTE [model/service/PromotionService.cfc:L165, L1040]: the flag is PRESENT here and
      // ABSENT at L1040, where the facade's shipping-method-option path requests
      // `rewardTypeList="fulfillment"` only and leans on the DAO's own `default="false"`
      // [model/dao/PromotionDAO.cfc:L54]. Both branches are live, so the two shapes stay distinct
      // and no shared wrapper normalises them. The L1040 shape belongs to
      // `../promotionService.test.ts`.
      expect(query.qualificationRequired).toBe(true);
      expect(query.rewardTypeList).not.toBe(L345_REWARD_TYPE);
    });

    it('preserves the reward order it was handed, in both passes, and imposes none of its own', async () => {
      // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: zero `ORDER BY` in the whole file, so the
      // order below is SUPPLIED rather than discovered. This case asserts only that the subject
      // hands back what it was given - it makes no claim about what any repository would return.
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

  // -------------------------------------------------------------------------
  describe('exactly two passes, never three - the count proof rather than the comment', () => {
    it('visits every reward exactly twice for the default three-reward collection', async () => {
      const rewardCount: number = promotionFixtures.promotionRewards.length;

      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // [model/service/PromotionService.cfc:L458] is compound - `!orderRewards and pr ==
      // arrayLen(promotionRewards)` - and [L460] sets `orderRewards = true` inside the body it
      // guards. Nothing in the method ever clears the flag, so `!orderRewards` is permanently false
      // afterwards and L458 can never authorise a second reset. AT MOST ONE RESET, THEREFORE
      // EXACTLY TWO PASSES.
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

      // The count says HOW MANY visits happened; this says HOW THEY WERE GROUPED. Two runs means
      // one uninterrupted pass with the flag false followed by one with it true. Three runs would
      // mean a third pass exists, and one run would mean the reset never fired.
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

  // -------------------------------------------------------------------------
  describe('pass two is a complete re-traversal of the same collection in the same order', () => {
    it('re-visits every element, matching pass one element for element', async () => {
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // CFML parity [model/service/PromotionService.cfc:L459]: `pr = 0` relies on the loop's own
      // `pr++` firing immediately afterwards, so `pr` becomes `1` - the FIRST element of a 1-based
      // CFML array. The reset therefore RESTARTS the traversal rather than resuming it, which is
      // what makes the second pass a full walk of the collection with a different flag.
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

  // -------------------------------------------------------------------------
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

      // L200 matches the first three through `listFindNoCase`; L345 matches `fulfillment` through a
      // SEPARATE `eq` test. Two different sites, one pass - so pass one handles FOUR reward types,
      // not the three the comma list names.
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
        // Pass two: every one of them is visited again, and NONE takes an arm, because L200 and L345
        // both guard on `!orderRewards`.
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

      // BOTH halves are asserted: the visit HAPPENS, and NO arm is selected for it.
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
      // - the edge-outcome cases below separate the two.
      expect(runRecorder.orderArmReads.length).toBe(0);
    });

    it('visits a reward whose type matches nothing twice, and gives it no branch in either pass', async () => {
      // There is NO FINAL `else` at [model/service/PromotionService.cfc:L454], so an unrecognised
      // reward type is simply not routed. No exhaustiveness check, no `default` arm and no throw is
      // expected of the subject, and none is added here.
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
      // CFML parity [model/service/PromotionService.cfc:L200]: `listFindNoCase` is case-insensitive
      // by name, and CFML `eq` at L345 and L415 ignores case too - while TypeScript string
      // comparison is case-SENSITIVE. A reward whose type is spelled `'Merchandise'` is therefore a
      // pass-one order-item reward in the legacy engine, and the case-folded comparison is the
      // translation decision that keeps it one here.
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

      // For each mapped reward type, the pass in which an arm was selected must be the pass the map
      // names - so the two-pass mechanism and the documented routing cannot drift apart.
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

        // Routed in exactly ONE of the two passes, and it is the one the map names.
        expect(routedFlags).toStrictEqual([mapping.pass === 'two']);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('exactly two edge outcomes suppress pass two, and there is no third', () => {
    // Both arise from the SAME structural fact: the reset at
    // [model/service/PromotionService.cfc:L458-L461] sits INSIDE the loop body AND INSIDE the L197
    // qualification gate, which closes at L463 while the loop closes at L465. A single-element
    // collection collapses into these two, and no third case exists. Stated explicitly so nobody
    // invents one.

    it('OUTCOME 1 - an empty collection means the loop body never runs, so pass two never runs', async () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L167, L458-L461]: with
      // `arrayLen(promotionRewards) == 0` the L167 body never executes, so the L458 condition is
      // never evaluated and no reset can occur. The target REPRODUCES THAT OUTCOME DELIBERATELY
      // rather than incidentally: a "clean" rewrite that always runs two passes would run an empty
      // second pass here, and a rewrite that always ran the order arm would grant an order-level
      // discount the legacy engine never grants.
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
      // control never reaches L458. The suppression is total: earlier rewards qualified perfectly
      // well and every one of them was still visited.
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
      // Pass two DOES run: the gate the reset sits inside is the LAST element's, and that one met.
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

  // -------------------------------------------------------------------------
  describe('the pass-two order arm reads state that only pass one can have produced', () => {
    // These cases assert the SEQUENCING GUARANTEE the subject provides and the two values the arm
    // reads off the order view. What `getDiscountAmount` then derives from them is
    // `./discountAmount.test.ts`'s subject and is deliberately not computed here.

    it('reaches the order arm only after every pass-one visit has finished', async () => {
      const rewardCount: number = promotionFixtures.promotionRewards.length;

      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      expect(recorder.orderArmReads.length).toBe(1);

      const [orderArmRead] = recorder.orderArmReads;

      expect(orderArmRead).toBeDefined();
      if (orderArmRead === undefined) {
        throw new Error('the order arm was never reached, so its reads cannot be asserted.');
      }

      // An index at or beyond the collection length can only be a pass-two visit. That is what
      // makes `getSubtotalAfterItemDiscounts()` meaningful: the value exists only once the item
      // discounts pass one applies have been applied.
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
      // and `subtotalAfterItemDiscounts` is the one L417 reads. They differ in the golden order, so
      // a subject that handed over the wrong one would fail here rather than pass quietly.
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
      // with NO `precisionEvaluate`, and the only addition site of its kind in the in-scope slice.
      // `Money.plus()` closes that gap structurally. This is a NOTE and not a divergence: it
      // consumes none of the three-divergence budget, and it is a SEPARATE precision gap from
      // register entry 12's raw float multiplication at L998, which `./discountAmount.test.ts`
      // owns as divergence (b).
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

      // [model/service/PromotionService.cfc:L419] `getDiscountAmount(reward,
      // totalDiscountableAmount, 1)`. Never the order's item count, never its total sale quantity.
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

  // -------------------------------------------------------------------------
  describe('the leaked last-processed reward identifier - the iteration\u2019s second job', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L169, L465, L468-L521]: `var reward =
    // promotionRewards[pr];` is bound inside the loop but, CFML function scope having no block
    // scoping, it SURVIVES the loop's close at L465. The over-use stripping block from L468 then
    // reads `promotionRewardUsageDetails[ reward.getPromotionRewardID() ]`, so maximum-use-per-order
    // is enforced against whichever reward happened to be LAST. The target has no leaked function
    // scope, so the identity must travel explicitly - which is why the subject surfaces it and
    // `./overUseStripping.ts` takes it as its required `leakedLastProcessedRewardID` argument. The
    // hand-off is the MECHANISM OF FAITHFUL REPRODUCTION, never a repair. The consumption side, and
    // register entry 9 itself, belong to `./overUseStripping.test.ts`.

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

      // NOT optional and NOT nullable: the key is present in both cases, and its type is `string`
      // in both. `./overUseStripping.ts` therefore needs no guard, no null check and no fallback,
      // and the caller must not wrap the stripping call in a new conditional.
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
      // element as pass two saw it - the same element pass one ended on, which is exactly what the
      // legacy single mutated loop also leaves bound.
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

      // L169 binds BEFORE the L197 gate is evaluated, so a reward that fails qualification has
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
      // engine's own unspecified one - see the zero-`ORDER BY` note. Nothing here claims a
      // repository would produce this arrangement; the case supplies it.
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
      // seed sits BEFORE the L197 gate, so it runs for EVERY reward the traversal encounters,
      // qualified or not. The ledger is therefore non-empty IF AND ONLY IF at least one reward was
      // processed - which is precisely when the legacy `reward` binding exists. The biconditional is
      // asserted in BOTH directions below, because it is what licenses the plain `string` type.

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
      // The direction that matters most: a reward can be processed WITHOUT qualifying, and the
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

  // -------------------------------------------------------------------------
  describe('dispatch is strictly serial, and both passes are strictly ordered', () => {
    it('completes each visit before beginning the next, with an asynchronous visitor', async () => {
      const run = subjectOver(promotionFixtures.promotionRewards);
      const runRecorder = new VisitRecorder(recordingOrder);

      await run.subject.iterate(recordingOrder, runRecorder.asynchronousVisitor);

      // Structural, not timed: the log must alternate enter/leave for the same reward with no
      // interleaving, which is what awaiting each visit before starting the next produces. No clock
      // is read and no duration is asserted anywhere in this case.
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
      // The reset condition consumes the gate outcome the visitor reports, so a subject that did not
      // await an asynchronous visitor could not see it. With the last reward failing qualification
      // asynchronously, pass two must still be suppressed.
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

      // Pass two depends on the output of BOTH of pass one's arms, because L417 sums a value that
      // exists only once ITEM discounts have been applied and one that exists only once FULFILLMENT
      // discounts have been applied. So pass two must follow the WHOLE of pass one, not merely its
      // item arm.
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

  // -------------------------------------------------------------------------
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
      // no accumulation from the first. A subject holding the fetched collection, the pass flag or
      // the identifier at instance scope would fail here - and on a warm container that state would
      // survive between unrelated requests.
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

  // -------------------------------------------------------------------------
  describe('the boundary this iteration does not cross', () => {
    it('reads exactly one of the order view\u2019s twelve members, and it is the promotion-code list', async () => {
      // The recorder reads from the RAW fixture order here, so `memberReads` captures the SUBJECT's
      // reads alone. Everything the order arm reads is the caller's business, not the iteration's.
      const isolatedRecorder = new VisitRecorder(order);

      await subject.iterate(recordingOrder, isolatedRecorder.synchronousVisitor);

      expect(memberReads).toStrictEqual(['promotionCodeList']);
    });

    it('never reads the price-group state the cross-service ordering constraint turns on', async () => {
      // The discriminator at [model/service/PromotionService.cfc:L241] is
      // `orderItem.getAppliedPriceGroup()`, which lives on the ORDER ITEMS - so a subject that read
      // `orderItems` would be participating in the price-base selection at L241-L252, which is
      // facade territory. The constraint itself is documented at the head of this file, correctly
      // oriented, and its bidirectional proof lives in `../promotionService.test.ts`.
      const isolatedRecorder = new VisitRecorder(order);

      await subject.iterate(recordingOrder, isolatedRecorder.synchronousVisitor);

      expect(memberReads).not.toContain('orderItems');
      expect(memberReads).not.toContain('orderFulfillments');
      expect(memberReads).not.toContain('appliedPromotions');
      expect(memberReads).not.toContain('subtotalAfterItemDiscounts');
      expect(memberReads).not.toContain('fulfillmentChargeAfterDiscountTotal');
      // And the fixture really does supply both arms of the L241 discriminator, so the absence above
      // is a genuine choice rather than an empty order making it moot.
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
      // The other seven port members raise by name, so this passing at all is the assertion. It is
      // also why no SQL, no connection and no bound parameter appears anywhere in this suite - those
      // belong exclusively to `tests/integration/repositories/`.
      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      expect(repository.activeRewardQueries.length).toBe(1);
    });

    it('never mutates the order view it was given', async () => {
      const before: readonly unknown[] = Object.values(order);

      await subject.iterate(recordingOrder, recorder.synchronousVisitor);

      // The anti-corruption boundary: the order aggregate is an INPUT, never a dependency and never
      // a mutation target. The applied-promotion intents the facade emits are its own business.
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
