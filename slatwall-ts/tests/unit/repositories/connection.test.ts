/**
 * Characterization tests for `src/repositories/mysql/connection.ts` - its transactional
 * surface, its audit-actor gate, its placeholder guards and its pool lifecycle.
 *
 * ****************************************************************************
 * ** WHAT THIS SUITE COVERS, STATED FIRST BECAUSE THE CLAIM USED TO BE WRONG. **
 * **                                                                        **
 * ** A code review measured `tests/traceability/legacyTestMap.ts` labelling  **
 * ** ALL of `connection.ts` covered while this file tested only the          **
 * ** transactional executor and the tuple/batch helpers. Audit and stamp     **
 * ** resolution, `sqlUpdateAssignment`, placeholder admission, pool          **
 * ** acquisition, prepared-executor creation and `closeConnectionPool` had   **
 * ** no direct closure at all - the ledger asserted coverage this file did   **
 * ** not provide. Every one of those exports is now exercised behaviourally  **
 * ** below, and the ledger entry states what is pinned rather than implying  **
 * ** the whole module.                                                      **
 * **                                                                        **
 * ** AND IT STAYS A UNIT SUITE. NO REAL POOL IS BUILT AND NO SOCKET IS EVER  **
 * ** OPENED. Two mechanisms, and both are stated plainly rather than         **
 * ** implied. First, the REFUSAL cases need nothing at all: the module       **
 * ** resolves the configured dialect and refuses a non-MySQL one BEFORE it   **
 * ** reaches `createPool`, so a stubbed environment naming Oracle10g proves  **
 * ** the refusal, and one with an empty `DB_HOST` proves the configuration   **
 * ** refusal that precedes even that. Second, the ACCEPTED path replaces the **
 * ** driver's pool factory for this file - `createPool` is the one runtime   **
 * ** member the subject imports from `mysql2/promise` - so acquisition,      **
 * ** memoization, executor binding and `closeConnectionPool` are all         **
 * ** observed against a recording stand-in. That replacement is also what    **
 * ** makes "refused before any pool was constructed" a WITNESSED fact rather **
 * ** than an inference from reading the source.                              **
 * **                                                                        **
 * ** No case depends on any ambient `DB_*` value: each sets every variable   **
 * ** it needs, so the file passes on a bare checkout and on a machine        **
 * ** configured for a live probe alike, and each clears the module memo and  **
 * ** the configuration memo on both sides.                                   **
 * ****************************************************************************
 *
 * ****************************************************************************
 * ** WHY THIS FILE EXISTS.                                                  **
 * **                                                                        **
 * ** `connection.ts` had NO direct coverage of any kind before this suite.   **
 * ** That was tolerable while the executor was two read/write methods whose  **
 * ** behaviour the six repository suites exercised indirectly through their  **
 * ** own recording doubles. It stopped being tolerable when `transaction`    **
 * ** was added, because `transaction` is the first method here that owns a   **
 * ** RESOURCE LIFECYCLE - acquire, begin, commit or roll back, release -     **
 * ** and every one of those steps is a place where a mistake is invisible    **
 * ** until production. A repository double cannot cover it: the doubles      **
 * ** implement `transaction` themselves, so they characterize their own      **
 * ** stand-in rather than the real thing.                                    **
 * **                                                                        **
 * ** NET-NEW COVERAGE, and declared as such. There is no legacy antecedent:  **
 * ** the ORM opened `cftransaction` implicitly and the legacy suite has no   **
 * ** test for it. Per AAP 0.6.6 this is flagged as net-new rather than       **
 * ** presented as parity.                                                   **
 * ****************************************************************************
 *
 * The five properties most worth guarding, because each one is a silent
 * production failure rather than a visible one:
 *
 *   1. STATEMENTS INSIDE THE UNIT GO TO THE CONNECTION, NOT THE POOL. This is
 *      the whole point. `pool.execute` picks an arbitrary pooled connection per
 *      call, so a statement that escapes to the pool commits immediately and
 *      survives the rollback that was supposed to undo it.
 *   2. THE ORIGINAL FAILURE SURVIVES A FAILING ROLLBACK. When cleanup also
 *      fails, the caller must still see why the WORK failed. Masking it with the
 *      rollback's error is how a diagnosable bug becomes an undiagnosable one.
 *   3. THE CONNECTION IS ALWAYS RELEASED. A connection leaked on an error path
 *      is one the pool never hands out again, so a recurring failure exhausts
 *      the pool across warm invocations and the symptom appears far from the
 *      cause.
 *   4. NESTING JOINS RATHER THAN NESTS. MySQL implicitly commits on a second
 *      `START TRANSACTION`, so a nested implementation would commit an outer
 *      unit of work halfway through.
 *   5. PARAMETER CHECKING STILL APPLIES INSIDE A TRANSACTION. The bind-time
 *      guarantee that replaced `<cfqueryparam>` must not have a hole in it just
 *      because the statement is transactional.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Pool } from 'mysql2/promise';
import { appConfig } from '../../../src/lib/config.js';
import {
  AUDIT_ACTOR_COLUMNS,
  chunkTupleRows,
  closeConnectionPool,
  createPoolExecutor,
  getConnectionPool,
  getPreparedStatementExecutor,
  isPreparablePlaceholderCount,
  MAX_PLACEHOLDER_COUNT,
  MAX_TUPLE_ROW_WIDTH,
  resolveAuditActorAccountID,
  resolveStampedModifiedByAccountID,
  SQL_TUPLE_ROW_LIMIT,
  sqlPlaceholderList,
  sqlTuplePlaceholderList,
  sqlUpdateAssignment,
  UNATTRIBUTED_AUDIT_ACTOR,
} from '../../../src/repositories/mysql/connection.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
} from '../../../src/repositories/mysql/connection.js';

/**
 * The driver's pool factory, replaced for this file.
 *
 * ★★★ WHY THE MODULE IS MOCKED AT ALL, WHEN NOTHING HERE WANTS A POOL. Precisely because nothing
 * here wants one. `getConnectionPool` is asserted to refuse a non-MySQL dialect and an unsatisfied
 * environment BEFORE it constructs anything, and the only way to witness "before" rather than infer
 * it from the source is to observe that the factory was never called. It doubles as this file's
 * safety net: if any case ever did reach construction, the call is recorded here instead of a real
 * `mysql2` pool being built inside a unit suite.
 *
 * `createPool` is the ONE runtime member `src/repositories/mysql/connection.ts` imports from
 * `mysql2/promise` [src/repositories/mysql/connection.ts:L165]; everything else it takes from the
 * driver is a type, which is erased. The replacement is therefore complete rather than partial.
 *
 * Hoisted because `vi.mock` is hoisted above the imports it replaces.
 */
const { driverCreatePool } = vi.hoisted(() => ({ driverCreatePool: vi.fn() }));

vi.mock('mysql2/promise', () => ({ createPool: driverCreatePool }));

// ---------------------------------------------------------------------------
// A fake pool, recording the lifecycle
// ---------------------------------------------------------------------------

/** One recorded interaction, in the order it happened. */
type Interaction =
  | { readonly on: 'pool'; readonly step: 'execute'; readonly sql: string }
  | { readonly on: 'pool'; readonly step: 'getConnection' }
  | { readonly on: 'connection'; readonly step: 'execute'; readonly sql: string }
  | { readonly on: 'connection'; readonly step: 'begin' | 'commit' | 'rollback' | 'release' };

/** Which lifecycle call, if any, the fake connection should fail. */
interface FailurePlan {
  readonly onBegin?: Error;
  readonly onCommit?: Error;
  readonly onRollback?: Error;
}

/** What a data-modifying statement reports, standing in for a `ResultSetHeader`. */
interface FakeHeader {
  readonly affectedRows: number;
  readonly warningStatus: number;
}

/**
 * Whether the driver would answer this statement with a header instead of rows.
 *
 * NOT A CONVENIENCE - it is what the real driver does. `execute` resolves to
 * `[rows, fields]` for a result-set statement and `[ResultSetHeader, fields]` for
 * a data-modifying one, so the FIRST TUPLE ELEMENT IS A DIFFERENT SHAPE depending
 * on the statement kind. A fake that always answered with rows would let
 * `executeMutation` read `affectedRows` off an array and see `undefined`, which is
 * a fault in the fake rather than in the subject.
 */
function isMutation(sql: string): boolean {
  return /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
}

/**
 * A pool that records every interaction and returns canned driver results.
 *
 * The cast to `Pool` is deliberate and confined to this helper. `Pool` is a wide
 * driver interface and the executor touches exactly two of its members -
 * `execute` and `getConnection` - so implementing the remainder would add dozens
 * of unreachable stubs whose only effect is to obscure which members actually
 * matter. Narrowing here states that surface explicitly instead.
 */
function makeFakePool(
  rows: readonly unknown[] = [],
  failure: FailurePlan = {},
  header: FakeHeader = { affectedRows: 0, warningStatus: 0 },
): {
  readonly pool: Pool;
  readonly log: Interaction[];
  readonly connectionsAcquired: () => number;
} {
  const log: Interaction[] = [];
  let acquired = 0;

  const connection = {
    execute: (sql: string): Promise<[readonly unknown[] | FakeHeader, never[]]> => {
      log.push({ on: 'connection', step: 'execute', sql });

      return Promise.resolve([isMutation(sql) ? header : rows, []]);
    },
    beginTransaction: (): Promise<void> => {
      log.push({ on: 'connection', step: 'begin' });

      return failure.onBegin ? Promise.reject(failure.onBegin) : Promise.resolve();
    },
    commit: (): Promise<void> => {
      log.push({ on: 'connection', step: 'commit' });

      return failure.onCommit ? Promise.reject(failure.onCommit) : Promise.resolve();
    },
    rollback: (): Promise<void> => {
      log.push({ on: 'connection', step: 'rollback' });

      return failure.onRollback ? Promise.reject(failure.onRollback) : Promise.resolve();
    },
    release: (): void => {
      log.push({ on: 'connection', step: 'release' });
    },
  };

  const pool = {
    execute: (sql: string): Promise<[readonly unknown[] | FakeHeader, never[]]> => {
      log.push({ on: 'pool', step: 'execute', sql });

      return Promise.resolve([isMutation(sql) ? header : rows, []]);
    },
    getConnection: (): Promise<typeof connection> => {
      log.push({ on: 'pool', step: 'getConnection' });
      acquired += 1;

      return Promise.resolve(connection);
    },
  };

  return {
    pool: pool as unknown as Pool,
    log,
    connectionsAcquired: (): number => acquired,
  };
}

/** The lifecycle steps only, as a readable sequence for order assertions. */
function stepsOf(log: readonly Interaction[]): string[] {
  return log.map((entry) => `${entry.on}.${entry.step}`);
}

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

describe('createPoolExecutor - transaction, committed path', () => {
  it('acquires a connection, begins, runs the work, commits, then releases - in that order', async () => {
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await executor.transaction(async (tx) => {
      await tx.executeMutation(
        'UPDATE SwPriceGroup SET priceGroupName = ? WHERE priceGroupID = ?',
        ['Wholesale', 'pg-1'],
      );
    });

    expect(stepsOf(log)).toEqual([
      'pool.getConnection',
      'connection.begin',
      'connection.execute',
      'connection.commit',
      'connection.release',
    ]);
  });

  it("returns the work's value, so a committed value is what the caller receives", async () => {
    const { pool } = makeFakePool();
    const executor = createPoolExecutor(pool);

    const returned = await executor.transaction(() => Promise.resolve('pg-42'));

    expect(returned).toBe('pg-42');
  });

  it('★★ sends every statement issued through `tx` to the CONNECTION, never to the pool', async () => {
    // PROPERTY 1, and the reason this method exists. A statement that reached
    // `pool.execute` would run on an arbitrary other connection, outside the
    // transaction, where it commits immediately and survives a rollback.
    const { pool, log } = makeFakePool([{ priceGroupID: 'pg-1' }]);
    const executor = createPoolExecutor(pool);

    await executor.transaction(async (tx) => {
      await tx.execute('SELECT priceGroupID FROM SwPriceGroup WHERE priceGroupID = ?', ['pg-1']);
      await tx.executeMutation('DELETE FROM SwPriceGroupRate WHERE priceGroupID = ?', ['pg-1']);
    });

    expect(log.filter((entry) => entry.on === 'pool' && entry.step === 'execute')).toEqual([]);
    expect(
      log.filter((entry) => entry.on === 'connection' && entry.step === 'execute'),
    ).toHaveLength(2);
  });

  it('acquires exactly ONE connection for the whole unit of work', async () => {
    const { pool, connectionsAcquired } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await executor.transaction(async (tx) => {
      await tx.executeMutation('DELETE FROM SwPriceGroupRateSku WHERE priceGroupRateID = ?', [
        'r1',
      ]);
      await tx.executeMutation('DELETE FROM SwPriceGroupRateProduct WHERE priceGroupRateID = ?', [
        'r1',
      ]);
      await tx.executeMutation('DELETE FROM SwPriceGroupRate WHERE priceGroupRateID = ?', ['r1']);
    });

    expect(connectionsAcquired()).toBe(1);
  });

  it('hands rows back from a transactional read', async () => {
    const { pool } = makeFakePool([{ priceGroupID: 'pg-1' }, { priceGroupID: 'pg-2' }]);
    const executor = createPoolExecutor(pool);

    const rows = await executor.transaction((tx) =>
      tx.execute('SELECT priceGroupID FROM SwPriceGroup'),
    );

    expect(rows).toHaveLength(2);
  });

  it('reports affectedRows and warningStatus from a transactional mutation', async () => {
    // The fake's canned result stands in for a `ResultSetHeader`, so the two
    // fields the port exposes are read off it and nothing else is invented.
    const { pool } = makeFakePool([], {}, { affectedRows: 3, warningStatus: 0 });
    const executor = createPoolExecutor(pool);

    const result = await executor.transaction((tx) =>
      tx.executeMutation('DELETE FROM SwPriceGroupRate WHERE priceGroupID = ?', ['pg-1']),
    );

    expect(result.affectedRows).toBe(3);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Failure paths
// ---------------------------------------------------------------------------

describe('createPoolExecutor - transaction, failing path', () => {
  it('rolls back and re-throws the original failure when the work throws', async () => {
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);
    const boom = new Error('the fourth statement failed');

    await expect(
      executor.transaction(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(stepsOf(log)).toEqual([
      'pool.getConnection',
      'connection.begin',
      'connection.rollback',
      'connection.release',
    ]);
  });

  it('does NOT commit when the work throws', async () => {
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await expect(executor.transaction(() => Promise.reject(new Error('nope')))).rejects.toThrow(
      'nope',
    );

    expect(stepsOf(log)).not.toContain('connection.commit');
  });

  it('★★ preserves the ORIGINAL failure when the rollback ALSO fails', async () => {
    // PROPERTY 2. Cleanup failing is not the caller's problem; the work failing
    // is. Swapping these is how a diagnosable bug becomes an undiagnosable one.
    const rollbackFailure = new Error('connection already gone');
    const { pool, log } = makeFakePool([], { onRollback: rollbackFailure });
    const executor = createPoolExecutor(pool);
    const original = new Error('constraint violated on SwPriceGroupRateSku');

    await expect(executor.transaction(() => Promise.reject(original))).rejects.toBe(original);

    // The rollback was genuinely attempted, and the connection still came back.
    expect(stepsOf(log)).toEqual([
      'pool.getConnection',
      'connection.begin',
      'connection.rollback',
      'connection.release',
    ]);
  });

  it('★★ releases the connection even when the work throws', async () => {
    // PROPERTY 3. A leaked connection is never handed out again, so a recurring
    // failure exhausts the pool and the symptom surfaces far from the cause.
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await expect(executor.transaction(() => Promise.reject(new Error('x')))).rejects.toThrow('x');

    expect(stepsOf(log).filter((step) => step === 'connection.release')).toHaveLength(1);
  });

  it('releases the connection even when the rollback also fails', async () => {
    const { pool, log } = makeFakePool([], { onRollback: new Error('rollback down') });
    const executor = createPoolExecutor(pool);

    await expect(executor.transaction(() => Promise.reject(new Error('y')))).rejects.toThrow('y');

    expect(stepsOf(log).filter((step) => step === 'connection.release')).toHaveLength(1);
  });

  it('rolls back and releases when the COMMIT itself fails', async () => {
    const commitFailure = new Error('commit refused');
    const { pool, log } = makeFakePool([], { onCommit: commitFailure });
    const executor = createPoolExecutor(pool);

    await expect(executor.transaction(() => Promise.resolve('unreachable'))).rejects.toBe(
      commitFailure,
    );

    expect(stepsOf(log)).toEqual([
      'pool.getConnection',
      'connection.begin',
      'connection.commit',
      'connection.rollback',
      'connection.release',
    ]);
  });

  it('releases the connection when BEGIN fails, before any work runs', async () => {
    const beginFailure = new Error('cannot begin');
    const { pool, log } = makeFakePool([], { onBegin: beginFailure });
    const executor = createPoolExecutor(pool);
    let workRan = false;

    await expect(
      executor.transaction(() => {
        workRan = true;

        return Promise.resolve('unreachable');
      }),
    ).rejects.toBe(beginFailure);

    expect(workRan).toBe(false);
    expect(stepsOf(log)).toEqual([
      'pool.getConnection',
      'connection.begin',
      'connection.rollback',
      'connection.release',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Nesting
// ---------------------------------------------------------------------------

describe('createPoolExecutor - transaction joins rather than nests', () => {
  it('★★ does not begin a second transaction when `tx.transaction` is called', async () => {
    // PROPERTY 4. MySQL implicitly COMMITS on a second `START TRANSACTION`, so a
    // nested implementation would commit the outer unit halfway through - the
    // exact failure this is shaped to make impossible.
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await executor.transaction(async (tx) => {
      await tx.executeMutation('UPDATE SwPriceGroup SET parentPriceGroupID = NULL WHERE x = ?', [
        'a',
      ]);

      await tx.transaction(async (inner) => {
        await inner.executeMutation('DELETE FROM SwPriceGroupRate WHERE priceGroupID = ?', ['a']);
      });
    });

    expect(stepsOf(log).filter((step) => step === 'connection.begin')).toHaveLength(1);
    expect(stepsOf(log).filter((step) => step === 'connection.commit')).toHaveLength(1);
    expect(stepsOf(log).filter((step) => step === 'connection.release')).toHaveLength(1);
  });

  it('runs joined inner work on the same single connection', async () => {
    const { pool, connectionsAcquired, log } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await executor.transaction((tx) =>
      tx.transaction((inner) =>
        inner.executeMutation('DELETE FROM SwPriceGroupRateSku WHERE priceGroupRateID = ?', ['r1']),
      ),
    );

    expect(connectionsAcquired()).toBe(1);
    expect(log.filter((entry) => entry.on === 'pool' && entry.step === 'execute')).toEqual([]);
  });

  it("propagates a joined inner failure through the outer unit's rollback", async () => {
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);
    const inner = new Error('inner statement failed');

    await expect(
      executor.transaction((tx) => tx.transaction(() => Promise.reject(inner))),
    ).rejects.toBe(inner);

    expect(stepsOf(log)).toEqual([
      'pool.getConnection',
      'connection.begin',
      'connection.rollback',
      'connection.release',
    ]);
  });

  it("returns the joined inner work's value", async () => {
    const { pool } = makeFakePool();
    const executor = createPoolExecutor(pool);

    const returned = await executor.transaction((tx) => tx.transaction(() => Promise.resolve(7)));

    expect(returned).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// The bind-time guarantee still holds inside a transaction
// ---------------------------------------------------------------------------

describe('createPoolExecutor - parameter checking inside a transaction', () => {
  it('★ refuses an unbindable parameter on a transactional read, before sending it', async () => {
    // PROPERTY 5. This is the guarantee `<cfqueryparam>` provided
    // [model/dao/PriceGroupDAO.cfc:L65]; a transactional statement must not be a
    // hole in it.
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await expect(
      executor.transaction((tx) =>
        tx.execute('SELECT priceGroupID FROM SwPriceGroup WHERE priceGroupID = ?', [
          { nested: 'object' },
        ]),
      ),
    ).rejects.toThrow();

    // The statement never reached the connection.
    expect(log.filter((entry) => entry.step === 'execute')).toEqual([]);
  });

  it('★ refuses an unbindable parameter on a transactional mutation, and still rolls back', async () => {
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await expect(
      executor.transaction((tx) =>
        tx.executeMutation('DELETE FROM SwPriceGroupRate WHERE priceGroupRateID = ?', [
          Symbol('nope'),
        ]),
      ),
    ).rejects.toThrow();

    expect(stepsOf(log)).toEqual([
      'pool.getConnection',
      'connection.begin',
      'connection.rollback',
      'connection.release',
    ]);
  });

  it('binds an empty parameter list when none is supplied', async () => {
    const { pool, log } = makeFakePool();
    const executor = createPoolExecutor(pool);

    await executor.transaction((tx) => tx.execute('SELECT 1'));

    expect(
      log.filter((entry) => entry.on === 'connection' && entry.step === 'execute'),
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The non-transactional surface is unchanged
// ---------------------------------------------------------------------------

describe('createPoolExecutor - the non-transactional surface still goes through the pool', () => {
  it('routes a plain read through pool.execute and acquires no connection', async () => {
    const { pool, log, connectionsAcquired } = makeFakePool([{ productID: 'p1' }]);
    const executor = createPoolExecutor(pool);

    const rows = await executor.execute('SELECT productID FROM SwProduct WHERE productID = ?', [
      'p1',
    ]);

    expect(rows).toHaveLength(1);
    expect(connectionsAcquired()).toBe(0);
    expect(stepsOf(log)).toEqual(['pool.execute']);
  });

  it('routes a plain mutation through pool.execute', async () => {
    const { pool, log } = makeFakePool([], {}, { affectedRows: 1, warningStatus: 0 });
    const executor = createPoolExecutor(pool);

    const result = await executor.executeMutation('DELETE FROM SwProduct WHERE productID = ?', [
      'p1',
    ]);

    expect(result.affectedRows).toBe(1);
    expect(stepsOf(log)).toEqual(['pool.execute']);
  });

  it('exposes exactly the three contract methods, and is frozen', async () => {
    const { pool } = makeFakePool();
    const executor: PreparedStatementExecutor = createPoolExecutor(pool);

    expect(Object.keys(executor).sort()).toEqual(['execute', 'executeMutation', 'transaction']);
    expect(Object.isFrozen(executor)).toBe(true);

    // The executor handed to a unit of work carries the same three, so a
    // repository cannot tell the two apart by shape.
    const innerKeys = await executor.transaction((tx) => Promise.resolve(Object.keys(tx).sort()));

    expect(innerKeys).toEqual(['execute', 'executeMutation', 'transaction']);
  });
});

// --- S-12: multi-row tuple bodies are bounded before they are allocated --------

describe('sqlTuplePlaceholderList - the multi-row VALUES guard (S-12)', () => {
  // Two link-table writers built a `VALUES` body by repeating a two-placeholder tuple once per
  // collection member, validating neither the count nor the width before allocating. The member
  // count originates in a caller-supplied collection, so it decided the size of one allocation.
  //
  // WHY THESE TESTS LIVE HERE RATHER THAN IN THE TWO REPOSITORY SUITES. Those suites assert the
  // statement each adapter emits for a realistic membership, and they pass UNCHANGED after this
  // fix - which is the point: for every real collection the emitted SQL is byte-identical. The
  // behaviour that is new is what happens at and beyond the boundary, and that belongs to the
  // shared builder rather than being asserted twice against two callers.

  it('renders one tuple per row, parentheses included', () => {
    expect(sqlTuplePlaceholderList(2, 1)).toBe('(?, ?)');
    expect(sqlTuplePlaceholderList(2, 3)).toBe('(?, ?), (?, ?), (?, ?)');
    expect(sqlTuplePlaceholderList(1, 2)).toBe('(?), (?)');
    expect(sqlTuplePlaceholderList(3, 2)).toBe('(?, ?, ?), (?, ?, ?)');
  });

  it('accepts both dimensions AT their ceilings, so the limit is inclusive', () => {
    // A ceiling that rejected its own stated maximum would be an off-by-one that only shows up at
    // the one input nobody tries by hand.
    expect(() => sqlTuplePlaceholderList(MAX_TUPLE_ROW_WIDTH, 1)).not.toThrow();
    expect(() => sqlTuplePlaceholderList(2, SQL_TUPLE_ROW_LIMIT)).not.toThrow();

    const atRowCeiling = sqlTuplePlaceholderList(2, SQL_TUPLE_ROW_LIMIT);

    expect(atRowCeiling.split('), (')).toHaveLength(SQL_TUPLE_ROW_LIMIT);
  });

  it('★★ REFUSES A COUNT ABOVE THE BATCH CEILING rather than allocating for it', () => {
    expect(() => sqlTuplePlaceholderList(2, SQL_TUPLE_ROW_LIMIT + 1)).toThrow(/row count/u);
  });

  it('refuses a width no in-scope link table could have', () => {
    expect(() => sqlTuplePlaceholderList(MAX_TUPLE_ROW_WIDTH + 1, 1)).toThrow(/row width/u);
  });

  it('refuses zero rather than rendering an unparseable VALUES body', () => {
    // `VALUES` with no rows is a parse error, not an empty write, so the caller must skip the
    // insert. That decision belongs to the caller because it also governs whether the preceding
    // delete is the whole operation.
    expect(() => sqlTuplePlaceholderList(2, 0)).toThrow(/row count/u);
    expect(() => sqlTuplePlaceholderList(0, 2)).toThrow(/row width/u);
  });

  it('refuses non-integers and negatives on both dimensions', () => {
    for (const rejected of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => sqlTuplePlaceholderList(2, rejected)).toThrow(/row count/u);
      expect(() => sqlTuplePlaceholderList(rejected, 2)).toThrow(/row width/u);
    }
  });

  it('★★ VALIDATES BEFORE ALLOCATING, which is the entire point of the guard', () => {
    // `Number.MAX_SAFE_INTEGER` passes `Number.isSafeInteger`, so the ONLY thing standing between
    // this call and a multi-gigabyte allocation is the range check preceding it. A guard placed
    // after `new Array(rowCount)` would already have committed the memory it exists to refuse, so
    // this case is the difference between a rejected request and a dead container.
    //
    // ★★★ HOW THAT IS PROVEN, AND WHY IT IS NO LONGER A STOPWATCH. This case used to assert
    // `Date.now() - started < 1000`, which a code review correctly read as an INVENTED
    // NON-FUNCTIONAL REQUIREMENT: AAP 0.8.1 forbids asserting a latency figure the legacy system
    // never stated, and a wall-clock bound is also the one assertion here that a loaded CI host can
    // fail without anything being wrong. The structural evidence replaces it.
    //
    // THE SIGNATURE OF A COMPARISON IS THAT ITS OUTCOME DOES NOT DEPEND ON MAGNITUDE. One row above
    // the ceiling, a thousand times the ceiling and the largest integer JavaScript can represent
    // exactly are refused IDENTICALLY - same error class, same name, same dimension - and each
    // reports back the value it was given. An implementation that allocated first could not produce
    // that: `new Array(Number.MAX_SAFE_INTEGER)` throws a `RangeError` naming an invalid array
    // length, and a merely large count would exhaust the heap instead of returning a typed refusal.
    // So the assertions below distinguish "refused by the range check" from "died in the
    // allocation" without measuring anything.
    const refusals = [
      SQL_TUPLE_ROW_LIMIT + 1,
      SQL_TUPLE_ROW_LIMIT * 1000,
      Number.MAX_SAFE_INTEGER,
    ].map((rowCount) => {
      try {
        sqlTuplePlaceholderList(2, rowCount);
        return { name: 'no error', dimension: undefined, value: undefined };
      } catch (error) {
        return {
          name: (error as Error).name,
          dimension: (error as { dimension?: unknown }).dimension,
          value: (error as { value?: unknown }).value,
        };
      }
    });

    expect(refusals).toStrictEqual([
      { name: 'SqlTupleShapeError', dimension: 'rowCount', value: SQL_TUPLE_ROW_LIMIT + 1 },
      { name: 'SqlTupleShapeError', dimension: 'rowCount', value: SQL_TUPLE_ROW_LIMIT * 1000 },
      { name: 'SqlTupleShapeError', dimension: 'rowCount', value: Number.MAX_SAFE_INTEGER },
    ]);

    // And the width dimension is guarded the same way, in the same order: a call that is out of
    // range on BOTH dimensions is refused on the WIDTH, because that check comes first
    // [src/repositories/mysql/connection.ts:L943-L954]. Guard ORDER is observable through which
    // dimension the refusal names, so it needs no timing either.
    try {
      sqlTuplePlaceholderList(MAX_TUPLE_ROW_WIDTH + 1, Number.MAX_SAFE_INTEGER);
      expect.unreachable('both dimensions are out of range, so this must be refused');
    } catch (error) {
      expect((error as { dimension?: unknown }).dimension).toBe('rowWidth');
    }
  });

  it('names the dimension it rejected, for programmatic inspection', () => {
    try {
      sqlTuplePlaceholderList(2, 0);
      expect.unreachable('a zero row count must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('SqlTupleShapeError');
      expect((error as { dimension?: unknown }).dimension).toBe('rowCount');
      expect((error as { value?: unknown }).value).toBe(0);
    }
  });

  it('keeps its own limits consistent with the protocol placeholder ceiling', () => {
    // The derived invariant the module asserts once at load, restated here against the two exported
    // constants so that raising either without re-checking the product fails a test as well as an
    // import. 65,535 is the two-byte placeholder count of `COM_STMT_PREPARE_OK`.
    expect(MAX_TUPLE_ROW_WIDTH * SQL_TUPLE_ROW_LIMIT).toBeLessThanOrEqual(65535);
  });
});

describe('chunkTupleRows - batching without refusing legitimate writes (S-12)', () => {
  it('returns one batch when the collection fits, so real writes emit one statement', () => {
    // The property that makes the ceiling safe to impose: every realistic membership - a SKU's
    // option rows are one per option group, a rate's exclusion lists are curated by hand - yields a
    // single batch, and therefore exactly the statement the adapter emitted before this fix.
    expect(chunkTupleRows(['a'])).toStrictEqual([['a']]);
    expect(chunkTupleRows(['a', 'b', 'c'])).toStrictEqual([['a', 'b', 'c']]);
  });

  it('still returns ONE batch at exactly the ceiling', () => {
    const rows = Array.from({ length: SQL_TUPLE_ROW_LIMIT }, (_unused, index) => index);

    expect(chunkTupleRows(rows)).toHaveLength(1);
  });

  it('★★ SPLITS BEYOND THE CEILING rather than refusing the write', () => {
    // A ceiling that rejected large collections would be a behaviour change; chunking is not. AAP
    // 0.6.5 asks for "explicit batch limits", not for a smaller maximum membership.
    const rows = Array.from({ length: SQL_TUPLE_ROW_LIMIT + 1 }, (_unused, index) => index);
    const batches = chunkTupleRows(rows);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(SQL_TUPLE_ROW_LIMIT);
    expect(batches[1]).toHaveLength(1);
  });

  it('preserves order and loses no member, so the end state is the unsplit one', () => {
    const rows = Array.from({ length: SQL_TUPLE_ROW_LIMIT * 2 + 7 }, (_unused, index) => index);
    const batches = chunkTupleRows(rows);

    expect(batches).toHaveLength(3);
    expect(batches.flatMap((batch) => [...batch])).toStrictEqual(rows);
  });

  it('every batch is a shape the tuple builder will accept', () => {
    // The two halves have to agree: a batch the chunker produced but the builder refused would turn
    // a large write into a runtime failure instead of several statements.
    const rows = Array.from({ length: SQL_TUPLE_ROW_LIMIT * 2 + 7 }, (_unused, index) => index);

    for (const batch of chunkTupleRows(rows)) {
      expect(() => sqlTuplePlaceholderList(2, batch.length)).not.toThrow();
    }
  });

  it('refuses an empty collection, leaving that decision to the caller', () => {
    expect(() => chunkTupleRows([])).toThrow(/row count/u);
  });
});

// ===========================================================================
// The audit-actor gate, and the two helpers that keep it from being restated.
//
// NET-NEW COVERAGE. The legacy gate lived in `HibachiEntity.preInsert` and
// `preUpdate` and had no test; this is the ported gate, not a parity claim.
// ===========================================================================

describe('resolveAuditActorAccountID - the legacy persisted-account AND admin-flag gate', () => {
  /** An actor that passes both halves of the gate. */
  const stampingActor: AuditActorContext = { accountID: 'account-42', adminAccountFlag: true };

  it('stamps the account when it is persisted AND carries the admin flag', () => {
    // Both conditions of [org/Hibachi/HibachiEntity.cfc:L628] and [:L633] hold, so the write is
    // attributed - and the identifier comes back unchanged rather than normalised.
    expect(resolveAuditActorAccountID(stampingActor)).toBe('account-42');
  });

  it('refuses a non-admin account even when it is persisted', () => {
    // The legacy never reached `setModifiedByAccount` for a non-admin, so the target must resolve
    // nothing. Returning the identifier here would attribute a write the legacy left unattributed.
    expect(resolveAuditActorAccountID({ accountID: 'account-42', adminAccountFlag: false })).toBe(
      undefined,
    );
  });

  it('refuses an admin with no persisted account, which is the legacy new-account case', () => {
    // `getAccount().isNew()` handed back an empty object with no identifier to stamp; modelling the
    // absence directly is what replaces that object.
    expect(resolveAuditActorAccountID({ adminAccountFlag: true })).toBe(undefined);
    expect(resolveAuditActorAccountID({ accountID: undefined, adminAccountFlag: true })).toBe(
      undefined,
    );
  });

  it('★ refuses an EMPTY-STRING account identifier, which is not the same as an absent one', () => {
    // A distinct arm of the gate, and the one a caller reaches by accident: an empty string is a
    // present-but-meaningless identifier, and binding it would write a foreign key to '' rather than
    // leaving the column unattributed.
    expect(resolveAuditActorAccountID({ accountID: '', adminAccountFlag: true })).toBe(undefined);
  });

  it('and the unattributed default resolves to nothing, is frozen, and names no account', () => {
    expect(UNATTRIBUTED_AUDIT_ACTOR.adminAccountFlag).toBe(false);
    expect(UNATTRIBUTED_AUDIT_ACTOR.accountID).toBe(undefined);
    expect(Object.isFrozen(UNATTRIBUTED_AUDIT_ACTOR)).toBe(true);
    expect(resolveAuditActorAccountID(UNATTRIBUTED_AUDIT_ACTOR)).toBe(undefined);
  });
});

describe('sqlUpdateAssignment - COALESCE for the audit columns, a plain bind for every other', () => {
  it('★★ resolves each audit column against ITS OWN STORED VALUE rather than binding null over it', () => {
    // The whole reason this is SQL rather than TypeScript: a refused gate binds null, and a plain
    // `?` would then DESTROY an attribution the legacy preserved, because Hibernate rewrote the
    // loaded value unchanged when the setter was never reached.
    expect(sqlUpdateAssignment('createdByAccountID')).toBe(
      'createdByAccountID = COALESCE(?, createdByAccountID)',
    );
    expect(sqlUpdateAssignment('modifiedByAccountID')).toBe(
      'modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
    );
  });

  it('renders an ordinary column as a plain single-placeholder assignment', () => {
    expect(sqlUpdateAssignment('productName')).toBe('productName = ?');
    expect(sqlUpdateAssignment('modifiedDateTime')).toBe('modifiedDateTime = ?');
    // A column whose name merely CONTAINS an audit column's name is not one of them.
    expect(sqlUpdateAssignment('createdByAccountIDPath')).toBe('createdByAccountIDPath = ?');
  });

  it('and the special set is exactly the two audit columns, frozen, with no third member', () => {
    // Exported so no repository restates the literals, and asserted as a SET so a third column
    // cannot be added to the COALESCE treatment without this failing.
    expect([...AUDIT_ACTOR_COLUMNS]).toStrictEqual(['createdByAccountID', 'modifiedByAccountID']);
    expect(Object.isFrozen(AUDIT_ACTOR_COLUMNS)).toBe(true);

    for (const column of AUDIT_ACTOR_COLUMNS) {
      expect(sqlUpdateAssignment(column)).toBe(`${column} = COALESCE(?, ${column})`);
    }
  });

  it('matches the column name EXACTLY, which is why the roster is exported rather than retyped', () => {
    // Recorded behaviour rather than a latent defect: every statement in this port spells its
    // columns in the one canonical casing the entity metadata uses, and each takes the name from
    // `AUDIT_ACTOR_COLUMNS` or from that metadata. A differently-cased spelling would therefore be a
    // caller defect, and it takes the plain arm - which this case pins so the comparison's
    // case-sensitivity is a stated property instead of a surprise.
    expect(sqlUpdateAssignment('CreatedByAccountID')).toBe('CreatedByAccountID = ?');
  });
});

describe('resolveStampedModifiedByAccountID - the TypeScript mirror of that COALESCE', () => {
  it('★★ reports the NEW actor when the gate passes, so the echoed row matches the written row', () => {
    expect(
      resolveStampedModifiedByAccountID(
        { accountID: 'admin-new', adminAccountFlag: true },
        'admin-previous',
      ),
    ).toBe('admin-new');
  });

  it('★★ reports the PREVIOUSLY STORED value when the gate refuses, never null', () => {
    // This is the pairing that matters: the statement's COALESCE preserved the stored value, so an
    // entity echoing null here would claim the port erased an attribution it kept.
    expect(
      resolveStampedModifiedByAccountID(
        { accountID: 'non-admin', adminAccountFlag: false },
        'admin-previous',
      ),
    ).toBe('admin-previous');
  });

  it('reports nothing when the gate refuses and the row held nothing', () => {
    expect(resolveStampedModifiedByAccountID(UNATTRIBUTED_AUDIT_ACTOR, undefined)).toBe(undefined);
  });

  it('and an empty-string actor identifier falls back to the stored value, exactly as the gate does', () => {
    expect(
      resolveStampedModifiedByAccountID(
        { accountID: '', adminAccountFlag: true },
        'admin-previous',
      ),
    ).toBe('admin-previous');
  });
});

// ===========================================================================
// Placeholder admission: the protocol ceiling, and the IN-list body.
// ===========================================================================

describe('isPreparablePlaceholderCount - the two-byte protocol ceiling, checkable EARLY (F17)', () => {
  it('states the ceiling as the protocol fact it is', () => {
    // `COM_STMT_PREPARE_OK` reports a placeholder count in a two-byte little-endian field, so this
    // is the most any statement can carry. It is not a capacity target and must not become one.
    expect(MAX_PLACEHOLDER_COUNT).toBe(65535);
    expect(MAX_PLACEHOLDER_COUNT).toBe(2 ** 16 - 1);
  });

  it('accepts everything the server would accept, INCLUDING the ceiling itself', () => {
    expect(isPreparablePlaceholderCount(1)).toBe(true);
    expect(isPreparablePlaceholderCount(1000)).toBe(true);
    expect(isPreparablePlaceholderCount(MAX_PLACEHOLDER_COUNT)).toBe(true);
  });

  it('★ accepts ZERO, because a statement carrying no placeholders is preparable', () => {
    // The asymmetry against `sqlPlaceholderList` below is deliberate and is the reason both exist:
    // this is a feasibility test on a statement's width, while rendering an EMPTY list would emit
    // the unparseable `IN ()`. A caller checks feasibility early and still short-circuits an empty
    // collection itself.
    expect(isPreparablePlaceholderCount(0)).toBe(true);
    expect(() => sqlPlaceholderList(0)).toThrow(/placeholder count/u);
  });

  it('refuses anything above the ceiling, and every value that is not a safe integer count', () => {
    expect(isPreparablePlaceholderCount(MAX_PLACEHOLDER_COUNT + 1)).toBe(false);
    expect(isPreparablePlaceholderCount(Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(isPreparablePlaceholderCount(-1)).toBe(false);
    expect(isPreparablePlaceholderCount(1.5)).toBe(false);
    expect(isPreparablePlaceholderCount(Number.NaN)).toBe(false);
    expect(isPreparablePlaceholderCount(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('★★ is a test on the COUNT alone, so nothing it admits is trimmed, sorted or deduplicated', () => {
    // The property that keeps the guard from changing which rows a statement matches: the number of
    // members decides feasibility, and the members themselves are never touched by it. A list of
    // duplicates and a list of distinct values of the same length are equally preparable.
    expect(isPreparablePlaceholderCount(['a', 'a', 'a'].length)).toBe(true);
    expect(isPreparablePlaceholderCount(['a', 'b', 'c'].length)).toBe(true);
    expect(sqlPlaceholderList(3)).toBe('?, ?, ?');
  });
});

describe('sqlPlaceholderList - the IN-list body, and its guard order', () => {
  it('renders one placeholder per bound value, without the surrounding parentheses', () => {
    // The parentheses stay in the caller's own SQL, so the predicate reads as SQL at the call site.
    expect(sqlPlaceholderList(1)).toBe('?');
    expect(sqlPlaceholderList(2)).toBe('?, ?');
    expect(sqlPlaceholderList(4)).toBe('?, ?, ?, ?');
  });

  it('renders AT the protocol ceiling, so the bound is inclusive there too', () => {
    const atCeiling = sqlPlaceholderList(MAX_PLACEHOLDER_COUNT);

    expect(atCeiling.split(', ')).toHaveLength(MAX_PLACEHOLDER_COUNT);
    expect(atCeiling.startsWith('?, ?')).toBe(true);
    expect(atCeiling.endsWith('?')).toBe(true);
  });

  it('refuses zero, which would render the unparseable IN () rather than an empty predicate', () => {
    // The legacy branched the same way at model/dao/PromotionDAO.cfc:L121 and :L125, so the caller
    // owns the short-circuit and this refusal is what stops it being forgotten.
    try {
      sqlPlaceholderList(0);
      expect.unreachable('a zero-length IN list must be refused');
    } catch (error) {
      expect((error as Error).name).toBe('SqlPlaceholderCountError');
      expect((error as { count?: unknown }).count).toBe(0);
    }
  });

  it('★★ REFUSES BY COMPARISON RATHER THAN BY TRAVERSAL, at every magnitude above the ceiling', () => {
    // The same structural evidence the tuple builder gets, and for the same reason: no wall-clock
    // bound appears here, because a latency figure would be an invented requirement (AAP 0.8.1).
    // Identical refusals across three magnitudes are what a range check produces; an implementation
    // that allocated first would throw a RangeError for the largest and exhaust the heap for the
    // middle one.
    const refusals = [
      MAX_PLACEHOLDER_COUNT + 1,
      MAX_PLACEHOLDER_COUNT * 1000,
      Number.MAX_SAFE_INTEGER,
    ].map((count) => {
      try {
        sqlPlaceholderList(count);
        return { name: 'no error', count: undefined };
      } catch (error) {
        return { name: (error as Error).name, count: (error as { count?: unknown }).count };
      }
    });

    expect(refusals).toStrictEqual([
      { name: 'SqlPlaceholderCountError', count: MAX_PLACEHOLDER_COUNT + 1 },
      { name: 'SqlPlaceholderCountError', count: MAX_PLACEHOLDER_COUNT * 1000 },
      { name: 'SqlPlaceholderCountError', count: Number.MAX_SAFE_INTEGER },
    ]);
  });

  it('refuses negatives and non-integers, naming the rejected count for inspection', () => {
    for (const rejected of [-1, 0.5, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        sqlPlaceholderList(rejected);
        expect.unreachable(`${String(rejected)} must be refused`);
      } catch (error) {
        expect((error as Error).name).toBe('SqlPlaceholderCountError');
        expect((error as { count?: unknown }).count).toBe(rejected);
      }
    }
  });

  it('and its message tells a caller what to do instead of just that it failed', () => {
    // The refusal is a programming error, so the message carries the remedy: short-circuit the
    // empty list, and note that a wider statement could not be prepared by the server either.
    try {
      sqlPlaceholderList(0);
      expect.unreachable('a zero-length IN list must be refused');
    } catch (error) {
      const message = (error as Error).message;

      expect(message).toContain('IN ()');
      expect(message).toContain(String(MAX_PLACEHOLDER_COUNT));
      expect(message).toContain('model/dao/PromotionDAO.cfc:L121');
    }
  });
});

// ===========================================================================
// The pool lifecycle - refusals only, so no pool is ever built.
//
// EVERY CASE SETS THE WHOLE ENVIRONMENT IT NEEDS. `tests/setup.ts` states that no
// test may depend on a `.env` file or on any DB_* value being set, and these cases
// honour that in the stronger direction too: because each names DB_DIALECT itself,
// the refusal is reached whether the host has a live datasource configured or not.
// ===========================================================================

describe('getConnectionPool and getPreparedStatementExecutor - refusal before construction', () => {
  /**
   * The five variables that have no default, with `DB_DIALECT` chosen by the caller.
   *
   * A dialect this port does not implement is what makes the case hermetic:
   * `getConnectionPool` resolves the dialect and calls `assertMySqlDialect` BEFORE
   * `createPool`, so nothing here can construct a pool or open a socket.
   */
  const stubDatabaseEnvironment = (dialect: string, host = '127.0.0.1'): void => {
    vi.stubEnv('DB_HOST', host);
    vi.stubEnv('DB_USER', 'connection_suite_user');
    vi.stubEnv('DB_PASSWORD', 'connection_suite_password');
    vi.stubEnv('DB_TLS_MODE', 'disabled');
    vi.stubEnv('DB_DIALECT', dialect);
  };

  beforeEach(() => {
    // `appConfig` memoizes the process-environment read, so the memo is cleared on the way in as
    // well as on the way out: a sibling file that ran earlier in this worker must not be able to
    // hand a configuration to a case here, and a case here must not leave one behind.
    appConfig.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    appConfig.reset();
  });

  it('★★ REFUSES A NON-MYSQL DIALECT, naming the site, before any pool is constructed', () => {
    // The legacy host could not make this mistake: it probed the live datasource for its product
    // name [config/configORM.cfm:L3]. Replacing the probe with configuration is what creates the
    // possibility of a MySQL driver pool being opened against a dialect that is not MySQL - which
    // would connect successfully and then fail on statement syntax deep inside a repository.
    stubDatabaseEnvironment('Oracle10g');

    try {
      getConnectionPool();
      expect.unreachable('a non-MySQL dialect must be refused before a pool is built');
    } catch (error) {
      expect((error as Error).name).toBe('UnsupportedDialectError');
      expect((error as Error).message).toContain('Oracle10g');
    }

    // ★★ AND "BEFORE ANY POOL IS CONSTRUCTED" IS OBSERVED RATHER THAN ASSUMED. The driver's pool
    // factory is the mocked module member above, so this is a direct witness: the refusal happened
    // and `createPool` was never reached. Asserting only the thrown error would leave the ORDER to
    // be read out of the source, and a revision that built the pool first would still throw.
    expect(driverCreatePool).not.toHaveBeenCalled();
  });

  it('refuses the other unimplemented dialect the legacy probe recognised', () => {
    stubDatabaseEnvironment('MicrosoftSQLServer');

    expect(() => getConnectionPool()).toThrow(/MicrosoftSQLServer/u);
  });

  it('★ refuses AGAIN on a second call, so a refused acquisition memoizes nothing', () => {
    // The memo is what makes the pool a per-container singleton, and a half-built one would be
    // worse than none: a later call must re-run the guard rather than inherit a failure.
    stubDatabaseEnvironment('Oracle10g');

    expect(() => getConnectionPool()).toThrow(/Oracle10g/u);
    expect(() => getConnectionPool()).toThrow(/Oracle10g/u);
  });

  it('★★ refuses an UNSATISFIED ENVIRONMENT before it ever reaches the dialect check', () => {
    // The hard stop the legacy `<cfdbinfo>` failure produced [config/configORM.cfm] is preserved:
    // nothing substitutes a default, retries, or degrades. An empty DB_HOST is a present-but-invalid
    // value, which is the shape a misconfigured deployment actually has.
    stubDatabaseEnvironment('MySQL', '');

    try {
      getConnectionPool();
      expect.unreachable('an unsatisfied environment contract must stop the acquisition');
    } catch (error) {
      expect((error as Error).name).toBe('ConfigurationError');
      expect((error as Error).message).toContain('DB_HOST');
    }
  });

  it('★ propagates that refusal through the executor accessor, which is the composition seam', () => {
    // `getPreparedStatementExecutor` is the one line the composition root uses, so a misconfigured
    // deployment must fail THERE rather than handing back an executor whose first statement dies.
    stubDatabaseEnvironment('Oracle10g');

    expect(() => getPreparedStatementExecutor()).toThrow(/Oracle10g/u);
    expect(() => getPreparedStatementExecutor()).toThrow(/UnsupportedDialectError|Oracle10g/u);
  });

  it('and the refusal names the pool-creation site, so the gap is attributable', () => {
    stubDatabaseEnvironment('Oracle10g');

    try {
      getPreparedStatementExecutor();
      expect.unreachable('a non-MySQL dialect must be refused');
    } catch (error) {
      // The site string is what tells an operator WHICH arm refused, rather than leaving them to
      // guess between a pool, a statement fragment and a repository.
      expect((error as Error).message.toLowerCase()).toContain('pool');
    }
  });
});

describe('closeConnectionPool - safe in an unconditional cleanup hook', () => {
  afterEach(() => {
    appConfig.reset();
  });

  it('★ resolves and does nothing when no pool was ever created', () => {
    // The state a refused acquisition leaves behind, and the state this block runs in: nothing was
    // ever constructed, so there is nothing to end. A harness that calls this in an `afterAll` must
    // not fail because the run never touched a database.
    return expect(closeConnectionPool()).resolves.toBeUndefined();
  });

  it('is idempotent, so a cleanup hook may run after another cleanup hook', async () => {
    await expect(closeConnectionPool()).resolves.toBeUndefined();
    await expect(closeConnectionPool()).resolves.toBeUndefined();
  });

  it('★★ leaves the module rebuildable rather than permanently closed', async () => {
    // The memoized bindings are cleared BEFORE the close is awaited, which is what lets a harness
    // close and reopen. Observable without a pool: after closing, an acquisition still runs the
    // guards from the top rather than reporting an already-closed pool.
    await closeConnectionPool();

    vi.stubEnv('DB_HOST', '127.0.0.1');
    vi.stubEnv('DB_USER', 'connection_suite_user');
    vi.stubEnv('DB_PASSWORD', 'connection_suite_password');
    vi.stubEnv('DB_TLS_MODE', 'disabled');
    vi.stubEnv('DB_DIALECT', 'Oracle10g');
    appConfig.reset();

    expect(() => getConnectionPool()).toThrow(/Oracle10g/u);

    vi.unstubAllEnvs();
    appConfig.reset();
  });
});

describe('getConnectionPool and getPreparedStatementExecutor - the accepted path', () => {
  /**
   * A pool the driver factory can hand back, recording only what this block asserts.
   *
   * WHY A FAKE IS ENOUGH, AND WHY IT IS NOT A COMPROMISE. What the accepted path decides is
   * WIRING, not driver behaviour: which object the module memoizes, how many times it asks the
   * factory for one, which pool the executor it hands the composition root is bound to, and what
   * `closeConnectionPool` does to it. Every one of those is observable through the object the
   * factory returned, and a real `mysql2` pool would add a socket without adding a single
   * assertion. Statement behaviour against a real driver result shape is covered by the
   * transactional blocks above, which use the richer fake at the top of this file.
   */
  const makeAcquirableFakePool = (): {
    readonly pool: Pool;
    readonly executed: string[];
    readonly ends: () => number;
  } => {
    const executed: string[] = [];
    let ends = 0;

    const pool = {
      execute: (sql: string): Promise<[readonly unknown[], never[]]> => {
        executed.push(sql);

        return Promise.resolve([[], []]);
      },
      end: (): Promise<void> => {
        ends += 1;

        return Promise.resolve();
      },
    };

    return { pool: pool as unknown as Pool, executed, ends: (): number => ends };
  };

  const stubMySqlEnvironment = (): void => {
    vi.stubEnv('DB_HOST', '127.0.0.1');
    vi.stubEnv('DB_USER', 'connection_suite_user');
    vi.stubEnv('DB_PASSWORD', 'connection_suite_password');
    vi.stubEnv('DB_TLS_MODE', 'disabled');
    vi.stubEnv('DB_DIALECT', 'MySQL');
  };

  beforeEach(() => {
    appConfig.reset();
    stubMySqlEnvironment();
  });

  afterEach(async () => {
    // The module memo is the one piece of state these cases create, so it is cleared here rather
    // than left for the next block - which asserts refusals and would otherwise inherit a pool.
    await closeConnectionPool();
    vi.unstubAllEnvs();
    appConfig.reset();
  });

  it('★★ hands back the pool the driver built, and builds exactly ONE for the container', () => {
    // The module-scope pool is the sanctioned exception AAP 0.6.5 describes: it survives warm
    // invocations on purpose, so a second acquisition must NOT construct a second pool.
    const { pool } = makeAcquirableFakePool();
    driverCreatePool.mockReturnValue(pool);

    expect(getConnectionPool()).toBe(pool);
    expect(getConnectionPool()).toBe(pool);
    expect(driverCreatePool).toHaveBeenCalledTimes(1);
  });

  it('★★ binds the executor to that same pool, and memoizes the executor too', async () => {
    // This is the composition seam: `src/handlers/bootstrap.ts` calls this once and every
    // repository shares the result, so a second call returning a second executor would quietly
    // give two repositories two bindings.
    const { pool, executed } = makeAcquirableFakePool();
    driverCreatePool.mockReturnValue(pool);

    const executor = getPreparedStatementExecutor();

    expect(getPreparedStatementExecutor()).toBe(executor);
    expect(driverCreatePool).toHaveBeenCalledTimes(1);

    // Bound to THAT pool, proven by where the statement lands rather than by identity alone.
    await executor.execute('SELECT 1 FROM SwSku WHERE skuID = ?', ['sku-1']);

    expect(executed).toStrictEqual(['SELECT 1 FROM SwSku WHERE skuID = ?']);
  });

  it('exposes exactly the three contract methods, frozen, on the executor it publishes', () => {
    const { pool } = makeAcquirableFakePool();
    driverCreatePool.mockReturnValue(pool);

    const executor = getPreparedStatementExecutor();

    expect(Object.keys(executor).sort()).toStrictEqual([
      'execute',
      'executeMutation',
      'transaction',
    ]);
    expect(Object.isFrozen(executor)).toBe(true);
  });

  it('★★ ENDS the pool on close, exactly once, and leaves the module rebuildable', async () => {
    const first = makeAcquirableFakePool();
    driverCreatePool.mockReturnValue(first.pool);

    getPreparedStatementExecutor();

    await closeConnectionPool();

    expect(first.ends()).toBe(1);

    // Rebuildable rather than permanently closed: the memo was cleared BEFORE the close was
    // awaited, so a harness that closes and reopens gets a NEW pool rather than the ended one.
    const second = makeAcquirableFakePool();
    driverCreatePool.mockReturnValue(second.pool);

    expect(getConnectionPool()).toBe(second.pool);
    expect(driverCreatePool).toHaveBeenCalledTimes(2);
  });

  it('and closing twice ends the pool once, because the second call has nothing to end', async () => {
    const { pool, ends } = makeAcquirableFakePool();
    driverCreatePool.mockReturnValue(pool);

    getConnectionPool();

    await closeConnectionPool();
    await closeConnectionPool();

    expect(ends()).toBe(1);
  });

  it('★ discards the executor along with the pool, so no executor outlives its pool', async () => {
    // A retained executor would hold a closed pool and fail on its first statement with an error
    // about the driver rather than about the lifecycle.
    const first = makeAcquirableFakePool();
    driverCreatePool.mockReturnValue(first.pool);

    const before = getPreparedStatementExecutor();

    await closeConnectionPool();

    const second = makeAcquirableFakePool();
    driverCreatePool.mockReturnValue(second.pool);

    const after = getPreparedStatementExecutor();

    expect(after).not.toBe(before);

    await after.execute('SELECT 1', []);

    expect(second.executed).toStrictEqual(['SELECT 1']);
    expect(first.executed).toStrictEqual([]);
  });
});
