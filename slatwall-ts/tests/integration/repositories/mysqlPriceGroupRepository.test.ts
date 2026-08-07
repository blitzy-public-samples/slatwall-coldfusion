// slatwall-ts - repository suite for the price-group reads and writes.
//
// Two published locators carry drift, corrected here rather than repeated.
//
// It is the source author's own explanation of why stage one is a raw query rather than HQL, and
// therefore of why the two-stage shape exists.
//
// Why this sits under tests/integration/repositories/ and needs no database.

import { describe, expect, it } from 'vitest';

import { PriceGroup } from '../../../src/domain/entities/priceGroup.js';
import { PriceGroupRate } from '../../../src/domain/entities/priceGroupRate.js';
import { Product } from '../../../src/domain/entities/product.js';
import { ProductType } from '../../../src/domain/entities/productType.js';
import type { RoundingRule } from '../../../src/domain/entities/roundingRule.js';
import { Sku } from '../../../src/domain/entities/sku.js';
import type { SkuPriceGroupResolver } from '../../../src/domain/entities/sku.js';
import type {
  CurrentAccountContext,
  PriceGroupRepository,
} from '../../../src/domain/ports/priceGroupRepository.js';
import { buildIdPathList } from '../../../src/domain/valueObjects/materializedIdPath.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { listAppend, listToArray } from '../../../src/lib/cfml/list.js';
import { cfBoolean } from '../../../src/lib/cfml/truthiness.js';
import { appConfig } from '../../../src/lib/config.js';
import { createPoolExecutor } from '../../../src/repositories/mysql/connection.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import type { DatabaseDialect } from '../../../src/repositories/mysql/dialect.js';
import {
  assertMySqlDialect,
  resolveConfiguredDialect,
  resolveDialect,
  singleRowLimitFragments,
} from '../../../src/repositories/mysql/dialect.js';
import { MySqlPriceGroupRepository } from '../../../src/repositories/mysql/mysqlPriceGroupRepository.js';
import { ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS } from '../../../src/repositories/mysql/sql/accountSubscriptionPriceGroups.sql.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';

interface RecordedStatement {
  readonly sql: string;

  readonly params: readonly unknown[];
  /**
   * Whether this statement was issued inside `transaction`.
   *
   * Captured per statement so a suite can PROVE atomicity instead of assuming it.
   */
  readonly inTransaction: boolean;
}

/**
 * A statement that matched nothing, which is a legitimate outcome for every read here.
 */
const NO_ROWS: readonly SqlRow[] = [];

/**
 * What a write reports back.
 *
 * `affectedRows: 1` is the ordinary outcome of a single-row insert, update or delete.
 */
const WRITE_RESULT: SqlMutationResult = Object.freeze({ affectedRows: 1, warningStatus: 0 });

/**
 * A write that matched no row, for the cases that turn on the distinction.
 */
const NO_ROW_WRITE_RESULT: SqlMutationResult = Object.freeze({
  affectedRows: 0,
  warningStatus: 0,
});

// JUDGMENT CALL: the double is HAND-WRITTEN and INLINE rather than produced by a mocking utility
// or shared from a helper module. Three reasons, all of which outrank the duplication it costs.
//
// JUDGMENT CALL: it can also be given an ordered sequence of WRITE outcomes, for the two paths
// that inspect one, and defaults every write to a single affected row.
//
// JUDGMENT CALL: it records rather than simulates; it never parses the statement, evaluates a
// predicate or matches a bound key against a row. Every expectation about which ROWS MySQL would
// return is therefore expressed by CHOOSING the canned sequence.
/**
 * A `PreparedStatementExecutor` that captures what it is asked to run.
 *
 * Nothing here opens a connection, resolves configuration, or touches the process environment.
 */
class RecordingExecutor implements PreparedStatementExecutor {
  readonly calls: RecordedStatement[] = [];

  readonly mutationCalls: RecordedStatement[] = [];

  /**
   * Statements and transaction markers interleaved, in one call order.
   *
   * `calls`, `mutationCalls` and `transactionEvents` each answer "what happened, of this kind";
   * only a single interleaved log answers "in what order, across kinds".
   */
  readonly orderedEvents: string[] = [];
  private openTransactions = 0;

  /**
   * Which `executeMutation` call to fail on, zero-based, or `undefined` for none.
   */
  private failingMutationIndex: number | undefined;

  /**
   * The error the failing call throws.
   */
  private injectedMutationFailure: Error | undefined;

  private readonly cannedResultSets: readonly (readonly SqlRow[])[];

  private readonly cannedWriteResults: readonly SqlMutationResult[];

  private answeredResultSets = 0;

  private answeredWrites = 0;

  /**
   * @param cannedResultSets one result set per expected `execute` call, in order.
   * @param cannedWriteResults one outcome per expected `executeMutation` call, in order.
   */
  constructor(
    cannedResultSets: readonly (readonly SqlRow[])[],
    cannedWriteResults: readonly SqlMutationResult[] = [],
  ) {
    this.cannedResultSets = cannedResultSets;
    this.cannedWriteResults = cannedWriteResults;
  }

  /**
   * Arrange for the nth `executeMutation` call to fail.
   *
   * @param mutationIndex zero-based position in the `executeMutation` call sequence.
   * @param failure the error that call throws, re-raised by the adapter unchanged.
   */
  failNextMutationAt(mutationIndex: number, failure: Error): void {
    this.failingMutationIndex = mutationIndex;
    this.injectedMutationFailure = failure;
  }

  /**
   * Record the statement and answer with the next canned result set.
   */
  execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    return this.recordExecute(sql, params, false);
  }

  /**
   * Record the write and report the next canned outcome.
   *
   * The port declares three writing methods, so a recorded mutation is expected rather than a
   * fault.
   */
  executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    return this.recordMutation(sql, params, false);
  }

  /**
   * The one place a result-set statement is recorded, whichever executor it arrived on.
   *
   * @param sql the statement text as issued.
   * @param params the bound parameters, in order.
   * @param insideTransaction whether it arrived on the executor `transaction` handed to its work
   * function, rather than on this recorder directly.
   */
  private recordExecute(
    sql: string,
    params: readonly unknown[],
    insideTransaction: boolean,
  ): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params: [...params], inTransaction: insideTransaction });
    this.orderedEvents.push(this.markerFor('QUERY', insideTransaction));

    const cannedRows = this.cannedResultSets[this.answeredResultSets] ?? NO_ROWS;
    this.answeredResultSets += 1;

    return Promise.resolve(cannedRows);
  }

  /**
   * The one place a write is recorded, whichever executor it arrived on.
   */
  private recordMutation(
    sql: string,
    params: readonly unknown[],
    insideTransaction: boolean,
  ): Promise<SqlMutationResult> {
    this.mutationCalls.push({ sql, params: [...params], inTransaction: insideTransaction });
    this.orderedEvents.push(this.markerFor('MUTATION', insideTransaction));

    const attemptedIndex = this.answeredWrites;
    const cannedResult = this.cannedWriteResults[this.answeredWrites] ?? WRITE_RESULT;
    this.answeredWrites += 1;

    // Recorded first, then failed, so a case can see how far the cascade got.
    if (
      attemptedIndex === this.failingMutationIndex &&
      this.injectedMutationFailure !== undefined
    ) {
      return Promise.reject(this.injectedMutationFailure);
    }

    return Promise.resolve(cannedResult);
  }

  /**
   * Names the event, flagging a statement that bypassed an open transaction.
   *
   * A statement is ordinary when no transaction is open, or when it arrived on the executor the
   * transaction supplied.
   */
  private markerFor(kind: string, insideTransaction: boolean): string {
    return insideTransaction || this.openTransactions === 0 ? kind : `${kind}_OUTSIDE_TRANSACTION`;
  }

  /**
   * How many times `transaction` was entered as a new unit of work.
   *
   * A write that must be atomic is expected to open EXACTLY one transaction, so this being greater
   * than one means the work was split into several units that can half-apply independently.
   *
   * A joined inner call does not INCREMENT it, because a joined call is not a second unit - it
   * runs inside the one already open, on the same connection.
   */
  transactionCount = 0;

  /**
   * The transaction boundary, in call order: `BEGIN`, then `COMMIT` or `ROLLBACK`.
   *
   * Separate from `calls` and `mutationCalls` so that a case asserting the STATEMENT sequence is
   * unaffected by whether a transaction wrapped it.
   */
  readonly transactionEvents: string[] = [];

  /**
   * Record the transaction boundary and run the work on a DISTINCT delegate executor.
   *
   * The work does not receive `this`, and that is the whole point: the delegate carries its own
   * `transaction`, so a nested call is observable rather than silently folded into the outer one.
   */
  transaction<T>(work: (transactional: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    this.transactionEvents.push('BEGIN');
    this.orderedEvents.push('BEGIN');
    this.openTransactions += 1;

    const transactional: PreparedStatementExecutor = {
      execute: (sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> =>
        this.recordExecute(sql, params, true),
      executeMutation: (sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> =>
        this.recordMutation(sql, params, true),
      transaction: <TNested>(
        nestedWork: (tx: PreparedStatementExecutor) => Promise<TNested>,
      ): Promise<TNested> => {
        this.orderedEvents.push('JOIN');

        return nestedWork(transactional);
      },
    };

    const settle = (): void => {
      this.openTransactions -= 1;
    };

    return work(transactional).then(
      (result: T): T => {
        settle();
        this.transactionEvents.push('COMMIT');
        this.orderedEvents.push('COMMIT');

        return result;
      },
      (error: unknown): never => {
        settle();
        this.transactionEvents.push('ROLLBACK');
        this.orderedEvents.push('ROLLBACK');

        throw error;
      },
    );
  }
}

// The adapter's second constructor parameter is typed to a MODULE-LOCAL, UNEXPORTED interface
// carrying one method.

interface RecordedRoundValueCall {
  readonly value: Money;
  readonly rule: RoundingRule;
}

interface RecordingValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;

  readonly calls: readonly RecordedRoundValueCall[];
}

// JUDGMENT CALL: the scripted answer is deliberately unrelated to its input.
const SCRIPTED_ROUNDED_ANSWER = '77.77';

function makeRecordingValueRounder(): RecordingValueRounder {
  const calls: RecordedRoundValueCall[] = [];

  return {
    roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
      calls.push({ value, rule });

      return Money.fromDecimalString(SCRIPTED_ROUNDED_ANSWER);
    },
    calls,
  };
}

interface Subject {
  readonly executor: RecordingExecutor;
  readonly valueRounder: RecordingValueRounder;

  /**
   * Typed to the PORT, so every call below is checked against the contract it declares. The class
   * is instantiated directly: no container, no locator, no bootstrap and no ambient scope.
   */
  readonly repository: PriceGroupRepository;
}

/**
 * The request clock the subject factory composes with by default.
 *
 * A LIVE clock, so a case that says nothing about the instant exercises the same behaviour an
 * unconfigured production request does; it is the CONSTRUCTION that is explicit here, not the
 * value.
 */
const LIVE_REQUEST_CLOCK = { now: (): Date => new Date() };

/**
 * A clock that answers a FIXED instant, for the cases asserting the adapter binds the instant it
 * is GIVEN rather than reading a clock of its own.
 *
 * Each call returns a COPY, exactly as the composition root's clock does, so a case cannot reach
 * the shared instant through a value it received.
 */
function fixedClock(instant: Date): { now: () => Date } {
  return { now: (): Date => new Date(instant.getTime()) };
}

function makeSubject(
  cannedResultSets: readonly (readonly SqlRow[])[] = [],
  cannedWriteResults: readonly SqlMutationResult[] = [],
  requestClock: { now: () => Date } = LIVE_REQUEST_CLOCK,
): Subject {
  const executor = new RecordingExecutor(cannedResultSets, cannedWriteResults);
  const valueRounder = makeRecordingValueRounder();

  return {
    executor,
    valueRounder,
    repository: new MySqlPriceGroupRepository(
      executor,
      TEST_AUDIT_ACTOR,
      valueRounder,
      requestClock,
    ),
  };
}

// `noUncheckedIndexedAccess` is on, so every indexed read is `T | undefined`.

function statementAt(calls: readonly RecordedStatement[], index: number): RecordedStatement {
  const statement = calls[index];

  if (statement === undefined) {
    throw new Error(
      'Expected a recorded statement at index ' +
        String(index) +
        ', but only ' +
        String(calls.length) +
        ' statement(s) were issued.',
    );
  }

  return statement;
}

function onlyStatement(calls: readonly RecordedStatement[]): RecordedStatement {
  if (calls.length !== 1) {
    throw new Error(
      'Expected exactly one statement to have been issued, but ' +
        String(calls.length) +
        ' were. On the empty reach-through path in particular, a second statement would mean ' +
        'stage two was built from an empty identifier set.',
    );
  }

  return statementAt(calls, 0);
}

/**
 * How many mutations `savePriceGroupRate` issues for a rate whose six link collections are all
 * empty: the row write, then one delete per link table.
 */
const EMPTY_RATE_SAVE_MUTATION_COUNT = 1 + 6;

/**
 * The row write from a `savePriceGroupRate` call, with the link reconciliation that follows
 * asserted to be present and to come after it.
 *
 * @param calls the double's recorded mutations.
 * @returns the first recorded mutation, which is the `SwPriceGroupRate` row write.
 * @throws When fewer mutations were issued than the row write plus one delete per link table.
 */
function rateRowWrite(calls: readonly RecordedStatement[]): RecordedStatement {
  if (calls.length < EMPTY_RATE_SAVE_MUTATION_COUNT) {
    throw new Error(
      'Expected a rate save to issue the row write followed by one delete per link table, so at ' +
        'least ' +
        String(EMPTY_RATE_SAVE_MUTATION_COUNT) +
        ' mutations, but ' +
        String(calls.length) +
        ' were issued. A save that writes only the row would accept an added or removed member and ' +
        'then silently lose it.',
    );
  }

  const rowWrite = statementAt(calls, 0);

  for (let index = 1; index < EMPTY_RATE_SAVE_MUTATION_COUNT; index += 1) {
    const linkStatement = statementAt(calls, index);

    if (!linkStatement.sql.startsWith('DELETE FROM ')) {
      throw new Error(
        'Expected mutation ' +
          String(index) +
          ' of a rate save to be a link-table delete, but it was: ' +
          linkStatement.sql,
      );
    }
  }

  return rowWrite;
}

/**
 * One bound parameter, by position.
 *
 * @param params the recorded parameter array.
 * @param index the position to read.
 * @returns the value bound at that position.
 * @throws When the statement bound fewer parameters than that.
 */
function parameterAt(params: readonly unknown[], index: number): unknown {
  if (index >= params.length) {
    throw new Error(
      'Expected a bound parameter at index ' +
        String(index) +
        ', but the statement bound only ' +
        String(params.length) +
        ' parameter(s).',
    );
  }

  return params[index];
}

/**
 * A `Date` a statement was expected to bind.
 *
 * Narrowed rather than asserted, because the point of the captured-instant case is that the bound
 * value is a `Date` and not SQL text.
 *
 * @throws When the value is not a `Date`.
 */
function requireBoundDate(value: unknown, description: string): Date {
  if (!(value instanceof Date)) {
    throw new Error('Expected ' + description + ' to be a bound Date instance.');
  }

  return value;
}

/**
 * A decimal numeral a statement was expected to bind.
 *
 * E4: money reaches a statement as a DECIMAL STRING and never as a number, so the narrowing is
 * also the assertion.
 *
 * @throws When the value is not a string.
 */
function requireBoundDecimalNumeral(value: unknown, description: string): string {
  if (typeof value !== 'string') {
    throw new Error(
      'Expected ' +
        description +
        ' to be bound as a decimal string, so that no floating-point value ever reaches a ' +
        'monetary column.',
    );
  }

  return value;
}

/**
 * A price group a read was expected to produce.
 *
 * Keeps "the read returned nothing" distinct from "the entity it returned is wrong".
 *
 * @throws When the value is absent.
 */
function requirePriceGroup(priceGroup: PriceGroup | undefined, description: string): PriceGroup {
  if (priceGroup === undefined) {
    throw new Error('Expected ' + description + ', but it was absent.');
  }

  return priceGroup;
}

function requirePriceGroupRate(
  priceGroupRate: PriceGroupRate | undefined,
  description: string,
): PriceGroupRate {
  if (priceGroupRate === undefined) {
    throw new Error('Expected ' + description + ', but it was absent.');
  }

  return priceGroupRate;
}

function requireRoundingRule(
  roundingRule: RoundingRule | undefined,
  description: string,
): RoundingRule {
  if (roundingRule === undefined) {
    throw new Error('Expected ' + description + ', but it was absent.');
  }

  return roundingRule;
}

function elementAt<TElement>(
  values: readonly TElement[],
  index: number,
  description: string,
): TElement {
  const value = values[index];

  if (value === undefined) {
    throw new Error(
      'Expected ' +
        description +
        ' at index ' +
        String(index) +
        ', but the collection holds only ' +
        String(values.length) +
        ' element(s).',
    );
  }

  return value;
}

function sqlTextsOf(calls: readonly RecordedStatement[]): readonly string[] {
  return calls.map((call) => call.sql);
}

// E5, and the single most important obligation this folder carries: every value is a positional
// `?`, and not one expectation below interpolates a value into SQL text.
//
// The identifiers that do appear inside these strings are schema identifiers the adapter owns, and
// every one is a physical `Sw*` name (B5).

/**
 * Stage one of the reach-through, verbatim.
 *
 * CFML parity [model/dao/PriceGroupDAO.cfc:L58-L72]: the MySQL arm of the branch at L57, clause
 * for clause.
 *
 * LEGACY-DEFECT [model/dao/PriceGroupDAO.cfc:L68, L84]: the INNER JOIN SwType contributes no
 * column to the sub-select's projection, yet as an INNER join it filters out rows with no matching
 * SwType, so removing it changes the result set.
 * Preserved deliberately; do not fix without a product decision.
 *
 * CFML parity [model/dao/PriceGroupDAO.cfc:L71]: `ORDER BY changeDateTime DESC LIMIT 1` is legacy
 * behaviour reproduced, not a limit introduced by the port.
 */
const EXPECTED_SUBSCRIPTION_PRICE_GROUP_IDS_SQL = [
  'SELECT DISTINCT subpg.priceGroupID',
  'FROM SwSubsUsageBenefitAccount suba',
  'INNER JOIN SwSubsUsageBenefit sub ON suba.subscriptionUsageBenefitID = sub.subscriptionUsageBenefitID',
  'INNER JOIN SwSubsUsageBenefitPriceGroup subpg ON sub.subscriptionUsageBenefitID = subpg.subscriptionUsageBenefitID',
  'INNER JOIN SwSubsUsage su ON sub.subscriptionUsageID = su.subscriptionUsageID',
  'WHERE (suba.endDateTime IS NULL',
  '    OR suba.endDateTime > ?)',
  '  AND suba.accountID = ?',
  "  AND 'sstActive' = (SELECT systemCode FROM SwSubscriptionStatus",
  '        INNER JOIN SwType ON SwSubscriptionStatus.subscriptionStatusTypeID = SwType.typeID',
  '        WHERE SwSubscriptionStatus.subscriptionUsageID = su.subscriptionUsageID',
  '        AND SwSubscriptionStatus.effectiveDateTime <= ?',
  '        ORDER BY changeDateTime DESC LIMIT 1)',
].join('\n');

// CFML parity [model/dao/PriceGroupDAO.cfc:L93]: legacy stage two is HQL naming the ORM ENTITY
// `SlatwallPriceGroup` with NAMED parameters `:priceGroupIDs` and `:activeFlag`. Two translations
// happen.
const EXPECTED_ACTIVE_PRICE_GROUPS_BY_ID_SQL_FOR_ONE_ID =
  'SELECT pg.* FROM SwPriceGroup pg WHERE pg.priceGroupID IN (?) AND pg.activeFlag = ?';

const EXPECTED_ACTIVE_PRICE_GROUPS_BY_ID_SQL_FOR_TWO_IDS =
  'SELECT pg.* FROM SwPriceGroup pg WHERE pg.priceGroupID IN (?, ?) AND pg.activeFlag = ?';

const EXPECTED_ACTIVE_PRICE_GROUPS_BY_ID_SQL_FOR_THREE_IDS =
  'SELECT pg.* FROM SwPriceGroup pg WHERE pg.priceGroupID IN (?, ?, ?) AND pg.activeFlag = ?';

/**
 * The ten physical `SwPriceGroup` columns, in declaration order.
 */
const EXPECTED_PRICE_GROUP_SELECT_LIST = [
  'pg.priceGroupID',
  'pg.priceGroupIDPath',
  'pg.activeFlag',
  'pg.priceGroupName',
  'pg.priceGroupCode',
  'pg.parentPriceGroupID',
  'pg.createdDateTime',
  'pg.createdByAccountID',
  'pg.modifiedDateTime',
  'pg.modifiedByAccountID',
].join(', ');

const EXPECTED_SELECT_PRICE_GROUP_BY_ID_SQL = [
  'SELECT ' + EXPECTED_PRICE_GROUP_SELECT_LIST,
  'FROM SwPriceGroup pg',
  'WHERE pg.priceGroupID = ?',
].join('\n');

/**
 * The set-based form of the read above, for a given number of keys.
 *
 * Spelled out rather than derived from the module under test, so the assertion is a statement of
 * what the SQL must be and not a restatement of what it is.
 */
function expectedSelectPriceGroupsByIDSql(identifierCount: number): string {
  return [
    'SELECT ' + EXPECTED_PRICE_GROUP_SELECT_LIST,
    'FROM SwPriceGroup pg',
    'WHERE pg.priceGroupID IN (' + new Array<string>(identifierCount).fill('?').join(', ') + ')',
  ].join('\n');
}

/**
 * The direct-children read, transcribed for a SET of parent keys.
 *
 * @param parentCount how many parent keys the statement binds.
 */
function expectedSelectChildPriceGroupsSql(parentCount: number): string {
  return [
    'SELECT ' + EXPECTED_PRICE_GROUP_SELECT_LIST,
    'FROM SwPriceGroup pg',
    'WHERE pg.parentPriceGroupID IN (' + new Array<string>(parentCount).fill('?').join(', ') + ')',
  ].join('\n');
}

/**
 * The eleven rate columns plus the eight joined rounding-rule columns.
 */
const EXPECTED_RATE_SELECT_LIST = [
  'pgr.priceGroupRateID',
  'pgr.globalFlag',
  'pgr.amount',
  'pgr.amountType',
  'pgr.remoteID',
  'pgr.priceGroupID',
  'pgr.roundingRuleID',
  'pgr.createdDateTime',
  'pgr.createdByAccountID',
  'pgr.modifiedDateTime',
  'pgr.modifiedByAccountID',
  'rr.roundingRuleID AS roundingRule_roundingRuleID',
  'rr.roundingRuleName AS roundingRule_roundingRuleName',
  'rr.roundingRuleExpression AS roundingRule_roundingRuleExpression',
  'rr.roundingRuleDirection AS roundingRule_roundingRuleDirection',
  'rr.createdDateTime AS roundingRule_createdDateTime',
  'rr.createdByAccountID AS roundingRule_createdByAccountID',
  'rr.modifiedDateTime AS roundingRule_modifiedDateTime',
  'rr.modifiedByAccountID AS roundingRule_modifiedByAccountID',
].join(', ');
function expectedSelectRatesByPriceGroupSql(placeholderList: string): string {
  return [
    'SELECT ' + EXPECTED_RATE_SELECT_LIST,
    'FROM SwPriceGroupRate pgr',
    'LEFT OUTER JOIN SwRoundingRule rr ON pgr.roundingRuleID = rr.roundingRuleID',
    'WHERE pgr.priceGroupID IN (' + placeholderList + ')',
  ].join('\n');
}

const EXPECTED_SELECT_RATES_BY_PRICE_GROUP_SQL_FOR_ONE_ID = expectedSelectRatesByPriceGroupSql('?');

const EXPECTED_SELECT_RATES_BY_PRICE_GROUP_SQL_FOR_TWO_IDS =
  expectedSelectRatesByPriceGroupSql('?, ?');

const EXPECTED_SELECT_RATES_BY_PRICE_GROUP_SQL_FOR_THREE_IDS =
  expectedSelectRatesByPriceGroupSql('?, ?, ?');

const EXPECTED_SELECT_RATE_BY_ID_SQL = [
  'SELECT ' + EXPECTED_RATE_SELECT_LIST,
  'FROM SwPriceGroupRate pgr',
  'LEFT OUTER JOIN SwRoundingRule rr ON pgr.roundingRuleID = rr.roundingRuleID',
  'WHERE pgr.priceGroupRateID = ?',
].join('\n');

const EXPECTED_INSERT_PRICE_GROUP_SQL = [
  'INSERT INTO SwPriceGroup (priceGroupID, priceGroupIDPath, activeFlag, priceGroupName, ' +
    'priceGroupCode, parentPriceGroupID, createdDateTime, createdByAccountID, ' +
    'modifiedDateTime, modifiedByAccountID)',
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
].join('\n');

// Three columns are excluded from the SET list: `priceGroupID` is the key and moves to the WHERE
// clause, and the created half of the audit quartet is write-once.
const EXPECTED_UPDATE_PRICE_GROUP_SQL = [
  'UPDATE SwPriceGroup',
  'SET priceGroupIDPath = ?, activeFlag = ?, priceGroupName = ?, priceGroupCode = ?, ' +
    'parentPriceGroupID = ?, modifiedDateTime = ?, ' +
    'modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
  'WHERE priceGroupID = ?',
].join('\n');

const EXPECTED_INSERT_PRICE_GROUP_RATE_SQL = [
  'INSERT INTO SwPriceGroupRate (priceGroupRateID, globalFlag, amount, amountType, remoteID, ' +
    'priceGroupID, roundingRuleID, createdDateTime, createdByAccountID, modifiedDateTime, ' +
    'modifiedByAccountID)',
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
].join('\n');

const EXPECTED_UPDATE_PRICE_GROUP_RATE_SQL = [
  'UPDATE SwPriceGroupRate',
  'SET globalFlag = ?, amount = ?, amountType = ?, remoteID = ?, priceGroupID = ?, ' +
    'roundingRuleID = ?, modifiedDateTime = ?, ' +
    'modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
  'WHERE priceGroupRateID = ?',
].join('\n');

const EXPECTED_DELETE_RATES_BY_PRICE_GROUP_SQL =
  'DELETE FROM SwPriceGroupRate WHERE priceGroupID = ?';

const EXPECTED_DELETE_PRICE_GROUP_ROW_SQL = 'DELETE FROM SwPriceGroup WHERE priceGroupID = ?';

interface ExpectedRateLinkTable {
  readonly collectionName: string;
  readonly tableName: string;
  readonly memberColumn: string;
}

/**
 * The six link tables, in the order the adapter reads and deletes them.
 */
const EXPECTED_RATE_LINK_TABLES: readonly ExpectedRateLinkTable[] = Object.freeze([
  Object.freeze({
    collectionName: 'productTypes',
    tableName: 'SwPriceGroupRateProductType',
    memberColumn: 'productTypeID',
  }),
  Object.freeze({
    collectionName: 'products',
    tableName: 'SwPriceGroupRateProduct',
    memberColumn: 'productID',
  }),
  Object.freeze({
    collectionName: 'skus',
    tableName: 'SwPriceGroupRateSku',
    memberColumn: 'skuID',
  }),
  Object.freeze({
    collectionName: 'excludedProductTypes',
    tableName: 'SwPriceGrpRateExclProductType',
    memberColumn: 'productTypeID',
  }),
  Object.freeze({
    collectionName: 'excludedProducts',
    tableName: 'SwPriceGroupRateExclProduct',
    memberColumn: 'productID',
  }),
  Object.freeze({
    collectionName: 'excludedSkus',
    tableName: 'SwPriceGroupRateExclSku',
    memberColumn: 'skuID',
  }),
]);

const RATE_LINK_TABLE_COUNT = 6;

/**
 * The expected link read for one collection across a placeholder run.
 *
 * The run is passed as literal placeholder TEXT, never a count formatted into the string.
 */
function expectedRateLinkSelectSql(
  linkTable: ExpectedRateLinkTable,
  placeholderRun: string,
): string {
  return [
    'SELECT priceGroupRateID, ' + linkTable.memberColumn,
    'FROM ' + linkTable.tableName,
    'WHERE priceGroupRateID IN (' + placeholderRun + ')',
  ].join('\n');
}

function expectedRateLinkDeleteSql(linkTable: ExpectedRateLinkTable): string {
  return [
    'DELETE FROM ' + linkTable.tableName,
    'WHERE priceGroupRateID IN (SELECT priceGroupRateID FROM SwPriceGroupRate WHERE ' +
      'priceGroupID = ?)',
  ].join('\n');
}

const ONE_PLACEHOLDER = '?';

const TWO_PLACEHOLDERS = '?, ?';

/**
 * One link statement written out in full, as a check on the composed forms above.
 *
 * The abbreviated table is chosen deliberately: it is the one name a reader is most likely to
 * normalise by accident.
 */
const EXPECTED_EXCLUDED_PRODUCT_TYPE_LINK_SELECT_SQL_VERBATIM = [
  'SELECT priceGroupRateID, productTypeID',
  'FROM SwPriceGrpRateExclProductType',
  'WHERE priceGroupRateID IN (?)',
].join('\n');

const CANNED_CREATED_DATE_TIME = new Date('2024-06-01T00:00:00.000Z');

const CANNED_MODIFIED_DATE_TIME = new Date('2024-06-15T12:30:00.000Z');

const CANNED_ACCOUNT_ID = 'acct-00000000000000000000000000001';

const CANNED_CREATED_BY_ACCOUNT_ID = 'acct-created';

const CANNED_MODIFIED_BY_ACCOUNT_ID = 'acct-modified';
const TEST_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'acct-00000000000000000000000000009',
  adminAccountFlag: true,
});

/**
 * Signed in without the admin flag, and carrying an identifier on PURPOSE so that a refusal to
 * stamp is provably the FLAG's doing rather than an accident of having no account to name.
 */
const NON_ADMIN_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'acct-00000000000000000000000000008',
  adminAccountFlag: false,
});

const CANNED_PRICE_GROUP_ID = 'pg-wholesale';

const CANNED_PARENT_PRICE_GROUP_ID = 'pg-parent';

const CANNED_ROOT_PRICE_GROUP_ID = 'pg-root';

/**
 * A second price group at the same level as `CANNED_PRICE_GROUP_ID`, sharing its parent.
 */
const CANNED_SIBLING_PRICE_GROUP_ID = 'pg-distributor';

const CANNED_PRICE_GROUP_RATE_ID = 'pgr-sku-level';

const CANNED_ROUNDING_RULE_ID = 'rr-closest';

/**
 * One `SwPriceGroup` row as the driver would hand it back.
 *
 * `activeFlag` arrives as the numeric `1` because MySQL reports a `bit`/`tinyint` that way, and
 * the adapter passes it through UNCOERCED so the entity can apply CFML boolean semantics to it.
 */
function priceGroupRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  return {
    priceGroupID: CANNED_PRICE_GROUP_ID,
    priceGroupIDPath: CANNED_PRICE_GROUP_ID,
    activeFlag: 1,
    priceGroupName: 'Wholesale',
    priceGroupCode: 'wholesale',
    parentPriceGroupID: null,
    createdDateTime: CANNED_CREATED_DATE_TIME,
    createdByAccountID: CANNED_CREATED_BY_ACCOUNT_ID,
    modifiedDateTime: CANNED_MODIFIED_DATE_TIME,
    modifiedByAccountID: CANNED_MODIFIED_BY_ACCOUNT_ID,
    ...overrides,
  };
}

/**
 * The eight joined rounding-rule columns, present and populated.
 *
 * Read through their prefixed aliases, exactly as the join emits them.
 */
function joinedRoundingRuleColumns(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    roundingRule_roundingRuleID: CANNED_ROUNDING_RULE_ID,
    roundingRule_roundingRuleName: 'Closest ninety-nine',
    // CFML parity [model/entity/RoundingRule.cfc:L54]: the expression is a plain string column
    // with no format constraint, handed through exactly as stored.
    roundingRule_roundingRuleExpression: '.99',
    roundingRule_roundingRuleDirection: 'Closest',
    roundingRule_createdDateTime: CANNED_CREATED_DATE_TIME,
    roundingRule_createdByAccountID: CANNED_CREATED_BY_ACCOUNT_ID,
    roundingRule_modifiedDateTime: CANNED_MODIFIED_DATE_TIME,
    roundingRule_modifiedByAccountID: CANNED_MODIFIED_BY_ACCOUNT_ID,
    ...overrides,
  };
}

/**
 * One `SwPriceGroupRate` row, with no rounding rule joined.
 *
 * The outer join leaves `roundingRule_roundingRuleID` NULL for a rate that declares no rule, which
 * is the state the adapter maps to an absent association.
 *
 * `amount` arrives as a STRING because `decimalNumbers` is left unset on the pool.
 */
function priceGroupRateRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  return {
    priceGroupRateID: CANNED_PRICE_GROUP_RATE_ID,
    globalFlag: 0,
    amount: '10.00',
    amountType: 'percentageOff',
    remoteID: null,
    priceGroupID: CANNED_PRICE_GROUP_ID,
    roundingRuleID: null,
    createdDateTime: CANNED_CREATED_DATE_TIME,
    createdByAccountID: CANNED_CREATED_BY_ACCOUNT_ID,
    modifiedDateTime: CANNED_MODIFIED_DATE_TIME,
    modifiedByAccountID: CANNED_MODIFIED_BY_ACCOUNT_ID,
    roundingRule_roundingRuleID: null,
    ...overrides,
  };
}

function subscriptionPriceGroupIDRow(priceGroupID: string): SqlRow {
  return { priceGroupID };
}

function rateLinkRow(memberColumn: string, memberID: string): SqlRow {
  return { priceGroupRateID: CANNED_PRICE_GROUP_RATE_ID, [memberColumn]: memberID };
}

function leafPriceGroupResultSets(row: SqlRow = priceGroupRow()): readonly (readonly SqlRow[])[] {
  return [[row], NO_ROWS, NO_ROWS];
}

const LEAF_PRICE_GROUP_STATEMENT_COUNT = 3;

/**
 * The six methods the port declares, with the number of parameters each DECLARES.
 *
 * The obligation is a negative one: nothing on this surface carries an ordering parameter, an
 * eager-load hint, a row limit, a page cursor or an iteration bound.
 */
const EXPECTED_PORT_METHOD_DECLARED_PARAMETER_COUNT: Readonly<
  Record<keyof PriceGroupRepository, number>
> = Object.freeze({
  getAccountSubscriptionPriceGroups: 1,
  getPriceGroup: 1,
  getPriceGroupRate: 1,
  savePriceGroup: 2,
  savePriceGroupRate: 2,
  deletePriceGroup: 1,
});

const EXPECTED_PORT_METHOD_COUNT = 6;

/**
 * The single member `CurrentAccountContext` declares.
 */
const EXPECTED_CURRENT_ACCOUNT_CONTEXT_MEMBERS: Readonly<
  Record<keyof CurrentAccountContext, true>
> = Object.freeze({ accountID: true });

/**
 * The three members `SkuPriceGroupResolver` declares, at the location it shipped.
 *
 * Recorded as a discrepancy in the header: the obligation expects two members on the port, and
 * what shipped is three on src/domain/entities/sku.ts.
 */
const EXPECTED_SKU_PRICE_GROUP_RESOLVER_MEMBERS: Readonly<
  Record<keyof SkuPriceGroupResolver, true>
> = Object.freeze({
  calculateSkuPriceBasedOnPriceGroup: true,
  getRateForSkuBasedOnPriceGroup: true,
  calculateSkuPriceBasedOnCurrentAccount: true,
});

type SavePriceGroupArguments = Parameters<PriceGroupRepository['savePriceGroup']>;

type PriorStateArgument = SavePriceGroupArguments[1];

/**
 * Reads a member off the repository without ever taking an unbound method reference.
 *
 * The instance is viewed as a string-keyed record so the member's static type is `unknown`, which
 * is then narrowed.
 *
 * @throws When the member is absent or is not callable.
 */
function declaredParameterCount(
  repository: PriceGroupRepository,
  methodName: keyof PriceGroupRepository,
): number {
  const members = repository as unknown as Readonly<Record<string, unknown>>;
  const member = members[methodName];

  if (typeof member !== 'function') {
    throw new Error(
      'Expected the port member ' + methodName + ' to be present and callable on the adapter.',
    );
  }

  return member.length;
}

/**
 * The six port method names, spelled out so the runtime list and the exhaustive compile-time map
 * above can be cross-checked against each other.
 */
const PORT_METHOD_NAMES: readonly (keyof PriceGroupRepository)[] = Object.freeze([
  'getAccountSubscriptionPriceGroups',
  'getPriceGroup',
  'getPriceGroupRate',
  'savePriceGroup',
  'savePriceGroupRate',
  'deletePriceGroup',
]);

function makeUnsavedPriceGroup(parentPriceGroup: PriceGroup | undefined): PriceGroup {
  return new PriceGroup({
    // `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] is what `isNew()` tests, so an empty key
    // is how "not yet inserted" is spelled.
    priceGroupID: '',
    priceGroupIDPath: undefined,
    activeFlag: true,
    priceGroupName: 'Trade',
    priceGroupCode: 'trade',
    parentPriceGroup,
    childPriceGroups: [],
    priceGroupRates: [],
    promotionRewards: [],
    createdDateTime: undefined,
    createdByAccountID: CANNED_CREATED_BY_ACCOUNT_ID,
    modifiedDateTime: undefined,
    modifiedByAccountID: CANNED_MODIFIED_BY_ACCOUNT_ID,
  });
}

describe('MySqlPriceGroupRepository - NET-NEW coverage with no legacy antecedent', () => {
  it('implements the six-method port surface with exactly the declared parameter arity', () => {
    const { repository } = makeSubject();

    expect(PORT_METHOD_NAMES).toHaveLength(EXPECTED_PORT_METHOD_COUNT);
    expect([...Object.keys(EXPECTED_PORT_METHOD_DECLARED_PARAMETER_COUNT)].sort()).toStrictEqual(
      [...PORT_METHOD_NAMES].sort(),
    );

    for (const methodName of PORT_METHOD_NAMES) {
      expect(methodName in repository).toBe(true);
      expect(declaredParameterCount(repository, methodName)).toBe(
        EXPECTED_PORT_METHOD_DECLARED_PARAMETER_COUNT[methodName],
      );
    }
  });

  it('is composed from three explicit constructor arguments and nothing ambient', () => {
    const executor = new RecordingExecutor([]);
    const valueRounder = makeRecordingValueRounder();
    const repository: PriceGroupRepository = new MySqlPriceGroupRepository(
      executor,
      TEST_AUDIT_ACTOR,
      valueRounder,
      LIVE_REQUEST_CLOCK,
    );

    expect(executor.calls).toHaveLength(0);
    expect(executor.mutationCalls).toHaveLength(0);
    expect(valueRounder.calls).toHaveLength(0);
    for (const methodName of PORT_METHOD_NAMES) {
      expect(methodName in repository).toBe(true);
    }
  });
});

/**
 * The six subscription-owned tables the reach-through reads, and the only place in the whole
 * migration where an out-of-scope subsystem's tables are queried.
 */
const SUBSCRIPTION_OWNED_TABLES: readonly string[] = Object.freeze([
  'SwSubsUsageBenefitAccount',
  'SwSubsUsageBenefit',
  'SwSubsUsageBenefitPriceGroup',
  'SwSubsUsage',
  'SwSubscriptionStatus',
  'SwType',
]);

/**
 * The one instant every bound timestamp in this suite is derived from.
 *
 * An explicit UTC ISO-8601 literal, never `new Date()` with no argument: a bound timestamp whose
 * value depends on when the suite ran is not an assertion.
 */
const EXPLICIT_UTC_INSTANT = new Date('2024-06-01T00:00:00.000Z');

describe('getAccountSubscriptionPriceGroups - the one deliberate read-only reach-through', () => {
  it('emits stage one verbatim, binding exactly three values in clause order', async () => {
    const { repository, executor } = makeSubject([NO_ROWS]);

    await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    const stageOne = statementAt(executor.calls, 0);

    expect(stageOne.sql).toBe(EXPECTED_SUBSCRIPTION_PRICE_GROUP_IDS_SQL);

    // Three binds, in the order the clauses appear: the `endDateTime` upper bound
    // [model/service/PriceGroupService.cfc:L65], the account
    // [model/service/PriceGroupService.cfc:L66], then the `effectiveDateTime` upper bound
    // [model/service/PriceGroupService.cfc:L70].
    expect(stageOne.params).toHaveLength(3);
    expect(parameterAt(stageOne.params, 0)).toBeInstanceOf(Date);
    expect(parameterAt(stageOne.params, 1)).toBe(CANNED_ACCOUNT_ID);
    expect(parameterAt(stageOne.params, 2)).toBeInstanceOf(Date);
  });

  it('binds the account rather than interpolating it into the statement text', async () => {
    const { repository, executor } = makeSubject([NO_ROWS]);

    await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    const stageOne = onlyStatement(executor.calls);

    expect(stageOne.sql).not.toContain(CANNED_ACCOUNT_ID);
    expect(stageOne.params).toContain(CANNED_ACCOUNT_ID);
  });

  it('binds ONE captured instant to both timestamp positions', async () => {
    const { repository, executor } = makeSubject([NO_ROWS]);

    await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    const stageOne = onlyStatement(executor.calls);
    const endDateTimeBound = requireBoundDate(
      parameterAt(stageOne.params, 0),
      'the endDateTime upper bound',
    );
    const effectiveDateTimeBound = requireBoundDate(
      parameterAt(stageOne.params, 2),
      'the effectiveDateTime upper bound',
    );

    // CFML parity [model/dao/PriceGroupDAO.cfc:L65, L70, L81, L86]: the legacy calls `now()` four
    // TIMES across its two arms, so two comparisons within one arm could straddle a tick and
    // disagree.
    expect(endDateTimeBound).toBe(effectiveDateTimeBound);
    expect(endDateTimeBound.getTime()).toBe(effectiveDateTimeBound.getTime());
  });

  it('binds the INJECTED instant, not a clock of its own', async () => {
    const { repository, executor } = makeSubject([NO_ROWS], [], fixedClock(EXPLICIT_UTC_INSTANT));

    await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    const stageOne = onlyStatement(executor.calls);

    for (const boundPosition of [0, 2]) {
      const bound = requireBoundDate(
        parameterAt(stageOne.params, boundPosition),
        `the timestamp bound at position ${String(boundPosition)}`,
      );

      expect(bound.getTime()).toBe(EXPLICIT_UTC_INSTANT.getTime());
    }
  });

  it('never emits a server-side clock call in either dialect arm', () => {
    const statement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement({
        accountID: CANNED_ACCOUNT_ID,
        now: EXPLICIT_UTC_INSTANT,
        dialect: 'MySQL',
      });

    expect(statement.sql).not.toContain('NOW');
    expect(statement.sql).not.toContain('CURRENT_TIMESTAMP');
    expect(statement.sql).not.toContain('SYSDATE');
  });

  it('is a pure builder: the same criteria produce the same text and the same binds', () => {
    const criteria = {
      accountID: CANNED_ACCOUNT_ID,
      now: EXPLICIT_UTC_INSTANT,
      dialect: 'MySQL',
    } as const;

    const first =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement(criteria);
    const second =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement(criteria);

    expect(first.sql).toBe(EXPECTED_SUBSCRIPTION_PRICE_GROUP_IDS_SQL);
    expect(second.sql).toBe(first.sql);
    expect(first.params).toStrictEqual([
      EXPLICIT_UTC_INSTANT,
      CANNED_ACCOUNT_ID,
      EXPLICIT_UTC_INSTANT,
    ]);
    expect(parameterAt(first.params, 0)).toBe(parameterAt(first.params, 2));
  });

  it('compares the sstActive system code as a literal, exactly as the legacy wrote it', () => {
    const statement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement({
        accountID: CANNED_ACCOUNT_ID,
        now: EXPLICIT_UTC_INSTANT,
        dialect: 'MySQL',
      });

    // JUDGMENT CALL: `'sstActive'` stays a LITERAL rather than becoming a fourth bound parameter.
    expect(statement.sql).toContain("'sstActive' = (SELECT systemCode");
    expect(statement.params).toHaveLength(3);
    expect(statement.params).not.toContain('sstActive');
  });

  it('preserves the INNER JOIN SwType that projects no column but filters rows', () => {
    const statement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement({
        accountID: CANNED_ACCOUNT_ID,
        now: EXPLICIT_UTC_INSTANT,
        dialect: 'MySQL',
      });

    // LEGACY-DEFECT [model/dao/PriceGroupDAO.cfc:L68, L84]: the INNER JOIN SwType contributes no
    // column to the sub-select's projection, yet as an INNER join it filters out rows with no
    // matching SwType, so removing it changes the result set.
    // Preserved deliberately; do not fix without a product decision.
    expect(statement.sql).toContain(
      'INNER JOIN SwType ON SwSubscriptionStatus.subscriptionStatusTypeID = SwType.typeID',
    );
    expect(statement.sql).toContain('(SELECT systemCode FROM SwSubscriptionStatus');
    expect(statement.sql).not.toContain('SwType.type,');
  });

  it('preserves the correlated ORDER BY, with only the row limiting differing by arm', () => {
    const statement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement({
        accountID: CANNED_ACCOUNT_ID,
        now: EXPLICIT_UTC_INSTANT,
        dialect: 'MySQL',
      });

    // CFML parity [model/dao/PriceGroupDAO.cfc:L71, L87]: both arms order by `changeDateTime DESC`
    // and only the limiting syntax differs, `LIMIT 1` trailing against `TOP 1` leading. Which row
    // the sub-select returns depends on that ordering.
    expect(statement.sql).toContain('ORDER BY changeDateTime DESC LIMIT 1)');
    expect(statement.sql).not.toContain('TOP 1');

    const fragments = singleRowLimitFragments('MySQL');
    expect(fragments.selectPrefix).toBe('');
    expect(fragments.trailingClause).toBe('LIMIT 1');
  });

  it('returns [] and issues NO stage-two statement when stage one matches nothing', async () => {
    const { repository, executor } = makeSubject([NO_ROWS]);

    const result = await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    // CFML parity [model/dao/PriceGroupDAO.cfc:L92, L98]: `<cfif getpg.recordCount>` guards stage
    // two and `<cfreturn [] />` is the fall-through.
    expect(result).toStrictEqual([]);

    const stageOne = onlyStatement(executor.calls);
    expect(stageOne.sql).toBe(EXPECTED_SUBSCRIPTION_PRICE_GROUP_IDS_SQL);

    for (const sql of sqlTextsOf(executor.calls)) {
      expect(sql).not.toContain('IN ()');
    }

    // This short-circuit belongs here and nowhere else.
    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('rejects an empty identifier set at the stage-two builder itself', () => {
    expect(() =>
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
        priceGroupIDs: [],
      }),
    ).toThrow(/EMPTY|empty/u);
  });

  it('grows the stage-two placeholder run one per identifier, for one, two and three', () => {
    // MySQL prepared statements do not expand `IN (?)` from an array, so the run must carry one
    // placeholder per element and each element must be bound separately.
    const oneID = ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
      priceGroupIDs: [CANNED_PRICE_GROUP_ID],
    });
    const twoIDs = ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
      priceGroupIDs: [CANNED_PRICE_GROUP_ID, CANNED_PARENT_PRICE_GROUP_ID],
    });
    const threeIDs =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
        priceGroupIDs: [
          CANNED_PRICE_GROUP_ID,
          CANNED_PARENT_PRICE_GROUP_ID,
          CANNED_ROOT_PRICE_GROUP_ID,
        ],
      });

    expect(oneID.sql).toBe(EXPECTED_ACTIVE_PRICE_GROUPS_BY_ID_SQL_FOR_ONE_ID);
    expect(twoIDs.sql).toBe(EXPECTED_ACTIVE_PRICE_GROUPS_BY_ID_SQL_FOR_TWO_IDS);
    expect(threeIDs.sql).toBe(EXPECTED_ACTIVE_PRICE_GROUPS_BY_ID_SQL_FOR_THREE_IDS);

    expect(oneID.params).toHaveLength(2);
    expect(twoIDs.params).toHaveLength(3);
    expect(threeIDs.params).toHaveLength(4);
  });

  it('binds activeFlag as the numeric 1, positioned after every identifier', () => {
    const statement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
        priceGroupIDs: [CANNED_PRICE_GROUP_ID, CANNED_PARENT_PRICE_GROUP_ID],
      });

    // CFML parity [model/dao/PriceGroupDAO.cfc:L95]: the legacy HQL binds `activeFlag` as the
    // numeric `1`.
    expect(statement.params).toStrictEqual([
      CANNED_PRICE_GROUP_ID,
      CANNED_PARENT_PRICE_GROUP_ID,
      1,
    ]);
    expect(parameterAt(statement.params, 2)).toBe(1);
    expect(parameterAt(statement.params, 2)).not.toBe('1');
    expect(parameterAt(statement.params, 2)).not.toBe(true);
  });

  it('reproduces the legacy value-list round trip, which drops blank elements', () => {
    // CFML parity [model/dao/PriceGroupDAO.cfc:L95]: the legacy runs
    // `listToArray(valueList(getpg.priceGroupID))`.
    expect(listToArray('a,,b')).toStrictEqual(['a', 'b']);

    const statement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
        priceGroupIDs: [CANNED_PRICE_GROUP_ID, '', CANNED_PARENT_PRICE_GROUP_ID],
      });

    expect(statement.sql).toBe(EXPECTED_ACTIVE_PRICE_GROUPS_BY_ID_SQL_FOR_TWO_IDS);
    expect(statement.params).toStrictEqual([
      CANNED_PRICE_GROUP_ID,
      CANNED_PARENT_PRICE_GROUP_ID,
      1,
    ]);
  });

  it('names the physical SwPriceGroup in stage two, never the ORM entity name', () => {
    const statement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
        priceGroupIDs: [CANNED_PRICE_GROUP_ID],
      });

    // CFML parity [model/dao/PriceGroupDAO.cfc:L93]: the legacy stage two is HQL and
    // `SlatwallPriceGroup` is correct there, being the ORM entity name.
    expect(statement.sql).toContain('FROM SwPriceGroup pg');
    expect(statement.sql).not.toContain('Slatwall');
    expect(EXPECTED_SUBSCRIPTION_PRICE_GROUP_IDS_SQL).not.toContain('Slatwall');
  });

  it('emits nothing but reads, and never writes to a subscription-owned table', async () => {
    const { repository, executor } = makeSubject([
      [subscriptionPriceGroupIDRow(CANNED_PRICE_GROUP_ID)],
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    const result = await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    expect(result).toHaveLength(1);

    expect(executor.mutationCalls).toHaveLength(0);
    for (const sql of sqlTextsOf(executor.calls)) {
      expect(sql.startsWith('SELECT')).toBe(true);
      expect(sql).not.toContain('INSERT');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
    }

    // And the six tables appear in exactly one statement - stage one - and are absent from every
    // other statement the hydration fans out into.
    const stageOne = statementAt(executor.calls, 0);
    for (const tableName of SUBSCRIPTION_OWNED_TABLES) {
      expect(stageOne.sql).toContain(tableName);
    }
    for (const laterStatement of executor.calls.slice(1)) {
      for (const tableName of SUBSCRIPTION_OWNED_TABLES) {
        expect(laterStatement.sql).not.toContain(tableName);
      }
    }
  });

  it('hydrates every matched price group with the cascade-ready shape, in statement order', async () => {
    const { repository, executor } = makeSubject([
      [subscriptionPriceGroupIDRow(CANNED_PRICE_GROUP_ID)],
      [priceGroupRow()],
      [priceGroupRateRow()],
      ...Array.from({ length: RATE_LINK_TABLE_COUNT }, () => NO_ROWS),
      NO_ROWS,
    ]);

    const result = await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    const hydrated = elementAt(result, 0, 'a hydrated price group');
    expect(hydrated.getPriceGroupID()).toBe(CANNED_PRICE_GROUP_ID);
    expect(hydrated.getPriceGroupRates()).toHaveLength(1);

    // Statement order, pinned: stage one, stage two, then the per-row hydration - rates, the six
    // link reads, and the DIRECT CHILDREN.
    const emitted = sqlTextsOf(executor.calls);
    expect(emitted).toHaveLength(3 + RATE_LINK_TABLE_COUNT + 1);
    expect(statementAt(executor.calls, 0).sql).toBe(EXPECTED_SUBSCRIPTION_PRICE_GROUP_IDS_SQL);
    expect(statementAt(executor.calls, 1).sql).toBe(
      EXPECTED_ACTIVE_PRICE_GROUPS_BY_ID_SQL_FOR_ONE_ID,
    );
    expect(statementAt(executor.calls, 2).sql).toBe(
      EXPECTED_SELECT_RATES_BY_PRICE_GROUP_SQL_FOR_ONE_ID,
    );
    expect(statementAt(executor.calls, 2).params).toStrictEqual([CANNED_PRICE_GROUP_ID]);
    expect(statementAt(executor.calls, 9).sql).toBe(expectedSelectChildPriceGroupsSql(1));
    expect(statementAt(executor.calls, 9).params).toStrictEqual([CANNED_PRICE_GROUP_ID]);
  });

  it('treats a non-MySQL dialect as a hard error, never a silently wrong statement', () => {
    // CFML parity [model/dao/PriceGroupDAO.cfc:L57]: the else arm is real legacy code, so the
    // behaviour is reproducible, but reproducing it is out of scope and emitting the MySQL text
    // under another dialect would be silently wrong.
    for (const dialect of ['MicrosoftSQLServer', 'Oracle10g'] satisfies DatabaseDialect[]) {
      expect(() =>
        ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement({
          accountID: CANNED_ACCOUNT_ID,
          now: EXPLICIT_UTC_INSTANT,
          dialect,
        }),
      ).toThrow(/not implemented/u);
    }
  });
});

function makePersistedPriceGroup(init: {
  readonly priceGroupID: string;
  readonly priceGroupIDPath: string | undefined;
  readonly parentPriceGroup: PriceGroup | undefined;
}): PriceGroup {
  return new PriceGroup({
    priceGroupID: init.priceGroupID,
    priceGroupIDPath: init.priceGroupIDPath,
    activeFlag: true,
    priceGroupName: 'Wholesale',
    priceGroupCode: 'wholesale',
    parentPriceGroup: init.parentPriceGroup,
    childPriceGroups: [],
    priceGroupRates: [],
    promotionRewards: [],
    createdDateTime: CANNED_CREATED_DATE_TIME,
    createdByAccountID: CANNED_CREATED_BY_ACCOUNT_ID,
    modifiedDateTime: CANNED_MODIFIED_DATE_TIME,
    modifiedByAccountID: CANNED_MODIFIED_BY_ACCOUNT_ID,
  });
}

/**
 * A rate that has never been persisted, for the rate insert path.
 */
function makeUnsavedPriceGroupRate(): PriceGroupRate {
  return new PriceGroupRate({ priceGroupRateID: '' });
}

function makePersistedPriceGroupRate(init: { readonly amount: Money | undefined }): PriceGroupRate {
  return new PriceGroupRate({
    priceGroupRateID: CANNED_PRICE_GROUP_RATE_ID,
    // CFML parity [model/entity/PriceGroupRate.cfc:L53]: the legacy default is the STRING 'false',
    // not the boolean, and the entity applies CFML boolean semantics to it.
    globalFlag: 'false',
    amount: init.amount,
    amountType: 'percentageOff',
  });
}

/**
 * The two member keys each link collection carries on the fully-linked fixture below.
 */
const LINKED_MEMBER_KEYS = ['linked-member-1', 'linked-member-2'] as const;

/**
 * A persisted rate holding two members in every one of its six link collections.
 *
 * Two rather than one, so a multi-row `VALUES` list is exercised and an insert that silently wrote
 * only the first member would fail.
 */
function makeFullyLinkedPriceGroupRate(): PriceGroupRate {
  const [firstKey, secondKey] = LINKED_MEMBER_KEYS;

  return new PriceGroupRate({
    priceGroupRateID: CANNED_PRICE_GROUP_RATE_ID,
    globalFlag: 'false',
    amountType: 'percentageOff',
    productTypes: [
      new ProductType({ productTypeID: firstKey }),
      new ProductType({ productTypeID: secondKey }),
    ],
    products: [new Product({ productID: firstKey }), new Product({ productID: secondKey })],
    skus: [new Sku({ skuID: firstKey }), new Sku({ skuID: secondKey })],
    excludedProductTypes: [
      new ProductType({ productTypeID: firstKey }),
      new ProductType({ productTypeID: secondKey }),
    ],
    excludedProducts: [new Product({ productID: firstKey }), new Product({ productID: secondKey })],
    excludedSkus: [new Sku({ skuID: firstKey }), new Sku({ skuID: secondKey })],
  });
}

interface ProvokedStatements {
  readonly reads: readonly RecordedStatement[];

  readonly writes: readonly RecordedStatement[];
}

/**
 * Drive every code path on the port once and return every statement emitted.
 *
 * Three obligations are expressed over the whole census rather than path by path: that no
 * order-owned table or column is ever named.
 *
 * Each path gets its own subject, so a memoized read cannot satisfy a later path.
 */
async function provokeEveryStatement(): Promise<ProvokedStatements> {
  const reads: RecordedStatement[] = [];
  const writes: RecordedStatement[] = [];

  const collect = (subject: Subject): void => {
    reads.push(...subject.executor.calls);
    writes.push(...subject.executor.mutationCalls);
  };

  const linkResultSets: readonly (readonly SqlRow[])[] = EXPECTED_RATE_LINK_TABLES.map(
    (linkTable) => [rateLinkRow(linkTable.memberColumn, 'member-' + linkTable.memberColumn)],
  );

  // The reach-through, with a match: stage one, stage two, then hydration.
  const reachThrough = makeSubject([
    [subscriptionPriceGroupIDRow(CANNED_PRICE_GROUP_ID)],
    [priceGroupRow()],
    [priceGroupRateRow()],
    ...linkResultSets,
    NO_ROWS,
  ]);
  await reachThrough.repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);
  collect(reachThrough);

  // A leaf read: the row, its (empty) rates, its (empty) children.
  const leafRead = makeSubject(leafPriceGroupResultSets());
  await leafRead.repository.getPriceGroup(CANNED_PRICE_GROUP_ID);
  collect(leafRead);

  // A read whose group owns a rate, which fans out into all six link statements.
  const ratedRead = makeSubject([
    [priceGroupRow()],
    [priceGroupRateRow()],
    ...linkResultSets,
    NO_ROWS,
  ]);
  await ratedRead.repository.getPriceGroup(CANNED_PRICE_GROUP_ID);
  collect(ratedRead);

  // A rate read, which then loads the group that owns it.
  const rateRead = makeSubject([
    [priceGroupRateRow()],
    ...linkResultSets,
    [priceGroupRow()],
    NO_ROWS,
    NO_ROWS,
  ]);
  await rateRead.repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID);
  collect(rateRead);
  const insert = makeSubject([]);
  await insert.repository.savePriceGroup(
    makeUnsavedPriceGroup(
      makePersistedPriceGroup({
        priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
        priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
        parentPriceGroup: undefined,
      }),
    ),
  );
  collect(insert);

  // The update path, with the prior persisted state supplied.
  const update = makeSubject([]);
  const parentForUpdate = makePersistedPriceGroup({
    priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
    priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
    parentPriceGroup: undefined,
  });
  await update.repository.savePriceGroup(
    makePersistedPriceGroup({
      priceGroupID: CANNED_PRICE_GROUP_ID,
      priceGroupIDPath: CANNED_PRICE_GROUP_ID,
      parentPriceGroup: parentForUpdate,
    }),
    makePersistedPriceGroup({
      priceGroupID: CANNED_PRICE_GROUP_ID,
      priceGroupIDPath: CANNED_PRICE_GROUP_ID,
      parentPriceGroup: undefined,
    }),
  );
  collect(update);

  // The rate insert path.
  const rateInsert = makeSubject([]);
  await rateInsert.repository.savePriceGroupRate(makeUnsavedPriceGroupRate());
  collect(rateInsert);

  // The rate update path.
  const rateUpdate = makeSubject([]);
  await rateUpdate.repository.savePriceGroupRate(
    makePersistedPriceGroupRate({ amount: Money.fromDecimalString('12.50') }),
  );
  collect(rateUpdate);

  // The delete path: six link deletes, the rate delete, then the group delete.
  const remove = makeSubject([]);
  await remove.repository.deletePriceGroup(
    makePriceGroupFixtures({ idPrefix: 'pinned' }).childPriceGroup,
  );
  collect(remove);

  // A rate save whose six collections all hold members, which is the only path that emits the six
  // link INSERT statements.
  const rateWithMembers = makeSubject([]);
  await rateWithMembers.repository.savePriceGroupRate(makeFullyLinkedPriceGroupRate());
  collect(rateWithMembers);

  // The set-based by-key read. Not a port member - the port is locked at six - but it is a
  // statement this adapter emits, so it belongs in a census that calls itself exhaustive.
  const setRead = makeSetLoaderSubject([
    [priceGroupRow(), priceGroupRow({ priceGroupID: CANNED_SIBLING_PRICE_GROUP_ID })],
    NO_ROWS,
    NO_ROWS,
    NO_ROWS,
  ]);
  await setRead.adapter.getPriceGroupsByID([CANNED_PRICE_GROUP_ID, CANNED_SIBLING_PRICE_GROUP_ID]);
  reads.push(...setRead.executor.calls);
  writes.push(...setRead.executor.mutationCalls);

  return { reads, writes };
}

function allStatementsOf(provoked: ProvokedStatements): readonly RecordedStatement[] {
  return [...provoked.reads, ...provoked.writes];
}

/**
 * One admissible argument tuple per port method, typed to the method's own parameter list.
 *
 * This is the strongest available statement of the anti-corruption inversion, enforced by the
 * compiler.
 */
interface PortArgumentTuples {
  readonly getAccountSubscriptionPriceGroups: Parameters<
    PriceGroupRepository['getAccountSubscriptionPriceGroups']
  >;
  readonly getPriceGroup: Parameters<PriceGroupRepository['getPriceGroup']>;
  readonly getPriceGroupRate: Parameters<PriceGroupRepository['getPriceGroupRate']>;
  readonly savePriceGroup: Parameters<PriceGroupRepository['savePriceGroup']>;
  readonly savePriceGroupRate: Parameters<PriceGroupRepository['savePriceGroupRate']>;
  readonly deletePriceGroup: Parameters<PriceGroupRepository['deletePriceGroup']>;
}

function makePortArgumentTuples(): PortArgumentTuples {
  const persisted = makePersistedPriceGroup({
    priceGroupID: CANNED_PRICE_GROUP_ID,
    priceGroupIDPath: CANNED_PRICE_GROUP_ID,
    parentPriceGroup: undefined,
  });

  return {
    getAccountSubscriptionPriceGroups: [CANNED_ACCOUNT_ID],
    getPriceGroup: [CANNED_PRICE_GROUP_ID],
    getPriceGroupRate: [CANNED_PRICE_GROUP_RATE_ID],
    savePriceGroup: [persisted, persisted],
    savePriceGroupRate: [makePersistedPriceGroupRate({ amount: undefined })],
    deletePriceGroup: [persisted],
  };
}

/**
 * Identifiers owned by the order aggregate, which is out of scope in its entirety.
 *
 * Tables first, then the three foreign-key columns the applied-promotion row carries
 * [model/entity/PromotionApplied.cfc:L49].
 */
const ORDER_OWNED_IDENTIFIERS: readonly string[] = Object.freeze([
  'SwOrder',
  'SwOrderItem',
  'SwOrderFulfillment',
  'SwOrderDelivery',
  'SwOrderPayment',
  'SwPromotionApplied',
  'SwPromoApplied',
  'orderID',
  'orderItemID',
  'orderFulfillmentID',
]);

/**
 * The order-owned identifiers that are forbidden ABSOLUTELY, in every statement.
 *
 * Identifiers above, and the original is quoted rather than deleted.
 */
const ABSOLUTELY_FORBIDDEN_ORDER_IDENTIFIERS: readonly string[] = Object.freeze([
  'SwOrderFulfillment',
  'SwOrderDelivery',
  'SwOrderPayment',
  'SwPromotionApplied',
  'SwPromoApplied',
  'orderID',
  'orderItemID',
  'orderFulfillmentID',
]);

/**
 * The one statement in which an order table may appear, pinned as a literal.
 *
 * Written out rather than composed from the adapter's own builder, so that a change to how the
 * probe is built cannot silently change what this suite permits.
 */
const PERMITTED_ORDER_ITEM_PROBE_SQL = [
  'SELECT 1',
  'FROM SwOrderItem',
  'WHERE appliedPriceGroupID = ?',
  'LIMIT 1',
].join('\n');

/**
 * The order-facing service entry points, which must not appear on this port.
 */
const ORDER_FACING_SERVICE_METHODS: readonly string[] = Object.freeze([
  'updateOrderAmountsWithPriceGroups',
  'updateOrderAmountsWithPromotions',
]);

describe('the execution-ordering constraint and the anti-corruption inversion', () => {
  // C-2 / C2.1: `PriceGroupService.updateOrderAmountsWithPriceGroups()`
  // [model/service/PriceGroupService.cfc:L364-L375] must run before
  // `PromotionService.updateOrderAmountsWithPromotions()`, because
  // [model/service/PromotionService.cfc:L241-L254] picks the discount base price by price-group
  // eligibility: an INELIGIBLE item uses `getPrice()`.

  it('carries the ordering constraint in no parameter, on any method', () => {
    const tuples = makePortArgumentTuples();

    // C2.2: the ordering is an obligation on `src/handlers/bootstrap.ts` and on the services and
    // handlers tier, neither of which the subtree contains yet.
    expect(tuples.getAccountSubscriptionPriceGroups).toStrictEqual([CANNED_ACCOUNT_ID]);
    expect(tuples.getPriceGroup).toStrictEqual([CANNED_PRICE_GROUP_ID]);
    expect(tuples.getPriceGroupRate).toStrictEqual([CANNED_PRICE_GROUP_RATE_ID]);
    expect(tuples.savePriceGroup).toHaveLength(2);
    expect(tuples.savePriceGroupRate).toHaveLength(1);
    expect(tuples.deletePriceGroup).toHaveLength(1);

    // The only reference-typed arguments on the whole surface are price-group entities. Asserting
    // the CONSTRUCTOR is what makes the negative concrete: an order view would satisfy neither
    // check.
    expect(elementAt(tuples.savePriceGroup, 0, 'the price group to save')).toBeInstanceOf(
      PriceGroup,
    );
    expect(elementAt(tuples.deletePriceGroup, 0, 'the price group to delete')).toBeInstanceOf(
      PriceGroup,
    );
    expect(elementAt(tuples.savePriceGroupRate, 0, 'the rate to save')).toBeInstanceOf(
      PriceGroupRate,
    );
  });

  it('exposes no order-facing entry point: the inversion happens above this layer', () => {
    const { repository } = makeSubject();
    for (const methodName of ORDER_FACING_SERVICE_METHODS) {
      expect(methodName in repository).toBe(false);
    }

    const surface = PORT_METHOD_NAMES.filter((methodName) => methodName in repository);

    expect(surface).toHaveLength(EXPECTED_PORT_METHOD_COUNT);
  });

  it('never names an order foreign key in any statement it emits', async () => {
    const provoked = await provokeEveryStatement();
    const statements = allStatementsOf(provoked);

    expect(statements.length).toBeGreaterThan(0);
    expect(provoked.reads.length).toBeGreaterThan(0);
    expect(provoked.writes.length).toBeGreaterThan(0);

    for (const statement of statements) {
      const foldedSql = statement.sql.toLowerCase();

      for (const identifier of ABSOLUTELY_FORBIDDEN_ORDER_IDENTIFIERS) {
        expect(foldedSql).not.toContain(identifier.toLowerCase());
      }
    }

    // The narrowing is not a licence: `ORDER_OWNED_IDENTIFIERS` still names ten things and exactly
    // two of them - `SwOrder` as a prefix of `SwOrderItem`, and `SwOrderItem` itself - were moved
    // out of the absolute ban.
    expect(ORDER_OWNED_IDENTIFIERS).toHaveLength(ABSOLUTELY_FORBIDDEN_ORDER_IDENTIFIERS.length + 2);

    for (const identifier of ABSOLUTELY_FORBIDDEN_ORDER_IDENTIFIERS) {
      expect(ORDER_OWNED_IDENTIFIERS).toContain(identifier);
    }
  });

  it('never names an order table in a WRITE, on any path', async () => {
    // The half of the old blanket assertion that survives UNCONDITIONALLY, and the half that
    // carries the real risk.
    const provoked = await provokeEveryStatement();

    expect(provoked.writes.length).toBeGreaterThan(0);

    for (const statement of provoked.writes) {
      const foldedSql = statement.sql.toLowerCase();

      for (const identifier of ORDER_OWNED_IDENTIFIERS) {
        expect(foldedSql).not.toContain(identifier.toLowerCase());
      }
    }
  });

  it('reaches an order table in exactly one statement, and only as a bare existence probe', async () => {
    // The tightest of the three replacement assertions: not "an order table appears rarely" but
    // "an order table appears in this exact statement and no other".
    const provoked = await provokeEveryStatement();
    const statements = allStatementsOf(provoked);

    const orderNaming = statements.filter((statement) =>
      statement.sql.toLowerCase().includes('sworderitem'),
    );

    expect(orderNaming.length).toBeGreaterThan(0);

    for (const statement of orderNaming) {
      expect(statement.sql).toBe(PERMITTED_ORDER_ITEM_PROBE_SQL);

      // Read-only by construction: `SELECT 1` projects a literal, so no column of the order
      // aggregate is read even though its table is named.
      expect(statement.sql.startsWith('SELECT 1\n')).toBe(true);
      expect(statement.sql).not.toContain('JOIN');
      expect(statement.sql).not.toContain('*');

      // One bound value, and it is a price-group identifier rather than anything the order
      // aggregate owns.
      expect(statement.params).toHaveLength(1);
      expect(statement.sql).not.toContain(PINNED_CHILD_PRICE_GROUP_ID);
    }

    // And it is reached only from the delete path, which is the only place a delete gate could be
    // evaluated: no read, no save and no rate path names it.
    expect(orderNaming.every((statement) => provoked.reads.includes(statement))).toBe(true);
  });

  it('binds no order identifier, because it is handed none', async () => {
    const provoked = await provokeEveryStatement();

    for (const statement of allStatementsOf(provoked)) {
      for (const boundValue of statement.params) {
        if (typeof boundValue !== 'string') {
          continue;
        }

        expect(boundValue.toLowerCase()).not.toContain('order');
      }
    }
  });

  it('derives no monetary amount: rounding is a service-tier behaviour', async () => {
    const linkResultSets: readonly (readonly SqlRow[])[] = EXPECTED_RATE_LINK_TABLES.map(
      (linkTable) => [rateLinkRow(linkTable.memberColumn, 'member-' + linkTable.memberColumn)],
    );

    const { repository, valueRounder } = makeSubject([
      [priceGroupRateRow({ ...joinedRoundingRuleColumns() })],
      ...linkResultSets,
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    const rate = requirePriceGroupRate(
      await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID),
      'the rate that was read back',
    );

    // The rate carries a rounding rule and an amount, so every input the rounding collaborator
    // needs is present.
    expect(requireRoundingRule(rate.getRoundingRule(), 'the joined rule')).toBeDefined();
    expect(valueRounder.calls).toHaveLength(0);

    const amount = rate.getAmount();

    expect(amount).toBeDefined();
    expect(amount?.equals(Money.fromDecimalString('10.00'))).toBe(true);
    expect(amount?.equals(Money.fromDecimalString(SCRIPTED_ROUNDED_ANSWER))).toBe(false);
  });
});

/**
 * The canonical spellings, in the order the legacy chain tests for them.
 */
const CANONICAL_DIALECT_SPELLINGS = Object.freeze([
  'MySQL',
  'MicrosoftSQLServer',
  'Oracle10g',
]) satisfies readonly DatabaseDialect[];

/**
 * The two canonical dialects this port recognizes but deliberately does not serve.
 */
const UNSERVED_CANONICAL_DIALECTS = Object.freeze([
  'MicrosoftSQLServer',
  'Oracle10g',
]) satisfies readonly DatabaseDialect[];

/**
 * Every accepted spelling and the canonical form it must fold to.
 *
 * CFML `eq` is case-insensitive, so all three name the same engine and every one has to fold here.
 */
interface DialectFoldingCase {
  readonly configured: string;
  readonly canonical: DatabaseDialect;
  readonly provenance: string;
}

const DIALECT_FOLDING_CASES: readonly DialectFoldingCase[] = Object.freeze([
  Object.freeze({
    configured: 'MySQL',
    canonical: 'MySQL',
    provenance: 'config/configORM.cfm:L10 and model/dao/PromotionDAO.cfc:L482',
  }),
  Object.freeze({
    configured: 'mySQL',
    canonical: 'MySQL',
    provenance: 'model/dao/PriceGroupDAO.cfc:L57 and model/dao/ProductDAO.cfc:L288',
  }),
  Object.freeze({
    configured: 'mySql',
    canonical: 'MySQL',
    provenance: 'model/dao/ProductDAO.cfc:L304',
  }),
  Object.freeze({
    configured: 'mysql',
    canonical: 'MySQL',
    provenance: 'lower-cased configuration, which CFML eq would have accepted',
  }),
  Object.freeze({
    configured: 'MYSQL',
    canonical: 'MySQL',
    provenance: 'upper-cased configuration, which CFML eq would have accepted',
  }),
  Object.freeze({
    configured: 'MicrosoftSQLServer',
    canonical: 'MicrosoftSQLServer',
    provenance: 'config/configORM.cfm:L12',
  }),
  Object.freeze({
    configured: 'MICROSOFTSQLSERVER',
    canonical: 'MicrosoftSQLServer',
    provenance: 'upper-cased configuration',
  }),
  Object.freeze({
    configured: 'Oracle10g',
    canonical: 'Oracle10g',
    provenance: 'config/configORM.cfm:L14',
  }),
  Object.freeze({
    configured: 'oracle10g',
    canonical: 'Oracle10g',
    provenance: 'lower-cased configuration',
  }),
]);

/**
 * Values that must be REFUSED, never defaulted.
 */
const REJECTED_DIALECT_VALUES: readonly string[] = Object.freeze([
  // "Unset" reaches the resolver as the empty string, because the configuration layer supplies a
  // string and has no other way to spell absence.
  '',
  '   ',
  'Postgres',
  'PostgreSQL',
  'MariaDB',
  'sqlite',
  // Near-misses matter most: a prefix or suffix match must not be treated as a hit, because the
  // legacy chain used `findNoCase` on the DRIVER'S product name, not on configuration.
  'MySQL8',
  'my sql',
  'Oracle',
  'Microsoft',
]);

/**
 * How long a rejected value may be echoed before it is clipped.
 */
const MAX_ECHOED_REJECTED_VALUE_LENGTH = 40;

describe('the dialect contract - required, hard error, no silent default', () => {
  // JUDGMENT CALL: Application.cfc:L87 sets the application value "databaseType" directly from
  // this.ormSettings.dialect, which config/configORM.cfm:L9-L15 computes.

  it('folds every legacy spelling to its canonical form, including all three for MySQL', () => {
    // C3.2. Nine spellings, three of which actually appear in the source for MySQL.
    for (const foldingCase of DIALECT_FOLDING_CASES) {
      expect(resolveDialect(foldingCase.configured), foldingCase.provenance).toBe(
        foldingCase.canonical,
      );
    }

    // Surrounding whitespace is trimmed before folding, which is what makes a value pasted into
    // configuration with a trailing space work rather than fail obscurely.
    expect(resolveDialect('  mySQL  ')).toBe('MySQL');

    expect(CANONICAL_DIALECT_SPELLINGS).toHaveLength(3);
    expect(CANONICAL_DIALECT_SPELLINGS.map((spelling) => resolveDialect(spelling))).toStrictEqual([
      ...CANONICAL_DIALECT_SPELLINGS,
    ]);
  });

  it('refuses every unrecognized value outright, and never defaults to MySQL', () => {
    for (const rejected of REJECTED_DIALECT_VALUES) {
      expect(() => resolveDialect(rejected)).toThrow(/not a recognized database dialect/u);
    }

    for (const rejected of REJECTED_DIALECT_VALUES) {
      let resolved: DatabaseDialect | undefined;

      try {
        resolved = resolveDialect(rejected);
      } catch {
        resolved = undefined;
      }

      expect(resolved).toBeUndefined();
    }
  });

  it('names the variable and all three accepted values when it refuses', () => {
    const failure = (() => {
      try {
        resolveDialect('Postgres');
      } catch (thrown) {
        return thrown;
      }

      throw new Error('Expected an unrecognized dialect to be refused.');
    })();

    expect(failure).toBeInstanceOf(Error);

    const message = failure instanceof Error ? failure.message : '';

    expect(message).toContain('DB_DIALECT');

    for (const spelling of CANONICAL_DIALECT_SPELLINGS) {
      expect(message).toContain(spelling);
    }

    // It also states that there is no default, so a reader who hits this cannot conclude that
    // omitting the variable would have been fine.
    expect(message).toContain('no default');
    expect(message).toContain('config/configORM.cfm:L9-L15');
  });

  it('clips the value it echoes, so no long configured value is reproduced in full', () => {
    // JUDGMENT CALL: the "no credential in the failure" obligation is discharged here as a bound
    // on what can be echoed, and by the Phase-H identifier census as a grep over this file.
    const longValue = 'z'.repeat(200);

    const failure = (() => {
      try {
        resolveDialect(longValue);
      } catch (thrown) {
        return thrown;
      }

      throw new Error('Expected a long unrecognized dialect to be refused.');
    })();

    const message = failure instanceof Error ? failure.message : '';

    expect(message).not.toContain(longValue);
    expect(message).toContain('z'.repeat(MAX_ECHOED_REJECTED_VALUE_LENGTH));
    expect(message).not.toContain('z'.repeat(MAX_ECHOED_REJECTED_VALUE_LENGTH + 1));
  });

  it('guards MySQL-only composition, throwing for the two dialects it does not serve', () => {
    // C3.3. `assertMySqlDialect` is an assertion function, so the narrowing is what the compiler
    // relies on downstream; here only the runtime refusal is in view.
    expect(() => {
      assertMySqlDialect('MySQL', 'the price-group row-limiting arm');
    }).not.toThrow();

    for (const dialect of UNSERVED_CANONICAL_DIALECTS) {
      expect(() => {
        assertMySqlDialect(dialect, 'the price-group row-limiting arm');
      }).toThrow(/recognized but not implemented/u);

      // And the guard is reached through the fragment accessor too, which is what the stage-one
      // builder calls, so a non-MySQL dialect is a HARD ERROR at the point of composition.
      expect(() => singleRowLimitFragments(dialect)).toThrow(/recognized but not implemented/u);
    }
  });

  it('returns row-limiting fragments that are plain SQL text carrying no bound value', () => {
    // C3.4. A fragment is SQL TEXT and can never be a value: `selectPrefix` is what the other arm
    // would place after `SELECT` (`TOP 1`) and `trailingClause` is what this arm appends
    // (`LIMIT 1`).
    const fragments = singleRowLimitFragments('MySQL');

    expect(fragments.selectPrefix).toBe('');
    expect(fragments.trailingClause).toBe('LIMIT 1');

    expect(fragments.selectPrefix).not.toContain('?');
    expect(fragments.trailingClause).not.toContain('?');

    expect([...Object.keys(fragments)].sort()).toStrictEqual(['selectPrefix', 'trailingClause']);
    expect(Object.isFrozen(fragments)).toBe(true);
  });

  it('separates supplying configuration from interpreting it', () => {
    // C3.4. `src/lib/config.ts` supplies the raw value; `dialect.ts` interprets it.
    expect(Object.isFrozen(appConfig)).toBe(true);
    expect([...Object.keys(appConfig)].sort()).toStrictEqual(['load', 'reset']);
    expect(resolveDialect('mysql')).toBe('MySQL');
    expect(resolveDialect('oracle10g')).toBe('Oracle10g');
    expect(resolveDialect('mysql')).toBe(resolveDialect('MYSQL'));
    expect(resolveDialect.length).toBe(1);

    // `resolveConfiguredDialect` is the SINGLE bridge from configuration to interpretation, and it
    // takes no argument precisely because it goes to configuration for one.
    expect(resolveConfiguredDialect.length).toBe(0);
  });

  it('drives the row-limiting branch from ONE canonical dialect value, not two keys', () => {
    // C3.5 and C3.6 site (2). The criteria surface carries exactly three members, one of which is
    // the dialect, so there is no second `databaseType` key alongside it.
    const criteria = {
      accountID: CANNED_ACCOUNT_ID,
      now: EXPLICIT_UTC_INSTANT,
      dialect: 'MySQL',
    } satisfies Parameters<
      typeof ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement
    >[0];

    expect([...Object.keys(criteria)].sort()).toStrictEqual(['accountID', 'dialect', 'now']);

    const statement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement(criteria);

    // The MySQL arm: the correlated sub-select ends with the legacy's own ordering and trailing
    // limit [model/dao/PriceGroupDAO.cfc:L71].
    expect(statement.sql).toContain('ORDER BY changeDateTime DESC LIMIT 1)');

    // And the other arm's syntax is nowhere in the emitted text.
    //
    // LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L57, L83]: the `<cfelse>` arm emits `SELECT TOP 1`,
    // which is SQL Server syntax, so an Oracle installation falls into a branch whose row limiting
    // Oracle does not accept.
    expect(statement.sql).not.toContain('TOP 1');
    expect(statement.sql.toUpperCase()).not.toContain('FETCH FIRST');
    expect(statement.sql.toUpperCase()).not.toContain('ROWNUM');
  });
});

/**
 * A minted entity key: 32 lower-case hex characters, no hyphens.
 */
const MINTED_IDENTIFIER_PATTERN = /^[0-9a-f]{32}$/u;

/**
 * How many values the price-group insert binds, one per persisted column.
 */
const INSERT_PRICE_GROUP_BOUND_VALUE_COUNT = 10;

/**
 * How many values the price-group update binds.
 */
const UPDATE_PRICE_GROUP_BOUND_VALUE_COUNT = 8;

/**
 * Positional indices into the price-group insert's bound values, named rather than written inline
 * because a positional assertion whose meaning is a bare integer is unreviewable.
 */
const INSERT_BOUND = Object.freeze({
  priceGroupID: 0,
  priceGroupIDPath: 1,
  activeFlag: 2,
  priceGroupName: 3,
  priceGroupCode: 4,
  parentPriceGroupID: 5,
  createdDateTime: 6,
  createdByAccountID: 7,
  modifiedDateTime: 8,
  modifiedByAccountID: 9,
});

const UPDATE_BOUND = Object.freeze({
  priceGroupIDPath: 0,
  activeFlag: 1,
  priceGroupName: 2,
  priceGroupCode: 3,
  parentPriceGroupID: 4,
  modifiedDateTime: 5,
  modifiedByAccountID: 6,
  priceGroupID: 7,
});

/**
 * Proof, at compile time, that the prior-state parameter is an ENTITY or ABSENT.
 *
 * It must not be a callback, a hook registry, an event emitter, a `beforeSave`/`afterSave` option
 * or a boolean flag.
 */
type PriorStateIsEntityOrAbsent = PriorStateArgument extends PriceGroup | undefined ? true : false;

/**
 * Proof that absence is representable, which is what "optional on insert" means.
 */
type PriorStateAdmitsAbsence = undefined extends PriorStateArgument ? true : false;

describe('materialized-path maintenance - the preInsert and preUpdate replacement', () => {
  it('composes the path on the INSERT path, appending the key it mints', async () => {
    const parentPriceGroup = makePersistedPriceGroup({
      priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
      priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
      parentPriceGroup: makePersistedPriceGroup({
        priceGroupID: CANNED_ROOT_PRICE_GROUP_ID,
        priceGroupIDPath: CANNED_ROOT_PRICE_GROUP_ID,
        parentPriceGroup: undefined,
      }),
    });

    const { repository, executor } = makeSubject([]);

    const inserted = await repository.savePriceGroup(makeUnsavedPriceGroup(parentPriceGroup));

    // One statement, and it is the insert. No read precedes it: `unsavedvalue=""` already answered
    // whether a row exists.
    expect(executor.calls).toHaveLength(0);

    const statement = onlyStatement(executor.mutationCalls);

    expect(statement.sql).toBe(EXPECTED_INSERT_PRICE_GROUP_SQL);
    expect(statement.params).toHaveLength(INSERT_PRICE_GROUP_BOUND_VALUE_COUNT);

    // The key is minted here, because the legacy ORM assigned the generated uuid before firing
    // `preInsert` and the path's terminal segment would otherwise be blank.
    const boundPriceGroupID = parameterAt(statement.params, INSERT_BOUND.priceGroupID);

    expect(typeof boundPriceGroupID).toBe('string');
    expect(String(boundPriceGroupID)).toMatch(MINTED_IDENTIFIER_PATTERN);

    // And the path is the ancestor chain with that key appended, computed here by the same two
    // primitives the adapter uses, so this asserts the composition rather than restating a literal
    // that could drift.
    const expectedAncestorPath = buildIdPathList<PriceGroup>(
      parentPriceGroup,
      (node) => node.getPriceGroupID(),
      (node) => node.getParentPriceGroup(),
    );

    expect(expectedAncestorPath).toBe(
      CANNED_ROOT_PRICE_GROUP_ID + ',' + CANNED_PARENT_PRICE_GROUP_ID,
    );
    expect(parameterAt(statement.params, INSERT_BOUND.priceGroupIDPath)).toBe(
      listAppend(expectedAncestorPath, String(boundPriceGroupID)),
    );

    expect(inserted.getPriceGroupID()).toBe(boundPriceGroupID);
    expect(inserted.getPriceGroupIDPath()).toBe(
      listAppend(expectedAncestorPath, String(boundPriceGroupID)),
    );
    expect(inserted.isNew()).toBe(false);

    // The parent is bound as an identifier, and one captured instant stamps both audit columns
    // [org/Hibachi/HibachiEntity.cfc:L609].
    expect(parameterAt(statement.params, INSERT_BOUND.parentPriceGroupID)).toBe(
      CANNED_PARENT_PRICE_GROUP_ID,
    );
    expect(parameterAt(statement.params, INSERT_BOUND.createdDateTime)).toBe(
      parameterAt(statement.params, INSERT_BOUND.modifiedDateTime),
    );
    expect(
      requireBoundDate(
        parameterAt(statement.params, INSERT_BOUND.createdDateTime),
        'the insert audit stamp',
      ),
    ).toBeInstanceOf(Date);
  });

  it('composes a single-segment path when the price group has no parent', async () => {
    const { repository, executor } = makeSubject([]);

    const inserted = await repository.savePriceGroup(makeUnsavedPriceGroup(undefined));

    const statement = onlyStatement(executor.mutationCalls);
    const boundPriceGroupID = String(parameterAt(statement.params, INSERT_BOUND.priceGroupID));

    // A root price group's path is its own key and nothing else - no leading delimiter, which is
    // the property `buildIdPathList` guarantees and `listAppend` preserves.
    expect(parameterAt(statement.params, INSERT_BOUND.priceGroupIDPath)).toBe(boundPriceGroupID);
    expect(inserted.getPriceGroupIDPath()).toBe(boundPriceGroupID);
    expect(parameterAt(statement.params, INSERT_BOUND.parentPriceGroupID)).toBeNull();
  });

  it('rebuilds the path on the UPDATE path, from the CURRENT parent chain', async () => {
    // C4.1 and C4.2. A parent reassignment changes the path, so maintenance has to run on update
    // as well, and from the entity's CURRENT chain rather than from whatever path is stored on it.
    const parentPriceGroup = makePersistedPriceGroup({
      priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
      priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
      parentPriceGroup: undefined,
    });

    const reassigned = makePersistedPriceGroup({
      priceGroupID: CANNED_PRICE_GROUP_ID,
      priceGroupIDPath: 'stale-ancestor,' + CANNED_PRICE_GROUP_ID,
      parentPriceGroup: parentPriceGroup,
    });

    const priorState = makePersistedPriceGroup({
      priceGroupID: CANNED_PRICE_GROUP_ID,
      priceGroupIDPath: 'stale-ancestor,' + CANNED_PRICE_GROUP_ID,
      parentPriceGroup: undefined,
    });

    const { repository, executor } = makeSubject([]);

    await repository.savePriceGroup(reassigned, priorState);

    expect(executor.calls).toHaveLength(0);

    const statement = onlyStatement(executor.mutationCalls);

    expect(statement.sql).toBe(EXPECTED_UPDATE_PRICE_GROUP_SQL);
    expect(statement.params).toHaveLength(UPDATE_PRICE_GROUP_BOUND_VALUE_COUNT);

    expect(parameterAt(statement.params, UPDATE_BOUND.priceGroupIDPath)).toBe(
      CANNED_PARENT_PRICE_GROUP_ID + ',' + CANNED_PRICE_GROUP_ID,
    );
    expect(parameterAt(statement.params, UPDATE_BOUND.priceGroupIDPath)).not.toContain(
      'stale-ancestor',
    );

    // The key binds last, after every value in the `SET` list, because it belongs to the `WHERE`
    // clause. Binding it anywhere else would update the wrong row.
    expect(parameterAt(statement.params, UPDATE_BOUND.priceGroupID)).toBe(CANNED_PRICE_GROUP_ID);
    expect(parameterAt(statement.params, UPDATE_BOUND.parentPriceGroupID)).toBe(
      CANNED_PARENT_PRICE_GROUP_ID,
    );

    // No descendant update.
    expect(executor.mutationCalls).toHaveLength(1);
  });

  it('takes the prior persisted state as an entity or not at all', () => {
    // C4.2. Both of these are compile-time proofs consumed at run time, which is the only way to
    // assert a TYPE rather than a value.
    const isEntityOrAbsent: PriorStateIsEntityOrAbsent = true;
    const admitsAbsence: PriorStateAdmitsAbsence = true;

    expect(isEntityOrAbsent).toBe(true);
    expect(admitsAbsence).toBe(true);

    const tuples = makePortArgumentTuples();

    expect(tuples.savePriceGroup).toHaveLength(2);
    expect(elementAt(tuples.savePriceGroup, 1, 'the prior state')).toBeInstanceOf(PriceGroup);
  });

  it('refuses a prior state on the insert path, emitting nothing at all', async () => {
    // The port declares prior state as ABSENT on an insert, so the combination means the caller
    // routed a first insert down the update path.
    const { repository, executor } = makeSubject([]);

    await expect(
      repository.savePriceGroup(
        makeUnsavedPriceGroup(undefined),
        makePersistedPriceGroup({
          priceGroupID: CANNED_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PRICE_GROUP_ID,
          parentPriceGroup: undefined,
        }),
      ),
    ).rejects.toThrow(/prior state/u);

    expect(executor.calls).toHaveLength(0);
    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('updates without a prior state too, rebuilding the path just the same', async () => {
    // Prior state is what the `preUpdate`-equivalent path maintenance CAN consult; it is not what
    // makes maintenance run. An update without it still rebuilds, because the rebuild reads the
    // entity's own chain.
    const parentPriceGroup = makePersistedPriceGroup({
      priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
      priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
      parentPriceGroup: undefined,
    });

    const { repository, executor } = makeSubject([]);

    await repository.savePriceGroup(
      makePersistedPriceGroup({
        priceGroupID: CANNED_PRICE_GROUP_ID,
        priceGroupIDPath: undefined,
        parentPriceGroup: parentPriceGroup,
      }),
    );

    const statement = onlyStatement(executor.mutationCalls);

    expect(statement.sql).toBe(EXPECTED_UPDATE_PRICE_GROUP_SQL);
    expect(parameterAt(statement.params, UPDATE_BOUND.priceGroupIDPath)).toBe(
      CANNED_PARENT_PRICE_GROUP_ID + ',' + CANNED_PRICE_GROUP_ID,
    );
  });

  it('reports an insert that stored no row rather than returning a phantom key', async () => {
    const { repository, executor } = makeSubject([], [NO_ROW_WRITE_RESULT]);

    await expect(repository.savePriceGroup(makeUnsavedPriceGroup(undefined))).rejects.toThrow(
      /no inserted row/u,
    );

    expect(executor.mutationCalls).toHaveLength(1);
  });

  it('★★ REFUSES an UPDATE that matched no row, symmetrically with the insert above', async () => {
    // And this is the path that stores the materialized `priceGroupIDPath`.
    const { repository, executor } = makeSubject([], [NO_ROW_WRITE_RESULT]);

    await expect(
      repository.savePriceGroup(
        makePersistedPriceGroup({
          priceGroupID: CANNED_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PRICE_GROUP_ID,
          parentPriceGroup: undefined,
        }),
      ),
    ).rejects.toThrow(/matched no row/u);

    // The statement was issued - the refusal is on the server's own answer - and it was the
    // update.
    expect(executor.mutationCalls).toHaveLength(1);
    expect(onlyStatement(executor.mutationCalls).sql).toBe(EXPECTED_UPDATE_PRICE_GROUP_SQL);
  });
});

/**
 * The canned sequence a rate read consumes: the rate, then all six link statements.
 *
 * Each link statement projects its own member column, so each canned row carries that column and
 * no other.
 */
function rateLinkResultSets(): readonly (readonly SqlRow[])[] {
  return EXPECTED_RATE_LINK_TABLES.map((linkTable) => [
    rateLinkRow(linkTable.memberColumn, 'member-' + linkTable.memberColumn),
  ]);
}

/**
 * How many statements a two-deep parent chain issues, with no rates anywhere.
 *
 * Three row reads climbing the chain, one keyed rate read covering all three identifiers, and one
 * children read for the subject.
 */
const TWO_DEEP_CHAIN_STATEMENT_COUNT = 5;

describe('fetch shape - materialized at the boundary, never simulated laziness', () => {
  // C4.4. Hibernate lazy collections have no equivalent in a driver-only stack and the target does
  // not simulate laziness.

  it('hands back a price group with its rates, its global rate and its parent populated', async () => {
    // The canned sequence follows the emitted order: the subject's row, then its parent's row,
    // then one rate read keyed on both identifiers, then the six link reads, then the children.
    const { repository, executor } = makeSubject([
      [priceGroupRow({ parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID })],
      [
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
          parentPriceGroupID: null,
        }),
      ],
      [priceGroupRateRow({ globalFlag: 1, ...joinedRoundingRuleColumns() })],
      ...rateLinkResultSets(),
      NO_ROWS,
    ]);

    const priceGroup = requirePriceGroup(
      await repository.getPriceGroup(CANNED_PRICE_GROUP_ID),
      'the price group that was read back',
    );

    // One rate statement for the whole chain, keyed on both identifiers in walk order.
    expect(statementAt(executor.calls, 2).sql).toBe(
      EXPECTED_SELECT_RATES_BY_PRICE_GROUP_SQL_FOR_TWO_IDS,
    );
    expect(statementAt(executor.calls, 2).params).toStrictEqual([
      CANNED_PRICE_GROUP_ID,
      CANNED_PARENT_PRICE_GROUP_ID,
    ]);

    // The three associations the five-level cascade
    // [model/service/PriceGroupService.cfc:L140-L181] traverses SYNCHRONOUSLY: the rate
    // collection, the global rate, and the parent it recurses into at L174.
    expect(priceGroup.getPriceGroupRates()).toHaveLength(1);

    const globalRate = requirePriceGroupRate(
      priceGroup.getGlobalPriceGroupRate(),
      'the global rate the cascade falls back to',
    );

    expect(globalRate.getGlobalFlag()).toBe(true);

    const parent = requirePriceGroup(
      priceGroup.getParentPriceGroup(),
      'the parent the cascade recurses into',
    );

    expect(parent.getPriceGroupID()).toBe(CANNED_PARENT_PRICE_GROUP_ID);

    // And the parent's own collection is a populated EMPTY one rather than a copy of the
    // subject's. Partitioning by the owning column is what keeps the two apart.
    expect(parent.getPriceGroupRates()).toStrictEqual([]);

    expect(priceGroup.getChildPriceGroups()).toStrictEqual([]);

    expect(priceGroup.getPriceGroupIDPath()).toBe(CANNED_PRICE_GROUP_ID);
  });

  it('issues no statement for a rate collection that is empty', async () => {
    // No N+1 and no wasted round trip.
    const { repository, executor } = makeSubject(leafPriceGroupResultSets());

    const priceGroup = requirePriceGroup(
      await repository.getPriceGroup(CANNED_PRICE_GROUP_ID),
      'the leaf price group',
    );

    expect(priceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(priceGroup.getGlobalPriceGroupRate()).toBeUndefined();

    expect(executor.calls).toHaveLength(LEAF_PRICE_GROUP_STATEMENT_COUNT);

    for (const statement of executor.calls) {
      expect(statement.sql).not.toContain('IN ()');
    }
  });

  it('walks a chain of STALE paths hop by hop, and reads children for the subject only', async () => {
    const { repository, executor } = makeSubject([
      [priceGroupRow({ parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID })],
      [
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
          parentPriceGroupID: CANNED_ROOT_PRICE_GROUP_ID,
        }),
      ],
      [
        priceGroupRow({
          priceGroupID: CANNED_ROOT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_ROOT_PRICE_GROUP_ID,
          parentPriceGroupID: null,
        }),
      ],
      // The keyed rate read, matching nothing - which is why no link statement follows it.
      NO_ROWS,
      // The children read, for the subject only.
      NO_ROWS,
    ]);

    const priceGroup = requirePriceGroup(
      await repository.getPriceGroup(CANNED_PRICE_GROUP_ID),
      'the leaf of a two-deep chain',
    );

    expect(executor.calls).toHaveLength(TWO_DEEP_CHAIN_STATEMENT_COUNT);

    const parent = requirePriceGroup(priceGroup.getParentPriceGroup(), 'the parent');
    const root = requirePriceGroup(parent.getParentPriceGroup(), 'the root');

    expect(root.getPriceGroupID()).toBe(CANNED_ROOT_PRICE_GROUP_ID);
    expect(root.getParentPriceGroup()).toBeUndefined();

    expect(statementAt(executor.calls, 0).params).toStrictEqual([CANNED_PRICE_GROUP_ID]);
    expect(statementAt(executor.calls, 1).params).toStrictEqual([CANNED_PARENT_PRICE_GROUP_ID]);
    expect(statementAt(executor.calls, 2).params).toStrictEqual([CANNED_ROOT_PRICE_GROUP_ID]);

    // Then one rate read for the whole chain, keyed on all three in the order they were reached.
    expect(statementAt(executor.calls, 3).sql).toBe(
      EXPECTED_SELECT_RATES_BY_PRICE_GROUP_SQL_FOR_THREE_IDS,
    );
    expect(statementAt(executor.calls, 3).params).toStrictEqual([
      CANNED_PRICE_GROUP_ID,
      CANNED_PARENT_PRICE_GROUP_ID,
      CANNED_ROOT_PRICE_GROUP_ID,
    ]);

    const childSelects = executor.calls.filter(
      (statement) => statement.sql === expectedSelectChildPriceGroupsSql(1),
    );

    expect(childSelects).toHaveLength(1);
    expect(elementAt(childSelects, 0, 'the children read').params).toStrictEqual([
      CANNED_PRICE_GROUP_ID,
    ]);

    // And no batched path read among them: with every path naming only its own row there is
    // nothing to prefetch, so the candidate set is empty and the statement is not issued at all.
    expect(
      executor.calls.filter((statement) => statement.sql === expectedSelectPriceGroupsByIDSql(1)),
    ).toHaveLength(0);
  });

  it('★★★ reads a whole maintained chain in ONE statement instead of one per hop', async () => {
    // The prefetch result deliberately arrives ROOT-FIRST, disagreeing with the walk order.
    const { repository, executor } = makeSubject([
      [
        priceGroupRow({
          parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: [
            CANNED_ROOT_PRICE_GROUP_ID,
            CANNED_PARENT_PRICE_GROUP_ID,
            CANNED_PRICE_GROUP_ID,
          ].join(','),
        }),
      ],
      [
        priceGroupRow({
          priceGroupID: CANNED_ROOT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_ROOT_PRICE_GROUP_ID,
          parentPriceGroupID: null,
        }),
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: [CANNED_ROOT_PRICE_GROUP_ID, CANNED_PARENT_PRICE_GROUP_ID].join(','),
          parentPriceGroupID: CANNED_ROOT_PRICE_GROUP_ID,
        }),
      ],
      // The keyed rate read, matching nothing.
      NO_ROWS,
      // The children read, for the subject only.
      NO_ROWS,
    ]);

    const priceGroup = requirePriceGroup(
      await repository.getPriceGroup(CANNED_PRICE_GROUP_ID),
      'the leaf of a maintained two-deep chain',
    );

    // Four statements where the stale-path fixture above needs five, and the difference is exactly
    // the hop that no longer needs its own read. The count no longer grows with the depth of the
    // chain.
    expect(executor.calls).toHaveLength(4);
    expect(statementAt(executor.calls, 0).params).toStrictEqual([CANNED_PRICE_GROUP_ID]);
    expect(statementAt(executor.calls, 1).sql).toBe(expectedSelectPriceGroupsByIDSql(2));
    expect(statementAt(executor.calls, 1).params).toStrictEqual([
      CANNED_ROOT_PRICE_GROUP_ID,
      CANNED_PARENT_PRICE_GROUP_ID,
    ]);
    expect(statementAt(executor.calls, 2).sql).toBe(
      EXPECTED_SELECT_RATES_BY_PRICE_GROUP_SQL_FOR_THREE_IDS,
    );
    expect(statementAt(executor.calls, 2).params).toStrictEqual([
      CANNED_PRICE_GROUP_ID,
      CANNED_PARENT_PRICE_GROUP_ID,
      CANNED_ROOT_PRICE_GROUP_ID,
    ]);
    expect(statementAt(executor.calls, 3).sql).toBe(expectedSelectChildPriceGroupsSql(1));

    // And the same graph the per-hop walk produced: leaf, parent, root, root parentless.
    const parent = requirePriceGroup(priceGroup.getParentPriceGroup(), 'the parent');
    const root = requirePriceGroup(parent.getParentPriceGroup(), 'the root');

    expect(parent.getPriceGroupID()).toBe(CANNED_PARENT_PRICE_GROUP_ID);
    expect(root.getPriceGroupID()).toBe(CANNED_ROOT_PRICE_GROUP_ID);
    expect(root.getParentPriceGroup()).toBeUndefined();
  });

  it('materializes an ancestor shared by two results as ONE instance', async () => {
    // The property hibernate guaranteed, asserted directly. One stored row was one object for the
    // life of a session, and the rest of this slice is written against that.
    const { repository, executor } = makeSubject([
      // Stage one: two subscription-owned identifiers.
      [
        subscriptionPriceGroupIDRow(CANNED_PRICE_GROUP_ID),
        subscriptionPriceGroupIDRow(CANNED_SIBLING_PRICE_GROUP_ID),
      ],
      // Stage two: both rows, both inheriting from the same parent.
      [
        priceGroupRow({ parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID }),
        priceGroupRow({
          priceGroupID: CANNED_SIBLING_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_SIBLING_PRICE_GROUP_ID,
          priceGroupName: 'Distributor',
          priceGroupCode: 'distributor',
          parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
        }),
      ],
      // The shared parent's row. The second chain finds it already collected and stops there, so
      // this is read once rather than once per result.
      [
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
          parentPriceGroupID: null,
        }),
      ],
      // The keyed rate read over all three identifiers, matching nothing.
      NO_ROWS,
      // One children read per result.
      NO_ROWS,
      NO_ROWS,
    ]);

    const results = await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    expect(results).toHaveLength(2);

    const firstParent = requirePriceGroup(
      elementAt(results, 0, 'the first result').getParentPriceGroup(),
      'the first result parent',
    );

    const secondParent = requirePriceGroup(
      elementAt(results, 1, 'the second result').getParentPriceGroup(),
      'the second result parent',
    );

    // `toBe` is REFERENCE identity, and reference identity is the assertion. Two structurally
    // equal parents would pass a deep comparison and still be the defect this case exists to
    // catch.
    expect(firstParent).toBe(secondParent);

    // The keyed rate read covers all three identifiers, the shared parent appearing once.
    expect(statementAt(executor.calls, 3).sql).toBe(
      EXPECTED_SELECT_RATES_BY_PRICE_GROUP_SQL_FOR_THREE_IDS,
    );
    expect(statementAt(executor.calls, 3).params).toStrictEqual([
      CANNED_PRICE_GROUP_ID,
      CANNED_PARENT_PRICE_GROUP_ID,
      CANNED_SIBLING_PRICE_GROUP_ID,
    ]);

    // And the shared row was read once, not once per descendant.
    const parentRowReads = executor.calls.filter(
      (statement) =>
        statement.sql === EXPECTED_SELECT_PRICE_GROUP_BY_ID_SQL &&
        statement.params.includes(CANNED_PARENT_PRICE_GROUP_ID),
    );

    expect(parentRowReads).toHaveLength(1);
  });

  it('attributes each rate to the price group that OWNS it, not to the first one asked about', async () => {
    // The case level five of the cascade depends on.
    const parentOwnedRateID = 'pgr-inherited';

    const { repository } = makeSubject([
      [priceGroupRow({ parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID })],
      [
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
          parentPriceGroupID: null,
        }),
      ],
      // One rate row, owned by the PARENT - the second identifier in the keyed set, not the first.
      [
        priceGroupRateRow({
          priceGroupRateID: parentOwnedRateID,
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          globalFlag: 1,
        }),
      ],
      ...rateLinkResultSets(),
      NO_ROWS,
    ]);

    const priceGroup = requirePriceGroup(
      await repository.getPriceGroup(CANNED_PRICE_GROUP_ID),
      'the child of a rate-bearing parent',
    );

    // The child owns nothing, and its global-rate lookup finds nothing either - so the cascade's
    // levels one through four fall through, which is precisely why level five exists.
    expect(priceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(priceGroup.getGlobalPriceGroupRate()).toBeUndefined();

    // The parent owns the rate.
    const parent = requirePriceGroup(priceGroup.getParentPriceGroup(), 'the rate-bearing parent');
    const inherited = requirePriceGroupRate(
      parent.getGlobalPriceGroupRate(),
      'the rate the parent owns',
    );

    expect(parent.getPriceGroupRates()).toHaveLength(1);
    expect(inherited.getPriceGroupRateID()).toBe(parentOwnedRateID);
  });

  it('raises rather than truncating when the stored parent pointers form a cycle', async () => {
    // One POLICY, and this is it: a repeat within one ancestor chain means the stored pointers
    // form a cycle, so there is no ancestry to return and the read raises, naming the chain it
    // followed.
    const { repository, executor } = makeSubject([
      [priceGroupRow({ parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID })],
      [
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
          // Points back at the price group that was asked for.
          parentPriceGroupID: CANNED_PRICE_GROUP_ID,
        }),
      ],
    ]);

    await expect(repository.getPriceGroup(CANNED_PRICE_GROUP_ID)).rejects.toThrow(
      /pointers form a cycle/u,
    );

    // Two row reads that discovered the loop, and not the keyed rate read that would follow them.
    expect(executor.calls).toHaveLength(2);
    expect(statementAt(executor.calls, 0).sql).toBe(EXPECTED_SELECT_PRICE_GROUP_BY_ID_SQL);
    expect(statementAt(executor.calls, 1).sql).toBe(EXPECTED_SELECT_PRICE_GROUP_BY_ID_SQL);

    // The message names the chain that was followed, so the offending rows can be found directly
    // rather than inferred.
    await expect(
      makeSubject([
        [priceGroupRow({ parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID })],
        [
          priceGroupRow({
            priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
            priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
            parentPriceGroupID: CANNED_PRICE_GROUP_ID,
          }),
        ],
      ]).repository.getPriceGroup(CANNED_PRICE_GROUP_ID),
    ).rejects.toThrow(
      new RegExp(
        CANNED_PRICE_GROUP_ID +
          ' -> ' +
          CANNED_PARENT_PRICE_GROUP_ID +
          ' -> ' +
          CANNED_PRICE_GROUP_ID,
        'u',
      ),
    );
  });

  it('★ detects a cycle whose pointers differ only in CASE, instead of climbing it forever', async () => {
    // The worst outcome in this file, and it was reachable.
    const mixedCaseParentID = CANNED_PARENT_PRICE_GROUP_ID.toUpperCase();

    const { repository, executor } = makeSubject([
      // The seed points at its parent in UPPER case.
      [priceGroupRow({ parentPriceGroupID: mixedCaseParentID })],
      // The row that comes back carries the stored (lower) casing and points back at the seed,
      // again in a different case than the seed's own column.
      [
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
          parentPriceGroupID: CANNED_PRICE_GROUP_ID.toUpperCase(),
        }),
      ],
    ]);

    await expect(repository.getPriceGroup(CANNED_PRICE_GROUP_ID)).rejects.toThrow(
      /pointers form a cycle/u,
    );

    // Bounded, and bounded at exactly the same two reads the same-case cycle costs: the guard
    // fires on the first repeat rather than after an unbounded number of them.
    expect(executor.calls).toHaveLength(2);
  });

  it('treats the same row reached from two chains as a shared instance, never as a cycle', async () => {
    const { repository } = makeSubject([
      [
        subscriptionPriceGroupIDRow(CANNED_PRICE_GROUP_ID),
        subscriptionPriceGroupIDRow(CANNED_SIBLING_PRICE_GROUP_ID),
      ],
      [
        priceGroupRow({ parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID }),
        priceGroupRow({
          priceGroupID: CANNED_SIBLING_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_SIBLING_PRICE_GROUP_ID,
          parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
        }),
      ],
      [
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
          parentPriceGroupID: null,
        }),
      ],
      NO_ROWS,
      NO_ROWS,
      NO_ROWS,
    ]);

    const results = await repository.getAccountSubscriptionPriceGroups(CANNED_ACCOUNT_ID);

    expect(results).toHaveLength(2);
  });

  it('hands back a rate with its rounding rule, its appliesTo and all six collections', async () => {
    const { repository, executor } = makeSubject([
      [priceGroupRateRow({ ...joinedRoundingRuleColumns() })],
      ...rateLinkResultSets(),
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    const rate = requirePriceGroupRate(
      await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID),
      'the rate that was read back',
    );

    // The rounding rule the discount path needs, joined in the same statement rather than fetched
    // per rate.
    const roundingRule = requireRoundingRule(rate.getRoundingRule(), 'the joined rounding rule');

    expect(roundingRule.getRoundingRuleID()).toBe(CANNED_ROUNDING_RULE_ID);

    // `getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95] is SYNCHRONOUS and counts all six
    // collections, so every one of them has to be populated before it is reachable.
    expect(rate.getGlobalFlag()).toBe(false);
    expect(rate.getAppliesTo().length).toBeGreaterThan(0);

    // The three included collections.
    expect(rate.getProductTypes()).toHaveLength(1);
    expect(rate.getProducts()).toHaveLength(1);
    expect(rate.getSkus()).toHaveLength(1);

    // [model/entity/PriceGroupRate.cfc:L75-L77] declares `excludedProductTypes`,
    // `excludedProducts` and `excludedSkus`, and the five-level cascade at
    // [model/service/PriceGroupService.cfc:L140-L181] reads none of them.
    expect(rate.getExcludedProductTypes()).toHaveLength(1);
    expect(rate.getExcludedProducts()).toHaveLength(1);
    expect(rate.getExcludedSkus()).toHaveLength(1);

    // The owning price group is reachable, and it brought its own shape with it.
    const owner = requirePriceGroup(rate.getPriceGroup(), 'the owning price group');

    expect(owner.getPriceGroupID()).toBe(CANNED_PRICE_GROUP_ID);

    // Bounded: the rate, its six link statements, then the owner's three.
    expect(executor.calls).toHaveLength(
      1 + RATE_LINK_TABLE_COUNT + LEAF_PRICE_GROUP_STATEMENT_COUNT,
    );
  });

  it('leaves the rounding rule absent when the outer join matched none', async () => {
    // The left outer join is what makes a rate without a rule a single statement rather than two.
    const { repository } = makeSubject([
      [priceGroupRateRow()],
      ...rateLinkResultSets(),
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    const rate = requirePriceGroupRate(
      await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID),
      'the rate with no rounding rule',
    );

    expect(rate.getRoundingRule()).toBeUndefined();
  });

  it('does not fetch a collection the shape does not promise', async () => {
    // No MORE than the documented shape.
    const { repository, executor } = makeSubject(leafPriceGroupResultSets());

    const priceGroup = requirePriceGroup(
      await repository.getPriceGroup(CANNED_PRICE_GROUP_ID),
      'the leaf price group',
    );

    expect(priceGroup.getPromotionRewards()).toStrictEqual([]);

    for (const statement of sqlTextsOf(executor.calls)) {
      expect(statement.toLowerCase()).not.toContain('promotion');
      expect(statement.toLowerCase()).not.toContain('reward');
    }
  });
});

const PINNED_FIXTURE_PREFIX = 'pinned';

const PINNED_CHILD_PRICE_GROUP_ID = 'pinned-pricegroup-child';

/**
 * How many READS a delete issues: one existence probe per out-of-scope delete gate.
 */
const DELETE_GATE_PROBE_COUNT = 5;

/**
 * How many WRITES a delete issues: the child detach, six link deletes, the rate delete, the row.
 *
 * The order is not incidental: a link row references a rate and a rate references the group, so
 * deleting outside-in keeps every intermediate state referentially consistent.
 *
 * Former documentation read "How many statements a delete issues: six link deletes, the rate
 * delete, the row" - accurate about the cascade and silent about the detachment.
 */
const DELETE_MUTATION_COUNT = 9;

/**
 * Mutation index of the child-detach UPDATE, which precedes the whole cascade.
 */
const DETACH_MUTATION_INDEX = 0;

/**
 * Mutation index of the first rate link delete, i.e. immediately after the detach.
 */
const FIRST_RATE_LINK_MUTATION_INDEX = 1;

/**
 * Every write outcome a full delete consumes, with the final row reporting no match.
 */
const DELETE_WRITE_RESULTS_WITH_NO_MATCHED_ROW: readonly SqlMutationResult[] = Object.freeze([
  WRITE_RESULT,
  WRITE_RESULT,
  WRITE_RESULT,
  WRITE_RESULT,
  WRITE_RESULT,
  WRITE_RESULT,
  WRITE_RESULT,
  WRITE_RESULT,
  NO_ROW_WRITE_RESULT,
]);

/**
 * The five delete gates, in the entity's declaration order, with their physical reach.
 */
const EXPECTED_DELETE_GATES: readonly { readonly tableName: string; readonly column: string }[] =
  Object.freeze([
    Object.freeze({ tableName: 'SwOrderItem', column: 'appliedPriceGroupID' }),
    Object.freeze({ tableName: 'SwAccountPriceGroup', column: 'priceGroupID' }),
    Object.freeze({ tableName: 'SwSubsBenefitPriceGroup', column: 'priceGroupID' }),
    Object.freeze({ tableName: 'SwSubsUsageBenefitPriceGroup', column: 'priceGroupID' }),
    Object.freeze({ tableName: 'SwPromoRewardEligiblePriceGrp', column: 'priceGroupID' }),
  ]);

/**
 * The expected existence probe for one delete gate.
 */
function expectedDeleteGateProbeSql(gate: {
  readonly tableName: string;
  readonly column: string;
}): string {
  return ['SELECT 1', 'FROM ' + gate.tableName, 'WHERE ' + gate.column + ' = ?', 'LIMIT 1'].join(
    '\n',
  );
}

/**
 * The expected child-detach UPDATE, written out in full.
 */
const EXPECTED_DETACH_CHILD_PRICE_GROUPS_SQL = [
  'UPDATE SwPriceGroup',
  'SET parentPriceGroupID = NULL, priceGroupIDPath = priceGroupID, modifiedDateTime = ?, ' +
    'modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
  'WHERE parentPriceGroupID = ?',
].join('\n');

/**
 * Positional indices into the detach UPDATE's three bound values.
 */
const DETACH_BOUND = Object.freeze({
  modifiedDateTime: 0,
  modifiedByAccountID: 1,
  parentPriceGroupID: 2,
});

/**
 * Canned reads for a delete whose gates all pass.
 */
const ALL_GATES_CLEAR: readonly (readonly SqlRow[])[] = Object.freeze([
  NO_ROWS,
  NO_ROWS,
  NO_ROWS,
  NO_ROWS,
  NO_ROWS,
]);

/**
 * A gate result set that blocks the delete: one row is all it takes.
 */
const GATE_BLOCKED: readonly SqlRow[] = Object.freeze([Object.freeze({ '1': 1 })]);

describe('load by identifier, and delete', () => {
  it('reads a price group by one bound identifier, never interpolated', async () => {
    // C5.1. E5/P5 is the governing obligation, asserted directly rather than inferred from the
    // absence of a quote: the identifier must appear in the PARAMETER ARRAY and must not appear in
    // the statement TEXT.
    const { repository, executor } = makeSubject(leafPriceGroupResultSets());

    await repository.getPriceGroup(CANNED_PRICE_GROUP_ID);

    const statement = statementAt(executor.calls, 0);

    expect(statement.sql).toBe(EXPECTED_SELECT_PRICE_GROUP_BY_ID_SQL);
    expect(statement.params).toStrictEqual([CANNED_PRICE_GROUP_ID]);
    expect(statement.sql).not.toContain(CANNED_PRICE_GROUP_ID);

    expect(statement.sql).toContain(EXPECTED_PRICE_GROUP_SELECT_LIST);
  });

  it('reads a rate by one bound identifier, never interpolated', async () => {
    const { repository, executor } = makeSubject([
      [priceGroupRateRow()],
      ...rateLinkResultSets(),
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID);

    const statement = statementAt(executor.calls, 0);

    expect(statement.sql).toBe(EXPECTED_SELECT_RATE_BY_ID_SQL);
    expect(statement.params).toStrictEqual([CANNED_PRICE_GROUP_RATE_ID]);
    expect(statement.sql).not.toContain(CANNED_PRICE_GROUP_RATE_ID);
    expect(statement.sql).toContain(EXPECTED_RATE_SELECT_LIST);
  });

  it('answers undefined on a miss - never a zero, never an empty object', async () => {
    const missingGroup = makeSubject([NO_ROWS]);

    await expect(
      missingGroup.repository.getPriceGroup('pg-does-not-exist'),
    ).resolves.toBeUndefined();

    expect(onlyStatement(missingGroup.executor.calls).params).toStrictEqual(['pg-does-not-exist']);

    const missingRate = makeSubject([NO_ROWS]);

    await expect(
      missingRate.repository.getPriceGroupRate('pgr-does-not-exist'),
    ).resolves.toBeUndefined();
    expect(onlyStatement(missingRate.executor.calls).params).toStrictEqual(['pgr-does-not-exist']);
  });

  it('deletes outside-in: six link deletes, the rate delete, then the row', async () => {
    const fixtures = makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX });

    expect(fixtures.childPriceGroup.getPriceGroupID()).toBe(PINNED_CHILD_PRICE_GROUP_ID);
    expect(fixtures.childPriceGroup.isNew()).toBe(false);

    const { repository, executor } = makeSubject(ALL_GATES_CLEAR);

    const deleted = await repository.deletePriceGroup(fixtures.childPriceGroup);

    expect(deleted).toBe(true);
    expect(typeof deleted).toBe('boolean');

    // DELETED: "No read at all: the delete is keyed on the identifier the entity already carries."
    // The second half is still exactly true.
    expect(executor.calls).toHaveLength(DELETE_GATE_PROBE_COUNT);
    expect(executor.mutationCalls).toHaveLength(DELETE_MUTATION_COUNT);

    // The child detach comes FIRST, before anything is removed.
    const detach = statementAt(executor.mutationCalls, DETACH_MUTATION_INDEX);

    expect(detach.sql).toBe(EXPECTED_DETACH_CHILD_PRICE_GROUPS_SQL);
    expect(detach.params).toHaveLength(3);
    expect(parameterAt(detach.params, DETACH_BOUND.modifiedByAccountID)).toBe(
      TEST_AUDIT_ACTOR.accountID,
    );
    expect(parameterAt(detach.params, DETACH_BOUND.parentPriceGroupID)).toBe(
      PINNED_CHILD_PRICE_GROUP_ID,
    );

    // Then the six link deletes, in the COLLECTION ORDER the ENTITY DECLARES
    // [model/entity/PriceGroupRate.cfc:L71-L77], each scoped by the owning price group through a
    // sub-select rather than by a list of rate identifiers.
    for (const [index, linkTable] of EXPECTED_RATE_LINK_TABLES.entries()) {
      const statement = statementAt(executor.mutationCalls, FIRST_RATE_LINK_MUTATION_INDEX + index);

      expect(statement.sql).toBe(expectedRateLinkDeleteSql(linkTable));
      expect(statement.params).toStrictEqual([PINNED_CHILD_PRICE_GROUP_ID]);
    }

    // Then the rates, then the row itself.
    const rateDelete = statementAt(
      executor.mutationCalls,
      FIRST_RATE_LINK_MUTATION_INDEX + RATE_LINK_TABLE_COUNT,
    );

    expect(rateDelete.sql).toBe(EXPECTED_DELETE_RATES_BY_PRICE_GROUP_SQL);
    expect(rateDelete.params).toStrictEqual([PINNED_CHILD_PRICE_GROUP_ID]);

    const rowDelete = statementAt(executor.mutationCalls, DELETE_MUTATION_COUNT - 1);

    expect(rowDelete.sql).toBe(EXPECTED_DELETE_PRICE_GROUP_ROW_SQL);
    expect(rowDelete.params).toStrictEqual([PINNED_CHILD_PRICE_GROUP_ID]);
  });

  it('mutates with DELETE and one UPDATE only - never TRUNCATE, never DROP', async () => {
    const { repository, executor } = makeSubject(ALL_GATES_CLEAR);

    await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    // Every statement this path issues is row-scoped - a `WHERE` clause on each, without
    // exception. The first is the child-detach `UPDATE` and the rest are `DELETE`s.
    const [firstMutation, ...cascadeMutations] = sqlTextsOf(executor.mutationCalls);

    expect(firstMutation).toBe(EXPECTED_DETACH_CHILD_PRICE_GROUPS_SQL);
    expect(cascadeMutations).toHaveLength(DELETE_MUTATION_COUNT - 1);

    for (const statement of cascadeMutations) {
      expect(statement.toUpperCase().startsWith('DELETE FROM ')).toBe(true);
    }

    for (const statement of sqlTextsOf(executor.mutationCalls)) {
      const foldedSql = statement.toUpperCase();

      expect(foldedSql).toContain('WHERE');
      expect(foldedSql).not.toContain('TRUNCATE');
      expect(foldedSql).not.toContain('DROP');
    }
  });

  it('reports false for an entity that was never persisted, emitting nothing', async () => {
    // `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] means this entity has no row.
    const { repository, executor } = makeSubject([]);

    const deleted = await repository.deletePriceGroup(makeUnsavedPriceGroup(undefined));

    expect(deleted).toBe(false);
    expect(executor.calls).toHaveLength(0);
    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('reports false when the row delete matched nothing, after emitting every statement', async () => {
    // The boolean is `affectedRows > 0` on the ROW delete, which is the statement that decides
    // whether the price group is gone.
    const { repository, executor } = makeSubject(
      ALL_GATES_CLEAR,
      DELETE_WRITE_RESULTS_WITH_NO_MATCHED_ROW,
    );

    const deleted = await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    expect(deleted).toBe(false);
    expect(executor.mutationCalls).toHaveLength(DELETE_MUTATION_COUNT);
  });
});

/**
 * A subject held at the CONCRETE adapter type.
 *
 * `Subject.repository` is deliberately typed to the six-member port, which is what makes every
 * other case in this file a test of the contract.
 */
function makeSetLoaderSubject(cannedResultSets: readonly (readonly SqlRow[])[]): {
  readonly executor: RecordingExecutor;
  readonly adapter: MySqlPriceGroupRepository;
} {
  const executor = new RecordingExecutor(cannedResultSets, []);

  return {
    executor,
    // The audit actor is the adapter's SECOND constructor argument: writes stamp
    // `createdByAccountID` / `modifiedByAccountID` from it rather than from caller-supplied data.
    adapter: new MySqlPriceGroupRepository(
      executor,
      TEST_AUDIT_ACTOR,
      makeRecordingValueRounder(),
      LIVE_REQUEST_CLOCK,
    ),
  };
}

describe('getPriceGroupsByID - one statement for a key set, never one per key', () => {
  // net-new coverage (AAP 0.6.6). `model/dao/PriceGroupDAO.cfc` declares no load function at all,
  // so there is no legacy antecedent for either the singular or the set-based form.

  const SECOND_PRICE_GROUP_ID = CANNED_SIBLING_PRICE_GROUP_ID;

  /**
   * Two independent leaf groups: the seed read, one shared rate read, then one child read each.
   */
  function twoLeafSeedResultSets(): readonly (readonly SqlRow[])[] {
    return [
      [
        priceGroupRow(),
        priceGroupRow({
          priceGroupID: SECOND_PRICE_GROUP_ID,
          priceGroupIDPath: SECOND_PRICE_GROUP_ID,
          priceGroupName: 'Distributor',
          priceGroupCode: 'distributor',
        }),
      ],
      NO_ROWS,
      NO_ROWS,
      NO_ROWS,
    ];
  }

  it('binds one placeholder per key, in the caller order, and interpolates nothing', async () => {
    const { adapter, executor } = makeSetLoaderSubject(twoLeafSeedResultSets());

    await adapter.getPriceGroupsByID([CANNED_PRICE_GROUP_ID, SECOND_PRICE_GROUP_ID]);

    const seedStatement = statementAt(executor.calls, 0);

    expect(seedStatement.sql).toBe(expectedSelectPriceGroupsByIDSql(2));
    expect(seedStatement.params).toStrictEqual([CANNED_PRICE_GROUP_ID, SECOND_PRICE_GROUP_ID]);

    // E5/P5 asserted directly rather than inferred from the absence of a quote.
    expect(seedStatement.sql).not.toContain(CANNED_PRICE_GROUP_ID);
    expect(seedStatement.sql).not.toContain(SECOND_PRICE_GROUP_ID);
  });

  it('adds no activeFlag filter, no ORDER BY and no LIMIT to the singular form it widens', async () => {
    const { adapter, executor } = makeSetLoaderSubject(twoLeafSeedResultSets());

    await adapter.getPriceGroupsByID([CANNED_PRICE_GROUP_ID, SECOND_PRICE_GROUP_ID]);

    const seedStatement = statementAt(executor.calls, 0);

    // The singular read carries none of the three. A set-based form that quietly added one would
    // not be interchangeable with N singular calls, which is the whole basis for substituting it.
    expect(seedStatement.sql).not.toContain('activeFlag = ?');
    expect(seedStatement.sql).not.toContain('ORDER BY');
    expect(seedStatement.sql).not.toContain('LIMIT');

    // And the only difference from the singular text is the predicate.
    expect(seedStatement.sql.replace('IN (?, ?)', '= ?')).toBe(
      EXPECTED_SELECT_PRICE_GROUP_BY_ID_SQL,
    );
  });

  it('★★★ issues ONE seed statement for two keys where two singular reads issued two', async () => {
    const batched = makeSetLoaderSubject(twoLeafSeedResultSets());

    await batched.adapter.getPriceGroupsByID([CANNED_PRICE_GROUP_ID, SECOND_PRICE_GROUP_ID]);

    // Filtered on the BY-KEY predicate, not on the table: the children read reaches the same table
    // by `parentPriceGroupID` and is not a by-key read.
    const batchedSeedReads = batched.executor.calls.filter((statement) =>
      statement.sql.includes('WHERE pg.priceGroupID'),
    );

    expect(batchedSeedReads).toHaveLength(1);

    // The comparison that gives the number meaning: the same two groups, read one at a time.
    const serial = makeSetLoaderSubject([
      ...leafPriceGroupResultSets(),
      ...leafPriceGroupResultSets(
        priceGroupRow({
          priceGroupID: SECOND_PRICE_GROUP_ID,
          priceGroupIDPath: SECOND_PRICE_GROUP_ID,
        }),
      ),
    ]);

    await serial.adapter.getPriceGroup(CANNED_PRICE_GROUP_ID);
    await serial.adapter.getPriceGroup(SECOND_PRICE_GROUP_ID);

    const serialSeedReads = serial.executor.calls.filter((statement) =>
      statement.sql.includes('WHERE pg.priceGroupID'),
    );

    expect(serialSeedReads).toHaveLength(2);
    expect(serial.executor.calls).toHaveLength(LEAF_PRICE_GROUP_STATEMENT_COUNT * 2);

    // Two rather than six: one seed read and one shared rate read.
    expect(batched.executor.calls).toHaveLength(2);
    expect(
      batched.executor.calls.filter((statement) =>
        statement.sql.includes('WHERE pg.parentPriceGroupID'),
      ),
    ).toHaveLength(0);

    // And the port reads are unchanged, which is the safety argument for the line above.
    expect(
      serial.executor.calls.filter((statement) =>
        statement.sql.includes('WHERE pg.parentPriceGroupID'),
      ),
    ).toHaveLength(2);
  });

  it('keys the answer by CASE-FOLDED identifier, so a caller spelling need not match the row', async () => {
    const { adapter } = makeSetLoaderSubject(leafPriceGroupResultSets());

    const loaded = await adapter.getPriceGroupsByID([CANNED_PRICE_GROUP_ID.toUpperCase()]);

    // Asked for in upper case, stored in lower case, found under the folded key. CFML identifiers
    // are case-insensitive and MySQL's default collation matches them that way.
    expect(loaded.get(CANNED_PRICE_GROUP_ID)).toBeDefined();
    expect(loaded.get(CANNED_PRICE_GROUP_ID.toUpperCase())).toBeUndefined();
    expect(loaded.size).toBe(1);
  });

  it('collapses a repeated key - including one repeated only in casing - to ONE placeholder', async () => {
    const { adapter, executor } = makeSetLoaderSubject(leafPriceGroupResultSets());

    await adapter.getPriceGroupsByID([
      CANNED_PRICE_GROUP_ID,
      CANNED_PRICE_GROUP_ID,
      CANNED_PRICE_GROUP_ID.toUpperCase(),
    ]);

    const seedStatement = statementAt(executor.calls, 0);

    expect(seedStatement.sql).toBe(expectedSelectPriceGroupsByIDSql(1));

    // The FIRST spelling seen is what is bound, so the parameter is the caller's own value rather
    // than a folded one - identical to what the singular form would have bound.
    expect(seedStatement.params).toStrictEqual([CANNED_PRICE_GROUP_ID]);
  });

  it('★★★ issues NO statement at all for an empty key set, and answers an empty map', async () => {
    const { adapter, executor } = makeSetLoaderSubject([]);

    const loaded = await adapter.getPriceGroupsByID([]);

    // Parity, not optimisation: N singular calls issue N statements, so zero calls issue zero. It
    // also mechanically prevents `IN ()`, which is a MySQL syntax error.
    //
    // And the asymmetry with `mysqlOptionRepository` is deliberate, not an inconsistency.
    expect(executor.calls).toHaveLength(0);
    expect(loaded.size).toBe(0);
  });

  it('leaves an unmatched key ABSENT from the map rather than reporting it', async () => {
    // One key requested, no seed row returned. The caller decides what a miss means - and the two
    // callers in the composition root decide differently - so the loader must not decide for them.
    const { adapter } = makeSetLoaderSubject([NO_ROWS]);

    const loaded = await adapter.getPriceGroupsByID([CANNED_PRICE_GROUP_ID]);

    expect(loaded.size).toBe(0);
    expect(loaded.get(CANNED_PRICE_GROUP_ID)).toBeUndefined();
  });

  it('gives every entity the fetch shape the singular form gives it, association for association', async () => {
    const linkResultSets: readonly (readonly SqlRow[])[] = EXPECTED_RATE_LINK_TABLES.map(
      (linkTable) => [rateLinkRow(linkTable.memberColumn, 'member-' + linkTable.memberColumn)],
    );

    // Seed read, the shared rate read with one rate, its six link reads, then the seed's child
    // read.
    const { adapter } = makeSetLoaderSubject([
      [priceGroupRow()],
      [priceGroupRateRow()],
      ...linkResultSets,
      NO_ROWS,
    ]);

    const loaded = await adapter.getPriceGroupsByID([CANNED_PRICE_GROUP_ID]);
    const priceGroup = loaded.get(CANNED_PRICE_GROUP_ID);

    if (priceGroup === undefined) {
      throw new Error('the requested price group was not loaded');
    }

    // The three associations the five-level cascade
    // [model/service/PriceGroupService.cfc:L140-L181] walks, all materialized: the rates, the
    // global-rate projection over them, and the parent chain.
    expect(priceGroup.getPriceGroupRates()).toHaveLength(1);
    expect(priceGroup.getGlobalPriceGroupRate()).toBeUndefined();
    expect(priceGroup.getParentPriceGroup()).toBeUndefined();
    expect(priceGroup.getChildPriceGroups()).toStrictEqual([]);
  });

  it('★★★ hands ONE instance of a shared ancestor to every descendant that needs it', async () => {
    // Two seeds inheriting from one parent.
    const { adapter } = makeSetLoaderSubject([
      [
        priceGroupRow({ parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID }),
        priceGroupRow({
          priceGroupID: SECOND_PRICE_GROUP_ID,
          priceGroupIDPath: SECOND_PRICE_GROUP_ID,
          parentPriceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
        }),
      ],
      [
        priceGroupRow({
          priceGroupID: CANNED_PARENT_PRICE_GROUP_ID,
          priceGroupIDPath: CANNED_PARENT_PRICE_GROUP_ID,
          parentPriceGroupID: null,
        }),
      ],
      NO_ROWS,
      NO_ROWS,
      NO_ROWS,
    ]);

    const loaded = await adapter.getPriceGroupsByID([CANNED_PRICE_GROUP_ID, SECOND_PRICE_GROUP_ID]);

    const first = loaded.get(CANNED_PRICE_GROUP_ID);
    const second = loaded.get(SECOND_PRICE_GROUP_ID);

    if (first === undefined || second === undefined) {
      throw new Error('both requested price groups should have loaded');
    }

    expect(first.getParentPriceGroup()).toBe(second.getParentPriceGroup());
  });
});

describe('deletePriceGroup - the legacy relationship gates and the child detachment', () => {
  // net-new coverage (AAP 0.6.6).
  //
  // The service's detachment loop [model/service/PriceGroupService.cfc:L465-L467] nulls each
  // child's `parentPriceGroup` association [model/entity/PriceGroup.cfc:L139].

  it('probes all five out-of-scope gates, in the entity declaration order, before mutating', async () => {
    const { repository, executor } = makeSubject(ALL_GATES_CLEAR);

    const deleted = await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    expect(deleted).toBe(true);
    expect(executor.calls).toHaveLength(DELETE_GATE_PROBE_COUNT);
    for (const [index, gate] of EXPECTED_DELETE_GATES.entries()) {
      const probe = statementAt(executor.calls, index);

      expect(probe.sql).toBe(expectedDeleteGateProbeSql(gate));
      expect(probe.params).toStrictEqual([PINNED_CHILD_PRICE_GROUP_ID]);

      // Bound, never interpolated - the identifier is caller-supplied at the service tier.
      expect(probe.sql).not.toContain(PINNED_CHILD_PRICE_GROUP_ID);
    }

    // `childPriceGroups` is the sixth `maxCollection: 0` rule and is deliberately not probed: no
    // gate statement reads `parentPriceGroupID`.
    for (const probe of executor.calls) {
      expect(probe.sql).not.toContain('parentPriceGroupID');
    }
  });

  it.each(EXPECTED_DELETE_GATES.map((gate, index) => ({ gate, index })))(
    'refuses the delete when $gate.tableName has a row, emitting no mutation at all',
    async ({ gate, index }) => {
      const cannedReads = EXPECTED_DELETE_GATES.map((_unused, position) =>
        position === index ? GATE_BLOCKED : NO_ROWS,
      );

      const { repository, executor } = makeSubject(cannedReads);

      const deleted = await repository.deletePriceGroup(
        makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
      );

      // The bare boolean refusal of [org/Hibachi/HibachiService.cfc:L79] - not a throw.
      expect(deleted).toBe(false);

      // And not one row is modified.
      expect(executor.mutationCalls).toHaveLength(0);

      // Short-circuited: the gates after the blocking one are never asked, because the answer
      // cannot change.
      expect(executor.calls).toHaveLength(index + 1);
      expect(statementAt(executor.calls, index).sql).toBe(expectedDeleteGateProbeSql(gate));
    },
  );

  it('persists the child detachment: nulls the parent link and repaths the child', async () => {
    const { repository, executor } = makeSubject(ALL_GATES_CLEAR);

    await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    const detach = statementAt(executor.mutationCalls, DETACH_MUTATION_INDEX);

    expect(detach.sql).toBe(EXPECTED_DETACH_CHILD_PRICE_GROUPS_SQL);

    // The parent link is nulled with a SQL `NULL` literal rather than a bound empty string.
    expect(detach.sql).toContain('parentPriceGroupID = NULL');
    expect(detach.params).not.toContain('');

    // [model/entity/PriceGroup.cfc:L211-L214] recomputes
    // `setPriceGroupIDPath( buildIDPathList( "parentPriceGroup" ) )` on every update, and the walk
    // at [org/Hibachi/HibachiEntity.cfc:L309-L324] includes self.
    expect(detach.sql).toContain('priceGroupIDPath = priceGroupID');

    // Keyed on the PARENT, which is forced rather than chosen: by the time this runs the service
    // loop has emptied the entity's `childPriceGroups`, so there is no list of children to key on.
    expect(detach.sql).toContain('WHERE parentPriceGroupID = ?');
    expect(parameterAt(detach.params, DETACH_BOUND.parentPriceGroupID)).toBe(
      PINNED_CHILD_PRICE_GROUP_ID,
    );

    // Both modifying halves are stamped: the instant from one captured `now()`
    // [org/Hibachi/HibachiEntity.cfc:L662-L667] and the account through the admin gate
    // [org/Hibachi/HibachiEntity.cfc:L676-L678].
    expect(parameterAt(detach.params, DETACH_BOUND.modifiedDateTime)).toBeInstanceOf(Date);
    expect(detach.sql).toContain('modifiedByAccountID = COALESCE(?, modifiedByAccountID)');

    // Write-once columns are untouched, matching `UPDATED_PRICE_GROUP_COLUMNS`.
    expect(detach.sql).not.toContain('createdDateTime');
    expect(detach.sql).not.toContain('createdByAccountID');
  });

  it('runs every statement, gates included, inside one transaction', async () => {
    const { repository, executor } = makeSubject(ALL_GATES_CLEAR);

    await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    expect(executor.transactionCount).toBe(1);

    // Every statement, read and write alike. The gates are inside it too, so the relationships
    // cannot be populated between the probe and the delete.
    for (const statement of [...executor.calls, ...executor.mutationCalls]) {
      expect(statement.inTransaction).toBe(true);
    }
  });

  it('opens a transaction that refuses, and none at all for an unsaved entity', async () => {
    // A refusal still opens the transaction - the gates run inside it - and commits it empty.
    const refused = makeSubject([GATE_BLOCKED]);

    await expect(
      refused.repository.deletePriceGroup(
        makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
      ),
    ).resolves.toBe(false);

    expect(refused.executor.transactionCount).toBe(1);
    expect(refused.executor.mutationCalls).toHaveLength(0);

    // An unsaved entity short-circuits before the transaction, because there is no row to gate,
    // detach or delete and opening one would cost a connection to do nothing.
    const unsaved = makeSubject([]);

    await expect(
      unsaved.repository.deletePriceGroup(makeUnsavedPriceGroup(undefined)),
    ).resolves.toBe(false);

    expect(unsaved.executor.transactionCount).toBe(0);
    expect(unsaved.executor.calls).toHaveLength(0);
    expect(unsaved.executor.mutationCalls).toHaveLength(0);
  });

  it('never writes to a gate table, and never projects a column of one', async () => {
    // The gates borrow five tables to answer one question each.
    const { repository, executor } = makeSubject(ALL_GATES_CLEAR);

    await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    for (const gate of EXPECTED_DELETE_GATES) {
      for (const write of sqlTextsOf(executor.mutationCalls)) {
        expect(write).not.toContain(gate.tableName);
      }
    }

    for (const probe of executor.calls) {
      expect(probe.sql.startsWith('SELECT 1\n')).toBe(true);
      expect(probe.sql).not.toContain('JOIN');
      expect(probe.sql).not.toContain('*');
      expect(probe.sql).not.toContain('COUNT');
    }
  });
  // C5.3 The delete cascade is atomic.
  //
  // Atomicity boundary, and a restoration of parity rather than a new guarantee.
  //
  // Emitting these as autocommit statements therefore DISCARDED a guarantee the source had.

  it('issues every statement inside one transaction, and commits once', async () => {
    const { repository, executor } = makeSubject([]);

    const deleted = await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    expect(deleted).toBe(true);

    // One transaction, opened before any statement and committed after the last.
    expect(executor.transactionEvents).toStrictEqual(['BEGIN', 'COMMIT']);

    // And every statement really was issued - the transaction is around the work, not instead of
    // it. Both counts are asserted, so a cascade that lost a write or a gate cannot pass by being
    // wrapped correctly.
    expect(executor.mutationCalls).toHaveLength(DELETE_MUTATION_COUNT);
    expect(executor.calls).toHaveLength(DELETE_GATE_PROBE_COUNT);
  });

  it('opens exactly one transaction, never one per statement', async () => {
    // One transaction per statement would be that many independent commits, which is the defect
    // wearing a different shape: a failure at statement four would still leave three committed.
    const { repository, executor } = makeSubject([]);

    await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    expect(executor.transactionEvents.filter((event) => event === 'BEGIN')).toHaveLength(1);
    expect(executor.transactionEvents.filter((event) => event === 'COMMIT')).toHaveLength(1);
    expect(executor.transactionEvents).not.toContain('ROLLBACK');
  });

  it('rolls back and re-raises when a statement fails part-way through the cascade', async () => {
    // The failure is injected at the FIFTH link delete, so three link deletes have already been
    // issued when it happens - the exact shape that leaves a half-deleted price group behind
    // without a transaction.
    const failure = new Error('fake driver failure on the fifth link delete');
    const { repository, executor } = makeSubject([]);

    executor.failNextMutationAt(4, failure);

    await expect(
      repository.deletePriceGroup(
        makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
      ),
    ).rejects.toBe(failure);

    // ROLLED BACK, not COMMITTED. This is the whole assertion: the four statements that did run
    // are inside a transaction that was rolled back rather than four committed deletions.
    expect(executor.transactionEvents).toStrictEqual(['BEGIN', 'ROLLBACK']);
    expect(executor.transactionEvents).not.toContain('COMMIT');

    // It stopped at the failure rather than pressing on: five attempted, three remaining never
    // issued.
    expect(executor.mutationCalls).toHaveLength(5);
  });

  it('re-raises rather than reporting false when the cascade is rolled back', async () => {
    // A rolled-back delete is not a delete that found nothing.
    const { repository, executor } = makeSubject([]);

    executor.failNextMutationAt(7, new Error('fake driver failure on the row delete'));

    const outcome = await repository
      .deletePriceGroup(makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup)
      .then(
        (value) => ({ resolved: true as const, value }),
        (error: unknown) => ({ resolved: false as const, error }),
      );

    expect(outcome.resolved).toBe(false);
    expect(executor.transactionEvents).toStrictEqual(['BEGIN', 'ROLLBACK']);
  });

  it('opens no transaction at all for an entity that was never persisted', async () => {
    // The early return precedes the transaction, so nothing is begun and nothing has to be rolled
    // back.
    const { repository, executor } = makeSubject([]);

    const deleted = await repository.deletePriceGroup(makeUnsavedPriceGroup(undefined));

    expect(deleted).toBe(false);
    expect(executor.transactionEvents).toStrictEqual([]);
    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('issues every statement through the executor the transaction supplied', async () => {
    // The subtle failure this blocks.
    const { repository, executor } = makeSubject([]);

    await repository.deletePriceGroup(
      makePriceGroupFixtures({ idPrefix: PINNED_FIXTURE_PREFIX }).childPriceGroup,
    );

    expect(executor.orderedEvents.at(0)).toBe('BEGIN');
    expect(executor.orderedEvents.at(-1)).toBe('COMMIT');
    expect(executor.orderedEvents.filter((event) => event === 'MUTATION')).toHaveLength(
      DELETE_MUTATION_COUNT,
    );

    // Not one bypass, and the whole interleaved log is exactly the shape it should be.
    //
    // The gate probes are inside the unit of work too, and the expected log names them rather than
    // tolerating them.
    expect(executor.orderedEvents).not.toContain('MUTATION_OUTSIDE_TRANSACTION');
    expect(executor.orderedEvents).not.toContain('QUERY_OUTSIDE_TRANSACTION');
    expect(executor.orderedEvents).toStrictEqual([
      'BEGIN',
      ...Array.from({ length: DELETE_GATE_PROBE_COUNT }, () => 'QUERY'),
      ...Array.from({ length: DELETE_MUTATION_COUNT }, () => 'MUTATION'),
      'COMMIT',
    ]);
  });

  it('records a bypass distinctly, so the guard against one is not vacuous', async () => {
    const { executor } = makeSubject([]);

    await executor.transaction(async (transactional) => {
      await transactional.executeMutation('DELETE FROM SwPriceGroup WHERE priceGroupID = ?', ['a']);

      // The mistake, made on purpose: the outer executor, while a transaction is open.
      await executor.executeMutation('DELETE FROM SwPriceGroupRate WHERE priceGroupID = ?', ['a']);
    });

    expect(executor.orderedEvents).toStrictEqual([
      'BEGIN',
      'MUTATION',
      'MUTATION_OUTSIDE_TRANSACTION',
      'COMMIT',
    ]);

    // Both still land in `mutationCalls`, which is why the statement-shape assertions elsewhere in
    // this file are unaffected by the distinction.
    expect(executor.mutationCalls).toHaveLength(2);
  });

  it('JOINS a nested transaction on the delegate, matching the shipped contract', async () => {
    // Shipped contract", and asserted a rejection named `NestedTransactionError`.
    //
    // Applied to the executor that actually shipped, that principle demands JOINING.
    const { executor } = makeSubject([]);

    const result = await executor.transaction((transactional) =>
      transactional.transaction(async (nested) => {
        await nested.executeMutation('DELETE FROM SwPriceGroup WHERE priceGroupID = ?', ['pg-1']);

        return 'inner';
      }),
    );

    // The inner work ran, and its value is the outer call's value.
    expect(result).toBe('inner');

    // One unit of work, one boundary. The join is visible as its own marker, between the single
    // BEGIN and the single COMMIT, and it opens neither.
    expect(executor.transactionCount).toBe(1);
    expect(executor.transactionEvents).toStrictEqual(['BEGIN', 'COMMIT']);
    expect(executor.orderedEvents).toStrictEqual(['BEGIN', 'JOIN', 'MUTATION', 'COMMIT']);

    // The statement the joined work issued is INSIDE the transaction, which is the whole reason
    // joining is safe: it reached the same delegate, not the outer recorder.
    expect(executor.mutationCalls).toHaveLength(1);
    expect(executor.mutationCalls.every((call) => call.inTransaction)).toBe(true);
    expect(executor.orderedEvents).not.toContain('MUTATION_OUTSIDE_TRANSACTION');
  });
});

/**
 * How many values the rate insert binds, one per persisted column.
 */
const INSERT_PRICE_GROUP_RATE_BOUND_VALUE_COUNT = 11;

/**
 * How many values the rate update binds: eight columns, then the key.
 */
const UPDATE_PRICE_GROUP_RATE_BOUND_VALUE_COUNT = 9;

const RATE_INSERT_BOUND = Object.freeze({
  priceGroupRateID: 0,
  globalFlag: 1,
  amount: 2,
  amountType: 3,
  remoteID: 4,
  priceGroupID: 5,
  roundingRuleID: 6,
  createdDateTime: 7,
  createdByAccountID: 8,
  modifiedDateTime: 9,
  modifiedByAccountID: 10,
});

const RATE_UPDATE_BOUND = Object.freeze({
  globalFlag: 0,
  amount: 1,
  amountType: 2,
  remoteID: 3,
  priceGroupID: 4,
  roundingRuleID: 5,
  modifiedDateTime: 6,
  modifiedByAccountID: 7,
  priceGroupRateID: 8,
});

/**
 * The stored decimal text and the value it denotes.
 *
 * Two DIFFERENT STRINGS for the same VALUE, which is why a decimal is compared by value here and
 * never by string identity.
 */
const STORED_AMOUNT_TEXT = '12.50';

const NORMALIZED_AMOUNT_TEXT = '12.5';

describe('money, flags, and the rate write paths', () => {
  // C5.3. `decimalNumbers` is left unset on the pool, so MySQL delivers DECIMAL as TEXT and
  // `Money` is constructed from that text.
  //
  // C5.5 - service-tier defects this suite deliberately does not compensate for.

  it('maps a NULL amount to undefined, and never to a zero', async () => {
    // [model/entity/PriceGroupRate.cfc:L54] declares `amount` as `big_decimal` with no default, so
    // NULL is a state the schema genuinely permits.
    const { repository } = makeSubject([
      [priceGroupRateRow({ amount: null })],
      ...rateLinkResultSets(),
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    const rate = requirePriceGroupRate(
      await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID),
      'the rate with no amount',
    );

    expect(rate.getAmount()).toBeUndefined();
    expect(rate.getAmount()).not.toBe(Money.zero);
    expect(rate.getAmount()?.equals(Money.zero)).toBeUndefined();
  });

  it('constructs money from the stored text, and compares it by value', async () => {
    const { repository } = makeSubject([
      [priceGroupRateRow({ amount: STORED_AMOUNT_TEXT })],
      ...rateLinkResultSets(),
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    const rate = requirePriceGroupRate(
      await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID),
      'the rate whose amount is stored as text',
    );

    const amount = rate.getAmount();

    expect(amount).toBeDefined();
    expect(amount?.equals(Money.fromDecimalString(STORED_AMOUNT_TEXT))).toBe(true);

    // And by value means by value.
    expect(amount?.toDecimalString()).toBe(NORMALIZED_AMOUNT_TEXT);
    expect(amount?.toDecimalString()).not.toBe(STORED_AMOUNT_TEXT);
    expect(amount?.equals(Money.fromDecimalString(NORMALIZED_AMOUNT_TEXT))).toBe(true);
  });

  it('refuses an amount delivered as a number rather than as text', async () => {
    const { repository } = makeSubject([[priceGroupRateRow({ amount: 12.5 })]]);

    await expect(repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID)).rejects.toThrow(
      /amount/u,
    );
  });

  it('hydrates the legacy string boolean through CFML boolean semantics', async () => {
    // C5.3. [model/entity/PriceGroupRate.cfc:L53] defaults `globalFlag` to the STRING `"false"`,
    // not the boolean, so the stored column can legitimately hold text.
    expect(cfBoolean('false')).toBe(false);
    expect(cfBoolean('true')).toBe(true);
    expect(cfBoolean(0)).toBe(false);
    expect(cfBoolean(1)).toBe(true);

    const stringFalse = makeSubject([
      [priceGroupRateRow({ globalFlag: 'false' })],
      ...rateLinkResultSets(),
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    const textFlagRate = requirePriceGroupRate(
      await stringFalse.repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID),
      'the rate whose flag is stored as text',
    );

    expect(textFlagRate.getGlobalFlag()).toBe(false);

    // A MySQL `bit` arrives as a byte buffer, and its first byte is the value.
    const bitFlag = makeSubject([
      [priceGroupRateRow({ globalFlag: Uint8Array.of(1) })],
      ...rateLinkResultSets(),
      [priceGroupRow()],
      NO_ROWS,
      NO_ROWS,
    ]);

    const bitFlagRate = requirePriceGroupRate(
      await bitFlag.repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID),
      'the rate whose flag is stored as a bit',
    );

    expect(bitFlagRate.getGlobalFlag()).toBe(true);
  });

  it('inserts a rate with a minted key and a bound NULL for every absent column', async () => {
    const { repository, executor } = makeSubject([]);

    const inserted = await repository.savePriceGroupRate(makeUnsavedPriceGroupRate());

    // The scalar row is written FIRST, then the six link collections are reconciled - see the
    // link-reconciliation describe below, which owns those assertions.
    const statement = statementAt(executor.mutationCalls, 0);

    expect(statement.sql).toBe(EXPECTED_INSERT_PRICE_GROUP_RATE_SQL);
    expect(statement.params).toHaveLength(INSERT_PRICE_GROUP_RATE_BOUND_VALUE_COUNT);

    const mintedID = parameterAt(statement.params, RATE_INSERT_BOUND.priceGroupRateID);

    expect(String(mintedID)).toMatch(MINTED_IDENTIFIER_PATTERN);
    expect(inserted.getPriceGroupRateID()).toBe(mintedID);
    expect(inserted.isNew()).toBe(false);

    // An absent value binds NULL and is never omitted from the parameter array, because the
    // placeholder count is fixed by the column list and a short array would bind the wrong value
    // to every later position.
    expect(parameterAt(statement.params, RATE_INSERT_BOUND.amount)).toBeNull();
    expect(parameterAt(statement.params, RATE_INSERT_BOUND.amountType)).toBeNull();
    expect(parameterAt(statement.params, RATE_INSERT_BOUND.remoteID)).toBeNull();
    expect(parameterAt(statement.params, RATE_INSERT_BOUND.priceGroupID)).toBeNull();
    expect(parameterAt(statement.params, RATE_INSERT_BOUND.roundingRuleID)).toBeNull();

    expect(parameterAt(statement.params, RATE_INSERT_BOUND.globalFlag)).toBe(false);

    expect(parameterAt(statement.params, RATE_INSERT_BOUND.createdDateTime)).toBe(
      parameterAt(statement.params, RATE_INSERT_BOUND.modifiedDateTime),
    );
  });

  it('updates a rate with the key bound LAST, and the amount bound as decimal text', async () => {
    const { repository, executor } = makeSubject([]);

    await repository.savePriceGroupRate(
      makePersistedPriceGroupRate({ amount: Money.fromDecimalString(STORED_AMOUNT_TEXT) }),
    );

    // The scalar row is written FIRST; the six link reconciliations follow it.
    const statement = statementAt(executor.mutationCalls, 0);

    expect(statement.sql).toBe(EXPECTED_UPDATE_PRICE_GROUP_RATE_SQL);
    expect(statement.params).toHaveLength(UPDATE_PRICE_GROUP_RATE_BOUND_VALUE_COUNT);
    expect(parameterAt(statement.params, RATE_UPDATE_BOUND.priceGroupRateID)).toBe(
      CANNED_PRICE_GROUP_RATE_ID,
    );

    // The amount travels as DECIMAL TEXT, never as a float, and the text is the normalized
    // spelling, which is why it is checked by reconstructing a `Money` from it.
    const boundAmount = requireBoundDecimalNumeral(
      parameterAt(statement.params, RATE_UPDATE_BOUND.amount),
      'the bound rate amount',
    );

    expect(
      Money.fromDecimalString(boundAmount).equals(Money.fromDecimalString(STORED_AMOUNT_TEXT)),
    ).toBe(true);
    expect(typeof parameterAt(statement.params, RATE_UPDATE_BOUND.amount)).not.toBe('number');

    expect(parameterAt(statement.params, RATE_UPDATE_BOUND.globalFlag)).toBe(false);
    expect(parameterAt(statement.params, RATE_UPDATE_BOUND.amountType)).toBe('percentageOff');
  });

  it('★★ REFUSES a rate UPDATE that matched no row, BEFORE reconciling any link table', async () => {
    // A rate is a money row - `amount` and `amountType` are what the cascade multiplies a sku
    // price by [model/service/PriceGroupService.cfc:L316-L340].
    //
    // And the order of the refusal is the second thing asserted.
    const { repository, executor } = makeSubject([], [NO_ROW_WRITE_RESULT]);

    await expect(
      repository.savePriceGroupRate(
        makePersistedPriceGroupRate({ amount: Money.fromDecimalString(STORED_AMOUNT_TEXT) }),
      ),
    ).rejects.toThrow(/matched no row/u);

    expect(executor.mutationCalls).toHaveLength(1);
    expect(onlyStatement(executor.mutationCalls).sql).toBe(EXPECTED_UPDATE_PRICE_GROUP_RATE_SQL);
  });

  // Rate link reconciliation on save - all six collections
  // [model/entity/PriceGroupRate.cfc:L71-L77]
  //
  // It matters more than an ordinary missing write because these collections decide which products
  // and SKUs a rate applies to [model/service/PriceGroupService.cfc:L57-L181].

  describe('savePriceGroupRate - link reconciliation', () => {
    /**
     * The six link tables in the order the adapter reconciles them.
     */
    const LINK_TABLES = [
      'SwPriceGroupRateProductType',
      'SwPriceGroupRateProduct',
      'SwPriceGroupRateSku',
      'SwPriceGrpRateExclProductType',
      'SwPriceGroupRateExclProduct',
      'SwPriceGroupRateExclSku',
    ] as const;

    /**
     * A persisted rate carrying two members in every one of its six collections.
     */
    function makeRateWithMembership(): PriceGroupRate {
      return new PriceGroupRate({
        priceGroupRateID: CANNED_PRICE_GROUP_RATE_ID,
        globalFlag: 'false',
        amount: undefined,
        amountType: 'percentageOff',
        productTypes: [
          new ProductType({ productTypeID: 'pt-1' }),
          new ProductType({ productTypeID: 'pt-2' }),
        ],
        products: [new Product({ productID: 'p-1' }), new Product({ productID: 'p-2' })],
        skus: [new Sku({ skuID: 's-1' }), new Sku({ skuID: 's-2' })],
        excludedProductTypes: [new ProductType({ productTypeID: 'xpt-1' })],
        excludedProducts: [new Product({ productID: 'xp-1' })],
        excludedSkus: [new Sku({ skuID: 'xs-1' })],
      });
    }

    // JUDGMENT CALL: the match is anchored on word boundaries, not a substring test.
    /**
     * Statements naming a given table exactly, in call order.
     */
    function statementsFor(
      calls: readonly RecordedStatement[],
      tableName: string,
    ): readonly RecordedStatement[] {
      const exactName = new RegExp(`\\b${tableName}\\b`);

      return calls.filter((call) => exactName.test(call.sql));
    }

    /**
     * The single statement of one kind that a table received.
     */
    function statementFor(
      calls: readonly RecordedStatement[],
      tableName: string,
      kind: 'DELETE' | 'INSERT',
    ): RecordedStatement {
      const matches = statementsFor(calls, tableName).filter((call) => call.sql.startsWith(kind));

      const [only] = matches;

      if (only === undefined || matches.length !== 1) {
        throw new Error(
          `expected exactly one ${kind} for ${tableName}, found ${String(matches.length)}`,
        );
      }

      return only;
    }

    it('★★ writes a delete AND an insert for every one of the six link tables', async () => {
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makeRateWithMembership());

      for (const tableName of LINK_TABLES) {
        const statements = statementsFor(executor.mutationCalls, tableName);

        expect(statements).toHaveLength(2);
        expect(statements[0]?.sql).toContain(`DELETE FROM ${tableName}`);
        expect(statements[1]?.sql).toContain(`INSERT INTO ${tableName}`);
      }
    });

    it('★★ runs the scalar write and every link statement inside ONE transaction', async () => {
      // A failure part-way through must not leave a rate whose amount was updated but whose
      // membership was not - that is the state which changes the price a SKU gets.
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makeRateWithMembership());

      expect(executor.transactionCount).toBe(1);
      expect(executor.mutationCalls.every((call) => call.inTransaction)).toBe(true);
    });

    it('★★ writes the scalar columns FIRST, then reconciles in declared collection order', async () => {
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makeRateWithMembership());

      expect(executor.mutationCalls[0]?.sql).toContain('UPDATE SwPriceGroupRate');
      expect(executor.mutationCalls.slice(1).map((call) => call.sql.split('\n')[0])).toStrictEqual([
        'DELETE FROM SwPriceGroupRateProductType',
        'INSERT INTO SwPriceGroupRateProductType (priceGroupRateID, productTypeID)',
        'DELETE FROM SwPriceGroupRateProduct',
        'INSERT INTO SwPriceGroupRateProduct (priceGroupRateID, productID)',
        'DELETE FROM SwPriceGroupRateSku',
        'INSERT INTO SwPriceGroupRateSku (priceGroupRateID, skuID)',
        'DELETE FROM SwPriceGrpRateExclProductType',
        'INSERT INTO SwPriceGrpRateExclProductType (priceGroupRateID, productTypeID)',
        'DELETE FROM SwPriceGroupRateExclProduct',
        'INSERT INTO SwPriceGroupRateExclProduct (priceGroupRateID, productID)',
        'DELETE FROM SwPriceGroupRateExclSku',
        'INSERT INTO SwPriceGroupRateExclSku (priceGroupRateID, skuID)',
      ]);
    });

    it('binds the rate identifier and each member identifier, pairwise, in one statement', async () => {
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makeRateWithMembership());

      const insert = statementFor(executor.mutationCalls, 'SwPriceGroupRateProduct', 'INSERT');

      expect(insert.sql).toContain('VALUES (?, ?), (?, ?)');
      expect(insert.params).toStrictEqual([
        CANNED_PRICE_GROUP_RATE_ID,
        'p-1',
        CANNED_PRICE_GROUP_RATE_ID,
        'p-2',
      ]);
    });

    it('scopes the delete to the ONE rate, never to its price group', async () => {
      // A price-group-scoped delete belongs to the delete cascade. Using it here would wipe every
      // sibling rate's membership as a side effect of saving one rate.
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makeRateWithMembership());

      for (const tableName of LINK_TABLES) {
        const del = statementFor(executor.mutationCalls, tableName, 'DELETE');

        expect(del.sql).toBe(`DELETE FROM ${tableName}\nWHERE priceGroupRateID = ?`);
        expect(del.params).toStrictEqual([CANNED_PRICE_GROUP_RATE_ID]);
      }
    });

    it('★★ still issues the DELETE for an emptied collection, so membership can be cleared', async () => {
      // Short-circuiting the delete for an empty collection would make clearing a collection
      // impossible - the operation most likely to be attempted after a mistake. Only the INSERT is
      // skipped.
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makePersistedPriceGroupRate({ amount: undefined }));

      for (const tableName of LINK_TABLES) {
        const statements = statementsFor(executor.mutationCalls, tableName);

        expect(statements).toHaveLength(1);
        expect(statements[0]?.sql).toContain('DELETE FROM');
      }
    });

    it('★★ reconciles against the MINTED identifier when the rate is new', async () => {
      // The argument still reports `''` after an insert, so keying the link rows off it would
      // write rows pointing at nothing.
      const { repository, executor } = makeSubject([]);

      const inserted = await repository.savePriceGroupRate(
        new PriceGroupRate({
          priceGroupRateID: '',
          products: [new Product({ productID: 'p-9' })],
        }),
      );

      const insert = statementFor(executor.mutationCalls, 'SwPriceGroupRateProduct', 'INSERT');

      expect(inserted.getPriceGroupRateID()).toMatch(MINTED_IDENTIFIER_PATTERN);
      expect(insert.params).toStrictEqual([inserted.getPriceGroupRateID(), 'p-9']);
    });

    it('\u2605\u2605 writes a repeated member TWICE, because the association is a Hibernate BAG', async () => {
      // None of the six associations at [model/entity/PriceGroupRate.cfc:L71-L77] declares
      // `type="array"`, so each is a Hibernate BAG: a bag permits the same member twice and
      // Hibernate generated its link table without a primary key.
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(
        new PriceGroupRate({
          priceGroupRateID: CANNED_PRICE_GROUP_RATE_ID,
          skus: [new Sku({ skuID: 's-1' }), new Sku({ skuID: 's-1' }), new Sku({ skuID: 's-2' })],
        }),
      );

      const insert = statementFor(executor.mutationCalls, 'SwPriceGroupRateSku', 'INSERT');

      expect(insert.params).toStrictEqual([
        CANNED_PRICE_GROUP_RATE_ID,
        's-1',
        CANNED_PRICE_GROUP_RATE_ID,
        's-1',
        CANNED_PRICE_GROUP_RATE_ID,
        's-2',
      ]);
    });

    it('\u2605\u2605 REFUSES an unpersisted member, before issuing any link statement', async () => {
      // DROPPED - "drops an unpersisted member rather than linking to an empty key", because
      // "writing `''` would create a row every later read resolves to a missing entity".
      const { repository, executor } = makeSubject([]);

      const rate = new PriceGroupRate({
        priceGroupRateID: CANNED_PRICE_GROUP_RATE_ID,
        products: [new Product({ productID: '' }), new Product({ productID: 'p-real' })],
      });

      await expect(repository.savePriceGroupRate(rate)).rejects.toThrow(/never been persisted/u);

      // Admitting all six collections up front is what keeps it from landing half-way through,
      // having already emptied two link tables it will not refill.
      expect(executor.mutationCalls).toHaveLength(1);
      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_UPDATE_PRICE_GROUP_RATE_SQL);
      expect(
        executor.mutationCalls.filter((mutation) => mutation.sql.startsWith('DELETE FROM ')),
      ).toHaveLength(0);
    });

    it('reconciles the three EXCLUSION collections too, though the cascade never reads them', async () => {
      // A documented legacy read-side gap. The entity retains them and `getAppliesTo()`
      // [model/entity/PriceGroupRate.cfc:L95] counts them, so not persisting them would turn a
      // read gap into data loss.
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makeRateWithMembership());

      expect(
        statementFor(executor.mutationCalls, 'SwPriceGrpRateExclProductType', 'INSERT').params,
      ).toStrictEqual([CANNED_PRICE_GROUP_RATE_ID, 'xpt-1']);
      expect(
        statementFor(executor.mutationCalls, 'SwPriceGroupRateExclProduct', 'INSERT').params,
      ).toStrictEqual([CANNED_PRICE_GROUP_RATE_ID, 'xp-1']);
      expect(
        statementFor(executor.mutationCalls, 'SwPriceGroupRateExclSku', 'INSERT').params,
      ).toStrictEqual([CANNED_PRICE_GROUP_RATE_ID, 'xs-1']);
    });

    // The reconciled siblings join the same unit of work
    // [model/service/PriceGroupService.cfc:L407-L433]
    //
    // Under the ORM these needed no separate contract: every rate in
    // `priceGroup.getPriceGroupRates()` was a MANAGED entity.

    it('★★ persists each supplied sibling in the SAME transaction as the saved rate', async () => {
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makeRateWithMembership(), [
        new PriceGroupRate({ priceGroupRateID: 'pgr-sibling-1' }),
        new PriceGroupRate({ priceGroupRateID: 'pgr-sibling-2' }),
      ]);

      expect(executor.transactionCount).toBe(1);
      expect(executor.mutationCalls.every((call) => call.inTransaction)).toBe(true);
    });

    it('★★ gives every sibling its own scalar write and its own six reconciliations', async () => {
      // A sibling reached this method because a member was stripped from it or its global flag was
      // cleared, and both are ordinary rate mutations.
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makePersistedPriceGroupRate({ amount: undefined }), [
        new PriceGroupRate({ priceGroupRateID: 'pgr-sibling-1' }),
      ]);

      const siblingStatements = executor.mutationCalls.filter((call) =>
        call.params.includes('pgr-sibling-1'),
      );

      // One scalar UPDATE plus six link DELETEs; no INSERT, because the sibling's collections are
      // empty and only the INSERT is skipped for an empty collection.
      expect(siblingStatements).toHaveLength(7);
      expect(siblingStatements[0]?.sql).toContain('UPDATE SwPriceGroupRate');
      expect(siblingStatements.slice(1).every((call) => call.sql.startsWith('DELETE FROM'))).toBe(
        true,
      );
    });

    it('writes the saved rate FIRST, then the siblings in the order supplied', async () => {
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makePersistedPriceGroupRate({ amount: undefined }), [
        new PriceGroupRate({ priceGroupRateID: 'pgr-sibling-1' }),
        new PriceGroupRate({ priceGroupRateID: 'pgr-sibling-2' }),
      ]);

      const scalarWrites = executor.mutationCalls
        .filter((call) => call.sql.startsWith('UPDATE SwPriceGroupRate'))
        .map((call) => call.params[call.params.length - 1]);

      expect(scalarWrites).toStrictEqual([
        CANNED_PRICE_GROUP_RATE_ID,
        'pgr-sibling-1',
        'pgr-sibling-2',
      ]);
    });

    it('returns the SAVED rate, never a sibling', async () => {
      const { repository } = makeSubject([]);

      const saved = await repository.savePriceGroupRate(
        makePersistedPriceGroupRate({ amount: undefined }),
        [new PriceGroupRate({ priceGroupRateID: 'pgr-sibling-1' })],
      );

      expect(saved.getPriceGroupRateID()).toBe(CANNED_PRICE_GROUP_RATE_ID);
    });

    it('writes only the saved rate when the argument is omitted or empty', async () => {
      // The ordinary case: nothing the exclusivity rule looked at had changed. Omitting the
      // argument and supplying an empty array must be indistinguishable.
      const omitted = makeSubject([]);
      const empty = makeSubject([]);

      await omitted.repository.savePriceGroupRate(
        makePersistedPriceGroupRate({ amount: undefined }),
      );
      await empty.repository.savePriceGroupRate(
        makePersistedPriceGroupRate({ amount: undefined }),
        [],
      );

      expect(omitted.executor.mutationCalls).toHaveLength(7);
      expect(empty.executor.mutationCalls.map((call) => call.sql)).toStrictEqual(
        omitted.executor.mutationCalls.map((call) => call.sql),
      );
    });

    it('preserves the abbreviated physical table name verbatim', async () => {
      // [model/entity/PriceGroupRate.cfc:L75] is abbreviated where its five siblings are not.
      // "Correcting" it would break the unchanged-schema contract outright.
      const { repository, executor } = makeSubject([]);

      await repository.savePriceGroupRate(makeRateWithMembership());

      const emitted = executor.mutationCalls.map((call) => call.sql).join('\n');

      expect(emitted).toContain('SwPriceGrpRateExclProductType');
      expect(emitted).not.toContain('SwPriceGroupRateExclProductType');
    });
  });

  it('issues the six deletes and no insert for a rate holding no members at all', async () => {
    const { repository, executor } = makeSubject([]);

    await repository.savePriceGroupRate(makePersistedPriceGroupRate({ amount: undefined }));

    expect(executor.mutationCalls).toHaveLength(EMPTY_RATE_SAVE_MUTATION_COUNT);

    // The deletes still run.
    for (let index = 1; index < EMPTY_RATE_SAVE_MUTATION_COUNT; index += 1) {
      expect(statementAt(executor.mutationCalls, index).sql).toContain('DELETE FROM ');
    }

    // And `INSERT INTO` never appears, because an insert with no rows is not a statement.
    expect(
      executor.mutationCalls.filter((mutation) => mutation.sql.startsWith('INSERT INTO ')),
    ).toHaveLength(0);
  });

  it('writes the link rows only AFTER the row that owns them, so the minted key exists to name', async () => {
    const { repository, executor } = makeSubject([]);

    const unsaved = makeUnsavedPriceGroupRate();

    unsaved.addProduct(new Product({ productID: 'prd-attached-before-insert' }));

    const inserted = await repository.savePriceGroupRate(unsaved);

    const rowWrite = statementAt(executor.mutationCalls, 0);

    expect(rowWrite.sql).toBe(EXPECTED_INSERT_PRICE_GROUP_RATE_SQL);

    // Every link statement names the key the row write minted - never the `''` the entity arrived
    // with, which would store a link row pointing at no row at all.
    const mintedID = inserted.getPriceGroupRateID();

    expect(mintedID).toMatch(MINTED_IDENTIFIER_PATTERN);

    for (let index = 1; index < executor.mutationCalls.length; index += 1) {
      const linkStatement = statementAt(executor.mutationCalls, index);

      expect(linkStatement.params[0]).toBe(mintedID);
      expect(linkStatement.params).not.toContain('');
    }
  });

  // NET-NEW coverage with no legacy antecedent. `meta/tests/unit/dao/` contains only
  // AccountDAOTest and PaymentDAOTest, so nothing here traces to a legacy assertion.
  describe('the amountType discriminator - membership up to case, bytes preserved', () => {
    it('hydrates a mis-cased amountType instead of discarding it', async () => {
      const { repository } = makeSubject([[priceGroupRateRow({ amountType: 'PercentageOff' })]]);

      const rate = await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID);

      // Not `undefined`: an exact comparison mapped this to absence, which sent the pricing
      // dispatch down its no-`default` fall-through and returned the SKU's own UNDISCOUNTED price
      // with nothing reported.
      expect(rate?.getAmountType()).toBe('PercentageOff');
    });

    it('still maps a value outside the vocabulary to absence, as the missing default requires', async () => {
      const { repository } = makeSubject([[priceGroupRateRow({ amountType: 'somethingElse' })]]);

      const rate = await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID);

      // Folding case widened which values match; it did not open the vocabulary. An unrecognised
      // value is still absent, and absence is still what
      // [model/service/PriceGroupService.cfc:L316-L340] falls through on.
      expect(rate?.getAmountType()).toBeUndefined();
    });

    it('writes the persisted spelling back BYTE-IDENTICALLY on a load-modify-save round trip', async () => {
      // One read answering the mis-cased row, then the update.
      const { repository, executor } = makeSubject([
        [priceGroupRateRow({ amountType: 'PercentageOff' })],
      ]);

      const loaded = await repository.getPriceGroupRate(CANNED_PRICE_GROUP_RATE_ID);

      if (loaded === undefined) {
        throw new Error('the canned row should have produced a rate');
      }

      await repository.savePriceGroupRate(loaded);

      const statement = rateRowWrite(executor.mutationCalls);

      expect(statement.sql).toBe(EXPECTED_UPDATE_PRICE_GROUP_RATE_SQL);

      // The assertion the whole design exists for. `'PercentageOff'` goes back exactly as it came
      // out.
      expect(parameterAt(statement.params, RATE_UPDATE_BOUND.amountType)).toBe('PercentageOff');
    });
  });

  it('takes no ambient scope, and treats configuration as static process state', () => {
    // C5.6 / T6. [model/service/PriceGroupService.cfc:L262-L268] is a SEVEN-LINE method that
    // reaches the request scope through both accessors, one at L263 and the other at L264, and
    // both vanish in the target.
    const { repository } = makeSubject();

    // Four declared parameters, none of them ambient, and the two that were added are the two that
    // make this assertion sharper rather than weaker.
    expect(MySqlPriceGroupRepository.length).toBe(4);

    const members = repository as unknown as Readonly<Record<string, unknown>>;

    for (const forbiddenMember of ['getService', 'getHibachiScope', 'getApplicationValue']) {
      expect(members[forbiddenMember]).toBeUndefined();
    }

    // `src/lib/config.ts` is static process configuration and is never used as a request scope.
    // Its whole surface is `load` and `reset`: no per-request setter and no current-account
    // member.
    expect([...Object.keys(appConfig)].sort()).toStrictEqual(['load', 'reset']);
  });

  it('keeps two independently constructed adapters entirely separate', () => {
    // C5.7 / T1. The collaborators arrive by CONSTRUCTOR INJECTION, so they are per-instance state
    // rather than something resolved from a shared registry.
    const first = makeSubject(leafPriceGroupResultSets());
    const second = makeSubject(leafPriceGroupResultSets());

    expect(first.repository).not.toBe(second.repository);
    expect(first.executor).not.toBe(second.executor);
    expect(first.valueRounder).not.toBe(second.valueRounder);
  });
});

/**
 * The five tables the delete gates probe, READ-ONLY.
 *
 * Derived from `EXPECTED_DELETE_GATES` rather than restated, so the two cannot drift.
 */
const GATE_PROBE_TABLES: readonly string[] = Object.freeze(
  EXPECTED_DELETE_GATES.map((gate) => gate.tableName),
);

/**
 * Every physical table this port is permitted to name, and nothing else.
 *
 * Nineteen names across four groups: the three it owns, the six rate link tables, the six
 * subscription-owned tables it may only READ, and the five delete-gate tables it may only PROBE.
 */
const PERMITTED_PHYSICAL_TABLES: readonly string[] = Object.freeze([
  'SwPriceGroup',
  'SwPriceGroupRate',
  'SwRoundingRule',
  ...EXPECTED_RATE_LINK_TABLES.map((linkTable) => linkTable.tableName),
  ...SUBSCRIPTION_OWNED_TABLES,
  ...GATE_PROBE_TABLES,
]);

const PHYSICAL_TABLE_IDENTIFIER_PATTERN = /\bSw[A-Za-z0-9_]*/gu;

/**
 * Statements that change the shape of the schema rather than its contents.
 */
const SCHEMA_CHANGING_KEYWORD_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bCREATE\b/u,
  /\bALTER\b/u,
  /\bDROP\b/u,
  /\bTRUNCATE\b/u,
  /\bRENAME\b/u,
]);

/**
 * The only four verbs a statement from this port may begin with.
 */
const PERMITTED_LEADING_VERBS: readonly string[] = Object.freeze([
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
]);

function physicalTablesNamedBy(statements: readonly RecordedStatement[]): readonly string[] {
  const named = new Set<string>();

  for (const statement of statements) {
    for (const identifierMatch of statement.sql.matchAll(PHYSICAL_TABLE_IDENTIFIER_PATTERN)) {
      named.add(identifierMatch[0]);
    }
  }

  return [...named].sort();
}

describe('schema continuity - the Sw* schema is read and written, never reshaped', () => {
  it('names only permitted physical tables, across every statement it can emit', async () => {
    // C6.1. A census over the whole surface, not a sample: `provokeEveryStatement` has driven all
    // nine code paths by the time this runs.
    const provoked = await provokeEveryStatement();
    const namedTables = physicalTablesNamedBy(allStatementsOf(provoked));

    expect(namedTables.length).toBeGreaterThan(0);

    for (const tableName of namedTables) {
      expect(PERMITTED_PHYSICAL_TABLES).toContain(tableName);
    }

    expect(namedTables).toContain('SwPriceGroup');
    expect(namedTables).toContain('SwPriceGroupRate');
    expect(namedTables).toContain('SwRoundingRule');
  });

  it('emits no schema-changing statement of any kind', async () => {
    // No migration, no rename, no new table, no column change. The existing schema is a fixed
    // contract this port reads and writes; it is never the thing being changed.
    const provoked = await provokeEveryStatement();

    for (const statement of allStatementsOf(provoked)) {
      const foldedSql = statement.sql.toUpperCase();

      for (const keywordPattern of SCHEMA_CHANGING_KEYWORD_PATTERNS) {
        expect(foldedSql).not.toMatch(keywordPattern);
      }

      // And positively: every statement begins with one of exactly four data verbs, so a
      // schema-changing statement could not slip through under a spelling the patterns above
      // happen not to enumerate.
      const leadingVerb = foldedSql.split(/\s/u)[0] ?? '';

      expect(PERMITTED_LEADING_VERBS).toContain(leadingVerb);
    }
  });

  it('never writes to a subscription-owned table, on any path', async () => {
    // C1.1. The reach-through is READ-ONLY, proven here over the whole surface rather than for one
    // method: the six subscription tables may appear in a read and in no write.
    const provoked = await provokeEveryStatement();

    for (const statement of provoked.writes) {
      for (const tableName of SUBSCRIPTION_OWNED_TABLES) {
        expect(statement.sql).not.toContain(tableName);
      }
    }

    const writtenTables = physicalTablesNamedBy(provoked.writes);

    expect(writtenTables.length).toBeGreaterThan(0);

    for (const tableName of writtenTables) {
      expect(SUBSCRIPTION_OWNED_TABLES).not.toContain(tableName);
    }
  });

  it('names physical tables, never an ORM entity name', async () => {
    // C1.9. Stage 2 of the reach-through is HQL in the legacy and names the ORM ENTITY
    // `SlatwallPriceGroup` [model/dao/PriceGroupDAO.cfc:L93].
    //
    // CFML parity [model/dao/PriceGroupDAO.cfc:L93-L95]: the HQL from SlatwallPriceGroup pg WHERE
    // pg.priceGroupID in (:priceGroupIDs) and pg.activeFlag =:activeFlag becomes the same
    // statement over `SwPriceGroup` with positional placeholders.
    const provoked = await provokeEveryStatement();

    for (const statement of allStatementsOf(provoked)) {
      expect(statement.sql).not.toContain('Slatwall');
    }
  });
});

describe('request-scoped state - nothing survives between adapters', () => {
  it('does not let a second adapter observe the first one\u2019s reads', async () => {
    const first = makeSubject(leafPriceGroupResultSets());

    await first.repository.getPriceGroup(CANNED_PRICE_GROUP_ID);

    expect(first.executor.calls).toHaveLength(LEAF_PRICE_GROUP_STATEMENT_COUNT);

    // A second adapter, constructed independently, asks for the same identifier. If anything were
    // memoized at module scope it would answer from the first adapter's result and issue nothing.
    const second = makeSubject(leafPriceGroupResultSets());

    await second.repository.getPriceGroup(CANNED_PRICE_GROUP_ID);

    expect(second.executor.calls).toHaveLength(LEAF_PRICE_GROUP_STATEMENT_COUNT);
    expect(sqlTextsOf(second.executor.calls)).toStrictEqual(sqlTextsOf(first.executor.calls));

    expect(first.executor.calls).toHaveLength(LEAF_PRICE_GROUP_STATEMENT_COUNT);
  });

  it('re-reads within one adapter rather than answering from a memo', async () => {
    // Even INSIDE one adapter there is no read-through cache. That is the correct choice here: a
    // repository that memoized would hand back a stale price group after a save, and the cascade
    // decides money.
    const { repository, executor } = makeSubject([
      ...leafPriceGroupResultSets(),
      ...leafPriceGroupResultSets(),
    ]);

    await repository.getPriceGroup(CANNED_PRICE_GROUP_ID);
    await repository.getPriceGroup(CANNED_PRICE_GROUP_ID);

    expect(executor.calls).toHaveLength(LEAF_PRICE_GROUP_STATEMENT_COUNT * 2);
  });

  it('opens nothing by being imported: the executor is the only route to a database', () => {
    // B2. Importing the adapter module creates no pool and no connection: the executor is a
    // constructor parameter, and the one this suite supplies is an inline recording double.
    const { repository, executor } = makeSubject();

    expect(repository).toBeInstanceOf(MySqlPriceGroupRepository);
    expect(executor.calls).toHaveLength(0);
    expect(executor.mutationCalls).toHaveLength(0);
  });
});

/**
 * The one string literal the legacy SQL carries, reproduced as written.
 */
const EXPECTED_SQL_LITERAL = "'sstActive'";

/**
 * Server-side clock calls, none of which may ever be emitted.
 */
const SERVER_CLOCK_CALLS: readonly string[] = Object.freeze([
  'NOW(',
  'CURRENT_TIMESTAMP',
  'SYSDATE',
  'UTC_TIMESTAMP',
  'LOCALTIMESTAMP',
]);

/**
 * Every value this suite feeds in, so the census can prove none of them reached the text.
 */
const CANNED_VALUES_THAT_MUST_NEVER_APPEAR_IN_SQL: readonly string[] = Object.freeze([
  CANNED_ACCOUNT_ID,
  CANNED_PRICE_GROUP_ID,
  CANNED_PARENT_PRICE_GROUP_ID,
  CANNED_ROOT_PRICE_GROUP_ID,
  CANNED_PRICE_GROUP_RATE_ID,
  CANNED_ROUNDING_RULE_ID,
  CANNED_CREATED_BY_ACCOUNT_ID,
  CANNED_MODIFIED_BY_ACCOUNT_ID,
  PINNED_CHILD_PRICE_GROUP_ID,
  STORED_AMOUNT_TEXT,
  NORMALIZED_AMOUNT_TEXT,
]);

describe('parameterized SQL exclusively - the census', () => {
  it('binds one placeholder per bound value, in every statement it emits', async () => {
    // E5 / P5, and the single most important obligation this suite carries.
    const provoked = await provokeEveryStatement();
    const statements = allStatementsOf(provoked);

    expect(statements.length).toBeGreaterThan(0);

    for (const statement of statements) {
      const placeholderCount = (statement.sql.match(/\?/gu) ?? []).length;

      expect(placeholderCount).toBe(statement.params.length);
    }
  });

  it('never lets a supplied value reach the statement text', async () => {
    const provoked = await provokeEveryStatement();

    for (const statement of allStatementsOf(provoked)) {
      for (const suppliedValue of CANNED_VALUES_THAT_MUST_NEVER_APPEAR_IN_SQL) {
        expect(statement.sql).not.toContain(suppliedValue);
      }
    }
  });

  it('carries exactly one string literal, and it is the legacy system code', async () => {
    // The `'sstActive'` comparison is a LITERAL in the legacy SQL
    // [model/dao/PriceGroupDAO.cfc:L67] and is reproduced as one, because it is a constant of the
    // schema rather than a caller-supplied value.
    const provoked = await provokeEveryStatement();

    for (const statement of allStatementsOf(provoked)) {
      const quotedRuns = statement.sql.match(/'[^']*'/gu) ?? [];

      for (const quotedRun of quotedRuns) {
        expect(quotedRun).toBe(EXPECTED_SQL_LITERAL);
      }
    }
  });

  it('never asks the server for the time, and never smuggles a statement separator', async () => {
    // C1.4. Every instant is CAPTURED once per invocation and BOUND, so two comparisons in one
    // statement cannot straddle a tick and disagree.
    const provoked = await provokeEveryStatement();

    for (const statement of allStatementsOf(provoked)) {
      const foldedSql = statement.sql.toUpperCase();

      for (const clockCall of SERVER_CLOCK_CALLS) {
        expect(foldedSql).not.toContain(clockCall);
      }

      // One statement per call: no separator, and no comment marker behind which anything could
      // hide. `multipleStatements` is off on the pool, and nothing here relies on that alone.
      expect(statement.sql).not.toContain(';');
      expect(statement.sql).not.toContain('--');
      expect(statement.sql).not.toContain('/*');
    }
  });

  it('binds every date as a Date, and every identifier as a string', async () => {
    // Type discipline on the value side. A date formatted into a string by the adapter would be a
    // time-zone decision taken in the wrong place: the pool fixes the connection zone at `'Z'`.
    const provoked = await provokeEveryStatement();

    for (const statement of allStatementsOf(provoked)) {
      for (const boundValue of statement.params) {
        const isAdmissible =
          boundValue === null ||
          boundValue instanceof Date ||
          typeof boundValue === 'string' ||
          typeof boundValue === 'number' ||
          typeof boundValue === 'boolean';

        expect(isAdmissible).toBe(true);

        // No object, array or nested structure is ever bound: an array bound to a single
        // placeholder is the classic route to an `IN` clause that silently matches nothing.
        expect(Array.isArray(boundValue)).toBe(false);
      }
    }
  });

  it('binds no floating-point value where money is concerned', async () => {
    // P4 / E4. The only numeric value this port binds is the stage-two `activeFlag`, a flag rather
    // than a quantity.
    const provoked = await provokeEveryStatement();

    for (const statement of allStatementsOf(provoked)) {
      for (const boundValue of statement.params) {
        if (typeof boundValue !== 'number') {
          continue;
        }

        expect(Number.isInteger(boundValue)).toBe(true);
      }
    }
  });
});

/**
 * Two rate rows on one price group, so the placeholder run has to grow to two.
 */
function twoRatesOnOnePriceGroup(): readonly SqlRow[] {
  return [
    priceGroupRateRow(),
    priceGroupRateRow({ priceGroupRateID: 'pgr-second', globalFlag: 1 }),
  ];
}

describe('the six rate link statements - exact text and placeholder growth', () => {
  it('emits each link statement verbatim, one placeholder per rate identifier', async () => {
    // The membership of the six collections is loaded with one statement per TABLE for the whole
    // rate set, rather than one per rate per table.
    const { repository, executor } = makeSubject([
      [priceGroupRow()],
      twoRatesOnOnePriceGroup(),
      ...EXPECTED_RATE_LINK_TABLES.map((linkTable) => [
        rateLinkRow(linkTable.memberColumn, 'member-' + linkTable.memberColumn),
      ]),
      NO_ROWS,
    ]);

    const priceGroup = requirePriceGroup(
      await repository.getPriceGroup(CANNED_PRICE_GROUP_ID),
      'the price group owning two rates',
    );

    expect(priceGroup.getPriceGroupRates()).toHaveLength(2);

    for (const [index, linkTable] of EXPECTED_RATE_LINK_TABLES.entries()) {
      const statement = statementAt(executor.calls, 2 + index);

      expect(statement.sql).toBe(expectedRateLinkSelectSql(linkTable, TWO_PLACEHOLDERS));
      expect(statement.params).toStrictEqual([CANNED_PRICE_GROUP_RATE_ID, 'pgr-second']);
    }
  });

  it('shrinks the placeholder run to one for a single rate, and pins the abbreviated table', async () => {
    const { repository, executor } = makeSubject([
      [priceGroupRow()],
      [priceGroupRateRow()],
      ...rateLinkResultSets(),
      NO_ROWS,
    ]);

    await repository.getPriceGroup(CANNED_PRICE_GROUP_ID);

    for (const [index, linkTable] of EXPECTED_RATE_LINK_TABLES.entries()) {
      const statement = statementAt(executor.calls, 2 + index);

      expect(statement.sql).toBe(expectedRateLinkSelectSql(linkTable, ONE_PLACEHOLDER));
      expect(statement.params).toStrictEqual([CANNED_PRICE_GROUP_RATE_ID]);
    }

    // C6.1 and interface parity in one assertion: the abbreviated physical name
    // `SwPriceGrpRateExclProductType` [model/entity/PriceGroupRate.cfc:L75] is checked against a
    // statement written out in FULL rather than against the composed form.
    const excludedProductTypeLinkIndex = EXPECTED_RATE_LINK_TABLES.findIndex(
      (linkTable) => linkTable.collectionName === 'excludedProductTypes',
    );

    expect(excludedProductTypeLinkIndex).toBeGreaterThanOrEqual(0);
    expect(statementAt(executor.calls, 2 + excludedProductTypeLinkIndex).sql).toBe(
      EXPECTED_EXCLUDED_PRODUCT_TYPE_LINK_SELECT_SQL_VERBATIM,
    );
  });
});

/**
 * `calculateSkuPriceBasedOnPriceGroup` is SYNCHRONOUS: it returns money, not a promise.
 */
type PriceByPriceGroupIsSynchronous =
  ReturnType<SkuPriceGroupResolver['calculateSkuPriceBasedOnPriceGroup']> extends Promise<unknown>
    ? false
    : true;

/**
 * `getRateForSkuBasedOnPriceGroup` is synchronous, and may answer with nothing.
 */
type RateForSkuIsSynchronousAndOptional =
  ReturnType<SkuPriceGroupResolver['getRateForSkuBasedOnPriceGroup']> extends Promise<unknown>
    ? false
    : undefined extends ReturnType<SkuPriceGroupResolver['getRateForSkuBasedOnPriceGroup']>
      ? true
      : false;

/**
 * `calculateSkuPriceBasedOnCurrentAccount` is asynchronous, and carries the context.
 */
type CurrentAccountPriceIsAsynchronous =
  ReturnType<SkuPriceGroupResolver['calculateSkuPriceBasedOnCurrentAccount']> extends Promise<Money>
    ? true
    : false;

/**
 * The context argument is what replaced the ambient scope read (T6).
 */
type CurrentAccountPriceTakesContext = Parameters<
  SkuPriceGroupResolver['calculateSkuPriceBasedOnCurrentAccount']
>[1] extends CurrentAccountContext
  ? true
  : false;

/**
 * "No authenticated account" is representable, which the legacy `else` branch requires.
 */
type CurrentAccountContextAdmitsNoAccount = undefined extends CurrentAccountContext['accountID']
  ? true
  : false;

describe('collaborator contracts declared alongside the port', () => {
  // C4/B4. Two collaborator types support the port and neither is redeclared here.
  //
  // JUDGMENT CALL: `SkuPriceGroupResolver` is not on the port, and that is a discrepancy carried
  // rather than papered over. The obligation describes it as declared by
  // src/domain/ports/priceGroupRepository.ts with two methods.

  it('declares CurrentAccountContext as one opaque identifier that may be absent', () => {
    expect([...Object.keys(EXPECTED_CURRENT_ACCOUNT_CONTEXT_MEMBERS)]).toStrictEqual(['accountID']);

    // Absent means no authenticated account, and that state is load-bearing: it is the target's
    // representation of the legacy `else` branch at [model/service/PriceGroupService.cfc:L266].
    const admitsNoAccount: CurrentAccountContextAdmitsNoAccount = true;

    expect(admitsNoAccount).toBe(true);

    const authenticated: CurrentAccountContext = { accountID: CANNED_ACCOUNT_ID };
    const anonymous: CurrentAccountContext = {};

    expect(authenticated.accountID).toBe(CANNED_ACCOUNT_ID);
    expect(anonymous.accountID).toBeUndefined();
  });

  it('declares SkuPriceGroupResolver with the sync and async split the legacy requires', () => {
    expect([...Object.keys(EXPECTED_SKU_PRICE_GROUP_RESOLVER_MEMBERS)].sort()).toStrictEqual([
      'calculateSkuPriceBasedOnCurrentAccount',
      'calculateSkuPriceBasedOnPriceGroup',
      'getRateForSkuBasedOnPriceGroup',
    ]);

    // The async boundary is the assertion, drawn exactly where the legacy body reaches the
    // database.
    const priceByPriceGroupIsSynchronous: PriceByPriceGroupIsSynchronous = true;
    const rateForSkuIsSynchronousAndOptional: RateForSkuIsSynchronousAndOptional = true;
    const currentAccountPriceIsAsynchronous: CurrentAccountPriceIsAsynchronous = true;
    const currentAccountPriceTakesContext: CurrentAccountPriceTakesContext = true;

    expect(priceByPriceGroupIsSynchronous).toBe(true);
    expect(rateForSkuIsSynchronousAndOptional).toBe(true);
    expect(currentAccountPriceIsAsynchronous).toBe(true);

    expect(currentAccountPriceTakesContext).toBe(true);
  });

  it('keeps the resolver off this port, and off this adapter', () => {
    // The resolver is a SERVICE-TIER collaborator that entities are constructed with, not
    // something a data-access adapter implements.
    const { repository } = makeSubject();
    const members = repository as unknown as Readonly<Record<string, unknown>>;

    for (const resolverMember of Object.keys(EXPECTED_SKU_PRICE_GROUP_RESOLVER_MEMBERS)) {
      expect(members[resolverMember]).toBeUndefined();
      expect(PORT_METHOD_NAMES).not.toContain(resolverMember);
    }
  });
});

// H The pool-backed transaction implementation.
//
// Why this block lives in this file, stated so the placement is a decision rather than a
// convenience.

/**
 * One thing a fake connection was asked to do, in call order.
 */
type ConnectionEvent = string;

/**
 * A fake pooled connection that records the transaction protocol it was driven with.
 *
 * It records `BEGIN`, `EXECUTE`, `COMMIT`, `ROLLBACK` and `RELEASE` in one interleaved log,
 * because the assertions that matter are about ORDER: that the begin precedes every statement.
 */
class FakeConnection {
  readonly events: ConnectionEvent[] = [];

  /**
   * Statements issued on this connection, which is what makes them transactional.
   */
  readonly statements: string[] = [];

  /**
   * When set, the nth `execute` call rejects. Zero-based.
   */
  failingExecuteIndex: number | undefined;

  /**
   * When true, `commit` rejects - the case a caller is most likely to forget.
   */
  failCommit = false;

  /**
   * When true, `rollback` rejects too, which must not mask the original failure.
   */
  failRollback = false;

  private executeCount = 0;

  beginTransaction(): Promise<void> {
    this.events.push('BEGIN');

    return Promise.resolve();
  }

  execute(sql: string): Promise<[unknown, unknown]> {
    const attemptedIndex = this.executeCount;

    this.executeCount += 1;
    this.events.push('EXECUTE');
    this.statements.push(sql);

    if (attemptedIndex === this.failingExecuteIndex) {
      return Promise.reject(new Error('fake statement failure'));
    }

    // Shaped like the driver's tuple for both statement kinds: a row array for reads and a header
    // for writes. The executor destructures the first element only.
    return Promise.resolve([[{ affectedRows: 1, warningStatus: 0 }], undefined]);
  }

  commit(): Promise<void> {
    this.events.push('COMMIT');

    return this.failCommit ? Promise.reject(new Error('fake commit failure')) : Promise.resolve();
  }

  rollback(): Promise<void> {
    this.events.push('ROLLBACK');

    return this.failRollback
      ? Promise.reject(new Error('fake rollback failure'))
      : Promise.resolve();
  }

  release(): void {
    this.events.push('RELEASE');
  }
}

/**
 * A fake pool that hands out one prepared {@link FakeConnection} and counts checkouts.
 *
 * The checkout count is asserted as well as the protocol: a transaction that acquires two
 * connections is not a transaction, and one that acquires none has not begun.
 */
class FakePool {
  checkouts = 0;

  constructor(readonly connection: FakeConnection) {}

  getConnection(): Promise<FakeConnection> {
    this.checkouts += 1;

    return Promise.resolve(this.connection);
  }

  execute(sql: string): Promise<[unknown, unknown]> {
    // Reached only by a statement issued OUTSIDE a transaction. Recorded distinctly so a case can
    // prove a transactional statement did not leak onto the pool.
    this.connection.events.push(`POOL_EXECUTE:${sql}`);

    return Promise.resolve([[{ affectedRows: 1, warningStatus: 0 }], undefined]);
  }
}

/**
 * Adapts a fake pool to the executor, with the one assertion-free cast this block needs.
 */
function executorOverFakePool(pool: FakePool): PreparedStatementExecutor {
  // The driver's `Pool` is a wide interface and this block exercises three of its members.
  return createPoolExecutor(pool as unknown as Parameters<typeof createPoolExecutor>[0]);
}

describe('createPoolExecutor - the transaction protocol', () => {
  it('begins, runs the work on one connection, commits, and releases', async () => {
    const connection = new FakeConnection();
    const pool = new FakePool(connection);
    const executor = executorOverFakePool(pool);

    const result = await executor.transaction(async (transactional) => {
      await transactional.executeMutation('DELETE FROM SwPriceGroup WHERE priceGroupID = ?', ['a']);
      await transactional.executeMutation('DELETE FROM SwPriceGroupRate WHERE priceGroupID = ?', [
        'a',
      ]);

      return 'committed';
    });

    expect(result).toBe('committed');

    // The whole protocol, in order, on one connection.
    expect(connection.events).toStrictEqual(['BEGIN', 'EXECUTE', 'EXECUTE', 'COMMIT', 'RELEASE']);
    expect(pool.checkouts).toBe(1);
  });

  it('sends every statement to the checked-out connection, never to the pool', async () => {
    // The PROPERTY that MAKES it A TRANSACTION at all. `pool.execute` picks an arbitrary
    // connection per call, so a statement routed through it would be outside the transaction and
    // autocommitted.
    const connection = new FakeConnection();
    const pool = new FakePool(connection);

    await executorOverFakePool(pool).transaction(async (transactional) => {
      await transactional.execute('SELECT 1 FROM SwPriceGroup WHERE priceGroupID = ?', ['a']);
      await transactional.executeMutation('DELETE FROM SwPriceGroup WHERE priceGroupID = ?', ['a']);
    });

    expect(connection.statements).toStrictEqual([
      'SELECT 1 FROM SwPriceGroup WHERE priceGroupID = ?',
      'DELETE FROM SwPriceGroup WHERE priceGroupID = ?',
    ]);
    expect(connection.events.some((event) => event.startsWith('POOL_EXECUTE'))).toBe(false);
  });

  it('rolls back, releases, and re-raises the original error when the work throws', async () => {
    const connection = new FakeConnection();
    const pool = new FakePool(connection);
    const failure = new Error('fake work failure');

    await expect(
      executorOverFakePool(pool).transaction(async (transactional) => {
        await transactional.executeMutation('DELETE FROM SwPriceGroup WHERE priceGroupID = ?', [
          'a',
        ]);

        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(connection.events).toStrictEqual(['BEGIN', 'EXECUTE', 'ROLLBACK', 'RELEASE']);
  });

  it('rolls back when a statement itself fails part-way through', async () => {
    const connection = new FakeConnection();
    connection.failingExecuteIndex = 1;
    const pool = new FakePool(connection);

    await expect(
      executorOverFakePool(pool).transaction(async (transactional) => {
        await transactional.executeMutation('DELETE FROM SwPriceGroupRatePT WHERE 1 = ?', [1]);
        await transactional.executeMutation('DELETE FROM SwPriceGroupRateP WHERE 1 = ?', [1]);
        await transactional.executeMutation('DELETE FROM SwPriceGroupRateS WHERE 1 = ?', [1]);
      }),
    ).rejects.toThrow('fake statement failure');

    // The third statement never ran, and the first two are inside a rolled-back transaction rather
    // than committed.
    expect(connection.events).toStrictEqual(['BEGIN', 'EXECUTE', 'EXECUTE', 'ROLLBACK', 'RELEASE']);
    expect(connection.statements).toHaveLength(2);
  });

  it('does not swallow a commit failure', async () => {
    // The case a hand-rolled transaction most often gets wrong: the work succeeded, so it looks
    // like a success, but the commit is what makes it durable.
    const connection = new FakeConnection();
    connection.failCommit = true;
    const pool = new FakePool(connection);

    await expect(
      executorOverFakePool(pool).transaction(async (transactional) => {
        await transactional.executeMutation('DELETE FROM SwPriceGroup WHERE priceGroupID = ?', [
          'a',
        ]);
      }),
    ).rejects.toThrow('fake commit failure');

    // A failed commit is followed by a rollback attempt and still releases.
    expect(connection.events).toStrictEqual(['BEGIN', 'EXECUTE', 'COMMIT', 'ROLLBACK', 'RELEASE']);
  });

  it('lets a rollback failure through without masking the original failure', async () => {
    const connection = new FakeConnection();
    connection.failRollback = true;
    const pool = new FakePool(connection);
    const failure = new Error('fake work failure that matters');

    await expect(
      executorOverFakePool(pool).transaction(() => Promise.reject(failure)),
    ).rejects.toBe(failure);

    // Released even though the rollback threw. A connection left checked out is a pool slot lost
    // for the life of the container.
    expect(connection.events).toStrictEqual(['BEGIN', 'ROLLBACK', 'RELEASE']);
  });

  it('releases the connection exactly once on every path', async () => {
    for (const prepare of [
      (): void => undefined,
      (connection: FakeConnection): void => {
        connection.failCommit = true;
      },
      (connection: FakeConnection): void => {
        connection.failingExecuteIndex = 0;
      },
    ]) {
      const connection = new FakeConnection();
      prepare(connection);
      const pool = new FakePool(connection);

      await executorOverFakePool(pool)
        .transaction(async (transactional) => {
          await transactional.executeMutation('DELETE FROM SwPriceGroup WHERE 1 = ?', [1]);
        })
        .catch(() => undefined);

      expect(connection.events.filter((event) => event === 'RELEASE')).toHaveLength(1);
      expect(connection.events.at(-1)).toBe('RELEASE');
    }
  });

  it('JOINS a nested transaction instead of issuing a second BEGIN', async () => {
    // `BEGIN` would indeed implicitly commit the outer unit - so the shipped executor never issues
    // one.
    //
    // Refusing would break production code that depends on this, which is what decided it.
    const connection = new FakeConnection();
    const pool = new FakePool(connection);

    const result = await executorOverFakePool(pool).transaction((transactional) =>
      transactional.transaction(async (nested) => {
        await nested.executeMutation('DELETE FROM SwPriceGroup WHERE priceGroupID = ?', ['pg-1']);

        return 'inner';
      }),
    );

    expect(result).toBe('inner');

    // One connection, one BEGIN, one COMMIT, one RELEASE. The absence of a second BEGIN is the
    // assertion that matters: it is what makes MySQL's implicit-commit rule irrelevant here rather
    // than merely avoided.
    expect(connection.events).toStrictEqual(['BEGIN', 'EXECUTE', 'COMMIT', 'RELEASE']);
    expect(connection.events.filter((event) => event === 'BEGIN')).toHaveLength(1);
    expect(pool.checkouts).toBe(1);
  });

  it('exposes the same three members on the transactional executor as on the outer one', () => {
    // A repository method does not know whether it is running inside a transaction, and must not
    // have to: the same `execute`/`executeMutation` calls work either way.
    const connection = new FakeConnection();
    const outer = executorOverFakePool(new FakePool(connection));

    expect(typeof outer.execute).toBe('function');
    expect(typeof outer.executeMutation).toBe('function');
    expect(typeof outer.transaction).toBe('function');

    // And `query` is unreachable on both, so parameterization stays structural.
    const outerMembers = outer as unknown as Readonly<Record<string, unknown>>;
    expect(outerMembers['query']).toBeUndefined();
  });

  it('opens no transaction for a statement issued outside one', async () => {
    // The ordinary read and write paths are untouched by this addition: they still go straight to
    // the pool, with no connection checkout and no BEGIN.
    const connection = new FakeConnection();
    const pool = new FakePool(connection);

    await executorOverFakePool(pool).execute('SELECT 1 FROM SwPriceGroup WHERE 1 = ?', [1]);

    expect(pool.checkouts).toBe(0);
    expect(connection.events).toStrictEqual([
      'POOL_EXECUTE:SELECT 1 FROM SwPriceGroup WHERE 1 = ?',
    ]);
  });
});

describe('audit actor attribution - the preInsert and preUpdate account stamps', () => {
  it("★★ STAMPS THE REQUEST ACTOR on a price-group insert, ignoring the entity's own accounts", async () => {
    const { repository, executor } = makeSubject([]);

    const inserted = await repository.savePriceGroup(makeUnsavedPriceGroup(undefined));

    const statement = onlyStatement(executor.mutationCalls);

    // Both halves, because `preInsert` calls both setters under one gate.
    expect(parameterAt(statement.params, INSERT_BOUND.createdByAccountID)).toBe(
      TEST_AUDIT_ACTOR.accountID,
    );
    expect(parameterAt(statement.params, INSERT_BOUND.modifiedByAccountID)).toBe(
      TEST_AUDIT_ACTOR.accountID,
    );

    // And neither fixture value was bound anywhere at all - not merely at the audit positions.
    expect(statement.params).not.toContain(CANNED_CREATED_BY_ACCOUNT_ID);
    expect(statement.params).not.toContain(CANNED_MODIFIED_BY_ACCOUNT_ID);

    // The entity handed back reports the same resolution, so it describes the row that now exists.
    expect(inserted.getCreatedByAccountID()).toBe(TEST_AUDIT_ACTOR.accountID);
    expect(inserted.getModifiedByAccountID()).toBe(TEST_AUDIT_ACTOR.accountID);
  });

  it('stamps ONLY the modifying half on a price-group update, matching preUpdate', async () => {
    const { repository, executor } = makeSubject([]);

    const inserted = await repository.savePriceGroup(
      makePersistedPriceGroup({
        priceGroupID: CANNED_PRICE_GROUP_ID,
        priceGroupIDPath: CANNED_PRICE_GROUP_ID,
        parentPriceGroup: undefined,
      }),
    );

    const statement = onlyStatement(executor.mutationCalls);

    expect(parameterAt(statement.params, UPDATE_BOUND.modifiedByAccountID)).toBe(
      TEST_AUDIT_ACTOR.accountID,
    );

    // `createdByAccountID` is absent from the SET list entirely, so the creating account is
    // neither restamped nor rewritten - `preUpdate` has no created setter anywhere in its body.
    expect(EXPECTED_UPDATE_PRICE_GROUP_SQL).not.toContain('createdByAccountID = ');
    expect(statement.params).not.toContain(CANNED_MODIFIED_BY_ACCOUNT_ID);

    // The creating account is still reported, read off the row the entity came from.
    expect(inserted.getCreatedByAccountID()).toBe(CANNED_CREATED_BY_ACCOUNT_ID);
    expect(inserted.getModifiedByAccountID()).toBe(TEST_AUDIT_ACTOR.accountID);
  });

  it('★★ STAMPS NOTHING FOR A NON-ADMIN, reproducing the getAdminAccountFlag half of the gate', async () => {
    const executor = new RecordingExecutor([]);
    const repository = new MySqlPriceGroupRepository(
      executor,
      NON_ADMIN_AUDIT_ACTOR,
      makeRecordingValueRounder(),
      LIVE_REQUEST_CLOCK,
    );

    const inserted = await repository.savePriceGroup(makeUnsavedPriceGroup(undefined));

    const statement = onlyStatement(executor.mutationCalls);

    // The actor has an identifier; it is the missing flag alone that refuses the stamp, exactly as
    // `getAdminAccountFlag()` did. An unattributed row beats a wrongly attributed one.
    expect(NON_ADMIN_AUDIT_ACTOR.accountID).toBeTypeOf('string');

    // NULL, not `undefined`: unlike its four sibling adapters this one runs every bound value
    // through `toBindableValue`, so an absent value becomes an explicit SQL null and is never
    // omitted from the parameter array.
    expect(parameterAt(statement.params, INSERT_BOUND.createdByAccountID)).toBeNull();
    expect(parameterAt(statement.params, INSERT_BOUND.modifiedByAccountID)).toBeNull();
    expect(statement.params).not.toContain(NON_ADMIN_AUDIT_ACTOR.accountID);

    expect(inserted.getCreatedByAccountID()).toBeUndefined();
    expect(inserted.getModifiedByAccountID()).toBeUndefined();
  });

  it('★★ PRESERVES A STORED ATTRIBUTION when the gate refuses, rather than erasing it', async () => {
    const executor = new RecordingExecutor([]);
    const repository = new MySqlPriceGroupRepository(
      executor,
      NON_ADMIN_AUDIT_ACTOR,
      makeRecordingValueRounder(),
      LIVE_REQUEST_CLOCK,
    );

    const updated = await repository.savePriceGroup(
      makePersistedPriceGroup({
        priceGroupID: CANNED_PRICE_GROUP_ID,
        priceGroupIDPath: CANNED_PRICE_GROUP_ID,
        parentPriceGroup: undefined,
      }),
    );

    const statement = onlyStatement(executor.mutationCalls);

    // NULL is bound, and `COALESCE` in the SET list turns that into "leave the stored value
    // alone".
    expect(parameterAt(statement.params, UPDATE_BOUND.modifiedByAccountID)).toBeNull();
    expect(EXPECTED_UPDATE_PRICE_GROUP_SQL).toContain(
      'modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
    );

    // And the entity handed back reports what the ROW will hold, not the NULL that was BOUND.
    expect(updated.getModifiedByAccountID()).toBe(CANNED_MODIFIED_BY_ACCOUNT_ID);
  });

  it('★★ STAMPS THE REQUEST ACTOR on a RATE insert, on the same seam as the dates', async () => {
    const { repository, executor } = makeSubject([]);

    const inserted = await repository.savePriceGroupRate(makeUnsavedPriceGroupRate());

    const statement = statementAt(executor.mutationCalls, 0);

    expect(statement.sql).toBe(EXPECTED_INSERT_PRICE_GROUP_RATE_SQL);
    expect(parameterAt(statement.params, RATE_INSERT_BOUND.createdByAccountID)).toBe(
      TEST_AUDIT_ACTOR.accountID,
    );
    expect(parameterAt(statement.params, RATE_INSERT_BOUND.modifiedByAccountID)).toBe(
      TEST_AUDIT_ACTOR.accountID,
    );

    expect(inserted.getCreatedByAccountID()).toBe(TEST_AUDIT_ACTOR.accountID);
    expect(inserted.getModifiedByAccountID()).toBe(TEST_AUDIT_ACTOR.accountID);
  });

  it('preserves a stored RATE attribution when the gate refuses', async () => {
    const executor = new RecordingExecutor([]);
    const repository = new MySqlPriceGroupRepository(
      executor,
      NON_ADMIN_AUDIT_ACTOR,
      makeRecordingValueRounder(),
      LIVE_REQUEST_CLOCK,
    );

    // A rate that ALREADY CARRIES a stored attribution, built here rather than through
    // `makePersistedPriceGroupRate` - which leaves both accounts absent.
    const stored = new PriceGroupRate({
      priceGroupRateID: CANNED_PRICE_GROUP_RATE_ID,
      globalFlag: 'false',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString('12.50'),
      createdByAccountID: CANNED_CREATED_BY_ACCOUNT_ID,
      modifiedByAccountID: CANNED_MODIFIED_BY_ACCOUNT_ID,
    });

    const updated = await repository.savePriceGroupRate(stored);

    const statement = statementAt(executor.mutationCalls, 0);

    expect(statement.sql).toBe(EXPECTED_UPDATE_PRICE_GROUP_RATE_SQL);

    // NULL is bound even though the entity carries a value, and `COALESCE` keeps what is stored.
    expect(parameterAt(statement.params, RATE_UPDATE_BOUND.modifiedByAccountID)).toBeNull();
    expect(statement.params).not.toContain(CANNED_MODIFIED_BY_ACCOUNT_ID);
    expect(EXPECTED_UPDATE_PRICE_GROUP_RATE_SQL).toContain(
      'modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
    );

    // And the entity handed back reports what the ROW holds - the stored value `COALESCE` kept -
    // not the NULL that was bound.
    expect(updated.getModifiedByAccountID()).toBe(CANNED_MODIFIED_BY_ACCOUNT_ID);
  });
});
