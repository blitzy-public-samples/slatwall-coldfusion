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
// NO CASE IN THIS SUITE NEEDS A CONFIGURED ENVIRONMENT IN ORDER TO BUILD A STATEMENT, AND THAT USED
// TO BE FALSE. This header carried an exception: "the `C-3` ordering statement cannot be built without
// a resolved dialect, and the shipped SQL module states in its own words that 'a test that exercises
// this builder configures the environment'". QA testing recorded that coupling as a MAJOR defect -
// `buildSortedProductSkusStatement` read `process.env` mid-request through
// `resolveConfiguredDialect()` - and the dialect is now the builder's third ARGUMENT, supplied by
// `MysqlSkuRepository`'s `STATEMENT_DIALECT` constant. The exception is gone with it.
//
// Two blocks still touch the environment, and only because their SUBJECT is configuration: the
// dialect-resolution block asserts `resolveConfiguredDialect`/`resolveDialect` directly, and one
// case asserts case folding of a configured spelling. Both stub five variables with unmistakably
// fake placeholder values, hold no credential of any kind, and restore the process environment
// afterwards. See `applyConfiguredDialectEnvironment` and its two companions below.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Product } from '../../../src/domain/entities/product.js';
// A VALUE import, not a type-only one, and both reasons are live in this file. The cascade
// contract's signature is restated structurally below, so `Sku` is named as a TYPE there; and
// the currency-detail materialization is driven through the class's own static entry point,
// `Sku.hydrate(sku)`, so `Sku` is also named as a VALUE. No test constructs one directly -
// every entity here comes from the repository's hydration path or from `makeSkuFixture`.
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
// Imported for EXACTLY ONE case, and the reason is a runtime finding rather than convenience.
// `getProductSkus(product, true)` awaits `product.getBaseProductType()`, and every other case in this
// file supplies a `Product` subclass that overrides that method - so the combination that failed in
// production (a REALLY hydrated product whose product type carries no `systemCode`) was covered by
// nothing. The case named "★ branches correctly for a product hydrated by the REAL product adapter"
// closes that gap and is the only consumer of this import.
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
import { MysqlSkuRepository } from '../../../src/repositories/mysql/mysqlSkuRepository.js';
// Imported for exactly one read-totality case: the proof that neither the adapter nor the
// contractually total builder beneath it counts the elements of a selected-option list.
import { buildSkusBySelectedOptionsStatement } from '../../../src/repositories/mysql/sql/skusBySelectedOptions.sql.js';

/**
 * S-07. The audit actor every construction in this file supplies: an ADMIN, PERSISTED account,
 * the one combination the legacy gate [org/Hibachi/HibachiEntity.cfc:L628, L633] stamps for.
 */
const TEST_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  adminAccountFlag: true,
});

/**
 * Signed in WITHOUT the admin flag, and carrying an identifier on purpose so a refusal is
 * provably the flag's doing rather than an accident of having nothing to stamp.
 */
const NON_ADMIN_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
  adminAccountFlag: false,
});

// NOTE: this file needs no forged-account constant of its own. `makeSkuFixture` already populates
// both account columns with values it invents, so the fixture IS the caller-supplied value the
// S-07 cases assert is ignored - which is a more faithful reproduction of the defect than a
// purpose-built literal would be.
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// ---------------------------------------------------------------------------
// Identifiers used as bound values
//
// Well-formed 32-character unhyphenated keys, matching what the `uuid` generator on every in-scope
// entity produces [e.g. model/entity/Sku.cfc:L52]. They are well-formed because realistic values make
// the assertions readable, NOT because the statement builder requires it: an earlier revision of
// `src/repositories/mysql/sql/skusBySelectedOptions.sql.ts` published a shape-and-size contract and
// rejected anything outside it, and that contract is gone. [model/dao/SkuDAO.cfc:L106-L128] validates
// nothing, so any string is bindable and an unmatchable one yields zero rows rather than an error.
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

/**
 * S-07. BOTH account columns resolve against themselves here rather than binding a bare
 * placeholder, and this adapter is the one where that matters most: its SET list keeps the CREATED
 * pair as well as the modified one, because Hibernate flushed the whole dirty entity. That rewrite
 * was harmless when the value came from the ROW; a hand-built entity's does not, so
 * `COALESCE(?, column)` lets the database supply the stored value and the entity's own is never
 * bound. `preUpdate` [org/Hibachi/HibachiEntity.cfc:L651-L679] restamps the modifying account only
 * when the actor gate passes, and never restamps the creating one at all - so preserving is exactly
 * what the legacy did, and binding null would have ERASED provenance instead.
 */
const EXPECTED_UPDATE_SKU_SQL =
  'update SwSku set activeFlag = ?, skuCode = ?, listPrice = ?, price = ?, renewalPrice = ?, ' +
  'imageFile = ?, userDefinedPriceFlag = ?, calculatedQATS = ?, productID = ?, ' +
  'subscriptionTermID = ?, remoteID = ?, createdDateTime = ?, ' +
  'createdByAccountID = COALESCE(?, createdByAccountID), ' +
  'modifiedDateTime = ?, modifiedByAccountID = COALESCE(?, modifiedByAccountID) where skuID = ?';

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
  /**
   * Whether this statement was issued inside `transaction`.
   *
   * Captured per statement so a suite can PROVE atomicity instead of assuming it.
   * A multi-statement write that must not half-apply is asserted by requiring
   * every one of its statements to carry `true` - a statement that escaped the
   * transaction (by reaching past the `tx` executor to the outer one) records
   * `false` and fails the assertion at the point the mistake is made.
   */
  readonly inTransaction: boolean;
}

const NO_ROWS: readonly SqlRow[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// Canned rows for the ONE case that hydrates through the real product adapter
//
// These belong to `MysqlProductRepository`'s projection, not to this adapter's, which is why they are
// named apart and kept together: `p_`, `b_` and `pt_` prefixes for the forty-five-label product graph,
// and the sibling product-type adapter's fourteen UNPREFIXED columns for the root read.
//
// ★ `pt_systemCode: null` IS THE WHOLE POINT. Only a BASE product type carries a system code
// [model/entity/ProductType.cfc:L110-L115], so a leaf type has none and `getBaseProductType()` must
// load the ROOT named by `productTypeIDPath` to answer. That is the branch the runtime failure was on,
// and a fixture with a populated system code would never reach it.
// ---------------------------------------------------------------------------

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
   * `params` carries a default so that a call made with NO second argument — which the option-group
   * aggregate is, deliberately — records as an empty array rather than as `undefined`. The captured
   * array is a copy, because the adapter builds several of its parameter arrays with a spread and a
   * later mutation of the original would otherwise rewrite history.
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
   * A write that must be atomic is expected to open EXACTLY ONE OUTER unit of work, so
   * the arithmetic a case asserts is `1 + N` when the method under test delegates to N
   * inner writes that each open a unit on the executor they were handed. Anything else
   * means the work was split into several units that can half-apply independently.
   */
  transactionCount = 0;

  /** Nesting depth, so joined inner calls do not read as separate units. */
  private transactionDepth = 0;

  /**
   * The transaction boundary, in call order: `BEGIN`, then `COMMIT` or `ROLLBACK`.
   *
   * Separate from `calls` and `mutationCalls` so that a case asserting the STATEMENT
   * sequence is unaffected by whether a transaction wrapped it, while a case asserting
   * ATOMICITY reads this and gets an unambiguous answer.
   *
   * ★ A JOINED INNER CALL RECORDS `'JOIN'`, NOT A SECOND `'BEGIN'`, and contributes no
   * `'COMMIT'`. That mirrors the shipped executor exactly:
   * `createConnectionExecutor` in `src/repositories/mysql/connection.ts` implements the
   * transactional executor's `transaction(work)` as `return work(boundExecutor)`, so an
   * inner call issues no `BEGIN` and the OUTERMOST caller owns the single commit. The
   * distinction matters here specifically, because `saveSku` opens a unit on the executor
   * it was given, so a caller that already holds one - the product cascade, or a service
   * looping over several SKUs - produces a JOIN rather than a second boundary.
   */
  readonly transactionEvents: string[] = [];

  /**
   * Record the transaction boundary and run `work` inline against this same recorder.
   *
   * ★ THE WORK RECEIVES `this`, DELIBERATELY. Every statement issued inside the
   * transaction therefore lands on the same `calls` and `mutationCalls` arrays as one
   * issued outside it, which is what lets a case assert the statement sequence
   * without caring whether it was transactional - and lets {@link transactionEvents}
   * be read separately when the boundary itself is the subject. The companion
   * `SplittingExecutor` in this file is the double that DOES hand over a distinct
   * object, and it is what proves no statement reached past `tx` to the outer executor.
   *
   * IT IS NOT A DATABASE. Nothing is buffered and nothing is undone on rollback: the
   * recorder captures WHAT the adapter asked for, and the real transaction semantics
   * belong to the pool-backed executor in `src/repositories/mysql/connection.ts`. A
   * case that needs to see a rollback asserts the recorded ROLLBACK marker and the
   * statements that preceded it.
   *
   * The depth is restored in a `finally` so that a failing unit of work - which is
   * exactly what a rollback test drives - does not leave the recorder believing it
   * is still inside a transaction.
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
//
// ★★★ QUOTE-THEN-REVISE, AND THE REVISION IS A RUNTIME FINDING. The paragraph above claimed "the only
// other seam would be constructing a `ProductType` — a module this suite is not wired to and has no
// business reaching into". That reasoning is sound for reaching the four SQL SHAPES and it is kept. What
// it missed is that the double also overrides away THE ONLY QUESTION this adapter asks a real product,
// so no case here exercised a genuinely hydrated one — and QA testing found the consequence: the product
// adapter was building `ProductType` with no `productTypeRepository`, so `getBaseProductType()` raised
// for the normal system-code-less leaf type and `POST /promotions/application` answered 500 while every
// case in this file passed. A THIRD seam did exist and was not considered: hydrating the product through
// `MysqlProductRepository` itself, which needs no entity module and no fixture. The case named
// "★ branches correctly for a product hydrated by the REAL product adapter" now does exactly that. The
// double remains the right tool for the shape matrix; it is no longer the ONLY tool in this block.
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
// Configuring a dialect for the cases whose SUBJECT is configuration
//
// QUOTE-THEN-REVISE. This block opened: "Configuring a dialect for the one statement that needs
// one - JUDGMENT CALL: `buildSortedProductSkusStatement` resolves the dialect INSIDE its own body
// rather than accepting it as an argument, and it does so deliberately". The CFML observation it
// rested on is accurate - the legacy read the engine at the query site through
// `getApplicationValue("databaseType")` [model/dao/SkuDAO.cfc:L194] and declared only `productID`
// [L173] - but `getApplicationValue` read AMBIENT APPLICATION scope, a value resolved ONCE at
// startup [config/configORM.cfm:L1-L15], whereas `resolveConfiguredDialect()` re-reads the process
// environment on every call. AAP transformation rule T6 replaces ambient scope with an explicit
// parameter passed down the call chain - "No ambient state" - rather than reproducing it, and QA
// testing measured what the difference cost: COMPOSING A SQL STRING loaded the whole validated
// configuration and demanded all five `DB_*` values that have no default, four of which the builder
// never used, so no statement could be built under the credential-free composition every committed
// suite must use, breaking the EMPTY-ENVIRONMENT GUARANTEE in `tests/setup.ts`.
//
// SO NO STATEMENT NEEDS CONFIGURATION NOW. The builder takes the dialect as its third argument and
// `MysqlSkuRepository` supplies it from a module constant checked by `assertMySqlDialect`, so
// `getSortedProductSkusID` completes on a completely unconfigured process - which the case named for
// it now asserts. What remains in this block needs configuration because it IS configuration: the
// `resolveConfiguredDialect()` resolution cases, which read `appConfig.load()` by design and are the
// composition root's business rather than a statement builder's, and the case that asserts case
// folding of a configured spelling.
//
// It is scoped to the cases that need it and reverted immediately afterwards. `appConfig.reset()`
// is structurally required on BOTH sides: a no-argument `load()` memoizes, so without a reset the
// first resolution would fix the dialect for the remainder of the file and the "unconfigured
// process" assertions could not run. Passing an explicit source instead is not an option - an
// explicit source is validated fresh and never memoized, so it cannot reach
// `resolveConfiguredDialect()`.
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
  describe('the ported method surface is the seven port methods and nothing else', () => {
    it('assigns to the port type with no widening, proving the class implements it', () => {
      // Composed BY HAND with an explicit constructor argument. No container, no locator, no bootstrap
      // and no ambient request scope — which is the whole point of replacing the legacy convention scan.
      // The legacy unit base did the opposite: it instantiated the application component, called
      // `bootstrap()` before every test and elevated the account to superuser. None of that is carried
      // over; the assertions are, the harness is not.
      const repository: SkuRepository = new MysqlSkuRepository(
        new RecordingExecutor(),
        TEST_AUDIT_ACTOR,
      );

      expect(repository).toBeInstanceOf(MysqlSkuRepository);
    });

    it('exposes exactly seven methods, enumerated exhaustively by the compiler', () => {
      // `Record<keyof SkuRepository, true>` makes this exhaustive at COMPILE time: omit a method and the
      // literal fails to type-check, add an EIGHTH the literal does not name and the extra key is
      // rejected. The runtime length check then pins the count a reader can see without running the
      // compiler.
      //
      // ★ THIS LITERAL CAUGHT THE PORT'S GROWTH TO EIGHT, AND THEN ITS RETURN TO SEVEN. The
      // mechanism worked exactly as designed in both directions: a `saveSkus` collection member was
      // added, this literal refused to compile until it was named, and the case was retitled; the
      // member has since been removed as an eighth on a port fixed at seven, and the literal refused
      // to compile again until it was struck. That is the whole value of enumerating exhaustively
      // rather than counting a hand-written list.
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
      // The legacy service method [model/service/SkuService.cfc:L281-L282] delegates to a DAO function
      // that `model/dao/SkuDAO.cfc` never declares, and no `onMissingMethod` exists on either
      // `model/dao/HibachiDAO.cfc` or `org/Hibachi/HibachiDAO.cfc` to absorb the call — so it raises at
      // runtime today. The entity reaches it at [model/entity/Sku.cfc:L569]. Adding it here would invent
      // a capability the source does not have.
      const repository = new MysqlSkuRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      expect('getSkuStocksDeletableFlag' in repository).toBe(false);
      expect(Reflect.get(repository, 'getSkuStocksDeletableFlag')).toBeUndefined();
    });

    it('declares no limit, timeout, retry or transaction parameter on any method', () => {
      // Bulk behaviour belongs to the service tier: `SkuService.createSkus`
      // [model/service/SkuService.cfc:L58] runs a combination odometer at [L109-L121] whose count is the
      // product of every option-group size and is therefore unbounded by construction. Batching,
      // idempotency and compensation are that tier's problem. The repository's arity is the evidence that
      // none of it leaked down here, and this assertion carries no claim about cost or speed.
      //
      // ★ THE WORD "BATCH" LEFT THIS TITLE FOR ONE REVISION AND HAS RETURNED. While the adapter
      // carried a `saveSkus` collection member the title read "declares no limit, timeout, retry or
      // transaction parameter", because a member taking a COLLECTION did write several SKUs in one
      // call. That member is gone - it was an eighth on a port fixed at seven - so no member takes a
      // batch of anything, and the original title stands again.
      //
      // ★ AND `saveSku`'s ARITY OF 1 IS LOAD-BEARING, NOT INCIDENTAL. The adapter's `saveSku` does
      // accept two extra adapter-only arguments - a parent-key override and an executor - but both are
      // DEFAULTED, which stops `Function.prototype.length` before them. So the member a port-shaped
      // consumer sees has exactly the port's arity, and this assertion is what would catch either
      // affordance being promoted into the visible signature.
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

    it('constructs from an executor and an audit actor, with collaborator ports optional', () => {
      // The executor is a CONSTRUCTOR PARAMETER, and that is a mandate rather than a convenience:
      // `src/repositories/mysql/connection.ts` names these suites as the reason. Nothing here reaches a
      // module-scope pool, so importing the adapter opens no connection.
      //
      // S-07 made it two: the audit actor joins the executor as a REQUIRED argument, ahead of the
      // optional hydration collaborators. Both describe the write boundary - where statements go and
      // who they are attributed to - and neither is resolvable from inside this class.
      expect(MysqlSkuRepository).toHaveLength(2);
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
      // JUDGMENT CALL: the target KEEPS the literal `0 = 0` seed rather than emitting a clean `WHERE`
      // with the first predicate unprefixed. Both forms select the same rows, but the seed is what makes
      // clause assembly uniform, and reproducing it keeps the emitted text diffable against
      // [model/dao/SkuDAO.cfc:L109-L112]. The predicate SET is therefore identical to the legacy's:
      // the seed, then one EXISTS per option, then the optional product predicate — nothing more.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(OPTION_A);

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
      // ★ EXACTLY ONE STATEMENT, AND AN EARLIER REVISION OF THIS CASE EXPECTED TWO.
      //
      // That revision recorded a prerequisite read of the product's own option identifiers before the
      // matching query, to feed a fail-closed membership check in the statement builder. Both are gone:
      // [model/dao/SkuDAO.cfc:L106-L128] issues ONE query on every branch, and `onlyStatement` is used
      // here rather than `statementAt(..., 1)` precisely so that a second statement fails the case.
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
      // ★ THIS CASE ASSERTED THE OPPOSITE, AND THE OPPOSITE WAS WRONG.
      //
      // It expected a `SelectedOptionsError`: an empty-string productID matches no product, so the
      // product owns no options, so no non-empty selection could be a subset of them, so the builder
      // refused. The refusal, the membership check behind it and the prerequisite read that fed it are
      // all gone. The conjunction already decides this without any of them — a SKU would have to satisfy
      // both the EXISTS for the option and `sku.productID = ''`, and none can.
      //
      // The legacy answered ZERO ROWS for this input [model/dao/SkuDAO.cfc:L106-L128], and an EMPTY
      // ARRAY is what the port now answers. "No SKU matches" is an answer, not a failure: turning it
      // into one failed a request for a caller doing nothing wrong.
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
      // The inputs the removed checks refused are pinned exhaustively in
      // tests/integration/repositories/skusBySelectedOptions.test.ts, at the builder. This case exists
      // at the ADAPTER because the adapter is what an earlier revision made issue a second statement:
      // the assertion that matters here is that an unmatchable identifier still produces exactly one
      // statement, with the value BOUND rather than interpolated.
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
      // Parameterized SQL, asserted directly. Every value travels in the bound array; the statement text
      // carries placeholders only.
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

  // -------------------------------------------------------------------------
  // C-2  getSkuBySkuCode — one value, two bindings
  // -------------------------------------------------------------------------
  describe('getSkuBySkuCode binds one supplied value at both occurrences', () => {
    it('matches the primary skuCode OR an alternate code, over a LEFT join', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the join must stay a LEFT join. An inner join would
      // exclude every SKU that has no alternate code at all, which is most of them, and the primary-code
      // lookup would silently stop working for exactly those rows.
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
      // referenced at two sites and supplied once. The pool leaves named placeholders switched off, so the
      // port is positional and the same value must be bound at both positions. The distinction is
      // observable, which is the point: two placeholders, two entries, one supplied value.
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
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the third argument to the legacy query call is `true`,
      // which asks the ORM for a unique result and raises when more than one row comes back. The port
      // raises too rather than silently taking the first row, because `skuCode` is declared unique
      // [model/entity/Sku.cfc:L54] and a second row means the schema constraint was bypassed.
      const executor = new RecordingExecutor([[makeSkuRow(), makeSkuRow({ skuID: OPTION_B })]]);

      await expect(
        new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkuBySkuCode(SKU_CODE),
      ).rejects.toThrow(/unique result/u);
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

    describe('with the MySQL dialect the adapter states for itself', () => {
      // ★ NO `beforeEach` STUBS THE ENVIRONMENT FOR THESE CASES ANY MORE, AND THAT ABSENCE IS THE
      // ASSERTION. `buildSortedProductSkusStatement` used to call `resolveConfiguredDialect()` in its
      // own body, so none of the statement-shape cases below could run without five `DB_*` variables
      // in `process.env`; the dialect is now the builder's third ARGUMENT, supplied by
      // `MysqlSkuRepository`'s own `STATEMENT_DIALECT` constant. The only case here that still reads
      // configuration is the resolver case at the end, which configures itself.
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

        await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

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

        const identifiers = await new MysqlSkuRepository(
          executor,
          TEST_AUDIT_ACTOR,
        ).getSortedProductSkusID(PRODUCT_ID);

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
        // The one case in this block that reads configuration, so it supplies its own. The stubbed
        // value is the lowercase `mysql`; the resolver normalizes it. CFML's `eq` was case-insensitive
        // and the source spells the engine inconsistently across files, so folding is parity rather
        // than leniency.
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

      it('★ COMPLETES ON A COMPLETELY UNCONFIGURED PROCESS, emitting both statements', async () => {
        // QUOTE-THEN-REVISE: THIS CASE ONCE ASSERTED THE OPPOSITE, AND THE ASSERTION WAS THE DEFECT.
        // It read "raises when the dialect is unset, after issuing only the aggregate statement" and
        // asserted that `getSortedProductSkusID` REJECTED whenever the five no-default `DB_*`
        // variables were absent, on the reasoning that "a hard error [is] never a statement built
        // against a guessed engine" - and it passed, because `buildSortedProductSkusStatement`
        // resolved the configured dialect inside its own body, so composing a SQL string raised
        // `ConfigurationError` naming five `DB_*` variables, four of which the statement never used.
        // QA testing recorded that shipped behaviour as a MAJOR defect: it left
        // `getSortedProductSkusID`, `SkuService.getSortedProductSkus` and
        // `SkuService.getProductSkus(sorted=true)` unreachable under the sanctioned credential-free
        // composition - the one a committed suite is required to use, because it may carry no host,
        // account or authentication value. Composing SQL text is not a configuration question: AAP
        // transformation rule T6 admits no ambient state, and `tests/setup.ts` states that the entire
        // suite passes with a completely empty environment.
        //
        // NOTHING IS GUESSED NOW EITHER, WHICH IS THE POINT. The engine is not inferred from an
        // absent variable: `MysqlSkuRepository` states the dialect it emits as a module constant
        // pinned by `assertMySqlDialect`, exactly as `mysqlProductRepository.ts`,
        // `mysqlProductTypeRepository.ts` and `mysqlPriceGroupRepository.ts` do, and the composition
        // root refuses to compose under any other configured dialect. Terminality is preserved where
        // the legacy put it - once, at startup [config/configORM.cfm:L1-L15] - rather than on every
        // query.
        //
        // The environment is explicitly EMPTIED by the enclosing `beforeEach`, so this passes because
        // no configuration is read, not because a machine happened to export some: with every `DB_*`
        // variable deleted the read runs to completion - the aggregate first, then the ordered
        // identifier statement - and the engine it targets is a fact about the adapter rather than
        // about the machine the test runs on.
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

        // The MySQL odometer term and the identical bind census, emitted with no environment read of
        // any kind: byte-for-byte the statement the configured-dialect cases above assert.
        expect(ordered.sql).toBe(EXPECTED_SORTED_PRODUCT_SKUS_SQL);
        expect(ordered.sql).toContain(EXPECTED_ODOMETER_POWER_FRAGMENT);
        expect(ordered.params).toStrictEqual([PRODUCT_ID, 5]);
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

    // =======================================================================
    // ★★★ THE ONE CASE THAT USES NO DOUBLE, AND WHY IT HAD TO BE ADDED
    //
    // Every other case in this block hands `getProductSkus` a
    // `StubbedBaseTypeProduct`, which overrides `getBaseProductType()` — the exact
    // method this adapter branches on. That double is the right tool for reaching the
    // four SQL shapes, and it has ONE blind spot which QA testing then walked straight
    // into: it also overrides away the ONLY question this adapter asks a REAL product.
    //
    // The finding: `POST /promotions/application` answered `500 unrecognized` for
    // ordinary catalogue data, because `MysqlProductRepository` hydrated the product's
    // `ProductType` with no `productTypeRepository`, and
    // [model/entity/ProductType.cfc:L112] cannot resolve a base type without one when
    // the type carries no `systemCode` of its own — the normal shape for a leaf type.
    // 5 934 tests passed while that stood, because no suite paired the REAL hydration
    // with this REAL call. This case is that pairing, and it is deliberately placed
    // beside the double whose blind spot it closes.
    //
    // It reaches for `MysqlProductRepository` — a module this suite otherwise has no
    // business in — for exactly that reason, and for nothing else: no other case here
    // constructs one, and no other assertion depends on it.
    // =======================================================================

    it('★ branches correctly for a product hydrated by the REAL product adapter, with NO double', async () => {
      // The product adapter's own executor, answering its documented fetch shape: the
      // product graph carrying a product type whose `systemCode` is NULL, then the SKU
      // read (no rows, so the option read is correctly skipped), then the ROOT
      // product-type read the entity issues through its injected port.
      const productExecutor = new RecordingExecutor([
        [REAL_PRODUCT_GRAPH_ROW_WITH_LEAF_TYPE],
        NO_ROWS,
        [REAL_ROOT_PRODUCT_TYPE_ROW],
      ]);
      const product = await new MysqlProductRepository(
        productExecutor,
        TEST_AUDIT_ACTOR,
      ).getProductByProductID(PRODUCT_ID);

      if (product === undefined) {
        throw new Error('the suite expected the product adapter to hydrate a product');
      }

      // And now the call that failed at runtime, on that very instance.
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(product, true);

      // ★ IT RESOLVED THE BASE TYPE AND BRANCHED ON IT. `merchandise` is what the root
      // row carries, so the merchandise fetch join is the shape that must be emitted -
      // and reaching this assertion at all means `getBaseProductType()` answered rather
      // than raising.
      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_MERCHANDISE_PRODUCT_SKUS_SQL);
      expect(statement.params).toStrictEqual([PRODUCT_ID]);

      // The root product type was read through the PRODUCT adapter's executor, by bound
      // identifier - so the resolution really did go to the datastore rather than being
      // satisfied by a stubbed answer.
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
      // CFML parity [model/dao/SkuDAO.cfc:L159-L160]: TWO joins, and only the SECOND is a fetch join.
      // The term is joined to constrain the rows; the benefits are joined to materialize them. Three of
      // the five true fetch joins in the whole in-scope data layer are in this method — L155, L157 and
      // L160 — and the asymmetry between L159 and L160 is deliberate in the source.
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

    it('adds NO join for an unrecognized base product type, emitting the same statement as the falsy case', async () => {
      // ⭐ THIS IS THE WHOLE POINT OF "FIVE PATHS, FOUR SHAPES". The legacy branch chain at
      // [model/dao/SkuDAO.cfc:L154-L161] closes with no else arm, so a base product type outside the
      // three it names contributes nothing and the statement is the bare one. The identity is asserted
      // rather than described.
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

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
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

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(product, false);

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
      // CFML parity [model/dao/SkuDAO.cfc:L134]: the guard is `trim(arguments.productTypeID) != ""`.
      // The sibling `model/dao/ProductDAO.cfc` uses a `len()` guard instead, which would ACCEPT a
      // whitespace-only value. The two are deliberately NOT unified: each suite pins its own source.
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
      // element — the empty string, which matches no product type and is therefore the same outcome the
      // legacy list expansion produced.
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
      // `"id"` and `"value"` for an autocomplete widget. The port declares `Promise<Sku[]>`, so the
      // projection moves to whatever presentation layer wants it — and the two keys are recorded here
      // verbatim so that a caller reconstructing them uses the legacy spelling rather than inventing
      // `label` or `text`. The values they carried are `skuID` and `skuCode`, both of which the hydrated
      // entity exposes.
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

  // -------------------------------------------------------------------------
  // C-6  the option-group odometer: memoized, never cleared, request-scoped
  // -------------------------------------------------------------------------
  describe('the option-group odometer is memoized per instance and never shared between them', () => {
    // No environment stubbing: every case here drives `getSortedProductSkusID`, whose statement builder
    // now takes the dialect as an argument instead of reading `process.env`.
    it('issues the aggregate with an empty parameter array, because there is nothing to bind', async () => {
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

      await new MysqlSkuRepository(first, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);
      await new MysqlSkuRepository(second, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

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

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

      expect(statementAt(executor.calls, 1).params).toStrictEqual([PRODUCT_ID, 1]);
    });

    it('yields one when the aggregate returns no row at all, a branch the legacy could never reach', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L213]: the legacy guards the overwrite with `rs.recordCount`,
      // but an aggregate query ALWAYS returns exactly one row, so the guard is always true and the seeded
      // default of 1 at [L206] is dead. The target reaches the same 1 for a row-less result, so the
      // outcome is identical whether the branch is reachable or not.
      const executor = new RecordingExecutor([NO_ROWS, NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSortedProductSkusID(PRODUCT_ID);

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

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getTransactionExistsFlag(PRODUCT_ID);

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

      await expect(
        new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getTransactionExistsFlag(),
      ).rejects.toThrow();
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
      // C8.4. `model/entity/SkuCurrency.cfc:L68` declares `currencyCode` with
      // `insert="false" update="false"` — it is a READ-ONLY projection of the foreign key, so it is
      // legitimate in a SELECT list and forbidden in a mutation column list. Both halves are asserted.
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
      // C8.2. The map is read, never computed on demand: reading it returns a plain object rather than a
      // promise, and the recorded call log does not grow.
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
      await Sku.hydrate(sku);

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
      //
      // ★ THIS CASE ONCE READ THE ROW STATEMENT WITH `onlyStatement`, ON THE STRENGTH OF THE
      // ADAPTER'S OWN CLAIM THAT IT WROTE "the `SwSku` ROW AND NOTHING ELSE. No child table, no link
      // table, and no cascade." The row half of that was true; the link-table half was a gap. The
      // write now also reconciles `SwSkuOption` [model/entity/Sku.cfc:L76], so the row statement is
      // read POSITIONALLY, at index 0, and the membership statements have their own cases below.
      // Nothing this case asserted about the row itself has changed.
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

      // No read statement is issued by a write. The membership reconciliation is delete-then-insert
      // precisely so this stays true: a computed delta would have had to read the current rows first.
      expect(executor.calls).toHaveLength(0);
    });

    // --- S-07: who the write is attributed to -----
    //
    // The finding: "Audit actor IDs are copied from caller-hydrated entities or omitted. A future
    // caller can spoof attribution or create unattributed writes" (CWE-345).
    //
    // ★ THIS SUITE'S OWN FIXTURE WAS THE SPOOF, WHICH IS WHY THESE CASES READ THE WAY THEY DO.
    // `makeSkuFixture` populates both account columns with values of its own invention, and the
    // adapter copied them straight into the statement - so every write in this file was attributed
    // to an account the fixture made up. The cases below assert the fixture's values are IGNORED,
    // which is a stronger statement than asserting the actor's are used.

    /** The insert binds sixteen values; the two accounts follow their matching date stamp. */
    const INSERT_CREATED_BY_POSITION = 13;
    const INSERT_MODIFIED_BY_POSITION = 15;
    /** The update binds fifteen set values then the key, so the accounts sit at 12 and 14. */
    const UPDATE_CREATED_BY_POSITION = 12;
    const UPDATE_MODIFIED_BY_POSITION = 14;

    it('★★ STAMPS THE REQUEST ACTOR on insert and ignores the accounts the entity carries', async () => {
      // A plain executor, NOT the zero-row one: the insert path raises when nothing was written,
      // so a zero-row double would fail this case for a reason that has nothing to do with S-07.
      const executor = new RecordingExecutor([]);
      const sku = makeSkuFixture({ isNew: true });

      // The fixture's own accounts, captured BEFORE the save so the contrast is explicit rather
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
      // Neither caller-supplied account reaches ANY position, not merely not those two.
      expect(params).not.toContain(callerCreated);
      expect(params).not.toContain(callerModified);
    });

    it('★★ STAMPS NOTHING FOR A NON-ADMIN, reproducing the getAdminAccountFlag half of the gate', async () => {
      const executor = new RecordingExecutor([]);
      const sku = makeSkuFixture({ isNew: true });
      const callerCreated = sku.getCreatedByAccountID();

      await new MysqlSkuRepository(executor, NON_ADMIN_AUDIT_ACTOR).saveSku(sku);

      const { params } = statementAt(executor.mutationCalls, 0);

      // This actor HAS an identifier, so the nulls prove the FLAG was consulted rather than that
      // there was nothing to write - a distinction an anonymous actor could not make.
      expect(NON_ADMIN_AUDIT_ACTOR.accountID).toBeDefined();
      expect(params[INSERT_CREATED_BY_POSITION]).toBeNull();
      expect(params[INSERT_MODIFIED_BY_POSITION]).toBeNull();
      expect(params).not.toContain(callerCreated);
    });

    it('★★ NEVER BINDS THE ENTITY’S CREATING ACCOUNT ON AN UPDATE, even though the column is in the SET list', async () => {
      // ★ THIS ADAPTER IS THE ONE WHERE THIS CAN GO WRONG. Its sibling adapters exclude the created
      // pair from their SET lists, so a forged creating account has nowhere to land. This one KEEPS
      // the pair, because Hibernate flushed the whole dirty entity - so the column is assigned on
      // every update and the only thing standing between a forged value and the row is what gets
      // bound. Nothing does: the statement's `COALESCE` supplies the stored value instead.
      //
      // ★ ONE ROW WRITTEN, not zero. The update path now REFUSES a statement that matched no row (see
      // the dedicated case below for the measurement behind that), and this case asserts the BOUND
      // PARAMETERS - so the double has to report a matched row or the subject is refused before there is
      // anything to read. The mutation result is incidental to what this case pins.
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
      // The modifying account IS restamped on this path, so the two differ - which is the whole
      // asymmetry `preUpdate` encodes.
      expect(params[UPDATE_MODIFIED_BY_POSITION]).toBe(TEST_AUDIT_ACTOR.accountID);
    });

    it('★★ PRESERVES A STORED ATTRIBUTION when the gate refuses, rather than erasing it', async () => {
      // One row written, for the same reason as the case above: this one pins bound parameters, and a
      // refused update would never reach them.
      const executor = new RecordingExecutor([], ONE_ROW_WRITTEN);
      const sku = makeSkuFixture();

      const saved = await new MysqlSkuRepository(executor, NON_ADMIN_AUDIT_ACTOR).saveSku(sku);

      const { params } = statementAt(executor.mutationCalls, 0);

      // Both accounts bind null and the statement resolves both against their stored columns, so a
      // non-admin save erases neither. Without that, this fix for spoofed attribution would itself
      // DESTROY attribution on every save a non-admin made.
      expect(params[UPDATE_CREATED_BY_POSITION]).toBeNull();
      expect(params[UPDATE_MODIFIED_BY_POSITION]).toBeNull();
      // And the returned entity reports what the row will hold rather than what was bound - the
      // one place where those two differ.
      expect(saved.getModifiedByAccountID()).toBe(sku.getModifiedByAccountID());
    });

    it('binds the key LAST on the update path', async () => {
      // The update names the fifteen non-key columns and carries the key in the WHERE clause, so the
      // identifier is the final bound value rather than the first. Read at index 0 for the same
      // reason as the insert case above.
      const executor = new RecordingExecutor([], ONE_ROW_WRITTEN);

      const saved = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture(),
      );

      const mutation = statementAt(executor.mutationCalls, 0);
      expect(mutation.sql).toBe(EXPECTED_UPDATE_SKU_SQL);
      expect(mutation.params).toHaveLength(16);
      expect(mutation.params[15]).toBe(saved.getSkuID());
      expect(mutation.sql).not.toContain(saved.getSkuID());
      expect(saved.getSkuID()).toBe(makeSkuFixture().getSkuID());
    });

    it('★★ REFUSES an update that matched NO row rather than reporting the entity as persisted', async () => {
      // ★★★ QUOTE-THEN-REVISE, AND THE QUOTED PREMISE IS FALSE ON THIS POOL. The case above used to be
      // titled "binds the key LAST on the update path AND DOES NOT TREAT A ZERO-ROW UPDATE AS A
      // FAILURE", closing with: "CFML parity: `super.save()` reported nothing about affected rows, and
      // a persisted entity whose column values already match produces zero of them in MySQL. Zero is
      // therefore not an error here, and this suite pins the adapter's silence rather than inventing a
      // failure mode for it."
      //
      // The MySQL claim is true of the protocol's DEFAULT and false of the connection this adapter is
      // handed: `mysql2`'s default client flag set includes `FOUND_ROWS`
      // [node_modules/mysql2/lib/connection_config.js: `getDefaultFlags`] and
      // `src/repositories/mysql/connection.ts` `buildPoolOptions()` overrides no `flags`, so the server
      // reports rows MATCHED. Measured against the live schema: a no-change update answers
      // `affectedRows: 1` with `Rows matched: 1  Changed: 0`; a no-match update answers 0. The
      // idempotent save the old note protected was never at risk.
      //
      // And the CFML parity claim pointed the wrong way. `super.save()` reported nothing because
      // HIBERNATE RAISED instead - an update to a non-existent row is a failure there, not a silent
      // no-op. QA testing found the consequence of the port's silence: `saveSku` on a SKU whose
      // `isNew()` was false and whose key named nothing RESOLVED, answered the entity carrying that
      // key, wrote no row, and a follow-up `getSkuBySkuCode` found nothing. The sibling `insertSku` on
      // this very class already refused the equivalent insert.
      const executor = new RecordingExecutor([], NO_ROWS_WRITTEN);

      const rejected = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ skuID: 'names-no-row-000', isNew: false }),
      );

      await expect(rejected).rejects.toThrow(/matched no row/);

      // The statement WAS issued - this is a refusal made on the server's own answer, not a guess made
      // before trying - and nothing was hydrated from it.
      expect(executor.mutationCalls).toHaveLength(1);
      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_UPDATE_SKU_SQL);
    });
  });

  // =========================================================================
  // ★ THE SwSkuOption MEMBERSHIP WRITE
  //
  // NET-NEW COVERAGE, declared as such per AAP 0.6.6. `meta/tests/unit/dao/` holds only
  // AccountDAOTest and PaymentDAOTest, so no legacy assertion touches this adapter at all,
  // and none touches the link table.
  //
  // WHY THE MEMBERSHIP IS NOT AN ORDINARY ASSOCIATION. `SwSkuOption` IS VARIANT IDENTITY.
  // `getSkusBySelectedOptions` matches an AND-of-EXISTS over these rows
  // [model/dao/SkuDAO.cfc:L107-L128] - a must-preserve behaviour - the sorted-SKU ordering
  // joins them to reach the option group's sort order [model/dao/SkuDAO.cfc:L172-L220], and
  // the promotion engine's option qualifier reaches them through `SwPromoRewardOption`
  // [model/dao/PromotionDAO.cfc:L428-L459]. A SKU written without its rows is a variant that
  // cannot be selected, cannot be sorted and cannot qualify, while the entity handed back
  // reports its options in memory and looks entirely correct.
  //
  // `property name="options" ... linktable="SwSkuOption" fkcolumn="skuID"
  // inversejoincolumn="optionID"` [model/entity/Sku.cfc:L76] carries no `inverse="true"`, so
  // the SKU owns the association; the inverse declaration [model/entity/Option.cfc:L66] wrote
  // nothing. Hibernate reconciled the rows from the SKU's collection on flush, and that flush
  // is what these statements replace.
  // =========================================================================

  describe('saveSku - the SwSkuOption membership the ORM used to flush', () => {
    it('★ writes one SwSkuOption row per option, keyed on the MINTED identifier', async () => {
      // The insert path is the dangerous one: binding the ARGUMENT's identifier rather than the
      // one that was written would attach three rows to a key that names no SwSku row, and lose
      // the membership entirely.
      //
      // ★ QUOTE-THEN-REVISE. This comment read: "the argument still reports `''` as its key, so
      // binding the entity's own identifier would write three orphan rows under an empty key."
      // The instruction was right and the premise was wrong. A draft built by
      // `skuService.createSkus` reports a PROVISIONAL 32-hex key, not `''` - `Sku.isNew()` reads
      // a constructor-supplied flag rather than testing the identifier - and `insertSku` mints
      // its own key and discards the provisional one. The rows would therefore land under a
      // well-formed key resolving to nothing, which is the harder failure to spot than an empty
      // one. `makeSkuFixture({ isNew: true })` leaves `skuID` at the fixture default -
      // `'<idPrefix>-sku'` - so the argument here carries a non-empty key too, and the assertion
      // below that the bound value equals `saved.getSkuID()` rather than the argument's is what
      // actually distinguishes the two.
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

      // The minted key is what was bound, and it is NOT the empty string the argument reported.
      expect(saved.getSkuID()).toHaveLength(32);
      expect(insertion.params).not.toContain('');
    });

    it('★ rewrites the membership on the UPDATE path too, not only on insert', async () => {
      // A variant whose option set changes is the ordinary case, and it is the case the gap hit
      // hardest: the row update always worked, so a SKU re-saved with different options reported
      // the new set in memory while the table still held the old one.
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
      // reduced to a single default SKU - so the delete is unconditional. Short-circuiting it for
      // an empty collection would make clearing impossible, which is the one operation most
      // likely to be attempted after a mistake.
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
      // Two or three statements now form one unit of work. A failure between the delete and the
      // insert would leave a SKU whose options had been cleared but not rewritten - a variant that
      // silently stops matching anything - so partial application is the specific outcome the
      // transaction exists to prevent. Under CFML this was one Hibernate flush inside the
      // request's transaction.
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
      // [model/entity/Sku.cfc:L77] over `SwSkuAccessContent` and `subscriptionBenefits` [L78] over
      // `SwSkuSubsBenefit` - both reaching out-of-scope entities that the ported entity does not
      // model. There is no collection here whose membership could be written, so no statement may
      // name either table. The `all-delete-orphan` cascades on `attributeValues` [L70],
      // `alternateSkuCodes` [L69], `skuCurrencies` [L72] and `stocks` [L73] are outside the ported
      // surface for the same reason and are likewise absent.
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

  // =========================================================================
  // ★★ saveSku — THE ONE PERSISTENCE MEMBER, AND ITS TWO ADAPTER-ONLY AFFORDANCES.
  //
  // ★ DECLARED NET-NEW under AAP 0.6.6. `meta/tests/unit/dao/` holds AccountDAOTest and
  // PaymentDAOTest only, so no legacy test touches this DAO at all — and this member has
  // no legacy DAO antecedent either. `SkuDAO.cfc` declares no save of any kind. The
  // antecedent is `super.save()` on the service base plus Hibernate's own FLUSH.
  //
  // ★ THE PORT DECLARES SEVEN MEMBERS AND THIS IS THE ONLY WRITE. It takes ONE entity.
  // Two extra arguments exist on the adapter and neither is on the port:
  //
  //   1. `productID` — THE PARENT KEY HANDED DOWN. A product created through
  //      `SkuService.createSkus` holds SKU drafts whose `product` association points at a
  //      product that HAS NO KEY YET, so `sku.getProduct()?.getProductID()` answers `''`
  //      on exactly the path where the parent key matters most. Under Hibernate the flush
  //      ordered the parent insert first and wrote the child's `productID` from the freshly
  //      minted key; with the ORM gone the parent key has to be handed down explicitly.
  //
  //   2. `executor` — THE TRANSACTION JOIN. Absent it, this member reaches the executor the
  //      repository was CONSTRUCTED with, so a cascade driven from `mysqlProductRepository`
  //      could not stay inside the caller's transaction: the statements would travel on a
  //      different pooled connection and commit independently, which is the precise failure
  //      the transaction exists to prevent.
  //
  // ★ BOTH ARE DEFAULTED, WHICH IS WHAT KEEPS THEM OFF THE VISIBLE SURFACE. A defaulted
  // parameter stops `Function.prototype.length`, so `saveSku.length` is 1 — identical to the
  // port's declared arity — and a caller holding only `SkuRepository` can pass neither. The
  // arity is asserted in the cross-cutting arity map above, and the port-blindness below.
  //
  // ★★ THIS BLOCK ONCE DESCRIBED TWO FURTHER PUBLIC MEMBERS, AND BOTH ARE GONE.
  //   * `saveSkuForProduct`, a public member of this class only, carried affordance 1 and 2
  //     as REQUIRED parameters. It was a ninth public member on a class whose authority
  //     fixes the surface at seven, so the affordances moved onto `saveSku` as defaulted
  //     parameters and the member was removed. The cascade contract it satisfied is
  //     unchanged in substance — `ProductSkuCascadeWriter` in
  //     `src/repositories/mysql/mysqlProductRepository.ts` now names `saveSku` — and the
  //     structural-satisfaction case below still proves this class meets it.
  //   * `saveSkus`, a COLLECTION form, was an eighth PORT member reproducing the flush as
  //     one unit of work. Its own describe block stood here and asserted real properties of
  //     it: one outer unit whatever the collection size, serial in-order writes, positional
  //     answers, mixed insert/update members, and no statement escaping to the constructed
  //     executor. Those assertions were sound; the member they described was not authorised.
  //     AAP 0.6.5 puts the batch semantics on the SERVICE tier instead — a batch limit,
  //     idempotency on retry, and a documented compensation story — and
  //     `tests/unit/services/productService.test.ts` asserts all three against
  //     `processProduct_updateSkus`. THE ATOMICITY IS GENUINELY LOST AND IS NOT PAPERED
  //     OVER: a per-SKU write can stop part way, which is exactly why the service tier's
  //     compensation obligation is retry-to-convergence rather than rollback. The two
  //     assertions from that block that describe THIS member rather than a collection — the
  //     transaction-escape check and failure propagation — are preserved below.
  // =========================================================================

  describe('saveSku - the parent key handed down, and the transaction joined', () => {
    /** `productID` is the tenth insert column and the ninth update assignment. */
    const INSERT_PRODUCT_ID_POSITION = 9;
    const UPDATE_PRODUCT_ID_POSITION = 8;

    /** A parent key of the shape `mintEntityIdentifier` produces, standing in for a fresh row. */
    const CASCADE_PRODUCT_ID = 'ac41d5e0be6f4d2ab9037cf158ea6d71';

    /** Statements one SKU write emits: the row, the membership delete, the membership insert. */
    const MUTATIONS_PER_SKU = 3;

    /**
     * An executor whose `transaction` hands a DISTINCT recorder.
     *
     * ★ WITHOUT THIS, A TRANSACTION ESCAPE IS UNDETECTABLE. `RecordingExecutor` hands its
     * callback itself, so a statement issued against `this.executor` from inside the
     * callback lands in the very same log as one issued against `tx` and the two are
     * indistinguishable. Splitting the two recorders makes the escape visible: anything
     * that reached the outer executor shows up on THIS object's own call lists, which the
     * case below asserts is empty.
     */
    class SplittingExecutor implements PreparedStatementExecutor {
      public readonly calls: RecordedStatement[] = [];

      public readonly mutationCalls: RecordedStatement[] = [];

      /** The recorder every in-transaction statement is expected to land on. */
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
      // The draft's own product is a different one entirely here, so the two candidate
      // values are distinguishable and the assertion cannot pass by coincidence.
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
      // The override is not an insert-only concern: re-parenting an already-persisted SKU
      // goes through the same seam, and `productID` sits at a different offset in the
      // assignment list than it does in the insert column list.
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
      // The cascade must not split the row write from the membership write. Both statements
      // carry `inTransaction`, exactly one transaction is opened, and the membership is keyed
      // on the minted identifier rather than on anything the draft reported.
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
      // ⚠ THE ASSERTION THE COMPILER CANNOT MAKE. Both executors satisfy the same interface,
      // so a method body that reached `this.executor` instead of its parameter would
      // type-check perfectly and silently leave the caller's transaction. Two DISTINCT
      // recorders are the only way to see the difference: the constructed one must record
      // nothing at all.
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
      // ★ PRESERVED FROM THE REMOVED COLLECTION BLOCK, because it describes THIS member and
      // not a collection. A splitting recorder is what makes an escape visible at all: the
      // outer executor opens the unit and must then issue NOTHING, while the inner recorder
      // holds every statement. Had the write handed `this.executor` to `persistSku` instead
      // of the executor it was given, these lists would carry the statements and the write
      // would be committing independently on another connection.
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
      // ★ PRESERVED FROM THE REMOVED COLLECTION BLOCK. The insert branch raises when the
      // statement reports no affected rows, which is the available way to fail a write
      // against this double.
      const executor = new RecordingExecutor([], NO_ROWS_WRITTEN);

      const rejected = new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(
        makeSkuFixture({ skuID: 'fails-first', isNew: true }),
      );

      await expect(rejected).rejects.toThrow();

      // ★ WHAT THIS DOES AND DOES NOT PROVE. It proves the failure is not swallowed — the
      // rejection reaches the caller, which is what lets the real executor's `catch` issue
      // its ROLLBACK. It does NOT prove rows were undone: this double has no connection
      // and no rollback to perform, so the already-recorded statements stay recorded. The
      // rollback itself is pinned in `tests/unit/repositories/connection.test.ts`.
      //
      // ★ AND IT IS WHY THE SERVICE TIER OWES A COMPENSATION STORY. This member is the unit
      // of atomicity, so a caller writing several SKUs can fail part way with a prefix
      // already committed. `tests/unit/services/productService.test.ts` asserts the
      // retry-to-convergence that answers it.
      expect(executor.transactionCount).toBeGreaterThan(0);
    });

    it('opens EXACTLY ONE unit whichever route it takes', async () => {
      // `saveSku` wraps its own write, so calling it from inside an enclosing transaction relies
      // on the executor a transaction hands its callback treating a further `transaction(...)` as
      // PARTICIPATION rather than as a second unit - MySQL has no nested transactions, and a
      // second `START TRANSACTION` on one connection implicitly commits the first. That join is a
      // property of `src/repositories/mysql/connection.ts` and is pinned in
      // `tests/unit/repositories/connection.test.ts`; the double here cannot express it, because
      // it has no connection and hands its callback ITSELF.
      //
      // What THIS suite can assert is the adapter's own contribution, measured as a DELTA: no
      // matter which route is taken, `saveSku` opens exactly one unit and never one per
      // statement. Asserting an absolute count of 1 would be asserting a property of the double.
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
      // port's declared arity is untouched - and passing nothing must produce exactly the
      // statements the one-argument form always produced. `productIDOverride` is `undefined` on
      // this route, and the `??` in `toSkuColumnValues` means the association read happens
      // exactly as it did before, rather than binding `undefined` over it.
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
      // `instanceof`. Importing the interface here would couple two adapter suites for no gain.
      //
      // ★ THE CONTRACT NAMES BOTH EXTRA ARGUMENTS AS REQUIRED, AND THIS CLASS SATISFIES IT WITH
      // DEFAULTED ONES. That is not a loophole - an aggregate write must never omit either, so
      // requiring them on the collaboration contract is right, while defaulting them here is what
      // keeps the PUBLIC arity at the port's 1. Structural assignability permits exactly this.
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

      // ★ AND THE ARITY IS 1, NOT 3, WHICH IS THE WHOLE POINT OF THE DEFAULTS. This assertion
      // once read `toHaveLength(3)` against a dedicated `saveSkuForProduct` member whose three
      // parameters were all required. That member is gone; the affordances survive on `saveSku`
      // without widening what a port-shaped caller sees.
      expect(prototypeMethodOf('saveSku').arity).toBe(1);
    });

    it('is reachable through the PORT type, and the extra arguments are NOT', async () => {
      // A service holding only `SkuRepository` must be able to persist a SKU, and must NOT be
      // able to hand a parent key or a transaction handle in. Both halves are asserted, the
      // second at COMPILE time.
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

    it('is NOT accompanied by any other public member, which is the seven-method contract', () => {
      // ★ THE STRUCTURAL ASSERTION THE REVIEW FINDING TURNED ON. The authority fixes this
      // class's PUBLIC SURFACE at the port's seven members, not merely its port conformance -
      // so a public member that is deliberately OFF the port is still a violation. This class
      // published nine for one revision: the port's then-eight plus `saveSkuForProduct`.
      //
      // ⚠ THIS IS ASSERTED AT THE TYPE LEVEL, AND THE RUNTIME CANNOT SUBSTITUTE FOR IT. A
      // first attempt read `Object.getOwnPropertyNames(MysqlSkuRepository.prototype)` and
      // compared it against the port's seven. That does not work and the reason is worth
      // recording: TypeScript's `private` is erased, so every private helper on this class -
      // `persistSku`, `reconcileSkuOptions`, `hydrateSkus`, `buildSku`,
      // `resolveNextOptionGroupSortOrder`, `insertSku`, `updateSku`, `toSkuColumnValues`,
      // `rehydrateSavedSku` - sits on the prototype at run time and is indistinguishable from a
      // public one. A prototype sweep therefore cannot express "public surface" at all; it
      // either reports nine false positives or has to name them, at which point promoting a
      // private helper to public would pass silently.
      //
      // `keyof` IS the public surface: TypeScript excludes `private` and `protected` members
      // from it. So `Exclude<keyof MysqlSkuRepository, keyof SkuRepository>` collapses to
      // `never` exactly when the class publishes nothing beyond the port's seven, and
      // `AssertNever` fails its own constraint the moment it does not. THIS IS PRECISELY THE
      // CHECK THAT WOULD HAVE CAUGHT `saveSkuForProduct`, and the build is the assertion.
      type ExtraPublicMembers = Exclude<keyof MysqlSkuRepository, keyof SkuRepository>;

      type AssertNever<T extends never> = T;
      type NoExtraPublicMembers = AssertNever<ExtraPublicMembers>;

      const extraPublicMembers: NoExtraPublicMembers[] = [];

      expect(extraPublicMembers).toStrictEqual([]);

      // And the port itself is exactly seven, enumerated exhaustively so that a member added
      // to the port - which would widen the `Exclude` above and hide behind it - still has to
      // be named here.
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

      // The two removed names, pinned by name at run time as well, so a reader sees which
      // members this case exists to keep out.
      const repository: MysqlSkuRepository = new MysqlSkuRepository(
        new RecordingExecutor([]),
        TEST_AUDIT_ACTOR,
      );

      expect('saveSkus' in repository).toBe(false);
      expect('saveSkuForProduct' in repository).toBe(false);
    });
  });

  // =========================================================================
  // C-9 — cross-cutting properties that hold for every method above
  //
  // These are the invariants that are not about any one statement. They are asserted once, over a sweep
  // that exercises several methods, rather than repeated in every block.
  // =========================================================================

  // -------------------------------------------------------------------------
  // C-8a  A RESERVED JAVASCRIPT IDENTIFIER IS AN ORDINARY Sw* PRIMARY KEY
  //
  // Both parent-keyed maps in this adapter are keyed by a value READ OUT OF THE
  // RESULT SET, never by a value this file generates: `groupRowsByParentIdentifier`
  // keys child rows by their parent identifier, and `hydrateSkus` keys one built
  // entity per DISTINCT `skuID`. `SwSku.skuID` is a `varchar(32)` column
  // [model/entity/Sku.cfc:L52] and the port adds no constraint of its own, so
  // `__proto__` FITS and cannot be assumed away.
  //
  // A plain `map[identifier] = value` reaches `Object.prototype`'s legacy
  // `__proto__` SETTER instead of creating a property. The consequences are
  // asymmetric and both are asserted below: the child grouping would silently
  // drop that SKU's currency and option rows, and the built-entity map would
  // store nothing while the `structGet` guard kept reporting a miss — so the
  // second pass would raise `SkuColumnError` for a row it had in fact hydrated.
  //
  // NET-NEW. `meta/tests/unit/dao/` holds only AccountDAOTest and PaymentDAOTest.
  // -------------------------------------------------------------------------

  describe('a reserved JavaScript identifier is hydrated as an ordinary Sw* primary key', () => {
    /** The pathological identifier, used as a real `SwSku.skuID` value. */
    const PROTO_SKU_ID = '__proto__';

    it('★ hydrates a sku whose skuID is __proto__ instead of raising SkuColumnError', async () => {
      // The driving statement returns TWO rows for the same pathological identifier,
      // which is what makes the two passes disagree when the write is intercepted:
      // pass one would store nothing, pass two would look the identifier up twice and
      // fail on the first row.
      const executor = new RecordingExecutor([
        [makeSkuRow({ skuID: PROTO_SKU_ID }), makeSkuRow({ skuID: PROTO_SKU_ID })],
        NO_ROWS,
        NO_ROWS,
      ]);

      const hydrated = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getProductSkus(
        new StubbedBaseTypeProduct(PRODUCT_ID, 'merchandise'),
        true,
      );

      // Row order is preserved and repeats are included, so the SAME instance appears twice.
      expect(hydrated).toHaveLength(2);
      expect(hydrated[0]?.getSkuID()).toBe(PROTO_SKU_ID);
      expect(hydrated[1]).toBe(hydrated[0]);
    });

    it('★ groups the child currency and option rows onto a __proto__ parent identifier', async () => {
      // `groupRowsByParentIdentifier` is reached twice per hydration — once with
      // `skuID` for `SwSkuCurrency` and once with `link_skuID` for `SwSkuOption` — so
      // one call exercises both keyings of the same helper.
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

      // Both associations arrived. With the write intercepted, both buckets would be
      // absent and both of these would be zero — a SKU that silently lost its
      // per-currency price overrides, which is exactly the failure mode
      // `getPriceByCurrencyCode` must never suffer.
      expect(sku.getSkuCurrencies()).toHaveLength(1);
      expect(sku.getSkuCurrencies()[0]?.getSkuCurrencyID()).toBe(SKU_CURRENCY_ID);
      expect(sku.getOptions()).toHaveLength(1);
      expect(sku.getOptions()[0]?.getOptionID()).toBe(OPTION_A);
    });

    it('keeps a __proto__ sku and an ordinary sku in the same result set independent', async () => {
      // The mixed case: the pathological identifier must not consume, shadow or
      // reorder its well-behaved neighbour's rows.
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
      // contamination — and it must still be empty.
      const bystander: Record<string, unknown> = {};

      expect(Object.keys(bystander)).toHaveLength(0);
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'skuID')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'activeFlag')).toBe(false);
    });
  });

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

      const skus = await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).searchSkusByProductType(
        'TEST',
      );

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
      //
      // S-07 raised this from one to two, and the second argument is the point rather than an
      // exception to it: the audit actor is the ONE thing `HibachiEntity` did reach ambient scope for
      // [org/Hibachi/HibachiEntity.cfc:L628, L676], and it now arrives as an explicit argument. That
      // is transformation rule T6 applied to the last place the ambient scope still had a job.
      expect(MysqlSkuRepository.length).toBe(2);

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
      // `saveSku`'s two adapter-only arguments are DEFAULTED, so its visible arity is the port's 1.
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

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).saveSku(makeSkuFixture());

      // Index 0 is the row statement; the two membership statements bind no temporal value, and
      // the loop at the foot of this case still sweeps every bound parameter of the row write.
      const mutation = statementAt(executor.mutationCalls, 0);

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

// ===========================================================================
// THE CURRENCY-CASCADE HYDRATION BOUNDARY (NET-NEW: no legacy antecedent)
//
// ★★ WHY THIS BLOCK IS HERE AT ALL. Every test above constructs this repository
// with an executor alone, which leaves the hydration collaborators absent and the
// returned SKUs in the legacy's closed-gate state — correct, and completely silent
// about the one obligation this adapter carries that no SQL assertion can reach:
//
//   the per-currency price map is materialised HERE, during hydration, which is
//   the entire reason `Sku.getPriceByCurrencyCode()` and its two siblings stay
//   SYNCHRONOUS [model/entity/Sku.cfc:L269-L285] after the loss of Hibernate's
//   lazy loading.
//
// Two properties of that materialisation are asserted below, and neither is
// observable from prices alone — a correct answer arrived at the wrong way looks
// identical:
//
//   1. THE INVARIANT HALF RESOLVES ONCE PER READ, NOT ONCE PER ROW. The two
//      settings reads [L373, L385/L418] and the eligible-currency listing
//      [L371 fused with L375] do not vary from one SKU to the next, so they are
//      resolved once for the whole result set and injected. This is an
//      EXPLICITNESS property: it makes the consultation count a fixed, stated
//      fact instead of something a reader infers from a loop. It is deliberately
//      NOT framed as a performance property.
//   2. NO CALLER HAS TO ASK. A SKU that leaves any read method is already
//      hydrated, so `getCurrencyDetails()` answering `{}` can only mean what it
//      means in the legacy — a shut [L373] gate — and never "nobody remembered".
//
// The Step-3 conversions are the deliberate exception and are asserted as such:
// each one converts THAT SKU's own column [L418, L422, L425], so they are
// intrinsically per-SKU and no batching can or should remove them.
// ===========================================================================

/** What a settings/currency double records, so a test can count consultations. */
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
 * The parameter is typed `string` rather than the port's narrower key union so no
 * port module has to be imported: a function accepting `string` satisfies one
 * declared to accept a subset of it.
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
 * CFML parity [model/entity/Sku.cfc:L371, L375]: the legacy builds a currency smart list and narrows
 * it with `addInFilter`. The shipped entity fuses those into one
 * `getCurrenciesByCurrencyCodeList` call, so THAT is what `listings` counts.
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

/** `count` distinct SKU rows, each complete enough for the row->entity factory. */
function manySkuRows(count: number): readonly SqlRow[] {
  return Object.freeze(
    Array.from({ length: count }, (_unused, index) =>
      makeSkuRow({ skuID: `${SKU_ID}-${String(index)}`, skuCode: `${SKU_CODE}-${String(index)}` }),
    ),
  );
}

describe('MysqlSkuRepository currency-cascade hydration (NET-NEW: no legacy antecedent)', () => {
  it('★★ resolves the INVARIANT cascade inputs ONCE PER READ, whatever the row count', async () => {
    // ★ THE ASSERTION THAT WOULD CATCH A PER-ROW RESOLUTION. One row and fifty
    // rows resolve the SAME fixed three consultations, so the count is a property
    // of the read and not of the result set. A per-row resolution would still
    // produce correct prices — which is precisely why counting is the only way to
    // observe the difference.
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

      // …and the per-SKU half scales, because it must: Step 3 converts each SKU's
      // own renewal price [L418], list price [L422] and price [L425] into the one
      // non-base eligible currency.
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
      // Read SYNCHRONOUSLY, with nothing awaited at the call site. This is the
      // synchronous accessor contract at [model/entity/Sku.cfc:L269-L285], intact.
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
    // The gate is evaluated ONCE for the read, so a shut gate short-circuits the
    // listing for the whole result set rather than once per row. `{}` here is the
    // legacy's own closed-gate state, not a degraded target-only mode.
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
    // The legacy save hands back THE SAME OBJECT, so its `variables.currencyDetails`
    // memo survives trivially. This adapter rebuilds the entity from the persisted
    // draft, so the map has to be carried across explicitly or a saved sku would
    // answer `{}` for prices it demonstrably had a moment earlier. Carrying it runs
    // no collaborator, which is what lets the rehydration stay synchronous.
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

    // A DIFFERENT instance…
    expect(saved).not.toBe(read);

    // …carrying the same map, by value.
    expect(saved.getCurrencyDetails()).toStrictEqual(read.getCurrencyDetails());
    expect(saved.getPriceByCurrencyCode(CASCADE_SECONDARY_CURRENCY)?.toFixed2()).toBe('19.99');

    // …and nothing was recomputed to achieve it.
    expect(log.listings.length + log.conversions.length).toBe(consultationsAfterRead);
  });

  it('★ collaborators absent — hydration runs nothing and the skus answer {} rather than failing', async () => {
    // This is the state every SQL-shape test above sits in, asserted once
    // explicitly so it reads as a decision rather than an accident. Absent
    // collaborators are a legitimate construction: `getCurrencyDetails()` answers
    // `{}`, which is the same observable state a shut [L373] gate produces.
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

// =============================================================================
// READ TOTALITY - THE THREE RESOURCE CEILINGS, INVERTED
//
// A security review raised finding S-08, MEDIUM, CWE-400: unbounded selected-option `EXISTS` chains
// and wildcard-broadened unpaginated searches can exhaust database or container resources. Values
// are bound on every path, so this was denial of service rather than injection - nothing here is
// about statement text, and no case below asserts a change to any.
//
// ★★ AN EARLIER REVISION ANSWERED IT WITH THREE REFUSAL CEILINGS IN THIS ADAPTER, AND THIS BLOCK
// USED TO PIN THEM. A later review found the ceilings themselves to be the defect:
// [model/dao/SkuDAO.cfc:L102-L145] validates nothing and refuses nothing on magnitude, so every
// input these ceilings rejected was one the legacy ANSWERED - with rows, or with an empty array.
// A read that raises where the legacy returned is a behavioural divergence, and this port is allowed
// exactly three of those (AAP 0.6.7), none of which is a resource ceiling. One of the three affected
// paths, `getProductSkusBySelectedOptions`, is a must-preserve behaviour outright.
//
// SO EVERY CASE THAT ASSERTED A REFUSAL IS NOW ITS INVERSE. The same inputs - a 65-element option
// list, a 51-character search term, a 2,001-row result set - are asserted to be ANSWERED, and the
// at-the-limit cases are kept unchanged so that the previously-inclusive boundary is still covered
// on the admissible side. If a ceiling is ever reinstated, one of these cases fails and names it.
//
// AND THE RESOURCE CONCERN IS STILL ANSWERED, one layer down: the association follow-up statements
// batch their identifier lists, so a large answer costs a bounded number of bounded statements
// instead of one statement the driver could not carry. The final case pins that batching directly.
// =============================================================================

describe('the read path is total on magnitude, refusing nothing the legacy answered', () => {
  /** A well-formed 32-character option identifier, distinct per index. */
  function optionIDAt(index: number): string {
    return index.toString(16).padStart(32, '0');
  }

  /** A comma-delimited list of `count` distinct well-formed option identifiers. */
  function optionListOf(count: number): string {
    return Array.from({ length: count }, (_unused, index) => optionIDAt(index)).join(',');
  }

  describe('the selected-option count', () => {
    it('executes a 64-element list, which was the old ceiling', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(
        optionListOf(64),
      );

      // 64 option groups is already absurd - a product carrying them would hold at least 2^64 SKUs.
      // The statement is built and issued regardless, with one placeholder and one bind per element.
      const statement = onlyStatement(executor.calls);

      expect(statement.params).toHaveLength(64);
    });

    it('★★ executes a list ABOVE the old ceiling instead of refusing it', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      const found = await new MysqlSkuRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).getSkusBySelectedOptions(optionListOf(65));

      // THE INVERTED CASE. This used to reject with `selectedOptionCount is 65 and at most 64` and
      // to issue no statement at all. [model/dao/SkuDAO.cfc:L107-L128] counts nothing and refuses
      // nothing, so the statement is built, issued with 65 binds, and answers the empty array that
      // no such SKU produces - which is exactly what the legacy answered.
      const statement = onlyStatement(executor.calls);

      expect(statement.params).toHaveLength(65);
      expect(found).toStrictEqual([]);
    });

    it('counts with CFML list semantics, so a doubled delimiter is not an element', async () => {
      // `listToArray` drops empty elements, and the builder parses with the same helper - so the
      // ceiling and the predicate count can never disagree. 64 identifiers separated by DOUBLED
      // delimiters is still 64 elements and is still admissible.
      const executor = new RecordingExecutor([NO_ROWS]);
      const doubled = Array.from({ length: 64 }, (_unused, index) => optionIDAt(index)).join(',,');

      await new MysqlSkuRepository(executor, TEST_AUDIT_ACTOR).getSkusBySelectedOptions(doubled);

      expect(onlyStatement(executor.calls).params).toHaveLength(64);
    });

    // SYNCHRONOUS ON PURPOSE, and the absence of `async` is part of the assertion. The builder is
    // a pure function that touches no executor, so awaiting it would be awaiting a non-thenable -
    // which this suite treats as a lint failure rather than a passing test.
    it('leaves the builder itself total, which is its own contract', () => {
      // `buildSkusBySelectedOptionsStatement` emits for a 65-element list, and its own suite pins
      // that. The case is kept because it proves the two tiers agree: neither the builder nor the
      // adapter above it counts elements, so a guard added to either would fail a case that names it.
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

      // `skuCode` is `length="50"` [model/entity/Sku.cfc:L54], so a 50-character term is the longest
      // one that could still be an entire code.
      expect(onlyStatement(executor.calls).params).toStrictEqual([`%${'a'.repeat(50)}%`]);
    });

    it('★★ searches with a term ABOVE the column width instead of refusing it', async () => {
      const executor = new RecordingExecutor([NO_ROWS]);

      const found = await new MysqlSkuRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).searchSkusByProductType('a'.repeat(51));

      // THE INVERTED CASE. This used to reject with `searchTermLength is 51 and at most 50` and to
      // issue no statement. [model/dao/SkuDAO.cfc:L132-L133] binds `%#arguments.term#%`
      // unconditionally, so the search runs and answers no matches - which is what a term longer
      // than the column can hold has always meant.
      expect(onlyStatement(executor.calls).params).toStrictEqual([`%${'a'.repeat(51)}%`]);
      expect(found).toStrictEqual([]);
    });

    it('leaves a LIKE metacharacter live inside the term, exactly as the legacy did', async () => {
      // The finding suggests escaping LIKE wildcards where literal matching is intended. It is NOT
      // intended here: [model/dao/SkuDAO.cfc:L133] binds `%#arguments.term#%` with the
      // metacharacters active, so `%` legitimately matches every code and escaping it would change
      // which rows a CORRECT search returns. Nothing bounds the term now, and nothing rewrites it.
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

      // THE INVERTED CASE. This used to reject with `searchResultHydration is 2001 and at most 2000`
      // after issuing only the search itself. Every matched row is now hydrated, because the legacy
      // answered every match [model/dao/SkuDAO.cfc:L131, L141-L145] and a search that raises on
      // magnitude is not the same interface as one that returns.
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

      // WHAT REPLACED THE CEILING. The two follow-up statements each bind one placeholder per matched
      // SKU, and `sqlPlaceholderList` refuses a count above the driver's protocol limit - so an
      // uncapped search would have failed one layer down had the lists not been chunked. 2,001
      // identifiers become three batches per statement: the search, then 3 currency reads, then 3
      // option reads.
      expect(executor.calls).toHaveLength(7);

      // The search itself binds one term; every association batch binds at most the tuple row limit.
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

      // THE EMITTED SQL IS UNCHANGED FOR EVERY REALISTIC RESULT SET, which is what makes the
      // batching invisible to every parity assertion in this file: the search, one currency read and
      // one option read, exactly as before.
      expect(executor.calls).toHaveLength(3);
    });
  });
});
