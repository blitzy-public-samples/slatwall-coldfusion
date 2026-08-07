// MysqlSkuRepository SQL shape and parameter-binding suite.
//
// For every method on `src/repositories/mysql/mysqlSkuRepository.ts`: the exact SQL text emitted
// and the exact array of parameters bound to it.
//
// It is the authoritative test of a named must-preserve behaviour: the AND-of-EXISTS conjunctive
// option matching that backs `ProductService.getProductSkusBySelectedOptions()`
// [model/service/ProductService.cfc:L104].
//
// Stated plainly rather than implied, because presenting net-new coverage as parity would be a
// false claim about this migration.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Product } from '../../../src/domain/entities/product.js';
// A VALUE import, not a type-only one, and both reasons are live in this file.
import { Sku } from '../../../src/domain/entities/sku.js';
import type { SkuRepository } from '../../../src/domain/ports/skuRepository.js';
import type { CurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import { toCurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { cfBoolean, cfTruthy } from '../../../src/lib/cfml/truthiness.js';
import { appConfig } from '../../../src/lib/config.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import { SQL_TUPLE_ROW_LIMIT } from '../../../src/repositories/mysql/connection.js';
import type { DatabaseDialect } from '../../../src/repositories/mysql/dialect.js';
import {
  optionGroupOdometerPowerFragment,
  resolveConfiguredDialect,
  resolveDialect,
} from '../../../src/repositories/mysql/dialect.js';
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';
import { MysqlSkuRepository } from '../../../src/repositories/mysql/mysqlSkuRepository.js';
// Imported for exactly one read-totality case: the proof that neither the adapter nor the
// contractually total builder beneath it counts the elements of a selected-option list.
import { buildSkusBySelectedOptionsStatement } from '../../../src/repositories/mysql/sql/skusBySelectedOptions.sql.js';
const TEST_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  adminAccountFlag: true,
});

/**
 * Signed in without the admin flag, and carrying an identifier on purpose so a refusal is provably
 * the flag's doing rather than an accident of having nothing to stamp.
 */
const NON_ADMIN_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
  adminAccountFlag: false,
});
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// Identifiers used as bound values.

const OPTION_A = '4f2a91c8b73e40d6ae15c92fb8074d3a';
const OPTION_B = 'c81d05e4fa6b47289d3e6170ba52cf9e';
const OPTION_C = '9b6e37f0d24c418aa5710e83c6fd92b1';

const PRODUCT_ID = '444df2f7ea9c87e60051f3cd87b435a1';
const SKU_ID = 'aaaa1111bbbb2222cccc3333dddd4444';
const OPTION_GROUP_ID = '77c1e5a9b0d34f6e8a2b41c7d9e06f35';
const SKU_CURRENCY_ID = '2e9f4b71c0a84d5eb63f28d19a7c05e4';

const SKU_CODE = 'TEST-SKU-0001';
const ALTERNATE_LOOKUP_CODE = 'ALT-SKU-0001';

// CFML parity: `tests/setup.ts` pins `process.env.TZ` to `'UTC'` before any subject is imported,
// and every date literal in this file is an explicit UTC instant so that a bound timestamp cannot
// depend on the machine that ran the suite.
const AUDIT_INSTANT_UTC = new Date('2024-06-01T00:00:00.000Z');

// Expected SQL, transcribed independently from the legacy source.
//
// These constants are written out by hand from `model/dao/SkuDAO.cfc` rather than imported from
// the modules under test.

const EXPECTED_SELECTED_OPTIONS_SEED =
  'select distinct sku.* from SwSku as sku \n' +
  '\t\t\t\t\tinner join SwSkuOption as opt on opt.skuID = sku.skuID \n' +
  '\t\t\t\t\twhere \n' +
  '\t\t\t\t\t0 = 0 ';

const EXPECTED_OPTION_EXISTS_PREDICATE =
  'and exists (\n' +
  '\t\t\t\t\t\tselect * from SwOption o\n' +
  '\t\t\t\t\t\tjoin SwSkuOption s on s.optionID = o.optionID where s.skuID = sku.skuID\n' +
  '\t\t\t\t\t\tand o.optionID = ?\n' +
  '\t\t\t\t\t) ';

const EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE = 'and sku.productID = ?';

const EXPECTED_SKU_BY_SKU_CODE_SQL =
  'select ss.* from SwSku ss\n' +
  '  left join SwAlternateSkuCode ascs on ascs.skuID = ss.skuID\n' +
  '  where ss.skuCode = ? or ascs.alternateSkuCode = ?';

const EXPECTED_SORTED_PRODUCT_SKUS_SQL = [
  'SELECT',
  '    SwSku.skuID',
  'FROM',
  '    SwSku',
  '  INNER JOIN',
  '    SwSkuOption on SwSku.skuID = SwSkuOption.skuID',
  '  INNER JOIN',
  '    SwOption on SwSkuOption.optionID = SwOption.optionID',
  '  INNER JOIN',
  '    SwOptionGroup on SwOption.optionGroupID = SwOptionGroup.optionGroupID',
  'WHERE',
  '    SwSku.productID = ?',
  'GROUP BY',
  '    SwSku.skuID',
  'ORDER BY',
  '    SUM(SwOption.sortOrder * POWER(10, ? - SwOptionGroup.sortOrder)) ASC',
].join('\n');

const EXPECTED_ODOMETER_POWER_FRAGMENT = 'POWER(10, ? - SwOptionGroup.sortOrder)';

const EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL =
  'SELECT max(SwOptionGroup.sortOrder) as max FROM SwOptionGroup';

const EXPECTED_BARE_PRODUCT_SKUS_SQL = 'SELECT sku.* FROM SwSku sku WHERE sku.productID = ?';

const EXPECTED_CONTENT_ACCESS_PRODUCT_SKUS_SQL =
  'SELECT sku.* FROM SwSku sku ' +
  'INNER JOIN SwSkuAccessContent contents on contents.skuID = sku.skuID ' +
  'WHERE sku.productID = ?';

const EXPECTED_MERCHANDISE_PRODUCT_SKUS_SQL =
  'SELECT sku.* FROM SwSku sku ' +
  'INNER JOIN SwSkuOption `option` on `option`.skuID = sku.skuID ' +
  'WHERE sku.productID = ?';

const EXPECTED_SUBSCRIPTION_PRODUCT_SKUS_SQL =
  'SELECT sku.* FROM SwSku sku ' +
  'INNER JOIN SwSubscriptionTerm st on st.subscriptionTermID = sku.subscriptionTermID ' +
  'INNER JOIN SwSkuSubsBenefit sb on sb.skuID = sku.skuID ' +
  'WHERE sku.productID = ?';

const EXPECTED_SEARCH_SKUS_SQL = 'select * from SwSku where skuCode like ?';

const EXPECTED_SEARCH_SKUS_ONE_PRODUCT_TYPE_SQL =
  EXPECTED_SEARCH_SKUS_SQL +
  ' and productID in (select productID from SwProduct where productTypeID in (?))';

const EXPECTED_SEARCH_SKUS_TWO_PRODUCT_TYPES_SQL =
  EXPECTED_SEARCH_SKUS_SQL +
  ' and productID in (select productID from SwProduct where productTypeID in (?, ?))';

const EXPECTED_SEARCH_SKUS_THREE_PRODUCT_TYPES_SQL =
  EXPECTED_SEARCH_SKUS_SQL +
  ' and productID in (select productID from SwProduct where productTypeID in (?, ?, ?))';

const EXPECTED_TRANSACTION_EXISTS_HEAD = 'SELECT count(ss.skuID) as skuCount FROM SwSku ss WHERE ';

const EXPECTED_TRANSACTION_EXISTS_SKU_KEY = 'ss.skuID = ?';
const EXPECTED_TRANSACTION_EXISTS_PRODUCT_KEY = 'ss.productID = ?';

// CFML parity [model/dao/SkuDAO.cfc:L65-L85]: ten `EXISTS` sub-queries joined by `OR`, in the
// source's own order, with the two `SwStockAdjustmentItem` arms distinguished by `fromStockID` and
// `toStockID`.
const EXPECTED_TRANSACTION_EXISTS_TAIL = [
  '',
  '      AND (',
  '        EXISTS( SELECT a.orderItemID as id FROM SwOrderItem a WHERE a.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.inventoryID as id FROM SwInventory a ' +
    'INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.orderDeliveryItemID as id FROM SwOrderDeliveryItem a ' +
    'INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.physicalCountItemID as id FROM SwPhysicalCountItem a ' +
    'INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.stockAdjustmentDeliveryItemID as id ' +
    'FROM SwStockAdjustmentDeliveryItem a ' +
    'INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.stockAdjustmentItemID as id FROM SwStockAdjustmentItem a ' +
    'INNER JOIN SwStock fromStock on fromStock.stockID = a.fromStockID ' +
    'WHERE fromStock.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.stockAdjustmentItemID as id FROM SwStockAdjustmentItem a ' +
    'INNER JOIN SwStock toStock on toStock.stockID = a.toStockID WHERE toStock.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.stockHoldID as id FROM SwStockHold a ' +
    'INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.stockReceiverItemID as id FROM SwStockReceiverItem a ' +
    'INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )',
  '          OR',
  '        EXISTS( SELECT a.vendorOrderItemID as id FROM SwVendorOrderItem a ' +
    'INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )',
  '      )',
].join('\n');

const EXPECTED_INSERT_SKU_SQL =
  'insert into SwSku (skuID, activeFlag, skuCode, listPrice, price, renewalPrice, imageFile, ' +
  'userDefinedPriceFlag, calculatedQATS, productID, subscriptionTermID, remoteID, createdDateTime, ' +
  'createdByAccountID, modifiedDateTime, modifiedByAccountID) values ' +
  '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const EXPECTED_UPDATE_SKU_SQL =
  'update SwSku set activeFlag = ?, skuCode = ?, listPrice = ?, price = ?, renewalPrice = ?, ' +
  'imageFile = ?, userDefinedPriceFlag = ?, calculatedQATS = ?, productID = ?, ' +
  'subscriptionTermID = ?, remoteID = ?, ' +
  'createdByAccountID = COALESCE(?, createdByAccountID), ' +
  'modifiedDateTime = ?, modifiedByAccountID = COALESCE(?, modifiedByAccountID) where skuID = ?';

const DDL_VERBS = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'] as const;

// The recording executor.
//
// It satisfies `PreparedStatementExecutor` structurally and nominally `implements` is declared, so
// the compiler rejects it the moment the port's shape changes.

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

const NO_ROWS: readonly SqlRow[] = Object.freeze([]);

// Canned rows for the one case that hydrates through the real product adapter.
//
// These belong to `MysqlProductRepository`'s projection, not to this adapter's, which is why they
// are named apart and kept together: `p_`, `b_` and `pt_` prefixes for the forty-five-label
// product graph.

const REAL_LEAF_PRODUCT_TYPE_ID = '4f2c8b1e9d7a44f0a3c6e5b8d1907f24';

const REAL_ROOT_PRODUCT_TYPE_ID = 'a91d7c3f5e264b8d90f1a2c4b6e83d57';

const REAL_PRODUCT_GRAPH_ROW_WITH_LEAF_TYPE: SqlRow = Object.freeze({
  p_productID: PRODUCT_ID,
  p_activeFlag: 1,
  p_urlTitle: 'nike-air-jorden',
  p_productName: 'Nike Air Jorden',
  p_productCode: 'NIKEAIRJORDEN',
  p_productDescription: null,
  p_publishedFlag: 1,
  p_sortOrder: null,
  p_calculatedSalePrice: null,
  p_calculatedQATS: null,
  p_calculatedAllowBackorderFlag: 0,
  p_calculatedTitle: null,
  p_brandID: null,
  p_productTypeID: REAL_LEAF_PRODUCT_TYPE_ID,
  p_defaultSkuID: null,
  p_remoteID: null,
  p_createdDateTime: null,
  p_createdByAccountID: null,
  p_modifiedDateTime: null,
  p_modifiedByAccountID: null,
  b_brandID: null,
  pt_productTypeID: REAL_LEAF_PRODUCT_TYPE_ID,
  pt_productTypeIDPath: `${REAL_ROOT_PRODUCT_TYPE_ID},${REAL_LEAF_PRODUCT_TYPE_ID}`,
  pt_activeFlag: 1,
  pt_publishedFlag: 1,
  pt_urlTitle: 'shoes',
  pt_productTypeName: 'Shoes',
  pt_productTypeDescription: null,
  pt_systemCode: null,
  pt_parentProductTypeID: REAL_ROOT_PRODUCT_TYPE_ID,
  pt_remoteID: null,
  pt_createdDateTime: null,
  pt_createdByAccountID: null,
  pt_modifiedDateTime: null,
  pt_modifiedByAccountID: null,
});

const REAL_ROOT_PRODUCT_TYPE_ROW: SqlRow = Object.freeze({
  productTypeID: REAL_ROOT_PRODUCT_TYPE_ID,
  productTypeIDPath: REAL_ROOT_PRODUCT_TYPE_ID,
  activeFlag: 1,
  publishedFlag: 1,
  urlTitle: 'merchandise',
  productTypeName: 'Merchandise',
  productTypeDescription: null,
  systemCode: 'merchandise',
  parentProductTypeID: null,
  remoteID: null,
  createdDateTime: null,
  createdByAccountID: null,
  modifiedDateTime: null,
  modifiedByAccountID: null,
});

const ONE_ROW_WRITTEN: SqlMutationResult = Object.freeze({ affectedRows: 1, warningStatus: 0 });

const NO_ROWS_WRITTEN: SqlMutationResult = Object.freeze({ affectedRows: 0, warningStatus: 0 });

class RecordingExecutor implements PreparedStatementExecutor {
  public readonly calls: RecordedStatement[] = [];

  public readonly mutationCalls: RecordedStatement[] = [];

  private readonly cannedResultSets: readonly (readonly SqlRow[])[];

  private readonly mutationResult: SqlMutationResult;

  private answeredResultSets = 0;

  public constructor(
    cannedResultSets: readonly (readonly SqlRow[])[] = [],
    mutationResult: SqlMutationResult = ONE_ROW_WRITTEN,
  ) {
    this.cannedResultSets = cannedResultSets;
    this.mutationResult = mutationResult;
  }

  /**
   * Records the pair and answers the next canned result set, or no rows once they run out.
   *
   * `params` carries a default so that a call made with no second argument which the option-group
   * aggregate is, deliberately records as an empty array rather than as `undefined`.
   */
  public execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params: [...params], inTransaction: this.transactionDepth > 0 });

    const cannedRows = this.cannedResultSets[this.answeredResultSets] ?? NO_ROWS;
    this.answeredResultSets += 1;

    return Promise.resolve(cannedRows);
  }

  public executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutationCalls.push({
      sql,
      params: [...params],
      inTransaction: this.transactionDepth > 0,
    });

    return Promise.resolve(this.mutationResult);
  }

  /**
   * How many times `transaction` was entered, counting a JOINED inner call.
   *
   * A write that must be atomic is expected to open EXACTLY one OUTER unit of work.
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
   *
   * A joined inner call records `'JOIN'`, not a second `'BEGIN'`, and contributes no `'COMMIT'`.
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

/**
 * Narrows one recorded statement out of a list, raising with a diagnosable message when it is
 * absent.
 *
 * This exists so that no assertion below needs a postfix `!` or a type assertion to satisfy
 * `noUncheckedIndexedAccess`.
 */
function statementAt(calls: readonly RecordedStatement[], index: number): RecordedStatement {
  const recorded = calls[index];

  if (recorded === undefined) {
    throw new Error(
      `Expected a statement at index ${String(index)} but only ${String(calls.length)} were recorded.`,
    );
  }

  return recorded;
}

/**
 * Narrows the single recorded statement, raising when the count is anything other than one.
 */
function onlyStatement(calls: readonly RecordedStatement[]): RecordedStatement {
  if (calls.length !== 1) {
    throw new Error(
      `Expected exactly one recorded statement but ${String(calls.length)} were recorded.`,
    );
  }

  return statementAt(calls, 0);
}

/**
 * Counts non-overlapping occurrences of a fragment, without a regular expression.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    throw new Error('countOccurrences requires a non-empty needle.');
  }

  let total = 0;
  let cursor = haystack.indexOf(needle);

  while (cursor !== -1) {
    total += 1;
    cursor = haystack.indexOf(needle, cursor + needle.length);
  }

  return total;
}

/**
 * Reads one method off the adapter's prototype for INSPECTION rather than for calling.
 *
 * The interface-parity assertions need a method's declared arity and its name, and reading either
 * one through `MysqlSkuRepository.prototype.someMethod` detaches the method from its receiver
 * which `@typescript-eslint/unbound-method` correctly refuses.
 */
function prototypeMethodOf(methodName: keyof SkuRepository): { name: string; arity: number } {
  const member: unknown = Reflect.get(MysqlSkuRepository.prototype, methodName);

  if (typeof member !== 'function') {
    throw new Error(`MysqlSkuRepository.prototype.${methodName} should be a method`);
  }

  return { name: member.name, arity: member.length };
}

// The base-product-type double.
//
// JUDGMENT CALL: `getProductSkus(product, fetchOptions)` branches on
// `await product.getBaseProductType()` [model/dao/SkuDAO.cfc:L154-L158], and the four SQL shapes
// can only be reached by varying that value.

class StubbedBaseTypeProduct extends Product {
  private readonly stubbedBaseProductType: string | undefined;

  public constructor(productID: string, stubbedBaseProductType: string | undefined) {
    super({ productID });
    this.stubbedBaseProductType = stubbedBaseProductType;
  }

  public override getBaseProductType(): Promise<string | undefined> {
    return Promise.resolve(this.stubbedBaseProductType);
  }
}

// Every column the hydration factory reads must be PRESENT on the row.

function makeSkuRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  return Object.freeze({
    skuID: SKU_ID,
    activeFlag: 1,
    skuCode: SKU_CODE,
    listPrice: '24.99',
    price: '19.99',
    renewalPrice: null,
    imageFile: null,
    userDefinedPriceFlag: 0,
    calculatedQATS: 7,
    productID: PRODUCT_ID,
    subscriptionTermID: null,
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    ...overrides,
  });
}

function makeSkuCurrencyRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  return Object.freeze({
    skuCurrencyID: SKU_CURRENCY_ID,
    price: '17.50',
    renewalPrice: null,
    listPrice: null,
    skuID: SKU_ID,
    currencyCode: 'EUR',
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    ...overrides,
  });
}

function makeSkuOptionRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  return Object.freeze({
    link_skuID: SKU_ID,
    optionID: OPTION_A,
    optionCode: 'RED',
    optionName: 'Red',
    optionDescription: null,
    sortOrder: 1,
    optionGroupID: OPTION_GROUP_ID,
    defaultImageID: null,
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    optionGroup_optionGroupID: OPTION_GROUP_ID,
    optionGroup_optionGroupName: 'Colour',
    optionGroup_optionGroupCode: 'colour',
    optionGroup_optionGroupImage: null,
    optionGroup_optionGroupDescription: null,
    optionGroup_imageGroupFlag: 0,
    optionGroup_sortOrder: 1,
    optionGroup_remoteID: null,
    optionGroup_createdDateTime: null,
    optionGroup_createdByAccountID: null,
    optionGroup_modifiedDateTime: null,
    optionGroup_modifiedByAccountID: null,
    ...overrides,
  });
}

// Configuring a dialect for the cases whose SUBJECT is configuration.
//
// JUDGMENT CALL: `buildSortedProductSkusStatement` resolves the dialect inside its own body rather
// than accepting it as an argument, so a case that varies the dialect must vary the environment
// rather than the call.

const PLACEHOLDER_VALUE = 'unused-by-this-suite';

const CONFIGURED_DIALECT_ENVIRONMENT: readonly (readonly [string, string])[] = Object.freeze([
  Object.freeze(['DB_HOST', 'slatwall-database.invalid'] as const),
  Object.freeze(['DB_USER', PLACEHOLDER_VALUE] as const),
  Object.freeze(['DB_PASSWORD', PLACEHOLDER_VALUE] as const),
  Object.freeze(['DB_TLS_MODE', 'verify-identity'] as const),
  Object.freeze(['DB_DIALECT', 'mysql'] as const),
]);

function applyConfiguredDialectEnvironment(): void {
  appConfig.reset();

  for (const [name, value] of CONFIGURED_DIALECT_ENVIRONMENT) {
    vi.stubEnv(name, value);
  }
}

/**
 * Removes all five variables so that "the process is unconfigured" is a fact this suite
 * establishes rather than a property of the machine it happens to run on.
 *
 * Without this, a developer with the variables exported in their shell would see the hard-error
 * assertions pass for the wrong reason, or fail for one.
 */
function applyUnconfiguredDialectEnvironment(): void {
  appConfig.reset();

  for (const [name] of CONFIGURED_DIALECT_ENVIRONMENT) {
    vi.stubEnv(name, undefined);
  }
}

function revertConfiguredDialectEnvironment(): void {
  vi.unstubAllEnvs();
  appConfig.reset();
}

describe('MysqlSkuRepository SQL shape and parameter binding (NET-NEW: no legacy antecedent)', () => {
  describe('the ported method surface is the seven port methods and nothing else', () => {
    it('assigns to the port type with no widening, proving the class implements it', () => {
      // Composed by HAND with an explicit constructor argument. No container, no locator, no
      // bootstrap and no ambient request scope which is the whole point of replacing the legacy
      // convention scan.
      const repository: SkuRepository = new MysqlSkuRepository(
        new RecordingExecutor(),
        TEST_AUDIT_ACTOR,
      );

      expect(repository).toBeInstanceOf(MysqlSkuRepository);
    });

    it('exposes exactly seven methods, enumerated exhaustively by the compiler', () => {
      // `Record<keyof SkuRepository, true>` makes this exhaustive at COMPILE time: omit a method
      // and the literal fails to type-check, add an EIGHTH the literal does not name and the extra
      // key is rejected.
      const portMethods: Readonly<Record<keyof SkuRepository, true>> = Object.freeze({
        getTransactionExistsFlag: true,
        getSkuBySkuCode: true,
        getSkusBySelectedOptions: true,
        searchSkusByProductType: true,
        getProductSkus: true,
        getSortedProductSkusID: true,
        saveSku: true,
      });

      expect(Object.keys(portMethods)).toHaveLength(7);

      const repository = new MysqlSkuRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      for (const methodName of Object.keys(portMethods)) {
        expect(typeof Reflect.get(repository, methodName)).toBe('function');
      }
    });

    it('does NOT expose getSkuStocksDeletableFlag, which is deliberately absent', () => {
      const repository = new MysqlSkuRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      expect('getSkuStocksDeletableFlag' in repository).toBe(false);
      expect(Reflect.get(repository, 'getSkuStocksDeletableFlag')).toBeUndefined();
    });

    it('declares no limit, timeout, retry or transaction parameter on any method', () => {
      // The word "batch" left this title for one revision and has returned.
      //
      // And `saveSku`'s arity of 1 is load-bearing, not incidental.
      const expectedArities: ReadonlyArray<readonly [keyof SkuRepository, number]> = [
        ['getTransactionExistsFlag', 2],
        ['getSkuBySkuCode', 1],
        ['getSkusBySelectedOptions', 2],
        ['searchSkusByProductType', 2],
        ['getProductSkus', 2],
        ['getSortedProductSkusID', 1],
        ['saveSku', 1],
      ];

      for (const [methodName, arity] of expectedArities) {
        const method = prototypeMethodOf(methodName);
        expect(method.name).toBe(methodName);
        expect(method.arity).toBe(arity);
      }
    });

    it('constructs from an executor and an audit actor, with collaborator ports optional', () => {
      // The executor is a CONSTRUCTOR PARAMETER, and that is a mandate rather than a convenience:
      // `src/repositories/mysql/connection.ts` names these suites as the reason.
      expect(MysqlSkuRepository).toHaveLength(2);
    });
  });

  describe('getSkusBySelectedOptions emits one ANDed EXISTS per selected option', () => {
    // CFML parity [model/dao/SkuDAO.cfc:L106]: the source states the contract in its own comment
    // "returns product skus which matches all options (list of optionIDs) that are passed in".
    // All, not any: the predicate is CONJUNCTIVE.

    // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L107-L128]: the `opt` join alias is never referenced in
    // the WHERE clause; the join is nonetheless load-bearing (it excludes option-less SKUs) and is
    // harmless only because of the DISTINCT.
    // Preserved deliberately; do not fix without a product decision.

    it('grows by exactly one EXISTS clause and one bound parameter for 1 selected option', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(countOccurrences(statement.sql, EXPECTED_OPTION_EXISTS_PREDICATE)).toBe(1);
      expect(statement.params).toStrictEqual([OPTION_A]);
      expect(statement.sql).toBe(EXPECTED_SELECTED_OPTIONS_SEED + EXPECTED_OPTION_EXISTS_PREDICATE);
    });

    it('grows by exactly one EXISTS clause and one bound parameter for 2 selected options', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(
        OPTION_A + ',' + OPTION_B,
      );

      const statement = onlyStatement(executor.calls);

      expect(countOccurrences(statement.sql, EXPECTED_OPTION_EXISTS_PREDICATE)).toBe(2);
      expect(statement.params).toStrictEqual([OPTION_A, OPTION_B]);
      expect(statement.sql).toBe(
        EXPECTED_SELECTED_OPTIONS_SEED +
          EXPECTED_OPTION_EXISTS_PREDICATE +
          EXPECTED_OPTION_EXISTS_PREDICATE,
      );
    });

    it('grows by exactly one EXISTS clause and one bound parameter for 3 selected options', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(
        OPTION_A + ',' + OPTION_B + ',' + OPTION_C,
      );

      const statement = onlyStatement(executor.calls);

      expect(countOccurrences(statement.sql, EXPECTED_OPTION_EXISTS_PREDICATE)).toBe(3);
      expect(statement.params).toStrictEqual([OPTION_A, OPTION_B, OPTION_C]);
      expect(statement.sql).toBe(
        EXPECTED_SELECTED_OPTIONS_SEED +
          EXPECTED_OPTION_EXISTS_PREDICATE +
          EXPECTED_OPTION_EXISTS_PREDICATE +
          EXPECTED_OPTION_EXISTS_PREDICATE,
      );
    });

    it('grows the clause count and the parameter count in lock-step across 1, 2 and 3 options', async () => {
      const selections: readonly (readonly string[])[] = [
        [OPTION_A],
        [OPTION_A, OPTION_B],
        [OPTION_A, OPTION_B, OPTION_C],
      ];

      for (const selection of selections) {
        const executor = new RecordingExecutor([NO_ROWS]);

        await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(
          selection.join(','),
        );

        const statement = onlyStatement(executor.calls);
        const clauseCount = countOccurrences(statement.sql, EXPECTED_OPTION_EXISTS_PREDICATE);
        const placeholderCount = countOccurrences(statement.sql, '?');

        expect(clauseCount).toBe(selection.length);
        expect(statement.params).toHaveLength(selection.length);
        expect(placeholderCount).toBe(statement.params.length);
      }
    });

    it('keeps the 0 = 0 seed predicate so every later clause appends with a uniform leading and', async () => {
      // JUDGMENT CALL: the target KEEPS the literal `0 = 0` seed rather than emitting a clean
      // `WHERE` with the first predicate unprefixed.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql.startsWith(EXPECTED_SELECTED_OPTIONS_SEED)).toBe(true);
      expect(countOccurrences(statement.sql, '0 = 0')).toBe(1);

      const predicates = statement.sql
        .slice(EXPECTED_SELECTED_OPTIONS_SEED.length)
        .split('and ')
        .filter((fragment) => fragment.trim().length > 0);

      // One `and`-introduced predicate for the single option, and the nested `and o.optionID = ?`
      // that lives inside it. Nothing else follows the seed.
      expect(predicates).toHaveLength(2);
    });

    it('preserves DISTINCT and the load-bearing SwSkuOption join', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toContain('select distinct sku.* from SwSku as sku');
      expect(statement.sql).toContain('inner join SwSkuOption as opt on opt.skuID = sku.skuID');
      expect(statement.sql).not.toContain('left join SwSkuOption as opt');
    });

    it('omits the product predicate and its parameter entirely when productID is not supplied', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).not.toContain(EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE);
      expect(statement.params).toStrictEqual([OPTION_A]);
    });

    it('emits the product predicate exactly once, with productID bound LAST, when it is supplied', async () => {
      // That revision recorded a prerequisite read of the product's own option identifiers before
      // the matching query, to feed a fail-closed membership check in the statement builder.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(
        OPTION_A + ',' + OPTION_B,
        PRODUCT_ID,
      );

      expect(executor.calls).toHaveLength(1);

      const matching = onlyStatement(executor.calls);
      expect(countOccurrences(matching.sql, EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE)).toBe(1);
      expect(matching.sql).toBe(
        EXPECTED_SELECTED_OPTIONS_SEED +
          EXPECTED_OPTION_EXISTS_PREDICATE +
          EXPECTED_OPTION_EXISTS_PREDICATE +
          EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE,
      );

      // C1.5: option-list order first, in the order the identifiers appear in the comma list, then
      // productID last clause order and parameter order are the same order.
      expect(matching.params).toStrictEqual([OPTION_A, OPTION_B, PRODUCT_ID]);
    });

    it('emits the product predicate and binds the empty string when productID is supplied as empty', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L123]: the product guard is `structKeyExists` with no
      // length test, so an empty-string productID is bound and the predicate is emitted rather
      // than skipped.
      // Preserved deliberately; do not fix without a product decision.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions('', '');

      expect(executor.calls).toHaveLength(1);

      const matching = onlyStatement(executor.calls);
      expect(matching.sql).toBe(
        EXPECTED_SELECTED_OPTIONS_SEED + EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE,
      );
      expect(matching.params).toStrictEqual(['']);
    });

    it('ANSWERS a selection whose options cannot belong to the narrowed product', async () => {
      // This case asserted the opposite, and the opposite was wrong.
      //
      // It expected a `SelectedOptionsError`: an empty-string productID matches no product, so the
      // product owns no options, so no non-empty selection could be a subset of them.
      const executor = new RecordingExecutor([NO_ROWS]);

      const found = await new MysqlSkuRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).getSkusBySelectedOptions(OPTION_A, '');

      expect(found).toStrictEqual([]);
      expect(executor.calls).toHaveLength(1);

      const matching = onlyStatement(executor.calls);
      expect(matching.sql).toBe(
        EXPECTED_SELECTED_OPTIONS_SEED +
          EXPECTED_OPTION_EXISTS_PREDICATE +
          EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE,
      );
      expect(matching.params).toStrictEqual([OPTION_A, '']);
    });

    it('BINDS an option identifier no bound would have admitted, and answers zero rows', async () => {
      const unmatchable = 'a'.repeat(33);
      const executor = new RecordingExecutor([NO_ROWS]);

      const found = await new MysqlSkuRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).getSkusBySelectedOptions(unmatchable, PRODUCT_ID);

      expect(found).toStrictEqual([]);
      expect(executor.calls).toHaveLength(1);

      const matching = onlyStatement(executor.calls);
      expect(matching.sql).not.toContain(unmatchable);
      expect(matching.params).toStrictEqual([unmatchable, PRODUCT_ID]);
    });

    it('puts no option identifier and no product identifier into the SQL text', async () => {
      // Parameterized SQL, asserted directly. Every value travels in the bound array; the
      // statement text carries placeholders only.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(
        OPTION_A + ',' + OPTION_C,
        PRODUCT_ID,
      );

      for (const statement of executor.calls) {
        expect(statement.sql).not.toContain(OPTION_A);
        expect(statement.sql).not.toContain(OPTION_C);
        expect(statement.sql).not.toContain(PRODUCT_ID);
      }

      const matching = onlyStatement(executor.calls);
      expect(countOccurrences(matching.sql, '?')).toBe(matching.params.length);
      expect(matching.params).toStrictEqual([OPTION_A, OPTION_C, PRODUCT_ID]);
    });
  });

  // C-2 getSkuBySkuCode one value, two bindings.
  describe('getSkuBySkuCode binds one supplied value at both occurrences', () => {
    it('matches the primary skuCode OR an alternate code, over a LEFT join', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the join must stay a LEFT join. An inner join
      // would exclude every SKU that has no alternate code at all, which is most of them, and the
      // primary-code lookup would silently stop working for exactly those rows.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(SKU_CODE);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SKU_BY_SKU_CODE_SQL);
      expect(statement.sql).toContain('left join SwAlternateSkuCode ascs on ascs.skuID = ss.skuID');
      expect(statement.sql).toContain('where ss.skuCode = ? or ascs.alternateSkuCode = ?');
      expect(statement.sql).not.toContain('inner join SwAlternateSkuCode');
    });

    it('binds the single logical value TWICE, once per placeholder', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the legacy uses a NAMED parameter, `:skuCode`,
      // referenced at two sites and supplied once. The pool leaves named placeholders switched
      // off, so the port is positional and the same value must be bound at both positions.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(
        ALTERNATE_LOOKUP_CODE,
      );

      const statement = onlyStatement(executor.calls);

      expect(countOccurrences(statement.sql, '?')).toBe(2);
      expect(statement.params).toStrictEqual([ALTERNATE_LOOKUP_CODE, ALTERNATE_LOOKUP_CODE]);
      expect(statement.sql).not.toContain(':skuCode');
      expect(statement.sql).not.toContain(ALTERNATE_LOOKUP_CODE);
    });

    it('answers undefined for a zero-row result, with no hydration statement issued', async () => {
      // Never a zero, never an empty object, and never a raised error for the empty case. The port
      // declares `Promise<Sku | undefined>` and the absent case is a real state.
      const executor = new RecordingExecutor([NO_ROWS]);

      const found = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(
        SKU_CODE,
      );

      expect(found).toBeUndefined();
      expect(executor.calls).toHaveLength(1);
    });

    it('raises on a multi-row result, reproducing the legacy unique-result contract', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the third argument to the legacy query call is
      // `true`, which asks the ORM for a unique result and raises when more than one row comes
      // back.
      const executor = new RecordingExecutor([[makeSkuRow(), makeSkuRow({ skuID: OPTION_B })]]);

      await expect(
        new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(SKU_CODE),
      ).rejects.toThrow(/unique result/u);
    });
  });

  // C-3 getSortedProductSkusID the option-group ordering, and the dialect.
  describe('getSortedProductSkusID emits the option-group positional-weight ordering', () => {
    // The carried-forward TODO, reproduced character for character from
    // [model/dao/SkuDAO.cfc:L177].
    //
    // TODO: test to see if this query works with DB's other than MSSQL and MySQL.
    //
    // Its presence in the shipped builder, the adapter and the dialect module was verified by
    // reading all three during discovery.

    // JUDGMENT CALL: legacy interpolates #getNextOptionGroupSortOrder()# directly into the ORDER
    // by (model/dao/SkuDAO.cfc:L194-L197); the target binds it as a prepared-statement parameter.

    describe('with the MySQL dialect the adapter states for itself', () => {
      afterEach(() => {
        revertConfiguredDialectEnvironment();
      });

      it('projects one column, joins the three link tables and groups by skuID', async () => {
        const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS]);

        await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

        const statement = statementAt(executor.calls, 1);

        expect(statement.sql).toBe(EXPECTED_SORTED_PRODUCT_SKUS_SQL);
        expect(statement.sql).toContain('    SwSku.skuID');
        expect(countOccurrences(statement.sql, 'INNER JOIN')).toBe(3);
        expect(statement.sql).toContain('SwSkuOption on SwSku.skuID = SwSkuOption.skuID');
        expect(statement.sql).toContain('SwOption on SwSkuOption.optionID = SwOption.optionID');
        expect(statement.sql).toContain(
          'SwOptionGroup on SwOption.optionGroupID = SwOptionGroup.optionGroupID',
        );
        expect(statement.sql).toContain('GROUP BY\n    SwSku.skuID');
      });

      it('reproduces the MySQL ordering expression exactly, ASC and uncast', async () => {
        const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS]);

        await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

        const statement = statementAt(executor.calls, 1);

        expect(statement.sql).toContain(
          'ORDER BY\n    SUM(SwOption.sortOrder * POWER(10, ? - SwOptionGroup.sortOrder)) ASC',
        );
        // The multiplication, the base of ten, the subtraction order and the direction are each
        // pinned separately so that a partial "simplification" cannot slip through a single string
        // compare.
        expect(statement.sql).toContain('SwOption.sortOrder * POWER(');
        expect(statement.sql).toContain('POWER(10, ? - SwOptionGroup.sortOrder)');
        expect(statement.sql).not.toContain('SwOptionGroup.sortOrder - ?');
        expect(statement.sql).not.toContain('CAST(');
        expect(statement.sql).not.toContain('bigint');
        expect(statement.sql.trimEnd().endsWith(') ASC')).toBe(true);
        expect(statement.sql).not.toContain('DESC');
        expect(statement.sql).not.toContain('RANK()');
        expect(statement.sql).not.toContain('ROW_NUMBER()');
      });

      it('BINDS the odometer instead of interpolating it, with productID bound first', async () => {
        const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS]);

        await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

        const statement = statementAt(executor.calls, 1);

        // The parameter order is the order the clauses appear in the emitted statement: the
        // `WHERE` predicate precedes the `ORDER BY`, so `productID` is bound first and the
        // odometer second.
        expect(statement.params).toStrictEqual([PRODUCT_ID, 5]);
        expect(countOccurrences(statement.sql, '?')).toBe(2);

        // No numeric literal for the odometer survives in the text.
        expect(statement.sql).not.toContain('POWER(10, 5');
        expect(statement.sql).not.toContain(PRODUCT_ID);
      });

      it('returns skuID strings in the order the statement emitted them', async () => {
        // The legacy returns the query object itself [model/dao/SkuDAO.cfc:L201]; the port reads
        // out the one projected column.
        const executor = new RecordingExecutor([
          [Object.freeze({ max: 2 })],
          [
            Object.freeze({ skuID: 'ccc33333ccc33333ccc33333ccc33333' }),
            Object.freeze({ skuID: 'aaa11111aaa11111aaa11111aaa11111' }),
            Object.freeze({ skuID: 'bbb22222bbb22222bbb22222bbb22222' }),
          ],
        ]);

        const identifiers = await new MysqlSkuRepository(
          executor,
          TEST_AUDIT_ACTOR,
        ).getSortedProductSkusID(PRODUCT_ID);

        expect(identifiers).toStrictEqual([
          'ccc33333ccc33333ccc33333ccc33333',
          'aaa11111aaa11111aaa11111aaa11111',
          'bbb22222bbb22222bbb22222bbb22222',
        ]);
        // Identifiers, not entities: the name ends in `ID` and nothing is hydrated, so no currency
        // or option statement follows.
        expect(executor.calls).toHaveLength(2);
      });

      it('resolves a case-folded dialect spelling to the canonical MySQL value', () => {
        // The one case in this block that reads configuration, so it supplies its own. The stubbed
        // value is the lowercase `mysql`; the resolver normalizes it.
        applyConfiguredDialectEnvironment();

        expect(resolveConfiguredDialect()).toBe('MySQL');
      });
    });

    describe('dialect resolution, asserted without a database or a statement', () => {
      beforeEach(() => {
        applyUnconfiguredDialectEnvironment();
      });

      afterEach(() => {
        revertConfiguredDialectEnvironment();
      });

      it('folds every spelling of MySQL onto the canonical value', () => {
        for (const spelling of ['mysql', 'MySQL', 'mySQL', 'mySql', '  MYSQL  ']) {
          expect(resolveDialect(spelling)).toBe('MySQL');
        }

        expect(resolveDialect('MICROSOFTSQLSERVER')).toBe('MicrosoftSQLServer');
        expect(resolveDialect('oracle10g')).toBe('Oracle10g');
      });

      it('raises for an unrecognized dialect, naming the variable and the three accepted values', () => {
        // No silent default anywhere: the legacy conditional chain at
        // `config/configORM.cfm:L9-L15` ends with no else arm, so an unknown engine aborted rather
        // than guessing.
        let message = '';

        try {
          resolveDialect('Postgres');
        } catch (raised: unknown) {
          message = raised instanceof Error ? raised.message : String(raised);
        }

        expect(message).toContain('DB_DIALECT');
        expect(message).toContain('MySQL');
        expect(message).toContain('MicrosoftSQLServer');
        expect(message).toContain('Oracle10g');
      });

      it('raises rather than emitting a silently wrong statement for a non-MySQL dialect', () => {
        const rejected: readonly DatabaseDialect[] = ['MicrosoftSQLServer', 'Oracle10g'];

        for (const dialect of rejected) {
          expect(() =>
            optionGroupOdometerPowerFragment(dialect, 'SwOptionGroup.sortOrder'),
          ).toThrow(/not implemented by this port/u);
        }

        expect(optionGroupOdometerPowerFragment('MySQL', 'SwOptionGroup.sortOrder')).toBe(
          EXPECTED_ODOMETER_POWER_FRAGMENT,
        );
      });

      it('★ COMPLETES ON A COMPLETELY UNCONFIGURED PROCESS, emitting both statements', async () => {
        // It read "raises when the dialect is unset, after issuing only the aggregate statement"
        // and asserted that `getSortedProductSkusID` REJECTED whenever the five no-default `DB_*`
        // variables were absent.
        //
        // The environment is explicitly EMPTIED by the enclosing `beforeEach`, so this passes
        // because no configuration is read.
        const executor = new RecordingExecutor([
          [Object.freeze({ max: 4 })],
          [Object.freeze({ skuID: 'aaa11111aaa11111aaa11111aaa11111' })],
        ]);

        const identifiers = await new MysqlSkuRepository(
          executor,
          TEST_AUDIT_ACTOR,
        ).getSortedProductSkusID(PRODUCT_ID);

        expect(identifiers).toStrictEqual(['aaa11111aaa11111aaa11111aaa11111']);
        expect(executor.calls).toHaveLength(2);

        const aggregate = statementAt(executor.calls, 0);
        const ordered = statementAt(executor.calls, 1);

        expect(aggregate.sql).toBe(EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL);
        expect(aggregate.params).toStrictEqual([]);

        // The MySQL odometer term and the identical bind census, emitted with no environment read
        // of any kind: byte-for-byte the statement the configured-dialect cases above assert.
        expect(ordered.sql).toBe(EXPECTED_SORTED_PRODUCT_SKUS_SQL);
        expect(ordered.sql).toContain(EXPECTED_ODOMETER_POWER_FRAGMENT);
        expect(ordered.params).toStrictEqual([PRODUCT_ID, 5]);
      });
    });
  });

  describe('getProductSkus routes five code paths onto four distinct statements', () => {
    // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L163]: an invalid duplicate `var` declaration combined
    // with a compound assignment (`var hql &=...`).
    // Preserved deliberately; do not fix without a product decision.
    //
    // CFML parity [model/dao/SkuDAO.cfc:L165]: the query call passes `{ignoreCase="true"}`, which
    // the legacy engine applies to ORDER by handling. This statement has no ORDER by, so the
    // option is inert and nothing behavioural is asserted from it.
    //
    // CFML parity [model/dao/SkuDAO.cfc:L150]: the DAO signature is `(product, fetchOptions)` and
    // there is no `sorted` argument on it.

    // The one case that uses no double, and why it had to be added.
    //
    // Every other case in this block hands `getProductSkus` a `StubbedBaseTypeProduct`, which
    // overrides `getBaseProductType()` the exact method this adapter branches on.

    it('★ branches correctly for a product hydrated by the REAL product adapter, with NO double', async () => {
      // The product adapter's own executor, answering its documented fetch shape: the product
      // graph carrying a product type whose `systemCode` is NULL, then the SKU read (no rows, so
      // the option read is correctly skipped).
      const productExecutor = new RecordingExecutor([
        [REAL_PRODUCT_GRAPH_ROW_WITH_LEAF_TYPE],
        NO_ROWS,
        [REAL_ROOT_PRODUCT_TYPE_ROW],
      ]);
      // The product-type port is supplied EXPLICITLY, over the product adapter's own executor and
      // actor.
      const product = await new MysqlProductRepository(productExecutor, TEST_AUDIT_ACTOR, {
        productTypeRepository: new MysqlProductTypeRepository(productExecutor, TEST_AUDIT_ACTOR),
      }).getProductByProductID(PRODUCT_ID);

      if (product === undefined) {
        throw new Error('the suite expected the product adapter to hydrate a product');
      }

      // And now the call that failed at runtime, on that very instance.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(product, true);

      // It resolved the base type and branched on it.
      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_MERCHANDISE_PRODUCT_SKUS_SQL);
      expect(statement.params).toStrictEqual([PRODUCT_ID]);

      // The root product type was read through the PRODUCT adapter's executor, by bound identifier
      // so the resolution really did go to the datastore rather than being satisfied by a
      // stubbed answer.
      expect(productExecutor.calls).toHaveLength(3);
      expect(productExecutor.calls[2]?.params).toStrictEqual([REAL_ROOT_PRODUCT_TYPE_ID]);
    });

    it('emits the bare statement when fetchOptions is falsy', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        false,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_BARE_PRODUCT_SKUS_SQL);
      expect(statement.params).toStrictEqual([PRODUCT_ID]);
    });

    it('eagerly fetches access contents for a contentAccess product', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'contentAccess'),
        true,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_CONTENT_ACCESS_PRODUCT_SKUS_SQL);
      expect(countOccurrences(statement.sql, 'INNER JOIN')).toBe(1);
      expect(statement.params).toStrictEqual([PRODUCT_ID]);
    });

    it('eagerly fetches options for a merchandise product', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        true,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_MERCHANDISE_PRODUCT_SKUS_SQL);
      expect(countOccurrences(statement.sql, 'INNER JOIN')).toBe(1);
      expect(statement.params).toStrictEqual([PRODUCT_ID]);
    });

    it('joins the subscription term AND eagerly fetches the benefits for a subscription product', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L159-L160]: two joins, and only the SECOND is a fetch
      // join. The term is joined to constrain the rows; the benefits are joined to materialize
      // them.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'subscription'),
        true,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SUBSCRIPTION_PRODUCT_SKUS_SQL);
      expect(countOccurrences(statement.sql, 'INNER JOIN')).toBe(2);
      expect(statement.sql).toContain(
        'INNER JOIN SwSubscriptionTerm st on st.subscriptionTermID = sku.subscriptionTermID',
      );
      expect(statement.sql).toContain('INNER JOIN SwSkuSubsBenefit sb on sb.skuID = sku.skuID');
      expect(statement.params).toStrictEqual([PRODUCT_ID]);
    });

    // The set-based twin
    //
    // The composition root's order-document hydration called `getProductSkus` once per product,
    // and each call issues the SKU read plus the two association reads the hydration performs.

    it('★★★ reads a SET of same-branch products in ONE statement, with the branch statement unchanged', async () => {
      const secondProductID = '999df2f7ea9c87e60051f3cd87b435a9';
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkusForProducts(
        [
          new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
          new StubbedBaseTypeProduct(secondProductID, 'merchandise'),
        ],
        true,
      );

      // One statement for two products - and it is the MERCHANDISE statement, with its one fetch
      // join, differing from the singular form only in the predicate the extra identifier
      // requires.
      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(
        EXPECTED_MERCHANDISE_PRODUCT_SKUS_SQL.replace(
          'WHERE sku.productID = ?',
          'WHERE sku.productID IN (?, ?)',
        ),
      );
      expect(statement.params).toStrictEqual([PRODUCT_ID, secondProductID]);
    });

    it('★★★ issues ONE statement PER BRANCH when the set spans base types, never one flattened read', async () => {
      // This is the case that keeps the batching faithful.
      const contentAccessID = 'aaadf2f7ea9c87e60051f3cd87b435aa';
      const subscriptionID = 'bbbdf2f7ea9c87e60051f3cd87b435bb';
      const executor = new RecordingExecutor([NO_ROWS, NO_ROWS, NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkusForProducts(
        [
          new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
          new StubbedBaseTypeProduct(contentAccessID, 'contentAccess'),
          new StubbedBaseTypeProduct(subscriptionID, 'subscription'),
        ],
        true,
      );

      // Three statements for three base types - one per branch, in the order the products asked
      // for them - and each is its own branch's statement bound to its own product.
      expect(executor.calls).toHaveLength(3);
      expect(executor.calls[0]?.sql).toContain('INNER JOIN SwSkuOption');
      expect(executor.calls[0]?.params).toStrictEqual([PRODUCT_ID]);
      expect(executor.calls[1]?.sql).toContain('INNER JOIN SwSkuAccessContent');
      expect(executor.calls[1]?.params).toStrictEqual([contentAccessID]);
      expect(executor.calls[2]?.sql).toContain('INNER JOIN SwSubscriptionTerm');
      expect(executor.calls[2]?.params).toStrictEqual([subscriptionID]);
    });

    it('issues NO statement for an empty product set, and collapses a repeated product', async () => {
      const emptyExecutor = new RecordingExecutor([]);

      expect(
        (
          await new MysqlSkuRepository(emptyExecutor, TEST_AUDIT_ACTOR).getProductSkusForProducts(
            [],
            true,
          )
        ).size,
      ).toBe(0);
      expect(emptyExecutor.calls).toHaveLength(0);

      // A product named twice is bound once, so the statement never asks the database for a row
      // twice.
      const executor = new RecordingExecutor([NO_ROWS]);
      const product = new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise');

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkusForProducts(
        [product, product],
        true,
      );

      expect(onlyStatement(executor.calls).params).toStrictEqual([PRODUCT_ID]);
    });

    it('adds NO join for an unrecognized base product type, emitting the same statement as the falsy case', async () => {
      const truthyButUnrecognized = new RecordingExecutor([NO_ROWS]);
      const falsy = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(truthyButUnrecognized, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'giftCard'),
        true,
      );
      await new MysqlSkuRepository(falsy, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'giftCard'),
        false,
      );

      const unrecognizedStatement = onlyStatement(truthyButUnrecognized.calls);
      const falsyStatement = onlyStatement(falsy.calls);

      expect(unrecognizedStatement.sql).toBe(EXPECTED_BARE_PRODUCT_SKUS_SQL);
      expect(unrecognizedStatement.sql).toBe(falsyStatement.sql);
      expect(unrecognizedStatement.params).toStrictEqual(falsyStatement.params);
    });

    it('produces exactly four distinct statements across the five invocations', async () => {
      const emitted: string[] = [];

      const invocations: readonly (readonly [string, boolean])[] = [
        ['merchandise', false],
        ['contentAccess', true],
        ['merchandise', true],
        ['subscription', true],
        ['giftCard', true],
      ];

      for (const [baseProductType, fetchOptions] of invocations) {
        const executor = new RecordingExecutor([NO_ROWS]);

        await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
          new StubbedBaseTypeProduct(PRODUCT_ID, baseProductType),
          fetchOptions,
        );

        emitted.push(onlyStatement(executor.calls).sql);
      }

      expect(emitted).toHaveLength(5);
      expect(new Set(emitted).size).toBe(4);
    });

    it('gates the join on CFML truthiness rather than on JavaScript truthiness', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L153]: the guard is a bare `fetchOptions` resolved from
      // the implicit arguments scope, and CFML truthiness accepts "1", "true", "yes" and any
      // non-zero number while rejecting "0", "false", "no" and the empty string.
      expect(cfTruthy('yes')).toBe(true);
      expect(cfTruthy('1')).toBe(true);
      expect(cfTruthy('true')).toBe(true);
      expect(cfTruthy(1)).toBe(true);
      expect(cfTruthy(2)).toBe(true);

      expect(cfTruthy('no')).toBe(false);
      expect(cfTruthy('0')).toBe(false);
      expect(cfTruthy('false')).toBe(false);
      expect(cfTruthy('')).toBe(false);
      expect(cfTruthy(0)).toBe(false);

      expect(Boolean('no')).toBe(true);
      expect(cfTruthy('no')).not.toBe(Boolean('no'));

      // And the adapter honours that gate: a CFML-falsy string selects the bare statement even
      // though a bare `if (x)` would have selected the join.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        // @ts-expect-error the port declares `fetchOptions: boolean`, so a CFML-truthy string is a
        // compile-time error. The runtime behaviour below is still part of the contract, because
        // `cfTruthy` is what the adapter calls and an untyped caller must see CFML semantics.
        'no',
      );

      expect(onlyStatement(executor.calls).sql).toBe(EXPECTED_BARE_PRODUCT_SKUS_SQL);
    });

    it('binds exactly one productID, taken from the entity accessor and never inlined', async () => {
      // The real entity is used here rather than the double, because the bound value comes from
      // `product.getProductID()` and that accessor should be the production one.
      const product = makeProductFixture({ productID: PRODUCT_ID });
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(product, false);

      const statement = onlyStatement(executor.calls);

      expect(product.getProductID()).toBe(PRODUCT_ID);
      expect(statement.params).toStrictEqual([product.getProductID()]);
      expect(countOccurrences(statement.sql, '?')).toBe(1);
      expect(statement.sql).not.toContain(PRODUCT_ID);
    });

    it('materializes the option association in the same pass and issues nothing on traversal', async () => {
      // `fetchOptions` is an eager-load flag governing the main statement's join shape.
      const populated = new RecordingExecutor([[makeSkuRow()], NO_ROWS, [makeSkuOptionRow()]]);

      const withOptions = await new MysqlSkuRepository(populated, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        true,
      );

      const hydratedWithOptions = withOptions[0];
      if (hydratedWithOptions === undefined) {
        throw new Error('Expected one hydrated SKU for the eager-load case.');
      }

      expect(hydratedWithOptions.getOptions()).toHaveLength(1);
      expect(hydratedWithOptions.getOptions()[0]?.getOptionID()).toBe(OPTION_A);
      expect(hydratedWithOptions.getOptions()[0]?.getOptionGroup()?.getOptionGroupCode()).toBe(
        'colour',
      );

      const callsAfterHydration = populated.calls.length;
      expect(hydratedWithOptions.getOptions()).toHaveLength(1);
      expect(populated.calls).toHaveLength(callsAfterHydration);

      // With the flag off the main statement carries no option join and the association comes back
      // empty. No follow-up statement appears to fill it in later.
      const bare = new RecordingExecutor([[makeSkuRow()], NO_ROWS, NO_ROWS]);

      const withoutOptions = await new MysqlSkuRepository(bare, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        false,
      );

      const hydratedWithoutOptions = withoutOptions[0];
      if (hydratedWithoutOptions === undefined) {
        throw new Error('Expected one hydrated SKU for the bare case.');
      }

      expect(statementAt(bare.calls, 0).sql).toBe(EXPECTED_BARE_PRODUCT_SKUS_SQL);
      expect(hydratedWithoutOptions.getOptions()).toHaveLength(0);

      const bareCallCount = bare.calls.length;
      expect(hydratedWithoutOptions.getOptions()).toHaveLength(0);
      expect(bare.calls).toHaveLength(bareCallCount);
    });

    it('materializes access contents only for the contentAccess fetch shape', async () => {
      const contentAccess = new RecordingExecutor([
        [makeSkuRow()],
        NO_ROWS,
        NO_ROWS,
        [Object.freeze({ link_skuID: SKU_ID, contentID: OPTION_C })],
      ]);

      const skus = await new MysqlSkuRepository(contentAccess, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'contentAccess'),
        true,
      );

      expect(statementAt(contentAccess.calls, 3).sql).toContain('SwSkuAccessContent');
      expect(statementAt(contentAccess.calls, 3).params).toStrictEqual([SKU_ID]);
      expect(skus[0]?.getAccessContentIDs()).toStrictEqual([OPTION_C]);
    });

    it('materializes subscription benefits only for the subscription fetch shape', async () => {
      const subscription = new RecordingExecutor([
        [makeSkuRow()],
        NO_ROWS,
        NO_ROWS,
        [Object.freeze({ link_skuID: SKU_ID, subscriptionBenefitID: OPTION_B })],
      ]);

      const skus = await new MysqlSkuRepository(subscription, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'subscription'),
        true,
      );

      expect(statementAt(subscription.calls, 3).sql).toContain('SwSkuSubsBenefit');
      expect(statementAt(subscription.calls, 3).params).toStrictEqual([SKU_ID]);
      expect(skus[0]?.getSubscriptionBenefitIDs()).toStrictEqual([OPTION_B]);
    });
  });
  describe('searchSkusByProductType reproduces the LIKE search and its correlated sub-select', () => {
    // JUDGMENT CALL: legacy raw SQL at model/dao/SkuDAO.cfc:L132 and:L135 names the ORM entities
    // SlatwallSku/SlatwallProduct and therefore always throws at runtime.

    it('raises when the optional term is omitted, because the legacy binds it unconditionally', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L133]: the optional `term` argument is bound
      // unconditionally as "%term%", so omitting it throws at runtime. The identical defect exists
      // in the sibling search method at model/dao/ProductDAO.cfc:L422.
      // Preserved deliberately; do not fix without a product decision.
      const executor = new RecordingExecutor([NO_ROWS]);

      await expect(
        new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(),
      ).rejects.toThrow(/term/u);

      expect(executor.calls).toHaveLength(0);
    });

    it('keeps the wildcards inside the bound value, never in the statement text', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType('shirt');

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SEARCH_SKUS_SQL);
      expect(statement.sql).toContain('like ?');
      expect(statement.sql).not.toContain('%');
      expect(statement.sql).not.toContain('shirt');
      expect(statement.params).toStrictEqual(['%shirt%']);
    });

    it('treats a whitespace-only productTypeID as absent, matching the trim guard', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L134]: the guard is
      // `trim(arguments.productTypeID) != ""`. The sibling `model/dao/ProductDAO.cfc` uses a
      // `len()` guard instead, which would ACCEPT a whitespace-only value.
      for (const blankish of ['   ', '\t', '\n', ' \t\n ']) {
        const executor = new RecordingExecutor([NO_ROWS]);

        await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
          'shirt',
          blankish,
        );

        const statement = onlyStatement(executor.calls);

        expect(statement.sql).toBe(EXPECTED_SEARCH_SKUS_SQL);
        expect(statement.sql).not.toContain('productTypeID');
        expect(statement.params).toStrictEqual(['%shirt%']);
      }
    });

    it('filters through a correlated IN-subquery rather than a direct column filter', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'shirt',
        OPTION_A,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SEARCH_SKUS_ONE_PRODUCT_TYPE_SQL);
      expect(statement.sql).toContain(
        'productID in (select productID from SwProduct where productTypeID in (',
      );
      // Not a direct filter: the SKU table carries no productTypeID column, and flattening the
      // sub-select into a join would change the statement's shape for no behavioural gain.
      expect(statement.sql).not.toContain('SwSku.productTypeID');
      expect(statement.params).toStrictEqual(['%shirt%', OPTION_A]);
    });

    it('expands a comma list to one placeholder per element for 1, 2 and 3 elements', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L136]: the bound parameter carries `list="true"`, which
      // the legacy engine expanded into one placeholder per element.
      const cases: readonly (readonly [readonly string[], string])[] = [
        [[OPTION_A], EXPECTED_SEARCH_SKUS_ONE_PRODUCT_TYPE_SQL],
        [[OPTION_A, OPTION_B], EXPECTED_SEARCH_SKUS_TWO_PRODUCT_TYPES_SQL],
        [[OPTION_A, OPTION_B, OPTION_C], EXPECTED_SEARCH_SKUS_THREE_PRODUCT_TYPES_SQL],
      ];

      for (const [elements, expectedSql] of cases) {
        const executor = new RecordingExecutor([NO_ROWS]);

        await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
          'shirt',
          elements.join(','),
        );

        const statement = onlyStatement(executor.calls);

        expect(statement.sql).toBe(expectedSql);
        // One `?` for the LIKE term plus one per element.
        expect(countOccurrences(statement.sql, '?')).toBe(elements.length + 1);
        expect(statement.params).toStrictEqual(['%shirt%', ...elements]);
      }
    });

    it('never emits an empty IN () for a delimiter-only list', async () => {
      // An empty `IN ()` is a MySQL syntax error, so a list that splits to nothing still binds one
      // element the empty string.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'shirt',
        ',',
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SEARCH_SKUS_ONE_PRODUCT_TYPE_SQL);
      expect(statement.sql).not.toContain('in ()');
      expect(statement.params).toStrictEqual(['%shirt%', '']);
    });

    it('emits no ORDER BY, exactly as the legacy does not', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'shirt',
        OPTION_A,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).not.toContain('ORDER BY');
      expect(statement.sql).not.toContain('order by');
    });

    it('preserves the singular argument name alongside the plural legacy bind name', () => {
      // CFML parity [model/dao/SkuDAO.cfc:L130 and:L136]: the argument is `productTypeID`,
      // SINGULAR, while the bound list was named `:productTypeIDs`, PLURAL. Neither is normalized.
      const searchMethod = prototypeMethodOf('searchSkusByProductType');

      expect(searchMethod.name).toBe('searchSkusByProductType');
      expect(searchMethod.arity).toBe(2);
    });

    it('names no Slatwall-prefixed identifier in the emitted statement', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'shirt',
        OPTION_A,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).not.toContain('Slatwall');
      expect(statement.sql).toContain('SwSku');
      expect(statement.sql).toContain('SwProduct');
    });

    it('hydrates entities rather than the legacy id/value projection, with the keys recorded', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L142-L145]: the legacy builds an array of structs keyed
      // `"id"` and `"value"` for an autocomplete widget.
      const legacyProjectionKeys = Object.freeze(['id', 'value'] as const);
      const executor = new RecordingExecutor([[makeSkuRow()], NO_ROWS, NO_ROWS]);

      const found = await new MysqlSkuRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).searchSkusByProductType('shirt');

      expect(legacyProjectionKeys).toStrictEqual(['id', 'value']);
      expect(found).toHaveLength(1);
      expect(found[0]?.getSkuID()).toBe(SKU_ID);
      expect(found[0]?.getSkuCode()).toBe(SKU_CODE);
    });
  });

  // C-6 the option-group odometer: memoized, never cleared, request-scoped.
  describe('the option-group odometer is memoized per instance and never shared between them', () => {
    // No environment stubbing: every case here drives `getSortedProductSkusID`, whose statement
    // builder now takes the dialect as an argument instead of reading `process.env`.
    it('issues the aggregate with an empty parameter array, because there is nothing to bind', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L211-L215]: `getNextOptionGroupSortOrder` seeds its
      // memo to 1 at [model/dao/SkuDAO.cfc:L206] and then overwrites it with `max + 1` whenever
      // `recordCount` is truthy.
      // Preserved deliberately; do not fix without a product decision.
      const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

      const aggregate = statementAt(executor.calls, 0);

      expect(aggregate.sql).toBe(EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL);
      expect(aggregate.sql).toContain('max(SwOptionGroup.sortOrder)');
      expect(aggregate.sql).toContain('FROM SwOptionGroup');
      expect(aggregate.params).toStrictEqual([]);
      expect(countOccurrences(aggregate.sql, '?')).toBe(0);
    });

    it('issues the aggregate once per instance and reuses the cached value afterwards', async () => {
      const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS, NO_ROWS]);
      const repository = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getSortedProductSkusID(PRODUCT_ID);
      await repository.getSortedProductSkusID(SKU_ID);

      expect(executor.calls).toHaveLength(3);
      expect(
        executor.calls.filter(
          (recorded) => recorded.sql === EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL,
        ),
      ).toHaveLength(1);

      // Both ordering statements carry the same odometer, taken from the one aggregate.
      expect(statementAt(executor.calls, 1).params).toStrictEqual([PRODUCT_ID, 5]);
      expect(statementAt(executor.calls, 2).params).toStrictEqual([SKU_ID, 5]);
    });

    it('exposes no cache-clear method, because the legacy one can never fire', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: the cache-clear guard is inverted (it
      // deletes the key only when the key does not exist), making the method a guaranteed no-op so
      // the cache is never cleared.
      // Preserved deliberately; do not fix without a product decision.
      const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS, NO_ROWS]);
      const repository = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR);

      expect('clearNextOptionGroupSortOrder' in repository).toBe(false);
      expect(Reflect.get(repository, 'clearNextOptionGroupSortOrder')).toBeUndefined();

      await repository.getSortedProductSkusID(PRODUCT_ID);
      await repository.getSortedProductSkusID(PRODUCT_ID);

      expect(
        executor.calls.filter(
          (recorded) => recorded.sql === EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL,
        ),
      ).toHaveLength(1);
    });

    it('does NOT leak the cached odometer to a second, independently constructed repository', async () => {
      // The REQUEST-SCOPED-STATE PROOF. The legacy cache lives on the DAO component, which the
      // framework kept for the life of the application, and the clear method that was supposed to
      // bound it cannot fire.
      //
      // The one sanctioned module-scope exception in the whole target is the connection pool.
      const first = new RecordingExecutor([[Object.freeze({ max: 9 })], NO_ROWS]);
      const second = new RecordingExecutor([[Object.freeze({ max: 3 })], NO_ROWS]);

      await new MysqlSkuRepository(first, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);
      await new MysqlSkuRepository(second, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

      // The second instance re-issues the aggregate rather than trusting the first one's answer...
      expect(statementAt(second.calls, 0).sql).toBe(EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL);
      // and orders by its own value, which differs from the first instance's.
      expect(statementAt(first.calls, 1).params).toStrictEqual([PRODUCT_ID, 10]);
      expect(statementAt(second.calls, 1).params).toStrictEqual([PRODUCT_ID, 4]);
    });

    it('yields one when the aggregate returns SQL NULL over an empty table', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L214]: the legacy computes `rs.max + 1`, and over an
      // empty table `max()` is SQL NULL, which CFML stringifies to the empty string so that
      // `"" + 1` coerces to.
      const executor = new RecordingExecutor([[Object.freeze({ max: null })], NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

      expect(statementAt(executor.calls, 1).params).toStrictEqual([PRODUCT_ID, 1]);
    });

    it('yields one when the aggregate returns no row at all, a branch the legacy could never reach', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L213]: the legacy guards the overwrite with
      // `rs.recordCount`, but an aggregate query always returns exactly one row, so the guard is
      // always true and the seeded default of 1 at [model/dao/SkuDAO.cfc:L206] is dead.
      const executor = new RecordingExecutor([NO_ROWS, NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

      expect(statementAt(executor.calls, 1).params).toStrictEqual([PRODUCT_ID, 1]);
    });
  });

  // C-7 getTransactionExistsFlag [model/dao/SkuDAO.cfc:L53-L98]
  //
  // Tag syntax, `returntype="boolean"`, and the only method in the file whose body is a single
  // counting statement.
  //
  // A discrepancy between the brief and the shipped code, recorded rather than reconciled.

  describe('getTransactionExistsFlag: the counting statement and its single key predicate', () => {
    it('binds only the productID and emits the product key predicate with the ten ORed EXISTS arms', async () => {
      const executor = new RecordingExecutor([[Object.freeze({ skuCount: 0 })]]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getTransactionExistsFlag(PRODUCT_ID);

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(
        EXPECTED_TRANSACTION_EXISTS_HEAD +
          EXPECTED_TRANSACTION_EXISTS_PRODUCT_KEY +
          EXPECTED_TRANSACTION_EXISTS_TAIL,
      );
      expect(statement.params).toStrictEqual([PRODUCT_ID]);

      // Ten arms, nine separators.
      // CFML parity [model/dao/SkuDAO.cfc:L65-L85].
      expect(countOccurrences(statement.sql, 'EXISTS(')).toBe(10);
      expect(countOccurrences(statement.sql, '\n          OR\n')).toBe(9);

      // The key predicate is chosen, never both.
      // CFML parity [model/dao/SkuDAO.cfc:L58-L63].
      expect(statement.sql).not.toContain(EXPECTED_TRANSACTION_EXISTS_SKU_KEY);
      expect(countOccurrences(statement.sql, '?')).toBe(1);
    });

    it('emits the sku key predicate instead when a skuID is supplied, binding only that', async () => {
      const executor = new RecordingExecutor([[Object.freeze({ skuCount: 3 })]]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getTransactionExistsFlag(
        undefined,
        SKU_ID,
      );

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(
        EXPECTED_TRANSACTION_EXISTS_HEAD +
          EXPECTED_TRANSACTION_EXISTS_SKU_KEY +
          EXPECTED_TRANSACTION_EXISTS_TAIL,
      );
      expect(statement.params).toStrictEqual([SKU_ID]);
      expect(statement.sql).not.toContain(EXPECTED_TRANSACTION_EXISTS_PRODUCT_KEY);
    });

    it('prefers the sku key predicate when both identifiers are supplied', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L58-L63]: the `<cfif>` tests the skuID FIRST, so a call
      // carrying both narrows by sku and the productID is never bound at all.
      const executor = new RecordingExecutor([[Object.freeze({ skuCount: 1 })]]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getTransactionExistsFlag(
        PRODUCT_ID,
        SKU_ID,
      );

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toContain(EXPECTED_TRANSACTION_EXISTS_SKU_KEY);
      expect(statement.params).toStrictEqual([SKU_ID]);
      expect(statement.params).not.toContain(PRODUCT_ID);
    });

    it('answers a boolean: zero matching skus is false and a positive count is true', async () => {
      const noneExecutor = new RecordingExecutor([[Object.freeze({ skuCount: 0 })]]);
      const someExecutor = new RecordingExecutor([[Object.freeze({ skuCount: 3 })]]);

      const none = await new MysqlSkuRepository(
        noneExecutor,
        TEST_AUDIT_ACTOR,
      ).getTransactionExistsFlag(PRODUCT_ID);
      const some = await new MysqlSkuRepository(
        someExecutor,
        TEST_AUDIT_ACTOR,
      ).getTransactionExistsFlag(PRODUCT_ID);

      // The port declares `Promise<boolean>`, so these are booleans and not counts.
      expect(typeof none).toBe('boolean');
      expect(typeof some).toBe('boolean');
      expect(none).toBe(false);
      expect(some).toBe(true);
    });

    it('agrees with CFML boolean coercion on every count, which is why the != 0 gate is immaterial', () => {
      const counts: readonly number[] = [0, 1, 2, 3, 10, 4096];

      for (const count of counts) {
        expect(cfBoolean(count)).toBe(count !== 0);
      }

      // And the persisted-flag boundary `cfBoolean` also serves: SQL NULL resolves to false rather
      // than raising, which is what makes it usable on the nine undefaulted boolean columns in
      // this schema.
      expect(cfBoolean(null)).toBe(false);
    });

    it('refuses the no-argument call the legacy service makes rather than counting the whole table', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L285]: the service declares and calls
      // `getTransactionExistsFlag()` with no arguments, but the DAO's key predicate at
      // [model/dao/SkuDAO.cfc:L58-L63] requires one of the two identifiers.
      // Preserved deliberately; do not fix without a product decision.
      const executor = new RecordingExecutor([]);

      await expect(
        new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getTransactionExistsFlag(),
      ).rejects.toThrow();
      expect(executor.calls).toHaveLength(0);
    });
  });

  // C-8 currency-detail materialization at the repository boundary.
  //
  // And the highest-consequence parity check in the whole plan lives here.

  describe('currency materialization: the same pass, synchronous accessors, and absent prices', () => {
    it('fetches the SwSkuCurrency rows in the same pass as the sku rows, keyed by the sku identifiers', async () => {
      // C8.1. Hydration is one ordered pass: the driving statement, then the per-currency price
      // rows, then the option rows.
      const executor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(SKU_CODE);

      expect(executor.calls).toHaveLength(3);
      expect(statementAt(executor.calls, 0).sql).toBe(EXPECTED_SKU_BY_SKU_CODE_SQL);

      const currencyStatement = statementAt(executor.calls, 1);
      expect(currencyStatement.sql).toContain('from SwSkuCurrency');
      expect(currencyStatement.sql).toContain('where skuID in (?)');
      // Keyed by the identifiers the driving statement returned, bound rather than interpolated.
      expect(currencyStatement.params).toStrictEqual([SKU_ID]);
      expect(currencyStatement.sql).not.toContain(SKU_ID);

      // The option pass follows it, and the pair is the whole of the fetch shape for this method.
      expect(statementAt(executor.calls, 2).sql).toContain('from SwSkuOption');
    });

    it('projects every SwSkuCurrency column the entity needs and never writes through currencyCode', async () => {
      const executor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(SKU_CODE);

      const currencyStatement = statementAt(executor.calls, 1);
      for (const column of [
        'skuCurrencyID',
        'price',
        'renewalPrice',
        'listPrice',
        'skuID',
        'currencyCode',
      ]) {
        expect(currencyStatement.sql).toContain(column);
      }

      // The mutation side, on both paths. Neither mentions it.
      expect(EXPECTED_INSERT_SKU_SQL).not.toContain('currencyCode');
      expect(EXPECTED_UPDATE_SKU_SQL).not.toContain('currencyCode');
    });

    it('keeps getCurrencyDetails and the three accessors synchronous, issuing no query when read', async () => {
      // C8.2. The map is read, never computed on demand: reading it returns a plain object rather
      // than a promise, and the recorded call log does not grow.
      const executor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      const sku = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(
        SKU_CODE,
      );

      if (sku === undefined) {
        throw new Error('the canned single-row result should have hydrated a sku');
      }

      const callsAfterHydration = executor.calls.length;

      const details = sku.getCurrencyDetails();
      const price = sku.getPriceByCurrencyCode('EUR');
      const listPrice = sku.getListPriceByCurrencyCode('EUR');
      const renewalPrice = sku.getRenewalPriceByCurrencyCode('EUR');

      // Not thenable. Had any of these been async, the four values above would be promises and the
      // signatures on a must-preserve behaviour would have changed.
      expect(details).not.toBeInstanceOf(Promise);
      expect(price).not.toBeInstanceOf(Promise);
      expect(listPrice).not.toBeInstanceOf(Promise);
      expect(renewalPrice).not.toBeInstanceOf(Promise);

      // Reading issued nothing. The target does not simulate Hibernate laziness.
      expect(executor.calls).toHaveLength(callsAfterHydration);
    });

    it('answers nothing for every currency when the cascade collaborators are absent', async () => {
      // C8.3, first half.
      // CFML parity [model/entity/Sku.cfc:L373]: the whole cascade body sits behind
      // `if(len(setting('skuEligibleCurrencies')))`, so when that setting resolves empty the memo
      // stays `{}` and every accessor answers nothing.
      const executor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      const sku = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(
        SKU_CODE,
      );

      if (sku === undefined) {
        throw new Error('the canned single-row result should have hydrated a sku');
      }

      expect(sku.getCurrencyDetails()).toStrictEqual({});

      // Absent, not zero. A zero here would be a free product.
      expect(sku.getPriceByCurrencyCode('EUR')).toBeUndefined();
      expect(sku.getListPriceByCurrencyCode('EUR')).toBeUndefined();
      expect(sku.getRenewalPriceByCurrencyCode('EUR')).toBeUndefined();
      expect(sku.getPriceByCurrencyCode('GBP')).toBeUndefined();
    });

    it('answers a price but nothing for list and renewal when the currency is present and those are not', async () => {
      // C8.3, second half, and the sharpest distinction in this block.
      //
      // Built through the sku fixture because this shape needs the cascade collaborators the
      // fixture wires; the assertions are about the ENTITY contract the repository must feed.
      const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });
      await Sku.hydrate(sku);

      const price = sku.getPriceByCurrencyCode('EUR');

      if (price === undefined) {
        throw new Error(
          'the secondaryPriceOnly variant records a price for the secondary currency',
        );
      }

      // C8.5: compared by VALUE through the decimal value object, never by string identity and
      // never through a binary float. `19.99` and `19.990` are the same money and different
      // strings.
      expect(price.equals(Money.fromDecimalString('17.49'))).toBe(true);
      expect(Money.fromDecimalString('19.99').equals(Money.fromDecimalString('19.990'))).toBe(true);

      // The currency is unambiguously present...
      expect(Object.keys(sku.getCurrencyDetails())).toContain('EUR');

      // and yet these two answer nothing, because the row left those columns NULL.
      expect(sku.getListPriceByCurrencyCode('EUR')).toBeUndefined();
      expect(sku.getRenewalPriceByCurrencyCode('EUR')).toBeUndefined();
      expect(sku.getListPriceByCurrencyCode('EUR')).not.toEqual(Money.zero);
    });

    it('maps a NULL SwSkuCurrency price to nothing while the sku default-zero columns keep answering', async () => {
      // C8.6. The two cases are not the same and must not be flattened into one another.
      //
      // CFML parity [model/entity/SkuCurrency.cfc:L53]: `price` carries no `default="0"`, so a
      // NULL column really does yield nothing and that is what lets step 3's
      // `structKeyExists(entry, "price")` test at [model/entity/Sku.cfc:L416] fire and convert.
      //
      // CFML parity [model/entity/Sku.cfc:L55-L57]: `listPrice`, `price` and `renewalPrice` on the
      // SKU itself do declare `default="0"`, so a NULL in one of those answers zero rather than
      // nothing.
      const executor = new RecordingExecutor([
        [makeSkuRow({ renewalPrice: null })],
        [makeSkuCurrencyRow({ price: '17.49', listPrice: null, renewalPrice: null })],
        [makeSkuOptionRow()],
      ]);

      const sku = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(
        SKU_CODE,
      );

      if (sku === undefined) {
        throw new Error('the canned single-row result should have hydrated a sku');
      }

      // The sku's own defaulted column still answers, by value.
      expect(sku.getPrice().equals(Money.fromDecimalString('19.99'))).toBe(true);
      expect(sku.getListPrice().equals(Money.fromDecimalString('24.99'))).toBe(true);
      expect(sku.getRenewalPrice().equals(Money.fromDecimalString('0'))).toBe(true);

      // The per-currency row's undefaulted column did not become a zero anywhere on the way in:
      // the hydrated SkuCurrency association is the direct evidence.
      const currencies = sku.getSkuCurrencies();
      const currency = currencies[0];

      if (currency === undefined) {
        throw new Error('the canned currency row should have hydrated a SkuCurrency');
      }

      // `CurrencyCode` is a branded three-character type rather than a bare string, so the brand
      // is widened for the comparison instead of being asserted away.
      expect(String(currency.getCurrencyCode())).toBe('EUR');
      expect(currency.getPrice()?.equals(Money.fromDecimalString('17.49'))).toBe(true);
      expect(currency.getListPrice()).toBeUndefined();
      expect(currency.getRenewalPrice()).toBeUndefined();
    });

    it('★★ round-trips a POPULATED remoteID: bound at its own ordinal, hydrated back off the row', async () => {
      const remoteID = 'legacy-erp-SKU-00417';
      const INSERT_REMOTE_ID_POSITION = 11;
      const writeExecutor = new RecordingExecutor([]);

      await new MysqlSkuRepository(writeExecutor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true, remoteID }),
      );

      const insert = statementAt(writeExecutor.mutationCalls, 0);

      expect(insert.params[INSERT_REMOTE_ID_POSITION]).toBe(remoteID);
      expect(insert.sql).not.toContain(remoteID);
      expect(insert.sql).toContain('remoteID');

      // And AN ABSENT one becomes SQL null rather than the empty string or a placeholder, because
      // the column is nullable with no default and a bound `''` would be a value an ERP could
      // match on.
      const absentExecutor = new RecordingExecutor([]);

      await new MysqlSkuRepository(absentExecutor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true, remoteID: undefined }),
      );

      expect(statementAt(absentExecutor.mutationCalls, 0).params[INSERT_REMOTE_ID_POSITION]).toBe(
        null,
      );

      // The READ HALF, through the ordinary hydration path, with every other column left as the
      // canned row has it so nothing else can account for the value.
      const readExecutor = new RecordingExecutor([
        [makeSkuRow({ remoteID })],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      const hydrated = await new MysqlSkuRepository(readExecutor, TEST_AUDIT_ACTOR).getSkuBySkuCode(
        SKU_CODE,
      );

      if (hydrated === undefined) {
        throw new Error('the canned single-row result should have hydrated a sku');
      }

      expect(hydrated.getRemoteID()).toBe(remoteID);
      expect(hydrated.getSkuCode()).toBe(SKU_CODE);

      // The association hydrated beside it keeps its own remoteID, which the canned row leaves
      // null - so the sku's value cannot have come from a shared read of the wrong column.
      const currency = hydrated.getSkuCurrencies()[0];

      if (currency === undefined) {
        throw new Error('the canned currency row should have hydrated a SkuCurrency');
      }

      expect(currency.getRemoteID()).toBeUndefined();

      // And SQL null still means absent on the sku itself, so the populated case is not
      // defaulting.
      const nullExecutor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      const withoutRemote = await new MysqlSkuRepository(
        nullExecutor,
        TEST_AUDIT_ACTOR,
      ).getSkuBySkuCode(SKU_CODE);

      expect(withoutRemote?.getRemoteID()).toBeUndefined();
    });

    it('mints an identifier and writes all sixteen columns on the insert path', async () => {
      // The write side of the same schema contract. `Sku.isNew()` selects the path, exactly as the
      // legacy ORM did, and the insert names every one of the sixteen persistent columns.
      //
      // This case once read the row statement with `onlyStatement`, on the strength of the
      // adapter's own claim that it wrote "the `SwSku` row and nothing else.
      const executor = new RecordingExecutor([]);

      const saved = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true }),
      );

      const mutation = statementAt(executor.mutationCalls, 0);
      expect(mutation.sql).toBe(EXPECTED_INSERT_SKU_SQL);
      expect(mutation.params).toHaveLength(16);
      expect(countOccurrences(mutation.sql, '?')).toBe(16);

      // The identifier is minted, bound FIRST, and handed back on the entity.
      expect(saved.getSkuID()).toHaveLength(32);
      expect(mutation.params[0]).toBe(saved.getSkuID());
      expect(saved.isNew()).toBe(false);

      // No read statement is issued by a write. The membership reconciliation is
      // delete-then-insert precisely so this stays true: a computed delta would have had to read
      // the current rows first.
      expect(executor.calls).toHaveLength(0);
    });

    // `makeSkuFixture` populates both account columns with values of its own invention, and the
    // adapter copied them straight into the statement.

    /**
     * The insert binds sixteen values; the two accounts follow their matching date stamp.
     */
    const INSERT_CREATED_BY_POSITION = 13;
    const INSERT_MODIFIED_BY_POSITION = 15;
    /**
     * The update binds FOURTEEN set values then the key, so the accounts sit at 11 and.
     */
    const UPDATE_CREATED_BY_POSITION = 11;
    const UPDATE_MODIFIED_BY_POSITION = 13;

    it('★★ STAMPS THE REQUEST ACTOR on insert and ignores the accounts the entity carries', async () => {
      const executor = new RecordingExecutor([]);
      const sku = makeSkuFixture({ isNew: true });

      // The fixture's own accounts, captured before the save so the contrast is explicit rather
      // than implied. These are what a hostile caller would supply.
      const callerCreated = sku.getCreatedByAccountID();
      const callerModified = sku.getModifiedByAccountID();
      expect(callerCreated).toBeDefined();
      expect(callerCreated).not.toBe(TEST_AUDIT_ACTOR.accountID);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(sku);

      const { params } = statementAt(executor.mutationCalls, 0);

      // Both halves from one resolution, as `preInsert` calls both setters under a single gate
      // [org/Hibachi/HibachiEntity.cfc:L628-L635].
      expect(params[INSERT_CREATED_BY_POSITION]).toBe(TEST_AUDIT_ACTOR.accountID);
      expect(params[INSERT_MODIFIED_BY_POSITION]).toBe(TEST_AUDIT_ACTOR.accountID);
      expect(params).not.toContain(callerCreated);
      expect(params).not.toContain(callerModified);
    });

    it('★★ STAMPS NOTHING FOR A NON-ADMIN, reproducing the getAdminAccountFlag half of the gate', async () => {
      const executor = new RecordingExecutor([]);
      const sku = makeSkuFixture({ isNew: true });
      const callerCreated = sku.getCreatedByAccountID();

      await new MysqlSkuRepository(executor, NON_ADMIN_AUDIT_ACTOR).saveSku(sku);

      const { params } = statementAt(executor.mutationCalls, 0);

      // This actor has an identifier, so the nulls prove the FLAG was consulted rather than that
      // there was nothing to write - a distinction an anonymous actor could not make.
      expect(NON_ADMIN_AUDIT_ACTOR.accountID).toBeDefined();
      expect(params[INSERT_CREATED_BY_POSITION]).toBeNull();
      expect(params[INSERT_MODIFIED_BY_POSITION]).toBeNull();
      expect(params).not.toContain(callerCreated);
    });

    it('★★ NEVER BINDS THE ENTITY’S CREATING ACCOUNT ON AN UPDATE, even though the column is in the SET list', async () => {
      // This adapter is the one where this can go wrong. Its sibling adapters exclude the created
      // pair from their set lists, so a forged creating account has nowhere to land.
      const executor = new RecordingExecutor([], ONE_ROW_WRITTEN);
      const sku = makeSkuFixture();
      const callerCreated = sku.getCreatedByAccountID();

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(sku);

      const { sql, params } = statementAt(executor.mutationCalls, 0);

      expect(sql).toContain('createdByAccountID = COALESCE(?, createdByAccountID)');
      // Null even though the actor gate PASSED, because `preUpdate` has no `setCreatedByAccount`
      // at all [org/Hibachi/HibachiEntity.cfc:L651-L679] - an update never restamps it.
      expect(params[UPDATE_CREATED_BY_POSITION]).toBeNull();
      expect(params).not.toContain(callerCreated);
      // The modifying account is restamped on this path, so the two differ - which is the whole
      // asymmetry `preUpdate` encodes.
      expect(params[UPDATE_MODIFIED_BY_POSITION]).toBe(TEST_AUDIT_ACTOR.accountID);
    });

    it('★★ PRESERVES A STORED ATTRIBUTION when the gate refuses, rather than erasing it', async () => {
      // One row written, for the same reason as the case above: this one pins bound parameters,
      // and a refused update would never reach them.
      const executor = new RecordingExecutor([], ONE_ROW_WRITTEN);
      const sku = makeSkuFixture();

      const saved = await new MysqlSkuRepository(executor, NON_ADMIN_AUDIT_ACTOR).saveSku(sku);

      const { params } = statementAt(executor.mutationCalls, 0);

      // Both accounts bind null and the statement resolves both against their stored columns, so a
      // non-admin save erases neither.
      expect(params[UPDATE_CREATED_BY_POSITION]).toBeNull();
      expect(params[UPDATE_MODIFIED_BY_POSITION]).toBeNull();
      expect(saved.getModifiedByAccountID()).toBe(sku.getModifiedByAccountID());
    });

    it('★★★ NEVER WRITES createdDateTime ON AN UPDATE, so a forged creation stamp cannot land', async () => {
      const executor = new RecordingExecutor([], ONE_ROW_WRITTEN);
      const sku = makeSkuFixture();

      expect(sku.getCreatedDateTime()?.toISOString()).toBe(AUDIT_INSTANT_UTC.toISOString());
      expect(sku.isNew()).toBe(false);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(sku);

      const mutation = statementAt(executor.mutationCalls, 0);

      // No CLAUSE, therefore no placeholder, therefore nothing to bind: the column cannot be
      // reached from this statement at all, whatever the entity carries.
      expect(mutation.sql).not.toContain('createdDateTime');

      for (const parameter of mutation.params) {
        if (parameter instanceof Date) {
          expect(parameter.getTime()).not.toBe(AUDIT_INSTANT_UTC.getTime());
        }
      }

      // And the INSERT is UNAFFECTED, which is the other half of the claim: a NEW row is still
      // stamped, because there is no stored value there for a caller to overwrite.
      const insertExecutor = new RecordingExecutor([]);

      await new MysqlSkuRepository(insertExecutor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true }),
      );

      expect(statementAt(insertExecutor.mutationCalls, 0).sql).toContain('createdDateTime');
    });

    it('binds the key LAST on the update path', async () => {
      // The update names the FOURTEEN assignable columns and carries the key in the WHERE clause,
      // so the identifier is the final bound value rather than the first.
      const executor = new RecordingExecutor([], ONE_ROW_WRITTEN);

      const saved = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture(),
      );

      const mutation = statementAt(executor.mutationCalls, 0);
      expect(mutation.sql).toBe(EXPECTED_UPDATE_SKU_SQL);
      expect(mutation.params).toHaveLength(15);
      expect(mutation.params[14]).toBe(saved.getSkuID());
      expect(mutation.sql).not.toContain(saved.getSkuID());
      expect(saved.getSkuID()).toBe(makeSkuFixture().getSkuID());
    });

    it('★★ REFUSES an update that matched NO row rather than reporting the entity as persisted', async () => {
      // CFML parity: `super.save()` reported nothing on a missing row because HIBERNATE RAISED
      // instead - an update to a non-existent row is a failure there, not a silent no-op, so
      // refusing here is the parity behaviour rather than a new stricture.
      const executor = new RecordingExecutor([], NO_ROWS_WRITTEN);

      const rejected = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ skuID: 'names-no-row-000', isNew: false }),
      );

      await expect(rejected).rejects.toThrow(/matched no row/);

      // The statement was issued - this is a refusal made on the server's own answer, not a guess
      // made before trying - and nothing was hydrated from it.
      expect(executor.mutationCalls).toHaveLength(1);
      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_UPDATE_SKU_SQL);
    });
  });

  // The SwSkuOption membership write.
  //
  // `getSkusBySelectedOptions` matches an AND-of-EXISTS over these rows
  // [model/dao/SkuDAO.cfc:L107-L128] - a must-preserve behaviour - the sorted-SKU ordering joins
  // them to reach the option group's sort order [model/dao/SkuDAO.cfc:L172-L220].

  describe('saveSku - the SwSkuOption membership the ORM used to flush', () => {
    it('★ writes one SwSkuOption row per option, keyed on the MINTED identifier', async () => {
      // The insert path is the dangerous one: binding the ARGUMENT's identifier rather than the
      // one that was written would attach three rows to a key that names no SwSku row, and lose
      // the membership entirely.
      const executor = new RecordingExecutor([]);

      const saved = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true }),
      );

      expect(executor.mutationCalls).toHaveLength(3);

      const clearing = statementAt(executor.mutationCalls, 1);
      const insertion = statementAt(executor.mutationCalls, 2);

      expect(clearing.sql).toBe('delete from SwSkuOption where skuID = ?');
      expect(clearing.params).toStrictEqual([saved.getSkuID()]);

      // Three options on the default fixture, so three placeholder pairs and six bound values,
      // owner column first in each pair.
      expect(insertion.sql).toBe(
        'insert into SwSkuOption (skuID, optionID) values (?, ?), (?, ?), (?, ?)',
      );
      expect(insertion.params).toStrictEqual([
        saved.getSkuID(),
        'skfx-option-1',
        saved.getSkuID(),
        'skfx-option-2',
        saved.getSkuID(),
        'skfx-option-3',
      ]);

      // The minted key is what was bound, and it is not the empty string the argument reported.
      expect(saved.getSkuID()).toHaveLength(32);
      expect(insertion.params).not.toContain('');
    });

    it('★ rewrites the membership on the UPDATE path too, not only on insert', async () => {
      // A variant whose option set changes is the ordinary case, and it is the case the gap hit
      // hardest: the row update always worked.
      const executor = new RecordingExecutor([]);

      const saved = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture(),
      );

      expect(executor.mutationCalls).toHaveLength(3);
      expect(statementAt(executor.mutationCalls, 1).params).toStrictEqual([saved.getSkuID()]);
      expect(statementAt(executor.mutationCalls, 2).params).toHaveLength(6);
    });

    it('★ still issues the DELETE for a SKU with no options, and skips only the insert', async () => {
      // Clearing membership must be possible - it is exactly what happens when a variant is
      // reduced to a single default SKU - so the delete is unconditional.
      //
      // Skipping the INSERT is not an optimisation either: `VALUES ()` is a MySQL parse error and
      // `sqlPlaceholderList` refuses a zero count by design.
      const executor = new RecordingExecutor([]);

      const saved = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ options: [] }),
      );

      expect(executor.mutationCalls).toHaveLength(2);

      const clearing = statementAt(executor.mutationCalls, 1);
      expect(clearing.sql).toBe('delete from SwSkuOption where skuID = ?');
      expect(clearing.params).toStrictEqual([saved.getSkuID()]);

      for (const mutation of executor.mutationCalls) {
        expect(mutation.sql).not.toContain('insert into SwSkuOption');
      }
    });

    it('★ opens EXACTLY ONE transaction and issues every statement inside it', async () => {
      // Two or three statements now form one unit of work.
      //
      // The count assertion is as important as the flag: a per-statement transaction would satisfy
      // `inTransaction` on every statement while providing none of the atomicity.
      const executor = new RecordingExecutor([]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true }),
      );

      expect(executor.transactionCount).toBe(1);

      for (const mutation of executor.mutationCalls) {
        expect(mutation.inTransaction).toBe(true);
      }
    });

    it('★ names only SwSku and SwSkuOption, and touches no other link table', async () => {
      // The entity declares two more many-to-many collections - `accessContents`
      // [model/entity/Sku.cfc:L77] over `SwSkuAccessContent` and `subscriptionBenefits`
      // [model/entity/Sku.cfc:L78] over `SwSkuSubsBenefit`.
      const executor = new RecordingExecutor([]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true }),
      );

      const forbiddenTables = [
        'SwSkuAccessContent',
        'SwSkuSubsBenefit',
        'SwSkuRenewalSubsBenefit',
        'SwAttributeValue',
        'SwAlternateSkuCode',
        'SwStock',
        'SwSkuCurrency',
        'SwProduct',
      ];

      for (const mutation of executor.mutationCalls) {
        for (const forbiddenTable of forbiddenTables) {
          expect(mutation.sql).not.toContain(forbiddenTable);
        }
      }
    });
  });

  // SaveSku the one persistence member, and its two adapter-only affordances.
  //
  // Parameter stops `Function.prototype.length`, so `saveSku.length` is 1 identical to the port's
  // declared arity and a caller holding only `SkuRepository` can pass neither.

  describe('saveSku - the parent key handed down, and the transaction joined', () => {
    /**
     * `productID` is the tenth insert column and the ninth update assignment.
     */
    const INSERT_PRODUCT_ID_POSITION = 9;
    const UPDATE_PRODUCT_ID_POSITION = 8;

    /**
     * A parent key of the shape `mintEntityIdentifier` produces, standing in for a fresh row.
     */
    const CASCADE_PRODUCT_ID = 'ac41d5e0be6f4d2ab9037cf158ea6d71';

    /**
     * Statements one SKU write emits: the row, the membership delete, the membership insert.
     */
    const MUTATIONS_PER_SKU = 3;

    /**
     * An executor whose `transaction` hands a DISTINCT recorder.
     */
    class SplittingExecutor implements PreparedStatementExecutor {
      public readonly calls: RecordedStatement[] = [];

      public readonly mutationCalls: RecordedStatement[] = [];

      /**
       * The recorder every in-transaction statement is expected to land on.
       */
      public readonly inner = new RecordingExecutor([]);

      public transactionCount = 0;

      public execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
        this.calls.push({ sql, params: [...params], inTransaction: false });

        return Promise.resolve(NO_ROWS);
      }

      public executeMutation(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<SqlMutationResult> {
        this.mutationCalls.push({ sql, params: [...params], inTransaction: false });

        return Promise.resolve(ONE_ROW_WRITTEN);
      }

      public async transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
        this.transactionCount += 1;

        return await work(this.inner);
      }
    }

    it('binds the OVERRIDE as productID, not the key the draft association reports', async () => {
      // The draft's own product is a different one entirely here, so the two candidate values are
      // distinguishable and the assertion cannot pass by coincidence.
      const executor = new RecordingExecutor([]);
      const draft = makeSkuFixture({ isNew: true });

      expect(draft.getProduct()?.getProductID()).not.toBe(CASCADE_PRODUCT_ID);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        draft,
        CASCADE_PRODUCT_ID,
        executor,
      );

      const insertion = statementAt(executor.mutationCalls, 0);

      expect(insertion.sql).toBe(EXPECTED_INSERT_SKU_SQL);
      expect(insertion.params[INSERT_PRODUCT_ID_POSITION]).toBe(CASCADE_PRODUCT_ID);
      expect(insertion.params[INSERT_PRODUCT_ID_POSITION]).not.toBe(
        draft.getProduct()?.getProductID(),
      );
    });

    it('overrides on the UPDATE path too, at its own column position', async () => {
      // The override is not an insert-only concern: re-parenting an already-persisted SKU goes
      // through the same seam.
      const executor = new RecordingExecutor([]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture(),
        CASCADE_PRODUCT_ID,
        executor,
      );

      const update = statementAt(executor.mutationCalls, 0);

      expect(update.sql).toBe(EXPECTED_UPDATE_SKU_SQL);
      expect(update.params[UPDATE_PRODUCT_ID_POSITION]).toBe(CASCADE_PRODUCT_ID);
    });

    it('reconciles SwSkuOption under the WRITTEN key, inside the same one transaction', async () => {
      // The cascade must not split the row write from the membership write.
      const executor = new RecordingExecutor([]);

      const saved = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true }),
        CASCADE_PRODUCT_ID,
        executor,
      );

      expect(executor.transactionCount).toBe(1);
      expect(executor.mutationCalls).toHaveLength(3);

      const clearing = statementAt(executor.mutationCalls, 1);

      expect(clearing.sql).toBe('delete from SwSkuOption where skuID = ?');
      expect(clearing.params).toStrictEqual([saved.getSkuID()]);

      for (const mutation of executor.mutationCalls) {
        expect(mutation.inTransaction).toBe(true);
      }
    });

    it('writes through the SUPPLIED executor and never through the constructed one', async () => {
      // The assertion the compiler cannot make.
      const constructed = new RecordingExecutor([]);
      const supplied = new RecordingExecutor([]);

      await new MysqlSkuRepository(constructed, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true }),
        CASCADE_PRODUCT_ID,
        supplied,
      );

      expect(supplied.mutationCalls).toHaveLength(3);
      expect(constructed.mutationCalls).toStrictEqual([]);
      expect(constructed.calls).toStrictEqual([]);
      expect(constructed.transactionCount).toBe(0);
    });

    it('routes EVERY statement through the handed executor and never through its own', async () => {
      // Preserved from the removed collection block, because it describes this member and not a
      // collection.
      const executor = new SplittingExecutor();

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ skuID: 'split-a' }),
        undefined,
        executor,
      );

      expect(executor.transactionCount).toBe(1);
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(executor.calls).toStrictEqual([]);
      expect(executor.inner.mutationCalls).toHaveLength(MUTATIONS_PER_SKU);
    });

    it('propagates a write failure to the caller rather than swallowing it', async () => {
      // PRESERVED from the removed collection block. The insert branch raises when the statement
      // reports no affected rows, which is the available way to fail a write against this double.
      const executor = new RecordingExecutor([], NO_ROWS_WRITTEN);

      const rejected = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ skuID: 'fails-first', isNew: true }),
      );

      await expect(rejected).rejects.toThrow();

      // And it is why the service tier owes a compensation story.
      expect(executor.transactionCount).toBeGreaterThan(0);
    });

    it('opens EXACTLY ONE unit whichever route it takes', async () => {
      // `saveSku` wraps its own write, so calling it from inside an enclosing transaction relies
      // on the executor a transaction hands its callback treating a further `transaction(...)` as
      // PARTICIPATION rather than as a second unit.
      const executor = new RecordingExecutor([]);
      const repository = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR);

      await executor.transaction(async (tx) => {
        const before = executor.transactionCount;

        await repository.saveSku(makeSkuFixture({ isNew: true }), undefined, tx);

        // Three statements are about to be issued; one unit was opened, not three.
        expect(executor.transactionCount - before).toBe(1);
      });

      expect(executor.mutationCalls).toHaveLength(3);

      // Every statement carries the flag, so none of them escaped to an unwrapped path.
      for (const mutation of executor.mutationCalls) {
        expect(mutation.inTransaction).toBe(true);
      }
    });

    it('with neither extra argument is byte-identical to the shape it had before them', async () => {
      // Both parameters are DEFAULTED rather than optional, so `saveSku.length` is still 1 and the
      // port's declared arity is untouched.
      const withoutExecutor = new RecordingExecutor([]);
      const withExecutor = new RecordingExecutor([]);
      const sku = makeSkuFixture({ isNew: true });

      await new MysqlSkuRepository(withoutExecutor, TEST_AUDIT_ACTOR).saveSku(sku);
      await new MysqlSkuRepository(withExecutor, TEST_AUDIT_ACTOR).saveSku(
        sku,
        undefined,
        withExecutor,
      );

      const plain = statementAt(withoutExecutor.mutationCalls, 0);
      const explicit = statementAt(withExecutor.mutationCalls, 0);

      expect(plain.sql).toBe(explicit.sql);
      // The minted key differs between the two runs by design, so the parent key is what is
      // compared - and on both routes it is the value the ASSOCIATION reports.
      expect(plain.params[INSERT_PRODUCT_ID_POSITION]).toBe(sku.getProduct()?.getProductID());
      expect(explicit.params[INSERT_PRODUCT_ID_POSITION]).toBe(sku.getProduct()?.getProductID());
      expect(withoutExecutor.mutationCalls).toHaveLength(withExecutor.mutationCalls.length);
    });

    it('satisfies the cascade contract structurally, with an executor-bearing signature', async () => {
      // The cascade writer is a STRUCTURAL contract - `mysqlProductRepository` declares the shape
      // it needs and this class happens to satisfy it - so what is asserted is the shape, not an
      // `instanceof`.
      const executor = new RecordingExecutor([]);
      const writer: {
        saveSku(sku: Sku, productID: string, executor: PreparedStatementExecutor): Promise<Sku>;
      } = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR);

      const saved = await writer.saveSku(
        makeSkuFixture({ isNew: true }),
        CASCADE_PRODUCT_ID,
        executor,
      );

      expect(saved.isNew()).toBe(false);
      expect(saved.getSkuID()).toHaveLength(32);

      // And the arity is 1, not 3, which is the whole point of the defaults. This assertion once
      // read `toHaveLength(3)` against a dedicated `saveSkuForProduct` member whose three
      // parameters were all required.
      expect(prototypeMethodOf('saveSku').arity).toBe(1);
    });

    it('is reachable through the PORT type, and the extra arguments are NOT', async () => {
      // A service holding only `SkuRepository` must be able to persist a SKU, and must not be able
      // to hand a parent key or a transaction handle in. Both halves are asserted, the second at
      // COMPILE time.
      const executor = new RecordingExecutor([]);
      const repository: SkuRepository = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR);

      const persisted = await repository.saveSku(makeSkuFixture({ skuID: 'via-the-port' }));

      expect(persisted.getSkuID()).toBe('via-the-port');
      expect(executor.mutationCalls).toHaveLength(MUTATIONS_PER_SKU);
      expect(executor.transactionCount).toBeGreaterThan(0);

      // The port declares arity 1, so a second argument is rejected outright through this
      // reference even though the concrete class accepts one.
      // @ts-expect-error - SkuRepository.saveSku takes exactly one argument.
      await repository.saveSku(makeSkuFixture({ skuID: 'via-the-port-2' }), 'a-parent-key');
    });

    it('is accompanied by exactly ONE public member off the port, and it is named here', () => {
      // The gate keeps its force because the exemption is a literal.
      type DeliberateExtraPublicMembers = 'getProductSkusForProducts';

      type ExtraPublicMembers = Exclude<
        keyof MysqlSkuRepository,
        keyof SkuRepository | DeliberateExtraPublicMembers
      >;

      type AssertNever<T extends never> = T;
      type NoExtraPublicMembers = AssertNever<ExtraPublicMembers>;

      const extraPublicMembers: NoExtraPublicMembers[] = [];

      expect(extraPublicMembers).toStrictEqual([]);

      // And the exemption is real rather than notional: the member exists, and it is a function.
      expect(
        typeof new MysqlSkuRepository(new RecordingExecutor([]), TEST_AUDIT_ACTOR)
          .getProductSkusForProducts,
      ).toBe('function');
      const portMembers: Readonly<Record<keyof SkuRepository, true>> = Object.freeze({
        getTransactionExistsFlag: true,
        getSkuBySkuCode: true,
        getSkusBySelectedOptions: true,
        searchSkusByProductType: true,
        getProductSkus: true,
        getSortedProductSkusID: true,
        saveSku: true,
      });

      expect(Object.keys(portMembers)).toHaveLength(7);

      // The two removed names, pinned by name at run time as well, so a reader sees which members
      // this case exists to keep out.
      const repository: MysqlSkuRepository = new MysqlSkuRepository(
        new RecordingExecutor([]),
        TEST_AUDIT_ACTOR,
      );

      expect('saveSkus' in repository).toBe(false);
      expect('saveSkuForProduct' in repository).toBe(false);
    });
  });

  // C-9 cross-cutting properties that hold for every method above.
  //
  // These are the invariants that are not about any one statement.

  // C-8a a reserved javascript identifier is an ordinary Sw* primary key.
  //
  // Both parent-keyed maps in this adapter are keyed by a value READ out of the RESULT SET, never
  // by a value this file generates: `groupRowsByParentIdentifier` keys child rows by their parent
  // identifier.

  describe('a reserved JavaScript identifier is hydrated as an ordinary Sw* primary key', () => {
    /**
     * The pathological identifier, used as a real `SwSku.skuID` value.
     */
    const PROTO_SKU_ID = '__proto__';

    it('★ hydrates a sku whose skuID is __proto__ instead of raising SkuColumnError', async () => {
      // The driving statement returns two rows for the same pathological identifier, which is what
      // makes the two passes disagree when the write is intercepted: pass one would store nothing.
      const executor = new RecordingExecutor([
        [makeSkuRow({ skuID: PROTO_SKU_ID }), makeSkuRow({ skuID: PROTO_SKU_ID })],
        NO_ROWS,
        NO_ROWS,
      ]);

      const hydrated = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        true,
      );

      // Row order is preserved and repeats are included, so the same instance appears twice.
      expect(hydrated).toHaveLength(2);
      expect(hydrated[0]?.getSkuID()).toBe(PROTO_SKU_ID);
      expect(hydrated[1]).toBe(hydrated[0]);
    });

    it('★ groups the child currency and option rows onto a __proto__ parent identifier', async () => {
      // `groupRowsByParentIdentifier` is reached twice per hydration once with `skuID` for
      // `SwSkuCurrency` and once with `link_skuID` for `SwSkuOption` so one call exercises both
      // keyings of the same helper.
      const executor = new RecordingExecutor([
        [makeSkuRow({ skuID: PROTO_SKU_ID })],
        [makeSkuCurrencyRow({ skuID: PROTO_SKU_ID })],
        [makeSkuOptionRow({ link_skuID: PROTO_SKU_ID })],
      ]);

      const hydrated = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        true,
      );

      const sku = hydrated[0];
      if (sku === undefined) {
        throw new Error('Expected one hydrated SKU for the reserved-identifier case.');
      }

      // Both associations arrived.
      expect(sku.getSkuCurrencies()).toHaveLength(1);
      expect(sku.getSkuCurrencies()[0]?.getSkuCurrencyID()).toBe(SKU_CURRENCY_ID);
      expect(sku.getOptions()).toHaveLength(1);
      expect(sku.getOptions()[0]?.getOptionID()).toBe(OPTION_A);
    });

    it('keeps a __proto__ sku and an ordinary sku in the same result set independent', async () => {
      // The mixed case: the pathological identifier must not consume, shadow or reorder its
      // well-behaved neighbour's rows.
      const executor = new RecordingExecutor([
        [makeSkuRow({ skuID: PROTO_SKU_ID }), makeSkuRow({ skuID: SKU_ID })],
        [
          makeSkuCurrencyRow({ skuID: PROTO_SKU_ID, skuCurrencyID: 'currency-proto' }),
          makeSkuCurrencyRow({ skuID: SKU_ID, skuCurrencyID: 'currency-ordinary' }),
        ],
        NO_ROWS,
      ]);

      const hydrated = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        true,
      );

      expect(hydrated).toHaveLength(2);
      expect(hydrated[0]?.getSkuID()).toBe(PROTO_SKU_ID);
      expect(hydrated[1]?.getSkuID()).toBe(SKU_ID);
      expect(hydrated[0]).not.toBe(hydrated[1]);

      expect(hydrated[0]?.getSkuCurrencies()[0]?.getSkuCurrencyID()).toBe('currency-proto');
      expect(hydrated[1]?.getSkuCurrencies()[0]?.getSkuCurrencyID()).toBe('currency-ordinary');
    });

    it('does not contaminate Object.prototype while hydrating a __proto__ identifier', async () => {
      const executor = new RecordingExecutor([
        [makeSkuRow({ skuID: PROTO_SKU_ID })],
        [makeSkuCurrencyRow({ skuID: PROTO_SKU_ID })],
        NO_ROWS,
      ]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        true,
      );

      // A fresh literal, built after hydration ran, is the only way to observe global
      // contamination and it must still be empty.
      const bystander: Record<string, unknown> = {};

      expect(Object.keys(bystander)).toHaveLength(0);
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'skuID')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'activeFlag')).toBe(false);
    });
  });

  describe('cross-cutting: fetch shape, injected collaborators, schema continuity and UTC', () => {
    it('hydrates exactly one entity per driving row in a single pass, with no per-row follow-up query', async () => {
      // C9.1. Three driving rows, one grouped currency pass and one grouped option pass three
      // statements in total, not three plus two per row.
      const secondSkuID = 'bbbb2222cccc3333dddd4444eeee5555';
      const thirdSkuID = 'cccc3333dddd4444eeee5555ffff6666';

      const executor = new RecordingExecutor([
        [
          makeSkuRow(),
          makeSkuRow({ skuID: secondSkuID, skuCode: 'TEST-SKU-0002' }),
          makeSkuRow({ skuID: thirdSkuID, skuCode: 'TEST-SKU-0003' }),
        ],
        [
          makeSkuCurrencyRow(),
          makeSkuCurrencyRow({ skuCurrencyID: 'd1', skuID: secondSkuID, price: '18.00' }),
        ],
        [
          makeSkuOptionRow(),
          makeSkuOptionRow({ link_skuID: secondSkuID, optionID: OPTION_B, optionCode: 'BLUE' }),
        ],
      ]);

      const skus = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'TEST',
      );

      expect(skus).toHaveLength(3);
      expect(executor.calls).toHaveLength(3);

      // One entity per row, each a distinct instance rather than a shared one.
      expect(new Set(skus.map((sku) => sku.getSkuID())).size).toBe(3);
      expect(new Set(skus).size).toBe(3);

      // Associations landed on the right parents, keyed by `link_skuID` and the third sku, which
      // had no rows in either grouped pass.
      const [first, second, third] = skus;

      if (first === undefined || second === undefined || third === undefined) {
        throw new Error('three canned driving rows should have hydrated three skus');
      }

      expect(first.getSkuCurrencies()).toHaveLength(1);
      expect(second.getSkuCurrencies()).toHaveLength(1);
      expect(third.getSkuCurrencies()).toHaveLength(0);
      expect(first.getOptions()).toHaveLength(1);
      expect(second.getOptions()).toHaveLength(1);
      expect(third.getOptions()).toHaveLength(0);

      // Walking every association on every entity issues nothing further. No N+1, and no locator.
      const callsAfterHydration = executor.calls.length;

      for (const sku of skus) {
        sku.getOptions().forEach((option) => option.getOptionID());
        sku.getSkuCurrencies().forEach((currency) => currency.getPrice());
      }

      expect(executor.calls).toHaveLength(callsAfterHydration);
    });

    it('needs nothing but its two constructor arguments, so no service locator survives', () => {
      expect(MysqlSkuRepository.length).toBe(2);
      const members = Object.getOwnPropertyNames(MysqlSkuRepository.prototype);

      expect(members.filter((member) => member.toLowerCase().includes('image'))).toStrictEqual([]);
    });

    it('exposes no batching, limiting, retry or transaction control on the repository surface', () => {
      const forbiddenMembers = [
        'begin',
        'begintransaction',
        'commit',
        'committransaction',
        'rollback',
        'rollbacktransaction',
        'withtransaction',
        'transaction',
        'batch',
        'savebatch',
        'setbatchsize',
        'paginate',
        'limit',
        'setlimit',
        'offset',
        'settimeout',
        'retry',
        'setretrypolicy',
      ];
      const members = Object.getOwnPropertyNames(MysqlSkuRepository.prototype).map((member) =>
        member.toLowerCase(),
      );

      for (const forbiddenMember of forbiddenMembers) {
        expect(members).not.toContain(forbiddenMember);
      }

      // And the seven port methods take no extra control argument either their arities are pinned
      // in the port-surface block above, and none of them carries a batch size, a limit or a retry
      // policy.
      expect(prototypeMethodOf('saveSku').arity).toBe(1);
      expect(prototypeMethodOf('getProductSkus').arity).toBe(2);
    });

    it('targets only existing Sw* tables, issues no DDL and leaves no ORM entity name behind', async () => {
      const readExecutor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);
      const readRepository = new MysqlSkuRepository(readExecutor, TEST_AUDIT_ACTOR);
      await readRepository.getSkuBySkuCode(SKU_CODE);

      const optionsExecutor = new RecordingExecutor([NO_ROWS]);
      await new MysqlSkuRepository(optionsExecutor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(
        OPTION_A,
      );

      const searchExecutor = new RecordingExecutor([NO_ROWS]);
      await new MysqlSkuRepository(searchExecutor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'TEST',
        'pt-1',
      );

      const countExecutor = new RecordingExecutor([[Object.freeze({ skuCount: 0 })]]);
      await new MysqlSkuRepository(countExecutor, TEST_AUDIT_ACTOR).getTransactionExistsFlag(
        PRODUCT_ID,
      );

      const insertExecutor = new RecordingExecutor([]);
      await new MysqlSkuRepository(insertExecutor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ isNew: true }),
      );

      const updateExecutor = new RecordingExecutor([]);
      await new MysqlSkuRepository(updateExecutor, TEST_AUDIT_ACTOR).saveSku(makeSkuFixture());

      const swept: readonly string[] = [
        ...readExecutor.calls,
        ...optionsExecutor.calls,
        ...searchExecutor.calls,
        ...countExecutor.calls,
        ...insertExecutor.mutationCalls,
        ...updateExecutor.mutationCalls,
      ].map((statement) => statement.sql);

      expect(swept.length).toBeGreaterThan(0);

      for (const sql of swept) {
        for (const verb of DDL_VERBS) {
          expect(sql).not.toContain(verb);
        }

        // The ORM entity names `SlatwallSku` and `SlatwallProduct` are not tables.
        expect(sql).not.toContain('Slatwall');

        // Every statement names at least one physical table from the in-scope set.
        expect(/\bSw[A-Z][A-Za-z]*\b/u.test(sql)).toBe(true);
      }
    });

    it('binds every timestamp as an explicit UTC instant', async () => {
      // C9.5. `tests/setup.ts` pins the process timezone to UTC and self-verifies it, and this
      // suite adds no fake timers of its own a global clock override would make the whole folder's
      // behaviour depend on load order.
      const executor = new RecordingExecutor([], ONE_ROW_WRITTEN);

      const saved = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture(),
      );

      // Index 0 is the row statement; the two membership statements bind no temporal value, and
      // the loop at the foot of this case still sweeps every bound parameter of the row write.
      const mutation = statementAt(executor.mutationCalls, 0);
      const modifiedDateTime = mutation.params[12];

      if (!(modifiedDateTime instanceof Date)) {
        throw new Error(
          'modifiedDateTime should be bound as a Date rather than as pre-formatted text',
        );
      }

      expect(modifiedDateTime.toISOString()).toBe(saved.getModifiedDateTime()?.toISOString());
      expect(modifiedDateTime.toISOString().endsWith('Z')).toBe(true);

      // And every other bound temporal value is a Date carrying the UTC designator, never a
      // local-time string the driver would have to guess at.
      for (const parameter of mutation.params) {
        if (parameter instanceof Date) {
          expect(parameter.toISOString().endsWith('Z')).toBe(true);
        }
      }
    });
  });
});

// The currency-cascade hydration boundary (net-new: no legacy antecedent)
//
// The per-currency price map is materialised here, during hydration.
//
// Settings reads [model/entity/Sku.cfc:L373, L385, L418] and the eligible-currency listing
// [model/entity/Sku.cfc:L371, L375, fused into one call] do not vary from one SKU to the next.

/**
 * What a settings/currency double records, so a test can count consultations.
 */
type CascadeConsultations = {
  readonly settingReads: string[];
  readonly listings: string[];
  readonly conversions: string[];
};

function makeCascadeConsultations(): CascadeConsultations {
  return { settingReads: [], listings: [], conversions: [] };
}

/**
 * A recording settings double.
 *
 * The parameter is typed `string` rather than the port's narrower key union so no port module has
 * to be imported: a function accepting `string` satisfies one declared to accept a subset of it.
 */
function makeCascadeSettings(
  skuCurrency: string,
  skuEligibleCurrencies: string,
  log: CascadeConsultations,
): { setting: (settingName: string) => string } {
  const table: Readonly<Record<string, string>> = { skuCurrency, skuEligibleCurrencies };

  return {
    setting(settingName: string): string {
      log.settingReads.push(settingName);

      return table[settingName] ?? '';
    },
  };
}

/**
 * A recording currency-conversion double.
 *
 * CFML parity [model/entity/Sku.cfc:L371, L375]: the legacy builds a currency smart list and
 * narrows it with `addInFilter`. The shipped entity fuses those into one
 * `getCurrenciesByCurrencyCodeList` call, so that is what `listings` counts.
 */
function makeCascadeConverter(log: CascadeConsultations): {
  getAllActiveCurrencyIDList: () => Promise<CurrencyCode[]>;
  getCurrenciesByCurrencyCodeList: (currencyCodeList: string) => Promise<CurrencyCode[]>;
  convertCurrency: (
    amount: Money,
    originalCurrencyCode: CurrencyCode,
    convertToCurrencyCode: CurrencyCode,
  ) => Promise<Money>;
} {
  const parse = (currencyCodeList: string): CurrencyCode[] =>
    currencyCodeList
      .split(',')
      .filter((code) => code.length > 0)
      .map((code) => toCurrencyCode(code));

  return {
    getAllActiveCurrencyIDList(): Promise<CurrencyCode[]> {
      log.listings.push('getAllActiveCurrencyIDList');

      return Promise.resolve(parse(CASCADE_ELIGIBLE_CURRENCIES));
    },

    getCurrenciesByCurrencyCodeList(currencyCodeList: string): Promise<CurrencyCode[]> {
      log.listings.push(currencyCodeList);

      return Promise.resolve(parse(currencyCodeList));
    },

    convertCurrency(
      amount: Money,
      originalCurrencyCode: CurrencyCode,
      convertToCurrencyCode: CurrencyCode,
    ): Promise<Money> {
      log.conversions.push(
        `${amount.toDecimalString()}:${originalCurrencyCode}->${convertToCurrencyCode}`,
      );

      return Promise.resolve(amount);
    },
  };
}

const CASCADE_SEARCH_TERM = 'shirt';

const CASCADE_BASE_CURRENCY = 'USD';

const CASCADE_SECONDARY_CURRENCY = 'EUR';

const CASCADE_ELIGIBLE_CURRENCIES = `${CASCADE_BASE_CURRENCY},${CASCADE_SECONDARY_CURRENCY}`;

/**
 * `count` distinct SKU rows, each complete enough for the row->entity factory.
 */
function manySkuRows(count: number): readonly SqlRow[] {
  return Object.freeze(
    Array.from({ length: count }, (_unused, index) =>
      makeSkuRow({ skuID: `${SKU_ID}-${String(index)}`, skuCode: `${SKU_CODE}-${String(index)}` }),
    ),
  );
}

describe('MysqlSkuRepository currency-cascade hydration (NET-NEW: no legacy antecedent)', () => {
  it('★★ resolves the INVARIANT cascade inputs ONCE PER READ, whatever the row count', async () => {
    // The assertion that would catch a per-row resolution. One row and fifty rows resolve the same
    // fixed three consultations, so the count is a property of the read and not of the result set.
    for (const rowCount of [1, 2, 50]) {
      const log = makeCascadeConsultations();
      const executor = new RecordingExecutor([manySkuRows(rowCount)]);

      const found = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR, {
        settingsProvider: makeCascadeSettings(
          CASCADE_BASE_CURRENCY,
          CASCADE_ELIGIBLE_CURRENCIES,
          log,
        ),
        currencyConverter: makeCascadeConverter(log),
      }).searchSkusByProductType(CASCADE_SEARCH_TERM);

      expect(found).toHaveLength(rowCount);

      // FIXED, in both content and order.
      expect(log.settingReads).toStrictEqual(['skuCurrency', 'skuEligibleCurrencies']);
      expect(log.listings).toStrictEqual([CASCADE_ELIGIBLE_CURRENCIES]);

      // …and the per-SKU half scales, because it must: Step 3 converts each SKU's own renewal
      // price `model/dao/SkuDAO.cfc`, list price `model/dao/SkuDAO.cfc` and price
      // `model/dao/SkuDAO.cfc` into the one non-base eligible currency.
      expect(log.conversions).toHaveLength(rowCount * 3);
    }
  });

  it('★★ every sku a read hands back is ALREADY hydrated — no caller-side await exists', async () => {
    const log = makeCascadeConsultations();
    const executor = new RecordingExecutor([manySkuRows(3)]);

    const found = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR, {
      settingsProvider: makeCascadeSettings(
        CASCADE_BASE_CURRENCY,
        CASCADE_ELIGIBLE_CURRENCIES,
        log,
      ),
      currencyConverter: makeCascadeConverter(log),
    }).searchSkusByProductType(CASCADE_SEARCH_TERM);

    for (const sku of found) {
      // Read SYNCHRONOUSLY, with nothing awaited at the call site. This is the synchronous
      // accessor contract at [model/entity/Sku.cfc:L269-L285], intact.
      expect(Object.keys(sku.getCurrencyDetails()).sort()).toStrictEqual(
        [CASCADE_BASE_CURRENCY, CASCADE_SECONDARY_CURRENCY].sort(),
      );
      expect(sku.getPriceByCurrencyCode(CASCADE_BASE_CURRENCY)?.toFixed2()).toBe('19.99');

      // Step 1 for the base currency, Step 3 for the converted one.
      expect(sku.getCurrencyDetails()[CASCADE_BASE_CURRENCY]?.converted).toBe(false);
      expect(sku.getCurrencyDetails()[CASCADE_SECONDARY_CURRENCY]?.converted).toBe(true);
    }
  });

  it('★ a shut [L373] gate still hydrates every sku, to {}, consulting no currency port', async () => {
    // The gate is evaluated once for the read, so a shut gate short-circuits the listing for the
    // whole result set rather than once per row.
    const log = makeCascadeConsultations();
    const executor = new RecordingExecutor([manySkuRows(4)]);

    const found = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR, {
      settingsProvider: makeCascadeSettings(CASCADE_BASE_CURRENCY, '', log),
      currencyConverter: makeCascadeConverter(log),
    }).searchSkusByProductType(CASCADE_SEARCH_TERM);

    expect(found).toHaveLength(4);

    for (const sku of found) {
      expect(sku.getCurrencyDetails()).toStrictEqual({});

      // Absent, not zero. A zero here would be a free product.
      expect(sku.getPriceByCurrencyCode(CASCADE_BASE_CURRENCY)).toBeUndefined();
    }

    expect(log.settingReads).toStrictEqual(['skuCurrency', 'skuEligibleCurrencies']);
    expect(log.listings).toStrictEqual([]);
    expect(log.conversions).toStrictEqual([]);
  });

  it('★★ the save round-trip CARRIES THE COMPUTED MAP onto the rehydrated instance', async () => {
    // The legacy save hands back the same OBJECT, so its `variables.currencyDetails` memo survives
    // trivially.
    const log = makeCascadeConsultations();
    const executor = new RecordingExecutor([manySkuRows(1)]);
    const repository = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR, {
      settingsProvider: makeCascadeSettings(
        CASCADE_BASE_CURRENCY,
        CASCADE_ELIGIBLE_CURRENCIES,
        log,
      ),
      currencyConverter: makeCascadeConverter(log),
    });

    const [read] = await repository.searchSkusByProductType(CASCADE_SEARCH_TERM);

    if (read === undefined) {
      throw new Error('the canned single-row result should have hydrated a sku');
    }

    const consultationsAfterRead = log.listings.length + log.conversions.length;

    const saved = await repository.saveSku(read);

    // A different instance….
    expect(saved).not.toBe(read);

    // …carrying the same map, by value.
    expect(saved.getCurrencyDetails()).toStrictEqual(read.getCurrencyDetails());
    expect(saved.getPriceByCurrencyCode(CASCADE_SECONDARY_CURRENCY)?.toFixed2()).toBe('19.99');

    // …and nothing was recomputed to achieve it.
    expect(log.listings.length + log.conversions.length).toBe(consultationsAfterRead);
  });

  it('★ collaborators absent — hydration runs nothing and the skus answer {} rather than failing', async () => {
    // This is the state every SQL-shape test above sits in, asserted once explicitly so it reads
    // as a decision rather than an accident.
    const executor = new RecordingExecutor([manySkuRows(2)]);

    const found = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
      CASCADE_SEARCH_TERM,
    );

    expect(found).toHaveLength(2);

    for (const sku of found) {
      expect(sku.getCurrencyDetails()).toStrictEqual({});
      expect(sku.getPriceByCurrencyCode(CASCADE_BASE_CURRENCY)).toBeUndefined();
    }
  });
});

// Read totality - the three resource ceilings, inverted.
//
// So every case that asserted a refusal is now its inverse.
//
// And the resource concern is still answered, one layer down: the association follow-up statements
// batch their identifier lists.

describe('the read path is total on magnitude, refusing nothing the legacy answered', () => {
  /**
   * A well-formed 32-character option identifier, distinct per index.
   */
  function optionIDAt(index: number): string {
    return index.toString(16).padStart(32, '0');
  }

  /**
   * A comma-delimited list of `count` distinct well-formed option identifiers.
   */
  function optionListOf(count: number): string {
    return Array.from({ length: count }, (_unused, index) => optionIDAt(index)).join(',');
  }

  describe('the selected-option count', () => {
    it('executes a 64-element list, which was the old ceiling', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(
        optionListOf(64),
      );

      // 64 option groups is already absurd - a product carrying them would hold at least 2^64
      // SKUs. The statement is built and issued regardless, with one placeholder and one bind per
      // element.
      const statement = onlyStatement(executor.calls);

      expect(statement.params).toHaveLength(64);
    });

    it('★★ executes a list ABOVE the old ceiling instead of refusing it', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      const found = await new MysqlSkuRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).getSkusBySelectedOptions(optionListOf(65));

      // ABOVE the old option-count ceiling, and still answered: the statement is issued with one
      // placeholder per selected option.
      const statement = onlyStatement(executor.calls);

      expect(statement.params).toHaveLength(65);
      expect(found).toStrictEqual([]);
    });

    it('counts with CFML list semantics, so a doubled delimiter is not an element', async () => {
      // `listToArray` drops empty elements, and the builder parses with the same helper.
      const executor = new RecordingExecutor([NO_ROWS]);
      const doubled = Array.from({ length: 64 }, (_unused, index) => optionIDAt(index)).join(',,');

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(doubled);

      expect(onlyStatement(executor.calls).params).toHaveLength(64);
    });

    // Synchronous on purpose, and the absence of `async` is part of the assertion.
    it('leaves the builder itself total, which is its own contract', () => {
      const statement = buildSkusBySelectedOptionsStatement(optionListOf(65));

      expect(statement.params).toHaveLength(65);
    });
  });

  describe('the search-term length', () => {
    it('searches with a term at the column width, which was the old ceiling', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'a'.repeat(50),
      );

      // `skuCode` is `length="50"` [model/entity/Sku.cfc:L54], so a 50-character term is the
      // longest one that could still be an entire code.
      expect(onlyStatement(executor.calls).params).toStrictEqual([`%${'a'.repeat(50)}%`]);
    });

    it('★★ searches with a term ABOVE the column width instead of refusing it', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      const found = await new MysqlSkuRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).searchSkusByProductType('a'.repeat(51));

      // ABOVE the old term-length ceiling, and still answered: the term is bound whole.
      expect(onlyStatement(executor.calls).params).toStrictEqual([`%${'a'.repeat(51)}%`]);
      expect(found).toStrictEqual([]);
    });

    it('leaves a LIKE metacharacter live inside the term, exactly as the legacy did', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType('%_%');

      expect(onlyStatement(executor.calls).params).toStrictEqual(['%%_%%']);
    });
  });

  describe('the search-result hydration count', () => {
    it('★★ hydrates a result set ABOVE the old ceiling instead of refusing it', async () => {
      const oversized: readonly SqlRow[] = Array.from({ length: 2_001 }, (_unused, index) =>
        makeSkuRow({ skuID: index.toString(16).padStart(32, '0') }),
      );
      const executor = new RecordingExecutor([oversized]);

      const skus = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'shirt',
      );

      // ABOVE the old hydration ceiling, and still hydrated in full.
      expect(skus).toHaveLength(2_001);
    });

    it('hydrates a result set at the old ceiling, unchanged', async () => {
      const atTheOldCeiling: readonly SqlRow[] = Array.from({ length: 2_000 }, (_unused, index) =>
        makeSkuRow({ skuID: index.toString(16).padStart(32, '0') }),
      );
      const executor = new RecordingExecutor([atTheOldCeiling, NO_ROWS, NO_ROWS]);

      const skus = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'shirt',
      );

      expect(skus).toHaveLength(2_000);
      expect(executor.calls.length).toBeGreaterThan(1);
    });

    it('★★ batches the association statements so no single bind exceeds the tuple row limit', async () => {
      const oversized: readonly SqlRow[] = Array.from({ length: 2_001 }, (_unused, index) =>
        makeSkuRow({ skuID: index.toString(16).padStart(32, '0') }),
      );
      const executor = new RecordingExecutor([oversized]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType('shirt');

      // What replaced the ceiling.
      expect(executor.calls).toHaveLength(7);

      // The search itself binds one term; every association batch binds at most the tuple row
      // limit.
      for (const call of executor.calls) {
        expect(call.params.length).toBeLessThanOrEqual(SQL_TUPLE_ROW_LIMIT);
      }

      // And the batches together cover the whole set exactly once, with no identifier dropped and
      // none bound twice.
      const associationBindCount = executor.calls
        .slice(1)
        .reduce((total: number, call) => total + call.params.length, 0);

      expect(associationBindCount).toBe(2 * 2_001);
    });

    it('emits exactly one statement per association when the set fits a single batch', async () => {
      const withinOneBatch: readonly SqlRow[] = Array.from({ length: 3 }, (_unused, index) =>
        makeSkuRow({ skuID: index.toString(16).padStart(32, '0') }),
      );
      const executor = new RecordingExecutor([withinOneBatch]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType('shirt');

      // The emitted SQL is unchanged for every realistic result set, which is what makes the
      // batching invisible to every parity assertion in this file: the search, one currency read
      // and one option read.
      expect(executor.calls).toHaveLength(3);
    });
  });
});
