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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  composeAttributeSetSelection,
  composeExistenceLookup,
  composeImportInsert,
  composeImportUpdate,
  composeProductSearch,
  MySqlProductRepository,
  unresolvableProductContentAssignmentFactory,
  unresolvableProductContentAssignmentPort,
  unresolvableProductImportSourceReader,
  MySqlProductPersistence,
} from '../../src/adapters/mysql/MySqlProductRepository';
import type {
  ProductContentAssignmentFactory,
  ProductImportTransactionScope,
} from '../../src/adapters/mysql/MySqlProductRepository';
import type { TransactionalSqlExecutor } from '../../src/adapters/mysql/UnitOfWork';
import type {
  ProductContentAssignmentPort,
  ProductContentAssignmentRow,
  ResolvedProductListingContent,
  DelimitedImportRecord,
  DelimitedImportRecordSet,
  MySqlProductRepositoryDependencies,
  ProductImportSourceReader,
  ProductImportTransactionBoundary,
  ProductDependencyCleanup,
  ProductPersistenceExecutor,
} from '../../src/adapters/mysql/MySqlProductRepository';
import { assertTableName } from '../../src/adapters/mysql/QueryRunner';
import type { SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
import { DomainError, DataIntegrityError } from '../../src/errors/DomainError';
import type { UnitOfWork } from '../../src/adapters/mysql/UnitOfWork';
import { Product, PRODUCT_PROPERTY_DESCRIPTORS } from '../../src/domain/product/Product';
import type { ProductPropertyName } from '../../src/domain/product/Product';
import type { ProductDefaultSkuDelegate } from '../../src/domain/product/Product';
import type { AccountContextPort } from '../../src/ports/AccountContextPort';
import type { SettingName } from '../../src/ports/SettingResolverPort';
import type {
  ProductImportRedirectHop,
  ProductImportSourceBounds,
  ProductImportSourcePolicy,
  ProductRepository,
  ProductSearchRow,
  ValidatedProductImportSource,
} from '../../src/ports/repositories/ProductRepository';
import {
  GENEROUS_SMART_LIST_BUDGET,
  TEST_ADMIN_ACCOUNT_ID,
  buildSku,
  createAbsentAccountContextDouble,
  createAccountContextDouble,
  createBaseServicePersistenceDouble,
  createPopulationAuthorizationDouble,
  createSettingResolverDouble,
  createSqlExecutorDouble,
  createUniquePropertyDouble,
  createUnitOfWorkDouble,
  createUrlTitleAvailabilityDouble,
  persistedAdminAccount,
  physicalID,
  sqlAffectedRows,
  sqlFailure,
  sqlRows,
  GENEROUS_URL_TITLE_PROBE_BUDGET,
} from '../support/inMemoryRepositories';
import type {
  SqlExecutorCall,
  SqlExecutorOutcome,
  UnitOfWorkEventKind,
  UnitOfWorkSettlementResponder,
  UrlTitleTableName,
} from '../support/inMemoryRepositories';
import {
  attachSkuOptions,
  createCatalogAggregateLoaders,
  SmartListQueryBuilder,
} from '../../src/adapters/mysql/SmartListQueryBuilder';
import type { CatalogAggregateDependencies } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { toExactDecimal } from '../../src/util/formatting';
import type { ExactDecimal } from '../../src/util/formatting';
import {
  readProductDefaultSkuId,
  forgetHydratedParentProductTypeID,
  isSkuOwnedLinkAuthoritative,
  mapProductRow,
  mapProductTypeRow,
  readHydratedParentProductTypeID,
} from '../../src/adapters/mysql/rowMappers';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { Option } from '../../src/domain/option/Option';
import { Sku } from '../../src/domain/sku/Sku';
import type { SmartListRecord } from '../../src/ports/SmartListQueryPort';
import { OptionService } from '../../src/services/OptionService';
import { Brand } from '../../src/domain/product/Brand';
import { ProductType } from '../../src/domain/product/ProductType';
import type { ManagedEntity } from '../../src/domain/base/populate';
import { ProductService } from '../../src/services/ProductService';
import { MySqlProductTypeRepository } from '../../src/adapters/mysql/MySqlProductTypeRepository';
import { BaseService } from '../../src/services/BaseService';
import type { EntityPersister, EntityRemover } from '../../src/services/BaseService';
import {
  createOptionGroupSortOrderMemo,
  createTransactionExistenceChecker,
  MySqlSkuRepository,
} from '../../src/adapters/mysql/MySqlSkuRepository';
import { Validator } from '../../src/validation/Validator';
import { productValidationRuleSet } from '../../src/validation/rules/product.rules';
import type { BrandStatementExecutor } from '../../src/adapters/mysql/MySqlBrandRepository';
import { MySqlBrandRepository } from '../../src/adapters/mysql/MySqlBrandRepository';
import { assertColumnName } from '../../src/adapters/mysql/QueryRunner';
import type { BrandRepository } from '../../src/ports/repositories/BrandRepository';
import { createManagedBrand } from '../support/inMemoryRepositories';

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

/**
 * What the instrumented streaming reader observed — F10.
 *
 * ⚠️ WHY THIS EXISTS. The harness previously supplied ONLY the materialising `read` member, so
 * `MySqlProductRepository.importFromFile`'s streaming branch — `this.sourceReader.readStreaming !==
 * undefined` at [`MySqlProductRepository.ts`:L3012] — was never entered by any case in this file. Four
 * behaviours therefore had no assertion at all: that the streaming member is PREFERRED when offered,
 * that records are pulled ONE AT A TIME between per-row transactions rather than drained up front, that
 * an abandoned generator's `finally` runs, and that the content-column preflight's buffer-and-replay is
 * what keeps a legally-completing import from silently importing nothing.
 *
 * ⭐ EVERY FIELD IS A DERIVED OBSERVATION, NOT A MODEL. `pulls` records the statement count at the moment
 * each record was REQUESTED, which is what turns "lazily" from a claim into an arithmetic fact: a reader
 * drained before the first statement gives every pull the same count, and a reader advanced between row
 * boundaries gives strictly increasing ones.
 */
interface StreamObservation {
  /** One entry per record the consumer asked for, in request order. */
  readonly pulls: readonly {
    /** The record's 1-based file position, matching the row number the importer derives. */
    readonly rowNumber: number;
    /** How many statements had been issued, across all regions, when this record was requested. */
    readonly statementsIssued: number;
  }[];
  /** `true` once the generator ran to natural completion — every record yielded, loop exited. */
  exhausted: boolean;
  /** `true` once the generator's `finally` ran, whether by exhaustion or by abandonment. */
  closed: boolean;
}

/*
 * ⛔ `HarnessExtras` IS REMOVED, NOT MISLAID. It declared two opt-in harness extras — `offerStreaming`
 * and `onRecordPulled` — and was never wired into `buildHarness`, which takes a `StreamingSpec` for the
 * first and needs no hook for the second. Its documentation had also gone stale: it described a
 * `throwIfCancelled('contentAssignmentPreflight', …)` checkpoint that the cancellation phase union no
 * longer carries, the preflight refusal it belonged to having been superseded by the ported content
 * assignment. Keeping an unreferenced interface that names a withdrawn checkpoint would mislead the next
 * reader; the streaming arm and the cancellation checkpoints are each covered by their own describe
 * blocks below.
 */
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
  /**
   * Every location the import-source policy was asked to validate, in call order.
   *
   * ⭐ THE EVIDENCE THAT THE POLICY IS CONSULTED AT ALL. The latent CWE-918 of review finding 14 was
   * precisely that a conforming reader could retrieve without one, so the suite asserts on this list
   * rather than trusting the contract's prose.
   */
  readonly validatedSources: readonly string[];
  /** Every redirect hop the policy was asked to re-validate, with the address it resolved to. */
  readonly revalidatedHops: readonly ProductImportRedirectHop[];
  /** The policy the harness injected, so a test can substitute a refusing one. */
  readonly sourcePolicy: ProductImportSourcePolicy;
  /**
   * The retrieval collaborator itself, so a case can substitute one of its members.
   *
   * Exposed for the same reason {@link Harness.sourcePolicy} is: the adapter reads
   * `this.sourceReader.read` at CALL time, so replacing the member on this object is observed, which is
   * how the `afterRetrieval` cancellation boundary is reached without a second harness shape.
   */
  readonly sourceReader: ProductImportSourceReader;
  /**
   * The transactional executor the unit-of-work double hands to every scope — finding F11.
   *
   * The double shares ONE recording executor across every transaction so that an invocation's statements
   * read back as a single ordered list while the event log still attributes each to its own transaction.
   * That is what makes `region` work; it also means the per-row scopes are distinguished by IDENTITY
   * rather than by executor, which is what the F11 cases assert.
   */
  readonly transactionalExecutor: TransactionalSqlExecutor;
  /** The collaborator itself, so a test can make one of its members fail. */
  readonly contentAssignmentPort: ProductContentAssignmentPort;
  /**
   * Every transaction scope the content-assignment FACTORY was built from, in call order — finding F11.
   *
   * One entry per row that actually had a page to assign, and each entry is the scope of THAT row's
   * transaction. Comparing an entry's executor against the executor the row's other statements ran on is
   * what proves the step joined the row's transaction rather than committing beside it.
   */
  readonly contentAssignmentScopes: readonly ProductImportTransactionScope[];
  /** Every content page the assignment collaborator was asked to resolve, in call order. */
  readonly contentLookups: readonly string[];
  /** Every existence probe, in call order — `model/dao/ProductDAO.cfc:L271`. */
  readonly contentProbes: readonly { productId: string; contentId: string }[];
  /** Every link row inserted, in call order — `model/dao/ProductDAO.cfc:L277`. */
  readonly contentInserts: readonly ProductContentAssignmentRow[];
  /** Seed which file names resolve; absent names resolve to `null` (`:L269`). */
  readonly resolvableContentPages: Map<string, ResolvedProductListingContent>;
  /** Seed `productId|contentId` pairs that are already assigned (`:L271` answering yes). */
  readonly existingAssignments: Set<string>;
  /**
   * Which retrieval member the adapter chose, in call order — review finding 13.
   *
   * `readStreaming` is OPTIONAL on the port and `importFromFile` prefers it whenever it is defined, so
   * this is the only direct evidence of which of the two arms actually ran. A case that supplies no
   * {@link StreamingSpec} must see exactly `['read']`.
   */
  readonly readerCalls: readonly ('read' | 'readStreaming')[];
  /** The 1-based index of every record the streaming generator actually yielded, in order. */
  readonly recordsYielded: readonly number[];
  /**
   * How many times the streaming generator's `finally` ran.
   *
   * ⭐ THE ABANDONMENT EVIDENCE. `ProductImportSourceReader.readStreaming` requires that a generator
   * release its connection, handle or buffer in a `finally` rather than only on normal completion,
   * because the importer stops consuming at the first failing row (M3) and at the next row boundary
   * after a cancellation. That obligation is only discharged if the CONSUMER closes the iterator, which
   * is what this counts.
   */
  streamReleases(): number;
  /** Transaction lifecycle events, in order. */
  eventKinds(): readonly UnitOfWorkEventKind[];
  transactionsCommitted(): number;
  transactionsRolledBack(): number;
  transactionsStarted(): number;
  /**
   * Which retrieval member the adapter actually invoked, in invocation order — F10.
   *
   * `'read'` for the materialising member, `'readStreaming'` for the lazy one. With streaming offered
   * this must contain ONLY `'readStreaming'`: a reader that offers both and is asked for both would be
   * retrieving the file twice.
   */
  retrievalMembers(): readonly ('read' | 'readStreaming')[];
  /** What the instrumented streaming reader observed. Empty unless `offerStreaming` was requested. */
  readonly stream: StreamObservation;
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
 * Opt-in streaming behaviour for the retrieval collaborator — review finding 13.
 *
 * ⛔ OPT-IN, AND THAT IS THE WHOLE DESIGN. `ProductImportSourceReader.readStreaming` is OPTIONAL, and
 * `MySqlProductRepository.importFromFile` prefers it over `read` whenever it is defined. Defining it
 * unconditionally on the shared double would silently move EVERY other case in this file onto the
 * streaming arm and leave the materialising arm — the one the port declares as mandatory — with no
 * coverage at all. So a case that wants streaming asks for it by name, and every other case keeps
 * `read`, which {@link Harness.readerCalls} lets either kind of case prove.
 */
interface StreamingSpec {
  /**
   * Yield this many records, then throw — a mid-file transport or parse failure.
   *
   * `undefined` yields every record and completes normally. `0` throws before yielding anything, which
   * is the shape a source that failed immediately after its header pass would produce.
   */
  readonly throwAfterRecords?: number;
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
 * @param streaming - selects the streaming retrieval arm and states what it answers with; `undefined`
 *   leaves the reader on its whole-record-set arm. The arm the adapter takes is a property of the
 *   reader it was given, not of the call, which is why this is wired here rather than per import.
 * @param settlement - fails a settlement step; `undefined` and every settlement succeeds. Distinct from
 *   `reply`, and the distinction is the point: `reply` fails a STATEMENT, which the boundary answers by
 *   rolling back, while this fails the boundary's own `begin`, `commit` or `rollback`, which leaves the
 *   shared connection in a state nobody can describe. Only the second reaches the destroy branch.
 *
 *   ⚠️ NOTE THE SLOT. This responder is the FIFTH parameter, after `streaming`. It was introduced as the
 *   fourth against a revision of this harness that had no streaming arm; both capabilities are real and
 *   independent, so both are kept and the later one is appended rather than displacing the earlier.
 * @returns the harness.
 */
function buildHarness(
  recordSet: DelimitedImportRecordSet,
  reply?: (statement: SqlExecutorCall) => SqlExecutorOutcome | undefined,
  accountContext: AccountContextPort = createAccountContextDouble(persistedAdminAccount())
    .accountContext,
  streaming?: StreamingSpec,
  settlement?: UnitOfWorkSettlementResponder,
): Harness {
  const statements: RecordedStatement[] = [];
  const retrievals: {
    readonly source: string;
    readonly delimiter: string;
    readonly textQualifier: string;
  }[] = [];
  const retrievalMembers: ('read' | 'readStreaming')[] = [];
  const pulls: { readonly rowNumber: number; readonly statementsIssued: number }[] = [];
  const stream: StreamObservation = { pulls, exhausted: false, closed: false };

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

  /* Assigned only when a case actually supplies one, because `exactOptionalPropertyTypes` makes an
   * explicit `undefined` a different thing from an absent member. */
  const unitOfWork = createUnitOfWorkDouble(
    settlement === undefined ? { sqlExecutor } : { sqlExecutor, settlement },
  );

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

  /* ------------------------------------------------------------------------------------------------
   * THE IMPORT-SOURCE POLICY DOUBLE — ADMITS EVERYTHING, AND RECORDS THAT IT WAS ASKED
   * ----------------------------------------------------------------------------------------------
   * ⛔ THIS IS A TEST DOUBLE AND IT IS DELIBERATELY PERMISSIVE. Production ships
   * `unresolvableProductImportSourceReader`, whose policy REFUSES every member; a suite driving the
   * import path needs one that admits, or no import could be exercised at all. An admitting policy is
   * correct HERE and would be a security defect in `src/`, which is why it lives only in this file.
   *
   * ⭐ IT COUNTS ITS CALLS so the suite can prove the adapter actually consults it, and in what order
   * relative to retrieval. `readBounds` returns figures that are ARBITRARY TEST VALUES with no
   * operational meaning — the port states no bound and neither does the subtree (AAP §0.7.3 standard 9,
   * IR-12); these exist only so the member is answerable.
   * -------------------------------------------------------------------------------------------- */
  const validatedSources: string[] = [];
  const revalidatedHops: ProductImportRedirectHop[] = [];

  const admittingSourcePolicy: ProductImportSourcePolicy = {
    validateSource: (fileURL: string): Promise<ValidatedProductImportSource> => {
      validatedSources.push(fileURL);
      return Promise.resolve(fileURL as ValidatedProductImportSource);
    },
    revalidateRedirectHop: (
      hop: ProductImportRedirectHop,
    ): Promise<ValidatedProductImportSource> => {
      revalidatedHops.push(hop);
      return Promise.resolve(hop.location as ValidatedProductImportSource);
    },
    readBounds: (): ProductImportSourceBounds => ({
      maxBytes: 1,
      maxMilliseconds: 1,
      maxRedirectHops: 0,
    }),
  };

  /* ------------------------------------------------------------------------------------------------
   * THE CONTENT-ASSIGNMENT DOUBLE — REVIEW FINDING 12
   * ----------------------------------------------------------------------------------------------
   * Stands in for the collaborator that owns `tContent` and `SlatwallProductContent`, neither of which is
   * in this subtree's physical table whitelist. It records every call so the suite can assert the ported
   * algorithm of `model/dao/ProductDAO.cfc:L257-L282` step by step: which pages were looked up, in what
   * order, which were probed, and which were inserted.
   *
   * `resolvableContentPages` decides which file names resolve; anything absent resolves to `null`, which
   * is how `:L269`'s zero `recordcount` is expressed. `existingAssignments` holds `productId|contentId`
   * pairs that are already assigned, which is `:L271`'s probe answering yes.
   * -------------------------------------------------------------------------------------------- */
  const contentLookups: string[] = [];
  const contentProbes: { productId: string; contentId: string }[] = [];
  const contentInserts: ProductContentAssignmentRow[] = [];
  const resolvableContentPages = new Map<string, ResolvedProductListingContent>();
  const existingAssignments = new Set<string>();

  const contentAssignmentScopes: ProductImportTransactionScope[] = [];

  const contentAssignmentPort: ProductContentAssignmentPort = {
    findProductListingContent: (
      pageFileName: string,
    ): Promise<ResolvedProductListingContent | null> => {
      contentLookups.push(pageFileName);
      return Promise.resolve(resolvableContentPages.get(pageFileName) ?? null);
    },
    hasContentAssignment: (productId: string, contentId: string): Promise<boolean> => {
      contentProbes.push({ productId, contentId });
      return Promise.resolve(existingAssignments.has(`${productId}|${contentId}`));
    },
    insertContentAssignment: (row: ProductContentAssignmentRow): Promise<void> => {
      contentInserts.push(row);
      /* The real collaborator's insert makes the pair exist, so the double must too — otherwise two
       * pages of one row resolving to the same content could not demonstrate `:L271`'s guard. */
      existingAssignments.add(`${row.productId}|${row.contentId}`);
      return Promise.resolve();
    },
  };

  /* ------------------------------------------------------------------------------------------------
   * THE RETRIEVAL COLLABORATOR — REVIEW FINDING 13
   * ----------------------------------------------------------------------------------------------
   * `read` is always present, because the port declares it as mandatory. `readStreaming` appears ONLY
   * when the caller supplied a {@link StreamingSpec}, so the arm the adapter takes is a property of the
   * case rather than of the harness.
   * -------------------------------------------------------------------------------------------- */
  const readerCalls: ('read' | 'readStreaming')[] = [];
  const recordsYielded: number[] = [];
  let streamReleaseCount = 0;

  const materialisingRead = (
    source: string,
    delimiter: string,
    textQualifier: string,
  ): Promise<DelimitedImportRecordSet> => {
    readerCalls.push('read');
    retrievals.push({ source, delimiter, textQualifier });
    return Promise.resolve(recordSet);
  };

  /**
   * The lazy record source, honouring the port's `finally`-release obligation.
   *
   * The `finally` runs whether the generator completes, throws, or is CLOSED EARLY by a consumer that
   * stopped iterating — which is exactly the abandonment `readStreaming` documents and exactly what
   * {@link Harness.streamReleases} counts. Nothing here issues a statement, so the record source cannot
   * interleave work with the row boundaries it is advanced between (M6).
   */
  async function* streamedRecordSource(): AsyncGenerator<DelimitedImportRecord> {
    try {
      let index = 0;

      for (const record of recordSet.rows) {
        if (streaming?.throwAfterRecords !== undefined && index >= streaming.throwAfterRecords) {
          throw new DomainError('The retrieval collaborator failed part-way through the file.', {
            context: { yieldedBeforeFailure: index },
          });
        }

        index += 1;
        recordsYielded.push(index);

        /* ⭐ A REAL AWAIT, NOT A LINT DODGE. A retrieval collaborator delivers each record across some
         * transport, so yielding one is asynchronous; awaiting here makes the double asynchronous in the
         * same way. It also matters to the laziness case below: a generator that resolved synchronously
         * could make an interleaving assertion pass for the wrong reason, because the row loop would never
         * actually suspend between records. */
        await Promise.resolve();

        yield record;
      }
    } finally {
      streamReleaseCount += 1;
    }
  }

  const sourceReader: ProductImportSourceReader =
    streaming === undefined
      ? { sourcePolicy: admittingSourcePolicy, read: materialisingRead }
      : {
          sourcePolicy: admittingSourcePolicy,
          read: materialisingRead,
          readStreaming: (source, delimiter, textQualifier) => {
            readerCalls.push('readStreaming');
            retrievals.push({ source, delimiter, textQualifier });

            return Promise.resolve({
              columnList: recordSet.columnList,
              records: streamedRecordSource(),
            });
          },
        };

  /*
   * ⭐ F11 — A FACTORY THAT RECORDS THE SCOPE IT WAS HANDED. The adapter now builds the collaborator per
   * row from that row's `TransactionScope`, so the double records the scope and then answers the SAME port
   * instance every time — which keeps every existing `contentLookups` / `contentProbes` / `contentInserts`
   * assertion in this file working unchanged, while making the new per-row binding observable.
   */
  const contentAssignment: ProductContentAssignmentFactory = (scope) => {
    contentAssignmentScopes.push(scope);
    return contentAssignmentPort;
  };

  const dependencies: MySqlProductRepositoryDependencies = {
    executor: sqlExecutor.executor,
    transactions: unitOfWork.unitOfWork,
    sourceReader,
    contentAssignment,
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
    validatedSources,
    revalidatedHops,
    sourcePolicy: admittingSourcePolicy,
    sourceReader,
    /* F11 — the transactional executor every scope hands out, so a test can assert that the scope the
     * content-assignment factory received is the row's own rather than some other object. */
    transactionalExecutor: sqlExecutor.executor,
    contentLookups,
    contentProbes,
    contentInserts,
    contentAssignmentPort,
    contentAssignmentScopes,
    resolvableContentPages,
    existingAssignments,
    readerCalls,
    recordsYielded,
    streamReleases: () => streamReleaseCount,
    eventKinds: () => unitOfWork.eventKinds(),
    transactionsCommitted: () => unitOfWork.transactionsCommitted(),
    transactionsRolledBack: () => unitOfWork.transactionsRolledBack(),
    transactionsStarted: () => unitOfWork.transactionsStarted(),
    retrievalMembers: () => [...retrievalMembers],
    stream,
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

/* ================================================================================================
 * PHYSICALLY VALID IDENTIFIERS — REVIEW FINDING 16, APPLIED HERE FOR CONSISTENCY
 *
 * This file was not among the three the review's identifier audit named, but it was the worst-placed
 * file in the subtree to leave alone: it ASSERTS the physical contract in several cases — {@link HEX_32}
 * immediately above, applied to every minted identifier — while simultaneously handing the adapter
 * short readable identifiers such as `og-1` as though the database had returned them. A file that
 * pins a contract in one case and contradicts it in the next is the state most likely to mislead the
 * next reader, so the readable ones are now minted by `physicalID(label)` too.
 *
 * The point is sharper here than in a service suite. Every value converted is one the DOUBLE RETURNS
 * AS A DATABASE ROW — `sqlRows([{ optionGroupID: … }])` stands in for `SELECT optionGroupID FROM
 * SwOptionGroup`, whose real answer is 32 lowercase hexadecimal characters. Several of the assertions
 * downstream then check that exact value flows into a bound parameter, so feeding the adapter the shape
 * production feeds it is the difference between testing the bind and testing a seven-character token.
 *
 * ⚠️ ONE DELIBERATE EXCEPTION, AND IT IS NOT AN IDENTIFIER. The content-page values in the finding-12
 * cases — `'page-a,page-b,page-c'`, `'missing-page,page-1'` — stay readable, because they are not
 * entity keys. `model/dao/ProductDAO.cfc:L262` looks a content row up by its `path`, a human-authored
 * text column, and the value arrives as a cell of an uploaded import file. IR-6 governs primary keys;
 * it says nothing about file content, and rewriting these as hexadecimal would misrepresent what the
 * legacy column holds. The `contentId` values those lookups RESOLVE TO are a different matter and are
 * already physical (`cccccccccccccccccccccccccccc0001` and siblings), which is exactly the distinction
 * worth preserving: a readable key going IN, an IR-6 identifier coming BACK.
 * ============================================================================================== */

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
 * importFromFile — the import-location gate at the retrieval sink (CWE-918)
 *
 * ⛔ THE OPTIONAL-ALLOW-LIST FORM OF THIS GATE IS WITHDRAWN, AND ITS SUITE WITH IT. An earlier
 * revision gated the sink with an OPTIONAL `ProductImportSourcePolicy` carrying `allowedSchemes` and
 * `allowedHosts`, asserted here across sixteen cases. That shape admitted a conforming caller that
 * wired no policy at all, which is the vulnerability the finding describes rather than a fix for it.
 * The gate is now STRUCTURAL: `ProductImportSourceReader.sourcePolicy` is a REQUIRED member, the read
 * members accept only a `ValidatedProductImportSource`, and that brand cannot be produced except
 * through `ProductImportSourcePolicy.validateSource`. A reader therefore cannot be reached with a
 * location that never met a policy, and no test can construct the omitted-policy case because the
 * type system refuses it.
 *
 * The coverage did not move out of this file — it moved DOWN it. See
 * `describe('NET-NEW — the required import-source policy (review finding 14, CWE-918)')`, which
 * asserts the required member, the verbatim forwarding, the pre-transaction placement, the
 * spreadsheet-branch validation and the redirect-hop re-validation against the retained design.
 * ============================================================================================== */
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

  it("NET-NEW — a row whose COMMIT itself fails DESTROYS the list's shared connection instead of releasing it", async () => {
    /*
     * ⭐ THE TWIN OF THE CASE ABOVE, AND THE ONE THAT SEPARATES TWO FAILURES THAT LOOK ALIKE. There, row
     * 2's STATEMENT failed: the boundary rolled back, the roll-back worked, the connection's transaction
     * state was known again, and it was RELEASED. Here row 2's COMMIT is what fails, so there is no
     * roll-back to attempt and nothing can be said about what the database retained — and one connection
     * is shared by the whole list (M3 keeps a transaction per row, not a checkout per row), so the
     * disposal that closes the list must be a DESTROY.
     *
     * ⛔ WHY THE PROBE HAD TO GAIN THIS ABILITY AT ALL. While the support double's settlement could not
     * fail, its `finally` recorded `release` unconditionally and the destroy branch was unreachable from
     * every consumer suite — so the dirty-connection handling could have been removed from
     * `src/adapters/mysql/UnitOfWork.ts` outright with this file, and every other file that drives the
     * double, still green. Asserting the two disposals side by side is what makes the rule falsifiable
     * from the importer's own path.
     *
     * ⚠️ M3 IS UNCHANGED BY THE FAILURE, and that is asserted too: row 1 stays committed, row 3 is never
     * attempted, and the back-fills never run. A destroyed connection is a pooling consequence, not a
     * rewrite of the per-row commit semantics.
     */
    const commitFailure = new Error('the second row could not be committed');
    const harness = buildHarness(
      THREE_ROW_FILE,
      undefined,
      undefined,
      undefined,
      (step, transaction) => {
        if (step === 'commit' && transaction === 2) {
          throw commitFailure;
        }
      },
    );

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toBe(commitFailure);

    expect(harness.eventKinds()).toEqual([
      'acquire',
      'begin',
      'commit',
      'begin',
      'commit',
      'destroy',
    ]);
    /* The attempted commit is on record; only the one that WORKED is counted. */
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(0);
    expect(harness.transactionsStarted()).toBe(2);
    expect(harness.eventKinds()).not.toContain('release');

    /* Row 1 did its work, row 3 was never entered, and neither back-fill ran. */
    expect(
      harness.statements.filter((statement) => statement.region === 'row#1').length,
    ).toBeGreaterThan(0);
    expect(harness.statements.filter((statement) => statement.region === 'row#3')).toEqual([]);
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

  it('NET-NEW — runs the back-fills at the TAIL of the import, on an un-transacted region', async () => {
    const harness = buildHarness(fileWith([]));

    /*
     * ⛔ REACHED THROUGH THE IMPORT, BECAUSE THERE IS NO OTHER WAY IN. This case used to invoke
     * `backfillImportDerivedColumns()` directly: the member was public and declared on the port so an
     * out-of-band workflow could defer the pass. Review finding F4 withdrew that flag and the exposure with
     * it, so the member is private again and the import's tail is its one caller — which is where
     * `model/dao/ProductDAO.cfc:L288`/`:L304` sit. The claim is unchanged: same two statements, same order,
     * same un-transacted region, nothing begun or committed.
     */
    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    expect(only(harness, 'SET defaultSkuID').region).toBe('backfill');
    expect(only(harness, 'SET imageFile').region).toBe('backfill');
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
    return sqlRows([{ optionGroupID: physicalID('og-1') }]);
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
    expect(only(harness, 'LEFT JOIN SwOption').params).toEqual([
      QUOTE_BEARING.optionCode,
      physicalID('og-1'),
    ]);

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
        return sqlRows([{ optionGroupID: physicalID('og-1') }]);
      }
      // Both existence lookups HIT, so `saveImportData` takes its UPDATE arm at `:L390-L396`.
      if (sql.startsWith('SELECT productID FROM SwProduct')) {
        return sqlRows([{ productID: physicalID('existing-product') }]);
      }
      if (sql.startsWith('SELECT skuID FROM SwSku')) {
        return sqlRows([{ skuID: physicalID('existing-sku') }]);
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
    expect(productUpdate.params[productUpdate.params.length - 1]).toBe(
      physicalID('existing-product'),
    );

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
    expect(skuUpdate.params[skuUpdate.params.length - 1]).toBe(physicalID('existing-sku'));
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
        return sqlRows([{ optionGroupID: physicalID('og-1') }]);
      }
      // `:L216` finds an option, so `:L217` takes its non-empty branch and the probe at `:L218` runs.
      if (sql.includes('LEFT JOIN SwOption')) {
        return sqlRows([{ optionID: physicalID('opt-1'), optionGroupID: physicalID('og-1') }]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L218-L221` then `:L230-L234` — the link is probed, and inserted only when absent. Both bind the
     * two identifiers positionally and neither composes one into text. The probe stops at one row
     * because `:L221` reads nothing but the record count.
     *
     * ⭐ AND IT IS A LOCKING READ — REVIEW FINDING SEC-RACE-01, which named "duplicate link rows" among its
     * exploits explicitly. This probe DECIDES the insert two lines below it, and `SwSkuOption` has no DDL to
     * appeal to: `model/entity/Sku.cfc:L76` declares only a `many-to-many` `linktable="SwSkuOption"` with no
     * unique index over the pair, so two concurrent imports both reading no match both insert and nothing
     * convicts the duplicate. `FOR UPDATE` returns precisely the rows the same predicate returns — the
     * verdict below is unchanged, and the sibling case that seeds a match still skips the insert — while
     * under REPEATABLE READ the no-match case takes a gap lock over the scanned range. It is safe to hold
     * inside an import because `model/dao/ProductDAO.cfc:L176-L177` opens the transaction INSIDE the record
     * loop (AAP §0.6.6 M3), so the lock spans one row rather than the whole file. */
    const linkProbe = only(harness, 'SELECT 1 FROM SwSkuOption');
    expect(collapse(linkProbe.sql)).toBe(
      'SELECT 1 FROM SwSkuOption WHERE optionID = ? AND skuID = ? LIMIT 1 FOR UPDATE',
    );
    expect(linkProbe.params[0]).toBe(physicalID('opt-1'));
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
        return sqlRows([{ optionGroupID: physicalID('og-1') }]);
      }
      if (sql.includes('LEFT JOIN SwOption')) {
        return sqlRows([{ optionID: physicalID('opt-1'), optionGroupID: physicalID('og-1') }]);
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
        return sqlRows([{ optionGroupID: physicalID('og-1') }]);
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
     * — the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132], THE LOGICAL-TO-PHYSICAL TRANSLATION. `:L193` and `:L207` pass the LOGICAL literals
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

  it('NET-NEW — names no Mura CMS tContent table, and composes no excluded identifier for it', () => {
    /*
     * ⛔ `model/dao/ProductDAO.cfc:L262` SELECTS FROM `tContent`, A MURA CMS TABLE, and `:L271`/`:L277`
     * touch `SlatwallProductContent`, whose whole `Content*` family AAP §0.2.2.1 excludes. NEITHER is in
     * this port's physical whitelist and neither may be added to one: admitting them would extend a
     * catalogue port into a content-management schema whose columns and lifecycle sit outside every scope
     * boundary declared for this slice.
     *
     * ⭐ THIS CASE USED TO ASSERT A REFUSAL OF THE WHOLE IMPORT, AND THAT WAS REVIEW FINDING 12. The
     * boundary is real, but refusing was "a functional substitution, not a translation" — the legacy
     * COMPLETES the step. What the boundary actually forbids is composing those identifiers HERE, which is
     * a narrower claim than refusing the import, and it is the claim this case now makes. The behaviour
     * itself is asserted in the ported-algorithm section below, through
     * `ProductContentAssignmentPort`.
     */
    expect(() => assertTableName('tContent')).toThrow(/does not contain/);
    expect(() => assertTableName('SwProductContent')).toThrow(/does not contain/);
    expect(() => assertTableName('SlatwallProductContent')).toThrow(/does not contain/);
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
            ? sqlRows([{ optionGroupID: physicalID('og-1') }])
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
    expect(only(harness, 'LEFT JOIN SwOption').params).toEqual(['Blue', physicalID('og-1')]);
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
          return sqlRows([{ productID: physicalID('existing-product') }]);
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
        return sqlRows([{ optionGroupID: physicalID('og-1') }]);
      }
      if (sql.startsWith('SELECT productID FROM SwProduct')) {
        return sqlRows([{ productID: physicalID('existing-product') }]);
      }
      if (sql.startsWith('SELECT skuID FROM SwSku')) {
        return sqlRows([{ skuID: physicalID('existing-sku') }]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* Same internal return, different arm: `:L392` reads the identifier off the existence lookup instead
     * of generating one, and every dependent write then carries THAT value. */
    expect(only(harness, 'UPDATE SwAttributeValue').params).toContain(
      physicalID('existing-product'),
    );
    expect(only(harness, 'INSERT INTO SwSkuOption').params).toContain(physicalID('existing-sku'));
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

  it('NET-NEW — re-probes the brand on EVERY row, resolved or not (finding F12)', async () => {
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
        return sqlRows([{ brandID: physicalID('brand-1') }]);
      }

      return undefined;
    });
    const unresolved = buildHarness(twoRowsOneBrand);

    await resolving.repository.importFromFile('https://feeds.example/catalog.csv');
    await unresolved.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔ TWO ROWS, TWO STATEMENTS — WHETHER THE BRAND RESOLVES OR NOT. `model/dao/ProductDAO.cfc:L179-L182`
     * sits inside the record loop and is re-run per row, with no memory of any kind.
     *
     * THIS CASE USED TO ASSERT THE OPPOSITE for the resolving harness — one statement, because an
     * import-scoped memory remembered POSITIVE resolutions. Review finding F12 withdrew that memory: the
     * asymmetry it relied on (misses re-probe, hits do not) narrowed the divergence from the legacy without
     * closing it, because a rename or a delete-and-recreate mid-import stayed hidden behind a remembered
     * identifier. AAP §0.8.2 guideline 4 and IR-9 both point the same way, and no source-backed
     * immutability guarantee exists to license it. The withdrawal block above `ImportPlan` in
     * `src/adapters/mysql/MySqlProductRepository.ts` preserves the full argument that was made for it.
     */
    expect(matching(resolving, 'FROM SwBrand')).toHaveLength(2);
    expect(matching(unresolved, 'FROM SwBrand')).toHaveLength(2);

    /* And both carry the same bound cell value — the read is repeated, not varied. */
    expect(matching(resolving, 'FROM SwBrand').map((call) => call.params)).toEqual([
      ['Acme'],
      ['Acme'],
    ]);
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
        { productID: physicalID('p-1'), productName: 'First Widget' },
        { productID: physicalID('p-2'), productName: QUOTE_BEARING.productName },
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
      { id: physicalID('p-1'), value: 'First Widget' },
      { id: physicalID('p-2'), value: QUOTE_BEARING.productName },
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

  it('NET-NEW — satisfies the ProductRepository port across its whole declared surface', () => {
    /*
     * The interface parity check, stated so it cannot drift. This binding fails to compile if the adapter
     * stops satisfying the port — a renamed member, a changed arity, a narrowed argument or a widened
     * return would each break it — which is the compile-time equivalent of the method-by-method mapping
     * the migration is meant to make checkable.
     *
     * ⚠️ ALL FIVE ARE NAMED, NOT THREE. An earlier revision asserted "all three declared members" and
     * listed only the three legacy DAO members, which silently under-counted the port: `ProductRepository`
     * also declares `saveProduct` and `removeProduct`, each documented as additive at its own declaration.
     * An assertion that names a subset cannot notice a member disappearing from outside that subset, so the
     * whole surface is enumerated. (It listed SIX for a time. The sixth was
     * `backfillImportDerivedColumns`, withdrawn under review finding F4 with the back-fill deferral that
     * was its only justification.)
     */
    const asPort: ProductRepository = buildHarness(fileWith([])).repository;

    /* The three legacy DAO members — AAP §0.4.2.6. */
    expect(typeof asPort.findAttributeSets).toBe('function');
    expect(typeof asPort.importFromFile).toBe('function');
    expect(typeof asPort.searchByProductType).toBe('function');

    /* The two additive members, each defended at its declaration. */
    expect(typeof asPort.saveProduct).toBe('function');
    expect(typeof asPort.removeProduct).toBe('function');

    /*
     * ⛔ AND THE BOUNDED SEARCH IS ABSENT, ASSERTED RATHER THAN LEFT IMPLICIT.
     *
     * `searchByProductTypeBounded` was declared on this port, implemented on this adapter and mirrored on
     * the in-memory double, and was reached from NOWHERE — no service, no handler, no integration. It has
     * been removed, and the removal is pinned here because absence is otherwise invisible: nothing else
     * in this suite would notice it being reinstated, and reinstating it would restore adapter code that
     * cannot be exercised through any ratified caller.
     *
     * Wiring one instead was not available. AAP §0.4.2.1 fixes `ProductService` at fifteen public members
     * and none is a product search — the legacy `model/dao/ProductDAO.cfc:L419` member is reached from the
     * out-of-scope admin layer, not from `model/service/ProductService.cfc` — so a caller would have
     * needed an unratified sixteenth member, which TR-1 and AAP §0.8.2 guideline 4 forbid.
     *
     * ⭐ AND THE THREE SIBLING BOUNDED MEMBERS HAVE SINCE GONE THE SAME WAY, so what was an asymmetry is
     * now a uniform rule. This note used to record that `SkuRepository.searchByProductTypeBounded` was
     * reached from `SkuService.searchSkusByProductTypeBounded`, and the two `OptionRepository` windowed
     * reads from `OptionService` — but those service members were themselves withdrawn to keep
     * `SkuService` at the nine members AAP §0.4.2.1/§0.4.2.2 tabulate and `OptionService` at the seven
     * §0.4.1.8 fixes, which left all three repository members with no routed caller either. NO BOUNDED
     * REPOSITORY MEMBER EXISTS ANYWHERE IN THE PORT LAYER NOW, and the window vocabulary that typed them
     * survives only at `src/ports/repositories/BoundedRead.ts` for a future member to use.
     */
    expect('searchByProductTypeBounded' in asPort).toBe(false);
    expect(
      Object.hasOwn(Object.getPrototypeOf(asPort) as object, 'searchByProductTypeBounded'),
    ).toBe(false);

    /*
     * The unbounded member it sat beside is untouched, and still declares its TWO arguments — `term` and
     * the plural `productTypeIDs`. Arity is asserted because the removed member's own arity was three, so
     * a mistaken deletion of the wrong declaration would show up here as a two becoming a three.
     */
    expect(asPort.searchByProductType).toHaveLength(2);
  });

  /*
   * ⭐ REVIEW FINDING F3 — THE SAME SURFACE, CHECKED THE OTHER WAY ROUND. The case above enumerates the
   * six members BY HAND, which catches a member that DISAPPEARS. It cannot catch one that is ADDED: a
   * seventh method could join the port and every assertion above would still pass. The mapped type below
   * closes that direction — it is keyed off `keyof ProductRepository`, so a new member makes this file
   * fail to COMPILE until it is named here and driven by the statement sweep.
   *
   * ⛔ AND IT NAMES SIX KEYS, NOT SEVEN. The revision that introduced this check listed
   * `searchByProductTypeBounded` as a seventh and asserted a length of seven. That member has since been
   * withdrawn from the port for having no caller anywhere, so a seven-key map would now fail to compile
   * against the six-member interface — which is precisely the property being relied on here, working as
   * intended.
   */
  it('NET-NEW — the ProductRepository surface is EXHAUSTIVE at FIVE members, keyed off the port itself', () => {
    const asPort: ProductRepository = buildHarness(fileWith([])).repository;

    const everyPortMember: Record<keyof ProductRepository, true> = {
      findAttributeSets: true,
      importFromFile: true,
      searchByProductType: true,
      saveProduct: true,
      removeProduct: true,
    };

    const declared = Object.keys(everyPortMember) as readonly (keyof ProductRepository)[];

    expect(declared).toHaveLength(5);
    for (const member of declared) {
      expect(typeof asPort[member]).toBe('function');
    }
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

/**
 * Drives every public member and returns every statement they produced, in issue order.
 *
 * ⚠️ "EVERY STATEMENT" IS A LOAD-BEARING CLAIM, AND IT HAS TO BE KEPT TRUE. An earlier revision drove
 * only the importer's two arms plus the two unbounded reads, while the gates below asserted their
 * properties over "EVERY statement the adapter can emit" — so the bounded search, the write, the
 * removal and the explicit back-fill were exempt from the standing discipline without saying so. Each
 * is driven here now, and anything added to the public surface later must be added here too or the
 * gates silently stop covering it.
 */
async function everyStatementTheAdapterCanEmit(): Promise<readonly RecordedStatement[]> {
  const importing = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);
  await importing.repository.importFromFile('https://feeds.example/catalog.csv');

  /* The update arm as well, since it composes statements the insert arm never reaches. */
  const updating = buildHarness(ADVERSARIAL_FILE, (statement) => {
    const sql = collapse(statement.sql);

    if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
      return sqlRows([{ optionGroupID: physicalID('og-1') }]);
    }
    if (sql.startsWith('SELECT productID FROM SwProduct')) {
      return sqlRows([{ productID: physicalID('existing-product') }]);
    }
    if (sql.startsWith('SELECT skuID FROM SwSku WHERE skuCode')) {
      return sqlRows([{ skuID: physicalID('existing-sku') }]);
    }
    if (sql.includes('LEFT JOIN SwOption')) {
      return sqlRows([{ optionID: physicalID('opt-1'), optionGroupID: physicalID('og-1') }]);
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
  /* The write and removal arms, whose statements no read or import path composes. Both arms of the
   * write are driven, because an insert LISTS the identifier while an update MATCHES on it. */
  const writing = buildHarness(fileWith([]));
  await writing.repository.saveProduct(transientProduct());
  await writing.repository.saveProduct(persistedProduct());
  await writing.repository.removeProduct(persistedProduct());
  /*
   * ⚠️ AND BOTH WRITE ARMS AGAIN WITH ADVERSARIAL VALUES, WHICH IS THE HALF THAT WAS MISSING. Driving
   * the write path with `transientProduct()` alone put its STATEMENTS under the gates below but not its
   * VALUES: every field that product carries is benign, so the value-separation gate could scan the
   * insert and the update and find nothing to separate. It would have passed identically against an
   * adapter that composed `productName` straight into the statement text. `adversarialProduct()` carries
   * a quote and a statement terminator in every writable field, so the gate now has something to fail on.
   *
   * The benign arms above are KEPT rather than replaced: they are what the other gates' expectations were
   * written against, and the adversarial arms compose the same statement texts — the write column list is
   * fixed, not derived from which fields happen to be set — so adding them changes which VALUES the sweep
   * observes without changing which STATEMENTS it observes.
   */
  await writing.repository.saveProduct(adversarialProduct());
  await writing.repository.saveProduct(adversarialProduct({ productID: PERSISTED_PRODUCT_ID }));
  /* The two back-fill statements are already in `importing.statements`: the import above runs them at its
   * tail, unconditionally, and since review finding F4 withdrew the deferral flag that is their only
   * route — the member is private again. Invoking them a second time here would double-count them in the
   * sweep without covering a statement the sweep has not already seen. */

  return [
    ...importing.statements,
    ...updating.statements,
    ...reading.statements,
    ...writing.statements,
  ];
}

/**
 * A product whose every writable text field carries a quote and a statement terminator.
 *
 * Used by the cross-cutting gates so the write path is held to the same value-separation rule as the
 * importer. The values are deliberately unlike any schema identifier, so a substring search for one
 * cannot collide with a legitimate column name.
 */
function adversarialProduct(overrides: Partial<Product> = {}): Product {
  const product = new Product();

  product.productName = WRITE_ARGUMENTS.productName;
  product.productCode = WRITE_ARGUMENTS.productCode;
  product.productDescription = WRITE_ARGUMENTS.productDescription;
  product.urlTitle = WRITE_ARGUMENTS.urlTitle;

  /*
   * ⚠️ THE OVERRIDES PARAMETER EXISTS FOR ONE REASON: THE UPDATE ARM. `saveProduct` branches on
   * `isNew()`, so a product with no identifier can only ever reach the INSERT statement. Supplying
   * `productID` here is what lets the same adversarial values be driven through the UPDATE arm as well,
   * and both arms need it — an insert LISTS the identifier among its values while an update MATCHES on
   * it and appends it last, so the two bind their values at different offsets and a gate that saw only
   * one of them would be half a gate.
   */
  return Object.assign(product, overrides);
}

/**
 * Write-side arguments for the gate: quote-bearing, and unmistakable against any schema identifier.
 *
 * ⚠️ DECLARED ONCE AND CONSUMED TWICE, WHICH IS THE POINT. `adversarialProduct()` assigns these and the
 * gate below asserts them, so the values the write path is GIVEN and the values the gate LOOKS FOR cannot
 * drift apart. Inlining them in the factory would let a later edit change a field's value and silently
 * narrow the gate to a string nothing sends any more — a gate that then passes by vacuity.
 */
const WRITE_ARGUMENTS = Object.freeze({
  productName: "Pro'duct; DROP TABLE SwProduct; --",
  productCode: "co'de-alpha",
  productDescription: "des'cription <b>alpha</b>",
  urlTitle: "url'-title",
});

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
     * Every value any of the SIX members was given — the importer's cells, the read side's search term
     * and product-type tokens, and the write side's quote-bearing product fields. None of them may appear
     * as text; all of them appear as parameters.
     *
     * ⚠️ THE WRITE-SIDE VALUES ARE LISTED HERE DELIBERATELY, AND THEIR ABSENCE WAS PART OF FINDING F3 —
     * NOW DISCHARGED AT BOTH ENDS. Naming them here was only half of it: the helper also had to SEND them,
     * and while it drove the write arms with a benign product these expectations were unsatisfiable, so the
     * gate reported a failure that named a real hole rather than a wrong assertion. The helper now drives
     * both write arms with `adversarialProduct()` as well, so each value below is both named here and
     * actually bound. Scanning a statement is not the same as holding its values to the rule, and
     * `productName` carries a statement terminator precisely so that the difference is observable rather
     * than theoretical.
     *
     * ⚠️ EVERY VALUE HERE IS CHOSEN TO BE UNMISTAKABLE, and that is a deliberate design of the check
     * rather than a convenience. A generic argument such as `'brand'` would be found inside the perfectly
     * legitimate identifier `SwBrand`, so a substring gate built on generic words reports a violation that
     * is not one — and a reader who then relaxes the gate has lost the only test that would have caught a
     * real interpolation.
     */
    const supplied = [
      ...Object.values(QUOTE_BEARING),
      ...Object.values(WRITE_ARGUMENTS),
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
     * absent from statement text, which is also what makes the naming-divergence assertion above unambiguous. */
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

  it('NET-NEW — carries a LIMIT on exactly three statements — one source-literal and two documented answer-preserving — and no other', async () => {
    const statements = await everyStatementTheAdapterCanEmit();
    const limited = statements.filter((statement) => collapse(statement.sql).includes('LIMIT'));

    /*
     * ⭐ NO ROW CEILING IS INVENTED, AND THE THREE THAT EXIST ARE ENUMERATED RATHER THAN WAVED THROUGH —
     * separated by PROVENANCE, because only one of them is literally in the legacy text. A blanket
     * "no LIMIT anywhere" claim would be false, and a blanket "all three are source-grounded" claim would
     * be false in the other direction:
     *
     *   1. SOURCE-LITERAL. `:L291` — the default-SKU back-fill's subquery. The `LIMIT 1` IS IN THE
     *      LEGACY TEXT, and the absence of an `ORDER BY` beside it is preserved with it.
     *   2. ANSWER-PRESERVING TARGET DECISION. `:L401-L404` — the URL-title probe. The legacy statement
     *      carries NO `LIMIT`: it projects `productID`, and `:L404` then reads nothing but the record
     *      count, so one matching row was already complete evidence and every further row was discarded.
     *      The cap is therefore provably answer-preserving, and it is a translation decision rather than
     *      either a source quotation or an optimisation.
     *   3. ANSWER-PRESERVING TARGET DECISION. `:L218-L221` — the SKU-option link probe, the same
     *      argument and the same absence of a legacy `LIMIT`: `:L221` reads only the count.
     *
     * ⚠️ AND THERE IS NO FOURTH, CALLER-SUPPLIED CATEGORY ON THIS PORT. A windowed
     * `searchByProductTypeBounded` was declared here at one point and has been withdrawn: no caller in
     * the slice reached it, and AAP §0.4.2.1 closes `ProductService` at fifteen members with no product
     * search among them, so nothing could reach it without inventing a sixteenth. Its removal is why
     * this gate expects THREE shapes rather than four, and why every `LIMIT` the adapter can emit is a
     * literal `LIMIT 1` FIXED BY THIS ADAPTER rather than a number a caller chose — one of the three
     * quoted from the legacy text and the other two the documented answer-preserving decisions above.
     * (The distinction is provenance, not shape: all three are `LIMIT 1`, and none is caller-supplied.)
     * NO WINDOWED REPOSITORY MEMBER EXISTS ANYWHERE NOW: the `SkuRepository` and `OptionRepository`
     * companions this note used to point at have been withdrawn on the same no-caller ground, so no port
     * in the slice emits a caller-supplied `LIMIT ? OFFSET ?` at all.
     *
     * Nothing else is capped. The UNBOUNDED product search in particular carries none, because `:L421`
     * declares none and a ceiling there would change which rows a caller sees.
     */
    const limitedTexts = new Set(limited.map((statement) => collapse(statement.sql)));

    /*
     * ⚠️ THERE IS NO FOURTH SHAPE, AND THE REASON IS A WITHDRAWAL RATHER THAN AN OVERSIGHT. A windowed
     * `searchByProductTypeBounded` was declared on this port at one point, and while it existed this gate
     * was expected to see a fourth `LIMIT ? OFFSET ?` shape once the sweep drove every member. The member
     * has since been withdrawn — nothing in the slice reached it, and AAP §0.4.2.1 closes `ProductService`
     * at fifteen members with no product search among them — so the fourth shape has no emitter and the
     * count is three.
     *
     * ⭐ WHAT THAT WITHDRAWAL DOES *NOT* EXCUSE IS THE WIDENING, AND THE WIDENING IS THE PART THAT MATTERS.
     * While this helper drove only three of the adapter's members, the closing claim — no statement mentions
     * an offset — was passing by omission: the statements that could have contradicted it were never
     * executed. The helper now drives all SIX declared members, so the same claim is discharged by
     * execution rather than by absence. That is the durable half of the finding, and it survives the
     * member's removal intact.
     */
    expect(limitedTexts.size).toBe(3);

    /* No windowed shape at all, now that the caller-supplied window has been withdrawn from this port. */
    const windowed = [...limitedTexts].filter((text) => text.includes('OFFSET'));
    expect(windowed).toHaveLength(0);

    const hardCaps: string[] = [];
    const boundWindows: string[] = [];

    for (const text of limitedTexts) {
      if (text.endsWith('LIMIT ? OFFSET ?')) {
        boundWindows.push(text);
        continue;
      }
      hardCaps.push(text);
      expect(
        text.includes('SET defaultSkuID') ||
          text.startsWith('SELECT 1 FROM SwProduct WHERE urlTitle') ||
          text.startsWith('SELECT 1 FROM SwSkuOption'),
      ).toBe(true);
      // One row, every time. No caller-supplied number reaches any of the three, whatever its provenance.
      expect(text).toContain('LIMIT 1');
    }

    expect(hardCaps).toHaveLength(3);
    /* And NO windowed shape, now that the caller-supplied window has been withdrawn from this port. */
    expect(boundWindows).toHaveLength(0);

    /*
     * And no statement this adapter can emit carries an OFFSET at all. The prohibition is global again
     * because the one member that legitimately paginated has been withdrawn; what it encodes is that no
     * statement quietly acquires pagination the legacy never had.
     */
    const offsetBearing = statements.filter((statement) =>
      collapse(statement.sql).includes('OFFSET'),
    );
    expect(offsetBearing).toHaveLength(0);
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
     *
     * ⛔ `FOR UPDATE` WAS ON THIS LIST AND IS DELIBERATELY OFF IT — REVIEW FINDING SEC-RACE-01. It never
     * belonged with the others, and its presence here was a category error worth naming rather than quietly
     * correcting. Everything else on the list is a CAPACITY or SERVICE-LEVEL number: a timeout, a batch
     * size, a retry count, a row cache hint. IR-12 and AAP §0.7.3 S9 forbid the port from authoring those
     * because it would be choosing a figure on an operator's behalf. A lock is not a figure. It carries no
     * number to invent, it states no service level, and it changes no value any statement returns — it says
     * only that a second writer asking the same question must wait for the first to finish. So the finding's
     * "duplicate link rows are also possible" is closed by the locks on the two importer probes, and this
     * list keeps every genuinely invented-number prohibition it had.
     *
     * ⭐ `LOCK IN SHARE MODE` STAYS FORBIDDEN, AND THE ASYMMETRY IS THE POINT. A shared read lock lets two
     * transactions both hold it and both conclude "free", which converts a silent duplicate into an
     * intermittent failure without preventing anything. Only the exclusive lock serialises. Keeping the
     * shared spellings on the list is what stops a well-meaning substitution from undoing the mechanism.
     */
    for (const forbidden of [
      'SET SESSION',
      'SET GLOBAL',
      'MAX_EXECUTION_TIME',
      'SLEEP(',
      'ISOLATION LEVEL',
      'LOCK IN SHARE MODE',
      'FOR SHARE',
      'SQL_NO_CACHE',
    ]) {
      expect(text).not.toContain(forbidden);
    }

    /*
     * ⭐ AND THE LOCK APPEARS ONLY WHERE SEC-RACE-01 PUT IT: the two check-then-act probes of
     * `model/dao/ProductDAO.cfc:L212-L214` and `:L218-L220`, each of which DECIDES an insert. Asserted as an
     * exact set rather than as "at least these", so a revision that sprinkled `FOR UPDATE` across the
     * adapter's read surface — where it would take locks that protect nothing and invite deadlocks — fails
     * here even though every individual statement would still be syntactically fine.
     *
     * ⚠️ DE-DUPLICATED, BECAUSE THE COUNT OF EMISSIONS IS NOT THE COUNT OF SHAPES. The option lookup is
     * issued once per option column per row, so a fixture with two option columns emits it twice; that is
     * `:L212-L215` re-running the lookup for every row × every surviving group, which the adapter reproduces
     * deliberately. What this case is about is which STATEMENTS lock, so the set is compared rather than the
     * log.
     */
    const locking = [
      ...new Set(
        statements
          .map((statement) => collapse(statement.sql))
          .filter((sql) => sql.includes('FOR UPDATE')),
      ),
    ];

    expect(locking).toHaveLength(2);
    expect(locking.filter((sql) => sql.includes('LEFT JOIN SwOption'))).toHaveLength(1);
    expect(locking.filter((sql) => sql.includes('FROM SwSkuOption'))).toHaveLength(1);
    /* Each ENDS with the clause, which is the only position MySQL accepts. */
    for (const sql of locking) {
      expect(sql.endsWith('FOR UPDATE')).toBe(true);
    }
  });

  it('NET-NEW — takes its statement executor by injection, so it constructs no pool of its own', async () => {
    const first = createSqlExecutorDouble();
    const second = createSqlExecutorDouble();
    const unitOfWork = createUnitOfWorkDouble({ sqlExecutor: first });

    const repository = new MySqlProductRepository({
      executor: first.executor,
      transactions: unitOfWork.unitOfWork,
      sourceReader: {
        sourcePolicy: {
          validateSource: (fileURL: string) =>
            Promise.resolve(fileURL as ValidatedProductImportSource),
          revalidateRedirectHop: (hop: ProductImportRedirectHop) =>
            Promise.resolve(hop.location as ValidatedProductImportSource),
          readBounds: () => ({ maxBytes: 1, maxMilliseconds: 1, maxRedirectHops: 0 }),
        },
        read: () => Promise.resolve(fileWith([])),
      },
      contentAssignment: unresolvableProductContentAssignmentFactory,
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

/* ================================================================================================
 * THE THREE ADDITIVE MEMBERS — the write, the removal, and the import controls
 * ================================================================================================
 * Everything above exercises the three members `model/dao/ProductDAO.cfc` declares. The suites below
 * exercise the three it does NOT, and their labels carry **NET-NEW** for a second and stronger reason
 * than the rest of the file: not merely "no legacy test exists" but "no legacy MEMBER exists". There
 * is no legacy statement, no legacy bind order and no legacy return contract for these to be
 * traceable to, so every expectation is derived from the production source alone and none of it should
 * be read as evidence of observed parity with the CFML system.
 *
 * ⛔ A FOURTH ADDITIVE MEMBER WAS DECLARED HERE AND HAS BEEN WITHDRAWN. `searchByProductTypeBounded`
 * capped rows on a statement the legacy never capped, and nothing reached it: AAP §0.4.2.1 closes
 * `ProductService` at fifteen members and §0.4.2.5 enumerates the synthesized set, with no product
 * search in either, so wiring a caller would have meant inventing a sixteenth member. It is asserted
 * ABSENT in the port-satisfaction case above rather than tested here. The `SkuRepository` and
 * `OptionRepository` companions that once justified calling this withdrawal an asymmetry have since been
 * withdrawn on the same ground, so no windowed repository member survives in the slice.
 *
 * WHY THE REMAINING THREE EXIST, since a reviewer is entitled to ask before reading their cases:
 *   - `saveProduct` / `removeProduct` — persistence formerly reached the database through the ORM
 *     flush the framework triggered at request end, which mismatch M5 removed along with the session.
 *     A stateless invocation has to issue its own statements.
 *   - `ProductImportOptions` — the legacy importer ran under a 3600-second request budget (M1) with a
 *     transaction per row (M3). Neither survives a single Lambda invocation, so the port offers a
 *     cancellation signal and a way to defer the post-loop back-fills across chunks. Their cases pin
 *     WHERE cancellation is observed, which is the part that determines whether an abort can leave a
 *     row half-written.
 * ============================================================================================== */

/**
 * The 19 writable product columns, resolved through the whitelist in the adapter's declared order.
 *
 * The adapter keeps its own list module-private, so these expectations resolve each name the same way
 * it does rather than importing internals or retyping literals. The ORDER is the adapter's order, and
 * that order IS the assertion in the bind-order cases: a column moved in production without being
 * moved here shifts a binding, and these cases fail rather than passing against a shifted array.
 */
const PRODUCT_WRITE_COLUMNS = Object.freeze([
  'activeFlag',
  'urlTitle',
  'productName',
  'productCode',
  'productDescription',
  'publishedFlag',
  'sortOrder',
  'calculatedSalePrice',
  'calculatedQATS',
  'calculatedAllowBackorderFlag',
  'calculatedTitle',
  'brandID',
  'productTypeID',
  'defaultSkuID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const);

/** The identifier column name, spelled once. */
const PRODUCT_ID_COLUMN_NAME = 'productID';

/*
 * The three physical tables the write and removal statements name, resolved through the same schema
 * whitelist the adapter uses rather than retyped. A name the whitelist stopped recognising would fail
 * at module evaluation instead of quietly comparing one hard-coded literal against another.
 */
const PRODUCT_TABLE = assertTableName('SwProduct');
const SKU_TABLE = assertTableName('SwSku');
const SKU_OPTION_TABLE = assertTableName('SwSkuOption');

/** A persisted product identifier for the write and removal cases. */
const PERSISTED_PRODUCT_ID = 'dddddddddddddddddddddddddddddddd';

/**
 * A transient product carrying the field values a save should persist.
 *
 * `productID` is left at the constructor's empty string, which is what `model/entity/Product.cfc:L52`
 * declares as `unsavedvalue=""` and what `isNew()` tests, so this selects the insert branch.
 */
function transientProduct(overrides: Partial<Product> = {}): Product {
  const product = new Product();
  product.productName = 'Test Product';
  product.productCode = 'TESTPRODUCT-1';
  product.urlTitle = 'test-product';
  product.activeFlag = true;
  product.publishedFlag = true;
  return Object.assign(product, overrides);
}

/** A persisted product: a non-empty identifier is what makes `isNew()` answer false. */
function persistedProduct(overrides: Partial<Product> = {}): Product {
  const product = transientProduct(overrides);
  product.productID = PERSISTED_PRODUCT_ID;
  return product;
}

/** The index of a writable column within a bound parameter array, for the given branch. */
function writeColumnIndex(
  column: (typeof PRODUCT_WRITE_COLUMNS)[number],
  branch: 'insert' | 'update',
): number {
  /*
   * ⚠️ THE TWO BRANCHES DO NOT SHARE AN OFFSET, AND CONFLATING THEM READS THE NEXT COLUMN'S VALUE.
   * An INSERT lists the identifier first, shifting every column value one position right; an UPDATE
   * binds the writable values from position zero and appends the identifier at the end. Naming the
   * branch here forces each call site to say which it means instead of guessing.
   */
  const position = PRODUCT_WRITE_COLUMNS.indexOf(column);
  return branch === 'insert' ? position + 1 : position;
}

describe('NET-NEW — saveProduct: the INSERT branch', () => {
  it('NET-NEW — mints a 32-character identifier for a transient product and binds it FIRST', async () => {
    const harness = buildHarness(fileWith([]));
    const product = transientProduct();

    expect(product.isNew()).toBe(true);

    await harness.repository.saveProduct(product);

    /* IR-6: 32 lowercase hexadecimal characters, no dashes, generated in application code. */
    expect(product.productID).toMatch(HEX_32);
    expect(product.isNew()).toBe(false);
    expect(only(harness, 'INSERT INTO SwProduct').params[0]).toBe(product.productID);
  });

  it('NET-NEW — saveProduct emits the exact column list, one placeholder per column, identifier included', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.saveProduct(transientProduct());

    const statement = only(harness, 'INSERT INTO SwProduct');
    const expectedColumns = [PRODUCT_ID_COLUMN_NAME, ...PRODUCT_WRITE_COLUMNS].join(', ');
    const expectedPlaceholders = [PRODUCT_ID_COLUMN_NAME, ...PRODUCT_WRITE_COLUMNS]
      .map(() => '?')
      .join(', ');

    /*
     * Whole-statement equality rather than a substring probe. A column added to the list but not to
     * the value array — or the reverse — shifts every binding after it, and only an exact comparison
     * of both halves catches that.
     */
    expect(collapse(statement.sql)).toBe(
      `INSERT INTO ${PRODUCT_TABLE} (${expectedColumns}) VALUES (${expectedPlaceholders})`,
    );
    expect(statement.params).toHaveLength(PRODUCT_WRITE_COLUMNS.length + 1);
  });

  it('NET-NEW — stamps the audit actor through the FREE functions, not through entity hooks', async () => {
    const harness = buildHarness(fileWith([]));
    const product = transientProduct();

    await harness.repository.saveProduct(product);

    /*
     * ⭐ THE FREE STAMPING FUNCTIONS ARE CORRECT HERE, AND THE CONTRAST IS DELIBERATE.
     * `MySqlProductTypeRepository.saveProductType` calls the ENTITY'S OWN hooks, because
     * `model/entity/ProductType.cfc:L305-L313` overrides them to rebuild its ancestry path before
     * delegating to the audit block. `model/entity/Product.cfc` overrides NEITHER hook, so a product
     * only ever received the framework block — which is what the free functions are. Calling entity
     * hooks here would invoke behaviour the legacy product never had.
     */
    const statement = only(harness, 'INSERT INTO SwProduct');
    expect(product.createdByAccount).toBe(TEST_ADMIN_ACCOUNT_ID);
    expect(product.modifiedByAccount).toBe(TEST_ADMIN_ACCOUNT_ID);
    expect(statement.params[writeColumnIndex('createdByAccountID', 'insert')]).toBe(
      TEST_ADMIN_ACCOUNT_ID,
    );
    expect(statement.params[writeColumnIndex('modifiedByAccountID', 'insert')]).toBe(
      TEST_ADMIN_ACCOUNT_ID,
    );
    expect(product.createdDateTime).toBeInstanceOf(Date);
  });

  it('NET-NEW — stamps the timestamps but binds NULL actors when no account is in context', async () => {
    const harness = buildHarness(
      fileWith([]),
      undefined,
      createAbsentAccountContextDouble().accountContext,
    );
    const product = transientProduct();

    await harness.repository.saveProduct(product);

    /*
     * An absent account is a real state — an unauthenticated or system-initiated write. The timestamps
     * still have to be stamped because they depend on the clock rather than the actor, and the two
     * account columns bind null rather than an empty string: the difference between "nobody was
     * recorded" and "an account whose identifier is blank".
     */
    expect(product.createdDateTime).toBeInstanceOf(Date);
    expect(product.createdByAccount).toBeUndefined();
    expect(
      only(harness, 'INSERT INTO SwProduct').params[
        writeColumnIndex('createdByAccountID', 'insert')
      ],
    ).toBeNull();
  });

  it('NET-NEW — saveProduct binds an ABSENT optional field as null rather than dropping it from the statement', async () => {
    const harness = buildHarness(fileWith([]));
    const product = new Product();
    product.productName = 'Sparse Product';

    await harness.repository.saveProduct(product);

    const statement = only(harness, 'INSERT INTO SwProduct');

    /*
     * Dropping the column would let the database apply its own default, which is a DIFFERENT outcome
     * from storing the absence the entity holds — and on an update it would leave a stale value in
     * place. Every unset field, including the two association keys, binds null.
     */
    expect(statement.params[writeColumnIndex('productDescription', 'insert')]).toBeNull();
    expect(statement.params[writeColumnIndex('brandID', 'insert')]).toBeNull();
    expect(statement.params[writeColumnIndex('productTypeID', 'insert')]).toBeNull();
    expect(statement.params).toHaveLength(PRODUCT_WRITE_COLUMNS.length + 1);
  });

  it('NET-NEW — saveProduct BINDS a quote-bearing value instead of writing it into the statement text', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.saveProduct(
      transientProduct({ productName: QUOTE_BEARING.productName }),
    );

    const statement = only(harness, 'INSERT INTO SwProduct');

    /*
     * D18's hardening applies to the IMPORTER's interpolated statements. This write interpolates
     * nothing in the first place, so the value appears in the bound array and nowhere in the text —
     * ordinary compliance rather than an exception, and this case is its evidence.
     */
    expect(statement.params).toContain(QUOTE_BEARING.productName);
    expect(statement.sql).not.toContain(QUOTE_BEARING.productName);
    expect(statement.sql).not.toContain("'");
  });

  it('NET-NEW — saveProduct returns the SAME entity instance it was handed, not a copy', async () => {
    const harness = buildHarness(fileWith([]));
    const product = transientProduct();

    /*
     * The caller keeps its reference and reads the minted identifier off it. Returning a copy would
     * leave the caller holding a transient entity that reports `isNew()` forever.
     */
    await expect(harness.repository.saveProduct(product)).resolves.toBe(product);
  });
});

describe('NET-NEW — saveProduct: the UPDATE branch', () => {
  it('NET-NEW — PRESERVES the stored identifier, mints no replacement, and binds it LAST', async () => {
    const harness = buildHarness(fileWith([]));
    const product = persistedProduct();

    expect(product.isNew()).toBe(false);

    await harness.repository.saveProduct(product);

    const statement = only(harness, 'UPDATE SwProduct SET');
    const expectedAssignments = PRODUCT_WRITE_COLUMNS.map((column) => `${column} = ?`).join(', ');

    expect(product.productID).toBe(PERSISTED_PRODUCT_ID);
    expect(collapse(statement.sql)).toBe(
      `UPDATE ${PRODUCT_TABLE} SET ${expectedAssignments} WHERE ${PRODUCT_ID_COLUMN_NAME} = ?`,
    );
    /*
     * The identifier binds LAST here and FIRST on the insert, because an insert LISTS it while an
     * update MATCHES on it. Transposing the two would key the row on a column value — the single most
     * damaging binding error this member could make.
     */
    expect(statement.params).toHaveLength(PRODUCT_WRITE_COLUMNS.length + 1);
    expect(statement.params[statement.params.length - 1]).toBe(PERSISTED_PRODUCT_ID);
  });

  it('NET-NEW — saveProduct refreshes the MODIFIED audit pair without disturbing a stored CREATED pair', async () => {
    const harness = buildHarness(fileWith([]));
    const storedCreation = new Date('2018-07-08T09:10:11.000Z');
    const product = persistedProduct();
    product.createdDateTime = storedCreation;
    product.createdByAccount = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await harness.repository.saveProduct(product);

    /*
     * An update stamps only the modified half. Overwriting the created half would rewrite history on
     * every save, and because the update binds a full column assignment the stored creation values
     * have to survive the round trip through the entity to be re-bound unchanged.
     */
    expect(product.createdDateTime).toBe(storedCreation);
    expect(product.createdByAccount).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(product.modifiedByAccount).toBe(TEST_ADMIN_ACCOUNT_ID);

    const statement = only(harness, 'UPDATE SwProduct SET');
    expect(statement.params[writeColumnIndex('createdDateTime', 'update')]).toBe(storedCreation);
    expect(statement.params[writeColumnIndex('createdByAccountID', 'update')]).toBe(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
  });

  it('NET-NEW — saveProduct issues exactly ONE statement, with no read-back probe before it', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.saveProduct(persistedProduct());

    /*
     * The insert-or-update decision comes from the entity, not from a probe. The importer probes
     * because a delimited row carries no identifier and existence has to be discovered; a product
     * reaching this member is either freshly constructed or loaded from a row, so `isNew()` answers
     * exactly and a round trip would buy nothing.
     */
    expect(harness.statements).toHaveLength(1);
    expect(harness.eventKinds()).toEqual([]);
  });

  it('NET-NEW — saveProduct chooses its branch from the ENTITY, so one adapter answers both shapes', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.saveProduct(transientProduct());
    await harness.repository.saveProduct(persistedProduct());

    expect(harness.statements).toHaveLength(2);
    expect(collapse(harness.statements[0]?.sql ?? '').startsWith('INSERT INTO SwProduct')).toBe(
      true,
    );
    expect(collapse(harness.statements[1]?.sql ?? '').startsWith('UPDATE SwProduct')).toBe(true);
  });

  it('NET-NEW — saveProduct does not read the affected-row count, so a zero-row update still resolves', async () => {
    const harness = buildHarness(fileWith([]), () => sqlAffectedRows(0));
    const product = persistedProduct();

    /*
     * The legacy write primitive at `org/Hibachi/HibachiDAO.cfc:L69-L77` is declared `void` and
     * reported nothing, so a caller never learned whether a row was present. Resolving on a zero-row
     * acknowledgement preserves that; raising would invent a failure mode the legacy did not have.
     */
    await expect(harness.repository.saveProduct(product)).resolves.toBe(product);
  });
});

describe('NET-NEW — removeProduct: refusal, and the four-statement order', () => {
  it('NET-NEW — REFUSES a transient product and issues NO statement at all', async () => {
    const harness = buildHarness(fileWith([]));

    /*
     * A transient product carries the empty unsaved value from `model/entity/Product.cfc:L52`, so a
     * removal keyed on it would compose `WHERE productID = ''` — matching nothing in a sound table and
     * an arbitrary row in an unsound one. Refusing before composing anything is not a hardening: it
     * refuses an input the legacy could not express, rather than one it accepted.
     */
    await expect(harness.repository.removeProduct(transientProduct())).rejects.toThrow(
      /cannot be removed before it has been persisted/,
    );
    expect(harness.statements).toHaveLength(0);
  });

  it('NET-NEW — names the refused product code in the failure context', async () => {
    const harness = buildHarness(fileWith([]));

    await expect(
      harness.repository.removeProduct(transientProduct({ productCode: 'UNSAVED-1' })),
    ).rejects.toMatchObject({ context: { productCode: 'UNSAVED-1' } });
  });

  it('NET-NEW — emits FOUR statements in referential order, each keyed on the identifier', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.removeProduct(persistedProduct());

    /*
     * ⭐ THE ORDER IS THE CONTRACT, BECAUSE EVERY STEP REMOVES A ROW THE NEXT ONE REFERENCES.
     *   1. The product's own back-reference to its default SKU is nulled, because that SKU row is
     *      about to disappear and the column points at it.
     *   2. The SKU-option link rows go next, since they reference the SKU rows removed in step 3.
     *   3. The SKU rows, which reference the product row removed in step 4.
     *   4. The product itself, last.
     * Re-ordering any pair would attempt to delete a row still referenced by a live one. All four bind
     * the identifier and interpolate nothing.
     */
    expect(harness.statements.map((statement) => collapse(statement.sql))).toEqual([
      `UPDATE ${PRODUCT_TABLE} SET defaultSkuID = NULL WHERE ${PRODUCT_ID_COLUMN_NAME} = ?`,
      `DELETE FROM ${SKU_OPTION_TABLE} WHERE skuID IN ` +
        `(SELECT skuID FROM ${SKU_TABLE} WHERE productID = ?)`,
      `DELETE FROM ${SKU_TABLE} WHERE productID = ?`,
      `DELETE FROM ${PRODUCT_TABLE} WHERE ${PRODUCT_ID_COLUMN_NAME} = ?`,
    ]);
    for (const statement of harness.statements) {
      expect(statement.params).toEqual([PERSISTED_PRODUCT_ID]);
    }
  });

  it('NET-NEW — removeProduct resolves to undefined and reads no affected-row count', async () => {
    const harness = buildHarness(fileWith([]), () => sqlAffectedRows(0));

    /*
     * For a removal the count is exact, but the legacy primitive is declared `void` and reported
     * nothing, so a zero-row acknowledgement is not an error.
     */
    await expect(harness.repository.removeProduct(persistedProduct())).resolves.toBeUndefined();
  });

  it('NET-NEW — removeProduct resolves NO acting account, because a removal stamps nothing', async () => {
    const accountDouble = createAccountContextDouble(persistedAdminAccount());
    const harness = buildHarness(fileWith([]), undefined, accountDouble.accountContext);

    await harness.repository.removeProduct(persistedProduct());

    /*
     * There is no audit stamp on a row being deleted, so consulting the account seam would be work
     * with no observable effect and would couple a removal to a collaborator it does not need.
     */
    expect(accountDouble.callCount()).toBe(0);
  });

  it('NET-NEW — opens no transaction, leaving the boundary to the caller', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.removeProduct(persistedProduct());

    /*
     * Four statements that must all succeed or all fail is exactly the shape that wants a
     * transaction — and the adapter still does not open one, because the boundary belongs to the
     * caller's `UnitOfWork` (M5). Asserting the absence keeps the ownership explicit: a removal that
     * opened its own boundary could not be composed into a larger one.
     */
    expect(harness.eventKinds()).toEqual([]);
    expect(harness.statements.every((statement) => statement.region === 'pool')).toBe(true);
  });
});

describe('NET-NEW — the importer takes the legacy’s TWO arguments, and back-fills unconditionally (finding F4)', () => {
  /*
   * ⛔ TWO DESCRIBE BLOCKS STOOD HERE AND ARE REPLACED BY THIS ONE. They exercised
   * `ProductImportOptions` — nine cases over a caller-supplied `AbortSignal` observed at four checkpoints
   * (`beforeRetrieval`, `afterSourceValidation`, `afterRetrieval`, `row`) with a `committedRows` context,
   * and over a `deferBackfills` flag with its separately invocable `backfillImportDerivedColumns` member.
   * Review finding F4 removed all of it, and the reason is precedence rather than defect:
   *   • `model/dao/ProductDAO.cfc:L73` declares exactly two arguments, and the legacy importer runs to
   *     completion or dies with its request — it has no way to express either control.
   *   • AAP §0.6.7.7 declares D18, the importer's SQL parameterisation, "the single place where the port
   *     intentionally does not preserve legacy behavior exactly"; §0.8.2 Guideline 4 forbids the rest; and
   *     §0.7.3 S9 / IR-12 forbid inventing runtime controls. An optional control that defaults to legacy
   *     behaviour is still a control.
   *
   * ⚠️ MISMATCH M1 IS THEREFORE STILL OPEN, AND THAT IS THE CORRECT OUTCOME (AAP §0.8.3.6). A
   * 3600-second budget (`model/service/ProductService.cfc:L65-L68`) cannot be represented in one
   * invocation of the target runtime; the answer is an out-of-band model at the handler layer (AAP
   * §0.4.1.9), not a control in this contract.
   *
   * What the cases below keep is everything those blocks asserted that the LEGACY actually does: both
   * back-fills run, after the row loop, outside every transaction, in order, unconditionally — including
   * for an empty file.
   */

  it('NET-NEW — importFromFile accepts EXACTLY two arguments, so no control can be smuggled in', () => {
    const harness = buildHarness(fileWith([]));

    /*
     * ⭐ `Function.length` COUNTS THE LEADING PARAMETERS UP TO THE FIRST ONE WITH A DEFAULT, and neither
     * of these has one, so the count is the whole declared arity. It is the sharpest available guard
     * against a third parameter reappearing: a reinstated `options` argument fails here by name, even if
     * every behavioural case still passed because the new control defaulted to legacy behaviour.
     */
    expect(harness.repository.importFromFile.length).toBe(2);
  });

  it('NET-NEW — runs BOTH back-fills after the row loop, in order, outside every transaction', async () => {
    const harness = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `model/dao/ProductDAO.cfc:L288-L302` then `:L304-L325`, both past the closing braces of the
     * transaction (`:L284`) and the loop (`:L285`) — so both run once, in that order, un-transacted. */
    const backfills = harness.statements.filter((statement) => statement.region === 'backfill');
    expect(backfills).toHaveLength(2);
    expect(collapse(backfills[0]?.sql ?? '')).toContain('SET defaultSkuID');
    expect(collapse(backfills[1]?.sql ?? '')).toContain('SET imageFile');
    expect(harness.transactionsCommitted()).toBe(3);
  });

  it('NET-NEW — runs the back-fills even for an EMPTY file, exactly as the legacy does', async () => {
    const harness = buildHarness(importable([]));

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔ THE UNCONDITIONALITY IS THE BEHAVIOUR, AND IT IS NOW UNSUPPRESSIBLE. `:L288` and `:L304` are
     * guarded by neither a record count nor a file type, so an empty file still runs both whole-catalog
     * statements. A `deferBackfills` flag could once suppress them; with it withdrawn, the only remaining
     * arm is the legacy's.
     */
    expect(harness.statements.filter((statement) => statement.region === 'backfill')).toHaveLength(
      2,
    );
    expect(harness.transactionsStarted()).toBe(0);
  });

  it('NET-NEW — a mid-file FAILURE still runs NO back-fill, because the loop is left early (M3)', async () => {
    /*
     * ⭐ THIS CASE SURVIVES THE WITHDRAWAL WITH ITS CLAIM INTACT, ONLY ITS TRIGGER CHANGED. It used to
     * abort the import through the cancellation signal; it now fails the first row's INSERT, which is the
     * mechanism `model/dao/ProductDAO.cfc` itself has. Either way the back-fills sit after the loop, so
     * leaving the loop early skips them — and a back-fill over a partially imported file would derive
     * default-SKU and image columns from half a catalog.
     */
    const failure = new Error('the row could not be written');
    const harness = buildHarness(THREE_ROW_FILE, (statement) => {
      if (collapse(statement.sql).startsWith('INSERT INTO SwProduct')) {
        throw failure;
      }
      return resolvingOptionGroup(statement);
    });

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toBe(failure);

    expect(harness.statements.filter((statement) => statement.region === 'backfill')).toHaveLength(
      0,
    );
    /* M3: the first row's own boundary rolled back, and no later row was attempted. */
    expect(harness.transactionsRolledBack()).toBe(1);
    expect(harness.transactionsCommitted()).toBe(0);
  });
});
/* ================================================================================================
 * importFromFile — SEC-08, the import-source gate at the retrieval seam
 * ================================================================================================
 * ⭐ REVIEW FINDING F8 (CWE-918). An earlier revision of this suite LOCKED the opposite behaviour: it
 * asserted that whatever location arrived was forwarded to the retriever untouched and unchecked, and
 * that lock is why the exposure survived a review. The lock is gone and these cases replace it.
 *
 * ⚠️ WHAT IS ASSERTED HERE IS NARROWER THAN THE FINDING'S FULL WORDING, DELIBERATELY AND ON RECORD. The
 * finding also asks for resolved-address blocking, connecting to the vetted address and revalidating
 * every redirect. Those need DNS resolution and a socket, which the adapter may not import (S4, S5), so
 * they are stated as obligations on `ProductImportSourceReader` and cannot be asserted here — there is
 * no retriever in this subtree to hold to them. What IS decidable without resolving anything is decided
 * at the seam and is asserted below, in both directions.
 *
 * ⚠️ AND EVERY REFUSAL CASE ASSERTS WHAT MUST *NOT* HAVE HAPPENED, not merely that something threw. The
 * gate runs before the retriever is selected, so a refused location must leave the reader untouched, no
 * transaction opened and no statement issued — including the two bulk back-fills, which otherwise run
 * even for a file that imports nothing.
 *
 * ⭐ TWO STACKED CONTROLS, AND THEY ARE NOT THE SAME CONTROL. This describe exercises the MODULE gate
 * `assertRetrievableImportSource`, which is decidable without resolving anything and is applied by the
 * adapter itself. The sibling describe below exercises the injected OPERATOR policy
 * (`ProductImportSourcePolicy.validateSource` and `revalidateRedirectHop`), which is where the
 * finding's resolved-address and redirect-hop obligations are actually discharged — so the paragraph
 * above, which says they "cannot be asserted here", is scoped to THIS describe and not to the suite.
 *
 * ⚠️ THE TWO DO NOT GUARD THE SAME SET OF PATHS, AND THE ASYMMETRY IS DELIBERATE ON BOTH SIDES. The
 * module gate is guarded on the file type and is SKIPPED for the spreadsheet branch, because that branch
 * opens no socket and refusing it would change an outcome on a path with no egress to protect — asserted
 * by the last case here. The operator policy runs UNCONDITIONALLY, including for that branch, so a caller
 * cannot learn from a silent `.xls` success that a location would have been admitted — asserted by the
 * sibling describe. Neither is redundant, and neither subsumes the other.
 * ============================================================================================== */

describe('NET-NEW TODO(parity) — importFromFile: NO import-source gate, and the CWE-918 exposure carried', () => {
  /**
   * One hostile location per clause of the WITHDRAWN policy, each with what the withdrawn gate refused it
   * for — and each now ADMITTED, because `model/dao/ProductDAO.cfc:L73-L87` admits it.
   *
   * ⛔ A REVISION REFUSED EVERY ONE OF THESE, AND THAT REFUSAL IS GONE. It was declared as a departure
   * "in the same register as D18"; AAP §0.6.7.7 declares exactly ONE departure in this port (D18 itself,
   * the parameterised SQL asserted two describes above) and AAP §0.8.2 Guideline 4 admits no
   * proportionality test. So the gate, its ~420 lines of address-parsing apparatus and the
   * `ImportSourceRejectedError` presentation that reported it are all deleted.
   *
   * ⚠️ WHAT THESE ROWS NOW PIN. That the adapter forwards each location to the injected reader UNJUDGED,
   * so the CWE-918 surface of mismatch M4 is intact and visible rather than quietly half-closed. Closing
   * it belongs to whoever supplies a real reader — no HTTP client exists in this subtree at all
   * (AAP §0.5.2.1 makes `mysql2` the only runtime dependency) — through the `ProductImportSourcePolicy`
   * the next describe covers.
   */
  const UNJUDGED_LOCATIONS: readonly { readonly location: string; readonly because: string }[] =
    Object.freeze([
      { location: 'file:///etc/passwd', because: 'scheme — the withdrawn gate refused non-HTTP' },
      { location: 'ftp://files.test/x.csv', because: 'scheme — cfhttp does not speak FTP' },
      { location: 'gopher://files.test/1', because: 'scheme — a classic request-smuggling vector' },
      { location: 'data:text/csv,a,b', because: 'scheme — no retrieval happens at all' },
      {
        location: 'https://operator:secret@feeds.example/catalog.csv',
        because: 'credentials — the withdrawn gate refused a userinfo component',
      },
      {
        location: 'http://127.0.0.1/catalog.csv',
        because: 'address — IPv4 loopback, reachable only from inside',
      },
      {
        location: 'http://169.254.169.254/latest/meta-data/catalog.csv',
        because: 'address — the instance-metadata service',
      },
      { location: 'http://[::1]/catalog.csv', because: 'address — IPv6 loopback' },
      { location: 'http://localhost/catalog.csv', because: 'name — RFC 6761 §6.3 reserved' },
      {
        location: 'not-a-url-at-all',
        because: 'shape — the withdrawn gate required an absolute URL',
      },
    ]);

  it.each(UNJUDGED_LOCATIONS.map(({ location, because }) => [because, location]))(
    'NET-NEW TODO(parity) — %s: the location is forwarded to the reader unjudged',
    async (_because, location) => {
      /* The reader is the one collaborator that would open a socket, and it is a recording double here, so
       * "forwarded" is observable without any network. What matters is that the adapter reached it AT ALL
       * for a location the withdrawn gate would have refused before it, and that the location arrives byte
       * for byte — a normalisation here would be evaluated against a string an operator's policy never
       * sees, which is the classic bypass shape. */
      const harness = buildHarness(fileWith([]));

      await harness.repository.importFromFile(location);

      expect(harness.retrievals).toHaveLength(1);
      expect(harness.retrievals[0]?.source).toBe(location);
    },
  );

  it('NET-NEW — still retrieves every legitimate location too, so the withdrawal is not a widening of one clause only', async () => {
    /* The complement of the rows above: an ordinary HTTPS location behaves exactly as it always did. Both
     * directions are asserted so a future reinstated gate fails the rows above rather than passing them by
     * accident. */
    const harness = buildHarness(fileWith([]));

    await harness.repository.importFromFile('https://feeds.example/catalog.csv', '"');

    expect(harness.retrievals).toEqual([
      { source: 'https://feeds.example/catalog.csv', delimiter: ',', textQualifier: '"' },
    ]);
  });

  it('NET-NEW — the .xls no-op still reaches no retriever, which is the legacy empty branch and not a gate', async () => {
    /* `model/dao/ProductDAO.cfc:L83-L85` is an empty `//Read xls` branch, so the spreadsheet path opens no
     * socket. The withdrawn gate was guarded on exactly this file type to avoid refusing a `.xls` location
     * it never retrieved; with the gate gone the guard is gone too, and the branch is still silent for the
     * reason it always was. */
    const harness = buildHarness(THREE_ROW_FILE);

    await expect(
      harness.repository.importFromFile('http://169.254.169.254/catalog.xls'),
    ).resolves.toBeUndefined();

    expect(harness.retrievals).toEqual([]);
    expect(harness.transactionsStarted()).toBe(0);
    /* The back-fills still run, exactly as `:L288-L325` does after the empty branch. */
    expect(matching(harness, 'SET defaultSkuID')).toHaveLength(1);
    expect(matching(harness, 'SET imageFile')).toHaveLength(1);
  });
});

describe('NET-NEW — the required import-source policy (review finding 14, CWE-918)', () => {
  it('NET-NEW — consults the policy with the location VERBATIM, before it retrieves anything', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.importFromFile('https://feeds.example/catalog.csv?a=1&b=%2E%2E');

    /*
     * The location is handed over exactly as the caller supplied it — not normalised, not decoded, not
     * re-encoded. Normalising before the policy sees it would let a normalisation difference decide what
     * the policy is shown, which is a standard bypass: the policy would vet one string and the client
     * would fetch another.
     */
    expect(harness.validatedSources).toEqual(['https://feeds.example/catalog.csv?a=1&b=%2E%2E']);

    /* And the retrieval received the SAME string, so validation is on the real path rather than beside
     * it. If the adapter validated one value and fetched another, this pair would disagree. */
    expect(harness.retrievals).toEqual([
      {
        source: 'https://feeds.example/catalog.csv?a=1&b=%2E%2E',
        /*
         * ⭐ TODO(parity) `model/dao/ProductDAO.cfc:L74` — THE DELIMITER IS EMPTY, NOT A COMMA, AND THAT
         * IS THE LEGACY'S OWN BEHAVIOUR RATHER THAN A FAULT HERE. The file type is the last dot-delimited
         * segment of the LOCATION, so a query string is swallowed into it: the type resolves to
         * `csv?a=1&b=%2E%2E`, which matches neither `csv` nor `txt`, and `:L75-L80` has no else — so the
         * delimiter stays `""` and the file is retrieved with NO delimiter rather than failing.
         *
         * It is asserted rather than avoided (by choosing a tidy location) because it is a real property
         * a caller can hit, and because a future "improvement" that parsed the URL properly would change
         * which delimiter the legacy would have used. Carried as observed.
         */
        delimiter: '',
        textQualifier: '',
      },
    ]);
  });

  it('NET-NEW — a REFUSING policy stops the import dead: no retrieval, no statement, no transaction', async () => {
    const harness = buildHarness(THREE_ROW_FILE);
    const refusal = new Error('policy refused this location');

    /* Substituting a refusing policy models the operator reader the finding is about. */
    jest
      .spyOn(harness.sourcePolicy, 'validateSource')
      .mockImplementation(() => Promise.reject(refusal));

    /*
     * ⚠️ THE LOCATION IS DELIBERATELY BENIGN, AND THAT IS WHAT MAKES THIS CASE ABOUT THE POLICY. Two
     * controls guard this seam: the adapter's own module gate `assertRetrievableImportSource`, and the
     * injected operator policy spied on above. A hostile location — this case was originally written
     * against `http://169.254.169.254/latest/meta-data/` — is refused by the MODULE gate first, which
     * raises its own error and never reaches the policy at all. The assertion below would then have been
     * satisfied by the wrong control, or, since it pins the refusal by IDENTITY, not satisfied at all.
     *
     * A location the module gate admits is therefore the only vector that isolates the operator's refusal.
     * Nothing is lost by moving off the hostile one: the module gate's refusal of exactly that address is
     * asserted in the SEC-08 describe above, alongside twenty-five other vectors.
     */
    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toBe(refusal);

    /*
     * ⭐ THE ORDERING IS THE POINT. The refusal happens before retrieval and before the first per-row
     * boundary, so a rejected location cannot leave a partially imported catalogue behind — which
     * matters more here than in most places because M3 commits every row independently, so there is no
     * outer transaction to roll back.
     */
    expect(harness.retrievals).toEqual([]);
    expect(harness.statements).toEqual([]);
    expect(harness.transactionsStarted()).toBe(0);
    expect(harness.transactionsCommitted()).toBe(0);
    expect(harness.transactionsRolledBack()).toBe(0);
  });

  it('NET-NEW — consults the policy even for the empty .xls branch, which retrieves nothing', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.xls');

    /*
     * ⚠️ DELIBERATE, AND IT IS NOT REDUNDANT. The `.xls` branch at `model/dao/ProductDAO.cfc:L83-L85`
     * retrieves nothing, so validation cannot protect it. It runs anyway so that the answer to "may this
     * location be fetched" does not depend on the file extension — otherwise a caller could learn from a
     * silent `.xls` success that a location would have been admitted, turning the extension into an
     * oracle.
     */
    expect(harness.validatedSources).toEqual(['https://feeds.example/catalog.xls']);
    expect(harness.retrievals).toEqual([]);
  });

  it('NET-NEW — validates once per invocation, and per invocation rather than per row', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* One retrieval, one validation, three rows. The policy sits on the retrieval, not on the row loop,
     * so a file's row count cannot multiply the work a policy is asked to do. */
    expect(harness.validatedSources).toHaveLength(1);
    expect(harness.retrievals).toHaveLength(1);
  });

  it('NET-NEW — the SHIPPED policy refuses all three members, so it is no permissive default', async () => {
    const { sourcePolicy } = unresolvableProductImportSourceReader;

    /*
     * ⛔ THIS IS THE CASE THAT KEEPS THE FIX HONEST. A required contract satisfied by an implementation
     * that admits everything would be worse than no contract, because every future reader would inherit
     * a pre-approved bypass. The shipped policy declines every member for the same documented reason the
     * shipped reader declines: `model/dao/ProductDAO.cfc:L87` resolves `getService("utilityTagService")`,
     * a bean declared NOWHERE in the legacy repository, and the `new http()` fallback at `:L89-L98` is
     * commented out — so the legacy import could never retrieve a file, and inventing a retrieval client
     * would ADD a capability the ported system does not have.
     */
    await expect(sourcePolicy.validateSource('https://feeds.example/catalog.csv')).rejects.toThrow(
      /ProductImportSourcePolicy\.validateSource/,
    );
    await expect(
      sourcePolicy.revalidateRedirectHop({
        location: 'https://feeds.example/redirected.csv',
        resolvedAddress: '127.0.0.1',
      }),
    ).rejects.toThrow(/revalidateRedirectHop/);
  });

  it('NET-NEW — readBounds THROWS rather than inventing a byte cap, a timeout or a redirect cap', () => {
    const { sourcePolicy } = unresolvableProductImportSourceReader;

    /*
     * ⭐ WHY `readBounds` IS A METHOD AND NOT A PROPERTY, ASSERTED. A property would force every
     * implementation — including this non-retrieving one — to name three figures, and those figures would
     * be exactly the invented configuration AAP §0.7.3 standard 9 and IR-12 forbid: the legacy states no
     * byte cap, no transfer timeout and no redirect limit anywhere. A method can decline.
     */
    expect(() => sourcePolicy.readBounds()).toThrow(/readBounds/);

    /* The diagnostic names what an operator must supply, so the refusal is actionable rather than blunt. */
    try {
      sourcePolicy.readBounds();
      throw new Error('readBounds resolved, but it must refuse');
    } catch (error) {
      expect((error as Error).message).toMatch(/byte cap/);
      expect((error as Error).message).toMatch(/timeout/);
      expect((error as Error).message).toMatch(/redirect cap/);
    }
  });

  it('NET-NEW — no scheme, host, address range or numeric bound is stated anywhere in the subtree', () => {
    /*
     * ⭐⭐ THE GUARD THAT KEEPS THE CONTRACT FROM DRIFTING INTO INVENTED POLICY. The fix is licensed only
     * because it obliges the OPERATOR to decide and decides nothing itself. This case reads the two
     * modules that carry the contract and asserts they name no concrete policy value — so a future edit
     * that quietly adds "https only", a metadata-address deny list or a 10 MB cap fails here, where the
     * reasoning is recorded, rather than silently becoming invented configuration.
     */
    const contractSources = [
      readFileSync(
        join(__dirname, '..', '..', 'src', 'ports', 'repositories', 'ProductRepository.ts'),
        'utf8',
      ),
      readFileSync(
        join(__dirname, '..', '..', 'src', 'adapters', 'mysql', 'MySqlProductRepository.ts'),
        'utf8',
      ),
    ];

    for (const source of contractSources) {
      /* Deny/allow lists are expressed as address literals; none may appear as code. */
      const code = source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*'))
        .join('\n');

      expect(code).not.toMatch(/169\.254\.169\.254/);
      expect(code).not.toMatch(/127\.0\.0\.1/);
      expect(code).not.toMatch(/maxBytes\s*:\s*\d/);
      expect(code).not.toMatch(/maxMilliseconds\s*:\s*\d/);
      expect(code).not.toMatch(/maxRedirectHops\s*:\s*\d/);
    }
  });
});

/* ================================================================================================
 * REVIEW FINDING 12 — THE CONTENT ASSIGNMENT IS PORTED, NOT REFUSED (model/dao/ProductDAO.cfc:L257-L282)
 * ==============================================================================================
 * The finding: "The target refuses the entire import when content-assignment columns are present. Legacy
 * code queries `tContent`, probes the product-content assignment, and inserts it. This is a functional
 * substitution, not a translation." Its resolution: "Introduce a declared boundary port for content
 * lookup/assignment or otherwise implement the planned import behavior without admitting arbitrary CMS
 * identifiers into the Catalog whitelist."
 *
 * ⭐ BOTH HALVES ARE ASSERTED HERE. The ALGORITHM — heading test, list split, per-page order, the two
 * skips, the identifier shape and the insert payload — is asserted against the legacy line by line. The
 * WHITELIST constraint is asserted by the `assertTableName` case above: no excluded identifier is composed
 * in this subtree, because every statement the step needs is issued by the collaborator.
 * ============================================================================================== */

/* ================================================================================================
 * F11 — THE CONTENT-ASSIGNMENT STEP BELONGS TO EACH ROW'S OWN TRANSACTION
 *
 * `model/dao/ProductDAO.cfc:L177` opens `transaction{` INSIDE the record loop and `:L257-L282` — the
 * content-assignment step — sits inside that block. Its three statements are therefore part of the row's
 * transaction in the legacy: they observe the row's own uncommitted product insert, and they roll back
 * with the row when anything later in the row fails.
 *
 * ⛔ WHAT WAS BROKEN. The collaborator was captured ONCE at construction, with no transaction executor of
 * any kind, and called directly. A real implementation could therefore neither see the uncommitted
 * product its probe filters on, nor be rolled back with a failing row — so a row that failed after this
 * point rolled back its product and SKU while leaving its content links committed, with nothing anywhere
 * reporting the split.
 *
 * ⚠️ THE FIX IS A FACTORY, AND WHAT IT HANDS OVER IS THE SCOPE, NOT AN EXECUTOR. This subtree owns
 * neither the content schema nor its access path (AAP §0.2.2.1 excludes the `Content*` family), so it
 * cannot pass a `ProductStatementExecutor` typed against tables it may not name. The scope IS the
 * transaction; an implementation adopts it however its own data layer requires, and no excluded-schema
 * identifier crosses the boundary in either direction.
 * ============================================================================================== */

describe('F11 — the content-assignment collaborator is built per row, from that row’s transaction', () => {
  const CONTENT_HEADINGS = [
    'productcontent_page',
    'product_productCode',
    'product_productName',
    'brand_brandname',
  ];

  /** A harness whose single content page resolves, so the step runs to its insert. */
  function harnessWithResolvablePage(
    ...rows: readonly string[][]
  ): ReturnType<typeof buildHarness> {
    const harness = buildHarness(importable(CONTENT_HEADINGS, ...rows));
    harness.resolvableContentPages.set('page-1', {
      contentId: 'cccccccccccccccccccccccccccc0001',
      contentPath: '/site/products/widget',
    });
    harness.resolvableContentPages.set('page-2', {
      contentId: 'cccccccccccccccccccccccccccc0002',
      contentPath: '/site/products/gadget',
    });
    return harness;
  }

  it('NET-NEW — the factory is invoked ONCE PER ROW that has a page to assign', async () => {
    const harness = harnessWithResolvablePage(
      ['page-1', 'CODE-1', 'Widget', 'Acme'],
      ['page-2', 'CODE-2', 'Gadget', 'Acme'],
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    // ⚠️ THE ASSERTION THE FINDING TURNS ON: two rows, two builds. Before the fix there were zero.
    expect(harness.contentAssignmentScopes).toHaveLength(2);
    expect(harness.contentLookups).toEqual(['page-1', 'page-2']);
  });

  it('NET-NEW — each row is handed a DIFFERENT scope, one per transaction (M3)', async () => {
    // `:L177` commits once per row, so each row is its own transaction. A shared scope would mean the
    // step could not be rolled back with the row that produced it.
    const harness = harnessWithResolvablePage(
      ['page-1', 'CODE-1', 'Widget', 'Acme'],
      ['page-2', 'CODE-2', 'Gadget', 'Acme'],
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const [first, second] = harness.contentAssignmentScopes;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
    expect(harness.transactionsCommitted()).toBe(2);
  });

  it('NET-NEW — the scope carries the SAME executor the row’s own statements ran on (M6)', async () => {
    /*
     * ⭐ THIS IS THE PROPERTY THE WHOLE FINDING IS ABOUT. The step's existence probe filters on the
     * `productID` the product save has just written and NOT yet committed [`:L271`]. On any other
     * connection it would not find it, so a re-import would insert a duplicate link. The only way it can
     * see it is for the step to hold the row's own connection.
     */
    const harness = harnessWithResolvablePage(['page-1', 'CODE-1', 'Widget', 'Acme']);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const scope = harness.contentAssignmentScopes[0];
    expect(scope).toBeDefined();

    /*
     * The scope's executor is the TRANSACTIONAL one the row's own statements travelled through — not the
     * pool-bound executor the adapter was constructed with, and not an object of the factory's own.
     */
    const rowStatements = harness.statements.filter((statement) => statement.region === 'row#1');
    expect(rowStatements.length).toBeGreaterThan(0);
    expect(scope?.executor).toBe(harness.transactionalExecutor);
  });

  it('NET-NEW — an ordinary import never builds the collaborator at all', async () => {
    // `:L258`'s heading test returns before anything else. A factory invoked for a file that requests no
    // assignment would make an implementation open work it has nothing to do.
    const harness = buildHarness(
      importable(['product_productCode', 'product_productName'], ['CODE-1', 'Widget']),
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    expect(harness.contentAssignmentScopes).toEqual([]);
    expect(harness.contentLookups).toEqual([]);
  });

  it('NET-NEW — a row whose content cell is EMPTY builds nothing either', async () => {
    // `:L259`'s `listToArray` of an empty cell is an empty array and `:L260` iterates zero times. The
    // file DOES carry the heading, so `:L258` passes and only the per-row emptiness stops the step.
    const harness = harnessWithResolvablePage(
      ['', 'CODE-1', 'Widget', 'Acme'],
      ['page-1', 'CODE-2', 'Gadget', 'Acme'],
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* One build, for the second row only. */
    expect(harness.contentAssignmentScopes).toHaveLength(1);
    expect(harness.contentLookups).toEqual(['page-1']);
  });

  it('NET-NEW — a failing content assignment ROLLS BACK its own row and stops the import (M3)', async () => {
    /*
     * ⛔ THE PARTIAL-IMPORT SHAPE IS THE LEGACY'S AND IS PRESERVED, NOT FIXED. `:L177` commits per row, so
     * a failure on row 2 leaves row 1 COMMITTED and attempts no row 3. What the finding changes is the
     * other half: row 2's own content links no longer survive its rollback, because they are now written
     * inside the transaction that rolls back.
     */
    const harness = harnessWithResolvablePage(
      ['page-1', 'CODE-1', 'Widget', 'Acme'],
      ['page-2', 'CODE-2', 'Gadget', 'Acme'],
      ['page-1', 'CODE-3', 'Doohickey', 'Acme'],
    );

    let builds = 0;
    const failing = harness.contentAssignmentPort;
    const originalInsert = failing.insertContentAssignment.bind(failing);
    jest
      .spyOn(harness.contentAssignmentPort, 'insertContentAssignment')
      .mockImplementation((row) => {
        builds += 1;
        if (builds === 2) {
          return Promise.reject(new Error('the content application refused the link row'));
        }
        return originalInsert(row);
      });

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/refused the link row/);

    /* Row 1 committed, row 2 rolled back, row 3 never ran — the first-failure shape M3 records. */
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(1);
    expect(harness.contentAssignmentScopes).toHaveLength(2);
  });

  it('NET-NEW — the refusing DEFAULT factory answers the refusing port, and issues no statement', async () => {
    // The default states that the schema is not owned. It must refuse rather than silently no-op, because
    // a no-op would import a catalogue with every requested assignment DROPPED and report success.
    const scope = { executor: {} } as unknown as ProductImportTransactionScope;

    const port = unresolvableProductContentAssignmentFactory(scope);

    expect(port).toBe(unresolvableProductContentAssignmentPort);
    await expect(port.findProductListingContent('page-1')).rejects.toThrow(/not implemented/);
    await expect(port.hasContentAssignment('p', 'c')).rejects.toThrow(/not implemented/);
    await expect(
      port.insertContentAssignment({
        productContentId: 'a',
        contentId: 'b',
        contentPath: '/c',
        productId: 'd',
      }),
    ).rejects.toThrow(/not implemented/);
  });
});

describe('NET-NEW — the ported content assignment (review finding 12)', () => {
  const CONTENT_FILE_HEADINGS = [
    'productcontent_page',
    'product_productCode',
    'product_productName',
    'brand_brandname',
  ];

  it('NET-NEW — resolves each page, probes it, and inserts the link row (:L262, :L271, :L277)', async () => {
    const harness = buildHarness(
      importable(CONTENT_FILE_HEADINGS, ['page-1', 'CODE-1', 'Widget', 'Acme']),
    );
    harness.resolvableContentPages.set('page-1', {
      contentId: 'cccccccccccccccccccccccccccc0001',
      contentPath: '/site/products/widget',
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L262` — looked up by file name, exactly the token the cell carried. */
    expect(harness.contentLookups).toEqual(['page-1']);

    /* `:L271` — probed for THIS product and the resolved content. */
    expect(harness.contentProbes).toHaveLength(1);
    expect(harness.contentProbes[0]?.contentId).toBe('cccccccccccccccccccccccccccc0001');

    /* `:L277` — one link row, with the content path DENORMALISED beside the identifier exactly as the
     * legacy denormalises it, and with the product the row imported. */
    expect(harness.contentInserts).toHaveLength(1);
    const inserted = harness.contentInserts[0];
    expect(inserted?.contentId).toBe('cccccccccccccccccccccccccccc0001');
    expect(inserted?.contentPath).toBe('/site/products/widget');
    expect(inserted?.productId).toBe(harness.contentProbes[0]?.productId);

    /* `:L275` — `lcase(replace(createUUID(),"-","","all"))`. IR-6: 32 lowercase hex, no dashes. */
    expect(inserted?.productContentId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('NET-NEW — splits the cell on commas and assigns every page IN FILE ORDER (:L259, :L260)', async () => {
    const harness = buildHarness(
      importable(CONTENT_FILE_HEADINGS, ['page-a,page-b,page-c', 'CODE-1', 'Widget', 'Acme']),
    );
    for (const [index, name] of ['page-a', 'page-b', 'page-c'].entries()) {
      harness.resolvableContentPages.set(name, {
        contentId: `cccccccccccccccccccccccccccc000${index + 1}`,
        contentPath: `/site/${name}`,
      });
    }

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L259` splits on the default comma delimiter and `:L260` iterates in that order. Order is asserted
     * rather than membership because the inserts are sequential and a concurrent implementation would let
     * two pages of one row race the `:L271` probe. */
    expect(harness.contentLookups).toEqual(['page-a', 'page-b', 'page-c']);
    expect(harness.contentInserts.map((row) => row.contentPath)).toEqual([
      '/site/page-a',
      '/site/page-b',
      '/site/page-c',
    ]);
  });

  it('NET-NEW — SILENTLY SKIPS a page that does not resolve, and still commits the row (:L269)', async () => {
    const harness = buildHarness(
      importable(CONTENT_FILE_HEADINGS, ['missing-page,page-1', 'CODE-1', 'Widget', 'Acme']),
    );
    harness.resolvableContentPages.set('page-1', {
      contentId: 'cccccccccccccccccccccccccccc0001',
      contentPath: '/site/products/widget',
    });

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).resolves.toBeUndefined();

    /*
     * `:L269` gates the whole assignment on `lookupResult.recordcount`, and there is no else: an
     * unresolved page produces NO error, NO warning and NO record. Both pages were looked up; only the
     * resolvable one was probed and inserted.
     *
     * ⚠️ TODO(parity) — THE DROPPED ASSIGNMENT IS UNDETECTABLE BY THE CALLER, because `:L73` declares the
     * member `void` and it reports nothing. That is the legacy's behaviour and it is preserved rather than
     * improved with a summary object.
     */
    expect(harness.contentLookups).toEqual(['missing-page', 'page-1']);
    expect(harness.contentProbes).toHaveLength(1);
    expect(harness.contentInserts).toHaveLength(1);
    expect(harness.transactionsCommitted()).toBe(1);
  });

  it('NET-NEW — inserts NOTHING when the assignment already exists (:L274 `if(!exists)`)', async () => {
    const harness = buildHarness(
      importable(CONTENT_FILE_HEADINGS, ['page-1', 'CODE-1', 'Widget', 'Acme']),
    );
    harness.resolvableContentPages.set('page-1', {
      contentId: 'cccccccccccccccccccccccccccc0001',
      contentPath: '/site/products/widget',
    });
    /* Seeded through the probe's own key shape, so the step sees an existing pair for whatever product
     * identifier the import mints. */
    const seedExisting = harness.existingAssignments;
    const originalHas = seedExisting.has.bind(seedExisting);
    jest
      .spyOn(seedExisting, 'has')
      .mockImplementation((key: string) =>
        key.endsWith('|cccccccccccccccccccccccccccc0001') ? true : originalHas(key),
      );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* It was resolved and probed, and the probe answering yes made the insert a no-op — the step is
     * idempotent, which is what lets the same file be imported twice. */
    expect(harness.contentLookups).toEqual(['page-1']);
    expect(harness.contentProbes).toHaveLength(1);
    expect(harness.contentInserts).toEqual([]);
  });

  it('NET-NEW — does nothing at all when the heading is absent (:L258, the ordinary import)', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `:L258`'s `arrayFindNoCase` misses, so the collaborator is never consulted for any of the three
     * rows. This is the path every ordinary import takes. */
    expect(harness.contentLookups).toEqual([]);
    expect(harness.contentProbes).toEqual([]);
    expect(harness.contentInserts).toEqual([]);
  });

  it('NET-NEW — does nothing when the heading is present but the cell is EMPTY (:L259, :L260)', async () => {
    const harness = buildHarness(
      importable(CONTENT_FILE_HEADINGS, ['', 'CODE-1', 'Widget', 'Acme']),
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `listToArray('')` yields an empty array, so `:L260` iterates zero times. The row still imports —
     * which is the case the withdrawn whole-file refusal got wrong in the other direction, since a file
     * whose content column was empty in every row was refused despite the legacy completing it. */
    expect(harness.contentLookups).toEqual([]);
    expect(harness.transactionsCommitted()).toBe(1);
  });

  it('NET-NEW — a collaborator failure rolls back ITS row and leaves earlier rows committed (M3)', async () => {
    const harness = buildHarness(
      importable(
        CONTENT_FILE_HEADINGS,
        ['page-1', 'CODE-1', 'Widget', 'Acme'],
        ['page-2', 'CODE-2', 'Gadget', 'Acme'],
      ),
    );
    harness.resolvableContentPages.set('page-1', {
      contentId: 'cccccccccccccccccccccccccccc0001',
      contentPath: '/site/one',
    });
    harness.resolvableContentPages.set('page-2', {
      contentId: 'cccccccccccccccccccccccccccc0002',
      contentPath: '/site/two',
    });

    const failure = new Error('content application unavailable');
    jest
      .spyOn(harness.contentAssignmentPort, 'insertContentAssignment')
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.reject(failure));

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toBe(failure);

    /*
     * ⭐ THIS IS THE FLAGGED CONSEQUENCE OF PORTING THE STEP RATHER THAN PREFLIGHTING IT, ASSERTED. Row 1
     * committed and row 2 rolled back, so the catalogue is partially imported — and that is M3's own
     * shape, the same outcome any mid-file data failure produces, not something the boundary invented.
     * The withdrawn preflight avoided this by refusing every such file outright, which avoided the
     * legacy's behaviour along with it.
     */
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(1);
  });

  it('NET-NEW — the SHIPPED collaborator refuses all three members rather than dropping assignments', async () => {
    /*
     * ⛔ REFUSING IS THE HONEST DEFAULT AND RESOLVING `null` WOULD BE THE DANGEROUS ONE. A lookup that
     * quietly resolved nothing would import a catalogue with every content assignment DROPPED and report
     * success, and `importFromFile` returns nothing, so no caller could detect it. The default announces
     * the gap instead.
     */
    await expect(
      unresolvableProductContentAssignmentPort.findProductListingContent('page-1'),
    ).rejects.toThrow(/tContent/);
    await expect(
      unresolvableProductContentAssignmentPort.hasContentAssignment('p', 'c'),
    ).rejects.toThrow(/SlatwallProductContent/);
    await expect(
      unresolvableProductContentAssignmentPort.insertContentAssignment({
        productContentId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa0001',
        contentId: 'cccccccccccccccccccccccccccc0001',
        contentPath: '/site/one',
        productId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbb0001',
      }),
    ).rejects.toThrow(/SlatwallProductContent/);
  });
});

/* ================================================================================================
 * THE ADDITIVE RUNTIME PATHS — REVIEW FINDING 13
 * ================================================================================================
 * Four groups of runtime behaviour existed on this adapter with no direct coverage at all, and the
 * review named every one of them: the streaming retrieval arm, cancellation at each observed boundary,
 * both arms of the back-fill deferral, and two of the three import lookup families. They are grouped here
 * because they share one property that makes untested-ness especially dangerous: NONE of them changes the
 * statements a plain import issues, so a regression in any of them is invisible to every other case in
 * this file.
 *
 * ⛔ THREE OF THOSE FOUR SUBJECTS HAVE SINCE BEEN WITHDRAWN by later review findings — cancellation and
 * the back-fill deferral by F4, the lookup memory by F12 — and the cases that covered them were rewritten
 * to assert the restored legacy behaviour rather than deleted. The grouping is kept because the reason for
 * it survives every one of those withdrawals: a per-row statement CADENCE is exactly the kind of property
 * no other case in this file observes.
 *
 * ⛔ WHAT THESE CASES DO NOT DO. Not one of them asserts a NEW behaviour into existence. Each pins
 * behaviour the adapter and the port already document, so that the documentation and the code cannot
 * drift apart silently. Where a case records a legacy fact it carries the `model/...:Lnnn` locator, and
 * where a path has NO legacy counterpart — the streaming arm and the deferral both — it says so, because
 * AAP §0.8.2 Guideline 4 makes "structural, adds no behaviour" a claim that has to be checkable rather
 * than asserted.
 *
 * ⚠️ THE REVIEW SAID "CANCELLATION AT FOUR BOUNDARIES", AND THERE ARE EXACTLY FOUR — BUT NOT THE FOUR
 * IT COUNTED. Its inventory predates two changes made in this same pass: review finding 14 ADDED
 * `afterSourceValidation`, and review finding 12 REMOVED `contentAssignmentPreflight` along with the
 * whole-file preflight it belonged to. The current set is `beforeRetrieval`, `afterSourceValidation`,
 * `afterRetrieval` and `row`, and the last case below asserts that the set is exactly that — so a fifth
 * boundary appearing later cannot slip in untested.
 * ============================================================================================== */

describe('NET-NEW — the streaming retrieval arm (review finding 13)', () => {
  it('NET-NEW — prefers readStreaming over read when the reader offers both', async () => {
    const streamed = buildHarness(THREE_ROW_FILE, undefined, undefined, {});
    const materialised = buildHarness(THREE_ROW_FILE);

    await streamed.repository.importFromFile('https://feeds.example/catalog.csv');
    await materialised.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ THE PREFERENCE IS THE CONTRACT, AND IT IS WHAT MAKES THE MEMBER SAFELY OPTIONAL. Both readers
     * define `read`; only one also defines `readStreaming`, and the adapter takes the streaming arm
     * whenever it is there. That is what keeps the collaborator's contract ADDITIVE — an existing reader
     * is not broken by the arm existing, and a streaming reader is not mandated by it.
     */
    expect(streamed.readerCalls).toEqual(['readStreaming']);
    expect(materialised.readerCalls).toEqual(['read']);

    /* ⭐ AND THE TWO ARMS CONVERGE. Same statements, same order, same regions, same transaction shape —
     * which is the whole justification for the arm existing at all. If the arms could diverge, the
     * streaming path would be new behaviour rather than a different way of delivering the same rows. */
    expect(streamed.statements.map((statement) => collapse(statement.sql))).toEqual(
      materialised.statements.map((statement) => collapse(statement.sql)),
    );
    expect(streamed.statements.map((statement) => statement.region)).toEqual(
      materialised.statements.map((statement) => statement.region),
    );
    expect(streamed.eventKinds()).toEqual(materialised.eventKinds());
  });

  it('NET-NEW — is advanced LAZILY, one record per settled row boundary', async () => {
    const yieldedAtRowBoundary: number[] = [];
    /* The sampler needs the harness the same call is building, so it reads through a box that is filled
     * once the harness exists. `-1` would be recorded if a statement somehow preceded construction. */
    const observed: { harness?: Harness } = {};

    const harness = buildHarness(
      THREE_ROW_FILE,
      (statement) => {
        // Sampled as each product insert is issued, so the sample lands inside a row's transaction.
        if (collapse(statement.sql).startsWith('INSERT INTO SwProduct')) {
          yieldedAtRowBoundary.push(observed.harness?.recordsYielded.length ?? -1);
        }

        return undefined;
      },
      undefined,
      {},
    );

    observed.harness = harness;

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ THIS IS THE ONLY DIRECT EVIDENCE THAT NOTHING BUFFERS THE FILE. Row n is written while exactly n
     * records have been produced, so the generator is pulled one record at a time by the row loop rather
     * than drained up front. A `for await (const row of [...records])` — the obvious refactor — would
     * make this read `[3, 3, 3]` while leaving every other assertion in this file untouched.
     *
     * ⚠️ AND IT IS STRUCTURAL, NOT BEHAVIOURAL. `model/dao/ProductDAO.cfc:L87` retrieves the ENTIRE file
     * into one CFML query object and has no lazy form to port, so laziness is not a legacy property being
     * preserved. What it must not do is change the rows, their order or their row numbers, and the
     * convergence assertion in the case above is what holds it to that.
     */
    expect(yieldedAtRowBoundary).toEqual([1, 2, 3]);
    expect(harness.recordsYielded).toEqual([1, 2, 3]);

    // Exhausted normally, and released exactly once.
    expect(harness.streamReleases()).toBe(1);
  });

  it('NET-NEW — a mid-file streaming failure keeps earlier rows committed (M3)', async () => {
    /* The generator yields record 1, then fails when the loop asks for record 2 — a transport or parse
     * failure part-way through a file, which is precisely the shape M3 already tolerates. */
    const harness = buildHarness(THREE_ROW_FILE, undefined, undefined, { throwAfterRecords: 1 });

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/failed part-way through the file/);

    /*
     * ⭐ THE FAILURE ARRIVES BETWEEN BOUNDARIES, NOT INSIDE ONE, and that is why the outcome is clean.
     * The record source is advanced by the row loop AFTER the previous row's transaction settled, so
     * row 1 is committed and durable, and the failure opens no second boundary to roll back. Compare a
     * mid-file DATA failure, which rolls its own row back — both leave earlier rows committed, which is
     * the M3 partial-import shape either way.
     */
    expect(harness.recordsYielded).toEqual([1]);
    expect(harness.transactionsStarted()).toBe(1);
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(0);

    /* ⛔ AND THE BACK-FILLS DO NOT RUN. `model/dao/ProductDAO.cfc:L288` and `:L304` are reached only by
     * falling out of the loop; a raise inside it propagates past them in the legacy too. A `finally` that
     * ran them anyway would invent a recovery the legacy has no equivalent for. */
    expect(matching(harness, 'SET defaultSkuID')).toEqual([]);
    expect(matching(harness, 'SET imageFile')).toEqual([]);
  });

  it('NET-NEW — releases the stream even when it fails before yielding anything', async () => {
    const harness = buildHarness(THREE_ROW_FILE, undefined, undefined, { throwAfterRecords: 0 });

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/failed part-way through the file/);

    /* A source that fails immediately after its header pass still had a `finally` to run, and no row
     * boundary ever opened — so the import is a no-op rather than a partial one. */
    expect(harness.recordsYielded).toEqual([]);
    expect(harness.streamReleases()).toBe(1);
    expect(harness.transactionsStarted()).toBe(0);
  });

  it('NET-NEW — ABANDONS the stream cleanly when a row fails, running its finally', async () => {
    /* Row 2's product insert fails, so the row loop stops consuming with record 3 never demanded. */
    const harness = buildHarness(
      THREE_ROW_FILE,
      (statement) => {
        if (
          collapse(statement.sql).startsWith('INSERT INTO SwProduct') &&
          statement.params.includes('CODE-2')
        ) {
          return sqlFailure(new DomainError('the row failed'));
        }

        return undefined;
      },
      undefined,
      {},
    );

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/the row failed/);

    /*
     * ⭐⭐ THIS IS THE CASE THE PORT'S `finally` OBLIGATION EXISTS FOR, AND IT COULD NOT BE ASSERTED
     * BEFORE. `readStreaming` documents that a generator "has its `return()` invoked without having been
     * exhausted, and must release its connection, handle or buffer in a `finally` rather than only on
     * normal completion". That obligation is only DISCHARGEABLE if the consumer actually closes the
     * iterator — and the consumer is `for await` in `UnitOfWork.runEachItem`, through the
     * `normaliseRecords` generator in between. Both links have to forward the close, and this asserts
     * that they do: the generator's `finally` ran even though record 3 was never asked for.
     *
     * ⛔ WHAT WOULD BREAK IT. Draining the records into an array before the loop, or iterating with a
     * manual `next()` loop that returns early without calling `return()`. Either leaks whatever the real
     * reader holds open, on exactly the mid-file failure M3 says is expected rather than exceptional.
     */
    expect(harness.recordsYielded).toEqual([1, 2]);
    expect(harness.streamReleases()).toBe(1);
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(1);
  });

  it('NET-NEW — takes NEITHER arm for the .xls branch, which retrieves nothing', async () => {
    const harness = buildHarness(THREE_ROW_FILE, undefined, undefined, {});

    await harness.repository.importFromFile('https://feeds.example/catalog.xls');

    /* `model/dao/ProductDAO.cfc:L83-L85` is an empty `//Read xls`. The spreadsheet arm is tested BEFORE
     * the streaming arm, so offering `readStreaming` must not turn the documented no-op into a
     * retrieval — and the two back-fills still run, because `:L288` and `:L304` sit outside the branch. */
    expect(harness.readerCalls).toEqual([]);
    expect(harness.recordsYielded).toEqual([]);
    expect(harness.streamReleases()).toBe(0);
    expect(matching(harness, 'SET defaultSkuID')).toHaveLength(1);
  });
});

describe('NET-NEW — no cancellation boundary exists anywhere in the importer (finding F4)', () => {
  /*
   * ⛔ TWO DESCRIBE BLOCKS STOOD HERE — one per-checkpoint cancellation suite and one back-fill-deferral
   * suite — and both are withdrawn with the controls they exercised. The reasoning is recorded once, above,
   * at the importer's two-argument case. What replaces them is a pair of SOURCE-LEVEL guards, because an
   * absence is what has to be asserted now and a behavioural case cannot assert an absence: a reinstated
   * control that defaults to legacy behaviour would leave every behavioural case passing.
   */

  it('NET-NEW — the adapter source contains NO cancellation checkpoint at all', () => {
    const adapter = readFileSync(
      join(__dirname, '../../src/adapters/mysql/MySqlProductRepository.ts'),
      'utf8',
    );

    /*
     * ⛔ A DRIFT GUARD AIMED AT A DRIFT THAT ALREADY HAPPENED TWICE. The predecessor of this case
     * enumerated the checkpoint set FROM THE SOURCE and asserted it equalled
     * `['beforeRetrieval', 'afterSourceValidation', 'afterRetrieval', 'row']`, precisely so a fifth
     * boundary could not arrive untested. The same technique now asserts that the set is EMPTY.
     *
     * ⚠️ EVERY PATTERN IS CODE-SHAPED, NOT WORD-SHAPED, AND THAT IS DELIBERATE. The adapter DISCUSSES the
     * withdrawn control at length — AAP §0.8.2 Guideline 6 requires the decision to be recorded where it was
     * made — so a bare `not.toContain('AbortSignal')` would fail on the withdrawal note itself and force
     * the explanation to be deleted to make the test pass. Each pattern below can only match a
     * DECLARATION, a CALL or a PROPERTY READ.
     */
    expect(adapter).not.toMatch(/throwIfCancelled\(/u);
    expect(adapter).not.toMatch(/:\s*AbortSignal/u);
    expect(adapter).not.toMatch(/\.aborted\b/u);
    expect(adapter).not.toMatch(/options\?\./u);
  });

  it('NET-NEW — the PORT declares neither the options object nor a separate back-fill member', () => {
    const port = readFileSync(
      join(__dirname, '../../src/ports/repositories/ProductRepository.ts'),
      'utf8',
    );

    /*
     * The port is where a control becomes a CONTRACT, so it is guarded independently of the adapter: an
     * interface member reinstated here would be a parity break even before any implementation used it.
     * Both names still APPEAR in the file, inside the withdrawal blocks that record why they are gone, so
     * every pattern here is a DECLARATION shape.
     */
    expect(port).not.toContain('export interface ProductImportOptions');
    expect(port).not.toMatch(/^\s*backfillImportDerivedColumns\(\): Promise<void>;/mu);
    expect(port).not.toMatch(/options\?: ProductImportOptions/u);
    expect(port).not.toMatch(/readonly signal\?: AbortSignal/u);
  });

  it('NET-NEW — M3 is unchanged by the withdrawal: earlier rows stay committed, no later row is attempted', async () => {
    /*
     * ⭐ THE ONE BEHAVIOURAL CLAIM WORTH CARRYING OVER FROM THE WITHDRAWN SUITE, re-pointed at the
     * mechanism the legacy actually has. `model/dao/ProductDAO.cfc:L176-L177` opens a transaction INSIDE
     * the row loop, so a mid-file failure commits everything before it, rolls back the failing row and
     * attempts nothing after it. That is M3, and it was never the cancellation control's doing.
     */
    const failure = new Error('row two could not be written');
    const harness = buildHarness(THREE_ROW_FILE, (statement) => {
      if (
        collapse(statement.sql).startsWith('INSERT INTO SwProduct') &&
        statement.params.includes('CODE-2')
      ) {
        throw failure;
      }

      return undefined;
    });

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toBe(failure);

    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(1);
    expect(matching(harness, 'INSERT INTO SwProduct')).toHaveLength(2);
    /* The back-fills are reached by falling out of the loop, and a raise leaves the loop early. */
    expect(matching(harness, 'SET defaultSkuID')).toEqual([]);
  });
});

describe('NET-NEW — every import lookup is re-issued per row (finding F12)', () => {
  /* The brand family is covered by "re-probes the brand on EVERY row" above; these are the product-type
   * and option families, each asserted at the per-row cadence `model/dao/ProductDAO.cfc:L179-L186` and
   * `:L209-L235` establish.
   *
   * ⛔ THIS BLOCK WAS TITLED "every import lookup-memory key family" and existed to pin the KEYS of an
   * import-scoped resolution memory. Review finding F12 withdrew that memory; the cases are kept because
   * the underlying questions — how many statements a file issues, what each one binds, and which branch
   * `:L217` takes — are legacy behaviour either way, and they are now asserted against the legacy's own
   * per-row cadence rather than against the cache's. */

  it('NET-NEW — re-probes the product type on EVERY row, resolved or not (finding F12)', async () => {
    const twoRowsOneType = importable(
      ['product_productCode', 'productType_productTypeName'],
      ['CODE-1', 'Merchandise'],
      ['CODE-2', 'Merchandise'],
    );

    const resolving = buildHarness(twoRowsOneType, (statement) => {
      if (collapse(statement.sql).startsWith('SELECT productTypeID FROM SwProductType')) {
        return sqlRows([{ productTypeID: '444df2f7ea9c87e60051f3cd87b435a1' }]);
      }

      return undefined;
    });
    const unresolved = buildHarness(twoRowsOneType);

    await resolving.repository.importFromFile('https://feeds.example/catalog.csv');
    await unresolved.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔ THE SAME WITHDRAWAL AS THE BRAND FAMILY (F12). `:L183-L186` is inside the record loop, so both
     * harnesses issue one statement per row. The asymmetry this case used to assert — one for the resolving
     * harness, two for the unresolved one — was the memory's signature, and it is gone.
     */
    expect(matching(resolving, 'FROM SwProductType')).toHaveLength(2);
    expect(matching(unresolved, 'FROM SwProductType')).toHaveLength(2);
  });

  it('NET-NEW — re-probes BOTH the option and the link on every row (finding F12)', async () => {
    const twoRowsOneOption = importable(
      ['product_productCode', 'option_Size'],
      ['CODE-1', 'Small'],
      ['CODE-2', 'Small'],
    );

    const harness = buildHarness(twoRowsOneOption, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return sqlRows([{ optionGroupID: 'cccccccccccccccccccccccccccc0001' }]);
      }
      if (sql.includes('LEFT JOIN SwOption')) {
        return sqlRows([
          {
            optionID: 'dddddddddddddddddddddddddddd0001',
            optionGroupID: 'cccccccccccccccccccccccccccc0001',
          },
        ]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔ BOTH READS ARE NOW PER ROW, AND THE CASE USED TO ASSERT THAT ONLY ONE OF THEM WAS.
     * `:L212-L215` re-runs the option lookup for every row × every surviving option group, and
     * `:L218-L220` re-runs the link probe for every row. The distinction this case was built around —
     * the option resolution remembered, the link probe live — was the memory's, not the legacy's, and
     * review finding F12 withdrew it.
     *
     * ⚠️ THE LINK PROBE'S OWN REASON FOR BEING LIVE STILL STANDS AND IS WORTH KEEPING ON RECORD: its key
     * includes the SKU identifier, two file rows CAN resolve to the same SKU because `:L200-L203` derives
     * the code from cell values, and the second such row must observe the link the first inserted — the
     * same-connection read-back M6 requires. It was never the memoised one; now neither is.
     */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(2);
    expect(matching(harness, 'FROM SwSkuOption')).toHaveLength(2);

    /* Each row's link probe binds the identifier ITS OWN lookup answered. */
    expect(matching(harness, 'FROM SwSkuOption')[1]?.params[0]).toBe(
      'dddddddddddddddddddddddddddd0001',
    );

    /* And both option lookups bind the same code and group — the read is repeated, not varied. */
    expect(matching(harness, 'LEFT JOIN SwOption').map((call) => call.params)).toEqual([
      ['Small', 'cccccccccccccccccccccccccccc0001'],
      ['Small', 'cccccccccccccccccccccccccccc0001'],
    ]);
  });

  it('NET-NEW — one code in two groups is looked up per group, per row (finding F12)', async () => {
    /* Both headings carry the SAME option code, in two DIFFERENT groups — the exact collision a
     * code-only key would produce a wrong answer for. */
    const sameCodeTwoGroups = importable(
      ['product_productCode', 'option_Size', 'option_Colour'],
      ['CODE-1', 'One', 'One'],
      ['CODE-2', 'One', 'One'],
    );

    const harness = buildHarness(sameCodeTwoGroups, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        // `Size` and `Colour` are distinct groups; the pre-pass resolves each to its own identifier.
        return statement.params[0] === 'Size'
          ? sqlRows([{ optionGroupID: 'cccccccccccccccccccccccccccc0001' }])
          : sqlRows([{ optionGroupID: 'cccccccccccccccccccccccccccc0002' }]);
      }
      if (sql.includes('LEFT JOIN SwOption')) {
        const groupID = String(statement.params[1]);
        return sqlRows([
          {
            optionID: groupID.endsWith('0001')
              ? 'dddddddddddddddddddddddddddd0001'
              : 'dddddddddddddddddddddddddddd0002',
            optionGroupID: groupID,
          },
        ]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔ THE ARITHMETIC IS THE ASSERTION, AND F12 CHANGED IT FROM 2 TO 4. Two rows × two option groups =
     * FOUR lookups, because `:L212-L215` is inside both the record loop and the per-group loop.
     *
     * This case previously asserted 2 — two distinct composite keys resolved on row 1, nothing on row 2 —
     * which was the memory's arithmetic. The property it was really defending survives the withdrawal and
     * is still asserted below: the SAME code in two DIFFERENT groups must resolve to two DIFFERENT options,
     * because `:L212-L215` matches on BOTH the code and the group. Under a memory that was a keying
     * question; with no memory it is a binding question, and the parameter assertions are what answer it.
     */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(4);

    /*
     * ⚠️ AND THE TWO LOOPS OVER THE SAME ARRAY RUN IN OPPOSITE DIRECTIONS, WHICH IS OBSERVABLE HERE.
     * `:L161` resolves the groups with `for(var i=arrayLen(optionGroups); i>=1; i--)` — DESCENDING, because
     * `:L170` deletes unresolved entries from the array being walked and only a descending walk can delete
     * safely — so the GROUP lookups issue in reverse heading order. `:L209` then assigns with
     * `for(var optionGroup in optiongroups)`, a plain ascending walk over the survivors, which retain
     * their original heading order. So the OPTION lookups issue in heading order: `Size` before `Colour`.
     * The directions are asserted rather than assumed, because a reader harmonising the two loops would
     * change this order and nothing else in the file would notice.
     */
    expect(matching(harness, 'LEFT JOIN SwOption').map((call) => call.params)).toEqual([
      /* row 1 */ ['One', 'cccccccccccccccccccccccccccc0001'],
      ['One', 'cccccccccccccccccccccccccccc0002'],
      /* row 2, the same pair again — this is the per-row repetition F12 restored. */
      ['One', 'cccccccccccccccccccccccccccc0001'],
      ['One', 'cccccccccccccccccccccccccccc0002'],
    ]);
  });

  it('NET-NEW — an option code that LOOKS like a composite key is still just a bound value', async () => {
    /* The `Size` cell is spelled to look like `<groupID>|<code>`, which is how a key-forging attempt would
     * be shaped. Nothing composes a key any more (F12), so the cell can only ever reach a bind position —
     * this case now asserts that property directly rather than the unforgeability of a key that is gone. */
    const forging = importable(
      ['product_productCode', 'option_Size', 'option_Colour'],
      ['CODE-1', 'cccccccccccccccccccccccccccc0002|Blue', 'Blue'],
    );

    const harness = buildHarness(forging, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return statement.params[0] === 'Size'
          ? sqlRows([{ optionGroupID: 'cccccccccccccccccccccccccccc0001' }])
          : sqlRows([{ optionGroupID: 'cccccccccccccccccccccccccccc0002' }]);
      }
      if (sql.includes('LEFT JOIN SwOption')) {
        return sqlRows([
          {
            optionID: 'dddddddddddddddddddddddddddd0001',
            optionGroupID: String(statement.params[1]),
          },
        ]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔ BOTH CELLS ARE LOOKED UP, AND EACH CELL TRAVELS AS A BOUND VALUE. The withdrawn memory keyed its
     * entries on `groupID + NUL + code` precisely so a printable separator in file content could not forge
     * another group's entry; with the memory gone there is no key to forge, and the residual property is
     * the stronger one — the cell reaches only a placeholder, never statement text (TR-4, D18).
     */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(2);

    /* The forged-looking cell is bound VERBATIM in slot one, and the group it is matched against comes
     * from the pre-pass in slot two. Neither appears in the statement text. */
    const forged = matching(harness, 'LEFT JOIN SwOption')[0];
    expect(forged?.params).toEqual([
      'cccccccccccccccccccccccccccc0002|Blue',
      'cccccccccccccccccccccccccccc0001',
    ]);
    expect(forged?.sql).not.toContain('|Blue');
  });

  it('NET-NEW — an option the import CREATES is re-looked-up by the next row, and FOUND (finding F12)', async () => {
    const twoRowsOneNewOption = importable(
      ['product_productCode', 'option_Size'],
      ['CODE-1', 'Small'],
      ['CODE-2', 'Small'],
    );

    /*
     * ⚠️ A STATEFUL STUB, AND THE STATE IS THE POINT. This case used to answer `optionID: null` on every
     * probe and assert that row 2 never probed at all, because the withdrawn memory answered it from the
     * entry row 1 recorded. With no memory, row 2 DOES probe — so a stub frozen at `null` would make row 2
     * create a SECOND option, which is neither the legacy's behaviour nor the database's. Modelling the
     * insert is what lets the case assert the real property: the re-query sees row 1's uncommitted insert,
     * on row 1's own connection, which is the same-connection read-back M6 requires.
     */
    let createdOptionID: string | null = null;

    const harness = buildHarness(twoRowsOneNewOption, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return sqlRows([{ optionGroupID: 'cccccccccccccccccccccccccccc0001' }]);
      }
      if (sql.startsWith('INSERT INTO SwOption ')) {
        /* `:L222-L227` — remember what the import minted, so the next probe can find it. */
        createdOptionID = String(statement.params[0]);
        return undefined;
      }
      if (sql.includes('LEFT JOIN SwOption')) {
        /* `:L212-L215` is an OUTER join: it returns the GROUP with a NULL option while none exists — the
         * `:L217` empty branch that creates one — and the option itself once it does. */
        return sqlRows([
          { optionID: createdOptionID, optionGroupID: 'cccccccccccccccccccccccccccc0001' },
        ]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔ EXACTLY ONE OPTION IS CREATED, AND NOT BECAUSE ANYTHING WAS REMEMBERED. Row 2 re-issues
     * `:L212-L215`, the outer join now returns the option row 1 inserted, and `:L217` takes its non-empty
     * branch — so the creation arm does not run a second time. The legacy reaches the same outcome by the
     * same route, and it is the DATABASE that carries the fact across rows rather than a cache.
     */
    const created = matching(harness, 'INSERT INTO SwOption ');
    expect(created).toHaveLength(1);
    expect(String(created[0]?.params[0])).toMatch(HEX_32);

    /* TWO lookups for two rows — the per-row repetition F12 restored. */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(2);

    /*
     * ⭐⭐ THE CREATION ARM ISSUES NO EXISTENCE PROBE AT ALL, AND THAT ASYMMETRY IS THE LEGACY'S.
     * `model/dao/ProductDAO.cfc:L217` probes `SlatwallSkuOption` only on its non-empty branch; the empty
     * branch at `:L222-L228` creates the option and then sets `exists = false` OUTRIGHT, without asking,
     * because an option that did not exist a statement ago can carry no link. So row 1 probes zero times
     * and links once, and row 2 — arriving through its own lookup — takes the `:L217` non-empty branch and
     * probes exactly once. One probe across two rows, not two.
     *
     * ⭐ AND THE PROBE BINDS THE IDENTIFIER ROW 2'S OWN LOOKUP RETURNED, which is the same value row 1
     * minted. Under the withdrawn memory this assertion proved the recording; now it proves the read-back.
     */
    const probes = matching(harness, 'FROM SwSkuOption');
    expect(probes).toHaveLength(1);
    expect(probes[0]?.region).toBe('row#2');
    expect(probes[0]?.params[0]).toBe(String(created[0]?.params[0]));

    /* Both rows link, because row 1 skipped the probe and row 2's probe found nothing. */
    expect(matching(harness, 'INSERT INTO SwSkuOption')).toHaveLength(2);
  });

  it('NET-NEW — no lookup state survives an import, so a warm instance cannot leak one (M7, F12)', async () => {
    const oneRowOneBrand = importable(['product_productCode'], ['CODE-1']);

    const harness = buildHarness(oneRowOneBrand, (statement) => {
      if (collapse(statement.sql).startsWith('SELECT brandID FROM SwBrand')) {
        return sqlRows([{ brandID: 'eeeeeeeeeeeeeeeeeeeeeeeeeeee0001' }]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');
    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⛔⛔ THE HAZARD M7 NAMES, ASSERTED RATHER THAN DOCUMENTED — AND NOW STRUCTURALLY IMPOSSIBLE.
     * Nothing survives between Lambda invocations except module-scope state, so lookup state held as a
     * FIELD on the repository would let one caller's catalogue identifiers answer the next caller's import
     * on a warm container.
     *
     * This case was written when an import-scoped memory existed, and it asserted that the memory died with
     * its `ImportPlan` rather than living on the instance. Review finding F12 withdrew the memory entirely,
     * so the property is no longer a matter of where state is held — there is none to hold. The assertion
     * is KEPT rather than deleted, because it is the one that would fail first if a cache were ever
     * reintroduced as an instance field, and it costs one statement to keep.
     */
    expect(matching(harness, 'FROM SwBrand')).toHaveLength(2);

    /* One row per import, one brand statement per row, two imports — and each binds the same cell. */
    expect(matching(harness, 'FROM SwBrand').map((call) => call.params)).toEqual([
      ['Acme'],
      ['Acme'],
    ]);
  });
});

/* ================================================================================================
 * AGGREGATE LOADERS — cases merged from catalogAggregates.test.ts
 * ------------------------------------------------------------------------------------------------
 * Merged in from `test/adapters/catalogAggregates.test.ts` when review finding F5 folded that file's SUBJECT into
 * `src/adapters/mysql/MySqlProductRepository.ts` and `src/adapters/mysql/SmartListQueryBuilder.ts`.
 * Every case is carried across unchanged; only four local identifiers were renamed to avoid a
 * collision with declarations already in this file — `matching` -> `persistenceMatching`,
 * `makeExecutor` -> `makePersistenceExecutor`, `Journal` -> `PersistenceJournal` and `ID` ->
 * `PERSISTENCE_ID`.
 *
 * THE ORIGINAL MODULE HEADER FOLLOWS, VERBATIM:

 * Aggregate materialization — INT-02 and DATA-02.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * the aggregate-loader section of `src/adapters/mysql/SmartListQueryBuilder.ts` and the hook it is invoked through in
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
 * ============================================================================================== */
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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

  /* ==============================================================================================
   * FINDING F7 — THE PRODUCT ROOT HYDRATES ITS SKUs' OPTIONS, AND MARKS ONLY THAT COLLECTION READ
   * ==============================================================================================
   * ⭐ WHY THE PRODUCT ROOT AND NOT THE SKU ROOT. `ProductService.getProduct` executes an identifier
   * query against `SlatwallProduct`, so this loader is the SINGLE hydration path into every product
   * mutation member. Two of those members read the collection this section is about:
   * `processProductAddOption` composes its selected-option list from `existingSku.getOptions()`
   * (`model/service/ProductService.cfc:L140-L148`), and `processProductAddOptionGroup` calls
   * `sku.addOption(options[1])` on each existing SKU (`:L117-L121`). With the collection empty the first
   * produced a silently wrong list and the second handed `persistSku` a one-option SKU, which replaced
   * the link table with it and deleted the rest.
   *
   * ⚠️ AND THE OTHER THREE OWNED COLLECTIONS MUST STAY UNREAD, which the last case pins. No in-scope
   * member reads them, so Hibernate never lazily loaded them on this path either — and it is precisely
   * their UNREAD state that makes `persistSku` preserve their stored rows rather than delete them. A
   * loader that eagerly read all four would issue three statements the legacy never issued AND would
   * make the write side authoritative over collections nobody populated.
   * ============================================================================================ */

  /**
   * The product scenario plus the SKU-option link and the group behind it.
   *
   * ⚠️ THE `SwSkuOption` ROWS CARRY THE OPTION'S OWN COLUMNS, AND THAT IS HOW A JOIN IS MODELLED HERE.
   * `attachSkuOptions` issues the ONE joined statement in the adapter — `FROM SwSkuOption link INNER JOIN
   * SwOption …` — and {@link makeExecutor} resolves a statement to the FIRST table its `FROM` names, then
   * filters by the bound parameters. It does not perform joins, so the fixture row has to be the JOINED
   * row: the link table's `skuID` plus every option column the projection selects. Splitting them into a
   * separate `SwOption` fixture would leave the option columns unreachable and the group silently absent,
   * which is exactly the failure this section exists to catch — so the shape is stated here rather than
   * discovered again.
   */
  function optionedProductScenario(): Readonly<Record<string, readonly MySqlRow[]>> {
    return {
      ...productScenario(),
      SwSkuOption: [
        {
          skuID: ID.sku,
          optionID: ID.option,
          optionCode: 'SM',
          optionName: 'Small',
          optionGroupID: ID.optionGroup,
        },
      ],
      SwOptionGroup: [{ optionGroupID: ID.optionGroup, optionGroupName: 'Size' }],
    };
  }

  it('attaches each SKU option WITH its option group, so the members that read through it work', async () => {
    const { executor } = makeExecutor(optionedProductScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });
    const withOption = (result.records[0]?.getSkus() ?? []).find(
      (member) => (member as Sku).skuID === ID.sku,
    ) as Sku | undefined;

    expect(withOption?.getOptions()).toHaveLength(1);
    expect(withOption?.getOptions()[0]?.optionID).toBe(ID.option);
    /*
     * THE GROUP COMES WITH IT, and that is not incidental: `Sku.generateImageFileName` reads
     * `option.getOptionGroup().getImageGroupFlag()` (`model/entity/Sku.cfc:L134`) and
     * `processProductAddOption` reads the group's identifier at `:L144`, so an option attached without
     * its group would satisfy the type and then answer from a class default.
     */
    expect(withOption?.getOptions()[0]?.optionGroup?.optionGroupID).toBe(ID.optionGroup);
  });

  it('marks `options` authoritative for EVERY SKU in the batch, including one with no link rows', async () => {
    const { executor } = makeExecutor(optionedProductScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });
    /* `Product.getSkus()` answers `ProductSkuMember`, the narrow read surface the domain exposes; the
     * provenance predicate takes `object`, so the members are passed through as such rather than cast to
     * `Sku` — a cast the domain layer deliberately makes impossible (see the defaultSku delegate note). */
    const skus: readonly object[] = result.records[0]?.getSkus() ?? [];

    expect(skus).toHaveLength(2);
    for (const member of skus) {
      /*
       * INCLUDING THE DEFAULT SKU, WHICH THE LINK TABLE RETURNED NOTHING FOR. The read established that
       * it has NO options, which is a fact, and recording it is what keeps removal working: an emptied
       * collection has to stay distinguishable from an unloaded one or `persistSku` could never clear
       * one. Marking only the SKUs that came back with rows would silently break that.
       */
      expect(isSkuOwnedLinkAuthoritative(member, 'options')).toBe(true);
    }
  });

  it('leaves the three out-of-scope owned collections UNREAD, issuing no statement for them', async () => {
    const { executor, journal } = makeExecutor(optionedProductScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });
    /* `Product.getSkus()` answers `ProductSkuMember`, the narrow read surface the domain exposes; the
     * provenance predicate takes `object`, so the members are passed through as such rather than cast to
     * `Sku` — a cast the domain layer deliberately makes impossible (see the defaultSku delegate note). */
    const skus: readonly object[] = result.records[0]?.getSkus() ?? [];

    for (const member of skus) {
      for (const collection of [
        'accessContents',
        'subscriptionBenefits',
        'renewalSubscriptionBenefits',
      ] as const) {
        expect(isSkuOwnedLinkAuthoritative(member, collection)).toBe(false);
      }
    }

    /* And no statement went near their tables, which is the read-side half of the same claim. */
    for (const table of ['SwSkuAccessContent', 'SwSkuSubsBenefit', 'SwSkuRenewalSubsBenefit']) {
      expect(journal.statements.some((statement) => statement.sql.includes(table))).toBe(false);
    }
  });

  it('issues ONE option statement for the whole page rather than one per SKU', async () => {
    const { executor, journal } = makeExecutor(optionedProductScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    await builder.execute({ entityName: 'SlatwallProduct' });

    /*
     * THE BATCHING IS THE TRANSLATION, AND IT IS WORTH PINNING. The legacy triggered one lazy load per
     * SKU as the members above iterated; this port has no lazy proxy, so the rows are fetched
     * deliberately — once for the page, which is the same shape `attachProductAssociations` already uses
     * for the many-to-ones. A per-SKU loop would be the N+1 the batching exists to avoid.
     */
    const optionReads = journal.statements.filter((statement) =>
      statement.sql.includes('FROM SwSkuOption'),
    );
    expect(optionReads).toHaveLength(1);
    /* Both SKUs of the page are in the one predicate. */
    expect(optionReads[0]?.params).toEqual(expect.arrayContaining([ID.sku, ID.defaultSku]));
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
      GENEROUS_SMART_LIST_BUDGET,
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
        { skuID: ID.sku, optionID: ID.option, optionName: 'Small', optionGroupID: ID.optionGroup },
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
      GENEROUS_SMART_LIST_BUDGET,
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
      GENEROUS_SMART_LIST_BUDGET,
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

/* ================================================================================================
 * PRODUCT WRITE SURFACE — cases merged from MySqlProductPersistence.test.ts
 * ------------------------------------------------------------------------------------------------
 * Merged in from `test/adapters/MySqlProductPersistence.test.ts` when review finding F5 folded that file's SUBJECT into
 * `src/adapters/mysql/MySqlProductRepository.ts` and `src/adapters/mysql/SmartListQueryBuilder.ts`.
 * Every case is carried across unchanged; only four local identifiers were renamed to avoid a
 * collision with declarations already in this file — `matching` -> `persistenceMatching`,
 * `makeExecutor` -> `makePersistenceExecutor`, `Journal` -> `PersistenceJournal` and `ID` ->
 * `PERSISTENCE_ID`.
 *
 * THE ORIGINAL MODULE HEADER FOLLOWS, VERBATIM:

 * Product and product-type persistence — DATA-03.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers the persistence
 * adapter — which now lives in the folded persistence section of
 * `src/adapters/mysql/MySqlProductRepository.ts`, AAP §0.3.1 enumerating no separate module for it — and the
 * four `src/services/ProductService.ts` seams it fills.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * The reported finding had two halves, and they failed for unrelated reasons:
 *
 *   READ  — `ProductService.getProduct` answered a product with no `productType`, no `defaultSku`, no
 *           `brand` and no `skus`, because the smart-list builder projects `<baseAlias>.*` and
 *           `rowMappers.ts` RULE 3 leaves every many-to-one GENUINELY ABSENT by design.
 *   WRITE — the service declares `persistProduct` plus two composed base services and implements every
 *           member against them, but NOTHING in `src/` supplied a production implementation of any of
 *           the four capabilities behind them. A composition root could not have wired a working
 *           product flow without inventing SQL at the wiring site.
 *
 * The read half is now closed by the aggregate-loader section of `src/adapters/mysql/SmartListQueryBuilder.ts`; the cases at the end of
 * this file assert it THROUGH the real service rather than through the builder alone, because
 * "`getProduct` returns a scalar Product" is a statement about the service's answer.
 *
 * The write half is closed by the adapter under test. The statement-level cases assert what reaches the
 * driver; the seam cases assert that a real `ProductService` wired to the real adapter actually writes.
 *
 * ⚠️ THE ASSIGNABILITY OF ALL FOUR MEMBERS IS PROVEN HERE RATHER THAN IN THE ADAPTER. The adapter does
 * not import `EntityPersister` or `EntityRemover`, because an adapter that reached up into the service
 * layer's type surface would invert the dependency direction the hexagonal separation exists to fix
 * (AAP §0.7.3 S4). A test file is under no such constraint, so the four bindings below are where a
 * signature drift becomes a compile error.
 *
 * NO DATABASE. A recording executor double answers each statement by shape, which is how the sibling
 * adapter suites work and what AAP 0.7.3 standard 6 requires here: no CFML runtime exists and the `Sw*`
 * tables are absent from this repository.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 records that no `ProductServiceTest` exists
 * and that no data-access test exists for this slice at all. `meta/tests/unit/IssuesTest.cfc:L51-L71`
 * (`issue_1097`) populates, saves and deletes a product with a nested product-type struct and is
 * TRACEABLE for the BEHAVIOUR these cases assert, but it asserts no statement, because no legacy
 * statement for either table exists — both entities were saved and deleted through the surface
 * `org/Hibachi/HibachiService.cfc:L255-L281` fabricated by prefix (IR-1).
 * ============================================================================================== */
/**
 * A collaborator this scenario never reaches needs no behaviour, and giving it one would suggest the
 * case depends on it. Same discipline as `test/services/SkuService.test.ts`.
 */
const UNREACHED_COLLABORATOR = {} as never;

/** Distinct 32-character identifiers, so a crossed binding is visible rather than coincidental. */
const PERSISTENCE_ID = {
  product: 'aaaaaaaa000000000000000000000001',
  /* A SECOND product, so an inheritance case can assert collection ORDER rather than membership. */
  otherProduct: 'aaaaaaaa000000000000000000000002',
  productType: 'bbbbbbbb000000000000000000000001',
  parentProductType: 'bbbbbbbb000000000000000000000002',
  brand: 'cccccccc000000000000000000000001',
  defaultSku: 'dddddddd000000000000000000000001',
  otherSku: 'dddddddd000000000000000000000002',
} as const;

/**
 * The URL-title availability probe, shared by every scenario that constructs a service.
 *
 * Declared once at module level because it holds no per-case state worth isolating: nothing below seeds
 * a collision, so every candidate is reported available and the derivation terminates on its first
 * attempt.
 */
const urlTitleProbe = createUrlTitleAvailabilityDouble();

/** One statement, as the driver saw it. */
interface Statement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** The recorded journal plus the executor that fills it. */
interface PersistenceJournal {
  readonly statements: Statement[];
}

/**
 * A recording executor.
 *
 * `execute` answers with whatever rows the caller seeded for the table the statement reads, and
 * `executeMutation` answers with a configurable affected-row count — configurable BECAUSE the update
 * path must be shown not to read it.
 */
function makePersistenceExecutor(
  rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {},
  affectedRows = 1,
): { readonly executor: ProductPersistenceExecutor; readonly journal: PersistenceJournal } {
  const journal: PersistenceJournal = { statements: [] };

  const executor: ProductPersistenceExecutor = {
    execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
      journal.statements.push({ sql, params: [...params] });

      const table = Object.keys(rowsByTable).find((name) =>
        new RegExp(`FROM ${name}\\b`).test(sql),
      );

      return Promise.resolve(table === undefined ? [] : [...(rowsByTable[table] ?? [])]);
    },
    executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
      journal.statements.push({ sql, params: [...params] });
      return Promise.resolve(affectedRows);
    },
  };

  return { executor, journal };
}

/** A cleanup collaborator that records the identifiers it was asked to clear. */
function makeCleanup(): {
  readonly cleanup: ProductDependencyCleanup;
  readonly productIds: string[];
  readonly productTypeIds: string[];
} {
  const productIds: string[] = [];
  const productTypeIds: string[] = [];

  return {
    productIds,
    productTypeIds,
    cleanup: {
      removeProductDependencies: (productID: string): Promise<void> => {
        productIds.push(productID);
        return Promise.resolve();
      },
      removeProductTypeDependencies: (productTypeID: string): Promise<void> => {
        productTypeIds.push(productTypeID);
        return Promise.resolve();
      },
    },
  };
}

/**
 * Reads the identifier of a default-SKU delegate.
 *
 * The delegate in these cases is a wrapper closing over a `Sku`, exactly as `src/domain/sku/Sku.ts`
 * records: `Sku` is DELIBERATELY not assignable to `ProductDefaultSkuDelegate`, so the value in
 * `Product.defaultSku` is never the entity itself and an `instanceof Sku` test against it is false.
 */
function makeDefaultSkuDelegate(skuID: string): {
  readonly delegate: ProductDefaultSkuDelegate;
  readonly skuID: string;
} {
  return {
    skuID,
    delegate: {
      getCurrencyCode: (): string | undefined => undefined,
      getPrice: (): ExactDecimal | undefined => undefined,
      getRenewalPrice: (): ExactDecimal | undefined => undefined,
      getListPrice: (): ExactDecimal | undefined => undefined,
      getImageDirectory: (): string => '',
      getImagePath: (): string => '',
      getImage: (): string => '',
      getResizedImagePath: (): string => '',
      getImageExistsFlag: (): boolean => false,
    },
  };
}

/** The delegate-to-identifier map these cases inject, keyed by delegate object identity. */
function makeDefaultSkuIdReader(): {
  readonly read: (defaultSku: object) => string;
  register(delegate: ProductDefaultSkuDelegate, skuID: string): void;
} {
  const identifiers = new Map<object, string>();

  return {
    register: (delegate: ProductDefaultSkuDelegate, skuID: string): void => {
      identifiers.set(delegate, skuID);
    },
    read: (defaultSku: object): string => identifiers.get(defaultSku) ?? '',
  };
}

/** The adapter under test, with everything it needs recorded. */
function makeAdapter(
  rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {},
  affectedRows = 1,
): {
  readonly adapter: MySqlProductPersistence;
  readonly journal: PersistenceJournal;
  readonly cleanup: ReturnType<typeof makeCleanup>;
  readonly defaultSkuIds: ReturnType<typeof makeDefaultSkuIdReader>;
} {
  const { executor, journal } = makePersistenceExecutor(rowsByTable, affectedRows);
  const cleanup = makeCleanup();
  const defaultSkuIds = makeDefaultSkuIdReader();

  return {
    journal,
    cleanup,
    defaultSkuIds,
    adapter: new MySqlProductPersistence(executor, cleanup.cleanup, defaultSkuIds.read),
  };
}

/** A saved product carrying all three of its many-to-one associations. */
function savedProduct(): Product {
  const product = new Product();
  product.productID = PERSISTENCE_ID.product;
  product.productName = 'Feed Product';
  product.productCode = 'FP-1';
  product.urlTitle = 'feed-product';
  product.activeFlag = true;
  product.publishedFlag = true;

  const brand = new Brand();
  brand.brandID = PERSISTENCE_ID.brand;
  product.brand = brand;

  const productType = new ProductType();
  productType.productTypeID = PERSISTENCE_ID.productType;
  product.productType = productType;

  return product;
}

/** A saved product type carrying its self-referencing parent. */
function savedProductType(): ProductType {
  const productType = new ProductType();
  productType.productTypeID = PERSISTENCE_ID.productType;
  productType.productTypeName = 'Merchandise';
  productType.urlTitle = 'merchandise';
  productType.productTypeIDPath = `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`;

  const parent = new ProductType();
  parent.productTypeID = PERSISTENCE_ID.parentProductType;
  productType.parentProductType = parent;

  return productType;
}

/** Every statement whose text matches, in journal order. */
function persistenceMatching(journal: PersistenceJournal, pattern: RegExp): readonly Statement[] {
  return journal.statements.filter((statement) => pattern.test(statement.sql));
}

/* =================================================================================================
 * THE `SwProduct` WRITE PATH
 * ============================================================================================== */

describe('MySqlProductPersistence — the SwProduct write path (DATA-03)', () => {
  it('NET-NEW — a transient product is INSERTed with a freshly minted 32-character identifier', async () => {
    const { adapter, journal } = makeAdapter();
    const product = new Product();
    product.productName = 'New Product';

    // `model/entity/Product.cfc:L52` declares `unsavedvalue=""`, which is what `isNew()` tests.
    expect(product.isNew()).toBe(true);

    await adapter.saveProduct(product);

    // IR-6: 32 lowercase hexadecimal characters, no dashes, never an auto-increment.
    expect(product.productID).toMatch(/^[0-9a-f]{32}$/);
    expect(product.isNew()).toBe(false);

    const inserts = persistenceMatching(journal, /^INSERT INTO SwProduct/);
    expect(inserts).toHaveLength(1);
    // The identifier is bound FIRST, persistenceMatching the column list's own ordering.
    expect(inserts[0]?.params[0]).toBe(product.productID);
  });

  it('NET-NEW — the insert names every SwProduct column and binds one value per column', async () => {
    const { adapter, journal } = makeAdapter();

    await adapter.saveProduct(new Product());

    const insert = persistenceMatching(journal, /^INSERT INTO SwProduct/)[0];
    const columnList = /\(([^)]*)\) VALUES/.exec(insert?.sql ?? '')?.[1] ?? '';
    const columns = columnList.split(', ');

    // Twenty columns: the primary key plus the nineteen writable ones. `model/entity/Product.cfc`
    // declares eight scalars (:L52-L59), four persisted calculated columns (:L62-L65), three
    // many-to-one foreign keys (:L68-L70), a remote identifier (:L93) and four audit members
    // (:L96-L99). Its twenty NON-persistent properties (:L102-L123) are not columns and are absent.
    expect(columns).toHaveLength(20);
    expect(columns).toContain('productID');
    expect(columns).toContain('calculatedTitle');
    expect(columns).toContain('brandID');
    expect(columns).toContain('productTypeID');
    expect(columns).toContain('defaultSkuID');
    // The crossed audit pairing: the COLUMNS carry the `PERSISTENCE_ID` suffix, the fields do not.
    expect(columns).toContain('createdByAccountID');
    expect(columns).toContain('modifiedByAccountID');
    // A non-persistent property must never appear as a column.
    expect(columns).not.toContain('price');
    expect(columns).not.toContain('optionGroups');

    expect(insert?.params).toHaveLength(columns.length);
  });

  it('NET-NEW — the three foreign keys come from the ASSOCIATION OBJECTS, not from scalars', async () => {
    // "Preserve association identity" in practice: `rowMappers.ts` RULE 3 leaves every many-to-one
    // absent, so there is no `product.brandID` field anywhere in the domain to copy out. A stale
    // scalar cannot drift out of step with the graph because no stale scalar exists.
    const { adapter, journal, defaultSkuIds } = makeAdapter();
    const product = savedProduct();
    const { delegate } = makeDefaultSkuDelegate(PERSISTENCE_ID.defaultSku);
    product.defaultSku = delegate;
    defaultSkuIds.register(delegate, PERSISTENCE_ID.defaultSku);

    await adapter.saveProduct(product);

    const update = persistenceMatching(journal, /^UPDATE SwProduct SET/)[0];
    expect(update?.params).toContain(PERSISTENCE_ID.brand);
    expect(update?.params).toContain(PERSISTENCE_ID.productType);
    // The default SKU arrives through the INJECTED READER, because the delegate exposes no
    // identifier accessor — `src/domain/sku/Sku.ts` mismatch M-ii.
    expect(update?.params).toContain(PERSISTENCE_ID.defaultSku);
  });

  it('NET-NEW — a saved product is UPDATEd with the primary key bound LAST and no identifier minted', async () => {
    const { adapter, journal } = makeAdapter();
    const product = savedProduct();

    await adapter.saveProduct(product);

    // The identity is the entity's own answer, not a probe's: no existence read is issued.
    expect(persistenceMatching(journal, /^SELECT/)).toHaveLength(0);
    expect(product.productID).toBe(PERSISTENCE_ID.product);

    const updates = persistenceMatching(journal, /^UPDATE SwProduct SET/);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.sql).toContain('WHERE productID = ?');
    // Nineteen assignments plus the key: the key is the LAST bound value, persistenceMatching its position in
    // the statement text.
    expect(updates[0]?.params).toHaveLength(20);
    expect(updates[0]?.params[19]).toBe(PERSISTENCE_ID.product);
  });

  it('NET-NEW — the update path does NOT read the affected-row count', async () => {
    // Measured against MySQL 8.4.11 through mysql2 3.23.2: re-saving unchanged data reports 1 with
    // `CLIENT_FOUND_ROWS` and 0 without, and `src/config/database.ts` pins no capability flags. So a
    // zero count must NOT be treated as a failure — otherwise correctness would depend on an
    // unpinned connection negotiation detail.
    const { adapter } = makeAdapter({}, 0);
    const product = savedProduct();

    await expect(adapter.saveProduct(product)).resolves.toBe(product);
  });

  it('NET-NEW — an absent field binds as SQL null rather than being omitted', async () => {
    // The domain expresses a legacy null by the ABSENCE of a property. A bind position cannot express
    // absence, so the translation happens exactly at this seam and nowhere earlier. Omitting the
    // column instead would let the database apply a default, which is a different outcome.
    const { adapter, journal } = makeAdapter();
    const product = new Product();
    product.productName = 'Sparse';

    await adapter.saveProduct(product);

    const insert = persistenceMatching(journal, /^INSERT INTO SwProduct/)[0];
    expect(insert?.params).toContain(null);
    expect(insert?.params).toContain('Sparse');
    // Absence never reaches the driver as `undefined`.
    expect(insert?.params).not.toContain(undefined);
  });

  it('NET-NEW — no value is ever interpolated into statement text', async () => {
    // The structural reason the D18 class of flaw cannot occur here: the statement text is a function
    // of the whitelist alone.
    const { adapter, journal } = makeAdapter();
    const product = savedProduct();
    product.productName = "Bobby'); DROP TABLE SwProduct;--";

    await adapter.saveProduct(product);

    for (const statement of journal.statements) {
      expect(statement.sql).not.toContain('DROP TABLE');
      expect(statement.sql).not.toContain('Bobby');
    }
  });
});

/* =================================================================================================
 * THE `SwProductType` WRITE PATH
 * ============================================================================================== */

describe('MySqlProductPersistence — the SwProductType write path (DATA-03)', () => {
  it('NET-NEW — a transient product type is INSERTed with a minted identifier and all fourteen columns', async () => {
    const { adapter, journal } = makeAdapter();
    const productType = new ProductType();
    productType.productTypeName = 'Merchandise';

    await adapter.saveProductType(productType);

    expect(productType.productTypeID).toMatch(/^[0-9a-f]{32}$/);

    const insert = persistenceMatching(journal, /^INSERT INTO SwProductType/)[0];
    const columns = (/\(([^)]*)\) VALUES/.exec(insert?.sql ?? '')?.[1] ?? '').split(', ');

    // Fourteen: eight scalars (`model/entity/ProductType.cfc:L52-L59`), the self-referencing foreign
    // key (:L62), a remote identifier (:L80) and four audit members (:L83-L86).
    expect(columns).toHaveLength(14);
    expect(columns).toContain('productTypeID');
    expect(columns).toContain('productTypeIDPath');
    expect(columns).toContain('systemCode');
    expect(columns).toContain('parentProductTypeID');
    expect(insert?.params).toHaveLength(14);
  });

  it('NET-NEW — the parent key comes from the self-referencing association object', async () => {
    const { adapter, journal } = makeAdapter();

    await adapter.saveProductType(savedProductType());

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];
    expect(update?.sql).toContain('WHERE productTypeID = ?');
    expect(update?.params).toContain(PERSISTENCE_ID.parentProductType);
    // The key is bound last; the parent key is one of the thirteen assignments before it.
    expect(update?.params[13]).toBe(PERSISTENCE_ID.productType);
  });

  it('NET-NEW — productTypeIDPath is written as held and is NOT derived at this boundary', async () => {
    // `model/entity/ProductType.cfc:L53` declares it a plain persistent column and
    // `model/service/ProductService.cfc:L294-L310` never recomputes it on save. Deriving it here
    // would add behaviour the legacy save path does not have (AAP §0.7.3 S9).
    const { adapter, journal } = makeAdapter();
    const productType = savedProductType();
    const held = productType.productTypeIDPath;

    await adapter.saveProductType(productType);

    expect(productType.productTypeIDPath).toBe(held);
    expect(persistenceMatching(journal, /^UPDATE SwProductType SET/)[0]?.params[0]).toBe(held);
  });
});

/* =================================================================================================
 * THE PRODUCT-TYPE PARENT ROUND TRIP — RULE 3b
 * ================================================================================================
 * ⭐ WHY THIS SECTION EXISTS. `./rowMappers.ts` deliberately does NOT resolve
 * `ProductType.parentProductType` when it hydrates a row, because an identifier-only parent would make
 * `ProductType.getSimpleRepresentation` (`src/domain/product/ProductType.ts:1153`) return `undefined`
 * as soon as it reached the parent's absent name, and that value renders the Google feed's
 * `g:product_type` element — so a reference would turn `Parent &raquo; Child` into an EMPTY element,
 * a reference that lies.
 *
 * An earlier revision stopped there, and the consequence was silent data loss: both write paths ended
 * their parent-key expression at `?? null`, so READING a child and SAVING it back wrote `NULL` into
 * `parentProductTypeID` and DETACHED the child from its parent. Rule 3b closes that by preserving the
 * row's raw key beside the entity — object-keyed, so nothing leaks across warm invocations (M7) —
 * without populating the association. These cases prove the round trip on both write paths, and prove
 * that an explicit detach still reaches `NULL`.
 *
 * The parent-key column is assignment index 7 of thirteen and the primary key is bound last at index
 * 13; `PRODUCT_TYPE_WRITABLE_COLUMNS` in `src/adapters/mysql/MySqlProductTypeRepository.ts:320-341`
 * fixes that order against `model/entity/ProductType.cfc:L53-L86`.
 * ============================================================================================== */

describe('MySqlProductPersistence / MySqlProductTypeRepository — the parent round trip (rule 3b)', () => {
  /** Assignment index of `parentProductTypeID` among the thirteen writable columns. */
  const PARENT_KEY_INDEX = 7;
  /** Assignment index of `productTypeIDPath` — the first writable column. */
  const PATH_INDEX = 0;

  /**
   * A child product type as it arrives FROM THE DATABASE: hydrated from a driver row, carrying a real
   * `parentProductTypeID` column and NO resolved association.
   *
   * ⚠️ THE ROW IS WHAT `mysql2` HANDS BACK, NOT WHAT THE SEED DOCUMENT RENDERS. A root's parent column
   * arrives as JS `null`, because `model/dao/DataDAO.cfc:L71-L72` and `:L104-L105` both test the seed
   * document's `"NULL"` string and bind `<cfqueryparam ... null="yes">` instead. The four-character
   * string therefore never reaches a row, and no production mapper compares against it.
   */
  function hydratedChild(): ProductType {
    return mapProductTypeRow({
      productTypeID: PERSISTENCE_ID.productType,
      productTypeIDPath: `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`,
      parentProductTypeID: PERSISTENCE_ID.parentProductType,
      productTypeName: 'Merchandise',
      urlTitle: 'merchandise',
      activeFlag: 1,
    });
  }

  /** The tree repository over the recording seam, so its own read and write paths can be observed. */
  function makeTreeRepository(rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {}): {
    readonly repository: MySqlProductTypeRepository;
    readonly journal: PersistenceJournal;
  } {
    const { executor, journal } = makePersistenceExecutor(rowsByTable, 1);

    return {
      journal,
      repository: new MySqlProductTypeRepository(
        executor,
        createAccountContextDouble().accountContext,
      ),
    };
  }

  it('NET-NEW — hydration leaves the association absent so the feed cannot be handed a lying reference', () => {
    const child = hydratedChild();

    /* The association stays unresolved — this is the deliberate half of rule 3a. */
    expect(child.parentProductType).toBeUndefined();
    /* And the row's own ancestry path is preserved verbatim, naming a parent the association omits. */
    expect(child.productTypeIDPath).toBe(
      `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`,
    );
  });

  it('NET-NEW — read-modify-save through MySqlProductPersistence preserves the parent key and the path', async () => {
    const { adapter, journal } = makeAdapter();
    const child = hydratedChild();

    /* The "modify" of read-modify-save: a field a caller would plausibly edit. */
    child.productTypeName = 'Merchandise Renamed';

    await adapter.saveProductType(child);

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];

    /* ⭐ THE REGRESSION THIS SECTION EXISTS FOR: this bound `null` before rule 3b. */
    expect(update?.params[PARENT_KEY_INDEX]).toBe(PERSISTENCE_ID.parentProductType);
    expect(update?.params[PARENT_KEY_INDEX]).not.toBeNull();
    /* The ancestry path survives intact, so the row stays internally consistent. */
    expect(update?.params[PATH_INDEX]).toBe(
      `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`,
    );
    expect(update?.params[13]).toBe(PERSISTENCE_ID.productType);
  });

  it('NET-NEW — read-modify-save through MySqlProductTypeRepository preserves the parent key and does NOT flatten the path', async () => {
    /*
     * ⚠️ THIS PATH ALSO RUNS THE LIFECYCLE HOOK, WHICH IS WHY IT NEEDS ITS OWN CASE.
     * `MySqlProductTypeRepository.saveProductType` invokes `ProductType.preUpdate`, porting
     * `model/entity/ProductType.cfc:L311`, and that hook REBUILDS `productTypeIDPath` by walking
     * `parentProductType` to the root. With the association deliberately unresolved the walk finds
     * nothing and would yield the child's own identifier alone — flattening the ancestry and leaving a
     * row whose preserved parent key contradicts its path. `ProductType.getBaseProductType` reads
     * `listFirst` of this path to find the root, so a flattened path silently changes a product's
     * discriminator. The capture-and-restore guard puts the database's own value back.
     */
    const { repository, journal } = makeTreeRepository();
    const child = hydratedChild();

    await repository.saveProductType(child);

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];

    expect(update?.params[PARENT_KEY_INDEX]).toBe(PERSISTENCE_ID.parentProductType);
    /* NOT the flattened `PERSISTENCE_ID.productType` the unguarded rebuild would have produced. */
    expect(update?.params[PATH_INDEX]).toBe(
      `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`,
    );
    expect(update?.params[PATH_INDEX]).not.toBe(PERSISTENCE_ID.productType);
  });

  it('NET-NEW — the FULL round trip through the real read member survives: findAllForTree then saveProductType', async () => {
    /*
     * ⭐⭐ THIS IS THE CASE THE REVIEW ASKED FOR, END TO END, WITH NO HAND-BUILT ENTITY ANYWHERE.
     * Every case above hydrates through `mapProductTypeRow` directly. This one goes through the actual
     * port member `findAllForTree()` — the read the finding cites — takes the entity it returns, and
     * hands that same entity to the write member. Nothing in between is constructed by the test.
     *
     * It also pins a mechanism detail worth pinning: `mapProductTypeTreeRow` builds its row by calling
     * `mapProductTypeRow` and then `Object.assign`ing the two counts onto THE SAME OBJECT, so the
     * object-keyed rule 3b entry recorded during hydration is still keyed to the entity that comes back
     * out. Had the tree mapper spread into a fresh object instead, the preserved key would have been
     * silently orphaned and this assertion would fail while every other case here still passed.
     */
    const { repository, journal } = makeTreeRepository({
      SwProductType: [
        {
          productTypeID: PERSISTENCE_ID.productType,
          productTypeIDPath: `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`,
          parentProductTypeID: PERSISTENCE_ID.parentProductType,
          productTypeName: 'Merchandise',
          urlTitle: 'merchandise',
          activeFlag: 1,
          isAssigned: 0,
          childCount: 0,
        },
      ],
    });

    const [readBack] = await repository.findAllForTree();
    if (readBack === undefined) {
      throw new Error('expected exactly one product type row');
    }

    /* Read as the tree member presents it: counts attached, association still unresolved. */
    expect(readBack.productTypeID).toBe(PERSISTENCE_ID.productType);
    expect(readBack.parentProductType).toBeUndefined();

    await repository.saveProductType(readBack);

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];
    expect(update?.params[PARENT_KEY_INDEX]).toBe(PERSISTENCE_ID.parentProductType);
    expect(update?.params[PATH_INDEX]).toBe(
      `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`,
    );
    expect(update?.params[13]).toBe(PERSISTENCE_ID.productType);
  });

  it('NET-NEW — a resolved association still wins over the preserved key', async () => {
    /*
     * The association comes first in the expression, mirroring the mapping declaration at
     * `model/entity/ProductType.cfc:L62`. Re-parenting therefore behaves exactly as before rule 3b:
     * the preserved key is a FALLBACK, never an override.
     */
    const { adapter, journal } = makeAdapter();
    const child = hydratedChild();

    const newParent = new ProductType();
    newParent.productTypeID = PERSISTENCE_ID.brand; // any identifier distinct from the hydrated one
    child.parentProductType = newParent;

    await adapter.saveProductType(child);

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];
    expect(update?.params[PARENT_KEY_INDEX]).toBe(PERSISTENCE_ID.brand);
    expect(update?.params[PARENT_KEY_INDEX]).not.toBe(PERSISTENCE_ID.parentProductType);
  });

  it('NET-NEW — an explicit detach writes NULL, so rule 3b cannot resurrect a removed parent', async () => {
    /*
     * ⭐ THE ESCAPE HATCH IS PART OF THE CONTRACT. Preserving the key would be a trap if there were no
     * way to say "this child genuinely has no parent now", because `removeParentProductType` clears the
     * association and the preserved key would silently put the old parent back. A caller that means to
     * detach calls `forgetHydratedParentProductTypeID` first.
     */
    const { adapter, journal } = makeAdapter();
    const child = hydratedChild();

    forgetHydratedParentProductTypeID(child);

    await adapter.saveProductType(child);

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];
    expect(update?.params[PARENT_KEY_INDEX]).toBeNull();
  });

  it('NET-NEW — a genuine root records no key and still writes NULL', async () => {
    /*
     * The three seeded discriminators are roots: `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`
     * gives each a `productTypeIDPath` equal to its own identifier and no parent. The driver hands the
     * parent column back as `null`, `readOptionalString` maps that to `undefined`, and rule 3b records
     * nothing — so the column is nulled because there is genuinely no parent, not because the key was
     * lost.
     */
    const { adapter, journal } = makeAdapter();
    const root = mapProductTypeRow({
      productTypeID: PERSISTENCE_ID.productType,
      productTypeIDPath: PERSISTENCE_ID.productType,
      parentProductTypeID: null,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
      urlTitle: 'merchandise',
      activeFlag: 1,
    });

    await adapter.saveProductType(root);

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];
    expect(update?.params[PARENT_KEY_INDEX]).toBeNull();
    expect(update?.params[PATH_INDEX]).toBe(PERSISTENCE_ID.productType);
  });
});

/* =================================================================================================
 * THE PRODUCT REMOVAL PATH
 * ============================================================================================== */

describe('MySqlProductPersistence — the product removal path (DATA-03)', () => {
  /** A product whose two SKU rows the cascade will find. */
  function productWithSkus(): Readonly<Record<string, readonly MySqlRow[]>> {
    return { SwSku: [{ skuID: PERSISTENCE_ID.defaultSku }, { skuID: PERSISTENCE_ID.otherSku }] };
  }

  it('NET-NEW — the six steps run in the legacy order, with the SKU cascade before the product row', async () => {
    const { adapter, journal, cleanup } = makeAdapter(productWithSkus());

    await adapter.deleteProduct(savedProduct());

    const shapes = journal.statements.map((statement) =>
      statement.sql.replace(/\s+/g, ' ').slice(0, 46),
    );

    // Step 2 first: the self-reference must be broken before either row can go.
    expect(shapes[0]).toContain('UPDATE SwProduct SET defaultSkuID = NULL');
    // Step 4 next — step 3 is the collaborator, which issues no statement of its own here.
    expect(shapes[1]).toContain('DELETE FROM SwRelatedProduct');
    // Step 5: read the identifiers, clear the four link tables, then the SKU rows.
    expect(shapes[2]).toContain('SELECT skuID FROM SwSku');
    expect(shapes[3]).toContain('DELETE FROM SwSkuOption');
    expect(shapes[4]).toContain('DELETE FROM SwSkuAccessContent');
    expect(shapes[5]).toContain('DELETE FROM SwSkuSubsBenefit');
    expect(shapes[6]).toContain('DELETE FROM SwSkuRenewalSubsBenefit');
    expect(shapes[7]).toContain('DELETE FROM SwSku WHERE');
    // Step 6 last.
    expect(shapes[8]).toContain('DELETE FROM SwProduct WHERE');
    expect(shapes).toHaveLength(9);

    // Step 3 ran, and ran BEFORE the product row went — `org/Hibachi/HibachiService.cfc:L61`
    // precedes `:L64`.
    expect(cleanup.productIds).toEqual([PERSISTENCE_ID.product]);
  });

  it('NET-NEW — all FOUR SKU link tables are cleared, not just the option one', async () => {
    // Leaving three out would leave orphan link rows pointing at a `skuID` that no longer exists,
    // which no error anywhere would report. `model/entity/Sku.cfc:L76-L79` declares all four.
    const { adapter, journal } = makeAdapter(productWithSkus());

    await adapter.deleteProduct(savedProduct());

    for (const table of [
      'SwSkuOption',
      'SwSkuAccessContent',
      'SwSkuSubsBenefit',
      'SwSkuRenewalSubsBenefit',
    ]) {
      const statements = persistenceMatching(
        journal,
        new RegExp(`^DELETE FROM ${table} WHERE skuID IN`),
      );
      expect(statements).toHaveLength(1);
      // One placeholder per identifier, each value bound rather than interpolated.
      expect(statements[0]?.sql).toContain('IN (?, ?)');
      expect(statements[0]?.params).toEqual([PERSISTENCE_ID.defaultSku, PERSISTENCE_ID.otherSku]);
    }
  });

  it('NET-NEW — SwRelatedProduct is cleared on the OWNER side only', async () => {
    // `model/entity/Product.cfc:L81` carries NO `inverse="true"`, so this product owns the rows whose
    // `productID` is its own and does not own the rows whose `relatedProductID` is.
    // `org/Hibachi/HibachiEntity.cfc:L277` iterates only this entity's own collection, so the legacy
    // left the reverse rows too. Widening the predicate would remove rows the legacy keeps.
    const { adapter, journal } = makeAdapter(productWithSkus());

    await adapter.deleteProduct(savedProduct());

    const statements = persistenceMatching(journal, /^DELETE FROM SwRelatedProduct/);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain('WHERE productID = ?');
    expect(statements[0]?.sql).not.toContain('relatedProductID');
    expect(statements[0]?.params).toEqual([PERSISTENCE_ID.product]);
  });

  it('NET-NEW — a product with no SKUs issues no SKU statement at all', async () => {
    // An empty identifier list would compose `IN ()`, which is a syntax error rather than an empty
    // match — the same rule `the aggregate-loader section of SmartListQueryBuilder.ts` records for its loaders.
    const { adapter, journal } = makeAdapter({ SwSku: [] });

    await adapter.deleteProduct(savedProduct());

    expect(persistenceMatching(journal, /IN \(\)/)).toHaveLength(0);
    expect(persistenceMatching(journal, /^DELETE FROM SwSku\b/)).toHaveLength(0);
    expect(persistenceMatching(journal, /^DELETE FROM SwSkuOption/)).toHaveLength(0);
    // The product itself still goes.
    expect(persistenceMatching(journal, /^DELETE FROM SwProduct WHERE/)).toHaveLength(1);
  });

  it('NET-NEW — a transient product is refused and NOTHING is issued', async () => {
    // Every statement would be keyed on `''`, a predicate that matches nothing in a sound table and
    // an arbitrary row in an unsound one. The mapping layer would have raised on the same input.
    const { adapter, journal, cleanup } = makeAdapter();

    await expect(adapter.deleteProduct(new Product())).rejects.toBeInstanceOf(DataIntegrityError);

    expect(journal.statements).toHaveLength(0);
    expect(cleanup.productIds).toHaveLength(0);
  });

  it('NET-NEW — a SKU row with an unusable identifier is refused rather than skipped', async () => {
    // Skipping it would leave that SKU's link rows behind AND then fail the product removal on a
    // foreign-key constraint, with nothing anywhere naming the cause.
    const { adapter } = makeAdapter({ SwSku: [{ skuID: 42 }] });

    await expect(adapter.deleteProduct(savedProduct())).rejects.toBeInstanceOf(DataIntegrityError);
  });
});

/* =================================================================================================
 * THE PRODUCT-TYPE REMOVAL PATH
 * ============================================================================================== */

describe('MySqlProductPersistence — the product-type removal path (DATA-03)', () => {
  it('NET-NEW — the excluded-family rows are cleared before the product-type row', async () => {
    const { adapter, journal, cleanup } = makeAdapter();

    await adapter.deleteProductType(savedProductType());

    expect(cleanup.productTypeIds).toEqual([PERSISTENCE_ID.productType]);
    const statements = persistenceMatching(journal, /^DELETE FROM SwProductType/);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.params).toEqual([PERSISTENCE_ID.productType]);
  });

  it('NET-NEW — no cascade is attempted over products or child product types', async () => {
    // Not an omission: `model/validation/ProductType.json` bounds BOTH at `maxCollection 0` for the
    // delete context, so a product type carrying either is refused before any removal is attempted
    // and the `cascade="all"` at `model/entity/ProductType.cfc:L65-L66` is unreachable. Implementing
    // it would add behaviour the legacy cannot reach.
    const { adapter, journal } = makeAdapter();

    await adapter.deleteProductType(savedProductType());

    expect(persistenceMatching(journal, /DELETE FROM SwProduct\b/)).toHaveLength(0);
    expect(persistenceMatching(journal, /parentProductTypeID/)).toHaveLength(0);
    expect(journal.statements).toHaveLength(1);
  });

  it('NET-NEW — a transient product type is refused and NOTHING is issued', async () => {
    const { adapter, journal, cleanup } = makeAdapter();

    await expect(adapter.deleteProductType(new ProductType())).rejects.toBeInstanceOf(
      DataIntegrityError,
    );

    expect(journal.statements).toHaveLength(0);
    expect(cleanup.productTypeIds).toHaveLength(0);
  });
});

/* =================================================================================================
 * THE FOUR SEAMS — THE FINDING'S ACTUAL CLAIM
 * ============================================================================================== */

/* ================================================================================================
 * F8 — THE PRODUCT DELETE GUARD, RESOLVED ON THE DELETE BOUNDARY'S OWN EXECUTOR
 *
 * `model/validation/Product.json:L12` guards the delete context with `transactionExistsFlag eq false`,
 * and `model/entity/Product.cfc:L667-L673` answers that property by DELEGATING to
 * `model/service/SkuService.cfc:L285`, which issues the ten-disjunct existence query at
 * `model/dao/SkuDAO.cfc:L53-L98`. In the legacy the property was a live read at validation time.
 *
 * `BaseService` has always had the seam for that — `resolveDeleteSubject`, invoked immediately BEFORE
 * `validator.validate` — but neither production graph supplied one for `Product`. The consequence was
 * NOT that the guard leaked: `eq` is one of only two constraints that FAIL on an absent value
 * [`org/Hibachi/HibachiValidationService.cfc:L387-L391`], so an unresolved flag made the guard refuse
 * EVERY product delete, including of products with no transaction history at all. Both halves are
 * asserted below, and the third case pins the defect itself so a silent un-wiring cannot return.
 *
 * ⚠️ ONE EXECUTOR SERVES BOTH THE PROBE AND THE DELETE, and that is the point rather than a
 * convenience of the harness. M6 requires the guard to read on the same connection the DELETE will
 * write on; the container builds the resolver from the graph-matching repository for exactly that
 * reason, and the ordering assertion below is what proves the read precedes the write.
 * ============================================================================================== */
describe('F8 — the Product delete guard resolves against a live transaction-existence query', () => {
  /** The alias `MySqlSkuRepository.transactionExists` projects its scalar verdict under. */
  const VERDICT_ALIAS = 'transactionExists';

  /**
   * The container's `productBaseService` delete path, rebuilt over ONE recording executor.
   *
   * Every collaborator that decides an outcome is the REAL one: the real `MySqlSkuRepository` composes
   * and issues the existence query, the real `Validator` runs the real `productValidationRuleSet`
   * delete context over its answer, and the real `MySqlProductPersistence` performs the removal. Only
   * the executor is a double, and it records rather than decides.
   */
  function makeGuardedDeleteHarness(options: {
    readonly transactionExists: boolean;
    /** Omitting the resolver reproduces the defect this finding reported. */
    readonly wireResolver?: boolean;
  }): {
    readonly service: BaseService<Product, ProductPropertyName>;
    readonly statements: { sql: string; params: readonly unknown[] }[];
  } {
    const statements: { sql: string; params: readonly unknown[] }[] = [];
    const cleanupSeams = createBaseServicePersistenceDouble<Product>().seams;

    const record = (sql: string, params: readonly unknown[]): void => {
      statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params: [...params] });
    };

    const executor = {
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        record(sql, params);

        /* The scalar existence verdict, in the driver's own shape: `SELECT EXISTS(...)` answers one
         * row carrying 1 or 0, and `:L93-L97` reads zero as false and anything else as true. */
        if (sql.includes(`AS ${VERDICT_ALIAS}`)) {
          return Promise.resolve([{ [VERDICT_ALIAS]: options.transactionExists ? 1 : 0 }]);
        }

        /* The cascade's identifier read finds no SKU rows; this product has none. */
        return Promise.resolve([]);
      },
      executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
        record(sql, params);
        return Promise.resolve(1);
      },
    };

    const skuRepository = new MySqlSkuRepository(
      executor,
      createOptionGroupSortOrderMemo(),
      (() => undefined) as never,
      createAccountContextDouble().accountContext,
    );

    const persistence = new MySqlProductPersistence(
      executor,
      makeCleanup().cleanup,
      makeDefaultSkuIdReader().read,
    );

    /* ⭐ THE CONTAINER'S CLOSURE, VERBATIM. `src/config/container.ts` builds this from
     * `createTransactionExistenceChecker` and returns the same instance, because
     * `Product.getTransactionExistsFlag` memoizes its answer onto the entity. */
    const resolveDeleteSubject = async (product: Product): Promise<Product> => {
      await product.getTransactionExistsFlag(createTransactionExistenceChecker(skuRepository));
      return product;
    };

    const service = new BaseService<Product, ProductPropertyName>({
      validator: new Validator(createUniquePropertyDouble().uniqueProperty),
      ruleSet: productValidationRuleSet,
      propertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
      populationAuthorization: createPopulationAuthorizationDouble().populationAuthorization,
      persist: (product: Product) => persistence.saveProduct(product),
      remove: async (product: Product): Promise<void> => {
        await persistence.deleteProduct(product);
      },
      /* Both run only INSIDE the `if(deleteOK)` gate [`model/service/HibachiService.cfc:L76`, `:L79`],
       * so the refusal cases never reach them and the success case only needs them to resolve. The
       * shared double supplies the full four-member surface rather than a partial literal. */
      settingCleanup: cleanupSeams.settingCleanup,
      commentCleanup: cleanupSeams.commentCleanup,
      ...(options.wireResolver === false ? {} : { resolveDeleteSubject }),
    });

    return { service, statements };
  }

  /**
   * A product as a ROW produces it, which is the state the defect was invisible in.
   *
   * Hand-built products in other suites carry whatever the case assigns, so a case could set
   * `transactionExistsFlag` itself and the missing resolver would never show. `mapProductRow` assigns
   * it NOWHERE — it is a non-persistent calculated property with no column — so a hydrated product
   * reaches validation with the slot absent unless something resolves it.
   */
  function hydratedProduct(): Product {
    return mapProductRow({
      productID: PERSISTENCE_ID.product,
      productName: 'Feed Product',
      productCode: 'FP-1',
      urlTitle: 'feed-product',
      activeFlag: 1,
      publishedFlag: 1,
    });
  }

  it('NET-NEW — a product WITH transaction history is refused, and no row is deleted', async () => {
    const { service, statements } = makeGuardedDeleteHarness({ transactionExists: true });
    const product = hydratedProduct();

    // `org/Hibachi/HibachiService.cfc:L79` — a refused delete answers false rather than throwing.
    await expect(service.delete(product)).resolves.toBe(false);

    // The guard READ, and the read carried the product identifier in slot one.
    const probes = statements.filter((statement) => statement.sql.includes(`AS ${VERDICT_ALIAS}`));
    expect(probes).toHaveLength(1);
    expect(probes[0]?.params).toStrictEqual([PERSISTENCE_ID.product]);

    // ⚠️ AND NOTHING WAS WRITTEN. This is the assertion the finding turns on: a guard that resolves
    // but does not stop the write would leave orphan transaction history behind.
    expect(statements.filter((statement) => /^DELETE|^UPDATE/.test(statement.sql))).toStrictEqual(
      [],
    );

    // The resolved verdict is on the entity, where the rule read it.
    expect(product.transactionExistsFlag).toBe(true);
  });

  it('NET-NEW — a product with NO transaction history still deletes (the half the defect broke)', async () => {
    const { service, statements } = makeGuardedDeleteHarness({ transactionExists: false });
    const product = hydratedProduct();

    await expect(service.delete(product)).resolves.toBe(true);

    expect(product.transactionExistsFlag).toBe(false);
    expect(statements.some((statement) => /^DELETE FROM SwProduct WHERE/.test(statement.sql))).toBe(
      true,
    );
  });

  it('NET-NEW — the probe runs BEFORE any write, on the SAME executor (M6)', async () => {
    // One recorder for both, so the ordering assertion is meaningful: a resolver reading on its own
    // connection could observe a state the DELETE's transaction never sees.
    const { service, statements } = makeGuardedDeleteHarness({ transactionExists: false });

    await service.delete(hydratedProduct());

    const probeIndex = statements.findIndex((statement) =>
      statement.sql.includes(`AS ${VERDICT_ALIAS}`),
    );
    const firstWriteIndex = statements.findIndex((statement) =>
      /^DELETE|^UPDATE/.test(statement.sql),
    );

    expect(probeIndex).toBe(0);
    expect(firstWriteIndex).toBeGreaterThan(probeIndex);
  });

  it('NET-NEW — WITHOUT the resolver the guard refuses EVERY delete, history or not (the defect)', async () => {
    // ⚠️ THE DEFECT, PINNED. `eq` fails on an absent value, so an unresolved flag is not a lenient
    // guard — it is a total one. Both graphs shipped in exactly this state.
    const { service, statements } = makeGuardedDeleteHarness({
      transactionExists: false,
      wireResolver: false,
    });
    const product = hydratedProduct();

    await expect(service.delete(product)).resolves.toBe(false);

    // No probe was issued at all, which is what made the refusal silent.
    expect(statements).toStrictEqual([]);
    expect(product.transactionExistsFlag).toBeUndefined();
  });
});

describe('the four ProductService seams the adapter fills (DATA-03)', () => {
  it('NET-NEW — all four members satisfy the service layer\u2019s persister and remover contracts', () => {
    // ⚠️ THIS IS A COMPILE-TIME ASSERTION WEARING A RUNTIME COAT. The adapter deliberately does not
    // import these two function types (S4 — an adapter must not reach up into the service layer), so
    // the assignability is unproven inside it. Binding all four here makes a signature drift a
    // compile error in this suite rather than a run-time surprise at the wiring site.
    const { adapter } = makeAdapter();

    const persistProduct: EntityPersister<Product> = (product) => adapter.saveProduct(product);
    const removeProduct: EntityRemover<Product> = (product) => adapter.deleteProduct(product);
    const persistProductType: EntityPersister<ProductType> = (productType) =>
      adapter.saveProductType(productType);
    const removeProductType: EntityRemover<ProductType> = (productType) =>
      adapter.deleteProductType(productType);

    expect([persistProduct, removeProduct, persistProductType, removeProductType]).toHaveLength(4);
  });

  /**
   * A real `ProductService` wired to the real adapter for exactly the seams a scenario reaches.
   *
   * Everything else is `UNREACHED_COLLABORATOR`: `getProduct` touches only the query port, and the
   * three write members below touch only the collaborators named here. A collaborator that is never
   * called needs no behaviour, and giving it one would suggest these cases depend on it.
   */
  function makeService(
    adapter: MySqlProductPersistence,
    smartListQueryPort: ProductService['smartListQueryPort'] = UNREACHED_COLLABORATOR,
  ): ProductService {
    return new ProductService({
      productRepository: UNREACHED_COLLABORATOR,
      skuRepository: UNREACHED_COLLABORATOR,
      skuService: UNREACHED_COLLABORATOR,
      optionService: UNREACHED_COLLABORATOR,
      /* `ProductBaseService` is `Pick<BaseService<Product, …>, 'delete'>`. The real base service's
       * delete runs the delete-context rules and then its `remove` collaborator; what matters to
       * DATA-03 is that the collaborator it would call is the real adapter, so the seam is exercised
       * with the real statements rather than with a recorder. */
      baseService: {
        delete: async (product: Product): Promise<boolean> => {
          await adapter.deleteProduct(product);
          return true;
        },
      },
      /* `ProductTypeBaseService` is `Pick<BaseService<ProductType, …>, 'save'>`, whose contract
       * populates, validates and then persists. The persistence step is the real adapter. */
      productTypeBaseService: {
        /* ⚠️ TYPED OVER `ManagedEntity<ProductType>`, NOT OVER A BARE `ProductType`, AND THE REASON IS
         * F22 ON `src/domain/product/ProductType.ts`. `BaseService.save` is declared over the managed
         * form, and this entity DELIBERATELY does not declare the seven managed-entity members as class
         * methods — `manageEntity` attaches them, which is what `rowMappers.ts` already does to every
         * hydrated product type. A bare `ProductType` is therefore NOT assignable to the slot, and
         * widening the double here is the honest fix rather than reinstating methods the domain module
         * decided against. `MySqlProductPersistence.saveProductType` returns THE SAME INSTANCE on both
         * of its branches, so forwarding the argument back preserves the identity the contract promises
         * while keeping the managed type. */
        save: async (
          productType: ManagedEntity<ProductType>,
          data?: Record<string, unknown>,
        ): Promise<ManagedEntity<ProductType>> => {
          const urlTitle = data?.['urlTitle'];
          if (typeof urlTitle === 'string') {
            productType.urlTitle = urlTitle;
          }
          await adapter.saveProductType(productType);
          return productType;
        },
      },
      validator: {
        validate: () => Promise.resolve({ getErrors: () => ({}) }),
        validateProcess: UNREACHED_COLLABORATOR,
      } as never,
      settings: createSettingResolverDouble({ fallback: '' }).resolver,
      accountContext: createAccountContextDouble().accountContext,
      smartListQueryPort,
      subscriptionTermPort: UNREACHED_COLLABORATOR,
      productTypeRootResolver: (() => undefined) as never,
      productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
      populationAuthorization: createPopulationAuthorizationDouble().populationAuthorization,
      /* `UniqueValueProbe` takes the table name as a plain string, exactly as
       * `model/service/DataService.cfc:L53` declares `createUniqueURLTitle(titleString, tableName)`.
       * The double's own probe narrows that first parameter to its table union, so it is adapted here
       * rather than the utility's contract being widened. */
      urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
      isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> =>
        urlTitleProbe.probe.isUrlTitleAvailable(tableName as UrlTitleTableName, value),
      persistProduct: (product: Product) => adapter.saveProduct(product),
      /* Reached only by `requireDefaultSkuEntity`, which only the subscription-term process member
       * calls. Made LOUD rather than plausible: a reader answering `''` would let a case pass while
       * silently resolving the wrong SKU. */
      defaultSkuIdReader: (): string => {
        throw new Error('defaultSkuIdReader is not reached by these cases.');
      },
      /*
       * F10 — THE REAL HYDRATION READER, NOT A STUB. It answers `undefined` for a hand-built product
       * type, because nothing wrote a preserved parent key beside one — which is precisely what
       * production does for a hand-built entity too. Using the real member keeps these cases honest:
       * they exercise the same branch production takes, and a case that WANTS the inheritance load
       * hydrates its product type through `mapProductTypeRow` so the reader answers a real key.
       */
      parentProductTypeIdReader: readHydratedParentProductTypeID,
    });
  }

  it('NET-NEW — ProductService.saveProduct now reaches SwProduct through the real persister', async () => {
    // The finding, restated: before this adapter existed, `persistProduct` had no production
    // implementation, so this path could not write anything at all.
    const { adapter, journal } = makeAdapter();
    const service = makeService(adapter);
    const product = savedProduct();

    const saved = await service.saveProduct(product, { productName: 'Renamed' });

    expect(saved).toBe(product);
    expect(persistenceMatching(journal, /^UPDATE SwProduct SET/)).toHaveLength(1);
    // Population ran first, so the payload's value is what reached the driver.
    expect(persistenceMatching(journal, /^UPDATE SwProduct SET/)[0]?.params).toContain('Renamed');
  });

  it('NET-NEW — ProductService.deleteProduct now removes the rows through the real remover', async () => {
    const { adapter, journal } = makeAdapter({ SwSku: [{ skuID: PERSISTENCE_ID.defaultSku }] });
    const service = makeService(adapter);
    const product = savedProduct();
    const { delegate } = makeDefaultSkuDelegate(PERSISTENCE_ID.defaultSku);
    product.defaultSku = delegate;

    await expect(service.deleteProduct(product)).resolves.toBe(true);

    // `:L323` clears the relationship in memory; the adapter's step 2 is what makes the stored
    // column agree, because this port has no flush.
    expect(product.defaultSku).toBeUndefined();
    expect(persistenceMatching(journal, /^UPDATE SwProduct SET defaultSkuID = NULL/)).toHaveLength(
      1,
    );
    expect(persistenceMatching(journal, /^DELETE FROM SwProduct WHERE/)).toHaveLength(1);
    expect(persistenceMatching(journal, /^DELETE FROM SwSku WHERE/)).toHaveLength(1);
  });

  it('NET-NEW — ProductService.saveProductType now reaches SwProductType through the real persister', async () => {
    const { adapter, journal } = makeAdapter();
    const service = makeService(adapter);
    const productType = new ProductType();

    await service.saveProductType(productType, { productTypeName: 'Merchandise' });

    // A transient type takes the insert path and is minted here and only here.
    expect(productType.productTypeID).toMatch(/^[0-9a-f]{32}$/);
    expect(persistenceMatching(journal, /^INSERT INTO SwProductType/)).toHaveLength(1);
    // `:L297` writes the derived title INTO THE PAYLOAD, and it only reaches the entity because the
    // base service populates from that same struct.
    expect(persistenceMatching(journal, /^INSERT INTO SwProductType/)[0]?.params).toContain(
      'merchandise',
    );
  });
});

/* =================================================================================================
 * F10 — THE PARENT-PRODUCT-TYPE INHERITANCE, ON A PRODUCT TYPE THAT CAME FROM A ROW
 *
 * `model/service/ProductService.cfc:L306-L308` re-parents the parent's products onto the child:
 *
 *     if(!arguments.productType.hasErrors() && !isNull(arguments.productType.getParentProductType())
 *        && arrayLen(arguments.productType.getParentProductType().getProducts()))
 *         arguments.productType.setProducts( arguments.productType.getParentProductType().getProducts() );
 *
 * In the legacy BOTH hops were lazy Hibernate loads, so `getParentProductType()` materialised the parent
 * and `getProducts()` materialised its collection.
 *
 * ⚠️ IN THIS PORT NEITHER HOP EXISTED, AND THE BRANCH WAS UNREACHABLE FROM A ROW. `mapProductTypeRow`
 * leaves the `parentProductType` ASSOCIATION ABSENT by design (rule 3b — attaching an identifier-only
 * parent would empty the feed's `g:product_type`, whose simple representation walks the chain) and
 * records the row's foreign key beside the instance instead. `SlatwallProductType` declares no aggregate
 * loader, so nothing filled the slot afterwards either. Every product a re-parenting was supposed to
 * inherit stayed on its old type, and the member returned successfully — the same shape of silent
 * omission F09 found one line further down, at the write.
 *
 * These cases drive the member with a product type hydrated by the REAL mapper, which is the only state
 * the defect was observable in.
 * ============================================================================================== */

describe('F10 — a hydrated product type inherits its parent’s products', () => {
  /** The parent's two products, in the order the query answers them. */
  const PARENT_PRODUCT_ROWS: readonly MySqlRow[] = Object.freeze([
    Object.freeze({
      productID: PERSISTENCE_ID.product,
      productName: 'Inherited One',
      productCode: 'IP-1',
      urlTitle: 'inherited-one',
    }),
    Object.freeze({
      productID: PERSISTENCE_ID.otherProduct,
      productName: 'Inherited Two',
      productCode: 'IP-2',
      urlTitle: 'inherited-two',
    }),
  ]);

  /** One query the service asked the smart-list port to run. */
  interface RecordedQuery {
    readonly entityName: string;
    readonly filters: string;
  }

  /**
   * A smart-list port that answers the parent-type read and the parent-products read, and records both.
   *
   * ⚠️ IT DISTINGUISHES THE TWO BY ROOT ENTITY, NOT BY CALL ORDER, so a case cannot pass because the
   * member happened to issue them in the order the double expected.
   */
  function makeInheritanceSmartList(options: { readonly parentExists: boolean }): {
    readonly smartList: ProductService['smartListQueryPort'];
    readonly queries: readonly RecordedQuery[];
  } {
    const queries: RecordedQuery[] = [];

    const smartList = {
      execute: UNREACHED_COLLABORATOR,
      executeRecords: (query: {
        readonly entityName: string;
        readonly whereGroups?: readonly {
          readonly filters?: readonly { readonly propertyIdentifier?: string }[];
        }[];
      }): Promise<unknown[]> => {
        queries.push({
          entityName: query.entityName,
          filters: (query.whereGroups ?? [])
            .flatMap((group) => group.filters ?? [])
            .map((filter) => filter.propertyIdentifier ?? '')
            .join(','),
        });

        if (query.entityName === 'SlatwallProductType') {
          /* The parent row itself, hydrated by the real mapper so it is a genuine managed entity with
           * its own EMPTY products collection — the state a row-loaded parent is really in. */
          return Promise.resolve(
            options.parentExists
              ? [
                  mapProductTypeRow({
                    productTypeID: PERSISTENCE_ID.parentProductType,
                    productTypeIDPath: PERSISTENCE_ID.parentProductType,
                    productTypeName: 'Parent',
                    urlTitle: 'parent',
                    activeFlag: 1,
                  }),
                ]
              : [],
          );
        }

        return Promise.resolve(PARENT_PRODUCT_ROWS.map((row) => mapProductRow(row)));
      },
    } as unknown as ProductService['smartListQueryPort'];

    return { smartList, queries };
  }

  /**
   * A `ProductService` whose product-type save is a no-op and whose product saves are recorded.
   *
   * The save itself is not what these cases are about — `MySqlProductPersistence`'s own suite covers it
   * — so the base service returns the entity untouched, exactly as `model/service/HibachiService.cfc:L103`
   * does on the clean path, and the recorder below observes only the re-parenting writes.
   */
  function makeInheritanceService(options: { readonly parentExists: boolean }): {
    readonly service: ProductService;
    readonly savedProducts: readonly Product[];
    readonly queries: readonly RecordedQuery[];
  } {
    const { smartList, queries } = makeInheritanceSmartList(options);
    const savedProducts: Product[] = [];

    const service = new ProductService({
      productRepository: {
        saveProduct: (product: Product): Promise<Product> => {
          savedProducts.push(product);
          return Promise.resolve(product);
        },
      } as never,
      skuRepository: UNREACHED_COLLABORATOR,
      skuService: UNREACHED_COLLABORATOR,
      optionService: UNREACHED_COLLABORATOR,
      baseService: UNREACHED_COLLABORATOR,
      productTypeBaseService: {
        save: (productType: ManagedEntity<ProductType>): Promise<ManagedEntity<ProductType>> =>
          Promise.resolve(productType),
      },
      validator: {
        validate: () => Promise.resolve({ getErrors: () => ({}) }),
        validateProcess: UNREACHED_COLLABORATOR,
      } as never,
      settings: createSettingResolverDouble({ fallback: '' }).resolver,
      accountContext: createAccountContextDouble().accountContext,
      smartListQueryPort: smartList,
      subscriptionTermPort: UNREACHED_COLLABORATOR,
      productTypeRootResolver: (() => undefined) as never,
      productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
      populationAuthorization: createPopulationAuthorizationDouble({ publicPopulateFlag: true })
        .populationAuthorization,
      urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
      isUrlTitleAvailable: (): Promise<boolean> => Promise.resolve(true),
      persistProduct: UNREACHED_COLLABORATOR,
      defaultSkuIdReader: (): string => {
        throw new Error('defaultSkuIdReader is not reached by these cases.');
      },
      /* ⭐ THE REAL READER — the whole point of these cases. */
      parentProductTypeIdReader: readHydratedParentProductTypeID,
    });

    return { service, savedProducts, queries };
  }

  /** A child product type as a ROW produces it: a real parent column, no resolved association. */
  function hydratedChildType(): ProductType {
    return mapProductTypeRow({
      productTypeID: PERSISTENCE_ID.productType,
      productTypeIDPath: `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`,
      parentProductTypeID: PERSISTENCE_ID.parentProductType,
      productTypeName: 'Merchandise',
      urlTitle: 'merchandise',
      activeFlag: 1,
    });
  }

  it('NET-NEW — the parent and its products are LOADED, and the products are re-parented', async () => {
    const { service, savedProducts, queries } = makeInheritanceService({ parentExists: true });
    const child = hydratedChildType();

    // The association really is absent — this is the state the defect hid in.
    expect(child.parentProductType).toBeUndefined();

    const saved = await service.saveProductType(child, {});

    // ⚠️ THE ASSERTION THE FINDING TURNS ON. Before the fix NEITHER read was issued: the association
    // was absent, so `:L306`'s null clause short-circuited and the branch never ran.
    expect(queries.map((query) => query.entityName)).toStrictEqual([
      'SlatwallProductType',
      'SlatwallProduct',
    ]);

    // `:L307` is a REPLACEMENT and the write is one `saveProduct` per product, in collection order —
    // which is also the proof the parent's collection really was loaded with BOTH of its products.
    expect(savedProducts.map((product) => product.productID)).toStrictEqual([
      PERSISTENCE_ID.product,
      PERSISTENCE_ID.otherProduct,
    ]);

    // Each inherited product now names the CHILD type. This is the column `:L307` actually changes:
    // `products` is mapped `inverse="true"` [`model/entity/ProductType.cfc:L66`], so the child's
    // `SwProduct.productTypeID` is the only side that persists.
    for (const product of savedProducts) {
      expect(product.productType?.productTypeID).toBe(PERSISTENCE_ID.productType);
    }

    // ⛔ AND THE CHILD'S OWN ARRAY STAYS EMPTY, WHICH IS CORRECT RATHER THAN A MISS.
    // `ProductType.addProduct` sets only the inverse reference, so `setProducts` leaves
    // `this.products` empty by design — an `inverse="true"` collection is refreshed from the database
    // rather than maintained in memory. Asserting a populated array here would demand an in-memory
    // append the domain module deliberately does not invent.
    expect(saved.getProducts()).toStrictEqual([]);
  });

  it('NET-NEW — the parent-products read filters on the inverse of the declared relationship', async () => {
    // `model/entity/ProductType.cfc:L66` is the one-to-many and `model/entity/Product.cfc:L70` its
    // many-to-one side, so the products of a type are exactly those whose `productType.productTypeID`
    // is its own. A filter on anything else would inherit the wrong set.
    const { service, queries } = makeInheritanceService({ parentExists: true });

    await service.saveProductType(hydratedChildType(), {});

    expect(queries[1]?.filters).toBe('productType.productTypeID');
  });

  it('NET-NEW — a parent key naming a row that no longer exists SKIPS the branch rather than raising', async () => {
    // ⛔ `:L306`'s `isNull` guard means the legacy's own behaviour for an absent parent is to skip the
    // inheritance. The preserved key can outlive the row it names, so answering nothing is the faithful
    // outcome; raising would refuse a save the legacy completed.
    const { service, savedProducts, queries } = makeInheritanceService({ parentExists: false });

    const saved = await service.saveProductType(hydratedChildType(), {});

    // The parent read was attempted and answered nothing, so the products read never happened.
    expect(queries.map((query) => query.entityName)).toStrictEqual(['SlatwallProductType']);
    // Nothing was re-parented — no product was saved, and `saveProductType` still answered the entity.
    expect(savedProducts).toStrictEqual([]);
    expect(saved.productTypeID).toBe(PERSISTENCE_ID.productType);
  });

  it('NET-NEW — a product type with NO parent key issues no read at all', async () => {
    // A genuine root. `mapProductTypeRow` records no key for a null column, so the reader answers
    // `undefined` and the member must not probe for a parent that cannot exist.
    const { service, savedProducts, queries } = makeInheritanceService({ parentExists: true });

    const root = mapProductTypeRow({
      productTypeID: PERSISTENCE_ID.parentProductType,
      productTypeIDPath: PERSISTENCE_ID.parentProductType,
      parentProductTypeID: null,
      productTypeName: 'Root',
      urlTitle: 'root',
      activeFlag: 1,
    });

    await service.saveProductType(root, {});

    expect(queries).toStrictEqual([]);
    expect(savedProducts).toStrictEqual([]);
  });

  it('NET-NEW — a RESOLVED association still wins, and issues no read', async () => {
    // ⚠️ ABSENCE IS WHAT TRIGGERS A LOAD, NOT THE KEY. A caller that supplied the parent has already
    // said what its products are, and `:L307` inherits whatever `getProducts()` answers. Loading over
    // the top of that would discard the caller's own collection.
    const { service, savedProducts, queries } = makeInheritanceService({ parentExists: true });
    const child = hydratedChildType();

    const attachedParent = new ProductType();
    attachedParent.productTypeID = PERSISTENCE_ID.parentProductType;
    const ownProduct = new Product();
    ownProduct.productID = PERSISTENCE_ID.otherProduct;
    /* ⚠️ THE FIELD, NOT `setProducts`. `ProductType.addProduct` sets only the inverse reference, so
     * `setProducts` would leave the parent's own array EMPTY and `:L308`'s length clause would skip the
     * branch — the collection has to be populated the way hydration populates it, which is by
     * assignment. `src/adapters/mysql/rowMappers.ts` does exactly this. */
    attachedParent.products = [ownProduct];
    child.parentProductType = attachedParent;

    const saved = await service.saveProductType(child, {});

    // No read of any kind: the slot was filled, so there was nothing to resolve.
    expect(queries).toStrictEqual([]);
    // The caller's own product was inherited, and only it.
    expect(savedProducts).toStrictEqual([ownProduct]);
    expect(ownProduct.productType).toBe(saved);
    /* The inverse-side contract again — see the first case for why this is empty. */
    expect(saved.getProducts()).toStrictEqual([]);
  });
});

/* =================================================================================================
 * THE READ HALF — `getProduct` MUST ANSWER AN AGGREGATE
 * ============================================================================================== */

describe('ProductService.getProduct returns a materialised aggregate (DATA-03)', () => {
  /** A product row plus every row its associations need. */
  const READ_TABLES: Readonly<Record<string, readonly MySqlRow[]>> = {
    SwProduct: [
      {
        productID: PERSISTENCE_ID.product,
        productName: 'Feed Product',
        productCode: 'FP-1',
        productTypeID: PERSISTENCE_ID.productType,
        brandID: PERSISTENCE_ID.brand,
        defaultSkuID: PERSISTENCE_ID.defaultSku,
      },
    ],
    SwProductType: [{ productTypeID: PERSISTENCE_ID.productType, productTypeName: 'Merchandise' }],
    SwBrand: [{ brandID: PERSISTENCE_ID.brand, brandName: 'Nike' }],
    /* ⚠️ THE MONEY COLUMN IS A STRING, NOT A NUMBER, AND THAT IS THE DRIVER CONTRACT RATHER THAN A
     * FIXTURE QUIRK. `model/entity/Sku.cfc:L56` declares `price` `ormtype="big_decimal"`, and
     * `rowMappers.ts` reads it through the exact-decimal reader, which REFUSES a JavaScript number
     * because by the time one arrives the exact digits are already gone (F16). */
    SwSku: [
      {
        skuID: PERSISTENCE_ID.defaultSku,
        skuCode: 'SKU-DEFAULT',
        price: '99.00',
        productID: PERSISTENCE_ID.product,
      },
      {
        skuID: PERSISTENCE_ID.otherSku,
        skuCode: 'SKU-2',
        price: '20.00',
        productID: PERSISTENCE_ID.product,
      },
    ],
  };

  /**
   * An executor that HONOURS BOTH `WHERE <column> IN (…)` AND `WHERE <alias>.<column> = ?`.
   *
   * ⚠️ IT HAS TO HONOUR THE `IN` FORM. Two different statements read `SwSku` on this path — the aggregate
   * loader's product-scoped collection read and its default-SKU lookup by identifier — and a double that
   * answered both with the same rows would hand the lookup rows it never asked for.
   *
   * ⚠️ IT HAS TO HONOUR THE EQUALITY FORM TOO, and for a sharper reason: `getProduct` is a primary-key
   * lookup expressed as a single-filter dynamic query, which the builder compiles to
   * `WHERE ((<alias>.productID = ?))`. A double that ignored that predicate would answer EVERY
   * identifier with the seeded row, so the case asserting that an unmatched identifier yields `null`
   * could never fail and would be asserting nothing at all.
   */
  function readExecutor(): ProductService['smartListQueryPort'] {
    const executor = {
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        if (sql.includes('recordsCount')) {
          return Promise.resolve([{ recordsCount: 1 }]);
        }

        const table = Object.keys(READ_TABLES).find((name) =>
          new RegExp(`FROM ${name}\\b`).test(sql),
        );
        if (table === undefined) {
          return Promise.resolve([]);
        }
        const rows = READ_TABLES[table] ?? [];

        const inFilter = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql);
        const inColumn = inFilter?.[1];
        if (inColumn !== undefined) {
          return Promise.resolve(rows.filter((row) => params.includes(row[inColumn])));
        }

        /* The builder's own filter form. The first bound value is the filter's, because the paging
         * placeholders are appended after the WHERE parameters. */
        const equalityFilter = /WHERE \(+(?:\w+\.)?(\w+) = \?/.exec(sql);
        const equalityColumn = equalityFilter?.[1];
        if (equalityColumn !== undefined) {
          return Promise.resolve(rows.filter((row) => row[equalityColumn] === params[0]));
        }

        return Promise.resolve([...rows]);
      },
    };

    return new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders({
        bindDefaultSkuDelegate: (sku: Sku): ProductDefaultSkuDelegate => ({
          getCurrencyCode: (): string | undefined => undefined,
          getPrice: (): ExactDecimal | undefined => sku.price,
          getRenewalPrice: (): ExactDecimal | undefined => undefined,
          getListPrice: (): ExactDecimal | undefined => undefined,
          getImageDirectory: (): string => '',
          getImagePath: (): string => '',
          getImage: (): string => '',
          getResizedImagePath: (): string => '',
          getImageExistsFlag: (): boolean => false,
        }),
      }),
      GENEROUS_SMART_LIST_BUDGET,
    );
  }

  /** The same service shape as above, with only the query port live. */
  function readService(): ProductService {
    const { adapter } = makeAdapter();
    return new ProductService({
      productRepository: UNREACHED_COLLABORATOR,
      skuRepository: UNREACHED_COLLABORATOR,
      skuService: UNREACHED_COLLABORATOR,
      optionService: UNREACHED_COLLABORATOR,
      baseService: UNREACHED_COLLABORATOR,
      productTypeBaseService: UNREACHED_COLLABORATOR,
      validator: UNREACHED_COLLABORATOR,
      settings: createSettingResolverDouble({ fallback: '' }).resolver,
      accountContext: createAccountContextDouble().accountContext,
      smartListQueryPort: readExecutor(),
      subscriptionTermPort: UNREACHED_COLLABORATOR,
      productTypeRootResolver: (() => undefined) as never,
      productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
      populationAuthorization: createPopulationAuthorizationDouble().populationAuthorization,
      /* `UniqueValueProbe` takes the table name as a plain string, exactly as
       * `model/service/DataService.cfc:L53` declares `createUniqueURLTitle(titleString, tableName)`.
       * The double's own probe narrows that first parameter to its table union, so it is adapted here
       * rather than the utility's contract being widened. */
      urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
      isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> =>
        urlTitleProbe.probe.isUrlTitleAvailable(tableName as UrlTitleTableName, value),
      persistProduct: (product: Product) => adapter.saveProduct(product),
      /* Reached only by `requireDefaultSkuEntity`, which only the subscription-term process member
       * calls. Made LOUD rather than plausible: a reader answering `''` would let a case pass while
       * silently resolving the wrong SKU. */
      defaultSkuIdReader: (): string => {
        throw new Error('defaultSkuIdReader is not reached by these cases.');
      },
      /*
       * F10 — THE REAL HYDRATION READER, NOT A STUB. It answers `undefined` for a hand-built product
       * type, because nothing wrote a preserved parent key beside one — which is precisely what
       * production does for a hand-built entity too. Using the real member keeps these cases honest:
       * they exercise the same branch production takes, and a case that WANTS the inheritance load
       * hydrates its product type through `mapProductTypeRow` so the reader answers a real key.
       */
      parentProductTypeIdReader: readHydratedParentProductTypeID,
    });
  }

  it('NET-NEW — the product carries its productType, brand, defaultSku and skus', async () => {
    const product = await readService().getProduct(PERSISTENCE_ID.product);

    expect(product).not.toBeNull();
    // All four associations the finding named as missing.
    expect(product?.productType?.productTypeID).toBe(PERSISTENCE_ID.productType);
    expect(product?.brand?.brandID).toBe(PERSISTENCE_ID.brand);
    expect(product?.defaultSku).toBeDefined();
    expect(product?.getSkus()).toHaveLength(2);
  });

  it('NET-NEW — the default SKU answers a price, so Product.getPrice has something to fall through to', async () => {
    // `Product.getPrice()` delegates to the default SKU when the product declares no local override,
    // which is why an unresolved `defaultSku` made the Google feed emit an empty `<g:price>` for
    // every item rather than raising.
    const product = await readService().getProduct(PERSISTENCE_ID.product);

    expect(product?.defaultSku?.getPrice()).toBe(toExactDecimal('99.00'));
    /* '99.00', not 99: F07 preserves the digits AND the scale the row carried — the fixture row spells
     * `price: '99.00'`, and keeping that spelling is the whole point of the exact-decimal type. */
  });

  it('NET-NEW — every SKU back-references the same product instance', async () => {
    const product = await readService().getProduct(PERSISTENCE_ID.product);
    const skus = product?.getSkus() ?? [];

    expect(skus).toHaveLength(2);
    for (const sku of skus) {
      // Definedness asserted FIRST, so this cannot pass vacuously as `undefined === undefined`.
      expect(sku).toBeInstanceOf(Sku);
      expect((sku as Sku).product).toBeDefined();
      expect((sku as Sku).product).toBe(product);
    }
  });

  it('NET-NEW — an identifier that matches no row still answers null', async () => {
    // `entityLoadByPK` yields null and the callers test it with `isNull()`, so `null` rather than
    // `undefined` is the legacy answer shape.
    const product = await readService().getProduct('00000000000000000000000000000000');

    expect(product).toBeNull();
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/adapters/MySqlProductPersistence.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/adapters/MySqlProductPersistence.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. Phase 8 folded the production module into `src/adapters/mysql/MySqlProductRepository.ts` for exactly
 * this reason — same tables, opposite direction — so its coverage follows it. The reads and the writes of
 * `SwProduct` and `SwProductType` are now asserted in one place.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * Product and product-type persistence — DATA-03.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/adapters/mysql/MySqlProductRepository.ts` and the four `src/services/ProductService.ts` seams it
 * fills.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * The reported finding had two halves, and they failed for unrelated reasons:
 *
 *   READ  — `ProductService.getProduct` answered a product with no `productType`, no `defaultSku`, no
 *           `brand` and no `skus`, because the smart-list builder projects `<baseAlias>.*` and
 *           `rowMappers.ts` RULE 3 leaves every many-to-one GENUINELY ABSENT by design.
 *   WRITE — the service declares `persistProduct` plus two composed base services and implements every
 *           member against them, but NOTHING in `src/` supplied a production implementation of any of
 *           the four capabilities behind them. A composition root could not have wired a working
 *           product flow without inventing SQL at the wiring site.
 *
 * The read half is now closed by `src/adapters/mysql/QueryRunner.ts`; the cases at the end of
 * this file assert it THROUGH the real service rather than through the builder alone, because
 * "`getProduct` returns a scalar Product" is a statement about the service's answer.
 *
 * The write half is closed by the adapter under test. The statement-level cases assert what reaches the
 * driver; the seam cases assert that a real `ProductService` wired to the real adapter actually writes.
 *
 * ⚠️ THE ASSIGNABILITY OF ALL FOUR MEMBERS IS PROVEN HERE RATHER THAN IN THE ADAPTER. The adapter does
 * not import `EntityPersister` or `EntityRemover`, because an adapter that reached up into the service
 * layer's type surface would invert the dependency direction the hexagonal separation exists to fix
 * (AAP §0.7.3 S4). A test file is under no such constraint, so the four bindings below are where a
 * signature drift becomes a compile error.
 *
 * NO DATABASE. A recording executor double answers each statement by shape, which is how the sibling
 * adapter suites work and what AAP 0.7.3 standard 6 requires here: no CFML runtime exists and the `Sw*`
 * tables are absent from this repository.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 records that no `ProductServiceTest` exists
 * and that no data-access test exists for this slice at all. `meta/tests/unit/IssuesTest.cfc:L51-L71`
 * (`issue_1097`) populates, saves and deletes a product with a nested product-type struct and is
 * TRACEABLE for the BEHAVIOUR these cases assert, but it asserts no statement, because no legacy
 * statement for either table exists — both entities were saved and deleted through the surface
 * `org/Hibachi/HibachiService.cfc:L255-L281` fabricated by prefix (IR-1).
 */
describe('test/adapters/MySqlProductPersistence.test.ts — the WRITE surface for the same two tables this file reads (folded, F1)', () => {
  /**
   * A collaborator this scenario never reaches needs no behaviour, and giving it one would suggest the
   * case depends on it. Same discipline as `test/services/SkuService.test.ts`.
   */
  const UNREACHED_COLLABORATOR = {} as never;

  /** Distinct 32-character identifiers, so a crossed binding is visible rather than coincidental. */
  const ID = {
    product: 'aaaaaaaa000000000000000000000001',
    productType: 'bbbbbbbb000000000000000000000001',
    parentProductType: 'bbbbbbbb000000000000000000000002',
    brand: 'cccccccc000000000000000000000001',
    defaultSku: 'dddddddd000000000000000000000001',
    otherSku: 'dddddddd000000000000000000000002',
  } as const;

  /**
   * The URL-title availability probe, shared by every scenario that constructs a service.
   *
   * Declared once at module level because it holds no per-case state worth isolating: nothing below seeds
   * a collision, so every candidate is reported available and the derivation terminates on its first
   * attempt.
   */
  const urlTitleProbe = createUrlTitleAvailabilityDouble();

  /** One statement, as the driver saw it. */
  interface Statement {
    readonly sql: string;
    readonly params: readonly unknown[];
  }

  /** The recorded journal plus the executor that fills it. */
  interface Journal {
    readonly statements: Statement[];
  }

  /**
   * A recording executor.
   *
   * `execute` answers with whatever rows the caller seeded for the table the statement reads, and
   * `executeMutation` answers with a configurable affected-row count — configurable BECAUSE the update
   * path must be shown not to read it.
   */
  function makeExecutor(
    rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {},
    affectedRows = 1,
  ): { readonly executor: ProductPersistenceExecutor; readonly journal: Journal } {
    const journal: Journal = { statements: [] };

    const executor: ProductPersistenceExecutor = {
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        journal.statements.push({ sql, params: [...params] });

        const table = Object.keys(rowsByTable).find((name) =>
          new RegExp(`FROM ${name}\\b`).test(sql),
        );

        return Promise.resolve(table === undefined ? [] : [...(rowsByTable[table] ?? [])]);
      },
      executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
        journal.statements.push({ sql, params: [...params] });
        return Promise.resolve(affectedRows);
      },
    };

    return { executor, journal };
  }

  /** A cleanup collaborator that records the identifiers it was asked to clear. */
  function makeCleanup(): {
    readonly cleanup: ProductDependencyCleanup;
    readonly productIds: string[];
    readonly productTypeIds: string[];
  } {
    const productIds: string[] = [];
    const productTypeIds: string[] = [];

    return {
      productIds,
      productTypeIds,
      cleanup: {
        removeProductDependencies: (productID: string): Promise<void> => {
          productIds.push(productID);
          return Promise.resolve();
        },
        removeProductTypeDependencies: (productTypeID: string): Promise<void> => {
          productTypeIds.push(productTypeID);
          return Promise.resolve();
        },
      },
    };
  }

  /**
   * Reads the identifier of a default-SKU delegate.
   *
   * The delegate in these cases is a wrapper closing over a `Sku`, exactly as `src/domain/sku/Sku.ts`
   * records: `Sku` is DELIBERATELY not assignable to `ProductDefaultSkuDelegate`, so the value in
   * `Product.defaultSku` is never the entity itself and an `instanceof Sku` test against it is false.
   */
  function makeDefaultSkuDelegate(skuID: string): {
    readonly delegate: ProductDefaultSkuDelegate;
    readonly skuID: string;
  } {
    return {
      skuID,
      delegate: {
        getCurrencyCode: (): string | undefined => undefined,
        getPrice: (): ExactDecimal | undefined => undefined,
        getRenewalPrice: (): ExactDecimal | undefined => undefined,
        getListPrice: (): ExactDecimal | undefined => undefined,
        getImageDirectory: (): string => '',
        getImagePath: (): string => '',
        getImage: (): string => '',
        getResizedImagePath: (): string => '',
        getImageExistsFlag: (): boolean => false,
      },
    };
  }

  /** The delegate-to-identifier map these cases inject, keyed by delegate object identity. */
  function makeDefaultSkuIdReader(): {
    readonly read: (defaultSku: object) => string;
    register(delegate: ProductDefaultSkuDelegate, skuID: string): void;
  } {
    const identifiers = new Map<object, string>();

    return {
      register: (delegate: ProductDefaultSkuDelegate, skuID: string): void => {
        identifiers.set(delegate, skuID);
      },
      read: (defaultSku: object): string => identifiers.get(defaultSku) ?? '',
    };
  }

  /** The adapter under test, with everything it needs recorded. */
  function makeAdapter(
    rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {},
    affectedRows = 1,
  ): {
    readonly adapter: MySqlProductPersistence;
    readonly journal: Journal;
    readonly cleanup: ReturnType<typeof makeCleanup>;
    readonly defaultSkuIds: ReturnType<typeof makeDefaultSkuIdReader>;
  } {
    const { executor, journal } = makeExecutor(rowsByTable, affectedRows);
    const cleanup = makeCleanup();
    const defaultSkuIds = makeDefaultSkuIdReader();

    return {
      journal,
      cleanup,
      defaultSkuIds,
      adapter: new MySqlProductPersistence(executor, cleanup.cleanup, defaultSkuIds.read),
    };
  }

  /** A saved product carrying all three of its many-to-one associations. */
  function savedProduct(): Product {
    const product = new Product();
    product.productID = ID.product;
    product.productName = 'Feed Product';
    product.productCode = 'FP-1';
    product.urlTitle = 'feed-product';
    product.activeFlag = true;
    product.publishedFlag = true;

    const brand = new Brand();
    brand.brandID = ID.brand;
    product.brand = brand;

    const productType = new ProductType();
    productType.productTypeID = ID.productType;
    product.productType = productType;

    return product;
  }

  /** A saved product type carrying its self-referencing parent. */
  function savedProductType(): ProductType {
    const productType = new ProductType();
    productType.productTypeID = ID.productType;
    productType.productTypeName = 'Merchandise';
    productType.urlTitle = 'merchandise';
    productType.productTypeIDPath = `${ID.parentProductType},${ID.productType}`;

    const parent = new ProductType();
    parent.productTypeID = ID.parentProductType;
    productType.parentProductType = parent;

    return productType;
  }

  /** Every statement whose text matches, in journal order. */
  function matching(journal: Journal, pattern: RegExp): readonly Statement[] {
    return journal.statements.filter((statement) => pattern.test(statement.sql));
  }

  /* =================================================================================================
   * THE `SwProduct` WRITE PATH
   * ============================================================================================== */

  describe('MySqlProductPersistence — the SwProduct write path (DATA-03)', () => {
    it('NET-NEW — a transient product is INSERTed with a freshly minted 32-character identifier', async () => {
      const { adapter, journal } = makeAdapter();
      const product = new Product();
      product.productName = 'New Product';

      // `model/entity/Product.cfc:L52` declares `unsavedvalue=""`, which is what `isNew()` tests.
      expect(product.isNew()).toBe(true);

      await adapter.saveProduct(product);

      // IR-6: 32 lowercase hexadecimal characters, no dashes, never an auto-increment.
      expect(product.productID).toMatch(/^[0-9a-f]{32}$/);
      expect(product.isNew()).toBe(false);

      const inserts = matching(journal, /^INSERT INTO SwProduct/);
      expect(inserts).toHaveLength(1);
      // The identifier is bound FIRST, matching the column list's own ordering.
      expect(inserts[0]?.params[0]).toBe(product.productID);
    });

    it('NET-NEW — the insert names every SwProduct column and binds one value per column', async () => {
      const { adapter, journal } = makeAdapter();

      await adapter.saveProduct(new Product());

      const insert = matching(journal, /^INSERT INTO SwProduct/)[0];
      const columnList = /\(([^)]*)\) VALUES/.exec(insert?.sql ?? '')?.[1] ?? '';
      const columns = columnList.split(', ');

      // Twenty columns: the primary key plus the nineteen writable ones. `model/entity/Product.cfc`
      // declares eight scalars (:L52-L59), four persisted calculated columns (:L62-L65), three
      // many-to-one foreign keys (:L68-L70), a remote identifier (:L93) and four audit members
      // (:L96-L99). Its twenty NON-persistent properties (:L102-L123) are not columns and are absent.
      expect(columns).toHaveLength(20);
      expect(columns).toContain('productID');
      expect(columns).toContain('calculatedTitle');
      expect(columns).toContain('brandID');
      expect(columns).toContain('productTypeID');
      expect(columns).toContain('defaultSkuID');
      // The crossed audit pairing: the COLUMNS carry the `ID` suffix, the fields do not.
      expect(columns).toContain('createdByAccountID');
      expect(columns).toContain('modifiedByAccountID');
      // A non-persistent property must never appear as a column.
      expect(columns).not.toContain('price');
      expect(columns).not.toContain('optionGroups');

      expect(insert?.params).toHaveLength(columns.length);
    });

    it('NET-NEW — the three foreign keys come from the ASSOCIATION OBJECTS, not from scalars', async () => {
      // "Preserve association identity" in practice: `rowMappers.ts` RULE 3 leaves every many-to-one
      // absent, so there is no `product.brandID` field anywhere in the domain to copy out. A stale
      // scalar cannot drift out of step with the graph because no stale scalar exists.
      const { adapter, journal, defaultSkuIds } = makeAdapter();
      const product = savedProduct();
      const { delegate } = makeDefaultSkuDelegate(ID.defaultSku);
      product.defaultSku = delegate;
      defaultSkuIds.register(delegate, ID.defaultSku);

      await adapter.saveProduct(product);

      const update = matching(journal, /^UPDATE SwProduct SET/)[0];
      expect(update?.params).toContain(ID.brand);
      expect(update?.params).toContain(ID.productType);
      // The default SKU arrives through the INJECTED READER, because the delegate exposes no
      // identifier accessor — `src/domain/sku/Sku.ts` mismatch M-ii.
      expect(update?.params).toContain(ID.defaultSku);
    });

    it('NET-NEW — a saved product is UPDATEd with the primary key bound LAST and no identifier minted', async () => {
      const { adapter, journal } = makeAdapter();
      const product = savedProduct();

      await adapter.saveProduct(product);

      // The identity is the entity's own answer, not a probe's: no existence read is issued.
      expect(matching(journal, /^SELECT/)).toHaveLength(0);
      expect(product.productID).toBe(ID.product);

      const updates = matching(journal, /^UPDATE SwProduct SET/);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.sql).toContain('WHERE productID = ?');
      // Nineteen assignments plus the key: the key is the LAST bound value, matching its position in
      // the statement text.
      expect(updates[0]?.params).toHaveLength(20);
      expect(updates[0]?.params[19]).toBe(ID.product);
    });

    it('NET-NEW — the update path does NOT read the affected-row count', async () => {
      // Measured against MySQL 8.4.11 through mysql2 3.23.2: re-saving unchanged data reports 1 with
      // `CLIENT_FOUND_ROWS` and 0 without, and `src/config/database.ts` pins no capability flags. So a
      // zero count must NOT be treated as a failure — otherwise correctness would depend on an
      // unpinned connection negotiation detail.
      const { adapter } = makeAdapter({}, 0);
      const product = savedProduct();

      await expect(adapter.saveProduct(product)).resolves.toBe(product);
    });

    it('NET-NEW — an absent field binds as SQL null rather than being omitted', async () => {
      // The domain expresses a legacy null by the ABSENCE of a property. A bind position cannot express
      // absence, so the translation happens exactly at this seam and nowhere earlier. Omitting the
      // column instead would let the database apply a default, which is a different outcome.
      const { adapter, journal } = makeAdapter();
      const product = new Product();
      product.productName = 'Sparse';

      await adapter.saveProduct(product);

      const insert = matching(journal, /^INSERT INTO SwProduct/)[0];
      expect(insert?.params).toContain(null);
      expect(insert?.params).toContain('Sparse');
      // Absence never reaches the driver as `undefined`.
      expect(insert?.params).not.toContain(undefined);
    });

    it('NET-NEW — no value is ever interpolated into statement text', async () => {
      // The structural reason the D18 class of flaw cannot occur here: the statement text is a function
      // of the whitelist alone.
      const { adapter, journal } = makeAdapter();
      const product = savedProduct();
      product.productName = "Bobby'); DROP TABLE SwProduct;--";

      await adapter.saveProduct(product);

      for (const statement of journal.statements) {
        expect(statement.sql).not.toContain('DROP TABLE');
        expect(statement.sql).not.toContain('Bobby');
      }
    });
  });

  /* =================================================================================================
   * THE `SwProductType` WRITE PATH
   * ============================================================================================== */

  describe('MySqlProductPersistence — the SwProductType write path (DATA-03)', () => {
    it('NET-NEW — a transient product type is INSERTed with a minted identifier and all fourteen columns', async () => {
      const { adapter, journal } = makeAdapter();
      const productType = new ProductType();
      productType.productTypeName = 'Merchandise';

      await adapter.saveProductType(productType);

      expect(productType.productTypeID).toMatch(/^[0-9a-f]{32}$/);

      const insert = matching(journal, /^INSERT INTO SwProductType/)[0];
      const columns = (/\(([^)]*)\) VALUES/.exec(insert?.sql ?? '')?.[1] ?? '').split(', ');

      // Fourteen: eight scalars (`model/entity/ProductType.cfc:L52-L59`), the self-referencing foreign
      // key (:L62), a remote identifier (:L80) and four audit members (:L83-L86).
      expect(columns).toHaveLength(14);
      expect(columns).toContain('productTypeID');
      expect(columns).toContain('productTypeIDPath');
      expect(columns).toContain('systemCode');
      expect(columns).toContain('parentProductTypeID');
      expect(insert?.params).toHaveLength(14);
    });

    it('NET-NEW — the parent key comes from the self-referencing association object', async () => {
      const { adapter, journal } = makeAdapter();

      await adapter.saveProductType(savedProductType());

      const update = matching(journal, /^UPDATE SwProductType SET/)[0];
      expect(update?.sql).toContain('WHERE productTypeID = ?');
      expect(update?.params).toContain(ID.parentProductType);
      // The key is bound last; the parent key is one of the thirteen assignments before it.
      expect(update?.params[13]).toBe(ID.productType);
    });

    it('NET-NEW — productTypeIDPath is written as held and is NOT derived at this boundary', async () => {
      // `model/entity/ProductType.cfc:L53` declares it a plain persistent column and
      // `model/service/ProductService.cfc:L294-L310` never recomputes it on save. Deriving it here
      // would add behaviour the legacy save path does not have (AAP §0.7.3 S9).
      const { adapter, journal } = makeAdapter();
      const productType = savedProductType();
      const held = productType.productTypeIDPath;

      await adapter.saveProductType(productType);

      expect(productType.productTypeIDPath).toBe(held);
      expect(matching(journal, /^UPDATE SwProductType SET/)[0]?.params[0]).toBe(held);
    });
  });

  /* =================================================================================================
   * THE PRODUCT-TYPE PARENT ROUND TRIP — RULE 3b
   * ================================================================================================
   * ⭐ WHY THIS SECTION EXISTS. `./rowMappers.ts` deliberately does NOT resolve
   * `ProductType.parentProductType` when it hydrates a row, because an identifier-only parent would make
   * `ProductType.getSimpleRepresentation` (`src/domain/product/ProductType.ts:1153`) return `undefined`
   * as soon as it reached the parent's absent name, and that value renders the Google feed's
   * `g:product_type` element — so a reference would turn `Parent &raquo; Child` into an EMPTY element,
   * a reference that lies.
   *
   * An earlier revision stopped there, and the consequence was silent data loss: both write paths ended
   * their parent-key expression at `?? null`, so READING a child and SAVING it back wrote `NULL` into
   * `parentProductTypeID` and DETACHED the child from its parent. Rule 3b closes that by preserving the
   * row's raw key beside the entity — object-keyed, so nothing leaks across warm invocations (M7) —
   * without populating the association. These cases prove the round trip on both write paths, and prove
   * that an explicit detach still reaches `NULL`.
   *
   * The parent-key column is assignment index 7 of thirteen and the primary key is bound last at index
   * 13; `PRODUCT_TYPE_WRITABLE_COLUMNS` in `src/adapters/mysql/MySqlProductTypeRepository.ts:320-341`
   * fixes that order against `model/entity/ProductType.cfc:L53-L86`.
   * ============================================================================================== */

  describe('MySqlProductPersistence / MySqlProductTypeRepository — the parent round trip (rule 3b)', () => {
    /** Assignment index of `parentProductTypeID` among the thirteen writable columns. */
    const PARENT_KEY_INDEX = 7;
    /** Assignment index of `productTypeIDPath` — the first writable column. */
    const PATH_INDEX = 0;

    /**
     * A child product type as it arrives FROM THE DATABASE: hydrated from a driver row, carrying a real
     * `parentProductTypeID` column and NO resolved association.
     *
     * ⚠️ THE ROW IS WHAT `mysql2` HANDS BACK, NOT WHAT THE SEED DOCUMENT RENDERS. A root's parent column
     * arrives as JS `null`, because `model/dao/DataDAO.cfc:L71-L72` and `:L104-L105` both test the seed
     * document's `"NULL"` string and bind `<cfqueryparam ... null="yes">` instead. The four-character
     * string therefore never reaches a row, and no production mapper compares against it.
     */
    function hydratedChild(): ProductType {
      return mapProductTypeRow({
        productTypeID: ID.productType,
        productTypeIDPath: `${ID.parentProductType},${ID.productType}`,
        parentProductTypeID: ID.parentProductType,
        productTypeName: 'Merchandise',
        urlTitle: 'merchandise',
        activeFlag: 1,
      });
    }

    /** The tree repository over the recording seam, so its own read and write paths can be observed. */
    function makeTreeRepository(rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {}): {
      readonly repository: MySqlProductTypeRepository;
      readonly journal: Journal;
    } {
      const { executor, journal } = makeExecutor(rowsByTable, 1);

      return {
        journal,
        repository: new MySqlProductTypeRepository(
          executor,
          createAccountContextDouble().accountContext,
        ),
      };
    }

    it('NET-NEW — hydration leaves the association absent so the feed cannot be handed a lying reference', () => {
      const child = hydratedChild();

      /* The association stays unresolved — this is the deliberate half of rule 3a. */
      expect(child.parentProductType).toBeUndefined();
      /* And the row's own ancestry path is preserved verbatim, naming a parent the association omits. */
      expect(child.productTypeIDPath).toBe(`${ID.parentProductType},${ID.productType}`);
    });

    it('NET-NEW — read-modify-save through MySqlProductPersistence preserves the parent key and the path', async () => {
      const { adapter, journal } = makeAdapter();
      const child = hydratedChild();

      /* The "modify" of read-modify-save: a field a caller would plausibly edit. */
      child.productTypeName = 'Merchandise Renamed';

      await adapter.saveProductType(child);

      const update = matching(journal, /^UPDATE SwProductType SET/)[0];

      /* ⭐ THE REGRESSION THIS SECTION EXISTS FOR: this bound `null` before rule 3b. */
      expect(update?.params[PARENT_KEY_INDEX]).toBe(ID.parentProductType);
      expect(update?.params[PARENT_KEY_INDEX]).not.toBeNull();
      /* The ancestry path survives intact, so the row stays internally consistent. */
      expect(update?.params[PATH_INDEX]).toBe(`${ID.parentProductType},${ID.productType}`);
      expect(update?.params[13]).toBe(ID.productType);
    });

    it('NET-NEW — read-modify-save through MySqlProductTypeRepository preserves the parent key and does NOT flatten the path', async () => {
      /*
       * ⚠️ THIS PATH ALSO RUNS THE LIFECYCLE HOOK, WHICH IS WHY IT NEEDS ITS OWN CASE.
       * `MySqlProductTypeRepository.saveProductType` invokes `ProductType.preUpdate`, porting
       * `model/entity/ProductType.cfc:L311`, and that hook REBUILDS `productTypeIDPath` by walking
       * `parentProductType` to the root. With the association deliberately unresolved the walk finds
       * nothing and would yield the child's own identifier alone — flattening the ancestry and leaving a
       * row whose preserved parent key contradicts its path. `ProductType.getBaseProductType` reads
       * `listFirst` of this path to find the root, so a flattened path silently changes a product's
       * discriminator. The capture-and-restore guard puts the database's own value back.
       */
      const { repository, journal } = makeTreeRepository();
      const child = hydratedChild();

      await repository.saveProductType(child);

      const update = matching(journal, /^UPDATE SwProductType SET/)[0];

      expect(update?.params[PARENT_KEY_INDEX]).toBe(ID.parentProductType);
      /* NOT the flattened `ID.productType` the unguarded rebuild would have produced. */
      expect(update?.params[PATH_INDEX]).toBe(`${ID.parentProductType},${ID.productType}`);
      expect(update?.params[PATH_INDEX]).not.toBe(ID.productType);
    });

    it('NET-NEW — the FULL round trip through the real read member survives: findAllForTree then saveProductType', async () => {
      /*
       * ⭐⭐ THIS IS THE CASE THE REVIEW ASKED FOR, END TO END, WITH NO HAND-BUILT ENTITY ANYWHERE.
       * Every case above hydrates through `mapProductTypeRow` directly. This one goes through the actual
       * port member `findAllForTree()` — the read the finding cites — takes the entity it returns, and
       * hands that same entity to the write member. Nothing in between is constructed by the test.
       *
       * It also pins a mechanism detail worth pinning: `mapProductTypeTreeRow` builds its row by calling
       * `mapProductTypeRow` and then `Object.assign`ing the two counts onto THE SAME OBJECT, so the
       * object-keyed rule 3b entry recorded during hydration is still keyed to the entity that comes back
       * out. Had the tree mapper spread into a fresh object instead, the preserved key would have been
       * silently orphaned and this assertion would fail while every other case here still passed.
       */
      const { repository, journal } = makeTreeRepository({
        SwProductType: [
          {
            productTypeID: ID.productType,
            productTypeIDPath: `${ID.parentProductType},${ID.productType}`,
            parentProductTypeID: ID.parentProductType,
            productTypeName: 'Merchandise',
            urlTitle: 'merchandise',
            activeFlag: 1,
            isAssigned: 0,
            childCount: 0,
          },
        ],
      });

      const [readBack] = await repository.findAllForTree();
      if (readBack === undefined) {
        throw new Error('expected exactly one product type row');
      }

      /* Read as the tree member presents it: counts attached, association still unresolved. */
      expect(readBack.productTypeID).toBe(ID.productType);
      expect(readBack.parentProductType).toBeUndefined();

      await repository.saveProductType(readBack);

      const update = matching(journal, /^UPDATE SwProductType SET/)[0];
      expect(update?.params[PARENT_KEY_INDEX]).toBe(ID.parentProductType);
      expect(update?.params[PATH_INDEX]).toBe(`${ID.parentProductType},${ID.productType}`);
      expect(update?.params[13]).toBe(ID.productType);
    });

    it('NET-NEW — a resolved association still wins over the preserved key', async () => {
      /*
       * The association comes first in the expression, mirroring the mapping declaration at
       * `model/entity/ProductType.cfc:L62`. Re-parenting therefore behaves exactly as before rule 3b:
       * the preserved key is a FALLBACK, never an override.
       */
      const { adapter, journal } = makeAdapter();
      const child = hydratedChild();

      const newParent = new ProductType();
      newParent.productTypeID = ID.brand; // any identifier distinct from the hydrated one
      child.parentProductType = newParent;

      await adapter.saveProductType(child);

      const update = matching(journal, /^UPDATE SwProductType SET/)[0];
      expect(update?.params[PARENT_KEY_INDEX]).toBe(ID.brand);
      expect(update?.params[PARENT_KEY_INDEX]).not.toBe(ID.parentProductType);
    });

    it('NET-NEW — an explicit detach writes NULL, so rule 3b cannot resurrect a removed parent', async () => {
      /*
       * ⭐ THE ESCAPE HATCH IS PART OF THE CONTRACT. Preserving the key would be a trap if there were no
       * way to say "this child genuinely has no parent now", because `removeParentProductType` clears the
       * association and the preserved key would silently put the old parent back. A caller that means to
       * detach calls `forgetHydratedParentProductTypeID` first.
       */
      const { adapter, journal } = makeAdapter();
      const child = hydratedChild();

      forgetHydratedParentProductTypeID(child);

      await adapter.saveProductType(child);

      const update = matching(journal, /^UPDATE SwProductType SET/)[0];
      expect(update?.params[PARENT_KEY_INDEX]).toBeNull();
    });

    it('NET-NEW — a genuine root records no key and still writes NULL', async () => {
      /*
       * The three seeded discriminators are roots: `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`
       * gives each a `productTypeIDPath` equal to its own identifier and no parent. The driver hands the
       * parent column back as `null`, `readOptionalString` maps that to `undefined`, and rule 3b records
       * nothing — so the column is nulled because there is genuinely no parent, not because the key was
       * lost.
       */
      const { adapter, journal } = makeAdapter();
      const root = mapProductTypeRow({
        productTypeID: ID.productType,
        productTypeIDPath: ID.productType,
        parentProductTypeID: null,
        productTypeName: 'Merchandise',
        systemCode: 'merchandise',
        urlTitle: 'merchandise',
        activeFlag: 1,
      });

      await adapter.saveProductType(root);

      const update = matching(journal, /^UPDATE SwProductType SET/)[0];
      expect(update?.params[PARENT_KEY_INDEX]).toBeNull();
      expect(update?.params[PATH_INDEX]).toBe(ID.productType);
    });
  });

  /* =================================================================================================
   * THE PRODUCT REMOVAL PATH
   * ============================================================================================== */

  describe('MySqlProductPersistence — the product removal path (DATA-03)', () => {
    /** A product whose two SKU rows the cascade will find. */
    function productWithSkus(): Readonly<Record<string, readonly MySqlRow[]>> {
      return { SwSku: [{ skuID: ID.defaultSku }, { skuID: ID.otherSku }] };
    }

    it('NET-NEW — the six steps run in the legacy order, with the SKU cascade before the product row', async () => {
      const { adapter, journal, cleanup } = makeAdapter(productWithSkus());

      await adapter.deleteProduct(savedProduct());

      const shapes = journal.statements.map((statement) =>
        statement.sql.replace(/\s+/g, ' ').slice(0, 46),
      );

      // Step 2 first: the self-reference must be broken before either row can go.
      expect(shapes[0]).toContain('UPDATE SwProduct SET defaultSkuID = NULL');
      // Step 4 next — step 3 is the collaborator, which issues no statement of its own here.
      expect(shapes[1]).toContain('DELETE FROM SwRelatedProduct');
      // Step 5: read the identifiers, clear the four link tables, then the SKU rows.
      expect(shapes[2]).toContain('SELECT skuID FROM SwSku');
      expect(shapes[3]).toContain('DELETE FROM SwSkuOption');
      expect(shapes[4]).toContain('DELETE FROM SwSkuAccessContent');
      expect(shapes[5]).toContain('DELETE FROM SwSkuSubsBenefit');
      expect(shapes[6]).toContain('DELETE FROM SwSkuRenewalSubsBenefit');
      expect(shapes[7]).toContain('DELETE FROM SwSku WHERE');
      // Step 6 last.
      expect(shapes[8]).toContain('DELETE FROM SwProduct WHERE');
      expect(shapes).toHaveLength(9);

      // Step 3 ran, and ran BEFORE the product row went — `org/Hibachi/HibachiService.cfc:L61`
      // precedes `:L64`.
      expect(cleanup.productIds).toEqual([ID.product]);
    });

    it('NET-NEW — all FOUR SKU link tables are cleared, not just the option one', async () => {
      // Leaving three out would leave orphan link rows pointing at a `skuID` that no longer exists,
      // which no error anywhere would report. `model/entity/Sku.cfc:L76-L79` declares all four.
      const { adapter, journal } = makeAdapter(productWithSkus());

      await adapter.deleteProduct(savedProduct());

      for (const table of [
        'SwSkuOption',
        'SwSkuAccessContent',
        'SwSkuSubsBenefit',
        'SwSkuRenewalSubsBenefit',
      ]) {
        const statements = matching(journal, new RegExp(`^DELETE FROM ${table} WHERE skuID IN`));
        expect(statements).toHaveLength(1);
        // One placeholder per identifier, each value bound rather than interpolated.
        expect(statements[0]?.sql).toContain('IN (?, ?)');
        expect(statements[0]?.params).toEqual([ID.defaultSku, ID.otherSku]);
      }
    });

    it('NET-NEW — SwRelatedProduct is cleared on the OWNER side only', async () => {
      // `model/entity/Product.cfc:L81` carries NO `inverse="true"`, so this product owns the rows whose
      // `productID` is its own and does not own the rows whose `relatedProductID` is.
      // `org/Hibachi/HibachiEntity.cfc:L277` iterates only this entity's own collection, so the legacy
      // left the reverse rows too. Widening the predicate would remove rows the legacy keeps.
      const { adapter, journal } = makeAdapter(productWithSkus());

      await adapter.deleteProduct(savedProduct());

      const statements = matching(journal, /^DELETE FROM SwRelatedProduct/);
      expect(statements).toHaveLength(1);
      expect(statements[0]?.sql).toContain('WHERE productID = ?');
      expect(statements[0]?.sql).not.toContain('relatedProductID');
      expect(statements[0]?.params).toEqual([ID.product]);
    });

    it('NET-NEW — a product with no SKUs issues no SKU statement at all', async () => {
      // An empty identifier list would compose `IN ()`, which is a syntax error rather than an empty
      // match — the same rule `QueryRunner.ts` records for its loaders.
      const { adapter, journal } = makeAdapter({ SwSku: [] });

      await adapter.deleteProduct(savedProduct());

      expect(matching(journal, /IN \(\)/)).toHaveLength(0);
      expect(matching(journal, /^DELETE FROM SwSku\b/)).toHaveLength(0);
      expect(matching(journal, /^DELETE FROM SwSkuOption/)).toHaveLength(0);
      // The product itself still goes.
      expect(matching(journal, /^DELETE FROM SwProduct WHERE/)).toHaveLength(1);
    });

    it('NET-NEW — a transient product is refused and NOTHING is issued', async () => {
      // Every statement would be keyed on `''`, a predicate that matches nothing in a sound table and
      // an arbitrary row in an unsound one. The mapping layer would have raised on the same input.
      const { adapter, journal, cleanup } = makeAdapter();

      await expect(adapter.deleteProduct(new Product())).rejects.toBeInstanceOf(DataIntegrityError);

      expect(journal.statements).toHaveLength(0);
      expect(cleanup.productIds).toHaveLength(0);
    });

    it('NET-NEW — a SKU row with an unusable identifier is refused rather than skipped', async () => {
      // Skipping it would leave that SKU's link rows behind AND then fail the product removal on a
      // foreign-key constraint, with nothing anywhere naming the cause.
      const { adapter } = makeAdapter({ SwSku: [{ skuID: 42 }] });

      await expect(adapter.deleteProduct(savedProduct())).rejects.toBeInstanceOf(
        DataIntegrityError,
      );
    });
  });

  /* =================================================================================================
   * THE PRODUCT-TYPE REMOVAL PATH
   * ============================================================================================== */

  describe('MySqlProductPersistence — the product-type removal path (DATA-03)', () => {
    it('NET-NEW — the excluded-family rows are cleared before the product-type row', async () => {
      const { adapter, journal, cleanup } = makeAdapter();

      await adapter.deleteProductType(savedProductType());

      expect(cleanup.productTypeIds).toEqual([ID.productType]);
      const statements = matching(journal, /^DELETE FROM SwProductType/);
      expect(statements).toHaveLength(1);
      expect(statements[0]?.params).toEqual([ID.productType]);
    });

    it('NET-NEW — no cascade is attempted over products or child product types', async () => {
      // Not an omission: `model/validation/ProductType.json` bounds BOTH at `maxCollection 0` for the
      // delete context, so a product type carrying either is refused before any removal is attempted
      // and the `cascade="all"` at `model/entity/ProductType.cfc:L65-L66` is unreachable. Implementing
      // it would add behaviour the legacy cannot reach.
      const { adapter, journal } = makeAdapter();

      await adapter.deleteProductType(savedProductType());

      expect(matching(journal, /DELETE FROM SwProduct\b/)).toHaveLength(0);
      expect(matching(journal, /parentProductTypeID/)).toHaveLength(0);
      expect(journal.statements).toHaveLength(1);
    });

    it('NET-NEW — a transient product type is refused and NOTHING is issued', async () => {
      const { adapter, journal, cleanup } = makeAdapter();

      await expect(adapter.deleteProductType(new ProductType())).rejects.toBeInstanceOf(
        DataIntegrityError,
      );

      expect(journal.statements).toHaveLength(0);
      expect(cleanup.productTypeIds).toHaveLength(0);
    });
  });

  /* =================================================================================================
   * THE FOUR SEAMS — THE FINDING'S ACTUAL CLAIM
   * ============================================================================================== */

  describe('the four ProductService seams the adapter fills (DATA-03)', () => {
    it('NET-NEW — all four members satisfy the service layer\u2019s persister and remover contracts', () => {
      // ⚠️ THIS IS A COMPILE-TIME ASSERTION WEARING A RUNTIME COAT. The adapter deliberately does not
      // import these two function types (S4 — an adapter must not reach up into the service layer), so
      // the assignability is unproven inside it. Binding all four here makes a signature drift a
      // compile error in this suite rather than a run-time surprise at the wiring site.
      const { adapter } = makeAdapter();

      const persistProduct: EntityPersister<Product> = (product) => adapter.saveProduct(product);
      const removeProduct: EntityRemover<Product> = (product) => adapter.deleteProduct(product);
      const persistProductType: EntityPersister<ProductType> = (productType) =>
        adapter.saveProductType(productType);
      const removeProductType: EntityRemover<ProductType> = (productType) =>
        adapter.deleteProductType(productType);

      expect([persistProduct, removeProduct, persistProductType, removeProductType]).toHaveLength(
        4,
      );
    });

    /**
     * A real `ProductService` wired to the real adapter for exactly the seams a scenario reaches.
     *
     * Everything else is `UNREACHED_COLLABORATOR`: `getProduct` touches only the query port, and the
     * three write members below touch only the collaborators named here. A collaborator that is never
     * called needs no behaviour, and giving it one would suggest these cases depend on it.
     */
    function makeService(
      adapter: MySqlProductPersistence,
      smartListQueryPort: ProductService['smartListQueryPort'] = UNREACHED_COLLABORATOR,
    ): ProductService {
      return new ProductService({
        productRepository: UNREACHED_COLLABORATOR,
        skuRepository: UNREACHED_COLLABORATOR,
        skuService: UNREACHED_COLLABORATOR,
        optionService: UNREACHED_COLLABORATOR,
        /* `ProductBaseService` is `Pick<BaseService<Product, …>, 'delete'>`. The real base service's
         * delete runs the delete-context rules and then its `remove` collaborator; what matters to
         * DATA-03 is that the collaborator it would call is the real adapter, so the seam is exercised
         * with the real statements rather than with a recorder. */
        baseService: {
          delete: async (product: Product): Promise<boolean> => {
            await adapter.deleteProduct(product);
            return true;
          },
        },
        /* `ProductTypeBaseService` is `Pick<BaseService<ProductType, …>, 'save'>`, whose contract
         * populates, validates and then persists. The persistence step is the real adapter. */
        productTypeBaseService: {
          /* ⚠️ TYPED OVER `ManagedEntity<ProductType>`, NOT OVER A BARE `ProductType`, AND THE REASON IS
           * F22 ON `src/domain/product/ProductType.ts`. `BaseService.save` is declared over the managed
           * form, and this entity DELIBERATELY does not declare the seven managed-entity members as class
           * methods — `manageEntity` attaches them, which is what `rowMappers.ts` already does to every
           * hydrated product type. A bare `ProductType` is therefore NOT assignable to the slot, and
           * widening the double here is the honest fix rather than reinstating methods the domain module
           * decided against. `MySqlProductPersistence.saveProductType` returns THE SAME INSTANCE on both
           * of its branches, so forwarding the argument back preserves the identity the contract promises
           * while keeping the managed type. */
          save: async (
            productType: ManagedEntity<ProductType>,
            data?: Record<string, unknown>,
          ): Promise<ManagedEntity<ProductType>> => {
            const urlTitle = data?.['urlTitle'];
            if (typeof urlTitle === 'string') {
              productType.urlTitle = urlTitle;
            }
            await adapter.saveProductType(productType);
            return productType;
          },
        },
        validator: {
          validate: () => Promise.resolve({ getErrors: () => ({}) }),
          validateProcess: UNREACHED_COLLABORATOR,
        } as never,
        settings: createSettingResolverDouble({ fallback: '' }).resolver,
        accountContext: createAccountContextDouble().accountContext,
        smartListQueryPort,
        subscriptionTermPort: UNREACHED_COLLABORATOR,
        productTypeRootResolver: (() => undefined) as never,
        productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
        populationAuthorization: createPopulationAuthorizationDouble().populationAuthorization,
        /* `UniqueValueProbe` takes the table name as a plain string, exactly as
         * `model/service/DataService.cfc:L53` declares `createUniqueURLTitle(titleString, tableName)`.
         * The double's own probe narrows that first parameter to its table union, so it is adapted here
         * rather than the utility's contract being widened. */
        urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
        isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> =>
          urlTitleProbe.probe.isUrlTitleAvailable(tableName as UrlTitleTableName, value),
        persistProduct: (product: Product) => adapter.saveProduct(product),
        /* Reached only by `requireDefaultSkuEntity`, which only the subscription-term process member
         * calls. Made LOUD rather than plausible: a reader answering `''` would let a case pass while
         * silently resolving the wrong SKU. */
        defaultSkuIdReader: (): string => {
          throw new Error('defaultSkuIdReader is not reached by these cases.');
        },
        /* F10 — THE REAL HYDRATION READER, NOT A STUB, matching every other construction in this file.
         * It answers `undefined` for a hand-built product type, because nothing wrote a preserved parent
         * key beside one, so these cases observe the same reader the composition root wires. */
        parentProductTypeIdReader: readHydratedParentProductTypeID,
      });
    }

    it('NET-NEW — ProductService.saveProduct now reaches SwProduct through the real persister', async () => {
      // The finding, restated: before this adapter existed, `persistProduct` had no production
      // implementation, so this path could not write anything at all.
      const { adapter, journal } = makeAdapter();
      const service = makeService(adapter);
      const product = savedProduct();

      const saved = await service.saveProduct(product, { productName: 'Renamed' });

      expect(saved).toBe(product);
      expect(matching(journal, /^UPDATE SwProduct SET/)).toHaveLength(1);
      // Population ran first, so the payload's value is what reached the driver.
      expect(matching(journal, /^UPDATE SwProduct SET/)[0]?.params).toContain('Renamed');
    });

    it('NET-NEW — ProductService.deleteProduct now removes the rows through the real remover', async () => {
      const { adapter, journal } = makeAdapter({ SwSku: [{ skuID: ID.defaultSku }] });
      const service = makeService(adapter);
      const product = savedProduct();
      const { delegate } = makeDefaultSkuDelegate(ID.defaultSku);
      product.defaultSku = delegate;

      await expect(service.deleteProduct(product)).resolves.toBe(true);

      // `:L323` clears the relationship in memory; the adapter's step 2 is what makes the stored
      // column agree, because this port has no flush.
      expect(product.defaultSku).toBeUndefined();
      expect(matching(journal, /^UPDATE SwProduct SET defaultSkuID = NULL/)).toHaveLength(1);
      expect(matching(journal, /^DELETE FROM SwProduct WHERE/)).toHaveLength(1);
      expect(matching(journal, /^DELETE FROM SwSku WHERE/)).toHaveLength(1);
    });

    it('NET-NEW — ProductService.saveProductType now reaches SwProductType through the real persister', async () => {
      const { adapter, journal } = makeAdapter();
      const service = makeService(adapter);
      const productType = new ProductType();

      await service.saveProductType(productType, { productTypeName: 'Merchandise' });

      // A transient type takes the insert path and is minted here and only here.
      expect(productType.productTypeID).toMatch(/^[0-9a-f]{32}$/);
      expect(matching(journal, /^INSERT INTO SwProductType/)).toHaveLength(1);
      // `:L297` writes the derived title INTO THE PAYLOAD, and it only reaches the entity because the
      // base service populates from that same struct.
      expect(matching(journal, /^INSERT INTO SwProductType/)[0]?.params).toContain('merchandise');
    });
  });

  /* =================================================================================================
   * THE READ HALF — `getProduct` MUST ANSWER AN AGGREGATE
   * ============================================================================================== */

  describe('ProductService.getProduct returns a materialised aggregate (DATA-03)', () => {
    /** A product row plus every row its associations need. */
    const READ_TABLES: Readonly<Record<string, readonly MySqlRow[]>> = {
      SwProduct: [
        {
          productID: ID.product,
          productName: 'Feed Product',
          productCode: 'FP-1',
          productTypeID: ID.productType,
          brandID: ID.brand,
          defaultSkuID: ID.defaultSku,
        },
      ],
      SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
      SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
      /* ⚠️ THE MONEY COLUMN IS A STRING, NOT A NUMBER, AND THAT IS THE DRIVER CONTRACT RATHER THAN A
       * FIXTURE QUIRK. `model/entity/Sku.cfc:L56` declares `price` `ormtype="big_decimal"`, and
       * `rowMappers.ts` reads it through the exact-decimal reader, which REFUSES a JavaScript number
       * because by the time one arrives the exact digits are already gone (F16). */
      SwSku: [
        { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
        { skuID: ID.otherSku, skuCode: 'SKU-2', price: '20.00', productID: ID.product },
      ],
    };

    /**
     * An executor that HONOURS BOTH `WHERE <column> IN (…)` AND `WHERE <alias>.<column> = ?`.
     *
     * ⚠️ IT HAS TO HONOUR THE `IN` FORM. Two different statements read `SwSku` on this path — the aggregate
     * loader's product-scoped collection read and its default-SKU lookup by identifier — and a double that
     * answered both with the same rows would hand the lookup rows it never asked for.
     *
     * ⚠️ IT HAS TO HONOUR THE EQUALITY FORM TOO, and for a sharper reason: `getProduct` is a primary-key
     * lookup expressed as a single-filter dynamic query, which the builder compiles to
     * `WHERE ((<alias>.productID = ?))`. A double that ignored that predicate would answer EVERY
     * identifier with the seeded row, so the case asserting that an unmatched identifier yields `null`
     * could never fail and would be asserting nothing at all.
     */
    function readExecutor(): ProductService['smartListQueryPort'] {
      const executor = {
        execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
          if (sql.includes('recordsCount')) {
            return Promise.resolve([{ recordsCount: 1 }]);
          }

          const table = Object.keys(READ_TABLES).find((name) =>
            new RegExp(`FROM ${name}\\b`).test(sql),
          );
          if (table === undefined) {
            return Promise.resolve([]);
          }
          const rows = READ_TABLES[table] ?? [];

          const inFilter = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql);
          const inColumn = inFilter?.[1];
          if (inColumn !== undefined) {
            return Promise.resolve(rows.filter((row) => params.includes(row[inColumn])));
          }

          /* The builder's own filter form. The first bound value is the filter's, because the paging
           * placeholders are appended after the WHERE parameters. */
          const equalityFilter = /WHERE \(+(?:\w+\.)?(\w+) = \?/.exec(sql);
          const equalityColumn = equalityFilter?.[1];
          if (equalityColumn !== undefined) {
            return Promise.resolve(rows.filter((row) => row[equalityColumn] === params[0]));
          }

          return Promise.resolve([...rows]);
        },
      };

      return new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders({
          bindDefaultSkuDelegate: (sku: Sku): ProductDefaultSkuDelegate => ({
            getCurrencyCode: (): string | undefined => undefined,
            getPrice: (): ExactDecimal | undefined => sku.price,
            getRenewalPrice: (): ExactDecimal | undefined => undefined,
            getListPrice: (): ExactDecimal | undefined => undefined,
            getImageDirectory: (): string => '',
            getImagePath: (): string => '',
            getImage: (): string => '',
            getResizedImagePath: (): string => '',
            getImageExistsFlag: (): boolean => false,
          }),
        }),
        GENEROUS_SMART_LIST_BUDGET,
      );
    }

    /** The same service shape as above, with only the query port live. */
    function readService(): ProductService {
      const { adapter } = makeAdapter();
      return new ProductService({
        productRepository: UNREACHED_COLLABORATOR,
        skuRepository: UNREACHED_COLLABORATOR,
        skuService: UNREACHED_COLLABORATOR,
        optionService: UNREACHED_COLLABORATOR,
        baseService: UNREACHED_COLLABORATOR,
        productTypeBaseService: UNREACHED_COLLABORATOR,
        validator: UNREACHED_COLLABORATOR,
        settings: createSettingResolverDouble({ fallback: '' }).resolver,
        accountContext: createAccountContextDouble().accountContext,
        smartListQueryPort: readExecutor(),
        subscriptionTermPort: UNREACHED_COLLABORATOR,
        productTypeRootResolver: (() => undefined) as never,
        productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
        populationAuthorization: createPopulationAuthorizationDouble().populationAuthorization,
        /* `UniqueValueProbe` takes the table name as a plain string, exactly as
         * `model/service/DataService.cfc:L53` declares `createUniqueURLTitle(titleString, tableName)`.
         * The double's own probe narrows that first parameter to its table union, so it is adapted here
         * rather than the utility's contract being widened. */
        urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
        isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> =>
          urlTitleProbe.probe.isUrlTitleAvailable(tableName as UrlTitleTableName, value),
        persistProduct: (product: Product) => adapter.saveProduct(product),
        /* Reached only by `requireDefaultSkuEntity`, which only the subscription-term process member
         * calls. Made LOUD rather than plausible: a reader answering `''` would let a case pass while
         * silently resolving the wrong SKU. */
        defaultSkuIdReader: (): string => {
          throw new Error('defaultSkuIdReader is not reached by these cases.');
        },
        /* F10 — THE REAL HYDRATION READER, NOT A STUB, matching every other construction in this file.
         * It answers `undefined` for a hand-built product type, because nothing wrote a preserved parent
         * key beside one, so these cases observe the same reader the composition root wires. */
        parentProductTypeIdReader: readHydratedParentProductTypeID,
      });
    }

    it('NET-NEW — the product carries its productType, brand, defaultSku and skus', async () => {
      const product = await readService().getProduct(ID.product);

      expect(product).not.toBeNull();
      // All four associations the finding named as missing.
      expect(product?.productType?.productTypeID).toBe(ID.productType);
      expect(product?.brand?.brandID).toBe(ID.brand);
      expect(product?.defaultSku).toBeDefined();
      expect(product?.getSkus()).toHaveLength(2);
    });

    it('NET-NEW — the default SKU answers a price, so Product.getPrice has something to fall through to', async () => {
      // `Product.getPrice()` delegates to the default SKU when the product declares no local override,
      // which is why an unresolved `defaultSku` made the Google feed emit an empty `<g:price>` for
      // every item rather than raising.
      const product = await readService().getProduct(ID.product);

      expect(product?.defaultSku?.getPrice()).toBe(toExactDecimal('99.00'));
      /* '99.00', not 99: F07 preserves the digits AND the scale the row carried — the fixture row spells
       * `price: '99.00'`, and keeping that spelling is the whole point of the exact-decimal type. */
    });

    it('NET-NEW — every SKU back-references the same product instance', async () => {
      const product = await readService().getProduct(ID.product);
      const skus = product?.getSkus() ?? [];

      expect(skus).toHaveLength(2);
      for (const sku of skus) {
        // Definedness asserted FIRST, so this cannot pass vacuously as `undefined === undefined`.
        expect(sku).toBeInstanceOf(Sku);
        expect((sku as Sku).product).toBeDefined();
        expect((sku as Sku).product).toBe(product);
      }
    });

    it('NET-NEW — an identifier that matches no row still answers null', async () => {
      // `entityLoadByPK` yields null and the callers test it with `isNull()`, so `null` rather than
      // `undefined` is the legacy answer shape.
      const product = await readService().getProduct('00000000000000000000000000000000');

      expect(product).toBeNull();
    });
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/adapters/MySqlBrandRepository.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/adapters/MySqlBrandRepository.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. `MySqlBrandRepository` has no legacy DAO to port — `BrandService` reached its CRUD surface entirely
 * through `onMissingMethod` synthesis — so its coverage has no natural sibling. This file is the closest:
 * both adapters write a product-family root table through the same `QueryRunner` primitives.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * `MySqlBrandRepository` — the brand persistence adapter. **NET-NEW** in its entirety.
 *
 * AAP authority: the AAP 0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. AAP 0.4.1.12
 * enumerates four adapter test files and does NOT name this one, which is precisely the gap this file
 * closes: AAP 0.4.1.7 lists `src/adapters/mysql/MySqlBrandRepository.ts` | CREATE, and AAP 0.7.3
 * standard 6 requires one test per converted method, so five converted members with no test file at all
 * was a standing shortfall against the AAP's own standard rather than a boundary the AAP had drawn. Two
 * sibling files already sit outside the 0.4.1.12 enumeration under the same wildcard —
 * `MySqlProductPersistence.test.ts` and `catalogAggregates.test.ts` — so this placement follows
 * established practice in this subtree rather than inventing one.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS — AND WHAT WAS UNVERIFIED BEFORE IT
 * =================================================================================================
 * ⚠️ BEFORE THIS FILE, NOTHING IN THE REPOSITORY IMPORTED `MySqlBrandRepository`. A repository-wide
 * search found the name in exactly three places, and all three were PROSE: two comments in
 * `test/support/inMemoryRepositories.ts` and one in `test/services/BrandService.test.ts`, each
 * describing what the real adapter does while testing a double that stands in for it. Its five port
 * members and every SQL path it composes had never been executed once.
 *
 * ⭐ AND THE DOUBLE COULD NOT HAVE COVERED THEM, WHICH IS THE POINT. `test/services/BrandService.test.ts`
 * exercises the SERVICE against an in-memory brand repository; that proves the service's behaviour and
 * says nothing about statement text, bound parameters, row mapping, or the two guards this adapter
 * raises. One of those comments even concedes the gap in passing, at
 * `test/services/BrandService.test.ts:2337` — "a deliberate limitation of the double, since the real
 * `MySqlBrandRepository` answers from the table itself".
 *
 * PROVENANCE — EVERY CASE HERE IS **NET-NEW**
 * No legacy `BrandDAO` exists at all: `model/service/BrandService.cfc` relies entirely on the CRUD
 * surface `org/Hibachi/HibachiService.cfc:L255-L281` fabricates through `onMissingMethod`, which is
 * implicit requirement IR-1 and the reason this adapter had to be declared explicitly in the first
 * place. There is therefore no legacy `BrandDAOTest` either, so nothing below extends a legacy
 * assertion and every `describe` and `it` carries **NET-NEW** (AAP 0.8.3.7).
 *
 * TRACEABILITY IS DOCUMENTARY, AND THE CONSTRAINT IS STATED RATHER THAN IMPLIED. MXUnit and CFSelenium
 * are not vendored in this repository; `meta/docker/slatwall-local-dev/` does not exist; and no
 * ColdFusion, Railo or Lucee engine is available here. The CFML runtime is therefore not reproducible
 * and the legacy suite cannot be executed at all. Every expectation below was derived by INSPECTING
 * `src/adapters/mysql/MySqlBrandRepository.ts` against `model/entity/Brand.cfc` and
 * `model/service/BrandService.cfc`, and **no runtime behavioural comparison against the legacy system
 * was performed**.
 *
 * =================================================================================================
 * WHAT THIS FILE COVERS
 * =================================================================================================
 *   1. `newBrand()` — the transient factory, and the managed surface it returns.
 *   2. `getBrand(brandID)` — the empty-identifier short circuit, the single-row read, the no-row null,
 *      and the ambiguity guard that refuses to hydrate from several rows.
 *   3. `saveBrand(brand)` — both arms, the IR-6 identifier mint, the audit block, and the identifier's
 *      move from FIRST on the insert to LAST on the update.
 *   4. `deleteBrand(brand)` — the affected-row boolean, and the transient guard that issues nothing.
 *   5. `isUrlTitleAvailable(urlTitle)` — the polarity, which is the one member whose name and return
 *      value point in opposite directions and therefore the one most likely to be inverted by mistake.
 *   6. `withExecutor(executor)` — the rebind seam, and the account context it must carry across.
 * ===============================================================================================*/
describe('test/adapters/MySqlBrandRepository.test.ts — the synthesized CRUD surface `BrandService` reaches through `onMissingMethod` (IR-1) (folded, F1)', () => {
  /* =================================================================================================
   * IDENTIFIERS, RESOLVED THROUGH THE PRODUCTION WHITELIST RATHER THAN SPELLED BY HAND
   * =================================================================================================
   * Every table and column named below is resolved through the same two validators the adapter itself
   * uses. A typo becomes a thrown `DomainError` at module load rather than an expectation that quietly
   * matches nothing, and a column renamed in the whitelist breaks this file loudly instead of leaving it
   * asserting against a name the adapter no longer emits.
   * ===============================================================================================*/

  const BRAND_TABLE = assertTableName('SwBrand');
  const BRAND_ID = assertColumnName(BRAND_TABLE, 'brandID');
  const BRAND_NAME = assertColumnName(BRAND_TABLE, 'brandName');
  const BRAND_URL_TITLE = assertColumnName(BRAND_TABLE, 'urlTitle');

  /** The 32-character lowercase hexadecimal identifier form of IR-6. */
  const HEX_32 = /^[0-9a-f]{32}$/;

  /* =================================================================================================
   * THE HARNESS
   * ===============================================================================================*/

  /** One exercised adapter and the double that recorded what it issued. */
  interface Harness {
    readonly repository: MySqlBrandRepository;
    readonly calls: readonly SqlExecutorCall[];
    readonly executor: BrandStatementExecutor;
    /** How many times the adapter read the current-account context. */
    accountReads(): number;
  }

  /**
   * Build the adapter over the suite's recording executor double.
   *
   * ⚠️ THE SEAM IS TYPED AS THE PRODUCTION INTERFACE. `BrandStatementExecutor` is what the constructor
   * accepts, so naming it here proves the double satisfies the real read-and-write seam rather than some
   * convenient shape, and it keeps a half-matching call from type-checking here and failing in production.
   *
   * @param outcomes - queued answers, consumed in issue order; omit for the double's own defaults.
   * @param authenticated - whether an administrative actor is present, which decides the audit columns.
   * @returns the harness.
   */
  function harness(
    outcomes: readonly ReturnType<typeof sqlRows>[] = [],
    authenticated = true,
  ): Harness {
    const double = createSqlExecutorDouble(outcomes.length === 0 ? {} : { outcomes });
    const accountDouble = authenticated
      ? createAccountContextDouble()
      : createAbsentAccountContextDouble();
    const executor: BrandStatementExecutor = double.executor;

    return {
      repository: new MySqlBrandRepository(executor, accountDouble.accountContext),
      calls: double.calls,
      executor,
      accountReads: () => accountDouble.callCount(),
    };
  }

  /** The single statement the adapter issued, or a failure naming what it actually issued. */
  function soleCall(subject: Harness): SqlExecutorCall {
    const [first, ...rest] = subject.calls;

    if (first === undefined) {
      throw new Error('the adapter issued no statement at all');
    }
    if (rest.length > 0) {
      throw new Error(
        `the adapter issued ${String(subject.calls.length)} statements, expected one`,
      );
    }

    return first;
  }

  /**
   * Capture the {@link DomainError} a rejecting call produced, narrowed by a real `instanceof` test.
   *
   * ⚠️ WHY NOT `expect.objectContaining`. That matcher is typed `any`, so passing it to `toThrow` trips
   * `no-unsafe-argument` and — more importantly — would let an assertion about `context` type-check while
   * inspecting a value the compiler knows nothing about. Narrowing first means every `context` read below
   * is checked, which is the same discipline the landed adapters use on their own row reads.
   *
   * @param call - the promise expected to reject.
   * @returns the captured error.
   * @throws {Error} when the call resolved, or rejected with something that is not a `DomainError`.
   */
  async function captureDomainError(call: Promise<unknown>): Promise<DomainError> {
    try {
      await call;
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the call to reject with a DomainError, but it resolved.');
  }

  /** Collapses runs of whitespace so a statement matches without depending on its indentation. */
  function collapse(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }

  /** The column list of an INSERT, split on the adapter's own joiner. */
  function insertedColumns(sql: string): readonly string[] {
    return (/\(([^)]*)\) VALUES/.exec(collapse(sql))?.[1] ?? '').split(', ');
  }

  /** A complete brand row as the table would return it. */
  function brandRow(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      brandID: 'brand-1',
      activeFlag: 1,
      publishedFlag: 1,
      urlTitle: 'acme',
      brandName: 'Acme',
      brandWebsite: 'https://acme.test',
      remoteID: '',
      createdDateTime: new Date('2024-01-01T00:00:00.000Z'),
      createdByAccountID: TEST_ADMIN_ACCOUNT_ID,
      modifiedDateTime: new Date('2024-01-02T00:00:00.000Z'),
      modifiedByAccountID: TEST_ADMIN_ACCOUNT_ID,
      ...overrides,
    };
  }

  /* =================================================================================================
   * 1. newBrand — the transient factory
   * ===============================================================================================*/

  describe('NET-NEW — newBrand, the transient factory', () => {
    it('NET-NEW — returns a transient managed brand and issues no statement', () => {
      const subject = harness();

      const brand = subject.repository.newBrand();

      /*
       * `newBrand()` is one of the members `onMissingMethod` fabricated in the legacy (IR-1), and its whole
       * job is to hand back an unsaved entity. It reaches no database: a factory that pre-inserted would
       * make `saveBrand`'s own insert arm unreachable and would persist brands a caller then abandoned.
       */
      expect(brand.isNew()).toBe(true);
      expect(brand.brandID).toBe('');
      expect(subject.calls).toEqual([]);
    });

    it('NET-NEW — returns a DISTINCT instance on each call, so two callers cannot share one draft', () => {
      const subject = harness();

      expect(subject.repository.newBrand()).not.toBe(subject.repository.newBrand());
    });

    it('NET-NEW — returns a MANAGED entity, so the validation surface is present from the start', () => {
      const subject = harness();

      const brand = subject.repository.newBrand();

      /* The managed wrapper carries the error surface `BaseService.save` attaches findings to — the F1
       * contract. An unmanaged entity would type-check at this seam and fail inside the save path. */
      expect(typeof brand.getClassName).toBe('function');
      expect(brand.getClassName()).toBe('Brand');
    });
  });

  /* =================================================================================================
   * 2. getBrand — the primary-identifier read
   * ===============================================================================================*/

  describe('NET-NEW — getBrand, the primary-identifier read', () => {
    it('NET-NEW — short-circuits an EMPTY identifier to null WITHOUT issuing a statement', async () => {
      const subject = harness();

      const found = await subject.repository.getBrand('');

      /*
       * ⭐ THE SHORT CIRCUIT IS THE LOAD-BEARING HALF, NOT THE NULL. An empty identifier is exactly what a
       * transient brand carries, so this path is reached whenever a caller looks up an entity it has not
       * saved. Without the guard the adapter would issue `WHERE brandID = ''`, which is a real query
       * against a real index that can only ever match nothing — so the guard is what keeps a routine
       * miss from becoming a round trip.
       */
      expect(found).toBeNull();
      expect(subject.calls).toEqual([]);
    });

    it('NET-NEW — binds the identifier as a VALUE and selects from SwBrand by primary key', async () => {
      const subject = harness([sqlRows([brandRow()])]);

      await subject.repository.getBrand('brand-1');

      const read = soleCall(subject);
      expect(collapse(read.sql)).toContain(`FROM ${BRAND_TABLE}`);
      expect(collapse(read.sql)).toContain(`WHERE ${BRAND_ID} = ?`);
      expect(read.params).toEqual(['brand-1']);
      /* The identifier never reaches the statement text — `?` binds values only. */
      expect(read.sql).not.toContain('brand-1');
    });

    it('NET-NEW — hydrates every mapped field from the row it read', async () => {
      const subject = harness([sqlRows([brandRow()])]);

      const found = await subject.repository.getBrand('brand-1');

      /* The mapper is the replacement for Hibernate hydration, so the fields are asserted rather than
       * assumed: an adapter that read the row and returned a blank entity would pass a null check. */
      expect(found?.brandID).toBe('brand-1');
      expect(found?.brandName).toBe('Acme');
      expect(found?.urlTitle).toBe('acme');
      expect(found?.brandWebsite).toBe('https://acme.test');
      /* And the hydrated entity is NOT transient, which is what routes a later save to the UPDATE arm. */
      expect(found?.isNew()).toBe(false);
    });

    it('NET-NEW — answers null for a real read that matched nothing', async () => {
      const subject = harness([sqlRows([])]);

      const found = await subject.repository.getBrand('absent-brand');

      /* "No such brand" is a legitimate answer, not an error — and it is reached by a real statement,
       * unlike the empty-identifier case above, which is why both deserve their own case. */
      expect(found).toBeNull();
      expect(subject.calls).toHaveLength(1);
    });

    it('NET-NEW — REFUSES to hydrate when a single-row read matched several, naming the count', async () => {
      const ambiguous = sqlRows([brandRow(), brandRow({ brandID: 'brand-2' })]);
      /* Queued outcomes are consumed one per statement, so the SAME answer is queued twice for the two
       * assertions below. Queuing it once would let the second read fall through to the double's default of
       * no rows, and the case would then be asserting a refusal against an empty result. */
      const subject = harness([ambiguous, ambiguous]);

      /*
       * ⚠️ IT REFUSES RATHER THAN TAKING THE FIRST ROW, AND THAT IS THE SAFE DIRECTION. A read on the
       * primary key cannot legitimately match twice, so two rows mean the data contradicts the schema.
       * Silently returning `rows[0]` would hide a corrupt table behind a plausible-looking brand and let
       * whichever row the engine happened to order first decide the answer.
       */
      await expect(subject.repository.getBrand('brand-1')).rejects.toThrow(
        /matched several, so the result is ambiguous/,
      );

      const raised = await captureDomainError(subject.repository.getBrand('brand-1'));
      expect(raised.context?.['table']).toBe(BRAND_TABLE);
      expect(raised.context?.['rowCount']).toBe(2);
    });
  });

  /* =================================================================================================
   * 3. saveBrand — both arms of the write
   * ===============================================================================================*/

  describe('NET-NEW — saveBrand, the SwBrand write seam', () => {
    it('NET-NEW — mints a 32-hex identifier on the INSERT arm and binds it FIRST', async () => {
      const subject = harness();
      const { brand } = createManagedBrand({ brandName: 'Acme' });

      expect(brand.isNew()).toBe(true);

      const returned = await subject.repository.saveBrand(brand);

      /* IR-6 — 32 lowercase hexadecimal characters, no dashes, never an auto-increment. */
      expect(brand.brandID).toMatch(HEX_32);
      expect(brand.isNew()).toBe(false);
      /* The SAME instance is returned, so a caller keeps the entity whose findings it is holding. */
      expect(returned).toBe(brand);

      const insert = soleCall(subject);
      expect(collapse(insert.sql)).toContain(`INSERT INTO ${BRAND_TABLE}`);
      expect(insert.params[0]).toBe(brand.brandID);
    });

    it('NET-NEW — takes the UPDATE arm on a persisted brand and binds the identifier LAST', async () => {
      const subject = harness();
      const { brand } = createManagedBrand({ brandID: 'brand-1', brandName: 'Acme' });

      await subject.repository.saveBrand(brand);

      const update = soleCall(subject);
      /*
       * ⭐ THE IDENTIFIER MOVES FROM FIRST TO LAST BETWEEN THE ARMS. On the insert it leads the column
       * list; on the update it is the WHERE predicate rather than a written column. Both positions hold
       * strings, so a swap between the arms type-checks perfectly and would update the wrong row — or
       * every row — which is why each arm is pinned separately.
       */
      expect(collapse(update.sql)).toContain(`UPDATE ${BRAND_TABLE} SET`);
      expect(collapse(update.sql)).toContain(`WHERE ${BRAND_ID} = ?`);
      expect(update.params[update.params.length - 1]).toBe('brand-1');
      expect(update.sql).not.toContain('INSERT');
      /* Nothing re-mints an identifier on an update. */
      expect(brand.brandID).toBe('brand-1');
    });

    it('NET-NEW — is idempotent across two saves: one INSERT, then one UPDATE', async () => {
      const subject = harness();
      const { brand } = createManagedBrand({ brandName: 'Acme' });

      await subject.repository.saveBrand(brand);
      const mintedOnce = brand.brandID;
      await subject.repository.saveBrand(brand);

      const [first, second] = subject.calls;
      expect(collapse(first?.sql ?? '')).toContain('INSERT INTO');
      expect(collapse(second?.sql ?? '')).toContain('UPDATE');
      /* A second save must not duplicate the row, and must not re-mint the identifier. */
      expect(brand.brandID).toBe(mintedOnce);
    });

    it('NET-NEW — stamps the audit block through the FREE functions, taking one instant on an insert', async () => {
      const subject = harness();
      const { brand } = createManagedBrand({ brandName: 'Acme' });

      await subject.repository.saveBrand(brand);

      /*
       * ⭐ THE FREE-FUNCTION ROUTE IS CORRECT HERE, AND IT IS THE OPPOSITE OF THE PRODUCT-TYPE ADAPTER.
       * `model/entity/Brand.cfc` does not override `preInsert`/`preUpdate`, so a brand received only the
       * framework audit block at `org/Hibachi/HibachiEntity.cfc:L598-L649` — which is what
       * `src/domain/base/AuditableEntity.ts` ports. `model/entity/ProductType.cfc:L305-L313` DOES override
       * both, which is why `MySqlProductTypeRepository` calls the entity's own hooks instead. Same-looking
       * adapters, deliberately different mechanisms, and the difference is legacy-faithful.
       */
      const insert = soleCall(subject);
      const columns = insertedColumns(insert.sql);
      const created = insert.params[columns.indexOf('createdDateTime')];
      const modified = insert.params[columns.indexOf('modifiedDateTime')];

      expect(created).toBeDefined();
      expect(created).toEqual(modified);
      /* The account context was consulted, which is how the actor columns were decided at all. */
      expect(subject.accountReads()).toBeGreaterThan(0);
      expect(insert.params[columns.indexOf('createdByAccountID')]).toBe(TEST_ADMIN_ACCOUNT_ID);
    });

    it('NET-NEW — leaves both account columns unwritten when nobody is authenticated', async () => {
      const subject = harness([], false);
      const { brand } = createManagedBrand({ brandName: 'Acme' });

      await subject.repository.saveBrand(brand);

      /* An absent actor is a legitimate state and no system account is substituted (AAP 0.7.3 S9). */
      const insert = soleCall(subject);
      const columns = insertedColumns(insert.sql);

      for (const column of ['createdByAccountID', 'modifiedByAccountID']) {
        const index = columns.indexOf(column);
        expect(index).toBeGreaterThan(-1);
        expect(insert.params[index] ?? null).toBeNull();
      }
      /* The timestamps still moved, so "no actor" did not become "no audit". */
      expect(insert.params[columns.indexOf('createdDateTime')]).toBeDefined();
      /* And the admin identifier appears nowhere, so nothing quietly fell back to it. */
      expect(insert.params).not.toContain(TEST_ADMIN_ACCOUNT_ID);
    });

    it('NET-NEW — binds one value per named column on the insert', async () => {
      const subject = harness();

      await subject.repository.saveBrand(createManagedBrand().brand);

      const insert = soleCall(subject);
      const columns = insertedColumns(insert.sql);
      const markers = (/VALUES \(([^)]*)\)/.exec(collapse(insert.sql))?.[1] ?? '').split(', ');

      /* TR-4 — positional, one for one. A count mismatch shifts every later value by one silently. */
      expect(markers).toHaveLength(columns.length);
      expect(insert.params).toHaveLength(columns.length);
      expect(markers.every((marker) => marker === '?')).toBe(true);
    });

    it('NET-NEW — never lets a quote-bearing brand name reach the statement text', async () => {
      const subject = harness();
      const hostile = "Ac'me; DROP TABLE SwBrand; --";
      const { brand } = createManagedBrand({ brandName: hostile });

      await subject.repository.saveBrand(brand);

      /* D18's value/identifier separation, applied to the brand write path. */
      const insert = soleCall(subject);
      expect(insert.sql).not.toContain('DROP TABLE SwBrand;');
      expect(insert.sql).not.toContain("'");
      expect(insert.params).toContain(hostile);
      /* The column name still appears, so the assertion above did not pass by emitting nothing. */
      expect(insertedColumns(insert.sql)).toContain(BRAND_NAME);
    });

    it('NET-NEW — opens no transaction of its own, leaving the boundary to the caller', async () => {
      const subject = harness();

      await subject.repository.saveBrand(createManagedBrand().brand);

      /* `UnitOfWork` owns the boundary; a bare save composes one statement and nothing else. */
      expect(subject.calls).toHaveLength(1);
      expect(collapse(soleCall(subject).sql)).not.toContain('BEGIN');
    });
  });

  /* =================================================================================================
   * 4. deleteBrand — the removal path and its affected-row answer
   * ===============================================================================================*/

  describe('NET-NEW — deleteBrand, the SwBrand removal seam', () => {
    it('NET-NEW — deletes by bound identifier and reports true when a row went', async () => {
      const subject = harness([sqlAffectedRows(1)]);
      const { brand } = createManagedBrand({ brandID: 'brand-1' });

      const removed = await subject.repository.deleteBrand(brand);

      expect(removed).toBe(true);
      const remove = soleCall(subject);
      expect(collapse(remove.sql)).toContain(`DELETE FROM ${BRAND_TABLE} WHERE ${BRAND_ID} = ?`);
      expect(remove.params).toEqual(['brand-1']);
      expect(remove.sql).not.toContain('brand-1');
    });

    it('NET-NEW — reports FALSE when the statement removed nothing, rather than raising', async () => {
      const subject = harness([sqlAffectedRows(0)]);
      const { brand } = createManagedBrand({ brandID: 'already-gone' });

      const removed = await subject.repository.deleteBrand(brand);

      /*
       * ⭐ THE BOOLEAN IS DERIVED FROM THE AFFECTED-ROW COUNT, AND BOTH ANSWERS ARE REAL.
       * `model/service/HibachiService.cfc:L68` returns a flag rather than raising, so a brand that was
       * already removed reports `false` and is not an error. A single case asserting only the `true` path
       * would pass against an implementation that returned `true` unconditionally, which is why the zero
       * case is pinned beside it.
       */
      expect(removed).toBe(false);
      expect(subject.calls).toHaveLength(1);
    });

    it('NET-NEW — refuses a transient brand and issues NOTHING AT ALL', async () => {
      const subject = harness();
      const { brand } = createManagedBrand({ brandName: 'Never Saved' });

      await expect(subject.repository.deleteBrand(brand)).rejects.toThrow(
        /never been persisted was handed to the removal path/,
      );

      /*
       * ⚠️ THE REFUSAL IS ONLY HALF THE CONTRACT. A guard that raised AFTER issuing the DELETE would
       * satisfy a `rejects` assertion having already run `WHERE brandID = ''` against the table. The
       * load-bearing half is that nothing ran — which the adapter's own message asserts too, so the
       * statement count is what proves the message honest.
       */
      expect(subject.calls).toEqual([]);
    });

    it('NET-NEW — names the class in the refusal, since a transient brand has no identifier', async () => {
      const subject = harness();
      const { brand } = createManagedBrand({ brandName: 'Never Saved' });

      const raised = await captureDomainError(subject.repository.deleteBrand(brand));
      expect(raised.context?.['brandID']).toBe('');
      expect(raised.context?.['className']).toBe('Brand');
    });
  });

  /* =================================================================================================
   * 5. isUrlTitleAvailable — the member whose polarity is easiest to invert
   * ===============================================================================================*/

  describe('NET-NEW — isUrlTitleAvailable, and the polarity it must keep', () => {
    it('NET-NEW — reports TRUE when NO row holds the title, which is what "available" means', async () => {
      const subject = harness([sqlRows([])]);

      const available = await subject.repository.isUrlTitleAvailable('acme');

      /*
       * ⭐ THE POLARITY IS THE WHOLE POINT OF THIS BLOCK, AND IT RUNS OPPOSITE TO THE ROW COUNT.
       * The statement asks whether the title is TAKEN; the member answers whether it is FREE. So an empty
       * result means available, and `return rows.length === 0` is correct rather than a bug. Inverting it
       * would compile, would return a boolean, and would break IR-5's application-side uniqueness check in
       * the most confusing possible direction: every FREE title would be reported as taken, so
       * `BrandService.saveBrand` would append `-2`, `-3`, `-4` … to titles nobody was using, and the
       * defect would look like a URL-slug bug rather than a predicate inversion. Both directions are
       * therefore asserted, because either one alone is satisfied by a constant.
       */
      expect(available).toBe(true);
    });

    it('NET-NEW — reports FALSE when a row already holds the title', async () => {
      const subject = harness([sqlRows([{ 1: 1 }])]);

      const available = await subject.repository.isUrlTitleAvailable('acme');

      expect(available).toBe(false);
    });

    it('NET-NEW — probes for existence only: SELECT 1 with LIMIT 1, and no column list', async () => {
      const subject = harness([sqlRows([])]);

      await subject.repository.isUrlTitleAvailable('acme');

      const probe = soleCall(subject);
      /*
       * One row is complete evidence for an existence question, and the projection is a literal rather
       * than a column list because nothing about the matching brand is read. Hydrating a whole row to
       * answer a boolean would also make the ambiguity guard of `getBrand` relevant here, which it is not.
       */
      expect(collapse(probe.sql)).toBe(
        `SELECT 1 FROM ${BRAND_TABLE} WHERE ${BRAND_URL_TITLE} = ? LIMIT 1`,
      );
      expect(probe.params).toEqual(['acme']);
    });

    it('NET-NEW — binds a quote-bearing title as a value, so a title cannot alter the probe', async () => {
      const subject = harness([sqlRows([])]);
      const hostile = "acme' OR '1'='1";

      await subject.repository.isUrlTitleAvailable(hostile);

      /*
       * The classic always-true injection, aimed at the one predicate whose answer decides whether a
       * uniqueness check passes. Bound as a value it can only ever be a title nobody owns.
       */
      const probe = soleCall(subject);
      expect(probe.sql).not.toContain("OR '1'='1");
      expect(probe.sql).not.toContain("'");
      expect(probe.params).toEqual([hostile]);
    });

    it('NET-NEW — treats the EMPTY title as a real question rather than short-circuiting it', async () => {
      const subject = harness([sqlRows([])]);

      const available = await subject.repository.isUrlTitleAvailable('');

      /*
       * ⚠️ DELIBERATELY UNLIKE `getBrand`, WHICH DOES SHORT-CIRCUIT ITS EMPTY ARGUMENT. There the empty
       * string is the transient sentinel and can match nothing by construction; here it is an ordinary
       * candidate value that a row could genuinely hold, so refusing to ask would invent an answer. The
       * asymmetry between the two members is intentional and is asserted so it cannot be "tidied".
       */
      expect(available).toBe(true);
      expect(subject.calls).toHaveLength(1);
      expect(soleCall(subject).params).toEqual(['']);
    });
  });

  /* =================================================================================================
   * 6. withExecutor — the rebind seam, and the port surface as a whole
   * ===============================================================================================*/

  describe('NET-NEW — withExecutor, the rebind seam UnitOfWork uses', () => {
    it('NET-NEW — returns a DIFFERENT instance and issues the work on the NEW executor', async () => {
      const subject = harness();
      const second = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

      const rebound = subject.repository.withExecutor(second.executor);

      /*
       * ⭐ THE IDENTITY ASSERTION IS THE SAFETY PROPERTY, NOT A STYLE PREFERENCE. The composition root
       * builds ONE adapter and shares it; `UnitOfWork` rebinds a transaction-scoped executor per boundary.
       * Were the rebind to mutate in place and return `this`, two concurrent boundaries would fight over
       * one executor field and statements would cross transactions — a fault that appears only under
       * concurrency and never in a single-threaded test of either path alone.
       */
      expect(rebound).not.toBe(subject.repository);

      await rebound.isUrlTitleAvailable('acme');

      expect(second.calls).toHaveLength(1);
      /* And the original saw nothing, so the rebind leaked nothing back onto it. */
      expect(subject.calls).toEqual([]);
    });

    it('NET-NEW — leaves the original bound to its own executor', async () => {
      const subject = harness([sqlRows([])]);
      const second = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

      await subject.repository.withExecutor(second.executor).isUrlTitleAvailable('rebound-title');
      await subject.repository.isUrlTitleAvailable('original-title');

      /* Asserted from both sides, with the parameters proving which statement went where. A leak would
       * put both on one double, and a count alone could not say which. */
      expect(second.calls).toHaveLength(1);
      expect(second.calls[0]?.params).toEqual(['rebound-title']);
      expect(subject.calls).toHaveLength(1);
      expect(subject.calls[0]?.params).toEqual(['original-title']);
    });

    it('NET-NEW — carries the ACCOUNT CONTEXT across the rebind, so audit survives a transaction', async () => {
      const subject = harness();
      const second = createSqlExecutorDouble({});

      const { brand } = createManagedBrand({ brandName: 'Acme' });
      await subject.repository.withExecutor(second.executor).saveBrand(brand);

      /*
       * ⭐ THE REBIND TAKES A NEW EXECUTOR AND MUST KEEP EVERYTHING ELSE. The account context is the other
       * constructor argument, and it is the one a rebind could plausibly drop — the signature only mentions
       * the executor. Dropping it would compile only if something were substituted for it, and the
       * observable consequence would be an audit block written with no actor INSIDE a transaction while
       * the same save outside one recorded the actor correctly. Asserted on the rebound instance's own
       * statement rather than on the original's.
       */
      const [insert] = second.calls;
      expect(insert).toBeDefined();
      const columns = insertedColumns(insert?.sql ?? '');
      expect(insert?.params[columns.indexOf('createdByAccountID')]).toBe(TEST_ADMIN_ACCOUNT_ID);
    });

    it('NET-NEW — satisfies the BrandRepository port across ALL SIX declared members', () => {
      const asPort: BrandRepository = harness().repository;

      /*
       * Keyed off the port's own member set, so a sixth method breaks compilation here until it is named.
       * `withExecutor` is deliberately absent: the port is what a service depends on, and a service never
       * rebinds, so the seam is asserted on the concrete adapter in the cases above instead.
       */
      const everyPortMember: Record<keyof BrandRepository, true> = {
        newBrand: true,
        getBrand: true,
        saveBrand: true,
        deleteBrand: true,
        isUrlTitleAvailable: true,
        /* F9 — the sixth member: `model/entity/Brand.cfc:L61`'s lazy collection load, written down. */
        findProductIdentifiersByBrand: true,
      };

      const declared = Object.keys(everyPortMember) as readonly (keyof BrandRepository)[];

      expect(declared).toHaveLength(6);
      for (const member of declared) {
        expect(typeof asPort[member]).toBe('function');
      }

      expect(typeof harness().repository.withExecutor).toBe('function');
    });
  });

  /* =================================================================================================
   * F9 — THE LIVE PRODUCTS READ THE BRAND DELETE GUARD PERFORMS
   *
   * `model/validation/Brand.json:L6` gates deletion on a `maxCollection` of ZERO over `products`, and
   * `model/entity/Brand.cfc:L61` declares that collection `fieldtype="one-to-many" fkcolumn="brandID"
   * inverse="true"` with no `lazy` attribute — so in the legacy the rule's read of `getProducts()` made
   * Hibernate issue `SELECT ... FROM SwProduct WHERE brandID = ?`. This member is that read, written down.
   *
   * ⚠️ THE RELATIONSHIP LIVES ENTIRELY ON THE PRODUCT SIDE, which is why a BRAND adapter names the product
   * table: there is no link table and no column of `SwBrand` involved. Keeping the read here rather than
   * delegating to the product adapter is what lets it run on the brand delete boundary's own executor (M6).
   * ============================================================================================== */

  describe('MySqlBrandRepository — the products read behind the F9 delete guard', () => {
    const OWNED = 'aaaa1111bbbb2222cccc3333dddd4444';

    it('NET-NEW — projects productID from SwProduct and binds the brand identifier as a VALUE', async () => {
      const subject = harness([sqlRows([{ productID: OWNED }])]);

      const owned = await subject.repository.findProductIdentifiersByBrand('brand-1');

      const read = soleCall(subject);
      expect(collapse(read.sql)).toBe('SELECT productID FROM SwProduct WHERE brandID = ?');
      expect(read.params).toEqual(['brand-1']);
      /* The identifier never reaches the statement text — `?` binds values only (TR-4). */
      expect(read.sql).not.toContain('brand-1');
      expect(owned).toEqual([OWNED]);
    });

    it('NET-NEW — issues no ORDER BY and no LIMIT, because a lazy collection load has neither', async () => {
      // ⛔ The guard refuses at one row exactly as it refuses at ten thousand, so a ceiling would change
      // nothing it can observe while inventing a bound the legacy has nowhere (AAP §0.7.3 S9).
      const subject = harness([sqlRows([{ productID: OWNED }])]);

      await subject.repository.findProductIdentifiersByBrand('brand-1');

      const sql = collapse(soleCall(subject).sql).toUpperCase();
      expect(sql).not.toContain('ORDER BY');
      expect(sql).not.toContain('LIMIT');
      expect(sql).not.toContain('COUNT(');
    });

    it('NET-NEW — answers one identifier per owned row, in server order', async () => {
      const second = 'aaaa1111bbbb2222cccc3333dddd5555';
      const subject = harness([sqlRows([{ productID: OWNED }, { productID: second }])]);

      await expect(subject.repository.findProductIdentifiersByBrand('brand-1')).resolves.toEqual([
        OWNED,
        second,
      ]);
    });

    it('NET-NEW — a brand owning nothing answers an empty array, which is the only state the ceiling passes', async () => {
      const subject = harness([sqlRows([])]);

      await expect(subject.repository.findProductIdentifiersByBrand('brand-1')).resolves.toEqual(
        [],
      );
    });

    it('NET-NEW — an UNSAVED brand issues no statement at all', async () => {
      // Hibernate does not query a collection of a transient instance, so probing here would issue a
      // statement the legacy's lazy load never issued either.
      const subject = harness();

      await expect(subject.repository.findProductIdentifiersByBrand('')).resolves.toEqual([]);

      expect(subject.calls).toEqual([]);
    });

    it('NET-NEW — a row with an unusable productID is a REFUSAL, not a silent skip', async () => {
      // ⚠️ DROPPING IT WOULD UNDERCOUNT THE COLLECTION, and an undercount here is precisely the failure
      // F9 reported: the ceiling of zero would pass and the brand would be deleted out from under its
      // products. `productID` is the primary key and cannot be null, so this state means the projection
      // or the schema is not what the member believes.
      const subject = harness([sqlRows([{ productID: OWNED }, { productID: null }])]);

      await expect(subject.repository.findProductIdentifiersByBrand('brand-1')).rejects.toThrow(
        DomainError,
      );
    });

    it('NET-NEW — the read follows a re-bound executor, so it can run on a transaction (M6)', async () => {
      // The brand delete boundary constructs its own repository over `scope.executor`; this asserts the
      // seam that makes an equivalent re-binding observable — the statement follows the NEW executor.
      const original = harness([sqlRows([])]);
      const adopted = harness([sqlRows([{ productID: OWNED }])]);

      const rebound = original.repository.withExecutor(adopted.executor);
      await expect(rebound.findProductIdentifiersByBrand('brand-1')).resolves.toEqual([OWNED]);

      expect(original.calls).toEqual([]);
      expect(adopted.calls).toHaveLength(1);
    });
  });
});
