/**
 * `MySqlProductTypeRepository` — the ported `model/dao/ProductTypeDAO.cfc`.
 *
 * Provenance: every case in this file is **net-new**
 * There is no legacy `ProductTypeDAOTest`. AAP §0.6.5.2 verified the absence for the whole
 * data-access layer — "**No** `SkuDAOTest` or `OptionDAOTest` exists" — and a repository-wide search
 * for a product-type DAO test returns nothing either. So not one assertion below extends a legacy
 * assertion, and none is labelled as though it did (AAP §0.8.3.7). Every `describe` and every `it`
 * title carries the **NET-NEW** label verbatim, so the honest ratio is auditable straight from the
 *
 * `meta/tests/unit/dao/AccountDAOTest.cfc` is the shape reference AAP §0.4.1.12 names for this file,
 * and it is reference-only in the strictest sense: nothing of its content is carried across. Its
 * `setUp()` resolves a collaborator by string out of an ambient request scope and its single case
 * asserts only that the resolved thing is an object. Neither idiom appears here — no service
 * locator, no ambient scope, no bootstrap, and no "it constructed" case. This suite instead
 * constructs the adapter directly and hands it a typed test double, which is the structural.
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

/* The physical table names, taken from the production whitelist rather than retyped. */

/** The physical product-type table, resolved through the same schema whitelist the adapter uses. */
const PRODUCT_TYPE_TABLE = assertTableName('SwProductType');

/** The physical product table, resolved the same way. */
const PRODUCT_TABLE = assertTableName('SwProduct');

/**
 * The statement with runs of whitespace collapsed, so a fragment spanning the adapter's line breaks
 * can be asserted without pinning its indentation.
 */
const TREE_STATEMENT_COLLAPSED = PRODUCT_TYPE_TREE_STATEMENT.replace(/\s+/g, ' ');

/** One raw driver row, as the executor seam hands it back before hydration. */
type CannedRow = Record<string, unknown>;

/** A test-only child product-type identifier. */
const TEST_ONLY_CHILD_PRODUCT_TYPE_ID = 'cccccccccccccccccccccccccccccccc';

/*
 * Harness and helpers — no mocking library, no `jest.mock`, no local re-implementation of a double.
 */

/** The adapter under test, plus the observation state its injected seam records. */
interface TreeReadHarness {
  /**
   * Typed as the port rather than as the concrete adapter, so every case below is confined to the
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

/** Return the single element of a list, or fail with a message naming what was expected. */
function exactlyOne<T>(items: readonly T[], what: string): T {
  const [first, ...rest] = items;
  if (first === undefined || rest.length > 0) {
    throw new Error(`expected exactly one ${what}, saw ${String(items.length)}`);
  }
  return first;
}

/** Build a canned MySQL row from a seeded product-type record plus its two derived counts. */
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

/* 1. the translated statement. */

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — the translated statement', () => {
  /*
   * Zero-caller note, recorded where a reader will look for it.
   * `model/service/ProductService.cfc:L54` declares `property name="productTypeDAO" type="any";` and
   * nothing in the slice ever reads it — AAP §0.6.3.1 classifies it as one of the four dead
   * injections, with zero call sites, and the composition root deliberately does not wire it.
   * Searching the legacy tree for the DAO member's own name likewise returns exactly one line, its
   * declaration at `model/dao/ProductTypeDAO.cfc:L52`.
   */

  it('NET-NEW: names only the physical Sw* tables, never the logical ORM entity names', async () => {
    const harness = createTreeReadHarness([]);

    await harness.repository.findAllForTree();

    const call = exactlyOne(harness.calls, 'recorded statement');

    /*
     * TODO(parity) D22 `model/dao/ProductTypeDAO.cfc:L54-L62` — the legacy statement names its tables
     * with logical ORM entity names, inside native SQL, and the target deliberately emits the
     * physical ones instead.
     */
    expect(call.sql).toContain(PRODUCT_TYPE_TABLE);
    /*
     * The outer read is over the physical product-type table — `model/dao/ProductTypeDAO.cfc:L61`.
     */
    expect(TREE_STATEMENT_COLLAPSED).toContain(`FROM ${PRODUCT_TYPE_TABLE} ORDER BY`);
    /*
     * The assigned-product subselect reads the physical product table — `:L56`. The trailing keyword
     * keeps this fragment from matching the product-type table, whose name shares the same prefix.
     */
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
     * the same column set, and a scalar subquery in a select list yields one aliased value rather
     * than a table to expand.
     */
    expect(TREE_STATEMENT_COLLAPSED).toContain(`SELECT ${PRODUCT_TYPE_TABLE}.*,`);

    /*
     * `isAssigned` — `model/dao/ProductTypeDAO.cfc:L55-L57`. A correlated scalar subselect counting
     * `SwProduct.productID` rows whose `productTypeID` equals the outer product type's identifier.
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
     * no subselect-to-JOIN rewrite. Neither the forbidden direct-join-and-aggregate form — whose
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
     * The member takes no argument — `model/dao/ProductTypeDAO.cfc:L52` declares none — so there is
     * no caller value to bind and no filter, sort key, page size or maximum-results parameter is
     * offered. Calling it with none is the whole contract, and the compiler enforces it: the port
     * declares `findAllForTree(): Promise<ProductTypeTreeRow[]>`.
     */
    await harness.repository.findAllForTree();

    const call = exactlyOne(harness.calls, 'recorded statement');

    /*
     * The recorded values are read exactly as recorded: not trimmed, not coerced, not reordered and
     * not copied through any normaliser. An empty array is the whole expectation.
     */
    expect(call.params).toEqual([]);
    expect(call.params).toHaveLength(0);

    /*
     * The bound list is still passed rather than omitted, and the exported constant is what was
     * passed. Binding nothing is not a reason to leave the prepared-execution path: prepared
     * execution with an empty bound list is exactly as correct as with a full one, and the security
     * property of the adapter layer comes from there being a single execution path rather than from
     * care taken at each call site (AAP §0.7.3, TR-4).
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
     * Server-side execute semantics, proved structurally rather than asserted. This seam is a plain
     * object literal declaring exactly the two members the adapter's contract requires. There is no
     * client-side text-substitution member on it at all, so the adapter demonstrably cannot be
     * reaching one — the proof is the absence of the member, not a spy on it. The mutation member
     * rejects, so a read that strayed onto the write path would fail this case loudly.
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
     * A read resolves no acting account. The audit block belongs to the write path, which stamps
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
     * TR-1 tightening, exercised. `model/dao/ProductTypeDAO.cfc:L52` declares `returntype="query"`
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

/* 2. the two derived counts are numbers, and `isAssigned` is a legacy misnomer. */

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — numeric counts, never booleans', () => {
  /*
   * TODO(parity) — `model/dao/ProductTypeDAO.cfc:L55-L60`: `isAssigned` is a legacy misnomer,
   * and its count semantics are retained exactly.
   */

  it('NET-NEW: maps an unassigned product type to isAssigned 0, and not to false', async () => {
    const harness = createTreeReadHarness([
      seededTreeRow(SUBSCRIPTION_PRODUCT_TYPE, { isAssigned: 0, childCount: 0 }),
    ]);

    const row = exactlyOne(await harness.repository.findAllForTree(), 'mapped row');

    expect(row.isAssigned).toBe(0);
    expect(typeof row.isAssigned).toBe('number');
    /*
     * The boolean reading, refused explicitly. `0` is falsy, so a truthiness test would agree here
     * by accident; identity against `false` is what distinguishes a count of zero from a flag.
     */
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

/* 3. the two misleading legacy comments — documented as facts, never implemented as behaviour. */

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
     * TODO(parity) `model/dao/ProductTypeDAO.cfc:L51-L64` — the hint advertises caching the component
     * does not perform, and it is preserved as source history rather than acted on.
     */
    expect(harness.calls).toHaveLength(2);
    expect(harness.calls.map((call) => call.sql)).toEqual([
      PRODUCT_TYPE_TREE_STATEMENT,
      PRODUCT_TYPE_TREE_STATEMENT,
    ]);
    expect(harness.calls.map((call) => call.params)).toEqual([[], []]);

    /*
     * And the second read's answer is the second read's answer. A memoized result would have replayed
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
     * Identical VALUES, distinct objects. The adapter hydrates per read, so no entity instance is
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
     * TODO(parity) — `model/dao/ProductTypeDAO.cfc:L62-L63`: the trailing comment calls a flat
     * Alphabetical ordering a tree, and the ordering is carried exactly as written.
     */
    expect(call.sql).toContain('ORDER BY productTypeName ASC');
    expect(PRODUCT_TYPE_TREE_STATEMENT.endsWith('ORDER BY productTypeName ASC')).toBe(true);

    /* Exactly one ordering clause: one occurrence splits the text into exactly two parts. */
    expect(TREE_STATEMENT_COLLAPSED.split('ORDER BY')).toHaveLength(2);

    /*
     * And exactly one sort term within it — no comma-separated secondary key, ascending or otherwise.
     */
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
     * deliberately not in alphabetical order, so a client-side sort would visibly reorder it and this
     * expectation would fail.
     */
    expect(rows.map((row) => row.productTypeName)).toEqual([
      'Merchandise',
      'Subscription',
      'Content Access',
    ]);

    /*
     * Every row is a flat product type. `childProductTypes` stays empty and the parent reference stays
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

/* 4. the seeded discriminators — byte-exact identifiers and a single root level (IR-7) */

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — the seeded discriminators', () => {
  it('NET-NEW: carries all three seeded identifiers byte-for-byte, lowercase and dashless', () => {
    /*
     * IR-7 — these three identifiers are fixed platform data, not test data, and they are used here
     * through the shared fixture rather than retyped. `test/fixtures/productTypes.ts` transcribes
     * them verbatim from `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`, and this file imports
     * that module rather than declaring a competing one, so there is exactly one place in the subtree
     * where a product-type discriminator is written down.
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
     * The seed document establishes one level and only one level, and nothing in this file may
     * infer otherwise. `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` contains exactly three
     * `<Record>` elements, and on every one of them:
     * - `productTypeIDPath` equals that record's own `productTypeID` — a one-element ancestry path,
     * which is what a root looks like;
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
     * query-computed counts, which is an honest root-level setup: every column value traces to
     * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`, and the counts are stated because the seed
     * document has no column for them — they are what the two correlated subselects return.
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
      /*
       * Still flat: no parent resolved, no children inferred. These three are roots in any case — the
       * seed gives them no parent at all, so there is no key here for rule 3b to preserve and the
       * write path nulls the column because that is the truth, not because anything was dropped.
       */
      expect(row.parentProductType).toBeUndefined();
      expect(row.childProductTypes).toEqual([]);
      expect(row.isAssigned).toBe(0);
      expect(row.childCount).toBe(0);
    }
  });
});

/* 5. A deeper relationship, constructed explicitly — never inferred from the seed. */

describe('NET-NEW: MySqlProductTypeRepository.findAllForTree — an explicitly constructed parent and child', () => {
  /** The one explicit child row this section needs. */
  function testOnlyChildRow(counts: {
    readonly isAssigned: number;
    readonly childCount: number;
  }): CannedRow {
    return {
      productTypeID: TEST_ONLY_CHILD_PRODUCT_TYPE_ID,
      /*
       * A two-element ancestry path, root first and self last — the shape the entity lifecycle
       * maintains for a child, in contrast with the one-element path every seeded root carries.
       */
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
     * The SQL computes `childCount` through `parentProductTypeID`, and this is where that matters.
     * `model/dao/ProductTypeDAO.cfc:L58-L60` correlates the self-reference's parent key against the
     * outer row's identifier, so the parent's count of one is the database's answer about this exact
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
    /*
     * A non-seeded product type carries no discriminator, which is what forces a root walk elsewhere.
     */
    expect(childRow?.systemCode).toBeUndefined();

    /*
     * The repository maps flat rows and does nothing else. It does not recursively assemble a tree,
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
     * Only the parent is returned, and its child count is still one. If the adapter derived the count
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
     * `model/dao/ProductTypeDAO.cfc:L58-L60` matches a single generation through
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
    /*
     * The parent's one is not the child's four plus one: the counts are per-row and independent.
     */
    expect(rows[0]?.childCount).toBe(1);
    expect(rows[1]?.childCount).toBe(4);
  });
});

/*
 * 7. The three additive members — re-binding, the write, and the removal
 * Everything above this banner exercises the one member `model/dao/ProductTypeDAO.cfc` declares.
 */

/** A write-path harness: the concrete adapter, its recorded statements, and its account seam. */
interface WriteHarness {
  /**
   * Typed as the concrete adapter rather than the port, because `withExecutor` is not on the port
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

/** The physical write columns, resolved through the same whitelist the adapter uses. */
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

/** A transient product type carrying the field values a save should persist. */
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
     * depend on when it was used rather than on which instance was used — an ambient
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
     * The pool-bound instance a composition root built is still valid and still pool-bound after the
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
     * Re-binding replaces one collaborator. The account context is passed through to the new
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
     * Annotating the re-bound instance as the port is the assertion: it compiles only while the
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
   * Port exhaustiveness, keyed off the port itself rather than off a hand list.
   * The case above proves the re-bound instance still answers the port; this one proves the list of
   * members being checked is complete. A hand-written enumeration silently stops covering a port the
   * day a member is added, which is the gap reported; the mapped type below fails to compile
   * instead.
   */
  it('NET-NEW — satisfies the ProductTypeRepository port across ALL THREE declared members', () => {
    const asPort: ProductTypeRepository = createWriteHarness().repository;

    /*
     * Keyed off the port's own member set, so a fourth method breaks compilation until it is named.
     */
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
    /*
     * An insert lists the identifier, so it is the first bound value, ahead of every column value.
     */
    expect(statement.params[0]).toBe(productType.productTypeID);
  });

  it('NET-NEW — fires the entity lifecycle hook BEFORE collecting values, so the ancestry path is fresh', async () => {
    const harness = createWriteHarness();
    /* The mutation-sensitive case for the order of two statements in production. */
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
     * The legacy hook read its actor from a request-scoped framework lookup, which AAP §0.7.3 forbids here,
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
     * Two gates, not one, and the second is easy to lose. The legacy condition is
     * `!getAccount().isNew() && getAccount().getAdminAccountFlag()`, byte-identical at all three of
     * its call sites, so an actor must be both persisted and administrative to be recorded. A
     * persisted non-admin account therefore stamps no attribution — the timestamps are still written
     * because they depend on the clock rather than the actor.
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
     * The difference between "nobody was recorded" and "an account whose identifier is blank".
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
     * Dropping the column would let the database apply its own default, which is a different outcome
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
     * string appears in the bound array and nowhere in the statement text. No hardening exception is
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
     * A child is used here rather than a root, and the reason is a trap worth naming. For a root
     * product type the materialised ancestry path is its own identifier, so the identifier legitimately
     * appears in the first bound position as well as the last, and a case asserting "the identifier is
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
     * The identifier is bound last here and first on the insert, because an insert lists it while an
     * update matches on it. Transposing the two would compose a statement that keys the row on a
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
     * No `+ 1` here, unlike every insert case above, and the asymmetry is the contract. An insert
     * binds the identifier first and so shifts every column value one position right; an update binds
     * the writable values from position zero and appends the identifier at the end. Reusing the
     * insert's offset on this path would silently read the next column's value — which is exactly the
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
     * in an unsound one. Refusing before composing anything is the observable half, and it is not a
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
     * carrying children still produces exactly one statement here — the delete guards that decide
     * whether a removal is permissible at all live in the validation rule set, not in this adapter.
     */
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls.every((call) => call.sql.startsWith('DELETE FROM '))).toBe(true);
    const productTableReference = new RegExp(`\\b${PRODUCT_TABLE}\\b`);
    expect(harness.calls.some((call) => productTableReference.test(call.sql))).toBe(false);
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites and AAP §0.3.1 freezes the subtree at the
 * file inventory it enumerates, so the ratified database surface is covered here rather than in a suite
 * of its own.
 */

/* FOLDED IN FROM adapters/schemaScopeRegistry */

/** The ratified database surface (CWE-284, CWE-250). */
describe('The ratified database surface every adapter in this layer resolves its identifiers through', () => {
  /*
   * The census this suite ratifies
   * Written out here independently of the implementation — as literal strings, not derived from
   * `registeredTableScopes()` — because a census computed from the thing it audits proves nothing. Adding a
   * table to `TABLE_SCOPES` without amending this block fails the first case below, which is the whole
   * mechanism by which the surface cannot grow unremarked.
   */

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

  /** Link tables whose owning side is an in-scope entity even though the far side is not. */
  const CATALOG_OWNED_LINK: readonly string[] = [
    'SwSkuAccessContent',
    'SwSkuSubsBenefit',
    'SwSkuRenewalSubsBenefit',
    'SwRelatedProduct',
  ];

  /** The one cross-domain table this service writes. */
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

  describe('the ratified surface is enumerable, which is what makes it ratifiable', () => {
    it('[NET-NEW] registeredTableScopes() reports exactly the twenty-eight ratified names', () => {
      const reported = registeredTableScopes().map(([name]) => name);

      /*
       * Compared as sets, so a reordering of the declaration is not a failure while an addition or a removal
       * is. The order `TABLE_SCOPES` declares is documentation for a reader, not a contract.
       */
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

  describe('the READ gate admits the whole ratified surface', () => {
    it('[NET-NEW] assertRegisteredTableName resolves every one of the twenty-eight names', () => {
      for (const name of ALL_REGISTERED) {
        expect(assertRegisteredTableName(name)).toBe(name);
      }
    });

    it('[NET-NEW] it refuses a name outside the surface, before any statement text exists', () => {
      /*
       * `SwAccount` is a real Slatwall table and belongs to the largest excluded family (AAP §0.2.2.1, 21
       * files). Refusing it is the boundary holding — not a spelling check.
       */
      const error = refusalOf(() => assertRegisteredTableName('SwAccount'));

      expect(error.message).toContain('neither the extracted Catalog schema nor the ratified');
      expect(error.context).toEqual({ candidate: 'SwAccount' });
    });

    it('[NET-NEW] it refuses a plausible near-miss rather than resolving it loosely', () => {
      /*
       * `SwOrder` is the parent of the registered `SwOrderItem`. A prefix or fuzzy match would admit it.
       */
      refusalOf(() => assertRegisteredTableName('SwOrder'));
      refusalOf(() => assertRegisteredTableName('SwProducts'));
      refusalOf(() => assertRegisteredTableName(''));
    });

    it('[NET-NEW] it accepts all three vocabularies for a column-mapped name, and only the physical spelling for the rest', () => {
      /*
       * The logical and bare forms exist because `org/Hibachi/HibachiDAO.cfc` SYNTHESISES them for entities
       * this port models. It models none of the excluded families, so no caller holds a `SlatwallOrderItem`
       * spelling to pass — there is no order entity here to name.
       */
      expect(assertRegisteredTableName('SlatwallSku')).toBe('SwSku');
      expect(assertRegisteredTableName('Sku')).toBe('SwSku');
      expect(assertRegisteredTableName('SwSku')).toBe('SwSku');

      refusalOf(() => assertRegisteredTableName('SlatwallOrderItem'));
      refusalOf(() => assertRegisteredTableName('OrderItem'));
    });
  });

  describe('the WRITE gate refuses every read-only name', () => {
    it('[NET-NEW] assertWriteTableName admits the eleven Catalog tables', () => {
      for (const name of [...CATALOG_CORE, ...CATALOG_OWNED_LINK]) {
        expect(assertWriteTableName(name)).toBe(name);
      }
    });

    it('[NET-NEW] it admits SwAttributeValue, the one cross-domain table the importer writes', () => {
      /*
       * If this refused, the importer's custom-attribute step of `model/dao/ProductDAO.cfc:L244`/`:L250`
       * could not be composed and behaviour AAP §0.4.1.7 requires would be dropped.
       */
      expect(assertWriteTableName('SwAttributeValue')).toBe('SwAttributeValue');
      expect(tableScope('SwAttributeValue')).toBe('cross-domain-write');
    });

    it('[NET-NEW] it refuses each of the sixteen read-only names, naming the classification', () => {
      for (const name of CROSS_DOMAIN_READ_ONLY) {
        const error = refusalOf(() => assertWriteTableName(name));

        expect(error.message).toContain('ratified cross-domain READ surface');
        /*
         * The context carries the scope, so an operator reading a log learns why rather than only what.
         */
        expect(error.context).toEqual({ table: name, scope: 'cross-domain-read-only' });
      }
    });

    it('[NET-NEW] it refuses SwAlternateSkuCode even though that name is column-mapped', () => {
      /*
       * The case that proves the gate reads scopes and not the column map. `SwAlternateSkuCode` is in
       * `PHYSICAL_TABLE_NAMES`, so `assertTableName` resolves it and `assertColumnName` knows its columns —
       * the SKU-code fallback of `model/dao/SkuDAO.cfc:L103` joins it. It nonetheless belongs to an excluded
       * family and must never be written. A write gate implemented against the column map would admit it.
       */
      expect(assertTableName('SwAlternateSkuCode')).toBe('SwAlternateSkuCode');
      expect(columnsForTable('SwAlternateSkuCode')).toContain('alternateSkuCode');

      const error = refusalOf(() => assertWriteTableName('SwAlternateSkuCode'));

      expect(error.context).toEqual({
        table: 'SwAlternateSkuCode',
        scope: 'cross-domain-read-only',
      });
    });

    it('[NET-NEW] SwAttributeSetProductType is a link table and is still refused for writes', () => {
      /*
       * The case that proves the middle class is a test, not a shape. The four `catalog-owned-link` members
       * qualify because their owning side is an in-scope entity. This one's owning side is `AttributeSet`
       * (`model/entity/AttributeSet.cfc:L70`), an excluded entity, and `SwProductType` appears only as the far
       * column — so writing it would be writing a relationship the catalog does not own.
       */
      expect(tableScope('SwAttributeSetProductType')).toBe('cross-domain-read-only');
      refusalOf(() => assertWriteTableName('SwAttributeSetProductType'));

      for (const owned of CATALOG_OWNED_LINK) {
        expect(assertWriteTableName(owned)).toBe(owned);
      }
    });

    it('[NET-NEW] the writeable set and the column-mapped set are both twelve and differ in exactly two', () => {
      /*
       * The distinction that made the original predicate wrong, pinned so a future simplification that
       * collapses the two sets fails here. `PhysicalTableName` is what `TABLE_COLUMNS` maps;
       * `WriteableTableName` is what the scopes permit writing; they are near-identical and not identical.
       */
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

      /*
       * The symmetric difference is exactly the two names the classification exists to separate.
       */
      const onlyColumnMapped = columnMapped.filter((name) => !writeable.includes(name));
      const onlyWriteable = writeable.filter((name) => !columnMapped.includes(name));

      expect(onlyColumnMapped).toEqual(['SwAlternateSkuCode']);
      expect(onlyWriteable).toEqual(['SwAttributeValue']);
    });

    it('[NET-NEW] assertTableName still refuses every cross-domain name, so the older gate did not widen', () => {
      /*
       * The fix classified the registry rather than loosening the existing whitelist. Every write path in the
       * subtree resolves through `assertTableName`, so this case is what proves those paths were not widened
       * as a side effect of admitting the reads.
       */
      for (const name of CROSS_DOMAIN_READ_ONLY.filter((n) => n !== 'SwAlternateSkuCode')) {
        refusalOf(() => assertTableName(name));
      }

      refusalOf(() => assertTableName('SwAttributeValue'));
    });
  });

  describe('the COLUMN gate covers both halves of the registry', () => {
    it('[NET-NEW] assertRegisteredColumnName dispatches to the column-mapped half', () => {
      /*
       * For a name `TABLE_COLUMNS` maps, the unified gate must answer exactly what the original gate answers,
       * so routing a call site through it is not a behaviour change.
       */
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
        /*
         * `:L84` reaches this table through stock, exactly as the eight rows above it do —
         * `model/entity/VendorOrderItem.cfc:L60` declares `fkcolumn="stockID"` and declares no `sku`
         * property at all. This case previously asserted `skuID` here, which is why the registry could
         * withhold the one column the emitted chain names without any suite objecting.
         */
        ['SwVendorOrderItem', 'stockID'],
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

    it('[NET-NEW] it refuses a real column paired with the wrong table', () => {
      /*
       * The risk the column gate actually addresses. Spelling was never the hazard: `skuID` is declared on
       * eight of the twenty-eight registered tables and `stockID` on eight, so a mis-paired name is still a
       * real column and still composes SQL that parses — it simply answers the wrong question.
       */
      const error = refusalOf(() => assertRegisteredColumnName('SwOrderItem', 'stockID'));

      expect(error.message).toContain('ratified cross-domain table');
      expect(error.context).toEqual({
        table: 'SwOrderItem',
        candidate: 'stockID',
        scope: 'cross-domain-read-only',
      });

      /* And the converse pairing, to show the refusal is not one-directional. */
      refusalOf(() => assertRegisteredColumnName('SwInventory', 'skuID'));
      refusalOf(() => assertRegisteredColumnName('SwVendorOrderItem', 'skuID'));
      refusalOf(() => assertRegisteredColumnName('SwAttributeValue', 'globalFlag'));
    });

    it('[NET-NEW] it matches case-insensitively but answers the DECLARED spelling', () => {
      /*
       * The legacy interpolates these names with inconsistent casing — `modifiedDatetime` at
       * `model/dao/ProductDAO.cfc:L363` beside `CreatedByAccountID` at `:L365` — and got away with it because
       * SQL identifiers are case-insensitive on the engines it targeted. Resolving to the declaration removes
       * the dependency on that leniency.
       */
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
      /*
       * `EXTENDED_TABLE_COLUMNS` is annotated as a total `Record`, so adding a table to the registry without
       * declaring its columns fails the build. This case adds the run-time half: a declared-but-empty set
       * would satisfy the compiler and would make every column on that table unusable.
       */
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
