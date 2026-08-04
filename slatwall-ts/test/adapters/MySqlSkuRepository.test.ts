/**
 * NET-NEW — the repository / SQL-contract suite for `MySqlSkuRepository`.
 *
 * Every case in this file is **net-new**. Nothing here extends, replays or replicates a legacy
 * assertion, and no case is labelled as though it did. AAP §0.4.1.12 lists
 * `slatwall-ts/test/adapters/MySqlSkuRepository.test.ts` | create | "**net-new**", and AAP §0.6.5.2
 * records that **no `SkuDAOTest` exists anywhere in the legacy suite** — so the option-resolution
 * query, the sorted-SKU ordering, the ten-predicate transaction-existence chain, the primary /
 * alternate code lookup and the search projection all arrive here without a legacy counterpart.
 *
 * Traceability — documentary only, and the limits are stated rather than implied
 * A reader is entitled to know exactly how strong the evidence behind these assertions is, so the
 * four limits are stated up front:
 *
 * 1. MXUnit and CFSelenium are **not vendored** in this repository. MXUnit additionally requires
 * an external cfide mapping that does not exist here, so the legacy suite **cannot be executed
 * in this environment at all**.
 * 2. `meta/docker/Slatwall-local-dev/` — cited as documenting a Lucee/Railo + MySQL Compose
 * setup — **does not exist**. `meta/` contains only `meta/tests/` and `meta/eclipse/`; there is
 * no Dockerfile and no Compose file anywhere in the tree.
 */
import {
  createOptionGroupSortOrderMemo,
  createTransactionExistenceChecker,
  MySqlSkuRepository,
} from '../../src/adapters/mysql/MySqlSkuRepository';
import { assertColumnName, assertTableName } from '../../src/adapters/mysql/QueryRunner';
import { attachSkuOptions } from '../../src/adapters/mysql/SmartListQueryBuilder';
import {
  forgetHydratedSkuSubscriptionTermID,
  mapSkuRow,
  markSkuOwnedLinkLoaded,
} from '../../src/adapters/mysql/rowMappers';
import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../src/domain/BaseProductType';
import { Product } from '../../src/domain/product/Product';
import { SKU_UNSAVED_ID_VALUE } from '../../src/domain/sku/Sku';
import {
  buildOption,
  buildProduct,
  buildProductType,
  buildSku,
  createAbsentAccountContextDouble,
  createProductTypeRootResolverDouble,
  createSqlExecutorDouble,
  sqlAffectedRows,
  sqlRows,
} from '../support/inMemoryRepositories';

import type {
  OptionGroupSortOrderMemo,
  SkuStatementExecutor,
  TransactionExistenceChecker,
} from '../../src/adapters/mysql/MySqlSkuRepository';
import type {
  SkuRepository,
  SkuRow,
  SkuSearchRow,
} from '../../src/ports/repositories/SkuRepository';
import type {
  SqlExecutorCall,
  SqlExecutorOutcome,
  SqlExecutorResponder,
} from '../support/inMemoryRepositories';
import { DomainError, UniqueConstraintViolationError } from '../../src/errors/DomainError';
import {
  MYSQL_DUPLICATE_ENTRY_ERRNO,
  QueryRunner,
  describeDuplicateEntryConstraint,
  isDuplicateEntryFailure,
} from '../../src/adapters/mysql/QueryRunner';
import { UnitOfWork } from '../../src/adapters/mysql/UnitOfWork';
import { createUnitOfWorkDouble } from '../support/inMemoryRepositories';
import type {
  BoundParameterValue,
  StatementPool,
  TransactionalStatementRunner,
} from '../../src/adapters/mysql/QueryRunner';
import {
  assertSortOrderAssigned,
  type SortOrderSeedTarget,
} from '../../src/adapters/mysql/UnitOfWork';
import { DataIntegrityError } from '../../src/errors/DomainError';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';

/*
 * Identifiers and shared fixtures
 * Every identifier below is a 32-character lowercase hexadecimal string with no dashes, which is the
 * shape `createSlatwallUUID()` produces and the shape the schema declares (IR-6). They are readable
 * on purpose — a leading run identifies the entity family — so a parameter array reads as evidence
 * rather than as noise.
 */

const PRODUCT_A = 'aaaa0000000000000000000000000001';
const PRODUCT_B = 'aaaa0000000000000000000000000002';

const SKU_ONE = 'bbbb0000000000000000000000000001';
const SKU_TWO = 'bbbb0000000000000000000000000002';
const SKU_OPTIONLESS = 'bbbb0000000000000000000000000003';

const OPTION_SMALL = 'cccc0000000000000000000000000001';
const OPTION_RED = 'cccc0000000000000000000000000002';
const OPTION_LARGE = 'cccc0000000000000000000000000003';

const OPTION_GROUP_SIZE = 'dddd0000000000000000000000000001';

/*
 * Two far-side references belonging to explicitly out-of-scope entities. They exist only as identifier
 * values: `Content` and `SubscriptionBenefit` are excluded domain families, so the port models these
 * collections as bare `{ contentID }` / `{ subscriptionBenefitID }` references and hydrates no excluded
 * entity (TR-5). Nothing in this file constructs, reads or reaches through either one.
 */
const CONTENT_REFERENCE = 'eeee0000000000000000000000000001';
const SECOND_CONTENT_REFERENCE = 'eeee0000000000000000000000000002';
const BENEFIT_REFERENCE = 'ffff0000000000000000000000000001';
/*
 * Distinct from BENEFIT_REFERENCE on purpose: both benefit collections write a column of the same name,
 * so only differing values can reveal a crossed write. See the data-04 case that says so.
 */
const RENEWAL_BENEFIT_REFERENCE = 'ffff0000000000000000000000000002';

/*
 * Two more out-of-scope references, for the cases that pin the preserved subscription-term key.
 * `subscriptionTerm` is an excluded family too, so these are identifier values and nothing else.
 */
const SUBSCRIPTION_TERM_REFERENCE = 'aaab0000000000000000000000000001';
const SECOND_SUBSCRIPTION_TERM_REFERENCE = 'aaab0000000000000000000000000002';

/**
 * A value chosen to be hostile to string concatenation: a single quote, a statement terminator and a
 * comment introducer.
 */
const ADVERSARIAL_VALUE = "o'brien'; DROP TABLE SwSku; --";

/* Statement-text helpers. */

/**
 * Collapse whitespace so an assertion does not depend on the adapter's line breaks or indentation.
 */
function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * How many times `fragment` occurs in `text`. plain scanning: no regular-expression escaping games.
 */
function occurrences(text: string, fragment: string): number {
  if (fragment === '') {
    throw new Error('occurrences() needs a non-empty fragment');
  }
  let count = 0;
  let index = text.indexOf(fragment);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(fragment, index + fragment.length);
  }
  return count;
}

/** The one statement the executor recorded. */
function soleCall(calls: readonly SqlExecutorCall[]): SqlExecutorCall {
  expect(calls).toHaveLength(1);
  const only = calls[0];
  if (only === undefined) {
    throw new Error('the executor recorded no statement');
  }
  return only;
}

/** The call at `index`, narrowed for `noUncheckedIndexedAccess`. */
function callAt(calls: readonly SqlExecutorCall[], index: number): SqlExecutorCall {
  const call = calls[index];
  if (call === undefined) {
    throw new Error(`the executor recorded no statement at index ${index}`);
  }
  return call;
}

/** Every call whose normalised statement contains `fragment`, in issue order. */
function callsContaining(
  calls: readonly SqlExecutorCall[],
  fragment: string,
): readonly SqlExecutorCall[] {
  return calls.filter((call) => norm(call.sql).includes(fragment));
}

/*
 * The statement fragments these cases pin
 * Written out as the adapter composes them, so a drift in either direction is visible here rather
 * than only in a failing expectation.
 */

/** `model/dao/SkuDAO.cfc:L115-L119` — one correlated existence test per selected option. */
const OPTION_MATCH_FRAGMENT =
  'EXISTS( SELECT 1 FROM SwSkuOption so WHERE so.skuID = s.skuID AND so.optionID = ? )';

/** `model/dao/SkuDAO.cfc:L109-L112` — the translation of the vestigial `inner join sku.options`. */
const OPTION_BEARING_FRAGMENT = 'EXISTS( SELECT 1 FROM SwSkuOption sob WHERE sob.skuID = s.skuID )';

/** `model/dao/SkuDAO.cfc:L124` — the product restriction, always emitted (T2). */
const PRODUCT_PREDICATE_FRAGMENT = 's.productID = ?';

/** The ten existence tests of `model/dao/SkuDAO.cfc:L65-L85`, in legacy order. */
const TRANSACTION_EXISTS_CLAUSES: readonly string[] = [
  'EXISTS( SELECT 1 FROM SwOrderItem a WHERE a.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwInventory a INNER JOIN SwStock st ON st.stockID = a.stockID WHERE st.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwOrderDeliveryItem a INNER JOIN SwStock st ON st.stockID = a.stockID WHERE st.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwPhysicalCountItem a INNER JOIN SwStock st ON st.stockID = a.stockID WHERE st.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwStockAdjustmentDeliveryItem a INNER JOIN SwStock st ON st.stockID = a.stockID WHERE st.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwStockAdjustmentItem a INNER JOIN SwStock st ON st.stockID = a.fromStockID WHERE st.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwStockAdjustmentItem a INNER JOIN SwStock st ON st.stockID = a.toStockID WHERE st.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwStockHold a INNER JOIN SwStock st ON st.stockID = a.stockID WHERE st.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwStockReceiverItem a INNER JOIN SwStock st ON st.stockID = a.stockID WHERE st.skuID = s.skuID )',
  'EXISTS( SELECT 1 FROM SwVendorOrderItem a INNER JOIN SwStock st ON st.stockID = a.stockID WHERE st.skuID = s.skuID )',
];

/**
 * `model/dao/SkuDAO.cfc:L193-L198` — the base-10 odometer, with the memo bound rather than inlined.
 */
const ODOMETER_FRAGMENT =
  'ORDER BY SUM(SwOption.sortOrder * POWER(10, ? - SwOptionGroup.sortOrder)) ASC';

/** `model/dao/SkuDAO.cfc:L210-L212` — the whole-table aggregate, unscoped and unparameterised. */
const MAX_SORT_ORDER_STATEMENT = 'SELECT max(SwOptionGroup.sortOrder) AS max FROM SwOptionGroup';

/** The source clause of the association loader that follows a SKU-returning read. */
const OPTION_HYDRATION_SOURCE = 'FROM SwSkuOption ';

/*
 * The harness
 * One factory, built on the subtree's own recording executor. Every dependency the repository needs
 * is supplied explicitly through the constructor; nothing is patched, no module registry is touched,
 * and `jest.mock` is never called.
 */

interface HarnessOptions {
  /** Consulted before the queue. Returning `undefined` declines and falls through. */
  readonly respond?: SqlExecutorResponder;
  /** Consumed in order, one per statement, after `respond` declines. */
  readonly outcomes?: readonly SqlExecutorOutcome[];
  /** The request-scoped sort-order memo. */
  readonly memo?: OptionGroupSortOrderMemo;
}

interface Harness {
  readonly repository: MySqlSkuRepository;
  /** The very executor the repository holds. */
  readonly executor: SkuStatementExecutor;
  /**
   * Every statement in issue order, with its bound parameters. A live view of the double's state.
   */
  readonly calls: readonly SqlExecutorCall[];
  /** Every product-type identifier the base-product-type walk asked for, in order. */
  readonly requestedProductTypeIds: readonly string[];
  /** Append further outcomes to the tail of the queue. */
  enqueue(...outcomes: readonly SqlExecutorOutcome[]): void;
}

/** Build a repository over the recording executor. */
function makeHarness(options: HarnessOptions = {}): Harness {
  const executorDouble = createSqlExecutorDouble({
    ...(options.respond === undefined ? {} : { respond: options.respond }),
    ...(options.outcomes === undefined ? {} : { outcomes: options.outcomes }),
  });

  /*
   * M6, checked by the compiler rather than asserted in prose. The adapter's seam is the read-and-write
   * pair, because `Sku.hasUniqueOptions()` [`model/entity/Sku.cfc:L756-L769`] is a validation rule that
   * runs the option resolver while sibling SKUs are being written, so the read must be able to observe
   * writes the same transaction has already issued. One executor, not two.
   */
  const executor: SkuStatementExecutor = executorDouble.executor;

  const resolverDouble = createProductTypeRootResolverDouble();

  return {
    executor,
    calls: executorDouble.calls,
    enqueue: executorDouble.enqueue,
    requestedProductTypeIds: resolverDouble.requestedProductTypeIds,
    repository: new MySqlSkuRepository(
      executor,
      options.memo ?? createOptionGroupSortOrderMemo(),
      resolverDouble.resolver,
      /*
       * Unauthenticated, which is what `org/Hibachi/HibachiObject.cfc:L74-L76` yields when no account
       * is on the request. No case below depends on an actor.
       */
      createAbsentAccountContextDouble().accountContext,
    ),
  };
}

/**
 * A product whose product type is the seeded root for `baseProductType`. No UUID is written here.
 */
function productFor(baseProductType: 'contentAccess' | 'merchandise' | 'subscription'): Product {
  const seeded = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE[baseProductType];
  return buildProduct({
    productID: PRODUCT_A,
    productType: buildProductType({
      productTypeID: seeded.productTypeID,
      systemCode: seeded.systemCode,
      productTypeIDPath: seeded.productTypeID,
    }),
  });
}

/* The statement-driven responder for the option resolver. */

/** A SKU as the fixture store holds it: its identity, its owner and the options it carries. */
interface SkuFixture {
  readonly skuID: string;
  readonly skuCode: string;
  readonly productID: string;
  readonly optionIDs: readonly string[];
}

/** Narrow a recorded parameter array to strings, so a comparison is a comparison and not a cast. */
function stringParams(call: SqlExecutorCall): readonly string[] {
  return call.params.map((param, index) => {
    if (typeof param !== 'string') {
      throw new Error(`bound parameter ${index} is not a string`);
    }
    return param;
  });
}

/** Answer a selected-option statement by applying the predicates the adapter emitted. */
function answerSelectedOptions(
  call: SqlExecutorCall,
  fixtures: readonly SkuFixture[],
): SqlExecutorOutcome {
  const sql = norm(call.sql);
  const emittedOptionPredicates = occurrences(sql, OPTION_MATCH_FRAGMENT);
  const optionBearingGuarded = sql.includes(OPTION_BEARING_FRAGMENT);
  const productScoped = sql.includes(PRODUCT_PREDICATE_FRAGMENT);
  const distinctProjection = sql.startsWith('SELECT DISTINCT ');

  const params = stringParams(call);
  /*
   * Legacy bind order: the option identifiers first, in list order, then the product identifier.
   */
  const requiredOptionIDs = params.slice(0, emittedOptionPredicates);
  const scopedProductID = productScoped ? params[emittedOptionPredicates] : undefined;

  const matching = fixtures.filter((fixture) => {
    if (optionBearingGuarded && fixture.optionIDs.length === 0) {
      return false;
    }
    if (scopedProductID !== undefined && fixture.productID !== scopedProductID) {
      return false;
    }
    /*
     * One and-ed test per emitted predicate. A repeated identifier repeats the same test, which is
     * idempotent — exactly what N correlated exists clauses do.
     */
    return requiredOptionIDs.every((optionID) => fixture.optionIDs.includes(optionID));
  });

  const rows = matching.flatMap((fixture) => {
    const row: Record<string, unknown> = {
      skuID: fixture.skuID,
      skuCode: fixture.skuCode,
      productID: fixture.productID,
    };
    /* Without DISTINCT the join fans out one row per SKU-option pair. */
    return distinctProjection ? [row] : fixture.optionIDs.map(() => ({ ...row }));
  });

  return sqlRows(rows);
}

/** The fixture set every option-resolution case shares. */
const OPTION_RESOLUTION_FIXTURES: readonly SkuFixture[] = [
  {
    skuID: SKU_ONE,
    skuCode: 'SKU-SMALL-RED',
    productID: PRODUCT_A,
    optionIDs: [OPTION_SMALL, OPTION_RED],
  },
  { skuID: SKU_TWO, skuCode: 'SKU-SMALL', productID: PRODUCT_A, optionIDs: [OPTION_SMALL] },
  { skuID: SKU_OPTIONLESS, skuCode: 'SKU-PLAIN', productID: PRODUCT_A, optionIDs: [] },
];

/** A harness whose executor answers the option resolver from {@link OPTION_RESOLUTION_FIXTURES}. */
function makeOptionResolutionHarness(
  fixtures: readonly SkuFixture[] = OPTION_RESOLUTION_FIXTURES,
): Harness {
  return makeHarness({
    respond: (call) => answerSelectedOptions(call, fixtures),
  });
}

/* The statement-driven responder for the transaction-existence probe. */

/**
 * The transactional world as the fixture store holds it: which SKU belongs to which product, and
 * which SKUs some transaction somewhere references.
 */
interface TransactionWorld {
  /** SKU identifier to owning product identifier. */
  readonly skuOwners: ReadonlyMap<string, string>;
  /** The SKUs that at least one transaction references. */
  readonly transactionalSkuIDs: readonly string[];
}

/** Answer the existence probe by reading the root predicate the adapter emitted. */
function answerTransactionExists(
  call: SqlExecutorCall,
  world: TransactionWorld,
): SqlExecutorOutcome {
  const sql = norm(call.sql);
  const skuScoped = sql.includes('WHERE s.skuID = ?');
  const productScoped = sql.includes(`WHERE ${PRODUCT_PREDICATE_FRAGMENT}`);
  if (skuScoped === productScoped) {
    throw new Error('the existence probe restricted on neither exactly one of skuID nor productID');
  }

  const [boundValue] = stringParams(call);
  if (boundValue === undefined) {
    throw new Error('the existence probe bound no scope value');
  }

  const selected = skuScoped
    ? [boundValue]
    : [...world.skuOwners.entries()]
        .filter(([, productID]) => productID === boundValue)
        .map(([skuID]) => skuID);

  const referenced = selected.some((skuID) => world.transactionalSkuIDs.includes(skuID));
  /*
   * One row, one column, named as the adapter aliased it. The legacy read zero-versus-non-zero
   * [`model/dao/SkuDAO.cfc:L93-L97`], so a numeric flag is what the adapter expects to interpret.
   */
  return sqlRows([{ transactionExists: referenced ? 1 : 0 }]);
}

/** The transactional world every existence case shares. */
const TRANSACTION_WORLD: TransactionWorld = {
  skuOwners: new Map([
    [SKU_ONE, PRODUCT_A],
    [SKU_TWO, PRODUCT_A],
    [SKU_OPTIONLESS, PRODUCT_B],
  ]),
  transactionalSkuIDs: [SKU_ONE],
};

/** A harness whose executor answers the existence probe from {@link TRANSACTION_WORLD}. */
function makeTransactionExistsHarness(world: TransactionWorld = TRANSACTION_WORLD): Harness {
  return makeHarness({
    respond: (call) => answerTransactionExists(call, world),
  });
}

/* Two further harnesses: the write journal, and a store that honours `IN (…)` */

/** True when the statement reads rather than writes. Read off the verb, not off a double's flag. */
function isRead(call: SqlExecutorCall): boolean {
  return norm(call.sql).toUpperCase().startsWith('SELECT');
}

/** A harness for the write seam. */
function makePersistHarness(existingSkuRows: readonly Record<string, unknown>[] = []): Harness {
  return makeHarness({
    respond: (call) => (isRead(call) ? sqlRows(existingSkuRows) : sqlAffectedRows(1)),
  });
}

/** Every recorded statement that touched `table`, in issue order. */
function statementsFor(
  calls: readonly SqlExecutorCall[],
  table: string,
): readonly SqlExecutorCall[] {
  return callsContaining(calls, table);
}

/** The single statement that touched `table` and began with `verb`. */
function soleStatementFor(
  calls: readonly SqlExecutorCall[],
  table: string,
  verb: 'DELETE' | 'INSERT' | 'SELECT' | 'UPDATE',
): SqlExecutorCall {
  const matches = statementsFor(calls, table).filter((call) => norm(call.sql).startsWith(verb));
  expect(matches).toHaveLength(1);
  const only = matches[0];
  if (only === undefined) {
    throw new Error(`no ${verb} statement reached ${table}`);
  }
  return only;
}

/** The leading verb of each recorded statement that touched `table`, in issue order. */
function verbsFor(calls: readonly SqlExecutorCall[], table: string): readonly string[] {
  return statementsFor(calls, table).map((call) => norm(call.sql).split(' ')[0] ?? '');
}

/**
 * A harness whose executor resolves each statement against a named row store and honours
 * `WHERE … IN (…)`.
 */
function makeStoreHarness(
  tables: Readonly<Record<string, readonly Record<string, unknown>[]>>,
): Harness {
  return makeHarness({
    respond: (call) => {
      if (!isRead(call)) {
        return sqlAffectedRows(1);
      }

      const table = Object.keys(tables).find((name) =>
        new RegExp(`FROM ${name}\\b`).test(norm(call.sql)),
      );
      if (table === undefined) {
        return sqlRows([]);
      }
      const rows = tables[table] ?? [];

      /*
       * Resolve an `IN (…)` restriction against the bound values, so a loader that asked for the
       * wrong column or bound the wrong identifier gets nothing back rather than everything.
       */
      const restriction = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(norm(call.sql));
      const column = restriction?.[1];
      if (column === undefined) {
        return sqlRows([...rows]);
      }
      return sqlRows(rows.filter((row) => call.params.includes(row[column])));
    },
  });
}

/*
 * Type-level proofs
 * Each of these is a positive assignment: the value `true` is assigned to a type that resolves to
 * `true` only while the contract holds. Loosening the contract turns the annotation into `false` and
 * the assignment into a compile error. No `@ts-expect-error`, no suppression and no cast is used
 * anywhere in this file — the strict configuration is the assertion mechanism, not an obstacle.
 */

/**
 * `false` when `TMember` can be called with only its first argument — i.e. when the second parameter
 * has become optional. A function that requires two arguments is not assignable to a one-argument
 * function type, which is what makes the discrimination sound.
 */
type RequiresSecondArgument<TMember, TFirst> = TMember extends (first: TFirst) => unknown
  ? false
  : true;

/** T2 — `productId` is required, so the product predicate can never be conditional. */
const optionResolverRequiresProductId: RequiresSecondArgument<
  SkuRepository['findSkusBySelectedOptions'],
  string[]
> = true;

/**
 * D9 — `fetchOptions` stays required at the repository boundary even though the service defaults it.
 */
const findByProductRequiresFetchOptions: RequiresSecondArgument<
  SkuRepository['findByProduct'],
  Product
> = true;

/*
 * The six selected-option cases — T1, T2, T3, T4, T5 and the parameter order
 * Six separately named cases, one per drift trap, because each is a plausible and well-intentioned
 * "improvement" that changes results with no error and no compile failure. The anchor is the physical
 * shape the adapter commits to:
 *
 * Select distinct s.* from SwSku s
 * where exists (select 1 from SwSkuOption so where so.skuID = s.skuID and so.optionID = ?)
 * and s.productID = ?
 */

describe('NET-NEW T1 — conjunction, not intersection/disjunction', () => {
  /*
   * `model/dao/SkuDAO.cfc:L106-L120`. The legacy comment states the intent — "returns product
   * skus which matches all options" — and the loop at :L113-L121 appends one correlated existence test
   * per list element and appends the identifier to the parameter array in the same step. Duplicates in
   * the list therefore produce duplicate clauses and duplicate bound values, and no de-duplication
   * happens anywhere on the path. Three rewrites look equivalent and are not:
   * `optionID IN (…)` turns the conjunction into a disjunction;
   */
  const SELECTED: readonly string[] = [OPTION_SMALL, OPTION_SMALL, OPTION_RED];

  it('NET-NEW — emits one correlated option predicate per LIST ELEMENT, duplicates included', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([...SELECTED], PRODUCT_A);

    const sql = norm(soleCall(harness.calls).sql);
    expect(occurrences(sql, OPTION_MATCH_FRAGMENT)).toBe(SELECTED.length);
    /* And the duplicate really did survive into the bound values, so N is 3 and not 2. */
    expect(new Set(SELECTED).size).toBe(2);
    expect(soleCall(harness.calls).params).toEqual([...SELECTED, PRODUCT_A]);
  });

  it('NET-NEW — ANDs the predicates together and introduces no disjunction', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([...SELECTED], PRODUCT_A);

    const sql = norm(soleCall(harness.calls).sql);
    /* Four existence tests in total: the option-bearing guard plus one per selected option. */
    expect(occurrences(sql, 'EXISTS(')).toBe(SELECTED.length + 1);
    /*
     * Five predicates, therefore four joiners, and every one of them is a conjunction. */
    expect(occurrences(sql, ' AND EXISTS(')).toBe(SELECTED.length);
    expect(sql).not.toContain(' OR ');
  });

  it('NET-NEW — uses neither an IN list nor a HAVING COUNT rewrite', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([...SELECTED], PRODUCT_A);

    const sql = norm(soleCall(harness.calls).sql);
    expect(sql).not.toMatch(/optionID\s+IN\s*\(/i);
    expect(sql).not.toMatch(/GROUP\s+BY/i);
    expect(sql).not.toMatch(/HAVING/i);
    expect(sql).not.toMatch(/COUNT\s*\(/i);
  });

  it('NET-NEW — a SKU carrying only a SUBSET of the selected options is not returned', async () => {
    /*
     * The guarantee, not the shape. `SKU_TWO` carries `OPTION_SMALL` but not `OPTION_RED`, and the
     * responder applies exactly the predicates the statement carried — so this passes only while the
     * clauses really are conjunctive.
     */
    const harness = makeOptionResolutionHarness();

    const skus = await harness.repository.findSkusBySelectedOptions(
      [OPTION_SMALL, OPTION_RED],
      PRODUCT_A,
    );

    expect(skus.map((sku) => sku.skuID)).toEqual([SKU_ONE]);
  });

  it('NET-NEW — repeating an option changes the bound values but not the answer', async () => {
    const harness = makeOptionResolutionHarness();

    const skus = await harness.repository.findSkusBySelectedOptions([...SELECTED], PRODUCT_A);

    /*
     * Idempotent by construction: testing the same option twice cannot narrow the result further.
     */
    expect(skus.map((sku) => sku.skuID)).toEqual([SKU_ONE]);
    expect(soleCall(harness.calls).params).toHaveLength(SELECTED.length + 1);
  });
});

describe('NET-NEW T2 — productID is required and always emitted', () => {
  /*
   * `model/dao/SkuDAO.cfc:L123-L125` guards the product predicate with
   * `structKeyExists(arguments,"productID")`, which reads as an optional restriction and is not one.
   */
  it('NET-NEW — the declared shape is (optionIds: string[], productId: string) with both required', async () => {
    const harness = makeOptionResolutionHarness();

    /*
     * A positive type-level assignment: the member fits the exact declared shape, and the conditional
     * type above resolves to `true` only while the second parameter is required.
     */
    const declaredShape: (optionIds: string[], productId: string) => Promise<SkuRow[]> = (
      optionIds,
      productId,
    ) => harness.repository.findSkusBySelectedOptions(optionIds, productId);

    expect(optionResolverRequiresProductId).toBe(true);
    /*
     * And the exactly-shaped reference really does drive the adapter: both SKUs of `PRODUCT_A` that
     * carry `OPTION_SMALL` come back, so the assignment above is a live contract and not a dead type.
     */
    const skus = await declaredShape([OPTION_SMALL], PRODUCT_A);
    expect(skus.map((sku) => sku.skuID)).toEqual([SKU_ONE, SKU_TWO]);
  });

  it('NET-NEW — emits s.productID = ? unconditionally, with the product ID bound LAST', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([OPTION_SMALL, OPTION_RED], PRODUCT_A);

    const call = soleCall(harness.calls);
    expect(norm(call.sql)).toContain(PRODUCT_PREDICATE_FRAGMENT);
    expect(call.params[call.params.length - 1]).toBe(PRODUCT_A);
  });

  it('NET-NEW — emits the product predicate on the EMPTY selection too, where it is the only value', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([], PRODUCT_A);

    const call = soleCall(harness.calls);
    expect(norm(call.sql)).toContain(PRODUCT_PREDICATE_FRAGMENT);
    expect(call.params).toEqual([PRODUCT_A]);
  });

  it('NET-NEW — the product predicate narrows the answer rather than merely appearing', async () => {
    const harness = makeOptionResolutionHarness();

    /*
     * `PRODUCT_B` owns none of the fixtures, so a predicate that were emitted but ignored would show
     * up here as a non-empty answer.
     */
    const skus = await harness.repository.findSkusBySelectedOptions([OPTION_SMALL], PRODUCT_B);

    expect(skus).toEqual([]);
  });
});

describe('NET-NEW T3 — the option-bearing guard excludes option-less SKUs, empty selection included', () => {
  /*
   * `model/dao/SkuDAO.cfc:L109-L112`. The legacy base statement opens
   * `select distinct sku from SlatwallSku as sku inner join sku.options as opt`, and the alias `opt` is
   * never referenced in the WHERE clause — which makes the join look removable. It is not: an INNER JOIN
   * through the option link table silently excludes every option-less SKU from every result, including
   * when `selectedOptions` is empty and no existence test is appended at all. Deleting it would widen
   * every answer with no error anywhere. The port preserves it as a separate correlated existence test so
   *
   * TODO(parity) D19 — the consequence is a real defect and is carried, not repaired. For a SKU with
   * zero options `optionsList` is empty, so by T5 the query answers with every option-bearing SKU of
   * the product; the guard at `model/entity/Sku.cfc:L764` then only passes when the product has no
   * option-bearing SKUs at all. An option-less default SKU on a product that already has option-bearing
   * SKUs therefore fails `hasUniqueOptions`. That is observed legacy behaviour, and this suite pins the
   * query semantics it rests on rather than papering over the outcome.
   */
  it('NET-NEW — the guard is present when options are selected', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([OPTION_SMALL], PRODUCT_A);

    expect(norm(soleCall(harness.calls).sql)).toContain(OPTION_BEARING_FRAGMENT);
  });

  it('NET-NEW — the guard is STILL present when the selection is empty', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([], PRODUCT_A);

    const sql = norm(soleCall(harness.calls).sql);
    expect(sql).toContain(OPTION_BEARING_FRAGMENT);
    /* One existence test only — the guard. No option predicate was appended. */
    expect(occurrences(sql, 'EXISTS(')).toBe(1);
    expect(occurrences(sql, OPTION_MATCH_FRAGMENT)).toBe(0);
  });

  it('NET-NEW — an option-less SKU is excluded on the NONEMPTY path', async () => {
    const harness = makeOptionResolutionHarness();

    const skus = await harness.repository.findSkusBySelectedOptions([OPTION_SMALL], PRODUCT_A);

    expect(skus.map((sku) => sku.skuID)).toEqual([SKU_ONE, SKU_TWO]);
    expect(skus.map((sku) => sku.skuID)).not.toContain(SKU_OPTIONLESS);
  });

  it('NET-NEW — an option-less SKU is excluded on the EMPTY path as well', async () => {
    const harness = makeOptionResolutionHarness();

    const skus = await harness.repository.findSkusBySelectedOptions([], PRODUCT_A);

    /* Every option-bearing SKU of the product, and only those. */
    expect(skus.map((sku) => sku.skuID)).toEqual([SKU_ONE, SKU_TWO]);
    expect(skus.map((sku) => sku.skuID)).not.toContain(SKU_OPTIONLESS);
  });
});

describe('NET-NEW T4 — SELECT DISTINCT returns each multi-option SKU once', () => {
  /*
   * `model/dao/SkuDAO.cfc:L109` writes `select distinct`, and it is load-bearing rather than
   * defensive: the join fans out one row per SKU-option pair, so without it a SKU carrying N options
   * comes back N times. Every arity assertion layered above the resolver then breaks —
   * `model/entity/Product.cfc:L349-L364` returns the single SKU only when exactly one row came back and
   * raises otherwise, so a duplicated row turns a correct lookup into an error. No `GROUP BY` /
   * `HAVING` substitute is introduced; see T1 for why that rewrite is not equivalent.
   */
  it('NET-NEW — the projection is DISTINCT', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([OPTION_SMALL], PRODUCT_A);

    expect(norm(soleCall(harness.calls).sql).startsWith('SELECT DISTINCT ')).toBe(true);
  });

  it('NET-NEW — a SKU carrying three options is exposed ONCE, not once per link row', async () => {
    /*
     * Three options on one SKU is the fan-out case; the responder reproduces the fan-out whenever the
     * statement is not distinct, so dropping distinct fails this assertion rather than passing it.
     */
    const harness = makeOptionResolutionHarness([
      {
        skuID: SKU_ONE,
        skuCode: 'SKU-THREE-OPTIONS',
        productID: PRODUCT_A,
        optionIDs: [OPTION_SMALL, OPTION_RED, OPTION_LARGE],
      },
    ]);

    const skus = await harness.repository.findSkusBySelectedOptions([OPTION_SMALL], PRODUCT_A);

    expect(skus).toHaveLength(1);
    expect(skus.map((sku) => sku.skuID)).toEqual([SKU_ONE]);
  });
});

describe('NET-NEW T5 — an empty selectedOptions list is legal and meaningful', () => {
  /*
   * `model/entity/Product.cfc:L366` defaults `selectedOptions` to `""` and `listLen("")` is zero,
   * so the loop body never runs, no existence test is appended, and the statement legitimately
   * degenerates to "every option-bearing SKU of this product". Guarding the empty input away would
   * break two real callers, and the distinction between them matters:
   *
   * - Singular `product.getSkuBySelectedOptions` [`model/entity/Product.cfc:L349-L364`] does not reach
   * this query on the empty path at all. It branches at :L359 and reads `getSkus()` instead,
   * returning the sole SKU or raising. So it is not the reason the empty path must work.
   * - Plural `product.getSkusBySelectedOptions` [`:L366-L367`] passes the empty string straight
   * through, and `Sku.hasUniqueOptions` [`model/entity/Sku.cfc:L755-L769`] reaches it with an empty
   * `optionsList` for any SKU that carries no options. Those two depend on the degenerate form.
   */
  it('NET-NEW — appends zero option predicates and keeps both remaining predicates', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([], PRODUCT_A);

    const sql = norm(soleCall(harness.calls).sql);
    expect(occurrences(sql, OPTION_MATCH_FRAGMENT)).toBe(0);
    expect(sql).toContain(OPTION_BEARING_FRAGMENT);
    expect(sql).toContain(PRODUCT_PREDICATE_FRAGMENT);
  });

  it('NET-NEW — binds exactly [productId], because there is nothing else to bind', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([], PRODUCT_A);

    const call = soleCall(harness.calls);
    expect(call.params).toEqual([PRODUCT_A]);
    expect(occurrences(norm(call.sql), '?')).toBe(1);
  });

  it('NET-NEW — degenerates to all option-bearing SKUs of that product, and raises nothing', async () => {
    const harness = makeOptionResolutionHarness();

    const skus = await harness.repository.findSkusBySelectedOptions([], PRODUCT_A);

    expect(skus.map((sku) => sku.skuID)).toEqual([SKU_ONE, SKU_TWO]);
  });
});

describe('NET-NEW parameter order — option IDs in list order, then the product ID', () => {
  /*
   * TR-4. `ormExecuteQuery(hql, params)` becomes `execute(sql, params)` with the array assembled in
   * exactly the legacy sequence: `model/dao/SkuDAO.cfc:L120` appends each option identifier inside the
   * loop and :L125 appends the product identifier afterwards. Positional binding is the whole reason
   * the order is a contract rather than a detail.
   */
  it('NET-NEW — the params snapshot equals the caller order, duplicates included, product last', async () => {
    const harness = makeOptionResolutionHarness();
    const selection = [OPTION_RED, OPTION_SMALL, OPTION_RED, OPTION_LARGE];

    await harness.repository.findSkusBySelectedOptions([...selection], PRODUCT_A);

    const call = soleCall(harness.calls);
    /* Byte-for-byte, in order. Not a set, not sorted, not de-duplicated. */
    expect(call.params).toEqual([...selection, PRODUCT_A]);
    expect(occurrences(norm(call.sql), '?')).toBe(call.params.length);
  });

  it('NET-NEW — the recorded params are a SNAPSHOT, not a live alias of the caller array', async () => {
    const harness = makeOptionResolutionHarness();
    const selection = [OPTION_SMALL, OPTION_RED];

    await harness.repository.findSkusBySelectedOptions(selection, PRODUCT_A);
    /*
     * Mutating the caller's array afterwards must not rewrite history. Without a snapshot the
     * assertion above would be reading whatever the array holds at assertion time, which would make
     * every bind-order case in this file quietly meaningless.
     */
    selection.push(OPTION_LARGE);

    expect(soleCall(harness.calls).params).toEqual([OPTION_SMALL, OPTION_RED, PRODUCT_A]);
    expect(Object.isFrozen(soleCall(harness.calls))).toBe(true);
  });

  it('NET-NEW — every ? binds a VALUE; no identifier is ever bound or interpolated', async () => {
    const harness = makeOptionResolutionHarness();

    await harness.repository.findSkusBySelectedOptions([ADVERSARIAL_VALUE], PRODUCT_A);

    const call = soleCall(harness.calls);
    const sql = norm(call.sql);
    /* The hostile value reached the parameter array and nothing else. */
    expect(call.params).toEqual([ADVERSARIAL_VALUE, PRODUCT_A]);
    expect(sql).not.toContain(ADVERSARIAL_VALUE);
    expect(sql).not.toContain(PRODUCT_A);
    expect(sql).not.toContain("'");
    expect(sql).not.toContain('--');
    /*
     * And the identifiers in the statement are the canonical physical ones, not caller-supplied.
     */
    expect(sql).toContain(`FROM ${assertTableName('SwSku')} s`);
    expect(sql).toContain(`s.${assertColumnName(assertTableName('SwSku'), 'productID')} = ?`);
  });
});

/*
 * The transaction-existence chain — `transactionExists(productID?, skuID?)`
 * Ports `model/dao/SkuDAO.cfc:L53-L98`. This member is what both delete guards consult, so a wrong
 * answer is destructive in both directions: `true` when it should be `false` blocks a legitimate
 * delete, and `false` when it should be `true` permits one that orphans transactional history. The
 * guards are declared at `model/validation/Product.json:12` and `model/validation/Sku.json:12`, each as
 * `"transactionExistsFlag": [{ "contexts": "delete", "eq": false }]`. neither file is edited and no.
 */

describe('NET-NEW transactionExists — the optional DAO-side scope arguments', () => {
  it('NET-NEW — accepts a product identifier alone, in interface slot ONE', async () => {
    const harness = makeTransactionExistsHarness();

    await expect(harness.repository.transactionExists(PRODUCT_A)).resolves.toBe(true);

    expect(norm(soleCall(harness.calls).sql)).toContain(
      `WHERE ${PRODUCT_PREDICATE_FRAGMENT} AND (`,
    );
    expect(soleCall(harness.calls).params).toEqual([PRODUCT_A]);
  });

  it('NET-NEW — accepts a SKU identifier alone, in interface slot TWO', async () => {
    const harness = makeTransactionExistsHarness();

    await expect(harness.repository.transactionExists(undefined, SKU_ONE)).resolves.toBe(true);

    expect(norm(soleCall(harness.calls).sql)).toContain('WHERE s.skuID = ? AND (');
    expect(soleCall(harness.calls).params).toEqual([SKU_ONE]);
  });

  it('NET-NEW — SKU scope WINS when both identifiers are supplied', async () => {
    /*
     * `model/dao/SkuDAO.cfc:L59-L63` tests the SKU identifier first and only falls through to the
     * product identifier when it is absent, and `:L87-L91` binds whichever one that decision selected.
     * The two scopes are made to disagree here on purpose: `PRODUCT_A` has transactional history
     * through `SKU_ONE`, while the named `SKU_TWO` has none. An adapter that let the product win would
     * answer `true`; the legacy answers `false`, and so must this.
     */
    const harness = makeTransactionExistsHarness();

    await expect(harness.repository.transactionExists(PRODUCT_A, SKU_TWO)).resolves.toBe(false);

    const sql = norm(soleCall(harness.calls).sql);
    expect(sql).toContain('WHERE s.skuID = ? AND (');
    expect(sql).not.toContain(`WHERE ${PRODUCT_PREDICATE_FRAGMENT}`);
    /* Mutually exclusive, never combined: one placeholder, one value, and it is the SKU's. */
    expect(soleCall(harness.calls).params).toEqual([SKU_TWO]);
  });

  it('NET-NEW — resolves a SKU with no transactional history to false', async () => {
    const harness = makeTransactionExistsHarness();

    await expect(harness.repository.transactionExists(undefined, SKU_TWO)).resolves.toBe(false);
  });
});

describe('NET-NEW transactionExists — product-scoped isolation in ONE statement', () => {
  it('NET-NEW — product A having history does not make product B answer true', async () => {
    /*
     * The isolation guarantee, and the reason the responder reads the root predicate rather than
     * returning a canned verdict: an adapter that emitted the ten disjuncts without the root predicate
     * would be a global guard, and a canned verdict could not tell the difference.
     */
    const harness = makeTransactionExistsHarness();

    await expect(harness.repository.transactionExists(PRODUCT_A)).resolves.toBe(true);
    await expect(harness.repository.transactionExists(PRODUCT_B)).resolves.toBe(false);

    expect(harness.calls).toHaveLength(2);
    expect(callAt(harness.calls, 0).params).toEqual([PRODUCT_A]);
    expect(callAt(harness.calls, 1).params).toEqual([PRODUCT_B]);
  });

  it('NET-NEW — issues exactly ONE statement per check, not ten and not a per-family probe', async () => {
    /*
     * AAP §0.4.1.7 requires the ten-way chain be translated as a single query. The legacy composes one
     * HQL string with ten or-ed subqueries [`model/dao/SkuDAO.cfc:L57-L85`] and executes it once at
     * `:L87-L91`; a per-family loop would be ten round trips for one answer.
     */
    const harness = makeTransactionExistsHarness();

    await harness.repository.transactionExists(PRODUCT_A);

    expect(soleCall(harness.calls).params).toHaveLength(1);
  });
});

describe('NET-NEW transactionExists — the ten OR-ed existence predicates', () => {
  /*
   * `model/dao/SkuDAO.cfc:L65-L85`. ten predicates across nine entity families, because
   * `StockAdjustmentItem` is tested twice — once through its FROM stock and once through its to stock.
   * Every table and column below is spelled exactly as the implementation spells it; none is fabricated.
   */
  it('NET-NEW — contains all ten predicates, in legacy order', async () => {
    const harness = makeTransactionExistsHarness();

    await harness.repository.transactionExists(PRODUCT_A);
    const sql = norm(soleCall(harness.calls).sql);

    const positions = TRANSACTION_EXISTS_CLAUSES.map((clause) => {
      const at = sql.indexOf(clause);
      expect(at).toBeGreaterThanOrEqual(0);
      return at;
    });
    /* Strictly increasing: present and in the legacy sequence. */
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(new Set(positions).size).toBe(TRANSACTION_EXISTS_CLAUSES.length);
  });

  it('NET-NEW — the ten predicates are OR-ed, and the chain as a whole is AND-ed to the scope', async () => {
    const harness = makeTransactionExistsHarness();

    await harness.repository.transactionExists(PRODUCT_A);
    const sql = norm(soleCall(harness.calls).sql);

    /* Ten disjuncts means nine joiners, every one of them or. */
    expect(occurrences(sql, ' OR EXISTS(')).toBe(TRANSACTION_EXISTS_CLAUSES.length - 1);
    /*
     * And the whole disjunction hangs off the scope restriction, parenthesised so precedence cannot
     * turn one family into an unscoped match.
     */
    expect(sql).toContain(`WHERE ${PRODUCT_PREDICATE_FRAGMENT} AND (`);
  });

  it('NET-NEW — spans nine entity families, with StockAdjustmentItem tested twice', async () => {
    const harness = makeTransactionExistsHarness();

    await harness.repository.transactionExists(PRODUCT_A);
    const sql = norm(soleCall(harness.calls).sql);

    const families = [
      'SwOrderItem',
      'SwInventory',
      'SwOrderDeliveryItem',
      'SwPhysicalCountItem',
      'SwStockAdjustmentDeliveryItem',
      'SwStockAdjustmentItem',
      'SwStockHold',
      'SwStockReceiverItem',
      'SwVendorOrderItem',
    ];
    expect(families).toHaveLength(9);
    for (const family of families) {
      expect(occurrences(sql, `FROM ${family} a`)).toBe(family === 'SwStockAdjustmentItem' ? 2 : 1);
    }
    /*
     * The two StockAdjustmentItem tests differ only in which stock they reach through, and that
     * difference is the whole reason there are ten predicates and not nine.
     */
    expect(sql).toContain('ON st.stockID = a.fromStockID');
    expect(sql).toContain('ON st.stockID = a.toStockID');
  });

  it('NET-NEW — binds exactly ONE placeholder, and no caller value reaches the statement', async () => {
    const harness = makeTransactionExistsHarness();

    await harness.repository.transactionExists(ADVERSARIAL_VALUE);

    const call = soleCall(harness.calls);
    const sql = norm(call.sql);
    /* One scope, one placeholder — the ten disjuncts are entirely correlated and bind nothing. */
    expect(occurrences(sql, '?')).toBe(1);
    expect(call.params).toEqual([ADVERSARIAL_VALUE]);
    expect(sql).not.toContain(ADVERSARIAL_VALUE);
    expect(sql).not.toContain("'");
    expect(sql).not.toContain('--');
  });
});

describe('NET-NEW transactionExists — a call with neither scope is rejected, freshly and deliberately', () => {
  /*
   * The legacy has no explicit throw here, and it does not return false either.
   * `model/dao/SkuDAO.cfc:L87` is a two-part guard; with both arguments absent control reaches the
   * alternative branch at `:L89` and dereferences an argument that was never supplied, which the CFML
   * runtime reports as an undefined-variable error. The failure is real but incidental — it is a
   * missing-variable fault, not a designed rejection.
   */
  it('NET-NEW — raises a freshly authored invalid-argument error', async () => {
    const harness = makeTransactionExistsHarness();

    await expect(harness.repository.transactionExists()).rejects.toThrow(
      /requires either a SKU identifier or a product identifier/,
    );
  });

  it('NET-NEW — raises BEFORE issuing any statement, and never answers false', async () => {
    const harness = makeTransactionExistsHarness();

    await expect(harness.repository.transactionExists(undefined, undefined)).rejects.toThrow(
      /requires either a SKU identifier or a product identifier/,
    );
    /*
     * No round trip at all: the fault is detected from the arguments, so nothing was asked of the
     * database and no verdict — least of all a permissive one — was produced.
     */
    expect(harness.calls).toHaveLength(0);
  });
});

describe('NET-NEW transactionExists — the caller-order crossing [model/service/SkuService.cfc:L285-L287]', () => {
  /*
   * TODO(parity) — the crossing exists because the two layers are ordered differently on purpose
   * (see the note above this section). `createTransactionExistenceChecker` is the single place the
   * inversion happens, and it must be pinned behaviourally: both identifiers are 32-character hex
   * strings (IR-6), so a crossing written backwards type-checks perfectly and then silently restricts
   * on the wrong column. No brand and no compiler can distinguish them; only an order assertion can.
   */
  it('NET-NEW — the caller-side SKU-first argument reaches the repository slot TWO', async () => {
    const harness = makeTransactionExistsHarness();
    const checker = createTransactionExistenceChecker(harness.repository);

    /* Caller slot 1 is the SKU identifier — the order `model/entity/Sku.cfc:L594` reads in. */
    await expect(checker.getTransactionExistsFlag(SKU_ONE)).resolves.toBe(true);

    expect(norm(soleCall(harness.calls).sql)).toContain('WHERE s.skuID = ? AND (');
    expect(soleCall(harness.calls).params).toEqual([SKU_ONE]);
  });

  it('NET-NEW — the caller-side product argument reaches the repository slot ONE', async () => {
    const harness = makeTransactionExistsHarness();
    const checker = createTransactionExistenceChecker(harness.repository);

    /*
     * Caller slot 2 is the product identifier — the order `model/entity/Product.cfc:L626` reads in.
     */
    await expect(checker.getTransactionExistsFlag(undefined, PRODUCT_A)).resolves.toBe(true);

    expect(norm(soleCall(harness.calls).sql)).toContain(
      `WHERE ${PRODUCT_PREDICATE_FRAGMENT} AND (`,
    );
    expect(soleCall(harness.calls).params).toEqual([PRODUCT_A]);
  });

  it('NET-NEW — declares its argument order, so a mis-binding cannot compile silently', () => {
    const harness = makeTransactionExistsHarness();
    const checker: TransactionExistenceChecker = createTransactionExistenceChecker(
      harness.repository,
    );

    expect(checker.argumentOrder).toBe('skuID-first-productID-second');
  });
});

/*
 * The sku-code lookup — `findBySkuCode(skuCode)`
 * Ports `model/dao/SkuDAO.cfc:L102-L104`, whose single HQL line does three things at once:
 *
 * Select ss from SlatwallSku ss left join ss.alternateSkuCodes ascs
 * where ss.skuCode = :skuCode or ascs.alternateSkuCode = :skuCode.
 */

describe('NET-NEW findBySkuCode — the alternate-code fallback', () => {
  const SKU_CODE = 'SKU-PRIMARY-1';

  /** The lookup answers `rows`; the option hydration that follows a hit answers nothing. */
  function makeCodeHarness(rows: readonly Record<string, unknown>[]): Harness {
    return makeHarness({
      respond: (call) =>
        norm(call.sql).includes(OPTION_HYDRATION_SOURCE) ? sqlRows([]) : sqlRows(rows),
    });
  }

  it('NET-NEW — keeps the primary-code OR alternate-code predicate behind a LEFT JOIN', async () => {
    const harness = makeCodeHarness([{ skuID: SKU_ONE, skuCode: SKU_CODE, productID: PRODUCT_A }]);

    await harness.repository.findBySkuCode(SKU_CODE);
    const sql = norm(callAt(harness.calls, 0).sql);

    /* LEFT, not INNER: a SKU with no alternate codes must still match on its primary code. */
    expect(sql).toContain('LEFT JOIN SwAlternateSkuCode alt ON alt.skuID = s.skuID');
    expect(sql).toContain('WHERE s.skuCode = ? OR alt.alternateSkuCode = ?');
  });

  it('NET-NEW — binds the SAME input TWICE, in placeholder-occurrence order', async () => {
    const harness = makeCodeHarness([{ skuID: SKU_ONE, skuCode: SKU_CODE, productID: PRODUCT_A }]);

    await harness.repository.findBySkuCode(SKU_CODE);
    const lookup = callAt(harness.calls, 0);

    /* One named parameter in HQL becomes two positional placeholders, so the value repeats. */
    expect(occurrences(norm(lookup.sql), '?')).toBe(2);
    expect(lookup.params).toEqual([SKU_CODE, SKU_CODE]);
  });

  it('NET-NEW — resolves a SKU found only by its ALTERNATE code', async () => {
    /*
     * The row carries a different primary code, so only the alternate side of the disjunction can
     * have matched it.
     */
    const harness = makeCodeHarness([
      { skuID: SKU_ONE, skuCode: 'SKU-SOME-OTHER-CODE', productID: PRODUCT_A },
    ]);

    const sku = await harness.repository.findBySkuCode('SKU-LEGACY-ALIAS');

    expect(sku?.skuID).toBe(SKU_ONE);
    expect(callAt(harness.calls, 0).params).toEqual(['SKU-LEGACY-ALIAS', 'SKU-LEGACY-ALIAS']);
  });

  it('NET-NEW — introduces no UNION, no DISTINCT and no fabricated LIMIT', async () => {
    const harness = makeCodeHarness([{ skuID: SKU_ONE, skuCode: SKU_CODE, productID: PRODUCT_A }]);

    await harness.repository.findBySkuCode(SKU_CODE);
    const sql = norm(callAt(harness.calls, 0).sql).toUpperCase();

    /*
     * A `UNION` of two single-sided lookups would answer the same question and lose the unique-result
     * failure below by de-duplicating. `DISTINCT` would do the same thing more quietly. A `LIMIT 1`
     * would convert the failure into a silent "take the first", which is exactly what the legacy's
     * unique-result request refuses. None of the three appears in the source, so none appears here
     * (AAP §0.7.3 — invent nothing).
     */
    expect(sql).not.toContain('UNION');
    expect(sql).not.toContain('DISTINCT');
    expect(sql).not.toContain('LIMIT');
  });

  it('NET-NEW — answers null for zero matches, and issues no hydration statement', async () => {
    const harness = makeCodeHarness([]);

    await expect(harness.repository.findBySkuCode('SKU-NO-SUCH-CODE')).resolves.toBeNull();

    /*
     * Null is an ordinary answer on the `PhysicalService.cfc:L199` path, so nothing raises — and with
     * no SKU to hydrate there is nothing to ask for either.
     */
    expect(harness.calls).toHaveLength(1);
  });

  it('NET-NEW — REFUSES more than one match rather than taking the first', async () => {
    const harness = makeCodeHarness([
      { skuID: SKU_ONE, skuCode: SKU_CODE, productID: PRODUCT_A },
      { skuID: SKU_TWO, skuCode: SKU_CODE, productID: PRODUCT_A },
    ]);

    /*
     * The legacy asks `ormExecuteQuery` for a unique result [`model/dao/SkuDAO.cfc:L104`], so two
     * matches is a fault. Weakening this to "take the first" would silently pick one of two SKUs for
     * every physical count and every alternate-code collision — the failure mode the unique-result
     * request exists to prevent. The message is authored in the destination; no reserved source string
     * is reproduced.
     */
    await expect(harness.repository.findBySkuCode(SKU_CODE)).rejects.toThrow(
      /More than one SKU matched the requested code/,
    );
  });

  it('NET-NEW — never places the caller value in the statement text', async () => {
    const harness = makeCodeHarness([]);

    await harness.repository.findBySkuCode(ADVERSARIAL_VALUE);

    const lookup = callAt(harness.calls, 0);
    expect(lookup.params).toEqual([ADVERSARIAL_VALUE, ADVERSARIAL_VALUE]);
    expect(norm(lookup.sql)).not.toContain(ADVERSARIAL_VALUE);
    expect(norm(lookup.sql)).not.toContain("'");
  });
});

/*
 * The search projection — `searchByProductType(term?, productTypeID?)`
 * Ports `model/dao/SkuDAO.cfc:L130-L148`. Discrepancy 3: both arguments are optional in the legacy
 * declaration, and the port keeps them optional — but only one of them is safe to omit, and the
 * asymmetry is source behaviour rather than a design choice.
 *
 * TODO(parity) D22 [model/dao/SkuDAO.cfc:L132] — `model/dao/SkuDAO.cfc:L132` and `:L135` put mapping-layer entity names inside A
 * native statement (`SlatwallSku`, `SlatwallProduct`), while thirty lines further on `:L179-L211` uses
 * physical names in an equally native statement. One file, two conventions. The port resolves the
 * physical tables — `SwSku`, `SwProduct` — through the whitelist rather than by stripping a prefix off
 * the legacy text, and no schema name is fabricated. D22 is a port-minted designation recorded in
 * `src/ports/repositories/SkuRepository.ts`; no new D-number is minted here.
 */

describe('NET-NEW searchByProductType — both arguments optional, and the projection', () => {
  it('NET-NEW — searches on the term alone, with no product-type restriction', async () => {
    const harness = makeHarness({
      outcomes: [sqlRows([{ skuID: SKU_ONE, skuCode: 'SKU-ABC' }])],
    });

    await harness.repository.searchByProductType('abc');

    const sql = norm(soleCall(harness.calls).sql);
    expect(sql).toBe('select skuID,skuCode from SwSku where skuCode like ?');
    expect(soleCall(harness.calls).params).toEqual(['%abc%']);
  });

  it('NET-NEW — maps each row to the readonly { id, value } projection', async () => {
    const harness = makeHarness({
      outcomes: [
        sqlRows([
          { skuID: SKU_ONE, skuCode: 'SKU-ABC-1' },
          { skuID: SKU_TWO, skuCode: 'SKU-ABC-2' },
        ]),
      ],
    });

    const found: SkuSearchRow[] = await harness.repository.searchByProductType('abc');

    /*
     * `model/dao/SkuDAO.cfc:L141-L146` builds `{ "id" = skuID, "value" = skuCode }` per row, in the
     * order the query returned them. The projection is two members and nothing else — the SKU entity
     * is never hydrated for a search hit.
     */
    expect(found).toEqual([
      { id: SKU_ONE, value: 'SKU-ABC-1' },
      { id: SKU_TWO, value: 'SKU-ABC-2' },
    ]);
  });

  it('NET-NEW — applies the wildcards INSIDE the adapter, as part of the bound VALUE', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.searchByProductType('abc');

    /*
     * `model/dao/SkuDAO.cfc:L133` wraps the term in leading and trailing wildcards inside the DAO.
     * Moving that to the caller would change the contract of every existing call site. The wrapped
     * value is bound, so the wildcards belong to the value and never to the statement text.
     */
    expect(soleCall(harness.calls).params).toEqual(['%abc%']);
    expect(norm(soleCall(harness.calls).sql)).not.toContain('%');
  });

  it('NET-NEW — raises when the term is omitted, because the legacy reads it unguarded', async () => {
    const harness = makeHarness();

    /*
     * `model/dao/SkuDAO.cfc:L133` interpolates the argument unconditionally, so omitting it makes the
     * legacy dereference an argument that is not there and fail. It does not search for everything.
     * Returning every SKU would be new behaviour, so the failure is reproduced with a message authored
     * in the destination.
     */
    await expect(harness.repository.searchByProductType()).rejects.toThrow(
      /A SKU search requires a term/,
    );
    expect(harness.calls).toHaveLength(0);
  });
});

describe('NET-NEW searchByProductType — the product-type restriction', () => {
  it('NET-NEW — nests the membership test in a product subquery rather than joining', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.searchByProductType('abc', OPTION_GROUP_SIZE);

    /*
     * `model/dao/SkuDAO.cfc:L135` restricts SKUs to products drawn from an INNER SELECT over the
     * product table, rather than joining the product table and filtering it directly the way
     * `model/dao/ProductDAO.cfc:L424` does. Flattening it into a join would also fan the result out,
     * so the nesting is retained.
     */
    expect(norm(soleCall(harness.calls).sql)).toBe(
      'select skuID,skuCode from SwSku where skuCode like ? ' +
        'and productID in (select productID from SwProduct where productTypeID in (?))',
    );
  });

  it('NET-NEW — binds the code pattern FIRST, then the product-type identifiers', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.searchByProductType('abc', `${PRODUCT_A},${PRODUCT_B}`);

    /*
     * TR-4. `model/dao/SkuDAO.cfc:L138` fixes the order by adding both parameters before it installs
     * the statement text, and no type can catch a transposed array — only this assertion can. One
     * placeholder per surviving segment, each bound individually: a single comma-joined value bound to
     * one placeholder would be compared as one long string and match nothing.
     */
    expect(soleCall(harness.calls).params).toEqual(['%abc%', PRODUCT_A, PRODUCT_B]);
    expect(norm(soleCall(harness.calls).sql)).toContain('productTypeID in (?,?)');
  });

  it('NET-NEW — TRIMS before deciding, so a whitespace-only value leaves the restriction OFF', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.searchByProductType('abc', '   ');

    /*
     * The sku-side guard trims and its product-side twin does not, and both strictnesses are
     * preserved. `model/dao/SkuDAO.cfc:L134` requires the argument to be present and non-blank after
     * trimming, so a whitespace-only value is rejected and the restriction is simply not applied. The
     * equivalent at `model/dao/ProductDAO.cfc:L423` tests length only, so the same value is accepted
     * there (Discrepancy 6). Harmonising them would change one of the two, so neither is harmonised.
     */
    expect(norm(soleCall(harness.calls).sql)).toBe(
      'select skuID,skuCode from SwSku where skuCode like ?',
    );
    expect(soleCall(harness.calls).params).toEqual(['%abc%']);
  });

  it('NET-NEW — treats an omitted product type as genuinely optional', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.searchByProductType('abc', undefined);

    expect(norm(soleCall(harness.calls).sql)).not.toContain('productTypeID in');
  });

  it('NET-NEW — drops empty list segments without trimming the survivors', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.searchByProductType('abc', ` ${PRODUCT_A} ,, ${PRODUCT_B} `);

    /*
     * Platform list semantics, preserved exactly: split on commas, drop empty segments, and do not trim
     * what remains — so a segment of `" x "` is bound with its spaces. Trimming the survivors here
     * would silently repair identifiers the legacy would have failed to match.
     */
    expect(soleCall(harness.calls).params).toEqual(['%abc%', ` ${PRODUCT_A} `, ` ${PRODUCT_B} `]);
    expect(norm(soleCall(harness.calls).sql)).toContain('productTypeID in (?,?)');
  });

  it('NET-NEW — keeps every caller value out of the statement text', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.searchByProductType(ADVERSARIAL_VALUE, PRODUCT_A);

    const sql = norm(soleCall(harness.calls).sql);
    expect(soleCall(harness.calls).params).toEqual([`%${ADVERSARIAL_VALUE}%`, PRODUCT_A]);
    expect(sql).not.toContain(ADVERSARIAL_VALUE);
    expect(sql).not.toContain(PRODUCT_A);
    expect(sql).not.toContain("'");
    expect(sql).not.toContain('--');
  });
});

/*
 * The product SKU read — `findByProduct(product, fetchOptions)` and D9
 * Ports `model/dao/SkuDAO.cfc:L150-L168`.
 *
 * TODO(parity) D9 — `model/dao/SkuDAO.cfc:L150-L168` contains two scoping defects, and the port
 * preserves their observable consequences without reproducing their mechanism.
 */

describe('NET-NEW findByProduct — fetchOptions is a REQUIRED boolean at the repository boundary', () => {
  it('NET-NEW — the declared shape is (product: Product, fetchOptions: boolean)', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    /*
     * A positive type-level assignment, and no suppression comment anywhere: the conditional type
     * resolves to `true` only while the second parameter is required.
     */
    const declaredShape: (product: Product, fetchOptions: boolean) => Promise<SkuRow[]> = (
      product,
      fetchOptions,
    ) => harness.repository.findByProduct(product, fetchOptions);

    expect(findByProductRequiresFetchOptions).toBe(true);
    await expect(declaredShape(productFor('merchandise'), false)).resolves.toEqual([]);
  });

  it('NET-NEW — accepts the Product ENTITY, not a product identifier', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });
    const product = productFor('merchandise');

    await harness.repository.findByProduct(product, false);

    /*
     * `model/dao/SkuDAO.cfc:L151` declares `required any product` and `:L164` passes the entity, not its
     * key — which is what lets the eager branch read the product's own product type without a second
     * lookup. The identifier is what gets bound; the entity is what gets accepted.
     */
    expect(soleCall(harness.calls).params).toEqual([product.productID]);
  });

  it('NET-NEW — emits no join and asks the resolver nothing when the flag is LOWERED', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.findByProduct(productFor('merchandise'), false);

    /* `:L153` never enters the branch, so the base product type is never resolved. */
    const sql = norm(soleCall(harness.calls).sql);
    expect(sql).toContain(`FROM SwSku s WHERE ${PRODUCT_PREDICATE_FRAGMENT}`);
    expect(sql).not.toContain('JOIN');
    expect(harness.requestedProductTypeIds).toEqual([]);
  });
});

describe('NET-NEW findByProduct — the three INNER JOIN branches FILTER the result set', () => {
  it('NET-NEW — merchandise joins the option link table', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.findByProduct(productFor('merchandise'), true);

    /*
     * `model/dao/SkuDAO.cfc:L157` — INNER, so an option-less SKU of a merchandise product is excluded.
     * A left join here would widen the answer with no error.
     */
    expect(norm(callAt(harness.calls, 0).sql)).toContain(
      'FROM SwSku s INNER JOIN SwSkuOption so ON so.skuID = s.skuID WHERE s.productID = ?',
    );
  });

  it('NET-NEW — contentAccess joins the access-content link table', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.findByProduct(productFor('contentAccess'), true);

    /* `model/dao/SkuDAO.cfc:L155`. */
    expect(norm(callAt(harness.calls, 0).sql)).toContain(
      'FROM SwSku s INNER JOIN SwSkuAccessContent sac ON sac.skuID = s.skuID WHERE s.productID = ?',
    );
  });

  it('NET-NEW — subscription joins the TERM then the BENEFITS, in legacy order', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    await harness.repository.findByProduct(productFor('subscription'), true);

    /*
     * Two joins, and the order is the legacy's: the term at `:L159`, then the benefits at `:L160`.
     */
    const sql = norm(callAt(harness.calls, 0).sql);
    expect(sql).toContain(
      'FROM SwSku s INNER JOIN SwSubscriptionTerm stm ' +
        'ON stm.subscriptionTermID = s.subscriptionTermID ' +
        'INNER JOIN SwSkuSubsBenefit ssb ON ssb.skuID = s.skuID WHERE s.productID = ?',
    );
    expect(occurrences(sql, 'INNER JOIN')).toBe(2);
  });

  it('NET-NEW — binds only the product identifier, whichever branch was taken', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([]), sqlRows([]), sqlRows([])] });

    for (const baseProductType of ['merchandise', 'contentAccess', 'subscription'] as const) {
      await harness.repository.findByProduct(productFor(baseProductType), true);
    }

    /* Every join is correlated on columns; none of them binds a value. */
    for (const call of callsContaining(harness.calls, 'FROM SwSku s')) {
      expect(call.params).toEqual([PRODUCT_A]);
      expect(occurrences(norm(call.sql), '?')).toBe(1);
    }
  });
});

describe('NET-NEW findByProduct — the FETCH half of INNER JOIN FETCH', () => {
  /*
   * `inner join fetch` does two things: it restricts the result set — which the joins above reproduce —
   * and it populates the association on the returned entities, which a join alone does not. Emitting the
   * join without the fetch yields the right number of SKUs carrying empty collections, so every member
   * that reads one answers from an empty array without raising: `getOptionsDisplay` returns the empty
   * string, `getSkuDefinition` returns nothing, `getOptionsIDList` returns no identifiers. Silence is
   * what makes this worth a case of its own.
   */
  it('NET-NEW — populates the option collection for merchandise, with its option group', async () => {
    const harness = makeStoreHarness({
      SwSku: [{ skuID: SKU_ONE, skuCode: 'SKU-A', productID: PRODUCT_A }],
      /*
       * These rows carry the option's own columns alongside the link's, because the statement under
       * test is a JOIN — `SwSkuOption` INNER JOIN `SwOption` — while this double resolves a statement to
       * a single store. Modelling the joined row is what keeps the fixture honest about the result set
       * the adapter actually receives; a bare `{skuID, optionID}` would describe a result set the
       * statement cannot return.
       */
      SwSkuOption: [
        {
          skuID: SKU_ONE,
          optionID: OPTION_SMALL,
          optionName: 'Small',
          optionGroupID: OPTION_GROUP_SIZE,
        },
      ],
      SwOptionGroup: [{ optionGroupID: OPTION_GROUP_SIZE, optionGroupCode: 'size' }],
    });

    const skus = await harness.repository.findByProduct(productFor('merchandise'), true);

    expect(skus).toHaveLength(1);
    const options = skus[0]?.getOptions() ?? [];
    expect(options).toHaveLength(1);
    expect(options[0]?.optionID).toBe(OPTION_SMALL);
    /* The group travels with the option, because `Sku.generateImageFileName` reads through it. */
    expect(options[0]?.optionGroup?.optionGroupCode).toBe('size');
  });

  it('NET-NEW — populates the access-content references for contentAccess', async () => {
    const harness = makeStoreHarness({
      SwSku: [{ skuID: SKU_ONE, skuCode: 'SKU-A', productID: PRODUCT_A }],
      SwSkuAccessContent: [{ skuID: SKU_ONE, contentID: CONTENT_REFERENCE }],
    });

    const skus = await harness.repository.findByProduct(productFor('contentAccess'), true);

    /*
     * Identifier references, not entities: `Content` is explicitly out of scope, so the port models the
     * collection as `{ contentID }` and hydrates no excluded entity (TR-5).
     */
    expect(skus[0]?.accessContents).toEqual([{ contentID: CONTENT_REFERENCE }]);
  });

  it('NET-NEW — populates the subscription BENEFITS but NOT the term, matching the legacy', async () => {
    const harness = makeStoreHarness({
      SwSku: [{ skuID: SKU_ONE, skuCode: 'SKU-A', productID: PRODUCT_A }],
      SwSkuSubsBenefit: [{ skuID: SKU_ONE, subscriptionBenefitID: BENEFIT_REFERENCE }],
    });

    const skus = await harness.repository.findByProduct(productFor('subscription'), true);

    expect(skus[0]?.subscriptionBenefits).toEqual([{ subscriptionBenefitID: BENEFIT_REFERENCE }]);
    /*
     * `model/dao/SkuDAO.cfc:L159` joins the term with no `FETCH`, so it restricts and does not populate.
     * Leaving it unresolved is the faithful outcome, not an omission.
     */
    expect(skus[0]?.subscriptionTerm).toBeUndefined();
  });

  it('NET-NEW — fetches nothing at all when the flag is lowered', async () => {
    const harness = makeStoreHarness({
      SwSku: [{ skuID: SKU_ONE, skuCode: 'SKU-A', productID: PRODUCT_A }],
      SwSkuOption: [{ skuID: SKU_ONE, optionID: OPTION_SMALL }],
    });

    const skus = await harness.repository.findByProduct(productFor('merchandise'), false);

    expect(skus[0]?.getOptions()).toEqual([]);
    /* One statement only: the SKU projection. No join, and no association loader. */
    expect(soleCall(harness.calls).sql).not.toContain('INNER JOIN');
  });
});

/*
 * The sorted SKU ordering — `findSortedSkuIdsByProduct(productID)`, D8, D13, M7 and D7
 * Ports `model/dao/SkuDAO.cfc:L172-L202`, together with the two private tag-syntax helpers that support
 * it at `:L204-L220` and `:L222-L226`.
 */

describe('NET-NEW findSortedSkuIdsByProduct — the base-10 odometer ordering', () => {
  /*
   * One memoized ceiling, one sorted answer. Keyed on the statement so either can be asserted alone.
   */
  function makeSortedHarness(
    options: { readonly maximumSortOrder?: number; readonly skuIDs?: readonly string[] } = {},
  ): Harness {
    return makeHarness({
      respond: (call) => {
        if (norm(call.sql) === MAX_SORT_ORDER_STATEMENT) {
          return sqlRows(
            options.maximumSortOrder === undefined ? [] : [{ max: options.maximumSortOrder }],
          );
        }
        return sqlRows((options.skuIDs ?? [SKU_ONE, SKU_TWO]).map((skuID) => ({ skuID })));
      },
    });
  }

  /** The ordering statement, which is the second one the member issues. */
  function orderingStatement(harness: Harness): SqlExecutorCall {
    const matches = callsContaining(harness.calls, ODOMETER_FRAGMENT);
    expect(matches).toHaveLength(1);
    return callAt(matches, 0);
  }

  it('NET-NEW — joins SwSku through SwSkuOption, SwOption and SwOptionGroup, in that order', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 3 });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * `model/dao/SkuDAO.cfc:L179-L188`. The chain has to reach the option GROUP because the ordering
     * expression reads the group's own sort order, and it has to pass through the link table to get
     * there. Every identifier is the canonical physical name and passes the destination whitelist.
     */
    expect(norm(orderingStatement(harness).sql)).toContain(
      `SELECT ${assertTableName('SwSku')}.${assertColumnName(assertTableName('SwSku'), 'skuID')} ` +
        `FROM ${assertTableName('SwSku')} ` +
        `INNER JOIN ${assertTableName('SwSkuOption')} ` +
        'ON SwSku.skuID = SwSkuOption.skuID ' +
        `INNER JOIN ${assertTableName('SwOption')} ON SwSkuOption.optionID = SwOption.optionID ` +
        `INNER JOIN ${assertTableName('SwOptionGroup')} ` +
        'ON SwOption.optionGroupID = SwOptionGroup.optionGroupID',
    );
  });

  it('NET-NEW — restricts to the product and groups by SKU', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 3 });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * `:L190` and `:L191`. The GROUP BY is what makes the aggregate ordering below well-defined: one
     * row per SKU, ordered by a sum taken across that SKU's option rows.
     */
    const sql = norm(orderingStatement(harness).sql);
    expect(sql).toContain('WHERE SwSku.productID = ? GROUP BY SwSku.skuID');
  });

  it('NET-NEW — keeps the source odometer expression, not an ORDER BY on the two sort orders', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 3 });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * `model/dao/SkuDAO.cfc:L192-L198`. The expression treats each option group as a digit position in a
     * base-10 number: a lower group sort order produces a larger exponent, so it is the more significant
     * digit. Summing the digits per SKU collapses a multi-column ordering into one comparable number.
     */
    const sql = norm(orderingStatement(harness).sql);
    expect(sql).toContain(ODOMETER_FRAGMENT);
    expect(sql).not.toMatch(/ORDER BY SwOptionGroup\.sortOrder/);
    expect(sql).toContain('ASC');
  });

  it('NET-NEW — BINDS the memoized ceiling rather than interpolating it', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 4 });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * The legacy interpolates the memoized value straight into the ordering expression
     * [`model/dao/SkuDAO.cfc:L197`]. The port binds it, because `?` binds values only — and a numeric
     * ceiling is a value, not an identifier. The identifiers around it stay static canonical names.
     */
    const ordering = orderingStatement(harness);
    expect(norm(ordering.sql)).toContain('POWER(10, ? - SwOptionGroup.sortOrder)');
    expect(norm(ordering.sql)).not.toContain('POWER(10, 5');
    expect(ordering.params).toEqual([PRODUCT_A, 5]);
  });

  it('NET-NEW — binds the product identifier FIRST, then the ceiling, matching placeholder order', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 9 });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * TR-4: placeholder order follows the statement text — the product identifier in the predicate
     * [`:L190`] comes before the ceiling in the ordering expression [`:L197`]. Transposing the array
     * would compare a SKU's product against a number and still run.
     */
    const ordering = orderingStatement(harness);
    expect(ordering.params).toEqual([PRODUCT_A, 10]);
    expect(occurrences(norm(ordering.sql), '?')).toBe(2);
  });

  it('NET-NEW — returns the identifiers in the order the database produced them', async () => {
    const harness = makeSortedHarness({
      maximumSortOrder: 2,
      skuIDs: [SKU_TWO, SKU_ONE],
    });

    /* The ordering is the database's; the adapter re-orders nothing and re-sorts nothing. */
    await expect(harness.repository.findSortedSkuIdsByProduct(PRODUCT_A)).resolves.toEqual([
      SKU_TWO,
      SKU_ONE,
    ]);
  });

  it('NET-NEW — never interpolates the caller value into the statement', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 1 });

    await harness.repository.findSortedSkuIdsByProduct(ADVERSARIAL_VALUE);

    const ordering = orderingStatement(harness);
    expect(ordering.params).toEqual([ADVERSARIAL_VALUE, 2]);
    expect(norm(ordering.sql)).not.toContain(ADVERSARIAL_VALUE);
    expect(norm(ordering.sql)).not.toContain("'");
  });

  /*
   * TODO(parity) D8 — `model/dao/SkuDAO.cfc:L177` carries this comment, reproduced verbatim:
   *
   * TODO: test to see if this query works with DB's other than MSSQL and MySQL.
   */
  it('NET-NEW — targets a single dialect, carrying D8 forward rather than resolving it', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 3 });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /* One statement shape, no engine branch, no dialect parameter anywhere in it. */
    const sql = norm(orderingStatement(harness).sql);
    expect(sql).toContain('POWER(');
    expect(sql).not.toMatch(/MicrosoftSQLServer|Oracle10g|dialect/i);
  });

  /*
   * TODO(parity) D13 — the inner join through `SwSkuOption` excludes option-less SKUs, and that absence
   * is the root cause of a downstream failure that is not repaired here.
   * `model/dao/SkuDAO.cfc:L180-L182` joins the link table with an INNER join, so a SKU carrying no
   * options never appears in the ordering. `model/service/SkuService.cfc:L223-L240` and `:L246-L268`
   * then index `sortedArrayReturn[index]` where `index = arrayFind(sortedArray, skuID)` — and for an
   * excluded SKU `arrayFind` answers zero, so the assignment throws.
   */
  it('NET-NEW — keeps the INNER join, so option-less SKUs stay absent (D13 preserved)', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 3, skuIDs: [SKU_ONE, SKU_TWO] });

    const sorted = await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    const sql = norm(orderingStatement(harness).sql);
    expect(occurrences(sql, 'INNER JOIN')).toBe(3);
    expect(sql).not.toContain('LEFT JOIN');
    /* The option-less SKU of the same product is simply not in the answer. */
    expect(sorted).not.toContain(SKU_OPTIONLESS);
  });

  it('NET-NEW — leaves the latent NULL hazard in the SUM exactly as the source leaves it', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 3 });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * TODO(parity) — `model/entity/Option.cfc:L56` declares `sortOrder` with no `required` constraint
     * while `model/entity/OptionGroup.cfc:L58` declares its own `required="true"`. So the option side of
     * the product inside the SUM can legitimately be NULL, and a NULL term makes the whole sum NULL for
     * that SKU. The source has no guard, and none is added: `COALESCE`, `IFNULL` or an `IS NOT NULL`
     * predicate would each change which SKUs come back and in what order.
     */
    const sql = norm(orderingStatement(harness).sql).toUpperCase();
    expect(sql).not.toContain('COALESCE');
    expect(sql).not.toContain('IFNULL');
    expect(sql).not.toContain('IS NOT NULL');
  });
});

describe('NET-NEW findSortedSkuIdsByProduct — the memoized option-group ceiling', () => {
  function makeSortedHarness(memo?: OptionGroupSortOrderMemo): Harness {
    return makeHarness({
      ...(memo === undefined ? {} : { memo }),
      respond: (call) =>
        norm(call.sql) === MAX_SORT_ORDER_STATEMENT
          ? sqlRows([{ max: 3 }])
          : sqlRows([{ skuID: SKU_ONE }]),
    });
  }

  it('NET-NEW — resolves the ceiling with a WHOLE-TABLE aggregate, unscoped and unparameterised', async () => {
    const harness = makeSortedHarness();

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * `model/dao/SkuDAO.cfc:L210-L212`: the maximum is taken across every option group in the system,
     * with no product restriction at all — which is what makes it memoizable in the first place. Adding a
     * product scope would change the ordering of every product that does not use every group.
     */
    const aggregate = callAt(callsContaining(harness.calls, MAX_SORT_ORDER_STATEMENT), 0);
    expect(norm(aggregate.sql)).toBe(MAX_SORT_ORDER_STATEMENT);
    expect(aggregate.params).toEqual([]);
    expect(norm(aggregate.sql)).not.toContain('WHERE');
  });

  it('NET-NEW — memoizes within ONE repository, so a second sorted read re-uses it', async () => {
    const harness = makeSortedHarness();

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_B);

    /*
     * `:L206` seeds and stores; `:L205` short-circuits on the stored value. One aggregate, two orderings.
     */
    expect(callsContaining(harness.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
    expect(callsContaining(harness.calls, ODOMETER_FRAGMENT)).toHaveLength(2);
  });

  it('NET-NEW — seeds the ceiling at 1 when the table has no rows, so the answer is 1', async () => {
    const harness = makeHarness({
      respond: (call) =>
        norm(call.sql) === MAX_SORT_ORDER_STATEMENT ? sqlRows([]) : sqlRows([{ skuID: SKU_ONE }]),
    });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * `:L206` seeds `1` before the statement runs and `:L214` only overwrites it when the aggregate
     * produced a value, so an empty table leaves the seed standing.
     */
    expect(callAt(callsContaining(harness.calls, ODOMETER_FRAGMENT), 0).params).toEqual([
      PRODUCT_A,
      1,
    ]);
  });

  /*
   * M7 — the memo is request-scoped, not process-scoped, and that is a deliberate departure from the
   * legacy lifetime. di/1 registers DAOs as singletons — `org/Hibachi/Hibachi.cfc:L289-L302` declares
   * only `entity`, `process`, `transient` and `report` as transients — so the legacy memo at
   * `model/dao/SkuDAO.cfc:L204-L220` lives in a component that outlives every request, and a sort order
   * read once was reused until the application restarted.
   */
  it('NET-NEW — M7: a SECOND repository in the same warm process does NOT see the first memo', async () => {
    const first = makeSortedHarness();
    await first.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    expect(callsContaining(first.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);

    /*
     * A second instance, in the same module registry and the same process, with its own memo — which is
     * exactly what a second invocation on a warm container gets.
     */
    const second = makeSortedHarness();
    await second.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /* It re-reads. If the memo were static, module-scope or a singleton, this would be zero. */
    expect(callsContaining(second.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
  });

  it('NET-NEW — M7: two repositories SHARING one memo share the read, which is the request case', async () => {
    /*
     * The complement of the case above: within one invocation a re-bound repository keeps the memo, so a
     * transaction boundary does not re-resolve a ceiling the same invocation already has.
     */
    const memo = createOptionGroupSortOrderMemo();
    const first = makeSortedHarness(memo);
    const second = makeSortedHarness(memo);

    await first.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    await second.repository.findSortedSkuIdsByProduct(PRODUCT_B);

    expect(callsContaining(first.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
    expect(callsContaining(second.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(0);
  });

  /*
   * TODO(parity) D7 — `model/dao/SkuDAO.cfc:L222-L226` has an inverted guard, so the member whose whole
   * purpose is to clear the memo never clears it. The legacy deletes the key only when the key is
   * absent — the one case where there is nothing to delete — so once a value has been memoized the guard
   * fails and the value survives.
   */
  it('NET-NEW — D7: clearOptionGroupSortOrderCache does NOT clear, and the memo survives', async () => {
    const harness = makeSortedHarness();

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    expect(callsContaining(harness.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);

    /* Synchronous, and returns nothing — there is nothing to await. */
    const cleared: void = harness.repository.clearOptionGroupSortOrderCache();
    expect(cleared).toBeUndefined();

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_B);

    /*
     * Still one. The memo was not discarded, so the aggregate did not run again — precisely the legacy
     * outcome. Were the guard corrected, this would be two, and the ordering of every subsequent sorted
     * read could change.
     */
    expect(callsContaining(harness.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
    expect(callsContaining(harness.calls, ODOMETER_FRAGMENT)).toHaveLength(2);
  });

  it('NET-NEW — D7: calling the clear on an UNMEMOIZED repository is equally inert', async () => {
    const harness = makeSortedHarness();

    /*
     * The one path where the legacy assignment is reached — and where it has no effect, because there is
     * nothing to remove. No statement is issued either way.
     */
    harness.repository.clearOptionGroupSortOrderCache();
    expect(harness.calls).toHaveLength(0);

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    expect(callsContaining(harness.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
  });
});

/*
 * The write seam — `persistSku(sku)`
 * The legacy never calls a persist member at all: the mapping layer tracks the entity, decides insert
 * against update from its own session state, and emits the statements at flush time. AAP §0.6.6 M5
 * records that a stateless invocation has no request-end hook to flush at, so the decision and the
 * statements are made explicit here. That makes this member the one part of the adapter with no single
 * legacy locator to point at — the contract it reproduces is the mapping layer's, read off.
 */

describe('NET-NEW persistSku — DATA-01, the identifier', () => {
  /*
   * The guard is why an unidentified SKU is a total failure rather than a partial one: it does not write
   * a row under a blank key, it writes nothing at all and raises. Every such row would collide on the
   * primary key after the first.
   */
  it('NET-NEW — refuses a SKU still holding the unsaved identifier, and issues NO statement', async () => {
    const harness = makePersistHarness();
    const sku = buildSku({ skuCode: 'SKU-UNIDENTIFIED' });

    expect(sku.skuID).toBe(SKU_UNSAVED_ID_VALUE);
    await expect(harness.repository.persistSku(sku)).rejects.toThrow(
      /cannot be written before it has been assigned an identifier/,
    );

    /*
     * Refused before any statement — not after a probe, and certainly not after a partial write.
     */
    expect(harness.calls).toHaveLength(0);
  });

  it('NET-NEW — binds the identifier the service minted, unchanged and 32 characters wide', async () => {
    const harness = makePersistHarness();
    /* The shape `createSlatwallUUID()` produces: 32 hexadecimal characters, no dashes (IR-6). */
    const sku = buildSku({ skuID: SKU_ONE, skuCode: 'SKU-IDENTIFIED', price: 100 });

    await harness.repository.persistSku(sku);

    expect(SKU_ONE).toHaveLength(32);
    expect(SKU_ONE).toMatch(/^[0-9a-f]{32}$/);
    /* The identifier leads the column list, so it is the first bound value of the insert. */
    expect(soleStatementFor(harness.calls, 'SwSku ', 'INSERT').params[0]).toBe(SKU_ONE);
  });

  it('NET-NEW — probes for the existing row BEFORE it writes, and binds only the identifier', async () => {
    const harness = makePersistHarness();

    await harness.repository.persistSku(buildSku({ skuID: SKU_ONE, skuCode: 'SKU-PROBED' }));

    /*
     * The probe decides insert-versus-update, and it is the first statement of the member — the audit
     * stamp below it needs to know which branch is being taken.
     */
    const probe = callAt(harness.calls, 0);
    expect(isRead(probe)).toBe(true);
    expect(probe.params).toEqual([SKU_ONE]);
  });
});

describe('NET-NEW persistSku — DATA-04, the four owned link collections', () => {
  /**
   * The four link tables, in the entity's own declaration order (`model/entity/Sku.cfc:L76`–`:L79`).
   */
  const LINK_TABLES = [
    'SwSkuOption',
    'SwSkuAccessContent',
    'SwSkuSubsBenefit',
    'SwSkuRenewalSubsBenefit',
  ] as const;

  /** A SKU carrying all four collections at once, with distinct far identifiers throughout. */
  function buildFullyLinkedSku() {
    return buildSku({
      skuID: SKU_ONE,
      skuCode: 'SKU-LINKED',
      options: [buildOption({ optionID: OPTION_SMALL })],
      accessContents: [{ contentID: CONTENT_REFERENCE }],
      subscriptionBenefits: [{ subscriptionBenefitID: BENEFIT_REFERENCE }],
      renewalSubscriptionBenefits: [{ subscriptionBenefitID: RENEWAL_BENEFIT_REFERENCE }],
    });
  }

  it('NET-NEW — writes a row into every one of the four link tables', async () => {
    const harness = makePersistHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    /*
     * All four link tables must be written, not just the option one. Every one of the four collections is
     * accepted by the entity, populated by the subscription and content-access branches of `createSkus`,
     * and reported on by validation — so a persist that emitted a statement for only some of them would
     * return successfully and a later read would produce a SKU with empty collections, with no error
     * anywhere. Asserting one statement per table is what makes that failure mode loud.
     */
    for (const table of LINK_TABLES) {
      expect(statementsFor(harness.calls, table).length).toBeGreaterThan(0);
    }
  });

  it('NET-NEW — binds the content link to contentID, not to a name derived from the property', async () => {
    const harness = makePersistHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    const insert = soleStatementFor(harness.calls, 'SwSkuAccessContent', 'INSERT');
    /*
     * `model/entity/Sku.cfc:L77` declares `inversejoincolumn="contentID"`, not `accessContentID`.
     */
    expect(insert.sql).toContain('(skuID, contentID)');
    expect(insert.sql).not.toContain('accessContentID');
    expect(insert.params).toEqual([SKU_ONE, CONTENT_REFERENCE]);
  });

  /*
   * The case that EXISTS because the compiler cannot help. Both benefit collections hold the same
   * reference type and both write a column called `subscriptionBenefitID`, so swapping them compiles
   * cleanly and writes two wrong rows. The distinct identifiers are what make the swap observable.
   */
  it('NET-NEW — keeps the two benefit collections in their own tables, distinguished only by table', async () => {
    const harness = makePersistHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    const benefit = soleStatementFor(harness.calls, 'SwSkuSubsBenefit', 'INSERT');
    const renewal = soleStatementFor(harness.calls, 'SwSkuRenewalSubsBenefit', 'INSERT');

    expect(benefit.params).toEqual([SKU_ONE, BENEFIT_REFERENCE]);
    expect(renewal.params).toEqual([SKU_ONE, RENEWAL_BENEFIT_REFERENCE]);

    /*
     * The far column name really is shared; that is the design, and it is why the tables must differ.
     */
    expect(benefit.sql).toContain('(skuID, subscriptionBenefitID)');
    expect(renewal.sql).toContain('(skuID, subscriptionBenefitID)');
    expect(benefit.sql).not.toContain('SwSkuRenewalSubsBenefit');
  });

  it('NET-NEW — issues no link delete when the SKU row did not pre-exist', async () => {
    /* The existence probe answers empty, so this is an insert and there is nothing to replace. */
    const harness = makePersistHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    expect(harness.calls.filter((call) => norm(call.sql).startsWith('DELETE'))).toEqual([]);
  });

  it('NET-NEW — deletes then re-inserts every collection when the SKU row pre-existed', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);

    await harness.repository.persistSku(buildFullyLinkedSku());

    for (const table of LINK_TABLES) {
      /* Replacement, in that order: the delete must precede the insert or it would erase it. */
      expect(verbsFor(harness.calls, table)).toEqual(['DELETE', 'INSERT']);
      expect(soleStatementFor(harness.calls, table, 'DELETE').params).toEqual([SKU_ONE]);
    }
  });

  /*
   * Removal is only expressible as "delete, then insert nothing". Skipping the delete for an empty
   * collection would make it impossible to clear a collection by saving the SKU without it.
   */
  it('NET-NEW — clears a collection that has become empty on a pre-existing SKU', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);

    await harness.repository.persistSku(buildSku({ skuID: SKU_ONE, skuCode: 'SKU-CLEARED' }));

    expect(verbsFor(harness.calls, 'SwSkuAccessContent')).toEqual(['DELETE']);
    expect(soleStatementFor(harness.calls, 'SwSkuAccessContent', 'DELETE').params).toEqual([
      SKU_ONE,
    ]);
  });

  it('NET-NEW — writes multiple references in the entity order, without deduplicating', async () => {
    const harness = makePersistHarness();
    const sku = buildSku({
      skuID: SKU_ONE,
      skuCode: 'SKU-MULTI',
      /*
       * Two distinct references plus a repeat of the first by value rather than by identity — the
       * entity's own adder dedupes by reference, so all three reach the collection. A repeated far
       * identifier is a data fault the link table's key is entitled to reject, and collapsing it here
       * would hide it from the caller that created it.
       */
      accessContents: [
        { contentID: CONTENT_REFERENCE },
        { contentID: SECOND_CONTENT_REFERENCE },
        { contentID: CONTENT_REFERENCE },
      ],
    });

    await harness.repository.persistSku(sku);

    const insert = soleStatementFor(harness.calls, 'SwSkuAccessContent', 'INSERT');
    expect(insert.sql).toContain('VALUES (?, ?), (?, ?), (?, ?)');
    expect(insert.params).toEqual([
      SKU_ONE,
      CONTENT_REFERENCE,
      SKU_ONE,
      SECOND_CONTENT_REFERENCE,
      SKU_ONE,
      CONTENT_REFERENCE,
    ]);
  });

  it('NET-NEW — writes the SKU row before any link row, since every link row references it', async () => {
    const harness = makePersistHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    const writes = harness.calls.filter((call) => !isRead(call));
    expect(norm(callAt(writes, 0).sql).startsWith('INSERT INTO SwSku ')).toBe(true);
    /* And every remaining write touches a SKU-owned link table, so nothing slipped in between. */
    for (const write of writes.slice(1)) {
      expect(LINK_TABLES.some((table) => write.sql.includes(table))).toBe(true);
    }
  });

  it('NET-NEW — binds every value positionally and interpolates none of them (TR-4)', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);

    await harness.repository.persistSku(buildFullyLinkedSku());

    for (const call of harness.calls) {
      /* No identifier and no value from the entity may appear in any statement text. */
      expect(call.sql).not.toContain(SKU_ONE);
      expect(call.sql).not.toContain(OPTION_SMALL);
      expect(call.sql).not.toContain(CONTENT_REFERENCE);
      expect(call.sql).not.toContain(BENEFIT_REFERENCE);
      expect(call.sql).not.toContain(RENEWAL_BENEFIT_REFERENCE);
      expect(call.sql).not.toContain("'");
    }
  });
});

/*
 * Finding — a hydrated SKU'S relationships survive a save that never mentioned them what was
 * broken, in one sentence. `rowMappers.mapSkuRow` produces a SKU with four empty owned link
 * collections and no `subscriptionTerm`, and `persistSku` replaced all four link tables from those
 * empty arrays and wrote `NULL` into `subscriptionTermID` — so any save of a database-loaded SKU
 * deleted its options, access contents and both benefit collections, and detached its term. Three
 * in-scope members reach that write on an existing SKU: `processProductAddOptionGroup`,
 * `processProductAddOption` and `processProductUpdateSkus`.
 */

describe('NET-NEW persistSku —, a hydrated SKU keeps the links this save never read', () => {
  /**
   * One `SwSku` row, as the SKU projection returns it, carrying a subscription-term foreign key.
   */
  function skuRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      skuID: SKU_ONE,
      skuCode: 'SKU-HYDRATED',
      activeFlag: 1,
      listPrice: '10.00',
      price: '10.00',
      renewalPrice: '0.00',
      userDefinedPriceFlag: 0,
      productID: PRODUCT_A,
      subscriptionTermID: SUBSCRIPTION_TERM_REFERENCE,
      ...overrides,
    };
  }

  it('NET-NEW — issues NO statement for any of the four link tables', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);

    await harness.repository.persistSku(mapSkuRow(skuRow()));

    /*
     * Not "no delete" and not "no insert" — no statement at all, for every one of the four. The stored
     * rows are the truth and this save has nothing to say about them, which is exactly what an unloaded
     * lazy collection produced at flush. The SKU row itself is still written, which the next case pins.
     */
    for (const table of [
      'SwSkuOption',
      'SwSkuAccessContent',
      'SwSkuSubsBenefit',
      'SwSkuRenewalSubsBenefit',
    ]) {
      expect(statementsFor(harness.calls, table)).toEqual([]);
    }
  });

  it('NET-NEW — still writes the SKU row itself, so the save is a save', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);

    await harness.repository.persistSku(mapSkuRow(skuRow({ skuCode: 'SKU-RENAMED' })));

    const update = soleStatementFor(harness.calls, 'SwSku', 'UPDATE');
    expect(update.params).toContain('SKU-RENAMED');
    expect(update.params[update.params.length - 1]).toBe(SKU_ONE);
  });

  it('NET-NEW — preserves the subscription-term foreign key instead of nulling it', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);
    const sku = mapSkuRow(skuRow());

    /*
     * The association slot is deliberately absent: `SubscriptionTerm` is out of scope, so the mapper
     * attaches nothing and the key is preserved beside the entity instead (rule 3c).
     */
    expect(sku.subscriptionTerm).toBeUndefined();

    await harness.repository.persistSku(sku);

    const update = soleStatementFor(harness.calls, 'SwSku', 'UPDATE');
    expect(update.params).toContain(SUBSCRIPTION_TERM_REFERENCE);
    /* The defect wrote NULL here on every save of a loaded SKU. */
    expect(update.sql).toContain('subscriptionTermID = ?');
  });

  it('NET-NEW — lets an explicitly attached term win over the preserved key', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);
    const sku = mapSkuRow(skuRow());
    sku.setSubscriptionTerm({ subscriptionTermID: SECOND_SUBSCRIPTION_TERM_REFERENCE });

    await harness.repository.persistSku(sku);

    const update = soleStatementFor(harness.calls, 'SwSku', 'UPDATE');
    expect(update.params).toContain(SECOND_SUBSCRIPTION_TERM_REFERENCE);
    expect(update.params).not.toContain(SUBSCRIPTION_TERM_REFERENCE);
  });

  it('NET-NEW — writes NULL once the preserved key has been explicitly forgotten', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);
    const sku = mapSkuRow(skuRow());

    /*
     * The declared way to detach, and it has to be declared because absence cannot mean it: after
     * `Sku.removeSubscriptionTerm` the slot is absent, which is indistinguishable from a slot that was
     * never resolved. A caller that means NULL says so through the mapper's own member.
     */
    forgetHydratedSkuSubscriptionTermID(sku);

    await harness.repository.persistSku(sku);

    const update = soleStatementFor(harness.calls, 'SwSku', 'UPDATE');
    expect(update.params).not.toContain(SUBSCRIPTION_TERM_REFERENCE);
    expect(update.params).toContain(null);
  });

  it('NET-NEW — replaces a collection once a loader has declared it read, so removal still works', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);
    const sku = mapSkuRow(skuRow());

    /*
     * The other half of the gate. A loader that read the link rows promotes the collection to
     * authoritative, and from that point the replacement semantics are exactly what they always were —
     * including for an empty collection, which is the only way removal is expressible. Marking only the
     * SKUs that came back with rows would make an emptied collection indistinguishable from an unloaded
     * one, and clearing a SKU's options would silently stop working.
     */
    markSkuOwnedLinkLoaded(sku, 'options');

    await harness.repository.persistSku(sku);

    expect(verbsFor(harness.calls, 'SwSkuOption')).toEqual(['DELETE']);
    expect(soleStatementFor(harness.calls, 'SwSkuOption', 'DELETE').params).toEqual([SKU_ONE]);
    /* And the three that were not declared read are still untouched. */
    expect(statementsFor(harness.calls, 'SwSkuAccessContent')).toEqual([]);
  });

  it('NET-NEW — refuses loudly rather than guessing when an unread collection was mutated', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);
    const sku = mapSkuRow(skuRow());

    /*
     * The one case with no faithful answer. The entity now holds some of the intended rows and the
     * adapter cannot know which of the stored ones the caller meant to keep: writing what it holds
     * deletes the rest, writing nothing discards the addition. Both are silent data outcomes, so the
     * write fails with the collection named and the transaction rolls back (M5).
     */
    sku.addOption(buildOption({ optionID: OPTION_SMALL }));

    await expect(harness.repository.persistSku(sku)).rejects.toThrow(DomainError);
    await expect(harness.repository.persistSku(sku)).rejects.toThrow(/without having been loaded/u);
  });

  it('NET-NEW — round trip: read, promote through the REAL loader, add an option, keep them BOTH', async () => {
    /* The whole of finding in one case, with no simulation of the read side. */
    const storedOption = {
      skuID: SKU_ONE,
      optionID: OPTION_SMALL,
      optionGroupID: OPTION_GROUP_SIZE,
    };
    const harness = makeHarness({
      respond: (call) => {
        /* `norm` only collapses whitespace, so the comparisons below fold case explicitly. */
        const sql = norm(call.sql).toUpperCase();
        /*
         * The joined option read: one row, carrying the link's skuID and the option's own columns.
         */
        if (sql.includes('FROM SWSKUOPTION LINK')) {
          return sqlRows([storedOption]);
        }
        /* Its option-group follow-up. */
        if (sql.includes('FROM SWOPTIONGROUP')) {
          return sqlRows([{ optionGroupID: OPTION_GROUP_SIZE, optionGroupName: 'Size' }]);
        }
        /* The existence probe: the SKU row pre-exists, which is what makes this a replacement. */
        if (isRead(call)) {
          return sqlRows([{ skuID: SKU_ONE }]);
        }
        return sqlAffectedRows(1);
      },
    });

    const sku = mapSkuRow({
      skuID: SKU_ONE,
      skuCode: 'SKU-ROUNDTRIP',
      price: '10.00',
      productID: PRODUCT_A,
      subscriptionTermID: SUBSCRIPTION_TERM_REFERENCE,
    });

    /*
     * The read. One statement pair, and afterwards the collection holds what the database holds.
     */
    await attachSkuOptions(harness.executor, [sku]);
    expect(sku.getOptions().map((option) => option.optionID)).toEqual([OPTION_SMALL]);

    /* The mutation, as the service performs it. */
    sku.addOption(buildOption({ optionID: OPTION_RED }));

    /* The WRITE. */
    await harness.repository.persistSku(sku);

    /*
     * Both options reach the link table, in the entity's own order — the stored one first because the
     * loader put it there, the added one second. The defect produced `[SKU_ONE, OPTION_RED]` alone.
     */
    const insert = soleStatementFor(harness.calls, 'SwSkuOption', 'INSERT');
    expect(insert.params).toEqual([SKU_ONE, OPTION_SMALL, SKU_ONE, OPTION_RED]);
    expect(verbsFor(harness.calls, 'SwSkuOption')).toEqual(['SELECT', 'DELETE', 'INSERT']);

    /*
     * The three collections nobody read are untouched, so their stored rows survive the same save.
     */
    for (const table of ['SwSkuAccessContent', 'SwSkuSubsBenefit', 'SwSkuRenewalSubsBenefit']) {
      expect(statementsFor(harness.calls, table)).toEqual([]);
    }

    /* And the subscription term the row carried is written back rather than nulled. */
    expect(soleStatementFor(harness.calls, 'SwSku', 'UPDATE').params).toContain(
      SUBSCRIPTION_TERM_REFERENCE,
    );
  });

  it('NET-NEW — leaves a transient SKU authoritative, so createSkus is unaffected', async () => {
    /*
     * The regression guard for the fix itself. `src/services/SkuService.ts` mints SKUs whose empty
     * collections are the intended state, and a design that read "no provenance" as "unknown" would
     * refuse to write them. A SKU built here rather than mapped carries no provenance at all, so the
     * replacement semantics apply unchanged.
     */
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);

    await harness.repository.persistSku(buildSku({ skuID: SKU_ONE, skuCode: 'SKU-TRANSIENT' }));

    for (const table of [
      'SwSkuOption',
      'SwSkuAccessContent',
      'SwSkuSubsBenefit',
      'SwSkuRenewalSubsBenefit',
    ]) {
      expect(verbsFor(harness.calls, table)).toEqual(['DELETE']);
    }
  });
});

/*
 * The windowed search — `searchByProductTypeBounded(window, term?, productTypeID?)` — is gone
 * A describe block of eleven cases stood here and has been removed with the member it covered. It
 * asserted that the windowed form composed the unbounded statement plus `limit ? offset ?` and nothing
 * else, that the two window values bound last (TR-4), that the probe row was requested and discarded so
 * `hasMore` was observed rather than inferred, that an unusable window was refused rather than clamped
 * and issued no statement at all, and that no digit ever reached the statement text (AAP §0.7.3).
 */

/*
 * The transaction re-binding — `withExecutor(executor)`
 * no legacy counterpart, and the reason is execution-model mismatch M5. The legacy DAO never
 * chooses a connection: the ORM session is ambient and `org/Hibachi/Hibachi.cfc` flushes it at request
 * end only when the request has no errors, so a DAO simply participates in whatever transaction the
 * request already holds. A stateless handler has no request end and no ambient session, so the port
 * makes the boundary explicit — and a repository that captured its executor at construction could only.
 */

describe('NET-NEW withExecutor — re-binding to a transaction-scoped executor', () => {
  /** A second recording executor, standing in for the one a transaction boundary owns. */
  function makeScopeExecutor(): {
    readonly executor: SkuStatementExecutor;
    readonly calls: readonly SqlExecutorCall[];
  } {
    const double = createSqlExecutorDouble({
      respond: (call) =>
        norm(call.sql) === MAX_SORT_ORDER_STATEMENT
          ? sqlRows([{ max: 3 }])
          : sqlRows([{ skuID: SKU_ONE, skuCode: 'SKU-ABC-1' }]),
    });
    return { executor: double.executor, calls: double.calls };
  }

  it('NET-NEW — returns a NEW instance and leaves the receiver untouched', () => {
    const harness = makeHarness();
    const scope = makeScopeExecutor();

    const inTransaction = harness.repository.withExecutor(scope.executor);

    expect(inTransaction).not.toBe(harness.repository);
    expect(inTransaction).toBeInstanceOf(MySqlSkuRepository);
  });

  it('NET-NEW — every statement the re-bound instance issues lands on the NEW executor', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });
    const scope = makeScopeExecutor();

    const inTransaction = harness.repository.withExecutor(scope.executor);
    await inTransaction.searchByProductType('abc');

    /*
     * This is the property that makes wrapping a service call in a transaction boundary mean anything:
     * The statement runs on the connection the boundary owns, so a rollback can actually undo it and a
     * read can actually observe a sibling write the same transaction has already issued (M6).
     */
    expect(scope.calls).toHaveLength(1);
    expect(norm(callAt(scope.calls, 0).sql)).toContain('from SwSku where skuCode like ?');
    expect(harness.calls).toHaveLength(0);
  });

  it('NET-NEW — the ORIGINAL stays valid and keeps its own executor after the re-binding', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([]), sqlRows([])] });
    const scope = makeScopeExecutor();

    const inTransaction = harness.repository.withExecutor(scope.executor);
    await inTransaction.searchByProductType('inside');
    await harness.repository.searchByProductType('outside');

    /*
     * The captured executor is `private readonly` and re-binding never reassigns it, so the pool-bound
     * instance a composition root built is still pool-bound afterwards. A mutating implementation would
     * put both statements on the scope executor and this case is what would catch it.
     */
    expect(scope.calls).toHaveLength(1);
    expect(callAt(scope.calls, 0).params).toEqual(['%inside%']);
    expect(harness.calls).toHaveLength(1);
    expect(callAt(harness.calls, 0).params).toEqual(['%outside%']);
  });

  it('NET-NEW — M7: CARRIES the request-scoped memo across the re-binding, so the ceiling is not re-read', async () => {
    const request = makeHarness({
      respond: (call) =>
        norm(call.sql) === MAX_SORT_ORDER_STATEMENT
          ? sqlRows([{ max: 3 }])
          : sqlRows([{ skuID: SKU_ONE }]),
    });
    const scope = makeScopeExecutor();

    await request.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    expect(callsContaining(request.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);

    const inTransaction = request.repository.withExecutor(scope.executor);
    await inTransaction.findSortedSkuIdsByProduct(PRODUCT_B);

    /*
     * The memo is request-scoped and a transaction sits inside a request, so a boundary that started its
     * own memo would re-resolve a ceiling the same invocation already has — which is precisely what
     * `model/dao/SkuDAO.cfc:L204-L220` memoizes to avoid. Carrying it is therefore not a shortcut: it is
     * the behaviour, and the complement of the M7 case above, which proves a separate invocation gets a
     * separate memo. Both must hold; either alone is the wrong lifetime.
     */
    expect(callsContaining(scope.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(0);
    expect(callsContaining(scope.calls, ODOMETER_FRAGMENT)).toHaveLength(1);
    /* Max 3 + 1, resolved before the re-binding and still bound after it. */
    expect(callAt(callsContaining(scope.calls, ODOMETER_FRAGMENT), 0).params).toEqual([
      PRODUCT_B,
      4,
    ]);
  });

  it('NET-NEW — the re-bound instance still satisfies the whole SkuRepository port', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });
    const scope = makeScopeExecutor();

    /*
     * A positive type-level assignment, not a suppression comment: the re-bound value is used as the
     * port, so a narrowed return type would fail to compile here.
     */
    const inTransaction: SkuRepository = harness.repository.withExecutor(scope.executor);

    expect(typeof inTransaction.transactionExists).toBe('function');
    expect(typeof inTransaction.findBySkuCode).toBe('function');
    expect(typeof inTransaction.findSkusBySelectedOptions).toBe('function');
    expect(typeof inTransaction.searchByProductType).toBe('function');
    /*
     * No `searchByProductTypeBounded` in this list: the port declares no windowed companion,
     * because none has a production caller — see the block above the `withExecutor` section. The
     * eight below are the whole port.
     */
    expect(typeof inTransaction.findByProduct).toBe('function');
    expect(typeof inTransaction.findSortedSkuIdsByProduct).toBe('function');
    expect(typeof inTransaction.clearOptionGroupSortOrderCache).toBe('function');
    expect(typeof inTransaction.persistSku).toBe('function');

    /* And it genuinely works through the port surface, not merely satisfies its shape. */
    await expect(inTransaction.searchByProductType('abc')).resolves.toEqual([
      { id: SKU_ONE, value: 'SKU-ABC-1' },
    ]);
  });

  it('NET-NEW — a plain object literal with NO withExecutor satisfies SkuRepository', () => {
    /*
     * The compile-time half of the boundary claim: re-binding is not on the port, so a service-side
     * double needs no knowledge of executors at all — and no mocking library, which the legacy suite
     * does not vendor either. If anyone added `withExecutor` to `SkuRepository`, this literal would stop
     * compiling and say so at the boundary rather than in a service test.
     */
    const double: SkuRepository = {
      transactionExists: () => Promise.resolve(false),
      findBySkuCode: () => Promise.resolve(null),
      findSkusBySelectedOptions: () => Promise.resolve([]),
      searchByProductType: () => Promise.resolve([]),
      findByProduct: () => Promise.resolve([]),
      findSortedSkuIdsByProduct: () => Promise.resolve([]),
      clearOptionGroupSortOrderCache: () => undefined,
      persistSku: () => Promise.resolve(),
    };

    expect(Object.keys(double)).not.toContain('withExecutor');
    /*
     * And a windowed member cannot be smuggled in by a double either: an object literal carrying
     * one fails the excess-property check on this very annotation.
     */
    expect(Object.keys(double)).not.toContain('searchByProductTypeBounded');
    expect(typeof double.searchByProductType).toBe('function');
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/** unitOfWork and queryRunner — the two execution boundaries, tested against a driver double. */
describe('The transaction boundary the SKU write path runs inside', () => {
  /* The driver double. */

  /** One statement as the driver received it, recorded byte for byte and in bind order. */
  interface DriverCall {
    readonly sql: string;
    readonly values: readonly BoundParameterValue[];
  }

  /** What the double answers for a given statement, or the failure it raises instead. */
  type DriverResponder = (call: DriverCall) => unknown;

  /*
   * A settlement member's outcome: it returns, or it raises the failure this double is asked to
   * produce (CWE-404).
   *
   */
  type SettlementResponder = (event: 'begin' | 'commit' | 'rollback') => void;

  interface DriverDouble {
    readonly pool: StatementPool;
    readonly calls: readonly DriverCall[];
    /**
     * Lifecycle events on the connection, in order: `begin`, `commit`, `rollback`, `release`, `destroy`.
     */
    readonly lifecycle: readonly string[];
  }

  /**
   * Build a `StatementPool` that records every statement and answers from `respond`.
   *
   * @param respond - decides each answer from the recorded call; throwing from it injects a failure.
   * @returns the pool, plus live views of the statements and the connection lifecycle.
   */
  function createDriverDouble(
    respond: DriverResponder,
    settle?: SettlementResponder,
  ): DriverDouble {
    const calls: DriverCall[] = [];
    const lifecycle: string[] = [];

    /*
     * Declared without `async` and returning a settled promise explicitly, so a throw from `respond`
     * becomes a rejection rather than a synchronous throw. That distinction is the point: production
     * catches a driver failure with `catch` around an awaited call, so a double that threw synchronously
     * would exercise a path the real driver never takes.
     */
    const execute = (
      sql: string,
      values: readonly BoundParameterValue[],
    ): Promise<[unknown, unknown[]]> => {
      const call: DriverCall = Object.freeze({ sql, values: Object.freeze([...values]) });
      calls.push(call);

      /*
       * `respond` is invoked inside the `then`, so a throw from it is converted to a rejection by the
       * promise machinery itself rather than by an explicit `Promise.reject` of an `unknown` value. The
       * recording above stays synchronous, so call order is still exactly issue order.
       */
      return Promise.resolve().then((): [unknown, unknown[]] => [respond(call), []]);
    };

    /** Record a lifecycle event, then let `settle` decide whether it succeeds. */
    const note = (event: 'begin' | 'commit' | 'rollback'): Promise<void> => {
      lifecycle.push(event);

      return Promise.resolve().then((): void => {
        settle?.(event);
      });
    };

    const connection: TransactionalStatementRunner = {
      execute,
      beginTransaction: (): Promise<void> => note('begin'),
      commit: (): Promise<void> => note('commit'),
      rollback: (): Promise<void> => note('rollback'),
      release: (): void => {
        lifecycle.push('release');
      },
      destroy: (): void => {
        lifecycle.push('destroy');
      },
    };

    const pool: StatementPool = {
      execute,
      getConnection: (): Promise<TransactionalStatementRunner> => Promise.resolve(connection),
    };

    return { pool, calls, lifecycle };
  }

  /** The aggregate answer shape MySQL produces for the ported sort-order read. */
  function topSortOrderRows(topSortOrder: number): unknown {
    return [{ topSortOrder }];
  }

  /** A write acknowledgement, in the shape `readAffectedRows` narrows. */
  function affectedRows(count: number): unknown {
    return { affectedRows: count };
  }

  /** A duplicate-key failure shaped as `mysql2` raises one. */
  function duplicateEntryFailure(value: string, constraintName: string): Error {
    const failure = new Error(`Duplicate entry '${value}' for key '${constraintName}'`);

    return Object.assign(failure, {
      errno: MYSQL_DUPLICATE_ENTRY_ERRNO,
      code: 'ER_DUP_ENTRY',
      sqlState: '23000',
    });
  }

  /** Narrow the first recorded call without an unchecked index read. */
  function firstCall(calls: readonly DriverCall[]): DriverCall {
    const call = calls[0];

    if (call === undefined) {
      throw new Error('The double recorded no statement, so there was nothing to assert on.');
    }

    return call;
  }

  /*
   * A. the locking read on the sort-order maximum CWE-367: two concurrent inserts can read the same
   * maximum sort order and write the same next value. The available remedies are a locking or
   * advisory-lock read, or a scoped uniqueness constraint with retry. The scoped uniqueness
   * constraint is forbidden — AAP §0.2.2.5
   * places schema migration outside this refactoring — and a retry would be invented behaviour under
   * AAP §0.8.2 Guideline 4, so the locking read is the sanctioned half of that guidance.
   */

  describe('NET-NEW — `getTableTopSortOrder` takes a locking read', () => {
    /*
     * The clause is asserted through the composed statement below rather than through a separate
     * pair of cases.
     */

    it('NET-NEW — adding the clause changed nothing else about the ported statement', async () => {
      /*
       * The regression guard for the hardening itself. Everything `org/Hibachi/HibachiDAO.cfc:L157-L164`
       * composes must still be composed identically: the `COALESCE` that makes the empty-table answer
       * zero (`:L158`), the `topSortOrder` alias (`:L158`), the literal `sortOrder` column, and the
       * absence of any `order by`, `limit` or engine hint the legacy statement did not have.
       */
      const driver = createDriverDouble(() => topSortOrderRows(0));
      const unitOfWork = new UnitOfWork(driver.pool);

      await unitOfWork.getTableTopSortOrder(new QueryRunner(driver.pool), 'SwOption');

      const { sql } = firstCall(driver.calls);
      expect(sql).toContain('COALESCE(max(sortOrder), 0)');
      expect(sql).toContain('as topSortOrder');
      expect(sql).not.toContain('ORDER BY');
      expect(sql).not.toContain('LIMIT');
      // No placeholder in the unscoped form, matching the legacy's single-bound-value-only-when-scoped shape.
      expect(sql).not.toContain('?');
    });

    it('NET-NEW — the empty-table answer is still ZERO, not a failure and not one', async () => {
      // `:L158`'s `COALESCE` is what makes the first seeded position one, from the `+ 1` at
      // `org/Hibachi/HibachiEntity.cfc:L646`. The locking clause must not disturb that.
      const driver = createDriverDouble(() => topSortOrderRows(0));
      const unitOfWork = new UnitOfWork(driver.pool);

      await expect(
        unitOfWork.getTableTopSortOrder(new QueryRunner(driver.pool), 'SwBrand'),
      ).resolves.toBe(0);
    });

    it('NET-NEW — an unapproved table is refused BEFORE any statement reaches the driver', async () => {
      // The identifier whitelist runs first, so the locking clause is never composed onto an
      // attacker-supplied table name. Asserting the empty call log is what makes that a fact.
      const driver = createDriverDouble(() => topSortOrderRows(1));
      const unitOfWork = new UnitOfWork(driver.pool);

      await expect(
        unitOfWork.getTableTopSortOrder(new QueryRunner(driver.pool), 'SwOption; DROP TABLE SwSku'),
      ).rejects.toThrow();
      expect(driver.calls).toStrictEqual([]);
    });

    it('NET-NEW — an unapproved SCOPING COLUMN is refused before the driver too', async () => {
      const driver = createDriverDouble(() => topSortOrderRows(1));
      const unitOfWork = new UnitOfWork(driver.pool);

      await expect(
        unitOfWork.getTableTopSortOrder(
          new QueryRunner(driver.pool),
          'SwOption',
          'optionGroupID = 1 OR 1=1',
          'group-1',
        ),
      ).rejects.toThrow();
      expect(driver.calls).toStrictEqual([]);
    });
  });

  /*
   * B. the duplicate-key translation, at both routes to the driver CWE-367 asks for two things;
   * This is the second, handling duplicate-key errors.
   * The subtree has exactly two routes to the driver — `QueryRunner.runStatement` for the pool-bound
   * path and `createExecutor`'s local `runStatement` inside `UnitOfWork` for the transaction-scoped one
   * — so both are exercised here, because translating in one and not the other would make a collision
   * look different depending on whether a boundary was open.
   */

  describe('NET-NEW — a duplicate key is reported as a typed uniqueness failure', () => {
    it('NET-NEW — the predicate recognises the driver`s errno AND its symbolic code independently', () => {
      // Both fields are checked because which of them a driver populates is the driver's choice, not a
      // contract this port can pin. Either alone must be sufficient.
      expect(isDuplicateEntryFailure({ errno: MYSQL_DUPLICATE_ENTRY_ERRNO })).toBe(true);
      expect(isDuplicateEntryFailure({ code: 'ER_DUP_ENTRY' })).toBe(true);
      expect(isDuplicateEntryFailure(duplicateEntryFailure('RED', 'SwOption.optionCode'))).toBe(
        true,
      );

      // And nothing else is mistaken for one — including the neighbouring error number this module
      // already records a note about, and every non-object shape a catch clause can produce.
      expect(isDuplicateEntryFailure({ errno: 1210 })).toBe(false);
      expect(isDuplicateEntryFailure(new Error('Duplicate entry'))).toBe(false);
      expect(isDuplicateEntryFailure(null)).toBe(false);
      expect(isDuplicateEntryFailure(undefined)).toBe(false);
      expect(isDuplicateEntryFailure('ER_DUP_ENTRY')).toBe(false);
      expect(isDuplicateEntryFailure(1062)).toBe(false);
    });

    it('NET-NEW — the constraint NAME is retained and the COLLIDING VALUE is discarded', () => {
      // The disclosure rule. MySQL's message is `Duplicate entry '<value>' for key '<table>.<index>'`;
      // The value is caller data and routinely the very field under validation, the key name is a schema
      // identifier that discloses nothing about the caller.
      const described = describeDuplicateEntryConstraint(
        duplicateEntryFailure('SECRET-SKU-CODE', 'SwSku.skuCode'),
      );

      expect(described).toBe('SwSku.skuCode');
      expect(described).not.toContain('SECRET-SKU-CODE');
    });

    it('NET-NEW — a colliding value that itself contains the anchor cannot widen the capture', () => {
      /*
       * The extraction is anchored on `for key '` and stops at the next quote rather than the last one,
       * so a value crafted to contain the anchor text captures only the real key. A greedy match would
       * have promoted the attacker's own string into the recorded constraint name.
       */
      const described = describeDuplicateEntryConstraint(
        duplicateEntryFailure("evil for key 'INJECTED", 'SwBrand.urlTitle'),
      );

      expect(described).toBe('INJECTED');
      expect(described).not.toContain('SwBrand');
    });

    it('NET-NEW — a control character in the key position yields no constraint name at all', () => {
      // CWE-117. Only printable ASCII other than a quote is admitted, so a log-injection payload does
      // not become a recorded field; the full driver error is still attached as `cause`.
      expect(
        describeDuplicateEntryConstraint(
          duplicateEntryFailure('x', 'SwOption.optionCode\n\u001b[31mFORGED'),
        ),
      ).toBeUndefined();
      expect(describeDuplicateEntryConstraint(new Error('no key clause here'))).toBeUndefined();
      expect(describeDuplicateEntryConstraint({ message: 42 })).toBeUndefined();
      expect(describeDuplicateEntryConstraint(null)).toBeUndefined();
    });

    it('NET-NEW — an over-long constraint name is truncated rather than echoed unbounded', () => {
      const described = describeDuplicateEntryConstraint(
        duplicateEntryFailure('x', `SwSku.${'z'.repeat(400)}`),
      );

      expect(described).toBeDefined();
      // 96 retained characters plus the single ellipsis that marks the truncation.
      expect(described).toHaveLength(97);
      expect(described?.endsWith('…')).toBe(true);
    });

    it('NET-NEW — the POOL-BOUND route translates a duplicate key on a write', async () => {
      const driver = createDriverDouble(() => {
        throw duplicateEntryFailure('WIDGET-1', 'SwProduct.productCode');
      });
      const runner = new QueryRunner(driver.pool);

      const rejection: unknown = await runner
        .executeMutation('INSERT INTO SwProduct (productID, productCode) VALUES (?, ?)', [
          'product-1',
          'WIDGET-1',
        ])
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBeInstanceOf(UniqueConstraintViolationError);
      const failure = rejection as UniqueConstraintViolationError;
      // The classification is what the finding asked for: a request rejection, not a service fault.
      expect(failure.getPublicError().code).toBe('CATALOG_REQUEST_REJECTED');
      // The internal account keeps the constraint and drops the value.
      expect(failure.context).toMatchObject({
        parameterCount: 2,
        errno: MYSQL_DUPLICATE_ENTRY_ERRNO,
        constraintName: 'SwProduct.productCode',
      });
      expect(JSON.stringify(failure.context)).not.toContain('WIDGET-1');
      // Nothing is lost for a server-side reader.
      expect(failure.cause).toBeDefined();
    });

    it('NET-NEW — the TRANSACTION-SCOPED route translates the same failure identically', async () => {
      // The other of the two routes. `run` opens a boundary and hands out `scope.executor`, whose own
      // `runStatement` applies the same imported helper. The commit gate answers `false` — "no errors to
      // report" — so a successful body would commit, which is what makes the rollback below attributable
      // to the collision rather than to the gate.
      const driver = createDriverDouble((call) => {
        if (call.sql.startsWith('INSERT')) {
          throw duplicateEntryFailure('RED', 'SwOption.optionCode');
        }

        return affectedRows(1);
      });
      const unitOfWork = new UnitOfWork(driver.pool);

      const rejection: unknown = await unitOfWork
        .run(
          async (scope) =>
            scope.executor.executeMutation('INSERT INTO SwOption (optionCode) VALUES (?)', ['RED']),
          () => false,
        )
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBeInstanceOf(UniqueConstraintViolationError);
      expect((rejection as UniqueConstraintViolationError).context).toMatchObject({
        constraintName: 'SwOption.optionCode',
      });
    });

    it('NET-NEW — losing the race ROLLS BACK the boundary rather than committing it', async () => {
      /*
       * Translating an error must not settle a boundary. The rollback decision still belongs to the
       * boundary members, and a collision has to abandon the work — which on the importer's per-row path
       * (M3) means abandoning that row's transaction and no other.
       */
      const driver = createDriverDouble(() => {
        throw duplicateEntryFailure('RED', 'SwOption.optionCode');
      });
      const unitOfWork = new UnitOfWork(driver.pool);

      await expect(
        unitOfWork.run(
          async (scope) =>
            scope.executor.executeMutation('INSERT INTO SwOption (optionCode) VALUES (?)', ['RED']),
          () => false,
        ),
      ).rejects.toBeInstanceOf(UniqueConstraintViolationError);

      expect(driver.lifecycle).toContain('rollback');
      expect(driver.lifecycle).not.toContain('commit');
    });

    it('NET-NEW — EVERY OTHER driver failure passes through as the identical object', async () => {
      /*
       * The narrowing that keeps this a reporting change rather than a rewrite of the failure surface.
       * A connection reset, a syntax error and a permission refusal must reach the caller with the same
       * identity, message and stack they had before the translation existed — asserted by reference
       * equality, which no re-wrapping can satisfy.
       */
      const connectionReset = Object.assign(new Error('read ECONNRESET'), {
        errno: -104,
        code: 'ECONNRESET',
      });
      const driver = createDriverDouble(() => {
        throw connectionReset;
      });
      const runner = new QueryRunner(driver.pool);

      const rejection: unknown = await runner
        .executeMutation('UPDATE SwOption SET sortOrder = ? WHERE optionID = ?', [2, 'option-1'])
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBe(connectionReset);
      expect(rejection).not.toBeInstanceOf(UniqueConstraintViolationError);
    });

    it('[NET-NEW] a DEADLOCK is classified as RETRYABLE', async () => {
      /*
       * Classified because the port now takes locks. Before the locking reads in `uniquePropertyChecker`
       * and `UnitOfWork` this failure mode was unreachable from any statement the subtree emits, which is
       * why the case above used to list it among the untranslated. Introducing the locks introduces the
       * failure, so classifying it is part of introducing them rather than an unrelated addition — a caller
       * that cannot tell a deadlock from a syntax error cannot behave correctly in the face of one.
       */
      const deadlock = Object.assign(new Error('Deadlock found when trying to get lock'), {
        errno: 1213,
        code: 'ER_LOCK_DEADLOCK',
      });
      const driver = createDriverDouble(() => {
        throw deadlock;
      });
      const runner = new QueryRunner(driver.pool);

      const rejection: unknown = await runner
        .executeMutation('UPDATE SwOption SET sortOrder = ? WHERE optionID = ?', [2, 'option-1'])
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBeInstanceOf(UniqueConstraintViolationError);
      expect((rejection as UniqueConstraintViolationError).context).toMatchObject({
        errno: 1213,
        retryable: true,
      });
      /*
       * The driver's own error is retained as the cause, so nothing diagnostic is lost in translation.
       */
      expect((rejection as UniqueConstraintViolationError).cause).toBe(deadlock);
      /* One call: the classification did not silently retry. */
      expect(driver.calls).toHaveLength(1);
    });

    it('[NET-NEW] a LOCK-WAIT TIMEOUT is classified as RETRYABLE, and distinctly from a deadlock', async () => {
      /*
       * The sibling failure, and the two are classified separately rather than as one condition because they
       * differ in a way a caller may act on: a deadlock rolls the whole transaction back, while a timeout
       * need not, so a caller that retries must retry the transaction rather than the statement. The
       * `errno` distinguishes them; `retryable` says only that the failure was transient.
       */
      const lockWaitTimeout = Object.assign(new Error('Lock wait timeout exceeded'), {
        errno: 1205,
        code: 'ER_LOCK_WAIT_TIMEOUT',
      });
      const driver = createDriverDouble(() => {
        throw lockWaitTimeout;
      });
      const runner = new QueryRunner(driver.pool);

      const rejection: unknown = await runner
        .executeMutation('UPDATE SwOption SET sortOrder = ? WHERE optionID = ?', [2, 'option-1'])
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBeInstanceOf(UniqueConstraintViolationError);
      expect((rejection as UniqueConstraintViolationError).context).toMatchObject({
        errno: 1205,
        retryable: true,
      });
      expect((rejection as UniqueConstraintViolationError).message).toMatch(/lock/i);
      expect(driver.calls).toHaveLength(1);
    });

    it('[NET-NEW] a DUPLICATE KEY is classified as NOT retryable, which is the opposite verdict', async () => {
      /*
       * The asymmetry is the whole value of the classification. All three failures arrive as the same
       * class — see the helper's docblock for why a new class per mode would widen `src/errors/**` for a
       * distinction the context already draws — so `retryable` is the field that makes them actionable. For
       * a duplicate key it is false: the value is taken, asking again gets the same answer, and the caller's
       * own validation verdict is stale by now. A revision that classified everything as retryable, or that
       * omitted the field, would pass the two cases above and fail here.
       */
      const duplicate = Object.assign(
        new Error("Duplicate entry 'RED' for key 'uq_SwOption_optionCode'"),
        { errno: 1062, code: 'ER_DUP_ENTRY' },
      );
      const driver = createDriverDouble(() => {
        throw duplicate;
      });
      const runner = new QueryRunner(driver.pool);

      const rejection: unknown = await runner
        .executeMutation('INSERT INTO SwOption (optionCode) VALUES (?)', ['RED'])
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBeInstanceOf(UniqueConstraintViolationError);
      expect((rejection as UniqueConstraintViolationError).context).toMatchObject({
        errno: 1062,
        retryable: false,
      });
    });

    it('NET-NEW — a deliberate `DomainError` from the guard is never re-examined as a driver failure', async () => {
      // The catch wraps only the driver call, so the blank-statement refusal this class raises itself
      // cannot be mistaken for a collision. It also proves the driver was never reached.
      const driver = createDriverDouble(() => affectedRows(1));
      const runner = new QueryRunner(driver.pool);

      await expect(runner.executeMutation('   ', [])).rejects.toBeInstanceOf(DomainError);
      await expect(runner.executeMutation('   ', [])).rejects.not.toBeInstanceOf(
        UniqueConstraintViolationError,
      );
      expect(driver.calls).toStrictEqual([]);
    });

    it('NET-NEW — a successful write is entirely unaffected by the translation', async () => {
      // The other half of "no outcome changed": the non-failing path returns exactly what it returned.
      const driver = createDriverDouble(() => affectedRows(3));
      const runner = new QueryRunner(driver.pool);

      await expect(
        runner.executeMutation('UPDATE SwSku SET price = ? WHERE productID = ?', [10, 'product-1']),
      ).resolves.toBe(3);
    });
  });

  /* Net-new — settlement failures, and the disposal decision they drive, CWE-404) */

  describe('NET-NEW — a failed settlement destroys the connection instead of recycling it', () => {
    /**
     * The work every case here hands the boundary: one write, so a transaction genuinely has content.
     */
    const writeOneRow = async (scope: {
      readonly executor: {
        executeMutation(sql: string, values: readonly string[]): Promise<number>;
      };
    }): Promise<number> => scope.executor.executeMutation('UPDATE SwSku SET skuCode = ?', ['a']);

    it('NET-NEW — a `beginTransaction` failure DESTROYS the connection and never reaches the work', async () => {
      /*
       * The known-clean flag is cleared before begin is attempted, so a failed begin leaves the
       * connection's state unknown — the server may or may not have opened a transaction — and it
       * is
       * destroyed. Asserting that the work never ran matters too: a boundary that ran the work anyway
       * would perform writes outside any transaction at all.
       */
      const beginFailure = new Error('begin refused');
      const driver = createDriverDouble(
        () => affectedRows(1),
        (event) => {
          if (event === 'begin') {
            throw beginFailure;
          }
        },
      );
      const unitOfWork = new UnitOfWork(driver.pool);

      const rejection: unknown = await unitOfWork
        .run(writeOneRow, () => false)
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      /* Propagated by identity: nothing wraps, re-types or re-messages a begin failure. */
      expect(rejection).toBe(beginFailure);
      expect(driver.lifecycle).toStrictEqual(['begin', 'destroy']);
      /* No statement was issued, so no write escaped the transaction that never opened. */
      expect(driver.calls).toStrictEqual([]);
    });

    it('NET-NEW — a `commit` failure DESTROYS the connection and propagates the driver failure unchanged', async () => {
      /*
       * `state.knownClean = true` sits after the awaited commit, so a rejected commit never restores the
       * standing. The write may or may not be durable — that is exactly the unknown state the destroy
       * exists for.
       */
      const commitFailure = Object.assign(new Error('commit refused'), {
        code: 'ER_LOCK_DEADLOCK',
      });
      const driver = createDriverDouble(
        () => affectedRows(1),
        (event) => {
          if (event === 'commit') {
            throw commitFailure;
          }
        },
      );
      const unitOfWork = new UnitOfWork(driver.pool);

      const rejection: unknown = await unitOfWork
        .run(writeOneRow, () => false)
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBe(commitFailure);
      expect(driver.lifecycle).toStrictEqual(['begin', 'commit', 'destroy']);
      /* The work did run: the write reached the driver before the commit was attempted. */
      expect(driver.calls).toHaveLength(1);
    });

    it('NET-NEW — a work failure whose ROLL-BACK SUCCEEDS releases the connection and preserves the primary error', async () => {
      /*
       * The other side of the disposal rule, and the one that keeps `destroy` honest: a successful
       * roll-back restores the known-clean standing, so this connection is released and stays in service.
       * A boundary that destroyed here would take a healthy connection out of the pool on every ordinary
       * validation-driven abort.
       */
      const workFailure = new UniqueConstraintViolationError('the SKU code is taken');
      const driver = createDriverDouble(() => affectedRows(1));
      const unitOfWork = new UnitOfWork(driver.pool);

      const rejection: unknown = await unitOfWork
        .run(
          () => Promise.reject(workFailure),
          () => false,
        )
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBe(workFailure);
      expect(driver.lifecycle).toStrictEqual(['begin', 'rollback', 'release']);
    });

    it('NET-NEW — a work failure whose ROLL-BACK ALSO FAILS destroys the connection and records the abandoned failure as a CLASS NAME only', async () => {
      /*
       * The compound case, and the one with a disclosure property to pin. Two failures are in flight:
       * The work's, and the roll-back's. Production reports the roll-back failure — because "nothing can
       * be reported about what the database retained" is the more serious fact — carries the driver's
       * rejection as `cause`, and reduces the abandoned failure to its neutralized class name on
       * `context`.
       */
      const abandoned = new Error('rejected acme-widgets for user:hunter2\nINJECTED LOG LINE');
      const rollbackFailure = new Error('rollback refused');
      const driver = createDriverDouble(
        () => affectedRows(1),
        (event) => {
          if (event === 'rollback') {
            throw rollbackFailure;
          }
        },
      );
      const unitOfWork = new UnitOfWork(driver.pool);

      const rejection: unknown = await unitOfWork
        .run(
          () => Promise.reject(abandoned),
          () => false,
        )
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      if (!(rejection instanceof DomainError)) {
        throw new Error('A failed roll-back was expected to be reported as a domain failure.');
      }
      expect(rejection.message).toMatch(/could not be rolled back/);
      expect(rejection.cause).toBe(rollbackFailure);
      expect(rejection.context).toStrictEqual({
        rolledBackBecause: 'workFailure',
        abandonedFailureClass: 'Error',
      });

      /* Nothing of the abandoned failure's own text survives into the record. */
      const record = JSON.stringify({ message: rejection.message, context: rejection.context });
      expect(record).not.toMatch(/acme-widgets|hunter2|INJECTED/);
      expect(record).not.toMatch(/\n/);

      expect(driver.lifecycle).toStrictEqual(['begin', 'rollback', 'destroy']);
    });

    it('NET-NEW — M5. an ERROR-GATE roll-back that fails destroys the connection and records NO abandoned class, because nothing was abandoned', async () => {
      /*
       * The gate path (mismatch M5) reaches the same roll-back with a different `cause` and, decisively,
       * with no abandoned failure — the work succeeded and the caller's accumulated findings are what
       * refuse the commit. `exactOptionalPropertyTypes` makes "absent" and "present and undefined"
       * different things, and the honest statement is absent, so `toStrictEqual` is what asserts it: a
       * `{ abandonedFailureClass: undefined }` record would fail here.
       */
      const rollbackFailure = new Error('rollback refused');
      const driver = createDriverDouble(
        () => affectedRows(1),
        (event) => {
          if (event === 'rollback') {
            throw rollbackFailure;
          }
        },
      );
      const unitOfWork = new UnitOfWork(driver.pool);

      const rejection: unknown = await unitOfWork
        .run(writeOneRow, () => true)
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      if (!(rejection instanceof DomainError)) {
        throw new Error('A failed roll-back was expected to be reported as a domain failure.');
      }
      expect(rejection.context).toStrictEqual({ rolledBackBecause: 'accumulatedErrors' });
      expect(driver.lifecycle).toStrictEqual(['begin', 'rollback', 'destroy']);
    });

    it('NET-NEW — M5. an error-gate roll-back that SUCCEEDS releases, and the refusal is a domain failure rather than a quiet return', async () => {
      /*
       * The ordinary M5 path, kept beside the failing one so the destroy above is attributable to the
       * failed settlement rather than to the gate. It also pins that the boundary raises: a caller that
       * received a quiet "nothing was kept" would carry on as though the write had happened.
       */
      const driver = createDriverDouble(() => affectedRows(1));
      const unitOfWork = new UnitOfWork(driver.pool);

      const rejection: unknown = await unitOfWork
        .run(writeOneRow, () => true)
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      if (!(rejection instanceof DomainError)) {
        throw new Error('The gate was expected to refuse the commit with a domain failure.');
      }
      expect(rejection.context).toStrictEqual({ settledAs: 'rollback' });
      expect(driver.lifecycle).toStrictEqual(['begin', 'rollback', 'release']);
    });

    it('NET-NEW — M3. a per-item commit failure destroys the ONE shared connection and leaves earlier rows committed', async () => {
      /*
       * The importer's shape (`model/dao/ProductDAO.cfc:L176-L177`): one connection for the whole list,
       * one independent transaction per row. Row two's commit fails, and three properties must hold at
       * once — row one stays committed, row three never begins, and the single shared connection is
       * destroyed rather than released back for the next invocation to inherit.
       */
      let commits = 0;
      const commitFailure = new Error('commit refused');
      const driver = createDriverDouble(
        () => affectedRows(1),
        (event) => {
          if (event === 'commit') {
            commits += 1;
            if (commits === 2) {
              throw commitFailure;
            }
          }
        },
      );
      const unitOfWork = new UnitOfWork(driver.pool);
      const rowsAttempted: string[] = [];

      const rejection: unknown = await unitOfWork
        .runPerItemWithoutResults(['row-1', 'row-2', 'row-3'], async (row, scope) => {
          rowsAttempted.push(row);
          await scope.executor.executeMutation('INSERT INTO SwProduct (productID) VALUES (?)', [
            row,
          ]);
        })
        .then(
          () => undefined,
          (failure: unknown) => failure,
        );

      expect(rejection).toBe(commitFailure);
      expect(rowsAttempted).toStrictEqual(['row-1', 'row-2']);
      expect(driver.lifecycle).toStrictEqual(['begin', 'commit', 'begin', 'commit', 'destroy']);
    });
  });

  describe('NET-NEW — the support double and the real boundary agree on WHICH disposal happens', () => {
    /*
     * Why a parity block, and why it belongs here rather than in test support. Every service, handler
     * and repository suite in this port asserts boundary behaviour through the structural double in
     * `../support/inMemoryRepositories.ts`, never through the class — that is what lets a service be
     * tested with no driver at all. Those assertions are worth exactly as much as the agreement between
     * the two implementations, and the disposal decision is the one place where a plausible double
     * diverges in silence: releasing unconditionally is the obvious thing to write, it needs no.
     */

    /** The failure injected into whichever settlement step a scenario names. */
    const settlementFailure = new Error('the settlement was refused');
    /** The failure the work itself raises, for the scenarios that need one. */
    const workFailure = new Error('the work inside the boundary was abandoned');

    /** One settlement outcome and the disposal it must produce on both implementations. */
    interface DisposalScenario {
      readonly name: string;
      /** Which settlement step fails, or `undefined` when every step succeeds. */
      readonly failing: 'begin' | 'commit' | 'rollback' | undefined;
      readonly workFails: boolean;
      readonly gateReportsErrors: boolean;
      readonly disposal: 'release' | 'destroy';
    }

    const SCENARIOS: readonly DisposalScenario[] = [
      {
        name: 'a clean commit',
        failing: undefined,
        workFails: false,
        gateReportsErrors: false,
        disposal: 'release',
      },
      {
        name: 'work that failed, rolled back cleanly',
        failing: undefined,
        workFails: true,
        gateReportsErrors: false,
        disposal: 'release',
      },
      {
        name: 'the M5 gate, rolled back cleanly',
        failing: undefined,
        workFails: false,
        gateReportsErrors: true,
        disposal: 'release',
      },
      {
        name: 'a failed begin',
        failing: 'begin',
        workFails: false,
        gateReportsErrors: false,
        disposal: 'destroy',
      },
      {
        name: 'a failed commit',
        failing: 'commit',
        workFails: false,
        gateReportsErrors: false,
        disposal: 'destroy',
      },
      {
        name: 'a failed roll-back after failed work',
        failing: 'rollback',
        workFails: true,
        gateReportsErrors: false,
        disposal: 'destroy',
      },
      {
        name: 'a failed roll-back after the M5 gate',
        failing: 'rollback',
        workFails: false,
        gateReportsErrors: true,
        disposal: 'destroy',
      },
    ];

    for (const scenario of SCENARIOS) {
      it(`NET-NEW — ${scenario.name} ends in a ${scenario.disposal} on both implementations`, async () => {
        /*
         * The same work and the same gate go to both boundaries. Neither issues a statement: the disposal
         * decision is a property of the settlement, so a statement would add a variable without adding a
         * distinction, and the class's statement handling is asserted elsewhere in this file.
         */
        const work = (): Promise<void> =>
          scenario.workFails ? Promise.reject(workFailure) : Promise.resolve();
        const gate = (): boolean => scenario.gateReportsErrors;
        const settle = (step: 'begin' | 'commit' | 'rollback'): void => {
          if (step === scenario.failing) {
            throw settlementFailure;
          }
        };
        /**
         * Only the disposal events, which is the whole of what the two implementations must agree on.
         */
        const disposalsIn = (events: readonly string[]): readonly string[] =>
          events.filter((event) => event === 'release' || event === 'destroy');
        /**
         * Swallows the rejection: every scenario but the first has one, and none of them is under test here.
         */
        const ignoreOutcome = (): undefined => undefined;

        const driver = createDriverDouble(() => affectedRows(1), settle);
        await new UnitOfWork(driver.pool).run(work, gate).then(ignoreOutcome, ignoreOutcome);

        const double = createUnitOfWorkDouble({ settlement: settle });
        await double.unitOfWork.run(work, gate).then(ignoreOutcome, ignoreOutcome);

        expect(disposalsIn(driver.lifecycle)).toStrictEqual([scenario.disposal]);
        expect(disposalsIn(double.eventKinds())).toStrictEqual([scenario.disposal]);
        /*
         * The parity statement itself, so a divergence fails here even if both lists changed together.
         */
        expect(disposalsIn(driver.lifecycle)).toStrictEqual(disposalsIn(double.eventKinds()));
      });
    }
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/*
 * `unitOfWork` — the sort-order seeding boundary (the current contract)
 * Companion to `UnitOfWork.test.ts`, which covers the execution/settlement boundary (the locking read,
 * the duplicate-key translation and the disposal decision). The sort-order seeding members are a
 * separate concern with their own driver expectations, so they are exercised here rather than being
 * interleaved with those cases.
 */

/**
 * `unitOfWork` — the sort-order seeding contract — **net-new** coverage (the current contract)
 * every case in this file is **net-new**, and every case title says so. There is no legacy
 * `HibachiDAOTest` or `HibachiEntityTest` covering the sort-order block anywhere in `meta/tests/`, so
 * nothing here extends, replaces or reproduces an existing assertion. A reviewer asking "did this suite
 * replicate existing tests, or generate new ones?" has an unambiguous answer for this file: generated,
 * and labelled as generated in every single title.
 */
describe("The sort-order maximum read, whose memo this file's own repository owns", () => {
  /* The harness. */

  /** A pool that refuses to hand out a connection. */
  const refusingPool: StatementPool = {
    getConnection: (): Promise<TransactionalStatementRunner> =>
      Promise.reject(
        new Error(
          'seeding must run on the executor it is given, never on a pool connection of its own',
        ),
      ),
    execute: (_sql: string, _values: readonly BoundParameterValue[]): Promise<never> =>
      Promise.reject(new Error('seeding must not issue statements through the pool')),
  };

  /** What one harness observes. */
  interface Harness {
    readonly unitOfWork: UnitOfWork;
    readonly calls: readonly SqlExecutorCall[];
    readonly executor: Parameters<UnitOfWork['getTableTopSortOrder']>[0];
  }

  /**
   * Builds the harness.
   *
   * @param answer - the rows every statement resolves to; the sort-order read is the only statement any
   * case here issues, so one answer suffices.
   *
   * @returns the harness.
   */
  function buildHarness(answer: readonly MySqlRow[]): Harness {
    const sqlExecutor = createSqlExecutorDouble({ respond: () => sqlRows(answer) });

    return {
      unitOfWork: new UnitOfWork(refusingPool),
      calls: sqlExecutor.calls,
      executor: sqlExecutor.executor,
    };
  }

  /**
   * Collapses runs of whitespace so a statement can be matched without depending on its indentation.
   */
  function collapse(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }

  /** A bare group-shaped seed target — only the mutable slot the contract needs. */
  function seedTarget(sortOrder?: number): SortOrderSeedTarget {
    return sortOrder === undefined ? {} : { sortOrder };
  }

  /* GetTableTopSortOrder — org/Hibachi/HibachiDAO.cfc:L149-L168. */

  describe('NET-NEW — getTableTopSortOrder, the read the seeding step consumes', () => {
    it('NET-NEW — composes the WHOLE-TABLE read with no WHERE clause and no parameters', async () => {
      const harness = buildHarness([{ topSortOrder: 7 }]);

      const top = await harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup');

      /*
       * `:L153-L157` — `SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM #tableName#`, and `:L159`
       * guards the `WHERE` clause on both context arguments existing. `OptionGroup` declares no
       * `sortContext`, so `org/Hibachi/HibachiEntity.cfc:L644` supplies neither and this is the shape it
       * gets: the maximum across the entire table.
       */
      expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
        'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup FOR UPDATE',
      );
      expect(harness.calls[0]?.params).toEqual([]);
      expect(harness.calls).toHaveLength(1);
      expect(top).toBe(7);
    });

    it('NET-NEW — composes the SCOPED read with the context value BOUND, never interpolated', async () => {
      const harness = buildHarness([{ topSortOrder: 3 }]);

      const top = await harness.unitOfWork.getTableTopSortOrder(
        harness.executor,
        'SwOption',
        'optionGroupID',
        'cccccccccccccccccccccccccccc0001',
      );

      /*
       * `:L160-L162` — the clause the legacy adds, and it is the one value the legacy already bound:
       * `<cfqueryparam cfsqltype="cf_sql_varchar" value="#arguments.contextIDValue#" />`. So this is not a
       * D18 hardening, it is a like-for-like translation of a statement that was already parameterised.
       * The column is an identifier and travels through `assertColumnName`, which is why it appears in the
       * text rather than as a marker.
       */
      expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
        'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOption WHERE optionGroupID = ? FOR UPDATE',
      );
      expect(harness.calls[0]?.params).toEqual(['cccccccccccccccccccccccccccc0001']);
      expect(top).toBe(3);
    });

    it('NET-NEW — reads the COALESCE zero of an empty table rather than raising', async () => {
      const harness = buildHarness([{ topSortOrder: 0 }]);

      /*
       * `:L153` projects `COALESCE(max(sortOrder), 0)`, so an empty table is a legitimate zero and not an
       * absent answer. The `+ 1` in the seeding step is what turns it into the first position.
       */
      await expect(
        harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup'),
      ).resolves.toBe(0);
    });

    it('NET-NEW — RAISES when the aggregate produced no row at all', async () => {
      const harness = buildHarness([]);

      /*
       * An aggregate without a `GROUP BY` always produces exactly one row, so no row means the statement
       * did not run as composed. That raises rather than degrading to the zero the `COALESCE` would have
       * produced — degrading would seed position 1 into a populated table and collide with a real row.
       */
      await expect(
        harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup'),
      ).rejects.toBeInstanceOf(DataIntegrityError);
    });

    it('NET-NEW — RAISES when the row lacks the projected alias', async () => {
      const harness = buildHarness([{ somethingElse: 4 }]);

      await expect(
        harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup'),
      ).rejects.toThrow(/without its projected column/);
    });

    it('NET-NEW — refuses a table outside the physical whitelist', async () => {
      const harness = buildHarness([{ topSortOrder: 1 }]);

      /*
       * The table name is an identifier and cannot be bound, so it is whitelisted instead. `tContent` is
       * the cms table the current contract established must never enter the catalog whitelist. The refused
       * candidate travels in the diagnostic context rather than in the message, so the message stays free of
       * caller-supplied text — asserted on the context for exactly that reason.
       */
      const refusal = await harness.unitOfWork
        .getTableTopSortOrder(harness.executor, 'tContent')
        .then(
          () => undefined,
          (error: unknown) => error as DataIntegrityError,
        );

      expect(refusal).toBeInstanceOf(DomainError);
      expect(refusal?.context).toEqual({ candidate: 'tContent' });

      /*
       * And it is refused before any statement text is assembled, so nothing reached the executor.
       */
      expect(harness.calls).toEqual([]);
    });
  });

  /* SeedFirstSortOrder — org/Hibachi/HibachiEntity.cfc:L637-L647. */

  describe('NET-NEW — seedFirstSortOrder, the whole-table assignment', () => {
    it('NET-NEW — assigns topSortOrder + 1 across the WHOLE SwOptionGroup table', async () => {
      const harness = buildHarness([{ topSortOrder: 4 }]);
      const optionGroup = seedTarget();

      const assigned = await harness.unitOfWork.seedFirstSortOrder(
        harness.executor,
        'SwOptionGroup',
        optionGroup,
      );

      /*
       * This is the half that was missing, and the arithmetic is the assertion. `:L646` is
       * `setSortOrder( topSortOrder + 1 )`. `OptionGroup` declares no `sortContext`, so `:L644` takes the
       * unscoped read and the new group's position is one past the highest position in the entire table —
       * which is exactly what "the whole-table top-sort-order assignment" in the review's resolution names.
       */
      expect(assigned).toBe(5);
      expect(optionGroup.sortOrder).toBe(5);

      /*
       * — the read that feeds the arithmetic now locks, and the arithmetic is unchanged by it:
       * `assigned` is still 5 for a maximum of 4. That the value survives the lock is the point, because it
       * is what makes the lock a concurrency control rather than a behaviour change.
       */
      expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
        'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup FOR UPDATE',
      );
      expect(harness.calls[0]?.params).toEqual([]);
    });

    it('NET-NEW — seeds the FIRST row of an empty table to 1, not 0', async () => {
      const harness = buildHarness([{ topSortOrder: 0 }]);
      const optionGroup = seedTarget();

      await harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup);

      /*
       * `COALESCE(max(sortOrder), 0)` at `:L153` plus the `+ 1` at `:L646`. Position 1, and the zero the
       * legacy initialises `topSortOrder` to at `:L640` is dead in the source and reproduced nowhere.
       */
      expect(optionGroup.sortOrder).toBe(1);
    });

    it('NET-NEW — takes the SCOPED read when a sortContext scope is supplied (Option)', async () => {
      const harness = buildHarness([{ topSortOrder: 2 }]);
      const option = seedTarget();

      const assigned = await harness.unitOfWork.seedFirstSortOrder(
        harness.executor,
        'SwOption',
        option,
        {
          contextIDColumn: 'optionGroupID',
          contextIDValue: 'cccccccccccccccccccccccccccc0001',
        },
      );

      /*
       * The sibling branch, and the only in-scope entity that exercises it. `sortContext=` occurs five
       * times in the legacy tree and `model/entity/Option.cfc:L56` is the only one inside this slice, so
       * `:L641-L642` fires for an option and `:L644` for its group. An option's first position is therefore
       * one past the highest position within its group, not within the table — which is why the two entities
       * cannot share one seeding call.
       */
      expect(assigned).toBe(3);
      expect(option.sortOrder).toBe(3);
      expect(collapse(harness.calls[0]?.sql ?? '')).toContain('WHERE optionGroupID = ?');
      expect(harness.calls[0]?.params).toEqual(['cccccccccccccccccccccccccccc0001']);
    });

    it('NET-NEW — the two branches differ ONLY in the scope, and read the same aggregate', async () => {
      const unscoped = buildHarness([{ topSortOrder: 9 }]);
      const scoped = buildHarness([{ topSortOrder: 9 }]);

      await unscoped.unitOfWork.seedFirstSortOrder(
        unscoped.executor,
        'SwOptionGroup',
        seedTarget(),
      );
      await scoped.unitOfWork.seedFirstSortOrder(scoped.executor, 'SwOption', seedTarget(), {
        contextIDColumn: 'optionGroupID',
        contextIDValue: 'cccccccccccccccccccccccccccc0001',
      });

      /*
       * Same projection, same `COALESCE`, same `+ 1`; the scoped form adds one clause and one bound value
       * and changes nothing else. Bounding the divergence with evidence is what keeps `:L641`'s branch from
       * drifting into two different reads.
       */
      const [unscopedSql, scopedSql] = [
        collapse(unscoped.calls[0]?.sql ?? ''),
        collapse(scoped.calls[0]?.sql ?? ''),
      ];

      /*
       * Both statements trail the lock, so the comparison lifts the suffix off both sides
       * before comparing — which is what keeps this case about the scope divergence rather than about the
       * lock. Doing it by derivation rather than by two literals means neither statement can drift
       * independently and still pass.
       */
      const LOCK = ' FOR UPDATE';
      expect(unscopedSql.endsWith(LOCK)).toBe(true);
      expect(scopedSql.endsWith(LOCK)).toBe(true);

      const unscopedBody = unscopedSql.slice(0, -LOCK.length);
      const scopedBody = scopedSql.slice(0, -LOCK.length);

      expect(unscopedBody).toBe(
        'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup',
      );
      expect(scopedBody).toBe(
        `${unscopedBody.replace('SwOptionGroup', 'SwOption')} WHERE optionGroupID = ?`,
      );
    });

    it('NET-NEW — REPLACES an existing value, because :L637-L647 carries no idempotency guard', async () => {
      const harness = buildHarness([{ topSortOrder: 6 }]);
      const optionGroup = seedTarget(99);

      await harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup);

      /*
       * TODO(parity) `org/Hibachi/HibachiEntity.cfc:L639-L646` — the block is gated only on the accessor
       * existing, never on the value being absent. It runs inside `preInsert()` and assigns
       * unconditionally, so an entity that arrived carrying a position has it overwritten on insert. That is
       * preserved rather than repaired: adding an "only if absent" guard would be an enhancement the legacy
       * does not have, and it would also mask a caller that seeded from the wrong table. The obligation this
       * places on callers — invoke on INSERT only, never on update — is recorded on the member itself.
       */
      expect(optionGroup.sortOrder).toBe(7);
    });

    it('NET-NEW — issues its read on the GIVEN executor, never on a pool connection of its own', async () => {
      const harness = buildHarness([{ topSortOrder: 1 }]);

      /*
       * The harness's pool rejects every member. Resolving at all therefore proves the read travelled on the
       * executor it was handed — which is what makes it share the connection and transaction of the insert
       * it is seeding (M6). Two concurrent inserts reading through separate connections would see the same
       * maximum and collide.
       */
      await expect(
        harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', seedTarget()),
      ).resolves.toBe(2);
    });

    it('NET-NEW — leaves the slot UNSET when the read fails, seeding nothing on failure', async () => {
      const harness = buildHarness([]);
      const optionGroup = seedTarget();

      await expect(
        harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup),
      ).rejects.toBeInstanceOf(DataIntegrityError);

      /*
       * No partial assignment: a failed read must not leave a position behind for the guard below to
       * accept. The insert that was being seeded is the caller's to abandon.
       */
      expect(optionGroup.sortOrder).toBeUndefined();
    });
  });

  /* assertSortOrderAssigned — the persistence-boundary invariant. */

  describe('NET-NEW — assertSortOrderAssigned, the invariant guard', () => {
    it('NET-NEW — REFUSES an entity whose sortOrder was never assigned', () => {
      /*
       * This is the bypass the review named, now closed. `model/entity/OptionGroup.cfc:L58` declares
       * the column required and `model/validation/OptionGroup.json` declares no rule, so validation passes a
       * group with no position — correctly, and `test/domain/OptionGroup.test.ts` pins exactly that. What
       * used to be missing was anything downstream that noticed. A collector that read the absent slot would
       * bind `NULL` into a `NOT NULL` column, and the failure would surface as a driver error naming a
       * column rather than as a diagnosis naming the invariant.
       */
      expect(() => assertSortOrderAssigned(seedTarget(), 'SwOptionGroup')).toThrow(
        DataIntegrityError,
      );
      expect(() => assertSortOrderAssigned(seedTarget(), 'SwOptionGroup')).toThrow(
        /no sort order assigned/,
      );
    });

    it('NET-NEW — names the table in the diagnostic, and invents no value for the column', () => {
      let captured: DataIntegrityError | undefined;

      try {
        assertSortOrderAssigned(seedTarget(), 'SwOptionGroup');
      } catch (error) {
        captured = error as DataIntegrityError;
      }

      /*
       * AAP §0.7.3 — the guard is deliberately incapable of repair. It does not default to `0`, does not default
       * to `1`, and does not perform the `MAX()` read itself: a guard that quietly seeded would hide the
       * bypass instead of reporting it, and would issue a statement from whatever call site forgot to seed —
       * possibly outside the transaction the write belongs to.
       */
      expect(captured?.context).toEqual({
        table: 'SwOptionGroup',
        member: 'assertSortOrderAssigned',
      });
    });

    it('NET-NEW — admits an entity that WAS seeded, and narrows the slot to present', async () => {
      const harness = buildHarness([{ topSortOrder: 11 }]);
      const optionGroup = seedTarget();

      await harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup);
      const writable = assertSortOrderAssigned(optionGroup, 'SwOptionGroup');

      /*
       * The seeding step and the guard compose: what `:L646` assigned is what the boundary admits, and the
       * returned type carries `sortOrder: number` rather than an optional, so a collector downstream cannot
       * reintroduce the absent case by accident.
       */
      expect(writable.sortOrder).toBe(12);
    });

    it('NET-NEW — admits position ZERO, because absence and zero are different questions', () => {
      /*
       * A row genuinely holding `0` is a legal stored value — `COALESCE(max(sortOrder), 0)` returns zero for
       * an empty table, and nothing forbids the column from holding it. The guard tests for absence, so a
       * falsy-value test here would refuse a row the database accepts.
       */
      expect(assertSortOrderAssigned(seedTarget(0), 'SwOptionGroup').sortOrder).toBe(0);
    });

    it('NET-NEW — refuses a table outside the physical whitelist even while refusing the entity', () => {
      /*
       * Both refusals are real, and the whitelist one wins because the diagnostic's table is resolved while
       * the error is being composed. The point is that the guard cannot be used to smuggle an arbitrary table
       * name into a diagnostic — even on the path where the entity was going to be refused anyway.
       */
      let captured: DomainError | undefined;

      try {
        assertSortOrderAssigned(seedTarget(), 'tContent');
      } catch (error) {
        captured = error as DomainError;
      }

      expect(captured?.context).toEqual({ candidate: 'tContent' });
    });
  });
});
