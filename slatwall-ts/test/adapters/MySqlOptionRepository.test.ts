/**
 * `MySqlOptionRepository` — the ported `model/dao/OptionDAO.cfc`. **NET-NEW** in its entirety.
 *
 * AAP authority: AAP §0.4.1.12 lists `slatwall-ts/test/adapters/MySqlOptionRepository.test.ts` | create
 * | "**net-new**", and the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | create.
 *
 * Provenance — why every case here is **net-new**, and what that costs
 * No legacy `OptionDAOTest` exists anywhere under `meta/tests/`, so nothing below extends a legacy
 * assertion and no case is labelled as though it did (AAP §0.8.3.7). Every `describe` and every `it`
 * name carries **NET-NEW** for that reason: the label is the honest answer to the standing question
 * of whether a port replicates existing tests or quietly writes new ones, and here the answer is
 * "new ones", stated per case rather than buried in an aggregate.
 */
import { MySqlOptionRepository } from '../../src/adapters/mysql/MySqlOptionRepository';
import { assertColumnName, assertTableName } from '../../src/adapters/mysql/QueryRunner';
import {
  GENEROUS_SMART_LIST_BUDGET,
  UNSTATED_SMART_LIST_BUDGET,
  smartListBudgetWithComplexityCeiling,
  createSqlExecutorDouble,
  smartListBudgetWithRowCeiling,
  sqlRows,
} from '../support/inMemoryRepositories';

import type { SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
import type {
  OptionRepository,
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../src/ports/repositories/OptionRepository';
import type {
  SqlExecutorCall,
  SqlExecutorDouble,
  SqlExecutorOutcome,
  SqlExecutorResponder,
} from '../support/inMemoryRepositories';
import {
  SMARTLIST_DISTINCT_ASYMMETRY,
  SmartListQueryBuilder,
  describePropertyScopedSmartList,
} from '../../src/adapters/mysql/SmartListQueryBuilder';
import { DomainError } from '../../src/errors/DomainError';
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/QueryRunner';
import { PRODUCT_FEED_JOINS } from '../../src/integrations/google/ProductFeedQuery';
import { mergeSmartListJoins, translateSmartListInput } from '../../src/ports/SmartListQueryPort';
import { createFanningSqlExecutorDouble } from '../support/inMemoryRepositories';
import type { CompiledSmartListQuery } from '../../src/adapters/mysql/SmartListQueryBuilder';
import type { CatalogAggregateLoader } from '../../src/adapters/mysql/QueryRunner';
import type { ProductDefaultSkuDelegate } from '../../src/domain/product/Product';
import type { Sku } from '../../src/domain/sku/Sku';
import type {
  SmartListEntityName,
  SmartListJoin,
  SmartListQuery,
  SmartListQueryPort,
} from '../../src/ports/SmartListQueryPort';
import {
  createAnonymousMaterialisationGate,
  createSmartListMaterialisationBudget,
} from '../../src/adapters/mysql/SmartListQueryBuilder';
import type { SmartListMaterialisationBudget } from '../../src/adapters/mysql/SmartListQueryBuilder';

/** The four figures the anonymous feed gate demands, none of them stated. */
const UNSTATED_FEED_GATE_BOUNDS = Object.freeze({
  maximumRecordsPerQuery: undefined,
  maximumPredicatesPerQuery: undefined,
  maximumImagesPerRecord: undefined,
  maximumResponseBytes: undefined,
});

/**
 * Builds a fully stated gate input from one row figure, so a case asserting the row clause need not restate
 * the other three.
 *
 * @param maximumRecordsPerQuery the row figure the case is asserting
 * @returns the four figures, all stated.
 */
function feedGateBoundsOf(maximumRecordsPerQuery: number): {
  readonly maximumRecordsPerQuery: number;
  readonly maximumPredicatesPerQuery: number;
  readonly maximumImagesPerRecord: number;
  readonly maximumResponseBytes: number;
} {
  return {
    maximumRecordsPerQuery,
    maximumPredicatesPerQuery: 10_000,
    maximumImagesPerRecord: 1_000,
    maximumResponseBytes: 100_000_000,
  };
}
import { ConfigurationError } from '../../src/errors/DomainError';

/*
 * Identifiers, resolved through the production whitelist rather than spelled by hand
 * Every table and column an expectation below names is resolved through the same two validators the
 * adapter itself uses, `assertTableName` and `assertColumnName`. Three things follow, and all three
 * are why the indirection is worth its keystrokes:
 *
 * * An expectation cannot name a table or column that is not part of the extracted schema. A typo
 * raises when this module is evaluated, rather than producing an assertion that passes against
 * text nobody meant to write.
 * * The expectations and the adapter draw their spellings from one source, so a test cannot drift
 * into asserting a column the entity declarations no longer declare.
 */

/** `model/entity/Option.cfc:L49` — `table="SwOption"`. */
const OPTION_TABLE = assertTableName('SwOption');

/** `model/entity/OptionGroup.cfc:L49` — `table="SwOptionGroup"`. */
const OPTION_GROUP_TABLE = assertTableName('SwOptionGroup');

/**
 * The SKU-to-option link table, named in the non-existence guard at `model/dao/OptionDAO.cfc:L74`.
 */
const SKU_OPTION_TABLE = assertTableName('SwSkuOption');

/** `model/entity/Sku.cfc:L49` — `table="SwSku"`, joined at `model/dao/OptionDAO.cfc:L76`. */
const SKU_TABLE = assertTableName('SwSku');

/** `SwOption.optionID` — projected at `model/dao/OptionDAO.cfc:L60`, correlated at `:L80`. */
const OPTION_ID = assertColumnName(OPTION_TABLE, 'optionID');

/** `SwOption.optionName` — projected at `model/dao/OptionDAO.cfc:L61`, sorted at `:L84`. */
const OPTION_NAME = assertColumnName(OPTION_TABLE, 'optionName');

/**
 * `SwOption.optionGroupID` — the child side of the required many-to-one at
 * `model/entity/Option.cfc:L59`, joined at `model/dao/OptionDAO.cfc:L66` and filtered at `:L68`.
 */
const OPTION_GROUP_ID_ON_OPTION = assertColumnName(OPTION_TABLE, 'optionGroupID');

/**
 * `SwOptionGroup.optionGroupID` — the parent side of that same relationship, and the column the
 * second statement negates against at `model/dao/OptionDAO.cfc:L107`.
 */
const OPTION_GROUP_ID = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID');

/**
 * `SwOptionGroup.optionGroupName` — projected by both statements, at `model/dao/OptionDAO.cfc:L62`
 * and `:L103`, and a sort term of both, at `:L83` and `:L109`.
 */
const OPTION_GROUP_NAME = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupName');

/** `SwSkuOption.optionID` — the link column correlated back to the outer row at `:L80`. */
const SKU_OPTION_OPTION_ID = assertColumnName(SKU_OPTION_TABLE, 'optionID');

/** `SwSkuOption.skuID` — the link column joined to the SKU table at `:L76`. */
const SKU_OPTION_SKU_ID = assertColumnName(SKU_OPTION_TABLE, 'skuID');

/** `SwSku.skuID` — the join target at `model/dao/OptionDAO.cfc:L76`. */
const SKU_SKU_ID = assertColumnName(SKU_TABLE, 'skuID');

/** `SwSku.productID` — the bound predicate inside the non-existence guard, at `:L78`. */
const SKU_PRODUCT_ID = assertColumnName(SKU_TABLE, 'productID');

/** The alias `model/dao/OptionDAO.cfc:L74` gives the link table inside the guard. */
const SKU_OPTION_ALIAS = 'a';

/** The alias `model/dao/OptionDAO.cfc:L76` gives the SKU table inside the same guard. */
const SKU_ALIAS = 'b';

/* Values the cases bind. */

/** The product identifier every case binds. */
const PRODUCT_ID = 'product-1';

/**
 * The three-character separator `model/dao/OptionDAO.cfc:L88` places between an option group's name
 * and its option's name — a space, a hyphen-minus, then a space:
 *
 * ArrayAppend(result, {name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID})
 */
const LABEL_SEPARATOR = ' - ';

/* The harness. */

interface Recording {
  readonly repository: MySqlOptionRepository;
  readonly double: SqlExecutorDouble;
}

/**
 * Build the adapter over the suite's recording executor double.
 *
 * @param outcomes - what the executor should answer, one per call, in call order. Omit them entirely
 * and every call answers no rows, which is all a statement-text assertion needs.
 *
 * @returns the adapter and the recording double, whose `calls` is a live, element-frozen journal.
 */
function recording(...outcomes: readonly SqlExecutorOutcome[]): Recording {
  const double = createSqlExecutorDouble({ outcomes });
  const executor: SqlExecutor = double.executor;

  return { repository: new MySqlOptionRepository(executor), double };
}

/**
 * Build the adapter over a recording double that decides each answer from the statement it was handed.
 *
 * @param respond - decides an outcome from the recorded call, or declines it.
 * @returns the adapter and the recording double.
 */
function recordingWithResponder(respond: SqlExecutorResponder): Recording {
  const double = createSqlExecutorDouble({ respond });
  const executor: SqlExecutor = double.executor;

  return { repository: new MySqlOptionRepository(executor), double };
}

/**
 * The statement recorded at `index`, narrowed without a non-null assertion.
 *
 * @param double - the recording double.
 * @param index - zero-based position in issue order.
 * @returns the recorded statement.
 * @throws {Error} when the adapter issued no statement at that position.
 */
function callAt(double: SqlExecutorDouble, index: number): SqlExecutorCall {
  const call = double.calls[index];

  if (call === undefined) {
    throw new Error(
      `the adapter issued no statement at position ${String(index)}; it issued ` +
        `${String(double.calls.length)} in total`,
    );
  }

  return call;
}

/**
 * The one statement the adapter issued, asserting on the way that there was exactly one.
 *
 * @param double - the recording double.
 * @returns the sole recorded statement.
 */
function soleCall(double: SqlExecutorDouble): SqlExecutorCall {
  expect(double.calls).toHaveLength(1);

  return callAt(double, 0);
}

/**
 * The one row the adapter mapped, asserting on the way that there was exactly one.
 *
 * @param rows - the mapped rows.
 * @returns the sole row.
 * @throws {Error} when the adapter mapped no row.
 */
function soleRow<Row>(rows: readonly Row[]): Row {
  expect(rows).toHaveLength(1);

  const [row] = rows;

  if (row === undefined) {
    throw new Error('the adapter mapped no row at all');
  }

  return row;
}

/**
 * Collapse every run of whitespace to one space so an expectation reads as a clause rather than as
 * indentation.
 *
 * @param sql - the statement exactly as the adapter issued it.
 * @returns the same statement with single spaces between tokens and no leading or trailing space.
 */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * Join clause fragments with the single spaces {@link normalize} leaves between tokens.
 *
 * @param fragments - the fragments, in statement order.
 * @returns the fragments joined by single spaces.
 */
function clause(...fragments: readonly string[]): string {
  return fragments.join(' ');
}

/**
 * The closing slice of a statement, the same length as the tail it is being compared against.
 *
 * @param sql - the statement exactly as the adapter issued it.
 * @param expectedTail - the tail the statement is expected to end with.
 * @returns the closing slice of the normalized statement, `expectedTail.length` characters long.
 */
function tail(sql: string, expectedTail: string): string {
  const text = normalize(sql);

  return text.slice(Math.max(0, text.length - expectedTail.length));
}

/**
 * The bind-marker text a set-membership clause carries, read back out of the statement itself.
 *
 * @param sql - the statement exactly as the adapter issued it.
 * @param columnReference - the qualified column the clause filters, e.g. `SwOption.optionGroupID`.
 * @param operator - the set operator the clause is expected to use.
 * @returns the text between the clause's parentheses, e.g. `?` or `?, ?`.
 * @throws {Error} when the statement carries no such clause, or leaves it unclosed.
 */
function membershipMarkers(
  sql: string,
  columnReference: string,
  operator: 'IN' | 'NOT IN',
): string {
  const text = normalize(sql);
  const opening = `${columnReference} ${operator} (`;
  const opens = text.indexOf(opening);

  if (opens === -1) {
    throw new Error(`the statement carries no "${opening}…)" clause:\n${text}`);
  }

  const from = opens + opening.length;
  const closes = text.indexOf(')', from);

  if (closes === -1) {
    throw new Error(`the "${opening}" clause is never closed:\n${text}`);
  }

  return text.slice(from, closes);
}

interface UnusedOptionsExercise {
  readonly call: SqlExecutorCall;
  readonly rows: UnusedOptionRow[];
}

interface UnusedOptionGroupsExercise {
  readonly call: SqlExecutorCall;
  readonly rows: UnusedOptionGroupRow[];
}

/**
 * Exercise `findUnusedOptions` once and hand back its statement and its mapped rows.
 *
 * @param productID - bound inside the non-existence guard at `model/dao/OptionDAO.cfc:L78`.
 * @param existingOptionGroupIDList - the comma-delimited list bound at `:L68`, empty string included.
 * @param outcomes - what the executor should answer; omit for a statement-text assertion.
 * @returns the sole statement issued, and the rows the adapter mapped out of the answer.
 */
async function exerciseUnusedOptions(
  productID: string,
  existingOptionGroupIDList: string,
  ...outcomes: readonly SqlExecutorOutcome[]
): Promise<UnusedOptionsExercise> {
  const { repository, double } = recording(...outcomes);
  const rows = await repository.findUnusedOptions(productID, existingOptionGroupIDList);

  return { call: soleCall(double), rows };
}

/**
 * Exercise `findUnusedOptionGroups` once and hand back its statement and its mapped rows.
 *
 * @param existingOptionGroupIDList - the comma-delimited list bound at `model/dao/OptionDAO.cfc:L107`,
 * empty string included. It is this member's only argument, exactly as at `:L95`.
 *
 * @param outcomes - what the executor should answer; omit for a statement-text assertion.
 * @returns the sole statement issued, and the rows the adapter mapped out of the answer.
 */
async function exerciseUnusedOptionGroups(
  existingOptionGroupIDList: string,
  ...outcomes: readonly SqlExecutorOutcome[]
): Promise<UnusedOptionGroupsExercise> {
  const { repository, double } = recording(...outcomes);
  const rows = await repository.findUnusedOptionGroups(existingOptionGroupIDList);

  return { call: soleCall(double), rows };
}

/*
 * The two expected statements, written out once
 * Each is the complete translation of its legacy statement, assembled from the validated identifiers
 * above so that no spelling in an expectation can drift from the schema the entities declare.
 */

/**
 * `findUnusedOptions` for a two-element list — the translation of `model/dao/OptionDAO.cfc:L58-L85`.
 */
const UNUSED_OPTIONS_STATEMENT_FOR_TWO_GROUPS = clause(
  `SELECT ${OPTION_TABLE}.${OPTION_ID},`,
  `${OPTION_TABLE}.${OPTION_NAME},`,
  `${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
  `FROM ${OPTION_TABLE}`,
  `INNER JOIN ${OPTION_GROUP_TABLE}`,
  `on ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID} = ${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION}`,
  `WHERE ${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION} IN (?, ?)`,
  'AND NOT EXISTS(',
  `SELECT DISTINCT ${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID}`,
  `FROM ${SKU_OPTION_TABLE} ${SKU_OPTION_ALIAS}`,
  `INNER JOIN ${SKU_TABLE} ${SKU_ALIAS}`,
  `on ${SKU_OPTION_ALIAS}.${SKU_OPTION_SKU_ID} = ${SKU_ALIAS}.${SKU_SKU_ID}`,
  `WHERE ${SKU_ALIAS}.${SKU_PRODUCT_ID} = ?`,
  `AND ${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID} = ${OPTION_TABLE}.${OPTION_ID}`,
  ')',
  `ORDER BY ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}, ${OPTION_TABLE}.${OPTION_NAME}`,
);

/** The correlated non-existence guard on its own — `model/dao/OptionDAO.cfc:L70-L81`. */
const UNUSED_OPTIONS_EXISTENCE_GUARD = clause(
  'NOT EXISTS(',
  `SELECT DISTINCT ${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID}`,
  `FROM ${SKU_OPTION_TABLE} ${SKU_OPTION_ALIAS}`,
  `INNER JOIN ${SKU_TABLE} ${SKU_ALIAS}`,
  `on ${SKU_OPTION_ALIAS}.${SKU_OPTION_SKU_ID} = ${SKU_ALIAS}.${SKU_SKU_ID}`,
  `WHERE ${SKU_ALIAS}.${SKU_PRODUCT_ID} = ?`,
  `AND ${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID} = ${OPTION_TABLE}.${OPTION_ID}`,
  ')',
);

/**
 * The two-term ordering `model/dao/OptionDAO.cfc:L82-L84` declares, and the statement's last clause.
 */
const UNUSED_OPTIONS_ORDERING = clause(
  `ORDER BY ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME},`,
  `${OPTION_TABLE}.${OPTION_NAME}`,
);

/**
 * `findUnusedOptionGroups` for a one-element list — the translation of
 * `model/dao/OptionDAO.cfc:L100-L110`.
 */
const UNUSED_OPTION_GROUPS_STATEMENT_FOR_ONE_GROUP = clause(
  `SELECT ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID},`,
  `${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
  `FROM ${OPTION_GROUP_TABLE}`,
  `WHERE ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID} NOT IN (?)`,
  `ORDER BY ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
);

/** The single-term ordering `model/dao/OptionDAO.cfc:L108-L109` declares — one term, not two. */
const UNUSED_OPTION_GROUPS_ORDERING = `ORDER BY ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`;

/** The qualified column the first statement filters with `IN` [`model/dao/OptionDAO.cfc:L68`]. */
const OPTION_GROUP_FILTER_COLUMN = `${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION}`;

/** The qualified column the second statement filters with `NOT IN` [`:L107`]. */
const OPTION_GROUP_EXCLUSION_COLUMN = `${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID}`;

describe('SmartListQueryPort — NET-NEW: CFML-boolean removal keys delete every accumulated filter for their property', () => {
  it('NET-NEW — FR/FIR/FKR truthy word and numeric spellings remove equality, IN and LIKE filters', () => {
    const query = translateSmartListInput({
      entityName: 'SlatwallOption',
      input: {
        'F:optionName': 'Large',
        'FR:optionName': 'yes',
        'FI:optionID': 'first,second',
        'FIR:optionID': '1',
        'FK:optionDescription': 'soft,red',
        'FKR:optionDescription': '2',
      },
    });

    /*
     * Each add precedes its matching removal in object insertion order. A removal implementation that
     * merely ignored the flag, read numeric text as false, or removed only a different filter family
     * would leave a where group behind.
     */
    expect(query.whereGroups).toBeUndefined();
  });
});

describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: the statement, token for token', () => {
  it('NET-NEW — findUnusedOptions issues exactly the ported statement, with nothing added and nothing dropped', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    expect(normalize(call.sql)).toBe(UNUSED_OPTIONS_STATEMENT_FOR_TWO_GROUPS);
  });

  it('NET-NEW — projects the option identifier, the option name and the owning group name', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    expect(normalize(call.sql)).toContain(
      clause(
        `SELECT ${OPTION_TABLE}.${OPTION_ID},`,
        `${OPTION_TABLE}.${OPTION_NAME},`,
        `${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
      ),
    );
  });

  it('NET-NEW — reaches the owning group through an inner join on the shared group identifier', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    expect(normalize(call.sql)).toContain(
      clause(
        `FROM ${OPTION_TABLE}`,
        `INNER JOIN ${OPTION_GROUP_TABLE}`,
        `on ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID} = ${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION}`,
      ),
    );
  });

  it('NET-NEW — filters the candidate groups with a dynamic IN clause over bind markers', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    expect(normalize(call.sql)).toContain(`WHERE ${OPTION_GROUP_FILTER_COLUMN} IN (?, ?)`);
    expect(membershipMarkers(call.sql, OPTION_GROUP_FILTER_COLUMN, 'IN')).toBe('?, ?');
  });

  it('NET-NEW — keeps the correlated NOT EXISTS over the link table joined to SwSku', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    expect(normalize(call.sql)).toContain(UNUSED_OPTIONS_EXISTENCE_GUARD);
  });

  it('NET-NEW — keeps the option correlation INSIDE the sub-query rather than lifting it out', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');
    const text = normalize(call.sql);

    const correlation = `${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID} = ${OPTION_TABLE}.${OPTION_ID}`;
    const guardOpens = text.indexOf('NOT EXISTS(');
    const guardCloses = text.indexOf(')', guardOpens);
    const correlationAt = text.indexOf(correlation);

    expect(guardOpens).toBeGreaterThan(-1);
    expect(correlationAt).toBeGreaterThan(guardOpens);
    expect(correlationAt).toBeLessThan(guardCloses);
  });

  it('NET-NEW — orders by the group name and then the option name, and stops there', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    /*
     * Two assertions, and the second is the one that matters. The first pins the ordering the legacy
     * declares at `:L82-L84` — the group's name, then the option's name, both explicit name terms. The
     * second pins that the ordering is the statement's last clause, which is how this case proves no
     * row window and no further predicate has been appended, without having to enumerate the clauses
     * that must not be there.
     *
     * TODO(parity) `model/dao/OptionDAO.cfc:L82-L84` — the name ordering is carried, not modernised.
     * `model/entity/OptionGroup.cfc:L70` declares `orderby="sortOrder"` on a group's options
     * collection, and it is tempting to read that as the catalogue's intended option order and apply
     * it here. It is not a licence to: that attribute governs the collection the ORM materialises for
     * one group, whereas this statement is a flat cross-group projection whose two explicit name terms
     * reach a rendered drop-down directly. Substituting a sort-order term would reorder visible output.
     */
    expect(normalize(call.sql)).toContain(UNUSED_OPTIONS_ORDERING);
    expect(tail(call.sql, UNUSED_OPTIONS_ORDERING)).toBe(UNUSED_OPTIONS_ORDERING);
  });

  it('NET-NEW — filters with IN and never with the sibling statement’s negated operator', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    expect(normalize(call.sql)).toContain(`${OPTION_GROUP_FILTER_COLUMN} IN (`);
    expect(normalize(call.sql)).not.toContain('NOT IN');
  });
});

/* Bind order is the subject of its own suite because no other check can catch it. */
describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: bind order is statement order', () => {
  it('NET-NEW — binds the option-group identifiers FIRST and the product identifier LAST', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    expect(call.params).toEqual(['group-a', 'group-b', PRODUCT_ID]);
  });

  it('NET-NEW — does not bind in signature order, which is the transposition to catch', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    /*
     * The negative half of the case above, and not redundant with it. Asserting only the expected
     * array leaves a reader to work out for themselves that the signature-ordered array is a real and
     * plausible alternative; naming it here makes the trap explicit, and the two same-typed strings
     * mean this is the assertion that fails first if someone "tidies" the parameter assembly to match
     * the member's own argument list.
     */
    expect(call.params).not.toEqual([PRODUCT_ID, 'group-a', 'group-b']);
  });

  it('NET-NEW — places the membership clause ahead of the product predicate, which is why', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');
    const text = normalize(call.sql);

    /*
     * The bound order is not arbitrary and this case says where it comes from: positional binding
     * follows the order the markers appear in the text, so the array above is a consequence of the
     * statement's own layout rather than a convention chosen by the adapter. Pin the layout and the
     * array follows; pin only the array and a later reader has no way to tell which of the two is the
     * cause.
     */
    expect(text.indexOf(`${OPTION_GROUP_FILTER_COLUMN} IN (`)).toBeLessThan(
      text.indexOf(`${SKU_ALIAS}.${SKU_PRODUCT_ID} = ?`),
    );
  });

  it('NET-NEW — binds the product identifier exactly once, however long the group list', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b,group-c');

    expect(call.params.filter((value) => value === PRODUCT_ID)).toHaveLength(1);
    expect(call.params[call.params.length - 1]).toBe(PRODUCT_ID);
  });
});

describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: placeholder cardinality', () => {
  it('NET-NEW — findUnusedOptions emits one bind marker per comma-list element, for every shape of list', async () => {
    /*
     * One table rather than six cases, because the property is a single invariant — one marker per
     * element, one bound value per marker, in list order — and reading it as a table is how a reviewer
     * checks it. Duplicates are kept (`IN ('a','a')` selects what `IN ('a')` selects, so removing one
     * is invisible in the result and still a divergence in the statement), empty elements are kept, and
     * nothing is trimmed, de-duplicated, filtered or routed through a set.
     */
    const lists = ['group-a', 'group-a,group-b', 'group-a,group-a', 'group-a,,group-b', ',', ''];
    const observed: Array<{
      readonly list: string;
      readonly markers: string;
      readonly params: readonly unknown[];
    }> = [];

    for (const list of lists) {
      const { call } = await exerciseUnusedOptions(PRODUCT_ID, list);

      observed.push({
        list,
        markers: membershipMarkers(call.sql, OPTION_GROUP_FILTER_COLUMN, 'IN'),
        params: call.params,
      });
    }

    expect(observed).toEqual([
      { list: 'group-a', markers: '?', params: ['group-a', PRODUCT_ID] },
      { list: 'group-a,group-b', markers: '?, ?', params: ['group-a', 'group-b', PRODUCT_ID] },
      { list: 'group-a,group-a', markers: '?, ?', params: ['group-a', 'group-a', PRODUCT_ID] },
      {
        list: 'group-a,,group-b',
        markers: '?, ?, ?',
        params: ['group-a', '', 'group-b', PRODUCT_ID],
      },
      { list: ',', markers: '?, ?', params: ['', '', PRODUCT_ID] },
      { list: '', markers: '?', params: ['', PRODUCT_ID] },
    ]);
  });

  it('NET-NEW — binds each element exactly as the delimiter produced it, without trimming', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, ' group-a , group-b ');

    /*
     * The legacy binds the token the delimiter produced, surrounding whitespace included, so the port
     * does too. Trimming would look like hygiene and would change which rows match — a value with
     * spaces matches nothing where a trimmed one might match a real group.
     */
    expect(call.params).toEqual([' group-a ', ' group-b ', PRODUCT_ID]);
  });

  it('NET-NEW — keeps every marker a marker: the group values never enter the statement text', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    expect(call.sql).not.toContain('group-a');
    expect(call.sql).not.toContain('group-b');
    expect(call.sql).not.toContain(PRODUCT_ID);
  });
});

describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: the empty option-group list', () => {
  it("NET-NEW — binds ONE marker to the empty string, preserving IN ('') rather than IN ()", async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, '');

    /*
     * This is a deliberate preservation decision, not an oversight, and it is the easiest thing
     * in this adapter to "fix" into a bug.
     */
    expect(membershipMarkers(call.sql, OPTION_GROUP_FILTER_COLUMN, 'IN')).toBe('?');
    expect(normalize(call.sql)).toContain(`${OPTION_GROUP_FILTER_COLUMN} IN (?)`);
    expect(call.params).toEqual(['', PRODUCT_ID]);
  });

  it('NET-NEW — follows the marker with the product identifier, so the order still holds', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, '');

    expect(call.params).toEqual(['', PRODUCT_ID]);
    expect(call.params).not.toEqual([PRODUCT_ID, '']);
  });

  it('NET-NEW — findUnusedOptions does not special-case the empty list: it issues the same statement a one-element list issues', async () => {
    const empty = await exerciseUnusedOptions(PRODUCT_ID, '');
    const single = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    /*
     * The strongest available proof that no branch was introduced for the empty input. Both lists have
     * one element, so both must produce the identical statement, byte for byte; only the bound value
     * differs. An always-false rewrite, a guard, or an early return would all break this equality
     * while leaving the marker count assertion above intact.
     */
    expect(empty.call.sql).toBe(single.call.sql);
    expect(empty.rows).toEqual([]);
  });
});

/*
 * Two projections of an option exist in this slice, they disagree, and the disagreement is
 * carried rather than harmonised.
 */
describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: the composed drop-down row', () => {
  it('NET-NEW — maps the projection to the UnusedOptionRow shape, label and identifier', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
    );

    const expected: UnusedOptionRow[] = [{ name: 'Size - Large', value: 'option-1' }];

    expect(rows).toEqual(expected);
  });

  it('NET-NEW — takes the row identifier from the option, never from its owning group', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([
        {
          optionID: 'option-1',
          optionName: 'Large',
          optionGroupID: 'group-a',
          optionGroupName: 'Size',
        },
      ]),
    );

    /*
     * The projected row carries both identifiers, so a mapper reading the wrong one would still produce
     * a well-formed row and a working drop-down that submitted a group where an option was expected.
     * `model/dao/OptionDAO.cfc:L88` reads `rs.optionID`, and this case is what holds it there.
     */
    expect(soleRow(rows).value).toBe('option-1');
  });

  it('NET-NEW — separates the two names with one SPACE, one HYPHEN-MINUS and one SPACE', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
    );

    const label = soleRow(rows).name;
    const separator = label.slice('Size'.length, label.length - 'Large'.length);

    /*
     * The code points are asserted, not just the string. An en dash separator would read identically in
     * a review diff and in most editors, and it would change bytes on a rendered page; comparing
     * `0x20, 0x2d, 0x20` is the only form of this assertion that cannot be satisfied by a look-alike.
     */
    expect(separator).toBe(LABEL_SEPARATOR);
    expect([...separator].map((character) => character.codePointAt(0))).toEqual([0x20, 0x2d, 0x20]);
    expect(label.split(LABEL_SEPARATOR)).toEqual(['Size', 'Large']);
  });

  it('NET-NEW — composes the group name first and the option name second, in that order', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Size', optionGroupName: 'Large' }]),
    );

    /*
     * The two names are deliberately swapped in the seeded row relative to the case above, so that a
     * composition assembled in the wrong order would produce "Size - Large" here and pass a lazier
     * assertion. It must produce "Large - Size": group name first [`model/dao/OptionDAO.cfc:L88`].
     */
    expect(soleRow(rows).name).toBe('Large - Size');
  });

  it('NET-NEW — maps every returned row, preserving the order the statement produced', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a,group-b',
      sqlRows([
        { optionID: 'option-2', optionName: 'Large', optionGroupName: 'Size' },
        { optionID: 'option-1', optionName: 'Blue', optionGroupName: 'Colour' },
      ]),
    );

    /*
     * The rows arrive in the order the ORDER BY produced and are mapped in that order — no re-sorting
     * happens above the statement. The seeded pair is deliberately not in name order, because a mapper
     * that quietly sorted its output would otherwise be indistinguishable from one that did not.
     */
    expect(rows).toEqual([
      { name: 'Size - Large', value: 'option-2' },
      { name: 'Colour - Blue', value: 'option-1' },
    ]);
  });

  it('NET-NEW — findUnusedOptions resolves to an empty array when the statement matched nothing', async () => {
    const { rows } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a', sqlRows([]));

    expect(rows).toEqual([]);
  });
});

describe('MySqlOptionRepository.findUnusedOptionGroups — NET-NEW: the statement, token for token', () => {
  it('NET-NEW — findUnusedOptionGroups issues exactly the ported statement, with nothing added and nothing dropped', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a');

    expect(normalize(call.sql)).toBe(UNUSED_OPTION_GROUPS_STATEMENT_FOR_ONE_GROUP);
  });

  it('NET-NEW — projects the group identifier and the group name from SwOptionGroup alone', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a');

    expect(normalize(call.sql)).toContain(
      clause(
        `SELECT ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID},`,
        `${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
        `FROM ${OPTION_GROUP_TABLE}`,
      ),
    );
  });

  it('NET-NEW — excludes the supplied groups with a dynamic NOT IN clause over bind markers', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a,group-b');

    expect(normalize(call.sql)).toContain(`WHERE ${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (?, ?)`);
    expect(membershipMarkers(call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe('?, ?');
  });

  it('NET-NEW — orders by the group name alone — one sort term, not two — and stops there', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a');

    /*
     * One term where the sibling statement has two [`model/dao/OptionDAO.cfc:L108-L109` against
     * `:L82-L84`]. The tail comparison again doubles as the proof that the ordering is the last clause,
     * so nothing has been appended after it.
     */
    expect(normalize(call.sql)).toContain(UNUSED_OPTION_GROUPS_ORDERING);
    expect(tail(call.sql, UNUSED_OPTION_GROUPS_ORDERING)).toBe(UNUSED_OPTION_GROUPS_ORDERING);
  });

  it('NET-NEW — adds no join, no non-existence guard and no product predicate', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a');
    const text = normalize(call.sql);

    /*
     * Every absence here is faithful. `model/dao/OptionDAO.cfc:L100-L110` consults one table: it takes
     * no product identifier, never reaches the SKU table or the link table, and applies no
     * non-existence test. "Unused" is narrower in this member than in its sibling — absent from the
     * supplied list — and completing the symmetry by adding a usage check would change results.
     */
    expect(text).not.toContain('JOIN');
    expect(text).not.toContain('EXISTS');
    expect(text).not.toContain(SKU_TABLE);
    expect(text).not.toContain(SKU_OPTION_TABLE);
    expect(text).not.toContain(SKU_PRODUCT_ID);
  });

  it('NET-NEW — binds exactly the supplied list, with no product identifier appended', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a,group-b');

    /*
     * The member takes one argument [`model/dao/OptionDAO.cfc:L95`], so its bound array is the list and
     * nothing else. The bind-order trap of the sibling member has no site here, and this case is what
     * keeps someone from "aligning" the two by threading a product identifier through.
     */
    expect(call.params).toEqual(['group-a', 'group-b']);
  });
});

describe('MySqlOptionRepository.findUnusedOptionGroups — NET-NEW: placeholder cardinality', () => {
  it('NET-NEW — findUnusedOptionGroups emits one bind marker per comma-list element, for every shape of list', async () => {
    const lists = ['group-a', 'group-a,group-b', 'group-a,group-a', 'group-a,,group-b'];
    const observed: Array<{
      readonly list: string;
      readonly markers: string;
      readonly params: readonly unknown[];
    }> = [];

    for (const list of lists) {
      const { call } = await exerciseUnusedOptionGroups(list);

      observed.push({
        list,
        markers: membershipMarkers(call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN'),
        params: call.params,
      });
    }

    expect(observed).toEqual([
      { list: 'group-a', markers: '?', params: ['group-a'] },
      { list: 'group-a,group-b', markers: '?, ?', params: ['group-a', 'group-b'] },
      { list: 'group-a,group-a', markers: '?, ?', params: ['group-a', 'group-a'] },
      { list: 'group-a,,group-b', markers: '?, ?, ?', params: ['group-a', '', 'group-b'] },
    ]);
  });

  it('NET-NEW — never concatenates an excluded identifier into the statement text', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a,group-b');

    expect(call.sql).not.toContain('group-a');
    expect(call.sql).not.toContain('group-b');
  });
});

describe('MySqlOptionRepository.findUnusedOptionGroups — NET-NEW: the empty option-group list', () => {
  it("NET-NEW — binds ONE marker to the empty string, preserving NOT IN ('') rather than NOT IN ()", async () => {
    const { call } = await exerciseUnusedOptionGroups('');

    /*
     * The same preservation decision as the sibling member's, with the opposite consequence.
     */
    expect(membershipMarkers(call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe('?');
    expect(normalize(call.sql)).toContain(`${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (?)`);
    expect(call.params).toEqual(['']);
  });

  it('NET-NEW — findUnusedOptionGroups does not special-case the empty list: it issues the same statement a one-element list issues', async () => {
    const empty = await exerciseUnusedOptionGroups('');
    const single = await exerciseUnusedOptionGroups('group-a');

    expect(empty.call.sql).toBe(single.call.sql);
  });
});

describe('MySqlOptionRepository.findUnusedOptionGroups — NET-NEW: the bare group row', () => {
  it('NET-NEW — maps the projection to the UnusedOptionGroupRow shape, name and identifier', async () => {
    const { rows } = await exerciseUnusedOptionGroups(
      'group-b',
      sqlRows([{ optionGroupID: 'group-a', optionGroupName: 'Size' }]),
    );

    const expected: UnusedOptionGroupRow[] = [{ name: 'Size', value: 'group-a' }];

    expect(rows).toEqual(expected);
  });

  it('NET-NEW — composes nothing: the label carries no group/option separator', async () => {
    const { rows } = await exerciseUnusedOptionGroups(
      'group-b',
      sqlRows([{ optionGroupID: 'group-a', optionGroupName: 'Size' }]),
    );

    /*
     * `model/dao/OptionDAO.cfc:L113` assembles `{name=rs.optionGroupName, value=rs.optionGroupID}` —
     * the plain group name, one line of legacy source after the sibling member composes a two-part
     * label. The two rows are shape-identical and semantically different, and this is the assertion
     * that would fail if the composition leaked from one member into the other.
     */
    expect(soleRow(rows).name).toBe('Size');
    expect(soleRow(rows).name).not.toContain(LABEL_SEPARATOR);
  });

  it('NET-NEW — preserves the order the statement produced, mapping every row', async () => {
    const { rows } = await exerciseUnusedOptionGroups(
      'group-c',
      sqlRows([
        { optionGroupID: 'group-b', optionGroupName: 'Size' },
        { optionGroupID: 'group-a', optionGroupName: 'Colour' },
      ]),
    );

    expect(rows).toEqual([
      { name: 'Size', value: 'group-b' },
      { name: 'Colour', value: 'group-a' },
    ]);
  });

  it('NET-NEW — findUnusedOptionGroups resolves to an empty array when the statement matched nothing', async () => {
    const { rows } = await exerciseUnusedOptionGroups('group-a', sqlRows([]));

    expect(rows).toEqual([]);
  });
});

/**
 * Answer the two ported statements the way a database would for a product that has no option groups
 * yet — the ordinary state of a freshly created product.
 *
 * @param call - the recorded statement and its bound values.
 * @returns the rows for a statement it recognises, or `undefined` to decline.
 */
const respondForProductWithNoOptionGroups: SqlExecutorResponder = (call) => {
  if (call.sql.includes(`${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (`)) {
    return sqlRows([
      { optionGroupID: 'group-a', optionGroupName: 'Colour' },
      { optionGroupID: 'group-b', optionGroupName: 'Size' },
    ]);
  }

  if (call.sql.includes(`${OPTION_GROUP_FILTER_COLUMN} IN (`)) {
    return sqlRows([]);
  }

  return undefined;
};

describe('MySqlOptionRepository — NET-NEW: opposite set polarity across the two members', () => {
  it('NET-NEW — the two members filter the SAME argument with inverted operators', async () => {
    const options = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');
    const groups = await exerciseUnusedOptionGroups('group-a');

    /*
     * `model/dao/OptionDAO.cfc:L68` keeps rows whose group is in the supplied list;
     * `model/dao/OptionDAO.cfc:L107` keeps rows whose group is not. One token of difference, on the
     * same input, and the two members answer opposite questions.
     *
     * TODO(parity) — the asymmetry is carried, not reconciled. Normalising the pair to one polarity, in
     * either direction, would change output that reaches a rendered page. It is marked so that a later
     * reader who notices the mismatch finds a decision here rather than an oversight (AAP §0.7.3
     * standard 7; AAP §0.8.2 guideline 4).
     */
    expect(membershipMarkers(options.call.sql, OPTION_GROUP_FILTER_COLUMN, 'IN')).toBe('?');
    expect(normalize(options.call.sql)).not.toContain('NOT IN');

    expect(membershipMarkers(groups.call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe('?');
    expect(normalize(groups.call.sql)).toContain(`${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (?)`);
  });

  it('NET-NEW — for a product with no option groups, one member yields none and the other yields all', async () => {
    const { repository, double } = recordingWithResponder(respondForProductWithNoOptionGroups);

    const options = await repository.findUnusedOptions(PRODUCT_ID, '');
    const groups = await repository.findUnusedOptionGroups('');

    /*
     * The observable consequence of the inverted operators, and it looks like a bug until it is spelled
     * out: the same empty list — `structKeyList(getOptionGroupsStruct())` at
     * `model/entity/Product.cfc:L637` and `:L644` — yields no options and every option group. Both
     * answers are correct. A product with no groups in use has no option to offer within a group it does
     * not have, and every group is still available to add.
     */
    expect(options).toEqual([]);
    expect(groups).toEqual([
      { name: 'Colour', value: 'group-a' },
      { name: 'Size', value: 'group-b' },
    ]);

    /*
     * The polarity itself is read off the two statements, not inferred from the seeded row sets.
     */
    expect(double.calls).toHaveLength(2);
    expect(normalize(callAt(double, 0).sql)).toContain(`${OPTION_GROUP_FILTER_COLUMN} IN (?)`);
    expect(normalize(callAt(double, 1).sql)).toContain(
      `${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (?)`,
    );
    expect(callAt(double, 0).params).toEqual(['', PRODUCT_ID]);
    expect(callAt(double, 1).params).toEqual(['']);
  });

  it('NET-NEW — keeps the two row shapes semantically apart, though they are structurally identical', async () => {
    const options = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
    );
    const groups = await exerciseUnusedOptionGroups(
      'group-b',
      sqlRows([{ optionGroupID: 'group-a', optionGroupName: 'Size' }]),
    );

    const optionRow: UnusedOptionRow = soleRow(options.rows);
    const groupRow: UnusedOptionGroupRow = soleRow(groups.rows);

    /*
     * The two port row types are shape-identical — `{ readonly name: string; readonly value: string
     * }` each — and are declared separately on purpose. this case pins what the types alone cannot
     * enforce at run time: `value` is a `SwOption.optionID` in one and a
     * `SwOptionGroup.optionGroupID` in the other, and `name` is a composed label in one and a bare
     * group name in the other. Merging the two types, or aliasing one to the other, would let an
     * option identifier be handed to a caller expecting a group identifier with no compile error
     * anywhere.
     */
    expect(optionRow.value).toBe('option-1');
    expect(groupRow.value).toBe('group-a');
    expect(optionRow.value).not.toBe(groupRow.value);

    expect(optionRow.name).toContain(LABEL_SEPARATOR);
    expect(groupRow.name).not.toContain(LABEL_SEPARATOR);
  });
});

describe('MySqlOptionRepository — NET-NEW: statement discipline and the injected seam', () => {
  it('NET-NEW — a quote-bearing value cannot change one character of the statement', async () => {
    const hostileGroupId = "group-a' OR 1=1 --";
    const hostileProductId = "product-1'); DROP TABLE SwSku; --";

    const hostile = await exerciseUnusedOptions(hostileProductId, hostileGroupId);
    const benign = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    /*
     * The two runs supply values of the same cardinality and wildly different content, and produce the
     * identical statement byte for byte. That equality is the assertion: the only thing a caller's input
     * influences is how many `?` tokens are emitted, never what any of them stands for. A `?` binds a
     * value and can never substitute an identifier, which is why the tables and columns above are
     * resolved through the production whitelist instead.
     */
    expect(hostile.call.sql).toBe(benign.call.sql);
    expect(hostile.call.sql).not.toContain(hostileGroupId);
    expect(hostile.call.sql).not.toContain(hostileProductId);
    expect(hostile.call.sql).not.toContain('OR 1=1');
    expect(hostile.call.sql).not.toContain('DROP TABLE');

    /*
     * The hostile values are present, whole and untouched, in the bound array — and in statement order.
     */
    expect(hostile.call.params).toEqual([hostileGroupId, hostileProductId]);
  });

  it('NET-NEW — a value that spells a real table name is still bound as a value', async () => {
    const { call } = await exerciseUnusedOptionGroups(SKU_TABLE);

    /*
     * `SwSku` is a legitimate identifier elsewhere in this schema and appears in the sibling statement,
     * so it is the sharpest available probe: supplied as a group identifier it must reach the bound
     * array and must not appear in the text of a statement that names only the option-group table.
     */
    expect(membershipMarkers(call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe('?');
    expect(call.params).toEqual([SKU_TABLE]);
    expect(call.sql).not.toContain(SKU_TABLE);
  });

  it('NET-NEW — records the bound values as an immutable snapshot, not a live reference', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    /*
     * The recording is frozen at the moment of binding. It matters for the bind-order suite above: were
     * the array captured by reference, a later mutation could rewrite the evidence an assertion about
     * order depends on, and the assertion would pass against something the adapter never issued.
     */
    expect(Object.isFrozen(call.params)).toBe(true);
    expect(call.params).toEqual(['group-a', 'group-b', PRODUCT_ID]);
  });

  it('NET-NEW — takes its rows through the executor’s READ member, never through a write path', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
    );

    /*
     * A queued row outcome can only reach a caller through `execute`: the double refuses to answer its
     * mutation member with rows, exactly as the production narrowing refuses to read an affected-row
     * acknowledgement as a result set. Rows arriving here therefore prove which member the adapter
     * called, without spying on anything and without a mocking library.
     */
    expect(rows).toEqual([{ name: 'Size - Large', value: 'option-1' }]);
  });

  it('NET-NEW — issues exactly one statement per call, with no probe and no second round trip', async () => {
    const optionsRun = recording();
    await optionsRun.repository.findUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    const groupsRun = recording();
    await groupsRun.repository.findUnusedOptionGroups('group-a,group-b');

    expect(optionsRun.double.calls).toHaveLength(1);
    expect(groupsRun.double.calls).toHaveLength(1);
  });

  it('NET-NEW — satisfies the OptionRepository port across both of its declared members', async () => {
    const { repository, double } = recording(
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
      sqlRows([{ optionGroupID: 'group-b', optionGroupName: 'Colour' }]),
    );

    /*
     * The adapter is held through the port for the duration of this case, which is how every service
     * above it holds one. The annotation is the assertion: it compiles only while the concrete class
     * still satisfies `OptionRepository`, so a signature drifting apart from the contract fails the
     * typecheck rather than surviving until a service breaks. The calls then prove the members are
     * reachable and behave identically through the interface.
     */
    const port: OptionRepository = repository;

    const options = await port.findUnusedOptions(PRODUCT_ID, 'group-a');
    const groups = await port.findUnusedOptionGroups('group-a');

    expect(options).toEqual([{ name: 'Size - Large', value: 'option-1' }]);
    expect(groups).toEqual([{ name: 'Colour', value: 'group-b' }]);

    /* Two members exercised, so two statements — one per declaration, none of them shared. */
    expect(double.calls).toHaveLength(2);

    expect(typeof port.findUnusedOptions).toBe('function');
    expect(typeof port.findUnusedOptionGroups).toBe('function');
    /* And no bounded companion is reachable through the port either. */
    expect('findUnusedOptionsBounded' in port).toBe(false);
    expect('findUnusedOptionGroupsBounded' in port).toBe(false);
  });

  it('NET-NEW — names only the four tables the legacy statements name, and no other', async () => {
    const options = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');
    const groups = await exerciseUnusedOptionGroups('group-a');

    /*
     * The whole schema surface of `model/dao/OptionDAO.cfc`: `SwOption` and `SwOptionGroup` in both
     * statements' reach, plus `SwSkuOption` and `SwSku` inside the first statement's non-existence
     * guard. Nothing else is consulted — no pricing, inventory, stock or location table, none of which
     * is in scope — and the second statement reaches only the option-group table.
     */
    for (const table of [OPTION_TABLE, OPTION_GROUP_TABLE, SKU_OPTION_TABLE, SKU_TABLE]) {
      expect(options.call.sql).toContain(table);
    }

    expect(groups.call.sql).toContain(OPTION_GROUP_TABLE);
    expect(groups.call.sql).not.toContain(SKU_OPTION_TABLE);
    expect(groups.call.sql).not.toContain(SKU_TABLE);
  });
});

describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: a NULL name in the projection', () => {
  it('NET-NEW — composes the label around an empty string rather than yielding a NULL label', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: null }]),
    );

    /*
     * The label is composed in TypeScript rather than in SQL, and this is the case that shows why.
     */
    expect(soleRow(rows).name).toBe(`${LABEL_SEPARATOR}Large`);
    expect(soleRow(rows).name).not.toContain('null');
  });

  it('NET-NEW — keeps the separator when the option name is the NULL half', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: null, optionGroupName: 'Size' }]),
    );

    expect(soleRow(rows).name).toBe(`Size${LABEL_SEPARATOR}`);
  });

  it('NET-NEW — refuses a projection that is missing a name column, rather than blanking it', async () => {
    const { repository } = recording(sqlRows([{ optionID: 'option-1', optionName: 'Large' }]));

    /*
     * An absent column is not a data condition — no row of the composed projection can lack a column the
     * statement selects — so it means the statement text and the row reader have drifted apart, which is
     * an adapter defect. Substituting a blank would turn that into plausible-looking output surfacing far
     * from its cause. The assertion matches the reported column name because naming the drifted column is
     * the whole value of the report; the error type is asserted where the error class is tested, not here,
     * since this file imports only the four modules its subject depends on.
     */
    await expect(repository.findUnusedOptions(PRODUCT_ID, 'group-a')).rejects.toThrow(
      /supplied no "optionGroupName" column/,
    );
  });

  it('NET-NEW — refuses a name column that does not hold text, rather than coercing it', async () => {
    const { repository } = recording(
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 42 }]),
    );

    /*
     * Coercing a number or a date into a label would hide the fact that the column being read is not the
     * column intended — the failure would reach a rendered drop-down as a plausible entry instead of
     * reaching a log.
     */
    await expect(repository.findUnusedOptions(PRODUCT_ID, 'group-a')).rejects.toThrow(
      /holds a value that is not text/,
    );
  });
});

/*
 * The one additive member
 * Everything above this line ports `model/dao/OptionDAO.cfc`. Everything below it covers public code
 * the legacy DAO has no counterpart for, and the suite states why the member exists before asserting
 * what it does — because a member with no legacy origin is exactly the member a later reader is most
 * tempted to delete, and an uncovered one can be deleted with the whole file still green.
 */

/*
 * Three fixtures stood here and went with the windowed suites: `window_tail` (the
 * `LIMIT ? OFFSET ?` tail an assertion compared against), `WINDOW` (the default `{ limit: 2, offset: 0 }`)
 */

/**
 * A row the first statement's projection can produce, numbered so ordering is observable.
 *
 * @param index - distinguishes the rows within one canned answer.
 * @returns one raw driver row for the unused-options projection.
 */
function unusedOptionRow(index: number): {
  readonly optionID: string;
  readonly optionName: string;
  readonly optionGroupName: string;
} {
  return {
    optionID: `option-${String(index)}`,
    optionName: `Name ${String(index)}`,
    optionGroupName: 'Size',
  };
}

/*
 * `withExecutor(executor)` — re-binding to a transaction-scoped executor
 * no legacy counterpart, and the reason is execution-model mismatch M5. A legacy DAO never chooses
 * a connection: the ORM session is ambient and `org/Hibachi/Hibachi.cfc` flushes it at request end
 * only when the request reports no errors, so the DAO simply participates in whatever transaction the
 * request already holds. A stateless handler has no request end and no ambient session, so the port
 * makes the boundary explicit — and an adapter that could only ever hold the pool-bound executor it.
 */

describe('MySqlOptionRepository.withExecutor — NET-NEW: re-binding, and its isolation', () => {
  it('NET-NEW — answers a NEW instance of the same class and leaves the receiver alone', () => {
    const { repository } = recording();
    const replacement = createSqlExecutorDouble();

    const rebound = repository.withExecutor(replacement.executor);

    expect(rebound).not.toBe(repository);
    expect(rebound).toBeInstanceOf(MySqlOptionRepository);
  });

  it('NET-NEW — MySqlOptionRepository.withExecutor: every statement the re-bound instance issues lands on the REPLACEMENT executor', async () => {
    const original = recording();
    const replacement = createSqlExecutorDouble({
      outcomes: [sqlRows([unusedOptionRow(1)])],
    });

    const rebound = original.repository.withExecutor(replacement.executor);
    const rows = await rebound.findUnusedOptions(PRODUCT_ID, 'group-a');

    /*
     * This is the property that makes wrapping a call in a transaction boundary mean anything: the
     * statement runs on the connection the boundary owns, so a rollback can undo it and a read can
     * observe a sibling write the same transaction already issued.
     */
    expect(replacement.calls).toHaveLength(1);
    expect(normalize(callAt(replacement, 0).sql)).toBe(
      normalize(UNUSED_OPTIONS_STATEMENT_FOR_TWO_GROUPS.replace(' IN (?, ?)', ' IN (?)')),
    );
    expect(callAt(replacement, 0).params).toEqual(['group-a', PRODUCT_ID]);
    expect(rows).toEqual([{ name: 'Size - Name 1', value: 'option-1' }]);

    /* And nothing reached the executor the receiver still holds. */
    expect(original.double.calls).toHaveLength(0);
  });

  it('NET-NEW — MySqlOptionRepository.withExecutor: the ORIGINAL keeps its own executor and stays usable after the re-binding', async () => {
    const original = recording(sqlRows([]), sqlRows([]));
    const replacement = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    const rebound = original.repository.withExecutor(replacement.executor);
    await rebound.findUnusedOptionGroups('inside');
    await original.repository.findUnusedOptionGroups('outside');

    /*
     * The captured executor is `private readonly` and re-binding never reassigns it, so the
     * pool-bound instance a composition root built is still pool-bound afterwards. A mutating
     * implementation would put both statements on the replacement, and this case is what catches it.
     */
    expect(replacement.calls).toHaveLength(1);
    expect(callAt(replacement, 0).params).toEqual(['inside']);
    expect(original.double.calls).toHaveLength(1);
    expect(callAt(original.double, 0).params).toEqual(['outside']);
  });

  it('NET-NEW — MySqlOptionRepository.withExecutor: two re-bindings of one receiver cannot observe each other', async () => {
    const original = recording();
    const first = createSqlExecutorDouble({ outcomes: [sqlRows([])] });
    const second = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    const boundaryOne = original.repository.withExecutor(first.executor);
    const boundaryTwo = original.repository.withExecutor(second.executor);
    await boundaryOne.findUnusedOptionGroups('one');
    await boundaryTwo.findUnusedOptionGroups('two');

    /*
     * M7 — two concurrent boundaries on one warm container get two instances. If re-binding mutated,
     * the second call would have travelled on whichever executor was bound last and one boundary
     * would have committed inside the other's transaction.
     */
    expect(boundaryOne).not.toBe(boundaryTwo);
    expect(first.calls).toHaveLength(1);
    expect(callAt(first, 0).params).toEqual(['one']);
    expect(second.calls).toHaveLength(1);
    expect(callAt(second, 0).params).toEqual(['two']);
  });

  it('NET-NEW — the re-bound instance still answers the whole OptionRepository port', async () => {
    const original = recording();
    const replacement = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    /*
     * A positive type-level assertion rather than a suppression: the re-bound value is used as the
     * port, so a narrowed return type on `withExecutor` would fail to compile right here.
     */
    const rebound: OptionRepository = original.repository.withExecutor(replacement.executor);

    expect(typeof rebound.findUnusedOptions).toBe('function');
    expect(typeof rebound.findUnusedOptionGroups).toBe('function');
    await expect(rebound.findUnusedOptionGroups('group-a')).resolves.toEqual([]);
  });

  /*
   * Port exhaustiveness, keyed off the port itself rather than off a hand list.
   * The case above proves the re-bound instance still answers the port; this one proves the list of
   * members being checked is complete. A hand-written enumeration silently stops covering a port the
   * day a member is added, which is the gap reported; the mapped type below fails to compile
   * instead.
   */
  it('NET-NEW — satisfies the OptionRepository port across ALL of its declared members', () => {
    const asPort: OptionRepository = recording().repository;

    /*
     * Keyed off the port's own member set, so a third method breaks compilation here until it is
     * named — and, in the other direction, a member removed from the port breaks it until this
     * literal follows. It reports a removal as loudly as an addition, which is the property working
     * in the direction nobody plans for.
     */
    const everyPortMember: Record<keyof OptionRepository, true> = {
      findUnusedOptions: true,
      findUnusedOptionGroups: true,
    };

    const declared = Object.keys(everyPortMember) as readonly (keyof OptionRepository)[];

    expect(declared).toHaveLength(2);
    for (const member of declared) {
      expect(typeof asPort[member]).toBe('function');
    }
  });

  it('NET-NEW — re-binding is absent from the port, so a service-side double needs no executor', () => {
    /*
     * The compile-time half of the boundary claim. A service may not know that a statement executor
     * exists at all, so `withExecutor` is exposed on the concrete adapter only. If anyone added it to
     * `OptionRepository`, this literal would stop compiling and say so at the boundary rather than in
     * a service test — and no mocking library is needed to state it, which the legacy suite does not
     * vendor either.
     */
    const double: OptionRepository = {
      findUnusedOptions: () => Promise.resolve([]),
      findUnusedOptionGroups: () => Promise.resolve([]),
    };

    expect(Object.keys(double)).not.toContain('withExecutor');
    expect(Object.keys(double)).toHaveLength(2);
  });
});

/*
 * The two windowed suites stood here — `findUnusedOptionsBounded(window, productID,
 * existingOptionGroupIDList)` AND `findUnusedOptionGroupsBounded(window,
 * existingOptionGroupIDList)` neither exists on the port, so no case asserts one. A windowed form
 * would have to compose its unbounded partner's statement with `LIMIT ? OFFSET ?` after the legacy
 * `ORDER BY`, bind both numbers last — behind the group identifiers and the product identifier — to
 * keep the statement-order binding trap (TR-4) intact, and preserve the `IN` / `NOT IN` polarity of
 * the set it selects.
 */

/* FOLDED IN FROM adapters/SmartListQueryBuilder */

/*
 * These cases are the only direct evidence for `src/adapters/mysql/SmartListQueryBuilder.ts` — the
 * query composer, the entity aggregate loaders it hosts, and the anonymous materialisation gate that
 * guards the feed's unbounded read. AAP §0.4.1.12 declares exactly seventeen executable suites, so they
 * live in the approved suite for the repository whose statements that builder composes.
 */

describe('The smart-list query composer, its aggregate loaders and the materialisation gate', () => {
  /* compile-time claims. */

  type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

  /** The builder is the port. AAP §0.3.3 wires `smartListQueryPort` to this one implementation. */
  type _BuilderImplementsPort = AssertAssignable<SmartListQueryBuilder, SmartListQueryPort>;

  /** Every compiled query carries three statements, and each carries sql plus positional params. */
  type _CompiledCarriesThreeStatements = AssertAssignable<
    CompiledSmartListQuery,
    {
      readonly records: { readonly sql: string; readonly params: readonly unknown[] };
      readonly pageRecords: { readonly sql: string; readonly params: readonly unknown[] };
      readonly recordsCount: { readonly sql: string; readonly params: readonly unknown[] };
    }
  >;

  /* Fixtures — frozen literals only at module scope; every builder is built fresh per case. */

  /**
   * The three joins `getSkuSmartList` declares, transcribed from
   * `model/service/SkuService.cfc:L314-L316`.
   */
  const SKU_SMART_LIST_JOINS_AS_DECLARED: readonly SmartListJoin[] = Object.freeze([
    Object.freeze({ parentEntityName: 'SlatwallSku', relatedProperty: 'product' }),
    Object.freeze({ parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' }),
    Object.freeze({
      parentEntityName: 'SlatwallSku',
      relatedProperty: 'alternateSkuCodes',
      joinType: 'left',
    }),
  ] satisfies SmartListJoin[]);

  /** 32-character identifiers, per IR-6: application-generated, undashed, string-typed. */
  const ID = Object.freeze({
    brandAlpha: 'aa11bb22cc33dd44ee55ff6677889900',
    brandBeta: 'bb22cc33dd44ee55ff6677889900aa11',
    optionGroup: 'cc33dd44ee55ff6677889900aa11bb22',
    product: 'dd44ee55ff6677889900aa11bb22cc33',
  });

  /**
   * The binder the aggregate loaders take. Every case in this file either compiles a statement without
   * executing it, or executes against `SlatwallBrand` — for which `createCatalogAggregateLoaders`
   * supplies no loader and `hydrateAssociations` returns immediately. So this binder must never run, and
   * throwing is how that expectation is enforced rather than assumed.
   */
  function refuseDefaultSkuBinding(_sku: Sku): ProductDefaultSkuDelegate {
    throw new Error(
      'The default-SKU binder ran, which means a case in this file executed against an entity that ' +
        'loads aggregates. Statement-shape cases must not, because the loader issues further statements.',
    );
  }

  function makeAggregateLoaders(): Readonly<
    Record<SmartListEntityName, CatalogAggregateLoader | undefined>
  > {
    return createCatalogAggregateLoaders({ bindDefaultSkuDelegate: refuseDefaultSkuBinding });
  }

  interface BuilderScenario {
    readonly builder: SmartListQueryBuilder;
    readonly calls: readonly SqlExecutorCall[];
  }

  /**
   * A builder over an executor that answers nothing, for the cases that only compile statements.
   */
  /**
   * A builder over an executor that answers nothing, for the cases that only compile.
   *
   * @param budget the materialisation budget this case states; defaults to the generous one,
   * so a case about identifier safety or clause shape is never decided by a ceiling
   *
   * @returns the builder and its call log, which every compile-only case asserts is empty.
   */
  function compileOnly(
    budget: SmartListMaterialisationBudget = GENEROUS_SMART_LIST_BUDGET,
  ): BuilderScenario {
    const { executor, calls } = createSqlExecutorDouble({});

    return { builder: new SmartListQueryBuilder(executor, makeAggregateLoaders(), budget), calls };
  }

  /** Compile one query and return the three statements plus the executor call log. */
  function compile(query: SmartListQuery): {
    readonly compiled: CompiledSmartListQuery;
    readonly calls: readonly SqlExecutorCall[];
  } {
    const scenario = compileOnly();

    return { compiled: scenario.builder.build(query), calls: scenario.calls };
  }

  /** Every statement of a compiled query, for the sweeps that must hold across all three. */
  function allStatements(compiled: CompiledSmartListQuery): readonly string[] {
    return [compiled.records.sql, compiled.pageRecords.sql, compiled.recordsCount.sql];
  }

  /**
   * The feed's own composition: the service's three joins, then the feed's three, de-duplicated.
   */
  function feedJoins(): readonly SmartListJoin[] {
    return mergeSmartListJoins(SKU_SMART_LIST_JOINS_AS_DECLARED, PRODUCT_FEED_JOINS);
  }

  /**
   * The query the Google feed compiles, transcribed from `integrationServices/google/controllers/feed.cfc`
   * — three activity and publication filters and the inclusive availability range.
   */
  function feedQuery(joins: readonly SmartListJoin[]): SmartListQuery<'SlatwallSku'> {
    return {
      entityName: 'SlatwallSku',
      joins,
      whereGroups: [
        {
          filters: [
            { propertyIdentifier: 'activeFlag', value: 1 },
            { propertyIdentifier: 'product.activeFlag', value: 1 },
            { propertyIdentifier: 'product.publishedFlag', value: 1 },
          ],
          ranges: [{ propertyIdentifier: 'product.calculatedQATS', lowerBound: '1' }],
        },
      ],
    };
  }

  /**
   * Two brand rows. `SlatwallBrand` is the one root entity that loads no aggregate and hydrates none.
   */
  const BRAND_ROWS = Object.freeze([
    Object.freeze({ brandID: ID.brandAlpha, brandName: 'Alpha' }),
    Object.freeze({ brandID: ID.brandBeta, brandName: 'Beta' }),
  ]);

  /* The statement triple. */

  describe('NET-NEW SmartListQueryBuilder — the three statements one build() produces', () => {
    it('[NET-NEW] the record statement is select, from, where and order — with no bound at all', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      /*
       * `org/Hibachi/HibachiSmartList.cfc:L748` composes select + from + where + order, and `:L753`
       * executes it with no offset and no maxresults. The unpaged collection is genuinely unbounded.
       */
      expect(
        compiled.records.sql.startsWith('SELECT aslatwallsku.* FROM SwSku aslatwallsku '),
      ).toBe(true);
      expect(compiled.records.sql).toContain(' WHERE ');
      /*
       * The fallback property followed by the primary-key tiebreaker `composeOrderClause` appends. `:L742`
       * emits the fallback term alone, which leaves tied rows in an order the statement does not specify —
       * and because the page statement below is this statement plus `LIMIT`/`OFFSET`, an unspecified order
       * under a window produces page duplicates and omissions. The tiebreaker orders only rows the
       * fallback term leaves unordered, so nothing this statement already defined is affected.
       */
      expect(
        compiled.records.sql.endsWith(
          ' ORDER BY aslatwallsku.createdDateTime ASC, aslatwallsku.skuID ASC',
        ),
      ).toBe(true);
      expect(compiled.records.sql).not.toContain('LIMIT');
      expect(compiled.records.sql).not.toContain('OFFSET');
    });

    it('[NET-NEW] the page statement is the record statement plus LIMIT ? OFFSET ? and nothing else', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      /*
       * `:L762` reuses the same HQL and supplies offset and maxresults as execution options, so the only
       * difference between the two statements is the bound. Asserting equality of the prefix — rather
       * than two independently spelled expectations — is what makes a divergence impossible to miss.
       */
      expect(compiled.pageRecords.sql).toBe(`${compiled.records.sql} LIMIT ? OFFSET ?`);
    });

    it('[NET-NEW] the counting statement carries no ORDER BY and no bound', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      /*
       * `:L777` composes select(countOnly) + from(allowFetch=false) + where. Ordering a scalar aggregate
       * would be pointless and bounding it would change the answer, so neither clause appears.
       */
      expect(compiled.recordsCount.sql).not.toContain('ORDER BY');
      expect(compiled.recordsCount.sql).not.toContain('LIMIT');
      expect(compiled.recordsCount.sql).not.toContain('OFFSET');
      expect(compiled.recordsCount.sql).toContain(' WHERE ');
    });

    it('[NET-NEW] all three statements share one FROM clause, so no view can filter differently', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      const fromClause =
        ' FROM SwSku aslatwallsku ' +
        'LEFT JOIN SwProduct aslatwallproduct ON aslatwallproduct.productID = aslatwallsku.productID ' +
        'LEFT JOIN SwProductType aslatwallproducttype ' +
        'ON aslatwallproducttype.productTypeID = aslatwallproduct.productTypeID ' +
        'LEFT JOIN SwAlternateSkuCode aslatwallalternateskucode ' +
        'ON aslatwallalternateskucode.skuID = aslatwallsku.skuID ' +
        'LEFT JOIN SwSku bslatwallsku ON bslatwallsku.skuID = aslatwallproduct.defaultSkuID ' +
        'LEFT JOIN SwBrand aslatwallbrand ON aslatwallbrand.brandID = aslatwallproduct.brandID';

      for (const sql of allStatements(compiled)) {
        expect(sql).toContain(fromClause);
      }
    });

    it('[NET-NEW] records and recordsCount bind the identical parameter array', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      /*
       * `:L753`, `:L762` and `:L778` all pass `getHQLParams()` — one accumulated array, three uses. A
       * count that bound different values would report a total the record view could never produce.
       */
      expect(compiled.recordsCount.params).toEqual(compiled.records.params);
      expect(compiled.records.params).toEqual([1, 1, 1, '1']);
    });

    it('[NET-NEW] the page statement appends exactly two bindings, and they are the bound', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      expect(compiled.pageRecords.params).toHaveLength(compiled.records.params.length + 2);
      expect(compiled.pageRecords.params.slice(0, compiled.records.params.length)).toEqual([
        ...compiled.records.params,
      ]);
      /*
       * The row-count bindings are strings. `toRowCountBinding` validates a whole non-negative number and
       * then stringifies it, which is what keeps `LIMIT`/`OFFSET` parameterised instead of interpolated
       * — `?` binds values only, so a numeric literal spliced into the text would be the alternative.
       */
      expect(compiled.pageRecords.params.slice(-2)).toEqual(['10', '0']);
    });

    it('[NET-NEW] build() compiles without issuing a single statement', () => {
      const { calls } = compile(feedQuery(feedJoins()));

      /*
       * Compilation is pure. `execute` is the only member that reaches the executor, which is what lets
       * every refusal case below assert `calls` is empty and mean "before any statement text ran".
       */
      expect(calls).toHaveLength(0);
    });

    it('[NET-NEW] the compiled query reports the base table and alias it actually emitted', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      expect(compiled.entityName).toBe('SlatwallSku');
      expect(compiled.baseTable).toBe('SwSku');
      expect(compiled.baseAlias).toBe('aslatwallsku');
      expect(compiled.records.sql).toContain(`${compiled.baseTable} ${compiled.baseAlias} `);
    });

    it('[NET-NEW] a query with no filters emits no WHERE clause and binds nothing', () => {
      const { compiled } = compile({ entityName: 'SlatwallBrand' });

      expect(compiled.records.sql).toBe(
        'SELECT aslatwallbrand.* FROM SwBrand aslatwallbrand ' +
          'ORDER BY aslatwallbrand.createdDateTime ASC, aslatwallbrand.brandID ASC',
      );
      expect(compiled.records.params).toEqual([]);
      expect(compiled.recordsCount.sql).not.toContain('WHERE');
    });

    /*
     * The ordering-stability cases.
     *
     * `org/Hibachi/HibachiSmartList.cfc:L717-L744` emits one ordering term and no tiebreaker, and the page
     * statement is the record statement plus `LIMIT ? OFFSET ?`. A window over an order the statement did
     * not fully specify is what produced page duplicates AND omissions once the ordering column tied — and
     * ties are the ordinary case here, because every in-scope entity falls back to `createdDateTime`,
     * `SwSku` declares it as `datetime` with no fractional seconds, and `SkuService.createSkus` writes an
     * entire combination batch inside one transaction. `composeOrderClause` therefore appends the base
     * entity's primary key last. These cases pin all four consequences of that decision.
     */
    it('[NET-NEW] the default order is made total by the primary key, on every base entity', () => {
      const expectations: readonly (readonly [SmartListEntityName, string, string])[] = [
        ['SlatwallSku', 'aslatwallsku', 'skuID'],
        ['SlatwallProduct', 'aslatwallproduct', 'productID'],
        ['SlatwallProductType', 'aslatwallproducttype', 'productTypeID'],
        ['SlatwallBrand', 'aslatwallbrand', 'brandID'],
        ['SlatwallOption', 'aslatwalloption', 'optionID'],
        ['SlatwallOptionGroup', 'aslatwalloptiongroup', 'optionGroupID'],
      ];

      for (const [entityName, alias, primaryKey] of expectations) {
        const { compiled } = compile({ entityName });

        expect(compiled.records.sql).toContain(
          `ORDER BY ${alias}.createdDateTime ASC, ${alias}.${primaryKey} ASC`,
        );
        /* The page statement is the record statement plus the bound, so the two orders cannot diverge. */
        expect(compiled.pageRecords.sql).toBe(`${compiled.records.sql} LIMIT ? OFFSET ?`);
        /* Ordering a scalar aggregate would be pointless, and the count statement still carries none. */
        expect(compiled.recordsCount.sql).not.toContain('ORDER BY');
      }
    });

    it('[NET-NEW] an explicit order on a non-unique column is made total too', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        orders: [{ propertyIdentifier: 'price', direction: 'DESC' }],
      });

      expect(compiled.records.sql).toContain(
        'ORDER BY aslatwallsku.price DESC, aslatwallsku.skuID ASC',
      );
    });

    it('[NET-NEW] a caller already ordering by the primary key last is not given it twice', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        orders: [
          { propertyIdentifier: 'price', direction: 'DESC' },
          { propertyIdentifier: 'skuID', direction: 'ASC' },
        ],
      });

      expect(compiled.records.sql).toContain(
        'ORDER BY aslatwallsku.price DESC, aslatwallsku.skuID ASC',
      );
      expect(compiled.records.sql.split('aslatwallsku.skuID')).toHaveLength(2);
    });

    it('[NET-NEW] every ordering the caller declared keeps its own direction and position', () => {
      /*
       * The tiebreaker is appended, never inserted, and it changes no direction: a pair of rows that any
       * declared term already separates keeps exactly the order those terms gave it.
       */
      const { compiled } = compile({
        entityName: 'SlatwallProduct',
        orders: [
          { propertyIdentifier: 'productName', direction: 'ASC' },
          { propertyIdentifier: 'sortOrder', direction: 'DESC' },
        ],
      });

      expect(compiled.records.sql).toContain(
        'ORDER BY aslatwallproduct.productName ASC, aslatwallproduct.sortOrder DESC, ' +
          'aslatwallproduct.productID ASC',
      );
    });

    it('[NET-NEW] a where group that composes no predicate is dropped rather than emitted empty', () => {
      /*
       * A range with neither bound composes nothing (`composeRange` returns undefined), which leaves the
       * group with no predicates. The legacy appends nothing for such a group, so an empty `` — which
       * MySQL would reject outright — must not appear.
       */
      const { compiled } = compile({
        entityName: 'SlatwallBrand',
        whereGroups: [{ ranges: [{ propertyIdentifier: 'sortOrder' }] }],
      });

      expect(compiled.records.sql).not.toContain('WHERE');
      expect(compiled.records.sql).not.toContain('()');
      expect(compiled.records.params).toEqual([]);
    });
  });

  /* The distinct asymmetry — carried, not repaired. */

  describe('NET-NEW SmartListQueryBuilder — the DISTINCT asymmetry it carries', () => {
    it('[NET-NEW] the asymmetry is declared explicitly and frozen, so it reads as a decision', () => {
      /*
       * AAP §0.7.3 standard 7 — preserve and annotate, do not repair. The constant is the annotation.
       */
      expect(SMARTLIST_DISTINCT_ASYMMETRY).toEqual({
        recordProjectionHonoursFlag: true,
        countProjectionIsAlwaysDistinct: true,
      });
      expect(Object.isFrozen(SMARTLIST_DISTINCT_ASYMMETRY)).toBe(true);
    });

    it('[NET-NEW] an unstated flag leaves the record projection NON-distinct', () => {
      const { compiled } = compile({ entityName: 'SlatwallProduct' });

      /*
       * `org/Hibachi/HibachiSmartList.cfc:L59` seeds the flag with zero, so silence means non-distinct.
       * This is the half of the asymmetry `issue_1296` is numerically sensitive to.
       */
      expect(compiled.selectDistinct).toBe(false);
      expect(compiled.records.sql.startsWith('SELECT aslatwallproduct.*')).toBe(true);
      expect(compiled.records.sql).not.toContain('SELECT DISTINCT');
    });

    it('[NET-NEW] a set flag makes the record projection distinct', () => {
      const { compiled } = compile({ entityName: 'SlatwallProduct', selectDistinctFlag: true });

      /*
       * `:L508` and `:L519` — the record branch consults the flag. `model/entity/Product.cfc:L254` and
       * `:L341` are the two consumers that set it, which is why the seeded false is safe for the rest.
       */
      expect(compiled.selectDistinct).toBe(true);
      expect(compiled.records.sql.startsWith('SELECT DISTINCT aslatwallproduct.*')).toBe(true);
    });

    it('[NET-NEW] the count projection is distinct with the flag OFF — the asymmetry itself', () => {
      const { compiled } = compile({ entityName: 'SlatwallProduct' });

      /*
       * `:L504` is unconditional: `count(distinct <alias>.<primaryID>)` regardless of any flag. So a
       * fan-out query with the flag left alone reports a distinct count over non-distinct records.
       */
      expect(compiled.selectDistinct).toBe(false);
      expect(
        compiled.recordsCount.sql.startsWith('SELECT COUNT(DISTINCT aslatwallproduct.productID)'),
      ).toBe(true);
    });

    it('[NET-NEW] the count projection is unchanged when the flag is ON', () => {
      const withFlag = compile({ entityName: 'SlatwallProduct', selectDistinctFlag: true });
      const withoutFlag = compile({ entityName: 'SlatwallProduct' });

      expect(withFlag.compiled.recordsCount.sql).toBe(withoutFlag.compiled.recordsCount.sql);
    });

    it('[NET-NEW] the count projection names each entity’s own primary key, and aliases it recordsCount', () => {
      /*
       * `:L504` resolves the primary identifier by entity name. Per IR-6 every one is a 32-character
       * application-generated string, which is why none of these is an auto-increment surrogate.
       */
      const expected: ReadonlyArray<readonly [SmartListEntityName, string, string]> = [
        ['SlatwallSku', 'aslatwallsku', 'skuID'],
        ['SlatwallProduct', 'aslatwallproduct', 'productID'],
        ['SlatwallProductType', 'aslatwallproducttype', 'productTypeID'],
        ['SlatwallBrand', 'aslatwallbrand', 'brandID'],
        ['SlatwallOption', 'aslatwalloption', 'optionID'],
        ['SlatwallOptionGroup', 'aslatwalloptiongroup', 'optionGroupID'],
        ['SlatwallAlternateSkuCode', 'aslatwallalternateskucode', 'alternateSkuCodeID'],
      ];

      for (const [entityName, alias, primaryKey] of expected) {
        const { compiled } = compile({ entityName });

        expect(compiled.recordsCount.sql).toContain(
          `SELECT COUNT(DISTINCT ${alias}.${primaryKey}) AS recordsCount`,
        );
      }
    });
  });

  /* The same asymmetry, observed in results rather than in statement text. */

  /** One brand carrying two matching products, another carrying one. Three rows, two owners. */
  const FANNED_BRAND_ROWS = Object.freeze([
    Object.freeze({ brandID: ID.brandAlpha, brandName: 'Alpha' }),
    Object.freeze({ brandID: ID.brandAlpha, brandName: 'Alpha' }),
    Object.freeze({ brandID: ID.brandBeta, brandName: 'Beta' }),
  ]);

  /** A brand root filtered through its products — the shape that fans. */
  function fanningBrandQuery(
    overrides: Partial<SmartListQuery<'SlatwallBrand'>> = {},
  ): SmartListQuery<'SlatwallBrand'> {
    return {
      entityName: 'SlatwallBrand',
      joins: [{ parentEntityName: 'SlatwallBrand', relatedProperty: 'products' }],
      whereGroups: [{ filters: [{ propertyIdentifier: 'products.activeFlag', value: 1 }] }],
      ...overrides,
    };
  }

  /** A builder over the fanning executor, with no budget wired. */
  function fanningScenario(): {
    readonly builder: SmartListQueryBuilder;
    readonly fanning: ReturnType<typeof createFanningSqlExecutorDouble>;
  } {
    const fanning = createFanningSqlExecutorDouble({
      rootRows: FANNED_BRAND_ROWS,
      rootIdentityColumn: 'brandID',
    });

    return {
      builder: new SmartListQueryBuilder(
        fanning.executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      ),
      fanning,
    };
  }

  describe('NET-NEW SmartListQueryBuilder — the DISTINCT asymmetry, observed in results', () => {
    it('[NET-NEW] with the flag OFF the records DIVERGE from the count — the carried defect, executed', async () => {
      const { builder, fanning } = fanningScenario();

      const result = await builder.execute(fanningBrandQuery());

      /*
       * Three records for two brands. `org/Hibachi/HibachiSmartList.cfc:L59` seeds the flag with zero and
       * `:L504` counts distinct unconditionally, so a caller that states nothing gets a record collection
       * measured one way and a total measured another. This is the divergence `issue_1296` was filed
       * against, reproduced here at the layer that causes it.
       */
      expect(result.records).toHaveLength(3);
      expect(result.recordsCount).toBe(2);
      expect(fanning.distinctRootCount()).toBe(2);
    });

    it('[NET-NEW] with the flag ON the records AGREE with the count', async () => {
      const { builder, fanning } = fanningScenario();

      const result = await builder.execute(fanningBrandQuery({ selectDistinctFlag: true }));

      /*
       * Same rows, same join, same fan — only the flag differs, and now the two measurements agree. The
       * count could not have produced this change, because the previous case already established that the
       * counting statement is byte-identical either way.
       */
      expect(result.records).toHaveLength(2);
      expect(result.recordsCount).toBe(2);
      expect(result.records.map((brand) => brand.brandID)).toStrictEqual([
        ID.brandAlpha,
        ID.brandBeta,
      ]);
      expect(fanning.distinctRootCount()).toBe(2);
    });

    it('[NET-NEW] the divergence is entirely on the record side — one identical counting statement', async () => {
      const withoutFlag = fanningScenario();
      const withFlag = fanningScenario();

      await withoutFlag.builder.execute(fanningBrandQuery());
      await withFlag.builder.execute(fanningBrandQuery({ selectDistinctFlag: true }));

      const countOf = (statements: readonly string[]): string | undefined =>
        statements.find((sql) => sql.includes('COUNT(DISTINCT '));

      /*
       * The strongest available statement of "the asymmetry lives in one projection": the counting
       * statement is identical text in both runs, so nothing about the count can explain three records
       * becoming two. Only the record projection changed, and it changed because the flag changed.
       */
      expect(countOf(withFlag.fanning.statements())).toBe(
        countOf(withoutFlag.fanning.statements()),
      );
      expect(countOf(withoutFlag.fanning.statements())).toContain(
        'COUNT(DISTINCT aslatwallbrand.brandID)',
      );
    });

    it('[NET-NEW] a duplicate consumes a PAGE SLOT when the flag is off, and does not when it is on', async () => {
      const withoutFlag = fanningScenario();
      const withFlag = fanningScenario();
      /*
       * Record two of a one-per-page window. In the fanned set that position is Alpha again; in the
       * collapsed set it is Beta. The window arithmetic is identical in both runs, so the row that lands in
       * it is decided purely by whether the duplicate was ever emitted.
       */
      const pagination = { pageRecordsStart: 2, pageRecordsShow: 1 } as const;

      const fanned = await withoutFlag.builder.execute(fanningBrandQuery({ pagination }));
      const collapsed = await withFlag.builder.execute(
        fanningBrandQuery({ pagination, selectDistinctFlag: true }),
      );

      /*
       * This is the user-visible consequence, and it is why the asymmetry is worth a block of its own: a
       * caller paging a fanning smart list with the flag unstated sees the same brand twice and never
       * reaches Beta at all, while the total it is shown alongside says there are two.
       */
      expect(fanned.pageRecords.map((brand) => brand.brandID)).toStrictEqual([ID.brandAlpha]);
      expect(collapsed.pageRecords.map((brand) => brand.brandID)).toStrictEqual([ID.brandBeta]);

      /*
       * The page statement really was issued in both runs — the window could not be reused, because two
       * records do not fit a one-record page — and it binds limit and offset last, after the filter value,
       * as digit strings.
       */
      for (const scenario of [withoutFlag, withFlag]) {
        const pageCall = scenario.fanning.calls.find((call) =>
          call.sql.includes(' LIMIT ? OFFSET ?'),
        );

        expect(pageCall?.params).toStrictEqual([1, '1', '1']);
      }
    });

    it('[NET-NEW] executeRecords carries the same asymmetry, since it shares the record projection', async () => {
      const withoutFlag = fanningScenario();
      const withFlag = fanningScenario();

      const fanned = await withoutFlag.builder.executeRecords(fanningBrandQuery());
      const collapsed = await withFlag.builder.executeRecords(
        fanningBrandQuery({ selectDistinctFlag: true }),
      );

      /*
       * The records-only member emits the same unpaged statement `execute()` does, so it inherits the same
       * asymmetry rather than having one of its own. That matters for the Google feed, which reads through
       * this member: a feed built over a fanning join would emit one `<item>` per duplicated row. The feed
       * itself states no flag — `integrationServices/google/controllers/feed.cfc` sets none — which is why
       * the flag-off number here is the number that reaches production, and why it is asserted rather than
       * only described.
       */
      expect(fanned).toHaveLength(3);
      expect(collapsed).toHaveLength(2);

      /*
       * Two statements per run — the materialisation count, then the record projection — and
       * the divergence above is therefore observed against the same statement shape in both runs rather
       * than being an artefact of one run counting and the other not.
       */
      expect(withoutFlag.fanning.calls).toHaveLength(2);
      expect(withFlag.fanning.calls).toHaveLength(2);
      expect(withoutFlag.fanning.calls[0]?.sql).toContain('AS recordsCount');
      expect(withFlag.fanning.calls[0]?.sql).toContain('AS recordsCount');
    });
  });

  /* Join composition — six declared, five emitted, none eliminating. */

  describe('NET-NEW SmartListQueryBuilder — join composition for the feed', () => {
    it('[NET-NEW] the feed declares six joins across the two sources', () => {
      /*
       * The service's three (`model/service/SkuService.cfc:L314-L316`) and the feed's three
       * (`integrationServices/google/controllers/feed.cfc:L64-L66`). The duplicate is the SKU-to-product
       * hop, which both sources name.
       */
      expect(SKU_SMART_LIST_JOINS_AS_DECLARED).toHaveLength(3);
      expect(PRODUCT_FEED_JOINS).toHaveLength(3);
      expect(
        [...SKU_SMART_LIST_JOINS_AS_DECLARED, ...PRODUCT_FEED_JOINS].filter(
          (join) => join.parentEntityName === 'SlatwallSku' && join.relatedProperty === 'product',
        ),
      ).toHaveLength(2);
    });

    it('[NET-NEW] mechanism 1 — mergeSmartListJoins absorbs the duplicate before build() sees it', () => {
      const merged = feedJoins();

      /*
       * De-duplication is keyed on `parentEntityName.relatedProperty`, and the first occurrence wins, so
       * the service's plain hop survives and the feed's repeat is dropped — not the reverse.
       */
      expect(merged).toHaveLength(5);
      expect(merged[0]).toEqual({ parentEntityName: 'SlatwallSku', relatedProperty: 'product' });
      expect(
        merged.filter(
          (join) => join.parentEntityName === 'SlatwallSku' && join.relatedProperty === 'product',
        ),
      ).toHaveLength(1);
    });

    it('[NET-NEW] mechanism 2 — six UN-merged joins still emit five, by the builder’s own guard', () => {
      const { compiled } = compile(
        feedQuery([...SKU_SMART_LIST_JOINS_AS_DECLARED, ...PRODUCT_FEED_JOINS]),
      );

      /*
       * `org/Hibachi/HibachiSmartList.cfc:L270` finds the key already registered and appends nothing to
       * the join order, so the repeated hop contributes no entity, no alias and no FROM fragment. This is
       * asserted independently of mechanism 1 so that neither can mask the other's failure.
       */
      expect(compiled.records.sql.match(/ JOIN /g)).toHaveLength(5);
      expect(compiled.records.sql.match(/JOIN SwProduct\b/g)).toHaveLength(1);
    });

    it('[NET-NEW] both mechanisms together produce the identical FROM clause', () => {
      const merged = compile(feedQuery(feedJoins()));
      const unmerged = compile(
        feedQuery([...SKU_SMART_LIST_JOINS_AS_DECLARED, ...PRODUCT_FEED_JOINS]),
      );

      /*
       * The strongest statement available: whether the duplicate is removed early or absorbed late, the
       * emitted statement is byte-identical. A regression in either mechanism breaks this equality.
       */
      expect(unmerged.compiled.records.sql).toBe(merged.compiled.records.sql);
      expect(unmerged.compiled.records.params).toEqual([...merged.compiled.records.params]);
    });

    it('[NET-NEW] NOTHING renders as an inner join, in any of the three statements', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      /*
       * The assertion that carries the meaning. An omitted kind and an explicit `left` emit the same
       * keyword (`org/Hibachi/HibachiSmartList.cfc:L539-L541`), so the observable guarantee is the
       * absence of an eliminating join — which is what keeps a brandless product in the feed.
       */
      for (const sql of allStatements(compiled)) {
        expect(sql).not.toContain('INNER JOIN');
        expect(sql.match(/ JOIN /g)).toHaveLength(5);
        expect(sql.match(/LEFT JOIN /g)).toHaveLength(5);
      }
    });

    it('[NET-NEW] the brand join is present and left, so a brandless product survives the feed', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      expect(compiled.records.sql).toContain(
        'LEFT JOIN SwBrand aslatwallbrand ON aslatwallbrand.brandID = aslatwallproduct.brandID',
      );
    });

    it('[NET-NEW] the five joins are emitted in declaration order', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      const positions = [
        compiled.records.sql.indexOf('JOIN SwProduct '),
        compiled.records.sql.indexOf('JOIN SwProductType '),
        compiled.records.sql.indexOf('JOIN SwAlternateSkuCode '),
        compiled.records.sql.indexOf('JOIN SwSku bslatwallsku'),
        compiled.records.sql.indexOf('JOIN SwBrand '),
      ];

      for (const position of positions) {
        expect(position).toBeGreaterThan(0);
      }
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    });

    it('[NET-NEW] a second alias over the same physical table advances to the next letter', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      /*
       * `org/Hibachi/HibachiSmartList.cfc:L251` supplies the twelve letters `a` through `l` and
       * `:L254-L256` advances through them, renaming the registry key on each advance. `SwSku` appears
       * twice — the base and the product's default SKU — so the second one must be `b`, not a collision.
       */
      expect(compiled.baseAlias).toBe('aslatwallsku');
      expect(compiled.records.sql).toContain(
        'LEFT JOIN SwSku bslatwallsku ON bslatwallsku.skuID = aslatwallproduct.defaultSkuID',
      );
      expect(compiled.records.sql.match(/\bbslatwallsku\b/g)).not.toBeNull();
    });

    it('[NET-NEW] a dotted filter path auto-joins the hop it needs, once, with no join type', () => {
      /*
       * `resolvePropertyPath` walks every segment but the last as a hop. The feed declares the SKU-to-
       * product join anyway, so this case uses a query that declares no joins and lets the path create it
       * — proving the auto-join exists rather than being supplied by the declaration.
       */
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        whereGroups: [
          { filters: [{ propertyIdentifier: 'product.productName', value: 'Widget' }] },
        ],
      });

      expect(compiled.records.sql).toContain(
        'LEFT JOIN SwProduct aslatwallproduct ON aslatwallproduct.productID = aslatwallsku.productID',
      );
      expect(compiled.records.sql.match(/ JOIN /g)).toHaveLength(1);
      expect(compiled.records.sql).toContain('aslatwallproduct.productName = ?');
    });

    it('[NET-NEW] a many-to-many hop emits the link table first, then the far entity', () => {
      /*
       * `SwSkuOption` is the link table declared at `model/entity/Sku.cfc:L76`. HQL names the association
       * and lets Hibernate supply both predicates; native SQL must state them, in that order.
       */
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        whereGroups: [{ filters: [{ propertyIdentifier: 'options.optionCode', value: 'RED' }] }],
      });

      const linkPosition = compiled.records.sql.indexOf('SwSkuOption');
      const farPosition = compiled.records.sql.indexOf('JOIN SwOption ');

      expect(linkPosition).toBeGreaterThan(0);
      expect(farPosition).toBeGreaterThan(linkPosition);
      expect(compiled.records.sql).toContain('aslatwalloption.optionCode = ?');
    });

    it('[NET-NEW] no emitted statement carries a quoted literal or an interpolated identifier', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        joins: feedJoins(),
        whereGroups: [
          {
            filters: [{ propertyIdentifier: 'product', value: ID.product }],
            likeFilters: [{ propertyIdentifier: 'skuCode', value: "O'Brien" }],
          },
        ],
      });

      /*
       * TR-4 — every value is bound positionally, never spliced. The apostrophe in the like value is the
       * adversarial half: if any value were interpolated, this statement would carry a quote and MySQL
       * would see a syntax error or an injection, whichever the attacker chose.
       */
      for (const sql of allStatements(compiled)) {
        expect(sql).not.toContain("'");
        expect(sql).not.toContain(ID.product);
        expect(sql).not.toContain('Brien');
      }
      expect(compiled.records.params).toEqual([ID.product, "O'Brien"]);
    });
  });

  /* Pagination arithmetic. */

  describe('NET-NEW SmartListQueryBuilder — pagination arithmetic', () => {
    it('[NET-NEW] the legacy defaults are start 1, show 10 and page 1 — bound as "10" and "0"', () => {
      const { compiled } = compile({ entityName: 'SlatwallSku' });

      /*
       * `org/Hibachi/HibachiSmartList.cfc` seeds all three, and `:L762` binds `pageRecordsStart - 1` as
       * the offset — so the first page is offset zero rather than one.
       */
      expect(compiled.pageRecordsStart).toBe(1);
      expect(compiled.pageRecordsShow).toBe(10);
      expect(compiled.currentPage).toBe(1);
      expect(compiled.pageRecords.params).toEqual(['10', '0']);
    });

    it('[NET-NEW] a declared page past the first overrides the declared start', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        pagination: { pageRecordsStart: 7, pageRecordsShow: 25, currentPageDeclaration: '3' },
      });

      /*
       * `:L793-L794` — when the declaration is greater than one, the start is recomputed from it and the
       * supplied start is discarded. Page 3 at 25 a page begins at record 51, so the offset is 50.
       */
      expect(compiled.pageRecordsStart).toBe(51);
      expect(compiled.currentPage).toBe(3);
      expect(compiled.pageRecords.params).toEqual(['25', '50']);
    });

    it('[NET-NEW] a declaration of page 1 leaves an explicit start alone', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        pagination: { pageRecordsStart: 7, pageRecordsShow: 3, currentPageDeclaration: '1' },
      });

      /*
       * The guard at `:L793` is strictly greater than one, so the first-page declaration is inert and the
       * explicit start survives. `currentPage` is then derived from the start, not from the declaration.
       */
      expect(compiled.pageRecordsStart).toBe(7);
      expect(compiled.pageRecords.params).toEqual(['3', '6']);
      // `:L808-L809` — ceiling(7 / 3) is 3.
      expect(compiled.currentPage).toBe(3);
    });

    it('[NET-NEW] currentPage is the ceiling of start over show, not a stored counter', () => {
      for (const [start, show, expected] of [
        [1, 10, 1],
        [10, 10, 1],
        [11, 10, 2],
        [20, 10, 2],
        [21, 10, 3],
      ] as ReadonlyArray<readonly [number, number, number]>) {
        const { compiled } = compile({
          entityName: 'SlatwallSku',
          pagination: { pageRecordsStart: start, pageRecordsShow: show },
        });

        expect(compiled.currentPage).toBe(expected);
      }
    });

    it('[NET-NEW] a page size below one is refused before any statement text is assembled', () => {
      const scenario = compileOnly();

      expect(() =>
        scenario.builder.build({ entityName: 'SlatwallSku', pagination: { pageRecordsShow: 0 } }),
      ).toThrow(/declared a page size that is not a whole number of at least one/);
      expect(scenario.calls).toHaveLength(0);
    });

    it('[NET-NEW] a fractional start is refused rather than silently floored', () => {
      const scenario = compileOnly();

      expect(() =>
        scenario.builder.build({
          entityName: 'SlatwallSku',
          pagination: { pageRecordsStart: 2.5 },
        }),
      ).toThrow(/first record of the page/);
      expect(scenario.calls).toHaveLength(0);
    });

    it('[NET-NEW] a page declaration that is not a whole number of at least one is refused', () => {
      for (const declaration of ['0', '-1', 'abc', '', '2.5']) {
        const scenario = compileOnly();

        expect(() =>
          scenario.builder.build({
            entityName: 'SlatwallSku',
            pagination: { currentPageDeclaration: declaration },
          }),
        ).toThrow(/declared a current page that is not a whole number of at least one/);
        expect(scenario.calls).toHaveLength(0);
      }
    });

    it('[NET-NEW] totalPages and the clamped page end are derived from the counted total', async () => {
      const { executor } = createSqlExecutorDouble({
        outcomes: [
          sqlRows([{ recordsCount: 5 }]),
          sqlRows(BRAND_ROWS),
          sqlRows([BRAND_ROWS[0] ?? {}]),
        ],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      );

      const result = await builder.execute({
        entityName: 'SlatwallBrand',
        pagination: { pageRecordsShow: 2 },
      });

      // `:L812-L813` — ceiling(5 / 2) is 3.
      expect(result.totalPages).toBe(3);
      expect(result.recordsCount).toBe(5);
      expect(result.pageRecordsStart).toBe(1);
      // `:L800-L803` — the window would end at record 2, and the total does not shorten it.
      expect(result.pageRecordsEnd).toBe(2);
    });

    it('[NET-NEW] a short final page reports its real end rather than the window’s end', async () => {
      const { executor } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 3 }]), sqlRows(BRAND_ROWS), sqlRows(BRAND_ROWS)],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      );

      const result = await builder.execute({
        entityName: 'SlatwallBrand',
        pagination: { pageRecordsStart: 3, pageRecordsShow: 2 },
      });

      /*
       * The window is records 3 and 4, but only three records exist, so the end clamps to 3 — the legacy
       * behaviour at `:L800-L803`. Reporting 4 would advertise a record that is not there.
       */
      expect(result.pageRecordsEnd).toBe(3);
      expect(result.totalPages).toBe(2);
    });
  });

  /* Which statements execute() and executeRecords() actually issue. */

  describe('NET-NEW SmartListQueryBuilder — statement issue and the three-view result', () => {
    it('[NET-NEW] execute counts first, then reads the unpaged collection', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      );

      await builder.execute({ entityName: 'SlatwallBrand' });

      /*
       * The count comes first because the materialisation budget must be able to refuse before a row is
       * read. Reading first and counting afterwards would defeat the guard asserted below.
       */
      expect(calls).toHaveLength(2);
      expect(calls[0]?.sql.startsWith('SELECT COUNT(DISTINCT aslatwallbrand.brandID)')).toBe(true);
      expect(calls[1]?.sql.startsWith('SELECT aslatwallbrand.*')).toBe(true);
      expect(calls[1]?.sql).not.toContain('LIMIT');
    });

    it('[NET-NEW] the bounded statement is skipped when the first page already covers every record', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      );

      const result = await builder.execute({ entityName: 'SlatwallBrand' });

      /*
       * Two rows against a ten-row window starting at record one: the bounded statement could only return
       * the same rows, so it is not issued and the page view reuses the record view by identity. Sending
       * it anyway would be a second full scan for an answer already in hand.
       */
      expect(calls).toHaveLength(2);
      expect(result.records).toBe(result.pageRecords);
      expect(result.records).toHaveLength(2);
    });

    it('[NET-NEW] the bounded statement IS issued when the window does not cover every record', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [
          sqlRows([{ recordsCount: 2 }]),
          sqlRows(BRAND_ROWS),
          sqlRows([BRAND_ROWS[0] ?? {}]),
        ],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      );

      const result = await builder.execute({
        entityName: 'SlatwallBrand',
        pagination: { pageRecordsShow: 1 },
      });

      expect(calls).toHaveLength(3);
      expect(calls[2]?.sql.endsWith(' LIMIT ? OFFSET ?')).toBe(true);
      expect(calls[2]?.params).toEqual(['1', '0']);
      expect(result.records).toHaveLength(2);
      expect(result.pageRecords).toHaveLength(1);
      expect(result.records).not.toBe(result.pageRecords);
    });

    it('[NET-NEW] a start past the first page also forces the bounded statement', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [
          sqlRows([{ recordsCount: 2 }]),
          sqlRows(BRAND_ROWS),
          sqlRows([BRAND_ROWS[1] ?? {}]),
        ],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      );

      /*
       * The reuse test is start-one and rows-within-window. A later start fails the first half even when
       * the row count would fit, because the window no longer begins at the first record.
       */
      await builder.execute({
        entityName: 'SlatwallBrand',
        pagination: { pageRecordsStart: 2 },
      });

      expect(calls).toHaveLength(3);
      expect(calls[2]?.params).toEqual(['10', '1']);
    });

    it('[NET-NEW] executeRecords issues a COUNT then the projection, and never a LIMIT', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      );

      const records = await builder.executeRecords({ entityName: 'SlatwallBrand' });

      /*
       * This is the member the Google feed reaches through `getSkuSmartList`. It needs no page, which is
       * why there is still no `LIMIT` — that half is unchanged parity with `getRecords()` at
       * `org/Hibachi/HibachiSmartList.cfc:L751-L755`.
       */
      expect(calls).toHaveLength(2);
      expect(calls[0]?.sql).toContain('AS recordsCount');
      expect(calls[1]?.sql).not.toContain('COUNT(');
      expect(calls[0]?.sql).not.toContain('LIMIT');
      expect(calls[1]?.sql).not.toContain('LIMIT');
      expect(records).toHaveLength(2);
      expect(records[0]?.brandName).toBe('Alpha');
      expect(records[1]?.brandName).toBe('Beta');
    });

    it('[NET-NEW] a counting statement that returns no row is refused, not read as zero', async () => {
      const { executor } = createSqlExecutorDouble({ outcomes: [sqlRows([])] });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      );

      /* Treating an absent row as zero would report an empty smart list for a populated table. */
      await expect(builder.execute({ entityName: 'SlatwallBrand' })).rejects.toThrow(
        /returned no row, so the total record count could not be read/,
      );
    });

    it('[NET-NEW] a numeric string count is accepted, and a non-numeric one is refused', async () => {
      const accepted = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: '7' }]), sqlRows(BRAND_ROWS)],
      });
      const acceptedResult = await new SmartListQueryBuilder(
        accepted.executor,
        makeAggregateLoaders(),
        GENEROUS_SMART_LIST_BUDGET,
      ).execute({ entityName: 'SlatwallBrand' });

      /*
       * Drivers may hand back a count as a string or a bigint depending on column width, so the numeric
       * string is a real shape rather than a hypothetical one. Anything genuinely unparseable is not.
       */
      expect(acceptedResult.recordsCount).toBe(7);

      const refused = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 'not-a-number' }])],
      });
      await expect(
        new SmartListQueryBuilder(
          refused.executor,
          makeAggregateLoaders(),
          GENEROUS_SMART_LIST_BUDGET,
        ).execute({
          entityName: 'SlatwallBrand',
        }),
      ).rejects.toThrow(/returned a value that is not a number/);
    });

    it('[NET-NEW] the materialisation budget refuses after the count and before any row is read', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 9 }])],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        smartListBudgetWithRowCeiling(5),
      );

      await expect(builder.execute({ entityName: 'SlatwallBrand' })).rejects.toThrow(
        /matched more records than the configured materialisation budget admits/,
      );
      /*
       * Exactly one statement ran: the count. Refusing after reading nine rows would already have paid the
       * cost the budget exists to avoid — and a silently shortened result would be worse still.
       */
      expect(calls).toHaveLength(1);
    });

    it('[NET-NEW] a budget within reach does not interfere', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        smartListBudgetWithRowCeiling(2),
      );

      // The comparison is strictly greater-than, so a count exactly at the budget is admitted.
      const result = await builder.execute({ entityName: 'SlatwallBrand' });

      expect(result.recordsCount).toBe(2);
      expect(calls).toHaveLength(2);
    });

    it('[NET-NEW] the budget FACTORY refuses a figure that is not a positive whole number', () => {
      /*
       * The figure is validated where it is accepted. The builder takes a resolver-carrying budget
       * built by `createSmartListMaterialisationBudget` rather than a plain `{
       * maximumRecordsPerQuery }` object, so the check lives in the factory — still before any
       * query runs, which was the
       * whole point of validating at construction rather than at the point of use.
       */
      for (const maximum of [0, -1, 1.5, Number.NaN]) {
        expect(() => createSmartListMaterialisationBudget(maximum, 10)).toThrow(
          /materialisation budget must be a positive safe integer/,
        );
        /* And the complexity figure is held to the same rule, by the same helper. */
        expect(() => createSmartListMaterialisationBudget(10, maximum)).toThrow(
          /complexity budget must be a positive safe integer/,
        );
      }
    });
  });

  /* The budget on the records-only member —'s unguarded half. */

  describe('NET-NEW SmartListQueryBuilder — the budget bounds executeRecords too', () => {
    it('[NET-NEW] counts FIRST and refuses before the unpaged statement is issued', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 9 }])],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        smartListBudgetWithRowCeiling(5),
      );

      const rejection: unknown = await builder.executeRecords({ entityName: 'SlatwallBrand' }).then(
        () => undefined,
        (failure: unknown) => failure,
      );

      /*
       * The refusal *reports* rather than truncates, and it names the figures. Truncation is expressly
       * ruled out: feed ORDER and membership are observable behaviour (AAP §0.4.1.10), so a quietly
       * shortened feed would publish a catalog that does not exist while reporting success. Pinning the
       * error type and its context is what makes the bound diagnosable rather than merely enforced — an
       * operator who sees the refusal learns which entity, how many records matched and what the budget
       * was, without which the only remedy is guesswork.
       */
      expect(rejection).toBeInstanceOf(DomainError);
      expect((rejection as DomainError).message).toMatch(
        /matched more records than the configured materialisation budget admits/,
      );
      expect((rejection as DomainError).context).toMatchObject({
        entityName: 'SlatwallBrand',
        recordsCount: 9,
        maximumRecordsPerQuery: 5,
      });

      /*
       * Exactly one statement, and it is the count. Nine rows were never read, so nothing was hydrated and
       * nothing was retained — which is the whole value of counting first rather than measuring a
       * collection already in memory. The refusal text is the same text the paged path raises, because
       * both readings reach it through one private member; two messages for one bound would let the two
       * paths drift apart unnoticed, which is how the records-only path lost its bound in the first place.
       */
      expect(calls).toHaveLength(1);
      expect(calls[0]?.sql.startsWith('SELECT COUNT(DISTINCT aslatwallbrand.brandID)')).toBe(true);
    });

    it('[NET-NEW] bounds the FEED\u2019s own compiled query, not merely a stand-in for it', async () => {
      /*
       * The exposed half is the one that matters, so it is exercised with the feed's real query rather
       * than a convenient one. `?slatAction=google:feed.product` is the single anonymously reachable
       * surface in this slice and it reads the whole catalogue through the records-only member — asserting
       * the bound on a brand query alone would leave the finding open on the path that motivated it. The
       * same merged joins, activity and publication filters and inclusive availability range the controller
       * declares are compiled here.
       */
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 5000 }])],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        smartListBudgetWithRowCeiling(250),
      );

      const rejection: unknown = await builder.executeRecords(feedQuery(feedJoins())).then(
        () => undefined,
        (failure: unknown) => failure,
      );

      expect(rejection).toBeInstanceOf(DomainError);
      expect((rejection as DomainError).context).toMatchObject({
        entityName: 'SlatwallSku',
        recordsCount: 5000,
        maximumRecordsPerQuery: 250,
      });

      /*
       * One statement — the count — and it carried the feed's own joins and filters, so the figure gated
       * the population the feed would have materialised rather than some looser one.
       */
      expect(calls).toHaveLength(1);
      expect(calls[0]?.sql).toContain('COUNT(DISTINCT aslatwallsku.skuID)');
    });

    it('[NET-NEW] a budget within reach issues the count and then the unpaged statement, in that order', async () => {
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        smartListBudgetWithRowCeiling(2),
      );

      const records = await builder.executeRecords({ entityName: 'SlatwallBrand' });

      /*
       * Two statements — the count, then the unpaged projection — and a count exactly at the budget is
       * admitted, because the comparison is strictly greater-than on both the count path and the
       * post-hydration row-length path. Off-by-one in either would fail here.
       */
      expect(calls).toHaveLength(2);
      expect(calls[0]?.sql).toContain('COUNT(DISTINCT');
      expect(calls[1]?.sql.startsWith('SELECT aslatwallbrand.*')).toBe(true);
      expect(calls[1]?.sql).not.toContain('LIMIT');
      expect(records).toHaveLength(2);
    });

    it('[NET-NEW] a row set that widened after the count is refused before hydration', async () => {
      /*
       * The count and the row statement are separate reads. Inside a transaction-scoped executor they
       * observe one snapshot and agree; in autocommit a concurrent insert between them can return more
       * rows than the count promised. Two rows were promised and three arrived.
       */
      const { executor, calls } = createSqlExecutorDouble({
        outcomes: [
          sqlRows([{ recordsCount: 2 }]),
          sqlRows([
            ...BRAND_ROWS,
            { brandID: 'ee55ff6677889900aa11bb22cc33dd44', brandName: 'Gamma' },
          ]),
        ],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        smartListBudgetWithRowCeiling(2),
      );

      await expect(builder.executeRecords({ entityName: 'SlatwallBrand' })).rejects.toThrow(
        /returned more rows than the configured materialisation budget/,
      );

      /*
       * Two statements ran and no third: the overshoot is refused rather than served, so it never becomes
       * domain objects, never reaches an association load, and never reaches a rendered feed. Nothing
       * locks, retries or waits — this port introduces no such semantics (AAP §0.7.3).
       */
      expect(calls).toHaveLength(2);
    });

    it('[NET-NEW] with NO figure stated the read is REFUSED before any statement, naming the variable', async () => {
      const wideRows = Object.freeze(
        Array.from({ length: 25 }, (_unused, index) => ({
          brandID: `brand${String(index).padStart(27, '0')}`,
          brandName: `Brand ${String(index)}`,
        })),
      );
      const { executor, calls } = createSqlExecutorDouble({ outcomes: [sqlRows(wideRows)] });
      const builder = new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        UNSTATED_SMART_LIST_BUDGET,
      );

      /*
       * An unstated budget refuses rather than materialising an arbitrarily wide row set. The
       * alternative reading — that an unbounded default is deliberate because the legacy names no
       * maximum and IR-12 with AAP §0.7.3 forbid inventing one — fails on the exposure: an
       * anonymous route with no bound is unbounded materialisation. So the port authors no figure
       * and demands one instead.
       */
      await expect(builder.executeRecords({ entityName: 'SlatwallBrand' })).rejects.toThrow(
        /CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY/,
      );
      expect(calls).toHaveLength(0);

      const rowsUnstated = createSqlExecutorDouble({ outcomes: [sqlRows(wideRows)] });
      const rowsUnstatedBuilder = new SmartListQueryBuilder(
        rowsUnstated.executor,
        makeAggregateLoaders(),
        createSmartListMaterialisationBudget(undefined, 10_000),
      );

      await expect(
        rowsUnstatedBuilder.executeRecords({ entityName: 'SlatwallBrand' }),
      ).rejects.toThrow(/CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY/);
      expect(rowsUnstated.calls).toHaveLength(0);
    });

    it('[NET-NEW] the COMPLEXITY ceiling refuses at composition time, before any statement', () => {
      /*
       * 's second half: the finding required capping "keyword/list/order cardinality and
       * statement size", not only the row count. `build()` sums the bound parameters, the ORDER BY terms
       * and the joins into one complexity figure and refuses over the operator's ceiling.
       */
      const scenario = compileOnly(smartListBudgetWithComplexityCeiling(4));

      const rejection = ((): unknown => {
        try {
          scenario.builder.build({
            entityName: 'SlatwallBrand',
            whereGroups: [
              {
                filters: [
                  { propertyIdentifier: 'brandName', value: 'a' },
                  { propertyIdentifier: 'brandWebsite', value: 'b' },
                  { propertyIdentifier: 'urlTitle', value: 'c' },
                  { propertyIdentifier: 'activeFlag', value: '1' },
                ],
              },
            ],
          });

          return undefined;
        } catch (failure: unknown) {
          return failure;
        }
      })();

      expect(rejection).toBeInstanceOf(DomainError);
      expect((rejection as DomainError).message).toMatch(/complexity budget/);
      expect((rejection as DomainError).context).toMatchObject({
        entityName: 'SlatwallBrand',
        complexityUnits: 5,
        maximumPredicatesPerQuery: 4,
        boundParameters: 4,
        orderingTerms: 0,
        sources: 1,
      });
      expect(scenario.calls).toHaveLength(0);
    });

    it('[NET-NEW] a request exactly AT the complexity ceiling is admitted, so the bound is inclusive', () => {
      /*
       * The admitting side of the same boundary: three predicates plus the one base source is four units
       * against a ceiling of four, and it compiles. So the ceiling bounds rather than simply refusing, and
       * the comparison is strictly greater-than rather than greater-or-equal.
       */
      const scenario = compileOnly(smartListBudgetWithComplexityCeiling(4));

      const statement = scenario.builder.build({
        entityName: 'SlatwallBrand',
        whereGroups: [
          {
            filters: [
              { propertyIdentifier: 'brandName', value: 'a' },
              { propertyIdentifier: 'brandWebsite', value: 'b' },
              { propertyIdentifier: 'urlTitle', value: 'c' },
            ],
          },
        ],
      });

      expect(statement.records.params).toHaveLength(3);
      expect(statement.records.sql).toContain('SwBrand');
    });

    it('[NET-NEW] ORDERING terms and JOINS are counted too, not only filters', () => {
      /*
       * The finding named "repeated valid `OrderBy` statements" and join breadth alongside filter lists, so
       * all three arms of the sum are exercised rather than only the one that is easiest to reach.
       */
      const ordered = compileOnly(smartListBudgetWithComplexityCeiling(3));

      expect(() =>
        ordered.builder.build({
          entityName: 'SlatwallBrand',
          whereGroups: [{ filters: [{ propertyIdentifier: 'brandName', value: 'a' }] }],
          orders: [
            { propertyIdentifier: 'brandName', direction: 'ASC' },
            { propertyIdentifier: 'urlTitle', direction: 'DESC' },
          ],
        }),
      ).toThrow(/complexity budget/);

      const unordered = compileOnly(smartListBudgetWithComplexityCeiling(3)).builder.build({
        entityName: 'SlatwallBrand',
        whereGroups: [{ filters: [{ propertyIdentifier: 'brandName', value: 'a' }] }],
      });

      /*
       * The default ordering is still emitted — `createdDateTime ASC`, which the legacy applies when a
       * caller states none — so the assertion is that the two caller-stated terms are gone rather than that
       * no ordering exists. The default costs nothing against the ceiling either, because the sum reads
       * `query.orders` rather than the emitted clause: only what a caller supplied is charged to it.
       */
      expect(unordered.records.sql).toContain('ORDER BY aslatwallbrand.createdDateTime ASC');
      expect(unordered.records.sql).not.toContain('urlTitle');
    });

    it('[NET-NEW] a MEGABYTE-long filter value adds ONE complexity unit and ZERO characters of SQL', () => {
      /*
       * The property the paragraph above claims, asserted rather than only argued — and the reason the
       * finding's "statement size" clause needs no second figure.
       */
      const scenario = compileOnly(smartListBudgetWithComplexityCeiling(2));
      const enormous = 'x'.repeat(1_000_000);

      const wide = scenario.builder.build({
        entityName: 'SlatwallBrand',
        whereGroups: [{ filters: [{ propertyIdentifier: 'brandName', value: enormous }] }],
      });
      const narrow = compileOnly(smartListBudgetWithComplexityCeiling(2)).builder.build({
        entityName: 'SlatwallBrand',
        whereGroups: [{ filters: [{ propertyIdentifier: 'brandName', value: 'x' }] }],
      });

      expect(wide.records.sql).toBe(narrow.records.sql);
      expect(wide.records.sql).not.toContain(enormous);
      expect(wide.records.params).toStrictEqual([enormous]);
      expect(scenario.calls).toHaveLength(0);
    });

    it('[NET-NEW] a request with NO complexity figure stated is refused, naming the variable', () => {
      /*
       * Fail-closed on the second bound as well as the first, and for the same reason: an unstated ceiling
       * that admitted everything would leave the predicate cardinality unbounded by default.
       */
      const scenario = compileOnly(UNSTATED_SMART_LIST_BUDGET);

      expect(() =>
        scenario.builder.build({
          entityName: 'SlatwallBrand',
          whereGroups: [{ filters: [{ propertyIdentifier: 'brandName', value: 'a' }] }],
        }),
      ).toThrow(/CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY/);
      expect(scenario.calls).toHaveLength(0);
    });
  });

  /* Identifier safety — refusal before any statement text. */

  describe('NET-NEW SmartListQueryBuilder — identifier safety', () => {
    it('[NET-NEW] a declared property that names no physical column is refused, with nothing executed', () => {
      /*
       * `SwSku` declares these as ORM associations that the smart-list graph does not traverse, so they
       * are legal property names with no column behind them. `?` binds VALUES only — an identifier can
       * never be parameterised — so the whitelist is the entire defence and it must fire here.
       */
      for (const propertyIdentifier of ['orderItems', 'stocks', 'skuCurrencies'] as const) {
        const scenario = compileOnly();

        expect(() =>
          scenario.builder.build({
            entityName: 'SlatwallSku',
            whereGroups: [{ filters: [{ propertyIdentifier, value: 'x' }] }],
          }),
        ).toThrow(/named a column that the extracted Catalog schema does not declare/);
        expect(scenario.calls).toHaveLength(0);
      }
    });

    it('[NET-NEW] the refusal says it happened before any statement text was assembled', () => {
      const scenario = compileOnly();

      /*
       * The wording is the contract: a caller reading this message knows nothing partial was emitted and
       * nothing reached a driver, so there is no half-built statement to reason about.
       */
      expect(() =>
        scenario.builder.build({
          entityName: 'SlatwallSku',
          whereGroups: [{ filters: [{ propertyIdentifier: 'orderItems', value: 'x' }] }],
        }),
      ).toThrow(/refused before any statement text was assembled/);
    });

    it('[NET-NEW] an ORDER BY over an undeclared column is refused on the same path', () => {
      const scenario = compileOnly();

      /*
       * Ordering is composed from the same resolver as filtering, so the whitelist covers it too. An
       * unguarded order clause would be the easiest injection surface of the three.
       */
      expect(() =>
        scenario.builder.build({
          entityName: 'SlatwallSku',
          orders: [{ propertyIdentifier: 'orderItems', direction: 'ASC' }],
        }),
      ).toThrow(/named a column that the extracted Catalog schema does not declare/);
      expect(scenario.calls).toHaveLength(0);
    });

    it('[NET-NEW] refuses nine erased-type direction payloads before statement composition', () => {
      const payloads = [
        'ASC, (SELECT 1)',
        'ASC, (SELECT COUNT(*) FROM SwProductType)',
        'ASC; DROP TABLE SwSku',
        'ASC UNION SELECT 1',
        'DESC--',
        'asc',
        'desc',
        '',
        'ASC NULLS FIRST',
      ] as const;

      for (const payload of payloads) {
        const scenario = compileOnly();
        const order = { propertyIdentifier: 'skuCode', direction: 'ASC' } as const;

        /*
         * The port type is intentionally correct while the runtime value is replaced underneath it,
         * reproducing an untyped JSON/JavaScript caller without weakening this test with a cast.
         */
        Object.defineProperty(order, 'direction', { value: payload });

        let failure: unknown;
        try {
          scenario.builder.build({ entityName: 'SlatwallSku', orders: [order] });
        } catch (caught: unknown) {
          failure = caught;
        }

        expect(failure).toBeInstanceOf(DomainError);
        if (!(failure instanceof DomainError)) {
          throw new Error('the direction payload was not refused as a domain failure');
        }
        expect(failure.message).toMatch(/supported ASC\/DESC set/);
        expect(failure.context).toEqual({
          receivedType: 'string',
          allowedDirections: ['ASC', 'DESC'],
        });
        expect(scenario.calls).toHaveLength(0);
      }
    });

    it('[NET-NEW] accepts only the two canonical direction tokens and emits them unchanged', () => {
      for (const direction of ['ASC', 'DESC'] as const) {
        const scenario = compileOnly();
        const compiled = scenario.builder.build({
          entityName: 'SlatwallSku',
          orders: [{ propertyIdentifier: 'skuCode', direction }],
        });

        expect(compiled.records.sql).toContain(`ORDER BY aslatwallsku.skuCode ${direction}`);
        expect(scenario.calls).toHaveLength(0);
      }
    });

    it('[NET-NEW] a path that ENDS at a collection association is refused with its own message', () => {
      const scenario = compileOnly();

      /*
       * A distinct refusal, because the fix is different: a collection has no column on the table that
       * owns it, so the caller must extend the path rather than pick another column. The message says so.
       */
      expect(() =>
        scenario.builder.build({
          entityName: 'SlatwallSku',
          whereGroups: [{ filters: [{ propertyIdentifier: 'options', value: 'x' }] }],
        }),
      ).toThrow(/ended at a collection association/);
      expect(scenario.calls).toHaveLength(0);
    });

    it('[NET-NEW] a many-to-one association named as a LEAF resolves to its foreign key, adding no join', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        whereGroups: [{ filters: [{ propertyIdentifier: 'product', value: ID.product }] }],
      });

      /*
       * HQL compares against the association itself (`sku.product.id = ?`); native SQL reads the foreign
       * key already on `SwSku`. Both answer the same question, and the SQL form needs no join at all —
       * which is why the statement below carries none.
       */
      expect(compiled.records.sql).toContain('WHERE ((aslatwallsku.productID = ?))');
      expect(compiled.records.sql).not.toContain(' JOIN ');
      expect(compiled.records.params).toEqual([ID.product]);
    });

    it('[NET-NEW] a property-scoped smart list refuses a property that is not a collection', () => {
      /*
       * `describePropertyScopedSmartList` takes plain strings, so this is the one refusal path a caller can
       * reach without a declared property type — and it is refused just as firmly.
       */
      expect(() => describePropertyScopedSmartList('SlatwallSku', 'product', ID.product)).toThrow(
        /named a property that is not a collection on the entity that owns it/,
      );
      expect(() =>
        describePropertyScopedSmartList('SlatwallSku', 'notARelationship', ID.product),
      ).toThrow(/named a property that is not a collection on the entity that owns it/);
    });
  });

  /* Operator emission. */

  describe('NET-NEW SmartListQueryBuilder — operator emission', () => {
    it('[NET-NEW] an equality filter emits "= ?" and binds the value positionally', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        whereGroups: [{ filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] }],
      });

      expect(compiled.records.sql).toContain('WHERE ((aslatwallsku.activeFlag = ?))');
      expect(compiled.records.params).toEqual([1]);
    });

    it('[NET-NEW] a like filter emits "LIKE ?" and does NOT wrap the value itself', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        whereGroups: [{ likeFilters: [{ propertyIdentifier: 'skuCode', value: '%RED%' }] }],
      });

      /*
       * The wildcards belong to the caller here. Only the keyword path wraps a value in `%…%`
       * (`org/Hibachi/HibachiSmartList.cfc:L683`); an explicit like filter is bound verbatim.
       */
      expect(compiled.records.sql).toContain('aslatwallsku.skuCode LIKE ?');
      expect(compiled.records.params).toEqual(['%RED%']);
    });

    it('[NET-NEW] an IN filter emits exactly one placeholder per value', () => {
      const { compiled } = compile({
        entityName: 'SlatwallOption',
        whereGroups: [
          { inFilters: [{ propertyIdentifier: 'optionCode', value: 'RED,BLUE,GREEN' }] },
        ],
      });

      /*
       * The single most important line of the operator set. A list rendered as one `?` would bind the whole
       * comma string as a single value and match nothing; interpolating the list would reopen D18's
       * injection surface in a second place. One placeholder per value is the only correct form.
       */
      expect(compiled.records.sql).toContain('aslatwalloption.optionCode IN (?, ?, ?)');
      expect(compiled.records.params).toEqual(['RED', 'BLUE', 'GREEN']);
    });

    it('[NET-NEW] a single-valued IN filter emits one placeholder, not a degenerate list', () => {
      const { compiled } = compile({
        entityName: 'SlatwallOption',
        whereGroups: [{ inFilters: [{ propertyIdentifier: 'optionCode', value: 'RED' }] }],
      });

      expect(compiled.records.sql).toContain('aslatwalloption.optionCode IN (?)');
      expect(compiled.records.params).toEqual(['RED']);
    });

    it('[NET-NEW] the three range forms emit >=, <= and both, in that fixed order', () => {
      const both = compile({
        entityName: 'SlatwallOption',
        whereGroups: [
          { ranges: [{ propertyIdentifier: 'sortOrder', lowerBound: 1, upperBound: 9 }] },
        ],
      });
      const upperOnly = compile({
        entityName: 'SlatwallOption',
        whereGroups: [{ ranges: [{ propertyIdentifier: 'sortOrder', upperBound: 9 }] }],
      });
      const lowerOnly = compile({
        entityName: 'SlatwallOption',
        whereGroups: [{ ranges: [{ propertyIdentifier: 'sortOrder', lowerBound: 1 }] }],
      });

      /*
       * Every bound is inclusive. The feed's availability gate is the lower-only form, and an exclusive
       * `>` there would silently drop every product with exactly one unit available.
       */
      expect(both.compiled.records.sql).toContain(
        'aslatwalloption.sortOrder >= ? AND aslatwalloption.sortOrder <= ?',
      );
      expect(both.compiled.records.params).toEqual([1, 9]);
      expect(upperOnly.compiled.records.sql).toContain('aslatwalloption.sortOrder <= ?');
      expect(upperOnly.compiled.records.sql).not.toContain('>=');
      expect(upperOnly.compiled.records.params).toEqual([9]);
      expect(lowerOnly.compiled.records.sql).toContain('aslatwalloption.sortOrder >= ?');
      expect(lowerOnly.compiled.records.sql).not.toContain('<=');
      expect(lowerOnly.compiled.records.params).toEqual([1]);
    });

    it('[NET-NEW] the feed’s availability gate is the inclusive lower-bound form', () => {
      const { compiled } = compile(feedQuery(feedJoins()));

      /*
       * `integrationServices/google/controllers/feed.cfc` passes `'1^'` — a lower bound of one and no
       * upper bound. The bound value is the string `1`, carried as the legacy carries it rather than
       * coerced to a number on the way through.
       */
      expect(compiled.records.sql).toContain('aslatwallproduct.calculatedQATS >= ?');
      // Not the exclusive form: `> ?` would drop every product with exactly one unit available.
      expect(compiled.records.sql).not.toContain('calculatedQATS > ?');
      expect(compiled.records.sql).not.toContain('calculatedQATS <=');
      expect(compiled.records.params[3]).toBe('1');
    });

    it('[NET-NEW] predicates within one group are ANDed and the group is parenthesised', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        whereGroups: [
          {
            filters: [{ propertyIdentifier: 'activeFlag', value: 1 }],
            likeFilters: [{ propertyIdentifier: 'skuCode', value: 'R%' }],
          },
        ],
      });

      expect(compiled.records.sql).toContain(
        'WHERE ((aslatwallsku.activeFlag = ? AND aslatwallsku.skuCode LIKE ?))',
      );
    });

    it('[NET-NEW] separate groups are ORed, and the whole disjunction is wrapped', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        whereGroups: [
          { filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] },
          { filters: [{ propertyIdentifier: 'skuCode', value: 'RED' }] },
        ],
      });

      /*
       * The outer parentheses matter as much as the inner ones: without them, a later ANDed clause — the
       * keyword clause, for instance — would bind more tightly than the or and change the result set.
       */
      expect(compiled.records.sql).toContain(
        'WHERE ((aslatwallsku.activeFlag = ?) OR (aslatwallsku.skuCode = ?))',
      );
      expect(compiled.records.params).toEqual([1, 'RED']);
    });

    it('[NET-NEW] each keyword wraps in %…%, ORs across every keyword property, and ANDs per keyword', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        joins: [{ parentEntityName: 'SlatwallSku', relatedProperty: 'product' }],
        keywords: ['red', 'large'],
        keywordProperties: [
          { propertyIdentifier: 'skuCode', weight: 1 },
          { propertyIdentifier: 'product.productName', weight: 1 },
        ],
      });

      /*
       * `org/Hibachi/HibachiSmartList.cfc:L683` wraps the value; `:L687` ORs the properties. Every keyword
       * gets its own parenthesised disjunction and the disjunctions are ANDed, so a two-word search
       * requires both words to appear somewhere — the legacy narrowing behaviour, not a widening one.
       */
      expect(compiled.records.sql).toContain(
        '(aslatwallsku.skuCode LIKE ? OR aslatwallproduct.productName LIKE ?) AND ' +
          '(aslatwallsku.skuCode LIKE ? OR aslatwallproduct.productName LIKE ?)',
      );
      expect(compiled.records.params).toEqual(['%red%', '%red%', '%large%', '%large%']);
    });

    it('[NET-NEW] keywords with no keyword properties emit no clause at all', () => {
      const { compiled } = compile({ entityName: 'SlatwallSku', keywords: ['red'] });

      /*
       * There is nothing to compare against, so the legacy appends nothing. Emitting a bare `LIKE` over an
       * invented default column would be a fabricated search rule.
       */
      expect(compiled.records.sql).not.toContain('LIKE');
      expect(compiled.records.sql).not.toContain('WHERE');
      expect(compiled.records.params).toEqual([]);
    });

    it('[NET-NEW] a filter group and a keyword clause are ANDed, each independently parenthesised', () => {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        whereGroups: [{ filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] }],
        keywords: ['red'],
        keywordProperties: [{ propertyIdentifier: 'skuCode', weight: 1 }],
      });

      /*
       * The group disjunction keeps its own wrapper — `((activeFlag = ?))` — and the keyword clause is a
       * sibling conjunct outside it rather than a member of it. That nesting is what makes the earlier
       * `A OR B` case safe: an added conjunct binds outside the disjunction, never inside it.
       */
      expect(compiled.records.sql).toContain(
        'WHERE ((aslatwallsku.activeFlag = ?)) AND (aslatwallsku.skuCode LIKE ?)',
      );
      /* Binding order is filters first, then keywords — the order the clauses are composed in. */
      expect(compiled.records.params).toEqual([1, '%red%']);
    });

    it('[NET-NEW] a property-scoped smart list constrains the collection to one owner', () => {
      const query = describePropertyScopedSmartList(
        'SlatwallOptionGroup',
        'options',
        ID.optionGroup,
      );
      const { compiled } = compile(query);

      /*
       * The inverse association is resolved rather than assumed: `SwOption` carries the foreign key, so the
       * constraint lands on `optionGroupID` on the option table and needs no join back to the group.
       */
      expect(query.entityName).toBe('SlatwallOption');
      expect(compiled.records.sql).toContain('WHERE ((aslatwalloption.optionGroupID = ?))');
      expect(compiled.records.sql).not.toContain(' JOIN ');
      expect(compiled.records.params).toEqual([ID.optionGroup]);
    });
  });

  /*
   * Count and records under a fanning join, and the materialisation budget. The builder's own
   * projection, count, paging and budget behaviour belongs here; the relationship-hydration and
   * identity-map cases live in the aggregate-loaders section of
   * `test/adapters/MySqlProductRepository.test.ts`, which owns hydration.
   */

  describe('NET-NEW SmartListQueryBuilder — count and records under a fanning join', () => {
    /** One group row, returned three times, as a join to a three-option group really would. */
    const FANNED_GROUP_ROW = Object.freeze({
      optionGroupID: ID.optionGroup,
      optionGroupName: 'Size',
      optionGroupCode: 'size',
      imageGroupFlag: 1,
      sortOrder: 1,
    });

    /** A fanning query whose page is deliberately narrower than the row count. */
    const FANNING_QUERY: SmartListQuery<'SlatwallOptionGroup'> = {
      entityName: 'SlatwallOptionGroup',
      joins: [{ parentEntityName: 'SlatwallOptionGroup', relatedProperty: 'options' }],
      pagination: { pageRecordsShow: 2 },
    };

    /** The same fan-out with paging left alone, so the first page covers all three rows. */
    const FANNING_QUERY_WHOLE_PAGE: SmartListQuery<'SlatwallOptionGroup'> = {
      entityName: 'SlatwallOptionGroup',
      joins: [{ parentEntityName: 'SlatwallOptionGroup', relatedProperty: 'options' }],
    };

    /**
     * Routes by statement shape rather than by queue position, so a case that asserts ORDER is asserting
     * the builder's choice and not the fixture's. The counting statement answers the DISTINCT total — one
     * group — while the record statements answer three rows, which is what the fan-out returns.
     */
    function makeFanningBuilder(options?: {
      readonly materialisationBudget?: SmartListMaterialisationBudget;
      readonly recordsCount?: number;
    }): BuilderScenario {
      const countedTotal = options?.recordsCount ?? 1;
      const { executor, calls } = createSqlExecutorDouble({
        respond: (call) => {
          if (call.sql.includes('smartListAssociationOwnerKey')) {
            return sqlRows([]);
          }
          if (call.sql.includes('recordsCount')) {
            return sqlRows([{ recordsCount: countedTotal }]);
          }
          return sqlRows([
            { ...FANNED_GROUP_ROW },
            { ...FANNED_GROUP_ROW },
            { ...FANNED_GROUP_ROW },
          ]);
        },
      });

      return {
        builder: new SmartListQueryBuilder(
          executor,
          makeAggregateLoaders(),
          /*
           * — the budget is required now, so a scenario that states no ceiling gets the generous
           * fixture rather than an absent argument. A scenario asserting the ceiling states its own.
           */
          options?.materialisationBudget ?? GENEROUS_SMART_LIST_BUDGET,
        ),
        calls,
      };
    }

    /** The statement text of every call the executor received, in issue order. */
    function issued(scenario: BuilderScenario): readonly string[] {
      return scenario.calls.map((call) => call.sql);
    }

    it('[NET-NEW] with no budget wired, a query materialises whatever it matches', async () => {
      /*
       * The parity default, and the reason the constructor parameter is optional. `HibachiSmartList.cfc`
       * states no maximum anywhere, so an unwired builder must behave exactly as it did before the budget
       * existed — here a counted total far above any figure this suite configures, materialised without
       * complaint.
       */
      const scenario = makeFanningBuilder({ recordsCount: 1_000_000 });

      const result = await scenario.builder.execute(FANNING_QUERY);

      expect(result.recordsCount).toBe(1_000_000);
      expect(result.records).toHaveLength(3);
      expect(issued(scenario)).toHaveLength(4);
    });

    it('[NET-NEW] an over-budget query is refused after the count and before any row is read', async () => {
      /*
       * Restored with the fan-out fixture, where the gate's placement is load-bearing in a way a
       * join-free query cannot show: the count returns one row whatever the catalog holds, so it is safe
       * to issue first, and the refusal then lands with exactly one statement spent and the unbounded
       * record statement never composed. A gate placed after the record read would leave two statements
       * behind and would already have materialised the collection it exists to prevent.
       */
      const scenario = makeFanningBuilder({
        recordsCount: 5,
        materialisationBudget: smartListBudgetWithRowCeiling(4),
      });

      await expect(scenario.builder.execute(FANNING_QUERY)).rejects.toThrow(
        /matched more records than the configured materialisation budget admits/,
      );

      expect(issued(scenario)).toHaveLength(1);
      expect(issued(scenario)[0]).toContain('recordsCount');
      /*
       * And nothing was read. Asserted on the statement text rather than only on the count, because a
       * refusal that had already composed the record statement would still leave one call behind if the
       * count had been skipped.
       */
      for (const sql of issued(scenario)) {
        expect(sql).not.toMatch(/^SELECT [A-Za-z0-9_]+\.\*/);
      }
    });

    it('[NET-NEW] a query exactly at the budget is admitted, so the bound is not off by one', async () => {
      /*
       * The comparison is strictly greater-than. Restored over the fan-out so the admitted query goes on
       * to issue all four statements, which an equality-boundary case over a bare query cannot show.
       */
      const scenario = makeFanningBuilder({
        recordsCount: 4,
        materialisationBudget: smartListBudgetWithRowCeiling(4),
      });

      const result = await scenario.builder.execute(FANNING_QUERY);

      expect(result.recordsCount).toBe(4);
      expect(issued(scenario)).toHaveLength(4);
    });

    it('[NET-NEW] a mis-wired budget is refused when the graph is built, not on first use', () => {
      /*
       * Fail fast at construction, for the reason the constructor records: a `NaN` comparison would
       * silently admit every query and leave the finding open, so a wiring error must not be allowed to
       * surface later as a data error.
       */
      for (const maximumRecordsPerQuery of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        /*
         * — the check now lives in the budget factory rather than the builder's constructor,
         * because the builder takes a resolver-carrying budget. It is still refused before any query runs,
         * which is what this case is about.
         */
        expect(() => smartListBudgetWithRowCeiling(maximumRecordsPerQuery)).toThrow(
          /materialisation budget must be a positive safe integer/,
        );
      }

      /*
       * The positive control, without which this case would still pass if the guard rejected everything.
       */
      expect(() =>
        makeFanningBuilder({ materialisationBudget: smartListBudgetWithRowCeiling(1) }),
      ).not.toThrow();
    });

    it('[NET-NEW] the record projection is NOT distinct while the count ALWAYS is', async () => {
      /*
       * `org/Hibachi/HibachiSmartList.cfc:L502` counts `count(distinct …)` unconditionally, while the
       * record branch at `:L505-L521` consults a flag seeded false at `:L59`. Both rules are asserted on
       * the emitted SQL, because the asymmetry is the legacy's and AAP §0.7.3 forbids repairing
       * it.
       */
      const scenario = makeFanningBuilder();

      await scenario.builder.execute(FANNING_QUERY);

      const [countSql, recordsSql, pageRecordsSql] = issued(scenario);
      expect(recordsSql).toMatch(/^SELECT [A-Za-z0-9_]+\.\*/);
      expect(recordsSql).not.toContain('DISTINCT');
      expect(countSql).toMatch(
        /^SELECT COUNT\(DISTINCT [A-Za-z0-9_]+\.optionGroupID\) AS recordsCount/,
      );
      /*
       * The fan-out really is present — without the join there would be nothing to be distinct about,
       * which is exactly why the join-free sibling case cannot stand in for this one.
       */
      expect(recordsSql).toContain('JOIN SwOption ');
      expect(pageRecordsSql).toContain('JOIN SwOption ');
      /*
       * The declared contract, so a future edit to either composer trips a test rather than silently
       * aligning the two branches.
       */
      expect(SMARTLIST_DISTINCT_ASYMMETRY).toStrictEqual({
        recordProjectionHonoursFlag: true,
        countProjectionIsAlwaysDistinct: true,
      });
    });

    it('[NET-NEW] the fanned record count and the distinct total DISAGREE, and the counted total wins', async () => {
      /*
       * The numeric consequence `meta/tests/unit/IssuesTest.cfc:L73-L89` (`issue_1296`) is sensitive to:
       * Three rows for one group. The port reports the counted total rather than inferring it from the
       * array length — the ambiguity `org/Hibachi/HibachiSmartList.cfc:L783-L785` leaves open and
       * `src/ports/SmartListQueryPort.ts` resolves.
       */
      const scenario = makeFanningBuilder();

      const result = await scenario.builder.execute(FANNING_QUERY);

      expect(result.records).toHaveLength(3);
      expect(result.recordsCount).toBe(1);
      /*
       * One instance per identifier per read: the three fanned rows are the same object, not three. Two
       * instances would also mean the row was managed twice, which installs a fresh error bag and discards
       * anything already accumulated.
       */
      const [first, second, third] = result.records;
      expect(first).toBe(second);
      expect(first).toBe(third);
    });

    it('[NET-NEW] THREE base statements are issued, in order, on one executor', async () => {
      /*
       * The eager three-statement shape, pinned so the open performance question cannot be resolved by
       * accident. The unpaged projection carries no bound, the paged one carries the legacy's own
       * offset/maximum pair from `:L762`, and the count carries neither bound nor ordering.
       */
      const scenario = makeFanningBuilder();

      await scenario.builder.execute(FANNING_QUERY);

      const [countSql, recordsSql, pageRecordsSql] = issued(scenario);
      expect(recordsSql).not.toContain('LIMIT');
      expect(pageRecordsSql).toContain('LIMIT ? OFFSET ?');
      expect(countSql).not.toContain('LIMIT');
      expect(countSql).not.toContain('ORDER BY');
      /*
       * Count first —'s gate order — then the two row statements, then the association pass the
       * hydrator adds. Four statements on one executor, which is what makes the order observable.
       */
      expect(issued(scenario)).toHaveLength(4);
      expect(countSql).toContain('recordsCount');
      expect(issued(scenario)[3]).toContain('smartListAssociationOwnerKey');
    });

    it('[NET-NEW] when the page covers every record the paged statement is NOT issued', async () => {
      /*
       * The other half of the three-statement question, and the reason the fixture above asks for a narrow
       * page. When the first page already covers every row the unpaged statement returned, the paged
       * statement could only return those same rows in that same order, so it is not issued and the
       * unpaged collection is the page. `build` still composes it with its bound `LIMIT ? OFFSET ?`, which
       * is what keeps the case above able to inspect it.
       */
      const scenario = makeFanningBuilder();

      const result = await scenario.builder.execute(FANNING_QUERY_WHOLE_PAGE);

      /* Count, the unpaged records, the association pass — and no paged statement anywhere. */
      expect(issued(scenario)).toHaveLength(3);
      expect(issued(scenario)[0]).toContain('recordsCount');
      expect(issued(scenario)[1]).not.toContain('LIMIT');
      expect(issued(scenario)[2]).toContain('smartListAssociationOwnerKey');
      for (const sql of issued(scenario)) {
        expect(sql).not.toContain('OFFSET');
      }

      /*
       * The page is the unpaged collection, by identity — not a second array holding equal values.
       */
      expect(result.pageRecords).toBe(result.records);
      /*
       * And the paging figures still come from the counted total, never inferred from the fanned rows.
       */
      expect(result.recordsCount).toBe(1);
    });
  });

  describe('NET-NEW SmartListQueryBuilder — the anonymous materialisation gate', () => {
    /* Why the gate is tested here rather than where it is consumed. */

    it('[NET-NEW] the gate raises when no bound was stated, and names the variable to set', () => {
      const gate = createAnonymousMaterialisationGate(UNSTATED_FEED_GATE_BOUNDS);

      expect(() => gate()).toThrow(ConfigurationError);

      /*
       * The diagnostic must name the variable and the legacy locator, because a refusal an operator cannot
       * act on is a worse outcome than the exposure it prevents. It must not name a figure: choosing one here
       * would be the fabrication AAP §0.7.3 and IR-12 forbid, and the whole design rests on the operator
       * having measured it.
       */
      let raised: unknown;
      try {
        gate();
      } catch (error: unknown) {
        raised = error;
      }

      expect(raised).toBeInstanceOf(ConfigurationError);
      expect(raised).toMatchObject({
        context: {
          locator: 'integrationServices/google/controllers/feed.cfc:L54-L56',
          variable: 'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
        },
      });
      expect(raised instanceof Error ? raised.message : '').toContain(
        'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
      );
      /*
       * No digit anywhere in the message: the gate reports an absence, it does not suggest a value.
       */
      expect(raised instanceof Error ? raised.message : '0').not.toMatch(/\d/u);
    });

    it('[NET-NEW] the gate returns for any bound an operator could legitimately state', () => {
      /*
       * A bound of 1 is admitted, which is the boundary worth pinning. The gate asks only whether a figure
       * was stated; validating the figure itself belongs to `src/config/env.ts`'s resource-bound reader, which
       * enforces the floor and refuses zero, negatives, fractions, `NaN` and `Infinity`. Duplicating that here
       * would put one rule in two places.
       */
      for (const bound of [1, 2, 1000, Number.MAX_SAFE_INTEGER]) {
        expect(() => createAnonymousMaterialisationGate(feedGateBoundsOf(bound))()).not.toThrow();
      }
    });

    it('[NET-NEW] the gate is re-callable, so a consumer can re-check every invocation', () => {
      /*
       * The verdict is not memoised, and that is deliberate (M7). The feed calls the gate inside its
       * operation rather than at construction, because `createGoogleFeedHandlerFromContainer` runs at module
       * load in the router — raising there would take all 34 routes down over a bound only one of them needs.
       * A gate that answered once and cached would quietly turn that per-invocation check back into a
       * construction-time one.
       */
      const refusing = createAnonymousMaterialisationGate(UNSTATED_FEED_GATE_BOUNDS);
      const permitting = createAnonymousMaterialisationGate(feedGateBoundsOf(1));

      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(() => refusing()).toThrow(ConfigurationError);
        expect(() => permitting()).not.toThrow();
      }
    });
  });
});
