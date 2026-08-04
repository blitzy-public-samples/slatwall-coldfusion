/**
 * `MySqlProductRepository` — **net-new** characterization coverage
 * every case in this file is **net-new**, and every case title says so. There is no legacy
 * `ProductDAOTest` anywhere in `meta/tests/`, so nothing here extends, replaces or reproduces an
 * existing assertion, and nothing here should be read as legacy parity coverage. The answer to "did
 * this suite replicate existing tests, or generate new ones?" is unambiguous for this file:
 * Generated, and labelled as generated in every single title.
 *
 * Traceability is **documentary**, not EMPIRICAL. Every behavioural claim below was established by
 * reading `model/dao/ProductDAO.cfc` and the context sources line by line, and each assertion
 * carries the `path:Lnnn` locator it was derived from. Four facts about this environment are why
 * that is the strongest available form of evidence, and all four are stated here rather than
 * discovered later:
 *
 * 1. MXUnit is not vendored in this repository, and neither is CFSelenium. The legacy suite needs
 * an external cfide mapping that does not exist here.
 * 2. `meta/docker/Slatwall-local-dev/` does not exist. `meta/` contains only `meta/tests/` and
 * `meta/eclipse/`; there is no Dockerfile and no Compose file anywhere in the tree.
 * 3. The legacy CFML runtime is therefore not reproducible in this environment — no ColdFusion,
 * Railo or Lucee engine is available to execute `model/dao/ProductDAO.cfc` at all.
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
import type { AccountContextPort, AccountReference } from '../../src/ports/AccountContextPort';
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
  newAccount,
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

/* The harness — assembled from the support doubles, not rebuilt. */

/** Which execution region a statement travelled through. */
type Region = 'pool' | 'backfill' | `row#${number}`;

/** One statement exactly as the adapter issued it, plus the region it was issued from. */
interface RecordedStatement {
  readonly region: Region;
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** What the instrumented streaming reader observed. */
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
 * There is no `HarnessExtras` interface. `buildHarness` takes a `StreamingSpec` for streaming and needs
 * no hook for record pulls, so an opt-in extras type would have no wiring and no caller. The
 * cancellation phase union carries no content-assignment preflight either, because the content columns
 * are imported rather than refused.
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
  /** Every location the import-source policy was asked to validate, in call order. */
  readonly validatedSources: readonly string[];
  /** Every redirect hop the policy was asked to re-validate, with the address it resolved to. */
  readonly revalidatedHops: readonly ProductImportRedirectHop[];
  /** The policy the harness injected, so a test can substitute a refusing one. */
  readonly sourcePolicy: ProductImportSourcePolicy;
  /** The retrieval collaborator itself, so a case can substitute one of its members. */
  readonly sourceReader: ProductImportSourceReader;
  /** The transactional executor the unit-of-work double hands to every scope. */
  readonly transactionalExecutor: TransactionalSqlExecutor;
  /** The collaborator itself, so a test can make one of its members fail. */
  readonly contentAssignmentPort: ProductContentAssignmentPort;
  /**
   * Every transaction scope the content-assignment factory was built from, in call order.
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
  /** Which retrieval member the adapter chose, in call order — the current contract. */
  readonly readerCalls: readonly ('read' | 'readStreaming')[];
  /** The 1-based index of every record the streaming generator actually yielded, in order. */
  readonly recordsYielded: readonly number[];
  /** How many times the streaming generator's `finally` ran. */
  streamReleases(): number;
  /** Transaction lifecycle events, in order. */
  eventKinds(): readonly UnitOfWorkEventKind[];
  transactionsCommitted(): number;
  transactionsRolledBack(): number;
  transactionsStarted(): number;
  /** Which retrieval member the adapter actually invoked, in invocation order. */
  retrievalMembers(): readonly ('read' | 'readStreaming')[];
  /**
   * What the instrumented streaming reader observed. Empty unless `offerStreaming` was requested.
   */
  readonly stream: StreamObservation;
  readonly repository: MySqlProductRepository;
}

/**
 * Collapses runs of whitespace so a statement can be matched without depending on its indentation.
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
 * The three headings the legacy importer reads with no guard, and therefore effectively requires.
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

/** Opt-in streaming behaviour for the retrieval collaborator — the current contract. */
interface StreamingSpec {
  /** Yield this many records, then throw — a mid-file transport or parse failure. */
  readonly throwAfterRecords?: number;
}

/**
 * Builds the harness.
 *
 * @param recordSet - what the retrieval collaborator answers with.
 * @param reply - decides the outcome of a statement from the statement itself; `undefined` declines
 * and the double falls back to its own default (no rows for a read, zero affected for a write).
 *
 * @param accountContext - the injected current-account context, defaulting to a persisted admin.
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

  /*
   * Assigned once the unit of work exists; a statement can only be issued after that, because the
   * adapter is constructed with it. Declared as a function so neither double has to know the other.
   */
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

  /*
   * Assigned only when a case actually supplies one, because `exactOptionalPropertyTypes` makes an
   * explicit `undefined` a different thing from an absent member.
   */
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

  /*
   * The import-source policy double — admits everything, and records that it was asked
   * this is a test double and it is deliberately permissive. Production ships
   * `unresolvableProductImportSourceReader`, whose policy refuses every member; a suite driving the
   * import path needs one that admits, or no import could be exercised at all. An admitting policy is
   * correct here and would be a security defect in `src/`, which is why it lives only in this file.
   */
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

  /*
   * The content-assignment double.
   * Stands in for the collaborator that owns `tContent` and `SlatwallProductContent`, neither of which is
   * in this subtree's physical table whitelist. It records every call so the suite can assert the ported
   * algorithm of `model/dao/ProductDAO.cfc:L257-L282` step by step: which pages were looked up, in what
   * order, which were probed, and which were inserted.
   */
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
      /*
       * The real collaborator's insert makes the pair exist, so the double must too — otherwise two
       * pages of one row resolving to the same content could not demonstrate `:L271`'s guard.
       */
      existingAssignments.add(`${row.productId}|${row.contentId}`);
      return Promise.resolve();
    },
  };

  /*
   * The retrieval collaborator.
   * `read` is always present, because the port declares it as mandatory. `readStreaming` appears only
   * when the caller supplied a {@link StreamingSpec}, so the arm the adapter takes is a property of the
   * case rather than of the harness.
   */
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

  /** The lazy record source, honouring the port's `finally`-release obligation. */
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

        /*
         * A real await, not a lint dodge. A retrieval collaborator delivers each record across some
         * transport, so yielding one is asynchronous; awaiting here makes the double asynchronous in the
         * same way. It also matters to the laziness case below: a generator that resolved synchronously
         * could make an interleaving assertion pass for the wrong reason, because the row loop would never
         * actually suspend between records.
         */
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
   * — a factory that records the scope it was handed. The adapter now builds the collaborator per
   * row from that row's `TransactionScope`, so the double records the scope and then answers the same port
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
    /*
     * `model/dao/ProductDAO.cfc:L399` delegates the transform to a utility service; the adapter takes
     * it as an injected function, so this stands in for it with a deterministic slug.
     */
    urlTitleFilter: (productName) => productName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    /*
     * `Product.defaultSku` is typed against a behavioural delegate with no identifier accessor, so
     * the adapter reads the identifier through a function. No import path exercises it.
     */
    readDefaultSkuId: () => '',
  };

  return {
    statements,
    retrievals,
    validatedSources,
    revalidatedHops,
    sourcePolicy: admittingSourcePolicy,
    sourceReader,
    /*
     * — the transactional executor every scope hands out, so a test can assert that the scope the
     * content-assignment factory received is the row's own rather than some other object.
     */
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

/* Physically valid identifiers, for consistency with the production whitelist. */

/** The adversarial-but-inert values every D18 case drives through the importer. */
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
 */
const THREE_ROW_FILE = importable(['product_productCode'], ['CODE-1'], ['CODE-2'], ['CODE-3']);

/* FindAttributeSets — model/dao/ProductDAO.cfc:L52-L71. */

describe('NET-NEW — findAttributeSets, and the D20 partial collapse', () => {
  it('NET-NEW — keeps the :L56-L61 disjunctive shape when product types are supplied', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets(['productType', 'brand'], ['pt-1', 'pt-2']);

    const selection = collapse(only(harness, 'FROM SwAttributeSet').sql);

    /*
     * `:L57-L58` — the disjunction. A globally flagged set qualifies on its own; otherwise an
     * assignment to one of the supplied product types must exist. This branch changes the result SET,
     * so it is preserved and is not part of the D20 collapse asserted below.
     */
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

    // `:L54` — an attribute set qualifies only when it holds at least one active attribute.
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
     * TODO: remove this conditional when Railo and acf match how they handle arrays for 'in' clause.
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

    /*
     * Deliberately distinctive values. A one-letter value would occur inside `SELECT` by accident and
     * an absence assertion over it would pass or fail for reasons that have nothing to do with
     * binding, which would make the case worthless as evidence.
     */
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

    /*
     * TR-4. `:L54` writes the type-code list before `:L58` writes the assignment list, so the bound
     * array follows that order — not the argument order, which happens to agree here, and not any
     * sorted order. Both supplied lists keep their own internal order too.
     */
    expect(only(harness, 'FROM SwAttributeSet').params).toEqual(['zeta', 'alpha', 'pt-9', 'pt-8']);
  });

  it('NET-NEW — an empty type-code list binds one marker and never emits IN ()', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets([], []);

    const selection = only(harness, 'FROM SwAttributeSet');

    /*
     * The degenerate binding contract, and it is source-grounded rather than invented: `:L68` binds
     * whatever the caller passed, and an empty CFML list binds as one empty value — never as zero
     * values, because `IN ` is not a statement any engine accepts.
     */
    expect(collapse(selection.sql)).toContain('systemCode IN (?)');
    expect(collapse(selection.sql)).not.toContain('IN ()');
    expect(selection.params).toEqual(['']);
  });

  it('NET-NEW — refuses to compose a set-membership clause with zero bind markers', () => {
    /*
     * The same contract from the other side: the composer itself will not emit `IN `, so no future
     * caller can reach that shape by supplying a count of zero.
     */
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

    /*
     * The element type is opaque. No attribute-set row shape is invented here, and none is asserted:
     * The Attribute domain is excluded from this slice, so this port has no locator for its columns.
     * What is assertable is that the rows travel through untouched.
     */
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(attributeSetRow);
  });

  it('NET-NEW — takes the PLURAL productTypeIDs of :L52, never the SKU-side singular', () => {
    /*
     * Discrepancy 6, pinned at compile time rather than described in prose. `:L52` declares
     * `required array productTypeIDs`, plural, while the SKU-side equivalent declares a singular
     * `productTypeID`. This binding only typechecks while the plural spelling and the array type
     * survive on this member, so renaming either one breaks the build here.
     */
    const pinned: (repository: ProductRepository) => Promise<unknown[]> = (repository) =>
      repository.findAttributeSets(['productType'], ['pt-1']);

    expect(typeof pinned).toBe('function');
  });

  it('NET-NEW — issues the selection on the pool executor, outside every transaction', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.findAttributeSets(['productType'], []);

    /*
     * `:L66` and `:L68` run through `ormExecuteQuery`, which the legacy issues with no transaction of
     * its own. Nothing was begun, committed or rolled back.
     */
    expect(only(harness, 'FROM SwAttributeSet').region).toBe('pool');
    expect(harness.eventKinds()).toEqual([]);
  });
});

/*
 * ImportFromFile — the return contract and the format contracts, model/dao/ProductDAO.cfc:L73-L98.
 */

describe('NET-NEW — importFromFile, and its return and format contracts', () => {
  it('NET-NEW — resolves to undefined, reporting nothing whatsoever about the import', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    const resolved = await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `model/dao/ProductDAO.cfc:L73` declares `public void function loadDataFromFile(...)`. It hands
     * its caller nothing: no imported-row count, no rejected-row list, no progress report, no error
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
     * TODO(parity)/documented decision — M4, model/dao/ProductDAO.cfc:L87-L98. the one live legacy
     * fetch is the `cfhttp` call at `:L87`, and this suite performs none. `:L87` reads
     * `getService("utilityTagService").cfhttp(method="get", url=arguments.fileURL, delimiter=delimiter,
     * textQualifier=arguments.textQualifier)` — a collaborator resolved by runtime string lookup and
     * never declared as a component property, which is why metadata-driven dependency analysis misses
     * it entirely. The port turns it into an injected typed collaborator, and this harness substitutes.
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

    /*
     * `:L75` initialises the delimiter to `""` and `:L76-L80` has no else, so an unrecognised type
     * retrieves with no delimiter rather than failing. Carried as observed.
     */
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
     * imports nothing and the caller, which receives no return value, cannot tell. It stays a no-op:
     * Adding a spreadsheet reader would be new functionality, not a port.
     */
    expect(resolved).toBeUndefined();
    expect(harness.retrievals).toEqual([]);
    expect(harness.transactionsStarted()).toBe(0);
    /*
     * Not one statement came from a row region, so the three rows the file carries were never even
     * looked at — which is exactly what a branch whose body is a comment does.
     */
    expect(harness.statements.filter((statement) => statement.region.startsWith('row#'))).toEqual(
      [],
    );
  });

  it('NET-NEW — still runs both :L287-L325 back-fills after the .xls no-op', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.xls');

    /*
     * `:L288` and `:L304` sit outside the spreadsheet branch as well as outside the row loop, so they
     * run even when the branch imported nothing. Preserved, because skipping them would be a new
     * guard the legacy does not have.
     */
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

    /*
     * The legacy retrieves at `:L87`, before `transaction{` opens at `:L177`, and retrieves once for
     * the whole file. That ordering is the part of M4 a test can hold: three rows, one retrieval, and
     * it happened while no transaction was open.
     */
    expect(harness.retrievals).toHaveLength(1);
    expect(harness.transactionsStarted()).toBe(3);
    expect(harness.eventKinds().indexOf('begin')).toBeGreaterThanOrEqual(0);
  });
});

/* ImportFromFile — the import-location gate at the retrieval sink (CWE-918) */
/* importFromFile — mismatch M3, model/dao/ProductDAO.cfc:L176-L177, :L284-L285 and :L287-L325. */

describe('NET-NEW — importFromFile, and mismatch M3: one transaction per row', () => {
  it('NET-NEW — opens one INDEPENDENT transaction per row, never one around the import', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * Mismatch M3 — a documented preservation decision, not an improvement.
     * Model/dao/ProductDAO.cfc:L176 opens the record loop, `:L177` opens `transaction{` inside it, and
     * `:L284-L285` closes the transaction and then the loop, in that order. So the importer's shape is
     * N independent single-row transactions, and each one commits on its own the moment its row is
     * done. `:L287-L325` then runs after both braces have closed, inside no transaction at all.
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

    /*
     * Each row's lookups and writes sit inside that row's boundary, which is where `:L179-L282` sits
     * relative to `:L177`. A read moved out to the pool would be a second connection and a different
     * snapshot, so the region of every row statement is asserted rather than merely their count.
     */
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
     * M3's consequence, asserted deterministically. Row 2 fails on its first statement. Because each
     * row committed independently, row 1's work is already durable and cannot be taken back; row 2's
     * own transaction rolls back with nothing of it written; and row 3 is never attempted, because the
     * boundary stops at the first failure exactly as the legacy's exception unwinds the request.
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
    // Exactly one row committed: row 1. Row 2 rolled back. Row 3 never began.
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
     * The twin of the case above, and the one that separates two failures that look alike. There, row
     * 2's statement failed: the boundary rolled back, the roll-back worked, the connection's transaction
     * state was known again, and it was released. Here row 2's commit is what fails, so there is no
     * roll-back to attempt and nothing can be said about what the database retained — and one connection
     * is shared by the whole list (M3 keeps a transaction per row, not a checkout per row), so the
     * disposal that closes the list must be a destroy.
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
    /* The attempted commit is on record; only the one that worked is counted. */
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

    /*
     * Both sit past the closing braces at `:L284-L285`, so neither is enclosed by a begin/commit pair.
     * The region says so directly, and the event log says so structurally: every transaction event has
     * already been recorded and released by the time the un-transacted region is entered.
     */
    expect(defaultSkuBackfill.region).toBe('backfill');
    expect(imageFileBackfill.region).toBe('backfill');

    const events = harness.eventKinds();
    expect(events.indexOf('poolWork')).toBeGreaterThan(events.lastIndexOf('commit'));
    expect(events.indexOf('poolWork')).toBeGreaterThan(events.lastIndexOf('release'));
    expect(events.filter((kind) => kind === 'begin')).toHaveLength(3);

    /*
     * And in the legacy's order: `:L302` executes the default-SKU statement, then `:L325` the image
     * one. Their order is not incidental — both read rows the row loop has already committed.
     */
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
     * TODO(parity) model/dao/ProductDAO.cfc:L291 — "first SKU" is arbitrary and stays arbitrary. The
     * subquery carries `LIMIT 1` and no `ORDER BY`, so which SKU becomes the default is whatever the
     * engine happens to return first. Adding an ordering to make that deterministic would be an
     * enhancement the source does not have. The `LIMIT 1` itself is source-declared and is kept.
     *
     * TODO(parity) model/dao/ProductDAO.cfc:L289-L291 — the error-1093 exposure is flagged, not
     * closed, and no derived-table wrapper was introduced. MySQL rejects a subquery that reads the very
     * table an `UPDATE` assigns (`ER_UPDATE_TABLE_USED`), and the statement's subquery reads `SwSku`
     * while `SwSku` is one of the two tables the multi-table update names — which looks like it needs a
     * derived-table wrap. It does not: a correlated subquery over a table that is joined but not
     * assigned is permitted, so the statement is preserved as the legacy wrote it. Had a wrapper been.
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
     * …)`, so the separator and the extension are one single-quoted literal in the legacy statement.
     * It is a value, not an identifier, so it becomes one bound marker and the produced file name is
     * unchanged.
     *
     * TODO(parity) model/dao/ProductDAO.cfc:L307, :L313 and :L320 — the setting gap is recorded, not
     * filled. `config/dbdata/SlatwallSetting.xml.cfm` does not seed `globalImageExtension`, and the
     * destination setting port does not declare it either — see the compile-time pin further below.
     * This case therefore asserts the shape of the binding and states the gap; it deliberately does not
     * assert an extension string, because naming one here would be inventing the very value the source
     * never supplied. No `'jpg'`, no `'png'`, and no nineteenth setting name.
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
     * The gap above, pinned at compile time instead of asserted in prose. `SettingName` is a closed
     * union of the names this slice actually reads, and `globalImageExtension` is not among them: the
     * legacy marks it deprecated and its call sites are unresolvable on the DAO's inheritance chain, so
     * promoting it into the union would assert a contract the legacy explicitly retired.
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
     * Reached through the import, because there is no other way in. This case used to invoke
     * `backfillImportDerivedColumns()` directly: the member is private and is not on the port, so the
     * import's tail is its one caller and no out-of-band workflow can defer the pass — which is where
     * `model/dao/ProductDAO.cfc:L288`/`:L304` sit. The claim is unchanged: same two statements, same order,
     * same un-transacted region, nothing begun or committed.
     */
    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    expect(only(harness, 'SET defaultSkuID').region).toBe('backfill');
    expect(only(harness, 'SET imageFile').region).toBe('backfill');
    expect(harness.transactionsStarted()).toBe(0);
  });
});

/* ImportFromFile — defect D18, the one declared hardening in this slice. */

/** A file that reaches every dynamic-statement family the importer has, in one row. */
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

/**
 * Answers the option-group pre-pass so the option path is reached rather than pruned at `:L170`.
 */
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

    /* D18 — deliberate, documented hardening. Not a silent fix, and not a carried defect. */
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

    /*
     * The one quote-shaped character any statement may contain is none at all: not one composed
     * statement opens a string literal, because not one composed statement carries a value.
     */
    expect(everyStatement).not.toContain("'");
    expect(everyStatement).not.toContain('"');
    // And nothing arrived pre-escaped either, which would mean a literal existed to be escaped.
    expect(everyStatement).not.toContain('\\');
  });

  it('NET-NEW — carries each supplied value in the parameter array, in occurrence order', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * Absent from the text and present in the parameters is the whole claim; either half alone would be
     * satisfied by a statement that simply dropped the value. Each family is checked at its own
     * statement, with the parameter position the statement's own marker order dictates (TR-4).
     */

    // `:L164-L166` — one value bound three times, because the legacy interpolated the same cell into
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
     * The structural claim, stated as an equality. Under the legacy, changing a cell changed the
     * statement — that is the vulnerability. Under the port, the statement text is a function of the
     * schema and the file's headings alone, and the cell values reach only the parameter array. So two
     * imports of the same headings with entirely different values emit the same text, in the same
     * order, byte for byte. A value that cannot influence statement text cannot terminate a literal,
     * append a clause, comment out a predicate or introduce a second statement.
     */
    expect(adversarial.statements.map((statement) => statement.sql)).toEqual(
      tame.statements.map((statement) => statement.sql),
    );
    expect(adversarial.statements.map((statement) => statement.params.length)).toEqual(
      tame.statements.map((statement) => statement.params.length),
    );

    /*
     * And the adversarial run really did carry the hostile values, so the equality above is evidence
     * about a statement that saw them rather than about one that never did.
     */
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
     * this is a claim about composition, which is where the legacy failed. Each payload is a value the
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
      // Both existence lookups hit, so `saveImportData` takes its UPDATE arm at `:L390-L396`.
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
     * D18 at its hardest site, and the one most likely to tempt an escape hatch. `:L394` is
     * `UPDATE #tableName# SET #updateSetString# WHERE #idColumn# = '#idColumnValue#'`, where
     * `#updateSetString#` is an entire `set` clause passed as raw SQL text — assembled at `:L347-L361`
     * from file headings and file cell values, then interpolated whole. Both halves of every assignment
     * are attacker-influenced, and there is no way to escape a clause.
     */
    const assignments = collapse(productUpdate.sql).replace(/^UPDATE SwProduct SET /, '');
    const [setClause] = assignments.split(' WHERE ');

    expect(setClause).toBeDefined();
    // Every assignment is `column = ?`, and nothing else is admitted into the clause.
    expect(setClause?.split(', ').every((pair) => /^[A-Za-z]+ = \?$/.test(pair))).toBe(true);
    // The identifier predicate is bound too, and its marker is last, after every assignment.
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

    /*
     * `:L363-L364` — on the UPDATE arm the legacy appends only the modified audit pair, never the
     * created pair, which is why an import cannot rewrite when a record came into being. Preserved.
     */
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
    /*
     * The composer is the only way a `SET` clause is produced, and it will not produce an empty one.
     * `:L347-L361` could leave `updateSetString` empty when a file carried no assignable column, and
     * the legacy interpolated it regardless — emitting `UPDATE SwProduct SET WHERE …`, which no engine
     * accepts. Refusing at composition names the cause instead of forwarding a broken statement.
     */
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
     * D18 at the fragile site. `:L412` is
     * `INSERT INTO #tableName# (#insertColumns##arguments.idColumn#) VALUES (#insertValues#'#idColumnValue#')`
     * — two interpolations butted together with no separator, correct only because the loops that built
     * `insertColumns` and `insertValues` each happened to leave a trailing comma behind. Every value in
     * that list was a quoted literal built by concatenation.
     */
    const [, columnList = '', valueList = ''] =
      /^INSERT INTO SwProduct \(([^)]*)\) VALUES \(([^)]*)\)$/.exec(collapsed) ?? [];
    const columns = columnList.split(', ');

    expect(columns.length).toBeGreaterThan(1);
    expect(valueList.split(', ').every((marker) => marker === '?')).toBe(true);
    expect(valueList.split(', ')).toHaveLength(columns.length);
    expect(productInsert.params).toHaveLength(columns.length);

    // `:L412` appends the identifier column last, after the file columns and the audit quartet.
    expect(columns[columns.length - 1]).toBe('productID');

    /*
     * `:L410` — `lcase(replace(createUUID(),"-","","all"))`. IR-6: thirty-two lowercase hex characters,
     * no dashes, generated in application code. A dashed RFC-4122 string would not fit the `length="32"`
     * column the entity declares, and no UUID package is imported here to check it — the shape is the
     * contract, so the shape is what is asserted.
     */
    expect(productInsert.params[productInsert.params.length - 1]).toEqual(
      expect.stringMatching(HEX_32),
    );

    /*
     * `:L363-L366` — the insert arm appends all four audit columns, where the update arm appends two.
     */
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

    /*
     * `:L225`, `:L250` and `:L410` each generate an identifier the same way. All three are asserted on
     * the shape alone, from the public import path, with no UUID package imported.
     */
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

    /*
     * `:L212-L216` — the LEFT JOIN with the option code on the join rather than in the WHERE, so a group
     * with no matching option still yields a row carrying the group identifier. That placement is
     * behaviour: moving the predicate into the WHERE would yield no row and `:L227` would insert an
     * option with an empty group.
     */
    const optionLookup = collapse(only(harness, 'LEFT JOIN SwOption').sql);
    expect(optionLookup).toContain('LEFT JOIN SwOption ON SwOptionGroup.optionGroupID =');
    expect(optionLookup).toContain('SwOption.optionCode = ?');
    expect(optionLookup).toContain('WHERE SwOptionGroup.optionGroupID = ?');
    expect(optionLookup).not.toContain(QUOTE_BEARING.optionCode);

    // `:L222-L227` — the option insert. The code is bound twice, into code and name, as `:L225` does.
    const optionInsert = only(harness, 'INSERT INTO SwOption (');
    expect(optionInsert.params.filter((value) => value === QUOTE_BEARING.optionCode)).toHaveLength(
      2,
    );
    expect(optionInsert.sql).not.toContain(QUOTE_BEARING.optionCode);

    /*
     * `:L228` — a newly created option cannot already be linked, so the legacy sets the flag to false
     * outright and issues no probe. Preserved: the link insert runs and the probe does not.
     */
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

    /*
     * `:L218-L221` then `:L230-L234` — the link is probed, and inserted only when absent. Both bind the
     * two identifiers positionally and neither composes one into text. The probe stops at one row
     * because `:L221` reads nothing but the record count.
     */
    const linkProbe = only(harness, 'SELECT 1 FROM SwSkuOption');
    expect(collapse(linkProbe.sql)).toBe(
      'SELECT 1 FROM SwSkuOption WHERE optionID = ? AND skuID = ? LIMIT 1 FOR UPDATE',
    );
    expect(linkProbe.params[0]).toBe(physicalID('opt-1'));
    expect(linkProbe.params).toHaveLength(2);

    // No row came back, so `:L230-L234` inserts the link with the very same two identifiers.
    expect(only(harness, 'INSERT INTO SwSkuOption').params).toEqual(linkProbe.params);
    // And the option itself was not recreated, because `:L217` found one.
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
     * identifier is file-supplied, and the legacy interpolated it into both statements at `:L244` and
     * `:L249`. It is the content of an identifier column, not a column name, so it needs no whitelist
     * entry: bound as a value it gains no injection surface and needs no schema entry to exist.
     *
     * TODO(parity) `model/dao/ProductDAO.cfc:L247` — the insert is gated on the update's affected-row
     * count, which is not an existence test. An update writing the value a row already holds changes no
     * rows, so the legacy then inserts a duplicate value for a row that already had one. Carried across
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
     * The worst of the file-fed sites, and the one that explains why binding alone is not enough.
     * `:L386` is `SELECT #idColumn# FROM #tableName# WHERE #listLast(lookupColumn,'_')# =
     * '#lookupColumnValue#'` — three identifiers and one value, and the third identifier is derived at
     * run time from a file heading: `product_productCode` becomes `productCode`.
     */
    const lookup = only(harness, 'SELECT productID FROM SwProduct');
    expect(collapse(lookup.sql)).toBe('SELECT productID FROM SwProduct WHERE productCode = ?');
    expect(lookup.params).toEqual([QUOTE_BEARING.productCode]);
    expect((collapse(lookup.sql).match(/\?/g) ?? []).length).toBe(1);
  });

  it('NET-NEW — refuses an unrecognised lookup column instead of interpolating it', () => {
    /*
     * The whitelist is the mechanism, and it refuses rather than falling back to text. Both the table
     * and every column are re-validated inside the composer, so "the caller validated" is never relied
     * on: an exported composer cannot assume anything about who calls it.
     */
    expect(() =>
      composeExistenceLookup(assertTableName('SwProduct'), 'productID', 'nonesuch'),
    ).toThrow(/does not declare on the table/);
    expect(() =>
      composeExistenceLookup(assertTableName('SwProduct'), 'nonesuch', 'productCode'),
    ).toThrow(/does not declare on the table/);
    // A column that exists on another table is still refused on this one — the check is per table.
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
     * The refusal is the production whitelist behaviour, and it arrives before the first boundary.
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
     * TODO(parity) `model/dao/ProductDAO.cfc:L193`, `:L207`, `:L386`, `:L394`, `:L402` and `:L412`
     * — D22 [model/dao/SkuDAO.cfc:L132], the logical-to-physical translation. `:L193` and `:L207`
     * pass the logical literals `"SlatwallProduct"` and `"SlatwallSku"` into `saveImportData`,
     * which then interpolates them straight into native statement text at `:L386`, `:L394` and
     * `:L412` — and `:L402` writes `FROM SlatwallProduct` directly. Those are entity names, not
     * table names: the entity components declare `entityname="SlatwallProduct" table="SwProduct"`
     * at `model/entity/Product.cfc:L49` and `entityname="SlatwallSku" table="SwSku"` at
     * `model/entity/Sku.cfc:L49`, so the adapter emits the physical names instead.
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
     * `model/dao/ProductDAO.cfc:L262` selects from `tContent`, a mura cms table, and `:L271`/`:L277`
     * touch `SlatwallProductContent`, whose whole `Content*` family AAP §0.2.2.1 excludes. Neither is in
     * this port's physical whitelist and neither may be added to one: admitting them would extend a
     * catalogue port into a content-management schema whose columns and lifecycle sit outside every scope
     * boundary declared for this slice.
     */
    expect(() => assertTableName('tContent')).toThrow(/does not contain/);
    expect(() => assertTableName('SwProductContent')).toThrow(/does not contain/);
    expect(() => assertTableName('SlatwallProductContent')).toThrow(/does not contain/);
  });

  it('NET-NEW — leaves the file-fed and setting-fed statements distinguishable by provenance', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * The hardening is uniform; the injection characterisation is not. Every value in every statement
     * is bound, but the values do not all come from the same place, and claiming they did would
     * overstate what D18 was about:
     *
     * File-fed — the brand and product-type lookups, the existence lookup, the update, the insert, the
     * option and link paths and the attribute pair. These carried uploaded data into quoted literals
     * and are the injection surface `:L165`, `:L180`, `:L184`, `:L386`, `:L394` and `:L412` opened.
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
     * seam rather than constructing a pool, and the recording double is that seam — every statement
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

/* ImportFromFile — the parity decisions adjacent to D18. */

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
     * `:L100-L109` — the order is behaviour and the `break` is behaviour. `:L100` declares the
     * candidates as `['product_remoteID','product_productID','product_productCode',
     * 'product_productName']` and `:L103-L108` walks that array ascending, breaking on the first heading
     * the file carries. So the array's order is a priority order, and the first available candidate wins
     * however many later ones are also present — which decides which existing product an import updates.
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
     * The second candidate is unreachable in practice, and saying so is more useful than pretending
     * otherwise. `:L100` lists `product_productID`, but a file may not assign a primary key: identifiers
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
     * A translation decision, made explicitly because the two languages disagree. `:L180` and `:L184`
     * index the record set with the lower-case literals `brand_brandname` and
     * `productType_productTypeName`, and a CFML query is case-insensitive on column names, so a file
     * heading spelled `brand_BrandName` resolved. A JavaScript object is not case-insensitive: the same
     * index would be `undefined`, and the importer would silently treat every brand as absent — a miss
     * that produces no error and no wrong statement, just an empty foreign key on every row.
     */
    expect(only(harness, 'FROM SwBrand').params).toEqual(['Acme']);
    expect(only(harness, 'FROM SwProductType').params).toEqual(['Merchandise']);
    expect(collapse(only(harness, 'SELECT productID FROM SwProduct').sql)).toBe(
      'SELECT productID FROM SwProduct WHERE productCode = ?',
    );
    expect(only(harness, 'SELECT skuID FROM SwSku WHERE skuCode').params).toEqual(['SKU-1']);

    /*
     * And the emitted identifiers carry the entity's casing, not the file's: the whitelist restores the
     * canonical spelling, so a heading's capitalisation never reaches statement text.
     */
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
     * `:L152` calls `now()` once, before `:L176` opens the row loop, and `:L225` writes that one value
     * into every option it creates. So every option an import creates carries the same audit timestamp
     * however long the import runs. Moving the capture inside the loop would be more accurate and is not
     * what the legacy records, so it is not what the port records.
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
     * global reached through the framework, which is exactly the mechanism the port replaces. The
     * identifier arrives through a constructor-injected `AccountContextPort` instead: no service locator,
     * no string-keyed resolution, no ambient scope.
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
     * Absence maps to the empty string, which is the legacy value and not an invented default. The
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
     * `:L161` iterates descending — `for(var i=arrayLen(optionGroups); i>=1; i--)` — because `:L170`
     * deletes unresolved entries from the very array being walked, and only a descending walk can delete
     * safely. The direction is therefore load-bearing rather than stylistic, and it is observable: the
     * lookups issue in reverse heading order.
     */
    const groupLookups = matching(harness, 'FROM SwOptionGroup WHERE optionGroupName');
    expect(groupLookups).toHaveLength(2);
    // Reverse of the file's heading order: `Colour` is looked up before `Size`.
    expect(groupLookups[0]?.params).toEqual(['Colour', 'Colour', 'Colour']);
    expect(groupLookups[1]?.params).toEqual(['Size', 'Size', 'Size']);

    // Both are pre-resolved before the first boundary opens, on the pool executor (M6 is unaffected:
    // Nothing in the pre-pass reads a row the loop will write).
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

    /*
     * `:L168-L172` — a resolved heading is recorded, an unresolved one is removed, and `:L209` then
     * iterates only what survived. So exactly one option is assigned, for `Colour`, and the `Size` cell
     * is silently ignored. Two lookups were issued; one option path ran.
     */
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
     * TODO(parity) `model/dao/ProductDAO.cfc:L398-L409` — the importer's url-title rule is one-shot
     * and is deliberately not harmonised with the service-layer rule.
     */
    const productInsert = only(harness, 'INSERT INTO SwProduct');
    const columnList = collapse(productInsert.sql).replace(
      /^INSERT INTO SwProduct \(([^)]*)\).*$/,
      '$1',
    );
    const urlTitleIndex = columnList.split(', ').indexOf('urlTitle');

    expect(urlTitleIndex).toBeGreaterThan(-1);
    // One append, with `_` as the separator and the product code as the suffix — not a number.
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

    /*
     * `:L397` gates the whole url-title block on the insert arm and on the product table, so updating an
     * existing product never rewrites its title and the SKU table never gains one. Preserved.
     */
    expect(matching(harness, 'SELECT 1 FROM SwProduct WHERE urlTitle')).toEqual([]);
    expect(collapse(only(harness, 'UPDATE SwProduct SET').sql)).not.toContain('urlTitle');
  });

  it('NET-NEW — carries the product identifier saveImportData resolved into every dependent write', async () => {
    const harness = buildHarness(ADVERSARIAL_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `saveImportData` is private, and `:L416` returns an identifier on both its arms — the generated
     * one on the insert path and the looked-up one on the update path. That return is internal, and it is
     * observed here only through the writes that consume it: the SKU row's foreign key and the attribute
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

    /*
     * Same internal return, different arm: `:L392` reads the identifier off the existence lookup instead
     * of generating one, and every dependent write then carries that value.
     */
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

    /*
     * `:L143-L148` appends the literal `"1"` string for each of the two flags when the file carries no
     * such heading. It covers a missing column, not a missing value — so a file that does carry
     * `product_activeFlag` with an empty cell imports an empty flag, and no default rescues it. Both
     * halves are preserved, and the second is the one a well-meaning reader would "fix".
     */
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

  it('NET-NEW — re-probes the brand on EVERY row, resolved or not', async () => {
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
     * Two rows, two statements — whether the brand resolves or not. `model/dao/ProductDAO.cfc:L179-L182`
     * sits inside the record loop and is re-run per row, with no memory of any kind.
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

/* SearchByProductType — model/dao/ProductDAO.cfc:L419-L437. */

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
     * `:L422` is `addParam(name="prodName", value="%#arguments.term#%")` — the wildcards are applied at
     * the binding site, not by the caller. So the port takes a bare fragment and wraps it here, which
     * keeps every existing caller's argument unchanged. Wrapping in the caller would double the
     * wildcards for anyone who already passes a bare term.
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

    /*
     * `:L423`'s guard is false, so `:L424-L425` never appends. Both arguments are declared optional at
     * `:L419`, and this is what the second one's absence looks like.
     */
    const search = collapse(only(harness, 'SELECT productID, productName FROM SwProduct').sql);
    expect(search).not.toContain('productTypeID');
    expect(search).not.toContain('IN (');
    expect((search.match(/\?/g) ?? []).length).toBe(1);
  });

  it('NET-NEW — appends a DIRECT productTypeID IN (...) filter, not a nested subquery', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', 'pt-1,pt-2,pt-3');

    /*
     * `:L424-L425` filters `SwProduct.productTypeID` directly. It does not reach through a product
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
     * The order comes from a subtlety of the legacy body. `:L427` calls `setSQL` after both `addParam`
     * calls, and the legacy binds by name so the calls' order is what fixes the sequence — the term was
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

    /*
     * CFML's list binding produces one parameter per token without discarding empties, so `pt-1,,pt-3`
     * bound three values and the middle one was the empty string. Dropping the empty token would emit two
     * markers and change the match set; the split is therefore bare, and four tidy-ups are forbidden —
     * dropping empties, trimming, de-duplicating, and short-circuiting the whole-empty case.
     */
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
     * TODO(parity) `model/dao/ProductDAO.cfc:L423` — the guard is `len()`, and the asymmetry with the
     * SKU side is preserved rather than harmonised. `:L423` tests
     * `structKeyExists(arguments,"productTypeIDs") and len(arguments.productTypeIDs)`, so a
     * whitespace-only string has a non-zero length, passes the guard, and produces a filter that matches
     * nothing — an empty result where no filter at all would have returned every name match.
     */
    const search = only(harness, 'SELECT productID, productName FROM SwProduct');
    expect(collapse(search.sql)).toContain('productTypeID IN (?)');
    // The whitespace travels verbatim, neither trimmed nor normalised.
    expect(search.params).toEqual(['%widget%', '   ']);
  });

  it('NET-NEW — treats an EMPTY list string as absent, which is what len() zero means', async () => {
    const harness = buildHarness(fileWith([]));

    await harness.repository.searchByProductType('widget', '');

    /*
     * `len('')` is zero, so `:L423` is false and no filter is appended. This is the one input a
     * whitespace-only string is easily confused with, and the two answers differ.
     */
    expect(
      collapse(only(harness, 'SELECT productID, productName FROM SwProduct').sql),
    ).not.toContain('productTypeID');
  });

  it('NET-NEW — names the argument in the PLURAL, per :L419 and Discrepancy 6', () => {
    /*
     * Discrepancy 6 — the spelling is plural here and singular on the SKU side, and that is not tidied
     * up. `:L419` declares `productTypeIDs`, while the SKU-side equivalent declares `productTypeID`. The
     * plural is also a comma-delimited string rather than an array, which is the second half of the
     * discrepancy and the reason a caller cannot pass `string[]` here.
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
     * `productName` becomes `value`, and the keys are quoted lower-case in the source so the rename is
     * deliberate rather than an artefact of CFML's struct casing. The shape feeds a select control, which
     * is why `value` carries the name and `id` the identifier — the opposite of what the words suggest.
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
     * An explicit decision at a point where the source is unguarded. `:L419` declares `term` optional
     * and `:L422` then reads `arguments.term` with no guard at all, so omitting it does not search for
     * everything — it fails, on the argument access, before any statement is composed. There is no
     * legacy behaviour to preserve here beyond "this does not work".
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

    /*
     * `:L421` declares no ordering, so the row order is whatever the engine returns and the port must not
     * narrow it: adding an `ORDER BY` would make an unspecified order specific, which is observable
     * output. Nor is a ceiling added — no `LIMIT` appears on this read, and the only source-declared
     * `LIMIT` in this file is the default-SKU back-fill's.
     */
    const search = collapse(only(harness, 'SELECT productID, productName FROM SwProduct').sql);
    expect(search).not.toContain('ORDER BY');
    expect(search).not.toContain('LIMIT');
    expect(search).not.toContain('OFFSET');
  });

  it('NET-NEW — composes the same statement through the exported composer, filter and all', () => {
    /*
     * The composer is the single source of the statement, so a caller reaching it directly gets exactly
     * what the member emits. Its only argument is a COUNT — never a value and never an identifier — which
     * is what makes it impossible to compose a filter around caller text.
     */
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

    /*
     * `:L419-L437` is a read and the legacy wraps it in no transaction, so neither does the port. The
     * region proves it directly, and the empty event log proves nothing was begun.
     */
    expect(only(harness, 'SELECT productID, productName FROM SwProduct').region).toBe('pool');
    expect(harness.eventKinds()).toEqual([]);
  });

  it('NET-NEW — satisfies the ProductRepository port across its whole declared surface', () => {
    /*
     * The interface parity check, stated so it cannot drift. This binding fails to compile if the adapter
     * stops satisfying the port — a renamed member, a changed arity, a narrowed argument or a widened
     * return would each break it — which is the compile-time equivalent of the method-by-method mapping
     * the migration is meant to make checkable.
     */
    const asPort: ProductRepository = buildHarness(fileWith([])).repository;

    /* The three legacy DAO members — AAP §0.4.2.6. */
    expect(typeof asPort.findAttributeSets).toBe('function');
    expect(typeof asPort.importFromFile).toBe('function');
    expect(typeof asPort.searchByProductType).toBe('function');

    /* The two additive members, each defended at its declaration. */
    expect(typeof asPort.saveProduct).toBe('function');
    expect(typeof asPort.removeProduct).toBe('function');

    /* And the bounded search is absent, asserted rather than left implicit. */
    expect('searchByProductTypeBounded' in asPort).toBe(false);
    expect(
      Object.hasOwn(Object.getPrototypeOf(asPort) as object, 'searchByProductTypeBounded'),
    ).toBe(false);

    /*
     * The unbounded member it sat beside is untouched, and still declares its two arguments — `term` and
     * the plural `productTypeIDs`. Arity is asserted because the removed member's own arity was three, so
     * a mistaken deletion of the wrong declaration would show up here as a two becoming a three.
     */
    expect(asPort.searchByProductType).toHaveLength(2);
  });

  /*
   * The same surface, checked the other way round. The case above enumerates the
   * six members by hand, which catches a member that disappears. It cannot catch one that is added: a
   * seventh method could join the port and every assertion above would still pass. The mapped type below
   * closes that direction — it is keyed off `keyof ProductRepository`, so a new member makes this file
   * fail to compile until it is named here and driven by the statement sweep.
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

/*
 * The cross-cutting query-discipline and security gates
 * Every describe above asserts one behaviour at one locator. This last one asserts the properties that
 * must hold for every statement the adapter can emit, over the whole public surface at once, so a
 * statement added later cannot quietly opt out of them. It is the standing gate rather than a
 * characterisation of any single legacy line.
 */

/** Drives every public member and returns every statement they produced, in issue order. */
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

  /*
   * Read-side arguments are deliberately quote-bearing and deliberately unlike any schema identifier, so
   * a substring search for them cannot collide with a legitimate column name such as `productTypeID`.
   */
  const reading = buildHarness(fileWith([]));
  await reading.repository.findAttributeSets(
    [...READ_ARGUMENTS.typeCodes],
    [...READ_ARGUMENTS.productTypeIds],
  );
  await reading.repository.searchByProductType(
    QUOTE_BEARING.searchTerm,
    READ_ARGUMENTS.productTypeIds.join(','),
  );
  /*
   * The write and removal arms, whose statements no read or import path composes. Both arms of the
   * write are driven, because an insert lists the identifier while an update matches on it.
   */
  const writing = buildHarness(fileWith([]));
  await writing.repository.saveProduct(transientProduct());
  await writing.repository.saveProduct(persistedProduct());
  await writing.repository.removeProduct(persistedProduct());
  /*
   * And both write arms again with adversarial values, which is the half that was missing. Driving
   * the write path with `transientProduct()` alone put its statements under the gates below but not its
   * VALUES: every field that product carries is benign, so the value-separation gate could scan the
   * insert and the update and find nothing to separate. It would have passed identically against an
   * adapter that composed `productName` straight into the statement text. `adversarialProduct()` carries
   * a quote and a statement terminator in every writable field, so the gate now has something to fail on.
   */
  await writing.repository.saveProduct(adversarialProduct());
  await writing.repository.saveProduct(adversarialProduct({ productID: PERSISTED_PRODUCT_ID }));
  /*
   * The two back-fill statements are already in `importing.statements`: the import above runs them at
   * its tail, unconditionally, and that is their only route because the member is private and no
   * deferral flag exists. Invoking them a second time here would double-count them in the
   * sweep without covering a statement the sweep has not already seen.
   */

  return [
    ...importing.statements,
    ...updating.statements,
    ...reading.statements,
    ...writing.statements,
  ];
}

/** A product whose every writable text field carries a quote and a statement terminator. */
function adversarialProduct(overrides: Partial<Product> = {}): Product {
  const product = new Product();

  product.productName = WRITE_ARGUMENTS.productName;
  product.productCode = WRITE_ARGUMENTS.productCode;
  product.productDescription = WRITE_ARGUMENTS.productDescription;
  product.urlTitle = WRITE_ARGUMENTS.urlTitle;

  /*
   * The overrides parameter exists for one reason: the update arm. `saveProduct` branches on
   * `isNew()`, so a product with no identifier can only ever reach the INSERT statement. Supplying
   * `productID` here is what lets the same adversarial values be driven through the UPDATE arm as well,
   * and both arms need it — an insert lists the identifier among its values while an update matches on
   * it and appends it last, so the two bind their values at different offsets and a gate that saw only
   * one of them would be half a gate.
   */
  return Object.assign(product, overrides);
}

/**
 * Write-side arguments for the gate: quote-bearing, and unmistakable against any schema identifier.
 */
const WRITE_ARGUMENTS = Object.freeze({
  productName: "Pro'duct; DROP TABLE SwProduct; --",
  productCode: "co'de-alpha",
  productDescription: "des'cription <b>alpha</b>",
  urlTitle: "url'-title",
});

/**
 * Read-side arguments for the gate: quote-bearing, and unmistakable against any schema identifier.
 */
const READ_ARGUMENTS = Object.freeze({
  typeCodes: Object.freeze(["ty'pe-alpha", "ty'pe-beta"]),
  productTypeIds: Object.freeze(["pt'-alpha", "pt'-beta"]),
});

describe('NET-NEW — the query discipline every statement in this adapter is held to', () => {
  it('NET-NEW — matches parameter count to bind-marker count on every single statement', async () => {
    const statements = await everyStatementTheAdapterCanEmit();

    /*
     * TR-4 — positional, one for one, with no EXCEPTIONS. A count mismatch is the failure mode that
     * silently shifts every subsequent value by one, so it is checked on every statement rather than on
     * the ones a case happened to name.
     */
    expect(statements.length).toBeGreaterThan(20);
    for (const statement of statements) {
      expect((statement.sql.match(/\?/g) ?? []).length).toBe(statement.params.length);
    }
  });

  it('NET-NEW — never composes a supplied value into statement text, anywhere', async () => {
    const statements = await everyStatementTheAdapterCanEmit();
    const text = statements.map((statement) => statement.sql).join('\n');

    /*
     * Every value any of the six members was given — the importer's cells, the read side's search term
     * and product-type tokens, and the write side's quote-bearing product fields. None of them may appear
     * as text; all of them appear as parameters.
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

    /*
     * Absent from the text is only half the claim — each value must also have arrived, as a parameter.
     * The search term is the one exception, and a deliberate one: `:L422` wraps it in wildcards at the
     * binding site, so it binds as `%…%` rather than bare, and it is asserted in that form below.
     */
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

    /*
     * A statement addresses tables and columns and nothing else. The connection is the pool's business,
     * and the datasource name — `Slatwall`, per the legacy application configuration — is deliberately
     * absent from statement text, which is also what makes the naming-divergence assertion above unambiguous.
     */
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

    /*
     * The `Sw*` schema is the fixed contract both systems continue to agree on. This adapter reads and
     * writes rows; it never creates, alters, drops, truncates or seeds a table, and no such statement
     * exists anywhere in `model/dao/ProductDAO.cfc` to port.
     */
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
     * No row ceiling is invented, and the three that exist are enumerated rather than waved through —
     * separated by provenance, because only one of them is literally in the legacy text. A blanket
     * "no LIMIT anywhere" claim would be false, and a blanket "all three are source-grounded" claim would
     * be false in the other direction:
     *
     * 1. source-literal. `:L291` — the default-SKU back-fill's subquery. The `LIMIT 1` is in the
     * legacy text, and the absence of an `ORDER BY` beside it is preserved with it.
     * 2. answer-preserving target decision. `:l401-l404` — the URL-title probe. The legacy statement
     * carries no `LIMIT`: it projects `productID`, and `:L404` then reads nothing but the record
     * count, so one matching row was already complete evidence and every further row was discarded.
     */
    const limitedTexts = new Set(limited.map((statement) => collapse(statement.sql)));

    /*
     * There is no fourth shape, and its absence is deliberate. A windowed `searchByProductTypeBounded`
     * would be the only member able to emit a fourth `LIMIT ? OFFSET ?` shape, and this port declares
     * none: nothing in the slice reaches such a member, and AAP §0.4.2.1 closes `productService`
     * at fifteen members with no product search among them — so the fourth shape has no emitter and the
     * count is three.
     */
    expect(limitedTexts.size).toBe(3);

    /*
     * No windowed shape at all: this port accepts no caller-supplied window.
     */
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
    /*
     * And no windowed shape, because this port accepts no caller-supplied window.
     */
    expect(boundWindows).toHaveLength(0);

    /*
     * And no statement this adapter can emit carries an offset at all. The prohibition is global
     * because no member of this port paginates; what it encodes is that no
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
     * and both belong elsewhere: the importer's 3600-second request timeout at
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
      'FOR SHARE',
      'SQL_NO_CACHE',
    ]) {
      expect(text).not.toContain(forbidden);
    }

    /*
     * And the lock appears only where put it: the two check-then-act probes of
     * `model/dao/ProductDAO.cfc:L212-L214` and `:L218-L220`, each of which decides an insert. Asserted as an
     * exact set rather than as "at least these", so a revision that sprinkled `FOR UPDATE` across the
     * adapter's read surface — where it would take locks that protect nothing and invite deadlocks — fails
     * here even though every individual statement would still be syntactically fine.
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
    /* Each ends with the clause, which is the only position MySQL accepts. */
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
     * The executor is a collaborator, not a possession, and swapping it proves it. `mysql2` is never
     * imported by this suite and no pool is created anywhere in it: the adapter reaches a database only
     * through the injected statement seam, which is precisely what makes every assertion in this file
     * possible without a database. Re-pointing the read surface at a second double sends the statement
     * there instead — something an adapter holding its own connection could not do.
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
     * {@link collapse} is applied only when matching, and never before storing.
     */
    const [first] = harness.statements;
    expect(first).toBeDefined();
    // Composed text retains its own formatting: a normalising recorder would have collapsed this.
    expect(first?.sql).toContain('\n');
    expect(first?.sql.trim()).not.toBe(collapse(first?.sql ?? ''));

    /*
     * The snapshot is frozen, so a recorded array is a snapshot rather than a live reference the adapter
     * could still be holding and reusing. Every parameter array in the run is checked, not just one.
     */
    for (const statement of harness.statements) {
      expect(Object.isFrozen(statement.params)).toBe(true);
    }
  });
});

/*
 * The three additive members — the write, the removal, and the import controls
 * Everything above exercises the three members `model/dao/ProductDAO.cfc` declares. The suites below
 * exercise the three it does not, and their labels carry **NET-NEW** for a second and stronger reason
 * than the rest of the file: not merely "no legacy test exists" but "no legacy member exists". There
 * is no legacy statement, no legacy bind order and no legacy return contract for these to be
 * traceable to, so every expectation is derived from the production source alone and none of it should.
 */

/**
 * The 19 writable product columns, resolved through the whitelist in the adapter's declared order.
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

/** A transient product carrying the field values a save should persist. */
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
   * The two branches do not share an offset, and conflating them reads the next column's value.
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
     * The free stamping functions are correct here, and the contrast is deliberate.
     * `MySqlProductTypeRepository.saveProductType` calls the entity'S own hooks, because
     * `model/entity/ProductType.cfc:L305-L313` overrides them to rebuild its ancestry path before
     * delegating to the audit block. `model/entity/Product.cfc` overrides neither hook, so a product
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
     * Dropping the column would let the database apply its own default, which is a different outcome
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
     * D18's hardening applies to the importer's interpolated statements. This write interpolates
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
     * The identifier binds last here and first on the insert, because an insert lists it while an
     * update matches on it. Transposing the two would key the row on a column value — the single most
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
     * The order is the contract, because every step removes a row the next one references.
     * 1. The product's own back-reference to its default SKU is nulled, because that SKU row is
     * about to disappear and the column points at it.
     * 2. The SKU-option link rows go next, since they reference the SKU rows removed in step 3.
     * 3. The SKU rows, which reference the product row removed in step 4.
     * 4. The product itself, last.
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

describe('NET-NEW — the importer takes the legacy’s TWO arguments, and back-fills unconditionally', () => {
  /*
   * Two describe blocks stood here and are replaced by this one. They exercised
   * `importFromFile` takes exactly the legacy's two arguments and no options object. AAP §0.4.2.1
   * tabulates two, and a third parameter — a caller-supplied `AbortSignal`, a `deferBackfills` flag or
   * anything else — would break arity parity however defensible it is on its own. The case below pins the
   * arity so one cannot be smuggled back in.
   */

  it('NET-NEW — importFromFile accepts EXACTLY two arguments, so no control can be smuggled in', () => {
    const harness = buildHarness(fileWith([]));

    /*
     * `Function.length` counts the leading parameters up to the first one with a default, and neither
     * of these has one, so the count is the whole declared arity. It is the sharpest available guard
     * against a third parameter reappearing: a reinstated `options` argument fails here by name, even if
     * every behavioural case still passed because the new control defaulted to legacy behaviour.
     */
    expect(harness.repository.importFromFile.length).toBe(2);
  });

  it('NET-NEW — runs BOTH back-fills after the row loop, in order, outside every transaction', async () => {
    const harness = buildHarness(THREE_ROW_FILE, resolvingOptionGroup);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `model/dao/ProductDAO.cfc:L288-L302` then `:L304-L325`, both past the closing braces of the
     * transaction (`:L284`) and the loop (`:L285`) — so both run once, in that order, un-transacted.
     */
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
     * The unconditionality is the behaviour, and it is now unsuppressible. `:L288` and `:L304` are
     * guarded by neither a record count nor a file type, so an empty file still runs both whole-catalog
     * statements. No `deferBackfills` flag exists to suppress them, so the only arm is the legacy's.
     */
    expect(harness.statements.filter((statement) => statement.region === 'backfill')).toHaveLength(
      2,
    );
    expect(harness.transactionsStarted()).toBe(0);
  });

  it('NET-NEW — a mid-file FAILURE still runs NO back-fill, because the loop is left early (M3)', async () => {
    /*
     * The claim is that a mid-file failure leaves the earlier rows committed. The trigger here is a
     * failure on the first row's insert, which is the
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
/* ImportFromFile — the import-source seam, and the CWE-918 exposure mismatch M4 carries. */

describe('NET-NEW TODO(parity) — importFromFile: the adapter authors no import-source judgment', () => {
  /**
   * One hostile location per clause a fixed allow-list would have carried, each forwarded by the adapter
   * because `model/dao/ProductDAO.cfc:L73-L87` forwards it. What these rows pin is that the adapter hands
   * the location to the injected policy and reader without applying a judgment of its own, so mismatch
   * M4's CWE-918 surface stays visible rather than quietly half-closed.
   */
  const UNJUDGED_LOCATIONS: readonly { readonly location: string; readonly because: string }[] =
    Object.freeze([
      { location: 'file:///etc/passwd', because: 'scheme — not an HTTP scheme' },
      { location: 'ftp://files.test/x.csv', because: 'scheme — cfhttp does not speak FTP' },
      { location: 'gopher://files.test/1', because: 'scheme — a classic request-smuggling vector' },
      { location: 'data:text/csv,a,b', because: 'scheme — no retrieval happens at all' },
      {
        location: 'https://operator:secret@feeds.example/catalog.csv',
        because: 'credentials — a userinfo component',
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
        because: 'shape — not an absolute URL',
      },
    ]);

  it.each(UNJUDGED_LOCATIONS.map(({ location, because }) => [because, location]))(
    'NET-NEW TODO(parity) — %s: the location is forwarded to the reader unjudged',
    async (_because, location) => {
      /*
       * The reader is the one collaborator that would open a socket, and it is a recording double here, so
       * "forwarded" is observable without any network. What matters is that the adapter reached it at all
       * for a location no adapter-side gate screens, and that the location arrives byte
       * for byte — a normalisation here would be evaluated against a string an operator's policy never
       * sees, which is the classic bypass shape.
       */
      const harness = buildHarness(fileWith([]));

      await harness.repository.importFromFile(location);

      expect(harness.retrievals).toHaveLength(1);
      expect(harness.retrievals[0]?.source).toBe(location);
    },
  );

  it('NET-NEW — still retrieves every legitimate location too, so no clause is widened in isolation', async () => {
    /*
     * The complement of the rows above: an ordinary HTTPS location behaves exactly as it always did. Both
     * directions are asserted so a future reinstated gate fails the rows above rather than passing them by
     * accident.
     */
    const harness = buildHarness(fileWith([]));

    await harness.repository.importFromFile('https://feeds.example/catalog.csv', '"');

    expect(harness.retrievals).toEqual([
      { source: 'https://feeds.example/catalog.csv', delimiter: ',', textQualifier: '"' },
    ]);
  });

  it('NET-NEW — the .xls no-op still reaches no retriever, which is the legacy empty branch and not a gate', async () => {
    /*
     * `model/dao/ProductDAO.cfc:L83-L85` is an empty `//read xls` branch, so the spreadsheet path opens
     * no socket. No adapter-side gate screens the location, so nothing refuses a `.xls` location the
     * adapter never retrieves, and the branch is still silent for the
     * reason it always was.
     */
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

describe('NET-NEW — the mandatory operator import-source policy (CWE-918)', () => {
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

    /*
     * And the retrieval received the same string, so validation is on the real path rather than beside
     * it. If the adapter validated one value and fetched another, this pair would disagree.
     */
    expect(harness.retrievals).toEqual([
      {
        source: 'https://feeds.example/catalog.csv?a=1&b=%2E%2E',
        /*
         * TODO(parity) `model/dao/ProductDAO.cfc:L74` — the delimiter is empty, not a comma, and that
         * is the legacy's own behaviour rather than a fault here. The file type is the last dot-delimited
         * segment of the location, so a query string is swallowed into it: the type resolves to
         * `csv?a=1&b=%2E%2E`, which matches neither `csv` nor `txt`, and `:L75-L80` has no else — so the
         * delimiter stays `""` and the file is retrieved with no delimiter rather than failing.
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
     * The location is deliberately benign, which is what makes this case about the policy: the assertion
     * pins the refusal by identity, so it must be the operator policy that raises and not any other
     * control on the path.
     */
    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toBe(refusal);

    /*
     * The ordering is the point. The refusal happens before retrieval and before the first per-row
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
     * Deliberate, and it is not redundant. The `.xls` branch at `model/dao/ProductDAO.cfc:L83-L85`
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

    /*
     * One retrieval, one validation, three rows. The policy sits on the retrieval, not on the row loop,
     * so a file's row count cannot multiply the work a policy is asked to do.
     */
    expect(harness.validatedSources).toHaveLength(1);
    expect(harness.retrievals).toHaveLength(1);
  });

  it('NET-NEW — the SHIPPED policy refuses all three members, so it is no permissive default', async () => {
    const { sourcePolicy } = unresolvableProductImportSourceReader;

    /*
     * This is the case that keeps the fix honest. A required contract satisfied by an implementation
     * that admits everything would be worse than no contract, because every future reader would inherit
     * a pre-approved bypass. The shipped policy declines every member for the same documented reason the
     * shipped reader declines: `model/dao/ProductDAO.cfc:L87` resolves `getService("utilityTagService")`,
     * a bean declared nowhere in the legacy repository, and the `new http()` fallback at `:L89-L98` is
     * commented out — so the legacy import could never retrieve a file, and inventing a retrieval client.
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
     * Why `readBounds` is a method and not a property, asserted. A property would force every
     * implementation — including this non-retrieving one — to name three figures, and those figures would
     * be exactly the invented configuration AAP §0.7.3 and IR-12 forbid: the legacy states no
     * byte cap, no transfer timeout and no redirect limit anywhere. A method can decline.
     */
    expect(() => sourcePolicy.readBounds()).toThrow(/readBounds/);

    /*
     * The diagnostic names what an operator must supply, so the refusal is actionable rather than blunt.
     */
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
     * The guard that keeps the contract from drifting into invented policy. The fix is licensed only
     * because it obliges the operator to decide and decides nothing itself. This case reads the two
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

/*
 * The content assignment is ported, not refused (model/dao/ProductDAO.cfc:L257-L282)
 * The contract this section pins: "The target refuses the entire import when content-assignment columns are present. Legacy
 * code queries `tContent`, probes the product-content assignment, and inserts it. This is a functional
 * substitution, not a translation." Its resolution: "Introduce a declared boundary port for content
 * lookup/assignment or otherwise implement the planned import behavior without admitting arbitrary cms
 * identifiers into the Catalog whitelist."
 */

/* — the content-assignment step belongs to each row's own transaction. */

describe('the content-assignment collaborator is built per row, from that row’s transaction', () => {
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

    // The assertion this section turns on: two rows, two builds.
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
     * This is the property the whole finding is about. The step's existence probe filters on the
     * `productID` the product save has just written and not yet committed [`:L271`]. On any other
     * connection it would not find it, so a re-import would insert a duplicate link. The only way it can
     * see it is for the step to hold the row's own connection.
     */
    const harness = harnessWithResolvablePage(['page-1', 'CODE-1', 'Widget', 'Acme']);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    const scope = harness.contentAssignmentScopes[0];
    expect(scope).toBeDefined();

    /*
     * The scope's executor is the transactional one the row's own statements travelled through — not the
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
    // file does carry the heading, so `:L258` passes and only the per-row emptiness stops the step.
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
     * The partial-import shape is the legacy's and is preserved, not fixed. `:L177` commits per row, so
     * a failure on row 2 leaves row 1 committed and attempts no row 3. What the finding changes is the
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
    // a no-op would import a catalogue with every requested assignment dropped and report success.
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

describe('NET-NEW — the ported content assignment', () => {
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

    /* `:L271` — probed for this product and the resolved content. */
    expect(harness.contentProbes).toHaveLength(1);
    expect(harness.contentProbes[0]?.contentId).toBe('cccccccccccccccccccccccccccc0001');

    /*
     * `:L277` — one link row, with the content path denormalised beside the identifier exactly as the
     * legacy denormalises it, and with the product the row imported.
     */
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

    /*
     * `:L259` splits on the default comma delimiter and `:L260` iterates in that order. Order is asserted
     * rather than membership because the inserts are sequential and a concurrent implementation would let
     * two pages of one row race the `:L271` probe.
     */
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
     * unresolved page produces no error, no warning and no record. Both pages were looked up; only the
     * resolvable one was probed and inserted.
     *
     * TODO(parity) — the dropped assignment is undetectable by the caller, because `:L73` declares the
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
    /*
     * Seeded through the probe's own key shape, so the step sees an existing pair for whatever product
     * identifier the import mints.
     */
    const seedExisting = harness.existingAssignments;
    const originalHas = seedExisting.has.bind(seedExisting);
    jest
      .spyOn(seedExisting, 'has')
      .mockImplementation((key: string) =>
        key.endsWith('|cccccccccccccccccccccccccccc0001') ? true : originalHas(key),
      );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * It was resolved and probed, and the probe answering yes made the insert a no-op — the step is
     * idempotent, which is what lets the same file be imported twice.
     */
    expect(harness.contentLookups).toEqual(['page-1']);
    expect(harness.contentProbes).toHaveLength(1);
    expect(harness.contentInserts).toEqual([]);
  });

  it('NET-NEW — does nothing at all when the heading is absent (:L258, the ordinary import)', async () => {
    const harness = buildHarness(THREE_ROW_FILE);

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `:L258`'s `arrayFindNoCase` misses, so the collaborator is never consulted for any of the three
     * rows. This is the path every ordinary import takes.
     */
    expect(harness.contentLookups).toEqual([]);
    expect(harness.contentProbes).toEqual([]);
    expect(harness.contentInserts).toEqual([]);
  });

  it('NET-NEW — does nothing when the heading is present but the cell is EMPTY (:L259, :L260)', async () => {
    const harness = buildHarness(
      importable(CONTENT_FILE_HEADINGS, ['', 'CODE-1', 'Widget', 'Acme']),
    );

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * `listToArray('')` yields an empty array, so `:L260` iterates zero times. The row still imports —
     * which is what a whole-file refusal would get wrong in the other direction, since a file whose
     * content column was empty in every row completes in the legacy.
     */
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
     * This is the flagged consequence of porting the step rather than preflighting it, asserted. Row 1
     * committed and row 2 rolled back, so the catalogue is partially imported — and that is M3's own
     * shape, the same outcome any mid-file data failure produces, not something the boundary invented.
     * A preflight refusal of every such file would avoid this outcome, and would avoid the legacy's
     * behaviour along with it.
     */
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(1);
  });

  it('NET-NEW — the SHIPPED collaborator refuses all three members rather than dropping assignments', async () => {
    /*
     * Refusing is the honest default and resolving `null` would be the dangerous one. A lookup that
     * quietly resolved nothing would import a catalogue with every content assignment dropped and report
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

/*
 * The additive runtime paths.
 * Four groups of runtime behaviour existed on this adapter with no direct coverage at all, and the
 * review named every one of them: the streaming retrieval arm, cancellation at each observed boundary,
 * both arms of the back-fill deferral, and two of the three import lookup families. They are grouped here
 * because they share one property that makes untested-ness especially dangerous: none of them changes the
 * statements a plain import issues, so a regression in any of them is invisible to every other case in.
 */

describe('NET-NEW — the streaming retrieval arm', () => {
  it('NET-NEW — prefers readStreaming over read when the reader offers both', async () => {
    const streamed = buildHarness(THREE_ROW_FILE, undefined, undefined, {});
    const materialised = buildHarness(THREE_ROW_FILE);

    await streamed.repository.importFromFile('https://feeds.example/catalog.csv');
    await materialised.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * The preference is the contract, and it is what makes the member safely optional. Both readers
     * define `read`; only one also defines `readStreaming`, and the adapter takes the streaming arm
     * whenever it is there. That is what keeps the collaborator's contract additive — an existing reader
     * is not broken by the arm existing, and a streaming reader is not mandated by it.
     */
    expect(streamed.readerCalls).toEqual(['readStreaming']);
    expect(materialised.readerCalls).toEqual(['read']);

    /*
     * And the two arms converge. Same statements, same order, same regions, same transaction shape —
     * which is the whole justification for the arm existing at all. If the arms could diverge, the
     * streaming path would be new behaviour rather than a different way of delivering the same rows.
     */
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
    /*
     * The sampler needs the harness the same call is building, so it reads through a box that is filled
     * once the harness exists. `-1` would be recorded if a statement somehow preceded construction.
     */
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
     * This is the only direct evidence that nothing buffers the file. Row n is written while exactly n
     * records have been produced, so the generator is pulled one record at a time by the row loop rather
     * than drained up front. A `for await (const row of [...records])` — the obvious refactor — would
     * make this read `[3, 3, 3]` while leaving every other assertion in this file untouched.
     */
    expect(yieldedAtRowBoundary).toEqual([1, 2, 3]);
    expect(harness.recordsYielded).toEqual([1, 2, 3]);

    // Exhausted normally, and released exactly once.
    expect(harness.streamReleases()).toBe(1);
  });

  it('NET-NEW — a mid-file streaming failure keeps earlier rows committed (M3)', async () => {
    /*
     * The generator yields record 1, then fails when the loop asks for record 2 — a transport or parse
     * failure part-way through a file, which is precisely the shape M3 already tolerates.
     */
    const harness = buildHarness(THREE_ROW_FILE, undefined, undefined, { throwAfterRecords: 1 });

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/failed part-way through the file/);

    /*
     * The failure arrives between boundaries, not inside one, and that is why the outcome is clean.
     * The record source is advanced by the row loop after the previous row's transaction settled, so
     * row 1 is committed and durable, and the failure opens no second boundary to roll back. Compare a
     * mid-file data failure, which rolls its own row back — both leave earlier rows committed, which is
     * the M3 partial-import shape either way.
     */
    expect(harness.recordsYielded).toEqual([1]);
    expect(harness.transactionsStarted()).toBe(1);
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(0);

    /*
     * And the back-fills do not run. `model/dao/ProductDAO.cfc:L288` and `:L304` are reached only by
     * falling out of the loop; a raise inside it propagates past them in the legacy too. A `finally` that
     * ran them anyway would invent a recovery the legacy has no equivalent for.
     */
    expect(matching(harness, 'SET defaultSkuID')).toEqual([]);
    expect(matching(harness, 'SET imageFile')).toEqual([]);
  });

  it('NET-NEW — releases the stream even when it fails before yielding anything', async () => {
    const harness = buildHarness(THREE_ROW_FILE, undefined, undefined, { throwAfterRecords: 0 });

    await expect(
      harness.repository.importFromFile('https://feeds.example/catalog.csv'),
    ).rejects.toThrow(/failed part-way through the file/);

    /*
     * A source that fails immediately after its header pass still had a `finally` to run, and no row
     * boundary ever opened — so the import is a no-op rather than a partial one.
     */
    expect(harness.recordsYielded).toEqual([]);
    expect(harness.streamReleases()).toBe(1);
    expect(harness.transactionsStarted()).toBe(0);
  });

  it('NET-NEW — ABANDONS the stream cleanly when a row fails, running its finally', async () => {
    /*
     * Row 2's product insert fails, so the row loop stops consuming with record 3 never demanded.
     */
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
     * This is the case the port's `finally` obligation exists for, and it could not be asserted
     * before. `readStreaming` documents that a generator "has its `return()` invoked without having been
     * exhausted, and must release its connection, handle or buffer in a `finally` rather than only on
     * normal completion". That obligation is only DISCHARGEABLE if the consumer actually closes the
     * iterator — and the consumer is `for await` in `UnitOfWork.runEachItem`, through the
     * `normaliseRecords` generator in between. Both links have to forward the close, and this asserts.
     */
    expect(harness.recordsYielded).toEqual([1, 2]);
    expect(harness.streamReleases()).toBe(1);
    expect(harness.transactionsCommitted()).toBe(1);
    expect(harness.transactionsRolledBack()).toBe(1);
  });

  it('NET-NEW — takes NEITHER arm for the .xls branch, which retrieves nothing', async () => {
    const harness = buildHarness(THREE_ROW_FILE, undefined, undefined, {});

    await harness.repository.importFromFile('https://feeds.example/catalog.xls');

    /*
     * `model/dao/ProductDAO.cfc:L83-L85` is an empty `//Read xls`. The spreadsheet arm is tested before
     * the streaming arm, so offering `readStreaming` must not turn the documented no-op into a
     * retrieval — and the two back-fills still run, because `:L288` and `:L304` sit outside the branch.
     */
    expect(harness.readerCalls).toEqual([]);
    expect(harness.recordsYielded).toEqual([]);
    expect(harness.streamReleases()).toBe(0);
    expect(matching(harness, 'SET defaultSkuID')).toHaveLength(1);
  });
});

describe('NET-NEW — no cancellation boundary exists anywhere in the importer', () => {
  /*
   * No per-checkpoint cancellation suite and no back-fill-deferral suite exist here, because neither
   * control exists on the adapter. The reasoning is recorded once, above, at the importer's two-argument
   * case. What stands in their place is a pair of source-level guards, because an
   * absence is what has to be asserted now and a behavioural case cannot assert an absence: a reinstated
   * control that defaults to legacy behaviour would leave every behavioural case passing.
   */

  it('NET-NEW — the adapter source contains NO cancellation checkpoint at all', () => {
    const adapter = readFileSync(
      join(__dirname, '../../src/adapters/mysql/MySqlProductRepository.ts'),
      'utf8',
    );

    /*
     * A drift guard aimed at a drift that already happened twice. The predecessor of this case
     * enumerated the checkpoint set from the source and asserted it equalled
     * `['beforeRetrieval', 'afterSourceValidation', 'afterRetrieval', 'row']`, precisely so a fifth
     * boundary could not arrive untested. The same technique now asserts that the set is empty.
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
     * The port is where a control becomes a contract, so it is guarded independently of the adapter: an
     * interface member reinstated here would be a parity break even before any implementation used it.
     * Both names still appear in the file, inside the notes that record why neither exists, so every
     * pattern here is a declaration shape.
     */
    expect(port).not.toContain('export interface ProductImportOptions');
    expect(port).not.toMatch(/^\s*backfillImportDerivedColumns\(\): Promise<void>;/mu);
    expect(port).not.toMatch(/options\?: ProductImportOptions/u);
    expect(port).not.toMatch(/readonly signal\?: AbortSignal/u);
  });

  it('NET-NEW — M3 holds: earlier rows stay committed and no later row is attempted', async () => {
    /*
     * The one behavioural claim those controls were reached for, pointed at the mechanism the legacy
     * actually has. `model/dao/ProductDAO.cfc:L176-L177` opens a transaction inside
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

describe('NET-NEW — every import lookup is re-issued per row', () => {
  /*
   * The brand family is covered by "re-probes the brand on every row" above; these are the product-type
   * and option families, each asserted at the per-row cadence `model/dao/ProductDAO.cfc:L179-L186` and
   * `:L209-L235` establish.
   */

  it('NET-NEW — re-probes the product type on EVERY row, resolved or not', async () => {
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
     * The same arrangement as the brand family. `:L183-L186` is inside the record loop, so both
     * harnesses issue one statement per row. A per-file asymmetry — one statement for the resolving
     * harness, two for the unresolved one — was the memory's signature, and it is gone.
     */
    expect(matching(resolving, 'FROM SwProductType')).toHaveLength(2);
    expect(matching(unresolved, 'FROM SwProductType')).toHaveLength(2);
  });

  it('NET-NEW — re-probes BOTH the option and the link on every row', async () => {
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
     * Both reads are now per row, and the case used to assert that only one of them was. `:L212-L215`
     * re-runs the option lookup for every row × every surviving option group, and `:L218-L220` re-runs
     * the link probe for every row. The distinction this case was built around — the option resolution
     * remembered, the link probe live — would be a memory's, not the legacy's, and this adapter keeps
     * no such memory.
     */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(2);
    expect(matching(harness, 'FROM SwSkuOption')).toHaveLength(2);

    /* Each row's link probe binds the identifier its own lookup answered. */
    expect(matching(harness, 'FROM SwSkuOption')[1]?.params[0]).toBe(
      'dddddddddddddddddddddddddddd0001',
    );

    /* And both option lookups bind the same code and group — the read is repeated, not varied. */
    expect(matching(harness, 'LEFT JOIN SwOption').map((call) => call.params)).toEqual([
      ['Small', 'cccccccccccccccccccccccccccc0001'],
      ['Small', 'cccccccccccccccccccccccccccc0001'],
    ]);
  });

  it('NET-NEW — one code in two groups is looked up per group, per row', async () => {
    /*
     * Both headings carry the same option code, in two different groups — the exact collision a
     * code-only key would produce a wrong answer for.
     */
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
     * The arithmetic is the assertion, and changed it from 2 to 4. Two rows × two option groups =
     * four lookups, because `:L212-L215` is inside both the record loop and the per-group loop.
     */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(4);

    /*
     * And the two loops over the same array run in opposite directions, which is observable here.
     * `:L161` resolves the groups with `for(var i=arrayLen(optionGroups); i>=1; i--)` — descending, because
     * `:L170` deletes unresolved entries from the array being walked and only a descending walk can delete
     * safely — so the GROUP lookups issue in reverse heading order. `:L209` then assigns with
     * `for(var optionGroup in optiongroups)`, a plain ascending walk over the survivors, which retain
     * their original heading order. So the option lookups issue in heading order: `Size` before `Colour`.
     */
    expect(matching(harness, 'LEFT JOIN SwOption').map((call) => call.params)).toEqual([
      /* row 1 */ ['One', 'cccccccccccccccccccccccccccc0001'],
      ['One', 'cccccccccccccccccccccccccccc0002'],
      /* Row 2, the same pair again — this is the per-row repetition restored. */
      ['One', 'cccccccccccccccccccccccccccc0001'],
      ['One', 'cccccccccccccccccccccccccccc0002'],
    ]);
  });

  it('NET-NEW — an option code that LOOKS like a composite key is still just a bound value', async () => {
    /*
     * The `Size` cell is spelled to look like `<groupID>|<code>`, which is how a key-forging attempt would
     * be shaped. Nothing composes a key any more , so the cell can only ever reach a bind position —
     * this case now asserts that property directly rather than the unforgeability of a key that is gone.
     */
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
     * Both cells are looked up, and each cell travels as a bound value. A memoising cache would have to
     * key its entries on `groupID + NUL + code` precisely so a printable separator in file content
     * could not forge
     * another group's entry; with the memory gone there is no key to forge, and the residual property is
     * the stronger one — the cell reaches only a placeholder, never statement text (TR-4, D18).
     */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(2);

    /*
     * The forged-looking cell is bound verbatim in slot one, and the group it is matched against comes
     * from the pre-pass in slot two. Neither appears in the statement text.
     */
    const forged = matching(harness, 'LEFT JOIN SwOption')[0];
    expect(forged?.params).toEqual([
      'cccccccccccccccccccccccccccc0002|Blue',
      'cccccccccccccccccccccccccccc0001',
    ]);
    expect(forged?.sql).not.toContain('|Blue');
  });

  it('NET-NEW — an option the import CREATES is re-looked-up by the next row, and FOUND', async () => {
    const twoRowsOneNewOption = importable(
      ['product_productCode', 'option_Size'],
      ['CODE-1', 'Small'],
      ['CODE-2', 'Small'],
    );

    /*
     * A stateful stub, and the state is the point. A memoising adapter would answer row 2 from the
     * entry row 1 recorded, and a stub frozen at `optionID: null` would suit that shape. This adapter
     * keeps no memory, so row 2 does probe — and a stub frozen at `null` would make row 2
     * create a second option, which is neither the legacy's behaviour nor the database's. Modelling the
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
        /*
         * `:L212-L215` is an outer join: it returns the GROUP with a NULL option while none exists — the
         * `:L217` empty branch that creates one — and the option itself once it does.
         */
        return sqlRows([
          { optionID: createdOptionID, optionGroupID: 'cccccccccccccccccccccccccccc0001' },
        ]);
      }

      return undefined;
    });

    await harness.repository.importFromFile('https://feeds.example/catalog.csv');

    /*
     * Exactly one option is created, and not because anything was remembered. Row 2 re-issues
     * `:L212-L215`, the outer join now returns the option row 1 inserted, and `:L217` takes its non-empty
     * branch — so the creation arm does not run a second time. The legacy reaches the same outcome by the
     * same route, and it is the database that carries the fact across rows rather than a cache.
     */
    const created = matching(harness, 'INSERT INTO SwOption ');
    expect(created).toHaveLength(1);
    expect(String(created[0]?.params[0])).toMatch(HEX_32);

    /* Two lookups for two rows — the per-row repetition restored. */
    expect(matching(harness, 'LEFT JOIN SwOption')).toHaveLength(2);

    /*
     * The creation arm issues no existence probe at all, and that asymmetry is the legacy's.
     * `model/dao/ProductDAO.cfc:L217` probes `SlatwallSkuOption` only on its non-empty branch; the empty
     * branch at `:L222-L228` creates the option and then sets `exists = false` outright, without asking,
     * because an option that did not exist a statement ago can carry no link. So row 1 probes zero times
     * and links once, and row 2 — arriving through its own lookup — takes the `:L217` non-empty branch and
     * probes exactly once. One probe across two rows, not two.
     */
    const probes = matching(harness, 'FROM SwSkuOption');
    expect(probes).toHaveLength(1);
    expect(probes[0]?.region).toBe('row#2');
    expect(probes[0]?.params[0]).toBe(String(created[0]?.params[0]));

    /* Both rows link, because row 1 skipped the probe and row 2's probe found nothing. */
    expect(matching(harness, 'INSERT INTO SwSkuOption')).toHaveLength(2);
  });

  it('NET-NEW — no lookup state survives an import, so a warm instance cannot leak one (M7)', async () => {
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
     * The hazard M7 names, asserted rather than documented — and now structurally impossible.
     * Nothing survives between Lambda invocations except module-scope state, so lookup state held as a
     * field on the repository would let one caller's catalogue identifiers answer the next caller's import
     * on a warm container.
     */
    expect(matching(harness, 'FROM SwBrand')).toHaveLength(2);

    /*
     * One row per import, one brand statement per row, two imports — and each binds the same cell.
     */
    expect(matching(harness, 'FROM SwBrand').map((call) => call.params)).toEqual([
      ['Acme'],
      ['Acme'],
    ]);
  });
});

/*
 * Aggregate loaders
 * `createCatalogAggregateLoaders` lives in `src/adapters/mysql/QueryRunner.ts`, so its cases live in this
 * suite rather than in one of their own. `src/adapters/mysql/SmartListQueryBuilder.ts` only consumes those
 * loaders through its `aggregateLoaders` constructor parameter and hosts none of them. The identifiers
 * this section declares — `ID`, `journal`, `makeExecutor` and `makeBinderSpy` — are local to it.
 */
/*
 * The element type is derived from the root entity, pinned here rather than assumed. Every
 * `builder.execute(...)` below passes a query and no element type, because
 * `SmartListQueryPort.execute` reads the pairing out of `query.entityName` through
 * `SmartListEntityRecordTypes`. The three aliases immediately below are what make that a checked claim
 * in this file rather than an assumption.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;
type _SkuRootYieldsSku = AssertAssignable<SmartListRecord<'SlatwallSku'>, Sku>;
type _OptionRootYieldsOption = AssertAssignable<SmartListRecord<'SlatwallOption'>, Option>;
type _ProductRootYieldsProduct = AssertAssignable<SmartListRecord<'SlatwallProduct'>, Product>;

/**
 * Distinct 32-character identifiers, so a crossed association is visible rather than coincidental.
 */
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

/** An executor backed by a tiny in-memory table store that honours the where clause. */
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
          /*
           * — `Sku.price` is exact-decimal text, so the spy's numeric literal is adopted at this
           * boundary rather than handed through as a double.
           */
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

/** Identifies the product-load statement the SKU and option roots' loaders issue. */
function isProductLoad(sql: string): boolean {
  return sql.startsWith('SELECT SwProduct.productID');
}

describe('NET-NEW — SmartListQueryBuilder aggregate materialization — the SKU root', () => {
  /**
   * A SKU result set whose rows name a product, plus that product's own row and its associations.
   */
  function skuScenario(): Readonly<Record<string, readonly MySqlRow[]>> {
    return {
      /*
       * The three money columns are strings, not numbers, and that is the driver contract rather
       * than a fixture quirk. `model/entity/Sku.cfc:L55-L57` declares them `ormtype="big_decimal"`, and
       * `rowMappers.ts` reads them through `readOptionalExactDecimal`, which refuses a JavaScript number
       * because by the time one arrives the exact digits are already gone . Handing a number here
       * would be asserting against a result set the configured pool cannot produce.
       */
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

  it('NET-NEW — attaches the product every SKU names, so requireProduct no longer has anything to refuse', async () => {
    const { executor } = makeExecutor(skuScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });

    /*
     * All three rows in the store belong to this product — the two ordinary SKUs and the default one.
     */
    expect(result.records).toHaveLength(3);
    for (const sku of result.records) {
      /*
       * An absent key on every record is exactly what the feed's guard
       * reported — once per item, for every item.
       */
      expect(sku.product).toBeDefined();
      expect(sku.product?.productID).toBe(ID.product);
    }
  });

  it('NET-NEW — attaches the product type and the brand the product names', async () => {
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
   * The case that proves the binder is real. `Sku` is not assignable to `ProductDefaultSkuDelegate`, so
   * a loader that "attached the default SKU" by casting would compile only with a suppression and would
   * hand the product an object missing four of the nine members the delegate promises. Asserting that
   * the binder was consulted, and that the price reaches the product through it, is what distinguishes a
   * real binding from a cast.
   */
  it('NET-NEW — binds the default SKU through the injected adapter, and product.getPrice reads through it', async () => {
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
    /*
     * `Product.getPrice()` falls through to `defaultSku.getPrice()`, which is the whole reason the
     * default SKU is loaded — the feed's `g:price` reads it.
     */
    expect(product?.getPrice()).toBe(toExactDecimal(1234));
  });

  it('NET-NEW — gives sibling SKUs of one product the SAME product instance', async () => {
    const { executor } = makeExecutor(skuScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });

    /*
     * Definedness is asserted first, and deliberately. `toBe` alone would be satisfied by two
     * `undefined`s, so with the loader removed this case would pass vacuously while asserting nothing —
     * the exact failure mode a mutation check exists to expose.
     */
    const first = result.records[0]?.product;
    const second = result.records[1]?.product;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    /*
     * Identity, not equality: the mapping layer's semantics, and what lets a consumer compare by
     * reference. It is also the evidence that one statement served every sibling.
     */
    expect(first).toBe(second);
  });

  it('NET-NEW — issues ONE product statement for a batch that names one product twice', async () => {
    const { executor, journal } = makeExecutor(skuScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    await builder.execute({ entityName: 'SlatwallSku' });

    const productLookups = journal.statements.filter((statement) => isProductLoad(statement.sql));
    /*
     * Two SKUs naming one product, and the builder materialises `records` and `pageRecords` separately —
     * so a naive implementation would issue up to four. De-duplication across the whole invocation is
     * what makes it one.
     */
    expect(productLookups).toHaveLength(1);
    expect(productLookups[0]?.params).toEqual([ID.product]);
  });

  it('NET-NEW — leaves the brand absent when the product names none, without raising', async () => {
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

  it('NET-NEW — issues no association statement at all for an empty result set', async () => {
    const { executor, journal } = makeExecutor({ SwSku: [] });
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });

    expect(result.records).toEqual([]);
    /* `IN ` is not legal SQL and there is nothing to ask for. */
    expect(journal.statements.some((statement) => statement.sql.includes('IN ()'))).toBe(false);
    expect(journal.statements.filter((s) => isProductLoad(s.sql))).toHaveLength(0);
  });

  it('NET-NEW — binds every identifier positionally and interpolates none', async () => {
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

describe('NET-NEW — SmartListQueryBuilder aggregate materialization — DATA-02, the option root', () => {
  it('NET-NEW — attaches the required option group, so requireOptionGroupID no longer refuses', async () => {
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

    /*
     * `model/entity/Option.cfc:L59` declares this relationship required, so it must be present on
     * every hydrated option, so every merchandise SKU creation carrying options raised.
     */
    expect(result.records[0]?.optionGroup).toBeDefined();
    expect(result.records[0]?.optionGroup?.optionGroupID).toBe(ID.optionGroup);
    expect(result.records[0]?.optionGroup?.optionGroupCode).toBe('size');
  });

  it('NET-NEW — needs no delegate binder to resolve, since an option group is loaded whole', async () => {
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

  it('NET-NEW — leaves the group absent when the column is empty, deferring to the consumer guard', async () => {
    const { executor } = makeExecutor({
      SwOption: [{ optionID: ID.option, optionGroupID: '' }],
    });
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallOption' });

    /*
     * `unsavedvalue=""` means the empty string spells absence, so no `WHERE id = ''` is issued. The
     * consumer's own guard reports it with the option identifier and the legacy locator, which is a
     * better error than this loader could produce.
     */
    expect(result.records[0]).toBeDefined();
    expect(result.records[0]?.optionGroup).toBeUndefined();
  });
});

describe('NET-NEW — SmartListQueryBuilder aggregate materialization — DATA-03, the product root', () => {
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
      /* Money columns are strings for the reason stated on the SKU scenario above. */
      SwSku: [
        { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
        { skuID: ID.sku, skuCode: 'SKU-1', price: '10.00', productID: ID.product },
      ],
    };
  }

  it('NET-NEW — attaches the productType, brand, defaultSku and skus a product aggregate needs', async () => {
    const { executor } = makeExecutor(productScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });
    const product = result.records[0];

    /* The four associations data-03 named as missing from `ProductService.getProduct`. */
    expect(product?.productType?.productTypeID).toBe(ID.productType);
    expect(product?.brand?.brandID).toBe(ID.brand);
    expect(product?.defaultSku?.getPrice()).toBe(toExactDecimal(99));
    expect(product?.getSkus()).toHaveLength(2);
  });

  it('NET-NEW — gives every SKU in the collection a back-reference to the product that owns it', async () => {
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
   * The identity case, and its premise was reversed on purpose. It was written when `records` and
   * `pageRecords` were materialised into DISTINCT objects for the same row, and it asserted that no SKU
   * object was shared between the two graphs — the mistake it policed being a loader that pushed one
   * SKU instance onto both collections, leaving `records[0].getSkus()[0].product` pointing at
   * `pageRecords[0]`.
   */
  it('NET-NEW — loads a shared owner ONCE, even when it appears in both collections', async () => {
    const { executor } = makeExecutor(productScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    /*
     * The page is asked for from the second row on purpose, and that is what makes this case mean
     * anything. The builder skips the page statement and reuses the unpaged collection when the
     * page window provably covers every row in hand — `pageRecordsStart === 1 && recordCount <=
     * show` — and this scenario has a single product row, so a default query would take that path
     * and hand back the same array for both collections — the loader would then be offered the
     * owner once and the double-append this case polices could not occur, so the case would pass
     * while proving nothing.
     */
    const result = await builder.execute({
      entityName: 'SlatwallProduct',
      pagination: { pageRecordsStart: 2 },
    });
    const fromRecords = result.records[0];
    const fromPageRecords = result.pageRecords[0];

    expect(fromRecords).toBeDefined();
    expect(fromPageRecords).toBeDefined();
    /* One instance for one row, across both result sets. The identity map's contract. */
    expect(fromRecords).toBe(fromPageRecords);

    /*
     * Two, not four. The scenario holds two SKU rows for this product, and the product was offered to
     * the loader from the unpaged collection and from the page. Appending per offer would double the
     * collection while every other assertion here still passed.
     */
    expect(fromRecords?.getSkus()).toHaveLength(2);

    /* And the SKUs are the same instances through either handle, since there is only one graph. */
    const recordSkus = fromRecords?.getSkus() ?? [];
    const pageSkus = fromPageRecords?.getSkus() ?? [];
    expect(recordSkus).toStrictEqual(pageSkus);
    for (const member of recordSkus) {
      expect((member as Sku).product).toBeDefined();
      expect((member as Sku).product).toBe(fromRecords);
    }
  });

  it('NET-NEW — issues ONE SKU collection statement for the whole invocation', async () => {
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
    /*
     * One product named twice — once by `records`, once by `pageRecords` — is still one identifier.
     */
    expect(collectionReads).toHaveLength(1);
    expect(collectionReads[0]?.params).toEqual([ID.product]);
  });

  it('NET-NEW — leaves a product with no SKU rows carrying an empty collection, without raising', async () => {
    const scenario = { ...productScenario(), SwSku: [] };
    const { executor, journal } = makeExecutor(scenario);
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });

    expect(result.records[0]?.getSkus()).toEqual([]);

    /*
     * The slot is not empty, and the assertion that it was described a different fixture.
     * This scenario keeps `productScenario()`'s product row — which carries `defaultSkuID` — and empties
     * `SwSku`. That is a DANGLING foreign key, not "a product with no SKUs yet"; a product with no SKUs
     * yet has `defaultSkuID` NULL, and for that row the slot genuinely is absent.
     */
    const unresolved = result.records[0]?.defaultSku;
    expect(unresolved).toBeDefined();
    expect(readProductDefaultSkuId(unresolved ?? {})).toBe(ID.defaultSku);
    expect(() => unresolved?.getPrice()).toThrow();

    expect(journal.statements.some((statement) => statement.sql.includes('IN ()'))).toBe(false);
  });

  /*
   * The product root hydrates its SKUs' options and marks only that collection read.
   * `productService.getProduct` executes an identifier query against `SlatwallProduct`, so this loader is
   * the single hydration path into every product mutation member — which is why the product root and not
   * the SKU root is the subject here.
   */

  /** The product scenario plus the SKU-option link and the group behind it. */
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

  it('NET-NEW — attaches each SKU option WITH its option group, so the members that read through it work', async () => {
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
     * The group comes with it, and that is not incidental: `Sku.generateImageFileName` reads
     * `option.getOptionGroup().getImageGroupFlag()` (`model/entity/Sku.cfc:L134`) and
     * `processProductAddOption` reads the group's identifier at `:L144`, so an option attached without
     * its group would satisfy the type and then answer from a class default.
     */
    expect(withOption?.getOptions()[0]?.optionGroup?.optionGroupID).toBe(ID.optionGroup);
  });

  it('NET-NEW — marks `options` authoritative for EVERY SKU in the batch, including one with no link rows', async () => {
    const { executor } = makeExecutor(optionedProductScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });
    /*
     * `Product.getSkus()` answers `ProductSkuMember`, the narrow read surface the domain exposes; the
     * provenance predicate takes `object`, so the members are passed through as such rather than cast to
     * `Sku` — a cast the domain layer deliberately makes impossible (see the defaultSku delegate note).
     */
    const skus: readonly object[] = result.records[0]?.getSkus() ?? [];

    expect(skus).toHaveLength(2);
    for (const member of skus) {
      /*
       * Including the default SKU, which the link table returned nothing for. The read established that
       * it has no options, which is a fact, and recording it is what keeps removal working: an emptied
       * collection has to stay distinguishable from an unloaded one or `persistSku` could never clear
       * one. Marking only the SKUs that came back with rows would silently break that.
       */
      expect(isSkuOwnedLinkAuthoritative(member, 'options')).toBe(true);
    }
  });

  it('NET-NEW — leaves the three out-of-scope owned collections UNREAD, issuing no statement for them', async () => {
    const { executor, journal } = makeExecutor(optionedProductScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });
    /*
     * `Product.getSkus()` answers `ProductSkuMember`, the narrow read surface the domain exposes; the
     * provenance predicate takes `object`, so the members are passed through as such rather than cast to
     * `Sku` — a cast the domain layer deliberately makes impossible (see the defaultSku delegate note).
     */
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

  it('NET-NEW — issues ONE option statement for the whole page rather than one per SKU', async () => {
    const { executor, journal } = makeExecutor(optionedProductScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
      GENEROUS_SMART_LIST_BUDGET,
    );

    await builder.execute({ entityName: 'SlatwallProduct' });

    /*
     * The batching is the translation, and it is worth pinning. The legacy triggered one lazy load per
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

describe('NET-NEW — SmartListQueryBuilder aggregate materialization — the roots that declare no loader', () => {
  it('NET-NEW — hydrates a brand root with no extra statement, because Brand declares no many-to-one', async () => {
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
     * Two statements and no more, and the point of the case is the "no more". A root with nothing to
     * resolve declares no loader — a decision per root rather than a fallback — so no aggregate
     * statement is issued on top of the query's own.
     */
    expect(journal.statements).toHaveLength(2);
  });
});

/*
 * — the joined option fetch, asserted on its statement text rather than on its objects
 * These cases exist because a whole class of defect was invisible to this suite. Every case above
 * asserts on hydrated objects, and an in-memory double answers whatever shape it is asked for, so a
 * statement no server would accept still produced a green run. `attachSkuOptions` — the port of
 * `model/dao/SkuDAO.cfc:L157`'s `inner join fetch sku.options`, and the only JOIN in the module — was
 * emitting `SELECT link.skuID, optionID, …` with the option's own columns unqualified. Both joined
 *
 * Er_non_uniq_error (1052): column 'optionID' in field list is ambiguous.
 */
describe('NET-NEW — the joined option fetch emits a statement a real server accepts', () => {
  /** Runs the joined option fetch for two SKUs that share one option. */
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

  /**
   * The one joined statement in the module, located by its `INNER JOIN` rather than by position.
   */
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

  it('NET-NEW — qualifies EVERY projected column, so the field list carries no bare identifier', async () => {
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

  it('NET-NEW — never projects a bare `optionID`, the column both joined tables declare', async () => {
    const { journal } = await fetchOptions();
    const projection = projectionOf(joinedStatement(journal).sql);

    /* The exact shape MySQL rejected: `optionID` with nothing in front of it. */
    expect(projection.split(', ')).not.toContain('optionID');
    expect(projection).toContain('SwOption.optionID');
    expect(projection).toContain('link.skuID');
  });

  it('NET-NEW — binds one placeholder per requested SKU and interpolates no value', async () => {
    const { journal } = await fetchOptions();
    const statement = joinedStatement(journal);

    /* TR-4 — placeholder count equals parameter count, and every value travels as a parameter. */
    expect((statement.sql.match(/\?/g) ?? []).length).toBe(statement.params.length);
    expect(statement.params).toEqual([ID.sku, ID.siblingSku]);
    expect(statement.sql).not.toContain(ID.sku);
    expect(statement.sql).not.toContain(ID.siblingSku);
    expect(statement.sql).not.toContain("'");
  });

  it('NET-NEW — hydrates the options AND their groups onto every SKU that owns them', async () => {
    const { skus } = await fetchOptions();

    expect(skus).toHaveLength(2);
    for (const sku of skus) {
      expect(sku.options).toHaveLength(1);
      /*
       * The group comes with the option because the members that matter read through it:
       * `Sku.generateImageFileName` reads `option.getOptionGroup().getImageGroupFlag()`
       * [model/entity/Sku.cfc:L134].
       */
      expect(sku.options[0]?.optionGroup?.optionGroupCode).toBe('size');
    }
  });

  it('NET-NEW — qualifies the single-table loaders too, so no shared projection is a join hazard', async () => {
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

/*
 * Relationship hydration reached through the synthesized service members. Hydration and the identity map
 * belong to this file; the builder's own count, projection and paging behaviour is covered in
 * `test/adapters/MySqlOptionRepository.test.ts`, which owns `SmartListQueryBuilder`.
 */

describe('NET-NEW — OptionService relationship hydration through the real builder', () => {
  const OPTION_GROUP_ROW = Object.freeze({
    optionGroupID: ID.optionGroup,
    optionGroupName: 'Size',
    optionGroupCode: 'size',
    imageGroupFlag: 1,
    sortOrder: 1,
  });

  /**
   * The option repository is genuinely unreached by these members, so it refuses rather than pretends.
   */
  const UNREACHED_OPTION_REPOSITORY = {
    findUnusedOptions: (): never => {
      throw new Error('the option repository is not reached by a synthesized get member');
    },
    findUnusedOptionGroups: (): never => {
      throw new Error('the option repository is not reached by a synthesized get member');
    },
  } as unknown as ConstructorParameters<typeof OptionService>[0];

  /**
   * Routes statements by shape, because the two roots these cases exercise are hydrated by two different
   * mechanisms and a fixture that conflated them would prove nothing about either.
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
        /*
         * The injected loader's lookup. The ` IN (` test is what separates it from the OptionGroup root's
         * own base record statement, which also reads `FROM SwOptionGroup` but carries no WHERE clause —
         * without that test, case three's base statement would be answered with group-association rows.
         */
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

  it('NET-NEW — getOption hydrates optionGroup, and a SECOND statement is issued to do it', async () => {
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

    /*
     * `model/entity/Option.cfc:L59` declares the relationship, and `rowMappers.ts` rule 3 deliberately
     * leaves it unresolved — so without the hydration pass this is `undefined` and every merchandise SKU
     * creation carrying options raises at `requireOptionGroupID`.
     */
    expect(option?.optionGroup).toBeDefined();
    expect(option?.optionGroup?.optionGroupID).toBe(ID.optionGroup);
    expect(option?.optionGroup?.optionGroupName).toBe('Size');
    /*
     * The chain `Sku.hasOneOptionPerOptionGroup` walks — `model/entity/Sku.cfc:L772-L784`. The port reads
     * the field rather than an accessor, because `Option` declares `setOptionGroup` and no getter: the
     * CFML accessor is one the ORM synthesizes.
     */
    expect(issuedARelationshipStatement(statements)).toBe(true);
    /* And it really is a second statement, not the base one doing double duty. */
    expect(statements.length).toBeGreaterThan(1);
  });

  it('NET-NEW — a NULL foreign key leaves optionGroup ABSENT rather than stubbed', async () => {
    /*
     * `SwOption.optionGroupID` carries no `notnull` in the mapping, so a row with no value is possible.
     * Rule 3 forbids a stub precisely because `option.getOptionGroup().getImageGroupFlag()` would read a
     * class default off one — the association must be absent, not an object answering `false`.
     */
    const { service, statements } = makeService({
      entityRows: [{ optionID: ID.option, optionName: 'Small', optionCode: 'sm', sortOrder: 1 }],
    });

    const option = await service.getOption(ID.option);

    expect(option).not.toBeNull();
    /* No key was collected, so no lookup was even attempted — the absence costs nothing. */
    expect(issuedARelationshipStatement(statements)).toBe(false);
    expect(option?.optionGroup).toBeUndefined();
  });

  it("NET-NEW — getOptionGroup hydrates options in the declared sortOrder, and sets each option's group back", async () => {
    /*
     * `model/entity/OptionGroup.cfc:L70` declares `orderby="sortOrder"`, so order is behaviour here —
     * unlike `Sku.options`, which declares no `orderby` at all. The statement asks the database for that
     * order, so the rows arrive in it; this asserts the collection preserves what it was given.
     */
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

    /*
     * The D14 site indexes `options[1]` — `model/service/ProductService.cfc:L115-L119`. With an empty
     * collection that carried-over defect is not even reproducible, which is why this assertion is on the
     * order and not merely on the length.
     */
    expect(group?.options.map((option) => option.optionID)).toEqual([
      'ffffffff000000000000000000000011',
      'ffffffff000000000000000000000012',
    ]);
    /*
     * Both directions consistent, as one Hibernate session would give — and by reference, so what is
     * asserted is the identity map rather than a value copy.
     */
    expect(group?.options[0]?.optionGroup).toBe(group);
    expect(group?.options[1]?.optionGroup).toBe(group);
  });

  it('NET-NEW — two options of one group share ONE OptionGroup instance (the identity map)', async () => {
    /*
     * One instance per identifier per read is what a single Hibernate session gives, and it is what makes
     * `===` between two references to the same row meaningful. Two separate instances would also mean the
     * row had been managed twice, which installs a fresh error bag and discards anything already
     * accumulated on it.
     */
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
      /*
       * One group row for two options, which is what makes the identity assertion meaningful: the loader
       * de-duplicates the foreign keys into a single `IN (…)` lookup and must hand both options the same
       * instance built from that one row.
       */
      optionGroupRows: [{ ...OPTION_GROUP_ROW }],
    });

    const result = await service.getOptionSmartList();

    expect(result.records).toHaveLength(2);
    const [first, second] = result.records;
    expect(first?.optionGroup).toBeDefined();
    expect(first?.optionGroup).toBe(second?.optionGroup);
  });
});

/*
 * Product write surface
 * The write surface belongs to `src/adapters/mysql/MySqlProductRepository.ts`, so its cases live in this
 * suite. Four identifiers carry a `persistence` prefix — `persistenceMatching`,
 * `makePersistenceExecutor`, `PersistenceJournal` and `PERSISTENCE_ID` — to avoid colliding with the
 * declarations the aggregate-loader section above already makes.
 */
/**
 * A collaborator this scenario never reaches needs no behaviour, and giving it one would suggest the
 * case depends on it. Same discipline as `test/services/SkuService.test.ts`.
 */
const UNREACHED_COLLABORATOR = {} as never;

/** Distinct 32-character identifiers, so a crossed binding is visible rather than coincidental. */
const PERSISTENCE_ID = {
  product: 'aaaaaaaa000000000000000000000001',
  /*
   * A second product, so an inheritance case can assert collection order rather than membership.
   */
  otherProduct: 'aaaaaaaa000000000000000000000002',
  productType: 'bbbbbbbb000000000000000000000001',
  parentProductType: 'bbbbbbbb000000000000000000000002',
  brand: 'cccccccc000000000000000000000001',
  defaultSku: 'dddddddd000000000000000000000001',
  otherSku: 'dddddddd000000000000000000000002',
} as const;

/** The URL-title availability probe, shared by every scenario that constructs a service. */
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

/** A recording executor. */
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

/** Reads the identifier of a default-SKU delegate. */
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

/**
 * The adapter under test, with everything it needs recorded.
 *
 * @param rowsByTable the rows the executor answers, by table
 * @param affectedRows the count `executeMutation` reports
 * @param account the acting principal; a persisted administrative account by default, which is the only
 * kind the legacy audit gates attribute a write to.
 */
function makeAdapter(
  rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {},
  affectedRows = 1,
  account: AccountReference = persistedAdminAccount(),
): {
  readonly adapter: MySqlProductPersistence;
  readonly journal: PersistenceJournal;
  readonly cleanup: ReturnType<typeof makeCleanup>;
  readonly defaultSkuIds: ReturnType<typeof makeDefaultSkuIdReader>;
  readonly account: AccountReference;
} {
  const { executor, journal } = makePersistenceExecutor(rowsByTable, affectedRows);
  const cleanup = makeCleanup();
  const defaultSkuIds = makeDefaultSkuIdReader();

  return {
    journal,
    cleanup,
    defaultSkuIds,
    account,
    adapter: new MySqlProductPersistence(
      executor,
      cleanup.cleanup,
      defaultSkuIds.read,
      createAccountContextDouble(account).accountContext,
    ),
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

/**
 * The value bound for one named column, located from the statement's own text.
 *
 * @param statement the recorded statement, or `undefined` when the journal held none
 * @param column the column whose bound value is wanted
 * @returns the bound value
 * @throws when the statement is absent or does not name the column, so a silent `undefined` cannot pass.
 */
function boundValueFor(statement: Statement | undefined, column: string): unknown {
  if (statement === undefined) {
    throw new Error(`expected a recorded statement to read '${column}' from`);
  }

  const insertColumnList = /\(([^)]*)\) VALUES/.exec(statement.sql)?.[1];
  const columns =
    insertColumnList === undefined
      ? (/ SET (.*) WHERE /.exec(statement.sql)?.[1] ?? '')
          .split(', ')
          .map((assignment) => assignment.replace(' = ?', ''))
      : insertColumnList.split(', ');

  const index = columns.indexOf(column);
  if (index === -1) {
    throw new Error(`the statement does not name '${column}': ${statement.sql}`);
  }

  return statement.params[index];
}

/* The `SwProduct` write path. */

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
    // The identifier is bound first, persistenceMatching the column list's own ordering.
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
    // (:L96-L99). Its twenty non-persistent properties (:L102-L123) are not columns and are absent.
    expect(columns).toHaveLength(20);
    expect(columns).toContain('productID');
    expect(columns).toContain('calculatedTitle');
    expect(columns).toContain('brandID');
    expect(columns).toContain('productTypeID');
    expect(columns).toContain('defaultSkuID');
    // The crossed audit pairing: the columns carry the `PERSISTENCE_ID` suffix, the fields do not.
    expect(columns).toContain('createdByAccountID');
    expect(columns).toContain('modifiedByAccountID');
    // A non-persistent property must never appear as a column.
    expect(columns).not.toContain('price');
    expect(columns).not.toContain('optionGroups');

    expect(insert?.params).toHaveLength(columns.length);
  });

  it('NET-NEW — the three foreign keys come from the ASSOCIATION OBJECTS, not from scalars', async () => {
    // "Preserve association identity" in practice: `rowMappers.ts` rule 3 leaves every many-to-one
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
    // The default SKU arrives through the injected reader, because the delegate exposes no
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
    // Nineteen assignments plus the key: the key is the last bound value, persistenceMatching its position in
    // the statement text.
    expect(updates[0]?.params).toHaveLength(20);
    expect(updates[0]?.params[19]).toBe(PERSISTENCE_ID.product);
  });

  /*
   * — the ORM lifecycle this seam owns
   * why this group exists, and what it pins that nothing else did.
   */

  it('NET-NEW — the INSERT stamps the audit block from the acting principal, taking ONE instant', async () => {
    const { adapter, journal, account } = makeAdapter();
    const product = new Product();
    product.productName = 'Audited On Insert';

    await adapter.saveProduct(product);

    /*
     * `model/entity/Product.cfc` does not override the hooks, so the framework block at
     * `org/Hibachi/HibachiEntity.cfc:L598-L649` is the whole behaviour: both timestamps take the same
     * instant read once at `:L609`, and both account columns are written for a persisted administrative
     * actor.
     */
    expect(product.createdDateTime).toBeInstanceOf(Date);
    expect(product.modifiedDateTime).toBeInstanceOf(Date);
    expect(product.createdDateTime?.getTime()).toBe(product.modifiedDateTime?.getTime());
    expect(product.createdByAccount).toBe(account.accountID);
    expect(product.modifiedByAccount).toBe(account.accountID);

    /*
     * And the stamp reached the statement, which is the half an entity-only assertion misses. The order
     * is fixed — stamp first, collect second — so a member that stamped afterwards would leave these four
     * bindings null while the entity above looked perfectly correct.
     */
    const insert = persistenceMatching(journal, /^INSERT INTO SwProduct/)[0];
    expect(boundValueFor(insert, 'createdDateTime')).toBe(product.createdDateTime);
    expect(boundValueFor(insert, 'modifiedDateTime')).toBe(product.modifiedDateTime);
    expect(boundValueFor(insert, 'createdByAccountID')).toBe(account.accountID);
    expect(boundValueFor(insert, 'modifiedByAccountID')).toBe(account.accountID);
  });

  it('NET-NEW — the UPDATE moves only the modified pair and never rewrites the created pair', async () => {
    const { adapter, journal, account } = makeAdapter();
    const product = savedProduct();

    /*
     * The state a hydrated row arrives in: a first-write stamp naming a different actor, which
     * `org/Hibachi/HibachiEntity.cfc:L657-L681` leaves alone because it writes neither created member.
     */
    const firstWrite = new Date('2019-03-04T05:06:07.000Z');
    product.createdDateTime = firstWrite;
    product.createdByAccount = 'aaaaaaaa00000000000000000000ff01';
    product.modifiedDateTime = firstWrite;
    product.modifiedByAccount = 'aaaaaaaa00000000000000000000ff01';

    await adapter.saveProduct(product);

    expect(product.createdDateTime).toBe(firstWrite);
    expect(product.createdByAccount).toBe('aaaaaaaa00000000000000000000ff01');
    expect(product.modifiedDateTime).not.toBe(firstWrite);
    expect(product.modifiedByAccount).toBe(account.accountID);

    const update = persistenceMatching(journal, /^UPDATE SwProduct SET/)[0];
    expect(boundValueFor(update, 'createdDateTime')).toBe(firstWrite);
    expect(boundValueFor(update, 'createdByAccountID')).toBe('aaaaaaaa00000000000000000000ff01');
    expect(boundValueFor(update, 'modifiedDateTime')).toBe(product.modifiedDateTime);
    expect(boundValueFor(update, 'modifiedByAccountID')).toBe(account.accountID);
  });

  it('NET-NEW — a not-logged-in write still stamps both timestamps and writes no account', async () => {
    /*
     * The legacy gates are gate 2 (persisted) and gate 3 (administrative) at
     * `org/Hibachi/HibachiEntity.cfc:L627-L635`, and `newAccount()` fails the first of them — which is
     * exactly the legacy's not-logged-in state, since `getLoggedInFlag()` is `!getAccount().isNew()`
     * [org/Hibachi/HibachiScope.cfc:L40-L45]. Such a request stamped the timestamps and left both account
     * foreign keys unwritten, and no system account is substituted for one (AAP §0.7.3).
     */
    const { adapter, journal } = makeAdapter({}, 1, newAccount());
    const product = new Product();
    product.productName = 'Anonymous Insert';

    await adapter.saveProduct(product);

    const insert = persistenceMatching(journal, /^INSERT INTO SwProduct/)[0];
    expect(boundValueFor(insert, 'createdDateTime')).toBeInstanceOf(Date);
    expect(boundValueFor(insert, 'modifiedDateTime')).toBeInstanceOf(Date);
    expect(boundValueFor(insert, 'createdByAccountID')).toBeNull();
    expect(boundValueFor(insert, 'modifiedByAccountID')).toBeNull();
  });

  it('NET-NEW — the update path does NOT read the affected-row count', async () => {
    // Measured against MySQL 8.4.11 through mysql2 3.23.2: re-saving unchanged data reports 1 with
    // `CLIENT_FOUND_ROWS` and 0 without, and `src/config/database.ts` pins no capability flags. So a
    // zero count must not be treated as a failure — otherwise correctness would depend on an
    // unpinned connection negotiation detail.
    const { adapter } = makeAdapter({}, 0);
    const product = savedProduct();

    await expect(adapter.saveProduct(product)).resolves.toBe(product);
  });

  it('NET-NEW — an absent field binds as SQL null rather than being omitted', async () => {
    // The domain expresses a legacy null by the absence of a property. A bind position cannot express
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

/* The `SwProductType` write path. */

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

  /*
   * The product-type lifecycle covers the path **and** the audit block.
   * `model/service/ProductService.cfc:L294-L310` never recomputes `productTypeIDPath` on save, which is
   * true of the service and irrelevant here: the hook at this boundary rebuilds it, so a re-parented type
   * persists its new ancestry. The case below asserts that.
   */

  it('NET-NEW — the hook REBUILDS productTypeIDPath, so a re-parented type persists its NEW ancestry', async () => {
    const { adapter, journal } = makeAdapter();
    const productType = savedProductType();
    const staleHeldPath = productType.productTypeIDPath;

    /*
     * The re-parenting a caller performs: a different parent, itself a root. `:L306`/`:L311` walk
     * `parentProductType` to the root, so the rebuilt path is `<newParent>,<self>`.
     */
    const newParent = new ProductType();
    newParent.productTypeID = PERSISTENCE_ID.brand;
    productType.parentProductType = newParent;

    await adapter.saveProductType(productType);

    const rebuilt = `${PERSISTENCE_ID.brand},${PERSISTENCE_ID.productType}`;
    expect(productType.productTypeIDPath).toBe(rebuilt);
    expect(productType.productTypeIDPath).not.toBe(staleHeldPath);
    /*
     * And the rebuilt value is what the statement carries. `productType.getBaseProductType` reads
     * `listFirst` of this column, so persisting the stale path would silently keep the old discriminator.
     */
    expect(
      boundValueFor(
        persistenceMatching(journal, /^UPDATE SwProductType SET/)[0],
        'productTypeIDPath',
      ),
    ).toBe(rebuilt);
  });

  it('NET-NEW — a transient root gets its own identifier as the path, which is what the seeds hold', async () => {
    /*
     * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` gives each of the three seeded discriminators a
     * `productTypeIDPath` equal to its own identifier. A transient type with no parent rebuilds to exactly
     * that, where before this seam bound `NULL` — a row whose discriminator could not be read at all.
     */
    const { adapter, journal } = makeAdapter();
    const productType = new ProductType();
    productType.productTypeName = 'Merchandise';

    await adapter.saveProductType(productType);

    const insert = persistenceMatching(journal, /^INSERT INTO SwProductType/)[0];
    expect(productType.productTypeIDPath).toBe(productType.productTypeID);
    expect(boundValueFor(insert, 'productTypeIDPath')).toBe(productType.productTypeID);
    expect(boundValueFor(insert, 'productTypeIDPath')).not.toBeNull();
  });

  it('NET-NEW — the INSERT stamps the audit block from the acting principal, taking ONE instant', async () => {
    const { adapter, journal, account } = makeAdapter();
    const productType = new ProductType();
    productType.productTypeName = 'Merchandise';

    await adapter.saveProductType(productType);

    /*
     * `:L307` reaches `super.preInsert()`, whose port is `applyPreInsertAudit` — so a product type receives
     * the same framework block a product does, in addition to the path rebuild above it.
     */
    expect(productType.createdDateTime?.getTime()).toBe(productType.modifiedDateTime?.getTime());

    const insert = persistenceMatching(journal, /^INSERT INTO SwProductType/)[0];
    expect(boundValueFor(insert, 'createdDateTime')).toBeInstanceOf(Date);
    expect(boundValueFor(insert, 'createdByAccountID')).toBe(account.accountID);
    expect(boundValueFor(insert, 'modifiedByAccountID')).toBe(account.accountID);
  });

  it('NET-NEW — the UPDATE moves only the modified pair and never rewrites the created pair', async () => {
    const { adapter, journal, account } = makeAdapter();
    const productType = savedProductType();
    const firstWrite = new Date('2018-07-08T09:10:11.000Z');
    productType.createdDateTime = firstWrite;
    productType.createdByAccount = 'aaaaaaaa00000000000000000000ff02';
    productType.modifiedDateTime = firstWrite;
    productType.modifiedByAccount = 'aaaaaaaa00000000000000000000ff02';

    await adapter.saveProductType(productType);

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];
    expect(boundValueFor(update, 'createdDateTime')).toBe(firstWrite);
    expect(boundValueFor(update, 'createdByAccountID')).toBe('aaaaaaaa00000000000000000000ff02');
    expect(boundValueFor(update, 'modifiedDateTime')).not.toBe(firstWrite);
    expect(boundValueFor(update, 'modifiedByAccountID')).toBe(account.accountID);
  });
});

/*
 * The product-type parent round trip — rule 3b why this section exists. `./rowMappers.ts`
 * deliberately does not resolve `productType.parentProductType` when it hydrates a row, because an
 * identifier-only parent would make `productType.getSimpleRepresentation`
 * (`src/domain/product/ProductType.ts:1153`) return `undefined` as soon as it reached the parent's
 * absent name, and that value renders the Google feed's `g:product_type` element — so an
 * identifier-only reference would turn `parent &raquo; child` into an empty element. The parent is
 * resolved through the smart-list port instead, which is what these cases pin.
 */

describe('MySqlProductPersistence / MySqlProductTypeRepository — the parent round trip (rule 3b)', () => {
  /** Assignment index of `parentProductTypeID` among the thirteen writable columns. */
  const PARENT_KEY_INDEX = 7;
  /** Assignment index of `productTypeIDPath` — the first writable column. */
  const PATH_INDEX = 0;

  /**
   * A child product type as it arrives from the database: hydrated from a driver row, carrying a real
   * `parentProductTypeID` column and no resolved association.
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

  /**
   * The tree repository over the recording seam, so its own read and write paths can be observed.
   */
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
    /*
     * And the row's own ancestry path is preserved verbatim, naming a parent the association omits.
     */
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

    /* The regression this section exists for: this bound `null` before rule 3b. */
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
     * This path also runs the lifecycle hook, which is why it needs its own case.
     * `MySqlProductTypeRepository.saveProductType` invokes `ProductType.preUpdate`, porting
     * `model/entity/ProductType.cfc:L311`, and that hook rebuilds `productTypeIDPath` by walking
     * `parentProductType` to the root. With the association deliberately unresolved the walk finds
     * nothing and would yield the child's own identifier alone — flattening the ancestry and leaving a
     * row whose preserved parent key contradicts its path. `productType.getBaseProductType` reads.
     */
    const { repository, journal } = makeTreeRepository();
    const child = hydratedChild();

    await repository.saveProductType(child);

    const update = persistenceMatching(journal, /^UPDATE SwProductType SET/)[0];

    expect(update?.params[PARENT_KEY_INDEX]).toBe(PERSISTENCE_ID.parentProductType);
    /* Not the flattened `PERSISTENCE_ID.productType` the unguarded rebuild would have produced. */
    expect(update?.params[PATH_INDEX]).toBe(
      `${PERSISTENCE_ID.parentProductType},${PERSISTENCE_ID.productType}`,
    );
    expect(update?.params[PATH_INDEX]).not.toBe(PERSISTENCE_ID.productType);
  });

  it('NET-NEW — the FULL round trip through the real read member survives: findAllForTree then saveProductType', async () => {
    /*
     * This is the case the review asked for, end to end, with no hand-built entity anywhere.
     * Every case above hydrates through `mapProductTypeRow` directly. This one goes through the actual
     * port member `findAllForTree()` — the read the finding cites — takes the entity it returns, and
     * hands that same entity to the write member. Nothing in between is constructed by the test.
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
     * The preserved key is a fallback, never an override.
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
     * The escape hatch is part of the contract. Preserving the key would be a trap if there were no
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

/* The product removal path. */

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

    // Step 3 ran, and ran before the product row went — `org/Hibachi/HibachiService.cfc:L61`
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
    // `model/entity/Product.cfc:L81` carries no `inverse="true"`, so this product owns the rows whose
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
    // An empty identifier list would compose `IN `, which is a syntax error rather than an empty
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
    // Skipping it would leave that SKU's link rows behind and then fail the product removal on a
    // foreign-key constraint, with nothing anywhere naming the cause.
    const { adapter } = makeAdapter({ SwSku: [{ skuID: 42 }] });

    await expect(adapter.deleteProduct(savedProduct())).rejects.toBeInstanceOf(DataIntegrityError);
  });
});

/* The product-type removal path. */

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
    // Not an omission: `model/validation/ProductType.json` bounds both at `maxCollection 0` for the
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

/* The four seams — the finding's actual claim. */

/* — the product delete guard, resolved on the delete boundary's own executor. */
describe('the Product delete guard resolves against a live transaction-existence query', () => {
  /** The alias `MySqlSkuRepository.transactionExists` projects its scalar verdict under. */
  const VERDICT_ALIAS = 'transactionExists';

  /** The container's `productBaseService` delete path, rebuilt over one recording executor. */
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

        /*
         * The scalar existence verdict, in the driver's own shape: `SELECT EXISTS(...)` answers one
         * row carrying 1 or 0, and `:L93-L97` reads zero as false and anything else as true.
         */
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
      /*
       * — the adapter's fourth collaborator. This block is about the delete guard, so the identity
       * only has to be resolvable; the stamping itself is asserted by the write-path cases above.
       */
      createAccountContextDouble().accountContext,
    );

    /*
     * The container's closure, verbatim. `src/config/container.ts` builds this from
     * `createTransactionExistenceChecker` and returns the same instance, because
     * `product.getTransactionExistsFlag` memoizes its answer onto the entity.
     */
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
      /*
       * Both run only inside the `if(deleteOK)` gate [`model/service/HibachiService.cfc:L76`, `:L79`],
       * so the refusal cases never reach them and the success case only needs them to resolve. The
       * shared double supplies the full four-member surface rather than a partial literal.
       */
      settingCleanup: cleanupSeams.settingCleanup,
      commentCleanup: cleanupSeams.commentCleanup,
      ...(options.wireResolver === false ? {} : { resolveDeleteSubject }),
    });

    return { service, statements };
  }

  /** A product as a row produces it, which is the state the defect was invisible in. */
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

    // The guard read, and the read carried the product identifier in slot one.
    const probes = statements.filter((statement) => statement.sql.includes(`AS ${VERDICT_ALIAS}`));
    expect(probes).toHaveLength(1);
    expect(probes[0]?.params).toStrictEqual([PERSISTENCE_ID.product]);

    // And nothing was written. This is the assertion the finding turns on: a guard that resolves
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
    // The defect, pinned. `eq` fails on an absent value, so an unresolved flag is not a lenient
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
    // this is a compile-time assertion wearing a runtime coat. The adapter deliberately does not
    // import these two function types (AAP §0.7.3 — an adapter must not reach up into the service layer), so
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

  /** A real `productService` wired to the real adapter for exactly the seams a scenario reaches. */
  function makeService(
    adapter: MySqlProductPersistence,
    smartListQueryPort: ProductService['smartListQueryPort'] = UNREACHED_COLLABORATOR,
  ): ProductService {
    return new ProductService({
      productRepository: UNREACHED_COLLABORATOR,
      skuRepository: UNREACHED_COLLABORATOR,
      skuService: UNREACHED_COLLABORATOR,
      optionService: UNREACHED_COLLABORATOR,
      /*
       * `ProductBaseService` is `Pick<BaseService<Product, …>, 'delete'>`. The real base service's
       * delete runs the delete-context rules and then its `remove` collaborator; what matters to
       * data-03 is that the collaborator it would call is the real adapter, so the seam is exercised
       * with the real statements rather than with a recorder.
       */
      baseService: {
        delete: async (product: Product): Promise<boolean> => {
          await adapter.deleteProduct(product);
          return true;
        },
      },
      /*
       * `ProductTypeBaseService` is `Pick<BaseService<ProductType, …>, 'save'>`, whose contract
       * populates, validates and then persists. The persistence step is the real adapter.
       */
      productTypeBaseService: {
        /*
         * Typed over `ManagedEntity<productType>`, not over a bare `productType`, and the reason is
         * on `src/domain/product/ProductType.ts`. `baseService.save` is declared over the managed
         * form, and this entity deliberately does not declare the seven managed-entity members as class
         * methods — `manageEntity` attaches them, which is what `rowMappers.ts` already does to every
         * hydrated product type. A bare `ProductType` is therefore not assignable to the slot, and
         * widening the double here is the honest fix rather than reinstating methods the domain module.
         */
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
      /*
       * `UniqueValueProbe` takes the table name as a plain string, exactly as
       * `model/service/DataService.cfc:L53` declares `createUniqueURLTitle(titleString, tableName)`.
       * The double's own probe narrows that first parameter to its table union, so it is adapted here
       * rather than the utility's contract being widened.
       */
      urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
      isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> =>
        urlTitleProbe.probe.isUrlTitleAvailable(tableName as UrlTitleTableName, value),
      persistProduct: (product: Product) => adapter.saveProduct(product),
      /*
       * Reached only by `requireDefaultSkuEntity`, which only the subscription-term process member
       * calls. Made loud rather than plausible: a reader answering `''` would let a case pass while
       * silently resolving the wrong SKU.
       */
      defaultSkuIdReader: (): string => {
        throw new Error('defaultSkuIdReader is not reached by these cases.');
      },
      /*
       * — the real hydration reader, not a stub. It answers `undefined` for a hand-built product
       * type, because nothing wrote a preserved parent key beside one — which is precisely what
       * production does for a hand-built entity too. Using the real member keeps these cases honest:
       * They exercise the same branch production takes, and a case that wants the inheritance load
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
    // `:L297` writes the derived title into the payload, and it only reaches the entity because the
    // base service populates from that same struct.
    expect(persistenceMatching(journal, /^INSERT INTO SwProductType/)[0]?.params).toContain(
      'merchandise',
    );
  });
});

/* — the parent-product-type inheritance, on a product type that came from a row. */

describe('a hydrated product type inherits its parent’s products', () => {
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
          /*
           * The parent row itself, hydrated by the real mapper so it is a genuine managed entity with
           * its own empty products collection — the state a row-loaded parent is really in.
           */
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

  /** A `productService` whose product-type save is a no-op and whose product saves are recorded. */
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
      /* The real reader — the whole point of these cases. */
      parentProductTypeIdReader: readHydratedParentProductTypeID,
    });

    return { service, savedProducts, queries };
  }

  /** A child product type as a row produces it: a real parent column, no resolved association. */
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

    // The assertion this case turns on. With the association absent, `:L306`'s null clause
    // short-circuits and neither read is issued.
    expect(queries.map((query) => query.entityName)).toStrictEqual([
      'SlatwallProductType',
      'SlatwallProduct',
    ]);

    // `:L307` is a replacement and the write is one `saveProduct` per product, in collection order —
    // which is also the proof the parent's collection really was loaded with both of its products.
    expect(savedProducts.map((product) => product.productID)).toStrictEqual([
      PERSISTENCE_ID.product,
      PERSISTENCE_ID.otherProduct,
    ]);

    // Each inherited product now names the child type. This is the column `:L307` actually changes:
    // `products` is mapped `inverse="true"` [`model/entity/ProductType.cfc:L66`], so the child's
    // `SwProduct.productTypeID` is the only side that persists.
    for (const product of savedProducts) {
      expect(product.productType?.productTypeID).toBe(PERSISTENCE_ID.productType);
    }

    // And the child's own array stays empty, which is correct rather than a miss.
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
    // `:L306`'s `isNull` guard means the legacy's own behaviour for an absent parent is to skip the
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
    // Absence is what triggers a load, not the key. A caller that supplied the parent has already
    // said what its products are, and `:L307` inherits whatever `getProducts()` answers. Loading over
    // the top of that would discard the caller's own collection.
    const { service, savedProducts, queries } = makeInheritanceService({ parentExists: true });
    const child = hydratedChildType();

    const attachedParent = new ProductType();
    attachedParent.productTypeID = PERSISTENCE_ID.parentProductType;
    const ownProduct = new Product();
    ownProduct.productID = PERSISTENCE_ID.otherProduct;
    /*
     * The field, not `setProducts`. `productType.addProduct` sets only the inverse reference, so
     * `setProducts` would leave the parent's own array empty and `:L308`'s length clause would skip the
     * branch — the collection has to be populated the way hydration populates it, which is by
     * assignment. `src/adapters/mysql/rowMappers.ts` does exactly this.
     */
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

/* The read half — `getProduct` must answer an aggregate. */

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
    /*
     * The money column is a string, not a number, and that is the driver contract rather than A
     * fixture quirk. `model/entity/Sku.cfc:L56` declares `price` `ormtype="big_decimal"`, and
     * `rowMappers.ts` reads it through the exact-decimal reader, which refuses a JavaScript number
     * because by the time one arrives the exact digits are already gone .
     */
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

  /** An executor that honours both `where <column> IN (…)` and `WHERE <alias>.<column> = ?`. */
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

        /*
         * The builder's own filter form. The first bound value is the filter's, because the paging
         * placeholders are appended after the where parameters.
         */
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
      /*
       * `UniqueValueProbe` takes the table name as a plain string, exactly as
       * `model/service/DataService.cfc:L53` declares `createUniqueURLTitle(titleString, tableName)`.
       * The double's own probe narrows that first parameter to its table union, so it is adapted here
       * rather than the utility's contract being widened.
       */
      urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
      isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> =>
        urlTitleProbe.probe.isUrlTitleAvailable(tableName as UrlTitleTableName, value),
      persistProduct: (product: Product) => adapter.saveProduct(product),
      /*
       * Reached only by `requireDefaultSkuEntity`, which only the subscription-term process member
       * calls. Made loud rather than plausible: a reader answering `''` would let a case pass while
       * silently resolving the wrong SKU.
       */
      defaultSkuIdReader: (): string => {
        throw new Error('defaultSkuIdReader is not reached by these cases.');
      },
      /*
       * — the real hydration reader, not a stub. It answers `undefined` for a hand-built product
       * type, because nothing wrote a preserved parent key beside one — which is precisely what
       * production does for a hand-built entity too. Using the real member keeps these cases honest:
       * They exercise the same branch production takes, and a case that wants the inheritance load
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
    /*
     * '99.00', not 99: preserves the digits and the scale the row carried — the fixture row spells
     * `price: '99.00'`, and keeping that spelling is the whole point of the exact-decimal type.
     */
  });

  it('NET-NEW — every SKU back-references the same product instance', async () => {
    const product = await readService().getProduct(PERSISTENCE_ID.product);
    const skus = product?.getSkus() ?? [];

    expect(skus).toHaveLength(2);
    for (const sku of skus) {
      // Definedness asserted first, so this cannot pass vacuously as `undefined === undefined`.
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

/*
 * The brand adapter's cases, and why they are here rather than in a suite of their own
 * AAP §0.4.1.12 declares exactly seventeen executable suites and does not name a brand-adapter suite, so
 * these cases live inside an approved one. The coverage is unaffected by where it sits.
 */

/** `MySqlBrandRepository` — the brand persistence adapter. **net-new** in its entirety. */
describe('The synthesized CRUD surface `BrandService` reaches through `onMissingMethod` (IR-1)', () => {
  /*
   * Identifiers, resolved through the production whitelist rather than spelled by hand
   * Every table and column named below is resolved through the same two validators the adapter itself
   * uses. A typo becomes a thrown `DomainError` at module load rather than an expectation that quietly
   * matches nothing, and a column renamed in the whitelist breaks this file loudly instead of leaving it
   * asserting against a name the adapter no longer emits.
   */

  const BRAND_TABLE = assertTableName('SwBrand');
  const BRAND_ID = assertColumnName(BRAND_TABLE, 'brandID');
  const BRAND_NAME = assertColumnName(BRAND_TABLE, 'brandName');
  const BRAND_URL_TITLE = assertColumnName(BRAND_TABLE, 'urlTitle');

  /** The 32-character lowercase hexadecimal identifier form of IR-6. */
  const HEX_32 = /^[0-9a-f]{32}$/;

  /* The harness. */

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

  /* 1. newBrand — the transient factory. */

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

      /*
       * The managed wrapper carries the error surface `baseService.save` attaches findings to — the
       * contract. An unmanaged entity would type-check at this seam and fail inside the save path.
       */
      expect(typeof brand.getClassName).toBe('function');
      expect(brand.getClassName()).toBe('Brand');
    });
  });

  /* 2. getBrand — the primary-identifier read. */

  describe('NET-NEW — getBrand, the primary-identifier read', () => {
    it('NET-NEW — short-circuits an EMPTY identifier to null WITHOUT issuing a statement', async () => {
      const subject = harness();

      const found = await subject.repository.getBrand('');

      /*
       * The short circuit is the load-bearing half, not the null. An empty identifier is exactly what a
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

      /*
       * The mapper is the replacement for Hibernate hydration, so the fields are asserted rather than
       * assumed: an adapter that read the row and returned a blank entity would pass a null check.
       */
      expect(found?.brandID).toBe('brand-1');
      expect(found?.brandName).toBe('Acme');
      expect(found?.urlTitle).toBe('acme');
      expect(found?.brandWebsite).toBe('https://acme.test');
      /*
       * And the hydrated entity is not transient, which is what routes a later save to the update arm.
       */
      expect(found?.isNew()).toBe(false);
    });

    it('NET-NEW — answers null for a real read that matched nothing', async () => {
      const subject = harness([sqlRows([])]);

      const found = await subject.repository.getBrand('absent-brand');

      /*
       * "No such brand" is a legitimate answer, not an error — and it is reached by a real statement,
       * unlike the empty-identifier case above, which is why both deserve their own case.
       */
      expect(found).toBeNull();
      expect(subject.calls).toHaveLength(1);
    });

    it('NET-NEW — REFUSES to hydrate when a single-row read matched several, naming the count', async () => {
      const ambiguous = sqlRows([brandRow(), brandRow({ brandID: 'brand-2' })]);
      /*
       * Queued outcomes are consumed one per statement, so the same answer is queued twice for the two
       * assertions below. Queuing it once would let the second read fall through to the double's default of
       * no rows, and the case would then be asserting a refusal against an empty result.
       */
      const subject = harness([ambiguous, ambiguous]);

      /*
       * It refuses rather than taking the first row, and that is the safe direction. A read on the
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

  /* 3. saveBrand — both arms of the write. */

  describe('NET-NEW — saveBrand, the SwBrand write seam', () => {
    it('NET-NEW — mints a 32-hex identifier on the INSERT arm and binds it FIRST', async () => {
      const subject = harness();
      const { brand } = createManagedBrand({ brandName: 'Acme' });

      expect(brand.isNew()).toBe(true);

      const returned = await subject.repository.saveBrand(brand);

      /* IR-6 — 32 lowercase hexadecimal characters, no dashes, never an auto-increment. */
      expect(brand.brandID).toMatch(HEX_32);
      expect(brand.isNew()).toBe(false);
      /*
       * The same instance is returned, so a caller keeps the entity whose findings it is holding.
       */
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
       * The identifier moves from first to last between the arms. On the insert it leads the column
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
       * The free-function route is correct here, and it is the opposite of the product-type adapter.
       * `model/entity/Brand.cfc` does not override `preInsert`/`preUpdate`, so a brand received only the
       * framework audit block at `org/Hibachi/HibachiEntity.cfc:L598-L649` — which is what
       * `src/domain/base/AuditableEntity.ts` ports. `model/entity/ProductType.cfc:L305-L313` does override
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

      /*
       * An absent actor is a legitimate state and no system account is substituted (AAP §0.7.3).
       */
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

      /*
       * TR-4 — positional, one for one. A count mismatch shifts every later value by one silently.
       */
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

  /* 4. deleteBrand — the removal path and its affected-row answer. */

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
       * The boolean is derived from the affected-row count, and both answers are real.
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
       * The refusal is only half the contract. A guard that raised after issuing the delete would
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

  /* 5. isUrlTitleAvailable — the member whose polarity is easiest to invert. */

  describe('NET-NEW — isUrlTitleAvailable, and the polarity it must keep', () => {
    it('NET-NEW — reports TRUE when NO row holds the title, which is what "available" means', async () => {
      const subject = harness([sqlRows([])]);

      const available = await subject.repository.isUrlTitleAvailable('acme');

      /*
       * The polarity is the whole point of this block, and it runs opposite to the row count. The
       * statement asks whether the title is taken; the member answers whether it is free. So an
       * empty result means available, and `return rows.length === 0` is correct rather than a bug.
       * Inverting it would compile, would return a boolean, and would break IR-5's application-side
       * uniqueness check in the most confusing possible direction: every free title would be
       * reported as taken, so `brandService.saveBrand` would append `-2`, `-3`, `-4` … to titles
       * nobody was using until it ran out of probe budget.
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
       * Deliberately unlike `getBrand`, which does short-circuit its empty argument. There the empty
       * string is the transient sentinel and can match nothing by construction; here it is an ordinary
       * candidate value that a row could genuinely hold, so refusing to ask would invent an answer. The
       * asymmetry between the two members is intentional and is asserted so it cannot be "tidied".
       */
      expect(available).toBe(true);
      expect(subject.calls).toHaveLength(1);
      expect(soleCall(subject).params).toEqual(['']);
    });
  });

  /* 6. withExecutor — the rebind seam, and the port surface as a whole. */

  describe('NET-NEW — withExecutor, the rebind seam UnitOfWork uses', () => {
    it('NET-NEW — returns a DIFFERENT instance and issues the work on the NEW executor', async () => {
      const subject = harness();
      const second = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

      const rebound = subject.repository.withExecutor(second.executor);

      /*
       * The identity assertion is the safety property, not a style preference. The composition root
       * builds one adapter and shares it; `UnitOfWork` rebinds a transaction-scoped executor per boundary.
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

      /*
       * Asserted from both sides, with the parameters proving which statement went where. A leak would
       * put both on one double, and a count alone could not say which.
       */
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
       * The rebind takes a new executor and must keep everything else. The account context is the other
       * constructor argument, and it is the one a rebind could plausibly drop — the signature only mentions
       * the executor. Dropping it would compile only if something were substituted for it, and the
       * observable consequence would be an audit block written with no actor inside a transaction while
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
        /*
         * — the sixth member: `model/entity/Brand.cfc:L61`'s lazy collection load, written down.
         */
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

  /* — the live products read the brand delete guard performs. */

  describe('MySqlBrandRepository — the products read behind the delete guard', () => {
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
      // The guard refuses at one row exactly as it refuses at ten thousand, so a ceiling would change
      // nothing it can observe while inventing a bound the legacy has nowhere (AAP §0.7.3).
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
      // Dropping it would undercount the collection, and an undercount here is precisely the failure
      // reported: the ceiling of zero would pass and the brand would be deleted out from under its
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
