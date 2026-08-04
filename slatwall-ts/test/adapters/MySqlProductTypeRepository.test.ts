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
import { DomainError } from '../../src/errors/DomainError';
import {
  assertRegisteredColumnName,
  assertRegisteredTableName,
  assertWriteTableName,
  columnsForTable,
  registeredTableScopes,
  tableScope,
} from '../../src/adapters/mysql/QueryRunner';
import type {
  PhysicalTableName,
  RegisteredTableName,
  TableScope,
} from '../../src/adapters/mysql/QueryRunner';

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
     * the folded persistence section of `test/adapters/MySqlProductRepository.test.ts` ("the parent
     * round trip (rule 3b)"), which is where it belongs — this member is a read, and this file's own
     * surface is closed at `findAllForTree`.
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
     * proved in the folded persistence section of `test/adapters/MySqlProductRepository.test.ts` ("the
     * parent round trip (rule 3b)").
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
 * FOLDED IN FROM `test/adapters/schemaScopeRegistry.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites and AAP §0.3.1 freezes the subtree at the file inventory it enumerates;
 * `test/adapters/schemaScopeRegistry.test.ts` was in neither, so a review pass recorded it as an
 * eighteenth suite and a hundred-and-third tracked file running outside the declared plan. The coverage
 * was never the problem — the file's existence was — so the cases are folded into an approved suite,
 * unchanged, and the standalone file is gone.
 *
 * ⭐ WHY THIS HOST. The subject is the identifier registry of `src/adapters/mysql/QueryRunner.ts`, which
 * every adapter in the layer resolves its table and column names through. This suite already routes its
 * own expectations through `assertTableName` and `assertColumnName` — see `PRODUCT_TYPE_TABLE` and
 * `PRODUCT_TABLE` above — so the gates it depends on are now asserted in the same place, and it is the
 * smallest remaining adapter host, so no single suite absorbs two large folds.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every constant,
 * type and helper the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations; its imports were merged into this file's import block.
 * Not one assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * The ratified database surface — review finding SEC-SQL-SCOPE-01 (CWE-284, CWE-250).
 *
 * ⭐⭐ WHY THIS SUITE EXISTS AS ITS OWN FILE. The finding's resolution asks that the schema surface be
 * "ratified", that least-privilege credentials be provisioned from it, and that "every emitted table/column
 * pass one auditable registry". A registry nobody can enumerate cannot be ratified, and a classification
 * nothing asserts is a comment. These cases are the audit: they census the registry, prove each gate admits
 * exactly what its class permits, and pin the two names whose correct treatment is counter-intuitive.
 *
 * ⚠️ EVERY CASE HERE IS **NET-NEW**. AAP §0.6.5.2 records that no `SkuDAOTest`, `OptionDAOTest` or any other
 * legacy DAO test exists, so there is no legacy coverage of identifier validation to extend — the legacy has
 * no identifier validation to cover, which is the point: `model/dao/ProductDAO.cfc` interpolates 21
 * statements directly (defect D18). Labelled per AAP §0.8.3.7 rather than implying parity.
 *
 * ⚠️ THESE CASES TOUCH NO DATABASE. Every function under test refuses or resolves before any statement text
 * exists, which is precisely the property being asserted: a refusal must happen at composition, before a
 * connection is involved and before an over-granted deployment could let it through.
 */
describe('test/adapters/schemaScopeRegistry.test.ts — the ratified database surface every adapter in this layer resolves its identifiers through (folded, F1)', () => {
  /* ================================================================================================
   * THE CENSUS THIS SUITE RATIFIES
   * ==============================================================================================
   * Written out here INDEPENDENTLY of the implementation — as literal strings, not derived from
   * `registeredTableScopes()` — because a census computed from the thing it audits proves nothing. Adding a
   * table to `TABLE_SCOPES` without amending this block fails the first case below, which is the whole
   * mechanism by which the surface cannot grow unremarked.
   *
   * Each entry cites the legacy declaration it was read from and the statement that reaches it, so a reviewer
   * can re-verify necessity rather than take the list on trust.
   * ============================================================================================== */

  /** AAP §0.2.1.2 names exactly these seven as the Catalog boundary. Fully writeable. */
  const CATALOG_CORE: readonly string[] = [
    'SwProduct',
    'SwSku',
    'SwProductType',
    'SwBrand',
    'SwOption',
    'SwOptionGroup',
    'SwSkuOption',
  ];

  /**
   * Link tables whose OWNING side is an in-scope entity even though the far side is not.
   *
   * `model/entity/Sku.cfc:L77-L79` declares the first three; `model/entity/Product.cfc:L81` declares the
   * fourth, the one of that entity's ten many-to-many collections with `SwProduct` on both sides.
   */
  const CATALOG_OWNED_LINK: readonly string[] = [
    'SwSkuAccessContent',
    'SwSkuSubsBenefit',
    'SwSkuRenewalSubsBenefit',
    'SwRelatedProduct',
  ];

  /**
   * The ONE cross-domain table this service writes.
   *
   * `model/dao/ProductDAO.cfc:L244` UPDATEs it and `:L250` INSERTs it, from the importer's custom-attribute
   * step. AAP §0.4.1.7 keeps the importer's behaviour, so the write is required rather than incidental.
   */
  const CROSS_DOMAIN_WRITE: readonly string[] = ['SwAttributeValue'];

  /** Excluded families reached only to answer a question. */
  const CROSS_DOMAIN_READ_ONLY: readonly string[] = [
    /* `model/dao/SkuDAO.cfc:L103` — the SKU-code fallback. */
    'SwAlternateSkuCode',
    /* `model/dao/SkuDAO.cfc:L159` — the non-fetching join. */
    'SwSubscriptionTerm',
    /* `model/dao/SkuDAO.cfc:L53-L98` — the ten-way existence chain. */
    'SwStock',
    'SwOrderItem',
    'SwInventory',
    'SwOrderDeliveryItem',
    'SwPhysicalCountItem',
    'SwStockAdjustmentDeliveryItem',
    'SwStockAdjustmentItem',
    'SwStockHold',
    'SwStockReceiverItem',
    'SwVendorOrderItem',
    /* `model/dao/ProductDAO.cfc:L52-L62` — the attribute-set selection. */
    'SwAttributeSet',
    'SwAttribute',
    'SwAttributeSetProductType',
    'SwType',
  ];

  /** Every writeable name, of any class. */
  const WRITEABLE: readonly string[] = [
    ...CATALOG_CORE,
    ...CATALOG_OWNED_LINK,
    ...CROSS_DOMAIN_WRITE,
  ];

  /** The whole ratified surface. */
  const ALL_REGISTERED: readonly string[] = [...WRITEABLE, ...CROSS_DOMAIN_READ_ONLY];

  /**
   * Runs a call expected to be refused and returns the error it threw.
   *
   * Returns rather than asserts so each caller can additionally inspect the `context`, which is where the
   * classification that justifies a refusal is reported.
   *
   * @param act - the call under test.
   * @returns the {@link DomainError} it threw.
   */
  function refusalOf(act: () => unknown): DomainError {
    let captured: unknown;

    try {
      act();
    } catch (error: unknown) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(DomainError);

    return captured as DomainError;
  }

  describe('SEC-SQL-SCOPE-01 — the ratified surface is enumerable, which is what makes it ratifiable', () => {
    it('[NET-NEW] registeredTableScopes() reports exactly the twenty-eight ratified names', () => {
      const reported = registeredTableScopes().map(([name]) => name);

      /* Compared as SETS, so a reordering of the declaration is not a failure while an ADDITION or a REMOVAL
       * is. The order `TABLE_SCOPES` declares is documentation for a reader, not a contract. */
      expect([...reported].sort()).toEqual([...ALL_REGISTERED].sort());
      expect(reported).toHaveLength(28);
    });

    it('[NET-NEW] the four classes partition the surface — 7 + 4 + 1 + 16, with no name in two', () => {
      const byScope = new Map<TableScope, string[]>();

      for (const [name, scope] of registeredTableScopes()) {
        byScope.set(scope, [...(byScope.get(scope) ?? []), name]);
      }

      expect([...(byScope.get('catalog-core') ?? [])].sort()).toEqual([...CATALOG_CORE].sort());
      expect([...(byScope.get('catalog-owned-link') ?? [])].sort()).toEqual(
        [...CATALOG_OWNED_LINK].sort(),
      );
      expect([...(byScope.get('cross-domain-write') ?? [])].sort()).toEqual(
        [...CROSS_DOMAIN_WRITE].sort(),
      );
      expect([...(byScope.get('cross-domain-read-only') ?? [])].sort()).toEqual(
        [...CROSS_DOMAIN_READ_ONLY].sort(),
      );

      /* Totality: the four classes account for every reported name and for nothing else. */
      expect(byScope.size).toBe(4);
      expect([...byScope.values()].reduce((total, names) => total + names.length, 0)).toBe(28);
    });

    it('[NET-NEW] the census is frozen, so a caller cannot mutate the registry through it', () => {
      const reported = registeredTableScopes();

      expect(Object.isFrozen(reported)).toBe(true);
      for (const entry of reported) {
        expect(Object.isFrozen(entry)).toBe(true);
      }
    });

    it('[NET-NEW] tableScope() agrees with the census for every name', () => {
      for (const [name, scope] of registeredTableScopes()) {
        expect(tableScope(name)).toBe(scope);
      }
    });
  });

  describe('SEC-SQL-SCOPE-01 — the READ gate admits the whole ratified surface', () => {
    it('[NET-NEW] assertRegisteredTableName resolves every one of the twenty-eight names', () => {
      for (const name of ALL_REGISTERED) {
        expect(assertRegisteredTableName(name)).toBe(name);
      }
    });

    it('[NET-NEW] it refuses a name outside the surface, before any statement text exists', () => {
      /* `SwAccount` is a real Slatwall table and belongs to the largest excluded family (AAP §0.2.2.1, 21
       * files). Refusing it is the boundary holding — not a spelling check. */
      const error = refusalOf(() => assertRegisteredTableName('SwAccount'));

      expect(error.message).toContain('neither the extracted Catalog schema nor the ratified');
      expect(error.context).toEqual({ candidate: 'SwAccount' });
    });

    it('[NET-NEW] it refuses a plausible near-miss rather than resolving it loosely', () => {
      /* `SwOrder` is the parent of the registered `SwOrderItem`. A prefix or fuzzy match would admit it. */
      refusalOf(() => assertRegisteredTableName('SwOrder'));
      refusalOf(() => assertRegisteredTableName('SwProducts'));
      refusalOf(() => assertRegisteredTableName(''));
    });

    it('[NET-NEW] it accepts all three vocabularies for a column-mapped name, and only the physical spelling for the rest', () => {
      /* The logical and bare forms exist because `org/Hibachi/HibachiDAO.cfc` SYNTHESISES them for entities
       * this port models. It models none of the excluded families, so no caller holds a `SlatwallOrderItem`
       * spelling to pass — there is no order entity here to name. */
      expect(assertRegisteredTableName('SlatwallSku')).toBe('SwSku');
      expect(assertRegisteredTableName('Sku')).toBe('SwSku');
      expect(assertRegisteredTableName('SwSku')).toBe('SwSku');

      refusalOf(() => assertRegisteredTableName('SlatwallOrderItem'));
      refusalOf(() => assertRegisteredTableName('OrderItem'));
    });
  });

  describe('SEC-SQL-SCOPE-01 — the WRITE gate refuses every read-only name', () => {
    it('[NET-NEW] assertWriteTableName admits the eleven Catalog tables', () => {
      for (const name of [...CATALOG_CORE, ...CATALOG_OWNED_LINK]) {
        expect(assertWriteTableName(name)).toBe(name);
      }
    });

    it('[NET-NEW] it admits SwAttributeValue, the one cross-domain table the importer writes', () => {
      /* If this refused, the importer's custom-attribute step of `model/dao/ProductDAO.cfc:L244`/`:L250`
       * could not be composed and behaviour AAP §0.4.1.7 requires would be dropped. */
      expect(assertWriteTableName('SwAttributeValue')).toBe('SwAttributeValue');
      expect(tableScope('SwAttributeValue')).toBe('cross-domain-write');
    });

    it('[NET-NEW] it refuses each of the sixteen read-only names, naming the classification', () => {
      for (const name of CROSS_DOMAIN_READ_ONLY) {
        const error = refusalOf(() => assertWriteTableName(name));

        expect(error.message).toContain('ratified cross-domain READ surface');
        /* The context carries the SCOPE, so an operator reading a log learns why rather than only what. */
        expect(error.context).toEqual({ table: name, scope: 'cross-domain-read-only' });
      }
    });

    it('[NET-NEW] ⭐ it refuses SwAlternateSkuCode even though that name IS column-mapped', () => {
      /* THE CASE THAT PROVES THE GATE READS SCOPES AND NOT THE COLUMN MAP. `SwAlternateSkuCode` is in
       * `PHYSICAL_TABLE_NAMES`, so `assertTableName` resolves it and `assertColumnName` knows its columns —
       * the SKU-code fallback of `model/dao/SkuDAO.cfc:L103` JOINS it. It nonetheless belongs to an excluded
       * family and must never be written. A write gate implemented against the column map would admit it. */
      expect(assertTableName('SwAlternateSkuCode')).toBe('SwAlternateSkuCode');
      expect(columnsForTable('SwAlternateSkuCode')).toContain('alternateSkuCode');

      const error = refusalOf(() => assertWriteTableName('SwAlternateSkuCode'));

      expect(error.context).toEqual({
        table: 'SwAlternateSkuCode',
        scope: 'cross-domain-read-only',
      });
    });

    it('[NET-NEW] ⭐ SwAttributeSetProductType is a LINK table and is still refused for writes', () => {
      /* THE CASE THAT PROVES THE MIDDLE CLASS IS A TEST, NOT A SHAPE. The four `catalog-owned-link` members
       * qualify because their owning side is an in-scope entity. This one's owning side is `AttributeSet`
       * (`model/entity/AttributeSet.cfc:L70`), an excluded entity, and `SwProductType` appears only as the far
       * column — so writing it would be writing a relationship the Catalog does not own. */
      expect(tableScope('SwAttributeSetProductType')).toBe('cross-domain-read-only');
      refusalOf(() => assertWriteTableName('SwAttributeSetProductType'));

      for (const owned of CATALOG_OWNED_LINK) {
        expect(assertWriteTableName(owned)).toBe(owned);
      }
    });

    it('[NET-NEW] the writeable set and the column-mapped set are both twelve and differ in exactly two', () => {
      /* ⚠️ THE DISTINCTION THAT MADE THE ORIGINAL PREDICATE WRONG, pinned so a future simplification that
       * collapses the two sets fails here. `PhysicalTableName` is what `TABLE_COLUMNS` maps;
       * `WriteableTableName` is what the scopes permit writing; they are near-identical and not identical. */
      const columnMapped = ALL_REGISTERED.filter((name) => {
        try {
          assertTableName(name);

          return true;
        } catch {
          return false;
        }
      });
      const writeable = ALL_REGISTERED.filter((name) => {
        try {
          assertWriteTableName(name);

          return true;
        } catch {
          return false;
        }
      });

      expect(columnMapped).toHaveLength(12);
      expect(writeable).toHaveLength(12);
      expect([...writeable].sort()).toEqual([...WRITEABLE].sort());

      /* The symmetric difference is exactly the two names the classification exists to separate. */
      const onlyColumnMapped = columnMapped.filter((name) => !writeable.includes(name));
      const onlyWriteable = writeable.filter((name) => !columnMapped.includes(name));

      expect(onlyColumnMapped).toEqual(['SwAlternateSkuCode']);
      expect(onlyWriteable).toEqual(['SwAttributeValue']);
    });

    it('[NET-NEW] assertTableName still refuses every cross-domain name, so the older gate did not widen', () => {
      /* The fix classified the registry rather than loosening the existing whitelist. Every write path in the
       * subtree resolves through `assertTableName`, so this case is what proves those paths were not widened
       * as a side effect of admitting the reads. */
      for (const name of CROSS_DOMAIN_READ_ONLY.filter((n) => n !== 'SwAlternateSkuCode')) {
        refusalOf(() => assertTableName(name));
      }

      refusalOf(() => assertTableName('SwAttributeValue'));
    });
  });

  describe('SEC-SQL-SCOPE-01 — the COLUMN gate covers both halves of the registry', () => {
    it('[NET-NEW] assertRegisteredColumnName dispatches to the column-mapped half', () => {
      /* For a name `TABLE_COLUMNS` maps, the unified gate must answer exactly what the original gate answers,
       * so routing a call site through it is not a behaviour change. */
      for (const table of [...CATALOG_CORE, 'SwAlternateSkuCode']) {
        const resolved = assertRegisteredTableName(table);

        for (const column of columnsForTable(resolved as PhysicalTableName)) {
          expect(assertRegisteredColumnName(resolved, column)).toBe(
            assertColumnName(resolved as PhysicalTableName, column),
          );
        }
      }
    });

    it('[NET-NEW] it resolves the cross-domain columns the existence chain and the importer emit', () => {
      const cases: readonly (readonly [RegisteredTableName, string])[] = [
        /* the ten-way chain of `model/dao/SkuDAO.cfc:L53-L98` */
        ['SwStock', 'stockID'],
        ['SwStock', 'skuID'],
        ['SwOrderItem', 'skuID'],
        ['SwInventory', 'stockID'],
        ['SwOrderDeliveryItem', 'stockID'],
        ['SwPhysicalCountItem', 'stockID'],
        ['SwStockAdjustmentDeliveryItem', 'stockID'],
        ['SwStockAdjustmentItem', 'fromStockID'],
        ['SwStockAdjustmentItem', 'toStockID'],
        ['SwStockHold', 'stockID'],
        ['SwStockReceiverItem', 'stockID'],
        ['SwVendorOrderItem', 'skuID'],
        /* the non-fetching join of `:L159` */
        ['SwSubscriptionTerm', 'subscriptionTermID'],
        /* the attribute-set selection of `model/dao/ProductDAO.cfc:L52-L62` */
        ['SwAttributeSet', 'attributeSetID'],
        ['SwAttributeSet', 'globalFlag'],
        ['SwAttributeSet', 'sortOrder'],
        ['SwAttributeSet', 'attributeSetTypeID'],
        ['SwAttribute', 'activeFlag'],
        ['SwAttributeSetProductType', 'productTypeID'],
        ['SwType', 'typeID'],
        ['SwType', 'systemCode'],
        /* the importer's custom-attribute step, `:L244` and `:L250` */
        ['SwAttributeValue', 'attributeValueID'],
        ['SwAttributeValue', 'attributeValue'],
        ['SwAttributeValue', 'attributeValueType'],
        ['SwAttributeValue', 'attributeID'],
        ['SwAttributeValue', 'productID'],
      ];

      for (const [table, column] of cases) {
        expect(assertRegisteredColumnName(table, column)).toBe(column);
      }
    });

    it('[NET-NEW] ⭐ it refuses a real column PAIRED WITH THE WRONG TABLE', () => {
      /* THE RISK THE COLUMN GATE ACTUALLY ADDRESSES. Spelling was never the hazard: `skuID` is declared on
       * nine of the twenty-eight registered tables and `stockID` on seven, so a mis-paired name is still a
       * real column and still composes SQL that parses — it simply answers the wrong question. */
      const error = refusalOf(() => assertRegisteredColumnName('SwOrderItem', 'stockID'));

      expect(error.message).toContain('ratified cross-domain table');
      expect(error.context).toEqual({
        table: 'SwOrderItem',
        candidate: 'stockID',
        scope: 'cross-domain-read-only',
      });

      /* And the converse pairing, to show the refusal is not one-directional. */
      refusalOf(() => assertRegisteredColumnName('SwInventory', 'skuID'));
      refusalOf(() => assertRegisteredColumnName('SwAttributeValue', 'globalFlag'));
    });

    it('[NET-NEW] it matches case-insensitively but answers the DECLARED spelling', () => {
      /* The legacy interpolates these names with inconsistent casing — `modifiedDatetime` at
       * `model/dao/ProductDAO.cfc:L363` beside `CreatedByAccountID` at `:L365` — and got away with it because
       * SQL identifiers are case-insensitive on the engines it targeted. Resolving to the declaration removes
       * the dependency on that leniency. */
      expect(assertRegisteredColumnName('SwStock', 'STOCKID')).toBe('stockID');
      expect(assertRegisteredColumnName('SwAttributeValue', '  attributevalueid  ')).toBe(
        'attributeValueID',
      );
    });

    it('[NET-NEW] it refuses a column no registered table declares', () => {
      refusalOf(() => assertRegisteredColumnName('SwStock', 'accountID'));
      refusalOf(() => assertRegisteredColumnName('SwType', ''));
    });

    it('[NET-NEW] every cross-domain table declares at least one column, so no entry is a stub', () => {
      /* `EXTENDED_TABLE_COLUMNS` is annotated as a TOTAL `Record`, so adding a table to the registry without
       * declaring its columns fails the build. This case adds the run-time half: a declared-but-empty set
       * would satisfy the compiler and would make every column on that table unusable. */
      for (const table of ALL_REGISTERED.filter((name) => {
        try {
          assertTableName(name);

          return false;
        } catch {
          return true;
        }
      })) {
        const registered = assertRegisteredTableName(table);
        const anyColumnResolves = [
          'stockID',
          'skuID',
          'fromStockID',
          'toStockID',
          'subscriptionTermID',
          'attributeSetID',
          'attributeID',
          'attributeValueID',
          'typeID',
          'productTypeID',
        ].some((candidate) => {
          try {
            assertRegisteredColumnName(registered, candidate);

            return true;
          } catch {
            return false;
          }
        });

        expect(anyColumnResolves).toBe(true);
      }
    });
  });
});
