// slatwall-ts - repository suite for the option select-list reads.
//
// For orientation on what parity would have looked like: the only legacy suites extended anywhere
// in this port are `meta/tests/unit/entity/BrandTest.cfc` and
// `meta/tests/unit/entity/ProductTest.cfc`, both owned by tests/unit/domain/entities/.
//
// Why this sits under tests/integration/repositories/ and needs no database: the tier names the
// layer under test - the seam between adapter and statement - not the presence of a server. Every
// adapter here runs against a recording executor that opens no socket, so `TEST_LIVE_DATABASE` is
// neither imported nor consulted and setting it changes nothing this suite proves.

import { describe, expect, it } from 'vitest';

import type { OptionRepository, SelectOption } from '../../../src/domain/ports/optionRepository.js';
import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import { MAX_PLACEHOLDER_COUNT } from '../../../src/repositories/mysql/connection.js';
import { MysqlOptionRepository } from '../../../src/repositories/mysql/mysqlOptionRepository.js';

/**
 * One statement the adapter sent, captured with the parameters it bound to it.
 */
interface RecordedStatement {
  /**
   * The statement text, exactly as the adapter produced it.
   */
  readonly sql: string;

  /**
   * The bound parameters, in the positional order they were supplied.
   */
  readonly params: readonly unknown[];
  /**
   * Whether this statement was issued inside `transaction`.
   *
   * Captured per statement so a suite can PROVE atomicity instead of assuming it.
   */
  readonly inTransaction: boolean;
}

// JUDGMENT CALL: the double is HAND-WRITTEN and INLINE rather than produced by a mocking utility
// or shared from a helper module. Three reasons, all of which outrank the duplication it costs.
//
// JUDGMENT CALL: it records rather than simulates. It is not a database and does not attempt to be
// one - it never parses the statement, never evaluates a predicate, and returns whatever canned
// rows it was constructed with.
/**
 * A `PreparedStatementExecutor` that captures what it is asked to run.
 *
 * Satisfies the narrow executor contract the adapter is constructed with, so it substitutes for
 * the pool-backed executor without the adapter knowing.
 */
class RecordingExecutor implements PreparedStatementExecutor {
  /**
   * Every result-set statement, in call order.
   */
  readonly calls: RecordedStatement[] = [];

  /**
   * Every data-modifying statement, in call order.
   */
  readonly mutationCalls: RecordedStatement[] = [];

  /**
   * What `execute` hands back, standing in for the server's result set.
   */
  private readonly cannedRows: readonly SqlRow[];

  /**
   * @param cannedRows the rows every `execute` call resolves with.
   */
  constructor(cannedRows: readonly SqlRow[]) {
    this.cannedRows = cannedRows;
  }

  /**
   * Record the statement and answer with the canned rows.
   */
  execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params: [...params], inTransaction: this.transactionDepth > 0 });

    return Promise.resolve(this.cannedRows);
  }

  /**
   * Record the attempt and then fail loudly.
   *
   * Refusing rather than returning a benign result is the point: a silent `affectedRows: 0` would
   * let a write path through unnoticed.
   */
  executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutationCalls.push({
      sql,
      params: [...params],
      inTransaction: this.transactionDepth > 0,
    });

    throw new Error(
      'RecordingExecutor.executeMutation was called, but both ported OptionDAO functions are ' +
        'reads. This adapter must never issue a data-modifying or schema-changing statement.',
    );
  }

  /**
   * How many times `transaction` was entered. Expected to stay ZERO forever, and named to match
   * the recorder in the five sibling repository suites.
   *
   * A write that must be atomic opens EXACTLY one unit of work, so a non-zero value in those
   * suites is the atomicity assertion.
   */
  transactionCount = 0;

  /**
   * Nesting depth, read by the `inTransaction` flag on every recorded statement.
   */
  private transactionDepth = 0;

  /**
   * How many times a transaction was attempted. Expected to stay ZERO forever.
   */
  transactionAttempts = 0;

  /**
   * Refuse a transaction, for the same reason `executeMutation` refuses.
   *
   * The alternative was a working no-op, and it is worth saying why it lost.
   *
   * The refusal is not a divergence from the shipped executor.
   */
  transaction<T>(_work: (transactional: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    this.transactionAttempts += 1;

    throw new Error(
      'RecordingExecutor.transaction was called, but this adapter is read-only. A transaction is ' +
        'only ever opened around a write, so this indicates a write path that the legacy ' +
        'component does not have.',
    );
  }
}
/**
 * The single statement a method issued, or a failure describing what it did instead.
 *
 * @param calls the double's recorded statements.
 * @returns the one recorded statement.
 * @throws When the method issued anything other than exactly one statement.
 */
function onlyStatement(calls: readonly RecordedStatement[]): RecordedStatement {
  if (calls.length !== 1) {
    throw new Error(
      'Expected exactly one statement to have been issued, but ' +
        String(calls.length) +
        ' were. Each of these methods runs a single <cfquery> and must issue a single ' +
        'statement: no second lookup, no per-row follow-up, and no hydration query.',
    );
  }

  const [first] = calls;

  if (first === undefined) {
    throw new Error(
      'Expected exactly one statement to have been issued, but the recorded element was absent.',
    );
  }

  return first;
}

/**
 * One projected select option, narrowed without an escape hatch.
 *
 * `noUncheckedIndexedAccess` types an indexed read as possibly absent, and that is exactly the
 * check a postfix `!` would silence.
 *
 * @param options the projection a method returned.
 * @param index the position to read.
 * @returns the option at that position.
 * @throws When the projection has no element there.
 */
function selectOptionAt(options: readonly SelectOption[], index: number): SelectOption {
  const option = options[index];

  if (option === undefined) {
    throw new Error(
      'Expected a projected select option at index ' +
        String(index) +
        ', but the projection holds only ' +
        String(options.length) +
        ' element(s).',
    );
  }

  return option;
}

/**
 * How many positional placeholders a statement carries.
 */
function placeholderCount(sql: string): number {
  return sql.split('?').length - 1;
}

/**
 * How many non-overlapping times a fragment appears in a statement.
 */
function occurrences(sql: string, fragment: string): number {
  return sql.split(fragment).length - 1;
}

// JUDGMENT CALL: each statement is split into a HEAD, a placeholder body and a TAIL, and the
// pieces are plain literals concatenated with `+`. No expected statement contains an interpolation
// of any kind.
//
// JUDGMENT CALL: indentation is the two-space form the adapter emits, not the tabs the legacy
// `<cfquery>` used, and no expected line ends in whitespace.

/**
 * Everything before the `IN` list of the unused-options statement.
 *
 * Ends at the opening parenthesis with no trailing newline, so a placeholder body follows
 * immediately.
 */
const EXPECTED_OPTIONS_HEAD = [
  'SELECT',
  '  SwOption.optionID,',
  '  SwOption.optionName,',
  '  SwOptionGroup.optionGroupName',
  'FROM',
  '  SwOption',
  '  INNER JOIN',
  '  SwOptionGroup on SwOptionGroup.optionGroupID = SwOption.optionGroupID',
  'WHERE',
  '  SwOption.optionGroupID IN (',
].join('\n');

/**
 * Everything after the `IN` list of the unused-options statement.
 *
 * Transcribed from [model/dao/OptionDAO.cfc:L68-L84]: the closing parenthesis, the `AND`, the
 * whole `NOT EXISTS` exclusion including its redundant inner `DISTINCT` and its single `productID`
 * placeholder.
 */
const EXPECTED_OPTIONS_TAIL = [
  ')',
  '  AND',
  '  NOT EXISTS(',
  '    SELECT DISTINCT',
  '      a.optionID',
  '    FROM',
  '      SwSkuOption a',
  '      INNER JOIN',
  '      SwSku b on a.skuID = b.skuID',
  '    WHERE',
  '      b.productID = ?',
  '      AND',
  '      a.optionID = SwOption.optionID',
  '  )',
  'ORDER BY',
  '  SwOptionGroup.optionGroupName,',
  '  SwOption.optionName',
].join('\n');

/**
 * Everything before the `NOT IN` list of the unused-option-groups statement.
 */
const EXPECTED_GROUPS_HEAD = [
  'SELECT',
  '  SwOptionGroup.optionGroupID,',
  '  SwOptionGroup.optionGroupName',
  'FROM',
  '  SwOptionGroup',
  'WHERE',
  '  SwOptionGroup.optionGroupID NOT IN (',
].join('\n');

/**
 * Everything after the `NOT IN` list of the unused-option-groups statement.
 */
const EXPECTED_GROUPS_TAIL = [')', 'ORDER BY', '  SwOptionGroup.optionGroupName'].join('\n');

/**
 * The placeholder body `sqlPlaceholderList` renders for a one-element list.
 */
const ONE_PLACEHOLDER = '?';

/**
 * The placeholder body for a two-element list: comma and space, as rendered.
 */
const TWO_PLACEHOLDERS = '?, ?';

/**
 * The placeholder body for a three-element list.
 */
const THREE_PLACEHOLDERS = '?, ?, ?';

/**
 * The whole unused-options statement for a given list width.
 *
 * @param placeholderBody a rendered placeholder body such as `?, ?`.
 * @returns the statement the adapter is expected to emit.
 */
function expectedUnusedProductOptionsStatement(placeholderBody: string): string {
  return EXPECTED_OPTIONS_HEAD + placeholderBody + EXPECTED_OPTIONS_TAIL;
}

/**
 * The whole unused-option-groups statement for a given list width.
 *
 * @param placeholderBody a rendered placeholder body such as `?, ?`.
 * @returns the statement the adapter is expected to emit.
 */
function expectedUnusedProductOptionGroupsStatement(placeholderBody: string): string {
  return EXPECTED_GROUPS_HEAD + placeholderBody + EXPECTED_GROUPS_TAIL;
}

// Identifiers are 32 lowercase hex characters, which is what the legacy generator produces -
// `replace(lcase(createUUID()), '-', '', 'all')` - and what `length="32"` on the key columns
// admits.

/**
 * An option group identifier standing in for a colour group.
 */
const GROUP_ID_COLOUR = '7c2f9a1e4b8d40f3a615c07be92d84f1';

/**
 * A second option group identifier, distinct from the first.
 */
const GROUP_ID_SIZE = 'e3b0a94d15c7482fb8d6019a7f24c5e8';

/**
 * A third option group identifier, distinct from the first two.
 */
const GROUP_ID_MATERIAL = '1a9d63f8c05b47e2ba7418d3e6f09c57';

/**
 * The product whose SKUs are checked for existing option use.
 */
const PRODUCT_ID = '5d81fe3ac72b49f0a9146e58b03cd27f';

/**
 * An option identifier belonging to the colour group.
 */
const OPTION_ID_RED = 'b47e05d9a1c8426fb03e97d5c1a68f24';

/**
 * A second option identifier, belonging to the size group.
 */
const OPTION_ID_LARGE = '9f13c6b804ea475d8b27e0a3fd561c98';

// The projected text values are named so that a label expectation can be composed from the same
// pieces the canned row carries.

/**
 * The `optionGroupName` cell of the first canned unused-options row.
 */
const COLOUR_GROUP_NAME = 'Colour';

/**
 * The `optionName` cell of the first canned unused-options row.
 */
const RED_OPTION_NAME = 'Red';

/**
 * The `optionGroupName` cell of the second canned unused-options row.
 */
const SIZE_GROUP_NAME = 'Size';

/**
 * The `optionName` cell of the second canned unused-options row.
 */
const LARGE_OPTION_NAME = 'Large';

/**
 * The three characters the legacy label interpolation places between the two names.
 */
const LABEL_SEPARATOR = ' - ';

/**
 * Two rows shaped as the unused-options statement projects them.
 *
 * Ordered as the statement's two-column `ORDER BY` would deliver them - group name first, then
 * option name.
 */
const UNUSED_OPTION_ROWS: readonly SqlRow[] = [
  { optionGroupName: COLOUR_GROUP_NAME, optionName: RED_OPTION_NAME, optionID: OPTION_ID_RED },
  { optionGroupName: SIZE_GROUP_NAME, optionName: LARGE_OPTION_NAME, optionID: OPTION_ID_LARGE },
];

/**
 * Two rows shaped as the unused-option-groups statement projects them.
 */
const UNUSED_OPTION_GROUP_ROWS: readonly SqlRow[] = [
  { optionGroupName: COLOUR_GROUP_NAME, optionGroupID: GROUP_ID_COLOUR },
  { optionGroupName: SIZE_GROUP_NAME, optionGroupID: GROUP_ID_SIZE },
];

/**
 * A statement that matched nothing, which is a legitimate outcome for both methods.
 */
const NO_ROWS: readonly SqlRow[] = [];

describe('MysqlOptionRepository - net-new coverage with no legacy antecedent', () => {
  describe('composition: one injected executor, no container and no ambient scope', () => {
    it('is built by hand from an explicit constructor argument', () => {
      // The replacement for DI/1's runtime convention scan.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      expect(repository).toBeInstanceOf(MysqlOptionRepository);
      expect(MysqlOptionRepository).toHaveLength(1);
    });

    it('satisfies the OptionRepository port', () => {
      // A compile-time check as much as a runtime one: the annotation fails the typecheck gate if
      // either method's name, arity or return type drifts from
      // src/domain/ports/optionRepository.ts.
      const port: OptionRepository = new MysqlOptionRepository(new RecordingExecutor(NO_ROWS));

      expect(typeof port.getUnusedProductOptions).toBe('function');
      expect(typeof port.getUnusedProductOptionGroups).toBe('function');
    });

    it('carries the legacy method names verbatim, and exactly two of them', () => {
      const methodNames = Object.getOwnPropertyNames(MysqlOptionRepository.prototype)
        .filter((name) => name !== 'constructor')
        .sort();

      expect(methodNames).toEqual(['getUnusedProductOptionGroups', 'getUnusedProductOptions']);
    });

    it('holds exactly one collaborator and no service locator', () => {
      // The `getService("optionService")` site at [model/entity/Product.cfc:L341] is the locator
      // that constructor injection replaces.
      const repository = new MysqlOptionRepository(new RecordingExecutor(NO_ROWS));

      expect(Reflect.ownKeys(repository)).toHaveLength(1);
      expect('getService' in repository).toBe(false);
      expect('bootstrap' in repository).toBe(false);
    });

    it('issues nothing until a method is called', () => {
      // Constructing the adapter must not reach the data store.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      expect(repository).toBeInstanceOf(MysqlOptionRepository);
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('reaches the data store only through prepared-statement execution', () => {
      const executor = new RecordingExecutor(NO_ROWS);

      expect(typeof executor.execute).toBe('function');
      expect('query' in executor).toBe(false);
    });
  });

  describe('getUnusedProductOptions - emitted statement [model/dao/OptionDAO.cfc:L58-L84]', () => {
    it('emits the transcribed statement character for character', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(
        PRODUCT_ID,
        [GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','),
      );

      expect(onlyStatement(executor.calls).sql).toBe(
        expectedUnusedProductOptionsStatement(TWO_PLACEHOLDERS),
      );
    });

    it('projects the three columns of [model/dao/OptionDAO.cfc:L59-L62] and no others', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      const { sql } = onlyStatement(executor.calls);

      expect(sql).toContain('  SwOption.optionID,');
      expect(sql).toContain('  SwOption.optionName,');
      expect(sql).toContain('  SwOptionGroup.optionGroupName');

      // No `SELECT *` and no widening: the projection is what the mapper reads.
      expect(sql).not.toContain('SELECT *');
      expect(sql).not.toContain('SwOption.*');
    });

    it('joins SwOptionGroup with the legacy INNER JOIN [model/dao/OptionDAO.cfc:L65-L66]', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      const { sql } = onlyStatement(executor.calls);

      expect(sql).toContain(
        '  INNER JOIN\n  SwOptionGroup on SwOptionGroup.optionGroupID = SwOption.optionGroupID',
      );
      expect(sql.toUpperCase()).not.toContain('LEFT JOIN');
      expect(sql.toUpperCase()).not.toContain('RIGHT JOIN');
      expect(sql.toUpperCase()).not.toContain('CROSS JOIN');
    });

    // CFML parity [model/dao/OptionDAO.cfc:L70-L81]: the exclusion is a not exists correlated
    // subquery over `SwSkuOption a INNER JOIN SwSku b`, correlated on
    // `a.optionID = SwOption.optionID` and filtered by a bound productID.
    it('excludes with a correlated NOT EXISTS, never a rewritten anti-join', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      const { sql } = onlyStatement(executor.calls);

      expect(sql).toContain('  NOT EXISTS(');
      expect(sql).toContain(
        '      SwSkuOption a\n      INNER JOIN\n      SwSku b on a.skuID = b.skuID',
      );
      expect(sql).toContain('      b.productID = ?');
      expect(sql).toContain('      a.optionID = SwOption.optionID');
      expect(occurrences(sql, 'NOT EXISTS(')).toBe(1);

      // The three rewrites that would change the emitted artefact under review.
      // `LEFT JOIN... IS NULL` and `NOT IN` are the usual anti-join substitutes, and a bare
      // `EXISTS` would invert the whole predicate.
      expect(sql.toUpperCase()).not.toContain('IS NULL');
      expect(sql.toUpperCase()).not.toContain('NOT IN');
      expect(occurrences(sql, 'EXISTS')).toBe(1);
    });

    // CFML parity [model/dao/OptionDAO.cfc:L71]: the SELECT DISTINCT inside not EXISTS is
    // semantically redundant and is reproduced verbatim rather than optimised away.
    it('keeps the redundant inner SELECT DISTINCT [model/dao/OptionDAO.cfc:L71]', async () => {
      // EXISTS asks only whether a row exists, so de-duplicating the subquery's rows cannot change
      // the answer.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      const { sql } = onlyStatement(executor.calls);

      expect(sql).toContain('    SELECT DISTINCT\n      a.optionID');
      expect(occurrences(sql, 'SELECT DISTINCT')).toBe(1);
    });

    // CFML parity [model/dao/OptionDAO.cfc:L82-L84]: two ordering keys, option group name first
    // and option name second, neither carrying a direction keyword so both sort ascending. The
    // ordering is deterministic and load-bearing.
    it('closes on the two-key ORDER BY, in that order', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      const { sql } = onlyStatement(executor.calls);
      const orderByClause = sql.slice(sql.lastIndexOf('ORDER BY'));

      // Slicing from the clause and comparing whole removes any doubt about key order, key count
      // and the absence of a third key or a direction keyword.
      expect(orderByClause).toBe(
        ['ORDER BY', '  SwOptionGroup.optionGroupName,', '  SwOption.optionName'].join('\n'),
      );
      expect(occurrences(sql, 'ORDER BY')).toBe(1);
      expect(orderByClause.toUpperCase()).not.toContain('DESC');
    });

    it('emits nothing dialect-dependent', async () => {
      // `config/configORM.cfm` selected a Hibernate dialect from the database product name, and
      // two SQL sites elsewhere in the slice genuinely branch on it.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      const upper = onlyStatement(executor.calls).sql.toUpperCase();

      expect(upper).not.toContain('LIMIT');
      expect(upper).not.toContain('OFFSET');
      expect(upper).not.toContain('TOP ');
      expect(upper).not.toContain('ROWNUM');
      expect(upper).not.toContain('FETCH FIRST');
      expect(upper).not.toContain('CONCAT(');
    });
  });

  describe('getUnusedProductOptions - parameter binding [model/dao/OptionDAO.cfc:L68, L78]', () => {
    // CFML parity [model/dao/OptionDAO.cfc:L68]: `list="true"` on a <cfqueryparam> was CFML's own
    // per-element expansion - the engine emitted one bound parameter per element.
    it('renders one placeholder per list element, for one, two and three elements', async () => {
      const cases = [
        { elements: [GROUP_ID_COLOUR], body: ONE_PLACEHOLDER },
        { elements: [GROUP_ID_COLOUR, GROUP_ID_SIZE], body: TWO_PLACEHOLDERS },
        { elements: [GROUP_ID_COLOUR, GROUP_ID_SIZE, GROUP_ID_MATERIAL], body: THREE_PLACEHOLDERS },
      ];

      for (const { elements, body } of cases) {
        const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
        const repository = new MysqlOptionRepository(executor);

        await repository.getUnusedProductOptions(PRODUCT_ID, elements.join(','));

        const { sql, params } = onlyStatement(executor.calls);

        expect(sql).toBe(expectedUnusedProductOptionsStatement(body));

        // The list placeholders plus the single productID placeholder.
        expect(placeholderCount(sql)).toBe(elements.length + 1);
        expect(params).toHaveLength(elements.length + 1);
      }
    });

    // CFML parity [model/dao/OptionDAO.cfc:L78]: this bind carries no `list` attribute, which is
    // the asymmetry inside this one function - the group list expands per element and productID
    // does not.
    it('binds productID as exactly one parameter, never as a list', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      // A productID that would itself split into three elements if it were ever treated as a list.
      // It must arrive as one opaque value.
      const commaBearingProductID = [PRODUCT_ID, PRODUCT_ID, PRODUCT_ID].join(',');

      await repository.getUnusedProductOptions(commaBearingProductID, GROUP_ID_COLOUR);

      const { sql, params } = onlyStatement(executor.calls);

      expect(occurrences(sql, 'b.productID = ?')).toBe(1);
      expect(placeholderCount(sql)).toBe(2);
      expect(params).toEqual([GROUP_ID_COLOUR, commaBearingProductID]);
    });

    // CFML parity [model/dao/OptionDAO.cfc:L68, L78]: the group list is bound in the outer WHERE
    // and productID inside the not EXISTS, so the list comes FIRST and productID LAST. Positional
    // binding makes that order load-bearing.
    it('binds in clause order: the list elements, then productID', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(
        PRODUCT_ID,
        [GROUP_ID_COLOUR, GROUP_ID_SIZE, GROUP_ID_MATERIAL].join(','),
      );

      const { sql, params } = onlyStatement(executor.calls);

      expect(params).toEqual([GROUP_ID_COLOUR, GROUP_ID_SIZE, GROUP_ID_MATERIAL, PRODUCT_ID]);

      // Independently of the array, the statement itself puts the list predicate ahead of the
      // productID predicate, which is what makes that order correct.
      expect(sql.indexOf('SwOption.optionGroupID IN (')).toBeLessThan(
        sql.indexOf('b.productID = ?'),
      );
    });

    it('binds every caller value instead of embedding it in the statement', async () => {
      // The obligation this whole tier exists for. Values are bound; the statement text carries
      // placeholders and nothing the caller supplied.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(
        PRODUCT_ID,
        [GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','),
      );

      const { sql, params } = onlyStatement(executor.calls);

      expect(sql).not.toContain(PRODUCT_ID);
      expect(sql).not.toContain(GROUP_ID_COLOUR);
      expect(sql).not.toContain(GROUP_ID_SIZE);
      expect(sql).not.toContain("'");
      expect(params).toContain(PRODUCT_ID);
      expect(params).toContain(GROUP_ID_COLOUR);
      expect(params).toContain(GROUP_ID_SIZE);
      expect(params).toHaveLength(placeholderCount(sql));
    });

    it('binds only text, so no date or numeric conversion is in play', async () => {
      // Both <cfqueryparam> binds declare cfsqltype="cf_sql_varchar", and neither statement has a
      // date or money predicate. Nothing here needs a UTC policy because no instant is ever bound.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      const { params } = onlyStatement(executor.calls);

      expect(params.every((value) => typeof value === 'string')).toBe(true);
      expect(params.some((value) => value instanceof Date)).toBe(false);
    });

    it('drops empty elements the way CFML list semantics do', async () => {
      // `listToArray(',,')` yields no elements and `listToArray('a,,b')` yields two, so a doubled
      // delimiter is not an empty element - it is no element at all.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(
        PRODUCT_ID,
        [GROUP_ID_COLOUR, '', GROUP_ID_SIZE].join(','),
      );

      const { sql, params } = onlyStatement(executor.calls);

      expect(sql).toBe(expectedUnusedProductOptionsStatement(TWO_PLACEHOLDERS));
      expect(params).toEqual([GROUP_ID_COLOUR, GROUP_ID_SIZE, PRODUCT_ID]);
    });
  });

  describe('getUnusedProductOptions - the projection [model/dao/OptionDAO.cfc:L88]', () => {
    // CFML parity [model/dao/OptionDAO.cfc:L88]: the legacy loop appends
    // `{name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID}` per row, so the label
    // is the group name, the separator, then the option name - in that order.
    it('composes the label as group name, separator, option name', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected: readonly SelectOption[] = await repository.getUnusedProductOptions(
        PRODUCT_ID,
        [GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','),
      );

      expect(projected).toHaveLength(2);
      expect(selectOptionAt(projected, 0).name).toBe(
        COLOUR_GROUP_NAME + LABEL_SEPARATOR + RED_OPTION_NAME,
      );
      expect(selectOptionAt(projected, 1).name).toBe(
        SIZE_GROUP_NAME + LABEL_SEPARATOR + LARGE_OPTION_NAME,
      );
    });

    it('separates the two names with SPACE, HYPHEN-MINUS, SPACE and nothing else', async () => {
      // The separator is load-bearing: it is what a select list renders, so a substituted dash or
      // a dropped space changes what a merchandiser sees.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);
      const { name } = selectOptionAt(projected, 0);

      expect(name.charCodeAt(COLOUR_GROUP_NAME.length)).toBe(0x20);
      expect(name.charCodeAt(COLOUR_GROUP_NAME.length + 1)).toBe(0x2d);
      expect(name.charCodeAt(COLOUR_GROUP_NAME.length + 2)).toBe(0x20);
      expect(name).not.toContain(COLOUR_GROUP_NAME + '-' + RED_OPTION_NAME);
      expect(name).not.toContain(COLOUR_GROUP_NAME + ': ' + RED_OPTION_NAME);
    });

    it('takes the value from optionID', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      expect(selectOptionAt(projected, 0).value).toBe(OPTION_ID_RED);
      expect(selectOptionAt(projected, 1).value).toBe(OPTION_ID_LARGE);
    });

    it('returns the two-member SelectOption projection, not a hydrated entity', async () => {
      // The port publishes `SelectOption` - a display name and an identifier, both strings - and
      // the evidence for that is the DAO itself: neither legacy function hydrates anything.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);
      const first = selectOptionAt(projected, 0);

      expect(Object.keys(first).sort()).toEqual(['name', 'value']);
      expect(typeof first.name).toBe('string');
      expect(typeof first.value).toBe('string');

      // No entity surface leaked into the projection.
      expect('getOptionID' in first).toBe(false);
      expect('optionGroup' in first).toBe(false);
      expect('skus' in first).toBe(false);
    });

    it('materializes no association and issues no follow-up query', async () => {
      // The ORM-laziness replacement. There is no lazy collection to simulate, so the fetch shape
      // is decided once at the statement: three flat scalar columns, and nothing is traversed
      // afterwards.
      //
      // JUDGMENT CALL: the statement count is asserted as a CORRECTNESS property of the declared
      // fetch shape, not as an efficiency claim.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      expect(projected).toHaveLength(2);
      expect(executor.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('reads its columns case-insensitively, as CFML query access does', async () => {
      // CFML parity [model/dao/OptionDAO.cfc:L88]: `rs.optionName`, `rs.OPTIONNAME` and
      // `rs.optionname` are one and the same read in CFML, and a result-set LABEL follows the
      // query text while the ORIGINAL name follows the table definition.
      const executor = new RecordingExecutor([
        {
          OPTIONGROUPNAME: COLOUR_GROUP_NAME,
          optionname: RED_OPTION_NAME,
          OptionID: OPTION_ID_RED,
        },
      ]);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);
      const first = selectOptionAt(projected, 0);

      expect(first.name).toBe(COLOUR_GROUP_NAME + LABEL_SEPARATOR + RED_OPTION_NAME);
      expect(first.value).toBe(OPTION_ID_RED);
    });

    it('renders a NULL name cell as the empty string, as CFML interpolation does', async () => {
      // Both projected name columns are nullable - neither entity property declares notnull - so
      // this path is live rather than theoretical.
      const executor = new RecordingExecutor([
        { optionGroupName: COLOUR_GROUP_NAME, optionName: null, optionID: OPTION_ID_RED },
      ]);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      expect(selectOptionAt(projected, 0).name).toBe(COLOUR_GROUP_NAME + LABEL_SEPARATOR);
      expect(selectOptionAt(projected, 0).name).not.toContain('null');
    });

    it('rejects a row the statement could not have produced', async () => {
      // A missing COLUMN is a different fault from a NULL VALUE in one, and the two are kept apart
      // on purpose: a NULL yields the empty string, while a column the statement never selected
      // raises.
      const executor = new RecordingExecutor([{ optionGroupName: COLOUR_GROUP_NAME }]);
      const repository = new MysqlOptionRepository(executor);

      await expect(repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR)).rejects.toThrow(
        /has no column of that name/,
      );
    });
  });

  describe('getUnusedProductOptionGroups - emitted statement [model/dao/OptionDAO.cfc:L100-L109]', () => {
    it('emits the transcribed statement character for character', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups([GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','));

      expect(onlyStatement(executor.calls).sql).toBe(
        expectedUnusedProductOptionGroupsStatement(TWO_PLACEHOLDERS),
      );
    });

    it('projects two columns from a single table, with no join at all', async () => {
      // [model/dao/OptionDAO.cfc:L101-L105]: two columns, `FROM SwOptionGroup`, and nothing else.
      // The sibling statement joins; this one must not acquire a join because the two resemble
      // each other.
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups(GROUP_ID_COLOUR);

      const { sql } = onlyStatement(executor.calls);

      expect(sql).toContain('  SwOptionGroup.optionGroupID,');
      expect(sql).toContain('  SwOptionGroup.optionGroupName');
      expect(sql).toContain('FROM\n  SwOptionGroup\nWHERE');
      expect(sql.toUpperCase()).not.toContain('JOIN');
      expect(sql).not.toContain('SwOption.');
      expect(sql).not.toContain('SwSku');
      expect(sql).not.toContain('SELECT *');
    });

    // CFML parity [model/dao/OptionDAO.cfc:L107]: this list is matched with not in - the OPPOSITE
    // polarity to the sibling statement's in - because an unused group is one the product does not
    // already carry.
    it('matches the list with NOT IN, never NOT EXISTS and never plain IN', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups(GROUP_ID_COLOUR);

      const { sql } = onlyStatement(executor.calls);

      expect(sql).toContain('  SwOptionGroup.optionGroupID NOT IN (');
      expect(sql.toUpperCase()).not.toContain('EXISTS');
      expect(sql.toUpperCase()).not.toContain('IS NULL');

      // The only `IN` in the statement is the one inside `NOT IN`, so the polarity cannot have
      // been flipped by dropping the negation.
      expect(occurrences(sql, ' IN (')).toBe(1);
      expect(occurrences(sql, 'NOT IN (')).toBe(1);
    });

    // CFML parity [model/dao/OptionDAO.cfc:L108-L109]: one ordering key, with no direction
    // keyword, where the sibling statement at [model/dao/OptionDAO.cfc:L82-L84] has two. The
    // contrast is deliberate and neither side may be harmonised toward the other.
    it('closes on a single-key ORDER BY, unlike the sibling statement', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups(GROUP_ID_COLOUR);

      const { sql } = onlyStatement(executor.calls);
      const orderByClause = sql.slice(sql.lastIndexOf('ORDER BY'));

      expect(orderByClause).toBe(['ORDER BY', '  SwOptionGroup.optionGroupName'].join('\n'));
      expect(occurrences(sql, 'ORDER BY')).toBe(1);
      expect(orderByClause).not.toContain(',');
      expect(orderByClause).not.toContain('SwOption.optionName');
      expect(orderByClause.toUpperCase()).not.toContain('DESC');
    });

    it('emits nothing dialect-dependent', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups(GROUP_ID_COLOUR);

      const upper = onlyStatement(executor.calls).sql.toUpperCase();

      expect(upper).not.toContain('LIMIT');
      expect(upper).not.toContain('OFFSET');
      expect(upper).not.toContain('TOP ');
      expect(upper).not.toContain('ROWNUM');
      expect(upper).not.toContain('FETCH FIRST');
      expect(upper).not.toContain('CONCAT(');
    });
  });

  describe('getUnusedProductOptionGroups - parameter binding [model/dao/OptionDAO.cfc:L107]', () => {
    it('renders one placeholder per list element, for one, two and three elements', async () => {
      const cases = [
        { elements: [GROUP_ID_COLOUR], body: ONE_PLACEHOLDER },
        { elements: [GROUP_ID_COLOUR, GROUP_ID_SIZE], body: TWO_PLACEHOLDERS },
        { elements: [GROUP_ID_COLOUR, GROUP_ID_SIZE, GROUP_ID_MATERIAL], body: THREE_PLACEHOLDERS },
      ];

      for (const { elements, body } of cases) {
        const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
        const repository = new MysqlOptionRepository(executor);

        await repository.getUnusedProductOptionGroups(elements.join(','));

        const { sql, params } = onlyStatement(executor.calls);

        expect(sql).toBe(expectedUnusedProductOptionGroupsStatement(body));

        // This statement has no second predicate, so the counts match the list exactly.
        expect(placeholderCount(sql)).toBe(elements.length);
        expect(params).toHaveLength(elements.length);
        expect(params).toEqual(elements);
      }
    });

    it('binds the list and nothing else', async () => {
      // The one-argument signature at [model/dao/OptionDAO.cfc:L95] means the group list is the
      // statement's only bound input: no productID, no flag, no implicit filter.
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups([GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','));

      const { sql, params } = onlyStatement(executor.calls);

      expect(params).toEqual([GROUP_ID_COLOUR, GROUP_ID_SIZE]);
      expect(params).not.toContain(PRODUCT_ID);
      expect(sql).not.toContain('productID');
    });

    it('binds every caller value instead of embedding it in the statement', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups([GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','));

      const { sql, params } = onlyStatement(executor.calls);

      expect(sql).not.toContain(GROUP_ID_COLOUR);
      expect(sql).not.toContain(GROUP_ID_SIZE);
      expect(sql).not.toContain("'");
      expect(params).toHaveLength(placeholderCount(sql));
      expect(params.every((value) => typeof value === 'string')).toBe(true);
      expect(params.some((value) => value instanceof Date)).toBe(false);
    });

    it('drops empty elements the way CFML list semantics do', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups([GROUP_ID_COLOUR, '', GROUP_ID_SIZE].join(','));

      const { sql, params } = onlyStatement(executor.calls);

      expect(sql).toBe(expectedUnusedProductOptionGroupsStatement(TWO_PLACEHOLDERS));
      expect(params).toEqual([GROUP_ID_COLOUR, GROUP_ID_SIZE]);
    });
  });

  describe('getUnusedProductOptionGroups - the projection [model/dao/OptionDAO.cfc:L113]', () => {
    // CFML parity [model/dao/OptionDAO.cfc:L113]: the legacy loop appends
    // `{name=rs.optionGroupName, value=rs.optionGroupID}` - the group name ALONE, with no
    // separator and no composition.
    it('projects the bare group name, with no separator', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected: readonly SelectOption[] = await repository.getUnusedProductOptionGroups(
        [GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','),
      );

      expect(projected).toHaveLength(2);
      expect(selectOptionAt(projected, 0).name).toBe(COLOUR_GROUP_NAME);
      expect(selectOptionAt(projected, 1).name).toBe(SIZE_GROUP_NAME);
      expect(selectOptionAt(projected, 0).name).not.toContain(LABEL_SEPARATOR);
      expect(selectOptionAt(projected, 1).name).not.toContain(LABEL_SEPARATOR);
    });

    it('takes the value from optionGroupID', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptionGroups(GROUP_ID_MATERIAL);

      expect(selectOptionAt(projected, 0).value).toBe(GROUP_ID_COLOUR);
      expect(selectOptionAt(projected, 1).value).toBe(GROUP_ID_SIZE);
    });

    it('returns the two-member SelectOption projection, not a hydrated entity', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptionGroups(GROUP_ID_MATERIAL);
      const first = selectOptionAt(projected, 0);

      expect(Object.keys(first).sort()).toEqual(['name', 'value']);
      expect(typeof first.name).toBe('string');
      expect(typeof first.value).toBe('string');

      // The option group's `options` collection is deliberately not fetched: a select list needs a
      // label and an identifier, so that is the whole fetch shape.
      expect('options' in first).toBe(false);
      expect('getOptionGroupID' in first).toBe(false);
    });

    it('materializes no association and issues no follow-up query', async () => {
      // Same correctness framing as the sibling expectation on the options statement: one
      // statement is what the declared fetch shape MEANS, and this is not an efficiency claim.
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptionGroups(GROUP_ID_MATERIAL);

      expect(projected).toHaveLength(2);
      expect(executor.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(0);
    });
  });

  // CFML parity [model/dao/OptionDAO.cfc:L88, L113]: two DIFFERENT arrayAppend sites produce two
  // DIFFERENT label shapes from the same two-member structure.
  describe('the two projections are deliberately NOT unified', () => {
    it('composes a separated label for options and a bare label for option groups', async () => {
      const optionExecutor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const groupExecutor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);

      const options = await new MysqlOptionRepository(optionExecutor).getUnusedProductOptions(
        PRODUCT_ID,
        GROUP_ID_COLOUR,
      );
      const groups = await new MysqlOptionRepository(groupExecutor).getUnusedProductOptionGroups(
        GROUP_ID_MATERIAL,
      );

      const optionLabel = selectOptionAt(options, 0).name;
      const groupLabel = selectOptionAt(groups, 0).name;

      expect(optionLabel).toContain(LABEL_SEPARATOR);
      expect(groupLabel).not.toContain(LABEL_SEPARATOR);

      // Both rows carry the same optionGroupName, so the labels share a prefix and diverge only in
      // the composition - which is the difference being pinned.
      expect(optionLabel.startsWith(groupLabel)).toBe(true);
      expect(optionLabel).not.toBe(groupLabel);
    });

    it('keeps the member names name and value on both, per the legacy structures', async () => {
      // Taken verbatim from the two append sites. They are not the `id`/`value` shape that the two
      // `searchXByProductType` projections elsewhere in the slice use; each DAO's own source
      // dictates its own shape.
      const optionExecutor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const groupExecutor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);

      const options = await new MysqlOptionRepository(optionExecutor).getUnusedProductOptions(
        PRODUCT_ID,
        GROUP_ID_COLOUR,
      );
      const groups = await new MysqlOptionRepository(groupExecutor).getUnusedProductOptionGroups(
        GROUP_ID_MATERIAL,
      );

      expect(Object.keys(selectOptionAt(options, 0)).sort()).toEqual(['name', 'value']);
      expect(Object.keys(selectOptionAt(groups, 0)).sort()).toEqual(['name', 'value']);
      expect('id' in selectOptionAt(options, 0)).toBe(false);
      expect('id' in selectOptionAt(groups, 0)).toBe(false);
    });
  });

  // LEGACY-DEFECT [model/dao/OptionDAO.cfc:L68, L107]: both list arguments are declared required
  // but neither is length-checked, so an empty list makes in ('') yield zero rows while not in
  // ('') yields all rows.
  // Preserved deliberately; do not fix without a product decision.
  describe('the empty-list asymmetry [model/dao/OptionDAO.cfc:L68, L107]', () => {
    // LEGACY-DEFECT [model/dao/OptionDAO.cfc:L68, L107]: both list arguments are declared required
    // but neither is length-checked, so an empty list makes in ('') yield zero rows while not in
    // ('') yields all rows.
    // Preserved deliberately; do not fix without a product decision.
    it('binds a single empty-string element for getUnusedProductOptions', async () => {
      // The faithful mechanical equivalent of the `IN ('')` CFML emitted. A zero-placeholder
      // `IN ()` would not parse at all, so one placeholder carrying one empty string is what
      // reproduces the legacy predicate.
      const executor = new RecordingExecutor(NO_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptions(PRODUCT_ID, '');

      const { sql, params } = onlyStatement(executor.calls);

      expect(sql).toBe(expectedUnusedProductOptionsStatement(ONE_PLACEHOLDER));
      expect(sql).toContain('  SwOption.optionGroupID IN (?)');
      expect(params).toEqual(['', PRODUCT_ID]);
      expect(params).toHaveLength(2);
    });

    // LEGACY-DEFECT [model/dao/OptionDAO.cfc:L68, L107]: both list arguments are declared required
    // but neither is length-checked, so an empty list makes in ('') yield zero rows while not in
    // ('') yields all rows.
    // Preserved deliberately; do not fix without a product decision.
    it('binds a single empty-string element for getUnusedProductOptionGroups', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);

      await repository.getUnusedProductOptionGroups('');

      const { sql, params } = onlyStatement(executor.calls);

      expect(sql).toBe(expectedUnusedProductOptionGroupsStatement(ONE_PLACEHOLDER));
      expect(sql).toContain('  SwOptionGroup.optionGroupID NOT IN (?)');
      expect(params).toEqual(['']);
      expect(params).toHaveLength(1);
    });

    it('still issues the statement: neither method short-circuits an empty list', async () => {
      // The legacy performs no length check in either function, so the target performs none
      // either. Short-circuiting to an early empty result belongs only where the legacy actually
      // guards - and this DAO does not.
      const optionExecutor = new RecordingExecutor(NO_ROWS);
      const groupExecutor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);

      await new MysqlOptionRepository(optionExecutor).getUnusedProductOptions(PRODUCT_ID, '');
      await new MysqlOptionRepository(groupExecutor).getUnusedProductOptionGroups('');

      expect(optionExecutor.calls).toHaveLength(1);
      expect(groupExecutor.calls).toHaveLength(1);
    });

    it('propagates the OPPOSITE outcomes the two polarities produce', async () => {
      // The defect made observable. One unvalidated empty argument, two methods, two contradictory
      // answers: the `IN` side excludes everything and the not in side excludes nothing.
      const optionExecutor = new RecordingExecutor(NO_ROWS);
      const groupExecutor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);

      const options = await new MysqlOptionRepository(optionExecutor).getUnusedProductOptions(
        PRODUCT_ID,
        '',
      );
      const groups = await new MysqlOptionRepository(groupExecutor).getUnusedProductOptionGroups(
        '',
      );

      expect(options).toEqual([]);
      expect(groups).toHaveLength(UNUSED_OPTION_GROUP_ROWS.length);
      expect(selectOptionAt(groups, 0).value).toBe(GROUP_ID_COLOUR);
      expect(selectOptionAt(groups, 1).value).toBe(GROUP_ID_SIZE);
    });

    it('treats a list of only delimiters exactly as it treats an empty list', async () => {
      // `listToArray(',,,')` yields no elements, so this is the same unguarded path rather than a
      // three-element list of empty strings.
      const optionExecutor = new RecordingExecutor(NO_ROWS);
      const groupExecutor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);

      await new MysqlOptionRepository(optionExecutor).getUnusedProductOptions(PRODUCT_ID, ',,,');
      await new MysqlOptionRepository(groupExecutor).getUnusedProductOptionGroups(',,,');

      expect(onlyStatement(optionExecutor.calls).params).toEqual(['', PRODUCT_ID]);
      expect(onlyStatement(groupExecutor.calls).params).toEqual(['']);
    });

    it('never emits a zero-placeholder list', async () => {
      // `IN ()` and `NOT IN ()` are unparseable, so the empty case must still render one
      // placeholder. Asserted on both methods because both share the binding path.
      const optionExecutor = new RecordingExecutor(NO_ROWS);
      const groupExecutor = new RecordingExecutor(NO_ROWS);

      await new MysqlOptionRepository(optionExecutor).getUnusedProductOptions(PRODUCT_ID, '');
      await new MysqlOptionRepository(groupExecutor).getUnusedProductOptionGroups('');

      expect(onlyStatement(optionExecutor.calls).sql).not.toContain('IN ()');
      expect(onlyStatement(groupExecutor.calls).sql).not.toContain('IN ()');
      expect(placeholderCount(onlyStatement(groupExecutor.calls).sql)).toBe(1);
    });
  });

  describe('an empty result is a legitimate outcome, not an error', () => {
    it('returns an empty array from getUnusedProductOptions, never undefined', async () => {
      const executor = new RecordingExecutor(NO_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);

      expect(projected).toEqual([]);
      expect(projected).toHaveLength(0);
      expect(Array.isArray(projected)).toBe(true);
      expect(projected).not.toBeUndefined();
      expect(projected).not.toBeNull();
    });

    it('returns an empty array from getUnusedProductOptionGroups, never undefined', async () => {
      const executor = new RecordingExecutor(NO_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptionGroups(GROUP_ID_COLOUR);

      expect(projected).toEqual([]);
      expect(projected).toHaveLength(0);
      expect(Array.isArray(projected)).toBe(true);
      expect(projected).not.toBeUndefined();
      expect(projected).not.toBeNull();
    });

    it('does not throw, retry or substitute a default when nothing matched', async () => {
      // Not smoothed over in any of the three ways a well-meaning editor might: no exception for
      // the caller to interpret as failure, no second attempt with a relaxed predicate, and no
      // synthesised placeholder row.
      const optionExecutor = new RecordingExecutor(NO_ROWS);
      const groupExecutor = new RecordingExecutor(NO_ROWS);

      await expect(
        new MysqlOptionRepository(optionExecutor).getUnusedProductOptions(
          PRODUCT_ID,
          GROUP_ID_COLOUR,
        ),
      ).resolves.toEqual([]);
      await expect(
        new MysqlOptionRepository(groupExecutor).getUnusedProductOptionGroups(GROUP_ID_COLOUR),
      ).resolves.toEqual([]);

      expect(optionExecutor.calls).toHaveLength(1);
      expect(groupExecutor.calls).toHaveLength(1);
    });

    it('exposes no validation surface of its own', async () => {
      const repository = new MysqlOptionRepository(new RecordingExecutor(NO_ROWS));

      expect('validate' in repository).toBe(false);
      expect('minCollection' in repository).toBe(false);

      // And it accepts an argument the validation tier would later reject, rather than pre-empting
      // that decision.
      await expect(repository.getUnusedProductOptionGroups('')).resolves.toBeDefined();
    });
  });
  describe('schema continuity: the existing Sw* tables, read-only', () => {
    /**
     * Every statement either method emits, gathered once for the checks below.
     */
    async function emittedStatements(): Promise<readonly string[]> {
      const optionExecutor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const groupExecutor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);

      await new MysqlOptionRepository(optionExecutor).getUnusedProductOptions(
        PRODUCT_ID,
        [GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','),
      );
      await new MysqlOptionRepository(groupExecutor).getUnusedProductOptionGroups(
        [GROUP_ID_COLOUR, GROUP_ID_SIZE].join(','),
      );

      return [onlyStatement(optionExecutor.calls).sql, onlyStatement(groupExecutor.calls).sql];
    }

    it('names only physical Sw* tables', async () => {
      // Confirmed against the entity metadata: `table="SwOption"`, `table="SwOptionGroup"` and the
      // `linktable="SwSkuOption"` the exclusion walks.
      const statements = await emittedStatements();
      const [optionsSql, groupsSql] = statements;

      expect(optionsSql).toBeDefined();
      expect(groupsSql).toBeDefined();

      for (const sql of statements) {
        expect(sql).toContain('SwOptionGroup');
        expect(sql).not.toContain('Slatwall');
        expect(sql).not.toContain('FROM Sku');
        expect(sql).not.toContain('as sku');
      }
    });

    it('reads the four tables the legacy queries name, and no others', async () => {
      const statements = await emittedStatements();
      const combined = statements.join('\n');

      expect(combined).toContain('SwOption');
      expect(combined).toContain('SwOptionGroup');
      expect(combined).toContain('SwSkuOption');
      expect(combined).toContain('SwSku ');

      // No reach into a subsystem this slice does not own.
      expect(combined).not.toContain('SwOrder');
      expect(combined).not.toContain('SwAccount');
      expect(combined).not.toContain('SwPromo');
      expect(combined).not.toContain('SwPriceGroup');
      expect(combined).not.toContain('SwSubs');
    });

    it('issues no schema-changing or data-modifying statement', async () => {
      // The port reads and writes the existing schema unchanged and performs no migration of any
      // kind, so no statement may carry a DDL verb and no mutation may be attempted through the
      // executor.
      const statements = await emittedStatements();

      for (const sql of statements) {
        const upper = sql.toUpperCase();

        expect(upper.startsWith('SELECT')).toBe(true);
        expect(upper).not.toContain('CREATE');
        expect(upper).not.toContain('ALTER');
        expect(upper).not.toContain('DROP');
        expect(upper).not.toContain('TRUNCATE');
        expect(upper).not.toContain('RENAME');
        expect(upper).not.toContain('INSERT');
        expect(upper).not.toContain('UPDATE');
        expect(upper).not.toContain('DELETE');
        expect(upper).not.toContain('GRANT');
      }
    });

    it('resolves its connection from the injected executor, never from a literal', async () => {
      // Neither legacy <cfquery> carries a `datasource` attribute - both inherited the application
      // default declared at [config/configApplication.cfm:L2] - and the target keeps that
      // indirection: the adapter holds no host, no port.
      const statements = await emittedStatements();

      for (const sql of statements) {
        expect(sql).not.toContain('datasource');
        expect(sql).not.toContain('USE ');
      }

      // The positive form of the same guarantee, and the stronger one: the adapter's only own
      // property is the executor it was constructed with.
      expect(Reflect.ownKeys(new MysqlOptionRepository(new RecordingExecutor(NO_ROWS)))).toEqual([
        'executor',
      ]);
    });
  });

  describe('scope boundaries this suite deliberately does not cross', () => {
    it('does not carry getOptionsForSelect, which is service tier', async () => {
      // [model/service/OptionService.cfc:L55] produces the same name/value shape but is
      // synchronous, pure, and takes already-loaded options - it touches no query at all. It is
      // not on this port and is not asserted here.
      const repository = new MysqlOptionRepository(new RecordingExecutor(NO_ROWS));

      expect('getOptionsForSelect' in repository).toBe(false);

      const projected = await repository.getUnusedProductOptionGroups(GROUP_ID_COLOUR);

      expect(projected).toEqual([]);
    });

    it('carries no smart-list, save, delete or count surface', () => {
      // The legacy component declares exactly two functions and the service above it adds only the
      // two passthroughs at [model/service/OptionService.cfc:L72] and
      // [model/service/OptionService.cfc:L76].
      const repository = new MysqlOptionRepository(new RecordingExecutor(NO_ROWS));

      for (const absent of [
        'getOptionSmartList',
        'saveOption',
        'deleteOption',
        'countOptions',
        'getOptionByID',
      ]) {
        expect(absent in repository).toBe(false);
      }
    });

    it('keeps the comma list a string, for signature parity', async () => {
      const executor = new RecordingExecutor(UNUSED_OPTION_GROUP_ROWS);
      const repository = new MysqlOptionRepository(executor);
      const commaList: string = [GROUP_ID_COLOUR, GROUP_ID_SIZE, GROUP_ID_MATERIAL].join(',');

      await repository.getUnusedProductOptionGroups(commaList);

      expect(typeof commaList).toBe('string');
      expect(onlyStatement(executor.calls).params).toEqual([
        GROUP_ID_COLOUR,
        GROUP_ID_SIZE,
        GROUP_ID_MATERIAL,
      ]);
    });

    it('hydrates no boolean, so no CFML boolean coercion is in play', async () => {
      // Both `SelectOption` members are strings and neither statement projects a flag, so the
      // sanctioned `cfBoolean` helper is deliberately not imported.
      const executor = new RecordingExecutor(UNUSED_OPTION_ROWS);
      const repository = new MysqlOptionRepository(executor);

      const projected = await repository.getUnusedProductOptions(PRODUCT_ID, GROUP_ID_COLOUR);
      const first = selectOptionAt(projected, 0);

      expect(typeof first.name).toBe('string');
      expect(typeof first.value).toBe('string');
      expect(onlyStatement(executor.calls).sql.toUpperCase()).not.toContain('FLAG');
    });
  });
});

describe('MysqlOptionRepository - the protocol placeholder ceiling on the group list', () => {
  /**
   * A comma-list of `count` single-character elements. The COUNT is what is under test.
   */
  function listOfCountedElements(count: number): string {
    return new Array<string>(count).fill('x').join(',');
  }

  it('accepts a group-only list EXACTLY at the ceiling, because the server accepts one', async () => {
    const executor = new RecordingExecutor([]);
    const repository = new MysqlOptionRepository(executor);

    await repository.getUnusedProductOptionGroups(listOfCountedElements(MAX_PLACEHOLDER_COUNT));

    expect(onlyStatement(executor.calls).params).toHaveLength(MAX_PLACEHOLDER_COUNT);
  });

  it('counts the trailing productID bind when admitting the sibling statement', async () => {
    // `getUnusedProductOptions` adds one placeholder after the group list. A list at the raw
    // ceiling would therefore produce 65,536 placeholders even though the list itself has 65,535.
    const refusedExecutor = new RecordingExecutor([]);
    const refused = new MysqlOptionRepository(refusedExecutor);

    await expect(
      refused.getUnusedProductOptions(PRODUCT_ID, listOfCountedElements(MAX_PLACEHOLDER_COUNT)),
    ).rejects.toThrow(/complete statement would carry 65536 placeholders/);
    expect(refusedExecutor.calls).toStrictEqual([]);

    // One fewer group plus the product bind lands exactly on the protocol ceiling and is admitted.
    const admittedExecutor = new RecordingExecutor([]);
    const admitted = new MysqlOptionRepository(admittedExecutor);

    await admitted.getUnusedProductOptions(
      PRODUCT_ID,
      listOfCountedElements(MAX_PLACEHOLDER_COUNT - 1),
    );

    const params = onlyStatement(admittedExecutor.calls).params;
    expect(params).toHaveLength(MAX_PLACEHOLDER_COUNT);
    expect(params.at(-1)).toBe(PRODUCT_ID);
  });

  it('refuses ONE PAST the ceiling on BOTH methods, naming the argument and the count', async () => {
    const executor = new RecordingExecutor([]);
    const repository = new MysqlOptionRepository(executor);
    const oneTooMany = listOfCountedElements(MAX_PLACEHOLDER_COUNT + 1);

    await expect(repository.getUnusedProductOptionGroups(oneTooMany)).rejects.toThrow(
      /existingOptionGroupIDList/,
    );
    await expect(repository.getUnusedProductOptions(PRODUCT_ID, oneTooMany)).rejects.toThrow(
      /cannot prepare a statement with more than 65535 placeholders/,
    );
    expect(executor.calls).toStrictEqual([]);
    expect(executor.mutationCalls).toStrictEqual([]);
  });

  it('reproduces no element of the refused list in the message', async () => {
    const executor = new RecordingExecutor([]);
    const repository = new MysqlOptionRepository(executor);

    try {
      await repository.getUnusedProductOptionGroups(
        listOfCountedElements(MAX_PLACEHOLDER_COUNT + 1),
      );
      expect.unreachable('the adapter accepted a statement the server cannot prepare');
    } catch (thrown: unknown) {
      expect(thrown).toBeInstanceOf(Error);
      const { name, message } = thrown as Error;
      expect(name).toBe('OptionGroupIDListTooWideError');
      expect(message).toContain(String(MAX_PLACEHOLDER_COUNT + 1));
      expect(message).not.toContain('x,x');
    }
  });

  it('leaves an ordinary list untouched - no trim, sort, dedupe, case fold or reorder', async () => {
    // The bound refuses on a COUNT alone.
    const executor = new RecordingExecutor([]);
    const repository = new MysqlOptionRepository(executor);

    await repository.getUnusedProductOptionGroups(' B , a ,a,B ');

    expect(onlyStatement(executor.calls).params).toStrictEqual([' B ', ' a ', 'a', 'B ']);
  });
});
