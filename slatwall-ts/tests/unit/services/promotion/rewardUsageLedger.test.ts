// `meta/tests/unit/service/` holds exactly four components - `AccountServiceTest.cfc`,
// `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc`.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L223-L224]: vector 6 is a folder-analysis
// discovery, not one of the five the plan publishes. It is recorded as a sixth so the count of
// known mechanisms is honest rather than inherited, and the count stays at six.
//
// No signature reshaping (the project's three are the anti-corruption inversions, the two
// smart-list renames and the feed adapter's `generateProductFeed`). No visibility widening (all
// five live in this folder and the ledger is exhausted; none is consumed here).

import { beforeEach, describe, expect, it } from 'vitest';

import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type {
  OrderItemUsage,
  PromotionRewardUsageDetail,
  UnlimitedUseSentinel,
} from '../../../../src/domain/promotionEngine/rewardUsageTypes.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';
import { RewardUsageLedger } from '../../../../src/services/promotion/rewardUsageLedger.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// Types derived from the shipped surface, never restated.
//
// JUDGMENT CALL: the fixture graph type is DERIVED with `ReturnType` rather than imported, because
// `promotionFixtures.ts` deliberately publishes exactly one symbol - the factory - and its graph
// interface is not exported.

/**
 * The graph `makePromotionFixtures` hands back, as it declares it.
 */
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

/**
 * The `Sku` the graph carries, reached structurally so no entity import is needed.
 */
type FixtureSku = PromotionFixtureGraph['sku'];

// The sentinel, written exactly as the source writes it.
//
// CFML parity [model/service/PromotionService.cfc:L175-L177]: `1000000`, with no numeric
// separator, so the literal greps identically in the target and in the legacy source.
const UNLIMITED_USE_SENTINEL: UnlimitedUseSentinel = 1000000;

// Monetary values as decimal STRINGS, and counts as plain numbers.
//
// Not one expected monetary value below is computed with JavaScript arithmetic.

/**
 * `2.50 / 2` is exactly `1.25` - the pinned three-member usage record.
 */
const DISCOUNT_TWO_FIFTY = '2.50';

/**
 * Quotient `1`, from `3.00 / 3`. The LOW per-use value in the ordering cases.
 */
const DISCOUNT_THREE = '3.00';

/**
 * Quotient `2`, from `4.00 / 2`. The MIDDLE per-use value.
 */
const DISCOUNT_FOUR = '4.00';

/**
 * Quotient `2` again, from `2.00 / 1` - the deliberate TIE against `4.00 / 2`.
 */
const DISCOUNT_TWO = '2.00';

/**
 * Quotient `3`, from `9.00 / 3`. The HIGH per-use value.
 */
const DISCOUNT_NINE = '9.00';

/**
 * A discount of exactly nothing, used to probe the façade-owned L257 gate's boundary.
 */
const DISCOUNT_ZERO = '0';

/**
 * A negative discount, which the legacy gate at L257 likewise excludes.
 */
const DISCOUNT_NEGATIVE_FIVE = '-5.00';

/**
 * The canonical quotients the assertions below pin, as decimal strings.
 */
const PER_USE_ONE = '1';
const PER_USE_TWO = '2';
const PER_USE_THREE = '3';
const PER_USE_ONE_AND_A_QUARTER = '1.25';

/**
 * The substring the shipped zero-divisor refusal always carries.
 *
 * CFML parity [model/service/PromotionService.cfc:L299]: the legacy divisor is unguarded and CFML
 * raises a division-by-zero error.
 */
const ZERO_DIVISOR_MESSAGE = /received a zero divisor/;

/**
 * JUDGMENT CALL: constructed INLINE in this suite rather than imported from a shared order-view
 * fixture module. Two reasons, both deliberate.
 *
 * @param sku the fixture graph's SKU; carried because the view declares it, and read by nothing in
 * this module.
 * @param orderItemID the opaque identifier the usage record will carry.
 */
function makeOrderItemView(sku: FixtureSku, orderItemID: string): OrderItemView {
  return {
    orderItemID,
    sku,
    quantity: 3,
    price: Money.fromDecimalString('19.99'),
    skuPrice: Money.fromDecimalString('19.99'),
    extendedPrice: Money.fromDecimalString('59.97'),
    extendedSkuPrice: Money.fromDecimalString('59.97'),
    appliedPriceGroup: undefined,
    orderItemType: { systemCode: 'oitSale' },
    orderFulfillmentID: 'reward-usage-ledger-fulfillment',
    appliedPromotions: [],
  };
}

/**
 * A promotion reward carrying only an identifier and, optionally, use limits.
 *
 * The four canonical limit SHAPES - absent, zero, negative and positive - come from the fixture
 * graph's purpose-built exhibits, which is what those exhibits exist for.
 *
 * `PromotionReward`'s constructor requires `promotionRewardID` alone
 * `src/domain/entities/promotionReward.ts`; every other member is optional and every collection
 * defaults to empty.
 */
function makeRewardWithID(
  promotionRewardID: string,
  limits: {
    readonly maximumUsePerOrder?: number;
    readonly maximumUsePerItem?: number;
    readonly maximumUsePerQualification?: number;
  } = {},
): PromotionReward {
  return new PromotionReward({ promotionRewardID, ...limits });
}

/**
 * The entry at `index`, proven present before it is read.
 *
 * `noUncheckedIndexedAccess` types every indexed read as `OrderItemUsage | undefined`, and this
 * suite uses neither a postfix `!` nor a cast to make that go away.
 */
function usageAt(usage: PromotionRewardUsageDetail, index: number): OrderItemUsage {
  const entry = usage.orderItemsUsage[index];

  if (entry === undefined) {
    throw new Error(
      `orderItemsUsage has no entry at index ${String(index)}; it holds ` +
        `${String(usage.orderItemsUsage.length)} entries.`,
    );
  }

  return entry;
}

/**
 * The per-use values of a reward's usage records, in the order the array holds them.
 */
function perUseValues(usage: PromotionRewardUsageDetail): string[] {
  return usage.orderItemsUsage.map((entry) => entry.discountPerUseValue.toDecimalString());
}

/**
 * The opaque order-item identifiers of a reward's usage records, in array order.
 */
function orderItemIDs(usage: PromotionRewardUsageDetail): string[] {
  return usage.orderItemsUsage.map((entry) => entry.orderItemID);
}

describe('RewardUsageLedger', () => {
  let fixtures: PromotionFixtureGraph;
  let ledger: RewardUsageLedger;

  beforeEach(() => {
    fixtures = makePromotionFixtures();
    ledger = new RewardUsageLedger();
  });

  describe('the shipped surface', () => {
    it('publishes one accessor and three synchronous methods, and takes no collaborator', () => {
      // CFML parity: the subject replaces DI/1's convention scan for this fragment entirely - the
      // legacy ledger is a bare `var` struct with no collaborator at all, so the ported class
      // takes no constructor argument and the whole dependency graph for it is empty.
      expect(RewardUsageLedger.length).toBe(0);

      expect(typeof ledger.ensureRewardEntry).toBe('function');
      expect(typeof ledger.ratchetMaximumUsePerOrder).toBe('function');
      expect(typeof ledger.recordOrderItemUsage).toBe('function');

      // Arities, pinned so a silently added parameter fails here.
      expect(ledger.ensureRewardEntry.length).toBe(1);
      expect(ledger.ratchetMaximumUsePerOrder.length).toBe(2);
      expect(ledger.recordOrderItemUsage.length).toBe(4);
    });

    it('exposes the ledger through a getter with no setter', () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        RewardUsageLedger.prototype,
        'promotionRewardUsageDetails',
      );

      expect(descriptor).toBeDefined();

      if (descriptor === undefined) {
        throw new Error('promotionRewardUsageDetails is not declared on the prototype.');
      }

      expect(typeof descriptor.get).toBe('function');

      // Probed through `typeof` rather than by reading the descriptor member as a value.
      expect(typeof descriptor.set).toBe('undefined');
    });

    it('keeps the ascending insertion sort private, so its ordering cannot be bypassed', () => {
      // @ts-expect-error insertUsageInAscendingOrder is private to RewardUsageLedger.
      expect(typeof ledger.insertUsageInAscendingOrder).toBe('function');
    });

    it('declares exactly the six prototype members, and publishes nothing more', () => {
      // Sorted, because prototype declaration order is not part of the contract.
      expect(Object.getOwnPropertyNames(RewardUsageLedger.prototype).slice().sort()).toStrictEqual([
        'constructor',
        'ensureRewardEntry',
        'insertUsageInAscendingOrder',
        'promotionRewardUsageDetails',
        'ratchetMaximumUsePerOrder',
        'recordOrderItemUsage',
      ]);
    });

    it('answers synchronously - nothing here returns a promise', () => {
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      // The legacy fragments perform no query and no I/O, so the ported surface is synchronous end
      // to end: no method here is declared `async`, none returns a promise, and nothing in this
      // file ever suspends on one.
      expect(usage).not.toBeInstanceOf(Promise);
      expect(ledger.ratchetMaximumUsePerOrder(usage, 1)).toBeUndefined();
      expect(
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
          1,
          Money.fromDecimalString(DISCOUNT_TWO),
        ),
      ).toBeUndefined();
    });

    it('starts empty, exactly as `var promotionRewardUsageDetails = {}` does', () => {
      // CFML parity [model/service/PromotionService.cfc:L139]: the struct is declared empty and
      // gains a key per reward encountered.
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toStrictEqual([]);
    });
  });

  describe('request-scoped state (A2)', () => {
    it('gives two independently constructed ledgers completely separate state', () => {
      const other = new RewardUsageLedger();

      const mutated = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      ledger.recordOrderItemUsage(
        mutated,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(mutated.usedInOrder).toBe(2);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toHaveLength(1);
      expect(Object.keys(other.promotionRewardUsageDetails)).toStrictEqual([]);
      const untouched = other.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(untouched).not.toBe(mutated);
      expect(untouched.usedInOrder).toBe(0);
      expect(untouched.orderItemsUsage).toStrictEqual([]);
      expect(untouched.orderItemsUsage).not.toBe(mutated.orderItemsUsage);
    });

    it('returns the LIVE record from the accessor, not a defensive copy', () => {
      // JUDGMENT CALL recorded on the shipped getter: a copy would break the algorithm rather than
      // protect it, because over-use stripping is specified against the ratcheted and incremented
      // values this class produces.
      expect(ledger.promotionRewardUsageDetails).toBe(ledger.promotionRewardUsageDetails);

      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const rewardID = fixtures.boundedUseLimitsReward.getPromotionRewardID();

      expect(ledger.promotionRewardUsageDetails[rewardID]).toBe(usage);

      ledger.ratchetMaximumUsePerOrder(usage, 0);

      const throughAccessor = ledger.promotionRewardUsageDetails[rewardID];

      expect(throughAccessor).toBeDefined();

      if (throughAccessor === undefined) {
        throw new Error('the seeded entry is not reachable through the accessor.');
      }

      // A mutation made through the returned entry is visible through the accessor, because they
      // are one object.
      expect(throughAccessor.maximumUsePerOrder).toBe(0);
    });
  });

  describe('seeding - the 1000000 sentinel', () => {
    it('seeds all three use limits with the literal 1000000 when none is configured', () => {
      // CFML parity [model/service/PromotionService.cfc:L174-L178]: the seed writes
      // `usedInOrder = 0`, all three limits at `1000000`, and an empty `orderItemsUsage`.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(usage.usedInOrder).toBe(0);
      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);
      expect(usage.orderItemsUsage).toStrictEqual([]);

      // The same value reached through the published literal type, so a changed sentinel fails to
      // compile as well as failing here.
      expect(usage.maximumUsePerOrder).toBe(UNLIMITED_USE_SENTINEL);
      expect(fixtures.unlimitedUseSentinel).toBe(UNLIMITED_USE_SENTINEL);
    });

    it('★ keeps the sentinel FINITE, because it is a multiplicand and a subtrahend', () => {
      // CFML parity [model/service/PromotionService.cfc:L223, L224, L228, L236, L472]:
      // substituting `Infinity`, `Number.MAX_SAFE_INTEGER`, `null`, `undefined` or an optional key
      // is not a safer choice, because the sentinel does not merely get compared against - it is
      // multiplied at L223, ASSIGNED back into a stored limit at L224, re-derived at L228.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(Number.isFinite(usage.maximumUsePerOrder)).toBe(true);
      expect(Number.isSafeInteger(usage.maximumUsePerOrder)).toBe(true);

      // The multiplication at L223 stays a finite integer.
      expect(Number.isSafeInteger(3 * usage.maximumUsePerQualification)).toBe(true);

      // The subtraction at L472 stays a finite number rather than becoming NaN.
      expect(Number.isFinite(usage.usedInOrder - usage.maximumUsePerOrder)).toBe(true);
      expect(Number.isNaN(usage.usedInOrder - usage.maximumUsePerOrder)).toBe(false);
    });

    it('LEGACY-NOTE: absence and 1000000 are TWO representations of one concept', () => {
      // LEGACY-NOTE [model/entity/PromotionReward.cfc:L65-L67]: the three limit columns declare
      // `ormtype="integer" hb_nullRBKey="define.unlimited"`, so at the ENTITY layer ABSENCE means
      // unlimited and the ported accessors return `number | undefined`.
      expect(fixtures.unlimitedUseLimitsReward.getMaximumUsePerOrder()).toBeUndefined();
      expect(fixtures.unlimitedUseLimitsReward.getMaximumUsePerItem()).toBeUndefined();
      expect(fixtures.unlimitedUseLimitsReward.getMaximumUsePerQualification()).toBeUndefined();

      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);
    });
  });

  describe('seeding - the four shapes a persisted use limit can take', () => {
    it('1. an ABSENT limit leaves the sentinel in place - the documented shape', () => {
      // CFML parity [model/service/PromotionService.cfc:L180, L183, L186]: the `!isNull(...)` half
      // of each guard. This is the shape `model/validation/PromotionReward.json` validates as
      // legitimate, since it leaves all three merely `numeric` rather than required.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);
    });

    it('2. ★★★ a persisted 0 ALSO leaves the sentinel in place, so ZERO MEANS UNLIMITED', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L180, L183, L186]: each guard is
      // `!isNull(x) && x > 0`, so a stored `0` FAILS the strictly-greater test, the override never
      // fires and the 1000000 sentinel survives.
      // Preserved deliberately; do not fix without a product decision.
      expect(fixtures.zeroUseLimitsReward.getMaximumUsePerOrder()).toBe(0);
      expect(fixtures.zeroUseLimitsReward.getMaximumUsePerItem()).toBe(0);
      expect(fixtures.zeroUseLimitsReward.getMaximumUsePerQualification()).toBe(0);

      const usage = ledger.ensureRewardEntry(fixtures.zeroUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);

      // Not zero. Stated explicitly, because reading `0` here is what a reader expects and is
      // precisely the answer the legacy does not give.
      expect(usage.maximumUsePerOrder).not.toBe(0);
    });

    it('3. ★★★ a persisted NEGATIVE limit means unlimited too, by the same guard', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L180, L183, L186]: a negative value
      // fails the identical `> 0` test and takes the identical fall-through, so it is unlimited as
      // well.
      // Preserved deliberately; do not fix without a product decision.
      expect(fixtures.negativeUseLimitsReward.getMaximumUsePerOrder()).toBe(-1);
      expect(fixtures.negativeUseLimitsReward.getMaximumUsePerItem()).toBe(-1);
      expect(fixtures.negativeUseLimitsReward.getMaximumUsePerQualification()).toBe(-1);

      const usage = ledger.ensureRewardEntry(fixtures.negativeUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);
    });

    it('4. a POSITIVE limit is the only shape that overrides the sentinel', () => {
      // CFML parity [model/service/PromotionService.cfc:L181, L184, L187]: the three assignments,
      // each reached only when its guard passes. This is therefore the only shape under which
      // use-limit enforcement is observable at all.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(2);
      expect(usage.maximumUsePerItem).toBe(1);
      expect(usage.maximumUsePerQualification).toBe(3);
    });

    it('overrides each limit INDEPENDENTLY - three guards, not one', () => {
      // The three guards at L180, L183 and L186 are separate statements, so a reward may
      // legitimately configure one limit and leave the other two unlimited. A single combined
      // guard would be a behaviour change.
      const partiallyConfigured = makeRewardWithID('reward-per-item-only', {
        maximumUsePerItem: 4,
      });

      const usage = ledger.ensureRewardEntry(partiallyConfigured);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(4);
      expect(usage.maximumUsePerQualification).toBe(1000000);
    });

    it('accepts a fractional positive limit unchanged, because nothing coerces it', () => {
      // The columns are `ormtype="integer"`, but the guard only tests `> 0` and the assignment
      // copies the value through.
      const fractional = makeRewardWithID('reward-fractional-limit', {
        maximumUsePerOrder: 2.5,
      });

      expect(ledger.ensureRewardEntry(fractional).maximumUsePerOrder).toBe(2.5);
    });
  });

  describe('seeding - the L172 guard makes it FIRST-WINS and idempotent', () => {
    it('seeds a reward exactly once and returns the very same entry afterwards', () => {
      // CFML parity [model/service/PromotionService.cfc:L172, L189]: the whole seed sits inside
      // `if(!structKeyExists(...))`, so a re-encountered reward keeps every bit of accumulated
      // state - no re-seed, no re-read of the reward's limits, no reset of `usedInOrder`.
      const first = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.recordOrderItemUsage(
        first,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      const second = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(second).toBe(first);
      expect(second.usedInOrder).toBe(2);
      expect(second.orderItemsUsage).toHaveLength(1);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toHaveLength(1);
    });

    it('★ FIRST-WINS on the LIMITS too, so which reward object arrived first decides them', () => {
      // CFML parity [model/service/PromotionService.cfc:L172]: the guard keys on the identifier
      // alone.
      const strict = makeRewardWithID('reward-shared-id', { maximumUsePerOrder: 2 });
      const lax = makeRewardWithID('reward-shared-id', { maximumUsePerOrder: 9 });

      const seeded = ledger.ensureRewardEntry(strict);
      const reEncountered = ledger.ensureRewardEntry(lax);

      expect(reEncountered).toBe(seeded);
      expect(reEncountered.maximumUsePerOrder).toBe(2);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toHaveLength(1);
    });

    it('★ FOLDS KEY CASE ON BOTH THE PRESENCE TEST AND THE READ, so ONE key survives', () => {
      // CFML parity [model/service/PromotionService.cfc:L172, L189]: a CFML struct key is
      // case-insensitive, so the legacy guard FINDS the existing entry and the block does nothing
      // at all - one entry, reused, with its accumulated usage and its first-seen limits intact.
      const upper = makeRewardWithID('REWARD-CASE', { maximumUsePerOrder: 4 });
      const lower = makeRewardWithID('reward-case', { maximumUsePerOrder: 7 });

      const upperUsage = ledger.ensureRewardEntry(upper);

      // Accumulated state on the first entry, so the reuse below is proven to preserve it rather
      // than merely to return an object of the right shape.
      upperUsage.usedInOrder = 3;

      const lowerUsage = ledger.ensureRewardEntry(lower);

      // The same object, not an equal one.
      expect(lowerUsage).toBe(upperUsage);

      // First-wins on the limits, exactly as it does for an identical spelling: the second
      // reward's `maximumUsePerOrder` of 7 is ignored entirely.
      expect(lowerUsage.maximumUsePerOrder).toBe(4);

      // And the running total survives the second encounter untouched.
      expect(lowerUsage.usedInOrder).toBe(3);

      // Exactly one key, stored under the spelling that arrived FIRST. No second entry is added
      // and the original key is not rewritten to the new casing.
      const keys = Object.keys(ledger.promotionRewardUsageDetails);

      expect(keys).toStrictEqual(['REWARD-CASE']);
    });

    it('stores a reward identifier that collides with an Object.prototype name', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L173-L178]: a CFML struct has no prototype
      // chain and no reserved keys, so the legacy accumulated usage under `__proto__` like any
      // other reward.
      const collidingReward = makeRewardWithID('__proto__', { maximumUsePerOrder: 5 });

      const seeded = ledger.ensureRewardEntry(collidingReward);

      expect(seeded.maximumUsePerOrder).toBe(5);
      expect(
        Object.prototype.hasOwnProperty.call(ledger.promotionRewardUsageDetails, '__proto__'),
      ).toBe(true);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toStrictEqual(['__proto__']);

      // Usage accumulates against it, and re-encountering it does not reset.
      ledger.recordOrderItemUsage(
        seeded,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        3,
        Money.fromDecimalString(DISCOUNT_THREE),
      );

      const reEncountered = ledger.ensureRewardEntry(collidingReward);

      expect(reEncountered).toBe(seeded);
      expect(reEncountered.usedInOrder).toBe(3);
    });

    it('keeps one entry per reward, each with its own usage array', () => {
      const first = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const second = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(second).not.toBe(first);
      expect(second.orderItemsUsage).not.toBe(first.orderItemsUsage);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toHaveLength(2);
    });
  });

  describe('the published mutability contract, member by member', () => {
    it('lets `usedInOrder` and `maximumUsePerOrder` be written - they are MUTABLE', () => {
      // CFML parity [model/service/PromotionService.cfc:L297, L224]: `usedInOrder` is written by
      // the increment and `maximumUsePerOrder` by the ratchet, so both are declared without
      // `readonly` on `PromotionRewardUsageDetail`.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      usage.usedInOrder = 5;
      usage.maximumUsePerOrder = 1;

      expect(usage.usedInOrder).toBe(5);
      expect(usage.maximumUsePerOrder).toBe(1);
    });

    it('refuses to rebind `maximumUsePerItem` - it is readonly after the seed', () => {
      // CFML parity [model/service/PromotionService.cfc:L184]: written once by the seed and
      // thereafter only READ, at L236 and L237. The `readonly` modifier records that, and this
      // deliberate type failure is what pins it.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      // @ts-expect-error maximumUsePerItem is readonly on PromotionRewardUsageDetail.
      usage.maximumUsePerItem = 99;

      expect(usage.maximumUsePerItem).toBe(99);
    });

    it('refuses to rebind `maximumUsePerQualification` - readonly for the same reason', () => {
      // CFML parity [model/service/PromotionService.cfc:L187]: written once by the seed, then only
      // read - at L223, L224 and L228.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      // @ts-expect-error maximumUsePerQualification is readonly.
      usage.maximumUsePerQualification = 99;

      expect(usage.maximumUsePerQualification).toBe(99);
    });

    it('★ refuses to REBIND `orderItemsUsage`, while its CONTENTS stay mutable', () => {
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      // @ts-expect-error orderItemsUsage is a readonly property binding.
      usage.orderItemsUsage = [];

      // If `orderItemsUsage` were declared `ReadonlyArray<OrderItemUsage>` this conditional would
      // resolve to `false` and the annotation below would be a compile error.
      type OrderItemsUsageIsMutableArray =
        PromotionRewardUsageDetail['orderItemsUsage'] extends OrderItemUsage[] ? true : false;

      const orderItemsUsageIsMutableArray: OrderItemsUsageIsMutableArray = true;

      expect(orderItemsUsageIsMutableArray).toBe(true);
    });

    it('grows `orderItemsUsage` in place, proving the array itself is not frozen', () => {
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const arrayIdentity = usage.orderItemsUsage;

      expect(arrayIdentity).toHaveLength(0);
      expect(Object.isFrozen(arrayIdentity)).toBe(false);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );
      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.secondOrderItemID),
        3,
        Money.fromDecimalString(DISCOUNT_THREE),
      );

      // Same array object throughout - the entries were added to it, not to a replacement.
      expect(usage.orderItemsUsage).toBe(arrayIdentity);
      expect(arrayIdentity).toHaveLength(2);
    });
  });

  describe('OrderItemUsage - exactly three members, and no fourth', () => {
    it('files a record of precisely orderItemID, discountQuantity and discountPerUseValue', () => {
      // CFML parity [model/service/PromotionService.cfc:L309-L313, L323-L327]: both the insert
      // literal and the append literal carry exactly these three members.
      //
      // `2.50 / 2` is exactly `1.25`, computed by the decimal substrate and never by JavaScript
      // floating point.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_TWO_FIFTY),
      );

      expect(usageAt(usage, 0)).toStrictEqual({
        orderItemID: fixtures.opaqueOrderReferences.orderItemID,
        discountQuantity: 2,
        discountPerUseValue: Money.fromDecimalString(PER_USE_ONE_AND_A_QUARTER),
      });

      expect(Object.keys(usageAt(usage, 0)).slice().sort()).toStrictEqual([
        'discountPerUseValue',
        'discountQuantity',
        'orderItemID',
      ]);
    });

    it('carries the order-item identifier through OPAQUELY, verbatim and unparsed', () => {
      // The identifier is never parsed, never validated as a UUID and never used to look anything
      // up: `Order` and `OrderItem` are out of scope and this string is the whole of what crosses
      // the anti-corruption boundary.
      const opaqueIdentifier = '  Not A UUID :: 42 ';
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, opaqueIdentifier),
        1,
        Money.fromDecimalString(DISCOUNT_TWO),
      );

      expect(usageAt(usage, 0).orderItemID).toBe(opaqueIdentifier);
    });

    it('keeps `discountQuantity` a plain COUNT and `discountPerUseValue` MONEY', () => {
      // The distinction is load-bearing. `OrderItem.quantity` is `ormtype="integer"`, so a
      // quantity is a count and is never wrapped in `Money`; the per-use value is the only
      // monetary member of the record.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        3,
        Money.fromDecimalString(DISCOUNT_THREE),
      );

      const entry = usageAt(usage, 0);

      expect(typeof entry.discountQuantity).toBe('number');
      expect(entry.discountPerUseValue).toBeInstanceOf(Money);
      expect(entry.discountPerUseValue.toDecimalString()).toBe(PER_USE_ONE);
    });

    it('reproduces the reference discount calculation without floating-point drift', () => {
      // The migration's reference figures: 19.99 at quantity 3 is 59.97, less 12.5 per cent is a
      // discount of 7.49625, which presents as "7.50".
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        fixtures.referenceCalculation.quantity,
        Money.fromDecimalString(fixtures.referenceCalculation.discountAmount),
      );

      const entry = usageAt(usage, 0);

      expect(entry.discountPerUseValue.toDecimalString()).toBe('2.49875');
      expect(entry.discountPerUseValue.times(3).toFixed2()).toBe('7.50');
      expect(usage.usedInOrder).toBe(3);
    });
  });

  describe('the ratchet - order-dependence vector 6', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L223-L224]: this ratchet is a SIXTH
    // order-dependence mechanism, discovered while analysing this decomposition rather than
    // inherited from the five the plan publishes.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L228]: the façade derives `discountQuantity`
    // from the same `qualificationQuantity * maximumUsePerQualification` product this ratchet
    // compares, which is why the two can never disagree.

    it('lowers the per-order limit when the qualified allowance is STRICTLY smaller', () => {
      // CFML parity [model/service/PromotionService.cfc:L223-L224]: `2 * 3 = 6`, and `6 lt 7`, so
      // the limit becomes.
      const reward = makeRewardWithID('reward-ratchet-lowers', {
        maximumUsePerOrder: 7,
        maximumUsePerQualification: 3,
      });

      const usage = ledger.ensureRewardEntry(reward);

      expect(usage.maximumUsePerOrder).toBe(7);

      ledger.ratchetMaximumUsePerOrder(usage, 2);

      expect(usage.maximumUsePerOrder).toBe(6);
    });

    it('★ leaves the limit alone when the allowance EQUALS it - `lt` is STRICT', () => {
      // CFML parity [model/service/PromotionService.cfc:L223]: the CFML word operator `lt` is
      // strictly less than, so an allowance equal to the current limit does not reassign.
      const reward = makeRewardWithID('reward-ratchet-equal', {
        maximumUsePerOrder: 6,
        maximumUsePerQualification: 3,
      });

      const usage = ledger.ensureRewardEntry(reward);

      ledger.ratchetMaximumUsePerOrder(usage, 2);

      expect(usage.maximumUsePerOrder).toBe(6);
    });

    it('★ leaves the SENTINEL alone for the commonest case, `1 * 1000000`', () => {
      // CFML parity [model/service/PromotionService.cfc:L223]: with no configured
      // per-qualification limit the allowance is `1 * 1000000`, which is not less than the seeded
      // `1000000`, so nothing is reassigned.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.ratchetMaximumUsePerOrder(usage, 1);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(1 * usage.maximumUsePerQualification).toBe(1000000);
    });

    it('is MONOTONICALLY NON-INCREASING - a larger allowance never raises the limit', () => {
      // CFML parity [model/service/PromotionService.cfc:L223-L224]: the guard admits only a
      // smaller product, so successive calls can only lower the value.
      const reward = makeRewardWithID('reward-ratchet-monotonic', {
        maximumUsePerOrder: 20,
        maximumUsePerQualification: 2,
      });

      const usage = ledger.ensureRewardEntry(reward);
      const observed: number[] = [usage.maximumUsePerOrder];

      for (const qualificationQuantity of [4, 9, 3, 7, 1, 6]) {
        ledger.ratchetMaximumUsePerOrder(usage, qualificationQuantity);
        observed.push(usage.maximumUsePerOrder);
      }

      // 20, then 4*2=8, then 9*2=18 (rejected), 3*2=6, 7*2=14 (rejected), 1*2=2, 6*2=12
      // (rejected).
      expect(observed).toStrictEqual([20, 8, 8, 6, 6, 2, 2]);

      for (let index = 1; index < observed.length; index += 1) {
        const previous = observed[index - 1];
        const current = observed[index];

        expect(previous).toBeDefined();
        expect(current).toBeDefined();

        if (previous === undefined || current === undefined) {
          throw new Error('the observed ratchet series has a hole in it.');
        }

        expect(current).toBeLessThanOrEqual(previous);
      }
    });

    it('NEVER RESETS within a ledger lifetime, not even when the reward is re-encountered', () => {
      // CFML parity [model/service/PromotionService.cfc:L172]: re-encountering the reward runs the
      // guard, finds the key present and does nothing at all, so the ratcheted limit survives
      // rather than reverting to the persisted one.
      const reward = makeRewardWithID('reward-ratchet-no-reset', {
        maximumUsePerOrder: 10,
        maximumUsePerQualification: 1,
      });

      const usage = ledger.ensureRewardEntry(reward);

      ledger.ratchetMaximumUsePerOrder(usage, 3);

      expect(usage.maximumUsePerOrder).toBe(3);

      const reEncountered = ledger.ensureRewardEntry(reward);

      expect(reEncountered).toBe(usage);
      expect(reEncountered.maximumUsePerOrder).toBe(3);
      expect(reward.getMaximumUsePerOrder()).toBe(10);
    });

    it('ratchets down to ZERO when an order item qualifies zero times', () => {
      // `0 * anything` is 0, and 0 is less than every seeded or configured positive limit, so a
      // non-qualifying item drives the per-order allowance to nothing.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.ratchetMaximumUsePerOrder(usage, 0);

      expect(usage.maximumUsePerOrder).toBe(0);
    });

    it('accepts a NEGATIVE qualification quantity, driving the limit below zero', () => {
      // Nothing in the legacy validates the sign of the product, and nothing here adds such a
      // check. The value is carried through exactly as the arithmetic produces it.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.ratchetMaximumUsePerOrder(usage, -2);

      expect(usage.maximumUsePerOrder).toBe(-6);
    });

    it('touches only the entry it is handed, never a sibling entry', () => {
      const ratcheted = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const untouched = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.ratchetMaximumUsePerOrder(ratcheted, 0);

      expect(ratcheted.maximumUsePerOrder).toBe(0);
      expect(untouched.maximumUsePerOrder).toBe(1000000);
      expect(untouched.usedInOrder).toBe(0);
    });
  });

  describe('the increment - `usedInOrder += discountQuantity`', () => {
    it('adds the DISCOUNT QUANTITY, not one, and accumulates in place', () => {
      // CFML parity [model/service/PromotionService.cfc:L297]: the statement is
      // `usedInOrder += discountQuantity` on the shared entry.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        4,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(usage.usedInOrder).toBe(4);
      expect(usage.orderItemsUsage).toHaveLength(1);
    });

    it('accumulates to the EXACT SUM of every quantity supplied', () => {
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);
      const quantities = [2, 3, 1, 5];

      for (const [index, discountQuantity] of quantities.entries()) {
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, `usage-item-${String(index)}`),
          discountQuantity,
          Money.fromDecimalString(DISCOUNT_NINE),
        );
      }

      expect(usage.usedInOrder).toBe(11);
      expect(usage.orderItemsUsage).toHaveLength(quantities.length);
    });

    it('lets `usedInOrder` exceed `maximumUsePerOrder` - nothing here enforces the limit', () => {
      // CFML parity [model/service/PromotionService.cfc:L297, L471]: the increment applies no
      // limit test at all.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(2);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        4,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(usage.usedInOrder).toBe(4);
      expect(usage.usedInOrder).toBeGreaterThan(usage.maximumUsePerOrder);
    });

    it('charges each reward separately, so one reward\u2019s usage never leaks into another', () => {
      const bounded = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const unlimited = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        bounded,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(bounded.usedInOrder).toBe(2);
      expect(unlimited.usedInOrder).toBe(0);
      expect(unlimited.orderItemsUsage).toStrictEqual([]);
    });

    it('accepts a NEGATIVE quantity, which reduces the running total', () => {
      // No guard excludes it, so the arithmetic is carried through as written - including the
      // sign, which is why a negative discount over a negative quantity yields a POSITIVE per-use
      // value: `-5.00 / -2` is `2.5`.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        -2,
        Money.fromDecimalString(DISCOUNT_NEGATIVE_FIVE),
      );

      expect(usage.usedInOrder).toBe(-2);
      expect(usageAt(usage, 0).discountPerUseValue.toDecimalString()).toBe('2.5');
    });
  });

  describe('the unguarded division, and the gate that wraps it', () => {
    it('divides the discount by the quantity to get the per-use value', () => {
      // CFML parity [model/service/PromotionService.cfc:L299]:
      // `discountPerUseValue = precisionEvaluate('discountAmount / discountQuantity')`.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        3,
        Money.fromDecimalString(DISCOUNT_NINE),
      );

      expect(
        usageAt(usage, 0).discountPerUseValue.equals(Money.fromDecimalString(PER_USE_THREE)),
      ).toBe(true);
    });

    it('★ THROWS on a zero quantity - the divisor is unguarded, deliberately', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L299]: the source applies no zero check to
      // `discountQuantity`, so a zero divisor raises a division-by-zero error in CFML.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(() =>
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
          0,
          Money.fromDecimalString(DISCOUNT_NINE),
        ),
      ).toThrow(ZERO_DIVISOR_MESSAGE);
    });

    it('leaves no usage record behind when the division refuses', () => {
      // The increment at [model/service/PromotionService.cfc:L297] runs before the division at
      // L299, so the order of the two is observable: the use is charged first and only then is the
      // per-use value computed.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(() =>
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
          0,
          Money.fromDecimalString(DISCOUNT_NINE),
        ),
      ).toThrow(ZERO_DIVISOR_MESSAGE);

      expect(usage.usedInOrder).toBe(0);
      expect(usage.orderItemsUsage).toStrictEqual([]);
    });

    it('preserves an already-charged use when a LATER call refuses', () => {
      // A successful application followed by a refusing one leaves the successful one intact. No
      // rollback exists in the legacy and none is introduced.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(() =>
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.secondOrderItemID),
          0,
          Money.fromDecimalString(DISCOUNT_NINE),
        ),
      ).toThrow(ZERO_DIVISOR_MESSAGE);

      expect(usage.usedInOrder).toBe(2);
      expect(usage.orderItemsUsage).toHaveLength(1);
      expect(orderItemIDs(usage)).toStrictEqual([fixtures.opaqueOrderReferences.orderItemID]);
    });

    it('★ charges NOTHING for a reward whose discount never clears the L257 gate', () => {
      // CFML parity [model/service/PromotionService.cfc:L257]: `if(discountAmount > 0) {` opens a
      // gate and everything through L331 sits inside it - the guarded lazy init at L260-L263, the
      // descending accumulator sort at L266-L294, the increment at L297.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(usage.usedInOrder).toBe(0);
      expect(usage.orderItemsUsage).toStrictEqual([]);
      expect(usage.maximumUsePerOrder).toBe(2);
    });

    it('does not RE-TEST the gate, because this module is the branch BODY', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L257]: the legacy performs the increment,
      // the division and the ascending insertion UNCONDITIONALLY once the gate has opened, so the
      // ported method reproduces that body without re-checking the condition.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_ZERO),
      );

      expect(usage.usedInOrder).toBe(2);
      expect(usageAt(usage, 0).discountPerUseValue.toDecimalString()).toBe('0');
    });
  });

  describe('the ascending insertion sort - the ordering half of vector 4', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294, L301-L329]: the two insertion
    // sorts run in opposite directions and both are load-bearing.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L303]: the source comment above the loop
    // reads "loop over any previous orderItemUsage of this reward an place it in ASC order based
    // on discountPerUseValue" - "an" for "and" is the source's own typo, quoted unaltered rather
    // than silently corrected.

    /**
     * Files one usage record against `usage`, so the ordering cases read as data.
     *
     * Declared inside this block rather than at module scope because it closes over nothing
     * mutable and belongs to these cases alone.
     */
    function file(
      usage: PromotionRewardUsageDetail,
      orderItemID: string,
      discountAmount: string,
      discountQuantity: number,
    ): void {
      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, orderItemID),
        discountQuantity,
        Money.fromDecimalString(discountAmount),
      );
    }

    it('appends into an empty array', () => {
      // CFML parity [model/service/PromotionService.cfc:L320-L329]: with nothing to scan the loop
      // body never runs and the append branch is reached.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-only', DISCOUNT_FOUR, 2);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_TWO]);
    });

    it('inserts a strictly SMALLER newcomer ahead of the incumbent', () => {
      // CFML parity [model/service/PromotionService.cfc:L306, L309, L316]: the first existing
      // record whose per-use value is strictly greater is found, the newcomer is inserted before
      // it, and the scan stops.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-high', DISCOUNT_NINE, 3);
      file(usage, 'item-low', DISCOUNT_THREE, 3);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_ONE, PER_USE_THREE]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-low', 'item-high']);
    });

    it('appends a strictly LARGER newcomer, because no greater record exists', () => {
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-low', DISCOUNT_THREE, 3);
      file(usage, 'item-high', DISCOUNT_NINE, 3);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_ONE, PER_USE_THREE]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-low', 'item-high']);
    });

    it('★ orders three records ascending whatever order they arrive in', () => {
      // Arrival order high, low, middle - so every branch of the sort is exercised by one
      // scenario: an append into an empty array, an insert at the front, and an insert into the
      // middle.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-high', DISCOUNT_NINE, 3);
      file(usage, 'item-low', DISCOUNT_THREE, 3);
      file(usage, 'item-middle', DISCOUNT_FOUR, 2);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_ONE, PER_USE_TWO, PER_USE_THREE]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-low', 'item-middle', 'item-high']);

      // Ascending, proven on the closed `Money` surface rather than by comparing floats.
      for (let index = 1; index < usage.orderItemsUsage.length; index += 1) {
        const previous = usageAt(usage, index - 1);
        const current = usageAt(usage, index);

        expect(previous.discountPerUseValue.compare(current.discountPerUseValue)).toBe(-1);
        expect(previous.discountPerUseValue.isLessThan(current.discountPerUseValue)).toBe(true);
      }
    });

    it('★★ FAVOURS THE INCUMBENT on a tie - the newcomer lands AFTER its equal', () => {
      // CFML parity [model/service/PromotionService.cfc:L306]: the comparison is STRICTLY `>`, not
      // `>=`, so a newcomer whose per-use value EQUALS an existing record's does not displace it.
      //
      // `4.00 / 2` and `2.00 / 1` are both exactly `2`, which is the tie.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-low', DISCOUNT_THREE, 3);
      file(usage, 'item-incumbent', DISCOUNT_FOUR, 2);
      file(usage, 'item-high', DISCOUNT_NINE, 3);
      file(usage, 'item-tie', DISCOUNT_TWO, 1);

      expect(perUseValues(usage)).toStrictEqual([
        PER_USE_ONE,
        PER_USE_TWO,
        PER_USE_TWO,
        PER_USE_THREE,
      ]);
      expect(orderItemIDs(usage)).toStrictEqual([
        'item-low',
        'item-incumbent',
        'item-tie',
        'item-high',
      ]);

      const incumbent = usageAt(usage, 1);
      const tie = usageAt(usage, 2);

      expect(incumbent.orderItemID).toBe('item-incumbent');
      expect(tie.orderItemID).toBe('item-tie');
      expect(incumbent.discountPerUseValue.equals(tie.discountPerUseValue)).toBe(true);
      expect(incumbent.discountPerUseValue.compare(tie.discountPerUseValue)).toBe(0);
    });

    it('★★ APPENDS a tie that is the largest value, since no strictly greater record exists', () => {
      // The other half of the strict comparison, and the one the append branch at
      // [model/service/PromotionService.cfc:L320-L329] handles: when the newcomer ties the MAXIMUM
      // there is nothing strictly greater to insert before.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-low', DISCOUNT_THREE, 3);
      file(usage, 'item-incumbent', DISCOUNT_FOUR, 2);
      file(usage, 'item-tie', DISCOUNT_TWO, 1);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_ONE, PER_USE_TWO, PER_USE_TWO]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-low', 'item-incumbent', 'item-tie']);
    });

    it('keeps a RUN of equal values in arrival order', () => {
      // Three records at the same per-use value accumulate in the order they were filed, which
      // given an unordered reward collection is itself part of the engine's non-determinism.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-first', DISCOUNT_FOUR, 2);
      file(usage, 'item-second', DISCOUNT_TWO, 1);
      file(usage, 'item-third', DISCOUNT_FOUR, 2);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_TWO, PER_USE_TWO, PER_USE_TWO]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-first', 'item-second', 'item-third']);
    });

    it('files the CHEAPEST per-use record first, which is the record stripped first', () => {
      // The consequence the ordering exists for: over-use stripping walks `orderItemsUsage` from
      // index 1 at [model/service/PromotionService.cfc:L475], so ascending order means the
      // cheapest use is given up first.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-high', DISCOUNT_NINE, 3);
      file(usage, 'item-middle', DISCOUNT_FOUR, 2);
      file(usage, 'item-low', DISCOUNT_THREE, 3);

      const cheapest = usageAt(usage, 0);

      expect(cheapest.orderItemID).toBe('item-low');

      for (const entry of usage.orderItemsUsage.slice(1)) {
        expect(cheapest.discountPerUseValue.isGreaterThan(entry.discountPerUseValue)).toBe(false);
      }
    });

    it('orders NEGATIVE per-use values below positive ones, with no special case', () => {
      // A negative per-use value is reachable - the quantity and the discount are both unvalidated
      // and it sorts by value like anything else.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-positive', DISCOUNT_FOUR, 2);
      file(usage, 'item-negative', DISCOUNT_NEGATIVE_FIVE, 2);

      expect(perUseValues(usage)).toStrictEqual(['-2.5', PER_USE_TWO]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-negative', 'item-positive']);
    });

    it('sorts each reward\u2019s array independently', () => {
      const first = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const second = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(first, 'item-a', DISCOUNT_NINE, 3);
      file(second, 'item-b', DISCOUNT_THREE, 3);
      file(first, 'item-c', DISCOUNT_THREE, 3);

      expect(orderItemIDs(first)).toStrictEqual(['item-c', 'item-a']);
      expect(orderItemIDs(second)).toStrictEqual(['item-b']);
    });
  });

  describe('order dependence proven structurally - vector 1', () => {
    // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: the reward collection has no ordering.
    // `getActivePromotionRewards` ends in `ormExecuteQuery` with no `ORDER BY` anywhere in the
    // DAO, so the iteration order is whatever the driver returns.
    //
    // JUDGMENT CALL: the two mechanisms that genuinely differ by order are named precisely,
    // because a vaguer claim would be easy to over-read.

    it('★ FIRST-WINS seeding makes the ledger genuinely differ between two orders', () => {
      // CFML parity [model/service/PromotionService.cfc:L172]: the guard keys on the identifier,
      // so the first reward object seen for an identifier fixes that entry's limits for the whole
      // invocation.
      const sharedID = 'reward-order-dependence';
      const strict = makeRewardWithID(sharedID, { maximumUsePerOrder: 2 });
      const lax = makeRewardWithID(sharedID, { maximumUsePerOrder: 9 });

      const strictFirst = ledger;
      strictFirst.ensureRewardEntry(strict);
      strictFirst.ensureRewardEntry(lax);

      const laxFirst = new RewardUsageLedger();
      laxFirst.ensureRewardEntry(lax);
      laxFirst.ensureRewardEntry(strict);

      const fromStrictFirst = strictFirst.promotionRewardUsageDetails[sharedID];
      const fromLaxFirst = laxFirst.promotionRewardUsageDetails[sharedID];

      expect(fromStrictFirst).toBeDefined();
      expect(fromLaxFirst).toBeDefined();

      if (fromStrictFirst === undefined || fromLaxFirst === undefined) {
        throw new Error(`neither ledger seeded an entry for ${sharedID}.`);
      }

      expect(fromStrictFirst.maximumUsePerOrder).toBe(2);
      expect(fromLaxFirst.maximumUsePerOrder).toBe(9);
      expect(fromStrictFirst.maximumUsePerOrder).not.toBe(fromLaxFirst.maximumUsePerOrder);
    });

    it('★ TIE ARRIVAL ORDER makes `orderItemsUsage` differ, values equal but positions swapped', () => {
      // The second genuine order dependence, and the one that reaches money.
      const firstItemID = fixtures.opaqueOrderReferences.orderItemID;
      const secondItemID = fixtures.opaqueOrderReferences.secondOrderItemID;

      // The two identifiers must differ, or the whole exhibit is vacuous.
      expect(firstItemID).not.toBe(secondItemID);

      const forwards = ledger;
      const forwardsUsage = forwards.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);
      forwards.recordOrderItemUsage(
        forwardsUsage,
        makeOrderItemView(fixtures.sku, firstItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );
      forwards.recordOrderItemUsage(
        forwardsUsage,
        makeOrderItemView(fixtures.sku, secondItemID),
        1,
        Money.fromDecimalString(DISCOUNT_TWO),
      );

      const backwards = new RewardUsageLedger();
      const backwardsUsage = backwards.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);
      backwards.recordOrderItemUsage(
        backwardsUsage,
        makeOrderItemView(fixtures.sku, secondItemID),
        1,
        Money.fromDecimalString(DISCOUNT_TWO),
      );
      backwards.recordOrderItemUsage(
        backwardsUsage,
        makeOrderItemView(fixtures.sku, firstItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      // Identical per-use values...
      expect(perUseValues(forwardsUsage)).toStrictEqual([PER_USE_TWO, PER_USE_TWO]);
      expect(perUseValues(backwardsUsage)).toStrictEqual([PER_USE_TWO, PER_USE_TWO]);

      // and identical totals, because addition is commutative.
      expect(forwardsUsage.usedInOrder).toBe(3);
      expect(backwardsUsage.usedInOrder).toBe(3);
      expect(orderItemIDs(forwardsUsage)).toStrictEqual([firstItemID, secondItemID]);
      expect(orderItemIDs(backwardsUsage)).toStrictEqual([secondItemID, firstItemID]);
      expect(orderItemIDs(forwardsUsage)).not.toStrictEqual(orderItemIDs(backwardsUsage));

      // The quantities travel with their records, so the amount that would be stripped first
      // differs too.
      expect(usageAt(forwardsUsage, 0).discountQuantity).toBe(2);
      expect(usageAt(backwardsUsage, 0).discountQuantity).toBe(1);
    });

    it('makes what a LATER application sees depend on which earlier ones ran', () => {
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const observedBeforeEachApplication: number[] = [];

      for (const [index, discountQuantity] of [2, 3, 1].entries()) {
        observedBeforeEachApplication.push(usage.usedInOrder);
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, `threaded-item-${String(index)}`),
          discountQuantity,
          Money.fromDecimalString(DISCOUNT_NINE),
        );
      }

      expect(observedBeforeEachApplication).toStrictEqual([0, 2, 5]);
      expect(usage.usedInOrder).toBe(6);
    });

    it('keeps the ratchet\u2019s FINAL value order-independent while its path is not', () => {
      const risingLimits = makeRewardWithID('reward-ratchet-path-rising', {
        maximumUsePerOrder: 30,
        maximumUsePerQualification: 2,
      });
      const fallingLimits = makeRewardWithID('reward-ratchet-path-falling', {
        maximumUsePerOrder: 30,
        maximumUsePerQualification: 2,
      });

      const risingUsage = ledger.ensureRewardEntry(risingLimits);
      const fallingUsage = ledger.ensureRewardEntry(fallingLimits);

      const risingPath: number[] = [];
      const fallingPath: number[] = [];

      for (const qualificationQuantity of [3, 7, 11]) {
        ledger.ratchetMaximumUsePerOrder(risingUsage, qualificationQuantity);
        risingPath.push(risingUsage.maximumUsePerOrder);
      }

      for (const qualificationQuantity of [11, 7, 3]) {
        ledger.ratchetMaximumUsePerOrder(fallingUsage, qualificationQuantity);
        fallingPath.push(fallingUsage.maximumUsePerOrder);
      }

      expect(risingPath).toStrictEqual([6, 6, 6]);
      expect(fallingPath).toStrictEqual([22, 14, 6]);
      expect(risingPath).not.toStrictEqual(fallingPath);

      // Same destination, different route.
      expect(risingUsage.maximumUsePerOrder).toBe(6);
      expect(fallingUsage.maximumUsePerOrder).toBe(6);
    });
  });
});
