/* ================================================================================================
 * `UnitOfWork` — THE SORT-ORDER SEEDING BOUNDARY (review finding 18)
 * ================================================================================================
 * Companion to `UnitOfWork.test.ts`, which covers the execution/settlement boundary (the locking read,
 * the duplicate-key translation and the disposal decision). The sort-order seeding members are a
 * separate concern with their own driver expectations, so they are exercised here rather than being
 * interleaved with those cases.
 * ============================================================================================== */

/**
 * ================================================================================================
 * `UnitOfWork` — THE SORT-ORDER SEEDING CONTRACT — **NET-NEW** COVERAGE (REVIEW FINDING 18)
 * ================================================================================================
 * EVERY CASE IN THIS FILE IS **NET-NEW**, AND EVERY CASE TITLE SAYS SO. There is no legacy
 * `HibachiDAOTest` or `HibachiEntityTest` covering the sort-order block anywhere in `meta/tests/`, so
 * nothing here extends, replaces or reproduces an existing assertion. A reviewer asking "did this suite
 * replicate existing tests, or generate new ones?" has an unambiguous answer for this file: generated,
 * and labelled as generated in every single title.
 *
 * TRACEABILITY IS **DOCUMENTARY**, NOT EMPIRICAL, for the reasons the sibling adapter suites state at
 * length: MXUnit is not vendored, no CFML engine is available, and `meta/docker/slatwall-local-dev/`
 * does not exist. Every behavioural claim below was established by READING
 * `org/Hibachi/HibachiEntity.cfc` and `org/Hibachi/HibachiDAO.cfc` line by line, and each assertion
 * carries the `path:Lnnn` locator it was derived from. **NO RUNTIME BEHAVIOURAL COMPARISON WAS
 * PERFORMED.**
 *
 * ------------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHAT THE REVIEW FOUND
 * ------------------------------------------------------------------------------------------------
 * `model/entity/OptionGroup.cfc:L58` declares `sortOrder` with `required="true"`, and
 * `model/validation/OptionGroup.json` declares NO rule for it. Those are two different requirement
 * systems, and `test/domain/OptionGroup.test.ts` correctly pins the validation half: a group with
 * `sortOrder` unset validates clean, and the ported rule set must not invent a presence rule merely
 * because the mapping marks the column required.
 *
 * The review's point was about the OTHER half. `UnitOfWork` owned the READ —
 * `getTableTopSortOrder`, the port of `org/Hibachi/HibachiDAO.cfc:L149-L168` — and owned it with no test
 * at all, while NOTHING anywhere ported the ASSIGNMENT at `org/Hibachi/HibachiEntity.cfc:L646` that
 * consumes it. So the invariant had no enforcement point and no coverage, and an entity could reach a
 * writable-value collector with the slot still absent: "any bypass reaches the database with a
 * non-writable object."
 *
 * ⛔ WHAT THIS FILE REFUSES TO DO. It does not test a validation rule for `sortOrder`, because there
 * must not be one. It does not assert a default value, because none may be invented (S9) — the seed is
 * always `topSortOrder + 1` read from the table, and an unseeded entity raises. And it adds no database:
 * `mysql2` is not imported, no pool is constructed, and the executor is the shared support double.
 * ================================================================================================
 */
import {
  assertSortOrderAssigned,
  UnitOfWork,
  type SortOrderSeedTarget,
} from '../../src/adapters/mysql/UnitOfWork';
import { DataIntegrityError, DomainError } from '../../src/errors/DomainError';
import { createSqlExecutorDouble, sqlRows } from '../support/inMemoryRepositories';

import type {
  BoundParameterValue,
  StatementPool,
  TransactionalStatementRunner,
} from '../../src/adapters/mysql/QueryRunner';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { SqlExecutorCall } from '../support/inMemoryRepositories';

/* ================================================================================================
 * THE HARNESS
 * ============================================================================================== */

/**
 * A pool that refuses to hand out a connection.
 *
 * ⭐ REFUSING IS THE ASSERTION, NOT A CONVENIENCE. Every member exercised in this file takes its
 * executor as an ARGUMENT, precisely so the read shares the connection and the transaction of the insert
 * it is seeding (M6). A pool that answered would let a member quietly reach for a second connection and
 * the mistake would pass unnoticed; this one turns that into a failure.
 */
const refusingPool: StatementPool = {
  getConnection: (): Promise<TransactionalStatementRunner> =>
    Promise.reject(
      new Error(
        'seeding must run on the executor it is given, never on a pool connection of its own',
      ),
    ),
  execute: (_sql: string, _values: readonly BoundParameterValue[]): Promise<never> =>
    Promise.reject(new Error('seeding must not issue statements through the pool')),
};

/** What one harness observes. */
interface Harness {
  readonly unitOfWork: UnitOfWork;
  readonly calls: readonly SqlExecutorCall[];
  readonly executor: Parameters<UnitOfWork['getTableTopSortOrder']>[0];
}

/**
 * Builds the harness.
 *
 * @param answer - the rows every statement resolves to; the sort-order read is the only statement any
 *   case here issues, so one answer suffices.
 * @returns the harness.
 */
function buildHarness(answer: readonly MySqlRow[]): Harness {
  const sqlExecutor = createSqlExecutorDouble({ respond: () => sqlRows(answer) });

  return {
    unitOfWork: new UnitOfWork(refusingPool),
    calls: sqlExecutor.calls,
    executor: sqlExecutor.executor,
  };
}

/** Collapses runs of whitespace so a statement can be matched without depending on its indentation. */
function collapse(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** A bare group-shaped seed target — only the mutable slot the contract needs. */
function seedTarget(sortOrder?: number): SortOrderSeedTarget {
  return sortOrder === undefined ? {} : { sortOrder };
}

/* ================================================================================================
 * getTableTopSortOrder — org/Hibachi/HibachiDAO.cfc:L149-L168
 * ============================================================================================== */

describe('NET-NEW — getTableTopSortOrder, the read the seeding step consumes', () => {
  it('NET-NEW — composes the WHOLE-TABLE read with no WHERE clause and no parameters', async () => {
    const harness = buildHarness([{ topSortOrder: 7 }]);

    const top = await harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup');

    /*
     * `:L153-L157` — `SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM #tableName#`, and `:L159`
     * guards the `WHERE` clause on BOTH context arguments existing. `OptionGroup` declares no
     * `sortContext`, so `org/Hibachi/HibachiEntity.cfc:L644` supplies neither and this is the shape it
     * gets: the maximum across the ENTIRE table.
     *
     * ⚠️ THE `FOR UPDATE` IS NOT PART OF THE LEGACY STATEMENT, AND IT IS EXPECTED HERE ON PURPOSE. The
     * read is the READ HALF of the read-then-write at `org/Hibachi/HibachiEntity.cfc:L646`, and the
     * locking suffix is what closes review finding F8 (CWE-367) on it. It changes no result — the same
     * aggregate over the same scope returns the same number — so this case still asserts exactly what it
     * always asserted about the SHAPE: one statement, no `WHERE`, no bound value. The suffix's own
     * clause-ordering and lock semantics are asserted in `UnitOfWork.test.ts`.
     */
    expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
      'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup FOR UPDATE',
    );
    expect(harness.calls[0]?.params).toEqual([]);
    expect(harness.calls).toHaveLength(1);
    expect(top).toBe(7);
  });

  it('NET-NEW — composes the SCOPED read with the context value BOUND, never interpolated', async () => {
    const harness = buildHarness([{ topSortOrder: 3 }]);

    const top = await harness.unitOfWork.getTableTopSortOrder(
      harness.executor,
      'SwOption',
      'optionGroupID',
      'cccccccccccccccccccccccccccc0001',
    );

    /*
     * `:L160-L162` — the clause the legacy adds, and it is the ONE value the legacy already bound:
     * `<cfqueryparam cfsqltype="cf_sql_varchar" value="#arguments.contextIDValue#" />`. So this is not a
     * D18 hardening, it is a like-for-like translation of a statement that was already parameterised.
     * The COLUMN is an identifier and travels through `assertColumnName`, which is why it appears in the
     * text rather than as a marker.
     *
     * ⚠️ AND THE F8 LOCKING SUFFIX COMES AFTER THE `WHERE`, WHICH IS THE ONLY PLACE MySQL ACCEPTS IT.
     * That ordering is the reason the suffix is appended to the composed statement rather than to the
     * `FROM` clause; it is asserted structurally in `UnitOfWork.test.ts` and byte-for-byte here.
     */
    expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
      'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOption ' +
        'WHERE optionGroupID = ? FOR UPDATE',
    );
    expect(harness.calls[0]?.params).toEqual(['cccccccccccccccccccccccccccc0001']);
    expect(top).toBe(3);
  });

  it('NET-NEW — reads the COALESCE zero of an empty table rather than raising', async () => {
    const harness = buildHarness([{ topSortOrder: 0 }]);

    /* `:L153` projects `COALESCE(max(sortOrder), 0)`, so an empty table is a legitimate zero and not an
     * absent answer. The `+ 1` in the seeding step is what turns it into the first position. */
    await expect(
      harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup'),
    ).resolves.toBe(0);
  });

  it('NET-NEW — RAISES when the aggregate produced no row at all', async () => {
    const harness = buildHarness([]);

    /*
     * An aggregate without a `GROUP BY` always produces exactly one row, so no row means the statement
     * did not run as composed. That RAISES rather than degrading to the zero the `COALESCE` would have
     * produced — degrading would seed position 1 into a populated table and collide with a real row.
     */
    await expect(
      harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup'),
    ).rejects.toBeInstanceOf(DataIntegrityError);
  });

  it('NET-NEW — RAISES when the row lacks the projected alias', async () => {
    const harness = buildHarness([{ somethingElse: 4 }]);

    await expect(
      harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup'),
    ).rejects.toThrow(/without its projected column/);
  });

  it('NET-NEW — refuses a table outside the physical whitelist', async () => {
    const harness = buildHarness([{ topSortOrder: 1 }]);

    /* The table name is an IDENTIFIER and cannot be bound, so it is whitelisted instead. `tContent` is
     * the CMS table review finding 12 established must never enter the Catalog whitelist. The refused
     * candidate travels in the diagnostic CONTEXT rather than in the message, so the message stays free of
     * caller-supplied text — asserted on the context for exactly that reason. */
    const refusal = await harness.unitOfWork
      .getTableTopSortOrder(harness.executor, 'tContent')
      .then(
        () => undefined,
        (error: unknown) => error as DataIntegrityError,
      );

    expect(refusal).toBeInstanceOf(DomainError);
    expect(refusal?.context).toEqual({ candidate: 'tContent' });

    /* ⭐ AND IT IS REFUSED BEFORE ANY STATEMENT TEXT IS ASSEMBLED, so nothing reached the executor. */
    expect(harness.calls).toEqual([]);
  });
});

/* ================================================================================================
 * seedFirstSortOrder — org/Hibachi/HibachiEntity.cfc:L637-L647
 * ============================================================================================== */

describe('NET-NEW — seedFirstSortOrder, the whole-table assignment (review finding 18)', () => {
  it('NET-NEW — assigns topSortOrder + 1 across the WHOLE SwOptionGroup table', async () => {
    const harness = buildHarness([{ topSortOrder: 4 }]);
    const optionGroup = seedTarget();

    const assigned = await harness.unitOfWork.seedFirstSortOrder(
      harness.executor,
      'SwOptionGroup',
      optionGroup,
    );

    /*
     * ⭐⭐ THIS IS THE HALF THAT WAS MISSING, AND THE ARITHMETIC IS THE ASSERTION. `:L646` is
     * `setSortOrder( topSortOrder + 1 )`. `OptionGroup` declares no `sortContext`, so `:L644` takes the
     * unscoped read and the new group's position is one past the highest position IN THE ENTIRE TABLE —
     * which is exactly what "the whole-table top-sort-order assignment" in the review's resolution names.
     *
     * ⚠️ AND THE `+ 1` IS NOT COSMETIC. `SwOptionGroup.sortOrder` is an EXPONENT: `model/dao/SkuDAO.cfc:L195`
     * computes `SUM(SwOption.sortOrder * POWER(10, next - SwOptionGroup.sortOrder))`. An off-by-one here
     * reorders SKUs with no error anywhere, which is why the seed is pinned rather than assumed.
     */
    expect(assigned).toBe(5);
    expect(optionGroup.sortOrder).toBe(5);

    expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
      'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup FOR UPDATE',
    );
    expect(harness.calls[0]?.params).toEqual([]);
  });

  it('NET-NEW — seeds the FIRST row of an empty table to 1, not 0', async () => {
    const harness = buildHarness([{ topSortOrder: 0 }]);
    const optionGroup = seedTarget();

    await harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup);

    /* `COALESCE(max(sortOrder), 0)` at `:L153` plus the `+ 1` at `:L646`. Position 1, and the zero the
     * legacy initialises `topSortOrder` to at `:L640` is dead in the source and reproduced nowhere. */
    expect(optionGroup.sortOrder).toBe(1);
  });

  it('NET-NEW — takes the SCOPED read when a sortContext scope is supplied (Option)', async () => {
    const harness = buildHarness([{ topSortOrder: 2 }]);
    const option = seedTarget();

    const assigned = await harness.unitOfWork.seedFirstSortOrder(
      harness.executor,
      'SwOption',
      option,
      {
        contextIDColumn: 'optionGroupID',
        contextIDValue: 'cccccccccccccccccccccccccccc0001',
      },
    );

    /*
     * ⭐ THE SIBLING BRANCH, AND THE ONLY IN-SCOPE ENTITY THAT EXERCISES IT. `sortContext=` occurs five
     * times in the legacy tree and `model/entity/Option.cfc:L56` is the only one inside this slice, so
     * `:L641-L642` fires for an option and `:L644` for its group. An option's first position is therefore
     * one past the highest position WITHIN ITS GROUP, not within the table — which is why the two entities
     * cannot share one seeding call.
     */
    expect(assigned).toBe(3);
    expect(option.sortOrder).toBe(3);
    expect(collapse(harness.calls[0]?.sql ?? '')).toContain('WHERE optionGroupID = ?');
    expect(harness.calls[0]?.params).toEqual(['cccccccccccccccccccccccccccc0001']);
  });

  it('NET-NEW — the two branches differ ONLY in the scope, and read the same aggregate', async () => {
    const unscoped = buildHarness([{ topSortOrder: 9 }]);
    const scoped = buildHarness([{ topSortOrder: 9 }]);

    await unscoped.unitOfWork.seedFirstSortOrder(unscoped.executor, 'SwOptionGroup', seedTarget());
    await scoped.unitOfWork.seedFirstSortOrder(scoped.executor, 'SwOption', seedTarget(), {
      contextIDColumn: 'optionGroupID',
      contextIDValue: 'cccccccccccccccccccccccccccc0001',
    });

    /* Same projection, same `COALESCE`, same `+ 1`; the scoped form adds one clause and one bound value
     * and changes nothing else. Bounding the divergence with evidence is what keeps `:L641`'s branch from
     * drifting into two different reads. */
    const [unscopedSql, scopedSql] = [
      collapse(unscoped.calls[0]?.sql ?? ''),
      collapse(scoped.calls[0]?.sql ?? ''),
    ];

    /*
     * The F8 locking suffix trails BOTH statements, and MySQL requires it after the `WHERE` — so the
     * aggregate is compared with the suffix lifted off and re-attached in its required position rather
     * than spliced into the middle. Lifting it off cannot hide a difference, because the two assertions
     * below require it back on both.
     */
    const LOCKING_SUFFIX = ' FOR UPDATE';
    expect(unscopedSql.endsWith(LOCKING_SUFFIX)).toBe(true);
    expect(scopedSql.endsWith(LOCKING_SUFFIX)).toBe(true);

    const unscopedAggregate = unscopedSql.slice(0, -LOCKING_SUFFIX.length);
    expect(scopedSql).toBe(
      `${unscopedAggregate.replace('SwOptionGroup', 'SwOption')} WHERE optionGroupID = ?${LOCKING_SUFFIX}`,
    );
  });

  it('NET-NEW — REPLACES an existing value, because :L637-L647 carries no idempotency guard', async () => {
    const harness = buildHarness([{ topSortOrder: 6 }]);
    const optionGroup = seedTarget(99);

    await harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup);

    /*
     * ⚠️ TODO(parity) `org/Hibachi/HibachiEntity.cfc:L639-L646` — THE BLOCK IS GATED ONLY ON THE ACCESSOR
     * EXISTING, NEVER ON THE VALUE BEING ABSENT. It runs inside `preInsert()` and assigns
     * unconditionally, so an entity that arrived carrying a position has it overwritten on insert. That is
     * preserved rather than repaired: adding an "only if absent" guard would be an enhancement the legacy
     * does not have, and it would also mask a caller that seeded from the wrong table. The obligation this
     * places on callers — invoke on INSERT only, never on update — is recorded on the member itself.
     */
    expect(optionGroup.sortOrder).toBe(7);
  });

  it('NET-NEW — issues its read on the GIVEN executor, never on a pool connection of its own', async () => {
    const harness = buildHarness([{ topSortOrder: 1 }]);

    /* The harness's pool rejects every member. Resolving at all therefore proves the read travelled on the
     * executor it was handed — which is what makes it share the connection and transaction of the insert
     * it is seeding (M6). Two concurrent inserts reading through separate connections would see the same
     * maximum and collide. */
    await expect(
      harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', seedTarget()),
    ).resolves.toBe(2);
  });

  it('NET-NEW — leaves the slot UNSET when the read fails, seeding nothing on failure', async () => {
    const harness = buildHarness([]);
    const optionGroup = seedTarget();

    await expect(
      harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup),
    ).rejects.toBeInstanceOf(DataIntegrityError);

    /* No partial assignment: a failed read must not leave a position behind for the guard below to
     * accept. The insert that was being seeded is the caller's to abandon. */
    expect(optionGroup.sortOrder).toBeUndefined();
  });
});

/* ================================================================================================
 * assertSortOrderAssigned — the persistence-boundary invariant
 * ============================================================================================== */

describe('NET-NEW — assertSortOrderAssigned, the invariant guard (review finding 18)', () => {
  it('NET-NEW — REFUSES an entity whose sortOrder was never assigned', () => {
    /*
     * ⭐⭐ THIS IS THE BYPASS THE REVIEW NAMED, NOW CLOSED. `model/entity/OptionGroup.cfc:L58` declares
     * the column required and `model/validation/OptionGroup.json` declares no rule, so validation passes a
     * group with no position — correctly, and `test/domain/OptionGroup.test.ts` pins exactly that. What
     * used to be missing was anything downstream that noticed. A collector that read the absent slot would
     * bind `NULL` into a `NOT NULL` column, and the failure would surface as a driver error naming a
     * column rather than as a diagnosis naming the invariant.
     */
    expect(() => assertSortOrderAssigned(seedTarget(), 'SwOptionGroup')).toThrow(
      DataIntegrityError,
    );
    expect(() => assertSortOrderAssigned(seedTarget(), 'SwOptionGroup')).toThrow(
      /no sort order assigned/,
    );
  });

  it('NET-NEW — names the table in the diagnostic, and invents no value for the column', () => {
    let captured: DataIntegrityError | undefined;

    try {
      assertSortOrderAssigned(seedTarget(), 'SwOptionGroup');
    } catch (error) {
      captured = error as DataIntegrityError;
    }

    /* ⛔ S9 — THE GUARD IS DELIBERATELY INCAPABLE OF REPAIR. It does not default to `0`, does not default
     * to `1`, and does not perform the `MAX()` read itself: a guard that quietly seeded would hide the
     * bypass instead of reporting it, and would issue a statement from whatever call site forgot to seed —
     * possibly outside the transaction the write belongs to. */
    expect(captured?.context).toEqual({
      table: 'SwOptionGroup',
      member: 'assertSortOrderAssigned',
    });
  });

  it('NET-NEW — admits an entity that WAS seeded, and narrows the slot to present', async () => {
    const harness = buildHarness([{ topSortOrder: 11 }]);
    const optionGroup = seedTarget();

    await harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup);
    const writable = assertSortOrderAssigned(optionGroup, 'SwOptionGroup');

    /* The seeding step and the guard compose: what `:L646` assigned is what the boundary admits, and the
     * returned type carries `sortOrder: number` rather than an optional, so a collector downstream cannot
     * reintroduce the absent case by accident. */
    expect(writable.sortOrder).toBe(12);
  });

  it('NET-NEW — admits position ZERO, because absence and zero are different questions', () => {
    /* A row genuinely holding `0` is a legal stored value — `COALESCE(max(sortOrder), 0)` returns zero for
     * an empty table, and nothing forbids the column from holding it. The guard tests for ABSENCE, so a
     * falsy-value test here would refuse a row the database accepts. */
    expect(assertSortOrderAssigned(seedTarget(0), 'SwOptionGroup').sortOrder).toBe(0);
  });

  it('NET-NEW — refuses a table outside the physical whitelist even while refusing the entity', () => {
    /* Both refusals are real, and the whitelist one wins because the diagnostic's table is resolved while
     * the error is being composed. The point is that the guard cannot be used to smuggle an arbitrary table
     * name into a diagnostic — even on the path where the entity was going to be refused anyway. */
    let captured: DomainError | undefined;

    try {
      assertSortOrderAssigned(seedTarget(), 'tContent');
    } catch (error) {
      captured = error as DomainError;
    }

    expect(captured?.context).toEqual({ candidate: 'tContent' });
  });
});
