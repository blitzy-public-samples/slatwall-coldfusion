/**
 * `MySqlProductTypeRepository` — the ported `model/dao/ProductTypeDAO.cfc`.
 *
 * =================================================================================================
 * PROVENANCE: EVERY CASE IN THIS FILE IS **NET-NEW**
 * =================================================================================================
 * There is no legacy `ProductTypeDAOTest`. AAP §0.6.5.2 verified the absence for the whole
 * data-access layer — "**No** `SkuDAOTest` or `OptionDAOTest` exists" — and a repository-wide search
 * for a product-type DAO test returns nothing either. So not one assertion below extends a legacy
 * assertion, and none is labelled as though it did (AAP §0.8.3.7). Every `describe` and every `it`
 * title carries the **NET-NEW** label verbatim, so the honest ratio is auditable straight from the
 * run log rather than from this header.
 *
 * `meta/tests/unit/dao/AccountDAOTest.cfc` is the SHAPE reference AAP §0.4.1.12 names for this file,
 * and it is reference-only in the strictest sense: nothing of its content is carried across. Its
 * `setUp()` resolves a collaborator by string out of an ambient request scope and its single case
 * asserts only that the resolved thing is an object. Neither idiom appears here — no service
 * locator, no ambient scope, no bootstrap, and no "it constructed" case. This suite instead
 * constructs the adapter directly and hands it a typed test double, which is the structural
 * difference AAP §0.4.3.6 predicts between the two suites: legacy DAO tests are integration tests
 * that boot the whole framework, and these are unit tests. A reviewer comparing the two should
 * expect that difference by design and not read it as a gap.
 *
 * =================================================================================================
 * TRACEABILITY HERE IS DOCUMENTARY, NOT RUNTIME PARITY
 * =================================================================================================
 * Every legacy claim below was established by READING the legacy source and citing it by
 * `path:Lnnn` locator. None was established by executing the legacy code, and the reason is a
 * property of this environment rather than a choice:
 *
 *   - MXUnit and CFSelenium are NOT VENDORED in this repository, and MXUnit additionally requires an
 *     external CFIDE mapping that does not exist here, so the legacy suite cannot be run at all.
 *   - `meta/docker/slatwall-local-dev/` — the local Lucee/Railo-plus-MySQL setup cited as optional
 *     context — DOES NOT EXIST. `meta/` contains only `meta/tests/` and `meta/eclipse/`; there is no
 *     Dockerfile and no Compose file anywhere in the tree.
 *   - Consequently THE LEGACY CFML RUNTIME IS NOT REPRODUCIBLE HERE, and **NO RUNTIME BEHAVIOURAL
 *     COMPARISON WAS PERFORMED**. Nothing in this file was checked against a running CFML
 *     implementation, and no case below should be read as implying that it was.
 *
 * That is a statement about the strength of the evidence, not an obstacle to the work: the
 * statement text, the binding discipline, the projection types and the ordering are all assertable
 * as values, and none of them needs a connection or a CFML engine.
 *
 * =================================================================================================
 * WHAT THIS FILE COVERS
 * =================================================================================================
 * THE ADAPTER'S WHOLE PUBLIC SURFACE — the one ported read member and the three additive members,
 * not the read member alone.
 *
 * THE PORTED READ, `findAllForTree()`, is the subject of the first six suites and carries the legacy
 * behaviour: the translated statement's shape, its physical table names (the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132]), its two correlated
 * scalar subselects, its two derived aliases, its single flat ordering, its empty bound-value list,
 * the numeric-not-boolean nature of both counts, and the two legacy comments that misdescribe what
 * the member returns.
 *
 * THE THREE MEMBERS WITH NO LEGACY COUNTERPART are the subject of the suites at the foot of this
 * file. Each is labelled **NET-NEW** for a second and stronger reason than the rest of the file —
 * not merely "no legacy test exists" but "no legacy MEMBER exists" — and each is covered because it
 * is LIVE public code, and an uncovered live member can be deleted or inverted with every other case
 * here still passing:
 *   - `withExecutor(executor)` — re-binding to a transaction-scoped executor. It exists only because
 *     mismatch M5 removed the ambient ORM session a legacy DAO simply participated in, so there is
 *     nothing in `model/dao/ProductTypeDAO.cfc` for it to be a port OF. Its cases pin that it answers
 *     a NEW instance and that the receiver it was called on is left untouched.
 *   - `saveProductType(productType)` — the insert-or-update write. `model/dao/ProductTypeDAO.cfc`
 *     declares no write at all; persistence reached the database through the framework's flush, which
 *     M5 also removed. Its cases pin the identifier discipline (IR-6), the ORDER of the entity
 *     lifecycle hook against value collection, the audit actor's provenance, and the exact column
 *     list, placeholder count and bind order of both branches.
 *   - `removeProductType(productType)` — the removal. Its cases pin that a transient entity is
 *     refused before any statement is composed, and that a persisted one emits exactly one `DELETE`.
 *
 * ⛔ WHAT IT DELIBERATELY DOES NOT COVER, so each absence reads as a decision:
 *   - Any single-product-type read, factory member, paginated-list member, counting, listing or
 *     exporting member. Those resolved through the framework's missing-method dispatch (IR-1,
 *     `org/Hibachi/HibachiService.cfc:L255-L281`) and AAP §0.4.2.5 declares the single read on
 *     `ProductService`, not on this repository.
 *   - Any attribute-assignment behaviour, including defect D21 at
 *     `model/entity/ProductType.cfc:L92-L98`. It is boundary-stubbed in the domain layer and reaches
 *     an excluded domain family, so nothing here touches it and no excluded collaborator is
 *     imported.
 *   - The parameterisation-hardening exception D18. It belongs exclusively to the product importer's
 *     adapter, whose legacy statements interpolate values taken from an uploaded file. NO STATEMENT
 *     THIS ADAPTER CAN EMIT HAS AN INTERPOLATED VALUE SITE AT ALL, and with the write members now
 *     covered that is a verified property of the whole surface rather than a consequence of the read
 *     taking no argument: the read binds an empty list, and each of the three write statements binds
 *     EVERY caller-supplied value through a `?` placeholder while composing its identifiers from the
 *     schema whitelist. The cases at the foot of this file assert exactly that, including one that
 *     drives a quote-bearing value through the insert and finds it in the bound array rather than in
 *     the statement text. Stated positively so the absence reads as a verified property, and no
 *     hardening exception is claimed here.
 *
 * REGISTER DISCIPLINE. This file MINTS NO new defect or mismatch identifier. It cites the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] (the
 * logical-names-in-native-SQL finding, defined in `src/ports/repositories/SkuRepository.ts`, which
 * is the one place that records the plan's register bounds) and M7 (the warm-container caching
 * mismatch). Every other finding is recorded by `path:Lnnn` locator alone, which is the only kind of
 * claim one file can verify. No legacy `throw` message text is reproduced anywhere below; where a
 * message is relevant it is referred to by locator only.
 *
 * NO USER-SPECIFIED REPOSITORY RULES WERE PROVIDED for this project — `review_rules` reports none —
 * so nothing here enters by rule. The bar applied instead is the project's own: strict TypeScript,
 * the shared Jest configuration, the type-aware ESLint preset and the Prettier baseline, with no
 * substitute rules invented.
 */

import {
  MySqlProductTypeRepository,
  PRODUCT_TYPE_TREE_BOUND_VALUES,
  PRODUCT_TYPE_TREE_STATEMENT,
} from '../../src/adapters/mysql/MySqlProductTypeRepository';
import { assertColumnName, assertTableName } from '../../src/adapters/mysql/QueryRunner';
import { ProductType } from '../../src/domain/product/ProductType';
import {
  ALL_SEEDED_PRODUCT_TYPES,
  CONTENT_ACCESS_PRODUCT_TYPE,
  CONTENT_ACCESS_PRODUCT_TYPE_ID,
  MERCHANDISE_PRODUCT_TYPE,
  MERCHANDISE_PRODUCT_TYPE_ID,
  SUBSCRIPTION_PRODUCT_TYPE,
  SUBSCRIPTION_PRODUCT_TYPE_ID,
} from '../fixtures/productTypes';
import {
  TEST_ADMIN_ACCOUNT_ID,
  createAbsentAccountContextDouble,
  createAccountContextDouble,
  createSqlExecutorDouble,
  persistedNonAdminAccount,
  sqlAffectedRows,
  sqlRows,
} from '../support/inMemoryRepositories';

import type { ProductTypeStatementExecutor } from '../../src/adapters/mysql/MySqlProductTypeRepository';
import type { AccountContextPort } from '../../src/ports/AccountContextPort';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../src/ports/repositories/ProductTypeRepository';
import type { SqlExecutorCall } from '../support/inMemoryRepositories';
import {
  attachSkuOptions,
  createCatalogAggregateLoaders,
} from '../../src/adapters/mysql/QueryRunner';
import type { ExactDecimal } from '../../src/util/formatting';
import { toExactDecimal } from '../../src/util/formatting';
import { SmartListQueryBuilder } from '../../src/adapters/mysql/SmartListQueryBuilder';
import type { CatalogAggregateDependencies } from '../../src/adapters/mysql/QueryRunner';
import { readProductDefaultSkuId } from '../../src/adapters/mysql/rowMappers';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
import type { Option } from '../../src/domain/option/Option';
import type { Product, ProductDefaultSkuDelegate } from '../../src/domain/product/Product';
import type { Sku } from '../../src/domain/sku/Sku';
import type { SmartListRecord } from '../../src/ports/SmartListQueryPort';
import { buildSku } from '../support/inMemoryRepositories';
import { OptionService } from '../../src/services/OptionService';

/* =================================================================================================
 * THE PHYSICAL TABLE NAMES, TAKEN FROM THE PRODUCTION WHITELIST RATHER THAN RETYPED
 * ===============================================================================================*/

/**
 * The physical product-type table, resolved through the same schema whitelist the adapter uses.
 *
 * Routing the expectation through `assertTableName` rather than writing the string a second time is
 * deliberate: if the whitelist ever stopped recognising this table the expectation would fail loudly
 * at module load instead of quietly comparing one hard-coded literal against another. It also means
 * this file asserts the name the production code is capable of emitting, not a name a test author
 * believed it emitted.
 */
const PRODUCT_TYPE_TABLE = assertTableName('SwProductType');

/** The physical product table, resolved the same way. */
const PRODUCT_TABLE = assertTableName('SwProduct');

/**
 * The statement with runs of whitespace collapsed, so a fragment spanning the adapter's line breaks
 * can be asserted without pinning its indentation.
 *
 * ⚠️ THIS IS APPLIED TO THE EXPORTED CONSTANT AND NEVER TO RECORDED DATA. The recording double
 * preserves the issued SQL byte for byte and the bound values in bind order, and every assertion
 * against a recorded call below reads it exactly as recorded — untrimmed, uncollapsed, unfolded and
 * unreordered. Collapsing here only avoids over-fitting to indentation the adapter composes from
 * whitelist-validated identifiers, which is a different thing from rewriting evidence.
 */
const TREE_STATEMENT_COLLAPSED = PRODUCT_TYPE_TREE_STATEMENT.replace(/\s+/g, ' ');

/**
 * One raw driver row, as the executor seam hands it back before hydration.
 *
 * Declared locally because the production alias for it lives in `src/adapters/mysql/rowMappers.ts`,
 * which is outside this file's dependency whitelist — the same reason `test/support/` declares its
 * own copy of the entity error surface. The two are structurally identical, so a canned row built
 * here is accepted by the row-outcome helper without a cast; there is deliberately no cast anywhere
 * in this file.
 *
 * ⚠️ THIS IS NOT A PARALLEL PROJECTION TYPE. It models the UNTYPED input side — what MySQL returns —
 * and the OUTPUT projection is `ProductTypeTreeRow`, imported from the port and never redeclared.
 */
type CannedRow = Record<string, unknown>;

/**
 * A TEST-ONLY child product-type identifier.
 *
 * ⚠️ NOT SEED DATA, NOT A FIXTURE, AND DELIBERATELY NOT ADDED TO `test/fixtures/productTypes.ts`.
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` seeds exactly three product types and all
 * three are ROOTS, so the seed establishes no parent/child relationship whatsoever. The one case
 * below that needs a deeper relationship constructs it explicitly from this identifier, and the
 * name says so, precisely so that nothing here can be mistaken for a hierarchy the seed contains.
 *
 * Its shape follows IR-6 — 32 lowercase hexadecimal characters with no dashes — because that is the
 * identifier shape the platform uses and a differently shaped value would be testing a case the
 * schema cannot hold. Its VALUE is a uniform run that no generator would ever produce, and it shares
 * no prefix with the three seeded identifiers, so it can never be confused for one of them.
 *
 * It is also emphatically not one of the seven developer scratch identifiers in the XML comment
 * block at `config/dbdata/SlatwallProductType.xml.cfm:L23-L29`. Those are excluded from this subtree
 * entirely — not as constants, not as a reserved list and not reproduced in any comment — because
 * none of them is a `<Record>`, none has a consumer, and the block's own introduction tells the
 * reader to delete them.
 */
const TEST_ONLY_CHILD_PRODUCT_TYPE_ID = 'cccccccccccccccccccccccccccccccc';

/* =================================================================================================
 * HARNESS AND HELPERS — no mocking library, no `jest.mock`, no local re-implementation of a double
 * ===============================================================================================*/

/** The adapter under test, plus the observation state its injected seam records. */
interface TreeReadHarness {
  /**
   * Typed as the PORT rather than as the concrete adapter, so every case below is confined to the
   * declared contract and cannot reach an implementation detail even by accident.
   */
  readonly repository: ProductTypeRepository;
  /** Every statement the adapter issued, byte for byte and in issue order. Live view. */
  readonly calls: readonly SqlExecutorCall[];
  /** How many times the adapter resolved an acting account. A read should resolve none. */
  readonly accountReads: () => number;
}

/**
 * Build the adapter over the shared recording executor double.
 *
 * Constructor injection, deliberately: the adapter takes the narrow statement contract and never
 * builds a pool, so no `mysql2` import, no connection, no credential and no container appears
 * anywhere in this file (AAP §0.7.3 S3). One canned row batch is queued per expected call, in call
 * order; an unqueued call answers an empty row list, which is the double's own documented default.
 *
 * @param responses - One row batch per anticipated `findAllForTree()` call.
 */
function createTreeReadHarness(...responses: readonly (readonly CannedRow[])[]): TreeReadHarness {
  const executorDouble = createSqlExecutorDouble({
    outcomes: responses.map((rows) => sqlRows(rows)),
  });
  const accountContextDouble = createAccountContextDouble();

  return {
    repository: new MySqlProductTypeRepository(
      executorDouble.executor,
      accountContextDouble.accountContext,
    ),
    calls: executorDouble.calls,
    accountReads: accountContextDouble.callCount,
  };
}

/**
 * Return the single element of a list, or fail with a message naming what was expected.
 *
 * The alternative would be a non-null assertion on `list[0]`, and this file uses none: under
 * `noUncheckedIndexedAccess` an index read is legitimately `T | undefined`, and silencing that with
 * `!` would turn a wrong element count into a confusing downstream failure instead of a clear one.
 * `undefined` is not a member of any element type this file passes in, so the `undefined` branch can
 * only mean the list was empty.
 */
function exactlyOne<T>(items: readonly T[], what: string): T {
  const [first, ...rest] = items;
  if (first === undefined || rest.length > 0) {
    throw new Error(`expected exactly one ${what}, saw ${String(items.length)}`);
  }
  return first;
}

/**
 * Build a canned MySQL row from a seeded product-type record plus its two derived counts.
 *
 * ⚠️ THIS IS AN HONEST ROOT-LEVEL TEST SETUP, AND EVERY COLUMN COMES FROM THE SOURCE. The seven
 * column values are taken from `test/fixtures/productTypes.ts`, which transcribes them verbatim from
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` — including `productTypeIDPath` equal to the
 * row's own identifier and `activeFlag` as the literal `'1'` it renders. Nothing is invented,
 * nothing is regenerated and no representation is derived from another.
 *
 * ⭐ ONE COLUMN IS TRANSLATED RATHER THAN TRANSCRIBED, AND THIS IS THE REASON. An earlier revision
 * of this helper passed `parentProductTypeID` through as the literal four-character string `'NULL'`,
 * on the stated ground that this is what the seed document renders. That ground is true about the
 * DOCUMENT and false about the ROW, and the distinction is the whole point of this helper: a
 * `CannedRow` models WHAT THE DRIVER HANDS BACK, not what the seed file contains.
 *
 * The seed importer proves which of the two this column is. `Application.cfc:L92` calls
 * `DataService.loadDataFromXMLDirectory` (`model/service/DataService.cfc:L73`), which reaches
 * `loadDataFromXMLRaw` (`:L108`) and passes each raw XML attribute through unchanged as
 * `columnRecord.value`. That value lands in `model/dao/DataDAO.cfc`, and BOTH write paths there test
 * it against the sentinel and bind a real null instead:
 *   - `:L71-L72`   (`recordUpdate`) — `<cfif ... .value eq "NULL">` -> `<cfqueryparam ... null="yes">`
 *   - `:L104-L105` (`recordInsert`) — the identical test -> `<cfqueryparam ... null="yes">`
 *
 * So `SwProductType.parentProductTypeID` holds a GENUINE SQL NULL for all three seeded roots, and
 * the four-character string never reaches a row. `mysql2` therefore returns JS `null` here, which is
 * exactly what this helper now supplies. Feeding `'NULL'` instead would model a row the database
 * provably cannot produce, and would make every assertion built on it a statement about a fiction.
 *
 * `test/fixtures/productTypes.ts` is deliberately NOT changed: it transcribes the seed DOCUMENT, and
 * its own note at `:202-203` is accurate about that document. The document-to-row translation
 * belongs at this boundary, where a row is built, and nowhere else.
 *
 * ⛔ AND NOT IN PRODUCTION CODE EITHER. `src/adapters/mysql/rowMappers.ts` deliberately carries no
 * comparison against `'NULL'`: `readOptionalString` (`:L444-L453`) maps both `null` and `undefined`
 * to `undefined`, which is the correct and complete handling for a column the importer nulls out.
 * Adding a string comparison there would invent behaviour the source does not have (AAP §0.7.3 S9)
 * and would be unreachable against any real driver. The one place the legacy genuinely does compare
 * against the literal is `org/Hibachi/HibachiSmartList.cfc:L580`/`:L593`, ported at
 * `src/adapters/mysql/SmartListQueryBuilder.ts:1287` — but that is a caller-supplied FILTER TOKEN
 * meaning `IS NULL`, an API input, never a stored column value.
 *
 * The two counts are supplied per case because they are QUERY-COMPUTED and have no column in the
 * seed document at all: they are what the two correlated subselects at
 * `model/dao/ProductTypeDAO.cfc:L55-L60` return for the row, so a test states them rather than
 * reading them from anywhere.
 */
function seededTreeRow(
  seeded: (typeof ALL_SEEDED_PRODUCT_TYPES)[number],
  counts: { readonly isAssigned: number; readonly childCount: number },
): CannedRow {
  return {
    productTypeID: seeded.productTypeID,
    productTypeIDPath: seeded.productTypeIDPath,
    // The document renders `"NULL"`; `model/dao/DataDAO.cfc:L104-L105` binds it as a real null, so
    // the driver hands back `null`. Translated, not transcribed — see this function's note above.
    parentProductTypeID: seeded.parentProductTypeID === 'NULL' ? null : seeded.parentProductTypeID,
    productTypeName: seeded.productTypeName,
    systemCode: seeded.systemCode,
    urlTitle: seeded.urlTitle,
    activeFlag: seeded.activeFlag,
    isAssigned: counts.isAssigned,
    childCount: counts.childCount,
  };
}

/* =================================================================================================
 * 1. THE TRANSLATED STATEMENT
 * ===============================================================================================*/

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — the translated statement', () => {
  /*
   * ZERO-CALLER NOTE, RECORDED WHERE A READER WILL LOOK FOR IT.
   * `model/service/ProductService.cfc:L54` declares `property name="productTypeDAO" type="any";` and
   * NOTHING IN THE SLICE EVER READS IT — AAP §0.6.3.1 classifies it as one of the four dead
   * injections, with zero call sites, and the composition root deliberately does not wire it.
   * Searching the legacy tree for the DAO member's own name likewise returns exactly one line, its
   * declaration at `model/dao/ProductTypeDAO.cfc:L52`.
   *
   * The adapter is implemented and tested anyway, because TR-5 is unambiguous — "The member is never
   * quietly dropped from the interface" — and `src/ports/repositories/ProductTypeRepository.ts`
   * explicitly declares `findAllForTree()`. So this suite exercises the PORT MEMBER directly and
   * does NOT wire a fake service caller to make the member look used: fabricating a call path the
   * legacy does not have would misrepresent the very fact this note records.
   */

  it('NET-NEW: names only the physical Sw* tables, never the logical ORM entity names', async () => {
    const harness = createTreeReadHarness([]);

    await harness.repository.findAllForTree();

    const call = exactlyOne(harness.calls, 'recorded statement');

    /*
     * TODO(parity) the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] `model/dao/ProductTypeDAO.cfc:L54-L62` — THE LEGACY STATEMENT NAMES ITS TABLES
     * WITH LOGICAL ORM ENTITY NAMES, INSIDE NATIVE SQL, AND THE TARGET DELIBERATELY EMITS THE
     * PHYSICAL ONES INSTEAD.
     *
     * Every table position in the legacy text — `:L55`, `:L56`, `:L57`, `:L59`, `:L60` and `:L61` —
     * spells a LOGICAL entity name, while the statement around it is native SQL rather than HQL: a
     * query object is created at `:L53` and executed at `:L64` with no mapping layer in between to
     * translate a logical name. In release 3.1.39 the physical tables are `SwProductType` and
     * `SwProduct`, declared at `model/entity/ProductType.cfc:L49`
     * (`entityname="SlatwallProductType" table="SwProductType"`) and `model/entity/Product.cfc:L49`
     * (`entityname="SlatwallProduct" table="SwProduct"`), and the legacy component contains no
     * physical name anywhere. The translation is therefore fixed and mechanical, and this case pins
     * it.
     *
     * ROOT CAUSE: `org/Hibachi/HibachiDAO.cfc:L102-L106` prefixes the application key onto an entity
     * name whenever it is absent, which is why the LOGICAL form is the legitimate ORM and HQL
     * vocabulary. Native SQL spelled that way only ever worked for as long as the logical and
     * physical names coincided.
     *
     * ⚠️ PRESERVE THE DISTINCTION, DO NOT COLLAPSE IT. Logical entity names remain correct and must
     * NOT be "fixed" to `Sw*` in HQL; and a logical name is never a valid assumption in native SQL.
     * They are two vocabularies for two layers, and which one is right depends entirely on which
     * layer executes the text. Carried as a preserve-and-annotate finding; no register number is
     * minted here.
     */
    expect(call.sql).toContain(PRODUCT_TYPE_TABLE);
    /* The OUTER read is over the physical product-type table — `model/dao/ProductTypeDAO.cfc:L61`. */
    expect(TREE_STATEMENT_COLLAPSED).toContain(`FROM ${PRODUCT_TYPE_TABLE} ORDER BY`);
    /* The assigned-product subselect reads the physical product table — `:L56`. The trailing keyword
     * keeps this fragment from matching the product-type table, whose name shares the same prefix. */
    expect(TREE_STATEMENT_COLLAPSED).toContain(`FROM ${PRODUCT_TABLE} WHERE`);
    expect(call.sql).not.toContain('SlatwallProductType');
    expect(call.sql).not.toContain('SlatwallProduct');
    expect(call.sql).not.toContain('Slatwall');
  });

  it('NET-NEW: preserves both correlated scalar subselects under the exact legacy aliases', async () => {
    const harness = createTreeReadHarness([]);

    await harness.repository.findAllForTree();

    const call = exactlyOne(harness.calls, 'recorded statement');

    expect(call.sql).toBe(PRODUCT_TYPE_TREE_STATEMENT);

    /*
     * The projection is the legacy wildcard over the product-type table plus exactly two derived
     * columns — `model/dao/ProductTypeDAO.cfc:L54`. The wildcard is qualified here, which changes
     * nothing: the outer `FROM` names exactly one table, so a bare `*` and a qualified one expand to
     * the same column set, and a scalar subquery in a select list yields one aliased VALUE rather
     * than a table to expand.
     */
    expect(TREE_STATEMENT_COLLAPSED).toContain(`SELECT ${PRODUCT_TYPE_TABLE}.*,`);

    /*
     * `isAssigned` — `model/dao/ProductTypeDAO.cfc:L55-L57`. A CORRELATED SCALAR SUBSELECT counting
     * `SwProduct.productID` rows whose `productTypeID` equals the OUTER product type's identifier.
     * The correlation predicate is what makes it evaluate once per outer row.
     */
    expect(TREE_STATEMENT_COLLAPSED).toContain(`(SELECT count(${PRODUCT_TABLE}.productID)`);
    expect(TREE_STATEMENT_COLLAPSED).toContain(
      `WHERE ${PRODUCT_TABLE}.productTypeID = ${PRODUCT_TYPE_TABLE}.productTypeID) as isAssigned,`,
    );

    /*
     * `childCount` — `model/dao/ProductTypeDAO.cfc:L58-L60`. A second correlated scalar subselect,
     * counting `SwProductType` children through `spt.parentProductTypeID` against the outer row's
     * identifier. `spt` is the legacy's own self-reference alias, carried verbatim so a reviewer can
     * compare the two texts line by line. One generation only: nothing walks the hierarchy
     * transitively, so a product type with one child that itself has four reports one and not five.
     */
    expect(TREE_STATEMENT_COLLAPSED).toContain('(SELECT count(spt.productTypeID)');
    expect(TREE_STATEMENT_COLLAPSED).toContain(`FROM ${PRODUCT_TYPE_TABLE} spt`);
    expect(TREE_STATEMENT_COLLAPSED).toContain(
      `WHERE spt.parentProductTypeID = ${PRODUCT_TYPE_TABLE}.productTypeID) as childCount`,
    );

    /* Exactly two derived columns, under exactly the legacy alias spellings and no others. */
    expect(TREE_STATEMENT_COLLAPSED.split(' as ')).toHaveLength(3);
    expect(TREE_STATEMENT_COLLAPSED).toContain('as isAssigned');
    expect(TREE_STATEMENT_COLLAPSED).toContain('as childCount');
  });

  it('NET-NEW: adds no LIMIT, OFFSET, recursive CTE, join rewrite or client-side assembly', async () => {
    const harness = createTreeReadHarness([]);

    await harness.repository.findAllForTree();

    const call = exactlyOne(harness.calls, 'recorded statement');

    /*
     * Each absence below is a rewrite that would have computed a plausible answer and still been
     * wrong, because AAP §0.8.2 Guideline 4 forbids optimising or enhancing beyond what the migration
     * requires and AAP §0.4.1.7 specifies this statement "with its `isAssigned` and `childCount`
     * subselects". AAP §0.3.3.1 settled the identical question for the sibling statement in
     * `src/adapters/mysql/MySqlSkuRepository.ts`, keeping N correlated `EXISTS` clauses "rather than
     * an `IN` list or a `GROUP BY … HAVING COUNT` rewrite".
     */

    /* No row bound of any kind. The legacy has none, and adding one would silently truncate. */
    expect(call.sql).not.toMatch(/\blimit\b/i);
    expect(call.sql).not.toMatch(/\boffset\b/i);

    /* No hierarchy machinery. The legacy statement is a single flat read. */
    expect(call.sql).not.toMatch(/\brecursive\b/i);
    expect(call.sql).not.toMatch(/\bwith\b/i);

    /*
     * NO SUBSELECT-TO-JOIN REWRITE. Neither the forbidden direct-join-and-aggregate form — whose
     * two fan-outs would multiply and inflate each count by the other's cardinality — nor the
     * pre-aggregated derived-table form, which computes the same numbers and is still a change of
     * evaluation point from once-per-outer-row to once-per-statement, and therefore a performance
     * change this port has no licence to make.
     */
    expect(call.sql).not.toMatch(/\bjoin\b/i);
    expect(call.sql).not.toMatch(/\bgroup\s+by\b/i);
    expect(call.sql).not.toMatch(/\bhaving\b/i);
    expect(call.sql).not.toMatch(/\bcoalesce\b/i);
    expect(call.sql).not.toMatch(/\bunion\b/i);

    /* No ordering on the materialised ancestry path — see the flat-ordering case in section 3. */
    expect(call.sql).not.toContain('productTypeIDPath');
  });

  it('NET-NEW: binds nothing, records exactly an empty parameter array, and never mutates it', async () => {
    const harness = createTreeReadHarness([]);

    /*
     * The member takes NO argument — `model/dao/ProductTypeDAO.cfc:L52` declares none — so there is
     * no caller value to bind and no filter, sort key, page size or maximum-results parameter is
     * offered. Calling it with none is the whole contract, and the compiler enforces it: the port
     * declares `findAllForTree(): Promise<ProductTypeTreeRow[]>`.
     */
    await harness.repository.findAllForTree();

    const call = exactlyOne(harness.calls, 'recorded statement');

    /*
     * The recorded values are read EXACTLY AS RECORDED: not trimmed, not coerced, not reordered and
     * not copied through any normaliser. An empty array is the whole expectation.
     */
    expect(call.params).toEqual([]);
    expect(call.params).toHaveLength(0);

    /*
     * The bound list is still PASSED rather than omitted, and the exported constant is what was
     * passed. Binding nothing is not a reason to leave the prepared-execution path: prepared
     * execution with an empty bound list is exactly as correct as with a full one, and the security
     * property of the adapter layer comes from there being a SINGLE execution path rather than from
     * care taken at each call site (AAP §0.7.3 S2, TR-4).
     */
    expect(PRODUCT_TYPE_TREE_BOUND_VALUES).toEqual([]);
    expect(Object.isFrozen(PRODUCT_TYPE_TREE_BOUND_VALUES)).toBe(true);

    /* No value placeholder anywhere, because there is no value to bind. */
    expect(call.sql).not.toContain('?');

    /* And no interpolated literal standing in for one: the statement quotes nothing. */
    expect(call.sql).not.toContain("'");
    expect(call.sql).not.toContain('"');
  });

  it('NET-NEW: reaches the injected execute seam and issues no writing statement', async () => {
    /*
     * SERVER-SIDE EXECUTE SEMANTICS, PROVED STRUCTURALLY RATHER THAN ASSERTED. This seam is a plain
     * object literal declaring exactly the two members the adapter's contract requires. There is no
     * client-side text-substitution member on it AT ALL, so the adapter demonstrably cannot be
     * reaching one — the proof is the absence of the member, not a spy on it. The mutation member
     * rejects, so a read that strayed onto the write path would fail this case loudly.
     *
     * No mocking library and no `jest.mock` is involved, here or anywhere in this file: the legacy
     * repository ships no mocking library either, and the ports are what make a plain literal
     * sufficient.
     */
    const readOnlySeam: ProductTypeStatementExecutor = {
      execute: (): Promise<CannedRow[]> => Promise.resolve([]),
      executeMutation: (): Promise<number> =>
        Promise.reject(new Error('findAllForTree must never reach the mutation member.')),
    };
    const accountContextDouble = createAccountContextDouble();
    const repository: ProductTypeRepository = new MySqlProductTypeRepository(
      readOnlySeam,
      accountContextDouble.accountContext,
    );

    await expect(repository.findAllForTree()).resolves.toEqual([]);

    /*
     * A READ RESOLVES NO ACTING ACCOUNT. The audit block belongs to the write path, which stamps
     * `createdByAccount` / `modifiedByAccount` through the entity's own lifecycle hooks; a projection
     * read has no actor to record and asks for none.
     */
    expect(accountContextDouble.callCount()).toBe(0);
  });

  it('NET-NEW: resolves rows through the port contract with no argument accepted', async () => {
    const harness = createTreeReadHarness([
      seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 0, childCount: 0 }),
    ]);

    /*
     * TR-1 TIGHTENING, EXERCISED. `model/dao/ProductTypeDAO.cfc:L52` declares `returntype="query"`
     * and `:L64` returns the untyped, column-oriented, row-indexed CFML query object created at
     * `:L53`. The target narrows that to a row-oriented array of typed rows — same rows, same
     * values, same order, a different access idiom — and resolves rather than returning
     * synchronously, because a CFML query blocks the request thread whereas the driver here is
     * asynchronous. Both are idiom rather than behaviour.
     */
    const rows: ProductTypeTreeRow[] = await harness.repository.findAllForTree();

    expect(rows).toHaveLength(1);
    expect(exactlyOne(rows, 'mapped row').productTypeID).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(harness.accountReads()).toBe(0);
  });
});

/* =================================================================================================
 * 2. THE TWO DERIVED COUNTS ARE NUMBERS, AND `isAssigned` IS A LEGACY MISNOMER
 * ===============================================================================================*/

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — numeric counts, never booleans', () => {
  /*
   * TODO(parity) / G6 — `model/dao/ProductTypeDAO.cfc:L55-L60`: `isAssigned` IS A LEGACY MISNOMER,
   * AND ITS COUNT SEMANTICS ARE RETAINED EXACTLY.
   *
   * The alias reads like a yes-or-no flag and holds nothing of the kind. `:L55-L57` computes
   * `count(...)` over the products of the product type, so the value ranges from zero through N; and
   * `:L58-L60` computes `count(...)` over the product types naming this one as their parent, so
   * `childCount` is likewise a number, bounded to ONE generation by its `parentProductTypeID`
   * predicate. The name is preserved because callers observe it, and it is neither renamed nor
   * corrected here (AAP §0.7.3 S7, preserve and annotate rather than repair).
   *
   * THE FAILURE THIS SECTION EXISTS TO PREVENT IS SILENT. A reader who trusts the name writes a
   * plain truthiness test, gets the right answer for every product type with products and for every
   * one without, and loses the magnitude everywhere in between with no symptom at all — no compile
   * error, no lint finding and no failing gate. So the cases below assert the NUMBER, and assert
   * against the boolean reading explicitly, rather than merely asserting a value that happens to be
   * truthy.
   *
   * The projection type asserted against is `ProductTypeTreeRow`, imported from
   * `src/ports/repositories/ProductTypeRepository.ts`. It is neither redeclared here nor shadowed by
   * a parallel shape: the port owns it, and the port declares both counts `readonly number`.
   */

  it('NET-NEW: maps an unassigned product type to isAssigned 0, and not to false', async () => {
    const harness = createTreeReadHarness([
      seededTreeRow(SUBSCRIPTION_PRODUCT_TYPE, { isAssigned: 0, childCount: 0 }),
    ]);

    const row = exactlyOne(await harness.repository.findAllForTree(), 'mapped row');

    expect(row.isAssigned).toBe(0);
    expect(typeof row.isAssigned).toBe('number');
    /* The boolean reading, refused explicitly. `0` is falsy, so a truthiness test would agree here
     * by accident; identity against `false` is what distinguishes a count of zero from a flag. */
    expect(row.isAssigned).not.toBe(false);
    expect(row.productTypeID).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
  });

  it('NET-NEW: preserves the full assigned-product count rather than collapsing it to true', async () => {
    const harness = createTreeReadHarness([
      seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 17, childCount: 0 }),
    ]);

    const row = exactlyOne(await harness.repository.findAllForTree(), 'mapped row');

    /*
     * Seventeen assigned products, and seventeen is what a consumer receives. A flag-shaped
     * projection would have reported the same thing for one product as for seventeen, which is the
     * magnitude loss the misnomer invites.
     */
    expect(row.isAssigned).toBe(17);
    expect(typeof row.isAssigned).toBe('number');
    expect(row.isAssigned).not.toBe(true);
    expect(row.isAssigned).toBeGreaterThan(1);
  });

  it('NET-NEW: preserves the exact immediate-child count as a number, not a flag', async () => {
    const harness = createTreeReadHarness([
      seededTreeRow(CONTENT_ACCESS_PRODUCT_TYPE, { isAssigned: 3, childCount: 4 }),
    ]);

    const row = exactlyOne(await harness.repository.findAllForTree(), 'mapped row');

    expect(row.childCount).toBe(4);
    expect(typeof row.childCount).toBe('number');
    expect(row.childCount).not.toBe(true);
    /* The two counts are independent projections and are not conflated with one another. */
    expect(row.isAssigned).toBe(3);
    expect(row.productTypeID).toBe(CONTENT_ACCESS_PRODUCT_TYPE_ID);
  });

  it('NET-NEW: keeps both counts distinct across a multi-row projection', async () => {
    const harness = createTreeReadHarness([
      seededTreeRow(CONTENT_ACCESS_PRODUCT_TYPE, { isAssigned: 0, childCount: 2 }),
      seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 5, childCount: 0 }),
      seededTreeRow(SUBSCRIPTION_PRODUCT_TYPE, { isAssigned: 1, childCount: 1 }),
    ]);

    const rows = await harness.repository.findAllForTree();

    expect(rows.map((row) => row.isAssigned)).toEqual([0, 5, 1]);
    expect(rows.map((row) => row.childCount)).toEqual([2, 0, 1]);
    /*
     * A count of zero alongside a non-zero sibling count is the case a flag-shaped projection would
     * have flattened, and a count of one alongside a count of five is the case a flag would have made
     * indistinguishable. Both are pinned here.
     */
    expect(rows.map((row) => row.productTypeID)).toEqual([
      CONTENT_ACCESS_PRODUCT_TYPE_ID,
      MERCHANDISE_PRODUCT_TYPE_ID,
      SUBSCRIPTION_PRODUCT_TYPE_ID,
    ]);
  });
});

/* =================================================================================================
 * 3. THE TWO MISLEADING LEGACY COMMENTS — DOCUMENTED AS FACTS, NEVER IMPLEMENTED AS BEHAVIOUR
 * ===============================================================================================*/

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — the caching hint is false', () => {
  it('NET-NEW: issues two statements for two calls, holding no result cache at any scope', async () => {
    const harness = createTreeReadHarness(
      [seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 1, childCount: 0 })],
      [
        seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 1, childCount: 0 }),
        seededTreeRow(SUBSCRIPTION_PRODUCT_TYPE, { isAssigned: 0, childCount: 0 }),
      ],
    );

    const firstRead = await harness.repository.findAllForTree();
    const secondRead = await harness.repository.findAllForTree();

    /*
     * TODO(parity) `model/dao/ProductTypeDAO.cfc:L51-L64` — THE HINT ADVERTISES CACHING THE COMPONENT
     * DOES NOT PERFORM, AND IT IS PRESERVED AS SOURCE HISTORY RATHER THAN ACTED ON.
     *
     * `:L51` reads `//@hint for caching product types as a tree-sorted query`. It is FACTUALLY FALSE
     * about the code beneath it: a fresh query object is created at `:L53` and executed at `:L64` on
     * every single invocation, and `:L49` — `component extends="HibachiDAO" accessors="true" {` —
     * declares no property of any kind to hold a result in. Contrast `model/dao/SkuDAO.cfc:L51`, which
     * declares exactly such a property and genuinely memoizes an option-group sort order. This
     * component is stateless, so the hint records an intention that was never implemented.
     *
     * ACTING ON IT WOULD BE WRONG TWICE OVER, which is why this case exists to pin the absence:
     *   - It would INVENT BEHAVIOUR the legacy does not have, forbidden by AAP §0.8.2 Guideline 4
     *     ("Do not enhance or optimize business logic beyond what the migration requires") and again
     *     by AAP §0.7.3 S9.
     *   - It would be UNSOUND IN THE TARGET EXECUTION MODEL. Mismatch M7 is explicit that nothing
     *     survives between Lambda invocations except module-scope state, and the composition root
     *     makes repositories singletons, so a memo at module scope OR at instance scope would bleed
     *     one invocation's product types into the next on a warm container.
     *
     * So there is no result cache here at any scope — not module-level, not instance-level, not "just
     * a keyed collection", and no expiry to tune. Two calls are two statements, which is exactly what
     * the legacy does.
     */
    expect(harness.calls).toHaveLength(2);
    expect(harness.calls.map((call) => call.sql)).toEqual([
      PRODUCT_TYPE_TREE_STATEMENT,
      PRODUCT_TYPE_TREE_STATEMENT,
    ]);
    expect(harness.calls.map((call) => call.params)).toEqual([[], []]);

    /*
     * And the SECOND read's answer is the second read's answer. A memoized result would have replayed
     * the first row set and this expectation would fail — which is the point of queueing two
     * different batches rather than the same one twice.
     */
    expect(firstRead).toHaveLength(1);
    expect(secondRead).toHaveLength(2);
    expect(firstRead).not.toBe(secondRead);
  });

  it('NET-NEW: hydrates a fresh row object per call, sharing no instance between reads', async () => {
    const harness = createTreeReadHarness(
      [seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 2, childCount: 1 })],
      [seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 2, childCount: 1 })],
    );

    const firstRow = exactlyOne(await harness.repository.findAllForTree(), 'mapped row');
    const secondRow = exactlyOne(await harness.repository.findAllForTree(), 'mapped row');

    /*
     * Identical VALUES, distinct OBJECTS. The adapter hydrates per read, so no entity instance is
     * retained between calls — the object-identity form of the same no-cache property, and the form
     * that would break first if a memo were ever introduced.
     */
    expect(secondRow.productTypeID).toBe(firstRow.productTypeID);
    expect(secondRow.isAssigned).toBe(firstRow.isAssigned);
    expect(secondRow.childCount).toBe(firstRow.childCount);
    expect(secondRow).not.toBe(firstRow);
  });
});

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — the "tree sorted" comment is false', () => {
  it('NET-NEW: orders only by productTypeName ASC, with no second sort key', async () => {
    const harness = createTreeReadHarness([]);

    await harness.repository.findAllForTree();

    const call = exactlyOne(harness.calls, 'recorded statement');

    /*
     * TODO(parity) / G6 — `model/dao/ProductTypeDAO.cfc:L62-L63`: THE TRAILING COMMENT CALLS A FLAT
     * ALPHABETICAL ORDERING A TREE, AND THE ORDERING IS CARRIED EXACTLY AS WRITTEN.
     *
     * `:L63` reads `// return query sorted Product Type tree`, and `:L62` is
     * `ORDER BY productTypeName ASC` and nothing else — one sort term, over the whole table,
     * alphabetical by name, hierarchy-blind. Nothing groups a child beneath its parent, and the
     * materialised ancestry path that could express a hierarchy — declared at
     * `model/entity/ProductType.cfc:L53` — is not referenced by the statement at any point.
     *
     * THREE SIGNALS POINT AT A HIERARCHY AND THE STATEMENT DELIVERS NONE: that comment, the legacy
     * member name at `:L52`, and the target member name `findAllForTree`. The target name describes
     * INTENDED CONSUMPTION — a caller that wants a hierarchy assembles one from the parent reference
     * on each returned row — and NOT hierarchical ordering. Row order is observable output, so
     * "improving" it would be a behavioural change that compiles cleanly and fails no other test,
     * which is precisely the silent divergence AAP §0.7.3 S7 exists to prevent.
     */
    expect(call.sql).toContain('ORDER BY productTypeName ASC');
    expect(PRODUCT_TYPE_TREE_STATEMENT.endsWith('ORDER BY productTypeName ASC')).toBe(true);

    /* Exactly one ordering clause: one occurrence splits the text into exactly two parts. */
    expect(TREE_STATEMENT_COLLAPSED.split('ORDER BY')).toHaveLength(2);

    /* And exactly one sort term within it — no comma-separated secondary key, ascending or otherwise. */
    const orderingClause = TREE_STATEMENT_COLLAPSED.split('ORDER BY')[1] ?? '';
    expect(orderingClause.trim()).toBe('productTypeName ASC');
    expect(orderingClause).not.toContain(',');
    expect(orderingClause).not.toMatch(/\bdesc\b/i);

    /* No hierarchy vocabulary anywhere in the statement. */
    expect(call.sql).not.toContain('productTypeIDPath');
    expect(call.sql).not.toMatch(/\bdepth\b/i);
    expect(call.sql).not.toMatch(/\blevel\b/i);
    expect(call.sql).not.toMatch(/\brecursive\b/i);
  });

  it('NET-NEW: returns the driver row order unchanged and assembles no hierarchy client-side', async () => {
    const harness = createTreeReadHarness([
      seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 0, childCount: 0 }),
      seededTreeRow(SUBSCRIPTION_PRODUCT_TYPE, { isAssigned: 0, childCount: 0 }),
      seededTreeRow(CONTENT_ACCESS_PRODUCT_TYPE, { isAssigned: 0, childCount: 0 }),
    ]);

    const rows = await harness.repository.findAllForTree();

    /*
     * The database owns the ordering, so the adapter hands back exactly the sequence it received —
     * it does not re-sort, group, nest or fold rows after the read. The batch queued here is
     * deliberately NOT in alphabetical order, so a client-side sort would visibly reorder it and this
     * expectation would fail.
     */
    expect(rows.map((row) => row.productTypeName)).toEqual([
      'Merchandise',
      'Subscription',
      'Content Access',
    ]);

    /*
     * Every row is a FLAT product type. `childProductTypes` stays empty and the parent reference stays
     * unresolved even though every canned row carries a `parentProductTypeID` column, because
     * assembling descendants is not this member's job and the row mapper deliberately resolves no
     * association.
     *
     * ⭐ AN ABSENT ASSOCIATION IS NOT A LOST FOREIGN KEY, AND THIS FILE NO LONGER IMPLIES OTHERWISE.
     * The association is left unresolved on purpose: an identifier-only parent would make
     * `ProductType.getSimpleRepresentation` return `undefined` at the parent's absent name, emptying
     * the Google feed's `g:product_type` element. Rule 3b in `src/adapters/mysql/rowMappers.ts`
     * therefore preserves the row's raw parent key BESIDE the entity, so a read-modify-save no longer
     * writes `NULL` and detaches the child. That round trip is proved on both write paths in
     * `test/adapters/MySqlProductPersistence.test.ts` ("the parent round trip (rule 3b)"), which is
     * where it belongs — this member is a read, and this file's surface is closed at `findAllForTree`.
     */
    for (const row of rows) {
      expect(row).toBeInstanceOf(ProductType);
      expect(row.childProductTypes).toEqual([]);
      expect(row.parentProductType).toBeUndefined();
    }
  });
});

/* =================================================================================================
 * 4. THE SEEDED DISCRIMINATORS — BYTE-EXACT IDENTIFIERS AND A SINGLE ROOT LEVEL (IR-7)
 * ===============================================================================================*/

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — the seeded discriminators', () => {
  it('NET-NEW: carries all three seeded identifiers byte-for-byte, lowercase and dashless', () => {
    /*
     * IR-7 — THESE THREE IDENTIFIERS ARE FIXED PLATFORM DATA, NOT TEST DATA, AND THEY ARE USED HERE
     * THROUGH THE SHARED FIXTURE RATHER THAN RETYPED. `test/fixtures/productTypes.ts` transcribes
     * them verbatim from `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`, and this file imports
     * that module rather than declaring a competing one, so there is exactly one place in the subtree
     * where a product-type discriminator is written down.
     *
     * They are not regenerated, not re-cased, not dashed, not hashed and not derived from one another
     * — the `systemCode` strings are literal branch keys of production logic, so a single wrong
     * character silently stops a branch matching with no compile error at all.
     */
    expect(MERCHANDISE_PRODUCT_TYPE_ID).toBe('444df2f7ea9c87e60051f3cd87b435a1');
    expect(SUBSCRIPTION_PRODUCT_TYPE_ID).toBe('444df2f9c7deaa1582e021e894c0e299');
    expect(CONTENT_ACCESS_PRODUCT_TYPE_ID).toBe('444df313ec53a08c32d8ae434af5819a');

    /* IR-6 shape: 32 characters, lowercase hexadecimal, no dashes, on every one of the three. */
    for (const seeded of ALL_SEEDED_PRODUCT_TYPES) {
      expect(seeded.productTypeID).toHaveLength(32);
      expect(seeded.productTypeID).toMatch(/^[0-9a-f]{32}$/);
      expect(seeded.productTypeID).not.toContain('-');
      expect(seeded.productTypeID).toBe(seeded.productTypeID.toLowerCase());
    }

    /*
     * The record constants agree with the standalone identifiers, and the three-way spelling
     * asymmetry that one seed line renders is preserved rather than tidied: the display name is title
     * case with a space, the system code is camelCase, and the URL title is kebab-case. None is
     * derived from another, and normalising any one of them would change data the legacy treats as
     * three independent columns.
     */
    expect(MERCHANDISE_PRODUCT_TYPE.productTypeID).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(MERCHANDISE_PRODUCT_TYPE.systemCode).toBe('merchandise');
    expect(MERCHANDISE_PRODUCT_TYPE.productTypeName).toBe('Merchandise');
    expect(MERCHANDISE_PRODUCT_TYPE.urlTitle).toBe('merchandise');

    expect(SUBSCRIPTION_PRODUCT_TYPE.productTypeID).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
    expect(SUBSCRIPTION_PRODUCT_TYPE.systemCode).toBe('subscription');
    expect(SUBSCRIPTION_PRODUCT_TYPE.productTypeName).toBe('Subscription');
    expect(SUBSCRIPTION_PRODUCT_TYPE.urlTitle).toBe('subscription');

    expect(CONTENT_ACCESS_PRODUCT_TYPE.productTypeID).toBe(CONTENT_ACCESS_PRODUCT_TYPE_ID);
    expect(CONTENT_ACCESS_PRODUCT_TYPE.systemCode).toBe('contentAccess');
    expect(CONTENT_ACCESS_PRODUCT_TYPE.productTypeName).toBe('Content Access');
    expect(CONTENT_ACCESS_PRODUCT_TYPE.urlTitle).toBe('content-access');
  });

  it('NET-NEW: proves the three seeded records are a single ROOT level, not a hierarchy', () => {
    /*
     * ⚠️ THE SEED DOCUMENT ESTABLISHES ONE LEVEL AND ONLY ONE LEVEL, AND NOTHING IN THIS FILE MAY
     * INFER OTHERWISE. `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` contains exactly three
     * `<Record>` elements, and on every one of them:
     *   - `productTypeIDPath` equals that record's OWN `productTypeID` — a one-element ancestry path,
     *     which is what a root looks like;
     *   - `parentProductTypeID` is the literal four-character string the seed format renders for SQL
     *     NULL, so no record names a parent;
     *   - `activeFlag` is the literal `'1'` the document renders, even though `:L10` declares the
     *     column `datatype="bit"`.
     * The fixture carries all three facts as fields rather than as prose, so this case asserts source
     * values and invents nothing. Any deeper relationship a test needs must be CONSTRUCTED — see
     * section 5.
     */
    for (const seeded of ALL_SEEDED_PRODUCT_TYPES) {
      expect(seeded.productTypeIDPath).toBe(seeded.productTypeID);
      expect(seeded.productTypeIDPath.split(',')).toHaveLength(1);
      expect(seeded.parentProductTypeID).toBe('NULL');
      expect(seeded.activeFlag).toBe('1');
    }

    /* Three records, in seed-document order, and no fourth. */
    expect(ALL_SEEDED_PRODUCT_TYPES).toHaveLength(3);
    expect(ALL_SEEDED_PRODUCT_TYPES.map((seeded) => seeded.systemCode)).toEqual([
      'merchandise',
      'subscription',
      'contentAccess',
    ]);

    /* No seeded record is the parent of another, so the seed forms three independent roots. */
    const seededIdentifiers = ALL_SEEDED_PRODUCT_TYPES.map((seeded) => seeded.productTypeID);
    for (const seeded of ALL_SEEDED_PRODUCT_TYPES) {
      expect(seededIdentifiers).not.toContain(seeded.parentProductTypeID);
    }
  });

  it('NET-NEW: maps canned root-level rows built from the seeded values', async () => {
    /*
     * The canned rows are assembled from the fixture's own seven column values plus the two
     * query-computed counts, which is an HONEST ROOT-LEVEL SETUP: every column value traces to
     * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`, and the counts are stated because the seed
     * document has no column for them — they are what the two correlated subselects return.
     *
     * Both counts are zero for all three, which is the honest expectation for a freshly seeded
     * catalogue: no product is assigned to any of them and none has a child.
     */
    const harness = createTreeReadHarness(
      ALL_SEEDED_PRODUCT_TYPES.map((seeded) =>
        seededTreeRow(seeded, { isAssigned: 0, childCount: 0 }),
      ),
    );

    const rows = await harness.repository.findAllForTree();

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.productTypeID)).toEqual([
      MERCHANDISE_PRODUCT_TYPE_ID,
      SUBSCRIPTION_PRODUCT_TYPE_ID,
      CONTENT_ACCESS_PRODUCT_TYPE_ID,
    ]);
    expect(rows.map((row) => row.systemCode)).toEqual([
      'merchandise',
      'subscription',
      'contentAccess',
    ]);
    expect(rows.map((row) => row.urlTitle)).toEqual([
      'merchandise',
      'subscription',
      'content-access',
    ]);

    for (const row of rows) {
      /* The ancestry path survives hydration unchanged and still identifies a root. */
      expect(row.productTypeIDPath).toBe(row.productTypeID);
      /*
       * The seed's rendered `'1'` becomes the entity's declared boolean. The fixture keeps the source
       * characters and the row mapper performs the conversion, so the coercion happens in exactly one
       * place and the fixture never has to guess a representation the document does not contain.
       */
      expect(row.activeFlag).toBe(true);
      /* Still flat: no parent resolved, no children inferred. These three are ROOTS in any case — the
       * seed gives them no parent at all, so there is no key here for rule 3b to preserve and the
       * write path nulls the column because that is the truth, not because anything was dropped. */
      expect(row.parentProductType).toBeUndefined();
      expect(row.childProductTypes).toEqual([]);
      expect(row.isAssigned).toBe(0);
      expect(row.childCount).toBe(0);
    }
  });
});

/* =================================================================================================
 * 5. A DEEPER RELATIONSHIP, CONSTRUCTED EXPLICITLY — NEVER INFERRED FROM THE SEED
 * ===============================================================================================*/

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — an explicitly constructed parent and child', () => {
  /**
   * The one explicit child row this section needs.
   *
   * ⚠️ CONSTRUCTED HERE, AND NOT SEED DATA. `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` seeds
   * three ROOTS and establishes no parent/child relationship at all, so a case that needs one has to
   * build it — and has to say so, which is what this function and
   * {@link TEST_ONLY_CHILD_PRODUCT_TYPE_ID} are for. The parent is the source-grounded merchandise
   * identifier taken from the shared fixture; the child is the single test-only row required to
   * exercise `parentProductTypeID` and `childCount`, and nothing further is added.
   *
   * Neither the merchandise identifier nor either of the other two seeded identifiers is regenerated
   * or mutated anywhere in this file. The child is deliberately NOT contributed back to
   * `test/fixtures/productTypes.ts`, because a shared fixture presenting it alongside the three seeded
   * records would misrepresent a constructed relationship as platform data.
   *
   * The row carries NO `systemCode`, matching a non-seeded product type: only the three seeded roots
   * carry one. It reaches no excluded domain family — no attribute set, no promotion reward, no
   * qualifier and no price-group rate appears in it or anywhere in this file.
   */
  function testOnlyChildRow(counts: {
    readonly isAssigned: number;
    readonly childCount: number;
  }): CannedRow {
    return {
      productTypeID: TEST_ONLY_CHILD_PRODUCT_TYPE_ID,
      /* A two-element ancestry path, root first and self last — the shape the entity lifecycle
       * maintains for a child, in contrast with the one-element path every seeded root carries. */
      productTypeIDPath: `${MERCHANDISE_PRODUCT_TYPE_ID},${TEST_ONLY_CHILD_PRODUCT_TYPE_ID}`,
      parentProductTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Test-Only Child Product Type',
      urlTitle: 'test-only-child-product-type',
      activeFlag: '1',
      isAssigned: counts.isAssigned,
      childCount: counts.childCount,
    };
  }

  it('NET-NEW: maps a parent row and an explicit child row flatly, assembling no tree', async () => {
    const harness = createTreeReadHarness([
      seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 2, childCount: 1 }),
      testOnlyChildRow({ isAssigned: 0, childCount: 0 }),
    ]);

    const rows = await harness.repository.findAllForTree();

    /*
     * THE SQL COMPUTES `childCount` THROUGH `parentProductTypeID`, AND THIS IS WHERE THAT MATTERS.
     * `model/dao/ProductTypeDAO.cfc:L58-L60` correlates the self-reference's parent key against the
     * outer row's identifier, so the parent's count of one is the DATABASE's answer about this exact
     * relationship. The fragment itself is pinned in section 1; here the relationship it counts is
     * the one under construction.
     */
    expect(TREE_STATEMENT_COLLAPSED).toContain(
      `WHERE spt.parentProductTypeID = ${PRODUCT_TYPE_TABLE}.productTypeID) as childCount`,
    );

    expect(rows).toHaveLength(2);

    const parentRow = rows[0];
    const childRow = rows[1];

    expect(parentRow?.productTypeID).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(parentRow?.childCount).toBe(1);
    expect(parentRow?.isAssigned).toBe(2);

    expect(childRow?.productTypeID).toBe(TEST_ONLY_CHILD_PRODUCT_TYPE_ID);
    expect(childRow?.productTypeIDPath).toBe(
      `${MERCHANDISE_PRODUCT_TYPE_ID},${TEST_ONLY_CHILD_PRODUCT_TYPE_ID}`,
    );
    expect(childRow?.childCount).toBe(0);
    /* A non-seeded product type carries no discriminator, which is what forces a root walk elsewhere. */
    expect(childRow?.systemCode).toBeUndefined();

    /*
     * ⛔ THE REPOSITORY MAPS FLAT ROWS AND DOES NOTHING ELSE. It does not recursively assemble a tree,
     * does not infer descendants from `parentProductTypeID`, does not attach the child to the parent,
     * and does not order by the ancestry path. Every one of those would be work the legacy statement
     * never performs, and the parent/child pair is exactly the input that would expose it.
     *
     * ⚠️ THE CHILD'S PARENT KEY IS NEVERTHELESS NOT DISCARDED. `testOnlyChildRow` supplies a real
     * `parentProductTypeID`, and rule 3b preserves it beside the entity even though no association is
     * attached here — which is what stops a later save from writing `NULL` over it and what keeps the
     * two-element `productTypeIDPath` asserted above from being rebuilt as a one-element path. Both are
     * proved in `test/adapters/MySqlProductPersistence.test.ts` ("the parent round trip (rule 3b)").
     */
    for (const row of rows) {
      expect(row).toBeInstanceOf(ProductType);
      expect(row.parentProductType).toBeUndefined();
      expect(row.childProductTypes).toEqual([]);
      expect(row.products).toEqual([]);
    }
    expect(PRODUCT_TYPE_TREE_STATEMENT).not.toContain('productTypeIDPath');
  });

  it('NET-NEW: passes childCount through from the statement rather than deriving it from the rows', async () => {
    /*
     * ONLY THE PARENT IS RETURNED, AND ITS CHILD COUNT IS STILL ONE. If the adapter derived the count
     * by inspecting the rows it received, this would read zero — there is no child row in the batch to
     * count. It reads one because the count is a column the correlated subselect at
     * `model/dao/ProductTypeDAO.cfc:L58-L60` computed against the whole table, which is also why
     * `childCount` is meaningful even for a filtered or partial read.
     */
    const harness = createTreeReadHarness([
      seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 0, childCount: 1 }),
    ]);

    const row = exactlyOne(await harness.repository.findAllForTree(), 'mapped row');

    expect(row.productTypeID).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(row.childCount).toBe(1);
    expect(row.childProductTypes).toEqual([]);
    /*
     * The same reasoning applies to the assigned-product count: zero here is the statement's answer
     * about `SwProduct` rows, not a conclusion drawn from the empty collection on the entity.
     */
    expect(row.isAssigned).toBe(0);
    expect(row.products).toEqual([]);
  });

  it('NET-NEW: counts one generation only, so a grandchild is not folded into the parent count', async () => {
    /*
     * The relationship is again constructed explicitly: the merchandise root, its one test-only child,
     * and no grandchild row at all. The parent's count is one because
     * `model/dao/ProductTypeDAO.cfc:L58-L60` matches a SINGLE generation through
     * `parentProductTypeID` — a product type whose one child itself had four children would still
     * report one, never five. Nothing in the statement walks the hierarchy transitively, and no
     * consumer may read the value as a subtree size.
     */
    const harness = createTreeReadHarness([
      seededTreeRow(MERCHANDISE_PRODUCT_TYPE, { isAssigned: 0, childCount: 1 }),
      testOnlyChildRow({ isAssigned: 0, childCount: 4 }),
    ]);

    const rows = await harness.repository.findAllForTree();

    expect(rows.map((row) => row.childCount)).toEqual([1, 4]);
    /* The parent's one is NOT the child's four plus one: the counts are per-row and independent. */
    expect(rows[0]?.childCount).toBe(1);
    expect(rows[1]?.childCount).toBe(4);
  });
});

/* =================================================================================================
 * 7. THE THREE ADDITIVE MEMBERS — re-binding, the write, and the removal
 * =================================================================================================
 * Everything above this banner exercises the one member `model/dao/ProductTypeDAO.cfc` declares.
 * Everything below it exercises the three members it does NOT, and the distinction is why their
 * labels carry a second justification: for the read, **NET-NEW** means "no legacy test exists"; for
 * these three it also means "no legacy MEMBER exists", so there is no legacy statement, no legacy
 * bind order and no legacy return contract for a case to be traceable to. Each expectation below is
 * derived from the production source alone, and nothing here should be read as a port of anything.
 *
 * WHY THEY EXIST AT ALL, briefly, because a reviewer is entitled to ask before reading their cases:
 * a legacy DAO participated in an ambient ORM session that the framework flushed at request end, so
 * it needed neither a transaction handle nor a write member. Mismatch M5 removed both the session and
 * the request-end hook, so a stateless invocation has to name its own connection (`withExecutor`) and
 * issue its own statements (`saveProductType`, `removeProductType`).
 *
 * A NOTE ON THE HARNESS. `createTreeReadHarness` above types its repository as the PORT, which is
 * right for read cases and wrong for these: `withExecutor` is deliberately absent from the port, so
 * a port-typed reference cannot reach it. The write harness below therefore holds the CONCRETE class,
 * and it also exposes the account double's read count because two of these members consult it.
 * ===============================================================================================*/

/** A write-path harness: the concrete adapter, its recorded statements, and its account seam. */
interface WriteHarness {
  /**
   * Typed as the CONCRETE adapter rather than the port, because `withExecutor` is not on the port
   * and must not be put there — a service may not know a statement executor exists at all. Reaching
   * it through the concrete class here mirrors the only layer that legitimately holds one.
   */
  readonly repository: MySqlProductTypeRepository;
  /** Every statement issued, byte for byte and in issue order. Live view. */
  readonly calls: readonly SqlExecutorCall[];
  /** How many times an acting account was resolved. */
  readonly accountReads: () => number;
}

/**
 * Build the adapter over a recording executor for the write path.
 *
 * An unconfigured write answers `0` affected rows, which is the double's documented default and is
 * all these cases need: not one of them reads the count, because the member returns `void` for the
 * removal and the entity for the write. Where a case wants a specific acknowledgement it queues one.
 *
 * @param account - The account context to inject. Defaults to the shared persisted admin.
 */
function createWriteHarness(
  account: {
    accountContext: AccountContextPort;
    callCount: () => number;
  } = createAccountContextDouble(),
): WriteHarness {
  const executorDouble = createSqlExecutorDouble();

  return {
    repository: new MySqlProductTypeRepository(executorDouble.executor, account.accountContext),
    calls: executorDouble.calls,
    accountReads: account.callCount,
  };
}

/**
 * The physical write columns, resolved through the same whitelist the adapter uses.
 *
 * The adapter keeps its column list module-private, so these expectations resolve each name the same
 * way it does rather than importing its internals or retyping a literal. The ORDER here is the order
 * the adapter's own list declares, and that order IS the assertion in the bind-order cases below: a
 * column moved in production without being moved here shifts a binding, and these cases fail.
 */
const WRITE_COLUMNS = Object.freeze([
  'productTypeIDPath',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'productTypeName',
  'productTypeDescription',
  'systemCode',
  'parentProductTypeID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const).map((column) => assertColumnName(PRODUCT_TYPE_TABLE, column));

/** The identifier column, resolved the same way. */
const PRODUCT_TYPE_ID_COLUMN = assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeID');

/** IR-6's identifier shape: 32 lowercase hexadecimal characters, no dashes. */
const HEX_32 = /^[0-9a-f]{32}$/;

/**
 * A transient product type carrying the field values a save should persist.
 *
 * `productTypeID` is left at the constructor's empty string, which is what makes `isNew()` answer
 * true and is therefore what selects the insert branch. Nothing here pre-assigns an identifier.
 */
function transientProductType(overrides: Partial<ProductType> = {}): ProductType {
  const productType = new ProductType();
  productType.productTypeName = 'Test Product Type';
  productType.urlTitle = 'test-product-type';
  productType.activeFlag = true;
  productType.publishedFlag = true;
  return Object.assign(productType, overrides);
}

/** Return the single recorded statement, or fail naming what was expected. */
function soleStatement(calls: readonly SqlExecutorCall[]): SqlExecutorCall {
  return exactlyOne(calls, 'statement');
}

describe('NET-NEW: MySqlProductTypeRepository.withExecutor — re-binding, and its isolation', () => {
  it('NET-NEW — answers a NEW instance of the same class rather than mutating the receiver', () => {
    const { repository } = createWriteHarness();
    const replacement = createSqlExecutorDouble();

    const rebound = repository.withExecutor(replacement.executor);

    /*
     * A NEW instance is the whole point. Mutating in place would make the repository's connection
     * depend on WHEN it was used rather than on WHICH instance was used — an ambient
     * current-transaction slot in all but name, which is what `UnitOfWork` refuses to keep (M7).
     */
    expect(rebound).not.toBe(repository);
    expect(rebound).toBeInstanceOf(MySqlProductTypeRepository);
  });

  it('NET-NEW — MySqlProductTypeRepository.withExecutor: every statement the re-bound instance issues lands on the REPLACEMENT executor', async () => {
    const original = createSqlExecutorDouble();
    const replacement = createSqlExecutorDouble();
    const repository = new MySqlProductTypeRepository(
      original.executor,
      createAccountContextDouble().accountContext,
    );

    await repository.withExecutor(replacement.executor).findAllForTree();

    expect(replacement.calls).toHaveLength(1);
    /* The receiver's own executor saw nothing, which is the isolation half of the contract. */
    expect(original.calls).toHaveLength(0);
  });

  it('NET-NEW — MySqlProductTypeRepository.withExecutor: the ORIGINAL keeps its own executor and stays usable after the re-binding', async () => {
    const original = createSqlExecutorDouble();
    const replacement = createSqlExecutorDouble();
    const repository = new MySqlProductTypeRepository(
      original.executor,
      createAccountContextDouble().accountContext,
    );

    repository.withExecutor(replacement.executor);
    await repository.findAllForTree();

    /*
     * The pool-bound instance a composition root built is still valid and still pool-bound AFTER the
     * call. This is the case that fails if `withExecutor` is ever "simplified" into an assignment.
     */
    expect(original.calls).toHaveLength(1);
    expect(replacement.calls).toHaveLength(0);
  });

  it('NET-NEW — MySqlProductTypeRepository.withExecutor: two re-bindings of one receiver cannot observe each other', async () => {
    const original = createSqlExecutorDouble();
    const firstBoundary = createSqlExecutorDouble();
    const secondBoundary = createSqlExecutorDouble();
    const repository = new MySqlProductTypeRepository(
      original.executor,
      createAccountContextDouble().accountContext,
    );

    await repository.withExecutor(firstBoundary.executor).findAllForTree();
    await repository.withExecutor(secondBoundary.executor).findAllForTree();

    /* Two concurrent boundaries on one warm container get two instances (M7). */
    expect(firstBoundary.calls).toHaveLength(1);
    expect(secondBoundary.calls).toHaveLength(1);
    expect(original.calls).toHaveLength(0);
  });

  it('NET-NEW — carries the ACCOUNT CONTEXT across, so a re-bound write still stamps its actor', async () => {
    const accountDouble = createAccountContextDouble();
    const original = createSqlExecutorDouble();
    const boundary = createSqlExecutorDouble();
    const repository = new MySqlProductTypeRepository(
      original.executor,
      accountDouble.accountContext,
    );

    await repository.withExecutor(boundary.executor).saveProductType(transientProductType());

    /*
     * Re-binding replaces ONE collaborator. The account context is passed through to the new
     * instance, so a write issued inside a transaction boundary still resolves an acting account —
     * had it been dropped, the audit columns would silently bind null on every transactional write.
     */
    expect(accountDouble.callCount()).toBe(1);
    const statement = soleStatement(boundary.calls);
    expect(statement.params).toContain(TEST_ADMIN_ACCOUNT_ID);
  });

  it('NET-NEW — the re-bound instance still answers the whole ProductTypeRepository port', async () => {
    const { repository } = createWriteHarness();
    const boundary = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    /*
     * Annotating the re-bound instance as the PORT is the assertion: it compiles only while the
     * re-bound value still satisfies the declared contract, so a `withExecutor` that started
     * answering some narrower shape would fail the typecheck rather than surviving until a service
     * broke. Re-binding itself is absent from this interface by design.
     */
    const port: ProductTypeRepository = repository.withExecutor(boundary.executor);

    expect(typeof port.findAllForTree).toBe('function');
    expect(typeof port.saveProductType).toBe('function');
    expect(typeof port.removeProductType).toBe('function');
    await expect(port.findAllForTree()).resolves.toEqual([]);
  });

  /*
   * ⭐ REVIEW FINDING F3 — PORT EXHAUSTIVENESS, KEYED OFF THE PORT ITSELF RATHER THAN OFF A HAND LIST.
   * The case above proves the re-bound instance still answers the port; this one proves the list of
   * members being checked is COMPLETE. A hand-written enumeration silently stops covering a port the
   * day a member is added, which is the gap F3 reported; the mapped type below fails to COMPILE
   * instead.
   */
  it('NET-NEW — satisfies the ProductTypeRepository port across ALL THREE declared members', () => {
    const asPort: ProductTypeRepository = createWriteHarness().repository;

    /* Keyed off the port's own member set, so a fourth method breaks compilation until it is named. */
    const everyPortMember: Record<keyof ProductTypeRepository, true> = {
      findAllForTree: true,
      saveProductType: true,
      removeProductType: true,
    };

    const declared = Object.keys(everyPortMember) as readonly (keyof ProductTypeRepository)[];

    expect(declared).toHaveLength(3);
    for (const member of declared) {
      expect(typeof asPort[member]).toBe('function');
    }
  });
});

describe('NET-NEW: MySqlProductTypeRepository.saveProductType — the INSERT branch', () => {
  it('NET-NEW — mints a 32-character identifier for a transient entity and binds it FIRST', async () => {
    const harness = createWriteHarness();
    const productType = transientProductType();

    expect(productType.isNew()).toBe(true);

    await harness.repository.saveProductType(productType);

    /*
     * IR-6: `generator="uuid"` produced 32 hexadecimal characters with no dashes, and it produced
     * them in application code rather than by auto-increment. An RFC-4122 dashed string would not fit
     * the column, so the shape is asserted rather than merely the presence of something.
     */
    expect(productType.productTypeID).toMatch(HEX_32);
    expect(productType.isNew()).toBe(false);

    const statement = soleStatement(harness.calls);
    /* An insert LISTS the identifier, so it is the first bound value, ahead of every column value. */
    expect(statement.params[0]).toBe(productType.productTypeID);
  });

  it('NET-NEW — fires the entity lifecycle hook BEFORE collecting values, so the ancestry path is fresh', async () => {
    const harness = createWriteHarness();
    /*
     * ⭐ THE MUTATION-SENSITIVE CASE FOR THE ORDER OF TWO STATEMENTS IN PRODUCTION.
     *
     * The entity arrives carrying a DELIBERATELY STALE path — the shape a re-parented product type
     * would hold before its hook ran. `preInsert` rebuilds `productTypeIDPath` from the parent chain
     * and `collectWritableValues` then reads that field, so the order is fixed: hook first, collect
     * second. Were the hook invoked afterwards, the statement would be composed from PRE-hook values
     * and would bind the stale string below — and, as the production note records, nothing would fail
     * loudly. This case is what makes that silent failure loud.
     */
    const productType = transientProductType({
      productTypeIDPath: 'stale-path-from-a-former-parent',
    });

    await harness.repository.saveProductType(productType);

    const statement = soleStatement(harness.calls);
    const pathIndex = WRITE_COLUMNS.indexOf(
      assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeIDPath'),
    );

    /* Root-first, self last: a root product type's path is its own freshly minted identifier. */
    expect(productType.productTypeIDPath).toBe(productType.productTypeID);
    expect(statement.params[pathIndex + 1]).toBe(productType.productTypeID);
    expect(statement.params).not.toContain('stale-path-from-a-former-parent');
  });

  it('NET-NEW — rebuilds a CHILD ancestry path root-first from the parent chain', async () => {
    const harness = createWriteHarness();
    const parent = new ProductType();
    parent.productTypeID = MERCHANDISE_PRODUCT_TYPE_ID;
    parent.productTypeName = 'Merchandise';

    const child = transientProductType();
    child.parentProductType = parent;

    await harness.repository.saveProductType(child);

    /*
     * The path is materialised ancestry, comma-delimited, root first and self last — which is why the
     * hook has to run after the identifier is minted as well as before values are collected.
     */
    expect(child.productTypeIDPath).toBe(`${MERCHANDISE_PRODUCT_TYPE_ID},${child.productTypeID}`);
    const statement = soleStatement(harness.calls);
    expect(statement.params).toContain(`${MERCHANDISE_PRODUCT_TYPE_ID},${child.productTypeID}`);
    /* The hierarchy also reaches its own foreign-key column, not only the path. */
    const parentIndex = WRITE_COLUMNS.indexOf(
      assertColumnName(PRODUCT_TYPE_TABLE, 'parentProductTypeID'),
    );
    expect(statement.params[parentIndex + 1]).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
  });

  it('NET-NEW — stamps the audit actor resolved from the ACCOUNT CONTEXT PORT, read exactly once', async () => {
    const accountDouble = createAccountContextDouble();
    const harness = createWriteHarness(accountDouble);
    const productType = transientProductType();

    await harness.repository.saveProductType(productType);

    /*
     * The legacy hook read its actor from a request-scoped framework lookup, which S3 forbids here,
     * so the actor arrives through a declared port. One resolution per write: a second read would
     * mean the adapter consulted the seam twice and could stamp two different actors on one row.
     */
    expect(accountDouble.callCount()).toBe(1);
    expect(productType.createdByAccount).toBe(TEST_ADMIN_ACCOUNT_ID);
    expect(productType.modifiedByAccount).toBe(TEST_ADMIN_ACCOUNT_ID);

    const statement = soleStatement(harness.calls);
    const createdByIndex = WRITE_COLUMNS.indexOf(
      assertColumnName(PRODUCT_TYPE_TABLE, 'createdByAccountID'),
    );
    const modifiedByIndex = WRITE_COLUMNS.indexOf(
      assertColumnName(PRODUCT_TYPE_TABLE, 'modifiedByAccountID'),
    );
    expect(statement.params[createdByIndex + 1]).toBe(TEST_ADMIN_ACCOUNT_ID);
    expect(statement.params[modifiedByIndex + 1]).toBe(TEST_ADMIN_ACCOUNT_ID);
  });

  it('NET-NEW — refuses to attribute a persisted NON-ADMIN actor, preserving the legacy second gate', async () => {
    const accountDouble = createAccountContextDouble(persistedNonAdminAccount());
    const harness = createWriteHarness(accountDouble);
    const productType = transientProductType();

    await harness.repository.saveProductType(productType);

    /*
     * ⚠️ TWO GATES, NOT ONE, AND THE SECOND IS EASY TO LOSE. The legacy condition is
     * `!getAccount().isNew() && getAccount().getAdminAccountFlag()`, byte-identical at all three of
     * its call sites, so an actor must be BOTH persisted AND administrative to be recorded. A
     * persisted non-admin account therefore stamps NO attribution — the timestamps are still written
     * because they depend on the clock rather than the actor.
     *
     * This case exists because dropping the administrative half is a one-token change that makes a
     * system MORE permissive while every other audit assertion keeps passing. Note that the actor is
     * still RESOLVED: the gate rejects the value it was handed, it does not avoid asking.
     */
    expect(accountDouble.callCount()).toBe(1);
    expect(productType.createdDateTime).toBeInstanceOf(Date);
    expect(productType.modifiedDateTime).toBeInstanceOf(Date);
    expect(productType.createdByAccount).toBeUndefined();
    expect(productType.modifiedByAccount).toBeUndefined();

    const statement = soleStatement(harness.calls);
    const createdByIndex = WRITE_COLUMNS.indexOf(
      assertColumnName(PRODUCT_TYPE_TABLE, 'createdByAccountID'),
    );
    expect(statement.params[createdByIndex + 1]).toBeNull();
    expect(statement.params).not.toContain(persistedNonAdminAccount().accountID);
  });

  it('NET-NEW — stamps the timestamps but leaves the actor columns NULL when no account is present', async () => {
    const absent = createAbsentAccountContextDouble();
    const harness = createWriteHarness(absent);
    const productType = transientProductType();

    await harness.repository.saveProductType(productType);

    /*
     * An absent account is a real state — an unauthenticated or system-initiated write — and it is a
     * DISTINCT input from an actor present with the administrative flag false, even though both
     * correctly yield "do not stamp". The timestamps are still written because they depend on the
     * clock rather than the actor, and the two account columns bind null rather than an empty string:
     * the difference between "nobody was recorded" and "an account whose identifier is blank".
     */
    expect(absent.callCount()).toBe(1);
    expect(productType.createdDateTime).toBeInstanceOf(Date);
    expect(productType.modifiedDateTime).toBeInstanceOf(Date);
    expect(productType.createdByAccount).toBeUndefined();

    const statement = soleStatement(harness.calls);
    const createdByIndex = WRITE_COLUMNS.indexOf(
      assertColumnName(PRODUCT_TYPE_TABLE, 'createdByAccountID'),
    );
    expect(statement.params[createdByIndex + 1]).toBeNull();
  });

  it('NET-NEW — saveProductType emits the exact column list, one placeholder per column, identifier included', async () => {
    const harness = createWriteHarness();

    await harness.repository.saveProductType(transientProductType());

    const statement = soleStatement(harness.calls);
    const expectedColumns = [PRODUCT_TYPE_ID_COLUMN, ...WRITE_COLUMNS].join(', ');
    const expectedPlaceholders = [PRODUCT_TYPE_ID_COLUMN, ...WRITE_COLUMNS]
      .map(() => '?')
      .join(', ');

    /*
     * Whole-statement equality rather than a substring probe. A column added to the list but not to
     * the value array — or the reverse — shifts every binding after it, and only an exact comparison
     * of both halves catches that.
     */
    expect(statement.sql).toBe(
      `INSERT INTO ${PRODUCT_TYPE_TABLE} (${expectedColumns}) VALUES (${expectedPlaceholders})`,
    );
    expect(statement.params).toHaveLength(WRITE_COLUMNS.length + 1);
    expect((statement.sql.match(/\?/g) ?? []).length).toBe(statement.params.length);
  });

  it('NET-NEW — saveProductType binds an ABSENT optional field as null rather than dropping it from the statement', async () => {
    const harness = createWriteHarness();
    const productType = new ProductType();
    productType.productTypeName = 'Sparse Product Type';

    await harness.repository.saveProductType(productType);

    const statement = soleStatement(harness.calls);
    const descriptionIndex = WRITE_COLUMNS.indexOf(
      assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeDescription'),
    );

    /*
     * Dropping the column would let the database apply its own default, which is a DIFFERENT outcome
     * from storing the absence the entity actually holds — and on an update it would leave a stale
     * value in place. The placeholder count above already proves nothing is dropped; this proves the
     * value bound in its place is null.
     */
    expect(statement.params[descriptionIndex + 1]).toBeNull();
    expect(statement.params).toHaveLength(WRITE_COLUMNS.length + 1);
  });

  it('NET-NEW — saveProductType BINDS a quote-bearing value instead of writing it into the statement text', async () => {
    const harness = createWriteHarness();
    const hostile = "Robert'); DROP TABLE SwProductType; --";

    await harness.repository.saveProductType(transientProductType({ productTypeName: hostile }));

    const statement = soleStatement(harness.calls);

    /*
     * This is the positive form of the D18 note in the header. The importer's legacy statements
     * interpolate values taken from an uploaded file; this write interpolates nothing, so the hostile
     * string appears in the bound array and NOWHERE in the statement text. No hardening exception is
     * being claimed — binding throughout is ordinary compliance, and this case is its evidence.
     */
    expect(statement.params).toContain(hostile);
    expect(statement.sql).not.toContain('DROP TABLE');
    expect(statement.sql).not.toContain("'");
  });

  it('NET-NEW — saveProductType returns the SAME entity instance it was handed, not a copy', async () => {
    const harness = createWriteHarness();
    const productType = transientProductType();

    const returned = await harness.repository.saveProductType(productType);

    /*
     * The caller keeps its reference and reads the minted identifier off it, which is how
     * `ProductService.saveProductType` gets the identifier back. Returning a copy would leave the
     * caller holding a transient entity that reports `isNew()` forever.
     */
    expect(returned).toBe(productType);
  });
});

describe('NET-NEW: MySqlProductTypeRepository.saveProductType — the UPDATE branch', () => {
  /** A persisted product type: a non-empty identifier is what makes `isNew()` answer false. */
  function persistedProductType(): ProductType {
    const productType = transientProductType();
    productType.productTypeID = SUBSCRIPTION_PRODUCT_TYPE_ID;
    return productType;
  }

  it('NET-NEW — PRESERVES the stored identifier and mints no replacement', async () => {
    const harness = createWriteHarness();
    const productType = persistedProductType();

    expect(productType.isNew()).toBe(false);

    await harness.repository.saveProductType(productType);

    /*
     * `generator="uuid"` assigned only while an entity was transient, so an update keeps the
     * identifier its stored row is keyed on. Re-minting here would compose an update whose predicate
     * matched no row, and the write would silently affect nothing.
     */
    expect(productType.productTypeID).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
  });

  it('NET-NEW — emits a SET assignment per writable column and binds the identifier LAST', async () => {
    const harness = createWriteHarness();
    /*
     * A CHILD is used here rather than a root, and the reason is a trap worth naming. For a ROOT
     * product type the materialised ancestry path IS its own identifier, so the identifier legitimately
     * appears in the FIRST bound position as well as the last, and a case asserting "the identifier is
     * not bound first" would fail against correct production code. Giving the entity a parent makes
     * the path `parent,self` and the two positions genuinely distinguishable.
     */
    const parent = new ProductType();
    parent.productTypeID = MERCHANDISE_PRODUCT_TYPE_ID;
    const productType = persistedProductType();
    productType.parentProductType = parent;

    await harness.repository.saveProductType(productType);

    const statement = soleStatement(harness.calls);
    const expectedAssignments = WRITE_COLUMNS.map((column) => `${column} = ?`).join(', ');

    expect(statement.sql).toBe(
      `UPDATE ${PRODUCT_TYPE_TABLE} SET ${expectedAssignments} ` +
        `WHERE ${PRODUCT_TYPE_ID_COLUMN} = ?`,
    );
    /*
     * The identifier is bound LAST here and FIRST on the insert, because an insert LISTS it while an
     * update MATCHES on it. Transposing the two would compose a statement that keys the row on a
     * column value — the single most damaging binding error this member could make.
     */
    expect(statement.params).toHaveLength(WRITE_COLUMNS.length + 1);
    expect(statement.params[statement.params.length - 1]).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
    expect(statement.params[0]).toBe(
      `${MERCHANDISE_PRODUCT_TYPE_ID},${SUBSCRIPTION_PRODUCT_TYPE_ID}`,
    );
  });

  it('NET-NEW — fires the UPDATE hook, refreshing the ancestry path before values are collected', async () => {
    const harness = createWriteHarness();
    const productType = persistedProductType();
    productType.productTypeIDPath = 'stale-path-from-a-former-parent';

    await harness.repository.saveProductType(productType);

    /*
     * `preUpdate` refreshes the same path `preInsert` does, so a re-parented product type's stored
     * ancestry is corrected on every write rather than only at creation. Its first parameter — the
     * pre-image Hibernate used to supply — is passed as `undefined` deliberately: this adapter has no
     * snapshot to offer and composes a full-column assignment rather than a diff, so fabricating one
     * would imply a change-detection capability neither system has.
     */
    expect(productType.productTypeIDPath).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
    const statement = soleStatement(harness.calls);
    expect(statement.params).not.toContain('stale-path-from-a-former-parent');
    expect(statement.params).toContain(SUBSCRIPTION_PRODUCT_TYPE_ID);
  });

  it('NET-NEW — saveProductType refreshes the MODIFIED audit pair without disturbing a stored CREATED pair', async () => {
    const harness = createWriteHarness();
    const productType = persistedProductType();
    const storedCreation = new Date('2019-03-04T05:06:07.000Z');
    productType.createdDateTime = storedCreation;
    productType.createdByAccount = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await harness.repository.saveProductType(productType);

    /*
     * An update stamps only the modified half. Overwriting the created half would rewrite history on
     * every save, and because the update binds a full column assignment the stored creation values
     * have to survive the round trip through the entity to be re-bound unchanged.
     */
    expect(productType.createdDateTime).toBe(storedCreation);
    expect(productType.createdByAccount).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(productType.modifiedByAccount).toBe(TEST_ADMIN_ACCOUNT_ID);
    expect(productType.modifiedDateTime).toBeInstanceOf(Date);

    const statement = soleStatement(harness.calls);
    const createdAtIndex = WRITE_COLUMNS.indexOf(
      assertColumnName(PRODUCT_TYPE_TABLE, 'createdDateTime'),
    );
    /*
     * ⚠️ NO `+ 1` HERE, UNLIKE EVERY INSERT CASE ABOVE, AND THE ASYMMETRY IS THE CONTRACT. An insert
     * binds the identifier FIRST and so shifts every column value one position right; an update binds
     * the writable values from position zero and appends the identifier at the end. Reusing the
     * insert's offset on this path would silently read the NEXT column's value — which is exactly the
     * off-by-one this pair of index expressions exists to keep visible.
     */
    expect(statement.params[createdAtIndex]).toBe(storedCreation);
  });

  it('NET-NEW — saveProductType issues exactly ONE statement, with no read-back probe before it', async () => {
    const harness = createWriteHarness();

    await harness.repository.saveProductType(persistedProductType());

    /*
     * The insert-or-update decision comes from the entity, not from a probe — deliberately unlike
     * `MySqlSkuRepository.persistSku`, which probes because a SKU can arrive carrying an identifier
     * for a row that does not exist yet. A product type reaches this member either freshly
     * constructed or loaded from a row, so `isNew()` answers exactly and a round trip would buy
     * nothing. One statement per save is the observable form of that decision.
     */
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.sql.startsWith('UPDATE ')).toBe(true);
  });

  it('NET-NEW — saveProductType chooses its branch from the ENTITY, so one adapter answers both shapes', async () => {
    const harness = createWriteHarness();

    await harness.repository.saveProductType(transientProductType());
    await harness.repository.saveProductType(persistedProductType());

    /* Two saves, two different statements, from one instance and with no configuration between. */
    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[0]?.sql.startsWith('INSERT INTO ')).toBe(true);
    expect(harness.calls[1]?.sql.startsWith('UPDATE ')).toBe(true);
  });

  it('NET-NEW — saveProductType does not read the affected-row count, so a zero-row update still resolves', async () => {
    const executorDouble = createSqlExecutorDouble({ outcomes: [sqlAffectedRows(0)] });
    const repository = new MySqlProductTypeRepository(
      executorDouble.executor,
      createAccountContextDouble().accountContext,
    );
    const productType = persistedProductType();

    /*
     * The legacy write primitive is declared `void` and reported nothing, so a caller never learned
     * whether a row was present. Resolving on a zero-row acknowledgement preserves that contract; a
     * member that raised here would invent a failure mode the legacy did not have.
     */
    await expect(repository.saveProductType(productType)).resolves.toBe(productType);
  });
});

describe('NET-NEW: MySqlProductTypeRepository.removeProductType — refusal and the DELETE', () => {
  it('NET-NEW — REFUSES a transient entity and issues NO statement at all', async () => {
    const harness = createWriteHarness();
    const productType = transientProductType();

    /*
     * A transient entity carries the empty unsaved identifier, so a removal keyed on it would compose
     * `WHERE productTypeID = ''` — a predicate matching nothing in a sound table and an arbitrary row
     * in an unsound one. Refusing BEFORE composing anything is the observable half, and it is not a
     * hardening: it refuses an input the legacy could not express, rather than one it accepted.
     */
    await expect(harness.repository.removeProductType(productType)).rejects.toThrow(
      /cannot be removed before it has been persisted/,
    );
    expect(harness.calls).toHaveLength(0);
  });

  it('NET-NEW — names the refused product type in the failure context', async () => {
    const harness = createWriteHarness();

    await expect(
      harness.repository.removeProductType(
        transientProductType({ productTypeName: 'Unsaved Type' }),
      ),
    ).rejects.toMatchObject({ context: { productTypeName: 'Unsaved Type' } });
  });

  it('NET-NEW — emits exactly one DELETE keyed on the identifier, bound and not interpolated', async () => {
    const harness = createWriteHarness();
    const productType = transientProductType();
    productType.productTypeID = CONTENT_ACCESS_PRODUCT_TYPE_ID;

    await harness.repository.removeProductType(productType);

    const statement = soleStatement(harness.calls);

    expect(statement.sql).toBe(
      `DELETE FROM ${PRODUCT_TYPE_TABLE} WHERE ${PRODUCT_TYPE_ID_COLUMN} = ?`,
    );
    expect(statement.params).toEqual([CONTENT_ACCESS_PRODUCT_TYPE_ID]);
    /* The identifier is a bound value, so it can never be read as statement syntax (R4). */
    expect(statement.sql).not.toContain(CONTENT_ACCESS_PRODUCT_TYPE_ID);
  });

  it('NET-NEW — removeProductType resolves to undefined and reads no affected-row count', async () => {
    const executorDouble = createSqlExecutorDouble({ outcomes: [sqlAffectedRows(0)] });
    const repository = new MySqlProductTypeRepository(
      executorDouble.executor,
      createAccountContextDouble().accountContext,
    );
    const productType = transientProductType();
    productType.productTypeID = CONTENT_ACCESS_PRODUCT_TYPE_ID;

    /*
     * For a removal the count is exact, but the legacy primitive is declared `void` and reports
     * nothing, so a caller never learned whether a row was present. `void` keeps that contract, and a
     * zero-row acknowledgement is therefore not an error.
     */
    await expect(repository.removeProductType(productType)).resolves.toBeUndefined();
  });

  it('NET-NEW — removeProductType resolves NO acting account, because a removal stamps nothing', async () => {
    const accountDouble = createAccountContextDouble();
    const harness = createWriteHarness(accountDouble);
    const productType = transientProductType();
    productType.productTypeID = CONTENT_ACCESS_PRODUCT_TYPE_ID;

    await harness.repository.removeProductType(productType);

    /*
     * There is no audit stamp on a row that is being deleted, so consulting the account seam would be
     * work with no observable effect — and would couple a removal to a collaborator it does not need.
     */
    expect(accountDouble.callCount()).toBe(0);
  });

  it('NET-NEW — cascades nothing: no child, product or assignment statement accompanies the DELETE', async () => {
    const harness = createWriteHarness();
    const productType = transientProductType();
    productType.productTypeID = CONTENT_ACCESS_PRODUCT_TYPE_ID;
    productType.childProductTypes = [transientProductType()];

    await harness.repository.removeProductType(productType);

    /*
     * Cascade and validation both belong to layers above, which the port records. A product type
     * carrying children still produces exactly ONE statement here — the delete guards that decide
     * whether a removal is permissible at all live in the validation rule set, not in this adapter.
     *
     * ⚠️ THE PRODUCT TABLE IS MATCHED ON A WORD BOUNDARY, NOT AS A SUBSTRING. `SwProductType`
     * CONTAINS `SwProduct`, so a naive `includes(PRODUCT_TABLE)` reports the product table as touched
     * by every statement naming the product-type table and this case would fail against correct code.
     * The trailing boundary is what distinguishes the two names.
     */
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls.every((call) => call.sql.startsWith('DELETE FROM '))).toBe(true);
    const productTableReference = new RegExp(`\\b${PRODUCT_TABLE}\\b`);
    expect(harness.calls.some((call) => productTableReference.test(call.sql))).toBe(false);
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/adapters/catalogAggregates.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/adapters/catalogAggregates.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. Phase 8 folded the production module into `src/adapters/mysql/QueryRunner.ts`; its coverage goes to the
 * smallest remaining adapter host so no single suite absorbs two large folds. The loaders hydrate product
 * types among other associations, which this file's own subject reads.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * Aggregate materialization — INT-02 and DATA-02.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/adapters/mysql/QueryRunner.ts` and the hook it is invoked through in
 * `src/adapters/mysql/SmartListQueryBuilder.execute`.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * Two reported findings were one fault observed at two roots. `SmartListQueryBuilder` projects
 * `<baseAlias>.*` and the row mappers hydrate scalar columns only — `rowMappers.ts` RULE 3 leaves every
 * many-to-one association GENUINELY ABSENT, by design — so before this fix:
 *
 *   INT-02 — a SKU smart list produced SKUs with no `product`, and the Google feed's very first act,
 *            `requireProduct(sku)`, raised for every item. The feed emitted nothing at all.
 *   DATA-02 — an option smart list produced options with no `optionGroup`, and
 *            `SkuService.createSkus` raised at `requireOptionGroupID` for every merchandise product
 *            carrying options.
 *
 * The consumers' guards were never the defect and are not touched. What these cases assert is that the
 * data now arrives complete, so the guards no longer have anything to fire on.
 *
 * ⚠️ THE `defaultSku` CASES ARE THE INTERESTING ONES. `Product.defaultSku` is typed as
 * `ProductDefaultSkuDelegate`, which `Sku` is DELIBERATELY not assignable to — the domain layer records
 * that asymmetry rather than inventing a `getImageDirectory` the legacy `Sku.cfc` never declared. So the
 * loader binds through an injected adapter, and the case below asserts that the binder is actually the
 * thing consulted rather than the entity being quietly cast.
 *
 * NO DATABASE. A recording executor double answers each statement by shape, which is how the sibling
 * adapter suites work and what AAP 0.7.3 standard 6 requires here: no CFML runtime exists and the `Sw*`
 * tables are absent from this repository.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 records that no legacy data-access test exists
 * for this slice, and none exists for the framework smart list either (AAP 0.8.3.7).
 */
describe('test/adapters/catalogAggregates.test.ts — the association loaders that hydrate a selection (folded, F1)', () => {
  /* ================================================================================================
   * MIN-01 — THE ELEMENT TYPE IS DERIVED FROM THE ROOT ENTITY, PINNED HERE RATHER THAN ASSUMED
   * ================================================================================================
   * Every `builder.execute(...)` below passes a query and NO element type, because
   * `SmartListQueryPort.execute` reads the pairing out of `query.entityName` through
   * `SmartListEntityRecordTypes`. These three aliases are what makes that a checked claim in this file:
   * each one fails to compile if a root's record type ever stops being the domain type the port pairs
   * with it — which is exactly what would happen if the signature were loosened back to a caller-chosen
   * parameter and the adapter resumed asserting its mapper's output into it.
   * ============================================================================================== */
  type AssertAssignable<TActual extends TExpected, TExpected> = TActual;
  type _SkuRootYieldsSku = AssertAssignable<SmartListRecord<'SlatwallSku'>, Sku>;
  type _OptionRootYieldsOption = AssertAssignable<SmartListRecord<'SlatwallOption'>, Option>;
  type _ProductRootYieldsProduct = AssertAssignable<SmartListRecord<'SlatwallProduct'>, Product>;

  /** Distinct 32-character identifiers, so a crossed association is visible rather than coincidental. */
  const ID = {
    sku: 'aaaaaaaa000000000000000000000001',
    siblingSku: 'aaaaaaaa000000000000000000000002',
    product: 'bbbbbbbb000000000000000000000001',
    productType: 'cccccccc000000000000000000000001',
    brand: 'dddddddd000000000000000000000001',
    defaultSku: 'eeeeeeee000000000000000000000001',
    option: 'ffffffff000000000000000000000001',
    optionGroup: '99999999000000000000000000000001',
  } as const;

  /** Every statement the builder and the loaders issued, in order. */
  interface Journal {
    readonly statements: { readonly sql: string; readonly params: readonly unknown[] }[];
  }

  /**
   * An executor backed by a tiny in-memory table store that HONOURS THE WHERE CLAUSE.
   *
   * ⚠️ IT HAS TO HONOUR IT, AND THAT IS NOT GOLD-PLATING. Two different statements in these scenarios read
   * `SwSku`: the builder's own record projection, and the loader's `WHERE skuID IN (…)` lookup for a
   * product's DEFAULT SKU. A double that answered both with the same fixture rows would hand the
   * default-SKU lookup the wrong rows, the lookup would miss, and the case asserting that the delegate
   * binder is consulted would fail for a reason that has nothing to do with the code under test. Filtering
   * by the bound parameters is what keeps the double honest about which row a statement asked for.
   */
  function makeExecutor(tables: Readonly<Record<string, readonly MySqlRow[]>>): {
    readonly executor: SqlExecutor;
    readonly journal: Journal;
  } {
    const journal: Journal = { statements: [] };

    const executor: SqlExecutor = {
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        journal.statements.push({ sql, params: [...params] });

        /* The count statement answers with its count column, never with entity rows. */
        if (sql.includes('recordsCount')) {
          return Promise.resolve([{ recordsCount: 1 }]);
        }

        const table = Object.keys(tables).find((name) => new RegExp(`FROM ${name}\\b`).test(sql));
        if (table === undefined) {
          return Promise.resolve([]);
        }
        const rows = tables[table] ?? [];

        /* `WHERE <column> IN (?, …)` — the shape every loader lookup uses. */
        const filter = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql);
        if (filter !== null) {
          const column = filter[1];
          if (column !== undefined) {
            return Promise.resolve(rows.filter((row) => params.includes(row[column])));
          }
        }

        return Promise.resolve([...rows]);
      },
    };

    return { executor, journal };
  }

  /** A binder that records what it was handed and returns a delegate reporting a known price. */
  function makeBinderSpy(price: number): {
    readonly dependencies: CatalogAggregateDependencies;
    readonly boundSkuIds: string[];
  } {
    const boundSkuIds: string[] = [];

    return {
      boundSkuIds,
      dependencies: {
        bindDefaultSkuDelegate: (sku: Sku): ProductDefaultSkuDelegate => {
          boundSkuIds.push(sku.skuID);
          return {
            getCurrencyCode: (): string | undefined => undefined,
            /* F07 — `Sku.price` is exact-decimal text, so the spy's numeric literal is adopted at this
             * boundary rather than handed through as a double. */
            getPrice: (): ExactDecimal | undefined => toExactDecimal(price),
            getRenewalPrice: (): ExactDecimal | undefined => undefined,
            getListPrice: (): ExactDecimal | undefined => undefined,
            getImageDirectory: (): string => '',
            getImagePath: (): string => '',
            getImage: (): string => '',
            getResizedImagePath: (): string => '',
            getImageExistsFlag: (): boolean => false,
          };
        },
      },
    };
  }

  /**
   * Identifies the product-load statement the SKU and option roots' loaders issue.
   *
   * ⚠️ MATCHED ON THE QUALIFIED PROJECTION, AND WRITTEN ONCE FOR A REASON THE TWO NEGATIVE ASSERTIONS
   * BELOW DEPEND ON. `catalogAggregates.projectionFor` qualifies every projected column with its
   * whitelisted table name, so the product load now opens `SELECT SwProduct.productID`. Three inline
   * `startsWith` calls against a stale prefix would leave the two NEGATIVE assertions passing vacuously —
   * a predicate that can never match proves nothing about the statement it claims is absent — so the
   * prefix lives here, where the POSITIVE assertion breaks first and forces the others to stay honest.
   */
  function isProductLoad(sql: string): boolean {
    return sql.startsWith('SELECT SwProduct.productID');
  }

  describe('SmartListQueryBuilder aggregate materialization — INT-02, the SKU root', () => {
    /** A SKU result set whose rows name a product, plus that product's own row and its associations. */
    function skuScenario(): Readonly<Record<string, readonly MySqlRow[]>> {
      return {
        /* ⚠️ THE THREE MONEY COLUMNS ARE STRINGS, NOT NUMBERS, AND THAT IS THE DRIVER CONTRACT RATHER
         * THAN A FIXTURE QUIRK. `model/entity/Sku.cfc:L55-L57` declares them `ormtype="big_decimal"`, and
         * `rowMappers.ts` reads them through `readOptionalExactDecimal`, which REFUSES a JavaScript number
         * because by the time one arrives the exact digits are already gone (F16). Handing a number here
         * would be asserting against a result set the configured pool cannot produce. */
        SwSku: [
          { skuID: ID.sku, skuCode: 'SKU-1', price: '10.00', productID: ID.product },
          { skuID: ID.siblingSku, skuCode: 'SKU-2', price: '20.00', productID: ID.product },
          /* The product's default SKU, which the loader fetches by identifier. */
          { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
        ],
        SwProduct: [
          {
            productID: ID.product,
            productName: 'Feed Product',
            productCode: 'FP',
            productTypeID: ID.productType,
            brandID: ID.brand,
            defaultSkuID: ID.defaultSku,
          },
        ],
        SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
        SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
      };
    }

    it('attaches the product every SKU names, so requireProduct no longer has anything to refuse', async () => {
      const { executor } = makeExecutor(skuScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallSku' });

      /* All three rows in the store belong to this product — the two ordinary SKUs and the default one. */
      expect(result.records).toHaveLength(3);
      for (const sku of result.records) {
        /* Before the fix this key was absent on every record, which is exactly what the feed's guard
         * reported — once per item, for every item. */
        expect(sku.product).toBeDefined();
        expect(sku.product?.productID).toBe(ID.product);
      }
    });

    it('attaches the product type and the brand the product names', async () => {
      const { executor } = makeExecutor(skuScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallSku' });
      const product = result.records[0]?.product;

      expect(product?.productType?.productTypeID).toBe(ID.productType);
      expect(product?.brand?.brandID).toBe(ID.brand);
    });

    /*
     * THE CASE THAT PROVES THE BINDER IS REAL. `Sku` is not assignable to `ProductDefaultSkuDelegate`, so
     * a loader that "attached the default SKU" by casting would compile only with a suppression and would
     * hand the product an object missing four of the nine members the delegate promises. Asserting that
     * the binder was consulted, and that the price reaches the product through it, is what distinguishes a
     * real binding from a cast.
     */
    it('binds the default SKU through the injected adapter, and product.getPrice reads through it', async () => {
      const { executor } = makeExecutor(skuScenario());
      const binder = makeBinderSpy(1234);
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(binder.dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallSku' });
      const product = result.records[0]?.product;

      expect(binder.boundSkuIds).toContain(ID.defaultSku);
      /* `Product.getPrice()` falls through to `defaultSku.getPrice()`, which is the whole reason the
       * default SKU is loaded — the feed's `g:price` reads it. */
      expect(product?.getPrice()).toBe(toExactDecimal(1234));
    });

    it('gives sibling SKUs of one product the SAME product instance', async () => {
      const { executor } = makeExecutor(skuScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallSku' });

      /* ⚠️ DEFINEDNESS IS ASSERTED FIRST, AND DELIBERATELY. `toBe` alone would be satisfied by two
       * `undefined`s, so with the loader removed this case would pass vacuously while asserting nothing —
       * the exact failure mode a mutation check exists to expose. */
      const first = result.records[0]?.product;
      const second = result.records[1]?.product;
      expect(first).toBeDefined();
      expect(second).toBeDefined();

      /* Identity, not equality: the mapping layer's semantics, and what lets a consumer compare by
       * reference. It is also the evidence that one statement served every sibling. */
      expect(first).toBe(second);
    });

    it('issues ONE product statement for a batch that names one product twice', async () => {
      const { executor, journal } = makeExecutor(skuScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      await builder.execute({ entityName: 'SlatwallSku' });

      const productLookups = journal.statements.filter((statement) => isProductLoad(statement.sql));
      /* Two SKUs naming one product, and the builder materialises `records` and `pageRecords` separately —
       * so a naive implementation would issue up to four. De-duplication across the whole invocation is
       * what makes it one. */
      expect(productLookups).toHaveLength(1);
      expect(productLookups[0]?.params).toEqual([ID.product]);
    });

    it('leaves the brand absent when the product names none, without raising', async () => {
      const scenario = {
        ...skuScenario(),
        SwProduct: [
          {
            productID: ID.product,
            productName: 'Unbranded',
            productTypeID: ID.productType,
            brandID: null,
            defaultSkuID: null,
          },
        ],
      };
      const { executor } = makeExecutor(scenario);
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallSku' });
      const product = result.records[0]?.product;

      /* The legacy feed LEFT-joins brand and guards the read, so absence is ordinary data. */
      expect(product).toBeDefined();
      expect(product?.brand).toBeUndefined();
    });

    it('issues no association statement at all for an empty result set', async () => {
      const { executor, journal } = makeExecutor({ SwSku: [] });
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallSku' });

      expect(result.records).toEqual([]);
      /* `IN ()` is not legal SQL and there is nothing to ask for. */
      expect(journal.statements.some((statement) => statement.sql.includes('IN ()'))).toBe(false);
      expect(journal.statements.filter((s) => isProductLoad(s.sql))).toHaveLength(0);
    });

    it('binds every identifier positionally and interpolates none', async () => {
      const { executor, journal } = makeExecutor(skuScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      await builder.execute({ entityName: 'SlatwallSku' });

      for (const statement of journal.statements) {
        expect(statement.sql).not.toContain(ID.product);
        expect(statement.sql).not.toContain(ID.brand);
        expect(statement.sql).not.toContain(ID.productType);
        expect(statement.sql).not.toContain("'");
      }
    });
  });

  describe('SmartListQueryBuilder aggregate materialization — DATA-02, the option root', () => {
    it('attaches the required option group, so requireOptionGroupID no longer refuses', async () => {
      const { executor } = makeExecutor({
        SwOption: [{ optionID: ID.option, optionName: 'Large', optionGroupID: ID.optionGroup }],
        SwOptionGroup: [{ optionGroupID: ID.optionGroup, optionGroupCode: 'size' }],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallOption' });

      /* `model/entity/Option.cfc:L59` declares this relationship REQUIRED. Before the fix it was absent on
       * every hydrated option, so every merchandise SKU creation carrying options raised. */
      expect(result.records[0]?.optionGroup).toBeDefined();
      expect(result.records[0]?.optionGroup?.optionGroupID).toBe(ID.optionGroup);
      expect(result.records[0]?.optionGroup?.optionGroupCode).toBe('size');
    });

    it('needs no delegate binder to resolve, since an option group is loaded whole', async () => {
      const { executor, journal } = makeExecutor({
        SwOption: [{ optionID: ID.option, optionGroupID: ID.optionGroup }],
        SwOptionGroup: [{ optionGroupID: ID.optionGroup, optionGroupCode: 'size' }],
      });
      const binder = makeBinderSpy(42);
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(binder.dependencies),
      );

      await builder.execute({ entityName: 'SlatwallOption' });

      /* The option root touches no product and therefore no default SKU. */
      expect(binder.boundSkuIds).toEqual([]);
      expect(journal.statements.some((s) => isProductLoad(s.sql))).toBe(false);
    });

    it('leaves the group absent when the column is empty, deferring to the consumer guard', async () => {
      const { executor } = makeExecutor({
        SwOption: [{ optionID: ID.option, optionGroupID: '' }],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallOption' });

      /* `unsavedvalue=""` means the empty string spells absence, so no `WHERE id = ''` is issued. The
       * consumer's own guard reports it with the option identifier and the legacy locator, which is a
       * better error than this loader could produce. */
      expect(result.records[0]).toBeDefined();
      expect(result.records[0]?.optionGroup).toBeUndefined();
    });
  });

  describe('SmartListQueryBuilder aggregate materialization — DATA-03, the product root', () => {
    /** A single product row plus every row its four associations need. */
    function productScenario(): Readonly<Record<string, readonly MySqlRow[]>> {
      return {
        SwProduct: [
          {
            productID: ID.product,
            productName: 'Feed Product',
            productCode: 'FP',
            productTypeID: ID.productType,
            brandID: ID.brand,
            defaultSkuID: ID.defaultSku,
          },
        ],
        SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
        SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
        /* Money columns are strings for the reason stated on the SKU scenario above (F16). */
        SwSku: [
          { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
          { skuID: ID.sku, skuCode: 'SKU-1', price: '10.00', productID: ID.product },
        ],
      };
    }

    it('attaches the productType, brand, defaultSku and skus a product aggregate needs', async () => {
      const { executor } = makeExecutor(productScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallProduct' });
      const product = result.records[0];

      /* The four associations DATA-03 named as missing from `ProductService.getProduct`. */
      expect(product?.productType?.productTypeID).toBe(ID.productType);
      expect(product?.brand?.brandID).toBe(ID.brand);
      expect(product?.defaultSku?.getPrice()).toBe(toExactDecimal(99));
      expect(product?.getSkus()).toHaveLength(2);
    });

    it('gives every SKU in the collection a back-reference to the product that owns it', async () => {
      const { executor } = makeExecutor(productScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallProduct' });
      const product = result.records[0];
      const skus = product?.getSkus() ?? [];

      expect(product).toBeDefined();
      expect(skus).toHaveLength(2);
      for (const member of skus) {
        /* Definedness asserted first, so `toBe` cannot be satisfied by two `undefined`s. */
        expect((member as Sku).product).toBeDefined();
        expect((member as Sku).product).toBe(product);
      }
    });

    /*
     * ⭐ THE IDENTITY CASE, AND ITS PREMISE WAS REVERSED ON PURPOSE. It was written when `records` and
     * `pageRecords` were materialised into DISTINCT objects for the same row, and it asserted that no SKU
     * object was shared between the two graphs — the mistake it policed being a loader that pushed one
     * SKU instance onto both collections, leaving `records[0].getSkus()[0].product` pointing at
     * `pageRecords[0]`.
     *
     * Materialisation now runs both result sets through ONE identity map, so a row seen twice yields ONE
     * instance — which is what a single Hibernate session guaranteed, and which matters here because
     * `manageEntity` installs a FRESH error bag per mapping: two instances for one row would split the
     * findings §0.6.2's validation reads back. Sharing is therefore the CONTRACT now, not the defect.
     *
     * The case keeps its real subject by inverting the assertion. What must not happen is an owner that
     * appears in BOTH collections having its aggregate loaded TWICE: the loader mutates what it is handed,
     * so a product offered once per collection came back holding FOUR SKUs instead of two. That is the
     * defect this now fails on, and on no other.
     */
    it('loads a shared owner ONCE, even when it appears in both collections', async () => {
      const { executor } = makeExecutor(productScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      );

      /*
       * ⚠️ THE PAGE IS ASKED FOR FROM THE SECOND ROW ON PURPOSE, AND THAT IS WHAT MAKES THIS CASE MEAN
       * ANYTHING. The builder skips the page statement and reuses the unpaged collection when the page
       * window provably covers every row in hand — `pageRecordsStart === 1 && recordCount <= show` — and
       * this scenario has a single product row, so a default query would take that path and hand back the
       * SAME array for both collections — the loader would then be offered the owner ONCE and the
       * double-append this case polices could not occur, so the case would pass while proving nothing. A
       * start of two puts the page on its own statement, which is the situation the loader has to get
       * right: two offers of one owner, one aggregate.
       */
      const result = await builder.execute({
        entityName: 'SlatwallProduct',
        pagination: { pageRecordsStart: 2 },
      });
      const fromRecords = result.records[0];
      const fromPageRecords = result.pageRecords[0];

      expect(fromRecords).toBeDefined();
      expect(fromPageRecords).toBeDefined();
      /* ONE instance for one row, across both result sets. The identity map's contract. */
      expect(fromRecords).toBe(fromPageRecords);

      /*
       * ⭐ TWO, NOT FOUR. The scenario holds two SKU rows for this product, and the product was offered to
       * the loader from the unpaged collection AND from the page. Appending per offer would double the
       * collection while every other assertion here still passed.
       */
      expect(fromRecords?.getSkus()).toHaveLength(2);

      /* And the SKUs are the SAME instances through either handle, since there is only one graph. */
      const recordSkus = fromRecords?.getSkus() ?? [];
      const pageSkus = fromPageRecords?.getSkus() ?? [];
      expect(recordSkus).toStrictEqual(pageSkus);
      for (const member of recordSkus) {
        expect((member as Sku).product).toBeDefined();
        expect((member as Sku).product).toBe(fromRecords);
      }
    });

    it('issues ONE SKU collection statement for the whole invocation', async () => {
      const { executor, journal } = makeExecutor(productScenario());
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      );

      await builder.execute({ entityName: 'SlatwallProduct' });

      const collectionReads = journal.statements.filter((statement) =>
        /FROM SwSku WHERE productID IN \(/.test(statement.sql),
      );
      /* One product named twice — once by `records`, once by `pageRecords` — is still one identifier. */
      expect(collectionReads).toHaveLength(1);
      expect(collectionReads[0]?.params).toEqual([ID.product]);
    });

    it('leaves a product with no SKU rows carrying an empty collection, without raising', async () => {
      const scenario = { ...productScenario(), SwSku: [] };
      const { executor, journal } = makeExecutor(scenario);
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallProduct' });

      expect(result.records[0]?.getSkus()).toEqual([]);

      /* ⚠️ THE SLOT IS NOT EMPTY, AND THE ASSERTION THAT IT WAS DESCRIBED A DIFFERENT FIXTURE.
       * This scenario keeps `productScenario()`'s product row — which CARRIES `defaultSkuID` — and empties
       * `SwSku`. That is a DANGLING foreign key, not "a product with no SKUs yet"; a product with no SKUs
       * yet has `defaultSkuID` NULL, and for that row the slot genuinely is absent.
       *
       * `rowMappers.ts` rule 3a fills the slot with an identifier-only REFERENCE whenever the row names
       * one, and the loader above assigns a bound delegate only when it actually resolved a SKU — so an
       * unresolvable identifier leaves the reference in place. That is the safe outcome and the one this
       * suite wants: the identifier survives, so writing the product back cannot NULL the column, while
       * every VALUE read refuses instead of answering a fabricated price. `Product.getPrice()` falls
       * through to this delegate, so an empty slot here would let a corrupt row render as a free product.
       */
      const unresolved = result.records[0]?.defaultSku;
      expect(unresolved).toBeDefined();
      expect(readProductDefaultSkuId(unresolved ?? {})).toBe(ID.defaultSku);
      expect(() => unresolved?.getPrice()).toThrow();

      expect(journal.statements.some((statement) => statement.sql.includes('IN ()'))).toBe(false);
    });
  });

  describe('SmartListQueryBuilder aggregate materialization — the roots that declare no loader', () => {
    it('hydrates a brand root with no extra statement, because Brand declares no many-to-one', async () => {
      const { executor, journal } = makeExecutor({
        SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      const result = await builder.execute({ entityName: 'SlatwallBrand' });

      expect(result.records).toHaveLength(1);
      /*
       * TWO statements and no more, and the point of the case is the "no more". A root with nothing to
       * resolve declares no loader — a decision per root rather than a fallback — so NO aggregate
       * statement is issued on top of the query's own.
       *
       * Why two rather than three: the page statement is legitimately skipped here. This root returns a
       * single row and the page window starts at one, so the window provably covers every row already in
       * hand and the builder reuses the unpaged collection as the page instead of re-reading it. The count
       * is still counted through its own dedicated statement, never inferred from the collection's length,
       * which is the asymmetry the port's contract insists on.
       */
      expect(journal.statements).toHaveLength(2);
    });
  });

  /*
   * ===================================================================================================
   * F2 — THE JOINED OPTION FETCH, ASSERTED ON ITS STATEMENT TEXT RATHER THAN ON ITS OBJECTS
   * ===================================================================================================
   * These cases exist because a whole class of defect was invisible to this suite. Every case above
   * asserts on hydrated OBJECTS, and an in-memory double answers whatever shape it is asked for, so a
   * statement no server would accept still produced a green run. `attachSkuOptions` — the port of
   * `model/dao/SkuDAO.cfc:L157`'s `INNER JOIN FETCH sku.options`, and the only JOIN in the module — was
   * emitting `SELECT link.skuID, optionID, …` with the option's own columns UNQUALIFIED. Both joined
   * tables declare `optionID`, so MySQL refused the statement outright:
   *
   *   ER_NON_UNIQ_ERROR (1052): Column 'optionID' in field list is ambiguous
   *
   * That made `SkuRepository.findByProduct(product, true)` — and through it `SkuService.getProductSkus`
   * with the fetch flag raised, an AAP 0.4.2.2 public member — non-functional against the real `Sw*`
   * schema on EVERY invocation, while 779 tests stayed green.
   *
   * So these cases read the SQL rather than the objects, which is the half of the gate a suite with no
   * database can hold. The other half was executed against MySQL 8.4.11 in a disposable schema shaped
   * from the legacy column declarations, where the same statement failed before this fix and succeeds
   * after it.
   *
   * ⚠️ THE LAST CASE IS THE ONE THAT CLOSES THE CLASS. The `*_PROJECTION` constants are shared across
   * every loader in the module, so qualifying only the join would leave the next join to be written
   * carrying the same fault. It asserts that NO projection this module emits is bare, wherever it
   * appears — which is the property {@link projectionFor} now guarantees by construction.
   *
   * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 records that no legacy data-access test
   * exists for this slice.
   */
  describe('F2 — the joined option fetch emits a statement a real server accepts', () => {
    /**
     * Runs the joined option fetch for two SKUs that share one option.
     *
     * ⚠️ THE `SwSkuOption` FIXTURE ROWS CARRY THE OPTION'S COLUMNS TOO, and that is the join being
     * modelled rather than a fixture shortcut: the double resolves a statement to ONE table by its `FROM`
     * clause, so for a joined read the row it returns has to be the JOINED row — the link table's `skuID`
     * alongside the option's own columns, which is exactly what the server hands back.
     */
    async function fetchOptions(): Promise<{
      readonly journal: Journal;
      readonly skus: readonly Sku[];
    }> {
      const { executor, journal } = makeExecutor({
        SwSkuOption: [
          {
            skuID: ID.sku,
            optionID: ID.option,
            optionName: 'Small',
            optionGroupID: ID.optionGroup,
          },
          {
            skuID: ID.siblingSku,
            optionID: ID.option,
            optionName: 'Small',
            optionGroupID: ID.optionGroup,
          },
        ],
        SwOptionGroup: [{ optionGroupID: ID.optionGroup, optionGroupCode: 'size' }],
      });

      const skus = [buildSku({ skuID: ID.sku }), buildSku({ skuID: ID.siblingSku })];
      await attachSkuOptions(executor, skus);

      return { journal, skus };
    }

    /** The one joined statement in the module, located by its `INNER JOIN` rather than by position. */
    function joinedStatement(journal: Journal): {
      readonly sql: string;
      readonly params: readonly unknown[];
    } {
      const statement = journal.statements.find((candidate) =>
        candidate.sql.includes('INNER JOIN SwOption'),
      );
      if (statement === undefined) {
        throw new Error('the joined option fetch was never issued');
      }
      return statement;
    }

    /** The projected identifier list of a statement, or an empty string when it projects none. */
    function projectionOf(sql: string): string {
      return /^SELECT (.*?) FROM /.exec(sql)?.[1] ?? '';
    }

    it('qualifies EVERY projected column, so the field list carries no bare identifier', async () => {
      const { journal } = await fetchOptions();
      const projected = projectionOf(joinedStatement(journal).sql).split(', ');

      /*
       * Read off the statement rather than compared against a literal list, so the assertion stays true
       * as the option's column set grows: `link.` is the link table's alias and `SwOption.` is the
       * whitelisted table name, and those are the only two qualifiers this statement may carry.
       */
      expect(projected.length).toBeGreaterThan(1);
      for (const column of projected) {
        expect(column).toMatch(/^(?:link|SwOption)\.[A-Za-z]+$/);
      }
    });

    it('never projects a bare `optionID`, the column both joined tables declare', async () => {
      const { journal } = await fetchOptions();
      const projection = projectionOf(joinedStatement(journal).sql);

      /* The exact shape MySQL rejected: `optionID` with nothing in front of it. */
      expect(projection.split(', ')).not.toContain('optionID');
      expect(projection).toContain('SwOption.optionID');
      expect(projection).toContain('link.skuID');
    });

    it('binds one placeholder per requested SKU and interpolates no value', async () => {
      const { journal } = await fetchOptions();
      const statement = joinedStatement(journal);

      /* TR-4 — placeholder count equals parameter count, and every value travels as a parameter. */
      expect((statement.sql.match(/\?/g) ?? []).length).toBe(statement.params.length);
      expect(statement.params).toEqual([ID.sku, ID.siblingSku]);
      expect(statement.sql).not.toContain(ID.sku);
      expect(statement.sql).not.toContain(ID.siblingSku);
      expect(statement.sql).not.toContain("'");
    });

    it('hydrates the options AND their groups onto every SKU that owns them', async () => {
      const { skus } = await fetchOptions();

      expect(skus).toHaveLength(2);
      for (const sku of skus) {
        expect(sku.options).toHaveLength(1);
        /* The group comes with the option because the members that matter read through it:
         * `Sku.generateImageFileName` reads `option.getOptionGroup().getImageGroupFlag()`
         * [model/entity/Sku.cfc:L134]. */
        expect(sku.options[0]?.optionGroup?.optionGroupCode).toBe('size');
      }
    });

    it('qualifies the single-table loaders too, so no shared projection is a join hazard', async () => {
      const { executor, journal } = makeExecutor({
        SwProduct: [
          {
            productID: ID.product,
            productName: 'Feed Product',
            productTypeID: ID.productType,
            brandID: ID.brand,
            defaultSkuID: ID.defaultSku,
          },
        ],
        SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
        SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
        SwSku: [
          { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
        ],
      });
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      );

      await builder.execute({ entityName: 'SlatwallProduct' });

      /*
       * The product root exercises four of the module's five projection constants in one pass. The
       * builder's own record statement projects the base alias with a star and the count statement
       * projects an aggregate, so neither names a column and both are excluded — what remains is exactly
       * the loader statements, every one of which must qualify.
       */
      const projections = journal.statements
        .map((statement) => projectionOf(statement.sql))
        .filter((projection) => projection !== '' && !projection.includes('*'))
        .filter((projection) => !projection.includes('recordsCount'));

      expect(projections.length).toBeGreaterThan(0);
      for (const projection of projections) {
        for (const column of projection.split(', ')) {
          expect(column).toMatch(/^[A-Za-z]+\.[A-Za-z]+$/);
        }
      }
    });
  });

  /* =================================================================================================
   * RELATIONSHIP HYDRATION REACHED THROUGH THE SYNTHESIZED SERVICE MEMBERS — REVIEW FINDING 15
   * -------------------------------------------------------------------------------------------------
   * RESTORED COVERAGE. Four hydration/identity-map cases were dropped when the suite was reorganised and
   * the review found no replacement for them. They are restored here because this file owns hydration;
   * the eight builder cases dropped alongside them are restored in
   * `test/adapters/SmartListQueryBuilder.test.ts`.
   *
   * WHY THEY ARE NOT COVERED BY THE `DATA-02` BLOCK ABOVE. That block drives `builder.execute()` directly
   * and asserts the INJECTED loader for the option root. These four enter through
   * `OptionService.getOption`, `getOptionGroup` and `getOptionSmartList` — synthesized CRUD members
   * (AAP §0.1.1.3 IR-1) with no declaration anywhere in the legacy source — and they exercise the
   * builder's OWN built-in relationship pass, which is a different mechanism reached by a different code
   * path. `createCatalogAggregateLoaders` declares `SlatwallOptionGroup: undefined` deliberately, so the
   * option-group root's `options` collection is loaded by `hydrateOptionGroupOptions` and by nothing in
   * this file's other blocks. Two of the four assert the INVERSE direction and the identity map, neither
   * of which appears anywhere above.
   *
   * ⚠️ NO SMART-LIST DOUBLE IS USED, AND THAT IS THE POINT. A double can model correct relationships while
   * the production adapter does not, and would then report success no matter what the adapter did. A REAL
   * {@link SmartListQueryBuilder} is constructed over a one-method executor, so production statement
   * composition, production row mappers and the production hydrator all run. The executor routes on the
   * owner-key alias — a projection only an association statement carries — so the routing itself is what
   * asserts that a SECOND statement was issued at all.
   * ================================================================================================*/

  describe('OptionService relationship hydration through the real builder (finding 15)', () => {
    const OPTION_GROUP_ROW = Object.freeze({
      optionGroupID: ID.optionGroup,
      optionGroupName: 'Size',
      optionGroupCode: 'size',
      imageGroupFlag: 1,
      sortOrder: 1,
    });

    /** The option repository is genuinely unreached by these members, so it refuses rather than pretends. */
    const UNREACHED_OPTION_REPOSITORY = {
      findUnusedOptions: (): never => {
        throw new Error('the option repository is not reached by a synthesized get member');
      },
      findUnusedOptionGroups: (): never => {
        throw new Error('the option repository is not reached by a synthesized get member');
      },
    } as unknown as ConstructorParameters<typeof OptionService>[0];

    /**
     * Routes statements by SHAPE, because the two roots these cases exercise are hydrated by two DIFFERENT
     * mechanisms and a fixture that conflated them would prove nothing about either.
     *
     * ⭐ THIS IS THE ONE PLACE THE RESTORED CASES HAD TO BE ADAPTED TO THE CURRENT API SURFACE, so it is
     * worth naming precisely. When these cases were originally written, BOTH roots went through the
     * builder's built-in relationship pass, and one route on the owner-key alias served both. Today:
     *
     *   • `SlatwallOption` is hydrated by the INJECTED loader `loadOptionAggregates`, which collects the
     *     `optionGroupID` foreign key off the option rows and issues
     *     `SELECT … FROM SwOptionGroup WHERE optionGroupID IN (…)` — no owner-key alias anywhere.
     *   • `SlatwallOptionGroup` declares `undefined` in `createCatalogAggregateLoaders`, so its `options`
     *     collection is loaded by the builder's own `hydrateOptionGroupOptions`, whose statement DOES
     *     project `smartListAssociationOwnerKey`.
     *
     * Both are still a SECOND statement issued to resolve a relationship the row mapper left absent, which
     * is what the restored cases assert; only the statement's shape differs. Routing on both shapes keeps
     * every original assertion intact instead of weakening one to fit the other.
     */
    function makeService(spec: {
      readonly entityRows: readonly MySqlRow[];
      /** Answers the built-in pass — the OptionGroup root's `options` collection. */
      readonly associationRows?: readonly MySqlRow[];
      /** Answers the injected loader's foreign-key lookup — the Option root's `optionGroup`. */
      readonly optionGroupRows?: readonly MySqlRow[];
    }): { readonly service: OptionService; readonly statements: string[] } {
      const statements: string[] = [];
      const executor: SqlExecutor = {
        execute: (sql: string): Promise<MySqlRow[]> => {
          statements.push(sql);
          if (sql.includes('smartListAssociationOwnerKey')) {
            return Promise.resolve([...(spec.associationRows ?? [])]);
          }
          if (sql.includes('recordsCount')) {
            return Promise.resolve([{ recordsCount: spec.entityRows.length }]);
          }
          /* The injected loader's lookup. The ` IN (` test is what separates it from the OptionGroup root's
           * own BASE record statement, which also reads `FROM SwOptionGroup` but carries no WHERE clause —
           * without that test, case three's base statement would be answered with group-association rows. */
          if (/FROM SwOptionGroup\b/.test(sql) && sql.includes(' IN (')) {
            return Promise.resolve([...(spec.optionGroupRows ?? [])]);
          }
          return Promise.resolve([...spec.entityRows]);
        },
      };
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      );

      return { service: new OptionService(UNREACHED_OPTION_REPOSITORY, builder), statements };
    }

    /** The second statement, whichever mechanism issued it. */
    function issuedARelationshipStatement(statements: readonly string[]): boolean {
      return statements.some(
        (sql) =>
          sql.includes('smartListAssociationOwnerKey') ||
          (/FROM SwOptionGroup\b/.test(sql) && sql.includes(' IN (')),
      );
    }

    it('getOption hydrates optionGroup, and a SECOND statement is issued to do it', async () => {
      const { service, statements } = makeService({
        entityRows: [
          {
            optionID: ID.option,
            optionName: 'Small',
            optionCode: 'sm',
            sortOrder: 1,
            optionGroupID: ID.optionGroup,
          },
        ],
        optionGroupRows: [{ ...OPTION_GROUP_ROW }],
      });

      const option = await service.getOption(ID.option);

      /* `model/entity/Option.cfc:L59` declares the relationship, and `rowMappers.ts` RULE 3 deliberately
       * leaves it unresolved — so without the hydration pass this is `undefined` and every merchandise SKU
       * creation carrying options raises at `requireOptionGroupID`. */
      expect(option?.optionGroup).toBeDefined();
      expect(option?.optionGroup?.optionGroupID).toBe(ID.optionGroup);
      expect(option?.optionGroup?.optionGroupName).toBe('Size');
      /* The chain `Sku.hasOneOptionPerOptionGroup` walks — `model/entity/Sku.cfc:L772-L784`. The port reads
       * the FIELD rather than an accessor, because `Option` declares `setOptionGroup` and no getter: the
       * CFML accessor is one the ORM synthesizes. */
      expect(issuedARelationshipStatement(statements)).toBe(true);
      /* And it really is a SECOND statement, not the base one doing double duty. */
      expect(statements.length).toBeGreaterThan(1);
    });

    it('a NULL foreign key leaves optionGroup ABSENT rather than stubbed', async () => {
      /* `SwOption.optionGroupID` carries no `notnull` in the mapping, so a row with no value is possible.
       * RULE 3 forbids a stub precisely because `option.getOptionGroup().getImageGroupFlag()` would read a
       * CLASS DEFAULT off one — the association must be absent, not an object answering `false`.
       *
       * ⭐ THE COLUMN IS OMITTED ENTIRELY HERE, which is a different input from the empty string the
       * `DATA-02` block above exercises. An INNER join returns no row for either, so both must reach the
       * same absent outcome by the same path — and asserting only one of the two would leave the other
       * free to start stubbing. */
      const { service, statements } = makeService({
        entityRows: [{ optionID: ID.option, optionName: 'Small', optionCode: 'sm', sortOrder: 1 }],
      });

      const option = await service.getOption(ID.option);

      expect(option).not.toBeNull();
      /* No key was collected, so no lookup was even attempted — the absence costs nothing. */
      expect(issuedARelationshipStatement(statements)).toBe(false);
      expect(option?.optionGroup).toBeUndefined();
    });

    it("getOptionGroup hydrates options in the declared sortOrder, and sets each option's group back", async () => {
      /* `model/entity/OptionGroup.cfc:L70` declares `orderby="sortOrder"`, so ORDER IS BEHAVIOUR here —
       * unlike `Sku.options`, which declares no `orderby` at all. The statement asks the database for that
       * order, so the rows arrive in it; this asserts the collection preserves what it was given. */
      const { service } = makeService({
        entityRows: [{ ...OPTION_GROUP_ROW }],
        associationRows: [
          {
            smartListAssociationOwnerKey: ID.optionGroup,
            optionID: 'ffffffff000000000000000000000011',
            optionName: 'Small',
            optionCode: 'sm',
            sortOrder: 1,
          },
          {
            smartListAssociationOwnerKey: ID.optionGroup,
            optionID: 'ffffffff000000000000000000000012',
            optionName: 'Medium',
            optionCode: 'md',
            sortOrder: 2,
          },
        ],
      });

      const group = await service.getOptionGroup(ID.optionGroup);

      /* The D14 site indexes `options[1]` — `model/service/ProductService.cfc:L115-L119`. With an empty
       * collection that carried-over defect is not even reproducible, which is why this assertion is on the
       * ORDER and not merely on the length. */
      expect(group?.options.map((option) => option.optionID)).toEqual([
        'ffffffff000000000000000000000011',
        'ffffffff000000000000000000000012',
      ]);
      /* Both directions consistent, as one Hibernate session would give — and BY REFERENCE, so what is
       * asserted is the identity map rather than a value copy. */
      expect(group?.options[0]?.optionGroup).toBe(group);
      expect(group?.options[1]?.optionGroup).toBe(group);
    });

    it('two options of one group share ONE OptionGroup instance (the identity map)', async () => {
      /* One instance per identifier per read is what a single Hibernate session gives, and it is what makes
       * `===` between two references to the same row meaningful. Two separate instances would also mean the
       * row had been managed twice, which installs a FRESH error bag and discards anything already
       * accumulated on it. */
      const { service } = makeService({
        entityRows: [
          {
            optionID: ID.option,
            optionName: 'Small',
            optionCode: 'sm',
            sortOrder: 1,
            optionGroupID: ID.optionGroup,
          },
          {
            optionID: 'ffffffff000000000000000000000002',
            optionName: 'Medium',
            optionCode: 'md',
            sortOrder: 2,
            optionGroupID: ID.optionGroup,
          },
        ],
        /* ONE group row for TWO options, which is what makes the identity assertion meaningful: the loader
         * de-duplicates the foreign keys into a single `IN (…)` lookup and must hand both options the same
         * instance built from that one row. */
        optionGroupRows: [{ ...OPTION_GROUP_ROW }],
      });

      const result = await service.getOptionSmartList();

      expect(result.records).toHaveLength(2);
      const [first, second] = result.records;
      expect(first?.optionGroup).toBeDefined();
      expect(first?.optionGroup).toBe(second?.optionGroup);
    });
  });
});
