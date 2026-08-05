/*
 * UniquePropertyChecker — application-side uniqueness checking for the extracted catalog slice (IR-5)
 *
 * Authority. AAP §0.4.1.7 ("MySQL Adapters") names this file create from `org/Hibachi/HibachiDAO.cfc`
 * and states the whole of its brief: reproduce "the existence query with its self-exclusion clause
 * including the observation that self-exclusion is a no-op on insert". IR-5 states the
 * requirement that brief serves — the check exists in addition to the `unique="true"` column
 * metadata, so it is observable behaviour and not a redundant safeguard.
 *
 * Locator, byte-verified. The legacy member spans `org/Hibachi/HibachiDAO.cfc:L130-L147`: the
 * author's hint sits at `:L129`, the declaration opens at `:L130`, its two arguments are declared at
 * `:L131` and `:L132`, the five accessor reads run `:L134-L138`, the statement is `:L140`, the
 * rows-found return is `:L142-L144`, the no-rows return is `:L146` and the closing tag is `:L147`.
 * AAP §0.4.1.7 cites the span one line short; the verified span is the one used throughout this file.
 * The immediate neighbour `getTableTopSortOrder`, which opens at `:L149`, is deliberately absent —
 * it is a sort-order query with nothing to do with uniqueness, and `../../ports/UniquePropertyPort`
 * records that exclusion so a reader can see it was considered rather than overlooked.
 *
 * TODO(parity) `model/validation/Option.json:L3` and `model/validation/OptionGroup.json:L4` declare
 * a save-context `unique` rule while `model/entity/Option.cfc` and `model/entity/OptionGroup.cfc`
 * declare no `unique="true"` at all. For those two properties this predicate is the only uniqueness
 * enforcement anywhere in the system: delete it and the constraint vanishes rather than degrading to
 * a database guarantee. Carried exactly as observed — no `unique="true"` is proposed, no schema
 * change is authored and no compensating behaviour is invented (AAP §0.7.3 and AAP §0.7.3).
 * `../../ports/UniquePropertyPort` records the same finding from the contract side.
 *
 * TODO(parity) D22 [model/dao/SkuDAO.cfc:L132] — `org/Hibachi/HibachiDAO.cfc:L140` interpolates the **logical** entity name, and
 * that is correct as written. The statement is expressed over the mapped object graph, where a
 * `Slatwall`-prefixed name is the legitimate vocabulary; the prefixing itself happens at five sites
 * in that same file, `getSmartList` at `:L104-L106` among them. `getEntityName()`
 */

import { DomainError } from '../../errors/DomainError';
import { assertColumnName, assertTableName } from './QueryRunner';

import type { PhysicalTableName, SqlExecutor } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import type { UniquePropertyEntity, UniquePropertyPort } from '../../ports/UniquePropertyPort';

/** The single column the URL-title probe may ever name. */
const URL_TITLE_COLUMN = 'urlTitle';

/** The three physical tables the URL-title probe may ever name. */
const URL_TITLE_TABLES: ReadonlySet<PhysicalTableName> = new Set<PhysicalTableName>([
  'SwProduct',
  'SwProductType',
  'SwBrand',
]);

/*
 * The locking read (CWE-367, check-then-act). Both probes below append `FOR UPDATE` when — and only when — this checker is bound to a
 * transaction-scoped executor. The pool-bound instance a composition root builds emits exactly the
 * statement `org/Hibachi/HibachiDAO.cfc:L140` and `model/dao/DataDAO.cfc:L122-L124` compose.
 */

/** The clause that turns a consistent read into a locking read. */
const LOCKING_READ_SUFFIX = ' FOR UPDATE';

/**
 * The MySQL implementation of application-side uniqueness checking.
 *
 * @example
 * ```ts
 * // A complete test double: no mocking library, no database, no pool.
 * Const calls: { sql: string; params: readonly unknown[] }[] = [];
 *
 * @example
 * ```ts
 * // Wired once in the composition root, over whichever executor the caller's transaction scope
 * // demands (see M6 in the module header).
 */
export class UniquePropertyChecker implements UniquePropertyPort {
  /** The injected execution boundary — the only way this class reaches a database. */
  private readonly executor: SqlExecutor;

  /** Whether {@link uniquePropertyChecker.executor} is transaction-scoped. */
  private readonly transactionScoped: boolean;

  /**
   * @param executor - the parameterized-execution boundary every statement runs through, supplied by
   * the composition root. This class never builds one, never reads a credential and never resolves
   * a connection target.
   */
  public constructor(executor: SqlExecutor, transactionScoped = false) {
    this.executor = executor;
    this.transactionScoped = transactionScoped;
  }

  /**
   * Returns an equivalent {@link UniquePropertyChecker} bound to a different statement executor.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns a new instance identical in every other respect.
   */
  public withExecutor(executor: SqlExecutor): UniquePropertyChecker {
    /*
     * — the returned instance is transaction-scoped, so both probes take a locking read. This
     * is the only site in the subtree that passes `true`, and it is asserted here because this is the only
     * place the executor is known to belong to an open boundary: that is the entire contract of this
     * member.
     */
    return new UniquePropertyChecker(executor, true);
  }

  /**
   * Reports whether `propertyName` on `entity` still holds a value no other row has taken.
   *
   * @param propertyName - the property to check, named as the validation rule names it — in practice
   * the trailing segment of a property identifier, computed at run time by
   * `org/Hibachi/HibachiValidationService.cfc:L469`, which is why it is not narrowed to a union.
   *
   * @param entity - the entity being validated, supplying the value under test, the identifier the
   * self-exclusion term compares against, and the three identifiers the statement names. Passed
   * whole, per `org/Hibachi/HibachiDAO.cfc:L132`.
   */
  public async isUniqueProperty(
    propertyName: string,
    entity: UniquePropertyEntity,
  ): Promise<boolean> {
    /*
     * `:L134-L138` — the five accessor reads, in the legacy order and under the legacy local names,
     * so this block reads as a transcription of the original rather than as a paraphrase of it.
     */
    const property = entity.getPropertyMetaData(propertyName).name;
    const entityName = entity.getEntityName();
    const entityID = entity.getPrimaryIDValue();
    const entityIDproperty = entity.getPrimaryIDPropertyName();
    const propertyValue: unknown = entity.getValueByPropertyIdentifier(propertyName);

    /*
     * The three identifiers of `:L140`, each resolved against the closed schema whitelist before any
     * statement text exists. `assertTableName` is also where D22 is discharged: it accepts the
     * logical name this entity reports and emits the physical name a native statement requires.
     */
    const table = assertTableName(entityName);
    const column = assertColumnName(table, property);
    const idColumn = assertColumnName(table, entityIDproperty);

    /*
     * `:L140`, translated. The predicate is carried across term for term, the alias is carried so the
     * two read as one statement in two dialects, and the self-exclusion term is unconditional.
     */
    /*
     * — the locking read, on a transaction-scoped instance only. Appended after `LIMIT 1`,
     * which is the only position MySQL accepts. On a pool-bound instance the suffix is empty and the
     * statement is byte-identical to `org/Hibachi/HibachiDAO.cfc:L140`'s translation.
     */
    const sql =
      `SELECT 1 FROM ${table} e WHERE e.${column} = ? AND e.${idColumn} != ? LIMIT 1` +
      (this.transactionScoped ? LOCKING_READ_SUFFIX : '');

    /*
     * TR-4 — the bound list is assembled in the legacy sequence: the compared value first, the
     * self-exclusion identifier second, matching the order the named parameters are supplied in at
     * `:L140`. Reversing them still compiles and still runs, and would compare each value against
     * the wrong column.
     */
    const rows: MySqlRow[] = await this.executor.execute(sql, [propertyValue, entityID]);

    // `:L142-L144` — any matching row means the value is taken.
    if (rows.length > 0) {
      return false;
    }

    // `:L146` — nothing matched, so the value is unique. True means unique.
    return true;
  }

  /**
   * Reports whether `value` is still free in the `urlTitle` column of `tableName`.
   *
   * TODO(parity) `model/service/DataService.cfc:L64` — `while(!unique)` has no ceiling in the legacy
   * source, so every colliding candidate issues another round trip indefinitely; a persistent
   * application server absorbed that as a slow request, and a stateless invocation cannot. No ceiling
   * is added on this side: a cap invented in the probe would be invisible to the algorithm that owns
   * the loop and would silently change which titles get produced. The ceiling belongs to the loop, and
   * `createUniqueURLTitle` in `src/util/urlTitle.ts` takes it as a required fourth argument — an
   * operator-stated figure, never one authored here (AAP §0.7.3, IR-12).
   *
   * @param tableName - the table whose `urlTitle` column to probe. Accepted in any of the
   * vocabularies `assertTableName` recognises and then required to resolve to one of the three
   * tables the legacy algorithm is actually invoked against.
   *
   * @param value - the candidate title, compared exactly as supplied. Not folded, not stripped and
   * not otherwise normalised — the legacy compared the stored value raw, and normalising here would
   * report collisions the database does not have or miss ones it does.
   */
  public async isUrlTitleAvailable(tableName: string, value: string): Promise<boolean> {
    /*
     * Resolve first, then constrain. `assertTableName` rejects anything outside the extracted schema
     * and normalises the survivors to their physical form, so the membership test below compares one
     * canonical name against three canonical names rather than trying to anticipate every spelling a
     * caller might use.
     */
    const table = assertTableName(tableName);

    if (!URL_TITLE_TABLES.has(table)) {
      throw new DomainError(
        'A URL-title availability probe named a table outside the three the legacy algorithm is ' +
          'invoked against, so it was refused before any statement text was assembled.',
        { context: { candidate: tableName, table } },
      );
    }

    /*
     * The second identifier of `:L123`. The column is a fixed literal rather than a parameter, and it
     * is still asserted, so a table that reached the whitelist without declaring the column fails
     * loudly instead of producing a statement that names a column the schema does not have.
     */
    const column = assertColumnName(table, URL_TITLE_COLUMN);

    /*
     * `:L122-L124`, translated: the table named, one placeholder, no alias and no self-exclusion term.
     */
    /*
     * — the same locking read, on a transaction-scoped instance only. It matters most for
     * `Brand.urlTitle`, which `src/util/urlTitle.ts` probes repeatedly before a save: without the lock two
     * concurrent derivations can both settle on the same suffix, and `SwBrand.urlTitle` is one of the five
     * columns that does carry a unique constraint, so the loser would fail at the write instead of
     * advancing to the next suffix.
     */
    const sql =
      `SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1` +
      (this.transactionScoped ? LOCKING_READ_SUFFIX : '');

    const rows: MySqlRow[] = await this.executor.execute(sql, [value]);

    // `:L126-L128` — a matching row means the title is already taken.
    if (rows.length > 0) {
      return false;
    }

    // `:L130` — nothing matched, so the title is free. True means available.
    return true;
  }
}
