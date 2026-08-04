/**
 * Characterization tests for the transactional surface of
 * `src/repositories/mysql/connection.ts`.
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

import { describe, expect, it } from 'vitest';

import type { Pool } from 'mysql2/promise';
import {
  chunkTupleRows,
  createPoolExecutor,
  MAX_TUPLE_ROW_WIDTH,
  SQL_TUPLE_ROW_LIMIT,
  sqlTuplePlaceholderList,
} from '../../../src/repositories/mysql/connection.js';
import type { PreparedStatementExecutor } from '../../../src/repositories/mysql/connection.js';

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
    const started = Date.now();

    expect(() => sqlTuplePlaceholderList(2, Number.MAX_SAFE_INTEGER)).toThrow(/row count/u);

    // Rejection is a comparison, not a traversal. A generous bound: an allocation of that size
    // could not complete in it.
    expect(Date.now() - started).toBeLessThan(1000);
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
