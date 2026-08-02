/**
 * An optional bound on the uniqueness probing that URL-title derivation performs.
 *
 * ⭐ SEC-HARDENING (D18-CLASS) — SEC-14, review finding F5 (CWE-400). THIS FILE EXISTS BECAUSE THE
 * BOUND BELONGS HERE AND NOWHERE ELSE, AND `./urlTitle.ts` SAID SO BEFORE THE FINDING WAS RAISED.
 *
 * `model/service/DataService.cfc:L64` is `while(!unique)` with no ceiling: every collision issues one
 * more database read, indefinitely. `./urlTitle.ts` ports that loop verbatim and its own note closes
 * with the instruction this module follows literally — "IF A BOUND IS EVER WANTED, IT BELONGS OUTSIDE
 * THIS ALGORITHM. An invocation-level deadline, or a database-side unique constraint the adapter
 * reports, bounds the work without editing the ported member or fabricating a suffix the legacy never
 * produced." Finding F5 asked for exactly that: "Add an invocation-level deadline/bounded retry
 * outside the parity algorithm and rely on a database uniqueness constraint for final arbitration."
 *
 * ⛔ SO `./urlTitle.ts` IS NOT EDITED BY THIS, AND THAT IS THE WHOLE POINT OF PUTTING IT HERE.
 * `createUniqueURLTitle` keeps its three parameters, its unbounded `while (!unique)`, its
 * pre-incremented `-2` suffix and its `returntype="string"` contract, and it still has NO IMPORTS AT
 * ALL (AAP §0.7.3 S4). The bound is applied to the PROBE the caller injects, which the ported
 * algorithm already declares as a legitimate source of failure: "Whatever the probe rejects with
 * propagates unchanged." Nothing in the algorithm has to know this module exists.
 *
 * ⭐ WHY THIS IS NOT THE FABRICATED CEILING THAT WAS WITHDRAWN ONCE BEFORE. An earlier checkpoint put
 * a REQUIRED attempt budget inside `createUniqueURLTitle` and it was withdrawn, correctly, on the
 * reasoning `./urlTitle.ts` still records: "The legacy states no ceiling, so every possible value of
 * one is a fabricated number. Passing the fabrication to the caller as a required argument RELOCATED
 * the invention; it did not avoid it." That objection is an objection to REQUIRING a figure, and it
 * does not reach what this module does:
 *
 *   • The budget is OPTIONAL and has NO DEFAULT. A composition root that states nothing wires
 *     nothing, {@link boundUniqueValueProbe} is never called, and the derivation probes exactly as
 *     `:L64` does — unbounded, for as long as the legacy would have. No deployment inherits a figure
 *     this port invented (AAP §0.7.3 S9, IR-12).
 *   • The figure, when there is one, is the DEPLOYMENT'S OWN measurement of its own capacity, stated
 *     in its own composition root. This module neither supplies nor suggests a value, and no
 *     environment name carries one (see `../config/env.ts`, which deliberately declares no
 *     `UrlTitleConfig`).
 *   • Nothing here fabricates a title. A refused derivation returns NOTHING and writes nothing; it
 *     does not append a UUID, substitute a placeholder or hand back a candidate the probe never
 *     approved. The three prohibitions `./urlTitle.ts` lists — no fallback suffix, no fabricated
 *     title, no silently-taken value — are all still honoured.
 *
 * ⚠️ FINAL ARBITRATION REMAINS THE DATABASE'S, AND THAT HALF IS ALREADY IN PLACE. A bounded probe
 * bounds COST; it decides nothing about uniqueness. Two independent mechanisms already added for
 * findings F6 and F8 arbitrate that: `../adapters/mysql/UniquePropertyChecker.ts` takes a LOCKING read
 * when it is transaction-scoped, so a check-then-write pair is serialised, and
 * `../adapters/mysql/QueryRunner.ts` translates MySQL error 1062 into
 * `UniqueConstraintViolationError`, so a lost race is REPORTED rather than surfacing as a driver
 * error. The honest limitation is recorded on `../ports/UniquePropertyPort.ts`: this subtree contains
 * no `Sw*` DDL and AAP §0.2.2.5 excludes schema migration, so the unique index those mechanisms
 * arbitrate against is the deployment's to declare, not this port's to author.
 *
 * ⚠️ A WALL-CLOCK DEADLINE IS DELIBERATELY NOT ALSO PROVIDED, STATED RATHER THAN SILENTLY OMITTED.
 * F5's guidance is a disjunction — "a deadline/bounded retry" — and this satisfies the second arm for
 * the resource F5 actually names: "one DB query per collision", i.e. round trips. Adding a millisecond
 * budget as well would require injecting a clock into a leaf that is currently a pure function of its
 * arguments, and would give a second figure to invent for no additional refusal power over that
 * resource. Where a genuine invocation-level deadline already exists in this subtree it is carried as
 * the caller's `AbortSignal` at the port layer (`../ports/repositories/ProductRepository.ts`,
 * `../integrations/google/ProductFeedQuery.ts`), because a signal's lifetime is the invocation's and
 * cannot be a property of a service graph that outlives it (mismatch M7).
 */

import { DomainError, RequestBudgetExhaustedError } from '../errors/DomainError';

import type { UniqueValueProbe } from './urlTitle';

/**
 * A deployment's own ceiling on the uniqueness probes one URL-title derivation may issue.
 *
 * ONE MEMBER, AND NO SECOND ONE. There is no retry delay, no backoff factor, no jitter and no
 * timeout: each would be another figure the legacy states nowhere, and none of them reduces the
 * number of round trips, which is the cost F5 identifies.
 *
 * THE FIGURE COUNTS PROBES, NOT COLLISIONS, and the difference is one. `createUniqueURLTitle` probes
 * the bare candidate ONCE BEFORE the loop [`model/service/DataService.cfc:L62`] and then once per
 * iteration [`:L67`], so a budget of 1 permits the bare candidate and refuses the first collision, a
 * budget of 2 permits `-2`, and a budget of N permits the suffix `-N`. Probes are counted rather than
 * collisions because probes are the round trips, and round trips are what is being bounded.
 */
export interface UrlTitleProbeBudget {
  /**
   * The maximum number of uniqueness probes ONE derivation may issue. A positive safe integer.
   *
   * Stated by the deployment that measured it. This port supplies no default and suggests no value.
   */
  readonly maximumProbesPerDerivation: number;
}

/**
 * Fails fast when a wired budget is unusable, so a mis-wiring is a build-time fault.
 *
 * ⚠️ `NaN` IS THE ONE THAT MAKES THIS WORTH A FUNCTION. Every comparison against `NaN` is false, so a
 * `NaN` budget would admit every derivation while appearing to be configured — the finding would be
 * open and the deployment would believe it closed. `Infinity` is refused for the same reason: it is
 * indistinguishable in effect from stating nothing, and stating nothing is already how a deployment
 * asks for the legacy's unbounded behaviour. A fraction and a non-positive value are refused because
 * neither describes a number of round trips.
 *
 * ABSENCE IS NOT A MIS-WIRING and is deliberately not checked here — callers must invoke this only
 * when a budget was actually supplied. An absent budget is the documented default (see the module
 * header) and the parity path depends on it.
 *
 * The shape of this check mirrors the sibling budget validation in
 * `../adapters/mysql/SmartListQueryBuilder.ts` and `../services/SkuService.ts`, so a reader who has
 * met one has met all three.
 *
 * @param budget - the supplied budget
 * @throws DomainError when the figure is unusable. Deliberately NOT a
 *   {@link RequestBudgetExhaustedError}: a mis-wired ceiling is a deployment fault, not a rejected
 *   request, so it must not present to a caller as one. The plain base type's deny-by-default
 *   presentation answers it as a service fault, which is what both sibling budget validations in
 *   `../adapters/mysql/SmartListQueryBuilder.ts` and `../services/SkuService.ts` also raise — three
 *   budgets, one wiring-failure shape.
 */
export function assertUrlTitleProbeBudget(budget: UrlTitleProbeBudget): void {
  const maximum = budget.maximumProbesPerDerivation;
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new DomainError(
      'The URL-title probe budget must be a positive safe integer stating how many uniqueness ' +
        'probes one derivation may issue. Omit the budget entirely to probe without a ceiling, ' +
        'exactly as model/service/DataService.cfc:L64 does.',
      { context: { maximumProbesPerDerivation: maximum } },
    );
  }
}

/**
 * Wraps a uniqueness probe so a single derivation may issue at most `budget` probes.
 *
 * ⭐ A FRESH COUNTER PER CALL, AND THAT IS A CORRECTNESS REQUIREMENT RATHER THAN A STYLE CHOICE
 * (mismatch M7). The returned closure owns its own counter, so this factory MUST be invoked once per
 * `createUniqueURLTitle` call and its result MUST NOT be memoised on a service, a module or a
 * container. A counter shared across derivations would leak across invocations on a warm Lambda
 * container and would refuse a later, entirely legitimate derivation because an earlier unrelated one
 * had already collided — and AAP §0.6.6 M7 records that nothing may survive between invocations
 * except deliberately module-scoped state.
 *
 * THE PROBE IS CALLED FIRST AND COUNTED AFTER, so the budget's Nth probe is genuinely performed and
 * only the (N+1)th is refused. Counting before probing would silently make a budget of N permit N-1
 * probes.
 *
 * WHAT IT DOES NOT DO. It does not swallow the underlying probe's failures, does not retry, does not
 * cache a result, does not alter a candidate and does not reorder anything: on every call within
 * budget it returns exactly what the wrapped probe returned. The ported algorithm therefore sees the
 * same answers in the same order it always did, right up to the point of refusal.
 *
 * @param probe - the underlying uniqueness probe; see {@link UniqueValueProbe} for its inverted
 *   polarity, which this wrapper preserves untouched
 * @param budget - the deployment's ceiling, already validated by {@link assertUrlTitleProbeBudget}
 * @returns a probe that refuses once the ceiling is passed
 */
export function boundUniqueValueProbe(
  probe: UniqueValueProbe,
  budget: UrlTitleProbeBudget,
): UniqueValueProbe {
  let probes = 0;

  return async (tableName: string, value: string): Promise<boolean> => {
    probes += 1;
    if (probes > budget.maximumProbesPerDerivation) {
      /*
       * Refused before the round trip, so the budget bounds the database work rather than merely
       * reporting on it after the fact. Nothing has been written by this point on any caller's path:
       * the derivation feeds a value into the save that follows it, and a derivation that raises means
       * that save never runs.
       *
       * The internal account names the table, the ceiling and the candidate that would have been
       * probed; `getPublicError()` discloses none of it.
       */
      throw new RequestBudgetExhaustedError(
        'The title collided more times than this deployment permits probing, so no URL title was ' +
          'derived and nothing was written. model/service/DataService.cfc:L64 would have continued ' +
          'probing indefinitely.',
        {
          context: {
            tableName,
            candidateUrlTitle: value,
            probes,
            maximumProbesPerDerivation: budget.maximumProbesPerDerivation,
            locator: 'model/service/DataService.cfc:L64',
          },
        },
      );
    }

    return probe(tableName, value);
  };
}
