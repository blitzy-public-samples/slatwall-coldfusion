// slatwall-ts - characterization suite pinning `src/services/promotion/discountAmount.ts`
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L150, L252, L299, L486, L990, L995, L1001,
// L1006, L1007]: the `precisionEvaluate` census for this component is nine sites, and
// [model/service/PriceGroupService.cfc:L323, L331] is that component's pair - each read off the
// source rather than taken from a summary.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L417]: the plain `+` in
// `getSubtotalAfterItemDiscounts() + getFulfillmentChargeAfterDiscountTotal()` is the only
// addition site in the in-scope slice, and a distinct precision gap from the `amountOff` one.
//
// JUDGMENT CALL: the rounding collaborator double SUBCLASSES the shipped `RoundingRuleService`,
// typing the repository it hands to `super` as
// `ConstructorParameters<typeof RoundingRuleService>[0]`, because the shipped surface leaves no
// narrower seam.

import { beforeEach, describe, expect, it } from 'vitest';

import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type { AmountType } from '../../../../src/domain/entities/promotionReward.js';
import type { RoundingRule } from '../../../../src/domain/entities/roundingRule.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { DiscountAmountCalculator } from '../../../../src/services/promotion/discountAmount.js';
import { RoundingRuleService } from '../../../../src/services/roundingRuleService.js';
import type { RoundingRuleFrameworkWrites } from '../../../../src/services/roundingRuleService.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// The fixture graph's type.
//
// `makePromotionFixtures` publishes one named export and deliberately does not export the shape it
// returns, so the shape is recovered from the function rather than restated.
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

/**
 * The repository the shipped `RoundingRuleService` constructor requires.
 */
type RoundingRuleServiceRepository = ConstructorParameters<typeof RoundingRuleService>[0];

/**
 * One recorded call against the rounding collaborator.
 *
 * The `value` is the whole point of the recording: it is
 * `precisionEvaluate('originalAmount - discountAmountPreRounding')`
 * [model/service/PromotionService.cfc:L1006], the NET price.
 */
interface RecordedRoundingCall {
  readonly value: Money;
  readonly rule: RoundingRule;
}

/**
 * The synthetic net price the collaborator double answers with by default.
 *
 * Deliberately unrelated to any input, and deliberately not derivable from one, so that a derived
 * discount can only have come from the double.
 */
const SYNTHETIC_ROUNDED_NET_AMOUNT = '49.99';

/**
 * Raises for a repository member the discount path must never reach.
 *
 * This is the structural half of the not-applicable statement above: rather than asserting in
 * prose that the discount calculation performs no data access.
 *
 * @param memberName the port member that was reached.
 * @returns never ; it always raises.
 * @throws Error always.
 */
function unreachedRepositoryMember(memberName: string): never {
  throw new Error(
    `PromotionRepository.${memberName}() was reached while calculating a discount amount. ` +
      'The ported getDiscountAmount [model/service/PromotionService.cfc:L987-L1018] reads three ' +
      'already-materialised reward fields and calls one synchronous collaborator; it performs ' +
      'no data access whatsoever. Reaching this member means the discount path acquired a ' +
      'dependency it must not have.',
  );
}

/**
 * A fresh, wholly unreachable repository.
 *
 * A FUNCTION rather than a shared constant, so this file holds no mutable state at module scope
 * and two collaborators can never observe one another through a shared object.
 *
 * Each member is written as a zero-argument arrow, which is assignable to the port's wider
 * signatures and keeps the stand-in to exactly the seven members the constructor's type demands.
 *
 * @returns a repository whose every member raises.
 */
function makeUnreachedRepository(): RoundingRuleServiceRepository {
  return {
    getActivePromotionRewards: () => unreachedRepositoryMember('getActivePromotionRewards'),
    getPromotionPeriodUseCount: () => unreachedRepositoryMember('getPromotionPeriodUseCount'),
    getPromotionPeriodAccountUseCount: () =>
      unreachedRepositoryMember('getPromotionPeriodAccountUseCount'),
    getPromotionCodeUseCount: () => unreachedRepositoryMember('getPromotionCodeUseCount'),
    getPromotionCodeAccountUseCount: () =>
      unreachedRepositoryMember('getPromotionCodeAccountUseCount'),
    getSalePricePromotionRewardsQuery: () =>
      unreachedRepositoryMember('getSalePricePromotionRewardsQuery'),
    getRoundingRuleQuery: () => unreachedRepositoryMember('getRoundingRuleQuery'),
  };
}

/**
 * The durable-write collaborator every `RoundingRuleService` in this file is handed, which
 * REFUSES.
 *
 * `saveRoundingRule` genuinely persists now, through a single-method contract the service declares
 * and `src/handlers/bootstrap.ts` satisfies over the request's executor.
 */
const refusingRoundingRuleFrameworkWrites: RoundingRuleFrameworkWrites = {
  saveRoundingRule: (): never => {
    throw new Error(
      'a rounding-rule WRITE was reached from this suite. Only the synchronous rounding pair is ' +
        'exercised here; saveRoundingRule is covered by tests/unit/services/roundingRuleService.test.ts.',
    );
  },
};

/**
 * The hand-written rounding collaborator, declared inline in this file and nowhere else.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L89]: the real collaborator quantizes its own
 * input with `numberFormat(arguments.value, "0.00")` before its algorithm begins.
 */
class RecordingRoundingRuleService extends RoundingRuleService {
  /**
   * Every call to `roundValueByRoundingRule`, in call order. Per instance, never shared.
   */
  readonly roundValueByRoundingRuleCalls: RecordedRoundingCall[] = [];

  /**
   * @param syntheticRoundedNetAmount the net price this double answers with, as a plain decimal
   * numeral.
   */
  constructor(private readonly syntheticRoundedNetAmount: string = SYNTHETIC_ROUNDED_NET_AMOUNT) {
    super(makeUnreachedRepository(), refusingRoundingRuleFrameworkWrites);
  }

  override roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
    this.roundValueByRoundingRuleCalls.push({ value, rule });

    return Money.fromDecimalString(this.syntheticRoundedNetAmount);
  }
}

/**
 * The single recorded call, narrowed.
 *
 * Under `noUncheckedIndexedAccess` an indexed read is possibly-absent, and this suite uses neither
 * a non-null assertion nor a cast to sidestep that.
 *
 * @param rounding the collaborator double whose log is being read.
 * @returns the one recorded call.
 * @throws Error when the collaborator was not called exactly once.
 */
function onlyRoundingCall(rounding: RecordingRoundingRuleService): RecordedRoundingCall {
  const calls = rounding.roundValueByRoundingRuleCalls;

  if (calls.length !== 1) {
    throw new Error(
      `Expected exactly one rounding call, observed ${String(calls.length)}. The ported ` +
        'getDiscountAmount reaches the rounding rule at most once, at ' +
        '[model/service/PromotionService.cfc:L1006].',
    );
  }

  const [first] = calls;

  if (first === undefined) {
    throw new Error('Expected exactly one rounding call, observed an absent entry.');
  }

  return first;
}

// A note on the reward variations built inline below.
//
// They are therefore constructed INLINE, in this consuming suite, which is what the fixture
// contract intends for a variation the factory does not offer.

describe('DiscountAmountCalculator', () => {
  // A fresh fixture graph, a fresh collaborator double and a fresh subject are constructed for
  // every case.
  let fixtures: PromotionFixtureGraph;
  let rounding: RecordingRoundingRuleService;
  let calculator: DiscountAmountCalculator;

  beforeEach(() => {
    fixtures = makePromotionFixtures();
    rounding = new RecordingRoundingRuleService();
    calculator = new DiscountAmountCalculator(rounding);
  });

  // The shipped surface, and the widening that exposes it.
  describe('the exported surface', () => {
    it('exposes getDiscountAmount as a directly callable method, which is visibility widening #5', () => {
      // CFML parity [model/service/PromotionService.cfc:L987]: the legacy declaration is
      // `private numeric function getDiscountAmount(...)`.
      expect(typeof calculator.getDiscountAmount).toBe('function');

      const result = calculator.getDiscountAmount(
        fixtures.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result).toBeInstanceOf(Money);
    });

    it('is synchronous, returning Money rather than a promise of it', () => {
      // The legacy body reaches no DAO and no ORM - it reads three already-materialised reward
      // fields and calls one synchronous collaborator - so the async boundary rule keeps it
      // synchronous.
      const result = calculator.getDiscountAmount(
        fixtures.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result).toBeInstanceOf(Money);
      expect(result).not.toBeInstanceOf(Promise);
      expect(result.toFixed2()).toBe('7.50');
    });

    it('accepts the quantity as a plain count and never as money', () => {
      // `quantity` is a COUNT - `ormtype="integer"` on the order item - so it stays a `number`
      // while `price` and the return are `Money`.
      const price = Money.fromDecimalString('19.99');

      const atThree = calculator.getDiscountAmount(fixtures.unroundedReward, price, 3);
      const atSix = calculator.getDiscountAmount(fixtures.unroundedReward, price, 6);

      expect(atThree.toFixed2()).toBe('7.50');
      expect(atSix.toFixed2()).toBe('14.99');
    });
  });

  // The four amountType paths.
  //
  // `switch(reward.getAmountType())` [model/service/PromotionService.cfc:L993] declares exactly
  // three cases - L994 `percentageOff`, L997 `amountOff`, L1000 `amount`.
  //
  // Each arm is covered twice - once with the source's canonical spelling and once with a
  // mis-cased spelling the persisted column admits.
  describe('amountType dispatch', () => {
    it('percentageOff scales the EXTENDED amount by the reward percentage', () => {
      // CFML parity [model/service/PromotionService.cfc:L995]:
      // `precisionEvaluate('originalAmount * (reward.getAmount()/100)')` 19.99 x 3 = 59.97
      // extended; 12.5% of that is 7.49625; presented to two places, 7.50.
      const result = calculator.getDiscountAmount(
        fixtures.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('7.50');
      expect(result.equals(Money.fromDecimalString('7.5'))).toBe(true);
    });

    it('percentageOff keeps the /100 division at arbitrary precision, as the legacy expression does', () => {
      // CFML parity [model/service/PromotionService.cfc:L995]: the `/100` sits inside the
      // `precisionEvaluate` string, so the division is arbitrary-precision in the legacy code too.
      //
      // The proof is the FULL-PRECISION net price the subject hands the rounding rule: 12.3% of
      // 59.97 is exactly 7.37631, so the net is exactly 52.59369.
      const roundedTwelvePointThree = new PromotionReward({
        promotionRewardID: 'discount-amount-pct-12-3-rounded',
        rewardType: 'merchandise',
        amountType: 'percentageOff',
        amount: Money.fromDecimalString('12.3'),
        roundingRule: fixtures.roundingRule,
      });

      calculator.getDiscountAmount(roundedTwelvePointThree, Money.fromDecimalString('19.99'), 3);

      expect(onlyRoundingCall(rounding).value.toDecimalString()).toBe('52.59369');
    });

    it('amountOff scales the reward amount by the quantity', () => {
      // CFML parity [model/service/PromotionService.cfc:L998]:
      // `discountAmountPreRounding = reward.getAmount() * quantity;` A flat 5.00 per unit across
      // three units is 15.00. Note that this branch reads the QUANTITY and never the extended
      // amount.
      const unroundedAmountOff = new PromotionReward({
        promotionRewardID: 'discount-amount-amount-off-unrounded',
        rewardType: 'merchandise',
        amountType: 'amountOff',
        amount: Money.fromDecimalString('5.00'),
      });

      const result = calculator.getDiscountAmount(
        unroundedAmountOff,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('15.00');
      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(0);
    });

    it('amount subtracts from the UNIT price and only then extends by the quantity', () => {
      // CFML parity [model/service/PromotionService.cfc:L1001]:
      // `precisionEvaluate('(arguments.price - reward.getAmount()) * arguments.quantity')` this
      // branch reads `arguments.price` - the unit price - not `originalAmount`.
      const unroundedFixedAmount = new PromotionReward({
        promotionRewardID: 'discount-amount-fixed-amount-unrounded',
        rewardType: 'merchandise',
        amountType: 'amount',
        amount: Money.fromDecimalString('15.00'),
      });

      const result = calculator.getDiscountAmount(
        unroundedFixedAmount,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('14.97');
      expect(result.equals(Money.fromDecimalString('59.97'))).toBe(false);
      expect(result.equals(Money.fromDecimalString('134.91'))).toBe(false);
    });

    it('amount lets a target above the unit price produce a NEGATIVE discount, with no floor', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L1001, L1013-L1015]: nothing requires the
      // reward's amount to sit below the unit price, and the clamp tests only the UPPER bound -
      // the legacy function has no lower bound anywhere in its thirty-two lines.
      const targetAboveUnitPrice = new PromotionReward({
        promotionRewardID: 'discount-amount-fixed-amount-above-price',
        rewardType: 'merchandise',
        amountType: 'amount',
        amount: Money.fromDecimalString('15.00'),
      });

      const result = calculator.getDiscountAmount(
        targetAboveUnitPrice,
        Money.fromDecimalString('10.00'),
        2,
      );

      expect(result.toFixed2()).toBe('-10.00');
      expect(result.isLessThan(Money.zero)).toBe(true);
    });

    // Case folding is part of the dispatch contract, not an implementation detail.
    //
    // CFML parity [model/service/PromotionService.cfc:L993]: a CFML `switch` on a string compares
    // its `case` labels CASE-INSENSITIVELY, so a reward persisting `'AmountOff'` reaches
    // `case "amountOff"` [model/service/PromotionService.cfc:L997] in the legacy engine and
    // receives its discount.
    //
    // JUDGMENT CALL: reaching a mis-cased spelling requires an `as AmountType` assertion, because
    // the union spells only the three canonical values.
    it('amountOff dispatches on a mis-cased amountType, in title and screaming case', () => {
      const titleCased = new PromotionReward({
        promotionRewardID: 'discount-amount-amount-off-title-cased',
        rewardType: 'merchandise',
        amountType: 'AmountOff' as AmountType,
        amount: Money.fromDecimalString('5.00'),
      });

      const titleCasedResult = calculator.getDiscountAmount(
        titleCased,
        Money.fromDecimalString('19.99'),
        3,
      );

      // The very 5.00 x 3 = 15.00 the canonical spelling produces two cases above.
      expect(titleCasedResult.toFixed2()).toBe('15.00');
      expect(titleCasedResult.toFixed2()).not.toBe('0.00');
      expect(titleCasedResult.equals(Money.zero)).toBe(false);

      // Screaming case as well, because a two-spelling allowlist would pass the title case and
      // then fail here - only a genuine fold satisfies both.
      const screamingCased = new PromotionReward({
        promotionRewardID: 'discount-amount-amount-off-screaming-cased',
        rewardType: 'merchandise',
        amountType: 'AMOUNTOFF' as AmountType,
        amount: Money.fromDecimalString('5.00'),
      });

      const screamingCasedResult = calculator.getDiscountAmount(
        screamingCased,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(screamingCasedResult.toFixed2()).toBe('15.00');
      expect(screamingCasedResult.toFixed2()).not.toBe('0.00');
      expect(screamingCasedResult.equals(Money.zero)).toBe(false);

      // The quantity-reading branch really was the one taken, not the percentage arm above it:
      // neither reward carries a rounding rule, so neither call reached the collaborator.
      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(0);
    });

    it('percentageOff dispatches on a mis-cased amountType, the first arm of the chain', () => {
      // The percentage arm fails differently from `amountOff` under an exact comparison: the chain
      // drops past all three arms rather than past only one.
      const misCasedPercentage = new PromotionReward({
        promotionRewardID: 'discount-amount-percentage-off-title-cased',
        rewardType: 'merchandise',
        amountType: 'PercentageOff' as AmountType,
        amount: Money.fromDecimalString('12.5'),
      });

      const result = calculator.getDiscountAmount(
        misCasedPercentage,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('7.50');
      expect(result.equals(Money.fromDecimalString('7.5'))).toBe(true);
      expect(result.equals(Money.zero)).toBe(false);
    });

    it('amount dispatches on a mis-cased amountType, closing the fold across all arms', () => {
      // The third arm, so no arm of the chain is left resting on canonical spelling alone.
      const misCasedFixedAmount = new PromotionReward({
        promotionRewardID: 'discount-amount-fixed-amount-title-cased',
        rewardType: 'merchandise',
        amountType: 'Amount' as AmountType,
        amount: Money.fromDecimalString('15.00'),
      });

      const result = calculator.getDiscountAmount(
        misCasedFixedAmount,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('14.97');
      expect(result.equals(Money.zero)).toBe(false);
      expect(result.equals(Money.fromDecimalString('134.91'))).toBe(false);
    });

    it('an unrecognised amountType takes NO branch and yields a zero discount', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L993-L1003]: the switch has no
      // `default:` clause - L1003 closes it immediately after the `amount` case.
      // Preserved deliberately; do not fix without a product decision.
      const unroundedAbsentAmountType = new PromotionReward({
        promotionRewardID: 'discount-amount-absent-amount-type-unrounded',
        rewardType: 'merchandise',
        amount: Money.fromDecimalString('5.00'),
      });

      const result = calculator.getDiscountAmount(
        unroundedAbsentAmountType,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('0.00');
      expect(result.equals(Money.zero)).toBe(true);
    });

    it('carries the zero seed of an unrecognised amountType into the rounding input untouched', () => {
      // The sharpest available proof that the L988 seed is what the fall-through leaves behind:
      // the net price handed to the rounding rule is `originalAmount - discountAmountPreRounding`
      // [model/service/PromotionService.cfc:L1006].
      //
      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L319, L321]: the slice's other
      // defaultless `amountType` switch seeds its accumulator with `arguments.sku.getPrice()`
      // rather than with zero.
      calculator.getDiscountAmount(
        fixtures.absentAmountTypeReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(onlyRoundingCall(rounding).value.toDecimalString()).toBe('59.97');
    });
  });

  describe('the inverted-delta rounding branch', () => {
    it('hands the rounding rule the NET PRICE, not the discount', () => {
      // CFML parity [model/service/PromotionService.cfc:L1006]: the argument is
      // `precisionEvaluate('originalAmount - discountAmountPreRounding')`. 19.99 x 3 = 59.97
      // extended, less 12.5% = 7.49625, gives a net of 52.47375 - which is exactly the migration's
      // own worked example.
      calculator.getDiscountAmount(
        fixtures.percentageOffReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      const call = onlyRoundingCall(rounding);

      expect(call.value.toDecimalString()).toBe('52.47375');
      expect(call.value.equals(Money.fromDecimalString('7.49625'))).toBe(false);
    });

    it('derives the discount BACKWARDS out of the rounded net price', () => {
      // CFML parity [model/service/PromotionService.cfc:L1007]:
      // `discountAmount = precisionEvaluate('originalAmount - roundedFinalAmount')`.
      const result = calculator.getDiscountAmount(
        fixtures.percentageOffReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('9.98');
      expect(
        result.equals(
          Money.fromDecimalString('59.97').minus(
            Money.fromDecimalString(SYNTHETIC_ROUNDED_NET_AMOUNT),
          ),
        ),
      ).toBe(true);
    });

    it('does NOT return the rounded value itself, which is what "rounding the discount" would do', () => {
      // The negative form of the previous case, stated separately because it is the assertion that
      // actually rejects the wrong mental model.
      const result = calculator.getDiscountAmount(
        fixtures.percentageOffReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.equals(Money.fromDecimalString(SYNTHETIC_ROUNDED_NET_AMOUNT))).toBe(false);
      expect(result.isLessThan(Money.fromDecimalString(SYNTHETIC_ROUNDED_NET_AMOUNT))).toBe(true);
    });

    it("passes the reward's OWN rounding rule instance through, unsubstituted", () => {
      // CFML parity [model/service/PromotionService.cfc:L1006]: the named argument is
      // `roundingRule=reward.getRoundingRule()`. Identity rather than equality, so a subject that
      // resolved some other look-alike rule - the price-group graph holds one - would fail.
      calculator.getDiscountAmount(
        fixtures.percentageOffReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(onlyRoundingCall(rounding).rule).toBe(fixtures.percentageOffReward.getRoundingRule());
    });

    it('skips rounding entirely when the reward carries no rounding rule', () => {
      // CFML parity [model/service/PromotionService.cfc:L1005, L1008-L1010]:
      // `if(!isNull(reward.getRoundingRule()))` guards the branch, and the `else` at L1009 passes
      // the pre-rounding value straight through UNQUANTIZED to the clamp and then to L1017.
      const result = calculator.getDiscountAmount(
        fixtures.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(0);
      expect(result.toFixed2()).toBe('7.50');
    });

    it('reaches the rounding rule at most once per invocation', () => {
      // There is exactly one call site, [model/service/PromotionService.cfc:L1006], and it sits
      // outside any loop.
      calculator.getDiscountAmount(fixtures.roundedReward, Money.fromDecimalString('19.99'), 3);

      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(1);
    });
  });

  // Register entry 14 - the clamp misfires in both directions.
  //
  // This is preserved, not fixed, and it is not a third deliberate divergence.
  describe('the discount clamp', () => {
    it('FALSE POSITIVE: firing the clamp DISCARDS the whole rounding computation', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the guard tests
      // `discountAmountPreRounding > originalAmount` while the body assigns
      // `discountAmount = originalAmount`.
      // Preserved deliberately; do not fix without a product decision.
      //
      // A 150% reward on a 59.97 extended amount gives a pre-rounding discount of 89.955.
      const overHundredPercent = new PromotionReward({
        promotionRewardID: 'discount-amount-pct-150-rounded',
        rewardType: 'merchandise',
        amountType: 'percentageOff',
        amount: Money.fromDecimalString('150'),
        roundingRule: fixtures.roundingRule,
      });

      const result = calculator.getDiscountAmount(
        overHundredPercent,
        Money.fromDecimalString('19.99'),
        3,
      );

      const call = onlyRoundingCall(rounding);

      expect(call.value.toDecimalString()).toBe('-29.985');
      expect(result.toFixed2()).toBe('59.97');
      expect(result.equals(Money.fromDecimalString('9.98'))).toBe(false);
    });

    it('FALSE POSITIVE also reports the extended amount when no rounding rule is attached', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: on the unrounded path the
      // two variables happen to hold the same value, so the clamp does what its comment at L1012
      // claims.
      // Preserved deliberately; do not fix without a product decision.
      const overHundredPercentUnrounded = new PromotionReward({
        promotionRewardID: 'discount-amount-pct-150-unrounded',
        rewardType: 'merchandise',
        amountType: 'percentageOff',
        amount: Money.fromDecimalString('150'),
      });

      const result = calculator.getDiscountAmount(
        overHundredPercentUnrounded,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(0);
      expect(result.toFixed2()).toBe('59.97');
    });

    it('FALSE NEGATIVE: a NEGATIVE rounded net lets the discount escape the clamp uncaught', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the other direction, and
      // the one the comment at L1012 is simply wrong about. The rounding algorithm's candidate
      // arithmetic is unsigned-agnostic and can return a NEGATIVE net price.
      // Preserved deliberately; do not fix without a product decision.
      const negativeNetRounding = new RecordingRoundingRuleService('-0.99');
      const negativeNetCalculator = new DiscountAmountCalculator(negativeNetRounding);

      const result = negativeNetCalculator.getDiscountAmount(
        fixtures.roundedReward,
        Money.fromDecimalString('0.42'),
        1,
      );

      expect(onlyRoundingCall(negativeNetRounding).value.toDecimalString()).toBe('0.3675');
      expect(result.toFixed2()).toBe('1.41');
      expect(result.isGreaterThan(Money.fromDecimalString('0.42'))).toBe(true);
    });

    it('does NOT fire when the pre-rounding discount EQUALS the extended amount', () => {
      // CFML parity [model/service/PromotionService.cfc:L1013]: the comparison is a strict `>`, so
      // equality falls outside it. A 100% reward makes the pre-rounding discount exactly equal the
      // extended amount, the guard stays false, and the derived discount survives.
      const exactlyHundredPercent = new PromotionReward({
        promotionRewardID: 'discount-amount-pct-100-rounded',
        rewardType: 'merchandise',
        amountType: 'percentageOff',
        amount: Money.fromDecimalString('100'),
        roundingRule: fixtures.roundingRule,
      });

      const boundaryRounding = new RecordingRoundingRuleService('5.00');
      const boundaryCalculator = new DiscountAmountCalculator(boundaryRounding);

      const result = boundaryCalculator.getDiscountAmount(
        exactlyHundredPercent,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(onlyRoundingCall(boundaryRounding).value.toDecimalString()).toBe('0');
      expect(result.toFixed2()).toBe('54.97');
      expect(result.equals(Money.fromDecimalString('59.97'))).toBe(false);
    });
  });

  // The two quantization points, which sit at opposite ends of the path.
  //
  // INPUT [model/service/RoundingRuleService.cfc:L89]
  // `var inputValue = numberFormat(arguments.value, "0.00")` - the COLLABORATOR quantizes its own
  // argument before its algorithm begins.
  describe('quantization and the return contract', () => {
    it('quantizes the returned discount to two decimals, rounding half-up', () => {
      // CFML parity [model/service/PromotionService.cfc:L1017]: the mask is `"0.00"` and the
      // rounding is half-up, so a pre-rounding discount of 7.49625 presents as 7.50 - the third
      // decimal decides the second and is then gone.
      const result = calculator.getDiscountAmount(
        fixtures.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('7.50');

      // A half-cent exactly on the boundary rounds up rather than truncating: 1% of 0.50 is 0.005.
      const onePercent = new PromotionReward({
        promotionRewardID: 'discount-amount-pct-1-unrounded',
        rewardType: 'merchandise',
        amountType: 'percentageOff',
        amount: Money.fromDecimalString('1'),
      });

      expect(
        calculator.getDiscountAmount(onePercent, Money.fromDecimalString('0.50'), 1).toFixed2(),
      ).toBe('0.01');
    });

    it('hands the collaborator a FULL-PRECISION net price, leaving input quantization to it', () => {
      // The subject does not pre-quantize. 52.47375 carries five decimals and arrives with all of
      // them, because the two-decimal narrowing of the rounding input belongs to
      // [model/service/RoundingRuleService.cfc:L89] - the collaborator's own first statement.
      calculator.getDiscountAmount(fixtures.roundedReward, Money.fromDecimalString('19.99'), 3);

      const call = onlyRoundingCall(rounding);

      expect(call.value.toDecimalString()).toBe('52.47375');
      expect(call.value.toFixed2()).toBe('52.47');
      expect(call.value.equals(Money.fromDecimalString('52.47'))).toBe(false);
    });

    it('returns a Money re-entering the value surface, as the shipped module represents it', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L987, L1017]: the legacy function declares
      // `returntype="numeric"` and then returns `numberFormat(discountAmount, "0.00")`, which is a
      // STRING. CFML coerced across that boundary silently.
      const result = calculator.getDiscountAmount(
        fixtures.roundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result).toBeInstanceOf(Money);
      expect(typeof result.toFixed2()).toBe('string');
      expect(result.toFixed2()).toBe('9.98');
      expect(result.equals(Money.fromDecimalString('9.98'))).toBe(true);
    });

    it('presents a value that rounds to zero from below as 0.00 rather than -0.00', () => {
      // A signed zero is not a monetary value, and a discount line reading `-0.00` would be a
      // presentation defect the legacy `numberFormat` never produced.
      const barelyAboveUnitPrice = new PromotionReward({
        promotionRewardID: 'discount-amount-fixed-amount-barely-above',
        rewardType: 'merchandise',
        amountType: 'amount',
        amount: Money.fromDecimalString('10.0001'),
      });

      const result = calculator.getDiscountAmount(
        barelyAboveUnitPrice,
        Money.fromDecimalString('10.00'),
        1,
      );

      expect(result.toFixed2()).toBe('0.00');
      expect(result.equals(Money.zero)).toBe(true);
    });
  });

  // DELIBERATE DIVERGENCE (b) - register entry 12, the amountOff precision gap.
  describe('deliberate divergence (b): amountOff arithmetic', () => {
    it('computes amountOff at exact decimal precision, closing the legacy float gap', () => {
      // Documented deliberate divergence (b) - register entry.
      //
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L998]:
      // `discountAmountPreRounding = reward.getAmount() * quantity;` is the only monetary
      // computation in the whole function that carries no `precisionEvaluate`.
      // Preserved deliberately; do not fix without a product decision.
      const roundedAmountOff = new PromotionReward({
        promotionRewardID: 'discount-amount-amount-off-rounded-drift',
        rewardType: 'merchandise',
        amountType: 'amountOff',
        amount: Money.fromDecimalString('0.1'),
        roundingRule: fixtures.roundingRule,
      });

      calculator.getDiscountAmount(roundedAmountOff, Money.fromDecimalString('10.00'), 3);

      const call = onlyRoundingCall(rounding);

      expect(call.value.toDecimalString()).toBe('29.7');
      expect(
        Money.fromDecimalString('30').minus(call.value).equals(Money.fromDecimalString('0.3')),
      ).toBe(true);
    });

    it('presents an amountOff half-cent the way exact decimals require, not the way a float would', () => {
      // Documented deliberate divergence (b), at the presentation boundary, where the difference
      // becomes a cent that a customer can see.
      //
      // 2.675 is not representable in IEEE-754; the nearest double is slightly BELOW it, so a
      // float-based half-up presentation reports 2.67.
      const halfCentAmountOff = new PromotionReward({
        promotionRewardID: 'discount-amount-amount-off-half-cent',
        rewardType: 'merchandise',
        amountType: 'amountOff',
        amount: Money.fromDecimalString('2.675'),
      });

      const result = calculator.getDiscountAmount(
        halfCentAmountOff,
        Money.fromDecimalString('10.00'),
        1,
      );

      expect(result.toFixed2()).toBe('2.68');
      expect(result.equals(Money.fromDecimalString('2.67'))).toBe(false);
    });

    it('accumulates amountOff across a larger quantity without drift', () => {
      // The same divergence over a longer multiplication: 0.07 x 21 is exactly 1.47. Asserted
      // through the full-precision rounding input so that the output mask cannot hide a drift
      // digit in the third decimal.
      const pennyFractionAmountOff = new PromotionReward({
        promotionRewardID: 'discount-amount-amount-off-accumulated',
        rewardType: 'merchandise',
        amountType: 'amountOff',
        amount: Money.fromDecimalString('0.07'),
        roundingRule: fixtures.roundingRule,
      });

      calculator.getDiscountAmount(pennyFractionAmountOff, Money.fromDecimalString('1.00'), 21);

      expect(onlyRoundingCall(rounding).value.toDecimalString()).toBe('19.53');
    });
  });

  // DELIBERATE DIVERGENCE (a) - register entry 13, the un-var'd accumulator.
  //
  // LEGACY-NOTE [model/service/PromotionService.cfc:L1007, L1009, L1014]: register entry 13 has
  // three assignment sites, not the two published.
  describe('deliberate divergence (a): no state survives an invocation', () => {
    it('computes a second invocation solely from its own inputs, with no trace of the first', () => {
      // Documented deliberate divergence (a) - register entry 13, and its acceptance criterion.
      //
      // In the legacy function `discountAmount` is assigned without `var`, so CFML resolves it
      // into COMPONENT scope, where the binding outlives the call.
      const unroundedAbsentAmountType = new PromotionReward({
        promotionRewardID: 'discount-amount-isolation-absent-amount-type',
        rewardType: 'merchandise',
        amount: Money.fromDecimalString('5.00'),
      });

      const first = calculator.getDiscountAmount(
        fixtures.percentageOffReward,
        Money.fromDecimalString('19.99'),
        3,
      );
      const second = calculator.getDiscountAmount(
        unroundedAbsentAmountType,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(first.toFixed2()).toBe('9.98');
      expect(second.toFixed2()).toBe('0.00');
      expect(second.equals(Money.zero)).toBe(true);
      expect(second.equals(first)).toBe(false);
    });

    it('does not carry a clamped result forward into a later invocation', () => {
      // The same divergence at the THIRD assignment site. The first invocation fires the clamp, so
      // L1014 is the last writer and the reported value is the extended amount.
      const overHundredPercentUnrounded = new PromotionReward({
        promotionRewardID: 'discount-amount-isolation-pct-150',
        rewardType: 'merchandise',
        amountType: 'percentageOff',
        amount: Money.fromDecimalString('150'),
      });

      const clamped = calculator.getDiscountAmount(
        overHundredPercentUnrounded,
        Money.fromDecimalString('19.99'),
        3,
      );
      const ordinary = calculator.getDiscountAmount(
        fixtures.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(clamped.toFixed2()).toBe('59.97');
      expect(ordinary.toFixed2()).toBe('7.50');
    });

    it('does not carry a rounded derivation forward onto an unrounded reward', () => {
      // The complementary ordering, so neither the rounding branch nor the `else` can be the one
      // that leaks.
      const rounded = calculator.getDiscountAmount(
        fixtures.roundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );
      const unrounded = calculator.getDiscountAmount(
        fixtures.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(rounded.toFixed2()).toBe('9.98');
      expect(unrounded.toFixed2()).toBe('7.50');
      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(1);
    });

    it('is repeatable: identical inputs give identical results, with nothing accumulated', () => {
      // A leaked accumulator does not have to change the answer to be a defect - but if the answer
      // drifted across repeats it would certainly be one.
      const price = Money.fromDecimalString('19.99');

      const results = [
        calculator.getDiscountAmount(fixtures.roundedReward, price, 3),
        calculator.getDiscountAmount(fixtures.roundedReward, price, 3),
        calculator.getDiscountAmount(fixtures.roundedReward, price, 3),
      ];

      expect(results.map((result) => result.toFixed2())).toStrictEqual(['9.98', '9.98', '9.98']);
      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(3);
    });

    it('shares nothing between two independently constructed calculators', () => {
      // Two subjects, two collaborators, interleaved calls. Each collaborator sees only its own
      // call, each subject answers only from its own inputs, and neither observes the other.
      const otherRounding = new RecordingRoundingRuleService('5.00');
      const otherCalculator = new DiscountAmountCalculator(otherRounding);

      const mine = calculator.getDiscountAmount(
        fixtures.roundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );
      const theirs = otherCalculator.getDiscountAmount(
        fixtures.roundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(mine.toFixed2()).toBe('9.98');
      expect(theirs.toFixed2()).toBe('54.97');
      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(1);
      expect(otherRounding.roundValueByRoundingRuleCalls).toHaveLength(1);
      expect(rounding.roundValueByRoundingRuleCalls).not.toBe(
        otherRounding.roundValueByRoundingRuleCalls,
      );
    });
  });

  // An absent amount column, and where the failure is allowed to happen.
  describe('an absent amount column', () => {
    it('raises when a matched strategy needs the amount, reproducing the legacy null operand', () => {
      // CFML parity [model/entity/PromotionReward.cfc:L61]: `amount` is `ormType="big_decimal"`
      // with no `default`, so a NULL column is a real persisted state.
      //
      // Substituting zero is forbidden on a money path, and the reason is concrete rather than
      // stylistic: a zero percentage would discount nothing.
      expect(() =>
        calculator.getDiscountAmount(
          fixtures.absentAmountReward,
          Money.fromDecimalString('19.99'),
          3,
        ),
      ).toThrow(/getAmount\(\) is absent/);
    });

    it('does NOT raise when no strategy matched, because the amount is never read', () => {
      const bothColumnsAbsent = new PromotionReward({
        promotionRewardID: 'discount-amount-both-columns-absent',
        rewardType: 'merchandise',
      });

      const result = calculator.getDiscountAmount(
        bothColumnsAbsent,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('0.00');
      expect(result.equals(Money.zero)).toBe(true);
    });
  });

  // The structural half of the not-applicable statement in this file's header.
  describe('the discount path performs no data access', () => {
    it('never reaches a repository member on any amountType path or either rounding branch', () => {
      // P5 and P6, enforced rather than asserted in prose.
      const price = Money.fromDecimalString('19.99');
      const rule = fixtures.roundingRule;

      const sweep: readonly PromotionReward[] = [
        new PromotionReward({
          promotionRewardID: 'discount-amount-sweep-pct-unrounded',
          rewardType: 'merchandise',
          amountType: 'percentageOff',
          amount: Money.fromDecimalString('12.5'),
        }),
        new PromotionReward({
          promotionRewardID: 'discount-amount-sweep-pct-rounded',
          rewardType: 'merchandise',
          amountType: 'percentageOff',
          amount: Money.fromDecimalString('12.5'),
          roundingRule: rule,
        }),
        new PromotionReward({
          promotionRewardID: 'discount-amount-sweep-amount-off-unrounded',
          rewardType: 'merchandise',
          amountType: 'amountOff',
          amount: Money.fromDecimalString('5.00'),
        }),
        new PromotionReward({
          promotionRewardID: 'discount-amount-sweep-amount-off-rounded',
          rewardType: 'merchandise',
          amountType: 'amountOff',
          amount: Money.fromDecimalString('5.00'),
          roundingRule: rule,
        }),
        new PromotionReward({
          promotionRewardID: 'discount-amount-sweep-amount-unrounded',
          rewardType: 'merchandise',
          amountType: 'amount',
          amount: Money.fromDecimalString('15.00'),
        }),
        new PromotionReward({
          promotionRewardID: 'discount-amount-sweep-amount-rounded',
          rewardType: 'merchandise',
          amountType: 'amount',
          amount: Money.fromDecimalString('15.00'),
          roundingRule: rule,
        }),
        new PromotionReward({
          promotionRewardID: 'discount-amount-sweep-absent-unrounded',
          rewardType: 'merchandise',
          amount: Money.fromDecimalString('5.00'),
        }),
        new PromotionReward({
          promotionRewardID: 'discount-amount-sweep-absent-rounded',
          rewardType: 'merchandise',
          amount: Money.fromDecimalString('5.00'),
          roundingRule: rule,
        }),
      ];

      const presented = sweep.map((reward) =>
        calculator.getDiscountAmount(reward, price, 3).toFixed2(),
      );

      expect(presented).toStrictEqual([
        '7.50',
        '9.98',
        '15.00',
        '9.98',
        '14.97',
        '9.98',
        '0.00',
        '9.98',
      ]);
      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(4);
    });
  });

  // The migration's own worked example, end to end.
  describe("the migration's reference calculation", () => {
    it('reproduces every published figure of the worked example without drift', () => {
      // Unit price 19.99 at quantity 3 gives 59.97; 12.5% of that is 7.49625; the net is 52.47375;
      // presented to two places the net is 52.47 and the discount is 7.50.
      //
      // Every expectation is read from the fixture's own published numerals rather than restated
      // here, so this suite and the factory cannot disagree about the migration's worked example.
      const reference = fixtures.referenceCalculation;

      const unitPrice = Money.fromDecimalString(reference.unitPrice);
      const extendedPrice = Money.fromDecimalString(reference.extendedPrice);

      expect(unitPrice.times(reference.quantity).equals(extendedPrice)).toBe(true);

      const discount = calculator.getDiscountAmount(
        fixtures.referenceCalculationReward,
        unitPrice,
        reference.quantity,
      );

      // The reward carries exactly the published percentage and no rounding rule, so the presented
      // figure is the arithmetic's own answer rather than a rounding rule's.
      expect(fixtures.referenceCalculationReward.getAmountType()).toBe('percentageOff');
      expect(discount.toFixed2()).toBe(reference.presentedDiscountAmount);
      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(0);

      // And the net the customer pays, derived from the quantized discount exactly as a consumer
      // would derive it.
      expect(extendedPrice.minus(discount).toFixed2()).toBe(reference.presentedNetAmount);
    });

    it('exposes the unquantized net at full precision through the rounding rule', () => {
      // The same worked example driven through the rounding branch, which is the only way to
      // observe the published unquantized figures: the net 52.47375 and, by difference, the
      // discount 7.49625.
      const reference = fixtures.referenceCalculation;
      const extendedPrice = Money.fromDecimalString(reference.extendedPrice);

      calculator.getDiscountAmount(
        fixtures.roundedReward,
        Money.fromDecimalString(reference.unitPrice),
        reference.quantity,
      );

      const call = onlyRoundingCall(rounding);

      expect(call.value.toDecimalString()).toBe(reference.netAmount);
      expect(
        extendedPrice.minus(call.value).equals(Money.fromDecimalString(reference.discountAmount)),
      ).toBe(true);
    });
  });
});
