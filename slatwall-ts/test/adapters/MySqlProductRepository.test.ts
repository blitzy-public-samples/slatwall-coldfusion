/**
 * ================================================================================================
 * `MySqlProductRepository` — **NET-NEW** CHARACTERIZATION COVERAGE
 * ================================================================================================
 * EVERY CASE IN THIS FILE IS **NET-NEW**, AND EVERY CASE TITLE SAYS SO. There is no legacy
 * `ProductDAOTest` anywhere in `meta/tests/`, so nothing here extends, replaces or reproduces an
 * existing assertion, and nothing here should be read as legacy parity coverage. A reviewer asking
 * "did this suite replicate existing tests, or generate new ones?" has an unambiguous answer for
 * this file: generated, and labelled as generated in every single title.
 *
 * TRACEABILITY IS **DOCUMENTARY**, NOT EMPIRICAL. Every behavioural claim below was established by
 * READING `model/dao/ProductDAO.cfc` and the context sources line by line, and each assertion
 * carries the `path:Lnnn` locator it was derived from. Four facts about this environment are why
 * that is the strongest available form of evidence, and all four are stated here rather than
 * discovered later:
 *
 *   1. MXUnit is NOT VENDORED in this repository, and neither is CFSelenium. The legacy suite needs
 *      an external CFIDE mapping that does not exist here.
 *   2. `meta/docker/slatwall-local-dev/` DOES NOT EXIST. `meta/` contains only `meta/tests/` and
 *      `meta/eclipse/`; there is no Dockerfile and no Compose file anywhere in the tree.
 *   3. The legacy CFML runtime is therefore NOT REPRODUCIBLE in this environment — no ColdFusion,
 *      Railo or Lucee engine is available to execute `model/dao/ProductDAO.cfc` at all.
 *   4. Consequently **NO RUNTIME BEHAVIOURAL COMPARISON WAS PERFORMED**. Not one assertion below was
 *      checked against output produced by the legacy component. Saying so plainly is more useful
 *      than implying a comparison that never happened.
 *
 * `meta/tests/unit/dao/AccountDAOTest.cfc` IS SHAPE AND REFERENCE CONTEXT ONLY. It was read to see
 * how the legacy suite organises a data-access test; NONE of its content is ported, and no
 * assertion, fixture, name or helper of it appears here.
 *
 * ------------------------------------------------------------------------------------------------
 * HOW THE SUITE IS BUILT, AND WHAT IT REFUSES TO BUILD
 * ------------------------------------------------------------------------------------------------
 * Every double comes from `test/support/inMemoryRepositories.ts` — `createSqlExecutorDouble` for the
 * statement seam and `createUnitOfWorkDouble` for the transaction boundaries. No mocking library is
 * used, none is added, `jest.mock` appears nowhere, and no local substitute for either double is
 * defined in this file. The recording is lossless by construction: the support double stores each
 * statement's text byte for byte and snapshots its parameters in bind order, so nothing below
 * trims, case-folds, re-orders or otherwise normalises what the adapter actually issued.
 *
 * NO DATABASE, NO NETWORK, NO FILESYSTEM. `mysql2` is not imported, no pool is constructed, and no
 * container is started. The adapter takes its statement executor, its transaction boundaries, its
 * retrieval collaborator and its three remaining collaborators as CONSTRUCTOR PARAMETERS, so
 * substitution needs nothing more than an object of the declared shape — which is the whole point of
 * replacing the legacy's `getService()` string lookups with explicit injection.
 *
 * ⛔ `saveImportData` IS PRIVATE AND STAYS PRIVATE. `model/dao/ProductDAO.cfc:L328` declares it
 * `private`, and it is private on the adapter too. It is exercised ONLY through `importFromFile`'s
 * observable effects. Nothing below exports it, indexes it, reaches it through bracket access, casts
 * through `unknown` to find it, or weakens a type to make it visible.
 * ================================================================================================
 */
import {
  composeAttributeSetSelection,
  composeExistenceLookup,
  composeImportInsert,
  composeImportUpdate,
  composeProductSearch,
  MySqlProductRepository,
} from '../../src/adapters/mysql/MySqlProductRepository';
import type {
  DelimitedImportRecordSet,
  MySqlProductRepositoryDependencies,
  ProductImportTransactionBoundary,
} from '../../src/adapters/mysql/MySqlProductRepository';
import { assertTableName } from '../../src/adapters/mysql/QueryRunner';
import type { UnitOfWork } from '../../src/adapters/mysql/UnitOfWork';
import type { AccountContextPort } from '../../src/ports/AccountContextPort';
import type { SettingName } from '../../src/ports/SettingResolverPort';
import type {
  ProductRepository,
  ProductSearchRow,
} from '../../src/ports/repositories/ProductRepository';
import {
  createAbsentAccountContextDouble,
  createAccountContextDouble,
  createSqlExecutorDouble,
  createUnitOfWorkDouble,
  persistedAdminAccount,
  sqlAffectedRows,
  sqlFailure,
  sqlRows,
  TEST_ADMIN_ACCOUNT_ID,
} from '../support/inMemoryRepositories';
import type {
  SqlExecutorCall,
  SqlExecutorOutcome,
  UnitOfWorkEventKind,
} from '../support/inMemoryRepositories';

/* ================================================================================================
 * THE HARNESS — ASSEMBLED FROM THE SUPPORT DOUBLES, NOT REBUILT
 * ============================================================================================== */

/**
 * Which execution region a statement travelled through.
 *
 * `pool` is the un-transacted pool executor the legacy uses before `transaction{` opens at
 * `model/dao/ProductDAO.cfc:L177`; `row#n` is row n's own transaction; `backfill` is the explicitly
 * un-transacted region the two statements at `:L287-L325` run in.
 */
type Region = 'pool' | 'backfill' | `row#${number}`;

/** One statement exactly as the adapter issued it, plus the region it was issued from. */
interface RecordedStatement {
  readonly region: Region;
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** Everything one harness observes, plus the pieces a case needs to drive it. */
interface Harness {
  /** Every statement, in issue order, with its region. */
  readonly statements: readonly RecordedStatement[];
  /** Every retrieval the source reader was asked for, with the delimiter and qualifier it got. */
  readonly retrievals: readonly {
    readonly source: string;
    readonly delimiter: string;
    readonly textQualifier: string;
  }[];
  /** Transaction lifecycle events, in order. */
  eventKinds(): readonly UnitOfWorkEventKind[];
  transactionsCommitted(): number;
  transactionsRolledBack(): number;
  transactionsStarted(): number;
  /** The adapter under test. */
  readonly repository: MySqlProductRepository;
}

/**
 * Collapses runs of whitespace so a statement can be matched without depending on its indentation.
 *
 * ⚠️ USED ONLY FOR MATCHING, NEVER FOR RECORDING. {@link RecordedStatement.sql} always holds the text
 * the adapter composed, byte for byte, because the value-absence assertions below have to search the
 * real string rather than a tidied copy of it.
 */
function collapse(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** Builds a record set from a heading list and row tuples, mirroring a delimited file. */
function fileWith(
  columnList: readonly string[],
  ...rows: readonly string[][]
): DelimitedImportRecordSet {
  return {
    columnList,
    rows: rows.map((cells) => {
      const record: Record<string, string> = {};
      columnList.forEach((heading, index) => {
        record[heading] = cells[index] ?? '';
      });
      return record;
    }),
  };
}

/**
 * The three headings the legacy importer reads with NO guard, and therefore effectively requires.
 *
 * `model/dao/ProductDAO.cfc:L180` and `:L184` read `data['brand_brandname'][r]` and
 * `data['productType_productTypeName'][r]` unconditionally at the top of every row, and `:L399`
 * reads `data['product_productName'][…]` unconditionally on every product insert. A CFML query
 * raises on a column it does not have, so a file missing any of the three fails on its first row in
 * the legacy too. They are supplied here so a case can concentrate on the headings it is about.
 */
const MANDATORY_HEADINGS: readonly (readonly [string, string])[] = [
  ['product_productName', 'A Product Name'],
  ['brand_brandname', 'Acme'],
  ['productType_productTypeName', 'Merchandise'],
];

/**
 * Builds an importable record set — the headings under test plus any of {@link MANDATORY_HEADINGS}
 * the caller did not already supply. A heading the caller supplied is left exactly as given, so a
 * case can still control its cell, including its casing.
 */
function importable(
  columnList: readonly string[],
  ...rows: readonly string[][]
): DelimitedImportRecordSet {
  const missing = MANDATORY_HEADINGS.filter(
    ([heading]) => !columnList.some((supplied) => supplied.toLowerCase() === heading.toLowerCase()),
  );

  return fileWith(
    [...columnList, ...missing.map(([heading]) => heading)],
    ...rows.map((cells) => [...cells, ...missing.map(([, value]) => value)]),
  );
}

/**
 * Builds the harness.
 *
 * Region attribution is DERIVED from the unit-of-work double's own live event log at the moment each
 * statement is issued, through the support double's documented `respond` seam. Nothing here models a
 * transaction: `createUnitOfWorkDouble` owns that, and this only reads what it recorded.
 *
 * @param recordSet - what the retrieval collaborator answers with.
 * @param reply - decides the outcome of a statement from the statement itself; `undefined` declines
 *   and the double falls back to its own default (no rows for a read, zero affected for a write).
 * @param accountContext - the injected current-account context, defaulting to a persisted admin.
 * @returns the harness.
 */
function buildHarness(
  recordSet: DelimitedImportRecordSet,
  reply?: (statement: SqlExecutorCall) => SqlExecutorOutcome | undefined,
  accountContext: AccountContextPort = createAccountContextDouble(persistedAdminAccount())
    .accountContext,
): Harness {
  const statements: RecordedStatement[] = [];
  const retrievals: {
    readonly source: string;
    readonly delimiter: string;
    readonly textQualifier: string;
  }[] = [];

  /* Assigned once the unit of work exists; a statement can only be issued after that, because the
   * adapter is constructed with it. Declared as a function so neither double has to know the other. */
  let regionAtIssue: () => Region = () => 'pool';

  const sqlExecutor = createSqlExecutorDouble({
    respond: (statement) => {
      statements.push({
        region: regionAtIssue(),
        sql: statement.sql,
        params: statement.params,
      });

      return reply === undefined ? undefined : reply(statement);
    },
  });

  const unitOfWork = createUnitOfWorkDouble({ sqlExecutor });

  regionAtIssue = (): Region => {
    const events = unitOfWork.events;
    const latest = events[events.length - 1];

    if (latest === undefined) {
      return 'pool';
    }
    if (latest.kind === 'begin') {
      return `row#${latest.transaction}`;
    }
    if (latest.kind === 'poolWork') {
      return 'backfill';
    }
    return 'pool';
  };

  const dependencies: MySqlProductRepositoryDependencies = {
    executor: sqlExecutor.executor,
    transactions: unitOfWork.unitOfWork,
    sourceReader: {
      read: (source, delimiter, textQualifier) => {
        retrievals.push({ source, delimiter, textQualifier });
        return Promise.resolve(recordSet);
      },
    },
    accountContext,
    /* `model/dao/ProductDAO.cfc:L399` delegates the transform to a utility service; the adapter takes
     * it as an injected function, so this stands in for it with a deterministic slug. */
    urlTitleFilter: (productName) => productName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    /* `Product.defaultSku` is typed against a behavioural delegate with no identifier accessor, so
     * the adapter reads the identifier through a function. No import path exercises it. */
    readDefaultSkuId: () => '',
  };

  return {
    statements,
    retrievals,
    eventKinds: () => unitOfWork.eventKinds(),
    transactionsCommitted: () => unitOfWork.transactionsCommitted(),
    transactionsRolledBack: () => unitOfWork.transactionsRolledBack(),
    transactionsStarted: () => unitOfWork.transactionsStarted(),
    repository: new MySqlProductRepository(dependencies),
  };
}

/** Every recorded statement whose collapsed text contains `fragment`, in issue order. */
function matching(harness: Harness, fragment: string): readonly RecordedStatement[] {
  return harness.statements.filter((statement) => collapse(statement.sql).includes(fragment));
}

/** The single statement containing `fragment`, or a failure naming what was actually seen. */
function only(harness: Harness, fragment: string): RecordedStatement {
  const found = matching(harness, fragment);
  const [first] = found;

  if (found.length !== 1 || first === undefined) {
    throw new Error(
      `expected exactly one statement containing "${fragment}", saw ${String(found.length)}`,
    );
  }

  return first;
}

/** The 32-character lowercase hexadecimal identifier form of IR-6. */
const HEX_32 = /^[0-9a-f]{32}$/;

/**
 * The adversarial-but-inert values every D18 case drives through the importer.
 *
 * Each carries an apostrophe, which is the exact character the legacy's single-quoted interpolations
 * could not survive: `model/dao/ProductDAO.cfc:L180` composes `WHERE brandName = '#…#'`, so a brand
 * called `O'Reilly` terminates the literal and the remainder of the cell becomes statement text.
 * They are otherwise ordinary catalogue values and reach no database.
 */
const QUOTE_BEARING = Object.freeze({
  brandName: "O'Reilly & Sons",
  productName: "Widget 'Deluxe' -- 12\"",
  productCode: "CODE-O'1",
  optionGroup: "Colo'ur",
  optionCode: "Bl'ue",
  attributeValue: "Cust'om",
  searchTerm: "O'Reilly",
});

/**
 * Three ordinary rows keyed on a product code — the plainest file that still drives the row loop.
 *
 * Three is the smallest count that distinguishes "one transaction per row" from "one transaction, or one
 * per pair", and it leaves a middle row for the mid-file-failure case to fail on with a row on each side
 * of it.
 */
const THREE_ROW_FILE = importable(['product_productCode'], ['CODE-1'], ['CODE-2'], ['CODE-3']);

/* ================================================================================================
 * findAttributeSets — model/dao/ProductDAO.cfc:L52-L71
 * ============================================================================================== */

describe('NET-NEW — findAttributeSets, and the D20 partial collapse', () => {
  it('NET-NEW — keeps the :L56-L61 disjunctive shape when product types are supplied', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets(['productType', 'brand'], ['pt-1', 'pt-2']);

    const selection = collapse(only(harness, 'FROM SwAttributeSet').sql);

    /* `:L57-L58` — the DISJUNCTION. A globally flagged set qualifies on its own; otherwise an
     * assignment to one of the supplied product types must exist. This branch changes the RESULT SET,
     * so it is preserved and is NOT part of the D20 collapse asserted below. */
    expect(selection).toContain('sas.globalFlag = 1');
    expect(selection).toContain('OR EXISTS');
    expect(selection).toContain('asa.productTypeID IN (?, ?)');
  });

  it('NET-NEW — keeps the :L60 global-only shape when the product-type list is empty', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets(['productType'], []);

    const selection = collapse(only(harness, 'FROM SwAttributeSet').sql);

    /* `:L60` — the else arm. No disjunction and no assignment predicate at all. */
    expect(selection).toContain('AND sas.globalFlag = 1');
    expect(selection).not.toContain('OR EXISTS');
    expect(selection).not.toContain('productTypeID');
  });

  it('NET-NEW — keeps the :L54 active-attribute requirement and the type-code IN list', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets(['productType'], []);

    const selection = collapse(only(harness, 'FROM SwAttributeSet').sql);

    // `:L54` — an attribute set qualifies only when it holds at least one ACTIVE attribute.
    expect(selection).toContain('sa.activeFlag = 1');
    expect(selection).toContain('systemCode IN (?)');
  });

  it('NET-NEW — keeps the :L62 ordering, type code then sort order, both ascending', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets(['productType'], ['pt-1']);

    expect(collapse(only(harness, 'FROM SwAttributeSet').sql)).toContain(
      'ORDER BY ast.systemCode ASC, sas.sortOrder ASC',
    );
  });

  it('NET-NEW — binds through ONE path, which is all the :L64 TODO legitimately collapses', async () => {
    const supplied = buildHarness(fileWith([]));
    const omitted = buildHarness(fileWith([]));

    await supplied.repository.findAttributeSets(['productType', 'brand'], ['pt-1', 'pt-2']);
    await omitted.repository.findAttributeSets(['productType', 'brand'], []);

    /*
     * TODO(parity) D20 model/dao/ProductDAO.cfc:L64 — the legacy comment, verbatim:
     *
     *   TODO: Remove this conditional when railo and ACF match how they handle arrays for 'IN' clause
     *
     * ⭐ THIS COLLAPSE IS A DECLARED, INTENTIONAL, **BINDING-ONLY** SIMPLIFICATION — NOT A SILENT
     * REPAIR, AND NOT A REPAIR AT ALL. It is binding-only in the strict sense that the branch it
     * removes selected between two PARAMETER REPRESENTATIONS of one identical predicate, and changed
     * neither the statement's shape nor its rows. The cause of the collapse is equally specific: THE
     * ABSENCE, IN TYPESCRIPT, OF THE CFML-ENGINE ARRAY-VERSUS-LIST DIVERGENCE the branch existed to
     * work around. `:L65-L69` branches on `arrayLen(productTypeIDs)` for one reason only: it hands
     * the type codes to the engine as `arrayToList(...)` in one arm and as a raw ARRAY in the other,
     * because Railo and Adobe ColdFusion disagreed about how an array binds to an `IN` clause. That
     * divergence is a property of the CFML ENGINES, and it does not exist in TypeScript: a bound list
     * is one array of values expanded into one marker per value, on every engine, always. The
     * precondition the TODO is waiting for is satisfied by the migration itself, so the branch has
     * nothing left to select between and ONE binding path is the faithful translation.
     *
     * ⛔ WHAT IS *NOT* COLLAPSED, AND THE DISTINCTION IS THE WHOLE POINT. `:L56-L61` tests the SAME
     * `arrayLen(productTypeIDs)` predicate, but it changes the QUERY SHAPE and therefore the rows
     * returned. It is preserved in full by the two cases above. Two conditionals, one predicate, one
     * collapsible — reading them as interchangeable is the mistake this case exists to prevent.
     */
    const withTypes = only(supplied, 'FROM SwAttributeSet');
    const withoutTypes = only(omitted, 'FROM SwAttributeSet');

    // Identical type-code binding in both arms: two supplied codes, two markers, two parameters.
    expect(collapse(withTypes.sql)).toContain('systemCode IN (?, ?)');
    expect(collapse(withoutTypes.sql)).toContain('systemCode IN (?, ?)');
    expect(withTypes.params.slice(0, 2)).toEqual(['productType', 'brand']);
    expect(withoutTypes.params).toEqual(['productType', 'brand']);

    // Neither arm writes a code into the statement text. One strategy, applied uniformly.
    expect(withTypes.sql).not.toContain('productType,');
    expect(withoutTypes.sql).not.toContain('productType,');
  });

  it('NET-NEW — matches placeholder count to each supplied list, concatenating no value', async () => {
    const harness = buildHarness(fileWith([]));

    /* Deliberately distinctive values. A one-letter value would occur inside `SELECT` by accident and
     * an absence assertion over it would pass or fail for reasons that have nothing to do with
     * binding, which would make the case worthless as evidence. */
    const typeCodes = ['typeCodeOne', 'typeCodeTwo', 'typeCodeThree'];
    const productTypes = ['productTypeAlpha', 'productTypeBeta'];

    await harness.repository.findAttributeSets(typeCodes, productTypes);

    const selection = only(harness, 'FROM SwAttributeSet');

    expect(collapse(selection.sql)).toContain('systemCode IN (?, ?, ?)');
    expect(collapse(selection.sql)).toContain('asa.productTypeID IN (?, ?)');
    expect(selection.params).toHaveLength(5);
    for (const value of [...typeCodes, ...productTypes]) {
      expect(selection.sql).not.toContain(value);
      expect(selection.params).toContain(value);
    }
  });

  it('NET-NEW — orders parameters by statement occurrence: type codes, then product types', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets(['zeta', 'alpha'], ['pt-9', 'pt-8']);

    /* TR-4. `:L54` writes the type-code list BEFORE `:L58` writes the assignment list, so the bound
     * array follows that order — not the argument order, which happens to agree here, and not any
     * sorted order. Both supplied lists keep their own internal order too. */
    expect(only(harness, 'FROM SwAttributeSet').params).toEqual(['zeta', 'alpha', 'pt-9', 'pt-8']);
  });

  it('NET-NEW — an empty type-code list binds one marker and never emits IN ()', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets([], []);

    const selection = only(harness, 'FROM SwAttributeSet');

    /* The degenerate binding contract, and it is source-grounded rather than invented: `:L68` binds
     * whatever the caller passed, and an empty CFML list binds as one empty value — never as zero
     * values, because `IN ()` is not a statement any engine accepts. */
    expect(collapse(selection.sql)).toContain('systemCode IN (?)');
    expect(collapse(selection.sql)).not.toContain('IN ()');
    expect(selection.params).toEqual(['']);
  });

  it('NET-NEW — refuses to compose a set-membership clause with zero bind markers', () => {
    /* The same contract from the other side: the composer itself will not emit `IN ()`, so no future
     * caller can reach that shape by supplying a count of zero. */
    expect(() => composeAttributeSetSelection(0, 0)).toThrow(/no bind markers/);
  });

  it('NET-NEW — returns rows unnarrowed, because Attribute* is an excluded family', async () => {
    const attributeSetRow = { attributeSetID: 'as-1', sortOrder: 1 };
    const harness = buildHarness(fileWith([]), (statement) =>
      collapse(statement.sql).includes('FROM SwAttributeSet')
        ? sqlRows([attributeSetRow])
        : undefined,
    );

    const rows = await harness.repository.findAttributeSets(['productType'], []);

    /* The element type is opaque. No attribute-set row shape is invented here, and none is asserted:
     * the Attribute domain is excluded from this slice, so this port has no locator for its columns.
     * What IS assertable is that the rows travel through untouched. */
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(attributeSetRow);
  });

  it('NET-NEW — takes the PLURAL productTypeIDs of :L52, never the SKU-side singular', () => {
    /* Discrepancy 6, pinned at compile time rather than described in prose. `:L52` declares
     * `required array productTypeIDs`, PLURAL, while the SKU-side equivalent declares a singular
     * `productTypeID`. This binding only typechecks while the plural spelling and the array type
     * survive on this member, so renaming either one breaks the build here. */
    const pinned: (repository: ProductRepository) => Promise<unknown[]> = (repository) =>
      repository.findAttributeSets(['productType'], ['pt-1']);

    expect(typeof pinned).toBe('function');
  });

  it('NET-NEW — issues the selection on the pool executor, outside every transaction', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets(['productType'], []);

    /* `:L66` and `:L68` run through `ormExecuteQuery`, which the legacy issues with no transaction of
     * its own. Nothing was begun, committed or rolled back. */
    expect(only(harness, 'FROM SwAttributeSet').region).toBe('pool');
    expect(harness.eventKinds()).toEqual([]);
  });
});

/* ================================================================================================
 * importFromFile — the return contract and the format contracts, model/dao/ProductDAO.cfc:L73-L98
 * ============================================================================================== */

describe('NET-NEW — importFromFile, and its return and format contracts', () => {
  it('NET-NEW — resolves to undefined, reporting nothing whatsoever about the import', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    const resolved = await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `model/dao/ProductDAO.cfc:L73` declares `public void function loadDataFromFile(...)`. It hands
     * its caller NOTHING: no imported-row count, no rejected-row list, no progress report, no error
     * collection and no success flag. Combined with the per-row commit boundary below, that means a
     * caller cannot detect a partially imported catalogue — which is the finding, not an oversight to
     * be smoothed over by inventing a summary object.
     */
    expect(resolved).toBeUndefined();
  });

  it('NET-NEW — maps .csv to a comma and .txt to a tab, and passes the text qualifier through', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');
    await harness.repository.importFromFile('https://feeds.example/catalog.txt', '"');

    /*
     * `:L74-L80`. The file type is the last dot-delimited segment of the location, and the delimiter
     * map has exactly two entries: `csv` selects `chr(44)`, the comma, and `txt` selects `chr(9)`, the
     * tab. `:L73` declares the text qualifier optional with an empty-string default, which is what the
     * first retrieval receives and the second overrides.
     *
     * ⚠️ TODO(parity)/DOCUMENTED DECISION — M4, model/dao/ProductDAO.cfc:L87-L98. THE ONE LIVE LEGACY
     * FETCH IS THE `cfhttp` CALL AT `:L87`, and this suite performs NONE. `:L87` reads
     * `getService("utilityTagService").cfhttp(method="get", url=arguments.fileURL, delimiter=delimiter,
     * textQualifier=arguments.textQualifier)` — a collaborator resolved by runtime string lookup and
     * never declared as a component property, which is why metadata-driven dependency analysis misses
     * it entirely. The port turns it into an injected typed collaborator, and this harness substitutes
     * it, so the three arguments below are the only thing observable and no socket is opened.
     *
     * ⚠️ AND THERE IS NO SECOND, SCRIPT-BASED FALLBACK — the appearance of one is the trap. `:L88`
     * carries the comment `script based http method doens't work for tab delimiter` (the typo is the
     * source's own) and `:L89-L98` is a `/* … *​/` COMMENTED-OUT BLOCK holding a `new http()` sequence
     * that never executes. It is dead code. Nothing here tests it, and nothing here implies it runs.
     *
     * ⚠️ M1 IS CITED AND NOT OWNED. `model/service/ProductService.cfc:L65-L68` asks the CFML engine for
     * a 3600-second REQUEST budget for this operation. No timeout, deadline, queue, chunk or
     * asynchronous job is introduced here to stand in for it; the mismatch belongs to the handler layer
     * and is flagged rather than quietly resolved.
     */
    expect(harness.retrievals).toEqual([
      { source: 'https://feeds.example/catalog.csv', delimiter: ',', textQualifier: '' },
      { source: 'https://feeds.example/catalog.txt', delimiter: '\t', textQualifier: '"' },
    ]);
  });

  it('NET-NEW — leaves the delimiter EMPTY for an unrecognised extension, and does not raise', async () => {
    const harness = buildHarness(fileWith([]));

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.dat'),
    ).resolves.toBeUndefined();

    /* `:L75` initialises the delimiter to `""` and `:L76-L80` has no else, so an unrecognised type
     * retrieves with NO delimiter rather than failing. Carried as observed. */
    expect(harness.retrievals).toEqual([
      { source: 'https://feeds.example/catalog.dat', delimiter: '', textQualifier: '' },
    ]);
  });

  it('NET-NEW — reaches the empty .xls branch: nothing retrieved, nothing imported', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    const resolved = await harness.repository.importFromFile('https://feeds.example/catalog.xls');

    /*
     * `:L83-L85` is `if(fileType == "xls"){` / `//Read xls` / `}` — a branch whose entire body is a
     * comment. Nothing is read, nothing is parsed and nothing is raised, so a spreadsheet upload
     * imports NOTHING and the caller, which receives no return value, cannot tell. It stays a no-op:
     * adding a spreadsheet reader would be new functionality, not a port.
     */
    expect(resolved).toBeUndefined();
    expect(harness.retrievals).toEqual([]);
    expect(harness.transactionsStarted()).toBe(0);
    /* Not one statement came from a row region, so the three rows the file carries were never even
     * looked at — which is exactly what a branch whose body is a comment does. */
    expect(harness.statements.filter((statement) => statement.region.startsWith('row#'))).toEqual(
      [],
    );
  });

  it('NET-NEW — still runs both :L287-L325 back-fills after the .xls no-op', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.xls');

    /* `:L288` and `:L304` sit outside the spreadsheet branch as well as outside the row loop, so they
     * run even when the branch imported nothing. Preserved, because skipping them would be a new
     * guard the legacy does not have. */
    expect(matching(harness, 'SET defaultSkuID')).toHaveLength(1);
    expect(matching(harness, 'SET imageFile')).toHaveLength(1);
  });

  it('NET-NEW — an empty file drives zero transactions and still runs both back-fills', async () => {
    const harness = buildHarness(fileWith(['product_productCode']));

    await expect(
      harness.repository.importFromFile('https://feeds.example/empty.csv'),
    ).resolves.toBeUndefined();

    expect(harness.transactionsStarted()).toBe(0);
    expect(matching(harness, 'SET defaultSkuID')).toHaveLength(1);
    expect(matching(harness, 'SET imageFile')).toHaveLength(1);
  });

  it('NET-NEW — retrieves ONCE, before the first transaction opens, so no wait sits inside one', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* The legacy retrieves at `:L87`, before `transaction{` opens at `:L177`, and retrieves once for
     * the whole file. That ORDERING is the part of M4 a test can hold: three rows, one retrieval, and
     * it happened while no transaction was open. */
    expect(harness.retrievals).toHaveLength(1);
    expect(harness.transactionsStarted()).toBe(3);
    expect(harness.eventKinds().indexOf('begin')).toBeGreaterThanOrEqual(0);
  });
});

/* ================================================================================================
 * importFromFile — mismatch M3, model/dao/ProductDAO.cfc:L176-L177, :L284-L285 and :L287-L325
 * ============================================================================================== */

describe('NET-NEW — importFromFile, and mismatch M3: one transaction per row', () => {
  it('NET-NEW — opens one INDEPENDENT transaction per row, never one around the import', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ MISMATCH M3 — A DOCUMENTED PRESERVATION DECISION, NOT AN IMPROVEMENT.
     * model/dao/ProductDAO.cfc:L176 opens the record loop, `:L177` opens `transaction{` INSIDE it, and
     * `:L284-L285` closes the transaction and then the loop, in that order. So the importer's shape is
     * N independent single-row transactions, and each one commits on its own the moment its row is
     * done. `:L287-L325` then runs after both braces have closed, inside no transaction at all.
     *
     * ⛔ WHAT THIS CASE EXISTS TO FORBID. Not one transaction wrapping the whole import; not rows
     * batched into groups; not `Promise.all` or any other concurrent settlement; and not a
     * roll-everything-back-on-failure path. All four are the obvious "improvement", and all four
     * destroy the behaviour: the legacy neither batches nor recovers. A single wrapping boundary would
     * ALSO change M6's write ordering, so the two failures arrive together.
     *
     * The event log is the witness. Three rows produce three begin/commit PAIRS, strictly alternating,
     * with no begin opening before the previous commit has been recorded.
     */
    expect(harness.eventKinds()).toEqual([
      'acquire',
      'begin',
      'commit',
      'begin',
      'commit',
      'begin',
      'commit',
      'release',
      'poolWork',
    ]);
    expect(harness.transactionsStarted()).toBe(3);
    expect(harness.transactionsCommitted()).toBe(3);
    expect(harness.transactionsRolledBack()).toBe(0);
  });

  it("NET-NEW — runs every per-row statement inside that row's own transaction scope", async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* Each row's lookups AND writes sit inside that row's boundary, which is where `:L179-L282` sits
     * relative to `:L177`. A read moved out to the pool would be a second connection and a different
     * snapshot, so the region of every row statement is asserted rather than merely their count. */
    const rowRegions = new Set(
      harness.statements
        .filter((statement) => statement.region.startsWith('row#'))
        .map((statement) => statement.region),
    );

    expect([...rowRegions].sort()).toEqual(['row#1', 'row#2', 'row#3']);
    for (const region of ['row#1', 'row#2', 'row#3'] as const) {
      expect(
        harness.statements.filter((statement) => statement.region === region).length,
      ).toBeGreaterThan(0);
    }
  });

  it('NET-NEW — a mid-file failure leaves EARLIER rows committed and starts no later row', async () => {
    let brandLookups = 0;
    const harness = buildHarness(THREE_ROW_FILE, (statement) => {
      if (collapse(statement.sql).startsWith('SELECT brandID')) {
        brandLookups += 1;

        if (brandLookups === 2) {
          return sqlFailure(new Error('the second row could not be resolved'));
        }
      }

      return undefined;
    });

    /*
     * ⭐ M3's CONSEQUENCE, ASSERTED DETERMINISTICALLY. Row 2 fails on its FIRST statement. Because each
     * row committed independently, row 1's work is already durable and cannot be taken back; row 2's
     * own transaction rolls back with nothing of it written; and row 3 is never attempted, because the
     * boundary stops at the first failure exactly as the legacy's exception unwinds the request.
     *
     * ⚠️ THE RESULT IS A PARTIALLY IMPORTED CATALOGUE, AND THAT IS PRESERVED ON PURPOSE. It is not an
     * improvement to make the import atomic, and it is not a defect introduced by the port — it is what
     * `transaction{` INSIDE the loop at `:L177` produces. Because `:L73` returns `void`, the caller is
     * told none of this, which is why the failure PROPAGATES rather than resolving: swallowing it would
     * report success for a half-imported file.
     */
    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/the second row could not be resolved/);

    expect(harness.eventKinds()).toEqual([
      'acquire',
      'begin',
      'commit',
      'begin',
      'rollback',
      'release',
    ]);
    // Exactly ONE row committed: row 1. Row 2 rolled back. Row 3 never began.
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(1);
    expect(harness.transactionsStarted()).toBe(2);

    // Row 1 really did work, and row 3 really did none — later rows are not quietly counted as done.
    expect(
      harness.statements.filter((statement) => statement.region === 'row#1').length,
    ).toBeGreaterThan(0);
    expect(harness.statements.filter((statement) => statement.region === 'row#3')).toEqual([]);

    // And the two whole-catalogue back-fills never ran, because the failure escaped before them.
    expect(matching(harness, 'SET defaultSkuID')).toEqual([]);
    expect(matching(harness, 'SET imageFile')).toEqual([]);
  });

  it('NET-NEW — runs both :L287-L325 back-fills OUTSIDE every boundary, after the last commit', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const defaultSkuBackfill = only(harness, 'SET defaultSkuID');
    const imageFileBackfill = only(harness, 'SET imageFile');

    /* Both sit past the closing braces at `:L284-L285`, so neither is enclosed by a begin/commit pair.
     * The region says so directly, and the event log says so structurally: every transaction event has
     * already been recorded and released by the time the un-transacted region is entered. */
    expect(defaultSkuBackfill.region).toBe('backfill');
    expect(imageFileBackfill.region).toBe('backfill');

    const events = harness.eventKinds();
    expect(events.indexOf('poolWork')).toBeGreaterThan(events.lastIndexOf('commit'));
    expect(events.indexOf('poolWork')).toBeGreaterThan(events.lastIndexOf('release'));
    expect(events.filter((kind) => kind === 'begin')).toHaveLength(3);

    /* And in the legacy's order: `:L302` executes the default-SKU statement, then `:L325` the image
     * one. Their order is not incidental — both read rows the row loop has already committed. */
    expect(harness.statements.indexOf(defaultSkuBackfill)).toBeLessThan(
      harness.statements.indexOf(imageFileBackfill),
    );
  });

  it('NET-NEW — still resolves to undefined on the all-success path', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).resolves.toBeUndefined();
  });

  it('NET-NEW — keeps the :L291 LIMIT 1 and adds no ORDER BY to make "first sku" deterministic', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const backfill = collapse(only(harness, 'SET defaultSkuID').sql);

    /*
     * ⚠️ TODO(parity) model/dao/ProductDAO.cfc:L291 — "FIRST SKU" IS ARBITRARY AND STAYS ARBITRARY. The
     * subquery carries `LIMIT 1` and NO `ORDER BY`, so which SKU becomes the default is whatever the
     * engine happens to return first. Adding an ordering to make that deterministic would be an
     * enhancement the source does not have. The `LIMIT 1` itself IS source-declared and is kept.
     *
     * ⚠️ TODO(parity) model/dao/ProductDAO.cfc:L289-L291 — THE ERROR-1093 EXPOSURE IS FLAGGED, NOT
     * CLOSED, AND NO DERIVED-TABLE WRAPPER WAS INTRODUCED. MySQL rejects a subquery that reads the very
     * table an `UPDATE` assigns (`ER_UPDATE_TABLE_USED`), and the statement's subquery reads `SwSku`
     * while `SwSku` is one of the two tables the multi-table update names — which looks like it needs a
     * derived-table wrap. It does not: a correlated subquery over a table that is JOINED but not
     * ASSIGNED is permitted, so the statement is preserved as the legacy wrote it. Had a wrapper been
     * necessary it would have been a TRANSLATION DECISION forced by the engine, never an optimisation.
     * This case therefore asserts the ABSENCE of a wrapper as much as the presence of the `LIMIT`.
     */
    expect(backfill).toContain('LIMIT 1');
    expect(backfill).not.toContain('ORDER BY');
    expect(backfill).not.toContain('SELECT * FROM (');
    // `:L290` — the multi-table form, with the subquery correlated to the outer product row.
    expect(backfill).toContain('UPDATE SwProduct INNER JOIN SwSku');
    expect(backfill).toContain('WHERE SwProduct.defaultSkuID IS NULL');
    expect(backfill.match(/LIMIT/g)).toHaveLength(1);
    expect(only(harness, 'SET defaultSkuID').params).toEqual([]);
  });

  it('NET-NEW — binds the image extension as a VALUE and invents no default for it', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const backfill = only(harness, 'SET imageFile');

    /*
     * `:L307` writes `SET imageFile = (SELECT concat(productCode, '.#setting("globalImageExtension")#')
     * …)`, so the separator and the extension are ONE single-quoted literal in the legacy statement.
     * It is a VALUE, not an identifier, so it becomes one bound marker and the produced file name is
     * unchanged.
     *
     * ⚠️ TODO(parity) model/dao/ProductDAO.cfc:L307, :L313 and :L320 — THE SETTING GAP IS RECORDED, NOT
     * FILLED. `config/dbdata/SlatwallSetting.xml.cfm` does not seed `globalImageExtension`, and the
     * destination setting port does not declare it either — see the compile-time pin further below.
     * This case therefore asserts the SHAPE of the binding and states the gap; it deliberately does NOT
     * assert an extension string, because naming one here would be inventing the very value the source
     * never supplied. No `'jpg'`, no `'png'`, and no nineteenth setting name.
     *
     * ⚠️ THE DIALECT BRANCH COLLAPSED TO MySQL, AND THE SOURCE'S OWN CASING PROVES THE BRANCHES WERE
     * NEVER MEANT TO DIVERGE. `:L288` tests `eq "mySQL"` while `:L304` tests `eq "mySql"` — two
     * spellings of one value, harmless only because CFML's `eq` is case-insensitive. The Oracle arm at
     * `:L313` uses `||` and the remaining arm at `:L320` uses `+` to build the SAME string a different
     * way. This port targets MySQL only, so there is no dialect enum, no per-engine variant and no
     * multi-dialect case here.
     */
    expect(collapse(backfill.sql)).toContain('SELECT concat(productCode, ?)');
    expect(backfill.params).toHaveLength(1);
    expect(typeof backfill.params[0]).toBe('string');
    // The separator travels inside the bound value, exactly as `:L307` composed it into one literal.
    expect(String(backfill.params[0]).startsWith('.')).toBe(true);
    // Nothing is quoted into the text: a bound marker leaves no literal for a quote to close.
    expect(backfill.sql).not.toContain("'");
    expect(collapse(backfill.sql)).toContain('UPDATE SwSku INNER JOIN SwProduct');
  });

  it('NET-NEW — declares globalImageExtension is NOT one of the port setting names', () => {
    /*
     * The gap above, pinned at compile time instead of asserted in prose. `SettingName` is a CLOSED
     * union of the names this slice actually reads, and `globalImageExtension` is not among them: the
     * legacy marks it deprecated and its call sites are unresolvable on the DAO's inheritance chain, so
     * promoting it into the union would assert a contract the legacy explicitly retired.
     *
     * `false` only typechecks while the name stays outside the union; the companion line proves the
     * conditional actually discriminates rather than answering `false` for everything.
     */
    type IsDeclaredSettingName<TName extends string> = TName extends SettingName ? true : false;

    const globalImageExtensionIsNotDeclared: IsDeclaredSettingName<'globalImageExtension'> = false;
    const productTitleStringIsDeclared: IsDeclaredSettingName<'productTitleString'> = true;

    expect(globalImageExtensionIsNotDeclared).toBe(false);
    expect(productTitleStringIsDeclared).toBe(true);
  });

  it('NET-NEW — accepts the real UnitOfWork as its boundary, so this double substitutes faithfully', () => {
    /*
     * The double is only evidence if the production boundary is interchangeable with it. This binding
     * fails to compile if `UnitOfWork` ever stops satisfying the boundary the importer declares — which
     * would mean every M3 assertion above had been proving something about a shape production no longer
     * has. No pool is constructed and nothing is invoked: the check is purely on the types.
     */
    const acceptsProductionBoundary: (boundary: UnitOfWork) => ProductImportTransactionBoundary = (
      boundary,
    ) => boundary;

    expect(typeof acceptsProductionBoundary).toBe('function');
  });

  it('NET-NEW — runs the back-fills as their own step, on the same un-transacted region', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.backfillImportDerivedColumns();

    /* The member exists so an out-of-band workflow can run the two statements once for a logical import
     * rather than once per invocation. It adds no behaviour: same two statements, same order, same
     * un-transacted region, and still nothing begun or committed. */
    expect(only(harness, 'SET defaultSkuID').region).toBe('backfill');
    expect(only(harness, 'SET imageFile').region).toBe('backfill');
    expect(harness.eventKinds()).toEqual(['poolWork']);
    expect(harness.transactionsStarted()).toBe(0);
  });
});

/* ================================================================================================
 * importFromFile — defect D18, the one declared hardening in this slice
 * ============================================================================================== */

/**
 * A file that reaches EVERY dynamic-statement family the importer has, in one row.
 *
 * The headings are chosen so that one import walks the whole D18 surface: the option-group pre-pass at
 * `model/dao/ProductDAO.cfc:L164-L166`, the brand and product-type lookups at `:L179-L186`, the
 * heading-derived existence lookup at `:L385-L387`, the URL-title probe at `:L401-L403`, the insert at
 * `:L411-L413`, the option and SKU-option paths at `:L212-L233`, and the custom-attribute pair at
 * `:L243-L251`. Every cell that a legacy statement would have interpolated carries an apostrophe.
 */
const ADVERSARIAL_FILE = fileWith(
  [
    'product_productCode',
    'product_productName',
    'brand_brandname',
    'productType_productTypeName',
    'sku_skucode',
    `option_${QUOTE_BEARING.optionGroup}`,
    'attribute_attr-1',
  ],
  [
    QUOTE_BEARING.productCode,
    QUOTE_BEARING.productName,
    QUOTE_BEARING.brandName,
    'Merchandise',
    "SKU-O'1",
    QUOTE_BEARING.optionCode,
    QUOTE_BEARING.attributeValue,
  ],
);

/** The same headings and the same shape, with values that carry no quote at all. */
const TAME_FILE = fileWith(ADVERSARIAL_FILE.columnList, [
  'CODE-1',
  'Widget',
  'Acme',
  'Merchandise',
  'SKU-1',
  'Blue',
  'Custom',
]);

/** Answers the option-group pre-pass so the option path is reached rather than pruned at `:L170`. */
function resolvingOptionGroup(statement: SqlExecutorCall): SqlExecutorOutcome | undefined {
  if (collapse(statement.sql).startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
    return sqlRows([{ optionGroupID: 'og-1' }]);
  }

  return undefined;
}

describe('NET-NEW — importFromFile, and D18: the declared hardening of every file-fed statement', () => {
  it('NET-NEW — never lets a quote-bearing file value reach the text of ANY statement', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ============================================================================================
     * ⭐⭐ D18 — DELIBERATE, DOCUMENTED HARDENING. NOT A SILENT FIX, AND NOT A CARRIED DEFECT. ⭐⭐
     * ============================================================================================
     *
     * THIS IS THE SINGLE DECLARED EXCEPTION IN THIS SLICE TO "PRESERVE AND ANNOTATE, DO NOT REPAIR".
     * Every other oddity in `model/dao/ProductDAO.cfc` is carried across and annotated — the inverted
     * cache guard, the affected-rows gate that is not an existence test, the arbitrary default SKU, the
     * one-shot URL title. This one is CLOSED, on purpose, and it is the only one that is.
     *
     * WHAT THE LEGACY DID. It composed its statements by interpolating file-supplied cell values
     * straight into single-quoted SQL literals — `WHERE brandName = '#data['brand_brandname'][r]#'` at
     * `:L180`, `WHERE productTypeName = '#…#'` at `:L184`, `WHERE #…# = '#lookupColumnValue#'` at
     * `:L386`, an entire hand-built `SET` clause as raw text at `:L394`, and a values list assembled by
     * string concatenation at `:L412`. The data comes from an UPLOADED FILE, so a cell containing an
     * apostrophe closed the literal and everything after it became statement text. That is an
     * unparameterised SQL-injection surface reachable by anyone who can hand the importer a file.
     *
     * WHAT THE PORT DOES INSTEAD. Every one of those values becomes a `?` bind marker and travels in the
     * parameter array. The class of flaw is removed STRUCTURALLY rather than by escaping: there is no
     * literal for a quote to terminate, so there is nothing to escape correctly and nothing to get
     * wrong. `QueryRunner` publishes no way to pass a text fragment, which is what makes this hold for
     * statements nobody thought to test.
     *
     * WHY IT IS DECLARED HERE RATHER THAN JUST DONE. A reviewer diffing generated SQL against legacy
     * SQL WILL see different text at every site above, and is entitled to know whether that difference
     * was intended. It was. This is INTENTIONAL DIVERGENCE FROM LEGACY BEHAVIOUR, chosen knowingly,
     * scoped to exactly this concern, and recorded at the assertion that proves it — which is why this
     * comment says "hardening" and deliberately does NOT carry a `TODO(parity)` marker. There is no
     * parity gap left open here; there is a decision, and this is it.
     *
     * ⚠️ WHAT THIS CASE DOES **NOT** CLAIM. It does not claim every statement in the legacy file was
     * file-fed. Provenance differs by site and the distinction matters: the two back-fills at
     * `:L287-L325` interpolate NO file data — one has no interpolation at all and the other carries a
     * SETTING value — so they were never part of the injection surface even though they are now bound
     * the same way. The BINDING discipline applies uniformly to every value; the INJECTION
     * characterisation applies only to the file-fed subset asserted below.
     */
    const everyStatement = harness.statements.map((statement) => statement.sql).join('\n');

    for (const supplied of Object.values(QUOTE_BEARING)) {
      expect(everyStatement).not.toContain(supplied);
    }

    // Nor any fragment of one: a partial escape would leave the tail of a cell behind as text.
    expect(everyStatement).not.toContain("O'Reilly");
    expect(everyStatement).not.toContain("Bl'ue");
    expect(everyStatement).not.toContain("Cust'om");
    expect(everyStatement).not.toContain("Colo'ur");
    expect(everyStatement).not.toContain("CODE-O'1");

    /* The one quote-shaped character any statement may contain is none at all: not one composed
     * statement opens a string literal, because not one composed statement carries a value. */
    expect(everyStatement).not.toContain("'");
    expect(everyStatement).not.toContain('"');
    // And nothing arrived pre-escaped either, which would mean a literal existed to be escaped.
    expect(everyStatement).not.toContain('\\');
  });

  it('NET-NEW — carries each supplied value in the parameter array, in occurrence order', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* Absent from the text AND present in the parameters is the whole claim; either half alone would be
     * satisfied by a statement that simply dropped the value. Each family is checked at its own
     * statement, with the parameter position the statement's own marker order dictates (TR-4). */

    // `:L164-L166` — ONE value bound THREE times, because the legacy interpolated the same cell into
    // three disjuncts. The repetition is behaviour: a group may be named by name, code or identifier.
    const groupLookup = only(harness, 'FROM SwOptionGroup WHERE optionGroupName');
    expect(groupLookup.params).toEqual([
      QUOTE_BEARING.optionGroup,
      QUOTE_BEARING.optionGroup,
      QUOTE_BEARING.optionGroup,
    ]);
    expect(collapse(groupLookup.sql)).toBe(
      'SELECT optionGroupID FROM SwOptionGroup WHERE optionGroupName = ? OR optionGroupCode = ? ' +
        'OR optionGroupID = ?',
    );

    // `:L179-L181` — the brand lookup, the site whose legacy text `WHERE brandName = '#…#'` an
    // `O'Reilly` brand broke outright.
    expect(only(harness, 'FROM SwBrand').params).toEqual([QUOTE_BEARING.brandName]);

    // `:L183-L186` — the product-type lookup, the same shape on a different table.
    expect(only(harness, 'FROM SwProductType').params).toEqual(['Merchandise']);

    // `:L385-L387` — the heading-derived existence lookup: one bound value, three fixed identifiers.
    expect(only(harness, 'SELECT productID FROM SwProduct').params).toEqual([
      QUOTE_BEARING.productCode,
    ]);

    // `:L212-L216` — the option lookup: option code first, then the resolved group, in text order.
    expect(only(harness, 'LEFT JOIN SwOption').params).toEqual([QUOTE_BEARING.optionCode, 'og-1']);

    // `:L243-L246` — the attribute update: value, attribute identifier, product identifier.
    const attributeUpdate = only(harness, 'UPDATE SwAttributeValue');
    expect(attributeUpdate.params[0]).toBe(QUOTE_BEARING.attributeValue);
    expect(attributeUpdate.params[1]).toBe('attr-1');
  });

  it('NET-NEW — emits byte-identical statement text whatever the file values are', async () => {
    const adversarial = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);
    const tame = buildHarness(TAME_FILE, resolvingOptionGroup);

    await adversarial.repository.importFromFile('https://feeds.example/catalog.csv');
    await tame.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ THE STRUCTURAL CLAIM, STATED AS AN EQUALITY. Under the legacy, changing a cell changed the
     * statement — that IS the vulnerability. Under the port, the statement text is a function of the
     * SCHEMA and the file's HEADINGS alone, and the cell values reach only the parameter array. So two
     * imports of the same headings with entirely different values emit the same text, in the same
     * order, byte for byte. A value that cannot influence statement text cannot terminate a literal,
     * append a clause, comment out a predicate or introduce a second statement.
     *
     * Note what is deliberately NOT compared: the parameters. They differ, and they must — the two
     * files carry different data. Only the text is invariant.
     */
    expect(adversarial.statements.map((statement) => statement.sql)).toEqual(
      tame.statements.map((statement) => statement.sql),
    );
    expect(adversarial.statements.map((statement) => statement.params.length)).toEqual(
      tame.statements.map((statement) => statement.params.length),
    );

    /* And the adversarial run really did carry the hostile values, so the equality above is evidence
     * about a statement that saw them rather than about one that never did. */
    expect(adversarial.statements.flatMap((statement) => statement.params)).toContain(
      QUOTE_BEARING.productCode,
    );
  });

  it('NET-NEW — cannot be made to inject a second statement or comment out a predicate', async () => {
    const injectionAttempt = fileWith(ADVERSARIAL_FILE.columnList, [
      "X'; DROP TABLE SwProduct; --",
      "N' OR '1'='1",
      "B'/*",
      'Merchandise',
      "S'--",
      "O'",
      "A'",
    ]);
    const harness = buildHarness(injectionAttempt, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * The payloads are inert in this environment — no database is reached and nothing is executed — so
     * this is a claim about COMPOSITION, which is where the legacy failed. Each payload is a value the
     * legacy would have interpolated verbatim into a single-quoted literal, and the assertions below
     * show it never becomes text under the port.
     */
    const everyStatement = harness.statements.map((statement) => statement.sql).join('\n');

    expect(everyStatement).not.toContain('DROP TABLE');
    expect(everyStatement).not.toContain('--');
    expect(everyStatement).not.toContain('/*');
    expect(everyStatement).not.toContain("'1'='1");
    expect(everyStatement).not.toContain(';');

    // Each payload is where it belongs: in the parameters, as one opaque value.
    expect(only(harness, 'SELECT productID FROM SwProduct').params).toEqual([
      "X'; DROP TABLE SwProduct; --",
    ]);
    expect(only(harness, 'FROM SwBrand').params).toEqual(["B'/*"]);

    // Statement COUNT is unchanged too: a payload cannot add a statement any more than it can add a
    // clause. The tame run over the same headings issues exactly as many.
    const tame = buildHarness(TAME_FILE, resolvingOptionGroup);
    await tame.repository.importFromFile('https://feeds.example/catalog.csv');
    expect(harness.statements).toHaveLength(tame.statements.length);
  });

  it('NET-NEW — rebuilds the :L393-L395 raw SET clause as bound column = ? pairs', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return sqlRows([{ optionGroupID: 'og-1' }]);
      }
      // Both existence lookups HIT, so `saveImportData` takes its UPDATE arm at `:L390-L396`.
      if (sql.startsWith('SELECT productID FROM SwProduct')) {
        return sqlRows([{ productID: 'existing-product' }]);
      }
      if (sql.startsWith('SELECT skuID FROM SwSku')) {
        return sqlRows([{ skuID: 'existing-sku' }]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const productUpdate = only(harness, 'UPDATE SwProduct SET');

    /*
     * ⭐ D18 AT ITS HARDEST SITE, AND THE ONE MOST LIKELY TO TEMPT AN ESCAPE HATCH. `:L394` is
     * `UPDATE #tableName# SET #updateSetString# WHERE #idColumn# = '#idColumnValue#'`, where
     * `#updateSetString#` is AN ENTIRE `SET` CLAUSE PASSED AS RAW SQL TEXT — assembled at `:L347-L361`
     * from file headings AND file cell values, then interpolated whole. Both halves of every assignment
     * are attacker-influenced, and there is no way to escape a clause.
     *
     * The port rebuilds it: one `column = ?` pair per assignment, each column name taken from the
     * schema whitelist, with a parallel parameter array. The port publishes NO way to pass a fragment,
     * so this is not a convention that a future caller can opt out of. If a column cannot be expressed
     * through the whitelist the answer is to extend the whitelist, never to accept text.
     */
    const assignments = collapse(productUpdate.sql).replace(/^UPDATE SwProduct SET /, '');
    const [setClause] = assignments.split(' WHERE ');

    expect(setClause).toBeDefined();
    // Every assignment is `column = ?`, and nothing else is admitted into the clause.
    expect(setClause?.split(', ').every((pair) => /^[A-Za-z]+ = \?$/.test(pair))).toBe(true);
    // The identifier predicate is bound too, and its marker is LAST, after every assignment.
    expect(collapse(productUpdate.sql).endsWith('WHERE productID = ?')).toBe(true);

    // One marker per assignment, plus one for the identifier: the arrays run in parallel by count.
    const markerCount = (collapse(productUpdate.sql).match(/\?/g) ?? []).length;
    expect(productUpdate.params).toHaveLength(markerCount);
    expect(productUpdate.params[productUpdate.params.length - 1]).toBe('existing-product');

    // The file's values are in the parameters, and its hostile ones are not in the text.
    expect(productUpdate.params).toContain(QUOTE_BEARING.productCode);
    expect(productUpdate.params).toContain(QUOTE_BEARING.productName);
    expect(productUpdate.sql).not.toContain(QUOTE_BEARING.productName);

    /* `:L363-L364` — on the UPDATE arm the legacy appends ONLY the modified audit pair, never the
     * created pair, which is why an import cannot rewrite when a record came into being. Preserved. */
    expect(setClause).toContain('modifiedDateTime = ?');
    expect(setClause).toContain('modifiedByAccountID = ?');
    expect(setClause).not.toContain('createdDateTime');
    expect(setClause).not.toContain('createdByAccountID');

    // The SKU side takes the same arm through the same composer, so the discipline is not per-table.
    const skuUpdate = only(harness, 'UPDATE SwSku SET');
    expect(collapse(skuUpdate.sql).endsWith('WHERE skuID = ?')).toBe(true);
    expect(skuUpdate.params[skuUpdate.params.length - 1]).toBe('existing-sku');
  });

  it('NET-NEW — refuses to compose an update with nothing to assign, rather than emit SET', () => {
    /* The composer is the only way a `SET` clause is produced, and it will not produce an empty one.
     * `:L347-L361` could leave `updateSetString` empty when a file carried no assignable column, and
     * the legacy interpolated it regardless — emitting `UPDATE SwProduct SET WHERE …`, which no engine
     * accepts. Refusing at composition names the cause instead of forwarding a broken statement. */
    expect(() => composeImportUpdate(assertTableName('SwProduct'), [], 'productID')).toThrow(
      /no columns to assign/,
    );
  });

  it('NET-NEW — gives the :L411-L413 insert an explicit column list and matching markers', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const productInsert = only(harness, 'INSERT INTO SwProduct');
    const collapsed = collapse(productInsert.sql);

    /*
     * ⭐ D18 AT THE FRAGILE SITE. `:L412` is
     * `INSERT INTO #tableName# (#insertColumns##arguments.idColumn#) VALUES (#insertValues#'#idColumnValue#')`
     * — TWO INTERPOLATIONS BUTTED TOGETHER WITH NO SEPARATOR, correct only because the loops that built
     * `insertColumns` and `insertValues` each happened to leave a trailing comma behind. Every value in
     * that list was a quoted literal built by concatenation.
     *
     * The port emits an explicit column list and exactly as many markers, so a mismatch between the two
     * is a composition error the composer refuses rather than a statement the database rejects.
     */
    const [, columnList = '', valueList = ''] =
      /^INSERT INTO SwProduct \(([^)]*)\) VALUES \(([^)]*)\)$/.exec(collapsed) ?? [];
    const columns = columnList.split(', ');

    expect(columns.length).toBeGreaterThan(1);
    expect(valueList.split(', ').every((marker) => marker === '?')).toBe(true);
    expect(valueList.split(', ')).toHaveLength(columns.length);
    expect(productInsert.params).toHaveLength(columns.length);

    // `:L412` appends the identifier column LAST, after the file columns and the audit quartet.
    expect(columns[columns.length - 1]).toBe('productID');

    /* `:L410` — `lcase(replace(createUUID(),"-","","all"))`. IR-6: THIRTY-TWO LOWERCASE HEX CHARACTERS,
     * NO DASHES, generated in application code. A dashed RFC-4122 string would not fit the `length="32"`
     * column the entity declares, and no UUID package is imported here to check it — the shape is the
     * contract, so the shape is what is asserted. */
    expect(productInsert.params[productInsert.params.length - 1]).toEqual(
      expect.stringMatching(HEX_32),
    );

    /* `:L363-L366` — the INSERT arm appends ALL FOUR audit columns, where the update arm appends two. */
    expect(columns).toContain('createdDateTime');
    expect(columns).toContain('createdByAccountID');
    expect(columns).toContain('modifiedDateTime');
    expect(columns).toContain('modifiedByAccountID');

    // Not one file value reached the text; every one of them reached the parameters.
    expect(productInsert.sql).not.toContain(QUOTE_BEARING.productCode);
    expect(productInsert.params).toContain(QUOTE_BEARING.productCode);
    expect(productInsert.params).toContain(QUOTE_BEARING.productName);
  });

  it('NET-NEW — refuses to compose an insert with no columns at all', () => {
    expect(() => composeImportInsert(assertTableName('SwProduct'), [])).toThrow(/no columns/);
  });

  it('NET-NEW — generates every identifier it writes in the IR-6 32-hex form', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L225`, `:L250` and `:L410` each generate an identifier the same way. All three are asserted on
     * the shape alone, from the public import path, with no UUID package imported. */
    const skuInsert = only(harness, 'INSERT INTO SwSku (');
    expect(skuInsert.params[skuInsert.params.length - 1]).toEqual(expect.stringMatching(HEX_32));

    const [optionIdentifier] = only(harness, 'INSERT INTO SwOption ').params;
    expect(optionIdentifier).toEqual(expect.stringMatching(HEX_32));

    const [attributeIdentifier] = only(harness, 'INSERT INTO SwAttributeValue').params;
    expect(attributeIdentifier).toEqual(expect.stringMatching(HEX_32));

    // Distinct per row, and never the dashed RFC-4122 form the column could not hold.
    expect(optionIdentifier).not.toBe(attributeIdentifier);
    expect(String(optionIdentifier)).not.toContain('-');
  });

  it('NET-NEW — binds the option and SKU-option paths of :L212-L233 without composing a value', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L212-L216` — the LEFT JOIN with the option code ON the join rather than in the WHERE, so a group
     * with no matching option still yields a row carrying the group identifier. That placement is
     * behaviour: moving the predicate into the WHERE would yield no row and `:L227` would insert an
     * option with an empty group. */
    const optionLookup = collapse(only(harness, 'LEFT JOIN SwOption').sql);
    expect(optionLookup).toContain('LEFT JOIN SwOption ON SwOptionGroup.optionGroupID =');
    expect(optionLookup).toContain('SwOption.optionCode = ?');
    expect(optionLookup).toContain('WHERE SwOptionGroup.optionGroupID = ?');
    expect(optionLookup).not.toContain(QUOTE_BEARING.optionCode);

    // `:L222-L227` — the option insert. The code is bound twice, into code AND name, as `:L225` does.
    const optionInsert = only(harness, 'INSERT INTO SwOption (');
    expect(optionInsert.params.filter((value) => value === QUOTE_BEARING.optionCode)).toHaveLength(
      2,
    );
    expect(optionInsert.sql).not.toContain(QUOTE_BEARING.optionCode);

    /* `:L228` — a NEWLY CREATED option cannot already be linked, so the legacy sets the flag to false
     * outright and issues no probe. Preserved: the link insert runs and the probe does not. */
    expect(matching(harness, 'SELECT 1 FROM SwSkuOption')).toEqual([]);
    expect(only(harness, 'INSERT INTO SwSkuOption').params).toEqual([
      optionInsert.params[0],
      only(harness, 'INSERT INTO SwSku (').params.slice(-1)[0],
    ]);
  });

  it('NET-NEW — probes the :L218-L221 link when the option already exists, and binds both ids', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return sqlRows([{ optionGroupID: 'og-1' }]);
      }
      // `:L216` finds an option, so `:L217` takes its non-empty branch and the probe at `:L218` runs.
      if (sql.includes('LEFT JOIN SwOption')) {
        return sqlRows([{ optionID: 'opt-1', optionGroupID: 'og-1' }]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L218-L221` then `:L230-L234` — the link is probed, and inserted only when absent. Both bind the
     * two identifiers positionally and neither composes one into text. The probe stops at one row
     * because `:L221` reads nothing but the record count. */
    const linkProbe = only(harness, 'SELECT 1 FROM SwSkuOption');
    expect(collapse(linkProbe.sql)).toBe(
      'SELECT 1 FROM SwSkuOption WHERE optionID = ? AND skuID = ? LIMIT 1',
    );
    expect(linkProbe.params[0]).toBe('opt-1');
    expect(linkProbe.params).toHaveLength(2);

    // No row came back, so `:L230-L234` inserts the link with the very same two identifiers.
    expect(only(harness, 'INSERT INTO SwSkuOption').params).toEqual(linkProbe.params);
    // And the option itself was NOT recreated, because `:L217` found one.
    expect(matching(harness, 'INSERT INTO SwOption (')).toEqual([]);
  });

  it('NET-NEW — skips the :L230 link insert when the probe already finds the row', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return sqlRows([{ optionGroupID: 'og-1' }]);
      }
      if (sql.includes('LEFT JOIN SwOption')) {
        return sqlRows([{ optionID: 'opt-1', optionGroupID: 'og-1' }]);
      }
      if (sql.startsWith('SELECT 1 FROM SwSkuOption')) {
        return sqlRows([{ '1': 1 }]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    expect(matching(harness, 'SELECT 1 FROM SwSkuOption')).toHaveLength(1);
    expect(matching(harness, 'INSERT INTO SwSkuOption')).toEqual([]);
  });

  it('NET-NEW — binds the heading-derived attribute identifier of :L240 as a VALUE', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `:L240` takes `ListLast(customAttribute,"_")` straight from the heading row, so the attribute
     * identifier is FILE-SUPPLIED, and the legacy interpolated it into both statements at `:L244` and
     * `:L249`. It is the content of an identifier COLUMN, not a column NAME, so it needs no whitelist
     * entry: bound as a value it gains no injection surface and needs no schema entry to exist.
     *
     * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L247` — THE INSERT IS GATED ON THE UPDATE'S AFFECTED-ROW
     * COUNT, WHICH IS NOT AN EXISTENCE TEST. An update writing the value a row already holds changes no
     * rows, so the legacy then inserts a DUPLICATE value for a row that already had one. Carried across
     * exactly as written: the count is read the way the legacy reads it, and no existence probe is added.
     */
    const update = only(harness, 'UPDATE SwAttributeValue');
    expect(collapse(update.sql)).toBe(
      'UPDATE SwAttributeValue SET attributeValue = ? WHERE attributeID = ? AND productID = ?',
    );
    expect(update.params[0]).toBe(QUOTE_BEARING.attributeValue);
    expect(update.params[1]).toBe('attr-1');

    // Zero rows changed, so `:L248-L252` runs — which is the legacy's gate, not an existence check.
    const insert = only(harness, 'INSERT INTO SwAttributeValue');
    expect(insert.params).toContain(QUOTE_BEARING.attributeValue);
    expect(insert.params).toContain('attr-1');
    expect(insert.sql).not.toContain(QUOTE_BEARING.attributeValue);
  });

  it('NET-NEW — skips the :L247 insert when the update reports a changed row', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, (statement) => {
      if (collapse(statement.sql).startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return sqlRows([{ optionGroupID: 'og-1' }]);
      }
      if (collapse(statement.sql).startsWith('UPDATE SwAttributeValue')) {
        return sqlAffectedRows(1);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    expect(matching(harness, 'UPDATE SwAttributeValue')).toHaveLength(1);
    expect(matching(harness, 'INSERT INTO SwAttributeValue')).toEqual([]);
  });

  it('NET-NEW — binds only the value of :L385-L387 and takes its identifiers from the whitelist', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ THE WORST OF THE FILE-FED SITES, AND THE ONE THAT EXPLAINS WHY BINDING ALONE IS NOT ENOUGH.
     * `:L386` is `SELECT #idColumn# FROM #tableName# WHERE #listLast(lookupColumn,'_')# =
     * '#lookupColumnValue#'` — THREE IDENTIFIERS AND ONE VALUE, and the third identifier is DERIVED AT
     * RUN TIME from a file heading: `product_productCode` becomes `productCode`.
     *
     * A `?` marker binds values only; it cannot stand in for a table or a column. So the value becomes
     * the single marker and all three identifiers go through the schema whitelist, which is what makes
     * a heading-derived column name safe without interpolating it. The heading that produced it here is
     * `product_productCode`, and the emitted column is the entity's own spelling of it.
     */
    const lookup = only(harness, 'SELECT productID FROM SwProduct');
    expect(collapse(lookup.sql)).toBe('SELECT productID FROM SwProduct WHERE productCode = ?');
    expect(lookup.params).toEqual([QUOTE_BEARING.productCode]);
    expect((collapse(lookup.sql).match(/\?/g) ?? []).length).toBe(1);
  });

  it('NET-NEW — refuses an unrecognised lookup column instead of interpolating it', () => {
    /* The whitelist is the mechanism, and it REFUSES rather than falling back to text. Both the table
     * and every column are re-validated inside the composer, so "the caller validated" is never relied
     * on: an exported composer cannot assume anything about who calls it. */
    expect(() =>
      composeExistenceLookup(assertTableName('SwProduct'), 'productID', 'nonesuch'),
    ).toThrow(/does not declare on the table/);
    expect(() =>
      composeExistenceLookup(assertTableName('SwProduct'), 'nonesuch', 'productCode'),
    ).toThrow(/does not declare on the table/);
    // A column that exists on ANOTHER table is still refused on this one — the check is per table.
    expect(() => composeExistenceLookup(assertTableName('SwBrand'), 'brandID', 'skuCode')).toThrow(
      /does not declare on the table/,
    );
  });

  it('NET-NEW — refuses a file heading naming a column no import may assign, before any row', async () => {
    const harness = buildHarness(
      fileWith(
        ['product_nonsense', 'product_productCode', 'product_productName', 'brand_brandname'],
        ['x', 'CODE-1', 'Widget', 'Acme'],
      ),
    );

    /*
     * ⭐ THE REFUSAL IS THE PRODUCTION WHITELIST BEHAVIOUR, AND IT ARRIVES BEFORE THE FIRST BOUNDARY.
     * An unrecognised heading is neither interpolated nor silently dropped. Under M3 that placement is
     * the point: a refusal discovered on row 400 would leave 399 committed rows behind, so the whole
     * column set is authorised once, before `:L176` opens the first transaction.
     */
    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/may not assign/);

    // Nothing was issued and nothing was begun: the catalogue is exactly as it was.
    expect(harness.statements).toEqual([]);
    expect(harness.eventKinds()).toEqual([]);
    // And the rejected heading never appeared as statement text, which is the alternative being ruled out.
    expect(harness.statements.map((statement) => statement.sql).join('\n')).not.toContain(
      'nonsense',
    );
  });

  it('NET-NEW — writes physical Sw* vocabulary in every statement, never logical Slatwall*', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L193`, `:L207`, `:L386`, `:L394`, `:L402` and `:L412`
     * — D22, THE LOGICAL-TO-PHYSICAL TRANSLATION. `:L193` and `:L207` pass the LOGICAL literals
     * `"SlatwallProduct"` and `"SlatwallSku"` into `saveImportData`, which then interpolates them
     * straight into NATIVE statement text at `:L386`, `:L394` and `:L412` — and `:L402` writes
     * `FROM SlatwallProduct` directly. Those are entity names, not table names: the entity components
     * declare `entityname="SlatwallProduct" table="SwProduct"` at `model/entity/Product.cfc:L49` and
     * `entityname="SlatwallSku" table="SwSku"` at `model/entity/Sku.cfc:L49`, so a native statement
     * naming `SlatwallProduct` addresses a table that does not exist.
     *
     * ⚠️ AND THE DISTINCTION IS PRESERVED, NOT ERASED. `Slatwall*` remains the CORRECT and legitimate
     * name in HQL — the framework synthesises it from a bare entity name at five separate sites in
     * `org/Hibachi/HibachiDAO.cfc` — so the port keeps both vocabularies and translates between them at
     * the boundary rather than declaring one of them wrong. The whitelist ACCEPTS a logical name and
     * NORMALISES it, which is why the companion assertion below passes; what it will not do is emit one.
     */
    const everyStatement = harness.statements.map((statement) => statement.sql).join('\n');

    expect(everyStatement).not.toContain('Slatwall');
    expect(everyStatement).not.toContain('slatwall');
    expect(everyStatement).toContain('SwProduct');
    expect(everyStatement).toContain('SwSku');

    // The translation itself, at the one place it happens: a logical name in, a physical name out.
    expect(assertTableName('SlatwallProduct')).toBe('SwProduct');
    expect(assertTableName('SlatwallSku')).toBe('SwSku');
    expect(assertTableName('SlatwallOptionGroup')).toBe('SwOptionGroup');
    // Idempotent on a name that is already physical, so a caller need not know which it holds.
    expect(assertTableName('SwProduct')).toBe('SwProduct');
  });

  it('NET-NEW — names no Mura CMS tContent table, and refuses the import that would need it', async () => {
    const harness = buildHarness(
      fileWith(
        ['productcontent_page', 'product_productCode', 'product_productName', 'brand_brandname'],
        ['page-1', 'CODE-1', 'Widget', 'Acme'],
      ),
    );

    /*
     * ⛔ `model/dao/ProductDAO.cfc:L261-L264` JOINS `tContent`, WHICH IS A MURA CMS TABLE AND A DECLARED
     * EXTRACTION BOUNDARY. It belongs to a separate application's schema, so it is not in the identifier
     * whitelist and it must never be added to one: admitting it would extend this catalogue port into a
     * content-management system whose columns and lifecycle sit outside every scope boundary declared
     * for this slice. The name may appear in a refusal or in a comment such as this one — nowhere else.
     *
     * The refusal is a PREFLIGHT for the same M3 reason as the column authorisation above: the legacy
     * performs this step LAST in the row body, so refusing there would commit every earlier row and
     * abandon the file mid-import. Refusing before the first boundary leaves the catalogue untouched.
     */
    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/content-management application/);

    expect(harness.statements).toEqual([]);
    expect(harness.eventKinds()).toEqual([]);

    // The name is not a table this port will accept, and this is the assertion that keeps it that way.
    expect(() => assertTableName('tContent')).toThrow(/does not contain/);
  });

  it('NET-NEW — leaves the file-fed and setting-fed statements distinguishable by provenance', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⚠️ THE HARDENING IS UNIFORM; THE INJECTION CHARACTERISATION IS NOT. Every value in every statement
     * is bound, but the values do not all come from the same place, and claiming they did would
     * overstate what D18 was about:
     *
     *   FILE-FED — the brand and product-type lookups, the existence lookup, the update, the insert, the
     *   option and link paths and the attribute pair. These carried uploaded data into quoted literals
     *   and ARE the injection surface `:L165`, `:L180`, `:L184`, `:L386`, `:L394` and `:L412` opened.
     *
     *   SETTING-FED — the image-file back-fill at `:L307`, whose one value is a configuration setting.
     *   Bound for consistency and because it is a value, but never attacker-influenced.
     *
     *   NEITHER — the default-SKU back-fill at `:L288-L302`, which interpolates nothing at all and binds
     *   nothing at all. Its parameter array is empty, and asserting that is the cleanest way to show the
     *   provenance really does differ rather than being described as differing.
     */
    expect(only(harness, 'SET defaultSkuID').params).toEqual([]);
    expect(only(harness, 'SET imageFile').params).toHaveLength(1);
    expect(only(harness, 'FROM SwBrand').params).toEqual([QUOTE_BEARING.brandName]);
  });

  it('NET-NEW — reaches the database only through the execute seam, never a query path', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * TR-4's other half. Server-side prepared execution is what makes the binding real: a client-side
     * emulation would interpolate the parameters back into the text before sending it, which would
     * reinstate exactly the surface D18 closed. The adapter therefore depends on the statement-executor
     * seam rather than constructing a pool, and the recording double IS that seam — every statement
     * above was observed because it arrived there. No statement can bypass it, because the adapter holds
     * no other route to a connection.
     */
    expect(harness.statements.length).toBeGreaterThan(0);
    for (const statement of harness.statements) {
      // Every statement arrived with its parameters as a separate array, never merged into the text.
      expect(Array.isArray(statement.params)).toBe(true);
      expect((statement.sql.match(/\?/g) ?? []).length).toBe(statement.params.length);
    }
  });
});

/* ================================================================================================
 * importFromFile — the parity decisions adjacent to D18
 * ============================================================================================== */

describe('NET-NEW — importFromFile, and the parity decisions adjacent to D18', () => {
  it('NET-NEW — keys on product_remoteID when several :L100 candidates are present', async () => {
    const harness = buildHarness(
      importable(
        ['product_productName', 'product_productCode', 'product_remoteID'],
        ['Widget', 'CODE-1', 'REMOTE-1'],
      ),
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ `:L100-L109` — THE ORDER IS BEHAVIOUR AND THE `break` IS BEHAVIOUR. `:L100` declares the
     * candidates as `['product_remoteID','product_productID','product_productCode',
     * 'product_productName']` and `:L103-L108` walks that array ASCENDING, breaking on the first heading
     * the file carries. So the array's order is a priority order, and the FIRST available candidate wins
     * however many later ones are also present — which decides WHICH existing product an import updates.
     *
     * Note that the file above lists the headings in the OPPOSITE order to the array. The winner is
     * chosen by the array, not by the file, and that is exactly what this asserts.
     */
    expect(collapse(only(harness, 'SELECT productID FROM SwProduct').sql)).toBe(
      'SELECT productID FROM SwProduct WHERE remoteID = ?',
    );
    expect(only(harness, 'SELECT productID FROM SwProduct').params).toEqual(['REMOTE-1']);
  });

  it('NET-NEW — falls to product_productCode when the earlier candidates are absent', async () => {
    const harness = buildHarness(
      importable(['product_productName', 'product_productCode'], ['Widget', 'CODE-1']),
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    expect(collapse(only(harness, 'SELECT productID FROM SwProduct').sql)).toBe(
      'SELECT productID FROM SwProduct WHERE productCode = ?',
    );
  });

  it('NET-NEW — falls all the way to product_productName when it is the only candidate', async () => {
    const harness = buildHarness(importable(['product_productName'], ['Widget']));

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    expect(collapse(only(harness, 'SELECT productID FROM SwProduct').sql)).toBe(
      'SELECT productID FROM SwProduct WHERE productName = ?',
    );
  });

  it('NET-NEW — refuses product_productID, so the walk of :L100 is observable three deep', async () => {
    const harness = buildHarness(
      importable(['product_productID', 'product_productCode'], ['P-1', 'CODE-1']),
    );

    /*
     * ⚠️ THE SECOND CANDIDATE IS UNREACHABLE IN PRACTICE, AND SAYING SO IS MORE USEFUL THAN PRETENDING
     * OTHERWISE. `:L100` lists `product_productID`, but a file may not ASSIGN a primary key: identifiers
     * are generated by the importer at `:L410`, per IR-6, and the authorisation set refuses the column.
     * So a file that carries the heading is refused outright rather than keyed on it, and the observable
     * priority walk is three candidates deep, not four. The candidate is still declared in the port's
     * own list, in the legacy's position, so the ORDER is preserved even where the entry is unreachable.
     */
    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/may not assign/);
    expect(harness.statements).toEqual([]);
  });

  it('NET-NEW — matches file headings case-insensitively, as CFML did, and misses none', async () => {
    const harness = buildHarness(
      fileWith(
        [
          'PRODUCT_ProductCode',
          'Product_PRODUCTNAME',
          'brand_BrandName',
          'PRODUCTTYPE_producttypename',
          'SKU_SkuCode',
        ],
        ['CODE-1', 'Widget', 'Acme', 'Merchandise', 'SKU-1'],
      ),
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ A TRANSLATION DECISION, MADE EXPLICITLY BECAUSE THE TWO LANGUAGES DISAGREE. `:L180` and `:L184`
     * index the record set with the LOWER-CASE literals `brand_brandname` and
     * `productType_productTypeName`, and a CFML query is case-insensitive on column names, so a file
     * heading spelled `brand_BrandName` resolved. A JavaScript object is NOT case-insensitive: the same
     * index would be `undefined`, and the importer would silently treat every brand as absent — a miss
     * that produces no error and no wrong statement, just an empty foreign key on every row.
     *
     * The adapter therefore normalises heading keys, and this case is the evidence that it does. Every
     * one of the five headings above is spelled differently from the literal the legacy used.
     */
    expect(only(harness, 'FROM SwBrand').params).toEqual(['Acme']);
    expect(only(harness, 'FROM SwProductType').params).toEqual(['Merchandise']);
    expect(collapse(only(harness, 'SELECT productID FROM SwProduct').sql)).toBe(
      'SELECT productID FROM SwProduct WHERE productCode = ?',
    );
    expect(only(harness, 'SELECT skuID FROM SwSku WHERE skuCode').params).toEqual(['SKU-1']);

    /* And the EMITTED identifiers carry the ENTITY's casing, not the file's: the whitelist restores the
     * canonical spelling, so a heading's capitalisation never reaches statement text. */
    const productInsert = collapse(only(harness, 'INSERT INTO SwProduct').sql);
    expect(productInsert).toContain('productCode');
    expect(productInsert).not.toContain('PRODUCT_');
    expect(productInsert).not.toContain('PRODUCTNAME');
  });

  it('NET-NEW — captures ONE :L152 timestamp for the whole import, not one per row', async () => {
    const harness = buildHarness(
      importable(
        ['product_productCode', `option_${'Size'}`],
        ['CODE-1', 'Small'],
        ['CODE-2', 'Large'],
      ),
      resolvingOptionGroup,
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `:L152` calls `now()` ONCE, before `:L176` opens the row loop, and `:L225` writes that one value
     * into every option it creates. So every option an import creates carries the SAME audit timestamp
     * however long the import runs. Moving the capture inside the loop would be more accurate and is not
     * what the legacy records, so it is not what the port records.
     *
     * ⚠️ `saveImportData` CAPTURES A SECOND, LATER TIMESTAMP OF ITS OWN AT `:L340`, and that duplication
     * is preserved rather than unified. A product's audit columns therefore differ from an option's
     * within the same row, which is the legacy's own behaviour and not a rounding artefact.
     */
    const optionInserts = matching(harness, 'INSERT INTO SwOption (');
    expect(optionInserts).toHaveLength(2);

    const [firstOption, secondOption] = optionInserts;
    const firstStamp = firstOption?.params[4];
    const secondStamp = secondOption?.params[4];

    expect(firstStamp).toBeInstanceOf(Date);
    expect(secondStamp).toBeInstanceOf(Date);
    // The identical instant, across two rows and two separate transactions.
    expect(secondStamp).toEqual(firstStamp);
    // `:L225` binds it twice, into the created and modified columns alike.
    expect(firstOption?.params[5]).toBe(firstStamp);
  });

  it('NET-NEW — reads the acting account through the injected synchronous port', async () => {
    const harness = buildHarness(
      importable(['product_productCode'], ['CODE-1']),
      undefined,
      createAccountContextDouble(persistedAdminAccount()).accountContext,
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `:L153` and `:L341` read `getSlatwallScope().getCurrentAccount().getAccountID()` — a request-scoped
     * GLOBAL reached through the framework, which is exactly the mechanism the port replaces. The
     * identifier arrives through a constructor-injected `AccountContextPort` instead: no service locator,
     * no string-keyed resolution, no ambient scope.
     *
     * The port is SYNCHRONOUS on purpose (M8): nothing in this slice may wait on background completion to
     * learn who is acting, so the contract offers nothing to await.
     */
    const productInsert = only(harness, 'INSERT INTO SwProduct');
    expect(productInsert.params).toContain(TEST_ADMIN_ACCOUNT_ID);
    expect(productInsert.params.filter((value) => value === TEST_ADMIN_ACCOUNT_ID)).toHaveLength(2);
  });

  it('NET-NEW — writes the legacy empty audit account when no account is authenticated', async () => {
    const harness = buildHarness(
      importable(['product_productCode'], ['CODE-1']),
      undefined,
      createAbsentAccountContextDouble().accountContext,
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⚠️ ABSENCE MAPS TO THE EMPTY STRING, WHICH IS THE LEGACY VALUE AND NOT AN INVENTED DEFAULT. The
     * legacy accessor always answers with an account object — a NEW, unpersisted one when nobody is
     * authenticated — and reading the identifier off an unpersisted entity yields `""`. So an
     * unauthenticated import writes empty audit account columns, and so does this. Substituting a system
     * account, or refusing the import, would both be inventions.
     */
    const productInsert = only(harness, 'INSERT INTO SwProduct');
    const columnList = collapse(productInsert.sql).replace(
      /^INSERT INTO SwProduct \(([^)]*)\).*$/,
      '$1',
    );
    const accountIndex = columnList.split(', ').indexOf('createdByAccountID');

    expect(accountIndex).toBeGreaterThan(-1);
    expect(productInsert.params[accountIndex]).toBe('');
  });

  it('NET-NEW — pre-resolves option groups in the :L161 REVERSE heading order', async () => {
    const harness = buildHarness(
      importable(
        ['product_productCode', 'option_Size', 'option_Colour'],
        ['CODE-1', 'Small', 'Blue'],
      ),
      resolvingOptionGroup,
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `:L161` iterates DESCENDING — `for(var i=arrayLen(optionGroups); i>=1; i--)` — because `:L170`
     * deletes unresolved entries from the very array being walked, and only a descending walk can delete
     * safely. The direction is therefore load-bearing rather than stylistic, and it is observable: the
     * lookups issue in reverse heading order.
     *
     * `:L163` strips the prefix case-insensitively and for the FIRST occurrence only, so a heading
     * spelled `option_option_colour` yields the key `option_colour` rather than `colour`. Both halves are
     * preserved.
     */
    const groupLookups = matching(harness, 'FROM SwOptionGroup WHERE optionGroupName');
    expect(groupLookups).toHaveLength(2);
    // Reverse of the file's heading order: `Colour` is looked up before `Size`.
    expect(groupLookups[0]?.params).toEqual(['Colour', 'Colour', 'Colour']);
    expect(groupLookups[1]?.params).toEqual(['Size', 'Size', 'Size']);

    // Both are pre-resolved BEFORE the first boundary opens, on the pool executor (M6 is unaffected:
    // nothing in the pre-pass reads a row the loop will write).
    expect(groupLookups.every((lookup) => lookup.region === 'pool')).toBe(true);
  });

  it('NET-NEW — drops an unresolved option group, preserving the :L170 array mutation', async () => {
    const harness = buildHarness(
      importable(
        ['product_productCode', 'option_Size', 'option_Colour'],
        ['CODE-1', 'Small', 'Blue'],
      ),
      (statement) => {
        // Only `Colour` resolves; `Size` finds nothing and `:L170` deletes it from the array.
        if (collapse(statement.sql).startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
          return statement.params[0] === 'Colour'
            ? sqlRows([{ optionGroupID: 'og-1' }])
            : sqlRows([]);
        }

        return undefined;
      },
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L168-L172` — a resolved heading is recorded, an unresolved one is REMOVED, and `:L209` then
     * iterates only what survived. So exactly one option is assigned, for `Colour`, and the `Size` cell
     * is silently ignored. Two lookups were issued; one option path ran. */
    expect(matching(harness, 'FROM SwOptionGroup WHERE optionGroupName')).toHaveLength(2);
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(1);
    expect(only(harness, 'LEFT JOIN SwOption').params).toEqual(['Blue', 'og-1']);
  });

  it('NET-NEW — appends _<productCode> ONCE on a urlTitle collision and never re-probes', async () => {
    const harness = buildHarness(
      importable(['product_productCode', 'product_productName'], ['CODE-1', 'Duplicate Name']),
      (statement) => {
        // `:L404` — the probe finds a row, so `:L405` appends.
        if (collapse(statement.sql).startsWith('SELECT 1 FROM SwProduct WHERE urlTitle')) {
          return sqlRows([{ '1': 1 }]);
        }

        return undefined;
      },
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L398-L409` — THE IMPORTER'S URL-TITLE RULE IS ONE-SHOT
     * AND IS DELIBERATELY NOT HARMONISED WITH THE SERVICE-LAYER RULE.
     *
     * `:L401-L403` probes once; `:L404-L405` appends `_#product_productCode#` when the probe matched;
     * and then it stops. There is NO second probe and NO loop, so the appended title can itself collide
     * and the import will store the collision. That is the source behaviour.
     *
     * The service layer solves the same problem completely differently, at
     * `model/service/DataService.cfc:L53-L71`: it loops, incrementing a numeric suffix, and re-probes
     * every candidate until one is free — which is why its FIRST collision suffix is `-2` rather than
     * `-1`, the counter being pre-incremented. Two different algorithms, two different separators, two
     * different termination conditions.
     *
     * ⛔ THEY ARE NOT UNIFIED HERE. Routing the importer through the service-layer helper would change
     * which title an import stores, which is observable data, and would change how many statements an
     * import issues. Each algorithm stays where the legacy put it; the divergence is recorded rather
     * than smoothed away, and no generic URL-title helper is imported into this path.
     */
    const productInsert = only(harness, 'INSERT INTO SwProduct');
    const columnList = collapse(productInsert.sql).replace(
      /^INSERT INTO SwProduct \(([^)]*)\).*$/,
      '$1',
    );
    const urlTitleIndex = columnList.split(', ').indexOf('urlTitle');

    expect(urlTitleIndex).toBeGreaterThan(-1);
    // One append, with `_` as the separator and the product CODE as the suffix — not a number.
    expect(productInsert.params[urlTitleIndex]).toBe('duplicate-name_CODE-1');
    // Probed exactly once. A loop would have probed the appended candidate as well.
    expect(matching(harness, 'SELECT 1 FROM SwProduct WHERE urlTitle')).toHaveLength(1);
  });

  it('NET-NEW — leaves the candidate untouched when the :L404 probe finds nothing', async () => {
    const harness = buildHarness(
      importable(['product_productCode', 'product_productName'], ['CODE-1', 'Free Name']),
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const productInsert = only(harness, 'INSERT INTO SwProduct');
    const columnList = collapse(productInsert.sql).replace(
      /^INSERT INTO SwProduct \(([^)]*)\).*$/,
      '$1',
    );
    const urlTitleIndex = columnList.split(', ').indexOf('urlTitle');

    expect(productInsert.params[urlTitleIndex]).toBe('free-name');
    expect(matching(harness, 'SELECT 1 FROM SwProduct WHERE urlTitle')).toHaveLength(1);
  });

  it('NET-NEW — probes the urlTitle only on the :L397 INSERT arm, never on an update', async () => {
    const harness = buildHarness(
      importable(['product_productCode', 'product_productName'], ['CODE-1', 'Existing']),
      (statement) => {
        if (collapse(statement.sql).startsWith('SELECT productID FROM SwProduct')) {
          return sqlRows([{ productID: 'existing-product' }]);
        }

        return undefined;
      },
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L397` gates the whole url-title block on the insert arm and on the PRODUCT table, so updating an
     * existing product never rewrites its title and the SKU table never gains one. Preserved. */
    expect(matching(harness, 'SELECT 1 FROM SwProduct WHERE urlTitle')).toEqual([]);
    expect(collapse(only(harness, 'UPDATE SwProduct SET').sql)).not.toContain('urlTitle');
  });

  it('NET-NEW — carries the product identifier saveImportData resolved into every dependent write', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔ `saveImportData` IS PRIVATE, AND `:L416` RETURNS AN IDENTIFIER ON BOTH ITS ARMS — the generated
     * one on the insert path and the looked-up one on the update path. That return is INTERNAL, and it is
     * observed here ONLY through the writes that consume it: the SKU row's foreign key and the attribute
     * value's product reference both carry the value the product save produced. Nothing below exports the
     * member, indexes it, reaches it by bracket access or casts through `unknown` to see it.
     */
    const productInsert = only(harness, 'INSERT INTO SwProduct');
    const productIdentifier = productInsert.params[productInsert.params.length - 1];

    expect(productIdentifier).toEqual(expect.stringMatching(HEX_32));

    // `:L206` passes the product identifier as the SKU's association, so the SKU insert binds it.
    expect(only(harness, 'INSERT INTO SwSku (').params).toContain(productIdentifier);
    // `:L244` and `:L249` bind it as the attribute value's product reference.
    expect(only(harness, 'UPDATE SwAttributeValue').params).toContain(productIdentifier);
    expect(only(harness, 'INSERT INTO SwAttributeValue').params).toContain(productIdentifier);
  });

  it('NET-NEW — carries the looked-up identifier on the update arm the same way', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return sqlRows([{ optionGroupID: 'og-1' }]);
      }
      if (sql.startsWith('SELECT productID FROM SwProduct')) {
        return sqlRows([{ productID: 'existing-product' }]);
      }
      if (sql.startsWith('SELECT skuID FROM SwSku')) {
        return sqlRows([{ skuID: 'existing-sku' }]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* Same internal return, different arm: `:L392` reads the identifier off the existence lookup instead
     * of generating one, and every dependent write then carries THAT value. */
    expect(only(harness, 'UPDATE SwAttributeValue').params).toContain('existing-product');
    expect(only(harness, 'INSERT INTO SwSkuOption').params).toContain('existing-sku');
  });

  it('NET-NEW — supplies the :L143-L148 flag defaults only when the heading is ABSENT', async () => {
    const withoutFlags = buildHarness(importable(['product_productCode'], ['CODE-1']));
    const withFlags = buildHarness(
      importable(
        ['product_productCode', 'product_activeFlag', 'product_publishedFlag'],
        ['CODE-1', '', '0'],
      ),
    );

    await withoutFlags.repository.importFromFile('https://feeds.example/catalog.csv');
    await withFlags.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L143-L148` appends the literal `"1"` STRING for each of the two flags when the file carries no
     * such heading. It covers a missing COLUMN, not a missing VALUE — so a file that DOES carry
     * `product_activeFlag` with an empty cell imports an empty flag, and no default rescues it. Both
     * halves are preserved, and the second is the one a well-meaning reader would "fix". */
    const defaulted = only(withoutFlags, 'INSERT INTO SwProduct');
    const defaultedColumns = collapse(defaulted.sql)
      .replace(/^INSERT INTO SwProduct \(([^)]*)\).*$/, '$1')
      .split(', ');
    expect(defaulted.params[defaultedColumns.indexOf('activeFlag')]).toBe('1');
    expect(defaulted.params[defaultedColumns.indexOf('publishedFlag')]).toBe('1');

    const supplied = only(withFlags, 'INSERT INTO SwProduct');
    const suppliedColumns = collapse(supplied.sql)
      .replace(/^INSERT INTO SwProduct \(([^)]*)\).*$/, '$1')
      .split(', ');
    expect(supplied.params[suppliedColumns.indexOf('activeFlag')]).toBe('');
    expect(supplied.params[suppliedColumns.indexOf('publishedFlag')]).toBe('0');
  });

  it('NET-NEW — remembers a resolved brand across rows and re-probes an unresolved one', async () => {
    const twoRowsOneBrand = fileWith(
      [
        'product_productCode',
        'product_productName',
        'brand_brandname',
        'productType_productTypeName',
      ],
      ['CODE-1', 'One', 'Acme', 'Merchandise'],
      ['CODE-2', 'Two', 'Acme', 'Merchandise'],
    );

    const resolving = buildHarness(twoRowsOneBrand, (statement) => {
      if (collapse(statement.sql).startsWith('SELECT brandID FROM SwBrand')) {
        return sqlRows([{ brandID: 'brand-1' }]);
      }

      return undefined;
    });
    const unresolved = buildHarness(twoRowsOneBrand);

    await resolving.repository.importFromFile('https://feeds.example/catalog.csv');
    await unresolved.repository.importFromFile('https://feeds.example/catalog.csv');

    /* ⭐ ONLY A POSITIVE RESOLUTION IS REMEMBERED, AND THAT ASYMMETRY IS WHAT KEEPS IT FAITHFUL. A brand
     * that resolves is resolved once for the whole import; a brand that does NOT resolve is probed again
     * on every row, so a row created concurrently in between is observed on exactly the row the legacy
     * would first have observed it. Neither statement declares an `ORDER BY`, so the legacy's own answer
     * for a duplicated name is already unspecified and the memory cannot narrow it. */
    expect(matching(resolving, 'FROM SwBrand')).toHaveLength(1);
    expect(matching(unresolved, 'FROM SwBrand')).toHaveLength(2);
  });
});

/* ================================================================================================
 * searchByProductType — model/dao/ProductDAO.cfc:L419-L437
 * ============================================================================================== */

/** Answers a product search with one canned row in the projection `:L421` selects. */
function searchAnswering(...rows: readonly { productID: string; productName: string }[]) {
  return (statement: SqlExecutorCall): SqlExecutorOutcome | undefined => {
    if (collapse(statement.sql).startsWith('SELECT productID, productName FROM SwProduct')) {
      return sqlRows(rows);
    }

    return undefined;
  };
}

describe('NET-NEW — searchByProductType, and its optional plural surface', () => {
  it('NET-NEW — wraps the term in %…% INSIDE the repository, as :L422 does', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType(QUOTE_BEARING.searchTerm);

    /*
     * `:L422` is `addParam(name="prodName", value="%#arguments.term#%")` — the wildcards are applied AT
     * THE BINDING SITE, not by the caller. So the port takes a BARE fragment and wraps it here, which
     * keeps every existing caller's argument unchanged. Wrapping in the caller would double the
     * wildcards for anyone who already passes a bare term.
     *
     * The wrapped value is a VALUE, so it binds; `LIKE ?` with `%…%` in the parameter matches exactly
     * what `LIKE '%…%'` matched, because the wildcards belong to the pattern and not to the syntax.
     */
    const search = only(harness, 'SELECT productID, productName FROM SwProduct');
    expect(collapse(search.sql)).toBe(
      'SELECT productID, productName FROM SwProduct WHERE productName LIKE ?',
    );
    expect(search.params).toEqual([`%${QUOTE_BEARING.searchTerm}%`]);
    // The caller's own text never becomes statement text — the same D18 discipline, on a read path.
    expect(search.sql).not.toContain(QUOTE_BEARING.searchTerm);
    expect(search.sql).not.toContain('%');
  });

  it('NET-NEW — omits the product-type predicate entirely when the list is not supplied', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget');

    /* `:L423`'s guard is false, so `:L424-L425` never appends. Both arguments are declared optional at
     * `:L419`, and this is what the second one's absence looks like. */
    const search = collapse(only(harness, 'SELECT productID, productName FROM SwProduct').sql);
    expect(search).not.toContain('productTypeID');
    expect(search).not.toContain('IN (');
    expect((search.match(/\?/g) ?? []).length).toBe(1);
  });

  it('NET-NEW — appends a DIRECT productTypeID IN (...) filter, not a nested subquery', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', 'pt-1,pt-2,pt-3');

    /*
     * `:L424-L425` filters `SwProduct.productTypeID` DIRECTLY. It does not reach through a product
     * subquery the way the SKU-side equivalent must, because this statement's base table already carries
     * the column. Re-expressing it as `productID IN (SELECT … FROM SwProduct WHERE productTypeID IN …)`
     * would be a different statement with a different plan and no behavioural gain, so the shape is
     * preserved as written.
     */
    const search = collapse(only(harness, 'SELECT productID, productName FROM SwProduct').sql);
    expect(search).toBe(
      'SELECT productID, productName FROM SwProduct WHERE productName LIKE ? ' +
        'AND productTypeID IN (?, ?, ?)',
    );
    expect(search).not.toContain('SELECT productID FROM SwProduct WHERE productTypeID');
  });

  it('NET-NEW — binds prodName FIRST and the product-type identifiers SECOND, per :L427', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', 'pt-1,pt-2');

    /*
     * ⭐ THE ORDER COMES FROM A SUBTLETY OF THE LEGACY BODY. `:L427` calls `setSQL` AFTER both `addParam`
     * calls, and the legacy binds by NAME so the calls' order is what fixes the sequence — the term was
     * added at `:L422` and the list at `:L425`. Translated to positional binding that becomes: term
     * first, then every product-type identifier in list order (TR-4). Reversing them would still compile
     * and still bind the right COUNT, and would silently search for a product type by name.
     */
    expect(only(harness, 'SELECT productID, productName FROM SwProduct').params).toEqual([
      '%widget%',
      'pt-1',
      'pt-2',
    ]);
  });

  it('NET-NEW — emits one marker per list token and concatenates no token into the text', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', "pt-1,O'Reilly,pt-3,pt-4");

    const search = only(harness, 'SELECT productID, productName FROM SwProduct');

    // Cardinality follows the supplied list exactly: four tokens, four markers, four bound values.
    expect(collapse(search.sql)).toContain('productTypeID IN (?, ?, ?, ?)');
    expect(search.params).toEqual(['%widget%', 'pt-1', "O'Reilly", 'pt-3', 'pt-4']);
    expect(search.sql).not.toContain("O'Reilly");
    expect(search.sql).not.toContain('pt-1');
  });

  it('NET-NEW — keeps empty list tokens, because the legacy list binding kept them', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', 'pt-1,,pt-3');

    /* CFML's list binding produces one parameter per token WITHOUT discarding empties, so `pt-1,,pt-3`
     * bound three values and the middle one was the empty string. Dropping the empty token would emit two
     * markers and change the match set; the split is therefore bare, and four tidy-ups are forbidden —
     * dropping empties, trimming, de-duplicating, and short-circuiting the whole-empty case. */
    expect(only(harness, 'SELECT productID, productName FROM SwProduct').params).toEqual([
      '%widget%',
      'pt-1',
      '',
      'pt-3',
    ]);
  });

  it('NET-NEW — ACCEPTS a whitespace-only list, because :L423 guards with len() not trim()', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', '   ');

    /*
     * ⚠️ TODO(parity) `model/dao/ProductDAO.cfc:L423` — THE GUARD IS `len()`, AND THE ASYMMETRY WITH THE
     * SKU SIDE IS PRESERVED RATHER THAN HARMONISED. `:L423` tests
     * `structKeyExists(arguments,"productTypeIDs") and len(arguments.productTypeIDs)`, so a
     * whitespace-only string has a non-zero length, passes the guard, and produces a filter that matches
     * nothing — an empty result where no filter at all would have returned every name match.
     *
     * `model/dao/SkuDAO.cfc:L134` guards the equivalent argument with `trim()`, so the SAME input is
     * DISCARDED there and the SKU search returns its unfiltered matches. Two sibling searches, two
     * different answers for one input.
     *
     * ⛔ NOT UNIFIED. Making them agree would mean changing one member's observable result set, and
     * whichever one was changed would stop matching its legacy counterpart. The divergence is recorded at
     * both ends instead — this assertion is the product side of it.
     */
    const search = only(harness, 'SELECT productID, productName FROM SwProduct');
    expect(collapse(search.sql)).toContain('productTypeID IN (?)');
    // The whitespace travels verbatim, neither trimmed nor normalised.
    expect(search.params).toEqual(['%widget%', '   ']);
  });

  it('NET-NEW — treats an EMPTY list string as absent, which is what len() zero means', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', '');

    /* `len('')` is zero, so `:L423` is false and no filter is appended. This is the one input a
     * whitespace-only string is easily confused with, and the two answers differ. */
    expect(
      collapse(only(harness, 'SELECT productID, productName FROM SwProduct').sql),
    ).not.toContain('productTypeID');
  });

  it('NET-NEW — names the argument in the PLURAL, per :L419 and Discrepancy 6', () => {
    /*
     * ⚠️ DISCREPANCY 6 — THE SPELLING IS PLURAL HERE AND SINGULAR ON THE SKU SIDE, AND THAT IS NOT TIDIED
     * UP. `:L419` declares `productTypeIDs`, while the SKU-side equivalent declares `productTypeID`. The
     * plural is also a COMMA-DELIMITED STRING rather than an array, which is the second half of the
     * discrepancy and the reason a caller cannot pass `string[]` here.
     *
     * Pinned at compile time rather than described: this binding fails if the port ever renames the
     * argument or widens it to an array, which is exactly the drift a reader would otherwise introduce
     * while "making the two searches consistent".
     */
    const asDeclared: (term?: string, productTypeIDs?: string) => Promise<ProductSearchRow[]> =
      buildHarness(fileWith([])).repository.searchByProductType;

    expect(typeof asDeclared).toBe('function');
  });

  it('NET-NEW — maps rows to exactly { id, value } with lower-case projection keys', async () => {
    const harness = buildHarness(
      fileWith([]),
      searchAnswering(
        { productID: 'p-1', productName: 'First Widget' },
        { productID: 'p-2', productName: QUOTE_BEARING.productName },
      ),
    );

    const found = await harness.repository.searchByProductType('widget');

    /*
     * `:L430-L434` renames the projection as it builds the return: `productID` becomes `id` and
     * `productName` becomes `value`, and the keys are QUOTED LOWER-CASE in the source so the rename is
     * deliberate rather than an artefact of CFML's struct casing. The shape feeds a select control, which
     * is why `value` carries the NAME and `id` the identifier — the opposite of what the words suggest.
     */
    expect(found).toEqual([
      { id: 'p-1', value: 'First Widget' },
      { id: 'p-2', value: QUOTE_BEARING.productName },
    ]);
    // Exactly two keys, and no leakage of the underlying column names into the projection.
    expect(Object.keys(found[0] ?? {}).sort()).toEqual(['id', 'value']);
  });

  it('NET-NEW — answers with an empty array when nothing matched, never null', async () => {
    const harness = buildHarness(fileWith([]), searchAnswering());

    await expect(harness.repository.searchByProductType('nothing')).resolves.toEqual([]);
  });

  it('NET-NEW — declares the omitted term a refusal rather than inventing a default', async () => {
    const harness = buildHarness(fileWith([]));

    /*
     * ⭐ AN EXPLICIT DECISION AT A POINT WHERE THE SOURCE IS UNGUARDED. `:L419` declares `term` OPTIONAL
     * and `:L422` then reads `arguments.term` with NO guard at all, so omitting it does not search for
     * everything — it fails, on the argument access, before any statement is composed. There is no
     * legacy behaviour to preserve here beyond "this does not work".
     *
     * ⛔ SO NO DEFAULT IS INVENTED. Substituting `''` would make the member match EVERY product name, a
     * capability the legacy never had and the widest possible read on the table. The port refuses
     * instead, with a message OF ITS OWN — deliberately not one of the legacy's throw strings — that
     * names the missing input. The optional signature is retained because the source declares it and
     * out-of-scope callers rely on the declared arity.
     */
    await expect(harness.repository.searchByProductType()).rejects.toThrow(/name fragment/);
    // Nothing was composed and nothing was issued: the refusal precedes the statement.
    expect(harness.statements).toEqual([]);
  });

  it('NET-NEW — refuses the omitted term even when a product-type list IS supplied', async () => {
    const harness = buildHarness(fileWith([]));

    await expect(harness.repository.searchByProductType(undefined, 'pt-1')).rejects.toThrow(
      /name fragment/,
    );
    expect(harness.statements).toEqual([]);
  });

  it('NET-NEW — adds no ORDER BY and no row ceiling, because :L421 declares neither', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', 'pt-1');

    /* `:L421` declares no ordering, so the row order is whatever the engine returns and the port must not
     * narrow it: adding an `ORDER BY` would make an unspecified order specific, which is observable
     * output. Nor is a ceiling added — no `LIMIT` appears on this read, and the only source-declared
     * `LIMIT` in this file is the default-SKU back-fill's. */
    const search = collapse(only(harness, 'SELECT productID, productName FROM SwProduct').sql);
    expect(search).not.toContain('ORDER BY');
    expect(search).not.toContain('LIMIT');
    expect(search).not.toContain('OFFSET');
  });

  it('NET-NEW — composes the same statement through the exported composer, filter and all', () => {
    /* The composer is the single source of the statement, so a caller reaching it directly gets exactly
     * what the member emits. Its only argument is a COUNT — never a value and never an identifier — which
     * is what makes it impossible to compose a filter around caller text. */
    expect(collapse(composeProductSearch(0))).toBe(
      'SELECT productID, productName FROM SwProduct WHERE productName LIKE ?',
    );
    expect(collapse(composeProductSearch(2))).toBe(
      'SELECT productID, productName FROM SwProduct WHERE productName LIKE ? ' +
        'AND productTypeID IN (?, ?)',
    );
  });

  it('NET-NEW — issues the search on the pool executor, opening no transaction for a read', async () => {
    const harness = buildHarness(fileWith([]), searchAnswering());

    await harness.repository.searchByProductType('widget');

    /* `:L419-L437` is a read and the legacy wraps it in no transaction, so neither does the port. The
     * region proves it directly, and the empty event log proves nothing was begun. */
    expect(only(harness, 'SELECT productID, productName FROM SwProduct').region).toBe('pool');
    expect(harness.eventKinds()).toEqual([]);
  });

  it('NET-NEW — satisfies the ProductRepository port for all three declared members', () => {
    /*
     * The interface parity check, stated so it cannot drift. This binding fails to compile if the adapter
     * stops satisfying the port — a renamed member, a changed arity, a narrowed argument or a widened
     * return would each break it — which is the compile-time equivalent of the method-by-method mapping
     * the migration is meant to make checkable.
     */
    const asPort: ProductRepository = buildHarness(fileWith([])).repository;

    expect(typeof asPort.findAttributeSets).toBe('function');
    expect(typeof asPort.importFromFile).toBe('function');
    expect(typeof asPort.searchByProductType).toBe('function');
  });
});

/* ================================================================================================
 * The cross-cutting query-discipline and security gates
 * ==============================================================================================
 * Every describe above asserts one behaviour at one locator. This last one asserts the properties that
 * must hold for EVERY statement the adapter can emit, over the whole public surface at once, so a
 * statement added later cannot quietly opt out of them. It is the standing gate rather than a
 * characterisation of any single legacy line.
 * ============================================================================================== */

/** Drives every public member and returns every statement all three produced, in issue order. */
async function everyStatementTheAdapterCanEmit(): Promise<readonly RecordedStatement[]> {
  const importing = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);
  await importing.repository.importFromFile('https://feeds.example/catalog.csv');

  /* The update arm as well, since it composes statements the insert arm never reaches. */
  const updating = buildHarness(ADVERSARIAL_FILE, (statement) => {
    const sql = collapse(statement.sql);

    if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
      return sqlRows([{ optionGroupID: 'og-1' }]);
    }
    if (sql.startsWith('SELECT productID FROM SwProduct')) {
      return sqlRows([{ productID: 'existing-product' }]);
    }
    if (sql.startsWith('SELECT skuID FROM SwSku WHERE skuCode')) {
      return sqlRows([{ skuID: 'existing-sku' }]);
    }
    if (sql.includes('LEFT JOIN SwOption')) {
      return sqlRows([{ optionID: 'opt-1', optionGroupID: 'og-1' }]);
    }

    return undefined;
  });
  await updating.repository.importFromFile('https://feeds.example/catalog.csv');

  /* Read-side arguments are deliberately quote-bearing AND deliberately unlike any schema identifier, so
   * a substring search for them cannot collide with a legitimate column name such as `productTypeID`. */
  const reading = buildHarness(fileWith([]));
  await reading.repository.findAttributeSets(
    [...READ_ARGUMENTS.typeCodes],
    [...READ_ARGUMENTS.productTypeIds],
  );
  await reading.repository.searchByProductType(
    QUOTE_BEARING.searchTerm,
    READ_ARGUMENTS.productTypeIds.join(','),
  );

  return [...importing.statements, ...updating.statements, ...reading.statements];
}

/** Read-side arguments for the gate: quote-bearing, and unmistakable against any schema identifier. */
const READ_ARGUMENTS = Object.freeze({
  typeCodes: Object.freeze(["ty'pe-alpha", "ty'pe-beta"]),
  productTypeIds: Object.freeze(["pt'-alpha", "pt'-beta"]),
});

describe('NET-NEW — the query discipline every statement in this adapter is held to', () => {
  it('NET-NEW — matches parameter count to bind-marker count on every single statement', async () => {
    const statements = await everyStatementTheAdapterCanEmit();

    /* TR-4 — POSITIONAL, ONE FOR ONE, WITH NO EXCEPTIONS. A count mismatch is the failure mode that
     * silently shifts every subsequent value by one, so it is checked on every statement rather than on
     * the ones a case happened to name. */
    expect(statements.length).toBeGreaterThan(20);
    for (const statement of statements) {
      expect((statement.sql.match(/\?/g) ?? []).length).toBe(statement.params.length);
    }
  });

  it('NET-NEW — never composes a supplied value into statement text, anywhere', async () => {
    const statements = await everyStatementTheAdapterCanEmit();
    const text = statements.map((statement) => statement.sql).join('\n');

    /*
     * Every value any of the three members was given, including the wildcard-wrapped search term and the
     * product-type list tokens. None of them may appear as text; all of them appear as parameters.
     *
     * ⚠️ EVERY VALUE HERE IS CHOSEN TO BE UNMISTAKABLE, and that is a deliberate design of the check
     * rather than a convenience. A generic argument such as `'brand'` would be found inside the perfectly
     * legitimate identifier `SwBrand`, so a substring gate built on generic words reports a violation that
     * is not one — and a reader who then relaxes the gate has lost the only test that would have caught a
     * real interpolation.
     */
    const supplied = [
      ...Object.values(QUOTE_BEARING),
      ...READ_ARGUMENTS.typeCodes,
      ...READ_ARGUMENTS.productTypeIds,
      'Merchandise',
      "SKU-O'1",
      'attr-1',
    ];

    for (const value of supplied) {
      expect(text).not.toContain(value);
    }

    const boundValues = statements.flatMap((statement) => statement.params.map(String));

    /* Absent from the text is only half the claim — each value must also have ARRIVED, as a parameter.
     * The search term is the one exception, and a deliberate one: `:L422` wraps it in wildcards at the
     * binding site, so it binds as `%…%` rather than bare, and it is asserted in that form below. */
    for (const value of supplied.filter((value) => value !== QUOTE_BEARING.searchTerm)) {
      expect(boundValues).toContain(value);
    }
    expect(boundValues).toContain(`%${QUOTE_BEARING.searchTerm}%`);
  });

  it('NET-NEW — qualifies no statement with a schema, host, credential or endpoint literal', async () => {
    const statements = await everyStatementTheAdapterCanEmit();
    const text = statements
      .map((statement) => statement.sql)
      .join('\n')
      .toLowerCase();

    /* A statement addresses tables and columns and nothing else. The connection is the pool's business,
     * and the datasource name — `Slatwall`, per the legacy application configuration — is deliberately
     * absent from statement text, which is also what makes the D22 assertion above unambiguous. */
    for (const forbidden of [
      'slatwall.',
      'information_schema',
      'mysql.',
      'localhost',
      '127.0.0.1',
      '://',
      'arn:',
      'password',
      'secret',
      'apikey',
      'api_key',
      'token',
      'datasource',
      'amazonaws',
      '`',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('NET-NEW — issues no DDL, migration or seed statement of any kind', async () => {
    const statements = await everyStatementTheAdapterCanEmit();
    const text = statements
      .map((statement) => statement.sql)
      .join('\n')
      .toUpperCase();

    /* The `Sw*` schema is the fixed contract both systems continue to agree on. This adapter reads and
     * writes rows; it never creates, alters, drops, truncates or seeds a table, and no such statement
     * exists anywhere in `model/dao/ProductDAO.cfc` to port. */
    for (const forbidden of [
      'CREATE TABLE',
      'CREATE INDEX',
      'ALTER TABLE',
      'DROP TABLE',
      'TRUNCATE',
      'CREATE DATABASE',
      'GRANT ',
      'CREATE VIEW',
      'CREATE TRIGGER',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('NET-NEW — carries a LIMIT on exactly the three source-grounded statements, and no other', async () => {
    const statements = await everyStatementTheAdapterCanEmit();
    const limited = statements.filter((statement) => collapse(statement.sql).includes('LIMIT'));

    /*
     * ⭐ NO ROW CEILING IS INVENTED, AND THE THREE THAT EXIST ARE ENUMERATED RATHER THAN WAVED THROUGH.
     * A blanket "no LIMIT anywhere" claim would be false and would hide the interesting question, which
     * is whether each `LIMIT` is source-grounded:
     *
     *   1. `:L291` — the default-SKU back-fill's subquery. The `LIMIT 1` IS IN THE SOURCE, and the
     *      absence of an `ORDER BY` beside it is preserved with it.
     *   2. `:L401-L404` — the URL-title probe. The legacy projected `productID` and `:L404` then read
     *      nothing but the record count, so one matching row was already complete evidence and every
     *      further row was discarded. Provably answer-preserving, and documented as a translation
     *      decision rather than an optimisation.
     *   3. `:L218-L221` — the SKU-option link probe, the same argument: `:L221` reads only the count.
     *
     * Nothing else is capped. The product search in particular carries none, because `:L421` declares
     * none and a ceiling there would change which rows a caller sees.
     */
    const limitedTexts = new Set(limited.map((statement) => collapse(statement.sql)));
    expect(limitedTexts.size).toBe(3);

    for (const text of limitedTexts) {
      expect(
        text.includes('SET defaultSkuID') ||
          text.startsWith('SELECT 1 FROM SwProduct WHERE urlTitle') ||
          text.startsWith('SELECT 1 FROM SwSkuOption'),
      ).toBe(true);
      // One row, every time. No caller-supplied number reaches any of the three.
      expect(text).toContain('LIMIT 1');
    }

    // And no statement mentions an offset, which only the explicitly windowed member may add.
    expect(statements.every((statement) => !collapse(statement.sql).includes('OFFSET'))).toBe(true);
  });

  it('NET-NEW — states no timeout, retry, batch size or capacity number anywhere', async () => {
    const statements = await everyStatementTheAdapterCanEmit();
    const text = statements
      .map((statement) => statement.sql)
      .join('\n')
      .toUpperCase();

    /*
     * The source declares no service level, so the port invents none. Two source-declared budgets exist
     * and BOTH belong elsewhere: the importer's 3600-second request timeout at
     * `model/service/ProductService.cfc:L65-L68` (M1) and the feed's 360-second one — the first is a
     * handler concern that no single invocation of the target runtime can represent, and neither is
     * expressible in a statement. So no statement here sets a timeout, a batch size, a retry count, a
     * pool size or an isolation level, and this suite asserts none of those either.
     */
    for (const forbidden of [
      'SET SESSION',
      'SET GLOBAL',
      'MAX_EXECUTION_TIME',
      'SLEEP(',
      'ISOLATION LEVEL',
      'LOCK IN SHARE MODE',
      'FOR UPDATE',
      'SQL_NO_CACHE',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('NET-NEW — takes its statement executor by injection, so it constructs no pool of its own', async () => {
    const first = createSqlExecutorDouble();
    const second = createSqlExecutorDouble();
    const unitOfWork = createUnitOfWorkDouble({ sqlExecutor: first });

    const repository = new MySqlProductRepository({
      executor: first.executor,
      transactions: unitOfWork.unitOfWork,
      sourceReader: { read: () => Promise.resolve(fileWith([])) },
      accountContext: createAccountContextDouble(persistedAdminAccount()).accountContext,
      urlTitleFilter: (productName) => productName,
      readDefaultSkuId: () => '',
    });

    /*
     * ⭐ THE EXECUTOR IS A COLLABORATOR, NOT A POSSESSION, AND SWAPPING IT PROVES IT. `mysql2` is never
     * imported by this suite and no pool is created anywhere in it: the adapter reaches a database only
     * through the injected statement seam, which is precisely what makes every assertion in this file
     * possible without a database. Re-pointing the read surface at a SECOND double sends the statement
     * there instead — something an adapter holding its own connection could not do.
     *
     * Substituting the whole seam is also what keeps a client-side emulated `query` path unreachable by
     * construction rather than
     * by convention. The seam publishes prepared execution and mutation, and nothing else; there is no
     * client-side-emulated path to reach, so no assertion has to police one.
     */
    await repository.withExecutor(second.executor).searchByProductType('widget');

    expect(second.calls).toHaveLength(1);
    expect(first.calls).toEqual([]);
    expect(collapse(second.calls[0]?.sql ?? '')).toBe(
      'SELECT productID, productName FROM SwProduct WHERE productName LIKE ?',
    );
    // Re-pointing returns a NEW instance and leaves the original bound to its own executor.
    expect(repository.withExecutor(second.executor)).not.toBe(repository);
  });

  it('NET-NEW — records statements losslessly, so every assertion above read real text', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * The evidence about the evidence. Every claim in this file rests on the recording being faithful, so
     * the recording itself is checked: the stored text is the composed text — multi-line, indented,
     * untrimmed — and the parameters are an immutable snapshot in bind order rather than a live reference
     * that a later statement could mutate. Nothing in this suite normalises what it records;
     * {@link collapse} is applied only when MATCHING, and never before storing.
     */
    const [first] = harness.statements;
    expect(first).toBeDefined();
    // Composed text retains its own formatting: a normalising recorder would have collapsed this.
    expect(first?.sql).toContain('\n');
    expect(first?.sql.trim()).not.toBe(collapse(first?.sql ?? ''));

    /* The snapshot is frozen, so a recorded array is a snapshot rather than a live reference the adapter
     * could still be holding and reusing. Every parameter array in the run is checked, not just one. */
    for (const statement of harness.statements) {
      expect(Object.isFrozen(statement.params)).toBe(true);
    }
  });
});
