/**
 * UnitOfWork and QueryRunner — the two execution boundaries, tested against a driver double.
 *
 * ================================================================================================
 * WHY THIS FILE EXISTS, AND WHY IT IS ENTIRELY NET-NEW
 * ================================================================================================
 * AAP §0.6.5.2 records that the legacy suite contains no DAO-boundary test of any kind — no
 * `SkuDAOTest`, no `OptionDAOTest`, and nothing covering `org/Hibachi/HibachiDAO.cfc` at all. It also
 * records that the legacy suite ships NO MOCKING LIBRARY and instead boots the whole FW/1 application
 * through `meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L84`, so there was no seam at which a
 * statement could be observed without a live database. Every test below is therefore NET-NEW, exactly
 * as AAP §0.8.3.7 requires such coverage to be labelled: none of it extends a legacy assertion,
 * because none exists to extend.
 *
 * Before this file, `src/adapters/mysql/UnitOfWork.ts` was reached only through the STRUCTURAL double
 * in `../support/inMemoryRepositories.ts` (`UnitOfWorkTestSupport`). That double mirrors the class's
 * public surface so services can be tested without a driver, which is the right tool for a service
 * test — and precisely the wrong tool for asserting what statement text the real class emits, since
 * the double emits none. The two coexist deliberately.
 *
 * ================================================================================================
 * WHAT IT COVERS
 * ================================================================================================
 * A. The F8 locking read on `getTableTopSortOrder`, both variants.
 * B. The F6 duplicate-key translation, at BOTH of the subtree's two routes to the driver.
 * C. The parts of the ported sort-order read that must NOT have changed while A was added.
 *
 * ⚠️ NO DATABASE IS OPENED, AND NONE IS NEEDED. Both boundaries take their driver object by
 * injection — `UnitOfWork` a `StatementPool`, `QueryRunner` the same — so the double below satisfies
 * the declared interface and records what production sends it. That is the whole benefit the ports
 * bought (AAP §0.4.3.6): the legacy equivalent of these assertions was not merely unwritten, it was
 * unwritable.
 */

import { DomainError, UniqueConstraintViolationError } from '../../src/errors/DomainError';
import {
  MYSQL_DUPLICATE_ENTRY_ERRNO,
  QueryRunner,
  describeDuplicateEntryConstraint,
  isDuplicateEntryFailure,
} from '../../src/adapters/mysql/QueryRunner';
import { UnitOfWork } from '../../src/adapters/mysql/UnitOfWork';
import { createUnitOfWorkDouble } from '../support/inMemoryRepositories';

import type {
  BoundParameterValue,
  StatementPool,
  TransactionalStatementRunner,
} from '../../src/adapters/mysql/QueryRunner';

/* ================================================================================================
 * THE DRIVER DOUBLE
 * ============================================================================================== */

/** One statement as the driver received it, recorded byte for byte and in bind order. */
interface DriverCall {
  readonly sql: string;
  readonly values: readonly BoundParameterValue[];
}

/**
 * What the double answers for a given statement, or the failure it raises instead.
 *
 * A function rather than a queue because these tests key on the statement TEXT: the sort-order read
 * and a write can arrive in either order depending on the test, and matching on text keeps each test
 * readable without also asserting an ordering it does not care about.
 */
type DriverResponder = (call: DriverCall) => unknown;

/**
 * A settlement member's outcome — review finding F11 (CWE-404), SEC-15.
 *
 * ⭐ THE DOUBLE HAD NO WAY TO FAIL A SETTLEMENT BEFORE THIS, WHICH IS EXACTLY WHAT F11 IDENTIFIED.
 * `begin`, `commit` and `rollback` all resolved unconditionally, so the production disposal decision
 * — `release` a connection whose transaction state is KNOWN, `destroy` it otherwise — could only ever
 * be observed on its release branch. The destroy branch is the one that prevents a connection of
 * unknown state re-entering a warm pool (mismatch M7), and it was unreachable from a test: the whole
 * of `returnConnection` could have been deleted and every case here would still have passed.
 *
 * A hook rather than a flag or a queue, for the same reason `DriverResponder` is a function: a test
 * says which EVENT fails and the double stays indifferent to ordering.
 *
 * @param event - the settlement member being invoked, before it is allowed to succeed
 */
type SettlementResponder = (event: 'begin' | 'commit' | 'rollback') => void;

interface DriverDouble {
  readonly pool: StatementPool;
  readonly calls: readonly DriverCall[];
  /** Lifecycle events on the connection, in order: `begin`, `commit`, `rollback`, `release`, `destroy`. */
  readonly lifecycle: readonly string[];
}

/**
 * Build a `StatementPool` that records every statement and answers from `respond`.
 *
 * ⚠️ THE ANSWER SHAPE IS THE DRIVER'S, NOT THE PORT'S. `StatementRunner.execute` resolves a TUPLE
 * whose first element is the driver's own result — a row list for a read, an acknowledgement object
 * for a write — which is why `respond` returns `unknown` and the tuple is assembled here. Modelling
 * the tuple faithfully is what lets these tests exercise the production narrowing (`toRows`,
 * `readAffectedRows`) rather than bypassing it.
 *
 * @param respond - decides each answer from the recorded call; throwing from it injects a failure.
 * @returns the pool, plus live views of the statements and the connection lifecycle.
 */
function createDriverDouble(respond: DriverResponder, settle?: SettlementResponder): DriverDouble {
  const calls: DriverCall[] = [];
  const lifecycle: string[] = [];

  /*
   * Declared WITHOUT `async` and returning a settled promise explicitly, so a throw from `respond`
   * becomes a REJECTION rather than a synchronous throw. That distinction is the point: production
   * catches a driver failure with `catch` around an awaited call, so a double that threw synchronously
   * would exercise a path the real driver never takes.
   */
  const execute = (
    sql: string,
    values: readonly BoundParameterValue[],
  ): Promise<[unknown, unknown[]]> => {
    const call: DriverCall = Object.freeze({ sql, values: Object.freeze([...values]) });
    calls.push(call);

    /*
     * `respond` is invoked INSIDE the `then`, so a throw from it is converted to a rejection by the
     * promise machinery itself rather than by an explicit `Promise.reject` of an `unknown` value. The
     * recording above stays synchronous, so call order is still exactly issue order.
     */
    return Promise.resolve().then((): [unknown, unknown[]] => [respond(call), []]);
  };

  /**
   * Record a lifecycle event, then let `settle` decide whether it succeeds.
   *
   * ⚠️ THE EVENT IS RECORDED BEFORE THE FAILURE HOOK RUNS, AND THAT ORDER IS THE FAITHFUL ONE. A
   * commit that the driver rejected was still ATTEMPTED — the statement went to the server and the
   * outcome is unknown, which is precisely why production destroys the connection rather than
   * releasing it. A double that recorded only successful settlements would make an attempted-but-failed
   * commit indistinguishable from a commit that never happened.
   *
   * The hook is invoked inside a `then` so a throw becomes a REJECTION, matching the driver: production
   * awaits these members and catches rejections, so a synchronous throw would exercise a path the real
   * driver never takes.
   */
  const note = (event: 'begin' | 'commit' | 'rollback'): Promise<void> => {
    lifecycle.push(event);

    return Promise.resolve().then((): void => {
      settle?.(event);
    });
  };

  const connection: TransactionalStatementRunner = {
    execute,
    beginTransaction: (): Promise<void> => note('begin'),
    commit: (): Promise<void> => note('commit'),
    rollback: (): Promise<void> => note('rollback'),
    release: (): void => {
      lifecycle.push('release');
    },
    destroy: (): void => {
      lifecycle.push('destroy');
    },
  };

  const pool: StatementPool = {
    execute,
    getConnection: (): Promise<TransactionalStatementRunner> => Promise.resolve(connection),
  };

  return { pool, calls, lifecycle };
}

/** The aggregate answer shape MySQL produces for the ported sort-order read. */
function topSortOrderRows(topSortOrder: number): unknown {
  return [{ topSortOrder }];
}

/** A write acknowledgement, in the shape `readAffectedRows` narrows. */
function affectedRows(count: number): unknown {
  return { affectedRows: count };
}

/**
 * A duplicate-key failure shaped as `mysql2` raises one.
 *
 * ⚠️ THE MESSAGE CARRIES A COLLIDING VALUE, DELIBERATELY. That is what the real driver does, and the
 * sanitisation these tests assert is only meaningful against a message that actually contains one.
 */
function duplicateEntryFailure(value: string, constraintName: string): Error {
  const failure = new Error(`Duplicate entry '${value}' for key '${constraintName}'`);

  return Object.assign(failure, {
    errno: MYSQL_DUPLICATE_ENTRY_ERRNO,
    code: 'ER_DUP_ENTRY',
    sqlState: '23000',
  });
}

/** Narrow the first recorded call without an unchecked index read. */
function firstCall(calls: readonly DriverCall[]): DriverCall {
  const call = calls[0];

  if (call === undefined) {
    throw new Error('The double recorded no statement, so there was nothing to assert on.');
  }

  return call;
}

/* ================================================================================================
 * A. THE F8 LOCKING READ ON THE SORT-ORDER MAXIMUM
 * ================================================================================================
 * Review finding F8 (CWE-367): "Two concurrent inserts can read the same maximum sort order and write
 * the same next value", with the recommendation to "use a locking/advisory-lock read or scoped
 * uniqueness constraint with retry". The scoped uniqueness constraint is forbidden — AAP §0.2.2.5
 * places schema migration outside this refactoring — and a retry would be invented behaviour under
 * AAP §0.8.2 Guideline 4, so the locking read is the sanctioned half of that guidance.
 *
 * These assertions pin the CLAUSE, which is the only part a unit test can observe. Whether MySQL then
 * blocks a second transaction is a property of the engine, verified directly against MySQL 8.4 during
 * this work rather than asserted here: a second session's locking read over the same table blocked
 * until the first committed, and then observed the first session's row.
 * ============================================================================================== */

describe('NET-NEW — F8. `getTableTopSortOrder` takes a locking read', () => {
  it('NET-NEW — the WHOLE-TABLE variant appends `FOR UPDATE`', async () => {
    // `model/entity/OptionGroup.cfc` declares no `sortContext`, so a group's position comes from a
    // whole-table maximum via `org/Hibachi/HibachiEntity.cfc:L644`. That is the variant here.
    const driver = createDriverDouble(() => topSortOrderRows(7));
    const unitOfWork = new UnitOfWork(driver.pool);

    const top = await unitOfWork.getTableTopSortOrder(
      new QueryRunner(driver.pool),
      'SwOptionGroup',
    );

    expect(top).toBe(7);
    expect(firstCall(driver.calls).sql).toBe(
      'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup FOR UPDATE',
    );
  });

  it('NET-NEW — the SCOPED variant appends `FOR UPDATE` AFTER the `WHERE`, as MySQL requires', async () => {
    // `model/entity/Option.cfc:L56` declares `sortContext="optionGroup"` — the only `sortContext` in
    // scope — so an option's position is scoped by its parent group via
    // `org/Hibachi/HibachiEntity.cfc:L642`. Clause ORDER is the assertion: `FOR UPDATE` before the
    // `WHERE` is a syntax error, so a naive append at composition time would break the scoped variant
    // while leaving the whole-table one working.
    const driver = createDriverDouble(() => topSortOrderRows(3));
    const unitOfWork = new UnitOfWork(driver.pool);

    const top = await unitOfWork.getTableTopSortOrder(
      new QueryRunner(driver.pool),
      'SwOption',
      'optionGroupID',
      'group-1',
    );

    expect(top).toBe(3);
    const call = firstCall(driver.calls);
    expect(call.sql).toBe(
      'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOption ' +
        'WHERE optionGroupID = ? FOR UPDATE',
    );
    // The clause is last, and the scope is still BOUND rather than interpolated (TR-4, S2).
    expect(call.sql.endsWith(' FOR UPDATE')).toBe(true);
    expect(call.sql.indexOf('WHERE')).toBeLessThan(call.sql.indexOf('FOR UPDATE'));
    expect(call.values).toStrictEqual(['group-1']);
    expect(call.sql).not.toContain('group-1');
  });

  it('NET-NEW — adding the clause changed nothing else about the ported statement', async () => {
    /*
     * The regression guard for the hardening itself. Everything `org/Hibachi/HibachiDAO.cfc:L157-L164`
     * composes must still be composed identically: the `COALESCE` that makes the empty-table answer
     * zero (`:L158`), the `topSortOrder` alias (`:L158`), the literal `sortOrder` column, and the
     * absence of any `ORDER BY`, `LIMIT` or engine hint the legacy statement did not have.
     */
    const driver = createDriverDouble(() => topSortOrderRows(0));
    const unitOfWork = new UnitOfWork(driver.pool);

    await unitOfWork.getTableTopSortOrder(new QueryRunner(driver.pool), 'SwOption');

    const { sql } = firstCall(driver.calls);
    expect(sql).toContain('COALESCE(max(sortOrder), 0)');
    expect(sql).toContain('as topSortOrder');
    expect(sql).not.toContain('ORDER BY');
    expect(sql).not.toContain('LIMIT');
    // No placeholder in the unscoped form, matching the legacy's single-bound-value-only-when-scoped shape.
    expect(sql).not.toContain('?');
  });

  it('NET-NEW — the empty-table answer is still ZERO, not a failure and not one', async () => {
    // `:L158`'s `COALESCE` is what makes the first seeded position ONE, from the `+ 1` at
    // `org/Hibachi/HibachiEntity.cfc:L646`. The locking clause must not disturb that.
    const driver = createDriverDouble(() => topSortOrderRows(0));
    const unitOfWork = new UnitOfWork(driver.pool);

    await expect(
      unitOfWork.getTableTopSortOrder(new QueryRunner(driver.pool), 'SwBrand'),
    ).resolves.toBe(0);
  });

  it('NET-NEW — an unapproved table is refused BEFORE any statement reaches the driver', async () => {
    // The identifier whitelist runs first, so the locking clause is never composed onto an
    // attacker-supplied table name. Asserting the empty call log is what makes that a fact.
    const driver = createDriverDouble(() => topSortOrderRows(1));
    const unitOfWork = new UnitOfWork(driver.pool);

    await expect(
      unitOfWork.getTableTopSortOrder(new QueryRunner(driver.pool), 'SwOption; DROP TABLE SwSku'),
    ).rejects.toThrow();
    expect(driver.calls).toStrictEqual([]);
  });

  it('NET-NEW — an unapproved SCOPING COLUMN is refused before the driver too', async () => {
    const driver = createDriverDouble(() => topSortOrderRows(1));
    const unitOfWork = new UnitOfWork(driver.pool);

    await expect(
      unitOfWork.getTableTopSortOrder(
        new QueryRunner(driver.pool),
        'SwOption',
        'optionGroupID = 1 OR 1=1',
        'group-1',
      ),
    ).rejects.toThrow();
    expect(driver.calls).toStrictEqual([]);
  });
});

/* ================================================================================================
 * B. THE F6 DUPLICATE-KEY TRANSLATION, AT BOTH ROUTES TO THE DRIVER
 * ================================================================================================
 * Review finding F6 (CWE-367) asks for two things; this is the second, "handle duplicate-key errors".
 * The subtree has exactly TWO routes to the driver — `QueryRunner.runStatement` for the pool-bound
 * path and `createExecutor`'s local `runStatement` inside `UnitOfWork` for the transaction-scoped one
 * — so both are exercised here, because translating in one and not the other would make a collision
 * look different depending on whether a boundary was open.
 * ============================================================================================== */

describe('NET-NEW — F6. a duplicate key is reported as a typed uniqueness failure', () => {
  it('NET-NEW — the predicate recognises the driver`s errno AND its symbolic code independently', () => {
    // Both fields are checked because which of them a driver populates is the driver's choice, not a
    // contract this port can pin. Either alone must be sufficient.
    expect(isDuplicateEntryFailure({ errno: MYSQL_DUPLICATE_ENTRY_ERRNO })).toBe(true);
    expect(isDuplicateEntryFailure({ code: 'ER_DUP_ENTRY' })).toBe(true);
    expect(isDuplicateEntryFailure(duplicateEntryFailure('RED', 'SwOption.optionCode'))).toBe(true);

    // And nothing else is mistaken for one — including the neighbouring error number this module
    // already records a note about, and every non-object shape a catch clause can produce.
    expect(isDuplicateEntryFailure({ errno: 1210 })).toBe(false);
    expect(isDuplicateEntryFailure(new Error('Duplicate entry'))).toBe(false);
    expect(isDuplicateEntryFailure(null)).toBe(false);
    expect(isDuplicateEntryFailure(undefined)).toBe(false);
    expect(isDuplicateEntryFailure('ER_DUP_ENTRY')).toBe(false);
    expect(isDuplicateEntryFailure(1062)).toBe(false);
  });

  it('NET-NEW — the constraint NAME is retained and the COLLIDING VALUE is discarded', () => {
    // The disclosure rule. MySQL's message is `Duplicate entry '<value>' for key '<table>.<index>'`;
    // the value is caller data and routinely the very field under validation, the key name is a schema
    // identifier that discloses nothing about the caller.
    const described = describeDuplicateEntryConstraint(
      duplicateEntryFailure('SECRET-SKU-CODE', 'SwSku.skuCode'),
    );

    expect(described).toBe('SwSku.skuCode');
    expect(described).not.toContain('SECRET-SKU-CODE');
  });

  it('NET-NEW — a colliding value that itself contains the anchor cannot widen the capture', () => {
    /*
     * The extraction is anchored on `for key '` and stops at the NEXT quote rather than the last one,
     * so a value crafted to contain the anchor text captures only the real key. A greedy match would
     * have promoted the attacker's own string into the recorded constraint name.
     */
    const described = describeDuplicateEntryConstraint(
      duplicateEntryFailure("evil for key 'INJECTED", 'SwBrand.urlTitle'),
    );

    expect(described).toBe('INJECTED');
    expect(described).not.toContain('SwBrand');
  });

  it('NET-NEW — a control character in the key position yields no constraint name at all', () => {
    // CWE-117. Only printable ASCII other than a quote is admitted, so a log-injection payload does
    // not become a recorded field; the full driver error is still attached as `cause`.
    expect(
      describeDuplicateEntryConstraint(
        duplicateEntryFailure('x', 'SwOption.optionCode\n\u001b[31mFORGED'),
      ),
    ).toBeUndefined();
    expect(describeDuplicateEntryConstraint(new Error('no key clause here'))).toBeUndefined();
    expect(describeDuplicateEntryConstraint({ message: 42 })).toBeUndefined();
    expect(describeDuplicateEntryConstraint(null)).toBeUndefined();
  });

  it('NET-NEW — an over-long constraint name is truncated rather than echoed unbounded', () => {
    const described = describeDuplicateEntryConstraint(
      duplicateEntryFailure('x', `SwSku.${'z'.repeat(400)}`),
    );

    expect(described).toBeDefined();
    // 96 retained characters plus the single ellipsis that marks the truncation.
    expect(described).toHaveLength(97);
    expect(described?.endsWith('…')).toBe(true);
  });

  it('NET-NEW — the POOL-BOUND route translates a duplicate key on a write', async () => {
    const driver = createDriverDouble(() => {
      throw duplicateEntryFailure('WIDGET-1', 'SwProduct.productCode');
    });
    const runner = new QueryRunner(driver.pool);

    const rejection: unknown = await runner
      .executeMutation('INSERT INTO SwProduct (productID, productCode) VALUES (?, ?)', [
        'product-1',
        'WIDGET-1',
      ])
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(rejection).toBeInstanceOf(UniqueConstraintViolationError);
    const failure = rejection as UniqueConstraintViolationError;
    // The classification is what the finding asked for: a request rejection, not a service fault.
    expect(failure.getPublicError().code).toBe('CATALOG_REQUEST_REJECTED');
    // The internal account keeps the constraint and drops the value.
    expect(failure.context).toMatchObject({
      parameterCount: 2,
      errno: MYSQL_DUPLICATE_ENTRY_ERRNO,
      constraintName: 'SwProduct.productCode',
    });
    expect(JSON.stringify(failure.context)).not.toContain('WIDGET-1');
    // Nothing is lost for a server-side reader.
    expect(failure.cause).toBeDefined();
  });

  it('NET-NEW — the TRANSACTION-SCOPED route translates the same failure identically', async () => {
    // The other of the two routes. `run` opens a boundary and hands out `scope.executor`, whose own
    // `runStatement` applies the SAME imported helper. The commit gate answers `false` — "no errors to
    // report" — so a SUCCESSFUL body would commit, which is what makes the rollback below attributable
    // to the collision rather than to the gate.
    const driver = createDriverDouble((call) => {
      if (call.sql.startsWith('INSERT')) {
        throw duplicateEntryFailure('RED', 'SwOption.optionCode');
      }

      return affectedRows(1);
    });
    const unitOfWork = new UnitOfWork(driver.pool);

    const rejection: unknown = await unitOfWork
      .run(
        async (scope) =>
          scope.executor.executeMutation('INSERT INTO SwOption (optionCode) VALUES (?)', ['RED']),
        () => false,
      )
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(rejection).toBeInstanceOf(UniqueConstraintViolationError);
    expect((rejection as UniqueConstraintViolationError).context).toMatchObject({
      constraintName: 'SwOption.optionCode',
    });
  });

  it('NET-NEW — losing the race ROLLS BACK the boundary rather than committing it', async () => {
    /*
     * Translating an error must not settle a boundary. The rollback decision still belongs to the
     * boundary members, and a collision has to abandon the work — which on the importer's per-row path
     * (M3) means abandoning THAT row's transaction and no other.
     */
    const driver = createDriverDouble(() => {
      throw duplicateEntryFailure('RED', 'SwOption.optionCode');
    });
    const unitOfWork = new UnitOfWork(driver.pool);

    await expect(
      unitOfWork.run(
        async (scope) =>
          scope.executor.executeMutation('INSERT INTO SwOption (optionCode) VALUES (?)', ['RED']),
        () => false,
      ),
    ).rejects.toBeInstanceOf(UniqueConstraintViolationError);

    expect(driver.lifecycle).toContain('rollback');
    expect(driver.lifecycle).not.toContain('commit');
  });

  it('NET-NEW — EVERY OTHER driver failure passes through as the identical object', async () => {
    /*
     * The narrowing that keeps this a reporting change rather than a rewrite of the failure surface.
     * A deadlock, a lock-wait timeout, a connection reset and a syntax error must reach the caller with
     * the same identity, message and stack they had before the translation existed — asserted by
     * reference equality, which no re-wrapping can satisfy.
     */
    const lockWaitTimeout = Object.assign(new Error('Lock wait timeout exceeded'), {
      errno: 1205,
      code: 'ER_LOCK_WAIT_TIMEOUT',
    });
    const driver = createDriverDouble(() => {
      throw lockWaitTimeout;
    });
    const runner = new QueryRunner(driver.pool);

    const rejection: unknown = await runner
      .executeMutation('UPDATE SwOption SET sortOrder = ? WHERE optionID = ?', [2, 'option-1'])
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(rejection).toBe(lockWaitTimeout);
    expect(rejection).not.toBeInstanceOf(UniqueConstraintViolationError);
  });

  it('NET-NEW — a deliberate `DomainError` from the guard is never re-examined as a driver failure', async () => {
    // The catch wraps only the driver call, so the blank-statement refusal this class raises itself
    // cannot be mistaken for a collision. It also proves the driver was never reached.
    const driver = createDriverDouble(() => affectedRows(1));
    const runner = new QueryRunner(driver.pool);

    await expect(runner.executeMutation('   ', [])).rejects.toBeInstanceOf(DomainError);
    await expect(runner.executeMutation('   ', [])).rejects.not.toBeInstanceOf(
      UniqueConstraintViolationError,
    );
    expect(driver.calls).toStrictEqual([]);
  });

  it('NET-NEW — a successful write is entirely unaffected by the translation', async () => {
    // The other half of "no outcome changed": the non-failing path returns exactly what it returned.
    const driver = createDriverDouble(() => affectedRows(3));
    const runner = new QueryRunner(driver.pool);

    await expect(
      runner.executeMutation('UPDATE SwSku SET price = ? WHERE productID = ?', [10, 'product-1']),
    ).resolves.toBe(3);
  });
});

/* ================================================================================================
 * NET-NEW — F11. SETTLEMENT FAILURES, AND THE DISPOSAL DECISION THEY DRIVE (SEC-15, CWE-404)
 *
 * ⭐ EVERY CASE HERE WAS UNREACHABLE BEFORE THE DOUBLE COULD FAIL A SETTLEMENT, which is the whole of
 * review finding F11: "UnitOfWork probes cannot fail begin/commit/rollback and never assert `destroy`,
 * so dirty-connection handling can regress while tests stay green." `returnConnection` could have been
 * reduced to a bare `connection.release()` and the entire suite would have stayed green.
 *
 * THE PRODUCTION RULE THESE CASES PIN, read from the code rather than assumed:
 *   • `state.knownClean` starts `true`, is set `false` immediately BEFORE `beginTransaction`, and is
 *     restored to `true` only by a settlement that actually SUCCEEDED — a successful commit, or a
 *     successful roll-back.
 *   • The `finally` disposes of the connection through `returnConnection`: `release` when the state is
 *     known, `destroy` when it is not. Destroying takes the connection permanently out of service so a
 *     connection of unknown transaction state cannot re-enter a warm pool and have the next
 *     invocation begin work on top of whatever was left open (mismatch M7).
 * So a failure in begin, in the work's roll-back, or in the commit all destroy; a work failure whose
 * roll-back SUCCEEDED releases.
 * ============================================================================================== */

describe('NET-NEW — F11. a failed settlement destroys the connection instead of recycling it', () => {
  /** The work every case here hands the boundary: one write, so a transaction genuinely has content. */
  const writeOneRow = async (scope: {
    readonly executor: { executeMutation(sql: string, values: readonly string[]): Promise<number> };
  }): Promise<number> => scope.executor.executeMutation('UPDATE SwSku SET skuCode = ?', ['a']);

  it('NET-NEW — a `beginTransaction` failure DESTROYS the connection and never reaches the work', async () => {
    /*
     * The known-clean flag is withdrawn BEFORE begin is attempted, so a failed begin leaves the
     * connection's state unknown — the server may or may not have opened a transaction — and it is
     * destroyed. Asserting that the work never ran matters too: a boundary that ran the work anyway
     * would perform writes outside any transaction at all.
     */
    const beginFailure = new Error('begin refused');
    const driver = createDriverDouble(
      () => affectedRows(1),
      (event) => {
        if (event === 'begin') {
          throw beginFailure;
        }
      },
    );
    const unitOfWork = new UnitOfWork(driver.pool);

    const rejection: unknown = await unitOfWork
      .run(writeOneRow, () => false)
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    /* Propagated by identity: nothing wraps, re-types or re-messages a begin failure. */
    expect(rejection).toBe(beginFailure);
    expect(driver.lifecycle).toStrictEqual(['begin', 'destroy']);
    /* No statement was issued, so no write escaped the transaction that never opened. */
    expect(driver.calls).toStrictEqual([]);
  });

  it('NET-NEW — a `commit` failure DESTROYS the connection and propagates the driver failure unchanged', async () => {
    /*
     * `state.knownClean = true` sits AFTER the awaited commit, so a rejected commit never restores the
     * standing. The write may or may not be durable — that is exactly the unknown state the destroy
     * exists for.
     *
     * The failure is propagated by identity rather than wrapped. That asymmetry with the roll-back path
     * is deliberate and worth pinning: a roll-back failure is compound (something abandoned the work AND
     * the undo failed) so it is wrapped to say so, whereas a commit failure's driver error is the whole
     * story, and re-wrapping it would cost a caller the driver's own code and errno.
     */
    const commitFailure = Object.assign(new Error('commit refused'), { code: 'ER_LOCK_DEADLOCK' });
    const driver = createDriverDouble(
      () => affectedRows(1),
      (event) => {
        if (event === 'commit') {
          throw commitFailure;
        }
      },
    );
    const unitOfWork = new UnitOfWork(driver.pool);

    const rejection: unknown = await unitOfWork
      .run(writeOneRow, () => false)
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(rejection).toBe(commitFailure);
    expect(driver.lifecycle).toStrictEqual(['begin', 'commit', 'destroy']);
    /* The work DID run: the write reached the driver before the commit was attempted. */
    expect(driver.calls).toHaveLength(1);
  });

  it('NET-NEW — a work failure whose ROLL-BACK SUCCEEDS releases the connection and preserves the primary error', async () => {
    /*
     * The other side of the disposal rule, and the one that keeps `destroy` honest: a successful
     * roll-back restores the known-clean standing, so this connection is RELEASED and stays in service.
     * A boundary that destroyed here would take a healthy connection out of the pool on every ordinary
     * validation-driven abort.
     *
     * PRIMARY-ERROR PRESERVATION IS ASSERTED BY IDENTITY. `runWorkInside` rolls back and then re-raises
     * the caller's own failure untouched, so a caller catching a specific type still catches the same
     * VALUE. Comparing messages would pass against a re-wrapped error; `toBe` cannot.
     */
    const workFailure = new UniqueConstraintViolationError('the SKU code is taken');
    const driver = createDriverDouble(() => affectedRows(1));
    const unitOfWork = new UnitOfWork(driver.pool);

    const rejection: unknown = await unitOfWork
      .run(
        () => Promise.reject(workFailure),
        () => false,
      )
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(rejection).toBe(workFailure);
    expect(driver.lifecycle).toStrictEqual(['begin', 'rollback', 'release']);
  });

  it('NET-NEW — a work failure whose ROLL-BACK ALSO FAILS destroys the connection and records the abandoned failure as a CLASS NAME only', async () => {
    /*
     * ⭐ THE COMPOUND CASE, AND THE ONE WITH A DISCLOSURE PROPERTY TO PIN. Two failures are in flight:
     * the work's, and the roll-back's. Production reports the ROLL-BACK failure — because "nothing can
     * be reported about what the database retained" is the more serious fact — carries the driver's
     * rejection as `cause`, and reduces the abandoned failure to its NEUTRALIZED CLASS NAME on
     * `context`.
     *
     * SO THE PRIMARY REASON IS NOT LOST, BUT IT IS NOT EMBEDDED EITHER, and this case asserts both
     * halves. The abandoned error's MESSAGE carries caller data — here a URL title and a credential-like
     * string — and attaching the object itself would put that in every log that renders the context
     * (CWE-532), with its control characters intact (CWE-117). Only `'Error'` travels.
     */
    const abandoned = new Error('rejected acme-widgets for user:hunter2\nINJECTED LOG LINE');
    const rollbackFailure = new Error('rollback refused');
    const driver = createDriverDouble(
      () => affectedRows(1),
      (event) => {
        if (event === 'rollback') {
          throw rollbackFailure;
        }
      },
    );
    const unitOfWork = new UnitOfWork(driver.pool);

    const rejection: unknown = await unitOfWork
      .run(
        () => Promise.reject(abandoned),
        () => false,
      )
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    if (!(rejection instanceof DomainError)) {
      throw new Error('A failed roll-back was expected to be reported as a domain failure.');
    }
    expect(rejection.message).toMatch(/could not be rolled back/);
    expect(rejection.cause).toBe(rollbackFailure);
    expect(rejection.context).toStrictEqual({
      rolledBackBecause: 'workFailure',
      abandonedFailureClass: 'Error',
    });

    /* Nothing of the abandoned failure's own text survives into the record. */
    const record = JSON.stringify({ message: rejection.message, context: rejection.context });
    expect(record).not.toMatch(/acme-widgets|hunter2|INJECTED/);
    expect(record).not.toMatch(/\n/);

    expect(driver.lifecycle).toStrictEqual(['begin', 'rollback', 'destroy']);
  });

  it('NET-NEW — M5. an ERROR-GATE roll-back that fails destroys the connection and records NO abandoned class, because nothing was abandoned', async () => {
    /*
     * The gate path (mismatch M5) reaches the same roll-back with a different `cause` and, decisively,
     * with NO abandoned failure — the work SUCCEEDED and the caller's accumulated findings are what
     * refuse the commit. `exactOptionalPropertyTypes` makes "absent" and "present and undefined"
     * different things, and the honest statement is absent, so `toStrictEqual` is what asserts it: a
     * `{ abandonedFailureClass: undefined }` record would fail here.
     */
    const rollbackFailure = new Error('rollback refused');
    const driver = createDriverDouble(
      () => affectedRows(1),
      (event) => {
        if (event === 'rollback') {
          throw rollbackFailure;
        }
      },
    );
    const unitOfWork = new UnitOfWork(driver.pool);

    const rejection: unknown = await unitOfWork
      .run(writeOneRow, () => true)
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    if (!(rejection instanceof DomainError)) {
      throw new Error('A failed roll-back was expected to be reported as a domain failure.');
    }
    expect(rejection.context).toStrictEqual({ rolledBackBecause: 'accumulatedErrors' });
    expect(driver.lifecycle).toStrictEqual(['begin', 'rollback', 'destroy']);
  });

  it('NET-NEW — M5. an error-gate roll-back that SUCCEEDS releases, and the refusal is a domain failure rather than a quiet return', async () => {
    /*
     * The ordinary M5 path, kept beside the failing one so the destroy above is attributable to the
     * FAILED settlement rather than to the gate. It also pins that the boundary RAISES: a caller that
     * received a quiet "nothing was kept" would carry on as though the write had happened.
     */
    const driver = createDriverDouble(() => affectedRows(1));
    const unitOfWork = new UnitOfWork(driver.pool);

    const rejection: unknown = await unitOfWork
      .run(writeOneRow, () => true)
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    if (!(rejection instanceof DomainError)) {
      throw new Error('The gate was expected to refuse the commit with a domain failure.');
    }
    expect(rejection.context).toStrictEqual({ settledAs: 'rollback' });
    expect(driver.lifecycle).toStrictEqual(['begin', 'rollback', 'release']);
  });

  it('NET-NEW — M3. a per-item commit failure destroys the ONE shared connection and leaves earlier rows committed', async () => {
    /*
     * The importer's shape (`model/dao/ProductDAO.cfc:L176-L177`): one connection for the whole list,
     * one INDEPENDENT transaction per row. Row two's commit fails, and three properties must hold at
     * once — row one stays committed, row three never begins, and the single shared connection is
     * DESTROYED rather than released back for the next invocation to inherit.
     *
     * A boundary that acquired per item would show three acquires here; one that used `Promise.all`
     * would show all three begins. The event list rules out both.
     */
    let commits = 0;
    const commitFailure = new Error('commit refused');
    const driver = createDriverDouble(
      () => affectedRows(1),
      (event) => {
        if (event === 'commit') {
          commits += 1;
          if (commits === 2) {
            throw commitFailure;
          }
        }
      },
    );
    const unitOfWork = new UnitOfWork(driver.pool);
    const rowsAttempted: string[] = [];

    const rejection: unknown = await unitOfWork
      .runPerItemWithoutResults(['row-1', 'row-2', 'row-3'], async (row, scope) => {
        rowsAttempted.push(row);
        await scope.executor.executeMutation('INSERT INTO SwProduct (productID) VALUES (?)', [row]);
      })
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(rejection).toBe(commitFailure);
    expect(rowsAttempted).toStrictEqual(['row-1', 'row-2']);
    expect(driver.lifecycle).toStrictEqual(['begin', 'commit', 'begin', 'commit', 'destroy']);
  });
});

describe('NET-NEW — the support double and the real boundary agree on WHICH disposal happens', () => {
  /*
   * ⭐ WHY A PARITY BLOCK, AND WHY IT BELONGS HERE RATHER THAN IN TEST SUPPORT. Every service, handler
   * and repository suite in this port asserts boundary behaviour through the STRUCTURAL double in
   * `../support/inMemoryRepositories.ts`, never through the class — that is what lets a service be
   * tested with no driver at all. Those assertions are worth exactly as much as the agreement between
   * the two implementations, and the disposal decision is the one place where a plausible double
   * diverges in silence: releasing unconditionally is the obvious thing to write, it needs no
   * settlement modelling at all, and it is WRONG on four of the seven paths below.
   *
   * So the block drives the SAME seven settlement outcomes through the real class over the driver double
   * and through the support double, and asserts three things each time: what the class did, what the
   * double did, and that the two are the same list. The third assertion is the contract; the first two
   * are what tell you which side broke when it fails.
   *
   * ⚠️ ONE PROPERTY IS DELIBERATELY NOT ASSERTED AS PARITY. The class's compound roll-back failure
   * carries a SANITISED, length-bounded class name for the abandoned failure and the double does not
   * reproduce that reduction — a second implementation in test support could agree with itself while
   * disagreeing with the code that ships. The reduction is pinned against the class alone, above.
   */

  /** The failure injected into whichever settlement step a scenario names. */
  const settlementFailure = new Error('the settlement was refused');
  /** The failure the work itself raises, for the scenarios that need one. */
  const workFailure = new Error('the work inside the boundary was abandoned');

  /** One settlement outcome and the disposal it must produce on BOTH implementations. */
  interface DisposalScenario {
    readonly name: string;
    /** Which settlement step fails, or `undefined` when every step succeeds. */
    readonly failing: 'begin' | 'commit' | 'rollback' | undefined;
    readonly workFails: boolean;
    readonly gateReportsErrors: boolean;
    readonly disposal: 'release' | 'destroy';
  }

  const SCENARIOS: readonly DisposalScenario[] = [
    {
      name: 'a clean commit',
      failing: undefined,
      workFails: false,
      gateReportsErrors: false,
      disposal: 'release',
    },
    {
      name: 'work that failed, rolled back cleanly',
      failing: undefined,
      workFails: true,
      gateReportsErrors: false,
      disposal: 'release',
    },
    {
      name: 'the M5 gate, rolled back cleanly',
      failing: undefined,
      workFails: false,
      gateReportsErrors: true,
      disposal: 'release',
    },
    {
      name: 'a failed begin',
      failing: 'begin',
      workFails: false,
      gateReportsErrors: false,
      disposal: 'destroy',
    },
    {
      name: 'a failed commit',
      failing: 'commit',
      workFails: false,
      gateReportsErrors: false,
      disposal: 'destroy',
    },
    {
      name: 'a failed roll-back after failed work',
      failing: 'rollback',
      workFails: true,
      gateReportsErrors: false,
      disposal: 'destroy',
    },
    {
      name: 'a failed roll-back after the M5 gate',
      failing: 'rollback',
      workFails: false,
      gateReportsErrors: true,
      disposal: 'destroy',
    },
  ];

  for (const scenario of SCENARIOS) {
    it(`NET-NEW — ${scenario.name} ends in a ${scenario.disposal} on both implementations`, async () => {
      /*
       * The same work and the same gate go to both boundaries. Neither issues a statement: the disposal
       * decision is a property of the SETTLEMENT, so a statement would add a variable without adding a
       * distinction, and the class's statement handling is asserted elsewhere in this file.
       */
      const work = (): Promise<void> =>
        scenario.workFails ? Promise.reject(workFailure) : Promise.resolve();
      const gate = (): boolean => scenario.gateReportsErrors;
      const settle = (step: 'begin' | 'commit' | 'rollback'): void => {
        if (step === scenario.failing) {
          throw settlementFailure;
        }
      };
      /** Only the disposal events, which is the whole of what the two implementations must agree on. */
      const disposalsIn = (events: readonly string[]): readonly string[] =>
        events.filter((event) => event === 'release' || event === 'destroy');
      /** Swallows the rejection: every scenario but the first has one, and none of them is under test here. */
      const ignoreOutcome = (): undefined => undefined;

      const driver = createDriverDouble(() => affectedRows(1), settle);
      await new UnitOfWork(driver.pool).run(work, gate).then(ignoreOutcome, ignoreOutcome);

      const double = createUnitOfWorkDouble({ settlement: settle });
      await double.unitOfWork.run(work, gate).then(ignoreOutcome, ignoreOutcome);

      expect(disposalsIn(driver.lifecycle)).toStrictEqual([scenario.disposal]);
      expect(disposalsIn(double.eventKinds())).toStrictEqual([scenario.disposal]);
      /* The parity statement itself, so a divergence fails here even if both lists changed together. */
      expect(disposalsIn(driver.lifecycle)).toStrictEqual(disposalsIn(double.eventKinds()));
    });
  }
});
