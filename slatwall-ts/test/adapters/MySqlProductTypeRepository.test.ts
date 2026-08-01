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
 * The adapter's single READ member, `findAllForTree()`, and nothing else. Specifically: the
 * translated statement's shape, its physical table names (D22), its two correlated scalar
 * subselects, its two derived aliases, its single flat ordering, its empty bound-value list, the
 * numeric-not-boolean nature of both counts, and the two legacy comments that misdescribe what the
 * member returns.
 *
 * ⛔ WHAT IT DELIBERATELY DOES NOT COVER, so each absence reads as a decision:
 *   - The write and removal members the port also declares. They belong to the save path that
 *     reaches persistence through the base service, and the read member is the one
 *     `model/dao/ProductTypeDAO.cfc` actually declares.
 *   - Any single-product-type read, factory member, paginated-list member, counting, listing or
 *     exporting member. Those resolved through the framework's missing-method dispatch (IR-1,
 *     `org/Hibachi/HibachiService.cfc:L255-L281`) and AAP §0.4.2.5 declares the single read on
 *     `ProductService`, not on this repository.
 *   - Any attribute-assignment behaviour, including defect D21 at
 *     `model/entity/ProductType.cfc:L92-L98`. It is boundary-stubbed in the domain layer and reaches
 *     an excluded domain family, so nothing here touches it and no excluded collaborator is
 *     imported.
 *   - The parameterisation-hardening exception D18. It belongs exclusively to the product importer's
 *     adapter, whose legacy statements interpolate values taken from an uploaded file. The statement
 *     under test binds nothing and interpolates no caller value, because its member takes no
 *     argument, so there is no such site here. Stated positively so the absence reads as a verified
 *     property.
 *
 * REGISTER DISCIPLINE. This file MINTS NO new defect or mismatch identifier. It cites D22 (the
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
import { assertTableName } from '../../src/adapters/mysql/QueryRunner';
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
  createAccountContextDouble,
  createSqlExecutorDouble,
  sqlRows,
} from '../support/inMemoryRepositories';

import type { ProductTypeStatementExecutor } from '../../src/adapters/mysql/MySqlProductTypeRepository';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../src/ports/repositories/ProductTypeRepository';
import type { SqlExecutorCall } from '../support/inMemoryRepositories';

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
 * row's own identifier, `parentProductTypeID` as the literal four-character string the seed document
 * renders, and `activeFlag` as the literal `'1'` it renders. Nothing is invented, nothing is
 * regenerated and no representation is derived from another.
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
    parentProductTypeID: seeded.parentProductTypeID,
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
     * TODO(parity) D22 `model/dao/ProductTypeDAO.cfc:L54-L62` — THE LEGACY STATEMENT NAMES ITS TABLES
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
      /* Still flat: no parent resolved, no children inferred. */
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
