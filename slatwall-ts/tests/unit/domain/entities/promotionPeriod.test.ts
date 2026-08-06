// --- promotionPeriod.test.ts - unit suite for src/domain/entities/promotionPeriod.ts -----
//
// COVERAGE CLASSIFICATION: NET-NEW. `PromotionPeriod` has no legacy antecedent. `meta/tests/` holds
// 32 components and only three touch the in-scope slice - meta/tests/unit/entity/BrandTest.cfc,
// meta/tests/unit/entity/ProductTest.cfc and meta/tests/functional/admin/entity/ProductTest.cfc,
// the last an EMPTY STUB - and none mentions a promotion period. Assertions pinning legacy
// behaviour therefore cite the CFML locator they were read from.
//
// `SwPromotionPeriod` is 163 lines of CFML that disagree with themselves three ways, and the
// disagreements decide whether a discount applies:
//   1. THREE PREDICATES, ONE QUESTION, THREE ANSWERS. isCurrent() [L78-L81], getCurrentFlag()
//      [L137-L146] and isExpired() [L83-L85] all ask "is this window open?"; at the single instant
//      `endDateTime === now` they answer false, true and false.
//   2. THE END BOUND IS EXCLUSIVE IN ONE AND INCLUSIVE IN THE OTHER. isCurrent tests `end > now`,
//      getCurrentFlag rejects only `end < now`, and the START bound is inclusive in both.
//   3. NULL BOUNDS ARE LEGITIMATE DATA ONE PREDICATE CANNOT EXPRESS. Both bounds carry
//      hb_nullRBKey="define.forever" [L53-L54]; getCurrentFlag honours that and isExpired guards
//      with isDate(), but isCurrent dereferences both bare and THROWS.
// Five of the six methods in the bidirectional window [L95-L132] are inoperable; the sixth is the
// control proving the pattern works when written properly.
//
// THE PROJECT'S ONLY ENTITY-LAYER SIGNATURE WIDENING LIVES HERE: isCurrent takes an explicit
// instant, so the UTC policy is visible at the call site and the predicate is deterministic. That
// budget is EXHAUSTED - a second entity-layer widening is forbidden project-wide - and every other
// member is asserted at LEGACY ARITY, including isExpired(), which takes no arguments and reads the
// injected clock, and the four inoperable helpers, which keep the parameter they never read. A
// describe at the foot of the file audits that mechanically.
//
// TWO LOCATOR CORRECTIONS, source over any secondary note. THE SHIPPED isCurrent PARAMETER IS
// OPTIONAL - `isCurrent(now?: Date)` - so the legacy zero-argument call form
// [model/entity/PromotionPeriod.cfc:L78] stays callable, and omitting it reads the INJECTED clock,
// which is a constructor collaborator rather than an ambient one. Both arities are asserted below:
// the argument form for determinism, and the defaulted form for parity. THE ROLLUP CALL SITE IS
// `model/entity/Promotion.cfc:L99`, NOT L98: L95 declares getCurrentPromotionPeriodFlag, L96 is the
// memo guard, L97 seeds false, L98 is the `for`, L99 is
// `if(getPromotionPeriods()[i].getCurrentFlag())`, L100 assigns true and L101 breaks - recorded in
// tests/fixtures/promotionFixtures.ts as periodPredicateContrast.livePredicateCallPath.
//
// SCOPE FENCES. No SQL and no use-COUNT assertion: model/dao/PromotionDAO.cfc:L134-L296 holds the
// four use-count queries - including the duplicated getStartDateTime() test at L177 and L244 where
// an END-date test is plainly intended - and all belong to tests/integration/; this entity supplies
// the two nullable CEILINGS and never counts uses. `Promotion`'s three memoized rollups belong to
// promotion.test.ts, so only their DIRECTION of consumption is asserted here, and
// promotionCode.test.ts owns PromotionCode. No zod: declarative validation is documented here and
// enforced at the service tier. The deliberate-divergence budget is ZERO and this file spends zero.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import type { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import { PROMOTION_USE_COUNT_STATEMENTS } from '../../../../src/repositories/mysql/sql/promotionUseCounts.sql.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// `Promotion` is imported as a VALUE, not `import type`, for one specific reason: the fixture graph
// cannot produce a promotion with an ABSENT name - `makePromotionFixtures` defaults `promotionName`
// to a non-empty string and `makePromotionVariant` always sets one - yet `getSimpleRepresentation`
// has a distinct, reachable throw path for exactly that state, because
// `Promotion.getPromotionName()` returns `string | undefined`. Constructing one minimal promotion
// directly makes that path testable without weakening a fixture other suites share.
// `PromotionQualifier` and `PromotionReward` remain type-only, their instances coming from the
// graph; all four live in `src/domain/**`, so the layer boundary holds either way.

// --- UTC instants -----
//
// Every business date here is an explicit UTC ISO-8601 literal. Three forms are deliberately gone:
//   `new Date()`      `new Date(0)`      `Date.now()`
// The epoch is a REAL INSTANT, so using it to mean "no bound" would convert the permissive FOREVER
// semantics of `hb_nullRBKey="define.forever"` into a restrictive 1970 cut-off. There are also NO
// fake timers - `tests/setup.ts` pins `process.env.TZ` to UTC with a self-verifying throw, and the
// clock this entity reads is INJECTED through its constructor, so freezing global time would hide
// the very injection this port exists to make explicit. The values mirror
// `tests/fixtures/promotionFixtures.ts` exactly, so a fixture-built period and a locally-built one
// are directly comparable.

/** The fixed "current" instant. Matches `NOW_UTC` in the fixture module. */
const NOW_UTC = '2024-06-15T12:00:00.000Z';

/** Two weeks before `NOW_UTC`, so the default window is open. */
const PERIOD_START_UTC = '2024-06-01T00:00:00.000Z';

/** Two weeks after `NOW_UTC`, likewise. */
const PERIOD_END_UTC = '2024-07-01T00:00:00.000Z';

/** A window that closed well before `NOW_UTC`. */
const EXPIRED_PERIOD_START_UTC = '2024-01-01T00:00:00.000Z';

/** ...and its end bound, also in the past. */
const EXPIRED_PERIOD_END_UTC = '2024-02-01T00:00:00.000Z';

/** A start bound strictly after `NOW_UTC`, for the not-yet-open window. */
const FUTURE_PERIOD_START_UTC = '2024-07-01T00:00:00.000Z';

/** ...and a matching future end bound, so the whole window is ahead of `now`. */
const FUTURE_PERIOD_END_UTC = '2024-08-01T00:00:00.000Z';

/** Audit-column instants. Distinct from the business bounds so a mix-up would show. */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * The two use ceilings the fixture module uses, restated so a locally-built period and a
 * fixture-built one agree. Plain counts, never money: `ormtype="integer"`
 * [model/entity/PromotionPeriod.cfc:L55-L56], so neither `Money` nor `decimal.js` appears in this
 * suite and no float arithmetic is performed on them.
 */
const PERIOD_MAXIMUM_USE_COUNT = 100;
const PERIOD_MAXIMUM_ACCOUNT_USE_COUNT = 5;

/**
 * A NON-empty primary key, so `isNew()` reads `false`. [model/entity/PromotionPeriod.cfc:L52]
 * declares `default=""`, so the id is always a string and the EMPTY one is the sentinel for
 * unsaved.
 */
const PERSISTED_PERIOD_ID = 'promotion-period-persisted';

/** The empty primary key [model/entity/PromotionPeriod.cfc:L52] - i.e. an unsaved row. */
const NEW_PERIOD_ID = '';

/** A second persisted key, for membership tests that must not collide with the first. */
const OTHER_PERIOD_ID = 'promotion-period-other';

/** The `promotionID` foreign-key column value [model/entity/PromotionPeriod.cfc:L59]. */
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
 * The injected clock, frozen at one instant. A FRESH `Date` is returned on every read, so a subject
 * cannot mutate the instant the clock reports and leak that into a later assertion.
 */
function fixedClock(at: Date): () => Date {
  return () => new Date(at.getTime());
}

/**
 * A clock that also records how many times it was read.
 *
 * Used once, by the `getCurrentFlag` describe, to pin that [model/entity/PromotionPeriod.cfc:L140]
 * reads `now()` TWICE within a single evaluation - asserted as a CORRECTNESS property and never as
 * a cost, because under the legacy AMBIENT clock those two reads can straddle an instant and judge
 * one period against two different "nows". The count is the evidence that the shape was reproduced
 * rather than tidied into a single read.
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
 * This is how memoization is proved without touching a `readonly` field. `getCurrentFlag`
 * [model/entity/PromotionPeriod.cfc:L137-L146] caches its answer; `isExpired`
 * [model/entity/PromotionPeriod.cfc:L83-L85] does not. Advancing the clock past the end bound after
 * the first `getCurrentFlag()` call therefore flips `isExpired()` while leaving `getCurrentFlag()`
 * on its cached answer - the memo becoming STALE, observed directly. Still not a fake timer:
 * nothing global is patched, and the moved instant reaches the entity only through the injected
 * clock.
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
 * init field breaks compilation here immediately. The graph type is reached the same way, because
 * `makePromotionFixtures` deliberately does not export its override or graph interfaces.
 */
type PeriodInit = ConstructorParameters<typeof PromotionPeriod>[0];
type PeriodOverrides = Partial<PeriodInit>;
type PromotionFixtures = ReturnType<typeof makePromotionFixtures>;

/**
 * Build a `PromotionPeriod` from a defaulted base, overridable per test.
 *
 * `{ ...base, ...overrides }` is deliberate: an EXPLICITLY passed `undefined` survives the spread
 * and overrides the default, which is how a test says "this bound is ABSENT" rather than
 * "unspecified, use the default". Under `exactOptionalPropertyTypes` those are distinct types.
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
 * A fresh fixture graph, one per test and never hoisted to module scope. `makePromotionFixtures`
 * builds a brand-new object tree on every call, which matters because two describes below
 * deliberately MUTATE the live `promotionPeriods` array a `Promotion` exposes.
 */
function freshFixtures(): PromotionFixtures {
  return makePromotionFixtures();
}

/**
 * A real `PromotionReward` from the fixture graph.
 *
 * Hand-written doubles are preferred over `vi.mock`, but the four inoperable helpers need no double
 * at all: they throw before touching their argument, so what matters is only that a genuinely-typed
 * child instance is supplied - proving the throw is unconditional rather than an artefact of a
 * malformed stub. `merchandiseReward` is a single instance, so no index narrowing is required.
 */
function rewardFrom(fixtures: PromotionFixtures): PromotionReward {
  return fixtures.merchandiseReward;
}

/** A real `PromotionQualifier` from the fixture graph, for the same reason. */
function qualifierFrom(fixtures: PromotionFixtures): PromotionQualifier {
  return fixtures.promotionQualifier;
}

/**
 * The graph's `Promotion`, with its applied-promotion collection emptied so it reports deletable.
 *
 * `tests/fixtures/promotionFixtures.ts` pushes one `PromotionApplied` into the promotion, and
 * `Promotion.isDeletable()` [model/entity/Promotion.cfc:L170-L172] is
 *   `appliedPromotions.length === 0`
 * so the stock graph promotion is NOT deletable. Emptying the collection in place is legitimate
 * rather than a workaround: `getAppliedPromotions()` returns the LIVE array by contract, and the
 * graph is rebuilt per test, so the mutation cannot escape the test that made it.
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
 * Needed to isolate the rollup direction: the stock graph already wires one CURRENT period in, so a
 * rollup asserted against it would read `true` whichever predicate the rollup consults. Narrowing
 * to a single hand-built period is what makes the answer attributable.
 */
function replacePeriodsWith(promotion: Promotion, periods: readonly PromotionPeriod[]): void {
  const collection = promotion.getPromotionPeriods();

  collection.splice(0, collection.length, ...periods);
}

afterEach(() => {
  // `tests/setup.ts` already restores mocks and real timers after every test. This local hook makes
  // the A2 freshness guarantee local and visible even though this suite installs no timer, so a
  // future assertion that DOES spy cannot silently inherit cleanup from a file it never reads.
  vi.restoreAllMocks();
});

// --- B1a. isCurrent(now): start INCLUSIVE, end EXCLUSIVE -----

// CFML parity [model/entity/PromotionPeriod.cfc:L78-L81]: start is INCLUSIVE (L80 uses `<=`) and
// end is EXCLUSIVE (L80 uses `>`). The legacy body captures `now()` ONCE into `currentDateTime` at
// L79 and compares both bounds against that one value, so the two comparisons can never straddle an
// instant; passing the instant in preserves that single-capture property by construction.
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
    // The agreement check against the argument form. Pinned far past the window, the supplied
    // instant is the only thing that decides the answer, while the clock-reading predicates answer
    // from the clock - so a call that passes an instant cannot be influenced by the container's
    // notion of now. That is the determinism AAP 0.4.2 asks the widening to buy.
    const clockWellPastTheWindow = fixedClock(instant('2025-01-01T00:00:00.000Z'));
    const period = makePeriod({ now: clockWellPastTheWindow });

    expect(period.isCurrent(instant(NOW_UTC))).toBe(true);
    expect(period.isExpired()).toBe(true);

    expect(period.isCurrent(instant('2025-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('★★ answers from the INJECTED clock when the instant is omitted, which is the legacy call form', () => {
    // The other arity, and the reason the parameter is optional: [model/entity/PromotionPeriod.cfc:L78]
    // declares `isCurrent()` with no arguments, so the zero-argument form has to remain callable for
    // the ported surface to be diffable against the source method for method.
    //
    // ★ WHAT IT READS IS THE POINT. The default is `this.now()`, the clock handed to the constructor
    // - NOT `Date.now()`, not a module-level clock and not a request scope reached through an
    // accessor. Two periods differing only in their injected clock therefore answer differently,
    // which is what proves the collaborator is the source and no ambient state leaked in.
    const insideTheWindow = makePeriod({ now: fixedClock(instant(NOW_UTC)) });
    const afterTheWindow = makePeriod({ now: fixedClock(instant('2025-01-01T00:00:00.000Z')) });

    expect(insideTheWindow.isCurrent()).toBe(true);
    expect(afterTheWindow.isCurrent()).toBe(false);

    // And the two arities agree when handed the same instant, so the default is a default rather
    // than a second implementation.
    expect(insideTheWindow.isCurrent()).toBe(insideTheWindow.isCurrent(instant(NOW_UTC)));
  });

  it('reads the injected clock ONCE on the defaulted path, as the legacy local capture did', () => {
    // CFML parity [model/entity/PromotionPeriod.cfc:L79]: `var currentDateTime = now();` captures the
    // instant once and both comparisons on L80 read that local. The defaulted path must not read the
    // clock twice, or a period could be observed as started-but-already-ended across a tick.
    // Contrast `getCurrentFlag()` [L140], which really does read twice and is asserted to.
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
    // are the SAME instant. CFML comparison depends on the server timezone; this port runs every
    // comparison on `Date.prototype.getTime()`.
    const period = makePeriod({
      startDateTime: instant(NOW_UTC),
      endDateTime: instant(PERIOD_END_UTC),
    });
    const sameInstantOtherOffset = instant('2024-06-15T14:00:00.000+02:00');

    expect(sameInstantOtherOffset.getTime()).toBe(instant(NOW_UTC).getTime());
    expect(period.isCurrent(sameInstantOtherOffset)).toBe(true);
  });
});

// --- B1b. D32: isCurrent is UNGUARDED and throws on an open-ended period -----

// LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L78-L81]: isCurrent dereferences
// getStartDateTime()/getEndDateTime() at L80 with no isNull guard, so an open-ended period - which
// hb_nullRBKey="define.forever" at L53/L54 declares to be valid data - makes the predicate THROW.
// getCurrentFlag (L140) and isExpired (L84) both guard; this one does not.
//
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

// --- B1c. getCurrentFlag(): memoized, null-PERMISSIVE, end-INCLUSIVE -----

// CFML parity [model/entity/PromotionPeriod.cfc:L137-L146]: getCurrentFlag SEEDS `true` at L139 and
// only ever NARROWS to `false` at L141. Its L140 test is null-PERMISSIVE - each bound is examined
// only when present - and it rejects the end bound solely on `end < now()`, which makes the end
// instant INCLUSIVE here and exclusive in isCurrent. The memo at L138 is reproduced for BEHAVIOURAL
// FIDELITY, not as an optimisation: the answer is computed once and thereafter goes STALE.
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
    // computed on first read, and `isExpired` is NOT memoized, so the two diverge as soon as the
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
    // BOTH arms. Asserted as a CORRECTNESS property - under an ambient clock those two reads can
    // land on different instants inside one boolean expression, so a period could be judged against
    // two different "nows" at once.
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

// --- B1d. isExpired(): zero-argument, guarded, END bound only -----

// CFML parity [model/entity/PromotionPeriod.cfc:L83-L85]: isExpired takes NO arguments, guards with
// isDate(getEndDateTime()), and examines the END bound ONLY. A window that has not opened yet is
// therefore NOT expired - "expired" and "not current" are different questions, and this is the
// method that proves it.
describe('isExpired examines the end bound only, and keeps its legacy zero arity', () => {
  it('takes no parameters, so the one authorized widening was not spent twice', () => {
    expect(PromotionPeriod.prototype.isExpired.length).toBe(0);

    // `isCurrent` still reports ONE parameter, and that is worth pinning rather than glossing:
    // TypeScript's `now?: Date` emits a plain positional parameter with no initializer, so the
    // declared arity is 1 while a zero-argument call is legal and reads the injected clock. Both
    // halves are asserted - the count here, the omitted-argument behaviour in the isCurrent suite
    // above - because the pair is what makes the widening real AND the legacy call form callable.
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

// --- B2. D31: the exact endDateTime === now instant, where the predicates disagree -----

// LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L80, L84, L140]: at the exact instant endDateTime
// === now, isCurrent() returns false (end exclusive) while getCurrentFlag() returns true (end
// inclusive) and isExpired() returns false - the period is simultaneously "not current" by the
// direct predicate, "current" by the memoized flag, and "not expired".
//
// Preserved deliberately; do not fix without a product decision.
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

// --- B2b. Direction of consumption: the rollup reads the INCLUSIVE answer -----

// CFML parity [model/entity/Promotion.cfc:L95-L107]: getCurrentPromotionPeriodFlag calls
// `.getCurrentFlag()` at L99 - NOT `.isCurrent()` - and breaks on the first match at L101. So the
// END-INCLUSIVE semantic is the one that reaches the promotion rollup, and the widened isCurrent()
// is DEAD in the legacy rollup: a repository-wide search finds no caller other than its own
// declaration, and it is retained purely for interface parity. That is also why the missing null
// guard at L80 never surfaced in production. Only the DIRECTION of consumption is asserted here.
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
    // (`hb_nullRBKey="define.forever"`), the rollup handles it and answers true, and a rollup wired
    // to isCurrent() would have raised instead.
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

// --- B2c. The nine authoritative date-bounds rows, driven from the fixture table -----

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

// --- B3. The bidirectional window [L95-L132]: five inoperable members and one control -----

// The four one-to-many helpers call `setPromotion` / `removePromotion` on their children, and
// NEITHER child declares either method: `grep -c "setPromotion("` returns 0 in
// model/entity/PromotionReward.cfc and model/entity/PromotionQualifier.cfc, which declare only
// setPromotionPeriod (PromotionReward.cfc:L140, PromotionQualifier.cfc:L122) and
// removePromotionPeriod (L146, L128); the same census over promotionReward.ts and
// promotionQualifier.ts also returns 0. That ABSENCE is what makes all four methods throw.
//
// In CFML the failure arrives through the onMissingMethod dispatcher at
// [org/Hibachi/HibachiEntity.cfc:L507-L565]. Every pattern it matches is `has*`- or
// `get*`-prefixed, so `set*` and `remove*` fall through to the terminal throw at L565. The EAV
// fallback at L559 cannot catch them either: it needs an `attributeValues` property, and only four
// in-scope entities declare one (Sku.cfc:L70, Product.cfc:L75, ProductType.cfc:L67, Brand.cfc:L60),
// which puts PromotionPeriod among the FOURTEEN throwing entities rather than the four silent ones.
// The target reproduces the OBSERVABLE outcome with NO dynamic dispatch: no Proxy, no index
// signature, no string-keyed method table, no `evaluate`.
describe('addPromotionReward is inoperable', () => {
  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L116-L118]: addPromotionReward calls
  // promotionReward.setPromotion(this) at L117, but PromotionReward declares only
  // setPromotionPeriod - the call target does not exist, so this method throws at runtime.
  //
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
  //
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
  //
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
  // declares lowercase `promotionQualifier`. CFML argument names are case-insensitive so that
  // resolves harmlessly, but PromotionQualifier declares only removePromotionPeriod, so the call
  // target does not exist and this method throws at runtime.
  //
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
    // C4: only `isCurrent` was widened. All four inoperable helpers keep exactly one parameter even
    // though none ever reads it - which is also why `noUnusedParameters` is deliberately left unset
    // in tsconfig.json rather than the signatures being trimmed to satisfy it.
    expect(PromotionPeriod.prototype.addPromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.addPromotionQualifier.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionQualifier.length).toBe(1);
  });

  it('declares all four as void-returning, not never-returning', () => {
    // The shipped signatures return `void`, matching the legacy `public void function` declarations
    // at L116, L120, L125 and L128. Typing them `never` would advertise the defect in the type
    // system, and is deliberately NOT done: the CFC promises void, so the port promises void.
    const fixtures = freshFixtures();
    const period = makePeriod();
    const reward = rewardFrom(fixtures);

    const call: () => void = () => {
      period.addPromotionReward(reward);
    };

    expect(call).toThrow();
  });
});

// --- B3b. removePromotion: the REACHABLE arguments.account leak -----

// LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L104-L113]: removePromotion resolves the index
// from arguments.promotion at L108 but deletes from arguments.account at L110 - a leaked identifier
// from a copy-pasted sibling. The leak is REACHABLE, so the found path throws and the structDelete
// at L112 (syntactically unconditional) is never reached; only the not-found path clears the
// association. Contrast PromotionAccount.cfc:L103, where the equivalent stray is MASKED.
//
// Preserved deliberately; do not fix without a product decision.
//
// Why MASKED there and reachable here: `grep -in "promotionAccount" model/entity/Promotion.cfc`
// returns NOTHING, so PromotionAccount.cfc:L101 raises on
// `arguments.promotion.getPromotionAccounts()` BEFORE its L103 stray is evaluated. Here L108
// succeeds against the `promotionPeriods` collection that Promotion.cfc:L62 genuinely declares, so
// execution does reach L110. Same typo, opposite reachability.
//
// JUDGMENT CALL: the two languages disagree about the "not found" sentinel, which makes this the
// single most likely mistranslation in the method:
//   CFML   arrayFind returns 0 when absent, so L109 guards with   `index > 0`
//   TS     `Array.prototype.findIndex` returns -1 when absent, 0 for a real FIRST element,
//          so the guard is   `index !== -1`
// Writing `if (index > 0)` against a findIndex result would silently skip a match at position 0.
// The two tests below pin BOTH sides of that boundary.
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
    // promotion, so the association is un-removed on BOTH sides.
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
    // index is 0 - legitimate in TypeScript, "not found" under CFML's 1-based `arrayFind`. If this
    // stops throwing, the guard has been mistranslated to `index > 0`.
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
    // distinct object carrying the SAME promotionPeriodID is treated as a member and lands on the
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
  // `variables.promotion`, and L108 then calls getPromotionPeriods() on the result UNCONDITIONALLY.
  // With no argument and no near-side field there is nothing to call it on, so CFML raises a
  // null-reference error before any index guard runs. Reproduced as a throw.
  it('throws when called with no argument on a period that has no promotion', () => {
    const period = makePeriod({ promotion: undefined });

    expect(period.getPromotion()).toBeUndefined();
    expect(() => period.removePromotion()).toThrow('cannot resolve a promotion');
  });

  it('keeps its single OPTIONAL parameter, matching the legacy `any promotion` declaration', () => {
    // L104 declares `removePromotion(any promotion)` WITHOUT `required`, which is what makes the
    // L105-L107 defaulting block reachable; L98's `setPromotion` declares `required any promotion`
    // and has no such block, so the shipped signature is `removePromotion(promotion?: Promotion)`.
    // Both still report a `Function.length` of 1, because `length` excludes only DEFAULTED and rest
    // parameters, not optional ones - so arity cannot distinguish the two, and the observable
    // difference is the no-argument call asserted above.
    expect(PromotionPeriod.prototype.removePromotion.length).toBe(1);
    expect(PromotionPeriod.prototype.setPromotion.length).toBe(1);
  });
});

// --- B3c. setPromotion: the CONTROL. This one works -----

// CFML parity [model/entity/PromotionPeriod.cfc:L98-L103]: setPromotion is the one member of the
// bidirectional window that is SOUND, and it is deliberately unmarked so the defect register stays
// honest. It works because L101 appends to `arguments.promotion.getPromotionPeriods()` - the
// collection model/entity/Promotion.cfc:L62 genuinely declares - rather than a leaked identifier.
//
// AND THIS IS WHERE `Promotion`'s GUARD ACTUALLY LIVES, at L100: Promotion.cfc's bidirectional
// helpers are pure far-side delegations with no near-side guard of their own. Two consequences:
//   * `Promotion.addPromotionPeriod` inherits this file's idempotency, because it delegates
//     into it.
//   * `Promotion.removePromotionPeriod` [model/entity/Promotion.cfc:L144-L146] throws
//     TRANSITIVELY through the L110 leak above, its whole body being
//       `arguments.PromotionPeriod.removePromotion( this )`
//     CITED here, deliberately NOT re-asserted: that is `promotion.test.ts`'s assertion.
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
    // CFML parity [model/entity/PromotionPeriod.cfc:L100]: the guard is
    //   isNew() or !arguments.promotion.hasPromotionPeriod( this )
    // and the FIRST arm tests THIS instance's newness, so for an unsaved period the guard is always
    // true and calling setPromotion twice appends twice. Pinned as shipped behaviour.
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
    // TWO independent mechanisms protect this case, and only one is legacy. The LEGACY mechanism is
    // L100's `isNew() or` short-circuit, which appends without consulting the far side at all when
    // this instance is unsaved. The PORT adds a second, narrower safeguard inside
    // `Promotion.hasPromotionPeriod`: when the candidate's primary key is the empty string it falls
    // back to OBJECT IDENTITY rather than comparing keys, because a pure key comparison would
    // report two different unsaved rows as the same row. Both are asserted.
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
    // THE SHARPEST ISOLATION OF THE L100 GUARD. After the first append the identity fallback
    // reports the SAME unsaved instance as present, so the second arm, `!hasPromotionPeriod(this)`,
    // would be false and would suppress the append. It appends anyway, which can only happen
    // because `isNew()` short-circuits the `or` and the far side is never consulted.
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

// --- B4. isDeletable() and getSimpleRepresentation() reach through the promotion unguarded -----

// CFML parity [model/entity/PromotionPeriod.cfc:L87-L89]: the declaration carries a STRAY SPACE -
// `public boolean function isDeletable ()` - annotated rather than normalised, and the body is
// `!isExpired() && getPromotion().isDeletable()`. The `&&` SHORT-CIRCUITS, which is behaviourally
// load-bearing: an EXPIRED period answers `false` without ever touching the promotion, so the
// unguarded reach-through is reachable only on the not-expired path.
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
    //   `arrayLen( getAppliedPromotions() ) == 0`
    // PERMISSIVE on an empty collection. That assertion belongs to `promotion.test.ts`; asserted
    // here is only that this entity DELEGATES to it, proved by flipping the far side.
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
//
// THE INHERITED `simple_representation_exists_and_is_simple` ASSERTION IS DELIBERATELY NOT FORCED.
// `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58` asserts
// `isSimpleValue(variables.entity.getSimpleRepresentation())` for every entity extending the base,
// and a BARE new PromotionPeriod cannot satisfy it. Forcing it would assert the FIXTURE rather than
// the entity and hide the very reach-through this describe documents, so the precondition is stated
// and both outcomes are asserted separately.
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
    // [model/entity/PromotionPeriod.cfc:L91] declares `returntype="string"` - so CFML raises on the
    // return-type coercion rather than yielding an empty string.
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

// --- B5. The absence conventions: `undefined` means UNLIMITED and FOREVER -----

// CFML parity [model/entity/PromotionPeriod.cfc:L55-L56]: maximumUseCount and
// maximumAccountUseCount are notnull="false" with hb_nullRBKey="define.unlimited" - undefined means
// UNLIMITED, not zero, and substituting 0 would forbid every use.
//
// CFML parity [model/entity/PromotionPeriod.cfc:L53-L54]: startDateTime and endDateTime carry
// hb_nullRBKey="define.forever" - undefined means FOREVER, not the epoch, and a zero-millisecond
// Date would convert an unbounded window into one that closed in 1970.
//
// This is the THIRD of three opposite absence conventions in this port, and the only one written
// into ORM metadata rather than inferred from behaviour. The other two are sibling-owned and CITED
// here, never re-tested:
//   Sku.getPriceByCurrencyCode() must be undefined and never 0, because
//   [model/entity/Sku.cfc:L269-L273] has no else and no fallback and a 0 would sell products free.
//   Product.getSalePrice() must be 0 and never undefined, because [model/entity/Product.cfc:L598]
//   is a bare statement with no `return`, so execution falls through to `return 0`.
// Three conventions, three polarities, none interchangeable.
describe('absent use ceilings mean UNLIMITED and are never coerced to zero', () => {
  it('reports undefined - not 0 - when neither ceiling is persisted', () => {
    const period = makePeriod({ maximumUseCount: undefined, maximumAccountUseCount: undefined });

    expect(period.getMaximumUseCount()).toBeUndefined();
    expect(period.getMaximumAccountUseCount()).toBeUndefined();
    expect(period.getMaximumUseCount()).not.toBe(0);
    expect(period.getMaximumAccountUseCount()).not.toBe(0);
  });

  it('keeps a persisted ZERO distinct from an absent ceiling', () => {
    // The two states are NOT interchangeable, and the engine reads them differently: the promotion
    // engine pairs `!isNull(...)` with a `gt 0` test, so 0 and undefined both mean "no ceiling" TO
    // THAT CALLER while remaining different values HERE.
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

// --- B6. The declarative validation schema, honoured EXACTLY as written -----

// `model/validation/PromotionPeriod.json`, verbatim - the WHOLE file:
//
//   "conditions": { "needsEndAfterStart": { "startDateTime": {"required":true},
//                                          "endDateTime":   {"required":true} } }
//   "startDateTime": [{"contexts":"save","dataType":"date"}]
//   "endDateTime":   [{"contexts":"save","dataType":"date"},
//                     {"contexts":"save","conditions":"needsEndAfterStart",
//                      "gtProperty":"startDateTime"}]
//
// THAT IS THE ENTIRE INVENTORY: two properties, one condition, three rules. `maximumUseCount` and
// `maximumAccountUseCount` are NOT VALIDATED AT ALL, and there is NO delete gate on
// `promotionRewards` or `promotionQualifiers` - contrast `model/validation/PromotionCode.json`,
// whose `"orders": [{"contexts":"delete","maxCollection":0}]` is exactly such a gate. Nothing is
// invented here to fill either gap.
//
// The identically-named `needsEndAfterStart` condition also appears in
// `model/validation/PromotionCode.json`, with the same two required properties and the same
// `gtProperty` comparison. NOTED and deliberately NOT factored into a shared helper: one exported
// unit per file, no barrels, and `promotionCode.test.ts` owns its own copy.
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
    // has no equivalent rule on either owned collection, so deletability depends only on expiry and
    // the promotion, exactly as L88 says.
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
    // That is what `needsEndAfterStart` encodes: the condition requires BOTH properties, so when
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

// --- B7. Structural facts, and what the framework base deliberately did NOT contribute -----

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
    // [model/entity/PromotionPeriod.cfc:L59] is `fetch="join"` - one of only FOUR eager sites in
    // the in-scope entity set, alongside Product.cfc:L68 `brand`, L69 `productType` and L70
    // `defaultSku`. In the target that distinction DISAPPEARS: every association is materialized at
    // the repository boundary, an explicit query decision rather than an implicit lazy load. So
    // this getter is a plain synchronous read - not a promise, not a proxy, not a loader.
    const fixtures = freshFixtures();
    const period = makePeriod({ promotion: fixtures.promotion });
    const association = period.getPromotion();

    expect(association).toBe(fixtures.promotion);
    expect(association).toBeInstanceOf(Promotion);
    expect(association).not.toHaveProperty('then');
  });

  it('keeps the promotionID column readable even when the association was not fetched', () => {
    // The FK column is held alongside the association, so the key survives a repository choosing
    // not to materialize the far side. The legacy `get*ID` dispatch returned the EMPTY STRING
    // there; the target returns the column, and `undefined` when there is no column.
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
    // association and mutates the parent's array in place from `setPromotionPeriod`. A defensive
    // copy here would make every child-side append invisible.
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
    // The strongest single structural assertion available. It proves the CFC's members were carried
    // over verbatim in legacy camelCase, and that NOTHING was invented: no `getNewFlag`, no
    // `getPrintTemplates`/`getEmailTemplates`, no `clearAttributeCache`, no smart list, no
    // inherited framework memo, no rbKey resolver, no permission accessor.
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
    // [model/entity/PromotionPeriod.cfc:L158-L160] is an EMPTY banner pair - START and END comments
    // with nothing between them. Contrast the entities that DO carry hooks and disagree about
    // ordering: PriceGroup.cfc:L206-L214 and ProductType.cfc:L305-L313 maintain their materialized
    // path BEFORE calling super, while Category.cfc:L126-L134 calls super FIRST. An empty banner is
    // never normalised into a hook.
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype);

    expect(surface).not.toContain('preInsert');
    expect(surface).not.toContain('preUpdate');
    expect(surface).not.toContain('postInsert');
    expect(surface).not.toContain('postUpdate');
    expect(surface).not.toContain('postDelete');
  });

  it('implements no dynamic dispatch and no attribute-value fallback', () => {
    // PromotionPeriod declares no `attributeValues`, so in CFML an unknown `getX()` reaches the
    // terminal throw at [org/Hibachi/HibachiEntity.cfc:L565] rather than the EAV fallback at L559.
    // DOCUMENTED, not reproduced: the target has no dynamic dispatch at all, so an undeclared
    // member is simply absent - which the surface assertion above already proves.
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype);

    expect(surface).not.toContain('getAttributeValue');
    expect(surface).not.toContain('onMissingMethod');
    expect(surface).not.toContain('setAttributeValue');
  });

  it('exposes no validation, error, or population surface', () => {
    // The framework base contributed `validate`, `hasErrors`, `getErrors` and a populate pipeline.
    // None is ported: validation is a service-tier concern, and in particular the raw
    // `writeDump(getErrors())` debug output at [org/Hibachi/HibachiEntity.cfc:L605] is deliberately
    // NOT carried over - a port that dumps entity state to the response stream is a defect itself.
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype);

    expect(surface).not.toContain('validate');
    expect(surface).not.toContain('hasErrors');
    expect(surface).not.toContain('getErrors');
    expect(surface).not.toContain('populate');
  });

  it('injects no collaborator port - only the plain clock', () => {
    // `grep -c 'getService('` over all 163 lines of the CFC returns ZERO. The verified census
    // across the eighteen in-scope entities is 45 sites in total - Product 18, Sku 19, ProductType
    // 6, OptionGroup 1, RoundingRule 1, every other entity 0. So the constructor takes NO port: the
    // clock arrives as the PLAIN parameter
    //   `now: () => Date`
    // and is not a fourteenth port, leaving the ledger at 13. Every method here is SYNCHRONOUS.
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

// --- A2. Request-scoped state: the `currentFlag` memo never leaves its instance -----

// [model/entity/PromotionPeriod.cfc:L75] declares `currentFlag` as `persistent="false"`, and
// [L137-L146] memoizes it in `variables`. On a warm Lambda container a memo held at MODULE scope
// would persist between unrelated invocations and let one request's answer decide another's. The
// target keeps it as INSTANCE state and the repository tier keeps instances request-scoped.
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

// --- The widening audit, asserted mechanically rather than promised in prose -----

describe('exactly one entity-layer signature widening was spent, and no second one', () => {
  it('gives isCurrent the single extra instant parameter and leaves every sibling at legacy arity', () => {
    // C4, made checkable. `isCurrent` is the ONE method in `src/domain/entities/**` permitted to
    // depart from its legacy arity, and every other member below is listed with the arity its CFC
    // declaration implies, so a second widening anywhere fails here.
    //
    // JUDGMENT CALL: every assertion below reads `.length` DIRECTLY off the method rather than
    // passing the method to `expect(...)` and matching with `toHaveLength`. Both check the same
    // number, but the second lets an unbound method reference escape as a value - which
    // `@typescript-eslint/unbound-method` correctly rejects, since an unbound method can later be
    // invoked with the wrong `this`. Reading the property immediately means no function value
    // escapes, so the audit needs no `.bind()`, no cast and no inline suppression. Do not
    // "simplify" these to `expect(PromotionPeriod.prototype.x).toHaveLength(n)`; that form fails
    // lint.
    //
    // THE WIDENING. [model/entity/PromotionPeriod.cfc:L78] declares `isCurrent()` with NO
    // parameters; the target ACCEPTS one instant, OPTIONALLY, so a caller that wants determinism can
    // pin it while the legacy zero-argument call form stays callable. This is the only `1` below
    // with no legacy counterpart.
    //
    // `.length` IS 1 EVEN THOUGH THE PARAMETER IS OPTIONAL, and that is a property of the emit
    // rather than an inconsistency: `now?: Date` compiles to a plain positional parameter with no
    // initializer, so the declared arity is 1 while `period.isCurrent()` is still legal. A default
    // VALUE - `now = someDate` - would have reported 0 and hidden the widening from this audit,
    // which is one reason the defaulting is written as `now ?? this.now()` inside the body instead.
    expect(PromotionPeriod.prototype.isCurrent.length).toBe(1);

    // Legacy zero-argument members, every one unchanged. Each is referenced DIRECTLY rather than by
    // string key, so a renamed or deleted member is a compile error here rather than a
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

    // The two supported forms: the explicit instant, and the legacy zero-argument call whose answer
    // comes from the injected clock. Both are part of the surface; only the first is deterministic.
    expect(period.isCurrent(instant(NOW_UTC))).toBe(true);
    expect(period.isCurrent()).toBe(true);

    // The `@ts-expect-error` IS the compile-time half of this assertion: `tsc --noEmit` fails if
    // the line ever STOPS being a type error, so the parameter cannot be loosened without breaking
    // the gate. The runtime half records what such a call would do - dereference `.getTime()` on a
    // string and raise - rather than quietly comparing NaN.
    // @ts-expect-error - the widened parameter is a Date; an ISO-8601 string is deliberately rejected.
    expect(() => period.isCurrent(NOW_UTC)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// S-02: THE USE-LIMIT BYPASS THIS ENTITY'S NULLABLE BOUNDS MAKE REACHABLE
//
// `startDateTime` and `endDateTime` are nullable, and the suite above establishes
// that an absent bound means FOREVER rather than the epoch. That is correct, and it
// is also the precondition for a defect one layer down.
//
// `src/repositories/mysql/sql/promotionUseCounts.sql.ts` reproduces
// [model/dao/PromotionDAO.cfc:L177] and [L244], where BOTH date guards test
// `getStartDateTime()` while the second one BINDS `getEndDateTime()`. So a period
// with a start date and no end date - the ordinary shape of an open-ended promotion,
// which this entity permits by design - appends `pa.createdDateTime < ?` and binds
// `null`. SQL evaluates that predicate as UNKNOWN, no row matches, the use count
// comes back zero, and a maximum-use limit that should have bound never does.
//
// A security review raised this as finding S-02 (MAJOR, CWE-20 Improper Input
// Validation, CWE-840 Business Logic Errors) and asked that the upper clause be
// gated on `endDateTime !== null`. THE CHANGE IS DECLINED: AAP 0.4.1 specifies the
// SQL module as preserving "the duplicated `getStartDateTime()` test defect at L177
// and L244", and AAP 0.8.1 names use-limit enforcement as must-preserve behaviour -
// so omitting the clause would change which promotions qualify relative to the
// system being migrated. AAP 0.9.3 makes the inverse a failing gate.
//
// The cases below therefore PIN the bypass instead of repairing it. They live in
// this suite rather than beside the SQL because this entity is where the four
// bound combinations are defined and where a reader meets them first; the promotion
// engine's own characterization suites under `tests/unit/services/promotion/` are
// separately assigned and this clone carries none of them, so leaving the
// demonstrated exploit unpinned was the only other option.
// ---------------------------------------------------------------------------

describe('the nullable date bounds make the use-count bypass reachable, and it is pinned', () => {
  const PERIOD_ID = 'period-use-count';
  const ACCOUNT_ID = 'account-use-count';
  const START = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
  const END = new Date(Date.UTC(2024, 11, 31, 23, 59, 59));

  /**
   * How many parameters every one of these statements binds before any date bound.
   *
   * Three order-status literals plus the promotion identifier. Named rather than
   * inlined, and the DATE TAIL is what each case below asserts on: pinning the
   * status literals here would duplicate an assertion that belongs to the SQL
   * module's own suite, and would make these cases fail for a reason that has
   * nothing to do with the bypass they exist to pin.
   */
  const LEADING_BIND_COUNT = 4;

  it('binds null into the upper bound when a period has a start and no end', () => {
    // ★ THE EXPLOIT, EXACTLY AS DEMONSTRATED. The clause is emitted because
    // `startDateTime` is set, and the value bound into it is `endDateTime`, which is
    // null. Both halves are asserted, because either one alone would be innocuous.
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: PERIOD_ID,
      startDateTime: START,
      endDateTime: null,
    });

    expect(statement.sql).toContain('pa.createdDateTime < ?');
    expect(statement.params).toHaveLength(LEADING_BIND_COUNT + 2);
    expect(statement.params.slice(LEADING_BIND_COUNT)).toStrictEqual([START, null]);
    // A null in the LAST position is what makes the predicate UNKNOWN and the count
    // zero. Asserted positionally as well as by value, so a future reordering that
    // happened to move the null somewhere harmless would not silently pass.
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
    // THE OPPOSITE FAILURE FROM THE SAME LINE. With no start and a set end, the guard
    // is false, so the end filter is skipped and uses AFTER the period closed still
    // count. The single wrong condition produces two different wrong answers, which is
    // why both are pinned.
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
    // The fourth combination, and the only one of the four that is unambiguously
    // right: FOREVER in both directions means no date filter at all.
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: PERIOD_ID,
      startDateTime: null,
      endDateTime: null,
    });

    expect(statement.params).toHaveLength(LEADING_BIND_COUNT);
    expect(statement.params).not.toContain(null);
  });

  it('reaches the bypass from an entity whose bounds this suite already pins as FOREVER', () => {
    // CLOSES THE LOOP BETWEEN THE TWO LAYERS. The shape driving the exploit is not
    // hypothetical data: it is what this entity returns for an open-ended period, so
    // the builder is fed from the entity rather than from hand-written literals.
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

    // A period with a maximum use count of ONE, whose count query can only ever
    // return zero. Pinned, cited, and not repaired here.
    expect(statement.params[statement.params.length - 1]).toBeNull();
  });
});
