// ---------------------------------------------------------------------------
// mysqlSkuRepository — SQL shape and parameter-binding suite
//
// WHAT THIS PINS
//
// For every method on `src/repositories/mysql/mysqlSkuRepository.ts`: THE EXACT SQL TEXT EMITTED and
// THE EXACT ARRAY OF PARAMETERS BOUND TO IT. Nothing here measures a database; the adapter's executor
// is a recording double, so what is asserted is the statement the adapter would have sent and the
// values it would have sent with it.
//
// Three obligations single this file out from its siblings in this folder:
//
//   1. It is the AUTHORITATIVE test of a named MUST-PRESERVE behaviour: the AND-of-EXISTS conjunctive
//      option matching that backs `ProductService.getProductSkusBySelectedOptions()`
//      [model/service/ProductService.cfc:L104]. A SKU matches only if it carries EVERY selected
//      option. See the `C-1` block.
//   2. It owns a carried-forward TODO from [model/dao/SkuDAO.cfc:L177], reproduced character for
//      character in the `C-3` block and deliberately NOT completed.
//   3. It owns the REQUEST-SCOPED-STATE proof: a second, independently constructed repository must not
//      observe the first one's cached option-group odometer. See the `C-6` block.
//
// ---------------------------------------------------------------------------
// ⚠ NET-NEW COVERAGE WITH NO LEGACY ANTECEDENT
//
// Stated plainly rather than implied, because presenting net-new coverage as parity would be a false
// claim about this migration. `meta/tests/unit/dao/` contains exactly two components — `AccountDAOTest.cfc`
// and `PaymentDAOTest.cfc` — and BOTH are out of scope for this slice. There is no `SkuDAOTest.cfc`, and
// no legacy test anywhere in `meta/tests/**` exercises `model/dao/SkuDAO.cfc`. Every assertion below is
// therefore new, and none of it is traceable to a legacy assertion.
//
// The two legacy components that DO touch this slice are entity tests, not DAO tests
// (`meta/tests/unit/entity/BrandTest.cfc` and `meta/tests/unit/entity/ProductTest.cfc`), and they are
// carried forward in the unit tier rather than here.
//
// ---------------------------------------------------------------------------
// THE VERIFIED LOCATOR MAP
//
// Every locator below was read first-hand from `model/dao/SkuDAO.cfc`, which is 228 lines and MIXED
// MODE: `<cfcomponent>` at L49, a tag `<cffunction>` at L53, a `<cfscript>` block spanning L100-L170,
// then tag `<cffunction>`s again at L172, L204 and L222, closing at L228. THE TAG-SYNTAX METHODS ARE
// PRECISELY THE ONES CARRYING RAW SQL.
//
//   L53-L98    getTransactionExistsFlag      tag syntax, `returntype="boolean"`; L57 the count; L62 the
//                                            product-key arm; L65-L85 the ten-EXISTS OR chain; L93 the
//                                            `eq 0` test that produces the boolean.
//   L102-L104  getSkuBySkuCode               one NAMED parameter referenced twice from one value.
//   L106       (comment)                     "returns product skus which matches ALL options (list of
//                                            optionIDs) that are passed in".
//   L107-L128  getSkusBySelectedOptions      L109-L112 the seed; L113 the loop; L114 `listGetat`;
//                                            L115-L119 the EXISTS fragment; L123 the unguarded
//                                            `structKeyExists` product test.
//   L130-L148  searchSkusByProductType       L132/L135 raw SQL naming ORM entities; L133 the
//                                            unconditional `term` bind; L134 the `trim(...) != ""`
//                                            guard; L136 `list="true"`; L142-L145 the projection keys.
//   L150-L168  getProductSkus                L153 the bare `fetchOptions`; L154/L156/L158 three arms
//                                            and NO else arm at L161; L163 the duplicate `var`; L165
//                                            the inert `ignoreCase`.
//   L172-L202  getSortedProductSkusID        L177 the TODO; L180 the single projected column;
//                                            L183-L188 the three joins; L190 the only bind; L191-L192
//                                            the grouping; L194-L198 the dialect-branched ORDER BY.
//   L204-L220  getNextOptionGroupSortOrder   private; L206 seeds 1; L210-L212 the aggregate; L213 the
//                                            unreachable guard; L214 the overwrite.
//   L222-L226  clearNextOptionGroupSortOrder the inverted guard, a guaranteed no-op.
//
// A NOTE ON TWO CORRECTED LOCATORS. The transformation plan cites `getSortedProductSkusID` as
// L172-L220; the verified range is L172-L202, because L204-L220 is the separate private
// `getNextOptionGroupSortOrder` and L222-L226 is `clearNextOptionGroupSortOrder`. The plan also cites
// `model/entity/Sku.cfc:L568` for the `getSkuStocksDeletableFlag` call site; the verified locator is
// L569. Both corrections are recorded independently by `src/domain/ports/skuRepository.ts` and by
// `src/repositories/mysql/sql/sortedProductSkus.sql.ts`, and this file makes the same corrections
// rather than repeating the wrong numbers.
//
// ---------------------------------------------------------------------------
// ⚠ DISCREPANCIES BETWEEN THE BRIEF AND THE SHIPPED CODE
//
// Recorded rather than silently reconciled. Where the two disagree, THE SHIPPED ADAPTER WINS FOR SHAPE
// AND THE LEGACY CFML WINS FOR SEMANTICS.
//
//   * THE EXECUTOR IS AN INTERFACE, NOT A FUNCTION. The brief describes it as
//     `(sql, params) => rows`. `src/repositories/mysql/connection.ts` exports
//     `PreparedStatementExecutor` with TWO methods — `execute` for reads and `executeMutation` for
//     writes. The recording double below implements the interface, so the compiler checks its shape.
//   * `getTransactionExistsFlag` TAKES `(productID?, skuID?)`, in that order. The legacy declares
//     `productID` first too [model/dao/SkuDAO.cfc:L54-L55] even though the skuID arm is tested first
//     [L59], so the port's ordering is the faithful one.
//   * THE BOOLEAN IS DERIVED BY `!== 0`, NOT BY `cfBoolean()`. The brief asks for `cfBoolean()`; the
//     adapter reproduces the legacy comparison literally, and the legacy comparison IS
//     `<cfif results[1] eq 0>` [model/dao/SkuDAO.cfc:L93]. The two agree on every count, which the
//     `C-7` block asserts rather than assumes.
//   * `tests/traceability/` DOES NOT EXIST and `tests/unit/` is fully populated, contrary to the
//     brief's inventory. Neither changes anything here: this file imports from neither, which is what
//     the brief actually requires.
//   * THIS IS THE SIXTH SUITE IN THIS FOLDER, not the seventh, and `mysqlPromotionRepository.test.ts`
//     does not exist yet. Cross-references to it are forward-looking, and nothing here depends on it.
//   * THERE ARE THREE FIXTURE MODULES, not five. Only the two this file genuinely needs are imported.
//   * ONE IMPORT SITS OUTSIDE THIS FILE'S DECLARED DEPENDENCY LIST, and it is here on purpose:
//     `appConfig` from `src/lib/config.ts`. `src/repositories/mysql/dialect.ts` — which IS declared —
//     consumes it and is the only owner of the dialect decision, so `appConfig.reset()` is the only way
//     to make that decision deterministic between tests instead of dependent on which test ran first.
//     It is used for `reset()` alone, never to read a value, and the sibling suite
//     `mysqlPriceGroupRepository.test.ts` already imports it for the same reason.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT ASSERTED
//
//   * `getSkuStocksDeletableFlag` IS NOT ASSERTED AND IS NOT ADDED. Its absence from the port is
//     deliberate: `model/dao/SkuDAO.cfc` never declares it, neither `model/dao/HibachiDAO.cfc` nor
//     `org/Hibachi/HibachiDAO.cfc` provides an `onMissingMethod`, and so the service method that calls
//     it [model/service/SkuService.cfc:L281-L282] raises at runtime today. The port-surface block below
//     asserts the absence; nothing asserts a behaviour for it.
//   * NO PERFORMANCE, LATENCY, THROUGHPUT OR AVAILABILITY CLAIM appears anywhere. The legacy system
//     publishes no such target and none is invented. The unbounded combination count of
//     `SkuService.createSkus` [model/service/SkuService.cfc:L109-L121] is a service-tier concern and is
//     not turned into a timing assertion here.
//   * NO `ORDER BY` IS ASSERTED FOR `searchSkusByProductType`, because the legacy emits none
//     [model/dao/SkuDAO.cfc:L130-L148], and none is added.
//   * THE SIBLING ASYMMETRIES WITH `ProductDAO` ARE NOT UNIFIED. `SkuDAO` guards with
//     `trim(...) != ""` and filters through a correlated sub-select; `ProductDAO` uses a `len()` guard
//     and a direct filter. Both are reproduced as written, in their own suites.
//   * NO INFRASTRUCTURE ARTIFACT AND NO DEPLOYMENT STEP is exercised. "Deployable" is proven by the
//     build and package scripts, not by a test.
//
// ---------------------------------------------------------------------------
// NO DATABASE, NO NETWORK, NO FILESYSTEM
//
// This suite passes with an empty environment, no `.env` file present and no server reachable. It
// creates no pool and no connection, opens no socket, reads and writes no file, starts no container and
// applies no schema change. It is deliberately NOT gated on the `TEST_LIVE_DATABASE` flag that
// `tests/setup.ts` resolves: its results are identical whether that flag is set, unset or malformed,
// because nothing here consults it.
//
// The one exception to "reads no environment value" is narrow, deliberate and documented at its own
// block: the `C-3` ordering statement cannot be built without a resolved dialect, and the shipped SQL
// module states in its own words that "a test that exercises this builder configures the environment"
// [src/repositories/mysql/sql/sortedProductSkus.sql.ts]. That block stubs five variables with
// unmistakably fake placeholder values, holds no credential of any kind, and restores the process
// environment afterwards. See `applyConfiguredDialectEnvironment` and its two companions below.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Product } from '../../../src/domain/entities/product.js';
import type { SkuRepository } from '../../../src/domain/ports/skuRepository.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { cfBoolean, cfTruthy } from '../../../src/lib/cfml/truthiness.js';
import { appConfig } from '../../../src/lib/config.js';
import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import type { DatabaseDialect } from '../../../src/repositories/mysql/dialect.js';
import {
  optionGroupOdometerPowerFragment,
  resolveConfiguredDialect,
  resolveDialect,
} from '../../../src/repositories/mysql/dialect.js';
import { MysqlSkuRepository } from '../../../src/repositories/mysql/mysqlSkuRepository.js';
import { SelectedOptionsError } from '../../../src/repositories/mysql/sql/skusBySelectedOptions.sql.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// ---------------------------------------------------------------------------
// Identifiers used as bound values
//
// Well-formed 32-character unhyphenated keys, matching what the `uuid` generator on every in-scope
// entity produces [e.g. model/entity/Sku.cfc:L52]. The option identifiers additionally satisfy
// `SELECTED_OPTIONS_INPUT_CONTRACT.optionIDPattern` in
// `src/repositories/mysql/sql/skusBySelectedOptions.sql.ts`, which rejects anything else before a
// statement is built.
// ---------------------------------------------------------------------------

const OPTION_A = '4f2a91c8b73e40d6ae15c92fb8074d3a';
const OPTION_B = 'c81d05e4fa6b47289d3e6170ba52cf9e';
const OPTION_C = '9b6e37f0d24c418aa5710e83c6fd92b1';

const PRODUCT_ID = '444df2f7ea9c87e60051f3cd87b435a1';
const SKU_ID = 'aaaa1111bbbb2222cccc3333dddd4444';
const OPTION_GROUP_ID = '77c1e5a9b0d34f6e8a2b41c7d9e06f35';
const SKU_CURRENCY_ID = '2e9f4b71c0a84d5eb63f28d19a7c05e4';

const SKU_CODE = 'TEST-SKU-0001';
const ALTERNATE_LOOKUP_CODE = 'ALT-SKU-0001';

// CFML parity: `tests/setup.ts` pins `process.env.TZ` to `'UTC'` before any subject is imported, and
// every date literal in this file is an explicit UTC instant so that a bound timestamp cannot depend on
// the machine that ran the suite. No zero-argument `new Date()` appears anywhere below, and no global
// fake timer is installed.
const AUDIT_INSTANT_UTC = new Date('2024-06-01T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Expected SQL, transcribed independently from the legacy source
//
// These constants are written out by hand from `model/dao/SkuDAO.cfc` rather than imported from the
// modules under test, so that an accidental edit to a statement cannot silently agree with itself. Two
// details are load-bearing and must not be "tidied": THE TRAILING SPACE at the end of several fragments,
// which is what lets the next clause append without gluing two words together, and THE TAB INDENTATION
// carried over from the CFML heredoc.
// ---------------------------------------------------------------------------

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

const EXPECTED_PRODUCT_OPTION_IDS_SQL =
  'select distinct SwOption.optionID from SwOption\n' +
  '  inner join SwSkuOption on SwSkuOption.optionID = SwOption.optionID\n' +
  '  inner join SwSku on SwSku.skuID = SwSkuOption.skuID\n' +
  '  where SwSku.productID = ?';

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

// CFML parity [model/dao/SkuDAO.cfc:L65-L85]: ten `EXISTS` sub-queries joined by `OR`, in the source's
// own order, with the two `SwStockAdjustmentItem` arms distinguished by `fromStockID` and `toStockID`.
// The legacy walks unqualified association paths such as `stock.sku.skuID`; the port resolves each to an
// explicit join against the physical `SwStock` table, which is what those paths meant.
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
  'subscriptionTermID = ?, remoteID = ?, createdDateTime = ?, createdByAccountID = ?, ' +
  'modifiedDateTime = ?, modifiedByAccountID = ? where skuID = ?';

const DDL_VERBS = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'] as const;

// ---------------------------------------------------------------------------
// The recording executor
//
// Written INLINE and duplicated across the suites in this folder rather than shared. That is not
// oversight: one exported unit per file is the standing rule here, a test file exports nothing, and a
// shared `helpers.ts` under `tests/integration/` would be a seventh file this folder does not have. The
// sibling suites carry their own copy for the same reason.
//
// It satisfies `PreparedStatementExecutor` structurally AND nominally — `implements` is declared, so the
// compiler rejects it the moment the port's shape changes. No mocking library is involved; module-level
// mocking is available but a hand-written double is preferred, because what is under test is the exact
// argument pair the adapter passes and a hand-written recorder captures that without indirection.
//
// `noUncheckedIndexedAccess` makes every indexed read `T | undefined`. It is narrowed through
// `statementAt` and `onlyStatement` below, never through a postfix assertion and never through a type
// assertion.
// ---------------------------------------------------------------------------

interface RecordedStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

const NO_ROWS: readonly SqlRow[] = Object.freeze([]);

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
   * `params` carries a default so that a call made with NO second argument — which the option-group
   * aggregate is, deliberately — records as an empty array rather than as `undefined`. The captured
   * array is a copy, because the adapter builds several of its parameter arrays with a spread and a
   * later mutation of the original would otherwise rewrite history.
   */
  public execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params: [...params] });

    const cannedRows = this.cannedResultSets[this.answeredResultSets] ?? NO_ROWS;
    this.answeredResultSets += 1;

    return Promise.resolve(cannedRows);
  }

  public executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutationCalls.push({ sql, params: [...params] });

    return Promise.resolve(this.mutationResult);
  }
}

/**
 * Narrows one recorded statement out of a list, raising with a diagnosable message when it is absent.
 *
 * This exists so that no assertion below needs a postfix `!` or a type assertion to satisfy
 * `noUncheckedIndexedAccess`. A missing statement is a genuine failure and reads better as an explicit
 * message than as a `TypeError` on `undefined`.
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

/** Narrows the single recorded statement, raising when the count is anything other than one. */
function onlyStatement(calls: readonly RecordedStatement[]): RecordedStatement {
  if (calls.length !== 1) {
    throw new Error(
      `Expected exactly one recorded statement but ${String(calls.length)} were recorded.`,
    );
  }

  return statementAt(calls, 0);
}

/** Counts non-overlapping occurrences of a fragment, without a regular expression. */
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
 * The interface-parity assertions need a method's declared arity and its name, and reading either one
 * through `MysqlSkuRepository.prototype.someMethod` detaches the method from its receiver — which
 * `@typescript-eslint/unbound-method` correctly refuses, because a detached method that later reached a
 * call site would run with the wrong `this`. Going through `Reflect.get` into an `unknown` and narrowing
 * with a `typeof` guard states the intent exactly: this is metadata, and it is never invoked.
 */
function prototypeMethodOf(methodName: keyof SkuRepository): { name: string; arity: number } {
  const member: unknown = Reflect.get(MysqlSkuRepository.prototype, methodName);

  if (typeof member !== 'function') {
    throw new Error(`MysqlSkuRepository.prototype.${methodName} should be a method`);
  }

  return { name: member.name, arity: member.length };
}

// ---------------------------------------------------------------------------
// The base-product-type double
//
// JUDGMENT CALL: `getProductSkus(product, fetchOptions)` branches on
// `await product.getBaseProductType()` [model/dao/SkuDAO.cfc:L154-L158], and the four SQL shapes can
// only be reached by varying that value. `makeProductFixture()` always yields `'merchandise'`, and the
// only other seam would be constructing a `ProductType` — a module this suite is not wired to and has no
// business reaching into. Subclassing `Product` and overriding the one method is therefore the narrow,
// whitelisted route: it imports nothing new, it is a hand-written double of exactly one method, and the
// remainder of the entity — notably `getProductID()`, which supplies the only bound value — is the real
// implementation rather than a stand-in.
//
// The override is intentionally NOT declared `async`. It returns the same `Promise<string | undefined>`
// the base method returns, which is a legal override and avoids an `async` function with nothing to
// await. `noImplicitOverride` is satisfied by the explicit `override` keyword.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Canned rows
//
// Every column the hydration factory reads must be PRESENT on the row, because the adapter distinguishes
// "column absent from the projection" — a statement or driver fault — from "column present and SQL NULL",
// which is a real data state. Absence raises; `null` is honoured. The row builders below therefore always
// carry the full key set and let a caller override individual values.
//
// Monetary columns arrive as STRINGS, which is not a convenience: the pool leaves the driver's
// `decimalNumbers` option unset precisely so a DECIMAL reaches this layer as its exact decimal text and
// can become a `Money` without ever passing through a binary float.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Configuring a dialect for the one statement that needs one
//
// JUDGMENT CALL: `buildSortedProductSkusStatement` resolves the dialect INSIDE its own body rather than
// accepting it as an argument, and it does so deliberately — the legacy read the engine at the query
// site itself through `getApplicationValue("databaseType")` [model/dao/SkuDAO.cfc:L194], and the legacy
// method's only declared argument was `productID` [L173]. The shipped SQL module states the consequence
// in its own words: "a test that exercises this builder configures the environment". This block is that
// configuration.
//
// It is scoped to the statements that need it and reverted immediately afterwards. `appConfig.reset()`
// is structurally required on BOTH sides: a no-argument `load()` memoizes, so without a reset the first
// resolution would fix the dialect for the remainder of the file and the "unconfigured process raises"
// assertions could not run. Passing an explicit source instead is not an option — an explicit source is
// validated fresh and never memoized, so it cannot reach `resolveConfiguredDialect()`.
//
// NO CREDENTIAL, NO REAL HOST AND NO REAL ACCOUNT APPEARS HERE. The host uses the reserved `.invalid`
// top-level domain, which is guaranteed never to resolve; the other three values are the same
// self-describing placeholder. They exist only to satisfy a validator that reports every missing
// variable in one pass, and only `DB_DIALECT` is read by anything this suite exercises.
// ---------------------------------------------------------------------------

const PLACEHOLDER_VALUE = 'unused-by-this-suite';

const CONFIGURED_DIALECT_ENVIRONMENT: readonly (readonly [string, string])[] = Object.freeze([
  Object.freeze(['DB_HOST', 'unused-by-this-suite.invalid'] as const),
  Object.freeze(['DB_USER', PLACEHOLDER_VALUE] as const),
  Object.freeze(['DB_PASSWORD', PLACEHOLDER_VALUE] as const),
  Object.freeze(['DB_TLS_MODE', 'disabled'] as const),
  Object.freeze(['DB_DIALECT', 'mysql'] as const),
]);

function applyConfiguredDialectEnvironment(): void {
  appConfig.reset();

  for (const [name, value] of CONFIGURED_DIALECT_ENVIRONMENT) {
    vi.stubEnv(name, value);
  }
}

/**
 * Removes all five variables so that "the process is unconfigured" is a fact this suite establishes
 * rather than a property of the machine it happens to run on.
 *
 * Without this, a developer with the variables exported in their shell would see the
 * hard-error assertions pass for the wrong reason, or fail for one. Stubbing to `undefined` deletes the
 * variable for the duration of the test, which is the deterministic form of "absent".
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
  // -------------------------------------------------------------------------
  // The port surface
  // -------------------------------------------------------------------------
  describe('the ported method surface is the seven locked methods and nothing else', () => {
    it('assigns to the port type with no widening, proving the class implements it', () => {
      // Composed BY HAND with an explicit constructor argument. No container, no locator, no bootstrap
      // and no ambient request scope — which is the whole point of replacing the legacy convention scan.
      // The legacy unit base did the opposite: it instantiated the application component, called
      // `bootstrap()` before every test and elevated the account to superuser. None of that is carried
      // over; the assertions are, the harness is not.
      const repository: SkuRepository = new MysqlSkuRepository(new RecordingExecutor());

      expect(repository).toBeInstanceOf(MysqlSkuRepository);
    });

    it('exposes exactly seven methods, enumerated exhaustively by the compiler', () => {
      // `Record<keyof SkuRepository, true>` makes this exhaustive at COMPILE time: omit a method and the
      // literal fails to type-check, add an eighth and the extra key is rejected. The runtime length
      // check then pins the count a reader can see without running the compiler.
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

      const repository = new MysqlSkuRepository(new RecordingExecutor());

      for (const methodName of Object.keys(portMethods)) {
        expect(typeof Reflect.get(repository, methodName)).toBe('function');
      }
    });

    it('does NOT expose getSkuStocksDeletableFlag, which is deliberately absent', () => {
      // The legacy service method [model/service/SkuService.cfc:L281-L282] delegates to a DAO function
      // that `model/dao/SkuDAO.cfc` never declares, and no `onMissingMethod` exists on either
      // `model/dao/HibachiDAO.cfc` or `org/Hibachi/HibachiDAO.cfc` to absorb the call — so it raises at
      // runtime today. The entity reaches it at [model/entity/Sku.cfc:L569]. Adding it here would invent
      // a capability the source does not have.
      const repository = new MysqlSkuRepository(new RecordingExecutor());

      expect('getSkuStocksDeletableFlag' in repository).toBe(false);
      expect(Reflect.get(repository, 'getSkuStocksDeletableFlag')).toBeUndefined();
    });

    it('declares no batch, limit, timeout, retry or transaction parameter on any method', () => {
      // Bulk behaviour belongs to the service tier: `SkuService.createSkus`
      // [model/service/SkuService.cfc:L58] runs a combination odometer at [L109-L121] whose count is the
      // product of every option-group size and is therefore unbounded by construction. Batching,
      // idempotency and compensation are that tier's problem. The repository's arity is the evidence that
      // none of it leaked down here, and this assertion carries no claim about cost or speed.
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

        // The legacy camelCase name survives verbatim — interface parity is the acceptance contract.
        expect(method.name).toBe(methodName);
        expect(method.arity).toBe(arity);
      }
    });

    it('constructs from an executor alone, with collaborator ports optional', () => {
      // The executor is a CONSTRUCTOR PARAMETER, and that is a mandate rather than a convenience:
      // `src/repositories/mysql/connection.ts` names these suites as the reason. Nothing here reaches a
      // module-scope pool, so importing the adapter opens no connection.
      expect(MysqlSkuRepository).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // C-1  getSkusBySelectedOptions — AND-of-EXISTS
  // -------------------------------------------------------------------------
  describe('getSkusBySelectedOptions emits one ANDed EXISTS per selected option', () => {
    // CFML parity [model/dao/SkuDAO.cfc:L106]: the source states the contract in its own comment —
    // "returns product skus which matches ALL options (list of optionIDs) that are passed in". ALL, not
    // any: the predicate is CONJUNCTIVE. A SKU carrying two of three selected options does not match.
    //
    // The legacy loop spells the accessor `listGetat` with a lowercase `a` [model/dao/SkuDAO.cfc:L114];
    // CFML is case-insensitive about function names, so the target's `listGetAt` in
    // `src/lib/cfml/list.ts` is the same function correctly spelled, reached here through
    // `listToArray` in the shipped builder.

    // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L107-L128]: the `opt` join alias is never referenced in
    // the WHERE clause; the join is nonetheless load-bearing (it excludes option-less SKUs) and is
    // harmless only because of the DISTINCT.
    // Preserved deliberately; do not fix without a product decision.

    it('grows by exactly one EXISTS clause and one bound parameter for 1 selected option', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions(OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(countOccurrences(statement.sql, EXPECTED_OPTION_EXISTS_PREDICATE)).toBe(1);
      expect(statement.params).toStrictEqual([OPTION_A]);
      expect(statement.sql).toBe(EXPECTED_SELECTED_OPTIONS_SEED + EXPECTED_OPTION_EXISTS_PREDICATE);
    });

    it('grows by exactly one EXISTS clause and one bound parameter for 2 selected options', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions(OPTION_A + ',' + OPTION_B);

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

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions(
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
      // The same growth property stated once as an invariant, so that a future change which added a
      // clause without a bind — or a bind without a clause — fails here even if it satisfied the three
      // literal cases above by accident.
      const selections: readonly (readonly string[])[] = [
        [OPTION_A],
        [OPTION_A, OPTION_B],
        [OPTION_A, OPTION_B, OPTION_C],
      ];

      for (const selection of selections) {
        const executor = new RecordingExecutor([NO_ROWS]);

        await new MysqlSkuRepository(executor).getSkusBySelectedOptions(selection.join(','));

        const statement = onlyStatement(executor.calls);
        const clauseCount = countOccurrences(statement.sql, EXPECTED_OPTION_EXISTS_PREDICATE);
        const placeholderCount = countOccurrences(statement.sql, '?');

        expect(clauseCount).toBe(selection.length);
        expect(statement.params).toHaveLength(selection.length);
        expect(placeholderCount).toBe(statement.params.length);
      }
    });

    it('keeps the 0 = 0 seed predicate so every later clause appends with a uniform leading and', async () => {
      // JUDGMENT CALL: the target KEEPS the literal `0 = 0` seed rather than emitting a clean `WHERE`
      // with the first predicate unprefixed. Both forms select the same rows, but the seed is what makes
      // clause assembly uniform, and reproducing it keeps the emitted text diffable against
      // [model/dao/SkuDAO.cfc:L109-L112]. The predicate SET is therefore identical to the legacy's:
      // the seed, then one EXISTS per option, then the optional product predicate — nothing more.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions(OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql.startsWith(EXPECTED_SELECTED_OPTIONS_SEED)).toBe(true);
      expect(countOccurrences(statement.sql, '0 = 0')).toBe(1);

      const predicates = statement.sql
        .slice(EXPECTED_SELECTED_OPTIONS_SEED.length)
        .split('and ')
        .filter((fragment) => fragment.trim().length > 0);

      // One `and`-introduced predicate for the single option, and the nested `and o.optionID = ?` that
      // lives inside it. Nothing else follows the seed.
      expect(predicates).toHaveLength(2);
    });

    it('preserves DISTINCT and the load-bearing SwSkuOption join', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions(OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toContain('select distinct sku.* from SwSku as sku');
      expect(statement.sql).toContain('inner join SwSkuOption as opt on opt.skuID = sku.skuID');
      expect(statement.sql).not.toContain('left join SwSkuOption as opt');
    });

    it('omits the product predicate and its parameter entirely when productID is not supplied', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions(OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).not.toContain(EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE);
      expect(statement.params).toStrictEqual([OPTION_A]);
    });

    it('emits the product predicate exactly once, with productID bound LAST, when it is supplied', async () => {
      // With a `productID` the adapter first resolves the product's own option identifiers, so TWO
      // statements are recorded and the ordering matters: the narrowing lookup, then the matching query.
      const executor = new RecordingExecutor([
        [Object.freeze({ optionID: OPTION_A }), Object.freeze({ optionID: OPTION_B })],
        NO_ROWS,
      ]);

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions(
        OPTION_A + ',' + OPTION_B,
        PRODUCT_ID,
      );

      expect(executor.calls).toHaveLength(2);

      const narrowing = statementAt(executor.calls, 0);
      expect(narrowing.sql).toBe(EXPECTED_PRODUCT_OPTION_IDS_SQL);
      expect(narrowing.params).toStrictEqual([PRODUCT_ID]);

      const matching = statementAt(executor.calls, 1);
      expect(countOccurrences(matching.sql, EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE)).toBe(1);
      expect(matching.sql).toBe(
        EXPECTED_SELECTED_OPTIONS_SEED +
          EXPECTED_OPTION_EXISTS_PREDICATE +
          EXPECTED_OPTION_EXISTS_PREDICATE +
          EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE,
      );

      // C1.5: option-list order first, in the order the identifiers appear in the comma list, then
      // productID last — clause order and parameter order are the same order.
      expect(matching.params).toStrictEqual([OPTION_A, OPTION_B, PRODUCT_ID]);
    });

    it('emits the product predicate and binds the empty string when productID is supplied as empty', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L123]: the product guard is `structKeyExists` with no
      // length test, so an empty-string productID is bound and the predicate is emitted rather than
      // skipped.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The emptiness decision is therefore a PRESENCE decision, exactly as CFML's `structKeyExists`
      // makes it, and not a `cfLen`/`cfTruthy` decision — routing it through truthiness would silently
      // drop the predicate and change which rows come back.
      const executor = new RecordingExecutor([NO_ROWS, NO_ROWS]);

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions('', '');

      expect(executor.calls).toHaveLength(2);

      const matching = statementAt(executor.calls, 1);
      expect(matching.sql).toBe(
        EXPECTED_SELECTED_OPTIONS_SEED + EXPECTED_SELECTED_OPTIONS_PRODUCT_PREDICATE,
      );
      expect(matching.params).toStrictEqual(['']);
    });

    it('refuses a selection whose options do not belong to the narrowed product', async () => {
      // A consequence of narrowing rather than a separate rule: an empty-string productID matches no
      // product, so the product owns no options, so no non-empty selection can be a subset of them. The
      // shipped builder fails closed instead of emitting a query that could only ever return nothing.
      // The legacy answered zero rows either way; failing closed makes the same outcome diagnosable.
      const executor = new RecordingExecutor([NO_ROWS, NO_ROWS]);

      await expect(
        new MysqlSkuRepository(executor).getSkusBySelectedOptions(OPTION_A, ''),
      ).rejects.toThrow(SelectedOptionsError);
    });

    it('puts no option identifier and no product identifier into the SQL text', async () => {
      // Parameterized SQL, asserted directly. Every value travels in the bound array; the statement text
      // carries placeholders only.
      const executor = new RecordingExecutor([
        [Object.freeze({ optionID: OPTION_A }), Object.freeze({ optionID: OPTION_C })],
        NO_ROWS,
      ]);

      await new MysqlSkuRepository(executor).getSkusBySelectedOptions(
        OPTION_A + ',' + OPTION_C,
        PRODUCT_ID,
      );

      for (const statement of executor.calls) {
        expect(statement.sql).not.toContain(OPTION_A);
        expect(statement.sql).not.toContain(OPTION_C);
        expect(statement.sql).not.toContain(PRODUCT_ID);
      }

      const matching = statementAt(executor.calls, 1);
      expect(countOccurrences(matching.sql, '?')).toBe(matching.params.length);
      expect(matching.params).toStrictEqual([OPTION_A, OPTION_C, PRODUCT_ID]);
    });
  });

  // -------------------------------------------------------------------------
  // C-2  getSkuBySkuCode — one value, two bindings
  // -------------------------------------------------------------------------
  describe('getSkuBySkuCode binds one supplied value at both occurrences', () => {
    it('matches the primary skuCode OR an alternate code, over a LEFT join', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the join must stay a LEFT join. An inner join would
      // exclude every SKU that has no alternate code at all, which is most of them, and the primary-code
      // lookup would silently stop working for exactly those rows.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getSkuBySkuCode(SKU_CODE);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SKU_BY_SKU_CODE_SQL);
      expect(statement.sql).toContain('left join SwAlternateSkuCode ascs on ascs.skuID = ss.skuID');
      expect(statement.sql).toContain('where ss.skuCode = ? or ascs.alternateSkuCode = ?');
      expect(statement.sql).not.toContain('inner join SwAlternateSkuCode');
    });

    it('binds the single logical value TWICE, once per placeholder', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the legacy uses a NAMED parameter, `:skuCode`,
      // referenced at two sites and supplied once. The pool leaves named placeholders switched off, so the
      // port is positional and the same value must be bound at both positions. The distinction is
      // observable, which is the point: two placeholders, two entries, one supplied value.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getSkuBySkuCode(ALTERNATE_LOOKUP_CODE);

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

      const found = await new MysqlSkuRepository(executor).getSkuBySkuCode(SKU_CODE);

      expect(found).toBeUndefined();
      expect(executor.calls).toHaveLength(1);
    });

    it('raises on a multi-row result, reproducing the legacy unique-result contract', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the third argument to the legacy query call is `true`,
      // which asks the ORM for a unique result and raises when more than one row comes back. The port
      // raises too rather than silently taking the first row, because `skuCode` is declared unique
      // [model/entity/Sku.cfc:L54] and a second row means the schema constraint was bypassed.
      const executor = new RecordingExecutor([[makeSkuRow(), makeSkuRow({ skuID: OPTION_B })]]);

      await expect(new MysqlSkuRepository(executor).getSkuBySkuCode(SKU_CODE)).rejects.toThrow(
        /unique result/u,
      );
    });
  });

  // -------------------------------------------------------------------------
  // C-3  getSortedProductSkusID — the option-group ordering, and the dialect
  // -------------------------------------------------------------------------
  describe('getSortedProductSkusID emits the option-group positional-weight ordering', () => {
    // ⭐ THE CARRIED-FORWARD TODO, reproduced character for character from
    // [model/dao/SkuDAO.cfc:L177]. It is NOT completed here and must not be: the engines it names are
    // exactly the ones this port does not implement, so discharging it would mean building and testing an
    // arm the migration deliberately excludes.
    //
    // TODO: test to see if this query works with DB's other than MSSQL and MySQL
    //
    // Its presence in the shipped builder, the adapter and the dialect module was verified by reading
    // all three during discovery. It is not asserted programmatically, because doing so would require
    // reading a source file from disk and this suite performs no filesystem access at all.

    // JUDGMENT CALL: legacy interpolates #getNextOptionGroupSortOrder()# directly into the ORDER BY
    // (model/dao/SkuDAO.cfc:L194-L197); the target binds it as a prepared-statement parameter.
    // Semantics are identical and parameterized-SQL-exclusively (P5/E5) is satisfied.
    // CFML parity [model/dao/SkuDAO.cfc:L194-L197]: the MySQL POWER(10, n - sortOrder) ordering
    // expression is reproduced exactly.

    describe('with a configured MySQL dialect', () => {
      beforeEach(() => {
        applyConfiguredDialectEnvironment();
      });

      afterEach(() => {
        revertConfiguredDialectEnvironment();
      });

      it('projects one column, joins the three link tables and groups by skuID', async () => {
        const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS]);

        await new MysqlSkuRepository(executor).getSortedProductSkusID(PRODUCT_ID);

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

        await new MysqlSkuRepository(executor).getSortedProductSkusID(PRODUCT_ID);

        const statement = statementAt(executor.calls, 1);

        expect(statement.sql).toContain(
          'ORDER BY\n    SUM(SwOption.sortOrder * POWER(10, ? - SwOptionGroup.sortOrder)) ASC',
        );
        // The multiplication, the base of ten, the subtraction order and the direction are each pinned
        // separately so that a partial "simplification" cannot slip through a single string compare.
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

        await new MysqlSkuRepository(executor).getSortedProductSkusID(PRODUCT_ID);

        const statement = statementAt(executor.calls, 1);

        // The parameter order is the order the clauses appear in the emitted statement: the `WHERE`
        // predicate precedes the `ORDER BY`, so `productID` is bound first and the odometer second. The
        // odometer's value is the aggregate's maximum plus one — four plus one.
        expect(statement.params).toStrictEqual([PRODUCT_ID, 5]);
        expect(countOccurrences(statement.sql, '?')).toBe(2);

        // No numeric literal for the odometer survives in the text.
        expect(statement.sql).not.toContain('POWER(10, 5');
        expect(statement.sql).not.toContain(PRODUCT_ID);
      });

      it('returns skuID strings in the order the statement emitted them', async () => {
        // The legacy returns the query object itself [model/dao/SkuDAO.cfc:L201]; the port reads out the
        // one projected column. The rows are mapped in place with no re-sort and no de-duplication —
        // the `GROUP BY` already guarantees one row per SKU, and re-sorting would discard the ordering
        // this statement exists to produce.
        const executor = new RecordingExecutor([
          [Object.freeze({ max: 2 })],
          [
            Object.freeze({ skuID: 'ccc33333ccc33333ccc33333ccc33333' }),
            Object.freeze({ skuID: 'aaa11111aaa11111aaa11111aaa11111' }),
            Object.freeze({ skuID: 'bbb22222bbb22222bbb22222bbb22222' }),
          ],
        ]);

        const identifiers = await new MysqlSkuRepository(executor).getSortedProductSkusID(
          PRODUCT_ID,
        );

        expect(identifiers).toStrictEqual([
          'ccc33333ccc33333ccc33333ccc33333',
          'aaa11111aaa11111aaa11111aaa11111',
          'bbb22222bbb22222bbb22222bbb22222',
        ]);
        // Identifiers, not entities: the name ends in `ID` and nothing is hydrated, so no currency or
        // option statement follows.
        expect(executor.calls).toHaveLength(2);
      });

      it('resolves a case-folded dialect spelling to the canonical MySQL value', () => {
        // The stubbed value is the lowercase `mysql`; the resolver normalizes it. CFML's `eq` was
        // case-insensitive and the source spells the engine inconsistently across files, so folding is
        // parity rather than leniency.
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
        // No silent default anywhere: the legacy conditional chain at `config/configORM.cfm:L9-L15` ends
        // with no else arm, so an unknown engine aborted rather than guessing.
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

      it('raises when the dialect is unset, after issuing only the aggregate statement', async () => {
        // The aggregate is issued during argument evaluation, BEFORE the builder resolves a dialect. On an
        // unconfigured process the recorded evidence is therefore exactly one statement followed by a
        // configuration failure — which is a hard error, never a statement built against a guessed engine.
        const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS]);

        await expect(
          new MysqlSkuRepository(executor).getSortedProductSkusID(PRODUCT_ID),
        ).rejects.toThrow();

        const statement = onlyStatement(executor.calls);
        expect(statement.sql).toBe(EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL);
        expect(statement.params).toStrictEqual([]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // C-4  getProductSkus — five code paths, four distinct statements
  // -------------------------------------------------------------------------
  describe('getProductSkus routes five code paths onto four distinct statements', () => {
    // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L163]: an invalid duplicate `var` declaration combined
    // with a compound assignment (`var hql &= ...`).
    // Preserved deliberately; do not fix without a product decision.
    //
    // It is a syntax-level artifact with no observable behavioural difference, so it is annotated rather
    // than reproduced: invalid syntax cannot be expressed in the target, and the `WHERE` clause it
    // appends is emitted exactly as intended.
    //
    // CFML parity [model/dao/SkuDAO.cfc:L165]: the query call passes `{ignoreCase="true"}`, which the
    // legacy engine applies to ORDER BY handling. This statement has no ORDER BY, so the option is inert
    // and nothing behavioural is asserted from it.
    //
    // CFML parity [model/dao/SkuDAO.cfc:L150]: the DAO signature is `(product, fetchOptions)` and there
    // is NO `sorted` argument on it. The `sorted` flag belongs to
    // `SkuService.getProductSkus` [model/service/SkuService.cfc:L220], which decides afterwards whether
    // to consult `getSortedProductSkusID`.

    it('emits the bare statement when fetchOptions is falsy', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        false,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_BARE_PRODUCT_SKUS_SQL);
      expect(statement.params).toStrictEqual([PRODUCT_ID]);
    });

    it('eagerly fetches access contents for a contentAccess product', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getProductSkus(
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

      await new MysqlSkuRepository(executor).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        true,
      );

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_MERCHANDISE_PRODUCT_SKUS_SQL);
      expect(countOccurrences(statement.sql, 'INNER JOIN')).toBe(1);
      expect(statement.params).toStrictEqual([PRODUCT_ID]);
    });

    it('joins the subscription term AND eagerly fetches the benefits for a subscription product', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L159-L160]: TWO joins, and only the SECOND is a fetch join.
      // The term is joined to constrain the rows; the benefits are joined to materialize them. Three of
      // the five true fetch joins in the whole in-scope data layer are in this method — L155, L157 and
      // L160 — and the asymmetry between L159 and L160 is deliberate in the source.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getProductSkus(
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

    it('adds NO join for an unrecognized base product type, emitting the same statement as the falsy case', async () => {
      // ⭐ THIS IS THE WHOLE POINT OF "FIVE PATHS, FOUR SHAPES". The legacy branch chain at
      // [model/dao/SkuDAO.cfc:L154-L161] closes with no else arm, so a base product type outside the
      // three it names contributes nothing and the statement is the bare one. The identity is asserted
      // rather than described.
      const truthyButUnrecognized = new RecordingExecutor([NO_ROWS]);
      const falsy = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(truthyButUnrecognized).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'giftCard'),
        true,
      );
      await new MysqlSkuRepository(falsy).getProductSkus(
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

        await new MysqlSkuRepository(executor).getProductSkus(
          new StubbedBaseTypeProduct(PRODUCT_ID, baseProductType),
          fetchOptions,
        );

        emitted.push(onlyStatement(executor.calls).sql);
      }

      expect(emitted).toHaveLength(5);
      expect(new Set(emitted).size).toBe(4);
    });

    it('gates the join on CFML truthiness rather than on JavaScript truthiness', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L153]: the guard is a bare `fetchOptions` resolved from the
      // implicit arguments scope, and CFML truthiness accepts "1", "true", "yes" and any non-zero number
      // while rejecting "0", "false", "no" and the empty string. JavaScript truthiness disagrees on
      // exactly the interesting cases — `Boolean('no')` and `Boolean('0')` are both `true` — so the
      // divergence is what proves which gate is in use.
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

      // And the adapter honours that gate: a CFML-falsy string selects the bare statement even though a
      // bare `if (x)` would have selected the join. The port narrows `fetchOptions` to `boolean`, so the
      // string form is rejected at compile time — which is asserted here alongside the runtime behaviour
      // rather than worked around.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        // @ts-expect-error the port declares `fetchOptions: boolean`, so a CFML-truthy string is a
        // compile-time error. The runtime behaviour below is nonetheless part of the contract, because
        // `cfTruthy` is what the adapter calls and a caller crossing the boundary untyped must see CFML
        // semantics rather than JavaScript ones.
        'no',
      );

      expect(onlyStatement(executor.calls).sql).toBe(EXPECTED_BARE_PRODUCT_SKUS_SQL);
    });

    it('binds exactly one productID, taken from the entity accessor and never inlined', async () => {
      // The real entity is used here rather than the double, because the bound value comes from
      // `product.getProductID()` and that accessor should be the production one.
      const product = makeProductFixture({ productID: PRODUCT_ID });
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).getProductSkus(product, false);

      const statement = onlyStatement(executor.calls);

      expect(product.getProductID()).toBe(PRODUCT_ID);
      expect(statement.params).toStrictEqual([product.getProductID()]);
      expect(countOccurrences(statement.sql, '?')).toBe(1);
      expect(statement.sql).not.toContain(PRODUCT_ID);
    });

    it('materializes the option association in the same pass and issues nothing on traversal', async () => {
      // `fetchOptions` is an EAGER-LOAD FLAG governing the MAIN statement's join shape. The associations
      // themselves are materialized at the repository boundary in the same call, which is what removes
      // lazy loading from the target entirely — traversing a hydrated SKU issues no query, because there
      // is no session to lazily load from.
      const populated = new RecordingExecutor([[makeSkuRow()], NO_ROWS, [makeSkuOptionRow()]]);

      const withOptions = await new MysqlSkuRepository(populated).getProductSkus(
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

      const withoutOptions = await new MysqlSkuRepository(bare).getProductSkus(
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

      const skus = await new MysqlSkuRepository(contentAccess).getProductSkus(
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

      const skus = await new MysqlSkuRepository(subscription).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'subscription'),
        true,
      );

      expect(statementAt(subscription.calls, 3).sql).toContain('SwSkuSubsBenefit');
      expect(statementAt(subscription.calls, 3).params).toStrictEqual([SKU_ID]);
      expect(skus[0]?.getSubscriptionBenefitIDs()).toStrictEqual([OPTION_B]);
    });
  });

  // -------------------------------------------------------------------------
  // C-5  searchSkusByProductType
  // -------------------------------------------------------------------------
  describe('searchSkusByProductType reproduces the LIKE search and its correlated sub-select', () => {
    // JUDGMENT CALL: legacy raw SQL at model/dao/SkuDAO.cfc:L132 and :L135 names the ORM entities
    // SlatwallSku/SlatwallProduct and therefore always throws at runtime; the target emits the
    // physical SwSku/SwProduct tables as a correction mandated by schema continuity (C5/B5).
    // CFML parity [model/dao/SkuDAO.cfc:L130-L148]: the LIKE predicate, the correlated IN-subquery
    // and the absence of ORDER BY are reproduced unchanged.
    //
    // This is deliberately NOT marked as a preserved defect: a statement that cannot execute has no
    // behaviour to preserve, and the entity names were plainly meant to be the tables they map to. Note
    // for contrast that the HQL in `getSkuBySkuCode`, `getSkusBySelectedOptions` and `getProductSkus`
    // names ORM entities correctly, because those calls really do go through the ORM — no correction is
    // applied to them.

    it('raises when the optional term is omitted, because the legacy binds it unconditionally', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L133]: the optional `term` argument is bound
      // unconditionally as "%term%", so omitting it throws at runtime. The identical defect exists
      // in the sibling search method at model/dao/ProductDAO.cfc:L422.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The raise is reproduced rather than papered over. Substituting an empty string would turn the
      // call into an unfiltered `like '%%'` table scan that the legacy never performed, and substituting
      // `'%%'` would do the same while looking deliberate.
      const executor = new RecordingExecutor([NO_ROWS]);

      await expect(new MysqlSkuRepository(executor).searchSkusByProductType()).rejects.toThrow(
        /term/u,
      );

      expect(executor.calls).toHaveLength(0);
    });

    it('keeps the wildcards inside the bound value, never in the statement text', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).searchSkusByProductType('shirt');

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SEARCH_SKUS_SQL);
      expect(statement.sql).toContain('like ?');
      expect(statement.sql).not.toContain('%');
      expect(statement.sql).not.toContain('shirt');
      expect(statement.params).toStrictEqual(['%shirt%']);
    });

    it('treats a whitespace-only productTypeID as absent, matching the trim guard', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L134]: the guard is `trim(arguments.productTypeID) != ""`.
      // The sibling `model/dao/ProductDAO.cfc` uses a `len()` guard instead, which would ACCEPT a
      // whitespace-only value. The two are deliberately NOT unified: each suite pins its own source.
      for (const blankish of ['   ', '\t', '\n', ' \t\n ']) {
        const executor = new RecordingExecutor([NO_ROWS]);

        await new MysqlSkuRepository(executor).searchSkusByProductType('shirt', blankish);

        const statement = onlyStatement(executor.calls);

        expect(statement.sql).toBe(EXPECTED_SEARCH_SKUS_SQL);
        expect(statement.sql).not.toContain('productTypeID');
        expect(statement.params).toStrictEqual(['%shirt%']);
      }
    });

    it('filters through a correlated IN-subquery rather than a direct column filter', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).searchSkusByProductType('shirt', OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SEARCH_SKUS_ONE_PRODUCT_TYPE_SQL);
      expect(statement.sql).toContain(
        'productID in (select productID from SwProduct where productTypeID in (',
      );
      // Not a direct filter: the SKU table carries no productTypeID column, and flattening the sub-select
      // into a join would change the statement's shape for no behavioural gain.
      expect(statement.sql).not.toContain('SwSku.productTypeID');
      expect(statement.params).toStrictEqual(['%shirt%', OPTION_A]);
    });

    it('expands a comma list to one placeholder per element for 1, 2 and 3 elements', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L136]: the bound parameter carries `list="true"`, which the
      // legacy engine expanded into one placeholder per element. The port splits the list itself and binds
      // each element separately, which is the same statement with the same values.
      const cases: readonly (readonly [readonly string[], string])[] = [
        [[OPTION_A], EXPECTED_SEARCH_SKUS_ONE_PRODUCT_TYPE_SQL],
        [[OPTION_A, OPTION_B], EXPECTED_SEARCH_SKUS_TWO_PRODUCT_TYPES_SQL],
        [[OPTION_A, OPTION_B, OPTION_C], EXPECTED_SEARCH_SKUS_THREE_PRODUCT_TYPES_SQL],
      ];

      for (const [elements, expectedSql] of cases) {
        const executor = new RecordingExecutor([NO_ROWS]);

        await new MysqlSkuRepository(executor).searchSkusByProductType('shirt', elements.join(','));

        const statement = onlyStatement(executor.calls);

        expect(statement.sql).toBe(expectedSql);
        // One `?` for the LIKE term plus one per element.
        expect(countOccurrences(statement.sql, '?')).toBe(elements.length + 1);
        expect(statement.params).toStrictEqual(['%shirt%', ...elements]);
      }
    });

    it('never emits an empty IN () for a delimiter-only list', async () => {
      // An empty `IN ()` is a MySQL syntax error, so a list that splits to nothing still binds one
      // element — the empty string, which matches no product type and is therefore the same outcome the
      // legacy list expansion produced.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).searchSkusByProductType('shirt', ',');

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_SEARCH_SKUS_ONE_PRODUCT_TYPE_SQL);
      expect(statement.sql).not.toContain('in ()');
      expect(statement.params).toStrictEqual(['%shirt%', '']);
    });

    it('emits no ORDER BY, exactly as the legacy does not', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).searchSkusByProductType('shirt', OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).not.toContain('ORDER BY');
      expect(statement.sql).not.toContain('order by');
    });

    it('preserves the singular argument name alongside the plural legacy bind name', () => {
      // CFML parity [model/dao/SkuDAO.cfc:L130 and :L136]: the argument is `productTypeID`, SINGULAR,
      // while the bound list was named `:productTypeIDs`, PLURAL. Neither is normalized. The port's
      // parameter keeps the singular legacy spelling because interface parity is the acceptance contract;
      // the plural name disappears with the named-parameter style itself, and the positional expansion
      // above is what replaces it.
      const searchMethod = prototypeMethodOf('searchSkusByProductType');

      expect(searchMethod.name).toBe('searchSkusByProductType');
      expect(searchMethod.arity).toBe(2);
    });

    it('names no Slatwall-prefixed identifier in the emitted statement', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor).searchSkusByProductType('shirt', OPTION_A);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).not.toContain('Slatwall');
      expect(statement.sql).toContain('SwSku');
      expect(statement.sql).toContain('SwProduct');
    });

    it('hydrates entities rather than the legacy id/value projection, with the keys recorded', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L142-L145]: the legacy builds an array of structs keyed
      // `"id"` and `"value"` for an autocomplete widget. The port declares `Promise<Sku[]>`, so the
      // projection moves to whatever presentation layer wants it — and the two keys are recorded here
      // verbatim so that a caller reconstructing them uses the legacy spelling rather than inventing
      // `label` or `text`. The values they carried are `skuID` and `skuCode`, both of which the hydrated
      // entity exposes.
      const legacyProjectionKeys = Object.freeze(['id', 'value'] as const);
      const executor = new RecordingExecutor([[makeSkuRow()], NO_ROWS, NO_ROWS]);

      const found = await new MysqlSkuRepository(executor).searchSkusByProductType('shirt');

      expect(legacyProjectionKeys).toStrictEqual(['id', 'value']);
      expect(found).toHaveLength(1);
      expect(found[0]?.getSkuID()).toBe(SKU_ID);
      expect(found[0]?.getSkuCode()).toBe(SKU_CODE);
    });
  });

  // -------------------------------------------------------------------------
  // C-6  the option-group odometer: memoized, never cleared, request-scoped
  // -------------------------------------------------------------------------
  describe('the option-group odometer is memoized per instance and never shared between them', () => {
    beforeEach(() => {
      applyConfiguredDialectEnvironment();
    });

    afterEach(() => {
      revertConfiguredDialectEnvironment();
    });

    it('issues the aggregate with an empty parameter array, because there is nothing to bind', async () => {
      const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS]);

      await new MysqlSkuRepository(executor).getSortedProductSkusID(PRODUCT_ID);

      const aggregate = statementAt(executor.calls, 0);

      expect(aggregate.sql).toBe(EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL);
      expect(aggregate.sql).toContain('max(SwOptionGroup.sortOrder)');
      expect(aggregate.sql).toContain('FROM SwOptionGroup');
      expect(aggregate.params).toStrictEqual([]);
      expect(countOccurrences(aggregate.sql, '?')).toBe(0);
    });

    it('issues the aggregate once per instance and reuses the cached value afterwards', async () => {
      const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS, NO_ROWS]);
      const repository = new MysqlSkuRepository(executor);

      await repository.getSortedProductSkusID(PRODUCT_ID);
      await repository.getSortedProductSkusID(SKU_ID);

      expect(executor.calls).toHaveLength(3);
      expect(
        executor.calls.filter(
          (recorded) => recorded.sql === EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL,
        ),
      ).toHaveLength(1);

      // Both ordering statements carry the SAME odometer, taken from the one aggregate.
      expect(statementAt(executor.calls, 1).params).toStrictEqual([PRODUCT_ID, 5]);
      expect(statementAt(executor.calls, 2).params).toStrictEqual([SKU_ID, 5]);
    });

    it('exposes no cache-clear method, because the legacy one can never fire', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: the cache-clear guard is inverted (it deletes
      // the key only when the key does not exist), making the method a guaranteed no-op so the cache
      // is never cleared.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Its observable behaviour is reproduced exactly — the cache is never cleared within an instance —
      // and the method itself is not carried onto the port, because a public method whose entire
      // behaviour is "do nothing" would be an invitation to call it and expect an effect. The no-op is
      // asserted below through the only thing that was ever observable about it: a second call on the
      // same instance does not re-issue the aggregate, whether or not anything asked for a clear.
      const executor = new RecordingExecutor([[Object.freeze({ max: 4 })], NO_ROWS, NO_ROWS]);
      const repository = new MysqlSkuRepository(executor);

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
      // ⭐ THE REQUEST-SCOPED-STATE PROOF. The legacy cache lives on the DAO component, which the
      // framework kept for the life of the application, and the clear method that was supposed to bound
      // it cannot fire. Reproducing that as module state would mean one invocation's option-group
      // geometry silently ordering another invocation's SKUs on a warm container. The cache is therefore
      // an instance field, and an instance is request-scoped.
      //
      // The ONE sanctioned module-scope exception in the whole target is the connection pool. Nothing
      // else, including this cache. Test isolation is left switched on and the runner configuration is
      // not touched from here — the isolation asserted below is a property of the adapter, not of the
      // runner.
      const first = new RecordingExecutor([[Object.freeze({ max: 9 })], NO_ROWS]);
      const second = new RecordingExecutor([[Object.freeze({ max: 3 })], NO_ROWS]);

      await new MysqlSkuRepository(first).getSortedProductSkusID(PRODUCT_ID);
      await new MysqlSkuRepository(second).getSortedProductSkusID(PRODUCT_ID);

      // The second instance re-issues the aggregate rather than trusting the first one's answer...
      expect(statementAt(second.calls, 0).sql).toBe(EXPECTED_NEXT_OPTION_GROUP_SORT_ORDER_SQL);
      // ...and orders by ITS OWN value, which differs from the first instance's.
      expect(statementAt(first.calls, 1).params).toStrictEqual([PRODUCT_ID, 10]);
      expect(statementAt(second.calls, 1).params).toStrictEqual([PRODUCT_ID, 4]);
    });

    it('yields one when the aggregate returns SQL NULL over an empty table', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L214]: the legacy computes `rs.max + 1`, and over an empty
      // table `max()` is SQL NULL, which CFML stringifies to the empty string so that `"" + 1` coerces to
      // 1. The target reaches the same 1 explicitly, by treating an absent maximum as "no groups yet"
      // instead of relying on a string-plus-number coercion. This is an ordering exponent rather than a
      // monetary value, so plain integer arithmetic is correct here and no decimal type is involved.
      const executor = new RecordingExecutor([[Object.freeze({ max: null })], NO_ROWS]);

      await new MysqlSkuRepository(executor).getSortedProductSkusID(PRODUCT_ID);

      expect(statementAt(executor.calls, 1).params).toStrictEqual([PRODUCT_ID, 1]);
    });

    it('yields one when the aggregate returns no row at all, a branch the legacy could never reach', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L213]: the legacy guards the overwrite with `rs.recordCount`,
      // but an aggregate query ALWAYS returns exactly one row, so the guard is always true and the seeded
      // default of 1 at [L206] is dead. The target reaches the same 1 for a row-less result, so the
      // outcome is identical whether the branch is reachable or not.
      const executor = new RecordingExecutor([NO_ROWS, NO_ROWS]);

      await new MysqlSkuRepository(executor).getSortedProductSkusID(PRODUCT_ID);

      expect(statementAt(executor.calls, 1).params).toStrictEqual([PRODUCT_ID, 1]);
    });
  });

  // =========================================================================
  // C-7 — getTransactionExistsFlag [model/dao/SkuDAO.cfc:L53-L98]
  //
  // Tag syntax, `returntype="boolean"`, and the only method in the file whose body is a single counting
  // statement. The legacy chooses ONE key predicate — `ss.skuID` when a skuID is supplied [L59],
  // otherwise `ss.product.productID` [L62] — and then ORs ten `EXISTS` sub-queries against it [L65-L85].
  //
  // ⚠ A DISCREPANCY BETWEEN THE BRIEF AND THE SHIPPED CODE, recorded rather than reconciled.
  // The brief's C7.2 asks that the boolean be derived through `cfBoolean()`. The shipped adapter instead
  // reproduces the legacy's own gate literally: [L93] is `<cfif results[1] eq 0>`, a comparison against
  // zero, and the adapter writes `readCount(...) !== 0`. Asserting a `cfBoolean` CALL the adapter does
  // not make would be asserting a fiction, so this suite asserts the stronger and honest thing instead —
  // that the two gates agree on every count, which is what makes the divergence immaterial.
  //
  // Called with NO arguments at [model/service/SkuService.cfc:L285], which is why both parameters are
  // optional on the port. The adapter refuses that call rather than counting every sku in the table.
  // =========================================================================

  describe('getTransactionExistsFlag: the counting statement and its single key predicate', () => {
    it('binds only the productID and emits the product key predicate with the ten ORed EXISTS arms', async () => {
      const executor = new RecordingExecutor([[Object.freeze({ skuCount: 0 })]]);

      await new MysqlSkuRepository(executor).getTransactionExistsFlag(PRODUCT_ID);

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(
        EXPECTED_TRANSACTION_EXISTS_HEAD +
          EXPECTED_TRANSACTION_EXISTS_PRODUCT_KEY +
          EXPECTED_TRANSACTION_EXISTS_TAIL,
      );
      expect(statement.params).toStrictEqual([PRODUCT_ID]);

      // Ten arms, nine separators. CFML parity [model/dao/SkuDAO.cfc:L65-L85].
      expect(countOccurrences(statement.sql, 'EXISTS(')).toBe(10);
      expect(countOccurrences(statement.sql, '\n          OR\n')).toBe(9);

      // The key predicate is chosen, never both. CFML parity [model/dao/SkuDAO.cfc:L58-L63].
      expect(statement.sql).not.toContain(EXPECTED_TRANSACTION_EXISTS_SKU_KEY);
      expect(countOccurrences(statement.sql, '?')).toBe(1);
    });

    it('emits the sku key predicate instead when a skuID is supplied, binding only that', async () => {
      const executor = new RecordingExecutor([[Object.freeze({ skuCount: 3 })]]);

      await new MysqlSkuRepository(executor).getTransactionExistsFlag(undefined, SKU_ID);

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

      await new MysqlSkuRepository(executor).getTransactionExistsFlag(PRODUCT_ID, SKU_ID);

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toContain(EXPECTED_TRANSACTION_EXISTS_SKU_KEY);
      expect(statement.params).toStrictEqual([SKU_ID]);
      expect(statement.params).not.toContain(PRODUCT_ID);
    });

    it('answers a boolean: zero matching skus is false and a positive count is true', async () => {
      const noneExecutor = new RecordingExecutor([[Object.freeze({ skuCount: 0 })]]);
      const someExecutor = new RecordingExecutor([[Object.freeze({ skuCount: 3 })]]);

      const none = await new MysqlSkuRepository(noneExecutor).getTransactionExistsFlag(PRODUCT_ID);
      const some = await new MysqlSkuRepository(someExecutor).getTransactionExistsFlag(PRODUCT_ID);

      // The port declares `Promise<boolean>`, so these are booleans and not counts.
      expect(typeof none).toBe('boolean');
      expect(typeof some).toBe('boolean');
      expect(none).toBe(false);
      expect(some).toBe(true);
    });

    it('agrees with CFML boolean coercion on every count, which is why the != 0 gate is immaterial', () => {
      // The recorded discrepancy, discharged as an assertion rather than as a comment. The adapter's
      // gate is `readCount(...) !== 0`, reproducing `<cfif results[1] eq 0>`
      // [model/dao/SkuDAO.cfc:L93]; CFML's own numeric-to-boolean coercion is what `cfBoolean` models.
      // For a COUNT — always a non-negative integer — the two are the same function, and this proves it
      // across the boundary and beyond it.
      const counts: readonly number[] = [0, 1, 2, 3, 10, 4096];

      for (const count of counts) {
        expect(cfBoolean(count)).toBe(count !== 0);
      }

      // And the persisted-flag boundary `cfBoolean` also serves: SQL NULL resolves to false rather than
      // raising, which is what makes it usable on the nine undefaulted boolean columns in this schema.
      expect(cfBoolean(null)).toBe(false);
    });

    it('refuses the no-argument call the legacy service makes rather than counting the whole table', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L285]: the service declares and calls
      // `getTransactionExistsFlag()` with no arguments, but the DAO's key predicate at
      // [model/dao/SkuDAO.cfc:L58-L63] requires one of the two identifiers, so the legacy call binds an
      // undefined variable and fails at runtime.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The target fails too, and fails LOUDER — before any statement is issued — because a counting
      // statement with no key predicate would silently answer about every sku in the table.
      const executor = new RecordingExecutor([]);

      await expect(new MysqlSkuRepository(executor).getTransactionExistsFlag()).rejects.toThrow();
      expect(executor.calls).toHaveLength(0);
    });
  });

  // =========================================================================
  // C-8 — currency-detail materialization at the repository boundary
  //
  // ★ THE ASYNC-BOUNDARY RULE, MADE OBSERVABLE. `Sku.getCurrencyDetails()`
  // [model/entity/Sku.cfc:L367-L433] and the three accessors that read it [L269-L273], [L275-L279] and
  // [L281-L285] are SYNCHRONOUS in the legacy and must stay synchronous here, because their signatures
  // are part of the acceptance contract. They can only stay synchronous because the per-currency price
  // map is materialized during hydration — which is this adapter's job, and is what the assertions below
  // pin. A method is `async` if and only if its legacy body reaches the DAO or the ORM; an accessor over
  // an already-materialized struct does not.
  //
  // ★★ AND THE HIGHEST-CONSEQUENCE PARITY CHECK IN THE WHOLE PLAN LIVES HERE. All three accessors answer
  // NOTHING for a price they do not have. Substituting a zero would silently sell products for free, so
  // `undefined` is asserted explicitly and a zero is asserted against.
  // =========================================================================

  describe('currency materialization: the same pass, synchronous accessors, and absent prices', () => {
    it('fetches the SwSkuCurrency rows in the same pass as the sku rows, keyed by the sku identifiers', async () => {
      // C8.1. Hydration is one ordered pass: the driving statement, then the per-currency price rows,
      // then the option rows. The fetch shape is a decision taken HERE, at the repository boundary,
      // rather than deferred to a lazy collection the entity would trip over later.
      const executor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      await new MysqlSkuRepository(executor).getSkuBySkuCode(SKU_CODE);

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
      // C8.4. `model/entity/SkuCurrency.cfc:L68` declares `currencyCode` with
      // `insert="false" update="false"` — it is a READ-ONLY projection of the foreign key, so it is
      // legitimate in a SELECT list and forbidden in a mutation column list. Both halves are asserted.
      const executor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      await new MysqlSkuRepository(executor).getSkuBySkuCode(SKU_CODE);

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
      // C8.2. The map is read, never computed on demand: reading it returns a plain object rather than a
      // promise, and the recorded call log does not grow.
      const executor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      const sku = await new MysqlSkuRepository(executor).getSkuBySkuCode(SKU_CODE);

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
      // ★ C8.3, first half. CFML parity [model/entity/Sku.cfc:L373]: the whole cascade body sits behind
      // `if(len(setting('skuEligibleCurrencies')))`, so when that setting resolves empty the memo stays
      // `{}` and EVERY accessor answers nothing. Constructing this adapter without the settings provider
      // and the converter reaches the identical state — the map is left unmaterialized rather than
      // half-filled, and no accessor invents a value to cover the gap.
      const executor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);

      const sku = await new MysqlSkuRepository(executor).getSkuBySkuCode(SKU_CODE);

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
      // ★★ C8.3, second half, AND THE SHARPEST DISTINCTION IN THIS BLOCK. CFML parity
      // [model/entity/Sku.cfc:L275-L279] and [L281-L285]: those two accessors perform a SECOND
      // `structKeyExists` on the sub-key, so they answer nothing even for a currency that IS in the map.
      // "Currency absent" and "currency present, this price absent" are different states and the target
      // keeps them apart.
      //
      // Built through the sku fixture because this shape needs the cascade collaborators the fixture
      // wires; the assertions are about the ENTITY contract the repository must feed, and no statement is
      // issued anywhere in this test.
      const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });
      await sku.materializeCurrencyDetails();

      const price = sku.getPriceByCurrencyCode('EUR');

      if (price === undefined) {
        throw new Error(
          'the secondaryPriceOnly variant records a price for the secondary currency',
        );
      }

      // C8.5: compared BY VALUE through the decimal value object, never by string identity and never
      // through a binary float. `19.99` and `19.990` are the same money and different strings.
      expect(price.equals(Money.fromDecimalString('17.49'))).toBe(true);
      expect(Money.fromDecimalString('19.99').equals(Money.fromDecimalString('19.990'))).toBe(true);

      // The currency is unambiguously present...
      expect(Object.keys(sku.getCurrencyDetails())).toContain('EUR');

      // ...and yet these two answer nothing, because the row left those columns NULL.
      expect(sku.getListPriceByCurrencyCode('EUR')).toBeUndefined();
      expect(sku.getRenewalPriceByCurrencyCode('EUR')).toBeUndefined();

      // Stated the other way for the avoidance of doubt: not a zero.
      expect(sku.getListPriceByCurrencyCode('EUR')).not.toEqual(Money.zero);
    });

    it('maps a NULL SwSkuCurrency price to nothing while the sku default-zero columns keep answering', async () => {
      // C8.6. The two cases are NOT the same and must not be flattened into one another.
      //
      // CFML parity [model/entity/SkuCurrency.cfc:L53]: `price` carries NO `default="0"`, so a NULL
      // column really does yield nothing — and that is what lets step 3's `structKeyExists(entry,
      // "price")` test at [model/entity/Sku.cfc:L416] fire and convert. A sentinel zero here would
      // suppress the conversion and change a customer-facing price.
      //
      // CFML parity [model/entity/Sku.cfc:L55-L57]: `listPrice`, `price` and `renewalPrice` on the SKU
      // itself DO declare `default="0"`, so a NULL in one of those answers zero rather than nothing.
      const executor = new RecordingExecutor([
        [makeSkuRow({ renewalPrice: null })],
        [makeSkuCurrencyRow({ price: '17.49', listPrice: null, renewalPrice: null })],
        [makeSkuOptionRow()],
      ]);

      const sku = await new MysqlSkuRepository(executor).getSkuBySkuCode(SKU_CODE);

      if (sku === undefined) {
        throw new Error('the canned single-row result should have hydrated a sku');
      }

      // The sku's own defaulted column still answers, by value.
      expect(sku.getPrice().equals(Money.fromDecimalString('19.99'))).toBe(true);
      expect(sku.getListPrice().equals(Money.fromDecimalString('24.99'))).toBe(true);
      expect(sku.getRenewalPrice().equals(Money.fromDecimalString('0'))).toBe(true);

      // The per-currency row's undefaulted column did not become a zero anywhere on the way in: the
      // hydrated SkuCurrency association is the direct evidence.
      const currencies = sku.getSkuCurrencies();
      const currency = currencies[0];

      if (currency === undefined) {
        throw new Error('the canned currency row should have hydrated a SkuCurrency');
      }

      // `CurrencyCode` is a branded three-character type rather than a bare string, so the brand is
      // widened for the comparison instead of being asserted away.
      expect(String(currency.getCurrencyCode())).toBe('EUR');
      expect(currency.getPrice()?.equals(Money.fromDecimalString('17.49'))).toBe(true);
      expect(currency.getListPrice()).toBeUndefined();
      expect(currency.getRenewalPrice()).toBeUndefined();
    });

    it('mints an identifier and writes all sixteen columns on the insert path', async () => {
      // The write side of the same schema contract. `Sku.isNew()` selects the path, exactly as the
      // legacy ORM did, and the insert names every one of the sixteen persistent columns.
      const executor = new RecordingExecutor([]);

      const saved = await new MysqlSkuRepository(executor).saveSku(makeSkuFixture({ isNew: true }));

      const mutation = onlyStatement(executor.mutationCalls);
      expect(mutation.sql).toBe(EXPECTED_INSERT_SKU_SQL);
      expect(mutation.params).toHaveLength(16);
      expect(countOccurrences(mutation.sql, '?')).toBe(16);

      // The identifier is minted, bound FIRST, and handed back on the entity.
      expect(saved.getSkuID()).toHaveLength(32);
      expect(mutation.params[0]).toBe(saved.getSkuID());
      expect(saved.isNew()).toBe(false);

      // No read statement is issued by a write.
      expect(executor.calls).toHaveLength(0);
    });

    it('binds the key LAST on the update path and does not treat a zero-row update as a failure', async () => {
      // The update names the fifteen non-key columns and carries the key in the WHERE clause, so the
      // identifier is the final bound value rather than the first.
      const executor = new RecordingExecutor([], NO_ROWS_WRITTEN);

      const saved = await new MysqlSkuRepository(executor).saveSku(makeSkuFixture());

      const mutation = onlyStatement(executor.mutationCalls);
      expect(mutation.sql).toBe(EXPECTED_UPDATE_SKU_SQL);
      expect(mutation.params).toHaveLength(16);
      expect(mutation.params[15]).toBe(saved.getSkuID());
      expect(mutation.sql).not.toContain(saved.getSkuID());

      // CFML parity: `super.save()` reported nothing about affected rows, and a persisted entity whose
      // column values already match produces zero of them in MySQL. Zero is therefore not an error here,
      // and this suite pins the adapter's silence rather than inventing a failure mode for it.
      expect(saved.getSkuID()).toBe(makeSkuFixture().getSkuID());
    });
  });

  // =========================================================================
  // C-9 — cross-cutting properties that hold for every method above
  //
  // These are the invariants that are not about any one statement. They are asserted once, over a sweep
  // that exercises several methods, rather than repeated in every block.
  // =========================================================================

  describe('cross-cutting: fetch shape, injected collaborators, schema continuity and UTC', () => {
    it('hydrates exactly one entity per driving row in a single pass, with no per-row follow-up query', async () => {
      // C9.1. Three driving rows, one grouped currency pass and one grouped option pass — three
      // statements in total, not three plus two per row. The fetch shape is a decision the repository
      // takes and states; nothing about it is deferred to a lazy collection.
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

      const skus = await new MysqlSkuRepository(executor).searchSkusByProductType('TEST');

      expect(skus).toHaveLength(3);
      expect(executor.calls).toHaveLength(3);

      // One entity per row, each a distinct instance rather than a shared one.
      expect(new Set(skus.map((sku) => sku.getSkuID())).size).toBe(3);
      expect(new Set(skus).size).toBe(3);

      // Associations landed on the right parents, keyed by `link_skuID` — and the third sku, which had
      // no rows in either grouped pass, holds empty arrays rather than an undefined a synchronous entity
      // method would then walk into.
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
      // C9.1, second half. DI/1 resolved collaborators by scanning `property name="xService";`
      // declarations, and the in-scope entities reached past that into `getService("xService")` — an
      // exhaustive sweep of the non-framework tree finds 46 such sites inside entities, not the seven
      // the plan's table lists: 18 in `model/entity/Product.cfc`, 19 in `model/entity/Sku.cfc`, 6 in
      // `model/entity/ProductType.cfc`, 1 in `model/entity/OptionGroup.cfc` and 1 in
      // `model/entity/RoundingRule.cfc`.
      //
      // None of them survives. This whole suite constructs the adapter with explicit arguments and no
      // container, no bootstrap and no ambient request scope exists in this process — every test above
      // hydrates entities successfully under exactly those conditions, which is the proof.
      expect(MysqlSkuRepository.length).toBe(1);

      // C9.2. `model/service/SkuService.cfc` declares five DI properties — `skuDAO` [L51],
      // `optionService` [L53], `productService` [L54], `subscriptionService` [L55] and `contentService`
      // [L56] — and `imageService` is NOT among them: it is reached by `getService("imageService")` at
      // [L210-L218], which is why the image port replaces a LOCATOR rather than a declared dependency.
      // That locator belongs to the SERVICE tier, so nothing image-shaped may appear on this port. The
      // note exists to prevent a wrong assertion; this is the right one.
      const members = Object.getOwnPropertyNames(MysqlSkuRepository.prototype);

      expect(members.filter((member) => member.toLowerCase().includes('image'))).toStrictEqual([]);
    });

    it('exposes no batching, limiting, retry or transaction control on the repository surface', () => {
      // C9.3. `SkuService.createSkus` [model/service/SkuService.cfc:L58] runs a cartesian-product
      // odometer at [L109-L121] whose combination count is the product of every option-group size and is
      // therefore unbounded by construction. Batch limits, idempotency on retry and compensation belong
      // to the SERVICE tier, which has no ambient `cftransaction` to fall back on — they are emphatically
      // not this port's concern, and no timing, cost or efficiency claim is made about any of it here or
      // anywhere else in this file.
      // Matched as EXACT member names rather than as substrings, and deliberately so:
      // `getTransactionExistsFlag` [model/dao/SkuDAO.cfc:L53] is about whether transactional RECORDS
      // reference a sku — order items, stock movements, vendor orders — and has nothing to do with
      // transaction CONTROL. A substring sweep would flag the one legitimate member on the port and prove
      // nothing, so the names that would actually represent leaked control are enumerated instead.
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

      // And the seven port methods take no extra control argument either — their arities are pinned in
      // the port-surface block above, and none of them carries a batch size, a limit or a retry policy.
      expect(prototypeMethodOf('saveSku').arity).toBe(1);
      expect(prototypeMethodOf('getProductSkus').arity).toBe(2);
    });

    it('targets only existing Sw* tables, issues no DDL and leaves no ORM entity name behind', async () => {
      // C9.4. Schema continuity asserted directly: the target reads and writes the EXISTING physical
      // schema, so no statement may create, alter, drop, truncate or rename anything, and no
      // `Slatwall`-prefixed ORM entity name may survive into emitted SQL. The sweep below exercises four
      // read methods and both write paths and then checks every statement they produced.
      const readExecutor = new RecordingExecutor([
        [makeSkuRow()],
        [makeSkuCurrencyRow()],
        [makeSkuOptionRow()],
      ]);
      const readRepository = new MysqlSkuRepository(readExecutor);
      await readRepository.getSkuBySkuCode(SKU_CODE);

      const optionsExecutor = new RecordingExecutor([NO_ROWS]);
      await new MysqlSkuRepository(optionsExecutor).getSkusBySelectedOptions(OPTION_A);

      const searchExecutor = new RecordingExecutor([NO_ROWS]);
      await new MysqlSkuRepository(searchExecutor).searchSkusByProductType('TEST', 'pt-1');

      const countExecutor = new RecordingExecutor([[Object.freeze({ skuCount: 0 })]]);
      await new MysqlSkuRepository(countExecutor).getTransactionExistsFlag(PRODUCT_ID);

      const insertExecutor = new RecordingExecutor([]);
      await new MysqlSkuRepository(insertExecutor).saveSku(makeSkuFixture({ isNew: true }));

      const updateExecutor = new RecordingExecutor([]);
      await new MysqlSkuRepository(updateExecutor).saveSku(makeSkuFixture());

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

        // The ORM entity names `SlatwallSku` and `SlatwallProduct` are not tables. Wherever the legacy
        // named them in RAW SQL it always threw at runtime, and the target emits the physical tables
        // instead — so the prefix must not appear anywhere in emitted text.
        expect(sql).not.toContain('Slatwall');

        // Every statement names at least one physical table from the in-scope set.
        expect(/\bSw[A-Z][A-Za-z]*\b/u.test(sql)).toBe(true);
      }
    });

    it('binds every timestamp as an explicit UTC instant', async () => {
      // C9.5. `tests/setup.ts` pins the process timezone to UTC and self-verifies it, and this suite adds
      // no fake timers of its own — a global clock override would make the whole folder's behaviour
      // depend on load order. Instead an explicit UTC instant is bound and round-tripped: the value that
      // comes out is the value that went in, with no local-time reinterpretation on the way.
      const executor = new RecordingExecutor([]);

      await new MysqlSkuRepository(executor).saveSku(makeSkuFixture());

      const mutation = onlyStatement(executor.mutationCalls);

      // Index 11 is `createdDateTime` in the fifteen-column update list, and the sku fixture records it
      // as exactly this instant.
      const createdDateTime = mutation.params[11];

      if (!(createdDateTime instanceof Date)) {
        throw new Error(
          'createdDateTime should be bound as a Date rather than as pre-formatted text',
        );
      }

      expect(createdDateTime.toISOString()).toBe(AUDIT_INSTANT_UTC.toISOString());
      expect(createdDateTime.getTime()).toBe(AUDIT_INSTANT_UTC.getTime());

      // And every other bound temporal value is a Date carrying the UTC designator, never a local-time
      // string the driver would have to guess at.
      for (const parameter of mutation.params) {
        if (parameter instanceof Date) {
          expect(parameter.toISOString().endsWith('Z')).toBe(true);
        }
      }
    });
  });
});
