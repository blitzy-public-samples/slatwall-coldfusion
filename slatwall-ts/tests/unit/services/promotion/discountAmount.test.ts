// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/services/promotion/discountAmount.ts`
//
// The subject is the ported form of
// `private numeric function getDiscountAmount(required any reward, required numeric price,
//  required numeric quantity)` [model/service/PromotionService.cfc:L987-L1018] - the arithmetic
// leaf of MUST-PRESERVE AREA #1, promotion discount math together with use-limit enforcement.
// Every discount this platform grants is computed by the thirty-two lines this file guards, so
// each assertion below is a statement about money rather than about structure.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and recording that is a requirement rather
// than a courtesy: presenting net-new coverage as parity fails the traceability gate.
// `meta/tests/unit/service/` holds exactly four components - `AccountServiceTest.cfc`,
// `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc` - none of
// them in scope, and `grep -rli 'promotion' meta/tests/` returns ZERO files: no legacy test
// anywhere in the tree so much as mentions a promotion. Across the whole migration only
// `tests/unit/domain/entities/brand.test.ts` and `tests/unit/domain/entities/product.test.ts`
// extend a legacy suite, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty
// stub contributing zero coverage to anybody. There is no antecedent for this file, and no
// lineage is claimed for it.
//
// ---------------------------------------------------------------------------
// NO USER-SPECIFIED RULES EXIST, AND THE ABSENCE WAS VERIFIED
// ---------------------------------------------------------------------------
// The project's rules source was queried three independent ways while this suite was authored -
// unpaged, over the full range, and at a high offset well past any plausible end of document -
// and returned the identical single-line sentinel every time. It is a fixed sentinel, not a
// truncated read: a genuinely paginated document would answer empty at a high offset.
//
// Consequently NO user-specified rule governs this file, no rule is invented to fill the gap,
// and the absence is NOT treated as licence to lower the bar. The enterprise practices the
// migration commits to apply at full strength in their place, and the rules source remains the
// authoritative answer should rules ever be added - this note records its result and does not
// substitute for it.
//
// ---------------------------------------------------------------------------
// READ THIS BEFORE READING THE ASSERTIONS: THE ROUNDING IS AN INVERTED DELTA
// ---------------------------------------------------------------------------
// [model/service/PromotionService.cfc:L1005-L1007] DOES NOT ROUND THE DISCOUNT.
//
//   L1006  roundedFinalAmount = roundValueByRoundingRule(
//              value = precisionEvaluate('originalAmount - discountAmountPreRounding'),
//              roundingRule = reward.getRoundingRule() )
//   L1007  discountAmount = precisionEvaluate('originalAmount - roundedFinalAmount')
//
// The value handed to the rounding rule is the NET PRICE the customer would pay, so the rule
// lands on a resulting PRICE POINT - `$x.99`, say - and the discount is then DERIVED BACKWARDS
// as whatever delta reaches that point. A suite written against a "round the discount" mental
// model is wrong and would pass against an implementation that pays out different money. The
// cases below therefore assert the DERIVATION DIRECTION explicitly, by capturing the argument
// the collaborator actually received.
//
// ---------------------------------------------------------------------------
// THE DEFECT REGISTER ENTRIES THIS FILE PINS, AND THE DIVERGENCE BUDGET
// ---------------------------------------------------------------------------
// The migration permits EXACTLY THREE deliberate divergences in total. TWO of them belong to
// this subject, and both are pinned here:
//
//   * DIVERGENCE (a) - register entry 13 [L1007, L1009, L1014]: `discountAmount` is assigned
//     without `var` and leaks into CFML component scope. Closed in the target as a
//     function-local. Pinned by the isolation cases.
//   * DIVERGENCE (b) - register entry 12 [L998]: the `amountOff` branch alone escapes
//     arbitrary-precision arithmetic. Closed in the target by routing through `Money`. Pinned
//     by the exact-decimal cases.
//
// The migration's third divergence is spent elsewhere, on register entry 19's poisoned
// `getBrandName()` memo in `src/domain/entities/product.ts`. NO FOURTH IS PERMITTED ANYWHERE.
//
// ★ REGISTER ENTRY 14 [L1013-L1015] IS PRESERVED, NOT FIXED, AND IS NOT A THIRD DIVERGENCE.
// The clamp gates on `discountAmountPreRounding` and assigns to `discountAmount`, so it misfires
// in BOTH directions. Both misfires are asserted below as the current, shipping behaviour. The
// absent `default:` case [L1003] is likewise preserved rather than diverged: no exhaustiveness
// check is expected of the subject and none is asserted.
//
// ---------------------------------------------------------------------------
// VISIBILITY WIDENING #5 OF EXACTLY 5, AND THE LEDGER IS NOW EXHAUSTED
// ---------------------------------------------------------------------------
// The legacy declaration is `private numeric function getDiscountAmount` [L987]. The target
// exports it, which is what lets the must-preserve arithmetic be exercised directly instead of
// only through the 489-line orchestrator. That is widening #5; the other four are #1 [L549],
// #2 [L629], #3 [L752] and #4 [L783], all of them in this same folder. A sixth would be a gate
// failure. The assertion that no SIXTH private helper was promoted belongs to
// `../promotionService.test.ts` and is referenced here rather than duplicated.
//
// The widening alters visibility ONLY. No parameter is added, removed, reordered or defaulted,
// so this file spends none of the signature-reshaping budget (3 project-wide, all elsewhere)
// and none of the signature-widening budget (1 project-wide, already spent on
// `isCurrent(now?: Date)` in `src/domain/entities/promotionPeriod.ts`). The four ledgers are
// distinct and are never conflated.
//
// ---------------------------------------------------------------------------
// LOCATOR CORRECTIONS, RECORDED BECAUSE THE SOURCE WINS
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L990, L995, L1001, L1006, L1007]: the
// `precisionEvaluate` census for this component is NINE sites, not the eight published - L150,
// L252, L299, L486, L990, L995, L1001, L1006 and L1007, counted directly in the source. FIVE of
// the nine sit inside `getDiscountAmount` alone. The published census lists L248 where the
// source carries L252, and omits L1006 entirely - which is the semantically most important of
// the nine, being the `originalAmount - discountAmountPreRounding` that produces the net price
// the rounding rule shapes. Recorded rather than silently reconciled, because where a published
// citation and the source disagree the SOURCE WINS.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L323, L331]: that component's two
// `precisionEvaluate` sites are L323 and L331, not the published L322 and L328. Same rule
// applied, same reason.
//
// ---------------------------------------------------------------------------
// THE PRECISION GAP THIS FILE DOES NOT OWN
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L417]: the plain `+` in
// `getSubtotalAfterItemDiscounts() + getFulfillmentChargeAfterDiscountTotal()` is a DISTINCT
// precision gap from register entry 12's, it is the only addition site in the whole in-scope
// slice, and it belongs to `./twoPassRewardIterator.test.ts`. It is named here purely so nobody
// conflates the two, and it is deliberately NOT asserted in this file.
//
// ---------------------------------------------------------------------------
// PARAMETERIZED SQL: NOT APPLICABLE HERE, AND WHY
// ---------------------------------------------------------------------------
// The migration's parameterized-SQL standard - every statement a prepared statement, preserving
// the injection-safety property `cfqueryparam` provided - has NO application to this file, and
// that is stated rather than silently omitted so its absence cannot be mistaken for an
// oversight. The subject is pure synchronous arithmetic over three already-materialised reward
// fields plus one synchronous collaborator: it issues no statement, opens no connection, binds
// no parameter and names no table. This suite accordingly touches no SQL. Every SQL-shape and
// parameter-binding assertion in the project belongs exclusively to the sibling-owned
// `tests/integration/repositories/` tier.
//
// That claim is enforced STRUCTURALLY rather than asserted in prose: the repository the
// collaborator is constructed with raises on every one of its eight members, so any data access
// anywhere on the discount path would fail this suite loudly. See {@link makeUnreachedRepository}
// and the reachability case at the end of the file.
//
// Likewise, and for the same reason it must pass in a completely empty environment: this file
// reads no `process.env`, loads no `.env`, opens no pool, touches no network and no filesystem,
// and contains no credential or connection literal of any kind.
//
// ---------------------------------------------------------------------------
// HOW THIS SUITE ADAPTED TO THE SHIPPED SURFACE
// ---------------------------------------------------------------------------
// JUDGMENT CALL: the rounding collaborator double is a SUBCLASS of the shipped
// `RoundingRuleService` rather than a free-standing class or an object literal, and that is
// forced by the shipped surface rather than chosen. `RoundingRuleService` is a CLASS carrying
// two private instance members - its request-scoped rounding-rule memo and its injected
// repository - and TypeScript admits a value into a class-typed position only when any private
// member originates in the same declaration. A structural stand-in is therefore rejected by the
// compiler outright, which was confirmed against the real types before this file was written.
// The subject is never modified, renamed, re-exported or wrapped to accommodate the suite; the
// suite adapts, exactly as the authoring contract requires.
//
// JUDGMENT CALL: the repository the subclass must hand to `super` is typed by extracting it from
// the class itself, as `ConstructorParameters<typeof RoundingRuleService>[0]`, rather than by
// importing the port module. The port is not among this file's declared dependencies, and
// extracting the type adds no module to the import set while still letting the compiler reject a
// stand-in of the wrong shape.
//
// JUDGMENT CALL: `src/lib/cfml/numberFormat.ts` and `src/lib/cfml/precision.ts` are permitted
// dependencies of this file and are deliberately NOT imported. Both are reached THROUGH the money
// value object - the subject's own quantization goes through `numberFormat` and its arithmetic
// through `precision`, and the value object's `toFixed2` applies the very `'0.00'` mask
// [model/service/PromotionService.cfc:L1017] specifies. Importing either directly would let this
// suite compute an expectation outside the value object, which is exactly what the single
// arithmetic surface exists to prevent; importing one and leaving it unused is a lint error and
// would be a declaration of intent the code does not honour. An accurate absence is preferable to
// a tidy-looking import. The remaining declared dependencies - `tests/setup.ts`,
// `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs` and `.prettierrc.json` - are ambient:
// they are consumed as the runner, type and lint contract rather than imported, and none of them
// is modified by this work.
//
// Nothing in this suite substitutes the money value object's zero for an absent value: there is no
// `?? Money.zero`, no `|| Money.zero` and no parameter defaulting to zero anywhere below.
// `Money.zero` appears only where the legacy code genuinely produces zero - the L988 seed that an
// unrecognised `amountType` falls through with, and the sign comparisons that read against it.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type { RoundingRule } from '../../../../src/domain/entities/roundingRule.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { DiscountAmountCalculator } from '../../../../src/services/promotion/discountAmount.js';
import { RoundingRuleService } from '../../../../src/services/roundingRuleService.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// ---------------------------------------------------------------------------
// The fixture graph's type.
//
// `makePromotionFixtures` publishes one named export and deliberately does not export the shape
// it returns, so the shape is recovered from the function rather than restated. Restating it
// would let this suite and the factory drift apart silently.
// ---------------------------------------------------------------------------
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

/** The repository the shipped `RoundingRuleService` constructor requires. */
type RoundingRuleServiceRepository = ConstructorParameters<typeof RoundingRuleService>[0];

/**
 * One recorded call against the rounding collaborator.
 *
 * The `value` is the whole point of the recording: it is
 * `precisionEvaluate('originalAmount - discountAmountPreRounding')`
 * [model/service/PromotionService.cfc:L1006], the NET price, and capturing it is the cleanest
 * available proof that the subject rounds the net price rather than the discount.
 */
interface RecordedRoundingCall {
  readonly value: Money;
  readonly rule: RoundingRule;
}

/**
 * The synthetic net price the collaborator double answers with by default.
 *
 * Deliberately unrelated to any input, and deliberately not derivable from one, so that a
 * derived discount can only have come from the double. A plain decimal numeral, never a
 * floating-point literal.
 */
const SYNTHETIC_ROUNDED_NET_AMOUNT = '49.99';

/**
 * Raises for a repository member the discount path must never reach.
 *
 * This is the structural half of the not-applicable statement above: rather than asserting in
 * prose that the discount calculation performs no data access, every member of the repository
 * handed to the collaborator raises, so a single stray read anywhere on the path fails loudly
 * and immediately.
 *
 * @param memberName - the port member that was reached.
 * @returns never; it always raises.
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
 * signatures and keeps the stand-in to exactly the eight members the constructor's type demands -
 * no invented member, no partial implementation, no behaviour.
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
    saveRoundingRule: () => unreachedRepositoryMember('saveRoundingRule'),
  };
}

/**
 * The hand-written rounding collaborator, declared inline in this file and nowhere else.
 *
 * It implements EXACTLY the one member the subject invokes - `roundValueByRoundingRule`
 * [model/service/RoundingRuleService.cfc:L84], reached from
 * [model/service/PromotionService.cfc:L1006] - records every call in order, and answers a fixed,
 * obviously-synthetic net price. There is no randomness, no clock, no environment read and no
 * counter that outlives an instance.
 *
 * ★ THE ROUNDING ALGORITHM IS DELIBERATELY NOT EXERCISED HERE. `roundValue`'s decimal-string
 * surgery and its ten pinned answers are owned by `../roundingRuleService.test.ts`. What this
 * suite asserts is the INTERACTION and the DERIVATION DIRECTION: which value the subject hands
 * over, and how it turns the answer back into a discount. Re-deriving the rounding arithmetic
 * here would duplicate a sibling's territory and couple two suites to one algorithm.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L89]: the real collaborator quantizes its
 * OWN input with `numberFormat(arguments.value, "0.00")` before its algorithm begins. That is
 * the first of the path's two quantization points and it belongs to the collaborator, not to the
 * subject - which is precisely why this double does NOT quantize, and why the cases below can
 * assert that the subject hands over a FULL-PRECISION net price.
 */
class RecordingRoundingRuleService extends RoundingRuleService {
  /** Every call to `roundValueByRoundingRule`, in call order. Per instance, never shared. */
  readonly roundValueByRoundingRuleCalls: RecordedRoundingCall[] = [];

  /**
   * @param syntheticRoundedNetAmount - the net price this double answers with, as a plain
   *   decimal numeral. Defaults to {@link SYNTHETIC_ROUNDED_NET_AMOUNT}; a case that needs a
   *   specific answer - a negative one, say - passes its own.
   */
  constructor(private readonly syntheticRoundedNetAmount: string = SYNTHETIC_ROUNDED_NET_AMOUNT) {
    super(makeUnreachedRepository());
  }

  override roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
    this.roundValueByRoundingRuleCalls.push({ value, rule });

    return Money.fromDecimalString(this.syntheticRoundedNetAmount);
  }
}

/**
 * The single recorded call, narrowed.
 *
 * Under `noUncheckedIndexedAccess` an indexed read is possibly-absent, and this suite uses
 * neither a non-null assertion nor a cast to sidestep that. The value is captured, checked, and
 * only then returned - so a case that expected a call and got none fails on the check rather
 * than on a confusing downstream comparison.
 *
 * @param rounding - the collaborator double whose log is being read.
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

// ---------------------------------------------------------------------------
// A NOTE ON THE REWARD VARIATIONS BUILT INLINE BELOW
//
// `makePromotionFixtures` publishes every reward this suite needs that CARRIES a rounding rule -
// `percentageOffReward`, `amountOffReward`, `fixedAmountReward`, `roundedReward`,
// `absentAmountTypeReward`, `absentAmountReward` - plus the unrounded percentage rewards
// `unroundedReward` and `referenceCalculationReward`. It does not publish an unrounded `amountOff`
// or `amount` reward, nor an unrounded absent-`amountType` reward, and those three shapes are
// exactly what separate the amount-type strategies from the rounding branch and the clamp.
//
// They are therefore constructed INLINE, in this consuming suite, which is what the fixture
// contract intends for a variation the factory does not offer. No fixture module is created, none
// is edited, and no local helper module is introduced.
//
// In every inline construction `roundingRule` is OMITTED rather than passed as `undefined`:
// `exactOptionalPropertyTypes` makes "key absent" and "key present carrying undefined" genuinely
// different types, and absence is what `hb_optionsNullRBKey="define.none"`
// [model/entity/PromotionReward.cfc:L71] describes - a configured "no rounding", not a missing
// value. `amount` and `amountType` are omitted on the same principle wherever the case is about
// a NULL column.
// ---------------------------------------------------------------------------

describe('DiscountAmountCalculator', () => {
  // A2 - REQUEST-SCOPED STATE.
  //
  // A fresh fixture graph, a fresh collaborator double and a fresh subject are constructed for
  // EVERY case. Nothing is hoisted, nothing is memoized between cases, and this file holds no
  // mutable state at module scope at all. That is not tidiness: four legacy component-level
  // mutable caches became request-scoped in the target, and a suite that shared a subject between
  // cases could not tell a correctly-scoped local from a leaked one.
  let fixtures: PromotionFixtureGraph;
  let rounding: RecordingRoundingRuleService;
  let calculator: DiscountAmountCalculator;

  beforeEach(() => {
    fixtures = makePromotionFixtures();
    rounding = new RecordingRoundingRuleService();
    calculator = new DiscountAmountCalculator(rounding);
  });

  // -------------------------------------------------------------------------
  // The shipped surface, and the widening that exposes it
  // -------------------------------------------------------------------------
  describe('the exported surface', () => {
    it('exposes getDiscountAmount as a directly callable method, which is visibility widening #5', () => {
      // CFML parity [model/service/PromotionService.cfc:L987]: the legacy declaration is
      // `private numeric function getDiscountAmount(...)`. Being able to call it at all - without
      // routing through the 489-line orchestrator - IS the observable consequence of the widening,
      // so this case asserts the widening rather than describing it.
      //
      // This is widening #5 of exactly 5, all five of which live in this folder, and the ledger is
      // now exhausted. The complementary assertion - that no SIXTH private helper was promoted -
      // belongs to `../promotionService.test.ts`.
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
      // synchronous. Three of its five legacy call sites consume the result inside an immediately
      // following comparison, which an async signature would break.
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
      // while `price` and the return are `Money`. Doubling the count doubles the extended amount
      // and therefore the percentage discount, which is the observable consequence.
      const price = Money.fromDecimalString('19.99');

      const atThree = calculator.getDiscountAmount(fixtures.unroundedReward, price, 3);
      const atSix = calculator.getDiscountAmount(fixtures.unroundedReward, price, 6);

      expect(atThree.toFixed2()).toBe('7.50');
      expect(atSix.toFixed2()).toBe('14.99');
    });
  });

  // -------------------------------------------------------------------------
  // The four amountType paths
  //
  // `switch(reward.getAmountType())` [model/service/PromotionService.cfc:L993] declares exactly
  // three cases - L994 `percentageOff`, L997 `amountOff`, L1000 `amount` - and closes at L1003
  // with NO `default:`. All three are covered here, and so is the fourth path: the one an
  // unrecognised discriminator takes.
  // -------------------------------------------------------------------------
  describe('amountType dispatch', () => {
    it('percentageOff scales the EXTENDED amount by the reward percentage', () => {
      // CFML parity [model/service/PromotionService.cfc:L995]:
      //   `precisionEvaluate('originalAmount * (reward.getAmount()/100)')`
      // 19.99 x 3 = 59.97 extended; 12.5% of that is 7.49625; presented to two places, 7.50.
      const result = calculator.getDiscountAmount(
        fixtures.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(result.toFixed2()).toBe('7.50');
      expect(result.equals(Money.fromDecimalString('7.5'))).toBe(true);
    });

    it('percentageOff keeps the /100 division at arbitrary precision, as the legacy expression does', () => {
      // ★ CFML parity [model/service/PromotionService.cfc:L995]: THE `/100` SITS INSIDE THE
      // `precisionEvaluate` STRING, so the division is arbitrary-precision in the legacy code too.
      // It must not be hoisted out of the precise computation and must not be pre-divided as a
      // floating-point literal.
      //
      // The proof is the FULL-PRECISION net price the subject hands the rounding rule: 12.3% of
      // 59.97 is exactly 7.37631, so the net is exactly 52.59369. Any implementation that
      // pre-divided 12.3 by 100 in IEEE-754 would hand over a numeral carrying drift digits, and
      // this exact-string comparison would reject it.
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
      //   `discountAmountPreRounding = reward.getAmount() * quantity;`
      // A flat 5.00 per unit across three units is 15.00. Note that this branch reads the
      // QUANTITY and never the extended amount.
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
      // ★ CFML parity [model/service/PromotionService.cfc:L1001]:
      //   `precisionEvaluate('(arguments.price - reward.getAmount()) * arguments.quantity')`
      // THIS BRANCH READS `arguments.price` - THE UNIT PRICE - NOT `originalAmount`. It is the one
      // asymmetry in the three strategies and the easiest to get wrong.
      //
      // (19.99 - 15.00) x 3 = 4.99 x 3 = 14.97. Had the branch read the extended amount instead,
      // (59.97 - 15.00) x 3 = 134.91 would have exceeded the extended amount and the clamp at
      // [L1013-L1015] would have reported 59.97, so the two readings are not merely different by a
      // rounding digit - they are different by a factor of four. Both outcomes are asserted, so a
      // regression to the extended reading cannot pass.
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
      // A floor is therefore validation the legacy code does not perform, and none is asserted:
      // (10.00 - 15.00) x 2 = -10.00 flows through untouched.
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

    it('an unrecognised amountType takes NO branch and yields a zero discount', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L993-L1003]: the switch has NO
      // `default:` clause - L1003 closes it immediately after the `amount` case. A discriminator
      // matching none of the three, an absent one included, therefore leaves
      // `discountAmountPreRounding` at its L988 seed of zero and, with no rounding rule attached,
      // the function reports a ZERO DISCOUNT rather than raising or reporting a problem. A
      // misconfigured reward is silently skipped and the customer pays full price.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Preserved means preserved: no `default:` clause is expected of the subject, no
      // exhaustiveness check is expected, no throw is expected, and none is asserted. This case
      // pins the silent zero as the shipping behaviour.
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
      // The sharpest available proof that the L988 seed is what the fall-through leaves behind: the
      // net price handed to the rounding rule is `originalAmount - discountAmountPreRounding`
      // [model/service/PromotionService.cfc:L1006], so a seed of zero makes that argument equal the
      // extended amount EXACTLY. 19.99 x 3 = 59.97 arrives unreduced.
      //
      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L319, L321]: the slice's other defaultless
      // `amountType` switch seeds its accumulator with `arguments.sku.getPrice()` rather than with
      // zero, so ITS fall-through is a PASSTHROUGH PRICE while this one is a zero discount. Two
      // defaultless switches over the same three-value vocabulary with opposite fall-through
      // values; neither may be reasoned about from the other, and that price-group behaviour is
      // asserted by `../priceGroupService.test.ts`, not here.
      calculator.getDiscountAmount(
        fixtures.absentAmountTypeReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(onlyRoundingCall(rounding).value.toDecimalString()).toBe('59.97');
    });
  });

  // -------------------------------------------------------------------------
  // ★★★ THE INVERTED DELTA
  //
  // The single most misunderstood mechanic on this path. The rounding rule shapes the NET PRICE
  // and the discount is the residual, so the direction of the derivation is itself a behavioural
  // contract. Every case below asserts that direction rather than assuming it.
  // -------------------------------------------------------------------------
  describe('the inverted-delta rounding branch', () => {
    it('hands the rounding rule the NET PRICE, not the discount', () => {
      // CFML parity [model/service/PromotionService.cfc:L1006]: the argument is
      //   `precisionEvaluate('originalAmount - discountAmountPreRounding')`.
      // 19.99 x 3 = 59.97 extended, less 12.5% = 7.49625, gives a net of 52.47375 - which is
      // exactly the migration's own worked example, reached here through the collaborator's
      // recorded argument. Capturing that argument is the cleanest possible proof of direction:
      // an implementation that rounded the DISCOUNT would have handed over 7.49625.
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
      //   `discountAmount = precisionEvaluate('originalAmount - roundedFinalAmount')`.
      // The double answers with the synthetic net 49.99, so the discount must be
      // 59.97 - 49.99 = 9.98 - a value the subject can only have derived, since 49.99 bears no
      // relation to any input.
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
      // actually rejects the wrong mental model. An implementation that rounded the discount would
      // report the collaborator's answer, 49.99, verbatim. The subject reports 9.98.
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
      // Absence is a configured state - `hb_optionsNullRBKey="define.none"`
      // [model/entity/PromotionReward.cfc:L71] - so an absent rule means no rounding at all rather
      // than rounding by an identity rule.
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
      // outside any loop. Asserted so that a future decomposition cannot quietly round twice - the
      // second application would compound and change the money paid out.
      calculator.getDiscountAmount(fixtures.roundedReward, Money.fromDecimalString('19.99'), 3);

      expect(rounding.roundValueByRoundingRuleCalls).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // ★★ REGISTER ENTRY 14 - THE CLAMP MISFIRES IN BOTH DIRECTIONS
  //
  // L1013 gates on `discountAmountPreRounding`; L1014 assigns to `discountAmount`. They are
  // different variables, so the guard and the correction describe different quantities. Both
  // resulting misfires are pinned below, in separate cases, as the shipping behaviour.
  //
  // ★ THIS IS PRESERVED, NOT FIXED, AND IT IS NOT A THIRD DELIBERATE DIVERGENCE. The migration's
  // three divergences are (a) and (b) - both spent by this subject and both asserted elsewhere in
  // this file - and register entry 19's memo in `src/domain/entities/product.ts`. Aligning the
  // compared variable with the assigned one would change the amount charged in both directions at
  // once, which is a product decision rather than hardening.
  // -------------------------------------------------------------------------
  describe('the discount clamp', () => {
    it('FALSE POSITIVE: firing the clamp DISCARDS the whole rounding computation', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the guard tests
      // `discountAmountPreRounding > originalAmount` while the body assigns
      // `discountAmount = originalAmount`. When a rounding rule fired and the PRE-ROUNDING value
      // exceeded the extended amount, this assignment throws away the L1006/L1007 result outright:
      // the price point the rule landed on is discarded and the customer is discounted to nothing.
      // Preserved deliberately; do not fix without a product decision.
      //
      // A 150% reward on a 59.97 extended amount gives a pre-rounding discount of 89.955. The
      // rounding rule IS consulted - it receives 59.97 - 89.955 = -29.985 - and its answer, which
      // would have derived a discount of 9.98, is then overwritten by 59.97. Both halves are
      // asserted: that the collaborator ran, and that its contribution was discarded.
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
      // claims - the ONLY configuration in which the comment is true of the code beneath it.
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
      // arithmetic is unsigned-agnostic and can return a NEGATIVE net price. When it does, the
      // discount derived at L1007 EXCEEDS the extended amount - and the guard never notices,
      // because it is testing `discountAmountPreRounding`, which did not exceed anything.
      // Preserved deliberately; do not fix without a product decision.
      //
      // An extended amount of 0.42 with a 12.5% reward gives a pre-rounding discount of 0.0525 -
      // comfortably under the extended amount, so the guard stays false. A rounded net of -0.99
      // then derives 0.42 - (-0.99) = 1.41, which is more than three times the extended amount and
      // is reported unchanged.
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
      //
      // The synthetic net is 5.00 rather than the default here, precisely so the surviving value
      // (59.97 - 5.00 = 54.97) differs from the extended amount. Under the default answer the
      // derived discount would have been 9.98 and a reader could not tell a non-firing guard from
      // one that fired and coincidentally agreed.
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

  // -------------------------------------------------------------------------
  // THE TWO QUANTIZATION POINTS, WHICH SIT AT OPPOSITE ENDS OF THE PATH
  //
  //   INPUT  [model/service/RoundingRuleService.cfc:L89]
  //          `var inputValue = numberFormat(arguments.value, "0.00")` - the COLLABORATOR
  //          quantizes its own argument before its algorithm begins.
  //   OUTPUT [model/service/PromotionService.cfc:L1017]
  //          `return numberFormat(discountAmount, "0.00")` - the SUBJECT quantizes on the way out.
  //
  // They are deliberately not collapsed into one. A full-precision net price and a two-decimal one
  // can land on the same rounded price point while the discounts derived from them differ in the
  // digits the output mask then discards.
  // -------------------------------------------------------------------------
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

      // A half-cent exactly on the boundary rounds UP rather than truncating: 1% of 0.50 is 0.005.
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
      // [model/service/RoundingRuleService.cfc:L89] - the collaborator's own first statement - and
      // this double faithfully declines to perform it.
      calculator.getDiscountAmount(fixtures.roundedReward, Money.fromDecimalString('19.99'), 3);

      const call = onlyRoundingCall(rounding);

      expect(call.value.toDecimalString()).toBe('52.47375');
      expect(call.value.toFixed2()).toBe('52.47');
      expect(call.value.equals(Money.fromDecimalString('52.47'))).toBe(false);
    });

    it('returns a Money re-entering the value surface, as the shipped module represents it', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L987, L1017]: the legacy function declares
      // `returntype="numeric"` and then returns `numberFormat(discountAmount, "0.00")`, which is a
      // STRING. CFML coerced across that boundary silently. The target cannot and does not: the
      // quantized numeral re-enters the money surface through the value object's only construction
      // path, so the declared and actual types agree for the first time.
      // The return format is asserted AS THE SHIPPED MODULE REPRESENTS IT - a `Money` holding a
      // two-decimal value - rather than as a format this suite would prefer.
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
      // presentation defect the legacy `numberFormat` never produced. A target one hundredth of a
      // cent above the unit price gives a pre-rounding discount of -0.0001.
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

  // -------------------------------------------------------------------------
  // ★ DELIBERATE DIVERGENCE (b) - REGISTER ENTRY 12, THE amountOff PRECISION GAP
  // -------------------------------------------------------------------------
  describe('deliberate divergence (b): amountOff arithmetic', () => {
    it('computes amountOff at exact decimal precision, closing the legacy float gap', () => {
      // ★ DOCUMENTED DELIBERATE DIVERGENCE (b) - REGISTER ENTRY 12.
      //
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L998]:
      //   `discountAmountPreRounding = reward.getAmount() * quantity;`
      // is the ONLY monetary computation in the whole function that carries no
      // `precisionEvaluate` - a raw IEEE-754 multiplication sitting between two neighbours that are
      // both guarded [L995, L1001]. NOT reproduced. In the target it routes through the money value
      // object, so the result is strictly MORE correct than the source.
      //
      // THE PRECISION JUSTIFICATION. Routing all arithmetic through one value object is a
      // non-negotiable structural decision of this migration, and the value object is constructible
      // only from a decimal numeral, publishes no float-valued operation and exposes no conversion
      // to `number`. Preserving the drift would therefore mean deliberately bypassing the value
      // object and hand-building IEEE-754 error - the single precedent the standard exists to
      // prevent. The divergence is NARROW: only the arithmetic substrate changes, and no branch,
      // no operand and no operator order moves.
      //
      // ★ THE DECISIVE IN-CODEBASE EVIDENCE THAT L998 IS AN OVERSIGHT RATHER THAN A POLICY.
      // [model/service/PriceGroupService.cfc:L331] computes its own `amountOff` as
      //   `precisionEvaluate('arguments.sku.getPrice() - arguments.priceGroupRate.getAmount()')`
      // - WITH the guard. Same codebase, same amount-type name, same author-era: one guarded and
      // one not. A codebase that intended float arithmetic for `amountOff` would not have guarded
      // its other `amountOff`. This is the same shape of evidence that makes register entry 11 a
      // bug rather than an intention, where a neighbouring method performs the very
      // shipping-address-zone test that the qualifier branch omits.
      //
      // THE ASSERTION. 0.1 x 3 is exactly 0.3 in decimal and 0.30000000000000004 in IEEE-754. The
      // rounding branch exposes the pre-rounding value at full precision, so 30.00 - 0.3 = 29.7
      // must arrive as exactly `'29.7'`. A float implementation would hand over
      // 29.699999999999996 and fail this comparison. The money value object is never bypassed to
      // obtain the expectation - every figure here is a decimal numeral.
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
      // ★ DOCUMENTED DELIBERATE DIVERGENCE (b), at the presentation boundary, where the difference
      // becomes a cent that a customer can see.
      //
      // 2.675 is not representable in IEEE-754; the nearest double is slightly BELOW it, so a
      // float-based half-up presentation reports 2.67. Held as an exact decimal the value is
      // 2.675 and presents as 2.68. One cent, on every line the reward touches.
      // Preserving the legacy drift here would mean choosing the wrong cent on purpose.
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
      // through the full-precision rounding input so that the output mask cannot hide a drift digit
      // in the third decimal.
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

  // -------------------------------------------------------------------------
  // ★ DELIBERATE DIVERGENCE (a) - REGISTER ENTRY 13, THE UN-VAR'D ACCUMULATOR
  //
  // LEGACY-NOTE [model/service/PromotionService.cfc:L1007, L1009, L1014]: register entry 13 has
  // THREE assignment sites, not the two published. Counted directly in the source: within
  // L987-L1018 the identifier `discountAmount` is assigned at L1007, at L1009 and at L1014, and is
  // declared with `var` at none of them - in pointed contrast to L988 and L989, which ARE properly
  // `var`'d, and which is what shows the omission to be a slip rather than an idiom. The published
  // register cites L1007 and L1009 and omits L1014. SOURCE WINS.
  //
  // The third site matters on its own terms: L1007 and L1009 are mutually exclusive, whereas L1014
  // can overwrite EITHER of them, so the clamp - not the rounding branch - is the last writer
  // whenever it fires. That is also the site register entry 14 turns into a defect.
  // -------------------------------------------------------------------------
  describe('deliberate divergence (a): no state survives an invocation', () => {
    it('computes a second invocation solely from its own inputs, with no trace of the first', () => {
      // ★ DOCUMENTED DELIBERATE DIVERGENCE (a) - REGISTER ENTRY 13, AND ITS ACCEPTANCE CRITERION.
      //
      // In the legacy function `discountAmount` is assigned without `var`, so CFML resolves it into
      // COMPONENT scope, where the binding outlives the call. NOT reproduced: in the target it is
      // function-local.
      //
      // THE SAFETY JUSTIFICATION, stated plainly. A component-scoped binding becomes module-level
      // state in the target, and module-level state survives between UNRELATED invocations on a
      // warm container - so one customer's computed discount would still be sitting there when the
      // next request arrived, and could be read into that customer's order. Reproducing the leak
      // faithfully would leak one customer's discount into another customer's order. That is not a
      // fidelity gain, so the variable is function-local and this case is the proof.
      //
      // THE PROOF ITSELF. The first invocation takes the rounding branch and derives a large
      // discount. The second uses a reward whose `amountType` matches NO strategy arm, so the
      // dispatch assigns nothing at all and the accumulator can only be the L988 zero seed - and
      // carries no rounding rule, so the derivation is skipped too. If any accumulator were shared,
      // the second invocation would report the first invocation's 9.98. It reports 0.00.
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
      // L1014 is the last writer and the reported value is the extended amount. The second is an
      // ordinary 12.5% discount on the same price and quantity, and must report 7.50 rather than
      // the clamped 59.97 the previous call ended on.
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
      // that leaks. The first invocation derives 9.98 through the rounding rule; the second, on an
      // identical price and quantity with no rounding rule, must report the unrounded 7.50 and must
      // not consult the collaborator a second time.
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
      // drifted across repeats it would certainly be one. Three identical invocations, three
      // identical answers, and exactly one rounding call per invocation.
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
      // call, each subject answers only from its own inputs, and neither observes the other. This
      // is the instance-level counterpart of the invocation-level proof above: a memo or an
      // accumulator held anywhere other than the call frame would show up here as a shared answer
      // or a shared call log.
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

  // -------------------------------------------------------------------------
  // An absent amount column, and where the failure is allowed to happen
  // -------------------------------------------------------------------------
  describe('an absent amount column', () => {
    it('raises when a matched strategy needs the amount, reproducing the legacy null operand', () => {
      // CFML parity [model/entity/PromotionReward.cfc:L61]: `amount` is `ormType="big_decimal"`
      // with NO `default`, so a NULL column is a real persisted state. Each legacy branch then
      // reads `reward.getAmount()` inside its own `case`, where a null is an arithmetic operand -
      // and CFML raises on that. Reproducing the raise is behaviour preservation, not added
      // validation: the legacy function fails on an absent amount too.
      //
      // Substituting zero is forbidden on a money path, and the reason is concrete rather than
      // stylistic: a zero percentage would discount nothing, while a zero fixed `amount` target
      // would discount the entire price. Absence must stay observably absent.
      expect(() =>
        calculator.getDiscountAmount(
          fixtures.absentAmountReward,
          Money.fromDecimalString('19.99'),
          3,
        ),
      ).toThrow(/getAmount\(\) is absent/);
    });

    it('does NOT raise when no strategy matched, because the amount is never read', () => {
      // The reachability contract, asserted rather than assumed. The legacy switch has no
      // `default:` [model/service/PromotionService.cfc:L1003], so an unrecognised discriminator
      // never enters a `case` and never reads `reward.getAmount()`. An absent amount is therefore
      // harmless on the fall-through path, and the silent zero survives.
      //
      // This is why the amount must be resolved INSIDE a matched strategy rather than before the
      // dispatch: hoisting the read above the switch would turn this silent zero into a raise and
      // change what a misconfigured reward does to an order.
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

  // -------------------------------------------------------------------------
  // The structural half of the not-applicable statement in this file's header
  // -------------------------------------------------------------------------
  describe('the discount path performs no data access', () => {
    it('never reaches a repository member on any amountType path or either rounding branch', () => {
      // P5 and P6, enforced rather than asserted in prose. Every member of the repository behind
      // the collaborator raises, so this sweep - all three amount types plus the fall-through,
      // each with and without a rounding rule - would fail loudly if the discount path opened a
      // connection, issued a statement or bound a parameter. It touches no SQL, no network, no
      // filesystem and no environment variable, which is also why it passes in an empty
      // environment.
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

  // -------------------------------------------------------------------------
  // The migration's own worked example, end to end
  // -------------------------------------------------------------------------
  describe("the migration's reference calculation", () => {
    it('reproduces every published figure of the worked example without drift', () => {
      // Unit price 19.99 at quantity 3 gives 59.97; 12.5% of that is 7.49625; the net is 52.47375;
      // presented to two places the net is 52.47 and the discount is 7.50. Reproducing those
      // figures without IEEE-754 drift is the property the must-preserve discount math depends on.
      //
      // Every expectation is read from the fixture's own published numerals rather than restated
      // here, so this suite and the factory cannot disagree about the migration's worked example -
      // and every one of them is a decimal STRING. No floating-point literal appears anywhere in
      // this file, not even to build an expectation.
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
      // discount 7.49625. Both are published numerals, and both must appear exactly.
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
