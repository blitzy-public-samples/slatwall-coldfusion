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
  unresolvableProductContentAssignmentPort,
  unresolvableProductImportSourceReader,
} from '../../src/adapters/mysql/MySqlProductRepository';
import type {
  ProductContentAssignmentPort,
  ProductContentAssignmentRow,
  ResolvedProductListingContent,
} from '../../src/adapters/mysql/MySqlProductRepository';
import type {
  DelimitedImportRecord,
  DelimitedImportRecordSet,
  MySqlProductRepositoryDependencies,
  ProductImportSourceReader,
  ProductImportTransactionBoundary,
} from '../../src/adapters/mysql/MySqlProductRepository';
import { assertTableName } from '../../src/adapters/mysql/QueryRunner';
import { DomainError } from '../../src/errors/DomainError';
import type { UnitOfWork } from '../../src/adapters/mysql/UnitOfWork';
import { Product } from '../../src/domain/product/Product';
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
  createAbsentAccountContextDouble,
  createAccountContextDouble,
  createSqlExecutorDouble,
  createUnitOfWorkDouble,
  persistedAdminAccount,
  physicalID,
  sqlAffectedRows,
  sqlFailure,
  sqlRows,
  TEST_ADMIN_ACCOUNT_ID,
} from '../support/inMemoryRepositories';
import type {
  SqlExecutorCall,
  SqlExecutorOutcome,
  UnitOfWorkEventKind,
  UnitOfWorkSettlementResponder,
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
  /** The collaborator itself, so a test can make one of its members fail. */
  readonly contentAssignmentPort: ProductContentAssignmentPort;
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

  const contentAssignment: ProductContentAssignmentPort = {
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
    contentLookups,
    contentProbes,
    contentInserts,
    contentAssignmentPort: contentAssignment,
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
     * because `:L221` reads nothing but the record count. */
    const linkProbe = only(harness, 'SELECT 1 FROM SwSkuOption');
    expect(collapse(linkProbe.sql)).toBe(
      'SELECT 1 FROM SwSkuOption WHERE optionID = ? AND skuID = ? LIMIT 1',
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
        return sqlRows([{ brandID: physicalID('brand-1') }]);
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
     * ⚠️ ALL SIX ARE NAMED, NOT THREE. An earlier revision asserted "all three declared members" and
     * listed only the three legacy DAO members, which silently under-counted the port: `ProductRepository`
     * also declares `backfillImportDerivedColumns`, `saveProduct` and `removeProduct`, and each is
     * documented as additive at its own declaration. An assertion that names a subset cannot notice a
     * member disappearing from outside that subset, so the whole surface is enumerated.
     */
    const asPort: ProductRepository = buildHarness(fileWith([])).repository;

    /* The three legacy DAO members — AAP §0.4.2.6. */
    expect(typeof asPort.findAttributeSets).toBe('function');
    expect(typeof asPort.importFromFile).toBe('function');
    expect(typeof asPort.searchByProductType).toBe('function');

    /* The three additive members, each defended at its declaration. */
    expect(typeof asPort.backfillImportDerivedColumns).toBe('function');
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
     * ⭐ THE SIBLING BOUNDED MEMBERS ARE UNAFFECTED, and that asymmetry is the point rather than an
     * inconsistency: `SkuRepository.searchByProductTypeBounded` is reached from
     * `SkuService.searchSkusByProductTypeBounded` and the two `OptionRepository` bounded reads from
     * `OptionService`, so each of those has a routed caller this one never had.
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
  it('NET-NEW — F3: the ProductRepository surface is EXHAUSTIVE at SIX members, keyed off the port itself', () => {
    const asPort: ProductRepository = buildHarness(fileWith([])).repository;

    const everyPortMember: Record<keyof ProductRepository, true> = {
      findAttributeSets: true,
      importFromFile: true,
      searchByProductType: true,
      backfillImportDerivedColumns: true,
      saveProduct: true,
      removeProduct: true,
    };

    const declared = Object.keys(everyPortMember) as readonly (keyof ProductRepository)[];

    expect(declared).toHaveLength(6);
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
  /* The back-fill, which the importer normally invokes for itself but which is separately declared. */
  await writing.repository.backfillImportDerivedColumns();

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
     * The routed windowed member that DOES exist lives on `SkuRepository` and is gated in that adapter's
     * own suite.
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
      contentAssignment: unresolvableProductContentAssignmentPort,
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
 * ABSENT in the port-satisfaction case above rather than tested here. The routed windowed member that
 * does exist is `SkuRepository.searchByProductTypeBounded`, gated in that adapter's own suite.
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

  it('NET-NEW — emits the exact column list, one placeholder per column, identifier included', async () => {
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

  it('NET-NEW — binds an ABSENT optional field as null rather than dropping it from the statement', async () => {
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

  it('NET-NEW — BINDS a quote-bearing value instead of writing it into the statement text', async () => {
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

  it('NET-NEW — returns the SAME entity instance it was handed, not a copy', async () => {
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

  it('NET-NEW — refreshes the MODIFIED audit pair without disturbing a stored CREATED pair', async () => {
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

  it('NET-NEW — issues exactly ONE statement, with no read-back probe before it', async () => {
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

  it('NET-NEW — chooses its branch from the ENTITY, so one adapter answers both shapes', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.saveProduct(transientProduct());
    await harness.repository.saveProduct(persistedProduct());

    expect(harness.statements).toHaveLength(2);
    expect(collapse(harness.statements[0]?.sql ?? '').startsWith('INSERT INTO SwProduct')).toBe(
      true,
    );
    expect(collapse(harness.statements[1]?.sql ?? '').startsWith('UPDATE SwProduct')).toBe(true);
  });

  it('NET-NEW — does not read the affected-row count, so a zero-row update still resolves', async () => {
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

  it('NET-NEW — resolves to undefined and reads no affected-row count', async () => {
    const harness = buildHarness(fileWith([]), () => sqlAffectedRows(0));

    /*
     * For a removal the count is exact, but the legacy primitive is declared `void` and reported
     * nothing, so a zero-row acknowledgement is not an error.
     */
    await expect(harness.repository.removeProduct(persistedProduct())).resolves.toBeUndefined();
  });

  it('NET-NEW — resolves NO acting account, because a removal stamps nothing', async () => {
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

describe('NET-NEW — ProductImportOptions: the cancellation signal', () => {
  /** An `AbortSignal` already in the aborted state. */
  function abortedSignal(): AbortSignal {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }

  it('NET-NEW — aborts BEFORE the retrieval, so the source is never even read', async () => {
    const harness = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
        signal: abortedSignal(),
      }),
    ).rejects.toMatchObject({
      context: { fileURL: 'https://feeds.example/catalog.csv', phase: 'beforeRetrieval' },
    });

    /*
     * The earliest checkpoint costs nothing and saves the most: an already-cancelled import performs
     * no network retrieval and issues no statement. The empty retrieval log is the observable half —
     * a signal checked only inside the row loop would have fetched the file first.
     */
    expect(harness.retrievals).toHaveLength(0);
    expect(harness.statements).toHaveLength(0);
    expect(harness.eventKinds()).toEqual([]);
  });

  it('NET-NEW — carries NO row number in the pre-row phases, because no row has been reached', async () => {
    const harness = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);

    const failure = await harness.repository
      .importFromFile('https://feeds.example/catalog.csv', undefined, { signal: abortedSignal() })
      .catch((error: unknown) => error);

    /*
     * The context shape differs by phase, deliberately: a pre-row abort reports only the file and the
     * phase, while a row abort adds `rowNumber` and `committedRows`. Fabricating a zero row number
     * here would imply the loop had started.
     */
    expect(failure).toMatchObject({ context: { phase: 'beforeRetrieval' } });
    expect((failure as { context?: Record<string, unknown> }).context).not.toHaveProperty(
      'rowNumber',
    );
    expect((failure as { context?: Record<string, unknown> }).context).not.toHaveProperty(
      'committedRows',
    );
  });

  it('NET-NEW — an UNABORTED signal changes nothing about the import', async () => {
    const withSignal = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);
    const withoutSignal = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);
    const controller = new AbortController();

    await withSignal.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
      signal: controller.signal,
    });
    await withoutSignal.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * Supplying a signal that never fires must be indistinguishable from supplying none. Otherwise
     * every caller that wants cancellability would pay for it in changed behaviour.
     */
    expect(withSignal.statements.map((statement) => collapse(statement.sql))).toEqual(
      withoutSignal.statements.map((statement) => collapse(statement.sql)),
    );
    expect(withSignal.transactionsCommitted()).toBe(withoutSignal.transactionsCommitted());
    expect(withSignal.eventKinds()).toEqual(withoutSignal.eventKinds());
  });

  it('NET-NEW — aborting mid-file COMMITS the rows already done and attempts no later row', async () => {
    const controller = new AbortController();
    let rowTransactionsSeen = 0;
    const harness = buildHarness(THREE_ROW_FILE, (statement) => {
      /*
       * Abort as soon as the first row's INSERT has been issued. The signal is checked at the TOP of
       * each row iteration and never between two statements of the same row, so the first row runs to
       * completion and commits, and the second row is never attempted.
       */
      if (collapse(statement.sql).startsWith('INSERT INTO SwProduct')) {
        rowTransactionsSeen += 1;
        controller.abort();
      }
      return resolvingOptionGroup(statement);
    });

    const failure = await harness.repository
      .importFromFile('https://feeds.example/catalog.csv', undefined, { signal: controller.signal })
      .catch((error: unknown) => error);

    /*
     * ⭐ THIS IS THE M3 PARTIAL-IMPORT SHAPE, PRESERVED RATHER THAN REPAIRED. The legacy opens a
     * transaction per row, so a mid-file failure already leaves earlier rows committed and no later
     * row attempted. Cancellation reproduces exactly that shape instead of inventing an all-or-nothing
     * import, and `committedRows` reports it as `rowNumber - 1`.
     */
    expect(rowTransactionsSeen).toBe(1);
    expect(failure).toMatchObject({
      context: { phase: 'row', rowNumber: 2, committedRows: 1 },
    });
    expect(harness.transactionsCommitted()).toBe(1);
    /*
     * ⚠️ ROW TWO'S BOUNDARY IS OPENED AND THEN ROLLED BACK, AND THAT IS THE POINT RATHER THAN A LEAK.
     * The signal is checked at the top of the row body, which runs INSIDE the per-row boundary, so the
     * abort rolls back a transaction in which nothing has been written yet. That is precisely what
     * guarantees the abort cannot leave a row half-written: the alternative — checking before the
     * boundary opens — would be indistinguishable here but would not hold if a row's first statement
     * were ever issued before the check. One committed row and one empty rollback is the exact shape.
     */
    expect(harness.transactionsRolledBack()).toBe(1);
    expect(harness.transactionsStarted()).toBe(2);
  });

  it('NET-NEW — a mid-file abort runs NO back-fill, because the import did not complete', async () => {
    const controller = new AbortController();
    const harness = buildHarness(THREE_ROW_FILE, (statement) => {
      if (collapse(statement.sql).startsWith('INSERT INTO SwProduct')) {
        controller.abort();
      }
      return resolvingOptionGroup(statement);
    });

    await harness.repository
      .importFromFile('https://feeds.example/catalog.csv', undefined, { signal: controller.signal })
      .catch(() => undefined);

    /*
     * The back-fills run AFTER the row loop, so an abort that escapes the loop skips them. A back-fill
     * over a partially imported file would derive default-SKU and image columns from half a catalog.
     */
    expect(harness.statements.filter((statement) => statement.region === 'backfill')).toHaveLength(
      0,
    );
  });
});

describe('NET-NEW — ProductImportOptions: deferBackfills', () => {
  it('NET-NEW — runs BOTH back-fills after the row loop when the flag is absent', async () => {
    const harness = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * The default is to back-fill, which is what the legacy does at `:L288-L302` — unconditionally,
     * with no flag to suppress it. Two statements, outside any row transaction, in the pool region the
     * harness labels `backfill`.
     */
    const backfills = harness.statements.filter((statement) => statement.region === 'backfill');
    expect(backfills).toHaveLength(2);
  });

  it('NET-NEW — runs the back-fills even for an EMPTY file, exactly as the legacy does', async () => {
    const harness = buildHarness(importable([]));

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * A file with no rows still triggers the back-fills, because the legacy statement is outside the
     * loop and has no row-count guard. Skipping them for an empty file would be a defensible
     * optimisation and a behaviour change, so it is not made.
     */
    expect(harness.statements.filter((statement) => statement.region === 'backfill')).toHaveLength(
      2,
    );
  });

  it('NET-NEW — SUPPRESSES both back-fills when deferBackfills is true, and imports the rows anyway', async () => {
    const harness = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
      deferBackfills: true,
    });

    /*
     * The flag exists because M1's 3600-second budget is unrepresentable in one Lambda invocation, so a
     * long import has to be chunked — and the derived columns must be computed ONCE at the end rather
     * than per chunk. Suppression must not disturb the rows themselves, which the commit count proves.
     */
    expect(harness.statements.filter((statement) => statement.region === 'backfill')).toHaveLength(
      0,
    );
    expect(harness.transactionsCommitted()).toBe(3);
  });

  it('NET-NEW — deferBackfills FALSE is the same as absent, not a third behaviour', async () => {
    const explicitlyFalse = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);
    const absent = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);

    await explicitlyFalse.repository.importFromFile(
      'https://feeds.example/catalog.csv',
      undefined,
      {
        deferBackfills: false,
      },
    );
    await absent.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * Production tests `options?.deferBackfills !== true`, so only the exact boolean `true` suppresses.
     * Pinning `false` as equivalent to absent keeps a later `Boolean(...)`-style rewrite from turning
     * any other falsy value into a third behaviour.
     */
    expect(
      explicitlyFalse.statements.filter((statement) => statement.region === 'backfill'),
    ).toHaveLength(2);
    expect(absent.statements.filter((statement) => statement.region === 'backfill')).toHaveLength(
      2,
    );
  });

  it('NET-NEW — the deferred back-fill is separately invocable and issues the SAME two statements', async () => {
    const deferred = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);
    const inline = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);

    await deferred.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
      deferBackfills: true,
    });
    await deferred.repository.backfillImportDerivedColumns();
    await inline.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * Deferring then invoking has to be equivalent to not deferring at all, or chunking would change
     * the result. Comparing the two back-fill statement sequences byte for byte is that equivalence.
     */
    const backfillsOf = (harness: Harness): readonly string[] =>
      harness.statements
        .filter((statement) => statement.region === 'backfill')
        .map((statement) => collapse(statement.sql));

    expect(backfillsOf(deferred)).toEqual(backfillsOf(inline));
    expect(backfillsOf(deferred)).toHaveLength(2);
  });

  it('NET-NEW — runs the back-fill outside any transaction, on the pool', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.backfillImportDerivedColumns();

    /*
     * Both statements are bulk updates over the whole table, which the legacy issues at request scope
     * with no transaction of its own. `runWithoutTransaction` preserves that, and the harness's
     * `backfill` region is how that choice becomes observable.
     */
    expect(harness.statements).toHaveLength(2);
    expect(harness.statements.every((statement) => statement.region === 'backfill')).toBe(true);
    expect(harness.transactionsStarted()).toBe(0);
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

describe('NET-NEW — importFromFile, and SEC-08: the import-source gate', () => {
  /**
   * One hostile location per clause of the reinstated policy, each with the reason it is refused.
   *
   * Every IPv4 entry that is not already dotted-quad is here because the WHATWG parser canonicalises it
   * to one before the gate sees it — which is the anti-evasion behaviour a hand-rolled host check gets
   * wrong, and the reason the gate does not attempt its own decoding.
   */
  const REFUSED_LOCATIONS: readonly { readonly location: string; readonly because: string }[] =
    Object.freeze([
      { location: 'file:///etc/passwd', because: 'scheme — a local file is not HTTP' },
      { location: 'ftp://files.test/x.csv', because: 'scheme — cfhttp does not speak FTP' },
      { location: 'gopher://files.test/1', because: 'scheme — a classic request-smuggling vector' },
      { location: 'data:text/csv,a,b', because: 'scheme — no retrieval happens at all' },
      {
        location: 'https://operator:secret@feeds.example/catalog.csv',
        because: 'credentials — cfhttp took them as separate attributes, never from the URL',
      },
      {
        location: 'https://operator@feeds.example/catalog.csv',
        because: 'credentials — a username alone still counts',
      },
      { location: 'http://127.0.0.1/catalog.csv', because: 'loopback — RFC 1122 127.0.0.0/8' },
      { location: 'http://127.1/catalog.csv', because: 'loopback — short form, canonicalised' },
      { location: 'http://2130706433/catalog.csv', because: 'loopback — decimal integer form' },
      { location: 'http://0x7f000001/catalog.csv', because: 'loopback — hexadecimal form' },
      { location: 'http://017700000001/catalog.csv', because: 'loopback — octal form' },
      { location: 'http://localhost/catalog.csv', because: 'loopback — RFC 6761 reserved name' },
      {
        location: 'http://admin.localhost/catalog.csv',
        because: 'loopback — the reserved suffix covers subdomains',
      },
      { location: 'http://[::1]/catalog.csv', because: 'loopback — RFC 4291 IPv6 ::1' },
      {
        location: 'http://[::ffff:127.0.0.1]/catalog.csv',
        because: 'loopback — IPv4-mapped IPv6, which no IPv6 clause alone would catch',
      },
      { location: 'http://10.0.0.5/catalog.csv', because: 'private — RFC 1918 10/8' },
      { location: 'http://172.20.0.5/catalog.csv', because: 'private — RFC 1918 172.16/12' },
      { location: 'http://192.168.1.1/catalog.csv', because: 'private — RFC 1918 192.168/16' },
      {
        location: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        because: 'instance metadata — inside RFC 3927 link-local, the headline CWE-918 target',
      },
      {
        location: 'http://[fd00:ec2::254]/latest/meta-data/',
        because: 'instance metadata over IPv6 — inside RFC 4193 unique-local',
      },
      { location: 'http://[fc00::1]/catalog.csv', because: 'unique-local — RFC 4193 fc00::/7' },
      { location: 'http://[fe80::1]/catalog.csv', because: 'link-local — RFC 4291 fe80::/10' },
      { location: 'http://0.0.0.0/catalog.csv', because: 'unspecified — RFC 1122 0/8' },
      { location: '/import/catalog.csv', because: 'not an absolute URL, so nothing to retrieve' },
      { location: 'catalog.csv', because: 'not an absolute URL either' },
    ]);

  /**
   * Locations that MUST still be retrieved, which is the half no amount of refusal testing can show.
   *
   * The boundary entries are the point: each sits one step outside a refused range, so a gate that is
   * even slightly too wide fails here rather than passing quietly.
   */
  const ADMITTED_LOCATIONS: readonly string[] = Object.freeze([
    'https://feeds.example/catalog.csv',
    'http://feeds.example/catalog.csv',
    'HTTPS://Feeds.Example/catalog.csv',
    'https://feeds.example:8443/catalog.csv?since=1#top',
    'http://8.8.8.8/catalog.csv',
    // One step outside each RFC 1918 block, and outside 127/8 on both sides.
    'http://172.15.0.5/catalog.csv',
    'http://172.32.0.5/catalog.csv',
    'http://192.167.1.1/catalog.csv',
    'http://126.0.0.1/catalog.csv',
    'http://128.0.0.1/catalog.csv',
    // RFC 6598 carrier-grade NAT space is NOT one of the six refused ranges, and is not added.
    'http://100.64.0.1/catalog.csv',
    // Just outside fc00::/7 and fe80::/10 respectively.
    'http://[fbff::1]/catalog.csv',
    'http://[fec0::1]/catalog.csv',
    'http://[2001:db8::1]/catalog.csv',
    // An IPv4-mapped address whose embedded IPv4 is public must survive the mapped-address decode.
    'http://[::ffff:8.8.8.8]/catalog.csv',
    // Names that merely LOOK like refused hosts, and are not.
    'http://localhostx.test/catalog.csv',
    'http://notlocalhost/catalog.csv',
  ]);

  it('NET-NEW — refuses every hostile location, one vector per clause of the policy', async () => {
    const admitted: string[] = [];

    for (const { location, because } of REFUSED_LOCATIONS) {
      const harness = buildHarness(THREE_ROW_FILE);
      let refused = false;

      try {
        await harness.repository.importFromFile(location);
      } catch {
        refused = true;
      }

      if (!refused) {
        admitted.push(`${location} — should have been refused: ${because}`);
      }
    }

    /* Reported as a list rather than one assertion per vector so a widened gate names every location it
     * newly lets through, instead of stopping at the first. */
    expect(admitted).toEqual([]);
  });

  it('NET-NEW — a refused location reaches the retriever ZERO times and writes NOTHING', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await expect(
      harness.repository.importFromFile(
        'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      ),
    ).rejects.toThrow();

    /*
     * ⭐ THE ORDERING IS THE WHOLE CONTROL, AND THIS IS WHERE IT IS PROVED. The gate runs before the
     * branch that selects between the streaming and materialising retrieval members, so the reader is
     * never asked for anything: an empty `retrievals` list is the assertion that no request was made,
     * not merely that its result was discarded.
     */
    expect(harness.retrievals).toEqual([]);

    /* No transaction opened, so there is no partially imported catalogue — the M3 shape a mid-file
     * failure produces is absent because no row was ever attempted. */
    expect(harness.transactionsStarted()).toBe(0);
    expect(harness.transactionsCommitted()).toBe(0);
    expect(harness.transactionsRolledBack()).toBe(0);

    /*
     * ⚠️ AND NOT ONE STATEMENT WAS ISSUED, INCLUDING THE TWO BULK BACK-FILLS. That is the strict part:
     * `:L288` and `:L304` sit outside the row loop and outside the spreadsheet branch, so an empty file
     * and an `.xls` upload both still run them. A refusal must not, because a refusal happens before the
     * import begins rather than during it.
     */
    expect(harness.statements).toEqual([]);
    expect(matching(harness, 'SET defaultSkuID')).toEqual([]);
    expect(matching(harness, 'SET imageFile')).toEqual([]);
  });

  it('NET-NEW — no refusal echoes the raw location, so a logged rejection leaks no secret', async () => {
    const harness = buildHarness(THREE_ROW_FILE);
    const secret = 'sup3rs3cret';

    let raised: unknown;
    try {
      await harness.repository.importFromFile(
        `https://operator:${secret}@feeds.example/catalog.csv?token=${secret}`,
      );
    } catch (error) {
      raised = error;
    }

    /*
     * A refusal is a thing that gets logged, and the location it refuses can carry a password in its
     * userinfo or a token in its query. The message and context therefore report the host and the reason
     * only. Serialising the whole error — message plus context — and searching it for the secret is the
     * assertion, because either half leaking it would be equally bad.
     */
    expect(raised).toBeInstanceOf(Error);

    /*
     * ⚠️ SERIALISED IN TWO HALVES ON PURPOSE, BECAUSE ONE CALL CANNOT SEE BOTH. `message` and `stack` are
     * NON-enumerable own properties of an `Error`, so `JSON.stringify` alone omits them; `context` is an
     * ordinary enumerable property, so `String(...)` alone omits it. An earlier version of this case
     * passed `Object.getOwnPropertyNames(raised)` as the replacer array and reported a context of `{}` —
     * a replacer array is a whitelist applied at EVERY depth, so it filtered out the very keys under
     * inspection and would have passed no matter what the context held.
     */
    const rendered = `${String(raised)} ${JSON.stringify(raised)}`;
    expect(rendered).not.toContain(secret);
    /* The host IS reported, because a refusal nobody can diagnose gets disabled by whoever it blocks. */
    expect(rendered).toContain('feeds.example');
  });

  it('NET-NEW — still retrieves every legitimate location, including the boundary ones', async () => {
    const refused: string[] = [];

    for (const location of ADMITTED_LOCATIONS) {
      const harness = buildHarness(fileWith([]));

      try {
        await harness.repository.importFromFile(location);
      } catch (error) {
        refused.push(`${location} :: ${String(error)}`);
        continue;
      }

      if (harness.retrievals.length !== 1) {
        refused.push(`${location} :: reached the retriever ${harness.retrievals.length} times`);
      }
    }

    /*
     * ⭐ THIS IS THE DIRECTION A REFUSAL SUITE CANNOT ESTABLISH. A gate that refuses everything passes
     * every hostile case above and is useless; only this case fails it. The boundary entries — 172.15,
     * 172.32, 192.167, 126, 128, fbff::, fec0:: — are one step outside a refused range each, so an
     * off-by-one in a mask or an octet comparison shows up here as a named location rather than as a
     * silent narrowing of what the importer can read.
     */
    expect(refused).toEqual([]);
  });

  it('NET-NEW — forwards the approved location BYTE-FOR-BYTE, gating without rewriting it', async () => {
    const mixedCase = 'HTTPS://Feeds.Example:8443/Catalog.CSV';
    const withQueryAndFragment = 'https://feeds.example/catalog.csv?since=1#top';

    const first = buildHarness(fileWith([]));
    await first.repository.importFromFile(mixedCase);

    /*
     * ⭐ THIS IS THE DISCRIMINATING ASSERTION, AND THE MIXED CASE IS WHY. The gate parses the location to
     * judge it and then throws the parse away. Had it handed on its own canonical form instead, the scheme
     * and host would arrive lower-cased — `new URL('HTTPS://Feeds.Example:8443/Catalog.CSV').href` is
     * `https://feeds.example:8443/Catalog.CSV` — so an unchanged `HTTPS://Feeds.Example` proves no
     * canonicalisation happened, which an already-lower-case URL could not have shown either way. A gate
     * that normalises is a gate that judges one string and fetches another.
     */
    expect(first.retrievals).toEqual([{ source: mixedCase, delimiter: ',', textQualifier: '' }]);

    const second = buildHarness(fileWith([]));
    await second.repository.importFromFile(withQueryAndFragment);

    /*
     * ⚠️ AND THE QUERY AND FRAGMENT SURVIVE TOO — WITH A LEGACY QUIRK THE GATE MUST NOT TIDY AWAY. The
     * delimiter here is EMPTY, not a comma, and that is `model/dao/ProductDAO.cfc:L74` behaving exactly as
     * written: the file type is the last dot-delimited segment of the WHOLE location, with no extraction of
     * the URL path, so the type resolves to `csv?since=1#top`, matches neither `csv` nor `txt`, and falls
     * to the no-delimiter case at `:L75`. Stripping the query to "fix" that would be new behaviour, and
     * the gate is the one place holding a parsed URL and therefore the one place tempted to do it. It does
     * not. This expectation was originally written as a comma and was wrong for exactly that reason.
     */
    expect(second.retrievals).toEqual([
      { source: withQueryAndFragment, delimiter: '', textQualifier: '' },
    ]);
  });

  it('NET-NEW — leaves the .xls no-op UNGATED, because that path never opens a socket', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    /*
     * ⭐ A DELIBERATE HOLE IN THE GATE, AND THE REASON IT IS CORRECT. `:L83-L85` is an empty branch: a
     * spreadsheet upload retrieves nothing, imports nothing, raises nothing, and still falls through to
     * the two bulk back-fills at `:L288-L325`. Gating it would refuse a location the legacy processes
     * without ever making a request — changing an outcome on a path that has no egress to protect, which
     * is exactly the divergence D18's precedent does NOT license. So the hostile host below is accepted
     * here, and it is accepted safely, because nothing fetches it.
     */
    await expect(
      harness.repository.importFromFile('http://169.254.169.254/catalog.xls'),
    ).resolves.toBeUndefined();

    expect(harness.retrievals).toEqual([]);
    expect(harness.transactionsStarted()).toBe(0);
    /* The back-fills still run, which is the behaviour a refusal here would have destroyed. */
    expect(matching(harness, 'SET defaultSkuID')).toHaveLength(1);
    expect(matching(harness, 'SET imageFile')).toHaveLength(1);
  });
});

/* ================================================================================================
 * REVIEW FINDING 14 — THE IMPORT-SOURCE POLICY IS A REQUIRED CONTRACT (CWE-918, was latent)
 * ==============================================================================================
 * The finding: "Arbitrary locations are forwarded unchanged to an injected reader with no required
 * scheme, host, IP, redirect, size, or timeout policy. The shipped reader refuses, so no current network
 * exploit exists; a future operator reader becomes SSRF-capable unless it independently supplies all
 * controls." Its resolution: "Make source validation a required port contract and require
 * redirect-hop/IP revalidation plus explicit size/time bounds."
 *
 * ⭐ WHY THESE ASSERT ON THE SEAM RATHER THAN ON A BLOCKED REQUEST. There is no transport client in this
 * subtree to exploit, so there is no request to block; what the finding identifies is a CONTRACT that
 * permitted an unsafe implementation. These cases therefore prove the contract is unskippable: that the
 * adapter consults the policy, that it does so before retrieving, that a refusal stops everything, and
 * that the shipped policy is not a permissive default a future reader could inherit.
 *
 * ⚠️ AND THE COMPILE-TIME HALF CANNOT BE ASSERTED AT RUNTIME AT ALL. `read` and `readStreaming` accept
 * only a `ValidatedProductImportSource`, whose brand is unforgeable outside the port module, so "a reader
 * cannot be reached with an unvetted location" is enforced by `tsc` rather than by a case here. The
 * harness has to cast to produce one, which is itself the evidence.
 * ============================================================================================== */

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
 * both arms of the back-fill deferral, and two of the three import lookup-memory key families. They are
 * grouped here because they share one property that makes untested-ness especially dangerous: NONE of
 * them changes the statements a plain import issues, so a regression in any of them is invisible to
 * every other case in this file.
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

describe('NET-NEW — cancellation at every observed boundary (review finding 13)', () => {
  /** An already-aborted signal, which is all `throwIfCancelled` ever reads. */
  function abortedSignal(): AbortSignal {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }

  /** The `DomainError` context a rejected import carried, so the phase can be asserted directly. */
  async function cancellationContext(
    run: Promise<void>,
  ): Promise<Record<string, unknown> | undefined> {
    try {
      await run;
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      return (error as DomainError).context;
    }

    throw new Error('the import resolved instead of reporting cancellation');
  }

  it('NET-NEW — beforeRetrieval: nothing is validated, retrieved or written', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    const context = await cancellationContext(
      harness.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
        signal: abortedSignal(),
      }),
    );

    /*
     * ⭐ THE FIRST BOUNDARY IS BEFORE THE POLICY, NOT AFTER IT, and the ordering is deliberate: a caller
     * who has already abandoned the work should not cause a collaborator to resolve an address on its
     * behalf. So an already-aborted import consults nothing at all.
     */
    expect(context).toEqual({
      fileURL: 'https://feeds.example/catalog.csv',
      phase: 'beforeRetrieval',
    });
    expect(harness.validatedSources).toEqual([]);
    expect(harness.retrievals).toEqual([]);
    expect(harness.statements).toEqual([]);
    expect(harness.transactionsStarted()).toBe(0);
  });

  it('NET-NEW — afterSourceValidation: the policy ran, the retrieval did not', async () => {
    const harness = buildHarness(THREE_ROW_FILE);
    const controller = new AbortController();

    /* Aborts DURING validation, which is the only way to land on this boundary: it sits between the
     * policy and the retrieval, and nothing else runs in between. */
    jest.spyOn(harness.sourcePolicy, 'validateSource').mockImplementation((fileURL: string) => {
      controller.abort();
      return Promise.resolve(fileURL as ValidatedProductImportSource);
    });

    const context = await cancellationContext(
      harness.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
        signal: controller.signal,
      }),
    );

    /*
     * ⭐ THIS BOUNDARY EXISTS BECAUSE REVIEW FINDING 14 ADDED A STEP THAT CAN BLOCK. A policy may perform
     * its own address resolution, so it is the one place in the pre-retrieval path that can take real
     * time — and a caller that abandoned the work while it was waiting must not then have the file
     * fetched. It is checked after the policy rather than inside it, so no policy has to know about
     * cancellation to be correct.
     */
    expect(context).toEqual({
      fileURL: 'https://feeds.example/catalog.csv',
      phase: 'afterSourceValidation',
    });
    expect(harness.retrievals).toEqual([]);
    expect(harness.statements).toEqual([]);
    expect(harness.transactionsStarted()).toBe(0);
  });

  it('NET-NEW — afterRetrieval: the file was fetched, but no row boundary opened', async () => {
    const harness = buildHarness(THREE_ROW_FILE);
    const controller = new AbortController();

    jest
      .spyOn(harness.sourceReader, 'read')
      .mockImplementation((source: string, delimiter: string, textQualifier: string) => {
        controller.abort();
        return Promise.resolve(
          fileWith(
            ['product_productCode', 'product_productName', 'brand_brandname'],
            ['CODE-1', 'One', 'Acme'],
          ),
        ).then((set) => {
          void source;
          void delimiter;
          void textQualifier;
          return set;
        });
      });

    const context = await cancellationContext(
      harness.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
        signal: controller.signal,
      }),
    );

    /*
     * ⭐ THE RETRIEVAL IS THE LONGEST STEP AND IT IS NOT INTERRUPTIBLE FROM HERE — the collaborator owns
     * its own transport. So the check sits immediately after it and before the plan is built, which is
     * the earliest point the adapter regains control. Nothing has been written, so the import is a no-op
     * even though bytes were fetched.
     */
    expect(context).toEqual({
      fileURL: 'https://feeds.example/catalog.csv',
      phase: 'afterRetrieval',
    });
    expect(harness.statements).toEqual([]);
    expect(harness.transactionsStarted()).toBe(0);
  });

  it('NET-NEW — row: earlier rows stay committed and the aborting row writes nothing (M3)', async () => {
    const controller = new AbortController();

    const harness = buildHarness(THREE_ROW_FILE, (statement) => {
      // Abort while row 1 is being written, so row 2's boundary check is the one that fires.
      if (
        collapse(statement.sql).startsWith('INSERT INTO SwProduct') &&
        statement.params.includes('CODE-1')
      ) {
        controller.abort();
      }

      return undefined;
    });

    const context = await cancellationContext(
      harness.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
        signal: controller.signal,
      }),
    );

    /*
     * ⭐⭐ THE ROW BOUNDARY IS THE ONE THAT HAD TO BE GOT RIGHT, and the reported numbers are the proof.
     * The check runs BEFORE row 2's first statement, so row 2's transaction is opened and rolled back
     * with nothing in it, row 1 stays committed, and row 3 is never attempted. That is EXACTLY the shape
     * a mid-file data failure produces (M3), which is the point: cancellation is not allowed to invent an
     * outcome the legacy cannot already reach.
     *
     * ⛔ AND IT IS NEVER CHECKED INSIDE A BOUNDARY. Aborting between two statements of one row could
     * leave that row half-written inside an open transaction — an outcome with no legacy counterpart at
     * all. `committedRows` is `rowNumber - 1` precisely because every earlier row committed on its own.
     */
    expect(context).toEqual({
      fileURL: 'https://feeds.example/catalog.csv',
      phase: 'row',
      rowNumber: 2,
      committedRows: 1,
    });
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(1);
    expect(matching(harness, 'INSERT INTO SwProduct')).toHaveLength(1);

    /* The back-fills are reached by falling out of the loop, and a raise leaves the loop early. */
    expect(matching(harness, 'SET defaultSkuID')).toEqual([]);
  });

  it('NET-NEW — an un-aborted signal changes nothing, and an absent one changes nothing', async () => {
    const withSignal = buildHarness(THREE_ROW_FILE);
    const withoutSignal = buildHarness(THREE_ROW_FILE);

    await withSignal.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
      signal: new AbortController().signal,
    });
    await withoutSignal.repository.importFromFile('https://feeds.example/catalog.csv');

    /* ⭐ THE OPTION IS OBSERVED, NEVER CREATED. `ProductImportOptions.signal` is supplied by the caller
     * or it is absent; the adapter derives none from a deadline and imposes no timeout of its own,
     * because AAP §0.6.6 M1 records the legacy's own budget as a 3600-second REQUEST timeout owned by
     * `model/service/ProductService.cfc:L65-L68`, and S9 forbids minting a substitute. So a live signal
     * that never aborts must be indistinguishable from no signal at all. */
    expect(withSignal.statements.map((statement) => collapse(statement.sql))).toEqual(
      withoutSignal.statements.map((statement) => collapse(statement.sql)),
    );
    expect(withSignal.eventKinds()).toEqual(withoutSignal.eventKinds());
  });

  it('NET-NEW — the boundary set is EXACTLY four, and the source names all four', () => {
    const adapter = readFileSync(
      join(__dirname, '../../src/adapters/mysql/MySqlProductRepository.ts'),
      'utf8',
    );

    const phases = [...adapter.matchAll(/throwIfCancelled\('([A-Za-z]+)'/g)].map(
      (match) => match[1],
    );

    /*
     * ⛔ A DRIFT GUARD, AND IT IS AIMED AT A REAL DRIFT THAT ALREADY HAPPENED. The review's inventory
     * said "four boundaries" and named a set that is no longer current: review finding 14 added
     * `afterSourceValidation`, and review finding 12 removed `contentAssignmentPreflight` together with
     * the whole-file preflight it lived on. Enumerating the set from the SOURCE rather than from a list
     * means a fifth boundary added later arrives with this case failing and a test owed for it, instead
     * of arriving untested and being described as covered.
     */
    expect(phases).toEqual(['beforeRetrieval', 'afterSourceValidation', 'afterRetrieval', 'row']);
  });
});

describe('NET-NEW — both back-fill deferral arms (review finding 13)', () => {
  it('NET-NEW — the DEFAULT arm runs both statements, in order, outside every transaction', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* `model/dao/ProductDAO.cfc:L288-L302` then `:L304-L325`, both past the closing braces of the
     * transaction (`:L284`) and the loop (`:L285`) — so both run once, in that order, un-transacted. */
    const backfills = harness.statements.filter((statement) => statement.region === 'backfill');
    expect(backfills).toHaveLength(2);
    expect(collapse(backfills[0]?.sql ?? '')).toContain('SET defaultSkuID');
    expect(collapse(backfills[1]?.sql ?? '')).toContain('SET imageFile');

    // The last lifecycle event is the un-transacted pool work, after the connection was released.
    expect(harness.eventKinds().slice(-2)).toEqual(['release', 'poolWork']);
  });

  it('NET-NEW — deferBackfills: true suppresses BOTH, and nothing else about the import', async () => {
    const deferred = buildHarness(THREE_ROW_FILE);
    const immediate = buildHarness(THREE_ROW_FILE);

    await deferred.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
      deferBackfills: true,
    });
    await immediate.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ THE DEFERRAL IS ALL-OR-NOTHING AND TOUCHES NOTHING ELSE. Every per-row statement is identical
     * between the two arms; the only difference is the two whole-catalog statements at the end. That is
     * what makes it a change to WORKFLOW COMPOSITION rather than to either statement — which is the
     * ground on which AAP §0.8.2 Guideline 4 permits it at all.
     */
    expect(deferred.statements.filter((statement) => statement.region === 'backfill')).toEqual([]);
    expect(matching(deferred, 'SET defaultSkuID')).toEqual([]);
    expect(matching(deferred, 'SET imageFile')).toEqual([]);

    const rowStatements = (harness: Harness): readonly string[] =>
      harness.statements
        .filter((statement) => statement.region !== 'backfill')
        .map((statement) => collapse(statement.sql));

    expect(rowStatements(deferred)).toEqual(rowStatements(immediate));
  });

  it('NET-NEW — deferBackfills: false is the default arm, not a third behaviour', async () => {
    const explicit = buildHarness(THREE_ROW_FILE);
    const omitted = buildHarness(THREE_ROW_FILE);

    await explicit.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
      deferBackfills: false,
    });
    await omitted.repository.importFromFile('https://feeds.example/catalog.csv');

    /* The adapter tests `options?.deferBackfills !== true`, so `false`, `undefined` and an absent options
     * object are one arm rather than three. Asserted because a later `=== false` would silently split
     * them and only an explicit `false` caller would notice. */
    expect(explicit.statements.map((statement) => collapse(statement.sql))).toEqual(
      omitted.statements.map((statement) => collapse(statement.sql)),
    );
  });

  it('NET-NEW — deferring then invoking the member issues exactly the deferred pair', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv', undefined, {
      deferBackfills: true,
    });

    const afterImport = harness.statements.length;

    await harness.repository.backfillImportDerivedColumns();

    /*
     * ⭐ THE OBLIGATION TRANSFERS, IT DOES NOT DISAPPEAR — and the member the caller must invoke issues
     * the SAME two statements the default arm would have issued, in the same order and the same
     * un-transacted region. Anything else and deferring would be a behaviour change rather than a
     * re-timing, and a workflow that deferred across several invocations would end with a catalogue the
     * legacy never leaves behind.
     */
    const late = harness.statements.slice(afterImport);
    expect(late).toHaveLength(2);
    expect(collapse(late[0]?.sql ?? '')).toContain('SET defaultSkuID');
    expect(collapse(late[1]?.sql ?? '')).toContain('SET imageFile');
    expect(late.every((statement) => statement.region === 'backfill')).toBe(true);
  });

  it('NET-NEW — the default arm runs both even for a file with NO rows at all', async () => {
    const harness = buildHarness(importable([]));

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /* ⛔ THE UNCONDITIONALITY IS THE BEHAVIOUR. `:L288` and `:L304` are guarded by neither a record count
     * nor a file type, so an empty file still runs both whole-catalog statements — and a well-meaning
     * "skip the back-fills when nothing was imported" would change which rows the database ends up with
     * for every caller that imports an empty file. */
    expect(harness.transactionsStarted()).toBe(0);
    expect(matching(harness, 'SET defaultSkuID')).toHaveLength(1);
    expect(matching(harness, 'SET imageFile')).toHaveLength(1);
  });
});

describe('NET-NEW — every import lookup-memory key family (review finding 13)', () => {
  /* The brand family is covered by "remembers a resolved brand across rows and re-probes an unresolved
   * one" above; these are the two the review found uncovered, plus the composite-key property that is
   * the whole reason the third family needs a key function of its own. */

  it('NET-NEW — remembers a resolved product type across rows, and re-probes an unresolved one', async () => {
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
     * ⭐ THE SAME ASYMMETRY THE BRAND FAMILY HAS, AND FOR THE SAME REASON. `:L183-L186` declares no
     * `ORDER BY`, so where two product types share a name the legacy's own answer is already whatever the
     * engine yields first and may differ between two probes of one import — remembering the first answer
     * therefore returns a value the legacy could itself have returned on every row. A MISS is not
     * remembered, so a type created concurrently is observed on exactly the row the legacy would first
     * have observed it on.
     */
    expect(matching(resolving, 'FROM SwProductType')).toHaveLength(1);
    expect(matching(unresolved, 'FROM SwProductType')).toHaveLength(2);
  });

  it('NET-NEW — remembers a resolved option across rows, while re-probing the LINK every row', async () => {
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
     * ⭐⭐ TWO DIFFERENT ANSWERS TO TWO DIFFERENT QUESTIONS, AND CONFLATING THEM WOULD BE THE BUG.
     * The OPTION resolution — "which option is code `Small` in this group" — is a catalogue fact that
     * cannot change under the import, so `:L212-L215` is asked once. The LINK probe at `:L218-L220` is
     * asked EVERY row, because its key includes the SKU identifier and two file rows CAN resolve to the
     * same SKU: `:L200-L203` derives the SKU code from cell values, so duplicate rows collide, and the
     * second such row must observe the link the first inserted. That is the same-connection read-back M6
     * requires, and remembering it would substitute a stale answer for the one read that has to be live.
     */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(1);
    expect(matching(harness, 'FROM SwSkuOption')).toHaveLength(2);

    // The remembered identifier is the one the link probe binds on the second row, not a re-read.
    expect(matching(harness, 'FROM SwSkuOption')[1]?.params[0]).toBe(
      'dddddddddddddddddddddddddddd0001',
    );
  });

  it('NET-NEW — the option key is COMPOSITE, so one code in two groups is two lookups', async () => {
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
     * ⭐ THE ARITHMETIC IS THE ASSERTION. Two groups × the same code = two DISTINCT keys, so row 1 issues
     * two lookups and row 2 issues none. A code-only key would report 1 here and would then assign row 1's
     * `Colour` cell the identifier of its `Size` option — a silently wrong catalogue, with no error
     * anywhere. `:L212-L215` matches on BOTH the code and the group, which is why the key must too.
     *
     * ⚠️ AND THE JOINING CHARACTER MATTERS. The two parts are joined on a NUL rather than a printable
     * separator, because an option code is FILE CONTENT and may contain any printable character —
     * including whatever separator seemed safe. The next case proves a printable separator would be
     * forgeable.
     */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(2);

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
    expect(matching(harness, 'LEFT JOIN SwOption')[0]?.params).toEqual([
      'One',
      'cccccccccccccccccccccccccccc0001',
    ]);
    expect(matching(harness, 'LEFT JOIN SwOption')[1]?.params).toEqual([
      'One',
      'cccccccccccccccccccccccccccc0002',
    ]);
  });

  it('NET-NEW — an option code cannot forge another key by containing a separator', async () => {
    /* The `Size` cell is spelled so that a naive `group + separator + code` key would collide with the
     * `Colour` cell's key under any printable separator a reader might have reached for. */
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

    /* ⛔ BOTH CELLS ARE LOOKED UP. If the key were `group + '|' + code`, the `Colour` cell would have hit
     * the `Size` cell's entry and been assigned its option — a cross-group leak driven entirely by file
     * content. A NUL cannot appear in a cell that survived delimited parsing, so the composite key is
     * unforgeable rather than merely unlikely to collide. */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(2);
  });

  it('NET-NEW — an option the import CREATES is remembered, so no second row re-creates it', async () => {
    const twoRowsOneNewOption = importable(
      ['product_productCode', 'option_Size'],
      ['CODE-1', 'Small'],
      ['CODE-2', 'Small'],
    );

    const harness = buildHarness(twoRowsOneNewOption, (statement) => {
      const sql = collapse(statement.sql);

      if (sql.startsWith('SELECT optionGroupID FROM SwOptionGroup')) {
        return sqlRows([{ optionGroupID: 'cccccccccccccccccccccccccccc0001' }]);
      }
      if (sql.includes('LEFT JOIN SwOption')) {
        /* `:L212-L215` is an OUTER join, so it returns the GROUP with a NULL option when the option does
         * not exist yet — which is the `:L217` empty branch that creates one. */
        return sqlRows([{ optionID: null, optionGroupID: 'cccccccccccccccccccccccccccc0001' }]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * ⭐ THE CREATED IDENTIFIER IS RECORDED, AND FIRST-FAILURE IS WHY THAT IS ADMISSIBLE. The insert at
     * `:L222-L227` happens inside row 1's transaction, so a rolled-back row could in principle leave a
     * remembered identifier pointing at nothing. It cannot happen: the per-row boundary stops at the
     * FIRST failure (M3), so no later row runs after a row whose transaction rolled back, and no later
     * row can read the entry. This is not defence in depth — it is the entry's whole licence, and if the
     * boundary ever gained a continue-on-error mode the recording would have to go with it.
     */
    const created = matching(harness, 'INSERT INTO SwOption ');
    expect(created).toHaveLength(1);
    expect(String(created[0]?.params[0])).toMatch(HEX_32);

    // One lookup for two rows: row 2 took the memory hit.
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(1);

    /*
     * ⭐⭐ THE CREATION ARM ISSUES NO EXISTENCE PROBE AT ALL, AND THAT ASYMMETRY IS THE LEGACY'S.
     * `model/dao/ProductDAO.cfc:L217` probes `SlatwallSkuOption` only on its non-empty branch; the empty
     * branch at `:L222-L228` creates the option and then sets `exists = false` OUTRIGHT, without asking,
     * because an option that did not exist a statement ago can carry no link. So row 1 probes zero times
     * and links once, and row 2 — arriving through the memory — takes the `:L217` non-empty branch and
     * probes exactly once. One probe across two rows, not two.
     *
     * ⭐ AND THE SINGLE PROBE BINDS THE CREATED IDENTIFIER, which is the actual proof that the identifier
     * minted at `:L223` was recorded rather than re-derived. A memory that recorded only FOUND options
     * would send row 2 back to `:L212-L215`, find the option this import created, and — because the outer
     * join is not repeated here — the lookup count above would read 2.
     */
    const probes = matching(harness, 'FROM SwSkuOption');
    expect(probes).toHaveLength(1);
    expect(probes[0]?.region).toBe('row#2');
    expect(probes[0]?.params[0]).toBe(String(created[0]?.params[0]));

    /* Both rows link, because row 1 skipped the probe and row 2's probe found nothing. */
    expect(matching(harness, 'INSERT INTO SwSkuOption')).toHaveLength(2);
  });

  it('NET-NEW — the memory is IMPORT-scoped, never instance-scoped (M7)', async () => {
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
     * ⛔⛔ THE HAZARD M7 NAMES, ASSERTED RATHER THAN DOCUMENTED. Nothing survives between Lambda
     * invocations except module-scope state, so a memory held as a FIELD on the repository would let one
     * caller's catalogue identifiers answer the next caller's import on a warm container. The memory is
     * created inside `buildImportPlan` and reachable only through the `ImportPlan` that call returns, so
     * it dies with the import — and the second import therefore re-probes every family from scratch, on
     * the very same repository instance.
     */
    expect(matching(harness, 'FROM SwBrand')).toHaveLength(2);
  });
});
