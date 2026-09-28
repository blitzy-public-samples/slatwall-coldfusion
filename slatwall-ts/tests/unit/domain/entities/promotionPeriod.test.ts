// `SwPromotionPeriod` is 163 lines of CFML that disagree with themselves three ways, and the
// disagreements decide whether a discount applies:.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import type { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import { PROMOTION_USE_COUNT_STATEMENTS } from '../../../../src/repositories/mysql/sql/promotionUseCounts.sql.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// `Promotion` is imported as a VALUE, not `import type`, for one specific reason: the fixture
// graph cannot produce a promotion with an ABSENT name - `makePromotionFixtures` defaults
// `promotionName` to a non-empty string and `makePromotionVariant` always sets one.

// Every business date here is an explicit UTC ISO-8601 literal.

/**
 * The fixed "current" instant. Matches `NOW_UTC` in the fixture module.
 */
const NOW_UTC = '2024-06-15T12:00:00.000Z';

/**
 * Two weeks before `NOW_UTC`, so the default window is open.
 */
const PERIOD_START_UTC = '2024-06-01T00:00:00.000Z';

/**
 * Two weeks after `NOW_UTC`, likewise.
 */
const PERIOD_END_UTC = '2024-07-01T00:00:00.000Z';

/**
 * A window that closed well before `NOW_UTC`.
 */
const EXPIRED_PERIOD_START_UTC = '2024-01-01T00:00:00.000Z';

/**
 * The end bound of that same closed window, also in the past.
 */
const EXPIRED_PERIOD_END_UTC = '2024-02-01T00:00:00.000Z';

/**
 * A start bound strictly after `NOW_UTC`, for the not-yet-open window.
 */
const FUTURE_PERIOD_START_UTC = '2024-07-01T00:00:00.000Z';

/**
 * The matching future end bound, so the whole window is ahead of `now`.
 */
const FUTURE_PERIOD_END_UTC = '2024-08-01T00:00:00.000Z';

/**
 * Audit-column instants. Distinct from the business bounds so a mix-up would show.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * The two use ceilings the fixture module uses, restated so a locally-built period and a
 * fixture-built one agree.
 */
const PERIOD_MAXIMUM_USE_COUNT = 100;
const PERIOD_MAXIMUM_ACCOUNT_USE_COUNT = 5;

/**
 * A NON-empty primary key, so `isNew()` reads `false`. [model/entity/PromotionPeriod.cfc:L52]
 * declares `default=""`, so the id is always a string and the EMPTY one is the sentinel for
 * unsaved.
 */
const PERSISTED_PERIOD_ID = 'promotion-period-persisted';

/**
 * The empty primary key [model/entity/PromotionPeriod.cfc:L52] - i.e. an unsaved row.
 */
const NEW_PERIOD_ID = '';

/**
 * A second persisted key, for membership tests that must not collide with the first.
 */
const OTHER_PERIOD_ID = 'promotion-period-other';

/**
 * The `promotionID` foreign-key column value [model/entity/PromotionPeriod.cfc:L59].
 */
const PROMOTION_ID = 'promotion-fixture';

/**
 * Parse an explicit UTC ISO-8601 literal into a `Date`, refusing anything unparseable.
 *
 * `new Date('nonsense')` yields an Invalid Date whose `getTime()` is `NaN`, and every comparison
 * against `NaN` is `false`, so a typo would make a boundary assertion pass for the wrong reason.
 */
function instant(isoUtc: string): Date {
  const parsed = new Date(isoUtc);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `promotionPeriod.test.ts: "${isoUtc}" is not a parseable instant. Every business date in ` +
        'this suite must be an explicit UTC ISO-8601 literal such as ' +
        '"2024-06-15T12:00:00.000Z".',
    );
  }

  return parsed;
}

/**
 * The injected clock, frozen at one instant. A FRESH `Date` is returned on every read, so a
 * subject cannot mutate the instant the clock reports and leak that into a later assertion.
 */
function fixedClock(at: Date): () => Date {
  return () => new Date(at.getTime());
}

/**
 * A clock that also records how many times it was read.
 */
function countingClock(at: Date): { readonly clock: () => Date; readonly reads: () => number } {
  let reads = 0;

  return {
    clock: (): Date => {
      reads += 1;
      return new Date(at.getTime());
    },
    reads: (): number => reads,
  };
}

/**
 * A clock whose instant can be MOVED after construction.
 *
 * This is how memoization is proved without touching a `readonly` field.
 */
function movableClock(at: Date): {
  readonly clock: () => Date;
  readonly moveTo: (next: Date) => void;
} {
  let current = new Date(at.getTime());

  return {
    clock: (): Date => new Date(current.getTime()),
    moveTo: (next: Date): void => {
      current = new Date(next.getTime());
    },
  };
}

/**
 * The constructor's init object, and a partial of it for per-test overrides.
 *
 * Derived with `ConstructorParameters` rather than re-declared, so adding, removing or retyping an
 * init field breaks compilation here immediately.
 */
type PeriodInit = ConstructorParameters<typeof PromotionPeriod>[0];
type PeriodOverrides = Partial<PeriodInit>;
type PromotionFixtures = ReturnType<typeof makePromotionFixtures>;

/**
 * Build a `PromotionPeriod` from a defaulted base, overridable per test.
 *
 * `{...base,...overrides }` is deliberate: an EXPLICITLY passed `undefined` survives the spread
 * and overrides the default, which is how a test says "this bound is ABSENT" rather than
 * "unspecified.
 *
 * A FRESH instance per call is mandatory, not tidiness: the `currentFlag` memo
 * [model/entity/PromotionPeriod.cfc:L75, L137-L146] is INSTANCE state.
 */
function makePeriod(overrides: PeriodOverrides = {}): PromotionPeriod {
  const base: PeriodInit = {
    promotionPeriodID: PERSISTED_PERIOD_ID,
    startDateTime: instant(PERIOD_START_UTC),
    endDateTime: instant(PERIOD_END_UTC),
    maximumUseCount: PERIOD_MAXIMUM_USE_COUNT,
    maximumAccountUseCount: PERIOD_MAXIMUM_ACCOUNT_USE_COUNT,
    promotion: undefined,
    promotionID: PROMOTION_ID,
    remoteID: undefined,
    createdDateTime: instant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: instant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    now: fixedClock(instant(NOW_UTC)),
  };

  return new PromotionPeriod({ ...base, ...overrides });
}

/**
 * A fresh fixture graph, one per test and never hoisted to module scope.
 */
function freshFixtures(): PromotionFixtures {
  return makePromotionFixtures();
}

/**
 * A real `PromotionReward` from the fixture graph.
 *
 * Hand-written doubles are preferred over `vi.mock`, but the four inoperable helpers need no
 * double at all: they throw before touching their argument.
 */
function rewardFrom(fixtures: PromotionFixtures): PromotionReward {
  return fixtures.merchandiseReward;
}

/**
 * A real `PromotionQualifier` from the fixture graph, for the same reason.
 */
function qualifierFrom(fixtures: PromotionFixtures): PromotionQualifier {
  return fixtures.promotionQualifier;
}

/**
 * The graph's `Promotion`, with its applied-promotion collection emptied so it reports deletable.
 */
function deletablePromotionFrom(fixtures: PromotionFixtures): Promotion {
  const promotion = fixtures.promotion;
  const applied = promotion.getAppliedPromotions();

  applied.splice(0, applied.length);

  return promotion;
}

/**
 * Replace a promotion's live `promotionPeriods` collection with exactly the periods given.
 *
 * Needed to isolate the rollup direction: the stock graph already wires one CURRENT period in, so
 * a rollup asserted against it would read `true` whichever predicate the rollup consults.
 */
function replacePeriodsWith(promotion: Promotion, periods: readonly PromotionPeriod[]): void {
  const collection = promotion.getPromotionPeriods();

  collection.splice(0, collection.length, ...periods);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// CFML parity [model/entity/PromotionPeriod.cfc:L78-L81]: start is inclusive (L80 uses `<=`) and
// end is exclusive (L80 uses `>`).
describe('isCurrent(now) treats the start bound as inclusive and the end bound as exclusive', () => {
  it('returns true when the instant sits strictly inside the window', () => {
    const period = makePeriod();

    expect(period.isCurrent(instant(NOW_UTC))).toBe(true);
  });

  it('returns true at the EXACT start instant, because L80 compares with <=', () => {
    const period = makePeriod({
      startDateTime: instant(NOW_UTC),
      endDateTime: instant(PERIOD_END_UTC),
    });

    expect(period.isCurrent(instant(NOW_UTC))).toBe(true);
  });

  it('returns FALSE at the EXACT end instant, because L80 compares with > and not >=', () => {
    const period = makePeriod({
      startDateTime: instant(PERIOD_START_UTC),
      endDateTime: instant(NOW_UTC),
    });

    expect(period.isCurrent(instant(NOW_UTC))).toBe(false);
  });

  it('returns false before the window opens', () => {
    const period = makePeriod({
      startDateTime: instant(FUTURE_PERIOD_START_UTC),
      endDateTime: instant(FUTURE_PERIOD_END_UTC),
    });

    expect(period.isCurrent(instant(NOW_UTC))).toBe(false);
  });

  it('returns false after the window closes', () => {
    const period = makePeriod({
      startDateTime: instant(EXPIRED_PERIOD_START_UTC),
      endDateTime: instant(EXPIRED_PERIOD_END_UTC),
    });

    expect(period.isCurrent(instant(NOW_UTC))).toBe(false);
  });

  it('one millisecond inside each bound is inside, and one millisecond outside is outside', () => {
    const start = instant(PERIOD_START_UTC);
    const end = instant(PERIOD_END_UTC);
    const period = makePeriod({ startDateTime: start, endDateTime: end });

    expect(period.isCurrent(new Date(start.getTime() - 1))).toBe(false);
    expect(period.isCurrent(new Date(start.getTime() + 1))).toBe(true);
    expect(period.isCurrent(new Date(end.getTime() - 1))).toBe(true);
    expect(period.isCurrent(new Date(end.getTime() + 1))).toBe(false);
  });

  it('reads ONLY its argument, and never the injected clock, WHEN one is supplied', () => {
    // The agreement check against the argument form.
    const clockWellPastTheWindow = fixedClock(instant('2025-01-01T00:00:00.000Z'));
    const period = makePeriod({ now: clockWellPastTheWindow });

    expect(period.isCurrent(instant(NOW_UTC))).toBe(true);
    expect(period.isExpired()).toBe(true);

    expect(period.isCurrent(instant('2025-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('★★ answers from the INJECTED clock when the instant is omitted, which is the legacy call form', () => {
    // The other arity, and the reason the parameter is optional:
    // [model/entity/PromotionPeriod.cfc:L78] declares `isCurrent()` with no arguments.
    const insideTheWindow = makePeriod({ now: fixedClock(instant(NOW_UTC)) });
    const afterTheWindow = makePeriod({ now: fixedClock(instant('2025-01-01T00:00:00.000Z')) });

    expect(insideTheWindow.isCurrent()).toBe(true);
    expect(afterTheWindow.isCurrent()).toBe(false);

    // And the two arities agree when handed the same instant, so the default is a default rather
    // than a second implementation.
    expect(insideTheWindow.isCurrent()).toBe(insideTheWindow.isCurrent(instant(NOW_UTC)));
  });

  it('reads the injected clock ONCE on the defaulted path, as the legacy local capture did', () => {
    // CFML parity [model/entity/PromotionPeriod.cfc:L79]: `var currentDateTime = now();` captures
    // the instant once and both comparisons on L80 read that local.
    let reads = 0;
    const countingClock = (): Date => {
      reads += 1;
      return instant(NOW_UTC);
    };
    const period = makePeriod({ now: countingClock });

    expect(period.isCurrent()).toBe(true);
    expect(reads).toBe(1);
  });

  it('compares on absolute epoch milliseconds, so an equal instant in another offset matches', () => {
    // The UTC policy, observable: `2024-06-15T12:00:00.000Z` and `2024-06-15T14:00:00.000+02:00`
    // are the same instant.
    const period = makePeriod({
      startDateTime: instant(NOW_UTC),
      endDateTime: instant(PERIOD_END_UTC),
    });
    const sameInstantOtherOffset = instant('2024-06-15T14:00:00.000+02:00');

    expect(sameInstantOtherOffset.getTime()).toBe(instant(NOW_UTC).getTime());
    expect(period.isCurrent(sameInstantOtherOffset)).toBe(true);
  });
});

// LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L78-L81]: isCurrent dereferences
// getStartDateTime()/getEndDateTime() at L80 with no isNull guard, so an open-ended period - which
// hb_nullRBKey="define.forever" at L53/L54 declares to be valid data.
// Preserved deliberately; do not fix without a product decision.
describe('isCurrent throws on a null bound, where the other two predicates cope', () => {
  it('throws when startDateTime is absent, even though absence means NO LOWER BOUND', () => {
    const period = makePeriod({ startDateTime: undefined });

    expect(() => period.isCurrent(instant(NOW_UTC))).toThrow(
      'cannot evaluate a null startDateTime',
    );
  });

  it('throws when endDateTime is absent, even though absence means NO UPPER BOUND', () => {
    const period = makePeriod({ endDateTime: undefined });

    expect(() => period.isCurrent(instant(NOW_UTC))).toThrow('cannot evaluate a null endDateTime');
  });

  it('throws on an entirely unbounded period, which the metadata calls always-current', () => {
    const period = makePeriod({ startDateTime: undefined, endDateTime: undefined });

    expect(() => period.isCurrent(instant(NOW_UTC))).toThrow(
      'cannot evaluate a null startDateTime',
    );
  });

  it('names the offending locator and the two guarded siblings in the failure', () => {
    const period = makePeriod({ startDateTime: undefined });

    expect(() => period.isCurrent(instant(NOW_UTC))).toThrow(
      'model/entity/PromotionPeriod.cfc:L80',
    );
    expect(() => period.isCurrent(instant(NOW_UTC))).toThrow('define.forever');
  });

  it('still evaluates normally once both bounds are present', () => {
    // The throw is about ABSENT bounds only - it must not leak into the ordinary path.
    const period = makePeriod({ startDateTime: undefined });
    const bounded = makePeriod();

    expect(() => period.isCurrent(instant(NOW_UTC))).toThrow();
    expect(bounded.isCurrent(instant(NOW_UTC))).toBe(true);
  });
});

// CFML parity [model/entity/PromotionPeriod.cfc:L137-L146]: getCurrentFlag seeds `true` at L139
// and only ever narrows to `false` at L141.
describe('getCurrentFlag seeds true, narrows to false, and never rejects an absent bound', () => {
  it('is true for a window that is open at the injected instant', () => {
    const period = makePeriod({ now: fixedClock(instant(NOW_UTC)) });

    expect(period.getCurrentFlag()).toBe(true);
  });

  it('is TRUE at the exact end instant, because L140 rejects only end < now', () => {
    const period = makePeriod({
      endDateTime: instant(NOW_UTC),
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.getCurrentFlag()).toBe(true);
  });

  it('is true when startDateTime is absent - FOREVER-PAST is honoured', () => {
    const period = makePeriod({
      startDateTime: undefined,
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.getCurrentFlag()).toBe(true);
  });

  it('is true when endDateTime is absent - FOREVER-FUTURE is honoured', () => {
    const period = makePeriod({
      endDateTime: undefined,
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.getCurrentFlag()).toBe(true);
  });

  it('is true when BOTH bounds are absent, because L139 seeds true and nothing narrows it', () => {
    const period = makePeriod({
      startDateTime: undefined,
      endDateTime: undefined,
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.getCurrentFlag()).toBe(true);
  });

  it('narrows to false when the start bound is still in the future', () => {
    const period = makePeriod({
      startDateTime: instant(FUTURE_PERIOD_START_UTC),
      endDateTime: instant(FUTURE_PERIOD_END_UTC),
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.getCurrentFlag()).toBe(false);
  });

  it('narrows to false when the end bound is already past', () => {
    const period = makePeriod({
      startDateTime: instant(EXPIRED_PERIOD_START_UTC),
      endDateTime: instant(EXPIRED_PERIOD_END_UTC),
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.getCurrentFlag()).toBe(false);
  });

  it('computes once and then reports a STALE answer as the clock moves past the window', () => {
    // Behavioural fidelity, not caching: a long-lived instance keeps answering with the value it
    // computed on first read, and `isExpired` is not memoized, so the two diverge as soon as the
    // clock crosses the end bound.
    const clock = movableClock(instant(NOW_UTC));
    const period = makePeriod({ now: clock.clock });

    expect(period.getCurrentFlag()).toBe(true);
    expect(period.isExpired()).toBe(false);

    clock.moveTo(instant('2025-01-01T00:00:00.000Z'));

    expect(period.getCurrentFlag()).toBe(true);
    expect(period.isExpired()).toBe(true);
  });

  it('memoizes a false answer just as firmly as a true one', () => {
    const clock = movableClock(instant(NOW_UTC));
    const period = makePeriod({
      startDateTime: instant(FUTURE_PERIOD_START_UTC),
      endDateTime: instant(FUTURE_PERIOD_END_UTC),
      now: clock.clock,
    });

    expect(period.getCurrentFlag()).toBe(false);

    clock.moveTo(instant('2024-07-15T00:00:00.000Z'));

    expect(period.getCurrentFlag()).toBe(false);
  });

  it('reads the injected clock TWICE on first evaluation and not at all thereafter', () => {
    // CFML parity [model/entity/PromotionPeriod.cfc:L140]: the legacy expression calls `now()` in
    // both arms.
    const counting = countingClock(instant(NOW_UTC));
    const period = makePeriod({ now: counting.clock });

    expect(period.getCurrentFlag()).toBe(true);
    expect(counting.reads()).toBe(2);

    // The memo short-circuits L138, so no further read occurs.
    expect(period.getCurrentFlag()).toBe(true);
    expect(counting.reads()).toBe(2);
  });

  it('reads the clock only ONCE when the start arm already narrowed the answer', () => {
    // The `||` in L140 short-circuits, so a period rejected on its start bound never evaluates the
    // end arm - proving the expression shape was reproduced rather than flattened.
    const counting = countingClock(instant(NOW_UTC));
    const period = makePeriod({
      startDateTime: instant(FUTURE_PERIOD_START_UTC),
      endDateTime: instant(FUTURE_PERIOD_END_UTC),
      now: counting.clock,
    });

    expect(period.getCurrentFlag()).toBe(false);
    expect(counting.reads()).toBe(1);
  });

  it('never reads the clock at all when both bounds are absent', () => {
    // Both arms are guarded by a presence test, so an unbounded period short-circuits before any
    // clock read - which is why it can be judged "current" with no clock at all.
    const counting = countingClock(instant(NOW_UTC));
    const period = makePeriod({
      startDateTime: undefined,
      endDateTime: undefined,
      now: counting.clock,
    });

    expect(period.getCurrentFlag()).toBe(true);
    expect(counting.reads()).toBe(0);
  });
});

// CFML parity [model/entity/PromotionPeriod.cfc:L83-L85]: isExpired takes no arguments, guards
// with isDate(getEndDateTime()), and examines the END bound only.
describe('isExpired examines the end bound only, and keeps its legacy zero arity', () => {
  it('takes no parameters, so the one authorized widening was not spent twice', () => {
    expect(PromotionPeriod.prototype.isExpired.length).toBe(0);

    // `isCurrent` still reports one parameter, and that is worth pinning rather than glossing:
    // TypeScript's `now?: Date` emits a plain positional parameter with no initializer.
    expect(PromotionPeriod.prototype.isCurrent.length).toBe(1);
  });

  it('is false when endDateTime is absent, because an absent end bound never arrives', () => {
    const period = makePeriod({
      endDateTime: undefined,
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.isExpired()).toBe(false);
  });

  it('is true once the end bound is strictly before the injected instant', () => {
    const period = makePeriod({
      startDateTime: instant(EXPIRED_PERIOD_START_UTC),
      endDateTime: instant(EXPIRED_PERIOD_END_UTC),
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.isExpired()).toBe(true);
  });

  it('is false while the end bound is still ahead of the injected instant', () => {
    const period = makePeriod({ now: fixedClock(instant(NOW_UTC)) });

    expect(period.isExpired()).toBe(false);
  });

  it('is FALSE at the exact end instant, because L84 compares with < and not <=', () => {
    const period = makePeriod({
      endDateTime: instant(NOW_UTC),
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.isExpired()).toBe(false);
  });

  it('is false for a window that has not opened yet - the start bound is never consulted', () => {
    const period = makePeriod({
      startDateTime: instant(FUTURE_PERIOD_START_UTC),
      endDateTime: instant(FUTURE_PERIOD_END_UTC),
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.isExpired()).toBe(false);
    expect(period.getCurrentFlag()).toBe(false);
  });

  it('ignores an absent START bound entirely, unlike isCurrent', () => {
    const period = makePeriod({
      startDateTime: undefined,
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.isExpired()).toBe(false);
    expect(() => period.isCurrent(instant(NOW_UTC))).toThrow();
  });

  it('recomputes on every call, so it tracks the clock instead of caching', () => {
    const clock = movableClock(instant(NOW_UTC));
    const period = makePeriod({ now: clock.clock });

    expect(period.isExpired()).toBe(false);

    clock.moveTo(instant('2025-01-01T00:00:00.000Z'));

    expect(period.isExpired()).toBe(true);
  });
});

// Now, isCurrent() returns false (end exclusive) while getCurrentFlag() returns true (end
// inclusive) and isExpired() returns false - the period is simultaneously "not current" by the
// direct predicate.
describe('at the exact end instant the three predicates give three different answers', () => {
  it('answers false / true / false / true across isCurrent, getCurrentFlag, isExpired, isDeletable', () => {
    const fixtures = freshFixtures();
    const boundary = fixtures.now;
    const period = makePeriod({
      startDateTime: instant(PERIOD_START_UTC),
      endDateTime: new Date(boundary.getTime()),
      promotion: deletablePromotionFrom(fixtures),
      now: fixedClock(boundary),
    });

    expect(period.getEndDateTime()?.getTime()).toBe(boundary.getTime());

    expect(period.isCurrent(boundary)).toBe(false);
    expect(period.getCurrentFlag()).toBe(true);
    expect(period.isExpired()).toBe(false);
    expect(period.isDeletable()).toBe(true);
  });

  it('agrees on all three answers one millisecond either side of that instant', () => {
    const boundary = instant(NOW_UTC);

    const justBefore = makePeriod({
      endDateTime: new Date(boundary.getTime() + 1),
      now: fixedClock(boundary),
    });
    expect(justBefore.isCurrent(boundary)).toBe(true);
    expect(justBefore.getCurrentFlag()).toBe(true);
    expect(justBefore.isExpired()).toBe(false);

    const justAfter = makePeriod({
      endDateTime: new Date(boundary.getTime() - 1),
      now: fixedClock(boundary),
    });
    expect(justAfter.isCurrent(boundary)).toBe(false);
    expect(justAfter.getCurrentFlag()).toBe(false);
    expect(justAfter.isExpired()).toBe(true);
  });

  it('is deletable at the boundary BECAUSE it is not expired, not because it is current', () => {
    // L88 is `!isExpired() && getPromotion().isDeletable()`. It consults neither isCurrent() nor
    // getCurrentFlag(), so "not current" has no bearing on deletability.
    const fixtures = freshFixtures();
    const boundary = fixtures.now;
    const period = makePeriod({
      endDateTime: new Date(boundary.getTime()),
      promotion: deletablePromotionFrom(fixtures),
      now: fixedClock(boundary),
    });

    expect(period.isCurrent(boundary)).toBe(false);
    expect(period.isExpired()).toBe(false);
    expect(period.isDeletable()).toBe(true);
  });

  it('the fixture module records the same contrast this suite observes at runtime', () => {
    const fixtures = freshFixtures();
    const contrast = fixtures.periodPredicateContrast;
    const boundary = fixtures.now;

    expect(contrast.deadPredicate).toBe('isCurrent');
    expect(contrast.livePredicate).toBe('getCurrentFlag');
    expect(contrast.deadPredicateEndBoundInclusive).toBe(false);
    expect(contrast.livePredicateEndBoundInclusive).toBe(true);
    expect(contrast.deadPredicateGuardsNullBounds).toBe(false);
    expect(contrast.livePredicateGuardsNullBounds).toBe(true);
    expect(contrast.livePredicateMemoizes).toBe(true);
    expect(contrast.deadPredicateNowCallCount).toBe(1);
    expect(contrast.livePredicateNowCallCount).toBe(2);

    const atEnd = makePeriod({
      endDateTime: new Date(boundary.getTime()),
      now: fixedClock(boundary),
    });
    expect(atEnd.isCurrent(boundary)).toBe(contrast.deadPredicateEndBoundInclusive);
    expect(atEnd.getCurrentFlag()).toBe(contrast.livePredicateEndBoundInclusive);

    const unbounded = makePeriod({
      startDateTime: undefined,
      endDateTime: undefined,
      now: fixedClock(boundary),
    });
    expect(() => unbounded.isCurrent(boundary)).toThrow();
    expect(unbounded.getCurrentFlag()).toBe(true);
  });

  it('routes the rollup through getCurrentFlag, which is what the call path records', () => {
    const fixtures = freshFixtures();

    // The documented path names `model/entity/Promotion.cfc:L99`: L98 is the `for` statement and
    // L99 is the `getCurrentFlag()` call.
    expect(fixtures.periodPredicateContrast.livePredicateCallPath).toContain(
      'model/entity/Promotion.cfc:L99 getCurrentPromotionPeriodFlag',
    );
  });
});

// CFML parity [model/entity/Promotion.cfc:L95-L107]: getCurrentPromotionPeriodFlag calls
// `.getCurrentFlag()` at L99 - not `.isCurrent()` - and breaks on the first match at L101.
describe('the promotion rollup consumes getCurrentFlag, not isCurrent', () => {
  it('reports the period current at the boundary instant, where isCurrent says otherwise', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const boundary = fixtures.now;

    const boundaryPeriod = makePeriod({
      startDateTime: instant(PERIOD_START_UTC),
      endDateTime: new Date(boundary.getTime()),
      promotion,
      now: fixedClock(boundary),
    });
    replacePeriodsWith(promotion, [boundaryPeriod]);

    expect(boundaryPeriod.isCurrent(boundary)).toBe(false);
    expect(boundaryPeriod.getCurrentFlag()).toBe(true);

    expect(promotion.getCurrentPromotionPeriodFlag()).toBe(true);
  });

  it('reports not current when its only period is genuinely closed, so the check is not vacuous', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;

    const closedPeriod = makePeriod({
      startDateTime: instant(EXPIRED_PERIOD_START_UTC),
      endDateTime: instant(EXPIRED_PERIOD_END_UTC),
      promotion,
      now: fixedClock(fixtures.now),
    });
    replacePeriodsWith(promotion, [closedPeriod]);

    expect(promotion.getCurrentPromotionPeriodFlag()).toBe(false);
  });

  it('survives an open-ended period, which isCurrent could not have evaluated at all', () => {
    // The strongest evidence for the direction: an unbounded period is legitimate data
    // (`hb_nullRBKey="define.forever"`), the rollup handles it and answers true.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const boundary = fixtures.now;

    const unboundedPeriod = makePeriod({
      startDateTime: undefined,
      endDateTime: undefined,
      promotion,
      now: fixedClock(boundary),
    });
    replacePeriodsWith(promotion, [unboundedPeriod]);

    expect(() => unboundedPeriod.isCurrent(boundary)).toThrow();
    expect(promotion.getCurrentPromotionPeriodFlag()).toBe(true);
  });
});

// The expected outcomes are OWNED by `tests/fixtures/promotionFixtures.ts`, which records
// `isCurrentOutcome` and `getCurrentFlagOutcome` per row against a fixed clock, so the two modules
// cannot disagree silently.
describe('the nine date-bounds rows behave exactly as the fixture table records', () => {
  it('covers every named row, so no combination is silently missing', () => {
    const fixtures = freshFixtures();
    const names = fixtures.periodDateBoundsCases.map((bounds) => bounds.name);

    expect(names).toStrictEqual([
      'nowStrictlyInside',
      'nowAtStartDateTime',
      'nowAtEndDateTime',
      'startDateTimeAbsent',
      'endDateTimeAbsent',
      'bothBoundsAbsent',
      'fullyExpired',
      'endBeforeStart',
      'endEqualsStart',
    ]);
    expect(fixtures.datedPromotionPeriods).toHaveLength(names.length);
  });

  it('matches the recorded isCurrent outcome - including the three rows that THROW', () => {
    const fixtures = freshFixtures();

    for (const { bounds, promotionPeriod } of fixtures.datedPromotionPeriods) {
      if (bounds.isCurrentOutcome === 'throws') {
        expect(() => promotionPeriod.isCurrent(fixtures.now), bounds.name).toThrow();
      } else {
        expect(promotionPeriod.isCurrent(fixtures.now), bounds.name).toBe(bounds.isCurrentOutcome);
      }
    }
  });

  it('matches the recorded getCurrentFlag outcome for every row, throwing on none of them', () => {
    const fixtures = freshFixtures();

    for (const { bounds, promotionPeriod } of fixtures.datedPromotionPeriods) {
      expect(promotionPeriod.getCurrentFlag(), bounds.name).toBe(bounds.getCurrentFlagOutcome);
    }
  });

  it('is expired exactly when a PRESENT end bound lies strictly before the clock', () => {
    const fixtures = freshFixtures();

    for (const { bounds, promotionPeriod } of fixtures.datedPromotionPeriods) {
      const endBound = bounds.endDateTimeUTC;
      const expectedExpired =
        endBound !== undefined && instant(endBound).getTime() < fixtures.now.getTime();

      expect(promotionPeriod.isExpired(), bounds.name).toBe(expectedExpired);
    }
  });

  it('contains exactly one row where isCurrent and getCurrentFlag disagree', () => {
    const fixtures = freshFixtures();
    const divergent = fixtures.periodDateBoundsCases.filter(
      (bounds) =>
        bounds.isCurrentOutcome !== 'throws' &&
        bounds.isCurrentOutcome !== bounds.getCurrentFlagOutcome,
    );

    expect(divergent.map((bounds) => bounds.name)).toStrictEqual(['nowAtEndDateTime']);
  });

  it('contains exactly three rows that isCurrent cannot evaluate, all of them null-bounded', () => {
    const fixtures = freshFixtures();
    const throwing = fixtures.periodDateBoundsCases.filter(
      (bounds) => bounds.isCurrentOutcome === 'throws',
    );

    expect(throwing.map((bounds) => bounds.name)).toStrictEqual([
      'startDateTimeAbsent',
      'endDateTimeAbsent',
      'bothBoundsAbsent',
    ]);

    for (const bounds of throwing) {
      expect(bounds.getCurrentFlagOutcome, bounds.name).toBe(true);
      expect(bounds.startDateTimeUTC === undefined || bounds.endDateTimeUTC === undefined).toBe(
        true,
      );
    }
  });
});

// In CFML the failure arrives through the onMissingMethod dispatcher at
// [org/Hibachi/HibachiEntity.cfc:L507-L565].
describe('addPromotionReward is inoperable', () => {
  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L116-L118]: addPromotionReward calls
  // promotionReward.setPromotion(this) at L117, but PromotionReward declares only
  // setPromotionPeriod - the call target does not exist, so this method throws at runtime.
  // Preserved deliberately; do not fix without a product decision.
  it('throws the framework missing-method message naming setPromotion on PromotionReward', () => {
    const fixtures = freshFixtures();
    const period = makePeriod();

    expect(() => period.addPromotionReward(rewardFrom(fixtures))).toThrow(
      'You have called a method setPromotion() which does not exists in the PromotionReward entity.',
    );
  });

  it('leaves the collection untouched, because it throws before mutating anything', () => {
    const fixtures = freshFixtures();
    const period = makePeriod();

    expect(() => period.addPromotionReward(rewardFrom(fixtures))).toThrow();
    expect(period.getPromotionRewards()).toStrictEqual([]);
  });
});

describe('removePromotionReward is inoperable', () => {
  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L120-L122]: removePromotionReward calls
  // promotionReward.removePromotion(this) at L121, but PromotionReward declares only
  // removePromotionPeriod - the call target does not exist, so this method throws at runtime.
  // Preserved deliberately; do not fix without a product decision.
  it('throws the framework missing-method message naming removePromotion on PromotionReward', () => {
    const fixtures = freshFixtures();
    const period = makePeriod();

    expect(() => period.removePromotionReward(rewardFrom(fixtures))).toThrow(
      'You have called a method removePromotion() which does not exists in the PromotionReward entity.',
    );
  });

  it('throws even when the reward IS a member, so membership is not the deciding factor', () => {
    const fixtures = freshFixtures();
    const reward = rewardFrom(fixtures);
    const period = makePeriod({ promotionRewards: [reward] });

    expect(period.hasPromotionReward(reward)).toBe(true);
    expect(() => period.removePromotionReward(reward)).toThrow();
    expect(period.getPromotionRewards()).toStrictEqual([reward]);
  });
});

describe('addPromotionQualifier is inoperable', () => {
  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L125-L127]: addPromotionQualifier calls
  // promotionQualifier.setPromotion(this) at L126, but PromotionQualifier declares only
  // setPromotionPeriod - the call target does not exist, so this method throws at runtime.
  // Preserved deliberately; do not fix without a product decision.
  it('throws the framework missing-method message naming setPromotion on PromotionQualifier', () => {
    const fixtures = freshFixtures();
    const period = makePeriod();

    expect(() => period.addPromotionQualifier(qualifierFrom(fixtures))).toThrow(
      'You have called a method setPromotion() which does not exists in the PromotionQualifier entity.',
    );
  });

  it('leaves the collection untouched', () => {
    const fixtures = freshFixtures();
    const period = makePeriod();

    expect(() => period.addPromotionQualifier(qualifierFrom(fixtures))).toThrow();
    expect(period.getPromotionQualifiers()).toStrictEqual([]);
  });
});

describe('removePromotionQualifier is inoperable', () => {
  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L128-L130]: removePromotionQualifier calls
  // arguments.PromotionQualifier.removePromotion(this) at L129 - with a CAPITAL `P` where L128
  // declares lowercase `promotionQualifier`.
  // Preserved deliberately; do not fix without a product decision.
  it('throws the framework missing-method message naming removePromotion on PromotionQualifier', () => {
    const fixtures = freshFixtures();
    const period = makePeriod();

    expect(() => period.removePromotionQualifier(qualifierFrom(fixtures))).toThrow(
      'You have called a method removePromotion() which does not exists in the PromotionQualifier entity.',
    );
  });

  it('throws even when the qualifier IS a member', () => {
    const fixtures = freshFixtures();
    const qualifier = qualifierFrom(fixtures);
    const period = makePeriod({ promotionQualifiers: [qualifier] });

    expect(period.hasPromotionQualifier(qualifier)).toBe(true);
    expect(() => period.removePromotionQualifier(qualifier)).toThrow();
    expect(period.getPromotionQualifiers()).toStrictEqual([qualifier]);
  });

  it('keeps its single legacy parameter, so the capitalization wart cost no arity change', () => {
    // C4: only `isCurrent` was widened.
    expect(PromotionPeriod.prototype.addPromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.addPromotionQualifier.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionQualifier.length).toBe(1);
  });

  it('declares all four as void-returning, not never-returning', () => {
    // The shipped signatures return `void`, matching the legacy `public void function`
    // declarations at L116, L120, L125 and L128.
    const fixtures = freshFixtures();
    const period = makePeriod();
    const reward = rewardFrom(fixtures);

    const call: () => void = () => {
      period.addPromotionReward(reward);
    };

    expect(call).toThrow();
  });
});

// LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L104-L113]: removePromotion resolves the index
// from arguments.promotion at L108 but deletes from arguments.account at L110 - a leaked
// identifier from a copy-pasted sibling.
// Preserved deliberately; do not fix without a product decision.
//
// JUDGMENT CALL: the two languages disagree about the "not found" sentinel, which makes this the
// single most likely mistranslation in the method: CFML arrayFind returns 0 when absent, so L109
// guards with `index > 0` TS `Array.prototype.findIndex` returns -1 when absent.
describe('removePromotion throws on the found path and never mutates either side', () => {
  it('throws naming the leaked argument when the period IS in the promotion collection', () => {
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;
    const promotion = fixtures.promotion;

    expect(promotion.hasPromotionPeriod(period)).toBe(true);

    expect(() => period.removePromotion(promotion)).toThrow('arguments.account');
  });

  it('cites L110 and records that the near-side clear at L112 is never reached', () => {
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;

    expect(() => period.removePromotion(fixtures.promotion)).toThrow(
      'model/entity/PromotionPeriod.cfc:L110',
    );
    expect(() => period.removePromotion(fixtures.promotion)).toThrow(
      'model/entity/PromotionPeriod.cfc:L112 never runs',
    );
  });

  it('leaves the parent collection intact - the delete at L110 never happens', () => {
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;
    const promotion = fixtures.promotion;
    const sizeBefore = promotion.getPromotionPeriods().length;

    expect(() => period.removePromotion(promotion)).toThrow();

    expect(promotion.getPromotionPeriods()).toHaveLength(sizeBefore);
    expect(promotion.hasPromotionPeriod(period)).toBe(true);
  });

  it('leaves the NEAR side intact too, because L112 sits after the throw', () => {
    // The observable consequence of the leak: the period still believes it belongs to the
    // promotion, so the association is un-removed on both sides.
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;
    const promotion = fixtures.promotion;

    expect(() => period.removePromotion(promotion)).toThrow();

    expect(period.getPromotion()).toBe(promotion);
  });

  it('throws identically when the argument is omitted and the near-side field supplies it', () => {
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;

    expect(() => period.removePromotion()).toThrow('arguments.account');
    expect(period.getPromotion()).toBe(fixtures.promotion);
  });

  it('throws on a match at position ZERO, which an `index > 0` mistranslation would miss', () => {
    // The findIndex boundary, asserted directly. The fixture period is the FIRST element, so its
    // index is 0 - legitimate in TypeScript, "not found" under CFML's 1-based `arrayFind`.
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;
    const promotion = fixtures.promotion;

    const positionOfPeriod = promotion
      .getPromotionPeriods()
      .findIndex((candidate) => candidate.getPromotionPeriodID() === period.getPromotionPeriodID());

    expect(positionOfPeriod).toBe(0);
    expect(() => period.removePromotion(promotion)).toThrow('arguments.account');
  });
});

describe('removePromotion clears the near side only on the not-found path', () => {
  it('clears its own promotion reference when it is NOT in the collection', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const stranger = makePeriod({ promotionPeriodID: OTHER_PERIOD_ID, promotion });

    expect(promotion.hasPromotionPeriod(stranger)).toBe(false);
    expect(stranger.getPromotion()).toBe(promotion);

    stranger.removePromotion(promotion);

    expect(stranger.getPromotion()).toBeUndefined();
  });

  it('leaves the promotion collection alone on the not-found path as well', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const membersBefore = [...promotion.getPromotionPeriods()];
    const stranger = makePeriod({ promotionPeriodID: OTHER_PERIOD_ID, promotion });

    stranger.removePromotion(promotion);

    expect(promotion.getPromotionPeriods()).toStrictEqual(membersBefore);
  });

  it('clears the near side when the argument is omitted and the field points elsewhere', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const stranger = makePeriod({ promotionPeriodID: OTHER_PERIOD_ID, promotion });

    stranger.removePromotion();

    expect(stranger.getPromotion()).toBeUndefined();
  });

  it('matches membership on the primary key alone, not on object identity', () => {
    // Hibernate session-identity semantics: two hydrations of one row are the same entity, so a
    // distinct object carrying the same promotionPeriodID is treated as a member and lands on the
    // FOUND path.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const twin = makePeriod({
      promotionPeriodID: fixtures.promotionPeriod.getPromotionPeriodID(),
      promotion,
    });

    expect(twin).not.toBe(fixtures.promotionPeriod);
    expect(promotion.hasPromotionPeriod(twin)).toBe(true);
    expect(() => twin.removePromotion(promotion)).toThrow('arguments.account');
  });
});

describe('removePromotion raises when neither the argument nor the field resolves a promotion', () => {
  // CFML parity [model/entity/PromotionPeriod.cfc:L104-L108]: L105-L107 default the argument from
  // `variables.promotion`, and L108 then calls getPromotionPeriods() on the result
  // UNCONDITIONALLY.
  it('throws when called with no argument on a period that has no promotion', () => {
    const period = makePeriod({ promotion: undefined });

    expect(period.getPromotion()).toBeUndefined();
    expect(() => period.removePromotion()).toThrow('cannot resolve a promotion');
  });

  it('keeps its single OPTIONAL parameter, matching the legacy `any promotion` declaration', () => {
    expect(PromotionPeriod.prototype.removePromotion.length).toBe(1);
    expect(PromotionPeriod.prototype.setPromotion.length).toBe(1);
  });
});

// CFML parity [model/entity/PromotionPeriod.cfc:L98-L103]: setPromotion is the one member of the
// bidirectional window that is SOUND, and it is deliberately unmarked so the defect register stays
// honest.
describe('setPromotion assigns the near side and keeps the far side symmetric', () => {
  it('assigns the reference and appends to the promotion collection', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    replacePeriodsWith(promotion, []);
    const period = makePeriod({ promotion: undefined });

    period.setPromotion(promotion);

    expect(period.getPromotion()).toBe(promotion);
    expect(promotion.getPromotionPeriods()).toStrictEqual([period]);
  });

  it('is idempotent for a PERSISTED period, because L100 consults hasPromotionPeriod', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    replacePeriodsWith(promotion, []);
    const period = makePeriod({ promotionPeriodID: PERSISTED_PERIOD_ID, promotion: undefined });

    period.setPromotion(promotion);
    period.setPromotion(promotion);
    period.setPromotion(promotion);

    expect(promotion.getPromotionPeriods()).toStrictEqual([period]);
  });

  it('appends unconditionally for a NEW period, because `isNew()` short-circuits the guard', () => {
    // CFML parity [model/entity/PromotionPeriod.cfc:L100]: the guard is isNew() or
    // !arguments.promotion.hasPromotionPeriod( this ) and the FIRST arm tests this instance's
    // newness.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    replacePeriodsWith(promotion, []);
    const unsaved = makePeriod({ promotionPeriodID: NEW_PERIOD_ID, promotion: undefined });

    expect(unsaved.isNew()).toBe(true);

    unsaved.setPromotion(promotion);
    unsaved.setPromotion(promotion);

    expect(promotion.getPromotionPeriods()).toStrictEqual([unsaved, unsaved]);
  });

  it('appends two DISTINCT unsaved periods, losing neither to an empty-key collision', () => {
    // Two independent mechanisms protect this case, and only one is legacy.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    replacePeriodsWith(promotion, []);
    const first = makePeriod({ promotionPeriodID: NEW_PERIOD_ID, promotion: undefined });
    const second = makePeriod({ promotionPeriodID: NEW_PERIOD_ID, promotion: undefined });

    first.setPromotion(promotion);

    expect(second.getPromotionPeriodID()).toBe(first.getPromotionPeriodID());
    expect(promotion.hasPromotionPeriod(second)).toBe(false);

    second.setPromotion(promotion);

    expect(promotion.getPromotionPeriods()).toStrictEqual([first, second]);
  });

  it('appends an unsaved period again even when the far side reports it already present', () => {
    // The sharpest isolation of the L100 guard.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    replacePeriodsWith(promotion, []);
    const unsaved = makePeriod({ promotionPeriodID: NEW_PERIOD_ID, promotion: undefined });

    unsaved.setPromotion(promotion);

    expect(promotion.hasPromotionPeriod(unsaved)).toBe(true);

    unsaved.setPromotion(promotion);

    expect(promotion.getPromotionPeriods()).toStrictEqual([unsaved, unsaved]);
  });

  it('reassigns the near side when called with a different promotion', () => {
    const fixtures = freshFixtures();
    const first = fixtures.promotion;
    const second = fixtures.codelessPromotion;
    replacePeriodsWith(first, []);
    replacePeriodsWith(second, []);
    const period = makePeriod({ promotion: undefined });

    period.setPromotion(first);
    expect(period.getPromotion()).toBe(first);

    period.setPromotion(second);
    expect(period.getPromotion()).toBe(second);

    expect(first.getPromotionPeriods()).toStrictEqual([period]);
    expect(second.getPromotionPeriods()).toStrictEqual([period]);
  });

  it('appends into the LIVE collection, so the far side is genuinely shared', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    replacePeriodsWith(promotion, []);
    const collectionReference = promotion.getPromotionPeriods();
    const period = makePeriod({ promotion: undefined });

    period.setPromotion(promotion);

    expect(promotion.getPromotionPeriods()).toBe(collectionReference);
    expect(collectionReference).toStrictEqual([period]);
  });
});

// CFML parity [model/entity/PromotionPeriod.cfc:L87-L89]: the declaration carries a STRAY SPACE -
// `public boolean function isDeletable ()` - annotated rather than normalised, and the body is
// `!isExpired() && getPromotion().isDeletable()`.
describe('isDeletable short-circuits on expiry before reaching the promotion', () => {
  it('is false for an expired period WITHOUT touching the promotion at all', () => {
    const period = makePeriod({
      startDateTime: instant(EXPIRED_PERIOD_START_UTC),
      endDateTime: instant(EXPIRED_PERIOD_END_UTC),
      promotion: undefined,
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.isExpired()).toBe(true);
    expect(period.getPromotion()).toBeUndefined();
    expect(period.isDeletable()).toBe(false);
  });

  it('throws for a NON-expired period whose promotion was never materialized', () => {
    const period = makePeriod({ promotion: undefined, now: fixedClock(instant(NOW_UTC)) });

    expect(period.isExpired()).toBe(false);
    expect(() => period.isDeletable()).toThrow('cannot reach its promotion');
  });

  it('cites L88 and the fetch="join" declaration that makes the omission survivable', () => {
    const period = makePeriod({ promotion: undefined });

    expect(() => period.isDeletable()).toThrow('model/entity/PromotionPeriod.cfc:L88');
    expect(() => period.isDeletable()).toThrow('fetch="join"');
  });

  it('throws after removePromotion has cleared the near side on the not-found path', () => {
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const stranger = makePeriod({ promotionPeriodID: OTHER_PERIOD_ID, promotion });

    stranger.removePromotion(promotion);

    expect(stranger.getPromotion()).toBeUndefined();
    expect(() => stranger.isDeletable()).toThrow('cannot reach its promotion');
  });

  it('delegates to Promotion.isDeletable when the period is live and the promotion is present', () => {
    // CFML parity [model/entity/Promotion.cfc:L170-L172]: the far side is
    // `arrayLen( getAppliedPromotions() ) == 0` PERMISSIVE on an empty collection.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const period = makePeriod({ promotion, now: fixedClock(fixtures.now) });

    expect(promotion.getAppliedPromotions()).toHaveLength(1);
    expect(period.isDeletable()).toBe(false);

    const applied = promotion.getAppliedPromotions();
    applied.splice(0, applied.length);

    expect(period.isDeletable()).toBe(true);
  });

  it('is not deletable when expired EVEN IF the promotion says it is', () => {
    const fixtures = freshFixtures();
    const period = makePeriod({
      startDateTime: instant(EXPIRED_PERIOD_START_UTC),
      endDateTime: instant(EXPIRED_PERIOD_END_UTC),
      promotion: deletablePromotionFrom(fixtures),
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(period.isDeletable()).toBe(false);
  });

  it('keeps its legacy zero arity despite reading the clock through isExpired', () => {
    expect(PromotionPeriod.prototype.isDeletable.length).toBe(0);
  });
});

// CFML parity [model/entity/PromotionPeriod.cfc:L91-L93]: getSimpleRepresentation is UNGUARDED -
// `return getPromotion().getPromotionName();` with no null check on either hop.
describe('getSimpleRepresentation reaches through the promotion with no guard on either hop', () => {
  it('throws when the promotion is absent, so a bare instance cannot satisfy the inherited check', () => {
    const period = makePeriod({ promotion: undefined });

    expect(() => period.getSimpleRepresentation()).toThrow('cannot reach its promotion');
    expect(() => period.getSimpleRepresentation()).toThrow('model/entity/PromotionPeriod.cfc:L92');
  });

  it('returns the promotion name when the promotion IS materialized', () => {
    const fixtures = freshFixtures();
    const period = makePeriod({ promotion: fixtures.promotion });

    expect(period.getSimpleRepresentation()).toBe(fixtures.promotion.getPromotionName());
    expect(typeof period.getSimpleRepresentation()).toBe('string');
  });

  it('throws on the SECOND hop when the promotion exists but carries no name', () => {
    // `Promotion.getPromotionName()` is `string | undefined` because
    // [model/entity/Promotion.cfc:L53] declares the column without notNull, while
    // [model/entity/PromotionPeriod.cfc:L91] declares `returntype="string"`.
    const namelessPromotion = new Promotion({ promotionID: 'promotion-without-a-name' });
    const period = makePeriod({ promotion: namelessPromotion });

    expect(namelessPromotion.getPromotionName()).toBeUndefined();
    expect(() => period.getSimpleRepresentation()).toThrow('the promotion has no');
  });

  it('does not fall back to the empty string, the period id, or any other stand-in', () => {
    // A "helpful" port returning '' here would surface as a blank admin row, not an error.
    const namelessPromotion = new Promotion({ promotionID: 'promotion-without-a-name' });
    const period = makePeriod({ promotion: namelessPromotion });

    let observed: string | undefined;
    try {
      observed = period.getSimpleRepresentation();
    } catch {
      observed = undefined;
    }

    expect(observed).toBeUndefined();
  });

  it('keeps its legacy zero arity', () => {
    expect(PromotionPeriod.prototype.getSimpleRepresentation.length).toBe(0);
  });
});

// CFML parity [model/entity/PromotionPeriod.cfc:L55-L56]: maximumUseCount and
// maximumAccountUseCount are notnull="false" with hb_nullRBKey="define.unlimited" - undefined
// means UNLIMITED, not zero, and substituting 0 would forbid every use.
//
// CFML parity [model/entity/PromotionPeriod.cfc:L53-L54]: startDateTime and endDateTime carry
// hb_nullRBKey="define.forever" - undefined means FOREVER, not the epoch, and a zero-millisecond
// Date would convert an unbounded window into one that closed in 1970.
describe('absent use ceilings mean UNLIMITED and are never coerced to zero', () => {
  it('reports undefined - not 0 - when neither ceiling is persisted', () => {
    const period = makePeriod({ maximumUseCount: undefined, maximumAccountUseCount: undefined });

    expect(period.getMaximumUseCount()).toBeUndefined();
    expect(period.getMaximumAccountUseCount()).toBeUndefined();
    expect(period.getMaximumUseCount()).not.toBe(0);
    expect(period.getMaximumAccountUseCount()).not.toBe(0);
  });

  it('keeps a persisted ZERO distinct from an absent ceiling', () => {
    // The two states are not interchangeable, and the engine reads them differently: the promotion
    // engine pairs `!isNull(...)` with a `gt 0` test.
    const period = makePeriod({ maximumUseCount: 0, maximumAccountUseCount: 0 });

    expect(period.getMaximumUseCount()).toBe(0);
    expect(period.getMaximumAccountUseCount()).toBe(0);
    expect(period.getMaximumUseCount()).not.toBeUndefined();
  });

  it('round-trips ordinary ceilings unchanged', () => {
    const period = makePeriod();

    expect(period.getMaximumUseCount()).toBe(PERIOD_MAXIMUM_USE_COUNT);
    expect(period.getMaximumAccountUseCount()).toBe(PERIOD_MAXIMUM_ACCOUNT_USE_COUNT);
  });

  it('never performs arithmetic on a ceiling - they are integer counts, not money', () => {
    const period = makePeriod({ maximumUseCount: 7, maximumAccountUseCount: 3 });

    expect(Number.isInteger(period.getMaximumUseCount())).toBe(true);
    expect(Number.isInteger(period.getMaximumAccountUseCount())).toBe(true);
  });
});

describe('absent date bounds mean FOREVER and are never coerced to the epoch', () => {
  it('reports undefined for an absent start bound, and not any Date at all', () => {
    const period = makePeriod({ startDateTime: undefined });

    expect(period.getStartDateTime()).toBeUndefined();

    expect(period.getStartDateTime()?.getTime()).toBeUndefined();
  });

  it('reports undefined for an absent end bound, and not any Date at all', () => {
    const period = makePeriod({ endDateTime: undefined });

    expect(period.getEndDateTime()).toBeUndefined();
    expect(period.getEndDateTime()?.getTime()).toBeUndefined();
  });

  it('round-trips present bounds as the exact instants persisted', () => {
    const period = makePeriod();

    expect(period.getStartDateTime()?.toISOString()).toBe(PERIOD_START_UTC);
    expect(period.getEndDateTime()?.toISOString()).toBe(PERIOD_END_UTC);
  });

  it('applies the same convention to the audit timestamps', () => {
    const present = makePeriod();
    const absent = makePeriod({ createdDateTime: undefined, modifiedDateTime: undefined });

    expect(present.getCreatedDateTime()?.toISOString()).toBe(CREATED_DATE_TIME_UTC);
    expect(present.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_DATE_TIME_UTC);

    expect(absent.getCreatedDateTime()).toBeUndefined();
    expect(absent.getModifiedDateTime()).toBeUndefined();
    expect(absent.getCreatedDateTime()?.getTime()).toBeUndefined();
    expect(absent.getModifiedDateTime()?.getTime()).toBeUndefined();
  });

  it('applies it to the audit account keys and to remoteID as well', () => {
    const absent = makePeriod();
    const present = makePeriod({
      createdByAccountID: 'account-created',
      modifiedByAccountID: 'account-modified',
      remoteID: 'remote-1',
    });

    expect(absent.getCreatedByAccountID()).toBeUndefined();
    expect(absent.getModifiedByAccountID()).toBeUndefined();
    expect(absent.getRemoteID()).toBeUndefined();

    expect(present.getCreatedByAccountID()).toBe('account-created');
    expect(present.getModifiedByAccountID()).toBe('account-modified');
    expect(present.getRemoteID()).toBe('remote-1');
  });
});

// That is the entire inventory: two properties, one condition, three rules.
//
// Enforcement is a SERVICE-TIER concern, so the tests below prove the entity accepts data the
// schema would reject - correct, because the legacy ORM hydrates such rows happily.
describe('the validation schema inventory is exactly two properties and one condition', () => {
  it('names the condition and the comparison the way the fixture module records them', () => {
    const fixtures = freshFixtures();

    expect(fixtures.conditionalDateValidationName).toBe('needsEndAfterStart');
    expect(fixtures.conditionalDateValidationComparison).toBe('gtProperty: startDateTime');
  });

  it('validates the two date properties, both of which the entity exposes', () => {
    const period = makePeriod();

    expect(period.getStartDateTime()).toBeInstanceOf(Date);
    expect(period.getEndDateTime()).toBeInstanceOf(Date);
  });

  it('leaves both use ceilings entirely unvalidated even though the entity exposes them', () => {
    const period = makePeriod({ maximumUseCount: -1, maximumAccountUseCount: -1 });

    expect(period.getMaximumUseCount()).toBe(-1);
    expect(period.getMaximumAccountUseCount()).toBe(-1);
  });

  it('has no delete gate, so a period holding rewards and qualifiers is still deletable', () => {
    // `PromotionCode.json` gates deletion on an empty `orders` collection; `PromotionPeriod.json`
    // has no equivalent rule on either owned collection, so deletability depends only on expiry
    // and the promotion.
    const fixtures = freshFixtures();
    const period = makePeriod({
      promotion: deletablePromotionFrom(fixtures),
      promotionRewards: [rewardFrom(fixtures)],
      promotionQualifiers: [qualifierFrom(fixtures)],
      now: fixedClock(fixtures.now),
    });

    expect(period.getPromotionRewards()).toHaveLength(1);
    expect(period.getPromotionQualifiers()).toHaveLength(1);
    expect(period.isDeletable()).toBe(true);
  });

  it('treats the end-after-start comparison as CONDITIONAL on both dates being present', () => {
    // That is what `needsEndAfterStart` encodes: the condition requires both properties, so when
    // either is missing the comparison never fires and the row satisfies the rule vacuously.
    const fixtures = freshFixtures();
    const rowsWithAnAbsentBound = fixtures.periodDateBoundsCases.filter(
      (bounds) => bounds.startDateTimeUTC === undefined || bounds.endDateTimeUTC === undefined,
    );

    expect(rowsWithAnAbsentBound).toHaveLength(3);

    for (const bounds of rowsWithAnAbsentBound) {
      expect(bounds.satisfiesNeedsEndAfterStart, bounds.name).toBe(true);
    }
  });

  it('fires the comparison only for the two rows where both dates are present and mis-ordered', () => {
    const fixtures = freshFixtures();
    const violating = fixtures.periodDateBoundsCases.filter(
      (bounds) => !bounds.satisfiesNeedsEndAfterStart,
    );

    expect(violating.map((bounds) => bounds.name)).toStrictEqual([
      'endBeforeStart',
      'endEqualsStart',
    ]);

    for (const bounds of violating) {
      expect(bounds.startDateTimeUTC, bounds.name).toBeDefined();
      expect(bounds.endDateTimeUTC, bounds.name).toBeDefined();
    }
  });

  it('reads gtProperty as STRICTLY greater, so equal bounds violate the rule', () => {
    const fixtures = freshFixtures();
    const equalBounds = fixtures.periodDateBoundsCases.find(
      (bounds) => bounds.name === 'endEqualsStart',
    );

    expect(equalBounds?.startDateTimeUTC).toBe(equalBounds?.endDateTimeUTC);
    expect(equalBounds?.satisfiesNeedsEndAfterStart).toBe(false);
  });

  it('constructs happily from rows the schema would reject - no entity-level invariant', () => {
    const inverted = makePeriod({
      startDateTime: instant(FUTURE_PERIOD_START_UTC),
      endDateTime: instant(PERIOD_START_UTC),
      now: fixedClock(instant(NOW_UTC)),
    });
    const zeroWidth = makePeriod({
      startDateTime: instant(PERIOD_START_UTC),
      endDateTime: instant(PERIOD_START_UTC),
      now: fixedClock(instant(NOW_UTC)),
    });

    expect(inverted.isCurrent(instant(NOW_UTC))).toBe(false);
    expect(inverted.getCurrentFlag()).toBe(false);
    expect(inverted.isExpired()).toBe(true);

    expect(zeroWidth.isCurrent(instant(NOW_UTC))).toBe(false);
    expect(zeroWidth.getCurrentFlag()).toBe(false);
    expect(zeroWidth.isExpired()).toBe(true);
  });

  it('shares the condition NAME with PromotionCode without sharing any code', () => {
    const fixtures = freshFixtures();

    expect(fixtures.datedPromotionCodes).toHaveLength(fixtures.datedPromotionPeriods.length);
    expect(fixtures.datedPromotionCodes.map((row) => row.bounds.name)).toStrictEqual(
      fixtures.datedPromotionPeriods.map((row) => row.bounds.name),
    );
  });
});

describe('the row carries an honest primary key and an already-materialized promotion', () => {
  it('is new when the primary key is the empty string, per default="" at L52', () => {
    const unsaved = makePeriod({ promotionPeriodID: NEW_PERIOD_ID });
    const persisted = makePeriod({ promotionPeriodID: PERSISTED_PERIOD_ID });

    expect(unsaved.isNew()).toBe(true);
    expect(unsaved.getPromotionPeriodID()).toBe('');
    expect(persisted.isNew()).toBe(false);
    expect(persisted.getPromotionPeriodID()).toBe(PERSISTED_PERIOD_ID);
  });

  it('returns the promotion synchronously, because associations arrive materialized', () => {
    // [model/entity/PromotionPeriod.cfc:L59] is `fetch="join"` - one of only four eager sites in
    // the in-scope entity set, alongside Product.cfc:L68 `brand`, L69 `productType` and L70
    // `defaultSku`.
    const fixtures = freshFixtures();
    const period = makePeriod({ promotion: fixtures.promotion });
    const association = period.getPromotion();

    expect(association).toBe(fixtures.promotion);
    expect(association).toBeInstanceOf(Promotion);
    expect(association).not.toHaveProperty('then');
  });

  it('keeps the promotionID column readable even when the association was not fetched', () => {
    // The FK column is held alongside the association, so the key survives a repository choosing
    // not to materialize the far side.
    const withoutAssociation = makePeriod({ promotion: undefined, promotionID: PROMOTION_ID });
    const withoutColumn = makePeriod({ promotion: undefined, promotionID: undefined });

    expect(withoutAssociation.getPromotion()).toBeUndefined();
    expect(withoutAssociation.getPromotionID()).toBe(PROMOTION_ID);
    expect(withoutAssociation.getPromotionID()).not.toBe('');

    expect(withoutColumn.getPromotionID()).toBeUndefined();
  });

  it('defaults both owned collections to empty arrays, never to undefined', () => {
    const period = makePeriod();

    expect(period.getPromotionRewards()).toStrictEqual([]);
    expect(period.getPromotionQualifiers()).toStrictEqual([]);
  });

  it('exposes both collections as stable live arrays', () => {
    // [model/entity/PromotionPeriod.cfc:L62-L63] are `inverse="true"`, so the CHILD owns the
    // association and mutates the parent's array in place from `setPromotionPeriod`.
    const fixtures = freshFixtures();
    const reward = rewardFrom(fixtures);
    const period = makePeriod();
    const rewards = period.getPromotionRewards();

    rewards.push(reward);

    expect(period.getPromotionRewards()).toBe(rewards);
    expect(period.hasPromotionReward(reward)).toBe(true);
  });

  it('answers both containment probes by primary key, and false on an empty collection', () => {
    const fixtures = freshFixtures();
    const reward = rewardFrom(fixtures);
    const qualifier = qualifierFrom(fixtures);
    const empty = makePeriod();
    const populated = makePeriod({
      promotionRewards: [reward],
      promotionQualifiers: [qualifier],
    });

    expect(empty.hasPromotionReward(reward)).toBe(false);
    expect(empty.hasPromotionQualifier(qualifier)).toBe(false);
    expect(populated.hasPromotionReward(reward)).toBe(true);
    expect(populated.hasPromotionQualifier(qualifier)).toBe(true);
  });
});

describe('the ported surface is exactly the legacy surface, with nothing invented', () => {
  it('exposes precisely these members and no others', () => {
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype).sort();

    expect(surface).toStrictEqual([
      'addPromotionQualifier',
      'addPromotionReward',
      'constructor',
      'getCreatedByAccountID',
      'getCreatedDateTime',
      'getCurrentFlag',
      'getEndDateTime',
      'getMaximumAccountUseCount',
      'getMaximumUseCount',
      'getModifiedByAccountID',
      'getModifiedDateTime',
      'getPromotion',
      'getPromotionID',
      'getPromotionPeriodID',
      'getPromotionQualifiers',
      'getPromotionRewards',
      'getRemoteID',
      'getSimpleRepresentation',
      'getStartDateTime',
      'hasPromotionQualifier',
      'hasPromotionReward',
      'isCurrent',
      'isDeletable',
      'isExpired',
      'isNew',
      'removePromotion',
      'removePromotionQualifier',
      'removePromotionReward',
      'setPromotion',
    ]);
  });

  it('declares NO ORM event hook, because the legacy hook block is literally empty', () => {
    // [model/entity/PromotionPeriod.cfc:L158-L160] is an EMPTY banner pair - START and END
    // comments with nothing between them.
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype);

    expect(surface).not.toContain('preInsert');
    expect(surface).not.toContain('preUpdate');
    expect(surface).not.toContain('postInsert');
    expect(surface).not.toContain('postUpdate');
    expect(surface).not.toContain('postDelete');
  });

  it('implements no dynamic dispatch and no attribute-value fallback', () => {
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype);

    expect(surface).not.toContain('getAttributeValue');
    expect(surface).not.toContain('onMissingMethod');
    expect(surface).not.toContain('setAttributeValue');
  });

  it('exposes no validation, error, or population surface', () => {
    // The framework base contributed `validate`, `hasErrors`, `getErrors` and a populate pipeline.
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype);

    expect(surface).not.toContain('validate');
    expect(surface).not.toContain('hasErrors');
    expect(surface).not.toContain('getErrors');
    expect(surface).not.toContain('populate');
  });

  it('injects no collaborator port - only the plain clock', () => {
    const fixtures = freshFixtures();
    const period = makePeriod({ promotion: fixtures.promotion, now: fixedClock(fixtures.now) });

    expect(period.isCurrent(fixtures.now)).not.toHaveProperty('then');
    expect(period.getCurrentFlag()).not.toHaveProperty('then');
    expect(period.isExpired()).not.toHaveProperty('then');
    expect(period.isDeletable()).not.toHaveProperty('then');
    expect(period.getSimpleRepresentation()).not.toHaveProperty('then');
  });

  it('accepts the clock as a constructor argument rather than reading an ambient one', () => {
    const inside = makePeriod({ now: fixedClock(instant(NOW_UTC)) });
    const afterwards = makePeriod({ now: fixedClock(instant('2025-01-01T00:00:00.000Z')) });

    expect(inside.isExpired()).toBe(false);
    expect(afterwards.isExpired()).toBe(true);
  });
});

// [model/entity/PromotionPeriod.cfc:L75] declares `currentFlag` as `persistent="false"`, and
// [model/entity/PromotionPeriod.cfc:L137-L146] memoizes it in `variables`.
describe('the currentFlag memo is instance state and never leaks between instances', () => {
  it('does not share a memoized answer with a second, independent instance', () => {
    const clock = movableClock(instant(NOW_UTC));
    const first = makePeriod({ now: clock.clock });

    // First instance memoizes TRUE while the window is open.
    expect(first.getCurrentFlag()).toBe(true);

    clock.moveTo(instant('2025-01-01T00:00:00.000Z'));

    // A second instance built from identical data computes FRESH against the moved clock...
    const second = makePeriod({ now: clock.clock });
    expect(second.getCurrentFlag()).toBe(false);

    expect(first.getCurrentFlag()).toBe(true);
  });

  it('starts every instance with an empty memo, so nothing survives construction', () => {
    const clock = movableClock(instant('2025-01-01T00:00:00.000Z'));
    const warmUp = makePeriod({ now: fixedClock(instant(NOW_UTC)) });

    expect(warmUp.getCurrentFlag()).toBe(true);

    const cold = makePeriod({ now: clock.clock });

    expect(cold.getCurrentFlag()).toBe(false);
  });

  it('keeps the memo off the prototype, so it cannot become shared state', () => {
    const period = makePeriod();

    expect(period.getCurrentFlag()).toBe(true);
    expect(Object.getOwnPropertyNames(PromotionPeriod.prototype)).not.toContain('currentFlag');
  });

  it('gives each fixture graph its own object tree', () => {
    const first = freshFixtures();
    const second = freshFixtures();

    expect(first.promotion).not.toBe(second.promotion);
    expect(first.promotionPeriod).not.toBe(second.promotionPeriod);

    replacePeriodsWith(first.promotion, []);

    expect(first.promotion.getPromotionPeriods()).toHaveLength(0);
    expect(second.promotion.getPromotionPeriods()).toHaveLength(1);
  });
});

describe('exactly one entity-layer signature widening was spent, and no second one', () => {
  it('gives isCurrent the single extra instant parameter and leaves every sibling at legacy arity', () => {
    // C4, made checkable.
    //
    // JUDGMENT CALL: every assertion below reads `.length` DIRECTLY off the method rather than
    // passing the method to `expect(...)` and matching with `toHaveLength`.
    expect(PromotionPeriod.prototype.isCurrent.length).toBe(1);

    // Legacy zero-argument members, every one unchanged. Each is referenced DIRECTLY rather than
    // by string key, so a renamed or deleted member is a compile error here rather than a
    // silently-skipped loop iteration.
    expect(PromotionPeriod.prototype.isExpired.length).toBe(0);
    expect(PromotionPeriod.prototype.isDeletable.length).toBe(0);
    expect(PromotionPeriod.prototype.getCurrentFlag.length).toBe(0);
    expect(PromotionPeriod.prototype.getSimpleRepresentation.length).toBe(0);
    expect(PromotionPeriod.prototype.isNew.length).toBe(0);
    expect(PromotionPeriod.prototype.getPromotionPeriodID.length).toBe(0);
    expect(PromotionPeriod.prototype.getStartDateTime.length).toBe(0);
    expect(PromotionPeriod.prototype.getEndDateTime.length).toBe(0);
    expect(PromotionPeriod.prototype.getMaximumUseCount.length).toBe(0);
    expect(PromotionPeriod.prototype.getMaximumAccountUseCount.length).toBe(0);
    expect(PromotionPeriod.prototype.getPromotion.length).toBe(0);
    expect(PromotionPeriod.prototype.getPromotionID.length).toBe(0);
    expect(PromotionPeriod.prototype.getPromotionRewards.length).toBe(0);
    expect(PromotionPeriod.prototype.getPromotionQualifiers.length).toBe(0);
    expect(PromotionPeriod.prototype.getRemoteID.length).toBe(0);
    expect(PromotionPeriod.prototype.getCreatedDateTime.length).toBe(0);
    expect(PromotionPeriod.prototype.getCreatedByAccountID.length).toBe(0);
    expect(PromotionPeriod.prototype.getModifiedDateTime.length).toBe(0);
    expect(PromotionPeriod.prototype.getModifiedByAccountID.length).toBe(0);

    expect(PromotionPeriod.prototype.hasPromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.hasPromotionQualifier.length).toBe(1);
    expect(PromotionPeriod.prototype.setPromotion.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotion.length).toBe(1);
    expect(PromotionPeriod.prototype.addPromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.addPromotionQualifier.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionQualifier.length).toBe(1);

    expect(Object.getOwnPropertyNames(PromotionPeriod.prototype)).toHaveLength(29);
  });

  it('accepts a Date for the widened parameter, or nothing at all, and nothing looser', () => {
    const period = makePeriod();

    // The two supported forms: the explicit instant, and the legacy zero-argument call whose
    // answer comes from the injected clock. Both are part of the surface; only the first is
    // deterministic.
    expect(period.isCurrent(instant(NOW_UTC))).toBe(true);
    expect(period.isCurrent()).toBe(true);

    // The line ever STOPS being a type error, so the parameter cannot be loosened without breaking
    // the gate.
    // The `@ts-expect-error` IS the compile-time half of this assertion: `tsc --noEmit` fails if
    // @ts-expect-error - the widened parameter is a Date; an ISO-8601 string is deliberately rejected.
    expect(() => period.isCurrent(NOW_UTC)).toThrow(TypeError);
  });
});

// `startDateTime` and `endDateTime` are nullable, and the suite above establishes that an absent
// bound means FOREVER rather than the epoch.
//
// The cases below therefore PIN the bypass instead of repairing it.

describe('the nullable date bounds make the use-count bypass reachable, and it is pinned', () => {
  const PERIOD_ID = 'period-use-count';
  const ACCOUNT_ID = 'account-use-count';
  const START = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
  const END = new Date(Date.UTC(2024, 11, 31, 23, 59, 59));

  /**
   * How many parameters every one of these statements binds before any date bound.
   */
  const LEADING_BIND_COUNT = 4;

  it('binds null into the upper bound when a period has a start and no end', () => {
    // The exploit, exactly as demonstrated. The clause is emitted because `startDateTime` is set,
    // and the value bound into it is `endDateTime`, which is null.
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: PERIOD_ID,
      startDateTime: START,
      endDateTime: null,
    });

    expect(statement.sql).toContain('pa.createdDateTime < ?');
    expect(statement.params).toHaveLength(LEADING_BIND_COUNT + 2);
    expect(statement.params.slice(LEADING_BIND_COUNT)).toStrictEqual([START, null]);
    // A null in the LAST position is what makes the predicate UNKNOWN and the count zero.
    expect(statement.params[statement.params.length - 1]).toBeNull();
  });

  it('binds null for the account variant too, which is the second site the finding names', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: PERIOD_ID,
      startDateTime: START,
      endDateTime: null,
      accountID: ACCOUNT_ID,
    });

    expect(statement.sql).toContain('pa.createdDateTime < ?');
    expect(statement.params[statement.params.length - 1]).toBeNull();
  });

  it('omits the end filter entirely when the start is absent, even though an end is set', () => {
    // The opposite failure from the same line. With no start and a set end, the guard is false, so
    // the end filter is skipped and uses after the period closed still count.
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: PERIOD_ID,
      startDateTime: null,
      endDateTime: END,
    });

    expect(statement.sql).not.toContain('pa.createdDateTime < ?');
    expect(statement.sql).not.toContain('pa.createdDateTime > ?');
    expect(statement.params).toHaveLength(LEADING_BIND_COUNT);
    expect(statement.params).toContain(PERIOD_ID);
  });

  it('filters correctly when both bounds are set, so the defect is conditional and not total', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: PERIOD_ID,
      startDateTime: START,
      endDateTime: END,
    });

    expect(statement.sql).toContain('pa.createdDateTime > ?');
    expect(statement.sql).toContain('pa.createdDateTime < ?');
    expect(statement.params.slice(LEADING_BIND_COUNT)).toStrictEqual([START, END]);
  });

  it('emits neither bound when the period is open at both ends', () => {
    // The fourth combination, and the only one of the four that is unambiguously right: FOREVER in
    // both directions means no date filter at all.
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: PERIOD_ID,
      startDateTime: null,
      endDateTime: null,
    });

    expect(statement.params).toHaveLength(LEADING_BIND_COUNT);
    expect(statement.params).not.toContain(null);
  });

  it('reaches the bypass from an entity whose bounds this suite already pins as FOREVER', () => {
    // Closes the loop between the two layers.
    const period = makePeriod({
      promotionPeriodID: PERIOD_ID,
      startDateTime: START,
      endDateTime: undefined,
      maximumUseCount: 1,
    });

    expect(period.getEndDateTime()).toBeUndefined();
    expect(period.getMaximumUseCount()).toBe(1);

    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: PERIOD_ID,
      startDateTime: period.getStartDateTime() ?? null,
      endDateTime: period.getEndDateTime() ?? null,
    });
    expect(statement.params[statement.params.length - 1]).toBeNull();
  });
});
