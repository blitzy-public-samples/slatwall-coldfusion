/*
 * unitOfWork — the explicit transaction boundary that replaces the legacy's implicit request-end
 * flush (AAP §0.4.1.7 row 7, AAP §0.3.3).
 *
 * It owns three execution-model mismatches, each discharged at the member where the judgment is made:
 *
 * M5 — the legacy commit gate is error-conditional: the engine is told not to flush on its own, and
 * the request flushes at its end only when it accumulated no errors. A stateless invocation has no
 * request-end hook, so the boundary is opened and closed explicitly here and a boundary that saw an
 * error rolls back rather than committing.
 *
 * M6 — the validation read-back loop. `Sku.hasUniqueOptions()` [model/entity/Sku.cfc:L756-L769] is a
 * declarative save-context rule that issues a query, so a SKU batch validates against siblings the
 * same operation is still writing. Under Hibernate that worked through session flush ordering; with a
 * prepared-statement driver there is neither a session nor an automatic flush, so this file's
 * invariant is that every write made inside a boundary is visible to every read issued later in the
 * same boundary — which is why repositories are re-bound to the boundary's own executor rather than to
 * the pool.
 *
 * M3 — the importer commits per row [model/dao/ProductDAO.cfc:L176-L177], so a mid-file failure leaves
 * a partially imported catalogue. That boundary shape is reproduced, not widened to one transaction.
 */

import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import type { RequestAuthorizationContext } from '../../ports/AccountContextPort';
import type { TransactionalWriteRunner } from '../../ports/UniquePropertyPort';
import {
  acquireConnectionTranslatingDriverFailure,
  assertColumnName,
  assertTableName,
  readAffectedRows,
  rethrowTranslatingDuplicateEntry,
} from './QueryRunner';
import { toRows } from './rowMappers';

import type {
  BoundParameterValue,
  SqlExecutor,
  StatementPool,
  StatementRunner,
  TransactionalStatementRunner,
} from './QueryRunner';
import type { MySqlRow } from './rowMappers';

/*
 * TODO(parity) D22 [model/dao/SkuDAO.cfc:L132] — org/Hibachi/HibachiEntity.cfc:L642 and :L644 hand this file a table name in the
 * physical vocabulary, and it is still validated rather than trusted
 * The legacy tree speaks two table vocabularies at once and both are correct; the full account, the
 * six entity rows and the five framework prefixing sites are documented in ./QueryRunner, which
 * holds the name-mapping table. D22's register home is ../../ports/repositories/SkuRepository, and
 * neither that adapter nor this one owns the entry. What matters at this file's one
 * statement-composing member is which vocabulary arrives:
 *
 * Org/Hibachi/HibachiEntity.cfc:L642 and :L644 pass `getMetaData(this).table` into the sort-order
 * helper — the physical name, `SwOption` or `SwOptionGroup` for the two in-scope entities.
 * Org/Hibachi/HibachiService.cfc:L781-L785 resolves an entity name to `entityMetaData.table` before
 * delegating, so the same call arrives physical one layer down and logical one layer up.
 */

/** The projection alias the legacy sort-order statement gives its single computed column. */
const TOP_SORT_ORDER_ALIAS = 'topSortOrder';

/** The clause that turns the sort-order maximum into a locking read. */
const LOCKING_READ_SUFFIX = ' FOR UPDATE';

/** The error-state predicate for a boundary that has no error gate of its own. */
const NO_ACCUMULATED_ERRORS = (): boolean => false;

/**
 * The scalar shapes a `?` placeholder in this file's statements may bind.
 *
 * @param candidate - Any value a caller placed in a parameter list.
 * @returns `true` when the value can be bound to a single placeholder.
 */
function isBindableValue(candidate: unknown): candidate is BoundParameterValue {
  return (
    candidate === null ||
    typeof candidate === 'string' ||
    typeof candidate === 'number' ||
    typeof candidate === 'bigint' ||
    typeof candidate === 'boolean' ||
    candidate instanceof Date
  );
}

/**
 * Narrows a whole parameter list for the driver, preserving order exactly.
 *
 * @param params - The caller's parameter list, in legacy positional order.
 * @returns a new list of the same length and order, typed for the driver.
 * @throws {DomainError} When any element is not a bindable scalar. The position, the list length and
 * the offending value's runtime type travel on `context`; the value itself deliberately does not,
 * because a bound parameter can hold data that has no business in an error object.
 */
function toBoundParameters(params: readonly unknown[]): BoundParameterValue[] {
  const bound: BoundParameterValue[] = [];

  for (let index = 0; index < params.length; index += 1) {
    const candidate = params[index];

    if (!isBindableValue(candidate)) {
      throw new DomainError(
        'A bound parameter is not one of the scalar shapes a placeholder accepts, so the statement ' +
          'was not prepared. Bind one value per placeholder; expand a list in the caller.',
        {
          context: {
            position: index,
            parameterCount: params.length,
            valueType: candidate === undefined ? 'undefined' : typeof candidate,
          },
        },
      );
    }

    bound.push(candidate);
  }

  return bound;
}

/*
 * A third declaration of this shape stood here under a different name, and it is removed.
 * `export interface ScopedSqlExecutor extends SqlExecutor { executeMutation(...) }` occupied this
 * position — structurally identical to {@link TransactionalSqlExecutor} below, member for member.
 */

/**
 * Builds the only execution surface this file ever hands out.
 *
 * @param driver - The pooled connection the transaction was begun on, or the pool for the untransacted
 * path.
 *
 * @param bind - The pool's statement binder, which validates that the statement writes exactly one
 * placeholder per bound value before anything reaches the wire.
 *
 * @returns An executor bound to that driver object, and nothing else.
 */
function createExecutor(driver: StatementRunner): TransactionalSqlExecutor {
  /*
   * One path to the driver, so the guard and the binding cannot diverge between the two members. The
   * blank-statement precondition itself lives in `requireStatementText` below, shared with nothing else
   * in this module: two copies of one guard are two places for it to drift.
   */
  const runStatement = async (sql: string, params: readonly unknown[]): Promise<unknown> => {
    requireStatementText(sql, params.length);

    try {
      const [driverResult] = await driver.execute(sql, toBoundParameters(params));

      return driverResult;
    } catch (cause: unknown) {
      /*
       * (D18-class) — the transaction-scoped half of the duplicate-key report.
       * `QueryRunner.runStatement` is the pool-bound half. Both apply the same imported helper, so a
       * collision looks identical whether the write happened inside a boundary or outside one, and
       * `./QueryRunner` carries the adjudication once rather than this file restating it.
       */
      rethrowTranslatingDuplicateEntry(cause, params.length);
    }
  };

  return Object.freeze({
    execute: async (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> =>
      toRows(await runStatement(sql, params)),

    executeMutation: async (sql: string, params: readonly unknown[]): Promise<number> => {
      const affectedRows = readAffectedRows(await runStatement(sql, params));

      /*
       * Refused rather than reported as zero. A read statement routed into this member returns a row
       * list, and a row list is an object, so degrading to zero here would report "affected nothing"
       * for a statement that never wrote anything — and `model/dao/ProductDAO.cfc:L247` branches on
       * this count, so a manufactured zero would silently take the wrong branch.
       */
      if (affectedRows === undefined) {
        throw new DataIntegrityError(
          'A writing statement inside a transaction boundary did not produce a write ' +
            'acknowledgement, so the number of rows it affected could not be read.',
          { context: { parameterCount: params.length } },
        );
      }

      return affectedRows;
    },
  });
}

/**
 * Refuses a blank statement, for both members of the executor above.
 *
 * @param sql - The statement text as supplied.
 * @param parameterCount - How many values the caller intended to bind, for the diagnostic record.
 * @throws {DomainError} When the statement text is blank.
 */
function requireStatementText(sql: string, parameterCount: number): void {
  if (sql.trim().length === 0) {
    throw new DomainError(
      'A blank statement reached a transaction-scoped execution boundary, so there was nothing ' +
        'to prepare.',
      { context: { parameterCount } },
    );
  }
}

/**
 * The shape a wide-integer column takes when the driver is configured to hand it over as text.
 *
 * `src/config/database.ts` sets `supportBigNumbers` and `bigNumberStrings`, which is a correctness
 * contract rather than a preference — it is what stops a wide integer being narrowed inside the driver
 * where no mapper-side check could detect the loss. The consequence is that an aggregate projection such
 * as `COALESCE(max(sortOrder), 0)` arrives as the *string* `"0"`, not the number `0`, on every live
 * connection. The pattern is deliberately **signed**, unlike the count reader in `./QueryRunner.ts`
 * whose subject cannot be negative: `model/entity/Product.cfc:L59`, `model/entity/Option.cfc:L56` and
 * `model/entity/OptionGroup.cfc:L58` all declare `sortOrder` as a plain `ormtype="integer"` with no
 * lower bound, so a stored negative maximum is a legal value and refusing it here would refuse a row the
 * legacy read returned happily (`org/Hibachi/HibachiDAO.cfc:L167` returns `rs.topSortOrder`, which CFML
 * coerces numerically without inspecting its sign).
 */
const INTEGER_TEXT_PATTERN = /^-?\d+$/;

/**
 * Reads the sort-order maximum out of the row the ported statement produced.
 *
 * @param row - The single row the statement produced.
 * @returns The stored maximum, or zero when the scope held no rows.
 * @throws {DataIntegrityError} When the row does not carry the projection alias, or carries it as
 * something other than a whole number the runtime can hold exactly.
 */
function readTopSortOrder(row: MySqlRow): number {
  if (!(TOP_SORT_ORDER_ALIAS in row)) {
    throw new DataIntegrityError(
      'The sort-order statement produced a row without its projected column, so the current ' +
        'maximum could not be read.',
      { context: { alias: TOP_SORT_ORDER_ALIAS, columns: Object.keys(row) } },
    );
  }

  const projected: unknown = row[TOP_SORT_ORDER_ALIAS];

  if (typeof projected === 'number' && Number.isInteger(projected)) {
    return projected;
  }

  /*
   * A wide integer column can arrive as a bigint when the driver is configured to preserve it. It is
   * converted only when the runtime can hold it exactly; a value beyond that range would lose
   * precision on conversion, and a silently rounded position is worse than a refusal.
   */
  if (
    typeof projected === 'bigint' &&
    projected >= BigInt(Number.MIN_SAFE_INTEGER) &&
    projected <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(projected);
  }

  /*
   * The text form the shipped pool actually produces — see {@link INTEGER_TEXT_PATTERN}. Accepting it
   * here is not a widening of the contract but the removal of an inconsistency: `QueryRunner.toCount`,
   * `rowMappers.readOptionalNumber` and `MySqlSkuRepository`'s own numeric reader all already accept
   * integer text from this same driver configuration, and this reader was the only one that did not — so
   * every live invocation of the two sort-order members refused a value the rest of the adapter layer
   * reads without complaint. The safe-integer bound is kept exactly as the `bigint` branch above keeps
   * it: a position the runtime cannot hold exactly is still refused rather than silently rounded.
   */
  if (typeof projected === 'string' && INTEGER_TEXT_PATTERN.test(projected)) {
    const parsed = Number(projected);

    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  throw new DataIntegrityError(
    'The sort-order statement produced a value that is not a whole number, so the current maximum ' +
      'could not be read.',
    { context: { alias: TOP_SORT_ORDER_ALIAS, valueType: typeof projected } },
  );
}

/** Why a boundary was abandoned, for the diagnostic record only. */
type RollbackCause = 'accumulatedErrors' | 'workFailure';

/* What may be said about an abandoned failure — an allowlist, not the value itself. */

/**
 * The upper bound on the length of the one diagnostic string this module composes. A redaction
 * control, not a capacity figure (AAP §0.7.3): it exists so a hostile or corrupt class name cannot
 * make a diagnostic record unbounded.
 */
const DIAGNOSTIC_TEXT_LIMIT = 200;

/** Replaces a character a diagnostic record must not carry. Inert in every log viewer. */
const DIAGNOSTIC_REDACTED_CHARACTER = '.';

/** Appended when {@link DIAGNOSTIC_TEXT_LIMIT} cut a value short, so truncation is never silent. */
const DIAGNOSTIC_TRUNCATION_MARKER = '[truncated]';

/** Stands in for a class name when the abandoned value is not an `Error` and therefore has none. */
const UNKNOWN_FAILURE_CLASS = 'unknown';

/** The highest C0 control code point. Everything at or below it is neutralized. */
const LAST_C0_CONTROL_CODE_POINT = 0x1f;

/** The delete character, and the first of the C1 range that follows it. */
const FIRST_C1_CONTROL_CODE_POINT = 0x7f;

/** The last C1 control code point. */
const LAST_C1_CONTROL_CODE_POINT = 0x9f;

/**
 * Reduces an abandoned failure to the single fact it is safe to record: its neutralized class name.
 *
 * @param failure - The value that abandoned the work, of any shape.
 * @returns Its class name, neutralized and bounded, or {@link UNKNOWN_FAILURE_CLASS}.
 */
function describeAbandonedFailure(failure: unknown): string {
  const declared = failure instanceof Error ? failure.constructor.name : '';
  const source = declared.length > 0 ? declared : UNKNOWN_FAILURE_CLASS;

  let sanitized = '';
  let retained = 0;

  for (const character of source) {
    if (retained >= DIAGNOSTIC_TEXT_LIMIT) {
      return sanitized + DIAGNOSTIC_TRUNCATION_MARKER;
    }

    const codePoint = character.codePointAt(0) ?? 0;
    const isControl =
      codePoint <= LAST_C0_CONTROL_CODE_POINT ||
      (codePoint >= FIRST_C1_CONTROL_CODE_POINT && codePoint <= LAST_C1_CONTROL_CODE_POINT);

    sanitized += isControl ? DIAGNOSTIC_REDACTED_CHARACTER : character;
    retained += 1;
  }

  return sanitized;
}

/** Whether a checked-out connection is still fit to hand back to the pool. */
interface ConnectionState {
  knownClean: boolean;
}

/**
 * Disposes of a checked-out connection according to what is known about its transaction state.
 *
 * @param connection - The connection to dispose of.
 * @param state - What is known about its transaction state.
 */
function returnConnection(connection: TransactionalStatementRunner, state: ConnectionState): void {
  if (state.knownClean) {
    connection.release();

    return;
  }

  connection.destroy();
}

/**
 * What a completed unit of work produced, together with how it must be settled.
 *
 * @typeParam T - Whatever the unit of work produced.
 */
interface CompletedWork<T> {
  readonly decision: CommitDecision;
  readonly result: T;
}

/**
 * Rolls a boundary back, and refuses to fail silently if the roll-back itself fails.
 *
 * TODO(parity) org/Hibachi/Hibachi.cfc:L455-L459 — the explicit roll-back is a documented
 * translation, not a port, and this is the one place the difference matters. There is no `rollback`
 * anywhere on the legacy path. What :L456 does on the error branch is decline to flush: it takes the
 * negative of the gate, skips the flush at :L457, and the CF/Railo request teardown then discards the
 * ORM session with the pending changes still in it. Application.cfc:L113-L123 wraps that in a second
 * gate and changes nothing about it.
 *
 * @param connection - The connection the transaction was begun on.
 * @param cause - Which path reached the roll-back, for the diagnostic record only.
 * @param abandonedFailure - The failure that abandoned the work, when there was one. Only its
 * neutralized class name reaches the error's `context`; the value itself is never embedded there.
 * See {@link describeAbandonedFailure}.
 */
async function rollBack(
  connection: TransactionalStatementRunner,
  cause: RollbackCause,
  state: ConnectionState,
  abandonedFailure?: unknown,
): Promise<void> {
  try {
    await connection.rollback();

    state.knownClean = true;
  } catch (rollbackFailure) {
    throw new DomainError(
      'The transaction could not be rolled back after the work inside it was abandoned, so nothing ' +
        'can be reported about what the database retained.',
      {
        cause: rollbackFailure,
        /*
         * The abandoned failure is summarised, never embedded. Only its neutralized class name
         * travels — see the section note on {@link describeAbandonedFailure} for why attaching the
         * object itself was a disclosure (CWE-532) and log-injection (CWE-117) channel, and for why
         * the reason the work stopped is still not swallowed.
         */
        context:
          abandonedFailure === undefined
            ? { rolledBackBecause: cause }
            : {
                rolledBackBecause: cause,
                abandonedFailureClass: describeAbandonedFailure(abandonedFailure),
              },
      },
    );
  }
}

/**
 * Runs a caller's work inside an already-open boundary and decides how the boundary must settle.
 *
 * @typeParam T - Whatever the unit of work produces.
 *
 * @param connection - The connection the transaction was begun on.
 * @param work - The caller's unit of work. It receives the scope and nothing else.
 * @param hasErrors - The M5 gate: the caller's own error-state predicate.
 * @param state - The connection's disposition record, so a failed roll-back on this path withdraws
 * the connection's known-clean standing rather than letting it be recycled.
 */
async function runWorkInside<T>(
  connection: TransactionalStatementRunner,
  work: (scope: TransactionScope) => Promise<T>,
  hasErrors: () => boolean,
  state: ConnectionState,
): Promise<CompletedWork<T>> {
  try {
    const result = await work(Object.freeze({ executor: createExecutor(connection) }));

    return { decision: hasErrors() ? 'rollback' : 'commit', result };
  } catch (failure) {
    await rollBack(connection, 'workFailure', state, failure);

    throw failure;
  }
}

/**
 * Opens one transaction on an already checked-out connection, runs the work and settles it.
 *
 * @typeParam T - Whatever the unit of work produces.
 *
 * @param connection - The already checked-out connection.
 * @param state - The connection's disposition record, updated in place.
 * @param work - The unit of work.
 * @param hasErrors - The M5 gate.
 * @returns The work's result, once the transaction has committed.
 */
async function runTransaction<T>(
  connection: TransactionalStatementRunner,
  state: ConnectionState,
  work: (scope: TransactionScope) => Promise<T>,
  hasErrors: () => boolean,
): Promise<T> {
  state.knownClean = false;

  await connection.beginTransaction();

  const completed = await runWorkInside(connection, work, hasErrors, state);

  if (completed.decision === 'rollback') {
    await rollBack(connection, 'accumulatedErrors', state);

    throw new DomainError(
      'The unit of work was rolled back because the caller reported accumulated validation ' +
        'errors, so nothing it wrote was kept.',
      { context: { settledAs: completed.decision } },
    );
  }

  await connection.commit();

  state.knownClean = true;

  return completed.result;
}

/* The public surface. */

/**
 * Everything a unit of work is allowed to reach while its transaction is open.
 *
 * @example
 * ```ts
 * // A repository member is written once and works in both places.
 * Await unitOfWork.run(async (scope) => {
 * await skuRepository.insert(scope.executor, sku);
 * // The uniqueness read below observes the insert above: same connection, same transaction.
 * ```
 */
/** The execution surface a boundary hands out: one connection, reads and writes. */
export interface TransactionalSqlExecutor extends SqlExecutor {
  /**
   * Run a data-modifying statement on this boundary's connection and return the rows it affected.
   *
   * @param sql - The writing statement text, with a `?` in every value position.
   * @param params - The values to bind, in legacy positional order (TR-4).
   * @returns The number of rows affected, which may legitimately be zero.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

export interface TransactionScope {
  /** The only execution surface inside the boundary. Every read and every write goes through it. */
  readonly executor: TransactionalSqlExecutor;
}

/** How a boundary settled: the ported form of the legacy commit gate's two outcomes. */
export type CommitDecision = 'commit' | 'rollback';

/**
 * Where the per-item boundary members take their items from: a materialised list, or a lazy source.
 *
 * @typeParam TItem - The item type, one per independent transaction.
 */
export type PerItemSource<TItem> = readonly TItem[] | AsyncIterable<TItem>;

/**
 * Explicit transaction boundaries for the extracted Catalog slice.
 *
 * @example
 * ```ts
 * // src/config/container.ts — wired once, then injected downwards.
 * Const unitOfWork = new UnitOfWork(pool);
 * // The importer takes the same object as its boundary: no shim, no adapter, no recovered connection.
 * Const productRepository = new MySqlProductRepository({ transactions: unitOfWork, ... });
 * ```
 */
/*
 * The first-sort-order seeding contract.
 * `model/entity/OptionGroup.cfc:L58` declares `property name="sortOrder" ormtype="integer"
 * required="true"`, and `model/validation/OptionGroup.json` says nothing about the property. The
 * requiredness is therefore enforced by the column and by the ORM lifecycle, never by validation — which
 * is why `test/domain/OptionGroup.test.ts` correctly asserts that a group with `sortOrder` unset
 * validates clean, and why that assertion is not the whole story.
 */

/** The minimum shape the seeding step needs: a mutable `sortOrder` slot. */
export interface SortOrderSeedTarget {
  sortOrder?: number;
}

/** The `sortContext` scope, when the entity declares one. */
export interface SortOrderSeedScope {
  /** The parent's primary-key column — `getPrimaryIDPropertyName()` at `:L642`. */
  readonly contextIDColumn: string;
  /** The parent's primary-key value — `getPrimaryIDValue()` at `:L642`. */
  readonly contextIDValue: string;
}

/**
 * Reads the highest stored sort order for a table, optionally within one parent's scope.
 *
 * Published as a function as well as a method because the seeding this file owns has to happen inside the
 * write path of every `sortOrder`-bearing entity, and a write path that already holds a
 * transaction-scoped executor has no business acquiring a second boundary object just to ask one
 * question. {@link UnitOfWork.getTableTopSortOrder} is the method form and delegates here, so the two
 * forms are one implementation and the statement can never drift between them.
 *
 * @param executor - Where to run the read. Inside a boundary this must be the boundary's own executor, so
 * the maximum observed includes rows the same transaction has written but not committed (M6).
 *
 * @param tableName - The table to read, whitelisted by {@link assertTableName}.
 * @param contextIDColumn - The scoping column, whitelisted against that table's declared columns.
 * @param contextIDValue - The scoping value, bound to a placeholder and never interpolated.
 * @returns The highest stored position, or zero when the table — or the scope — holds no rows.
 * @throws {DataIntegrityError} when the statement produced no row, or produced a value that is not a
 * whole number the runtime can hold exactly.
 */
async function readTableTopSortOrder(
  executor: SqlExecutor,
  tableName: string,
  contextIDColumn?: string,
  contextIDValue?: string,
): Promise<number> {
  const table = assertTableName(tableName);

  const columnSupplied = contextIDColumn !== undefined;

  /*
   * TODO(parity) org/Hibachi/HibachiDAO.cfc:L159-L164 — a half-supplied scope reads the whole table,
   * silently, and that is the legacy behaviour reproduced rather than repaired. Both context
   * arguments are declared optional at :L150-L151, and :L159 guards the `WHERE` clause with
   * `structKeyExists(arguments, "contextIDColumn") && structKeyExists(arguments, "contextIDValue")`.
   * The `&&` is the whole point: supplying one alone emits no clause at all and returns a whole-table
   * maximum under the appearance of a scoped read. For the one in-scope scoped entity that would seed
   * an option's position from the highest position in the entire table, with no error anywhere.
   */

  /*
   * Composed exactly as org/Hibachi/HibachiDAO.cfc:L157-L164 composes it, including the `COALESCE`
   * that turns an empty scope into a zero, and including the fact that the `WHERE` clause is present
   * only when a scope was supplied.
   */
  let sql = `SELECT COALESCE(max(sortOrder), 0) as ${TOP_SORT_ORDER_ALIAS} FROM ${table}`;
  const params: unknown[] = [];

  if (contextIDColumn !== undefined && contextIDValue !== undefined) {
    sql += ` WHERE ${assertColumnName(table, contextIDColumn)} = ?`;
    params.push(contextIDValue);
  }

  /*
   * — the locking read, appended last, after the optional `where`. that is the only
   * position MySQL accepts, and appending it here rather than inside either branch above means the
   * whole-table and the scoped read are protected identically. See the read is locking on the first
   * overload for the full adjudication and for the residual gap.
   */
  sql += LOCKING_READ_SUFFIX;

  const rows = await executor.execute(sql, params);

  /*
   * Checked rather than trusted because `noUncheckedIndexedAccess` types an indexed read as possibly
   * absent — which is the honest type of "the first row of a result set that may be empty". An
   * aggregate without a `GROUP BY` always produces exactly one row, so no row at all means the
   * statement did not run as composed, and that raises rather than degrading to the zero the
   * `COALESCE` would have produced.
   */
  const topRow: MySqlRow | undefined = rows[0];

  if (topRow === undefined) {
    throw new DataIntegrityError(
      'The sort-order statement produced no row, so there was no current maximum to read.',
      { context: { table, scoped: columnSupplied } },
    );
  }

  return readTopSortOrder(topRow);
}

/**
 * Assigns an entity its first sort order, reproducing `org/Hibachi/HibachiEntity.cfc:L637-L647`.
 *
 * The legacy block is **unconditional on insert**: `:L637` tests only that the entity declares a
 * `sortOrder` setter, and `:L646` then assigns `topSortOrder + 1` over whatever the entity was already
 * carrying. A caller-supplied position is therefore overwritten while the entity is transient, and that
 * is reproduced rather than softened into a "seed only when absent" rule — the overwrite is what keeps
 * the stored sequence dense, and it is the behaviour the still-running CFML application reads back.
 *
 * @param executor - the executor the insert itself will use, so the read and the insert agree (M6).
 * @param tableName - the entity's physical table, whitelisted by {@link assertTableName}.
 * @param entity - the entity to seed; its `sortOrder` slot is written in place.
 * @param scope - the `sortContext` scope when the entity declares one; omitted for a whole-table seed.
 * @returns the assigned position, which is also now on the entity.
 */
async function assignFirstSortOrder(
  executor: SqlExecutor,
  tableName: string,
  entity: SortOrderSeedTarget,
  scope?: SortOrderSeedScope,
): Promise<number> {
  /*
   * `:L640` initialises `topSortOrder` to zero and then overwrites it from one of the two reads, so the
   * zero is never the value that reaches `:L646` — it is dead in the source and is not reproduced.
   */
  const topSortOrder =
    scope === undefined
      ? // `:L644` — no `sortContext`, so the maximum is taken across the WHOLE table.
        await readTableTopSortOrder(executor, tableName)
      : // `:L642` — scoped to the parent the context names.
        await readTableTopSortOrder(
          executor,
          tableName,
          scope.contextIDColumn,
          scope.contextIDValue,
        );

  // `:L646` — `setSortOrder( topSortOrder + 1 )`.
  const assigned = topSortOrder + 1;
  entity.sortOrder = assigned;

  return assigned;
}

/**
 * Seeds the first sort order of an entity that declares no `sortContext` — the whole-table variant at
 * `org/Hibachi/HibachiEntity.cfc:L644`.
 *
 * This is the form the product write path takes. `model/entity/Product.cfc:L59` declares
 * `property name="sortOrder" ormtype="integer"` with no `sortContext` attribute, so the maximum is taken
 * across `SwProduct` rather than within any parent, and `./MySqlProductRepository.ts` calls this on its
 * insert branch: the ORM lifecycle hook that fired the seeding in the legacy application has no
 * equivalent in a stateless invocation (M5), so a write seam has to fire it explicitly or the column is
 * stored `NULL` where the legacy stored a deterministic position.
 *
 * @param executor - the executor the insert itself will use, so the read and the insert agree (M6).
 * @param tableName - the entity's physical table, whitelisted by {@link assertTableName}.
 * @param entity - the entity to seed; its `sortOrder` slot is written in place.
 * @returns the assigned position, which is also now on the entity.
 */
export async function seedWholeTableSortOrder(
  executor: SqlExecutor,
  tableName: string,
  entity: SortOrderSeedTarget,
): Promise<number> {
  return assignFirstSortOrder(executor, tableName, entity);
}

/**
 * Refuses an entity that would reach the database with no `sortOrder` — the current contract.
 *
 * @param entity - the entity about to be written.
 * @param tableName - the table it is being written to, for the diagnostic.
 * @returns the same entity, with `sortOrder` known to be present.
 * @throws {DataIntegrityError} when `sortOrder` is absent.
 */
export function assertSortOrderAssigned<TEntity extends SortOrderSeedTarget>(
  entity: TEntity,
  tableName: string,
): TEntity & { sortOrder: number } {
  const { sortOrder } = entity;

  if (sortOrder === undefined) {
    throw new DataIntegrityError(
      'A sortOrder-bearing entity reached the persistence boundary with no sort order assigned, so ' +
        'it cannot be written: the column is declared required and no default may be invented for it.',
      { context: { table: assertTableName(tableName), member: 'assertSortOrderAssigned' } },
    );
  }

  return { ...entity, sortOrder };
}

export class UnitOfWork {
  /** The injected connection pool. */
  private readonly pool: StatementPool;

  /**
   * @param pool - The pool to draw transactional connections from, supplied by the composition root.
   * This class never builds one, never reads a credential and never resolves a connection target;
   * Contrast model/dao/ProductDAO.cfc:L155-L158, :L329-L332 and :L420, which each construct a
   * credential-reading connection inside the data-access layer itself.
   */
  public constructor(pool: StatementPool) {
    this.pool = pool;
  }

  /**
   * Runs one unit of work inside one transaction and settles it on the caller's error state.
   *
   * @typeParam T - Whatever the unit of work produces.
   *
   * @param work - The unit of work. It receives a {@link TransactionScope} and must route every read
   * and every write through `scope.executor`; see M6 in the module header for what happens if it
   * does not.
   */
  public async run<T>(
    work: (scope: TransactionScope) => Promise<T>,
    hasErrors: () => boolean,
  ): Promise<T> {
    /*
     * Acquisition is translated, and it is the FIRST driver contact on the whole write path.
     *
     * `QueryRunner.runStatement` wraps its own `pool.execute` call, so a database this deployment cannot
     * reach classifies on the read path as a `DatabaseStatementError` and answers a neutral `500`. This
     * line is where the write path first touches the driver, and until it was wrapped the driver's raw
     * `Error` escaped the handler as an unrecognised failure: the same closed port answered
     * `500 {"message":"An unexpected error occurred"}` with `failureClass: "Error"` and no `code` in the
     * log record at all, so nothing counting failures by code could see write-path unavailability.
     * See `./QueryRunner.ts`'s {@link acquireConnectionTranslatingDriverFailure} for what is and is not
     * read off the caught value.
     *
     * The wrap is deliberately outside the `try` below, because there is nothing to settle or dispose
     * when no connection was ever handed over — `returnConnection` would have no argument to receive.
     */
    const connection = await acquireConnectionTranslatingDriverFailure(() =>
      this.pool.getConnection(),
    );
    const state: ConnectionState = { knownClean: true };

    try {
      return await runTransaction(connection, state, work, hasErrors);
    } finally {
      /*
       * The last step of AAP §0.3.2's sequence, and it runs on every path: after a commit, after a
       * roll-back, after a failed commit, after a failed roll-back and after a failure raised by the
       * work itself. A connection that is not returned is a connection the pool cannot re-use, and on
       * a warm container that is permanent — which is why the disposal is unconditional and only the
       * choice of disposal depends on what is known about the connection's state.
       */
      returnConnection(connection, state);
    }
  }

  /**
   * Runs one unit of work inside one transaction over collaborators built for that transaction, and
   * settles it on the error state of whatever the work produced.
   *
   * @typeParam TGraph - The collaborator graph this transaction's work runs against.
   * @typeParam TResult - Whatever the unit of work produces.
   *
   * @param buildGraph - Constructs the collaborators from the scope. It must pass `scope.executor` to
   * every repository it builds and must capture no executor from anywhere else; that is the single
   * obligation on which M6's visibility guarantee rests.
   *
   * @param work - The unit of work, run against the graph just built.
   */
  public async runScoped<TGraph, TResult>(
    buildGraph: (scope: TransactionScope) => TGraph,
    work: (graph: TGraph) => Promise<TResult>,
    reportErrors: (result: TResult) => boolean,
  ): Promise<TResult> {
    /*
     * Written as a one-member holder rather than a bare `TResult | undefined`, so a work that legitimately
     * produces `undefined` is still distinguishable from a work that has not settled yet.
     */
    let settled: { readonly result: TResult } | undefined;

    return this.run(
      async (scope) => {
        const result = await work(buildGraph(scope));

        settled = { result };

        return result;
      },
      () => {
        if (settled === undefined) {
          throw new DomainError(
            'The commit gate was consulted before the unit of work settled, so the error state it ' +
              'reports on does not exist yet and nothing may be committed.',
            { context: { member: 'UnitOfWork.runScoped' } },
          );
        }

        return reportErrors(settled.result);
      },
    );
  }

  /**
   * Runs one independent transaction per item, strictly sequentially, in the order given.
   *
   * TODO(parity) model/dao/ProductDAO.cfc:L176-L177 — the importer commits once per row and that is
   * preserved, not improved. :L176 opens the record loop and `transaction{` opens inside it at :L177;
   * The brace cascade closes the row transaction at :L284 and the loop at :L285. AAP §0.6.6: "each row
   * commits independently, so a mid-file failure leaves a partially imported catalog."
   *
   * @typeParam TItem - The item type, one per independent transaction.
   * @typeParam TResult - What each item's work produces.
   *
   * @param items - The items, in the order they must be processed — a materialised read-only list or a
   * lazy {@link PerItemSource}. this member never sorts, filters or reorders them, which is why a
   * list is accepted read-only and why a lazy source must already be in order.
   */
  public async runPerItem<TItem, TResult>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
  ): Promise<TResult[]> {
    const results: TResult[] = [];

    await this.runEachItem(items, work, (result) => {
      results.push(result);
    });

    return results;
  }

  /**
   * Runs one independent transaction per item, sequentially, and collects nothing.
   *
   * @typeParam TItem - The item type, one per independent transaction.
   *
   * @param items - The items, in the order they must be processed — a materialised read-only list or a
   * lazy {@link PerItemSource}.
   *
   * @param work - The per-item unit of work, whose result is not retained.
   * @throws Whatever an item's work threw, unchanged, after that item's transaction has been rolled
   * back. Items already committed stay committed and no further item is attempted.
   */
  public async runPerItemWithoutResults<TItem>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<void>,
  ): Promise<void> {
    await this.runEachItem(items, work, undefined);
  }

  /**
   * The one per-item loop, shared by the collecting and non-collecting members.
   *
   * @typeParam TItem - The item type.
   * @typeParam TResult - What each item's work produces; discarded when no collector is supplied.
   *
   * @param items - The items, in order. Either a materialised read-only list or a lazy source.
   * @param work - The per-item unit of work.
   * @param collect - Receives each committed item's result, or `undefined` to retain nothing.
   */
  private async runEachItem<TItem, TResult>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
    collect: ((result: TResult) => void) | undefined,
  ): Promise<void> {
    let connection: TransactionalStatementRunner | undefined;
    const state: ConnectionState = { knownClean: true };

    try {
      /*
       * `for await` consumes a materialised array and a lazy source through the same statement, so the
       * two cases cannot drift apart into two loops with two sets of settlement semantics. A synchronous
       * iterable yields synchronously here; the `await` per step is what a lazy source needs, and it
       * introduces no concurrency for either.
       */
      for await (const item of items) {
        /*
         * The first item pays for the checkout; every later item reuses it. See the note above.
         * Translated for the reason the acquisition in {@link UnitOfWork.run} is: an unreachable
         * database must classify identically whichever member of this class first touched the driver.
         * Inside the `try` here rather than outside it, because the loop may already hold a connection
         * from an earlier item, and the `finally` below is what returns it.
         */
        connection ??= await acquireConnectionTranslatingDriverFailure(() =>
          this.pool.getConnection(),
        );

        /*
         * Awaited inside the loop on purpose. This is the whole point of the member, and it is the one
         * place in this file where a well-meant concurrent settlement would destroy both M3's per-row
         * commit semantics and M6's insert ordering in a single stroke.
         */
        const result = await runTransaction(
          connection,
          state,
          (scope) => work(item, scope),
          NO_ACCUMULATED_ERRORS,
        );

        if (collect !== undefined) {
          collect(result);
        }
      }
    } finally {
      if (connection !== undefined) {
        returnConnection(connection, state);
      }
    }
  }

  /**
   * Runs work with no transaction at all, on the pool rather than on a checked-out connection.
   *
   * TODO(parity) model/dao/ProductDAO.cfc:l287-l325 — this member EXISTS for exactly two legacy
   * statements and for nothing else. After the import loop and its per-row transaction have both
   * closed at :L284-L285, the importer runs two bulk back-fills before `loadDataFromFile` ends at
   * L326: :L287-L302 sets the default SKU on every product that still lacks one, and :L303-L325 sets
   * each SKU's image file from its product. Neither is inside a transaction. The importer's real shape
   * is therefore N single-row transactions followed by two untransacted statements, and preserving that
   * means not wrapping the back-fills — wrapping them would make the import partially atomic in a way
   * the legacy never was.
   *
   * @typeParam T - Whatever the work produces.
   *
   * @param work - The untransacted work. It receives a pool-bound {@link ReadWriteSqlExecutor}.
   * @returns Whatever the work produced.
   * @throws Whatever the work threw, unchanged. There is no transaction to settle, so nothing is
   * rolled back and nothing needs to be.
   */
  public async runWithoutTransaction<T>(
    work: (executor: TransactionalSqlExecutor) => Promise<T>,
  ): Promise<T> {
    /*
     * Awaited rather than returned bare so that a callback which throws synchronously surfaces as a
     * rejection, exactly as it would from the two transactional members. Uniform failure semantics
     * across the three boundary shapes is worth one microtask.
     */
    return await work(createExecutor(this.pool));
  }

  /**
   * Assigns an entity its first sort order — the missing half of the block this class owns.
   *
   * @param executor - the transaction-scoped executor the insert itself will use.
   * @param tableName - the entity's physical table, whitelisted by {@link assertTableName}.
   * @param entity - the entity to seed; its `sortOrder` slot is written in place.
   * @param scope - the `sortContext` scope when the entity declares one; omitted for a whole-table seed.
   * @returns the assigned position, which is also now on the entity.
   */
  public async seedFirstSortOrder(
    executor: SqlExecutor,
    tableName: string,
    entity: SortOrderSeedTarget,
    scope?: SortOrderSeedScope,
  ): Promise<number> {
    /*
     * One implementation, reached two ways. The module-level {@link assignFirstSortOrder} carries the
     * whole of the ported lifecycle block so a write path holding a transaction-scoped executor can seed
     * without constructing a boundary object, and so this method and that path can never disagree about
     * what the legacy assigned.
     */
    return assignFirstSortOrder(executor, tableName, entity, scope);
  }

  /**
   * Reads the highest sort-order value in a table, optionally scoped to one parent.
   *
   * @param executor - Where to run the read. Inside a boundary this must be the boundary's
   * `scope.executor`.
   *
   * @param tableName - The table to read, in any of the three vocabularies the whitelist accepts. The
   * lifecycle sites pass the physical name; see the naming-convention note above.
   *
   * @returns The highest stored position, or zero when the table — or the scope — holds no rows.
   */
  public getTableTopSortOrder(executor: SqlExecutor, tableName: string): Promise<number>;

  /**
   * Reads the highest sort-order value within one parent's scope.
   *
   * @param executor - Where to run the read. Inside a boundary this must be the boundary's
   * `scope.executor`.
   *
   * @param tableName - The table to read.
   * @param contextIDColumn - The scoping column, validated against that table's declared columns.
   * @param contextIDValue - The scoping value, bound to a placeholder and never interpolated.
   * @returns The highest stored position within the scope, or zero when the scope holds no rows.
   */
  public getTableTopSortOrder(
    executor: SqlExecutor,
    tableName: string,
    contextIDColumn: string,
    contextIDValue: string,
  ): Promise<number>;

  public async getTableTopSortOrder(
    executor: SqlExecutor,
    tableName: string,
    contextIDColumn?: string,
    contextIDValue?: string,
  ): Promise<number> {
    /*
     * The statement, the whitelisting, the locking suffix and the empty-result refusal all live in the
     * module-level {@link readTableTopSortOrder}, which is also what the product write path calls. This
     * method is the boundary-object spelling of the same read, retained because the entity-lifecycle
     * seeding contract is declared against it.
     */
    return readTableTopSortOrder(executor, tableName, contextIDColumn, contextIDValue);
  }
}

/*
 * This module also holds the adapter that satisfies `TransactionalWriteRunner`, by wrapping
 * {@link UnitOfWork.run} and rebuilding the caller's graph against the boundary's own executor — the
 * mechanism M5 and AAP §0.6.2's read-back both depend on. AAP §0.4.1 freezes the subtree at 102
 * files, so it sits beside the boundary it wraps rather than in a module of its own.
 */

/**
 * Binds {@link TransactionalWriteRunner} to {@link UnitOfWork} — the adapter that gives a handler a
 * transaction without giving it a driver.
 */
/** The slice of {@link unitOfWork} this adapter uses. */
export type UnitOfWorkRunner = Pick<UnitOfWork, 'run'>;

/**
 * Builds the transaction-scoped capability graph a write path runs against.
 *
 * @typeParam TGraph - The capability set the caller's write path declared.
 */
export type TransactionGraphFactory<TGraph> = (
  scope: TransactionScope,
  security: RequestAuthorizationContext,
) => TGraph;

/**
 * Runs a caller's unit of work in one MySQL transaction, against a graph built for it.
 *
 * @typeParam TGraph - The transaction-scoped capabilities the caller's write path uses.
 */
export class MySqlTransactionalWriteRunner<TGraph> implements TransactionalWriteRunner<TGraph> {
  /**
   * @param unitOfWork - Owns the transaction lifecycle. See {@link UnitOfWorkRunner}.
   * @param buildGraph - Constructs the capability graph from the transaction's scope. See
   * {@link TransactionGraphFactory}.
   */
  public constructor(
    private readonly unitOfWork: UnitOfWorkRunner,
    private readonly buildGraph: TransactionGraphFactory<TGraph>,
  ) {}

  /**
   * @param work - The caller's writes, run against a graph bound to the open transaction.
   * @param hasErrors - The commit gate, forwarded unchanged and unwrapped. `UnitOfWork.run` evaluates it
   * once after the work settles and rolls back when it reports findings; interpreting it here would put
   * the decision in two places.
   *
   * @returns Whatever `work` produced, for a unit that committed.
   */
  public async runWrite<TResult>(
    security: RequestAuthorizationContext,
    work: (graph: TGraph) => Promise<TResult>,
    hasErrors: () => boolean,
  ): Promise<TResult> {
    return this.unitOfWork.run<TResult>(
      /*
       * The graph is built inside the transaction, from its scope and from this invocation's authorised
       * principal, and is discarded with it. The principal is forwarded rather than stored — review
       * finding. It is a parameter of the call, never a field of this class, so a warm
       * container cannot carry one invocation's identity into the next (M7); the factory is what binds it
       * into the graph's population and audit collaborators.
       */
      async (scope: TransactionScope): Promise<TResult> => work(this.buildGraph(scope, security)),
      hasErrors,
    );
  }
}

/** A compile-time reminder that a scope carries an executor and nothing more. */
export type TransactionScopeExecutor = TransactionScope['executor'] extends SqlExecutor
  ? SqlExecutor
  : never;
