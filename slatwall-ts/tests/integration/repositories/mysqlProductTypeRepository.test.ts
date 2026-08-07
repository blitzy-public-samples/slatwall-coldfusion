// slatwall-ts - repository suite for the product-type reads and writes.
//
// Quoted for provenance, asserted nowhere: nothing below claims caching or any execution
// characteristic.
//
// JUDGMENT CALL [model/dao/ProductTypeDAO.cfc:L53-L62]: the legacy raw SQL names the ORM entities
// SlatwallProductType/SlatwallProduct, reached through `new query()` and `setSQL()`, which
// bypasses the name mapping entirely.
//
// Why this sits under tests/integration/repositories/ and needs no database: the tier names the
// layer under test - the seam between adapter and statement - not the presence of a server. Every
// adapter here runs against a recording executor that opens no socket, so `TEST_LIVE_DATABASE` is
// neither imported nor consulted and setting it changes nothing this suite proves.

import { describe, expect, it } from 'vitest';

import { ProductType } from '../../../src/domain/entities/productType.js';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../../src/domain/ports/productTypeRepository.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';

/**
 * The audit actor every construction in this file supplies.
 */
const TEST_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  adminAccountFlag: true,
});

/**
 * A signed-in actor without the admin flag - the second arm of the legacy gate.
 */
const NON_ADMIN_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
  adminAccountFlag: false,
});

/**
 * Nobody signed in - the target's spelling of the legacy `getAccount().isNew()` arm.
 */
const ANONYMOUS_AUDIT_ACTOR: AuditActorContext = Object.freeze({ adminAccountFlag: false });

/**
 * An account a CALLER named on an entity. It must never reach a bound parameter.
 */
const FORGED_ACCOUNT_ID = 'ffffffffffffffffffffffffffffffff';

/**
 * An account already recorded on the stored row, which a refused gate must not erase.
 */
const STORED_ACCOUNT_ID = 'cccccccccccccccccccccccccccccccc';

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
 * What a write reports back by default.
 *
 * `affectedRows: 1` is the ordinary outcome of a single-row insert or update.
 */
const WRITE_RESULT: SqlMutationResult = Object.freeze({ affectedRows: 1, warningStatus: 0 });

/**
 * What a write reports when it matched no row, which is the update refusal's ground.
 */
const NO_ROWS_AFFECTED: SqlMutationResult = Object.freeze({ affectedRows: 0, warningStatus: 0 });

// JUDGMENT CALL: the double is HAND-WRITTEN and INLINE rather than produced by a mocking utility
// or shared from a helper module. Three reasons, all of which outrank the duplication it costs.
//
// JUDGMENT CALL: it takes an ORDERED SEQUENCE of canned result sets rather than a single one,
// which is where it differs from the option-repository double.
//
// JUDGMENT CALL: it records rather than simulates. It is not a database and does not attempt to be
// one - it never parses the statement, never evaluates a predicate, and never matches a bound key
// against a row.
/**
 * A `PreparedStatementExecutor` that captures what it is asked to run.
 *
 * Satisfies the narrow executor contract the adapter is constructed with, so it substitutes for
 * the pool-backed executor without the adapter knowing.
 */
class RecordingExecutor implements PreparedStatementExecutor {
  readonly calls: RecordedStatement[] = [];

  readonly mutationCalls: RecordedStatement[] = [];

  private readonly cannedResultSets: readonly (readonly SqlRow[])[];

  private answeredResultSets = 0;

  /**
   * What every `executeMutation` call reports back.
   */
  private readonly mutationResult: SqlMutationResult;

  /**
   * @param cannedResultSets one result set per expected `execute` call, in order.
   * @param mutationResult what each write reports; defaults to one affected row, so every existing
   * call site is unchanged.
   */
  constructor(
    cannedResultSets: readonly (readonly SqlRow[])[],
    mutationResult: SqlMutationResult = WRITE_RESULT,
  ) {
    this.cannedResultSets = cannedResultSets;
    this.mutationResult = mutationResult;
  }

  /**
   * Record the statement and answer with the next canned result set.
   */
  execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params: [...params], inTransaction: this.transactionDepth > 0 });

    const cannedRows = this.cannedResultSets[this.answeredResultSets] ?? NO_ROWS;
    this.answeredResultSets += 1;

    return Promise.resolve(cannedRows);
  }

  /**
   * Record the write and report the configured outcome, one affected row by default.
   *
   * Unlike the read-only option adapter, this one legitimately writes: the port declares
   * `saveProductType`, so a recorded mutation is expected rather than a fault.
   */
  executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutationCalls.push({
      sql,
      params: [...params],
      inTransaction: this.transactionDepth > 0,
    });

    return Promise.resolve(this.mutationResult);
  }

  /**
   * How many times `transaction` was entered, counting a JOINED inner call.
   */
  transactionCount = 0;

  /**
   * Nesting depth, so joined inner calls do not read as separate units.
   */
  private transactionDepth = 0;

  /**
   * The transaction boundary, in call order: `BEGIN`, then `COMMIT` or `ROLLBACK`.
   *
   * Separate from `calls` and `mutationCalls` so that a case asserting the STATEMENT sequence is
   * unaffected by whether a transaction wrapped it.
   */
  readonly transactionEvents: string[] = [];

  /**
   * Record the transaction boundary and run `work` inline against this same recorder.
   *
   * The depth is restored in a `finally` so that a failing unit of work - which is exactly what a
   * rollback test drives - does not leave the recorder believing it is still inside a transaction.
   */
  async transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    this.transactionDepth += 1;

    const isOutermost = this.transactionDepth === 1;
    this.transactionEvents.push(isOutermost ? 'BEGIN' : 'JOIN');

    try {
      const result = await work(this);

      if (isOutermost) {
        this.transactionEvents.push('COMMIT');
      }

      return result;
    } catch (error: unknown) {
      if (isOutermost) {
        this.transactionEvents.push('ROLLBACK');
      }

      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }
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

/**
 * The single statement a method issued, or a failure describing what it did instead.
 *
 * This and the positional readers below all THROW rather than returning `undefined`.
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
        ' were. A single-statement read must not issue a second lookup, a per-row follow-up ' +
        'or a hydration query.',
    );
  }

  return statementAt(calls, 0);
}

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

function treeRowAt(rows: readonly ProductTypeTreeRow[], index: number): ProductTypeTreeRow {
  const row = rows[index];

  if (row === undefined) {
    throw new Error(
      'Expected a projected tree row at index ' +
        String(index) +
        ', but the projection holds only ' +
        String(rows.length) +
        ' row(s).',
    );
  }

  return row;
}

function productTypeAt(productTypes: readonly ProductType[], index: number): ProductType {
  const productType = productTypes[index];

  if (productType === undefined) {
    throw new Error(
      'Expected a hydrated product type at index ' +
        String(index) +
        ', but the result holds only ' +
        String(productTypes.length) +
        ' entity(ies).',
    );
  }

  return productType;
}

/**
 * A product type a read was expected to produce.
 *
 * Keeps "the read returned nothing" distinct from "the entity it returned is wrong", because
 * `undefined` is a legitimate answer from two of these methods and a failure from the others.
 *
 * @param productType the value a read or an accessor produced.
 * @param description what was expected, for the failure message.
 * @throws When the value is absent.
 */
function requireProductType(
  productType: ProductType | undefined,
  description: string,
): ProductType {
  if (productType === undefined) {
    throw new Error('Expected ' + description + ', but it was absent.');
  }

  return productType;
}

/**
 * A `Date` a statement was expected to bind.
 *
 * @param value the value bound at an audit-column position.
 * @param description which stamp was expected, for the failure message.
 * @returns the instant.
 * @throws When the value is not a valid `Date`.
 */
function requireBoundDate(value: unknown, description: string): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  throw new Error('Expected ' + description + ' to be bound as a valid Date.');
}

/**
 * The error a rejected operation produced, asserting both that it rejected rather than resolved
 * and that what it rejected with is an `Error`.
 */
async function rejectionOf(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (thrown) {
    if (thrown instanceof Error) {
      return thrown;
    }

    throw new Error(
      'Expected the operation to reject with an Error, but it rejected with ' + typeof thrown + '.',
    );
  }

  throw new Error('Expected the operation to reject, but it resolved.');
}

function placeholderCount(sql: string): number {
  return sql.split('?').length - 1;
}

function occurrences(sql: string, fragment: string): number {
  return sql.split(fragment).length - 1;
}

// Transcribed from the legacy `setSQL` body and from the column contract of
// `model/entity/ProductType.cfc`, not imported from the module under test.
//
// JUDGMENT CALL: every expected statement is assembled from plain line literals joined with a
// newline, with no interpolation of any kind, so the proof that values are bound rather than
// embedded cannot be undermined by the way the proof is written.
//
// JUDGMENT CALL: indentation is the two-space form the adapter emits, not the tabs the legacy CFML
// string literal carried, and no expected line ends in whitespace.

/**
 * The tree read, transcribed from [model/dao/ProductTypeDAO.cfc:L54-L62].
 *
 * `SELECT *` is preserved rather than enumerated; the parity marker at the projection assertion
 * records why.
 */
const EXPECTED_TREE_STATEMENT = [
  'SELECT *,',
  '  (SELECT count(SwProduct.productID)',
  '   FROM SwProduct',
  '   WHERE SwProduct.productTypeID = SwProductType.productTypeID) as isAssigned,',
  '  (SELECT count(spt.productTypeID)',
  '   FROM SwProductType spt',
  '   WHERE spt.parentProductTypeID = SwProductType.productTypeID) as childCount',
  'FROM SwProductType',
  'ORDER BY productTypeName ASC',
].join('\n');

/**
 * The correlated count of products of this type [model/dao/ProductTypeDAO.cfc:L55-L57].
 */
const EXPECTED_IS_ASSIGNED_SUBQUERY = [
  '  (SELECT count(SwProduct.productID)',
  '   FROM SwProduct',
  '   WHERE SwProduct.productTypeID = SwProductType.productTypeID) as isAssigned',
].join('\n');

/**
 * The correlated count of immediate child types [model/dao/ProductTypeDAO.cfc:L58-L60].
 */
const EXPECTED_CHILD_COUNT_SUBQUERY = [
  '  (SELECT count(spt.productTypeID)',
  '   FROM SwProductType spt',
  '   WHERE spt.parentProductTypeID = SwProductType.productTypeID) as childCount',
].join('\n');

const EXPECTED_ORDER_BY_CLAUSE = 'ORDER BY productTypeName ASC';

/**
 * The enumerated hydration projection, shared by both entity reads.
 *
 * Fourteen columns: the eight scalars [model/entity/ProductType.cfc:L52-L59], the
 * `parentProductTypeID` foreign key [model/entity/ProductType.cfc:L62], `remoteID`
 * [model/entity/ProductType.cfc:L80] and the four audit columns
 * [model/entity/ProductType.cfc:L83-L86].
 */
const EXPECTED_HYDRATION_PROJECTION = [
  '  SwProductType.productTypeID,',
  '  SwProductType.productTypeIDPath,',
  '  SwProductType.activeFlag,',
  '  SwProductType.publishedFlag,',
  '  SwProductType.urlTitle,',
  '  SwProductType.productTypeName,',
  '  SwProductType.productTypeDescription,',
  '  SwProductType.systemCode,',
  '  SwProductType.parentProductTypeID,',
  '  SwProductType.remoteID,',
  '  SwProductType.createdDateTime,',
  '  SwProductType.createdByAccountID,',
  '  SwProductType.modifiedDateTime,',
  '  SwProductType.modifiedByAccountID',
].join('\n');

/**
 * Read one row by primary key. One placeholder, and no invented `LIMIT`.
 */
const EXPECTED_BY_ID_STATEMENT = [
  'SELECT',
  EXPECTED_HYDRATION_PROJECTION,
  'FROM SwProductType',
  'WHERE SwProductType.productTypeID = ?',
].join('\n');

/**
 * Read every row whose identifier occurs in a materialized path.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the path-membership predicate is the
 * UNANCHORED SUBSTRING `LIKE` the legacy uses, whose MySQL arm is `concat('%', <idColumn>, '%')`
 * with no comma anchoring and no `FIND_IN_SET`.
 */
const EXPECTED_BY_ID_PATH_STATEMENT = [
  'SELECT',
  EXPECTED_HYDRATION_PROJECTION,
  'FROM SwProductType',
  "WHERE ? LIKE concat('%', SwProductType.productTypeID, '%')",
].join('\n');

/**
 * Insert one row: fourteen columns, fourteen placeholders.
 */
const EXPECTED_INSERT_STATEMENT = [
  'INSERT INTO SwProductType (',
  '  productTypeID,',
  '  productTypeIDPath,',
  '  activeFlag,',
  '  publishedFlag,',
  '  urlTitle,',
  '  productTypeName,',
  '  productTypeDescription,',
  '  systemCode,',
  '  parentProductTypeID,',
  '  remoteID,',
  '  createdDateTime,',
  '  createdByAccountID,',
  '  modifiedDateTime,',
  '  modifiedByAccountID',
  ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
].join('\n');

/**
 * Update one row, matched on its primary key: eleven set columns plus the key.
 *
 * `productTypeID` is excluded from the SET list because it is what the statement matches on.
 */
const EXPECTED_UPDATE_STATEMENT = [
  'UPDATE SwProductType',
  'SET',
  '  productTypeIDPath = ?,',
  '  activeFlag = ?,',
  '  publishedFlag = ?,',
  '  urlTitle = ?,',
  '  productTypeName = ?,',
  '  productTypeDescription = ?,',
  '  systemCode = ?,',
  '  parentProductTypeID = ?,',
  '  remoteID = ?,',
  '  modifiedDateTime = ?,',
  '  modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
  'WHERE SwProductType.productTypeID = ?',
].join('\n');

const EVERY_EXPECTED_STATEMENT: readonly string[] = [
  EXPECTED_TREE_STATEMENT,
  EXPECTED_BY_ID_STATEMENT,
  EXPECTED_BY_ID_PATH_STATEMENT,
  EXPECTED_INSERT_STATEMENT,
  EXPECTED_UPDATE_STATEMENT,
];

const INSERT_PARAMETER_COUNT = 14;

const UPDATE_PARAMETER_COUNT = 12;

const INSERT_PATH_POSITION = 1;

const INSERT_PARENT_KEY_POSITION = 8;

const INSERT_CREATED_STAMP_POSITION = 10;

const INSERT_MODIFIED_STAMP_POSITION = 12;
const INSERT_CREATED_BY_POSITION = 11;

const INSERT_MODIFIED_BY_POSITION = 13;

/**
 * The modifying account is the LAST value in the update SET list, ahead of the key.
 */
const UPDATE_MODIFIED_BY_POSITION = 10;

const UPDATE_PATH_POSITION = 0;

const UPDATE_MODIFIED_STAMP_POSITION = 9;

const UPDATE_KEY_POSITION = 11;

/**
 * The shape a minted identifier has to take.
 */
const MINTED_IDENTIFIER_PATTERN = /^[0-9a-f]{32}$/;

/**
 * A creation instant an already-persisted row carries.
 *
 * An explicit UTC ISO-8601 literal, never a zero-argument `Date` and never a local-time literal:
 * `tests/setup.ts` pins the process timezone to UTC.
 */
const EXISTING_CREATION_INSTANT = new Date('2020-03-04T05:06:07.000Z');

// Realistic widths keep the binding assertions honest: a short label such as `'p1'` could hide a
// truncation that a full-width value exposes.

const ROOT_PRODUCT_TYPE_ID = '4f2c81a9d3b64e07b8125ea6c9d3417f';

const CHILD_PRODUCT_TYPE_ID = 'b95e30d7c1af482da60e7b41f2c85d63';

const GRANDCHILD_PRODUCT_TYPE_ID = '7a13f60be92c4d58ab04e15d7c396f82';

/**
 * A second child of the root, for the case where two siblings resolve the same parent.
 */
const SIBLING_PRODUCT_TYPE_ID = 'c62a8f41d90b47e5a3187cb2e4f60d15';

const UNMATCHED_PRODUCT_TYPE_ID = 'e0d4c7b91a53462f8b7d206ea5f13c94';

const PATH_DELIMITER = ',';

const ROOT_PATH = ROOT_PRODUCT_TYPE_ID;

const CHILD_PATH = ROOT_PRODUCT_TYPE_ID + PATH_DELIMITER + CHILD_PRODUCT_TYPE_ID;

const GRANDCHILD_PATH = CHILD_PATH + PATH_DELIMITER + GRANDCHILD_PRODUCT_TYPE_ID;

/**
 * The sibling's path: root first, then the sibling.
 */
const SIBLING_PATH = ROOT_PRODUCT_TYPE_ID + PATH_DELIMITER + SIBLING_PRODUCT_TYPE_ID;

const ROOT_PRODUCT_TYPE_NAME = 'Merchandise';

const ASSIGNED_PRODUCT_COUNT = 7;

const CHILD_TYPE_COUNT = 3;

/**
 * A save payload that populates nothing, so every column comes off the entity.
 *
 * `saveProductType` takes a `ProductTypeSavePayload` whose two members are each optional, and
 * `Object.hasOwn` is what the adapter's populate step tests.
 *
 * The cases that are about population supply their own payload and say so.
 */
const NO_POPULATED_MEMBERS: Parameters<MysqlProductTypeRepository['saveProductType']>[1] = {};

/**
 * A url title an entity already carries, so "the entity's value survived" is assertable.
 */
const PERSISTED_URL_TITLE = 'merchandise';

/**
 * A url title standing in for one the service's generator resolved.
 *
 * Deliberately unlike {@link PERSISTED_URL_TITLE} so no populate assertion can pass by
 * coincidence.
 */
const RESOLVED_URL_TITLE = 'a-title-the-generator-resolved';

/**
 * A product type name standing in for one arriving in the save payload.
 */
const OVERRIDING_PRODUCT_TYPE_NAME = 'A Name The Payload Supplied';

/**
 * Where `urlTitle` sits in {@link EXPECTED_INSERT_STATEMENT}'s bound parameters.
 */
const INSERT_URL_TITLE_POSITION = 4;

/**
 * Where `productTypeDescription` sits in {@link EXPECTED_INSERT_STATEMENT}'s bound parameters.
 */
const INSERT_PRODUCT_TYPE_DESCRIPTION_POSITION = 6;

/**
 * Where `productTypeName` sits in {@link EXPECTED_INSERT_STATEMENT}'s bound parameters.
 */
const INSERT_PRODUCT_TYPE_NAME_POSITION = 5;

/**
 * Where `urlTitle` sits in {@link EXPECTED_UPDATE_STATEMENT}'s bound parameters.
 *
 * Three positions earlier than on the insert, because the update's SET list omits `productTypeID`
 * the column it MATCHES on, bound LAST - and both created columns.
 */
const UPDATE_URL_TITLE_POSITION = 3;

/**
 * A row shaped as the enumerated hydration projection produces it.
 *
 * All fourteen columns are present because the statement names all fourteen, and a column absent
 * from such a result set is a genuine fault the adapter raises on.
 *
 * @param productTypeID the row's primary key.
 * @param parentProductTypeID the parent foreign key, or `null` for a root row.
 * @param productTypeIDPath the stored materialized path.
 * @param overrides cells to replace, applied last.
 */
function hydrationRow(
  productTypeID: string,
  parentProductTypeID: string | null,
  productTypeIDPath: string,
  overrides: Readonly<Record<string, unknown>> = {},
): SqlRow {
  return {
    productTypeID,
    productTypeIDPath,
    activeFlag: 1,
    publishedFlag: 1,
    urlTitle: null,
    productTypeName: ROOT_PRODUCT_TYPE_NAME,
    productTypeDescription: null,
    systemCode: null,
    parentProductTypeID,
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    ...overrides,
  };
}

/**
 * A row shaped as the tree read's `SELECT *` plus its two correlated counts.
 *
 * Deliberately carries columns the port's row type does not declare, `urlTitle`, `remoteID` and
 * `activeFlag`.
 *
 * @param overrides cells to replace or add, applied last.
 */
function treeRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  return {
    productTypeID: ROOT_PRODUCT_TYPE_ID,
    productTypeIDPath: ROOT_PATH,
    activeFlag: 1,
    publishedFlag: 1,
    urlTitle: 'merchandise',
    productTypeName: ROOT_PRODUCT_TYPE_NAME,
    productTypeDescription: null,
    systemCode: 'merchandise',
    parentProductTypeID: null,
    remoteID: null,
    isAssigned: ASSIGNED_PRODUCT_COUNT,
    childCount: CHILD_TYPE_COUNT,
    ...overrides,
  };
}

interface ResolvedFlags {
  readonly activeFlag: boolean;
  readonly publishedFlag: boolean;
}

/**
 * Hydrate one row carrying the given flag cells and report the resolved booleans.
 *
 * The boolean cases all differ in exactly one dimension - the raw cell the driver produced.
 *
 * @param flagCells the `activeFlag` and `publishedFlag` cells to project.
 * @returns both flags, as the entity resolves them.
 */
async function readFlagsFromRow(
  flagCells: Readonly<Record<string, unknown>>,
): Promise<ResolvedFlags> {
  const executor = new RecordingExecutor([
    [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH, flagCells)],
  ]);
  const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
  const productType = requireProductType(
    await repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID),
    'the product type whose flags were projected',
  );

  return {
    activeFlag: productType.getActiveFlag(),
    publishedFlag: productType.getPublishedFlag(),
  };
}

const REQUIRED_TREE_ROW_MEMBERS: readonly string[] = ['productTypeID', 'isAssigned', 'childCount'];

const OPTIONAL_TREE_ROW_MEMBERS: readonly string[] = [
  'productTypeName',
  'productTypeIDPath',
  'parentProductTypeID',
];

/**
 * Every statement the adapter can emit, recorded by driving its whole surface.
 *
 * All four port methods and both write routes run against one double, so the schema-continuity and
 * binding assertions are stated over the surface instead of repeated per method.
 */
async function everyEmittedStatement(): Promise<readonly RecordedStatement[]> {
  const executor = new RecordingExecutor([
    [treeRow()],
    [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
    [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
    [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
  ]);
  const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

  await repository.getProductTypeQuery();
  await repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID);
  await repository.getProductTypesByProductTypeIDPath(ROOT_PATH);
  await repository.saveProductType(new ProductType({ productTypeID: '' }), NO_POPULATED_MEMBERS);
  await repository.saveProductType(
    new ProductType({ productTypeID: CHILD_PRODUCT_TYPE_ID }),
    NO_POPULATED_MEMBERS,
  );

  return [...executor.calls, ...executor.mutationCalls];
}

/**
 * Members that sound as though they belong on this adapter and do not.
 *
 * The two search methods are the ones most likely to be added here by mistake:
 * `searchProductsByProductType` is `mysqlProductRepository`'s [model/dao/ProductDAO.cfc:L419] and
 * `searchSkusByProductType` is `mysqlSkuRepository`'s [model/dao/SkuDAO.cfc:L130].
 */
const MEMBERS_THAT_BELONG_ELSEWHERE: readonly string[] = [
  'searchProductsByProductType',
  'searchSkusByProductType',
  'deleteProductType',
  'getProductTypeSmartList',
  'getProductTypeCount',
  'buildProductTypeTree',
  'getAttributeSets',
];

// The names `Object.getOwnPropertyNames` reports on the adapter's prototype.
//
// Four are the port's methods; `readAncestryRowsByPath`, `readProductTypeRow`, `insertProductType`
// and `updateProductType` are TypeScript-private helpers.
const EXPECTED_PROTOTYPE_MEMBERS: readonly string[] = [
  'constructor',
  'getProductTypeByProductTypeID',
  'getProductTypeQuery',
  'getProductTypesByProductTypeIDPath',
  'insertProductType',
  'readAncestryRowsByPath',
  'readProductTypeRow',
  'saveProductType',
  'updateProductType',
];

describe('MysqlProductTypeRepository - net-new coverage with no legacy antecedent', () => {
  describe('composition and the no-database invariant', () => {
    it('declares exactly two constructor parameters, so both collaborators can only be injected', () => {
      expect(MysqlProductTypeRepository.length).toBe(2);
    });

    it('cannot be constructed without an explicitly supplied executor', () => {
      // A never-invoked probe.
      const rejectsMissingExecutor = (): unknown => {
        // @ts-expect-error - the executor is a required constructor argument.
        return new MysqlProductTypeRepository();
      };

      expect(rejectsMissingExecutor).toBeInstanceOf(Function);
    });

    it('satisfies the shipped four-method port under its published type', () => {
      // Typed as the PORT, not as the class.
      const repository: ProductTypeRepository = new MysqlProductTypeRepository(
        new RecordingExecutor([]),
        TEST_AUDIT_ACTOR,
      );

      expect(typeof repository.getProductTypeQuery).toBe('function');
      expect(typeof repository.getProductTypeByProductTypeID).toBe('function');
      expect(typeof repository.getProductTypesByProductTypeIDPath).toBe('function');
      expect(typeof repository.saveProductType).toBe('function');
    });

    it('exposes exactly the four port methods and four private helpers, and nothing else', () => {
      const prototypeMembers = Object.getOwnPropertyNames(
        MysqlProductTypeRepository.prototype,
      ).sort();

      expect(prototypeMembers).toEqual(EXPECTED_PROTOTYPE_MEMBERS);
    });

    it('retains exactly its two collaborators and no other instance state', () => {
      const repository = new MysqlProductTypeRepository(
        new RecordingExecutor([]),
        TEST_AUDIT_ACTOR,
      );
      expect(Reflect.ownKeys(repository)).toEqual(['executor', 'auditActor']);
    });

    it('issues no statement of any kind when it is constructed', () => {
      const executor = new RecordingExecutor([[treeRow()]]);

      new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('offers no unprepared query path through the injected executor', () => {
      const executor = new RecordingExecutor([]);

      // B3. The narrow executor contract publishes `execute` and `executeMutation` only.
      expect('query' in executor).toBe(false);
      expect(Reflect.has(executor, 'query')).toBe(false);
      expect(typeof executor.execute).toBe('function');
      expect(typeof executor.executeMutation).toBe('function');
    });

    it('keeps two instances independent, so nothing is shared at module scope', async () => {
      const firstExecutor = new RecordingExecutor([[treeRow()]]);
      const secondExecutor = new RecordingExecutor([[treeRow()]]);
      const firstRepository = new MysqlProductTypeRepository(firstExecutor, TEST_AUDIT_ACTOR);
      const secondRepository = new MysqlProductTypeRepository(secondExecutor, TEST_AUDIT_ACTOR);

      await firstRepository.getProductTypeQuery();

      expect(firstExecutor.calls).toHaveLength(1);
      expect(secondExecutor.calls).toHaveLength(0);
      expect(secondRepository).not.toBe(firstRepository);
    });
  });
  describe('getProductTypeQuery - the emitted statement', () => {
    it('takes no parameters, exactly as the legacy function declares', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      // Bound before its arity is read, which `Function.prototype.bind` preserves when no argument
      // is pre-applied.
      expect(repository.getProductTypeQuery.bind(repository)).toHaveLength(0);

      await repository.getProductTypeQuery();

      expect(executor.calls).toHaveLength(1);
    });

    it('rejects an argument at compile time', () => {
      const rejectsAnArgument = (repository: ProductTypeRepository): unknown => {
        // @ts-expect-error - getProductTypeQuery is declared with zero parameters.
        return repository.getProductTypeQuery(ROOT_PRODUCT_TYPE_ID);
      };

      expect(rejectsAnArgument).toBeInstanceOf(Function);
    });

    it('emits the ported statement verbatim', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      expect(onlyStatement(executor.calls).sql).toBe(EXPECTED_TREE_STATEMENT);
    });

    it('keeps the isAssigned correlated sub-select and its alias', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      const { sql } = onlyStatement(executor.calls);

      // CFML parity [model/dao/ProductTypeDAO.cfc:L55-L57]: counts products whose productTypeID
      // matches the OUTER product-type row. The correlation is the whole point - a sub-select that
      // lost it would count every product in the catalog for every row.
      expect(sql).toContain(EXPECTED_IS_ASSIGNED_SUBQUERY);
      expect(occurrences(sql, 'as isAssigned')).toBe(1);
      expect(sql).toContain('WHERE SwProduct.productTypeID = SwProductType.productTypeID');
    });

    it('keeps the childCount correlated sub-select, its spt alias and its parent predicate', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      const { sql } = onlyStatement(executor.calls);

      // CFML parity [model/dao/ProductTypeDAO.cfc:L58-L60]: counts product types whose
      // parentProductTypeID matches the outer row - immediate children only, never the whole
      // subtree.
      expect(sql).toContain(EXPECTED_CHILD_COUNT_SUBQUERY);
      expect(occurrences(sql, 'as childCount')).toBe(1);
      expect(sql).toContain('FROM SwProductType spt');
      expect(sql).toContain('WHERE spt.parentProductTypeID = SwProductType.productTypeID');
    });

    it('preserves ORDER BY productTypeName ASC as the final clause', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      const { sql } = onlyStatement(executor.calls);

      // C4.
      // CFML parity [model/dao/ProductTypeDAO.cfc:L62]: the ordering is part of the contract, not
      // an incidental convenience - the legacy hint at L51 describes the result as a "tree-sorted
      // query" and its consumer renders it in the order it arrives.
      //
      // JUDGMENT CALL: the deliberate contrast is with
      // src/repositories/mysql/mysqlPromotionRepository.ts, whose getActivePromotionRewards has no
      // `ORDER BY` and must never gain one.
      expect(sql.endsWith(EXPECTED_ORDER_BY_CLAUSE)).toBe(true);
      expect(occurrences(sql, 'ORDER BY')).toBe(1);
      expect(sql).not.toContain('DESC');
      expect(sql).not.toContain('ORDER BY productTypeName ASC,');
    });

    it('names the physical Sw* tables and no ORM entity name', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      const { sql } = onlyStatement(executor.calls);

      expect(sql).toContain('FROM SwProductType');
      expect(sql).toContain('FROM SwProduct');
      expect(sql).not.toMatch(/Slatwall/);
    });

    it('keeps SELECT * rather than narrowing the projection', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      const { sql } = onlyStatement(executor.calls);

      // CFML parity [model/dao/ProductTypeDAO.cfc:L54]: the legacy hands its consumer every
      // persisted column.
      expect(sql.startsWith('SELECT *,')).toBe(true);
    });

    it('emits no dialect-dependent fragment', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      const { sql } = onlyStatement(executor.calls);

      // `model/dao/ProductTypeDAO.cfc` has no dialect branch, unlike model/dao/PriceGroupDAO.cfc's
      // row-limiting clause and model/dao/PromotionDAO.cfc:L482-L488's path concatenation.
      expect(sql).not.toContain('LIMIT');
      expect(sql).not.toContain('TOP ');
      expect(sql).not.toContain('ROWNUM');
      expect(sql).not.toContain('FETCH FIRST');
      expect(sql).not.toContain('[');
    });
  });
  describe('getProductTypeQuery - the parameter binding', () => {
    it('binds an empty parameter array', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      expect(onlyStatement(executor.calls).params).toEqual([]);
    });

    it('carries no positional placeholder, because it has no value to bind', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      const { sql, params } = onlyStatement(executor.calls);

      expect(placeholderCount(sql)).toBe(0);
      expect(placeholderCount(sql)).toBe(params.length);
    });

    it('emits a constant statement, byte-identical across calls and across instances', async () => {
      const sharedExecutor = new RecordingExecutor([[treeRow()], [treeRow()]]);
      const repository = new MysqlProductTypeRepository(sharedExecutor, TEST_AUDIT_ACTOR);
      const separateExecutor = new RecordingExecutor([[treeRow()]]);
      const separateRepository = new MysqlProductTypeRepository(separateExecutor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();
      await repository.getProductTypeQuery();
      await separateRepository.getProductTypeQuery();

      const firstCall = statementAt(sharedExecutor.calls, 0);
      const secondCall = statementAt(sharedExecutor.calls, 1);

      expect(secondCall.sql).toBe(firstCall.sql);
      expect(onlyStatement(separateExecutor.calls).sql).toBe(firstCall.sql);
      expect(secondCall.params).toEqual([]);
    });

    it('issues exactly one statement and writes nothing', async () => {
      const executor = new RecordingExecutor([[treeRow(), treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeQuery();

      expect(executor.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(0);
    });
  });
  describe('getProductTypeQuery - the projected row shape', () => {
    it('projects both correlated counts as plain numbers, never as a decimal wrapper', async () => {
      const executor = new RecordingExecutor([[treeRow()]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const rows = await repository.getProductTypeQuery();
      const row = treeRowAt(rows, 0);

      expect(typeof row.isAssigned).toBe('number');
      expect(typeof row.childCount).toBe('number');
      expect(row.isAssigned).toBe(ASSIGNED_PRODUCT_COUNT);
      expect(row.childCount).toBe(CHILD_TYPE_COUNT);
      expect(Number.isInteger(row.isAssigned)).toBe(true);
      expect(Number.isInteger(row.childCount)).toBe(true);
    });

    it('keeps the closed six-member projection and drops the other SELECT * columns', async () => {
      const executor = new RecordingExecutor([
        [
          treeRow({
            productTypeID: CHILD_PRODUCT_TYPE_ID,
            productTypeIDPath: CHILD_PATH,
            parentProductTypeID: ROOT_PRODUCT_TYPE_ID,
          }),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const rows = await repository.getProductTypeQuery();
      const row = treeRowAt(rows, 0);

      expect(Object.keys(row).sort()).toEqual(
        [...REQUIRED_TREE_ROW_MEMBERS, ...OPTIONAL_TREE_ROW_MEMBERS].sort(),
      );
      expect(Object.hasOwn(row, 'activeFlag')).toBe(false);
      expect(Object.hasOwn(row, 'urlTitle')).toBe(false);
      expect(Object.hasOwn(row, 'systemCode')).toBe(false);
      expect(Object.hasOwn(row, 'remoteID')).toBe(false);
    });

    it('declares no index signature, so an undeclared column cannot be read off a row', () => {
      const rejectsUndeclaredColumn = (row: ProductTypeTreeRow): unknown => {
        // @ts-expect-error - ProductTypeTreeRow declares no index signature.
        return row['urlTitle'];
      };

      expect(rejectsUndeclaredColumn).toBeInstanceOf(Function);
    });

    it('declares every projected member readonly', () => {
      const rejectsReassignment = (row: ProductTypeTreeRow): void => {
        // @ts-expect-error - ProductTypeTreeRow.isAssigned is readonly.
        row.isAssigned = 0;
      };

      expect(rejectsReassignment).toBeInstanceOf(Function);
    });

    it('omits an optional member entirely when its column arrives as SQL NULL', async () => {
      const executor = new RecordingExecutor([
        [treeRow({ productTypeName: null, productTypeIDPath: null, parentProductTypeID: null })],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const rows = await repository.getProductTypeQuery();
      const row = treeRowAt(rows, 0);

      // ABSENT, not present-and-undefined. `exactOptionalPropertyTypes` makes the two different
      // types, and a present `undefined` would let a consumer that enumerates keys see a member
      // the database has no value for.
      for (const member of OPTIONAL_TREE_ROW_MEMBERS) {
        expect(Object.hasOwn(row, member)).toBe(false);
      }

      for (const member of REQUIRED_TREE_ROW_MEMBERS) {
        expect(Object.hasOwn(row, member)).toBe(true);
      }
    });

    it('omits an optional member entirely when the column is absent from the result set', async () => {
      const executor = new RecordingExecutor([
        [
          {
            productTypeID: ROOT_PRODUCT_TYPE_ID,
            isAssigned: ASSIGNED_PRODUCT_COUNT,
            childCount: CHILD_TYPE_COUNT,
          },
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const rows = await repository.getProductTypeQuery();
      const row = treeRowAt(rows, 0);

      expect(row.productTypeName).toBeUndefined();
      expect(Object.hasOwn(row, 'productTypeName')).toBe(false);
      expect(row.productTypeID).toBe(ROOT_PRODUCT_TYPE_ID);
    });

    it('reads column labels without assuming their casing', async () => {
      // C9's companion rule: CFML identifiers are case-insensitive and some CFML engines hand back
      // upper-cased column labels.
      const executor = new RecordingExecutor([
        [
          {
            PRODUCTTYPEID: ROOT_PRODUCT_TYPE_ID,
            PRODUCTTYPENAME: ROOT_PRODUCT_TYPE_NAME,
            PRODUCTTYPEIDPATH: ROOT_PATH,
            PARENTPRODUCTTYPEID: null,
            ISASSIGNED: ASSIGNED_PRODUCT_COUNT,
            CHILDCOUNT: CHILD_TYPE_COUNT,
          },
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const rows = await repository.getProductTypeQuery();
      const row = treeRowAt(rows, 0);

      expect(row.productTypeID).toBe(ROOT_PRODUCT_TYPE_ID);
      expect(row.productTypeName).toBe(ROOT_PRODUCT_TYPE_NAME);
      expect(row.isAssigned).toBe(ASSIGNED_PRODUCT_COUNT);
      expect(row.childCount).toBe(CHILD_TYPE_COUNT);
    });

    it('narrows a count the driver returned as a big integer', async () => {
      // MySQL's `count(...)` is a `BIGINT`, and the driver hands it back as a `bigint` under some
      // configurations. Both counts here are far inside the exactly representable range, so
      // narrowing is lossless.
      const executor = new RecordingExecutor([[treeRow({ isAssigned: 12n, childCount: 0n })]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const rows = await repository.getProductTypeQuery();
      const row = treeRowAt(rows, 0);

      expect(row.isAssigned).toBe(12);
      expect(row.childCount).toBe(0);
      expect(typeof row.isAssigned).toBe('number');
    });

    it('raises rather than guessing when a required count column is missing', async () => {
      const executor = new RecordingExecutor([
        [{ productTypeID: ROOT_PRODUCT_TYPE_ID, isAssigned: ASSIGNED_PRODUCT_COUNT }],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(repository.getProductTypeQuery());

      // Defaulting an absent count to zero would report every product type as unassigned and
      // childless, which is precisely the answer the legacy consumer branches on.
      expect(error.name).toBe('ProductTypeColumnError');
      expect(error.message).toContain('Column "childCount"');
      expect(error.message).toContain('the product-type tree read');
    });

    it('raises when a count arrives fractional', async () => {
      const executor = new RecordingExecutor([[treeRow({ childCount: 1.5 })]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(repository.getProductTypeQuery());

      expect(error.name).toBe('ProductTypeColumnError');
      expect(error.message).toContain('must arrive as an integer');
    });

    it('raises when a count arrives as text rather than being coerced', async () => {
      const executor = new RecordingExecutor([[treeRow({ isAssigned: '3' })]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(repository.getProductTypeQuery());

      expect(error.name).toBe('ProductTypeColumnError');
      expect(error.message).toContain('Column "isAssigned"');
    });

    it('raises when a projected text column arrives as something other than text', async () => {
      const executor = new RecordingExecutor([[treeRow({ productTypeName: 42 })]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(repository.getProductTypeQuery());

      expect(error.name).toBe('ProductTypeColumnError');
      expect(error.message).toContain('Column "productTypeName"');
    });

    it('returns an empty array for an empty result set, never a null-shaped value', async () => {
      const executor = new RecordingExecutor([[]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const rows = await repository.getProductTypeQuery();

      // CFML parity: a Hibernate-managed collection never handed back null, and
      // meta/tests/unit/entity/BrandTest.cfc pins that convention for `Brand.getProducts()`. An
      // empty catalog is an empty array.
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toEqual([]);
      expect(executor.calls).toHaveLength(1);
    });

    it('maps one projected row per result row, in the order the server returned them', async () => {
      const executor = new RecordingExecutor([
        [
          treeRow({ productTypeID: ROOT_PRODUCT_TYPE_ID, productTypeName: 'Merchandise' }),
          treeRow({ productTypeID: CHILD_PRODUCT_TYPE_ID, productTypeName: 'Apparel' }),
          treeRow({ productTypeID: GRANDCHILD_PRODUCT_TYPE_ID, productTypeName: 'Outerwear' }),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const rows = await repository.getProductTypeQuery();

      expect(rows).toHaveLength(3);
      expect(treeRowAt(rows, 0).productTypeID).toBe(ROOT_PRODUCT_TYPE_ID);
      expect(treeRowAt(rows, 1).productTypeID).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(treeRowAt(rows, 2).productTypeID).toBe(GRANDCHILD_PRODUCT_TYPE_ID);
      expect(treeRowAt(rows, 2).productTypeName).toBe('Outerwear');
    });
  });
  describe('getProductTypeByProductTypeID - NET-NEW, no legacy antecedent', () => {
    it('emits the enumerated hydration projection verbatim', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID);

      const { sql } = onlyStatement(executor.calls);

      expect(sql).toBe(EXPECTED_BY_ID_STATEMENT);
      expect(sql).toContain(EXPECTED_HYDRATION_PROJECTION);
      expect(sql).not.toContain('SELECT *');
    });

    it('binds the identifier and never embeds it in the statement text', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID);

      const { sql, params } = onlyStatement(executor.calls);

      expect(params).toEqual([ROOT_PRODUCT_TYPE_ID]);
      expect(placeholderCount(sql)).toBe(1);
      expect(placeholderCount(sql)).toBe(params.length);
      expect(sql).not.toContain(ROOT_PRODUCT_TYPE_ID);
      expect(sql).toContain('WHERE SwProductType.productTypeID = ?');
    });

    it('binds a hostile identifier unchanged, leaving the statement byte-identical', async () => {
      // A value carrying a quote and a comment marker is what string composition would break on;
      // here it changes the PARAMETER and cannot change one byte of the STATEMENT.
      const hostileIdentifier = "abc' OR 1=1 -- ";
      const executor = new RecordingExecutor([[]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const found = await repository.getProductTypeByProductTypeID(hostileIdentifier);

      const { sql, params } = onlyStatement(executor.calls);

      expect(sql).toBe(EXPECTED_BY_ID_STATEMENT);
      expect(params).toEqual([hostileIdentifier]);
      expect(sql).not.toContain('OR 1=1');
      expect(sql).not.toContain('--');
      expect(found).toBeUndefined();
    });

    it('★★★ walks a three-level ancestry in TWO statements, not one per hop', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(GRANDCHILD_PRODUCT_TYPE_ID, CHILD_PRODUCT_TYPE_ID, GRANDCHILD_PATH)],
        [
          hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH),
          hydrationRow(GRANDCHILD_PRODUCT_TYPE_ID, CHILD_PRODUCT_TYPE_ID, GRANDCHILD_PATH),
          hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const loaded = await repository.getProductTypeByProductTypeID(GRANDCHILD_PRODUCT_TYPE_ID);
      const grandchild = requireProductType(loaded, 'the grandchild product type');
      expect(executor.calls).toHaveLength(2);
      expect(statementAt(executor.calls, 0).sql).toBe(EXPECTED_BY_ID_STATEMENT);
      expect(statementAt(executor.calls, 0).params).toEqual([GRANDCHILD_PRODUCT_TYPE_ID]);
      expect(statementAt(executor.calls, 1).sql).toBe(EXPECTED_BY_ID_PATH_STATEMENT);
      expect(statementAt(executor.calls, 1).params).toEqual([GRANDCHILD_PATH]);

      const child = requireProductType(grandchild.getParentProductType(), 'the child product type');
      const root = requireProductType(child.getParentProductType(), 'the root product type');

      expect(child.getProductTypeID()).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(root.getProductTypeID()).toBe(ROOT_PRODUCT_TYPE_ID);
      expect(root.getParentProductType()).toBeUndefined();
    });

    it('★★★ reads no path at all for a root, so the common case costs ONE statement', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const loaded = await repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID);
      const root = requireProductType(loaded, 'the root product type');

      // The path read is LAZY: it happens at the first hop that needs a parent, and a root has no
      // such hop.
      expect(executor.calls).toHaveLength(1);
      expect(onlyStatement(executor.calls).sql).toBe(EXPECTED_BY_ID_STATEMENT);
      expect(root.getParentProductType()).toBeUndefined();
    });

    it('falls back to a read per hop when the stored path does not name the ancestor', async () => {
      const stalePath = GRANDCHILD_PRODUCT_TYPE_ID;
      const executor = new RecordingExecutor([
        [hydrationRow(GRANDCHILD_PRODUCT_TYPE_ID, CHILD_PRODUCT_TYPE_ID, stalePath)],
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH)],
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const loaded = await repository.getProductTypeByProductTypeID(GRANDCHILD_PRODUCT_TYPE_ID);
      const grandchild = requireProductType(loaded, 'the grandchild product type');

      // The gate refuses to ask for ancestors by a path that does not mention them - a statement
      // that provably cannot answer is not issued.
      expect(executor.calls).toHaveLength(3);
      expect(statementAt(executor.calls, 0).params).toEqual([GRANDCHILD_PRODUCT_TYPE_ID]);
      expect(statementAt(executor.calls, 1).sql).toBe(EXPECTED_BY_ID_STATEMENT);
      expect(statementAt(executor.calls, 1).params).toEqual([CHILD_PRODUCT_TYPE_ID]);
      expect(statementAt(executor.calls, 2).sql).toBe(EXPECTED_BY_ID_STATEMENT);
      expect(statementAt(executor.calls, 2).params).toEqual([ROOT_PRODUCT_TYPE_ID]);

      const child = requireProductType(grandchild.getParentProductType(), 'the child product type');
      const root = requireProductType(child.getParentProductType(), 'the root product type');

      expect(child.getProductTypeID()).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(root.getProductTypeID()).toBe(ROOT_PRODUCT_TYPE_ID);
    });

    it('matches a path element whatever case it is stored in, and issues one path read at most', async () => {
      const executor = new RecordingExecutor([
        [
          hydrationRow(
            GRANDCHILD_PRODUCT_TYPE_ID,
            CHILD_PRODUCT_TYPE_ID,
            [
              ROOT_PRODUCT_TYPE_ID.toUpperCase(),
              CHILD_PRODUCT_TYPE_ID.toUpperCase(),
              GRANDCHILD_PRODUCT_TYPE_ID,
            ].join(PATH_DELIMITER),
          ),
        ],
        [
          hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH),
          hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const loaded = await repository.getProductTypeByProductTypeID(GRANDCHILD_PRODUCT_TYPE_ID);
      const grandchild = requireProductType(loaded, 'the grandchild product type');

      // Two statements for two hops' worth of ancestry, and the second hop reuses the map the
      // first hop populated rather than reading the path again.
      expect(executor.calls).toHaveLength(2);
      expect(statementAt(executor.calls, 1).sql).toBe(EXPECTED_BY_ID_PATH_STATEMENT);

      const child = requireProductType(grandchild.getParentProductType(), 'the child product type');
      const root = requireProductType(child.getParentProductType(), 'the root product type');

      expect(child.getProductTypeID()).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(root.getProductTypeID()).toBe(ROOT_PRODUCT_TYPE_ID);
    });

    it('materializes exactly the declared fetch shape and nothing else', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH)],
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const loaded = await repository.getProductTypeByProductTypeID(CHILD_PRODUCT_TYPE_ID);
      const child = requireProductType(loaded, 'the child product type');
      const root = requireProductType(child.getParentProductType(), 'the root product type');

      // C8. The fetch shape is the ancestry and nothing else: two statements for two rows.
      expect(executor.calls).toHaveLength(2);
      expect(child.getChildProductTypes()).toEqual([]);
      expect(child.getProducts()).toEqual([]);
      expect(child.getPromotionRewards()).toEqual([]);
      expect(child.getPromotionRewardExclusions()).toEqual([]);
      expect(child.getPromotionQualifiers()).toEqual([]);
      expect(child.getPromotionQualifierExclusions()).toEqual([]);
      expect(child.getPriceGroupRates()).toEqual([]);
      expect(child.getPriceGroupRateExclusions()).toEqual([]);

      // JUDGMENT CALL: the ancestry link is one-directional by design.
      expect(root.getChildProductTypes()).toEqual([]);
    });

    it('stops at a dangling parent key instead of raising', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, UNMATCHED_PRODUCT_TYPE_ID, CHILD_PATH)],
        [],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const loaded = await repository.getProductTypeByProductTypeID(CHILD_PRODUCT_TYPE_ID);
      const child = requireProductType(loaded, 'the child product type');

      // CFML parity: Hibernate dereferencing a missing many-to-one target yielded nothing rather
      // than failing the whole load, and the legacy catalog reads the parent defensively. The row
      // that was found is still returned.
      expect(executor.calls).toHaveLength(2);
      expect(statementAt(executor.calls, 1).params).toEqual([UNMATCHED_PRODUCT_TYPE_ID]);
      expect(child.getProductTypeID()).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(child.getParentProductType()).toBeUndefined();
    });

    it('raises on a row that names itself as its own parent, rather than truncating', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(
        repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID),
      );

      // Different answer either.
      expect(error.name).toBe('ProductTypeCycleError');

      // The chain is named, so the offending rows can be found rather than inferred.
      expect(error.message).toContain(ROOT_PRODUCT_TYPE_ID);
      expect(error.message).toContain('form a cycle');

      // And it raises before reading a row it has already read: the cycle is decided on the parent
      // identifier, so exactly one statement was issued.
      expect(executor.calls).toHaveLength(1);
    });

    it('returns undefined for an identifier that matches no row', async () => {
      const executor = new RecordingExecutor([[]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const found = await repository.getProductTypeByProductTypeID(UNMATCHED_PRODUCT_TYPE_ID);

      // `undefined`, and not a blank entity.
      expect(found).toBeUndefined();
      expect(executor.calls).toHaveLength(1);
    });

    it('raises when the row is missing a column the hydration reader needs', async () => {
      const incompleteRow = hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH);
      const { parentProductTypeID: _omitted, ...withoutParentKey } = incompleteRow;
      const executor = new RecordingExecutor([[withoutParentKey]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(
        repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID),
      );

      // The statement names the column, so its absence means statement and reader have drifted
      // apart. Treating it as NULL would silently reparent the row to the tree root.
      expect(error.name).toBe('ProductTypeColumnError');
      expect(error.message).toContain('Column "parentProductTypeID"');
      expect(error.message).toContain('the product-type read by identifier');
    });

    it('hydrates each entity with its collaborator port, with no service-locator lookup', async () => {
      const executor = new RecordingExecutor([
        [
          hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH, {
            systemCode: null,
            productTypeName: 'Apparel',
          }),
        ],
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH, { systemCode: 'merchandise' })],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const loaded = await repository.getProductTypeByProductTypeID(CHILD_PRODUCT_TYPE_ID);
      const child = requireProductType(loaded, 'the child product type');

      // T2, asserted rather than asserted-about. The legacy entity reached its collaborator
      // through `getService("...")`, a runtime lookup no compiler can check.
      const baseProductType = await child.getBaseProductType();

      expect(baseProductType).toBe('merchandise');
      expect(executor.calls).toHaveLength(2);
      expect(statementAt(executor.calls, 1).sql).toBe(EXPECTED_BY_ID_STATEMENT);
      expect(statementAt(executor.calls, 1).params).toEqual([ROOT_PRODUCT_TYPE_ID]);
    });

    it('reports an unwired port instead of falling back to a locator', async () => {
      // Constructed by hand, deliberately without the port, to show there is no ambient fallback:
      // no container to ask, no locator to consult, no request-scoped registry.
      const unwired = new ProductType({
        productTypeID: CHILD_PRODUCT_TYPE_ID,
        productTypeIDPath: CHILD_PATH,
      });

      const error = await rejectionOf(unwired.getBaseProductType());

      expect(error.message).toContain('requires a productTypeRepository');
    });
  });

  // C7 and C8 again, for the method whose parameter is a comma-delimited list.
  describe('getProductTypesByProductTypeIDPath - NET-NEW, no legacy antecedent', () => {
    it('emits the path-membership statement verbatim', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypesByProductTypeIDPath(ROOT_PATH);

      const { sql } = onlyStatement(executor.calls);

      // CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the legacy tests materialized-path
      // membership with an UNANCHORED substring `LIKE` whose MySQL arm is
      // `concat('%', <idColumn>, '%')`, the path being the subject and the column forming the
      // pattern.
      expect(sql).toBe(EXPECTED_BY_ID_PATH_STATEMENT);
      expect(sql).toContain("WHERE ? LIKE concat('%', SwProductType.productTypeID, '%')");
      expect(sql).toContain(EXPECTED_HYDRATION_PROJECTION);
    });

    it('binds the whole path as a single parameter and embeds nothing', async () => {
      const executor = new RecordingExecutor([
        [
          hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH),
          hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypesByProductTypeIDPath(CHILD_PATH);

      const { sql, params } = onlyStatement(executor.calls);

      expect(params).toEqual([CHILD_PATH]);
      expect(placeholderCount(sql)).toBe(1);
      expect(placeholderCount(sql)).toBe(params.length);
      expect(sql).not.toContain(ROOT_PRODUCT_TYPE_ID);
      expect(sql).not.toContain(CHILD_PRODUCT_TYPE_ID);
    });

    it('keeps one placeholder however many elements the path carries, and never builds an IN list', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
        [
          hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH),
          hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH),
          hydrationRow(GRANDCHILD_PRODUCT_TYPE_ID, CHILD_PRODUCT_TYPE_ID, GRANDCHILD_PATH),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductTypesByProductTypeIDPath(ROOT_PATH);
      await repository.getProductTypesByProductTypeIDPath(GRANDCHILD_PATH);

      const oneElementCall = statementAt(executor.calls, 0);
      const threeElementCall = statementAt(executor.calls, 1);

      // The statement is a CONSTANT: a one-element path and a three-element path produce
      // byte-identical text differing only in the bound value.
      expect(threeElementCall.sql).toBe(oneElementCall.sql);
      expect(placeholderCount(threeElementCall.sql)).toBe(1);
      expect(threeElementCall.params).toEqual([GRANDCHILD_PATH]);
      expect(oneElementCall.sql).not.toContain('IN (');
      expect(oneElementCall.sql).not.toContain('IN ()');
      expect(oneElementCall.sql).not.toContain('FIND_IN_SET');
    });

    it('short-circuits an empty path without issuing any statement', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const found = await repository.getProductTypesByProductTypeIDPath('');

      // The alternative would be a statement whose bound value matches every row in the table,
      // because an unanchored `LIKE` on an empty subject is not the same shape of wrong as an
      // empty `IN ()` - it is worse.
      expect(found).toEqual([]);
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('short-circuits a path made only of delimiters, matching CFML list semantics', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      // CFML parity: `listLen()` treats consecutive delimiters as a single separator and counts no
      // empty elements, so `","` and `",,"` are both zero-length lists.
      const singleDelimiter = await repository.getProductTypesByProductTypeIDPath(PATH_DELIMITER);
      const repeatedDelimiters = await repository.getProductTypesByProductTypeIDPath(
        PATH_DELIMITER + PATH_DELIMITER,
      );

      expect(singleDelimiter).toEqual([]);
      expect(repeatedDelimiters).toEqual([]);
      expect(executor.calls).toHaveLength(0);
    });

    it('hydrates each row exactly once and links the results to each other in memory', async () => {
      const executor = new RecordingExecutor([
        [
          hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH),
          hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const productTypes = await repository.getProductTypesByProductTypeIDPath(CHILD_PATH);

      // C8. The row-to-entity factory runs once per ROW, and the identity check is the proof: the
      // child's parent is the root element of the returned array, not a second entity built from
      // the same row.
      expect(productTypes).toHaveLength(2);
      expect(executor.calls).toHaveLength(1);

      const root = productTypeAt(productTypes, 0);
      const child = productTypeAt(productTypes, 1);

      expect(root.getProductTypeID()).toBe(ROOT_PRODUCT_TYPE_ID);
      expect(child.getProductTypeID()).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(child.getParentProductType()).toBe(root);
      expect(root.getParentProductType()).toBeUndefined();
    });

    it('reuses one parent instance for two siblings, and does not call that a cycle', async () => {
      const executor = new RecordingExecutor([
        [
          hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH),
          hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH),
          hydrationRow(SIBLING_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, SIBLING_PATH),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const productTypes = await repository.getProductTypesByProductTypeIDPath(CHILD_PATH);

      // The same row reached twice is not a cycle, and this is the case that pins the difference.
      expect(productTypes).toHaveLength(3);

      const root = productTypeAt(productTypes, 0);

      expect(productTypeAt(productTypes, 1).getParentProductType()).toBe(root);
      expect(productTypeAt(productTypes, 2).getParentProductType()).toBe(root);
      expect(executor.calls).toHaveLength(1);
    });

    it('raises when the rows the path matched point at each other in a loop', async () => {
      const executor = new RecordingExecutor([
        [
          hydrationRow(ROOT_PRODUCT_TYPE_ID, CHILD_PRODUCT_TYPE_ID, ROOT_PATH),
          hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(repository.getProductTypesByProductTypeIDPath(CHILD_PATH));

      // One policy across both guards.
      expect(error.name).toBe('ProductTypeCycleError');
      expect(error.message).toContain('form a cycle');

      // Still only the one statement: the fault is in the rows already in hand, and the linkage
      // issues no query of its own.
      expect(executor.calls).toHaveLength(1);
    });

    it('returns an empty array when a populated path matches no row', async () => {
      const executor = new RecordingExecutor([[]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const productTypes =
        await repository.getProductTypesByProductTypeIDPath(UNMATCHED_PRODUCT_TYPE_ID);

      expect(productTypes).toEqual([]);
      expect(onlyStatement(executor.calls).params).toEqual([UNMATCHED_PRODUCT_TYPE_ID]);
    });

    it('imposes no ordering, and materializes nothing beyond the in-memory linkage', async () => {
      const executor = new RecordingExecutor([
        [
          hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH),
          hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH),
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const productTypes = await repository.getProductTypesByProductTypeIDPath(CHILD_PATH);

      const { sql } = onlyStatement(executor.calls);

      // No `ORDER BY` is emitted and none is asserted as contract: this method has no legacy
      // antecedent, and the caller reconstructs ancestry order from the path it already holds.
      expect(sql).not.toContain('ORDER BY');
      expect(productTypeAt(productTypes, 0).getProductTypeID()).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(productTypeAt(productTypes, 1).getProductTypeID()).toBe(ROOT_PRODUCT_TYPE_ID);
      expect(productTypeAt(productTypes, 0).getChildProductTypes()).toEqual([]);
      expect(productTypeAt(productTypes, 0).getProducts()).toEqual([]);
      expect(executor.calls).toHaveLength(1);
    });
  });
  describe('saveProductType - NET-NEW, and the replacement for the ORM lifecycle hooks', () => {
    it('inserts a never-persisted product type without reading first', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const productType = new ProductType({
        productTypeID: '',
        productTypeName: 'Merchandise',
      });

      const saved = await repository.saveProductType(productType, NO_POPULATED_MEMBERS);

      // An entity with no identifier cannot match a row, so no prior-row read is issued at all:
      // the route is decided from `isNew()`, which is the `unsavedvalue=""` contract
      // [model/entity/ProductType.cfc:L52].
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(1);
      expect(onlyStatement(executor.mutationCalls).sql).toBe(EXPECTED_INSERT_STATEMENT);
      expect(saved).not.toBe(productType);
    });

    it('binds one parameter per inserted column, and interpolates none of them', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({ productTypeID: '', productTypeName: ROOT_PRODUCT_TYPE_NAME }),
        NO_POPULATED_MEMBERS,
      );

      const { sql, params } = onlyStatement(executor.mutationCalls);

      expect(params).toHaveLength(INSERT_PARAMETER_COUNT);
      expect(placeholderCount(sql)).toBe(INSERT_PARAMETER_COUNT);
      expect(placeholderCount(sql)).toBe(params.length);
      expect(sql).not.toContain(ROOT_PRODUCT_TYPE_NAME);
    });

    it('mints an identifier of the persisted width and composes a root path from it', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const saved = await repository.saveProductType(
        new ProductType({ productTypeID: '' }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);
      const mintedIdentifier = saved.getProductTypeID();

      expect(mintedIdentifier).toMatch(MINTED_IDENTIFIER_PATTERN);
      expect(parameterAt(params, 0)).toBe(mintedIdentifier);

      // A root product type's path is its own identifier and nothing else, which is what
      // `buildIDPathList( "parentProductType" )` produced for a row with no parent.
      expect(saved.getProductTypeIDPath()).toBe(mintedIdentifier);
      expect(parameterAt(params, INSERT_PATH_POSITION)).toBe(mintedIdentifier);
      expect(parameterAt(params, INSERT_PARENT_KEY_POSITION)).toBeNull();
    });

    it('stamps one instant into both audit columns on the insert route', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const saved = await repository.saveProductType(
        new ProductType({ productTypeID: '' }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);
      const createdStamp = requireBoundDate(
        parameterAt(params, INSERT_CREATED_STAMP_POSITION),
        'the creation stamp',
      );
      const modifiedStamp = requireBoundDate(
        parameterAt(params, INSERT_MODIFIED_STAMP_POSITION),
        'the modification stamp',
      );

      // CFML parity [org/Hibachi/HibachiEntity.cfc:L609]: one `now()` written to both columns, so
      // a freshly inserted row reads as never modified.
      expect(createdStamp.getTime()).toBe(modifiedStamp.getTime());
      expect(saved.getCreatedDateTime()).toEqual(createdStamp);
      expect(saved.getModifiedDateTime()).toEqual(modifiedStamp);
    });

    it('binds the parent foreign key rather than embedding it, and appends to the parent path', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const parent = new ProductType({
        productTypeID: ROOT_PRODUCT_TYPE_ID,
        productTypeIDPath: ROOT_PATH,
      });

      const saved = await repository.saveProductType(
        new ProductType({ productTypeID: '', parentProductType: parent }),
        NO_POPULATED_MEMBERS,
      );

      const { sql, params } = onlyStatement(executor.mutationCalls);
      const expectedPath = ROOT_PATH + PATH_DELIMITER + saved.getProductTypeID();

      expect(parameterAt(params, INSERT_PARENT_KEY_POSITION)).toBe(ROOT_PRODUCT_TYPE_ID);
      expect(sql).not.toContain(ROOT_PRODUCT_TYPE_ID);
      expect(saved.getProductTypeIDPath()).toBe(expectedPath);
      expect(parameterAt(params, INSERT_PATH_POSITION)).toBe(expectedPath);
      expect(saved.getProductTypeIDPath().split(PATH_DELIMITER)).toHaveLength(2);
    });

    it('inserts a detached product type after its prior-row read finds nothing', async () => {
      const executor = new RecordingExecutor([[]]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const parent = new ProductType({
        productTypeID: ROOT_PRODUCT_TYPE_ID,
        productTypeIDPath: ROOT_PATH,
      });
      const detached = new ProductType({
        productTypeID: UNMATCHED_PRODUCT_TYPE_ID,
        productTypeIDPath: 'a-stale-path-from-before-the-parent-moved',
        parentProductType: parent,
      });

      const saved = await repository.saveProductType(detached, NO_POPULATED_MEMBERS);

      // Hibernate's saveOrUpdate case: the entity carries a key but no row matches it, so the
      // prior-row read decides the route and the insert keeps the entity's own identifier rather
      // than minting a second one.
      expect(onlyStatement(executor.calls).params).toEqual([UNMATCHED_PRODUCT_TYPE_ID]);
      expect(onlyStatement(executor.mutationCalls).sql).toBe(EXPECTED_INSERT_STATEMENT);
      expect(saved).toBe(detached);

      const { params } = onlyStatement(executor.mutationCalls);

      expect(parameterAt(params, 0)).toBe(UNMATCHED_PRODUCT_TYPE_ID);
      expect(parameterAt(params, INSERT_PATH_POSITION)).toBe(
        ROOT_PATH + PATH_DELIMITER + UNMATCHED_PRODUCT_TYPE_ID,
      );
      expect(saved.getProductTypeIDPath()).toBe(
        ROOT_PATH + PATH_DELIMITER + UNMATCHED_PRODUCT_TYPE_ID,
      );
    });

    it('updates a product type whose prior row exists, matching on the key it bound last', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const parent = new ProductType({
        productTypeID: ROOT_PRODUCT_TYPE_ID,
        productTypeIDPath: ROOT_PATH,
      });
      const productType = new ProductType({
        productTypeID: CHILD_PRODUCT_TYPE_ID,
        productTypeIDPath: 'a-stale-path-from-before-the-parent-moved',
        parentProductType: parent,
        createdDateTime: EXISTING_CREATION_INSTANT,
      });

      const saved = await repository.saveProductType(productType, NO_POPULATED_MEMBERS);

      const { sql, params } = onlyStatement(executor.mutationCalls);

      expect(executor.calls).toHaveLength(1);
      expect(sql).toBe(EXPECTED_UPDATE_STATEMENT);
      expect(saved).toBe(productType);
      expect(params).toHaveLength(UPDATE_PARAMETER_COUNT);
      expect(placeholderCount(sql)).toBe(UPDATE_PARAMETER_COUNT);
      expect(placeholderCount(sql)).toBe(params.length);

      // The matched key is bound LAST, after the set columns, because that is the order the
      // placeholders appear in. Binding it first would update the wrong row with the right values.
      expect(parameterAt(params, UPDATE_KEY_POSITION)).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(sql.endsWith('WHERE SwProductType.productTypeID = ?')).toBe(true);
      expect(sql).not.toContain(CHILD_PRODUCT_TYPE_ID);
    });

    it('★★ REFUSES an update that matched NO row rather than reporting the entity as persisted', async () => {
      // Without this refusal an entity whose key names no row RESOLVES, answers the entity
      // carrying that key, and writes nothing.
      const executor = new RecordingExecutor(
        [[hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH)]],
        NO_ROWS_AFFECTED,
      );
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(
        repository.saveProductType(
          new ProductType({
            productTypeID: CHILD_PRODUCT_TYPE_ID,
            productTypeIDPath: CHILD_PATH,
            createdDateTime: EXISTING_CREATION_INSTANT,
          }),
          NO_POPULATED_MEMBERS,
        ),
      );

      expect(error.name).toBe('ProductTypePersistenceError');
      expect(error.message).toContain('matched no SwProductType row');

      // The statement was issued, and it was the update rather than an insert.
      expect(onlyStatement(executor.mutationCalls).sql).toBe(EXPECTED_UPDATE_STATEMENT);
    });

    it('rebuilds the path on the update route and leaves the creation provenance alone', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, ROOT_PRODUCT_TYPE_ID, CHILD_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const parent = new ProductType({
        productTypeID: ROOT_PRODUCT_TYPE_ID,
        productTypeIDPath: ROOT_PATH,
      });
      const productType = new ProductType({
        productTypeID: CHILD_PRODUCT_TYPE_ID,
        productTypeIDPath: 'a-stale-path-from-before-the-parent-moved',
        parentProductType: parent,
        createdDateTime: EXISTING_CREATION_INSTANT,
        createdByAccountID: 'd2f7a41c8b064e93a5107cf6e2b39d85',
      });

      const saved = await repository.saveProductType(productType, NO_POPULATED_MEMBERS);

      const { sql, params } = onlyStatement(executor.mutationCalls);

      expect(parameterAt(params, UPDATE_PATH_POSITION)).toBe(CHILD_PATH);
      expect(saved.getProductTypeIDPath()).toBe(CHILD_PATH);
      expect(CHILD_PATH.split(PATH_DELIMITER)).toEqual([
        ROOT_PRODUCT_TYPE_ID,
        CHILD_PRODUCT_TYPE_ID,
      ]);

      // The creation columns are not in the SET list, so a caller holding an entity hydrated
      // without them cannot overwrite real provenance with nothing.
      expect(sql).not.toContain('createdDateTime =');
      expect(sql).not.toContain('createdByAccountID =');
      expect(params).not.toContain(EXISTING_CREATION_INSTANT);
      expect(saved.getCreatedDateTime()).toBe(EXISTING_CREATION_INSTANT);
    });

    it('restamps only the modification instant on the update route', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({
          productTypeID: CHILD_PRODUCT_TYPE_ID,
          createdDateTime: EXISTING_CREATION_INSTANT,
        }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);
      const modifiedStamp = requireBoundDate(
        parameterAt(params, UPDATE_MODIFIED_STAMP_POSITION),
        'the modification stamp',
      );

      expect(modifiedStamp.getTime()).toBeGreaterThan(EXISTING_CREATION_INSTANT.getTime());
    });

    it('★★ STAMPS THE REQUEST ACTOR and ignores the account a caller put on the entity', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({
          productTypeID: '',
          // A caller naming whoever it likes as the author of the row. This is the spoof.
          createdByAccountID: FORGED_ACCOUNT_ID,
          modifiedByAccountID: FORGED_ACCOUNT_ID,
        }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);

      expect(parameterAt(params, INSERT_CREATED_BY_POSITION)).toBe(TEST_AUDIT_ACTOR.accountID);
      expect(parameterAt(params, INSERT_MODIFIED_BY_POSITION)).toBe(TEST_AUDIT_ACTOR.accountID);
      // The forged value reaches no position at all, not merely not these two.
      expect(params).not.toContain(FORGED_ACCOUNT_ID);
    });

    it('stamps BOTH halves on an insert, matching preInsert calling both setters under one gate', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({ productTypeID: '' }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);

      // [org/Hibachi/HibachiEntity.cfc:L628-L630] setCreatedByAccount and
      // [org/Hibachi/HibachiEntity.cfc:L632-L635] setModifiedByAccount, both inside `preInsert`,
      // both under the same gate - so an inserted row carries the same account twice.
      expect(parameterAt(params, INSERT_CREATED_BY_POSITION)).toBe(TEST_AUDIT_ACTOR.accountID);
      expect(parameterAt(params, INSERT_MODIFIED_BY_POSITION)).toBe(TEST_AUDIT_ACTOR.accountID);
    });

    it('stamps ONLY the modifying half on an update, because preUpdate has no created setter', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({
          productTypeID: CHILD_PRODUCT_TYPE_ID,
          createdDateTime: EXISTING_CREATION_INSTANT,
          createdByAccountID: FORGED_ACCOUNT_ID,
        }),
        NO_POPULATED_MEMBERS,
      );

      const { sql, params } = onlyStatement(executor.mutationCalls);

      // [org/Hibachi/HibachiEntity.cfc:L676-L678] is the WHOLE of preUpdate's stamping: one
      // setter, for the modifying account.
      expect(sql).not.toContain('createdByAccountID =');
      expect(params).not.toContain(FORGED_ACCOUNT_ID);
      expect(parameterAt(params, UPDATE_MODIFIED_BY_POSITION)).toBe(TEST_AUDIT_ACTOR.accountID);
    });

    it('★★ STAMPS NOTHING FOR A NON-ADMIN, reproducing the getAdminAccountFlag half of the gate', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, NON_ADMIN_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({ productTypeID: '', createdByAccountID: FORGED_ACCOUNT_ID }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);
      expect(NON_ADMIN_AUDIT_ACTOR.accountID).toBeDefined();
      expect(parameterAt(params, INSERT_CREATED_BY_POSITION)).toBeNull();
      expect(parameterAt(params, INSERT_MODIFIED_BY_POSITION)).toBeNull();
      expect(params).not.toContain(FORGED_ACCOUNT_ID);
    });

    it('stamps nothing for an anonymous request, reproducing the account isNew half of the gate', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, ANONYMOUS_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({ productTypeID: '' }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);

      // The CFML scope handed back a NEW, empty account when nobody was signed in, and
      // `!getAccount().isNew()` [org/Hibachi/HibachiEntity.cfc:L628] failed on it.
      expect(parameterAt(params, INSERT_CREATED_BY_POSITION)).toBeNull();
      expect(parameterAt(params, INSERT_MODIFIED_BY_POSITION)).toBeNull();
    });

    it('★★ PRESERVES A STORED ATTRIBUTION when the gate refuses, rather than erasing it', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, NON_ADMIN_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({
          productTypeID: CHILD_PRODUCT_TYPE_ID,
          createdDateTime: EXISTING_CREATION_INSTANT,
        }),
        NO_POPULATED_MEMBERS,
      );

      const { sql, params } = onlyStatement(executor.mutationCalls);

      // The point of the coalesce, asserted rather than described.
      expect(parameterAt(params, UPDATE_MODIFIED_BY_POSITION)).toBeNull();
      expect(sql).toContain('modifiedByAccountID = COALESCE(?, modifiedByAccountID)');
    });

    it('reports back the attribution the row will actually hold, not the one it bound', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, NON_ADMIN_AUDIT_ACTOR);

      const saved = await repository.saveProductType(
        new ProductType({
          productTypeID: CHILD_PRODUCT_TYPE_ID,
          createdDateTime: EXISTING_CREATION_INSTANT,
          modifiedByAccountID: STORED_ACCOUNT_ID,
        }),
        // A populated member, so the save takes the re-hydrating return path rather than handing
        // the argument straight back - the path where the bound record and the stored row could
        // disagree.
        { productTypeName: 'A renamed product type' },
      );

      // The statement bound null and the database resolved it to the stored value, so an entity
      // hydrated from the BOUND record alone would claim the attribution had been cleared.
      expect(saved.getModifiedByAccountID()).toBe(STORED_ACCOUNT_ID);
    });

    it('binds absence as SQL NULL and never as undefined', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProductType(
        new ProductType({ productTypeID: '' }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);

      // CFML parity: an ORM property never set persisted as SQL NULL, and
      // `<cfqueryparam null="...">` is how the tag-syntax DAOs spelled the same thing.
      expect(params).not.toContain(undefined);
      expect(parameterAt(params, INSERT_PARENT_KEY_POSITION)).toBeNull();
      expect(params.filter((parameter) => parameter === null).length).toBeGreaterThan(0);
    });

    it('refuses a transient parent before issuing any statement at all', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const transientParent = new ProductType({ productTypeID: '' });
      const child = new ProductType({
        productTypeID: '',
        parentProductType: transientParent,
      });

      const error = await rejectionOf(repository.saveProductType(child, NO_POPULATED_MEMBERS));

      // CFML parity [model/entity/ProductType.cfc:L62]: `parentProductType` declares no cascade,
      // so Hibernate refused a transient association outright rather than writing a placeholder
      // key.
      expect(error.name).toBe('ProductTypePersistenceError');
      expect(executor.mutationCalls).toHaveLength(0);
      expect(executor.calls).toHaveLength(0);
    });

    it('emits only the two known write statements, and never a schema change', async () => {
      const insertExecutor = new RecordingExecutor([]);
      const updateExecutor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
      ]);

      await new MysqlProductTypeRepository(insertExecutor, TEST_AUDIT_ACTOR).saveProductType(
        new ProductType({ productTypeID: '' }),
        NO_POPULATED_MEMBERS,
      );
      await new MysqlProductTypeRepository(updateExecutor, TEST_AUDIT_ACTOR).saveProductType(
        new ProductType({ productTypeID: CHILD_PRODUCT_TYPE_ID }),
        NO_POPULATED_MEMBERS,
      );

      expect(onlyStatement(insertExecutor.mutationCalls).sql).toBe(EXPECTED_INSERT_STATEMENT);
      expect(onlyStatement(updateExecutor.mutationCalls).sql).toBe(EXPECTED_UPDATE_STATEMENT);
      expect(insertExecutor.mutationCalls).toHaveLength(1);
      expect(updateExecutor.mutationCalls).toHaveLength(1);
    });
  });

  // SaveProductType, the populate step: NET-NEW COVERAGE, no legacy antecedent.
  //
  // CHANNEL, and that is what makes these cases the ones that matter most here.
  //
  // The three-way `Object.hasOwn` distinction is the same one `saveProduct` and `saveBrand` rely
  // on: a PRESENT key wins even when it holds `undefined`, in which case SQL NULL is written.
  describe('saveProductType - the populate step, and where a resolved url title lands', () => {
    it('binds the PAYLOAD url title on the insert route, not the entity value it overrides', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      // The service's own shape: neither the entity nor the incoming data had a usable title, the
      // gate generated one, and the struct is how it travels.
      const productType = new ProductType({
        productTypeID: '',
        productTypeName: ROOT_PRODUCT_TYPE_NAME,
      });

      expect(productType.getUrlTitle()).toBeUndefined();

      const saved = await repository.saveProductType(productType, {
        urlTitle: RESOLVED_URL_TITLE,
      });

      const { sql, params } = onlyStatement(executor.mutationCalls);

      // The row carries it. Every sibling case passes an empty payload, so none of them could see
      // this.
      expect(parameterAt(params, INSERT_URL_TITLE_POSITION)).toBe(RESOLVED_URL_TITLE);
      expect(sql).not.toContain(RESOLVED_URL_TITLE);

      // And so does the instance handed back, because the minted-insert route hydrates from the
      // very record that was written.
      expect(saved.getUrlTitle()).toBe(RESOLVED_URL_TITLE);
      expect(productType.getUrlTitle()).toBeUndefined();
      expect(saved).not.toBe(productType);
    });

    it('binds the PAYLOAD product type name, and the two members move independently', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const saved = await repository.saveProductType(
        new ProductType({
          productTypeID: '',
          urlTitle: PERSISTED_URL_TITLE,
          productTypeName: ROOT_PRODUCT_TYPE_NAME,
        }),
        { productTypeName: OVERRIDING_PRODUCT_TYPE_NAME },
      );

      const { params } = onlyStatement(executor.mutationCalls);

      // `productTypeName` present, `urlTitle` absent: one column takes the payload and the other
      // keeps the entity's. A populate step applying the whole payload or none of it would fail
      // one half of this.
      expect(parameterAt(params, INSERT_PRODUCT_TYPE_NAME_POSITION)).toBe(
        OVERRIDING_PRODUCT_TYPE_NAME,
      );
      expect(parameterAt(params, INSERT_URL_TITLE_POSITION)).toBe(PERSISTED_URL_TITLE);
      expect(saved.getProductTypeName()).toBe(OVERRIDING_PRODUCT_TYPE_NAME);
      expect(saved.getUrlTitle()).toBe(PERSISTED_URL_TITLE);
    });

    it('writes SQL NULL for a key PRESENT and holding undefined', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      // The entity has a title and the payload explicitly says there is none - the only way a
      // caller who read a NULL column can say so, which is why the payload declares
      // `?: string | undefined` rather than plain `?:`.
      const saved = await repository.saveProductType(
        new ProductType({ productTypeID: '', urlTitle: PERSISTED_URL_TITLE }),
        { urlTitle: undefined },
      );

      const { params } = onlyStatement(executor.mutationCalls);

      expect(parameterAt(params, INSERT_URL_TITLE_POSITION)).toBeNull();
      expect(params).not.toContain(undefined);
      expect(saved.getUrlTitle()).toBeUndefined();
    });

    it('leaves the entity value in place for a key that is ABSENT', async () => {
      const executor = new RecordingExecutor([]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const saved = await repository.saveProductType(
        new ProductType({ productTypeID: '', urlTitle: PERSISTED_URL_TITLE }),
        NO_POPULATED_MEMBERS,
      );

      const { params } = onlyStatement(executor.mutationCalls);

      // The distinction from the other side: absent is not `undefined`, so nothing is overridden
      // and nothing is nulled.
      expect(parameterAt(params, INSERT_URL_TITLE_POSITION)).toBe(PERSISTED_URL_TITLE);
      expect(saved.getUrlTitle()).toBe(PERSISTED_URL_TITLE);
    });

    it('carries the populated url title through the UPDATE route as well', async () => {
      // An EXISTING row whose `urlTitle` is NULL is precisely what the four-clause gate generates
      // for on a second save.
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const productType = new ProductType({
        productTypeID: CHILD_PRODUCT_TYPE_ID,
        productTypeName: ROOT_PRODUCT_TYPE_NAME,
        createdDateTime: EXISTING_CREATION_INSTANT,
      });

      const saved = await repository.saveProductType(productType, {
        urlTitle: RESOLVED_URL_TITLE,
      });

      const { sql, params } = onlyStatement(executor.mutationCalls);

      expect(sql).toBe(EXPECTED_UPDATE_STATEMENT);
      expect(parameterAt(params, UPDATE_URL_TITLE_POSITION)).toBe(RESOLVED_URL_TITLE);
      expect(sql).not.toContain(RESOLVED_URL_TITLE);

      // A rebuilt instance, because handing back the argument would report a title the row does
      // not hold - carrying the same key, and the creation provenance untouched.
      expect(saved).not.toBe(productType);
      expect(saved.getUrlTitle()).toBe(RESOLVED_URL_TITLE);
      expect(saved.getProductTypeID()).toBe(CHILD_PRODUCT_TYPE_ID);
      expect(saved.getCreatedDateTime()).toStrictEqual(EXISTING_CREATION_INSTANT);

      // And the maintained path survives the rebuild.
      expect(saved.getProductTypeIDPath()).toBe(parameterAt(params, UPDATE_PATH_POSITION));
    });

    it('still answers THE ARGUMENT on the update route when the populate step overrode nothing', async () => {
      // The regression guard for the branch above, and the reason every sibling case can keep
      // asserting `toBe(productType)`: a payload that overrides nothing must keep answering the
      // very instance it was handed.
      const executor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);
      const productType = new ProductType({
        productTypeID: CHILD_PRODUCT_TYPE_ID,
        urlTitle: PERSISTED_URL_TITLE,
        productTypeName: ROOT_PRODUCT_TYPE_NAME,
      });

      expect(await repository.saveProductType(productType, NO_POPULATED_MEMBERS)).toBe(productType);

      // A payload that RESTATES what the entity already holds overrides nothing either, so it
      // takes the same branch.
      const restatingExecutor = new RecordingExecutor([
        [hydrationRow(CHILD_PRODUCT_TYPE_ID, null, CHILD_PATH)],
      ]);

      expect(
        await new MysqlProductTypeRepository(restatingExecutor, TEST_AUDIT_ACTOR).saveProductType(
          productType,
          {
            urlTitle: PERSISTED_URL_TITLE,
            productTypeName: ROOT_PRODUCT_TYPE_NAME,
          },
        ),
      ).toBe(productType);
    });
  });

  // C9, with the divergence recorded in this file's header asserted rather than merely described.
  describe('boolean hydration through cfBoolean, not through Boolean(x)', () => {
    it('resolves SQL NULL to false without collapsing the stored state', async () => {
      const flags = await readFlagsFromRow({ activeFlag: null, publishedFlag: null });

      expect(flags.activeFlag).toBe(false);
      expect(flags.publishedFlag).toBe(false);
    });

    it('resolves the numeric TINYINT forms', async () => {
      const off = await readFlagsFromRow({ activeFlag: 0, publishedFlag: 1 });

      expect(off.activeFlag).toBe(false);
      expect(off.publishedFlag).toBe(true);
    });

    it('resolves the string "0" to false, which is where a bare truthiness test fails', async () => {
      const flags = await readFlagsFromRow({ activeFlag: '0', publishedFlag: '1' });

      // `Boolean('0')` is true in JavaScript and false in CFML.
      expect(flags.activeFlag).toBe(false);
      expect(flags.publishedFlag).toBe(true);
    });

    it('resolves the string "false" to false, which is the other bare-truthiness failure', async () => {
      const flags = await readFlagsFromRow({ activeFlag: 'false', publishedFlag: 'true' });

      // `Boolean('false')` is true in JavaScript.
      expect(flags.activeFlag).toBe(false);
      expect(flags.publishedFlag).toBe(true);
    });

    it('resolves a BIT buffer by unwrapping its first byte', async () => {
      const off = await readFlagsFromRow({
        activeFlag: new Uint8Array([0]),
        publishedFlag: new Uint8Array([1]),
      });

      // `BIT(1)` is the natural physical type for a CFML `boolean` ORM property and the driver
      // surfaces it as a one-byte buffer, which the conversion helper would otherwise reject as
      // unrepresentable.
      expect(off.activeFlag).toBe(false);
      expect(off.publishedFlag).toBe(true);
    });

    it('resolves the driver-native boolean forms', async () => {
      const flags = await readFlagsFromRow({ activeFlag: false, publishedFlag: true });

      expect(flags.activeFlag).toBe(false);
      expect(flags.publishedFlag).toBe(true);
    });

    it('raises on a shape no CFML boolean conversion accepts', async () => {
      const executor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH, { activeFlag: {} })],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const error = await rejectionOf(
        repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID),
      );

      expect(error.name).toBe('ProductTypeColumnError');
      expect(error.message).toContain('Column "activeFlag"');
    });

    it('★★ round-trips a POPULATED productTypeDescription, binding it and hydrating it back', async () => {
      // A 4,000-character value, because that is the declared width
      // [model/entity/ProductType.cfc:L58] and a bind that truncated would be invisible at any
      // shorter length.
      const description = `Decorated apparel. ${'D'.repeat(3981)}`;

      expect(description).toHaveLength(4000);

      // The WRITE HALF: bound as a parameter, at its own ordinal, and never interpolated into SQL.
      const writeExecutor = new RecordingExecutor([]);
      const writeRepository = new MysqlProductTypeRepository(writeExecutor, TEST_AUDIT_ACTOR);

      await writeRepository.saveProductType(
        new ProductType({
          productTypeID: '',
          productTypeName: ROOT_PRODUCT_TYPE_NAME,
          productTypeDescription: description,
        }),
        NO_POPULATED_MEMBERS,
      );

      const { sql, params } = onlyStatement(writeExecutor.mutationCalls);

      expect(parameterAt(params, INSERT_PRODUCT_TYPE_DESCRIPTION_POSITION)).toBe(description);
      expect(sql).not.toContain(description);
      expect(sql).toContain('  productTypeDescription,');

      // The READ HALF: the same value comes back off the row, on the accessor that names it, and
      // no neighbouring column absorbs it.
      const readExecutor = new RecordingExecutor([
        [
          hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH, {
            productTypeDescription: description,
          }),
        ],
      ]);
      const readRepository = new MysqlProductTypeRepository(readExecutor, TEST_AUDIT_ACTOR);
      const hydrated = requireProductType(
        await readRepository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID),
        'the product type whose description was projected',
      );

      expect(hydrated.getProductTypeDescription()).toBe(description);
      expect(hydrated.getProductTypeName()).toBe(ROOT_PRODUCT_TYPE_NAME);
      expect(hydrated.getSystemCode()).toBeUndefined();

      // And SQL null still means absent, so the populated case above is not achieved by
      // defaulting.
      const nullExecutor = new RecordingExecutor([
        [hydrationRow(ROOT_PRODUCT_TYPE_ID, null, ROOT_PATH)],
      ]);
      const nullRepository = new MysqlProductTypeRepository(nullExecutor, TEST_AUDIT_ACTOR);
      const withoutDescription = requireProductType(
        await nullRepository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID),
        'the product type whose description is null',
      );

      expect(withoutDescription.getProductTypeDescription()).toBeUndefined();
    });

    it('reads a flag column whatever casing its label arrives in', async () => {
      const executor = new RecordingExecutor([
        [
          {
            productTypeID: ROOT_PRODUCT_TYPE_ID,
            productTypeIDPath: ROOT_PATH,
            ACTIVEFLAG: '1',
            PublishedFlag: '0',
            urlTitle: null,
            productTypeName: ROOT_PRODUCT_TYPE_NAME,
            productTypeDescription: null,
            systemCode: null,
            parentProductTypeID: null,
            remoteID: null,
            createdDateTime: null,
            createdByAccountID: null,
            modifiedDateTime: null,
            modifiedByAccountID: null,
          },
        ],
      ]);
      const repository = new MysqlProductTypeRepository(executor, TEST_AUDIT_ACTOR);

      const loaded = await repository.getProductTypeByProductTypeID(ROOT_PRODUCT_TYPE_ID);
      const productType = requireProductType(loaded, 'the root product type');

      expect(productType.getActiveFlag()).toBe(true);
      expect(productType.getPublishedFlag()).toBe(false);
    });
  });
  describe('schema continuity across every emitted statement', () => {
    it('emits exactly the five known statements and no sixth', async () => {
      const statements = await everyEmittedStatement();

      expect(statements).toHaveLength(6);

      const distinctStatements = [...new Set(statements.map((statement) => statement.sql))];

      expect(distinctStatements).toHaveLength(5);

      for (const statement of statements) {
        expect(EVERY_EXPECTED_STATEMENT).toContain(statement.sql);
      }
    });

    it('targets only the two existing physical tables', async () => {
      const statements = await everyEmittedStatement();
      const referencedTables = new Set<string>();

      for (const statement of statements) {
        for (const identifier of statement.sql.match(/\bSw[A-Za-z]+\b/g) ?? []) {
          referencedTables.add(identifier);
        }
      }

      // `SwProductType` [model/entity/ProductType.cfc:L49] and `SwProduct`, which the tree read's
      // `isAssigned` sub-select counts.
      expect([...referencedTables].sort()).toEqual(['SwProduct', 'SwProductType']);
    });

    it('names no ORM entity anywhere in the emitted surface', async () => {
      const statements = await everyEmittedStatement();

      for (const statement of statements) {
        expect(statement.sql).not.toMatch(/Slatwall/);
      }
    });

    it('changes no schema: no statement is a data-definition statement', async () => {
      const statements = await everyEmittedStatement();

      // Word-boundary matching on purpose. A naive substring test would report `createdDateTime`
      // as a `CREATE`, and a false positive would push someone towards weakening the check rather
      // than trusting it.
      const dataDefinitionKeyword = /\b(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i;

      for (const statement of statements) {
        expect(statement.sql).not.toMatch(dataDefinitionKeyword);
      }

      expect('createdDateTime = ?').not.toMatch(dataDefinitionKeyword);
    });

    it('binds every value it has, on every statement it emits', async () => {
      const statements = await everyEmittedStatement();

      for (const statement of statements) {
        expect(placeholderCount(statement.sql)).toBe(statement.params.length);
      }

      const treeStatement = statements.filter(
        (statement) => statement.sql === EXPECTED_TREE_STATEMENT,
      );

      expect(treeStatement).toHaveLength(1);
      expect(statementAt(treeStatement, 0).params).toEqual([]);
    });
  });

  // The port publishes four methods and the adapter implements four.
  describe('scope boundaries', () => {
    it('implements no method beyond the four the port publishes', () => {
      const prototypeMembers = new Set(
        Object.getOwnPropertyNames(MysqlProductTypeRepository.prototype),
      );

      for (const forbiddenMember of MEMBERS_THAT_BELONG_ELSEWHERE) {
        expect(prototypeMembers.has(forbiddenMember)).toBe(false);
      }

      expect([...prototypeMembers].sort()).toEqual(EXPECTED_PROTOTYPE_MEMBERS);
    });

    it('publishes exactly four method names on the port, checked exhaustively', () => {
      // `Record<keyof ProductTypeRepository, true>` is an EXHAUSTIVENESS PROOF the compiler
      // performs: a fifth member added to the port makes this literal fail to compile with a
      // missing property.
      const publishedMethodNames: Record<keyof ProductTypeRepository, true> = {
        getProductTypeQuery: true,
        getProductTypeByProductTypeID: true,
        getProductTypesByProductTypeIDPath: true,
        saveProductType: true,
      };

      expect(Object.keys(publishedMethodNames).sort()).toEqual([
        'getProductTypeByProductTypeID',
        'getProductTypeQuery',
        'getProductTypesByProductTypeIDPath',
        'saveProductType',
      ]);
    });

    it('reaches no out-of-scope table from any statement', async () => {
      const statements = await everyEmittedStatement();
      const outOfScopeTables = [
        'SwOrder',
        'SwOrderItem',
        'SwAccount',
        'SwSku',
        'SwSkuCurrency',
        'SwPromotion',
        'SwPromoQual',
        'SwPromoReward',
        'SwPriceGroup',
        'SwPriceGroupRate',
        'SwSubsUsage',
        'SwRoundingRule',
        'SwCategory',
        'SwBrand',
        'SwOption',
        'SwOptionGroup',
      ];

      for (const statement of statements) {
        for (const outOfScopeTable of outOfScopeTables) {
          expect(statement.sql).not.toContain(outOfScopeTable);
        }
      }
    });
  });
});
