// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/promotionPeriod.ts`
//
// *** COVERAGE CLASSIFICATION: NET-NEW. ***
//
// `PromotionPeriod` has NO legacy antecedent of any kind. `meta/tests/` contains 32 test
// components, and exactly three touch the in-scope slice: `meta/tests/unit/entity/BrandTest.cfc`,
// `meta/tests/unit/entity/ProductTest.cfc`, and `meta/tests/functional/admin/entity/ProductTest.cfc`
// - the last of which is an EMPTY STUB contributing zero coverage. None of the three mentions a
// promotion period. There is no `PromotionPeriodTest.cfc`, and `meta/tests/unit/service/` holds only
// AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest, none in
// scope. Every assertion below is therefore NEW, and NONE of it may be presented as parity with a
// legacy suite. Where an assertion pins legacy BEHAVIOUR it cites the CFML locator it was read
// from; that is traceability to the SOURCE, which is not the same thing as traceability to a
// legacy TEST, and the two are deliberately not blurred.
//
// WHAT THIS SUITE PINS, AND WHY IT IS THE SHARPEST ENTITY SUITE IN THE FOLDER
//
// `SwPromotionPeriod` is one bounded, use-limited window during which a promotion's rewards may
// apply. It is 163 lines of CFML that manage to disagree with themselves three separate ways, and
// the disagreements are not cosmetic - they decide whether a discount applies:
//
//   1. THREE PREDICATES, ONE QUESTION, THREE ANSWERS. `isCurrent()` [L78-L81],
//      `getCurrentFlag()` [L137-L146] and `isExpired()` [L83-L85] all ask some form of "is this
//      window open?" and they are NOT three spellings of one idea. At the single instant
//      `endDateTime === now` they return false, true and false respectively. Each gets its own
//      `describe` below, and then a dedicated test asserts their DISAGREEMENT.
//   2. THE END BOUND IS EXCLUSIVE IN ONE AND INCLUSIVE IN THE OTHER. `isCurrent` tests
//      `end > now`; `getCurrentFlag` rejects only `end < now`. The START bound, by contrast, is
//      inclusive in both - which is precisely what makes the end instant notable.
//   3. NULL BOUNDS ARE LEGITIMATE DATA THAT ONE PREDICATE CANNOT EXPRESS. Both bounds carry
//      `hb_nullRBKey="define.forever"` [L53-L54], so an open-ended period is valid.
//      `getCurrentFlag` honours that and `isExpired` guards with `isDate()`, but `isCurrent`
//      dereferences both bounds bare and THROWS.
//
// On top of that, FIVE of the six methods in the 38-line bidirectional window [L95-L132] are
// inoperable, and the sixth is the control that proves the pattern works when written properly.
//
// THIS SUITE OWNS THE PROJECT'S ONE AND ONLY ENTITY-LAYER SIGNATURE WIDENING
//
// `isCurrent` is the single method in `src/domain/entities/**` permitted to depart from its legacy
// arity: it takes an explicit instant so the UTC policy is visible at the call site and the
// predicate is deterministic. That budget is now EXHAUSTED - a second entity-layer widening is
// forbidden anywhere in the project. Every other member below is asserted at its LEGACY ARITY,
// including `isExpired()`, which takes NO arguments and reads the injected clock instead, and the
// four inoperable one-to-many helpers, which keep their single parameter even though they never
// look at it. A `describe` at the foot of this file audits that claim mechanically rather than
// leaving it as prose.
//
// TWO LOCATOR CORRECTIONS, VERIFIED FIRST-HAND THIS SESSION (source wins over any secondary note)
//
//   * THE SHIPPED `isCurrent` PARAMETER IS REQUIRED, NOT OPTIONAL. The task brief for this file
//     describes `isCurrent(now?: Date)` with the parameter defaulting to the injected clock. The
//     SHIPPED signature in `src/domain/entities/promotionPeriod.ts` is `isCurrent(now: Date)` -
//     mandatory. The suite matches the shipped surface, because the implementation is the contract
//     a reviewer diffs. That also makes the widening STRICTER than described, which is the safer
//     direction: there is no arity under which the ambient clock can leak into this predicate.
//     Consequently the "explicit argument and injected clock agree" check below is expressed as
//     agreement BETWEEN PREDICATES at one instant, not as two arities of one predicate.
//   * THE ROLLUP CALL SITE IS `Promotion.cfc:L99`, NOT L98. Read verbatim, L95 declares
//     `getCurrentPromotionPeriodFlag`, L96 is the memo guard, L97 seeds `false`, L98 is the `for`
//     statement, **L99 is `if(getPromotionPeriods()[i].getCurrentFlag())`**, L100 assigns `true`
//     and L101 is the `break`. A header note in `src/domain/entities/promotionPeriod.ts` cites L98
//     for that call; L98 is the loop, not the call. This suite cites L99, which is also what
//     `tests/fixtures/promotionFixtures.ts` records in `periodPredicateContrast.livePredicateCallPath`.
//
// SCOPE FENCES OBSERVED HERE
//
//   * NO SQL, and no promotion use-COUNT assertion. `model/dao/PromotionDAO.cfc:L134-L296` holds
//     the four use-count queries - including the duplicated `getStartDateTime()` test at L177 and
//     L244 where an END-date test is plainly intended - and every one of them belongs to
//     `tests/integration/`. This entity supplies the two nullable CEILINGS; it never counts uses.
//   * NO re-testing of `Promotion`'s three memoized rollups. `promotion.test.ts` owns those. The
//     one thing asserted here about the rollup is its DIRECTION of consumption.
//   * NO `PromotionCode` assertions, even though `datedPromotionCodes` carries the same nine date
//     rows. `promotionCode.test.ts` owns that entity.
//   * NO zod. Declarative validation is documented here and enforced at the service tier.
//   * NO deliberate divergence is claimed by this file. Its budget is ZERO, and it spends zero:
//     every defect below is REPRODUCED and carries its own two-line marker at its own locator.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import type { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// `Promotion` is imported as a VALUE, not `import type`, for one specific reason: the fixture graph
// cannot produce a promotion with an ABSENT name - `makePromotionFixtures` defaults
// `promotionName` to a non-empty string and `makePromotionVariant` always sets one - yet
// `getSimpleRepresentation` has a distinct, reachable throw path for exactly that state, because
// `Promotion.getPromotionName()` returns `string | undefined`. Constructing one minimal promotion
// directly is what makes that path testable without weakening a fixture that other suites share.
// Both entities are on this file's dependency whitelist, and both live in `src/domain/**`, so the
// layer boundary is respected either way. `PromotionQualifier` and `PromotionReward` remain
// type-only, because their instances come from the graph.

// ---------------------------------------------------------------------------
// UTC instants
//
// Every business date in this file is an explicit UTC ISO-8601 literal. There is deliberately no
// bare `new Date()`, no `Date.now()`, and no `new Date(0)` standing in for an absent bound - the
// epoch is a REAL INSTANT and using it to mean "no bound" would silently convert the permissive
// FOREVER semantics of `hb_nullRBKey="define.forever"` into a restrictive 1970 cut-off.
//
// There are also NO fake timers anywhere in this suite. `tests/setup.ts` pins `process.env.TZ` to
// UTC with a self-verifying throw and restores timers after every test; the clock this entity
// reads is INJECTED through its constructor, so freezing global time would add a second,
// redundant mechanism and hide the injection this port exists to make explicit.
//
// The values mirror `tests/fixtures/promotionFixtures.ts` exactly, so a fixture-built period and a
// locally-built one are directly comparable.
// ---------------------------------------------------------------------------

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
 * [model/entity/PromotionPeriod.cfc:L55-L56], which is why neither `Money` nor `decimal.js`
 * appears anywhere in this suite and why no float arithmetic is performed on them.
 */
const PERIOD_MAXIMUM_USE_COUNT = 100;
const PERIOD_MAXIMUM_ACCOUNT_USE_COUNT = 5;

/**
 * A NON-empty primary key, so `isNew()` reads `false`.
 * [model/entity/PromotionPeriod.cfc:L52] declares `default=""`, so the id is always a string and
 * the EMPTY one is the sentinel for unsaved.
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
 * The guard is not defensive padding: `new Date('nonsense')` yields an Invalid Date whose
 * `getTime()` is `NaN`, and every comparison against `NaN` is `false`. A typo in a literal would
 * therefore make a boundary assertion pass for the wrong reason instead of failing loudly.
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
 * The injected clock, frozen at one instant.
 *
 * A FRESH `Date` is returned on every read, so a subject under test cannot mutate the instant the
 * clock reports and leak that mutation into a later assertion.
 */
function fixedClock(at: Date): () => Date {
  return () => new Date(at.getTime());
}

/**
 * A clock that also records how many times it was read.
 *
 * Used once, by the `getCurrentFlag` describe, to pin that
 * [model/entity/PromotionPeriod.cfc:L140] reads `now()` TWICE within a single evaluation. That is
 * asserted as a CORRECTNESS property and never as a cost: under the legacy AMBIENT clock the two
 * reads can straddle an instant, so a period could be judged against two different "nows" inside
 * one boolean expression. The injected clock is what removes that hazard, and the count is the
 * evidence that the shape was reproduced rather than tidied into a single read.
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
 * on its cached answer - which is the memo becoming STALE, observed directly.
 *
 * Still not a fake timer: nothing global is patched, and the moved instant reaches the entity only
 * through the constructor-injected clock.
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
 * Derived with `ConstructorParameters` rather than re-declared, so this suite cannot drift from
 * the shipped constructor: adding, removing or retyping an init field breaks compilation here
 * immediately. The graph type is reached the same way, because `makePromotionFixtures` deliberately
 * does not export its override or graph interfaces - plain object literals in, structural reads
 * out.
 */
type PeriodInit = ConstructorParameters<typeof PromotionPeriod>[0];
type PeriodOverrides = Partial<PeriodInit>;
type PromotionFixtures = ReturnType<typeof makePromotionFixtures>;

/**
 * Build a `PromotionPeriod` with an open default window and per-test overrides.
 *
 * `{ ...base, ...overrides }` is deliberate: an EXPLICITLY passed `undefined` survives the spread
 * and overrides the default, which is exactly how a test says "this bound is ABSENT" as opposed to
 * "this bound is unspecified, use the default". Under `exactOptionalPropertyTypes` those two states
 * are distinct types, and the distinction is the whole subject of the absence-convention describe
 * below.
 *
 * A fresh instance is returned on every call, and every test calls it. The `currentFlag` memo
 * [model/entity/PromotionPeriod.cfc:L75, L137-L146] is INSTANCE state, so a shared subject would
 * let one test's memoized answer decide another test's outcome.
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
 * A fresh fixture graph. One per test, never hoisted to module scope.
 *
 * `makePromotionFixtures` builds a brand-new object tree on every call, so tests cannot share
 * mutable state through it - which matters here because two describes below deliberately MUTATE
 * the live `promotionPeriods` array a `Promotion` exposes.
 */
function freshFixtures(): PromotionFixtures {
  return makePromotionFixtures();
}

/**
 * A real `PromotionReward` from the fixture graph.
 *
 * Hand-written doubles are preferred in this project over `vi.mock`, but for the four inoperable
 * helpers no double is needed AT ALL: those methods throw before touching their argument, so what
 * matters is only that a genuinely-typed child instance is supplied - proving the throw is
 * unconditional rather than an artefact of a malformed stub. `merchandiseReward` is a single
 * instance rather than an array element, so no index narrowing is required.
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
 * `Promotion.isDeletable()` is `appliedPromotions.length === 0`
 * [model/entity/Promotion.cfc:L170-L172], so the stock graph promotion is NOT deletable. Emptying
 * the collection in place is legitimate rather than a workaround: `getAppliedPromotions()` returns
 * the LIVE array by contract, and the graph is rebuilt per test, so the mutation cannot escape the
 * test that made it. Both polarities are asserted below - this helper supplies the deletable one.
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
 * Needed to isolate the rollup direction: the stock graph already wires one CURRENT period into the
 * promotion, so a rollup asserted against it would read `true` no matter which predicate the rollup
 * consults. Narrowing the collection to a single hand-built period is what makes the answer
 * attributable.
 */
function replacePeriodsWith(promotion: Promotion, periods: readonly PromotionPeriod[]): void {
  const collection = promotion.getPromotionPeriods();

  collection.splice(0, collection.length, ...periods);
}

afterEach(() => {
  // `tests/setup.ts` already restores mocks and real timers after every test. This local hook is
  // the belt-and-braces half of the A2 freshness contract and is kept even though this suite
  // installs no timer: it makes the guarantee local and visible, so a future assertion that DOES
  // spy cannot silently inherit cleanup from a file it never reads.
  vi.restoreAllMocks();
});

// ===========================================================================
// B1a. `isCurrent(now)` - the widened predicate. Start INCLUSIVE, end EXCLUSIVE.
// ===========================================================================

// CFML parity [model/entity/PromotionPeriod.cfc:L78-L81]: isCurrent is widened by ONE `now`
// parameter -- the single entity-layer signature widening authorized project-wide -- so the UTC
// policy is explicit at the call site and the predicate is deterministic. Start is INCLUSIVE (L80
// uses `<=`) and end is EXCLUSIVE (L80 uses `>`), exactly as written. The legacy body captures
// `now()` ONCE into `currentDateTime` at L79 and compares both bounds against that one value, so
// the two comparisons can never straddle an instant; passing the instant in preserves that
// single-capture property by construction.
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

  it('reads ONLY its argument and never the injected clock', () => {
    // ⭐ This is the agreement check, expressed against the SHIPPED arity. The task brief for this
    // file describes an OPTIONAL `now` that falls back to the injected clock; the shipped signature
    // is `isCurrent(now: Date)` with the parameter MANDATORY, so there is no second arity to
    // compare against. What is provable - and stronger - is that the injected clock has NO
    // influence on this predicate at all: pin the clock far past the window, and `isCurrent` still
    // answers purely from the instant handed to it, while the clock-reading predicates on the same
    // instance answer from the clock.
    const clockWellPastTheWindow = fixedClock(instant('2025-01-01T00:00:00.000Z'));
    const period = makePeriod({ now: clockWellPastTheWindow });

    expect(period.isCurrent(instant(NOW_UTC))).toBe(true);
    expect(period.isExpired()).toBe(true);

    // ...and the same instance answers `false` for an instant outside the window, proving the
    // argument alone decides.
    expect(period.isCurrent(instant('2025-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('compares on absolute epoch milliseconds, so an equal instant in another offset matches', () => {
    // The UTC policy, observable: `2024-06-15T12:00:00.000Z` and `2024-06-15T14:00:00.000+02:00`
    // are the SAME instant. CFML date comparison depends on the server timezone; this port does
    // not, because every comparison runs on `Date.prototype.getTime()`.
    const period = makePeriod({
      startDateTime: instant(NOW_UTC),
      endDateTime: instant(PERIOD_END_UTC),
    });
    const sameInstantOtherOffset = instant('2024-06-15T14:00:00.000+02:00');

    expect(sameInstantOtherOffset.getTime()).toBe(instant(NOW_UTC).getTime());
    expect(period.isCurrent(sameInstantOtherOffset)).toBe(true);
  });
});

// ===========================================================================
// B1b. D32 - `isCurrent` is UNGUARDED and throws on an open-ended period.
// ===========================================================================

// LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L78-L81]: isCurrent dereferences
// getStartDateTime()/getEndDateTime() at L80 with no isNull guard, so an open-ended period -- which
// hb_nullRBKey="define.forever" at L53/L54 declares to be valid data -- makes the predicate THROW.
// getCurrentFlag (L140) and isExpired (L84) both guard; this one does not.
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
    // The message is an annotation contract, not a diagnostic nicety: it is what tells a reviewer
    // reading a stack trace that the failure is REPRODUCED legacy behaviour rather than a port bug.
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

// ===========================================================================
// B1c. `getCurrentFlag()` - memoized, null-PERMISSIVE, end-INCLUSIVE.
// ===========================================================================

// CFML parity [model/entity/PromotionPeriod.cfc:L137-L146]: getCurrentFlag SEEDS `true` at L139 and
// only ever NARROWS to `false` at L141. Its L140 test is null-PERMISSIVE -- each bound is examined
// only when present -- and it rejects the end bound solely on `end < now()`, which makes the end
// instant INCLUSIVE here and exclusive in isCurrent. The memo at L138 is reproduced for
// BEHAVIOURAL FIDELITY, not as an optimisation: the answer is computed once and thereafter goes
// STALE, and downstream code observes the stale value.
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
    // Behavioural fidelity, not caching for its own sake: the legacy memo means a long-lived
    // instance keeps answering with the value it computed on first read. `isExpired` is NOT
    // memoized, so the two diverge as soon as the clock crosses the end bound - and that
    // divergence is the observable consequence a caller has to live with.
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

    // Move the clock INTO the window. A recomputing accessor would now say true.
    clock.moveTo(instant('2024-07-15T00:00:00.000Z'));

    expect(period.getCurrentFlag()).toBe(false);
  });

  it('reads the injected clock TWICE on first evaluation and not at all thereafter', () => {
    // CFML parity [model/entity/PromotionPeriod.cfc:L140]: the legacy expression calls `now()` in
    // BOTH of its two arms. Asserted as a CORRECTNESS property: under an ambient clock those two
    // reads can land on different instants inside one boolean expression, so a period could be
    // judged against two different "nows" at once. Injecting the clock is what makes the two reads
    // agree. Nothing here is claimed about speed.
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
    // end arm. Pinning this proves the expression shape was reproduced rather than flattened into
    // two unconditional comparisons.
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
    // clock read - which is exactly why it can be judged "current" with no clock at all.
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

// ===========================================================================
// B1d. `isExpired()` - zero-argument, guarded, END bound only.
// ===========================================================================

// CFML parity [model/entity/PromotionPeriod.cfc:L83-L85]: isExpired takes NO arguments, guards with
// isDate(getEndDateTime()), and examines the END bound ONLY. It never looks at startDateTime, so a
// window that has not opened yet is NOT expired -- "expired" and "not current" are different
// questions, and this is the method that proves it.
describe('isExpired examines the end bound only, and keeps its legacy zero arity', () => {
  it('takes no parameters, so the one authorized widening was not spent twice', () => {
    // Arity is checkable, so it is checked rather than asserted in prose. `isCurrent` carries the
    // single permitted extra parameter; `isExpired` reads the injected clock instead.
    expect(PromotionPeriod.prototype.isExpired.length).toBe(0);
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

// ===========================================================================
// B2. D31 - the exact `endDateTime === now` instant, where the predicates disagree.
// ===========================================================================

// LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L80, L84, L140]: at the exact instant
// endDateTime === now, isCurrent() returns false (end exclusive) while getCurrentFlag() returns true
// (end inclusive) and isExpired() returns false -- the period is simultaneously "not current" by the
// direct predicate, "current" by the memoized flag, and "not expired". Three predicates, three
// answers, one instant.
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

    // The instant really is the end bound - stated as a precondition so a later fixture change
    // cannot quietly turn this into an ordinary inside-the-window test.
    expect(period.getEndDateTime()?.getTime()).toBe(boundary.getTime());

    expect(period.isCurrent(boundary)).toBe(false);
    expect(period.getCurrentFlag()).toBe(true);
    expect(period.isExpired()).toBe(false);
    expect(period.isDeletable()).toBe(true);
  });

  it('agrees on all three answers one millisecond either side of that instant', () => {
    // The disagreement is a KNIFE EDGE, not a broad band. One millisecond earlier the window is
    // unambiguously open; one millisecond later it is unambiguously shut.
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
    // L88 is `!isExpired() && getPromotion().isDeletable()`. It never consults isCurrent() or
    // getCurrentFlag(), so the predicate that says "not current" has no bearing on deletability.
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
    // A genuine cross-check rather than a tautology: `periodPredicateContrast` is hand-authored
    // documentation in `tests/fixtures/promotionFixtures.ts`, and these assertions confirm the
    // shipped entity actually behaves the way that documentation claims. If either drifts, this
    // fails.
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

    // Now prove each documented claim against the running entity.
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

    // The documented path names `Promotion.cfc:L99` as the call site - verified verbatim this
    // session: L98 is the `for` statement and L99 is the `getCurrentFlag()` call.
    expect(fixtures.periodPredicateContrast.livePredicateCallPath).toContain(
      'model/entity/Promotion.cfc:L99 getCurrentPromotionPeriodFlag',
    );
  });
});

// ===========================================================================
// B2b. Direction of consumption - the rollup reads the INCLUSIVE answer.
// ===========================================================================

// ⭐ CFML parity [model/entity/Promotion.cfc:L95-L107]: getCurrentPromotionPeriodFlag calls
// `.getCurrentFlag()` at L99 -- NOT `.isCurrent()` -- and breaks on the first match at L101. So the
// END-INCLUSIVE semantic is the one that reaches the promotion rollup, and the widened isCurrent()
// is DEAD in the legacy rollup: a repository-wide search finds no caller other than its own
// declaration. It is retained purely for interface parity. That asymmetry is also why the missing
// null guard at L80 never surfaced in production.
//
// Only the DIRECTION of consumption is asserted here. `Promotion`'s three memoized rollups, their
// seeds and their empty-collection polarities belong to `promotion.test.ts` and are not re-tested.
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

    // The two answers disagree...
    expect(boundaryPeriod.isCurrent(boundary)).toBe(false);
    expect(boundaryPeriod.getCurrentFlag()).toBe(true);

    // ...and the rollup takes the INCLUSIVE one. Were it wired to isCurrent() this would be false,
    // and it would additionally THROW for any open-ended period.
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
    // to isCurrent() would have raised instead of answering.
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

// ===========================================================================
// B2c. The nine authoritative date-bounds rows, driven from the fixture table.
// ===========================================================================

// The expected outcomes are OWNED by `tests/fixtures/promotionFixtures.ts`, which records
// `isCurrentOutcome` and `getCurrentFlagOutcome` per row against a fixed clock. Driving the suite
// from that table means the two modules cannot disagree silently, and it covers every combination
// of present/absent bound and every boundary equality in one pass.
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
    // If a second divergent row ever appears, the disagreement is no longer the single knife-edge
    // this suite documents and the D31 narrative needs revisiting.
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

    // Every one of them is judged CURRENT by the live predicate, which is the whole asymmetry.
    for (const bounds of throwing) {
      expect(bounds.getCurrentFlagOutcome, bounds.name).toBe(true);
      expect(bounds.startDateTimeUTC === undefined || bounds.endDateTimeUTC === undefined).toBe(
        true,
      );
    }
  });
});

// ===========================================================================
// B3. The bidirectional window [L95-L132] - five inoperable members and one control.
// ===========================================================================

// The four one-to-many helpers call `setPromotion` / `removePromotion` on their children, and
// NEITHER child declares either method. Verified first-hand on both sides of the port this session:
// `grep -c "setPromotion("` returns 0 in model/entity/PromotionReward.cfc and
// model/entity/PromotionQualifier.cfc, which declare only setPromotionPeriod
// (PromotionReward.cfc:L140, PromotionQualifier.cfc:L122) and removePromotionPeriod (L146, L128);
// and the same census over promotionReward.ts and promotionQualifier.ts returns 0 as well, so the
// anti-contract is intact in the target. That ABSENCE is what makes all four methods throw.
//
// In CFML the failure arrives through the onMissingMethod dispatcher at
// [org/Hibachi/HibachiEntity.cfc:L507-L565]. Every pattern it matches is `has*`- or `get*`-prefixed,
// so `set*` and `remove*` match nothing and fall through to the terminal throw at
// [org/Hibachi/HibachiEntity.cfc:L565]. The EAV fallback at L559 cannot catch them either: it
// requires an `attributeValues` property, and only four in-scope entities declare one
// (Sku.cfc:L70, Product.cfc:L75, ProductType.cfc:L67, Brand.cfc:L60). PromotionPeriod declares none,
// which puts it among the FOURTEEN throwing entities rather than the four silent ones. The target
// reproduces the OBSERVABLE outcome - the throw and its message - and deliberately implements NO
// dynamic dispatch: no Proxy, no index signature, no string-keyed method table, no `evaluate`.
describe('addPromotionReward is inoperable', () => {
  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L116-L118]: addPromotionReward calls
  // promotionReward.setPromotion(this) at L117, but PromotionReward declares only
  // setPromotionPeriod -- the call target does not exist, so this method throws at runtime.
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
  // removePromotionPeriod -- the call target does not exist, so this method throws at runtime.
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
  // setPromotionPeriod -- the call target does not exist, so this method throws at runtime.
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
  // arguments.PromotionQualifier.removePromotion(this) at L129 -- with a CAPITAL `P` on the
  // argument, where the declared parameter at L128 is lowercase `promotionQualifier`. CFML argument
  // names are case-insensitive so the capitalization resolves harmlessly, but PromotionQualifier
  // declares only removePromotionPeriod, so the call target does not exist and this method throws
  // at runtime.
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
    // though none of them ever reads it - which is also why `noUnusedParameters` is deliberately
    // left unset in tsconfig.json rather than the signatures being trimmed to satisfy it.
    expect(PromotionPeriod.prototype.addPromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.addPromotionQualifier.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionQualifier.length).toBe(1);
  });

  it('declares all four as void-returning, not never-returning', () => {
    // The shipped signatures return `void`, matching the legacy `public void function` declarations
    // at L116, L120, L125 and L128. Typing them `never` would be a signature change that advertises
    // the defect in the type system, and it is deliberately NOT made: the CFC promises void, so the
    // port promises void and the throw is a runtime fact a caller discovers the same way.
    const fixtures = freshFixtures();
    const period = makePeriod();
    const reward = rewardFrom(fixtures);

    // A `never` return would make this assignment a type error; `void` makes it legal.
    const call: () => void = () => {
      period.addPromotionReward(reward);
    };

    expect(call).toThrow();
  });
});

// ===========================================================================
// B3b. `removePromotion` - the REACHABLE `arguments.account` leak.
// ===========================================================================

// LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L104-L113]: removePromotion resolves the index
// from arguments.promotion at L108 but deletes from arguments.account at L110 -- a leaked identifier
// from a copy-pasted sibling. The leak is REACHABLE, so the found path throws and the structDelete
// at L112 (syntactically unconditional) is never reached; only the not-found path clears the
// association. Contrast PromotionAccount.cfc:L103, where the equivalent stray is MASKED because
// Promotion declares no getPromotionAccounts.
// Preserved deliberately; do not fix without a product decision.
//
// The masking contrast was verified first-hand rather than taken on trust: `grep -in
// "promotionAccount" model/entity/Promotion.cfc` returns NOTHING, so PromotionAccount.cfc:L101
// raises on `arguments.promotion.getPromotionAccounts()` BEFORE its L103 stray is ever evaluated.
// Here L108 succeeds against the `promotionPeriods` collection that Promotion.cfc:L62 genuinely
// declares, so execution does reach L110. Same typo, opposite reachability.
//
// JUDGMENT CALL: CFML `arrayFind` returns 0 when absent and L109 tests `index > 0`, whereas
// TypeScript `Array.prototype.findIndex` returns -1 when absent and 0 for a legitimate FIRST
// element. Writing `if (index > 0)` against a findIndex result would therefore silently skip a
// match at position 0 -- the single most likely mistranslation in this method. The shipped code
// correctly tests `index !== -1`, and the two tests below pin BOTH sides of that boundary so a
// regression to `> 0` fails here rather than in production.
describe('removePromotion throws on the found path and never mutates either side', () => {
  it('throws naming the leaked argument when the period IS in the promotion collection', () => {
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;
    const promotion = fixtures.promotion;

    // Precondition: the fixture graph pushes the period into the promotion, so this is the found
    // path by construction.
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
    // This is the observable consequence of the leak: the period still believes it belongs to the
    // promotion, so the association is not merely un-removed on one side - it is un-removed on BOTH.
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;
    const promotion = fixtures.promotion;

    expect(() => period.removePromotion(promotion)).toThrow();

    expect(period.getPromotion()).toBe(promotion);
  });

  it('throws identically when the argument is omitted and the near-side field supplies it', () => {
    // L105-L107 default the argument from `variables.promotion`, so omitting it reaches the same
    // found path rather than a different one.
    const fixtures = freshFixtures();
    const period = fixtures.promotionPeriod;

    expect(() => period.removePromotion()).toThrow('arguments.account');
    expect(period.getPromotion()).toBe(fixtures.promotion);
  });

  it('throws on a match at position ZERO, which an `index > 0` mistranslation would miss', () => {
    // The findIndex boundary, asserted directly. The fixture period is the FIRST element of the
    // collection, so its index is 0 - legitimate in TypeScript, "not found" under CFML's 1-based
    // `arrayFind`. If this ever stops throwing, the guard has been mistranslated to `index > 0`.
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
    // L109's guard is false, L110 is skipped, and the syntactically-unconditional structDelete at
    // L112 finally gets to run. This is the ONLY path on which the method does anything at all.
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
    // Hibernate session-identity semantics: two hydrations of one row are the same entity. A
    // distinct object carrying the SAME promotionPeriodID must therefore be treated as a member, so
    // it lands on the FOUND path and throws.
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
  // UNCONDITIONALLY. With no argument and no near-side field there is nothing to call it on, so
  // CFML raises a null-reference error before any index guard runs. Reproduced as a throw.
  it('throws when called with no argument on a period that has no promotion', () => {
    const period = makePeriod({ promotion: undefined });

    expect(period.getPromotion()).toBeUndefined();
    expect(() => period.removePromotion()).toThrow('cannot resolve a promotion');
  });

  it('keeps its single OPTIONAL parameter, matching the legacy `any promotion` declaration', () => {
    // L104 declares `removePromotion(any promotion)` WITHOUT `required`, which is what makes the
    // L105-L107 defaulting block reachable; L98's `setPromotion` declares `required any promotion`
    // and has no such block. The shipped signature is `removePromotion(promotion?: Promotion)`.
    //
    // Both report a `Function.length` of 1: an optional parameter is still a declared parameter, and
    // `length` excludes only DEFAULTED and rest parameters, not optional ones. So arity alone cannot
    // distinguish `required` from optional here - the observable difference is behavioural, and it is
    // the no-argument call asserted in the test above.
    expect(PromotionPeriod.prototype.removePromotion.length).toBe(1);
    expect(PromotionPeriod.prototype.setPromotion.length).toBe(1);
  });
});

// ===========================================================================
// B3c. `setPromotion` - the CONTROL. This one works.
// ===========================================================================

// ⭐ CFML parity [model/entity/PromotionPeriod.cfc:L98-L103]: setPromotion is the one member of the
// bidirectional window that is SOUND, and it is deliberately unmarked so the defect register stays
// honest. It works for a concrete reason: L101 appends to `arguments.promotion.getPromotionPeriods()`
// -- the collection model/entity/Promotion.cfc:L62 genuinely declares -- rather than to a leaked
// identifier.
//
// ⭐ AND THIS IS WHERE `Promotion`'s GUARD ACTUALLY LIVES. Promotion.cfc's bidirectional helpers are
// pure far-side delegations with no near-side duplicate guard of their own; the guard is HERE, at
// L100. Two consequences follow, and `promotion.test.ts` and this suite must agree on both:
//   * `Promotion.addPromotionPeriod` inherits this file's idempotency, because it delegates into it.
//   * `Promotion.removePromotionPeriod` [model/entity/Promotion.cfc:L144-L146] throws TRANSITIVELY
//     through the L110 leak above, since its whole body is
//     `arguments.PromotionPeriod.removePromotion( this )`. That is CITED here and deliberately NOT
//     re-asserted: it is `promotion.test.ts`'s assertion to make, and duplicating it would leave two
//     suites owning one behaviour.
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
    // `isNew() or !arguments.promotion.hasPromotionPeriod( this )`, and the FIRST arm tests THIS
    // instance's newness. For an unsaved period the guard is therefore always true and the append
    // always happens, so calling setPromotion twice appends twice. Pinned as shipped behaviour, not
    // repaired: no divergence is claimed by this file.
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
    // ⭐ TWO independent mechanisms protect this case, and it is worth separating them because only
    // one of them is legacy.
    //
    // The LEGACY mechanism is L100's `isNew() or` short-circuit, which appends without consulting
    // the far side at all when this instance is unsaved.
    //
    // The PORT adds a second, narrower safeguard inside `Promotion.hasPromotionPeriod`: when the
    // candidate's primary key is the empty string it falls back to OBJECT IDENTITY rather than
    // comparing keys, because a pure key comparison would report two different unsaved rows as the
    // same row. So the probe answers `false` for a distinct unsaved sibling instead of raising a
    // false positive. Verified first-hand against the shipped body rather than assumed - an earlier
    // reading of this suite predicted `true` here and was wrong.
    //
    // Both are asserted, so a regression in either one fails.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    replacePeriodsWith(promotion, []);
    const first = makePeriod({ promotionPeriodID: NEW_PERIOD_ID, promotion: undefined });
    const second = makePeriod({ promotionPeriodID: NEW_PERIOD_ID, promotion: undefined });

    first.setPromotion(promotion);

    // The identity fallback: same empty key, different object, so NOT reported as present.
    expect(second.getPromotionPeriodID()).toBe(first.getPromotionPeriodID());
    expect(promotion.hasPromotionPeriod(second)).toBe(false);

    second.setPromotion(promotion);

    expect(promotion.getPromotionPeriods()).toStrictEqual([first, second]);
  });

  it('appends an unsaved period again even when the far side reports it already present', () => {
    // ⭐ THE SHARPEST ISOLATION OF THE L100 GUARD. After the first append the identity fallback
    // reports the SAME unsaved instance as present - so the second arm of the guard,
    // `!hasPromotionPeriod(this)`, would be false and would suppress the append. It appends anyway,
    // which can only happen because `isNew()` short-circuits the `or` and the far side is never
    // consulted. Legacy behaviour, pinned rather than repaired.
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
    // L99 assigns BEFORE the guard runs, so the near side always tracks the latest argument even
    // when the append is skipped.
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
    // If `getPromotionPeriods()` returned a defensive copy the append would vanish, and every
    // bidirectional helper in the promotion family would be quietly inert.
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

// ===========================================================================
// B4. `isDeletable()` and `getSimpleRepresentation()` reach through the promotion unguarded.
// ===========================================================================

// CFML parity [model/entity/PromotionPeriod.cfc:L87-L89]: the declaration carries a STRAY SPACE --
// `public boolean function isDeletable ()` -- which is a cosmetic wart annotated rather than
// normalised, and the body is `!isExpired() && getPromotion().isDeletable()`. The `&&`
// SHORT-CIRCUITS, and that is behaviourally load-bearing: an EXPIRED period answers `false` without
// ever touching the promotion, so the unguarded reach-through is only reachable on the
// not-expired path. Both polarities are asserted below, because collapsing the check into an
// unconditional dereference would introduce a throw the legacy never raises.
describe('isDeletable short-circuits on expiry before reaching the promotion', () => {
  it('is false for an expired period WITHOUT touching the promotion at all', () => {
    // The strongest form of the short-circuit claim: the promotion is absent, so any dereference
    // would throw. It returns false instead.
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
    // A REAL route to the throw, not a synthetic one: the not-found path of `removePromotion` clears
    // `promotion`, and any later `isDeletable()` on that instance then raises.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const stranger = makePeriod({ promotionPeriodID: OTHER_PERIOD_ID, promotion });

    stranger.removePromotion(promotion);

    expect(stranger.getPromotion()).toBeUndefined();
    expect(() => stranger.isDeletable()).toThrow('cannot reach its promotion');
  });

  it('delegates to Promotion.isDeletable when the period is live and the promotion is present', () => {
    // CFML parity [model/entity/Promotion.cfc:L170-L172]: `arrayLen( getAppliedPromotions() ) == 0`
    // -- PERMISSIVE on an empty collection. That assertion belongs to `promotion.test.ts`; what is
    // asserted here is only that this entity DELEGATES to it, proved by flipping the far side and
    // watching the near-side answer follow.
    const fixtures = freshFixtures();
    const promotion = fixtures.promotion;
    const period = makePeriod({ promotion, now: fixedClock(fixtures.now) });

    // The stock graph wires one applied promotion in, so the far side says NOT deletable...
    expect(promotion.getAppliedPromotions()).toHaveLength(1);
    expect(period.isDeletable()).toBe(false);

    // ...and emptying it flips the near-side answer, which only delegation can explain.
    const applied = promotion.getAppliedPromotions();
    applied.splice(0, applied.length);

    expect(period.isDeletable()).toBe(true);
  });

  it('is not deletable when expired EVEN IF the promotion says it is', () => {
    // Both conjuncts matter. Expiry alone is sufficient to deny deletion.
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

// CFML parity [model/entity/PromotionPeriod.cfc:L91-L93]: getSimpleRepresentation is UNGUARDED --
// `return getPromotion().getPromotionName();` with no null check on either hop.
//
// ⚠️ THE INHERITED `simple_representation_exists_and_is_simple` ASSERTION IS DELIBERATELY NOT
// FORCED. `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58` asserts
// `isSimpleValue(variables.entity.getSimpleRepresentation())` for every entity that extends the base,
// and a BARE new PromotionPeriod cannot satisfy it: with no promotion materialized the call raises
// rather than returning a simple value. Forcing the generic assertion here would mean constructing a
// promotion just to satisfy a base-class expectation, which would assert the FIXTURE rather than the
// entity and would hide the very reach-through this describe exists to document. The honest move is
// to explain the gap rather than fabricate compliance with it -- so the precondition is stated, and
// both outcomes are asserted separately.
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
    // [model/entity/PromotionPeriod.cfc:L91] declares `returntype="string"` -- so CFML raises on the
    // return-type coercion rather than yielding an empty string. This is the path the fixture graph
    // cannot reach, which is why one minimal promotion is constructed here directly.
    const namelessPromotion = new Promotion({ promotionID: 'promotion-without-a-name' });
    const period = makePeriod({ promotion: namelessPromotion });

    expect(namelessPromotion.getPromotionName()).toBeUndefined();
    expect(() => period.getSimpleRepresentation()).toThrow('the promotion has no');
  });

  it('does not fall back to the empty string, the period id, or any other stand-in', () => {
    // A tempting "helpful" port would return '' here. It must not: the legacy raises, and a silent
    // empty string would surface in an admin list as a blank row instead of an error.
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

// ===========================================================================
// B5. The absence conventions - `undefined` means UNLIMITED and FOREVER.
// ===========================================================================

// CFML parity [model/entity/PromotionPeriod.cfc:L55-L56]: maximumUseCount and
// maximumAccountUseCount are notnull="false" with hb_nullRBKey="define.unlimited" -- undefined means
// UNLIMITED, not zero. Substituting 0 would forbid every use.
//
// CFML parity [model/entity/PromotionPeriod.cfc:L53-L54]: startDateTime and endDateTime carry
// hb_nullRBKey="define.forever" -- undefined means FOREVER, not the epoch. Substituting a
// zero-millisecond Date would convert an unbounded window into one that closed in 1970.
//
// This is the THIRD of three opposite absence conventions in this port, and the only one written
// into the ORM metadata rather than inferred from behaviour. The other two are sibling-owned and are
// CITED here, never re-tested: `Sku.getPriceByCurrencyCode()` must be `undefined` and never `0`,
// because [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback and a 0 there would sell
// products for free; and `Product.getSalePrice()` must be `0` and never `undefined`, because
// [model/entity/Product.cfc:L598] is a bare statement with no `return` and execution falls through to
// `return 0`. Three conventions, three polarities, none interchangeable.
describe('absent use ceilings mean UNLIMITED and are never coerced to zero', () => {
  it('reports undefined - not 0 - when neither ceiling is persisted', () => {
    const period = makePeriod({ maximumUseCount: undefined, maximumAccountUseCount: undefined });

    expect(period.getMaximumUseCount()).toBeUndefined();
    expect(period.getMaximumAccountUseCount()).toBeUndefined();
    expect(period.getMaximumUseCount()).not.toBe(0);
    expect(period.getMaximumAccountUseCount()).not.toBe(0);
  });

  it('keeps a persisted ZERO distinct from an absent ceiling', () => {
    // ⭐ The two states are NOT interchangeable and the engine reads them differently: the
    // promotion engine pairs `!isNull(...)` with a `gt 0` test, so 0 and undefined both mean "no
    // ceiling" TO THAT CALLER while remaining different values HERE. Collapsing them at the entity
    // would destroy information the entity has no business destroying.
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
    // [model/entity/PromotionPeriod.cfc:L55-L56] are `ormtype="integer"`. No Money value object and
    // no decimal library appears in this entity or this suite, and the values are returned exactly
    // as persisted.
    const period = makePeriod({ maximumUseCount: 7, maximumAccountUseCount: 3 });

    expect(Number.isInteger(period.getMaximumUseCount())).toBe(true);
    expect(Number.isInteger(period.getMaximumAccountUseCount())).toBe(true);
  });
});

describe('absent date bounds mean FOREVER and are never coerced to the epoch', () => {
  it('reports undefined for an absent start bound, and not any Date at all', () => {
    const period = makePeriod({ startDateTime: undefined });

    expect(period.getStartDateTime()).toBeUndefined();
    // Proves it is not merely a Date that happens to equal zero: there is no Date here to read a
    // time from. Deliberately written without constructing an epoch Date anywhere in this suite.
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

// ===========================================================================
// B6. The declarative validation schema, honoured EXACTLY as written.
// ===========================================================================

// `model/validation/PromotionPeriod.json`, verified verbatim this session - the WHOLE file:
//
//   "conditions": { "needsEndAfterStart": { "startDateTime": {"required":true},
//                                          "endDateTime":   {"required":true} } }
//   "startDateTime": [{"contexts":"save","dataType":"date"}]
//   "endDateTime":   [{"contexts":"save","dataType":"date"},
//                     {"contexts":"save","conditions":"needsEndAfterStart",
//                      "gtProperty":"startDateTime"}]
//
// ⚠️ THAT IS THE ENTIRE INVENTORY: two properties, one condition, three rules. `maximumUseCount` and
// `maximumAccountUseCount` are NOT VALIDATED AT ALL, and there is NO delete gate on
// `promotionRewards` or `promotionQualifiers` - contrast `model/validation/PromotionCode.json`, whose
// `"orders": [{"contexts":"delete","maxCollection":0}]` is exactly such a gate. Nothing is invented
// here to fill either gap.
//
// The identically-named `needsEndAfterStart` condition appears in
// `model/validation/PromotionCode.json` too, with the same two required properties and the same
// `gtProperty` comparison. The duplication is NOTED and deliberately NOT factored into a shared
// helper: one exported unit per file and no barrels, and `promotionCode.test.ts` owns its own copy.
//
// Enforcement is a SERVICE-TIER concern. There is no zod schema in this suite and none in the
// entity, and the tests below prove the entity accepts data the schema would reject - which is
// correct, because the legacy ORM hydrates such rows happily and rejecting them here would make the
// port refuse to load existing production data.
describe('the validation schema inventory is exactly two properties and one condition', () => {
  it('names the condition and the comparison the way the fixture module records them', () => {
    const fixtures = freshFixtures();

    expect(fixtures.conditionalDateValidationName).toBe('needsEndAfterStart');
    expect(fixtures.conditionalDateValidationComparison).toBe('gtProperty: startDateTime');
  });

  it('validates the two date properties, both of which the entity exposes', () => {
    const period = makePeriod();

    // The validated pair. Real getters, so the schema names real columns.
    expect(period.getStartDateTime()).toBeInstanceOf(Date);
    expect(period.getEndDateTime()).toBeInstanceOf(Date);
  });

  it('leaves both use ceilings entirely unvalidated even though the entity exposes them', () => {
    // The asymmetry, made concrete: the entity carries four nullable columns and the schema mentions
    // only two of them. A negative value is nonsensical for a use ceiling and the schema still has
    // nothing to say about it, so the entity accepts it.
    const period = makePeriod({ maximumUseCount: -1, maximumAccountUseCount: -1 });

    expect(period.getMaximumUseCount()).toBe(-1);
    expect(period.getMaximumAccountUseCount()).toBe(-1);
  });

  it('has no delete gate, so a period holding rewards and qualifiers is still deletable', () => {
    // `PromotionCode.json` gates deletion on an empty `orders` collection; `PromotionPeriod.json` has
    // no equivalent rule on either owned collection. Deletability therefore depends only on expiry
    // and the promotion, exactly as L88 says - never on collection contents.
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
    // That is precisely what `needsEndAfterStart` encodes: the condition requires BOTH properties, so
    // when either is missing the condition is unmet and the `gtProperty` comparison never fires.
    // Every row in the table with an absent bound therefore satisfies the rule vacuously.
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

    // Both have BOTH bounds present - which is what made the condition fire in the first place.
    for (const bounds of violating) {
      expect(bounds.startDateTimeUTC, bounds.name).toBeDefined();
      expect(bounds.endDateTimeUTC, bounds.name).toBeDefined();
    }
  });

  it('reads gtProperty as STRICTLY greater, so equal bounds violate the rule', () => {
    // A `>=` reading of `gtProperty` would wrongly accept a zero-width window. The table records
    // `endEqualsStart` as a violation, which pins the strict reading.
    const fixtures = freshFixtures();
    const equalBounds = fixtures.periodDateBoundsCases.find(
      (bounds) => bounds.name === 'endEqualsStart',
    );

    expect(equalBounds?.startDateTimeUTC).toBe(equalBounds?.endDateTimeUTC);
    expect(equalBounds?.satisfiesNeedsEndAfterStart).toBe(false);
  });

  it('constructs happily from rows the schema would reject - no entity-level invariant', () => {
    // Both violating shapes are PERSISTABLE, so the entity must hydrate them. An inverted window is
    // simply never current and always expired; a zero-width one likewise. No throw, no coercion, no
    // repair.
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
    // The duplication is observable through the fixture module reusing ONE bounds table for both
    // entities. Noted as duplication; no shared schema helper is extracted, and no PromotionCode
    // behaviour is asserted here.
    const fixtures = freshFixtures();

    expect(fixtures.datedPromotionCodes).toHaveLength(fixtures.datedPromotionPeriods.length);
    expect(fixtures.datedPromotionCodes.map((row) => row.bounds.name)).toStrictEqual(
      fixtures.datedPromotionPeriods.map((row) => row.bounds.name),
    );
  });
});

// ===========================================================================
// B7. Structural facts, and what the framework base deliberately did NOT contribute.
// ===========================================================================

describe('the row carries an honest primary key and an already-materialized promotion', () => {
  it('is new when the primary key is the empty string, per default="" at L52', () => {
    // This matters beyond bookkeeping: L100's guard READS `isNew()`, so the id's default is what
    // decides whether `setPromotion` consults the far side at all.
    const unsaved = makePeriod({ promotionPeriodID: NEW_PERIOD_ID });
    const persisted = makePeriod({ promotionPeriodID: PERSISTED_PERIOD_ID });

    expect(unsaved.isNew()).toBe(true);
    expect(unsaved.getPromotionPeriodID()).toBe('');
    expect(persisted.isNew()).toBe(false);
    expect(persisted.getPromotionPeriodID()).toBe(PERSISTED_PERIOD_ID);
  });

  it('returns the promotion synchronously, because associations arrive materialized', () => {
    // [model/entity/PromotionPeriod.cfc:L59] is `fetch="join"` - one of only FOUR eager sites in the
    // in-scope entity set, alongside Product.cfc:L68 `brand`, L69 `productType` and L70 `defaultSku`.
    // In the target the eager/lazy distinction DISAPPEARS: every association is materialized at the
    // repository boundary, which is an explicit documented query decision rather than an implicit
    // lazy load. So this getter is a plain synchronous read - not a promise, not a proxy, not a
    // loader.
    const fixtures = freshFixtures();
    const period = makePeriod({ promotion: fixtures.promotion });
    const association = period.getPromotion();

    expect(association).toBe(fixtures.promotion);
    expect(association).toBeInstanceOf(Promotion);
    expect(association).not.toHaveProperty('then');
  });

  it('keeps the promotionID column readable even when the association was not fetched', () => {
    // The FK column is held alongside the association, so the key survives a repository choosing not
    // to materialize the far side. The legacy `get*ID` dispatch returned the EMPTY STRING in that
    // situation; the target returns the column, and `undefined` when there is no column.
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
    // association and mutates the parent's array in place from `setPromotionPeriod`. A defensive copy
    // here would make every child-side append invisible.
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
    // ⭐ The strongest single structural assertion available, and it discharges several obligations at
    // once. It proves the CFC's members were carried over verbatim in legacy camelCase, and it proves
    // that NOTHING was invented: no `getNewFlag`, no `getPrintTemplates`/`getEmailTemplates`, no
    // `clearAttributeCache`, no smart list, no inherited framework memo, no rbKey resolver and no
    // permission accessor.
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
    // [model/entity/PromotionPeriod.cfc:L158-L160] is an EMPTY banner pair - the START and END
    // comments with nothing between them. Contrast the entities that DO carry hooks and disagree with
    // each other about ordering: PriceGroup.cfc:L206-L214 and ProductType.cfc:L305-L313 maintain
    // their materialized path BEFORE calling super, while Category.cfc:L126-L134 calls super FIRST.
    // None of that applies here, and an empty banner is never normalised into a hook.
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
    // That is DOCUMENTED, not reproduced: the target has no dynamic dispatch at all, so an undeclared
    // member is simply absent - which the surface assertion above already proves - and no Proxy or
    // `onMissingMethod` analogue exists to emulate it.
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype);

    expect(surface).not.toContain('getAttributeValue');
    expect(surface).not.toContain('onMissingMethod');
    expect(surface).not.toContain('setAttributeValue');
  });

  it('exposes no validation, error, or population surface', () => {
    // The framework base contributed `validate`, `hasErrors`, `getErrors` and a populate pipeline.
    // None is ported: validation is a service-tier concern, and in particular the raw
    // `writeDump(getErrors())` debug output at [org/Hibachi/HibachiEntity.cfc:L605] is deliberately
    // NOT carried over - a port that dumps entity state to the response stream would be a defect in
    // its own right.
    const surface = Object.getOwnPropertyNames(PromotionPeriod.prototype);

    expect(surface).not.toContain('validate');
    expect(surface).not.toContain('hasErrors');
    expect(surface).not.toContain('getErrors');
    expect(surface).not.toContain('populate');
  });

  it('injects no collaborator port - only the plain clock', () => {
    // ⭐ `grep -c 'getService('` over all 163 lines of the CFC returns ZERO, so this entity never
    // reaches outward through the service locator. The verified census across the eighteen in-scope
    // entities is 45 sites in total - Product 18, Sku 19, ProductType 6, OptionGroup 1, RoundingRule
    // 1, and every other entity 0. The constructor therefore takes NO port; `now: () => Date` is a
    // PLAIN parameter and not a fourteenth port, so the port ledger stays at 13. The observable
    // consequence is that every method on this entity is SYNCHRONOUS - no method returns a promise.
    const fixtures = freshFixtures();
    const period = makePeriod({ promotion: fixtures.promotion, now: fixedClock(fixtures.now) });

    expect(period.isCurrent(fixtures.now)).not.toHaveProperty('then');
    expect(period.getCurrentFlag()).not.toHaveProperty('then');
    expect(period.isExpired()).not.toHaveProperty('then');
    expect(period.isDeletable()).not.toHaveProperty('then');
    expect(period.getSimpleRepresentation()).not.toHaveProperty('then');
  });

  it('accepts the clock as a constructor argument rather than reading an ambient one', () => {
    // Two instances of the SAME row, given different clocks, disagree - which is only possible
    // because the clock is injected. Nothing here patches global time.
    const inside = makePeriod({ now: fixedClock(instant(NOW_UTC)) });
    const afterwards = makePeriod({ now: fixedClock(instant('2025-01-01T00:00:00.000Z')) });

    expect(inside.isExpired()).toBe(false);
    expect(afterwards.isExpired()).toBe(true);
  });
});

// ===========================================================================
// A2. Request-scoped state - the `currentFlag` memo never leaves its instance.
// ===========================================================================

// [model/entity/PromotionPeriod.cfc:L75] declares `currentFlag` as `persistent="false"`, and
// [L137-L146] memoizes it in `variables`. On a warm Lambda container a memo held at MODULE scope
// would persist between unrelated invocations and let one request's answer decide another's. The
// target keeps it as INSTANCE state and the repository tier keeps instances request-scoped; these
// tests prove the first half of that guarantee directly.
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

    // ...and the first instance still reports its own cached answer. Two live instances, two
    // different answers, no shared state.
    expect(first.getCurrentFlag()).toBe(true);
  });

  it('starts every instance with an empty memo, so nothing survives construction', () => {
    // Built AFTER the clock has moved past the window, a fresh instance must not inherit any earlier
    // instance's `true`.
    const clock = movableClock(instant('2025-01-01T00:00:00.000Z'));
    const warmUp = makePeriod({ now: fixedClock(instant(NOW_UTC)) });

    expect(warmUp.getCurrentFlag()).toBe(true);

    const cold = makePeriod({ now: clock.clock });

    expect(cold.getCurrentFlag()).toBe(false);
  });

  it('keeps the memo off the prototype, so it cannot become shared state', () => {
    // If the flag were declared on the prototype rather than assigned per instance, one instance's
    // memo would be every instance's memo.
    const period = makePeriod();

    expect(period.getCurrentFlag()).toBe(true);
    expect(Object.getOwnPropertyNames(PromotionPeriod.prototype)).not.toContain('currentFlag');
  });

  it('gives each fixture graph its own object tree', () => {
    // The suite's own isolation contract: `makePromotionFixtures` is called per test, so mutating a
    // graph - which two describes above deliberately do - cannot reach another test.
    const first = freshFixtures();
    const second = freshFixtures();

    expect(first.promotion).not.toBe(second.promotion);
    expect(first.promotionPeriod).not.toBe(second.promotionPeriod);

    replacePeriodsWith(first.promotion, []);

    expect(first.promotion.getPromotionPeriods()).toHaveLength(0);
    expect(second.promotion.getPromotionPeriods()).toHaveLength(1);
  });
});

// ===========================================================================
// The widening audit - asserted mechanically rather than promised in prose.
// ===========================================================================

describe('exactly one entity-layer signature widening was spent, and no second one', () => {
  it('gives isCurrent the single extra instant parameter and leaves every sibling at legacy arity', () => {
    // ⭐ C4, made checkable. `isCurrent` is the ONE method in `src/domain/entities/**` permitted to
    // depart from its legacy arity. Every other member below is listed with the arity its CFC
    // declaration implies, so adding a parameter anywhere - a second widening - fails here.
    //
    // JUDGMENT CALL: every assertion below reads `.length` DIRECTLY off the method rather than
    // passing the method to `expect(...)` and matching with `toHaveLength`. Both forms check the
    // same number, but the second lets an unbound method reference escape as a value, which
    // `@typescript-eslint/unbound-method` correctly rejects - an unbound method can later be invoked
    // with the wrong `this`. Reading the property immediately means no function value ever escapes,
    // so the audit needs no `.bind()`, no cast, and no inline rule suppression. Do not "simplify"
    // these back to `expect(PromotionPeriod.prototype.x).toHaveLength(n)`; that form fails lint.
    //
    // THE WIDENING. [model/entity/PromotionPeriod.cfc:L78] declares `isCurrent()` with NO
    // parameters; the target takes the instant explicitly so the UTC policy is visible at the call
    // site and the predicate is deterministic. This is the only `1` on this list that has no legacy
    // counterpart.
    expect(PromotionPeriod.prototype.isCurrent.length).toBe(1);

    // Legacy zero-argument predicates and accessors, every one unchanged. Each is referenced
    // DIRECTLY rather than looked up by string key, so a renamed or deleted member is a compile
    // error here rather than a silently-skipped loop iteration - and no cast is needed to reach any
    // of them.
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

    // Single-argument members, unchanged - including all four inoperable helpers, which keep the
    // parameter they never read, and `removePromotion`, whose parameter is optional.
    expect(PromotionPeriod.prototype.hasPromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.hasPromotionQualifier.length).toBe(1);
    expect(PromotionPeriod.prototype.setPromotion.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotion.length).toBe(1);
    expect(PromotionPeriod.prototype.addPromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionReward.length).toBe(1);
    expect(PromotionPeriod.prototype.addPromotionQualifier.length).toBe(1);
    expect(PromotionPeriod.prototype.removePromotionQualifier.length).toBe(1);

    // ...and the audit above is EXHAUSTIVE: 28 members plus the constructor is the whole surface, so
    // a newly added method cannot escape this audit unnoticed.
    expect(Object.getOwnPropertyNames(PromotionPeriod.prototype)).toHaveLength(29);
  });

  it('accepts a Date for the widened parameter and nothing looser', () => {
    // The widening is TYPED, not stringly. A caller cannot pass an ISO-8601 string or an epoch
    // number, which is what keeps the UTC policy enforced at the boundary rather than merely
    // documented.
    const period = makePeriod();

    // The supported form.
    expect(period.isCurrent(instant(NOW_UTC))).toBe(true);

    // And the rejected one. The `@ts-expect-error` IS the compile-time half of this assertion:
    // `tsc --noEmit` fails if this line ever STOPS being a type error, so the parameter cannot be
    // loosened without breaking the gate. The runtime half records what such a call would actually
    // do - dereference `.getTime()` on a string and raise - rather than quietly comparing NaN.
    // @ts-expect-error - the widened parameter is a Date; an ISO-8601 string is deliberately rejected.
    expect(() => period.isCurrent(NOW_UTC)).toThrow(TypeError);
  });
});
